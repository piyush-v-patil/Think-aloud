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
 * - Each call runs `claude -p` with no tools, no MCP servers, no hooks, no
 *   slash commands, no CLAUDE.md files and no saved session, in an empty
 *   temporary folder, with no shell.
 * - Prompts and replies are never logged.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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
 * Turns Chat Completions messages into a system prompt and one prompt for
 * `claude -p`. A conversation with earlier turns is written out in order.
 */
export function buildPrompt(messages, responseFormat) {
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const convo = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  let prompt;
  if (convo.length === 1 && convo[0].role === 'user') {
    prompt = textOf(convo[0].content);
  } else {
    const turns = convo.map((m) => `<turn role="${m.role}">\n${textOf(m.content)}\n</turn>`).join('\n\n');
    prompt =
      'Here is the conversation so far, oldest first. Turns with role "assistant" are yours.\n\n' +
      `${turns}\n\n` +
      'Write only your next assistant turn. No role label and no turn tags.';
  }
  let extra = '';
  if (responseFormat?.type === 'json_schema' && responseFormat.json_schema?.schema) {
    extra = `\n\nReply with only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(responseFormat.json_schema.schema)}`;
  } else if (responseFormat?.type === 'json_object') {
    extra = '\n\nReply with only a JSON object, with no other text.';
  }
  // Claude Code tells the model about its (empty, temporary) working folder.
  // That has nothing to do with the conversation, so say so.
  const context = '\n\nYou are not working in a coding environment here. Ignore any information about a working directory, files, git or tools.';
  return { system: (system || 'You are a helpful assistant.') + context + extra, prompt };
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

  async function complete(req, res, body) {
    const model = String(body.model ?? '');
    if (!/^[a-z][a-z0-9.-]*(\[1m\])?$/i.test(model)) return fail(res, 400, 'Unknown model name.');
    if (!Array.isArray(body.messages) || body.messages.length === 0) return fail(res, 400, 'No messages.');
    if (active >= MAX_CONCURRENT) return fail(res, 429, 'The bridge is busy with other requests.', { 'Retry-After': '2' });

    const { system, prompt } = buildPrompt(body.messages, body.response_format);
    const dir = await mkdtemp(join(tmpdir(), 'think-aloud-'));
    const systemFile = join(dir, 'system-prompt.md');
    await writeFile(systemFile, system);

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', model,
      '--system-prompt-file', systemFile,
      '--tools', '',
      '--strict-mcp-config',
      // Keep the user's sign-in and routing, but not their hooks, output style
      // or memory files (settings env can override inherited env, so pin it).
      '--setting-sources', 'user',
      '--settings', JSON.stringify({ disableAllHooks: true, outputStyle: 'default', env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' } }),
      '--disable-slash-commands',
      '--no-session-persistence',
    ];
    if (EFFORTS.has(body.reasoning_effort)) args.push('--effort', body.reasoning_effort);

    active++;
    const started = Date.now();
    const id = `chatcmpl-${randomBytes(8).toString('hex')}`;
    const stream = body.stream === true;
    let child;
    let finished = false;
    let streaming = false;
    let text = '';
    let answeredBy = model;
    let result = null;
    let stderr = '';

    const cleanup = async () => {
      if (finished) return;
      finished = true;
      active--;
      clearTimeout(timer);
      if (child && child.exitCode === null) child.kill();
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    };
    const timer = setTimeout(() => child?.kill(), CALL_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableFinished) void cleanup();
    });

    const chunk = (payload) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: answeredBy, ...payload })}\n\n`);
    const startStream = () => {
      if (streaming) return;
      streaming = true;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    };
    const emit = (delta) => {
      if (!delta) return;
      text += delta;
      if (stream) {
        startStream();
        chunk({ choices: [{ index: 0, delta: { content: delta } }] });
      }
    };

    try {
      child = spawn(claudeBin, args, {
        cwd: dir,
        env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      await cleanup();
      return fail(res, 503, notInstalledMessage(claudeBin));
    }
    const spawnError = new Promise((resolve) => child.on('error', resolve));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d;
    });

    const lines = createInterface({ input: child.stdout });
    const linesDone = new Promise((resolve) => lines.once('close', resolve));
    lines.on('line', (line) => {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.model === 'string') answeredBy = ev.model;
      else if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') emit(ev.event.delta.text);
      else if (ev.type === 'result') result = ev;
    });

    const exit = await Promise.race([
      new Promise((resolve) => child.on('close', (code) => resolve({ code }))),
      spawnError.then((err) => ({ error: err })),
    ]);
    await linesDone;

    if (finished) return; // the app went away
    if (exit.error) {
      await cleanup();
      return fail(res, 503, notInstalledMessage(claudeBin));
    }

    const failed = !result || result.is_error || result.subtype !== 'success';
    if (failed) {
      const message = (result && typeof result.result === 'string' && result.result) || stderr.trim().split('\n').slice(-3).join(' ') || `Claude Code exited with code ${exit.code}.`;
      log(`${new Date().toISOString()} ${model} failed after ${Date.now() - started} ms`);
      await cleanup();
      if (streaming) return res.end();
      return fail(res, statusForCliError(message), `Claude Code: ${message.slice(0, 300)}`);
    }

    // Partial messages may be missing (older CLI): fall back to the final text.
    if (!text && typeof result.result === 'string') emit(result.result);
    const u = result.usage ?? {};
    const cached = u.cache_read_input_tokens ?? 0;
    const usage = {
      prompt_tokens: (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0),
      completion_tokens: u.output_tokens ?? 0,
      prompt_tokens_details: { cached_tokens: cached },
    };
    log(`${new Date().toISOString()} ${answeredBy} ${Date.now() - started} ms, ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
    await cleanup();

    if (stream) {
      startStream();
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      chunk({ choices: [], usage });
      res.end('data: [DONE]\n\n');
    } else {
      sendJson(res, 200, {
        id,
        object: 'chat.completion',
        model: answeredBy,
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
