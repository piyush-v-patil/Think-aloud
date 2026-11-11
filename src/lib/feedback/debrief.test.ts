import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyVerification, runDebrief, aggregate } from './debrief';
import type { AIProvider, JsonRequest } from '../ai/types';
import type { Problem, Reaction, Session, Utterance } from '../types';
import type { ScoringOut, VerificationOut } from './schemas';
import crate from '../../../problems/crate-pair.json';

const u = (id: string, speaker: 'user' | 'interviewer', t0: number, text: string): Utterance => ({ id, speaker, t0, t1: t0 + 3000, text, source: 'browser' });

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    createdAt: 0,
    endedAt: 600_000,
    problem: crate as unknown as Problem,
    language: 'python',
    persona: 'neutral',
    feedbackMode: 'realistic',
    plannedMinutes: 45,
    config: { provider: 'anthropic', preset: 'balanced', models: { interviewer: 'a', reactions: 'a', debrief: 'claude-opus-5-5' }, liveSpeechEngine: 'browser' },
    transcripts: {
      live: {
        engine: 'browser',
        utterances: [
          u('i1', 'interviewer', 0, 'Take a look at crate pairs and ask me anything.'),
          u('c1', 'user', 10_000, 'Can the weights be negative or zero?'),
          u('i2', 'interviewer', 15_000, 'Yes, they can.'),
          u('c2', 'user', 30_000, 'I will keep a hash map from weight to index so each lookup is constant time.'),
          u('c3', 'user', 200_000, 'Let me trace four nine two seven with capacity eleven.'),
        ],
      },
    },
    code: [
      { t: 0, code: 'def crate_pair(weights, capacity):\n    pass\n' },
      { t: 120_000, code: 'def crate_pair(weights, capacity):\n    seen = {}\n    return []\n' },
    ],
    testRuns: [{ t: 180_000, results: [], passed: 6, total: 6 }],
    phases: [{ phase: 'clarify', t: 0 }, { phase: 'code', t: 60_000 }],
    hintsGiven: [],
    reactions: [],
    missed: [],
    rerecords: [],
    usage: [],
    speechUsage: [],
    notices: [],
    ...over,
  };
}

const scoring: ScoringOut = {
  scores: [
    { category: 'clarification', score: 3, summary: 'Asked about negatives.', evidence: [{ ref: 'u2', quote: 'Can the weights be negative or zero' }] },
    { category: 'planning', score: 4, summary: 'Stated the hash map plan.', evidence: [{ ref: 'u4', quote: 'hash map from weight to index' }] },
    { category: 'reasoning', score: 3, summary: 'Explained constant-time lookups.', evidence: [{ ref: 'u4', quote: 'each lookup is constant time' }] },
    { category: 'narration', score: 2, summary: 'Silent while coding.', evidence: [{ ref: 's1', quote: '' }] },
    { category: 'testing', score: 3, summary: 'Traced an example.', evidence: [{ ref: 'u5', quote: 'trace four nine two seven' }] },
    { category: 'hint-handling', score: 3, summary: 'No hints needed.', evidence: [{ ref: 'u4', quote: 'I said something else entirely' }] },
  ],
  correctness: { summary: 'All tests pass.' },
  hireSignal: 'strong-yes',
  hireSummary: 'Clear and correct.',
  reactions: [
    { ref: 'u2', quote: 'Can the weights be negative', category: 'clarification', level: 'strong', points: 2, reason: 'asked about negative weights', sayInstead: '' },
    { ref: 's1', quote: '', category: 'narration', level: 'negative', points: -1, reason: 'quiet while writing the loop', sayInstead: 'I am adding each weight to the map after checking for its partner.' },
    { ref: 'u4', quote: 'a binary search tree', category: 'planning', level: 'strong', points: 2, reason: 'invented', sayInstead: '' },
    { ref: 'u4', quote: 'hash map from weight to index', category: 'planning', level: 'strong', points: 2, reason: 'stated the plan', sayInstead: '' },
  ],
  missed: [{ mentionId: 'space-tradeoff', what: 'Never mentioned the O(n) extra space', category: 'reasoning', ref: 'u4', sayInstead: 'This uses O of n extra space for the map.' }],
  notes: [
    { text: 'Asked about negative weights early.', ref: 'u2' },
    { text: 'Long silence while coding.', ref: 's1' },
  ],
  narrations: [
    { target: 'r1', text: 'Now I check whether the partner weight is already in the map, and only then add this one.' },
    { target: 'm0', text: 'The map costs O of n space, which I think is fine to get linear time.' },
  ],
};

const verification: VerificationOut = {
  items: [
    { id: 'S2', verdict: 'downgrade', newValue: 3, reason: 'Did not state complexity before coding.' },
    { id: 'S3', verdict: 'downgrade', newValue: 4, reason: 'Trying to raise: must be ignored.' },
    { id: 'R3', verdict: 'remove', newValue: 0, reason: 'Plan restated a question.' },
    { id: 'R1', verdict: 'downgrade', newValue: 1, reason: 'Partial.' },
  ],
  hireSignal: { verdict: 'downgrade', value: 'lean-yes', reason: 'Narration gaps.' },
};

function provider(): AIProvider & { calls: JsonRequest<unknown>[] } {
  const calls: JsonRequest<unknown>[] = [];
  return {
    id: 'anthropic',
    capabilities: { streaming: true, structuredOutput: true, promptCaching: 'explicit' },
    calls,
    async chat() {
      throw new Error('unused');
    },
    async json<T>(req: JsonRequest<T>) {
      calls.push(req as JsonRequest<unknown>);
      const data =
        req.schemaName === 'scoring'
          ? scoring
          : req.schemaName === 'evidence_repair'
            ? { scores: [{ category: 'hint-handling', evidence: [{ ref: 'u2', quote: 'negative or zero' }] }] }
            : verification;
      return { data: data as T, text: '', model: req.model, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
    async checkKey() {},
  };
}

describe('runDebrief', () => {
  it('scores, checks every quote, repairs missing evidence and applies verification', async () => {
    const p = provider();
    const roles: string[] = [];
    const out = await runDebrief(session(), { provider: p, model: 'claude-opus-5-5', record: (r) => roles.push(r) });
    const d = out.debrief!;

    expect(p.calls.map((c) => c.schemaName)).toEqual(['scoring', 'evidence_repair', 'verification']);
    expect(roles).toEqual(['debrief', 'debrief', 'verification']);
    // All three calls share the same cached system prefix.
    expect(JSON.stringify(p.calls[0].system)).toBe(JSON.stringify(p.calls[2].system));
    expect(p.calls[0].system[2].cache).toBe(true);
    expect(p.calls[0].system[2].text).toContain('[u2 00:10] Candidate: "Can the weights be negative or zero?"');
    expect(p.calls[0].system[2].text).toMatch(/\[s1 00:33\] \(2 minutes .* of silence, about \d+ characters of code changed/);

    // Every score has evidence that appears in the transcript.
    expect(d.scores).toHaveLength(6);
    for (const s of d.scores) expect(s.evidence.length).toBeGreaterThan(0);
    expect(d.scores.find((s) => s.category === 'hint-handling')!.evidence[0].quote).toBe('negative or zero');
    // Verification lowers, never raises.
    expect(d.scores.find((s) => s.category === 'planning')!.score).toBe(3);
    expect(d.scores.find((s) => s.category === 'reasoning')!.score).toBe(3);

    // The invented quote was dropped by the code check; R3 removed by verification.
    expect(out.reactions.map((r) => [r.reason, r.points])).toEqual([
      ['asked about negative weights', 1],
      ['quiet while writing the loop', -1],
    ]);
    expect(d.verification).toEqual({ removed: 2, downgraded: 3 });
    expect(d.hireSignal).toBe('lean-yes');
    expect(d.correctness).toMatchObject({ passed: 6, total: 6 });
    expect(out.missed).toHaveLength(1);
    expect(out.missed[0].t).toBe(30_000);
    expect(d.notes.map((n) => n.t)).toEqual([10_000, 33_000]);
    expect(d.narrations.map((n) => (n.reactionId ? 'reaction' : 'missed'))).toEqual(['reaction', 'missed']);
    expect(d.scoredOn).toBe('browser');
  });

  it('scores on the accurate transcript and drops live reactions it no longer supports', async () => {
    const live: Reaction[] = [
      { id: 'r-a', t: 10_000, utteranceId: 'c1', quote: 'negative or zero', category: 'clarification', level: 'strong', points: 2, reason: 'asked', origin: 'live' },
      { id: 'r-b', t: 30_000, utteranceId: 'c2', quote: 'hash map from weight', category: 'planning', level: 'strong', points: 1, reason: 'plan', origin: 'live' },
    ];
    const s = session({
      feedbackMode: 'training',
      reactions: live,
      transcripts: {
        live: session().transcripts.live,
        accurate: {
          engine: 'deepgram',
          utterances: [
            u('a1', 'user', 10_100, 'Can the weights be negative or zero?'),
            u('a2', 'user', 30_100, 'I will keep a hashmap keyed by weight so each lookup is constant time.'),
          ],
        },
      },
    });
    const p = provider();
    const out = await runDebrief(s, { provider: p, model: 'm', record: () => {} });
    expect(out.debrief!.scoredOn).toBe('deepgram');
    expect(p.calls[0].system[2].text).toContain('Transcribed by: deepgram');
    expect(out.notices).toContain('dropped-live:1');
    expect(out.reactions.find((r) => r.id === 'r-a')).toMatchObject({ utteranceId: 'a1', t: 10_100 });
    expect(out.reactions.find((r) => r.id === 'r-b')).toBeUndefined();
  });

  it('runs the tests on the final code when the candidate never ran them', async () => {
    const p = provider();
    const out = await runDebrief(session({ testRuns: [] }), {
      provider: p,
      model: 'm',
      record: () => {},
      runFinal: async () => ({ t: 0, results: [], passed: 2, total: 6 }),
    });
    expect(out.debrief!.correctness).toMatchObject({ passed: 2, total: 6 });
    expect(p.calls[0].system[2].text).toContain('Final code, tested after the interview: 2 of 6 tests passed');
  });
});

describe('applyVerification', () => {
  it('only lowers the hire signal', () => {
    const r = applyVerification(
      { items: [], hireSignal: { verdict: 'downgrade', value: 'strong-yes', reason: '' } },
      { scores: [], reactions: [], missed: [], notes: [], hire: 'lean-no' },
    );
    expect(r.hire).toBe('lean-no');
  });
});

describe('aggregate', () => {
  it('averages scores and finds the weakest category in code', () => {
    expect(aggregate([
      { category: 'planning', score: 4, summary: '', evidence: [] },
      { category: 'narration', score: 2, summary: '', evidence: [] },
    ])).toEqual({ average: 3, weakest: 'narration' });
  });
});
