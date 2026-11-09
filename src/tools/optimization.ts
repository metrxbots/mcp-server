/**
 * Optimization & Recommendation Tools
 *
 * Cost optimization recommendations (read-only).
 *
 * apply_optimization, route_model and compare_models were removed in W1-4b:
 * they called /api/agents/{id}/settings, /api/agents/{id}/route and
 * /api/agents/models/compare, none of which has ever existed, so every call
 * failed. No other route does those jobs, so the tools are gone rather than
 * repointed.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { FleetSuggestionsResult, OptimizationResult } from '../types.js';
import { formatFleetOptimizations, formatOptimizations } from '../services/formatters.js';

export function registerOptimizationTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_optimization_recommendations ──
  server.registerTool(
    'get_optimization_recommendations',
    {
      title: 'Get Optimization Recommendations',
      description:
        'Get AI-powered cost optimization recommendations for a specific agent or your entire fleet. ' +
        'Returns actionable suggestions including model switching, token guardrails, provider arbitrage, ' +
        'batch processing opportunities, and revenue intelligence insights. ' +
        'Each suggestion includes estimated monthly savings and confidence level. ' +
        'Read-only: it recommends, it does not change anything. To test a model switch, record ' +
        'an experiment with create_model_experiment.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Specific agent to analyze. Omit for fleet-wide recommendations.'),
        include_revenue: z
          .boolean()
          .default(true)
          .describe('Include revenue-side insights (R3, R4, R6) in addition to cost optimizations'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, include_revenue }) => {
      if (!agent_id) {
        // Fleet: /dashboard has no optimization block, so the fleet branch
        // read undefined and always answered "running efficiently". The
        // fleet-wide view is /dashboard/suggestions — every agent's stored
        // row under the current savings definition, with the same total the
        // dashboard shows (savings definition v2).
        const fleet = await client.get<FleetSuggestionsResult>('/dashboard/suggestions', {
          limit: '10',
        });
        if (fleet.error) {
          return {
            content: [{ type: 'text', text: `Error fetching recommendations: ${fleet.error}` }],
            isError: true,
          };
        }
        const data = fleet.data
          ? {
              ...fleet.data,
              suggestions: Array.isArray(fleet.data.suggestions) ? fleet.data.suggestions : [],
            }
          : undefined;
        const recalculating = (data?.recalculating_agent_count ?? 0) > 0;
        if (!data || (data.suggestions.length === 0 && !recalculating)) {
          return {
            content: [
              {
                type: 'text',
                text:
                  data?.message ??
                  'No fleet-wide optimization recommendations. Your agents are running efficiently.',
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: formatFleetOptimizations(data) }] };
      }

      const path = `/agents/${agent_id}/metrics`;

      const params: Record<string, string | boolean> = {
        include_optimization: true,
      };
      if (include_revenue !== undefined) {
        params.include_revenue = include_revenue;
      }

      const result = await client.get<{
        optimization?: OptimizationResult;
      }>(path, params as Record<string, string>);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching recommendations: ${result.error}` }],
          isError: true,
        };
      }

      const optimization = result.data?.optimization;
      if (
        optimization &&
        (optimization.status === 'stale_definition' ||
          optimization.total_monthly_savings_cents === null)
      ) {
        // A row written under an older savings definition has no total — say
        // why, never "well-optimized" and never $0.
        return { content: [{ type: 'text', text: formatOptimizations(optimization) }] };
      }
      if (!optimization || optimization.suggestion_count === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No optimization recommendations for this agent. The agent may be already well-optimized or may not have enough data yet.`,
            },
          ],
        };
      }

      const text = formatOptimizations(optimization);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}
