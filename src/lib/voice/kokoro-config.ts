/** Shared between the natural-voice worker and the page. */

export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** Setting values for natural voices start with this; the rest is the Kokoro voice id. */
export const NATURAL_PREFIX = 'kokoro:';

/**
 * American English voices with the best quality grades in Kokoro's own
 * voice notes. (The British voices expect British pronunciation, which
 * our lexicon doesn't have.)
 */
export const NATURAL_VOICES: { id: string; name: string; gender: 'female' | 'male' }[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female' },
  { id: 'af_bella', name: 'Bella', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female' },
  { id: 'am_michael', name: 'Michael', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'male' },
  { id: 'am_puck', name: 'Puck', gender: 'male' },
];

/** Approximate one-time download, by where the model runs. */
export const NATURAL_DOWNLOAD_MB = { webgpu: 330, wasm: 95 };

export type KokoroRequest =
  | { type: 'load'; lexiconUrl: string; wasmPaths: string; voice: string }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number };

export type KokoroReply =
  | { type: 'progress'; progress: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm'; realTime: number; firstMs: number }
  | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; message: string };
