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
const STORAGE_KEY_PAYLOAD = 'chromaglass:license-payload';
const STORAGE_KEY_TIER = 'chromaglass-license-tier';

export const DEFAULT_PUBLIC_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  alg: 'Ed25519',
  ext: true,
  key_ops: ['verify'],
  x: 'ahOve0fG1aWiqxfwUmRwko0kZG8YziKy3y3ROjd7pgw',
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

async function getVerifyKey(): Promise<CryptoKey> {
  if (cachedVerifyKey) return cachedVerifyKey;
  cachedVerifyKey = await crypto.subtle.importKey(
    'jwk',
    DEFAULT_PUBLIC_JWK,
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
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

export function getCachedLicenseStatus(): LicenseStatus {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const raw = localStorage.getItem(STORAGE_KEY_PAYLOAD);
    if (!token || !raw) {
      return { valid: false, tier: 'free', token: null, payload: null, email: null, id: null };
    }
    const payload = JSON.parse(raw) as LicensePayload;
    if (payload && (payload.tier === 'home' || payload.tier === 'pro')) {
      if (typeof payload.exp === 'number' && payload.exp <= Date.now()) {
        return { valid: false, tier: 'free', token: null, payload: null, email: null, id: null, error: 'expired' };
      }
      return {
        valid: true,
        tier: payload.tier,
        token,
        payload,
        email: payload.email ?? null,
        id: payload.id ?? null,
        maxMachines: payload.maxMachines,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { valid: false, tier: 'free', token: null, payload: null, email: null, id: null };
}

export function setCachedLicense(token: string, payload: LicensePayload): void {
  try {
    localStorage.setItem(STORAGE_KEY_TOKEN, token.trim());
    localStorage.setItem(STORAGE_KEY_PAYLOAD, JSON.stringify(payload));
    localStorage.setItem(STORAGE_KEY_TIER, payload.tier);
    window.dispatchEvent(new CustomEvent('chromaglass:license-changed', { detail: { tier: payload.tier, payload } }));
    window.dispatchEvent(new Event('cg-license-changed'));
  } catch {
    // ignore
  }
}

export function clearCachedLicense(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_PAYLOAD);
    localStorage.removeItem(STORAGE_KEY_TIER);
    window.dispatchEvent(new CustomEvent('chromaglass:license-changed', { detail: { tier: 'free', payload: null } }));
    window.dispatchEvent(new Event('cg-license-changed'));
  } catch {
    // ignore
  }
}

export async function activateLocalLicenseKey(token: string): Promise<LicenseStatus> {
  const res = await verifyLicenseKey(token);
  if (!res.valid) {
    return { valid: false, tier: 'free', token: null, payload: null, email: null, id: null, error: res.error };
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
          valid: false,
          tier: 'free',
          token: null,
          payload: null,
          email: null,
          id: null,
          error: body.error || 'invalid-signature',
        };
      }
      if (Array.isArray(body.machines)) machines = body.machines.length;
      else if (typeof body.machines === 'number') machines = body.machines;
      if (typeof body.maxMachines === 'number') maxMachines = body.maxMachines;
    } else if (srv.status === 409 || srv.status === 403 || srv.status === 400) {
      const body = (await srv.json().catch(() => ({}))) as { error?: string };
      return {
        valid: false,
        tier: 'free',
        token: null,
        payload: null,
        email: null,
        id: null,
        error: body.error || 'machine-limit',
      };
    }
  } catch {
    // No local show server (pure static web): local verification stands.
  }
  setCachedLicense(token.trim(), res.payload);
  return {
    valid: true,
    tier: res.payload.tier,
    token: token.trim(),
    payload: res.payload,
    email: res.payload.email,
    id: res.payload.id,
    machines,
    maxMachines,
  };
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
          setCachedLicense(rawKey, verified.payload);
          return {
            valid: true,
            tier: verified.payload.tier,
            token: rawKey,
            payload: verified.payload,
            email: verified.payload.email,
            id: verified.payload.id,
            machines: Array.isArray(info.machines) ? info.machines.length : info.machines,
            maxMachines: info.maxMachines,
          };
        }
      }
      if (info.valid === false && info.error) {
        clearCachedLicense();
        return { valid: false, tier: 'free', token: null, payload: null, email: null, id: null, error: info.error };
      }
    }
  } catch {
    // Static web host without /license-info.json
  }
  return getCachedLicenseStatus();
}
