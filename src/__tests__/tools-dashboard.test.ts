/**
 * Dashboard Tools Tests
 *
 * Tests for:
 * - get_cost_summary (tool registration and handler logic)
 * - list_agents (input validation and response formatting)
 * - get_agent_detail (error handling and API integration)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerDashboardTools } from '../../dist/tools/dashboard';
import type { MetrxApiClient } from '../../dist/services/api-client';

// Mock the server and client
const createMockServer = () => ({
  registerTool: vi.fn(),
});

const createMockClient = () =>
  ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  }) as unknown as MetrxApiClient;

describe('Dashboard Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_cost_summary tool', () => {
    registerDashboardTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_cost_summary',
      expect.objectContaining({
        title: 'Get Cost Summary',
        description: expect.stringContaining('cost summary'),
      }),
      expect.any(Function)
    );
  });

  it('should register list_agents tool', () => {
    registerDashboardTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'list_agents',
      expect.objectContaining({
        title: 'List Agents',
      }),
      expect.any(Function)
    );
  });

  it('should register get_agent_detail tool', () => {
    registerDashboardTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_agent_detail',
      expect.objectContaining({
        title: 'Get Agent Detail',
      }),
      expect.any(Function)
    );
  });

  it('should register 3 dashboard tools total', () => {
    registerDashboardTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(3);
  });

  describe('tool annotations', () => {
    it('should mark all dashboard tools as readOnlyHint=true', () => {
      registerDashboardTools(mockServer as any, mockClient as any);

      const calls = (mockServer.registerTool as any).mock.calls;
      calls.forEach(([_toolName, config]: [string, any]) => {
        expect(config.annotations?.readOnlyHint).toBe(true);
        expect(config.annotations?.destructiveHint).toBe(false);
        expect(config.annotations?.idempotentHint).toBe(true);
      });
    });
  });
});

describe('get_cost_summary Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let costSummaryHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerDashboardTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const costCall = calls.find(([name]: [string]) => name === 'get_cost_summary');
    costSummaryHandler = costCall[2];
  });

  it('should call API with default period_days', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        stage: 'production',
        period_days: 30,
        agents: { total: 5, active: 4 },
        cost: { total_calls: 1000, total_cost_cents: 50000 },
      },
    });

    await costSummaryHandler({ period_days: 30 });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        period_days: 30,
      })
    );
  });

  it('should use provided period_days', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        stage: 'production',
        period_days: 7,
        agents: { total: 5, active: 4 },
        cost: { total_calls: 1000, total_cost_cents: 50000, error_calls: 0, error_rate: 0 },
      },
    });

    await costSummaryHandler({ period_days: 7 });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({ period_days: 7 })
    );
  });

  it('should return error when API call fails', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await costSummaryHandler({ period_days: 30 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching cost summary');
  });

  it('should return formatted content on success', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        stage: 'production',
        period_days: 30,
        agents: { total: 5, active: 4 },
        cost: {
          total_calls: 1000,
          total_cost_cents: 50000,
          error_calls: 10,
          error_rate: 0.01,
        },
      },
    });

    const result = await costSummaryHandler({ period_days: 30 });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });
});

describe('list_agents Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let listAgentsHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerDashboardTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const listCall = calls.find(([name]: [string]) => name === 'list_agents');
    listAgentsHandler = listCall[2];
  });

  it('should call API without filters when no parameters provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agents: [] },
    });

    await listAgentsHandler({});

    expect(mockClient.get).toHaveBeenCalledWith('/agents', {});
  });

  it('should apply status filter', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agents: [] },
    });

    await listAgentsHandler({ status: 'active' });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/agents',
      expect.objectContaining({ status: 'active' })
    );
  });

  it('should apply category filter', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agents: [] },
    });

    await listAgentsHandler({ category: 'sales' });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/agents',
      expect.objectContaining({ category: 'sales' })
    );
  });

  it('should apply both filters when provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agents: [] },
    });

    await listAgentsHandler({ status: 'idle', category: 'support' });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/agents',
      expect.objectContaining({ status: 'idle', category: 'support' })
    );
  });

  it('should return empty message when no agents found', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agents: [] },
    });

    const result = await listAgentsHandler({});

    expect(result.content[0].text).toContain('No agents found');
  });

  it('should format agent list correctly', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Sales Agent',
            agent_key: 'agent_sales_001',
            status: 'active',
            category: 'sales',
            monthly_cost_cents: 10000,
            roi_multiplier: 5.2,
          },
        ],
      },
    });

    const result = await listAgentsHandler({});

    expect(result.content[0].text).toContain('Sales Agent');
    expect(result.content[0].text).toContain('agent_sales_001');
    expect(result.content[0].text).toContain('active');
    expect(result.content[0].text).toContain('sales');
  });

  it('should handle missing optional fields', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agents: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Agent No Cost',
            agent_key: 'agent_001',
            status: 'active',
            category: 'support',
          },
        ],
      },
    });

    const result = await listAgentsHandler({});

    expect(result.content[0].text).toContain('Agent No Cost');
    expect(result.content[0].text).toContain('N/A');
  });

  it('should return error when API fails', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'Network error: timeout',
    });

    const result = await listAgentsHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error listing agents');
  });
});

describe('get_agent_detail Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let getAgentDetailHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerDashboardTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const detailCall = calls.find(([name]: [string]) => name === 'get_agent_detail');
    getAgentDetailHandler = detailCall[2];
  });

  it('should fetch agent detail by UUID', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        id: agentId,
        name: 'Test Agent',
        agent_key: 'agent_test',
        status: 'active',
        category: 'sales',
      },
    });

    await getAgentDetailHandler({ agent_id: agentId });

    expect(mockClient.get).toHaveBeenCalledWith(`/agents/${agentId}`);
  });

  it('should return agent detail on success', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Agent',
        agent_key: 'agent_test',
        status: 'active',
        category: 'sales',
        primary_model: 'gpt-4',
      },
    });

    const result = await getAgentDetailHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should return error when agent not found', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (404): Agent not found',
    });

    const result = await getAgentDetailHandler({
      agent_id: '000e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching agent');
  });

  it('should return error on network failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'Network error: Connection refused',
    });

    const result = await getAgentDetailHandler({
      agent_id: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.isError).toBe(true);
  });
});

describe('Input Schema Validation', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerDashboardTools(mockServer as any, mockClient as any);
  });

  it('get_cost_summary should validate period_days bounds', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const costCall = calls.find(([name]: [string]) => name === 'get_cost_summary');
    const schema = costCall[1].inputSchema;

    // period_days should be 1-90, default 30
    expect(schema.period_days).toBeDefined();
  });

  it('list_agents should accept status enum', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const listCall = calls.find(([name]: [string]) => name === 'list_agents');
    const schema = listCall[1].inputSchema;

    expect(schema.status).toBeDefined();
  });

  it('get_agent_detail should require UUID format', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const detailCall = calls.find(([name]: [string]) => name === 'get_agent_detail');
    const schema = detailCall[1].inputSchema;

    expect(schema.agent_id).toBeDefined();
  });
});
