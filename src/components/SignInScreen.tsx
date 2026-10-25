import React, { useEffect, useState } from 'react';
import {
  getFirebaseAuth,
  signInWithProvider,
  sendMagicLink,
  completeEmailLinkSignIn,
  checkPendingRedirect,
  signUpWithPassword,
  signInWithPassword,
  sendPasswordReset,
  signInWithGoogleAddPassword,
  authErrorMessage,
  MIN_PASSWORD_LENGTH,
} from '../lib/firebaseAuth';
import { hasEmailSignInLink } from '../lib/authFlag';
import { getMarketingOptIn, setMarketingOptIn } from '../lib/tierGates';

interface SignInScreenProps {
  onSignedIn: () => void;
}

// Initialize Firebase Auth as soon as this lazy chunk loads so popup handlers fire synchronously.
getFirebaseAuth();

/**
 * Sign in with Apple is not offered (the owner, 2026-10-24: "I don't want to do
 * the apple developer account or accept logins from them. maybe later - but not
 * now."). The provider was never finished on the live project either: Apple's
 * half needs a Services ID and a key from a paid Apple Developer account, which
 * the project does not have, so the button offered a sign-in that could not
 * complete. The code stays
 * behind this one switch rather than being deleted, because the iPhone app
 * brings it back (App Store guideline 4.8 asks for it beside Google's; PLAN
 * 23.15), and `npm run signin` line 4 holds the switch off: it fails if the
 * button is drawn.
 */
const APPLE_SIGN_IN = false;

/**
 * The sign-in's buttons and the emailed-link form, without the screen around
 * them, so the profile sheet can offer the same sign-in to someone already in
 * the app (the owner, 2026-10-24: signed out while using the app, "there is no
 * way to re-sign in"). The first-visit screen below wraps the same form.
 */
export const SignInForm: React.FC<SignInScreenProps> = ({ onSignedIn }) => {
  const isCompletingLink = hasEmailSignInLink();
  const [emailOpen, setEmailOpen] = useState(isCompletingLink);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptInState] = useState(() => getMarketingOptIn());
  // The email panel has two ways in: the emailed link (what it was, and still
  // the one a returning link lands on) and a password (PLAN 23.10e).
  const [method, setMethod] = useState<'link' | 'password'>('link');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Sign-up hit an address that already has an account: the Google way to add the password.
  const [exists, setExists] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkPendingRedirect()
      .then((user) => {
        if (!cancelled && user) {
          onSignedIn();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as { message?: string })?.message || 'Sign-in could not complete.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  const handleProvider = async (providerId: 'google.com' | 'apple.com') => {
    setError(null);
    try {
      const user = await signInWithProvider(providerId);
      if (user) {
        onSignedIn();
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      setError((err as { message?: string })?.message || 'Could not sign in with provider.');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !password) return;
    setError(null);
    setExists(false);
    setResetSent(false);
    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`);
      return;
    }
    setSending(true);
    try {
      if (mode === 'signup') await signUpWithPassword(trimmed, password);
      else await signInWithPassword(trimmed, password);
      onSignedIn();
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'auth/email-already-in-use') setExists(true);
      else setError(authErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleGoogleAddPassword = async () => {
    setError(null);
    try {
      await signInWithGoogleAddPassword(email, password);
      onSignedIn();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError(authErrorMessage(err));
    }
  };

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Type your email above, then ask for the reset link.');
      return;
    }
    setError(null);
    setExists(false);
    try {
      await sendPasswordReset(trimmed);
      setResetSent(true);
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setSending(true);
    try {
      if (isCompletingLink) {
        const res = await completeEmailLinkSignIn(trimmed);
        if (!res.needsEmail) {
          onSignedIn();
          return;
        }
      } else {
        await sendMagicLink(trimmed);
        setSent(true);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Could not send sign-in link.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-cg-signin-provider="google.com"
            onClick={() => handleProvider('google.com')}
            className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-white/15 active:bg-white/20"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.81-1.5 3.34-3.2 4.37v3.62h5.18c3.03-2.79 4.78-6.9 4.78-11.82 0-.8-.08-1.57-.2-2.3z"
              />
              <path
                fill="currentColor"
                d="M12.18 22c4.32 0 7.95-1.43 10.6-3.88l-5.18-3.62c-1.43.96-3.26 1.53-5.42 1.53-4.17 0-7.7-2.81-8.96-6.6H-2.1v3.73C.54 18.4 5.94 22 12.18 22z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {APPLE_SIGN_IN && (
            <button
              type="button"
              data-cg-signin-provider="apple.com"
              onClick={() => handleProvider('apple.com')}
              className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-neutral-100 transition hover:bg-white/15 active:bg-white/20"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
              </svg>
              <span>Continue with Apple</span>
            </button>
          )}

          <button
            type="button"
            data-cg-signin-provider="email"
            onClick={() => {
              setEmailOpen(true);
              setError(null);
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-white/10 active:bg-white/15"
          >
            <span>Continue with email</span>
          </button>
        </div>

        {emailOpen && (
          <div className="mt-2.5 flex flex-col gap-2">
            {/* Not shown while a link is being completed: that page is the link's. */}
            {!isCompletingLink && (
              <div role="tablist" aria-label="Email sign-in" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                {(['link', 'password'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={method === m}
                    data-cg-signin-method={m}
                    onClick={() => {
                      setMethod(m);
                      setError(null);
                      setExists(false);
                    }}
                    className={`min-h-[44px] rounded-lg px-3 text-sm font-medium transition ${
                      method === m ? 'bg-white/15 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {m === 'link' ? 'Emailed link' : 'Password'}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={method === 'password' && !isCompletingLink ? handlePasswordSubmit : handleEmailSubmit}
              className="flex flex-col gap-2"
            >
              <input
                type="email"
                required
                data-cg-signin-email=""
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                autoComplete="email"
                className="min-h-[40px] w-full rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-accent focus:outline-none"
              />
              {method === 'password' && !isCompletingLink ? (
                <>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      data-cg-signin-password=""
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? `New password, ${MIN_PASSWORD_LENGTH}+ characters` : 'Password'}
                      aria-label="Password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="min-h-[44px] w-full rounded-xl border border-white/20 bg-black/50 py-2 pl-3.5 pr-16 text-sm text-neutral-100 placeholder-neutral-500 focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      data-cg-signin-show-password=""
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-1 flex min-w-[52px] items-center justify-center rounded-lg px-2 text-xs text-neutral-400 hover:text-neutral-100"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    data-cg-signin-password-submit=""
                    disabled={sending}
                    className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90 disabled:opacity-50"
                  >
                    {sending ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
                  </button>
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <button
                      type="button"
                      data-cg-signin-mode={mode === 'signup' ? 'signin' : 'signup'}
                      onClick={() => {
                        setMode(mode === 'signup' ? 'signin' : 'signup');
                        setError(null);
                        setExists(false);
                        setResetSent(false);
                      }}
                      className="min-h-[44px] underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100"
                    >
                      {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
                    </button>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        data-cg-signin-reset=""
                        onClick={handleReset}
                        className="min-h-[44px] underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  {resetSent && (
                    <p
                      data-cg-signin-reset-sent=""
                      className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-1.5 text-center text-xs text-emerald-200"
                    >
                      If {email.trim()} has an account, a link to choose a new password is on its way.
                    </p>
                  )}
                  {exists && (
                    <div
                      data-cg-signin-exists=""
                      className="flex flex-col gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs text-neutral-200"
                    >
                      <p>
                        {email.trim()} already has an account. Sign in below. Made it with Google? Continue with Google
                        and this password is added to the same account.
                      </p>
                      <button
                        type="button"
                        data-cg-signin-google-add=""
                        onClick={handleGoogleAddPassword}
                        className="min-h-[44px] rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-medium text-neutral-100 hover:bg-white/15"
                      >
                        Continue with Google and add this password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signin');
                          setExists(false);
                        }}
                        className="min-h-[44px] underline decoration-neutral-600 underline-offset-2 hover:text-neutral-50"
                      >
                        Sign in with a password instead
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="submit"
                    data-cg-signin-send=""
                    disabled={sending}
                    className="min-h-[40px] w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isCompletingLink
                      ? 'Complete sign-in'
                      : sending
                        ? 'Sending link…'
                        : 'Send sign-in link'}
                  </button>
                  {sent && (
                    <p
                      data-cg-signin-sent=""
                      className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-1.5 text-center text-xs text-emerald-200"
                    >
                      Sign-in link sent to {email}. Open the link in your email to continue.
                    </p>
                  )}
                </>
              )}
            </form>
          </div>
        )}

        {error && (
          <p
            data-cg-signin-error=""
            className="mt-2 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-1.5 text-center text-xs text-red-200"
          >
            {error}
          </p>
        )}

        <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] leading-snug text-neutral-300">
          <input
            type="checkbox"
            data-cg-marketing-optin=""
            checked={marketingOptIn}
            onChange={(e) => {
              const next = e.target.checked;
              setMarketingOptInState(next);
              setMarketingOptIn(next);
            }}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/30 bg-black accent-accent"
          />
          <span>
            Email me occasional ChromaGlass updates, new looks &amp; release notes (optional).
          </span>
        </label>

        <div className="mt-2 text-center text-[11px] leading-tight text-neutral-400">
          <span>By continuing, you agree to our </span>
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener"
            className="underline decoration-neutral-500 underline-offset-2 hover:text-neutral-200"
          >
            Terms
          </a>
          <span> &amp; </span>
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener"
            className="underline decoration-neutral-500 underline-offset-2 hover:text-neutral-200"
          >
            Privacy Policy
          </a>
          <span>.</span>
        </div>
    </>
  );
};

export const SignInScreen: React.FC<SignInScreenProps> = ({ onSignedIn }) => (
  <div
    data-cg-signin=""
    className="fixed inset-0 z-50 flex items-center justify-center p-2.5 overflow-y-auto"
    style={{ background: 'rgba(5, 5, 8, 0.55)', backdropFilter: 'blur(12px)' }}
  >
    <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-950/85 px-5 py-3.5 text-neutral-100 shadow-2xl">
      <div className="mb-2.5 text-center">
        <h1 className="text-lg font-medium tracking-wide text-neutral-100">ChromaGlass</h1>
        <p className="mt-0.5 text-xs text-neutral-400">
          Sign in to enter the studio
        </p>
      </div>
      <SignInForm onSignedIn={onSignedIn} />
    </div>
  </div>
);
export default SignInScreen;
