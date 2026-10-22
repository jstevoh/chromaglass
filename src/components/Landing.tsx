import React, { useEffect, useRef, useState } from 'react';
import { MAC_APP_NOTARISED, MAC_DOWNLOAD_URL, MAC_FIRST_OPEN, onMacComputer } from '../lib/macApp';
import { introOut } from '../lib/intro';
import { CHECKOUT_HOME_URL, CHECKOUT_PRO_URL } from '../lib/checkoutLinks';

/**
 * The page a first visit meets before the sign-in (PLAN.md 34a).
 *
 * What was reported: a first visit loaded the app ("Warming the lamp") and
 * landed on a name over three sign-in buttons, with nothing said about what
 * ChromaGlass is, what it costs or why an account is asked for. A visitor was
 * asked to sign in before they had seen a single drop of dye.
 *
 * What this is: a page, not the app. It is a lazy chunk of its own that pulls
 * in neither Firebase nor the engine, so the entry chunk and `npm run startup`
 * are as they were, and nothing here starts the solver: the check that the
 * plate does not start behind the sign-in (signin 3) still means what it said.
 * The pictures are the app's own: a first frame of the hero's film paints at
 * once, and the film itself (`npm run landingfilm`, PLAN.md 34a-2) is asked for
 * only after the page has loaded and a visitor's connection looks able to carry
 * it. It is a few seconds of the real plate with a track playing, looped so
 * that it does not jump. The three clips below it are the same, one per kind of
 * liquid, and the grid under them is a frame from each shipped look
 * (`npm run landinglooks`, 34a-3). Nothing is mocked up. Only opacity and
 * transform move on the page itself, which the compositor runs on its own
 * thread.
 *
 * Sound: browsers do not let a page start sound on its own, so every film
 * starts muted and has a "Sound on" button. One film has sound at a time; it is
 * muted again when it scrolls out of view, when the tab is hidden and when the
 * sign-in comes up. The films carry their own music, and nothing on the page
 * moves with sound (the owner's rule, 2026-10-11: no whole-frame motion from
 * sound). For a visitor who asks for reduced motion, or for less data, nothing
 * plays by itself: the first frame stands in and each clip has a button that
 * plays it, with its sound, when asked.
 *
 * "Play free" mounts the sign-in over this page rather than replacing it, so
 * the card sits on the hero and a visitor who backs out of it is still on the
 * page. The choice is kept in sessionStorage for the tab: Google can
 * sign in by a redirect that reloads the page, and the sign-in screen is what
 * collects that redirect, so a reload with the flag set goes straight to it.
 *
 * "Buy" on Home and Pro opens the store's own checkout in a new tab
 * (`checkoutLinks.ts`, the same links as the account sheet). A visitor has no
 * account yet, so the page asks them to buy with the email they will sign in
 * with: a licence belongs to the email on the order.
 */

interface LandingProps {
  /** Open the sign-in over this page. */
  onPlay: () => void;
  /** The sign-in is up over the page: the page under it stops taking focus. */
  covered: boolean;
}

interface LookCard { id: string; name: string; line: string }

// The names are the shipped looks' own (src/presets.ts); the lines are theirs,
// shortened. The pictures are 960 × 600 frames from the app's render of each
// look (`npm run landinglooks`).
const LOOKS: LookCard[] = [
  { id: 'ferro-paint', name: 'Ferro Paint', line: 'Black ferrofluid worked through amber, teal and coral under a wandering magnet.' },
  { id: 'aurora-borealis', name: 'Aurora Borealis', line: 'Curtains of jade and lime rippling across a night sky.' },
  { id: 'cell-bloom', name: 'Cell Bloom', line: 'Silicone breaking into rings of paint cells under a magnifier.' },
  { id: 'poster-1969', name: 'Poster, 1969', line: 'Two opaque dyes, orange against ultramarine, flat like a Fillmore poster.' },
  { id: 'macro-bead', name: 'Macro Bead', line: 'The camera follows one bead close up: cells, lacing, razor edges.' },
  { id: 'jellyfish-bloom', name: 'Jellyfish Bloom', line: 'Magenta and lavender bells pulsing through teal water.' },
  { id: 'lace-run', name: 'Lacing Run', line: 'A tongue of amber dye dragging black lace behind it.' },
  { id: 'neon-coral-reef', name: 'Neon Coral Reef', line: 'A reaction grows coral across the glass, branch by branch.' },
];

interface ClipCard { id: string; name: string; line: string }

// Filmed from the app by `npm run landingfilm`, each with a track playing.
const CLIPS: ClipCard[] = [
  { id: 'ferrofluid', name: 'Ferrofluid', line: 'Black ferrofluid pulled into maze lines and worked through colour.' },
  { id: 'dye-pour', name: 'Dye in water', line: 'Poured dye folding into itself, a slow swirl in the glass.' },
  { id: 'macro', name: 'Up close', line: 'The camera close in on a bead: cells, lacing and razor edges.' },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Play something', body: 'The plate listens to your music through the browser and answers each kick and note.' },
  { n: '2', title: 'Pick a look', body: 'Dye in water, oil, soap film or ferrofluid over a magnet. Every look is a different liquid.' },
  { n: '3', title: 'Stir it', body: 'Drop dye, blow, press, or drag a magnet under the glass. The liquid does the rest.' },
  { n: '4', title: 'Put it on the wall', body: 'Send the plate to a TV or projector. In the app, your phone becomes the remote.' },
];

const TIERS: { id: string; name: string; price: string; lines: string[]; buy?: string }[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'In your browser',
    lines: [
      'Every look, tool and liquid',
      'Sound, MIDI and the Design desk',
      'One projector',
      'Clips up to 15 seconds, with a small corner mark',
    ],
  },
  {
    id: 'home',
    name: 'Home',
    price: '$35',
    buy: CHECKOUT_HOME_URL,
    lines: [
      'Full-length recording, 1080p and 4K render, no mark',
      'Phone remote',
      'Song ID with timed lyrics',
      'Your own logo on the glass',
      'The Mac app: the show offline, the phone remote built in',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$199',
    buy: CHECKOUT_PRO_URL,
    lines: [
      'Everything in Home',
      'Several projectors with edge blending',
      'OSC, Art-Net / DMX and MIDI out',
    ],
  },
];

/**
 * Whether the page may start a film by itself: not for a visitor who asked for
 * reduced motion or less data, and not over a link that reports itself as slow.
 * Where the browser gives no hint, assume a good link.
 */
function mayAutoplay(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData) return false;
    if (c?.effectiveType && c.effectiveType !== '4g') return false;
  } catch { /* no hints */ }
  return true;
}

interface FilmOpts {
  /** The file's stem under /landing/clips. */
  id: string;
  /** May it start by itself, muted? Otherwise only the button plays it. */
  autoplay: boolean;
  /** Begin once the page has loaded (the hero) rather than when scrolled near. */
  eager?: boolean;
  /** Which film has sound now: one at a time. */
  sound: string | null;
  onSound: (id: string | null) => void;
  scroller: React.RefObject<HTMLElement | null>;
}

/**
 * One film on the page. Nothing is fetched until it is wanted: the <video> is
 * mounted (its poster loads) when the page has loaded, for the hero, or when it
 * is within a screen of the viewport, and it only downloads when it plays, in
 * view, with `preload="none"` until then. It pauses when scrolled out of view,
 * and gives up the sound when it does.
 */
function useFilm({ id, autoplay, eager, sound, onSound, scroller }: FilmOpts) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const hasSound = sound === id;

  useEffect(() => {
    if (!eager) return;
    if (!autoplay) return;
    let t = 0;
    const go = () => { t = window.setTimeout(() => setArmed(true), 400); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener('load', go); };
  }, [eager, autoplay]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); if (!eager) setArmed(true); return; }
    const near = eager ? null : new IntersectionObserver((e) => { if (e.some(x => x.isIntersecting)) { setArmed(true); near?.disconnect(); } },
      { root: scroller.current, rootMargin: '400px 0px' });
    near?.observe(el);
    const seen = new IntersectionObserver((e) => setVisible(e[e.length - 1].intersectionRatio >= 0.4),
      { root: scroller.current, threshold: [0, 0.4, 1] });
    seen.observe(el);
    return () => { near?.disconnect(); seen.disconnect(); };
  }, [eager, scroller]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (visible && (autoplay || started)) v.play().catch(() => { /* blocked: it stays on its first frame */ });
    else v.pause();
  }, [armed, visible, autoplay, started]);

  useEffect(() => { if (video.current) video.current.muted = !hasSound; }, [armed, hasSound]);
  // Out of view means out of earshot.
  useEffect(() => { if (!visible && hasSound) onSound(null); }, [visible, hasSound, onSound]);

  const toggleSound = () => {
    const v = video.current;
    if (hasSound) {
      onSound(null);
      if (!autoplay) setStarted(false);
      return;
    }
    setStarted(true);
    onSound(id);
    if (v) {
      // Inside the tap, so the browser lets the sound start.
      v.muted = false;
      v.play().catch(() => { v.muted = true; onSound(null); });
    }
  };

  return { box, video, armed, playing, setPlaying, hasSound, toggleSound };
}

const SoundButton: React.FC<{ id: string; on: boolean; autoplay: boolean; onClick: () => void; className?: string }> = ({ id, on, autoplay, onClick, className = '' }) => (
  <button
    type="button"
    data-cg-landing-sound={id}
    onClick={onClick}
    className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#000,0_0_0_4px_var(--color-accent)] ${className}`}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6m0-6-5 6" />}
    </svg>
    {autoplay ? (on ? 'Sound off' : 'Sound on') : (on ? 'Stop' : 'Play with sound')}
  </button>
);

const ClipItem: React.FC<{ clip: ClipCard; autoplay: boolean; sound: string | null; onSound: (id: string | null) => void; scroller: React.RefObject<HTMLElement | null> }> = ({ clip, autoplay, sound, onSound, scroller }) => {
  const f = useFilm({ id: clip.id, autoplay, sound, onSound, scroller });
  return (
    <li data-cg-landing-clip={clip.id} className="w-[82%] shrink-0 snap-start min-[560px]:w-[46%] lg:w-auto">
      <div ref={f.box} className="relative aspect-video overflow-hidden rounded-xl border border-border bg-surface">
        <img src={`/landing/clips/${clip.id}.jpg`} alt="" width={960} height={540} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        {f.armed && (
          <video
            ref={f.video}
            poster={`/landing/clips/${clip.id}.jpg`}
            muted loop playsInline preload="none"
            aria-label={`${clip.name}: ${clip.line}`}
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={`/landing/clips/${clip.id}.webm`} type="video/webm" />
            <source src={`/landing/clips/${clip.id}.mp4`} type="video/mp4" />
          </video>
        )}
        <SoundButton id={clip.id} on={f.hasSound} autoplay={autoplay} onClick={f.toggleSound} className="absolute bottom-2 right-2" />
      </div>
      <p className="mt-3 text-[14px] font-medium">{clip.name}</p>
      <p className="mt-1 text-[13px] leading-snug text-muted">{clip.line}</p>
    </li>
  );
};

const btnPrimary =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 text-[15px] font-medium text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';
const btnGhost =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border-strong px-6 text-[15px] font-medium text-text-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

export const Landing: React.FC<LandingProps> = ({ onPlay, covered }) => {
  const [still] = useState(wantsStill);
  const [mac] = useState(() => onMacComputer());

  const [autoplay] = useState(mayAutoplay);
  const root = useRef<HTMLDivElement>(null);
  // Which film has sound: 'hero', a clip's id, or none.
  const [sound, setSound] = useState<string | null>(null);
  const hero = useFilm({ id: 'hero', autoplay, eager: true, sound, onSound: setSound, scroller: root });

  // The intro `index.html` painted has done its job: this page is what a
  // visitor sees now, and it should not sit under it turning.
  useEffect(() => { introOut('skip'); }, []);
  // Behind the sign-in card the page takes no focus and no taps.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (covered) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [covered]);
  // The sign-in coming up, or the visitor leaving the tab (the store opens in another), ends the sound.
  useEffect(() => { if (covered) setSound(null); }, [covered]);
  useEffect(() => {
    const h = () => { if (document.hidden) setSound(null); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  return (
    <div
      ref={root}
      data-cg-landing=""
      className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-bg font-sans text-text"
    >
      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div ref={hero.box} aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-bg">
          {/* The film's first frame: it paints at once and is what the film fades in over. */}
          <img
            src="/landing/clips/hero.jpg"
            alt=""
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {hero.armed && (
            <video
              ref={hero.video}
              muted loop playsInline preload="none"
              tabIndex={-1}
              onPlaying={() => hero.setPlaying(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${hero.playing ? 'opacity-100' : 'opacity-0'}`}
            >
              <source src="/landing/clips/hero.webm" type="video/webm" />
              <source src="/landing/clips/hero.mp4" type="video/mp4" />
            </video>
          )}
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.2) 35%, rgba(10,10,11,0.75) 80%, #0a0a0b 100%)' }}
        />

        <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-wide">ChromaGlass</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            {hero.armed && hero.playing && (
              <SoundButton id="hero" on={hero.hasSound} autoplay onClick={hero.toggleSound} />
            )}
            <button
              type="button"
              data-cg-landing-signin=""
              onClick={onPlay}
              className="min-h-[44px] rounded-md px-3 text-[14px] text-text-2 transition-colors hover:text-text"
            >
              Sign in
            </button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-end px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-16 sm:px-8 sm:pb-16">
          <h1 className="max-w-[16ch] text-[clamp(38px,9vw,72px)] font-semibold leading-[1.04] tracking-[-0.025em]">
            A liquid light show that moves to your music.
          </h1>
          <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-text-2 sm:text-[18px]">
            Oil, ink and ferrofluid on a glass plate, simulated drop by drop. Play a song, pour some colour, and put it on the wall.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" data-cg-landing-play="" onClick={onPlay} className={btnPrimary}>
              Play free
            </button>
            <a href="#looks" className={btnGhost}>
              See the looks
            </a>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Free in your browser, nothing to install. Sign in with Google, an emailed link or a password.
          </p>
          <p className="mt-1 font-mono text-[12px] text-dim">
            Home $35 · Pro $199 · one-time payment, no subscription
          </p>
        </div>
      </section>

      {/* Films from the app */}
      <section id="clips" className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:px-8 sm:pt-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">See it move</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          Filmed from the app, with the music on. A browser will not play sound until you ask, so each clip starts quiet.
        </p>
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0">
          {CLIPS.map((c) => (
            <ClipItem key={c.id} clip={c} autoplay={autoplay} sound={sound} onSound={setSound} scroller={root} />
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-dim">
          Music in the films: AmbiSphere, public domain (<a href="https://archive.org/details/ambisphere" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text-2">archive.org</a>).
        </p>
      </section>

      {/* Looks */}
      <section id="looks" className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">Real looks from the app</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          Each one is a frame from the solver, a different liquid with its own physics.
        </p>
        {/* On a phone the looks are a row to swipe, so eight of them are not four screens of scrolling. */}
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-4">
          {LOOKS.map((l) => (
            <li key={l.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface min-[560px]:w-auto">
              <img
                src={`/landing/looks/${l.id}.webp`}
                alt={`${l.name}: ${l.line}`}
                width={960}
                height={600}
                loading="lazy"
                decoding="async"
                className="block aspect-[8/5] w-full object-cover"
              />
              <div className="px-4 pb-4 pt-3">
                <p className="text-[14px] font-medium">{l.name}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted">{l.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-8 sm:py-24">
          <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">How it works</h2>
          <ol className="mt-8 grid grid-cols-1 gap-x-8 gap-y-8 min-[560px]:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="font-mono text-[12px] text-dim">{s.n}</span>
                <p className="mt-1 text-[16px] font-medium">{s.title}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Free and paid */}
      <section className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">Free to play. Pay for the app.</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          The whole plate is free in your browser. The app adds what a room needs: unmarked recordings, the phone remote, more projectors.
          One payment, no subscription. The store opens in a new tab; buy with the email you will sign in with, so the app finds your licence.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className="flex flex-col rounded-xl border border-border bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[16px] font-medium">{t.name}</h3>
                <span className="font-mono text-[13px] text-text-2">{t.price}</span>
              </div>
              <ul className="mt-4 space-y-2 text-[14px] leading-snug text-muted">
                {t.lines.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <div className="mt-auto pt-6">
                {t.buy ? (
                  <a
                    href={t.buy}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cg-landing-buy={t.id}
                    className={`${btnPrimary} w-full`}
                  >
                    Buy {t.name}, {t.price}
                  </a>
                ) : (
                  <button type="button" data-cg-landing-tier-play="" onClick={onPlay} className={`${btnGhost} w-full`}>Play free</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* The Mac app's download is a public file (the owner's choice,
            2026-10-25); the app opens only on a Home or Pro key (PLAN.md
            23.17d: the owner chose Home too, 2026-10-26). On a phone or a PC
            there is nothing here to run, so it says where to get it. */}
        <p data-cg-landing-mac="" className="mt-4 text-[13px] leading-relaxed text-muted">
          {mac ? (
            <>On Home or Pro? <a href={MAC_DOWNLOAD_URL} className="underline underline-offset-2 hover:text-text-2">Download the Mac app</a> (Apple silicon).{!MAC_APP_NOTARISED && <> {MAC_FIRST_OPEN}</>}</>
          ) : (
            <>The Mac app comes with Home and Pro. Download it on your Mac from this page or from Profile &amp; Store.</>
          )}
        </p>
      </section>

      {/* From the maker */}
      <section className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-8 sm:pb-24">
        <div className="max-w-[40rem]">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">From the maker</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-2">
            I wanted the oil-and-glass light shows of the sixties on a screen I could play like an instrument, with a song on, in my own room.
            So the liquid here is simulated for real: dye spreading, oil refusing to mix, a magnet pulling ferrofluid into a maze.
            It is made by one person. If you try it and it is not for you, say so and I will make it right.
          </p>
        </div>
      </section>

      {/* Closing */}
      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start gap-5 px-4 py-14 sm:px-8">
          <p className="text-[20px] font-medium tracking-[-0.01em]">Open it and pour something.</p>
          <button type="button" onClick={onPlay} className={btnPrimary}>Play free</button>
        </div>
        <footer className="mx-auto w-full max-w-[1120px] px-4 pb-[max(32px,env(safe-area-inset-bottom))] sm:px-8">
          <p className="text-[12px] leading-relaxed text-dim">
            Refunds within 14 days of purchase, through the store. <a href="/terms.html" className="underline underline-offset-2 hover:text-text-2">Terms</a>
            {' · '}
            <a href="/privacy.html" className="underline underline-offset-2 hover:text-text-2">Privacy</a>
          </p>
        </footer>
      </section>
    </div>
  );
};

export default Landing;
