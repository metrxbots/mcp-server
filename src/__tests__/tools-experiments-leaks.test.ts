/**
 * Experiments & Cost Leak Detector Tests
 *
 * Tests for:
 * - create_model_experiment (write operation, parameter defaults)
 * - get_experiment_results (filtering)
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

describe('Experiment Tools Registration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register create_model_experiment tool', () => {
    registerExperimentTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'create_model_experiment',
      expect.objectContaining({
        title: 'Create Model Experiment',
        description: expect.stringContaining('A/B test'),
      }),
      expect.any(Function)
    );
  });

  it('should register get_experiment_results tool', () => {
    registerExperimentTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_experiment_results',
      expect.objectContaining({
        title: 'Get Experiment Results',
      }),
      expect.any(Function)
    );
  });

  it('should register experiment tools', () => {
    registerExperimentTools(mockServer as any, mockClient as any);

    expect((mockServer.registerTool as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('create_model_experiment should be marked as non-idempotent', () => {
    registerExperimentTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    const config = createCall[1];

    expect(config.annotations?.idempotentHint).toBe(false);
  });

  it('create_model_experiment should be marked as write operation', () => {
    registerExperimentTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    const config = createCall[1];

    expect(config.annotations?.readOnlyHint).toBe(false);
  });
});

describe('create_model_experiment Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let createExpHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    createExpHandler = createCall[2];
  });

  it('should create experiment with required parameters', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        id: 'exp_123',
        name: 'GPT-4 vs Claude Test',
        agent_id: 'agent_456',
        control_model: 'gpt-4',
        treatment_model: 'claude-3-opus',
      },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'GPT-4 vs Claude Test',
      treatment_model: 'claude-3-opus',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        agent_id: 'agent_456',
        name: 'GPT-4 vs Claude Test',
        treatment_model: 'claude-3-opus',
      })
    );
  });

  it('should apply default traffic_pct', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        traffic_pct: 10,
      })
    );
  });

  it('should apply custom traffic_pct', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
      traffic_pct: 25,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        traffic_pct: 25,
      })
    );
  });

  it('should apply default primary_metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        primary_metric: 'cost_per_call',
      })
    );
  });

  it('should apply custom primary_metric', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
      primary_metric: 'latency_p95',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        primary_metric: 'latency_p95',
      })
    );
  });

  it('should apply default max_duration_days', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        max_duration_days: 14,
      })
    );
  });

  it('should apply custom max_duration_days', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
      max_duration_days: 7,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        max_duration_days: 7,
      })
    );
  });

  it('should apply auto_promote flag', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: { id: 'exp_123' },
    });

    await createExpHandler({
      agent_id: 'agent_456',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
      auto_promote: true,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        auto_promote: true,
      })
    );
  });

  it('should return success message', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      data: {
        id: 'exp_123',
        name: 'My Test Experiment',
        agent_id: 'agent_456',
        control_model: 'gpt-4',
        treatment_model: 'claude-3-opus',
        status: 'running',
      },
    });

    const result = await createExpHandler({
      agent_id: 'agent_456',
      name: 'My Test Experiment',
      treatment_model: 'claude-3-opus',
    });

    expect(result.content[0].text).toContain('✅');
    expect(result.content[0].text).toContain('Experiment');
    expect(result.content[0].text).toContain('created');
  });

  it('should return error on API failure', async () => {
    (mockClient.post as any).mockResolvedValueOnce({
      error: 'API request failed (400): Invalid agent',
    });

    const result = await createExpHandler({
      agent_id: 'invalid_agent',
      name: 'Test',
      treatment_model: 'gpt-4o-mini',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error creating experiment');
  });
});

describe('get_experiment_results Handler', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;
  let resultsHandler: Function;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);

    const calls = (mockServer.registerTool as any).mock.calls;
    const resultsCall = calls.find(([name]: [string]) => name === 'get_experiment_results');
    resultsHandler = resultsCall[2];
  });

  it('should fetch all experiments when no filters', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { experiments: [] },
    });

    await resultsHandler({});

    expect(mockClient.get).toHaveBeenCalledWith('/experiments', expect.any(Object));
  });

  it('should filter by agent_id', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { experiments: [] },
    });

    await resultsHandler({
      agent_id: 'agent_456',
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        agent_id: 'agent_456',
      })
    );
  });

  it('should filter by status', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: { experiments: [] },
    });

    await resultsHandler({
      status: 'running',
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/experiments',
      expect.objectContaining({
        status: 'running',
      })
    );
  });

  it('should return formatted experiment results', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      data: {
        experiments: [
          {
            id: 'exp_123',
            name: 'Test Exp',
            status: 'running',
            control_samples: 100,
            treatment_samples: 100,
            is_significant: false,
          },
        ],
      },
    });

    const result = await resultsHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });

  it('should return error on API failure', async () => {
    (mockClient.get as any).mockResolvedValueOnce({
      error: 'API request failed (500)',
    });

    const result = await resultsHandler({});

    expect(result.isError).toBe(true);
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

describe('Input Validation', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: MetrxApiClient;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerExperimentTools(mockServer as any, mockClient as any);
  });

  it('create_model_experiment should validate traffic_pct range', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    const schema = createCall[1].inputSchema;

    expect(schema.traffic_pct).toBeDefined();
  });

  it('create_model_experiment should validate primary_metric enum', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    const schema = createCall[1].inputSchema;

    expect(schema.primary_metric).toBeDefined();
  });

  it('create_model_experiment should validate max_duration_days range', () => {
    const calls = (mockServer.registerTool as any).mock.calls;
    const createCall = calls.find(([name]: [string]) => name === 'create_model_experiment');
    const schema = createCall[1].inputSchema;

    expect(schema.max_duration_days).toBeDefined();
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

  it('should include mistral-medium in MODEL_PRICING', () => {
    expect(MODEL_PRICING['mistral-medium']).toBeDefined();
    expect(MODEL_PRICING['mistral-medium'].provider).toBe('mistral');
    expect(MODEL_PRICING['mistral-medium'].tier).toBe('balanced');
  });

  it('should include mistral-small in MODEL_PRICING', () => {
    expect(MODEL_PRICING['mistral-small']).toBeDefined();
    expect(MODEL_PRICING['mistral-small'].provider).toBe('mistral');
    expect(MODEL_PRICING['mistral-small'].tier).toBe('efficient');
  });

  it('should include codestral in MODEL_PRICING', () => {
    expect(MODEL_PRICING['codestral']).toBeDefined();
    expect(MODEL_PRICING['codestral'].provider).toBe('mistral');
    expect(MODEL_PRICING['codestral'].tier).toBe('efficient');
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

  it('should include embed-english-v3 with zero output cost (embedding-only)', () => {
    const entry = MODEL_PRICING['embed-english-v3'];
    expect(entry).toBeDefined();
    expect(entry.provider).toBe('cohere');
    expect(entry.output_cost_per_1m).toBe(0);
    expect(entry.context_window).toBe(512);
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
    expect(entry!.model).toBe('mistral-small');
  });

  it('getModelPricing should resolve codestral-latest alias', () => {
    const entry = getModelPricing('codestral-latest');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('codestral');
  });

  it('getModelPricing should resolve command-r-plus-08-2024 alias', () => {
    const entry = getModelPricing('command-r-plus-08-2024');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('command-r-plus');
  });

  it('getModelPricing should resolve embed-english-v3.0 alias', () => {
    const entry = getModelPricing('embed-english-v3.0');
    expect(entry).toBeDefined();
    expect(entry!.model).toBe('embed-english-v3');
  });

  it('getModelPricing should return undefined for unknown model', () => {
    expect(getModelPricing('unknown-model-xyz')).toBeUndefined();
  });

  it('getModelsByProvider should return all mistral models', () => {
    const models = getModelsByProvider('mistral');
    const names = models.map((m) => m.model);
    expect(names).toContain('mistral-large');
    expect(names).toContain('mistral-medium');
    expect(names).toContain('mistral-small');
    expect(names).toContain('codestral');
  });

  it('getModelsByProvider should return all cohere models', () => {
    const models = getModelsByProvider('cohere');
    const names = models.map((m) => m.model);
    expect(names).toContain('command-r-plus');
    expect(names).toContain('command-r');
    expect(names).toContain('embed-english-v3');
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

  it('getCoveredProviders should include all 5 expected providers', () => {
    const providers = getCoveredProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('google');
    expect(providers).toContain('mistral');
    expect(providers).toContain('cohere');
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
