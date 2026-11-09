/**
 * The hosted MCP's money scale (round 8, N4).
 *
 * `*_microcents` columns hold MICRO-DOLLARS (dollars = value / 1e6) — the web app's
 * lib/budgets/units.ts and the gateway compare them directly. This package used
 * a factor 100x too large ("one dollar = a hundred million microcents"), so
 * set_budget stored limits at 100x the requested dollars and every limit, spend
 * and cost it printed read 1/100 of the truth.
 */
import { describe, it, expect, vi } from 'vitest';
import { dollarsToMicrodollars, MICRODOLLARS_PER_DOLLAR } from '../../dist/services/units';
import { formatMicrocents } from '../../dist/services/formatters';
import { registerAttributionTools } from '../../dist/tools/attribution';

describe('MCP money units', () => {
  it('1 dollar is 1,000,000 micro-dollars', () => {
    expect(MICRODOLLARS_PER_DOLLAR).toBe(1_000_000);
    expect(dollarsToMicrodollars(100)).toBe(100_000_000);
    expect(dollarsToMicrodollars(0.0000014)).toBe(1);
  });
  it('formatMicrocents reads the column as micro-dollars', () => {
    expect(formatMicrocents(143_500_000)).toBe('$143.50');
  });
  it('get_task_roi prints llm_events cost (micro-dollars) in dollars, total and by model', async () => {
    const server = { registerTool: vi.fn() };
    const client = {
      get: vi.fn().mockResolvedValue({
        data: {
          costs: {
            total_microcents: 42_500_000,
            by_model: { 'gpt-4o': 42_500_000 },
            avg_per_request: 1,
          },
          outcomes: { count: 1, total_value_cents: 100, by_type: {} },
          roi_multiplier: 1,
          weighted_avg_confidence: 0.5,
        },
      }),
    };
    registerAttributionTools(server as any, client as any);
    const call = server.registerTool.mock.calls.find((c: unknown[]) => c[0] === 'get_task_roi');
    expect(call).toBeDefined();
    const res = await (call![2] as Function)({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      days: 30,
    });
    expect(res.content[0].text).toContain('### Costs: $42.50');
    expect(res.content[0].text).toContain('gpt-4o: $42.50');
  });
});
