/**
 * The Mac app's door: it opens on a Home or Pro licence, and not on an account
 * alone (PLAN.md 23.17d).
 *
 * The owner, 2026-10-25: "The Mac app should check the license. The app won't
 * work for free." Before this the app was built with no sign-in at all, gated
 * nothing, and so read Pro for anyone who downloaded it. Under 23.11 a launch
 * that asked for a sign-in let any signed-in account through, which on the
 * website is right (a free account is the free tier) and in the app is not:
 * the app is what Home and Pro are sold for. So this screen stays up until a
 * verified key is on the machine, and says which of four things is missing:
 *
 *   signin        nobody is signed in. The sign-in (or, in a build with no
 *                 accounts, the key box alone, as 23.11's LicenseGate had)
 *   buy           signed in, and the account holds no key: Home and Pro, the
 *                 store's own links, and "check again" for the minute after
 *                 paying, when the store's webhook has filed the key
 *   confirm       signed in with a password whose email is not confirmed yet:
 *                 the licence Worker gives keys only to a confirmed address
 *   offline       signed in, no key here, and the licence Worker cannot be
 *                 reached: the one time the app needs the internet is to
 *                 bring the key to this Mac the first time
 *   unverifiable  the account's key does not verify here (a retired signing key)
 *
 * and, in the browser a Mac-app sign-in finishes in, `done`: that tab has handed
 * the key to the app's server and says to go back, rather than start a second
 * show beside the app's.
 *
 * The key arrives one of three ways, and the screen watches for all of them: a
 * sign-in in this window (the account's key is fetched and activated,
 * accountLicense.ts), a key typed into the box, or a sign-in finished in the
 * browser on the app's own server, which files the key with that server; this
 * window asks the server every few seconds (`/license-info.json`). Offline,
 * once the key is here, nothing on this screen is ever seen again: the key is
 * verified against its signature on the machine, with no time limit (the
 * gig rule, PLAN.md 14h; see 23.17d for why there is no grace period).
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  getCachedEmail,
  hasStoredLicenseCandidateSync,
  isSignedInCached,
  onAuthFlagChange,
  verifyStoredLicenseOnLoad,
} from '../lib/authFlag';
import { activateLocalLicenseKey, syncServerLicense } from '../lib/licenseKey';
import { syncAccountLicense } from '../lib/accountLicense';
import {
  CHECKOUT_HOME_URL,
  CHECKOUT_PRO_URL,
  buildCheckoutUrl,
} from '../lib/tierGates';
import { isDesktopApp } from '../lib/platform';
import { MAC_SIGN_IN_PARAM, macAppLicensed } from '../lib/macApp';

const ACCOUNTS = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
// The variable itself, not ACCOUNTS: only that is folded at build time, so a
// build with no accounts carries no sign-in chunk (`npm run signin` 1a).
const LazySignInForm = import.meta.env.VITE_FIREBASE_API_KEY
  ? lazy(() => import('./SignInScreen').then((m) => ({ default: m.SignInForm })))
  : null;

/**
 * Firebase, on demand, and folded out of a build with no accounts (a fork, the
 * checks' plain builds: `npm run signin` 1a holds a build with no config to no
 * Firebase at all), which a bare dynamic import would not be.
 */
const firebase = () =>
  import.meta.env.VITE_FIREBASE_API_KEY ? import('../lib/firebaseAuth').catch(() => null) : Promise.resolve(null);

/** How often the screen asks the app's server whether a key has arrived from the browser. */
const WATCH_MS = 2_500;

type Step = 'checking' | 'signin' | 'confirm' | 'buy' | 'offline' | 'unverifiable' | 'done';

/** A browser tab a sign-in from the app was sent to, on the app's own server. */
const handedOff = () => {
  try {
    return !isDesktopApp() && new URLSearchParams(window.location.search).get(MAC_SIGN_IN_PARAM) === '1';
  } catch {
    return false;
  }
};

/**
 * Where the machine stands, in the order that costs least: a key the page has
 * already verified, one in storage, one the app's server holds, then the
 * account's, which is the only step that needs the network.
 */
async function look(): Promise<Step | 'open'> {
  if (macAppLicensed()) return 'open';
  if (hasStoredLicenseCandidateSync()) await verifyStoredLicenseOnLoad().catch(() => false);
  if (macAppLicensed()) return 'open';
  await syncServerLicense().catch(() => null);
  if (macAppLicensed()) return 'open';
  if (!ACCOUNTS || !isSignedInCached()) return 'signin';
  const r = await syncAccountLicense(true);
  if (macAppLicensed()) return 'open';
  if (r.state === 'none' || r.state === 'declined') return 'buy';
  // The Worker refuses an email nobody has confirmed (PLAN.md 23.10e), so a
  // password made in this window is a 401 until its link is opened.
  if (r.state === 'unreachable' && r.status === 401) return 'confirm';
  if (r.state === 'unreachable') return 'offline';
  if (r.state === 'unverifiable') return 'unverifiable';
  if (!navigator.onLine) return 'offline';
  // `skipped`: the cached flag said signed in, but Firebase has no session to
  // give a token for (signed out elsewhere, storage cleared). Sign in again.
  return 'signin';
}

export const AppLicenceGate: React.FC<{ onUnlocked: () => void }> = ({ onUnlocked }) => {
  const [step, setStep] = useState<Step>('checking');
  const [keyOpen, setKeyOpen] = useState(!ACCOUNTS);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);

  const open = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    if (handedOff()) setStep('done');
    else onUnlocked();
  }, [onUnlocked]);

  // The screen stays as it is while it asks again (the buy screen asks every
  // twenty seconds), and its buttons say they are asking.
  const [asking, setAsking] = useState(false);
  const check = useCallback(async () => {
    setAsking(true);
    const next = await look().catch((): Step => 'offline');
    setAsking(false);
    if (next === 'open') open();
    else setStep(next);
  }, [open]);

  useEffect(() => {
    void check();
    // A sign-in from the profile's form, the emailed link finishing, or a
    // sign-out from the buy screen: each is a new answer.
    return onAuthFlagChange(() => { void check(); });
  }, [check]);

  // A sign-in finished in the browser files its key with the app's server,
  // not with this window: ask the server until it has one.
  useEffect(() => {
    if (step === 'checking' || step === 'done') return;
    const t = setInterval(() => {
      void syncServerLicense().then(() => { if (macAppLicensed()) open(); }).catch(() => {});
    }, WATCH_MS);
    return () => clearInterval(t);
  }, [step, open]);

  // On the buy screen the purchase happens in the browser, and the store's
  // webhook files the key a few seconds later: ask the account now and then,
  // so coming back to the window is enough, with "check again" for the impatient.
  useEffect(() => {
    if (step !== 'buy') return;
    const t = setInterval(() => { void check(); }, 20_000);
    return () => clearInterval(t);
  }, [step, check]);

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await activateLocalLicenseKey(trimmed);
      if (res.valid && macAppLicensed()) { open(); return; }
      setError(
        res.detail ?? (res.error === 'expired'
          ? 'This licence key has expired.'
          : res.error === 'machine-limit'
            ? 'This licence key is already active on 2 machines.'
            : 'That is not a ChromaGlass licence key.'),
      );
    } catch {
      setError('Could not check the licence key.');
    } finally {
      setBusy(false);
    }
  };

  const confirmed = async () => {
    const m = await firebase();
    await m?.refreshAccountVerification().catch(() => false);
    await check();
  };
  const resend = async () => {
    const m = await firebase();
    await m?.resendVerificationEmail().catch(() => {});
  };

  const signOut = async () => {
    const m = await firebase();
    await m?.signOutCurrentAccount();
    setStep('signin');
  };

  const email = getCachedEmail();
  const button = 'min-h-[44px] w-full rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50';

  return (
    <div
      data-cg-signin=""
      data-cg-app-licence={step}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3"
      style={{ background: 'rgba(5, 5, 8, 0.55)', backdropFilter: 'blur(12px)' }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950/85 px-5 py-4 text-neutral-100 shadow-2xl">
        <div className="mb-3 text-center">
          <h1 className="text-lg font-medium tracking-wide text-neutral-100">ChromaGlass</h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            {step === 'done'
              ? 'Signed in'
              : step === 'buy'
                ? 'The app comes with ChromaGlass Home or Pro'
                : 'Sign in with the account you bought ChromaGlass with'}
          </p>
        </div>

        {step === 'checking' && <p className="py-4 text-center text-xs text-neutral-400">Checking your licence…</p>}

        {step === 'done' && (
          <p data-cg-app-licence-done="" className="text-center text-sm leading-snug text-neutral-200">
            Your licence is on this Mac now. Go back to the ChromaGlass app: it opens the show by itself. You can close this tab.
          </p>
        )}

        {step === 'signin' && LazySignInForm && (
          <Suspense fallback={<p className="py-4 text-center text-xs text-neutral-400">Loading…</p>}>
            <LazySignInForm onSignedIn={() => { void check(); }} />
          </Suspense>
        )}

        {step === 'buy' && (
          <div data-cg-app-licence-buy="" className="flex flex-col gap-2">
            <p className="text-center text-xs leading-snug text-neutral-400">
              {email ? <>Signed in as <span className="text-neutral-200">{email}</span>. </> : null}
              This account has no Home or Pro licence yet. The website stays free; the app is what they add.
            </p>
            <a
              href={buildCheckoutUrl(CHECKOUT_HOME_URL, email)}
              target="_blank"
              rel="noopener noreferrer"
              data-cg-app-licence-checkout="home"
              className={`${button} flex items-center justify-center border border-white/15 bg-white/10 text-neutral-100 hover:bg-white/15`}
            >
              Buy Home · $35 once
            </a>
            <a
              href={buildCheckoutUrl(CHECKOUT_PRO_URL, email)}
              target="_blank"
              rel="noopener noreferrer"
              data-cg-app-licence-checkout="pro"
              className={`${button} flex items-center justify-center border border-lit bg-lit text-on-lit`}
            >
              Buy Pro · $199 once
            </a>
            <button type="button" data-cg-app-licence-recheck="" onClick={() => { void check(); }} className={`${button} border border-white/15 bg-white/5 text-neutral-200 hover:bg-white/10`}>
              {asking ? 'Checking…' : 'I have bought it: check again'}
            </button>
            <button type="button" onClick={() => { void signOut(); }} className="mt-1 text-center text-[11px] text-neutral-400 underline-offset-2 hover:underline">
              Use another account
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div data-cg-app-licence-confirm="" className="flex flex-col gap-2">
            <p className="text-center text-xs leading-snug text-neutral-300">
              Confirm your email first: the link is in the mail sent to {email ?? 'your address'}. It opens in your browser; come back here once it says the email is confirmed.
            </p>
            <button type="button" onClick={() => { void confirmed(); }} className={`${button} border border-white/15 bg-white/10 text-neutral-100 hover:bg-white/15`}>
              {asking ? 'Checking…' : 'I have confirmed it'}
            </button>
            <button type="button" onClick={() => { void resend(); }} className="text-center text-[11px] text-neutral-400 underline-offset-2 hover:underline">
              Send the link again
            </button>
            <button type="button" onClick={() => { void signOut(); }} className="text-center text-[11px] text-neutral-400 underline-offset-2 hover:underline">
              Use another account
            </button>
          </div>
        )}

        {step === 'offline' && (
          <div data-cg-app-licence-offline="" className="flex flex-col gap-2">
            <p className="text-center text-xs leading-snug text-neutral-300">
              The licence server cannot be reached. The app needs the internet once, to bring your licence to this Mac; after that it opens with no connection at all.
            </p>
            <button type="button" onClick={() => { void check(); }} className={`${button} border border-white/15 bg-white/10 text-neutral-100 hover:bg-white/15`}>
              {asking ? 'Checking…' : 'Try again'}
            </button>
          </div>
        )}

        {step === 'unverifiable' && (
          <p className="text-center text-xs leading-snug text-neutral-300">
            This account's licence could not be checked on this Mac. Update the app, or write to us from the address you bought it with.
          </p>
        )}

        {step !== 'done' && step !== 'checking' && (
          <div className="mt-3">
            {!keyOpen ? (
              <button type="button" onClick={() => setKeyOpen(true)} className="w-full text-center text-[11px] text-neutral-400 underline-offset-2 hover:underline">
                Have a licence key?
              </button>
            ) : (
              <form onSubmit={activate} className="flex flex-col gap-2.5">
                <input
                  type="text"
                  required
                  data-cg-license-input=""
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="cg1.eyJ0aWVyIjoiaG9tZSI..."
                  aria-label="Licence key"
                  className="min-h-[42px] w-full rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 font-mono text-xs text-neutral-100 placeholder-neutral-500 focus:border-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  data-cg-license-activate=""
                  disabled={busy}
                  className={`${button} border border-white/15 bg-white/10 text-neutral-100 hover:bg-white/15`}
                >
                  {busy ? 'Checking…' : 'Use this key'}
                </button>
              </form>
            )}
            {error && (
              <p data-cg-license-error="" className="mt-2.5 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-1.5 text-center text-xs text-red-200">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppLicenceGate;
