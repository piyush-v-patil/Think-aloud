/**
 * Compiles and runs Java for a RunRequest, through a toolchain: TeaVM in
 * the browser (and in Node tests), or a real JDK (CI's reference-solution
 * check). The program is compiled once, then each test runs on its own
 * fresh instance, so one test that crashes can't affect the next.
 */
import type { RunRequest, RunResponse, RawTestOutcome } from './protocol';
import {
  JAVA_RESULT_MARKER,
  buildJavaTestSources,
  describeJavaCompileError,
  describeJavaTrap,
  nodeClasses,
  parseJavaOutput,
  prepareUserCode,
  userFileName,
  type JavaDiagnostic,
} from './java-harness';

export interface CompiledJava {
  /** Runs `main(args)` and returns what it printed. `trap` is set if it stopped abnormally. */
  run(args: string[]): Promise<{ stdout: string; stderr: string; trap?: string }>;
}

export interface JavaToolchain {
  compile(files: Record<string, string>, mainClass: string): Promise<{ program: CompiledJava | null; diagnostics: JavaDiagnostic[] }>;
  /** Classes with a `public static void main`, for running code without tests. */
  mainClasses?(files: Record<string, string>): Promise<{ mains: string[]; diagnostics: JavaDiagnostic[] }>;
}

export async function executeJava(
  toolchain: JavaToolchain,
  req: RunRequest,
  now: () => number = () => performance.now(),
  /** Called once compiling is done, before any code runs. */
  onCompiled?: () => void,
): Promise<RunResponse> {
  if (req.mode === 'script') return runScript(toolchain, req);
  if (!req.signature) return { id: req.id, fatal: 'This problem has no function to test.', outcomes: [], stdout: '' };

  let sources;
  try {
    sources = buildJavaTestSources(req.code, req.signature, req.tests);
  } catch (err) {
    return { id: req.id, fatal: err instanceof Error ? err.message : String(err), outcomes: [], stdout: '' };
  }
  const { program, diagnostics } = await toolchain.compile(sources.files, sources.mainClass);
  if (!program) return { id: req.id, fatal: describeJavaCompileError(diagnostics, sources.userFile, req.signature), outcomes: [], stdout: '' };
  onCompiled?.();

  const outcomes: RawTestOutcome[] = [];
  for (let i = 0; i < req.tests.length; i++) {
    const start = now();
    const { stdout, trap } = await program.run([String(i)]);
    const ms = now() - start;
    const parsed = parseJavaOutput(stdout);
    if (parsed) outcomes.push({ ok: parsed.ok, actual: parsed.actual, error: parsed.error, stdout: parsed.stdout, ms });
    else outcomes.push({ ok: false, error: trap ? describeJavaTrap(trap) + knownGap(req.code, trap) : 'The test produced no result.', stdout: stripMarker(stdout), ms });
  }
  return { id: req.id, outcomes, stdout: '' };
}

/**
 * Two library calls crash in the in-browser Java (TeaVM) instead of
 * working. When a crash could come from one of them, say so.
 */
export function knownGap(code: string, trap: string): string {
  if (!/null/i.test(trap)) return '';
  const notes: string[] = [];
  if (/\.clone\s*\(\s*\)/.test(code)) notes.push('copying an array with .clone() doesn’t work here; use Arrays.copyOf(a, a.length)');
  if (/String\s*\.\s*format\s*\([^)]*%[-+ 0,(#]*\d*(\.\d+)?f/.test(code)) notes.push('String.format with %f doesn’t work here; build the text with + or StringBuilder');
  return notes.length ? ` (in the in-browser Java, ${notes.join(', and ')})` : '';
}

function stripMarker(stdout: string): string {
  return stdout.split(JAVA_RESULT_MARKER)[0].replace(/\n$/, '');
}

async function runScript(toolchain: JavaToolchain, req: RunRequest): Promise<RunResponse> {
  const userFile = userFileName(req.code);
  const files = { [userFile]: prepareUserCode(req.code), ...nodeClasses(req.code) };
  const found = await toolchain.mainClasses?.(files);
  if (found && found.diagnostics.some((d) => d.severity === 'error')) {
    return { id: req.id, fatal: describeJavaCompileError(found.diagnostics, userFile), outcomes: [], stdout: '' };
  }
  const mains = found?.mains ?? [];
  if (!mains.length) {
    return { id: req.id, fatal: 'To run Java without tests, add a class with a public static void main(String[] args) method.', outcomes: [], stdout: '' };
  }
  const { program, diagnostics } = await toolchain.compile(files, mains[0]);
  if (!program) return { id: req.id, fatal: describeJavaCompileError(diagnostics, userFile), outcomes: [], stdout: '' };
  const { stdout, stderr, trap } = await program.run([]);
  const out = stdout + (stderr ? `\n${stderr}` : '');
  return { id: req.id, outcomes: [], stdout: out, ...(trap ? { fatal: describeJavaTrap(trap) } : {}) };
}
