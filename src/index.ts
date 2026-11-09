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
 *   METRX_API_URL  — Optional. Override the API base URL (default: https://app.metrxbot.com/api).
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
 *
 * Flags:
 *   --demo          The public desk tools over the Northwind sample (no API key needed)
 *   --auth          Interactive login (opens browser, saves key)
 *   --test          Verify API key & connection
 *   --setup-claude  Auto-configure Claude Desktop, Cursor, or VS Code
 */

import { liftDeskErrorsOn } from './errors.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_VERSION } from './constants.js';
import { mcpToolSummary } from './tool-registry-facts.js';
import { MetrxApiClient } from './services/api-client.js';
import { HttpKeylessClient } from './services/keyless-client.js';
import { createMcpServer } from './server-factory.js';
import { loadApiKey, runAuthFlow } from './services/auth.js';
import { trackCliEvent } from './services/telemetry.js';
import { runSetupClaude } from './services/setup-claude.js';

// ── ANSI colors (stderr-safe) ──

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

// ── CLI flag routing ──

if (process.argv.includes('--setup-claude')) {
  // ── --setup-claude flag: auto-configure IDE MCP config ──
  runSetupClaude().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else if (process.argv.includes('--demo')) {
  // ── --demo flag: the public desk tools over the live Northwind sample, no key ──
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
    trackCliEvent('mcp_test_run');

    console.error(`\n${CYAN}${BOLD}Metrx MCP Server — Connection Test${RESET}\n`);
    console.error(`  Version: ${SERVER_VERSION}`);

    // Check API key — env var or ~/.metrxrc
    const apiKey = loadApiKey();
    if (!apiKey) {
      console.error(`\n  ${RED}✗ No API key found${RESET}`);
      console.error(
        `\n  ${DIM}Run ${BOLD}npx @metrxbot/mcp-server --auth${RESET}${DIM} to log in, or set METRX_API_KEY.${RESET}`
      );
      console.error(
        `\n  Sign up free:  ${CYAN}https://app.metrxbot.com/sign-up?source=mcp${RESET}`
      );
      console.error(`  Manage keys:   ${CYAN}https://app.metrxbot.com/settings/security${RESET}\n`);
      process.exit(1);
    }

    // Validate key format
    if (
      !apiKey.startsWith('sk_live_') &&
      !apiKey.startsWith('sk_test_') &&
      !apiKey.startsWith('mk_')
    ) {
      console.error(
        `  ${RED}✗ API key format looks wrong${RESET} (expected sk_live_…, sk_test_…, or mk_…)`
      );
      console.error(
        `\n  Get a valid key at: ${CYAN}https://app.metrxbot.com/settings/security${RESET}\n`
      );
      process.exit(1);
    }
    // Mask API key — only show prefix and last 4 chars
    const maskedKey = `${apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 12))}${apiKey.slice(-4)}`;
    console.error(`  API Key: ${DIM}${maskedKey}${RESET}`);

    // Attempt API ping
    console.error(`\n  Connecting to Metrx API…`);
    try {
      const client = new MetrxApiClient();
      const result = await client.ping();

      if (result.ok) {
        console.error(`  ${GREEN}${BOLD}✓ Connection successful!${RESET}`);
        console.error(`\n  Your MCP server is ready to use. Add this to your MCP client config:`);
        console.error(`\n  ${DIM}{`);
        console.error(`    "mcpServers": {`);
        console.error(`      "metrx": {`);
        console.error(`        "command": "npx",`);
        console.error(`        "args": ["@metrxbot/mcp-server"],`);
        console.error(`        "env": { "METRX_API_KEY": "sk_live_***" }`);
        console.error(`      }`);
        console.error(`    }`);
        console.error(`  }${RESET}\n`);
        process.exit(0);
      } else {
        console.error(`  ${RED}✗ Connection failed: ${result.error}${RESET}\n`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`  ${RED}✗ ${err instanceof Error ? err.message : String(err)}${RESET}\n`);
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
  trackCliEvent('mcp_bare_run');

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

  // Desk tool errors leave as the table's JSON-RPC errors (plan §2), as on the hosted route.
  const transport = liftDeskErrorsOn(new StdioServerTransport());
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
 * Start the MCP server in demo mode: no API key. Only the public desk tools
 * are listed (MCP_TOOL_AUTH 'public'); they read the live Northwind sample
 * review and run the pure drafting/checking functions over the SAME api/v1
 * routes the hosted endpoint uses (HttpKeylessClient), so what a `--demo`
 * caller sees is what https://metrxbot.com/review/demo shows. Each call is
 * rate-limited once, at the route (30/min/IP).
 */
async function runDemoServer(): Promise<void> {
  trackCliEvent('mcp_demo_started');

  // ── Terminal banner (stderr so it doesn't interfere with stdio protocol) ──
  console.error(
    `\n${CYAN}${BOLD}  Metrx MCP Server — Demo Mode${RESET}  ${DIM}v${SERVER_VERSION}${RESET}\n`
  );
  console.error(
    `  ${GREEN}✓${RESET} No API key needed: the public desk tools over the Northwind sample\n`
  );
  console.error(`  ${BOLD}What you can call${RESET}`);
  console.error(
    `  ${DIM}metrx_get_workforce_review${RESET}  the weekly review of a sample company's AI agents`
  );
  console.error(`  ${DIM}metrx_draft_job_contract${RESET}    draft a job contract from a template`);
  console.error(
    `  ${DIM}metrx_check_vendor_bill${RESET}     reconcile a per-resolution vendor bill\n`
  );
  console.error(`  ${DIM}The full registry (${mcpToolSummary()}) needs an API key:${RESET}`);
  console.error(`  ${DIM}$ npx @metrxbot/mcp-server --auth${RESET}\n`);
  console.error(`  ${DIM}If running directly in a terminal, you'll see JSON-RPC messages.`);
  console.error(`  For the best experience, configure your MCP client:${RESET}`);
  console.error(`  ${DIM}$ npx @metrxbot/mcp-server --setup-claude${RESET}\n`);
  console.error(`  ${GREEN}Ready to review your own agents?${RESET}`);
  console.error(`  ${CYAN}https://app.metrxbot.com/sign-up?source=mcp-demo${RESET}\n`);

  // ── Start server ──
  const keyless = new HttpKeylessClient(process.env.METRX_API_URL || undefined);
  const server = createMcpServer(keyless, { isDemo: true, authMode: 'public' });

  // Desk tool errors leave as the table's JSON-RPC errors (plan §2), as on the hosted route.
  const transport = liftDeskErrorsOn(new StdioServerTransport());
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
// --setup-claude → runSetupClaude(), --demo → runDemoServer(), --auth → runAuthFlow(),
// --test → IIFE that exits, otherwise → runServer().
