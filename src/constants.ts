/**
 * MCP Server Constants
 *
 * Shared configuration values used across the server.
 */

/** Default Metrx API base URL */
export const DEFAULT_API_URL = 'https://app.metrxbot.com/api';

/** Maximum number of items returned in a list response */
export const DEFAULT_PAGE_LIMIT = 25;

/** Maximum character length for text content in tool responses */
export const MAX_TEXT_LENGTH = 4000;

/**
 * Server identification.
 *
 * SERVER_VERSION must equal the version in packages/mcp-server/package.json —
 * it is served live by GET /api/mcp, so a stale value publishes a version that
 * does not exist. It drifted to 0.2.2 while the package moved to 0.2.3.
 * `apps/web/tests/mcp-tool-count-drift.test.ts` pins the two together; bump both
 * or CI fails.
 */
export const SERVER_NAME = 'metrx-mcp-server';
export const SERVER_VERSION = '0.6.0';
