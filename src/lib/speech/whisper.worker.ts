/// <reference lib="webworker" />
/**
 * On-device Whisper (engine 2). Audio never leaves this device. The model
 * is downloaded from Hugging Face the first time and cached by the browser.
 */
import { env, pipeline } from '@huggingface/transformers';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface Request {
  audio: Float32Array;
  model: string;
  wasmPaths: string;
}

let asr: Promise<(audio: Float32Array, opts: object) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>> | null = null;

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const { audio, model, wasmPaths } = e.data;
  try {
    env.allowLocalModels = false;
    const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string; numThreads?: number } };
    if (onnx.wasm) {
      // Served from our own origin, not a CDN. One thread: static hosts
      // can't enable the cross-origin isolation that threads need.
      onnx.wasm.wasmPaths = wasmPaths;
      onnx.wasm.numThreads = 1;
    }
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    let device: 'webgpu' | 'wasm' = gpu && (await gpu.requestAdapter().catch(() => null)) ? 'webgpu' : 'wasm';
    const load = (d: 'webgpu' | 'wasm') =>
      pipeline('automatic-speech-recognition', model, {
        device: d,
        dtype: d === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (p.status === 'progress') ctx.postMessage({ type: 'progress', file: p.file, progress: p.progress ?? 0 });
        },
      }) as never;
    if (!asr) {
      asr = load(device);
      try {
        await asr;
      } catch {
        // WebGPU can be listed but unusable; WebAssembly works everywhere.
        device = 'wasm';
        asr = load('wasm');
      }
    }
    const run = await asr!;
    ctx.postMessage({ type: 'status', status: 'transcribing', device });
    const out = await run(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    ctx.postMessage({ type: 'done', text: out.text, chunks: out.chunks ?? [] });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
