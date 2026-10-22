import React, { useEffect, useRef, useState } from 'react';
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
import {
  CHECKOUT_HOME_URL,
  CHECKOUT_PRO_URL,
  CHECKOUT_UPGRADE_URL,
  buildCheckoutUrl,
  getActiveLicenseInfo,
  getEffectiveTier,
  getMarketingOptIn,
  hasExplicitMarketingChoice,
  setMarketingOptIn,
  syncMarketingPreferenceToServer,
} from '../lib/tierGates';

async function loadFirebaseAuth() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) return null;
  return import('../lib/firebaseAuth');
}

interface AccountSheetProps {
  onClose: () => void;
  onOpenSettings?: () => void;
}

const isUnsubscribeUrl = () =>
  typeof window !== 'undefined' &&
  (/^\/unsubscribe\/?$/i.test(window.location.pathname) ||
    new URLSearchParams(window.location.search).has('unsubscribe'));

export const AccountSheet: React.FC<AccountSheetProps> = ({ onClose, onOpenSettings }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [email, setEmail] = useState<string | null>(() => getCachedEmail());
  const [signedOut, setSignedOut] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'none' | 'signout' | 'delete'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseInfo, setLicenseInfo] = useState(() => getActiveLicenseInfo());
  const [effectiveTier, setEffectiveTier] = useState(() => getEffectiveTier());
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
        if (hasExplicitMarketingChoice()) {
          void syncMarketingPreferenceToServer(token, getMarketingOptIn());
        }
        try {
          const res = await fetch(`${licensesUrl.replace(/\/$/, '')}/keys`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            keys?: Array<{ key?: string; token?: string; tier?: string; revoked?: boolean }>;
            marketingOptIn?: boolean | null;
          };
          if (typeof data.marketingOptIn === 'boolean' && !hasExplicitMarketingChoice() && !cancelled) {
            setMarketingOptInState(data.marketingOptIn);
            setMarketingOptIn(data.marketingOptIn);
          }
          const activeRemote = (data.keys ?? []).find((k) => (k.token || k.key) && !k.revoked);
          const remoteToken = activeRemote?.token || activeRemote?.key;
          if (remoteToken && !getActiveLicenseInfo().valid) {
            await activateLocalLicenseKey(remoteToken);
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
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('cg-license-changed', onLicenseChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('cg-license-changed', onLicenseChange);
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
      setEmail(null);
      setConfirmMode('none');
      setSignedOut(true);
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
      const authMod = await loadFirebaseAuth();
      if (authMod) await authMod.deleteCurrentAccount();
      setEmail(null);
      setConfirmMode('none');
      setSignedOut(true);
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'Could not delete account. You may need to sign in again first.',
      );
    } finally {
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

  const checkoutEmail = email || licenseInfo.email;
  const currentTier = licenseInfo.valid ? licenseInfo.tier : effectiveTier;

  const paid = currentTier === 'home' || currentTier === 'pro';

  /*
    Reported 2026-10-22 as janky: the old sheet was one 955px column on a 900px
    laptop and a 844px phone, centred in a scrolling overlay, so its top edge
    (the title and the close button) sat above the screen with no way to scroll
    up to it. Now the frame never grows past the viewport (`max-h`, in dvh so a
    phone's address bar does not hide the bottom), the title and the footer
    links stay put and only the middle scrolls. Wide screens get two columns
    (who you are and your key on the left, what to buy and what you hear on the
    right) so a laptop at 1280×720 shows all of it with no scroll; a phone gets
    one column as a bottom sheet, with 48px rows for a thumb. Surfaces, hairlines
    and the single violet accent are the desk's (tokens in index.css): amber was
    this sheet's own colour and meant nothing on the desk.
  */
  const sectionLabel = 'text-[11px] font-medium uppercase tracking-wider text-dim';
  const card = 'rounded-lg border border-border bg-elevated p-3';
  const ghostBtn =
    'flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover disabled:opacity-50';

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
        className="flex max-h-[92dvh] w-full sm:max-h-[calc(100dvh-2rem)] max-w-[720px] flex-col overflow-hidden rounded-t-xl border border-border bg-surface text-text shadow-palette sm:rounded-xl"
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <h2 className="text-[16px] font-medium text-text">Profile &amp; Store</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
            <div className="flex min-w-0 flex-col gap-4 max-md:contents">
              <div className={`${card} order-1`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className={sectionLabel}>Signed in as</div>
                    <div className="mt-1 truncate text-[14px] font-medium text-text">
                      {email || licenseInfo.email || 'Signed-in user'}
                    </div>
                  </div>
                  <span
                    data-cg-license-tier={currentTier}
                    className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-wider ${
                      paid
                        ? 'border border-accent-border bg-accent-bg text-accent-text'
                        : 'border border-border-strong text-muted'
                    }`}
                  >
                    {tierLabel}
                  </span>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    data-cg-account-settings=""
                    className="mt-3 flex min-h-10 pointer-coarse:min-h-12 w-full items-center justify-between rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover"
                  >
                    <span>Studio &amp; Stage Settings</span>
                    <span className="text-muted">Open →</span>
                  </button>
                )}
              </div>

              <div className={`${card} order-3`}>
                <div className="flex items-center justify-between">
                  <span className={sectionLabel}>License key</span>
                  {licenseInfo.valid && (
                    <button
                      type="button"
                      data-cg-license-deactivate=""
                      disabled={licenseBusy}
                      onClick={handleDeactivateKey}
                      className="text-[12px] text-muted underline decoration-faint underline-offset-2 hover:text-text"
                    >
                      Deactivate machine
                    </button>
                  )}
                </div>
                <form onSubmit={handleActivateKey} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    data-cg-license-input=""
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={
                      licenseInfo.valid
                        ? `Active (${licenseInfo.tier.toUpperCase()}) · paste key to upgrade`
                        : 'Paste license key (cg1...)'
                    }
                    aria-label="License key"
                    className="min-h-10 pointer-coarse:min-h-12 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 font-mono text-[12px] text-text placeholder-dim focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-cg-license-activate=""
                    disabled={licenseBusy || !keyInput.trim()}
                    className="min-h-10 pointer-coarse:min-h-12 shrink-0 rounded-lg bg-primary px-4 text-[13px] font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    {licenseInfo.valid ? 'Upgrade' : 'Activate'}
                  </button>
                </form>
                {licenseError && (
                  <p data-cg-license-error="" className="mt-2 text-[12px] text-live">
                    {licenseError}
                  </p>
                )}
              </div>

              <div className={`${card} order-4`}>
                <div className={sectionLabel}>Running shows</div>
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
                        className="flex min-h-10 pointer-coarse:min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-[13px] font-medium text-text transition-colors hover:bg-hover"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
                          <span className="truncate">{show.name}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-accent-text">Join</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-dim" data-testid="account-shows-empty">
                    No running shows on this account.
                  </p>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4 max-md:contents">
              {currentTier !== 'pro' && (
                <div data-cg-account-store="" className={`${card} order-2`}>
                  <div className={sectionLabel}>
                    {currentTier === 'home' ? 'Upgrade to Pro' : 'Get the ChromaGlass app'}
                  </div>
                  {currentTier === 'home' ? (
                    <div className="mt-2 flex flex-col gap-3">
                      <p className="text-[12px] leading-relaxed text-muted">
                        Pay only the difference ($164) to unlock multi-projector edge blend, Syphon/Spout/NDI, Art-Net DMX, OSC &amp; custom band logos on this account.
                      </p>
                      <a
                        href={buildCheckoutUrl(CHECKOUT_UPGRADE_URL, checkoutEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cg-buy-upgrade=""
                        className="flex min-h-10 pointer-coarse:min-h-12 items-center justify-between rounded-lg bg-primary px-3.5 text-[14px] font-medium text-on-primary transition-opacity hover:opacity-90"
                      >
                        <span>Upgrade Home → Pro</span>
                        <span className="font-mono text-[12px]">$164</span>
                      </a>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      <a
                        href={buildCheckoutUrl(CHECKOUT_HOME_URL, checkoutEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cg-buy-home=""
                        className="flex flex-col rounded-lg border border-border-strong bg-surface p-3 text-left transition-colors hover:bg-hover"
                      >
                        <div className="flex items-center justify-between text-[13px] font-medium text-text">
                          <span>ChromaGlass Home</span>
                          <span className="text-[12px] text-muted"><span className="font-mono font-medium text-text-2">$35</span> once</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-muted">
                          System audio capture, ambient TV mode, full-length unmarked recordings, 1080p/4K song renders &amp; phone remote (2 machines).
                        </p>
                      </a>
                      <a
                        href={buildCheckoutUrl(CHECKOUT_PRO_URL, checkoutEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cg-buy-pro=""
                        className="flex flex-col rounded-lg border border-accent-border bg-accent-bg p-3 text-left transition-colors hover:bg-accent/30"
                      >
                        <div className="flex items-center justify-between text-[13px] font-medium text-text">
                          <span>ChromaGlass Pro</span>
                          <span className="text-[12px] text-muted"><span className="font-mono font-medium text-accent-text">$199</span> once</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-snug text-text-2">
                          Everything in Home + multi-projector edge blend, Syphon/Spout/NDI video out, Art-Net DMX, OSC &amp; your own band logo.
                        </p>
                      </a>
                    </div>
                  )}
                  {checkoutEmail && (
                    <p className="mt-2 text-[12px] leading-snug text-dim">
                      Checkout pre-fills <span className="text-text-2">{checkoutEmail}</span> so your key links to this account.
                    </p>
                  )}
                </div>
              )}

              <div className={`${card} order-5`} data-cg-account-marketing="">
                {unsubscribedBanner && !marketingOptIn && (
                  <p className="mb-2 rounded-md border border-ok/30 bg-ok/10 px-2.5 py-1.5 text-[12px] text-ok">
                    You have been unsubscribed from ChromaGlass marketing &amp; newsletter emails.
                  </p>
                )}
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-text">Newsletter &amp; product updates</div>
                    <p className="mt-0.5 text-[12px] leading-snug text-muted">
                      Occasional emails about new looks, fluid engine updates &amp; release notes. Unsubscribe anytime.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    data-cg-marketing-toggle=""
                    checked={marketingOptIn}
                    onChange={(e) => void handleToggleMarketing(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-bg accent-accent"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {signedOut ? (
              <div data-cg-signin="" className={`${card} text-center`}>
                <p className="text-[13px] text-text-2">
                  Signed out on this browser. The plate and show stay running; the next load will ask to sign in.
                </p>
                <button type="button" onClick={onClose} className={`${ghostBtn} mt-3 w-full`}>
                  Return to show
                </button>
              </div>
            ) : confirmMode === 'signout' ? (
              <div className="rounded-lg border border-border-strong bg-elevated p-3">
                <p className="mb-2 text-[13px] text-text-2">Sign out of ChromaGlass on this device?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-cg-account-signout-confirm=""
                    disabled={busy}
                    onClick={handleConfirmSignOut}
                    className="min-h-10 pointer-coarse:min-h-12 flex-1 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    Confirm sign out
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmMode('none')} className={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirmMode === 'delete' ? (
              <div className="rounded-lg border border-live-border bg-live-bg p-3">
                <p className="mb-2 text-[13px] text-live">
                  Permanently delete your ChromaGlass account? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-cg-account-delete-confirm=""
                    disabled={busy}
                    onClick={handleConfirmDelete}
                    className="min-h-10 pointer-coarse:min-h-12 flex-1 rounded-lg bg-live px-3 text-[13px] font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    Confirm delete account
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmMode('none')} className={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
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
                  className="flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-live-border px-3 text-[13px] font-medium text-live transition-colors hover:bg-live-bg disabled:opacity-50"
                >
                  Delete account
                </button>
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-live-border bg-live-bg px-3 py-2 text-[12px] text-live">{error}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 text-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <a
              href="https://chromaglass.lemonsqueezy.com/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-faint underline-offset-2 hover:text-text"
            >
              Orders &amp; Invoices
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
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-dim">
            Home &amp; Pro are one-time purchases, no subscription. Marketing emails are opt-in; turn them off above or at <span className="text-muted">/unsubscribe</span>.
          </p>
        </div>
      </div>
    </div>
  );
};
export default AccountSheet;
