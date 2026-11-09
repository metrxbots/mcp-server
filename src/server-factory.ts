/**
 * MCP Server Factory
 *
 * Creates a fully-configured McpServer instance with every Metrx tool registered.
 * Deliberately states no count: the authoritative number is derived from source
 * by MCP_TOOL_COUNT (packages/mcp-server/src/tool-registry-facts.ts). Prose that
 * carries its own copy of the number is how 23/24/26/29 all ended up in circulation.
 * Used by both the stdio CLI entrypoint and the Streamable HTTP endpoint.
 *
 * @module server-factory
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { MetrxApiClient } from './services/api-client.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerOptimizationTools } from './tools/optimization.js';
import { registerBudgetTools } from './tools/budgets.js';
import { registerAlertTools } from './tools/alerts.js';
import { registerExperimentTools } from './tools/experiments.js';
import { registerCostLeakDetectorTools } from './tools/cost-leak-detector.js';
import { registerAttributionTools } from './tools/attribution.js';
import { registerUpgradeJustificationTools } from './tools/upgrade-justification.js';
import { registerROIAuditTools } from './tools/roi-audit.js';
import { registerHealthRankingsTools } from './tools/health-rankings.js';
import { registerUpgradeBusinessCaseTools } from './tools/upgrade-business-case.js';
import { registerVerifyBillingTools } from './tools/verify-billing.js';
import { registerLoopMetricsTools } from './tools/loop-metrics.js';
import { registerContractTools } from './tools/contracts.js';
import { registerWorkforceTools } from './tools/workforce.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import {
  mcpToolSummary,
  mcpToolScope,
  mcpScopeSentence,
  mcpToolAuthMode,
  mcpToolSet,
  LEGACY_ENVELOPE_PENDING_NOTE,
  type McpToolName,
  type McpToolSetName,
} from './tool-registry-facts.js';

/**
 * Factory options (desk PR 1).
 *
 * authMode 'key' (default): the caller presented an API key; every tool is
 *   registered, every description carries its scope sentence.
 * authMode 'public': no key. ONLY the tools MCP_TOOL_AUTH marks 'public' are
 *   registered (tools/list shows nothing a keyless caller cannot call), and
 *   their descriptions carry no scope sentence.
 * toolSet: a named subset (`tools/list ?set=workforce`); undefined = the full
 *   registry. Applied after the auth filter.
 * isDemo: append the demo CTA every fifth call (stdio --demo).
 */
export interface CreateMcpServerOptions {
  isDemo?: boolean;
  authMode?: 'key' | 'public';
  toolSet?: McpToolSetName;
}

/** The handle shape the domain modules may touch on a tool that was NOT registered. */
const SKIPPED_TOOL_HANDLE = Object.freeze({
  update: () => {},
  remove: () => {},
  enable: () => {},
  disable: () => {},
  enabled: false,
});

/**
 * Minimal interface that any API client (real or demo) must satisfy.
 * Uses structural typing — no `implements` keyword needed.
 */
export interface ApiClientLike {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<{ data?: T; error?: string }>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<{ data?: T; error?: string }>;
  patch<T>(path: string, body?: Record<string, unknown>): Promise<{ data?: T; error?: string }>;
}

/**
 * Creates a fully-configured McpServer with all Metrx tools registered.
 *
 * @param apiKey - The Metrx API key for authenticating tool calls
 * @param apiUrl - Optional API base URL override (default: https://app.metrxbot.com/api)
 * @param options - See CreateMcpServerOptions (authMode is 'key' here)
 * @returns A configured McpServer ready to be connected to a transport
 */
export function createMcpServer(
  apiKey: string,
  apiUrl?: string,
  options?: CreateMcpServerOptions
): McpServer;
/**
 * Creates a fully-configured McpServer using a pre-built API client.
 * Used by the hosted route (MetrxApiClient or InProcessKeylessClient) and by `--demo` (HttpKeylessClient).
 *
 * @param client - A pre-built API client (MetrxApiClient, or a keyless client)
 * @param options - See CreateMcpServerOptions
 * @returns A configured McpServer ready to be connected to a transport
 */
export function createMcpServer(client: ApiClientLike, options?: CreateMcpServerOptions): McpServer;
export function createMcpServer(
  apiKeyOrClient: string | ApiClientLike,
  apiUrlOrOptions?: string | CreateMcpServerOptions,
  keyPathOptions?: CreateMcpServerOptions
): McpServer {
  const apiClient =
    typeof apiKeyOrClient === 'string'
      ? new MetrxApiClient(
          apiKeyOrClient,
          typeof apiUrlOrOptions === 'string' ? apiUrlOrOptions : undefined
        )
      : apiKeyOrClient;
  const options: CreateMcpServerOptions =
    typeof apiKeyOrClient === 'string'
      ? (keyPathOptions ?? {})
      : typeof apiUrlOrOptions === 'object' && apiUrlOrOptions
        ? apiUrlOrOptions
        : {};
  const isDemo = options.isDemo === true;
  const authMode = options.authMode ?? 'key';
  const toolSet = options.toolSet ? mcpToolSet(options.toolSet) : undefined;
  if (options.toolSet && !toolSet) {
    throw new Error(`Unknown MCP tool set '${options.toolSet}'.`);
  }
  const rateLimiter = new RateLimiter();
  let demoToolCallCount = 0;

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      // L7: the count comes from the SSOT (never hand-typed), and the
      // envelope-pending note tells callers which response contract each tool
      // follows (loop-metrics = envelopes; legacy = plain numbers, pending).
      instructions: `${mcpToolSummary()}. ${LEGACY_ENVELOPE_PENDING_NOTE}`,
    }
  );

  // Add rate limiting middleware + metrx_ namespace prefix
  const METRX_PREFIX = 'metrx_';
  const originalRegisterTool = server.registerTool.bind(server);
  (server as any).registerTool = function (
    name: string,
    config: any,
    handler: (...handlerArgs: any[]) => Promise<any>
  ) {
    const wrappedHandler = async (...handlerArgs: any[]) => {
      if (!rateLimiter.isAllowed(name)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Rate limit exceeded for tool '${name}': its category's window is full. Retry in ${rateLimiter.getRetryAfter(name)} seconds.`,
            },
          ],
          isError: true,
        };
      }
      const result = await handler(...handlerArgs);

      // In demo mode, append a subtle upgrade CTA every 5 tool calls
      if (isDemo) {
        demoToolCallCount++;
        if (demoToolCallCount % 5 === 0 && result?.content?.length > 0) {
          result.content.push({
            type: 'text' as const,
            text: "\n---\n💡 You're using demo data. Connect real agents to track actual costs → https://app.metrxbot.com/sign-up?source=mcp-demo",
          });
        }
      }

      return result;
    };

    // Register with metrx_ prefix (primary name only — no deprecated aliases)
    const prefixedName = name.startsWith(METRX_PREFIX) ? name : `${METRX_PREFIX}${name}`;

    // W1-4b: every tool declares the API-key scope it needs (MCP_TOOL_SCOPES).
    // An undeclared tool is a registration-time failure, not a silent default:
    // guessing 'read' would advertise a write tool as callable by read-only keys.
    const scope = mcpToolScope(name);
    if (!scope) {
      throw new Error(
        `MCP tool '${name}' has no declared API-key scope. Add it to MCP_TOOL_SCOPES in ` +
          'src/tool-registry-facts.ts.'
      );
    }
    // Desk PR 1: the auth axis. A tool with no auth mode is the same class of
    // registration-time failure as a tool with no scope.
    const bareName = name.startsWith(METRX_PREFIX) ? name.slice(METRX_PREFIX.length) : name;
    const toolAuth = mcpToolAuthMode(name);
    if (!toolAuth) {
      throw new Error(
        `MCP tool '${name}' has no declared auth mode. Add it to MCP_TOOL_AUTH in ` +
          'src/tool-registry-facts.ts.'
      );
    }
    // Public mode lists only what a keyless caller can call; a named set
    // narrows further. A skipped tool returns an inert handle so a module that
    // enriches its description later (verify-billing) has nothing to crash on.
    if (authMode === 'public' && toolAuth !== 'public') return SKIPPED_TOOL_HANDLE;
    if (toolSet && !toolSet.has(bareName as McpToolName)) return SKIPPED_TOOL_HANDLE;

    // The scope sentence is for key holders: a public tool's description says
    // instead what it needs (nothing, or a read key for org:'me').
    const scopeSentence = mcpScopeSentence(scope);
    const withScope = (description: unknown): unknown =>
      toolAuth === 'public'
        ? description
        : typeof description === 'string' && !description.includes(scopeSentence)
          ? `${description.trimEnd()} ${scopeSentence}`
          : description;
    const scopedConfig = {
      ...config,
      description: withScope(config?.description),
      _meta: {
        ...(config?._meta ?? {}),
        'metrx/required_scope': scope,
        'metrx/auth_mode': toolAuth,
      },
    };

    // Return the RegisteredTool handle: callers use .update() to enrich a
    // description after an async lookup resolves. Swallowing it here silently
    // broke that (the handle was undefined), so keep this return. Its update()
    // is wrapped so a re-written description keeps the scope sentence.
    const handle = originalRegisterTool(prefixedName, scopedConfig, wrappedHandler);
    if (handle && typeof handle.update === 'function') {
      const originalUpdate = handle.update.bind(handle);
      handle.update = (updates: any) =>
        originalUpdate(
          updates && typeof updates.description === 'string'
            ? { ...updates, description: withScope(updates.description) }
            : updates
        );
    }
    return handle;
  };

  // Register all tool domains
  // Cast to any for duck-typing compatibility with the keyless clients
  const client = apiClient as any;
  registerDashboardTools(server, client);
  registerOptimizationTools(server, client);
  registerBudgetTools(server, client);
  registerAlertTools(server, client);
  registerExperimentTools(server, client);
  registerCostLeakDetectorTools(server, client);
  registerAttributionTools(server, client);
  registerUpgradeJustificationTools(server, client);
  registerROIAuditTools(server, client);
  registerUpgradeBusinessCaseTools(server, client);
  registerHealthRankingsTools(server, client);
  // W-C01: job contract per agent.
  registerContractTools(server, client);
  // Verify billing tools (PR-2). Registration is synchronous — all three tools
  // exist once this returns, so the tool count never depends on the network.
  // The returned promise only enriches their descriptions with the live cost
  // line from GET /api/pricing (ADR-1 — never hardcoded); it cannot reject and
  // cannot remove a tool, so fire-and-forget is safe here.
  void registerVerifyBillingTools(server, client);
  // Loop-metrics parity tools (N-5 D-6). The module is SDK-import-free by
  // design (apps/web's parity test imports it directly); the monkey-patched
  // registerTool above satisfies its structural ToolRegistrar.
  registerLoopMetricsTools(server as any, client);
  // Manager's desk (plan §2). SDK-import-free like loop-metrics; the public
  // three answer without a key through the keyless clients.
  registerWorkforceTools(server as any, client);

  // ── MCP Prompts ──
  // Pre-built prompt templates that help users interact with Metrx tools.

  server.registerPrompt(
    'analyze-costs',
    {
      title: 'Analyze AI Agent Costs',
      description:
        'Get a comprehensive overview of your AI agent costs including spend breakdown, ' +
        'top-spending agents, error rates, and optimization opportunities.',
      argsSchema: {
        period_days: z
          .string()
          .optional()
          .describe('Number of days to analyze (default: 30). Examples: "7", "30", "90"'),
      },
    },
    async ({ period_days }) => {
      const days = period_days ? parseInt(period_days, 10) : 30;
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text:
                `Analyze my AI agent costs for the last ${days} days. ` +
                'Start by calling metrx_get_cost_summary, then metrx_list_agents to see all agents, ' +
                'and metrx_get_optimization_recommendations for savings. ' +
                'Summarize: total spend, top 3 spending agents, error rates, and top optimization opportunities.',
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'find-savings',
    {
      title: 'Find Cost Savings',
      description:
        'Discover optimization opportunities across your AI agent fleet. ' +
        'Identifies model downgrades, caching opportunities, and routing improvements.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Find cost savings across my AI agents. ' +
              'Call metrx_get_optimization_recommendations to find opportunities, ' +
              'then metrx_run_cost_leak_scan to detect waste patterns. ' +
              'For each finding, explain the potential savings in dollars and how to fix it.',
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'cost-leak-scan',
    {
      title: 'Run Cost Leak Scan',
      description:
        'Scan for waste patterns in your AI agent operations — retry storms, ' +
        'oversized contexts, model mismatch, and missing caching.',
      argsSchema: {
        agent_id: z
          .string()
          .optional()
          .describe('Optional agent ID (UUID) to scan a specific agent. Omit to scan all.'),
      },
    },
    async ({ agent_id }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: agent_id
              ? `Run a cost leak scan for agent ${agent_id} using metrx_run_cost_leak_scan. ` +
                'Show the MetrxScore, list all detected leaks with severity, and suggest fixes for each.'
              : 'Run a cost leak scan across all agents using metrx_run_cost_leak_scan. ' +
                'Show the MetrxScore, list all detected leaks ranked by severity, ' +
                'and provide a prioritized action plan to fix the top waste patterns.',
          },
        },
      ],
    })
  );

  return server;
}

/**
 * The keyed HTTP client, exported so a host (the hosted /api/mcp route) can
 * wrap it: it serves the public desk tools in-process and hands everything
 * else to this client (review M2: no self-fetch through the public limiter).
 */
export { MetrxApiClient };
/** The hosted route wraps its transport with this, exactly as the stdio entry does. */
export { liftDeskErrorsOn } from './errors.js';
