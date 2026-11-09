/**
 * Response Formatters
 *
 * Converts API response data into human-readable text for MCP tool responses.
 * Uses concise, structured text that LLMs can easily parse and act on.
 */

import type {
  DashboardSummary,
  BudgetStatus,
  BudgetSummary,
  OptimizationResult,
  FleetSuggestionsResult,
  OptimizationSuggestion,
  AgentDetail,
  AlertEvent,
  FailurePrediction,
  ModelRoutingExperiment,
} from '../types.js';
import { microdollarsToDollars } from './units.js';

/** Format cents as dollar string */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format a `*_microcents` value (MICRO-DOLLARS — see services/units.ts) as a dollar string */
export function formatMicrocents(microcents: number): string {
  return `$${microdollarsToDollars(microcents).toFixed(2)}`;
}

/** Format a percentage */
export function formatPct(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format dashboard summary for LLM consumption */
export function formatDashboard(data: DashboardSummary): string {
  const lines: string[] = [
    `## Metrx Dashboard Summary (${data.period_days}-day period)`,
    '',
    `**Agents**: ${data.agents.active} active / ${data.agents.total} total`,
    `**Total LLM Calls**: ${data.cost.total_calls.toLocaleString()}`,
    `**Total Cost**: ${formatCents(data.cost.total_cost_cents)}`,
    `**Error Rate**: ${formatPct(data.cost.error_rate)}`,
  ];

  if (data.attribution) {
    const a = data.attribution;
    lines.push('');
    lines.push('### Revenue Attribution');
    lines.push(`**Attributed Outcomes**: ${a.total_outcomes}`);
    // Summary-only plans carry the count and no money: say so, never "$NaN"/$0.
    if (typeof a.total_revenue_cents === 'number') {
      lines.push(`**Attributed Revenue**: ${formatCents(a.total_revenue_cents)}`);
      if (typeof a.net_value_cents === 'number') {
        lines.push(`**Net Value**: ${formatCents(a.net_value_cents)}`);
      }
      const roi = a.roi_multiplier ?? null;
      lines.push(
        `**Attributed revenue multiple**: ${
          roi === null ? 'n/a (no attributed revenue or no cost)' : `${roi.toFixed(1)}x`
        }`
      );
    } else if (a.upgrade_hint) {
      lines.push(`*${a.upgrade_hint}*`);
    }
  }

  if (data.optimization) {
    lines.push('');
    lines.push('### Optimization Opportunities');
    lines.push(
      `**Potential Savings**: ${formatCents(data.optimization.total_savings_cents)}/month`
    );
    lines.push(`**Suggestions**: ${data.optimization.suggestion_count}`);
    if (data.optimization.top_suggestion) {
      lines.push(`**Top Suggestion**: ${data.optimization.top_suggestion}`);
    }
  }

  if (data.agents_list && data.agents_list.length > 0) {
    lines.push('');
    lines.push('### Agent Breakdown');
    for (const agent of data.agents_list) {
      const cost =
        typeof agent.monthly_cost_cents === 'number'
          ? formatCents(agent.monthly_cost_cents)
          : 'n/a';
      // The /dashboard API omits roi_multiplier on plans without full
      // attribution: absent is "not on this plan", not "no attributed revenue".
      const roi =
        typeof agent.roi_multiplier === 'number'
          ? `, ${agent.roi_multiplier.toFixed(1)}x attributed revenue multiple`
          : agent.roi_multiplier === null
            ? ', no attributed revenue'
            : '';
      lines.push(`- **${agent.name}** (${agent.status}): ${cost} in period${roi}`);
    }
  }

  return lines.join('\n');
}

/** Format optimization recommendations */
/** Savings money: null (no figure under the current definition) is "—", never $0.00. */
export function formatSavings(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '—' : formatCents(cents);
}

/** Why a stored savings row has no total (savings definition v2). */
export function staleSavingsText(reason: string | null | undefined): string {
  return reason === 'no_recent_activity'
    ? 'No activity in the last 30 days — no current savings estimate.'
    : 'Savings estimate recalculating on the next optimization run.';
}

export function formatOptimizations(result: OptimizationResult): string {
  const stale = result.status === 'stale_definition' || result.total_monthly_savings_cents === null;
  const lines: string[] = [`## Optimization Recommendations`, ''];
  if (stale) {
    lines.push(`**Total Potential Savings**: — (${staleSavingsText(result.stale_reason)})`);
    return lines.join('\n');
  }
  const spend = result.measured_window_spend_cents;
  const basis =
    typeof spend === 'number'
      ? result.savings_bound_applied
        ? ` (Estimate · capped at ${formatCents(spend)} measured spend)`
        : ` (Estimate · bounded by ${formatCents(spend)} measured spend)`
      : ' (Estimate)';
  lines.push(
    `**Total Potential Savings**: ${formatSavings(result.total_monthly_savings_cents)}/month${basis}`,
    `**Suggestions**: ${result.suggestion_count}`
  );

  if (result.analysis_confidence) {
    lines.push(
      `**Confidence**: ${result.analysis_confidence.confidence_tier} (${formatPct(
        result.analysis_confidence.display_confidence
      )})`
    );
  }

  appendSuggestionSections(lines, result.suggestions);
  return lines.join('\n');
}

function appendSuggestionSections(lines: string[], suggestions: OptimizationSuggestion[]): void {
  if (suggestions.length === 0) return;
  lines.push('');
  const costSuggestions = suggestions.filter((s) => !s.is_revenue);
  const revenueSuggestions = suggestions.filter((s) => s.is_revenue);
  if (costSuggestions.length > 0) {
    lines.push('### Cost Optimization');
    for (const s of costSuggestions) lines.push(formatSuggestion(s));
  }
  if (revenueSuggestions.length > 0) {
    lines.push('');
    lines.push('### Revenue Intelligence');
    for (const s of revenueSuggestions) lines.push(formatSuggestion(s));
  }
}

/**
 * Fleet view (GET /dashboard/suggestions). The total is the route's Σ of every
 * agent's current stored total — the same per-agent figures the fleet card
 * shows — never a re-sum of the listed (top-N) suggestions.
 */
export function formatFleetOptimizations(result: FleetSuggestionsResult): string {
  const lines: string[] = [`## Fleet Optimization Recommendations`, ''];
  const total = result.total_savings_cents ?? null;
  lines.push(
    total === null
      ? `**Total Potential Savings**: — (no agent has a current savings estimate)`
      : `**Total Potential Savings**: ${formatCents(total)}/month (Estimate, sum of each agent's spend-bounded estimate)`
  );
  const recalculating = result.recalculating_agent_count ?? 0;
  const idle = result.idle_stale_agent_count ?? 0;
  if (recalculating > 0) {
    lines.push(
      `${recalculating} agent${recalculating === 1 ? '' : 's'} recalculating — not included until the next optimization run.`
    );
  }
  if (idle > 0) {
    lines.push(
      `${idle} agent${idle === 1 ? '' : 's'} with no activity in the last 30 days — no current estimate.`
    );
  }
  if (result.tier_limited) {
    // Blurred tier: the route zeroes per-suggestion amounts as a placeholder;
    // printing them would render an unknown as $0.00.
    lines.push(
      `${result.suggestion_count ?? result.suggestions.length} suggestion(s) available; details are limited on this tier.`
    );
    return lines.join('\n');
  }
  const named = result.suggestions.map((s) =>
    s.agent_name ? { ...s, title: `[${s.agent_name}] ${s.title}` } : s
  );
  appendSuggestionSections(lines, named);
  return lines.join('\n');
}

function formatSuggestion(s: OptimizationSuggestion): string {
  const impact = s.is_revenue
    ? `+${formatCents(s.impact_monthly_cents)}/mo revenue`
    : `${formatCents(s.impact_monthly_cents)}/mo savings (Estimate)${
        s.excluded_from_total_reason
          ? ` — not counted in the total: ${s.excluded_from_total_reason}`
          : ''
      }`;

  const parts = [
    `\n**${s.title}** (${s.confidence} confidence)`,
    `Impact: ${impact}${s.savings_pct ? ` (${s.savings_pct}%)` : ''}`,
    s.description,
  ];

  if (s.caveat) {
    parts.push(`⚠️ ${s.caveat}`);
  }

  return parts.join('\n');
}

/** Format budget status */
export function formatBudgetStatus(status: BudgetStatus): string {
  if (!status.has_budgets) {
    return 'No budgets configured. Use set_budget to create spending limits for your agents.';
  }

  const lines: string[] = [
    `## Budget Status`,
    '',
    `**Total Budgets**: ${status.total_budgets}`,
    `**Warnings**: ${status.warning_count}`,
    `**Exceeded**: ${status.exceeded_count}`,
    `**Paused**: ${status.paused_count}`,
  ];

  if (status.budgets.length > 0) {
    lines.push('');
    for (const b of status.budgets) {
      lines.push(formatBudget(b));
    }
  }

  return lines.join('\n');
}

function formatBudget(b: BudgetSummary): string {
  const scope = b.agent_id ? `Agent ${b.agent_id}` : 'Org-wide';
  const status = b.over_limit
    ? '🔴 EXCEEDED'
    : b.over_warning
      ? '🟡 WARNING'
      : b.paused
        ? '⏸️ PAUSED'
        : '🟢 OK';
  const spent = formatMicrocents(b.spent_microcents);
  const limit = formatMicrocents(b.limit_microcents);

  return `- **${scope}** (${b.period}): ${spent} / ${limit} (${b.pct_used}%) ${status} [${b.enforcement_mode}]`;
}

/** Format agent detail */
export function formatAgentDetail(agent: AgentDetail): string {
  const lines: string[] = [
    `## Agent: ${agent.name}`,
    '',
    `**Key**: ${agent.agent_key}`,
    `**Category**: ${agent.category}`,
    `**Status**: ${agent.status}`,
    `**Background**: ${agent.is_background ? 'Yes' : 'No'}`,
  ];

  if (agent.primary_model) {
    lines.push(`**Primary Model**: ${agent.primary_model}`);
  }
  if (agent.framework_source) {
    lines.push(`**Framework**: ${agent.framework_source}`);
  }
  if (agent.outcome_rung) {
    lines.push(`**Outcome Rung**: ${agent.outcome_rung}`);
  }
  if (agent.failure_risk_score !== undefined && agent.failure_risk_score > 0) {
    lines.push(
      `**Failure Risk**: ${formatPct(agent.failure_risk_score)} ${
        agent.failure_risk_score > 0.7 ? '🔴' : agent.failure_risk_score > 0.3 ? '🟡' : '🟢'
      }`
    );
  }
  if (agent.secondary_categories && agent.secondary_categories.length > 0) {
    lines.push(`**Secondary Categories**: ${agent.secondary_categories.join(', ')}`);
  }
  if (agent.last_call_at) {
    lines.push(`**Last Active**: ${agent.last_call_at}`);
  }

  return lines.join('\n');
}

/** Format alerts list */
export function formatAlerts(alerts: AlertEvent[]): string {
  if (alerts.length === 0) {
    return 'No active alerts.';
  }

  const lines: string[] = [`## Active Alerts (${alerts.length})`, ''];

  for (const a of alerts) {
    const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : 'ℹ️';
    lines.push(`${icon} **${a.title}** (${a.severity})`);
    lines.push(`  ${a.message}`);
    if (a.agent_id) {
      lines.push(`  Agent: ${a.agent_id}`);
    }
    lines.push(`  Time: ${a.created_at}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format failure predictions for one agent (GET /agents/{id}/optimization/predictions) */
export function formatPredictions(
  predictions: FailurePrediction[],
  context?: { agent_id?: string; event_count?: number; computed_at?: string }
): string {
  const header: string[] = [];
  if (context?.agent_id) header.push(`Agent: ${context.agent_id}`);
  if (context?.event_count !== undefined) {
    header.push(`Calls analyzed (last 7 days): ${context.event_count}`);
  }
  if (context?.computed_at) header.push(`Computed: ${context.computed_at}`);

  if (predictions.length === 0) {
    const lines = ['No failure predictions for this agent.', ...header];
    if (context?.event_count !== undefined && context.event_count < 20) {
      lines.push(
        'Predictions need at least 20 calls in the last 7 days, so an empty result here means ' +
          'too little data, not a clean bill of health.'
      );
    }
    return lines.join('\n');
  }

  const lines: string[] = [`## Failure Predictions (${predictions.length})`, ...header, ''];

  for (const p of predictions) {
    const icon = p.severity === 'critical' ? '🔴' : p.severity === 'warning' ? '🟡' : 'ℹ️';
    lines.push(
      `${icon} **${p.prediction_type}** — ${p.severity} (${formatPct(p.confidence)} confidence, ` +
        `${p.prediction_horizon_hours}h horizon)`
    );
    lines.push(
      `  Current: ${p.current_value.toFixed(2)} → Threshold: ${p.threshold_value.toFixed(2)} (${
        p.trend_direction
      })`
    );
    if (p.predicted_breach_at) {
      lines.push(`  Predicted breach: ${p.predicted_breach_at}`);
    }
    if (p.contributing_factors && p.contributing_factors.length > 0) {
      lines.push('  Contributing factors:');
      for (const f of p.contributing_factors) {
        lines.push(`    - ${f.factor}: ${f.description}`);
      }
    }
    if (p.recommended_actions.length > 0) {
      lines.push('  Recommended actions:');
      for (const action of p.recommended_actions) {
        lines.push(`    - ${action.action}: ${action.description}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Format one model_routing_experiments row */
export function formatExperiment(exp: ModelRoutingExperiment): string {
  const lines: string[] = [
    `## Experiment: ${exp.name}`,
    '',
    `**ID**: ${exp.id}`,
    `**Status**: ${exp.status}`,
    `**Control**: ${exp.control_model} (${exp.control_samples ?? 0} samples)`,
    `**Treatment**: ${exp.treatment_model} (${exp.treatment_samples ?? 0} samples)`,
    `**Traffic Split**: ${exp.traffic_pct}% to treatment`,
    `**Primary Metric**: ${exp.primary_metric}`,
    `**Significant**: ${exp.is_significant ? 'Yes' : 'Not yet'}${
      typeof exp.p_value === 'number' ? ` (p = ${exp.p_value.toFixed(4)})` : ''
    }`,
  ];

  if (exp.winner) {
    lines.push(`**Winner**: ${exp.winner}`);
  }
  if (exp.started_at) lines.push(`**Started**: ${exp.started_at}`);
  if (exp.completed_at) lines.push(`**Completed**: ${exp.completed_at}`);

  return lines.join('\n');
}
