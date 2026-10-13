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

/**
 * Shape returned by GET /api/outcomes (agentledger apps/web/app/api/outcomes/route.ts).
 * The MCP `get_attribution_report` tool aggregates this flat list client-side.
 */
interface OutcomesListResponse {
  data: Array<{
    id: string;
    outcome_type: string;
    occurred_at: string;
    value_cents: number | null;
    effective_value_cents: number | null;
    source: string | null;
    attribution_count: number | null;
    agents: { id: string; name: string; agent_key: string; category: string } | null;
  }>;
  meta: { count: number; days: number };
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
        // Attribution money is optional: a plan without full attribution may omit it, and
        // roi_multiplier / weighted_avg_confidence are null when there is nothing to divide.
        outcomes?: {
          count?: number;
          total_value_cents?: number;
          by_type?: Record<string, number>;
        };
        /** Attributed revenue ÷ AI cost (a return multiple); null when either is 0. */
        roi_multiplier?: number | null;
        weighted_avg_confidence?: number | null;
      }>(`/agents/${agent_id}/roi`, {
        // Send both so we stay compatible with older backends (which only honor `days`)
        // and the current backend (which honors start_date/end_date when present).
        days: periodDays,
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
      // 1 dollar = 1,000,000 microcents (1 cent = 10,000 microcents).
      // Source of truth: apps/gateway/src/cost.ts.
      const totalCostDollars = (data.costs.total_microcents / 1_000_000).toFixed(2);
      // avg_per_request is in cents (see agentledger apps/web/lib/attribution/roi.ts).
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
          lines.push(`  - ${model}: $${((microcents as number) / 1_000_000).toFixed(2)}`);
        }
      }

      const outcomes = data.outcomes;
      const revenueCents =
        typeof outcomes?.total_value_cents === 'number' ? outcomes.total_value_cents : undefined;

      if (revenueCents === undefined) {
        // Absent = the plan does not include attributed revenue. Say so; never "$0.00".
        lines.push('', '### Attributed Revenue', '- Not included in your plan.');
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      }

      const outcomeCount = typeof outcomes?.count === 'number' ? outcomes.count : 0;
      lines.push(
        '',
        `### Attributed Revenue: $${(revenueCents / 100).toFixed(2)} (${outcomeCount} outcomes)`
      );

      // Outcome by type breakdown
      const typeEntries = Object.entries(outcomes?.by_type ?? {});
      if (typeEntries.length > 0) {
        lines.push('- By type:');
        for (const [type, cents] of typeEntries) {
          lines.push(`  - ${type}: $${(cents / 100).toFixed(2)}`);
        }
      }

      const multiple = typeof data.roi_multiplier === 'number' ? data.roi_multiplier : null;
      lines.push('', '### Return');
      lines.push(
        `- **Attributed revenue multiple** (attributed revenue ÷ AI cost): ${
          multiple === null ? 'n/a (no attributed revenue or no cost)' : `${multiple.toFixed(2)}x`
        }`
      );
      lines.push(
        `- **Avg Attribution Confidence**: ${
          typeof data.weighted_avg_confidence === 'number'
            ? `${(data.weighted_avg_confidence * 100).toFixed(0)}%`
            : 'n/a (no attributed outcomes)'
        }`
      );

      if (multiple !== null && multiple >= 1) {
        lines.push(
          '',
          `> ✅ This agent has $${multiple.toFixed(2)} of attributed revenue for every $1 of AI cost.`
        );
      } else if (multiple !== null && multiple > 0) {
        lines.push(
          '',
          `> ⚠️ This agent has ${(multiple * 100).toFixed(
            0
          )}¢ of attributed revenue per $1 of AI cost. Consider optimizing costs or improving outcome attribution.`
        );
      } else if (revenueCents > 0) {
        lines.push('', `> 📊 No AI cost recorded in this window, so there is no multiple to show.`);
      } else {
        lines.push('', `> 📊 No attributed revenue yet. Connect outcomes to start measuring return.`);
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
          .enum(['direct', 'session_direct', 'first_touch', 'last_touch'])
          .default('direct')
          .describe(
            'Attribution model preference. Note: the current /api/outcomes endpoint returns ' +
              'outcomes regardless of attribution method, so this is informational only. ' +
              'Canonical enum source: agentledger apps/web/lib/attribution/types.ts.'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, days, model }) => {
      const periodDays = days ?? 30;
      // /api/outcomes only honors `days`; agent filtering and aggregation are done client-side.
      const result = await client.get<OutcomesListResponse>('/outcomes', { days: periodDays });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching attribution report: ${result.error}` }],
          isError: true,
        };
      }

      const raw = result.data?.data ?? [];
      const filtered = agent_id ? raw.filter((o) => o.agents?.id === agent_id) : raw;

      // Aggregate: per outcome_type → count, sum(value), per-agent contribution.
      type AgentAgg = { agent_id: string; agent_name: string; contribution_value_cents: number };
      type TypeAgg = {
        outcome_type: string;
        count: number;
        value_cents: number;
        agents: Map<string, AgentAgg>;
      };
      const byType = new Map<string, TypeAgg>();
      let totalValueCents = 0;

      for (const o of filtered) {
        const value = o.effective_value_cents ?? o.value_cents ?? 0;
        totalValueCents += value;
        let agg = byType.get(o.outcome_type);
        if (!agg) {
          agg = { outcome_type: o.outcome_type, count: 0, value_cents: 0, agents: new Map() };
          byType.set(o.outcome_type, agg);
        }
        agg.count += 1;
        agg.value_cents += value;
        if (o.agents) {
          const existing = agg.agents.get(o.agents.id);
          if (existing) {
            existing.contribution_value_cents += value;
          } else {
            agg.agents.set(o.agents.id, {
              agent_id: o.agents.id,
              agent_name: o.agents.name,
              contribution_value_cents: value,
            });
          }
        }
      }

      const lines: string[] = [
        '## Attribution Report',
        `### Period: Last ${periodDays} days | Model: ${model ?? 'direct'}`,
        '',
      ];

      if (agent_id) {
        lines.push(`**Agent**: ${agent_id}`, '');
      } else {
        lines.push('**Scope**: Fleet-wide (all agents)', '');
      }

      lines.push(`**Total Outcomes**: ${filtered.length}`, '');
      lines.push(`**Total Value**: $${(totalValueCents / 100).toFixed(2)}`, '');

      if (byType.size === 0) {
        lines.push('No outcomes recorded in this period.');
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      lines.push('', '### Outcome Breakdown');
      const sortedTypes = [...byType.values()].sort((a, b) => b.value_cents - a.value_cents);
      for (const t of sortedTypes) {
        lines.push('', `#### ${t.outcome_type}`);
        lines.push(`- **Count**: ${t.count}`);
        lines.push(`- **Total Value**: $${(t.value_cents / 100).toFixed(2)}`);

        const topAgents = [...t.agents.values()]
          .sort((a, b) => b.contribution_value_cents - a.contribution_value_cents)
          .slice(0, 5);
        if (topAgents.length > 0) {
          lines.push('- **Top Agents**:');
          for (const a of topAgents) {
            const attrValue = (a.contribution_value_cents / 100).toFixed(2);
            lines.push(`  - ${a.agent_name} [${a.agent_id}]: $${attrValue}`);
          }
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );
}
