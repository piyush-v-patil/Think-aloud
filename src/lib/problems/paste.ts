import type { Problem } from '../types';

/**
 * A pasted problem before analysis: the text as written, no tests. It
 * becomes a full problem (signature, tests, analysis) once the AI provider
 * prepares it; until then "Run code" just runs the code.
 */
export function draftFromPaste(text: string, id: string): Problem {
  const clean = text.replace(/\r\n/g, '\n').trim();
  const firstLine = clean.split('\n').find((l) => l.trim()) ?? 'Pasted problem';
  const title = firstLine.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim().slice(0, 80);
  return {
    schemaVersion: 1,
    id,
    title,
    difficulty: 'medium',
    topics: ['arrays-hashing'],
    statement: clean,
    examples: [],
    signature: { name: 'solve', params: [], returns: 'any' },
    starterCode: {
      python: '# Write your solution here.\n',
      javascript: '// Write your solution here.\n',
    },
    tests: [],
    source: 'pasted',
  };
}

/** True when a problem has runnable tests (built-in, or a prepared paste). */
export function hasTests(problem: Problem): boolean {
  return problem.tests.length > 0 && problem.signature.params.length > 0;
}
