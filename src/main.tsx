import {StrictMode, lazy, Suspense} from 'react';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="w-full h-screen bg-black" />}>
      <Root />
    </Suspense>
  </StrictMode>,
);
