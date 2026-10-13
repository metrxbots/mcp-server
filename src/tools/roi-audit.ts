/**
 * ROI Audit MCP Tool
 *
 * Enterprise-grade tool for generating comprehensive ROI audit reports.
 * Combines cost data, attribution data, optimization suggestions, and
 * confidence metrics into a single auditable snapshot.
 *
 * Used by: CFOs, finance teams, board reporting, compliance audits
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';

/**
 * Attribution fields from /dashboard have three states, and the audit words each
 * one differently (see AgentSummary in ../types.ts):
 *   number → the value; null → on the plan, nothing attributed ("no attributed
 *   revenue"); undefined → the plan omits attribution (starter, lite, unknown
 *   tiers), so the line is left out rather than reported as $0 or "no data".
 */
interface AgentROISummary {
  agent_id: string;
  agent_name: string;
  total_cost_cents: number | null;
  total_revenue_cents?: number | null;
  /** Attributed revenue ÷ AI cost (a return multiple). */
  roi_multiplier?: number | null;
  attribution_confidence?: number | null;
  outcome_count?: number | null;
  optimization_savings_cents: number;
  risk_flags: string[];
}

interface ROIAuditReport {
  generated_at: string;
  period_days: number;
  /** False when the plan omits attributed revenue (attribution null/absent or summary-only). */
  attribution_included: boolean;
  fleet_summary: {
    total_agents: number;
    total_cost_cents: number;
    total_outcomes?: number;
    total_revenue_cents?: number;
    attributed_revenue_multiple?: number | null;
    avg_attribution_confidence?: number | null;
    total_optimization_savings_cents: number;
  };
  agents: AgentROISummary[];
  methodology: string;
  caveats: string[];
}

/** Shape of GET /dashboard as read by the audit. Every attribution field is optional. */
interface DashboardForAudit {
  cost?: { total_cost_cents: number; total_calls: number };
  attribution?: {
    total_outcomes?: number;
    total_revenue_cents?: number;
    net_value_cents?: number;
    roi_multiplier?: number | null;
    attribution_confidence?: number | null;
    /** Pre-0.2.6 name; read only as a fallback for older backends. */
    avg_confidence?: number | null;
    upgrade_hint?: string;
  } | null;
  agents_list?: Array<{
    id: string;
    name: string;
    monthly_cost_cents?: number | null;
    roi_multiplier?: number | null;
    net_profit_cents?: number | null;
    attributed_revenue_cents?: number | null;
    attributed_outcome_count?: number | null;
    avg_attribution_confidence?: number | null;
    status: string;
  }>;
}

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export const ROI_AUDIT_METHODOLOGY =
  'Revenue attribution uses a dual-confidence model combining cost confidence (data volume, recency) ' +
  'with quality confidence (outcome verification, source reliability). ' +
  'The attributed revenue multiple is a return multiple: Attributed Revenue ÷ AI Cost ' +
  '(e.g. 3.00x means $3.00 of attributed revenue for every $1.00 of AI cost; below 1.00x, ' +
  'attributed revenue is less than cost). It is not net ROI, which would subtract cost first. ' +
  'Optimization savings are projected based on 30-day usage patterns and model pricing data. ' +
  'All monetary values are in cents.';

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
      const dashResult = await client.get<DashboardForAudit>('/dashboard', {
        days: String(period_days),
      });

      if (dashResult.error) {
        return {
          content: [{ type: 'text', text: `Error generating audit: ${dashResult.error}` }],
          isError: true,
        };
      }

      const dash = dashResult.data;
      const agents = dash?.agents_list ?? [];
      const filteredAgents = agent_ids ? agents.filter((a) => agent_ids.includes(a.id)) : agents;
      const attr = dash?.attribution ?? null;
      // Money is on the plan only when the API sent attributed revenue as a number.
      const attributionIncluded = typeof attr?.total_revenue_cents === 'number';

      // Build per-agent summaries
      const agentSummaries: AgentROISummary[] = filteredAgents.map((a) => {
        const riskFlags: string[] = [];
        if (a.status === 'error') riskFlags.push('Agent in error state');
        if (typeof a.roi_multiplier === 'number' && a.roi_multiplier < 1) {
          riskFlags.push('Attributed revenue below AI cost (multiple under 1.00x)');
        }
        // null = on the plan, nothing attributed. Absent = not on the plan: no flag.
        if (a.roi_multiplier === null) riskFlags.push('No attributed revenue');

        return {
          agent_id: a.id,
          agent_name: a.name,
          total_cost_cents: typeof a.monthly_cost_cents === 'number' ? a.monthly_cost_cents : null,
          total_revenue_cents: a.attributed_revenue_cents,
          roi_multiplier: a.roi_multiplier,
          attribution_confidence: a.avg_attribution_confidence,
          outcome_count: a.attributed_outcome_count,
          optimization_savings_cents: 0,
          risk_flags: riskFlags,
        };
      });

      const totalCost = dash?.cost?.total_cost_cents ?? 0;
      const totalRevenue = attributionIncluded ? (attr!.total_revenue_cents as number) : undefined;
      // Prefer the API's multiple (revenue ÷ cost, null when either is 0); fall back to
      // computing it only when an older backend sends revenue without the multiple.
      let fleetMultiple: number | null | undefined;
      if (attributionIncluded) {
        if (typeof attr!.roi_multiplier === 'number') fleetMultiple = attr!.roi_multiplier;
        else if (attr!.roi_multiplier === null) fleetMultiple = null;
        else fleetMultiple = totalCost > 0 && totalRevenue! > 0 ? totalRevenue! / totalCost : null;
      }
      const confidence = attributionIncluded
        ? typeof attr!.attribution_confidence === 'number'
          ? attr!.attribution_confidence
          : typeof attr!.avg_confidence === 'number'
            ? attr!.avg_confidence
            : null
        : undefined;

      const report: ROIAuditReport = {
        generated_at: new Date().toISOString(),
        period_days,
        attribution_included: attributionIncluded,
        fleet_summary: {
          total_agents: filteredAgents.length,
          total_cost_cents: totalCost,
          total_outcomes: typeof attr?.total_outcomes === 'number' ? attr.total_outcomes : undefined,
          total_revenue_cents: totalRevenue,
          attributed_revenue_multiple: fleetMultiple,
          avg_attribution_confidence: confidence,
          total_optimization_savings_cents: 0,
        },
        agents: agentSummaries,
        methodology: include_methodology ? ROI_AUDIT_METHODOLOGY : '',
        caveats: [
          'Attribution confidence reflects data quality, not guaranteed accuracy.',
          'Revenue figures include both confirmed and inferred outcomes (weighted by confidence).',
          'Optimization savings are estimates based on current pricing and may vary.',
          'Industry default values are used when user-configured outcomes are not available.',
        ],
      };

      // Format as readable text
      const fs = report.fleet_summary;
      const lines: string[] = [
        `# ROI Audit Report`,
        `Generated: ${new Date(report.generated_at).toLocaleDateString()}`,
        `Period: Last ${period_days} days`,
        '',
        `## Fleet Summary`,
        `- Total Agents: ${fs.total_agents}`,
        `- Total AI Cost: ${dollars(fs.total_cost_cents)}`,
      ];
      if (typeof fs.total_outcomes === 'number') {
        lines.push(`- Attributed Outcomes: ${fs.total_outcomes}`);
      }
      if (typeof fs.total_revenue_cents === 'number') {
        lines.push(`- Attributed Revenue: ${dollars(fs.total_revenue_cents)}`);
        lines.push(
          `- Attributed Revenue Multiple: ${
            typeof fs.attributed_revenue_multiple === 'number'
              ? `${fs.attributed_revenue_multiple.toFixed(2)}x`
              : 'n/a (no attributed revenue or no cost)'
          }`
        );
        lines.push(
          `- Avg Attribution Confidence: ${
            typeof fs.avg_attribution_confidence === 'number'
              ? `${(fs.avg_attribution_confidence * 100).toFixed(0)}%`
              : 'n/a (no attributed outcomes)'
          }`
        );
      } else {
        lines.push(
          `- Attributed Revenue: not included in your plan${
            attr?.upgrade_hint ? ` (${attr.upgrade_hint})` : ''
          }`
        );
      }
      lines.push('', `## Per-Agent Breakdown`);

      for (const agent of agentSummaries) {
        lines.push(`\n### ${agent.agent_name}`);
        lines.push(
          `- AI Cost: ${
            typeof agent.total_cost_cents === 'number' ? `${dollars(agent.total_cost_cents)}/mo` : 'N/A'
          }`
        );
        if (typeof agent.total_revenue_cents === 'number') {
          lines.push(`- Attributed Revenue: ${dollars(agent.total_revenue_cents)}`);
        }
        // number → multiple; null → no attributed revenue; absent → plan omits it, no line.
        if (typeof agent.roi_multiplier === 'number') {
          lines.push(`- Attributed Revenue Multiple: ${agent.roi_multiplier.toFixed(2)}x`);
        } else if (agent.roi_multiplier === null) {
          lines.push('- Attributed Revenue Multiple: n/a (no attributed revenue)');
        }
        if (agent.risk_flags.length > 0) {
          lines.push(`- Risks: ${agent.risk_flags.join(', ')}`);
        }
      }

      if (!attributionIncluded) {
        lines.push(
          '',
          '_Per-agent attributed revenue and multiples are not included in your plan, so they are omitted above._'
        );
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
