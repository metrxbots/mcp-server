import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, DEFAULT_RATE_LIMITS } from '../middleware/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      dashboard: { maxRequests: 3, windowMs: 1000 },
      optimization: { maxRequests: 2, windowMs: 5000 },
      default: { maxRequests: 5, windowMs: 1000 },
    });
  });

  it('allows requests within limit', () => {
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
  });

  it('blocks requests exceeding limit', () => {
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(false);
  });

  it('tracks remaining requests', () => {
    expect(limiter.getRemaining('get_dashboard_summary')).toBe(3);
    limiter.isAllowed('get_dashboard_summary');
    expect(limiter.getRemaining('get_dashboard_summary')).toBe(2);
    limiter.isAllowed('get_dashboard_summary');
    expect(limiter.getRemaining('get_dashboard_summary')).toBe(1);
  });

  it('returns retry-after when rate limited', () => {
    limiter.isAllowed('get_dashboard_summary');
    limiter.isAllowed('get_dashboard_summary');
    limiter.isAllowed('get_dashboard_summary');

    const retryAfter = limiter.getRetryAfter('get_dashboard_summary');
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(1000);
  });

  it('resets limits for specific tool', () => {
    limiter.isAllowed('get_dashboard_summary');
    limiter.isAllowed('get_dashboard_summary');
    limiter.isAllowed('get_dashboard_summary');
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(false);

    limiter.reset('get_dashboard_summary');
    expect(limiter.isAllowed('get_dashboard_summary')).toBe(true);
  });

  it('resets all limits', () => {
    limiter.isAllowed('get_dashboard_summary');
    limiter.isAllowed('get_optimization_suggestions');

    limiter.reset();
    expect(limiter.getRemaining('get_dashboard_summary')).toBe(3);
    expect(limiter.getRemaining('get_optimization_suggestions')).toBe(2);
  });

  it('uses different limits per tool category', () => {
    // Dashboard: 3 max
    expect(limiter.getRemaining('get_dashboard_summary')).toBe(3);
    // Optimization: 2 max
    expect(limiter.getRemaining('get_optimization_suggestions')).toBe(2);
    // Unknown: 5 max (default)
    expect(limiter.getRemaining('unknown_tool')).toBe(5);
  });

  it('allows requests after window expires', async () => {
    const fastLimiter = new RateLimiter({
      default: { maxRequests: 1, windowMs: 50 },
    });

    expect(fastLimiter.isAllowed('test_tool')).toBe(true);
    expect(fastLimiter.isAllowed('test_tool')).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(fastLimiter.isAllowed('test_tool')).toBe(true);
  });

  it('default rate limits have expected categories', () => {
    expect(DEFAULT_RATE_LIMITS).toHaveProperty('dashboard');
    expect(DEFAULT_RATE_LIMITS).toHaveProperty('optimization');
    expect(DEFAULT_RATE_LIMITS).toHaveProperty('default');
    expect(DEFAULT_RATE_LIMITS.dashboard.maxRequests).toBeGreaterThan(0);
  });
});
