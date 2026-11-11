/**
 * OpenAI adapter on the Responses API, called directly from the browser
 * (the API allows cross-origin requests). Prompt caching is automatic for
 * repeated prefixes; responses are not stored on OpenAI (`store: false`).
 */
import type { AIProvider, ChatRequest, ChatResult, JsonRequest, JsonResult } from './types';
import { ProviderError } from './errors';
import { jsonSchemaOf, normalizeTurns, post, sse, systemText } from './http';
import { parseJson } from './anthropic';
import type { TokenUsage } from '../cost/pricing';

interface OpenAIUsage {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
}

export function openaiUsage(u: OpenAIUsage | undefined): TokenUsage {
  const cached = u?.input_tokens_details?.cached_tokens ?? 0;
  const written = u?.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (u?.input_tokens ?? 0) - cached - written),
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: written,
  };
}

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const;
  readonly capabilities = { streaming: true, structuredOutput: true, promptCaching: 'automatic' as const };
  private key: string;
  private f: typeof fetch;

  constructor(key: string, f: typeof fetch = fetch.bind(globalThis)) {
    this.key = key;
    this.f = f;
  }

  private body(req: ChatRequest | JsonRequest<unknown>, format?: Record<string, unknown>) {
    return {
      model: req.model,
      instructions: systemText(req.system),
      input: normalizeTurns(req.turns).map((t) => ({ role: t.role, content: t.text })),
      max_output_tokens: req.maxTokens,
      stream: true,
      store: false,
      ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
      ...(format ? { text: { format } } : {}),
    };
  }

  private async run(req: ChatRequest | JsonRequest<unknown>, format?: Record<string, unknown>, onText?: (s: string) => void): Promise<ChatResult> {
    const res = await post(
      this.f,
      'https://api.openai.com/v1/responses',
      { method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(this.body(req, format)), signal: req.signal },
      this.key,
    );
    let text = '';
    let usage: TokenUsage | null = null;
    let model = req.model;
    for await (const { data } of sse(res)) {
      if (data === '[DONE]') break;
      let ev: { type: string; delta?: string; response?: { usage?: OpenAIUsage; model?: string; status?: string; incomplete_details?: { reason?: string } }; error?: { message?: string } };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'response.output_text.delta' && ev.delta) {
        text += ev.delta;
        onText?.(text);
      } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
        usage = openaiUsage(ev.response?.usage);
        model = ev.response?.model ?? model;
        if (ev.type === 'response.incomplete' && format) throw new ProviderError('bad-output', 'The answer was cut off before it finished.');
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        throw new ProviderError('bad-request', ev.error?.message ?? 'The provider could not complete the request.');
      } else if (ev.type === 'response.refusal.done') {
        throw new ProviderError('refused', 'The model declined to answer.');
      }
    }
    return { text, usage: usage ?? openaiUsage(undefined), model };
  }

  chat(req: ChatRequest): Promise<ChatResult> {
    return this.run(req, undefined, req.onText);
  }

  async json<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const format = { type: 'json_schema', name: req.schemaName, schema: jsonSchemaOf(req.schema), strict: false };
    const res = await this.run(req, format);
    return { ...res, data: parseJson(res.text, req.schema) };
  }

  async checkKey(model: string): Promise<void> {
    await this.run({ model, system: [], turns: [{ role: 'user', text: 'Reply with OK.' }], maxTokens: 16 });
  }
}
