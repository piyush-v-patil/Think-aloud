/**
 * Runs the Claude Code bridge end to end against a fake `claude` binary, and
 * talks to it with the app's own OpenAI-compatible client.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { z } from 'zod';
import { CompatibleProvider } from '../src/lib/ai/compatible';
import { ProviderError } from '../src/lib/ai/errors';

const TOKEN = 'test-token-0123456789abcdef0123456789';

const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
const log = (o) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ pid: process.pid, t: Date.now(), ...o }) + '\\n');
const at = (flag) => args[args.indexOf(flag) + 1];
const system = fs.readFileSync(at('--system-prompt-file'), 'utf8');
log({ event: 'spawn', args, system, cwd: process.cwd(), mds: process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS });
process.on('SIGTERM', () => { log({ event: 'exit' }); process.exit(0); });
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
let turn = 0;
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  const content = JSON.parse(line).message.content;
  turn++;
  log({ event: 'turn', turn, content });
  if (turn === 1) out({ type: 'system', subtype: 'init', model: 'claude-' + at('--model') + '-test', tools: [] });
  if (content.includes('PLEASE FAIL')) {
    out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
    return;
  }
  if (content.includes('GO SLOW')) await new Promise((r) => setTimeout(r, 5000));
  const reply = system.includes('JSON Schema') ? '{"ok":true}' : 'Reply ' + turn;
  const usage = { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 };
  out({ type: 'stream_event', event: { type: 'message_start', message: { model: 'claude-' + at('--model') + '-test', usage: { ...usage, output_tokens: 1 } } } });
  for (const piece of reply.match(/.{1,3}/g)) {
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } } });
  }
  out({ type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage } });
  out({ type: 'stream_event', event: { type: 'message_stop' } });
  // Claude Code can do its own follow-up work before reporting the result.
  if (content.includes('SLOW SUMMARY')) await new Promise((r) => setTimeout(r, 1500));
  log({ event: 'result' });
  out({ type: 'result', subtype: 'success', is_error: false, result: reply, usage: { ...usage, output_tokens: 99 } });
});
`;

let dir: string;
let bridge: ChildProcess;
let base: string;
let port: number;
type LogLine = { pid: number; t: number; event: 'spawn' | 'turn' | 'exit' | 'result'; args?: string[]; system?: string; cwd?: string; mds?: string; content?: string; turn?: number };
const readLog = async (): Promise<LogLine[]> =>
  (await readFile(join(dir, 'log.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogLine);
const lastTurn = async () => (await readLog()).filter((l) => l.event === 'turn').at(-1)!;
const spawnOf = async (pid: number) => (await readLog()).find((l) => l.event === 'spawn' && l.pid === pid)!;
const chat = (turns: { role: 'user' | 'assistant'; text: string }[], system = 'You are the interviewer.', signal?: AbortSignal) =>
  new CompatibleProvider(base, TOKEN, undefined, 'claude-code').chat({ model: 'sonnet', system: [{ text: system }], turns, maxTokens: 100, effort: 'low', signal });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bridge-test-'));
  const fake = join(dir, 'claude');
  await writeFile(fake, FAKE_CLAUDE);
  await chmod(fake, 0o755);
  bridge = spawn(process.execPath, ['scripts/claude-bridge.mjs', '--port', '0', '--origin', 'https://allowed.example'], {
    env: { ...process.env, THINK_ALOUD_BRIDGE_TOKEN: TOKEN, CLAUDE_BIN: fake, FAKE_LOG: join(dir, 'log.jsonl') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise<string>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`bridge did not start: ${out}`)), 10_000);
    bridge.stdout!.on('data', (d) => {
      out += d;
      const m = /Address\s+(http:\/\/localhost:(\d+)\/v1)/.exec(out);
      if (m && out.includes('Claude Code')) {
        clearTimeout(timer);
        port = Number(m[2]);
        resolve(m[1]);
      }
    });
  });
});

afterAll(async () => {
  bridge?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  await rm(dir, { recursive: true, force: true });
});

function raw(path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode!, headers: res.headers });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('claude bridge', () => {
  it('streams a reply through the CLI with tools, hooks and memory files off', async () => {
    const p = new CompatibleProvider(base, TOKEN, undefined, 'claude-code');
    const seen: string[] = [];
    const res = await p.chat({
      model: 'sonnet',
      system: [{ text: 'You are the interviewer.' }],
      turns: [
        { role: 'user', text: 'Can the list be empty?' },
        { role: 'assistant', text: 'Yes, it can.' },
        { role: 'user', text: 'Then I return an empty list.' },
      ],
      maxTokens: 100,
      effort: 'low',
      onText: (t) => seen.push(t),
    });
    expect(res.text).toBe('Reply 1');
    expect(seen.length).toBeGreaterThan(1);
    expect(res.model).toBe('claude-sonnet-test');
    expect(res.usage).toEqual({ inputTokens: 15, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 0 });

    const turn = await lastTurn();
    const spawned = await spawnOf(turn.pid);
    const args = spawned.args!;
    expect(args).toContain('-p');
    expect(args[args.indexOf('--input-format') + 1]).toBe('stream-json');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--no-session-persistence');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('user');
    expect(JSON.parse(args[args.indexOf('--settings') + 1])).toMatchObject({ disableAllHooks: true, env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } });
    expect(args[args.indexOf('--effort') + 1]).toBe('low');
    expect(spawned.mds).toBe('1');
    expect(spawned.system!.startsWith('You are the interviewer.\n\nYou are not working in a coding environment')).toBe(true);
    expect(spawned.cwd).toContain('think-aloud-');
    expect(turn.content).toContain('<turn role="assistant">\nYes, it can.\n</turn>');
    expect(turn.content!.indexOf('Can the list be empty?')).toBeLessThan(turn.content!.indexOf('Then I return an empty list.'));
  });

  it('keeps a conversation in one running process, and starts diverging ones warm', async () => {
    const system = 'You are the interviewer in a reuse test.';
    const first = await chat([{ role: 'user', text: 'Hi.' }], system);
    const t1 = await lastTurn();

    // Same conversation plus a new user message: only the new message is sent.
    const second = await chat([{ role: 'user', text: 'Hi.' }, { role: 'assistant', text: first.text }, { role: 'user', text: 'Can values repeat?' }], system);
    const t2 = await lastTurn();
    expect(t2.pid).toBe(t1.pid);
    expect(t2.content).toBe('Can values repeat?');
    expect(second.text).toBe('Reply 2');

    // The app dropped a reply, so the conversation no longer matches: a
    // spare started earlier takes the whole conversation.
    await new Promise((r) => setTimeout(r, 300));
    const before = Date.now();
    await chat([{ role: 'user', text: 'Hi.' }, { role: 'assistant', text: first.text }, { role: 'user', text: 'Actually, are values sorted?' }], system);
    const t3 = await lastTurn();
    expect(t3.pid).not.toBe(t1.pid);
    expect((await spawnOf(t3.pid)).t).toBeLessThan(before);
    expect(t3.content).toContain('Actually, are values sorted?');
    expect(t3.turn).toBe(1);
  });

  it('answers when the reply ends, without waiting for Claude Code to wrap up', async () => {
    const started = Date.now();
    const res = await chat([{ role: 'user', text: 'SLOW SUMMARY please' }], 'Settle test.');
    expect(Date.now() - started).toBeLessThan(1200);
    expect(res.usage.outputTokens).toBe(7);
    const pid = (await lastTurn()).pid;
    expect((await readLog()).some((l) => l.event === 'result' && l.pid === pid)).toBe(false);

    // While it wraps up, the process is busy, so the next turn goes elsewhere;
    // once it's done, the conversation continues in it again.
    await new Promise((r) => setTimeout(r, 1700));
    await chat([{ role: 'user', text: 'SLOW SUMMARY please' }, { role: 'assistant', text: res.text }, { role: 'user', text: 'Next.' }], 'Settle test.');
    expect((await lastTurn()).pid).toBe(pid);
  });

  it('closes the process when the app abandons a reply', async () => {
    const ctrl = new AbortController();
    const pending = chat([{ role: 'user', text: 'GO SLOW please' }], 'Abort test.', ctrl.signal).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 500));
    const pid = (await lastTurn()).pid;
    ctrl.abort();
    expect(await pending).toBeInstanceOf(ProviderError);
    await new Promise((r) => setTimeout(r, 500));
    expect((await readLog()).some((l) => l.event === 'exit' && l.pid === pid)).toBe(true);
  });

  it('returns validated JSON for structured calls', async () => {
    const p = new CompatibleProvider(base, TOKEN, undefined, 'claude-code');
    const res = await p.json({ model: 'opus', system: [{ text: 'Score it.' }], turns: [{ role: 'user', text: 'Go' }], maxTokens: 50, schema: z.object({ ok: z.boolean() }), schemaName: 'check' });
    expect(res.data).toEqual({ ok: true });
    const turn = await lastTurn();
    expect((await spawnOf(turn.pid)).system).toContain('JSON Schema');
    expect(turn.content).toBe('Go');
  });

  it('checks the token', async () => {
    await expect(new CompatibleProvider(base, 'wrong', undefined, 'claude-code').checkKey()).rejects.toMatchObject({ kind: 'invalid-key' });
    await expect(new CompatibleProvider(base, TOKEN, undefined, 'claude-code').checkKey()).resolves.toBeUndefined();
  });

  it('reports a signed-out CLI without discarding the token', async () => {
    const p = new CompatibleProvider(base, TOKEN, undefined, 'claude-code');
    const err = await p.chat({ model: 'haiku', system: [{ text: 's' }], turns: [{ role: 'user', text: 'PLEASE FAIL' }], maxTokens: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).not.toBe('invalid-key');
    expect((err as ProviderError).message).toContain('/login');
  });

  it('refuses other sites, other host names and odd model names', async () => {
    const auth = { Authorization: `Bearer ${TOKEN}` };
    expect((await raw('/v1/models', { ...auth, Origin: 'https://evil.example' })).status).toBe(403);
    const ok = await raw('/v1/models', { ...auth, Origin: 'https://allowed.example' });
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe('https://allowed.example');
    expect((await raw('/v1/models', { ...auth, Host: `evil.example:${port}` })).status).toBe(421);
    const pre = await raw('/v1/chat/completions', { Origin: 'http://localhost:5173', 'Access-Control-Request-Private-Network': 'true' }, 'OPTIONS');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-private-network']).toBe('true');

    const p = new CompatibleProvider(base, TOKEN, undefined, 'claude-code');
    await expect(p.chat({ model: '--dangerously-skip-permissions', system: [], turns: [{ role: 'user', text: 'x' }], maxTokens: 5 })).rejects.toMatchObject({ kind: 'bad-request' });
  });
});
