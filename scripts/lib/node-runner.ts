/** Runs code against tests in Node with the same harness the app uses in the browser. */
import { loadPyodide } from 'pyodide';
import { executeJs } from '../../src/lib/runner/js-exec.ts';
import { executePython, installHarness, type PyodideLike } from '../../src/lib/runner/python-harness.ts';
import { executeJava, type JavaToolchain } from '../../src/lib/runner/java-exec.ts';
import { teavmToolchain } from './java-toolchains.ts';
import { toTestRun } from '../../src/lib/runner/runner.ts';
import type { Language, Problem, TestCase, TestRun } from '../../src/lib/types.ts';

let py: Promise<PyodideLike> | null = null;

async function python(): Promise<PyodideLike> {
  py ??= (async () => {
    const instance = (await loadPyodide()) as unknown as PyodideLike;
    installHarness(instance);
    return instance;
  })();
  return py;
}

export async function runTests(language: Language, code: string, problem: Problem, tests: TestCase[], java?: JavaToolchain): Promise<TestRun> {
  const req = { id: 1, code, signature: problem.signature, tests, mode: 'tests' as const };
  const res =
    language === 'python'
      ? executePython(await python(), req)
      : language === 'java'
        ? await executeJava(java ?? (await teavmToolchain()), req)
        : executeJs(req);
  return toTestRun(0, tests, res);
}
