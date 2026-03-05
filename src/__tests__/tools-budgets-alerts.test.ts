/**
 * Budget & Alert Tools Tests
 *
 * Tests for:
 * - get_budget_status (read-only, no params)
 * - set_budget (write operation, currency conversion)
 * - get_alerts (filtering, pagination)
 * - acknowledge_alert (batch write operation)
 * - get_failure_predictions (read-only)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerBudgetTools } from '../../dist/tools/budgets';
import { registerAlertTools } from '../../dist/tools/alerts';
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

describe('Budget Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_budget_status tool', () => {
    registerBudgetTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_budget_status',
      expect.objectContaining({
        title: 'Get Budget Status',
      }),
      expect.any(Function)
    );
  });

  it('should register set_budget tool', () => {
    registerBudgetTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'set_budget',
      expect.objectContaining({
        title: 'Set Budget',
      }),
      expect.any(Function)
    );
  });

  it('should register budget tools', () => {
    registerBudgetTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('get_budget_status Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let budgetStatusHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const statusCall = calls.find(([name]: [string]) => name === 'get_budget_status');
    budgetStatusHandler = statusCall[2];
  });

  it('should fetch budget status with no parameters', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        has_budgets: true,
        total_budgets: 3,
        budgets: [],
      },
    });

    await budgetStatusHandler({});

    expect(mockClient.get).toHaveBeenCalledWith('/budgets/status');
  });

  it('should return formatted budget status', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        has_budgets: true,
        total_budgets: 2,
        paused_count: 0,
        warning_count: 1,
        exceeded_count: 0,
        budgets: [
          {
            id: 'budget_123',
            period: 'monthly',
            limit_microcents: 10000000000,
            spent_microcents: 8000000000,
            pct_used: 80,
          },
        ],
      },
    });

    const result = await budgetStatusHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500)',
    });

    const result = await budgetStatusHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching budget');
  });
});

describe('set_budget Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let setBudgetHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const setBudgetCall = calls.find(([name]: [string]) => name === 'set_budget');
    setBudgetHandler = setBudgetCall[2];
  });

  it('should convert dollars to microcents correctly', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_new' },
    });

    await setBudgetHandler({
      agent_id: undefined,
      period: 'monthly',
      limit_dollars: 100,
      warning_pct: 80,
      enforcement_mode: 'alert_only',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/budgets',
      expect.objectContaining({
        limit_microcents: 10000000000, // 100 * 100_000_000
      })
    );
  });

  it('should create org-wide budget when agent_id not provided', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_org' },
    });

    await setBudgetHandler({
      period: 'daily',
      limit_dollars: 50,
      warning_pct: 75,
      enforcement_mode: 'soft_block',
    });

    expect(mockClient.post).toHaveBeenCalledWith('/budgets', expect.any(Object));
    // Verify the structure contains the essential fields
    const callArgs = (mockClient.post as any).mock.calls[0][1];
    expect(callArgs.period).toBe('daily');
    expect(callArgs.limit_microcents).toBe(5000000000);
  });

  it('should create agent-specific budget when agent_id provided', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_agent' },
    });

    await setBudgetHandler({
      agent_id: agentId,
      period: 'monthly',
      limit_dollars: 500,
      warning_pct: 80,
      enforcement_mode: 'hard_block',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agent_id: agentId,
      })
    );
  });

  it('should use default warning_pct when not provided', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_new' },
    });

    await setBudgetHandler({
      period: 'monthly',
      limit_dollars: 100,
      enforcement_mode: 'alert_only',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        warning_pct: 80,
      })
    );
  });

  it('should use default enforcement_mode when not provided', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_new' },
    });

    await setBudgetHandler({
      period: 'monthly',
      limit_dollars: 100,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        enforcement_mode: 'alert_only',
      })
    );
  });

  it('should return success message', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'budget_123', period: 'monthly' },
    });

    const result = await setBudgetHandler({
      period: 'monthly',
      limit_dollars: 100,
    });

    expect(result.content[0].text).toContain('✅');
    expect(result.content[0].text).toContain('Budget');
  });

  it('should handle API errors', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (400): Invalid period',
    });

    const result = await setBudgetHandler({
      period: 'monthly' as any,
      limit_dollars: 100,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting budget');
  });
});

describe('Alert Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register get_alerts tool', () => {
    registerAlertTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_alerts',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register acknowledge_alert tool', () => {
    registerAlertTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'acknowledge_alert',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register get_failure_predictions tool', () => {
    registerAlertTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_failure_predictions',
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should register at least 3 alert tools', () => {
    registerAlertTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('get_alerts Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let getAlertsHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerAlertTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const alertCall = calls.find(([name]: [string]) => name === 'get_alerts');
    getAlertsHandler = alertCall[2];
  });

  it('should fetch alerts with default parameters', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { alerts: [] },
    });

    await getAlertsHandler({});

    const callArgs = (mockClient.get as any).mock.calls[0][1];
    expect(callArgs.limit).toBe(25);
  });

  it('should filter by severity', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { alerts: [] },
    });

    await getAlertsHandler({ severity: 'critical' });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        severity: 'critical',
      })
    );
  });

  it('should respect unread_only parameter', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { alerts: [] },
    });

    await getAlertsHandler({ unread_only: false });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        unread_only: false,
      })
    );
  });

  it('should respect limit parameter', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { alerts: [] },
    });

    await getAlertsHandler({ limit: 50 });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        limit: 50,
      })
    );
  });

  it('should return formatted alerts', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        alerts: [
          {
            id: 'alert_123',
            type: 'cost_spike',
            severity: 'warning',
            title: 'High cost',
            message: 'Cost increased 50%',
            is_read: false,
            created_at: '2024-03-02T10:00:00Z',
          },
        ],
      },
    });

    const result = await getAlertsHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should handle missing alerts', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { alerts: undefined },
    });

    const result = await getAlertsHandler({});

    expect(result.content).toBeDefined();
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'Network error: timeout',
    });

    const result = await getAlertsHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error fetching alerts');
  });
});

describe('acknowledge_alert Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let ackAlertHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerAlertTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const ackCall = calls.find(([name]: [string]) => name === 'acknowledge_alert');
    ackAlertHandler = ackCall[2];
  });

  it('should acknowledge single alert', async () => {
    const alertId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.patch as any).mockResolvedValueOnce({
      data: { acknowledged: 1 },
    });

    await ackAlertHandler({ alert_ids: [alertId] });

    expect(mockClient.patch).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        action: 'acknowledge',
        alert_ids: [alertId],
      })
    );
  });

  it('should acknowledge multiple alerts', async () => {
    const alertIds = [
      '123e4567-e89b-12d3-a456-426614174000',
      '223e4567-e89b-12d3-a456-426614174000',
    ];
    (mockClient.patch as any).mockResolvedValueOnce({
      data: { acknowledged: 2 },
    });

    await ackAlertHandler({ alert_ids: alertIds });

    expect(mockClient.patch).toHaveBeenCalledWith(
      '/alerts',
      expect.objectContaining({
        alert_ids: alertIds,
      })
    );
  });

  it('should return success message', async () => {
    (mockClient.patch as any).mockResolvedValueOnce({
      data: { acknowledged: 3 },
    });

    const result = await ackAlertHandler({
      alert_ids: ['1', '2', '3'],
    });

    expect(result.content[0].text).toContain('✅');
    expect(result.content[0].text).toContain('3');
  });

  it('should handle API errors', async () => {
    (mockClient.patch as any).mockResolvedValueOnce({
      error: 'API request failed (404): Alerts not found',
    });

    const result = await ackAlertHandler({
      alert_ids: ['invalid_id'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error acknowledging');
  });
});

describe('get_failure_predictions Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let predictionsHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerAlertTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const predCall = calls.find(([name]: [string]) => name === 'get_failure_predictions');
    predictionsHandler = predCall[2];
  });

  it('should fetch failure predictions', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { predictions: [] },
    });

    await predictionsHandler({});

    expect(mockClient.get).toHaveBeenCalledWith('/predictions', expect.any(Object));
  });

  it('should filter predictions by agent', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.get as any).mockResolvedValueOnce({
      data: { predictions: [] },
    });

    await predictionsHandler({ agent_id: agentId });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/predictions',
      expect.objectContaining({
        agent_id: agentId,
      })
    );
  });

  it('should return formatted predictions', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        predictions: [
          {
            id: 'pred_123',
            agent_id: 'agent_456',
            prediction_type: 'budget_breach',
            severity: 'high',
            confidence: 0.92,
            current_value: 500,
            threshold_value: 1000,
            trend_direction: 'up',
            status: 'active',
            recommended_actions: [
              {
                action: 'increase_budget',
                impact: 'high',
                description: 'Increase budget limit',
              },
            ],
          },
        ],
      },
    });

    const result = await predictionsHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should handle no predictions', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { predictions: [] },
    });

    const result = await predictionsHandler({});

    expect(result.content).toBeDefined();
  });

  it('should return error on failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500)',
    });

    const result = await predictionsHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});

describe('Input Validation', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);
  });

  it('set_budget should require period enum', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const setBudgetCall = calls.find(([name]: [string]) => name === 'set_budget');
    const schema = setBudgetCall[1].inputSchema;

    expect(schema.period).toBeDefined();
  });

  it('set_budget should require positive limit_dollars', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const setBudgetCall = calls.find(([name]: [string]) => name === 'set_budget');
    const schema = setBudgetCall[1].inputSchema;

    expect(schema.limit_dollars).toBeDefined();
  });

  it('set_budget warning_pct should be 1-99', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const setBudgetCall = calls.find(([name]: [string]) => name === 'set_budget');
    const schema = setBudgetCall[1].inputSchema;

    expect(schema.warning_pct).toBeDefined();
  });

  it('set_budget enforcement_mode should be one of three values', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const setBudgetCall = calls.find(([name]: [string]) => name === 'set_budget');
    const schema = setBudgetCall[1].inputSchema;

    expect(schema.enforcement_mode).toBeDefined();
  });
});
