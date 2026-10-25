import React, { useEffect, useRef, useState } from 'react';
import { MAC_DOWNLOAD_URL, onMacComputer } from '../lib/macApp';
import { introOut } from '../lib/intro';

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
 * The hero is a slow cross-fade of five frames the app drew of its own looks,
 * not the engine running live: a visitor on a weak phone should not pay for a
 * fluid solver to read a headline, and a still paints at once while the rest of
 * the page arrives. Only opacity and transform move, which the compositor runs
 * on its own thread. What was tried first, a loop of the lab's plate as a
 * video, was set aside: the lab lays a few dye drops that barely move in the
 * seconds a hero has, and nothing in a cloud session can film the app itself
 * (PLAN.md 34a-2 asks for that film from a Mac). The looks below are frames
 * from the app's own renders of its shipped looks, with each look's own name;
 * nothing is mocked up. They are 480 × 300, so they are shown under a dark
 * scrim in the hero and at their own size in the grid.
 *
 * "Play free" mounts the sign-in over this page rather than replacing it, so
 * the card sits on the hero and a visitor who backs out of it is still on the
 * page. The choice is kept in sessionStorage for the tab: Google and Apple
 * sign in by a redirect that reloads the page, and the sign-in screen is what
 * collects that redirect, so a reload with the flag set goes straight to it.
 *
 * Nothing on the page moves with sound (the owner's rule, 2026-10-11: no
 * whole-frame motion from sound), and there is no sound at all. It stops
 * moving for a visitor who asks for reduced motion; the first frame stands in.
 */

interface LandingProps {
  /** Open the sign-in over this page. */
  onPlay: () => void;
  /** The sign-in is up over the page: the page under it stops taking focus. */
  covered: boolean;
}

interface LookCard { id: string; name: string; line: string }

// The names are the shipped looks' own (src/presets.ts); the lines are theirs,
// shortened. The pictures are 480 × 300 frames from the app's render of each
// look (PLAN.md 28i-1's contact sheets).
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

// Five of the looks above, in the order the hero shows them; each stays about
// HERO_SLIDE_S seconds, the last quarter of it crossing into the next.
const HERO = ['ferro-paint', 'aurora-borealis', 'jellyfish-bloom', 'neon-coral-reef', 'cell-bloom'];
const HERO_SLIDE_S = 7;

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Play something', body: 'The plate listens to your music through the browser and answers each kick and note.' },
  { n: '2', title: 'Pick a look', body: 'Dye in water, oil, soap film or ferrofluid over a magnet. Every look is a different liquid.' },
  { n: '3', title: 'Stir it', body: 'Drop dye, blow, press, or drag a magnet under the glass. The liquid does the rest.' },
  { n: '4', title: 'Put it on the wall', body: 'Send the plate to a TV or projector. In the app, your phone becomes the remote.' },
];

const TIERS: { name: string; price: string; lines: string[] }[] = [
  {
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
    name: 'Home',
    price: '$35',
    lines: [
      'Full-length recording, 1080p and 4K render, no mark',
      'Phone remote',
      'Song ID with timed lyrics',
      'Your own logo on the glass',
    ],
  },
  {
    name: 'Pro',
    price: '$199',
    lines: [
      'Everything in Home',
      'The Mac app: the show offline, the projector and phone remote built in',
      'Several projectors with edge blending',
      'OSC, Art-Net / DMX and MIDI out',
    ],
  },
];

function wantsStill(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const btnPrimary =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 text-[15px] font-medium text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';
const btnGhost =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border-strong px-6 text-[15px] font-medium text-text-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

export const Landing: React.FC<LandingProps> = ({ onPlay, covered }) => {
  const [still] = useState(wantsStill);
  const [mac] = useState(() => onMacComputer());
  const root = useRef<HTMLDivElement>(null);

  // The intro `index.html` painted has done its job: this page is what a
  // visitor sees now, and it should not sit under it turning.
  useEffect(() => { introOut('skip'); }, []);
  // Behind the sign-in card the page takes no focus and no taps.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (covered) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [covered]);

  return (
    <div
      ref={root}
      data-cg-landing=""
      className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-bg font-sans text-text"
    >
      <style>{`
        @keyframes cg-hero-slide {
          0% { opacity: 0; transform: scale(1); }
          5% { opacity: 1; }
          22% { opacity: 1; }
          28% { opacity: 0; transform: scale(1.07); }
          100% { opacity: 0; transform: scale(1.07); }
        }
        .cg-hero-slide { animation: cg-hero-slide ${HERO.length * HERO_SLIDE_S}s linear infinite; will-change: opacity, transform; }
      `}</style>
      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-bg">
          {HERO.map((id, i) => (
            <img
              key={id}
              src={`/landing/looks/${id}.webp`}
              alt=""
              decoding="async"
              style={still ? { opacity: i === 0 ? 1 : 0 } : { animationDelay: `${i * HERO_SLIDE_S - HERO_SLIDE_S / 4}s` }}
              className={`absolute inset-0 h-full w-full object-cover opacity-0 ${still ? '' : 'cg-hero-slide'}`}
            />
          ))}
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
          <button
            type="button"
            data-cg-landing-signin=""
            onClick={onPlay}
            className="min-h-[44px] rounded-md px-3 text-[14px] text-text-2 transition-colors hover:text-text"
          >
            Sign in
          </button>
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
            Free in your browser, nothing to install. Sign in with Google, Apple or an emailed link.
          </p>
          <p className="mt-1 font-mono text-[12px] text-dim">
            Home $35 · Pro $199 · one-time payment, no subscription
          </p>
        </div>
      </section>

      {/* Looks */}
      <section id="looks" className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">Real looks from the app</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          Each one is a frame from the solver, a different liquid with its own physics.
        </p>
        {/* On a phone the looks are a row to swipe, so eight of them are not four screens of scrolling. */}
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-4">
          {LOOKS.map((l) => (
            <li key={l.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface min-[560px]:w-auto">
              <img
                src={`/landing/looks/${l.id}.webp`}
                alt={`${l.name}: ${l.line}`}
                width={480}
                height={300}
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
          One payment, no subscription. Buying opens soon.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[16px] font-medium">{t.name}</h3>
                <span className="font-mono text-[13px] text-text-2">{t.price}</span>
              </div>
              <ul className="mt-4 space-y-2 text-[14px] leading-snug text-muted">
                {t.lines.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
        {/* The Mac app's download is a public file (the owner's choice,
            2026-10-25); what Pro unlocks is checked inside the app. On a phone
            or a PC there is nothing here to run, so it says where to get it. */}
        <p data-cg-landing-mac="" className="mt-4 text-[13px] leading-relaxed text-muted">
          {mac ? (
            <>Already on Pro? <a href={MAC_DOWNLOAD_URL} className="underline underline-offset-2 hover:text-text-2">Download the Mac app</a> (Apple silicon).</>
          ) : (
            <>The Mac app comes with Pro. Download it on your Mac from this page or from Profile &amp; Store.</>
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
