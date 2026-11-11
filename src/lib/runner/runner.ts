/**
 * Runs the user's code in a sandboxed Web Worker with a timeout. A worker
 * that runs past the timeout is terminated and replaced, which is the only
 * reliable way to stop an infinite loop in the browser.
 */
import type { FunctionSignature, Language, TestCase, TestResult, TestRun } from '../types';
import type { RunRequest, RunResponse, WorkerMessage } from './protocol';
import { valuesMatch } from './compare';

export const DEFAULT_TIMEOUT_MS = 6000;

type Pending = { resolve: (r: RunResponse) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> };

class LanguageWorker {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private readyPromise: Promise<void> | null = null;
  private language: Language;
  onStatus?: (status: string | null) => void;

  constructor(language: Language) {
    this.language = language;
  }

  private spawn(): Promise<void> {
    const worker =
      this.language === 'python'
        ? new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.readyPromise = new Promise<void>((resolveReady) => {
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        if (msg.type === 'loading') this.onStatus?.(msg.message);
        if (msg.type === 'ready') {
          this.onStatus?.(null);
          resolveReady();
        }
        if (msg.type === 'result') {
          const p = this.pending.get(msg.response.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.response.id);
            p.resolve(msg.response);
          }
        }
      };
      worker.onerror = (event) => {
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error(event.message || 'The code runner stopped unexpectedly.'));
          this.pending.delete(id);
        }
      };
    });
    if (this.language === 'python') {
      worker.postMessage({ init: new URL('vendor/pyodide/', document.baseURI).href });
    }
    return this.readyPromise;
  }

  warm(): Promise<void> {
    return this.readyPromise ?? this.spawn();
  }

  async run(req: RunRequest, timeoutMs: number): Promise<RunResponse> {
    await this.warm();
    return new Promise<RunResponse>((resolve, reject) => {
      const pending: Pending = { resolve, reject };
      pending.timer = setTimeout(() => {
        this.pending.delete(req.id);
        this.restart();
        resolve({
          id: req.id,
          fatal: `Your code ran for more than ${Math.round(timeoutMs / 1000)} seconds, so it was stopped. Check for a loop that never ends.`,
          outcomes: [],
          stdout: '',
        });
      }, timeoutMs);
      this.pending.set(req.id, pending);
      this.worker!.postMessage(req);
    });
  }

  private restart() {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }

  dispose() {
    this.restart();
  }
}

/** Turns raw worker outcomes into test results using each test's compare mode. */
export function toTestRun(t: number, tests: TestCase[], response: RunResponse): TestRun {
  if (response.fatal) {
    return { t, results: [], passed: 0, total: tests.length, error: response.fatal, stdout: response.stdout };
  }
  const results: TestResult[] = tests.map((test, i) => {
    const o = response.outcomes[i];
    if (!o) return { name: test.name, passed: false, hidden: test.hidden, error: 'Not run' };
    const passed = o.ok && valuesMatch(o.actual, test.expected, test.compare ?? 'exact');
    return {
      name: test.name,
      passed,
      hidden: test.hidden,
      args: test.args,
      expected: test.expected,
      actual: o.ok ? o.actual : undefined,
      error: o.error,
      stdout: o.stdout || undefined,
      ms: Math.round(o.ms * 10) / 10,
    };
  });
  return {
    t,
    results,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    stdout: response.stdout || undefined,
  };
}

export class CodeRunner {
  private workers: Partial<Record<Language, LanguageWorker>> = {};
  private nextId = 1;
  onStatus?: (status: string | null) => void;

  private get(language: Language): LanguageWorker {
    let w = this.workers[language];
    if (!w) {
      w = new LanguageWorker(language);
      w.onStatus = (s) => this.onStatus?.(s);
      this.workers[language] = w;
    }
    return w;
  }

  /** Starts loading a language runtime ahead of time (Python takes a few seconds). */
  warm(language: Language): Promise<void> {
    return this.get(language).warm();
  }

  async runTests(
    language: Language,
    code: string,
    signature: FunctionSignature,
    tests: TestCase[],
    t: number,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<TestRun> {
    const req: RunRequest = { id: this.nextId++, code, signature, tests, mode: 'tests' };
    const res = await this.get(language).run(req, timeoutMs);
    return toTestRun(t, tests, res);
  }

  async runScript(language: Language, code: string, t: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<TestRun> {
    const req: RunRequest = { id: this.nextId++, code, tests: [], mode: 'script' };
    const res = await this.get(language).run(req, timeoutMs);
    return { t, results: [], passed: 0, total: 0, error: res.fatal, stdout: res.stdout };
  }

  dispose() {
    for (const w of Object.values(this.workers)) w?.dispose();
    this.workers = {};
  }
}
