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
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      this.active = Math.max(0, this.active - 1);
      opts.onEnd?.();
    };
    u.onstart = () => opts.onStart?.();
    u.onend = end;
    u.onerror = end;
    speechSynthesis.speak(u);
  }

  cancel() {
    if (!this.available) return;
    speechSynthesis.cancel();
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
