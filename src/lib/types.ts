/**
 * Core data model. Every timestamp in a session (`t`, `t0`, `t1`) is
 * milliseconds since the session started, so transcript, code, tests and
 * audio share one clock.
 */

export type Language = 'python' | 'javascript' | 'java';
export const LANGUAGES: Language[] = ['python', 'javascript', 'java'];

/** Code per language. Java was added later, so problems saved before it don't have it. */
export type CodeByLanguage = { python: string; javascript: string; java?: string };

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Topic =
  | 'arrays-hashing'
  | 'two-pointers'
  | 'sliding-window'
  | 'stack'
  | 'binary-search'
  | 'linked-list'
  | 'trees'
  | 'graphs'
  | 'heaps'
  | 'intervals'
  | 'backtracking'
  | 'dynamic-programming';

export const TOPICS: Topic[] = [
  'arrays-hashing',
  'two-pointers',
  'sliding-window',
  'stack',
  'binary-search',
  'linked-list',
  'trees',
  'graphs',
  'heaps',
  'intervals',
  'backtracking',
  'dynamic-programming',
];

/**
 * Value types the test harness knows how to convert between JSON and each
 * language. Linked lists and trees are written in tests as arrays
 * (trees in level order with nulls).
 */
export type ValueType =
  | 'int'
  | 'float'
  | 'bool'
  | 'string'
  | 'int[]'
  | 'float[]'
  | 'string[]'
  | 'bool[]'
  | 'int[][]'
  | 'string[][]'
  | 'ListNode'
  | 'TreeNode'
  | 'any';

/** How a test compares the returned value with the expected value. */
export type CompareMode =
  | 'exact'
  /** Top-level order does not matter (e.g. "return all pairs in any order"). */
  | 'unordered'
  /** Order does not matter at the top level or inside each inner list. */
  | 'unordered-deep'
  /** Numbers within 1e-5. */
  | 'float';

export interface TestCase {
  /** Plain-language name, e.g. "empty input". */
  name: string;
  /** Positional arguments, as JSON. */
  args: unknown[];
  expected: unknown;
  compare?: CompareMode;
  /** Hidden tests run when you press Run but their inputs are not shown until the debrief. */
  hidden?: boolean;
}

export interface FunctionSignature {
  name: string;
  params: { name: string; type: ValueType }[];
  returns: ValueType;
}

export interface ClarifyingQuestion {
  question: string;
  /** What the interviewer answers if asked. */
  answer: string;
  /** Why a strong candidate asks it. */
  why: string;
}

export interface Approach {
  name: string;
  idea: string;
  time: string;
  space: string;
  tradeoffs: string;
}

export type Phase = 'clarify' | 'plan' | 'code' | 'test' | 'wrap-up';
export const PHASES: Phase[] = ['clarify', 'plan', 'code', 'test', 'wrap-up'];

export type RubricCategory =
  | 'clarification'
  | 'planning'
  | 'reasoning'
  | 'narration'
  | 'testing'
  | 'hint-handling';

export const RUBRIC: RubricCategory[] = [
  'clarification',
  'planning',
  'reasoning',
  'narration',
  'testing',
  'hint-handling',
];

/** Something the analysis expects a strong candidate to say. Used for missed-opportunity markers. */
export interface ExpectedMention {
  id: string;
  what: string;
  category: RubricCategory;
}

export interface WalkthroughStep {
  phase: Phase;
  /** What a strong candidate says aloud at this point. */
  say: string;
  /** Code written during this step, if any. */
  code?: string;
}

export interface ProblemAnalysis {
  clarifyingQuestions: ClarifyingQuestion[];
  /** Facts the interviewer only reveals when asked. */
  hiddenConstraints: string[];
  edgeCases: { input: string; why: string }[];
  approaches: Approach[];
  optimal: { name: string; explanation: string; time: string; space: string };
  /** From vague to specific. */
  hintLadder: string[];
  expectedMentions: ExpectedMention[];
  followUps: string[];
  /** Technical terms to pass as speech-recognition hints. */
  vocabulary: string[];
  referenceSolution: CodeByLanguage;
  walkthrough: WalkthroughStep[];
  generatedBy?: { provider: string; model: string; date: string };
}

export type ProblemSource = 'built-in' | 'pasted' | 'variation' | 'custom';

export interface Problem {
  schemaVersion: 1;
  id: string;
  title: string;
  difficulty: Difficulty;
  topics: Topic[];
  /** Plain text. Never rendered as HTML. */
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
  signature: FunctionSignature;
  /** Java starter code is generated from the signature when it isn't stored (see starterCodeFor). */
  starterCode: CodeByLanguage;
  tests: TestCase[];
  /** Missing until generated for pasted problems. */
  analysis?: ProblemAnalysis;
  source: ProblemSource;
  /** For variations: the problem this one was derived from, and what changed. */
  variationOf?: { problemId: string; change: string };
}

// ---------------------------------------------------------------------------
// Sessions

export type Persona = 'friendly' | 'neutral' | 'stone-faced';
export const PERSONAS: Persona[] = ['friendly', 'neutral', 'stone-faced'];

export type FeedbackMode = 'training' | 'delayed' | 'realistic';
export const FEEDBACK_MODES: FeedbackMode[] = ['training', 'delayed', 'realistic'];

export type ModelRole = 'interviewer' | 'reactions' | 'debrief';
export const MODEL_ROLES: ModelRole[] = ['interviewer', 'reactions', 'debrief'];

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'custom' | 'claude-code';
export type PresetId = 'economy' | 'balanced' | 'best' | 'advanced';

export type SpeechEngineId = 'browser' | 'whisper-local' | 'deepgram' | 'assemblyai' | 'openai' | 'text';

export interface SessionConfig {
  provider: ProviderId;
  preset: PresetId;
  models: Record<ModelRole, string>;
  /** Engine used live during the interview. */
  liveSpeechEngine: SpeechEngineId;
  /** Engine used for the accurate transcript after the session, if any. */
  accurateSpeechEngine?: SpeechEngineId;
}

export interface Utterance {
  id: string;
  speaker: 'user' | 'interviewer';
  t0: number;
  t1: number;
  text: string;
  /** Speech engine that produced the text, or "typed" / "model". */
  source: SpeechEngineId | 'model';
  /** Word timings when the engine supplies them. */
  words?: { w: string; t0: number; t1: number }[];
}

export interface Transcript {
  engine: SpeechEngineId;
  utterances: Utterance[];
}

export interface CodeSnapshot {
  t: number;
  code: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  hidden?: boolean;
  args?: unknown[];
  expected?: unknown;
  actual?: unknown;
  error?: string;
  stdout?: string;
  ms?: number;
}

export interface TestRun {
  t: number;
  results: TestResult[];
  passed: number;
  total: number;
  /** Set when the whole run failed (syntax error, timeout). */
  error?: string;
  stdout?: string;
}

export type ReactionLevel = 'strong' | 'neutral' | 'negative';
export type Points = 2 | 1 | 0 | -1;

/**
 * Feedback tied to one moment. `quote` must appear verbatim in the
 * transcript (checked in code), except for silences, where `quote` is empty
 * and `silence` describes the gap.
 */
export interface Reaction {
  id: string;
  t: number;
  utteranceId?: string;
  quote: string;
  silence?: { t0: number; t1: number };
  category: RubricCategory;
  level: ReactionLevel;
  points: Points;
  /** One line naming the behavior, e.g. "asked about empty input". */
  reason: string;
  /** For negative moments: what to say instead. */
  sayInstead?: string;
  /** When the reaction was produced: live, at a phase boundary, or in the debrief. */
  origin: 'live' | 'phase' | 'debrief';
  verified?: boolean;
}

export interface MissedOpportunity {
  id: string;
  mentionId?: string;
  what: string;
  category: RubricCategory;
  /** Where in the session it would have fit best. */
  t: number;
  sayInstead: string;
}

export type HireSignal = 'strong-no' | 'lean-no' | 'lean-yes' | 'strong-yes';

export interface Evidence {
  quote: string;
  t: number;
  utteranceId?: string;
}

export interface RubricScore {
  category: RubricCategory;
  score: 1 | 2 | 3 | 4;
  summary: string;
  evidence: Evidence[];
}

export interface InterviewerNote {
  text: string;
  t: number;
  quote?: string;
}

export interface Narration {
  /** The weak moment this narration replaces. */
  reactionId?: string;
  missedId?: string;
  t: number;
  text: string;
}

export interface Rerecord {
  id: string;
  narrationKey: string;
  createdAt: number;
  transcript: string;
  audioId?: string;
  verdict: 'better' | 'same' | 'worse';
  points: Points;
  reason: string;
}

export interface Debrief {
  scores: RubricScore[];
  correctness: { passed: number; total: number; summary: string };
  hireSignal: HireSignal;
  hireSummary: string;
  notes: InterviewerNote[];
  narrations: Narration[];
  /** Transcript engine the scoring ran on. */
  scoredOn: SpeechEngineId;
  verification: { removed: number; downgraded: number };
  createdAt: number;
}

export interface UsageRecord {
  t: number;
  role: ModelRole | 'analysis' | 'verification' | 'rerecord';
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Null when prices are unknown (custom endpoint without prices). */
  costUsd: number | null;
}

export interface SpeechUsageRecord {
  engine: SpeechEngineId;
  purpose: 'live' | 'accurate' | 'rerecord';
  seconds: number;
  costUsd: number | null;
}

export interface Session {
  id: string;
  createdAt: number;
  endedAt?: number;
  demo?: boolean;
  /** The custom-list entry this session practiced, if any. */
  listEntryId?: string;
  problem: Problem;
  language: Language;
  persona: Persona;
  feedbackMode: FeedbackMode;
  plannedMinutes: number;
  config: SessionConfig;
  transcripts: { live: Transcript; accurate?: Transcript };
  code: CodeSnapshot[];
  testRuns: TestRun[];
  phases: { phase: Phase; t: number }[];
  hintsGiven: { t: number; level: number }[];
  reactions: Reaction[];
  missed: MissedOpportunity[];
  debrief?: Debrief;
  rerecords: Rerecord[];
  usage: UsageRecord[];
  speechUsage: SpeechUsageRecord[];
  /** The recorded microphone audio, stored separately; offsetMs is its start on the session clock. */
  audio?: { id: string; offsetMs: number; mimeType: string };
  notices: string[];
}
