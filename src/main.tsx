import {StrictMode, Component, lazy, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const params = new URLSearchParams(window.location.search);
// The phone loads only the control surface — no visualizer, no solver.
const Root = params.has('remote')
  ? lazy(() => import('./components/RemoteControl'))
  : params.has('cast')
    ? lazy(() => import('./components/CastDisplay'))
    : lazy(() => import('./App'));

// Installable: the service worker is what lets Chrome and Edge offer
// "Install app", for a dock icon and a window with no browser chrome. Only
// on a built site: the dev server's modules must never be cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
  // Declared by hand: this project carries no @types/react, so the base
  // class's own members are invisible to tsc.
  declare props: { children: any };
  declare setState: (patch: { failed?: any; recovering?: boolean }) => void;
  state = { failed: null as any, recovering: false };
  static getDerivedStateFromError(failed: any) { return { failed, recovering: false }; }
  componentDidCatch(failed: any) {
    // Chunk-load failures are the recoverable kind: the code the page was
    // told to fetch is not there any more.
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(failed?.message ?? ''));
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot>
      <Suspense fallback={<Loading />}>
        <Root />
      </Suspense>
    </Boot>
  </StrictMode>,
);
