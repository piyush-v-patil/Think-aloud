import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { CompatibleProvider } from './compatible';
import { fakeFetch, json, sse } from './testing';

const req = { model: 'm', system: [{ text: 'rules' }, { text: 'problem', cache: true }], turns: [{ role: 'user' as const, text: 'hi' }], maxTokens: 100, effort: 'low' as const };

describe('OpenAI adapter', () => {
  const KEY = 'sk-proj-secret-1234567890';
  it('streams the Responses API, does not store responses, and maps cached tokens', async () => {
    const f = fakeFetch(() =>
      sse([
        { data: { type: 'response.output_text.delta', delta: 'Sure, ' } },
        { data: { type: 'response.output_text.delta', delta: 'go on.' } },
        { data: { type: 'response.completed', response: { model: 'gpt-6.1-sol', usage: { input_tokens: 1000, output_tokens: 20, input_tokens_details: { cached_tokens: 700, cache_write_tokens: 200 } } } } },
      ]),
    );
    const seen: string[] = [];
    const res = await new OpenAIProvider(KEY, f.fetch).chat({ ...req, onText: (t) => seen.push(t) });
    expect(res.text).toBe('Sure, go on.');
    expect(seen).toEqual(['Sure, ', 'Sure, go on.']);
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 700, cacheWriteTokens: 200 });
    const body = f.calls[0].body as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.instructions).toBe('rules\n\nproblem');
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(f.calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
  });
  it('asks for a JSON schema and validates the answer', async () => {
    const f = fakeFetch(() => sse([{ data: { type: 'response.output_text.delta', delta: '{"n": 2}' } }, { data: { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 5 } } } }]));
    const res = await new OpenAIProvider(KEY, f.fetch).json({ ...req, schema: z.object({ n: z.number() }), schemaName: 'n' });
    expect(res.data).toEqual({ n: 2 });
    const format = ((f.calls[0].body as Record<string, unknown>).text as { format: { type: string; schema: { type: string } } }).format;
    expect(format.type).toBe('json_schema');
    expect(format.schema.type).toBe('object');
  });
  it('maps errors without leaking the key', async () => {
    const f = fakeFetch(() => json(401, { error: { message: `Incorrect API key provided: ${KEY}` } }));
    const err = await new OpenAIProvider(KEY, f.fetch).checkKey('gpt-6-luna').catch((e) => e);
    expect(err.kind).toBe('invalid-key');
    expect(err.message).not.toContain(KEY);
    const quota = fakeFetch(() => json(429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota' } }));
    // OpenAI reports missing credit as 429 with an insufficient_quota type.
    expect((await new OpenAIProvider(KEY, quota.fetch).checkKey('m').catch((e) => e)).kind).toBe('no-credit');
  });
});

describe('Gemini adapter', () => {
  const KEY = 'AIzaSyFAKEKEYFORTESTS000000000000';
  it('streams generateContent with the key in a header, skipping thoughts', async () => {
    const f = fakeFetch(() =>
      sse([
        { data: { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: 'Yes, ' }] } }] } },
        { data: { candidates: [{ content: { parts: [{ text: 'it can.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, cachedContentTokenCount: 600, candidatesTokenCount: 10, thoughtsTokenCount: 30 }, modelVersion: 'gemini-3.8-flash' } },
      ]),
    );
    const res = await new GeminiProvider(KEY, f.fetch).chat({ ...req, model: 'gemini-3.8-flash' });
    expect(res.text).toBe('Yes, it can.');
    expect(res.usage).toEqual({ inputTokens: 300, outputTokens: 40, cacheReadTokens: 600, cacheWriteTokens: 0 });
    expect(f.calls[0].url).toContain(':streamGenerateContent?alt=sse');
    expect(f.calls[0].url).not.toContain(KEY);
    expect(f.calls[0].headers['x-goog-api-key']).toBe(KEY);
    const body = f.calls[0].body as { contents: { role: string }[]; generationConfig: { thinkingConfig: { thinkingLevel: string } } };
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
  });
  it('treats an invalid key reported as 400 as a rejected key', async () => {
    const f = fakeFetch(() => json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }));
    expect((await new GeminiProvider(KEY, f.fetch).checkKey('m').catch((e) => e)).kind).toBe('invalid-key');
  });
  it('sends the assistant role as model and a JSON schema for structured output', async () => {
    const f = fakeFetch(() => sse([{ data: { candidates: [{ content: { parts: [{ text: '{"ok": true}' }] }, finishReason: 'STOP' }] } }]));
    const res = await new GeminiProvider(KEY, f.fetch).json({ ...req, turns: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }], schema: z.object({ ok: z.boolean() }), schemaName: 'ok' });
    expect(res.data).toEqual({ ok: true });
    const body = f.calls[0].body as { contents: { role: string }[]; generationConfig: { responseJsonSchema: unknown; responseMimeType: string } };
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });
});

describe('OpenAI-compatible adapter', () => {
  it('works without a key and falls back when JSON schema output is unsupported', async () => {
    let n = 0;
    const f = fakeFetch((r) => {
      const body = r.body as { response_format?: { type: string } };
      n++;
      if (body.response_format?.type === 'json_schema') return json(400, { error: 'response_format json_schema not supported' });
      return sse([{ data: { choices: [{ delta: { content: '{"a": 1}' } }] } }, { data: { choices: [], usage: { prompt_tokens: 50, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 20 } } } }, { data: '[DONE]' }]);
    });
    const p = new CompatibleProvider('http://localhost:11434/v1/', undefined, f.fetch);
    const res = await p.json({ ...req, model: 'llama4', schema: z.object({ a: z.number() }), schemaName: 'a' });
    expect(res.data).toEqual({ a: 1 });
    expect(res.usage).toEqual({ inputTokens: 30, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 0 });
    expect(n).toBe(2);
    expect(f.calls[1].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(f.calls[1].headers.authorization).toBeUndefined();
    const sys = (f.calls[1].body as { messages: { role: string; content: string }[] }).messages[0];
    expect(sys.content).toContain('JSON Schema');
  });
});
