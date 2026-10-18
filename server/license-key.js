// Signed ChromaGlass licence keys (PLAN.md §23: 23.3, 23.4, 23.12).
//
// Format:
//   cg1.<base64url(payload JSON)>.<base64url(Ed25519 signature)>
//
// The signature covers the ASCII bytes of "cg1.<base64url(payload JSON)>" and
// is verified against the built-in Ed25519 public key (or an override passed in
// env), so the Mac app, the song-ID Worker and the web app can verify a key
// with no network call at the gig.

export const DEFAULT_PUBLIC_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  alg: 'Ed25519',
  ext: true,
  key_ops: ['verify'],
  x: 'ahOve0fG1aWiqxfwUmRwko0kZG8YziKy3y3ROjd7pgw',
};

export const MAX_MACHINES_PER_KEY = 2;
export const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

function toBase64Url(bytes) {
  let bin = '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

let cachedVerifyKey = null;
let cachedVerifyJwkStr = '';

async function getVerifyKey(
  publicJwk = (typeof process !== 'undefined' && process.env?.LICENSE_PUBLIC_KEY) || DEFAULT_PUBLIC_JWK,
) {
  const jwk = typeof publicJwk === 'string' ? JSON.parse(publicJwk) : publicJwk;
  const str = JSON.stringify(jwk);
  if (cachedVerifyKey && cachedVerifyJwkStr === str) return cachedVerifyKey;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
  cachedVerifyKey = key;
  cachedVerifyJwkStr = str;
  return key;
}

export async function signLicenseKey(payload, privateJwk) {
  if (!privateJwk) {
    throw new Error('LICENSE_PRIVATE_KEY is required to sign a licence key');
  }
  const now = typeof payload?.issuedAt === 'number' ? payload.issuedAt : Date.now();
  const normalized = {
    id: String(payload?.id || `cgk_${now.toString(36)}`),
    tier: payload?.tier === 'pro' ? 'pro' : 'home',
    email: String(payload?.email || 'licensed@chromaglass.app').trim().toLowerCase(),
    issuedAt: now,
    updatesUntil: typeof payload?.updatesUntil === 'number' ? payload.updatesUntil : now + ONE_YEAR_MS,
    maxMachines: typeof payload?.maxMachines === 'number' ? payload.maxMachines : MAX_MACHINES_PER_KEY,
    ...(typeof payload?.exp === 'number' ? { exp: payload.exp } : {}),
    ...(payload?.upgradeFrom ? { upgradeFrom: String(payload.upgradeFrom) } : {}),
  };
  const bodyB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(normalized)));
  const signingInput = `cg1.${bodyB64}`;
  const jwk = typeof privateJwk === 'string' ? JSON.parse(privateJwk) : privateJwk;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${toBase64Url(sig)}`;
}

export async function verifyLicenseKey(token, publicJwk) {
  if (typeof token !== 'string') return { valid: false, error: 'missing key' };
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'cg1') {
    return { valid: false, error: 'malformed key' };
  }
  const [, bodyB64, sigB64] = parts;
  const bodyBytes = fromBase64Url(bodyB64);
  const sigBytes = fromBase64Url(sigB64);
  if (!bodyBytes || !sigBytes || sigBytes.length !== 64) {
    return { valid: false, error: 'bad encoding' };
  }

  try {
    const key = await getVerifyKey(publicJwk);
    const signingInput = new TextEncoder().encode(`cg1.${bodyB64}`);
    const ok = await crypto.subtle.verify('Ed25519', key, sigBytes, signingInput);
    if (!ok) return { valid: false, error: 'invalid-signature' };
  } catch {
    return { valid: false, error: 'invalid-signature' };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { valid: false, error: 'invalid payload' };
  }

  if (!payload || typeof payload !== 'object') return { valid: false, error: 'invalid payload' };
  if (payload.tier !== 'home' && payload.tier !== 'pro') return { valid: false, error: 'invalid tier' };
  if (typeof payload.id !== 'string' || !payload.id) return { valid: false, error: 'missing key id' };
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return { valid: false, error: 'missing email' };
  if (typeof payload.exp === 'number' && payload.exp <= Date.now()) {
    return { valid: false, error: 'expired' };
  }

  const normalizedPayload = {
    id: payload.id,
    tier: payload.tier,
    email: payload.email.toLowerCase(),
    issuedAt: Number(payload.issuedAt) || 0,
    updatesUntil: Number(payload.updatesUntil) || 0,
    maxMachines: Number(payload.maxMachines) || MAX_MACHINES_PER_KEY,
    ...(typeof payload.exp === 'number' ? { exp: payload.exp } : {}),
    ...(payload.upgradeFrom ? { upgradeFrom: String(payload.upgradeFrom) } : {}),
  };

  return {
    valid: true,
    id: normalizedPayload.id,
    tier: normalizedPayload.tier,
    email: normalizedPayload.email,
    exp: typeof payload.exp === 'number' ? payload.exp : null,
    payload: normalizedPayload,
  };
}
