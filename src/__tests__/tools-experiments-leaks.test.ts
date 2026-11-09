/**
 * Experiments & Cost Leak Detector Tests
 *
 * Tests for:
 * - create_model_experiment / get_experiment_results / stop_experiment
 *   (agent-scoped routes under /api/agents/{id}/experiments, W1-4b)
 * - run_cost_leak_scan (read-only, comprehensive scan)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerExperimentTools } from '../../dist/tools/experiments';
import { registerCostLeakDetectorTools } from '../../dist/tools/cost-leak-detector';
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

const AGENT = '11111111-1111-4111-8111-111111111111';
const EXP = '22222222-2222-4222-8222-222222222222';

function handlerFor(server: ReturnType<typeof createMockServer>, name: string): Function {
  const call = (server.registerTool as any).mock.calls.find(([n]: [string]) => n === name);
  return call[2];
}
function configFor(server: ReturnType<typeof createMockServer>, name: string): any {
  const call = (server.registerTool as any).mock.calls.find(([n]: [string]) => n === name);
  return call[1];
}

describe('Experiment Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);
  });

  it('registers exactly the three experiment tools', () => {
    const names = (mockServer.registerTool as any).mock.calls.map(([n]: [string]) => n);
    expect(names.sort()).toEqual([
      'create_model_experiment',
      'get_experiment_results',
      'stop_experiment',
    ]);
  });

  it('create_model_experiment says it records a draft and needs the admin scope', () => {
    const cfg = configFor(mockServer, 'create_model_experiment');
    expect(cfg.title).toBe('Create Model Experiment');
    expect(cfg.description).toContain('DRAFT');
    expect(cfg.description).toContain("'admin'");
    expect(cfg.annotations.readOnlyHint).toBe(false);
    expect(cfg.annotations.idempotentHint).toBe(false);
  });

  it('get_experiment_results is read-only and requires agent_id', () => {
    const cfg = configFor(mockServer, 'get_experiment_results');
    expect(cfg.annotations.readOnlyHint).toBe(true);
    expect(cfg.inputSchema.agent_id.isOptional()).toBe(false);
    expect(cfg.inputSchema.status.isOptional()).toBe(true);
  });

  it('create_model_experiment schema has no fields the route ignores', () => {
    const schema = configFor(mockServer, 'create_model_experiment').inputSchema;
    expect(Object.keys(schema).sort()).toEqual(
      ['agent_id', 'control_model', 'description', 'name', 'traffic_pct', 'treatment_model'].sort()
    );
    expect(schema.traffic_pct.safeParse(51).success).toBe(false);
    expect(schema.traffic_pct.safeParse(0).success).toBe(false);
    expect(schema.traffic_pct.safeParse(50).success).toBe(true);
  });
});

describe('create_model_experiment Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let handler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);
    handler = handlerFor(mockServer, 'create_model_experiment');
  });

  it('posts to the agent-scoped experiments route with only the route fields', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        id: EXP,
        name: 'Haiku trial',
        agent_id: AGENT,
        control_model: 'gpt-4o',
        treatment_model: 'claude-3-5-haiku',
        traffic_pct: 10,
        status: 'draft',
      },
    });
    await handler({
      agent_id: AGENT,
      name: 'Haiku trial',
      treatment_model: 'claude-3-5-haiku',
      traffic_pct: 10,
    });
    expect(mockClient.post).toHaveBeenCalledWith(`/agents/${AGENT}/experiments`, {
      name: 'Haiku trial',
      treatment_model: 'claude-3-5-haiku',
      traffic_pct: 10,
    });
  });

  it('passes control_model and description when given', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: EXP, name: 'x', status: 'draft' },
    });
    await handler({
      agent_id: AGENT,
      name: 'x',
      treatment_model: 't',
      traffic_pct: 20,
      control_model: 'c',
      description: 'd',
    });
    expect(mockClient.post).toHaveBeenCalledWith(`/agents/${AGENT}/experiments`, {
      name: 'x',
      treatment_model: 't',
      traffic_pct: 20,
      control_model: 'c',
      description: 'd',
    });
  });

  it('reports the draft honestly', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        id: EXP,
        name: 'Haiku trial',
        control_model: 'gpt-4o',
        treatment_model: 'claude-3-5-haiku',
        traffic_pct: 10,
        status: 'draft',
      },
    });
    const res = await handler({
      agent_id: AGENT,
      name: 'Haiku trial',
      treatment_model: 'claude-3-5-haiku',
      traffic_pct: 10,
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain('recorded as a draft');
    expect(res.content[0].text).toContain('No traffic is routed');
  });

  it('returns an error on API failure', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: "Insufficient API key scope: this call needs 'admin'",
    });
    const res = await handler({
      agent_id: AGENT,
      name: 'x',
      treatment_model: 't',
      traffic_pct: 10,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("needs 'admin'");
  });
});

describe('get_experiment_results Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let handler: Function;
  const rows = [
    {
      id: 'e1',
      name: 'Running one',
      agent_id: AGENT,
      control_model: 'a',
      treatment_model: 'b',
      traffic_pct: 10,
      status: 'running',
      is_significant: false,
      winner: null,
    },
    {
      id: 'e2',
      name: 'Done one',
      agent_id: AGENT,
      control_model: 'a',
      treatment_model: 'c',
      traffic_pct: 20,
      status: 'completed',
      is_significant: true,
      p_value: 0.01,
      winner: 'treatment',
    },
  ];

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);
    handler = handlerFor(mockServer, 'get_experiment_results');
  });

  it('GETs the agent-scoped list route', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: rows });
    const res = await handler({ agent_id: AGENT });
    expect(mockClient.get).toHaveBeenCalledWith(`/agents/${AGENT}/experiments`);
    expect(res.content[0].text).toContain('Running one');
    expect(res.content[0].text).toContain('Done one');
  });

  it('filters by status client-side (the route takes no filter)', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: rows });
    const res = await handler({ agent_id: AGENT, status: 'completed' });
    expect(mockClient.get).toHaveBeenCalledWith(`/agents/${AGENT}/experiments`);
    expect(res.content[0].text).toContain('Done one');
    expect(res.content[0].text).not.toContain('Running one');
  });

  it('has a designed empty state', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ data: [] });
    const res = await handler({ agent_id: AGENT });
    expect(res.content[0].text).toContain('No experiments for this agent');
  });

  it('returns an error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({ error: 'API Error' });
    const res = await handler({ agent_id: AGENT });
    expect(res.isError).toBe(true);
  });
});

describe('stop_experiment Handler', () => {
  it('PATCHes the experiment to completed', async () => {
    const mockServer = createMockServer();
    const mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);
    const handler = handlerFor(mockServer, 'stop_experiment');
    (mockClient.patch as any).mockResolvedValueOnce({
      data: { id: EXP, name: 'Haiku trial', status: 'completed' },
    });
    const res = await handler({ agent_id: AGENT, experiment_id: EXP });
    expect(mockClient.patch).toHaveBeenCalledWith(`/agents/${AGENT}/experiments/${EXP}`, {
      status: 'completed',
    });
    expect(res.content[0].text).toContain('stopped');
  });
});

describe('Cost Leak Detector Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register run_cost_leak_scan tool', () => {
    registerCostLeakDetectorTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'run_cost_leak_scan',
      expect.objectContaining({
        title: 'Run Cost Leak Scan',
        description: expect.stringContaining('cost leak audit'),
      }),
      expect.any(Function)
    );
  });

  it('should register exactly 1 cost leak tool', () => {
    registerCostLeakDetectorTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
  });

  it('should mark cost leak scan as read-only', () => {
    registerCostLeakDetectorTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls[0];
    const config = scanCall[1];

    expect(config.annotations?.readOnlyHint).toBe(true);
    expect(config.annotations?.destructiveHint).toBe(false);
  });
});

describe('run_cost_leak_scan Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let scanHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerCostLeakDetectorTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls[0];
    scanHandler = scanCall[2];
  });

  it('should scan entire fleet when no agent_id provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        cost_leak_report: {
          scan_timestamp: '2024-03-02T10:00:00Z',
          total_agents_scanned: 10,
          total_leaks_found: 3,
          total_estimated_waste_monthly_cents: 50000,
          health_score: 75,
          findings: [],
        },
      },
    });

    await scanHandler({});

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        include_cost_leak_scan: 'true',
      })
    );
  });

  it('should scan specific agent when agent_id provided', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        cost_leak_report: {
          scan_timestamp: '2024-03-02T10:00:00Z',
          total_agents_scanned: 1,
          total_leaks_found: 0,
          total_estimated_waste_monthly_cents: 0,
          health_score: 100,
          findings: [],
        },
      },
    });

    await scanHandler({
      agent_id: 'agent_123',
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        agent_id: 'agent_123',
      })
    );
  });

  it('should respect include_low_severity flag', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        cost_leak_report: {
          scan_timestamp: '2024-03-02T10:00:00Z',
          total_agents_scanned: 5,
          total_leaks_found: 2,
          total_estimated_waste_monthly_cents: 10000,
          health_score: 80,
          findings: [
            {
              severity: 'low',
              description: 'Minor issue',
              estimated_monthly_waste_cents: 100,
            },
          ],
        },
      },
    });

    const resultWithLow = await scanHandler({
      include_low_severity: true,
    });
    expect(resultWithLow.content).toBeDefined();

    (mockClient.get as any).mockClear();
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        cost_leak_report: {
          scan_timestamp: '2024-03-02T10:00:00Z',
          total_agents_scanned: 5,
          total_leaks_found: 2,
          total_estimated_waste_monthly_cents: 10000,
          health_score: 80,
          findings: [
            {
              severity: 'low',
              description: 'Minor issue',
            },
          ],
        },
      },
    });

    const resultWithoutLow = await scanHandler({
      include_low_severity: false,
    });
    expect(resultWithoutLow.content).toBeDefined();
  });

  it('should return formatted cost leak report', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        cost_leak_report: {
          scan_timestamp: '2024-03-02T10:00:00Z',
          total_agents_scanned: 10,
          total_leaks_found: 3,
          total_estimated_waste_monthly_cents: 50000,
          health_score: 75,
          findings: [],
        },
      },
    });

    const result = await scanHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Cost Leak Scan');
  });

  it('should handle missing cost_leak_report gracefully', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {},
    });

    const result = await scanHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('being computed');
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500): Internal Server Error',
    });

    const result = await scanHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error running cost leak scan');
  });
});

// ── Model Pricing Data (Issue #2) ──────────────────────────────────────────────

import {
  MODEL_PRICING,
  getModelPricing,
  getModelsByProvider,
  getCoveredProviders,
} from '../../dist/tools/model-pricing';

describe('Model Pricing Data — Mistral + Cohere entries (Issue #2)', () => {
  it('should include mistral-large in MODEL_PRICING', () => {
    expect(MODEL_PRICING['mistral-large']).toBeDefined();
    expect(MODEL_PRICING['mistral-large'].provider).toBe('mistral');
    expect(MODEL_PRICING['mistral-large'].tier).toBe('frontier');
    expect(MODEL_PRICING['mistral-large'].input_cost_per_1m).toBeGreaterThan(0);
  });

  it('should resolve mistral-medium as alias to mistral-large', () => {
    const entry = getModelPricing('mistral-medium');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('mistral-large');
    expect(entry!.provider).toBe('mistral');
  });

  it('should include mistral-small-3.1 in MODEL_PRICING', () => {
    expect(MODEL_PRICING['mistral-small-3.1']).toBeDefined();
    expect(MODEL_PRICING['mistral-small-3.1'].provider).toBe('mistral');
    expect(MODEL_PRICING['mistral-small-3.1'].tier).toBe('efficient');
  });

  it('should resolve codestral as alias to mistral-small-3.1', () => {
    const entry = getModelPricing('codestral');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('mistral-small-3.1');
    expect(entry!.provider).toBe('mistral');
  });

  it('should include command-r-plus in MODEL_PRICING', () => {
    expect(MODEL_PRICING['command-r-plus']).toBeDefined();
    expect(MODEL_PRICING['command-r-plus'].provider).toBe('cohere');
    expect(MODEL_PRICING['command-r-plus'].tier).toBe('frontier');
  });

  it('should include command-r in MODEL_PRICING', () => {
    expect(MODEL_PRICING['command-r']).toBeDefined();
    expect(MODEL_PRICING['command-r'].provider).toBe('cohere');
    expect(MODEL_PRICING['command-r'].tier).toBe('balanced');
  });

  it('should resolve embed-english-v3 alias to command-r', () => {
    const entry = getModelPricing('embed-english-v3');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('command-r');
    expect(entry!.provider).toBe('cohere');
  });

  it('getModelPricing should resolve mistral-large-latest alias', () => {
    const entry = getModelPricing('mistral-large-latest');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('mistral-large');
    expect(entry!.provider).toBe('mistral');
  });

  it('getModelPricing should resolve mistral-small-latest alias', () => {
    const entry = getModelPricing('mistral-small-latest');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('mistral-small-3.1');
  });

  it('getModelPricing should resolve codestral-latest alias', () => {
    const entry = getModelPricing('codestral-latest');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('mistral-small-3.1');
  });

  it('getModelPricing should resolve command-r-plus-08-2024 alias', () => {
    const entry = getModelPricing('command-r-plus-08-2024');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('command-r-plus');
  });

  it('getModelPricing should resolve embed-english-v3.0 alias', () => {
    const entry = getModelPricing('embed-english-v3.0');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('command-r');
  });

  it('getModelPricing should return undefined for unknown model', () => {
    expect(getModelPricing('unknown-model-xyz')).toBeUndefined();
  });

  it('getModelsByProvider should return all mistral models', () => {
    const models = getModelsByProvider('mistral');
    const names = models.map((m) => m.model);
    expect(names).toContain('mistral-large');
    expect(names).toContain('mistral-small-3.1');
  });

  it('getModelsByProvider should return all cohere models', () => {
    const models = getModelsByProvider('cohere');
    const names = models.map((m) => m.model);
    expect(names).toContain('command-r-plus');
    expect(names).toContain('command-r');
  });

  it('getCoveredProviders should include mistral and cohere', () => {
    const providers = getCoveredProviders();
    expect(providers).toContain('mistral');
    expect(providers).toContain('cohere');
  });

  it('getCoveredProviders should return sorted array', () => {
    const providers = getCoveredProviders();
    const sorted = [...providers].sort();
    expect(providers).toEqual(sorted);
  });

  it('getCoveredProviders should include all 9 expected providers', () => {
    const providers = getCoveredProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('google');
    expect(providers).toContain('mistral');
    expect(providers).toContain('cohere');
    expect(providers).toContain('xai');
    expect(providers).toContain('meta');
    expect(providers).toContain('deepseek');
    expect(providers).toContain('amazon');
  });
});

// ── output_format=json for run_cost_leak_scan (Issue #3) ──────────────────────

describe('run_cost_leak_scan output_format=json (Issue #3)', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let scanHandler: (...args: any[]) => Promise<any>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerCostLeakDetectorTools(mockServer as any, mockClient);

    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls.find(([name]: [string]) => name === 'run_cost_leak_scan');
    scanHandler = scanCall[2];
  });

  it('output_format=json with API error returns JSON error object and isError:true', async () => {
    (mockClient.get as any).mockResolvedValue({ error: 'unauthorized' });

    const result = await scanHandler({ output_format: 'json' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('error', 'unauthorized');
  });

  it('output_format=json with missing report returns status:computing JSON', async () => {
    (mockClient.get as any).mockResolvedValue({ data: {} });

    const result = await scanHandler({ output_format: 'json' });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('status', 'computing');
    expect(parsed).toHaveProperty('message');
  });

  it('output_format=json with valid report returns raw CostLeakReport JSON', async () => {
    const mockReport = {
      scan_timestamp: '2025-01-01T00:00:00Z',
      total_agents_scanned: 3,
      total_leaks_found: 1,
      total_estimated_waste_monthly_cents: 5000,
      findings: [],
      health_score: 85,
    };
    (mockClient.get as any).mockResolvedValue({
      data: { cost_leak_report: mockReport },
    });

    const result = await scanHandler({ output_format: 'json' });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.scan_timestamp).toBe('2025-01-01T00:00:00Z');
    expect(parsed.total_agents_scanned).toBe(3);
    expect(parsed.health_score).toBe(85);
  });

  it('output_format=text (default) with valid report returns markdown', async () => {
    const mockReport = {
      scan_timestamp: '2025-01-01T00:00:00Z',
      total_agents_scanned: 2,
      total_leaks_found: 0,
      total_estimated_waste_monthly_cents: 0,
      findings: [],
      health_score: 100,
    };
    (mockClient.get as any).mockResolvedValue({
      data: { cost_leak_report: mockReport },
    });

    const result = await scanHandler({ output_format: 'text' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Cost Leak Scan Report');
    expect(result.content[0].text).not.toMatch(/^\s*\{/); // not JSON
  });

  it('omitting output_format defaults to text (markdown) output', async () => {
    const mockReport = {
      scan_timestamp: '2025-01-01T00:00:00Z',
      total_agents_scanned: 1,
      total_leaks_found: 0,
      total_estimated_waste_monthly_cents: 0,
      findings: [],
      health_score: 95,
    };
    (mockClient.get as any).mockResolvedValue({
      data: { cost_leak_report: mockReport },
    });

    const result = await scanHandler({});

    expect(result.content[0].text).toContain('Cost Leak Scan Report');
  });

  it('output_format=json with API error does NOT return markdown', async () => {
    (mockClient.get as any).mockResolvedValue({ error: 'rate_limited' });

    const result = await scanHandler({ output_format: 'json' });

    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    expect(result.content[0].text).not.toContain('##');
  });
});

// ── run_cost_leak_scan description mentions all providers (Issue #2) ──────────

describe('run_cost_leak_scan tool description mentions covered providers', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerCostLeakDetectorTools(mockServer as any, mockClient);
  });

  it('description should mention mistral as a covered provider', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls.find(([name]: [string]) => name === 'run_cost_leak_scan');
    const description: string = scanCall[1].description;

    expect(description.toLowerCase()).toContain('mistral');
  });

  it('description should mention cohere as a covered provider', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls.find(([name]: [string]) => name === 'run_cost_leak_scan');
    const description: string = scanCall[1].description;

    expect(description.toLowerCase()).toContain('cohere');
  });

  it('description should mention json output format', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls.find(([name]: [string]) => name === 'run_cost_leak_scan');
    const description: string = scanCall[1].description;

    expect(description).toContain('json');
  });

  it('run_cost_leak_scan should have output_format in inputSchema', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const scanCall = calls.find(([name]: [string]) => name === 'run_cost_leak_scan');
    const schema = scanCall[1].inputSchema;

    expect(schema.output_format).toBeDefined();
  });
});
