/**
 * Problem schema. This zod schema is the single source of truth: the
 * documented JSON Schema in schema/problem.schema.json is generated from it
 * (`npm run problems:validate -- --write-schema`), CI validates every bank
 * file against it, and the app validates generated analyses with it.
 */
import { z } from 'zod';
import type { Problem, ProblemAnalysis } from '../types';

// The app's Content Security Policy forbids eval, so turn off zod's JIT.
z.config({ jitless: true });

export const topicSchema = z.enum([
  'arrays-hashing',
  'two-pointers',
  'sliding-window',
  'stack',
  'binary-search',
  'linked-list',
  'trees',
  'graphs',
  'heaps',
  'intervals',
  'backtracking',
  'dynamic-programming',
]);

export const valueTypeSchema = z.enum([
  'int',
  'float',
  'bool',
  'string',
  'int[]',
  'float[]',
  'string[]',
  'bool[]',
  'int[][]',
  'string[][]',
  'ListNode',
  'TreeNode',
  'any',
]);

export const compareSchema = z.enum(['exact', 'unordered', 'unordered-deep', 'float']);
export const phaseSchema = z.enum(['clarify', 'plan', 'code', 'test', 'wrap-up']);
export const rubricSchema = z.enum(['clarification', 'planning', 'reasoning', 'narration', 'testing', 'hint-handling']);

export const testCaseSchema = z.object({
  name: z.string().min(1).describe('Plain-language name, e.g. "empty input"'),
  args: z.array(z.unknown()).describe('Positional arguments as JSON'),
  expected: z.unknown(),
  compare: compareSchema.optional(),
  hidden: z.boolean().optional(),
});

export const signatureSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  params: z.array(z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), type: valueTypeSchema })),
  returns: valueTypeSchema,
});

export const analysisSchema = z.object({
  clarifyingQuestions: z
    .array(z.object({ question: z.string(), answer: z.string(), why: z.string() }))
    .min(2)
    .describe('Questions a strong candidate asks, with the answer the interviewer gives'),
  hiddenConstraints: z.array(z.string()).describe('Facts the interviewer reveals only when asked'),
  edgeCases: z.array(z.object({ input: z.string(), why: z.string() })).min(2),
  approaches: z
    .array(z.object({ name: z.string(), idea: z.string(), time: z.string(), space: z.string(), tradeoffs: z.string() }))
    .min(1),
  optimal: z.object({ name: z.string(), explanation: z.string(), time: z.string(), space: z.string() }),
  hintLadder: z.array(z.string()).min(3).describe('Hints from vague to specific'),
  expectedMentions: z
    .array(z.object({ id: z.string(), what: z.string(), category: rubricSchema }))
    .min(3)
    .describe('Things a strong candidate says aloud; used for missed-opportunity markers'),
  followUps: z.array(z.string()),
  vocabulary: z.array(z.string()).describe('Technical terms for speech-recognition hints'),
  referenceSolution: z.object({ python: z.string(), javascript: z.string(), java: z.string().optional() }),
  walkthrough: z
    .array(z.object({ phase: phaseSchema, say: z.string(), code: z.string().optional() }))
    .min(5)
    .describe('A full think-aloud by a strong candidate, in order'),
  generatedBy: z.object({ provider: z.string(), model: z.string(), date: z.string() }).optional(),
}) satisfies z.ZodType<ProblemAnalysis>;

export const problemSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topics: z.array(topicSchema).min(1),
  statement: z.string().min(1),
  examples: z.array(z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })),
  signature: signatureSchema,
  starterCode: z.object({ python: z.string(), javascript: z.string(), java: z.string().optional() }),
  tests: z.array(testCaseSchema).min(1),
  analysis: analysisSchema.optional(),
  source: z.enum(['built-in', 'pasted', 'variation', 'custom', 'leetcode']),
  leetcode: z
    .object({
      number: z.number().int().positive(),
      title: z.string().min(1),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      relation: z.enum(['same', 'similar']),
    })
    .optional()
    .describe('The LeetCode problem this one practices: its number, title and link only, never its text'),
  variationOf: z.object({ problemId: z.string(), change: z.string() }).optional(),
}) satisfies z.ZodType<Problem>;

export type ProblemInput = z.input<typeof problemSchema>;

export function parseProblem(value: unknown): { ok: true; problem: Problem } | { ok: false; errors: string[] } {
  const result = problemSchema.safeParse(value);
  if (result.success) return { ok: true, problem: result.data as Problem };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
