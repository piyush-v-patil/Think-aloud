import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider, buildAnthropicPrompt } from './anthropic';
import { ProviderError } from './errors';
import { anthropicStream, fakeFetch, json } from './testing';

const KEY = 'sk-ant-test-1234567890abcdef';

describe('buildAnthropicPrompt', () => {
  it('marks cache breakpoints and merges consecutive turns', () => {
    const { system, messages } = buildAnthropicPrompt(
      [{ text: 'rules' }, { text: 'problem and analysis', cache: true }],
      [
        { role: 'user', text: 'earlier transcript', cache: true },
        { role: 'user', text: 'new event' },
      ],
    );
    expect(system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0].cache_control).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toHaveLength(2);
    expect(messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
  });
  it('never sends more than 4 breakpoints', () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `t${i}`, cache: true }));
    const { system, messages } = buildAnthropicPrompt([{ text: 's', cache: true }], [...turns, { role: 'user', text: 'last' }]);
    const count = [...system, ...messages.flatMap((m) => m.content)].filter((b) => b.cache_control).length;
    expect(count).toBe(4);
    expect(system[0].cache_control).toBeDefined();
  });
  it('starts with a user message', () => {
    const { messages } = buildAnthropicPrompt([], [{ role: 'assistant', text: 'Hi, ready?' }, { role: 'user', text: 'yes' }]);
    expect(messages[0].role).toBe('user');
  });
});

describe('AnthropicProvider', () => {
  it('streams text and reports usage including cached tokens', async () => {
    const f = fakeFetch(() => anthropicStream('Sure, go ahead.'));
    const p = new AnthropicProvider(KEY, { fetch: f.fetch, maxRetries: 0 });
    const seen: string[] = [];
    const res = await p.chat({ model: 'claude-sonnet-5-5', system: [{ text: 'x', cache: true }], turns: [{ role: 'user', text: 'hi' }], maxTokens: 300, effort: 'low', onText: (t) => seen.push(t) });
    expect(res.text).toBe('Sure, go ahead.');
    expect(seen[seen.length - 1]).toBe('Sure, go ahead.');
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 50 });
    const req = f.calls[0];
    expect(req.headers['x-api-key'] ?? req.headers['authorization']).toContain(KEY);
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    const body = req.body as Record<string, unknown>;
    expect(body.fallbacks).toBe('default');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.stream).toBe(true);
    expect(req.url).not.toContain(KEY);
  });
  it('does not request fallbacks for Haiku', async () => {
    const f = fakeFetch(() => anthropicStream('ok'));
    await new AnthropicProvider(KEY, { fetch: f.fetch, maxRetries: 0 }).chat({ model: 'claude-haiku-5-5', system: [], turns: [{ role: 'user', text: 'hi' }], maxTokens: 10 });
    expect((f.calls[0].body as Record<string, unknown>).fallbacks).toBeUndefined();
  });
  it('parses structured output against the schema', async () => {
    const f = fakeFetch(() => anthropicStream('{"score": 3, "why": "asked about input"}'));
    const p = new AnthropicProvider(KEY, { fetch: f.fetch, maxRetries: 0 });
    const res = await p.json({ model: 'claude-opus-5-5', system: [], turns: [{ role: 'user', text: 'score' }], maxTokens: 100, schema: z.object({ score: z.number(), why: z.string() }), schemaName: 'score' });
    expect(res.data).toEqual({ score: 3, why: 'asked about input' });
    const format = ((f.calls[0].body as Record<string, unknown>).output_config as Record<string, { type: string }>).format;
    expect(format.type).toBe('json_schema');
  });
  it('rejects output that does not match the schema', async () => {
    const f = fakeFetch(() => anthropicStream('{"score": "high"}'));
    const p = new AnthropicProvider(KEY, { fetch: f.fetch, maxRetries: 0 });
    await expect(p.json({ model: 'claude-opus-5-5', system: [], turns: [{ role: 'user', text: 's' }], maxTokens: 100, schema: z.object({ score: z.number() }), schemaName: 's' })).rejects.toMatchObject({ kind: 'bad-output' });
  });

  const errorCases: [number, unknown, string][] = [
    [401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${KEY}` } }, 'invalid-key'],
    [400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 'no-credit'],
    [402, { type: 'error', error: { type: 'billing_error', message: 'Billing problem' } }, 'no-credit'],
    [429, { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } }, 'rate-limit'],
    [529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'overloaded'],
    [404, { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } }, 'not-found'],
  ];
  for (const [status, body, kind] of errorCases) {
    it(`maps HTTP ${status} to ${kind} without leaking the key`, async () => {
      const f = fakeFetch(() => json(status, body, status === 429 ? { 'retry-after': '7' } : {}));
      const p = new AnthropicProvider(KEY, { fetch: f.fetch, maxRetries: 0 });
      const err = await p.checkKey('claude-haiku-5-5').catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(KEY);
      if (status === 429) expect(err.retryAfter).toBe(7);
    });
  }
  it('maps network failures', async () => {
    const p = new AnthropicProvider(KEY, { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, maxRetries: 0 });
    await expect(p.checkKey('claude-haiku-5-5')).rejects.toMatchObject({ kind: 'network' });
  });
});
