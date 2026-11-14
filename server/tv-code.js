// Sign-in for a TV by a short code, served by the licence Worker (PLAN.md 12-tv-signin,
// 12-tv-apple).
//
// The coordinator's brief for the Apple TV app, 2026-11-08: the TV unlocks by code
// pairing. The TV shows a code, the player signs in on their phone, and this Worker
// checks the account holds Home or Pro. There is no purchase on the TV. A TV has no
// keyboard worth typing an email on and no browser to finish a Google sign-in in, so
// this is the device flow every streaming app uses (RFC 8628's shape): the TV asks for
// a code, shows it, and asks again every few seconds until a signed-in phone has
// claimed it.
//
//   POST /tv/code   {}                         → { userCode, deviceCode, expiresIn, interval }
//   POST /tv/claim  Bearer <Firebase ID token>, { userCode }  → { ok, tier }
//   POST /tv/poll   { userCode, deviceCode }   → { status: 'pending' | 'ok' | 'expired', pass? }
//   POST /tv/renew  { pass }                   → { ok, pass } or 401 when the key or the link is gone
//
// Two codes, not one, because the short code is read off a screen in a room full of
// people. Anyone who sees `BDKM-QXTZ` could claim it with their own account, which only
// gives that TV their licence (harmless to the owner of the TV), but nobody who sees it
// can collect what was claimed: that needs `deviceCode`, 32 random bytes that never leave
// the TV, of which the Worker keeps only a SHA-256 hash. The short code is eight letters
// from twenty consonants (no vowels, so it never spells a word; no letters that read as
// digits), 20^8 ≈ 2.6e10, alive for ten minutes, and a wrong claim spends a turn on the
// claimant's hourly allowance, so guessing a live code is not a plan.
//
// What the TV gets is a pass, not the licence key. The key (`cg1.…`) is what activates a
// Mac, two seats a key (`MAX_MACHINES_PER_KEY`), so a TV that held it would hold a seat's
// worth of power it never uses, and a TV is the device most likely to sit in a bar or a
// rented room. The pass is signed by the same Ed25519 key but under its own prefix,
// `cgtv1.`, so no check that opens the Mac app (which verifies `cg1.` signing inputs)
// ever accepts it, and it carries only what the TV needs: the key's id, its tier, and
// when the pass runs out. It lasts thirty days. The TV verifies it offline at every
// launch (a show in a room with no internet still plays) and renews it whenever it is
// online, and a renewal checks the key has not been refunded since. So a refund reaches
// the TV within thirty days and usually at its next launch, and a TV never takes a seat.
//
// Each pass is also filed, by a random id the pass carries, so a pass belongs to one TV
// and can be taken back. The review before this merged (2026-11-08) found two holes in a
// pass that only carried its key's id: copied off a TV it unlocked any number of TVs, and
// renewed forever, and the owner had no way to drop a lost TV short of refunding the key.
// So the record holds a generation number that every renewal moves on by one, and a pass
// renews only at its record's current generation. A copy and the TV it was copied from
// cannot both renew: the second to try finds the generation moved, and that is taken as
// the sign of a copy, so the record is deleted and neither renews again (the real TV shows
// its code and is linked again in a minute; the copy is dead). The same rule makes a
// renewal whose answer was lost on the way to the TV cost a re-link, which at one renewal
// in about three weeks is the price of copies dying. An account holds at most
// `TV_PASSES_PER_ACCOUNT` records; linking one more drops the oldest.
//
// KV layout:
//   `tvcode:<USERCODE>` → `{ h, state: 'pending' | 'claimed', at, keyId?, tier?, email? }`
//     with a ten-minute TTL, where `h` is the hex SHA-256 of the device code;
//   `tvpass:<id>` → `{ keyId, tier, email, issuedAt, gen }`, alive a day past the pass;
//   `tvpasses:<email>` → `[id, …]`, oldest first, for the cap (and later a list to unlink).

import { DEFAULT_PUBLIC_JWK } from './license-key.js';

export const TV_PREFIX = '/tv/';
export const TV_CODE_TTL_S = 600;
export const TV_POLL_INTERVAL_S = 5;
export const TV_PASS_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;
// Twenty consonants, no vowels and no Y: never a word, and nothing that reads as 0 or 1.
export const TV_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const MAX_BODY = 2048;
export const TV_PASSES_PER_ACCOUNT = 10;
const PASS_RECORD_TTL_S = (TV_PASS_DAYS + 1) * 24 * 3600;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  try {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares two hex hashes without stopping at the first difference, so how long a wrong
// device code takes to refuse says nothing about how much of it was right.
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A user code typed on a phone, as the key it is filed under: capitals, no dash or spaces. */
export function normalizeTvCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 8) return null;
  for (const ch of s) if (!TV_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

function newUserCode() {
  // 256 is not a multiple of 20, so bytes at or past 240 are thrown away rather than
  // folded in, which would make the first sixteen letters a little likelier.
  let out = '';
  while (out.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < 240 && out.length < 8) out += TV_CODE_ALPHABET[b % 20];
    }
  }
  return out;
}

/** Signs a TV pass: `cgtv1.<payload>.<sig>`, under the licence key's own Ed25519 key. */
export async function signTvPass(payload, privateJwk) {
  const bodyB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const input = `cgtv1.${bodyB64}`;
  const jwk = typeof privateJwk === 'string' ? JSON.parse(privateJwk) : privateJwk;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(input)));
  return `${input}.${toBase64Url(sig)}`;
}

/** Checks a TV pass's signature and dates. Returns its payload, or null. */
export async function verifyTvPass(pass, publicJwk, now = Date.now()) {
  if (typeof pass !== 'string') return null;
  const parts = pass.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'cgtv1') return null;
  const body = fromBase64Url(parts[1]);
  const sig = fromBase64Url(parts[2]);
  if (!body || !sig || sig.length !== 64) return null;
  try {
    const jwk = typeof publicJwk === 'string' ? JSON.parse(publicJwk) : publicJwk;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(`cgtv1.${parts[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(body));
    if (!p || typeof p.keyId !== 'string' || (p.tier !== 'home' && p.tier !== 'pro')) return null;
    if (typeof p.id !== 'string' || !Number.isInteger(p.gen)) return null;
    if (typeof p.exp !== 'number' || p.exp <= now) return null;
    return p;
  } catch {
    return null;
  }
}

async function readJsonBody(request, h) {
  const raw = await h.readCapped(request, MAX_BODY);
  if (raw == null) return { error: h.json({ error: 'too large' }, 413, h.cors) };
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
    return { body };
  } catch {
    return { error: h.json({ error: 'not JSON' }, 400, h.cors) };
  }
}

// The key a claim hands the TV: the account's live keys, Pro before Home, the newest
// first among equals. "Live" asks both places a refund is written: the email list's own
// flag and `key:<id>`, which is where a refund of an upgrade marks the older key.
async function bestKey(env, email, h) {
  const list = (await h.readEmailKeys(env, email)).filter((k) => k && !k.revoked && k.id);
  list.sort((a, b) => (b.tier === 'pro') - (a.tier === 'pro') || (b.issuedAt || 0) - (a.issuedAt || 0));
  for (const k of list) {
    if (k.tier !== 'home' && k.tier !== 'pro') continue;
    const stored = await h.readKeyById(env, k.id);
    if (stored?.revoked) continue;
    if (typeof k.exp === 'number' && k.exp <= Date.now()) continue;
    return k;
  }
  return null;
}

async function readJson(env, k) {
  try { const raw = await env.LICENSE_KV.get(k); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function issuePass(env, id, rec) {
  const now = Date.now();
  await env.LICENSE_KV.put(`tvpass:${id}`, JSON.stringify(rec), { expirationTtl: PASS_RECORD_TTL_S });
  return signTvPass(
    { v: 1, id, gen: rec.gen, keyId: rec.keyId, tier: rec.tier, issuedAt: now, exp: now + TV_PASS_DAYS * DAY_MS },
    env.LICENSE_PRIVATE_KEY,
  );
}

// A new TV on the account: filed on the account's list, and the oldest dropped (record
// and all, so its pass stops renewing) once the list is past the cap. Ids whose records
// have lapsed are pruned on the way.
async function linkPass(env, email, keyId, tier) {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const listKey = `tvpasses:${email}`;
  const old = await readJson(env, listKey);
  const ids = [];
  for (const x of Array.isArray(old) ? old : []) {
    if (typeof x === 'string' && (await env.LICENSE_KV.get(`tvpass:${x}`))) ids.push(x);
  }
  ids.push(id);
  while (ids.length > TV_PASSES_PER_ACCOUNT) await env.LICENSE_KV.delete(`tvpass:${ids.shift()}`);
  await env.LICENSE_KV.put(listKey, JSON.stringify(ids));
  return issuePass(env, id, { keyId, tier, email, issuedAt: Date.now(), gen: 1 });
}

/**
 * Answers every `/tv/…` route. `h` carries the Worker's own helpers so this file does
 * not copy them: `json`, `readCapped`, `cors`, `verifyFirebaseIdToken`, `readEmailKeys`,
 * `readKeyById`, `takeTurn(kind, who, limitSetting, fallback)` (seconds to wait, or 0),
 * `tooMany(seconds)` and `addressOf()`.
 */
export async function handleTv(request, env, url, h) {
  if (request.method !== 'POST') return h.json({ error: 'POST only' }, 405, h.cors);
  const route = url.pathname.slice(TV_PREFIX.length);

  if (route === 'code') {
    const wait = await h.takeTurn('tvcode', h.addressOf(), env.TV_CODE_PER_HOUR, 30);
    if (wait) return h.tooMany(wait);
    const deviceCode = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256Hex(deviceCode);
    // A fresh code that happens to be live already is drawn again rather than written over.
    let userCode = newUserCode();
    for (let i = 0; i < 4 && (await env.LICENSE_KV.get(`tvcode:${userCode}`)); i++) userCode = newUserCode();
    await env.LICENSE_KV.put(
      `tvcode:${userCode}`,
      JSON.stringify({ h: hash, state: 'pending', at: Date.now() }),
      { expirationTtl: TV_CODE_TTL_S },
    );
    return h.json(
      {
        ok: true,
        userCode: `${userCode.slice(0, 4)}-${userCode.slice(4)}`,
        deviceCode,
        expiresIn: TV_CODE_TTL_S,
        interval: TV_POLL_INTERVAL_S,
      },
      200,
      h.cors,
    );
  }

  if (route === 'claim') {
    const auth = /^Bearer\s+(.+)$/i.exec((request.headers.get('Authorization') || '').trim());
    if (!auth) return h.json({ error: 'unauthorised' }, 401, h.cors);
    const who = await h.verifyFirebaseIdToken(auth[1].trim(), env);
    if (!who) return h.json({ error: 'unauthorised' }, 401, h.cors);
    const { body, error } = await readJsonBody(request, h);
    if (error) return error;
    const code = normalizeTvCode(body.userCode);
    if (!code) return h.json({ ok: false, error: 'bad code' }, 400, h.cors);
    const raw = await env.LICENSE_KV.get(`tvcode:${code}`);
    let rec = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
    if (!rec || rec.state !== 'pending') {
      // Only a miss spends a turn: a player retyping a code they misread should not be
      // locked out by their own right answer, but a hundred misses an hour is a search.
      const wait = await h.takeTurn('tvclaim', who.email, env.TV_CLAIM_MISSES_PER_HOUR, 20);
      if (wait) return h.tooMany(wait);
      return h.json({ ok: false, error: 'no such code' }, 404, h.cors);
    }
    const key = await bestKey(env, who.email, h);
    if (!key) return h.json({ ok: false, error: 'no licence', needs: 'home' }, 403, h.cors);
    const left = Math.max(60, TV_CODE_TTL_S - Math.floor((Date.now() - (rec.at || 0)) / 1000));
    await env.LICENSE_KV.put(
      `tvcode:${code}`,
      JSON.stringify({ ...rec, state: 'claimed', keyId: key.id, tier: key.tier, email: who.email }),
      { expirationTtl: left },
    );
    return h.json({ ok: true, tier: key.tier }, 200, h.cors);
  }

  if (route === 'poll') {
    const { body, error } = await readJsonBody(request, h);
    if (error) return error;
    // A TV waiting on its code polls every five seconds for ten minutes, 120 times, so
    // 1440 an hour is a dozen TVs pairing behind one address (a venue's Wi-Fi) and still
    // stops a loop spending KV reads for nothing.
    const wait = await h.takeTurn('tvpoll', h.addressOf(), env.TV_POLL_PER_HOUR, 1440);
    if (wait) return h.tooMany(wait);
    const code = normalizeTvCode(body.userCode);
    if (!code || typeof body.deviceCode !== 'string') return h.json({ ok: false, error: 'bad code' }, 400, h.cors);
    const raw = await env.LICENSE_KV.get(`tvcode:${code}`);
    let rec = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
    // A code that has run out and a device code that does not match answer the same, so
    // polling tells a stranger nothing about which codes are live.
    if (!rec || !sameHex(rec.h, await sha256Hex(body.deviceCode))) {
      return h.json({ ok: true, status: 'expired' }, 200, h.cors);
    }
    if (rec.state !== 'claimed') return h.json({ ok: true, status: 'pending' }, 200, h.cors);
    // Handed out once, as far as KV allows: the record goes before the pass is returned, so
    // a later poll with the same codes (a replay, or the TV retrying after a dropped answer)
    // gets 'expired' and starts over with a new code. KV is eventually consistent, so two
    // polls in the same instant from different places could both read 'claimed' before the
    // delete reaches them; only the TV holds the device code, so that is the TV linking
    // itself twice, which the account's cap absorbs.
    await env.LICENSE_KV.delete(`tvcode:${code}`);
    const pass = await linkPass(env, rec.email || '', rec.keyId, rec.tier);
    return h.json({ ok: true, status: 'ok', tier: rec.tier, pass }, 200, h.cors);
  }

  if (route === 'renew') {
    const { body, error } = await readJsonBody(request, h);
    if (error) return error;
    const wait = await h.takeTurn('tvrenew', h.addressOf(), env.TV_RENEW_PER_HOUR, 60);
    if (wait) return h.tooMany(wait);
    const p = await verifyTvPass(body.pass, env.LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_JWK);
    if (!p) return h.json({ ok: false, error: 'bad pass' }, 401, h.cors);
    const rec = await readJson(env, `tvpass:${p.id}`);
    if (!rec) return h.json({ ok: false, error: 'unlinked' }, 401, h.cors);
    if (rec.gen !== p.gen) {
      // Two passes from one link: a copy. Neither renews again (see the top of this file).
      await env.LICENSE_KV.delete(`tvpass:${p.id}`);
      return h.json({ ok: false, error: 'unlinked' }, 401, h.cors);
    }
    let keyId = rec.keyId;
    let stored = await h.readKeyById(env, keyId);
    if (!stored || stored.revoked) {
      // A refund of an upgrade revokes the Pro key and files the Home again under a new
      // id (license-worker.js), so a dead key is not yet a dead account: the TV moves to
      // the account's best live key, and only an account with none stops renewing.
      const next = rec.email ? await bestKey(env, rec.email, h) : null;
      if (!next) {
        await env.LICENSE_KV.delete(`tvpass:${p.id}`);
        return h.json({ ok: false, error: 'key revoked' }, 401, h.cors);
      }
      keyId = next.id;
      stored = next;
    }
    // The tier comes from the key on file, so a Home key upgraded in place renews as Pro.
    const tier = stored.tier === 'pro' || stored.tier === 'home' ? stored.tier : rec.tier;
    const pass = await issuePass(env, p.id, { ...rec, keyId, tier, gen: rec.gen + 1 });
    return h.json({ ok: true, tier, pass }, 200, h.cors);
  }

  return h.json({ error: 'not found' }, 404, h.cors);
}
