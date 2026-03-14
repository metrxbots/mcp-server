/**
 * Metrx API Client
 *
 * Handles authenticated requests to the Metrx API.
 * Uses API key authentication (same as the SDK).
 *
 * The API key is passed via the METRX_API_KEY environment variable
 * or configured at runtime.
 */

import { DEFAULT_API_URL, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import type { ApiResponse } from '../types.js';

// API Docs URL for error messages
const API_DOCS_URL = 'https://docs.metrxbot.com';
const API_KEY_SETTINGS_URL = 'https://app.metrxbot.com/settings/security';
const ONBOARD_URL = 'https://app.metrxbot.com/sign-up?source=mcp';

export class MetrxApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;

  constructor(apiKey?: string, baseUrl?: string, maxRetries?: number) {
    this.apiKey = apiKey || process.env.METRX_API_KEY || '';
    this.baseUrl = baseUrl || process.env.METRX_API_URL || DEFAULT_API_URL;
    this.maxRetries = maxRetries ?? 3;

    if (!this.apiKey) {
      throw new Error(
        `METRX_API_KEY not set.\n` +
        `  Sign up free: ${ONBOARD_URL}\n` +
        `  Manage keys:  ${API_KEY_SETTINGS_URL}\n` +
        `  Then test:    METRX_API_KEY=sk_live_xxx npx @metrxbot/mcp-server --test`
      );
    }
  }

  /**
   * Common request headers for all API calls.
   */
  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-MCP-Client': `${SERVER_NAME}/${SERVER_VERSION}`,
    };
  }

  /**
   * Parse API error response and return user-friendly message
   */
  private parseApiError(status: number, errorBody: string): string {
    try {
      const parsed = JSON.parse(errorBody);

      if (parsed.error?.code === 'INVALID_API_KEY' || parsed.error?.code === 'EXPIRED_API_KEY') {
        return `API key is invalid or expired. Generate a new one at ${API_KEY_SETTINGS_URL}`;
      }

      if (parsed.error?.code === 'RATE_LIMITED') {
        const retryAfter = parsed.error?.retryAfter || 60;
        return `Rate limited. Please try again in ${retryAfter} seconds. Learn more at ${API_DOCS_URL}/rate-limiting`;
      }

      if (parsed.error?.message) {
        return `${parsed.error.message}. See ${API_DOCS_URL} for help`;
      }
    } catch {
      // Not JSON, use status-based messages
    }

    switch (status) {
      case 401:
        return `API key is invalid or expired. Generate a new one at ${API_KEY_SETTINGS_URL}`;
      case 403:
        return `Access forbidden. Check your API key permissions at ${API_KEY_SETTINGS_URL}`;
      case 404:
        return `Resource not found. Check your request URL. See ${API_DOCS_URL}`;
      case 429:
        return `Rate limited. Please try again later. Learn more at ${API_DOCS_URL}/rate-limiting`;
      case 500:
      case 502:
      case 503:
        return `Server error (${status}). Please try again later. See ${API_DOCS_URL}`;
      default:
        return `API request failed (${status}). See ${API_DOCS_URL} for help`;
    }
  }

  /**
   * Fetch with exponential backoff retry logic.
   * Retries only on 5xx errors and network errors, not on 4xx errors.
   *
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The fetch response
   * @throws Error if all retries fail or on non-retryable errors
   */
  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    let lastError: Error | null = null;
    const initialDelayMs = 1000; // 1 second
    const delayMultiplier = 2;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          return response;
        }

        // Retry on 5xx errors
        if (response.status >= 500) {
          if (attempt < this.maxRetries) {
            const delayMs = initialDelayMs * Math.pow(delayMultiplier, attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          return response;
        }

        // Success (2xx, 3xx)
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Retry on network errors only if we haven't exhausted retries
        if (attempt < this.maxRetries) {
          const delayMs = initialDelayMs * Math.pow(delayMultiplier, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Unknown error during fetch');
  }

  /**
   * Make an authenticated GET request to the Metrx API.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    try {
      const response = await this.fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const friendlyMessage = this.parseApiError(response.status, errorBody);
        return {
          error: friendlyMessage,
        };
      }

      const data = (await response.json()) as T | ApiResponse<T>;

      // API may return { data: T } or T directly
      if (data && typeof data === 'object' && 'data' in data) {
        return data as ApiResponse<T>;
      }

      return { data: data as T };
    } catch (err) {
      return {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}. See ${API_DOCS_URL} for help`,
      };
    }
  }

  /**
   * Make an authenticated POST request to the Metrx API.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);

    try {
      const response = await this.fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const friendlyMessage = this.parseApiError(response.status, errorBody);
        return {
          error: friendlyMessage,
        };
      }

      const data = (await response.json()) as T | ApiResponse<T>;

      if (data && typeof data === 'object' && 'data' in data) {
        return data as ApiResponse<T>;
      }

      return { data: data as T };
    } catch (err) {
      return {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}. See ${API_DOCS_URL} for help`,
      };
    }
  }

  /**
   * Make an authenticated PATCH request to the Metrx API.
   */
  async patch<T>(path: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);

    try {
      const response = await this.fetchWithRetry(url.toString(), {
        method: 'PATCH',
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const friendlyMessage = this.parseApiError(response.status, errorBody);
        return {
          error: friendlyMessage,
        };
      }

      const data = (await response.json()) as T | ApiResponse<T>;

      if (data && typeof data === 'object' && 'data' in data) {
        return data as ApiResponse<T>;
      }

      return { data: data as T };
    } catch (err) {
      return {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}. See ${API_DOCS_URL} for help`,
      };
    }
  }

  /**
   * Lightweight ping to verify API key is valid.
   * Used by the `--test` CLI flag.
   * Attempts a GET request on the agents endpoint.
   * Returns { ok: true } on success, or { ok: false, error: string } on failure.
   */
  async ping(): Promise<{ ok: boolean; error?: string }> {
    const url = new URL('/api/v1/agents', this.baseUrl);

    try {
      const response = await this.fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: this.headers,
      });

      if (response.ok) {
        return { ok: true };
      }

      const errorBody = await response.text().catch(() => '');
      const friendlyMessage = this.parseApiError(response.status, errorBody);
      return { ok: false, error: friendlyMessage };
    } catch (err) {
      return {
        ok: false,
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
