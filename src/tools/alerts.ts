/**
 * Alert & Monitoring Tools
 *
 * Tools for viewing active alerts, failure predictions,
 * and acknowledging/resolving issues.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { AlertEvent, AgentPredictionsResponse } from '../types.js';
import { formatAlerts, formatPredictions } from '../services/formatters.js';

export function registerAlertTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_alerts ──
  server.registerTool(
    'get_alerts',
    {
      title: 'Get Alerts',
      description:
        'Get active alerts and notifications for your agent fleet. ' +
        'Includes cost spikes, error rate increases, budget warnings, ' +
        'and system health notifications. Optionally filter by severity. ' +
        'Do NOT use for forward-looking risk — use get_failure_predictions for that.',
      inputSchema: {
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .describe('Filter by alert severity'),
        unread_only: z
          .boolean()
          .default(true)
          .describe('Only return unread alerts (default: true)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe('Maximum number of alerts to return'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ severity, unread_only, limit }) => {
      const params: Record<string, string | number | boolean> = {
        limit: limit ?? 25,
      };
      if (severity) params.severity = severity;
      if (unread_only !== undefined) params.unread_only = unread_only;

      const result = await client.get<{ alerts: AlertEvent[] }>(
        '/alerts',
        params as Record<string, string>
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching alerts: ${result.error}` }],
          isError: true,
        };
      }

      // Transform API response shape (alert_type/read_at) → MCP shape (type/is_read)
      const rawAlerts = result.data?.alerts || [];
      const alerts: AlertEvent[] = rawAlerts.map((a: any) => ({
        ...a,
        type: a.type || a.alert_type,
        is_read: a.is_read ?? a.read_at != null,
      }));
      const text = formatAlerts(alerts);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );

  // ── acknowledge_alert ──
  server.registerTool(
    'acknowledge_alert',
    {
      title: 'Acknowledge Alert',
      description:
        'Mark one or more alerts as read/acknowledged. ' +
        'This removes them from the unread alerts list but preserves them in history. ' +
        'Do NOT use for resolving the underlying issue — take action on the alert first.',
      inputSchema: {
        alert_ids: z.array(z.string().uuid()).min(1).max(50).describe('Alert IDs to acknowledge'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ alert_ids }) => {
      const result = await client.patch<{ acknowledged: number }>('/alerts', {
        action: 'acknowledge',
        alert_ids,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error acknowledging alerts: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${result.data?.acknowledged || alert_ids.length} alert(s) acknowledged.`,
          },
        ],
      };
    }
  );

  // ── get_failure_predictions ──
  // GET /api/agents/{id}/optimization/predictions. Until W1-4b this tool called
  // /api/predictions, which has never existed (every call 404'd). The real route
  // is per agent and computes predictions on request from llm_events — there is
  // no stored prediction, so no status filter and no fleet-wide listing.
  server.registerTool(
    'get_failure_predictions',
    {
      title: 'Get Failure Predictions',
      description:
        'Predictive failure analysis for ONE agent, computed on request from its last 7 days of ' +
        'calls against a 30-day baseline: error-rate breaches, latency degradation, cost overruns ' +
        'and traffic anomalies, each with severity, confidence, trend and recommended actions. ' +
        'Needs at least 20 calls in the last 7 days — below that it returns no predictions, which ' +
        'means too little data, not a healthy agent. ' +
        'Do NOT use for current/past failures — use get_alerts for active issues.',
      inputSchema: {
        agent_id: z.string().uuid().describe('Agent (UUID) to analyze'),
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .describe('Only show predictions of this severity'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, severity }) => {
      const result = await client.get<AgentPredictionsResponse>(
        `/agents/${agent_id}/optimization/predictions`
      );

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching predictions: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data;
      const all = data?.predictions ?? [];
      const predictions = severity ? all.filter((p) => p.severity === severity) : all;
      const text = formatPredictions(predictions, {
        agent_id: data?.agent_id ?? agent_id,
        event_count: data?.event_count,
        computed_at: data?.computed_at,
      });

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}
