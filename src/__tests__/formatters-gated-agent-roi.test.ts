/**
 * /api/dashboard omits per-agent roi_multiplier on plans without full
 * attribution. In the MCP dashboard summary an ABSENT multiple is "not on this
 * plan" and renders nothing; only an explicit null means "no attributed
 * revenue". Before, absent and null both read "no attributed revenue".
 */
import { describe, it, expect } from 'vitest';
import { formatDashboard, formatOptimizations } from '../services/formatters';
import type { DashboardSummary } from '../types';

function summary(agent: Record<string, unknown>): DashboardSummary {
  return {
    is_preview: false,
    stage: 'collecting',
    period_days: 30,
    agents: { total: 1, active: 1 },
    agents_list: [
      {
        id: 'a-1',
        agent_key: 'ddq',
        name: 'ddq',
        category: 'support',
        status: 'active',
        is_background: false,
        monthly_cost_cents: 2800,
        ...agent,
      },
    ],
    cost: { total_calls: 10, total_cost_cents: 2800, error_calls: 0, error_rate: 0 },
    attribution: undefined,
  } as DashboardSummary;
}

describe('formatDashboard per-agent multiple', () => {
  it('absent (gated plan): no multiple and no "no attributed revenue" claim', () => {
    const out = formatDashboard(summary({}));
    expect(out).toContain('- **ddq** (active): $28.00 in period\n'.trimEnd());
    expect(out).not.toContain('attributed revenue');
    expect(out).not.toMatch(/\b0(\.0+)?x\b/);
  });

  it('null (full plan, no revenue): says so', () => {
    expect(formatDashboard(summary({ roi_multiplier: null }))).toContain(
      '$28.00 in period, no attributed revenue'
    );
  });

  it('a number: the multiple', () => {
    expect(formatDashboard(summary({ roi_multiplier: 3 }))).toContain(
      '$28.00 in period, 3.0x attributed revenue multiple'
    );
  });
});

// Review m-R2-3: the engine no longer emits total_revenue_impact_cents (it summed
// revenue figures of opposite sign). An old API or demo body that still carries
// it must not be rendered as a "Revenue Impact" figure.
describe('formatOptimizations: no summed revenue impact', () => {
  it('never prints a Revenue Impact line, even when a legacy body carries the field', () => {
    const text = formatOptimizations({
      suggestions: [],
      total_monthly_savings_cents: 1000,
      suggestion_count: 0,
      computed_at: '2026-10-13T00:00:00Z',
      total_revenue_impact_cents: 42500,
    } as never);
    expect(text).not.toMatch(/Revenue Impact/);
  });
});
