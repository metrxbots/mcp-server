/**
 * Upgrade Justification Tools
 *
 * Tools for generating ROI reports explaining why tier upgrades
 * from Free to Lite/Pro make sense based on current usage patterns.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { DashboardSummary } from '../types.js';
import { formatCents, formatPct } from '../services/formatters.js';

export function registerUpgradeJustificationTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_upgrade_justification ──
  server.registerTool(
    'get_upgrade_justification',
    {
      title: 'Get Upgrade Justification',
      description:
        'Generate an ROI report explaining why an upgrade from Free to Lite/Pro tier makes sense. ' +
        'Analyzes current usage patterns, calculates optimization potential at higher tiers, ' +
        'and provides a structured upgrade recommendation with projected monthly savings. ' +
        'Do NOT use if already on Lite or Pro tier — not relevant for paid users.',
      inputSchema: {
        period_days: z
          .number()
          .int()
          .min(7)
          .max(90)
          .default(30)
          .describe('Number of days to analyze for upgrade justification (default: 30)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ period_days }) => {
      // Get dashboard summary for the period
      const result = await client.get<DashboardSummary>('/dashboard', {
        period_days: period_days ?? 30,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching upgrade data: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      const text = formatUpgradeJustification(data, period_days ?? 30);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

/**
 * Format upgrade justification report.
 * Calculates tier-based potential and ROI.
 */
function formatUpgradeJustification(summary: DashboardSummary, periodDays: number): string {
  const lines: string[] = ['## Upgrade Justification Report', ''];

  // Current tier (assumed Free if no optimization data)
  lines.push('### Current Status');
  lines.push(`**Analysis Period**: Last ${periodDays} days`);
  lines.push(`**Current Tier**: Free`);
  lines.push(`**Active Agents**: ${summary.agents.active} / ${summary.agents.total}`);
  lines.push(`**Total LLM Calls**: ${summary.cost.total_calls.toLocaleString()}`);
  lines.push(`**Current Monthly Cost**: ${formatCents(summary.cost.total_cost_cents)}`);
  lines.push(`**Error Rate**: ${formatPct(summary.cost.error_rate)}`);
  lines.push('');

  // Optimization potential (available in Free tier but limited)
  const currentSavings = summary.optimization?.total_savings_cents || 0;
  const currentSavingsMontly = (currentSavings / periodDays) * 30;

  lines.push('### Optimization Potential');
  lines.push(
    `**Available Optimizations**: ${summary.optimization?.suggestion_count || 0} suggestions`
  );
  lines.push(
    `**Identified Monthly Savings**: ${formatCents(currentSavingsMontly)} (without upgrade)`
  );
  lines.push('');

  // Tier comparison and upgrade benefits
  lines.push('### Upgrade Benefits (Lite Tier)');
  lines.push('The Lite tier includes:');
  lines.push('- Advanced optimization recommendations (10x more suggestions)');
  lines.push('- Real-time failure prediction');
  lines.push('- Model routing experiments');
  lines.push('- Revenue attribution (if enabled)');
  lines.push('- Priority API rate limits (300 req/min vs 30)');
  lines.push('');

  // Calculate projected ROI
  const monthlyCost = (summary.cost.total_cost_cents / periodDays) * 30;
  const liteTierPrice = 29900; // $299/month in cents
  const upgratedSavings = currentSavingsMontly * 1.5; // Estimate 50% more optimization with Lite

  lines.push('### ROI Projection');
  lines.push(`**Projected Monthly LLM Cost**: ${formatCents(monthlyCost)}`);
  lines.push(`**Lite Tier Subscription**: ${formatCents(liteTierPrice)}`);
  lines.push(`**Additional Savings with Lite**: ${formatCents(upgratedSavings)}`);
  lines.push('');

  const netBenefit = upgratedSavings - (liteTierPrice - (currentSavingsMontly / 100) * 100000); // simplified calculation
  const breakEven =
    netBenefit > 0
      ? 'Upgrade pays for itself immediately'
      : `Breakeven in ${Math.ceil((liteTierPrice / upgratedSavings) * 30)} days`;

  lines.push('### Recommendation');
  if (summary.cost.total_calls > 100000) {
    lines.push(
      `🟢 **Strongly Recommended**: Your volume (${summary.cost.total_calls.toLocaleString()} calls) qualifies for Lite tier.`
    );
    lines.push(`${breakEven}`);
    if (summary.optimization && summary.optimization.suggestion_count > 5) {
      lines.push(
        `You have ${summary.optimization.suggestion_count} active optimization opportunities that Lite tier can fully leverage.`
      );
    }
  } else if (summary.cost.total_calls > 50000) {
    lines.push(`🟡 **Consider Lite**: Your volume is growing and you have optimization potential.`);
    lines.push(
      'Upgrade once you hit 100k calls/month or if you need real-time failure prediction.'
    );
  } else {
    lines.push(`⚠️ **Not Yet Recommended**: Free tier is sufficient for your current volume.`);
    lines.push('Revisit this when you reach 50,000+ calls per month.');
  }

  lines.push('');
  lines.push('---');
  lines.push(
    '*Run `get_cost_summary` periodically to track growth and identify when upgrade becomes beneficial.*'
  );

  return lines.join('\n');
}
