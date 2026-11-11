import { useSyncExternalStore } from 'react';

/**
 * Hash routing, so the static build works on any host (GitHub Pages has no
 * rewrites). Routes: #/ setup, #/interview, #/replay/<id>, #/history,
 * #/settings, #/list.
 */
export interface Route {
  name: 'setup' | 'interview' | 'replay' | 'history' | 'settings' | 'list' | 'not-found';
  param?: string;
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [head, param] = path.split('/');
  switch (head) {
    case '':
      return { name: 'setup' };
    case 'interview':
      return { name: 'interview' };
    case 'replay':
      return param ? { name: 'replay', param: decodeURIComponent(param) } : { name: 'not-found' };
    case 'history':
      return { name: 'history' };
    case 'settings':
      return { name: 'settings', param };
    case 'list':
      return { name: 'list' };
    default:
      return { name: 'not-found' };
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseHash(hash);
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}
