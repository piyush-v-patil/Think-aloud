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
  preparing: 'Preparing your problem',
  prepStage: {
    reading: 'Reading the problem and writing tests and a model answer.',
    checking: 'Checking the tests against the model answer.',
    retrying: 'Some tests didn’t check out. Writing them again.',
  } as Record<string, string>,
  prepTime: 'This takes about a minute the first time. The same problem is instant next time.',
  cancelPrep: 'Cancel',
  prepFailed: 'The problem couldn’t be prepared. Try again, or paste the problem with its examples and constraints.',
  listPick: 'Problem from your list',
  listEmpty: 'Your list is empty.',
  listNeedsText: 'This entry has no problem text yet. Paste it on your list page first.',
  monthlyLimitWarning: (spent: string, limit: string) =>
    `You have spent ${spent} this month, close to your limit of ${limit}. You can still start.`,
  monthlyLimitReached: (spent: string, limit: string) =>
    `You have spent ${spent} this month, which is over your limit of ${limit}. You can still start.`,
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
  status: { idle: 'Listening', thinking: 'Thinking', speaking: 'Speaking' } as Record<string, string>,
  micOn: 'Microphone on. Speak as you would to a real interviewer.',
  micStarting: 'Starting the microphone. Your browser may ask for permission.',
  micBlocked: 'The microphone is blocked, so type what you would say. To use your voice, allow the microphone for this site and reload.',
  micUnsupported: 'This browser has no speech recognition, so type what you would say. Voice works in Chrome, Edge and Safari.',
  micOff: 'Speech recognition stopped, so type what you would say.',
  typeLabel: 'What you would say',
  typePlaceholder: 'Type what you would say out loud, then press Enter',
  typeSend: 'Say this',
  switchToTyping: 'Type instead',
  headphones: 'Headphones help: the interviewer won’t hear its own voice.',
  youSaying: 'You:',
  interviewerError: 'The interviewer couldn’t reply just now.',
  retryInterviewer: 'Ask the interviewer again',
  ending: 'Saving your interview',
  phaseLabel: (p: string) => `Now: ${p}`,
  impressionLabel: 'Interviewer impression so far',
  paidFallback: (engine: string) => `${engine} stopped working, so the interview switched to your browser’s speech recognition.`,
  impressionWord: { positive: 'leaning positive', neutral: 'neutral', negative: 'leaning negative' } as Record<string, string>,
  recoveryHeading: 'Stuck? You could say:',
  recoveryDismiss: 'Hide this',
  feedbackWaiting: {
    training: 'Feedback appears beside your words as you go.',
    delayed: 'Feedback appears when each part of the interview ends.',
    realistic: 'Feedback comes in the replay, like a real interview.',
  } as Record<string, string>,
};

export const settings = {
  title: 'Settings',
  appearanceHeading: 'Appearance',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'Match my device',
  dataHeading: 'Your data',
  dataIntro: 'Everything is stored only in this browser. An export holds your sessions, recordings, list and settings, but never your keys.',
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

export const replay = {
  title: (problem: string) => `Your interview: ${problem}`,
  demoTitle: (problem: string) => `Demo interview: ${problem}`,
  demoNote: 'This is a sample session so you can see the replay without a key. The candidate’s words and scores are examples.',
  processing: 'Preparing your feedback',
  stage: {
    transcribing: 'Transcribing your recording for accuracy.',
    scoring: 'Reading your interview and scoring each part.',
    checking: 'Checking every quote against your transcript.',
    verifying: 'A second reviewer is checking each judgment against its evidence.',
    done: 'Done.',
  } as Record<string, string>,
  processingTime: 'This usually takes one to two minutes.',
  failed: 'Your feedback couldn’t be prepared.',
  noKey: 'Add your AI key in Settings to prepare feedback for this interview.',
  retry: 'Try again',
  hireHeading: 'Overall signal',
  correctnessHeading: 'Correctness',
  correctness: (passed: number, total: number) => `${passed} of ${total} tests passed`,
  rubricHeading: 'How you communicated',
  scoreOf: (n: number) => `${n} of 4`,
  notScored: (cats: string) => `Not scored: ${cats}. No evidence for these could be found in your transcript.`,
  checked: (removed: number, downgraded: number) =>
    `Every quote was checked against your transcript. The second review removed ${removed} and lowered ${downgraded} ${downgraded === 1 ? 'judgment' : 'judgments'}.`,
  scoredOn: (engine: string) => `Scored on the transcript from ${engine}.`,
  notesHeading: 'Interviewer’s notes',
  transcriptHeading: 'Your transcript, marked up',
  costHeading: 'Session cost',
  costLine: (amount: string) => `${amount}, actual`,
  costTokens: (tokens: string) => `${tokens}, prices unknown`,
  costBreakdown: 'Breakdown',
  speechCost: 'Speech recognition',
  jumpTo: (time: string) => `Go to ${time}`,
  silence: (duration: string) => `(${duration} of silence)`,
  missedLabel: 'Missed:',
  notSaid: (what: string) => `Not said: ${what}`,
  replayHeading: 'Replay',
  play: 'Play',
  pause: 'Pause',
  timelineLabel: 'Session timeline',
  timeOf: (now: string, total: string) => `${now} of ${total}`,
  noAudio: 'There is no recording for this session, so the replay plays the code and transcript without sound.',
  codeAt: (time: string) => `Your code at ${time}`,
  momentHeading: 'Selected moment',
  pickMoment: 'Choose a mark on the timeline or a note in your transcript to look at that moment.',
  strongerVersion: 'What a strong candidate might have said here',
  playNarration: 'Play this',
  stopNarration: 'Stop',
  rerecord: 'Re-record this moment',
  rerecordIntro: 'Say your version of this moment out loud, in your own words. Press stop when you finish.',
  rerecordTypeIntro: 'Type what you would say at this moment, in your own words.',
  stopRecording: 'Stop and score',
  recording: 'Recording',
  scoring: 'Scoring your new version',
  rerecordResult: { better: 'Better than the original', same: 'About the same as the original', worse: 'Not as strong as the original' } as Record<string, string>,
  rerecordNeedsKey: 'Add your AI key in Settings to score a re-recorded moment.',
  rerecordEmpty: 'Nothing was heard. Check your microphone and try again.',
  yourAttempt: 'You said:',
  previousAttempts: 'Your earlier attempts',
  tryAgain: 'Re-record this moment again',
  markerLabel: {
    strong: (label: string) => `Strong moment: ${label}`,
    neutral: (label: string) => `Noted: ${label}`,
    negative: (label: string) => `Weak moment: ${label}`,
    missed: (label: string) => `Missed: ${label}`,
    silence: (label: string) => `Silence: ${label}`,
    interviewer: (label: string) => `Interviewer: ${label}`,
  } as Record<string, (label: string) => string>,
  legend: { strong: 'Strong', negative: 'Weak', missed: 'Missed', silence: 'Silence', interviewer: 'Interviewer spoke' } as Record<string, string>,
  walkthroughHeading: 'How a strong candidate might talk it through',
  walkthroughIntro: 'A full example of thinking aloud for this problem, from first questions to wrap-up.',
  showWalkthrough: 'Show the walkthrough',
  shareHeading: 'Share card',
  shareAlt: 'Your rubric scores and overall signal as an image',
  silenceEvidence: 'a silence',
  costRole: { interviewer: 'Interviewer', reactions: 'Live feedback', debrief: 'Replay and scores', analysis: 'Preparing the problem' } as Record<string, string>,
  shareIntro: 'An image of your scores and overall signal, made on this device. It has no name, transcript or code.',
  saveCard: 'Save share card',
  shareCard: 'Share',
  accurateFailed: (engine: string) => `The more accurate transcript from ${engine} failed, so your feedback is based on the live transcript.`,
  accurateSkipped: (engine: string) => `The more accurate transcript from ${engine} was skipped because its key is missing, so your feedback is based on the live transcript.`,
  droppedLive: (n: number) => `${n} live ${n === 1 ? 'note was' : 'notes were'} removed because the more accurate transcript didn’t contain the quoted words.`,
};

export const history = {
  title: 'History',
  emptyTitle: 'No interviews yet.',
  emptyBody:
    'Watch the demo session to see what the replay looks like, or start your first interview.',
  startFirst: 'Start your first interview',
  watchDemo: 'Watch the demo session',
  focusHeading: 'What to work on next',
  weakest: (category: string) => `Your weakest area lately is ${category}.`,
  suggestion: (title: string) => `Try “${title}” next: it gives you plenty of chances to practice it.`,
  startSuggested: 'Start this problem',
  trendsHeading: 'Scores over time',
  trendsIntro: 'Each dot is one interview, scored from 1 to 4.',
  setupChanged: 'A dashed line marks where the AI model, preset or speech engine changed, so scores on either side aren’t perfectly comparable.',
  pointLabel: (date: string, score: number, preset: string) => `${date}: ${score} of 4, ${preset}`,
  showTable: 'Show scores as a table',
  sessionsHeading: 'Your interviews',
  colDate: 'Date',
  colProblem: 'Problem',
  colSignal: 'Overall signal',
  colPreset: 'Quality',
  colCost: 'Session cost',
  notScoredYet: 'Not scored yet',
  costActual: (amount: string) => `${amount}, actual`,
  costUnknown: 'Tokens only',
  spendHeading: 'Spend',
  spendWeek: (amount: string) => `${amount} in the last 7 days, actual`,
  spendMonth: (amount: string) => `${amount} this month, actual`,
  spendUnknown: (n: number) => `${n} ${n === 1 ? 'session used' : 'sessions used'} an endpoint without prices and ${n === 1 ? 'isn’t' : 'aren’t'} counted.`,
  limitLabel: 'Monthly limit in US dollars (optional)',
  limitHelp: 'You’ll see a warning before starting an interview when you’re close to or over it.',
  limitNear: (spent: string, limit: string) => `You’ve spent ${spent} of your ${limit} limit this month.`,
  limitOver: (spent: string, limit: string) => `You’ve spent ${spent} this month, over your ${limit} limit.`,
  delete: 'Delete',
  deleteConfirm: 'Delete this interview and its recording from this device?',
  deleteYes: 'Delete interview',
  deleteNo: 'Keep it',
};

export const list = {
  title: 'Your problem list',
  intro: 'Keep a list of problems you want to practice. For problems from other sites, save the title and link, and paste the text here when you practice. It stays on this device.',
  addHeading: 'Add a problem',
  titleLabel: 'Title',
  linkLabel: 'Link (optional)',
  textLabel: 'Problem text (optional)',
  textHelp: 'Paste the full problem to practice it. You can add it later.',
  add: 'Add to list',
  empty: 'Your list is empty. Add a problem above.',
  colStatus: 'Status',
  colLast: 'Last score',
  notStarted: 'Not practiced yet',
  practiced: (n: number) => `Practiced ${n} ${n === 1 ? 'time' : 'times'}`,
  weak: 'Worth another try',
  practice: 'Practice this',
  needsText: 'Paste the problem text to practice it.',
  saveText: 'Save text',
  remove: 'Remove',
  open: 'Open link',
  manage: 'Manage your list',
};

export const variation = {
  pick: 'Problem to vary',
  none: 'Finish an interview first; then you can practice a variation of it.',
  help: 'You’ll get the same kind of problem with one thing changed, so you can’t rely on a memorized answer.',
  preparing: 'Writing a variation and checking its tests.',
  changed: 'What’s different:',
};

export const ai = {
  heading: 'AI provider',
  intro:
    'The interviewer and your feedback are written by an AI model you choose, using your own key. Requests go straight from this browser to the provider.',
  provider: 'Provider',
  providerName: { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini', custom: 'Custom endpoint' } as Record<string, string>,
  keyLabel: (provider: string) => `${provider} API key`,
  keyHelp: 'Paste the whole key. It is stored only in this browser.',
  getKey: 'Get a key',
  rememberDevice: 'Remember on this device',
  sessionOnly: 'This session only',
  storageLabel: 'Where to keep the key',
  storageHelpDevice: 'Kept in this browser until you clear it. Anyone using this browser profile could use it.',
  storageHelpSession: 'Forgotten when you close or reload this tab.',
  saveAndCheck: 'Save and check key',
  checking: 'Checking',
  clearKey: 'Clear key',
  keySaved: 'Key saved. It works.',
  keyStored: (masked: string) => `Saved key: ${masked}`,
  noKey: 'No key saved.',
  keyCleared: 'Key cleared from this browser.',
  checkCost: 'Checking sends one tiny request, which costs a fraction of a cent.',
  errors: {
    'invalid-key': 'That key was rejected. Check that you copied the whole key.',
    'no-credit': 'That key works, but the account has no credit. Add credit in the provider’s billing settings, then check again.',
    'rate-limit': 'The provider is limiting requests right now. Wait a minute, then check again.',
    overloaded: 'The provider is busy right now. Try again in a minute.',
    network: 'Couldn’t reach the provider. Check your connection, and allow the provider’s site if you use an ad blocker or firewall.',
    'not-found': 'The provider doesn’t recognize that model. Choose another model under Advanced.',
    refused: 'The model declined to answer this request.',
    'bad-request': 'The provider rejected the request.',
    'bad-output': 'The model’s answer came back incomplete. Try again.',
    aborted: 'The request was cancelled.',
    unknown: 'Something went wrong talking to the provider. Try again.',
  } as Record<string, string>,
};

export const speech = {
  heading: 'Speech',
  intro: 'How your voice becomes text. The free browser engine works with no setup.',
  support: 'Voice works in Chrome, Edge and Safari. In Firefox, and anywhere the microphone is blocked, you type what you would say instead.',
  duringHeading: 'During the interview',
  browser: 'Browser speech recognition (free)',
  typing: 'Type instead of speaking',
  browserNote: 'Your audio goes to your browser’s speech service: Google for Chrome and Edge, Apple for Safari.',
  unsupportedNote: 'This browser has no speech recognition, so you’ll type during the interview.',
  accurateHeading: 'A more accurate transcript (optional)',
  accurateIntro: 'Speech engines make mistakes with technical words. A second transcription of your recording makes the quotes in your feedback more accurate.',
  accurateOff: 'Off',
  accuratePaid: 'A paid service',
  accurateDevice: 'On this device',
  serviceLabel: 'Service',
  deviceNote: 'Runs Whisper in your browser. Your audio never leaves this device. The first time, it downloads a speech model of about 80 MB from Hugging Face. It needs a recent computer and can take a few minutes for a long interview.',
  deviceWeak: 'This device may be too slow for on-device transcription.',
  accuratePass: 'Transcribe the recording after the interview and score that version (recommended)',
  accuratePassHelp: 'Your feedback is based on the more accurate transcript, lined up with the replay.',
  paidLive: (engine: string) => `Use ${engine} during the interview too`,
  paidLiveHelp: 'Replaces browser speech recognition while you talk. If it stops working, the interview switches back automatically.',
  liveUnavailable: (engine: string) => `${engine} can’t transcribe live directly from a browser, so it is used after the interview only.`,
  reuseKey: 'Use my OpenAI key from the AI provider',
  keyLabel: (engine: string) => `${engine} API key`,
  price: (perMinute: string, session: string) => `${perMinute} per minute of audio, about ${session} for a 45 minute interview, estimate.`,
};

export const quality = {
  heading: 'Quality',
  help: 'Better models write a more natural interviewer and sharper feedback, and cost more.',
  presetHelp: {
    economy: 'The fastest, cheapest model for everything.',
    balanced: 'A strong model live, and the top model for your feedback.',
    best: 'The top models throughout.',
    advanced: 'Choose the model for each part yourself.',
  } as Record<string, string>,
  roleName: { interviewer: 'Interviewer', reactions: 'Live feedback', debrief: 'Replay and scores' } as Record<string, string>,
  modelFor: (role: string) => `Model for ${role.toLowerCase()}`,
};

export const cost = {
  heading: 'Session cost',
  estimate: 'estimate',
  actual: 'actual',
  about: (amount: string) => `About ${amount}`,
  tokensOnly: 'Prices for this endpoint are unknown, so this shows tokens instead.',
  basisModel: 'Based on a typical session of this length.',
  basisHistory: (n: number) => `Based on your last ${n} sessions.`,
  speechLine: 'Speech recognition',
  aiLine: 'AI',
  prepLine: 'Preparing the problem',
  free: 'free',
  perRole: { interviewer: 'Interviewer', reactions: 'Live feedback', debrief: 'Replay and scores', analysis: 'Preparing the problem' } as Record<string, string>,
  amount: (amount: string, kind: 'estimate' | 'actual') => `${amount}, ${kind}`,
};

export const onboarding = {
  title: 'Before your first interview',
  intro: `This app is free. The AI that plays the interviewer runs on your own account with an AI provider, so you pay the provider directly for what you use.`,
  step1: 'Create an account with an AI provider. Anthropic is the default.',
  step2: 'Add a small amount of credit. $5 covers many sessions.',
  step3: 'Create an API key and paste it in Settings.',
  costIntro: 'What a 45 minute interview costs with Anthropic:',
  keyStays: 'Your key stays in this browser. It is sent only to the provider you choose.',
  addKey: 'Add an AI key',
  demoFirst: 'Watch the demo session first',
  dismiss: 'Close this guide',
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
