/**
 * The interviewer. Every reply is written by the model in response to what
 * actually happened; nothing it says is scripted. Calls happen on events
 * (a finished turn, a stall, a test run, a time check), never on a timer.
 *
 * Prompt layout for caching: [rules + persona] [problem + analysis] are
 * stable system blocks; the conversation is append-only, and the newest
 * turn is marked so the next call reads everything before it from cache.
 */
import type { AIProvider, ChatTurn } from '../ai/types';
import type { TokenUsage } from '../cost/pricing';
import type { Persona, Phase, Problem } from '../types';
import { PHASES } from '../types';
import { fill, prompt } from '../prompts';
import { formatEntry, problemBrief, type LogEntry } from './log';

export interface InterviewerReply {
  decision: 'speak' | 'wait';
  phase: Phase | null;
  hint: number;
  say: string;
}

export type Trigger = 'start' | 'turn' | 'stall' | 'tests' | 'time' | 'end';

const TRIGGER_TEXT: Record<Trigger, string> = {
  start:
    'The interview is starting now. Greet the candidate in one short sentence, present the problem briefly in your own words, and invite questions.',
  turn: 'The candidate just finished speaking. Decide whether to speak.',
  stall: 'The candidate has been silent with no code changes. Decide whether to say something, and what.',
  tests: 'The candidate just ran the tests. Decide whether to speak.',
  time: 'Time update. Decide whether to speak.',
  end: 'Time is up. Close the interview in one or two sentences.',
};

/** Tolerant parser for the tagged reply format; also works on partial text. */
export function parseReply(text: string): InterviewerReply {
  const tag = (name: string) => {
    const m = new RegExp(`<${name}>([\\s\\S]*?)(?:</${name}>|$)`).exec(text);
    return m ? m[1].trim() : null;
  };
  const decision = tag('decision') === 'wait' ? 'wait' : 'speak';
  const phaseRaw = tag('phase');
  const phase = PHASES.includes(phaseRaw as Phase) ? (phaseRaw as Phase) : null;
  const hint = Number.parseInt(tag('hint') ?? '0', 10);
  let say = tag('say') ?? '';
  // A model that ignores the format still gets heard.
  if (!/<say>/.test(text) && !/<decision>/.test(text)) say = text.trim();
  return { decision: say ? decision : 'wait', phase, hint: Number.isFinite(hint) ? hint : 0, say: cleanSpoken(say) };
}

/** Removes things that sound wrong when spoken. */
export function cleanSpoken(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\bO\(([^)]+)\)/g, 'O of $1')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Pending {
  reply: InterviewerReply;
  raw: string;
  /** Accept the reply into the conversation (it was said, or decided to wait). */
  commit(): void;
}

export class Interviewer {
  private provider: AIProvider;
  private model: string;
  private system: { text: string; cache?: boolean }[];
  private history: ChatTurn[] = [];
  private pending: LogEntry[] = [];
  private onUsage: (usage: TokenUsage, model: string) => void;
  busy = false;

  constructor(opts: {
    provider: AIProvider;
    model: string;
    persona: Persona;
    problem: Problem;
    minutes: number;
    onUsage: (usage: TokenUsage, model: string) => void;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.onUsage = opts.onUsage;
    const rules = fill(prompt('interviewer'), { persona: prompt(`persona-${opts.persona}`).trim() });
    this.system = [
      { text: rules },
      { text: `${problemBrief(opts.problem)}\n\nThe interview is ${opts.minutes} minutes long.`, cache: true },
    ];
  }

  /** Records something that happened. It is sent with the next call. */
  add(entry: LogEntry) {
    this.pending.push(entry);
  }

  /**
   * Asks the model what to do now. `onSay` streams the spoken text as it
   * arrives. The caller decides whether to commit the reply (if the
   * candidate started talking again, it is dropped and nothing changes).
   */
  async respond(trigger: Trigger, onSay?: (sayingSoFar: string, decided: 'speak' | 'wait' | null) => void, signal?: AbortSignal): Promise<Pending> {
    this.busy = true;
    const used = this.pending.length;
    const entries = this.pending.slice(0, used).map(formatEntry).join('\n');
    const userTurn: ChatTurn = {
      role: 'user',
      text: `${entries ? `New since your last reply:\n${entries}\n\n` : ''}${TRIGGER_TEXT[trigger]}`,
      cache: true,
    };
    try {
      const res = await this.provider.chat({
        model: this.model,
        system: this.system,
        // The previous call's last turn and the newest turn are marked: the
        // first is read from cache, the second is written for the next call.
        turns: [...this.history.map((t, i) => ({ ...t, cache: i === this.history.length - 1 })), userTurn],
        maxTokens: 2000,
        effort: 'low',
        signal,
        onText: onSay
          ? (soFar) => {
              const decided = /<decision>\s*wait/.test(soFar) ? 'wait' : /<decision>\s*speak/.test(soFar) ? 'speak' : null;
              const m = /<say>([\s\S]*?)(?:<\/say>|$)/.exec(soFar);
              onSay(m ? cleanSpoken(m[1]) : '', decided);
            }
          : undefined,
      });
      this.onUsage(res.usage, res.model);
      const reply = parseReply(res.text);
      return {
        reply,
        raw: res.text,
        commit: () => {
          this.history.push({ role: 'user', text: userTurn.text }, { role: 'assistant', text: res.text.trim() || '<decision>wait</decision><say></say>' });
          this.pending = this.pending.slice(used);
        },
      };
    } finally {
      this.busy = false;
    }
  }

  get turns(): number {
    return this.history.length / 2;
  }
}
