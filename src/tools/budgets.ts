/**
 * Budget Governance Tools
 *
 * Tools for managing spending limits, enforcement modes,
 * and budget status monitoring.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { BudgetStatus, BudgetConfig } from '../types.js';
import { formatBudgetStatus, formatMicrocents } from '../services/formatters.js';
import { dollarsToMicrodollars } from '../services/units.js';

/** Where an org owner/admin changes budgets. */
export const BUDGETS_DASHBOARD_URL = 'https://app.metrxbot.com/settings/budgets';

/**
 * Budget WRITES need admin authority (round 9, D5). POST/PATCH /api/budgets and
 * /resume call requireAdmin. Since W1-4b that admits an API key carrying the
 * 'admin' scope (minted by an org owner/admin in Settings → Security → API
 * Keys) as well as an owner/admin session; any other key gets 403 with an
 * insufficient_scope body, which the client turns into a sentence naming the
 * required scope. On 403 the tools pass that sentence through and add where
 * else the change can be made.
 */
const BUDGET_WRITE_REQUIREMENT =
  "Changing a budget needs an API key with the 'admin' scope (an org owner or admin mints " +
  'one in Settings → Security → API Keys) or an owner/admin in the dashboard.';

/**
 * soft_block and hard_block are enforced ONLY at the Metrx gateway (the proxy):
 * the gateway reads budget state that the app syncs to it through Cloudflare.
 * Traffic reported by the SDK or OTel never passes the gateway, so no budget
 * mode can block it. While the app's Cloudflare settings for that sync are
 * unset, the server refuses soft_block / hard_block with
 * 409 ENFORCEMENT_UNAVAILABLE (PR #481) instead of storing a mode that blocks
 * nothing. Tool descriptions and errors say exactly that.
 */
export const GATEWAY_ONLY_ENFORCEMENT =
  '"soft_block" and "hard_block" act only on LLM calls routed through the Metrx gateway ' +
  '(proxy); calls reported by the SDK or OpenTelemetry are never blocked. They are ' +
  "unavailable while the gateway's Cloudflare settings for budget sync are unset: the " +
  'server then refuses them with 409 ENFORCEMENT_UNAVAILABLE and only "alert_only" works.';

export const ENFORCEMENT_UNAVAILABLE_NEXT_STEP =
  'soft_block and hard_block are unavailable here: they act only on traffic through the ' +
  "Metrx gateway, and the gateway's Cloudflare budget-sync settings are not configured on " +
  'this deployment. Nothing was changed. Use enforcement_mode "alert_only" (works now), ' +
  'or ask the Metrx operator to configure gateway enforcement.';

function budgetWriteError(action: string, result: { error?: string; status?: number }) {
  if (result.status === 409 && (result.error ?? '').includes('ENFORCEMENT_UNAVAILABLE')) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `${action} was refused (409 ENFORCEMENT_UNAVAILABLE): ${ENFORCEMENT_UNAVAILABLE_NEXT_STEP} Server said: ${result.error}`,
        },
      ],
      isError: true,
    };
  }
  const text =
    result.status === 403
      ? `${action} was refused (403): ${result.error ?? 'forbidden'} ${BUDGET_WRITE_REQUIREMENT} ` +
        `Dashboard: ${BUDGETS_DASHBOARD_URL}.`
      : `Error ${action.toLowerCase()}: ${result.error}`;
  return { content: [{ type: 'text' as const, text }], isError: true };
}

export function registerBudgetTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_budget_status ──
  server.registerTool(
    'get_budget_status',
    {
      title: 'Get Budget Status',
      description:
        'Get the current status of all budget configurations. ' +
        'Shows spending vs limits, warning/exceeded counts, and enforcement modes. ' +
        'Use this to monitor spending governance across your agent fleet. ' +
        'Read-only. Budget changes (set_budget, update_budget_mode) need an API key with the ' +
        "'admin' scope.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await client.get<BudgetStatus>('/budgets/status');

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching budget status: ${result.error}` }],
          isError: true,
        };
      }

      const text = formatBudgetStatus(result.data!);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  // ── set_budget ──
  server.registerTool(
    'set_budget',
    {
      title: 'Set Budget',
      description:
        'Create or update a budget configuration for an agent or the entire organization. ' +
        'Enforcement modes: "alert_only" (notify, never block), "soft_block" (block with ' +
        'override) and "hard_block" (block). ' +
        GATEWAY_ONLY_ENFORCEMENT +
        ' Specify limits in dollars. ' +
        "Needs an API key with the 'admin' scope (an org owner or admin mints one in Settings → " +
        `Security → API Keys); any other key is refused with 403 — then make the change at ${BUDGETS_DASHBOARD_URL}. ` +
        'Do NOT use just to change enforcement mode — use update_budget_mode for that.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Agent to set budget for. Omit for org-wide budget.'),
        period: z.enum(['daily', 'monthly']).describe('Budget period'),
        limit_dollars: z
          .number()
          .positive()
          .describe('Spending limit in dollars (e.g., 100 for $100/month)'),
        warning_pct: z
          .number()
          .int()
          .min(1)
          .max(99)
          .default(80)
          .describe('Percentage of limit that triggers a warning (default: 80)'),
        enforcement_mode: z
          .enum(['alert_only', 'soft_block', 'hard_block'])
          .default('alert_only')
          .describe(
            'How to enforce the budget when exceeded. soft_block/hard_block: gateway traffic only; 409 ENFORCEMENT_UNAVAILABLE while gateway enforcement is not configured'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, period, limit_dollars, warning_pct, enforcement_mode }) => {
      // limit_microcents holds MICRO-DOLLARS (services/units.ts) — 100x too large until round 8.
      const limit_microcents = dollarsToMicrodollars(limit_dollars);

      const body: Record<string, unknown> = {
        period,
        limit_microcents,
        warning_pct: warning_pct ?? 80,
        enforcement_mode: enforcement_mode ?? 'alert_only',
      };
      if (agent_id) body.agent_id = agent_id;

      const result = await client.post<BudgetConfig>('/budgets', body);

      if (result.error) return budgetWriteError('Setting budget', result);

      const b = result.data!;
      const scope = b.agent_id ? `agent ${b.agent_id}` : 'organization';

      return {
        content: [
          {
            type: 'text',
            text: `✅ Budget set for ${scope}: ${formatMicrocents(b.limit_microcents)}/${
              b.period
            } with ${b.enforcement_mode} enforcement. Warning at ${b.warning_pct}%.`,
          },
        ],
      };
    }
  );

  // ── update_budget_mode ──
  server.registerTool(
    'update_budget_mode',
    {
      title: 'Update Budget Mode',
      description:
        'Change the enforcement mode of an existing budget, pause it, or ask to resume it. ' +
        'Use "alert_only" for monitoring, "soft_block" for overridable limits, ' +
        'or "hard_block" to block. ' +
        GATEWAY_ONLY_ENFORCEMENT +
        ' ' +
        "Needs an API key with the 'admin' scope (an org owner or admin mints one in Settings → " +
        `Security → API Keys); any other key is refused with 403 — then make the change at ${BUDGETS_DASHBOARD_URL}. ` +
        'Do NOT use to create new budgets — use set_budget for that.',
      inputSchema: {
        budget_id: z.string().uuid().describe('The budget configuration ID to update'),
        enforcement_mode: z
          .enum(['alert_only', 'soft_block', 'hard_block'])
          .optional()
          .describe(
            'New enforcement mode. soft_block/hard_block: gateway traffic only; 409 ENFORCEMENT_UNAVAILABLE while gateway enforcement is not configured'
          ),
        paused: z
          .boolean()
          .optional()
          .describe(
            'true pauses the budget; false resumes it (refused while a hard_block budget is still at its limit for the period — raise the limit first)'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ budget_id, enforcement_mode, paused }) => {
      if (enforcement_mode === undefined && paused === undefined) {
        return {
          content: [
            { type: 'text', text: 'No changes specified. Provide enforcement_mode or paused.' },
          ],
          isError: true,
        };
      }

      // PATCH /budgets/{id} accepts `paused: true` only. Resuming goes through
      // POST /budgets/{id}/resume, which refuses (409) a hard_block still over its
      // limit — until round 8 this tool sent `paused:false` to PATCH, where it was
      // dropped, and still reported "status → active".
      const patchBody: Record<string, unknown> = {};
      if (enforcement_mode !== undefined) patchBody.enforcement_mode = enforcement_mode;
      if (paused === true) patchBody.paused = true;

      const parts: string[] = ['✅ Budget updated:'];
      if (Object.keys(patchBody).length > 0) {
        const result = await client.patch<BudgetConfig>(`/budgets/${budget_id}`, patchBody);
        if (result.error) return budgetWriteError('Updating budget', result);
        if (enforcement_mode) parts.push(`enforcement → ${enforcement_mode}`);
        if (paused === true) parts.push('status → paused');
      }

      if (paused === false) {
        const resumed = await client.post<BudgetConfig>(`/budgets/${budget_id}/resume`, {});
        if (
          resumed.error &&
          (resumed.status === 403 || resumed.error.includes('ENFORCEMENT_UNAVAILABLE'))
        ) {
          return budgetWriteError('Resuming budget', resumed);
        }
        if (resumed.error) {
          const done = parts.length > 1 ? ` (${parts.slice(1).join(', ')} was applied)` : '';
          return {
            content: [{ type: 'text', text: `Error resuming budget${done}: ${resumed.error}` }],
            isError: true,
          };
        }
        parts.push('status → active');
      }

      return {
        content: [{ type: 'text', text: parts.join(', ') }],
      };
    }
  );
}
