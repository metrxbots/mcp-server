/**
 * Optimization Tools Tests
 *
 * Tests for:
 * - get_optimization_recommendations (input validation, filtering, response formatting)
 * (apply_optimization / route_model / compare_models were removed in W1-4b.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerOptimizationTools } from '../../dist/tools/optimization';
import type { MetrxApiClient } from '../../dist/services/api-client';

const createMockServer = () => ({
  registerTool: vi.fn(),
});

const createMockClient = () =>
  ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  }) as unknown as MetrxApiClient;

describe('Optimization Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_optimization_recommendations tool', () => {
    registerOptimizationTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_optimization_recommendations',
      expect.objectContaining({
        title: 'Get Optimization Recommendations',
        description: expect.stringContaining('optimization'),
      }),
      expect.any(Function)
    );
  });

  it('registers only get_optimization_recommendations (apply/route/compare removed in W1-4b)', () => {
    registerOptimizationTools(mockServer as any, mockClient as any);

    const names = (mockServer.registerTool as any).mock.calls.map(([n]: [string]) => n);
    expect(names).toEqual(['get_optimization_recommendations']);
  });

  describe('tool annotations', () => {
    it('get_optimization_recommendations should be read-only', () => {
      registerOptimizationTools(mockServer as any, mockClient as any);

      const calls = (mockServer.registerTool as any).mock.calls;
      const optCall = calls.find(([name]: [string]) => name === 'get_optimization_recommendations');
      const config = optCall[1];

      expect(config.annotations?.readOnlyHint).toBe(true);
      expect(config.annotations?.destructiveHint).toBe(false);
    });
  });
});

const AGENT = '123e4567-e89b-12d3-a456-426614174000';

describe('get_optimization_recommendations Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let optRecommendationsHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerOptimizationTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const optCall = calls.find(([name]: [string]) => name === 'get_optimization_recommendations');
    optRecommendationsHandler = optCall[2];
  });

  it('should fetch fleet-wide recommendations when agent_id not provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          suggestions: [],
          total_monthly_savings_cents: 0,
          suggestion_count: 0,
        },
      },
    });

    await optRecommendationsHandler({ include_revenue: true });

    // Fleet reads /dashboard/suggestions (v2): /dashboard has no optimization block.
    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard/suggestions',
      expect.objectContaining({ limit: '10' })
    );
  });

  it('should fetch agent-specific recommendations when agent_id provided', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          suggestions: [],
          total_monthly_savings_cents: 0,
          suggestion_count: 0,
        },
      },
    });

    await optRecommendationsHandler({ agent_id: agentId, include_revenue: true });

    expect(mockClient.get).toHaveBeenCalledWith(
      `/agents/${agentId}/metrics`,
      expect.objectContaining({ include_optimization: true })
    );
  });

  it('should include revenue when include_revenue is true', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: { suggestions: [], suggestion_count: 0 },
      },
    });

    await optRecommendationsHandler({ agent_id: AGENT, include_revenue: true });

    expect(mockClient.get).toHaveBeenCalledWith(
      `/agents/${AGENT}/metrics`,
      expect.objectContaining({ include_revenue: true })
    );
  });

  it('should exclude revenue when include_revenue is false', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: { suggestions: [], suggestion_count: 0 },
      },
    });

    await optRecommendationsHandler({ agent_id: AGENT, include_revenue: false });

    expect(mockClient.get).toHaveBeenCalledWith(
      `/agents/${AGENT}/metrics`,
      expect.objectContaining({ include_revenue: false })
    );
  });

  it('should return message when no suggestions found for agent', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          suggestions: [],
          suggestion_count: 0,
        },
      },
    });

    const result = await optRecommendationsHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.content[0].text).toContain('No optimization recommendations');
    expect(result.content[0].text).toContain('already well-optimized');
  });

  it('should return message when no fleet-wide suggestions', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { status: 'no_suggestions', suggestions: [], total_savings_cents: 0 },
    });

    const result = await optRecommendationsHandler({});

    expect(result.content[0].text).toContain('No fleet-wide optimization');
    expect(result.content[0].text).toContain('efficiently');
  });

  it('should return formatted suggestions when available', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          suggestions: [
            {
              type: 'token_guardrails',
              title: 'Add token limits',
              description: 'Implement max_tokens constraint',
              impact_monthly_cents: 5000,
              confidence: 'high',
            },
          ],
          total_monthly_savings_cents: 5000,
          suggestion_count: 1,
        },
      },
    });

    const result = await optRecommendationsHandler({ agent_id: AGENT });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await optRecommendationsHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching recommendations');
  });
});

describe('get_optimization_recommendations — one savings definition (v2)', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let handler: (args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerOptimizationTools(mockServer as any, mockClient as any);
    const calls = (mockServer.registerTool as any).mock.calls;
    handler = calls.find(([n]: [string]) => n === 'get_optimization_recommendations')[2];
  });

  it('agent: prints the route total verbatim (same number as the card), two decimals under $100', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          status: 'current',
          stale_reason: null,
          suggestions: [
            {
              type: 'provider_arbitrage',
              title: 'Switch from gpt-4o to x',
              description: '',
              impact_monthly_cents: 500,
              confidence: 'medium',
            },
            {
              type: 'provider_arbitrage',
              title: 'Switch from claude-sonnet-4.5 to y',
              description: '',
              impact_monthly_cents: 300,
              confidence: 'medium',
            },
          ],
          total_monthly_savings_cents: 640,
          measured_window_spend_cents: 5000,
          suggestion_count: 2,
        },
      },
    });
    const res = await handler({ agent_id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(res.content[0].text).toContain('$6.40/month');
    expect(res.content[0].text).toMatch(/Estimate/);
  });

  it('agent: a stale-definition row says "recalculating", never "already well-optimized" or $0', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: {
          status: 'stale_definition',
          stale_reason: 'recalculating',
          suggestions: [],
          total_monthly_savings_cents: null,
          suggestion_count: 0,
        },
      },
    });
    const res = await handler({ agent_id: '123e4567-e89b-12d3-a456-426614174000' });
    const text = res.content[0].text as string;
    expect(text).toMatch(/recalculating/i);
    expect(text).not.toMatch(/well-optimized/);
    expect(text).not.toContain('$0.00');
  });

  it('fleet: reads /dashboard/suggestions (the /dashboard payload has no optimization block)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        status: 'ready',
        total_savings_cents: 640,
        recalculating_agent_count: 1,
        suggestions: [
          {
            type: 'provider_arbitrage',
            title: 'Switch from gpt-4o to x',
            description: '',
            impact_monthly_cents: 500,
            confidence: 'medium',
            agent_name: 'invoice-extractor',
          },
        ],
      },
    });
    const res = await handler({});
    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard/suggestions',
      expect.objectContaining({ limit: '10' })
    );
    const text = res.content[0].text as string;
    expect(text).toContain('$6.40/month');
    expect(text).toMatch(/1 agent.*recalculating/i);
  });
});

describe('Input Validation', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerOptimizationTools(mockServer as any, mockClient as any);
  });

  it('get_optimization_recommendations should accept optional agent_id', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const optCall = calls.find(([name]: [string]) => name === 'get_optimization_recommendations');
    const schema = optCall[1].inputSchema;

    expect(schema.agent_id).toBeDefined();
  });
});
