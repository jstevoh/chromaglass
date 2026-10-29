import React, { useEffect, useRef, useState } from 'react';
import { filmOf, LICENCE, type SiteFilm } from '../lib/siteFilms';

/**
 * The webpage's looks as films (PLAN.md 34a-6): each card a still that turns
 * into a few seconds of its look moving, and, once the look's minute is on
 * the channel, a button that opens that minute large, with its music.
 *
 * What was asked (the owner, 2026-10-29): the looks to animate when a pointer
 * is over them, the films to open larger, and a visitor able to hear them.
 *
 * - A pointer over a card (or the keyboard's focus on it) plays its loop, and
 *   leaving stops it where it is. The loop is a muted video of a few seconds
 *   (`src/lib/siteFilms.ts` says why not a GIF), and nothing of it is asked
 *   for until the card is first played: the page's first screen costs what
 *   it did, and `npm run loadtime` 4 still holds.
 * - A phone has no pointer to hover with, so there the card most in view in
 *   the row plays, one at a time, and a tap opens the film.
 * - A visitor who asks for reduced motion gets the stills; the film still
 *   opens, since pressing it is asking for it.
 * - The film opens over the page from youtube-nocookie.com, which sets no
 *   cookie until play, at the size of the screen; Escape, the close button or
 *   a click outside it closes it and gives the focus back to its card. The
 *   music's credit is under it, as the composer's licence asks.
 */

export interface LookCard { id: string; name: string; line: string }

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const noHover = (): boolean => {
  try { return window.matchMedia('(hover: none)').matches; } catch { return false; }
};

const ring = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

function Card({ look, playing, onWant, onOpen }: {
  look: LookCard;
  playing: boolean;
  onWant: (on: boolean) => void;
  onOpen: (() => void) | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // The video is put in the page only once the card is first played, so a
  // visitor who never points at it downloads none of it.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => { if (playing) setArmed(true); }, [playing]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => { /* a browser that will not play it keeps the still */ });
    else v.pause();
  }, [playing, armed]);

  const picture = (
    <div className="relative aspect-[8/5] w-full overflow-hidden bg-black">
      <img
        src={`/landing/looks/${look.id}.webp`}
        alt={`${look.name}: ${look.line}`}
        width={640}
        height={400}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-cover"
      />
      {armed && (
        <video
          ref={video}
          data-cg-loop={look.id}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          poster={`/landing/looks/${look.id}.webp`}
          onPlaying={() => setShown(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        >
          <source src={`/landing/films/${look.id}.webm`} type="video/webm" />
          <source src={`/landing/films/${look.id}.mp4`} type="video/mp4" />
        </video>
      )}
      {onOpen && (
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current"><path d="M2 1l9 5-9 5z" /></svg>
          Watch with sound
        </span>
      )}
    </div>
  );
  const words = (
    <div className="px-4 pb-4 pt-3 text-left">
      <p className="text-[14px] font-medium">{look.name}</p>
      <p className="mt-1 text-[13px] leading-snug text-muted">{look.line}</p>
    </div>
  );
  const hover = {
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') onWant(true); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') onWant(false); },
    onFocus: () => onWant(true),
    onBlur: () => onWant(false),
  };
  return (
    <li data-cg-look={look.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface min-[560px]:w-auto">
      {onOpen ? (
        <button type="button" aria-label={`Watch ${look.name} for a minute, with its music`} onClick={onOpen} className={`block w-full ${ring}`} {...hover}>
          {picture}{words}
        </button>
      ) : (
        <div tabIndex={0} className={`block w-full ${ring}`} {...hover}>{picture}{words}</div>
      )}
    </li>
  );
}

function Player({ look, film, onClose }: { look: LookCard; film: SiteFilm; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${look.name}, to ${film.track.title}`}
      data-cg-player={look.id}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm sm:px-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[min(1280px,calc((100svh-160px)*16/9))]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-white">{look.name} <span className="text-white/60">· {film.genre}</span></p>
          <button ref={close} type="button" onClick={onClose} aria-label="Close the film" className={`min-h-[44px] min-w-[44px] rounded-lg text-[22px] leading-none text-white/80 hover:text-white ${ring}`}>×</button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${film.youtube}?autoplay=1&rel=0&playsinline=1`}
            title={`${look.name}, to ${film.track.title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        <p data-cg-credit="" className="mt-2 text-[12px] leading-snug text-white/60">
          Music: “{film.track.title}” by {film.track.artist} (incompetech.com),
          licensed under <a className="underline hover:text-white" href={LICENCE.url} target="_blank" rel="noopener noreferrer">{LICENCE.name}</a>.
        </p>
      </div>
    </div>
  );
}

export function LookFilms({ looks }: { looks: LookCard[] }) {
  const [still] = useState(reducedMotion);
  const [touch] = useState(noHover);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const row = useRef<HTMLUListElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // A phone: the card most in view plays, and none while the row is off screen.
  useEffect(() => {
    const el = row.current;
    if (still || !touch || !el || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set((e.target as HTMLElement).dataset.cgLook ?? '', e.intersectionRatio);
      let best: string | null = null, most = 0.6;
      for (const [id, r] of seen) if (r >= most) { best = id; most = r; }
      setPlaying(best);
    }, { threshold: [0, 0.6, 0.8, 1] });
    el.querySelectorAll('[data-cg-look]').forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [still, touch]);

  // The page under the film does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const scroller = row.current?.closest('[data-cg-landing]') as HTMLElement | null;
    const was = scroller?.style.overflowY ?? '';
    if (scroller) scroller.style.overflowY = 'hidden';
    return () => { if (scroller) scroller.style.overflowY = was; };
  }, [open]);

  const shut = () => { setOpen(null); opener.current?.focus(); };
  const openLook = looks.find((l) => l.id === open);
  const openFilm = open ? filmOf(open) : undefined;

  return (
    <>
      {/* On a phone the looks are a row to swipe, so eight of them are not four screens of scrolling. */}
      <ul ref={row} className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-4">
        {looks.map((l) => {
          const film = filmOf(l.id);
          return (
            <Card
              key={l.id}
              look={l}
              playing={!still && playing === l.id}
              onWant={(on) => { if (!touch) setPlaying((p) => (on ? l.id : p === l.id ? null : p)); }}
              onOpen={film?.youtube ? () => { opener.current = document.activeElement as HTMLElement | null; setPlaying(null); setOpen(l.id); } : null}
            />
          );
        })}
      </ul>
      {openLook && openFilm?.youtube && <Player look={openLook} film={openFilm} onClose={shut} />}
    </>
  );
}

/** Whether any look's minute is on the channel yet, for the words over the cards. */
export const anyFilmOpens = (looks: LookCard[]): boolean => looks.some((l) => !!filmOf(l.id)?.youtube);
