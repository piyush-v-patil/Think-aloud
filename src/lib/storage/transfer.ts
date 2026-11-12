/**
 * Export everything to one file and import it again. API keys are never
 * included in an export.
 */
import { db, type ListEntry, type UserList } from './db';
import type { Problem, Session } from '../types';
import { readLocal, writeLocal } from './local';
import { APP_NAME } from '../../config/app';

export interface ExportFile {
  app: string;
  format: 1;
  exportedAt: string;
  sessions: Session[];
  audio: { id: string; mimeType: string; base64: string }[];
  list: ListEntry[];
  /** The user's own named lists (added after the first exports, so optional). */
  lists?: UserList[];
  problems: Problem[];
  settings: unknown;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportAll(): Promise<ExportFile> {
  const d = await db();
  const audio = await d.getAll('audio');
  return {
    app: APP_NAME,
    format: 1,
    exportedAt: new Date().toISOString(),
    sessions: await d.getAll('sessions'),
    audio: await Promise.all(audio.map(async (a) => ({ id: a.id, mimeType: a.mimeType, base64: await toBase64(a.blob) }))),
    list: await d.getAll('list'),
    lists: await d.getAll('lists'),
    problems: await d.getAll('problems'),
    settings: readLocal('settings', {}),
  };
}

/** Merges an export into this device. Returns how many sessions were added or updated. */
export async function importAll(raw: unknown): Promise<number> {
  const f = raw as Partial<ExportFile>;
  if (!f || f.format !== 1 || !Array.isArray(f.sessions)) throw new Error('not-an-export');
  for (const s of f.sessions) {
    if (typeof s?.id !== 'string' || typeof s.createdAt !== 'number' || !s.problem || !s.transcripts) throw new Error('not-an-export');
  }
  const d = await db();
  const tx = d.transaction(['sessions', 'audio', 'list', 'lists', 'problems'], 'readwrite');
  for (const s of f.sessions) await tx.objectStore('sessions').put(s);
  for (const a of f.audio ?? []) await tx.objectStore('audio').put({ id: a.id, mimeType: a.mimeType, blob: fromBase64(a.base64, a.mimeType) });
  for (const e of f.list ?? []) await tx.objectStore('list').put(e);
  for (const l of f.lists ?? []) await tx.objectStore('lists').put(l);
  for (const p of f.problems ?? []) await tx.objectStore('problems').put(p);
  await tx.done;
  if (f.settings && typeof f.settings === 'object' && !Object.keys(readLocal('settings', {})).length) writeLocal('settings', f.settings);
  return f.sessions.length;
}
