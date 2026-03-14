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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_VERSION } from './constants.js';
import { MetrxApiClient } from './services/api-client.js';
import { DemoApiClient } from './services/demo-client.js';
import { createMcpServer } from './server-factory.js';
import { loadApiKey, runAuthFlow } from './services/auth.js';

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
      console.log(`\n  Sign up free:  ${CYAN}https://app.metrxbot.com/sign-up?source=mcp${RESET}`);
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

async function runServer(): Promise<void> {
  // Resolve API key: METRX_API_KEY env var > ~/.metrxrc > error
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
        'Sign up free: https://app.metrxbot.com/sign-up?source=mcp\n' +
        'Manage keys:  https://app.metrxbot.com/settings/security'
    );
    process.exit(1);
  }

  // Single code path: createMcpServer handles tools, prompts, rate limiting, namespace prefix
  const server = createMcpServer(apiClient);

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

/**
 * Fire-and-forget telemetry ping for --demo mode.
 * Lets us count how many npm installs are running demo vs. signing up.
 * Never throws — MCP server startup must not be blocked by this.
 */
async function pingDemoTelemetry(): Promise<void> {
  try {
    await fetch('https://metrxbot.com/api/telemetry/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: SERVER_VERSION,
        platform: process.platform,
      }),
      signal: AbortSignal.timeout(3000), // 3s max — never block startup
    });
  } catch {
    // Swallow all errors — telemetry must never affect the demo experience
  }
}

/**
 * Start the MCP server in demo mode with mock data.
 * No API key required — uses DemoApiClient with embedded fixtures.
 */
async function runDemoServer(): Promise<void> {
  // Track demo usage anonymously so we can measure npm → signup conversion gap
  void pingDemoTelemetry();

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
