import { describe, expect, it } from 'vitest';
import { indexMoments } from './moments';
import { resolveEvidence, revalidateReactions, validateEvidence, validateReactions, normalizePoints } from './validate';
import type { Utterance } from '../types';
import type { ReactionOut } from './schemas';

const u = (id: string, speaker: 'user' | 'interviewer', t0: number, text: string): Utterance => ({ id, speaker, t0, t1: t0 + 1000, text, source: 'browser' });

const utterances = [
  u('a', 'interviewer', 0, 'Can you tell me what the input looks like?'),
  u('b', 'user', 2000, 'Can the list be empty, and is it already sorted?'),
  u('c', 'user', 9000, 'I will use a hash map from weight to index.'),
];
const silences = [{ id: 's1', t0: 12_000, t1: 60_000, codeDelta: 140 }];
const index = indexMoments(utterances, silences);

const reaction = (over: Partial<ReactionOut>): ReactionOut => ({
  ref: 'u2',
  quote: 'Can the list be empty',
  category: 'clarification',
  level: 'strong',
  points: 2,
  reason: 'asked about empty input',
  sayInstead: '',
  ...over,
});

describe('resolveEvidence', () => {
  it('accepts an exact quote from the cited utterance and keeps the transcript wording', () => {
    const r = resolveEvidence('u2', 'can the list be EMPTY', index);
    expect(r).toMatchObject({ ok: true, utteranceId: 'b', t: 2000, quote: 'Can the list be empty' });
  });
  it('corrects a wrong reference when the quote is elsewhere in the candidate’s words', () => {
    expect(resolveEvidence('u2', 'hash map from weight', index)).toMatchObject({ ok: true, utteranceId: 'c' });
  });
  it('rejects paraphrases and invented quotes', () => {
    expect(resolveEvidence('u2', 'asked whether the list could be empty', index)).toMatchObject({ ok: false });
  });
  it('rejects quotes of the interviewer', () => {
    expect(resolveEvidence('u1', 'what the input looks like', index)).toEqual({ ok: false, why: "quote is the interviewer's words" });
  });
  it('accepts silences with an empty quote', () => {
    expect(resolveEvidence('s1', '', index)).toMatchObject({ ok: true, silence: { t0: 12_000, t1: 60_000 } });
    expect(resolveEvidence('u2', '', index)).toMatchObject({ ok: false });
  });
});

describe('validateReactions', () => {
  it('keeps supported reactions and drops the rest with reasons', () => {
    const { kept, dropped } = validateReactions(
      [
        reaction({}),
        reaction({ quote: 'something never said' }),
        reaction({ ref: 's1', quote: '', category: 'narration', level: 'negative', points: -1, reason: 'quiet while coding', sayInstead: 'Let me explain the loop as I write it.' }),
        reaction({}),
      ],
      index,
      'live',
    );
    expect(kept).toHaveLength(2);
    expect(kept[1]).toMatchObject({ silence: { t0: 12_000, t1: 60_000 }, points: -1, level: 'negative', sayInstead: 'Let me explain the loop as I write it.' });
    expect(dropped.map((d) => d.why)).toEqual(['quote not found in the transcript', 'duplicate']);
  });
  it('makes level agree with points and clamps points', () => {
    const { kept } = validateReactions([reaction({ points: 5, level: 'neutral' }), reaction({ quote: 'hash map', points: -3, level: 'strong', sayInstead: 'x' })], index, 'debrief');
    expect(kept.map((r) => [r.points, r.level])).toEqual([[2, 'strong'], [-1, 'negative']]);
  });
  it('only keeps "say instead" on negative reactions', () => {
    const { kept } = validateReactions([reaction({ sayInstead: 'not needed' })], index, 'live');
    expect(kept[0].sayInstead).toBeUndefined();
  });
});

describe('validateEvidence', () => {
  it('counts failures', () => {
    const r = validateEvidence([{ ref: 'u2', quote: 'already sorted' }, { ref: 'u3', quote: 'a binary tree' }], index);
    expect(r.kept).toHaveLength(1);
    expect(r.failed).toBe(1);
  });
});

describe('normalizePoints', () => {
  it('maps to the allowed values', () => {
    expect([3, 2, 1.4, 0.2, -0.4, -1, -7].map(normalizePoints)).toEqual([2, 2, 1, 0, 0, -1, -1]);
  });
});

describe('revalidateReactions', () => {
  it('re-anchors quotes to a second transcript and drops ones it no longer contains', () => {
    const live = validateReactions([reaction({}), reaction({ quote: 'hash map from weight', category: 'planning' })], index, 'live').kept;
    const accurate = indexMoments(
      [u('x', 'user', 2100, 'Can the list be empty? And is it already sorted?'), u('y', 'user', 9100, 'I will use a hashmap keyed by weight.')],
      [],
    );
    const { kept, dropped } = revalidateReactions(live, accurate);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ utteranceId: 'x', t: 2100 });
    expect(dropped[0].quote).toBe('hash map from weight');
  });
});
