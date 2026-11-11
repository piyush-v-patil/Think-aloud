/**
 * One interface for every AI provider. Prompts are split into a stable,
 * cacheable prefix (system blocks, earlier turns) and a changing tail, so
 * providers with prompt caching only pay full price for the new turn.
 */
import type { z } from 'zod';
import type { ProviderId } from '../types';
import type { TokenUsage } from '../cost/pricing';

export type Effort = 'low' | 'medium' | 'high';

export interface PromptBlock {
  text: string;
  /** End a cached prefix after this block. */
  cache?: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** End a cached prefix after this turn. */
  cache?: boolean;
}

export interface ChatRequest {
  model: string;
  system: PromptBlock[];
  turns: ChatTurn[];
  maxTokens: number;
  effort?: Effort;
  signal?: AbortSignal;
  /** Streaming: called with the full text so far as it arrives. */
  onText?: (textSoFar: string) => void;
}

export interface JsonRequest<T> extends Omit<ChatRequest, 'onText'> {
  schema: z.ZodType<T>;
  schemaName: string;
}

export interface ChatResult {
  text: string;
  usage: TokenUsage;
  /** The model that actually answered (may differ after a provider-side fallback). */
  model: string;
}

export interface JsonResult<T> extends ChatResult {
  data: T;
}

export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  /** "explicit": we mark cache breakpoints. "automatic": the provider caches prefixes itself. */
  promptCaching: 'explicit' | 'automatic' | 'none';
}

export interface AIProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;
  chat(req: ChatRequest): Promise<ChatResult>;
  json<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
  /** A minimal real call that proves the key works and has credit. Throws ProviderError. */
  checkKey(model: string): Promise<void>;
}
