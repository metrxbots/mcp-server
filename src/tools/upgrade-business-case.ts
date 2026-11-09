/**
 * Upgrade Business Case Tool
 *
 * Generates a personalized ROI analysis for upgrading to a higher tier.
 * This is the "ask for the sale" moment in the agent conversion funnel:
 * an agent that received a 402 can call this tool to build a compelling
 * business case for its human operator.
 *
 * Uses real usage data from the dashboard API to calculate projected
 * savings at the recommended tier.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { DashboardSummary, UpgradeBusinessCase } from '../types.js';
import { formatCents, formatPct } from '../services/formatters.js';
import { readStoredSavingsTotal, type StoredSavingsRead } from '../services/stored-savings.js';

/**
 * Verify list price (cents). V3 (spec R5): the legacy Lite/Pro tiers are RETIRED.
 * The paid offers are Verify (a buyable per-verdict proof — "no verdict, no
 * charge") and Platform (the primary offer, priced to the customer's managed LLM
 * spend and quoted per-prospect, so it is presented as "talk to us", never a
 * public number). Mirrors apps/web PRICING_MODEL.verify.standardCents.
 */
const VERIFY_STANDARD_CENTS = 14_900;

/** Tier call limits — for the CURRENT tier's capacity check (mirrors gateway auth.ts). */
const TIER_CALL_LIMITS: Record<string, number> = {
  starter: 10_000,
  lite: 50_000,
  pro: 100_000,
  business: Infinity,
  enterprise: Infinity,
};

/** Tier agent limits — for the CURRENT tier's capacity check (mirrors tier-gates.ts). */
const TIER_AGENT_LIMITS: Record<string, number> = {
  starter: 3,
  lite: 10,
  pro: Infinity,
  business: Infinity,
  enterprise: Infinity,
};

/** What the Platform offer unlocks (relative to the free tier). */
const PLATFORM_FEATURES: string[] = [
  'Full optimization recommendations',
  'Full revenue attribution',
  'Full P&L tracking',
  'Webhook integrations',
  'Email alerts',
  'CSV + PDF export',
  'ROI tracking',
  'Unlimited agents',
  'Full history',
];

/** Docs URL for use case guidance */
const CASE_STUDY_URLS: Record<string, string> = {
  default: 'https://docs.metrxbot.com',
};

export function registerUpgradeBusinessCaseTools(server: McpServer, client: MetrxApiClient): void {
  server.registerTool(
    'get_upgrade_business_case',
    {
      title: 'Get Upgrade Business Case',
      description:
        'Generate a personalized ROI business case for paying for Metrx. Uses real usage data to ' +
        'quantify optimization potential, then recommends Verify (a buyable per-verdict proof — no ' +
        'verdict, no charge) and Platform (priced to your managed LLM spend; talk to us). Ideal for ' +
        'agents that received a 402 and want a compelling proposal for their operator. Legacy ' +
        'Lite/Pro tiers are retired and never recommended. Returns structured data plus a report.',
      inputSchema: {
        current_tier: z.enum(['starter', 'lite', 'pro']).describe('Current subscription tier'),
        monthly_spend: z
          .number()
          .min(0)
          .optional()
          .describe('Known monthly LLM spend in cents. If omitted, fetched from dashboard data.'),
        agent_count: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of active agents. If omitted, fetched from dashboard data.'),
        primary_use_case: z
          .enum(['customer_support', 'data_processing', 'content_generation', 'code_assistant'])
          .optional()
          .describe('Primary use case for the agents (used to select relevant case study)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ current_tier, monthly_spend, agent_count, primary_use_case }) => {
      // Fetch real usage data from the dashboard
      // `/dashboard` reads `days` (it ignored the old `period_days` param and
      // fell back to its default, which happened to be 30).
      const dashResult = await client.get<DashboardSummary>('/dashboard', {
        days: 30,
      });

      if (dashResult.error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error fetching usage data: ${dashResult.error}`,
            },
          ],
          isError: true,
        };
      }

      const dashboard = dashResult.data!;
      // The stored v2 savings total every surface shows. /dashboard has no
      // `optimization` block, so the old read was always $0.00.
      const savings = await readStoredSavingsTotal(client);

      // Build the business case from real data
      const businessCase = buildBusinessCase(
        current_tier,
        dashboard,
        savings,
        monthly_spend,
        agent_count,
        primary_use_case
      );

      const report = formatBusinessCaseReport(businessCase, dashboard);

      return {
        content: [{ type: 'text' as const, text: report }],
      };
    }
  );
}

/**
 * Build an UpgradeBusinessCase from real usage data.
 */
function buildBusinessCase(
  currentTier: string,
  dashboard: DashboardSummary,
  savings: StoredSavingsRead,
  monthlySpendOverride?: number,
  agentCountOverride?: number,
  primaryUseCase?: string
): UpgradeBusinessCase {
  // V3: everyone below enterprise is pitched the same path — Verify (buyable
  // proof) then Platform (spend-indexed, talk to us). No legacy tier ladder.
  const recommendedTier = 'platform';
  const _monthlyCostCents =
    monthlySpendOverride ?? (dashboard.cost.total_cost_cents / dashboard.period_days) * 30;
  const activeAgents = agentCountOverride ?? dashboard.agents.active;

  // Identified monthly savings = the stored monthly estimate (already per
  // month; no window rescaling). null = no current estimate → every derived
  // figure is null too ("n/a"), never $0 / 0x / 365 days.
  const currentOptMonthly = savings.total_cents;

  // Net monthly savings = the identified monthly savings (Verify is a one-time
  // fee, not a monthly cost, so nothing is subtracted per month). Never negative.
  const netMonthlySavings =
    currentOptMonthly === null ? null : Math.max(0, Math.round(currentOptMonthly));

  // Savings multiple + payback framed against the one-time Verify fee (not a
  // subscription): how many times the fee the monthly savings is, and how fast
  // it recoups it.
  const roiMultiplier =
    netMonthlySavings === null || VERIFY_STANDARD_CENTS <= 0
      ? null
      : Math.round((netMonthlySavings / VERIFY_STANDARD_CENTS) * 10) / 10;
  const dailySavings = netMonthlySavings === null ? null : netMonthlySavings / 30;
  const paybackDays =
    dailySavings !== null && dailySavings > 0
      ? Math.min(365, Math.ceil(VERIFY_STANDARD_CENTS / dailySavings))
      : null;

  const caseStudyUrl = CASE_STUDY_URLS[primaryUseCase ?? 'default'] ?? CASE_STUDY_URLS['default']!;

  return {
    current_tier: currentTier,
    recommended_tier: recommendedTier,
    monthly_savings_estimate_cents: netMonthlySavings,
    roi_multiplier: roiMultiplier,
    payback_period_days: paybackDays,
    savings_unavailable_reason: savings.reason,
    features_unlocked: PLATFORM_FEATURES,
    case_study_url: caseStudyUrl,
    upgrade_url: 'https://app.metrxbot.com/settings/billing',
    usage_summary: {
      total_calls: dashboard.cost.total_calls,
      total_cost_cents: dashboard.cost.total_cost_cents,
      active_agents: activeAgents,
      error_rate: dashboard.cost.error_rate,
      optimization_potential_cents: netMonthlySavings,
    },
  };
}

/**
 * Format a structured business case report.
 */
function formatBusinessCaseReport(bc: UpgradeBusinessCase, dashboard: DashboardSummary): string {
  const lines: string[] = [];

  lines.push('## Upgrade Business Case');
  lines.push('');

  // Current situation
  lines.push('### Current Usage');
  lines.push(`**Tier**: ${bc.current_tier}`);
  lines.push(`**Active Agents**: ${bc.usage_summary.active_agents}`);
  lines.push(`**Monthly LLM Calls**: ${bc.usage_summary.total_calls.toLocaleString()}`);
  lines.push(
    `**Monthly LLM Spend**: ${formatCents(
      (bc.usage_summary.total_cost_cents / dashboard.period_days) * 30
    )}`
  );
  lines.push(`**Error Rate**: ${formatPct(bc.usage_summary.error_rate)}`);
  const savingsText =
    bc.monthly_savings_estimate_cents === null
      ? `n/a — ${bc.savings_unavailable_reason ?? 'no current savings estimate'}`
      : `${formatCents(bc.monthly_savings_estimate_cents)}/month (estimate, modeled — not measured)`;
  lines.push(`**Current Optimization Potential**: ${savingsText}`);
  lines.push('');

  // Recommendation — Verify (buyable proof) then Platform (spend-indexed, talk to us).
  lines.push('### Recommended: Prove it with Verify, then Platform');
  lines.push(
    `**Verify — ${formatCents(VERIFY_STANDARD_CENTS)} per verification**: one causal verdict on ` +
      'your own production traffic. No verdict, no charge.'
  );
  lines.push(
    '**Platform — priced to your managed LLM spend (talk to us)**: continuous optimization, ' +
      'attribution, P&L, and ROI once the proof lands.'
  );
  lines.push(`**Identified Monthly Savings**: ${savingsText}`);
  lines.push(
    `**Savings multiple**: ${
      bc.roi_multiplier === null ? 'n/a' : `${bc.roi_multiplier}x the one-time Verify fee`
    }`
  );
  lines.push(
    `**Payback Period**: ${
      bc.payback_period_days !== null && bc.payback_period_days < 365
        ? `${bc.payback_period_days} days to recoup the Verify fee`
        : 'N/A — savings depend on optimization adoption'
    }`
  );
  lines.push('');

  // Capacity check: are they hitting limits?
  const callLimit = TIER_CALL_LIMITS[bc.current_tier] ?? 10_000;
  const agentLimit = TIER_AGENT_LIMITS[bc.current_tier] ?? 3;
  const callUsagePct = callLimit < Infinity ? (bc.usage_summary.total_calls / callLimit) * 100 : 0;
  const agentUsagePct =
    agentLimit < Infinity ? (bc.usage_summary.active_agents / agentLimit) * 100 : 0;

  if (callUsagePct > 70 || agentUsagePct > 70) {
    lines.push('### ⚠️ Capacity Warning');
    if (callUsagePct > 70) {
      lines.push(
        `You're using ${Math.round(
          callUsagePct
        )}% of your ${callLimit.toLocaleString()} monthly call limit.`
      );
    }
    if (agentUsagePct > 70) {
      lines.push(
        `You're using ${
          bc.usage_summary.active_agents
        } of ${agentLimit} allowed agents (${Math.round(agentUsagePct)}%).`
      );
    }
    lines.push('');
  }

  // Features unlocked
  if (bc.features_unlocked.length > 0) {
    lines.push('### Features Unlocked');
    for (const feature of bc.features_unlocked) {
      lines.push(`- ${feature}`);
    }
    lines.push('');
  }

  // Call to action
  lines.push('### Next Steps');
  lines.push(`🔗 **Upgrade now**: ${bc.upgrade_url}`);
  lines.push(`📖 **Documentation**: ${bc.case_study_url}`);
  lines.push('');

  // Machine-readable summary for agent consumption
  lines.push('---');
  lines.push('*Machine-readable summary:*');
  lines.push(
    '```json\n' +
      JSON.stringify(
        {
          recommended_tier: bc.recommended_tier,
          monthly_savings_estimate:
            bc.monthly_savings_estimate_cents === null
              ? null
              : formatCents(bc.monthly_savings_estimate_cents),
          roi_multiplier: bc.roi_multiplier,
          payback_period_days: bc.payback_period_days,
          upgrade_url: bc.upgrade_url,
        },
        null,
        2
      ) +
      '\n```'
  );

  return lines.join('\n');
}
