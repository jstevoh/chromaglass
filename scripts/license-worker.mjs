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
 *  11. refunding only an upgrade order gives the buyer their Home key back (PLAN
 *      23.17i): under a new id, so the Pro token dies with the refund; refunding
 *      the Home order itself still takes everything.
 *  12. the Mac app asks this Worker for a seat (PLAN 23.17g): the real page code
 *      (src/lib/licenseKey.ts, bundled) and the real show server's licence
 *      manager, two to five Macs against one key. A third Mac is refused with
 *      the two named, "Remove from this computer" frees a seat, a Mac offline is
 *      let in and asked again at its next online start, and a refunded key is
 *      refused. Without the page's ask the third Mac opens (the old behaviour).
 *   8. with no `GOOGLE_JWKS` set (the live Worker: nothing ever set it), a good
 *      token is still verified, against the keys Google publishes for Firebase
 *      ID tokens, fetched once and kept for the endpoint's max-age; and a token
 *      Google signed for another project is refused (3b). Until 2026-10-24 the
 *      Worker read the keys only from that variable, so every real sign-in got
 *      401 and no account's key reached a browser: the owner's Pro account
 *      showed Free. Run with `GOOGLE_JWKS` taken out of 8's env against the old
 *      Worker, 8 fails (0 keys, 401).
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import worker from '../server/license-worker.js';
import { generatePair, rotate } from './licenserotate.mjs';
import { verifyLicenseKey } from '../server/license-key.js';
import { createServerLicenseManager } from '../server/server-license.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 0. Built-in Ed25519 public key guard ─────────────────────────
{
  // The pairs retired so far: the first (rotated out before launch) and the one that signed the
  // test-mode orders' keys (rotated out 2026-10, 23.12-rotate).
  const BURNED_PUBLIC_X = ['ahOve0fG1aWiqxfwUmRwko0kZG8YziKy3y3ROjd7pgw', 'E_OrBzBgNWzoKgdlDOVjCjqb6CvkE4L0olobNv2u96A'];
  const serverKeyText = readFileSync(new URL('../server/license-key.js', import.meta.url), 'utf8');
  const clientKeyText = readFileSync(new URL('../src/lib/licenseKey.ts', import.meta.url), 'utf8');
  const serverX = serverKeyText.match(/DEFAULT_PUBLIC_JWK[\s\S]*?\bx:\s*'([^']+)'/)?.[1] ?? '';
  const clientX = clientKeyText.match(/DEFAULT_PUBLIC_JWK[\s\S]*?\bx:\s*'([^']+)'/)?.[1] ?? '';
  check(
    '0. DEFAULT_PUBLIC_JWK.x in server/license-key.js and src/lib/licenseKey.ts match and are not the burned key',
    Boolean(serverX) &&
      Boolean(clientX) &&
      !BURNED_PUBLIC_X.includes(serverX) &&
      !BURNED_PUBLIC_X.includes(clientX) &&
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
const makeEnv = (extra = {}) => ({
  LICENSE_KV: new FakeKV(),
  WEBHOOK_SECRET,
  LICENSE_PRIVATE_KEY: JSON.stringify(licensePrivJwk),
  LICENSE_PUBLIC_KEY: JSON.stringify(licensePubJwk),
  GOOGLE_JWKS: { keys: [googlePubJwk] },
  FIREBASE_PROJECT_ID: 'chromaglass',
  ...extra,
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

// ── 9. Test-mode orders mint nothing; live product ids come from settings ──
{
  const lsOrder = (email, orderId, { test, productId = 1450530, name = 'ChromaGlass Home', status = 'paid', event = 'order_created' } = {}) => ({
    meta: { event_name: event, ...(test === 'meta' ? { test_mode: true } : {}) },
    data: {
      id: orderId,
      attributes: {
        status,
        user_email: email,
        ...(test === 'order' ? { test_mode: true } : {}),
        first_order_item: { product_id: productId, product_name: name, order_id: orderId },
      },
    },
  });
  const keysOf = async (env, email) => (await (await getKeys(env, await mintFirebaseToken({ email }))).json()).keys ?? [];

  const env = makeEnv();
  const t1 = await postWebhook(env, lsOrder('eve@example.com', 'ord_eve_1', { test: 'meta' }));
  const t2 = await postWebhook(env, lsOrder('eve@example.com', 'ord_eve_2', { test: 'order' }));
  const eveKeys = await keysOf(env, 'eve@example.com');
  check(
    '9. a test-mode order (meta or order flag) answers 200 and files no key',
    t1.status === 200 && t2.status === 200 && eveKeys.length === 0 && env.LICENSE_KV.values.size === 0,
    `${t1.status}/${t2.status}, ${eveKeys.length} keys, ${env.LICENSE_KV.values.size} in KV`,
  );

  const allow = makeEnv({ TEST_MODE_EMAILS: 'owner@example.com, Other@example.com' });
  await postWebhook(allow, lsOrder('owner@example.com', 'ord_own_1', { test: 'meta' }));
  await postWebhook(allow, lsOrder('stranger@example.com', 'ord_str_1', { test: 'meta' }));
  const ownerKeys = await keysOf(allow, 'owner@example.com');
  const strangerKeys = await keysOf(allow, 'stranger@example.com');
  check(
    '9b. TEST_MODE_EMAILS lets the owner prove the path with a test order, and only the owner',
    ownerKeys.length === 1 && strangerKeys.length === 0,
    `owner ${ownerKeys.length} keys, stranger ${strangerKeys.length}`,
  );

  const real = await postWebhook(env, lsOrder('frank@example.com', 'ord_frank_1'));
  const frankKeys = await keysOf(env, 'frank@example.com');
  check(
    '9c. a live order (no test flag) still files its key',
    real.status === 200 && frankKeys.length === 1 && frankKeys[0].tier === 'home',
    `${real.status}, ${frankKeys.length} keys, tier ${frankKeys[0]?.tier}`,
  );

  // The live store's products have ids of their own and names that may be reworded; the
  // settings say which ids are Pro and which is the Upgrade.
  const live = makeEnv({ LS_HOME_PRODUCT_IDS: '777000', LS_PRO_PRODUCT_IDS: '777001', LS_UPGRADE_PRODUCT_IDS: '777002' });
  await postWebhook(live, lsOrder('gina@example.com', 'ord_gina_1', { productId: 777001, name: 'ChromaGlass' }));
  await postWebhook(live, lsOrder('hal@example.com', 'ord_hal_1', { productId: 777000, name: 'ChromaGlass' }));
  const ginaKeys = await keysOf(live, 'gina@example.com');
  const halKeys = await keysOf(live, 'hal@example.com');
  await postWebhook(live, lsOrder('hal@example.com', 'ord_hal_2', { productId: 777002, name: 'ChromaGlass' }));
  const halAfter = await keysOf(live, 'hal@example.com');
  check(
    '9d. LS_PRO_PRODUCT_IDS makes a live product Pro, and LS_UPGRADE_PRODUCT_IDS turns Home into Pro',
    ginaKeys[0]?.tier === 'pro' && halKeys[0]?.tier === 'home' && halAfter.length === 1 && halAfter[0]?.tier === 'pro',
    `gina ${ginaKeys[0]?.tier}, hal ${halKeys[0]?.tier} then ${halAfter.map((k) => k.tier).join('+')}`,
  );
}

// ── 11. Refunding just an upgrade ─────────────────────────────────
{
  const e = makeEnv();
  const keysOf = async (email) => (await (await getKeys(e, await mintFirebaseToken({ email }))).json()).keys ?? [];

  // Erin buys Home, upgrades to Pro, works on a Mac, then refunds the upgrade only.
  await postWebhook(e, { event: 'order_created', email: 'erin@example.com', orderId: 'ord_erin_1', tier: 'home' });
  const home = (await keysOf('erin@example.com'))[0];
  await postWebhook(e, { event: 'order_upgraded', email: 'erin@example.com', orderId: 'ord_erin_up' });
  const pro = (await keysOf('erin@example.com'))[0];
  const seatOnPro = await postMachine(e, '/activate', { key: pro.token, machineId: 'erin-mac', label: 'Erin MBP' });
  const refund = await postWebhook(e, { event: 'order_refunded', email: 'erin@example.com', orderId: 'ord_erin_up' });
  const after = await keysOf('erin@example.com');
  const back = after[0];
  const backKey = back ? await verifyLicenseKey(back.token, licensePubJwk) : { valid: false };
  const proAfter = await postMachine(e, '/activate', { key: pro.token, machineId: 'erin-mac' });
  const homeAfter = back ? await postMachine(e, '/activate', { key: back.token, machineId: 'erin-mac', label: 'Erin MBP' }) : { status: 0 };
  check(
    '11a. refunding only the upgrade leaves the buyer their Home key, verifiable, with the Home entitlement they bought',
    seatOnPro.status === 200 && refund.status === 200 && after.length === 1 && back?.tier === 'home' && backKey.valid &&
      backKey.payload.tier === 'home' && backKey.payload.email === 'erin@example.com' &&
      back.updatesUntil === home.updatesUntil && back.maxMachines === home.maxMachines && homeAfter.status === 200,
    `keys after=${after.length} (${back?.tier}), signature ${backKey.valid ? 'ok' : 'bad'}, updatesUntil ${back?.updatesUntil === home.updatesUntil ? 'kept' : 'changed'}, Home activates ${homeAfter.status}`,
  );
  check(
    "9b. the Pro token dies with the refund: refused on activation, and the Home key has a new id so no Mac holding the Pro one still finds its id listed",
    proAfter.status === 401 && !!back && back.id !== pro.id && !after.some((k) => k.id === pro.id),
    `Pro activate ${proAfter.status}, home id ${back?.id} vs pro id ${pro.id}`,
  );

  // A record filed before upgrades kept what they replaced is rebuilt, not lost.
  await postWebhook(e, { event: 'order_created', email: 'fay@example.com', orderId: 'ord_fay_1', tier: 'home' });
  await postWebhook(e, { event: 'order_upgraded', email: 'fay@example.com', orderId: 'ord_fay_up' });
  const rec = JSON.parse(await e.LICENSE_KV.get('keys:fay@example.com'));
  for (const r of rec) delete r.replaces;
  await e.LICENSE_KV.put('keys:fay@example.com', JSON.stringify(rec));
  await postWebhook(e, { event: 'order_refunded', email: 'fay@example.com', orderId: 'ord_fay_up' });
  const fay = await keysOf('fay@example.com');
  check(
    '11c. an upgrade filed before the Worker kept what it replaced still gives the Home key back',
    fay.length === 1 && fay[0].tier === 'home',
    `keys=${fay.length} (${fay[0]?.tier})`,
  );

  // The Home order itself refunded after the upgrade: the Pro key stood on it, so both go.
  await postWebhook(e, { event: 'order_created', email: 'gus@example.com', orderId: 'ord_gus_1', tier: 'home' });
  await postWebhook(e, { event: 'order_upgraded', email: 'gus@example.com', orderId: 'ord_gus_up' });
  await postWebhook(e, { event: 'order_refunded', email: 'gus@example.com', orderId: 'ord_gus_1' });
  const gus = await keysOf('gus@example.com');
  // And the refiled Home, refunded in its turn, is gone for good.
  await postWebhook(e, { event: 'order_refunded', email: 'erin@example.com', orderId: 'ord_erin_1' });
  const erin = await keysOf('erin@example.com');
  check(
    '11d. refunding the Home order itself takes every key (the upgrade stood on it), including a Home refiled by an earlier upgrade refund',
    gus.length === 0 && erin.length === 0,
    `gus=${gus.length}, erin=${erin.length}`,
  );
}

// ── 12. The Mac app asks for a seat ──────────────────────────────
{
  const seatEnv = makeEnv();
  const keysOf = async (email) => (await (await getKeys(seatEnv, await mintFirebaseToken({ email }))).json()).keys ?? [];
  await postWebhook(seatEnv, { event: 'order_created', email: 'hana@example.com', orderId: 'ord_hana_1', tier: 'home' });
  const key = (await keysOf('hana@example.com'))[0];
  const keyId = key.id;

  // The page's own licence code, as the Mac app builds it (VITE_MAC_APP=1 and the Worker's address).
  const bundled = await build({
    entryPoints: [new URL('../src/lib/licenseKey.ts', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ VITE_MAC_APP: '1', VITE_FIREBASE_LICENSES_URL: 'https://licenses.example' }) },
  });
  const pageSource = bundled.outputFiles[0].text;
  // The same page code built for the site (no VITE_MAC_APP): the control for the Mac app's ask.
  const siteBundle = await build({
    entryPoints: [new URL('../src/lib/licenseKey.ts', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({}) },
  });
  const dir = mkdtempSync(join(tmpdir(), 'cg-seats-'));
  let n = 0;
  const importPage = (text) => import(`data:text/javascript;base64,${Buffer.from(`${text}\n// instance ${n++}`).toString('base64')}`);
  const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

  process.env.LICENSE_PUBLIC_KEY = JSON.stringify(licensePubJwk);
  globalThis.__cgTestLicensePublicKey = licensePubJwk;
  const realFetch = globalThis.fetch;
  const realWindow = globalThis.window;
  const realStorage = globalThis.localStorage;
  let active = null;
  let offline = false;
  const workerCalls = [];
  globalThis.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://licenses.example')) {
      workerCalls.push(u.replace('https://licenses.example', ''));
      if (offline) throw new TypeError('network down');
      return worker.fetch(new Request(u, init), seatEnv);
    }
    const body = init.body ? JSON.parse(init.body) : {};
    const reply = (status, b) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (u === '/license-info.json') return reply(200, await active.manager.currentStatus());
    if (u === '/license-activate') { const r = await active.manager.activate(body.key, body.machineId, body.seatConfirmed === true); return reply(r.status, r.body); }
    if (u === '/license-deactivate') { const r = await active.manager.deactivate(body.key, body.machineId); return reply(r.status, r.body); }
    throw new Error(`no route for ${u}`);
  };
  const mac = async (name, text = pageSource) => {
    const m = { name, storage: storage(), manager: createServerLicenseManager({ filePath: join(dir, `${name}.json`), label: name }), page: await importPage(text) };
    return m;
  };
  const use = (m) => { active = m; globalThis.localStorage = m.storage; };
  const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

  try {
    const studio = await mac('Studio');
    const laptop = await mac('Laptop');
    const booth = await mac('Booth');
    use(studio);
    const a = await studio.page.activateLocalLicenseKey(key.token);
    use(laptop);
    const b = await laptop.page.activateLocalLicenseKey(key.token);
    use(booth);
    const c = await booth.page.activateLocalLicenseKey(key.token);
    const boothState = await booth.manager.currentStatus();
    const stored = JSON.parse(await seatEnv.LICENSE_KV.get(`machines:${keyId}`));
    check(
      '12a. two Macs seat the key at the Worker, filed as confirmed on each; a third is refused with the two named, and the key never reaches its server',
      a.valid && b.valid && !c.valid && c.error === 'machine-limit' &&
        /Studio/.test(c.detail ?? '') && /Laptop/.test(c.detail ?? '') && !boothState.valid &&
        (await studio.manager.currentStatus()).seatConfirmed === true && stored.length === 2,
      `A=${a.valid} B=${b.valid} C=${c.valid}/${c.error}; "${c.detail}"; third Mac's server valid=${boothState.valid}; Worker seats ${stored.length}`,
    );

    // "Remove from this computer" gives the seat back; the third Mac then gets it.
    use(studio);
    await studio.page.deactivateLocalLicenseKey();
    const afterRelease = JSON.parse(await seatEnv.LICENSE_KV.get(`machines:${keyId}`));
    use(booth);
    const c2 = await booth.page.activateLocalLicenseKey(key.token);
    check(
      '12b. "Remove from this computer" frees its seat at the Worker, and the refused Mac can then open the key',
      afterRelease.length === 1 && c2.valid && (await booth.manager.currentStatus()).seatConfirmed === true,
      `seats after release ${afterRelease.length}, third Mac valid=${c2.valid}`,
    );

    // Offline: let in on the signature, not yet confirmed; asked again at the next online start.
    const kitchen = await mac('Kitchen');
    const attic = await mac('Attic');
    use(laptop);
    await laptop.page.deactivateLocalLicenseKey(); // one seat free: Booth holds the other
    offline = true;
    use(kitchen);
    const k = await kitchen.page.activateLocalLicenseKey(key.token);
    const kitchenOffline = await kitchen.manager.currentStatus();
    use(attic);
    const t = await attic.page.activateLocalLicenseKey(key.token);
    offline = false;
    check(
      '12c. a Mac that cannot reach the Worker is let in on the key\'s signature, marked as not yet confirmed',
      k.valid && kitchenOffline.valid && kitchenOffline.seatConfirmed === false && t.valid,
      `kitchen valid=${k.valid} confirmed=${kitchenOffline.seatConfirmed}; attic valid=${t.valid}`,
    );
    use(kitchen);
    await kitchen.page.syncServerLicense();
    const kitchenSeated = await waitFor(async () => (await kitchen.manager.currentStatus()).seatConfirmed === true);
    use(attic);
    await attic.page.syncServerLicense();
    const atticRetired = await waitFor(async () => !(await attic.manager.currentStatus()).valid);
    const atticInMemory = attic.page.getCachedLicenseStatus().valid;
    check(
      '12d. at its next online start the first offline Mac gets the free seat, and the second (both seats now taken) loses the key from its next start, not from the page it is showing',
      kitchenSeated && atticRetired && atticInMemory,
      `kitchen confirmed=${kitchenSeated}; attic key retired from its server=${atticRetired}, still verified on the open page=${atticInMemory}`,
    );

    // A refund: the Worker has revoked the key; a new Mac is told so.
    await postWebhook(seatEnv, { event: 'order_refunded', email: 'hana@example.com', orderId: 'ord_hana_1' });
    const lodge = await mac('Lodge');
    use(lodge);
    const l = await lodge.page.activateLocalLicenseKey(key.token);
    check(
      '12e. a refunded key is refused at the door with the reason, not as an unknown key',
      !l.valid && l.error === 'revoked' && /refunded/.test(l.detail ?? '') && !(await lodge.manager.currentStatus()).valid,
      `valid=${l.valid} error=${l.error} "${l.detail}"`,
    );

    // The controls: the same page built for the site asks the Worker for nothing, so the third Mac opens (the old behaviour).
    const e2 = makeEnv();
    Object.assign(seatEnv, { LICENSE_KV: e2.LICENSE_KV });
    await postWebhook(seatEnv, { event: 'order_created', email: 'ivan@example.com', orderId: 'ord_ivan_1', tier: 'home' });
    const ik = (await keysOf('ivan@example.com'))[0];
    const before = workerCalls.length;
    const opened = [];
    for (const name of ['Old1', 'Old2', 'Old3']) {
      const m = await mac(name, siteBundle.outputFiles[0].text);
      use(m);
      opened.push((await m.page.activateLocalLicenseKey(ik.token)).valid);
    }
    check(
      '12f. control: the page built for the site never asks the Worker, and a third Mac opens with the same key (what the Mac app did before this check)',
      opened.every(Boolean) && workerCalls.length === before,
      `opened=${opened.join(',')}, Worker calls ${workerCalls.length - before}`,
    );
    // A Mac that was seated long ago and never signed in: the refund still reaches it (the review of #524).
    const restart = async (m) => ({ ...m, page: await importPage(pageSource) });
    await postWebhook(seatEnv, { event: 'order_created', email: 'jo@example.com', orderId: 'ord_jo_1', tier: 'home' });
    await postWebhook(seatEnv, { event: 'order_upgraded', email: 'jo@example.com', orderId: 'ord_jo_up' });
    const joPro = (await keysOf('jo@example.com'))[0];
    const p1 = await mac('JoStudio');
    const p2 = await mac('JoLaptop');
    use(p1);
    await p1.page.activateLocalLicenseKey(joPro.token);
    use(p2);
    await p2.page.activateLocalLicenseKey(joPro.token);
    await postWebhook(seatEnv, { event: 'order_refunded', email: 'jo@example.com', orderId: 'ord_jo_up' });
    const joP1 = await restart(p1);
    use(joP1);
    await joP1.page.syncServerLicense();
    const joRetired = await waitFor(async () => !(await joP1.manager.currentStatus()).valid);
    const joP2Untouched = (await p2.manager.currentStatus()).valid; // not restarted yet: nothing mid-show
    check(
      '12h. a refund reaches a Mac that was seated long ago and never signed in: its next online start takes the Pro key off it (and the Mac not yet restarted keeps it until it is)',
      joRetired && joP2Untouched,
      `restarted Mac's key retired=${joRetired}; the other, not yet restarted, still holds it=${joP2Untouched}`,
    );

    // The Worker saying "full" to a Mac it had seated does not take the app off a paying Mac in one go.
    await postWebhook(seatEnv, { event: 'order_created', email: 'kim@example.com', orderId: 'ord_kim_1', tier: 'home' });
    const kimKey = (await keysOf('kim@example.com'))[0];
    const k1 = await mac('KimStudio');
    use(k1);
    await k1.page.activateLocalLicenseKey(kimKey.token);
    await seatEnv.LICENSE_KV.put(`machines:${kimKey.id}`, JSON.stringify([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }]));
    const k1b = await restart(k1);
    use(k1b);
    await k1b.page.syncServerLicense();
    const kimUnconfirmed = await waitFor(async () => (await k1b.manager.currentStatus()).seatConfirmed === false);
    const kimStillValid = (await k1b.manager.currentStatus()).valid;
    const k1c = await restart(k1b);
    use(k1c);
    await k1c.page.syncServerLicense();
    const kimRetired = await waitFor(async () => !(await k1c.manager.currentStatus()).valid);
    check(
      '12i. "full" for a Mac the Worker had seated keeps the key and marks it unconfirmed; the start after, still full, takes it off',
      kimUnconfirmed && kimStillValid && kimRetired,
      `after one full: unconfirmed=${kimUnconfirmed}, key kept=${kimStillValid}; after the next: retired=${kimRetired}`,
    );
    check(
      '12j. a Mac\'s seat id is its own: random, kept in the licence file across restarts, different on every Mac',
      (await studio.manager.currentStatus()).seatId === (await createServerLicenseManager({ filePath: join(dir, 'Studio.json') }).currentStatus()).seatId &&
        (await studio.manager.currentStatus()).seatId !== (await laptop.manager.currentStatus()).seatId,
      'same file → same id; two files → two ids',
    );
  } finally {
    globalThis.fetch = realFetch;
    globalThis.window = realWindow;
    globalThis.localStorage = realStorage;
    delete globalThis.__cgTestLicensePublicKey;
    delete process.env.LICENSE_PUBLIC_KEY;
  }
}

// ── 13. Only products we sell, only paid orders, only a Home can be upgraded ──
// The security audit of 2026-10-28, findings 5 and 6. Each line below failed on the Worker before.
{
  const lsOrder = (email, orderId, { productId = 1450530, name = 'ChromaGlass Home', status = 'paid', event = 'order_created' } = {}) => ({
    meta: { event_name: event },
    data: {
      id: orderId,
      attributes: { status, user_email: email, first_order_item: { product_id: productId, product_name: name, order_id: orderId } },
    },
  });
  const keysOf = async (e, email) => (await (await getKeys(e, await mintFirebaseToken({ email }))).json()).keys ?? [];
  const env10 = makeEnv({ LS_HOME_PRODUCT_IDS: '777000', LS_PRO_PRODUCT_IDS: '777001', LS_UPGRADE_PRODUCT_IDS: '777002' });

  // 10a. A product on none of the three lists files nothing, whatever its name says.
  const named = await postWebhook(env10, lsOrder('ivy@example.com', 'ord_ivy_1', { productId: 999001, name: 'ChromaGlass Pro (bundle)' }));
  const namedBody = await named.json();
  check(
    '13a. an order for a product we do not sell (named "Pro", on no list) answers 200, files no key and is held',
    named.status === 200 && (await keysOf(env10, 'ivy@example.com')).length === 0 && namedBody.ignored === 'unknown product' && env10.LICENSE_KV.values.has('held:key_ord_ivy_1'),
    `${named.status} ${JSON.stringify(namedBody)}, held=${env10.LICENSE_KV.values.has('held:key_ord_ivy_1')}`,
  );

  // 10b. Pending and failed orders file nothing; the same order, paid, files its key.
  const pend = await postWebhook(env10, lsOrder('jon@example.com', 'ord_jon_1', { productId: 777000, status: 'pending' }));
  const fail = await postWebhook(env10, lsOrder('kim@example.com', 'ord_kim_1', { productId: 777001, status: 'failed' }));
  const none = (await keysOf(env10, 'jon@example.com')).length + (await keysOf(env10, 'kim@example.com')).length;
  await postWebhook(env10, lsOrder('jon@example.com', 'ord_jon_1', { productId: 777000, status: 'paid' }));
  const jonAfter = await keysOf(env10, 'jon@example.com');
  check(
    '13b. a pending or failed order files nothing, and the same order once paid files its key',
    pend.status === 200 && fail.status === 200 && none === 0 && jonAfter.length === 1 && jonAfter[0].tier === 'home',
    `${pend.status}/${fail.status}, keys while unpaid ${none}, after paid ${jonAfter.length} (${jonAfter[0]?.tier})`,
  );

  // 10c. An Upgrade needs an unrevoked Home key on file for the email.
  const noHome = await postWebhook(env10, lsOrder('lee@example.com', 'ord_lee_up', { productId: 777002, name: 'ChromaGlass Upgrade' }));
  const noHomeBody = await noHome.json();
  const leeKeys = await keysOf(env10, 'lee@example.com');
  await postWebhook(env10, lsOrder('mia@example.com', 'ord_mia_1', { productId: 777000 }));
  await postWebhook(env10, lsOrder('mia@example.com', 'ord_mia_up', { productId: 777002, name: 'ChromaGlass Upgrade' }));
  const miaKeys = await keysOf(env10, 'mia@example.com');
  // A buyer who refunded their Home has none, so an Upgrade after it is held too.
  await postWebhook(env10, lsOrder('ned@example.com', 'ord_ned_1', { productId: 777000 }));
  await postWebhook(env10, lsOrder('ned@example.com', 'ord_ned_1', { productId: 777000, status: 'refunded', event: 'order_refunded' }));
  await postWebhook(env10, lsOrder('ned@example.com', 'ord_ned_up', { productId: 777002, name: 'ChromaGlass Upgrade' }));
  const nedKeys = await keysOf(env10, 'ned@example.com');
  check(
    '13c. an Upgrade with no Home key on file (never bought, or refunded) files no Pro key and is held; with a Home it upgrades it',
    noHomeBody.ignored === 'upgrade with no Home key' && leeKeys.length === 0 && env10.LICENSE_KV.values.has('held:key_ord_lee_up') &&
      miaKeys.length === 1 && miaKeys[0].tier === 'pro' && nedKeys.length === 0,
    `lee ${leeKeys.length} keys (${noHomeBody.ignored}), mia ${miaKeys.map((k) => k.tier).join('+')}, ned ${nedKeys.length}`,
  );

  // 10d. A partial refund leaves the licence; the full refund takes it; our own direct refund still does.
  await postWebhook(env10, lsOrder('oli@example.com', 'ord_oli_1', { productId: 777001 }));
  const part = await postWebhook(env10, lsOrder('oli@example.com', 'ord_oli_1', { productId: 777001, status: 'partial_refund', event: 'order_refunded' }));
  const partBody = await part.json();
  const afterPart = await keysOf(env10, 'oli@example.com');
  await postWebhook(env10, lsOrder('oli@example.com', 'ord_oli_1', { productId: 777001, status: 'refunded', event: 'order_refunded' }));
  const afterFull = await keysOf(env10, 'oli@example.com');
  await postWebhook(env10, { event: 'order_created', email: 'pat@example.com', orderId: 'ord_pat_1', tier: 'home' });
  await postWebhook(env10, { event: 'order_refunded', email: 'pat@example.com', orderId: 'ord_pat_1' });
  const patKeys = await keysOf(env10, 'pat@example.com');
  check(
    '13d. a partial refund leaves the licence (200, key still listed); a full refund revokes it; the owner\'s direct refund still does',
    part.status === 200 && partBody.ignored === 'not a full refund' && afterPart.length === 1 && afterFull.length === 0 && patKeys.length === 0,
    `partial ${part.status} ${partBody.ignored}, keys after partial ${afterPart.length}, after full ${afterFull.length}, direct ${patKeys.length}`,
  );
}

// ── 14. /activate and /deactivate are rate-limited (audit finding 15) ─────
{
  const env11 = makeEnv({ ACTIVATE_PER_ADDRESS: '5', ACTIVATE_PER_KEY: '3' });
  await postWebhook(env11, { event: 'order_created', email: 'quinn@example.com', orderId: 'ord_quinn_1', tier: 'home' });
  const token = (await (await getKeys(env11, await mintFirebaseToken({ email: 'quinn@example.com' }))).json()).keys[0].token;
  const ask = (path, body, ip) =>
    worker.fetch(
      new Request(`https://licenses.example${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: SITE, ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
        body: JSON.stringify(body),
      }),
      env11,
    );
  // Three asks on one key pass (from three addresses, so the address's own limit is not the one hit); the fourth is refused.
  const statuses = [];
  for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
    statuses.push((await ask('/activate', { key: token, machineId: 'm1' }, ip)).status);
  }
  const refused = await ask('/deactivate', { key: token, machineId: 'm1' }, '198.51.100.5');
  const refusedBody = await refused.json();
  check(
    '14a. a key gets 3 asks an hour (ACTIVATE_PER_KEY) across both routes, then 429 with Retry-After',
    statuses.slice(0, 3).every((st) => st === 200) && statuses[3] === 429 && refused.status === 429 &&
      Number(refused.headers.get('Retry-After')) > 0 && refusedBody.error === 'too many requests',
    `${statuses.join(',')}, deactivate ${refused.status}, Retry-After ${refused.headers.get('Retry-After')}`,
  );

  // One address sending anything (bad keys too) is cut off at ACTIVATE_PER_ADDRESS, before its key is read.
  const bad = [];
  for (let i = 0; i < 7; i++) bad.push((await ask('/activate', { key: 'cg1.AAAA.AAAA', machineId: `m${i}` }, '203.0.113.9')).status);
  const other = await ask('/activate', { key: 'cg1.AAAA.AAAA', machineId: 'x' }, '203.0.113.10');
  check(
    '14b. an address gets 5 asks an hour (ACTIVATE_PER_ADDRESS), bad keys counted, then 429; another address is not affected',
    bad.slice(0, 5).every((st) => st === 401) && bad[5] === 429 && bad[6] === 429 && other.status === 401,
    `${bad.join(',')}, other address ${other.status}`,
  );

  // The counters expire with their hour, and a request with no address (the local checks) is not counted.
  const counters = [...env11.LICENSE_KV.values.entries()].filter(([k]) => k.startsWith('rl:activate:'));
  const noAddr = [];
  for (let i = 0; i < 8; i++) noAddr.push((await ask('/activate', { key: 'cg1.AAAA.AAAA', machineId: 'z' })).status);
  check(
    '14c. the counters carry a TTL, and a request with no address is not counted by address',
    counters.length > 0 && counters.every(([, v]) => v.ttl > 0) && noAddr.every((st) => st === 401),
    `${counters.length} counters, ttls ${[...new Set(counters.map(([, v]) => v.ttl))].join(',')}, no-address ${noAddr.join(',')}`,
  );
}

// ── 15. Rotating the signing key pair (audit finding 1; scripts/licenserotate.mjs) ──
{
  const env12 = makeEnv();
  const oldPub = licensePubJwk;
  // The owner's key, two buyers' (as if test-mode orders had minted them), a seat, and records the rotation must not touch.
  await postWebhook(env12, { event: 'order_created', email: 'owner@example.com', orderId: 'owner-pro-1', tier: 'pro', keyId: 'owner-pro-1' });
  await postWebhook(env12, { event: 'order_created', email: 'tester1@example.com', orderId: 'ord_t1', tier: 'pro' });
  await postWebhook(env12, { event: 'order_created', email: 'tester2@example.com', orderId: 'ord_t2', tier: 'home' });
  const ownerOld = (await (await getKeys(env12, await mintFirebaseToken({ email: 'owner@example.com' }))).json()).keys[0].token;
  const testerOld = (await (await getKeys(env12, await mintFirebaseToken({ email: 'tester1@example.com' }))).json()).keys[0].token;
  await postMachine(env12, '/activate', { key: ownerOld, machineId: 'owners-mac' });
  await env12.LICENSE_KV.put('marketing:owner@example.com', '{"optIn":true}');
  await env12.LICENSE_KV.put('sync:abc', '{"shows":[]}');
  await env12.LICENSE_KV.put('held:key_ord_x', '{"reason":"unknown product"}');
  const adapter = (kv) => ({
    list: async (prefix) => [...kv.values.keys()].filter((k) => k.startsWith(prefix)),
    get: (n) => kv.get(n),
    put: (n, v) => kv.put(n, v),
    delete: (n) => kv.delete(n),
  });
  const snapshot = () => JSON.stringify([...env12.LICENSE_KV.values.entries()].sort());
  const fresh = await generatePair();

  const before = snapshot();
  const dry = await rotate({ kv: adapter(env12.LICENSE_KV), privateJwk: fresh.privateJwk, publicJwk: fresh.publicJwk, keepEmails: ['owner@example.com'] });
  check(
    '15a. a plan changes nothing and names what it would delete (the two buyers) and keep (the owner)',
    snapshot() === before && dry.resigned.join() === 'owner-pro-1' && dry.deleted.some((n) => n === 'keys:tester1@example.com') && dry.deleted.some((n) => n === 'key:key_ord_t2'),
    `${dry.deleted.length} to delete, re-sign ${dry.resigned.join()}`,
  );

  let refused = '';
  try {
    await rotate({ kv: adapter(env12.LICENSE_KV), privateJwk: fresh.privateJwk, publicJwk: fresh.publicJwk, keepEmails: ['nobody@example.com'], apply: true });
  } catch (e) {
    refused = e.message;
  }
  check('15b. a rotation that would keep no key refuses and changes nothing', refused.includes('refusing') && snapshot() === before, refused);

  await rotate({ kv: adapter(env12.LICENSE_KV), privateJwk: fresh.privateJwk, publicJwk: fresh.publicJwk, keepEmails: ['owner@example.com'], apply: true });
  const names = [...env12.LICENSE_KV.values.keys()].sort();
  const ownerNew = JSON.parse(await env12.LICENSE_KV.get('keys:owner@example.com'))[0];
  check(
    '15c. after apply only the owner\'s licence records remain (with his seat); marketing, sync, held and rate-counter records are untouched',
    names.filter((n) => !n.startsWith('rl:')).join() === ['held:key_ord_x', 'key:owner-pro-1', 'keys:owner@example.com', 'machines:owner-pro-1', 'marketing:owner@example.com', 'sync:abc'].join() && ownerNew.id === 'owner-pro-1' && ownerNew.tier === 'pro',
    names.join(),
  );
  const newVerifies = await verifyLicenseKey(ownerNew.token, fresh.publicJwk);
  const oldOnNew = await verifyLicenseKey(ownerOld, fresh.publicJwk);
  const testerOnNew = await verifyLicenseKey(testerOld, fresh.publicJwk);
  check(
    '15d. the owner\'s re-signed key verifies against the new public key, same id and tier; the old token and a test buyer\'s do not',
    newVerifies.valid && newVerifies.id === 'owner-pro-1' && newVerifies.tier === 'pro' && !oldOnNew.valid && !testerOnNew.valid,
    `new ${newVerifies.valid}, old ${oldOnNew.valid}/${oldOnNew.error}, test buyer ${testerOnNew.valid}`,
  );

  // The Worker with the new pair: the re-signed key activates (and keeps its seat), the old one is refused.
  const rotated = { ...env12, LICENSE_PRIVATE_KEY: JSON.stringify(fresh.privateJwk), LICENSE_PUBLIC_KEY: JSON.stringify(fresh.publicJwk) };
  const actNew = await postMachine(rotated, '/activate', { key: ownerNew.token, machineId: 'owners-mac' });
  const actOld = await postMachine(rotated, '/activate', { key: ownerOld, machineId: 'owners-mac' });
  const actNewBody = await actNew.json();
  check(
    '15e. the Worker on the new pair seats the re-signed key on the same Mac and refuses the old token (401)',
    actNew.status === 200 && actNewBody.machines === 1 && actOld.status === 401,
    `new ${actNew.status} (${actNewBody.machines} Macs), old ${actOld.status}`,
  );
}

// ── 15f. The owner's own address can hold test orders' keys too (the live KV does) ──
{
  const env15 = makeEnv();
  await postWebhook(env15, { event: 'order_created', email: 'owner@example.com', orderId: 'owner-pro-1', tier: 'pro', keyId: 'owner-pro-1' });
  await postWebhook(env15, { event: 'order_created', email: 'owner@example.com', orderId: 'test_order_a', tier: 'home' });
  await postWebhook(env15, { event: 'order_created', email: 'owner@example.com', orderId: 'test_order_b', tier: 'pro' });
  const kvAdapter = {
    list: async (prefix) => [...env15.LICENSE_KV.values.keys()].filter((k) => k.startsWith(prefix)),
    get: (n) => env15.LICENSE_KV.get(n),
    put: (n, v) => env15.LICENSE_KV.put(n, v),
    delete: (n) => env15.LICENSE_KV.delete(n),
  };
  const pair = await generatePair();
  const all = await rotate({ kv: kvAdapter, privateJwk: pair.privateJwk, publicJwk: pair.publicJwk, keepEmails: ['owner@example.com'] });
  await rotate({ kv: kvAdapter, privateJwk: pair.privateJwk, publicJwk: pair.publicJwk, keepEmails: ['owner@example.com'], keepIds: ['owner-pro-1'], apply: true });
  const left = JSON.parse(await env15.LICENSE_KV.get('keys:owner@example.com'));
  const remaining = [...env15.LICENSE_KV.values.keys()].sort();
  check(
    '15f. with --keep-id only the named licence of the owner\'s address is kept and re-signed; its test orders\' keys are deleted (without it all three would be kept)',
    all.resigned.length === 3 && left.length === 1 && left[0].id === 'owner-pro-1' &&
      remaining.join() === ['key:owner-pro-1', 'keys:owner@example.com'].join() && (await verifyLicenseKey(left[0].token, pair.publicJwk)).valid,
    `without: ${all.resigned.join()}; with: ${left.map((k) => k.id).join()}; KV ${remaining.join()}`,
  );
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
