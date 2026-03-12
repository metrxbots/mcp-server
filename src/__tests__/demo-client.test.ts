/**
 * Demo Client Tests
 *
 * Verifies that DemoApiClient returns valid mock data for all API paths
 * used by the 23 MCP tools. Also tests the server-factory overload
 * that accepts a pre-built client for demo mode.
 */

import { describe, it, expect } from 'vitest';
import { DemoApiClient } from '../../dist/services/demo-client';
import { createMcpServer } from '../../dist/server-factory';

const DEMO_AGENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DEMO_BUDGET_ID = 'd4e5f6a7-b8c9-0123-defa-456789012345';
const DEMO_EXPERIMENT_ID = 'e5f6a7b8-c9d0-1234-efab-567890123456';

describe('DemoApiClient', () => {
  const client = new DemoApiClient();

  describe('GET — Dashboard tools', () => {
    it('should return dashboard summary for /dashboard', async () => {
      const result = await client.get('/dashboard');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      const data = result.data as any;
      expect(data.agents).toBeDefined();
      expect(data.agents.total).toBeGreaterThan(0);
      expect(data.cost).toBeDefined();
      expect(typeof data.cost.total_cost_cents).toBe('number');
    });

    it('should include optimization suggestions when requested', async () => {
      const result = await client.get('/dashboard', { include_optimization: true });
      expect(result.error).toBeUndefined();
      const data = result.data as any;
      expect(data.optimization).toBeDefined();
    });

    it('should include cost leak report when requested', async () => {
      const result = await client.get('/dashboard', { include_cost_leak_scan: true });
      expect(result.error).toBeUndefined();
      const data = result.data as any;
      expect(data.cost_leak_report).toBeDefined();
    });

    it('should return agent list for /agents', async () => {
      const result = await client.get('/agents');
      expect(result.error).toBeUndefined();
      const data = result.data as any;
      expect(Array.isArray(data.agents)).toBe(true);
      expect(data.agents.length).toBeGreaterThan(0);
      const agent = data.agents[0];
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.status).toBeDefined();
    });

    it('should return agent detail for /agents/:id', async () => {
      const result = await client.get(`/agents/${DEMO_AGENT_ID}`);
      expect(result.error).toBeUndefined();
      const data = result.data as any;
      expect(data.id).toBe(DEMO_AGENT_ID);
      expect(data.name).toBeDefined();
      expect(data.primary_model).toBeDefined();
    });

    it('should return error for unknown agent ID', async () => {
      const result = await client.get('/agents/unknown-id-12345');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });
  });

  describe('GET — Optimization tools', () => {
    it('should return agent metrics for /agents/:id/metrics', async () => {
      const result = await client.get(`/agents/${DEMO_AGENT_ID}/metrics`);
      expect(result.error).toBeUndefined();
      const data = result.data as any;
      expect(data.optimization).toBeDefined();
    });

    it('should return model routing for /agents/:id/route', async () => {
      const result = await client.get(`/agents/${DEMO_AGENT_ID}/route`);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should return model comparison for /agents/models/compare', async () => {
      const result = await client.get('/agents/models/compare');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('GET — Budget tools', () => {
    it('should return budget status for /budgets/status', async () => {
      const result = await client.get('/budgets/status');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('GET — Alert tools', () => {
    it('should return alerts for /alerts', async () => {
      const result = await client.get('/alerts');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should return failure predictions for /predictions', async () => {
      const result = await client.get('/predictions');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('GET — Experiment tools', () => {
    it('should return experiments list for /experiments', async () => {
      const result = await client.get('/experiments');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('GET — Attribution tools', () => {
    it('should return ROI analysis for /agents/:id/roi', async () => {
      const result = await client.get(`/agents/${DEMO_AGENT_ID}/roi`);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should return attribution data for /outcomes', async () => {
      const result = await client.get('/outcomes');
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('POST requests', () => {
    it('should handle budget creation POST /budgets', async () => {
      const result = await client.post('/budgets', {
        name: 'Test Budget',
        limit_dollars: 100,
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle outcome recording POST /outcomes', async () => {
      const result = await client.post('/outcomes', {
        agent_id: DEMO_AGENT_ID,
        outcome_type: 'revenue',
        value_cents: 50000,
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle experiment creation POST /experiments', async () => {
      const result = await client.post('/experiments', {
        agent_id: DEMO_AGENT_ID,
        variant_model: 'claude-3-haiku',
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle experiment stop POST /experiments/:id/stop', async () => {
      const result = await client.post(`/experiments/${DEMO_EXPERIMENT_ID}/stop`);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle agent settings POST /agents/:id/settings', async () => {
      const result = await client.post(`/agents/${DEMO_AGENT_ID}/settings`, {
        model: 'gpt-4o-mini',
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle alert threshold POST /alerts/thresholds', async () => {
      const result = await client.post('/alerts/thresholds', {
        metric: 'cost',
        threshold: 1000,
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle agent alert config POST /agents/:id/alerts', async () => {
      const result = await client.post(`/agents/${DEMO_AGENT_ID}/alerts`, {
        metric: 'error_rate',
        threshold: 0.1,
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('PATCH requests', () => {
    it('should handle budget update PATCH /budgets/:id', async () => {
      const result = await client.patch(`/budgets/${DEMO_BUDGET_ID}`, {
        mode: 'hard',
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should handle alert acknowledgement PATCH /alerts', async () => {
      const result = await client.patch('/alerts', {
        ids: ['alert-1'],
        action: 'acknowledge',
      });
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('ping()', () => {
    it('should return ok for demo client', async () => {
      const result = await client.ping();
      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Unknown paths — graceful fallback', () => {
    it('should return data (not error) with demo message for unknown GET path', async () => {
      const result = await client.get('/nonexistent/path');
      // DemoApiClient returns { data: { demo: true, message: ... } } for unknown paths
      expect(result.data).toBeDefined();
      const data = result.data as any;
      expect(data.demo).toBe(true);
    });

    it('should return data with demo message for unknown POST path', async () => {
      const result = await client.post('/nonexistent/path');
      expect(result.data).toBeDefined();
      const data = result.data as any;
      expect(data.demo).toBe(true);
    });

    it('should return data with demo message for unknown PATCH path', async () => {
      const result = await client.patch('/nonexistent/path');
      expect(result.data).toBeDefined();
      const data = result.data as any;
      expect(data.demo).toBe(true);
    });
  });

  describe('Data quality', () => {
    it('should return agents with consistent IDs across endpoints', async () => {
      const listResult = await client.get('/agents');
      const agents = (listResult.data as any).agents;
      const firstAgentId = agents[0].id;

      const detailResult = await client.get(`/agents/${firstAgentId}`);
      expect(detailResult.error).toBeUndefined();
      expect((detailResult.data as any).id).toBe(firstAgentId);
    });

    it('should return numeric cost values (not strings)', async () => {
      const result = await client.get('/dashboard');
      const data = result.data as any;
      expect(typeof data.cost.total_cost_cents).toBe('number');
    });

    it('should return valid agent statuses', async () => {
      const result = await client.get('/agents');
      const agents = (result.data as any).agents;
      const validStatuses = ['active', 'idle', 'error', 'paused'];
      for (const agent of agents) {
        expect(validStatuses).toContain(agent.status);
      }
    });

    it('should mark all demo responses with is_preview flag', async () => {
      const result = await client.get('/dashboard');
      const data = result.data as any;
      expect(data.is_preview).toBe(true);
    });
  });
});

describe('createMcpServer with DemoApiClient', () => {
  it('should create a server from DemoApiClient without throwing', () => {
    const client = new DemoApiClient();
    const server = createMcpServer(client);
    expect(server).toBeDefined();
  });

  it('should still accept apiKey string (backward compat)', () => {
    const server = createMcpServer('sk_test_demo_key');
    expect(server).toBeDefined();
  });
});
