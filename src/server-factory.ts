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
import { RateLimiter } from './middleware/rate-limiter.js';

/**
 * Minimal interface that any API client (real or demo) must satisfy.
 * Uses structural typing — no `implements` keyword needed.
 */
export interface ApiClientLike {
  get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<{ data?: T; error?: string }>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<{ data?: T; error?: string }>;
  patch<T>(path: string, body?: Record<string, unknown>): Promise<{ data?: T; error?: string }>;
}

/**
 * Creates a fully-configured McpServer with all Metrx tools registered.
 *
 * @param apiKey - The Metrx API key for authenticating tool calls
 * @param apiUrl - Optional API base URL override (default: https://metrxbot.com/api/v1)
 * @returns A configured McpServer ready to be connected to a transport
 */
export function createMcpServer(apiKey: string, apiUrl?: string): McpServer;
/**
 * Creates a fully-configured McpServer using a pre-built API client.
 * Used for demo mode where DemoApiClient provides mock data.
 *
 * @param client - A pre-built API client (real MetrxApiClient or DemoApiClient)
 * @returns A configured McpServer ready to be connected to a transport
 */
export function createMcpServer(client: ApiClientLike, options?: { isDemo?: boolean }): McpServer;
export function createMcpServer(apiKeyOrClient: string | ApiClientLike, apiUrlOrOptions?: string | { isDemo?: boolean }): McpServer {
  const apiClient = typeof apiKeyOrClient === 'string'
    ? new MetrxApiClient(apiKeyOrClient, typeof apiUrlOrOptions === 'string' ? apiUrlOrOptions : undefined)
    : apiKeyOrClient;
  const isDemo = typeof apiKeyOrClient !== 'string' && typeof apiUrlOrOptions === 'object' && apiUrlOrOptions?.isDemo === true;
  const rateLimiter = new RateLimiter();
  let demoToolCallCount = 0;

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
      const result = await handler(...handlerArgs);

      // In demo mode, append a subtle upgrade CTA every 5 tool calls
      if (isDemo) {
        demoToolCallCount++;
        if (demoToolCallCount % 5 === 0 && result?.content?.length > 0) {
          result.content.push({
            type: 'text' as const,
            text: '\n---\n💡 You\'re using demo data. Connect real agents to track actual costs → https://app.metrxbot.com/sign-up?source=mcp-demo',
          });
        }
      }

      return result;
    };

    // Register with metrx_ prefix (primary name only — no deprecated aliases)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;
    originalRegisterTool(prefixedName, config, wrappedHandler);
  };

  // Register all tool domains
  // Cast to any for duck-typing compatibility with DemoApiClient
  const client = apiClient as any;
  registerDashboardTools(server, client);
  registerOptimizationTools(server, client);
  registerBudgetTools(server, client);
  registerAlertTools(server, client);
  registerExperimentTools(server, client);
  registerCostLeakDetectorTools(server, client);
  registerAttributionTools(server, client);
  registerUpgradeJustificationTools(server, client);
  registerAlertConfigTools(server, client);
  registerROIAuditTools(server, client);

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
