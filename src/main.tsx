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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="w-full h-screen bg-black" />}>
      <Root />
    </Suspense>
  </StrictMode>,
);
