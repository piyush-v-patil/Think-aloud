/**
 * The replay pipeline, run after the interview:
 *   1. Scoring call (structured): full transcript, code history, real test
 *      results, timing metrics, the analysis.
 *   2. Code check: every quote must appear in the candidate's words.
 *      Scores left without evidence get one repair call; failures drop.
 *   3. Verification call: an independent pass that removes or downgrades
 *      anything the evidence doesn't support.
 * The scoring and verification calls share a cached prefix (rules,
 * problem, session material), so the second call reads it from cache.
 */
import type { AIProvider, PromptBlock } from '../ai/types';
import type { TokenUsage } from '../cost/pricing';
import type {
  Debrief,
  HireSignal,
  InterviewerNote,
  MissedOpportunity,
  Narration,
  Reaction,
  RubricCategory,
  RubricScore,
  Session,
  TestRun,
  Transcript,
  UsageRecord,
} from '../types';
import { RUBRIC } from '../types';
import { fill, prompt } from '../prompts';
import { problemBrief } from '../interview/log';
import { newId } from '../id';
import { computeMetrics, type TimingMetrics } from './metrics';
import { formatCodeHistory, formatMetrics, formatTests, formatTranscript, indexMoments, type MomentIndex } from './moments';
import { repairOut, scoringOut, verificationOut, type ScoringOut, type VerificationOut } from './schemas';
import { normalizePoints, levelFor, revalidateReactions, validateEvidence, validateReactions } from './validate';
import { formatClock } from '../time';

export type DebriefStage = 'scoring' | 'checking' | 'verifying' | 'done';

export interface DebriefDeps {
  provider: AIProvider;
  model: string;
  record: (role: UsageRecord['role'], model: string, usage: TokenUsage) => void;
  /** Runs the tests on the final code when the candidate never did. */
  runFinal?: (session: Session) => Promise<TestRun | null>;
  onStage?: (stage: DebriefStage) => void;
  signal?: AbortSignal;
}

const HIRE_ORDER: HireSignal[] = ['strong-no', 'lean-no', 'lean-yes', 'strong-yes'];

export function scoringTranscript(session: Session): Transcript {
  return session.transcripts.accurate ?? session.transcripts.live;
}

export function durationOf(session: Session): number {
  const lastCode = session.code[session.code.length - 1]?.t ?? 0;
  const lastUtt = Math.max(0, ...session.transcripts.live.utterances.map((u) => u.t1));
  const wall = session.endedAt ? session.endedAt - session.createdAt : 0;
  return Math.max(wall, lastCode, lastUtt);
}

/** The material both calls read, as one cacheable block. */
export function sessionMaterial(session: Session, index: MomentIndex, metrics: TimingMetrics, finalRun: TestRun | null): string {
  const live = session.reactions.filter((r) => r.origin !== 'debrief');
  return [
    '# Transcript',
    `Transcribed by: ${scoringTranscript(session).engine}. References: u = utterance, s = silence.`,
    formatTranscript(index),
    '# Code history',
    formatCodeHistory(session.code, session.language),
    '# Test runs',
    formatTests(session.testRuns),
    finalRun ? `Final code, tested after the interview: ${finalRun.error ? `failed to run (${finalRun.error})` : `${finalRun.passed} of ${finalRun.total} tests passed`}.` : '',
    '# Timing (computed from timestamps)',
    formatMetrics(metrics),
    '# Hints the interviewer gave',
    session.hintsGiven.length ? session.hintsGiven.map((h) => `[${formatClock(h.t)}] hint rung ${h.level}`).join('\n') : 'None.',
    '# Feedback already shown during the interview',
    live.length
      ? live
          .map((r, i) => `L${i}: [${r.utteranceId ? index.refOf.get(r.utteranceId) : r.silence ? 'silence' : '?'}] ${r.points > 0 ? '+' : ''}${r.points} ${r.category}: ${r.reason}${r.quote ? ` ("${r.quote}")` : ''}`)
          .join('\n')
      : 'None.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function reactionsInstruction(session: Session): string {
  const live = session.reactions.filter((r) => r.origin !== 'debrief').length;
  if (session.feedbackMode === 'realistic' || live === 0) {
    return 'No feedback was shown during the interview. Write the reactions for the whole interview now: one for each notable moment, good or bad, typically 8 to 20. Follow the rules for points, evidence and what to say instead.';
  }
  return `${live} reactions were already shown during the interview (listed as L0, L1, ...). Add reactions only for notable moments they missed, without repeating them. Narrations may also target negative live reactions as L0, L1, ...`;
}

function locate(ref: string, index: MomentIndex): number | null {
  const u = index.utterances.get(ref.trim());
  if (u) return u.t0;
  const s = index.silences.get(ref.trim());
  return s ? s.t0 : null;
}

export async function runDebrief(input: Session, deps: DebriefDeps): Promise<Session> {
  const session: Session = structuredClone(input);
  const transcript = scoringTranscript(session);

  // Live reactions came from the live transcript; re-check them against the
  // accurate one before anything is shown.
  if (session.transcripts.accurate) {
    const idx = indexMoments(session.transcripts.accurate.utterances, []);
    const live = session.reactions.filter((r) => r.origin !== 'debrief');
    const { kept, dropped } = revalidateReactions(live, idx);
    session.reactions = kept;
    if (dropped.length) session.notices.push(`dropped-live:${dropped.length}`);
  }

  const duration = durationOf(session);
  const metrics = computeMetrics(transcript.utterances, session.code, session.phases, duration);
  const index = indexMoments(transcript.utterances, metrics.silences);

  let finalRun: TestRun | null = null;
  const last = session.testRuns[session.testRuns.length - 1];
  const finalCode = session.code[session.code.length - 1]?.code;
  const lastRunIsFinal = last && session.code.filter((c) => c.t > last.t).every((c) => c.code === finalCode) && session.code.some((c) => c.t <= last.t && c.code === finalCode);
  if (!lastRunIsFinal && deps.runFinal) finalRun = await deps.runFinal(session);
  const correctnessRun = finalRun ?? last ?? null;

  const system: PromptBlock[] = [
    { text: prompt('feedback-rules') },
    { text: problemBrief(session.problem) },
    { text: sessionMaterial(session, index, metrics, finalRun), cache: true },
  ];

  // 1. Scoring
  deps.onStage?.('scoring');
  const scoring = await deps.provider.json({
    model: deps.model,
    system,
    turns: [{ role: 'user', text: fill(prompt('scoring'), { reactionsInstruction: reactionsInstruction(session) }) }],
    maxTokens: 32000,
    effort: 'high',
    schema: scoringOut,
    schemaName: 'scoring',
    signal: deps.signal,
  });
  deps.record('debrief', scoring.model, scoring.usage);
  const out = scoring.data;

  // 2. Code check
  deps.onStage?.('checking');
  const liveReactions = session.reactions.filter((r) => r.origin !== 'debrief');
  const checked = validateReactions(out.reactions, index, 'debrief');
  // Map each surviving scorer reaction back to its index for narrations.
  const byOriginal = new Map<number, Reaction>();
  {
    let k = 0;
    out.reactions.forEach((raw, i) => {
      const r = checked.kept[k];
      if (r && r.category === raw.category && r.reason === raw.reason.trim()) {
        byOriginal.set(i, r);
        k++;
      }
    });
  }
  let scores = buildScores(out, index);
  const missingEvidence = RUBRIC.filter((c) => !scores.some((s) => s.category === c && s.evidence.length));
  if (missingEvidence.length) {
    const repair = await deps.provider.json({
      model: deps.model,
      system,
      turns: [
        {
          role: 'user',
          text:
            `Your scores for these categories had no evidence that could be found in the transcript: ${missingEvidence.join(', ')}. ` +
            'For each, give one to three pieces of evidence: a moment reference and the candidate’s exact words copied from that line (or an s reference with an empty quote for a silence). Copy the words exactly.',
        },
      ],
      maxTokens: 4000,
      effort: 'medium',
      schema: repairOut,
      schemaName: 'evidence_repair',
      signal: deps.signal,
    });
    deps.record('debrief', repair.model, repair.usage);
    scores = scores.map((s) => {
      if (s.evidence.length) return s;
      const fix = repair.data.scores.find((r) => r.category === s.category);
      return fix ? { ...s, evidence: validateEvidence(fix.evidence, index).kept } : s;
    });
  }
  const unsupported = scores.filter((s) => !s.evidence.length).map((s) => s.category);
  scores = scores.filter((s) => s.evidence.length);

  const missed: MissedOpportunity[] = out.missed
    .map((m): MissedOpportunity | null => {
      const t = locate(m.ref, index);
      return t === null || !m.sayInstead.trim()
        ? null
        : { id: newId('m-'), mentionId: m.mentionId, what: m.what.trim(), category: m.category, t, sayInstead: m.sayInstead.trim() };
    })
    .filter((m): m is MissedOpportunity => m !== null);
  const missedByIndex = new Map(out.missed.map((m, i) => [i, missed.find((x) => x.mentionId === m.mentionId && x.what === m.what.trim())]));

  const notes: InterviewerNote[] = out.notes
    .map((n) => {
      const t = locate(n.ref, index);
      return t === null ? null : { text: n.text.trim(), t };
    })
    .filter((n): n is InterviewerNote => n !== null);

  // 3. Verification
  deps.onStage?.('verifying');
  const allReactions = [...liveReactions, ...checked.kept];
  const verifyText = verificationItems(scores, allReactions, missed, notes, out, index);
  const verification = await deps.provider.json({
    model: deps.model,
    system,
    turns: [{ role: 'user', text: `${prompt('verification')}\n\n# Items to verify\n${verifyText}` }],
    maxTokens: 12000,
    effort: 'medium',
    schema: verificationOut,
    schemaName: 'verification',
    signal: deps.signal,
  });
  deps.record('verification', verification.model, verification.usage);
  const applied = applyVerification(verification.data, { scores, reactions: allReactions, missed, notes, hire: out.hireSignal });

  const narrations: Narration[] = [];
  for (const n of out.narrations) {
    const m = /^([rLm])(\d+)$/.exec(n.target.trim());
    if (!m || !n.text.trim()) continue;
    const i = Number(m[2]);
    const r = m[1] === 'r' ? byOriginal.get(i) : m[1] === 'L' ? liveReactions[i] : undefined;
    const mo = m[1] === 'm' ? missedByIndex.get(i) : undefined;
    if (r && applied.reactions.some((x) => x.id === r.id)) narrations.push({ reactionId: r.id, t: r.t, text: n.text.trim() });
    if (mo && applied.missed.some((x) => x.id === mo.id)) narrations.push({ missedId: mo.id, t: mo.t, text: n.text.trim() });
  }

  const passed = correctnessRun?.passed ?? 0;
  const total = correctnessRun?.total ?? session.problem.tests.length;
  const debrief: Debrief = {
    scores: applied.scores,
    correctness: { passed, total, summary: out.correctness.summary.trim() },
    hireSignal: applied.hire,
    hireSummary: out.hireSummary.trim(),
    notes: applied.notes,
    narrations,
    scoredOn: scoringTranscript(session).engine,
    verification: { removed: applied.removed + checked.dropped.length, downgraded: applied.downgraded },
    createdAt: Date.now(),
  };
  if (unsupported.length) session.notices.push(`unscored:${unsupported.join(',')}`);
  session.reactions = applied.reactions.sort((a, b) => a.t - b.t);
  session.missed = applied.missed.sort((a, b) => a.t - b.t);
  session.debrief = debrief;
  if (finalRun) session.testRuns = [...session.testRuns, { ...finalRun, t: duration }];
  deps.onStage?.('done');
  return session;
}

function buildScores(out: ScoringOut, index: MomentIndex): RubricScore[] {
  const seen = new Set<RubricCategory>();
  const scores: RubricScore[] = [];
  for (const s of out.scores) {
    if (seen.has(s.category)) continue;
    seen.add(s.category);
    const score = Math.min(4, Math.max(1, Math.round(s.score))) as RubricScore['score'];
    scores.push({ category: s.category, score, summary: s.summary.trim(), evidence: validateEvidence(s.evidence, index).kept });
  }
  for (const c of RUBRIC) if (!seen.has(c)) scores.push({ category: c, score: 1, summary: '', evidence: [] });
  return RUBRIC.map((c) => scores.find((s) => s.category === c)!);
}

export function verificationItems(
  scores: RubricScore[],
  reactions: Reaction[],
  missed: MissedOpportunity[],
  notes: InterviewerNote[],
  out: Pick<ScoringOut, 'hireSignal' | 'hireSummary' | 'correctness'>,
  index: MomentIndex,
): string {
  const ref = (utteranceId?: string, t?: number) =>
    utteranceId ? index.refOf.get(utteranceId) : t !== undefined ? `at ${formatClock(t)}` : '';
  return [
    ...scores.map((s, i) => `S${i + 1}: ${s.category} scored ${s.score} of 4. "${s.summary}" Evidence: ${s.evidence.map((e) => `${ref(e.utteranceId, e.t)} "${e.quote}"`).join('; ')}`),
    ...reactions.map((r, i) => `R${i + 1}: ${r.points > 0 ? '+' : ''}${r.points} ${r.category}: ${r.reason}. Evidence: ${r.silence ? `silence at ${formatClock(r.t)}` : `${ref(r.utteranceId)} "${r.quote}"`}`),
    ...missed.map((m, i) => `M${i + 1}: missed (${m.category}): ${m.what}`),
    ...notes.map((n, i) => `N${i + 1}: note at ${formatClock(n.t)}: ${n.text}`),
    `Hire signal: ${out.hireSignal}. ${out.hireSummary}`,
    `Correctness: ${out.correctness.summary}`,
  ].join('\n');
}

export function applyVerification(
  v: VerificationOut,
  items: { scores: RubricScore[]; reactions: Reaction[]; missed: MissedOpportunity[]; notes: InterviewerNote[]; hire: HireSignal },
) {
  let removed = 0;
  let downgraded = 0;
  const verdict = (id: string) => v.items.find((x) => x.id.trim().toUpperCase() === id);

  const scores = items.scores.map((s, i) => {
    const d = verdict(`S${i + 1}`);
    // A score can only be lowered, never removed: the category stays visible.
    if (d && d.verdict !== 'keep') {
      const lowered = Math.max(1, Math.min(s.score - (d.verdict === 'remove' ? 1 : 0), Math.round(d.newValue) || s.score));
      if (lowered < s.score) {
        downgraded++;
        return { ...s, score: lowered as RubricScore['score'] };
      }
    }
    return s;
  });

  const reactions: Reaction[] = [];
  items.reactions.forEach((r, i) => {
    const d = verdict(`R${i + 1}`);
    if (d?.verdict === 'remove') {
      removed++;
      return;
    }
    if (d?.verdict === 'downgrade') {
      const next = normalizePoints(d.newValue);
      // Downgrade moves toward zero only.
      if (Math.abs(next) < Math.abs(r.points) && Math.sign(next) !== -Math.sign(r.points)) {
        downgraded++;
        reactions.push({ ...r, points: next, level: levelFor(next), verified: true, ...(next < 0 ? {} : { sayInstead: undefined }) });
        return;
      }
    }
    reactions.push({ ...r, verified: true });
  });

  const keepIf = <T>(list: T[], prefix: string) =>
    list.filter((_, i) => {
      const gone = verdict(`${prefix}${i + 1}`)?.verdict === 'remove';
      if (gone) removed++;
      return !gone;
    });

  let hire = items.hire;
  if (v.hireSignal.verdict === 'downgrade' && HIRE_ORDER.indexOf(v.hireSignal.value) < HIRE_ORDER.indexOf(hire)) {
    hire = v.hireSignal.value;
    downgraded++;
  }
  return { scores, reactions, missed: keepIf(items.missed, 'M'), notes: keepIf(items.notes, 'N'), hire, removed, downgraded };
}

/** Rubric aggregation, in code: the average score and the weakest category. */
export function aggregate(scores: RubricScore[]): { average: number | null; weakest: RubricCategory | null } {
  if (!scores.length) return { average: null, weakest: null };
  const average = scores.reduce((s, x) => s + x.score, 0) / scores.length;
  const weakest = [...scores].sort((a, b) => a.score - b.score)[0].category;
  return { average, weakest };
}
