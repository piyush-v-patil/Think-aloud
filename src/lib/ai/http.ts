/** Shared helpers for the fetch-based adapters (OpenAI, Gemini, OpenAI-compatible). */
import { z } from 'zod';
import { ProviderError, kindFromStatus, redact } from './errors';
import type { ChatTurn, PromptBlock } from './types';

export async function post(f: typeof fetch, url: string, init: RequestInit, key: string | undefined): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ProviderError('aborted', 'Cancelled');
    throw new ProviderError('network', 'Could not reach the provider.');
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = redact((await res.text()).slice(0, 400), [key]);
    } catch {
      // ignore
    }
    const retry = Number(res.headers.get('retry-after'));
    throw new ProviderError(kindFromStatus(res.status, message), message, res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return res;
}

/** Parses a server-sent-events response into its data payloads. */
export async function* sse(res: Response): AsyncGenerator<{ event?: string; data: string }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event: string | undefined;
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
    }
    if (done) break;
  }
}

export function systemText(blocks: PromptBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}

/** Merges consecutive same-role turns and makes sure the conversation starts with the user. */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.text += `\n\n${t.text}`;
    else out.push({ ...t });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', text: '(The interview is starting.)' });
  return out;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}
