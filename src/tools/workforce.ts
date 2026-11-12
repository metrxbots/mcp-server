/**
 * Workforce Tools — the manager's desk (plan §2, PR 1).
 *
 * Five tools over the api/v1 desk routes:
 *   - get_workforce_review  → GET  /v1/workforce-review        (public for org=demo;
 *                                                               org=me needs a read key)
 *   - get_scorecard         → GET  /v1/agents/{key}/scorecard  (read key)
 *   - draft_job_contract    → POST /v1/contracts/draft         (public: pure function)
 *   - check_vendor_bill     → POST /v1/vendor-bill/check       (public: pure function)
 *   - record_decision       → POST /v1/agents/{key}/decisions  (write key)
 *
 * The public three answer with no key on BOTH transports: the hosted endpoint
 * (an in-process keyless client) and `npx @metrxbot/mcp-server --demo`
 * (HttpKeylessClient over the same routes). Which tool needs a key is declared
 * in MCP_TOOL_AUTH (tool-registry-facts.ts), not inferred here.
 *
 * Responses are NOT envelope-shaped (that contract belongs to the loop-metrics
 * domain); they return the route's `data` document verbatim, so a manager
 * reading the chat sees the same numbers as the review page.
 *
 * NOTE: no value-imports from @modelcontextprotocol/sdk here — apps/web's
 * tests import this module directly (relative path, nested-worktree safe), so
 * it must be loadable outside this package's build. The input schemas mirror
 * the app's Zod schemas (lib/validations/agent-decisions.ts,
 * lib/contracts/draft-contract.ts, lib/vendor-bill/check-input.ts): the route
 * is the validator of record; these exist so an MCP client sees the shape.
 */

import { z } from 'zod';
import { deskErrorResult, type DeskProblem } from '../errors.js';
import { type McpCallerAuthMode, workforceDefaultOrg } from '../tool-registry-facts.js';

/** Structural server type (registration surface only — SDK stays type-free here). */
export interface WorkforceToolRegistrar {
  registerTool(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    },
    handler: (args: any) => Promise<{
      content: Array<{ type: 'text'; text: string }>;
      isError?: boolean;
      _meta?: Record<string, unknown>;
    }>
  ): unknown;
}

/**
 * What every client answers. `problem` is the desk error-table class behind
 * `error` when the route answered one; a tool turns it into the JSON-RPC
 * error the table specifies (via the transport, see liftDeskErrorsOn).
 */
export interface WorkforceApiResult<T> {
  data?: T;
  error?: string;
  status?: number;
  problem?: DeskProblem;
}

/** Structural client type — matches MetrxApiClient and both keyless clients. */
export interface WorkforceApiClient {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<WorkforceApiResult<T>>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<WorkforceApiResult<T>>;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** A pure function over the caller's own input: reads nothing, writes nothing. */
const PURE = { ...READ_ONLY, openWorldHint: false } as const;

/** Appends a row; retried with the same idempotency_key it returns the first row. */
const APPEND = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/**
 * record_decision appends like APPEND, but a `retire` archives the agent
 * (mig 156), which no tool call can undo: destructive, so a client asks first.
 */
const RECORD_DECISION = { ...APPEND, destructiveHint: true } as const;

// ── Paths (the v1 routes; the client prepends its /api base) ──
export const WORKFORCE_REVIEW_PATH = '/v1/workforce-review';
export const CONTRACT_DRAFT_PATH = '/v1/contracts/draft';
export const VENDOR_BILL_CHECK_PATH = '/v1/vendor-bill/check';
export const scorecardPath = (agentKey: string): string =>
  `/v1/agents/${encodeURIComponent(agentKey)}/scorecard`;
export const decisionsPath = (agentKey: string): string =>
  `/v1/agents/${encodeURIComponent(agentKey)}/decisions`;

// ── Input schemas (mirrors of the app's) ──

const AGENT_KEY = z.string().trim().min(1).max(200);
const ISO = z.string().datetime({ offset: true });

/**
 * The review's input schema for a caller. The default lives in the SCHEMA
 * (the SDK applies it before the handler runs), and the wording follows it: a
 * connector user has no API key, so telling the model to get one is false.
 */
export function workforceReviewInput(authMode: McpCallerAuthMode = 'key') {
  const signedIn = workforceDefaultOrg(authMode) === 'me';
  return {
    org: z
      .enum(['demo', 'me'])
      .default(workforceDefaultOrg(authMode))
      .describe(
        signedIn
          ? "'me' (default) reviews your own org as you, with your role; " +
              "'demo' reads the public Northwind sample review."
          : "'demo' (default) reads the public Northwind sample review and needs no key; " +
              "'me' reviews your own org and needs an API key with the 'read' scope."
      ),
    cursor: z
      .string()
      .max(256)
      .optional()
      .describe('Next page: the cursor the previous page returned.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Agents per page (default 25, max 100).'),
  };
}

/** The key/keyless schema (mirrors the app's route query). */
export const WorkforceReviewInput = workforceReviewInput('key');

export const ScorecardInput = {
  agent_key: AGENT_KEY.describe('The agent_key you registered (not the row id).'),
};

export const CONTRACT_TEMPLATES = [
  'support_triage',
  'sdr_qualification',
  'internal_assistant',
  'coding_patch',
] as const;

export const DraftJobContractInput = {
  template: z.enum(CONTRACT_TEMPLATES).describe('Which job template to start from.'),
  agent_key: AGENT_KEY.optional().describe(
    'The agent the contract will be published for (informational in the draft).'
  ),
  workload: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Defaults to agent_key, else the template key.'),
  owner: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .describe('The person accountable for this agent (name or email).'),
  objective: z.string().trim().min(1).max(2000).optional(),
  unit_of_work: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("What one unit is, e.g. 'resolved ticket'."),
  budget_usd: z.number().positive().max(10_000_000).optional(),
  budget_period: z.enum(['daily', 'weekly', 'monthly']).optional(),
  human_baseline: z
    .object({
      cost_per_unit_usd: z.number().min(0).max(1_000_000),
      minutes_per_unit: z.number().min(0).max(100_000).nullable().optional(),
      basis: z.string().trim().min(1).max(500).describe('Where the baseline number comes from.'),
    })
    .optional()
    .describe('What the same unit costs when a person does it; the ROI comparison needs it.'),
  notes: z.string().trim().max(2000).optional(),
};

const BILL_LINE = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    external_id: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("The vendor's id for the unit (ticket id)."),
    billed_at: ISO,
    cost_usd: z.number().min(-1_000_000).max(1_000_000),
    tier_name: z.string().trim().max(100).nullable().optional(),
    adjustment_of: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export const CheckVendorBillInput = {
  period: z.object({ from: ISO, to: ISO }).strict().describe('The billing period (from < to).'),
  billed: z.array(BILL_LINE).max(500).describe("The vendor's bill lines for the period."),
  resolved_ids: z
    .array(z.string().trim().min(1).max(200))
    .max(2000)
    .optional()
    .describe('External ids your records show as resolved by the agent.'),
  rejected_ids: z
    .array(z.string().trim().min(1).max(200))
    .max(2000)
    .optional()
    .describe('External ids your records show as rejected (a person overturned it).'),
  ledger: z
    .array(
      z
        .object({
          external_id: z.string().trim().min(1).max(200),
          event_type: z.enum(['solved', 'closed', 'reopened', 'public_comment']),
          occurred_at: ISO,
        })
        .strict()
    )
    .max(2000)
    .optional()
    .describe(
      'Every ledger event you hold for the vendor (reopens after the period still dispute).'
    ),
  import_rejected_count: z.number().int().min(0).max(1_000_000).optional(),
  covered_spans: z
    .array(z.object({ from: ISO, to: ISO.nullable() }).strict())
    .max(100)
    .optional()
    .describe('The spans your records cover; omitted = nothing is covered.'),
};

export const DECISION_KINDS = ['expand', 're_specify', 'combine', 'retire'] as const;

export const RecordDecisionInput = {
  agent_key: AGENT_KEY.describe('The agent the decision is about.'),
  decision: z.enum(DECISION_KINDS).describe('expand | re_specify | combine | retire.'),
  rationale: z
    .string()
    .trim()
    .max(4000)
    .describe('Why, in at least 20 characters; stored on the record and shown on the agent page.'),
  combined_into_agent_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("For 'combine' only: the agent (row id) this one folds into."),
  idempotency_key: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional()
    .describe(
      'Optional. Retrying with the same key returns the first record instead of a second one.'
    ),
};

// ── Output helpers ──

function jsonBlock(doc: unknown): string {
  return '```json\n' + JSON.stringify(doc, null, 2) + '\n```';
}

function errorResult(text: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
  _meta?: Record<string, unknown>;
} {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

function okResult(doc: unknown) {
  return { content: [{ type: 'text' as const, text: jsonBlock(doc) }] };
}

/**
 * The route already phrased the error for a person (the desk error table);
 * pass the text through, and when the route named a table class, carry it so
 * the transport answers the table's JSON-RPC error (plan §2: demo_unavailable
 * -32005 with retry_after_seconds, unknown_agent_key -32006 with suggestions).
 */
function routeError(
  tool: string,
  result: WorkforceApiResult<unknown>
): ReturnType<typeof errorResult> {
  const text = `${tool}: ${result.error ?? 'empty response'}`;
  return result.problem ? deskErrorResult(text, result.problem) : errorResult(text);
}

export function registerWorkforceTools(
  server: WorkforceToolRegistrar,
  client: WorkforceApiClient,
  options: { authMode?: McpCallerAuthMode } = {}
): void {
  const authMode = options.authMode ?? 'key';
  const defaultOrg = workforceDefaultOrg(authMode);
  const orgSentence =
    defaultOrg === 'me'
      ? 'org=me (default) reviews your own org as you, with your role; org=demo reads ' +
        'the public Northwind sample. '
      : 'org=demo reads the public Northwind sample and needs no key; org=me reads your ' +
        "own org and needs an API key with the 'read' scope. ";
  server.registerTool(
    'get_workforce_review',
    {
      title: 'Get Workforce Review',
      description:
        'The weekly workforce review: every AI agent in the org as a line manager would ' +
        'read it (job, cost this window, outcomes, scorecard state, the candidate decision ' +
        'and why). ' +
        orgSentence +
        'Paged by cursor. Numbers are the same the review page shows.',
      inputSchema: workforceReviewInput(authMode),
      annotations: { ...READ_ONLY },
    },
    async (args: { org?: 'demo' | 'me'; cursor?: string; limit?: number }) => {
      const params: Record<string, string | number> = { org: args?.org ?? defaultOrg };
      if (args?.cursor) params.cursor = args.cursor;
      if (args?.limit) params.limit = args.limit;
      const result = await client.get<unknown>(WORKFORCE_REVIEW_PATH, params);
      if (result.error || result.data === undefined) {
        return routeError('get_workforce_review', result);
      }
      return okResult(result.data);
    }
  );

  server.registerTool(
    'get_scorecard',
    {
      title: 'Get Agent Scorecard',
      description:
        "One agent's scorecard against its job contract: each acceptance criterion, the " +
        'measured value, pass/fail, and the window it covers. Addressed by agent_key. ' +
        'Windows longer than your plan keeps are reported as insufficient, never shortened.',
      inputSchema: ScorecardInput,
      annotations: { ...READ_ONLY },
    },
    async (args: { agent_key: string }) => {
      const result = await client.get<unknown>(scorecardPath(args.agent_key));
      if (result.error || result.data === undefined) {
        return routeError('get_scorecard', result);
      }
      return okResult(result.data);
    }
  );

  server.registerTool(
    'draft_job_contract',
    {
      title: 'Draft Job Contract',
      description:
        'Draft a job contract for an AI agent from a template (support_triage, ' +
        'sdr_qualification, internal_assistant, coding_patch): objective, unit of work, ' +
        'acceptance criteria, budget, and the human baseline for ROI. Returns the draft to ' +
        'publish plus validation errors and warnings. A pure function over your input: ' +
        'reads nothing, stores nothing, needs no key. Publishing the draft is a separate ' +
        "step (set_job_contract, 'admin' scope).",
      inputSchema: DraftJobContractInput,
      annotations: { ...PURE },
    },
    async (args: Record<string, unknown>) => {
      const result = await client.post<unknown>(CONTRACT_DRAFT_PATH, args ?? {});
      if (result.error || result.data === undefined) {
        return routeError('draft_job_contract', result);
      }
      return okResult(result.data);
    }
  );

  server.registerTool(
    'check_vendor_bill',
    {
      title: 'Check Vendor Bill',
      description:
        "Reconcile an AI vendor's per-resolution bill against your own records: which billed " +
        'units your ledger shows as resolved, rejected, reopened, outside coverage, or ' +
        'unknown, and the disputed amount. A pure function over the lines you pass: reads ' +
        'nothing, stores nothing, needs no key. Paste the bill lines and your ledger events.',
      inputSchema: CheckVendorBillInput,
      annotations: { ...PURE },
    },
    async (args: Record<string, unknown>) => {
      const result = await client.post<unknown>(VENDOR_BILL_CHECK_PATH, args ?? {});
      if (result.error || result.data === undefined) {
        return routeError('check_vendor_bill', result);
      }
      return okResult(result.data);
    }
  );

  server.registerTool(
    'record_decision',
    {
      title: 'Record Agent Decision',
      description:
        'Record a management decision about an agent (expand, re_specify, combine, retire) ' +
        'with a rationale. The record carries the governing contract version and the ' +
        'scorecard at decision time as evidence, and appears on the agent page. The same ' +
        'decision within 60 seconds is refused as a double submit; pass idempotency_key to ' +
        'make a retry return the first record. Use a new key for each new decision: a key ' +
        'reused with a different decision is refused. A retire also archives the agent in ' +
        'the same step (it leaves the review and the grading queue; there is no undo in the ' +
        'product) and needs an owner or admin: an API key with the admin scope.',
      inputSchema: RecordDecisionInput,
      annotations: { ...RECORD_DECISION },
    },
    async (args: {
      agent_key: string;
      decision: (typeof DECISION_KINDS)[number];
      rationale: string;
      combined_into_agent_id?: string | null;
      idempotency_key?: string;
    }) => {
      const { agent_key, ...body } = args;
      const result = await client.post<Record<string, unknown>>(
        decisionsPath(agent_key),
        body as Record<string, unknown>
      );
      if (result.error || result.data === undefined) {
        return routeError('record_decision', result);
      }
      // The route answers `{data, url, replayed}`; the clients unwrap `data`
      // and keep its siblings on the result. The url to the decision page sits
      // beside the record id (plan T5), and `replayed` says a retry returned
      // the first record rather than writing a second.
      const siblings = result as { url?: unknown; replayed?: unknown };
      return okResult({
        ...result.data,
        ...(typeof siblings.url === 'string' ? { url: siblings.url } : {}),
        ...(typeof siblings.replayed === 'boolean' ? { replayed: siblings.replayed } : {}),
      });
    }
  );
}
