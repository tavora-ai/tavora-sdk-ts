// Agent-event SDK parity tests. Mirrors the Phase-A fixes from
// agent-runner/docs/AGENT_SDK_GAPS.md (A1 token round-trip, A2 input
// request extraction + respondToAgentInput).

import { describe, expect, it } from 'vitest';
import {
  EventType,
  asInputRequest,
  isTerminalEvent,
  type AgentEvent,
} from '../src/types.js';
import { TestServer } from './test-server.js';

describe('AgentEvent.tokens (A1 — wire-shape parity)', () => {
  it('round-trips per-step Tokens the server emits', () => {
    const evt: AgentEvent = {
      type: EventType.Response,
      content: '...',
      tokens: { prompt: 42, completion: 13 },
    };
    expect(evt.tokens?.prompt).toBe(42);
    expect(evt.tokens?.completion).toBe(13);
  });
});

describe('isTerminalEvent', () => {
  it('flips on done/error and only on done/error', () => {
    expect(isTerminalEvent({ type: EventType.Done })).toBe(true);
    expect(isTerminalEvent({ type: EventType.Error })).toBe(true);
    expect(isTerminalEvent({ type: EventType.SandboxEvent })).toBe(false);
    expect(isTerminalEvent({ type: EventType.ExecuteJS })).toBe(false);
    expect(isTerminalEvent({ type: EventType.ExecuteJSResult })).toBe(false);
    expect(isTerminalEvent({ type: EventType.DataUpdate })).toBe(false);
    expect(isTerminalEvent({ type: EventType.Response })).toBe(false);
    expect(isTerminalEvent({ type: EventType.InputRequest })).toBe(false);
    // Unknown types are non-terminal so future server additions don't
    // break consumer loops.
    expect(isTerminalEvent({ type: 'future_unknown' })).toBe(false);
  });
});

describe('asInputRequest (A2)', () => {
  it('extracts a typed InputRequest from an input_request event', () => {
    const evt: AgentEvent = {
      type: EventType.InputRequest,
      content: 'Pick a flavor',
      args: {
        request_id: 'req_abc',
        input_type: 'choice',
        message: 'Pick a flavor',
        options: ['vanilla', 'chocolate'],
        placeholder: 'your pick',
      },
    };
    const req = asInputRequest(evt);
    expect(req).not.toBeNull();
    expect(req!.requestId).toBe('req_abc');
    expect(req!.inputType).toBe('choice');
    expect(req!.options).toEqual(['vanilla', 'chocolate']);
    expect(req!.placeholder).toBe('your pick');
    expect(req!.message).toBe('Pick a flavor');
  });

  it('falls back to event.content when args.message is missing', () => {
    const req = asInputRequest({
      type: EventType.InputRequest,
      content: 'fallback',
      args: { request_id: 'r', input_type: 'text' },
    });
    expect(req?.message).toBe('fallback');
  });

  it('returns null for non-input events so consumers can branch cleanly', () => {
    expect(asInputRequest({ type: EventType.Response })).toBeNull();
    expect(asInputRequest({ type: EventType.Done })).toBeNull();
  });

  it('coerces missing fields to safe zero values rather than throwing', () => {
    const req = asInputRequest({ type: EventType.InputRequest });
    expect(req?.requestId).toBe('');
    expect(req?.options).toEqual([]);
    expect(req?.placeholder).toBe('');
  });
});

describe('respondToAgentInput', () => {
  it('POSTs the request_id+value envelope the server expects', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/agents/as_1/input', 200, { ok: true });

    await ts.client().respondToAgentInput('as_1', 'req_abc', 'vanilla');

    const body = JSON.parse(ts.lastRequest().body!) as {
      request_id: string;
      value: unknown;
    };
    expect(body.request_id).toBe('req_abc');
    expect(body.value).toBe('vanilla');
  });

  it('encodes booleans for confirm-type input', async () => {
    const ts = new TestServer();
    ts.on('POST', '/api/sdk/agents/as_1/input', 200, { ok: true });

    await ts.client().respondToAgentInput('as_1', 'req_xyz', true);

    const body = JSON.parse(ts.lastRequest().body!) as { value: unknown };
    expect(body.value).toBe(true);
  });
});
