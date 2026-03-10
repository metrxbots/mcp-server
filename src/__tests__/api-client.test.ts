/**
 * API Client Tests
 *
 * Tests for the Metrx API client implementation.
 * Covers initialization, GET/POST/PATCH requests, error handling, and header validation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetrxApiClient } from '../../dist/services/api-client';

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
      expect(client['baseUrl']).toBe('https://metrxbot.com/api/v1');
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
            'X-MCP-Client': 'metrx-mcp-server/0.1.3',
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
    });

    it('should handle network errors in PATCH', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Timeout'));

      const result = await client.patch('/alerts', {});
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
    });

    it('should include error body in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid period_days parameter',
      });

      const result = await client.get('/dashboard');
      expect(result.error).toContain('API request failed (400)');
    });
  });
});
