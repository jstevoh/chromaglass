/**
 * Who reads the microphone, and when: the show's ear keeps hearing while its
 * window is hidden (PLAN.md §14a).
 *
 * What was wrong. The analyser was read on the show window's animation frames
 * and nowhere else (`useAudioAnalyzer`), and a browser gives a window it
 * thinks is hidden no animation frames at all. At a gig the show window spends
 * the set hidden: the projector window goes fullscreen in front of it, or the
 * performer switches to Ableton. The picture carried on, because the
 * projector window asks the show for its frames (`__chromaglassFrame` in
 * `LiquidVisualizer`), and the fades, the dimmer and the gamepad had already
 * been moved onto timers for the same reason. The ear had not. So the wall kept
 * moving on the last reading it had, which could be the top of a kick, and
 * stopped hearing the music for as long as the performer was looking at the
 * wall.
 *
 * Three things can offer a reading now, and this decides which of them takes
 * it:
 *
 *   frame  the show window's own animation frame, as before. Always taken:
 *          while the window is visible nothing about how the show hears has
 *          changed, reading for reading.
 *   ask    the projector window asking the show for a frame. Taken only while
 *          the show's own frames have stopped (see EAR_STALL_MS: after 50 ms when
 *          the page says it is hidden, after a quarter second when it does
 *          not), so the plate hears once per frame the wall draws.
 *   tick   a worker's timer, about sixty a second. Taken only while neither of
 *          the others is coming: the show hidden with no wall asking, which is
 *          still a show if a network display or the phone is drawing it, and
 *          still a room whose song changes need hearing.
 *
 * Why not simply read on a timer all the time, which would have been one line:
 * the level smoothing downstream (`smoothLevels`) is per reading, not per
 * second, so the rate a reading arrives at is part of how the plate moves. A
 * second clock beside the frames would have doubled the readings on a visible
 * window and made every look twitchier than the one saved. Taking the frames
 * first and the others only in their absence keeps one reading per drawn frame
 * whichever window is drawing.
 *
 * Why a worker's timer and not the page's: a hidden page's own timers are held
 * to about one a second, and after five minutes hidden much less (Chrome's
 * intensive throttling). A dedicated worker's timers are not throttled that
 * way, and its messages land on the page as ordinary tasks. That is Chrome's
 * documented behaviour, not something a headless browser can show, because a
 * headless window is never hidden; `npm run ears` withholds the animation
 * frames itself to stand in for it.
 *
 * Pure: no DOM, so `npm run ears` measures the arithmetic in node as well.
 */

export type EarDriver = 'frame' | 'ask' | 'tick';

/**
 * How long the show's own frames may be missing before anything else reads.
 *
 * While the page says it is hidden (`document.hidden`: Chrome marks a window
 * hidden when another covers it, as well as a background tab or a minimised
 * window), three frames at 60 Hz: the frames are not coming back, so the
 * wall's first frames after the show is covered are heard.
 *
 * While it says it is visible, a quarter of a second. A visible window's
 * frames arrive, just not on time: a phone at 15 fps is 67 ms apart, and the
 * Mac runner's app, busy, drew 28 a second with gaps well past 50 ms. A stall
 * measured from the frames alone let the tick read between them there (11
 * extra readings in two seconds on the runner; 55 where there used to be 30
 * at 15 fps in the pre-push review), which speeds up the per-reading
 * smoothing on the machines least able to afford the renders. A visible page
 * whose frames have stopped for a quarter second (a window manager that stops
 * them without saying so) still hears, a quarter second late.
 */
export const EAR_STALL_MS = 50;
export const EAR_STALL_VISIBLE_MS = 250;

/**
 * How long the tick holds back after the wall's last ask: a quarter second,
 * whether the page is hidden or not. The asks are the wall window's animation frames, and they are as
 * ragged as any window's: on the Mac runner, with the show covered and the
 * wall drawing 44 a second, the tick read 5 times in two seconds in the gaps
 * between them, the same doubling the visible stall was raised to stop. The
 * short stall is for the handover it was written for, the show's own frames
 * stopping as the wall covers it; the wall closing is the rarer event, and a
 * quarter second without a reading then is well inside EAR_DEAF_MS.
 */
export const EAR_ASK_HOLD_MS = 250;

/**
 * Two readings from *different* drivers closer than this are one. It stops a
 * wall's ask and the show's own frame landing in the same instant, as they can
 * when the window is uncovered, from both being read. It is never applied
 * between two readings of the same driver: at 240 Hz frames are 4.2 ms apart,
 * and with a little jitter a gap on every reading dropped three frames in ten.
 */
export const EAR_MIN_GAP_MS = 4;

/** How long without a reading, while listening, before the ear is called deaf (twice in a row; see the hook). */
export const EAR_DEAF_MS = 500;

export class EarClock {
  /** When each driver last offered, whether or not it was taken. */
  private offered: Record<EarDriver, number> = { frame: -Infinity, ask: -Infinity, tick: -Infinity };
  /** When a reading was last taken, by anyone, and by whom. */
  lastRead = -Infinity;
  private lastDriver: EarDriver | null = null;
  /** Readings taken, by who offered them. For the check and `?debug`. */
  readonly reads: Record<EarDriver, number> = { frame: 0, ask: 0, tick: 0 };

  /**
   * Whether the reading `driver` offers at `now` (ms) should be taken; counts
   * it if so. `hidden` is the page's `document.hidden` at the time.
   */
  offer(driver: EarDriver, now: number, hidden = false): boolean {
    this.offered[driver] = now;
    const stall = hidden ? EAR_STALL_MS : EAR_STALL_VISIBLE_MS;
    let take: boolean;
    if (driver === 'frame') take = true;
    else if (driver === 'ask') take = now - this.offered.frame > stall;
    else take = now - this.offered.frame > stall && now - this.offered.ask > EAR_ASK_HOLD_MS;
    if (take && driver !== this.lastDriver && now - this.lastRead < EAR_MIN_GAP_MS) take = false;
    if (take) {
      this.reads[driver]++;
      this.lastRead = now;
      this.lastDriver = driver;
    }
    return take;
  }

  /** Whether nothing has been heard for `EAR_DEAF_MS` at `now`. */
  stale(now: number): boolean {
    return now - this.lastRead > EAR_DEAF_MS;
  }
}

/*
  The projector's way in. The analyser lives in a React hook in App and the
  projector's frame ask arrives in LiquidVisualizer; this is the one place
  they meet, so neither has to be handed the other. One listener at a time,
  because there is one ear.
*/
let askListener: ((now: number) => void) | null = null;

/** The ear, registering to be offered a reading whenever the wall asks for a frame. */
export function onWallAsk(fn: ((now: number) => void) | null): void {
  askListener = fn;
}

/** The wall has asked the show for a frame: offer the ear a reading first, so the frame hears it. */
export function wallAsked(now: number): void {
  askListener?.(now);
}
