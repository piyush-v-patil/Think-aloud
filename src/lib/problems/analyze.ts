/**
 * Generating and checking a problem analysis. Shared by the maintainer
 * script (built-in bank) and the app (pasted problems and variations).
 */
import { z } from 'zod';
import type { CodeByLanguage, Language, Problem, ProblemAnalysis, TestCase, TestRun } from '../types';
import { javaStarter } from '../runner/java-harness';
import { analysisSchema, compareSchema, signatureSchema, topicSchema } from './schema';
import type { AIProvider } from '../ai/types';
import type { TokenUsage } from '../cost/pricing';

export type RunTests = (language: Language, code: string, problem: Problem, tests: TestCase[]) => Promise<TestRun>;

/** What the model returns for an existing problem (built-in bank). */
export const analysisOutputSchema = analysisSchema.omit({ generatedBy: true });

/** What the model returns for a pasted problem: the problem itself plus its analysis. */
export const preparedOutputSchema = z.object({
  title: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(topicSchema).min(1).max(3),
  statement: z.string(),
  examples: z.array(z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })),
  signature: signatureSchema,
  tests: z
    .array(
      z.object({
        name: z.string(),
        argsJson: z.string().describe('JSON array of positional arguments'),
        expectedJson: z.string().describe('JSON of the expected return value'),
        compare: compareSchema.optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .min(3),
  analysis: analysisOutputSchema,
});
export type PreparedOutput = z.infer<typeof preparedOutputSchema>;

export function problemForPrompt(p: Problem): string {
  return JSON.stringify(
    {
      title: p.title,
      statement: p.statement,
      examples: p.examples,
      signature: p.signature,
      tests: p.tests.map((t) => ({ name: t.name, args: t.args, expected: t.expected, compare: t.compare })),
    },
    null,
    2,
  );
}

export function starterFor(signature: Problem['signature'], tests: TestCase[] = []): CodeByLanguage {
  const params = signature.params.map((p) => p.name).join(', ');
  return {
    python: `def ${signature.name}(${params}):\n    pass\n`,
    javascript: `function ${signature.name}(${params}) {\n\n}\n`,
    java: javaStarter(signature, tests),
  };
}

/** The starter code for a language; Java is generated from the signature when not stored. */
export function starterCodeFor(problem: Pick<Problem, 'starterCode' | 'signature' | 'tests'>, language: Language): string {
  if (language === 'java') return problem.starterCode.java ?? javaStarter(problem.signature, problem.tests);
  return problem.starterCode[language];
}

/** Converts the model's string-encoded tests into real tests, dropping any that don't parse. */
export function decodeTests(raw: PreparedOutput['tests'], paramCount: number): TestCase[] {
  const out: TestCase[] = [];
  for (const t of raw) {
    try {
      const args = JSON.parse(t.argsJson);
      const expected = JSON.parse(t.expectedJson);
      if (!Array.isArray(args) || args.length !== paramCount) continue;
      out.push({ name: t.name, args, expected, ...(t.compare ? { compare: t.compare } : {}), ...(t.hidden ? { hidden: true } : {}) });
    } catch {
      // Skip a malformed test rather than fail the whole problem.
    }
  }
  return out;
}

export interface CheckResult {
  ok: boolean;
  /** Tests the reference solution passed in every language. */
  agreed: TestCase[];
  failures: string[];
}

/** Runs the reference solutions against the tests. Tests either reference fails are reported. */
export async function checkReference(problem: Problem, analysis: Pick<ProblemAnalysis, 'referenceSolution'>, run: RunTests, languages: Language[] = ['python', 'javascript']): Promise<CheckResult> {
  const failures: string[] = [];
  const failedTests = new Set<string>();
  for (const lang of languages) {
    const code = analysis.referenceSolution[lang];
    if (!code) {
      failures.push(`${lang}: no reference solution`);
      continue;
    }
    const res = await run(lang, code, problem, problem.tests);
    if (res.error) {
      failures.push(`${lang}: ${res.error}`);
      problem.tests.forEach((t) => failedTests.add(t.name));
      continue;
    }
    for (const r of res.results) {
      if (!r.passed) {
        failedTests.add(r.name);
        failures.push(`${lang}: test "${r.name}" ${r.error ? `raised ${r.error}` : `returned ${JSON.stringify(r.actual)}, expected ${JSON.stringify(r.expected)}`}`);
      }
    }
  }
  const agreed = problem.tests.filter((t) => !failedTests.has(t.name));
  return { ok: failures.length === 0, agreed, failures };
}

export interface GenerateOptions {
  provider: AIProvider;
  model: string;
  system: string;
  signal?: AbortSignal;
  onUsage?: (usage: TokenUsage, model: string) => void;
}

/** Generates an analysis for an existing problem (used by the maintainer script). */
export async function generateAnalysis(problem: Problem, opts: GenerateOptions, feedback?: string): Promise<z.infer<typeof analysisOutputSchema>> {
  const res = await opts.provider.json({
    model: opts.model,
    system: [{ text: opts.system, cache: true }],
    turns: [
      {
        role: 'user',
        text:
          `Here is the problem.\n\n${problemForPrompt(problem)}` +
          (feedback ? `\n\nYour previous reference solution failed these checks. Fix it:\n${feedback}` : ''),
      },
    ],
    maxTokens: 32000,
    effort: 'high',
    schema: analysisOutputSchema,
    schemaName: 'analysis',
    signal: opts.signal,
  });
  opts.onUsage?.(res.usage, res.model);
  return res.data;
}
