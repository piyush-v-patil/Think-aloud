/**
 * API keys. Kept in memory; written to localStorage only when the user
 * chooses "Remember on this device". Never logged, never put in a URL,
 * never sent anywhere except the provider the key belongs to.
 */
import type { ProviderId } from '../lib/types';
import { readLocal, removeLocal, writeLocal } from '../lib/storage/local';
import { createStore, useStore } from './store';

export type KeyName = ProviderId | 'deepgram' | 'assemblyai' | 'openai-speech';

export interface KeyEntry {
  value: string;
  remember: boolean;
  /** Result of the last check, if any. */
  status?: 'ok' | 'error';
  checkedAt?: number;
}

type Keys = Partial<Record<KeyName, KeyEntry>>;

function loadRemembered(): Keys {
  const saved = readLocal<Keys>('keys', {});
  const out: Keys = {};
  for (const [name, entry] of Object.entries(saved) as [KeyName, KeyEntry][]) {
    if (entry?.value && entry.remember) out[name] = entry;
  }
  return out;
}

export const keysStore = createStore<Keys>(loadRemembered());

function persist() {
  const remembered: Keys = {};
  for (const [name, entry] of Object.entries(keysStore.get()) as [KeyName, KeyEntry][]) {
    if (entry?.remember) remembered[name] = entry;
  }
  if (Object.keys(remembered).length) writeLocal('keys', remembered);
  else removeLocal('keys');
}

export function setKey(name: KeyName, value: string, remember: boolean) {
  keysStore.set((k) => ({ ...k, [name]: { value: value.trim(), remember } }));
  persist();
}

export function setKeyStatus(name: KeyName, status: 'ok' | 'error') {
  keysStore.set((k) => (k[name] ? { ...k, [name]: { ...k[name]!, status, checkedAt: Date.now() } } : k));
  persist();
}

export function setRemember(name: KeyName, remember: boolean) {
  keysStore.set((k) => (k[name] ? { ...k, [name]: { ...k[name]!, remember } } : k));
  persist();
}

export function clearKey(name: KeyName) {
  keysStore.set((k) => {
    const next = { ...k };
    delete next[name];
    return next;
  });
  persist();
}

export function clearAllKeys() {
  keysStore.set({});
  removeLocal('keys');
}

export function getKey(name: KeyName): string | undefined {
  return keysStore.get()[name]?.value || undefined;
}

export function useKeys(): Keys {
  return useStore(keysStore);
}

/** Masked form for display: first 7 and last 4 characters. */
export function maskKey(value: string): string {
  if (value.length <= 14) return '•'.repeat(value.length);
  return `${value.slice(0, 7)}${'•'.repeat(8)}${value.slice(-4)}`;
}
