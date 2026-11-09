/**
 * Job Contract Tools (W-C01)
 *
 * The per-agent job contract: objective, unit of work, acceptance criteria,
 * KPI target, budget, owner — versioned and append-only on the server
 * (acceptance_contracts, migrations 085/120). `get_job_contract` reads the
 * current one(s) plus history; `set_job_contract` publishes a NEW VERSION via
 * POST /api/v1/agents/{agent_key}/contract.
 *
 * The write calls requireAdmin. Since W1-4b requireAdmin admits an API key
 * that carries the 'admin' scope (minted by an org owner/admin in
 * Settings → Security → API Keys); any other key gets 403 insufficient_scope,
 * which the client surfaces verbatim. Before W1-4b no API key could pass, and
 * this tool was withheld for that reason. An org admin can also publish from
 * the dashboard (agent → Contract tab), which calls the same route with a
 * Clerk session.
 *
 * A contract is RECORDED, not enforced: nothing at runtime blocks spend or
 * traffic on it (spend limits live in budget_configs — see set_budget).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';

/** Mirrors CONTRACT_WINDOW_RE in @metrx/types (the route validates with it). */
const CONTRACT_WINDOW_RE = /^([1-9]\d{0,3})(h|d|w)$/;

const criterionSchema = z.object({
  metric: z
    .string()
    .min(1)
    .max(100)
    .describe('Metric name in your vocabulary (e.g. field_accuracy)'),
  op: z.enum(['>=', '>', '<=', '<', '==']).describe('Comparison operator'),
  threshold: z.number().finite().describe('Threshold the metric is compared against'),
  window: z.string().regex(CONTRACT_WINDOW_RE).describe("Rolling window, e.g. '24h', '7d', '4w'"),
});

interface ContractRow {
  id: string;
  workload: string;
  agent_scope: string | null;
  version: number;
  status: string;
  created_at?: string;
  objective?: string | null;
  unit_of_work?: string | null;
  acceptance_criteria?: Array<{
    metric: string;
    op: string;
    threshold: number;
    window: string;
  }> | null;
  kpi_target?: { metric: string; target: number; window: string } | null;
  budget?: { limit_microdollars: number; period: string } | null;
  owner?: string | null;
}

interface ReadoutData {
  agent_key: string;
  current: ContractRow[];
  versions: ContractRow[];
  empty_state?: { reason: string; primary_action: string };
  /** Per workload, the contract governing the agent (agent-scoped, else the org policy). */
  governing?: Array<{
    id: string;
    workload: string;
    version: number;
    scope: 'agent' | 'workload';
    engine_reads?: boolean;
    has_job_terms: boolean;
  }>;
  /** The workload the agent's review signals derive (null: none or ambiguous). */
  derived_workload?: string | null;
  ambiguous_workloads?: string[];
}

function engineLine(data: ReadoutData, g: NonNullable<ReadoutData['governing']>): string {
  const read = g.find((r) => r.engine_reads);
  if (read)
    return `The engine reads ${read.workload} v${read.version} (the workload its review signals derive).`;
  // Derived, but its contract was deleted or superseded with no successor.
  if (data.derived_workload)
    return `The engine reads none of them: its review signals are for ${data.derived_workload}, which no contract covers now.`;
  const ambiguous = data.ambiguous_workloads ?? [];
  if (ambiguous.length > 0)
    return `The engine reads none of them: its review signals span ${ambiguous.join(', ')}.`;
  return 'The engine reads none of them for this agent yet (it has sent no review signals).';
}

function describeGoverning(g: NonNullable<ReadoutData['governing']>): string {
  const parts = g.map(
    (r) =>
      `${r.workload} v${r.version} (${r.scope === 'workload' ? 'workload-level policy' : 'agent contract'})`
  );
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function formatMicrodollars(v: number): string {
  return `$${(v / 1_000_000).toFixed(2)}`;
}

function formatContract(c: ContractRow): string {
  const lines = [
    `v${c.version} · ${c.workload} · ${c.status}${c.created_at ? ` · ${c.created_at.slice(0, 10)}` : ''}`,
  ];
  if (c.objective) lines.push(`  Objective: ${c.objective}`);
  if (c.unit_of_work) lines.push(`  Unit of work: ${c.unit_of_work}`);
  if (c.acceptance_criteria?.length) {
    lines.push('  Acceptance criteria:');
    for (const a of c.acceptance_criteria) {
      lines.push(`    - ${a.metric} ${a.op} ${a.threshold} over ${a.window}`);
    }
  }
  if (c.kpi_target) {
    lines.push(
      `  KPI target: ${c.kpi_target.metric} → ${c.kpi_target.target} over ${c.kpi_target.window}`
    );
  }
  if (c.budget) {
    lines.push(
      `  Budget: ${formatMicrodollars(c.budget.limit_microdollars)} / ${c.budget.period} (declared; spend limits live in budget_configs)`
    );
  }
  if (c.owner) lines.push(`  Owner: ${c.owner}`);
  if (!c.objective && !c.kpi_target) {
    lines.push(
      '  (workload policy only — no job fields; publish them with set_job_contract, which needs an admin-scoped API key, or from the dashboard: agent → Contract tab)'
    );
  }
  return lines.join('\n');
}

export function registerContractTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_job_contract ──
  server.registerTool(
    'get_job_contract',
    {
      title: 'Get Job Contract',
      description:
        "Read an agent's job contract: its current version per workload (objective, unit of work, " +
        'acceptance criteria, KPI target, budget, owner) and the full append-only version history. ' +
        'An agent with no contract returns an explicit empty state with the next action. ' +
        'Read-only.',
      inputSchema: {
        agent_key: z
          .string()
          .min(1)
          .describe('The agent_key (the X-Agent-ID string), not the UUID'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_key }) => {
      const result = await client.get<ReadoutData>(
        `/v1/agents/${encodeURIComponent(agent_key)}/contract`
      );
      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error reading job contract: ${result.error}` }],
          isError: true,
        };
      }
      const data = result.data!;
      if (data.empty_state) {
        const governing = data.governing ?? [];
        const headline =
          governing.length > 0
            ? `Agent ${data.agent_key} is governed by ${describeGoverning(governing)}, which ${governing.length === 1 ? 'states' : 'state'} no job terms yet. ` +
              engineLine(data, governing)
            : `No contract governs agent ${data.agent_key} yet.`;
        return {
          content: [
            {
              type: 'text',
              text:
                `${headline}\n` +
                `Next: ${data.empty_state.primary_action} — or call set_job_contract (needs an ` +
                "API key with the 'admin' scope) with objective, unit_of_work, acceptance_criteria, " +
                'kpi_target, budget and owner. ' +
                'The contract is declared, not enforced at runtime: nothing blocks spend or traffic on it.',
            },
          ],
        };
      }
      // Governing set first: an org policy with job terms can govern (and be
      // graded) while the agent has no agent-scoped version of its own.
      const governing = data.governing ?? [];
      const governingBlock =
        governing.length > 0
          ? `GOVERNING (per workload)\n${governing
              .map(
                (g) =>
                  `${g.workload} v${g.version} (${g.scope === 'agent' ? 'agent-scoped' : 'workload-level policy'})` +
                  `${g.has_job_terms ? '' : ', no job terms'}${g.engine_reads ? ', the engine reads this one' : ''}`
              )
              .join('\n')}\n\n`
          : '';
      const text =
        `Job contract for ${data.agent_key} — ${data.current.length} current, ${data.versions.length} version(s) total\n\n` +
        governingBlock +
        `CURRENT\n${data.current.length > 0 ? data.current.map(formatContract).join('\n\n') : '(no agent-scoped version)'}\n\n` +
        `HISTORY (newest first)\n${data.versions.map((v) => `v${v.version} ${v.workload} ${v.status}`).join('\n')}`;
      return { content: [{ type: 'text', text }] };
    }
  );

  // ── set_job_contract ──
  server.registerTool(
    'set_job_contract',
    {
      title: 'Set Job Contract',
      description:
        "Publish a NEW VERSION of an agent's job contract (append-only: the previous active version " +
        'for the same workload is superseded in the same transaction). Required: workload, objective, ' +
        'unit_of_work, acceptance_criteria (1-20), kpi_target, budget (dollars per daily|weekly|monthly ' +
        'period, stored as micro-dollars), owner. Workload-policy terms are inherited from the current ' +
        'version unless supplied in policy_terms. For an agent with no version yet, set ' +
        "policy_defaults: 'inherit_workload_policy' copies the org's workload-level policy (a " +
        "snapshot), 'observe_only' gets terms that grant no authority (needs task_verb and domain in " +
        'policy_terms); otherwise every term must be in policy_terms. The contract is RECORDED, not enforced at runtime: nothing blocks spend or traffic on ' +
        "it. Needs an API key with the 'admin' scope — an org owner or admin mints one in " +
        'Settings → Security → API Keys; any other key is refused with 403. ' +
        'Do NOT use to read a contract — use get_job_contract.',
      inputSchema: {
        agent_key: z
          .string()
          .min(1)
          .describe('The agent_key (the X-Agent-ID string), not the UUID'),
        workload: z
          .string()
          .min(1)
          .max(100)
          .describe("Workload label the contract governs (e.g. 'extraction')"),
        objective: z.string().min(1).max(2000).describe('What this agent is for, in your words'),
        unit_of_work: z
          .string()
          .min(1)
          .max(200)
          .describe("The countable output (e.g. 'one DDQ reviewed')"),
        acceptance_criteria: z
          .array(criterionSchema)
          .min(1)
          .max(20)
          .describe('What "done well" means: 1-20 {metric, op, threshold, window}'),
        kpi_target: z
          .object({
            metric: z.string().min(1).max(100),
            target: z.number().finite(),
            window: z.string().regex(CONTRACT_WINDOW_RE),
          })
          .describe('The number the agent is held to over a rolling window'),
        budget_dollars: z
          .number()
          .positive()
          .refine((d) => Math.round(d * 1_000_000) >= 1, 'budget must be at least $0.000001')
          .describe('Declared spend limit in dollars per period (recorded, not enforced)'),
        budget_period: z.enum(['daily', 'weekly', 'monthly']).describe('Budget period'),
        owner: z.string().min(1).max(320).describe('User id or email accountable for this agent'),
        notes: z.string().max(2000).optional().describe('Optional note recorded on this version'),
        policy_terms: z
          .record(z.unknown())
          .optional()
          .describe(
            'Optional workload-policy terms (unit, eligible_traffic, primary_quality, ' +
              'critical_guardrails, signal, non_inferiority, cost_definition, permitted_actions, ' +
              'exposure_budget, rollback_fast, rollback_slow, evidence_expiry, task_verb, domain). ' +
              'Omit to inherit from the current version.'
          ),
        policy_defaults: z
          .enum(['inherit_workload_policy', 'observe_only'])
          .optional()
          .describe(
            "First version only: where engine terms come from. 'inherit_workload_policy' copies the " +
              "org's active workload-level policy (refused when none exists); 'observe_only' grants " +
              'no authority (every action class shadow). Ignored when the agent already has a version.'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      agent_key,
      workload,
      objective,
      unit_of_work,
      acceptance_criteria,
      kpi_target,
      budget_dollars,
      budget_period,
      owner,
      notes,
      policy_terms,
      policy_defaults,
    }) => {
      // Policy terms first so the job fields below always win a name clash.
      const body: Record<string, unknown> = {
        ...(policy_terms ?? {}),
        workload,
        objective,
        unit_of_work,
        acceptance_criteria,
        kpi_target,
        // Dollars → MICRO-dollars (1e6 = $1), the unit the contract stores.
        budget: {
          limit_microdollars: Math.round(budget_dollars * 1_000_000),
          period: budget_period,
        },
        owner,
      };
      if (notes !== undefined) body.notes = notes;
      if (policy_defaults !== undefined) body.policy_defaults = policy_defaults;

      const result = await client.post<ContractRow>(
        `/v1/agents/${encodeURIComponent(agent_key)}/contract`,
        body
      );
      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error publishing job contract: ${result.error}` }],
          isError: true,
        };
      }
      const row = result.data!;
      const superseded = (result as { superseded_count?: number }).superseded_count ?? 0;
      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Job contract v${row.version} published for ${agent_key} (${row.workload})` +
              (superseded ? `; superseded ${superseded} prior version(s)` : '') +
              '. Recorded, not enforced at runtime.' +
              `\n\n${formatContract(row)}`,
          },
        ],
      };
    }
  );
}
