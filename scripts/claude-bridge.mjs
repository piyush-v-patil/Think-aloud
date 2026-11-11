#!/usr/bin/env node
/**
 * Think Aloud ⇄ Claude Code bridge.
 *
 * A small server on this computer that lets the Think Aloud web page use the
 * Claude Code CLI you have installed and signed in to, instead of an API key.
 * It speaks the OpenAI Chat Completions format, so the app talks to it like
 * any other OpenAI-compatible endpoint.
 *
 *   npm run claude-bridge                 # http://localhost:8787/v1
 *   npm run claude-bridge -- --port 9000
 *   npm run claude-bridge -- --origin https://example.github.io
 *   npm run claude-bridge -- --new-token  # replace the saved token
 *
 * Meant for your own use, with your own Claude account. Usage counts against
 * your Claude plan's limits (or your API key, if Claude Code is set up with one).
 *
 * Safety:
 * - Listens on 127.0.0.1 only, and rejects requests whose Host header isn't
 *   localhost (protects against DNS rebinding).
 * - Every request needs the bridge token. Web pages from sites not on the
 *   allowed list are refused, so other sites you visit can't use it.
 * - Each conversation runs in a long-lived `claude -p` process, so later
 *   turns skip Claude Code's start-up; a warm spare is kept for each ongoing
 *   conversation.
 * - Each process runs with no tools, no MCP servers, no hooks, no
 *   slash commands, no CLAUDE.md files and no saved session, in an empty
 *   temporary folder, with no shell.
 * - Prompts and replies are never logged.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export const MODELS = ['haiku', 'sonnet', 'opus', 'fable'];
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CONCURRENT = 4;
const CALL_TIMEOUT_MS = 10 * 60 * 1000;
const EFFORTS = new Set(['low', 'medium', 'high']);
/** A Claude Code process with nothing to do is closed after this long. */
const IDLE_MS = 10 * 60 * 1000;
/** Running plus warm spare processes. Each one uses some memory. */
const MAX_PROCESSES = 8;
const CLI_SETTINGS = JSON.stringify({ disableAllHooks: true, outputStyle: 'default', env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } });

function parseArgs(argv) {
  const out = { origins: [], newToken: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = argv[++i];
    else if (a === '--origin') out.origins.push(argv[++i]);
    else if (a === '--new-token') out.newToken = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

/** The GitHub Pages site for this repository, read from src/config/app.ts. */
function pagesOrigin() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '..', 'src', 'config', 'app.ts'), 'utf8');
    const m = src.match(/REPO_URL\s*=\s*'https:\/\/github\.com\/([^/']+)\//);
    return m ? `https://${m[1].toLowerCase()}.github.io` : null;
  } catch {
    return null;
  }
}

async function loadToken(regenerate) {
  if (process.env.THINK_ALOUD_BRIDGE_TOKEN) return process.env.THINK_ALOUD_BRIDGE_TOKEN;
  const dir = join(homedir(), '.config', 'think-aloud');
  const file = join(dir, 'bridge-token');
  if (!regenerate) {
    try {
      const saved = (await readFile(file, 'utf8')).trim();
      if (saved.length >= 32) return saved;
    } catch {
      // first run
    }
  }
  const token = `tab-${randomBytes(24).toString('base64url')}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});
  return token;
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
  return '';
}

/**
 * Splits Chat Completions messages into a system prompt and the
 * conversation, and adds the JSON instruction for structured calls.
 */
export function buildPrompt(messages, responseFormat) {
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const convo = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, text: textOf(m.content) }));
  let extra = '';
  if (responseFormat?.type === 'json_schema' && responseFormat.json_schema?.schema) {
    extra = `\n\nReply with only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(responseFormat.json_schema.schema)}`;
  } else if (responseFormat?.type === 'json_object') {
    extra = '\n\nReply with only a JSON object, with no other text.';
  }
  // Claude Code tells the model about its (empty, temporary) working folder.
  // That has nothing to do with the conversation, so say so.
  const context = '\n\nYou are not working in a coding environment here. Ignore any information about a working directory, files, git or tools.';
  return { system: (system || 'You are a helpful assistant.') + context + extra, convo, prompt: firstMessage(convo) };
}

/** The first message for a new Claude Code process: the question, or the whole conversation written out in order. */
export function firstMessage(convo) {
  if (convo.length === 1 && convo[0].role === 'user') return convo[0].text;
  const turns = convo.map((m) => `<turn role="${m.role}">\n${m.text}\n</turn>`).join('\n\n');
  return (
    'Here is the conversation so far, oldest first. Turns with role "assistant" are yours.\n\n' +
    `${turns}\n\n` +
    'Write only your next assistant turn. No role label and no turn tags.'
  );
}

/**
 * True when `convo` is `history` plus one or more new user messages, so a
 * process that already holds `history` can simply be sent the new ones.
 */
export function continues(history, convo) {
  if (convo.length <= history.length) return false;
  const same = (a, b) => a.role === b.role && a.text.trim() === b.text.trim();
  return history.every((m, i) => same(m, convo[i])) && convo.slice(history.length).every((m) => m.role === 'user');
}

/**
 * One long-running `claude -p` process that takes messages on stdin
 * (stream-json), so later turns of the same conversation skip start-up.
 * `history` is the conversation it holds, or null for a warm spare that
 * hasn't been sent anything yet.
 */
class LiveProcess {
  constructor(spec, claudeBin, onGone) {
    this.spec = spec;
    this.key = spec.key;
    this.history = null;
    this.busy = false;
    this.dead = false;
    this.model = spec.model;
    this.lastUsed = Date.now();
    this.stderr = '';
    this.listener = null;
    this.finishTurn = null;
    this.onGone = onGone;
    this.ready = this.start(claudeBin);
  }

  async start(claudeBin) {
    const dir = await mkdtemp(join(tmpdir(), 'think-aloud-'));
    this.dir = dir;
    const systemFile = join(dir, 'system-prompt.md');
    await writeFile(systemFile, this.spec.system);
    if (this.dead) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      return;
    }
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', this.spec.model,
      '--system-prompt-file', systemFile,
      '--tools', '',
      '--strict-mcp-config',
      // Keep the user's sign-in and routing, but not their hooks, output style
      // or memory files (settings env can override inherited env, so pin it).
      '--setting-sources', 'user',
      '--settings', CLI_SETTINGS,
      '--disable-slash-commands',
      '--no-session-persistence',
    ];
    if (this.spec.effort) args.push('--effort', this.spec.effort);
    try {
      this.child = spawn(claudeBin, args, {
        cwd: dir,
        env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      this.spawnError = err;
      this.end();
      return;
    }
    this.child.on('error', (err) => {
      this.spawnError = err;
      this.end();
    });
    this.child.on('close', () => this.end());
    this.child.stdin.on('error', () => {});
    this.child.stderr.on('data', (d) => {
      if (this.stderr.length < 4000) this.stderr += d;
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.model === 'string') this.model = ev.model;
      this.listener?.(ev);
    });
    this.touch();
  }

  touch() {
    this.lastUsed = Date.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.end(), IDLE_MS);
    this.idleTimer.unref?.();
  }

  /**
   * Sends one user message. Resolves as soon as the reply message ends
   * (`answered`, with its usage), or with the final `result`, or an `error`.
   * After the reply, Claude Code may still do its own follow-up work (such
   * as a turn summary) before its result; the process stays busy until then,
   * but nobody has to wait for it.
   */
  async turn(content, onDelta) {
    this.busy = true;
    await this.ready;
    if (this.dead) return { error: this.spawnError ? 'spawn' : 'exited' };
    clearTimeout(this.idleTimer);
    return new Promise((resolve) => {
      let answered = false;
      let usage = null;
      let stopReason = null;
      const answer = (outcome) => {
        if (answered) return;
        answered = true;
        resolve(outcome);
      };
      const timer = setTimeout(() => this.end(), CALL_TIMEOUT_MS);
      this.finishTurn = (outcome) => {
        clearTimeout(timer);
        this.listener = null;
        this.finishTurn = null;
        this.busy = false;
        if (!this.dead) this.touch();
        answer(outcome);
      };
      this.listener = (ev) => {
        if (ev.type === 'result') {
          this.finishTurn?.({ result: ev });
          return;
        }
        if (ev.type !== 'stream_event') return;
        const e = ev.event ?? {};
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') onDelta(e.delta.text);
        else if (e.type === 'message_start') {
          usage = e.message?.usage ?? null;
          if (typeof e.message?.model === 'string') this.model = e.message.model;
        } else if (e.type === 'message_delta') {
          usage = { ...usage, ...e.usage };
          stopReason = e.delta?.stop_reason ?? null;
        } else if (e.type === 'message_stop' && stopReason !== 'tool_use' && stopReason !== 'pause_turn') {
          answer({ answered: { usage: usage ?? {} } });
        }
      };
      this.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`);
    });
  }

  /** Stops the process and forgets it. Safe to call more than once. */
  end() {
    if (this.dead) return;
    this.dead = true;
    clearTimeout(this.idleTimer);
    this.finishTurn?.({ error: this.spawnError ? 'spawn' : 'exited' });
    if (this.child && this.child.exitCode === null) this.child.kill();
    if (this.dir) void rm(this.dir, { recursive: true, force: true }).catch(() => {});
    this.onGone(this);
  }
}

/** Maps a failed CLI result to an HTTP status the app understands. */
export function statusForCliError(message) {
  const m = String(message).toLowerCase();
  if (/usage limit|rate limit|too many requests|limit reached/.test(m)) return 429;
  if (/overloaded/.test(m)) return 529;
  // Not 401/403: the app treats those as a wrong bridge token and forgets it.
  if (/\/login|not logged in|log in|authentication|oauth|invalid api key|credential/.test(m)) return 502;
  if (/model/.test(m) && /not found|invalid|unknown|not available/.test(m)) return 404;
  return 502;
}

export function createBridge({ port, token, origins, claudeBin, log = console.log }) {
  let active = 0;
  let versionCache = { at: 0, version: null };
  let listeningPort = port;

  async function claudeVersion() {
    if (Date.now() - versionCache.at < 30_000 && versionCache.version) return versionCache.version;
    const version = await new Promise((resolve) => {
      let out = '';
      let child;
      try {
        child = spawn(claudeBin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      } catch {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => child.kill(), 10_000);
      child.stdout.on('data', (d) => (out += d));
      child.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? out.trim().split('\n')[0] : null);
      });
    });
    versionCache = { at: Date.now(), version };
    return version;
  }

  function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }
  const fail = (res, status, message, headers) => sendJson(res, status, { error: { message, type: 'bridge_error' } }, headers);

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  const pool = new Set();

  function launch(spec) {
    const p = new LiveProcess(spec, claudeBin, (gone) => pool.delete(gone));
    pool.add(p);
    // Over the limit: close the processes idle the longest, spares and all.
    const idle = [...pool].filter((x) => !x.busy && x !== p).sort((a, b) => a.lastUsed - b.lastUsed);
    while (pool.size > MAX_PROCESSES && idle.length) idle.shift().end();
    return p;
  }

  /** Keeps one started, unused process for this prompt, so a conversation that can't continue a running one still starts warm. */
  function keepSpare(spec) {
    if (![...pool].some((p) => p.key === spec.key && p.history === null && !p.dead)) launch(spec);
  }

  async function complete(req, res, body) {
    const model = String(body.model ?? '');
    if (!/^[a-z][a-z0-9.-]*(\[1m\])?$/i.test(model)) return fail(res, 400, 'Unknown model name.');
    if (!Array.isArray(body.messages) || body.messages.length === 0) return fail(res, 400, 'No messages.');
    if (active >= MAX_CONCURRENT) return fail(res, 429, 'The bridge is busy with other requests.', { 'Retry-After': '2' });

    const { system, convo } = buildPrompt(body.messages, body.response_format);
    if (convo.length === 0 || convo[convo.length - 1].role !== 'user') return fail(res, 400, 'The last message must be from the user.');
    const effort = EFFORTS.has(body.reasoning_effort) ? body.reasoning_effort : null;
    const spec = { model, effort, system, key: createHash('sha256').update(JSON.stringify([model, effort, system])).digest('hex') };

    // Continue a running conversation if one matches; else take the warm
    // spare for this prompt; else start a new process.
    const free = [...pool].filter((p) => p.key === spec.key && !p.busy && !p.dead);
    let proc = free.find((p) => p.history && continues(p.history, convo));
    let content;
    let how;
    if (proc) {
      content = convo.slice(proc.history.length).map((m) => m.text).join('\n\n');
      how = 'continued';
    } else {
      proc = free.find((p) => p.history === null);
      how = proc ? 'warm' : 'cold';
      proc ??= launch(spec);
      content = firstMessage(convo);
    }
    proc.busy = true;

    active++;
    const started = Date.now();
    const id = `chatcmpl-${randomBytes(8).toString('hex')}`;
    const stream = body.stream === true;
    let streaming = false;
    let text = '';
    let done = false;

    res.on('close', () => {
      // The app gave up on this reply (the candidate kept talking). The
      // process is mid-turn and its conversation no longer matches; close it.
      if (!done) proc.end();
    });

    const chunk = (payload) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: proc.model, ...payload })}\n\n`);
    const startStream = () => {
      if (streaming) return;
      streaming = true;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    };
    let firstAt = 0;
    const emit = (delta) => {
      if (!delta) return;
      firstAt ||= Date.now();
      text += delta;
      if (stream) {
        startStream();
        chunk({ choices: [{ index: 0, delta: { content: delta } }] });
      }
    };

    let outcome;
    try {
      outcome = await proc.turn(content, emit);
    } finally {
      active--;
    }
    if (res.destroyed || res.writableEnded) {
      done = true;
      return;
    }
    done = true;

    if (outcome.error) {
      proc.end();
      if (outcome.error === 'spawn') return fail(res, 503, notInstalledMessage(claudeBin));
      const message = proc.stderr.trim().split('\n').slice(-3).join(' ') || 'Claude Code stopped unexpectedly.';
      log(`${new Date().toISOString()} ${model} stopped after ${Date.now() - started} ms`);
      if (streaming) return res.end();
      return fail(res, statusForCliError(message), `Claude Code: ${message.slice(0, 300)}`);
    }

    let u;
    if (outcome.result) {
      const result = outcome.result;
      if (result.is_error || result.subtype !== 'success') {
        proc.end();
        const message = (typeof result.result === 'string' && result.result) || 'Claude Code could not answer.';
        log(`${new Date().toISOString()} ${model} failed after ${Date.now() - started} ms`);
        if (streaming) return res.end();
        return fail(res, statusForCliError(message), `Claude Code: ${message.slice(0, 300)}`);
      }
      // Partial messages may be missing (older CLI): fall back to the final text.
      if (!text && typeof result.result === 'string') emit(result.result);
      u = result.usage ?? {};
    } else {
      u = outcome.answered.usage;
    }
    proc.history = [...convo, { role: 'assistant', text }];
    // A spare only pays off for conversations that keep going (the
    // interviewer, live feedback), not one-off calls like scoring.
    if (convo.length > 1) keepSpare(spec);

    const cached = u.cache_read_input_tokens ?? 0;
    const usage = {
      prompt_tokens: (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0),
      completion_tokens: u.output_tokens ?? 0,
      prompt_tokens_details: { cached_tokens: cached },
    };
    log(`${new Date().toISOString()} ${proc.model} ${how}: first text after ${firstAt - started} ms, done after ${Date.now() - started} ms, ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);

    if (stream) {
      startStream();
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      chunk({ choices: [], usage });
      res.end('data: [DONE]\n\n');
    } else {
      sendJson(res, 200, {
        id,
        object: 'chat.completion',
        model: proc.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage,
      });
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host ?? '').toLowerCase();
      if (host !== `localhost:${listeningPort}` && host !== `127.0.0.1:${listeningPort}`) return fail(res, 421, 'Use http://localhost to reach the bridge.');

      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) return fail(res, 403, `This site (${origin}) isn't allowed to use the bridge. Start it with --origin ${origin} if you trust it.`);
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
        if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      const auth = String(req.headers.authorization ?? '');
      const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!given || !sameSecret(given, token)) return fail(res, 401, 'Wrong or missing bridge token. Copy it from the terminal running the bridge.');

      const path = (req.url ?? '').split('?')[0];
      if (req.method === 'GET' && path === '/v1/models') {
        const version = await claudeVersion();
        if (!version) return fail(res, 503, notInstalledMessage(claudeBin));
        return sendJson(res, 200, { object: 'list', data: MODELS.map((m) => ({ id: m, object: 'model', owned_by: 'claude-code' })), claude_code_version: version });
      }
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (err) {
          return fail(res, err?.status ?? 400, err?.status === 413 ? 'Request too large.' : 'Request body is not JSON.');
        }
        return await complete(req, res, body);
      }
      return fail(res, 404, 'Not found.');
    } catch (err) {
      log(`${new Date().toISOString()} bridge error: ${err?.message ?? err}`);
      if (!res.headersSent) fail(res, 500, 'The bridge hit an error.');
      else res.end();
    }
  });

  return {
    server,
    claudeVersion,
    /** How many Claude Code processes are running (busy or idle). */
    processCount: () => pool.size,
    close: () => {
      for (const p of [...pool]) p.end();
      server.close();
    },
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          listeningPort = server.address().port;
          resolve(listeningPort);
        });
      }),
  };
}

function notInstalledMessage(bin) {
  return `Couldn't run Claude Code ("${bin}"). Install it and sign in (https://code.claude.com/docs/en/setup), or set CLAUDE_BIN to its full path.`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: npm run claude-bridge -- [--port 8787] [--origin https://your.site] [--new-token]');
    return;
  }
  const port = Number(opts.port ?? process.env.THINK_ALOUD_BRIDGE_PORT ?? 8787);
  const origins = new Set(
    [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      pagesOrigin(),
      ...(process.env.THINK_ALOUD_ORIGINS ?? '').split(','),
      ...opts.origins,
    ]
      .map((o) => (o ?? '').trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
  const token = await loadToken(opts.newToken);
  const claudeBin = process.env.CLAUDE_BIN || (process.platform === 'win32' ? 'claude.exe' : 'claude');
  const bridge = createBridge({ port, token, origins, claudeBin });
  const actualPort = await bridge.listen();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      bridge.close();
      process.exit(0);
    });
  }
  const version = await bridge.claudeVersion();

  console.log('');
  console.log('Think Aloud ⇄ Claude Code bridge');
  console.log('');
  console.log(`  Address       http://localhost:${actualPort}/v1`);
  console.log(`  Bridge token  ${token}`);
  console.log(`  Claude Code   ${version ?? 'NOT FOUND. Install it and sign in, or set CLAUDE_BIN.'}`);
  console.log(`  Allowed sites ${[...origins].join(', ')}`);
  console.log('');
  console.log('In Think Aloud, open Settings → AI provider → Claude Code and paste the token.');
  console.log('Usage counts against your Claude plan. Keep this window open while you practice; Ctrl+C stops it.');
  console.log('');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err?.code === 'EADDRINUSE' ? 'That port is in use. Try --port 8788.' : err);
    process.exit(1);
  });
}
