import { describe, expect, it } from 'vitest';
import { MY_LIST_ID, entriesIn, parseImport, planAdd, planDeleteList, planRemove, slugFromLink, type CatalogProblem } from './lists';
import type { ListEntry } from '../storage/db';
import data from '../../data/leetcode-lists.json';

const problems: Record<string, CatalogProblem> = {
  'two-sum': { number: 1, title: 'Two Sum', difficulty: 'easy', pattern: 'Arrays & Hashing' },
  'merge-intervals': { number: 56, title: 'Merge Intervals', difficulty: 'medium', pattern: 'Intervals' },
};

let n = 0;
const ids = () => `l-${++n}`;
const entry = (over: Partial<ListEntry>): ListEntry => ({ id: ids(), title: 'x', addedAt: 0, sessions: [], ...over });

describe('bundled lists', () => {
  it('has the three lists, each inside the next, with numbers and links for every problem', () => {
    const lists = Object.fromEntries(data.lists.map((l) => [l.id, l.slugs]));
    expect(lists.blind75).toHaveLength(75);
    expect(lists.neetcode150).toHaveLength(150);
    expect(lists.neetcode250).toHaveLength(250);
    expect(lists.blind75.every((s) => lists.neetcode150.includes(s))).toBe(true);
    expect(lists.neetcode150.every((s) => lists.neetcode250.includes(s))).toBe(true);
    for (const slug of lists.neetcode250) {
      const p = (data.problems as Record<string, CatalogProblem>)[slug];
      expect(p.number, slug).toBeGreaterThan(0);
      expect(['easy', 'medium', 'hard']).toContain(p.difficulty);
    }
    expect(new Set(lists.neetcode250).size).toBe(250);
  });
});

describe('lists', () => {
  it('reads LeetCode links', () => {
    expect(slugFromLink('https://leetcode.com/problems/two-sum/description/')).toBe('two-sum');
    expect(slugFromLink('https://www.leetcode.com/problems/3sum')).toBe('3sum');
    expect(slugFromLink('https://example.com/problems/two-sum')).toBeUndefined();
  });

  it('puts entries saved before lists existed in My list', () => {
    const old = entry({ title: 'Old one' });
    const elsewhere = entry({ title: 'Other', lists: ['interview-prep'] });
    expect(entriesIn([old, elsewhere], MY_LIST_ID)).toEqual([old]);
  });

  it('adds problems to a list without duplicates, keeping their progress', () => {
    const practiced = entry({ title: 'Two Sum', slug: 'two-sum', lists: [], sessions: ['s-1'], text: 'statement' });
    const plan = planAdd(
      [practiced],
      [
        { slug: 'two-sum', title: 'Two Sum' },
        { slug: 'merge-intervals', title: 'Merge Intervals' },
        { slug: 'merge-intervals', title: 'Merge Intervals' },
      ],
      'mine',
      5,
      ids,
    );
    expect(plan.added).toBe(2);
    expect(plan.alreadyThere).toBe(1);
    const two = plan.save.find((e) => e.slug === 'two-sum')!;
    expect(two.id).toBe(practiced.id);
    expect(two.lists).toEqual(['mine']);
    expect(two.sessions).toEqual(['s-1']);
    const merge = plan.save.find((e) => e.slug === 'merge-intervals')!;
    expect(merge.link).toBe('https://leetcode.com/problems/merge-intervals/');
    expect(merge.lists).toEqual(['mine']);
  });

  it('copies into another list by joining it, never by duplicating', () => {
    const e = entry({ title: 'Two Sum', slug: 'two-sum', lists: ['mine'] });
    const plan = planAdd([e], [{ slug: 'two-sum', title: 'Two Sum' }], 'google', 0, ids);
    expect(plan.save).toEqual([{ ...e, lists: ['mine', 'google'] }]);
    const again = planAdd(plan.save, [{ slug: 'two-sum', title: 'Two Sum' }], 'google', 0, ids);
    expect(again).toMatchObject({ added: 0, alreadyThere: 1, save: [] });
  });

  it('matches the user’s own problems by title when there’s no link', () => {
    const e = entry({ title: 'My Weird Problem!', lists: ['mine'] });
    expect(planAdd([e], [{ title: 'my weird problem' }], 'mine', 0, ids).alreadyThere).toBe(1);
  });

  it('keeps progress when a problem leaves its last list, and drops untouched ones', () => {
    const touched = entry({ lists: ['mine'], sessions: ['s'] });
    const untouched = entry({ lists: ['mine'] });
    expect(planRemove(touched, 'mine')).toEqual({ save: { ...touched, lists: [] } });
    expect(planRemove(untouched, 'mine')).toEqual({ remove: untouched.id });
    const both = entry({ lists: ['mine', 'google'] });
    expect(planDeleteList([touched, untouched, both], 'mine')).toEqual({
      save: [{ ...touched, lists: [] }, { ...both, lists: ['google'] }],
      remove: [untouched.id],
    });
  });

  it('imports pasted lines in the usual formats', () => {
    const { items, skipped } = parseImport(
      [
        'https://leetcode.com/problems/two-sum/description/',
        '56. Merge Intervals',
        '- #1',
        'merge-intervals',
        'Two Sum',
        '9999. Some New Problem',
        'https://leetcode.com/problems/brand-new-problem/',
        'A problem of my own',
        '12345',
        '',
      ].join('\n'),
      problems,
    );
    expect(items).toEqual([
      { slug: 'two-sum', title: 'Two Sum' },
      { slug: 'merge-intervals', title: 'Merge Intervals' },
      { slug: 'two-sum', title: 'Two Sum' },
      { slug: 'merge-intervals', title: 'Merge Intervals' },
      { slug: 'two-sum', title: 'Two Sum' },
      { title: 'Some New Problem' },
      { slug: 'brand-new-problem', title: 'Brand New Problem' },
      { title: 'A problem of my own' },
    ]);
    expect(skipped).toEqual(['12345']);
  });
});
