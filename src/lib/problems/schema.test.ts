import { describe, expect, it } from 'vitest';
import { parseProblem } from './schema';

const minimal = {
  schemaVersion: 1,
  id: 'demo-problem',
  title: 'Demo',
  difficulty: 'easy',
  topics: ['arrays-hashing'],
  statement: 'Return the sum.',
  examples: [],
  signature: { name: 'total', params: [{ name: 'nums', type: 'int[]' }], returns: 'int' },
  starterCode: { python: 'def total(nums):\n    pass\n', javascript: 'function total(nums) {}\n' },
  tests: [{ name: 'basic', args: [[1, 2]], expected: 3 }],
  source: 'built-in',
};

describe('problem schema', () => {
  it('accepts a minimal problem', () => {
    expect(parseProblem(minimal).ok).toBe(true);
  });
  it('reports the path of each error', () => {
    const res = parseProblem({ ...minimal, id: 'Bad Id', tests: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.startsWith('id:'))).toBe(true);
      expect(res.errors.some((e) => e.startsWith('tests:'))).toBe(true);
    }
  });
});
