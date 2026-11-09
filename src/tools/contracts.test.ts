/**
 * Job Contract Tools Tests (W-C01, W1-4b) — get_job_contract (read) and
 * set_job_contract (admin-scoped write; recorded, not enforced).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetrxApiClient } from '../services/api-client.js';
import { registerContractTools } from './contracts.js';

const mockApiClient = { post: vi.fn(), get: vi.fn(), patch: vi.fn() } as unknown as MetrxApiClient;

function createMockMcpServer(): McpServer {
  const tools: Record<string, { inputSchema: any; handler: Function }> = {};
  return {
    registerTool: (name: string, definition: any, handler: Function) => {
      tools[name] = { inputSchema: definition, handler };
    },
    __getTools: () => tools,
  } as unknown as McpServer;
}

const row = {
  id: 'c-1',
  workload: 'extraction',
  agent_scope: 'manco',
  version: 3,
  status: 'active',
  created_at: '2026-09-28T00:00:00Z',
  objective: 'Extract every DDQ field.',
  unit_of_work: 'one DDQ extracted',
  acceptance_criteria: [{ metric: 'field_accuracy', op: '>=', threshold: 0.97, window: '7d' }],
  kpi_target: { metric: 'documents_accepted', target: 120, window: '30d' },
  budget: { limit_microdollars: 250_000_000, period: 'monthly' },
  owner: 'ops-lead@example.com',
};

describe('Contract Tools', () => {
  let tools: Record<string, { inputSchema: any; handler: Function }>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockMcpServer();
    registerContractTools(server, mockApiClient);
    tools = (server as any).__getTools();
  });

  it('registers the read tool as read-only', () => {
    expect(tools['get_job_contract'].inputSchema.annotations.readOnlyHint).toBe(true);
  });

  it('registers the admin-scoped write tool alongside the read tool (W1-4b)', () => {
    expect(Object.keys(tools).sort()).toEqual(['get_job_contract', 'set_job_contract']);
    const def = tools['set_job_contract'].inputSchema;
    expect(def.annotations.readOnlyHint).toBe(false);
    expect(def.description).toContain("'admin' scope");
    expect(def.description).toMatch(/not enforced/i);
  });

  describe('get_job_contract', () => {
    it('renders current + history', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: {
          agent_key: 'manco',
          current: [row],
          versions: [row, { ...row, id: 'c-0', version: 2, status: 'superseded' }],
        },
      });
      const res = await tools['get_job_contract'].handler({ agent_key: 'manco' });
      expect(mockApiClient.get).toHaveBeenCalledWith('/v1/agents/manco/contract');
      const text = res.content[0].text;
      expect(text).toContain('1 current, 2 version(s) total');
      expect(text).toContain('field_accuracy >= 0.97 over 7d');
      expect(text).toContain('v2 extraction superseded');
    });

    it('renders the designed empty state with its primary action (never a zero)', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: {
          agent_key: 'manco',
          current: [],
          versions: [],
          empty_state: { reason: 'no_contract', primary_action: 'Set objective' },
        },
      });
      const res = await tools['get_job_contract'].handler({ agent_key: 'manco' });
      expect(res.isError).toBeUndefined();
      expect(res.content[0].text).toContain('No contract governs agent manco yet.');
      expect(res.content[0].text).toContain('Next: Set objective');
      expect(res.content[0].text).toContain('set_job_contract');
      expect(res.content[0].text).toContain("'admin' scope");
    });
  });

  describe('set_job_contract', () => {
    const args = {
      agent_key: 'manco ops',
      workload: 'extraction',
      objective: 'Extract every DDQ field.',
      unit_of_work: 'one DDQ extracted',
      acceptance_criteria: [{ metric: 'field_accuracy', op: '>=', threshold: 0.97, window: '7d' }],
      kpi_target: { metric: 'documents_accepted', target: 120, window: '30d' },
      budget_dollars: 250,
      budget_period: 'monthly',
      owner: 'ops-lead@example.com',
      policy_terms: { quality_floor: 0.9 },
    };

    it('posts the route body: budget in micro-dollars, policy terms spread first, key encoded', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: row, superseded_count: 1 });
      const res = await tools['set_job_contract'].handler(args);
      expect(mockApiClient.post).toHaveBeenCalledWith('/v1/agents/manco%20ops/contract', {
        quality_floor: 0.9,
        workload: 'extraction',
        objective: 'Extract every DDQ field.',
        unit_of_work: 'one DDQ extracted',
        acceptance_criteria: [
          { metric: 'field_accuracy', op: '>=', threshold: 0.97, window: '7d' },
        ],
        kpi_target: { metric: 'documents_accepted', target: 120, window: '30d' },
        budget: { limit_microdollars: 250_000_000, period: 'monthly' },
        owner: 'ops-lead@example.com',
      });
      const text = res.content[0].text;
      expect(res.isError).toBeUndefined();
      expect(text).toContain('v3');
      expect(text).toContain('superseded 1 prior version');
      expect(text).toMatch(/not enforced/i);
    });

    it('job fields win over a colliding policy term', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: row });
      await tools['set_job_contract'].handler({ ...args, policy_terms: { workload: 'hijack' } });
      const body = (mockApiClient.post as any).mock.calls[0][1];
      expect(body.workload).toBe('extraction');
    });

    // Main's W1-4 refuses a first version for a workload the org has a policy
    // for unless the caller says where engine terms come from; the tool must
    // be able to say it.
    it('forwards policy_defaults when given, and omits it otherwise', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: row });
      await tools['set_job_contract'].handler({ ...args, policy_defaults: 'observe_only' });
      expect((mockApiClient.post as any).mock.calls[0][1].policy_defaults).toBe('observe_only');
      await tools['set_job_contract'].handler(args);
      expect((mockApiClient.post as any).mock.calls[1][1]).not.toHaveProperty('policy_defaults');
    });

    it('surfaces a refused write as an error', async () => {
      (mockApiClient.post as any).mockResolvedValue({
        error: "Insufficient API key scope: this call needs 'admin'",
      });
      const res = await tools['set_job_contract'].handler(args);
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("needs 'admin'");
    });

    // Prod QA 2026-10-11 (Fundry): an agent governed by an org workload-level
    // policy was reported as having no contract. The readout's `governing` is
    // the engine rule; the empty-state copy must name it.
    it('governed by a policy without job terms: names the governing version, never "no contract"', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: {
          agent_key: 'ddq',
          current: [],
          versions: [],
          governing: [
            {
              id: 'g-2',
              workload: 'generation',
              version: 2,
              scope: 'workload',
              engine_reads: true,
              has_job_terms: false,
            },
          ],
          empty_state: { reason: 'no_job_terms', primary_action: 'Set objective' },
        },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'ddq' })).content[0].text;
      expect(text).toContain(
        'Agent ddq is governed by generation v2 (workload-level policy), which states no job terms yet.'
      );
      expect(text).toContain('The engine reads generation v2');
      expect(text).not.toMatch(/no (job )?contract/i);
      expect(text).toContain('Next: Set objective');
    });

    // Review r2-n1: derived workload with no active contract.
    it('derived workload without an active contract: says so, never "no single workload derives"', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: {
          agent_key: 'ddq',
          current: [],
          versions: [],
          derived_workload: 'classification',
          ambiguous_workloads: [],
          governing: [
            {
              id: 'g-2',
              workload: 'generation',
              version: 2,
              scope: 'workload',
              engine_reads: false,
              has_job_terms: false,
            },
          ],
          empty_state: { reason: 'no_job_terms', primary_action: 'Set objective' },
        },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'ddq' })).content[0].text;
      expect(text).toContain(
        'its review signals are for classification, which no contract covers now'
      );
      expect(text).not.toContain('no single workload derives');
    });

    it('graded by an org policy with job terms: shows the governing set, not an empty CURRENT', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: {
          agent_key: 'ddq',
          current: [],
          versions: [],
          governing: [
            {
              id: 'g-2',
              workload: 'generation',
              version: 2,
              scope: 'workload',
              engine_reads: true,
              has_job_terms: true,
            },
          ],
        },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'ddq' })).content[0].text;
      expect(text).toContain(
        'GOVERNING (per workload)\ngeneration v2 (workload-level policy), the engine reads this one'
      );
      expect(text).toContain('CURRENT\n(no agent-scoped version)');
    });
  });
});
