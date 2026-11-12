/// <reference lib="webworker" />
import { executePython, installHarness, type PyodideLike } from './python-harness';
import type { RunRequest, WorkerMessage } from './protocol';
import { lockDownWorker } from './lockdown';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let pyodide: Promise<PyodideLike> | null = null;

function post(msg: WorkerMessage) {
  ctx.postMessage(msg);
}

async function load(indexURL: string): Promise<PyodideLike> {
  post({ type: 'loading', message: 'Loading Python' });
  // Served from our own origin (public/vendor/pyodide), never a CDN.
  const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
    loadPyodide(opts: { indexURL: string; stdout?: (s: string) => void }): Promise<PyodideLike>;
  };
  const py = await mod.loadPyodide({ indexURL, stdout: () => {} });
  installHarness(py);
  // Python is loaded; from here on no code in this worker may use the network or storage.
  lockDownWorker();
  post({ type: 'ready' });
  return py;
}

ctx.onmessage = async (event: MessageEvent<{ init?: string } & Partial<RunRequest>>) => {
  const data = event.data;
  if (data.init) {
    pyodide ??= load(data.init);
    pyodide.catch((err) => post({ type: 'failed', message: `Python couldn't load: ${err instanceof Error ? err.message : String(err)}` }));
    return;
  }
  const req = data as RunRequest;
  try {
    const py = await pyodide!;
    post({ type: 'result', response: executePython(py, req) });
  } catch (err) {
    post({
      type: 'result',
      response: { id: req.id, fatal: `Python couldn't start: ${String(err)}`, outcomes: [], stdout: '' },
    });
  }
};
