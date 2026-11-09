/**
 * CLI telemetry opt-out (desk PR 1): the three documented variables each
 * silence trackCliEvent, and nothing else does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { telemetryOptedOut, trackCliEvent } from '../../dist/services/telemetry';

describe('telemetry opt-out', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['METRX_TELEMETRY', '0'],
    ['METRX_TELEMETRY_DISABLED', '1'],
    ['DO_NOT_TRACK', '1'],
  ])('%s=%s opts out', (k, v) => {
    expect(telemetryOptedOut({ [k]: v })).toBe(true);
  });

  it.each([
    [{}],
    [{ METRX_TELEMETRY: '1' }],
    [{ DO_NOT_TRACK: '0' }],
    [{ METRX_TELEMETRY_DISABLED: 'yes' }],
  ])('%o does not opt out', (env) => {
    expect(telemetryOptedOut(env as NodeJS.ProcessEnv)).toBe(false);
  });

  it('trackCliEvent sends nothing when opted out and a ping otherwise', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const prev = process.env.METRX_TELEMETRY;
    process.env.METRX_TELEMETRY = '0';
    trackCliEvent('mcp_demo_started');
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.METRX_TELEMETRY;
    trackCliEvent('mcp_demo_started');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.event).toBe('mcp_demo_started');
    expect(Object.keys(body).sort()).toEqual(['event', 'node_version', 'platform', 'version']);
    if (prev !== undefined) process.env.METRX_TELEMETRY = prev;
  });
});
