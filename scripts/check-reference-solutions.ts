/**
 * Runs each bank problem's reference solutions (Python and JavaScript)
 * against its tests. Run in CI on every pull request.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from '../src/lib/types.ts';
import { checkReference } from '../src/lib/problems/analyze.ts';
import { runTests } from './lib/node-runner.ts';

const dir = join(import.meta.dirname, '..', 'problems');
let failed = 0;
let count = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const problem = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Problem;
  count++;
  if (!problem.analysis) {
    failed++;
    console.error(`✗ ${file}: no analysis, so no reference solution`);
    continue;
  }
  const res = await checkReference(problem, problem.analysis, runTests);
  if (res.ok) console.log(`✓ ${file} (${problem.tests.length} tests, Python and JavaScript)`);
  else {
    failed++;
    console.error(`✗ ${file}\n  ${res.failures.join('\n  ')}`);
  }
}
if (failed) {
  console.error(`\n${failed} of ${count} problems failed.`);
  process.exit(1);
}
console.log(`\nAll ${count} reference solutions pass their tests in both languages.`);
