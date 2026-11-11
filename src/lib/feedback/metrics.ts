/**
 * Timing metrics computed in code from timestamps. They are inputs to the
 * model, never reactions by themselves: a long silence can be fine if the
 * candidate announced it ("let me think for a moment").
 */
import type { CodeSnapshot, Phase, Utterance } from '../types';
import { PHASES } from '../types';

export interface Silence {
  id: string;
  t0: number;
  t1: number;
  /** Characters of code added or removed during the silence. */
  codeDelta: number;
  /** The last thing said before the silence, for context. */
  afterUtteranceId?: string;
}

export interface TimingMetrics {
  durationMs: number;
  /** Total time the candidate was speaking. */
  candidateSpeechMs: number;
  interviewerSpeechMs: number;
  /** Candidate speech divided by time when nobody was speaking. */
  talkToSilenceRatio: number;
  longestPauseMs: number;
  /** Silences of at least SILENCE_MIN_MS, with how much code changed meanwhile. */
  silences: Silence[];
  spokeBeforeTyping: boolean;
  firstSpeechMs: number | null;
  firstCodeChangeMs: number | null;
  timePerPhaseMs: Record<Phase, number>;
  candidateWords: number;
}

export const SILENCE_MIN_MS = 20_000;

/** Approximate characters changed between two versions of code. */
export function codeDelta(a: string, b: string): number {
  if (a === b) return 0;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return Math.max(endA - start, endB - start);
}

function codeAt(code: CodeSnapshot[], t: number): string {
  let current = code[0]?.code ?? '';
  for (const s of code) {
    if (s.t <= t) current = s.code;
    else break;
  }
  return current;
}

export function computeMetrics(
  utterances: Utterance[],
  code: CodeSnapshot[],
  phases: { phase: Phase; t: number }[],
  durationMs: number,
): TimingMetrics {
  const sorted = [...utterances].sort((a, b) => a.t0 - b.t0);
  const user = sorted.filter((u) => u.speaker === 'user');
  const span = (u: Utterance) => Math.max(0, u.t1 - u.t0);
  const candidateSpeechMs = user.reduce((s, u) => s + span(u), 0);
  const interviewerSpeechMs = sorted.filter((u) => u.speaker === 'interviewer').reduce((s, u) => s + span(u), 0);

  // Gaps when nobody was speaking.
  const silences: Silence[] = [];
  let cursor = 0;
  let lastId: string | undefined;
  let longestPauseMs = 0;
  const consider = (t0: number, t1: number) => {
    const gap = t1 - t0;
    longestPauseMs = Math.max(longestPauseMs, gap);
    if (gap >= SILENCE_MIN_MS) {
      silences.push({
        id: `s${silences.length + 1}`,
        t0,
        t1,
        codeDelta: codeDelta(codeAt(code, t0), codeAt(code, t1)),
        afterUtteranceId: lastId,
      });
    }
  };
  for (const u of sorted) {
    if (u.t0 > cursor) consider(cursor, u.t0);
    cursor = Math.max(cursor, u.t1);
    lastId = u.id;
  }
  if (durationMs > cursor) consider(cursor, durationMs);
  const silentMs = Math.max(1, durationMs - candidateSpeechMs - interviewerSpeechMs);

  const firstSpeech = user[0]?.t0 ?? null;
  const firstChange = code.find((s, i) => i > 0 && s.code !== code[0].code)?.t ?? null;

  const timePerPhaseMs = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>;
  const ordered = [...phases].sort((a, b) => a.t - b.t);
  ordered.forEach((p, i) => {
    const end = ordered[i + 1]?.t ?? durationMs;
    timePerPhaseMs[p.phase] += Math.max(0, end - p.t);
  });

  return {
    durationMs,
    candidateSpeechMs,
    interviewerSpeechMs,
    talkToSilenceRatio: candidateSpeechMs / silentMs,
    longestPauseMs,
    silences,
    spokeBeforeTyping: firstSpeech !== null && (firstChange === null || firstSpeech < firstChange),
    firstSpeechMs: firstSpeech,
    firstCodeChangeMs: firstChange,
    timePerPhaseMs,
    candidateWords: user.reduce((n, u) => n + u.text.split(/\s+/).filter(Boolean).length, 0),
  };
}
