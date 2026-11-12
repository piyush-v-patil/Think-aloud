/**
 * The natural voice on the page side: loads the Kokoro worker once, checks
 * this device is fast enough, and plays sentences in order with Web Audio.
 *
 * Speed comes first. The natural voice is used only when the device makes
 * speech several times faster than real time, and if a reply's first
 * sentence still isn't ready in time, the whole reply is spoken by the fast
 * built-in voice instead (never half and half).
 */
import type { Persona } from '../types';
import type { SpeakOptions, Voice } from './types';
import { BrowserVoice } from './browser';
import { NATURAL_PREFIX, type KokoroReply, type KokoroRequest } from './kokoro-config';
import { readLocal, writeLocal } from '../storage/local';

/** A device found too slow isn't checked again (a heavy job) unless asked. */
interface SpeedRecord {
  device: 'webgpu' | 'wasm';
  realTime: number;
  firstMs: number;
}
const SPEED_KEY = 'natural-voice-speed';

/** The device must make speech at least this many times faster than real time. */
export const MIN_REAL_TIME = 4;
/** Longest wait for a reply's first sentence before the fast voice takes the reply. */
export const FIRST_SENTENCE_WAIT_MS = 900;

const PACE: Record<Persona, number> = { friendly: 1.02, neutral: 1, 'stone-faced': 0.95 };

export type NaturalStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }
  | { state: 'ready'; device: 'webgpu' | 'wasm'; realTime: number; firstMs: number; fastEnough: boolean }
  | { state: 'failed'; message: string };

class NaturalEngine {
  status: NaturalStatus = { state: 'idle' };
  private worker: Worker | null = null;
  private ready: Promise<NaturalStatus> | null = null;
  private resolveReady: ((s: NaturalStatus) => void) | null = null;
  private pending = new Map<number, (samples: Float32Array | null) => void>();
  private nextId = 1;
  private listeners = new Set<(s: NaturalStatus) => void>();

  subscribe(fn: (s: NaturalStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(s: NaturalStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /**
   * Loads the model (once) and runs the speed check. Safe to call
   * repeatedly. A device already found too slow isn't loaded again unless
   * `recheck` is set, since the check keeps the processor busy for a while.
   */
  load(voice: string, { recheck = false } = {}): Promise<NaturalStatus> {
    if (recheck && this.status.state === 'ready' && !this.status.fastEnough) this.ready = null;
    if (this.ready && this.status.state !== 'failed') return this.ready;
    const known = readLocal<SpeedRecord | null>(SPEED_KEY, null);
    if (!recheck && known && known.realTime < MIN_REAL_TIME) {
      this.set({ state: 'ready', ...known, fastEnough: false });
      this.ready = Promise.resolve(this.status);
      return this.ready;
    }
    this.worker?.terminate();
    this.worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<KokoroReply>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.fail(e.message || 'The natural voice could not start.');
    this.set({ state: 'loading', progress: 0 });
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
    this.post({
      type: 'load',
      lexiconUrl: new URL('vendor/kokoro/lexicon.txt', document.baseURI).href,
      wasmPaths: new URL('vendor/ort/', document.baseURI).href,
      voice,
    });
    return this.ready;
  }

  /** Makes audio for one sentence, or null if that failed. */
  generate(text: string, voice: string, speed: number): Promise<Float32Array | null> {
    if (!this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ type: 'speak', id, text, voice, speed });
    });
  }

  private post(req: KokoroRequest) {
    this.worker?.postMessage(req);
  }

  private fail(message: string) {
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
    this.set({ state: 'failed', message });
    this.resolveReady?.(this.status);
  }

  private onMessage(m: KokoroReply) {
    if (m.type === 'progress') this.set({ state: 'loading', progress: m.progress });
    else if (m.type === 'ready') {
      writeLocal(SPEED_KEY, { device: m.device, realTime: m.realTime, firstMs: m.firstMs } satisfies SpeedRecord);
      this.set({ state: 'ready', device: m.device, realTime: m.realTime, firstMs: m.firstMs, fastEnough: m.realTime >= MIN_REAL_TIME });
      this.resolveReady?.(this.status);
    } else if (m.type === 'audio') {
      this.pending.get(m.id)?.(m.samples);
      this.pending.delete(m.id);
    } else if (m.id !== undefined) {
      this.pending.get(m.id)?.(null);
      this.pending.delete(m.id);
    } else this.fail(m.message);
  }
}

export const naturalEngine = new NaturalEngine();

interface Item {
  text: string;
  opts: SpeakOptions;
  audio: Float32Array | null;
  failed: boolean;
  generation: number;
  sampleRate: number;
}

export class NaturalVoice implements Voice {
  readonly id = 'natural';
  readonly available = true;
  private ctx: AudioContext | null = null;
  private queue: Item[] = [];
  private playing: Item | null = null;
  private source: AudioBufferSourceNode | null = null;
  private replyMode: 'natural' | 'fallback' = 'natural';
  /** Bumped by cancel and by a switch to the fast voice, so late audio is ignored. */
  private generation = 0;
  private firstTimer: ReturnType<typeof setTimeout> | undefined;
  private voiceId: string;
  private fallback: Voice;

  constructor(voiceId: string, fallback: Voice) {
    this.voiceId = voiceId;
    this.fallback = fallback;
  }

  get speaking(): boolean {
    return this.queue.length > 0 || this.playing !== null || this.fallback.speaking;
  }

  speak(text: string, opts: SpeakOptions) {
    const startsReply = !this.speaking;
    if (startsReply) {
      const s = naturalEngine.status;
      this.replyMode = s.state === 'ready' && s.fastEnough ? 'natural' : 'fallback';
    }
    if (this.replyMode === 'fallback') {
      this.fallback.speak(text, opts);
      return;
    }
    const item: Item = { text, opts, audio: null, failed: false, generation: this.generation, sampleRate: 24_000 };
    this.queue.push(item);
    void naturalEngine.generate(text, this.voiceId, PACE[opts.persona]).then((samples) => {
      if (item.generation !== this.generation) return;
      if (samples && samples.length) item.audio = samples;
      else item.failed = true;
      this.pump();
    });
    if (startsReply) {
      clearTimeout(this.firstTimer);
      this.firstTimer = setTimeout(() => {
        if (item.generation === this.generation && !item.audio && !this.playing && this.queue[0] === item) this.useFallbackForRest();
      }, FIRST_SENTENCE_WAIT_MS);
    }
  }

  /** The rest of this reply goes to the fast voice, in order. */
  private useFallbackForRest() {
    const rest = this.queue;
    this.queue = [];
    this.generation++;
    this.replyMode = 'fallback';
    for (const it of rest) this.fallback.speak(it.text, it.opts);
  }

  private pump() {
    if (this.playing) return;
    const next = this.queue[0];
    if (!next) return;
    if (next.failed) {
      this.useFallbackForRest();
      return;
    }
    if (!next.audio) return;
    this.queue.shift();
    clearTimeout(this.firstTimer);
    this.play(next);
  }

  private play(item: Item) {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const buffer = this.ctx.createBuffer(1, item.audio!.length, item.sampleRate);
    buffer.copyToChannel(item.audio as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    this.playing = item;
    this.source = src;
    src.onended = () => {
      if (this.source !== src) return;
      this.playing = null;
      this.source = null;
      item.opts.onEnd?.();
      this.pump();
    };
    item.opts.onStart?.();
    src.start();
  }

  cancel() {
    this.generation++;
    clearTimeout(this.firstTimer);
    this.queue = [];
    const src = this.source;
    this.source = null;
    this.playing = null;
    try {
      src?.stop();
    } catch {
      // already stopped
    }
    this.fallback.cancel();
  }
}

/** The interviewer's voice for a setting value: a natural voice, a browser voice, or automatic. */
export function createVoice(setting: () => string): Voice {
  const value = setting();
  if (value.startsWith(NATURAL_PREFIX)) {
    const id = value.slice(NATURAL_PREFIX.length);
    void naturalEngine.load(id);
    return new NaturalVoice(id, new BrowserVoice(() => ''));
  }
  return new BrowserVoice(setting);
}
