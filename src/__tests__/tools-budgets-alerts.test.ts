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
            limit_microcents: 100_000_000, // $100 — the column holds MICRO-DOLLARS (1e6)
            spent_microcents: 80_000_000, // $80
            pct_used: 80,
          },
        ],
      },
    });

    const result = await budgetStatusHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('$80.00 / $100.00');
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
        limit_microcents: 100_000_000, // $100 in micro-dollars (round 8, N4: was 100x this)
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
    expect(callArgs.limit_microcents).toBe(50_000_000);
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

  it('echoes the stored limit in dollars at the micro-dollar scale', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        id: 'budget_123',
        period: 'monthly',
        limit_microcents: 100_000_000,
        enforcement_mode: 'alert_only',
        warning_pct: 80,
        agent_id: null,
      },
    });
    const result = await setBudgetHandler({ period: 'monthly', limit_dollars: 100 });
    expect(result.content[0].text).toContain('$100.00/monthly');
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

describe('update_budget_mode Handler — paused is not a PATCH field the route reads (round 8)', () => {
  // PATCH /api/budgets/[id] strips unknown keys, so `paused` sent there was dropped
  // and the tool still reported "status → active". Resume goes through the resume
  // route (which refuses a hard_block still over its limit); pause through PATCH.
  let mockClient: MetrxApiClient;
  let handler: Function;
  const ID = '123e4567-e89b-12d3-a456-426614174000';
  beforeEach(() => {
    const mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);
    handler = (mockServer.registerTool as any).mock.calls.find(
      ([n]: [string]) => n === 'update_budget_mode'
    )[2];
  });

  it('paused:false calls POST /budgets/{id}/resume, never PATCH with paused', async () => {
    (mockClient.post as any).mockResolvedValueOnce({ data: { id: ID, paused: false } });
    const result = await handler({ budget_id: ID, paused: false });
    expect(mockClient.post).toHaveBeenCalledWith(`/budgets/${ID}/resume`, {});
    expect(mockClient.patch).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('status → active');
  });

  it('a refused resume (409 limit reached) is an error carrying the route message, not "status → active"', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'This budget is still at its limit for the current period',
    });
    const result = await handler({ budget_id: ID, paused: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('still at its limit');
    expect(result.content[0].text).not.toContain('status → active');
  });

  it('paused:true PATCHes { paused: true }', async () => {
    (mockClient.patch as any).mockResolvedValueOnce({ data: { id: ID, paused: true } });
    const result = await handler({ budget_id: ID, paused: true });
    expect(mockClient.patch).toHaveBeenCalledWith(`/budgets/${ID}`, { paused: true });
    expect(result.content[0].text).toContain('status → paused');
  });

  it('enforcement_mode + resume: PATCH the mode, then resume', async () => {
    (mockClient.patch as any).mockResolvedValueOnce({ data: { id: ID } });
    (mockClient.post as any).mockResolvedValueOnce({ data: { id: ID, paused: false } });
    const result = await handler({ budget_id: ID, enforcement_mode: 'soft_block', paused: false });
    expect(mockClient.patch).toHaveBeenCalledWith(`/budgets/${ID}`, {
      enforcement_mode: 'soft_block',
    });
    expect(mockClient.post).toHaveBeenCalledWith(`/budgets/${ID}/resume`, {});
    expect(result.content[0].text).toContain('enforcement → soft_block');
    expect(result.content[0].text).toContain('status → active');
  });
});

describe('budget writes need the admin scope (round 9 D5 → W1-4b)', () => {
  // POST/PATCH /api/budgets and /resume call requireAdmin. Since W1-4b that admits
  // an API key carrying the 'admin' scope; any other key gets 403 insufficient_scope,
  // which the client renders as a sentence naming the scope. The tools must pass
  // that sentence through and say how the caller can get the scope.
  const ID = '123e4567-e89b-12d3-a456-426614174000';
  const FORBIDDEN = {
    error:
      "Insufficient API key scope: this call needs 'admin' (key holds [read, write]). " +
      'This action needs an API key with the admin scope.',
    status: 403,
  };
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  const tool = (name: string) =>
    (mockServer.registerTool as any).mock.calls.find(([n]: [string]) => n === name);
  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);
  });

  const expectAdminMessage = (text: string) => {
    expect(text).toContain("needs 'admin'"); // the server's precise reason, verbatim
    expect(text).toMatch(/'admin' scope/);
    expect(text).toContain('Settings → Security → API Keys');
    expect(text).toContain('https://app.metrxbot.com/settings/budgets');
  };

  it('set_budget: a 403 passes the scope reason through and says how to get the scope', async () => {
    (mockClient.post as any).mockResolvedValueOnce(FORBIDDEN);
    const result = await tool('set_budget')[2]({ period: 'monthly', limit_dollars: 10 });
    expect(result.isError).toBe(true);
    expectAdminMessage(result.content[0].text);
  });

  it('update_budget_mode: a 403 on the PATCH says the same', async () => {
    (mockClient.patch as any).mockResolvedValueOnce(FORBIDDEN);
    const result = await tool('update_budget_mode')[2]({
      budget_id: ID,
      enforcement_mode: 'hard_block',
    });
    expect(result.isError).toBe(true);
    expectAdminMessage(result.content[0].text);
  });

  it('update_budget_mode: a 403 on resume says the same', async () => {
    (mockClient.post as any).mockResolvedValueOnce(FORBIDDEN);
    const result = await tool('update_budget_mode')[2]({ budget_id: ID, paused: false });
    expect(result.isError).toBe(true);
    expectAdminMessage(result.content[0].text);
    expect(result.content[0].text).not.toContain('status → active');
  });

  it('a non-403 error keeps the route message (no scope copy)', async () => {
    (mockClient.post as any).mockResolvedValueOnce({ error: 'Invalid period', status: 400 });
    const result = await tool('set_budget')[2]({ period: 'monthly', limit_dollars: 10 });
    expect(result.content[0].text).toContain('Invalid period');
    expect(result.content[0].text).not.toMatch(/'admin' scope/);
  });

  it('the tool descriptions state the admin-scope requirement and no longer say API keys cannot write', () => {
    const setDesc: string = tool('set_budget')[1].description;
    const modeDesc: string = tool('update_budget_mode')[1].description;
    expect(setDesc).toMatch(/'admin' scope/);
    expect(modeDesc).toMatch(/'admin' scope/);
    expect(setDesc).not.toMatch(/API key[^.]*cannot change budgets/i);
    expect(modeDesc).not.toMatch(
      /^Change the enforcement mode of an existing budget or pause\/resume it/
    );
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

describe('get_failure_predictions Handler (GET /agents/{id}/optimization/predictions)', () => {
  const AGENT = '123e4567-e89b-12d3-a456-426614174000';
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

  const prediction = (severity: string) => ({
    prediction_type: 'error_rate_breach',
    severity,
    confidence: 0.92,
    prediction_horizon_hours: 24,
    current_value: 0.08,
    threshold_value: 0.1,
    trend_direction: 'rising',
    trend_velocity: 0.01,
    contributing_factors: [
      { factor: 'ewma_divergence', weight: 0.7, description: 'Fast EWMA above slow' },
    ],
    recommended_actions: [
      {
        action: 'investigate_errors',
        impact: 'high',
        effort: 'low',
        description: 'Check recent errors',
      },
    ],
  });

  it('requires agent_id (the route is per agent)', () => {
    const schema = (mockServer.registerTool as any).mock.calls.find(
      ([n]: [string]) => n === 'get_failure_predictions'
    )[1].inputSchema;
    expect(schema.agent_id.isOptional()).toBe(false);
    expect(schema.status).toBeUndefined(); // computed on request — there is no stored status
  });

  it('calls the per-agent predictions route, not the nonexistent /predictions', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agent_id: AGENT, predictions: [], computed_at: 'now', event_count: 100 },
    });
    await predictionsHandler({ agent_id: AGENT });
    expect(mockClient.get).toHaveBeenCalledWith(`/agents/${AGENT}/optimization/predictions`);
  });

  it('formats the route payload and filters by severity client-side', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        agent_id: AGENT,
        predictions: [prediction('critical'), prediction('info')],
        computed_at: '2026-10-08T00:00:00Z',
        event_count: 500,
      },
    });
    const result = await predictionsHandler({ agent_id: AGENT, severity: 'critical' });
    const text = result.content[0].text;
    expect(text).toContain('Failure Predictions (1)');
    expect(text).toContain('error_rate_breach');
    expect(text).toContain('Calls analyzed (last 7 days): 500');
    expect(text).toContain('investigate_errors');
  });

  it('says an empty result under 20 calls means too little data, not health', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { agent_id: AGENT, predictions: [], computed_at: 'now', event_count: 5 },
    });
    const result = await predictionsHandler({ agent_id: AGENT });
    expect(result.content[0].text).toContain('too little data');
    expect(result.content[0].text).not.toMatch(/all agents are healthy/i);
  });

  it('should return error on failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500)',
    });

    const result = await predictionsHandler({ agent_id: AGENT });

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

describe('soft_block / hard_block are gateway-only and can be unavailable (PR #481)', () => {
  // The server refuses soft_block/hard_block with 409 ENFORCEMENT_UNAVAILABLE while
  // the gateway's Cloudflare budget-sync settings are unset. The client renders that
  // body as "... (409 ENFORCEMENT_UNAVAILABLE): <reason>" (api-client.test.ts).
  const ID = '123e4567-e89b-12d3-a456-426614174000';
  const UNAVAILABLE = {
    error:
      'Budget enforcement unavailable (409 ENFORCEMENT_UNAVAILABLE): Gateway budget enforcement is not switched on for Metrx yet. Soft Block and Hard Block would not stop or flag any request, so they are unavailable; Alert Only works.',
    status: 409,
  };
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  const tool = (name: string) =>
    (mockServer.registerTool as any).mock.calls.find(([n]: [string]) => n === name);
  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerBudgetTools(mockServer as any, mockClient as any);
  });

  const expectUnavailable = (result: any) => {
    expect(result.isError).toBe(true);
    const text: string = result.content[0].text;
    expect(text).toContain('409 ENFORCEMENT_UNAVAILABLE');
    expect(text).toMatch(/only on traffic through the Metrx gateway/);
    expect(text).toMatch(/Cloudflare budget-sync settings are not configured/);
    expect(text).toContain('Nothing was changed');
    expect(text).toContain('"alert_only"');
    expect(text).toContain('Soft Block and Hard Block would not stop'); // server reason kept
    expect(text).not.toMatch(/'admin' scope/);
    expect(text).not.toContain('✅');
  };

  it('set_budget with hard_block: the 409 says gateway-only, not configured, use alert_only', async () => {
    (mockClient.post as any).mockResolvedValueOnce(UNAVAILABLE);
    const result = await tool('set_budget')[2]({
      period: 'monthly',
      limit_dollars: 10,
      enforcement_mode: 'hard_block',
    });
    expectUnavailable(result);
  });

  it('update_budget_mode to soft_block: same precise 409, and no "enforcement →" success line', async () => {
    (mockClient.patch as any).mockResolvedValueOnce(UNAVAILABLE);
    const result = await tool('update_budget_mode')[2]({
      budget_id: ID,
      enforcement_mode: 'soft_block',
    });
    expectUnavailable(result);
    expect(result.content[0].text).not.toContain('enforcement → soft_block');
  });

  it('update_budget_mode resume refused for the same reason gets the same message', async () => {
    (mockClient.post as any).mockResolvedValueOnce(UNAVAILABLE);
    const result = await tool('update_budget_mode')[2]({ budget_id: ID, paused: false });
    expectUnavailable(result);
    expect(result.content[0].text).not.toContain('status → active');
  });

  it('a 409 "limit reached" on resume is NOT reported as enforcement-unavailable', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (409): Budget is at its limit for this period',
      status: 409,
    });
    const result = await tool('update_budget_mode')[2]({ budget_id: ID, paused: false });
    expect(result.content[0].text).toContain('at its limit');
    expect(result.content[0].text).not.toContain('ENFORCEMENT_UNAVAILABLE');
  });

  it('both descriptions and the enforcement_mode field say gateway-only and when it is unavailable', () => {
    for (const name of ['set_budget', 'update_budget_mode']) {
      const def = tool(name)[1];
      const desc: string = def.description;
      expect(desc, name).toMatch(/only on LLM calls routed through the Metrx gateway/);
      expect(desc, name).toMatch(/SDK or OpenTelemetry are never blocked/);
      expect(desc, name).toMatch(/gateway's Cloudflare settings for budget sync are unset/);
      expect(desc, name).toContain('409 ENFORCEMENT_UNAVAILABLE');
      expect(desc, name).not.toMatch(/strict enforcement/);
      const modeField = def.inputSchema.enforcement_mode;
      expect(modeField.description, name).toMatch(/gateway traffic only/);
      expect(modeField.description, name).toContain('ENFORCEMENT_UNAVAILABLE');
    }
  });
});
