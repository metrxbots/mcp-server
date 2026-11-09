/**
 * Upgrade Justification Tools
 *
 * Generates an ROI report explaining why paying for Metrx makes sense based on
 * current usage. V3 (spec R5): the legacy Lite/Pro tiers are RETIRED — the paid
 * offers are Verify (a buyable per-verdict wedge: "no verdict, no charge") and
 * Platform (the primary offer, priced to the customer's managed LLM spend and
 * quoted per-prospect, so it is presented as "talk to us", never a public band
 * number). This report retargets accordingly and quotes no retired prices.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import type { DashboardSummary } from '../types.js';
import { formatCents, formatPct } from '../services/formatters.js';
import { readStoredSavingsTotal, type StoredSavingsRead } from '../services/stored-savings.js';

/** Verify list price (cents). Mirrors apps/web pricing-model PRICING_MODEL.verify.standardCents. */
const VERIFY_STANDARD_CENTS = 14_900;

export function registerUpgradeJustificationTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_upgrade_justification ──
  server.registerTool(
    'get_upgrade_justification',
    {
      title: 'Get Upgrade Justification',
      description:
        'Generate an ROI report explaining why paying for Metrx makes sense based on current usage. ' +
        'Analyzes usage and optimization potential, then recommends Verify (a buyable per-verdict ' +
        'proof — no verdict, no charge) and Platform (priced to your managed LLM spend; talk to us). ' +
        'Legacy Lite/Pro tiers are retired and never recommended.',
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
        days: period_days ?? 30,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching upgrade data: ${result.error}` }],
          isError: true,
        };
      }

      const data = result.data!;
      // The savings figure every other surface shows (stored v2 total), not a
      // field /dashboard never returned.
      const savings = await readStoredSavingsTotal(client);
      const text = formatUpgradeJustification(data, data.period_days ?? period_days ?? 30, savings);

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
function formatUpgradeJustification(
  summary: DashboardSummary,
  periodDays: number,
  savings: StoredSavingsRead
): string {
  const lines: string[] = ['## Upgrade Justification Report', ''];

  // Current tier (assumed Free if no optimization data)
  lines.push('### Current Status');
  lines.push(`**Analysis Period**: Last ${periodDays} days`);
  lines.push(`**Current Tier**: Starter (Free)`);
  lines.push(`**Active Agents**: ${summary.agents.active} / ${summary.agents.total}`);
  lines.push(`**Total LLM Calls**: ${summary.cost.total_calls.toLocaleString()}`);
  lines.push(
    `**LLM Cost (last ${periodDays} days)**: ${formatCents(summary.cost.total_cost_cents)}`
  );
  lines.push(`**Error Rate**: ${formatPct(summary.cost.error_rate)}`);
  lines.push('');

  // Optimization potential: the stored monthly estimate (already per month —
  // no window rescaling). Unknown is said as unknown, never $0.00.
  const savingsText =
    savings.total_cents === null
      ? `not available — ${savings.reason}`
      : `${formatCents(savings.total_cents)}/month (estimate, modeled — not measured)`;

  lines.push('### Optimization Potential');
  lines.push(
    `**Available Optimizations**: ${
      savings.suggestion_count === null ? 'n/a' : `${savings.suggestion_count} suggestions`
    }`
  );
  lines.push(`**Identified Monthly Savings**: ${savingsText}`);
  lines.push('');

  // V3 paid offers (legacy Lite/Pro retired — spec R5).
  lines.push('### How Metrx is priced');
  lines.push('');
  lines.push(`**Verify — ${formatCents(VERIFY_STANDARD_CENTS)} per verification (buyable now):**`);
  lines.push('- One causal verdict on your own production traffic.');
  lines.push('- No verdict, no charge — a safe programmatic bet.');
  lines.push('- The front door: prove the savings are real before you commit to more.');
  lines.push('');
  lines.push('**Platform — priced to your managed LLM spend (talk to us):**');
  lines.push('- A monthly platform fee, indexed to what you spend on LLMs.');
  lines.push('- Full optimization, attribution, P&L, ROI tracking, alerts, and history.');
  lines.push('- Your price is quoted from your own spend — reach out for your number.');
  lines.push('');

  // Frame the opportunity against real optimization potential (no fixed tier price
  // to compare to — Platform is spend-indexed and quoted per customer).
  const monthlyCost = (summary.cost.total_cost_cents / periodDays) * 30;

  lines.push('### The opportunity');
  lines.push(`**Projected Monthly LLM Cost**: ${formatCents(monthlyCost)}`);
  lines.push(`**Identified Monthly Savings**: ${savingsText}`);
  lines.push(
    '**Verify cost to prove it**: ' +
      `${formatCents(VERIFY_STANDARD_CENTS)} — refunded if we can't produce a verdict.`
  );
  lines.push('');

  lines.push('### Recommendation');
  if (summary.cost.total_calls > 100000) {
    lines.push(
      `🟢 **Strongly Recommended**: at your volume (${summary.cost.total_calls.toLocaleString()} calls) ` +
        'buy a Verify verdict to prove the savings, then talk to us about Platform.'
    );
    if (savings.suggestion_count !== null && savings.suggestion_count > 5) {
      lines.push(
        `You have ${savings.suggestion_count} active optimization opportunities Platform can capture continuously.`
      );
    }
  } else if (summary.cost.total_calls > 50000) {
    lines.push(
      `🟡 **Consider Verify**: your volume is growing and you have optimization potential — ` +
        'a single verdict is the low-risk way to prove it.'
    );
  } else {
    lines.push(`⚠️ **Not Yet**: the free tier is sufficient for your current volume.`);
    lines.push('Revisit — or buy one Verify verdict — when you reach 50,000+ calls per month.');
  }

  lines.push('');
  lines.push('---');
  lines.push(
    '*Run `get_cost_summary` periodically to track growth and identify when Verify/Platform pays off.*'
  );

  return lines.join('\n');
}
