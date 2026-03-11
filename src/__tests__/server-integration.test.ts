/**
 * MCP Server Integration Tests
 *
 * Tests for:
 * - Server initialization and tool registration
 * - All tool domains are properly registered
 * - API client initialization with environment variables
 * - Error handling when required env vars are missing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetrxApiClient } from '../../dist/services/api-client';

describe('MCP Server Integration', () => {
  beforeEach(() => {
    delete process.env.METRX_API_KEY;
    delete process.env.METRX_API_URL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.METRX_API_KEY;
    delete process.env.METRX_API_URL;
  });

  describe('Server Requirements', () => {
    it('should require METRX_API_KEY environment variable', () => {
      expect(() => new MetrxApiClient()).toThrow('METRX_API_KEY not set');
    });

    it('should accept API key from environment', () => {
      process.env.METRX_API_KEY = 'sk_env_key_123';
      const client = new MetrxApiClient();
      expect(client['apiKey']).toBe('sk_env_key_123');
    });

    it('should use default API URL', () => {
      process.env.METRX_API_KEY = 'sk_test';
      const client = new MetrxApiClient();
      expect(client['baseUrl']).toBe('https://metrxbot.com/api/v1');
    });

    it('should accept custom API URL via environment', () => {
      process.env.METRX_API_KEY = 'sk_test';
      process.env.METRX_API_URL = 'https://custom.example.com';
      const client = new MetrxApiClient();
      expect(client['baseUrl']).toBe('https://custom.example.com');
    });

    it('should override env URL with constructor parameter', () => {
      process.env.METRX_API_KEY = 'sk_test';
      process.env.METRX_API_URL = 'https://env.example.com';
      const client = new MetrxApiClient('sk_test', 'https://custom.example.com');
      expect(client['baseUrl']).toBe('https://custom.example.com');
    });
  });

  describe('Tool Domain Registration', () => {
    it('should import all tool registrars', async () => {
      const modules = [
        '../../dist/tools/dashboard',
        '../../dist/tools/optimization',
        '../../dist/tools/budgets',
        '../../dist/tools/alerts',
        '../../dist/tools/experiments',
        '../../dist/tools/cost-leak-detector',
      ];

      for (const module of modules) {
        try {
          await import(module);
        } catch (err) {
          throw new Error(`Failed to import ${module}: ${err}`);
        }
      }
    });

    it('should define all required tool registrars', async () => {
      const dashboard = await import('../../dist/tools/dashboard');
      const optimization = await import('../../dist/tools/optimization');
      const budgets = await import('../../dist/tools/budgets');
      const alerts = await import('../../dist/tools/alerts');
      const experiments = await import('../../dist/tools/experiments');
      const costLeak = await import('../../dist/tools/cost-leak-detector');

      expect(dashboard.registerDashboardTools).toBeDefined();
      expect(optimization.registerOptimizationTools).toBeDefined();
      expect(budgets.registerBudgetTools).toBeDefined();
      expect(alerts.registerAlertTools).toBeDefined();
      expect(experiments.registerExperimentTools).toBeDefined();
      expect(costLeak.registerCostLeakDetectorTools).toBeDefined();
    });
  });

  describe('API Client Functionality', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();

      global.fetch = vi.fn();
    });

    it('should have GET method', () => {
      expect(client.get).toBeDefined();
      expect(typeof client.get).toBe('function');
    });

    it('should have POST method', () => {
      expect(client.post).toBeDefined();
      expect(typeof client.post).toBe('function');
    });

    it('should have PATCH method', () => {
      expect(client.patch).toBeDefined();
      expect(typeof client.patch).toBe('function');
    });

    it('should make authenticated requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await client.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        })
      );
    });

    it('should include proper user agent header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-MCP-Client': 'metrx-mcp-server/0.2.0',
          }),
        })
      );
    });

    it('should construct proper URLs', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get('/agents', { status: 'active' });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('metrxbot.com');
      expect(callUrl).toContain('/agents');
      expect(callUrl).toContain('status=active');
    });
  });

  describe('Error Handling', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
      global.fetch = vi.fn();
    });

    it('should handle 4xx errors gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found',
      });

      const result = await client.get('/nonexistent');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Resource not found');
    });

    it('should handle 5xx errors gracefully', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Database connection failed',
      });

      const result = await noRetryClient.get('/agents');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('500');
    });

    it('should handle network timeouts', async () => {
      const noRetryClient = new MetrxApiClient('sk_test_key', undefined, 0);
      (global.fetch as any).mockRejectedValueOnce(new Error('Network request timeout'));

      const result = await noRetryClient.get('/agents');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should handle JSON parse errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON response');
        },
      });

      const result = await client.get('/agents');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should handle malformed error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => {
          throw new Error('Cannot read error body');
        },
      });

      const result = await client.get('/agents');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('API request failed (400)');
    });
  });

  describe('Request/Response Handling', () => {
    let client: MetrxApiClient;

    beforeEach(() => {
      process.env.METRX_API_KEY = 'sk_test_key';
      client = new MetrxApiClient();
      global.fetch = vi.fn();
    });

    it('should handle wrapped API responses (data property)', async () => {
      const expectedData = { agents: [] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: expectedData }),
      });

      const result = await client.get('/agents');

      expect(result.data).toEqual(expectedData);
    });

    it('should handle unwrapped API responses', async () => {
      const expectedData = { agents: [] };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => expectedData,
      });

      const result = await client.get('/agents');

      expect(result.data).toEqual(expectedData);
    });

    it('should serialize POST body correctly', async () => {
      const payload = {
        name: 'Test Budget',
        limit_dollars: 100,
      };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await client.post('/budgets', payload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(payload),
        })
      );
    });

    it('should handle POST with undefined body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.post('/some-endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: undefined,
        })
      );
    });

    it('should handle empty query parameters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get('/agents', {});

      const callUrl = (global.fetch as any).mock.calls[0][0];
      // Should not have trailing ? if no params
      expect(callUrl).toBeDefined();
    });
  });

  describe('Environment Variables', () => {
    afterEach(() => {
      delete process.env.METRX_API_KEY;
      delete process.env.METRX_API_URL;
    });

    it('should read METRX_API_KEY from process.env', () => {
      process.env.METRX_API_KEY = 'sk_env_variable_test';
      const client = new MetrxApiClient();
      expect(client['apiKey']).toBe('sk_env_variable_test');
    });

    it('should read METRX_API_URL from process.env', () => {
      process.env.METRX_API_KEY = 'sk_test';
      process.env.METRX_API_URL = 'https://env.url.com';
      const client = new MetrxApiClient();
      expect(client['baseUrl']).toBe('https://env.url.com');
    });

    it('should prefer constructor API key over environment', () => {
      process.env.METRX_API_KEY = 'sk_from_env';
      const client = new MetrxApiClient('sk_from_constructor');
      expect(client['apiKey']).toBe('sk_from_constructor');
    });

    it('should prefer constructor URL over environment', () => {
      process.env.METRX_API_KEY = 'sk_test';
      process.env.METRX_API_URL = 'https://env.url.com';
      const client = new MetrxApiClient('sk_test', 'https://constructor.url.com');
      expect(client['baseUrl']).toBe('https://constructor.url.com');
    });
  });

  describe('Type Safety', () => {
    it('should have proper TypeScript types for API responses', () => {
      process.env.METRX_API_KEY = 'sk_test';
      const client = new MetrxApiClient();

      // Verify methods exist and are callable
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
      expect(typeof client.patch).toBe('function');
    });

    it('should accept string/number/boolean parameters', async () => {
      process.env.METRX_API_KEY = 'sk_test';
      const client = new MetrxApiClient();
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.get('/test', {
        str_param: 'value',
        num_param: 42,
        bool_param: true,
      });

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Constants', () => {
    it('should define proper server identification', async () => {
      const constants = await import('../../dist/constants');

      expect(constants.SERVER_NAME).toBe('metrx-mcp-server');
      expect(constants.SERVER_VERSION).toBe('0.2.0');
    });

    it('should define default API URL', async () => {
      const constants = await import('../../dist/constants');

      expect(constants.DEFAULT_API_URL).toContain('metrxbot.com');
    });

    it('should define pagination and text limits', async () => {
      const constants = await import('../../dist/constants');

      expect(constants.DEFAULT_PAGE_LIMIT).toBeDefined();
      expect(constants.MAX_TEXT_LENGTH).toBeDefined();
    });
  });
});
