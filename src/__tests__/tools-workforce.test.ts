/**
 * Workforce (manager's desk) tools — package-local contract (desk PR 1).
 *
 * Covers registration (five tools, annotations, no SDK value-imports), the
 * path each tool calls, the pass-through of the route's `data` document, and
 * the error text a keyless client produces for a key tool. The route-vs-tool
 * truth lives in apps/web/tests/truth/mcp-tools-work.test.ts; the errors-table
 * parity in apps/web/tests/mcp-errors-parity.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  registerWorkforceTools,
  workforceReviewInput,
  WORKFORCE_REVIEW_PATH,
  CONTRACT_DRAFT_PATH,
  VENDOR_BILL_CHECK_PATH,
  scorecardPath,
  decisionsPath,
} from '../../dist/tools/workforce';
import {
  HttpKeylessClient,
  keylessErrorText,
  PUBLIC_V1_PATHS,
} from '../../dist/services/keyless-client';
import { DESK_ERROR_META_KEY, MCP_ERRORS } from '../../dist/errors';
import {
  MCP_TOOLS_BY_DOMAIN,
  MCP_TOOL_AUTH,
  MCP_TOOL_SCOPES,
  workforceDefaultOrg,
} from '../../dist/tool-registry-facts';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

const createMockServer = () => ({ registerTool: vi.fn() });
const createMockClient = () => ({
  get: vi.fn(async () => ({ data: { ok: true } })),
  post: vi.fn(async () => ({ data: { ok: true } })),
});

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

describe('Workforce tools registration', () => {
  it('registers exactly the five desk tools, matching the SSOT domain list', () => {
    const server = createMockServer();
    registerWorkforceTools(server as any, createMockClient() as any);
    const names = (server.registerTool as any).mock.calls.map(([n]: [string]) => n).sort();
    expect(names).toEqual([...MCP_TOOLS_BY_DOMAIN.workforce].sort());
  });

  it('declares read-only annotations on the readers and non-destructive on the writer', () => {
    const server = createMockServer();
    registerWorkforceTools(server as any, createMockClient() as any);
    const configs = Object.fromEntries(
      (server.registerTool as any).mock.calls.map(([n, c]: [string, any]) => [n, c])
    );
    for (const n of ['get_workforce_review', 'get_scorecard']) {
      expect(configs[n].annotations.readOnlyHint, n).toBe(true);
    }
    for (const n of ['draft_job_contract', 'check_vendor_bill']) {
      expect(configs[n].annotations.readOnlyHint, n).toBe(true);
      expect(configs[n].annotations.openWorldHint, n).toBe(false);
    }
    expect(configs.record_decision.annotations.readOnlyHint).toBe(false);
    // A retire archives the agent (mig 156): destructive, so clients confirm.
    expect(configs.record_decision.annotations.destructiveHint).toBe(true);
  });

  it('every desk tool has a scope and an auth mode in the SSOT', () => {
    for (const n of MCP_TOOLS_BY_DOMAIN.workforce) {
      expect(MCP_TOOL_SCOPES[n], n).toBeDefined();
      expect(MCP_TOOL_AUTH[n], n).toBeDefined();
    }
    expect(MCP_TOOL_SCOPES.record_decision).toBe('write');
    expect(MCP_TOOL_AUTH.get_scorecard).toBe('key');
    expect(MCP_TOOL_AUTH.record_decision).toBe('key');
  });

  it('a public tool description carries no scope sentence of its own', () => {
    const server = createMockServer();
    registerWorkforceTools(server as any, createMockClient() as any);
    for (const [n, c] of (server.registerTool as any).mock.calls as Array<[string, any]>) {
      if (MCP_TOOL_AUTH[n as keyof typeof MCP_TOOL_AUTH] === 'public') {
        expect(c.description, n).not.toMatch(/Requires an API key with the '\w+' scope\./);
      }
    }
  });
});

describe('Workforce tool paths and pass-through', () => {
  it('get_workforce_review GETs the review route with the org and passes the document through', async () => {
    const server = createMockServer();
    const client = createMockClient();
    client.get.mockResolvedValueOnce({ data: { org: 'demo', period: { start: 'a', end: 'b' } } });
    registerWorkforceTools(server as any, client as any);
    const result = await handlerFor(server, 'get_workforce_review')({ org: 'demo' });
    expect(client.get).toHaveBeenCalledWith(
      WORKFORCE_REVIEW_PATH,
      expect.objectContaining({ org: 'demo' })
    );
    expect(result.isError).toBeFalsy();
    expect(parseDoc(result)).toEqual({ org: 'demo', period: { start: 'a', end: 'b' } });
  });

  it('get_scorecard encodes the agent key into the path', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerWorkforceTools(server as any, client as any);
    await handlerFor(server, 'get_scorecard')({ agent_key: 'ddq review/2' });
    expect(client.get).toHaveBeenCalledWith(scorecardPath('ddq review/2'));
    expect(scorecardPath('ddq review/2')).toBe('/v1/agents/ddq%20review%2F2/scorecard');
  });

  it('draft_job_contract and check_vendor_bill POST the pure routes with the body', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerWorkforceTools(server as any, client as any);
    await handlerFor(
      server,
      'draft_job_contract'
    )({ template: 'support_triage', agent_name: 'Tier-1' });
    expect(client.post).toHaveBeenCalledWith(
      CONTRACT_DRAFT_PATH,
      expect.objectContaining({ template: 'support_triage', agent_name: 'Tier-1' })
    );
    await handlerFor(
      server,
      'check_vendor_bill'
    )({
      period: { start: '2026-10-01', end: '2026-10-31' },
      billed: [],
    });
    expect(client.post).toHaveBeenCalledWith(
      VENDOR_BILL_CHECK_PATH,
      expect.objectContaining({ period: { start: '2026-10-01', end: '2026-10-31' } })
    );
  });

  it('record_decision POSTs the decisions route for the agent', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerWorkforceTools(server as any, client as any);
    await handlerFor(
      server,
      'record_decision'
    )({
      agent_key: 'ddq',
      decision: 'keep',
      rationale: 'meets its contract',
    });
    expect(client.post).toHaveBeenCalledWith(
      decisionsPath('ddq'),
      expect.objectContaining({ decision: 'keep', rationale: 'meets its contract' })
    );
  });

  it('a route error becomes an isError result prefixed with the tool name', async () => {
    const server = createMockServer();
    const client = createMockClient();
    client.get.mockResolvedValueOnce({
      error: 'unknown_agent_key: no agent has that key',
      status: 404,
    });
    registerWorkforceTools(server as any, client as any);
    const result = await handlerFor(server, 'get_scorecard')({ agent_key: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe('get_scorecard: unknown_agent_key: no agent has that key');
    // No class from the client: a plain text error, nothing for the transport to lift.
    expect((result as any)._meta).toBeUndefined();
  });

  it('a route error with a table class carries it for the transport (plan §2)', async () => {
    const server = createMockServer();
    const client = createMockClient();
    client.get.mockResolvedValueOnce({
      error: 'unknown_agent_key: no agent has that key',
      status: 404,
      problem: { cls: 'unknown_agent_key', extras: { suggestions: ['ddq'] } },
    } as any);
    registerWorkforceTools(server as any, client as any);
    const result = await handlerFor(server, 'get_scorecard')({ agent_key: 'dd' });
    expect(result.isError).toBe(true);
    expect((result as any)._meta[DESK_ERROR_META_KEY]).toMatchObject({
      class: 'unknown_agent_key',
      suggestions: ['ddq'],
    });
  });

  it('record_decision returns the decision url and replayed beside the record (plan T5)', async () => {
    const server = createMockServer();
    const client = createMockClient();
    client.post.mockResolvedValueOnce({
      data: { id: 'dec-1', agent_id: 'agent-1', decision: 'expand' },
      url: 'https://app.metrxbot.com/agents/agent-1#decision-dec-1',
      replayed: false,
    } as any);
    registerWorkforceTools(server as any, client as any);
    const result = await handlerFor(
      server,
      'record_decision'
    )({ agent_key: 'ddq', decision: 'expand', rationale: 'meets its contract' });
    expect(parseDoc(result)).toEqual({
      id: 'dec-1',
      agent_id: 'agent-1',
      decision: 'expand',
      url: 'https://app.metrxbot.com/agents/agent-1#decision-dec-1',
      replayed: false,
    });
  });
});

describe('HttpKeylessClient (stdio --demo)', () => {
  it('the public path list is exactly the three keyless desk routes', () => {
    expect([...PUBLIC_V1_PATHS].sort()).toEqual(
      [WORKFORCE_REVIEW_PATH, CONTRACT_DRAFT_PATH, VENDOR_BILL_CHECK_PATH].sort()
    );
  });

  it('a key tool answers auth_required locally without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new HttpKeylessClient('https://example.test/api');
    const res = await client.get(scorecardPath('ddq'));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(res.error).toBe(keylessErrorText('auth_required'));
    expect(res.problem).toEqual({ cls: 'auth_required' });
    expect(res.error).toContain(MCP_ERRORS.auth_required.message);
    const patch = await client.patch('/v1/agents/ddq', { team: 'x' });
    expect(patch.status).toBe(401);
    fetchSpy.mockRestore();
  });

  it('a public route is fetched without a bearer and {data} passes through', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { org: 'demo' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = new HttpKeylessClient('https://example.test/api');
    const res = await client.get(WORKFORCE_REVIEW_PATH, { org: 'demo' });
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`https://example.test/api${WORKFORCE_REVIEW_PATH}?org=demo`);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-mcp-client')).toMatch(/^metrx-mcp-server\//);
    expect(res.data).toEqual({ org: 'demo' });
    fetchSpy.mockRestore();
  });

  it('a problem body maps to the error class text with retry_after_seconds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'rate_limited', retry_after_seconds: 12 }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = new HttpKeylessClient('https://example.test/api');
    const res = await client.post(CONTRACT_DRAFT_PATH, { template: 'support_triage' });
    expect(res.status).toBe(429);
    expect(res.error).toContain(MCP_ERRORS.rate_limited.message);
    expect(res.error).toContain('12');
    expect(res.problem).toEqual({ cls: 'rate_limited', extras: { retry_after_seconds: 12 } });
    fetchSpy.mockRestore();
  });

  it('a network failure is transport_error, never a throw', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new HttpKeylessClient('https://example.test/api');
    const res = await client.get(WORKFORCE_REVIEW_PATH, { org: 'demo' });
    expect(res.error).toContain(MCP_ERRORS.transport_error.message);
    fetchSpy.mockRestore();
  });
});

describe('get_workforce_review for a signed-in connector user (PR C review M2)', () => {
  it("the default org is the caller's own for oauth and the sample otherwise", () => {
    expect(workforceDefaultOrg('oauth')).toBe('me');
    expect(workforceDefaultOrg('key')).toBe('demo');
    expect(workforceDefaultOrg('public')).toBe('demo');
  });

  it('the schema default follows the auth mode (the SDK applies it before the handler)', () => {
    expect(workforceReviewInput('oauth').org.parse(undefined)).toBe('me');
    expect(workforceReviewInput('key').org.parse(undefined)).toBe('demo');
  });

  function reviewConfig(authMode?: 'key' | 'public' | 'oauth') {
    const server = createMockServer();
    const client = createMockClient();
    registerWorkforceTools(server as any, client as any, authMode ? { authMode } : undefined);
    const call = (server.registerTool as any).mock.calls.find(
      ([n]: [string]) => n === 'get_workforce_review'
    );
    return { config: call[1], handler: call[2] as Handler, client };
  }

  it('oauth: no API-key wording, the own org is the default, demo stays reachable', async () => {
    const { config, handler, client } = reviewConfig('oauth');
    const text = `${config.description} ${config.inputSchema.org.description}`;
    expect(text).not.toMatch(/API key/i);
    expect(text).toMatch(/org=me \(default\)|'me' \(default\)/);
    expect(text).toMatch(/Northwind/);
    await handler({});
    expect(client.get).toHaveBeenCalledWith(
      WORKFORCE_REVIEW_PATH,
      expect.objectContaining({ org: 'me' })
    );
    await handler({ org: 'demo' });
    expect(client.get).toHaveBeenLastCalledWith(
      WORKFORCE_REVIEW_PATH,
      expect.objectContaining({ org: 'demo' })
    );
  });

  it('key and public modes are unchanged: demo by default, own org needs a read key', async () => {
    for (const mode of [undefined, 'key', 'public'] as const) {
      const { config, handler, client } = reviewConfig(mode);
      expect(config.description, String(mode)).toMatch(/API key/);
      await handler({});
      expect(client.get).toHaveBeenCalledWith(
        WORKFORCE_REVIEW_PATH,
        expect.objectContaining({ org: 'demo' })
      );
    }
  });
});
