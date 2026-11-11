/**
 * Removes network and storage access from a worker before any user or
 * model-written code runs in it. Workers can't read localStorage (where keys
 * may be kept), but they can reach IndexedDB and the network, so those go.
 */
const BLOCKED = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'indexedDB',
  'caches',
  'importScripts',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'navigator',
  'WebTransport',
  'RTCPeerConnection',
];

export function lockDownWorker(scope: object = globalThis): void {
  for (const name of BLOCKED) {
    try {
      Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
    } catch {
      // Already non-configurable in this environment: nothing more we can do.
    }
  }
}

export const BLOCKED_GLOBALS = BLOCKED;
