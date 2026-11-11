/**
 * The Mac app's sign-in, carried from the browser back to the app's window
 * (PLAN.md 23.17f).
 *
 * Google refuses to sign in inside an embedded browser, and the Mac app opens
 * every outside address in the real browser (desktop/main.js), so Google's and
 * Apple's buttons in the app send the person to their browser, at the app's own
 * server (`/show?macSignIn=1`), and the sign-in happens there. Until this file
 * only the account's licence key came back (the browser filed it with
 * `/license-activate`): the window opened the show but stayed signed out, so
 * the Account sheet said "You're not signed in" over a Pro key, offered the
 * sign-in again, and the account's cloud sync and running shows never reached
 * the app (the owner, 2026-11-10, on 1.3.1276: "this login stuff is fucked").
 *
 * Now the browser also hands over the provider's credential, the same
 * Google or Apple ID token Firebase's own sign-in just received, and the window
 * signs in with it (`signInWithCredential`, Firebase's documented way to sign
 * in with a token from elsewhere). It travels the shortest road there is: the
 * browser and the window are both pages of this server on this Mac, so the
 * browser posts it here and the window takes it.
 *
 * Why it is safe to hold for a moment, and how little it is held:
 *
 * - Only the laptop reaches these routes (`isLaptop`: a loopback socket and a
 *   loopback Host, so a phone on the Wi-Fi is refused and a page that rebinds
 *   its own name to 127.0.0.1 is too), and only a page of this server
 *   (`fromAnotherSite`): another site's page in the same browser cannot read
 *   or post. A request with no browser headers (a script on this Mac) is let
 *   through as the licence routes let it, since anything running as the owner
 *   could read the app's own storage anyway.
 * - It is filed under a one-time code the window made and put in the address
 *   it opened (`?h=`), so the window takes only its own sign-in, never a stale
 *   one or another window's. The code is random, 128 bits, and lives only in
 *   that address and this server's memory.
 * - It is taken once: the first read deletes it. It is never written to disk,
 *   and it expires after two minutes either way. A Google ID token lives for an
 *   hour, so the window has long enough and a leftover is useless soon after.
 * - At most a few wait at once, so a loop posting codes cannot grow the map.
 */

import { fromAnotherSite, saysJson } from './server-license.js';

export const SIGNIN_HANDOFF_PATH = '/signin-handoff';

/** How long a credential waits for its window before it is dropped. */
export const HANDOFF_TTL_MS = 120_000;
/** How many sign-ins may wait at once; the oldest goes first. */
const MAX_WAITING = 4;
/** A credential is a few hundred bytes of JSON; an Apple or Google token under 4 KB. */
const MAX_BODY_BYTES = 16 * 1024;
/** The window's one-time code: url-safe, long enough that nobody guesses it. */
const CODE = /^[A-Za-z0-9_-]{22,64}$/;

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * The provider's credential as Firebase's `OAuthCredential.toJSON()` writes it,
 * with nothing else let through: the provider must be Google or Apple, and it
 * must carry a token. The window rebuilds it with `OAuthCredential.fromJSON`.
 */
function cleanCredential(c) {
  if (!c || typeof c !== 'object') return null;
  const providerId = c.providerId;
  if (providerId !== 'google.com' && providerId !== 'apple.com') return null;
  const out = { providerId, signInMethod: providerId };
  for (const k of ['idToken', 'accessToken', 'nonce', 'pendingToken']) {
    if (typeof c[k] === 'string' && c[k] && c[k].length < 8192) out[k] = c[k];
  }
  if (!out.idToken && !out.accessToken && !out.pendingToken) return null;
  return out;
}

export function createSignInHandoff({ now = () => Date.now() } = {}) {
  /** code → { credential, at } */
  const waiting = new Map();

  const prune = () => {
    const t = now();
    for (const [code, v] of waiting) if (t - v.at > HANDOFF_TTL_MS) waiting.delete(code);
  };

  async function handleRequest(req, res, url, isLaptopReq) {
    if (!isLaptopReq) return send(res, 403, { error: 'laptop only' });
    if (fromAnotherSite(req)) return send(res, 403, { error: 'cross-site' });
    prune();

    if (req.method === 'POST') {
      if (!saysJson(req)) return send(res, 415, { ok: false, error: 'json-only' });
      let body;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 400, { ok: false, error: 'invalid-json' });
      }
      const code = typeof body?.h === 'string' ? body.h : '';
      const credential = cleanCredential(body?.credential);
      if (!CODE.test(code) || !credential) return send(res, 400, { ok: false, error: 'bad-handoff' });
      waiting.delete(code);
      while (waiting.size >= MAX_WAITING) waiting.delete(waiting.keys().next().value);
      waiting.set(code, { credential, at: now() });
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET') {
      const code = url.searchParams.get('h') ?? '';
      if (!CODE.test(code)) return send(res, 400, { error: 'bad-code' });
      const v = waiting.get(code);
      if (!v) return send(res, 200, { pending: true });
      waiting.delete(code);
      return send(res, 200, { credential: v.credential });
    }

    return send(res, 405, { error: 'method not allowed' });
  }

  return { handleRequest, size: () => waiting.size };
}
