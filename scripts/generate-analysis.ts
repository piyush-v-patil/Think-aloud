/**
 * Maintainer script: generates the analysis for built-in problems with the
 * strongest model, checks the reference solutions against the tests, and
 * writes the result into the problem's JSON file for you to review and
 * commit. Sessions on built-in problems then need no analysis call.
 *
 * Uses your own key from the ANTHROPIC_API_KEY environment variable. The
 * key is never printed.
 *
 *   ANTHROPIC_API_KEY=... npm run problems:analyze                    problems with no analysis
 *   ANTHROPIC_API_KEY=... npm run problems:analyze -- --id crate-pair --force
 *   ANTHROPIC_API_KEY=... npm run problems:analyze -- --all --force   regenerate everything
 *   ... -- --model claude-opus-5-5                                    use another model
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { AnthropicProvider } from '../src/lib/ai/anthropic.ts';
import { checkReference, generateAnalysis } from '../src/lib/problems/analyze.ts';
import { parseProblem } from '../src/lib/problems/schema.ts';
import { costOfRequest, formatUsd } from '../src/lib/cost/pricing.ts';
import { anthropic } from '../src/config/providers/anthropic.ts';
import type { Problem } from '../src/lib/types.ts';
import { runTests } from './lib/node-runner.ts';

const { values } = parseArgs({
  options: {
    id: { type: 'string', multiple: true },
    all: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    model: { type: 'string', default: 'claude-fable-5-2' },
    attempts: { type: 'string', default: '3' },
  },
});

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('Set ANTHROPIC_API_KEY to your own key to generate analyses.');
  process.exit(1);
}

const root = join(import.meta.dirname, '..');
const dir = join(root, 'problems');
const system = readFileSync(join(root, 'prompts', 'analysis.md'), 'utf8');
const provider = new AnthropicProvider(key);
const model = values.model!;
const info = anthropic.models.find((m) => m.id === model);
let spent = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(dir, file);
  const problem = JSON.parse(readFileSync(path, 'utf8')) as Problem;
  const wanted = values.id?.length ? values.id.includes(problem.id) : values.all || !problem.analysis;
  if (!wanted || (problem.analysis && !values.force)) continue;

  console.log(`→ ${problem.id}`);
  let feedback: string | undefined;
  let done = false;
  for (let attempt = 1; attempt <= Number(values.attempts) && !done; attempt++) {
    const analysis = await generateAnalysis(
      problem,
      { provider, model, system, onUsage: (usage) => (spent += costOfRequest(info, usage) ?? 0) },
      feedback,
    );
    const check = await checkReference(problem, analysis, runTests, ['python', 'javascript', 'java']);
    if (!check.ok) {
      feedback = check.failures.join('\n');
      console.warn(`  attempt ${attempt}: reference solution failed\n  ${check.failures.join('\n  ')}`);
      continue;
    }
    const next: Problem = {
      ...problem,
      analysis: { ...analysis, generatedBy: { provider: 'anthropic', model, date: new Date().toISOString().slice(0, 10) } },
    };
    const valid = parseProblem(next);
    if (!valid.ok) {
      feedback = valid.errors.join('\n');
      console.warn(`  attempt ${attempt}: analysis did not validate\n  ${valid.errors.join('\n  ')}`);
      continue;
    }
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
    console.log('  ✓ written');
    done = true;
  }
  if (!done) console.error(`  ✗ ${problem.id}: gave up; the file was not changed`);
}
console.log(`\nApproximate cost: ${formatUsd(spent)}. Review the diffs before committing.`);
