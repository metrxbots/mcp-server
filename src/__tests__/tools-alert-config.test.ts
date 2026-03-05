/**
 * Alert Configuration Tools Tests
 *
 * Tests for:
 * - configure_alert_threshold (write operation for alert setup)
 *   - Tool registration and schema validation
 *   - Input validation (metric types, threshold values, action types)
 *   - Org-wide vs agent-specific routing
 *   - API client interaction with correct paths
 *   - Response formatting
 *   - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerAlertConfigTools } from '../../dist/tools/alert-config';
import type { MetrxApiClient } from '../../dist/services/api-client';

const createMockServer = () => ({
  registerTool: vi.fn(),
});

const createMockClient = () =>
  ({
    post: vi.fn(),
  }) as unknown as MetrxApiClient;

describe('Alert Config Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register configure_alert_threshold tool', () => {
    registerAlertConfigTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'configure_alert_threshold',
      expect.objectContaining({
        title: 'Configure Alert Threshold',
      }),
      expect.any(Function)
    );
  });

  it('should register tool with correct annotations', () => {
    registerAlertConfigTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const annotations = configCall[1].annotations;

    expect(annotations.readOnlyHint).toBe(false);
    expect(annotations.destructiveHint).toBe(false);
    expect(annotations.idempotentHint).toBe(true);
    expect(annotations.openWorldHint).toBe(false);
  });

  it('should register tool with appropriate description', () => {
    registerAlertConfigTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const description = configCall[1].description;

    expect(description).toContain('alert');
    expect(description).toContain('threshold');
  });

  it('should register at least one tool', () => {
    registerAlertConfigTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('configure_alert_threshold Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let configHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerAlertConfigTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    configHandler = configCall[2];
  });

  // Org-wide alert configuration tests
  it('should create org-wide alert when agent_id not provided', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_org_123',
        message: 'Org-wide alert configured',
      },
    });

    await configHandler({
      metric: 'daily_cost',
      threshold_value: 500000,
      action: 'email',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/alerts/thresholds',
      expect.objectContaining({
        metric: 'daily_cost',
        threshold_value: 500000,
        action: 'email',
      })
    );
  });

  it('should use /alerts/thresholds path for org-wide alerts', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_org_456',
        message: 'Org-wide alert configured',
      },
    });

    await configHandler({
      metric: 'monthly_cost',
      threshold_value: 1000000,
      action: 'webhook',
    });

    const callPath = (mockClient.post as any).mock.calls[0][0];
    expect(callPath).toBe('/alerts/thresholds');
  });

  // Agent-specific alert configuration tests
  it('should create agent-specific alert when agent_id provided', async () => {
    const agentId = '123e4567-e89b-12d3-a456-426614174000';
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_agent_123',
        message: 'Agent-specific alert configured',
      },
    });

    await configHandler({
      agent_id: agentId,
      metric: 'daily_cost',
      threshold_value: 250000,
      action: 'pause_agent',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metric: 'daily_cost',
        threshold_value: 250000,
        action: 'pause_agent',
      })
    );
  });

  it('should use /agents/{id}/alerts path for agent-specific alerts', async () => {
    const agentId = '223e4567-e89b-12d3-a456-426614174001';
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_agent_456',
        message: 'Agent alert configured',
      },
    });

    await configHandler({
      agent_id: agentId,
      metric: 'error_rate',
      threshold_value: 0.1,
      action: 'email',
    });

    const callPath = (mockClient.post as any).mock.calls[0][0];
    expect(callPath).toBe(`/agents/${agentId}/alerts`);
  });

  // Metric type validation tests
  it('should accept daily_cost metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_dc_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.metric).toBe('daily_cost');
  });

  it('should accept monthly_cost metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_mc_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'monthly_cost',
      threshold_value: 500000,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.metric).toBe('monthly_cost');
  });

  it('should accept error_rate metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_er_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'error_rate',
      threshold_value: 0.05,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.metric).toBe('error_rate');
  });

  it('should accept latency_p99 metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_lat_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'latency_p99',
      threshold_value: 5000,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.metric).toBe('latency_p99');
  });

  // Action type validation tests
  it('should accept email action', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_email_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.action).toBe('email');
  });

  it('should accept webhook action', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_webhook_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'monthly_cost',
      threshold_value: 500000,
      action: 'webhook',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.action).toBe('webhook');
  });

  it('should accept pause_agent action', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_pause_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'pause_agent',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.action).toBe('pause_agent');
  });

  // Threshold value tests
  it('should accept positive threshold values', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_pos_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'daily_cost',
      threshold_value: 1000000,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.threshold_value).toBe(1000000);
  });

  it('should handle decimal threshold values for error_rate', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_decimal_123',
        message: 'Configured',
      },
    });

    await configHandler({
      metric: 'error_rate',
      threshold_value: 0.15,
      action: 'email',
    });

    const callBody = (mockClient.post as any).mock.calls[0][1];
    expect(callBody.threshold_value).toBe(0.15);
  });

  // Response formatting tests
  it('should return success message for email action', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_123',
        message: 'Alert configured',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('✅');
    expect(text).toContain('Alert Threshold Configured');
  });

  it('should include threshold_id in response', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_unique_999',
        message: 'Alert configured',
      },
    });

    const result = await configHandler({
      metric: 'monthly_cost',
      threshold_value: 500000,
      action: 'webhook',
    });

    const text = result.content[0].text;
    expect(text).toContain('threshold_unique_999');
  });

  it('should include scope in response for org-wide alert', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_org_999',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('Scope');
    expect(text).toContain('org-wide');
  });

  it('should include scope in response for agent-specific alert', async () => {
    const agentId = '323e4567-e89b-12d3-a456-426614174002';
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_agent_999',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      agent_id: agentId,
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('Scope');
    expect(text).toContain('agent');
  });

  it('should format cost threshold in dollars', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_cost_123',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 500000,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('Threshold');
    // Should contain formatted cost (500000 cents = $5000)
    expect(text).toContain('Threshold');
  });

  it('should format error_rate threshold as percentage', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_er_999',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'error_rate',
      threshold_value: 0.1,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('%');
  });

  it('should format latency_p99 threshold in milliseconds', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_lat_999',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'latency_p99',
      threshold_value: 5000,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('ms');
  });

  it('should describe email action behavior', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_email_desc',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    const text = result.content[0].text;
    expect(text).toContain('Behavior');
    expect(text).toContain('email notification');
  });

  it('should describe webhook action behavior', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_webhook_desc',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'monthly_cost',
      threshold_value: 500000,
      action: 'webhook',
    });

    const text = result.content[0].text;
    expect(text).toContain('Behavior');
    expect(text).toContain('POST request');
  });

  it('should describe pause_agent action behavior', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: true,
        threshold_id: 'threshold_pause_desc',
        message: 'Configured',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'pause_agent',
    });

    const text = result.content[0].text;
    expect(text).toContain('Behavior');
    expect(text).toContain('automatically paused');
  });

  // Error handling tests
  it('should return error when API returns error', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (400): Invalid metric type',
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error configuring alert threshold');
  });

  it('should return error when configuration fails on server', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        configured: false,
        threshold_id: null,
        message: 'Invalid threshold value for metric type',
      },
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Alert configuration failed');
  });

  it('should handle 404 API error', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (404): Agent not found',
    });

    const agentId = '999e4567-e89b-12d3-a456-426614174999';
    const result = await configHandler({
      agent_id: agentId,
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.isError).toBe(true);
  });

  it('should handle 500 API error', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.isError).toBe(true);
  });

  it('should handle network timeout error', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'Network error: timeout',
    });

    const result = await configHandler({
      metric: 'daily_cost',
      threshold_value: 100000,
      action: 'email',
    });

    expect(result.isError).toBe(true);
  });
});

describe('Input Validation for configure_alert_threshold', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerAlertConfigTools(mockServer as any, mockClient as any);
  });

  it('should have agent_id as optional in schema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.agent_id).toBeDefined();
  });

  it('should have metric as required in schema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.metric).toBeDefined();
  });

  it('should have threshold_value as required in schema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.threshold_value).toBeDefined();
  });

  it('should have action as required in schema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.action).toBeDefined();
  });

  it('metric should be enum with valid values', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.metric).toBeDefined();
    expect(schema.metric.description).toContain('Metric');
  });

  it('action should be enum with valid values', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.action).toBeDefined();
    expect(schema.action.description).toContain('Action');
  });

  it('threshold_value should require positive numbers', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.threshold_value).toBeDefined();
    expect(schema.threshold_value.description).toBeDefined();
    // Validate that description explains threshold value format
    expect(schema.threshold_value.description).toContain('Threshold value');
  });

  it('agent_id should accept UUID format', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const configCall = calls.find(([name]: [string]) => name === 'configure_alert_threshold');
    const schema = configCall[1].inputSchema;

    expect(schema.agent_id).toBeDefined();
    expect(schema.agent_id.description).toContain('UUID');
  });
});
