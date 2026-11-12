import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { preparePasted } from './prepare';
import type { AIProvider, JsonRequest } from '../ai/types';
import { runTests } from '../../../scripts/lib/node-runner';
import type { PreparedOutput } from './analyze';

function output(overrides: Partial<PreparedOutput> = {}): PreparedOutput {
  return {
    title: 'Sum of evens',
    difficulty: 'easy',
    topics: ['arrays-hashing'],
    statement: 'Return the sum of the even numbers in `nums`.',
    examples: [{ input: 'nums = [1, 2, 4]', output: '6' }],
    signature: { name: 'sum_evens', params: [{ name: 'nums', type: 'int[]' }], returns: 'int' },
    tests: [
      { name: 'example', argsJson: '[[1, 2, 4]]', expectedJson: '6' },
      { name: 'empty', argsJson: '[[]]', expectedJson: '0' },
      { name: 'negatives', argsJson: '[[-2, 3]]', expectedJson: '-2' },
      { name: 'wrong expectation', argsJson: '[[2]]', expectedJson: '3', hidden: true },
      { name: 'malformed', argsJson: 'not json', expectedJson: '1' },
    ],
    analysis: {
      clarifyingQuestions: [
        { question: 'Empty list?', answer: 'Return 0.', why: 'Base case.' },
        { question: 'Negatives?', answer: 'Yes.', why: 'Parity of negatives.' },
      ],
      hiddenConstraints: [],
      edgeCases: [
        { input: '[]', why: 'Empty.' },
        { input: '[-2]', why: 'Negative even.' },
      ],
      approaches: [{ name: 'Loop', idea: 'Add evens.', time: 'O(n)', space: 'O(1)', tradeoffs: 'None.' }],
      optimal: { name: 'Loop', explanation: 'Add evens.', time: 'O(n)', space: 'O(1)' },
      hintLadder: ['a', 'b', 'c'],
      expectedMentions: [
        { id: 'a', what: 'a', category: 'clarification' },
        { id: 'b', what: 'b', category: 'planning' },
        { id: 'c', what: 'c', category: 'testing' },
      ],
      followUps: [],
      vocabulary: ['even'],
      referenceSolution: {
        python: 'def sum_evens(nums):\n    return sum(n for n in nums if n % 2 == 0)\n',
        javascript: 'function sum_evens(nums) { return nums.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0); }\n',
      },
      walkthrough: [1, 2, 3, 4, 5].map((i) => ({ phase: 'plan' as const, say: `step ${i}` })),
    },
    ...overrides,
  };
}

function stubProvider(outputs: PreparedOutput[]): AIProvider & { calls: JsonRequest<unknown>[] } {
  const calls: JsonRequest<unknown>[] = [];
  return {
    id: 'anthropic',
    capabilities: { streaming: true, structuredOutput: true, promptCaching: 'explicit' },
    calls,
    async chat() {
      throw new Error('not used');
    },
    async json<T>(req: JsonRequest<T>) {
      calls.push(req as JsonRequest<unknown>);
      const data = outputs[Math.min(calls.length - 1, outputs.length - 1)] as unknown as T;
      return { data, text: '', model: req.model, usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
    async checkKey() {},
  };
}

describe('preparePasted', () => {
  it('builds a problem, drops tests the reference disagrees with, and caches by text', async () => {
    const provider = stubProvider([output()]);
    const usage: string[] = [];
    const text = 'Given a list of numbers, return the sum of the even ones. (test A)';
    const first = await preparePasted(text, { provider, model: 'claude-opus-5-5', run: runTests, record: (role) => usage.push(role) });
    expect(first.cached).toBe(false);
    expect(first.problem.tests.map((t) => t.name)).toEqual(['example', 'empty', 'negatives']);
    expect(first.problem.starterCode.python).toContain('def sum_evens(nums):');
    expect(usage).toEqual(['analysis']);
    // The pasted text is wrapped so instructions inside it read as data.
    expect(provider.calls[0].turns[0].text).toContain('<pasted_problem>');

    const again = await preparePasted(text, { provider, model: 'claude-opus-5-5', run: runTests, record: () => {} });
    expect(again.cached).toBe(true);
    expect(provider.calls).toHaveLength(1);
  }, 60_000);

  it('retries once with feedback when the reference solution fails', async () => {
    const broken = output();
    broken.analysis = { ...broken.analysis, referenceSolution: { python: 'def sum_evens(nums):\n    return 0\n', javascript: 'function sum_evens() { return 0; }' } };
    const provider = stubProvider([broken, output()]);
    const res = await preparePasted('Sum the even numbers in a list. (test B)', { provider, model: 'm', run: runTests, record: () => {} });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].turns[0].text).toContain('failed these checks');
    expect(res.problem.tests.length).toBe(3);
  }, 60_000);
});

describe('prepareVariation', () => {
  it('writes a checked variation that records what changed', async () => {
    const { prepareVariation } = await import('./prepare');
    const provider = stubProvider([{ ...output({ title: 'Sum of odds' }), change: 'This time you sum the odd numbers.' } as PreparedOutput]);
    const base = { id: 'crate-pair', title: 'Crate pair', statement: 's', signature: output().signature } as never;
    const p = await prepareVariation(base, { provider, model: 'm', run: runTests, record: () => {} });
    expect(p.source).toBe('variation');
    expect(p.variationOf).toEqual({ problemId: 'crate-pair', change: 'This time you sum the odd numbers.' });
    expect(p.id.startsWith('var-crate-pair-')).toBe(true);
    expect(provider.calls[0].turns[0].text).toContain('<original_problem>');
    expect(provider.calls[0].system[1].text).toContain('Writing a variation');
  }, 60_000);
});

describe('prepareFromLeetCode', () => {
  it('writes a known LeetCode problem in its own words, checked, with the LeetCode reference', async () => {
    const { prepareFromLeetCode } = await import('./prepare');
    const provider = stubProvider([{ ...output({ title: 'Whatever the model called it' }), known: true } as PreparedOutput]);
    const p = await prepareFromLeetCode(
      { slug: 'sum-of-evens', number: 9001, title: 'Sum of Evens', difficulty: 'easy', pattern: 'Arrays & Hashing' },
      { provider, model: 'm', run: runTests, record: () => {} },
    );
    expect(p.id).toBe('lc-sum-of-evens');
    expect(p.source).toBe('leetcode');
    expect(p.title).toBe('Sum of Evens');
    expect(p.leetcode).toEqual({ number: 9001, title: 'Sum of Evens', slug: 'sum-of-evens', relation: 'same' });
    expect(p.tests.map((t) => t.name)).toEqual(['example', 'empty', 'negatives']);
    expect(provider.calls[0].turns[0].text).toContain('<leetcode_problem>');
    expect(provider.calls[0].system[1].text).toContain('Writing a known problem from its name');
    expect(provider.calls[0].system[1].text).toContain('in your own words');
  }, 60_000);

  it('asks for the statement instead of guessing when the model doesn’t know the problem', async () => {
    const { prepareFromLeetCode, UnknownProblemError } = await import('./prepare');
    const provider = stubProvider([{ ...output(), known: false } as PreparedOutput]);
    await expect(prepareFromLeetCode({ slug: 'obscure-one', number: 4242, title: 'Obscure One' }, { provider, model: 'm', run: runTests, record: () => {} })).rejects.toBeInstanceOf(
      UnknownProblemError,
    );
    expect(provider.calls).toHaveLength(1);
  }, 60_000);
});
