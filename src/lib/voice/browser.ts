/**
 * Browser text-to-speech (speechSynthesis). Free and on-device or
 * vendor-provided depending on the voice. Persona changes pace, not words.
 */
import type { Persona } from '../types';
import type { SpeakOptions, Voice } from './types';

const PACE: Record<Persona, { rate: number; pitch: number }> = {
  friendly: { rate: 1.02, pitch: 1.05 },
  neutral: { rate: 1.0, pitch: 1.0 },
  'stone-faced': { rate: 0.95, pitch: 0.92 },
};

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  // Prefer natural-sounding voices when the platform offers them.
  const ranked = [...voices].sort((a, b) => score(b) - score(a));
  return ranked[0] ?? null;
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/natural|neural|enhanced|premium/i.test(v.name)) s += 4;
  if (/google|samantha|daniel|aria|jenny/i.test(v.name)) s += 2;
  if (v.lang === 'en-US') s += 1;
  if (v.localService) s += 1;
  return s;
}

export class BrowserVoice implements Voice {
  readonly id = 'browser';
  private active = 0;
  /**
   * Utterances being spoken. Chrome can garbage-collect an utterance nobody
   * holds a reference to, and then its end event never fires.
   */
  private live = new Set<SpeechSynthesisUtterance>();

  get available(): boolean {
    return typeof speechSynthesis !== 'undefined';
  }

  get speaking(): boolean {
    return this.active > 0;
  }

  speak(text: string, opts: SpeakOptions) {
    if (!this.available || !text.trim()) {
      opts.onStart?.();
      opts.onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = PACE[opts.persona].rate;
    u.pitch = PACE[opts.persona].pitch;
    this.active++;
    this.live.add(u);
    let ended = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(watchdog);
      this.live.delete(u);
      this.active = Math.max(0, this.active - 1);
      opts.onEnd?.();
    };
    // Some platforms (Chrome on Windows in particular) occasionally never
    // fire the end event. A sentence can't take much longer than this, so
    // don't let "the interviewer is speaking" get stuck.
    const words = text.trim().split(/\s+/).length;
    const expectedMs = ((words / 2.5) * 1000) / u.rate;
    u.onstart = () => {
      opts.onStart?.();
      clearTimeout(watchdog);
      watchdog = setTimeout(end, expectedMs * 2 + 3000);
    };
    u.onend = end;
    u.onerror = end;
    // Also covers a voice that never starts at all. Generous, because this
    // sentence may be queued behind others that are still being spoken.
    watchdog = setTimeout(end, 60_000);
    speechSynthesis.speak(u);
  }

  cancel() {
    if (!this.available) return;
    speechSynthesis.cancel();
    this.live.clear();
    this.active = 0;
  }
}

/** A silent voice used when speech output is unavailable or muted: text only. */
export class SilentVoice implements Voice {
  readonly id = 'silent';
  readonly available = true;
  readonly speaking = false;
  speak(_text: string, opts: SpeakOptions) {
    opts.onStart?.();
    opts.onEnd?.();
  }
  cancel() {}
}

/** Splits streaming text into sentences that are ready to speak. */
export function takeSentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;
  const re = /^(.+?[.!?])(\s+|$)/s;
  for (;;) {
    const m = re.exec(rest);
    if (!m || (m[2] === '' && rest.length === m[1].length && !/[.!?]$/.test(rest))) break;
    if (m[2] === '') break; // no space after: the sentence may still be growing ("3.5")
    ready.push(m[1].trim());
    rest = rest.slice(m[0].length);
  }
  return { ready, rest };
}
