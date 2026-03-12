#!/usr/bin/env node
/**
 * Postinstall welcome message for @metrxbot/mcp-server
 *
 * CommonJS so it runs without a build step.
 * Non-blocking, no prompts — safe for CI.
 * Wrapped in try/catch so failures never break `npm install`.
 */

'use strict';

try {
  // Skip in CI environments — no need to show a banner there
  if (process.env.CI) {
    process.exit(0);
  }

  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const CYAN = '\x1b[36m';
  const GREEN = '\x1b[32m';
  const DIM = '\x1b[2m';

  const banner = `
${CYAN}${BOLD}  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║   ⚡ Metrx MCP Server installed successfully         ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝${RESET}

  ${GREEN}Try it now — no signup required:${RESET}

  ${BOLD}$${RESET} ${DIM}npx @metrxbot/mcp-server --demo${RESET}

  ${DIM}This starts the server with sample data so you can explore
  all 23 cost intelligence tools instantly.${RESET}

  ${GREEN}Ready to connect real data?${RESET}

  ${BOLD}1.${RESET} Get your free API key:
     ${CYAN}https://app.metrxbot.com/sign-up${RESET}

  ${BOLD}2.${RESET} Test your connection:
     ${DIM}METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server --test${RESET}

  ${DIM}Docs: https://docs.metrxbot.com${RESET}
  ${DIM}Support: support@metrxbot.com${RESET}
`;

  console.log(banner);
} catch (_) {
  // Silently ignore — never break npm install
}
