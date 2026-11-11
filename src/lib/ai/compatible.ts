/**
 * Generic OpenAI-compatible endpoint (Chat Completions), for OpenRouter and
 * local servers such as Ollama or LM Studio. Structured output support
 * varies, so JSON calls fall back from a JSON schema to JSON mode to a
 * plain instruction, and every answer is validated in code either way.
 */
import type { AIProvider, ChatRequest, ChatResult, JsonRequest, JsonResult } from './types';
import { ProviderError } from './errors';
import { jsonSchemaOf, normalizeTurns, post, sse, systemText } from './http';
import { parseJson } from './anthropic';
import type { TokenUsage } from '../cost/pricing';

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export function chatUsage(u: ChatUsage | undefined): TokenUsage {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return { inputTokens: Math.max(0, (u?.prompt_tokens ?? 0) - cached), outputTokens: u?.completion_tokens ?? 0, cacheReadTokens: cached, cacheWriteTokens: 0 };
}

export class CompatibleProvider implements AIProvider {
  readonly id = 'custom' as const;
  readonly capabilities = { streaming: true, structuredOutput: false, promptCaching: 'automatic' as const };
  private base: string;
  private key: string | undefined;
  private f: typeof fetch;

  constructor(baseUrl: string, key: string | undefined, f: typeof fetch = fetch.bind(globalThis)) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.key = key || undefined;
    this.f = f;
  }

  private headers() {
    return { 'Content-Type': 'application/json', ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}) };
  }

  private async run(req: ChatRequest | JsonRequest<unknown>, responseFormat?: Record<string, unknown>, extraSystem = '', onText?: (s: string) => void): Promise<ChatResult> {
    const body = {
      model: req.model,
      messages: [
        { role: 'system', content: systemText(req.system) + extraSystem },
        ...normalizeTurns(req.turns).map((t) => ({ role: t.role, content: t.text })),
      ],
      max_tokens: req.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...(responseFormat ? { response_format: responseFormat } : {}),
    };
    const res = await post(this.f, `${this.base}/chat/completions`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: req.signal }, this.key);
    let text = '';
    let usage: ChatUsage | undefined;
    let model = req.model;
    for await (const { data } of sse(res)) {
      if (data === '[DONE]') break;
      let chunk: { choices?: { delta?: { content?: string } }[]; usage?: ChatUsage; model?: string };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onText?.(text);
      }
      if (chunk.usage) usage = chunk.usage;
      if (chunk.model) model = chunk.model;
    }
    return { text, usage: chatUsage(usage), model };
  }

  chat(req: ChatRequest): Promise<ChatResult> {
    return this.run(req, undefined, '', req.onText);
  }

  async json<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const schema = jsonSchemaOf(req.schema);
    const instruction = `\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`;
    const attempts: (Record<string, unknown> | undefined)[] = [
      { type: 'json_schema', json_schema: { name: req.schemaName, schema, strict: false } },
      { type: 'json_object' },
      undefined,
    ];
    let lastError: unknown;
    for (const format of attempts) {
      try {
        const res = await this.run(req, format, format?.type === 'json_schema' ? '' : instruction);
        return { ...res, data: parseJson(res.text, req.schema) };
      } catch (err) {
        // Only an unsupported response format is worth retrying differently.
        if (!(err instanceof ProviderError) || err.kind !== 'bad-request') throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  async checkKey(): Promise<void> {
    await post(this.f, `${this.base}/models`, { headers: this.headers() }, this.key);
  }
}
