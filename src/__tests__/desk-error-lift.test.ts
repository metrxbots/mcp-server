/**
 * Desk errors raised inside a tool reach the caller as the table's JSON-RPC
 * error (plan §2): demo_unavailable -32005 with retry_after_seconds,
 * unknown_agent_key -32006 with suggestions. The SDK would otherwise turn
 * them into a plain isError text and drop both fields. Regression: before
 * this, the hosted and stdio servers answered demo_unavailable as a text
 * result, so a client could not read the class or the wait.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DESK_ERROR_META_KEY,
  MCP_ERRORS,
  deskErrorResult,
  deskProblemFromBody,
  liftDeskErrorsOn,
  liftDeskToolError,
  v1Problem,
} from '../../dist/errors';

describe('deskProblemFromBody', () => {
  it('reads a v1 problem body back to its class and extras', () => {
    const body = v1Problem('unknown_agent_key', { suggestions: ['ddq', 'ddq-2'] });
    expect(deskProblemFromBody(body)).toEqual({
      cls: 'unknown_agent_key',
      extras: { suggestions: ['ddq', 'ddq-2'] },
    });
  });

  it('reads the raw text of a problem body', () => {
    const text = JSON.stringify(v1Problem('demo_unavailable', { retry_after_seconds: 300 }));
    expect(deskProblemFromBody(text)).toEqual({
      cls: 'demo_unavailable',
      extras: { retry_after_seconds: 300 },
    });
  });

  it('keeps fields and required_scope', () => {
    const body = { code: 'insufficient_scope', required_scope: 'read' };
    expect(deskProblemFromBody(body)?.extras).toEqual({ required_scope: 'read' });
    const invalid = { code: 'invalid_params', fields: { template: ['Required'] } };
    expect(deskProblemFromBody(invalid)?.extras).toEqual({ fields: { template: ['Required'] } });
  });

  it.each([
    ['a non-table code', { code: 'VALIDATION_ERROR', error: 'bad' }],
    ['an old error shape', { error: { code: 'RATE_LIMITED' } }],
    ['text that is not JSON', 'Bad Gateway'],
    ['null', null],
  ])('%s is null, so the caller keeps its text error', (_label, body) => {
    expect(deskProblemFromBody(body)).toBeNull();
  });
});

describe('liftDeskToolError', () => {
  const response = (result: unknown) => ({ jsonrpc: '2.0' as const, id: 7, result });

  it('lifts demo_unavailable to -32005 with the wait, same id', () => {
    const tool = deskErrorResult('get_workforce_review: demo_unavailable', {
      cls: 'demo_unavailable',
      extras: { retry_after_seconds: 300 },
    });
    const lifted = liftDeskToolError(response(tool)) as any;
    expect(lifted.result).toBeUndefined();
    expect(lifted.id).toBe(7);
    expect(lifted.error.code).toBe(-32005);
    expect(lifted.error.code).toBe(MCP_ERRORS.demo_unavailable.code);
    expect(lifted.error.data).toMatchObject({
      class: 'demo_unavailable',
      retry_after_seconds: 300,
      user_message: MCP_ERRORS.demo_unavailable.user_message,
    });
  });

  it('lifts unknown_agent_key to -32006 with its suggestions', () => {
    const tool = deskErrorResult('get_scorecard: unknown_agent_key', {
      cls: 'unknown_agent_key',
      extras: { suggestions: ['ddq'] },
    });
    const lifted = liftDeskToolError(response(tool)) as any;
    expect(lifted.error.code).toBe(-32006);
    expect(lifted.error.data.suggestions).toEqual(['ddq']);
  });

  it('leaves a success, a plain error and a non-table meta untouched (same object)', () => {
    const ok = response({ content: [{ type: 'text', text: '{}' }] });
    const plain = response({ content: [{ type: 'text', text: 'x' }], isError: true });
    const otherMeta = response({
      content: [],
      isError: true,
      _meta: { [DESK_ERROR_META_KEY]: { class: 'not_a_class' } },
    });
    const notError = response({
      content: [],
      _meta: { [DESK_ERROR_META_KEY]: { class: 'demo_unavailable' } },
    });
    for (const m of [ok, plain, otherMeta, notError]) expect(liftDeskToolError(m)).toBe(m);
    const notification = { jsonrpc: '2.0', method: 'notifications/progress' };
    expect(liftDeskToolError(notification)).toBe(notification);
  });
});

describe('liftDeskErrorsOn', () => {
  it('rewrites what the server sends and passes options through', async () => {
    const sent: unknown[] = [];
    const inner = vi.fn(async (message: unknown, _options?: unknown) => {
      sent.push(message);
    });
    const transport = liftDeskErrorsOn({ send: inner });
    const tool = deskErrorResult('x', {
      cls: 'demo_unavailable',
      extras: { retry_after_seconds: 300 },
    });
    await transport.send({ jsonrpc: '2.0', id: 1, result: tool }, { relatedRequestId: 1 });
    await transport.send({ jsonrpc: '2.0', id: 2, result: { content: [] } });
    expect((sent[0] as any).error.code).toBe(-32005);
    expect((sent[1] as any).result).toEqual({ content: [] });
    expect(inner.mock.calls[0]![1]).toEqual({ relatedRequestId: 1 });
  });
});
