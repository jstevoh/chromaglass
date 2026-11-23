#!/usr/bin/env node
// The Apple TV app's sign-in, Swift against the real Worker (tvos/, PLAN.md 12-tv-apple).
//
// `npm run tvswift` builds the app's core package (tvos/Package.swift) and runs its probe,
// `cgtv-probe`, against the licence Worker's own handler served on a local port. The Swift
// client and the JavaScript server are each checked elsewhere against their own idea of
// the other (`npm run tvcode` drives the Worker with JavaScript); this is the one place
// they meet, so a field renamed on one side, a millisecond read as a second, or a
// signature over the wrong bytes fails here before an Apple TV ever sees it.
//
// The Worker runs as `npm run tvcode` runs it: an in-memory KV, a generated Ed25519
// licence pair and a generated "Google" RS256 pair standing in for Firebase ID tokens.
// This script plays the phone and the clock:
//
//  - the first code the TV draws runs out (its record goes from KV, which is what ten
//    minutes do), so the probe sees the app draw a fresh code by itself;
//  - the second is claimed by a signed-in account holding Home and Pro keys, through the
//    Worker's own `/tv/claim`, as the phone page does.
//
// The probe prints one ` ok ` or `FAIL` line per promise (tvos/Sources/cgtv-probe/main.swift
// says what each reads). This script counts them, and fails if the probe ran fewer than it
// should, so a probe that stops early cannot pass on the lines it did print.
//
// Then the receiver: a stand-in for the Mac's relay (`/remote-ws`, draft PR #752's
// protocol, as the /tv page speaks it) plays one scripted show per connection, and the
// probe's receiver, with a stand-in peer connection, has to find its way through it:
//
//  1. hello, the show comes on, an offer; once the TV's answer and candidates are in, the
//     Mac's candidate (the stand-in peer then connects and draws a frame), then "full"
//     (a fourth TV), then the socket drops;
//  2. the TV reconnects by itself: hello, the show, an offer, and no picture ever, so the
//     TV's stuck timer must give up and start over;
//  3. the fresh hello is told the key is wrong, and the TV must not knock again.
//
// The relay records what the TV sent, and this script checks it, so the probe's own idea
// of what it sent is never the evidence.
//
// Swift and CryptoKit: on a Mac the package uses CryptoKit; on Linux (the Measure shards)
// it builds Apple's swift-crypto, the same API, so the check runs where Measure runs.

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import worker from '../server/license-worker.js';
import { signLicenseKey } from '../server/license-key.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = resolve(root, 'tvos');
// The probe's own count of checks, kept here so a probe cut short reads as a failure.
const PROBE_CHECKS = 22;

const lines = [];
const say = (ok, name, detail = '') => {
  lines.push(ok);
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

if (spawnSync('swift', ['--version'], { stdio: 'ignore' }).status !== 0) {
  // Not a skip: a machine without Swift cannot prove this, and saying so in red is the
  // only answer that does not read as a pass.
  say(false, 'Swift is installed (the Command Line Tools on a Mac, the runner image on Linux)');
  process.exit(1);
}

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key).value : null; }
  async put(key, value, opts) { this.values.set(key, { value: String(value), ttl: opts?.expirationTtl }); }
  async delete(key) { this.values.delete(key); }
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const googleRsa = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify'],
);
const googlePubJwk = { ...(await crypto.subtle.exportKey('jwk', googleRsa.publicKey)), kid: 'g1', alg: 'RS256', use: 'sig' };
async function idToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'RS256', typ: 'JWT', kid: 'g1' });
  const body = enc({
    iss: 'https://securetoken.google.com/chromaglass', aud: 'chromaglass', sub: `uid_${email}`,
    user_id: `uid_${email}`, email, email_verified: true, iat: now - 10, exp: now + 3600,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', googleRsa.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pubJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const env = {
  LICENSE_KV: new FakeKV(),
  WEBHOOK_SECRET: 'whsec_tvswift',
  LICENSE_PRIVATE_KEY: JSON.stringify(privJwk),
  LICENSE_PUBLIC_KEY: JSON.stringify(pubJwk),
  GOOGLE_JWKS: { keys: [googlePubJwk] },
  FIREBASE_PROJECT_ID: 'chromaglass',
};

const fan = 'fan@example.com';
for (const [id, tier, age] of [['k_home', 'home', 5000], ['k_pro', 'pro', 9000]]) {
  const issuedAt = Date.now() - age;
  const token = await signLicenseKey({ id, tier, email: fan, issuedAt }, privJwk);
  const record = { id, orderId: id, tier, email: fan, token, issuedAt, updatesUntil: issuedAt + 1e10, maxMachines: 2, revoked: false };
  const list = JSON.parse((await env.LICENSE_KV.get(`keys:${fan}`)) || '[]');
  list.push(record);
  await env.LICENSE_KV.put(`keys:${fan}`, JSON.stringify(list));
  await env.LICENSE_KV.put(`key:${id}`, JSON.stringify(record));
}

const call = (path, body, headers = {}) =>
  worker.fetch(new Request(`https://licence.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
    body: JSON.stringify(body),
  }), env);

const codes = [];
const claims = [];
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  let body = {};
  try { body = JSON.parse(text || '{}'); } catch { body = {}; }
  // The clock: the first code's ten minutes pass before the TV's first poll of it.
  if (req.url === '/tv/poll' && codes.length === 1 && body.userCode === codes[0]) {
    await env.LICENSE_KV.delete(`tvcode:${codes[0].replace('-', '')}`);
  }
  const answer = await worker.fetch(new Request(`https://licence.test${req.url}`, {
    method: req.method,
    headers: { 'Content-Type': req.headers['content-type'] || 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: req.method === 'POST' ? text : undefined,
  }), env);
  const out = await answer.text();
  if (req.url === '/tv/code' && answer.status === 200) {
    const code = JSON.parse(out).userCode;
    codes.push(code);
    // The phone: a signed-in account claims the second code the TV shows.
    if (codes.length === 2) {
      const r = await call('/tv/claim', { userCode: code }, { Authorization: `Bearer ${await idToken(fan)}` });
      claims.push({ status: r.status, data: await r.json() });
    }
  }
  res.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') || 'application/json' });
  res.end(out);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const RELAY_KEY = 'K3YTV';
const MAC_ICE = { candidate: 'candidate:1 1 udp 2122260223 10.0.0.2 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
const conns = [];
const relayHttp = http.createServer((_, res) => { res.writeHead(404); res.end(); });
const wss = new WebSocketServer({ server: relayHttp, path: '/remote-ws' });
wss.on('connection', (ws) => {
  const n = conns.length;
  const conn = { msgs: [] };
  conns.push(conn);
  const send = (m) => ws.send(JSON.stringify(m));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(String(raw)); } catch { return; }
    conn.msgs.push(m);
    if (m.type === 'hello') {
      if (n >= 2) { send({ type: 'denied', reason: 'key' }); setTimeout(() => ws.close(), 50); return; }
      send({ type: 'tv-show', here: true });
      send({ type: 'tv-signal', signal: { kind: 'offer', sdp: `offer-${n + 1}` } });
    }
    if (n === 0 && m.type === 'tv-signal' && m.signal?.kind === 'ice' && m.signal.candidate === null) {
      send({ type: 'tv-signal', signal: { kind: 'ice', candidate: MAC_ICE } });
      setTimeout(() => send({ type: 'tv-signal', signal: { kind: 'refused', reason: 'full' } }), 300);
      setTimeout(() => ws.close(), 600);
    }
  });
});
await new Promise((ok) => relayHttp.listen(0, '127.0.0.1', ok));
const tvAddress = `http://127.0.0.1:${relayHttp.address().port}/tv?key=${RELAY_KEY}`;

const built = spawnSync('swift', ['build', '--product', 'cgtv-probe'], { cwd: pkg, encoding: 'utf8' });
say(built.status === 0, 'the Apple TV core builds', built.status === 0 ? '' : (built.stderr || built.stdout).split('\n').filter((l) => /error/.test(l)).slice(0, 5).join(' | '));
if (built.status !== 0) { server.close(); relayHttp.close(); wss.close(); process.exit(1); }
const bin = spawnSync('swift', ['build', '--product', 'cgtv-probe', '--show-bin-path'], { cwd: pkg, encoding: 'utf8' }).stdout.trim();

const probe = spawn(resolve(bin, 'cgtv-probe'), [], {
  env: { ...process.env, CGTV_BASE: base, CGTV_KEY_X: pubJwk.x, CGTV_TV_ADDRESS: tvAddress },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let printed = '';
probe.stdout.on('data', (d) => { printed += d; process.stdout.write(d); });
const timer = setTimeout(() => probe.kill('SIGKILL'), 120_000);
const code = await new Promise((ok) => probe.on('close', ok));
clearTimeout(timer);
server.close();
for (const c of wss.clients) c.terminate();
wss.close();
relayHttp.close();

const okLines = printed.split('\n').filter((l) => l.startsWith(' ok ')).length;
const failLines = printed.split('\n').filter((l) => l.startsWith('FAIL')).length;
say(claims.length === 1 && claims[0].status === 200 && claims[0].data?.tier === 'pro',
  'the phone\'s claim of the second code was taken, for the account\'s Pro key', JSON.stringify(claims));
const hello = (c) => c?.msgs[0]?.type === 'hello' && c.msgs[0].role === 'tv' && c.msgs[0].key === RELAY_KEY;
const first = (conns[0]?.msgs ?? []).map((m) => (m.type === 'hello' ? 'hello' : `${m.signal?.kind}:${m.signal?.kind === 'answer' ? m.signal.sdp : m.signal?.candidate === null ? 'end' : m.signal?.candidate?.candidate?.split(' ')[0]}`));
say(JSON.stringify(first) === JSON.stringify(['hello', 'answer:answer-to:offer-1', 'ice:candidate:9', 'ice:end']) && hello(conns[0]),
  'the TV said hello with the show key, answered the offer, then sent its candidate and the end of them', JSON.stringify(first));
say(conns.length === 3 && conns.every(hello),
  'it came back after the drop and after a picture that never came, each time with a fresh hello, and never after a wrong key',
  `${conns.length} connections: ${JSON.stringify(conns.map((c) => c.msgs.map((m) => m.type)))}`);
say(code === 0 && failLines === 0 && okLines === PROBE_CHECKS,
  'the probe ran every one of its checks and all passed', `${okLines} ok, ${failLines} failed of ${PROBE_CHECKS}, exit ${code}`);

const failed = lines.filter((x) => !x).length;
console.log(`\n${lines.length - failed}/${lines.length} checks passed`);
process.exit(failed ? 1 : 0);
