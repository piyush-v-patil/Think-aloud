/**
 * Groups recognized phrases into turns. A turn ends after a natural pause:
 * no speech activity and no new phrase for `pauseMs`. The interviewer only
 * ever responds to a finished turn, so it never talks over you.
 *
 * "Speaking" comes from the recognizer's speech start/end events and from
 * partial results. Chrome can deliver a last partial result after its
 * speech-end event and then never send another end, which would leave
 * "speaking" on until the recognizer restarts (a minute or more). While
 * someone really talks, partial results keep arriving several times a
 * second, so "speaking" with nothing new for a while means they stopped.
 */

import type { Phrase } from './types';

/** How long "speaking" may go without any new speech before it's treated as over. */
export const STALE_SPEAKING_MS = 900;

export interface Turn {
  text: string;
  t0: number;
  t1: number;
  words?: Phrase['words'];
}

export class TurnTracker {
  private phrases: Phrase[] = [];
  private speaking = false;
  private lastActivity = 0;
  private pauseMs: number;
  private onTurn: (turn: Turn) => void;

  constructor(onTurn: (turn: Turn) => void, pauseMs = 1600) {
    this.onTurn = onTurn;
    this.pauseMs = pauseMs;
  }

  phrase(p: Phrase) {
    this.phrases.push(p);
    this.lastActivity = Math.max(this.lastActivity, p.t1);
  }

  activity(speaking: boolean, now: number) {
    this.speaking = speaking;
    this.lastActivity = now;
  }

  /** True while a turn is in progress (speech heard but the turn not yet ended). */
  get inProgress(): boolean {
    return this.speaking || this.phrases.length > 0;
  }

  /** Call periodically with the session clock. Emits the turn once the pause has passed. */
  tick(now: number) {
    const quiet = now - this.lastActivity;
    if (this.speaking && quiet >= this.pauseMs + STALE_SPEAKING_MS) this.speaking = false;
    if (!this.phrases.length || this.speaking) return;
    if (quiet < this.pauseMs) return;
    this.flush();
  }

  /** Ends the current turn immediately (typed input, or the session ending). */
  flush() {
    if (!this.phrases.length) return;
    const ps = this.phrases;
    this.phrases = [];
    const words = ps.every((p) => p.words) ? ps.flatMap((p) => p.words!) : undefined;
    this.onTurn({
      text: ps.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim(),
      t0: ps[0].t0,
      t1: ps[ps.length - 1].t1,
      ...(words ? { words } : {}),
    });
  }
}

/**
 * True when recognized text is probably the interviewer's own voice coming
 * back through the speakers: most of its words appear in what is being spoken.
 */
export function looksLikeEcho(heard: string, spoken: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  const h = norm(heard);
  if (!h.length) return true;
  const said = new Set(norm(spoken));
  const overlap = h.filter((w) => said.has(w)).length;
  return overlap / h.length >= 0.7;
}
