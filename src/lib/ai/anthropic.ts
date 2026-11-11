/**
 * Anthropic adapter. Calls go straight from the browser to api.anthropic.com;
 * the SDK's `dangerouslyAllowBrowser` flag sends the
 * `anthropic-dangerous-direct-browser-access` header that enables CORS.
 * That flag exists to warn about shipping *your own* key to users. Here each
 * user brings their own key, which never leaves their browser except in
 * requests to Anthropic.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { AIProvider, ChatRequest, ChatResult, ChatTurn, JsonRequest, JsonResult, PromptBlock } from './types';
import { ProviderError, redact } from './errors';
import type { TokenUsage } from '../cost/pricing';

/**
 * Models that support server-side refusal fallbacks. If a safety classifier
 * declines a request (rare in this app), the API retries it on a fallback
 * model inside the same call instead of failing the interview.
 */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-2']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** The API allows at most 4 cache breakpoints per request. */
const MAX_BREAKPOINTS = 4;

type Block = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
type Message = { role: 'user' | 'assistant'; content: Block[] };

export function buildAnthropicPrompt(system: PromptBlock[], turns: ChatTurn[]) {
  const sys: Block[] = system.map((b) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const messages: Message[] = [];
  for (const t of turns) {
    const block: Block = { type: 'text', text: t.text, ...(t.cache ? { cache_control: { type: 'ephemeral' } } : {}) };
    const last = messages[messages.length - 1];
    if (last && last.role === t.role) last.content.push(block);
    else messages.push({ role: t.role, content: [block] });
  }
  if (!messages.length || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: [{ type: 'text', text: '(The interview is starting.)' }] });
  }
  // Keep the earliest system breakpoint and the latest others, up to the limit.
  const marked: Block[] = [...sys, ...messages.flatMap((m) => m.content)].filter((b) => b.cache_control);
  if (marked.length > MAX_BREAKPOINTS) {
    const keep = new Set<Block>([marked[0], ...marked.slice(-(MAX_BREAKPOINTS - 1))]);
    for (const b of marked) if (!keep.has(b)) delete b.cache_control;
  }
  return { system: sys, messages };
}

function usageOf(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;
  readonly capabilities = { streaming: true, structuredOutput: true, promptCaching: 'explicit' as const };
  private client: Anthropic;
  private key: string;

  constructor(apiKey: string, opts: { fetch?: typeof fetch; maxRetries?: number } = {}) {
    this.key = apiKey;
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: opts.maxRetries ?? 2,
      timeout: 10 * 60_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  private params(req: ChatRequest | JsonRequest<unknown>) {
    const { system, messages } = buildAnthropicPrompt(req.system, req.turns);
    return {
      model: req.model,
      max_tokens: req.maxTokens,
      system,
      messages,
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      ...(FALLBACK_MODELS.has(req.model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    try {
      // Streaming keeps long requests clear of HTTP timeouts and lets the
      // interviewer start speaking before the reply is complete.
      const stream = this.client.beta.messages.stream(this.params(req) as never, { signal: req.signal });
      if (req.onText) stream.on('text', (_delta: string, snapshot: string) => req.onText!(snapshot));
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new ProviderError('refused', 'The model declined to answer.');
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, usage: usageOf(msg.usage), model: msg.model };
    } catch (err) {
      throw this.normalize(err);
    }
  }

  async json<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    try {
      const base = this.params(req);
      const params = {
        ...base,
        output_config: { ...(base.output_config ?? {}), format: betaZodOutputFormat(req.schema as never) },
      };
      const stream = this.client.beta.messages.stream(params as never, { signal: req.signal });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new ProviderError('refused', 'The model declined to answer.');
      if (msg.stop_reason === 'max_tokens') throw new ProviderError('bad-output', 'The answer was cut off before it finished.');
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const data = parseJson(text, req.schema);
      return { text, data, usage: usageOf(msg.usage), model: msg.model };
    } catch (err) {
      throw this.normalize(err);
    }
  }

  async checkKey(model: string): Promise<void> {
    try {
      await this.client.messages.create({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      });
    } catch (err) {
      throw this.normalize(err);
    }
  }

  private normalize(err: unknown): ProviderError {
    if (err instanceof ProviderError) return err;
    const msg = redact(err instanceof Error ? err.message : String(err), [this.key]);
    if (err instanceof Anthropic.APIUserAbortError) return new ProviderError('aborted', msg);
    if (!(err instanceof Anthropic.APIError) && /structured output/i.test(msg))
      return new ProviderError('bad-output', "The model's answer didn't match the expected shape.");
    if (err instanceof Anthropic.APIConnectionError) return new ProviderError('network', msg);
    if (err instanceof Anthropic.AuthenticationError) return new ProviderError('invalid-key', msg, 401);
    if (err instanceof Anthropic.PermissionDeniedError) return new ProviderError('invalid-key', msg, 403);
    if (err instanceof Anthropic.RateLimitError) {
      const retry = Number(err.headers?.get?.('retry-after'));
      return new ProviderError('rate-limit', msg, 429, Number.isFinite(retry) ? retry : undefined);
    }
    if (err instanceof Anthropic.NotFoundError) return new ProviderError('not-found', msg, 404);
    if (err instanceof Anthropic.APIError) {
      const type = (err.error as { error?: { type?: string } } | undefined)?.error?.type;
      if (err.status === 402 || type === 'billing_error' || /credit balance/i.test(msg))
        return new ProviderError('no-credit', msg, err.status);
      if (err.status === 529 || type === 'overloaded_error') return new ProviderError('overloaded', msg, err.status);
      if (err.status && err.status >= 500) return new ProviderError('overloaded', msg, err.status);
      return new ProviderError('bad-request', msg, err.status);
    }
    return new ProviderError('unknown', msg);
  }
}

/** Parses model JSON and validates it, with a clear error when it doesn't fit. */
export function parseJson<T>(text: string, schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }): T {
  let raw: unknown;
  try {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    raw = JSON.parse(trimmed);
  } catch {
    throw new ProviderError('bad-output', 'The model returned something that is not JSON.');
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    const first = res.error?.issues[0];
    throw new ProviderError('bad-output', `The model's answer didn't match the expected shape (${first?.path.join('.')}: ${first?.message}).`);
  }
  return res.data as T;
}
