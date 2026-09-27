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
 *          the show's own frames have stopped, so the plate hears once per
 *          frame the wall draws, in step with it.
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
 * How long the show's own frames may be missing before anything else reads:
 * three frames at 60 Hz, or one and a half of the window's own frame gap if
 * that is longer, up to a quarter of a second. Long enough that a frame late
 * by a long task does not hand the ear to the wall for one reading and back,
 * short enough that the wall's first frames after the show is covered are
 * already heard.
 *
 * Relative, not a fixed 50 ms, because a visible window on a phone or a tired
 * laptop can draw at 15 fps, 67 ms apart: with a fixed stall the tick read
 * between every two frames there, which near doubled the readings and so the
 * speed of the per-reading smoothing on exactly the machines that could least
 * afford the extra renders (the pre-push review measured 55 readings where
 * there used to be 30).
 */
export const EAR_STALL_MS = 50;
export const EAR_STALL_MAX_MS = 250;

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
  /** The window's own last frame-to-frame gap, ms (0 until two frames have come). */
  private frameGap = 0;
  /** Readings taken, by who offered them. For the check and `?debug`. */
  readonly reads: Record<EarDriver, number> = { frame: 0, ask: 0, tick: 0 };

  /** Whether the reading `driver` offers at `now` (ms) should be taken; counts it if so. */
  offer(driver: EarDriver, now: number): boolean {
    if (driver === 'frame') {
      // A gap over a second is the window coming back from being covered, not
      // its frame rate.
      const gap = now - this.offered.frame;
      if (gap > 0 && gap < 1000) this.frameGap = gap;
    }
    this.offered[driver] = now;
    const stall = this.stallMs();
    let take: boolean;
    if (driver === 'frame') take = true;
    else if (driver === 'ask') take = now - this.offered.frame > stall;
    else take = now - this.offered.frame > stall && now - this.offered.ask > stall;
    if (take && driver !== this.lastDriver && now - this.lastRead < EAR_MIN_GAP_MS) take = false;
    if (take) {
      this.reads[driver]++;
      this.lastRead = now;
      this.lastDriver = driver;
    }
    return take;
  }

  /** How long the frames may be missing before the others read, at the frame rate last seen. */
  stallMs(): number {
    // One frame seen and no rate yet: the longest wait, so the first gap of a
    // slow window is not read into (no frames at all never waits: see offer).
    if (this.frameGap === 0) return EAR_STALL_MAX_MS;
    return Math.min(EAR_STALL_MAX_MS, Math.max(EAR_STALL_MS, 1.5 * this.frameGap));
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
