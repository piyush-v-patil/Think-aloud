/**
 * Gets a language's code runner ready before the interview: downloads its
 * files with visible progress (so the worker then finds them in the browser
 * cache), then starts the shared runner.
 */
import type { Language } from '../types';
import { sharedRunner } from '../runner/shared';
import { createStore } from '../../state/store';

/** Files each runtime loads, relative to the app. JavaScript needs none. */
export const RUNTIME_FILES: Record<Language, string[]> = {
  python: [
    'vendor/pyodide/pyodide.mjs',
    'vendor/pyodide/pyodide.asm.js',
    'vendor/pyodide/pyodide.asm.wasm',
    'vendor/pyodide/python_stdlib.zip',
    'vendor/pyodide/pyodide-lock.json',
  ],
  javascript: [],
  java: ['vendor/teavm/compiler.wasm-runtime.js', 'vendor/teavm/compiler.wasm', 'vendor/teavm/java-api.bin', 'vendor/teavm/runtime-classlib-teavm.bin'],
};

export type RuntimeState =
  | { state: 'idle' }
  | { state: 'downloading'; loaded: number; total: number }
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'failed'; message: string };

export const runtimeStore = createStore<Record<Language, RuntimeState>>({
  python: { state: 'idle' },
  javascript: { state: 'idle' },
  java: { state: 'idle' },
});

function set(language: Language, s: RuntimeState) {
  runtimeStore.set((all) => ({ ...all, [language]: s }));
}

/** Reads every file to the end, reporting bytes as they arrive. */
export async function downloadWithProgress(urls: string[], onProgress: (loaded: number, total: number) => void, f: typeof fetch = fetch): Promise<void> {
  const sizes = new Map<string, number>();
  const loaded = new Map<string, number>();
  const report = () => {
    const done = [...loaded.values()].reduce((a, b) => a + b, 0);
    const total = urls.reduce((sum, u) => sum + Math.max(sizes.get(u) ?? 0, loaded.get(u) ?? 0), 0);
    onProgress(done, total);
  };
  await Promise.all(
    urls.map(async (url) => {
      const res = await f(url);
      if (!res.ok || !res.body) throw new Error(`Couldn't download ${url.split('/').pop()} (${res.status})`);
      sizes.set(url, Number(res.headers.get('content-length')) || 0);
      loaded.set(url, 0);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded.set(url, (loaded.get(url) ?? 0) + value.byteLength);
        report();
      }
      report();
    }),
  );
}

const started = new Map<Language, Promise<void>>();

/** Starts getting a language ready (once). Safe to call repeatedly; retries after a failure. */
export function prepareRuntime(language: Language): Promise<void> {
  const current = runtimeStore.get()[language];
  if (started.has(language) && current.state !== 'failed') return started.get(language)!;
  const job = (async () => {
    try {
      const files = RUNTIME_FILES[language].map((p) => new URL(p, document.baseURI).href);
      if (files.length) {
        set(language, { state: 'downloading', loaded: 0, total: 0 });
        await downloadWithProgress(files, (loaded, total) => set(language, { state: 'downloading', loaded, total }));
      }
      set(language, { state: 'starting' });
      await sharedRunner.warm(language);
      set(language, { state: 'ready' });
    } catch (err) {
      set(language, { state: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  })();
  started.set(language, job);
  return job;
}
