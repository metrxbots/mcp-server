/**
 * Model Routing Experiment Tools
 *
 * Read and manage the per-agent model routing experiments stored in
 * model_routing_experiments (migration 025), over the per-agent routes:
 *   GET   /api/agents/{agent_id}/experiments                  — list (requireAuth)
 *   POST  /api/agents/{agent_id}/experiments                  — create a DRAFT (requireAdmin)
 *   PATCH /api/agents/{agent_id}/experiments/{experiment_id}  — status change (requireAuth)
 *
 * Until W1-4b these tools called /api/experiments*, which has never existed —
 * every call 404'd. They now describe only what the routes above actually do:
 * creation records a DRAFT (no traffic is routed), there is no auto-promotion,
 * and stopping marks the experiment completed.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { ModelRoutingExperiment } from '../types.js';
import { formatExperiment } from '../services/formatters.js';

const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed', 'cancelled'] as const;

export function registerExperimentTools(server: McpServer, client: MetrxApiClient): void {
  // ── create_model_experiment ──
  server.registerTool(
    'create_model_experiment',
    {
      title: 'Create Model Experiment',
      description:
        "Record a DRAFT A/B experiment comparing an agent's current model (control) with a candidate " +
        '(treatment) model. Creating it does NOT start routing traffic: the experiment is stored with ' +
        "status 'draft'. If control_model is omitted, the API uses the model the agent ran most often " +
        'in the last 90 days (and refuses if it cannot determine one, or if it equals the treatment). ' +
        "Needs an API key with the 'admin' scope (an org owner or admin mints one in Settings → Security → API Keys). " +
        'Do NOT use to read results — use get_experiment_results.',
      inputSchema: {
        agent_id: z.string().uuid().describe('Agent (UUID) the experiment belongs to'),
        name: z.string().min(1).max(100).describe('Human-readable experiment name'),
        treatment_model: z
          .string()
          .min(1)
          .describe('The candidate model to test (e.g., "gpt-4o-mini", "claude-haiku-4-5")'),
        traffic_pct: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Planned percentage of traffic for the treatment model, 1-50 (default: 10)'),
        control_model: z
          .string()
          .min(1)
          .optional()
          .describe("Baseline model. Omit to use the agent's most-used model of the last 90 days."),
        description: z.string().max(1000).optional().describe('Optional free-text description'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ agent_id, name, treatment_model, traffic_pct, control_model, description }) => {
      const body: Record<string, unknown> = {
        name,
        treatment_model,
        traffic_pct: traffic_pct ?? 10,
      };
      if (control_model) body.control_model = control_model;
      if (description) body.description = description;

      const result = await client.post<ModelRoutingExperiment>(
        `/agents/${agent_id}/experiments`,
        body
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error creating experiment: ${result.error}` }],
          isError: true,
        };
      }

      const exp = result.data!;
      const text = [
        `✅ Experiment "${exp.name}" recorded as a ${exp.status ?? 'draft'}.`,
        '',
        formatExperiment(exp),
        '',
        'No traffic is routed while the experiment is a draft. Use get_experiment_results to read it back.',
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
        "List an agent's model routing experiments, newest first: status, control vs treatment " +
        'model with sample counts, traffic split, primary metric, significance, p-value and winner ' +
        '(control | treatment | inconclusive) where recorded. Optionally filter by status. ' +
        'Do NOT use for starting experiments — use create_model_experiment.',
      inputSchema: {
        agent_id: z.string().uuid().describe('Agent (UUID) whose experiments to list'),
        status: z
          .enum(EXPERIMENT_STATUSES)
          .optional()
          .describe('Only show experiments in this status'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, status }) => {
      const result = await client.get<ModelRoutingExperiment[]>(`/agents/${agent_id}/experiments`);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching experiments: ${result.error}` }],
          isError: true,
        };
      }

      const all = Array.isArray(result.data) ? result.data : [];
      const experiments = status ? all.filter((e) => e.status === status) : all;
      if (experiments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: status
                ? `No ${status} experiments for this agent (${all.length} in other statuses).`
                : 'No experiments for this agent. Use create_model_experiment to record one.',
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
        "Stop a model routing experiment by setting its status to 'completed'. Recorded results are " +
        'preserved. This does not promote either model — nothing changes about which model the agent ' +
        'runs. Do NOT use for pausing — completion is final.',
      inputSchema: {
        agent_id: z.string().uuid().describe('Agent (UUID) the experiment belongs to'),
        experiment_id: z.string().uuid().describe('The experiment ID to stop'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, experiment_id }) => {
      const result = await client.patch<ModelRoutingExperiment>(
        `/agents/${agent_id}/experiments/${experiment_id}`,
        { status: 'completed' }
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error stopping experiment: ${result.error}` }],
          isError: true,
        };
      }

      const d = result.data;
      return {
        content: [
          {
            type: 'text',
            text: `✅ Experiment ${d?.name ? `"${d.name}" ` : ''}stopped. Status: ${d?.status ?? 'completed'}`,
          },
        ],
      };
    }
  );
}
