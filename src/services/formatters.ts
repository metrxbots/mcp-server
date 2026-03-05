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
  OptimizationSuggestion,
  AgentDetail,
  AlertEvent,
  FailurePrediction,
  ModelRoutingExperiment,
} from '../types.js';

/** Format cents as dollar string */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format microcents as dollar string */
export function formatMicrocents(microcents: number): string {
  return `$${(microcents / 100_000_000).toFixed(2)}`;
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
    lines.push('');
    lines.push('### Revenue Attribution');
    lines.push(`**Outcomes**: ${data.attribution.total_outcomes}`);
    lines.push(`**Revenue**: ${formatCents(data.attribution.total_revenue_cents)}`);
    lines.push(`**Net Value**: ${formatCents(data.attribution.net_value_cents)}`);
    lines.push(`**ROI**: ${data.attribution.roi_multiplier.toFixed(1)}x`);
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
      const cost = agent.monthly_cost_cents ? formatCents(agent.monthly_cost_cents) : 'N/A';
      const roi = agent.roi_multiplier ? `${agent.roi_multiplier.toFixed(1)}x ROI` : 'no ROI data';
      lines.push(`- **${agent.name}** (${agent.status}): ${cost}/mo, ${roi}`);
    }
  }

  return lines.join('\n');
}

/** Format optimization recommendations */
export function formatOptimizations(result: OptimizationResult): string {
  const lines: string[] = [
    `## Optimization Recommendations`,
    '',
    `**Total Potential Savings**: ${formatCents(result.total_monthly_savings_cents)}/month`,
    `**Suggestions**: ${result.suggestion_count}`,
  ];

  if (result.total_revenue_impact_cents) {
    lines.push(`**Revenue Impact**: ${formatCents(result.total_revenue_impact_cents)}/month`);
  }

  if (result.analysis_confidence) {
    lines.push(
      `**Confidence**: ${result.analysis_confidence.confidence_tier} (${formatPct(
        result.analysis_confidence.display_confidence
      )})`
    );
  }

  if (result.suggestions.length > 0) {
    lines.push('');

    // Separate cost and revenue suggestions
    const costSuggestions = result.suggestions.filter((s) => !s.is_revenue);
    const revenueSuggestions = result.suggestions.filter((s) => s.is_revenue);

    if (costSuggestions.length > 0) {
      lines.push('### Cost Optimization');
      for (const s of costSuggestions) {
        lines.push(formatSuggestion(s));
      }
    }

    if (revenueSuggestions.length > 0) {
      lines.push('');
      lines.push('### Revenue Intelligence');
      for (const s of revenueSuggestions) {
        lines.push(formatSuggestion(s));
      }
    }
  }

  return lines.join('\n');
}

function formatSuggestion(s: OptimizationSuggestion): string {
  const impact = s.is_revenue
    ? `+${formatCents(s.impact_monthly_cents)}/mo revenue`
    : `${formatCents(s.impact_monthly_cents)}/mo savings`;

  const parts = [
    `\n**${s.title}** (${s.confidence} confidence)`,
    `Impact: ${impact}${s.savings_pct ? ` (${s.savings_pct}%)` : ''}`,
    s.description,
  ];

  if (s.caveat) {
    parts.push(`⚠️ ${s.caveat}`);
  }

  if (s.implementation?.one_click) {
    parts.push(`✅ One-click apply available`);
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

/** Format failure predictions */
export function formatPredictions(predictions: FailurePrediction[]): string {
  if (predictions.length === 0) {
    return 'No active failure predictions. All agents are healthy.';
  }

  const lines: string[] = [`## Failure Predictions (${predictions.length})`, ''];

  for (const p of predictions) {
    const icon = p.severity === 'critical' ? '🔴' : p.severity === 'warning' ? '🟡' : 'ℹ️';
    lines.push(
      `${icon} **${p.prediction_type}** — ${p.severity} (${formatPct(p.confidence)} confidence)`
    );
    lines.push(`  Agent: ${p.agent_id}`);
    lines.push(
      `  Current: ${p.current_value.toFixed(2)} → Threshold: ${p.threshold_value.toFixed(2)} (${
        p.trend_direction
      })`
    );
    if (p.predicted_breach_at) {
      lines.push(`  Predicted breach: ${p.predicted_breach_at}`);
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

/** Format model routing experiment */
export function formatExperiment(exp: ModelRoutingExperiment): string {
  const lines: string[] = [
    `## Experiment: ${exp.name}`,
    '',
    `**Status**: ${exp.status}`,
    `**Control**: ${exp.control_model} (${exp.control_samples} samples)`,
    `**Treatment**: ${exp.treatment_model} (${exp.treatment_samples} samples)`,
    `**Traffic Split**: ${exp.traffic_pct}% to treatment`,
    `**Primary Metric**: ${exp.primary_metric}`,
    `**Significant**: ${exp.is_significant ? 'Yes' : 'Not yet'}`,
  ];

  if (exp.winner) {
    lines.push(`**Winner**: ${exp.winner}`);
  }

  return lines.join('\n');
}
