/**
 * Self tool (get_my_access): both routes are called with the right paths and
 * params, the answer is descriptive only, and a refusal passes through.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerSelfTools } from '../../dist/tools/self';
import {
  MCP_TOOLS_BY_DOMAIN,
  MCP_TOOL_AUTH,
  MCP_TOOL_SCOPES,
} from '../../dist/tool-registry-facts';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

const setup = (get: (path: string, params?: any) => Promise<any>) => {
  const server = { registerTool: vi.fn() };
  const client = { get: vi.fn(get) };
  registerSelfTools(server as any, client as any);
  const call = server.registerTool.mock.calls.find(([n]: [string]) => n === 'get_my_access');
  return { server, client, config: call![1] as any, handler: call![2] as Handler };
};

const ME_TEAM = {
  user_id: 'u1',
  org_id: 'o1',
  role: 'employee',
  tier: 'enterprise',
  credential: 'session',
  enterprise: true,
  person_id: 'p1',
  is_admin: false,
  is_manager: false,
  view_mode: 'self',
  teams: [
    { id: 't1', name: 'Support', member_count: 7, managers: [], i_manage: false, i_member: true },
  ],
};
const ME_SOLO = { role: 'owner', enterprise: false, person_id: null, teams: [] };
const NOTICES = {
  data: [
    {
      id: 'n1',
      kind: 'page_view',
      created_at: '2026-11-20T10:00:00Z',
      viewer_name: 'Dana Lee',
      viewer_role: 'manager',
      surface: 'person page',
      reason: 'quarterly check-in',
    },
  ],
};

describe('get_my_access', () => {
  it('registers once, read-only, with an optional bounded notices_limit', () => {
    const { server, config } = setup(async () => ({ data: {} }));
    expect(server.registerTool).toHaveBeenCalledTimes(1);
    expect(MCP_TOOLS_BY_DOMAIN.self).toEqual(['get_my_access']);
    expect(config.annotations.readOnlyHint).toBe(true);
    const limit = config.inputSchema.notices_limit;
    expect(limit.parse(undefined)).toBe(20);
    expect(limit.parse(200)).toBe(200);
    expect(() => limit.parse(0)).toThrow();
    expect(() => limit.parse(201)).toThrow();
    expect(() => limit.parse(1.5)).toThrow();
    expect(MCP_TOOL_AUTH.get_my_access).toBe('key');
    expect(MCP_TOOL_SCOPES.get_my_access).toBe('read');
  });

  it('calls /me and /me/notices with the limit (default 20, explicit passes through)', async () => {
    const { client, handler } = setup(async (path) =>
      path === '/me' ? { data: ME_TEAM } : { data: NOTICES }
    );
    await handler({});
    expect(client.get).toHaveBeenNthCalledWith(1, '/me');
    expect(client.get).toHaveBeenNthCalledWith(2, '/me/notices', { limit: 20 });
    await handler({ notices_limit: 5 });
    expect(client.get).toHaveBeenLastCalledWith('/me/notices', { limit: 5 });
  });

  it('with notices: states role, team workspace, teams, and who/when/where/why', async () => {
    const { handler } = setup(async (path) =>
      path === '/me' ? { data: ME_TEAM } : { data: NOTICES }
    );
    const res = await handler({});
    const text = res.content[0]!.text;
    expect(res.isError).toBeUndefined();
    expect(text).toContain('Role: employee');
    expect(text).toContain('a team workspace');
    expect(text).toContain('Support, 7 members');
    expect(text).toContain('2026-11-20T10:00:00Z');
    expect(text).toContain('Dana Lee (manager)');
    expect(text).toContain('person page');
    expect(text).toContain('Reason given: quarterly check-in');
    expect(text).not.toMatch(/score|flag|recommend/i);
  });

  it('without notices: says plainly that no one has opened the page', async () => {
    const { handler } = setup(async (path) =>
      path === '/me' ? { data: ME_TEAM } : { data: { data: [] } }
    );
    const text = (await handler({})).content[0]!.text;
    expect(text).toContain('No one has opened your page. There are no notices.');
  });

  it('lists only the teams you are on or manage, not every team an admin can see', async () => {
    const admin = {
      ...ME_TEAM,
      role: 'admin',
      is_admin: true,
      is_manager: true,
      teams: [
        { id: 't1', name: 'Support', member_count: 7, i_manage: false, i_member: true },
        { id: 't2', name: 'Billing', member_count: 4, i_manage: true, i_member: false },
        { id: 't3', name: 'Legal', member_count: 3, i_manage: false, i_member: false },
      ],
    };
    const { handler } = setup(async (path) =>
      path === '/me' ? { data: admin } : { data: { data: [] } }
    );
    const text = (await handler({})).content[0]!.text;
    expect(text).toContain('### Your teams (2)');
    expect(text).toContain('Support, 7 members');
    expect(text).toContain('Billing, 4 members (you manage it)');
    expect(text).not.toContain('Legal');
  });

  it('solo workspace: says so and shows no teams section', async () => {
    const { handler } = setup(async (path) =>
      path === '/me' ? { data: ME_SOLO } : { data: { data: [] } }
    );
    const text = (await handler({})).content[0]!.text;
    expect(text).toContain('a solo workspace');
    expect(text).not.toContain('Your teams');
  });

  it('403 from /me passes through as an error and /me/notices is not called', async () => {
    const { client, handler } = setup(async () => ({
      error: 'Access forbidden (403): api_key_refused',
    }));
    const res = await handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('api_key_refused');
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it('error from /me/notices passes through as an error', async () => {
    const { handler } = setup(async (path) =>
      path === '/me' ? { data: ME_TEAM } : { error: 'Access forbidden (403): api_key_refused' }
    );
    const res = await handler({});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Error fetching your notices');
    expect(res.content[0]!.text).toContain('api_key_refused');
  });
});
