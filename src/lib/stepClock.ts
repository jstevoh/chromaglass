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
 * is the display's clock, regular to well under a millisecond, and not when
 * the callback got round to reading a millisecond clock. And when the
 * display's refresh is a whole fraction or multiple of the step (60 Hz at
 * sixty steps, 120 Hz at sixty, 60 Hz at thirty) and this interval is a whole
 * number of those refreshes, the interval is taken as exactly that many
 * refreshes of the step's own rate: 1/60, or 1/120, or 1/30. The accumulator
 * then holds whole steps and half steps exactly and floors to the same count
 * every refresh, as the film render's integer count always has, for the same
 * reason ("1/60 + 1/60 can floor to one step and then three, a judder a film
 * would keep"). A refresh the page missed (an interval of two or three) is
 * that many refreshes, so its steps are caught up within the same cap.
 *
 * It is one accumulator throughout, carrying its time from every frame to
 * the next whether or not that frame's interval was a whole number of
 * refreshes. That matters with the wall up: the frames the draw gate lets
 * through are then a mix of the laptop's refreshes and the projector's, and an
 * interval between two clocks fits no refresh at all; it is taken as the time
 * it was. (The first version kept two clocks and reset one whenever the other
 * ran, and with a 50 Hz wall beside a 60 Hz show a sixth of the frames threw
 * their time away: the plate ran at 50 steps a second. The check-skeptic
 * found it; `npm run cadence` now draws through the real DrawGate with two
 * clocks.)
 *
 * A display whose refresh is not a whole ratio of the step (90 Hz, 144 Hz, a
 * variable-rate panel, a 61 Hz monitor) keeps the time as given; it cannot be
 * even there whatever is done, and the timestamps alone take the random walk
 * out of it.
 *
 * Not the physics: a step is the same `dt` either way. What changes is which
 * frame it is drawn on. On a 59.94 Hz panel the snapped refresh is 1/60 s, so
 * the plate runs 0.1 % slow, the same 0.1 % a film of it at 59.94 would; the
 * slack is half a percent, so a monitor further off than that keeps the wall
 * clock instead.
 */

/** How many recent intervals the refresh is judged from. */
const WINDOW = 32;
/** Fewest intervals before the refresh is believed at all. */
const BELIEVE_AFTER = 12;
/**
 * How near a whole ratio the step and the refresh must be for the interval to
 * be snapped to it: half a percent, so 59.94 and 119.88 Hz panels (0.1 % off)
 * snap and a 61 Hz monitor (1.7 % off), which would run the plate that much
 * fast, does not.
 */
const RATIO_SLACK = 0.005;
/**
 * How far one interval may sit from a whole number of refreshes and still be
 * counted as that many: 6 %, a millisecond at 60 Hz. A refresh's timestamp is
 * regular to a fraction of a millisecond, and Chrome rounds it to 0.1 ms;
 * further off is a page drawing at its own pace (a covered window's timer)
 * or an interval from one window's refresh to the other's, and keeps its own
 * time. It was a quarter of a refresh, and with a 50 Hz wall beside a 60 Hz
 * show that snapped the intervals between the two clocks, 13 and 20 ms, to
 * 16.7 and lost 5 % of the plate's time (`npm run cadence`).
 */
const BEAT_SLACK = 0.06;
/**
 * How much of a step may be taken early, and owed back from the remainder
 * (which may go that far below zero): else a refresh's stamp a few
 * microseconds early, or 1/120 + 1/120 in floating point, floors a refresh
 * that holds a step to none and the next to two.
 */
const EARLY = 0.05;

export class StepClock {
  /** The accumulator's remainder, seconds. */
  private acc = 0;
  /** The step the remainder was counted in, so a change of step rate keeps its share of a step, not its seconds. */
  private lastStepS = 0;
  private readonly gaps = new Float64Array(WINDOW);
  private readonly sorted = new Float64Array(WINDOW);
  private filled = 0;
  private next = 0;
  private refresh = 0;
  private sinceJudged = 0;
  /** Frames whose interval was snapped to whole refreshes, and frames that kept their own, for `?debug` and the check. */
  locked = 0;
  free = 0;

  /** Forget everything: a new show, a render's end, a plate rebuilt. */
  reset(): void {
    this.acc = 0;
    this.lastStepS = 0;
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
    // The governor changed the step rate: the remainder is the same share of
    // a step, so going back from thirty to sixty cannot owe two at once.
    if (this.lastStepS > 0 && this.lastStepS !== stepS) this.acc *= stepS / this.lastStepS;
    this.lastStepS = stepS;
    this.listen(dtS);
    let dt = dtS;
    const r = this.refresh;
    if (r > 0) {
      const frames = Math.round(dtS / r);
      if (frames >= 1 && Math.abs(dtS - frames * r) <= BEAT_SLACK * r) {
        // The refresh the step would have it be: stepS / n for n refreshes a
        // step, stepS × n for n steps a refresh, when the judged one is that
        // to within the slack.
        const per = stepS / r, perN = Math.round(per);
        const each = r / stepS, eachN = Math.round(each);
        const snapped = perN >= 1 && Math.abs(per - perN) <= RATIO_SLACK * perN ? stepS / perN
          : eachN >= 2 && Math.abs(each - eachN) <= RATIO_SLACK * eachN ? stepS * eachN
          : 0;
        if (snapped > 0) { dt = frames * snapped; this.locked++; } else this.free++;
      } else this.free++;
    } else this.free++;
    this.acc = Math.min(this.acc + dt, stepS * cap);   // the catch-up cap, as before
    const n = Math.floor(this.acc / stepS + EARLY);
    this.acc -= n * stepS;
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
