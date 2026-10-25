import React, { useCallback, useEffect, useState } from 'react';
import {
  addPasswordToCurrentUser,
  authErrorMessage,
  getAccountMethods,
  refreshAccountVerification,
  resendVerificationEmail,
  MIN_PASSWORD_LENGTH,
  type AccountMethods,
} from '../lib/firebaseAuth';

/**
 * How this account signs in, and the one thing a signed-in person may need to
 * do about it: confirm the email, or set a password (PLAN 23.10e).
 *
 * Two jobs, both about the one account every sign-in method shares:
 *
 *   - A password account starts unconfirmed. The licence Worker refuses a token
 *     whose email is not verified (otherwise anyone could "sign up" as someone
 *     else's address and read their licence), so until the link is opened the
 *     account reads Free. Said here, plainly, with the two things that help: the
 *     mail again, and "I've confirmed", which renews the token and asks the
 *     Worker for the licence at once.
 *   - A Google or emailed-link account can have a password too ("Set a
 *     password"): the same uid, one more way in. Firebase asks for a recent
 *     sign-in for that, and the message says what to do when it does.
 *
 * Fetched lazily by the account sheet, like the sign-in form: Firebase stays
 * out of the entry chunk (`npm run signin` 2). It imports nothing of the app's
 * own beyond Firebase: the licence sync comes in as `onConfirmed`. A first try
 * imported `syncAccountLicense` here, and the lazy chunk reaching back into the
 * App's modules made Rollup lose the App's chunk (`preloadApp: no chunk for
 * src/App.tsx`), the same break the sheet's `LazySignInForm` note describes.
 */
const AccountSignInMethods: React.FC<{ onConfirmed: () => Promise<void> }> = ({ onConfirmed }) => {
  const [methods, setMethods] = useState<AccountMethods | null>(() => getAccountMethods());
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = useCallback(() => setMethods(getAccountMethods()), []);

  // The account can be signed in a moment after the sheet opens (the cached
  // user is read before Firebase answers): look again once it has.
  useEffect(() => {
    const t = window.setTimeout(reload, 1500);
    return () => window.clearTimeout(t);
  }, [reload]);

  if (!methods) return null;

  const handleResend = async () => {
    setBusy(true);
    setNote(null);
    try {
      await resendVerificationEmail();
      setNote({ kind: 'ok', text: `Sent again to ${methods.email}. Check the spam folder if it does not come.` });
    } catch (err: unknown) {
      setNote({ kind: 'error', text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmed = async () => {
    setBusy(true);
    setNote(null);
    try {
      const verified = await refreshAccountVerification();
      reload();
      if (verified) {
        await onConfirmed();
      } else {
        setNote({ kind: 'error', text: 'Not confirmed yet. Open the link in the email, then try again.' });
      }
    } catch (err: unknown) {
      setNote({ kind: 'error', text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setNote({ kind: 'error', text: `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.` });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await addPasswordToCurrentUser(password);
      setPassword('');
      setOpen(false);
      reload();
      setNote({ kind: 'ok', text: 'Password saved. You can sign in with it or the way you did before.' });
    } catch (err: unknown) {
      setNote({ kind: 'error', text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const label = 'text-[11px] font-medium uppercase tracking-wider text-dim';
  const ghostBtn =
    'flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover disabled:opacity-50';

  return (
    <>
      {!methods.emailVerified && (
        <div
          data-cg-account-verify=""
          className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] leading-snug text-warn"
        >
          <p>
            Confirm your email to use your licence and cloud copy on this account. We sent a link to {methods.email}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" data-cg-account-verify-done="" disabled={busy} onClick={handleConfirmed} className={ghostBtn}>
              I've confirmed
            </button>
            <button type="button" data-cg-account-verify-resend="" disabled={busy} onClick={handleResend} className={ghostBtn}>
              Send it again
            </button>
          </div>
        </div>
      )}

      <div data-cg-account-methods="" className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className={label}>Signs in with</span>
          <button
            type="button"
            data-cg-account-password-open=""
            onClick={() => {
              setOpen((v) => !v);
              setNote(null);
            }}
            className="text-[12px] text-muted underline decoration-faint underline-offset-2 hover:text-text"
          >
            {methods.passwordProvider ? 'Set a new password' : 'Set a password'}
          </button>
        </div>
        <p data-cg-account-methods-list="" className="mt-1 text-[13px] text-text-2">
          {[methods.google ? 'Google' : null, methods.passwordProvider ? 'Email (link or password)' : null]
            .filter(Boolean)
            .join(' · ') || 'Email'}
        </p>
        {open && (
          <form onSubmit={handleSetPassword} className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type={showPassword ? 'text' : 'password'}
                data-cg-account-password-input=""
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`New password, ${MIN_PASSWORD_LENGTH}+ characters`}
                aria-label="New password"
                autoComplete="new-password"
                className="min-h-10 pointer-coarse:min-h-12 w-full rounded-lg border border-border-strong bg-bg pl-3 pr-14 text-[13px] text-text placeholder-dim focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-1 min-w-[48px] rounded-md px-2 text-[12px] text-muted hover:text-text"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <button type="submit" data-cg-account-password-save="" disabled={busy || !password} className={ghostBtn}>
              Save
            </button>
          </form>
        )}
        {note && (
          <p
            data-cg-account-methods-note={note.kind}
            className={`mt-2 text-[12px] leading-snug ${note.kind === 'ok' ? 'text-ok' : 'text-live'}`}
          >
            {note.text}
          </p>
        )}
      </div>
    </>
  );
};

export default AccountSignInMethods;
