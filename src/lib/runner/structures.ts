/**
 * Linked list and binary tree helpers shared by the JavaScript runner.
 * In tests, a linked list is an array and a tree is a level-order array with nulls.
 */
import type { ValueType } from '../types';

export class ListNode {
  val: unknown;
  next: ListNode | null;
  constructor(val: unknown = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

export class TreeNode {
  val: unknown;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val: unknown = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

const MAX_NODES = 100_000;

export function listFromArray(values: unknown[] | null): ListNode | null {
  if (!values || values.length === 0) return null;
  const head = new ListNode(values[0]);
  let cur = head;
  for (let i = 1; i < values.length; i++) {
    cur.next = new ListNode(values[i]);
    cur = cur.next;
  }
  return head;
}

export function listToArray(head: ListNode | null | undefined): unknown[] {
  const out: unknown[] = [];
  let cur = head ?? null;
  while (cur) {
    out.push(cur.val);
    if (out.length > MAX_NODES) throw new Error('The returned list looks like it has a cycle.');
    cur = cur.next;
  }
  return out;
}

export function treeFromArray(values: unknown[] | null): TreeNode | null {
  if (!values || values.length === 0 || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue: TreeNode[] = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const node = queue.shift()!;
    if (i < values.length && values[i] !== null) {
      node.left = new TreeNode(values[i]);
      queue.push(node.left);
    }
    i++;
    if (i < values.length && values[i] !== null) {
      node.right = new TreeNode(values[i]);
      queue.push(node.right);
    }
    i++;
  }
  return root;
}

export function treeToArray(root: TreeNode | null | undefined): unknown[] {
  const out: unknown[] = [];
  const queue: (TreeNode | null)[] = [root ?? null];
  while (queue.length) {
    const node = queue.shift()!;
    if (out.length > MAX_NODES) throw new Error('The returned tree is too large or has a cycle.');
    if (node) {
      out.push(node.val);
      queue.push(node.left, node.right);
    } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export function toLanguageValue(value: unknown, type: ValueType): unknown {
  if (type === 'ListNode') return listFromArray(value as unknown[] | null);
  if (type === 'TreeNode') return treeFromArray(value as unknown[] | null);
  return value;
}

export function fromLanguageValue(value: unknown, type: ValueType): unknown {
  if (type === 'ListNode') return listToArray(value as ListNode | null);
  if (type === 'TreeNode') return treeToArray(value as TreeNode | null);
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}
