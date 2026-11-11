/**
 * Google Gemini adapter (generateContent, streamed). Called directly from
 * the browser; the key goes in the `x-goog-api-key` header, never the URL.
 * Caching is implicit for repeated prefixes.
 */
import type { AIProvider, ChatRequest, ChatResult, Effort, JsonRequest, JsonResult } from './types';
import { ProviderError } from './errors';
import { jsonSchemaOf, normalizeTurns, post, sse, systemText } from './http';
import { parseJson } from './anthropic';
import type { TokenUsage } from '../cost/pricing';

interface GeminiUsage {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function geminiUsage(u: GeminiUsage | undefined): TokenUsage {
  const cached = u?.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

const LEVEL: Record<Effort, string> = { low: 'low', medium: 'medium', high: 'high' };

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly capabilities = { streaming: true, structuredOutput: true, promptCaching: 'automatic' as const };
  private key: string;
  private f: typeof fetch;

  constructor(key: string, f: typeof fetch = fetch.bind(globalThis)) {
    this.key = key;
    this.f = f;
  }

  private async run(req: ChatRequest | JsonRequest<unknown>, schema?: Record<string, unknown>, onText?: (s: string) => void): Promise<ChatResult> {
    const body = {
      systemInstruction: { parts: [{ text: systemText(req.system) }] },
      contents: normalizeTurns(req.turns).map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        ...(req.effort ? { thinkingConfig: { thinkingLevel: LEVEL[req.effort] } } : {}),
        ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
    const res = await post(
      this.f,
      url,
      { method: 'POST', headers: { 'x-goog-api-key': this.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: req.signal },
      this.key,
    );
    let text = '';
    let usage: GeminiUsage | undefined;
    let model = req.model;
    for await (const { data } of sse(res)) {
      let chunk: {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        usageMetadata?: GeminiUsage;
        modelVersion?: string;
        promptFeedback?: { blockReason?: string };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.promptFeedback?.blockReason) throw new ProviderError('refused', 'The model declined to answer.');
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text && !part.thought) {
          text += part.text;
          onText?.(text);
        }
      }
      const finish = chunk.candidates?.[0]?.finishReason;
      if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') throw new ProviderError('refused', 'The model declined to answer.');
      if (finish === 'MAX_TOKENS' && schema) throw new ProviderError('bad-output', 'The answer was cut off before it finished.');
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (chunk.modelVersion) model = chunk.modelVersion;
    }
    return { text, usage: geminiUsage(usage), model };
  }

  chat(req: ChatRequest): Promise<ChatResult> {
    return this.run(req, undefined, req.onText);
  }

  async json<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const res = await this.run(req, jsonSchemaOf(req.schema));
    return { ...res, data: parseJson(res.text, req.schema) };
  }

  async checkKey(model: string): Promise<void> {
    await this.run({ model, system: [], turns: [{ role: 'user', text: 'Reply with OK.' }], maxTokens: 16 });
  }
}
