/**
 * Speech-to-text behind one interface. Every engine reports finished
 * phrases with times on the session clock, so transcript, code and audio
 * line up in the replay.
 */
import type { SpeechEngineId } from '../types';

export interface Phrase {
  text: string;
  /** Session-clock times in ms. */
  t0: number;
  t1: number;
  words?: { w: string; t0: number; t1: number }[];
}

export type SpeechErrorKind = 'not-supported' | 'mic-denied' | 'no-mic' | 'network' | 'invalid-key' | 'no-credit' | 'unknown';

export class SpeechError extends Error {
  readonly kind: SpeechErrorKind;
  constructor(kind: SpeechErrorKind, message: string) {
    super(message);
    this.name = 'SpeechError';
    this.kind = kind;
  }
}

export interface LiveTranscriberEvents {
  /** Text recognized so far for the phrase in progress. */
  onInterim?: (text: string) => void;
  /** A finished phrase. */
  onPhrase?: (phrase: Phrase) => void;
  /** True while the user is audibly speaking (from engine activity). */
  onActivity?: (speaking: boolean) => void;
  /** The engine failed. Fatal errors stop the engine; the session can fall back. */
  onError?: (error: SpeechError, fatal: boolean) => void;
}

export interface LiveTranscriber {
  readonly engine: SpeechEngineId;
  start(events: LiveTranscriberEvents): Promise<void>;
  stop(): void;
  /** Technical terms to bias recognition, where the engine supports it. */
  setHints(terms: string[]): void;
}

/** Converts performance.now() readings to session time. */
export type ClockFn = () => number;
