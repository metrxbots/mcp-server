/**
 * Upgrade Business Case Tools Tests
 *
 * Tests for:
 * - get_upgrade_business_case (read-only ROI analysis tool)
 *   - Tool registration and schema
 *   - API client interactions
 *   - Business case calculations (savings, ROI, payback)
 *   - Capacity warnings
 *   - Formatted report output
 *   - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerUpgradeBusinessCaseTools } from '../../dist/tools/upgrade-business-case';
import type { MetrxApiClient } from '../../dist/services/api-client';

const createMockServer = () => ({
  registerTool: vi.fn(),
});

/**
 * GET /dashboard is answered per test (mockResolvedValueOnce, first call). The
 * savings figure comes from GET /dashboard/suggestions — /dashboard never
 * returned an `optimization` block, which is why these tools printed $0.00.
 */
const createMockClient = (
  suggestions: Record<string, unknown> = {
    total_savings_cents: 3000,
    suggestion_count: 4,
    suggestions: [],
  }
) =>
  ({
    get: vi.fn(async (path: string) =>
      path === '/dashboard/suggestions' ? { data: suggestions } : { error: `unmocked ${path}` }
    ),
  }) as unknown as MetrxApiClient;

/** Minimal valid dashboard response */
const makeDashboard = (overrides: Record<string, any> = {}) => ({
  is_preview: false,
  stage: 'active',
  period_days: 30,
  agents: { total: 5, active: 3 },
  agents_list: [],
  cost: {
    total_calls: 8000,
    total_cost_cents: 12000,
    error_calls: 100,
    error_rate: 0.0125,
  },
  optimization: {
    total_savings_cents: 3000,
    suggestion_count: 4,
    top_suggestion: 'Downgrade model for simple tasks',
  },
  ...overrides,
});

describe('Upgrade Business Case Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_upgrade_business_case tool', () => {
    registerUpgradeBusinessCaseTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_upgrade_business_case',
      expect.objectContaining({
        title: 'Get Upgrade Business Case',
      }),
      expect.any(Function)
    );
  });

  it('should register tool with correct annotations', () => {
    registerUpgradeBusinessCaseTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const call = calls.find(([name]: [string]) => name === 'get_upgrade_business_case');
    const annotations = call[1].annotations;

    expect(annotations.readOnlyHint).toBe(true);
    expect(annotations.destructiveHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
    expect(annotations.openWorldHint).toBe(false);
  });

  it('should have current_tier as required input', () => {
    registerUpgradeBusinessCaseTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const call = calls.find(([name]: [string]) => name === 'get_upgrade_business_case');
    const schema = call[1].inputSchema;

    expect(schema.current_tier).toBeDefined();
  });

  it('should have optional inputs for monthly_spend, agent_count, primary_use_case', () => {
    registerUpgradeBusinessCaseTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const call = calls.find(([name]: [string]) => name === 'get_upgrade_business_case');
    const schema = call[1].inputSchema;

    expect(schema.monthly_spend).toBeDefined();
    expect(schema.agent_count).toBeDefined();
    expect(schema.primary_use_case).toBeDefined();
  });
});

describe('get_upgrade_business_case Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let handler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerUpgradeBusinessCaseTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const call = calls.find(([name]: [string]) => name === 'get_upgrade_business_case');
    handler = call[2];
  });

  it('should fetch dashboard data with period_days=30', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    await handler({ current_tier: 'starter' });

    expect(mockClient.get).toHaveBeenCalledWith('/dashboard', { days: 30 });
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await handler({ current_tier: 'starter' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching usage data');
  });

  it('recommends Verify + Platform for starter (legacy Lite retired, spec R5)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Verify');
    expect(text).toContain('Platform');
    // Never recommends the retired Lite tier or quotes its price.
    expect(text).not.toContain('Upgrade to Lite');
    expect(text).not.toContain('$19.00/month');
  });

  it('recommends Verify + Platform for lite tier too (no Pro upsell)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'lite' });
    const text = result.content[0].text;

    expect(text).toContain('Platform');
    expect(text).not.toContain('Upgrade to Pro');
    expect(text).not.toContain('$49.00/month');
  });

  it('pitches Verify + Platform to pro-tier callers (no legacy ladder, no band price)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'pro' });
    const text = result.content[0].text;

    expect(text).toContain('Verify');
    expect(text).toContain('Platform');
    expect(text).not.toContain('Upgrade to Business');
    // Band prices must never leak onto a machine surface.
    expect(text).not.toContain('$199');
    expect(text).not.toContain('$349');
  });

  it('should include current usage summary', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Current Usage');
    expect(text).toContain('starter');
    expect(text).toContain('Active Agents');
    expect(text).toContain('Error Rate');
  });

  it('should include ROI multiplier and payback period', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Savings multiple');
    expect(text).toContain('Payback Period');
  });

  it('should include features unlocked section', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Features Unlocked');
    expect(text).toContain('Email alerts');
  });

  it('should include next steps with upgrade URL', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Next Steps');
    expect(text).toContain('metrxbot.com/settings/billing');
  });

  it('should include machine-readable JSON block', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('```json');
    expect(text).toContain('"recommended_tier"');
    expect(text).toContain('"upgrade_url"');
  });

  it('should show capacity warning when calls usage >70%', async () => {
    const dashboard = makeDashboard({
      cost: {
        total_calls: 8000, // 80% of 10K starter limit
        total_cost_cents: 12000,
        error_calls: 100,
        error_rate: 0.0125,
      },
    });
    (mockClient.get as any).mockResolvedValueOnce({ data: dashboard });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Capacity Warning');
    expect(text).toContain('monthly call limit');
  });

  it('should show capacity warning when agent usage >70%', async () => {
    const dashboard = makeDashboard({
      agents: { total: 5, active: 3 }, // 3 of 3 = 100% for starter
    });
    (mockClient.get as any).mockResolvedValueOnce({ data: dashboard });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('Capacity Warning');
    expect(text).toContain('allowed agents');
  });

  it('should use monthly_spend override when provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter', monthly_spend: 50000 });
    const text = result.content[0].text;

    // Should still produce a valid report
    expect(text).toContain('Upgrade Business Case');
    expect(text).toContain('Current Usage');
  });

  it('should use agent_count override when provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter', agent_count: 8 });
    const text = result.content[0].text;

    // 8 agents on starter (limit 3) → should trigger capacity warning
    expect(text).toContain('Capacity Warning');
  });

  it('should use primary_use_case for case study URL', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({
      current_tier: 'starter',
      primary_use_case: 'customer_support',
    });
    const text = result.content[0].text;

    expect(text).toContain('docs.metrxbot.com');
  });

  it('should use default case study URL when no use case specified', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: makeDashboard() });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    expect(text).toContain('docs.metrxbot.com');
  });

  it('should handle missing optimization data gracefully', async () => {
    const dashboard = makeDashboard({ optimization: undefined });
    (mockClient.get as any).mockResolvedValueOnce({ data: dashboard });

    const result = await handler({ current_tier: 'starter' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Upgrade Business Case');
  });

  it('should handle zero calls scenario', async () => {
    const dashboard = makeDashboard({
      agents: { total: 0, active: 0 },
      cost: { total_calls: 0, total_cost_cents: 0, error_calls: 0, error_rate: 0 },
      optimization: { total_savings_cents: 0, suggestion_count: 0 },
    });
    (mockClient.get as any).mockResolvedValueOnce({ data: dashboard });

    const result = await handler({ current_tier: 'starter' });

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('Upgrade Business Case');
  });

  it('should produce net monthly savings ≥ 0 (never negative)', async () => {
    // Low optimization potential — tier cost might exceed savings
    const dashboard = makeDashboard({
      optimization: { total_savings_cents: 100, suggestion_count: 1 },
    });
    (mockClient.get as any).mockResolvedValueOnce({ data: dashboard });

    const result = await handler({ current_tier: 'starter' });
    const text = result.content[0].text;

    // Extract the JSON block and verify monthly savings ≥ 0
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]);
    // Savings string like "$X.XX" — parse number
    const savingsNum = parseFloat(parsed.monthly_savings_estimate.replace('$', ''));
    expect(savingsNum).toBeGreaterThanOrEqual(0);
  });
});

// Savings definition v2 / W4 (plan 2026-10-12): `dashboard.optimization` is not
// part of the /dashboard response, so the business case printed $0.00 savings,
// 0x and a 365-day payback for every org. It must read the stored total from
// GET /dashboard/suggestions and print n/a (never $0) when none exists.
describe('get_upgrade_business_case savings source (W4 regression)', () => {
  const liveDash = {
    is_preview: false,
    stage: 'active',
    period_days: 30,
    agents: { total: 5, active: 3 },
    agents_list: [],
    cost: { total_calls: 8000, total_cost_cents: 12000, error_calls: 100, error_rate: 0.0125 },
  };
  const run = async (suggestions: Record<string, unknown>) => {
    const server = createMockServer();
    const client = createMockClient(suggestions);
    (client.get as any).mockResolvedValueOnce({ data: liveDash });
    registerUpgradeBusinessCaseTools(server as any, client as any);
    const h = (server.registerTool as any).mock.calls[0][2];
    const out = await h({ current_tier: 'starter' });
    return out.content[0].text as string;
  };

  it('uses the stored monthly total (29,800¢ → $298.00, 2x the Verify fee, 15-day payback)', async () => {
    const text = await run({ total_savings_cents: 29_800, suggestion_count: 3 });
    expect(text).toContain('$298.00/month');
    expect(text).toContain('2x the one-time Verify fee');
    expect(text).toContain('15 days to recoup');
    expect(text).not.toContain('$0.00');
  });

  it('prints n/a, not $0.00 / 0x, when no current total exists', async () => {
    const text = await run({ total_savings_cents: null, suggestions: [] });
    expect(text).toContain('n/a');
    expect(text).not.toContain('$0.00');
    expect(text).not.toContain('0x the one-time');
    expect(text).toMatch(/"monthly_savings_estimate": null/);
  });
});
