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
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }
let prompt = '';
process.stdin.on('data', (d) => (prompt += d));
process.stdin.on('end', () => {
  const at = (flag) => args[args.indexOf(flag) + 1];
  const system = fs.readFileSync(at('--system-prompt-file'), 'utf8');
  fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify({ args, prompt, system, cwd: process.cwd(), mds: process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS }));
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  out({ type: 'system', subtype: 'init', model: 'claude-' + at('--model') + '-test', tools: [] });
  if (prompt.includes('PLEASE FAIL')) {
    out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' });
    return;
  }
  const reply = system.includes('JSON Schema') ? '{"ok":true}' : 'Hello there';
  for (const piece of reply.match(/.{1,5}/g)) {
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } } });
  }
  out({ type: 'result', subtype: 'success', is_error: false, result: reply,
    usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 } });
});
`;

let dir: string;
let bridge: ChildProcess;
let base: string;
let port: number;
const logFile = () => join(dir, 'log.json');

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bridge-test-'));
  const fake = join(dir, 'claude');
  await writeFile(fake, FAKE_CLAUDE);
  await chmod(fake, 0o755);
  bridge = spawn(process.execPath, ['scripts/claude-bridge.mjs', '--port', '0', '--origin', 'https://allowed.example'], {
    env: { ...process.env, THINK_ALOUD_BRIDGE_TOKEN: TOKEN, CLAUDE_BIN: fake, FAKE_LOG: join(dir, 'log.json') },
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
  bridge?.kill();
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
  it('streams a reply through the CLI with tools and memory files off', async () => {
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
    expect(res.text).toBe('Hello there');
    expect(seen.length).toBeGreaterThan(1);
    expect(res.model).toBe('claude-sonnet-test');
    expect(res.usage).toEqual({ inputTokens: 15, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 0 });

    const log = JSON.parse(await readFile(logFile(), 'utf8'));
    expect(log.args).toContain('-p');
    expect(log.args[log.args.indexOf('--tools') + 1]).toBe('');
    expect(log.args).toContain('--strict-mcp-config');
    expect(log.args).toContain('--no-session-persistence');
    expect(log.args[log.args.indexOf('--setting-sources') + 1]).toBe('user');
    expect(JSON.parse(log.args[log.args.indexOf('--settings') + 1])).toMatchObject({ disableAllHooks: true, env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } });
    expect(log.args[log.args.indexOf('--effort') + 1]).toBe('low');
    expect(log.mds).toBe('1');
    expect(log.system.startsWith('You are the interviewer.\n\nYou are not working in a coding environment')).toBe(true);
    expect(log.prompt).toContain('<turn role="assistant">\nYes, it can.\n</turn>');
    expect(log.prompt.indexOf('Can the list be empty?')).toBeLessThan(log.prompt.indexOf('Then I return an empty list.'));
    expect(log.cwd).toContain('think-aloud-');
  });

  it('returns validated JSON for structured calls', async () => {
    const p = new CompatibleProvider(base, TOKEN, undefined, 'claude-code');
    const res = await p.json({ model: 'opus', system: [{ text: 'Score it.' }], turns: [{ role: 'user', text: 'Go' }], maxTokens: 50, schema: z.object({ ok: z.boolean() }), schemaName: 'check' });
    expect(res.data).toEqual({ ok: true });
    const log = JSON.parse(await readFile(logFile(), 'utf8'));
    expect(log.system).toContain('JSON Schema');
    expect(log.prompt).toBe('Go');
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
