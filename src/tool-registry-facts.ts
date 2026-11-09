/**
 * Tool-registry facts — the SINGLE SOURCE OF TRUTH for "how many tools does the
 * Metrx MCP server expose, and what are they called".
 *
 * WHY THIS FILE EXISTS
 * Before it, the count lived as a hand-typed number in nine different places and
 * they disagreed: agent-card.json said 23, llms.txt said 23, llms-full.txt and
 * server.json and smithery.yaml said 24, server-factory's own header comment said
 * 26, and the actual registry held 29. Agents parse agent-card.json to build their
 * call surface, so a wrong count there is not a typo — it is six shipped tools that
 * no agent knows how to call.
 *
 * THE RULE
 * Nothing may state a tool count from memory. TypeScript consumers import from
 * here. Non-importable surfaces (JSON, YAML, Markdown) are held to this file by
 * `apps/web/tests/mcp-tool-count-drift.test.ts`, which re-derives the truth by
 * counting `registerTool(` calls in src/tools and fails if this file, or any
 * listing surface, disagrees. Adding a tool without updating this file is a red CI.
 *
 * Counts here are DECLARED, not computed: the package ships compiled to dist/ and
 * cannot read its own source at runtime. The guard is what makes the declaration
 * trustworthy.
 */

/** Every tool a domain module registers, keyed by module basename in src/tools. */
export const MCP_TOOLS_BY_DOMAIN = {
  // W1-4b removed alert-config (configure_alert_threshold) and, from optimization,
  // apply_optimization / route_model / compare_models: each called a route that has
  // never existed and no other route does the job. The npm package carried them
  // through 0.2.7; from 0.5.0 npm is published FROM this source (publish-mirror.ts),
  // so the two transports expose the same registry.
  alerts: ['get_alerts', 'acknowledge_alert', 'get_failure_predictions'],
  attribution: ['attribute_task', 'get_task_roi', 'get_attribution_report'],
  budgets: ['get_budget_status', 'set_budget', 'update_budget_mode'],
  // W-C01: per-agent job contract (append-only versions on acceptance_contracts).
  // set_job_contract returned in W1-4b: the write calls requireAdmin, which now
  // admits an API key carrying the 'admin' scope.
  contracts: ['get_job_contract', 'set_job_contract'],
  'cost-leak-detector': ['run_cost_leak_scan'],
  dashboard: ['get_cost_summary', 'list_agents', 'get_agent_detail'],
  experiments: ['create_model_experiment', 'get_experiment_results', 'stop_experiment'],
  'health-rankings': ['get_health_scores', 'get_rankings'],
  // N-5 D-6 (ledger R2-F1): parity tools over the loop-metrics API routes.
  // Session B (Decision 3 ruling): the five loop-OBJECT tools read the
  // /loop-views/* READ-ONLY TWIN routes (field-allowlisted, no mutations) —
  // the original session-only routes still 403 role==='api_key' (L2 stands).
  'loop-metrics': [
    'get_signal_readiness',
    'get_dashboard_headline',
    'get_report_snapshot',
    'get_verdicts',
    'get_trials',
    'get_proposals',
    'get_actuations',
    'get_decision_queue',
    // Session C (§11.4 M-B): KB read-side v0 — org-local tenancy by ruling.
    'kb_prior_lookup',
  ],
  optimization: ['get_optimization_recommendations'],
  'roi-audit': ['generate_roi_audit'],
  'upgrade-business-case': ['get_upgrade_business_case'],
  'upgrade-justification': ['get_upgrade_justification'],
  'verify-billing': ['get_balance', 'buy_verification', 'verify_switch'],
  // Manager's desk (plan §2, PR 1): the workforce review, the scorecard by
  // agent_key, two pure drafting/checking tools, and the decision record.
  workforce: [
    'get_workforce_review',
    'get_scorecard',
    'draft_job_contract',
    'check_vendor_bill',
    'record_decision',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * The prefix the server factory applies to every tool at registration time.
 * Public/agent-visible names carry it; the module sources do not.
 */
export const MCP_TOOL_PREFIX = 'metrx_';

/** Unprefixed tool names, in domain order. */
export const MCP_TOOL_NAMES: readonly string[] = Object.values(MCP_TOOLS_BY_DOMAIN).flat();

/** Agent-visible tool names (what appears in tools/list). */
export const MCP_PUBLIC_TOOL_NAMES: readonly string[] = MCP_TOOL_NAMES.map(
  (name) => `${MCP_TOOL_PREFIX}${name}`
);

/** Domain module names. */
export const MCP_DOMAINS: readonly string[] = Object.keys(MCP_TOOLS_BY_DOMAIN);

/** The authoritative tool count. Cite this, never a literal. */
export const MCP_TOOL_COUNT: number = MCP_TOOL_NAMES.length;

/** The authoritative domain count. */
export const MCP_DOMAIN_COUNT: number = MCP_DOMAINS.length;

/** API-key scopes (apps/web/lib/api/scope-enforcement.ts). */
export type McpToolScope = 'read' | 'write' | 'admin';

/**
 * The API-key scope each tool needs, keyed by UNPREFIXED tool name — W1-4b.
 *
 * The rule the app enforces: GET/HEAD/OPTIONS need 'read', every other method
 * needs 'write', and a route that calls requireAdmin() admits an API key only
 * with 'admin'. A tool's scope is therefore the strongest requirement among
 * the endpoints it calls. The server factory appends this to every tool's
 * description and exposes it as `_meta['metrx/required_scope']`, and refuses
 * to register a tool that is missing here, so a new tool cannot ship without
 * declaring what key it needs.
 *
 * Held to the routes by apps/web/tests/truth/mcp-tools-work.test.ts, which
 * invokes every registered tool, resolves each HTTP call to its route file, and
 * requires 'admin' exactly when that route's handler calls requireAdmin(.
 *
 * Notes: get_report_snapshot reads a capability-token route (the share token
 * is the credential), still declared 'read'. buy_verification POSTs
 * /ucp/checkout → 'write'. update_budget_mode may PATCH /budgets/{id} and/or
 * POST /budgets/{id}/resume — both admin.
 */
export const MCP_TOOL_SCOPES: Record<string, McpToolScope> = {
  // alerts
  get_alerts: 'read',
  acknowledge_alert: 'write',
  get_failure_predictions: 'read',
  // attribution
  attribute_task: 'write',
  get_task_roi: 'read',
  get_attribution_report: 'read',
  // budgets
  get_budget_status: 'read',
  set_budget: 'admin',
  update_budget_mode: 'admin',
  // contracts
  get_job_contract: 'read',
  set_job_contract: 'admin',
  // cost-leak-detector
  run_cost_leak_scan: 'read',
  // dashboard
  get_cost_summary: 'read',
  list_agents: 'read',
  get_agent_detail: 'read',
  // experiments
  create_model_experiment: 'admin',
  get_experiment_results: 'read',
  stop_experiment: 'admin', // PATCH requires owner/admin, like create (2026-10-08)
  // health-rankings
  get_health_scores: 'read',
  get_rankings: 'read',
  // loop-metrics
  get_signal_readiness: 'read',
  get_dashboard_headline: 'read',
  get_report_snapshot: 'read',
  get_verdicts: 'read',
  get_trials: 'read',
  get_proposals: 'read',
  get_actuations: 'read',
  get_decision_queue: 'read',
  kb_prior_lookup: 'read',
  // optimization
  get_optimization_recommendations: 'read',
  // roi-audit
  generate_roi_audit: 'read',
  // upgrade-business-case
  get_upgrade_business_case: 'read',
  // upgrade-justification
  get_upgrade_justification: 'read',
  // verify-billing
  get_balance: 'read',
  buy_verification: 'write',
  verify_switch: 'write',
  // workforce (desk PR 1). The public ones still carry a scope (the axis is
  // kept uniform); MCP_TOOL_AUTH below says the scope is only enforced when a
  // key is presented.
  get_workforce_review: 'read',
  get_scorecard: 'read',
  draft_job_contract: 'read',
  check_vendor_bill: 'read',
  record_decision: 'write',
};

/** Look up a tool's declared scope by prefixed or unprefixed name. */
export function mcpToolScope(name: string): McpToolScope | undefined {
  const bare = name.startsWith('metrx_') ? name.slice('metrx_'.length) : name;
  return Object.prototype.hasOwnProperty.call(MCP_TOOL_SCOPES, bare)
    ? MCP_TOOL_SCOPES[bare]
    : undefined;
}

/** The sentence appended to every tool description (single phrasing, greppable). */
export const mcpScopeSentence = (scope: McpToolScope): string =>
  `Requires an API key with the '${scope}' scope.`;

/**
 * Auth mode — the SECOND axis beside scope (desk PR 1, plan §2).
 *
 * 'key'    the tool calls a route behind requireAuth: no key, no call. The
 *          hosted endpoint answers `auth_required` (lib/mcp/errors.ts) before
 *          the server is even built; `--demo` answers it locally.
 * 'public' the tool calls one of the keyless api/v1 routes (PUBLIC_V1_ROUTES
 *          in apps/web/lib/api/public-v1.ts): it works with no key on both
 *          transports, limited once per call at the route (30/min/IP). Its
 *          description carries no scope sentence. `get_workforce_review` is
 *          public for the demo org only; with `org:'me'` the route itself
 *          asks for a read key, and the description says so.
 *
 * Every tool has an entry (the type is total over the registry), so a new
 * tool cannot ship without saying whether it needs a key. The truth test
 * (apps/web/tests/truth/mcp-tools-work.test.ts) derives 'public' for a tool
 * whose route handler calls none of requireAuth/requireAdmin/requireSession
 * and asserts it against this table.
 */
export type McpToolName = (typeof MCP_TOOLS_BY_DOMAIN)[keyof typeof MCP_TOOLS_BY_DOMAIN][number];
export type McpToolAuthMode = 'key' | 'public';

const PUBLIC_TOOLS = ['get_workforce_review', 'draft_job_contract', 'check_vendor_bill'] as const;

export const MCP_TOOL_AUTH: Record<McpToolName, McpToolAuthMode> = Object.fromEntries(
  MCP_TOOL_NAMES.map((name) => [
    name,
    (PUBLIC_TOOLS as readonly string[]).includes(name) ? 'public' : 'key',
  ])
) as Record<McpToolName, McpToolAuthMode>;

/** Look up a tool's auth mode by prefixed or unprefixed name. */
export function mcpToolAuthMode(name: string): McpToolAuthMode | undefined {
  const bare = name.startsWith(MCP_TOOL_PREFIX) ? name.slice(MCP_TOOL_PREFIX.length) : name;
  return Object.prototype.hasOwnProperty.call(MCP_TOOL_AUTH, bare)
    ? MCP_TOOL_AUTH[bare as McpToolName]
    : undefined;
}

/** Unprefixed names of the tools that answer with no key (tools/list without a bearer). */
export const MCP_PUBLIC_MODE_TOOL_NAMES: readonly string[] = MCP_TOOL_NAMES.filter(
  (name) => MCP_TOOL_AUTH[name as McpToolName] === 'public'
);

/** How many tools an unauthenticated tools/list shows. Pinned by the drift test. */
export const PUBLIC_TOOL_COUNT: number = MCP_PUBLIC_MODE_TOOL_NAMES.length;

/**
 * The manager's-desk tool set: what `tools/list ?set=workforce` returns and what
 * the Claude Code plugin's .mcp.json subscribes to. The five desk tools plus
 * the four existing tools a manager reaches for in the same sitting. The only
 * named set; no `?set` means the full registry.
 */
export const WORKFORCE_TOOL_SET: ReadonlySet<McpToolName> = new Set<McpToolName>([
  'get_workforce_review',
  'get_scorecard',
  'draft_job_contract',
  'check_vendor_bill',
  'record_decision',
  'get_job_contract',
  'set_job_contract',
  'get_decision_queue',
  'get_cost_summary',
]);

export const MCP_TOOL_SETS = { workforce: WORKFORCE_TOOL_SET } as const;
export type McpToolSetName = keyof typeof MCP_TOOL_SETS;

export function mcpToolSet(name: string | null | undefined): ReadonlySet<McpToolName> | undefined {
  return name && Object.prototype.hasOwnProperty.call(MCP_TOOL_SETS, name)
    ? MCP_TOOL_SETS[name as McpToolSetName]
    : undefined;
}

/**
 * The one blessed way to render the count in prose, so every surface phrases it
 * identically and a grep for drift has a single shape to look for.
 *
 * Since 0.5.0 this describes BOTH transports: the hosted streamable-HTTP endpoint
 * at metrxbot.com/api/mcp and `npx @metrxbot/mcp-server` are published from this
 * source (packages/mcp-server/scripts/publish-mirror.ts syncs the public repo and
 * `--check` fails CI on any byte of drift), so one count is true everywhere.
 */
export const mcpToolSummary = (): string =>
  `${MCP_TOOL_COUNT} MCP tools across ${MCP_DOMAIN_COUNT} domains`;

/**
 * L7 (BINDING, N-5 D-6): the loop-metrics-domain tools (list DERIVED from the
 * registry above, so it cannot rot) return measured-value
 * envelopes (every numeric leaf is {value, ci_low, ci_high, method,
 * data_through}); every OTHER tool listed above predates the envelope contract
 * and is envelope-PENDING — its numbers are plain JSON/prose until migrated.
 * This note is appended to the server instructions so callers are never left
 * to guess which contract a response follows.
 */
export const LEGACY_ENVELOPE_PENDING_NOTE =
  'Response contract note: every loop-metrics-domain tool (' +
  MCP_TOOLS_BY_DOMAIN['loop-metrics'].map((n) => `${MCP_TOOL_PREFIX}${n}`).join(', ') +
  ') returns measured-value envelopes (numeric leaves are ' +
  '{value, ci_low, ci_high, method, data_through}; CIs never fabricated). All other ' +
  '(legacy) Metrx MCP responses are envelope-PENDING: plain numbers, not yet ' +
  'envelope-shaped.';
