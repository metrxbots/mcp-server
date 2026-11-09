/**
 * IDE Auto-Configuration
 *
 * `--setup-claude` auto-configures Claude Desktop, Cursor, and VS Code
 * to use the Metrx MCP server. Detects platform, reads/creates config,
 * adds the metrx server entry, and prompts to restart.
 *
 * Supports:
 *   - Claude Desktop: claude_desktop_config.json
 *   - Cursor: ~/.cursor/mcp.json
 *   - VS Code (Copilot): ~/.vscode/mcp.json (global) or .vscode/mcp.json (workspace)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { loadApiKey } from './auth.js';
import { trackCliEvent } from './telemetry.js';

// ── ANSI colors ──

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';

// ── IDE config definitions ──

interface IdeConfig {
  name: string;
  getConfigPath: () => string;
  /** The JSON key that holds MCP server definitions */
  serversKey: string;
  restartInstructions: string;
}

const IDE_CONFIGS: IdeConfig[] = [
  {
    name: 'Claude Desktop',
    getConfigPath: () => {
      const platform = process.platform;
      if (platform === 'darwin') {
        return join(
          homedir(),
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json'
        );
      } else if (platform === 'win32') {
        return join(
          process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
          'Claude',
          'claude_desktop_config.json'
        );
      } else {
        return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
      }
    },
    serversKey: 'mcpServers',
    restartInstructions: 'Restart Claude Desktop to pick up the changes.',
  },
  {
    name: 'Cursor',
    getConfigPath: () => join(homedir(), '.cursor', 'mcp.json'),
    serversKey: 'mcpServers',
    restartInstructions:
      'Restart Cursor or reload the window (Cmd/Ctrl+Shift+P → "Reload Window").',
  },
  {
    name: 'VS Code',
    getConfigPath: () => join(homedir(), '.vscode', 'mcp.json'),
    serversKey: 'servers',
    restartInstructions: 'Reload VS Code (Cmd/Ctrl+Shift+P → "Reload Window").',
  },
];

// ── Helpers ──

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function buildMcpEntry(apiKey: string | null): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    command: 'npx',
    args: ['@metrxbot/mcp-server'],
  };

  if (apiKey) {
    entry.env = { METRX_API_KEY: apiKey };
  }

  return entry;
}

function configureIde(
  ide: IdeConfig,
  apiKey: string | null
): { success: boolean; created: boolean; existed: boolean } {
  const configPath = ide.getConfigPath();

  // Read existing config or start fresh
  let config = readJsonFile(configPath);
  const existed = config !== null;
  if (!config) {
    config = { [ide.serversKey]: {} };
  }

  // Ensure the servers key exists
  if (!config[ide.serversKey] || typeof config[ide.serversKey] !== 'object') {
    config[ide.serversKey] = {};
  }

  const servers = config[ide.serversKey] as Record<string, unknown>;
  const alreadyConfigured = 'metrx' in servers;

  // Add/update metrx entry
  servers.metrx = buildMcpEntry(apiKey);

  // Write config
  try {
    ensureDir(configPath);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { success: true, created: !existed, existed: alreadyConfigured };
  } catch {
    return { success: false, created: false, existed: alreadyConfigured };
  }
}

// ── Main setup flow ──

export async function runSetupClaude(): Promise<void> {
  trackCliEvent('mcp_setup_ide');

  console.error(`\n${CYAN}${BOLD}  Metrx MCP Server — IDE Setup${RESET}\n`);

  // Detect available IDEs
  const available: { ide: IdeConfig; exists: boolean }[] = IDE_CONFIGS.map((ide) => ({
    ide,
    exists: existsSync(dirname(ide.getConfigPath())),
  }));

  // Show menu
  console.error(`  ${BOLD}Which IDE(s) would you like to configure?${RESET}\n`);
  available.forEach((item, i) => {
    const status = item.exists ? `${GREEN}detected${RESET}` : `${DIM}not detected${RESET}`;
    console.error(`    ${BOLD}${i + 1}${RESET}) ${item.ide.name} (${status})`);
  });
  console.error(`    ${BOLD}a${RESET}) All detected IDEs`);
  console.error('');

  const choice = await prompt(`  ${CYAN}Choose (1-${available.length}, or a):${RESET} `);

  let selectedIdes: IdeConfig[];
  if (choice.toLowerCase() === 'a') {
    selectedIdes = available.filter((a) => a.exists).map((a) => a.ide);
    if (selectedIdes.length === 0) {
      // If none detected, configure all anyway
      selectedIdes = available.map((a) => a.ide);
    }
  } else {
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= available.length) {
      console.error(`\n  ${RED}✗ Invalid choice. Aborting.${RESET}\n`);
      process.exit(1);
    }
    selectedIdes = [available[idx].ide];
  }

  // Load API key if available
  const apiKey = loadApiKey();

  if (!apiKey) {
    console.error(`\n  ${YELLOW}⚠ No API key found.${RESET}`);
    console.error(`  ${DIM}The server will be configured without an API key.`);
    console.error(`  Run ${BOLD}npx @metrxbot/mcp-server --auth${RESET}${DIM} to add one later,`);
    console.error(`  or use ${BOLD}--demo${RESET}${DIM} mode to try without signing up.${RESET}\n`);
  }

  // Configure each selected IDE
  console.error('');
  let anySuccess = false;

  for (const ide of selectedIdes) {
    const result = configureIde(ide, apiKey);
    const configPath = ide.getConfigPath();

    if (result.success) {
      anySuccess = true;
      if (result.existed) {
        console.error(
          `  ${GREEN}✓${RESET} ${BOLD}${ide.name}${RESET} — updated existing metrx entry`
        );
      } else if (result.created) {
        console.error(`  ${GREEN}✓${RESET} ${BOLD}${ide.name}${RESET} — created config file`);
      } else {
        console.error(`  ${GREEN}✓${RESET} ${BOLD}${ide.name}${RESET} — added metrx server`);
      }
      console.error(`    ${DIM}${configPath}${RESET}`);
    } else {
      console.error(`  ${RED}✗${RESET} ${BOLD}${ide.name}${RESET} — failed to write config`);
      console.error(`    ${DIM}${configPath}${RESET}`);
    }
  }

  if (anySuccess) {
    console.error(`\n  ${GREEN}${BOLD}Setup complete!${RESET}\n`);

    // Show restart instructions
    for (const ide of selectedIdes) {
      console.error(`  ${DIM}${ide.name}: ${ide.restartInstructions}${RESET}`);
    }

    if (!apiKey) {
      console.error(`\n  ${BOLD}Next steps:${RESET}`);
      console.error(
        `  ${DIM}1. Run ${BOLD}npx @metrxbot/mcp-server --auth${RESET}${DIM} to authenticate${RESET}`
      );
      console.error(`  ${DIM}2. Or start with demo mode — the server works without a key!${RESET}`);
    }

    console.error(`\n  ${DIM}Config added:${RESET}`);
    console.error(`  ${DIM}{`);
    console.error(`    "metrx": {`);
    console.error(`      "command": "npx",`);
    console.error(`      "args": ["@metrxbot/mcp-server"]${apiKey ? ',' : ''}`);
    if (apiKey) {
      console.error(`      "env": { "METRX_API_KEY": "${apiKey.slice(0, 12)}…" }`);
    }
    console.error(`    }`);
    console.error(`  }${RESET}\n`);
  } else {
    console.error(`\n  ${RED}Setup failed.${RESET} Try manually adding the config.\n`);
  }

  process.exit(0);
}
