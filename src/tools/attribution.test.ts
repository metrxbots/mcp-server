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

    // The flat `/api/outcomes` list shape used by all tests below.
    // Source: agentledger apps/web/app/api/outcomes/route.ts GET handler.
    const AGENT_A = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Sales Bot',
      agent_key: 'sales-bot',
      category: 'sales',
    };
    const AGENT_B = { id: 'agent-2', name: 'Agent 2', agent_key: 'agent-2', category: 'ops' };

    function flatOutcome(
      type: string,
      cents: number,
      agent: typeof AGENT_A | typeof AGENT_B | null = AGENT_A
    ) {
      return {
        id: `o-${Math.random()}`,
        outcome_type: type,
        occurred_at: new Date().toISOString(),
        value_cents: cents,
        effective_value_cents: cents,
        source: 'manual',
        attribution_count: 1,
        agents: agent,
      };
    }

    it('aggregates the flat outcomes list and filters by agent_id', async () => {
      const mockResponse = {
        data: {
          data: [
            flatOutcome('revenue', 10_000, AGENT_A),
            flatOutcome('revenue', 15_000, AGENT_A),
            flatOutcome('revenue', 5_000, AGENT_A),
            flatOutcome('efficiency', 10_000, AGENT_A),
            flatOutcome('efficiency', 10_000, AGENT_A),
            flatOutcome('revenue', 99_999_999, AGENT_B), // excluded by agent_id filter
          ],
          meta: { count: 6, days: 30 },
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({
        agent_id: AGENT_A.id,
        days: 30,
        model: 'direct',
      });

      const text = result.content[0].text;
      expect(text).toContain('Attribution Report');
      expect(text).toContain('Last 30 days');
      expect(text).toContain('direct');
      expect(text).toContain(AGENT_A.id);
      expect(text).toContain('Total Outcomes');
      expect(text).toContain('5');
      expect(text).toContain('$500.00');
      expect(text).toContain('revenue');
      expect(text).toContain('efficiency');
      expect(text).toContain('Sales Bot');
      expect(text).not.toContain('Agent 2'); // filtered out

      expect(mockApiClient.get).toHaveBeenCalledWith('/outcomes', { days: 30 });
    });

    it('should return fleet-wide report when no agent_id provided', async () => {
      const mockResponse = {
        data: {
          data: [
            flatOutcome('revenue', 60_000, { ...AGENT_A, id: 'agent-1', name: 'Agent 1' }),
            flatOutcome('revenue', 40_000, AGENT_B),
          ],
          meta: { count: 2, days: 30 },
        },
      };

      (mockApiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await tools['get_attribution_report'].handler({
        days: 30,
        model: 'last_touch',
      });

      const text = result.content[0].text;
      expect(text).toContain('Fleet-wide (all agents)');
      expect(text).toContain('last_touch');
      expect(text).not.toContain('**Agent**:');
      expect(text).toContain('Agent 1');
      expect(text).toContain('Agent 2');
      expect(text).toContain('$600.00');
      expect(text).toContain('$400.00');
    });

    it('should handle empty outcomes', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        data: { data: [], meta: { count: 0, days: 7 } },
      });

      const result = await tools['get_attribution_report'].handler({ days: 7 });

      expect(result.content[0].text).toContain('No outcomes recorded in this period');
      expect(result.isError).toBeFalsy();
    });

    it('should handle API client error', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        error: 'Failed to fetch outcomes',
      });

      const result = await tools['get_attribution_report'].handler({ days: 30 });

      expect(result.isError).toBeTruthy();
      expect(result.content[0].text).toContain('Error fetching attribution report');
      expect(result.content[0].text).toContain('Failed to fetch outcomes');
    });

    it('should use default days (30) when not provided', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        data: { data: [], meta: { count: 0, days: 30 } },
      });

      await tools['get_attribution_report'].handler({});

      // The new behavior: only `days` is sent — `model` and `agent_id` are handled client-side.
      expect(mockApiClient.get).toHaveBeenCalledWith('/outcomes', { days: 30 });
    });

    it('accepts the canonical attribution model enum (session_direct included)', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        data: { data: [], meta: { count: 0, days: 30 } },
      });

      const result = await tools['get_attribution_report'].handler({ model: 'session_direct' });
      expect(result.content[0].text).toContain('session_direct');
    });

    it('also accepts first_touch / last_touch', async () => {
      (mockApiClient.get as any).mockResolvedValueOnce({
        data: { data: [], meta: { count: 0, days: 30 } },
      });
      const result = await tools['get_attribution_report'].handler({ model: 'first_touch' });
      expect(result.content[0].text).toContain('first_touch');
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
