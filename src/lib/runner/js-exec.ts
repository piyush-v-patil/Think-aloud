/**
 * Runs JavaScript code against tests. Pure and synchronous so it can run in a
 * Web Worker (the app) or directly in Node (tests and CI). Infinite loops are
 * handled by the caller terminating the worker.
 */
import type { RunRequest, RunResponse, RawTestOutcome } from './protocol';
import { ListNode, TreeNode, fromLanguageValue, toLanguageValue } from './structures';

function makeConsole(sink: string[]) {
  const write = (...args: unknown[]) =>
    sink.push(
      args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' '),
    );
  return { log: write, info: write, warn: write, error: write, debug: write };
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const line = /<anonymous>:(\d+):(\d+)/.exec(err.stack ?? '');
    // new Function adds 2 wrapper lines before the user's code.
    const where = line ? ` (line ${Math.max(1, Number(line[1]) - 2)})` : '';
    return `${err.name}: ${err.message}${where}`;
  }
  return String(err);
}

export function executeJs(req: RunRequest): RunResponse {
  const topLevel: string[] = [];
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  let fn: unknown;
  try {
    const name = req.signature?.name ?? '';
    const lookup =
      req.mode === 'tests' && name
        ? `\n;return (typeof ${name} !== 'undefined') ? ${name} : ` +
          `(typeof Solution !== 'undefined' ? (function(){ const s = new Solution(); return s.${name} ? s.${name}.bind(s) : undefined; })() : undefined);`
        : '';
    const factory = new Function('ListNode', 'TreeNode', 'console', `"use strict";\n${req.code}${lookup}`);
    fn = factory(ListNode, TreeNode, makeConsole(topLevel));
  } catch (err) {
    return { id: req.id, fatal: describeError(err), outcomes: [], stdout: topLevel.join('\n') };
  }

  if (req.mode === 'script') {
    return { id: req.id, outcomes: [], stdout: topLevel.join('\n') };
  }
  if (typeof fn !== 'function') {
    return {
      id: req.id,
      fatal: `Couldn't find a function named ${req.signature?.name}. Keep the name from the starter code.`,
      outcomes: [],
      stdout: topLevel.join('\n'),
    };
  }

  const signature = req.signature!;
  const outcomes: RawTestOutcome[] = req.tests.map((test) => {
    const out: string[] = [];
    // The user's console is bound at definition time, so redirect by swapping the sink.
    const before = topLevel.length;
    const start = now();
    try {
      const args = (JSON.parse(JSON.stringify(test.args)) as unknown[]).map((a, i) =>
        toLanguageValue(a, signature.params[i]?.type ?? 'any'),
      );
      const result = (fn as (...a: unknown[]) => unknown)(...args);
      const actual = fromLanguageValue(result, signature.returns);
      out.push(...topLevel.splice(before));
      return { ok: true, actual: JSON.parse(JSON.stringify(actual ?? null)), stdout: out.join('\n'), ms: now() - start };
    } catch (err) {
      out.push(...topLevel.splice(before));
      return { ok: false, error: describeError(err), stdout: out.join('\n'), ms: now() - start };
    }
  });
  return { id: req.id, outcomes, stdout: topLevel.join('\n') };
}
