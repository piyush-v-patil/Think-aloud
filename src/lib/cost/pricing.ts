import type { ModelInfo, PriceSchedule, TokenPrices } from '../../config/providers/types';

export interface TokenUsage {
  /** Uncached input tokens (excluding cache reads and writes). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** The price schedule in effect on `date` (ISO yyyy-mm-dd). */
export function scheduleAt(model: ModelInfo, date: string): PriceSchedule | null {
  let current: PriceSchedule | null = null;
  for (const p of model.prices) {
    if (!p.from || p.from <= date) current = p;
  }
  return current;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Cost in USD of one request's usage. Long-context prices apply when the
 * request's total input exceeds the model's threshold. Null when the model
 * has no known prices (custom endpoint).
 */
export function costOfRequest(model: ModelInfo | undefined, usage: TokenUsage, date = todayIso()): number | null {
  return priceUsage(model, usage, date, true);
}

/**
 * Cost of usage summed over many requests, each below any long-context
 * threshold (true for every call this app makes during estimation).
 */
export function costOfAggregate(model: ModelInfo | undefined, usage: TokenUsage, date = todayIso()): number | null {
  return priceUsage(model, usage, date, false);
}

function priceUsage(model: ModelInfo | undefined, usage: TokenUsage, date: string, singleRequest: boolean): number | null {
  if (!model) return null;
  const schedule = scheduleAt(model, date);
  if (!schedule) return null;
  const totalInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const p: TokenPrices =
    singleRequest && schedule.longContext && totalInput > schedule.longContext.aboveInputTokens
      ? schedule.longContext
      : schedule;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(p.input) +
    usage.outputTokens * perToken(p.output) +
    usage.cacheReadTokens * perToken(p.cacheRead) +
    usage.cacheWriteTokens * perToken(p.cacheWrite ?? p.input)
  );
}

/** "$0.42" for normal amounts, "$0.004" for tiny ones, "less than $0.001" below that. */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.001) return 'less than $0.001';
  if (amount < 0.01) return '$' + amount.toFixed(3);
  return '$' + amount.toFixed(2);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1000) return `${Math.round(n / 1000)}k tokens`;
  return `${n} tokens`;
}
