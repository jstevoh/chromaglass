/**
 * How many solver steps a frame takes, live (PLAN.md 14aa).
 *
 * The owner reported the show "a little jittery sometimes". One way a plate
 * judders with the machine idle is in the arithmetic that turns time into
 * steps. The loop added each frame's interval to an accumulator and took as
 * many whole steps as it held, `floor(acc / step)`. On a 60 Hz display with
 * sixty steps a second that is one step a frame only while the accumulator's
 * remainder sits away from a step's edge. It does not stay away. The interval
 * was read from `Date.now()`, which counts whole milliseconds, part way into
 * the frame, after a varying amount of work, so each frame's interval came in
 * as 16 or 17 ms with a millisecond or so of scatter on top; the remainder
 * walks at random, and whenever it wanders to an edge the scatter carries it
 * back and forth across it, a frame that takes no step followed by one that
 * takes two, again and again, until it wanders off. On the plate that is the
 * liquid stopping for a frame and then jumping two: a stutter in bursts, a
 * few times a minute, on a machine with headroom to spare. `npm run cadence`
 * models the old loop on the intervals a 60 Hz and a 120 Hz display give and
 * counts those frames.
 *
 * Two things fix it. The interval is the refresh's own, from the timestamp
 * the browser gives the frame (the draw gate's, `drawGate.lastDraw`), which
 * is the display's clock, regular to a few microseconds, and not when the
 * callback got round to reading a millisecond clock. And when the display's
 * refresh is a whole fraction or multiple of the step (60 Hz at sixty steps,
 * 120 Hz at sixty, 60 Hz at thirty), the clock counts refreshes rather than
 * seconds: one step every refresh, or every second, or two each. The film
 * render has always been counted this way, for the same reason ("1/60 +
 * 1/60 can floor to one step and then three, a judder a film would keep").
 * A refresh the page missed (an interval of two or three refreshes) is
 * counted as the refreshes it was, so a dropped frame still catches its
 * steps up, within the same cap as before.
 *
 * A display whose refresh is not a whole ratio of the step (90 Hz, 144 Hz, a
 * variable-rate panel) goes on with the accumulator, now on the refresh's
 * timestamps; it cannot be even there whatever is done, and the timestamps
 * alone take the random walk out of it.
 *
 * Not the physics: a step is the same `dt` either way. What changes is which
 * frame it is drawn on. Over a minute the locked clock takes the display's
 * refreshes times the ratio, so on a 59.94 Hz panel the plate runs 0.1 %
 * slow, the same 0.1 % a film of it at 59.94 would; the accumulator kept the
 * wall clock to the step at the cost of the stutter.
 */

/** How many recent intervals the refresh is judged from. */
const WINDOW = 32;
/** Fewest intervals before the refresh is believed at all. */
const BELIEVE_AFTER = 12;
/** How near a whole ratio the step and the refresh must be to count refreshes (2 %, so 59.94 and 60.06 Hz both lock). */
const RATIO_SLACK = 0.02;
/**
 * How far one interval may sit from a whole number of refreshes and still be
 * counted as that many. A refresh's timestamp is regular to microseconds; a
 * quarter of a refresh off is not a refresh, it is a page drawing at its own
 * pace (a covered window's timer, a harness), and goes to the accumulator.
 */
const BEAT_SLACK = 0.25;
/** How much of a step the free clock may take early (see `steps`). */
const EARLY = 0.05;

export class StepClock {
  /** The accumulator's remainder, seconds: the free clock's. */
  private acc = 0;
  /** Refreshes counted toward the next step: the locked clock's. */
  private beats = 0;
  private readonly gaps = new Float64Array(WINDOW);
  private readonly sorted = new Float64Array(WINDOW);
  private filled = 0;
  private next = 0;
  private refresh = 0;
  private sinceJudged = 0;
  /** Frames counted by refreshes, and by the accumulator, for `?debug` and the check. */
  locked = 0;
  free = 0;

  /** Forget everything: a new show, a render's end, a plate rebuilt. */
  reset(): void {
    this.acc = 0;
    this.beats = 0;
    this.filled = 0;
    this.next = 0;
    this.refresh = 0;
    this.sinceJudged = 0;
  }

  /** The refresh interval it has judged (seconds), or 0 while it has not. */
  get refreshS(): number {
    return this.refresh;
  }

  /**
   * The steps this frame takes. `dtS` is the interval since the frame before
   * (seconds; a refresh's timestamps where there are any), `stepS` how long a
   * step stands for, and `cap` the most steps one frame may catch up.
   */
  steps(dtS: number, stepS: number, cap: number): number {
    if (!(dtS > 0) || !Number.isFinite(dtS) || !(stepS > 0)) return 0;
    this.listen(dtS);
    const r = this.refresh;
    if (r > 0) {
      const frames = Math.round(dtS / r);
      if (frames >= 1 && Math.abs(dtS - frames * r) <= BEAT_SLACK * r) {
        const per = stepS / r;                 // refreshes a step
        const perN = Math.round(per);
        const each = r / stepS;                // steps a refresh
        const eachN = Math.round(each);
        if (perN >= 1 && Math.abs(per - perN) <= RATIO_SLACK * perN) {
          // A step every perN refreshes; beats may carry over a change of rate.
          this.beats = Math.min(this.beats, perN - 1) + frames;
          let n = Math.floor(this.beats / perN);
          this.beats -= n * perN;
          if (n > cap) n = cap;
          this.acc = 0;
          this.locked++;
          return n;
        }
        if (eachN >= 2 && Math.abs(each - eachN) <= RATIO_SLACK * eachN) {
          this.beats = 0;
          this.acc = 0;
          this.locked++;
          return Math.min(cap, frames * eachN);
        }
      }
    }
    // The accumulator, as the loop always ran it, on whatever interval it was given.
    this.beats = 0;
    this.acc = Math.min(this.acc + dtS, stepS * cap);   // the catch-up cap, as before
    // A twentieth of a step short is a whole step, taken a little early and
    // owed back from the remainder (which may go that far below zero): else
    // a refresh's stamp a few microseconds early, or 1/120 + 1/120 in floating
    // point, floors a refresh that holds a step to none and the next to two.
    const n = Math.floor(this.acc / stepS + EARLY);
    this.acc -= n * stepS;
    this.free++;
    return n;
  }

  /** Keep the interval, and every so often judge the refresh from the last few: their median, so a dropped frame or two do not move it. */
  private listen(dtS: number): void {
    if (dtS > 0.25) return;                    // a tab coming back, not a refresh
    this.gaps[this.next] = dtS;
    this.next = (this.next + 1) % WINDOW;
    if (this.filled < WINDOW) this.filled++;
    if (this.filled < BELIEVE_AFTER) { this.refresh = 0; return; }
    if (this.refresh > 0 && ++this.sinceJudged < 8) return;
    this.sinceJudged = 0;
    const s = this.sorted.subarray(0, this.filled);
    s.set(this.gaps.subarray(0, this.filled));
    s.sort();
    const median = s[this.filled >> 1];
    // Regular enough to be a display: the middle half of the intervals within 10 % of the median.
    const q1 = s[this.filled >> 2], q3 = s[(3 * this.filled) >> 2];
    this.refresh = q3 - q1 <= 0.1 * median ? median : 0;
  }
}
