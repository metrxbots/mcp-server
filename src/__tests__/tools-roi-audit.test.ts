/**
 * generate_roi_audit — W4 regression (plan 2026-10-12 §5).
 *
 * Before: per-agent revenue, confidence, outcomes and savings were hardcoded 0
 * ("requires separate fetch" — never fetched), the fleet confidence read an
 * `attribution.avg_confidence` field GET /dashboard never returns (→ 0%), fleet
 * savings were 0, and revenue ÷ cost was labelled "Net ROI" with the
 * methodology "(Attributed Revenue - Cost) / Cost" — a formula the number
 * never used. Now: the dashboard's per-agent P&L fields, the stored v2 savings,
 * "Attributed revenue multiple", and "n/a" (never 0) for anything missing.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerROIAuditTools } from '../../dist/tools/roi-audit';

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';

function fullDashboard() {
  return {
    period_days: 30,
    agents: { total: 2, active: 2 },
    cost: { total_calls: 900, total_cost_cents: 5000, error_calls: 0, error_rate: 0 },
    attribution: {
      total_outcomes: 40,
      total_revenue_cents: 60000,
      net_value_cents: 55000,
      roi: 12,
      roi_multiplier: 12,
      attribution_confidence: 0.82,
    },
    agents_list: [
      {
        id: A1,
        name: 'invoice-extractor',
        status: 'active',
        monthly_cost_cents: 3000,
        roi_multiplier: 15,
        total_calls: 600,
        attributed_revenue_cents: 45000,
        attributed_outcome_count: 30,
        avg_attribution_confidence: 0.9,
      },
      {
        id: A2,
        name: 'priority-router',
        status: 'active',
        monthly_cost_cents: null,
        roi_multiplier: null,
        total_calls: null,
        attributed_revenue_cents: null,
        attributed_outcome_count: null,
        avg_attribution_confidence: null,
      },
    ],
  };
}

function setup(opts: {
  dashboard: Record<string, unknown>;
  suggestions?: Record<string, unknown>;
  agents?: unknown;
}) {
  let handler: ((a: Record<string, unknown>) => Promise<{ content: { text: string }[] }>) | null =
    null;
  const server = {
    registerTool: (_n: string, _c: unknown, h: typeof handler) => {
      handler = h;
    },
  };
  const get = vi.fn(async (path: string) => {
    if (path === '/dashboard') return { data: opts.dashboard };
    if (path === '/dashboard/suggestions')
      return { data: opts.suggestions ?? { total_savings_cents: 1234, suggestions: [] } };
    if (path === '/agents')
      return {
        data: opts.agents ?? [
          {
            id: A1,
            optimization_suggestions: [{ status: 'current', total_monthly_savings_cents: 800 }],
          },
          {
            id: A2,
            optimization_suggestions: [
              { status: 'stale_definition', total_monthly_savings_cents: null },
            ],
          },
        ],
      };
    return { error: `unmocked ${path}` };
  });
  registerROIAuditTools(server as never, { get } as never);
  return {
    run: (a: Record<string, unknown> = {}) =>
      handler!({ period_days: 30, include_methodology: true, ...a }),
    get,
  };
}

const text = async (p: Promise<{ content: { text: string }[] }>) =>
  (await p).content.map((c) => c.text).join('\n');

describe('generate_roi_audit (W4)', () => {
  it('shows real per-agent revenue, outcomes, confidence and stored savings — not 0', async () => {
    const t = await text(setup({ dashboard: fullDashboard() }).run());
    const a1 = t.slice(t.indexOf('### invoice-extractor'), t.indexOf('### priority-router'));
    expect(a1).toContain('Attributed Revenue: $450.00');
    expect(a1).toContain('Attributed Outcomes: 30');
    expect(a1).toContain('Attribution Confidence: 90%');
    expect(a1).toContain('Optimization Savings (Estimate): $8.00/mo');
    expect(a1).toContain('Attributed revenue multiple: 15.00x');
  });

  it('reads the fleet confidence the API returns and the stored fleet savings', async () => {
    const t = await text(setup({ dashboard: fullDashboard() }).run());
    expect(t).toContain('Attribution Confidence: 82%');
    expect(t).toContain('Optimization Savings (Estimate): $12.34/mo');
    expect(t).toContain('Attributed revenue multiple: 12.00x');
  });

  it('never calls a revenue multiple "Net ROI" or documents a formula it does not use', async () => {
    const t = await text(setup({ dashboard: fullDashboard() }).run());
    expect(t).not.toContain('Net ROI');
    expect(t).not.toContain('(Attributed Revenue - Cost) / Cost');
    expect(t).toContain('attributed revenue ÷ cost');
  });

  it('renders missing values as n/a, never $0.00 or 0%', async () => {
    const t = await text(setup({ dashboard: fullDashboard() }).run());
    const a2 = t.slice(t.indexOf('### priority-router'), t.indexOf('## Methodology'));
    expect(a2).toContain('Cost: n/a');
    expect(a2).toContain('Attributed Revenue: n/a');
    expect(a2).toContain('Attribution Confidence: n/a');
    expect(a2).toContain('Optimization Savings (Estimate): n/a');
    expect(a2).not.toContain('$0.00');
    expect(a2).not.toContain(' 0%');
  });

  it('a plan without full attribution shows revenue as n/a, not $0.00', async () => {
    const d = fullDashboard() as Record<string, any>;
    d.attribution = { total_outcomes: 40, upgrade_hint: 'Upgrade to Pro' };
    d.agents_list = d.agents_list.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      monthly_cost_cents: a.monthly_cost_cents,
      roi_multiplier: a.roi_multiplier,
    }));
    const t = await text(setup({ dashboard: d }).run());
    expect(t).toContain('- Attributed Revenue: n/a');
    expect(t).not.toContain('Total Revenue: $0.00');
  });

  it('agent_ids filter sums the selected agents, not the whole org', async () => {
    const t = await text(setup({ dashboard: fullDashboard() }).run({ agent_ids: [A1] }));
    expect(t).toContain('Total Cost (Measured): $30.00');
    expect(t).toContain('Attributed Revenue: $450.00');
    expect(t).not.toContain('priority-router');
  });
});
