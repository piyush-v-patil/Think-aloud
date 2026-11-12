/**
 * Local storage for everything the app keeps: IndexedDB only, on this device.
 * Nothing here is ever sent anywhere.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Problem, Session } from '../types';

export interface ListEntry {
  id: string;
  title: string;
  link?: string;
  /** Problem text the user pasted locally (never committed anywhere). */
  text?: string;
  /** Prepared problem once its analysis has been generated. */
  problemId?: string;
  addedAt: number;
  completedAt?: number;
  /** Average rubric score from the most recent session on this entry (1 to 4). */
  lastScore?: number;
  sessions: string[];
  /** LeetCode problem slug ("two-sum"), so the same problem is never added twice. */
  slug?: string;
  /**
   * Which of the user's lists it's in. Missing on entries saved before
   * lists existed: those are in "My list". An empty array keeps a problem's
   * progress (practiced from a bundled list) without showing it in any list.
   */
  lists?: string[];
}

/** One of the user's own lists. The bundled lists (Blind 75, NeetCode) aren't stored. */
export interface UserList {
  id: string;
  name: string;
  createdAt: number;
}

interface ThinkAloudDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { createdAt: number } };
  audio: { key: string; value: { id: string; blob: Blob; mimeType: string } };
  problems: { key: string; value: Problem };
  analysisCache: { key: string; value: { hash: string; problem: Problem; createdAt: number } };
  list: { key: string; value: ListEntry };
  lists: { key: string; value: UserList };
}

const DB_NAME = 'think-aloud';
let dbPromise: Promise<IDBPDatabase<ThinkAloudDB>> | null = null;

export function db(): Promise<IDBPDatabase<ThinkAloudDB>> {
  dbPromise ??= openDB<ThinkAloudDB>(DB_NAME, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('createdAt', 'createdAt');
        database.createObjectStore('audio', { keyPath: 'id' });
        database.createObjectStore('problems', { keyPath: 'id' });
        database.createObjectStore('analysisCache', { keyPath: 'hash' });
        database.createObjectStore('list', { keyPath: 'id' });
      }
      // Version 2: the user's own named lists.
      if (oldVersion < 2) database.createObjectStore('lists', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function saveSession(session: Session): Promise<void> {
  await (await db()).put('sessions', session);
}

export async function getSession(id: string): Promise<Session | undefined> {
  return (await db()).get('sessions', id);
}

export async function listSessions(): Promise<Session[]> {
  const all = await (await db()).getAllFromIndex('sessions', 'createdAt');
  return all.reverse();
}

export async function deleteSession(id: string): Promise<void> {
  const d = await db();
  const s = await d.get('sessions', id);
  if (s?.audio) await d.delete('audio', s.audio.id);
  await d.delete('sessions', id);
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  await (await db()).put('audio', { id, blob, mimeType: blob.type });
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('audio', id))?.blob;
}

export async function saveProblem(problem: Problem): Promise<void> {
  await (await db()).put('problems', problem);
}

export async function getProblem(id: string): Promise<Problem | undefined> {
  return (await db()).get('problems', id);
}

export async function getCachedAnalysis(hash: string): Promise<Problem | undefined> {
  return (await (await db()).get('analysisCache', hash))?.problem;
}

export async function cacheAnalysis(hash: string, problem: Problem): Promise<void> {
  await (await db()).put('analysisCache', { hash, problem, createdAt: Date.now() });
}

export async function listEntries(): Promise<ListEntry[]> {
  return (await db()).getAll('list');
}

export async function saveListEntry(entry: ListEntry): Promise<void> {
  await (await db()).put('list', entry);
}

export async function deleteListEntry(id: string): Promise<void> {
  await (await db()).delete('list', id);
}

export async function userLists(): Promise<UserList[]> {
  return (await db()).getAll('lists');
}

export async function saveUserList(list: UserList): Promise<void> {
  await (await db()).put('lists', list);
}

export async function deleteUserList(id: string): Promise<void> {
  await (await db()).delete('lists', id);
}

/** Removes every store's contents. Used by "Delete all data". */
export async function clearAll(): Promise<void> {
  const d = await db();
  await Promise.all(
    (['sessions', 'audio', 'problems', 'analysisCache', 'list', 'lists'] as const).map((s) => d.clear(s)),
  );
}
