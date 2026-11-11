import { describe, expect, it } from 'vitest';
import { audioSecToSession, buildMarkers, codeAt, peaks, phaseSegments, sessionToAudioSec, snapshotIndexAt, utteranceAt } from './sync';
import type { Utterance } from '../types';

describe('timeline sync', () => {
  it('converts between audio time and the session clock both ways', () => {
    expect(sessionToAudioSec(12_500, 500)).toBe(12);
    expect(audioSecToSession(12, 500)).toBe(12_500);
    expect(sessionToAudioSec(100, 500)).toBe(0);
    for (const t of [0, 1234, 999_999]) expect(audioSecToSession(sessionToAudioSec(t + 700, 700), 700)).toBe(t + 700);
  });
  const code = [
    { t: 0, code: 'a' },
    { t: 10_000, code: 'ab' },
    { t: 20_000, code: 'abc' },
  ];
  it('shows the code as it was at any moment', () => {
    expect(codeAt(code, -5)).toBe('a');
    expect(codeAt(code, 9_999)).toBe('a');
    expect(codeAt(code, 10_000)).toBe('ab');
    expect(codeAt(code, 15_000)).toBe('ab');
    expect(codeAt(code, 99_000)).toBe('abc');
    expect(snapshotIndexAt([], 5)).toBe(-1);
  });
  it('finds the utterance at a moment', () => {
    const us = [
      { id: 'a', t0: 1000 },
      { id: 'b', t0: 5000 },
    ] as Utterance[];
    expect(utteranceAt(us, 500)).toBeNull();
    expect(utteranceAt(us, 4999)!.id).toBe('a');
    expect(utteranceAt(us, 6000)!.id).toBe('b');
  });
  it('turns phase changes into ruled segments, merging repeats', () => {
    expect(
      phaseSegments(
        [
          { phase: 'clarify', t: 0 },
          { phase: 'plan', t: 60_000 },
          { phase: 'plan', t: 90_000 },
          { phase: 'code', t: 120_000 },
        ],
        300_000,
      ),
    ).toEqual([
      { phase: 'clarify', t0: 0, t1: 60_000 },
      { phase: 'plan', t0: 60_000, t1: 120_000 },
      { phase: 'code', t0: 120_000, t1: 300_000 },
    ]);
  });
  it('orders markers by time', () => {
    const m = buildMarkers({
      reactions: [{ id: 'r', t: 5000, level: 'negative' } as never],
      missed: [{ id: 'm', t: 1000 } as never],
      silences: [{ id: 's1', t0: 3000, t1: 40_000, codeDelta: 0 }],
      utterances: [{ id: 'i', speaker: 'interviewer', t0: 0 } as Utterance],
      describe: { reaction: () => 'r', missed: () => 'm', silence: () => 's', interviewer: () => 'i' },
    });
    expect(m.map((x) => [x.kind, x.t])).toEqual([
      ['interviewer', 0],
      ['missed', 1000],
      ['silence', 3000],
      ['negative', 5000],
    ]);
  });
  it('computes normalized waveform peaks', () => {
    const s = new Float32Array([0, 0.1, -0.5, 0.25, 0, 0.05]);
    peaks(s, 3).forEach((v, i) => expect(v).toBeCloseTo([0.2, 1, 0.1][i], 5));
    expect(peaks(new Float32Array(), 10)).toEqual([]);
  });
});
