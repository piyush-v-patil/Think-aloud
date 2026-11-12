/**
 * Prepares LeetCode problems ahead of time, one after another, so they're
 * ready to practice with nothing to paste. Each problem is written by the
 * user's AI in its own words (see prepareFromLeetCode) and stored on this
 * device. Runs in the background while the user moves around the app.
 */
import { createStore } from '../../state/store';
import { settingsStore } from '../../state/settings';
import { createProvider } from '../ai/factory';
import { usageRecord } from '../ai/usage';
import { providerConfig, modelsFor, strongestModel } from '../../config/providers';
import { CodeRunner } from '../runner/runner';
import { ProviderError } from '../ai/errors';
import { leetcodeProblemId, prepareFromLeetCode, UnknownProblemError, type LeetCodeTarget } from '../problems/prepare';
import { getProblem, problemIds, saveProblem } from '../storage/db';
import type { Language, Problem, UsageRecord } from '../types';

export interface QueueState {
  /** Slugs of problems already prepared on this device. */
  prepared: Set<string>;
  pending: LeetCodeTarget[];
  current: LeetCodeTarget | null;
  failed: { slug: string; title: string; unknown: boolean; message: string }[];
  /** How many were queued in this run, for "3 of 10". */
  total: number;
}

export const queueStore = createStore<QueueState>({ prepared: new Set(), pending: [], current: null, failed: [], total: 0 });

let loaded: Promise<void> | null = null;

/** Finds which LeetCode problems are already prepared on this device. */
export function loadPrepared(): Promise<void> {
  loaded ??= problemIds().then((ids) => {
    const prepared = new Set(ids.filter((id) => id.startsWith('lc-')).map((id) => id.slice(3)));
    queueStore.set((s) => ({ ...s, prepared: new Set([...s.prepared, ...prepared]) }));
  });
  return loaded;
}

export function markPrepared(slug: string) {
  queueStore.set((s) => ({ ...s, prepared: new Set([...s.prepared, slug]) }));
}

let abort: AbortController | null = null;
let running = false;
/** The problem the queue is writing now, so setup can wait for it instead of writing it twice. */
let inflight: { slug: string; promise: Promise<Problem> } | null = null;

/** Adds problems to the queue (skipping ones prepared, queued or running) and starts it. */
export function enqueue(targets: LeetCodeTarget[]): number {
  const s = queueStore.get();
  const busy = new Set([...s.pending.map((t) => t.slug), ...(s.current ? [s.current.slug] : [])]);
  const fresh = targets.filter((t) => !s.prepared.has(t.slug) && !busy.has(t.slug));
  if (!fresh.length) return 0;
  queueStore.set((q) => ({
    ...q,
    pending: [...q.pending, ...fresh],
    failed: q.failed.filter((f) => !fresh.some((t) => t.slug === f.slug)),
    total: (q.current || q.pending.length ? q.total : 0) + fresh.length,
  }));
  if (!running) void run();
  return fresh.length;
}

/** Stops after cancelling the problem being written now. */
export function stopQueue() {
  queueStore.set((s) => ({ ...s, pending: [] }));
  abort?.abort();
}

/**
 * Writes one problem now. Used by the queue, and by setup when the
 * candidate starts a problem that isn't prepared yet.
 */
export async function prepareOne(target: LeetCodeTarget, opts: { signal?: AbortSignal; onStage?: Parameters<typeof prepareFromLeetCode>[1]['onStage'] } = {}): Promise<Problem> {
  const settings = settingsStore.get();
  const ai = createProvider(settings.provider, settings);
  if (!ai) throw new ProviderError('invalid-key', 'No AI is set up.');
  const config = providerConfig(settings.provider, settings.custom);
  const model = strongestModel(modelsFor(config, settings.preset, settings.advancedModels));
  const runner = new CodeRunner();
  const usage: UsageRecord[] = [];
  try {
    const problem = await prepareFromLeetCode(target, {
      provider: ai,
      model,
      run: (lang: Language, code: string, p: Problem, tests: Problem['tests']) => runner.runTests(lang, code, p.signature, tests, 0),
      record: (role, m, u) => usage.push(usageRecord(config, role, m, u, 0)),
      onStage: opts.onStage,
      signal: opts.signal,
    });
    problem.prepUsage = usage;
    await saveProblem(problem);
    markPrepared(target.slug);
    return problem;
  } finally {
    runner.dispose();
  }
}

async function run() {
  running = true;
  try {
    for (;;) {
      const next = queueStore.get().pending[0];
      if (!next) break;
      queueStore.set((s) => ({ ...s, pending: s.pending.slice(1), current: next }));
      abort = new AbortController();
      try {
        const promise = prepareOne(next, { signal: abort.signal });
        inflight = { slug: next.slug, promise };
        await promise;
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'aborted') break;
        const unknown = err instanceof UnknownProblemError;
        queueStore.set((s) => ({ ...s, failed: [...s.failed, { slug: next.slug, title: next.title, unknown, message: err instanceof Error ? err.message : String(err) }] }));
        // No AI at all: nothing else will work either.
        if (err instanceof ProviderError && (err.kind === 'invalid-key' || err.kind === 'no-credit')) {
          queueStore.set((s) => ({ ...s, failed: [...s.failed, ...s.pending.map((t) => ({ slug: t.slug, title: t.title, unknown: false, message: err.message }))], pending: [] }));
          break;
        }
      }
    }
  } finally {
    running = false;
    abort = null;
    inflight = null;
    queueStore.set((s) => ({ ...s, current: null }));
  }
}

/**
 * The problem to practice now: the copy on this device, the one the queue is
 * writing (waited for), or a fresh one written now.
 */
export async function problemForPractice(target: LeetCodeTarget, opts: Parameters<typeof prepareOne>[1] = {}): Promise<Problem> {
  const saved = await getProblem(leetcodeProblemId(target.slug));
  if (saved) return saved;
  if (inflight?.slug === target.slug) {
    const { promise } = inflight;
    return new Promise<Problem>((resolve, reject) => {
      const onAbort = () => reject(new ProviderError('aborted', 'Cancelled.'));
      if (opts.signal?.aborted) return onAbort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject).finally(() => opts.signal?.removeEventListener('abort', onAbort));
    });
  }
  queueStore.set((s) => ({ ...s, pending: s.pending.filter((t) => t.slug !== target.slug) }));
  return prepareOne(target, opts);
}

export { leetcodeProblemId };
