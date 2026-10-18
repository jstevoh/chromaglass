import React, { useState } from 'react';
import { activateLocalLicenseKey } from '../lib/licenseKey';

interface LicenseGateProps {
  onUnlocked: () => void;
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
      const res = await activateLocalLicenseKey(trimmed);
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
