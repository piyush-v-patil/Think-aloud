import type { FunctionSignature, TestCase } from '../types';

export interface RunRequest {
  id: number;
  code: string;
  signature?: FunctionSignature;
  tests: TestCase[];
  /** "tests" calls the function per test. "script" just runs the code and collects output. */
  mode: 'tests' | 'script';
}

export interface RawTestOutcome {
  ok: boolean;
  actual?: unknown;
  error?: string;
  stdout: string;
  ms: number;
}

export interface RunResponse {
  id: number;
  /** Set when nothing could run (syntax error, function missing). */
  fatal?: string;
  outcomes: RawTestOutcome[];
  /** Output printed outside of any test (e.g. at top level, or in script mode). */
  stdout: string;
}

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'loading'; message: string }
  | { type: 'result'; response: RunResponse }
  /** The runtime couldn't load (a download failed, say). */
  | { type: 'failed'; message: string }
  /** Java: compiling is done and the code starts running; the time limit restarts. */
  | { type: 'compiled'; id: number };
