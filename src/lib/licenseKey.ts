// Client-side Ed25519 licence key verification and state (PLAN.md §23: 23.2, 23.4, 23.5, 23.6, 23.11, 23.12).

export type LicenseTier = 'free' | 'home' | 'pro';

export interface LicensePayload {
  id: string;
  tier: 'home' | 'pro';
  email: string;
  issuedAt: number;
  updatesUntil: number;
  maxMachines: number;
  exp?: number;
  upgradeFrom?: string;
}

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  token: string | null;
  payload: LicensePayload | null;
  email: string | null;
  id: string | null;
  machines?: number;
  maxMachines?: number;
  error?: string;
}

const STORAGE_KEY_TOKEN = 'chromaglass:license-key';

export const DEFAULT_PUBLIC_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  alg: 'Ed25519',
  ext: true,
  key_ops: ['verify'],
  x: 'E_OrBzBgNWzoKgdlDOVjCjqb6CvkE4L0olobNv2u96A',
};

function fromBase64Url(str: string): Uint8Array | null {
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

let cachedVerifyKey: CryptoKey | null = null;
let cachedVerifyJwkX: string | null = null;

async function getVerifyKey(): Promise<CryptoKey> {
  const override = (globalThis as { __cgTestLicensePublicKey?: JsonWebKey }).__cgTestLicensePublicKey;
  const jwk = override ?? DEFAULT_PUBLIC_JWK;
  if (cachedVerifyKey && cachedVerifyJwkX === (jwk.x ?? null)) return cachedVerifyKey;
  cachedVerifyKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  cachedVerifyJwkX = jwk.x ?? null;
  return cachedVerifyKey;
}

export async function verifyLicenseKey(
  token: string,
): Promise<{ valid: true; payload: LicensePayload } | { valid: false; error: string }> {
  if (typeof token !== 'string') return { valid: false, error: 'missing-key' };
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'cg1') {
    return { valid: false, error: 'malformed-key' };
  }
  const [, bodyB64, sigB64] = parts;
  const bodyBytes = fromBase64Url(bodyB64);
  const sigBytes = fromBase64Url(sigB64);
  if (!bodyBytes || !sigBytes || sigBytes.length !== 64) {
    return { valid: false, error: 'malformed-encoding' };
  }

  try {
    const key = await getVerifyKey();
    const signingInput = new TextEncoder().encode(`cg1.${bodyB64}`);
    const ok = await crypto.subtle.verify('Ed25519', key, sigBytes as BufferSource, signingInput);
    if (!ok) return { valid: false, error: 'invalid-signature' };
  } catch {
    return { valid: false, error: 'invalid-signature' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { valid: false, error: 'invalid-payload' };
  }

  if (!payload || typeof payload !== 'object') return { valid: false, error: 'invalid-payload' };
  if (payload.tier !== 'home' && payload.tier !== 'pro') return { valid: false, error: 'invalid-tier' };
  if (typeof payload.id !== 'string' || !payload.id) return { valid: false, error: 'missing-id' };
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return { valid: false, error: 'missing-email' };
  if (typeof payload.exp === 'number' && payload.exp <= Date.now()) {
    return { valid: false, error: 'expired' };
  }

  return {
    valid: true,
    payload: {
      id: payload.id,
      tier: payload.tier,
      email: payload.email.toLowerCase(),
      issuedAt: Number(payload.issuedAt) || 0,
      updatesUntil: Number(payload.updatesUntil) || 0,
      maxMachines: Number(payload.maxMachines) || 2,
      ...(typeof payload.exp === 'number' ? { exp: payload.exp } : {}),
      ...(typeof payload.upgradeFrom === 'string' ? { upgradeFrom: payload.upgradeFrom } : {}),
    },
  };
}

const FREE_STATUS: LicenseStatus = {
  valid: false,
  tier: 'free',
  token: null,
  payload: null,
  email: null,
  id: null,
};

// In-memory state populated ONLY after `verifyLicenseKey` verifies the Ed25519
// signature of a `cg1.` token. Plain strings in `localStorage` are never trusted
// without cryptographic verification.
let verifiedState: LicenseStatus = FREE_STATUS;
let pendingVerification: Promise<LicenseStatus> | null = null;

function notifyLicenseChanged(status: LicenseStatus): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('chromaglass:license-changed', {
        detail: { tier: status.tier, payload: status.payload },
      }),
    );
    window.dispatchEvent(new Event('cg-license-changed'));
  } catch {
    // ignore
  }
}

function recordVerifiedLicense(
  token: string,
  payload: LicensePayload,
  machines?: number,
  maxMachines?: number,
): LicenseStatus {
  const trimmed = token.trim();
  verifiedState = {
    valid: true,
    tier: payload.tier,
    token: trimmed,
    payload,
    email: payload.email,
    id: payload.id,
    machines,
    maxMachines: maxMachines ?? payload.maxMachines,
  };
  try {
    localStorage.setItem(STORAGE_KEY_TOKEN, trimmed);
  } catch {
    // ignore storage errors
  }
  notifyLicenseChanged(verifiedState);
  return verifiedState;
}

export function hasStoredLicenseTokenSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOKEN);
    return typeof raw === 'string' && raw.trim().startsWith('cg1.');
  } catch {
    return false;
  }
}

export async function verifyStoredLicense(): Promise<LicenseStatus> {
  if (typeof window === 'undefined') return FREE_STATUS;
  let storedToken: string | null = null;
  try {
    storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    storedToken = null;
  }
  if (!storedToken || !storedToken.trim()) {
    verifiedState = FREE_STATUS;
    return FREE_STATUS;
  }
  const trimmed = storedToken.trim();
  if (verifiedState.valid && verifiedState.token === trimmed && verifiedState.payload) {
    if (typeof verifiedState.payload.exp === 'number' && verifiedState.payload.exp <= Date.now()) {
      clearCachedLicense();
      return { ...FREE_STATUS, error: 'expired' };
    }
    return verifiedState;
  }
  const res = await verifyLicenseKey(trimmed);
  if (!res.valid) {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    } catch {
      // ignore
    }
    verifiedState = { ...FREE_STATUS, error: res.error };
    notifyLicenseChanged(verifiedState);
    return verifiedState;
  }
  return recordVerifiedLicense(trimmed, res.payload);
}

if (typeof window !== 'undefined' && hasStoredLicenseTokenSync()) {
  pendingVerification = verifyStoredLicense();
}

export function getCachedLicenseStatus(): LicenseStatus {
  if (!verifiedState.valid || !verifiedState.payload) {
    return verifiedState;
  }
  if (typeof verifiedState.payload.exp === 'number' && verifiedState.payload.exp <= Date.now()) {
    verifiedState = { ...FREE_STATUS, error: 'expired' };
    return verifiedState;
  }
  return verifiedState;
}

export function clearCachedLicense(): void {
  verifiedState = FREE_STATUS;
  pendingVerification = null;
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  } catch {
    // ignore
  }
  notifyLicenseChanged(FREE_STATUS);
}

/**
 * Take a refunded key off this machine from its next start (PLAN.md 23.17d,
 * `heldKeyRefunded` in accountLicense.ts): out of this browser's storage and
 * out of the show server's file, which is what the Mac app reads at launch.
 *
 * Not out of what this page already verified. The never-lock-out rule (PLAN.md
 * 23.10): nothing an account says takes a running show down, so a set that
 * started licensed finishes licensed, and the next start meets the gate.
 */
export async function retireStoredLicenseKey(id: string | null): Promise<void> {
  if (!id) return;
  // Each copy only if it is that key: the browser can hold one key and the
  // server another, and the server's deactivate empties whatever is active,
  // so it is asked only when its own active key is the one retired (the
  // review of #494).
  if (verifiedState.id === id) {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    } catch {
      // ignore
    }
  }
  try {
    const info = (await (await fetch('/license-info.json', { cache: 'no-store' })).json()) as { id?: string | null; key?: string | null };
    if (info?.id === id && info.key) {
      await fetch('/license-deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: info.key }),
      });
    }
  } catch {
    // No show server (the website): the browser's copy was all there was.
  }
}

export async function activateLocalLicenseKey(token: string): Promise<LicenseStatus> {
  const res = await verifyLicenseKey(token);
  if (!res.valid) {
    return { ...FREE_STATUS, error: res.error };
  }
  let machines = 1;
  let maxMachines = res.payload.maxMachines;
  try {
    const srv = await fetch('/license-activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: token.trim() }),
    });
    if (srv.ok) {
      const body = (await srv.json()) as {
        ok?: boolean;
        error?: string;
        machines?: string[] | number;
        maxMachines?: number;
      };
      if (body.ok === false) {
        return {
          ...FREE_STATUS,
          error: body.error || 'invalid-signature',
        };
      }
      if (Array.isArray(body.machines)) machines = body.machines.length;
      else if (typeof body.machines === 'number') machines = body.machines;
      if (typeof body.maxMachines === 'number') maxMachines = body.maxMachines;
    } else if (srv.status === 409 || srv.status === 403 || srv.status === 400) {
      const body = (await srv.json().catch(() => ({}))) as { error?: string };
      return {
        ...FREE_STATUS,
        error: body.error || 'machine-limit',
      };
    }
  } catch {
    // No local show server (pure static web): local Ed25519 verification stands.
  }
  return recordVerifiedLicense(token.trim(), res.payload, machines, maxMachines);
}

export async function deactivateLocalLicenseKey(): Promise<void> {
  try {
    await fetch('/license-deactivate', { method: 'POST' });
  } catch {
    // ignore
  }
  clearCachedLicense();
}

export async function syncServerLicense(): Promise<LicenseStatus> {
  try {
    const res = await fetch('/license-info.json', { cache: 'no-store' });
    if (res.ok) {
      const info = (await res.json()) as {
        valid?: boolean;
        tier?: LicenseTier;
        key?: string | null;
        token?: string | null;
        payload?: LicensePayload | null;
        machines?: string[] | number;
        maxMachines?: number;
        error?: string;
      };
      const rawKey = info.key ?? info.token ?? null;
      if (info.valid && rawKey) {
        const verified = await verifyLicenseKey(rawKey);
        if (verified.valid) {
          const machineCount = Array.isArray(info.machines) ? info.machines.length : info.machines;
          return recordVerifiedLicense(rawKey, verified.payload, machineCount, info.maxMachines);
        }
      }
      if (info.valid === false && info.error) {
        clearCachedLicense();
        return { ...FREE_STATUS, error: info.error };
      }
    }
  } catch {
    // Static web host without /license-info.json
  }
  if (pendingVerification) {
    await pendingVerification;
  }
  return verifyStoredLicense();
}
