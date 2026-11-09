/**
 * MCP Server Type Definitions
 *
 * Internal types for the Metrx MCP server.
 * These mirror the API response shapes for type safety.
 */

// ── API Response Wrappers ──

import type { DeskProblem } from './errors.js';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  /** HTTP status of a non-OK response (absent on success and on network errors). */
  status?: number;
  is_preview?: boolean;
  /** The desk error-table class behind `error`, when the route answered one (plan §2). */
  problem?: DeskProblem;
}

// ── Measured-value envelope (N-5 D-6) ──

/**
 * Structural twin of `MeasuredValue` in @metrx/types (packages/types/src/index.ts).
 * This package deliberately carries no @metrx/types dependency (it ships to npm
 * standalone), so the shape is mirrored here; keep the two in sync.
 *
 * Rules: CIs only when the source payload genuinely carries one (never
 * fabricated); raw counts use method 'count' with null CIs; `method` names the
 * source computation; `data_through` is the window end the value covers.
 */
export interface MeasuredValue {
  value: number | null;
  ci_low: number | null;
  ci_high: number | null;
  method: string;
  data_through: string | null;
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
  /** Window LLM cost (cents). null = the P&L read failed ("—"), never 0. */
  monthly_cost_cents?: number | null;
  /**
   * Attributed revenue ÷ cost (x). null when either is 0. Like net_profit_cents,
   * present only when the plan shows full attribution (/dashboard agents_list).
   */
  roi_multiplier?: number | null;
  net_profit_cents?: number | null;
  total_calls?: number | null;
  /** Present only when the plan shows full attribution (/dashboard agents_list). */
  attributed_revenue_cents?: number | null;
  attributed_outcome_count?: number | null;
  /** Outcome-weighted primary-link confidence (0–1); null = no attributed outcomes. */
  avg_attribution_confidence?: number | null;
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
  /**
   * Full attribution (Pro+): every field. Summary-only (Lite): `total_outcomes`
   * and an upgrade hint, no money. Starter: null.
   */
  attribution?: {
    total_outcomes: number;
    total_revenue_cents?: number;
    net_value_cents?: number;
    /** Attributed revenue ÷ cost (x); null when either is 0. */
    roi_multiplier?: number | null;
    roi?: number | null;
    /** Outcome-weighted primary-link confidence (0–1); null = none. */
    attribution_confidence?: number | null;
    upgrade_hint?: string;
  } | null;
  /**
   * NOT returned by GET /dashboard (only the demo client sets it). Live savings
   * are read from GET /dashboard/suggestions `total_savings_cents`.
   */
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
  /** Model slice a switch prices (savings definition v2). */
  source_model?: string;
  /** Set when a suggestion is shown but does not count toward the total. */
  excluded_from_total_reason?: string;
  /** Fleet view: the agent the suggestion belongs to. */
  agent_name?: string;
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
  /**
   * Savings definition v2: the engine's per-slice, spend-capped Estimate. null
   * = no total under the current definition (stale row) — never render as $0.
   */
  total_monthly_savings_cents: number | null;
  /** 'current' | 'stale_definition' (row written under an older definition). */
  status?: string;
  stale_reason?: 'recalculating' | 'no_recent_activity' | null;
  /** Measured 30-day spend the total was capped at. */
  measured_window_spend_cents?: number | null;
  savings_bound_applied?: boolean | null;
  suggestion_count: number;
  computed_at: string;
  analysis_confidence?: {
    cost_confidence: number;
    quality_confidence: number;
    display_confidence: number;
    confidence_tier: string;
  };
}

/** GET /dashboard/suggestions — fleet-wide view over every agent's stored row. */
export interface FleetSuggestionsResult {
  status?: string;
  message?: string;
  suggestions: OptimizationSuggestion[];
  /** Σ of every agent's current stored total; null = none current. */
  total_savings_cents?: number | null;
  recalculating_agent_count?: number;
  idle_stale_agent_count?: number;
  tier_limited?: boolean;
  suggestion_count?: number;
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
  /** Row of model_routing_experiments (supabase/migrations/025). */
  id: string;
  name: string;
  description?: string | null;
  agent_id: string;
  control_model: string;
  treatment_model: string;
  traffic_pct: number;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled' | string;
  primary_metric: string;
  control_samples: number;
  treatment_samples: number;
  is_significant: boolean | null;
  p_value?: number | null;
  effect_size?: number | null;
  winner?: 'control' | 'treatment' | 'inconclusive' | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
}

// ── Failure Prediction Types ──

/**
 * One PredictionResult from GET /api/agents/{id}/optimization/predictions
 * (packages/optimization/src/analyzers/predictive-failure.ts). Computed on
 * request from the last 7/30 days of llm_events — not a stored row, so there
 * is no id or status.
 */
export interface FailurePrediction {
  prediction_type: string;
  severity: 'info' | 'warning' | 'critical' | string;
  confidence: number;
  predicted_breach_at?: string;
  prediction_horizon_hours: number;
  current_value: number;
  threshold_value: number;
  trend_direction: 'rising' | 'falling' | 'stable' | string;
  trend_velocity?: number;
  contributing_factors?: Array<{ factor: string; weight: number; description: string }>;
  recommended_actions: Array<{
    action: string;
    impact: string;
    effort?: string;
    description: string;
  }>;
}

/** `data` of GET /api/agents/{id}/optimization/predictions. */
export interface AgentPredictionsResponse {
  agent_id: string;
  predictions: FailurePrediction[];
  computed_at: string;
  event_count: number;
}

// ── Upgrade Business Case Types ──

export interface UpgradeBusinessCase {
  current_tier: string;
  recommended_tier: string;
  /** The org's stored monthly savings estimate; null = none current (never $0). */
  monthly_savings_estimate_cents: number | null;
  /** Monthly savings ÷ the one-time Verify fee (x); null when savings unknown. */
  roi_multiplier: number | null;
  /** Days of savings to recoup the Verify fee; null when savings unknown or 0. */
  payback_period_days: number | null;
  /** Why the savings figure is missing, when it is. */
  savings_unavailable_reason?: string | null;
  features_unlocked: string[];
  case_study_url: string;
  upgrade_url: string;
  usage_summary: {
    total_calls: number;
    total_cost_cents: number;
    active_agents: number;
    error_rate: number;
    optimization_potential_cents: number | null;
  };
}
