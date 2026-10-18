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
 */

import worker from '../server/license-worker.js';
import { verifyLicenseKey } from '../server/license-key.js';

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
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg, typ: 'JWT', kid })));
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: 'https://securetoken.google.com/chromaglass',
        aud: 'chromaglass',
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

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
