import {StrictMode, Component, lazy, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { install as installCrashLog, record as crashRecord } from './lib/crashLog';
import { isPhoneApp } from './lib/appLink';
import { SHOW_PATH, isLandingAddress } from './lib/showPath';
import { macAppLicensed } from './lib/macApp';
import { requestGpuEarly } from './gpu/device';
import { installIntro, introOut } from './lib/intro';
import {
  isSignedInCached,
  hasEmailSignInLink,
  getPendingEmail,
  hasValidLicenseSync,
  hasStoredLicenseCandidateSync,
  verifyStoredLicenseOnLoad,
  requiresDesktopSignInSync,
  requiresPaidLicenceSync,
  stripEmailSignInParams,
  clearPendingEmail,
} from './lib/authFlag';

// The black box, first: whatever goes wrong from here on has a line
// (docs/crash-plan.md).
installCrashLog();

const params = new URLSearchParams(window.location.search);
const show = !params.has('remote') && !params.has('cast');
// The GPU, asked for now, while the app's chunks are still downloading:
// Chromium's start of it takes seconds on a cold Mac, and was waiting for
// them (gpu/device.ts). Not for the remote, which draws no plate, nor a
// cast, which mirrors the show's canvas when it can and asks for its own
// GPU only when it cannot.
if (show) requestGpuEarly();
// The intro `index.html` painted, listened to from here on: a key or a press
// on it takes it away, and the plate's first frame does (lib/intro.ts).
installIntro(show);
// The phone loads only the control surface — no visualizer, no solver.
const Root = params.has('remote')
  ? lazy(() => import('./components/RemoteControl'))
  : params.has('cast')
    ? lazy(() => import('./components/CastDisplay'))
    : lazy(() => import('./App'));

const LazySignIn = import.meta.env.VITE_FIREBASE_API_KEY
  ? lazy(() => import('./components/SignInScreen'))
  : null;
const LazyLicenseGate = lazy(() => import('./components/LicenseGate'));
const LazyAppLicenceGate = lazy(() => import('./components/AppLicenceGate'));
// The page a first visit meets before the sign-in (PLAN.md 34a). Its own chunk,
// with no Firebase and no engine in it.
const LazyLanding = lazy(() => import('./components/Landing'));
/**
 * Does this visit meet the landing page?
 *
 * A visitor who must sign in meets it first wherever they arrive (PLAN.md
 * 34a), except at the show's own address, `/show`, which asks at once. One
 * who need not sign in meets it at the site's own address, `/` with no app
 * word in its query (lib/showPath.ts): the owner's choice, 2026-10-24, after
 * the page came up only for a signed-out visit and the owner, signed in,
 * kept getting the plate at chromaglass.art. A shared look, the profile or
 * the remote still open the app for them.
 *
 * Never the iPhone app (whose first screen is the plate), a desktop launch
 * that asks for a licence, a build with no sign-in (the Mac app's show
 * server, the harnesses), or a visit part way through signing in. Play moves
 * the address from `/` to `/show` before the sign-in opens, so Google's and
 * Apple's redirect and the emailed link come back to the show; a redirect
 * still pending (one started before this change) skips the page too.
 */
function landingFirst(mustSignIn: boolean): boolean {
  if (!LazySignIn || isPhoneApp() || requiresDesktopSignInSync() || hasEmailSignInLink()) return false;
  try { if (sessionStorage.getItem('chromaglass-redirect-pending') === '1') return false; } catch { /* no session storage: the page is shown */ }
  const { pathname, search } = window.location;
  if (pathname.replace(/\/$/, '') === SHOW_PATH) return false;
  return mustSignIn || isLandingAddress(pathname, search);
}

// Installable: the service worker is what lets Chrome and Edge offer
// "Install app", for a dock icon and a window with no browser chrome. Only
// on a built site: the dev server's modules must never be cached. Not in the
// iPhone app, whose files are already on the phone (lib/appLink.ts): a worker
// there would only be a second copy that can go stale.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isPhoneApp()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* http on a LAN address: no worker, no harm */ }); });
}

/**
 * Throw away everything this origin has stored about the app — the service
 * worker and its caches — and come back on a clean copy.
 *
 * Once per session, tracked in sessionStorage: if a clean copy still cannot
 * start, reloading again would only produce the same black screen forever,
 * and the message below is more use than another attempt.
 */
const RESET_ONCE = 'chromaglass-recovered';
async function startOver(): Promise<boolean> {
  if (sessionStorage.getItem(RESET_ONCE) === '1') return false;
  sessionStorage.setItem(RESET_ONCE, '1');
  try {
    if ('serviceWorker' in navigator) {
      for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    }
    if ('caches' in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch { /* private window, or storage refused: the reload is still worth a try */ }
  location.reload();
  return true;
}

/**
 * The page opened at an address on the Wi-Fi rather than at localhost (PLAN
 * 14m-lan). Browsers give WebGPU only to a secure page, which is https or the
 * machine's own name, so the laptop's own page opened at its Wi-Fi address
 * (`http://192.168.1.5:3000/`) cannot start at all: what it said was the
 * bare "GPUTextureUsage is not defined" of the first shader module. The show
 * server also hands the display key only to localhost, so even in a browser
 * told to treat the address as secure that page could not link phones. The
 * way out is the same page at localhost on the same port, said in plain words.
 * A network display at a Wi-Fi address meets the same wall and has no such way
 * out yet (PLAN 14m-https). Null on a secure page, where the failure is something else.
 */
function insecureAddress(): { local: string; cast: boolean } | null {
  if (typeof window === 'undefined' || window.isSecureContext) return null;
  const { hostname, port, search } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return null;
  // A network display (`?cast=true`) is another machine: its localhost is not
  // the laptop, so it is told only why, not sent somewhere that is not the show.
  return { local: `http://localhost${port ? `:${port}` : ''}/`, cast: new URLSearchParams(search).has('cast') };
}

/**
 * Anything that stops the app rendering shows up here.
 *
 * The app is one lazy import behind a `<Suspense>` whose fallback is a black
 * rectangle the size of the window. Without this, a chunk that fails to load
 * leaves that rectangle up for good and says nothing — which is what a blank
 * screen on the live site was. A failed chunk is nearly always a stale cache,
 * so the first move is to clear it and come back; the message is for when
 * that has already been tried.
 */
class Boot extends Component<{ children: any }, { failed: any; recovering: boolean }> {
  state = { failed: null as any, recovering: false };
  static getDerivedStateFromError(failed: any) { return { failed, recovering: false }; }
  componentDidCatch(failed: any) {
    // Chunk-load failures are the recoverable kind: the code the page was
    // told to fetch is not there any more.
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(failed?.message ?? ''));
    // The whole app is down: the box's line for it, read on the next load.
    crashRecord('fatal', 'react', `${chunk ? 'a chunk would not load: ' : ''}${String(failed?.message ?? failed)}${failed?.stack ? `\n${String(failed.stack).split('\n').slice(1, 4).join('\n')}` : ''}`);
    if (chunk) {
      this.setState({ recovering: true });
      void startOver().then(reloading => { if (!reloading) this.setState({ recovering: false }); });
    }
  }
  render() {
    const { failed, recovering } = this.state;
    if (!failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-[15px] text-white/90">
          {recovering ? 'Clearing a stale copy and reloading…' : 'ChromaGlass could not start.'}
        </p>
        {!recovering && (
          <>
            <p className="max-w-md text-[13px] leading-relaxed text-white/50">{String(failed?.message ?? failed)}</p>
            {insecureAddress() && (
              <p className="max-w-md text-[13px] leading-relaxed text-white/80" data-testid="boot-insecure">
                This page was opened at a Wi-Fi address, and browsers run the GPU only on a secure page (https, or the computer's own localhost).{' '}
                {insecureAddress()!.cast ? (
                  'A network display cannot start from this address.'
                ) : (
                  <>On the laptop running the show, open <a className="font-mono underline" href={insecureAddress()!.local}>{insecureAddress()!.local}</a> instead.</>
                )}
              </p>
            )}
            <button
              onClick={() => { sessionStorage.removeItem(RESET_ONCE); void startOver(); }}
              className="rounded-md border border-white/20 px-4 py-2 text-[13px] text-white/90 transition-colors hover:bg-white/10"
            >
              Clear the cache and reload
            </button>
          </>
        )}
      </div>
    );
  }
}

/**
 * The black rectangle, with a way out of it.
 *
 * A chunk that rejects is caught above. A chunk that simply never arrives is
 * not an error and never will be, so after a few seconds this stops being a
 * blank screen and starts being a button.
 */
function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(t); }, []);
  // The intro sits over this rectangle, so the way out would be under it.
  useEffect(() => { if (slow) introOut('slow'); }, [slow]);
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      {slow && (
        <>
          <p className="text-[13px] text-white/50">Still loading. A stale cached copy can do this.</p>
          <button
            onClick={() => { sessionStorage.removeItem(RESET_ONCE); void startOver(); }}
            className="rounded-md border border-white/20 px-4 py-2 text-[13px] text-white/90 transition-colors hover:bg-white/10"
          >
            Clear the cache and reload
          </button>
        </>
      )}
    </div>
  );
}

const orSignIn = () => (hasValidLicenseSync() || isSignedInCached() ? 'app' : 'signin');

/**
 * The Mac app, and a browser on its server: the show opens on a Home or Pro
 * key and on nothing less (PLAN.md 23.17d, components/AppLicenceGate.tsx). A
 * licensed launch never sees the gate, not even for a frame: the key the app's
 * shell verified at launch is read here, synchronously.
 */
function PaidGate() {
  const [phase, setPhase] = useState<'app' | 'verifying-license' | 'gate'>(() =>
    macAppLicensed() ? 'app' : hasStoredLicenseCandidateSync() ? 'verifying-license' : 'gate');
  // A key in this browser's storage is checked against its signature before
  // anything is drawn, so a licensed start shows the loading screen for that
  // moment and never the gate (`npm run tiers` 7).
  useEffect(() => {
    if (phase !== 'verifying-license') return;
    let cancelled = false;
    void verifyStoredLicenseOnLoad()
      .then(() => { if (!cancelled) setPhase(macAppLicensed() ? 'app' : 'gate'); })
      .catch(() => { if (!cancelled) setPhase('gate'); });
    return () => { cancelled = true; };
  }, [phase]);
  if (phase === 'app') return <Root />;
  if (phase === 'verifying-license') return <Loading />;
  return <LazyAppLicenceGate onUnlocked={() => setPhase('app')} />;
}

function Gate() {
  return show && requiresPaidLicenceSync() ? <PaidGate /> : <SiteGate />;
}

function SiteGate() {
  const gateActive =
    show && (Boolean(import.meta.env.VITE_FIREBASE_API_KEY) || requiresDesktopSignInSync());
  const [phase, setPhase] = useState<'app' | 'verifying-license' | 'completing-link' | 'signin'>(() => {
    if (!gateActive) return 'app';
    // An emailed sign-in link is finished before anything else: a browser that
    // holds a licence used to go straight to the app with the link's code left
    // unused, so signing in by email from the profile sheet, on a licensed
    // machine, came back still signed out (`npm run signin` 16).
    // Offline, a browser already let in goes to the show rather than wait on
    // Firebase's network timeout; the link is still in the address for later.
    if (hasEmailSignInLink() && getPendingEmail() && (navigator.onLine || orSignIn() === 'signin')) return 'completing-link';
    if (hasValidLicenseSync() || isSignedInCached()) return 'app';
    if (hasStoredLicenseCandidateSync()) return 'verifying-license';
    return 'signin';
  });

  // The landing page is up at `/`; for a visitor who must sign in, the
  // sign-in opens over it, and for one who need not, Play opens the show.
  const [landing, setLanding] = useState(() => landingFirst(phase !== 'app'));
  const [asking, setAsking] = useState(!landing);
  const play = () => {
    try {
      if (window.location.pathname === '/') {
        window.history.pushState(window.history.state, '', `${SHOW_PATH}${window.location.search}${window.location.hash}`);
      }
    } catch { /* a sandboxed frame: the address stays, the show still opens */ }
    if (phase === 'app') setLanding(false); else setAsking(true);
  };
  const signedIn = () => { setLanding(false); setPhase('app'); };

  // Back from the sign-in to the webpage uncovers it. Once the plate is up,
  // back changes the address and nothing else: no auth or address change
  // takes a running show down (the never-lock-out rule, PLAN.md 23.10).
  useEffect(() => {
    if (!landing) return;
    const onPop = () => {
      if (window.location.pathname === '/') setAsking(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [landing]);

  useEffect(() => {
    if (!gateActive) return;
    if (phase === 'app') {
      if (import.meta.env.VITE_FIREBASE_API_KEY) {
        void import('./lib/firebaseAuth').then((m) => m.verifyReturningUserInBackground());
      }
      return;
    }
    if (phase === 'verifying-license') {
      let cancelled = false;
      void verifyStoredLicenseOnLoad()
        .then((valid) => {
          if (!cancelled) setPhase(valid ? 'app' : 'signin');
        })
        .catch(() => {
          if (!cancelled) setPhase('signin');
        });
      return () => {
        cancelled = true;
      };
    }
    if (phase === 'completing-link') {
      if (import.meta.env.VITE_FIREBASE_API_KEY) {
        let cancelled = false;
        void import('./lib/firebaseAuth')
          .then((m) => m.completeEmailLinkSignIn())
          .then((res) => {
            if (cancelled) return;
            setPhase(res.needsEmail ? orSignIn() : 'app');
          })
          .catch(() => {
            // A spent or broken link never locks out a browser that was let in
            // before it (a licence, or a session): it goes on to the show. And it
            // is dropped, address and pending email both: left there, every load
            // tried it again, and the sheet's sign-in offered only "Complete
            // sign-in" on a dead link (the review of #460).
            if (cancelled) return;
            if (navigator.onLine) {
              stripEmailSignInParams();
              clearPendingEmail();
            }
            setPhase(orSignIn());
          });
        return () => {
          cancelled = true;
        };
      }
    }
  }, [gateActive, phase]);

  if (phase === 'completing-link' || phase === 'verifying-license') {
    return <Loading />;
  }
  if (phase === 'signin') {
    if (LazySignIn) {
      return (
        <>
          {landing && <LazyLanding onPlay={play} covered={asking} />}
          {asking && <LazySignIn onSignedIn={signedIn} />}
        </>
      );
    }
    return <LazyLicenseGate onUnlocked={() => setPhase('app')} />;
  }
  if (landing && !asking) return <LazyLanding onPlay={play} covered={false} />;
  return <Root />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot>
      <Suspense fallback={<Loading />}>
        <Gate />
      </Suspense>
    </Boot>
  </StrictMode>,
);
