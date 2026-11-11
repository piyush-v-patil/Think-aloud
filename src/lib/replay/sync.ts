/**
 * Keeps audio, code and transcript in step during replay. Everything is on
 * the session clock (ms since the interview started); the recording started
 * at `offsetMs` on that clock.
 */
import type { CodeSnapshot, MissedOpportunity, Phase, Reaction, Utterance } from '../types';
import type { Silence } from '../feedback/metrics';

export function sessionToAudioSec(t: number, offsetMs: number): number {
  return Math.max(0, (t - offsetMs) / 1000);
}

export function audioSecToSession(sec: number, offsetMs: number): number {
  return Math.round(sec * 1000 + offsetMs);
}

/** Index of the last snapshot at or before t (binary search). */
export function snapshotIndexAt(code: CodeSnapshot[], t: number): number {
  let lo = 0;
  let hi = code.length - 1;
  if (hi < 0) return -1;
  if (t < code[0].t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (code[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function codeAt(code: CodeSnapshot[], t: number): string {
  const i = snapshotIndexAt(code, t);
  return i < 0 ? '' : code[i].code;
}

/** The utterance being spoken at t, or the last one before it. */
export function utteranceAt(utterances: Utterance[], t: number): Utterance | null {
  let found: Utterance | null = null;
  for (const u of utterances) {
    if (u.t0 <= t) found = u;
    else break;
  }
  return found;
}

export interface PhaseSegment {
  phase: Phase;
  t0: number;
  t1: number;
}

export function phaseSegments(phases: { phase: Phase; t: number }[], durationMs: number): PhaseSegment[] {
  const sorted = [...phases].sort((a, b) => a.t - b.t);
  const out: PhaseSegment[] = [];
  sorted.forEach((p, i) => {
    const t1 = i + 1 < sorted.length ? sorted[i + 1].t : durationMs;
    if (t1 <= p.t) return;
    const prev = out[out.length - 1];
    if (prev && prev.phase === p.phase) prev.t1 = t1;
    else out.push({ phase: p.phase, t0: p.t, t1 });
  });
  return out;
}

export type MarkerKind = 'strong' | 'neutral' | 'negative' | 'missed' | 'silence' | 'interviewer';

export interface Marker {
  id: string;
  t: number;
  /** End time for spans (silences). */
  t1?: number;
  kind: MarkerKind;
  label: string;
}

export function buildMarkers(opts: {
  reactions: Reaction[];
  missed: MissedOpportunity[];
  silences: Silence[];
  utterances: Utterance[];
  describe: {
    reaction: (r: Reaction) => string;
    missed: (m: MissedOpportunity) => string;
    silence: (s: Silence) => string;
    interviewer: (u: Utterance) => string;
  };
}): Marker[] {
  const markers: Marker[] = [
    ...opts.silences.map((s) => ({ id: `silence-${s.t0}`, t: s.t0, t1: s.t1, kind: 'silence' as const, label: opts.describe.silence(s) })),
    ...opts.utterances
      .filter((u) => u.speaker === 'interviewer')
      .map((u) => ({ id: u.id, t: u.t0, kind: 'interviewer' as const, label: opts.describe.interviewer(u) })),
    ...opts.reactions.map((r) => ({ id: r.id, t: r.t, kind: r.level, label: opts.describe.reaction(r) })),
    ...opts.missed.map((m) => ({ id: m.id, t: m.t, kind: 'missed' as const, label: opts.describe.missed(m) })),
  ];
  return markers.sort((a, b) => a.t - b.t);
}

/** Peak amplitude per bucket, 0..1, for drawing a waveform. */
export function peaks(samples: Float32Array, buckets: number): number[] {
  if (!samples.length || buckets <= 0) return [];
  const size = samples.length / buckets;
  const out: number[] = [];
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = Math.floor(b * size);
    const end = Math.min(samples.length, Math.floor((b + 1) * size));
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out.push(peak);
    max = Math.max(max, peak);
  }
  return max ? out.map((p) => p / max) : out;
}
