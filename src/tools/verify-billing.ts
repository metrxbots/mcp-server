/**
 * Verify Billing Tools (PR-2, master plan §15.2)
 *
 * The transacting surface of the MCP funnel:
 *   - get_balance       — verifications remaining (never "credits")
 *   - buy_verification  — UCP checkout URL + claim instructions
 *   - verify_switch     — spends one unit, returns an ASYNC handle (never blocks)
 *
 * Tool descriptions state the cost so agents can plan spend — an agent
 * surprised by a charge is a churned integrator. The cost line comes from
 * GET /api/pricing (ADR-1: config is the SSOT — NEVER hardcoded here); if the
 * fetch fails the description points at the endpoint instead of stating a
 * possibly-stale number.
 *
 * REGISTRATION IS SYNCHRONOUS. All three tools exist the moment this function
 * returns, described with the endpoint-deferring cost line. The live price is
 * fetched afterwards and folded in via RegisteredTool.update(), which makes the
 * SDK emit tools/list_changed.
 *
 * It used to be the other way round — the whole registration awaited the
 * pricing fetch and the factory fire-and-forgot it. That made the server's tool
 * count non-deterministic (26 synchronously, 29 eventually) and, when /api/pricing
 * was down, the .catch() swallowed the failure and these three tools never
 * registered at all. A published count of 29 was therefore only conditionally
 * true. Presence must never depend on a network call; only enrichment may.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClientLike } from '../server-factory.js';

interface MachinePricing {
  offers?: {
    verify?: {
      standard_cents?: number;
      founding_cents?: number;
      refund_policy?: string;
    };
  };
}

interface BalanceResponse {
  balance: number;
  unit_noun: string;
}

interface UcpCheckoutResponse {
  checkout_url: string;
  session_id: string;
  expires_at: string;
  amount_cents?: number;
  founding_priced?: boolean;
  status_url?: string;
  claim_token?: string;
  claim_instructions?: string;
}

interface VerifyRequestResponse {
  request?: { id: string; state: string; pairs_target?: number };
  balance?: number;
  error?: string;
  message?: string;
  buy_url?: string;
}

const centsToDollars = (cents: number): string => `$${Math.round(cents / 100)}`;

/**
 * The cost line used at registration time and whenever live pricing is
 * unavailable. States no number — it points at the endpoint instead, so a
 * description can never carry a stale price.
 */
export const VERIFY_COST_DEFERRED_LINE =
  'This action consumes one verification — fetch the current price from GET /api/pricing ' +
  'before spending. No verdict, no charge.';

/**
 * Build the cost line from live pricing. Exported for tests.
 * Never hardcodes a price: on fetch failure the line defers to the endpoint.
 */
export async function fetchVerifyCostLine(client: ApiClientLike): Promise<string> {
  try {
    const result = await client.get<MachinePricing>('/pricing');
    const verify = result.data?.offers?.verify;
    if (
      !result.error &&
      typeof verify?.standard_cents === 'number' &&
      typeof verify?.founding_cents === 'number'
    ) {
      return (
        `This action consumes one verification — ${centsToDollars(verify.standard_cents)}, ` +
        `or ${centsToDollars(verify.founding_cents)} founding rate. No verdict, no charge.`
      );
    }
  } catch {
    // fall through to the endpoint-deferring line
  }
  return VERIFY_COST_DEFERRED_LINE;
}

/**
 * Descriptions are built from the cost line so the same text can be rebuilt
 * once live pricing resolves. Keep these pure — they are called twice per tool.
 */
const buildBuyDescription = (costLine: string): string =>
  `Purchase one verification (a causal verdict on whether a model switch holds quality ` +
  `on YOUR production traffic). ${costLine} ` +
  'Returns a Stripe checkout URL for a human (or payment-capable agent) to complete, ' +
  'plus claim instructions when the purchase is anonymous. This tool does NOT charge ' +
  'anything itself — payment happens on the returned URL.';

const buildSwitchDescription = (costLine: string): string =>
  `Start a purchased verification: would candidate_model hold quality vs prod_model on ` +
  `your production traffic? ${costLine} ` +
  'ASYNC: returns a request handle immediately and NEVER blocks — verdicts complete after ' +
  'days of your own traffic (armed → collecting → complete). Poll the returned handle with ' +
  'GET /api/verify/requests/{id}. If the balance is 0 this returns purchase guidance instead ' +
  'of spending.';

/** Minimal shape of the SDK's RegisteredTool that we depend on. */
interface UpdatableTool {
  update?: (updates: { description?: string }) => void;
}

/**
 * Register the three transacting tools.
 *
 * Registration itself is SYNCHRONOUS — all three tools exist before this
 * returns, so the server's tool count never depends on the network. The
 * returned promise resolves once the live cost line has been folded into the
 * two spending tools' descriptions; callers may await it (tests) or ignore it
 * (the factory). Rejection is impossible: a failed pricing fetch simply leaves
 * the endpoint-deferring copy in place.
 */
export function registerVerifyBillingTools(
  server: McpServer,
  client: ApiClientLike
): Promise<void> {
  const costLine = VERIFY_COST_DEFERRED_LINE;

  // ── get_balance ──
  server.registerTool(
    'get_balance',
    {
      title: 'Get Verification Balance',
      description:
        'Check how many verifications your organization has remaining. ' +
        'Free to call. Use before verify_switch to know whether a purchase is needed first.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await client.get<BalanceResponse>('/billing/balance');
      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching balance: ${result.error}` }],
          isError: true,
        };
      }
      const { balance, unit_noun } = result.data!;
      return {
        content: [
          {
            type: 'text',
            text: `${unit_noun} remaining: ${balance}${balance === 0 ? ' — use buy_verification to purchase one.' : ''}`,
          },
        ],
      };
    }
  );

  // ── buy_verification ──
  const buyTool = server.registerTool(
    'buy_verification',
    {
      title: 'Buy a Verification',
      description: buildBuyDescription(costLine),
      inputSchema: {
        callback_url: z
          .string()
          .url()
          .optional()
          .describe('Optional post-checkout redirect base URL'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args: { callback_url?: string }) => {
      const result = await client.post<UcpCheckoutResponse>('/ucp/checkout', {
        product_id: 'metrx-verify',
        ...(args.callback_url ? { callback_url: args.callback_url } : {}),
      });
      if (result.error || !result.data) {
        return {
          content: [
            { type: 'text', text: `Error creating checkout: ${result.error ?? 'no response'}` },
          ],
          isError: true,
        };
      }
      const d = result.data;
      const lines = [
        `Checkout ready${typeof d.amount_cents === 'number' ? ` — ${centsToDollars(d.amount_cents)}${d.founding_priced ? ' (founding rate)' : ''}` : ''}.`,
        `Pay here: ${d.checkout_url}`,
        `Session: ${d.session_id} (expires ${d.expires_at})`,
        d.status_url ? `Poll payment status: GET ${d.status_url}` : null,
        d.claim_token
          ? `claim_token: ${d.claim_token}\n${d.claim_instructions ?? ''}`
          : 'The verification lands on your organization automatically after payment.',
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ── verify_switch ──
  const switchTool = server.registerTool(
    'verify_switch',
    {
      title: 'Verify a Model Switch',
      description: buildSwitchDescription(costLine),
      inputSchema: {
        prod_model: z.string().min(1).describe('Current production model (e.g. "gpt-5.2")'),
        candidate_model: z.string().min(1).describe('Candidate model to verify against it'),
        agent_id: z.string().uuid().optional().describe('Agent to scope the verification to'),
        policy_id: z.string().uuid().optional().describe('Routing policy to attach to'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args: {
      prod_model: string;
      candidate_model: string;
      agent_id?: string;
      policy_id?: string;
    }) => {
      const result = await client.post<VerifyRequestResponse>('/verify/requests', {
        prod_model: args.prod_model,
        candidate_model: args.candidate_model,
        ...(args.agent_id ? { agent_id: args.agent_id } : {}),
        ...(args.policy_id ? { policy_id: args.policy_id } : {}),
      });

      if (result.error || !result.data?.request) {
        const d = result.data;
        if (d?.error === 'insufficient_balance') {
          return {
            content: [
              {
                type: 'text',
                text:
                  `You have 0 verifications remaining — nothing was spent. ` +
                  `Buy one with the buy_verification tool${d.buy_url ? ` or at ${d.buy_url}` : ''}, then retry.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Error starting verification: ${result.error ?? d?.message ?? 'unknown'}`,
            },
          ],
          isError: true,
        };
      }

      const req = result.data.request;
      return {
        content: [
          {
            type: 'text',
            text: [
              `Verification armed (one verification consumed — returned automatically if no verdict).`,
              `Handle: ${req.id}`,
              `State: ${req.state} — verdicts complete after enough of your traffic accrues (~${req.pairs_target ?? 30} pairs).`,
              `Poll: GET /api/verify/requests/${req.id} (do not block on it — check back periodically).`,
              typeof result.data.balance === 'number'
                ? `Verifications remaining: ${result.data.balance}`
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    }
  );

  // All three tools are registered by this point. Everything below only
  // enriches copy — it can never remove a tool or fail the registration.
  return enrichCostDescriptions(client, buyTool, switchTool);
}

/**
 * Fold the live price into the two spending tools' descriptions.
 * Best-effort by construction: any failure leaves the endpoint-deferring copy,
 * which is accurate, just less specific. Never rejects.
 */
async function enrichCostDescriptions(
  client: ApiClientLike,
  buyTool: unknown,
  switchTool: unknown
): Promise<void> {
  let costLine: string;
  try {
    costLine = await fetchVerifyCostLine(client);
  } catch {
    return;
  }
  // Nothing to say that the registered description doesn't already say.
  if (costLine === VERIFY_COST_DEFERRED_LINE) return;

  const apply = (tool: unknown, description: string): void => {
    const updatable = tool as UpdatableTool | undefined;
    if (typeof updatable?.update !== 'function') return;
    try {
      updatable.update({ description });
    } catch {
      // A description that failed to refresh is not worth failing startup over.
    }
  };

  apply(buyTool, buildBuyDescription(costLine));
  apply(switchTool, buildSwitchDescription(costLine));
}
