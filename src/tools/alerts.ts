/**
 * Alert & Monitoring Tools
 *
 * Tools for viewing active alerts, failure predictions,
 * and acknowledging/resolving issues.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { AlertEvent, FailurePrediction } from '../types.js';
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
        'Do NOT use for configuring alert triggers — use configure_alert_threshold for that.',
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

      const alerts = result.data?.alerts || [];
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
  server.registerTool(
    'get_failure_predictions',
    {
      title: 'Get Failure Predictions',
      description:
        'Get predictive failure analysis for your agents. ' +
        'Shows upcoming risk of error rate breaches, latency degradation, ' +
        'cost overruns, rate limit risks, and budget exhaustion. ' +
        'Each prediction includes confidence level and recommended actions. ' +
        'Do NOT use for current/past failures — use get_alerts for active issues.',
      inputSchema: {
        agent_id: z.string().uuid().optional().describe('Filter predictions for a specific agent'),
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .describe('Filter by prediction severity'),
        status: z
          .enum(['active', 'acknowledged', 'resolved'])
          .default('active')
          .describe('Filter by prediction status (default: active)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, severity, status }) => {
      const params: Record<string, string> = {
        status: status ?? 'active',
      };
      if (agent_id) params.agent_id = agent_id;
      if (severity) params.severity = severity;

      const result = await client.get<{ predictions: FailurePrediction[] }>('/predictions', params);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching predictions: ${result.error}` }],
          isError: true,
        };
      }

      const predictions = result.data?.predictions || [];
      const text = formatPredictions(predictions);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}
