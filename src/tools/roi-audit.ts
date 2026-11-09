/**
 * ROI Audit MCP Tool
 *
 * Enterprise-grade tool for generating comprehensive ROI audit reports.
 * Combines cost data, attribution data, optimization suggestions, and
 * confidence metrics into a single auditable snapshot.
 *
 * Used by: CFOs, finance teams, board reporting, compliance audits
 *
 * Savings definition v2 / one P&L (plan 2026-10-12 §5, W4): every figure is the
 * one the dashboard and the agent card show, for the same window.
 *   - cost, attributed revenue, outcomes, confidence: GET /dashboard (org window
 *     P&L, migration 137) — per agent from `agents_list`, fleet from the totals;
 *   - savings: the stored v2 monthly total (GET /agents per agent, GET
 *     /dashboard/suggestions for the fleet).
 * The tool used to print 0 for per-agent revenue, confidence, outcomes and
 * savings (never fetched), read an `avg_confidence` field the API never
 * returned, and call revenue ÷ cost "Net ROI". Missing is "n/a", never 0.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { DashboardSummary } from '../types.js';
import { readStoredSavingsTotal } from '../services/stored-savings.js';

interface AgentROISummary {
  agent_id: string;
  agent_name: string;
  /** Window LLM cost; null = not readable. */
  total_cost_cents: number | null;
  /** Attributed revenue; null = not on this plan or not readable. */
  total_revenue_cents: number | null;
  /** Attributed revenue ÷ cost (x); null when either is 0. */
  roi_multiplier: number | null;
  /** Outcome-weighted primary-link confidence (0–1); null = no attributed outcomes. */
  attribution_confidence: number | null;
  outcome_count: number | null;
  /** Stored monthly savings estimate; null = none current. */
  optimization_savings_cents: number | null;
  risk_flags: string[];
}

interface ROIAuditReport {
  generated_at: string;
  period_days: number;
  fleet_summary: {
    total_agents: number;
    total_cost_cents: number | null;
    total_revenue_cents: number | null;
    attributed_revenue_multiple: number | null;
    attribution_confidence: number | null;
    total_optimization_savings_cents: number | null;
  };
  agents: AgentROISummary[];
  methodology: string;
  caveats: string[];
}

type AgentRow = DashboardSummary['agents_list'][number];

interface FleetAgentSavings {
  id: string;
  optimization_suggestions?: Array<{
    status?: string;
    total_monthly_savings_cents?: number | null;
  }>;
}

const usd = (cents: number | null): string =>
  cents === null ? 'n/a' : `$${(cents / 100).toFixed(2)}`;
const multiple = (x: number | null): string => (x === null ? 'n/a' : `${x.toFixed(2)}x`);
const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Σ of the non-null values; null when every value is null (unknown ≠ 0). */
function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

export function registerROIAuditTools(server: McpServer, client: MetrxApiClient): void {
  server.registerTool(
    'generate_roi_audit',
    {
      title: 'Generate ROI Audit Report',
      description:
        'Generate a comprehensive ROI audit report for your AI agent fleet. ' +
        'Includes per-agent cost/revenue breakdown, attribution confidence scores, ' +
        'optimization opportunities, and risk flags. Suitable for board reporting and compliance. ' +
        'Do NOT use for quick per-agent ROI checks — use get_task_roi for individual agents.',
      inputSchema: {
        period_days: z
          .number()
          .int()
          .min(7)
          .max(365)
          .default(30)
          .describe('Analysis period in days (7-365)'),
        include_methodology: z
          .boolean()
          .default(true)
          .describe('Include methodology notes and caveats for auditors'),
        agent_ids: z
          .array(z.string().uuid())
          .optional()
          .describe('Specific agent IDs to include. Omit for full fleet audit.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ period_days, include_methodology, agent_ids }) => {
      const [dashResult, fleetResult] = await Promise.all([
        client.get<DashboardSummary>('/dashboard', { days: String(period_days) }),
        client.get<FleetAgentSavings[] | { agents: FleetAgentSavings[] }>('/agents'),
      ]);

      if (dashResult.error) {
        return {
          content: [{ type: 'text', text: `Error generating audit: ${dashResult.error}` }],
          isError: true,
        };
      }

      const dash = dashResult.data;
      // The window the API actually read (plans can shorten the request).
      const windowDays = num(dash?.period_days) ?? period_days;
      const fullAttribution = typeof dash?.attribution?.total_revenue_cents === 'number';
      const agents: AgentRow[] = dash?.agents_list ?? [];
      const filteredAgents = agent_ids ? agents.filter((a) => agent_ids.includes(a.id)) : agents;

      // Per-agent stored savings (the fleet card's figure). A failed read is
      // "n/a" per agent, never 0.
      const rawFleet = fleetResult.error ? null : fleetResult.data;
      const fleetRows: FleetAgentSavings[] | null = rawFleet
        ? Array.isArray(rawFleet)
          ? rawFleet
          : (rawFleet.agents ?? [])
        : null;
      const savingsByAgent = new Map<string, number | null>();
      for (const row of fleetRows ?? []) {
        const opt = row.optimization_suggestions?.[0];
        savingsByAgent.set(
          row.id,
          opt && (opt.status ?? 'current') === 'current'
            ? num(opt.total_monthly_savings_cents)
            : null
        );
      }

      const agentSummaries: AgentROISummary[] = filteredAgents.map((a) => {
        const cost = num(a.monthly_cost_cents);
        const roi = num(a.roi_multiplier);
        const revenue = fullAttribution ? num(a.attributed_revenue_cents) : null;
        const outcomes = fullAttribution ? num(a.attributed_outcome_count) : null;
        const riskFlags: string[] = [];
        if (a.status === 'error') riskFlags.push('Agent in error state');
        if (roi !== null && roi < 1) riskFlags.push('Attributed revenue below cost');
        if (fullAttribution && (outcomes ?? 0) === 0 && (cost ?? 0) > 0)
          riskFlags.push('No attributed outcomes in period');
        if (cost === null) riskFlags.push('Cost could not be read');

        return {
          agent_id: a.id,
          agent_name: a.name,
          total_cost_cents: cost,
          total_revenue_cents: revenue,
          roi_multiplier: roi,
          attribution_confidence: fullAttribution ? num(a.avg_attribution_confidence) : null,
          outcome_count: outcomes,
          optimization_savings_cents: savingsByAgent.get(a.id) ?? null,
          risk_flags: riskFlags,
        };
      });

      // Fleet: the org totals (incl. calls with no agent) for a whole-fleet
      // audit; Σ of the selected agents when filtered.
      let totalCost: number | null;
      let totalRevenue: number | null;
      let fleetConfidence: number | null;
      let fleetSavings: number | null;
      if (agent_ids) {
        totalCost = sumKnown(agentSummaries.map((a) => a.total_cost_cents));
        totalRevenue = fullAttribution
          ? sumKnown(agentSummaries.map((a) => a.total_revenue_cents))
          : null;
        let w = 0;
        let wc = 0;
        for (const a of agentSummaries) {
          if (a.attribution_confidence !== null && (a.outcome_count ?? 0) > 0) {
            wc += a.attribution_confidence * (a.outcome_count ?? 0);
            w += a.outcome_count ?? 0;
          }
        }
        fleetConfidence = w > 0 ? wc / w : null;
        fleetSavings = fleetRows
          ? sumKnown(agentSummaries.map((a) => a.optimization_savings_cents))
          : null;
      } else {
        totalCost = num(dash?.cost?.total_cost_cents);
        totalRevenue = fullAttribution ? num(dash?.attribution?.total_revenue_cents) : null;
        fleetConfidence = fullAttribution ? num(dash?.attribution?.attribution_confidence) : null;
        fleetSavings = (await readStoredSavingsTotal(client)).total_cents;
      }
      const revenueMultiple =
        totalCost !== null && totalRevenue !== null && totalCost > 0 && totalRevenue > 0
          ? totalRevenue / totalCost
          : null;

      const report: ROIAuditReport = {
        generated_at: new Date().toISOString(),
        period_days: windowDays,
        fleet_summary: {
          total_agents: filteredAgents.length,
          total_cost_cents: totalCost,
          total_revenue_cents: totalRevenue,
          attributed_revenue_multiple: revenueMultiple,
          attribution_confidence: fleetConfidence,
          total_optimization_savings_cents: fleetSavings,
        },
        agents: agentSummaries,
        methodology: include_methodology
          ? 'Cost is the measured LLM spend for the window (billable calls). ' +
            'Attributed revenue is the value of outcomes linked to an agent call through its ' +
            'primary attribution, counted on the time of the attributed call. ' +
            'Attributed revenue multiple = attributed revenue ÷ cost, written as a multiple (x); ' +
            'it is not causally verified and it is not net of cost. ' +
            'Attribution confidence is the outcome-weighted confidence of those primary links. ' +
            'Optimization savings are the stored monthly estimate per agent (modeled, not ' +
            "measured; each bounded by that agent's spend). All monetary values are in cents."
          : '',
        caveats: [
          'Attribution confidence reflects data quality, not guaranteed accuracy.',
          'Attributed revenue is not causally verified; it is not proof the agent produced it.',
          'Optimization savings are estimates based on current pricing and may vary.',
          'Industry default values are used when user-configured outcomes are not available.',
          ...(fullAttribution
            ? []
            : ['Attributed revenue is not included on this plan, so revenue figures read n/a.']),
        ],
      };

      // Format as readable text
      const lines: string[] = [
        `# ROI Audit Report`,
        `Generated: ${new Date(report.generated_at).toLocaleDateString()}`,
        `Period: Last ${windowDays} days`,
        '',
        `## Fleet Summary`,
        `- Total Agents: ${report.fleet_summary.total_agents}`,
        `- Total Cost (Measured): ${usd(totalCost)}`,
        `- Attributed Revenue: ${usd(totalRevenue)}`,
        `- Attributed revenue multiple: ${
          revenueMultiple !== null ? multiple(revenueMultiple) : 'n/a (no attributed revenue)'
        }`,
        `- Attribution Confidence: ${pct(fleetConfidence)}`,
        `- Optimization Savings (Estimate): ${
          fleetSavings === null ? 'n/a' : `${usd(fleetSavings)}/mo`
        }`,
        '',
        `## Per-Agent Breakdown`,
      ];

      for (const agent of agentSummaries) {
        lines.push(`\n### ${agent.agent_name}`);
        lines.push(`- Cost: ${usd(agent.total_cost_cents)} (last ${windowDays} days)`);
        lines.push(`- Attributed Revenue: ${usd(agent.total_revenue_cents)}`);
        lines.push(`- Attributed Outcomes: ${agent.outcome_count ?? 'n/a'}`);
        lines.push(`- Attributed revenue multiple: ${multiple(agent.roi_multiplier)}`);
        lines.push(`- Attribution Confidence: ${pct(agent.attribution_confidence)}`);
        lines.push(
          `- Optimization Savings (Estimate): ${
            agent.optimization_savings_cents === null
              ? 'n/a'
              : `${usd(agent.optimization_savings_cents)}/mo`
          }`
        );
        if (agent.risk_flags.length > 0) {
          lines.push(`- Risks: ${agent.risk_flags.join(', ')}`);
        }
      }

      if (include_methodology && report.methodology) {
        lines.push('', '## Methodology', report.methodology);
      }

      if (report.caveats.length > 0) {
        lines.push('', '## Caveats');
        for (const caveat of report.caveats) {
          lines.push(`- ${caveat}`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );
}
