/**
 * HttpKeylessClient — the stdio `--demo` client (manager's desk PR 1).
 *
 * No API key. It `fetch`es ONLY the three unauthenticated api/v1 routes
 * (PUBLIC_V1_PATHS below, the mirror of apps/web/lib/api/public-v1.ts), with
 * no Authorization header, so one `--demo` call is rate-limited exactly once,
 * at the route (30/min/IP). Any other path is a key tool: it is answered
 * locally with the `auth_required` row of the desk error table, the same
 * `user_message` the hosted endpoint returns for the same class, so the two
 * transports read identically in the chat (stdio parity test).
 *
 * Zero workspace deps on purpose: the published tarball builds with plain
 * `tsc` and a bare `@metrx/*` import would not resolve there.
 */
import { DEFAULT_API_URL, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import {
  MCP_ERRORS,
  deskProblemFromBody,
  mcpErrorClassForCode,
  type McpErrorClass,
} from '../errors.js';
import type { ApiResponse } from '../types.js';

/**
 * The keyless api/v1 paths, relative to the `/api` base (the app lists them
 * with the `/api` prefix). Kept as a literal so the stdio build has no
 * workspace import; `mcp-errors-parity.test.ts` in apps/web pins this list
 * against PUBLIC_V1_ROUTES.
 */
export const PUBLIC_V1_PATHS = [
  '/v1/workforce-review',
  '/v1/contracts/draft',
  '/v1/vendor-bill/check',
] as const;

function isPublicPath(path: string): boolean {
  const clean = path.split('?')[0];
  return (PUBLIC_V1_PATHS as readonly string[]).includes(clean);
}

/** The `{error}` a tool handler shows for a class: the fixed user message plus the docs anchor. */
export function keylessErrorText(cls: McpErrorClass, extra?: string): string {
  const row = MCP_ERRORS[cls];
  return `${row.message}: ${row.user_message}${extra ? ` ${extra}` : ''}`;
}

/** A key tool called without a key: the table row, as text and as its class. */
function authRequired<T>(): ApiResponse<T> {
  return {
    error: keylessErrorText('auth_required'),
    status: 401,
    problem: { cls: 'auth_required' },
  };
}

export class HttpKeylessClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_API_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    if (!isPublicPath(path)) return authRequired<T>();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    if (!isPublicPath(path)) return authRequired<T>();
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }

  async patch<T>(_path: string, _body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    // No public route is a PATCH; every PATCH tool needs a key.
    return authRequired<T>();
  }

  private async request<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'X-MCP-Client': `${SERVER_NAME}/${SERVER_VERSION}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch (err) {
      return {
        error: keylessErrorText(
          'transport_error',
          `(${err instanceof Error ? err.message : 'fetch failed'})`
        ),
        status: 0,
        problem: { cls: 'transport_error' },
      };
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      // The v1 routes answer RFC 9457 problems from the same table: `code` is
      // the class, `detail` the user message, `fields` / `suggestions` /
      // `retry_after_seconds` beside them.
      const problem = (json ?? {}) as {
        code?: string;
        detail?: string;
        fields?: Record<string, string[]>;
        retry_after_seconds?: number;
      };
      const cls =
        problem.code && problem.code in MCP_ERRORS
          ? (problem.code as McpErrorClass)
          : (mcpErrorClassForCode(-32007) as McpErrorClass);
      const extra =
        problem.fields !== undefined
          ? `fields: ${JSON.stringify(problem.fields)}`
          : problem.retry_after_seconds !== undefined
            ? `retry_after_seconds: ${problem.retry_after_seconds}`
            : undefined;
      return {
        error: cls in MCP_ERRORS ? keylessErrorText(cls, extra) : `HTTP ${response.status}`,
        status: response.status,
        problem: deskProblemFromBody(json) ?? { cls },
      };
    }

    if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
      return json as ApiResponse<T>;
    }
    return { data: json as T, status: response.status };
  }
}
