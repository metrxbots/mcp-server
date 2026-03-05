/**
 * Dashboard & Cost Summary Tools
 *
 * Tools for getting organizational overview, agent listings,
 * and cost breakdowns.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { DashboardSummary, AgentDetail } from '../types.js';
import { formatDashboard, formatAgentDetail, formatCents } from '../services/formatters.js';

export function registerDashboardTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_cost_summary ──
  server.registerTool(
    'get_cost_summary',
    {
      title: 'Get Cost Summary',
      description:
        'Get a comprehensive cost summary for your AI agent fleet. ' +
        'Returns total spend, call counts, error rates, agent breakdown, ' +
        'revenue attribution (if available), and optimization opportunities. ' +
        'Use this as the starting point for understanding your agent economics. ' +
        'Do NOT use for real-time per-request cost checking — use OpenTelemetry spans for that.',
      inputSchema: {
        period_days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(30)
          .describe('Number of days to include in the summary (default: 30)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ period_days }) => {
      const result = await client.get<DashboardSummary>('/dashboard', {
        period_days: period_days ?? 30,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching cost summary: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      const text = formatDashboard(data);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  // ── list_agents ──
  server.registerTool(
    'list_agents',
    {
      title: 'List Agents',
      description:
        'List all AI agents in your organization with their status, category, and cost. ' +
        'Optionally filter by status or category. Returns agent IDs needed for other tools. ' +
        'Do NOT use for detailed per-agent analysis — use get_agent_detail for that.',
      inputSchema: {
        status: z
          .enum(['active', 'idle', 'error', 'archived'])
          .optional()
          .describe('Filter by agent status'),
        category: z
          .string()
          .optional()
          .describe('Filter by agent category (e.g., "sales", "support", "engineering")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ status, category }) => {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (category) params.category = category;

      const result = await client.get<{ agents: AgentDetail[] }>('/agents', params);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error listing agents: ${result.error}` }],
          isError: true,
        };
      }

      const agents = result.data?.agents || [];
      if (agents.length === 0) {
        return {
          content: [{ type: 'text', text: 'No agents found matching the specified filters.' }],
        };
      }

      const lines: string[] = [`## Agents (${agents.length})`, ''];
      for (const agent of agents) {
        const cost = agent.monthly_cost_cents ? formatCents(agent.monthly_cost_cents) : 'N/A';
        const roi = agent.roi_multiplier ? ` | ${agent.roi_multiplier.toFixed(1)}x ROI` : '';
        lines.push(
          `- **${agent.name}** [${agent.agent_key}] — ${agent.status} | ${agent.category} | ${cost}/mo${roi}`
        );
        lines.push(`  ID: ${agent.id}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // ── get_agent_detail ──
  server.registerTool(
    'get_agent_detail',
    {
      title: 'Get Agent Detail',
      description:
        'Get detailed information about a specific agent including its model, ' +
        'framework, category, outcome configuration, and failure risk score. ' +
        'Do NOT use for fleet-wide overviews — use get_cost_summary instead.',
      inputSchema: {
        agent_id: z.string().uuid().describe('The agent UUID to look up'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id }) => {
      const result = await client.get<AgentDetail>(`/agents/${agent_id}`);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching agent: ${result.error}` }],
          isError: true,
        };
      }

      const text = formatAgentDetail(result.data!);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}
