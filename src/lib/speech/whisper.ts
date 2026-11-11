/**
 * Engine 2 wrapper: decodes the recording to 16 kHz mono, runs Whisper in a
 * worker, and returns word timings. Needs a capable computer; WebGPU is
 * used when available, WebAssembly otherwise.
 */
import type { FileTranscriber } from './files';
import type { Word } from './align';
import { ProviderError } from '../ai/errors';

// A "_timestamped" export includes the attention outputs word timestamps need.
export const WHISPER_MODEL = 'onnx-community/whisper-base.en_timestamped';

export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const frames = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

export function chunksToWords(chunks: { text: string; timestamp: [number, number | null] }[]): Word[] {
  return chunks
    .map((c) => ({ w: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
    .filter((w) => w.w);
}

export class WhisperLocal implements FileTranscriber {
  readonly engine = 'whisper-local' as const;
  onProgress?: (fraction: number) => void;

  async transcribe(audio: Blob): Promise<{ words: Word[]; text: string }> {
    const samples = await decodeTo16k(audio);
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        const files = new Map<string, number>();
        worker.onmessage = (e: MessageEvent<{ type: string; text?: string; chunks?: never[]; message?: string; file?: string; progress?: number }>) => {
          const m = e.data;
          if (m.type === 'progress' && m.file) {
            files.set(m.file, m.progress ?? 0);
            const all = [...files.values()];
            this.onProgress?.(all.reduce((a, b) => a + b, 0) / (all.length * 100));
          }
          if (m.type === 'done') resolve({ text: m.text ?? '', words: chunksToWords(m.chunks ?? []) });
          if (m.type === 'error') reject(new ProviderError('unknown', m.message ?? 'On-device transcription failed.'));
        };
        worker.onerror = (e) => reject(new ProviderError('unknown', e.message || 'On-device transcription failed.'));
        worker.postMessage({ audio: samples, model: WHISPER_MODEL, wasmPaths: new URL('vendor/ort/', document.baseURI).href }, [samples.buffer]);
      });
    } finally {
      worker.terminate();
    }
  }

  async checkKey() {}
}

export function whisperCapable(): { ok: boolean; webgpu: boolean } {
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return { ok: memory === undefined || memory >= 4, webgpu };
}
