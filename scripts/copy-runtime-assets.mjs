// Copies runtime files that must be served from our own origin (no CDN):
// the Pyodide core used by the Python code runner.
// Runs on `npm install` (postinstall). Output is git-ignored.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
