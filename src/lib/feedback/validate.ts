/**
 * The code check: every quoted piece of evidence must appear in the
 * candidate's own words in the transcript. Items that fail are dropped (or
 * sent back for repair). Arithmetic fixes, like making `level` agree with
 * `points`, happen here; judgments never do.
 */
import type { Evidence, Points, Reaction, ReactionLevel, Utterance } from '../types';
import { findQuote } from '../transcript/quotes';
import { newId } from '../id';
import type { MomentIndex } from './moments';
import type { ReactionOut } from './schemas';

export type Resolved =
  | { ok: true; t: number; utteranceId?: string; quote: string; silence?: { t0: number; t1: number } }
  | { ok: false; why: string };

/**
 * Resolves a model citation to a real moment. If the reference is wrong but
 * the quote appears verbatim in another candidate utterance, the citation is
 * corrected to that utterance; a quote found nowhere fails.
 */
export function resolveEvidence(ref: string, quote: string, index: MomentIndex): Resolved {
  const q = quote.trim();
  const silence = index.silences.get(ref.trim());
  if (silence && !q) return { ok: true, t: silence.t0, quote: '', silence: { t0: silence.t0, t1: silence.t1 } };
  if (!q) return { ok: false, why: 'empty quote for an utterance' };
  const own = index.utterances.get(ref.trim());
  const candidates: Utterance[] = [];
  if (own && own.speaker === 'user') candidates.push(own);
  for (const u of index.utterances.values()) if (u.speaker === 'user' && u !== own) candidates.push(u);
  for (const u of candidates) {
    const found = findQuote(u.text, q);
    if (found) {
      // Store the words exactly as they appear in the transcript.
      return { ok: true, t: u.t0, utteranceId: u.id, quote: u.text.slice(found.start, found.end) };
    }
  }
  const onlyInterviewer = [...index.utterances.values()].some((u) => u.speaker === 'interviewer' && findQuote(u.text, q));
  return { ok: false, why: onlyInterviewer ? "quote is the interviewer's words" : 'quote not found in the transcript' };
}

export function normalizePoints(points: number): Points {
  const p = Math.round(points);
  if (p >= 2) return 2;
  if (p === 1) return 1;
  if (p <= -1) return -1;
  return 0;
}

export function levelFor(points: Points): ReactionLevel {
  return points > 0 ? 'strong' : points < 0 ? 'negative' : 'neutral';
}

export interface ReactionCheck {
  kept: Reaction[];
  dropped: { item: ReactionOut; why: string }[];
}

export function validateReactions(raw: ReactionOut[], index: MomentIndex, origin: Reaction['origin']): ReactionCheck {
  const kept: Reaction[] = [];
  const dropped: ReactionCheck['dropped'] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const r = resolveEvidence(item.ref, item.quote, index);
    if (!r.ok) {
      dropped.push({ item, why: r.why });
      continue;
    }
    const points = normalizePoints(item.points);
    const key = `${r.utteranceId ?? r.silence?.t0}|${r.quote.toLowerCase()}|${item.category}`;
    if (seen.has(key)) {
      dropped.push({ item, why: 'duplicate' });
      continue;
    }
    seen.add(key);
    kept.push({
      id: newId('r-'),
      t: r.t,
      ...(r.utteranceId ? { utteranceId: r.utteranceId } : {}),
      quote: r.quote,
      ...(r.silence ? { silence: r.silence } : {}),
      category: item.category,
      level: levelFor(points),
      points,
      reason: item.reason.trim(),
      ...(points < 0 && item.sayInstead.trim() ? { sayInstead: item.sayInstead.trim() } : {}),
      origin,
    });
  }
  return { kept, dropped };
}

export function validateEvidence(items: { ref: string; quote: string }[], index: MomentIndex): { kept: Evidence[]; failed: number } {
  const kept: Evidence[] = [];
  let failed = 0;
  for (const e of items) {
    const r = resolveEvidence(e.ref, e.quote, index);
    if (r.ok && r.quote) kept.push({ quote: r.quote, t: r.t, ...(r.utteranceId ? { utteranceId: r.utteranceId } : {}) });
    else if (r.ok && r.silence) kept.push({ quote: '', t: r.t });
    else failed++;
  }
  return { kept, failed };
}

/**
 * Re-checks reactions made from one transcript against another (the more
 * accurate one transcribed after the session). Quotes that no longer appear
 * are dropped; the rest are re-anchored to the new utterances.
 */
export function revalidateReactions(reactions: Reaction[], index: MomentIndex): { kept: Reaction[]; dropped: Reaction[] } {
  const kept: Reaction[] = [];
  const dropped: Reaction[] = [];
  for (const r of reactions) {
    if (r.silence) {
      kept.push(r);
      continue;
    }
    // Look near the original time first by trying every user utterance.
    const res = resolveEvidence('', r.quote, index);
    if (res.ok) kept.push({ ...r, quote: res.quote, t: res.t, utteranceId: res.utteranceId });
    else dropped.push(r);
  }
  return { kept, dropped };
}
