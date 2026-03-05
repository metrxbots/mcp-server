/**
 * Model Routing Experiment Tools
 *
 * Tools for creating and managing A/B tests comparing
 * different LLM models for cost/quality optimization.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { ModelRoutingExperiment } from '../types.js';
import { formatExperiment } from '../services/formatters.js';

export function registerExperimentTools(server: McpServer, client: MetrxApiClient): void {
  // ── create_model_experiment ──
  server.registerTool(
    'create_model_experiment',
    {
      title: 'Create Model Experiment',
      description:
        'Start an A/B test comparing two LLM models for a specific agent. ' +
        'Routes a percentage of traffic to the treatment model and tracks ' +
        'cost, latency, error rate, and quality metrics. The experiment runs ' +
        'until statistical significance is reached or the max duration expires. ' +
        'Do NOT use for one-off model comparisons — use compare_models for static pricing data.',
      inputSchema: {
        agent_id: z.string().uuid().describe('Agent to run the experiment on'),
        name: z.string().min(1).max(100).describe('Human-readable experiment name'),
        treatment_model: z
          .string()
          .describe('The candidate model to test (e.g., "gpt-4o-mini", "claude-haiku-4-20250414")'),
        traffic_pct: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Percentage of traffic to route to the treatment model (default: 10%)'),
        primary_metric: z
          .enum(['cost_per_call', 'latency_p50', 'latency_p95', 'error_rate', 'quality_score'])
          .default('cost_per_call')
          .describe('The primary metric to optimize for (default: cost_per_call)'),
        max_duration_days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(14)
          .describe('Maximum experiment duration in days (default: 14)'),
        auto_promote: z
          .boolean()
          .default(false)
          .describe('Automatically apply the winning model when the experiment concludes'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      agent_id,
      name,
      treatment_model,
      traffic_pct,
      primary_metric,
      max_duration_days,
      auto_promote,
    }) => {
      const body: Record<string, unknown> = {
        agent_id,
        name,
        treatment_model,
        traffic_pct: traffic_pct ?? 10,
        primary_metric: primary_metric ?? 'cost_per_call',
        max_duration_days: max_duration_days ?? 14,
        auto_promote: auto_promote ?? false,
      };

      const result = await client.post<ModelRoutingExperiment>('/experiments', body);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error creating experiment: ${result.error}` }],
          isError: true,
        };
      }

      const exp = result.data!;
      const text = [
        `✅ Experiment "${exp.name}" created.`,
        '',
        formatExperiment(exp),
        '',
        'The experiment will start routing traffic immediately. Use get_experiment_results to check progress.',
      ].join('\n');

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  // ── get_experiment_results ──
  server.registerTool(
    'get_experiment_results',
    {
      title: 'Get Experiment Results',
      description:
        'Get the current results of a model routing experiment. ' +
        'Shows sample counts, metric comparisons, statistical significance, ' +
        'and the current winner (if determined). ' +
        'Do NOT use for starting experiments — use create_model_experiment.',
      inputSchema: {
        agent_id: z.string().uuid().optional().describe('Filter experiments by agent'),
        status: z
          .enum(['running', 'paused', 'completed', 'cancelled'])
          .optional()
          .describe('Filter by experiment status'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, status }) => {
      const params: Record<string, string> = {};
      if (agent_id) params.agent_id = agent_id;
      if (status) params.status = status;

      const result = await client.get<{ experiments: ModelRoutingExperiment[] }>(
        '/experiments',
        params
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching experiments: ${result.error}` }],
          isError: true,
        };
      }

      const experiments = result.data?.experiments || [];
      if (experiments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No experiments found. Use create_model_experiment to start an A/B test.',
            },
          ],
        };
      }

      const texts = experiments.map(formatExperiment);

      return {
        content: [{ type: 'text', text: texts.join('\n\n---\n\n') }],
      };
    }
  );

  // ── stop_experiment ──
  server.registerTool(
    'stop_experiment',
    {
      title: 'Stop Experiment',
      description:
        'Stop a running model routing experiment. The experiment results are preserved. ' +
        'If the treatment model won, you can optionally promote it as the new default. ' +
        'Do NOT use for pausing experiments temporarily — stopping is permanent.',
      inputSchema: {
        experiment_id: z.string().uuid().describe('The experiment ID to stop'),
        promote_winner: z
          .boolean()
          .default(false)
          .describe('If the treatment model won, apply it as the new default model'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ experiment_id, promote_winner }) => {
      const result = await client.post<{ status: string; promoted: boolean }>(
        `/experiments/${experiment_id}/stop`,
        { promote_winner: promote_winner ?? false }
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error stopping experiment: ${result.error}` }],
          isError: true,
        };
      }

      const d = result.data!;
      let text = `✅ Experiment stopped. Status: ${d.status}`;
      if (d.promoted) {
        text += '\n🔄 Treatment model has been promoted as the new default.';
      }

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}
