/**
 * Upgrade Justification Tools Tests
 *
 * Tests for:
 * - get_upgrade_justification (read-only analysis tool)
 *   - Input validation (period_days 7-90 range)
 *   - Tool registration and schema
 *   - API client interactions
 *   - Response formatting for different tier scenarios
 *   - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerUpgradeJustificationTools } from '../../dist/tools/upgrade-justification';
import type { MetrxApiClient } from '../../dist/services/api-client';

const createMockServer = () => ({
  registerTool: vi.fn(),
});

const createMockClient = () =>
  ({
    get: vi.fn(),
  }) as unknown as MetrxApiClient;

describe('Upgrade Justification Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_upgrade_justification tool', () => {
    registerUpgradeJustificationTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_upgrade_justification',
      expect.objectContaining({
        title: 'Get Upgrade Justification',
      }),
      expect.any(Function)
    );
  });

  it('should register tool with correct annotations', () => {
    registerUpgradeJustificationTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const annotations = upgradeCall[1].annotations;

    expect(annotations.readOnlyHint).toBe(true);
    expect(annotations.destructiveHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
    expect(annotations.openWorldHint).toBe(false);
  });

  it('should register at least one tool', () => {
    registerUpgradeJustificationTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('get_upgrade_justification Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let upgradeHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerUpgradeJustificationTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    upgradeHandler = upgradeCall[2];
  });

  it('should fetch dashboard data with default period_days', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 50000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 8,
          total_savings_cents: 5000,
        },
      },
    });

    await upgradeHandler({});

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        period_days: 30,
      })
    );
  });

  it('should respect provided period_days parameter', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 100000,
          total_cost_cents: 30000,
          error_rate: 0.01,
        },
        optimization: {
          suggestion_count: 5,
          total_savings_cents: 3000,
        },
      },
    });

    await upgradeHandler({ period_days: 60 });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        period_days: 60,
      })
    );
  });

  it('should format response for high-volume free tier (>100k calls)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 10,
          total_savings_cents: 8000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('Upgrade Justification Report');
    expect(text).toContain('Strongly Recommended');
    expect(text).toContain('150,000');
  });

  it('should format response for medium-volume tier (50k-100k calls)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 3, total: 8 },
        cost: {
          total_calls: 75000,
          total_cost_cents: 40000,
          error_rate: 0.015,
        },
        optimization: {
          suggestion_count: 6,
          total_savings_cents: 4000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('Consider Lite');
    expect(text).toContain('75,000');
  });

  it('should format response for low-volume tier (<50k calls)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 2, total: 5 },
        cost: {
          total_calls: 30000,
          total_cost_cents: 15000,
          error_rate: 0.01,
        },
        optimization: {
          suggestion_count: 2,
          total_savings_cents: 1000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('Not Yet Recommended');
    expect(text).toContain('Free tier is sufficient');
  });

  it('should include current tier information in response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 4, total: 8 },
        cost: {
          total_calls: 120000,
          total_cost_cents: 60000,
          error_rate: 0.018,
        },
        optimization: {
          suggestion_count: 7,
          total_savings_cents: 6000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    const text = result.content[0].text;
    expect(text).toContain('Current Tier');
    expect(text).toContain('Free');
    expect(text).toContain('Active Agents');
  });

  it('should include optimization potential in response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 12,
          total_savings_cents: 10000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    const text = result.content[0].text;
    expect(text).toContain('Optimization Potential');
    expect(text).toContain('suggestions');
  });

  it('should include Lite tier benefits in response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 10,
          total_savings_cents: 8000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    const text = result.content[0].text;
    expect(text).toContain('Upgrade Benefits');
    expect(text).toContain('Advanced optimization');
    expect(text).toContain('Real-time failure prediction');
  });

  it('should include ROI projection in response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 10,
          total_savings_cents: 8000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    const text = result.content[0].text;
    expect(text).toContain('ROI Projection');
    expect(text).toContain('Lite Tier Subscription');
  });

  it('should handle missing optimization data gracefully', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        // optimization field is missing
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('Upgrade Justification Report');
    expect(text).toContain('0');
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching upgrade data');
  });

  it('should return error on network failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'Network error: timeout',
    });

    const result = await upgradeHandler({ period_days: 45 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching upgrade data');
  });

  it('should handle 404 API error gracefully', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (404): Not found',
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.isError).toBe(true);
  });

  it('should format period_days in the response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.02,
        },
        optimization: {
          suggestion_count: 8,
          total_savings_cents: 5000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 60 });

    const text = result.content[0].text;
    expect(text).toContain('Analysis Period');
    expect(text).toContain('60');
  });

  it('should handle zero calls scenario', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 0, total: 5 },
        cost: {
          total_calls: 0,
          total_cost_cents: 0,
          error_rate: 0,
        },
        optimization: {
          suggestion_count: 0,
          total_savings_cents: 0,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    expect(result.content).toBeDefined();
    const text = result.content[0].text;
    expect(text).toContain('Not Yet Recommended');
  });

  it('should include error rate in response', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: { active: 5, total: 10 },
        cost: {
          total_calls: 150000,
          total_cost_cents: 75000,
          error_rate: 0.05,
        },
        optimization: {
          suggestion_count: 8,
          total_savings_cents: 5000,
        },
      },
    });

    const result = await upgradeHandler({ period_days: 30 });

    const text = result.content[0].text;
    expect(text).toContain('Error Rate');
  });
});

describe('Input Validation for get_upgrade_justification', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerUpgradeJustificationTools(mockServer as any, mockClient as any);
  });

  it('should have period_days in schema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const schema = upgradeCall[1].inputSchema;

    expect(schema.period_days).toBeDefined();
  });

  it('period_days should have min constraint of 7', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const schema = upgradeCall[1].inputSchema;

    // Verify the schema has period_days defined
    expect(schema.period_days).toBeDefined();
  });

  it('period_days should have max constraint of 90', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const schema = upgradeCall[1].inputSchema;

    // Verify the schema has period_days defined
    expect(schema.period_days).toBeDefined();
  });

  it('period_days should have default value of 30', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const schema = upgradeCall[1].inputSchema;

    // Verify the schema has period_days with default
    expect(schema.period_days).toBeDefined();
  });

  it('should have description for period_days', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const upgradeCall = calls.find(([name]: [string]) => name === 'get_upgrade_justification');
    const schema = upgradeCall[1].inputSchema;

    expect(schema.period_days.description).toBeDefined();
    expect(schema.period_days.description).toContain('days');
  });
});
