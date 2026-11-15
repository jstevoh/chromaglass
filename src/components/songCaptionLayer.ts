import { drawSongCaption, onSongCaption, songCaptionNow } from '../lib/songCaption';

/**
 * The song's caption on the screen (PLAN 37x-10j, lib/songCaption.ts): a
 * canvas the size of the window, over the plate and under the desks, that
 * draws the card with the same function the stream's encoder uses, so the
 * two agree. It runs animation frames only while a card is up (eight
 * seconds a song) and is cleared and idle the rest of the time; it takes no
 * pointer, so the plate under it keeps its hands. Drawn at the device's
 * pixel ratio, up to two, so the letters are as sharp as the desk's type.
 *
 * Why a layer made here and not a component in App's tree: App.tsx is over
 * its size ceiling and may not grow (`npm run sizes`), and an element and
 * its import are bytes it cannot take (app/songCue.ts gives the same reason
 * for its holder). So useRemote, which already owns the show's titles, puts
 * this on the page while it is mounted. Fixed to the window, at z-index 5:
 * above the plate's canvas (no z-index of its own) and below every chip and
 * desk (z-10 and up), on the phone's layout as on the Mac's.
 */
export function mountSongCaptionLayer(): () => void {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.testid = 'song-caption';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let raf = 0;
  const frame = () => {
    raf = 0;
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    const cap = songCaptionNow();
    // Hidden between cards, so the compositor is not blending an empty window-sized layer over the plate all show.
    canvas.style.visibility = cap ? 'visible' : 'hidden';
    if (!cap) return;
    drawSongCaption(ctx, w, h, cap.lines, cap.alpha);
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const off = onSongCaption(kick);
  kick();
  return () => { off(); if (raf) cancelAnimationFrame(raf); canvas.remove(); };
}
