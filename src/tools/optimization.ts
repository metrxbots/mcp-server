/**
 * Optimization & Recommendation Tools
 *
 * Tools for getting cost optimization recommendations,
 * applying one-click fixes, and comparing model alternatives.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { OptimizationResult } from '../types.js';
import { formatOptimizations } from '../services/formatters.js';

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
        'Do NOT use for implementing fixes — use apply_optimization for one-click fixes or create_model_experiment to validate first.',
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
      const path = agent_id ? `/agents/${agent_id}/metrics` : '/dashboard';

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
      if (!optimization || optimization.suggestion_count === 0) {
        return {
          content: [
            {
              type: 'text',
              text: agent_id
                ? `No optimization recommendations for this agent. The agent may be already well-optimized or may not have enough data yet.`
                : `No fleet-wide optimization recommendations. Your agents are running efficiently.`,
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

  // ── apply_optimization ──
  server.registerTool(
    'apply_optimization',
    {
      title: 'Apply Optimization',
      description:
        'Apply a one-click optimization recommendation to an agent. ' +
        'Only works for suggestions marked as "one_click: true". ' +
        'Common optimizations include setting max_tokens limits and switching models. ' +
        'Do NOT use for unvalidated changes — run create_model_experiment first if unsure about impact.',
      inputSchema: {
        agent_id: z.string().uuid().describe('The agent to apply the optimization to'),
        optimization_type: z
          .string()
          .describe('The type of optimization to apply (e.g., "token_guardrails", "model_switch")'),
        payload: z
          .record(z.unknown())
          .optional()
          .describe('Override the default optimization payload (advanced)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, optimization_type, payload }) => {
      const body: Record<string, unknown> = {
        optimization_type,
        ...(payload || {}),
      };

      const result = await client.post<{ applied: boolean; message: string }>(
        `/agents/${agent_id}/settings`,
        body
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error applying optimization: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.data?.applied
              ? `✅ Optimization "${optimization_type}" applied successfully to agent ${agent_id}. ${
                  result.data.message || ''
                }`
              : `⚠️ Optimization could not be applied: ${result.data?.message || 'Unknown reason'}`,
          },
        ],
      };
    }
  );

  // ── route_model ──
  server.registerTool(
    'route_model',
    {
      title: 'Route Model Selection',
      description:
        'Get a model routing recommendation for a specific task based on complexity. ' +
        "Uses the agent's historical performance data and cost analysis to suggest the optimal " +
        'model for each task complexity level. Helps reduce costs by routing simple tasks ' +
        'to cheaper models while keeping complex tasks on premium models. ' +
        'Do NOT use for comparing all models at once — use compare_models for static pricing.',
      inputSchema: {
        agent_id: z.string().uuid().describe('The agent to get routing recommendations for'),
        task_complexity: z
          .enum(['low', 'medium', 'high'])
          .describe(
            'Estimated task complexity: low (simple lookups/formatting), medium (analysis/summarization), high (reasoning/generation)'
          ),
        current_model: z
          .string()
          .optional()
          .describe(
            'Currently configured model (e.g., "gpt-4o"). If omitted, uses agent primary model.'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, task_complexity, current_model }) => {
      const params: Record<string, string> = {
        task_complexity,
      };
      if (current_model) params.current_model = current_model;

      const result = await client.get<{
        recommended_model: string;
        current_model: string;
        task_complexity: string;
        estimated_savings_pct: number;
        confidence: string;
        reason: string;
      }>(`/agents/${agent_id}/route`, params);

      if (result.error) {
        return {
          content: [
            { type: 'text', text: `Error getting routing recommendation: ${result.error}` },
          ],
          isError: true,
        };
      }

      const data = result.data!;
      const lines: string[] = [
        '## Model Routing Recommendation',
        '',
        `**Task Complexity**: ${data.task_complexity}`,
        `**Current Model**: ${data.current_model}`,
        `**Recommended Model**: ${data.recommended_model}`,
        '',
      ];

      if (data.recommended_model !== data.current_model) {
        lines.push(
          `**Estimated Savings**: ${data.estimated_savings_pct}%`,
          `**Confidence**: ${data.confidence}`,
          '',
          `> ${data.reason}`
        );
      } else {
        lines.push(
          `> Current model is already optimal for ${data.task_complexity} complexity tasks.`
        );
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // ── compare_models ──
  server.registerTool(
    'compare_models',
    {
      title: 'Compare Models',
      description:
        'Compare LLM model pricing and capabilities across providers. ' +
        'Returns pricing per 1M tokens, context window sizes, batch/cache support, ' +
        'and cost savings estimates for switching from a current model to alternatives. ' +
        'Works without any usage data (Day 0 value). ' +
        'Do NOT use for agent-specific recommendations — use get_optimization_recommendations which factors in actual usage patterns.',
      inputSchema: {
        current_model: z
          .string()
          .optional()
          .describe(
            'Current model to compare against (e.g., "gpt-4o", "claude-sonnet-4-20250514")'
          ),
        tier: z
          .enum(['frontier', 'balanced', 'efficient', 'budget'])
          .optional()
          .describe('Capability tier to filter alternatives'),
        provider: z
          .string()
          .optional()
          .describe('Filter to a specific provider (e.g., "openai", "anthropic", "google")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ current_model, tier, provider }) => {
      // This tool can work purely client-side using model-data,
      // but we route through the API for consistency
      const params: Record<string, string> = {};
      if (current_model) params.current_model = current_model;
      if (tier) params.tier = tier;
      if (provider) params.provider = provider;

      const result = await client.get<{
        models: Array<{
          model: string;
          provider: string;
          tier: string;
          input_cost_per_1m: number;
          output_cost_per_1m: number;
          context_window: number;
          supports_batch: boolean;
          supports_caching: boolean;
          savings_vs_current_pct?: number;
        }>;
        current_model_info?: {
          model: string;
          provider: string;
          input_cost_per_1m: number;
          output_cost_per_1m: number;
        };
      }>('/agents/models/compare', params);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error comparing models: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      const lines: string[] = ['## Model Comparison', ''];

      if (data.current_model_info) {
        const c = data.current_model_info;
        lines.push(
          `**Current**: ${c.model} (${c.provider}) — $${c.input_cost_per_1m}/M in, $${c.output_cost_per_1m}/M out`
        );
        lines.push('');
      }

      lines.push('### Alternatives');
      lines.push(
        '| Model | Provider | Tier | Input $/M | Output $/M | Context | Batch | Cache | Savings |'
      );
      lines.push(
        '|-------|----------|------|-----------|------------|---------|-------|-------|---------|'
      );

      for (const m of data.models) {
        const savings =
          m.savings_vs_current_pct !== undefined ? `${m.savings_vs_current_pct}%` : '—';
        lines.push(
          `| ${m.model} | ${m.provider} | ${m.tier} | $${m.input_cost_per_1m} | $${
            m.output_cost_per_1m
          } | ${(m.context_window / 1000).toFixed(0)}K | ${m.supports_batch ? '✓' : '✗'} | ${
            m.supports_caching ? '✓' : '✗'
          } | ${savings} |`
        );
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );
}
