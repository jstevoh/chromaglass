import React, { useState } from 'react';

interface LicenseGateProps {
  onUnlocked: () => void;
}

const DEFAULT_PUBLIC_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  alg: 'Ed25519',
  ext: true,
  key_ops: ['verify'],
  x: 'ahOve0fG1aWiqxfwUmRwko0kZG8YziKy3y3ROjd7pgw',
};

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function activateKeyInGate(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  const trimmed = token.trim();
  const m = /^cg1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(trimmed);
  if (!m) return { valid: false, error: 'malformed' };
  let payload: { id?: string; tier?: string; email?: string; exp?: number };
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(m[1])));
  } catch {
    return { valid: false, error: 'malformed-payload' };
  }
  if (!payload || (payload.tier !== 'home' && payload.tier !== 'pro') || typeof payload.id !== 'string') {
    return { valid: false, error: 'invalid-payload' };
  }
  try {
    const pub = await crypto.subtle.importKey('jwk', DEFAULT_PUBLIC_JWK, { name: 'Ed25519' }, false, ['verify']);
    const sig = fromBase64Url(m[2]);
    const msg = new TextEncoder().encode(`cg1.${m[1]}`);
    const ok = await crypto.subtle.verify(
      'Ed25519',
      pub,
      sig as BufferSource,
      msg,
    );
    if (!ok) return { valid: false, error: 'invalid-signature' };
  } catch {
    return { valid: false, error: 'crypto-error' };
  }
  if (typeof payload.exp === 'number' && Math.floor(Date.now() / 1000) > payload.exp) {
    return { valid: false, error: 'expired' };
  }

  try {
    const res = await fetch('/license-activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed }),
    });
    if (res.status === 409 || res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { valid: false, error: data.error || 'machine-limit' };
    }
  } catch {
    // Offline or static server: local Ed25519 verification above is authoritative
  }

  try {
    localStorage.setItem('chromaglass:license-key', trimmed);
    localStorage.setItem('chromaglass:license-payload', JSON.stringify(payload));
    localStorage.setItem('chromaglass-license-tier', payload.tier);
    window.dispatchEvent(new Event('cg-license-changed'));
  } catch {
    // storage unavailable
  }
  return { valid: true };
}

export const LicenseGate: React.FC<LicenseGateProps> = ({ onUnlocked }) => {
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await activateKeyInGate(trimmed);
      if (res.valid) {
        onUnlocked();
        return;
      }
      setError(
        res.error === 'expired'
          ? 'This license key has expired.'
          : res.error === 'machine-limit'
            ? 'This license key is already active on 2 machines.'
            : 'Invalid license key.',
      );
    } catch {
      setError('Could not verify license key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-cg-signin=""
      className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto"
      style={{ background: 'rgba(5, 5, 8, 0.55)', backdropFilter: 'blur(12px)' }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950/85 px-5 py-4 text-neutral-100 shadow-2xl">
        <div className="mb-3 text-center">
          <h1 className="text-lg font-medium tracking-wide text-neutral-100">ChromaGlass</h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            Sign in or enter your license key to open the studio
          </p>
        </div>

        <form onSubmit={handleActivate} className="flex flex-col gap-2.5">
          <input
            type="text"
            required
            data-cg-license-input=""
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="cg1.eyJ0aWVyIjoiaG9tZSI..."
            aria-label="License key"
            className="min-h-[42px] w-full rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 font-mono text-xs text-neutral-100 placeholder-neutral-500 focus:border-amber-400/60 focus:outline-none"
          />
          <button
            type="submit"
            data-cg-license-activate=""
            disabled={busy}
            className="min-h-[44px] w-full rounded-xl bg-amber-500/90 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Activate License Key'}
          </button>
        </form>

        {error && (
          <p
            data-cg-license-error=""
            className="mt-2.5 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-1.5 text-center text-xs text-red-200"
          >
            {error}
          </p>
        )}

        <div className="mt-3 text-center text-[11px] leading-tight text-neutral-400">
          <span>Offline Ed25519 verification — works with no internet connection.</span>
        </div>
      </div>
    </div>
  );
};

export default LicenseGate;
