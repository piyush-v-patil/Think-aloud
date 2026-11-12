/// <reference lib="webworker" />
/**
 * The natural voice: Kokoro (82M parameters, Apache-2.0) running on this
 * device, on the GPU through WebGPU where available. Text never leaves the
 * device. The model and voice files are downloaded from Hugging Face the
 * first time and cached by the browser.
 */
import { AutoTokenizer, StyleTextToSpeech2Model, Tensor, env } from '@huggingface/transformers';
import { parseLexicon, phonemize, type Lexicon } from './g2p';
import { KOKORO_MODEL, type KokoroReply, type KokoroRequest } from './kokoro-config';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const SAMPLE_RATE = 24_000;

type Model = (inputs: Record<string, unknown>) => Promise<{ waveform: { data: Float32Array } }>;
type Tokenizer = (text: string, opts: object) => { input_ids: { dims: number[] } };

let model: Model | null = null;
let tokenizer: Tokenizer | null = null;
let lexicon: Lexicon | null = null;
const styles = new Map<string, Float32Array>();

/** Voice style vectors: 510 x 256 floats per voice, picked by input length. */
async function style(voice: string): Promise<Float32Array> {
  const hit = styles.get(voice);
  if (hit) return hit;
  if (!/^[a-z]{2}_[a-z]+$/.test(voice)) throw new Error('Unknown voice');
  const url = `https://huggingface.co/${KOKORO_MODEL}/resolve/main/voices/${voice}.bin`;
  let buf: ArrayBuffer | undefined;
  const cache = await caches.open('think-aloud-voices').catch(() => null);
  const cached = await cache?.match(url);
  if (cached) buf = await cached.arrayBuffer();
  else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Voice download failed (${res.status})`);
    buf = await res.arrayBuffer();
    await cache?.put(url, new Response(buf.slice(0))).catch(() => {});
  }
  const data = new Float32Array(buf);
  styles.set(voice, data);
  return data;
}

async function generate(text: string, voice: string, speed: number): Promise<Float32Array> {
  const phonemes = phonemize(text, lexicon!);
  if (!phonemes) return new Float32Array(0);
  const { input_ids } = tokenizer!(phonemes, { truncation: true });
  const n = input_ids.dims.at(-1)! - 2;
  const all = await style(voice);
  const offset = 256 * Math.min(Math.max(n, 0), 509);
  const { waveform } = await model!({
    input_ids,
    style: new Tensor('float32', all.slice(offset, offset + 256), [1, 256]),
    speed: new Tensor('float32', [speed], [1]),
  });
  // A copy, so it can be handed to the page without touching the runtime's buffers.
  return new Float32Array(waveform.data);
}

async function load(req: Extract<KokoroRequest, { type: 'load' }>) {
  env.allowLocalModels = false;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: string; numThreads?: number } };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = req.wasmPaths;
    onnx.wasm.numThreads = 1;
  }
  const lexText = await (await fetch(req.lexiconUrl)).text();
  lexicon = parseLexicon(lexText);
  tokenizer = (await AutoTokenizer.from_pretrained(KOKORO_MODEL)) as unknown as Tokenizer;

  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  let device: 'webgpu' | 'wasm' = gpu && (await gpu.requestAdapter().catch(() => null)) ? 'webgpu' : 'wasm';
  const fromPretrained = (d: 'webgpu' | 'wasm') =>
    StyleTextToSpeech2Model.from_pretrained(KOKORO_MODEL, {
      device: d,
      // The quantized model isn't reliable on WebGPU; full precision is.
      dtype: d === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status === 'progress' && p.file?.endsWith('.onnx')) ctx.postMessage({ type: 'progress', progress: p.progress ?? 0 } satisfies KokoroReply);
      },
    }) as unknown as Promise<Model>;
  try {
    model = await fromPretrained(device);
  } catch {
    // WebGPU can be listed but unusable; WebAssembly works everywhere.
    device = 'wasm';
    model = await fromPretrained('wasm');
  }

  // Speed check on a typical first sentence. The first run includes
  // compiling for the GPU, so time the second.
  const sample = 'Thanks for joining. Take a moment to read the problem.';
  await generate(sample, req.voice, 1);
  const t0 = performance.now();
  const audio = await generate(sample, req.voice, 1);
  const ms = performance.now() - t0;
  const realTime = audio.length / SAMPLE_RATE / (ms / 1000);
  ctx.postMessage({ type: 'ready', device, realTime, firstMs: ms } satisfies KokoroReply);
}

// One request at a time, in order: sentences must come out in the order they're spoken.
let queue = Promise.resolve();

ctx.onmessage = (e: MessageEvent<KokoroRequest>) => {
  const req = e.data;
  queue = queue.then(async () => {
    try {
      if (req.type === 'load') await load(req);
      else {
        const samples = await generate(req.text, req.voice, req.speed);
        ctx.postMessage({ type: 'audio', id: req.id, samples, sampleRate: SAMPLE_RATE } satisfies KokoroReply, [samples.buffer]);
      }
    } catch (err) {
      ctx.postMessage({ type: 'error', id: req.type === 'speak' ? req.id : undefined, message: err instanceof Error ? err.message : String(err) } satisfies KokoroReply);
    }
  });
};
