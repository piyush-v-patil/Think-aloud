/**
 * Every piece of interface text lives in this file so it can be reviewed
 * and edited as a set. Rules (from the design brief):
 * - Second person, plain words, calm. Sentence case. Digits for numbers.
 * - Name things by what the user sees. One name per thing everywhere.
 * - Buttons say what happens. Errors say what happened and how to fix it.
 * - Never expose internal terms ("reaction event", "debrief model", "second pass").
 */
import { APP_NAME } from '../config/app';
import type {
  Difficulty,
  FeedbackMode,
  HireSignal,
  Language,
  Persona,
  Phase,
  PresetId,
  RubricCategory,
  Topic,
} from '../lib/types';

export const nav = {
  practice: 'Practice',
  history: 'History',
  settings: 'Settings',
  skipToContent: 'Skip to content',
  home: `${APP_NAME} home`,
};

export const languageName: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
};

export const difficultyName: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const topicName: Record<Topic, string> = {
  'arrays-hashing': 'Arrays and hashing',
  'two-pointers': 'Two pointers',
  'sliding-window': 'Sliding window',
  stack: 'Stack',
  'binary-search': 'Binary search',
  'linked-list': 'Linked lists',
  trees: 'Trees',
  graphs: 'Graphs',
  heaps: 'Heaps',
  intervals: 'Intervals',
  backtracking: 'Backtracking',
  'dynamic-programming': 'Dynamic programming',
};

export const personaName: Record<Persona, string> = {
  friendly: 'Friendly',
  neutral: 'Neutral',
  'stone-faced': 'Stone-faced',
};

export const personaHelp: Record<Persona, string> = {
  friendly: 'Warm and encouraging. A good place to start.',
  neutral: 'Polite and businesslike, like most real interviewers.',
  'stone-faced': 'Gives little back. Practice staying steady without reassurance.',
};

export const feedbackModeName: Record<FeedbackMode, string> = {
  training: 'Training',
  delayed: 'Delayed',
  realistic: 'Realistic',
};

export const feedbackModeHelp: Record<FeedbackMode, string> = {
  training: 'Feedback appears beside your words as you speak.',
  delayed: 'Feedback appears when you finish each part of the interview.',
  realistic: 'Nothing during the interview. All feedback comes in the replay.',
};

export const presetName: Record<PresetId, string> = {
  economy: 'Economy',
  balanced: 'Balanced',
  best: 'Best',
  advanced: 'Advanced',
};

export const phaseName: Record<Phase, string> = {
  clarify: 'Clarify',
  plan: 'Plan',
  code: 'Code',
  test: 'Test',
  'wrap-up': 'Wrap-up',
};

export const rubricName: Record<RubricCategory, string> = {
  clarification: 'Clarification',
  planning: 'Planning',
  reasoning: 'Reasoning',
  narration: 'Narration',
  testing: 'Testing',
  'hint-handling': 'Hint handling',
};

export const rubricHelp: Record<RubricCategory, string> = {
  clarification: 'Asking about inputs, edge cases and constraints before solving.',
  planning: 'Stating an approach and its complexity before writing code.',
  reasoning: 'Explaining why, including the tradeoffs you considered.',
  narration: 'Saying what you are doing as you type, and keeping silences short or announced.',
  testing: 'Tracing an example aloud and finding your own bugs.',
  'hint-handling': 'Building on nudges and answering challenges.',
};

export const hireSignalName: Record<HireSignal, string> = {
  'strong-no': 'Strong no',
  'lean-no': 'Lean no',
  'lean-yes': 'Lean yes',
  'strong-yes': 'Strong yes',
};

export const setup = {
  title: 'Practice thinking out loud.',
  intro:
    'A mock coding interview by voice, then a replay that shows which moments helped you and which hurt, with what to say instead.',
  problemHeading: 'Problem',
  sourceRandom: 'Random from the bank',
  sourcePaste: 'Paste a problem',
  sourceList: 'From your list',
  sourceVariation: 'A variation of one you have done',
  difficulty: 'Difficulty',
  topic: 'Topic',
  anyDifficulty: 'Any difficulty',
  anyTopic: 'Any topic',
  pasteLabel: 'Problem text',
  pasteHelp:
    'Paste the full problem, including examples and constraints. It stays on this device and is sent only to your AI provider.',
  pastePlaceholder: 'Paste a problem statement here',
  pickAnother: 'Pick another',
  noMatch: 'No problems match those filters. Try another topic or difficulty.',
  interviewerHeading: 'Interviewer',
  feedbackHeading: 'Feedback',
  languageHeading: 'Language',
  qualityHeading: 'Quality',
  lengthLabel: 'Length in minutes',
  start: 'Start interview',
  tryDemo: 'Watch the demo session',
  costHeading: 'Session cost',
  needKeyForPaste: 'Add an AI key in settings to prepare a pasted problem.',
  needKey: 'Add an AI key in settings to start an interview. You can watch the demo session without one.',
  addKey: 'Add an AI key',
  monthlyLimitWarning: (spent: string, limit: string) =>
    `You have spent ${spent} this month, close to your limit of ${limit}. You can still start.`,
  monthlyLimitReached: (spent: string, limit: string) =>
    `You have spent ${spent} this month, which is over your limit of ${limit}. Start anyway?`,
};

export const interview = {
  end: 'End interview',
  endConfirm: 'End the interview now? Your replay will be ready in about a minute.',
  endConfirmYes: 'End and see replay',
  endConfirmNo: 'Keep going',
  run: 'Run tests',
  running: 'Running',
  runScript: 'Run code',
  left: 'left',
  over: 'over time',
  phase: 'Phase',
  problemHeading: 'Problem',
  transcriptHeading: 'Transcript',
  showTranscript: 'Show transcript',
  hideTranscript: 'Hide transcript',
  testsHeading: 'Test results',
  noRunYet: 'Run the tests when you are ready. Talking through an example first helps.',
  passed: (n: number, total: number) => `${n} of ${total} passed`,
  testPassed: 'Passed',
  testFailed: 'Failed',
  input: 'Input',
  exampleInput: 'Input:',
  exampleOutput: 'Output:',
  expected: 'Expected',
  got: 'Got',
  error: 'Error',
  output: 'Output',
  hiddenTest: 'Hidden test',
  loadingPython: 'Loading Python. This takes a few seconds the first time.',
  examples: 'Examples',
  editorLabel: 'Code editor',
  noTests:
    'This problem has no tests yet, so Run code just runs your code and shows its output.',
  interviewerLabel: 'Interviewer',
  you: 'You',
  trySaying: 'Try saying:',
};

export const settings = {
  title: 'Settings',
  appearanceHeading: 'Appearance',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'Match my device',
  dataHeading: 'Your data',
  exportAll: 'Export all sessions',
  importSessions: 'Import sessions',
  deleteAll: 'Delete all data',
  deleteConfirm:
    'Delete every session, recording, list and saved key on this device? This cannot be undone.',
  deleteConfirmYes: 'Delete everything',
  deleteConfirmNo: 'Keep my data',
  deleted: 'All data on this device was deleted.',
  imported: (n: number) => `Imported ${n} ${n === 1 ? 'session' : 'sessions'}.`,
  importFailed: 'That file is not a session export from this app. Choose a file you exported here.',
};

export const history = {
  title: 'History',
  emptyTitle: 'No interviews yet.',
  emptyBody:
    'Watch the demo session to see what the replay looks like, or start your first interview.',
  startFirst: 'Start your first interview',
  watchDemo: 'Watch the demo session',
};

export const common = {
  cancel: 'Cancel',
  close: 'Close',
  loading: 'Loading',
  estimate: 'estimate',
  actual: 'actual',
  back: 'Back',
};

export const errors = {
  generic: 'Something went wrong. Reload the page and try again.',
  notFound: 'That session is not on this device. It may have been deleted.',
};
