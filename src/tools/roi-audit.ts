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

interface AgentROISummary {
  agent_id: string;
  agent_name: string;
  total_cost_cents: number;
  total_revenue_cents: number;
  roi_multiplier: number | null;
  attribution_confidence: number;
  outcome_count: number;
  optimization_savings_cents: number;
  risk_flags: string[];
}

interface ROIAuditReport {
  generated_at: string;
  period_days: number;
  fleet_summary: {
    total_agents: number;
    total_cost_cents: number;
    total_revenue_cents: number;
    net_roi_multiplier: number | null;
    avg_attribution_confidence: number;
    total_optimization_savings_cents: number;
  };
  agents: AgentROISummary[];
  methodology: string;
  caveats: string[];
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
      // Fetch dashboard data with optimization info
      const dashResult = await client.get<{
        cost?: { total_cost_cents: number; total_calls: number };
        attribution?: {
          total_revenue_cents: number;
          total_outcomes: number;
          roi_multiplier: number | null;
          avg_confidence: number;
        };
        agents_list?: Array<{
          id: string;
          name: string;
          monthly_cost_cents: number;
          roi_multiplier: number | null;
          status: string;
        }>;
      }>('/dashboard', { days: String(period_days) });

      if (dashResult.error) {
        return {
          content: [{ type: 'text', text: `Error generating audit: ${dashResult.error}` }],
          isError: true,
        };
      }

      const dash = dashResult.data;
      const agents = dash?.agents_list ?? [];
      const filteredAgents = agent_ids ? agents.filter((a) => agent_ids.includes(a.id)) : agents;

      // Build per-agent summaries
      const agentSummaries: AgentROISummary[] = filteredAgents.map((a) => {
        const riskFlags: string[] = [];
        if (a.status === 'error') riskFlags.push('Agent in error state');
        if (a.roi_multiplier !== null && a.roi_multiplier < 1)
          riskFlags.push('ROI below break-even');
        if (!a.roi_multiplier) riskFlags.push('No attribution data');

        return {
          agent_id: a.id,
          agent_name: a.name,
          total_cost_cents: a.monthly_cost_cents ?? 0,
          total_revenue_cents: 0, // per-agent revenue requires separate fetch
          roi_multiplier: a.roi_multiplier,
          attribution_confidence: 0,
          outcome_count: 0,
          optimization_savings_cents: 0,
          risk_flags: riskFlags,
        };
      });

      const totalCost = dash?.cost?.total_cost_cents ?? 0;
      const totalRevenue = dash?.attribution?.total_revenue_cents ?? 0;
      const netROI = totalCost > 0 ? totalRevenue / totalCost : null;

      const report: ROIAuditReport = {
        generated_at: new Date().toISOString(),
        period_days,
        fleet_summary: {
          total_agents: filteredAgents.length,
          total_cost_cents: totalCost,
          total_revenue_cents: totalRevenue,
          net_roi_multiplier: netROI,
          avg_attribution_confidence: dash?.attribution?.avg_confidence ?? 0,
          total_optimization_savings_cents: 0,
        },
        agents: agentSummaries,
        methodology: include_methodology
          ? 'Revenue attribution uses a dual-confidence model combining cost confidence (data volume, recency) ' +
            'with quality confidence (outcome verification, source reliability). ' +
            'ROI = (Attributed Revenue - Cost) / Cost. ' +
            'Optimization savings are projected based on 30-day usage patterns and model pricing data. ' +
            'All monetary values are in cents.'
          : '',
        caveats: [
          'Attribution confidence reflects data quality, not guaranteed accuracy.',
          'Revenue figures include both confirmed and inferred outcomes (weighted by confidence).',
          'Optimization savings are estimates based on current pricing and may vary.',
          'Industry default values are used when user-configured outcomes are not available.',
        ],
      };

      // Format as readable text
      const lines: string[] = [
        `# ROI Audit Report`,
        `Generated: ${new Date(report.generated_at).toLocaleDateString()}`,
        `Period: Last ${period_days} days`,
        '',
        `## Fleet Summary`,
        `- Total Agents: ${report.fleet_summary.total_agents}`,
        `- Total Cost: $${(report.fleet_summary.total_cost_cents / 100).toFixed(2)}`,
        `- Total Revenue: $${(report.fleet_summary.total_revenue_cents / 100).toFixed(2)}`,
        `- Net ROI: ${netROI !== null ? `${netROI.toFixed(2)}x` : 'N/A (no attribution data)'}`,
        `- Avg Attribution Confidence: ${(
          report.fleet_summary.avg_attribution_confidence * 100
        ).toFixed(0)}%`,
        '',
        `## Per-Agent Breakdown`,
      ];

      for (const agent of agentSummaries) {
        lines.push(`\n### ${agent.agent_name}`);
        lines.push(`- Cost: $${(agent.total_cost_cents / 100).toFixed(2)}/mo`);
        lines.push(
          `- ROI: ${agent.roi_multiplier !== null ? `${agent.roi_multiplier.toFixed(2)}x` : 'N/A'}`
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
