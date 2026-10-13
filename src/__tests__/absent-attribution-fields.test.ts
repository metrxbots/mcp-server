/**
 * Absent vs null attribution fields (0.2.6).
 *
 * The Metrx API OMITS attribution money on plans that do not include it:
 *   - /dashboard agents_list: roi_multiplier, net_profit_cents, attributed_revenue_cents,
 *     attributed_outcome_count, avg_attribution_confidence are absent on every tier
 *     except full attribution (starter, lite, unknown);
 *   - /dashboard attribution: summary_only (Lite) keeps total_outcomes + upgrade_hint and
 *     drops revenue / net value / multiple; starter sends attribution: null.
 * And it sends null (not 0) when there is nothing to divide (no revenue or no cost).
 *
 * Every surface must render the three states differently:
 *   number → the value; null → "no attributed revenue"; absent → omit / "not in your plan".
 * The 0.2.5 client typed these as `T | null` and crashed on absence
 * (`undefined.toFixed` in generate_roi_audit and formatDashboard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetrxApiClient } from '../services/api-client.js';
import { formatDashboard } from '../services/formatters.js';
import { registerROIAuditTools } from '../tools/roi-audit.js';
import { registerDashboardTools } from '../tools/dashboard.js';
import { registerAttributionTools } from '../tools/attribution.js';
import type { DashboardSummary } from '../types.js';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function harness(register: (s: McpServer, c: MetrxApiClient) => void) {
  const handlers: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _def: unknown, handler: Handler) => {
      handlers[name] = handler;
    },
  } as unknown as McpServer;
  const client = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  register(server, client as unknown as MetrxApiClient);
  return { handlers, client };
}

const agent = (extra: Record<string, unknown>) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Support Bot',
  agent_key: 'support_bot',
  category: 'support',
  status: 'active',
  is_background: false,
  monthly_cost_cents: 2500,
  ...extra,
});

// ── formatDashboard ────────────────────────────────────────────────────────

describe('formatDashboard — attribution three states', () => {
  const base = (over: Partial<DashboardSummary>): DashboardSummary => ({
    is_preview: false,
    stage: 'active',
    period_days: 30,
    agents: { total: 1, active: 1 },
    agents_list: [],
    cost: { total_calls: 100, total_cost_cents: 1000, error_calls: 0, error_rate: 0 },
    ...over,
  });

  it('summary_only (Lite): no crash, keeps the outcome count, shows the upgrade hint, no money', () => {
    // Reproduces the 0.2.5 crash: roi_multiplier absent → `undefined.toFixed`.
    const text = formatDashboard(
      base({
        attribution: { total_outcomes: 7, upgrade_hint: 'Upgrade to Pro for full ROI breakdown' },
      })
    );
    expect(text).toContain('**Attributed Outcomes**: 7');
    expect(text).toContain('*Upgrade to Pro for full ROI breakdown*');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Attributed Revenue**');
    expect(text).not.toContain('multiple');
  });

  it('starter: attribution null → no attribution section at all', () => {
    const text = formatDashboard(base({ attribution: null }));
    expect(text).not.toContain('Revenue Attribution');
  });

  it('full attribution with roi_multiplier null → "n/a (no attributed revenue or no cost)"', () => {
    const text = formatDashboard(
      base({
        attribution: {
          total_outcomes: 0,
          total_revenue_cents: 0,
          net_value_cents: -1000,
          roi_multiplier: null,
        },
      })
    );
    expect(text).toContain('**Attributed Revenue**: $0.00');
    expect(text).toContain('**Attributed revenue multiple**: n/a (no attributed revenue or no cost)');
  });

  it('full attribution with a number → the multiple', () => {
    const text = formatDashboard(
      base({
        attribution: {
          total_outcomes: 12,
          total_revenue_cents: 32000,
          net_value_cents: 31000,
          roi_multiplier: 32,
        },
      })
    );
    expect(text).toContain('**Attributed Revenue**: $320.00');
    expect(text).toContain('**Net Value**: $310.00');
    expect(text).toContain('**Attributed revenue multiple**: 32.0x');
  });

  it('agents_list: absent → no multiple text, null → "no attributed revenue", number → multiple', () => {
    const text = formatDashboard(
      base({
        agents_list: [
          agent({ name: 'Gated' }),
          agent({ name: 'Nothing', roi_multiplier: null }),
          agent({ name: 'Earner', roi_multiplier: 3.25 }),
        ],
      })
    );
    const line = (n: string) => text.split('\n').find((l) => l.includes(`**${n}**`))!;
    expect(line('Gated')).toBe('- **Gated** (active): $25.00/mo');
    expect(line('Nothing')).toBe('- **Nothing** (active): $25.00/mo, no attributed revenue');
    expect(line('Earner')).toBe('- **Earner** (active): $25.00/mo, 3.3x attributed revenue multiple');
  });
});

// ── generate_roi_audit ─────────────────────────────────────────────────────

describe('generate_roi_audit — absent attribution fields', () => {
  let handlers: Record<string, Handler>;
  let client: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ handlers, client } = harness(registerROIAuditTools));
  });

  it('starter/lite (per-agent roi_multiplier ABSENT): does not throw, omits the multiple line', async () => {
    // Reproduces the 0.2.5 crash at roi-audit.ts:181:
    // `agent.roi_multiplier !== null ? agent.roi_multiplier.toFixed(2)` with undefined → TypeError.
    client.get.mockResolvedValueOnce({
      data: {
        cost: { total_cost_cents: 5000, total_calls: 40 },
        attribution: { total_outcomes: 3, upgrade_hint: 'Upgrade to Pro for full ROI breakdown' },
        agents_list: [agent({})],
      },
    });
    const result = await handlers['generate_roi_audit']({ period_days: 30, include_methodology: true });
    const text = result.content[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).toContain('### Support Bot');
    expect(text).toContain('- AI Cost: $25.00/mo');
    expect(text).not.toMatch(/Support Bot[\s\S]*Attributed Revenue Multiple/);
    // Absence is "not on the plan", not "no attribution data" and not $0.
    expect(text).not.toContain('No attributed revenue');
    expect(text).not.toContain('No attribution data');
    expect(text).toContain(
      '- Attributed Revenue: not included in your plan (Upgrade to Pro for full ROI breakdown)'
    );
    expect(text).toContain('- Attributed Outcomes: 3');
    expect(text).not.toContain('$0.00');
    expect(text).not.toContain('NaN');
  });

  it('starter (attribution null, per-agent absent): says the plan does not include attribution', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        cost: { total_cost_cents: 5000, total_calls: 40 },
        attribution: null,
        agents_list: [agent({})],
      },
    });
    const text = (await handlers['generate_roi_audit']({ period_days: 30 })).content[0].text;
    expect(text).toContain('- Attributed Revenue: not included in your plan');
    expect(text).toContain('not included in your plan, so they are omitted above');
    expect(text).not.toContain('Attributed Revenue Multiple');
  });

  it('full attribution, per-agent roi_multiplier NULL → "no attributed revenue"', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        cost: { total_cost_cents: 5000, total_calls: 40 },
        attribution: {
          total_outcomes: 0,
          total_revenue_cents: 0,
          net_value_cents: -5000,
          roi_multiplier: null,
          attribution_confidence: null,
        },
        agents_list: [agent({ roi_multiplier: null, attributed_revenue_cents: 0 })],
      },
    });
    const text = (await handlers['generate_roi_audit']({ period_days: 30 })).content[0].text;
    expect(text).toContain('- Attributed Revenue Multiple: n/a (no attributed revenue)');
    expect(text).toContain('- Risks: No attributed revenue');
    expect(text).toContain('- Attributed Revenue Multiple: n/a (no attributed revenue or no cost)');
    expect(text).toContain('- Avg Attribution Confidence: n/a (no attributed outcomes)');
    expect(text).not.toContain('not included in your plan');
  });

  it('full attribution with numbers → per-agent revenue, multiple, and the below-1x flag', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        cost: { total_cost_cents: 10000, total_calls: 40 },
        attribution: {
          total_outcomes: 9,
          total_revenue_cents: 30000,
          net_value_cents: 20000,
          roi_multiplier: 3,
          attribution_confidence: 0.82,
        },
        agents_list: [
          agent({ name: 'Earner', roi_multiplier: 4.5, attributed_revenue_cents: 11250 }),
          agent({ name: 'Drag', roi_multiplier: 0.4, attributed_revenue_cents: 1000 }),
        ],
      },
    });
    const text = (await handlers['generate_roi_audit']({ period_days: 30 })).content[0].text;
    expect(text).toContain('- Attributed Revenue: $300.00');
    expect(text).toContain('- Attributed Revenue Multiple: 3.00x');
    expect(text).toContain('- Avg Attribution Confidence: 82%');
    expect(text).toContain('- Attributed Revenue Multiple: 4.50x');
    expect(text).toContain('- Attributed Revenue: $112.50');
    expect(text).toContain('- Attributed Revenue Multiple: 0.40x');
    expect(text).toContain('Attributed revenue below AI cost (multiple under 1.00x)');
  });

  it('N-A3: methodology describes a return multiple (revenue ÷ cost), not (revenue − cost) / cost', async () => {
    client.get.mockResolvedValueOnce({ data: { cost: { total_cost_cents: 0, total_calls: 0 } } });
    const text = (await handlers['generate_roi_audit']({ period_days: 30, include_methodology: true }))
      .content[0].text;
    expect(text).toContain('Attributed Revenue ÷ AI Cost');
    expect(text).toContain('return multiple');
    expect(text).not.toContain('(Attributed Revenue - Cost) / Cost');
  });
});

// ── list_agents ────────────────────────────────────────────────────────────

describe('list_agents — roi_multiplier three states', () => {
  it('absent → nothing, null → "no attributed revenue", number → multiple', async () => {
    const { handlers, client } = harness(registerDashboardTools);
    client.get.mockResolvedValueOnce({
      data: {
        agents: [
          agent({ name: 'Gated' }),
          agent({ name: 'Nothing', roi_multiplier: null }),
          agent({ name: 'Earner', roi_multiplier: 2 }),
        ],
      },
    });
    const text = (await handlers['list_agents']({})).content[0].text;
    const line = (n: string) => text.split('\n').find((l) => l.includes(`**${n}**`))!;
    expect(line('Gated')).toMatch(/\$25\.00\/mo$/);
    expect(line('Nothing')).toMatch(/\| no attributed revenue$/);
    expect(line('Earner')).toMatch(/\| 2\.0x attributed revenue multiple$/);
  });
});

// ── get_task_roi ───────────────────────────────────────────────────────────

describe('get_task_roi — absent / null / number', () => {
  const costs = { total_microcents: 2_000_000, by_model: {}, avg_per_request: 5 };
  const run = async (data: Record<string, unknown>) => {
    const { handlers, client } = harness(registerAttributionTools);
    client.get.mockResolvedValueOnce({ data });
    return handlers['get_task_roi']({ agent_id: '11111111-1111-4111-8111-111111111111', days: 30 });
  };

  it('roi_multiplier and confidence NULL (no revenue): no crash, "n/a", nudge to connect outcomes', async () => {
    // 0.2.5 crashed here: `data.roi_multiplier.toFixed(2)` on null.
    const r = await run({
      costs,
      outcomes: { count: 0, total_value_cents: 0, by_type: {} },
      roi_multiplier: null,
      weighted_avg_confidence: null,
    });
    const text = r.content[0].text;
    expect(r.isError).toBeFalsy();
    expect(text).toContain('n/a (no attributed revenue or no cost)');
    expect(text).toContain('Avg Attribution Confidence**: n/a (no attributed outcomes)');
    expect(text).toContain('No attributed revenue yet');
  });

  it('attribution ABSENT (plan omits it): says not included, never $0.00 revenue', async () => {
    const text = (await run({ costs })).content[0].text;
    expect(text).toContain('### Costs: $2.00');
    expect(text).toContain('Not included in your plan.');
    expect(text).not.toContain('Attributed Revenue: $');
    expect(text).not.toContain('multiple');
  });

  it('number → the multiple, worded as attributed revenue ÷ AI cost', async () => {
    const text = (
      await run({
        costs,
        outcomes: { count: 4, total_value_cents: 640, by_type: { deal_closed: 640 } },
        roi_multiplier: 3.2,
        weighted_avg_confidence: 0.9,
      })
    ).content[0].text;
    expect(text).toContain('### Attributed Revenue: $6.40 (4 outcomes)');
    expect(text).toContain('(attributed revenue ÷ AI cost): 3.20x');
    expect(text).toContain('Avg Attribution Confidence**: 90%');
    expect(text).toContain('$3.20 of attributed revenue for every $1 of AI cost');
  });
});
