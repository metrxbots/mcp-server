/**
 * Alert Configuration Tools
 *
 * Tools for setting up cost and operational alert thresholds
 * that trigger notifications or pause agents automatically.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import { formatCents } from '../services/formatters.js';

export function registerAlertConfigTools(server: McpServer, client: MetrxApiClient): void {
  // ── configure_alert_threshold ──
  server.registerTool(
    'configure_alert_threshold',
    {
      title: 'Configure Alert Threshold',
      description:
        'Set up cost or operational alert thresholds for a specific agent or org-wide. ' +
        'Alerts can trigger email notifications, webhooks, or automatically pause the agent. ' +
        'Use for real-time cost governance and operational safety. Thresholds run server-side automatically. ' +
        'Do NOT use for viewing current alerts — use get_alerts instead.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Specific agent UUID to configure alerts for. Omit for org-wide alerts.'),
        metric: z
          .enum(['daily_cost', 'monthly_cost', 'error_rate', 'latency_p99'])
          .describe('Metric to monitor'),
        threshold_value: z
          .number()
          .positive()
          .describe(
            'Threshold value. For costs: cents (e.g., 500000 = $5000). ' +
              'For rates: decimal (e.g., 0.1 = 10%). For latency: ms.'
          ),
        action: z
          .enum(['email', 'webhook', 'pause_agent'])
          .describe('Action to trigger when threshold is breached'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, metric, threshold_value, action }) => {
      const scope = agent_id ? `agent/${agent_id}` : 'org-wide';
      const path = agent_id ? `/agents/${agent_id}/alerts` : '/alerts/thresholds';

      const body: Record<string, unknown> = {
        metric,
        threshold_value,
        action,
      };

      const result = await client.post<{
        configured: boolean;
        threshold_id: string;
        message: string;
      }>(path, body);

      if (result.error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error configuring alert threshold: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      const data = result.data!;
      if (!data.configured) {
        return {
          content: [
            {
              type: 'text',
              text: `Alert configuration failed: ${data.message || 'Unknown reason'}`,
            },
          ],
          isError: true,
        };
      }

      const text = formatAlertConfigResponse(
        data.threshold_id,
        scope,
        metric,
        threshold_value,
        action
      );

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

/**
 * Format alert configuration confirmation response.
 */
function formatAlertConfigResponse(
  thresholdId: string,
  scope: string,
  metric: string,
  thresholdValue: number,
  action: string
): string {
  const lines: string[] = ['## Alert Threshold Configured', ''];

  lines.push(`**Threshold ID**: ${thresholdId}`);
  lines.push(`**Scope**: ${scope}`);
  lines.push(`**Metric**: ${metric}`);

  // Format threshold value based on metric type
  let thresholdDisplay = '';
  if (metric === 'daily_cost' || metric === 'monthly_cost') {
    thresholdDisplay = formatCents(thresholdValue);
  } else if (metric === 'error_rate') {
    thresholdDisplay = `${(thresholdValue * 100).toFixed(2)}%`;
  } else if (metric === 'latency_p99') {
    thresholdDisplay = `${thresholdValue.toFixed(0)}ms`;
  }

  lines.push(`**Threshold**: ${thresholdDisplay}`);
  lines.push(`**Action**: ${action}`);
  lines.push('');

  lines.push('### Behavior');
  switch (action) {
    case 'email':
      lines.push(
        'When the threshold is breached, an email notification will be sent to account owners.'
      );
      break;
    case 'webhook':
      lines.push(
        'When the threshold is breached, a POST request will be sent to configured webhook endpoints.'
      );
      break;
    case 'pause_agent':
      lines.push(
        'When the threshold is breached, the agent will be automatically paused to prevent further spend.'
      );
      break;
  }

  lines.push('');
  lines.push(`✅ Alert threshold is now active and being monitored in real-time.`);

  return lines.join('\n');
}
