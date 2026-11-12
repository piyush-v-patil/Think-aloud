/**
 * Validates every problem in /problems against the schema and checks
 * cross-field rules the schema can't express. Run in CI.
 *   npm run problems:validate                 validate
 *   npm run problems:validate -- --write-schema   also regenerate schema/problem.schema.json
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parseProblem, problemSchema } from '../src/lib/problems/schema.ts';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'problems');

if (process.argv.includes('--write-schema')) {
  const json = z.toJSONSchema(problemSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
  writeFileSync(join(root, 'schema', 'problem.schema.json'), JSON.stringify(json, null, 2) + '\n');
  console.log('Wrote schema/problem.schema.json');
}

/** Phrases that suggest text was copied from a problem site. Built-in problems must be original. */
const FORBIDDEN = [/leetcode/i, /hackerrank/i, /codeforces/i, /geeksforgeeks/i];

let failures = 0;
const ids = new Set<string>();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const res = parseProblem(raw);
  const errors: string[] = res.ok ? [] : res.errors;
  if (res.ok) {
    const p = res.problem;
    if (`${p.id}.json` !== file) errors.push(`id "${p.id}" must match the file name`);
    if (ids.has(p.id)) errors.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (p.source !== 'built-in') errors.push('source must be "built-in" for bank problems');
    for (const t of p.tests) {
      if (t.args.length !== p.signature.params.length) errors.push(`test "${t.name}" has ${t.args.length} args, signature has ${p.signature.params.length}`);
    }
    if (!p.tests.some((t) => !t.hidden)) errors.push('at least one test must be visible');
    if (!p.analysis) errors.push('built-in problems need an analysis (run npm run problems:analyze)');
    else if (!p.analysis.referenceSolution.java) errors.push('built-in problems need a Java reference solution');
    // The leetcode field names the problem this one practices (number, title,
    // link). Everything else must be original wording.
    const text = JSON.stringify({ ...p, leetcode: undefined });
    for (const re of FORBIDDEN) if (re.test(text)) errors.push(`mentions ${re.source}; bank problems must be original`);
    const names = new Set(p.analysis?.expectedMentions.map((m) => m.id));
    if (names.size !== (p.analysis?.expectedMentions.length ?? 0)) errors.push('expectedMentions ids must be unique');
  }
  if (errors.length) {
    failures++;
    console.error(`✗ ${file}\n  ${errors.join('\n  ')}`);
  } else console.log(`✓ ${file}`);
}
if (failures) {
  console.error(`\n${failures} problem file(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${ids.size} problems are valid.`);
