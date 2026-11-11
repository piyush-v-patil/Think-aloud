/**
 * Short references for every moment the models can cite: `u1`, `u2`... for
 * utterances (in time order) and `s1`, `s2`... for silences. Models cite
 * these plus an exact quote; code checks the quote against the moment.
 */
import type { CodeSnapshot, Language, TestRun, Utterance } from '../types';
import { formatClock, formatDuration } from '../time';
import type { Silence, TimingMetrics } from './metrics';

export interface MomentIndex {
  utterances: Map<string, Utterance>;
  silences: Map<string, Silence>;
  /** Reverse lookup: utterance id to short reference. */
  refOf: Map<string, string>;
  ordered: ({ ref: string; kind: 'utterance'; u: Utterance } | { ref: string; kind: 'silence'; s: Silence })[];
}

export function indexMoments(utterances: Utterance[], silences: Silence[]): MomentIndex {
  const sorted = [...utterances].sort((a, b) => a.t0 - b.t0);
  const index: MomentIndex = { utterances: new Map(), silences: new Map(), refOf: new Map(), ordered: [] };
  sorted.forEach((u, i) => {
    const ref = `u${i + 1}`;
    index.utterances.set(ref, u);
    index.refOf.set(u.id, ref);
  });
  for (const s of silences) index.silences.set(s.id, s);
  const items: MomentIndex['ordered'] = [
    ...[...index.utterances].map(([ref, u]) => ({ ref, kind: 'utterance' as const, u })),
    ...silences.map((s) => ({ ref: s.id, kind: 'silence' as const, s })),
  ];
  index.ordered = items.sort((a, b) => (a.kind === 'utterance' ? a.u.t0 : a.s.t0) - (b.kind === 'utterance' ? b.u.t0 : b.s.t0));
  return index;
}

export function formatMoment(m: MomentIndex['ordered'][number]): string {
  if (m.kind === 'utterance') {
    const who = m.u.speaker === 'user' ? 'Candidate' : 'Interviewer';
    return `[${m.ref} ${formatClock(m.u.t0)}] ${who}: "${m.u.text}"`;
  }
  const typed = m.s.codeDelta > 0 ? `, about ${m.s.codeDelta} characters of code changed meanwhile` : ', no code changes';
  return `[${m.ref} ${formatClock(m.s.t0)}] (${formatDuration(m.s.t1 - m.s.t0)} of silence${typed})`;
}

export function formatTranscript(index: MomentIndex): string {
  return index.ordered.map(formatMoment).join('\n');
}

export function formatMetrics(m: TimingMetrics): string {
  const phases = Object.entries(m.timePerPhaseMs)
    .filter(([, ms]) => ms > 0)
    .map(([p, ms]) => `${p} ${formatDuration(ms)}`)
    .join(', ');
  return [
    `Interview length: ${formatDuration(m.durationMs)}.`,
    `Candidate spoke for ${formatDuration(m.candidateSpeechMs)} (${m.candidateWords} words); the interviewer for ${formatDuration(m.interviewerSpeechMs)}.`,
    `Candidate speech to silence ratio: ${m.talkToSilenceRatio.toFixed(2)}.`,
    `Longest pause: ${formatDuration(m.longestPauseMs)}. Silences of 20 seconds or more: ${m.silences.length}.`,
    `Spoke before first typing: ${m.spokeBeforeTyping ? 'yes' : 'no'}${m.firstCodeChangeMs !== null ? ` (first code change at ${formatClock(m.firstCodeChangeMs)})` : ''}.`,
    phases ? `Time per phase: ${phases}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Code history condensed to a few snapshots so the prompt stays small. */
export function formatCodeHistory(code: CodeSnapshot[], language: Language, max = 6): string {
  if (code.length <= 1) return 'No code was written.';
  const picks = new Set<number>([code.length - 1]);
  const step = Math.max(1, Math.floor((code.length - 1) / (max - 1)));
  for (let i = 1; i < code.length - 1 && picks.size < max; i += step) picks.add(i);
  return [...picks]
    .sort((a, b) => a - b)
    .map((i) => `[${formatClock(code[i].t)}] Code${i === code.length - 1 ? ' (final)' : ''} (${language}):\n\`\`\`\n${code[i].code.trimEnd()}\n\`\`\``)
    .join('\n\n');
}

export function formatTests(runs: TestRun[]): string {
  if (!runs.length) return 'The candidate never ran the tests.';
  const lines = runs.map((r) => {
    if (r.error) return `[${formatClock(r.t)}] Run failed: ${r.error}`;
    if (!r.total) return `[${formatClock(r.t)}] Ran the code (no tests).`;
    const failed = r.results.filter((x) => !x.passed).map((x) => x.name);
    return `[${formatClock(r.t)}] ${r.passed} of ${r.total} passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.`;
  });
  return lines.join('\n');
}
