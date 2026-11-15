/**
 * The Mac's end of the owner's relay (PLAN 44h): `node mcp/chromaglass-mcp.js
 * tunnel`.
 *
 * claude.ai on the web and the phone reaches only an address on the public
 * internet, and the show runs on the owner's Mac behind whatever network it is
 * on. So the Mac dials out: this holds one WebSocket to the owner's Worker
 * (`mcp/tunnel-worker.js`), takes the MCP requests claude.ai sends it, and
 * answers each with the very `onRequest` that answers Claude Desktop over
 * stdio, so every tool, its guide, and the show server's guard behind it are
 * the local ones. Nothing on the Mac listens on the internet, and the Worker
 * can ask only what a local assistant could.
 *
 * The tunnel is open only while the show is: while ChromaGlass is running and
 * the owner's assistant switch is on (the show server admits the `assistant`
 * role only then, and closes it when the switch goes off). Every second or
 * three this looks: the show linked and no tunnel, it opens one; the show gone
 * or the switch off, it closes it, so the owner's one switch turns off the
 * internet with the rest. It is meant to run all the time, as a login item
 * (a LaunchAgent with KeepAlive), and costs nothing while the app is closed.
 *
 * The key. `tunnel key` makes 32 random bytes in `~/.chromaglass/tunnel/key`
 * (600, its folder 700), once, and prints its SHA-256, which is all the Worker
 * keeps (`TUNNEL_KEY_SHA256`). The key itself never leaves this Mac but in the
 * tunnel's own `Authorization` header over TLS; nothing prints or logs it. The
 * relay's address is `~/.chromaglass/tunnel/relay` (or `CHROMAGLASS_RELAY`),
 * https only, except the check's stand-in on 127.0.0.1. `tunnel status` and
 * `tunnel revoke` (every claude.ai sign-in ended at once) speak to the Worker
 * with the same key.
 *
 * The socket is the repo's `ws`, not Node's own WebSocket, because Node's
 * cannot send an `Authorization` header, and the key must not ride in the
 * address, where logs keep addresses.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = process.env.CHROMAGLASS_TUNNEL_DIR ?? join(homedir(), '.chromaglass', 'tunnel');
const KEY_FILE = join(DIR, 'key');
const RELAY_FILE = join(DIR, 'relay');
/** How often the show is looked at: often while it is up, so the switch going off closes the tunnel within a second or two. */
const LOOK_UP_MS = 1_000;
const LOOK_DOWN_MS = 3_000;
const PING_MS = 25_000;
const DEAD_MS = 75_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function relayOrigin() {
  const raw = (process.env.CHROMAGLASS_RELAY ?? (existsSync(RELAY_FILE) ? readFileSync(RELAY_FILE, 'utf8') : '')).trim();
  if (!raw) throw new Error(`no relay address: put the Worker's https address in ${RELAY_FILE}`);
  const u = new URL(raw);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === '127.0.0.1')) throw new Error('the relay must be an https address');
  return u.origin;
}

function readKey() {
  if (!existsSync(KEY_FILE)) throw new Error(`no tunnel key: run \`node mcp/chromaglass-mcp.js tunnel key\` first`);
  const k = readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{43,}$/.test(k)) throw new Error(`the tunnel key in ${KEY_FILE} is not one this made`);
  return k;
}

function makeKey() {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, `${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
  return readKey();
}

const hashOf = (k) => createHash('sha256').update(k).digest('hex');

async function admin(path, method) {
  const res = await fetch(`${relayOrigin()}${path}`, { method, headers: { authorization: `Bearer ${readKey()}` } });
  const body = await res.text();
  return `${res.status} ${body}`;
}

/** The show's own menu, as `onRequest` gives it, for the Worker to list while the Mac is away. */
function ask(onRequest, m) {
  return new Promise((resolve) => { void onRequest(m, resolve); });
}

async function run({ onRequest, link, linked, log }) {
  const base = relayOrigin();
  const key = readKey();
  const WS = (await import('ws')).default;
  const address = `${base.replace(/^http/, 'ws')}/tunnel`;
  let tunnel = null;
  let lastHeard = 0;
  let lastPing = 0;
  let retryAt = 0;
  let backoff = 2_000;
  let lastWhy = '';

  const open = () => new Promise((resolve) => {
    const ws = new WS(address, { headers: { authorization: `Bearer ${key}` }, maxPayload: 4 << 20, handshakeTimeout: 10_000 });
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    ws.on('open', async () => {
      tunnel = ws;
      lastHeard = lastPing = Date.now();
      log('the tunnel is open');
      try {
        const init = await ask(onRequest, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
        const tools = await ask(onRequest, { jsonrpc: '2.0', id: 0, method: 'tools/list' });
        ws.send(JSON.stringify({ t: 'menu', initialize: init?.result, tools: tools?.result }));
      } catch { /* the menu is a convenience */ }
      done();
    });
    ws.on('unexpected-response', (_req, res) => {
      log(`the relay refused the tunnel (${res.statusCode}${res.statusCode === 401 ? ': its TUNNEL_KEY_SHA256 is not this Mac\'s key' : ''})`);
      ws.terminate();
      done();
    });
    ws.on('message', (data, binary) => {
      lastHeard = Date.now();
      if (binary) return;
      const text = String(data);
      if (text === 'pong') return;
      let f;
      try { f = JSON.parse(text); } catch { return; }
      if (f?.t !== 'rpc' || typeof f.n !== 'string' || !f.m || typeof f.m !== 'object' || typeof f.m.method !== 'string') return;
      void onRequest(f.m, (out) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'rpc', n: f.n, m: out })); });
    });
    ws.on('close', () => { if (tunnel === ws) { tunnel = null; log('the tunnel closed'); } done(); });
    ws.on('error', () => {});
  });

  for (;;) {
    let up = linked();
    if (!up) {
      try { await link(); up = true; lastWhy = ''; } catch (e) {
        const why = String(e?.message ?? e);
        if (why !== lastWhy) log(`the show is not linked: ${why}`);
        lastWhy = why;
      }
    }
    if (!up && tunnel) {
      tunnel.close(1000, 'the show is closed, or its assistant switch is off');
      tunnel = null;
      log('the tunnel closed: the show is not linked');
    }
    if (up && !tunnel && Date.now() >= retryAt) {
      await open();
      if (tunnel) backoff = 2_000;
      else { retryAt = Date.now() + backoff; backoff = Math.min(backoff * 2, 60_000); }
    }
    if (tunnel) {
      const now = Date.now();
      if (now - lastHeard > DEAD_MS) { log('the relay went quiet: opening the tunnel again'); tunnel.terminate(); tunnel = null; }
      else if (now - lastPing > PING_MS) { lastPing = now; tunnel.send('ping'); }
    }
    await sleep(up ? LOOK_UP_MS : LOOK_DOWN_MS);
  }
}

export async function tunnelMain(args, hooks) {
  const [command] = args;
  if (command === 'key') {
    const key = makeKey();
    process.stdout.write(`The tunnel key is kept in ${KEY_FILE}, on this Mac only.\nIts SHA-256, which is all the relay keeps:\n${hashOf(key)}\nSet it on the relay with:\n  printf %s ${hashOf(key)} | npx wrangler secret put TUNNEL_KEY_SHA256 -c wrangler.tunnel.toml\n`);
    return;
  }
  if (command === 'status') { process.stdout.write(`${await admin('/admin/status', 'GET')}\n`); return; }
  if (command === 'revoke') { process.stdout.write(`${await admin('/admin/revoke', 'POST')}\n`); return; }
  if (command) throw new Error(`unknown tunnel command: ${command} (key, status, revoke, or none to run)`);
  await run(hooks);
}
