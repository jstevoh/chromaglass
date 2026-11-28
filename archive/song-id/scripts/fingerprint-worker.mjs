#!/usr/bin/env node
/**
 * The song-ID Worker, run in Node against an in-memory KV and a stand-in for the
 * fingerprint service (server/fingerprint-worker.js, PLAN 14o).
 *
 *   npm run fingerprint-worker
 *
 * The Worker spends the owner's AudD or ACRCloud account on every request it
 * passes on, and its address is in the public bundle (VITE_FINGERPRINT_PROXY_URL),
 * so anyone who reads the bundle can call it. What is checked is therefore mostly
 * what it refuses, and that a refusal never reaches the service:
 *
 *   1. a snippet from the site is identified, and its preflight is granted to
 *      the site by name, never to `*`;
 *   2. the show's other origins (the show server on the Wi-Fi, the Mac app's
 *      localhost) are served too;
 *   3. a page on another site, and a request with no Origin at all (a script),
 *      are refused before the service is asked;
 *   4. a body that says it is 3 MB, or does not say how big it is, is refused
 *      before `formData()` reads any of it;
 *   5. the 31st request from one address in an hour gets 429, and another
 *      address is still served; on IPv6 a whole /64 is one address, since one
 *      phone can take any of its 2^64 addresses;
 *   6. at the day's ceiling the Worker answers "busy" (503) rather than spend;
 *   7. a Worker deployed without its counter store refuses rather than run
 *      unmetered;
 *   8. and one whose store throws (out of writes for the day) answers "busy"
 *      with CORS on it, not a bare 500, and asks nothing.
 *
 * Each refusal is read twice: the status it answers, and that the service was
 * not called and the body not parsed. A status alone would pass on a Worker that
 * answered 429 after it had already paid for the lookup.
 *
 * Node 22 has Request, Response, FormData and Blob as globals, which is all the
 * Worker uses; the fakes below implement only the calls it makes.
 */

import * as mod from '../server/fingerprint-worker.js';

const worker = mod.default;
// The old Worker exports none of these; its numbers are the ones PLAN 14o asks for.
const RATE_PER_HOUR = mod.RATE_PER_HOUR ?? 30;
const DAILY_LIMIT = mod.DAILY_LIMIT ?? 1000;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Fakes ──

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key).value : null; }
  async put(key, value, opts) { this.values.set(key, { value: String(value), ttl: opts?.expirationTtl }); }
}

/** The fingerprint service, counted: every call is the owner's money. */
let serviceCalls = 0;
globalThis.fetch = async () => {
  serviceCalls++;
  return new Response(JSON.stringify({ status: 'success', result: { title: 'A Song', artist: 'A Band', timecode: '00:12' } }),
    { headers: { 'Content-Type': 'application/json' } });
};

/** Bodies `formData()` was called on: a refusal must come before the first. */
let parsed = 0;

const SITE = 'https://chromaglass.web.app';
const URL_ = 'https://chromaglass-fingerprint.example.workers.dev/';

/** A WAV-sized snippet, as the app's FormData sends it. */
function snippet(bytes = 64 * 1024) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'snippet.wav');
  return form;
}

/**
 * A POST as a browser sends it: Origin, CF-Connecting-IP from Cloudflare, and
 * Content-Length (a FormData body has a known length, so fetch always sends it).
 * `headers` overrides any of them; a null value removes the header.
 */
async function post({ origin = SITE, ip = '198.51.100.7', headers = {}, form = snippet() } = {}) {
  const sized = new Request(URL_, { method: 'POST', body: form });
  const body = await sized.arrayBuffer();
  const h = new Headers({ 'Content-Type': sized.headers.get('Content-Type'), 'Content-Length': String(body.byteLength) });
  if (origin) h.set('Origin', origin);
  if (ip) h.set('CF-Connecting-IP', ip);
  for (const [k, v] of Object.entries(headers)) { if (v === null) h.delete(k); else h.set(k, v); }
  const req = new Request(URL_, { method: 'POST', headers: h, body });
  const formData = req.formData.bind(req);
  req.formData = () => { parsed++; return formData(); };
  return req;
}

const fresh = () => ({ FINGERPRINT_LIMITS: new FakeKV(), AUDD_API_TOKEN: 'test-token' });

/** Run one request; report its status, and whether it reached the service or the parser. */
async function run(reqP, env) {
  const req = await reqP;
  const calls0 = serviceCalls, parsed0 = parsed;
  const res = await worker.fetch(req, env);
  let body = null;
  try { body = await res.json(); } catch { /* a preflight has none */ }
  return { status: res.status, headers: res.headers, body, spent: serviceCalls - calls0, read: parsed - parsed0 };
}

try {
  // ── 1. The site ──
  {
    const env = fresh();
    const r = await run(post(), env);
    check('a snippet from the site is identified', r.status === 200 && r.body?.match === true && r.body?.title === 'A Song' && r.spent === 1,
      `${r.status} ${JSON.stringify(r.body)}`);
    const pre = await worker.fetch(new Request(URL_, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } }), env);
    const acao = pre.headers.get('Access-Control-Allow-Origin');
    check('its preflight is granted to the site by name, not to every page', acao === SITE && /Origin/.test(pre.headers.get('Vary') ?? ''),
      `Allow-Origin ${acao}, Vary ${pre.headers.get('Vary')}`);
    const evil = await worker.fetch(new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'https://songs-for-free.example', 'Access-Control-Request-Method': 'POST' } }), env);
    check('and a preflight from another site is not granted', evil.headers.get('Access-Control-Allow-Origin') === null,
      `Allow-Origin ${evil.headers.get('Access-Control-Allow-Origin')}`);
  }

  // ── 2. The show's other origins ──
  {
    const env = fresh();
    const lan = await run(post({ origin: 'http://192.168.1.20:3000' }), env);
    check('the show server on the Wi-Fi is served', lan.status === 200 && lan.spent === 1, `${lan.status}`);
    const mac = await run(post({ origin: 'http://localhost:3000' }), env);
    check('and the Mac app on localhost', mac.status === 200 && mac.spent === 1, `${mac.status}`);
  }

  // ── 3. Strangers ──
  {
    const env = fresh();
    const other = await run(post({ origin: 'https://songs-for-free.example' }), env);
    check('a page on another site is refused before the service is asked', other.status === 403 && other.spent === 0 && other.read === 0,
      `${other.status}, service called ${other.spent}, body read ${other.read}`);
    const script = await run(post({ origin: null }), env);
    check('and so is a script that sends no Origin', script.status === 403 && script.spent === 0 && script.read === 0,
      `${script.status}, service called ${script.spent}, body read ${script.read}`);
    const lookalike = await run(post({ origin: 'https://chromaglass.web.app.example' }), env);
    check('and a site whose name only starts like the show\'s', lookalike.status === 403 && lookalike.spent === 0,
      `${lookalike.status}, service called ${lookalike.spent}`);
  }

  // ── 4. Size, before parsing ──
  {
    const env = fresh();
    const big = await run(post({ headers: { 'Content-Length': String(3 * 1024 * 1024) } }), env);
    check('a 3 MB body is refused before formData() reads it', big.status === 413 && big.read === 0 && big.spent === 0,
      `${big.status}, body read ${big.read}, service called ${big.spent}`);
    const unsized = await run(post({ headers: { 'Content-Length': null } }), env);
    check('and a body that does not say its size', unsized.status === 411 && unsized.read === 0 && unsized.spent === 0,
      `${unsized.status}, body read ${unsized.read}, service called ${unsized.spent}`);
    // A body over the cap that claims to be small: a Content-Length is the
    // sender's word, so the file's own size is still checked after parsing.
    const liar = await run(post({ form: snippet(2.5 * 1024 * 1024), headers: { 'Content-Length': '1000' } }), env);
    // Read, so past the length gate, and then refused for its size: a status
    // that is merely an error would pass on a body the parser threw on.
    check('and one that claims to be small is still measured', liar.status === 413 && liar.read === 1 && liar.spent === 0,
      `${liar.status}, body read ${liar.read}, service called ${liar.spent}`);
  }

  // ── 5. Per address ──
  {
    const env = fresh();
    let lastOk = true;
    for (let i = 0; i < RATE_PER_HOUR; i++) {
      const r = await run(post({ ip: '203.0.113.9' }), env);
      lastOk = lastOk && r.status === 200;
    }
    const over = await run(post({ ip: '203.0.113.9' }), env);
    check(`${RATE_PER_HOUR} an hour from one address are served and the next is refused`, lastOk && over.status === 429 && over.spent === 0,
      `${RATE_PER_HOUR} served: ${lastOk}; then ${over.status}, service called ${over.spent}`);
    const other = await run(post({ ip: '203.0.113.10' }), env);
    check('and another address is still served', other.status === 200, `${other.status}`);

    const six = fresh();
    for (let i = 0; i < RATE_PER_HOUR; i++) await run(post({ ip: `2001:db8:1:2::${(i + 1).toString(16)}` }), six);
    const sameNet = await run(post({ ip: '2001:db8:1:2:ffff:ffff:ffff:ffff' }), six);
    check('on IPv6 one /64 is one address', sameNet.status === 429 && sameNet.spent === 0, `${sameNet.status}`);
    const nextNet = await run(post({ ip: '2001:db8:1:3::1' }), six);
    check('and the next /64 is another', nextNet.status === 200, `${nextNet.status}`);
  }

  // ── 6. The day's ceiling ──
  {
    const env = fresh();
    const day = Math.floor(Date.now() / 86_400_000);
    await env.FINGERPRINT_LIMITS.put(`day:${day}`, String(DAILY_LIMIT));
    const busy = await run(post({ ip: '198.51.100.99' }), env);
    check(`at ${DAILY_LIMIT} a day the Worker says busy rather than spend`, busy.status === 503 && busy.body?.error === 'busy' && busy.spent === 0,
      `${busy.status} ${JSON.stringify(busy.body)}, service called ${busy.spent}`);
    const under = fresh();
    await under.FINGERPRINT_LIMITS.put(`day:${day}`, String(DAILY_LIMIT - 1));
    const last = await run(post({ ip: '198.51.100.99' }), under);
    check('and one under it is served', last.status === 200 && last.spent === 1, `${last.status}`);
  }

  // ── 7. No counter store ──
  {
    const r = await run(post(), { AUDD_API_TOKEN: 'test-token' });
    check('a Worker deployed without its counter store refuses rather than run unmetered', r.status === 503 && r.spent === 0,
      `${r.status} ${JSON.stringify(r.body)}, service called ${r.spent}`);
  }

  // ── 8. A counter store that throws ──
  // KV throws past the plan's writes for the day and on a second write to a
  // key inside a second. That must be a refusal the page can read (CORS on
  // it), not a 500 without, and never a lookup.
  {
    const env = fresh();
    env.FINGERPRINT_LIMITS.put = async () => { throw new Error('KV PUT failed: 429 Too Many Requests'); };
    const r = await run(post(), env);
    check('a counter store that refuses a write is a "busy" the page can read, not a lookup',
      r.status === 503 && r.body?.error === 'busy' && r.headers.get('Access-Control-Allow-Origin') === SITE && r.spent === 0,
      `${r.status} ${JSON.stringify(r.body)}, Allow-Origin ${r.headers.get('Access-Control-Allow-Origin')}, service called ${r.spent}`);
  }

  // ── 9. Licence keys (PLAN 23.3) ──
  {
    const { signLicenseKey } = await import('../server/license-key.js');
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const goodKey = await signLicenseKey({ id: 'key_songid_1', tier: 'home', email: 'dj@example.com' }, privJwk);
    const badKey = goodKey.slice(0, -4) + (goodKey.endsWith('AAAA') ? 'BBBB' : 'AAAA');

    const keyFresh = () => ({ ...fresh(), LICENSE_PUBLIC_KEY: pubJwk });
    const gatedEnv = { ...keyFresh(), REQUIRE_LICENSE_KEY: '1' };
    const noKey = await run(post(), gatedEnv);
    check('with REQUIRE_LICENSE_KEY set, a request with no key is refused before the service is asked',
      noKey.status === 401 && noKey.spent === 0 && noKey.read === 0,
      `${noKey.status}, service called ${noKey.spent}, body read ${noKey.read}`);

    const badSig = await run(post({ headers: { 'X-ChromaGlass-Key': badKey } }), keyFresh());
    check('a key with a bad signature is refused before the service is asked',
      badSig.status === 401 && badSig.spent === 0 && badSig.read === 0,
      `${badSig.status}, service called ${badSig.spent}, body read ${badSig.read}`);

    const goodAns = await run(post({ headers: { 'X-ChromaGlass-Key': goodKey } }), gatedEnv);
    check('a good signed key is answered',
      goodAns.status === 200 && goodAns.body?.match === true && goodAns.spent === 1,
      `${goodAns.status} ${JSON.stringify(goodAns.body)}`);

    // A good key raises the hourly count past RATE_PER_HOUR, but never skips DAILY_LIMIT.
    const hourEnv = keyFresh();
    const hourNow = Math.floor(Date.now() / 3_600_000);
    await hourEnv.FINGERPRINT_LIMITS.put(`rl:198.51.100.77:${hourNow}`, String(RATE_PER_HOUR));
    const withoutKeyAt30 = await run(post({ ip: '198.51.100.77' }), hourEnv);
    const withKeyAt30 = await run(post({ ip: '198.51.100.77', headers: { 'X-ChromaGlass-Key': goodKey } }), hourEnv);
    const dayNow = Math.floor(Date.now() / 86_400_000);
    await hourEnv.FINGERPRINT_LIMITS.put(`day:${dayNow}`, String(DAILY_LIMIT));
    const withKeyAtDayCap = await run(post({ ip: '198.51.100.77', headers: { 'X-ChromaGlass-Key': goodKey } }), hourEnv);
    check('a good key raises the hourly count past RATE_PER_HOUR, and still stops at DAILY_LIMIT',
      withoutKeyAt30.status === 429 && withKeyAt30.status === 200 && withKeyAtDayCap.status === 503 && withKeyAtDayCap.spent === 0,
      `no-key@${RATE_PER_HOUR}=${withoutKeyAt30.status}, key@${RATE_PER_HOUR}=${withKeyAt30.status}, key@dayCap=${withKeyAtDayCap.status}`);
  }
} catch (e) {
  check('the run finished', false, e.stack ?? e.message);
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
