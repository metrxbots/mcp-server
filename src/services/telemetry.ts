/**
 * CLI Telemetry — Fire-and-forget anonymous event tracking
 *
 * Sends lightweight pings to the Metrx telemetry endpoint so we can
 * understand CLI usage patterns (install, demo, auth, setup).
 *
 * Rules:
 *   - Never blocks CLI startup or stdio transport
 *   - Never throws — all errors are silently swallowed
 *   - Anonymous — no user IDs, no PII, no API keys
 *   - Opt out with METRX_TELEMETRY=0, METRX_TELEMETRY_DISABLED=1 or
 *     DO_NOT_TRACK=1 (the Console Do Not Track convention)
 */

import { SERVER_VERSION } from '../constants.js';

const TELEMETRY_URL = 'https://app.metrxbot.com/api/telemetry/cli';

/** True when any of the three opt-out variables is set (exported for the test). */
export function telemetryOptedOut(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.METRX_TELEMETRY === '0' || env.METRX_TELEMETRY_DISABLED === '1' || env.DO_NOT_TRACK === '1'
  );
}

/**
 * Fire-and-forget CLI telemetry event.
 * Never awaited, never throws, never blocks.
 */
export function trackCliEvent(event: string, extra?: Record<string, string>): void {
  if (telemetryOptedOut()) return;

  try {
    const body = JSON.stringify({
      event,
      version: SERVER_VERSION,
      platform: process.platform,
      node_version: process.version,
      ...extra,
    });

    fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  } catch {
    // Never throw — telemetry must not break CLI
  }
}
