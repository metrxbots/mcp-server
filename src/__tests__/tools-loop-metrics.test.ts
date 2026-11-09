/**
 * Loop-Metrics Tools Tests (N-5 D-6)
 *
 * Tests for:
 * - get_signal_readiness (registration, happy path, error path, envelope shape)
 * - get_dashboard_headline (CI fold, flag-off 404 next-step message)
 * - get_report_snapshot (token validation, stored-values envelope)
 *
 * The route-vs-tool parity diff lives in apps/web/tests/view-mcp-parity.test.ts
 * (R2-F1); this suite covers the package-local contract only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerLoopMetricsTools, envelopeNumbers } from '../../dist/tools/loop-metrics';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

const createMockServer = () => ({ registerTool: vi.fn() });
const createMockClient = () => ({ get: vi.fn() });

function handlerFor(server: ReturnType<typeof createMockServer>, name: string): Handler {
  const call = (server.registerTool as any).mock.calls.find(([n]: [string]) => n === name);
  expect(call, `tool ${name} not registered`).toBeTruthy();
  return call[2];
}

function parseDoc(result: { content: Array<{ text: string }> }): any {
  const m = result.content[0]!.text.match(/```json\n([\s\S]*)\n```/);
  expect(m, 'expected a JSON code block').toBeTruthy();
  return JSON.parse(m![1]!);
}

describe('Loop-Metrics Tools Registration', () => {
  it('registers exactly the nine tools (3 loop-metrics + 5 twins + kb_prior_lookup), all read-only', () => {
    const server = createMockServer();
    registerLoopMetricsTools(server as any, createMockClient() as any);
    const names = (server.registerTool as any).mock.calls.map(([n]: [string]) => n).sort();
    expect(names).toEqual([
      'get_actuations',
      'get_dashboard_headline',
      'get_decision_queue',
      'get_proposals',
      'get_report_snapshot',
      'get_signal_readiness',
      'get_trials',
      'get_verdicts',
      'kb_prior_lookup',
    ]);
    for (const [, config] of (server.registerTool as any).mock.calls) {
      expect(config.annotations?.readOnlyHint).toBe(true);
      expect(config.annotations?.destructiveHint).toBe(false);
      // L7: each new tool's description states the envelope contract.
      expect(config.description).toContain('envelope-shaped');
    }
  });
});

describe('get_signal_readiness', () => {
  let server: ReturnType<typeof createMockServer>;
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerLoopMetricsTools(server as any, client as any);
  });

  it('wraps every numeric leaf as a MeasuredValue with null CIs (none fabricated)', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        generatedAt: '2026-07-24T00:00:00.000Z',
        windowDays: 14,
        org_id: 'org-1',
        summary: {
          value: { agents_scanned: 2, agents_total: 5, truncated: true },
          provenance: 'bounded scan',
        },
      },
    });
    const result = await handlerFor(server, 'get_signal_readiness')({});
    expect(result.isError ?? false).toBe(false);
    const doc = parseDoc(result);
    expect(doc.source).toBe('GET /api/signal-readiness');
    expect(doc.data_through).toBe('2026-07-24T00:00:00.000Z');
    const scanned = doc.data.summary.value.agents_scanned;
    expect(scanned).toEqual({
      value: 2,
      ci_low: null,
      ci_high: null,
      method: 'count',
      data_through: '2026-07-24T00:00:00.000Z',
    });
    expect(doc.data.windowDays.method).toBe('signal_readiness_bounded_aggregate');
    // Provenance strings ride along verbatim.
    expect(doc.data.summary.provenance).toBe('bounded scan');
  });

  it('propagates API errors with a next step', async () => {
    client.get.mockResolvedValueOnce({ error: 'API key is invalid or expired.' });
    const result = await handlerFor(server, 'get_signal_readiness')({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('API key is invalid');
    expect(result.content[0]!.text).toContain('next_step');
  });
});

describe('get_dashboard_headline', () => {
  let server: ReturnType<typeof createMockServer>;
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerLoopMetricsTools(server as any, client as any);
  });

  it('folds the verified-savings CI into ONE MeasuredValue; other numbers get null CIs', async () => {
    client.get.mockResolvedValueOnce({
      data: {
        generated_at: '2026-07-24T00:00:00.000Z',
        period_days: 30,
        measured_spend: {
          value_microcents: 100,
          basis: 'measured',
          tone: 'measured',
          reason: null,
        },
        verified_savings: {
          value_microcents: 5,
          ci_low_microcents: 5,
          ci_high_microcents: 15,
          accepted_decisions: 1,
          basis: 'measured',
          tone: 'verified',
          reason: null,
        },
      },
    });
    const doc = parseDoc(await handlerFor(server, 'get_dashboard_headline')({ days: 30 }));
    const verified = doc.data.verified_savings;
    expect(verified.value_microcents).toEqual({
      value: 5,
      ci_low: 5,
      ci_high: 15,
      method: 'rvnb_qualifying_gate_ci',
      data_through: '2026-07-24T00:00:00.000Z',
    });
    // Never duplicated as sibling keys once folded.
    expect(verified.ci_low_microcents).toBeUndefined();
    expect(verified.ci_high_microcents).toBeUndefined();
    expect(verified.accepted_decisions.method).toBe('count');
    expect(doc.data.measured_spend.value_microcents.ci_low).toBeNull();
    expect(doc.data.measured_spend.value_microcents.method).toBe('measured_spend_window_sum');
    expect(client.get).toHaveBeenCalledWith('/dashboard/headline', { days: 30 });
  });

  it('maps the 404 flag-off signature to the machine-parseable next step', async () => {
    client.get.mockResolvedValueOnce({ error: 'Resource not found. Check your request URL.' });
    const result = await handlerFor(server, 'get_dashboard_headline')({ days: 7 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain(
      'optimization_model_v3 flag is off for this org — enable it or use get_dashboard'
    );
  });

  it('non-404 errors pass through unmapped', async () => {
    client.get.mockResolvedValueOnce({ error: 'Server error (503).' });
    const result = await handlerFor(server, 'get_dashboard_headline')({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Server error (503)');
    expect(result.content[0]!.text).not.toContain('optimization_model_v3');
  });
});

describe('get_report_snapshot', () => {
  let server: ReturnType<typeof createMockServer>;
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerLoopMetricsTools(server as any, client as any);
  });

  it('rejects malformed tokens without calling the API', async () => {
    const result = await handlerFor(server, 'get_report_snapshot')({ share_token: 'NOT-HEX!' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Invalid share token');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('serves the stored snapshot as an envelope with period_end as data_through', async () => {
    const token = 'abcdef0123456789abcdef01';
    client.get.mockResolvedValueOnce({
      data: {
        period_start: '2026-06-21T00:00:00.000Z',
        period_end: '2026-07-21T00:00:00.000Z',
        methodology_version: 3,
        snapshot: {
          zero_state: true,
          page1: {
            ai_spend: { cents: 1234, days_observed: 30, provenance: 'measured' },
            verified_savings: {
              verdicts: 0,
              ci_low_microcents: 0,
              ci_high_microcents: 0,
              provenance: 'none',
              evidence: [],
            },
          },
        },
        snapshot_hash: 'd'.repeat(64),
        created_at: '2026-07-21T12:00:00.000Z',
      },
    });
    const doc = parseDoc(await handlerFor(server, 'get_report_snapshot')({ share_token: token }));
    expect(client.get).toHaveBeenCalledWith(`/reports/exec/${token}`);
    expect(doc.data_through).toBe('2026-07-21T00:00:00.000Z');
    expect(doc.data.snapshot_hash).toBe('d'.repeat(64));
    expect(doc.data.snapshot.page1.ai_spend.cents).toMatchObject({
      value: 1234,
      ci_low: null,
      ci_high: null,
      data_through: '2026-07-21T00:00:00.000Z',
    });
    // CI pair with no point value → conservative synthesized envelope.
    const vs = doc.data.snapshot.page1.verified_savings;
    expect(vs.value_microcents).toMatchObject({ value: 0, ci_low: 0, ci_high: 0 });
    expect(vs.ci_low_microcents).toBeUndefined();
  });

  it('maps not-found to a next-step error', async () => {
    client.get.mockResolvedValueOnce({ error: 'Resource not found.' });
    const result = await handlerFor(
      server,
      'get_report_snapshot'
    )({
      share_token: 'abcdef0123456789abcdef01',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('next_step');
  });
});

describe('envelopeNumbers (pure transform)', () => {
  it('never fabricates a CI and preserves non-numeric leaves', () => {
    const out = envelopeNumbers(
      { a: 1, b: 'text', c: null, d: [2, 'x'], nested: { events: 3 } },
      { dataThrough: 't0', method: 'm' }
    ) as any;
    expect(out.a).toEqual({
      value: 1,
      ci_low: null,
      ci_high: null,
      method: 'm',
      data_through: 't0',
    });
    expect(out.b).toBe('text');
    expect(out.c).toBeNull();
    expect(out.d[0].value).toBe(2);
    expect(out.d[1]).toBe('x');
    expect(out.nested.events.method).toBe('count');
  });

  it('folds a verdict-shaped savings CI into the savings_pct MeasuredValue (pct present)', () => {
    const out = envelopeNumbers(
      { savings_pct: 0.4, savings_ci_low: 0.31, savings_ci_high: 0.49, n_pairs: 42 },
      { dataThrough: 't0', method: 'causal_verdict_summary' }
    ) as any;
    expect(out.savings_pct).toEqual({
      value: 0.4,
      ci_low: 0.31,
      ci_high: 0.49,
      method: 'causal_verdict_summary',
      data_through: 't0',
    });
    // Fold-never-duplicate: the ci keys are consumed, not repeated as siblings.
    expect(out.savings_ci_low).toBeUndefined();
    expect(out.savings_ci_high).toBeUndefined();
    expect(out.n_pairs.method).toBe('count');
    // NULL passthrough: PostgREST always emits the savings keys (number|null),
    // so the fold is the ALWAYS-path — nulls ride inside the envelope.
    const nulls = envelopeNumbers(
      { savings_pct: null, savings_ci_low: null, savings_ci_high: null },
      { dataThrough: 't0', method: 'causal_verdict_summary' }
    ) as any;
    expect(nulls.savings_pct).toEqual({
      value: null,
      ci_low: null,
      ci_high: null,
      method: 'causal_verdict_summary',
      data_through: 't0',
    });
    expect(nulls.savings_ci_low).toBeUndefined();
  });

  it('synthesizes a conservative savings_pct when the source states only the interval', () => {
    const out = envelopeNumbers(
      { savings_ci_low: 0.31, savings_ci_high: 0.49 },
      { dataThrough: 't0', method: 'kb_prior_cell_summary' }
    ) as any;
    expect(out.savings_pct).toEqual({
      value: 0.31,
      ci_low: 0.31,
      ci_high: 0.49,
      method: 'kb_prior_cell_summary_ci_low_conservative',
      data_through: 't0',
    });
    expect(out.savings_ci_low).toBeUndefined();
    expect(out.savings_ci_high).toBeUndefined();
  });

  it('the microcents CI fold is unchanged by the savings fold', () => {
    const out = envelopeNumbers(
      {
        value_microcents: 5,
        ci_low_microcents: 5,
        ci_high_microcents: 15,
      },
      { dataThrough: 't0', method: 'm', ciMethod: 'ci_m' }
    ) as any;
    expect(out.value_microcents).toEqual({
      value: 5,
      ci_low: 5,
      ci_high: 15,
      method: 'ci_m',
      data_through: 't0',
    });
    expect(out.ci_low_microcents).toBeUndefined();
    expect(out.ci_high_microcents).toBeUndefined();
  });
});
