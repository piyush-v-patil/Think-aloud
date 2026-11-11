/**
 * Cost estimate before a session, and actual cost after one.
 *
 * Before: simulate the calls each role makes using the usage model in
 * config (or, with 3+ past sessions, the user's own per-minute averages),
 * then price the tokens with the selected models. After: sum the usage the
 * API reported on every call.
 */
import { USAGE_MODEL } from '../../config/usageModel';
import { SPEECH_ENGINES } from '../../config/speech';
import type { ProviderConfig, RoleModels } from '../../config/providers/types';
import { findModel } from '../../config/providers';
import type { FeedbackMode, ModelRole, Session, SpeechEngineId, UsageRecord } from '../types';
import { addUsage, costOfAggregate, ZERO_USAGE, type TokenUsage } from './pricing';

export type CostRole = ModelRole | 'analysis';

export interface Estimate {
  /** Total in USD, or null when any model's prices are unknown. */
  totalUsd: number | null;
  byRole: Record<CostRole, { usage: TokenUsage; usd: number | null }>;
  speechUsd: number;
  /** "model": from the usage model in config. "history": from your own sessions. */
  basis: 'model' | 'history';
  basedOnSessions: number;
}

export interface EstimateInput {
  provider: ProviderConfig;
  models: RoleModels;
  feedbackMode: FeedbackMode;
  minutes: number;
  /** True when the problem must be prepared first (pasted or a new variation). */
  needsAnalysis: boolean;
  speech: { liveEngine: SpeechEngineId; accurateEngine?: SpeechEngineId; keywordHints?: boolean };
  history?: Session[];
}

const M = USAGE_MODEL;

/** Tokens for `calls` calls spread evenly over `minutes`, each reading the growing transcript. */
export function simulateLiveCalls(
  calls: number,
  minutes: number,
  outputPerCall: number,
  caching: boolean,
): TokenUsage {
  let usage = ZERO_USAGE;
  let cachedSoFar = 0;
  const n = Math.max(0, Math.round(calls));
  for (let k = 0; k < n; k++) {
    const minute = ((k + 0.5) / n) * minutes;
    const prefix = M.basePrefixTokens + M.transcriptTokensPerMinute * minute;
    if (caching) {
      const write = Math.max(0, prefix - cachedSoFar);
      usage = addUsage(usage, {
        inputTokens: M.perCallUncachedTokens,
        outputTokens: outputPerCall,
        cacheReadTokens: cachedSoFar,
        cacheWriteTokens: write,
      });
      cachedSoFar = prefix;
    } else {
      usage = addUsage(usage, {
        inputTokens: prefix + M.perCallUncachedTokens,
        outputTokens: outputPerCall,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    }
  }
  return usage;
}

export function modelUsage(input: Pick<EstimateInput, 'feedbackMode' | 'minutes' | 'needsAnalysis'>, caching: boolean) {
  const { minutes, feedbackMode } = input;
  const interviewer = simulateLiveCalls(M.interviewer.callsPerMinute * minutes, minutes, M.interviewer.outputTokensPerCall, caching);
  let reactions = ZERO_USAGE;
  if (feedbackMode === 'training') {
    reactions = simulateLiveCalls(M.reactions.trainingCallsPerMinute * minutes, minutes, M.reactions.trainingOutputTokensPerCall, caching);
  } else if (feedbackMode === 'delayed') {
    reactions = simulateLiveCalls(M.reactions.delayedCalls, minutes, M.reactions.delayedOutputTokensPerCall, caching);
  }
  // Debrief: a scoring call, then a verification call that shares its prefix.
  const prefix = M.basePrefixTokens + M.transcriptTokensPerMinute * minutes + M.debrief.codeHistoryTokens;
  const scoringOut =
    M.debrief.scoringOutputTokens + (feedbackMode === 'realistic' ? M.debrief.realisticExtraOutputTokens : 0);
  const scoring: TokenUsage = caching
    ? { inputTokens: 600, outputTokens: scoringOut, cacheReadTokens: 0, cacheWriteTokens: prefix }
    : { inputTokens: prefix + 600, outputTokens: scoringOut, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const verification: TokenUsage = caching
    ? { inputTokens: scoringOut + 600, outputTokens: M.debrief.verificationOutputTokens, cacheReadTokens: prefix, cacheWriteTokens: 0 }
    : { inputTokens: prefix + scoringOut + 600, outputTokens: M.debrief.verificationOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const debrief = addUsage(scoring, verification);
  const analysis: TokenUsage = input.needsAnalysis
    ? { inputTokens: M.analysis.inputTokens, outputTokens: M.analysis.outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 }
    : ZERO_USAGE;
  return { interviewer, reactions, debrief, analysis };
}

const ROLE_OF: Record<UsageRecord['role'], CostRole> = {
  interviewer: 'interviewer',
  reactions: 'reactions',
  debrief: 'debrief',
  verification: 'debrief',
  rerecord: 'debrief',
  analysis: 'analysis',
};

/** Per-minute token averages per role from past sessions with the same feedback mode. */
export function historyUsage(sessions: Session[], input: Pick<EstimateInput, 'feedbackMode' | 'minutes' | 'needsAnalysis'>) {
  const relevant = sessions.filter((s) => !s.demo && s.endedAt && s.usage.length && s.feedbackMode === input.feedbackMode);
  if (relevant.length < 3) return null;
  const totals: Record<CostRole, TokenUsage> = {
    interviewer: ZERO_USAGE,
    reactions: ZERO_USAGE,
    debrief: ZERO_USAGE,
    analysis: ZERO_USAGE,
  };
  let minutes = 0;
  for (const s of relevant) {
    minutes += Math.max(1, (s.endedAt! - s.createdAt) / 60_000);
    for (const u of s.usage) {
      const role = ROLE_OF[u.role];
      if (role === 'analysis') continue;
      totals[role] = addUsage(totals[role], u);
    }
  }
  const scale = (u: TokenUsage, f: number): TokenUsage => ({
    inputTokens: Math.round(u.inputTokens * f),
    outputTokens: Math.round(u.outputTokens * f),
    cacheReadTokens: Math.round(u.cacheReadTokens * f),
    cacheWriteTokens: Math.round(u.cacheWriteTokens * f),
  });
  const perMinute = input.minutes / minutes;
  const fromModel = modelUsage(input, true);
  return {
    usage: {
      interviewer: scale(totals.interviewer, perMinute),
      reactions: scale(totals.reactions, perMinute),
      // The debrief doesn't scale linearly with length; use its average per session.
      debrief: scale(totals.debrief, 1 / relevant.length),
      analysis: fromModel.analysis,
    },
    count: relevant.length,
  };
}

export function speechCost(minutes: number, liveEngine: SpeechEngineId, accurateEngine?: SpeechEngineId, keywordHints = true): number {
  let usd = 0;
  const live = SPEECH_ENGINES[liveEngine];
  if (live.paid) usd += minutes * ((live.livePerMinute ?? 0) + (keywordHints ? (live.keywordHintsPerMinute ?? 0) : 0));
  if (accurateEngine) {
    const acc = SPEECH_ENGINES[accurateEngine];
    if (acc.paid) usd += minutes * ((acc.filePerMinute ?? 0) + (keywordHints ? (acc.keywordHintsPerMinute ?? 0) : 0));
  }
  return usd;
}

export function estimateSession(input: EstimateInput): Estimate {
  const caching = input.provider.promptCaching !== 'none';
  const fromHistory = input.history ? historyUsage(input.history, input) : null;
  const usage = fromHistory?.usage ?? modelUsage(input, caching);
  const roles: CostRole[] = ['interviewer', 'reactions', 'debrief', 'analysis'];
  const modelFor: Record<CostRole, string> = { ...input.models, analysis: input.models.debrief };
  const byRole = {} as Estimate['byRole'];
  let total: number | null = 0;
  for (const role of roles) {
    const u = usage[role];
    const empty = u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens === 0;
    const usd = empty ? 0 : costOfAggregate(findModel(input.provider, modelFor[role]), u);
    byRole[role] = { usage: u, usd };
    total = total === null || usd === null ? null : total + usd;
  }
  const speechUsd = speechCost(input.minutes, input.speech.liveEngine, input.speech.accurateEngine, input.speech.keywordHints);
  return {
    totalUsd: total === null ? null : total + speechUsd,
    byRole,
    speechUsd,
    basis: fromHistory ? 'history' : 'model',
    basedOnSessions: fromHistory?.count ?? 0,
  };
}

/** Actual cost of a finished session from the usage the APIs reported. */
export function actualCost(session: Pick<Session, 'usage' | 'speechUsage'>) {
  const byRole: Record<CostRole, number | null> = { interviewer: 0, reactions: 0, debrief: 0, analysis: 0 };
  const tokens: Record<CostRole, TokenUsage> = {
    interviewer: ZERO_USAGE,
    reactions: ZERO_USAGE,
    debrief: ZERO_USAGE,
    analysis: ZERO_USAGE,
  };
  for (const u of session.usage) {
    const role = ROLE_OF[u.role];
    tokens[role] = addUsage(tokens[role], u);
    const prev = byRole[role];
    byRole[role] = prev === null || u.costUsd === null ? null : prev + u.costUsd;
  }
  const speechUsd = session.speechUsage.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  const ai = Object.values(byRole).reduce<number | null>((sum, v) => (sum === null || v === null ? null : sum + v), 0);
  return {
    aiUsd: ai,
    speechUsd,
    totalUsd: ai === null ? null : ai + speechUsd,
    byRole,
    tokens,
  };
}
