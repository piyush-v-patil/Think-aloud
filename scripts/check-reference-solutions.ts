/**
 * Runs each bank problem's reference solutions against its tests: Python
 * (Pyodide), JavaScript, and Java on TeaVM (what the browser runs). When a
 * JDK is installed, the Java solutions also run on it, to confirm TeaVM
 * gives the same answers. Run in CI on every pull request.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from '../src/lib/types.ts';
import { checkReference } from '../src/lib/problems/analyze.ts';
import { runTests } from './lib/node-runner.ts';
import { starterCodeFor } from '../src/lib/problems/analyze.ts';
import { jdkAvailable, jdkToolchain } from './lib/java-toolchains.ts';
import type { Language } from '../src/lib/types.ts';

const withJdk = jdkAvailable();
const jdk = jdkToolchain();
const languages: Language[] = ['python', 'javascript', 'java'];
if (!withJdk) console.log('No JDK found: Java runs on TeaVM only.\n');

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
  const res = await checkReference(problem, problem.analysis, runTests, languages);
  const failures = [...res.failures];
  // The generated Java starter code must compile (its tests just fail).
  const starter = await runTests('java', starterCodeFor(problem, 'java'), problem, problem.tests);
  if (starter.error) failures.push(`java starter code doesn't compile: ${starter.error}`);
  if (withJdk && problem.analysis.referenceSolution.java) {
    const onJdk = await checkReference(problem, problem.analysis, (l, c, p, t) => runTests(l, c, p, t, jdk), ['java']);
    failures.push(...onJdk.failures.map((f) => f.replace(/^java:/, 'java (JDK):')));
  }
  if (!failures.length) console.log(`✓ ${file} (${problem.tests.length} tests, Python, JavaScript and Java${withJdk ? ' on TeaVM and the JDK' : ''})`);
  else {
    failed++;
    console.error(`✗ ${file}\n  ${failures.join('\n  ')}`);
  }
}
if (failed) {
  console.error(`\n${failed} of ${count} problems failed.`);
  process.exit(1);
}
console.log(`\nAll ${count} reference solutions pass their tests in Python, JavaScript and Java.`);
