/**
 * Java side of the test harness, as pure functions so it runs the same in
 * the browser worker (TeaVM), in Node tests, and against a real JDK in CI.
 *
 * The user's code is a `class Solution` with a camelCase method. For each
 * test, a generated `__ThinkAloudMain` builds the arguments as Java literals,
 * calls the method, and prints the result as JSON after a marker line. The
 * page compares that JSON with the expected value exactly as for Python and
 * JavaScript, so any natural return type works (`int[][]`,
 * `List<List<Integer>>`, ...).
 */
import type { FunctionSignature, TestCase, ValueType } from '../types';

export const JAVA_MAIN_CLASS = '__ThinkAloudMain';
export const JAVA_RESULT_MARKER = '@@THINK_ALOUD_RESULT@@';

/** merge_bookings -> mergeBookings */
export function javaMethodName(name: string): string {
  return name.replace(/_+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

const PARAM_TYPES: Record<ValueType, string> = {
  int: 'int',
  float: 'double',
  bool: 'boolean',
  string: 'String',
  'int[]': 'int[]',
  'float[]': 'double[]',
  'string[]': 'String[]',
  'bool[]': 'boolean[]',
  'int[][]': 'int[][]',
  'string[][]': 'String[][]',
  ListNode: 'ListNode',
  TreeNode: 'TreeNode',
  any: 'Object',
};

export function javaParamType(type: ValueType): string {
  return PARAM_TYPES[type];
}

/**
 * The return type the starter code declares: what a Java interviewer would
 * expect. Lists of strings come back as lists; a list of rows is `int[][]`
 * when every row is a fixed-size pair (intervals, coordinates), otherwise
 * `List<List<Integer>>` (combinations, groups). The harness accepts either.
 */
export function javaReturnType(type: ValueType, tests: TestCase[] = []): string {
  if (type === 'string[]') return 'List<String>';
  if (type === 'string[][]') return 'List<List<String>>';
  if (type === 'int[][]') {
    const rows = tests.flatMap((t) => (Array.isArray(t.expected) ? (t.expected as unknown[]) : []));
    const lengths = new Set(rows.map((r) => (Array.isArray(r) ? r.length : -1)));
    return lengths.size <= 1 && !lengths.has(-1) ? 'int[][]' : 'List<List<Integer>>';
  }
  return PARAM_TYPES[type];
}

const DEFAULT_RETURNS: Record<string, string> = {
  int: 'return 0;',
  double: 'return 0.0;',
  boolean: 'return false;',
  String: 'return "";',
  'int[]': 'return new int[0];',
  'double[]': 'return new double[0];',
  'boolean[]': 'return new boolean[0];',
  'int[][]': 'return new int[0][];',
  'List<String>': 'return new ArrayList<>();',
  'List<List<String>>': 'return new ArrayList<>();',
  'List<List<Integer>>': 'return new ArrayList<>();',
  ListNode: 'return null;',
  TreeNode: 'return null;',
  Object: 'return null;',
};

const NODE_COMMENTS: Partial<Record<ValueType, string>> = {
  ListNode: ` * class ListNode {
 *     int val;
 *     ListNode next;
 *     ListNode(int val) { this.val = val; }
 * }`,
  TreeNode: ` * class TreeNode {
 *     int val;
 *     TreeNode left, right;
 *     TreeNode(int val) { this.val = val; }
 * }`,
};

/** Starter code for a problem, generated from its signature. */
export function javaStarter(signature: FunctionSignature, tests: TestCase[] = []): string {
  const ret = javaReturnType(signature.returns, tests);
  const params = signature.params.map((p) => `${javaParamType(p.type)} ${javaMethodName(p.name)}`).join(', ');
  const nodeTypes = [...new Set([signature.returns, ...signature.params.map((p) => p.type)])].filter((t) => NODE_COMMENTS[t]);
  const comment = nodeTypes.length
    ? `/*\n * Already defined for you:\n *\n${nodeTypes.map((t) => NODE_COMMENTS[t]).join('\n *\n')}\n */\n`
    : '';
  return `import java.util.*;

${comment}class Solution {
    public ${ret} ${javaMethodName(signature.name)}(${params}) {
        ${DEFAULT_RETURNS[ret] ?? 'return null;'}
    }
}
`;
}

// ------------------------------------------------------------------ literals

function javaString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c > 0x7e) {
      // Keep the source ASCII; surrogate pairs come out as two escapes.
      for (const unit of String.fromCodePoint(c).split('')) out += `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return `${out}"`;
}

function javaInt(v: unknown): string {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`Expected an integer, got ${JSON.stringify(v)}`);
  return String(v);
}

function javaDouble(v: unknown): string {
  if (typeof v !== 'number') throw new Error(`Expected a number, got ${JSON.stringify(v)}`);
  if (Number.isNaN(v)) return 'Double.NaN';
  if (!Number.isFinite(v)) return v > 0 ? 'Double.POSITIVE_INFINITY' : 'Double.NEGATIVE_INFINITY';
  const s = String(v);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error(`Expected a list, got ${JSON.stringify(v)}`);
  return v;
}

/** A test value as a Java expression of the parameter's type. */
export function javaLiteral(value: unknown, type: ValueType): string {
  switch (type) {
    case 'int':
      return javaInt(value);
    case 'float':
      return javaDouble(value);
    case 'bool':
      return value ? 'true' : 'false';
    case 'string':
      return javaString(String(value));
    case 'int[]':
      return `new int[]{${arr(value).map(javaInt).join(', ')}}`;
    case 'float[]':
      return `new double[]{${arr(value).map(javaDouble).join(', ')}}`;
    case 'bool[]':
      return `new boolean[]{${arr(value).map((b) => (b ? 'true' : 'false')).join(', ')}}`;
    case 'string[]':
      return `new String[]{${arr(value).map((s) => javaString(String(s))).join(', ')}}`;
    case 'int[][]':
      return `new int[][]{${arr(value).map((row) => `{${arr(row).map(javaInt).join(', ')}}`).join(', ')}}`;
    case 'string[][]':
      return `new String[][]{${arr(value).map((row) => `{${arr(row).map((s) => javaString(String(s))).join(', ')}}`).join(', ')}}`;
    case 'ListNode':
      return `__TA.list(new int[]{${(value === null ? [] : arr(value)).map(javaInt).join(', ')}})`;
    case 'TreeNode':
      return `__TA.tree(new Integer[]{${(value === null ? [] : arr(value)).map((v) => (v === null ? 'null' : javaInt(v))).join(', ')}})`;
    case 'any':
      throw new Error('Inputs of any type are not supported in Java yet.');
  }
}

// ------------------------------------------------------------------- sources

/** Imports an interview platform provides, put on line 1 so line numbers don't move. */
const AUTO_IMPORTS = 'import java.util.*; import java.util.function.*; import java.util.stream.*; ';

/**
 * Library methods the in-browser Java (TeaVM) doesn't have, and an
 * equivalent written on the same line. Applied to the compiled copy only;
 * what the candidate sees and writes is unchanged.
 */
const SUBSTITUTIONS: [RegExp, string][] = [
  [/\bInteger\s*::\s*sum\b/g, '((__a, __b) -> __a + __b)'],
  [/\bLong\s*::\s*sum\b/g, '((__a, __b) -> __a + __b)'],
  [/\bDouble\s*::\s*sum\b/g, '((__a, __b) -> __a + __b)'],
  [/\bCollectors\s*\.\s*counting\s*\(\s*\)/g, 'Collectors.summingLong(__x -> 1L)'],
];

export function prepareUserCode(code: string): string {
  let out = code;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  // Same rule as interview platforms: java.util and friends are imported.
  // A file with a package declaration keeps it first, so it's left alone.
  if (!/^\s*package\s/m.test(out)) out = AUTO_IMPORTS + out;
  return out;
}

const LIST_NODE = `class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
`;

const TREE_NODE = `class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}
`;

/** Builds inputs, prints results as JSON. Uses only APIs TeaVM supports. */
const SUPPORT = `final class __TA {
    static final int MAX_NODES = 100000;

    interface Call { Object call() throws Exception; }

    static void report(boolean emptyIfNull, Call c) {
        String out;
        try {
            Object r = c.call();
            StringBuilder sb = new StringBuilder();
            if (r == null && emptyIfNull) sb.append("[]");
            else json(r, sb);
            out = "{\\"ok\\":true,\\"actual\\":" + sb + "}";
        } catch (Throwable t) {
            StringBuilder sb = new StringBuilder();
            str(describe(t), sb);
            out = "{\\"ok\\":false,\\"error\\":" + sb + "}";
        }
        System.out.println();
        System.out.println("${JAVA_RESULT_MARKER}" + out);
    }

    static String describe(Throwable t) {
        String s = t.toString();
        for (String p : new String[]{"java.lang.", "java.util."}) {
            if (s.startsWith(p)) s = s.substring(p.length());
        }
        return s;
    }

    static ListNode list(int[] values) {
        if (values.length == 0) return null;
        ListNode head = new ListNode(values[0]);
        ListNode cur = head;
        for (int i = 1; i < values.length; i++) {
            cur.next = new ListNode(values[i]);
            cur = cur.next;
        }
        return head;
    }

    static TreeNode tree(Integer[] values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        ArrayDeque<TreeNode> queue = new ArrayDeque<>();
        queue.add(root);
        int i = 1;
        while (!queue.isEmpty() && i < values.length) {
            TreeNode node = queue.poll();
            if (i < values.length && values[i] != null) {
                node.left = new TreeNode(values[i]);
                queue.add(node.left);
            }
            i++;
            if (i < values.length && values[i] != null) {
                node.right = new TreeNode(values[i]);
                queue.add(node.right);
            }
            i++;
        }
        return root;
    }

    static void str(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') sb.append("\\\\\\"");
            else if (c == '\\\\') sb.append("\\\\\\\\");
            else if (c == '\\n') sb.append("\\\\n");
            else if (c == '\\r') sb.append("\\\\r");
            else if (c == '\\t') sb.append("\\\\t");
            else if (c < 0x20 || c > 0x7e) {
                String hex = Integer.toHexString(c);
                sb.append("\\\\u");
                for (int k = hex.length(); k < 4; k++) sb.append('0');
                sb.append(hex);
            } else sb.append(c);
        }
        sb.append('"');
    }

    static void num(double d, StringBuilder sb) {
        if (Double.isNaN(d) || Double.isInfinite(d)) str(String.valueOf(d), sb);
        else if (d == Math.rint(d) && Math.abs(d) < 1e15) sb.append(String.valueOf((long) d));
        else sb.append(String.valueOf(d));
    }

    static void json(Object o, StringBuilder sb) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof Boolean) { sb.append(((Boolean) o).booleanValue() ? "true" : "false"); return; }
        if (o instanceof Integer || o instanceof Long || o instanceof Short || o instanceof Byte) { sb.append(o.toString()); return; }
        if (o instanceof Double || o instanceof Float) { num(((Number) o).doubleValue(), sb); return; }
        if (o instanceof Character) { str(String.valueOf(((Character) o).charValue()), sb); return; }
        if (o instanceof String) { str((String) o, sb); return; }
        if (o instanceof ListNode) {
            sb.append('[');
            int n = 0;
            for (ListNode cur = (ListNode) o; cur != null; cur = cur.next) {
                if (++n > MAX_NODES) throw new IllegalStateException("The returned list looks like it has a cycle.");
                if (n > 1) sb.append(',');
                sb.append(cur.val);
            }
            sb.append(']');
            return;
        }
        if (o instanceof TreeNode) {
            ArrayList<String> out = new ArrayList<>();
            ArrayDeque<Object[]> queue = new ArrayDeque<>();
            queue.add(new Object[]{o});
            while (!queue.isEmpty()) {
                TreeNode node = (TreeNode) queue.poll()[0];
                if (out.size() > MAX_NODES) throw new IllegalStateException("The returned tree is too large or has a cycle.");
                if (node == null) out.add("null");
                else {
                    out.add(String.valueOf(node.val));
                    queue.add(new Object[]{node.left});
                    queue.add(new Object[]{node.right});
                }
            }
            int end = out.size();
            while (end > 0 && out.get(end - 1).equals("null")) end--;
            sb.append('[');
            for (int i = 0; i < end; i++) { if (i > 0) sb.append(','); sb.append(out.get(i)); }
            sb.append(']');
            return;
        }
        if (o instanceof int[]) { int[] a = (int[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); sb.append(a[i]); } sb.append(']'); return; }
        if (o instanceof long[]) { long[] a = (long[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); sb.append(a[i]); } sb.append(']'); return; }
        if (o instanceof double[]) { double[] a = (double[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); num(a[i], sb); } sb.append(']'); return; }
        if (o instanceof boolean[]) { boolean[] a = (boolean[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); sb.append(a[i] ? "true" : "false"); } sb.append(']'); return; }
        if (o instanceof char[]) { char[] a = (char[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); str(String.valueOf(a[i]), sb); } sb.append(']'); return; }
        if (o instanceof Object[]) { Object[] a = (Object[]) o; sb.append('['); for (int i = 0; i < a.length; i++) { if (i > 0) sb.append(','); json(a[i], sb); } sb.append(']'); return; }
        if (o instanceof Collection) {
            sb.append('[');
            boolean first = true;
            for (Object x : (Collection<?>) o) { if (!first) sb.append(','); first = false; json(x, sb); }
            sb.append(']');
            return;
        }
        if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Object k : ((Map<?, ?>) o).keySet()) {
                if (!first) sb.append(',');
                first = false;
                str(String.valueOf(k), sb);
                sb.append(':');
                json(((Map<?, ?>) o).get(k), sb);
            }
            sb.append('}');
            return;
        }
        str(String.valueOf(o), sb);
    }
}
`;

export interface JavaSources {
  /** File name -> source. */
  files: Record<string, string>;
  mainClass: string;
  /** The file holding the candidate's code. */
  userFile: string;
}

/** Java requires a public class to live in a file of the same name. */
export function userFileName(code: string): string {
  const m = /\bpublic\s+(?:(?:final|abstract|sealed|strictfp)\s+)*(?:class|record|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(codeOnly(code));
  return `${m ? m[1] : 'Solution'}.java`;
}

/** Code without comments or string contents, for looking at its declarations. */
function codeOnly(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"/g, ' ');
}

function definesClass(code: string, name: string): boolean {
  return new RegExp(`\\b(class|record|interface)\\s+${name}\\b`).test(codeOnly(code));
}

/** Every source file for a test run. `args[0]` of the main class picks the test. */
export function buildJavaTestSources(code: string, signature: FunctionSignature, tests: TestCase[]): JavaSources {
  const method = javaMethodName(signature.name);
  // A null list or tree is an empty one, as in the Python and JavaScript runners.
  const emptyIfNull = signature.returns === 'ListNode' || signature.returns === 'TreeNode';
  const cases = tests
    .map((test, i) => {
      const args = test.args.map((a, j) => javaLiteral(a, signature.params[j]?.type ?? 'any')).join(', ');
      return `            case ${i}: __TA.report(${emptyIfNull}, () -> new Solution().${method}(${args})); break;`;
    })
    .join('\n');
  const main = `import java.util.*;

public class ${JAVA_MAIN_CLASS} {
    public static void main(String[] args) {
        int test = args.length > 0 ? Integer.parseInt(args[0]) : -1;
        switch (test) {
${cases}
            default: break;
        }
    }
}

${SUPPORT}`;
  const userFile = userFileName(code);
  return { files: { [userFile]: prepareUserCode(code), [`${JAVA_MAIN_CLASS}.java`]: main, ...nodeClasses(code) }, mainClass: JAVA_MAIN_CLASS, userFile };
}

/** ListNode and TreeNode, unless the candidate wrote their own. */
export function nodeClasses(code: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!definesClass(code, 'ListNode')) files['ListNode.java'] = LIST_NODE;
  if (!definesClass(code, 'TreeNode')) files['TreeNode.java'] = TREE_NODE;
  return files;
}

// ------------------------------------------------------------------- output

export interface ParsedRun {
  ok: boolean;
  actual?: unknown;
  error?: string;
  /** What the code printed before the result. */
  stdout: string;
}

/** Splits a test program's output into what the code printed and the harness's result line. */
export function parseJavaOutput(stdout: string): ParsedRun | null {
  const at = stdout.lastIndexOf(JAVA_RESULT_MARKER);
  if (at < 0) return null;
  // The harness prints a newline before the marker so it sits on its own line.
  const printed = stdout.slice(0, at).replace(/\n\n$/, '\n').replace(/^\n$/, '');
  try {
    const result = JSON.parse(stdout.slice(at + JAVA_RESULT_MARKER.length).split('\n')[0]) as { ok: boolean; actual?: unknown; error?: string };
    return { ...result, stdout: printed };
  } catch {
    return { ok: false, error: 'The test result could not be read.', stdout: printed };
  }
}

// ------------------------------------------------------------------- errors

/** WebAssembly traps, in the Java terms a candidate expects. */
export function describeJavaTrap(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('array element access out of bounds') || m.includes('index out of bounds')) return 'ArrayIndexOutOfBoundsException';
  if (m.includes('null pointer') || m.includes('null reference') || m.includes('dereferencing a null')) return 'NullPointerException';
  if (m.includes('divide by zero') || m.includes('division by zero')) return 'ArithmeticException: / by zero';
  if (m.includes('call stack') || m.includes('stack overflow') || m.includes('too much recursion')) return 'StackOverflowError';
  if (m.includes('illegal cast') || m.includes('cast')) return 'ClassCastException';
  if (m.includes('out of memory') || m.includes('could not allocate')) return 'OutOfMemoryError';
  return `The program stopped: ${message}`;
}

export interface JavaDiagnostic {
  type: string;
  severity: string;
  fileName?: string;
  lineNumber?: number;
  message: string;
}

/**
 * The first compile error, in plain words, pointing at the candidate's own
 * lines. Errors in the generated harness mean the method or class name
 * changed; errors from TeaVM mean a library method it doesn't have.
 */
export function describeJavaCompileError(diagnostics: JavaDiagnostic[], userFile: string, signature?: FunctionSignature): string {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const mine = (d: JavaDiagnostic) => !!d.fileName && d.fileName.replace(/^:/, '') === userFile;
  const first = errors.find(mine) ?? errors[0];
  if (!first) return 'The code did not compile.';
  const message = first.message.split('\n')[0].trim();
  const detail = first.message
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(', ');
  if (first.type === 'teavm') {
    const where = mine(first) && first.lineNumber ? `Line ${first.lineNumber} uses` : 'Your code uses';
    return `${where} a part of the Java library that the in-browser Java doesn't include. Try a different method, for example a loop or a lambda instead of a method reference.`;
  }
  if (mine(first)) {
    return `Line ${first.lineNumber ?? '?'}: ${message}${detail ? ` (${detail})` : ''}`;
  }
  if (signature) {
    const params = signature.params.map((p) => javaParamType(p.type)).join(', ');
    return `Couldn't call ${javaMethodName(signature.name)}(${params}) on class Solution. Keep the class name, method name and parameter types from the starter code.`;
  }
  return `${message}${detail ? ` (${detail})` : ''}`;
}
