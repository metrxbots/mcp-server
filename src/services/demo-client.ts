/**
 * Demo API Client
 *
 * Returns embedded sample data for all Metrx MCP tools.
 * Used with `--demo` flag so users can explore tools without an API key.
 *
 * Extends MetrxApiClient and overrides get/post/patch to return
 * static fixtures, keyed by API path. No network calls are made.
 */

import type { ApiResponse } from '../types.js';
import type {
  DashboardSummary,
  AgentDetail,
  AgentSummary,
  BudgetStatus,
  BudgetConfig,
  OptimizationResult,
  AlertEvent,
  FailurePrediction,
  ModelRoutingExperiment,
} from '../types.js';

// ── Demo Constants ──

const DEMO_AGENT_ID_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DEMO_AGENT_ID_2 = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
const DEMO_AGENT_ID_3 = 'c3d4e5f6-a7b8-9012-cdef-345678901234';
const DEMO_BUDGET_ID = 'd4e5f6a7-b8c9-0123-defa-456789012345';
const DEMO_EXPERIMENT_ID = 'e5f6a7b8-c9d0-1234-efab-567890123456';

// ── Demo Agents ──

const DEMO_AGENTS: AgentDetail[] = [
  {
    id: DEMO_AGENT_ID_1,
    agent_key: 'sales-copilot',
    name: 'Sales Copilot',
    category: 'sales',
    status: 'active',
    is_background: false,
    last_call_at: '2025-03-10T14:30:00Z',
    monthly_cost_cents: 4250,
    roi_multiplier: 3.2,
    description: 'Drafts proposals, answers RFPs, qualifies leads',
    primary_model: 'gpt-4o',
    framework_source: 'langchain',
    failure_risk_score: 0.12,
    outcome_rung: 'revenue',
    outcome_value_cents: 1360000,
    created_at: '2025-01-15T10:00:00Z',
  },
  {
    id: DEMO_AGENT_ID_2,
    agent_key: 'support-bot',
    name: 'Support Bot',
    category: 'support',
    status: 'active',
    is_background: false,
    last_call_at: '2025-03-10T15:45:00Z',
    monthly_cost_cents: 8900,
    roi_multiplier: 1.8,
    description: 'Handles tier-1 support tickets, resolves common issues',
    primary_model: 'gpt-4o-mini',
    framework_source: 'openai-assistants',
    failure_risk_score: 0.45,
    outcome_rung: 'efficiency',
    created_at: '2025-02-01T09:00:00Z',
  },
  {
    id: DEMO_AGENT_ID_3,
    agent_key: 'data-analyst',
    name: 'Data Analyst',
    category: 'engineering',
    status: 'idle',
    is_background: true,
    last_call_at: '2025-03-09T22:00:00Z',
    monthly_cost_cents: 1200,
    roi_multiplier: null,
    description: 'Runs nightly data quality checks and generates reports',
    primary_model: 'claude-3-5-haiku-20241022',
    framework_source: 'custom',
    failure_risk_score: 0.08,
    outcome_rung: 'internal',
    created_at: '2025-02-20T16:30:00Z',
  },
];

// ── Demo Dashboard ──

const DEMO_DASHBOARD: DashboardSummary = {
  is_preview: true,
  stage: 'demo',
  period_days: 30,
  agents: { total: 3, active: 2 },
  agents_list: DEMO_AGENTS.map(
    (a): AgentSummary => ({
      id: a.id,
      agent_key: a.agent_key,
      name: a.name,
      category: a.category,
      status: a.status,
      is_background: a.is_background,
      last_call_at: a.last_call_at,
      monthly_cost_cents: a.monthly_cost_cents,
      roi_multiplier: a.roi_multiplier,
    })
  ),
  cost: {
    total_calls: 12480,
    total_cost_cents: 14350,
    error_calls: 312,
    error_rate: 0.025,
  },
  attribution: {
    total_outcomes: 47,
    total_revenue_cents: 1360000,
    net_value_cents: 1345650,
    roi_multiplier: 9.5,
  },
  optimization: {
    total_savings_cents: 3200,
    suggestion_count: 4,
    top_suggestion: 'Switch Support Bot from gpt-4o-mini to claude-3-5-haiku for 35% savings',
  },
};

// ── Demo Optimization ──

const DEMO_OPTIMIZATION: OptimizationResult = {
  suggestions: [
    {
      type: 'model_switch',
      title: 'Switch Support Bot to claude-3-5-haiku',
      description:
        'Support Bot handles simple tier-1 tickets. Claude 3.5 Haiku provides equivalent quality at 35% lower cost for this use case.',
      impact_monthly_cents: 3115,
      confidence: 'high',
      savings_pct: 35,
      action_label: 'Switch Model',
      implementation: {
        one_click: true,
        endpoint: `/agents/${DEMO_AGENT_ID_2}/settings`,
        payload: { primary_model: 'claude-3-5-haiku-20241022' },
      },
    },
    {
      type: 'token_guardrails',
      title: 'Set max_tokens on Sales Copilot',
      description:
        'Sales Copilot averages 1,200 output tokens but occasionally spikes to 4,000+. Setting max_tokens=2000 cuts outliers without affecting quality.',
      impact_monthly_cents: 850,
      confidence: 'medium',
      savings_pct: 20,
      caveat: 'May truncate very long proposals — review before applying.',
      implementation: {
        one_click: true,
        endpoint: `/agents/${DEMO_AGENT_ID_1}/settings`,
        payload: { max_tokens: 2000 },
      },
    },
    {
      type: 'caching',
      title: 'Enable prompt caching for Data Analyst',
      description:
        'Data Analyst reuses the same system prompt across 90% of calls. Prompt caching could reduce input token costs by up to 50%.',
      impact_monthly_cents: 600,
      confidence: 'medium',
      savings_pct: 50,
    },
    {
      type: 'revenue_intelligence',
      title: 'Track Sales Copilot revenue attribution',
      description:
        'Sales Copilot generates proposals that close deals. Connecting revenue data could prove 5-10x ROI and justify increased investment.',
      impact_monthly_cents: 42500,
      confidence: 'low',
      is_revenue: true,
    },
  ],
  total_monthly_savings_cents: 4565,
  total_revenue_impact_cents: 42500,
  suggestion_count: 4,
  computed_at: '2025-03-10T16:00:00Z',
  analysis_confidence: {
    cost_confidence: 0.85,
    quality_confidence: 0.72,
    display_confidence: 0.78,
    confidence_tier: 'good',
  },
};

// ── Demo Budgets ──

const DEMO_BUDGET_STATUS: BudgetStatus = {
  has_budgets: true,
  total_budgets: 2,
  paused_count: 0,
  warning_count: 1,
  exceeded_count: 0,
  budgets: [
    {
      id: DEMO_BUDGET_ID,
      period: 'monthly',
      agent_id: null,
      limit_microcents: 20000000000, // $200/month
      spent_microcents: 14350000000, // $143.50
      pct_used: 72,
      enforcement_mode: 'alert_only',
      paused: false,
      over_warning: false,
      over_limit: false,
    },
    {
      id: 'f6a7b8c9-d0e1-2345-fabc-678901234567',
      period: 'monthly',
      agent_id: DEMO_AGENT_ID_2,
      limit_microcents: 10000000000, // $100/month
      spent_microcents: 8900000000, // $89
      pct_used: 89,
      enforcement_mode: 'soft_block',
      paused: false,
      over_warning: true,
      over_limit: false,
    },
  ],
};

// ── Demo Alerts ──

const DEMO_ALERTS: AlertEvent[] = [
  {
    id: 'alert-001',
    type: 'budget_warning',
    severity: 'warning',
    title: 'Support Bot approaching budget limit',
    message: 'Support Bot has used 89% of its $100/month budget. At current rate, will exceed in 3 days.',
    agent_id: DEMO_AGENT_ID_2,
    is_read: false,
    created_at: '2025-03-10T12:00:00Z',
  },
  {
    id: 'alert-002',
    type: 'error_spike',
    severity: 'critical',
    title: 'Error rate spike detected',
    message: 'Support Bot error rate jumped from 2.5% to 8.1% in the last hour. Most errors are 429 (rate limit) from OpenAI.',
    agent_id: DEMO_AGENT_ID_2,
    is_read: false,
    created_at: '2025-03-10T15:30:00Z',
  },
  {
    id: 'alert-003',
    type: 'cost_anomaly',
    severity: 'info',
    title: 'Unusual cost increase',
    message: 'Sales Copilot cost increased 40% yesterday due to 3 large RFP responses. This may be normal for end-of-quarter.',
    agent_id: DEMO_AGENT_ID_1,
    is_read: true,
    created_at: '2025-03-09T08:00:00Z',
  },
];

// ── Demo Predictions ──

const DEMO_PREDICTIONS: FailurePrediction[] = [
  {
    id: 'pred-001',
    agent_id: DEMO_AGENT_ID_2,
    prediction_type: 'budget_breach',
    severity: 'warning',
    confidence: 0.82,
    predicted_breach_at: '2025-03-13T00:00:00Z',
    current_value: 89.0,
    threshold_value: 100.0,
    trend_direction: 'increasing',
    status: 'active',
    recommended_actions: [
      {
        action: 'reduce_traffic',
        impact: 'high',
        description: 'Route low-priority tickets to a rules-based system to reduce LLM calls by 30%.',
      },
      {
        action: 'switch_model',
        impact: 'medium',
        description: 'Switch to claude-3-5-haiku for 35% cost reduction without quality loss on tier-1 tickets.',
      },
    ],
  },
];

// ── Demo Experiments ──

const DEMO_EXPERIMENTS: ModelRoutingExperiment[] = [
  {
    id: DEMO_EXPERIMENT_ID,
    name: 'Support Bot: gpt-4o-mini vs claude-3-5-haiku',
    agent_id: DEMO_AGENT_ID_2,
    control_model: 'gpt-4o-mini',
    treatment_model: 'claude-3-5-haiku-20241022',
    traffic_pct: 20,
    status: 'running',
    primary_metric: 'cost_per_resolution',
    control_samples: 450,
    treatment_samples: 112,
    is_significant: false,
    winner: undefined,
  },
];

// ── Demo Cost Leak Report ──

interface CostLeakFinding {
  check: string;
  severity: string;
  agent_id: string;
  agent_name: string;
  description: string;
  estimated_waste_monthly_cents: number;
  fix: string;
  auto_fixable: boolean;
}

interface CostLeakReport {
  scan_timestamp: string;
  total_agents_scanned: number;
  total_leaks_found: number;
  total_estimated_waste_monthly_cents: number;
  health_score: number;
  findings: CostLeakFinding[];
}

const DEMO_COST_LEAK_REPORT: CostLeakReport = {
  scan_timestamp: '2025-03-10T16:00:00Z',
  total_agents_scanned: 3,
  total_leaks_found: 3,
  total_estimated_waste_monthly_cents: 2850,
  health_score: 72,
  findings: [
    {
      check: 'oversized_context',
      severity: 'warning',
      agent_id: DEMO_AGENT_ID_1,
      agent_name: 'Sales Copilot',
      description: 'Average input context is 12K tokens but only 3K is unique per request. 75% is repeated system prompt.',
      estimated_waste_monthly_cents: 1200,
      fix: 'Enable prompt caching or extract common context into a cached prefix.',
      auto_fixable: false,
    },
    {
      check: 'retry_storm',
      severity: 'critical',
      agent_id: DEMO_AGENT_ID_2,
      agent_name: 'Support Bot',
      description: 'Support Bot retries failed requests up to 5 times with no backoff. 312 error calls last month generated ~1,500 unnecessary retries.',
      estimated_waste_monthly_cents: 1350,
      fix: 'Add exponential backoff and cap retries at 2. Consider circuit breaker pattern.',
      auto_fixable: true,
    },
    {
      check: 'model_mismatch',
      severity: 'info',
      agent_id: DEMO_AGENT_ID_3,
      agent_name: 'Data Analyst',
      description: 'Data Analyst uses claude-3-5-haiku which is well-matched, but 20% of calls are simple CSV parsing that could use regex instead of LLM.',
      estimated_waste_monthly_cents: 300,
      fix: 'Pre-filter simple parsing tasks before sending to LLM.',
      auto_fixable: false,
    },
  ],
};

// ── Demo Attribution ──

interface AttributionRecord {
  id: string;
  agent_id: string;
  event_id: string;
  outcome_type: string;
  outcome_source: string;
  value_cents: number;
  description: string;
  created_at: string;
}

interface ROIData {
  costs: {
    total_microcents: number;
    by_model: Record<string, number>;
    avg_per_request: number;
  };
  outcomes: {
    count: number;
    total_value_cents: number;
    by_type: Record<string, number>;
  };
  roi_multiplier: number;
  weighted_avg_confidence: number;
}

const DEMO_ROI_DATA: ROIData = {
  costs: {
    total_microcents: 4250000000, // $42.50
    by_model: { 'gpt-4o': 4250000000 },
    avg_per_request: 425000, // $0.00425
  },
  outcomes: {
    count: 47,
    total_value_cents: 1360000,
    by_type: { deal_closed: 3, proposal_sent: 12, lead_qualified: 32 },
  },
  roi_multiplier: 3.2,
  weighted_avg_confidence: 0.78,
};

// ── Path Matching Helpers ──

function matchPath(
  path: string,
  pattern: string
): { match: boolean; params: Record<string, string> } {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  if (pathParts.length !== patternParts.length) {
    return { match: false, params };
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return { match: false, params };
    }
  }

  return { match: true, params };
}

// ── Demo API Client ──

/**
 * DemoApiClient provides static demo data for all Metrx MCP tools.
 * Implements the same interface as MetrxApiClient via duck typing.
 *
 * Usage:
 *   const client = new DemoApiClient();
 *   // Pass to registerXTools(server, client as any)
 */
export class DemoApiClient {
  /**
   * Simulated GET request — returns demo data based on path.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    return this.routeRequest<T>('GET', path, params);
  }

  /**
   * Simulated POST request — returns demo confirmation data.
   */
  async post<T>(
    path: string,
    body?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    return this.routeRequest<T>('POST', path, undefined, body);
  }

  /**
   * Simulated PATCH request — returns demo confirmation data.
   */
  async patch<T>(
    path: string,
    body?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    return this.routeRequest<T>('PATCH', path, undefined, body);
  }

  /**
   * Simulated ping — always succeeds in demo mode.
   */
  async ping(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  // ── Internal Router ──

  private routeRequest<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean>,
    body?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
    // Strip base URL if present
    const cleanPath = path.replace(/^https?:\/\/[^/]+/, '');

    // GET routes
    if (method === 'GET') {
      // /dashboard — used by multiple tools (dashboard, optimization, cost-leak, upgrade-justification, roi-audit)
      if (cleanPath === '/dashboard') {
        return this.handleDashboardGet<T>(params);
      }

      // /agents
      if (cleanPath === '/agents') {
        return this.resolve<T>({ agents: DEMO_AGENTS });
      }

      // /agents/:id
      const agentDetail = matchPath(cleanPath, '/agents/:id');
      if (agentDetail.match && !cleanPath.includes('/route') && !cleanPath.includes('/metrics') && !cleanPath.includes('/roi') && !cleanPath.includes('/alerts')) {
        const agent = DEMO_AGENTS.find((a) => a.id === agentDetail.params.id);
        if (agent) return this.resolve<T>(agent);
        return this.error<T>('Agent not found in demo data. Try one of the demo agent IDs.');
      }

      // /agents/:id/metrics — optimization per agent
      const agentMetrics = matchPath(cleanPath, '/agents/:id/metrics');
      if (agentMetrics.match) {
        return this.resolve<T>({ optimization: DEMO_OPTIMIZATION });
      }

      // /agents/:id/route — model routing
      const agentRoute = matchPath(cleanPath, '/agents/:id/route');
      if (agentRoute.match) {
        const complexity = String(params?.task_complexity || 'medium');
        const currentModel = String(params?.current_model || 'gpt-4o');
        const recommendations: Record<string, { model: string; savings: number; reason: string }> = {
          low: {
            model: 'gpt-4o-mini',
            savings: 60,
            reason: 'Simple lookups and formatting tasks can use a smaller model with minimal quality difference.',
          },
          medium: {
            model: 'claude-sonnet-4-20250514',
            savings: 25,
            reason: 'Analysis and summarization tasks perform well with Claude Sonnet at lower cost.',
          },
          high: {
            model: currentModel,
            savings: 0,
            reason: 'Complex reasoning tasks benefit from the current premium model.',
          },
        };
        const rec = recommendations[complexity] || recommendations.medium;
        return this.resolve<T>({
          recommended_model: rec.model,
          current_model: currentModel,
          task_complexity: complexity,
          estimated_savings_pct: rec.savings,
          confidence: rec.savings > 0 ? 'high' : 'n/a',
          reason: rec.reason,
        });
      }

      // /agents/:id/roi — ROI data
      const agentRoi = matchPath(cleanPath, '/agents/:id/roi');
      if (agentRoi.match) {
        return this.resolve<T>(DEMO_ROI_DATA);
      }

      // /agents/models/compare — model comparison
      if (cleanPath === '/agents/models/compare') {
        return this.resolve<T>({
          models: [
            {
              model: 'gpt-4o',
              provider: 'openai',
              tier: 'frontier',
              input_cost_per_1m: 2.5,
              output_cost_per_1m: 10.0,
              context_window: 128000,
              supports_batch: true,
              supports_caching: false,
            },
            {
              model: 'claude-sonnet-4-20250514',
              provider: 'anthropic',
              tier: 'frontier',
              input_cost_per_1m: 3.0,
              output_cost_per_1m: 15.0,
              context_window: 200000,
              supports_batch: true,
              supports_caching: true,
            },
            {
              model: 'gpt-4o-mini',
              provider: 'openai',
              tier: 'balanced',
              input_cost_per_1m: 0.15,
              output_cost_per_1m: 0.6,
              context_window: 128000,
              supports_batch: true,
              supports_caching: false,
            },
            {
              model: 'claude-3-5-haiku-20241022',
              provider: 'anthropic',
              tier: 'efficient',
              input_cost_per_1m: 0.8,
              output_cost_per_1m: 4.0,
              context_window: 200000,
              supports_batch: true,
              supports_caching: true,
              savings_vs_current_pct: 68,
            },
          ],
          current_model_info: params?.current_model
            ? {
                model: String(params.current_model),
                provider: 'openai',
                input_cost_per_1m: 2.5,
                output_cost_per_1m: 10.0,
              }
            : undefined,
        });
      }

      // /budgets/status
      if (cleanPath === '/budgets/status') {
        return this.resolve<T>(DEMO_BUDGET_STATUS);
      }

      // /alerts
      if (cleanPath === '/alerts') {
        let alerts = [...DEMO_ALERTS];
        if (params?.severity) {
          alerts = alerts.filter((a) => a.severity === String(params.severity));
        }
        if (params?.unread_only === true || params?.unread_only === 'true') {
          alerts = alerts.filter((a) => !a.is_read);
        }
        return this.resolve<T>({ alerts });
      }

      // /predictions
      if (cleanPath === '/predictions') {
        return this.resolve<T>({ predictions: DEMO_PREDICTIONS });
      }

      // /experiments
      if (cleanPath === '/experiments') {
        return this.resolve<T>({ experiments: DEMO_EXPERIMENTS });
      }

      // /outcomes — attribution report
      if (cleanPath === '/outcomes') {
        return this.resolve<T>({
          agent_id: params?.agent_id || null,
          period_days: Number(params?.days) || 30,
          model: 'last_touch',
          total_outcomes: 47,
          total_value_cents: 1360000,
          outcomes: [
            {
              outcome_type: 'deal_closed',
              count: 3,
              value_cents: 900000,
              confidence: 0.85,
              top_attributions: [
                { agent_id: DEMO_AGENT_ID_1, agent_name: 'Sales Copilot', contribution_pct: 0.65 },
              ],
            },
            {
              outcome_type: 'proposal_sent',
              count: 12,
              value_cents: 360000,
              confidence: 0.72,
              top_attributions: [
                { agent_id: DEMO_AGENT_ID_1, agent_name: 'Sales Copilot', contribution_pct: 0.90 },
              ],
            },
            {
              outcome_type: 'lead_qualified',
              count: 32,
              value_cents: 100000,
              confidence: 0.60,
              top_attributions: [
                { agent_id: DEMO_AGENT_ID_1, agent_name: 'Sales Copilot', contribution_pct: 0.45 },
                { agent_id: DEMO_AGENT_ID_2, agent_name: 'Support Bot', contribution_pct: 0.30 },
              ],
            },
          ],
        });
      }
    }

    // POST routes
    if (method === 'POST') {
      // /budgets
      if (cleanPath === '/budgets') {
        const config: BudgetConfig = {
          id: 'demo-new-budget-' + Date.now(),
          period: (body?.period as 'daily' | 'monthly') || 'monthly',
          limit_microcents: (body?.limit_microcents as number) || 10000000000,
          warning_pct: (body?.warning_pct as number) || 80,
          enforcement_mode: (body?.enforcement_mode as 'alert_only' | 'soft_block' | 'hard_block') || 'alert_only',
          paused: false,
          agent_id: (body?.agent_id as string) || null,
        };
        return this.resolve<T>(config);
      }

      // /agents/:id/settings — apply optimization
      const agentSettings = matchPath(cleanPath, '/agents/:id/settings');
      if (agentSettings.match) {
        return this.resolve<T>({
          applied: true,
          message: `Demo: optimization "${body?.optimization_type || 'unknown'}" would be applied to agent ${agentSettings.params.id}.`,
        });
      }

      // /experiments — create experiment
      if (cleanPath === '/experiments') {
        const exp: ModelRoutingExperiment = {
          id: 'demo-exp-' + Date.now(),
          name: (body?.name as string) || 'Demo Experiment',
          agent_id: (body?.agent_id as string) || DEMO_AGENT_ID_2,
          control_model: (body?.control_model as string) || 'gpt-4o-mini',
          treatment_model: (body?.treatment_model as string) || 'claude-3-5-haiku-20241022',
          traffic_pct: (body?.traffic_pct as number) || 20,
          status: 'running',
          primary_metric: (body?.primary_metric as string) || 'cost_per_call',
          control_samples: 0,
          treatment_samples: 0,
          is_significant: false,
        };
        return this.resolve<T>(exp);
      }

      // /experiments/:id/stop
      const expStop = matchPath(cleanPath, '/experiments/:id/stop');
      if (expStop.match) {
        return this.resolve<T>({
          status: 'completed',
          promoted: body?.promote_winner === true,
        });
      }

      // /outcomes — record attribution
      if (cleanPath === '/outcomes') {
        const record: AttributionRecord = {
          id: 'demo-attr-' + Date.now(),
          agent_id: (body?.agent_id as string) || DEMO_AGENT_ID_1,
          event_id: (body?.event_id as string) || 'demo-event-001',
          outcome_type: (body?.outcome_type as string) || 'deal_closed',
          outcome_source: (body?.source as string) || 'manual',
          value_cents: (body?.value_cents as number) || 50000,
          description: (body?.description as string) || 'Demo attribution record',
          created_at: new Date().toISOString(),
        };
        return this.resolve<T>(record);
      }

      // /alerts/thresholds — configure alert
      if (cleanPath === '/alerts/thresholds') {
        return this.resolve<T>({
          configured: true,
          threshold_id: 'demo-threshold-' + Date.now(),
          message: `Demo: alert threshold for "${body?.metric || 'unknown'}" configured.`,
        });
      }

      // /agents/:id/alerts — configure agent-specific alert
      const agentAlerts = matchPath(cleanPath, '/agents/:id/alerts');
      if (agentAlerts.match) {
        return this.resolve<T>({
          configured: true,
          threshold_id: 'demo-threshold-' + Date.now(),
          message: `Demo: alert threshold for agent ${agentAlerts.params.id} configured.`,
        });
      }
    }

    // PATCH routes
    if (method === 'PATCH') {
      // /budgets/:id
      const budgetPatch = matchPath(cleanPath, '/budgets/:id');
      if (budgetPatch.match) {
        const existing = DEMO_BUDGET_STATUS.budgets.find((b) => b.id === budgetPatch.params.id);
        const config: BudgetConfig = {
          id: budgetPatch.params.id,
          period: 'monthly',
          limit_microcents: existing?.limit_microcents || 10000000000,
          warning_pct: 80,
          enforcement_mode:
            (body?.enforcement_mode as 'alert_only' | 'soft_block' | 'hard_block') || 'alert_only',
          paused: body?.paused !== undefined ? (body.paused as boolean) : false,
          agent_id: existing?.agent_id || null,
        };
        return this.resolve<T>(config);
      }

      // /alerts — acknowledge alerts
      if (cleanPath === '/alerts') {
        return this.resolve<T>({ acknowledged: (body?.alert_ids as string[])?.length || 1 });
      }
    }

    // Fallback — unknown route
    return this.resolve<T>({
      demo: true,
      message: `Demo mode: no mock data for ${method} ${cleanPath}. This endpoint would work with a real API key.`,
    });
  }

  // ── Dashboard handler (shared by multiple tools) ──

  private handleDashboardGet<T>(
    params?: Record<string, string | number | boolean>
  ): Promise<ApiResponse<T>> {
    const data: Record<string, unknown> = { ...DEMO_DASHBOARD };

    // Override period_days if specified
    if (params?.period_days) {
      (data as any).period_days = Number(params.period_days);
    }

    // Include optimization data when requested
    if (params?.include_optimization === true || params?.include_optimization === 'true') {
      (data as any).optimization = DEMO_OPTIMIZATION;
    }

    // Include cost leak scan when requested
    if (params?.include_cost_leak_scan === true || params?.include_cost_leak_scan === 'true') {
      (data as any).cost_leak_report = DEMO_COST_LEAK_REPORT;
    }

    return this.resolve<T>(data);
  }

  // ── Helpers ──

  private resolve<T>(data: unknown): Promise<ApiResponse<T>> {
    return Promise.resolve({ data: data as T });
  }

  private error<T>(message: string): Promise<ApiResponse<T>> {
    return Promise.resolve({ error: message });
  }
}
