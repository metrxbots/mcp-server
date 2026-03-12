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
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { MetrxApiClient } from './services/api-client.js';
import { DemoApiClient } from './services/demo-client.js';
import { createMcpServer } from './server-factory.js';
import { loadApiKey, runAuthFlow } from './services/auth.js';
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

// ── --demo flag: run with mock data, no API key required ──
// Lets users try all 23 tools instantly without signing up.
if (process.argv.includes('--demo')) {
  runDemoServer().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else if (process.argv.includes('--auth')) {
// ── --auth flag: interactive CLI login flow ──
// Opens browser, prompts for API key, validates, saves to ~/.metrxrc.
  runAuthFlow().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else if (process.argv.includes('--test')) {
// ── --test flag: verify API key before stdio transport takes over ──
// Must run before anything touches stdin/stdout.
  (async () => {
    const RESET = '\x1b[0m';
    const BOLD = '\x1b[1m';
    const GREEN = '\x1b[32m';
    const RED = '\x1b[31m';
    const CYAN = '\x1b[36m';
    const DIM = '\x1b[2m';

    console.log(`\n${CYAN}${BOLD}Metrx MCP Server — Connection Test${RESET}\n`);
    console.log(`  Version: ${SERVER_VERSION}`);

    // Check API key — env var or ~/.metrxrc
    const apiKey = loadApiKey();
    if (!apiKey) {
      console.log(`\n  ${RED}✗ No API key found${RESET}`);
      console.log(`\n  ${DIM}Run ${BOLD}npx @metrxbot/mcp-server --auth${RESET}${DIM} to log in, or set METRX_API_KEY.${RESET}`);
      console.log(`\n  Sign up free:  ${CYAN}https://app.metrxbot.com/sign-up${RESET}`);
      console.log(`  Manage keys:   ${CYAN}https://app.metrxbot.com/settings/security${RESET}\n`);
      process.exit(1);
    }

    // Validate key format
    if (!apiKey.startsWith('sk_live_') && !apiKey.startsWith('sk_test_')) {
      console.log(`  ${RED}✗ API key format looks wrong${RESET} (expected sk_live_… or sk_test_…)`);
      console.log(`\n  Get a valid key at: ${CYAN}https://app.metrxbot.com/settings/security${RESET}\n`);
      process.exit(1);
    }
    console.log(`  API Key: ${DIM}${apiKey.slice(0, 12)}…${apiKey.slice(-4)}${RESET}`);

    // Attempt API ping
    console.log(`\n  Connecting to Metrx API…`);
    try {
      const client = new MetrxApiClient();
      const result = await client.ping();

      if (result.ok) {
        console.log(`  ${GREEN}${BOLD}✓ Connection successful!${RESET}`);
        console.log(`\n  Your MCP server is ready to use. Add this to your MCP client config:`);
        console.log(`\n  ${DIM}{`);
        console.log(`    "mcpServers": {`);
        console.log(`      "metrx": {`);
        console.log(`        "command": "npx",`);
        console.log(`        "args": ["@metrxbot/mcp-server"],`);
        console.log(`        "env": { "METRX_API_KEY": "${apiKey}" }`);
        console.log(`      }`);
        console.log(`    }`);
        console.log(`  }${RESET}\n`);
        process.exit(0);
      } else {
        console.log(`  ${RED}✗ Connection failed: ${result.error}${RESET}\n`);
        process.exit(1);
      }
    } catch (err) {
      console.log(`  ${RED}✗ ${err instanceof Error ? err.message : String(err)}${RESET}\n`);
      process.exit(1);
    }
  })();
} else {
  // Normal server startup
  runServer().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

const rateLimiter = new RateLimiter();

async function runServer(): Promise<void> {
  // Initialize the API client
  // Priority: METRX_API_KEY env var > ~/.metrxrc > error
  const resolvedKey = loadApiKey();

  let apiClient: MetrxApiClient;
  try {
    apiClient = new MetrxApiClient(resolvedKey || undefined);
  } catch (err) {
    console.error(
      'Error: No API key found.\n' +
        '\n' +
        'Option 1 — Interactive login (saves key for future use):\n' +
        '  npx @metrxbot/mcp-server --auth\n' +
        '\n' +
        'Option 2 — Environment variable:\n' +
        '  METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server\n' +
        '\n' +
        'Option 3 — Try demo mode (no signup):\n' +
        '  npx @metrxbot/mcp-server --demo\n' +
        '\n' +
        'Sign up free: https://app.metrxbot.com/sign-up\n' +
        'Manage keys:  https://app.metrxbot.com/settings/security'
    );
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // ── Rate limiting middleware + metrx_ namespace prefix ──
  // All tools are registered exclusively as metrx_{name}.
  // The metrx_ prefix namespaces our tools to avoid collisions when
  // multiple MCP servers are used together.
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

    // Register with metrx_ prefix (only — no deprecated aliases)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;
    originalRegisterTool(prefixedName, config, wrappedHandler);
  };

  // ── Register all tool domains ──
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

  // ── Connect via stdio transport ──
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

/**
 * Start the MCP server in demo mode with mock data.
 * No API key required — uses DemoApiClient with embedded fixtures.
 */
async function runDemoServer(): Promise<void> {
  const demoClient = new DemoApiClient();
  const server = createMcpServer(demoClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

// Note: runServer()/runDemoServer() is called conditionally above.
// --demo → runDemoServer(), --test → IIFE that exits, otherwise → runServer().
