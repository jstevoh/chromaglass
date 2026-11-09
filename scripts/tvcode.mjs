#!/usr/bin/env node
// The TV's sign-in by a short code (server/tv-code.js, PLAN.md 12-tv-signin, 12-tv-apple).
//
// `npm run tvcode` drives the licence Worker's `/tv/…` routes the way a TV and a phone
// would, against an in-memory KV, a generated Ed25519 licence pair and a generated
// "Google" RS256 pair for Firebase ID tokens, the same stand-ins `npm run license-worker`
// uses. What it asserts is the flow's promises, each read from what the TV or the phone
// actually receives, never from the module's own state:
//
//  - a code is eight letters from the twenty consonants, shown as XXXX-XXXX, and the
//    device code is never stored, only its hash;
//  - only a signed-in account with a live Home or Pro key can claim, Pro first, and a key
//    refunded since (`key:<id>` revoked) is passed over;
//  - nobody without the device code collects the claim, and a wrong device code reads
//    exactly like an expired one;
//  - the pass is handed out once, verifies under the licence public key, and is refused
//    by everything that takes a licence key (`/activate`, `verifyLicenseKey`), so a TV
//    never takes one of a key's two Mac seats;
//  - renewing checks the key is still live, and a forged, tampered or run-out pass fails;
//  - the per-address and per-account allowances bite.

import worker from '../server/license-worker.js';
import { signLicenseKey, verifyLicenseKey } from '../server/license-key.js';
import { TV_CODE_ALPHABET, normalizeTvCode, signTvPass, verifyTvPass } from '../server/tv-code.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

class FakeKV {
  constructor() {
    this.values = new Map();
  }
  async get(key) {
    return this.values.has(key) ? this.values.get(key).value : null;
  }
  async put(key, value, opts) {
    this.values.set(key, { value: String(value), ttl: opts?.expirationTtl });
  }
  async delete(key) {
    this.values.delete(key);
  }
}

function toBase64Url(bytes) {
  let bin = '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const rsa = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
const googleRsa = await rsa();
const attackerRsa = await rsa();
const googlePubJwk = { ...(await crypto.subtle.exportKey('jwk', googleRsa.publicKey)), kid: 'g1', alg: 'RS256', use: 'sig' };

async function idToken(email, privateKey = googleRsa.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'RS256', typ: 'JWT', kid: 'g1' });
  const body = enc({
    iss: 'https://securetoken.google.com/chromaglass',
    aud: 'chromaglass',
    sub: `uid_${email}`,
    user_id: `uid_${email}`,
    email,
    email_verified: true,
    iat: now - 10,
    exp: now + 3600,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${toBase64Url(sig)}`;
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pubJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
const otherPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const otherPrivJwk = await crypto.subtle.exportKey('jwk', otherPair.privateKey);

const makeEnv = () => ({
  LICENSE_KV: new FakeKV(),
  WEBHOOK_SECRET: 'whsec_tvcode',
  LICENSE_PRIVATE_KEY: JSON.stringify(privJwk),
  LICENSE_PUBLIC_KEY: JSON.stringify(pubJwk),
  GOOGLE_JWKS: { keys: [googlePubJwk] },
  FIREBASE_PROJECT_ID: 'chromaglass',
});

// Files a key the way the webhook does: on the email's list and under its own id.
async function fileKey(env, { id, tier, email, issuedAt = Date.now() }) {
  const token = await signLicenseKey({ id, tier, email, issuedAt }, privJwk);
  const record = { id, orderId: id, tier, email, token, issuedAt, updatesUntil: issuedAt + 1e10, maxMachines: 2, revoked: false };
  const raw = await env.LICENSE_KV.get(`keys:${email}`);
  const list = raw ? JSON.parse(raw) : [];
  list.push(record);
  await env.LICENSE_KV.put(`keys:${email}`, JSON.stringify(list));
  await env.LICENSE_KV.put(`key:${id}`, JSON.stringify(record));
  return record;
}

let ipCounter = 0;
async function call(env, path, { body, token, method = 'POST', ip } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || `198.51.100.${(ipCounter++ % 200) + 1}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await worker.fetch(
    new Request(`https://licence.test${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined }),
    env,
  );
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── 1. A code ────────────────────────────────────────────────────
const env = makeEnv();
const fan = 'fan@example.com';
await fileKey(env, { id: 'k_home', tier: 'home', email: fan, issuedAt: Date.now() - 5000 });
await fileKey(env, { id: 'k_pro', tier: 'pro', email: fan, issuedAt: Date.now() - 9000 });

const got = await call(env, '/tv/code');
const shown = got.data?.userCode || '';
check('a TV gets a code shown as XXXX-XXXX from the twenty consonants',
  got.status === 200 && new RegExp(`^[${TV_CODE_ALPHABET}]{4}-[${TV_CODE_ALPHABET}]{4}$`).test(shown), shown);
check('and a device code of 32 random bytes, with a ten-minute life and a 5 s poll',
  typeof got.data?.deviceCode === 'string' && got.data.deviceCode.length === 43 && got.data.expiresIn === 600 && got.data.interval === 5,
  `${got.data?.deviceCode?.length} chars, ${got.data?.expiresIn} s, every ${got.data?.interval} s`);
const filed = [...env.LICENSE_KV.values.entries()].find(([k]) => k.startsWith('tvcode:'));
check('the Worker keeps only the device code\'s hash, under the code, for ten minutes',
  filed && filed[0] === `tvcode:${shown.replace('-', '')}` && !filed[1].value.includes(got.data.deviceCode) && filed[1].ttl === 600,
  filed ? `${filed[0]}, ttl ${filed[1].ttl}` : 'nothing filed');
{
  // Two hundred codes: every letter one of the twenty, and every one of the twenty seen, so
  // the draw neither leaks a vowel nor sticks on part of the alphabet.
  const seen = new Set();
  let bad = 0;
  const e2 = makeEnv();
  for (let i = 0; i < 200; i++) {
    const c = (await call(e2, '/tv/code', { ip: `203.0.113.${i % 250}` })).data?.userCode || '';
    for (const ch of c.replace('-', '')) seen.add(ch);
    if (!normalizeTvCode(c)) bad++;
  }
  check('two hundred codes use only the twenty consonants, and all twenty', bad === 0 && seen.size === 20, `${bad} bad, ${seen.size} letters seen`);
}
check('a code typed on a phone in lower case with spaces still reads', normalizeTvCode(` ${shown.toLowerCase().replace('-', ' ')} `) === shown.replace('-', ''));
check('a code with a vowel or the wrong length does not', normalizeTvCode('BDKA-QXTZ') === null && normalizeTvCode('BDK-QXTZ') === null);

// ── 2. Before the phone ──────────────────────────────────────────
const tvBody = { userCode: shown, deviceCode: got.data.deviceCode };
const early = await call(env, '/tv/poll', { body: tvBody });
check('polling before anyone claims answers pending', early.data?.status === 'pending', JSON.stringify(early.data));

// ── 3. Who may claim ─────────────────────────────────────────────
const noAuth = await call(env, '/tv/claim', { body: { userCode: shown } });
check('a claim with no sign-in is refused', noAuth.status === 401, `${noAuth.status}`);
const forged = await call(env, '/tv/claim', { body: { userCode: shown }, token: await idToken(fan, attackerRsa.privateKey) });
check('a claim with a token Google did not sign is refused', forged.status === 401, `${forged.status}`);
const stranger = await call(env, '/tv/claim', { body: { userCode: shown }, token: await idToken('nolicence@example.com') });
check('a signed-in account with no Home or Pro key gets 403, asking for Home',
  stranger.status === 403 && stranger.data?.needs === 'home', `${stranger.status} ${JSON.stringify(stranger.data)}`);
check('and the code is still waiting afterwards', (await call(env, '/tv/poll', { body: tvBody })).data?.status === 'pending');
const typo = await call(env, '/tv/claim', { body: { userCode: 'BBBB-BBBB' }, token: await idToken(fan) });
check('a code nobody asked for is 404', typo.status === 404, `${typo.status}`);

const claimed = await call(env, '/tv/claim', { body: { userCode: shown.toLowerCase() }, token: await idToken(fan) });
check('the licence holder claims it, and their Pro key is chosen over their newer Home key',
  claimed.status === 200 && claimed.data?.tier === 'pro', `${claimed.status} ${JSON.stringify(claimed.data)}`);
check('the claim answer carries no pass and no key', claimed.data && !('pass' in claimed.data) && !JSON.stringify(claimed.data).includes('cg1.'));
const again = await call(env, '/tv/claim', { body: { userCode: shown }, token: await idToken(fan) });
check('a code already claimed cannot be claimed again (by anyone)', again.status === 404, `${again.status}`);

// ── 4. Collecting ────────────────────────────────────────────────
const wrong = await call(env, '/tv/poll', { body: { userCode: shown, deviceCode: toBase64Url(crypto.getRandomValues(new Uint8Array(32))) } });
const gone = await call(env, '/tv/poll', { body: { userCode: 'ZZZZ-ZZZZ', deviceCode: got.data.deviceCode } });
check('a wrong device code reads exactly like a code that has run out',
  wrong.status === gone.status && JSON.stringify(wrong.data) === JSON.stringify(gone.data) && wrong.data?.status === 'expired',
  `${JSON.stringify(wrong.data)} vs ${JSON.stringify(gone.data)}`);
const done = await call(env, '/tv/poll', { body: tvBody });
const pass = done.data?.pass;
check('the TV with the right device code collects a Pro pass (a wrong guess did not burn it)',
  done.data?.status === 'ok' && done.data?.tier === 'pro' && typeof pass === 'string' && pass.startsWith('cgtv1.'),
  `${done.data?.status} ${done.data?.tier}`);
const opened = await verifyTvPass(pass, pubJwk);
const days = opened ? (opened.exp - Date.now()) / 86400000 : 0;
check('the pass verifies under the licence public key, names the Pro key and lasts thirty days',
  opened?.keyId === 'k_pro' && opened?.tier === 'pro' && days > 29.9 && days <= 30, opened ? `${opened.keyId}, ${days.toFixed(2)} days` : 'did not verify');
check('the pass carries no email', opened && !JSON.stringify(opened).includes('@'));
const twice = await call(env, '/tv/poll', { body: tvBody });
check('the pass is handed out once: the same codes again read expired', twice.data?.status === 'expired', JSON.stringify(twice.data));

// ── 5. A pass is not a key ───────────────────────────────────────
const asKey = await verifyLicenseKey(pass, pubJwk);
check('verifyLicenseKey refuses the pass, so it opens no Mac app', asKey.valid === false, asKey.error);
const relabelled = await verifyLicenseKey(`cg1.${pass.split('.').slice(1).join('.')}`, pubJwk);
check('and refuses it relabelled cg1., since the signature covers the prefix', relabelled.valid === false, relabelled.error);
const seat = await call(env, '/activate', { body: { key: pass, machineId: 'tv-1' } });
check('and /activate refuses it, so a TV never takes one of the key\'s two seats', seat.status >= 400 && seat.status < 500 && !env.LICENSE_KV.values.has('machines:k_pro'), `${seat.status}`);
{
  // The other way round: a licence key's signing input (`cg1.`) is not a pass's.
  const key = await signLicenseKey({ id: 'k_x', tier: 'pro', email: fan }, privJwk);
  const swapped = `cgtv1.${key.split('.').slice(1).join('.')}`;
  check('a licence key relabelled as a pass does not verify', (await verifyTvPass(swapped, pubJwk)) === null);
}

// ── 6. Renewing ──────────────────────────────────────────────────
const renewed = await call(env, '/tv/renew', { body: { pass } });
const renewedOpen = await verifyTvPass(renewed.data?.pass, pubJwk);
check('a live pass renews for another thirty days', renewed.status === 200 && renewedOpen?.keyId === 'k_pro', `${renewed.status}`);
const tampered = pass.slice(0, pass.lastIndexOf('.') - 2) + (pass[pass.lastIndexOf('.') - 2] === 'A' ? 'B' : 'A') + pass.slice(pass.lastIndexOf('.') - 1);
check('a tampered pass does not renew', (await call(env, '/tv/renew', { body: { pass: tampered } })).status === 401);
const foreign = await signTvPass({ v: 1, keyId: 'k_pro', tier: 'pro', issuedAt: Date.now(), exp: Date.now() + 1e9 }, otherPrivJwk);
check('a pass signed by another key does not renew', (await call(env, '/tv/renew', { body: { pass: foreign } })).status === 401);
const old = await signTvPass({ v: 1, keyId: 'k_pro', tier: 'pro', issuedAt: Date.now() - 4e9, exp: Date.now() - 1000 }, privJwk);
check('a pass that has run out does not renew (the TV pairs again)', (await call(env, '/tv/renew', { body: { pass: old } })).status === 401);
{
  const rec = JSON.parse(await env.LICENSE_KV.get('key:k_pro'));
  await env.LICENSE_KV.put('key:k_pro', JSON.stringify({ ...rec, revoked: true }));
  const refunded = await call(env, '/tv/renew', { body: { pass } });
  check('once the key is refunded, its pass no longer renews', refunded.status === 401 && refunded.data?.error === 'key revoked', `${refunded.status}`);

  // And a fresh claim now passes over the refunded Pro key (revoked only under its id,
  // as a refund of an upgrade writes it) for the Home key.
  const c = (await call(env, '/tv/code')).data;
  const cl = await call(env, '/tv/claim', { body: { userCode: c.userCode }, token: await idToken(fan) });
  check('a claim after the refund passes over the refunded Pro key and hands out Home', cl.data?.tier === 'home', JSON.stringify(cl.data));
}

// ── 7. Allowances ────────────────────────────────────────────────
{
  const e = makeEnv();
  let firstRefused = 0;
  for (let i = 1; i <= 31; i++) {
    const r = await call(e, '/tv/code', { ip: '192.0.2.7' });
    if (r.status === 429 && !firstRefused) firstRefused = i;
  }
  check('one address gets thirty codes an hour, and the 31st is refused', firstRefused === 31, `first refusal at ${firstRefused}`);
}
{
  const e = makeEnv();
  const t = await idToken('guesser@example.com');
  let firstRefused = 0;
  for (let i = 1; i <= 21; i++) {
    const r = await call(e, '/tv/claim', { body: { userCode: 'BCDF-GHJK' }, token: t });
    if (r.status === 429 && !firstRefused) firstRefused = i;
  }
  check('an account gets twenty wrong codes an hour, and the 21st is refused', firstRefused === 21, `first refusal at ${firstRefused}`);
}
check('a GET is refused', (await call(env, '/tv/code', { method: 'GET' })).status === 405);
{
  const big = await worker.fetch(
    new Request('https://licence.test/tv/poll', { method: 'POST', body: JSON.stringify({ userCode: 'x'.repeat(5000) }) }),
    env,
  );
  check('an oversized body is refused', big.status === 413, `${big.status}`);
}

/* The phone's half (src/lib/tvCode.ts) reads the same codes. It is TypeScript
   for the page, so it is bundled for node here, its Firebase import left out
   (claimTvCode is not called). What could drift is the alphabet and the
   format: a phone that drops a letter the Worker draws, or keeps a dash in the
   claim, sends a code no TV is waiting on, and every link would fail as "no such
   code" with nothing in the logs to say why. */
{
  const { build } = await import('esbuild');
  const out = await build({
    entryPoints: [new URL('../src/lib/tvCode.ts', import.meta.url).pathname],
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    external: ['./firebaseAuth'],
  });
  const phone = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  check('the phone draws codes from the Worker\'s letters', phone.TV_CODE_ALPHABET === TV_CODE_ALPHABET);
  let agree = 0;
  const drawn = [];
  for (let i = 0; i < 40; i++) {
    const r = await call(env, '/tv/code', { body: {}, ip: `10.9.${i}.1` });
    if (r.status !== 200) continue;
    drawn.push(r.data.userCode);
    const typed = phone.formatTvCodeInput(r.data.userCode.toLowerCase().replace('-', ' '));
    if (typed === r.data.userCode && phone.normalizeTvCode(typed) === normalizeTvCode(r.data.userCode)) agree++;
  }
  check('every code the Worker shows, typed on the phone in lower case, formats back to itself and claims as the Worker reads it',
    drawn.length === 40 && agree === 40, `${agree}/${drawn.length}`);
  check('the phone drops what no code holds, and caps a code at eight letters',
    phone.formatTvCodeInput('b0d1-kaem qxtzz') === 'BDKM-QXTZ' && phone.normalizeTvCode('BDKM-QXT') === null
      && phone.normalizeTvCode('BDKA-QXTZ') === null);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
