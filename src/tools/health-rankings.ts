/**
 * Health Score & Rankings MCP Tools
 *
 * Two read-only tools for autonomous agent customers:
 * - metrx_get_health_scores — all agents with scores, grades, data completeness
 * - metrx_get_rankings — agents ranked by health score (GET /api/v1/agents/rankings)
 *
 * get_rankings called GET /api/agents/rankings until W1-4b, which the
 * agents/[id] route captured with id='rankings' and answered 404. The real
 * route is /api/v1/agents/rankings; for an API-key caller it returns a FLAT
 * array (no fleet meta, no rank/percentile fields) with composite_score on a
 * 0-1 scale, live-computed from agent_metrics_daily when no stored score exists.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MetrxApiClient } from '../services/api-client.js';

interface AgentHealthScore {
  id: string;
  name: string;
  category: string;
  health_score: number | null;
  health_grade: string | null;
  health_score_updated_at: string | null;
  status: string;
}

/** One item of the API-key branch of GET /api/v1/agents/rankings (AdapterAgentRanking). */
interface RankingEntry {
  agent_id: string;
  agent_key: string;
  agent_name: string;
  org_id: string;
  health_grade: string;
  /** 0-1 (two decimals), NOT 0-100. */
  composite_score: number;
  /** 0-1 share of score inputs with data (1 for a stored score; 0 = no data at all). */
  data_completeness: number;
  is_stale: boolean;
  last_updated: string | null;
}

export function registerHealthRankingsTools(server: McpServer, client: MetrxApiClient): void {
  // ── get_health_scores ──
  server.registerTool(
    'get_health_scores',
    {
      title: 'Get Agent Health Scores',
      description:
        'Returns health score, grade, and data completeness for all agents in the organization. ' +
        'Health scores are composite 0-100 scores blending cost efficiency, ROI, error rate, ' +
        'quality drift, failure risk, and latency. Grades: A (80-100), B (60-79), C (40-59), ' +
        'D (20-39), F (0-19). Use this to get a fleet-wide health overview.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await client.get<{ data: AgentHealthScore[] }>('/agents', {
        include_metrics: true,
      });

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching health scores: ${result.error}` }],
          isError: true,
        };
      }

      const agents = result.data?.data || [];
      if (agents.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No agents found. Register agents by sending LLM events with an agent_key.',
            },
          ],
        };
      }

      const withScores = agents.filter((a) => a.health_score != null);
      const withoutScores = agents.filter((a) => a.health_score == null);

      const lines: string[] = [
        `# Agent Health Scores (${agents.length} agents)`,
        '',
        `Scored: ${withScores.length} | Pending: ${withoutScores.length}`,
        '',
      ];

      if (withScores.length > 0) {
        lines.push('| Agent | Grade | Score | Category | Status |');
        lines.push('|-------|-------|-------|----------|--------|');
        for (const a of withScores.sort((x, y) => (y.health_score ?? 0) - (x.health_score ?? 0))) {
          lines.push(
            `| ${a.name} | ${a.health_grade ?? '-'} | ${a.health_score?.toFixed(0) ?? '-'} | ${a.category} | ${a.status} |`
          );
        }
      }

      if (withoutScores.length > 0) {
        lines.push('', '**Agents without health scores:**');
        for (const a of withoutScores) {
          lines.push(`- ${a.name} (${a.category}, ${a.status})`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // ── get_rankings ──
  server.registerTool(
    'get_rankings',
    {
      title: 'Get Agent Rankings',
      description:
        'Returns agents ranked by health score, best first. Each row has the agent key and name, ' +
        'grade (A-F), composite score on a 0-1 scale (a stored score when one exists, otherwise ' +
        'computed live from the last 30 days of metrics), data completeness (share of score inputs ' +
        'that had data; 0 = no data at all) and a stale flag ' +
        '(no call in the last 48 hours). Fleet averages are computed here from the returned rows. ' +
        'Use this to identify top and bottom performers.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Maximum number of agents to show (default: 20)'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      const result = await client.get<RankingEntry[]>('/v1/agents/rankings');

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Error fetching rankings: ${result.error}` }],
          isError: true,
        };
      }

      const rankings = Array.isArray(result.data) ? result.data : [];

      if (rankings.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No agents to rank. Register agents by sending LLM events with an agent_key.',
            },
          ],
        };
      }

      const maxResults = limit ?? 20;
      const displayed = rankings.slice(0, maxResults);
      const withData = rankings.filter((r) => r.data_completeness > 0);
      const avg =
        withData.length > 0
          ? withData.reduce((sum, r) => sum + r.composite_score, 0) / withData.length
          : null;

      const lines: string[] = [
        '# Agent Rankings',
        '',
        `Fleet: ${rankings.length} agents | With data: ${withData.length} | ` +
          `Avg score (agents with data): ${avg === null ? '-' : avg.toFixed(2)}`,
        '',
        '| Rank | Agent | Key | Grade | Score (0-1) | Data | Stale? |',
        '|------|-------|-----|-------|-------------|------|--------|',
      ];

      displayed.forEach((r, i) => {
        const data =
          r.data_completeness > 0 ? `${(r.data_completeness * 100).toFixed(0)}%` : 'none';
        lines.push(
          `| #${i + 1} | ${r.agent_name} | ${r.agent_key} | ${r.health_grade} | ${r.composite_score.toFixed(2)} | ${data} | ${r.is_stale ? '⚠️' : '✓'} |`
        );
      });

      if (rankings.length > maxResults) {
        lines.push('', `_Showing ${maxResults} of ${rankings.length} agents._`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );
}
