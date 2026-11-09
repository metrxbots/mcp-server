/**
 * Tests — MCP verify billing tools (get_balance / buy_verification /
 * verify_switch). Descriptions must state the cost fetched from /api/pricing
 * (never hardcoded); verify_switch returns an ASYNC handle, never blocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchVerifyCostLine, registerVerifyBillingTools } from './verify-billing.js';
import type { ApiClientLike } from '../server-factory.js';

const PRICING = {
  offers: {
    verify: { standard_cents: 14900, founding_cents: 9900, refund_policy: 'no verdict, no charge' },
  },
};

function makeClient(overrides: Partial<Record<'get' | 'post', unknown>> = {}): ApiClientLike {
  return {
    get: vi.fn(async (path: string) => {
      if (path === '/pricing') return { data: PRICING };
      if (path === '/billing/balance') return { data: { balance: 3, unit_noun: 'verifications' } };
      return { error: 'not found' };
    }),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    ...(overrides as object),
  } as ApiClientLike;
}

interface Registered {
  name: string;
  config: { description: string };
  handler: (
    args?: Record<string, unknown>
  ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
}

/**
 * Mirrors the real SDK: registerTool returns a RegisteredTool handle whose
 * update() mutates the live description. The production factory must forward
 * this return value — it silently did not, which is what made description
 * enrichment impossible and forced the whole registration to be async.
 */
function makeServer(registry: Registered[]): McpServer {
  return {
    registerTool: (
      name: string,
      config: { description: string },
      handler: Registered['handler']
    ) => {
      const entry: Registered = { name, config: { ...config }, handler };
      registry.push(entry);
      return {
        update: (updates: { description?: string }) => {
          if (updates.description !== undefined) entry.config.description = updates.description;
        },
      };
    },
  } as unknown as McpServer;
}

beforeEach(() => vi.clearAllMocks());

describe('fetchVerifyCostLine', () => {
  it('builds the cost line from live pricing ($149 / $99 founding)', async () => {
    const line = await fetchVerifyCostLine(makeClient());
    expect(line).toContain('$149');
    expect(line).toContain('$99 founding rate');
    expect(line).toContain('No verdict, no charge');
  });

  it('falls back to endpoint-deferring copy on fetch failure (never a stale number)', async () => {
    const client = makeClient({ get: vi.fn(async () => ({ error: 'down' })) });
    const line = await fetchVerifyCostLine(client);
    expect(line).toContain('GET /api/pricing');
    expect(line).not.toMatch(/\$\d/);
  });
});

describe('registerVerifyBillingTools', () => {
  it('registers all three tools with cost-stating descriptions on the spending ones', async () => {
    const registry: Registered[] = [];
    await registerVerifyBillingTools(makeServer(registry), makeClient());
    const names = registry.map((r) => r.name);
    expect(names).toEqual(['get_balance', 'buy_verification', 'verify_switch']);

    for (const spender of ['buy_verification', 'verify_switch']) {
      const desc = registry.find((r) => r.name === spender)!.config.description;
      expect(desc).toContain('one verification');
      expect(desc).toContain('$149');
      expect(desc).toContain('$99 founding rate');
    }
    // Vocabulary: never "credits" anywhere customer/agent-visible.
    for (const r of registry) {
      expect(r.config.description.toLowerCase()).not.toMatch(/credit/);
    }
  });

  it('registers all three tools SYNCHRONOUSLY, before any await', () => {
    // Regression: registration used to await the /api/pricing fetch, so the
    // server exposed 26 tools synchronously and 29 only eventually. A client
    // that listed tools promptly saw a different surface than the docs claimed.
    const registry: Registered[] = [];
    registerVerifyBillingTools(makeServer(registry), makeClient()); // deliberately not awaited
    expect(registry.map((r) => r.name)).toEqual([
      'get_balance',
      'buy_verification',
      'verify_switch',
    ]);
  });

  it('still registers all three when pricing is unreachable', async () => {
    // Regression: the factory fire-and-forgot a rejecting promise, so a failed
    // pricing fetch meant these three tools never registered at all — the
    // published count of 29 silently became 26 in production.
    const client = makeClient({
      get: vi.fn(async () => {
        throw new Error('pricing down');
      }),
    });
    const registry: Registered[] = [];
    await registerVerifyBillingTools(makeServer(registry), client);

    expect(registry).toHaveLength(3);
    for (const spender of ['buy_verification', 'verify_switch']) {
      const desc = registry.find((r) => r.name === spender)!.config.description;
      expect(desc).toContain('GET /api/pricing'); // defers, never invents
      expect(desc).not.toMatch(/\$\d/); // and never states a stale price
    }
  });

  it('never rejects, so it can be safely fire-and-forgotten', async () => {
    const client = makeClient({
      get: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(registerVerifyBillingTools(makeServer([]), client)).resolves.toBeUndefined();
  });

  it('get_balance reports verifications remaining', async () => {
    const registry: Registered[] = [];
    await registerVerifyBillingTools(makeServer(registry), makeClient());
    const result = await registry.find((r) => r.name === 'get_balance')!.handler({});
    expect(result.content[0].text).toContain('verifications remaining: 3');
  });

  it('verify_switch returns an async handle + poll guidance (never blocks)', async () => {
    const registry: Registered[] = [];
    const client = makeClient({
      post: vi.fn(async () => ({
        data: {
          request: { id: 'vr-42', state: 'armed', pairs_target: 30 },
          balance: 2,
        },
      })),
    });
    await registerVerifyBillingTools(makeServer(registry), client);
    const result = await registry
      .find((r) => r.name === 'verify_switch')!
      .handler({ prod_model: 'gpt-5.2', candidate_model: 'gpt-5-mini' });
    const text = result.content[0].text;
    expect(text).toContain('Handle: vr-42');
    expect(text).toContain('GET /api/verify/requests/vr-42');
    expect(text).toContain('do not block');
    expect(text).toContain('Verifications remaining: 2');
  });

  it('verify_switch surfaces insufficient balance as purchase guidance (nothing spent)', async () => {
    const registry: Registered[] = [];
    const client = makeClient({
      post: vi.fn(async () => ({
        error: 'payment required',
        data: {
          error: 'insufficient_balance',
          buy_url: 'https://app.metrxbot.com/settings/billing',
        },
      })),
    });
    await registerVerifyBillingTools(makeServer(registry), client);
    const result = await registry
      .find((r) => r.name === 'verify_switch')!
      .handler({ prod_model: 'a', candidate_model: 'b' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('0 verifications remaining');
    expect(result.content[0].text).toContain('buy_verification');
  });
});
