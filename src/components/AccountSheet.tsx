import React, { useEffect, useState } from 'react';
import { getCachedEmail } from '../lib/authFlag';
import {
  useAccountShows,
  joinAccountShow,
  unpublishAccountShows,
} from '../lib/accountShows';
import {
  activateLocalLicenseKey,
  deactivateLocalLicenseKey,
  syncServerLicense,
} from '../lib/licenseKey';
import { getActiveLicenseInfo, getEffectiveTier } from '../lib/tierGates';

async function loadFirebaseAuth() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return null;
  return import('../lib/firebaseAuth');
}

interface AccountSheetProps {
  onClose: () => void;
}

export const AccountSheet: React.FC<AccountSheetProps> = ({ onClose }) => {
  const [email, setEmail] = useState<string | null>(() => getCachedEmail());
  const [confirmMode, setConfirmMode] = useState<'none' | 'signout' | 'delete'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState(() => getActiveLicenseInfo());
  const [effectiveTier, setEffectiveTier] = useState(() => getEffectiveTier());
  const [keyInput, setKeyInput] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(() => getActiveLicenseInfo().error);
  const accountShows = useAccountShows();

  const refreshLicenseState = () => {
    setLicenseInfo(getActiveLicenseInfo());
    setEffectiveTier(getEffectiveTier());
  };

  useEffect(() => {
    let cancelled = false;
    loadFirebaseAuth().then(async (authMod) => {
      if (!authMod || cancelled) return;
      const liveEmail = await authMod.getCurrentUserEmail();
      if (!cancelled && liveEmail) {
        setEmail(liveEmail);
      }
      const licensesUrl = import.meta.env.VITE_FIREBASE_LICENSES_URL as string | undefined;
      if (licensesUrl) {
        const token = await authMod.getCurrentIdToken();
        if (cancelled || !token) return;
        try {
          const res = await fetch(`${licensesUrl.replace(/\/$/, '')}/keys`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!res.ok) return;
          const data = (await res.json()) as { keys?: Array<{ key?: string; tier?: string; revoked?: boolean }> };
          const activeRemote = (data.keys ?? []).find((k) => k.key && !k.revoked);
          if (activeRemote?.key && !getActiveLicenseInfo().valid) {
            await activateLocalLicenseKey(activeRemote.key);
            if (!cancelled) refreshLicenseState();
          }
        } catch {
          // offline or unreachable
        }
      }
    });
    syncServerLicense().then(() => {
      if (!cancelled) refreshLicenseState();
    });

    const onLicenseChange = () => refreshLicenseState();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('cg-license-changed', onLicenseChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('cg-license-changed', onLicenseChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setLicenseBusy(true);
    setLicenseError(null);
    try {
      const res = await activateLocalLicenseKey(trimmed);
      if (res.valid) {
        setKeyInput('');
        refreshLicenseState();
      } else {
        setLicenseError(
          res.error === 'expired'
            ? 'This license key has expired.'
            : res.error === 'machine-limit'
              ? 'This license key is already active on 2 machines.'
              : 'Invalid license key signature.',
        );
      }
    } catch {
      setLicenseError('Could not verify license key.');
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleDeactivateKey = async () => {
    setLicenseBusy(true);
    setLicenseError(null);
    try {
      await deactivateLocalLicenseKey();
      refreshLicenseState();
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleConfirmSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await unpublishAccountShows();
      const authMod = await loadFirebaseAuth();
      if (authMod) await authMod.signOutCurrentAccount();
      window.dispatchEvent(new Event('cg-signed-out'));
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Could not sign out.');
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await unpublishAccountShows();
      const authMod = await loadFirebaseAuth();
      if (authMod) await authMod.deleteCurrentAccount();
      window.dispatchEvent(new Event('cg-signed-out'));
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'Could not delete account. You may need to sign in again first.',
      );
      setBusy(false);
    }
  };

  const tierLabel =
    licenseInfo.valid
      ? licenseInfo.tier === 'pro'
        ? 'Pro'
        : 'Home'
      : effectiveTier === 'free'
        ? 'Free'
        : 'Unlocked';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-cg-account=""
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950 p-5 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-medium text-neutral-100">Account</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Signed in as</div>
            <div className="mt-1 truncate text-sm font-medium text-neutral-100">
              {email || licenseInfo.email || 'Signed-in user'}
            </div>
          </div>
          <span
            data-cg-license-tier={licenseInfo.valid ? licenseInfo.tier : effectiveTier}
            className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-200"
          >
            {tierLabel}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-400">License Key</span>
            {licenseInfo.valid && (
              <button
                type="button"
                data-cg-license-deactivate=""
                disabled={licenseBusy}
                onClick={handleDeactivateKey}
                className="text-[11px] text-neutral-400 underline hover:text-neutral-200"
              >
                Deactivate machine
              </button>
            )}
          </div>
          <form onSubmit={handleActivateKey} className="mt-2 flex gap-1.5">
            <input
              type="text"
              data-cg-license-input=""
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                licenseInfo.valid
                  ? `Active (${licenseInfo.tier.toUpperCase()}) — paste key to upgrade`
                  : 'Paste license key (cg1...)'
              }
              aria-label="License key"
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 font-mono text-xs text-neutral-100 placeholder-neutral-500 focus:border-amber-400/60 focus:outline-none"
            />
            <button
              type="submit"
              data-cg-license-activate=""
              disabled={licenseBusy || !keyInput.trim()}
              className="min-h-[36px] shrink-0 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-neutral-950 transition hover:bg-amber-400 disabled:opacity-40"
            >
              {licenseInfo.valid ? 'Upgrade' : 'Activate'}
            </button>
          </form>
          {licenseError && (
            <p
              data-cg-license-error=""
              className="mt-1.5 text-xs text-red-300"
            >
              {licenseError}
            </p>
          )}
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Running shows</div>
          {accountShows.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5" data-testid="account-shows">
              {accountShows.map((show) => (
                <button
                  key={show.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    joinAccountShow(show);
                  }}
                  data-testid="account-show-join"
                  data-cg-account-show={show.id}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-left text-sm font-medium text-neutral-100 transition hover:bg-white/15"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate">{show.name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-amber-300">Join</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-neutral-500" data-testid="account-shows-empty">
              No running shows on this account.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          {confirmMode !== 'signout' ? (
            <button
              type="button"
              data-cg-account-signout=""
              disabled={busy}
              onClick={() => {
                setConfirmMode('signout');
                setError(null);
              }}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-white/15"
            >
              Sign out
            </button>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
              <p className="mb-2 text-xs text-amber-200">
                Sign out of ChromaGlass on this device?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-cg-account-signout-confirm=""
                  disabled={busy}
                  onClick={handleConfirmSignOut}
                  className="min-h-[40px] flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  Confirm sign out
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmMode('none')}
                  className="min-h-[40px] rounded-lg border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirmMode !== 'delete' ? (
            <button
              type="button"
              data-cg-account-delete=""
              disabled={busy}
              onClick={() => {
                setConfirmMode('delete');
                setError(null);
              }}
              className="min-h-[44px] w-full rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-950/50"
            >
              Delete account
            </button>
          ) : (
            <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3">
              <p className="mb-2 text-xs text-red-200">
                Permanently delete your ChromaGlass account? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-cg-account-delete-confirm=""
                  disabled={busy}
                  onClick={handleConfirmDelete}
                  className="min-h-[40px] flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-red-400 disabled:opacity-50"
                >
                  Confirm delete account
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmMode('none')}
                  className="min-h-[40px] rounded-lg border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-center gap-4 border-t border-white/10 pt-3 text-xs text-neutral-400">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener"
            className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-200"
          >
            Privacy Policy
          </a>
          <span>·</span>
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener"
            className="underline decoration-neutral-600 underline-offset-2 hover:text-neutral-200"
          >
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
};
export default AccountSheet;
