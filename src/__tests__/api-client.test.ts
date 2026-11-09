/**
 * API Client Tests
 *
 * Tests for the Metrx API client implementation.
 * Covers initialization, GET/POST/PATCH requests, error handling, and header validation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MetrxApiClient } from '../../dist/services/api-client';

/**
 * The package version, read from package.json rather than typed as a literal.
 * The client sends it as X-MCP-Client, and asserting a hardcoded string here
 * pinned the suite to a version the package had already moved past.
 */
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
).version;

// Mock fetch globally
global.fetch = vi.fn();

describe('MetrxApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.METRX_API_KEY;
    delete process.env.METRX_API_URL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with environment variable', () => {
      process.env.METRX_API_KEY = 'sk_test_123';
      const client = new MetrxApiClient();
      expect(client['apiKey']).toBe('sk_test_123');
    });

    it('should initialize with provided API key', () => {
      const client = new MetrxApiClient('sk_test_456');
      expect(client['apiKey']).toBe('sk_test_456');
    });

    it('should throw error when no API key is provided', () => {
      expect(() => new MetrxApiClient()).toThrow('METRX_API_KEY not set');
    });

    it('should use default API URL', () => {
      process.env.METRX_API_KEY = 'sk_test_789';
      const client = new MetrxApiClient();
      expect(client['baseUrl']).toBe('https://app.metrxbot.com/api');
    });

    it('should use custom API URL', () => {
      process.env.METRX_API_KEY = 'sk_test_789';
      const client = new MetrxApiClient('sk_test_789', 'https://custom.api.com');
      expect(client['baseUrl']).toBe('https://custom.api.com');
    });

    it('should override environment URL with provided URL', () => {
      process.env.METRX_API_KEY = 'sk_test_789';
      process.env.METRX_API_URL = 'https://env.api.com';
      const client = new MetrxApiClient('sk_test_789', 'https://custom.api.com');
      expect(client['baseUrl']).toBe('https://custom.api.com');
    });
  });

  describe('GET requests', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
    });

    it('should make a successful GET request', async () => {
      const mockData = { agents: [{ id: '123', name: 'Agent 1' }] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await client.get('/agents');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_key',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeUndefined();
    });

    it('should handle GET request with query parameters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.get('/agents', { status: 'active', limit: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=active'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    it('should skip null/undefined query parameters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.get('/agents', {
        status: 'active',
        category: null as any,
        limit: undefined as any,
      });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('status=active');
      expect(callUrl).not.toContain('category');
      expect(callUrl).not.toContain('limit');
    });

    it('should handle API response with data property', async () => {
      const mockData = { agents: [{ id: '1' }] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData }),
      });

      const result = await client.get('/agents');
      expect(result.data).toEqual(mockData);
    });

    it('should handle direct API response without data wrapper', async () => {
      const mockData = { agents: [{ id: '1' }] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await client.get('/agents');
      expect(result.data).toEqual(mockData);
    });

    it('should return error on non-OK response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not found',
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('Resource not found');
      expect(result.error).toContain('docs.metrxbot.com');
      expect(result.data).toBeUndefined();
    });

    it('should handle network errors in GET', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      const result = await noRetryClient.get('/agents');
      expect(result.error).toContain('Network error');
      expect(result.error).toContain('Network timeout');
    });

    it('should include X-MCP-Client header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get('/agents');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-MCP-Client': `metrx-mcp-server/${PKG_VERSION}`,
          }),
        })
      );
    });
  });

  describe('POST requests', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
    });

    it('should make a successful POST request', async () => {
      const requestBody = { name: 'Test Budget', limit: 100 };
      const responseData = { id: 'budget_123', ...requestBody };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => responseData,
      });

      const result = await client.post('/budgets', requestBody);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/budgets'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(requestBody),
        })
      );
      expect(result.data).toEqual(responseData);
    });

    it('should handle POST without body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await client.post('/alerts/ack');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });

    it('should return error on POST failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid payload',
      });

      const result = await client.post('/budgets', { invalid: 'data' });
      expect(result.error).toContain('API request failed (400)');
    });

    it('should handle network errors in POST', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const result = await noRetryClient.post('/budgets', {});
      expect(result.error).toContain('Network error');
    });
  });

  describe('PATCH requests', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
    });

    it('should make a successful PATCH request', async () => {
      const requestBody = { action: 'acknowledge', alert_ids: ['123'] };
      const responseData = { acknowledged: 1 };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => responseData,
      });

      const result = await client.patch('/alerts', requestBody);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/alerts'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_key',
          }),
          body: JSON.stringify(requestBody),
        })
      );
      expect(result.data).toEqual(responseData);
    });

    it('should return error on PATCH failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token',
      });

      const result = await client.patch('/alerts', {});
      expect(result.error).toContain('API key is invalid or expired');
      expect(result.error).toContain('metrxbot.com/settings/security');
    });

    it('carries the HTTP status on a non-OK response (round 9, D5: tools branch on 403)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: 'Admin access required' }),
      });
      const patched = await client.patch('/budgets/x', {});
      expect(patched.status).toBe(403);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: 'Admin access required' }),
      });
      const posted = await client.post('/budgets', {});
      expect(posted.status).toBe(403);

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not found',
      });
      const got = await client.get('/budgets/status');
      expect(got.status).toBe(404);
    });

    it('should handle network errors in PATCH', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockRejectedValueOnce(new Error('Timeout'));

      const result = await noRetryClient.patch('/alerts', {});
      expect(result.error).toContain('Network error');
    });
  });

  describe('error handling', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
    });

    it('should handle JSON parse errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('Network error');
    });

    it('should handle missing response body', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      });

      const result = await noRetryClient.get('/agents');
      expect(result.error).toContain('Server error (500)');
      expect(result.error).toContain('docs.metrxbot.com');
    });

    it('should use status-based message for non-JSON error body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid period_days parameter',
      });

      const result = await client.get('/dashboard');
      expect(result.error).toContain('API request failed (400)');
      expect(result.error).toContain('docs.metrxbot.com');
    });

    it('should parse JSON error with INVALID_API_KEY code', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({ error: { code: 'INVALID_API_KEY', message: 'Key not found' } }),
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('API key is invalid or expired');
      expect(result.error).toContain('metrxbot.com/settings/security');
    });

    it('should parse JSON error with EXPIRED_API_KEY code', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({ error: { code: 'EXPIRED_API_KEY', message: 'Key expired' } }),
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('API key is invalid or expired');
    });

    it('should parse JSON error with RATE_LIMITED code and retryAfter', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { code: 'RATE_LIMITED', retryAfter: 30 } }),
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('Rate limited');
      expect(result.error).toContain('30 seconds');
      expect(result.error).toContain('rate-limiting');
    });

    it('should use default retryAfter when RATE_LIMITED has no retryAfter', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { code: 'RATE_LIMITED' } }),
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('60 seconds');
    });

    it('should parse JSON error with custom message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({ error: { message: 'Validation failed: agent_id is required' } }),
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('Validation failed: agent_id is required');
      expect(result.error).toContain('docs.metrxbot.com');
    });

    it('should handle 403 with forbidden message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '',
      });

      const result = await client.get('/agents');
      expect(result.error).toContain('Access forbidden');
      expect(result.error).toContain('metrxbot.com/settings/security');
    });
  });
});

describe('MetrxApiClient — precise 403s (W1-4b scoped API keys)', () => {
  let client: MetrxApiClient;
  const reply = (status: number, body: unknown) =>
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MetrxApiClient('sk_test_scope');
  });

  it('insufficient_scope: names the required scope, the granted scopes, and the server message verbatim', async () => {
    const message = 'This action needs an API key with the admin scope; this key has read, write.';
    reply(403, {
      error: 'insufficient_scope',
      required_scope: 'admin',
      granted_scopes: ['read', 'write'],
      message,
    });
    const result = await client.post('/budgets', {});
    expect(result.status).toBe(403);
    expect(result.error).toContain("this call needs 'admin'");
    expect(result.error).toContain('[read, write]');
    expect(result.error).toContain(message);
    expect(result.error).toContain('metrxbot.com/settings/security');
    expect(result.error).not.toContain('Access forbidden. Check your API key permissions');
  });

  it('insufficient_scope works for GET (read) and PATCH (write) too', async () => {
    reply(403, {
      error: 'insufficient_scope',
      required_scope: 'read',
      granted_scopes: [],
      message: 'Reading needs the read scope.',
    });
    const got = await client.get('/agents');
    expect(got.error).toContain("needs 'read' (key holds [])");

    reply(403, {
      error: 'insufficient_scope',
      required_scope: 'write',
      granted_scopes: ['read'],
      message: 'Writing needs the write scope.',
    });
    const patched = await client.patch('/alerts', {});
    expect(patched.error).toContain("needs 'write' (key holds [read])");
    expect(patched.error).toContain('Writing needs the write scope.');
  });

  // PR #481 contract: POST/PATCH /api/budgets refuse soft_block/hard_block with
  // 409 { error: <reason>, code: 'ENFORCEMENT_UNAVAILABLE' } while gateway
  // enforcement is unconfigured. The code must survive into result.error so the
  // budget tools can tell it apart from a 409 "limit reached" on resume.
  it('409 ENFORCEMENT_UNAVAILABLE keeps the code and the server reason verbatim', async () => {
    const reason =
      'Gateway budget enforcement is not switched on for Metrx yet. Soft Block and Hard Block would not stop or flag any request, so they are unavailable; Alert Only works.';
    reply(409, { error: reason, code: 'ENFORCEMENT_UNAVAILABLE' });
    const result = await client.post('/budgets', { enforcement_mode: 'hard_block' });
    expect(result.status).toBe(409);
    expect(result.error).toContain('409 ENFORCEMENT_UNAVAILABLE');
    expect(result.error).toContain(reason);

    reply(409, { error: 'Budget is at its limit for this period' });
    const other = await client.post('/budgets/x/resume', {});
    expect(other.error).not.toContain('ENFORCEMENT_UNAVAILABLE');
  });

  it('session_required: returns the server message and says API keys cannot call it', async () => {
    reply(403, {
      error: 'session_required',
      message: 'This endpoint requires a signed-in user; API keys (any scope) cannot call it.',
    });
    const result = await client.post('/settings/api-keys', {});
    expect(result.error).toContain('requires a signed-in user');
    expect(result.error).toMatch(/API keys of any scope cannot call it/);
  });

  it('a plain-string 403 error keeps the server words instead of the generic line', async () => {
    reply(403, { error: 'Admin access required' });
    const result = await client.post('/budgets', {});
    expect(result.status).toBe(403);
    expect(result.error).toContain('Admin access required');
    expect(result.error).toContain('403');
  });

  it('a 400 with validation details surfaces them', async () => {
    reply(400, {
      error: 'Validation error',
      details: ['objective is required', 'owner is required'],
    });
    const result = await client.post('/v1/agents/a/contract', {});
    expect(result.error).toBe(
      'API request failed (400): Validation error: objective is required; owner is required'
    );
  });

  it('a plain-string 404 keeps "not found" in the text (loop-metrics keys on it)', async () => {
    reply(404, { error: 'Unknown agent_key "x"' });
    const result = await client.get('/v1/agents/x/contract');
    expect(result.error).toMatch(/not found/i);
    expect(result.error).toContain('Unknown agent_key "x"');
  });

  it('existing behaviour stands: empty 403 body → generic forbidden copy; error.code shapes unchanged', async () => {
    reply(403, '');
    expect((await client.get('/agents')).error).toContain('Access forbidden');

    reply(401, { error: { code: 'INVALID_API_KEY' } });
    expect((await client.get('/agents')).error).toContain('invalid or expired');

    reply(401, { error: 'Unauthorized' });
    expect((await client.get('/agents')).error).toContain('invalid or expired');
  });
});
