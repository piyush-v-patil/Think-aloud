// Copies runtime files that must be served from our own origin (no CDN):
// the Pyodide core used by the Python code runner.
// Runs on `npm install` (postinstall). Output is git-ignored.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor', 'pyodide');
const src = join(root, 'node_modules', 'pyodide');

if (!existsSync(src)) {
  console.warn('[copy-runtime-assets] pyodide not installed yet; skipping');
  process.exit(0);
}
mkdirSync(out, { recursive: true });
for (const file of [
  'pyodide.mjs',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]) {
  cpSync(join(src, file), join(out, file));
}
console.log('[copy-runtime-assets] Pyodide copied to public/vendor/pyodide');

// ONNX Runtime WebAssembly files for on-device Whisper, served from our own
// origin instead of a CDN. The model weights themselves are downloaded from
// Hugging Face only when the user turns on-device transcription on.
const ortSrc = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ortOut = join(root, 'public', 'vendor', 'ort');
if (existsSync(ortSrc)) {
  mkdirSync(ortOut, { recursive: true });
  for (const variant of ['', '.jsep', '.asyncify']) {
    for (const ext of ['wasm', 'mjs']) {
      const file = `ort-wasm-simd-threaded${variant}.${ext}`;
      if (existsSync(join(ortSrc, file))) cpSync(join(ortSrc, file), join(ortOut, file));
    }
  }
  console.log('[copy-runtime-assets] ONNX Runtime copied to public/vendor/ort');
}

// Pronunciation lexicon for the natural (Kokoro) voice: the CMU Pronouncing
// Dictionary, one "word ARPABET" line per word, first pronunciation only.
// Loaded by the browser only when the natural voice is turned on.
const cmuPath = join(root, 'node_modules', 'cmu-pronouncing-dictionary', 'index.js');
if (existsSync(cmuPath)) {
  const { dictionary } = await import(pathToFileURL(cmuPath).href);
  const lines = Object.entries(dictionary)
    .filter(([word]) => /^[a-z][a-z']*$/.test(word))
    .map(([word, arpabet]) => `${word} ${arpabet}`);
  const kokoroOut = join(root, 'public', 'vendor', 'kokoro');
  mkdirSync(kokoroOut, { recursive: true });
  writeFileSync(join(kokoroOut, 'lexicon.txt'), `${lines.join('\n')}\n`);
  console.log(`[copy-runtime-assets] Pronunciation lexicon (${lines.length} words) written to public/vendor/kokoro`);
}
