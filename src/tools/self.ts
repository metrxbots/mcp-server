/**
 * Self Tool: what Metrx holds about the person asking, and who opened their page.
 *
 * One tool over two session-only routes:
 *   - get_my_access → GET /me                (who you are: role, workspace kind, teams)
 *                   + GET /me/notices?limit  (who opened your page, when, from where, why)
 *
 * OAUTH-ONLY. Both routes refuse API keys (403 api_key_refused): the answer is
 * about a person, and a key is not one. The registry declares this in
 * MCP_OAUTH_ONLY_TOOLS (tool-registry-facts.ts) and the server factory lists
 * the tool only when authMode is 'oauth'; the keyless and key transports never
 * see it. Both routes admit the `employee` role, which is the point: an
 * employee can ask what Metrx holds about them.
 *
 * Descriptive only. The text states who you are, your teams, and the notices
 * exactly as the route returned them. No score, no flag, no recommendation
 * about the person, and no number that did not come from a route.
 *
 * NOTE: no value-imports from @modelcontextprotocol/sdk here (same rule as
 * workforce.ts and loop-metrics.ts): apps/web's tests import this module
 * directly, so it must load outside this package's build.
 */

import { z } from 'zod';

/** Structural server type (registration surface only; the SDK stays type-free here). */
export interface SelfToolRegistrar {
  registerTool(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    },
    handler: (args: any) => Promise<{
      content: Array<{ type: 'text'; text: string }>;
      isError?: boolean;
    }>
  ): unknown;
}

/** Structural client type: matches MetrxApiClient and the keyless clients. */
export interface SelfApiClient {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<{ data?: T; error?: string }>;
}

/** GET /api/me. In a solo workspace: enterprise false, person_id null, teams []. */
interface MeResponse {
  user_id?: string;
  org_id?: string;
  role?: string;
  tier?: string;
  credential?: string;
  enterprise?: boolean;
  person_id?: string | null;
  is_admin?: boolean;
  is_manager?: boolean;
  view_mode?: string;
  teams?: Array<{
    id: string;
    name: string;
    member_count?: number;
    managers?: unknown;
    i_manage?: boolean;
    /** On the team. An admin's /me lists every team; only these are "yours". */
    i_member?: boolean;
  }>;
}

/** GET /api/me/notices. */
interface NoticesResponse {
  data?: Array<{
    id: string;
    kind?: string;
    created_at?: string;
    viewer_name?: string | null;
    viewer_role?: string | null;
    surface?: string | null;
    reason?: string | null;
  }>;
}

export const NOTICES_LIMIT_DEFAULT = 20;
export const NOTICES_LIMIT_MAX = 200;

const clean = (v: unknown): string =>
  typeof v === 'string' && v.trim() ? v.trim() : 'not recorded';

export function registerSelfTools(server: SelfToolRegistrar, client: SelfApiClient): void {
  server.registerTool(
    'get_my_access',
    {
      title: 'Get My Access',
      description:
        'Show what Metrx holds about you as a person: your role in this workspace, ' +
        'whether it is a team workspace, the teams you belong to, and the most recent ' +
        'notices of who opened your page, when, from which surface, and the reason they gave. ' +
        'Available only when you are signed in through the connector (not with an API key). ' +
        'Descriptive only: no scores, no flags, no recommendations about you. ' +
        'Do NOT use for company cost or agent data; use metrx_get_cost_summary for that.',
      inputSchema: {
        notices_limit: z
          .number()
          .int()
          .min(1)
          .max(NOTICES_LIMIT_MAX)
          .default(NOTICES_LIMIT_DEFAULT)
          .describe(
            `How many recent notices to show (1-${NOTICES_LIMIT_MAX}, default ${NOTICES_LIMIT_DEFAULT})`
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ notices_limit }: { notices_limit?: number }) => {
      const limit = Math.min(
        NOTICES_LIMIT_MAX,
        Math.max(1, Math.trunc(notices_limit ?? NOTICES_LIMIT_DEFAULT))
      );

      const me = await client.get<MeResponse>('/me');
      if (me.error || !me.data) {
        return {
          content: [
            { type: 'text', text: `Error fetching your access: ${me.error ?? 'empty response'}` },
          ],
          isError: true,
        };
      }
      const notices = await client.get<NoticesResponse>('/me/notices', { limit });
      if (notices.error) {
        return {
          content: [{ type: 'text', text: `Error fetching your notices: ${notices.error}` }],
          isError: true,
        };
      }

      const m = me.data;
      const list = notices.data?.data ?? [];
      // /api/me returns every team an admin can see; "your teams" are the ones
      // you are on or manage (the /me page filters the same way).
      const teams = (m.teams ?? []).filter((t) => t.i_member === true || t.i_manage === true);
      const lines: string[] = ['## Your access in Metrx', ''];
      lines.push(`- Role: ${clean(m.role)}`);
      lines.push(
        m.enterprise
          ? '- Workspace: a team workspace (people and teams are set up).'
          : '- Workspace: a solo workspace (no team workspace, so no teams and no page notices apply).'
      );
      if (m.enterprise) {
        const flags = [m.is_admin ? 'admin' : null, m.is_manager ? 'manager' : null].filter(
          Boolean
        );
        if (flags.length > 0) lines.push(`- You are also: ${flags.join(', ')}`);
        lines.push('', `### Your teams (${teams.length})`);
        if (teams.length === 0) {
          lines.push('You are not on any team.');
        } else {
          for (const t of teams) {
            const members = typeof t.member_count === 'number' ? `, ${t.member_count} members` : '';
            lines.push(`- ${t.name}${members}${t.i_manage ? ' (you manage it)' : ''}`);
          }
        }
      }

      lines.push('', `### Who opened your page (up to ${limit} recent notices)`);
      if (list.length === 0) {
        lines.push('No one has opened your page. There are no notices.');
      } else {
        lines.push(
          `${list.length} notice${list.length === 1 ? '' : 's'}, in the order Metrx returned them:`
        );
        for (const n of list) {
          lines.push(
            `- ${clean(n.created_at)}: ${clean(n.viewer_name)} (${clean(n.viewer_role)}) ` +
              `opened ${clean(n.surface)}. Reason given: ${clean(n.reason)}`
          );
        }
        if (list.length >= limit) {
          lines.push(`The limit of ${limit} was reached; more notices may exist.`);
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );
}
