/**
 * Job Contract Tools Tests (W-C01, W1-4b) — get_job_contract (read) and
 * set_job_contract (admin-scoped write; recorded, not enforced).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetrxApiClient } from '../services/api-client.js';
import { z } from 'zod';
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

describe('Contract Tools — human_baseline and vendor terms (mig 157)', () => {
  let tools: Record<string, { inputSchema: any; handler: Function }>;
  const LABEL = "the vendor's definition, not verified";
  const DEFINITION = 'A chat the customer did not reopen within 72 hours.';
  const vendorRow = {
    ...row,
    human_baseline: {
      cost_per_unit_microdollars: 4_000_000,
      minutes_per_unit: 12,
      basis: 'time sheets',
    },
    vendor_name: 'Acme Support AI',
    billable_unit: 'resolution',
    vendor_resolved_definition: DEFINITION,
  };
  const base = {
    agent_key: 'manco',
    workload: 'extraction',
    objective: 'Extract every DDQ field.',
    unit_of_work: 'one DDQ extracted',
    acceptance_criteria: [{ metric: 'field_accuracy', op: '>=', threshold: 0.97, window: '7d' }],
    kpi_target: { metric: 'documents_accepted', target: 120, window: '30d' },
    budget_dollars: 250,
    budget_period: 'monthly',
    owner: 'ops-lead@example.com',
  };
  const inputOf = (tool: string) => z.object(tools[tool].inputSchema.inputSchema);

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockMcpServer();
    registerContractTools(server, mockApiClient);
    tools = (server as any).__getTools();
  });

  describe('get_job_contract', () => {
    it('returns the vendor terms, the definition verbatim and labelled "the vendor\'s definition, not verified"', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: { agent_key: 'manco', current: [vendorRow], versions: [vendorRow] },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'manco' })).content[0]
        .text;
      expect(text).toContain('Vendor: Acme Support AI');
      expect(text).toContain('Vendor bills per: resolution');
      expect(text).toContain(`(${LABEL}): ${JSON.stringify(DEFINITION)}`);
      // The label is on the same line as the definition, not somewhere else.
      const line = text.split('\n').find((l: string) => l.includes(DEFINITION))!;
      expect(line).toContain(LABEL);
    });

    it('shows the human baseline as owner-stated', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: { agent_key: 'manco', current: [vendorRow], versions: [vendorRow] },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'manco' })).content[0]
        .text;
      expect(text).toContain(
        'Human baseline: $4.00 per unit, 12 min (owner-stated, not measured; basis: time sheets)'
      );
    });

    it('prints no vendor lines (and no label) for a version without vendor terms', async () => {
      (mockApiClient.get as any).mockResolvedValue({
        data: { agent_key: 'manco', current: [row], versions: [row] },
      });
      const text = (await tools['get_job_contract'].handler({ agent_key: 'manco' })).content[0]
        .text;
      expect(text).not.toContain('Vendor');
      expect(text).not.toContain(LABEL);
      expect(text).not.toContain('Human baseline');
    });

    it('description says the definition is labelled not verified', () => {
      expect(tools['get_job_contract'].inputSchema.description).toContain(LABEL);
    });
  });

  describe('set_job_contract', () => {
    it('accepts human_baseline and sends micro-dollars on the wire', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: vendorRow });
      await tools['set_job_contract'].handler({
        ...base,
        human_baseline: { cost_per_unit_usd: 4.25, minutes_per_unit: 12, basis: 'time sheets' },
      });
      const body = (mockApiClient.post as any).mock.calls[0][1];
      expect(body.human_baseline).toEqual({
        cost_per_unit_microdollars: 4_250_000,
        minutes_per_unit: 12,
        basis: 'time sheets',
      });
    });

    it('omits minutes_per_unit from the wire when not given', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: vendorRow });
      await tools['set_job_contract'].handler({
        ...base,
        human_baseline: { cost_per_unit_usd: 4, basis: 'quote' },
      });
      expect((mockApiClient.post as any).mock.calls[0][1].human_baseline).toEqual({
        cost_per_unit_microdollars: 4_000_000,
        basis: 'quote',
      });
    });

    it('sends the three vendor fields, the definition unchanged', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: vendorRow });
      await tools['set_job_contract'].handler({
        ...base,
        vendor_name: 'Acme Support AI',
        billable_unit: 'resolution',
        vendor_resolved_definition: `  ${DEFINITION}  `,
      });
      const body = (mockApiClient.post as any).mock.calls[0][1];
      expect(body.vendor_name).toBe('Acme Support AI');
      expect(body.billable_unit).toBe('resolution');
      expect(body.vendor_resolved_definition).toBe(`  ${DEFINITION}  `);
    });

    it('omitted optionals are absent from the body (so an edit keeps the current values); null is sent as null (clear)', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: row });
      await tools['set_job_contract'].handler(base);
      let body = (mockApiClient.post as any).mock.calls[0][1];
      for (const k of [
        'human_baseline',
        'vendor_name',
        'billable_unit',
        'vendor_resolved_definition',
      ]) {
        expect(body).not.toHaveProperty(k);
      }
      await tools['set_job_contract'].handler({
        ...base,
        human_baseline: null,
        vendor_name: null,
        billable_unit: null,
        vendor_resolved_definition: null,
      });
      body = (mockApiClient.post as any).mock.calls[1][1];
      expect(body).toMatchObject({
        human_baseline: null,
        vendor_name: null,
        billable_unit: null,
        vendor_resolved_definition: null,
      });
    });

    it('the input schema enforces the caps (200 / 100 / 2000) and rejects a sub-micro-dollar baseline', () => {
      const schema = inputOf('set_job_contract');
      const ok = (extra: object) => schema.safeParse({ ...base, ...extra }).success;
      expect(ok({ vendor_name: 'a'.repeat(200) })).toBe(true);
      expect(ok({ vendor_name: 'a'.repeat(201) })).toBe(false);
      expect(ok({ billable_unit: 'a'.repeat(100) })).toBe(true);
      expect(ok({ billable_unit: 'a'.repeat(101) })).toBe(false);
      expect(ok({ vendor_resolved_definition: 'a'.repeat(2000) })).toBe(true);
      expect(ok({ vendor_resolved_definition: 'a'.repeat(2001) })).toBe(false);
      expect(ok({ human_baseline: { cost_per_unit_usd: 0, basis: 'x' } })).toBe(false);
      expect(ok({ human_baseline: { cost_per_unit_usd: 4, basis: '' } })).toBe(false);
    });

    it('its published result echoes the labelled definition from the returned row', async () => {
      (mockApiClient.post as any).mockResolvedValue({ data: vendorRow });
      const text = (
        await tools['set_job_contract'].handler({ ...base, vendor_resolved_definition: DEFINITION })
      ).content[0].text;
      expect(text).toContain(`(${LABEL}): ${JSON.stringify(DEFINITION)}`);
    });
  });
});

describe('Contract Tools — NUL guard (set_job_contract)', () => {
  it.each([
    'agent_key',
    'workload',
    'objective',
    'unit_of_work',
    'owner',
    'notes',
    'vendor_name',
    'billable_unit',
    'vendor_resolved_definition',
  ])('rejects U+0000 in %s with a clear message', (field) => {
    const server = createMockMcpServer();
    registerContractTools(server, mockApiClient);
    const tools = (server as any).__getTools();
    const schema = z.object(tools['set_job_contract'].inputSchema.inputSchema);
    const good = {
      agent_key: 'manco',
      workload: 'extraction',
      objective: 'Extract every DDQ field.',
      unit_of_work: 'one DDQ extracted',
      acceptance_criteria: [{ metric: 'field_accuracy', op: '>=', threshold: 0.97, window: '7d' }],
      kpi_target: { metric: 'documents_accepted', target: 120, window: '30d' },
      budget_dollars: 250,
      budget_period: 'monthly',
      owner: 'ops-lead@example.com',
    };
    expect(schema.safeParse(good).success).toBe(true);
    const r = schema.safeParse({ ...good, [field]: 'a\u0000b' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]!.message).toBe('must not contain a NUL (U+0000) character');
  });
});
