/**
 * Budget Governance Tools
 *
 * Tools for managing spending limits, enforcement modes,
 * and budget status monitoring.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { BudgetStatus, BudgetConfig } from '../types.js';
import { formatBudgetStatus, formatMicrocents } from '../services/formatters.js';

export function registerBudgetTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_budget_status ──
  server.registerTool(
    'get_budget_status',
    {
      title: 'Get Budget Status',
      description:
        'Get the current status of all budget configurations. ' +
        'Shows spending vs limits, warning/exceeded counts, and enforcement modes. ' +
        'Use this to monitor spending governance across your agent fleet. ' +
        'Do NOT use for creating/changing budgets — use set_budget or update_budget_mode.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await client.get<BudgetStatus>('/budgets/status');

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching budget status: ${result.error}` }],
          isError: true,
        };
      }

      const text = formatBudgetStatus(result.data!);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  // ── set_budget ──
  server.registerTool(
    'set_budget',
    {
      title: 'Set Budget',
      description:
        'Create or update a budget configuration for an agent or the entire organization. ' +
        'Budgets enforce spending limits with configurable enforcement modes: ' +
        '"alert_only" (notify but don\'t block), "soft_block" (block with override), ' +
        'or "hard_block" (strict enforcement). Specify limits in dollars. ' +
        'Do NOT use just to change enforcement mode — use update_budget_mode for that.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Agent to set budget for. Omit for org-wide budget.'),
        period: z.enum(['daily', 'monthly']).describe('Budget period'),
        limit_dollars: z
          .number()
          .positive()
          .describe('Spending limit in dollars (e.g., 100 for $100/month)'),
        warning_pct: z
          .number()
          .int()
          .min(1)
          .max(99)
          .default(80)
          .describe('Percentage of limit that triggers a warning (default: 80)'),
        enforcement_mode: z
          .enum(['alert_only', 'soft_block', 'hard_block'])
          .default('alert_only')
          .describe('How to enforce the budget when exceeded'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, period, limit_dollars, warning_pct, enforcement_mode }) => {
      // Convert dollars to microcents (1 dollar = 100_000_000 microcents)
      const limit_microcents = Math.round(limit_dollars * 100_000_000);

      const body: Record<string, unknown> = {
        period,
        limit_microcents,
        warning_pct: warning_pct ?? 80,
        enforcement_mode: enforcement_mode ?? 'alert_only',
      };
      if (agent_id) body.agent_id = agent_id;

      const result = await client.post<BudgetConfig>('/budgets', body);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error setting budget: ${result.error}` }],
          isError: true,
        };
      }

      const b = result.data!;
      const scope = b.agent_id ? `agent ${b.agent_id}` : 'organization';

      return {
        content: [
          {
            type: 'text',
            text: `✅ Budget set for ${scope}: ${formatMicrocents(b.limit_microcents)}/${
              b.period
            } with ${b.enforcement_mode} enforcement. Warning at ${b.warning_pct}%.`,
          },
        ],
      };
    }
  );

  // ── update_budget_mode ──
  server.registerTool(
    'update_budget_mode',
    {
      title: 'Update Budget Mode',
      description:
        'Change the enforcement mode of an existing budget or pause/resume it. ' +
        'Use "alert_only" for monitoring, "soft_block" for overridable limits, ' +
        'or "hard_block" for strict enforcement. ' +
        'Do NOT use to create new budgets — use set_budget for that.',
      inputSchema: {
        budget_id: z.string().uuid().describe('The budget configuration ID to update'),
        enforcement_mode: z
          .enum(['alert_only', 'soft_block', 'hard_block'])
          .optional()
          .describe('New enforcement mode'),
        paused: z.boolean().optional().describe('Set to true to pause the budget, false to resume'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ budget_id, enforcement_mode, paused }) => {
      const body: Record<string, unknown> = {};
      if (enforcement_mode !== undefined) body.enforcement_mode = enforcement_mode;
      if (paused !== undefined) body.paused = paused;

      if (Object.keys(body).length === 0) {
        return {
          content: [
            { type: 'text', text: 'No changes specified. Provide enforcement_mode or paused.' },
          ],
          isError: true,
        };
      }

      const result = await client.patch<BudgetConfig>(`/budgets/${budget_id}`, body);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error updating budget: ${result.error}` }],
          isError: true,
        };
      }

      const _b = result.data!;
      const parts: string[] = ['✅ Budget updated:'];
      if (enforcement_mode) parts.push(`enforcement → ${enforcement_mode}`);
      if (paused !== undefined) parts.push(paused ? 'status → paused' : 'status → active');

      return {
        content: [{ type: 'text', text: parts.join(', ') }],
      };
    }
  );
}
