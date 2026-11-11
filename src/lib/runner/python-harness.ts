/**
 * Python side of the test harness. The user's code runs with exec() inside
 * Pyodide; arguments and results cross the boundary as JSON.
 */
import type { RunRequest, RunResponse } from './protocol';

export const PYTHON_HARNESS = String.raw`
import json, sys, io, time, traceback
import collections, heapq, bisect, itertools, functools, math, string, re
from collections import *
from typing import *

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    def __repr__(self):
        return f"ListNode({self.val})"

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
    def __repr__(self):
        return f"TreeNode({self.val})"

_MAX_NODES = 100000

def _list_from(values):
    if not values:
        return None
    head = ListNode(values[0])
    cur = head
    for v in values[1:]:
        cur.next = ListNode(v)
        cur = cur.next
    return head

def _list_to(node):
    out = []
    while node is not None:
        out.append(node.val)
        if len(out) > _MAX_NODES:
            raise ValueError("The returned list looks like it has a cycle.")
        node = node.next
    return out

def _tree_from(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = collections.deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

def _tree_to(root):
    out = []
    queue = collections.deque([root])
    while queue:
        node = queue.popleft()
        if len(out) > _MAX_NODES:
            raise ValueError("The returned tree is too large or has a cycle.")
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def _to_py(value, kind):
    if kind == "ListNode":
        return _list_from(value)
    if kind == "TreeNode":
        return _tree_from(value)
    return value

def _plain(value):
    if isinstance(value, (set, frozenset)):
        return [_plain(v) for v in value]
    if isinstance(value, (list, tuple, deque)):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (ListNode, TreeNode)):
        return repr(value)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return str(value)
    return value

def _from_py(value, kind):
    if kind == "ListNode":
        return _list_to(value)
    if kind == "TreeNode":
        return _tree_to(value)
    return _plain(value)

def _describe(exc):
    line = None
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == "<your code>":
            line = frame.lineno
    if isinstance(exc, SyntaxError) and exc.filename == "<your code>":
        line = exc.lineno
    text = "".join(traceback.format_exception_only(type(exc), exc)).strip().splitlines()[-1]
    return f"{text} (line {line})" if line else text

def __think_aloud_run(code, request_json):
    req = json.loads(request_json)
    top = io.StringIO()
    real_stdout = sys.stdout
    # Give the code the same conveniences an interview platform does:
    # typing names, collections, heapq, math and the node classes.
    ns = {k: v for k, v in globals().items() if not k.startswith("_")}
    ns["__name__"] = "__main__"
    sys.stdout = top
    try:
        exec(compile(code, "<your code>", "exec"), ns)
    except BaseException as exc:
        sys.stdout = real_stdout
        return json.dumps({"fatal": _describe(exc), "outcomes": [], "stdout": top.getvalue()})
    finally:
        sys.stdout = real_stdout
    if req["mode"] == "script":
        return json.dumps({"outcomes": [], "stdout": top.getvalue()})
    sig = req["signature"]
    name = sig["name"]
    fn = ns.get(name)
    if fn is None and "Solution" in ns:
        fn = getattr(ns["Solution"](), name, None)
    if not callable(fn):
        return json.dumps({"fatal": f"Couldn't find a function named {name}. Keep the name from the starter code.", "outcomes": [], "stdout": top.getvalue()})
    outcomes = []
    for test in req["tests"]:
        buf = io.StringIO()
        sys.stdout = buf
        start = time.perf_counter()
        try:
            args = [_to_py(a, sig["params"][i]["type"] if i < len(sig["params"]) else "any") for i, a in enumerate(json.loads(json.dumps(test["args"])))]
            result = fn(*args)
            actual = _from_py(result, sig["returns"])
            json.dumps(actual)
            outcomes.append({"ok": True, "actual": actual, "stdout": buf.getvalue(), "ms": (time.perf_counter() - start) * 1000})
        except BaseException as exc:
            outcomes.append({"ok": False, "error": _describe(exc), "stdout": buf.getvalue(), "ms": (time.perf_counter() - start) * 1000})
        finally:
            sys.stdout = real_stdout
    return json.dumps({"outcomes": outcomes, "stdout": top.getvalue()})
`;

/** Minimal interface of a loaded Pyodide instance that the harness needs. */
export interface PyodideLike {
  runPython(code: string): unknown;
  globals: { get(name: string): unknown };
}

export function installHarness(py: PyodideLike): void {
  py.runPython(PYTHON_HARNESS);
}

export function executePython(py: PyodideLike, req: RunRequest): RunResponse {
  const run = py.globals.get('__think_aloud_run') as (code: string, json: string) => string;
  const raw = run(
    req.code,
    JSON.stringify({ mode: req.mode, signature: req.signature ?? null, tests: req.tests }),
  );
  const parsed = JSON.parse(raw) as Omit<RunResponse, 'id'>;
  return { id: req.id, ...parsed, stdout: parsed.stdout ?? '' };
}
