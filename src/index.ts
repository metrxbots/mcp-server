#!/usr/bin/env node
/**
 * Metrx MCP Server
 *
 * AI agent cost intelligence tools for LLM agents.
 *
 * This MCP server exposes Metrx's cost optimization, budget governance,
 * model routing, and failure prediction capabilities as tools that any
 * MCP-compatible LLM agent can use.
 *
 * Transport: stdio (for local/CLI use)
 *
 * Environment variables:
 *   METRX_API_KEY  — Required. Your Metrx API key.
 *   METRX_API_URL  — Optional. Override the API base URL (default: https://metrxbot.com/api/v1).
 *
 * Usage:
 *   METRX_API_KEY=sk_metrx_xxx npx metrx-mcp
 *
 * Or in your MCP client configuration:
 *   {
 *     "mcpServers": {
 *       "metrx": {
 *         "command": "npx",
 *         "args": ["@metrxbot/mcp-server"],
 *         "env": { "METRX_API_KEY": "sk_metrx_xxx" }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

const rateLimiter = new RateLimiter();

async function main(): Promise<void> {
  // Initialize the API client
  // Throws if METRX_API_KEY is not set
  let apiClient: MetrxApiClient;
  try {
    apiClient = new MetrxApiClient();
  } catch (err) {
    console.error(
      'Error: METRX_API_KEY environment variable is required.\n' +
        'Set it before starting the server:\n' +
        '  METRX_API_KEY=sk_metrx_xxx npx @metrxbot/mcp-server\n' +
        '\n' +
        'Get your API key from https://metrxbot.com/settings/security'
    );
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Add rate limiting middleware + metrx_ namespace prefix
  // All tools are registered as metrx_{name} (primary) and {name} (backward-compat alias).
  // The alias will be removed in v0.3.0.
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

    // Register with metrx_ prefix (primary name)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;
    originalRegisterTool(prefixedName, config, wrappedHandler);

    // Register backward-compat alias without prefix (deprecated, remove in v0.3.0)
    const unprefixedName = name.startsWith(METRX_PREFIX) ? name.slice(METRX_PREFIX.length) : name;
    if (unprefixedName !== prefixedName) {
      const aliasConfig = {
        ...config,
        description: config.description + ' [DEPRECATED: Use ' + prefixedName + ' instead]',
      };
      originalRegisterTool(unprefixedName, aliasConfig, wrappedHandler);
    }
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

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
