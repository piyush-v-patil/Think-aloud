/** History arithmetic, all in code: spend, trends, weakest area, what to try next. */
import type { RubricCategory, Session } from '../types';
import { RUBRIC } from '../types';
import { actualCost } from '../cost/estimate';
import type { BankEntry } from '../problems/bank';

export function scored(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.debrief && !s.demo).sort((a, b) => a.createdAt - b.createdAt);
}

export interface Spend {
  weekUsd: number;
  monthUsd: number;
  /** Sessions whose cost is unknown (custom endpoint without prices). */
  unknown: number;
}

export function spend(sessions: Session[], now = Date.now()): Spend {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const weekStart = now - 7 * 24 * 3600_000;
  let weekUsd = 0;
  let monthUsd = 0;
  let unknown = 0;
  for (const s of sessions) {
    if (s.demo) continue;
    const c = actualCost(s).totalUsd;
    if (c === null) {
      unknown++;
      continue;
    }
    if (s.createdAt >= weekStart) weekUsd += c;
    if (s.createdAt >= monthStart) monthUsd += c;
  }
  return { weekUsd, monthUsd, unknown };
}

export type LimitState = 'none' | 'ok' | 'near' | 'over';

export function limitState(monthUsd: number, limit: number | null): LimitState {
  if (!limit || limit <= 0) return 'none';
  if (monthUsd >= limit) return 'over';
  if (monthUsd >= limit * 0.8) return 'near';
  return 'ok';
}

export interface TrendPoint {
  sessionId: string;
  t: number;
  score: number;
  configKey: string;
}

/** A label for what produced a score, so model changes can be marked on charts. */
export function configKey(s: Session): string {
  const accurate = s.transcripts.accurate?.engine ?? s.config.liveSpeechEngine;
  return `${s.config.provider} ${s.config.preset} ${s.config.models.debrief} ${accurate}`;
}

export function trends(sessions: Session[]): Record<RubricCategory, TrendPoint[]> {
  const out = Object.fromEntries(RUBRIC.map((c) => [c, [] as TrendPoint[]])) as Record<RubricCategory, TrendPoint[]>;
  for (const s of scored(sessions)) {
    for (const sc of s.debrief!.scores) out[sc.category].push({ sessionId: s.id, t: s.createdAt, score: sc.score, configKey: configKey(s) });
  }
  return out;
}

/** Indexes (into the scored list) where the scoring setup changed from the session before. */
export function configChanges(sessions: Session[]): number[] {
  const list = scored(sessions);
  return list.map((s, i) => (i > 0 && configKey(s) !== configKey(list[i - 1]) ? i : -1)).filter((i) => i > 0);
}

/** Lowest average over the most recent sessions; null with no scored sessions. */
export function weakest(sessions: Session[], recent = 5): RubricCategory | null {
  const list = scored(sessions).slice(-recent);
  if (!list.length) return null;
  let best: { c: RubricCategory; avg: number } | null = null;
  for (const c of RUBRIC) {
    const vals = list.flatMap((s) => s.debrief!.scores.filter((x) => x.category === c).map((x) => x.score));
    if (!vals.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!best || avg < best.avg) best = { c, avg };
  }
  return best?.c ?? null;
}

/**
 * A problem to try next: one not practiced yet, preferring medium ones, and
 * among those, the one whose analysis expects the most from the weakest area.
 */
export function suggestNext(bank: BankEntry[], done: Set<string>, focus: RubricCategory | null): BankEntry | null {
  const fresh = bank.filter((p) => !done.has(p.id));
  const pool = fresh.length ? fresh : bank;
  if (!pool.length) return null;
  const score = (p: BankEntry) =>
    (focus ? (p.mentions ?? []).filter((c) => c === focus).length * 2 : 0) + (p.difficulty === 'medium' ? 1 : 0);
  return [...pool].sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title))[0];
}
