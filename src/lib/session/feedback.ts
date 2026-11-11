/**
 * Feedback during the interview, by mode:
 * - Training: reactions after finished turns and stalls, shown live, plus a
 *   recovery line when you're stuck.
 * - Delayed: reactions for a whole phase, shown when the phase ends.
 * - Realistic: no live calls at all; everything is written in the replay.
 */
import type { FeedbackMode, Reaction } from '../types';
import type { AIProvider } from '../ai/types';
import { LiveReactor } from '../feedback/live';
import type { InterviewController, ControllerEvent } from './controller';
import { ProviderError } from '../ai/errors';

export class LiveFeedback {
  private reactor: LiveReactor | null;
  private mode: FeedbackMode;
  private c: InterviewController;
  private waiting: string[] = [];
  private phaseRefs: string[] = [];
  private unsubscribe: () => void = () => {};
  private freshTimer?: ReturnType<typeof setTimeout>;

  constructor(c: InterviewController, provider: AIProvider, model: string, mode: FeedbackMode) {
    this.c = c;
    this.mode = mode;
    this.reactor =
      mode === 'realistic'
        ? null
        : new LiveReactor({
            provider,
            model,
            problem: c.problem,
            mode,
            language: c.language,
            onUsage: (usage, m) => c.recordUsage('reactions', m, usage),
          });
  }

  attach() {
    if (!this.reactor) return;
    this.unsubscribe = this.c.on((e) => this.onEvent(e));
  }

  detach() {
    this.unsubscribe();
    clearTimeout(this.freshTimer);
  }

  private onEvent(e: ControllerEvent) {
    const r = this.reactor!;
    switch (e.type) {
      case 'interviewer-turn':
        r.addUtterance(e.utterance);
        break;
      case 'user-turn': {
        const ref = r.addUtterance(e.utterance);
        if (this.mode === 'training') this.request([ref]);
        else this.phaseRefs.push(ref);
        break;
      }
      case 'tests':
        r.addCode(this.c.snapshot());
        r.addTests(e.run);
        break;
      case 'stall': {
        const ref = r.addSilence(e.t - e.silenceMs, e.t, 0);
        if (this.mode === 'training') this.request([ref]);
        else this.phaseRefs.push(ref);
        break;
      }
      case 'phase':
        if (this.mode === 'delayed' && this.phaseRefs.length) {
          const refs = this.phaseRefs;
          this.phaseRefs = [];
          r.addNote(e.t, `The interview moved to the ${e.phase} phase. React to the phase that just ended.`);
          this.request(refs);
        }
        break;
    }
  }

  private request(refs: string[]) {
    this.waiting.push(...refs);
    if (this.reactor!.busy) return;
    void this.flush();
  }

  private async flush() {
    const refs = this.waiting;
    this.waiting = [];
    if (!refs.length || this.c.store.get().ended) return;
    this.reactor!.addCode(this.c.snapshot());
    try {
      const res = await this.reactor!.react(refs);
      this.show(res.reactions, res.recoveryLine);
    } catch (err) {
      // Live feedback is optional: a failed call is skipped, and the replay
      // still writes complete feedback afterwards.
      if (!(err instanceof ProviderError && err.kind === 'aborted')) console.warn('Live feedback skipped:', err instanceof Error ? err.message : err);
    }
    if (this.waiting.length) void this.flush();
  }

  private show(reactions: Reaction[], recoveryLine: string | null) {
    const origin: Reaction['origin'] = this.mode === 'delayed' ? 'phase' : 'live';
    const tagged = reactions.map((r) => ({ ...r, origin }));
    const state = this.c.store.get();
    this.c.patch({
      reactions: [...state.reactions, ...tagged].sort((a, b) => a.t - b.t),
      freshIds: tagged.map((r) => r.id),
      ...(this.mode === 'training' && recoveryLine ? { recovery: { text: recoveryLine, t: this.c.clock.now() } } : {}),
    });
    clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => this.c.patch({ freshIds: [] }), 1200);
  }
}

/**
 * The impression meter, computed in code from reaction points: a running
 * signal between -1 and 1 that saturates, so one moment can't swing it far.
 */
export function impression(reactions: Pick<Reaction, 'points'>[]): number {
  const sum = reactions.reduce((s, r) => s + r.points, 0);
  return Math.tanh(sum / 6);
}

export function impressionWord(value: number): 'positive' | 'neutral' | 'negative' {
  return value > 0.15 ? 'positive' : value < -0.15 ? 'negative' : 'neutral';
}
