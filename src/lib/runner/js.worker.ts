/// <reference lib="webworker" />
import { executeJs } from './js-exec';
import type { RunRequest, WorkerMessage } from './protocol';
import { lockDownWorker } from './lockdown';

lockDownWorker();

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.postMessage({ type: 'ready' } satisfies WorkerMessage);
ctx.onmessage = (event: MessageEvent<RunRequest>) => {
  ctx.postMessage({ type: 'result', response: executeJs(event.data) } satisfies WorkerMessage);
};
