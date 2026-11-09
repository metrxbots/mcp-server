/**
 * Shared MCP Server Middleware
 *
 * Applies rate limiting and the `metrx_` namespace prefix to all tools
 * registered on the server. Used by both the stdio CLI entrypoint and
 * the Streamable HTTP endpoint to eliminate code duplication.
 *
 * @module apply-middleware
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RateLimiter } from './rate-limiter.js';

/** Namespace prefix applied to every tool name. */
const METRX_PREFIX = 'metrx_';

/**
 * Monkey-patches `server.registerTool` to:
 * 1. Wrap every handler with sliding-window rate limiting.
 * 2. Prefix every tool name with `metrx_` (idempotent — already-prefixed names are left alone).
 *
 * Call this **before** registering any tools.
 *
 * @param server      - The McpServer whose registerTool will be patched
 * @param rateLimiter - RateLimiter instance for enforcing per-category limits
 */
export function applyMiddleware(server: McpServer, rateLimiter: RateLimiter): void {
  const originalRegisterTool = server.registerTool.bind(server);

  (server as any).registerTool = function (
    name: string,
    config: any,
    handler: (...handlerArgs: any[]) => Promise<any>
  ) {
    const wrappedHandler = async (...handlerArgs: any[]) => {
      if (!rateLimiter.isAllowed(name)) {
        const retryAfterMs = rateLimiter.getRetryAfter(name);
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Rate limit exceeded for tool '${name}'. Try again in ${retryAfterSec} seconds.`,
            },
          ],
          isError: true,
        };
      }
      return handler(...handlerArgs);
    };

    // Register with metrx_ prefix (primary name only — no deprecated aliases)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;
    originalRegisterTool(prefixedName, config, wrappedHandler);
  };
}
