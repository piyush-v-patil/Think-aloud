import { describe, expect, it, beforeAll } from 'vitest';
import { loadPyodide } from 'pyodide';
import { valuesMatch, formatValue } from './compare';
import { listFromArray, listToArray, treeFromArray, treeToArray } from './structures';
import { executeJs } from './js-exec';
import { executePython, installHarness, type PyodideLike } from './python-harness';
import { toTestRun } from './runner';
import type { FunctionSignature, TestCase } from '../types';

describe('valuesMatch', () => {
  it('compares exactly by default', () => {
    expect(valuesMatch([1, 2], [1, 2])).toBe(true);
    expect(valuesMatch([1, 2], [2, 1])).toBe(false);
    expect(valuesMatch({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(valuesMatch(null, undefined)).toBe(true);
    expect(valuesMatch(1, '1')).toBe(false);
  });
  it('ignores top-level order in unordered mode', () => {
    expect(valuesMatch([[1, 2], [3]], [[3], [1, 2]], 'unordered')).toBe(true);
    expect(valuesMatch([[2, 1], [3]], [[3], [1, 2]], 'unordered')).toBe(false);
  });
  it('ignores nested order in unordered-deep mode', () => {
    expect(valuesMatch([[2, 1], [3]], [[3], [1, 2]], 'unordered-deep')).toBe(true);
  });
  it('allows small float error', () => {
    expect(valuesMatch(2.5000001, 2.5, 'float')).toBe(true);
    expect(valuesMatch(2.51, 2.5, 'float')).toBe(false);
  });
  it('formats values briefly', () => {
    expect(formatValue(undefined)).toBe('nothing (no return value)');
    expect(formatValue('x'.repeat(500)).length).toBe(160);
  });
});

describe('structures', () => {
  it('round-trips linked lists and trees', () => {
    expect(listToArray(listFromArray([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(listToArray(listFromArray([]))).toEqual([]);
    expect(treeToArray(treeFromArray([3, 9, 20, null, null, 15, 7]))).toEqual([3, 9, 20, null, null, 15, 7]);
    expect(treeToArray(treeFromArray([]))).toEqual([]);
  });
});

const twoSum: FunctionSignature = {
  name: 'twoSum',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'int[]',
};
const tests: TestCase[] = [
  { name: 'basic', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { name: 'later pair', args: [[3, 2, 4], 6], expected: [1, 2] },
];

describe('JavaScript runner', () => {
  it('runs a correct solution', () => {
    const code = `function twoSum(nums, target) {
      const seen = new Map();
      for (let i = 0; i < nums.length; i++) {
        if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
        seen.set(nums[i], i);
      }
      return [];
    }`;
    const run = toTestRun(0, tests, executeJs({ id: 1, code, signature: twoSum, tests, mode: 'tests' }));
    expect(run.passed).toBe(2);
    expect(run.error).toBeUndefined();
  });
  it('reports wrong answers, thrown errors and console output per test', () => {
    const code = `function twoSum(nums, target) { console.log('n', nums.length); if (nums.length === 3) throw new Error('boom'); return [1, 0]; }`;
    const run = toTestRun(0, tests, executeJs({ id: 1, code, signature: twoSum, tests, mode: 'tests' }));
    expect(run.passed).toBe(0);
    expect(run.results[0].actual).toEqual([1, 0]);
    expect(run.results[0].stdout).toBe('n 4');
    expect(run.results[1].error).toContain('boom');
  });
  it('reports a syntax error as a fatal error', () => {
    const run = toTestRun(0, tests, executeJs({ id: 1, code: 'function twoSum( {', signature: twoSum, tests, mode: 'tests' }));
    expect(run.error).toMatch(/SyntaxError/);
  });
  it('explains a missing function', () => {
    const run = toTestRun(0, tests, executeJs({ id: 1, code: 'function other() {}', signature: twoSum, tests, mode: 'tests' }));
    expect(run.error).toContain("Couldn't find a function named twoSum");
  });
  it('supports a Solution class and linked lists', () => {
    const sig: FunctionSignature = { name: 'reverseList', params: [{ name: 'head', type: 'ListNode' }], returns: 'ListNode' };
    const code = `class Solution { reverseList(head) { let prev = null; while (head) { const n = head.next; head.next = prev; prev = head; head = n; } return prev; } }`;
    const t: TestCase[] = [{ name: 'three', args: [[1, 2, 3]], expected: [3, 2, 1] }];
    expect(toTestRun(0, t, executeJs({ id: 1, code, signature: sig, tests: t, mode: 'tests' })).passed).toBe(1);
  });
  it('runs scripts and collects output', () => {
    const res = executeJs({ id: 1, code: 'console.log(1 + 1)', tests: [], mode: 'script' });
    expect(res.stdout).toBe('2');
  });
});

describe('Python runner (Pyodide)', () => {
  let py: PyodideLike;
  beforeAll(async () => {
    py = (await loadPyodide()) as unknown as PyodideLike;
    installHarness(py);
  }, 60_000);

  it('runs a correct solution', () => {
    const code = `def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n`;
    const run = toTestRun(0, tests, executePython(py, { id: 1, code, signature: twoSum, tests, mode: 'tests' }));
    expect(run.passed).toBe(2);
  });
  it('supports the Solution class style and typing imports', () => {
    const code = `class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        return [0, 1] if nums[0] == 2 else [1, 2]\n`;
    const run = toTestRun(0, tests, executePython(py, { id: 1, code, signature: twoSum, tests, mode: 'tests' }));
    expect(run.passed).toBe(2);
  });
  it('reports errors with the line in your code', () => {
    const code = `def twoSum(nums, target):\n    print("hi")\n    return nums[99]\n`;
    const run = toTestRun(0, tests, executePython(py, { id: 1, code, signature: twoSum, tests, mode: 'tests' }));
    expect(run.results[0].error).toMatch(/IndexError.*line 3/);
    expect(run.results[0].stdout).toBe('hi\n');
  });
  it('reports syntax errors as fatal', () => {
    const run = toTestRun(0, tests, executePython(py, { id: 1, code: 'def twoSum(:\n  pass', signature: twoSum, tests, mode: 'tests' }));
    expect(run.error).toMatch(/SyntaxError.*line 1/);
  });
  it('converts trees', () => {
    const sig: FunctionSignature = { name: 'invert', params: [{ name: 'root', type: 'TreeNode' }], returns: 'TreeNode' };
    const code = `def invert(root):\n    if root:\n        root.left, root.right = invert(root.right), invert(root.left)\n    return root\n`;
    const t: TestCase[] = [{ name: 'tree', args: [[4, 2, 7, 1, 3, 6, 9]], expected: [4, 7, 2, 9, 6, 3, 1] }];
    expect(toTestRun(0, t, executePython(py, { id: 1, code, signature: sig, tests: t, mode: 'tests' })).passed).toBe(1);
  });
});

describe('worker lockdown', () => {
  it('removes network and storage globals from the scope', async () => {
    const { lockDownWorker } = await import('./lockdown');
    const scope: Record<string, unknown> = { fetch: () => 1, indexedDB: {}, other: 1 };
    lockDownWorker(scope);
    expect(scope.fetch).toBeUndefined();
    expect(scope.indexedDB).toBeUndefined();
    expect(scope.other).toBe(1);
  });
});
