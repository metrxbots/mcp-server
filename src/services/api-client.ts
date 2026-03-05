/**
 * Metrx API Client
 *
 * Handles authenticated requests to the Metrx API.
 * Uses API key authentication (same as the SDK).
 *
 * The API key is passed via the METRX_API_KEY environment variable
 * or configured at runtime.
 */

import { DEFAULT_API_URL } from '../constants.js';
import type { ApiResponse } from '../types.js';

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
        'METRX_API_KEY is required. Set it as an environment variable or pass it to the constructor.'
      );
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
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-MCP-Client': 'metrx-mcp-server/0.1.0',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          error: `API request failed (${response.status}): ${errorBody || response.statusText}`,
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
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
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
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-MCP-Client': 'metrx-mcp-server/0.1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          error: `API request failed (${response.status}): ${errorBody || response.statusText}`,
        };
      }

      const data = (await response.json()) as T | ApiResponse<T>;

      if (data && typeof data === 'object' && 'data' in data) {
        return data as ApiResponse<T>;
      }

      return { data: data as T };
    } catch (err) {
      return {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Make an authenticated PATCH request to the Metrx API.
   */
  async patch<T>(path: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);

    try {
      const response = await fetch(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-MCP-Client': 'metrx-mcp-server/0.1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return {
          error: `API request failed (${response.status}): ${errorBody || response.statusText}`,
        };
      }

      const data = (await response.json()) as T | ApiResponse<T>;

      if (data && typeof data === 'object' && 'data' in data) {
        return data as ApiResponse<T>;
      }

      return { data: data as T };
    } catch (err) {
      return {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
