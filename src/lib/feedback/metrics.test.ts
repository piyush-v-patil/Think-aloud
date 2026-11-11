import { describe, expect, it } from 'vitest';
import { codeDelta, computeMetrics } from './metrics';
import type { Utterance } from '../types';

const u = (id: string, speaker: 'user' | 'interviewer', t0: number, t1: number, text = 'words here'): Utterance => ({ id, speaker, t0, t1, text, source: 'browser' });

describe('computeMetrics', () => {
  const utterances = [
    u('u1', 'interviewer', 0, 5_000),
    u('u2', 'user', 6_000, 16_000, 'can the list be empty'),
    u('u3', 'user', 50_000, 60_000, 'so I will use a map'),
  ];
  const code = [
    { t: 0, code: '' },
    { t: 30_000, code: 'def f():\n    pass' },
    { t: 45_000, code: 'def f():\n    return 1' },
  ];
  const m = computeMetrics(utterances, code, [{ phase: 'clarify', t: 0 }, { phase: 'code', t: 20_000 }], 90_000);

  it('measures speech and silence', () => {
    expect(m.candidateSpeechMs).toBe(20_000);
    expect(m.interviewerSpeechMs).toBe(5_000);
    // Silent time = 90 - 20 - 5 = 65 seconds.
    expect(m.talkToSilenceRatio).toBeCloseTo(20 / 65);
    expect(m.longestPauseMs).toBe(34_000);
    expect(m.candidateWords).toBe(11);
  });
  it('lists long silences with how much code changed', () => {
    expect(m.silences.map((s) => [s.id, s.t0, s.t1])).toEqual([
      ['s1', 16_000, 50_000],
      ['s2', 60_000, 90_000],
    ]);
    expect(m.silences[0].codeDelta).toBeGreaterThan(10);
    expect(m.silences[0].afterUtteranceId).toBe('u2');
    expect(m.silences[1].codeDelta).toBe(0);
  });
  it('knows whether you spoke before typing', () => {
    expect(m.spokeBeforeTyping).toBe(true);
    expect(computeMetrics([u('u9', 'user', 40_000, 41_000)], code, [], 50_000).spokeBeforeTyping).toBe(false);
  });
  it('adds up time per phase', () => {
    expect(m.timePerPhaseMs.clarify).toBe(20_000);
    expect(m.timePerPhaseMs.code).toBe(70_000);
    expect(m.timePerPhaseMs.test).toBe(0);
  });
});

describe('codeDelta', () => {
  it('counts the changed span', () => {
    expect(codeDelta('abc', 'abc')).toBe(0);
    expect(codeDelta('abc', 'abXc')).toBe(1);
    expect(codeDelta('', 'hello')).toBe(5);
  });
});
