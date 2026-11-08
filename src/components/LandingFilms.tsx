import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SITE_FILMS, PUBLIC_DOMAIN, archiveUrl, type SiteFilm } from '../lib/siteFilms';

/**
 * The webpage's films (PLAN.md 34a-6): six records from before 1926, each a
 * card that is a still, turns into a few seconds of its film moving, and,
 * once the film is on the channel, opens the whole record large, with its
 * sound. They are a row of their own under the gallery of looks
 * (`src/lib/siteFilms.ts` says why there and not in place of it).
 *
 * What was asked (the owner, 2026-10-29): the cards to animate when a pointer
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
 *   record's credit is under it, with the archive's page for the transfer.
 */

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const noHover = (): boolean => {
  try { return window.matchMedia('(hover: none)').matches; } catch { return false; }
};

const ring = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

function Card({ film, playing, onWant, onOpen }: {
  film: SiteFilm;
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

  const { id, record } = film;
  const picture = (
    <div className="relative aspect-[8/5] w-full overflow-hidden bg-black">
      <img
        src={`/landing/films/${id}.webp`}
        alt={`${film.lookName}, the look playing ${record.title} by ${record.performer}`}
        width={640}
        height={400}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-cover"
      />
      {armed && (
        <video
          ref={video}
          data-cg-loop={id}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          poster={`/landing/films/${id}.webp`}
          onPlaying={() => setShown(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        >
          <source src={`/landing/films/${id}.webm`} type="video/webm" />
          <source src={`/landing/films/${id}.mp4`} type="video/mp4" />
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
      <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted">{film.kind} · {film.lookName}</p>
      <p className="mt-1 text-[14px] font-medium">{record.title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">{record.performer}</p>
    </div>
  );
  const hover = {
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') onWant(true); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') onWant(false); },
    onFocus: () => onWant(true),
    onBlur: () => onWant(false),
  };
  return (
    <li data-cg-look={id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface min-[560px]:w-auto">
      {onOpen ? (
        <button type="button" aria-label={`Watch ${record.title} by ${record.performer}, played by ${film.lookName}, with its sound`} onClick={onOpen} className={`block w-full ${ring}`} {...hover}>
          {picture}{words}
        </button>
      ) : (
        <div tabIndex={0} className={`block w-full ${ring}`} {...hover}>{picture}{words}</div>
      )}
    </li>
  );
}

function Player({ film, onClose }: { film: SiteFilm; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const { record } = film;
  const title = `${record.title}, played by ${film.lookName}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-cg-player={film.id}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-[max(12px,env(safe-area-inset-top))] backdrop-blur-sm sm:px-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[min(1280px,calc((100svh-160px)*16/9))]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium text-white">{record.title} <span className="text-white/60">· {film.lookName}</span></p>
          <button ref={close} type="button" onClick={onClose} aria-label="Close the film" className={`min-h-[44px] min-w-[44px] rounded-lg text-[22px] leading-none text-white/80 hover:text-white ${ring}`}>×</button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${film.youtube}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        <p data-cg-credit="" className="mt-2 text-[12px] leading-snug text-white/60">
          Music: “{record.title}” by {record.performer} ({record.published}), {PUBLIC_DOMAIN.name}.{' '}
          <a className="underline hover:text-white" href={archiveUrl(film)} target="_blank" rel="noopener noreferrer">Great 78 Project transfer</a>.
        </p>
      </div>
    </div>
  );
}

export function SiteFilms({ films = SITE_FILMS }: { films?: readonly SiteFilm[] }) {
  const [still] = useState(reducedMotion);
  const [touch] = useState(noHover);
  const [playing, setPlaying] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const row = useRef<HTMLUListElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const restoring = useRef(false);

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

  // One function for the life of the row, so the player's effect (which puts
  // the focus on its close button) runs once when it opens, not again on every
  // render of the page under it, which would pull the focus out of the film.
  // Closing gives the focus back to the card, and a card plays its loop on
  // focus; after a pointer opened it the loop would then run until the next
  // click, so the focus goes back without starting it.
  const shut = useCallback(() => {
    setOpen(null);
    restoring.current = true;
    opener.current?.focus();
    restoring.current = false;
  }, []);
  const openFilm = films.find((f) => f.id === open);

  return (
    <>
      {/* On a phone the films are a row to swipe, as the looks above are. */}
      <ul ref={row} className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-3">
        {films.map((f) => (
          <Card
            key={f.id}
            film={f}
            playing={!still && playing === f.id}
            onWant={(on) => { if (!touch && !(on && restoring.current)) setPlaying((p) => (on ? f.id : p === f.id ? null : p)); }}
            onOpen={f.youtube ? () => { opener.current = document.activeElement as HTMLElement | null; setPlaying(null); setOpen(f.id); } : null}
          />
        ))}
      </ul>
      {openFilm?.youtube && <Player film={openFilm} onClose={shut} />}
    </>
  );
}

/** Whether any film is on the channel yet, for the words over the cards. */
export const anyFilmOpens = (films: readonly SiteFilm[] = SITE_FILMS): boolean => films.some((f) => !!f.youtube);
