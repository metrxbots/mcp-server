/**
 * In-Memory Rate Limiter for MCP Server
 *
 * Provides per-tool rate limiting using a sliding window counter.
 * Designed for single-process MCP server usage.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface WindowEntry {
  timestamps: number[];
}

/**
 * Default rate limits per tool category
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Read operations - higher limits
  dashboard: { maxRequests: 60, windowMs: 60000 }, // 60/min
  agents: { maxRequests: 60, windowMs: 60000 }, // 60/min
  metrics: { maxRequests: 30, windowMs: 60000 }, // 30/min

  // Write operations - lower limits
  experiments: { maxRequests: 10, windowMs: 60000 }, // 10/min
  budgets: { maxRequests: 10, windowMs: 60000 }, // 10/min
  alerts: { maxRequests: 10, windowMs: 60000 }, // 10/min

  // Expensive operations
  optimization: { maxRequests: 5, windowMs: 60000 }, // 5/min
  'cost-leak-scan': { maxRequests: 2, windowMs: 300000 }, // 2/5min

  // Default fallback
  default: { maxRequests: 30, windowMs: 60000 }, // 30/min
};

export class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private configs: Record<string, RateLimitConfig>;

  constructor(configs?: Record<string, RateLimitConfig>) {
    this.configs = configs || DEFAULT_RATE_LIMITS;
  }

  /**
   * Check if a request is allowed under the rate limit.
   * Returns true if allowed, false if rate limited.
   */
  isAllowed(toolName: string): boolean {
    const config = this.getConfig(toolName);
    const key = this.getToolCategory(toolName);
    const now = Date.now();

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

    // Check limit
    if (entry.timestamps.length >= config.maxRequests) {
      return false;
    }

    // Record this request
    entry.timestamps.push(now);
    return true;
  }

  /**
   * Get remaining requests in current window.
   */
  getRemaining(toolName: string): number {
    const config = this.getConfig(toolName);
    const key = this.getToolCategory(toolName);
    const now = Date.now();

    const entry = this.windows.get(key);
    if (!entry) return config.maxRequests;

    const active = entry.timestamps.filter((t) => now - t < config.windowMs);
    return Math.max(0, config.maxRequests - active.length);
  }

  /**
   * Get time until next available request slot (in ms).
   * Returns 0 if requests are available now.
   */
  getRetryAfter(toolName: string): number {
    const config = this.getConfig(toolName);
    const key = this.getToolCategory(toolName);
    const now = Date.now();

    const entry = this.windows.get(key);
    if (!entry) return 0;

    const active = entry.timestamps.filter((t) => now - t < config.windowMs);
    if (active.length < config.maxRequests) return 0;

    // Earliest timestamp that will expire
    const earliest = Math.min(...active);
    return Math.max(0, config.windowMs - (now - earliest));
  }

  /**
   * Reset rate limits for a specific tool or all tools.
   */
  reset(toolName?: string): void {
    if (toolName) {
      this.windows.delete(this.getToolCategory(toolName));
    } else {
      this.windows.clear();
    }
  }

  private getConfig(toolName: string): RateLimitConfig {
    const category = this.getToolCategory(toolName);
    return this.configs[category] || this.configs.default || DEFAULT_RATE_LIMITS.default;
  }

  private getToolCategory(toolName: string): string {
    // Extract category from tool name (e.g., "get_dashboard_summary" -> "dashboard")
    const parts = toolName.replace(/^(get_|set_|list_|create_|update_|delete_)/, '').split('_');
    const category = parts[0];

    if (category in this.configs) {
      return category;
    }
    return 'default';
  }
}
