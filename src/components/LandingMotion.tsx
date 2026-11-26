import React, { useEffect, useRef, useState } from 'react';
import { LANDING_HERO, LANDING_MUSIC } from '../lib/landingMedia';

/**
 * The webpage's two moving pictures (PLAN.md 34a-2): the hero's silent loop
 * and the clip that plays to music. Both are films of the Mac app; neither
 * starts the engine, so `npm run startup` and signin 3 still mean what they
 * said (the page pulls in no solver).
 *
 * What was asked (the owner, 2026-11-21): the hero, a cross-fade of five
 * 480 × 300 stills, to be a full-width loop filmed from the app, and a clip of
 * the plate playing to music, muted until it is tapped.
 *
 * The page's cost was the constraint. The first screen paints a still (the
 * loop's first frame, an ordinary eager picture, so `npm run loadtime` 4
 * waits for it as it waited for the five), and the loop is put in the page
 * only once that still has arrived and the browser has a moment, so the
 * headline and Play are never behind a video. A visitor who asks for reduced
 * motion, or whose browser says they are saving data, keeps the still. The
 * music clip asks for nothing until it is scrolled to.
 */

const prefers = (q: string): boolean => {
  try { return window.matchMedia(q).matches; } catch { return false; }
};
const savingData = (): boolean => {
  try { return Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData); } catch { return false; }
};
const ring = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

/**
 * The hero's background: the still at once, the loop over it once it plays.
 * The shape (wide or tall) is chosen once, from the window the page opened
 * in; a phone turned on its side afterwards still fills, cropped.
 */
export const HeroLoop: React.FC = () => {
  const [shape] = useState(() => {
    try { return window.innerWidth / Math.max(1, window.innerHeight) < LANDING_HERO.tallBelow ? LANDING_HERO.tall : LANDING_HERO.wide; } catch { return LANDING_HERO.wide; }
  });
  const [still] = useState(() => prefers('(prefers-reduced-motion: reduce)') || savingData());
  const [arrived, setArrived] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // The loop joins the page after the still has arrived, at the browser's next idle moment (or a second, at most).
  useEffect(() => {
    if (still || !arrived) return;
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
    if (w.requestIdleCallback) {
      const n = w.requestIdleCallback(() => setMounted(true), { timeout: 1000 });
      return () => w.cancelIdleCallback?.(n);
    }
    const t = window.setTimeout(() => setMounted(true), 300);
    return () => window.clearTimeout(t);
  }, [still, arrived]);

  // A hidden tab has nobody to show the loop to: it pauses, and carries on when the tab comes back.
  useEffect(() => {
    if (!mounted) return;
    const v = video.current;
    const on = () => { if (!v) return; if (document.hidden) v.pause(); else void v.play().catch(() => { /* the still stays */ }); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [mounted]);

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-bg">
      <img
        src={shape.poster}
        alt=""
        decoding="async"
        data-cg-hero-still=""
        onLoad={() => setArrived(true)}
        onError={() => setArrived(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {mounted && (
        <video
          ref={video}
          data-cg-hero-loop=""
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          disablePictureInPicture
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${playing ? 'opacity-100' : 'opacity-0'}`}
        >
          <source src={shape.webm} type='video/webm; codecs="vp9"' />
          <source src={shape.mp4} type="video/mp4" />
        </video>
      )}
    </div>
  );
};

/**
 * The plate playing to music: twenty seconds of a Song film with its sound.
 *
 * Browsers play a video by themselves only muted, and a page that makes a
 * sound before it is asked to is a page closed; so it plays muted once it is
 * half in view, pauses when it leaves, and a tap on "Sound on" (or anywhere on
 * it) is the visitor asking to hear it. The sound goes when the sign-in comes
 * up over the page (`covered`), so the card is not talked over. A visitor who
 * asks for reduced motion sees the still with a play button: pressing it is
 * asking for the motion and the sound together.
 */
export const MusicClip: React.FC<{ covered: boolean }> = ({ covered }) => {
  const [still] = useState(() => prefers('(prefers-reduced-motion: reduce)'));
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(false);
  const [near, setNear] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (e.isIntersecting && !still) setArmed(true);
    }, { threshold: 0.5 });
    /*
      The still, too, only once the card is a screen or so away. The browser's
      own `loading="lazy"` fetches an image within its own distance of the
      view (Chromium's is 1250 to 2500 pixels), and on a laptop that reached
      this card from the top of the page: its 1280 × 720 still came down beside
      the hero's poster and loop (landinghero 4, 2026-11-21). The webpage's
      first seconds are the hero's.
    */
    const nearIo = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); nearIo.disconnect(); } }, { rootMargin: '400px 0px' });
    io.observe(el);
    nearIo.observe(el);
    return () => { io.disconnect(); nearIo.disconnect(); };
  }, [still]);

  // Muted it follows the view; heard, it plays on until the visitor stops it or it leaves the view.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (covered) { v.muted = true; setMuted(true); v.pause(); return; }
    if (inView && (!still || !muted)) void v.play().catch(() => { /* the still stays */ });
    else v.pause();
  }, [armed, inView, covered, still, muted]);

  const toggle = () => {
    setArmed(true);
    const v = video.current;
    const next = !muted;
    setMuted(next);
    if (v) {
      v.muted = next;
      if (!next) void v.play().catch(() => { /* the still stays */ });
    }
  };

  const m = LANDING_MUSIC;
  return (
    <figure className="mt-8">
      <div ref={box} data-cg-music="" className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
        {(near || armed) && <img src={m.poster} alt={`${m.look}, filmed in the app as it plays ${m.title} by ${m.artist}`} width={1280} height={720} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        {armed && (
          <video
            ref={video}
            data-cg-music-video=""
            muted={muted}
            playsInline
            loop
            preload="auto"
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            onClick={toggle}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-0'}`}
          >
            <source src={m.webm} type='video/webm; codecs="vp9,opus"' />
            <source src={m.mp4} type="video/mp4" />
          </video>
        )}
        <button
          type="button"
          data-cg-music-sound=""
          aria-pressed={!muted}
          onClick={toggle}
          className={`absolute bottom-3 left-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-black/60 px-4 text-[14px] font-medium text-white backdrop-blur transition-colors hover:bg-black/75 ${ring}`}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="currentColor">
            <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" />
            {muted
              ? <path d="M13 7.5l4.5 5M17.5 7.5l-4.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
              : <path d="M13 7a4 4 0 010 6M15.2 5a7 7 0 010 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />}
          </svg>
          {muted ? (still && !armed ? 'Play with sound' : 'Sound on') : 'Sound off'}
        </button>
      </div>
      <figcaption data-cg-music-credit="" className="mt-3 text-[13px] leading-relaxed text-muted">
        {m.look}, playing to &ldquo;{m.title}&rdquo; by {m.artist} (
        <a href={m.page} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">scottbuckley.com.au</a>
        ), released under{' '}
        <a href={m.licence.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">{m.licence.name}</a>.
        Filmed in the app, nothing added afterwards.
      </figcaption>
    </figure>
  );
};
