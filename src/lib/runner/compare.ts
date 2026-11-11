import type { CompareMode } from '../types';

const FLOAT_TOLERANCE = 1e-5;

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function sortedCopy(values: unknown[]): unknown[] {
  return [...values].sort((a, b) => {
    const ca = canonical(a);
    const cb = canonical(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}

function equalExact(a: unknown, b: unknown, float: boolean): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return float ? Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(b)) : a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => equalExact(v, b[i], float));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return (
      equalExact(ka, kb, false) &&
      ka.every((k) =>
        equalExact((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], float),
      )
    );
  }
  // Treat null and undefined as the same "no value".
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return a === b;
}

/** Compares a returned value with the expected value using the test's mode. */
export function valuesMatch(actual: unknown, expected: unknown, mode: CompareMode = 'exact'): boolean {
  switch (mode) {
    case 'exact':
      return equalExact(actual, expected, false);
    case 'float':
      return equalExact(actual, expected, true);
    case 'unordered':
      if (!Array.isArray(actual) || !Array.isArray(expected)) return equalExact(actual, expected, false);
      return equalExact(sortedCopy(actual), sortedCopy(expected), false);
    case 'unordered-deep': {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return equalExact(actual, expected, false);
      const norm = (xs: unknown[]) => sortedCopy(xs.map((x) => (Array.isArray(x) ? sortedCopy(x) : x)));
      return equalExact(norm(actual), norm(expected), false);
    }
  }
}

/** Short, readable rendering of a value for test output. */
export function formatValue(value: unknown, max = 160): string {
  let text: string;
  if (value === undefined) text = 'nothing (no return value)';
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
