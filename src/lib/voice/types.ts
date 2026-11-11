/** The interviewer's voice, behind an interface so other voices can be added. */
import type { Persona } from '../types';

export interface SpeakOptions {
  persona: Persona;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface Voice {
  readonly id: string;
  readonly available: boolean;
  /** Queues text; sentences are spoken in order. */
  speak(text: string, opts: SpeakOptions): void;
  /** Stops speaking immediately and clears the queue. */
  cancel(): void;
  readonly speaking: boolean;
}
