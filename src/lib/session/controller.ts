/**
 * Owns a live interview outside React: the clock, the code runner, code
 * snapshots and test runs. Screens subscribe to `store` and call methods.
 */
import type { CodeSnapshot, Language, Problem, TestRun } from '../types';
import { CodeRunner } from '../runner/runner';
import { hasTests } from '../problems/paste';
import { SessionClock } from './clock';
import { createStore } from '../../state/store';

export interface LiveState {
  code: string;
  lastRun: TestRun | null;
  running: boolean;
  runnerStatus: string | null;
  elapsedMs: number;
}

export class InterviewController {
  readonly clock = new SessionClock();
  readonly problem: Problem;
  readonly language: Language;
  readonly testable: boolean;
  readonly store;
  readonly snapshots: CodeSnapshot[];
  readonly runs: TestRun[] = [];
  private runner = new CodeRunner();
  private snapshotTimer?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;

  constructor(problem: Problem, language: Language) {
    this.problem = problem;
    this.language = language;
    this.testable = hasTests(problem);
    const starter = problem.starterCode[language];
    this.snapshots = [{ t: 0, code: starter }];
    this.store = createStore<LiveState>({ code: starter, lastRun: null, running: false, runnerStatus: null, elapsedMs: 0 });
  }

  start() {
    this.runner.onStatus = (runnerStatus) => this.patch({ runnerStatus });
    void this.runner.warm(this.language);
    this.tick = setInterval(() => this.patch({ elapsedMs: this.clock.now() }), 1000);
  }

  stop() {
    clearInterval(this.tick);
    clearTimeout(this.snapshotTimer);
    this.runner.dispose();
  }

  private patch(p: Partial<LiveState>) {
    this.store.set((s) => ({ ...s, ...p }));
  }

  setCode(code: string) {
    this.patch({ code });
    clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => this.snapshot(), 800);
  }

  /** Records the current code if it changed since the last snapshot. */
  snapshot(): CodeSnapshot {
    const code = this.store.get().code;
    const last = this.snapshots[this.snapshots.length - 1];
    if (last.code !== code) this.snapshots.push({ t: this.clock.now(), code });
    return this.snapshots[this.snapshots.length - 1];
  }

  async run(): Promise<TestRun> {
    this.snapshot();
    this.patch({ running: true });
    const t = this.clock.now();
    const { code } = this.store.get();
    const result = this.testable
      ? await this.runner.runTests(this.language, code, this.problem.signature, this.problem.tests, t)
      : await this.runner.runScript(this.language, code, t);
    this.runs.push(result);
    this.patch({ running: false, lastRun: result });
    return result;
  }
}
