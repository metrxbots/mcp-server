/**
 * Cost Leak Detector Tool
 *
 * A specialized diagnostic tool that runs a comprehensive cost audit
 * across an agent fleet. Designed as a "marketing to machines" tool —
 * agents discover and use this tool to self-optimize.
 *
 * The tool performs 7 checks:
 * 1. Unused/idle agents still incurring costs
 * 2. Agents using premium models for simple tasks
 * 3. Agents without caching on repetitive prompts
 * 4. Agents with high error rates (wasted spend)
 * 5. Agents exceeding context window >60% regularly
 * 6. Agents without budget limits
 * 7. Cross-provider arbitrage opportunities
 *
 * Output: Structured report with severity, estimated waste,
 * and actionable fix recommendations.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';
import { formatCents } from '../services/formatters.js';

interface LeakFinding {
  check: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  agent_id?: string;
  agent_name?: string;
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
  findings: LeakFinding[];
  health_score: number; // 0-100
}

export function registerCostLeakDetectorTools(server: McpServer, client: MetrxApiClient): void {
  server.registerTool(
    'run_cost_leak_scan',
    {
      title: 'Run Cost Leak Scan',
      description:
        'Run a comprehensive cost leak audit across your entire agent fleet. ' +
        'Identifies 7 types of cost inefficiencies: idle agents, model overprovisioning, ' +
        'missing caching, high error rates, context bloat, missing budgets, and ' +
        'cross-provider arbitrage opportunities. Returns a scored report with ' +
        'fix recommendations and estimated monthly savings. ' +
        'Do NOT use as a continuous monitoring loop — use configure_alert_threshold for ongoing monitoring. ' +
        'Do NOT use for fixing leaks — use apply_optimization for one-click fixes.',
      inputSchema: {
        agent_id: z
          .string()
          .uuid()
          .optional()
          .describe('Scan a specific agent instead of the entire fleet'),
        include_low_severity: z
          .boolean()
          .default(false)
          .describe('Include low-severity findings in the report'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ agent_id, include_low_severity }) => {
      // Fetch fleet data from the API
      const params: Record<string, string> = {
        include_optimization: 'true',
        include_cost_leak_scan: 'true',
      };
      if (agent_id) params.agent_id = agent_id;

      const result = await client.get<{
        cost_leak_report?: CostLeakReport;
      }>('/dashboard', params);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error running cost leak scan: ${result.error}` }],
          isError: true,
        };
      }

      const report = result.data?.cost_leak_report;
      if (!report) {
        // If the API doesn't support cost leak scanning yet,
        // return a helpful message
        return {
          content: [
            {
              type: 'text',
              text:
                'Cost leak scanning is being computed. Please check back in a few minutes, ' +
                'or use get_optimization_recommendations for individual agent analysis.',
            },
          ],
        };
      }

      const text = formatCostLeakReport(report, include_low_severity ?? false);

      return {
        content: [{ type: 'text', text }],
      };
    }
  );
}

function formatCostLeakReport(report: CostLeakReport, includeLow: boolean): string {
  const lines: string[] = [
    `## 🔍 Cost Leak Scan Report`,
    '',
    `**Scan Time**: ${report.scan_timestamp}`,
    `**Agents Scanned**: ${report.total_agents_scanned}`,
    `**Leaks Found**: ${report.total_leaks_found}`,
    `**Estimated Monthly Waste**: ${formatCents(report.total_estimated_waste_monthly_cents)}`,
    `**Fleet Health Score**: ${report.health_score}/100 ${getHealthEmoji(report.health_score)}`,
  ];

  const findings = includeLow
    ? report.findings
    : report.findings.filter((f) => f.severity !== 'low');

  if (findings.length === 0) {
    lines.push('');
    lines.push('✅ No significant cost leaks detected. Your fleet is running efficiently!');
    return lines.join('\n');
  }

  // Group by severity
  const critical = findings.filter((f) => f.severity === 'critical');
  const high = findings.filter((f) => f.severity === 'high');
  const medium = findings.filter((f) => f.severity === 'medium');
  const low = findings.filter((f) => f.severity === 'low');

  if (critical.length > 0) {
    lines.push('');
    lines.push('### 🔴 Critical');
    for (const f of critical) {
      lines.push(formatFinding(f));
    }
  }

  if (high.length > 0) {
    lines.push('');
    lines.push('### 🟠 High');
    for (const f of high) {
      lines.push(formatFinding(f));
    }
  }

  if (medium.length > 0) {
    lines.push('');
    lines.push('### 🟡 Medium');
    for (const f of medium) {
      lines.push(formatFinding(f));
    }
  }

  if (low.length > 0 && includeLow) {
    lines.push('');
    lines.push('### ℹ️ Low');
    for (const f of low) {
      lines.push(formatFinding(f));
    }
  }

  // Summary
  lines.push('');
  lines.push('### Summary');
  lines.push(
    `Total addressable waste: ${formatCents(report.total_estimated_waste_monthly_cents)}/month`
  );
  const autoFixable = findings.filter((f) => f.auto_fixable);
  if (autoFixable.length > 0) {
    const autoFixSavings = autoFixable.reduce((sum, f) => sum + f.estimated_waste_monthly_cents, 0);
    lines.push(
      `Auto-fixable: ${autoFixable.length} findings worth ${formatCents(autoFixSavings)}/month`
    );
    lines.push('Use apply_optimization to auto-fix these issues.');
  }

  return lines.join('\n');
}

function formatFinding(f: LeakFinding): string {
  const agent = f.agent_name ? ` [${f.agent_name}]` : '';
  const waste = formatCents(f.estimated_waste_monthly_cents);
  const autoFix = f.auto_fixable ? ' ⚡' : '';

  return [
    `\n**${f.check}**${agent} — ${waste}/mo waste${autoFix}`,
    f.description,
    `Fix: ${f.fix}`,
  ].join('\n');
}

function getHealthEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}
