/**
 * CLI Authentication Helper
 *
 * Provides `--auth` flow:
 *   1. Opens the Metrx signup/key page in the user's browser
 *   2. Prompts for the API key via stdin
 *   3. Validates the key with a ping
 *   4. Saves to ~/.metrxrc as JSON { "api_key": "sk_live_..." }
 *
 * The saved key is read at startup so users don't need to set env vars.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { MetrxApiClient } from './api-client.js';

// ── Constants ──

const RC_FILENAME = '.metrxrc';
const API_KEY_SETTINGS_URL = 'https://app.metrxbot.com/settings/security';
const SIGNUP_URL = 'https://app.metrxbot.com/sign-up';

// ── ANSI colors ──

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';

// ── RC file path ──

export function getRcPath(): string {
  return join(homedir(), RC_FILENAME);
}

// ── Read saved API key ──

export interface RcConfig {
  api_key?: string;
}

export function readRcFile(): RcConfig | null {
  const rcPath = getRcPath();
  if (!existsSync(rcPath)) return null;

  try {
    const raw = readFileSync(rcPath, 'utf-8');
    return JSON.parse(raw) as RcConfig;
  } catch {
    return null;
  }
}

/**
 * Load API key from environment or ~/.metrxrc.
 * Priority: METRX_API_KEY env var > ~/.metrxrc > null
 */
export function loadApiKey(): string | null {
  if (process.env.METRX_API_KEY) {
    return process.env.METRX_API_KEY;
  }
  const rc = readRcFile();
  return rc?.api_key || null;
}

// ── Write API key ──

export function writeRcFile(apiKey: string): void {
  const rcPath = getRcPath();
  const config: RcConfig = { api_key: apiKey };
  writeFileSync(rcPath, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600, // User-only read/write
  });
}

// ── Validate key format ──

export function isValidKeyFormat(key: string): boolean {
  return key.startsWith('sk_live_') || key.startsWith('sk_test_');
}

// ── Open URL in browser ──

async function openUrl(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const { platform } = process;

  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32' ? `start "${url}"` :
    `xdg-open "${url}"`;

  return new Promise((resolve) => {
    exec(cmd, () => resolve()); // Swallow errors — user can open manually
  });
}

// ── Prompt for input ──

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so it doesn't interfere with MCP stdio
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Main auth flow ──

export async function runAuthFlow(): Promise<void> {
  console.error(`\n${CYAN}${BOLD}Metrx MCP Server — Authentication${RESET}\n`);

  // Check if already authenticated
  const existing = readRcFile();
  if (existing?.api_key) {
    console.error(`  ${DIM}Found existing key in ${getRcPath()}${RESET}`);
    console.error(`  ${DIM}Key: ${existing.api_key.slice(0, 12)}…${existing.api_key.slice(-4)}${RESET}\n`);

    const overwrite = await prompt(`  ${YELLOW}Overwrite existing key? (y/N):${RESET} `);
    if (overwrite.toLowerCase() !== 'y') {
      console.error(`\n  ${DIM}Keeping existing key. Use METRX_API_KEY env var to override.${RESET}\n`);
      process.exit(0);
    }
    console.error('');
  }

  // Step 1: Open browser
  console.error(`  ${BOLD}Step 1:${RESET} Get your API key\n`);
  console.error(`  ${DIM}Opening ${CYAN}${API_KEY_SETTINGS_URL}${RESET}${DIM} in your browser…${RESET}`);
  console.error(`  ${DIM}(If it doesn't open, visit the URL above manually)${RESET}`);
  console.error(`  ${DIM}New to Metrx? Sign up free at ${CYAN}${SIGNUP_URL}${RESET}\n`);

  await openUrl(API_KEY_SETTINGS_URL);

  // Step 2: Prompt for key
  console.error(`  ${BOLD}Step 2:${RESET} Paste your API key below\n`);
  const apiKey = await prompt(`  ${CYAN}API Key:${RESET} `);

  if (!apiKey) {
    console.error(`\n  ${RED}✗ No key provided. Aborting.${RESET}\n`);
    process.exit(1);
  }

  // Validate format
  if (!isValidKeyFormat(apiKey)) {
    console.error(`\n  ${RED}✗ Invalid key format.${RESET} Expected ${DIM}sk_live_…${RESET} or ${DIM}sk_test_…${RESET}`);
    console.error(`  Get a valid key at: ${CYAN}${API_KEY_SETTINGS_URL}${RESET}\n`);
    process.exit(1);
  }

  // Step 3: Validate with ping
  console.error(`\n  Validating key…`);

  try {
    const client = new MetrxApiClient(apiKey);
    const result = await client.ping();

    if (!result.ok) {
      console.error(`  ${RED}✗ Key validation failed: ${result.error}${RESET}\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`  ${RED}✗ ${err instanceof Error ? err.message : String(err)}${RESET}\n`);
    process.exit(1);
  }

  // Step 4: Save
  console.error(`  ${GREEN}✓ Key validated successfully!${RESET}\n`);

  writeRcFile(apiKey);

  console.error(`  ${GREEN}${BOLD}✓ Saved to ${getRcPath()}${RESET}\n`);
  console.error(`  Your MCP server is ready. Add this to your MCP client config:\n`);
  console.error(`  ${DIM}{`);
  console.error(`    "mcpServers": {`);
  console.error(`      "metrx": {`);
  console.error(`        "command": "npx",`);
  console.error(`        "args": ["@metrxbot/mcp-server"]`);
  console.error(`      }`);
  console.error(`    }`);
  console.error(`  }${RESET}`);
  console.error(`\n  ${DIM}No env var needed — key is read from ${getRcPath()}${RESET}\n`);

  process.exit(0);
}
