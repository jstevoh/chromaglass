import React, { useEffect, useRef, useState } from 'react';
import { MAC_APP_NOTARISED, MAC_DOWNLOAD_URL, MAC_FIRST_OPEN, onMacComputer } from '../lib/macApp';
import { introOut } from '../lib/intro';
import { SiteFilms, anyFilmOpens } from './LandingFilms';
import { HeroLoop, MusicClip } from './LandingMotion';
import { LANDING_LOOKS, LANDING_LOOK_SIZE } from '../lib/landingMedia';
import { CHECKOUT_HOME_URL, CHECKOUT_MOIRE_URL, CHECKOUT_PRO_URL } from '../lib/checkoutLinks';

/*
 * The channel the looks are filmed for (PLAN 34a-8). The owner asked, on
 * 2026-11-08, for the homepage to point at it: six films went public that day,
 * each a look played to a 1920s record (modern ambient music since 2026-11-21,
 * PLAN 34a-6d), and a visitor deciding whether to press
 * Play free learns more from a minute of the plate moving to music than from
 * any still on this page. The handle, not a channel id, so the link reads as
 * what it is if someone copies it. It sits in the header, beside Sign in, so a
 * phone sees it on the first screen without scrolling past the looks, and again
 * under the looks, where someone who liked the stills wants to see them move.
 */
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@Chromaglassart';

/** YouTube's play mark, drawn small: recognisable at 18 px without loading their asset. */
const YouTubeMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 17" aria-hidden="true" className={className}>
    <rect width="24" height="17" rx="4.5" fill="#ff0033" />
    <path d="M9.6 4.9v7.2l6.2-3.6z" fill="#fff" />
  </svg>
);

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
 * The hero is a silent loop the Mac app filmed of its own looks playing to
 * music (LandingMotion.tsx, PLAN.md 34a-2), not the engine running live: a
 * visitor on a weak phone should not pay for a fluid solver to read a
 * headline. Its first frame paints at once as a still while the rest of the
 * page arrives, and the loop joins it once the still is in. (Until 2026-11-21
 * it was a cross-fade of five 480 × 300 stills, because nothing in a cloud
 * session can film the app; the films come from the owner's Mac now.) The
 * looks below are frames the app drew of its shipped looks on that Mac, at
 * twice their card's size (`npm run landinglooks`, src/lib/landingMedia.ts),
 * with each look's own name; nothing is mocked up.
 *
 * "Play free" mounts the sign-in over this page rather than replacing it, so
 * the card sits on the hero and a visitor who backs out of it is still on the
 * page. The choice is kept in sessionStorage for the tab: Google can
 * sign in by a redirect that reloads the page, and the sign-in screen is what
 * collects that redirect, so a reload with the flag set goes straight to it.
 *
 * Nothing on the page moves with sound (the owner's rule, 2026-10-11: no
 * whole-frame motion from sound), and nothing makes a sound until a visitor
 * asks: the one clip with music in it plays muted until it is tapped. It stops
 * moving for a visitor who asks for reduced motion; the first frame stands in.
 */

interface LandingProps {
  /** Open the sign-in over this page. */
  onPlay: () => void;
  /** The sign-in is up over the page: the page under it stops taking focus. */
  covered: boolean;
}


const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Play something', body: 'The plate listens to your music through the browser and answers each kick and note.' },
  { n: '2', title: 'Pick a look', body: 'Dye in water, oil, soap film or ferrofluid over a magnet. Every look is a different liquid.' },
  { n: '3', title: 'Stir it', body: 'Drop dye, blow, press, or drag a magnet under the glass. The liquid does the rest.' },
  { n: '4', title: 'Put it on the wall', body: 'Send the plate to a TV or projector. In the app, your phone becomes the remote.' },
];

/*
  The moiré pack (PLAN.md 45a-2), $15 on Home and in Pro: four of its seven looks, each a frame
  the app drew on this Mac's GPU two dozen seconds after the look was opened (a still a page
  load away, like the looks above). Kept at 960x600 for a 480x300 box: a pattern of fine lines
  scaled down in the browser beats against the screen's own pixels, so these are the one set
  that must not be drawn smaller than twice their box.
*/
const MOIRE: { id: string; name: string; line: string }[] = [
  { id: 'moire-star', name: 'Moiré Star', line: 'Two spoke sheets, one face down, wheeling into diamonds.' },
  { id: 'moire-ripple', name: 'Moiré Ripple', line: 'Two ring sheets slid apart, every pool of dye bending the fringes.' },
  { id: 'moire-press', name: 'Colour Press', line: 'Printer\'s screens at their angles, beating in colour over the dye.' },
  { id: 'moire-tunnel', name: 'Zoom Tunnel', line: 'Two log-polar grids, one turning, spiralling inward for ever.' },
];

const TIERS: { id: string; name: string; price: string; lines: string[]; buy?: string }[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'In your browser',
    lines: [
      'Every look, tool and liquid',
      'Sound, MIDI and the live desk',
      'One projector',
      'Clips up to 15 seconds, with a small corner mark',
    ],
  },
  {
    id: 'home',
    name: 'Home',
    price: '$29',
    buy: CHECKOUT_HOME_URL,
    lines: [
      'Full-length recording, 1080p and 4K render, no mark',
      'Phone remote',
      'Your own logo on the glass',
      'Live Show: stream to YouTube, Twitch and the rest',
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
      'OSC and Art-Net / DMX in the Mac app',
      'The finest 1024² grid, and cloud sync of your looks',
      'Make your own liquids',
    ],
  },
];

const btnPrimary =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 text-[15px] font-medium text-on-primary transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';
const btnGhost =
  'inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border-strong px-6 text-[15px] font-medium text-text-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]';

export const Landing: React.FC<LandingProps> = ({ onPlay, covered }) => {
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
      {/* Hero */}
      <section className="relative isolate flex min-h-[62svh] sm:min-h-[68svh] flex-col overflow-hidden">
        <HeroLoop />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,11,0.35) 0%, rgba(10,10,11,0.22) 40%, rgba(10,10,11,0.72) 82%, #0a0a0b 100%)' }}
        />

        <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-wide">ChromaGlass</span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cg-landing-youtube=""
              aria-label="ChromaGlass on YouTube"
              className="flex min-h-[44px] items-center gap-2 rounded-md px-3 text-[14px] text-text-2 transition-colors hover:text-text"
            >
              <YouTubeMark className="h-[14px] w-[20px] shrink-0" />
              YouTube
            </a>
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

        <div className="mx-auto my-auto flex w-full max-w-[1120px] flex-col px-4 py-12 sm:px-8 sm:py-16">
          <h1 className="max-w-[16ch] text-[clamp(38px,9vw,72px)] font-semibold leading-[1.04] tracking-[-0.025em]">
            A liquid light show you play to your music.
          </h1>
          <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-text-2 sm:text-[18px]">
            Oil, ink and ferrofluid on a glass plate, simulated drop by drop. Put a song on, pour some colour and throw it on the wall, at a gig or in your living room.
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
            Free in your browser for good, nothing to install. You sign in once with Google, Apple, an emailed link or a password.
          </p>
          <p className="mt-1 font-mono text-[12px] text-dim">
            Home $29 · Pro $199 · pay once, no subscription
          </p>
        </div>
      </section>

      {/* Looks */}
      <section id="looks" className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">Real looks from the app</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          Every picture here is a frame the app drew. Each look is a different liquid with its own physics.
        </p>
        {/* On a phone the looks are a row to swipe, so twelve of them are not six screens of scrolling. */}
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-4">
          {LANDING_LOOKS.map((l) => (
            <li key={l.id} data-cg-still={l.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-surface min-[560px]:w-auto">
              <div className="relative">
                <img
                  src={`/landing/looks/${l.id}.webp`}
                  alt={`${l.name}: ${l.line}`}
                  width={LANDING_LOOK_SIZE[0]}
                  height={LANDING_LOOK_SIZE[1]}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-[8/5] w-full object-cover"
                />
                {l.picture && (
                  // The picture the dyes were taken from, small in the corner: the card is about the two together.
                  <img
                    src={`/landing/looks/${l.id}-source.webp`}
                    alt="The picture its colours came from"
                    width={240}
                    height={150}
                    loading="lazy"
                    decoding="async"
                    className="absolute bottom-2 right-2 w-[34%] rounded-md border border-white/30 shadow-lg"
                  />
                )}
              </div>
              <div className="px-4 pb-4 pt-3">
                <p className="text-[14px] font-medium">{l.name}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted">{l.line}</p>
              </div>
            </li>
          ))}
        </ul>
        <a
          href={YOUTUBE_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-[44px] items-center gap-2.5 text-[15px] text-text-2 underline-offset-4 transition-colors hover:text-text hover:underline"
        >
          <YouTubeMark className="h-[17px] w-[24px] shrink-0" />
          Watch the looks move to music on our YouTube channel
        </a>
      </section>

      {/* Music: the plate playing to a song, muted until tapped (LandingMotion.tsx, PLAN.md 34a-2). */}
      <section id="music" className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-8 sm:pb-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">It plays to your music</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          The app hears the song and the liquid answers: drops on the beat, swells with the chorus. Turn the sound on to hear what it heard.
        </p>
        <MusicClip covered={covered} />
      </section>

      {/* Films: six pieces of modern ambient music, each played whole by a look (LandingFilms.tsx, PLAN.md 34a-6, 34a-6d). */}
      <section id="films" className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-8 sm:pb-24">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em] sm:text-[32px]">Six pieces of ambient music</h2>
        <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-muted">
          The app listening to six pieces by the composer Scott Buckley and playing each from the first note to the last, with nothing added afterwards.
          The music is his, under CC BY 4.0.{anyFilmOpens() ? ' Open one to watch it with the sound on.' : ''}
        </p>
        <SiteFilms />
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
          The whole plate is free in your browser, and it stays free: this is not a trial. Home and Pro add the Mac app and what a show needs:
          full-length recordings with no mark, the phone remote, OSC and Art-Net for a rig. Pay once, no subscription. Start with Home and move to
          Pro later for the $170 difference. The store opens in a new tab: buy with the email you will sign in with, so the app finds your licence.
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
        {/* The moiré pack (PLAN.md 45a-2): an add-on to Home, not a tier, so it sits under the
            cards rather than beside them. Its checkout files the pack onto the Home key held by
            the email it is bought with, hence the line about the email. On a phone the pictures
            are a row to swipe, as the looks above are. */}
        <div data-cg-landing-moire="" className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[16px] font-medium">The Moiré Pack</h3>
            <span className="font-mono text-[13px] text-text-2">$15 on Home · in Pro</span>
          </div>
          <p className="mt-2 max-w-[44rem] text-[14px] leading-snug text-muted">
            Seven looks with two printed transparencies on the light, stacked the way a light show crew stacks them on the overhead:
            their lines cross into fringes that turn, slide and breathe with the song, and every drop of liquid under them bends the pattern.
            Buy it with the email your Home key is under and it joins that key; Pro has it already. Anyone can try it for a minute in the app.
          </p>
          <ul className="-mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 min-[560px]:mx-0 min-[560px]:grid min-[560px]:grid-cols-2 min-[560px]:gap-4 min-[560px]:overflow-visible min-[560px]:px-0 lg:grid-cols-4">
            {MOIRE.map((l) => (
              <li key={l.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-lg border border-border min-[560px]:w-auto">
                <img
                  src={`/landing/moire/${l.id}.webp`}
                  alt={`${l.name}: ${l.line}`}
                  width={480}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-[8/5] w-full object-cover"
                />
                <div className="px-3 pb-3 pt-2">
                  <p className="text-[13px] font-medium">{l.name}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{l.line}</p>
                </div>
              </li>
            ))}
          </ul>
          {CHECKOUT_MOIRE_URL && (
            <a
              href={CHECKOUT_MOIRE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cg-landing-pack="moire"
              className={`${btnGhost} mt-5 w-full sm:w-auto`}
            >
              Buy the Moiré Pack, $15
            </a>
          )}
        </div>
        {/* What a rig needs to know, on a page of its own (PLAN.md 34a-7). */}
        <p data-cg-landing-pro="" className="mt-4 text-[14px] leading-relaxed text-text-2">
          Playing a rig? <a href="/pro.html" className="underline underline-offset-2 hover:text-text">What it syncs with, plugs into and records</a>, for VJs, synth players and producers.
        </p>
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
            I wanted the oil-and-glass light shows of the sixties on a screen I could play like an instrument, with a record on, in my own front room.
            So the liquid is simulated, not faked: dye spreads, oil refuses to mix with water, and a magnet pulls ferrofluid into spikes.
            One person makes ChromaGlass. If something breaks, or it isn't what you hoped, write
            to <a href="mailto:support@chromaglass.art" className="underline underline-offset-2 hover:text-text">support@chromaglass.art</a> and I'll answer you myself.
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
            Refunds within 14 days of buying: write to <a href="mailto:support@chromaglass.art" className="underline underline-offset-2 hover:text-text-2">support@chromaglass.art</a> or ask the store.{' '}
            <a href="/terms.html" className="underline underline-offset-2 hover:text-text-2">Terms</a>
            {' · '}
            <a href="/privacy.html" className="underline underline-offset-2 hover:text-text-2">Privacy</a>
            {' · '}
            <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text-2">YouTube</a>
          </p>
        </footer>
      </section>
    </div>
  );
};

export default Landing;
