export function newId(prefix = ''): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`.slice(0, 24);
}

/** Stable SHA-256 hex of a string, used to cache analyses by problem text. */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim().replace(/\s+/g, ' '));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
