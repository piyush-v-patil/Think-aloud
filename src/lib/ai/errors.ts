/**
 * Provider errors normalized into a few kinds the interface can explain.
 * Messages never include the key: `redact` strips it from anything that
 * might be shown or stored.
 */
export type ProviderErrorKind =
  | 'invalid-key'
  | 'no-credit'
  | 'rate-limit'
  | 'overloaded'
  | 'network'
  | 'not-found'
  | 'refused'
  | 'bad-request'
  | 'bad-output'
  | 'aborted'
  | 'unknown';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  /** Seconds to wait before retrying, when the provider said so. */
  readonly retryAfter?: number;
  constructor(kind: ProviderErrorKind, message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function redact(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('[key]');
  }
  // Belt and braces: anything that looks like a provider key.
  return out.replace(/\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})\b/g, '[key]');
}

/** Maps an HTTP status and provider message to a kind. Shared by the fetch-based adapters. */
export function kindFromStatus(status: number, message = ''): ProviderErrorKind {
  const m = message.toLowerCase();
  if (status === 401) return 'invalid-key';
  if (status === 402 || /credit|billing|quota|insufficient|balance|payment/.test(m)) return 'no-credit';
  if (status === 403) return /key|permission|denied/.test(m) ? 'invalid-key' : 'bad-request';
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limit';
  if (status === 529 || status === 503) return 'overloaded';
  if (status >= 500) return 'overloaded';
  if (status === 400 && /api key|api_key/.test(m)) return 'invalid-key';
  if (status >= 400) return 'bad-request';
  return 'unknown';
}
