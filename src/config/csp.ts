/**
 * Content Security Policy for the production build.
 *
 * Keys live in the browser, so cross-site scripting is the main threat. The
 * policy only allows our own scripts, and network calls only to the AI and
 * speech providers the app supports. If you point the custom
 * OpenAI-compatible provider at a host not listed here, add it to
 * `CUSTOM_ENDPOINT_HOSTS` and rebuild.
 *
 * Applied as a <meta> tag by vite.config.ts at build time (not in dev, where
 * Vite injects inline scripts for hot reload).
 */
export const AI_PROVIDER_HOSTS = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
];

export const SPEECH_PROVIDER_HOSTS = [
  'https://api.deepgram.com',
  'wss://api.deepgram.com',
  'https://api.assemblyai.com',
  'wss://streaming.assemblyai.com',
  'wss://api.openai.com',
];

/** Model weights for on-device Whisper, downloaded only when turned on. */
export const MODEL_DOWNLOAD_HOSTS = [
  'https://huggingface.co',
  'https://cdn-lfs.huggingface.co',
  'https://cas-bridge.xethub.hf.co',
  'https://cdn-lfs.hf.co',
];

/** Hosts for the custom OpenAI-compatible provider. Local models and OpenRouter by default. */
export const CUSTOM_ENDPOINT_HOSTS = [
  'https://openrouter.ai',
  'http://localhost:*',
  'http://127.0.0.1:*',
];

export function buildCsp(): string {
  const connect = [
    "'self'",
    ...AI_PROVIDER_HOSTS,
    ...SPEECH_PROVIDER_HOSTS,
    ...MODEL_DOWNLOAD_HOSTS,
    ...CUSTOM_ENDPOINT_HOSTS,
  ];
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    // Monaco injects its own <style> elements at runtime.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
