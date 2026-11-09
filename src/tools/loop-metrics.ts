/**
 * Loop-Metrics Tools (N-5 D-6 — MCP parity for the optimization-loop surfaces)
 *
 * Three read-only tools over routes that legitimately serve API-key callers:
 *   - get_signal_readiness   → GET /api/signal-readiness
 *   - get_dashboard_headline → GET /api/dashboard/headline
 *   - get_report_snapshot    → GET /api/reports/exec/{share_token}
 *
 * Parity ruling (ledger R2-F1): parity = the SAME API routes the web views
 * call, held together by apps/web/tests/view-mcp-parity.test.ts (route-vs-tool
 * diff). No loader extraction.
 *
 * Envelope ruling (ledger L7/L8): responses are ENVELOPE-SHAPED — every
 * numeric leaf is wrapped as a MeasuredValue {value, ci_low, ci_high, method,
 * data_through}. CIs appear ONLY where the source payload carries one (never
 * fabricated); raw counts use method 'count'; every other method names the
 * source computation. Source basis/provenance strings ride along verbatim.
 *
 * Loop-OBJECT tools (Session B, N-arc Decision 3 ruling — read-only twins):
 * get_verdicts, get_trials, get_proposals, get_actuations, get_decision_queue
 * call the /loop-views/* READ-ONLY TWIN routes, which serve API-key callers by
 * construction (explicit field allowlists, no config payloads, no mutations).
 * The original session-only routes still 403 role==='api_key' (L2 stands): a
 * leaked telemetry key may enumerate loop-object SUMMARIES for its own org,
 * never evidence-pack contents and never any action.
 *
 * NOTE: no value-imports from @modelcontextprotocol/sdk here — apps/web's
 * parity test imports this module directly (relative path, nested-worktree
 * safe), so it must be loadable outside this package's build.
 */

import { z } from 'zod';
import type { MeasuredValue } from '../types.js';

/** Structural server type (registration surface only — SDK stays type-free here). */
export interface ToolRegistrar {
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
    }>
  ): unknown;
}

/** Structural client type — matches MetrxApiClient / the keyless clients' get(). */
export interface LoopMetricsApiClient {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<{ data?: T; error?: string }>;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const ENVELOPE_NOTE =
  'Response is envelope-shaped: every numeric leaf is a MeasuredValue ' +
  '{value, ci_low, ci_high, method, data_through}. ci fields are null unless the ' +
  'source payload carries a real confidence interval — never fabricated.';

/** Keys that are raw counts → method 'count' (L7: counts never dress up as estimates). */
const COUNT_KEY_RE =
  /(^|_)(count|counts|verdicts|decisions|agents|events|outcomes|pairs|tasks|rollbacks|actuations|days|sampled|scanned|total|with_task_id|review_outcomes|contributing_agents|clamped_agents|accepted_decisions|qualifying_decisions|pairs_in_window|min_pairs_required|human_verified|review_linked|heuristic|error_flagged|judge_metrics)($|_)/;

function mv(
  value: number | null,
  method: string,
  dataThrough: string | null,
  ci?: { low: number | null; high: number | null }
): MeasuredValue {
  return {
    value,
    ci_low: ci ? ci.low : null,
    ci_high: ci ? ci.high : null,
    method,
    data_through: dataThrough,
  };
}

/**
 * Pure envelope transform (L8-adjacent: transforms the FETCHED payload only,
 * never recomputes). Walks a JSON document and wraps every numeric leaf as a
 * MeasuredValue. Objects carrying a genuine CI pair (`ci_low_microcents` +
 * `ci_high_microcents`, or the verdict-shaped `savings_ci_low` +
 * `savings_ci_high`) get the CI folded INTO the sibling point-value envelope
 * (`value_microcents` / `savings_pct`, synthesized conservatively at
 * value=ci_low when the source has no point value of its own) — the only
 * places ci fields are ever non-null. Savings keys are number|null and
 * PostgREST always emits them, so the fold branch is the ALWAYS-path for
 * verdict rows: nulls pass through inside the envelope, never dropped.
 *
 * Exported for the parity test's route-vs-tool diff.
 */
export function envelopeNumbers(
  node: unknown,
  opts: {
    dataThrough: string | null;
    method: string;
    ciMethod?: string;
    /** Per-path honest-method override (wins over the count heuristic). */
    methodFor?: (key: string, path: readonly string[]) => string | undefined;
  },
  path: readonly string[] = []
): unknown {
  const methodOf = (key: string): string =>
    opts.methodFor?.(key, path) ?? (COUNT_KEY_RE.test(key) ? 'count' : opts.method);

  if (typeof node === 'number') return mv(node, opts.method, opts.dataThrough);
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node))
    return node.map((n, i) => envelopeNumbers(n, opts, [...path, String(i)]));

  const obj = node as Record<string, unknown>;
  const hasCi = 'ci_low_microcents' in obj && 'ci_high_microcents' in obj;
  const ciLow = hasCi ? (obj.ci_low_microcents as number | null) : null;
  const ciHigh = hasCi ? (obj.ci_high_microcents as number | null) : null;
  // Verdict-shaped CI pair (get_verdicts, kb_prior_lookup latest): same fold
  // semantics as the microcents pair, keyed to the savings_pct point value.
  const hasSavingsCi = 'savings_ci_low' in obj && 'savings_ci_high' in obj;
  const savingsLow = hasSavingsCi ? (obj.savings_ci_low as number | null) : null;
  const savingsHigh = hasSavingsCi ? (obj.savings_ci_high as number | null) : null;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (hasCi && (key === 'ci_low_microcents' || key === 'ci_high_microcents')) {
      // Folded into the value_microcents MeasuredValue below — never duplicated.
      continue;
    }
    if (hasCi && key === 'value_microcents') {
      out[key] = mv(value as number | null, opts.ciMethod ?? opts.method, opts.dataThrough, {
        low: ciLow,
        high: ciHigh,
      });
      continue;
    }
    if (hasSavingsCi && (key === 'savings_ci_low' || key === 'savings_ci_high')) {
      // Folded into the savings_pct MeasuredValue — never duplicated.
      continue;
    }
    if (hasSavingsCi && key === 'savings_pct') {
      out[key] = mv(value as number | null, opts.ciMethod ?? opts.method, opts.dataThrough, {
        low: savingsLow,
        high: savingsHigh,
      });
      continue;
    }
    if (typeof value === 'number') {
      out[key] = mv(value, methodOf(key), opts.dataThrough);
      continue;
    }
    out[key] = envelopeNumbers(value, opts, [...path, key]);
  }

  if (hasCi && !('value_microcents' in obj)) {
    // Source states only the interval (e.g. report page1.verified_savings):
    // the envelope's point value is the conservative CI low, and says so.
    out.value_microcents = mv(
      ciLow,
      `${opts.ciMethod ?? opts.method}_ci_low_conservative`,
      opts.dataThrough,
      {
        low: ciLow,
        high: ciHigh,
      }
    );
  }
  if (hasSavingsCi && !('savings_pct' in obj)) {
    // Interval-only savings (kb_prior_lookup latest carries no point value):
    // conservative CI-low synthesis, mirroring the microcents branch above.
    out.savings_pct = mv(
      savingsLow,
      `${opts.ciMethod ?? opts.method}_ci_low_conservative`,
      opts.dataThrough,
      {
        low: savingsLow,
        high: savingsHigh,
      }
    );
  }
  return out;
}

function jsonBlock(doc: unknown): string {
  return '```json\n' + JSON.stringify(doc, null, 2) + '\n```';
}

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

export function registerLoopMetricsTools(
  server: ToolRegistrar,
  client: LoopMetricsApiClient
): void {
  // ── get_signal_readiness ──
  server.registerTool(
    'get_signal_readiness',
    {
      title: 'Get Signal Readiness',
      description:
        'Org-scoped signal-readiness diagnostics: per-agent event coverage, label lag, ' +
        'join rate, volume-vs-power (days to trial-ready), estimator eligibility, and ' +
        'blocked_on_signal proposals cross-linked to the failing readiness dimension. ' +
        'This is the "what unlocks your first verified verdict" surface. Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    async () => {
      const result = await client.get<Record<string, unknown>>('/signal-readiness');
      if (result.error || !result.data) {
        return errorResult(
          `Error fetching signal readiness: ${result.error ?? 'empty response'}. ` +
            'next_step: verify the API key is valid and retry; the route serves API-key callers.'
        );
      }
      const payload = result.data;
      const dataThrough =
        typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString();
      const doc = {
        tool: 'get_signal_readiness',
        source: 'GET /api/signal-readiness',
        data_through: dataThrough,
        envelope_note: ENVELOPE_NOTE,
        data: envelopeNumbers(payload, {
          dataThrough,
          method: 'signal_readiness_bounded_aggregate',
        }),
      };
      return { content: [{ type: 'text' as const, text: jsonBlock(doc) }] };
    }
  );

  // ── get_dashboard_headline ──
  server.registerTool(
    'get_dashboard_headline',
    {
      title: 'Get Dashboard Headline',
      description:
        'The three-number headline regime: measured spend, estimated savings (the engine stored ' +
        'total, label Estimate; key attributed_savings) ' +
        'and verified savings-with-CI — each with basis, provenance, and tone. Values are ' +
        'micro-dollars (dollars = value / 1e6). Requires the optimization_model_v3 flag; ' +
        'while it is off this returns a clear next-step error. ' +
        ENVELOPE_NOTE,
      inputSchema: {
        days: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30)
          .describe('Window in days — one of 7, 30, 90 (default 30)'),
      },
      annotations: { ...READ_ONLY },
    },
    async ({ days }: { days?: number }) => {
      const result = await client.get<Record<string, unknown>>('/dashboard/headline', {
        days: days ?? 30,
      });
      if (result.error || !result.data) {
        const notFound = /not found/i.test(result.error ?? '');
        return errorResult(
          notFound
            ? 'optimization_model_v3 flag is off for this org — enable it or use get_dashboard. ' +
                '(GET /api/dashboard/headline returned 404, which is the flag-off signature.)'
            : `Error fetching dashboard headline: ${result.error ?? 'empty response'}`
        );
      }
      const payload = result.data;
      const dataThrough =
        typeof payload.generated_at === 'string' ? payload.generated_at : new Date().toISOString();
      const doc = {
        tool: 'get_dashboard_headline',
        source: 'GET /api/dashboard/headline',
        data_through: dataThrough,
        envelope_note: ENVELOPE_NOTE,
        data: envelopeNumbers(payload, {
          dataThrough,
          method: 'measured_spend_window_sum',
          ciMethod: 'rvnb_qualifying_gate_ci',
          methodFor: (key, path) => {
            // Honest per-number methods — a modeled rollup must never carry a
            // 'measured' method label (the basis/provenance strings agree).
            if (key === 'period_days') return 'window_config';
            if (path.includes('attributed_savings') && key === 'value_microcents') {
              // The engine's stored savings total (definition v2), labeled Estimate.
              return 'stored_savings_total_v2_estimate';
            }
            return undefined;
          },
        }),
      };
      return { content: [{ type: 'text' as const, text: jsonBlock(doc) }] };
    }
  );

  // ── get_report_snapshot ──
  server.registerTool(
    'get_report_snapshot',
    {
      title: 'Get Report Snapshot',
      description:
        'Fetch one frozen executive-report snapshot by its public share token (the token ' +
        'IS the capability). Returns the STORED snapshot only — never recomputed — plus ' +
        'its snapshot_hash and methodology_version integrity stamps. ' +
        ENVELOPE_NOTE,
      inputSchema: {
        share_token: z
          .string()
          .regex(/^[a-f0-9]{16,64}$/, 'share token is 16–64 lowercase hex characters')
          .describe('The report share token (16–64 lowercase hex chars)'),
      },
      annotations: { ...READ_ONLY, openWorldHint: false },
    },
    async ({ share_token }: { share_token: string }) => {
      if (!/^[a-f0-9]{16,64}$/.test(share_token)) {
        return errorResult(
          'Invalid share token: expected 16–64 lowercase hex characters. ' +
            'next_step: copy the token from the report share URL (/reports/exec/<token>).'
        );
      }
      const result = await client.get<Record<string, unknown>>(`/reports/exec/${share_token}`);
      if (result.error || !result.data) {
        const notFound = /not found/i.test(result.error ?? '');
        return errorResult(
          notFound
            ? 'Report not found: the token is wrong, the report was not generated, or the ' +
                'optimization_model_v3 flag is off. next_step: re-copy the share token or ' +
                'enable the flag and regenerate the report.'
            : `Error fetching report snapshot: ${result.error ?? 'empty response'}`
        );
      }
      const payload = result.data;
      const dataThrough =
        typeof payload.period_end === 'string'
          ? payload.period_end
          : typeof payload.created_at === 'string'
            ? payload.created_at
            : new Date().toISOString();
      const doc = {
        tool: 'get_report_snapshot',
        source: 'GET /api/reports/exec/{share_token}',
        data_through: dataThrough,
        envelope_note: ENVELOPE_NOTE,
        data: envelopeNumbers(payload, {
          dataThrough,
          method: 'stored_report_snapshot',
          ciMethod: 'holdout_verdict_ci',
        }),
      };
      return { content: [{ type: 'text' as const, text: jsonBlock(doc) }] };
    }
  );

  // ── Loop-object twins (Session B): five read-only tools over /loop-views/* ──
  // Shared handler factory; each registration stays an EXPLICIT call because
  // the drift guard derives the hosted tool count by counting registration
  // call sites in src/tools (a loop would under-count the registry).
  const twinHandler = (name: string, path: string, method: string) => async () => {
    const result = await client.get<Record<string, unknown>>(path);
    if (result.error || !result.data) {
      const notFound = /not found/i.test(result.error ?? '');
      return errorResult(
        notFound
          ? `optimization_model_v3 flag is off for this org — GET /api${path} returned 404 (the flag-off signature).`
          : `Error fetching ${name}: ${result.error ?? 'empty response'}. ` +
              'next_step: verify the API key is valid and retry; the /loop-views twin routes serve API-key callers.'
      );
    }
    const dataThrough = new Date().toISOString();
    const doc = {
      tool: name,
      source: `GET /api${path}`,
      data_through: dataThrough,
      envelope_note: ENVELOPE_NOTE,
      data: envelopeNumbers(result.data, { dataThrough, method }),
    };
    return { content: [{ type: 'text' as const, text: jsonBlock(doc) }] };
  };

  server.registerTool(
    'get_verdicts',
    {
      title: 'Get Causal Verdicts',
      description:
        'Org-scoped CURRENT causal-verdict summaries: per (agent, prod_model, candidate_model, ' +
        'task_category) — verdict, evidence mode/regime, pair counts, non-inferiority, savings ' +
        'CI, judge model, expiry. Observational (:value) rows are flagged. Summaries only: no ' +
        'gate flags, no evidence-pack contents (those stay dashboard-session-only). Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('get_verdicts', '/loop-views/verdicts', 'causal_verdict_summary')
  );

  server.registerTool(
    'get_trials',
    {
      title: 'Get Trial Plans',
      description:
        'Org-scoped pre-registered trial plans: regime, primary metric, margin, the frozen ' +
        'sample plan (pre-registration), models, status (registered/concluded/voided) and the ' +
        'concluding verdict id. Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('get_trials', '/loop-views/trials', 'trial_plan_record')
  );

  server.registerTool(
    'get_proposals',
    {
      title: 'Get Candidate Proposals',
      description:
        'Org-scoped CURRENT candidate proposals: action type/class, D-class, status with ' +
        'blocked_reason (blocked_on_signal proposals name the failing dimension), estimated ' +
        'impact, taxonomy axes. Config payloads (config_diff, guardrails, rollback mechanics) ' +
        'are deliberately excluded. Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('get_proposals', '/loop-views/proposals', 'candidate_proposal_summary')
  );

  server.registerTool(
    'get_actuations',
    {
      title: 'Get Policy Actuations',
      description:
        'Org-scoped actuation records: action class, authority, who/when, rollback state with ' +
        'reason, acknowledgement state. Config contents (from/to) are excluded. Requires the ' +
        'optimization_model_v3 flag (404 while off). Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('get_actuations', '/loop-views/actuations', 'policy_actuation_record')
  );

  server.registerTool(
    'get_decision_queue',
    {
      title: 'Get Decision Queue',
      description:
        'The operator decision queue, derived from real loop objects (approvable verdicts, ' +
        'blocked proposals, breaker events, expiring evidence). READ-ONLY: queue ACTIONS ' +
        '(approve/snooze/acknowledge) remain dashboard-session-only and are not exposed to ' +
        'API-key callers. Requires the optimization_model_v3 flag (404 while off). ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('get_decision_queue', '/loop-views/decision-queue', 'decision_queue_derivation')
  );

  server.registerTool(
    'kb_prior_lookup',
    {
      title: 'KB Prior Lookup (org-local)',
      description:
        'Per-cell (task_verb × domain) summary of THIS ORG’S OWN current causal verdicts — ' +
        'the knowledge-base read-side, v0. TENANCY: strictly org-local; this tool never reads ' +
        'other orgs’ data, so zeros mean YOUR org has no stamped verdicts in that cell yet ' +
        '(unstamped_verdicts counts evidence predating the taxonomy). Per cell: verdict counts ' +
        'by evidence mode (holdout_confirmed = causal tier), observational (:value) counts, and ' +
        'the latest verdict summary with its savings CI. Allocation labels are deliberately ' +
        'absent in v0 (no cost-weight substrate exists — nothing is fabricated). Read-only. ' +
        ENVELOPE_NOTE,
      inputSchema: {},
      annotations: { ...READ_ONLY },
    },
    twinHandler('kb_prior_lookup', '/loop-views/kb-priors', 'kb_prior_cell_summary')
  );
}
