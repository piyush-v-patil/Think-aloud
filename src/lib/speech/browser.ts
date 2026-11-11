/**
 * Engine 1: the browser's Web Speech API. Free, no setup. Audio goes to the
 * browser vendor's speech service (Google for Chrome, Apple for Safari).
 * Chrome stops recognition after a pause, so the engine restarts itself
 * until stopped.
 *
 * Errors that repeat without any words getting through (the speech service
 * unreachable, recognition hints rejected) must never loop silently: hints
 * are dropped when the browser rejects them, and anything else that keeps
 * failing is reported as fatal so the interview switches to typing and says
 * why.
 */
import { SpeechError, type ClockFn, type LiveTranscriber, type LiveTranscriberEvents } from './types';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  phrases?: unknown[];
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;
type PhraseCtor = new (phrase: string, boost: number) => unknown;

/** Sessions in a row that may fail with no words heard before giving up. */
const MAX_FAILED_SESSIONS = 4;

export function browserRecognition(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSpeechSupported(): boolean {
  return browserRecognition() !== null;
}

export class BrowserTranscriber implements LiveTranscriber {
  readonly engine = 'browser' as const;
  private rec: Recognition | null = null;
  private running = false;
  private events: LiveTranscriberEvents = {};
  private phraseStart: number | null = null;
  private hints: string[] = [];
  private clock: ClockFn;
  private lang: string;
  private restarts = 0;
  /** False once the browser has rejected recognition hints. */
  private usePhrases = true;
  /** Sessions in a row that ended in an error before any words came through. */
  private failedSessions = 0;
  private sessionError: string | null = null;

  constructor(clock: ClockFn, lang = 'en-US') {
    this.clock = clock;
    this.lang = lang;
  }

  setHints(terms: string[]) {
    this.hints = terms;
  }

  async start(events: LiveTranscriberEvents): Promise<void> {
    const Ctor = browserRecognition();
    if (!Ctor) throw new SpeechError('not-supported', 'This browser has no speech recognition.');
    this.events = events;
    this.running = true;
    this.open(Ctor);
  }

  private open(Ctor: RecognitionCtor) {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 1;
    // Contextual biasing, where the browser supports it (newer Chrome, and
    // there only for on-device recognition). If the service rejects the
    // hints, the error handler turns them off and recognition carries on.
    const Phrase = (globalThis as unknown as { SpeechRecognitionPhrase?: PhraseCtor }).SpeechRecognitionPhrase;
    if (this.usePhrases && Phrase && 'phrases' in rec && this.hints.length) {
      try {
        rec.phrases = this.hints.map((phrase) => new Phrase(phrase, 5));
      } catch {
        this.usePhrases = false;
      }
    }
    this.sessionError = null;
    rec.onspeechstart = () => this.events.onActivity?.(true);
    rec.onspeechend = () => this.events.onActivity?.(false);
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript;
        if (text.trim()) this.failedSessions = 0;
        if (this.phraseStart === null && text.trim()) {
          this.phraseStart = this.clock();
          this.events.onActivity?.(true);
        }
        if (r.isFinal) {
          const t1 = this.clock();
          const clean = text.trim();
          if (clean) this.events.onPhrase?.({ text: clean, t0: this.phraseStart ?? t1, t1 });
          this.phraseStart = null;
          interim = '';
        } else interim += text;
      }
      this.events.onInterim?.(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'phrases-not-supported') {
        // Only on-device recognition takes hints. Listen without them.
        this.usePhrases = false;
        return;
      }
      this.sessionError = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false;
        this.events.onError?.(new SpeechError('mic-denied', 'Microphone access was blocked.'), true);
      } else if (e.error === 'audio-capture') {
        this.running = false;
        this.events.onError?.(new SpeechError('no-mic', 'No microphone was found.'), true);
      } else if (e.error === 'language-not-supported') {
        this.running = false;
        this.events.onError?.(new SpeechError('not-supported', 'This browser can’t recognize speech in this language.'), true);
      } else if (e.error === 'network') {
        this.events.onError?.(new SpeechError('network', 'The speech service could not be reached.'), false);
      } else this.events.onError?.(new SpeechError('unknown', e.error), false);
    };
    rec.onend = () => {
      this.events.onActivity?.(false);
      if (!this.running) return;
      if (this.sessionError) {
        this.failedSessions++;
        if (this.failedSessions >= MAX_FAILED_SESSIONS) {
          this.running = false;
          const kind = this.sessionError === 'network' ? 'network' : 'unknown';
          this.events.onError?.(new SpeechError(kind, `Speech recognition keeps failing (${this.sessionError}).`), true);
          return;
        }
      }
      // Chrome ends after silence or about a minute; keep listening.
      this.restarts++;
      if (this.restarts > 500) {
        this.running = false;
        this.events.onError?.(new SpeechError('unknown', 'Speech recognition kept stopping.'), true);
        return;
      }
      // After a failure, wait a little longer each time before trying again.
      setTimeout(() => this.running && this.open(Ctor), this.sessionError ? 600 * this.failedSessions : 150);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      // start() throws if called while already started; onend will retry.
    }
  }

  stop() {
    this.running = false;
    try {
      this.rec?.stop();
    } catch {
      // ignore
    }
    this.rec = null;
  }
}
