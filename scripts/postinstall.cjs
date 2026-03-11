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
  const YELLOW = '\x1b[33m';

  const hasKey = !!process.env.METRX_API_KEY;

  const header = `
${CYAN}${BOLD}  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║   ⚡ Metrx MCP Server installed successfully         ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝${RESET}
`;

  const steps = hasKey
    ? `  ${GREEN}${BOLD}✓ API key detected${RESET}

  ${BOLD}Next:${RESET} Verify your connection:
  ${DIM}npx @metrxbot/mcp-server --test${RESET}
`
    : `  ${GREEN}Get started in 2 steps:${RESET}

  ${BOLD}1.${RESET} Get your free API key:
     ${CYAN}https://app.metrxbot.com/sign-up?source=mcp${RESET}

  ${BOLD}2.${RESET} Test your connection:
     ${DIM}METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server --test${RESET}
`;

  const footer = `
  ${DIM}Docs: https://docs.metrxbot.com${RESET}
  ${DIM}Support: support@metrxbot.com${RESET}
`;

  console.log(header + steps + footer);
} catch (_) {
  // Silently ignore — never break npm install
}
