/**
 * Paid file transcription (engine 3) with the user's own key, for the
 * accurate transcript after the interview. Each returns word timings.
 * All three providers allow these calls directly from the browser; keys go
 * in headers, never in URLs.
 */
import type { SpeechEngineId } from '../types';
import type { Word } from './align';
import { ProviderError, kindFromStatus, redact } from '../ai/errors';
import { SPEECH_ENGINES } from '../../config/speech';

export interface FileTranscriber {
  readonly engine: SpeechEngineId;
  transcribe(audio: Blob, opts: { hints: string[]; signal?: AbortSignal }): Promise<{ words: Word[]; text: string }>;
  /** A cheap real call that proves the key works. */
  checkKey(): Promise<void>;
}

type Fetch = typeof fetch;

async function fail(res: Response, key: string): Promise<never> {
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.text();
    message = redact(body.slice(0, 300), [key]);
  } catch {
    // ignore
  }
  throw new ProviderError(kindFromStatus(res.status, message), message, res.status);
}

async function call(f: Fetch, url: string, init: RequestInit, key: string): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ProviderError('aborted', 'Cancelled');
    throw new ProviderError('network', 'Could not reach the speech service.');
  }
  if (!res.ok) await fail(res, key);
  return res;
}

/** A tiny silent WAV, used to check keys for engines without a free endpoint. */
export function silentWav(ms = 250, rate = 16000): Blob {
  const samples = Math.round((rate * ms) / 1000);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export class DeepgramFile implements FileTranscriber {
  readonly engine = 'deepgram' as const;
  private key: string;
  private f: Fetch;
  constructor(key: string, f: Fetch = fetch.bind(globalThis)) {
    this.key = key;
    this.f = f;
  }
  private url(hints: string[]) {
    const p = new URLSearchParams({ model: SPEECH_ENGINES.deepgram.fileModel!, smart_format: 'true', punctuate: 'true' });
    for (const h of hints.slice(0, 50)) p.append('keyterm', h);
    return `https://api.deepgram.com/v1/listen?${p}`;
  }
  async transcribe(audio: Blob, opts: { hints: string[]; signal?: AbortSignal }) {
    const res = await call(this.f, this.url(opts.hints), { method: 'POST', headers: { Authorization: `Token ${this.key}`, 'Content-Type': audio.type || 'audio/webm' }, body: audio, signal: opts.signal }, this.key);
    const data = (await res.json()) as { results?: { channels?: { alternatives?: { transcript: string; words: { word: string; punctuated_word?: string; start: number; end: number }[] }[] }[] } };
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    return { text: alt?.transcript ?? '', words: (alt?.words ?? []).map((w) => ({ w: w.punctuated_word ?? w.word, start: w.start, end: w.end })) };
  }
  async checkKey() {
    await this.transcribe(silentWav(), { hints: [] });
  }
}

export class AssemblyFile implements FileTranscriber {
  readonly engine = 'assemblyai' as const;
  private key: string;
  private f: Fetch;
  private pollMs: number;
  constructor(key: string, f: Fetch = fetch.bind(globalThis), pollMs = 2000) {
    this.key = key;
    this.f = f;
    this.pollMs = pollMs;
  }
  async transcribe(audio: Blob, opts: { hints: string[]; signal?: AbortSignal }) {
    const base = 'https://api.assemblyai.com/v2';
    const auth = { Authorization: this.key };
    const up = await call(this.f, `${base}/upload`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: audio, signal: opts.signal }, this.key);
    const { upload_url } = (await up.json()) as { upload_url: string };
    const created = await call(
      this.f,
      `${base}/transcript`,
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: upload_url,
          speech_models: [SPEECH_ENGINES.assemblyai.fileModel, 'universal-2'],
          ...(opts.hints.length ? { keyterms_prompt: opts.hints.slice(0, 100) } : {}),
        }),
        signal: opts.signal,
      },
      this.key,
    );
    const { id } = (await created.json()) as { id: string };
    for (;;) {
      await new Promise((r) => setTimeout(r, this.pollMs));
      const res = await call(this.f, `${base}/transcript/${encodeURIComponent(id)}`, { headers: auth, signal: opts.signal }, this.key);
      const t = (await res.json()) as { status: string; error?: string; text?: string; words?: { text: string; start: number; end: number }[] };
      if (t.status === 'error') throw new ProviderError('bad-request', t.error ?? 'Transcription failed');
      if (t.status === 'completed') return { text: t.text ?? '', words: (t.words ?? []).map((w) => ({ w: w.text, start: w.start / 1000, end: w.end / 1000 })) };
    }
  }
  async checkKey() {
    await call(this.f, 'https://api.assemblyai.com/v2/transcript?limit=1', { headers: { Authorization: this.key } }, this.key);
  }
}

export class OpenAIFile implements FileTranscriber {
  readonly engine = 'openai' as const;
  private key: string;
  private f: Fetch;
  constructor(key: string, f: Fetch = fetch.bind(globalThis)) {
    this.key = key;
    this.f = f;
  }
  async transcribe(audio: Blob, opts: { hints: string[]; signal?: AbortSignal }) {
    const form = new FormData();
    const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('wav') ? 'wav' : 'webm';
    form.append('file', audio, `interview.${ext}`);
    // Word timestamps are needed to line the transcript up with the replay.
    form.append('model', SPEECH_ENGINES.openai.fileModel!);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    if (opts.hints.length) form.append('prompt', `A coding interview. Terms: ${opts.hints.join(', ')}.`);
    const res = await call(this.f, 'https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, body: form, signal: opts.signal }, this.key);
    const data = (await res.json()) as { text?: string; words?: { word: string; start: number; end: number }[] };
    return { text: data.text ?? '', words: (data.words ?? []).map((w) => ({ w: w.word, start: w.start, end: w.end })) };
  }
  async checkKey() {
    await call(this.f, 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${this.key}` } }, this.key);
  }
}

export function fileTranscriber(engine: SpeechEngineId, key: string): FileTranscriber | null {
  if (engine === 'deepgram') return new DeepgramFile(key);
  if (engine === 'assemblyai') return new AssemblyFile(key);
  if (engine === 'openai') return new OpenAIFile(key);
  return null;
}
