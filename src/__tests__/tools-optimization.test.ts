/**
 * Optimization Tools Tests
 *
 * Tests for:
 * - get_optimization_recommendations (input validation, filtering, response formatting)
 * - apply_optimization (write operation, payload handling, error scenarios)
 * - compare_models (if present)
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

  it('should register apply_optimization tool', () => {
    registerOptimizationTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'apply_optimization',
      expect.objectContaining({
        title: 'Apply Optimization',
      }),
      expect.any(Function)
    );
  });

  it('should register optimization tools', () => {
    registerOptimizationTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(2);
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

    it('apply_optimization should be write operation', () => {
      registerOptimizationTools(mockServer as any, mockClient as any);

      const calls = (mockServer.registerTool as any).mock.calls;
      const applyCall = calls.find(([name]: [string]) => name === 'apply_optimization');
      const config = applyCall[1];

      expect(config.annotations?.readOnlyHint).toBe(false);
      expect(config.annotations?.destructiveHint).toBe(false);
    });
  });
});

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

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({ include_optimization: true })
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

    await optRecommendationsHandler({ include_revenue: true });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({ include_revenue: true })
    );
  });

  it('should exclude revenue when include_revenue is false', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        optimization: { suggestions: [], suggestion_count: 0 },
      },
    });

    await optRecommendationsHandler({ include_revenue: false });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
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
      data: {
        optimization: {
          suggestions: [],
          suggestion_count: 0,
        },
      },
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

    const result = await optRecommendationsHandler({});

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

describe('apply_optimization Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let applyOptHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerOptimizationTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const applyCall = calls.find(([name]: [string]) => name === 'apply_optimization');
    applyOptHandler = applyCall[2];
  });

  it('should post optimization with agent_id and type', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.post as any).mockResolvedValueOnce({
      data: { success: true },
    });

    await applyOptHandler({
      agent_id: agentId,
      optimization_type: 'token_guardrails',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      `/agents/${agentId}/settings`,
      expect.objectContaining({
        optimization_type: 'token_guardrails',
      })
    );
  });

  it('should include payload in request', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { success: true },
    });

    const payload = { max_tokens: 2000 };
    await applyOptHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      optimization_type: 'token_guardrails',
      payload,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        max_tokens: 2000,
      })
    );
  });

  it('should handle missing payload parameter', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { success: true },
    });

    await applyOptHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      optimization_type: 'model_switch',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        optimization_type: 'model_switch',
      })
    );
  });

  it('should return success message on completion', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { applied: true, changes: 'max_tokens=2000' },
    });

    const result = await applyOptHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      optimization_type: 'token_guardrails',
    });

    expect(result.content[0].text).toContain('✅');
  });

  it('should return error when optimization application fails', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (400): Invalid optimization type',
    });

    const result = await applyOptHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      optimization_type: 'invalid_type',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error applying optimization');
  });

  it('should handle network errors', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'Network error: Connection timeout',
    });

    const result = await applyOptHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
      optimization_type: 'token_guardrails',
    });

    expect(result.isError).toBe(true);
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

  it('apply_optimization should require agent_id', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const applyCall = calls.find(([name]: [string]) => name === 'apply_optimization');
    const schema = applyCall[1].inputSchema;

    expect(schema.agent_id).toBeDefined();
  });

  it('apply_optimization should require optimization_type', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const applyCall = calls.find(([name]: [string]) => name === 'apply_optimization');
    const schema = applyCall[1].inputSchema;

    expect(schema.optimization_type).toBeDefined();
  });

  it('apply_optimization should accept optional payload', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const applyCall = calls.find(([name]: [string]) => name === 'apply_optimization');
    const schema = applyCall[1].inputSchema;

    expect(schema.payload).toBeDefined();
  });
});
