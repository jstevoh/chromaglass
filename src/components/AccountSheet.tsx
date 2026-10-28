import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { getCachedEmail } from '../lib/authFlag';
import CloudSyncCard from './CloudSyncCard';
import { MacAppCard } from './MacAppCard';
import { cloudSync } from '../lib/cloudSyncApp';
import { ACCOUNTS_ON, useSignedIn } from '../lib/useSignedIn';
import { allowAccountKeys, declineAccountKey, lastAccountLicense, syncAccountLicense, type AccountLicenseResult } from '../lib/accountLicense';
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
import {
  CHECKOUT_HOME_URL,
  CHECKOUT_PRO_URL,
  CHECKOUT_UPGRADE_URL,
  buildCheckoutUrl,
  getActiveLicenseInfo,
  getEffectiveTier,
  getMarketingOptIn,
  setMarketingOptIn,
  syncMarketingPreferenceToServer,
} from '../lib/tierGates';

async function loadFirebaseAuth() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return null;
  return import('../lib/firebaseAuth');
}

// The same sign-in the first visit meets, fetched only when this sheet needs it
// and only in a build that has accounts: a build without Firebase carries none
// (`npm run signin` 1a). The variable is read here, not through ACCOUNTS_ON:
// Vite folds `import.meta.env` away in a build without it, which drops this
// import; through the shared constant it stayed, and in that build it pulled the
// App's chunk apart (`preloadApp: no chunk for src/App.tsx`).
const LazySignInForm = import.meta.env.VITE_FIREBASE_API_KEY
  ? lazy(() => import('./SignInScreen').then((m) => ({ default: m.SignInForm })))
  : null;

// How the account signs in, and confirming its email: fetched like the form above.
const LazySignInMethods = import.meta.env.VITE_FIREBASE_API_KEY
  ? lazy(() => import('./AccountSignInMethods'))
  : null;

interface AccountSheetProps {
  onClose: () => void;
}

const isUnsubscribeUrl = () =>
  typeof window !== 'undefined' &&
  (/^\/unsubscribe\/?$/i.test(window.location.pathname) ||
    new URLSearchParams(window.location.search).has('unsubscribe'));

const TIER_NAME = { free: 'Free', home: 'Home', pro: 'Pro' } as const;

/**
 * The account: who you are, what you own, what you can buy.
 *
 * The owner, 2026-10-24: "the profile page is garbage", and, signed out while
 * using the app, "there is no way to re-sign in". The sheet before this had
 * grown a block for everything account-shaped (a settings shortcut, a licence
 * form, an empty "Running shows" box, the store, the newsletter, two big
 * account buttons, a paragraph of small print), all at the same weight, and
 * once signed out it said "Signed in as Signed-in user" over a note that the
 * *next load* would ask to sign in. So it is now one column that answers three
 * questions in order, each at the weight it deserves:
 *
 *   1. Who am I? Your email and your plan, or, signed out, the sign-in itself,
 *      right here (the same form the first visit meets), with the show still
 *      running behind it.
 *   2. What do I have? Pro says so and stops. Home offers the upgrade. Free
 *      shows the two plans side by side. A key typed by hand is one row under it.
 *   3. Everything else: running shows (one quiet line when there are none), the newsletter
 *      as one switch, and sign out / delete at the bottom, small, where a slip
 *      of the thumb does not reach them.
 *
 * #430's frame is kept (the owner's "janky" of 2026-10-22): the sheet never
 * grows past the screen, the title and footer stay put and only the middle
 * scrolls; on a phone it is a bottom sheet with 48px rows. Colours are the
 * desk's tokens: violet is what you own, red only on delete.
 */
export const AccountSheet: React.FC<AccountSheetProps> = ({ onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const signedInFlag = useSignedIn();
  const signedIn = ACCOUNTS_ON && signedInFlag;
  // A stable callback: SignInForm's redirect check re-runs whenever it changes.
  const onSignedIn = useCallback(() => setEmail(getCachedEmail()), []);
  const [email, setEmail] = useState<string | null>(() => getCachedEmail());
  const [confirmMode, setConfirmMode] = useState<'none' | 'signout' | 'delete'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState(() => getActiveLicenseInfo());
  const [effectiveTier, setEffectiveTier] = useState(() => getEffectiveTier());
  const [accountKey, setAccountKey] = useState<AccountLicenseResult>(() => lastAccountLicense());
  const [keyInput, setKeyInput] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(() => getActiveLicenseInfo().error);
  const [unsubscribedBanner] = useState(() => isUnsubscribeUrl());
  const [marketingOptIn, setMarketingOptInState] = useState(() => {
    if (isUnsubscribeUrl()) {
      setMarketingOptIn(false);
      return false;
    }
    return getMarketingOptIn();
  });
  const accountShows = useAccountShows();

  const refreshLicenseState = () => {
    setLicenseInfo(getActiveLicenseInfo());
    setEffectiveTier(getEffectiveTier());
    setAccountKey(lastAccountLicense());
    setMarketingOptInState(getMarketingOptIn());
  };

  const handleToggleMarketing = async (next: boolean) => {
    setMarketingOptInState(next);
    setMarketingOptIn(next);
    const authMod = await loadFirebaseAuth().catch(() => null);
    const token = await authMod?.getCurrentIdToken().catch(() => null);
    if (token) {
      await syncMarketingPreferenceToServer(token, next);
    }
  };

  // Signed in (on opening, or the moment the form below signs in): the live
  // email, and the account's key brought here if it beats what this browser has.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setEmail(getCachedEmail());
    void loadFirebaseAuth().then(async (authMod) => {
      const liveEmail = await authMod?.getCurrentUserEmail();
      if (!cancelled && liveEmail) setEmail(liveEmail);
    });
    void syncAccountLicense().then(() => {
      if (!cancelled) refreshLicenseState();
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    let cancelled = false;
    // The Mac app's own show server knows its key (a static site has none).
    syncServerLicense().then(() => {
      if (!cancelled) refreshLicenseState();
    });
    const onLicenseChange = () => refreshLicenseState();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('cg-license-changed', onLicenseChange);
    window.addEventListener('cg-account-license', onLicenseChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('cg-license-changed', onLicenseChange);
      window.removeEventListener('cg-account-license', onLicenseChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

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
          res.detail ?? (res.error === 'expired'
            ? 'This licence key has expired.'
            : res.error === 'machine-limit'
              ? 'This licence key is already active on 2 machines.'
              : 'That is not a valid licence key.'),
        );
      }
    } catch {
      setLicenseError('Could not check the licence key.');
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleDeactivateKey = async () => {
    setLicenseBusy(true);
    setLicenseError(null);
    try {
      // Kept off on later starts too, until asked back below.
      declineAccountKey(licenseInfo.id);
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
      setEmail(null);
      setConfirmMode('none');
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await unpublishAccountShows();
      // The cloud copy goes with the account (privacy.html says so). Asked while
      // the account still exists, since the Worker needs its token to know whose,
      // and the delete stops if it fails: once the account is gone no token could
      // ever erase it (the review of #467).
      const sync = cloudSync();
      if (sync && !(await sync.erase().catch(() => false))) {
        setError("Couldn't erase your cloud copy, so the account is not deleted yet. Try again when you're online.");
        return;
      }
      const authMod = await loadFirebaseAuth();
      if (authMod) await authMod.deleteCurrentAccount();
      setEmail(null);
      setConfirmMode('none');
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'Could not delete the account. Sign in again, then try once more.',
      );
    } finally {
      setBusy(false);
    }
  };

  const currentTier = licenseInfo.valid ? licenseInfo.tier : effectiveTier;
  const checkoutEmail = (signedIn && email) || licenseInfo.email;
  // An account key this app could not use: said once, plainly, with who to ask.
  const keyTrouble =
    signedIn && !licenseInfo.valid && accountKey.state === 'unverifiable'
      ? `Your account holds a ${TIER_NAME[accountKey.tier]} licence this app could not verify. Write to support and it will be reissued.`
      : null;

  const label = 'text-[11px] font-medium uppercase tracking-wider text-dim';
  const section = 'border-t border-border pt-4';
  const ghostBtn =
    'flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover disabled:opacity-50';
  const textBtn = 'text-[12px] text-muted underline decoration-faint underline-offset-2 hover:text-text disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-cg-account=""
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-xl border border-border bg-surface text-text shadow-palette sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <h2 className="text-[16px] font-medium text-text">Account</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {/* ── 1. Who you are ─────────────────────────────────── */}
          {ACCOUNTS_ON && !signedIn ? (
            <div data-cg-signin="" data-cg-account-signedout="">
              <p className="text-[14px] font-medium text-text">You're not signed in</p>
              <p className="mb-3 mt-0.5 text-[12px] leading-snug text-muted">
                Sign in to bring your licence and your saved shows to this browser. The show keeps playing while you do.
              </p>
              {LazySignInForm && (
                <Suspense fallback={<div className="h-[152px]" />}>
                  <LazySignInForm onSignedIn={onSignedIn} />
                </Suspense>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-[15px] font-medium text-text-2">
                {checkoutEmail ? checkoutEmail.slice(0, 1).toUpperCase() : <User size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-text">
                  {checkoutEmail || (ACCOUNTS_ON ? 'Signed in' : 'This computer')}
                </div>
                <div className="text-[12px] text-muted">
                  {currentTier === 'pro' ? 'Everything is unlocked.' : currentTier === 'home' ? 'Home features are unlocked.' : 'The free plan.'}
                </div>
              </div>
              <span
                data-cg-license-tier={currentTier}
                className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wider ${
                  currentTier === 'free'
                    ? 'border border-border-strong text-muted'
                    : 'border border-accent-border bg-accent-bg text-accent-text'
                }`}
              >
                {TIER_NAME[currentTier]}
              </span>
            </div>
          )}

          {signedIn && LazySignInMethods && (
            <Suspense fallback={null}>
              <LazySignInMethods
                onConfirmed={async () => {
                  await syncAccountLicense(true);
                  refreshLicenseState();
                }}
              />
            </Suspense>
          )}

          {signedIn && !licenseInfo.valid && accountKey.state === 'declined' && (
            <button
              type="button"
              data-cg-account-key-restore=""
              onClick={() => {
                allowAccountKeys();
                void syncAccountLicense(true).then(refreshLicenseState);
              }}
              className="flex min-h-10 pointer-coarse:min-h-12 w-full items-center justify-between rounded-lg border border-accent-border bg-accent-bg px-3 text-[13px] font-medium text-text transition-colors hover:bg-accent/30"
            >
              <span>Use the {TIER_NAME[accountKey.tier]} licence on your account</span>
              <span className="text-accent-text">→</span>
            </button>
          )}

          {keyTrouble && (
            <p data-cg-account-key-trouble="" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] leading-snug text-warn">
              {keyTrouble}
            </p>
          )}

          {/* ── 2. What you have, and what you can get ─────────── */}
          {currentTier !== 'pro' && (
            <div data-cg-account-store="" className={section}>
              <div className={label}>{currentTier === 'home' ? 'Upgrade' : 'Get the full app'}</div>
              {currentTier === 'home' ? (
                <a
                  href={buildCheckoutUrl(CHECKOUT_UPGRADE_URL, checkoutEmail)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cg-buy-upgrade=""
                  className="mt-2 flex flex-col rounded-lg border border-accent-border bg-accent-bg p-3 text-left transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-center justify-between text-[13px] font-medium text-text">
                    <span>Home → Pro</span>
                    <span className="text-[12px] text-muted"><span className="font-mono font-medium text-accent-text">$164</span> once</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-text-2">
                    Pay the difference for several projectors, video out, Art-Net, OSC and your own logo.
                  </p>
                </a>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <a
                    href={buildCheckoutUrl(CHECKOUT_HOME_URL, checkoutEmail)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cg-buy-home=""
                    className="flex flex-col rounded-lg border border-border-strong bg-elevated p-3 text-left transition-colors hover:bg-hover"
                  >
                    <span className="text-[13px] font-medium text-text">Home</span>
                    <span className="text-[12px] text-muted"><span className="font-mono font-medium text-text-2">$35</span> once</span>
                    <span className="mt-1.5 text-[12px] leading-snug text-muted">Full-length recording, 4K renders, system audio, phone remote.</span>
                  </a>
                  <a
                    href={buildCheckoutUrl(CHECKOUT_PRO_URL, checkoutEmail)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cg-buy-pro=""
                    className="flex flex-col rounded-lg border border-accent-border bg-accent-bg p-3 text-left transition-colors hover:bg-accent/30"
                  >
                    <span className="text-[13px] font-medium text-text">Pro</span>
                    <span className="text-[12px] text-muted"><span className="font-mono font-medium text-accent-text">$199</span> once</span>
                    <span className="mt-1.5 text-[12px] leading-snug text-text-2">All of Home, plus several projectors, video out, Art-Net, OSC.</span>
                  </a>
                </div>
              )}
            </div>
          )}

          <div className={currentTier === 'pro' ? section : ''}>
            <div className="flex items-center justify-between">
              <span className={label}>Licence key</span>
              {licenseInfo.valid && (
                <button type="button" data-cg-license-deactivate="" disabled={licenseBusy} onClick={handleDeactivateKey} className={textBtn}>
                  Remove from this computer
                </button>
              )}
            </div>
            <form onSubmit={handleActivateKey} className="mt-2 flex gap-2">
              <input
                type="text"
                data-cg-license-input=""
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={licenseInfo.valid ? `${TIER_NAME[licenseInfo.tier]} key active` : 'Paste a key (cg1…)'}
                aria-label="Licence key"
                className="min-h-10 pointer-coarse:min-h-12 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 font-mono text-[12px] text-text placeholder-dim focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                data-cg-license-activate=""
                disabled={licenseBusy || !keyInput.trim()}
                className={ghostBtn}
              >
                Activate
              </button>
            </form>
            {licenseError && (
              <p data-cg-license-error="" className="mt-2 text-[12px] text-live">
                {licenseError}
              </p>
            )}
          </div>

          {/* ── 3. Everything else ────────────────────────────── */}
          {/* Signed in, one quiet line says there are none (`accountlink` 4 reads
              it): a phone looking for its laptop's show learns that here. */}
          {(signedIn || accountShows.length > 0) && (
            <div className={section}>
              <div className={label}>Running shows</div>
              {accountShows.length === 0 ? (
                <p className="mt-1 text-[12px] text-dim" data-testid="account-shows-empty">No running shows on this account.</p>
              ) : (
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
                    className="flex min-h-10 pointer-coarse:min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-elevated px-3 text-left text-[13px] font-medium text-text transition-colors hover:bg-hover"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
                      <span className="truncate">{show.name}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-accent-text">Join</span>
                  </button>
                ))}
              </div>
              )}
            </div>
          )}

          {signedIn && email && <CloudSyncCard tier={currentTier} email={email} />}

          <MacAppCard tier={currentTier} />

          {/* Signed out, the sign-in form above carries its own opt-in. */}
          {(!ACCOUNTS_ON || signedIn || unsubscribedBanner) && (
          <div className={section} data-cg-account-marketing="">
            {unsubscribedBanner && !marketingOptIn && (
              <p className="mb-2 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-[12px] text-ok">
                You're unsubscribed from ChromaGlass emails.
              </p>
            )}
            <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-text">Email me about new looks</span>
                <span className="block text-[12px] text-muted">A few times a year. Off any time.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={marketingOptIn}
                data-cg-marketing-toggle=""
                checked={marketingOptIn}
                onChange={(e) => void handleToggleMarketing(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-border-strong bg-bg accent-accent"
              />
            </label>
          </div>
          )}

          {signedIn && (
            <div className={section}>
              {confirmMode === 'signout' ? (
                <div className="rounded-lg border border-border-strong bg-elevated p-3">
                  <p className="mb-2 text-[13px] text-text-2">Sign out on this browser? The show keeps playing.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-cg-account-signout-confirm=""
                      disabled={busy}
                      onClick={handleConfirmSignOut}
                      className="min-h-10 pointer-coarse:min-h-12 flex-1 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                    >
                      Sign out
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmMode('none')} className={ghostBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : confirmMode === 'delete' ? (
                <div className="rounded-lg border border-live-border bg-live-bg p-3">
                  <p className="mb-2 text-[13px] text-live">
                    Delete your ChromaGlass account for good? Licences you bought stay valid on the computers that have them.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-cg-account-delete-confirm=""
                      disabled={busy}
                      onClick={handleConfirmDelete}
                      className="min-h-10 pointer-coarse:min-h-12 flex-1 rounded-lg bg-live px-3 text-[13px] font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                    >
                      Delete account
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirmMode('none')} className={ghostBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-cg-account-signout=""
                    disabled={busy}
                    onClick={() => {
                      setConfirmMode('signout');
                      setError(null);
                    }}
                    className={ghostBtn}
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    data-cg-account-delete=""
                    disabled={busy}
                    onClick={() => {
                      setConfirmMode('delete');
                      setError(null);
                    }}
                    className="min-h-10 pointer-coarse:min-h-12 px-2 text-[12px] text-dim underline decoration-faint underline-offset-2 hover:text-live disabled:opacity-50"
                  >
                    Delete account
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Outside the signed-in block: a sign-out or delete that fails can leave
              the sheet signed out, and its reason must still be read. */}
          {error && (
            <p className="rounded-lg border border-live-border bg-live-bg px-3 py-2 text-[12px] text-live">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[12px] text-muted">
          <a
            href="https://chromaglass.lemonsqueezy.com/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-faint underline-offset-2 hover:text-text"
          >
            Orders
          </a>
          <a href="mailto:support@chromaglass.art" className="underline decoration-faint underline-offset-2 hover:text-text">
            Support
          </a>
          <a href="/privacy.html" target="_blank" rel="noopener" className="underline decoration-faint underline-offset-2 hover:text-text">
            Privacy
          </a>
          <a href="/terms.html" target="_blank" rel="noopener" className="underline decoration-faint underline-offset-2 hover:text-text">
            Terms
          </a>
          <span className="text-dim">One-time purchases, no subscription.</span>
        </div>
      </div>
    </div>
  );
};
export default AccountSheet;
