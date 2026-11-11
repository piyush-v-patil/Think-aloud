/**
 * Live reactions during the interview (Training and Delayed modes). Timing
 * metrics and stall signals are inputs; the model decides whether anything
 * deserves a margin note. Every quote is checked in code before it shows.
 */
import type { AIProvider, ChatTurn, PromptBlock } from '../ai/types';
import type { TokenUsage } from '../cost/pricing';
import type { CodeSnapshot, FeedbackMode, Language, Problem, Reaction, TestRun, Utterance } from '../types';
import { fill, prompt } from '../prompts';
import { problemBrief } from '../interview/log';
import { formatClock, formatDuration } from '../time';
import { liveReactionsOut } from './schemas';
import { validateReactions } from './validate';
import type { MomentIndex } from './moments';
import type { Silence } from './metrics';

const STUCK_TRAINING =
  'If the newest moment shows the candidate is stuck (a long silence without progress, or going in circles), set stuck.isStuck to true and give stuck.recoveryLine: one natural sentence they could say right now to get moving, such as summarizing what they have ruled out, saying what they are unsure about, or proposing to try a smaller example. Otherwise set isStuck to false and leave recoveryLine empty.';
const STUCK_OFF = 'Always set stuck.isStuck to false and leave stuck.recoveryLine empty.';

export interface LiveResult {
  reactions: Reaction[];
  recoveryLine: string | null;
  dropped: number;
}

export class LiveReactor {
  private provider: AIProvider;
  private model: string;
  private system: PromptBlock[];
  private history: ChatTurn[] = [];
  private pending: string[] = [];
  private index: MomentIndex = { utterances: new Map(), silences: new Map(), refOf: new Map(), ordered: [] };
  private language: Language;
  private lastCode = '';
  private onUsage: (usage: TokenUsage, model: string) => void;
  busy = false;

  constructor(opts: { provider: AIProvider; model: string; problem: Problem; mode: FeedbackMode; language: Language; onUsage: (u: TokenUsage, model: string) => void }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.language = opts.language;
    this.onUsage = opts.onUsage;
    this.system = [
      { text: `${prompt('feedback-rules')}\n\n${fill(prompt('reactions'), { stuckInstruction: opts.mode === 'training' ? STUCK_TRAINING : STUCK_OFF })}` },
      { text: problemBrief(opts.problem), cache: true },
    ];
  }

  /** Adds an utterance and returns its stable reference. */
  addUtterance(u: Utterance): string {
    const existing = this.index.refOf.get(u.id);
    if (existing) return existing;
    const ref = `u${this.index.utterances.size + 1}`;
    this.index.utterances.set(ref, u);
    this.index.refOf.set(u.id, ref);
    const who = u.speaker === 'user' ? 'Candidate' : 'Interviewer';
    this.pending.push(`[${ref} ${formatClock(u.t0)}] ${who}: "${u.text}"`);
    return ref;
  }

  addSilence(t0: number, t1: number, codeDelta: number): string {
    const ref = `s${this.index.silences.size + 1}`;
    const s: Silence = { id: ref, t0, t1, codeDelta };
    this.index.silences.set(ref, s);
    this.pending.push(`[${ref} ${formatClock(t0)}] (${formatDuration(t1 - t0)} of silence${codeDelta ? `, about ${codeDelta} characters of code changed` : ', no code changes'})`);
    return ref;
  }

  addCode(snapshot: CodeSnapshot) {
    if (snapshot.code === this.lastCode) return;
    this.lastCode = snapshot.code;
    this.pending.push(`[${formatClock(snapshot.t)}] Code now (${this.language}):\n\`\`\`\n${snapshot.code.trimEnd()}\n\`\`\``);
  }

  addTests(run: TestRun) {
    this.pending.push(`[${formatClock(run.t)}] ${run.error ? `Code failed to run: ${run.error}` : `Tests: ${run.passed} of ${run.total} passed.`}`);
  }

  addNote(t: number, text: string) {
    this.pending.push(`[${formatClock(t)}] ${text}`);
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  async react(reactTo: string[], signal?: AbortSignal): Promise<LiveResult> {
    this.busy = true;
    const used = this.pending.length;
    const user: ChatTurn = {
      role: 'user',
      text: `New moments:\n${this.pending.slice(0, used).join('\n') || '(none)'}\n\nReact to: ${reactTo.join(', ') || 'nothing new'}`,
      cache: true,
    };
    try {
      const res = await this.provider.json({
        model: this.model,
        system: this.system,
        turns: [...this.history.map((t, i) => ({ ...t, cache: i === this.history.length - 1 })), user],
        maxTokens: 3000,
        effort: 'low',
        schema: liveReactionsOut,
        schemaName: 'live_reactions',
        signal,
      });
      this.onUsage(res.usage, res.model);
      this.history.push({ role: 'user', text: user.text }, { role: 'assistant', text: res.text || JSON.stringify(res.data) });
      this.pending = this.pending.slice(used);
      // Only reactions to the moments we asked about are allowed through.
      const allowed = res.data.reactions.filter((r) => reactTo.includes(r.ref.trim()));
      const { kept, dropped } = validateReactions(allowed, this.index, 'live');
      const line = res.data.stuck.isStuck ? res.data.stuck.recoveryLine.trim() : '';
      return { reactions: kept, recoveryLine: line || null, dropped: dropped.length + (res.data.reactions.length - allowed.length) };
    } finally {
      this.busy = false;
    }
  }
}
