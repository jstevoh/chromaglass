import React, { useEffect, useState } from 'react';
import { getCachedEmail } from '../lib/authFlag';
import {
  getCurrentUserEmail,
  signOutCurrentAccount,
  deleteCurrentAccount,
} from '../lib/firebaseAuth';
import {
  useAccountShows,
  joinAccountShow,
  unpublishAccountShows,
} from '../lib/accountShows';

interface AccountSheetProps {
  onClose: () => void;
}

export const AccountSheet: React.FC<AccountSheetProps> = ({ onClose }) => {
  const [email, setEmail] = useState<string | null>(() => getCachedEmail());
  const [confirmMode, setConfirmMode] = useState<'none' | 'signout' | 'delete'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountShows = useAccountShows();

  useEffect(() => {
    let cancelled = false;
    getCurrentUserEmail().then((liveEmail) => {
      if (!cancelled && liveEmail) {
        setEmail(liveEmail);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirmSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await unpublishAccountShows();
      await signOutCurrentAccount();
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
      await deleteCurrentAccount();
      window.dispatchEvent(new Event('cg-signed-out'));
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'Could not delete account. You may need to sign in again first.',
      );
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
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

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Signed in as</div>
          <div className="mt-1 truncate text-sm font-medium text-neutral-100">
            {email || 'Signed-in user'}
          </div>
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
