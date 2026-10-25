#!/usr/bin/env node
/**
 * The licence-key Worker, run in Node against in-memory KV and real RS256 /
 * Ed25519 keys (server/license-worker.js, PLAN.md 23.4 & 23.12).
 *
 *   npm run license-worker
 *
 * What PLAN 23.12 asks of it:
 *   1. a bad webhook signature, a missing signature, or an unconfigured webhook
 *      secret is refused (401) and stores nothing;
 *   2. a signed merchant webhook files an Ed25519-signed licence key under the
 *      buyer's email in Workers KV, verifiable offline against the public key;
 *   3. a bad, unsigned, or expired Firebase ID token is refused (401);
 *   4. a good Firebase ID token (verified against Google's RS256 public JWK)
 *      is given its own keys and no one else's;
 *   5. an upgrade webhook upgrades a Home key to Pro;
 *   6. machine activation enforces two machines per key, refuses a third (409),
 *      and deactivating one frees the slot for the new machine;
 *   7. a refunded key is gone from GET /keys and refused by POST /activate.
 *   8. with no `GOOGLE_JWKS` set (the live Worker: nothing ever set it), a good
 *      token is still verified, against the keys Google publishes for Firebase
 *      ID tokens, fetched once and kept for the endpoint's max-age; and a token
 *      Google signed for another project is refused (3b). Until 2026-10-24 the
 *      Worker read the keys only from that variable, so every real sign-in got
 *      401 and no account's key reached a browser: the owner's Pro account
 *      showed Free. Run with `GOOGLE_JWKS` taken out of 8's env against the old
 *      Worker, 8 fails (0 keys, 401).
 */

import { readFileSync } from 'node:fs';
import worker from '../server/license-worker.js';
import { verifyLicenseKey } from '../server/license-key.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 0. Built-in Ed25519 public key guard ─────────────────────────
{
  const BURNED_PUBLIC_X = 'ahOve0fG1aWiqxfwUmRwko0kZG8YziKy3y3ROjd7pgw';
  const serverKeyText = readFileSync(new URL('../server/license-key.js', import.meta.url), 'utf8');
  const clientKeyText = readFileSync(new URL('../src/lib/licenseKey.ts', import.meta.url), 'utf8');
  const serverX = serverKeyText.match(/DEFAULT_PUBLIC_JWK[\s\S]*?\bx:\s*'([^']+)'/)?.[1] ?? '';
  const clientX = clientKeyText.match(/DEFAULT_PUBLIC_JWK[\s\S]*?\bx:\s*'([^']+)'/)?.[1] ?? '';
  check(
    '0. DEFAULT_PUBLIC_JWK.x in server/license-key.js and src/lib/licenseKey.ts match and are not the burned key',
    Boolean(serverX) &&
      Boolean(clientX) &&
      serverX !== BURNED_PUBLIC_X &&
      clientX !== BURNED_PUBLIC_X &&
      serverX === clientX,
    `server=${serverX}, client=${clientX}`,
  );
}

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

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Generate two real RSA-2048 keypairs: one standing in for Google's public JWK,
// and a second ("attacker") to prove forged RS256 signatures are refused.
const googleRsa = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
const attackerRsa = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);

const googlePubJwk = {
  ...(await crypto.subtle.exportKey('jwk', googleRsa.publicKey)),
  kid: 'google-key-1',
  alg: 'RS256',
  use: 'sig',
};

async function mintFirebaseToken({
  email,
  uid = `uid_${email}`,
  expOffsetSec = 3600,
  privateKey = googleRsa.privateKey,
  kid = 'google-key-1',
  alg = 'RS256',
  project = 'chromaglass',
  iss = `https://securetoken.google.com/${project}`,
  aud = project,
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg, typ: 'JWT', kid })));
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        ...(iss === null ? {} : { iss }),
        ...(aud === null ? {} : { aud }),
        sub: uid,
        user_id: uid,
        email,
        email_verified: true,
        iat: nowSec - 10,
        exp: nowSec + expOffsetSec,
      }),
    ),
  );
  if (alg === 'none') return `${header}.${payload}.`;
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signingInput);
  return `${header}.${payload}.${toBase64Url(sig)}`;
}

const licenseEd25519 = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const licensePrivJwk = await crypto.subtle.exportKey('jwk', licenseEd25519.privateKey);
const licensePubJwk = await crypto.subtle.exportKey('jwk', licenseEd25519.publicKey);

const WEBHOOK_SECRET = 'whsec_test_merchant_secret_23_12';
const SITE = 'https://chromaglass.web.app';
const makeEnv = () => ({
  LICENSE_KV: new FakeKV(),
  WEBHOOK_SECRET,
  LICENSE_PRIVATE_KEY: JSON.stringify(licensePrivJwk),
  LICENSE_PUBLIC_KEY: JSON.stringify(licensePubJwk),
  GOOGLE_JWKS: { keys: [googlePubJwk] },
  FIREBASE_PROJECT_ID: 'chromaglass',
});

async function postWebhook(env, bodyObj, { secret = WEBHOOK_SECRET, sigOverride = undefined } = {}) {
  const raw = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  const sig = sigOverride !== undefined ? sigOverride : secret ? await hmacHex(secret, raw) : '';
  const headers = { 'Content-Type': 'application/json' };
  if (sig) headers['X-Signature'] = sig;
  return worker.fetch(
    new Request('https://licenses.example/webhook', {
      method: 'POST',
      headers,
      body: raw,
    }),
    env,
  );
}

async function getKeys(env, token, origin = SITE) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(
    new Request('https://licenses.example/keys', {
      method: 'GET',
      headers,
    }),
    env,
  );
}

async function postMachine(env, path, bodyObj) {
  return worker.fetch(
    new Request(`https://licenses.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: SITE },
      body: JSON.stringify(bodyObj),
    }),
    env,
  );
}

// ── 1. Bad webhook signatures refused ────────────────────────────
{
  const env = makeEnv();
  const badSig = await postWebhook(
    env,
    { event: 'order_created', email: 'alice@example.com', orderId: 'ord_1', tier: 'home' },
    { sigOverride: 'deadbeef'.repeat(8) },
  );
  const badText = await badSig.text();
  check(
    '1a. a bad webhook signature is refused (401) and echoes nothing',
    badSig.status === 401 && !badText.includes('alice@example.com'),
    `${badSig.status} ${badText}`,
  );

  const noSig = await postWebhook(
    env,
    { event: 'order_created', email: 'alice@example.com', orderId: 'ord_1', tier: 'home' },
    { sigOverride: '' },
  );
  check('1b. a missing webhook signature is refused (401)', noSig.status === 401, `${noSig.status}`);

  const noSecretEnv = { ...env, WEBHOOK_SECRET: undefined };
  const unconf = await postWebhook(noSecretEnv, {
    event: 'order_created',
    email: 'alice@example.com',
    orderId: 'ord_1',
    tier: 'home',
  });
  const noPrivEnv = { ...env, LICENSE_PRIVATE_KEY: undefined };
  const unconfPriv = await postWebhook(noPrivEnv, {
    event: 'order_created',
    email: 'alice@example.com',
    orderId: 'ord_1',
    tier: 'home',
  });
  check(
    '1c. a Worker with no WEBHOOK_SECRET (401) or no LICENSE_PRIVATE_KEY (500) fails closed',
    unconf.status === 401 && unconfPriv.status === 500,
    `noWebhookSecret=${unconf.status}, noLicensePrivateKey=${unconfPriv.status}`,
  );
  check('1d. refused webhooks stored nothing in KV', env.LICENSE_KV.values.size === 0, `${env.LICENSE_KV.values.size} keys in KV`);
}

// ── 2. Valid webhooks & token refusals ───────────────────────────
const env = makeEnv();
{
  const wAlice = await postWebhook(env, {
    event: 'order_created',
    email: 'alice@example.com',
    orderId: 'ord_alice_101',
    tier: 'home',
  });
  const wBob = await postWebhook(env, {
    event: 'order_created',
    email: 'bob@example.com',
    orderId: 'ord_bob_202',
    tier: 'pro',
  });
  check(
    '2. valid merchant webhooks file Home and Pro keys in KV',
    wAlice.status === 200 && wBob.status === 200,
    `alice=${wAlice.status}, bob=${wBob.status}`,
  );

  const noToken = await getKeys(env, null);
  const forgedToken = await getKeys(
    env,
    await mintFirebaseToken({ email: 'alice@example.com', privateKey: attackerRsa.privateKey }),
  );
  const expiredToken = await getKeys(
    env,
    await mintFirebaseToken({ email: 'alice@example.com', expOffsetSec: -60 }),
  );
  const unsignedToken = await getKeys(
    env,
    await mintFirebaseToken({ email: 'alice@example.com', alg: 'none' }),
  );
  // Each of these the old Worker let through but the first: it read the
  // audience alone, let 'demo-chromaglass' pass and a missing one too, and
  // never read the issuer (the review of #460).
  const foreign = {
    'another project': await mintFirebaseToken({ email: 'alice@example.com', project: 'someone-elses-app' }),
    'our audience, another issuer': await mintFirebaseToken({ email: 'alice@example.com', iss: 'https://securetoken.google.com/someone-elses-app' }),
    "the emulator's demo project": await mintFirebaseToken({ email: 'alice@example.com', project: 'demo-chromaglass' }),
    'no audience': await mintFirebaseToken({ email: 'alice@example.com', aud: null }),
    'no issuer': await mintFirebaseToken({ email: 'alice@example.com', iss: null }),
  };
  const foreignStatus = {};
  for (const [name, jwt] of Object.entries(foreign)) foreignStatus[name] = (await getKeys(env, jwt)).status;
  check(
    "3b. a token Google signed for anyone but this project (another project, another issuer, the demo project, no audience, no issuer) is refused (401)",
    Object.values(foreignStatus).every((st) => st === 401),
    JSON.stringify(foreignStatus),
  );
  check(
    '3. missing, forged, expired and unsigned Firebase ID tokens are refused (401)',
    noToken.status === 401 &&
      forgedToken.status === 401 &&
      expiredToken.status === 401 &&
      unsignedToken.status === 401,
    `none=${noToken.status}, forged=${forgedToken.status}, expired=${expiredToken.status}, alg:none=${unsignedToken.status}`,
  );
}

// ── 4. Good token gets its own keys and no one else's ────────────
let aliceHomeToken = '';
let bobProToken = '';
{
  const aliceJwt = await mintFirebaseToken({ email: 'alice@example.com' });
  const bobJwt = await mintFirebaseToken({ email: 'bob@example.com' });
  const carolJwt = await mintFirebaseToken({ email: 'carol@example.com' });

  const aliceRes = await getKeys(env, aliceJwt);
  const aliceBody = await aliceRes.json();
  const bobRes = await getKeys(env, bobJwt);
  const bobBody = await bobRes.json();
  const carolRes = await getKeys(env, carolJwt);
  const carolBody = await carolRes.json();

  aliceHomeToken = aliceBody.keys?.[0]?.token ?? '';
  bobProToken = bobBody.keys?.[0]?.token ?? '';

  const aliceVerified = await verifyLicenseKey(aliceHomeToken, licensePubJwk);
  const bobVerified = await verifyLicenseKey(bobProToken, licensePubJwk);

  check(
    "4a. a good token receives its own keys and no one else's",
    aliceRes.status === 200 &&
      aliceBody.keys?.length === 1 &&
      aliceBody.keys[0].email === 'alice@example.com' &&
      aliceBody.keys[0].tier === 'home' &&
      bobRes.status === 200 &&
      bobBody.keys?.length === 1 &&
      bobBody.keys[0].email === 'bob@example.com' &&
      bobBody.keys[0].tier === 'pro' &&
      carolBody.keys?.length === 0,
    `alice=${aliceBody.keys?.length} (${aliceBody.keys?.[0]?.tier}), bob=${bobBody.keys?.length} (${bobBody.keys?.[0]?.tier}), carol=${carolBody.keys?.length}`,
  );
  check(
    '4b. every returned key carries a valid Ed25519 signature verifiable offline',
    aliceVerified.valid &&
      aliceVerified.payload.tier === 'home' &&
      bobVerified.valid &&
      bobVerified.payload.tier === 'pro',
    `alice.valid=${aliceVerified.valid}, bob.valid=${bobVerified.valid}`,
  );
}

// ── 5. Home to Pro upgrade ───────────────────────────────────────
{
  const up = await postWebhook(env, {
    event: 'order_upgraded',
    email: 'alice@example.com',
    orderId: 'ord_alice_101',
  });
  const aliceJwt = await mintFirebaseToken({ email: 'alice@example.com' });
  const aliceBody = await (await getKeys(env, aliceJwt)).json();
  const upgradedKey = aliceBody.keys?.[0];
  const verified = upgradedKey ? await verifyLicenseKey(upgradedKey.token, licensePubJwk) : { valid: false };
  check(
    '5. an upgrade webhook upgrades Alice from Home to a signed Pro key',
    up.status === 200 &&
      aliceBody.keys?.length === 1 &&
      upgradedKey?.tier === 'pro' &&
      verified.valid &&
      verified.payload.tier === 'pro' &&
      Boolean(verified.payload.upgradeFrom),
    `tier=${upgradedKey?.tier}, upgradeFrom=${verified.payload?.upgradeFrom}`,
  );
  aliceHomeToken = upgradedKey?.token ?? aliceHomeToken;
}

// ── 6. Two-machine activation count ──────────────────────────────
{
  const m1 = await postMachine(env, '/activate', { key: bobProToken, machineId: 'mac-studio-1' });
  const m1Repeat = await postMachine(env, '/activate', { key: bobProToken, machineId: 'mac-studio-1' });
  const m2 = await postMachine(env, '/activate', { key: bobProToken, machineId: 'macbook-pro-2' });
  const m3 = await postMachine(env, '/activate', { key: bobProToken, machineId: 'mac-mini-3' });
  const m1Deact = await postMachine(env, '/deactivate', { key: bobProToken, machineId: 'mac-studio-1' });
  const m3After = await postMachine(env, '/activate', { key: bobProToken, machineId: 'mac-mini-3' });

  check(
    '6. a key activates on two machines, refuses a third (409), and moves when one is deactivated',
    m1.status === 200 &&
      m1Repeat.status === 200 &&
      m2.status === 200 &&
      m3.status === 409 &&
      m1Deact.status === 200 &&
      m3After.status === 200,
    `m1=${m1.status}, m2=${m2.status}, m3=${m3.status}, deact=${m1Deact.status}, m3After=${m3After.status}`,
  );
}

// ── 7. Refunded key is gone ──────────────────────────────────────
{
  const refund = await postWebhook(env, {
    event: 'order_refunded',
    email: 'bob@example.com',
    orderId: 'ord_bob_202',
  });
  const bobJwt = await mintFirebaseToken({ email: 'bob@example.com' });
  const bobBody = await (await getKeys(env, bobJwt)).json();
  const actAfterRefund = await postMachine(env, '/activate', {
    key: bobProToken,
    machineId: 'macbook-pro-2',
  });
  const aliceJwt = await mintFirebaseToken({ email: 'alice@example.com' });
  const aliceBody = await (await getKeys(env, aliceJwt)).json();

  check(
    "7. a refunded key is gone from the buyer's account, refused on activation, and leaves other accounts untouched",
    refund.status === 200 &&
      bobBody.keys?.length === 0 &&
      actAfterRefund.status === 401 &&
      aliceBody.keys?.length === 1,
    `bob keys=${bobBody.keys?.length}, activate=${actAfterRefund.status}, alice keys=${aliceBody.keys?.length}`,
  );
}

// ── 8. The live Worker's case: no GOOGLE_JWKS, Google's keys fetched ──
{
  const live = makeEnv();
  delete live.GOOGLE_JWKS;
  await postWebhook(live, { event: 'order_created', email: 'dana@example.com', orderId: 'ord_dana_1', tier: 'pro' });
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  // 8b first, from a cold cache: Google answering 500, and a burst of tokens
  // (forged ones cost nothing) asks it once, not once each.
  let downAsked = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://www.googleapis.com/')) { downAsked++; return new Response('down', { status: 500 }); }
    return realFetch(url, init);
  };
  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => mintFirebaseToken({ email: 'dana@example.com', kid: `made-up-${i}` }).then((t) => getKeys(live, t))));
  for (let i = 0; i < 5; i++) await getKeys(live, await mintFirebaseToken({ email: 'dana@example.com', kid: `later-${i}` }));
  check(
    '8b. with Google down, ten tokens (five at once, five after) ask Google once, and are refused',
    downAsked === 1 && burst.every((r) => r.status === 401),
    `Google asked ${downAsked}×, statuses ${burst.map((r) => r.status).join(',')}`,
  );
  // A minute on, the once-a-minute limit has passed: 8 runs from there.
  Date.now = () => realNow() + 61_000;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://www.googleapis.com/')) {
      asked.push(String(url));
      return new Response(JSON.stringify({ keys: [googlePubJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=18637, must-revalidate' },
      });
    }
    return realFetch(url, init);
  };
  try {
    const first = await getKeys(live, await mintFirebaseToken({ email: 'dana@example.com' }));
    const firstBody = await first.json();
    const second = await getKeys(live, await mintFirebaseToken({ email: 'dana@example.com' }));
    const madeUpKid = await getKeys(live, await mintFirebaseToken({ email: 'dana@example.com', kid: 'not-a-google-key' }));
    const securetoken = asked.every((u) => u.endsWith('/jwk/securetoken@system.gserviceaccount.com'));
    check(
      "8. with no GOOGLE_JWKS, a good token is verified against Google's published keys, fetched once",
      first.status === 200 &&
        firstBody.keys?.length === 1 &&
        firstBody.keys[0].tier === 'pro' &&
        second.status === 200 &&
        madeUpKid.status === 401 &&
        asked.length === 1 &&
        securetoken,
      `first=${first.status} (${firstBody.keys?.length ?? 0} keys), second=${second.status}, made-up kid=${madeUpKid.status}, Google asked ${asked.length}×${securetoken ? '' : ' at the wrong address'}`,
    );
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
