/** Helpers for adapter tests: a fake fetch that records requests and replays canned responses. */
export interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export function fakeFetch(respond: (req: Recorded) => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    if (input instanceof Request) input.headers.forEach((v, k) => (headers[k] = v));
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : init?.body;
    const rec = { url, headers, body };
    calls.push(rec);
    return respond(rec);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export function sse(events: { event?: string; data: unknown }[]): Response {
  const text = events
    .map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`)
    .join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** A complete Anthropic streaming response carrying `text`. */
export function anthropicStream(text: string, usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }, model = 'claude-sonnet-5-5') {
  return sse([
    { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, Math.ceil(text.length / 2)) } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(Math.ceil(text.length / 2)) } } },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
}
