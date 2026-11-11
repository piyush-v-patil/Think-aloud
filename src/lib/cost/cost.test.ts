import { describe, expect, it } from 'vitest';
import { anthropic } from '../../config/providers/anthropic';
import { gemini } from '../../config/providers/gemini';
import { customProvider, findModel, modelsFor } from '../../config/providers';
import { costOfRequest, formatUsd, scheduleAt } from './pricing';
import { actualCost, estimateSession, simulateLiveCalls, speechCost } from './estimate';
import type { Session, UsageRecord } from '../types';

const sonnet = findModel(anthropic, 'claude-sonnet-5-5')!;
const haiku = findModel(anthropic, 'claude-haiku-5-5')!;

describe('costOfRequest', () => {
  it('prices each token class separately', () => {
    // 1M of each class on Sonnet 5.5: 2 + 10 + 0.10 + 2.50
    const usd = costOfRequest(sonnet, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(14.6, 6);
  });
  it('uses long-context prices above the threshold', () => {
    const small = costOfRequest(haiku, { inputTokens: 50_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const large = costOfRequest(haiku, { inputTokens: 150_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(small).toBeCloseTo(0.005, 9);
    expect(large).toBeCloseTo(0.075, 9);
  });
  it('picks the dated price in effect', () => {
    const argon = findModel(gemini, 'gemini-4-argon')!;
    expect(scheduleAt(argon, '2026-11-30')!.input).toBe(2);
    expect(scheduleAt(argon, '2026-12-01')!.input).toBe(4);
  });
  it('returns null without prices', () => {
    const custom = customProvider({ baseUrl: 'http://localhost:11434/v1', models: { small: 'llama', mid: '', top: '' } });
    expect(costOfRequest(findModel(custom, 'llama'), { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
    expect(costOfRequest(undefined, { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
  });
});

describe('formatUsd', () => {
  it('shows small amounts precisely', () => {
    expect(formatUsd(0.4249)).toBe('$0.42');
    expect(formatUsd(0.0042)).toBe('$0.004');
    expect(formatUsd(0.0000001)).toBe('less than $0.001');
  });
});

describe('simulateLiveCalls', () => {
  it('reads the previous prefix from cache and writes only the growth', () => {
    const cached = simulateLiveCalls(10, 10, 100, true);
    const uncached = simulateLiveCalls(10, 10, 100, false);
    expect(cached.outputTokens).toBe(1000);
    expect(cached.cacheReadTokens).toBeGreaterThan(0);
    // Every prefix token is written once and read on later calls.
    expect(cached.cacheReadTokens + cached.cacheWriteTokens + cached.inputTokens).toBe(uncached.inputTokens);
  });
});

describe('estimateSession', () => {
  const base = {
    provider: anthropic,
    feedbackMode: 'training' as const,
    minutes: 45,
    needsAnalysis: false,
    speech: { liveEngine: 'browser' as const },
  };
  it('orders presets by cost', () => {
    const cost = (preset: 'economy' | 'balanced' | 'best') =>
      estimateSession({ ...base, models: modelsFor(anthropic, preset, {}) }).totalUsd!;
    expect(cost('economy')).toBeLessThan(cost('balanced'));
    expect(cost('balanced')).toBeLessThan(cost('best'));
    expect(cost('balanced')).toBeGreaterThan(0.2);
    expect(cost('balanced')).toBeLessThan(3);
  });
  it('skips live reactions in Realistic mode but grows the debrief', () => {
    const models = modelsFor(anthropic, 'balanced', {});
    const training = estimateSession({ ...base, models });
    const realistic = estimateSession({ ...base, models, feedbackMode: 'realistic' });
    expect(realistic.byRole.reactions.usd).toBe(0);
    expect(realistic.byRole.debrief.usage.outputTokens).toBeGreaterThan(training.byRole.debrief.usage.outputTokens);
  });
  it('adds the analysis cost for pasted problems', () => {
    const models = modelsFor(anthropic, 'balanced', {});
    expect(estimateSession({ ...base, models, needsAnalysis: true }).byRole.analysis.usd).toBeGreaterThan(0);
  });
  it('scales with session length', () => {
    const models = modelsFor(anthropic, 'balanced', {});
    expect(estimateSession({ ...base, models, minutes: 60 }).totalUsd!).toBeGreaterThan(estimateSession({ ...base, models, minutes: 30 }).totalUsd!);
  });
  it('switches to your own averages after 3 sessions', () => {
    const models = modelsFor(anthropic, 'balanced', {});
    const record = (role: UsageRecord['role'], output: number): UsageRecord => ({
      t: 0, role, provider: 'anthropic', model: 'claude-sonnet-5-5',
      inputTokens: 1000, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01,
    });
    const session = (i: number) =>
      ({
        id: String(i), createdAt: 0, endedAt: 30 * 60_000, feedbackMode: 'training',
        usage: [record('interviewer', 3000), record('reactions', 2000), record('debrief', 5000)],
        speechUsage: [],
      }) as unknown as Session;
    const est = estimateSession({ ...base, models, minutes: 30, history: [session(1), session(2), session(3)] });
    expect(est.basis).toBe('history');
    expect(est.byRole.interviewer.usage.outputTokens).toBe(3000);
    expect(estimateSession({ ...base, models, history: [session(1)] }).basis).toBe('model');
  });
  it('shows null totals for an endpoint without prices', () => {
    const custom = customProvider({ baseUrl: 'x', models: { small: 'a', mid: 'b', top: 'c' } });
    const est = estimateSession({ ...base, provider: custom, models: modelsFor(custom, 'balanced', {}) });
    expect(est.totalUsd).toBeNull();
    expect(est.byRole.interviewer.usage.outputTokens).toBeGreaterThan(0);
  });
});

describe('speech cost', () => {
  it('charges nothing for free engines and per minute for paid ones', () => {
    expect(speechCost(45, 'browser')).toBe(0);
    expect(speechCost(45, 'browser', 'openai', false)).toBeCloseTo(45 * 0.006, 9);
    expect(speechCost(10, 'deepgram', undefined, true)).toBeCloseTo(10 * (0.0077 + 0.0013), 9);
  });
});

describe('actualCost', () => {
  it('sums reported usage by role with speech on its own line', () => {
    const usage: UsageRecord[] = [
      { t: 1, role: 'interviewer', provider: 'anthropic', model: 'm', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.1 },
      { t: 2, role: 'verification', provider: 'anthropic', model: 'm', inputTokens: 1, outputTokens: 1, cacheReadTokens: 5, cacheWriteTokens: 0, costUsd: 0.2 },
      { t: 3, role: 'debrief', provider: 'anthropic', model: 'm', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.3 },
    ];
    const c = actualCost({ usage, speechUsage: [{ engine: 'openai', purpose: 'accurate', seconds: 60, costUsd: 0.05 }] });
    expect(c.byRole.interviewer).toBeCloseTo(0.1);
    expect(c.byRole.debrief).toBeCloseTo(0.5);
    expect(c.speechUsd).toBeCloseTo(0.05);
    expect(c.totalUsd).toBeCloseTo(0.65);
    expect(c.tokens.debrief.cacheReadTokens).toBe(5);
  });
  it('is null when any call had unknown prices', () => {
    const c = actualCost({
      usage: [{ t: 1, role: 'interviewer', provider: 'custom', model: 'm', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null }],
      speechUsage: [],
    });
    expect(c.totalUsd).toBeNull();
  });
});
