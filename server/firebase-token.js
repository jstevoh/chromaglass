/**
 * Firebase ID tokens, checked properly: signature, project, issuer and time
 * (PLAN.md 23.14-verify). Plain WebCrypto, so it runs the same in Node (the show
 * server, server/remote-server.js) and in a Cloudflare Worker.
 *
 * Found 2026-10-24 (the review of #460): server/account-shows.js decoded a
 * token's payload and trusted it. It never checked the signature, so anyone on
 * the venue's Wi-Fi could write `{"sub":"<someone's uid>"}` into a token of their
 * own, base64 it, and be handed that account's running shows with their show
 * keys, which drive the plate. It also took any project's audience, so a token
 * Google signed for some other Firebase app was as good as one of ours.
 *
 * The keys come from Google's endpoint for exactly these tokens and are held for
 * as long as Google says (its max-age, about five hours when measured), the way
 * #460 does it in the licence Worker: a token naming a key not held fetches again
 * (Google has rotated), every attempt counts toward a once-a-minute limit, and
 * concurrent checks share the one fetch in flight, so made-up key ids or Google
 * being down cannot turn into a stream of fetches. A show server that has never
 * reached Google holds no keys and lists no shows; the QR code on Phone · iPad
 * still links a phone without the account, as it always has.
 *
 * `env.GOOGLE_JWKS` overrides the keys, for checks that sign their own tokens.
 * `env.FIREBASE_AUTH_EMULATOR` (the licence Worker's name for the same switch)
 * allows the Auth emulator's unsigned tokens, and only then: `npm run accountlink`
 * sets it on the server it starts; nothing else does.
 */

export const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const JWKS_MIN_REFETCH_MS = 60_000;
/** A token issued this far in Google's future is refused: a clock that wrong is not a clock. */
const SKEW_S = 300;
/** A token that has just expired still counts for half a minute, as account-shows.js always allowed. */
const EXPIRY_GRACE_S = 30;

const jwksCache = { keys: [], until: 0, triedAt: 0 };
let jwksInFlight = null;

function fromBase64Url(str) {
  try {
    const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function decodeJson(part) {
  const bytes = fromBase64Url(part);
  if (!bytes) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

async function googleKeys(env, kid) {
  if (env.GOOGLE_JWKS) {
    const parsed = typeof env.GOOGLE_JWKS === 'string' ? JSON.parse(env.GOOGLE_JWKS) : env.GOOGLE_JWKS;
    return Array.isArray(parsed) ? parsed : parsed?.keys ?? [];
  }
  const now = Date.now();
  if (jwksCache.keys.some((k) => k.kid === kid) && now < jwksCache.until) return jwksCache.keys;
  if (jwksInFlight) return jwksInFlight;
  if (now - jwksCache.triedAt < JWKS_MIN_REFETCH_MS) return jwksCache.keys;
  jwksCache.triedAt = now;
  jwksInFlight = (async () => {
    try {
      const res = await fetch(GOOGLE_JWKS_URL);
      if (!res.ok) return jwksCache.keys;
      const body = await res.json();
      const keys = Array.isArray(body?.keys) ? body.keys : [];
      if (!keys.length) return jwksCache.keys;
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
      jwksCache.keys = keys;
      jwksCache.until = now + Math.min(maxAge, 6 * 3600) * 1000;
    } catch {
      // Google out of reach: the keys already held, if any, still verify.
    }
    return jwksCache.keys;
  })().finally(() => { jwksInFlight = null; });
  return jwksInFlight;
}

/**
 * The account behind a Firebase ID token, or null. `env.FIREBASE_PROJECT_ID`
 * names the project (default `chromaglass`).
 */
export async function verifyFirebaseToken(token, env = {}, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (!header || !payload) return null;

  const project = env.FIREBASE_PROJECT_ID || 'chromaglass';
  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - EXPIRY_GRACE_S) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + SKEW_S) return null;
  if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) return null;
  const uid = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!uid || uid.length > 128) return null;
  // `emailVerified`: Firebase signs anyone up with any address and a password,
  // so an address is the account's only when the token says it was proved.
  const who = { uid, aud: project, email: typeof payload.email === 'string' ? payload.email : null, emailVerified: payload.email_verified === true };

  if (header.alg === 'none') return env.FIREBASE_AUTH_EMULATOR ? who : null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null;
  const sig = fromBase64Url(parts[2]);
  if (!sig || !sig.length) return null;
  const keys = await googleKeys(env, header.kid);
  const jwk = Array.isArray(keys) ? keys.find((k) => k.kid === header.kid) : null;
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return ok ? who : null;
  } catch {
    return null;
  }
}
