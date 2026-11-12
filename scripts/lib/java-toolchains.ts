/**
 * Java toolchains for scripts: TeaVM (what the browser runs, from
 * vendor/teavm) and a real JDK (javac + java), used to cross-check that
 * TeaVM gives the same answers.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { JavaToolchain } from '../../src/lib/runner/java-exec.ts';
import { createTeaVMToolchain, type TeaVMLoad } from '../../src/lib/runner/teavm.ts';
import type { JavaDiagnostic } from '../../src/lib/runner/java-harness.ts';

const vendor = join(import.meta.dirname, '..', '..', 'vendor', 'teavm');

let teavm: Promise<JavaToolchain> | null = null;

export function teavmToolchain(): Promise<JavaToolchain> {
  teavm ??= (async () => {
    const { load } = (await import(pathToFileURL(join(vendor, 'compiler.wasm-runtime.js')).href)) as { load: TeaVMLoad };
    return createTeaVMToolchain({
      load,
      compilerWasm: readFileSync(join(vendor, 'compiler.wasm')),
      javaApi: readFileSync(join(vendor, 'java-api.bin')),
      classlib: readFileSync(join(vendor, 'runtime-classlib-teavm.bin')),
    });
  })();
  return teavm;
}

export function jdkAvailable(): boolean {
  return spawnSync('javac', ['-version'], { stdio: 'ignore' }).status === 0;
}

/** javac errors look like "Solution.java:3: error: message". */
function parseJavac(output: string): JavaDiagnostic[] {
  const out: JavaDiagnostic[] = [];
  for (const m of output.matchAll(/^(.+?\.java):(\d+): (error|warning): (.+)$/gm)) {
    out.push({ type: 'javac', severity: m[3], fileName: m[1].split(/[\\/]/).pop(), lineNumber: Number(m[2]), message: m[4] });
  }
  return out;
}

export function jdkToolchain(): JavaToolchain {
  return {
    async compile(files, mainClass) {
      const dir = mkdtempSync(join(tmpdir(), 'think-aloud-java-'));
      const paths = Object.entries(files).map(([name, source]) => {
        const p = join(dir, name);
        writeFileSync(p, source);
        return p;
      });
      const res = spawnSync('javac', ['-nowarn', '-d', dir, ...paths], { encoding: 'utf8' });
      if (res.status !== 0) {
        rmSync(dir, { recursive: true, force: true });
        return { program: null, diagnostics: parseJavac(`${res.stdout}${res.stderr}`) };
      }
      return {
        diagnostics: [],
        program: {
          async run(args) {
            try {
              const stdout = execFileSync('java', ['-Xss64m', '-cp', dir, mainClass, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
              return { stdout, stderr: '' };
            } catch (err) {
              const e = err as { stdout?: string; stderr?: string; message: string };
              return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', trap: (e.stderr || e.message).split('\n')[0] };
            }
          },
        },
      };
    },
  };
}
