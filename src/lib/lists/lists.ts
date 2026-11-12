/**
 * Problem lists: the user's own (stored on this device) and the bundled
 * LeetCode study lists (Blind 75, NeetCode 150 and 250: titles, numbers and
 * links only). Progress belongs to the problem, not the list: one entry per
 * problem, identified by its LeetCode slug, with the lists it's in. So
 * copying between lists never makes a duplicate, and practicing Two Sum
 * from Blind 75 shows in NeetCode 150 too.
 */
import type { ListEntry, UserList } from '../storage/db';
import type { Difficulty } from '../types';

/** The list every entry saved before lists existed belongs to. */
export const MY_LIST_ID = 'mine';

export interface CatalogProblem {
  number?: number;
  title: string;
  difficulty: Difficulty;
  pattern: string;
}

export interface BundledList {
  id: string;
  name: string;
  about: string;
  slugs: string[];
}

export interface LeetCodeLists {
  source: string;
  generatedOn: string;
  problems: Record<string, CatalogProblem>;
  lists: BundledList[];
}

let catalog: Promise<LeetCodeLists> | null = null;

/** The bundled lists, loaded on first use (about 50 KB). */
export function loadLeetCodeLists(): Promise<LeetCodeLists> {
  catalog ??= import('../../data/leetcode-lists.json').then((m) => m.default as unknown as LeetCodeLists);
  return catalog;
}

export function leetcodeUrl(slug: string): string {
  return `https://leetcode.com/problems/${slug}/`;
}

/** "https://leetcode.com/problems/two-sum/description/" -> "two-sum". */
export function slugFromLink(link: string): string | undefined {
  const m = /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i.exec(link.trim());
  return m ? m[1].toLowerCase() : undefined;
}

/** "two-sum" -> "Two Sum", for links to problems outside the bundled lists. */
export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function listsOf(entry: ListEntry): string[] {
  return entry.lists ?? [MY_LIST_ID];
}

export function entriesIn(entries: ListEntry[], listId: string): ListEntry[] {
  return entries.filter((e) => listsOf(e).includes(listId));
}

/** Something to add to a list: a LeetCode problem (slug) or the user's own (title, maybe a link). */
export interface NewItem {
  title: string;
  link?: string;
  slug?: string;
  text?: string;
}

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The entry already standing for this problem, if any: same slug, or (without one) same title. */
export function findEntry(entries: ListEntry[], item: NewItem): ListEntry | undefined {
  if (item.slug) return entries.find((e) => e.slug === item.slug || (!!e.link && slugFromLink(e.link) === item.slug));
  return entries.find((e) => !e.slug && normal(e.title) === normal(item.title));
}

export interface AddPlan {
  /** Entries to write: new ones and existing ones joining the list. */
  save: ListEntry[];
  added: number;
  alreadyThere: number;
}

/**
 * Works out what adding items to a list means: existing problems join the
 * list (once), new ones are created. Pure, so it can be tested; the caller
 * saves `save`.
 */
export function planAdd(entries: ListEntry[], items: NewItem[], listId: string, now: number, newId: () => string): AddPlan {
  const pool = [...entries];
  const save = new Map<string, ListEntry>();
  let added = 0;
  let alreadyThere = 0;
  for (const item of items) {
    const existing = findEntry(pool, item);
    if (existing) {
      if (listsOf(existing).includes(listId)) {
        alreadyThere++;
        continue;
      }
      const joined: ListEntry = {
        ...existing,
        lists: [...listsOf(existing), listId],
        slug: existing.slug ?? item.slug,
        text: existing.text ?? item.text,
      };
      pool[pool.indexOf(existing)] = joined;
      save.set(joined.id, joined);
      added++;
      continue;
    }
    const entry: ListEntry = {
      id: newId(),
      title: item.title,
      link: item.link ?? (item.slug ? leetcodeUrl(item.slug) : undefined),
      slug: item.slug,
      text: item.text,
      addedAt: now,
      sessions: [],
      lists: [listId],
    };
    pool.push(entry);
    save.set(entry.id, entry);
    added++;
  }
  return { save: [...save.values()], added, alreadyThere };
}

/**
 * Taking a problem out of a list. Its progress stays if it has any (or it's
 * in another list); otherwise the entry goes.
 */
export function planRemove(entry: ListEntry, listId: string): { save?: ListEntry; remove?: string } {
  const lists = listsOf(entry).filter((l) => l !== listId);
  const hasProgress = entry.sessions.length > 0 || !!entry.text;
  if (lists.length === 0 && !hasProgress) return { remove: entry.id };
  return { save: { ...entry, lists } };
}

/** What deleting a whole list does to each entry in it. */
export function planDeleteList(entries: ListEntry[], listId: string): { save: ListEntry[]; remove: string[] } {
  const save: ListEntry[] = [];
  const remove: string[] = [];
  for (const e of entriesIn(entries, listId)) {
    const r = planRemove(e, listId);
    if (r.save) save.push(r.save);
    if (r.remove) remove.push(r.remove);
  }
  return { save, remove };
}

export interface ParsedImport {
  items: NewItem[];
  /** Lines that couldn't be read as a problem. */
  skipped: string[];
}

/**
 * Reads pasted lines as problems: LeetCode links, "1. Two Sum",
 * "1 - Two Sum", "#1", "two-sum", or just a title. Numbers and titles are
 * matched against the bundled catalog; anything else becomes the user's
 * own entry with that title.
 */
export function parseImport(text: string, problems: Record<string, CatalogProblem>): ParsedImport {
  const byNumber = new Map<number, string>();
  const byTitle = new Map<string, string>();
  for (const [slug, p] of Object.entries(problems)) {
    if (p.number) byNumber.set(p.number, slug);
    byTitle.set(normal(p.title), slug);
  }
  const fromSlug = (slug: string): NewItem => ({ slug, title: problems[slug]?.title ?? titleFromSlug(slug) });
  const items: NewItem[] = [];
  const skipped: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^[-*•]\s+/, '');
    if (!line) continue;
    const url = /https?:\/\/\S+/.exec(line)?.[0];
    if (url) {
      const slug = slugFromLink(url);
      if (slug) items.push(fromSlug(slug));
      else if (/^https?:\/\//.test(url) && line.replace(url, '').trim()) items.push({ title: line.replace(url, '').trim().replace(/[-:|]\s*$/, '').trim(), link: url });
      else skipped.push(line);
      continue;
    }
    if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(line)) {
      items.push(fromSlug(line));
      continue;
    }
    const numbered = /^#?(\d+)(?:[.):\-\s]+(.*))?$/.exec(line);
    if (numbered) {
      const slug = byNumber.get(Number(numbered[1]));
      const title = numbered[2]?.trim();
      if (slug) items.push(fromSlug(slug));
      else if (title) items.push(byTitle.has(normal(title)) ? fromSlug(byTitle.get(normal(title))!) : { title });
      else skipped.push(line);
      continue;
    }
    const slug = byTitle.get(normal(line));
    items.push(slug ? fromSlug(slug) : { title: line });
  }
  return { items, skipped };
}

export type ListRef = { kind: 'user'; list: UserList } | { kind: 'bundled'; list: BundledList };
