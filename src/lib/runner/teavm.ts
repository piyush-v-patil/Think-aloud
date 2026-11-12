/**
 * A Java toolchain on TeaVM's in-browser compiler: OpenJDK's javac and
 * TeaVM in one WebAssembly module, producing a WebAssembly program. Works in
 * a Web Worker and in Node (given the same files).
 */
import type { CompiledJava, JavaToolchain } from './java-exec';
import type { JavaDiagnostic } from './java-harness';

/** TeaVM's loader (`compiler.wasm-runtime.js`): instantiates a TeaVM WebAssembly module. */
export type TeaVMLoad = (
  wasm: Uint8Array | Int8Array | ArrayBuffer,
  options?: { installImports?(imports: Record<string, unknown>): void; noAutoImports?: boolean },
) => Promise<{ exports: Record<string, unknown> }>;

interface TeaVMCompiler {
  setSdk(data: Int8Array): void;
  setTeaVMClasslib(data: Int8Array): void;
  onDiagnostic(fn: (d: Record<string, unknown>) => void): void;
  clearSourceFiles(): void;
  clearOutputFiles(): void;
  addSourceFile(name: string, source: string): void;
  compile(): boolean;
  detectMainClasses(): unknown;
  generateWebAssembly(opts: { outputName: string; mainClass: string }): Promise<void>;
  getWebAssemblyOutputFile(name: string): Int8Array | null;
}

export interface TeaVMFiles {
  load: TeaVMLoad;
  compilerWasm: ArrayBuffer | Uint8Array;
  /** The Java API javac compiles against (vendor/teavm/java-api.bin). */
  javaApi: ArrayBuffer | Uint8Array;
  /** TeaVM's class library implementation (runtime-classlib-teavm.bin). */
  classlib: ArrayBuffer | Uint8Array;
}

function bytes(b: ArrayBuffer | Uint8Array): Int8Array {
  return b instanceof Uint8Array ? new Int8Array(b.buffer, b.byteOffset, b.byteLength) : new Int8Array(b);
}

function read(d: Record<string, unknown>, key: string): unknown {
  try {
    return d[key];
  } catch {
    // Some diagnostics throw on missing fields.
    return undefined;
  }
}

export async function createTeaVMToolchain(files: TeaVMFiles): Promise<JavaToolchain> {
  const teavm = await files.load(files.compilerWasm instanceof Uint8Array ? files.compilerWasm : new Uint8Array(files.compilerWasm));
  const compiler = (teavm.exports.createCompiler as () => TeaVMCompiler)();
  compiler.setSdk(bytes(files.javaApi));
  compiler.setTeaVMClasslib(bytes(files.classlib));
  let diagnostics: JavaDiagnostic[] = [];
  compiler.onDiagnostic((d) => {
    diagnostics.push({
      type: String(read(d, 'type') ?? ''),
      severity: String(read(d, 'severity') ?? 'error'),
      fileName: (read(d, 'fileName') as string | undefined) ?? undefined,
      lineNumber: (read(d, 'lineNumber') as number | undefined) ?? undefined,
      message: String(read(d, 'message') ?? ''),
    });
  });
  let counter = 0;

  function addSources(sources: Record<string, string>) {
    compiler.clearSourceFiles();
    compiler.clearOutputFiles();
    for (const [name, source] of Object.entries(sources)) compiler.addSourceFile(name, source);
  }

  return {
    async compile(sources, mainClass) {
      diagnostics = [];
      addSources(sources);
      if (!compiler.compile()) return { program: null, diagnostics };
      // A fresh output name every time: if generation fails, an earlier
      // program must never be picked up and run in its place.
      const name = `program${++counter}`;
      await compiler.generateWebAssembly({ outputName: name, mainClass });
      const wasm = compiler.getWebAssemblyOutputFile(`${name}.wasm`);
      if (!wasm || diagnostics.some((d) => d.severity === 'error')) return { program: null, diagnostics };
      const program = new Uint8Array(wasm.buffer, wasm.byteOffset, wasm.byteLength).slice();
      return { program: teavmProgram(files.load, program), diagnostics };
    },
    async mainClasses(sources) {
      diagnostics = [];
      addSources(sources);
      if (!compiler.compile()) return { mains: [], diagnostics };
      const found = compiler.detectMainClasses();
      return { mains: Array.isArray(found) ? found.map(String) : [], diagnostics };
    },
  };
}

function teavmProgram(load: TeaVMLoad, wasm: Uint8Array): CompiledJava {
  return {
    async run(args) {
      let stdout = '';
      let stderr = '';
      try {
        // A fresh instance per run, with output captured instead of logged.
        const instance = await load(wasm, {
          noAutoImports: true,
          installImports(imports) {
            imports.teavmConsole = {
              putcharStdout: (c: number) => (stdout += String.fromCharCode(c)),
              putcharStderr: (c: number) => (stderr += String.fromCharCode(c)),
            };
          },
        });
        (instance.exports.main as (a: string[]) => void)(args);
        return { stdout, stderr };
      } catch (err) {
        return { stdout, stderr, trap: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
