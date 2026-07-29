import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const isCastMode = new URLSearchParams(window.location.search).has('cast');
const Root = isCastMode
  ? lazy(() => import('./components/CastDisplay'))
  : lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="w-full h-screen bg-black" />}>
      <Root />
    </Suspense>
  </StrictMode>,
);
