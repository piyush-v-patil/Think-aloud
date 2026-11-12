import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { Problem } from '../types';

// The AI and the code runner are stand-ins: each "written" problem resolves when the test says so.
const writes: { slug: string; resolve: (p: Problem) => void; reject: (e: unknown) => void }[] = [];
vi.mock('../ai/factory', () => ({ createProvider: () => ({}) }));
vi.mock('../runner/runner', () => ({ CodeRunner: class { runTests() {} dispose() {} } }));
vi.mock('../problems/prepare', async (orig) => {
  const real = await orig<typeof import('../problems/prepare')>();
  return {
    ...real,
    prepareFromLeetCode: (t: { slug: string }) => new Promise<Problem>((resolve, reject) => writes.push({ slug: t.slug, resolve, reject })),
  };
});

const { enqueue, problemForPractice, queueStore, loadPrepared } = await import('./prepare-queue');
const { UnknownProblemError } = await import('../problems/prepare');
const { getProblem } = await import('../storage/db');

function written(slug: string): Problem {
  return { id: `lc-${slug}`, title: slug, source: 'leetcode', statement: 's', examples: [], signature: { functionName: 'f', params: [], returns: 'int' }, difficulty: 'easy', tests: [], starterCode: { python: '', javascript: '' } } as unknown as Problem;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('prepare queue', () => {
  it('writes problems one at a time, skips ones already queued, and records failures', async () => {
    await loadPrepared();
    expect(enqueue([{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }])).toBe(2);
    expect(enqueue([{ slug: 'a', title: 'A' }])).toBe(0);
    await tick();
    expect(queueStore.get().current?.slug).toBe('a');
    expect(writes.map((w) => w.slug)).toEqual(['a']);

    writes[0].resolve(written('a'));
    await vi.waitFor(() => expect(writes.length).toBe(2));
    expect(queueStore.get().prepared.has('a')).toBe(true);
    expect((await getProblem('lc-a'))?.prepUsage).toEqual([]);

    writes[1].reject(new UnknownProblemError('not sure'));
    await vi.waitFor(() => expect(queueStore.get().current).toBeNull());
    expect(queueStore.get().failed).toEqual([expect.objectContaining({ slug: 'b', unknown: true })]);
    expect(enqueue([{ slug: 'a', title: 'A' }])).toBe(0);
  });

  it('practice waits for the problem being written instead of writing it twice', async () => {
    writes.length = 0;
    enqueue([{ slug: 'c', title: 'C' }, { slug: 'd', title: 'D' }]);
    await tick();
    const practice = problemForPractice({ slug: 'c', title: 'C' });
    await tick();
    expect(writes.map((w) => w.slug)).toEqual(['c']);
    writes[0].resolve(written('c'));
    expect((await practice).id).toBe('lc-c');

    // The queue moves on to the next; a problem already saved is never written again.
    await vi.waitFor(() => expect(writes.length).toBe(2));
    expect(writes[1].slug).toBe('d');
    const saved = await problemForPractice({ slug: 'c', title: 'C' });
    expect(saved.id).toBe('lc-c');
    expect(writes.length).toBe(2);
    writes[1].resolve(written('d'));
    await vi.waitFor(() => expect(queueStore.get().current).toBeNull());
  });
});
