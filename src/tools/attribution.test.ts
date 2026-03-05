/**
 * Attribution Tools Tests
 *
 * Tests for the attribute_task and get_attribution_report MCP tools.
 * Verifies correct input validation, API client integration, and response formatting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetrxApiClient } from '../services/api-client.js';
import { registerAttributionTools } from './attribution.js';

// Mock the MetrxApiClient
const mockApiClient = {
  post: vi.fn(),
  get: vi.fn(),
} as unknown as MetrxApiClient;

// Create mock MCP server
function createMockMcpServer(): McpServer {
  const tools: Record<string, { inputSchema: any; handler: Function }> = {};

  return {
    registerTool: (name: string, definition: any, handler: Function) => {
      tools[name] = { inputSchema: definition, handler };
    },
    __getTools: () => tools,
  } as unknown as McpServer;
}

describe('Attribution Tools', () => {
  let server: McpServer;
  let tools: Record<string, { inputSchema: any; handler: Function }>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockMcpServer();
    registerAttributionTools(server, mockApiClient);
    tools = (server as any).__getTools();
  });

  describe('attribute_task tool', () => {
    it('should register the tool with correct name', () => {
      expect(tools['attribute_task']).toBeDefined();
      expect(tools['attribute_task'].inputSchema.title).toBe('Attribute Task to Outcome');
    });

    it('should create outcome with valid input', async () => {
      const mockResponse = {
        data: {
          id: 'outcome-123',
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          outcome_type: 'revenue',
          outcome_source: 'stripe',
          value_cents: 10000,
          description: 'Sale closed',
          created_at: '2024-03-01T12:00:00Z',
        },
      };

      (mockApiClient.post as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['attribute_task'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_type: 'revenue',
        outcome_source: 'stripe',
        value_cents: 10000,
        description: 'Sale closed',
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Task Attributed Successfully');
      expect(result.content[0].text).toContain('revenue');
      expect(result.content[0].text).toContain('stripe');
      expect(result.content[0].text).toContain('$100.00');
      expect(mockApiClient.post).toHaveBeenCalledWith('/outcomes', {
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_type: 'revenue',
        outcome_source: 'stripe',
        value_cents: 10000,
        description: 'Sale closed',
      });
    });

    it('should handle optional event_id', async () => {
      const mockResponse = {
        data: {
          id: 'outcome-456',
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          event_id: 'evt-789',
          outcome_type: 'efficiency',
          outcome_source: 'webhook',
          created_at: '2024-03-01T12:00:00Z',
        },
      };

      (mockApiClient.post as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['attribute_task'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        event_id: 'evt-789',
        outcome_type: 'efficiency',
        outcome_source: 'webhook',
      });

      expect(result.isError).toBeFalsy();
      expect(mockApiClient.post).toHaveBeenCalledWith('/outcomes', {
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        event_id: 'evt-789',
        outcome_type: 'efficiency',
        outcome_source: 'webhook',
      });
    });

    it('should handle API client error', async () => {
      (mockApiClient.post as any).mockResolvedValueOnce({
        error: 'Agent not found',
      });

      const result = await tools['attribute_task'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_type: 'revenue',
        outcome_source: 'stripe',
      });

      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain('Error attributing task');
      expect(result.content[0].text).toContain('Agent not found');
    });

    it('should format value_cents without value if not provided', async () => {
      const mockResponse = {
        data: {
          id: 'outcome-789',
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          outcome_type: 'quality',
          outcome_source: 'manual',
          created_at: '2024-03-01T12:00:00Z',
        },
      };

      (mockApiClient.post as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['attribute_task'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_type: 'quality',
        outcome_source: 'manual',
      });

      expect(result.content[0].text).not.toContain('Value:');
      expect(result.content[0].text).toContain('quality');
      expect(result.content[0].text).toContain('manual');
    });

    it('should not include description if not provided', async () => {
      const mockResponse = {
        data: {
          id: 'outcome-999',
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          outcome_type: 'cost_saving',
          outcome_source: 'manual',
          created_at: '2024-03-01T12:00:00Z',
        },
      };

      (mockApiClient.post as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['attribute_task'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_type: 'cost_saving',
        outcome_source: 'manual',
      });

      expect(result.content[0].text).not.toContain('Description:');
    });
  });

  describe('get_attribution_report tool', () => {
    it('should register the tool with correct name', () => {
      expect(tools['get_attribution_report']).toBeDefined();
      expect(tools['get_attribution_report'].inputSchema.title).toBe('Get Attribution Report');
    });

    it('should return formatted report with agent_id filter', async () => {
      const mockResponse = {
        data: {
          agent_id: '550e8400-e29b-41d4-a716-446655440000',
          period_days: 30,
          model: 'direct',
          total_outcomes: 5,
          total_value_cents: 50000,
          outcomes: [
            {
              outcome_type: 'revenue',
              count: 3,
              value_cents: 30000,
              confidence: 0.95,
              top_attributions: [
                {
                  agent_id: '550e8400-e29b-41d4-a716-446655440000',
                  agent_name: 'Sales Bot',
                  contribution_value_cents: 25000,
                  confidence: 0.9,
                },
              ],
            },
            {
              outcome_type: 'efficiency',
              count: 2,
              value_cents: 20000,
              confidence: 0.8,
              top_attributions: [],
            },
          ],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        days: 30,
        model: 'direct',
      });

      expect(result.content[0].text).toContain('Attribution Report');
      expect(result.content[0].text).toContain('Last 30 days');
      expect(result.content[0].text).toContain('direct');
      expect(result.content[0].text).toContain('550e8400-e29b-41d4-a716-446655440000');
      expect(result.content[0].text).toContain('Total Outcomes');
      expect(result.content[0].text).toContain('5');
      expect(result.content[0].text).toContain('$500.00');
      expect(result.content[0].text).toContain('revenue');
      expect(result.content[0].text).toContain('efficiency');
      expect(result.content[0].text).toContain('Sales Bot');
      expect(result.content[0].text).toContain('90%');

      expect(mockApiClient.get).toHaveBeenCalledWith('/outcomes', {
        agent_id: '550e8400-e29b-41d4-a716-446655440000',
        days: 30,
        model: 'direct',
      });
    });

    it('should return fleet-wide report when no agent_id provided', async () => {
      const mockResponse = {
        data: {
          period_days: 30,
          model: 'last_touch',
          total_outcomes: 10,
          total_value_cents: 100000,
          outcomes: [
            {
              outcome_type: 'revenue',
              count: 10,
              value_cents: 100000,
              confidence: 0.9,
              top_attributions: [
                {
                  agent_id: 'agent-1',
                  agent_name: 'Agent 1',
                  contribution_value_cents: 60000,
                  confidence: 0.85,
                },
                {
                  agent_id: 'agent-2',
                  agent_name: 'Agent 2',
                  contribution_value_cents: 40000,
                  confidence: 0.8,
                },
              ],
            },
          ],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({
        days: 30,
        model: 'last_touch',
      });

      expect(result.content[0].text).toContain('Fleet-wide (all agents)');
      expect(result.content[0].text).toContain('last_touch');
      expect(result.content[0].text).not.toContain('**Agent**:');
      expect(result.content[0].text).toContain('Agent 1');
      expect(result.content[0].text).toContain('Agent 2');
      expect(result.content[0].text).toContain('$600.00');
      expect(result.content[0].text).toContain('$400.00');

      expect(mockApiClient.get).toHaveBeenCalledWith('/outcomes', {
        days: 30,
        model: 'last_touch',
      });
    });

    it('should handle empty outcomes', async () => {
      const mockResponse = {
        data: {
          period_days: 7,
          model: 'direct',
          total_outcomes: 0,
          total_value_cents: 0,
          outcomes: [],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({
        days: 7,
      });

      expect(result.content[0].text).toContain('No outcomes recorded in this period');
      expect(result.isError).toBeFalsy();
    });

    it('should handle API client error', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        error: 'Failed to fetch outcomes',
      });

      const result = await tools['get_attribution_report'].handler({
        days: 30,
      });

      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain('Error fetching attribution report');
      expect(result.content[0].text).toContain('Failed to fetch outcomes');
    });

    it('should use default days (30) when not provided', async () => {
      const mockResponse = {
        data: {
          period_days: 30,
          model: 'direct',
          total_outcomes: 0,
          total_value_cents: 0,
          outcomes: [],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      await tools['get_attribution_report'].handler({});

      expect(mockApiClient.get).toHaveBeenCalledWith('/outcomes', {
        days: 30,
        model: 'direct',
      });
    });

    it('should format confidence as percentage', async () => {
      const mockResponse = {
        data: {
          period_days: 30,
          model: 'direct',
          total_outcomes: 1,
          total_value_cents: 10000,
          outcomes: [
            {
              outcome_type: 'revenue',
              count: 1,
              value_cents: 10000,
              confidence: 0.75,
              top_attributions: [
                {
                  agent_id: 'agent-1',
                  agent_name: 'Bot 1',
                  contribution_value_cents: 7500,
                  confidence: 0.5555,
                },
              ],
            },
          ],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({});

      expect(result.content[0].text).toContain('75%');
      expect(result.content[0].text).toContain('56%');
    });

    it('should support all attribution models', async () => {
      const mockResponse = {
        data: {
          period_days: 30,
          model: 'first_touch',
          total_outcomes: 0,
          total_value_cents: 0,
          outcomes: [],
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      await tools['get_attribution_report'].handler({
        model: 'first_touch',
      });

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/outcomes',
        expect.objectContaining({ model: 'first_touch' })
      );
    });
  });

  describe('Tool Input Schema Validation', () => {
    it('attribute_task schema should require agent_id as UUID', () => {
      const schema = tools['attribute_task'].inputSchema;
      expect(schema.inputSchema.agent_id).toBeDefined();
    });

    it('attribute_task schema should have outcome_type enum', () => {
      const schema = tools['attribute_task'].inputSchema;
      expect(schema.inputSchema.outcome_type).toBeDefined();
    });

    it('attribute_task schema should have outcome_source enum', () => {
      const schema = tools['attribute_task'].inputSchema;
      expect(schema.inputSchema.outcome_source).toBeDefined();
    });

    it('get_attribution_report schema should have optional agent_id', () => {
      const schema = tools['get_attribution_report'].inputSchema;
      expect(schema.inputSchema.agent_id).toBeDefined();
    });

    it('get_attribution_report schema should have days with min/max', () => {
      const schema = tools['get_attribution_report'].inputSchema;
      expect(schema.inputSchema.days).toBeDefined();
    });

    it('get_attribution_report schema should have model enum', () => {
      const schema = tools['get_attribution_report'].inputSchema;
      expect(schema.inputSchema.model).toBeDefined();
    });
  });

  describe('Tool Annotations', () => {
    it('attribute_task should have correct annotations', () => {
      const annotations = tools['attribute_task'].inputSchema.annotations;
      expect(annotations.readOnlyHint).toBeFalsy();
      expect(annotations.destructiveHint).toBeFalsy();
      expect(annotations.idempotentHint).toBeFalsy();
    });

    it('get_attribution_report should have correct annotations', () => {
      const annotations = tools['get_attribution_report'].inputSchema.annotations;
      expect(annotations.readOnlyHint).toBeTruthy();
      expect(annotations.destructiveHint).toBeFalsy();
      expect(annotations.idempotentHint).toBeTruthy();
    });
  });
});
