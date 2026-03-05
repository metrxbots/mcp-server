/**
 * Attribution Tools
 *
 * Tools for linking agent tasks/events to business outcomes
 * and retrieving attribution reports.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';

interface AttributionResponse {
  id: string;
  agent_id: string;
  event_id?: string;
  outcome_type: string;
  outcome_source: string;
  value_cents?: number;
  description?: string;
  created_at: string;
}

interface AttributionReportResponse {
  agent_id?: string;
  period_days: number;
  model: string;
  total_outcomes: number;
  total_value_cents: number;
  outcomes: Array<{
    outcome_type: string;
    count: number;
    value_cents: number;
    confidence: number;
    top_attributions: Array<{
      agent_id: string;
      agent_name: string;
      contribution_value_cents: number;
      confidence: number;
    }>;
  }>;
}

export function registerAttributionTools(server: McpServer, client: MetrxApiClient): void {
  // ── attribute_task ──
  server.registerTool(
    'attribute_task',
    {
      title: 'Attribute Task to Outcome',
      description:
        'Link an agent task/event to a business outcome for ROI tracking. ' +
        'This creates a mapping between agent actions and measurable business results. ' +
        'Do NOT use for reading attribution data — use get_attribution_report or get_task_roi.',
      inputSchema: {
        agent_id: z.string().uuid().describe('The agent UUID to attribute'),
        event_id: z.string().optional().describe('Optional: specific event/task ID to attribute'),
        outcome_type: z
          .enum(['revenue', 'cost_saving', 'efficiency', 'quality'])
          .describe('Type of outcome'),
        outcome_source: z
          .enum(['stripe', 'calendly', 'hubspot', 'zendesk', 'webhook', 'manual'])
          .describe('Source of the outcome data'),
        value_cents: z.number().int().optional().describe('Outcome value in cents'),
        description: z.string().optional().describe('Optional description of the outcome'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agent_id, event_id, outcome_type, outcome_source, value_cents, description }) => {
      const body: Record<string, unknown> = {
        agent_id,
        outcome_type,
        outcome_source,
      };

      if (event_id) body.event_id = event_id;
      if (value_cents !== undefined) body.value_cents = value_cents;
      if (description) body.description = description;

      const result = await client.post<AttributionResponse>('/outcomes', body);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error attributing task: ${result.error}` }],
          isError: true,
        };
      }

      const outcome = result.data!;
      const lines: string[] = ['## Task Attributed Successfully', ''];
      lines.push(`- **Outcome Type**: ${outcome.outcome_type}`);
      lines.push(`- **Source**: ${outcome.outcome_source}`);
      if (outcome.value_cents) {
        const formatted = (outcome.value_cents / 100).toFixed(2);
        lines.push(`- **Value**: $${formatted}`);
      }
      if (outcome.description) {
        lines.push(`- **Description**: ${outcome.description}`);
      }
      lines.push(`- **Created**: ${new Date(outcome.created_at).toLocaleString()}`);

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // ── get_task_roi ──
  server.registerTool(
    'get_task_roi',
    {
      title: 'Get Agent ROI',
      description:
        'Calculate return on investment for an agent. Shows total costs (LLM API calls), ' +
        'total outcomes (attributed business value), ROI multiplier, and breakdown by model and outcome type. ' +
        'Useful for identifying which agents generate the most value per dollar spent. ' +
        'Do NOT use for fleet-wide ROI — use generate_roi_audit for that.',
      inputSchema: {
        agent_id: z.string().uuid().describe('The agent UUID to calculate ROI for'),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe('Number of days to analyze (default: 30)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, days }) => {
      const periodDays = days ?? 30;
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

      const result = await client.get<{
        costs: {
          total_microcents: number;
          by_model: Record<string, number>;
          avg_per_request: number;
        };
        outcomes: {
          count: number;
          total_value_cents: number;
          by_type: Record<string, number>;
        };
        roi_multiplier: number;
        weighted_avg_confidence: number;
      }>(`/agents/${agent_id}/roi`, {
        start_date: startDate,
        end_date: endDate,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error calculating ROI: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      const totalCostDollars = (data.costs.total_microcents / 1_000_000).toFixed(2);
      const totalOutcomeDollars = (data.outcomes.total_value_cents / 100).toFixed(2);
      const avgCostDollars = (data.costs.avg_per_request / 100).toFixed(4);

      const lines: string[] = [
        `## Agent ROI Analysis (Last ${periodDays} days)`,
        '',
        `### Costs: $${totalCostDollars}`,
        `- Average per request: $${avgCostDollars}`,
      ];

      // Cost by model breakdown
      const modelEntries = Object.entries(data.costs.by_model);
      if (modelEntries.length > 0) {
        lines.push('- By model:');
        for (const [model, microcents] of modelEntries) {
          lines.push(`  - ${model}: $${(microcents / 1_000_000).toFixed(2)}`);
        }
      }

      lines.push('', `### Outcomes: $${totalOutcomeDollars} (${data.outcomes.count} total)`);

      // Outcome by type breakdown
      const typeEntries = Object.entries(data.outcomes.by_type);
      if (typeEntries.length > 0) {
        lines.push('- By type:');
        for (const [type, cents] of typeEntries) {
          lines.push(`  - ${type}: $${(cents / 100).toFixed(2)}`);
        }
      }

      lines.push('', '### ROI');
      lines.push(`- **ROI Multiplier**: ${data.roi_multiplier.toFixed(2)}x`);
      lines.push(
        `- **Avg Attribution Confidence**: ${(data.weighted_avg_confidence * 100).toFixed(0)}%`
      );

      if (data.roi_multiplier >= 1) {
        lines.push(
          '',
          `> ✅ This agent generates $${data.roi_multiplier.toFixed(
            2
          )} in value for every $1 spent.`
        );
      } else if (data.roi_multiplier > 0) {
        lines.push(
          '',
          `> ⚠️ This agent returns ${(data.roi_multiplier * 100).toFixed(
            0
          )}¢ per $1 spent. Consider optimizing costs or improving outcome attribution.`
        );
      } else {
        lines.push('', `> 📊 No attributed outcomes yet. Connect outcomes to start measuring ROI.`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // ── get_attribution_report ──
  server.registerTool(
    'get_attribution_report',
    {
      title: 'Get Attribution Report',
      description:
        'Get attribution report showing which agent actions led to business outcomes. ' +
        'Shows outcome counts, total values, confidence scores, and top contributing agents. ' +
        'Do NOT use for board-level reporting — use generate_roi_audit for formal audit reports.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Optional: filter to specific agent (omit for fleet-wide)'),
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe('Number of days to include (default: 30)'),
        model: z
          .enum(['direct', 'last_touch', 'first_touch'])
          .default('direct')
          .describe('Attribution model to use (default: direct)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, days, model }) => {
      const params: Record<string, string | number> = {
        days: days ?? 30,
        model: model ?? 'direct',
      };
      if (agent_id) params.agent_id = agent_id;

      const result = await client.get<AttributionReportResponse>('/outcomes', params);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching attribution report: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      const lines: string[] = [
        '## Attribution Report',
        `### Period: Last ${data.period_days} days | Model: ${data.model}`,
        '',
      ];

      if (data.agent_id) {
        lines.push(`**Agent**: ${data.agent_id}`, '');
      } else {
        lines.push('**Scope**: Fleet-wide (all agents)', '');
      }

      lines.push(`**Total Outcomes**: ${data.total_outcomes}`, '');
      const totalRevenue = (data.total_value_cents / 100).toFixed(2);
      lines.push(`**Total Value**: $${totalRevenue}`, '');

      if (data.outcomes.length === 0) {
        lines.push('No outcomes recorded in this period.');
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      }

      lines.push('', '### Outcome Breakdown');
      for (const outcome of data.outcomes) {
        lines.push('', `#### ${outcome.outcome_type}`);
        lines.push(`- **Count**: ${outcome.count}`);
        const value = (outcome.value_cents / 100).toFixed(2);
        lines.push(`- **Total Value**: $${value}`);
        lines.push(`- **Confidence**: ${(outcome.confidence * 100).toFixed(0)}%`);

        if (outcome.top_attributions && outcome.top_attributions.length > 0) {
          lines.push('- **Top Agents**:');
          for (const attr of outcome.top_attributions) {
            const attrValue = (attr.contribution_value_cents / 100).toFixed(2);
            const attrConf = (attr.confidence * 100).toFixed(0);
            lines.push(`  - ${attr.agent_name} [${attr.agent_id}]: $${attrValue} (${attrConf}%)`);
          }
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );
}
