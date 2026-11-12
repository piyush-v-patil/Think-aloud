/// <reference lib="webworker" />
/**
 * Runs Java in the browser: TeaVM's compiler (javac + TeaVM in WebAssembly)
 * turns the code into a WebAssembly program, which runs here too. The
 * compiler files are served from the app's own origin (public/vendor/teavm).
 * Compiled programs can't reach browser APIs, and once the compiler has
 * loaded, this worker loses network and storage access like the others.
 */
import { executeJava, type JavaToolchain } from './java-exec';
import { createTeaVMToolchain, type TeaVMLoad } from './teavm';
import type { RunRequest, WorkerMessage } from './protocol';
import { lockDownWorker } from './lockdown';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let toolchain: Promise<JavaToolchain> | null = null;

function post(msg: WorkerMessage) {
  ctx.postMessage(msg);
}

async function load(base: string): Promise<JavaToolchain> {
  post({ type: 'loading', message: 'Loading Java' });
  const fetchBytes = async (file: string) => {
    const res = await fetch(`${base}${file}`);
    if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status})`);
    return res.arrayBuffer();
  };
  const [mod, compilerWasm, javaApi, classlib] = await Promise.all([
    import(/* @vite-ignore */ `${base}compiler.wasm-runtime.js`) as Promise<{ load: TeaVMLoad }>,
    fetchBytes('compiler.wasm'),
    fetchBytes('java-api.bin'),
    fetchBytes('runtime-classlib-teavm.bin'),
  ]);
  const tc = await createTeaVMToolchain({ load: mod.load, compilerWasm, javaApi, classlib });
  // Everything is loaded; from here on nothing in this worker may use the network or storage.
  lockDownWorker();
  post({ type: 'ready' });
  return tc;
}

ctx.onmessage = async (event: MessageEvent<{ init?: string } & Partial<RunRequest>>) => {
  const data = event.data;
  if (data.init) {
    toolchain ??= load(data.init);
    return;
  }
  const req = data as RunRequest;
  try {
    const tc = await toolchain!;
    const response = await executeJava(tc, req, undefined, () => post({ type: 'compiled', id: req.id }));
    post({ type: 'result', response });
  } catch (err) {
    post({ type: 'result', response: { id: req.id, fatal: `Java couldn't start: ${err instanceof Error ? err.message : String(err)}`, outcomes: [], stdout: '' } });
  }
};
