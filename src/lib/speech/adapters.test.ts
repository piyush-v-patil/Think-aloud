import { describe, expect, it } from 'vitest';
import { AssemblyFile, DeepgramFile, OpenAIFile, silentWav } from './files';
import { DeepgramLiveTranscriber } from './deepgram-live';
import { alignTranscript } from './align';
import { fakeFetch, json } from '../ai/testing';
import { BrowserTranscriber } from './browser';
import type { Phrase } from './types';
import type { Utterance } from '../types';

const KEY = 'dg-secret-key-1234567890';
const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

describe('Deepgram file transcription', () => {
  it('sends the key in a header, keyterm hints in the query, and returns word timings', async () => {
    const f = fakeFetch(() =>
      json(200, { results: { channels: [{ alternatives: [{ transcript: 'use a hash map', words: [{ word: 'use', punctuated_word: 'Use', start: 0.5, end: 0.7 }, { word: 'map', start: 1.2, end: 1.5 }] }] }] } }),
    );
    const res = await new DeepgramFile(KEY, f.fetch).transcribe(audio, { hints: ['hash map', 'two pointers'] });
    expect(res.words).toEqual([{ w: 'Use', start: 0.5, end: 0.7 }, { w: 'map', start: 1.2, end: 1.5 }]);
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.getAll('keyterm')).toEqual(['hash map', 'two pointers']);
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(f.calls[0].url).not.toContain(KEY);
    expect(f.calls[0].headers.authorization).toBe(`Token ${KEY}`);
  });
  it('maps a rejected key and redacts it', async () => {
    const f = fakeFetch(() => json(401, { err_msg: `Invalid credentials ${KEY}` }));
    const err = await new DeepgramFile(KEY, f.fetch).checkKey().catch((e) => e);
    expect(err.kind).toBe('invalid-key');
    expect(err.message).not.toContain(KEY);
  });
});

describe('AssemblyAI file transcription', () => {
  it('uploads, creates a transcript with keyterms, polls, and converts ms to seconds', async () => {
    let polls = 0;
    const f = fakeFetch((req) => {
      if (req.url.endsWith('/upload')) return json(200, { upload_url: 'https://cdn.assemblyai.com/upload/x' });
      if (req.url.endsWith('/transcript')) return json(200, { id: 't1', status: 'queued' });
      polls++;
      return json(200, polls < 2 ? { status: 'processing' } : { status: 'completed', text: 'hi', words: [{ text: 'hi', start: 1500, end: 1800 }] });
    });
    const res = await new AssemblyFile('aai-key-123456789', f.fetch, 1).transcribe(audio, { hints: ['heap'] });
    expect(res.words).toEqual([{ w: 'hi', start: 1.5, end: 1.8 }]);
    const body = f.calls[1].body as { keyterms_prompt: string[]; audio_url: string; speech_models: string[] };
    expect(body.keyterms_prompt).toEqual(['heap']);
    expect(body.speech_models[0]).toBe('universal-3.5-pro');
    expect(f.calls[0].headers.authorization).toBe('aai-key-123456789');
  });
  it('reports a failed transcript', async () => {
    const f = fakeFetch((req) => (req.url.endsWith('/upload') ? json(200, { upload_url: 'u' }) : req.url.endsWith('/transcript') ? json(200, { id: 't' }) : json(200, { status: 'error', error: 'bad audio' })));
    await expect(new AssemblyFile('k-123456789', f.fetch, 1).transcribe(audio, { hints: [] })).rejects.toMatchObject({ kind: 'bad-request' });
  });
});

describe('OpenAI file transcription', () => {
  it('asks for word timestamps and passes hints as a prompt', async () => {
    const f = fakeFetch(() => json(200, { text: 'sort it', words: [{ word: 'sort', start: 0.1, end: 0.4 }] }));
    const res = await new OpenAIFile('sk-proj-abcdefghij', f.fetch).transcribe(audio, { hints: ['binary search'] });
    expect(res.words[0]).toEqual({ w: 'sort', start: 0.1, end: 0.4 });
    const form = f.calls[0].body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.getAll('timestamp_granularities[]')).toEqual(['word']);
    expect(String(form.get('prompt'))).toContain('binary search');
  });
  it('maps rate limits', async () => {
    const f = fakeFetch(() => json(429, { error: { message: 'slow down' } }));
    await expect(new OpenAIFile('sk-proj-abcdefghij', f.fetch).checkKey()).rejects.toMatchObject({ kind: 'rate-limit' });
  });
});

describe('silentWav', () => {
  it('builds a valid WAV header', async () => {
    const b = silentWav(100, 16000);
    const v = new DataView(await b.arrayBuffer());
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(40, true)).toBe(3200);
  });
});

class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  sent: unknown[] = [];
  url: string;
  protocols: string[];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
  }
  send(d: unknown) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

describe('Deepgram live transcription', () => {
  it('authenticates with a subprotocol and puts results on the session clock', async () => {
    (globalThis as unknown as { WebSocket: { OPEN: number } }).WebSocket ??= { OPEN: 1 } as never;
    let sock: FakeSocket | null = null;
    let now = 10_000;
    const t = new DeepgramLiveTranscriber(KEY, () => now, (u, p) => (sock = new FakeSocket(u, p)) as unknown as WebSocket);
    t.setHints(['heap']);
    const phrases: Phrase[] = [];
    const interims: string[] = [];
    let fatal = false;
    const ready = t.connect({ onPhrase: (p) => phrases.push(p), onInterim: (x) => interims.push(x), onError: (_e, f) => (fatal = f) }, null);
    sock!.open();
    await ready;
    expect(sock!.protocols).toEqual(['token', KEY]);
    expect(sock!.url).not.toContain(KEY);
    expect(new URL(sock!.url).searchParams.getAll('keyterm')).toEqual(['heap']);
    now = 99_999;
    sock!.message({ type: 'Results', is_final: false, start: 1, duration: 0.5, channel: { alternatives: [{ transcript: 'can the' }] } });
    sock!.message({ type: 'Results', is_final: true, start: 1, duration: 2, channel: { alternatives: [{ transcript: 'can the list be empty', words: [{ word: 'can', start: 1, end: 1.2 }] }] } });
    expect(interims[0]).toBe('can the');
    expect(phrases[0]).toMatchObject({ text: 'can the list be empty', t0: 11_000, t1: 13_000, words: [{ w: 'can', t0: 11_000, t1: 11_200 }] });
    expect(t.secondsStreamed).toBe(3);
    sock!.onclose?.({ code: 1011 });
    expect(fatal).toBe(true);
  });
});

describe('alignTranscript', () => {
  const live: Utterance[] = [
    { id: 'i1', speaker: 'interviewer', t0: 0, t1: 4000, text: 'Hi there', source: 'model' },
    { id: 'u1', speaker: 'user', t0: 5000, t1: 7000, text: 'can the list be MT', source: 'browser' },
    { id: 'i2', speaker: 'interviewer', t0: 9000, t1: 10_000, text: 'Yes', source: 'model' },
  ];
  it('puts recording-relative words on the session clock and drops echo of the interviewer', () => {
    const t = alignTranscript({
      engine: 'deepgram',
      offsetMs: 500,
      live,
      words: [
        { w: 'Hi', start: 0.5, end: 0.8 }, // echo during interviewer line
        { w: 'can', start: 4.6, end: 4.8 },
        { w: 'the', start: 4.9, end: 5 },
        { w: 'list', start: 5.1, end: 5.3 },
        { w: 'be', start: 5.4, end: 5.5 },
        { w: 'empty?', start: 5.6, end: 6 },
        { w: 'Okay.', start: 10, end: 10.4 },
      ],
    });
    expect(t.engine).toBe('deepgram');
    expect(t.utterances.map((u) => [u.speaker, u.t0, u.text])).toEqual([
      ['interviewer', 0, 'Hi there'],
      ['user', 5100, 'can the list be empty?'],
      ['interviewer', 9000, 'Yes'],
      ['user', 10_500, 'Okay.'],
    ]);
    expect(t.utterances[1].words![0]).toEqual({ w: 'can', t0: 5100, t1: 5300 });
  });
});

describe('BrowserTranscriber', () => {
  it('reports when the browser has no speech recognition', async () => {
    await expect(new BrowserTranscriber(() => 0).start({})).rejects.toMatchObject({ kind: 'not-supported' });
  });
});

describe('engine choice', async () => {
  const { chooseLiveEngine, chooseAccurateEngine } = await import('./choose');
  const { DEFAULT_SETTINGS } = await import('../../state/settings');
  const { setKey, clearAllKeys } = await import('../../state/keys');
  const { chunksToWords } = await import('./whisper');
  it('uses the free browser engine by default and a paid engine only with a key', () => {
    clearAllKeys();
    const s = { ...DEFAULT_SETTINGS, speech: { ...DEFAULT_SETTINGS.speech, paidEngine: 'deepgram' as const, paidLive: true } };
    expect(chooseLiveEngine(DEFAULT_SETTINGS, true)).toBe('browser');
    expect(chooseLiveEngine(DEFAULT_SETTINGS, false)).toBe('text');
    expect(chooseLiveEngine(s, true)).toBe('browser');
    expect(chooseAccurateEngine(s)).toBeUndefined();
    setKey('deepgram', 'dg-key-123456789', false);
    expect(chooseLiveEngine(s, true)).toBe('deepgram');
    expect(chooseAccurateEngine(s)).toBe('deepgram');
    // AssemblyAI can't stream from a browser, so live stays on the browser engine.
    setKey('assemblyai', 'aai-key-123456789', false);
    expect(chooseLiveEngine({ ...s, speech: { ...s.speech, paidEngine: 'assemblyai' } }, true)).toBe('browser');
    expect(chooseAccurateEngine({ ...DEFAULT_SETTINGS, speech: { ...DEFAULT_SETTINGS.speech, onDevice: true } })).toBe('whisper-local');
    clearAllKeys();
  });
  it('reuses the OpenAI AI key for transcription when asked', async () => {
    const { speechKeyName } = await import('./choose');
    expect(speechKeyName('openai', { ...DEFAULT_SETTINGS, provider: 'openai', speech: { ...DEFAULT_SETTINGS.speech, reuseOpenAIKey: true } })).toBe('openai');
    expect(speechKeyName('openai', DEFAULT_SETTINGS)).toBe('openai-speech');
  });
  it('turns Whisper word chunks into words', () => {
    expect(chunksToWords([{ text: ' hash', timestamp: [1, 1.4] }, { text: ' ', timestamp: [1.4, 1.5] }, { text: 'map', timestamp: [1.5, null] }])).toEqual([
      { w: 'hash', start: 1, end: 1.4 },
      { w: 'map', start: 1.5, end: 1.8 },
    ]);
  });
});
