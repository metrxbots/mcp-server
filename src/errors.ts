/**
 * The desk's error table (plan §2): one row per error class, used by the
 * hosted MCP route (JSON-RPC error with `data`), the keyless clients, and the
 * unauthenticated api/v1 routes (RFC 9457 problem body + Retry-After). Both
 * servers (hosted and stdio --demo) answer the same `data.user_message` for
 * the same class (stdio parity test).
 *
 * PURE: a verbatim copy of apps/web/lib/mcp/errors.ts (the app is the source;
 * this package has zero workspace deps; mcp-errors-parity.test.ts pins the copy).
 *
 * `user_message` is fixed text per class: what a person reading the chat
 * should do next. `doc` is the anchor on the desk docs page. Nothing in this
 * table interpolates caller input; the caller's own values go in the typed
 * `data` fields (retry_after_seconds, suggestions, fields).
 */

export const MCP_ERROR_CLASSES = [
  'auth_required',
  'insufficient_scope',
  'rate_limited',
  'limiter_unavailable',
  'demo_unavailable',
  'unknown_agent_key',
  'invalid_params',
  'transport_error',
  'review_unavailable',
] as const;
export type McpErrorClass = (typeof MCP_ERROR_CLASSES)[number];

export interface McpErrorRow {
  /** JSON-RPC error code. -32602 is the spec's invalid params; the rest are server-defined. */
  code: number;
  /** HTTP status the v1 routes answer with for the same class. */
  http: number;
  /** JSON-RPC `message` (short, machine-readable). */
  message: string;
  /** Fixed, for the person in the chat. */
  user_message: string;
}

export const DESK_DOCS_URL = 'https://docs.metrxbot.com/desk';

export const MCP_ERRORS: Record<McpErrorClass, McpErrorRow> = {
  auth_required: {
    code: -32001,
    http: 401,
    message: 'auth_required',
    user_message:
      'This tool needs a Metrx API key. Create one under Settings → Security and set METRX_API_KEY, or run the demo with org: "demo".',
  },
  insufficient_scope: {
    code: -32002,
    http: 403,
    message: 'insufficient_scope',
    user_message:
      'Your API key does not carry the scope this tool needs. Create a key with the named scope under Settings → Security.',
  },
  rate_limited: {
    code: -32003,
    http: 429,
    message: 'rate_limited',
    user_message:
      'Too many requests from this address. Wait the number of seconds in retry_after_seconds and try again.',
  },
  limiter_unavailable: {
    code: -32004,
    http: 503,
    message: 'limiter_unavailable',
    user_message:
      'The public desk is briefly unavailable while its rate limiter is down. Try again in about 30 seconds; a Metrx API key is not affected.',
  },
  demo_unavailable: {
    code: -32005,
    http: 503,
    message: 'demo_unavailable',
    user_message:
      'The Northwind demo is being rebuilt right now. Try again in a few minutes, or run the review on your own data with a Metrx API key.',
  },
  unknown_agent_key: {
    code: -32006,
    http: 404,
    message: 'unknown_agent_key',
    user_message:
      'No agent with that key in this organization. Check the agent_key on the Agents page; close matches, if any, are listed in suggestions.',
  },
  invalid_params: {
    code: -32602,
    http: 400,
    message: 'invalid_params',
    user_message: 'One or more inputs are invalid; the fields list says which ones and why.',
  },
  transport_error: {
    code: -32007,
    http: 502,
    message: 'transport_error',
    user_message:
      'Metrx could not be reached. Check METRX_MCP_URL (hosted) or your network, then try again.',
  },
  review_unavailable: {
    code: -32008,
    http: 503,
    message: 'review_unavailable',
    user_message:
      'Your workforce review could not be built right now because one of its reads failed. Nothing was changed; try again in about a minute.',
  },
};

/** The `data` object every error carries. Extra fields are per class. */
export interface McpErrorData {
  class: McpErrorClass;
  doc: string;
  user_message: string;
  retry_after_seconds?: number;
  suggestions?: string[];
  fields?: Record<string, string[]>;
  required_scope?: string;
}

export interface McpErrorExtras {
  retry_after_seconds?: number;
  suggestions?: string[];
  fields?: Record<string, string[]>;
  required_scope?: string;
}

/** The default Retry-After for a limiter outage (plan §2: 30 s). */
export const LIMITER_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;
/** Retry-After when the live review's aggregate read failed (a transient DB read). */
export const REVIEW_UNAVAILABLE_RETRY_AFTER_SECONDS = 60;

export function mcpErrorDoc(cls: McpErrorClass): string {
  return `${DESK_DOCS_URL}#errors-${cls.replace(/_/g, '-')}`;
}

/**
 * Classes whose `data` (and v1 problem body) never carries
 * retry_after_seconds, even when the caller passes one for the Retry-After
 * header. limiter_unavailable is a fixed outage wait, stated in its
 * user_message and the header; only the per-address 429 (rate_limited)
 * counts down a real window in the body.
 */
const NO_RETRY_FIELD_CLASSES: ReadonlySet<string> = new Set(['limiter_unavailable']);

export function mcpErrorData(cls: McpErrorClass, extras: McpErrorExtras = {}): McpErrorData {
  const row = MCP_ERRORS[cls];
  const data: McpErrorData = { class: cls, doc: mcpErrorDoc(cls), user_message: row.user_message };
  if (extras.retry_after_seconds !== undefined && !NO_RETRY_FIELD_CLASSES.has(cls))
    data.retry_after_seconds = extras.retry_after_seconds;
  if (extras.suggestions !== undefined) data.suggestions = extras.suggestions.slice(0, 5);
  if (extras.fields !== undefined) data.fields = extras.fields;
  if (extras.required_scope !== undefined) data.required_scope = extras.required_scope;
  return data;
}

/** A JSON-RPC 2.0 error response for a class. `id` is the request id (null when unknown). */
export function jsonRpcError(
  id: string | number | null,
  cls: McpErrorClass,
  extras: McpErrorExtras = {}
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data: McpErrorData };
} {
  const row = MCP_ERRORS[cls];
  return {
    jsonrpc: '2.0',
    id,
    error: { code: row.code, message: row.message, data: mcpErrorData(cls, extras) },
  };
}

/**
 * RFC 9457 problem body for the v1 routes. `type` is the docs anchor,
 * `title` the class, `detail` the user message; the desk fields ride beside
 * the standard members so a client reading either convention gets the same
 * facts. The Metrx `error`/`code` pair is kept for the ApiError readers.
 */
export interface V1Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: McpErrorClass;
  error: string;
  retry_after_seconds?: number;
  suggestions?: string[];
  fields?: Record<string, string[]>;
  required_scope?: string;
}

export function v1Problem(cls: McpErrorClass, extras: McpErrorExtras = {}): V1Problem {
  const row = MCP_ERRORS[cls];
  const data = mcpErrorData(cls, extras);
  const body: V1Problem = {
    type: data.doc,
    title: row.message,
    status: row.http,
    detail: row.user_message,
    code: cls,
    error: row.user_message,
  };
  if (data.retry_after_seconds !== undefined) body.retry_after_seconds = data.retry_after_seconds;
  if (data.suggestions !== undefined) body.suggestions = data.suggestions;
  if (data.fields !== undefined) body.fields = data.fields;
  if (data.required_scope !== undefined) body.required_scope = data.required_scope;
  return body;
}

/** The classes whose retry_after_seconds also rides as a Retry-After header. */
const RETRYABLE_CLASSES: ReadonlySet<string> = new Set([
  'rate_limited',
  'limiter_unavailable',
  'demo_unavailable',
  'review_unavailable',
]);

/** Headers a v1 problem response carries (Retry-After only for the retryable classes). */
export function v1ProblemHeaders(
  cls: McpErrorClass,
  extras: McpErrorExtras = {}
): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/problem+json' };
  if (RETRYABLE_CLASSES.has(cls) && extras.retry_after_seconds !== undefined) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil(extras.retry_after_seconds)));
  }
  return headers;
}

/** Map a JSON-RPC code back to its class (for the stdio client and tests). */
export function mcpErrorClassForCode(code: number): McpErrorClass | null {
  for (const cls of MCP_ERROR_CLASSES) if (MCP_ERRORS[cls].code === code) return cls;
  return null;
}

// ── Desk errors raised inside a tool (plan §2 error semantics) ──
//
// The SDK turns anything a tool handler throws into a plain `isError` result,
// which drops the class, `retry_after_seconds` and `suggestions`. So a desk
// tool RETURNS its error result with the table data under `_meta`, and the
// transport lifts it into the JSON-RPC error the table specifies (same id,
// inside the normal 200 response). One wrapper, `liftDeskErrorsOn`, does that
// for the hosted transport and for stdio alike.

/** Where a tool result carries its desk error for the transport to lift. */
export const DESK_ERROR_META_KEY = 'metrx/error';

/** A desk error as the clients carry it: the table class plus its extras. */
export interface DeskProblem {
  cls: McpErrorClass;
  extras?: McpErrorExtras;
}

function isErrorClass(value: unknown): value is McpErrorClass {
  return typeof value === 'string' && (MCP_ERROR_CLASSES as readonly string[]).includes(value);
}

function extrasFrom(source: Record<string, unknown>): McpErrorExtras {
  const extras: McpErrorExtras = {};
  if (typeof source.retry_after_seconds === 'number') {
    extras.retry_after_seconds = source.retry_after_seconds;
  }
  if (Array.isArray(source.suggestions)) {
    extras.suggestions = source.suggestions.filter((s): s is string => typeof s === 'string');
  }
  if (source.fields && typeof source.fields === 'object' && !Array.isArray(source.fields)) {
    extras.fields = source.fields as Record<string, string[]>;
  }
  if (typeof source.required_scope === 'string') extras.required_scope = source.required_scope;
  return extras;
}

/**
 * A v1 problem body (or its raw text) back to its class and extras. Null when
 * the body is not one of the table's problems (an older route, a non-desk
 * error), so the caller keeps its text-only error.
 */
export function deskProblemFromBody(body: unknown): DeskProblem | null {
  let parsed = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (!isErrorClass(record.code)) return null;
  return { cls: record.code, extras: extrasFrom(record) };
}

/** The `isError` tool result for a desk problem: the text for a person, the table data for the transport. */
export function deskErrorResult(
  text: string,
  problem: DeskProblem
): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
  _meta: Record<string, unknown>;
} {
  return {
    content: [{ type: 'text', text }],
    isError: true,
    _meta: { [DESK_ERROR_META_KEY]: mcpErrorData(problem.cls, problem.extras ?? {}) },
  };
}

/**
 * A JSON-RPC response whose tool result carries a desk error becomes the
 * table's JSON-RPC error with the same id. Anything else comes back as the
 * same object, untouched.
 */
export function liftDeskToolError<M>(message: M): M | ReturnType<typeof jsonRpcError> {
  const candidate = message as {
    id?: string | number | null;
    result?: { isError?: unknown; _meta?: Record<string, unknown> };
  } | null;
  if (!candidate || typeof candidate !== 'object' || candidate.result?.isError !== true) {
    return message;
  }
  const meta = candidate.result._meta?.[DESK_ERROR_META_KEY];
  if (!meta || typeof meta !== 'object') return message;
  const data = meta as Record<string, unknown>;
  if (!isErrorClass(data.class)) return message;
  return jsonRpcError(candidate.id ?? null, data.class, extrasFrom(data));
}

/**
 * Wrap a transport so every outgoing message passes through
 * liftDeskToolError. The SDK server calls `transport.send` for each response,
 * so this is the one place both the hosted and the stdio server lift.
 */
export function liftDeskErrorsOn<
  T extends { send: (message: any, options?: any) => Promise<void> },
>(transport: T): T {
  const send = transport.send.bind(transport);
  transport.send = ((message: unknown, options?: unknown) =>
    send(liftDeskToolError(message), options)) as T['send'];
  return transport;
}
