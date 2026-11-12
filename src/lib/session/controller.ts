/**
 * Owns a live interview outside React: one session clock, the code runner,
 * speech recognition and turn-taking, the interviewer model and its voice,
 * the microphone recording, and stall detection. Screens subscribe to
 * `store` and call methods.
 *
 * Static mechanics (timers, turn ends, stalls, test results) only decide
 * *when* to ask the model; what the interviewer says is always the model's.
 */
import type {
  CodeSnapshot,
  Language,
  Phase,
  Problem,
  SessionConfig,
  TestRun,
  UsageRecord,
  SpeechUsageRecord,
  Utterance,
} from '../types';
import { SPEECH_ENGINES } from '../../config/speech';
import { interview as copyInterview } from '../../copy/strings';
import type { AIProvider } from '../ai/types';
import type { ProviderConfig, RoleModels } from '../../config/providers/types';
import type { InterviewDraft } from '../../state/draft';
import type { LiveTranscriber, Phrase } from '../speech/types';
import { SpeechError } from '../speech/types';
import type { Voice } from '../voice/types';
import { takeSentences } from '../voice/browser';
import { TurnTracker, looksLikeEcho, type Turn } from '../speech/turns';
import { sharedRunner } from '../runner/shared';
import { hasTests } from '../problems/paste';
import { starterCodeFor } from '../problems/analyze';
import { SessionClock } from './clock';
import { createStore } from '../../state/store';
import { Interviewer, type Trigger } from '../interview/interviewer';
import type { LogEntry } from '../interview/log';
import { usageRecord } from '../ai/usage';
import { ProviderError } from '../ai/errors';
import { newId } from '../id';
import type { AudioRecorder, Recording } from '../audio/recorder';

export type MicState = 'starting' | 'on' | 'blocked' | 'unsupported' | 'off';

export interface LiveState {
  code: string;
  lastRun: TestRun | null;
  running: boolean;
  runnerStatus: string | null;
  elapsedMs: number;
  utterances: Utterance[];
  interim: string;
  interviewer: { status: 'idle' | 'thinking' | 'speaking'; caption: string };
  phase: Phase;
  input: 'voice' | 'text';
  mic: MicState;
  /** Calm, user-facing problems (e.g. "The interviewer couldn't reply"). */
  problem: { kind: string; at: number } | null;
  notices: string[];
  ended: boolean;
  /** Feedback shown during the interview (Training and Delayed modes). */
  reactions: import('../types').Reaction[];
  /** Reactions that just arrived, for the marker-stroke animation. */
  freshIds: string[];
  /** Training mode: a line the candidate could say to get unstuck. */
  recovery: { text: string; t: number } | null;
}

/** Silence with no code change before the interviewer is asked whether to step in. */
export const STALL_MS = 30_000;
/** Minimum gap between two stall prompts. */
export const STALL_REPEAT_MS = 75_000;
/** Speech that starts this soon after the interviewer stops may still be its echo. */
const ECHO_TAIL_MS = 1500;
const TIME_MARKS_MIN = [10, 5];

export interface ControllerDeps {
  provider: AIProvider;
  providerConfig: ProviderConfig;
  models: RoleModels;
  config: SessionConfig;
  voice: Voice;
  /** Null means typing only (no speech engine available). */
  transcriber: (clock: () => number) => LiveTranscriber | null;
  recorder: AudioRecorder | null;
  clock?: SessionClock;
  /** Used if a paid live engine fails mid-session. */
  fallbackTranscriber?: (clock: () => number) => LiveTranscriber | null;
}

export type ControllerEvent =
  | { type: 'user-turn'; utterance: Utterance }
  | { type: 'interviewer-turn'; utterance: Utterance }
  | { type: 'tests'; run: TestRun }
  | { type: 'phase'; phase: Phase; t: number }
  | { type: 'stall'; t: number; silenceMs: number };

export class InterviewController {
  readonly clock: SessionClock;
  readonly problem: Problem;
  readonly language: Language;
  readonly draft: InterviewDraft;
  readonly testable: boolean;
  readonly store;
  readonly snapshots: CodeSnapshot[];
  readonly runs: TestRun[] = [];
  readonly usage: UsageRecord[] = [];
  readonly speechUsage: SpeechUsageRecord[] = [];
  readonly phases: { phase: Phase; t: number }[] = [{ phase: 'clarify', t: 0 }];
  readonly hints: { t: number; level: number }[] = [];
  readonly deps: ControllerDeps;
  recording: Recording | null = null;

  /** Shared, so a runtime loaded on the setup screen is ready here. */
  private runner = sharedRunner;
  private interviewer: Interviewer;
  private transcriber: LiveTranscriber | null = null;
  private turns: TurnTracker;
  private snapshotTimer?: ReturnType<typeof setTimeout>;
  private ticker?: ReturnType<typeof setInterval>;
  private lastUserActivity = 0;
  private lastCodeChange = 0;
  private lastStallAt = -Infinity;
  private lastCodeSent = '';
  private timeMarksDone = new Set<number>();
  private queued: Trigger | null = null;
  private speakingText = '';
  private speakingUtterance: Utterance | null = null;
  private listeners = new Set<(e: ControllerEvent) => void>();
  private abort = new AbortController();
  private typedStart: number | null = null;

  constructor(draft: InterviewDraft, deps: ControllerDeps) {
    this.draft = draft;
    this.deps = deps;
    this.problem = draft.problem;
    this.language = draft.language;
    this.clock = deps.clock ?? new SessionClock();
    this.testable = hasTests(draft.problem);
    const starter = starterCodeFor(draft.problem, draft.language);
    this.snapshots = [{ t: 0, code: starter }];
    this.lastCodeSent = starter;
    this.store = createStore<LiveState>({
      code: starter,
      lastRun: null,
      running: false,
      runnerStatus: null,
      elapsedMs: 0,
      utterances: [],
      interim: '',
      interviewer: { status: 'idle', caption: '' },
      phase: 'clarify',
      input: 'voice',
      mic: 'starting',
      problem: null,
      notices: [],
      ended: false,
      reactions: [],
      freshIds: [],
      recovery: null,
    });
    this.interviewer = new Interviewer({
      provider: deps.provider,
      model: deps.models.interviewer,
      persona: draft.persona,
      problem: draft.problem,
      minutes: draft.minutes,
      onUsage: (u, model) => this.recordUsage('interviewer', model, u),
    });
    this.turns = new TurnTracker((turn) => this.onTurn(turn));
  }

  // ---------------------------------------------------------------- events

  on(listener: (e: ControllerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: ControllerEvent) {
    for (const l of this.listeners) l(e);
  }

  /** Public so feedback components can update their part of the state. */
  patch(p: Partial<LiveState>) {
    this.store.set((s) => ({ ...s, ...p }));
  }

  recordUsage(role: UsageRecord['role'], model: string, usage: Parameters<typeof usageRecord>[3]) {
    this.usage.push(usageRecord(this.deps.providerConfig, role, model, usage, this.clock.now()));
  }

  notice(text: string) {
    this.patch({ notices: [...this.store.get().notices, text] });
  }

  // ------------------------------------------------------------- lifecycle

  private started = false;
  private detachTimer?: ReturnType<typeof setTimeout>;

  /**
   * For screens: start on mount, stop shortly after unmount unless the
   * screen mounts again (React development mode mounts effects twice).
   */
  attach() {
    clearTimeout(this.detachTimer);
    if (!this.started) void this.start();
  }

  detach() {
    clearTimeout(this.detachTimer);
    this.detachTimer = setTimeout(() => void this.stop(), 300);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.runner.onStatus = (runnerStatus) => this.patch({ runnerStatus });
    void this.runner.warm(this.language);
    this.ticker = setInterval(() => this.tick(), 250);
    await this.startListening();
    void this.ask('start');
  }

  private async startListening() {
    const transcriber = this.deps.transcriber(() => this.clock.now());
    if (!transcriber) {
      this.patch({ mic: 'unsupported', input: 'text' });
      return;
    }
    try {
      await this.deps.recorder?.start(() => this.clock.now());
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      this.patch({ mic: denied ? 'blocked' : 'unsupported', input: 'text' });
      return;
    }
    transcriber.setHints(this.problem.analysis?.vocabulary ?? []);
    this.transcriber = transcriber;
    try {
      await transcriber.start({
        onInterim: (text) => this.onInterim(text),
        onPhrase: (p) => this.onPhrase(p),
        onActivity: (speaking) => {
          if (speaking) this.lastUserActivity = this.clock.now();
          this.turns.activity(speaking, this.clock.now());
        },
        onError: (err, fatal) => this.onSpeechError(err, fatal),
      });
      this.patch({ mic: 'on' });
    } catch (err) {
      this.onSpeechError(err instanceof SpeechError ? err : new SpeechError('unknown', String(err)), true);
    }
  }

  private onSpeechError(err: SpeechError, fatal: boolean) {
    if (!fatal) return;
    const failed = this.transcriber;
    if (failed && failed.engine !== 'browser' && this.deps.fallbackTranscriber) {
      this.recordLiveSpeech(failed);
      const next = this.deps.fallbackTranscriber(() => this.clock.now());
      void this.replaceTranscriber(next, copyInterview.paidFallback(SPEECH_ENGINES[failed.engine].label));
      return;
    }
    this.transcriber = null;
    // Say why in plain words; the mic line alone ("stopped") doesn't help.
    if (err.kind === 'network') this.notice(copyInterview.speechServiceDown);
    else if (err.kind === 'unknown') this.notice(copyInterview.speechKeepsFailing(err.message.match(/\(([^)]+)\)/)?.[1] ?? err.message));
    const mic: MicState = err.kind === 'mic-denied' ? 'blocked' : err.kind === 'not-supported' ? 'unsupported' : 'off';
    this.patch({ mic, input: 'text' });
  }

  /** Replace the live engine mid-session (used for paid-engine fallback). */
  async replaceTranscriber(next: LiveTranscriber | null, notice?: string) {
    this.transcriber?.stop();
    this.transcriber = null;
    if (notice) this.notice(notice);
    if (!next) {
      this.patch({ input: 'text' });
      return;
    }
    this.transcriber = next;
    next.setHints(this.problem.analysis?.vocabulary ?? []);
    await next.start({
      onInterim: (text) => this.onInterim(text),
      onPhrase: (p) => this.onPhrase(p),
      onActivity: (speaking) => this.turns.activity(speaking, this.clock.now()),
      onError: (err, fatal) => this.onSpeechError(err, fatal),
    });
  }

  /** Records the cost of a paid live engine's streamed audio. */
  private recordLiveSpeech(t: LiveTranscriber) {
    const seconds = (t as { secondsStreamed?: number }).secondsStreamed;
    const cfg = SPEECH_ENGINES[t.engine];
    if (!cfg.paid || !seconds) return;
    const perMinute = (cfg.livePerMinute ?? 0) + (cfg.keywordHintsPerMinute ?? 0);
    this.speechUsage.push({ engine: t.engine, purpose: 'live', seconds, costUsd: (seconds / 60) * perMinute });
  }

  useTyping() {
    this.transcriber?.stop();
    this.transcriber = null;
    this.patch({ input: 'text' });
  }

  /** Stops everything. Returns when the recording is finalized. */
  async stop(): Promise<void> {
    if (this.store.get().ended) return;
    clearTimeout(this.detachTimer);
    clearInterval(this.ticker);
    clearTimeout(this.snapshotTimer);
    this.abort.abort();
    this.deps.voice.cancel();
    this.finishSpeaking();
    this.transcriber?.stop();
    if (this.transcriber) this.recordLiveSpeech(this.transcriber);
    this.turns.flush();
    this.snapshot();
    this.recording = (await this.deps.recorder?.stop()) ?? null;
    // The shared runner stays warm for the next interview.
    this.runner.onStatus = undefined;
    this.patch({ ended: true, interim: '' });
  }

  // ------------------------------------------------------------------ tick

  tick() {
    const now = this.clock.now();
    this.patch({ elapsedMs: now });
    this.turns.tick(now);
    if (this.store.get().ended) return;

    // Stall: long silence, no code changes, interviewer not talking.
    const quietFor = now - Math.max(this.lastUserActivity, this.lastCodeChange, this.lastInterviewerEnd);
    if (
      quietFor >= STALL_MS &&
      now - this.lastStallAt >= STALL_REPEAT_MS &&
      !this.turns.inProgress &&
      !this.deps.voice.speaking &&
      !this.interviewer.busy
    ) {
      this.lastStallAt = now;
      const silenceMs = now - Math.max(this.lastUserActivity, this.lastInterviewerEnd);
      this.interviewer.add({ kind: 'silence', t: now, ms: silenceMs, codeChanged: now - this.lastCodeChange < silenceMs });
      this.emit({ type: 'stall', t: now, silenceMs });
      void this.ask('stall');
    }

    // Time checks.
    const remaining = this.draft.minutes * 60_000 - now;
    for (const m of TIME_MARKS_MIN) {
      if (remaining <= m * 60_000 && !this.timeMarksDone.has(m) && this.draft.minutes > m) {
        this.timeMarksDone.add(m);
        this.interviewer.add({ kind: 'time', t: now, remainingMs: Math.max(0, remaining) });
        void this.ask('time');
      }
    }
    if (remaining <= 0 && !this.timeMarksDone.has(0)) {
      this.timeMarksDone.add(0);
      void this.ask('end');
    }
  }

  private lastInterviewerEnd = 0;
  /** What the interviewer said last, for recognizing its echo just after it stops. */
  private lastSpokenText = '';

  // ---------------------------------------------------------------- speech

  /**
   * True when recognized speech is probably the interviewer's own voice
   * coming back through the speakers. Speech recognition delivers its final
   * text a moment after the voice stops, so speech that started while the
   * interviewer was talking, or just after, is checked against what it said.
   */
  private isEcho(text: string, startedAt: number): boolean {
    const recent = this.deps.voice.speaking || startedAt <= this.lastInterviewerEnd + ECHO_TAIL_MS;
    return recent && looksLikeEcho(text, `${this.lastSpokenText} ${this.speakingText}`);
  }

  private interimStartedAt: number | null = null;

  private onInterim(text: string) {
    if (!text) {
      this.interimStartedAt = null;
      this.patch({ interim: '' });
      return;
    }
    this.interimStartedAt ??= this.clock.now();
    if (this.isEcho(text, this.interimStartedAt)) return;
    this.lastUserActivity = this.clock.now();
    this.turns.activity(true, this.lastUserActivity);
    // Barge-in: the candidate started talking, so the interviewer stops.
    // Three words, so a misheard bit of the interviewer's own voice doesn't
    // cut it off.
    if (this.deps.voice.speaking && text.split(/\s+/).length >= 3) {
      this.deps.voice.cancel();
      this.finishSpeaking();
    }
    this.patch({ interim: text });
  }

  private onPhrase(p: Phrase) {
    this.interimStartedAt = null;
    if (this.isEcho(p.text, p.t0)) return;
    this.lastUserActivity = p.t1;
    this.turns.phrase(p);
    this.patch({ interim: '' });
  }

  /** Typed input: the candidate's words arrive as text. */
  typing() {
    if (this.typedStart === null) this.typedStart = this.clock.now();
    this.lastUserActivity = this.clock.now();
  }

  submitTyped(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const t1 = this.clock.now();
    const t0 = this.typedStart ?? t1;
    this.typedStart = null;
    this.turns.phrase({ text: clean, t0, t1 });
    this.turns.flush();
  }

  private onTurn(turn: Turn) {
    const utterance: Utterance = {
      id: newId('u-'),
      speaker: 'user',
      t0: turn.t0,
      t1: turn.t1,
      text: turn.text,
      source: this.transcriber?.engine ?? 'text',
      ...(turn.words ? { words: turn.words } : {}),
    };
    this.addUtterance(utterance);
    this.interviewer.add({ kind: 'utterance', utterance });
    this.emit({ type: 'user-turn', utterance });
    void this.ask('turn');
  }

  private addUtterance(u: Utterance) {
    const list = [...this.store.get().utterances, u].sort((a, b) => a.t0 - b.t0);
    this.patch({ utterances: list });
  }

  // ----------------------------------------------------------- interviewer

  /** Adds a log entry for every model reading the session (interviewer now; feedback in later steps). */
  log(entry: LogEntry) {
    this.interviewer.add(entry);
  }

  private includeCodeIfChanged() {
    const current = this.snapshot();
    if (current.code !== this.lastCodeSent) {
      this.lastCodeSent = current.code;
      this.interviewer.add({ kind: 'code', snapshot: current, language: this.language });
    }
  }

  async ask(trigger: Trigger): Promise<void> {
    if (this.store.get().ended && trigger !== 'end') return;
    if (this.interviewer.busy) {
      // Coalesce: one follow-up call after the current one, with everything new.
      this.queued = this.queued === 'turn' || trigger === 'turn' ? 'turn' : trigger;
      return;
    }
    this.includeCodeIfChanged();
    const lastSaid = this.store.get().interviewer.caption;
    this.patch({ interviewer: { status: 'thinking', caption: lastSaid } });
    let started = false;
    let spokenUpTo = 0;
    let dropped = false;
    const speakReady = (text: string, final: boolean) => {
      if (dropped) return;
      if (!started && this.turns.inProgress) {
        dropped = true; // the candidate is talking again: don't interrupt
        return;
      }
      const fresh = text.slice(spokenUpTo);
      const { ready, rest } = final ? { ready: fresh.trim() ? [fresh.trim()] : [], rest: '' } : takeSentences(fresh);
      for (const sentence of ready) {
        if (!started) this.beginSpeaking();
        started = true;
        this.speakingText += ` ${sentence}`;
        this.deps.voice.speak(sentence, {
          persona: this.draft.persona,
          onEnd: () => {
            if (!this.deps.voice.speaking) this.finishSpeaking();
          },
        });
      }
      spokenUpTo = text.length - rest.length;
      this.patch({ interviewer: { status: started ? 'speaking' : 'thinking', caption: started ? text.slice(0, spokenUpTo).trim() : lastSaid } });
    };
    try {
      const pending = await this.interviewer.respond(
        trigger,
        (saying, decided) => decided === 'speak' && speakReady(saying, false),
        this.abort.signal,
      );
      const { reply } = pending;
      if (reply.decision === 'speak' && reply.say) speakReady(reply.say, true);
      if (dropped || (reply.decision === 'speak' && !started)) {
        // Not said: leave the conversation unchanged so the next call includes everything.
        this.patch({ interviewer: { status: 'idle', caption: lastSaid } });
      } else {
        pending.commit();
        if (reply.hint > 0) this.hints.push({ t: this.clock.now(), level: reply.hint });
        if (reply.phase && reply.phase !== this.store.get().phase) this.setPhase(reply.phase);
        if (reply.decision === 'wait') this.patch({ interviewer: { status: 'idle', caption: this.store.get().interviewer.caption } });
      }
      this.patch({ problem: null });
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'aborted') return;
      const kind = err instanceof ProviderError ? err.kind : 'unknown';
      this.patch({ interviewer: { status: 'idle', caption: lastSaid }, problem: { kind, at: this.clock.now() } });
    } finally {
      const next = this.queued;
      this.queued = null;
      if (next && !this.store.get().ended) void this.ask(next);
    }
  }

  private beginSpeaking() {
    this.speakingText = '';
    this.speakingUtterance = { id: newId('u-'), speaker: 'interviewer', t0: this.clock.now(), t1: this.clock.now(), text: '', source: 'model' };
  }

  private finishSpeaking() {
    const u = this.speakingUtterance;
    if (!u) return;
    this.speakingUtterance = null;
    u.t1 = this.clock.now();
    u.text = this.speakingText.trim();
    this.lastInterviewerEnd = u.t1;
    this.lastSpokenText = u.text;
    if (u.text) {
      this.addUtterance(u);
      this.emit({ type: 'interviewer-turn', utterance: u });
    }
    this.patch({ interviewer: { status: 'idle', caption: u.text } });
  }

  private setPhase(phase: Phase) {
    const t = this.clock.now();
    this.phases.push({ phase, t });
    this.patch({ phase });
    this.emit({ type: 'phase', phase, t });
  }

  // ------------------------------------------------------------------ code

  setCode(code: string) {
    this.patch({ code });
    this.lastCodeChange = this.clock.now();
    clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => this.snapshot(), 800);
  }

  /** Records the current code if it changed since the last snapshot. */
  snapshot(): CodeSnapshot {
    const code = this.store.get().code;
    const last = this.snapshots[this.snapshots.length - 1];
    if (last.code !== code) this.snapshots.push({ t: this.clock.now(), code });
    return this.snapshots[this.snapshots.length - 1];
  }

  async run(): Promise<TestRun> {
    this.snapshot();
    this.patch({ running: true });
    const t = this.clock.now();
    const { code } = this.store.get();
    const result = this.testable
      ? await this.runner.runTests(this.language, code, this.problem.signature, this.problem.tests, t)
      : await this.runner.runScript(this.language, code, t);
    this.runs.push(result);
    this.patch({ running: false, lastRun: result });
    this.includeCodeIfChanged();
    this.interviewer.add({ kind: 'tests', run: result });
    this.emit({ type: 'tests', run: result });
    if (!this.turns.inProgress) void this.ask('tests');
    return result;
  }

  get transcript(): Utterance[] {
    return this.store.get().utterances;
  }
}
