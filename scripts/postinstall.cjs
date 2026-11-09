/**
 * Postinstall telemetry — fires a single anonymous event when the package is installed.
 * Uses Node.js built-in https module (CommonJS, no external dependencies).
 * Respects DO_NOT_TRACK and CI environment variables.
 */

'use strict';

// Respect user privacy preferences
if (
  process.env.DO_NOT_TRACK === '1' ||
  process.env.METRX_TELEMETRY_DISABLED === '1' ||
  process.env.CI === 'true'
) {
  process.exit(0);
}

const https = require('https');
const os = require('os');

const data = JSON.stringify({
  event: 'mcp_installed',
  node_version: process.version,
  platform: os.platform(),
  arch: os.arch(),
  package_manager: detectPackageManager(),
});

const req = https.request(
  {
    hostname: 'app.metrxbot.com',
    port: 443,
    path: '/api/telemetry/cli',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    timeout: 3000,
  },
  () => {
    // Response doesn't matter — fire and forget
  }
);

req.on('error', () => {
  // Silently ignore — postinstall must never fail
});

req.on('timeout', () => {
  req.destroy();
});

req.write(data);
req.end();

function detectPackageManager() {
  const agent = process.env.npm_config_user_agent || '';
  if (agent.startsWith('yarn')) return 'yarn';
  if (agent.startsWith('pnpm')) return 'pnpm';
  if (agent.startsWith('bun')) return 'bun';
  return 'npm';
}
