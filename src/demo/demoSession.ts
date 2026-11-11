/**
 * The seeded demo session: a written example interview so the replay,
 * timeline and feedback can be explored without a key. Every quote in the
 * feedback appears in this transcript (a test checks it).
 */
import type { Problem, Reaction, Session, Utterance } from '../lib/types';
import problemJson from '../../problems/merge-bookings.json';

const S = 1000;
let n = 0;
const said = (speaker: 'user' | 'interviewer', at: number, secs: number, text: string): Utterance => ({
  id: `demo-u${++n}`,
  speaker,
  t0: at * S,
  t1: (at + secs) * S,
  text,
  source: speaker === 'user' ? 'browser' : 'model',
});

const U = [
  said('interviewer', 2, 9, "Hi, thanks for joining. Today's problem is about merging room bookings. Have a read, and ask me anything before you start."),
  said('user', 40, 8, 'Okay, so I get a list of start and end pairs. Are they sorted by start time already, or could they be in any order?'),
  said('interviewer', 50, 3, 'They can be in any order.'),
  said('user', 58, 7, 'And if one booking ends at four and the next one starts at four, do those count as overlapping?'),
  said('interviewer', 67, 4, 'Yes, touching bookings should be merged.'),
  said('user', 76, 3, 'Got it. Can the list be empty?'),
  said('interviewer', 81, 2, 'It can.'),
  said('user', 96, 12, "Okay. My first thought is to compare every pair and merge whenever two overlap, but that's quadratic and it gets fiddly because merging can create new overlaps."),
  said('user', 112, 13, "If I sort by start time first, then a booking can only overlap the last one I merged, so one pass after the sort is enough. That's n log n for the sort."),
  said('interviewer', 128, 2, 'Sounds good. Go ahead.'),
  said('user', 196, 11, 'Okay so for start end in sorted bookings, if out and start less than or equal to out minus one one, then out minus one one equals end, else append.'),
  said('interviewer', 212, 4, 'What happens if one booking sits completely inside another one?'),
  said('user', 222, 12, "Hmm. Like one to ten and two to three. I'd set the end to three... oh, that's wrong, it should stay ten. I need the max of the two ends."),
  said('user', 238, 3, 'Let me fix that to take the max.'),
  said('user', 262, 22, "Let me trace the example. Nine to eleven, one to four, three to six, eleven to twelve. Sorted, it's one four, three six, nine eleven, eleven twelve. Three six overlaps, so one six. Nine eleven is new. Eleven twelve touches, so nine twelve."),
  said('interviewer', 300, 4, "All tests pass. What's the time and space complexity?"),
  said('user', 309, 6, 'Sorting is n log n, and the sweep is linear, so n log n overall.'),
  said('interviewer', 318, 1, 'And space?'),
  said('user', 323, 5, "Um, it's... I guess the output list."),
  said('interviewer', 333, 7, 'Okay. If bookings arrived one at a time, how would you insert a new one into an already merged list?'),
  said('user', 346, 9, "I'd binary search for where it starts, then merge with neighbors while they overlap."),
  said('interviewer', 362, 4, "Good. That's all the time we have. Thanks."),
];
const id = (i: number) => U[i].id;

const buggy = `def merge_bookings(bookings):
    out = []
    for start, end in sorted(bookings):
        if out and start <= out[-1][1]:
            out[-1][1] = end
        else:
            out.append([start, end])
    return out
`;
const fixed = buggy.replace('out[-1][1] = end', 'out[-1][1] = max(out[-1][1], end)');

const reactions: Reaction[] = [
  { id: 'demo-r1', t: 40 * S, utteranceId: id(1), quote: 'Are they sorted by start time already, or could they be in any order', category: 'clarification', level: 'strong', points: 2, reason: 'asked whether the input is sorted', origin: 'live', verified: true },
  { id: 'demo-r2', t: 58 * S, utteranceId: id(3), quote: 'do those count as overlapping', category: 'clarification', level: 'strong', points: 2, reason: 'asked how touching bookings are handled', origin: 'live', verified: true },
  { id: 'demo-r3', t: 96 * S, utteranceId: id(7), quote: "compare every pair and merge whenever two overlap, but that's quadratic", category: 'planning', level: 'strong', points: 1, reason: 'named the brute force and its cost before choosing', origin: 'live', verified: true },
  { id: 'demo-r4', t: 112 * S, utteranceId: id(8), quote: 'a booking can only overlap the last one I merged', category: 'reasoning', level: 'strong', points: 2, reason: 'explained why sorting makes one pass enough', origin: 'live', verified: true },
  {
    id: 'demo-r5', t: 130 * S, quote: '', silence: { t0: 130 * S, t1: 196 * S }, category: 'narration', level: 'negative', points: -1,
    reason: 'quiet for a minute while writing the merge loop',
    sayInstead: "I'm writing the sweep now: if this booking starts before the last merged one ends, I extend it; otherwise I start a new one.",
    origin: 'live', verified: true,
  },
  { id: 'demo-r6', t: 196 * S, utteranceId: id(10), quote: 'if out and start less than or equal to out minus one one', category: 'narration', level: 'neutral', points: 0, reason: 'read the code aloud instead of saying why', origin: 'live', verified: true },
  { id: 'demo-r7', t: 222 * S, utteranceId: id(12), quote: "oh, that's wrong, it should stay ten", category: 'hint-handling', level: 'strong', points: 2, reason: 'used the challenge to find your own bug', origin: 'live', verified: true },
  { id: 'demo-r8', t: 262 * S, utteranceId: id(14), quote: 'Let me trace the example', category: 'testing', level: 'strong', points: 2, reason: 'traced the example aloud before running tests', origin: 'live', verified: true },
  {
    id: 'demo-r9', t: 323 * S, utteranceId: id(18), quote: 'I guess the output list', category: 'reasoning', level: 'negative', points: -1,
    reason: 'unsure about space, which left the interviewer guessing',
    sayInstead: 'Extra space is O of n for the output, plus what the sort needs, which is O of n in Python.',
    origin: 'live', verified: true,
  },
];

export function demoSession(): Session {
  const problem = problemJson as unknown as Problem;
  return {
    id: 'demo',
    demo: true,
    createdAt: Date.UTC(2026, 10, 9, 15, 0, 0),
    endedAt: Date.UTC(2026, 10, 9, 15, 6, 10),
    problem,
    language: 'python',
    persona: 'neutral',
    feedbackMode: 'training',
    plannedMinutes: 45,
    config: {
      provider: 'anthropic',
      preset: 'balanced',
      models: { interviewer: 'claude-sonnet-5-5', reactions: 'claude-sonnet-5-5', debrief: 'claude-opus-5-5' },
      liveSpeechEngine: 'browser',
    },
    transcripts: { live: { engine: 'browser', utterances: U } },
    code: [
      { t: 0, code: problem.starterCode.python },
      { t: 140 * S, code: 'def merge_bookings(bookings):\n    out = []\n    for start, end in sorted(bookings):\n' },
      { t: 175 * S, code: buggy },
      { t: 241 * S, code: fixed },
    ],
    testRuns: [{ t: 290 * S, results: problem.tests.map((t) => ({ name: t.name, passed: true, hidden: t.hidden })), passed: problem.tests.length, total: problem.tests.length }],
    phases: [
      { phase: 'clarify', t: 0 },
      { phase: 'plan', t: 96 * S },
      { phase: 'code', t: 130 * S },
      { phase: 'test', t: 262 * S },
      { phase: 'wrap-up', t: 300 * S },
    ],
    hintsGiven: [],
    reactions,
    missed: [
      {
        id: 'demo-m1', mentionId: 'trace-contained', what: 'testing the empty list out loud', category: 'testing', t: 284 * S,
        sayInstead: 'And for an empty list the loop never runs, so I return an empty list.',
      },
    ],
    debrief: {
      scores: [
        { category: 'clarification', score: 4, summary: 'You asked about ordering, touching bookings and the empty list before planning.', evidence: [{ quote: 'Are they sorted by start time already, or could they be in any order', t: 40 * S, utteranceId: id(1) }, { quote: 'Can the list be empty', t: 76 * S, utteranceId: id(5) }] },
        { category: 'planning', score: 3, summary: 'You named the quadratic baseline and the sort-and-sweep plan with its cost before coding.', evidence: [{ quote: "that's quadratic", t: 96 * S, utteranceId: id(7) }, { quote: "That's n log n for the sort", t: 112 * S, utteranceId: id(8) }] },
        { category: 'reasoning', score: 3, summary: 'Clear about why sorting works; unsure about space when asked.', evidence: [{ quote: 'a booking can only overlap the last one I merged', t: 112 * S, utteranceId: id(8) }, { quote: 'I guess the output list', t: 323 * S, utteranceId: id(18) }] },
        { category: 'narration', score: 2, summary: 'A minute of silence while writing the loop, then reading code aloud rather than explaining it.', evidence: [{ quote: '', t: 130 * S }, { quote: 'if out and start less than or equal to out minus one one', t: 196 * S, utteranceId: id(10) }] },
        { category: 'testing', score: 3, summary: 'You traced the example aloud before running tests, but never checked the empty list out loud.', evidence: [{ quote: 'Let me trace the example', t: 262 * S, utteranceId: id(14) }] },
        { category: 'hint-handling', score: 4, summary: 'You turned the containment challenge into finding and fixing your own bug.', evidence: [{ quote: "oh, that's wrong, it should stay ten", t: 222 * S, utteranceId: id(12) }] },
      ],
      correctness: { passed: problem.tests.length, total: problem.tests.length, summary: 'The final code merges correctly and passes every test, including contained and touching bookings.' },
      hireSignal: 'lean-yes',
      hireSummary: 'Strong clarifying questions and a well-reasoned plan; narration while coding and the space answer were the weak spots.',
      notes: [
        { text: 'Asked about ordering and touching bookings before proposing anything.', t: 40 * S },
        { text: 'Explained why sorting reduces the problem to one sweep.', t: 112 * S },
        { text: 'Went quiet for about a minute while writing the loop.', t: 130 * S },
        { text: 'Found the contained-booking bug after one question and fixed it.', t: 222 * S },
        { text: 'Unsure about space complexity when asked directly.', t: 323 * S },
        { text: 'Handled the follow-up with a reasonable binary search idea.', t: 346 * S },
      ],
      narrations: [
        { reactionId: 'demo-r5', t: 130 * S, text: "I'll write the sweep now. I keep a list of merged bookings. For each booking in sorted order, if it starts before the last merged one ends, I extend that one's end; otherwise I start a new merged booking." },
        { reactionId: 'demo-r9', t: 323 * S, text: 'Extra space is O of n for the merged output in the worst case, when nothing overlaps. Sorting in Python also uses O of n. If I could sort in place and reuse the input, I could reduce that.' },
        { missedId: 'demo-m1', t: 284 * S, text: 'Let me also check the edge cases. For an empty list, the loop never runs and I return an empty list. For one booking inside another, the max keeps the larger end.' },
      ],
      scoredOn: 'browser',
      verification: { removed: 2, downgraded: 1 },
      createdAt: Date.UTC(2026, 10, 9, 15, 7, 0),
    },
    rerecords: [],
    usage: [
      { t: 360 * S, role: 'interviewer', provider: 'anthropic', model: 'claude-sonnet-5-5', inputTokens: 5200, outputTokens: 2100, cacheReadTokens: 98_000, cacheWriteTokens: 9800, costUsd: 0.0656 },
      { t: 360 * S, role: 'reactions', provider: 'anthropic', model: 'claude-sonnet-5-5', inputTokens: 3800, outputTokens: 2400, cacheReadTokens: 61_000, cacheWriteTokens: 8100, costUsd: 0.0594 },
      { t: 370 * S, role: 'debrief', provider: 'anthropic', model: 'claude-opus-5-5', inputTokens: 700, outputTokens: 5600, cacheReadTokens: 0, cacheWriteTokens: 11_200, costUsd: 0.1708 },
      { t: 380 * S, role: 'verification', provider: 'anthropic', model: 'claude-opus-5-5', inputTokens: 3900, outputTokens: 1900, cacheReadTokens: 11_200, cacheWriteTokens: 0, costUsd: 0.0558 },
    ],
    speechUsage: [],
    notices: [],
  };
}
