/**
 * MCP Server Type Definitions
 *
 * Internal types for the Metrx MCP server.
 * These mirror the API response shapes for type safety.
 */

// ── API Response Wrappers ──

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  is_preview?: boolean;
}

// ── Agent Types ──

export interface AgentSummary {
  id: string;
  agent_key: string;
  name: string;
  category: string;
  status: string;
  is_background: boolean;
  last_call_at?: string;
  monthly_cost_cents?: number;
  roi_multiplier?: number | null;
}

export interface AgentDetail extends AgentSummary {
  description?: string;
  parent_agent_id?: string;
  framework_source?: string;
  outcome_value_cents?: number;
  outcome_rung?: string;
  primary_model?: string;
  failure_risk_score?: number;
  secondary_categories?: string[];
  created_at: string;
}

// ── Dashboard Types ──

export interface DashboardSummary {
  is_preview: boolean;
  stage: string;
  period_days: number;
  agents: { total: number; active: number };
  agents_list: AgentSummary[];
  cost: {
    total_calls: number;
    total_cost_cents: number;
    error_calls: number;
    error_rate: number;
  };
  attribution?: {
    total_outcomes: number;
    total_revenue_cents: number;
    net_value_cents: number;
    roi_multiplier: number;
  };
  optimization?: {
    total_savings_cents: number;
    suggestion_count: number;
    top_suggestion?: string;
  };
}

// ── Cost Types ──

export interface CostSummary {
  agent_id: string;
  agent_name: string;
  period_days: number;
  total_calls: number;
  total_cost_cents: number;
  avg_cost_per_call_cents: number;
  error_rate: number;
  primary_model: string;
  daily_trend: Array<{
    day: string;
    calls: number;
    cost_cents: number;
  }>;
}

// ── Budget Types ──

export interface BudgetStatus {
  has_budgets: boolean;
  total_budgets: number;
  paused_count: number;
  warning_count: number;
  exceeded_count: number;
  budgets: BudgetSummary[];
}

export interface BudgetSummary {
  id: string;
  period: string;
  agent_id: string | null;
  limit_microcents: number;
  spent_microcents: number;
  pct_used: number;
  enforcement_mode: string;
  paused: boolean;
  over_warning: boolean;
  over_limit: boolean;
}

export interface BudgetConfig {
  id: string;
  period: 'daily' | 'monthly';
  limit_microcents: number;
  warning_pct: number;
  enforcement_mode: 'alert_only' | 'soft_block' | 'hard_block';
  paused: boolean;
  agent_id: string | null;
}

// ── Optimization Types ──

export interface OptimizationSuggestion {
  type: string;
  title: string;
  description: string;
  impact_monthly_cents: number;
  confidence: string;
  savings_pct?: number;
  caveat?: string;
  action_label?: string;
  is_revenue?: boolean;
  implementation?: {
    one_click: boolean;
    endpoint?: string;
    payload?: Record<string, unknown>;
  };
}

export interface OptimizationResult {
  suggestions: OptimizationSuggestion[];
  total_monthly_savings_cents: number;
  total_revenue_impact_cents?: number;
  suggestion_count: number;
  computed_at: string;
  analysis_confidence?: {
    cost_confidence: number;
    quality_confidence: number;
    display_confidence: number;
    confidence_tier: string;
  };
}

// ── Alert Types ──

export interface AlertEvent {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  agent_id?: string;
  is_read: boolean;
  created_at: string;
}

// ── Model Routing Types ──

export interface ModelRoutingExperiment {
  id: string;
  name: string;
  agent_id: string;
  control_model: string;
  treatment_model: string;
  traffic_pct: number;
  status: string;
  primary_metric: string;
  control_samples: number;
  treatment_samples: number;
  is_significant: boolean;
  winner?: string;
}

// ── Failure Prediction Types ──

export interface FailurePrediction {
  id: string;
  agent_id: string;
  prediction_type: string;
  severity: string;
  confidence: number;
  predicted_breach_at?: string;
  current_value: number;
  threshold_value: number;
  trend_direction: string;
  status: string;
  recommended_actions: Array<{
    action: string;
    impact: string;
    description: string;
  }>;
}
