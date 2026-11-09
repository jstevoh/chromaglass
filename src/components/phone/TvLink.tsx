// The page a TV sends the player to: sign in on the phone, type the TV's code
// (PLAN.md 12-tv-signin). Opened at `/?tvlink`, or `/?tvlink=BDKMQXTZ` from the
// QR code a TV shows, which fills the code in.
//
// It is a phone page first, laid out for a thumb like the rest of this folder,
// and reads as well on a laptop. It loads no engine and no plate: main.tsx sends
// `?tvlink` here before the show's gate, the way it sends `?remote` to the remote.
// The sign-in is the site's own form (SignInForm), so Google, Apple, a password
// and an emailed link all work, and the account a TV is linked to is the account
// the player already signs in to everywhere else.

import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { claimTvCode, formatTvCodeInput, normalizeTvCode, type TvClaimResult } from '../../lib/tvCode';
import { CHECKOUT_HOME_URL, buildCheckoutUrl } from '../../lib/checkoutLinks';

type Phase = 'checking' | 'signin' | 'code' | 'sending' | 'done';

/* The sign-in form starts Firebase Auth when its module loads, and a build with
   no Firebase keys (a local checkout, the checks' builds) throws there and takes
   the whole page down with "could not start". main.tsx guards its own sign-in
   the same way: only a build with keys loads the form, and one without says that
   linking needs the site. */
const LazySignInForm = import.meta.env.VITE_FIREBASE_API_KEY
  ? lazy(() => import('../SignInScreen').then((m) => ({ default: m.SignInForm })))
  : null;

function messageFor(r: TvClaimResult | null): string {
  if (!r) return '';
  switch (r.state) {
    case 'ok': return '';
    case 'no-licence': return 'This account has no Home or Pro licence yet. The TV app comes with either.';
    case 'no-such-code': return 'That code is not waiting on any TV. Codes last ten minutes; check the TV for a fresh one.';
    case 'signed-out': return 'You were signed out. Sign in again, then send the code.';
    case 'too-many': return `Too many tries for now. Try again in ${Math.ceil(r.retryAfter / 60)} minutes.`;
    case 'unreachable': return 'Could not reach ChromaGlass. Check the phone is online and try again.';
  }
}

export default function TvLink(): React.ReactElement {
  const prefill = (() => {
    try { return formatTvCodeInput(new URLSearchParams(window.location.search).get('tvlink') || ''); } catch { return ''; }
  })();
  const [phase, setPhase] = useState<Phase>('checking');
  const [code, setCode] = useState(prefill);
  const [result, setResult] = useState<TvClaimResult | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refreshAccount = async () => {
    const auth = await import('../../lib/firebaseAuth').catch(() => null);
    const who = await auth?.getCurrentUserEmail().catch(() => null);
    setEmail(who ?? null);
    setPhase(who ? 'code' : 'signin');
  };
  useEffect(() => { void refreshAccount(); }, []);
  useEffect(() => { if (phase === 'code' && !prefill) input.current?.focus(); }, [phase, prefill]);

  const send = async () => {
    if (!normalizeTvCode(code)) return;
    setPhase('sending');
    const r = await claimTvCode(code);
    setResult(r);
    if (r.state === 'ok') setPhase('done');
    else if (r.state === 'signed-out') setPhase('signin');
    else setPhase('code');
  };

  const whole = normalizeTvCode(code) !== null;
  return (
    <div
      data-cg-tvlink=""
      className="min-h-[100dvh] w-full flex items-start sm:items-center justify-center bg-neutral-950 text-neutral-100 px-4 py-8"
      style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-medium tracking-wide text-center">Link a TV</h1>
        <p className="mt-1 text-sm text-neutral-400 text-center">
          Sign in, then type the code your TV is showing.
        </p>

        {phase === 'checking' && <p className="mt-8 text-center text-neutral-500 text-sm">One moment…</p>}

        {phase === 'signin' && (
          <div className="mt-6 rounded-2xl border border-white/15 bg-neutral-900/80 px-4 py-3">
            {result && <p className="mb-2 text-sm text-amber-300" role="alert">{messageFor(result)}</p>}
            {LazySignInForm ? (
              <Suspense fallback={<p className="text-sm text-neutral-500">One moment…</p>}>
                <LazySignInForm onSignedIn={() => { setResult(null); void refreshAccount(); }} />
              </Suspense>
            ) : (
              <p data-cg-tvnosignin="" className="text-sm text-neutral-400">
                Sign-in is not set up on this copy of ChromaGlass. Link the TV from chromaglass.art.
              </p>
            )}
          </div>
        )}

        {(phase === 'code' || phase === 'sending') && (
          <form
            className="mt-6"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <label htmlFor="cg-tv-code" className="block text-xs uppercase tracking-wider text-neutral-500">
              Code on the TV
            </label>
            <input
              id="cg-tv-code"
              ref={input}
              data-cg-tvcode=""
              value={code}
              onChange={(e) => { setCode(formatTvCodeInput(e.target.value)); setResult(null); }}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck={false}
              placeholder="BDKM-QXTZ"
              className="mt-1 w-full rounded-xl border border-white/20 bg-neutral-900 px-4 py-4 text-center text-3xl font-mono tracking-[0.2em] text-neutral-100 placeholder:text-neutral-700 focus:outline-none focus:border-white/50"
            />
            {result && result.state !== 'ok' && (
              <p className="mt-2 text-sm text-amber-300" role="alert">{messageFor(result)}</p>
            )}
            {result?.state === 'no-licence' && (
              <a
                className="mt-2 block text-center text-sm underline text-neutral-200"
                href={buildCheckoutUrl(CHECKOUT_HOME_URL, email)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get ChromaGlass Home
              </a>
            )}
            <button
              type="submit"
              data-cg-tvsend=""
              disabled={!whole || phase === 'sending'}
              className="mt-4 w-full min-h-12 rounded-xl bg-neutral-100 text-neutral-950 font-medium disabled:opacity-40"
            >
              {phase === 'sending' ? 'Linking…' : 'Link this TV'}
            </button>
            {email && <p className="mt-3 text-center text-xs text-neutral-500">Signed in as {email}</p>}
          </form>
        )}

        {phase === 'done' && result?.state === 'ok' && (
          <div className="mt-8 text-center" data-cg-tvdone="">
            <p className="text-lg">Linked.</p>
            <p className="mt-1 text-sm text-neutral-400">
              The TV unlocks in a few seconds with your {result.tier === 'pro' ? 'Pro' : 'Home'} licence.
            </p>
            <button
              type="button"
              className="mt-6 text-sm underline text-neutral-300"
              onClick={() => { setCode(''); setResult(null); setPhase('code'); }}
            >
              Link another TV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
