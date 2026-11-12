/**
 * The Java harness end to end on the real in-browser compiler (TeaVM),
 * loaded from vendor/teavm in Node.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executeJava, type JavaToolchain } from './java-exec';
import { createTeaVMToolchain, type TeaVMLoad } from './teavm';
import { javaStarter, javaLiteral, javaMethodName, javaReturnType, nodeClasses } from './java-harness';
import { toTestRun } from './runner';
import type { FunctionSignature, TestCase } from '../types';

const vendor = join(__dirname, '..', '..', '..', 'vendor', 'teavm');
let toolchain: JavaToolchain;

beforeAll(async () => {
  const { load } = (await import(/* @vite-ignore */ pathToFileURL(join(vendor, 'compiler.wasm-runtime.js')).href)) as { load: TeaVMLoad };
  toolchain = await createTeaVMToolchain({
    load,
    compilerWasm: readFileSync(join(vendor, 'compiler.wasm')),
    javaApi: readFileSync(join(vendor, 'java-api.bin')),
    classlib: readFileSync(join(vendor, 'runtime-classlib-teavm.bin')),
  });
}, 60_000);

const merge: FunctionSignature = { name: 'merge_bookings', params: [{ name: 'bookings', type: 'int[][]' }], returns: 'int[][]' };
const mergeTests: TestCase[] = [
  { name: 'example', args: [[[9, 11], [1, 4], [3, 6], [11, 12]]], expected: [[1, 6], [9, 12]] },
  { name: 'empty', args: [[]], expected: [] },
];

async function run(code: string, signature: FunctionSignature, tests: TestCase[]) {
  const res = await executeJava(toolchain, { id: 1, code, signature, tests, mode: 'tests' });
  return toTestRun(0, tests, res);
}

describe('Java harness helpers', () => {
  it('names methods and types the way Java code does', () => {
    expect(javaMethodName('merge_bookings')).toBe('mergeBookings');
    expect(javaMethodName('two_sum_2')).toBe('twoSum2');
    expect(javaReturnType('int[][]', mergeTests)).toBe('int[][]');
    expect(javaReturnType('int[][]', [{ name: 'x', args: [], expected: [[1], [1, 2]] }])).toBe('List<List<Integer>>');
    expect(javaReturnType('string[][]')).toBe('List<List<String>>');
    expect(javaLiteral([[1, 2], []], 'int[][]')).toBe('new int[][]{{1, 2}, {}}');
    expect(javaLiteral('a"b\\\n', 'string')).toBe('"a\\"b\\\\\\n"');
    expect(javaLiteral(2, 'float')).toBe('2.0');
    expect(javaLiteral([1, null, 2], 'TreeNode')).toBe('__TA.tree(new Integer[]{1, null, 2})');
  });

  it('writes starter code that names the method and node classes', () => {
    const s = javaStarter({ name: 'reverse_route', params: [{ name: 'head', type: 'ListNode' }], returns: 'ListNode' });
    expect(s).toContain('public ListNode reverseRoute(ListNode head)');
    expect(s).toContain('Already defined for you');
    expect(javaStarter(merge, mergeTests)).toContain('public int[][] mergeBookings(int[][] bookings)');
    // The comment showing ListNode must not count as the candidate defining it.
    expect(Object.keys(nodeClasses(s))).toEqual(['ListNode.java', 'TreeNode.java']);
    expect(Object.keys(nodeClasses('class ListNode { int val; ListNode next; }'))).toEqual(['TreeNode.java']);
  });
});

describe('Java on TeaVM', () => {
  it('passes a correct solution, with a natural return type', async () => {
    const code = `class Solution {
    public List<int[]> mergeBookings(int[][] bookings) {
        Arrays.sort(bookings, (a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> out = new ArrayList<>();
        for (int[] b : bookings) {
            if (!out.isEmpty() && b[0] <= out.get(out.size() - 1)[1]) {
                out.get(out.size() - 1)[1] = Math.max(out.get(out.size() - 1)[1], b[1]);
            } else out.add(b);
        }
        return out;
    }
}`;
    const r = await run(code, merge, mergeTests);
    expect(r.error).toBeUndefined();
    expect(r.passed).toBe(2);
  }, 60_000);

  it('fails a wrong answer and keeps what the code printed', async () => {
    const code = `class Solution {
    public int[][] mergeBookings(int[][] bookings) {
        System.out.println("rows: " + bookings.length);
        return bookings;
    }
}`;
    const r = await run(code, merge, mergeTests);
    expect(r.passed).toBe(1);
    expect(r.results[0].passed).toBe(false);
    expect(r.results[0].actual).toEqual([[9, 11], [1, 4], [3, 6], [11, 12]]);
    expect(r.results[0].stdout).toBe('rows: 4\n');
  }, 60_000);

  it('reports a compile error on the candidate’s own line', async () => {
    const code = `class Solution {
    public int[][] mergeBookings(int[][] bookings) {
        int x = "nope";
        return bookings;
    }
}`;
    const r = await run(code, merge, mergeTests);
    expect(r.error).toMatch(/^Line 3: incompatible types/);
  }, 60_000);

  it('explains a renamed method instead of showing the harness error', async () => {
    const r = await run('class Solution { public int[][] merge(int[][] b) { return b; } }', merge, mergeTests);
    expect(r.error).toBe("Couldn't call mergeBookings(int[][]) on class Solution. Keep the class name, method name and parameter types from the starter code.");
  }, 60_000);

  it('names a crash in Java terms, and later tests still run', async () => {
    const sig: FunctionSignature = { name: 'pick', params: [{ name: 'nums', type: 'int[]' }, { name: 'i', type: 'int' }], returns: 'int' };
    const tests: TestCase[] = [
      { name: 'out of range', args: [[1, 2], 5], expected: 0 },
      { name: 'thrown', args: [[1, 2], -1], expected: 0 },
      { name: 'fine', args: [[1, 2], 1], expected: 2 },
    ];
    const code = `class Solution {
    public int pick(int[] nums, int i) {
        if (i < 0) throw new IllegalArgumentException("negative index");
        return nums[i];
    }
}`;
    const r = await run(code, sig, tests);
    expect(r.results.map((x) => x.error)).toEqual(['ArrayIndexOutOfBoundsException', 'IllegalArgumentException: negative index', undefined]);
    expect(r.results[2].passed).toBe(true);
  }, 60_000);

  it('points at a known gap when a crash could come from one', async () => {
    const sig: FunctionSignature = { name: 'copy_first', params: [{ name: 'nums', type: 'int[]' }], returns: 'int' };
    const r = await run('class Solution { public int copyFirst(int[] nums) { int[] base = {7}; int[] c = base.clone(); return c[0]; } }', sig, [{ name: 'one', args: [[7]], expected: 7 }]);
    expect(r.results[0].error).toBe('NullPointerException (in the in-browser Java, copying an array with .clone() doesn’t work here; use Arrays.copyOf(a, a.length))');
  }, 60_000);

  it('builds and reads linked lists and trees', async () => {
    const list: FunctionSignature = { name: 'reverse_route', params: [{ name: 'head', type: 'ListNode' }], returns: 'ListNode' };
    const rev = `class Solution {
    public ListNode reverseRoute(ListNode head) {
        ListNode prev = null;
        while (head != null) { ListNode next = head.next; head.next = prev; prev = head; head = next; }
        return prev;
    }
}`;
    const r1 = await run(rev, list, [
      { name: 'three', args: [[1, 2, 3]], expected: [3, 2, 1] },
      { name: 'empty', args: [[]], expected: [] },
    ]);
    expect(r1.passed).toBe(2);

    const tree: FunctionSignature = { name: 'mirror', params: [{ name: 'root', type: 'TreeNode' }], returns: 'TreeNode' };
    const mirror = `class Solution {
    public TreeNode mirror(TreeNode root) {
        if (root == null) return null;
        TreeNode l = mirror(root.left);
        root.left = mirror(root.right);
        root.right = l;
        return root;
    }
}`;
    const r2 = await run(mirror, tree, [{ name: 'small', args: [[1, 2, 3, null, 4]], expected: [1, 3, 2, null, null, 4] }]);
    expect(r2.passed).toBe(1);
  }, 60_000);

  it('works around library methods TeaVM lacks, without changing line numbers', async () => {
    const sig: FunctionSignature = { name: 'most_common', params: [{ name: 'words', type: 'string[]' }], returns: 'string' };
    const code = `class Solution {
    public String mostCommon(String[] words) {
        Map<String, Integer> counts = new HashMap<>();
        for (String w : words) counts.merge(w, 1, Integer::sum);
        Map<String, Long> again = Arrays.stream(words).collect(Collectors.groupingBy(w -> w, Collectors.counting()));
        String best = null;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (best == null || e.getValue() > counts.get(best)) best = e.getKey();
        }
        return best + again.get(best);
    }
}`;
    const r = await run(code, sig, [{ name: 'basic', args: [['a', 'b', 'a']], expected: 'a2' }]);
    expect(r.error).toBeUndefined();
    expect(r.passed).toBe(1);
  }, 60_000);

  it('runs code without tests through its own main method', async () => {
    const res = await executeJava(toolchain, { id: 2, code: 'public class Scratch { public static void main(String[] a) { System.out.println(List.of(1, 2)); } }', tests: [], mode: 'script' });
    expect(res.fatal).toBeUndefined();
    expect(res.stdout).toBe('[1, 2]\n');
  }, 60_000);
});
