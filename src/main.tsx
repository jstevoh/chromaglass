import {StrictMode, Component, lazy, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import { install as installCrashLog, record as crashRecord } from './lib/crashLog';
import { isPhoneApp } from './lib/appLink';
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
// The page a first visit meets before the sign-in (PLAN.md 34a). Its own chunk,
// with no Firebase and no engine in it.
const LazyLanding = lazy(() => import('./components/Landing'));
const LANDING_SEEN_KEY = 'chromaglass-landing-seen';

/**
 * Does this visit meet the landing page before the sign-in?
 *
 * Only the hosted site's own sign-in, on a first visit: not the iPhone app
 * (whose first screen is the plate), nor a desktop launch that asks for a
 * licence, nor a visit that is already part way through signing in. Google and
 * Apple sign in by a redirect that reloads the page, and the sign-in screen is
 * what collects it; the emailed link opens the page with its code in the
 * address. Both go straight to the sign-in. The tab remembers that the page
 * has been seen (sessionStorage), so the reload after a redirect does.
 */
function landingFirst(): boolean {
  if (!LazySignIn || isPhoneApp() || requiresDesktopSignInSync() || hasEmailSignInLink()) return false;
  try { return sessionStorage.getItem(LANDING_SEEN_KEY) !== '1'; } catch { return true; }
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

function Gate() {
  const gateActive =
    show && (Boolean(import.meta.env.VITE_FIREBASE_API_KEY) || requiresDesktopSignInSync());
  const [phase, setPhase] = useState<'app' | 'verifying-license' | 'completing-link' | 'signin'>(() => {
    if (!gateActive) return 'app';
    if (hasValidLicenseSync() || isSignedInCached()) return 'app';
    if (hasEmailSignInLink() && getPendingEmail()) return 'completing-link';
    if (hasStoredLicenseCandidateSync()) return 'verifying-license';
    return 'signin';
  });

  // The landing page is up behind the sign-in; the sign-in opens over it.
  const [landing] = useState(landingFirst);
  const [asking, setAsking] = useState(!landing);
  const play = () => {
    try { sessionStorage.setItem(LANDING_SEEN_KEY, '1'); } catch { /* the page is simply shown again */ }
    setAsking(true);
  };

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
            setPhase(res.needsEmail ? 'signin' : 'app');
          })
          .catch(() => {
            if (!cancelled) setPhase('signin');
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
          {asking && <LazySignIn onSignedIn={() => setPhase('app')} />}
        </>
      );
    }
    return <LazyLicenseGate onUnlocked={() => setPhase('app')} />;
  }
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
