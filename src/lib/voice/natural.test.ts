import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_SENTENCE_WAIT_MS, NaturalVoice, naturalEngine } from './natural';
import { writeLocal } from '../storage/local';
import type { SpeakOptions, Voice } from './types';

/** Plays instantly-ending "audio": each buffer ends after `durationMs`. */
class FakeAudioContext {
  static played: number[] = [];
  state = 'running';
  destination = {};
  createBuffer(_c: number, length: number) {
    return { length, copyToChannel() {} };
  }
  createBufferSource() {
    const src = {
      buffer: null as { length: number } | null,
      onended: null as (() => void) | null,
      connect() {},
      start() {
        FakeAudioContext.played.push(src.buffer!.length);
        setTimeout(() => src.onended?.(), 50);
      },
      stop() {},
    };
    return src;
  }
  resume() {
    return Promise.resolve();
  }
}

class FakeFallback implements Voice {
  readonly id = 'fallback';
  readonly available = true;
  said: string[] = [];
  private active = 0;
  get speaking() {
    return this.active > 0;
  }
  speak(text: string, opts: SpeakOptions) {
    this.said.push(text);
    this.active++;
    opts.onStart?.();
    setTimeout(() => {
      this.active--;
      opts.onEnd?.();
    }, 50);
  }
  cancel() {
    this.active = 0;
  }
}

const opts = (log: string[], text: string): SpeakOptions => ({ persona: 'neutral', onStart: () => log.push(`start ${text}`), onEnd: () => log.push(`end ${text}`) });

describe('NaturalVoice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.played = [];
    (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    naturalEngine.status = { state: 'idle' };
  });

  it('speaks a reply in order with the natural voice on a fast device', async () => {
    naturalEngine.status = { state: 'ready', device: 'webgpu', realTime: 20, firstMs: 150, fastEnough: true };
    // The second sentence is ready before the first; order must still hold.
    vi.spyOn(naturalEngine, 'generate').mockImplementation((text) => new Promise((r) => setTimeout(() => r(new Float32Array(text.length)), text.startsWith('One') ? 200 : 100)));
    const fallback = new FakeFallback();
    const v = new NaturalVoice('af_heart', fallback);
    const log: string[] = [];
    v.speak('One sentence.', opts(log, 'one'));
    v.speak('Two.', opts(log, 'two'));
    expect(v.speaking).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual(['start one', 'end one', 'start two', 'end two']);
    expect(FakeAudioContext.played).toEqual(['One sentence.'.length, 'Two.'.length]);
    expect(fallback.said).toEqual([]);
    expect(v.speaking).toBe(false);
  });

  it('gives the whole reply to the fast voice when the first sentence is late', async () => {
    naturalEngine.status = { state: 'ready', device: 'wasm', realTime: 5, firstMs: 500, fastEnough: true };
    vi.spyOn(naturalEngine, 'generate').mockImplementation(() => new Promise((r) => setTimeout(() => r(new Float32Array(10)), FIRST_SENTENCE_WAIT_MS + 500)));
    const fallback = new FakeFallback();
    const v = new NaturalVoice('af_heart', fallback);
    const log: string[] = [];
    v.speak('First.', opts(log, 'first'));
    v.speak('Second.', opts(log, 'second'));
    await vi.advanceTimersByTimeAsync(FIRST_SENTENCE_WAIT_MS + 10);
    // A sentence that arrives after the switch also goes to the fast voice.
    v.speak('Third.', opts(log, 'third'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(fallback.said).toEqual(['First.', 'Second.', 'Third.']);
    expect(FakeAudioContext.played).toEqual([]);
    expect(log.filter((l) => l.startsWith('end'))).toEqual(['end first', 'end second', 'end third']);
  });

  it('uses the fast voice when this device is too slow, or not loaded yet', async () => {
    const gen = vi.spyOn(naturalEngine, 'generate');
    for (const status of [{ state: 'ready', device: 'wasm', realTime: 1.3, firstMs: 1800, fastEnough: false }, { state: 'loading', progress: 40 }] as const) {
      naturalEngine.status = status;
      const fallback = new FakeFallback();
      const v = new NaturalVoice('af_heart', fallback);
      v.speak('Hello.', { persona: 'neutral' });
      await vi.advanceTimersByTimeAsync(200);
      expect(fallback.said).toEqual(['Hello.']);
    }
    expect(gen).not.toHaveBeenCalled();
  });

  it('stops at once when cancelled, and ignores audio that arrives later', async () => {
    naturalEngine.status = { state: 'ready', device: 'webgpu', realTime: 20, firstMs: 150, fastEnough: true };
    vi.spyOn(naturalEngine, 'generate').mockImplementation(() => new Promise((r) => setTimeout(() => r(new Float32Array(10)), 100)));
    const v = new NaturalVoice('af_heart', new FakeFallback());
    const log: string[] = [];
    v.speak('One.', opts(log, 'one'));
    v.speak('Two.', opts(log, 'two'));
    await vi.advanceTimersByTimeAsync(120);
    v.cancel();
    expect(v.speaking).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual(['start one']);
  });

  it('remembers a device that was too slow instead of loading the model again', async () => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeLocal('natural-voice-speed', { device: 'wasm', realTime: 0.4, firstMs: 8000 });
    const worker = vi.fn();
    (globalThis as Record<string, unknown>).Worker = worker;
    const status = await naturalEngine.load('af_heart');
    expect(status).toMatchObject({ state: 'ready', realTime: 0.4, fastEnough: false });
    expect(worker).not.toHaveBeenCalled();
    delete (globalThis as Record<string, unknown>).localStorage;
    delete (globalThis as Record<string, unknown>).Worker;
  });
});
