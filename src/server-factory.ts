/**
 * MCP Server Factory
 *
 * Creates a fully-configured McpServer instance with all 23 Metrx tools registered.
 * Used by both the stdio CLI entrypoint and the Streamable HTTP endpoint.
 *
 * @module server-factory
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { MetrxApiClient } from './services/api-client.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerOptimizationTools } from './tools/optimization.js';
import { registerBudgetTools } from './tools/budgets.js';
import { registerAlertTools } from './tools/alerts.js';
import { registerExperimentTools } from './tools/experiments.js';
import { registerCostLeakDetectorTools } from './tools/cost-leak-detector.js';
import { registerAttributionTools } from './tools/attribution.js';
import { registerUpgradeJustificationTools } from './tools/upgrade-justification.js';
import { registerAlertConfigTools } from './tools/alert-config.js';
import { registerROIAuditTools } from './tools/roi-audit.js';

/**
 * In-memory rate limiter using sliding window algorithm.
 * Tracks tool executions per minute.
 */
class RateLimiter {
  private readonly windowMs = 60 * 1000; // 1 minute
  private readonly maxRequests = 60; // 60 requests per minute per tool
  private readonly requests: Map<string, number[]> = new Map();

  isAllowed(toolName: string): boolean {
    const now = Date.now();
    const key = toolName;

    if (!this.requests.has(key)) {
      this.requests.set(key, [now]);
      return true;
    }

    const timestamps = this.requests.get(key)!;
    const validTimestamps = timestamps.filter((ts) => now - ts < this.windowMs);

    if (validTimestamps.length < this.maxRequests) {
      validTimestamps.push(now);
      this.requests.set(key, validTimestamps);
      return true;
    }

    return false;
  }
}

/**
 * Creates a fully-configured McpServer with all Metrx tools registered.
 *
 * @param apiKey - The Metrx API key for authenticating tool calls
 * @param apiUrl - Optional API base URL override (default: https://metrxbot.com/api/v1)
 * @returns A configured McpServer ready to be connected to a transport
 */
export function createMcpServer(apiKey: string, apiUrl?: string): McpServer {
  const apiClient = new MetrxApiClient(apiKey, apiUrl);
  const rateLimiter = new RateLimiter();

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Add rate limiting middleware + metrx_ namespace prefix
  const METRX_PREFIX = 'metrx_';
  const originalRegisterTool = server.registerTool.bind(server);
  (server as any).registerTool = function (
    name: string,
    config: any,
    handler: (...handlerArgs: any[]) => Promise<any>
  ) {
    const wrappedHandler = async (...handlerArgs: any[]) => {
      if (!rateLimiter.isAllowed(name)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Rate limit exceeded for tool '${name}'. Maximum 60 requests per minute allowed.`,
            },
          ],
          isError: true,
        };
      }
      return handler(...handlerArgs);
    };

    // Register with metrx_ prefix (primary name only — no deprecated aliases)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;
    originalRegisterTool(prefixedName, config, wrappedHandler);
  };

  // Register all tool domains
  registerDashboardTools(server, apiClient);
  registerOptimizationTools(server, apiClient);
  registerBudgetTools(server, apiClient);
  registerAlertTools(server, apiClient);
  registerExperimentTools(server, apiClient);
  registerCostLeakDetectorTools(server, apiClient);
  registerAttributionTools(server, apiClient);
  registerUpgradeJustificationTools(server, apiClient);
  registerAlertConfigTools(server, apiClient);
  registerROIAuditTools(server, apiClient);

  // ── MCP Prompts ──
  // Pre-built prompt templates that help users interact with Metrx tools.

  server.registerPrompt(
    'analyze-costs',
    {
      title: 'Analyze AI Agent Costs',
      description:
        'Get a comprehensive overview of your AI agent costs including spend breakdown, ' +
        'top-spending agents, error rates, and optimization opportunities.',
      argsSchema: {
        period_days: z
          .string()
          .optional()
          .describe('Number of days to analyze (default: 30). Examples: "7", "30", "90"'),
      },
    },
    async ({ period_days }) => {
      const days = period_days ? parseInt(period_days, 10) : 30;
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text:
                `Analyze my AI agent costs for the last ${days} days. ` +
                'Start by calling metrx_get_cost_summary, then metrx_list_agents to see all agents, ' +
                'and metrx_get_optimization_recommendations for savings. ' +
                'Summarize: total spend, top 3 spending agents, error rates, and top optimization opportunities.',
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'find-savings',
    {
      title: 'Find Cost Savings',
      description:
        'Discover optimization opportunities across your AI agent fleet. ' +
        'Identifies model downgrades, caching opportunities, and routing improvements.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Find cost savings across my AI agents. ' +
              'Call metrx_get_optimization_recommendations to find opportunities, ' +
              'then metrx_run_cost_leak_scan to detect waste patterns. ' +
              'For each finding, explain the potential savings in dollars and how to fix it.',
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'cost-leak-scan',
    {
      title: 'Run Cost Leak Scan',
      description:
        'Scan for waste patterns in your AI agent operations — retry storms, ' +
        'oversized contexts, model mismatch, and missing caching.',
      argsSchema: {
        agent_id: z
          .string()
          .optional()
          .describe('Optional agent ID (UUID) to scan a specific agent. Omit to scan all.'),
      },
    },
    async ({ agent_id }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: agent_id
              ? `Run a cost leak scan for agent ${agent_id} using metrx_run_cost_leak_scan. ` +
                'Show the MetrxScore, list all detected leaks with severity, and suggest fixes for each.'
              : 'Run a cost leak scan across all agents using metrx_run_cost_leak_scan. ' +
                'Show the MetrxScore, list all detected leaks ranked by severity, ' +
                'and provide a prioritized action plan to fix the top waste patterns.',
          },
        },
      ],
    })
  );

  return server;
}
