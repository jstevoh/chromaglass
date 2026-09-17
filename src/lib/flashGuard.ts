/**
 * Not putting a strobe in front of a room.
 *
 * Nothing in this app was built to strobe, and the code says so in several
 * places — the room calibration refuses to gate the visuals on the silence
 * between beats because that would strobe them, the macro camera will not cut
 * more than once every two seconds because "a cut a beat is a strobe, not an
 * edit". Those are good decisions made one at a time, and one at a time is the
 * problem: the show is a hundred knobs, any audio band can be mapped onto any
 * of them, `dimmer` is one of them, and a bass-driven master brightness at 150
 * bpm is a two-and-a-half hertz full-field flash that nobody decided on.
 *
 * So this is the same principle as a guarantee rather than a habit. It watches
 * what actually reached the screen and steps in only when that becomes a
 * strobe.
 *
 * ## What counts as a flash
 *
 * The clinical rule (WCAG 2.3.1, after the Harding test) is not "no fast
 * changes" — it is *three flashes in any one second*, where a flash is a
 * **pair** of opposing changes in relative luminance of at least ten per cent,
 * from a state dark enough to matter. A pair: a trough and the peak after it
 * are one flash between them, not two. Counting every turn instead doubles the
 * rate and makes the guard step in on shows that were never near the line.
 *
 * That the rule is about *repetition* is the whole design here. A single hard
 * hit on a kick is not a seizure risk and is most of what makes a light show
 * worth watching; a guard that smoothed every fast change would be safe and
 * would also have thrown away the thing the app is for. So flashes are
 * counted, not suppressed, and nothing happens at all until there are too
 * many in a second.
 *
 * ## How it intervenes
 *
 * By scaling the master dimmer — already a uniform every material is lit
 * through, so there is no extra pass, no extra texture, and this works the
 * same on the laptop, the projector, a network display and the recorder.
 *
 * It scales, rather than pulling each frame toward a running mean, because the
 * measurement is a frame behind: the probe reads the frame that has just gone
 * to the screen. A correction computed from a stale sample of a fast
 * oscillation lands on the wrong half of it and *adds* transitions — measured,
 * a per-frame pull turned a 21-flash-a-second trace into a 55-flash-a-second
 * one. A slowly-moving scale cannot do that. It multiplies the whole
 * oscillation down together, which is the one correction that is still correct
 * when it arrives late.
 *
 * The loop is closed on the measured amplitude: the gain is nudged by the
 * ratio of what is safe to what is arriving, so it converges on whatever
 * attenuation this particular strobe needs rather than guessing one.
 *
 * ## Letting go
 *
 * Once engaged, the threshold for noticing a flash drops. Without that, the
 * guard oscillates: it dims until the swings fall under ten per cent, stops
 * counting them, releases, and the strobe comes straight back. The hold ends
 * after a spell with nothing flashing at all, even at the lower threshold.
 *
 * It is deliberately not a look control: it does nothing to a show that was
 * not going to strobe, and no preset can turn it off.
 */

/** Relative luminance below which a light state is not a "flash" partner. */
const DARK_ENOUGH = 0.8;
/** A trough-to-peak excursion this big, or bigger, is a flash. */
const FLASH_STEP = 0.1;
/** What still counts once the guard has engaged, so it does not release into the strobe it just stopped. */
const HOLD_STEP = 0.045;
/** Three in any one second is the limit; this is what is allowed to stand. */
const MAX_PER_SECOND = 3;
/** The window the count is taken over. */
const WINDOW_MS = 1000;
/** What the guard aims the *delivered* excursion down to: comfortably under a flash. */
const SAFE_AMP = 0.075;
/**
 * The floor.
 *
 * A full-range strobe cannot be made safe by scaling without going quite dark:
 * a 0.6 excursion needs a gain under 0.17 before it is under ten per cent. So
 * the floor has to be below that or the guard cannot do its job on the worst
 * case at all. It is still a floor — the guard is never the thing that blacks
 * the wall out — and a show that drives it this far has gone badly wrong in a
 * way the operator should be able to see rather than be protected from
 * silently.
 */
const MIN_GAIN = 0.1;
/** Quiet for this long, even at the lower threshold, and the hold ends. */
const RELEASE_AFTER_MS = 1200;
/** How long the rate must stay over the line before the guard believes it. */
const OVER_FOR_MS = 250;

/** Seconds for the gain to travel the whole way down, and back up. */
const ATTACK_S = 0.35;
const RELEASE_S = 1.2;

export interface FlashGuardState {
  /** Flashes a second, from the spacing of the ones in the last second. */
  rate: number;
  /** Whether the guard is currently holding the show back. */
  engaged: boolean;
  /** The excursion the source is producing, before the guard's own correction. */
  amplitude: number;
  /** The gain last handed back. */
  gain: number;
}

export class FlashGuard {
  private rising = true;
  /** The last turning point's value: the trough a rise started from, or the peak a fall did. */
  private turn = 0;
  private last = 0;
  /** When each counted flash happened. */
  private flashes: number[] = [];
  /** The excursion of recent flashes, at the source (the gain divided back out). */
  private amp = 0;
  private engaged = false;
  private lastFlashAt = -Infinity;
  /** When the rate first went over the line and stayed there, or -1. */
  private overSince = -1;
  private gain = 1;
  private lastAt = -1;
  private seeded = false;

  /** The measured rate, kept for the readout rather than recomputed by callers. */
  private rate = 0;

  get state(): FlashGuardState {
    return { rate: this.rate, engaged: this.engaged, amplitude: this.amp, gain: this.gain };
  }

  reset(): void {
    this.flashes = [];
    this.amp = 0;
    this.engaged = false;
    this.lastFlashAt = -Infinity;
    this.overSince = -1;
    this.gain = 1;
    this.lastAt = -1;
    this.seeded = false;
  }

  /**
   * One frame's delivered mean luminance (0..1), and the gain for the next.
   *
   * `luminance` must be what actually reached the screen — this guard's own
   * correction included — because the correction converges on the ratio
   * between what is safe and what is arriving.
   */
  sample(now: number, luminance: number): number {
    const lum = Math.max(0, Math.min(1, luminance));
    if (!this.seeded) {
      this.seeded = true;
      this.turn = this.last = lum;
      this.lastAt = now;
      return 1;
    }
    const dt = Math.max(1e-4, Math.min(0.25, (now - this.lastAt) / 1000));
    this.lastAt = now;

    // ── Counting ─────────────────────────────────────────────────────
    // A flash is a pair, so it is counted once per completed excursion: at
    // the top of a rise that began low enough and travelled far enough.
    // While engaged the threshold scales with the gain, so what is being
    // measured stays the *source's* excursion rather than the attenuated one.
    // Without that the guard lets go the moment its own correction works: it
    // dims until the swings are under the hold threshold, stops seeing them,
    // releases, and the strobe comes straight back — a limit cycle that
    // measured as five flashes a second delivered while the gain sat on its
    // floor.
    const step = this.engaged ? HOLD_STEP * this.gain : FLASH_STEP;
    if (this.rising && lum < this.last) {
      // A peak. The rise that reached it is the flash.
      const span = this.last - this.turn;
      if (span >= step && this.turn < DARK_ENOUGH) {
        this.flashes.push(now);
        this.lastFlashAt = now;
        // Divided back out by the gain in force, so what is tracked is the
        // *source's* excursion and not the already-attenuated one. Tracking
        // the delivered span instead winds the controller up: every new flash
        // is measured under a gain the reading has not caught up with yet, so
        // it asks for another cut on top of the one already working and walks
        // to the floor when a third of it would have done.
        const source = span / Math.max(MIN_GAIN, this.gain);
        this.amp = this.amp > 0 ? this.amp + (source - this.amp) * 0.6 : source;
      }
      this.rising = false;
      this.turn = this.last;
    } else if (!this.rising && lum > this.last) {
      this.rising = true;
      this.turn = this.last;         // a trough: where the next rise starts from
    }
    this.last = lum;
    // A little more than the window itself: the sliding count below needs
    // flashes on both sides of a one-second span to find the worst one.
    while (this.flashes.length && now - this.flashes[0] > WINDOW_MS * 1.6) this.flashes.shift();
    // The amplitude fades when nothing is flashing, so a show that has calmed
    // down is not still being judged on what it did ten seconds ago.
    if (now - this.lastFlashAt > WINDOW_MS) this.amp *= Math.max(0, 1 - dt);

    // ── Engaging and letting go ──────────────────────────────────────
    // The rate is taken from the spacing of the flashes, not from how many
    // happen to be inside the window. Counting them means a three-hertz show —
    // exactly the limit, and perfectly legal — has four flashes in the window
    // at the instant the oldest is a second old, and gets held back for
    // content that is not over the line at all. Four events spanning a second
    // are three flashes a second, which is what the spacing says and what the
    // rule means.
    //
    // From the *median* spacing rather than the span across the window, so
    // one interval quantised a frame short cannot lift the answer over the
    // line: at sixty frames a second that alone read a three-hertz show as
    // 3.05, which engaged the guard for a second and a half on nothing.
    const n = this.flashes.length;
    let rate = 0;
    if (n >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < n; i++) gaps.push(this.flashes[i] - this.flashes[i - 1]);
      gaps.sort((a, b) => a - b);
      const mid = gaps[gaps.length >> 1];
      if (mid > 0) rate = 1000 / mid;
    }
    this.rate = rate;

    // Over the line, and *staying* over it.
    //
    // A frame is 17ms at sixty and 33ms at thirty, so a three-hertz show whose
    // peaks land one frame apart from cycle to cycle reads as anything up to
    // 3.16 or 3.33 a second — indistinguishable from the real thing on any one
    // reading. What is not indistinguishable is whether it *stays* there: a
    // quantised three hertz crosses and falls back every cycle, a genuine
    // three-and-a-half hertz does not. A quarter of a second of holding above
    // the line is the test, which costs at most one extra flash of exposure on
    // a rule that is about a second's worth of repetition.
    // "More than three in any one second" is a sliding window, so it is
    // counted as one. Taking the count of whatever happens to be in the last
    // second instead makes the number flicker between three and four as the
    // oldest flash falls off the back — and a condition that flickers can
    // never satisfy the persistence test below, which is how a three-and-a-
    // half hertz strobe walked straight through an earlier version of this.
    let most = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i; j < n && this.flashes[j] < this.flashes[i] + WINDOW_MS; j++) c++;
      if (c > most) most = c;
    }
    const over = most > MAX_PER_SECOND && rate > MAX_PER_SECOND + 0.05;
    if (!over) this.overSince = -1;
    else if (this.overSince < 0) this.overSince = now;
    if (over && now - this.overSince >= OVER_FOR_MS) this.engaged = true;
    else if (this.engaged && now - this.lastFlashAt > RELEASE_AFTER_MS) this.engaged = false;

    // ── The gain ─────────────────────────────────────────────────────
    // Multiplicative: nudge by the ratio of what is safe to what is arriving,
    // and the loop finds whatever attenuation this strobe needs. A strobe that
    // is only a little over the line gets a little dimmer.
    //
    // With a dead zone around the target, because the amplitude it is
    // controlling is a smoothed reading of something that only updates once a
    // flash: a controller with no dead zone keeps pushing on stale readings
    // and walks a marginal strobe all the way to the floor when a third of
    // that would have done.
    let want = 1;
    if (this.engaged && this.amp > 0) {
      // Absolute, not incremental: the attenuation this source needs, worked
      // out from the source's own excursion.
      want = Math.max(MIN_GAIN, Math.min(1, SAFE_AMP / this.amp));
    }
    const speed = want < this.gain ? dt / ATTACK_S : dt / RELEASE_S;
    this.gain += Math.max(-speed, Math.min(speed, want - this.gain));
    this.gain = Math.max(MIN_GAIN, Math.min(1, this.gain));
    return this.gain;
  }
}
