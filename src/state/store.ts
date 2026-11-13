import { useRef, useSyncExternalStore } from 'react';

/** A tiny observable store. Enough for app-wide settings without a library. */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Like useStore, but re-renders only when `equal` says the selected value
 * changed. Keeps a fast-changing field (a clock) from re-rendering
 * everything that reads the store.
 */
export function useStoreSelect<T, S>(store: ReturnType<typeof createStore<T>>, select: (state: T) => S, equal: (a: S, b: S) => boolean = Object.is): S {
  const cache = useRef<{ state: T; value: S } | null>(null);
  const get = () => {
    const state = store.get();
    const c = cache.current;
    if (c && c.state === state) return c.value;
    const value = select(state);
    if (c && equal(c.value, value)) {
      cache.current = { state, value: c.value };
      return c.value;
    }
    cache.current = { state, value };
    return value;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

/** Equality for useStoreSelect: every field the same, apart from the ones named. */
export function sameExcept<T extends object>(ignore: readonly (keyof T)[]) {
  return (a: T, b: T) => {
    for (const k of Object.keys(a) as (keyof T)[]) if (!ignore.includes(k) && !Object.is(a[k], b[k])) return false;
    return true;
  };
}
