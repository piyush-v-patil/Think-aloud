/**
 * Turns pasted problem text into a runnable, analyzed problem with the
 * strongest model the user's preset allows. Tests are checked against the
 * generated reference solution in the sandboxed runner, and the result is
 * cached locally by the text's hash so a repeat costs nothing.
 */
import type { AIProvider } from '../ai/types';
import type { Problem, UsageRecord } from '../types';
import type { TokenUsage } from '../cost/pricing';
import { prompt } from '../prompts';
import { sha256 } from '../id';
import { cacheAnalysis, getCachedAnalysis } from '../storage/db';
import { checkReference, decodeTests, preparedOutputSchema, starterFor, type PreparedOutput, type RunTests } from './analyze';
import { TOPICS } from '../types';
import { z } from 'zod';
import { ProviderError } from '../ai/errors';

export type PrepareStage = 'reading' | 'checking' | 'retrying';

export interface PrepareOptions {
  provider: AIProvider;
  model: string;
  run: RunTests;
  record: (role: UsageRecord['role'], model: string, usage: TokenUsage) => void;
  onStage?: (stage: PrepareStage) => void;
  signal?: AbortSignal;
}

const VALUE_TYPES = 'int, float, bool, string, int[], float[], string[], bool[], int[][], string[][], ListNode, TreeNode, any';

export function preparedToProblem(out: PreparedOutput, id: string, source: Problem['source'] = 'pasted'): Problem {
  return {
    schemaVersion: 1,
    id,
    title: out.title,
    difficulty: out.difficulty,
    topics: out.topics,
    statement: out.statement,
    examples: out.examples,
    signature: out.signature,
    starterCode: starterFor(out.signature, decodeTests(out.tests, out.signature.params.length)),
    tests: decodeTests(out.tests, out.signature.params.length),
    analysis: out.analysis,
    source,
  };
}

export async function preparePasted(text: string, opts: PrepareOptions): Promise<{ problem: Problem; cached: boolean }> {
  const hash = await sha256(text);
  const cached = await getCachedAnalysis(hash);
  if (cached) return { problem: cached, cached: true };
  const problem = await generate(`<pasted_problem>\n${text}\n</pasted_problem>`, prompt('prepare-pasted'), `paste-${hash.slice(0, 12)}`, 'pasted', opts);
  await cacheAnalysis(hash, problem);
  return { problem, cached: false };
}

/** Writes a variation of a problem the candidate already practiced. */
export async function prepareVariation(base: Problem, opts: PrepareOptions): Promise<Problem> {
  const input = `<original_problem>\n${JSON.stringify({ title: base.title, statement: base.statement, signature: base.signature, optimal: base.analysis?.optimal })}\n</original_problem>`;
  const schema = preparedOutputSchema.extend({ change: z.string() });
  const id = `var-${base.id}-${Date.now().toString(36)}`;
  return generate(input, `${prompt('prepare-pasted')}\n\n${prompt('variation')}`, id, 'variation', opts, schema, base.id);
}

async function generate(
  input: string,
  instructions: string,
  id: string,
  source: Problem['source'],
  opts: PrepareOptions,
  schema: z.ZodType<PreparedOutput & { change?: string }> = preparedOutputSchema,
  variationOf?: string,
): Promise<Problem> {
  const system = [
    { text: prompt('analysis') },
    { text: instructions + `\n\nAllowed topic ids: ${TOPICS.join(', ')}.\nAllowed value types: ${VALUE_TYPES}.`, cache: true },
  ];
  let feedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    opts.onStage?.(attempt === 1 ? 'reading' : 'retrying');
    const res = await opts.provider.json({
      model: opts.model,
      system,
      turns: [
        {
          role: 'user',
          text:
            input +
            (feedback ? `\n\nYour previous answer failed these checks. Fix the reference solution or the tests:\n${feedback}` : ''),
        },
      ],
      maxTokens: 32000,
      effort: 'high',
      schema,
      schemaName: 'prepared_problem',
      signal: opts.signal,
    });
    opts.record('analysis', res.model, res.usage);
    const problem = preparedToProblem(res.data, id, source);
    if (variationOf) problem.variationOf = { problemId: variationOf, change: (res.data as { change?: string }).change ?? '' };
    opts.onStage?.('checking');
    const check = await checkReference(problem, res.data.analysis, opts.run);
    // Keep only tests both reference solutions agree with. If too few
    // survive, ask once more with the failures as feedback.
    if (check.agreed.length >= 3) {
      problem.tests = check.agreed;
      if (!problem.tests.some((t) => !t.hidden)) problem.tests[0] = { ...problem.tests[0], hidden: false };
      return problem;
    }
    feedback = check.failures.slice(0, 12).join('\n');
  }
  throw new ProviderError('bad-output', 'The generated tests did not agree with the generated solution.');
}
