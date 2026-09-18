/**
 * Phrasing: the plate takes a breath.
 *
 * Filmed liquid is dynamic because somebody is doing things to it. A pour,
 * then twenty seconds of watching it spread and curl under its own surface
 * tension, then a press, then a tilt, then nothing at all for a while. The
 * motion has shape at the scale of seconds and tens of seconds — surges and
 * rests — and that shape is most of what reads as *alive* rather than merely
 * moving.
 *
 * The plate had none of it. Two things drive its motion and both were flat:
 * the solver's timestep is a constant worked out from the settings (the note
 * at `step` says so, and says why: audio energy in the clock makes it jump),
 * and the automation is a Poisson process at a fixed rate, so impulses arrive
 * independently and the density of them over a minute is statistically the
 * same minute after minute. Faster or slower, but always the same *amount* of
 * always.
 *
 * This is the missing shape. It is not a sine: liquid does not breathe in and
 * out evenly. It is a slow drift with gusts on top of it — occasional events
 * that come up fast and fall away slowly, which is what a hand doing something
 * to a dish actually looks like.
 *
 * Nothing here reads a clock or a random seed from outside, so a show can be
 * driven at any frame rate and a harness can drive it a step at a time.
 */

/** What the plate should be doing right now, all 0..1 unless noted. */
export interface Phrase {
  /**
   * The overall level of activity, centred on 1: below it the plate is
   * resting, above it something is happening. Roughly 0.35 to 2.2.
   */
  drive: number;
  /** 1 while a gust is at its peak, 0 between them — for one-shot impulses. */
  gust: number;
  /** A slow wander for things that should never snap, like the clock. */
  drift: number;
}

/** Seconds between gusts, on average, at the middle of the range. */
const GUST_EVERY = 11;
/** How long a gust takes to arrive and to fall away. */
const ATTACK = 0.45;
const DECAY = 5.5;

export class Phrasing {
  /** Where the slow wander is, and where it is heading. */
  private drift = 0.5;
  private target = 0.5;
  private toGo = 0;
  /** Gusts alive right now, as seconds since each began. */
  private gusts: number[] = [];
  private untilNext = GUST_EVERY * 0.5;
  private rand: () => number;

  /** `random` is injectable so a check can drive this deterministically. */
  constructor(random: () => number = Math.random) {
    this.rand = random;
  }

  /**
   * Advance by `dt` seconds.
   *
   * `amount` is how much phrasing the look wants, 0 to 1. At 0 this returns a
   * flat phrase and costs nothing — every look that does not ask for it
   * behaves exactly as it did. `energy` is the music, which makes gusts more
   * likely without being the only thing that causes them: a plate should still
   * do something in a quiet passage.
   */
  step(dt: number, amount: number, energy = 0): Phrase {
    const a = Math.max(0, Math.min(1, amount));
    if (a <= 0.001) return { drive: 1, gust: 0, drift: 0.5 };
    const step = Math.max(0, Math.min(0.25, dt));

    // The wander: pick somewhere to be, take five to twenty seconds getting
    // there, pick again. Slower than a gust by an order of magnitude, so the
    // two never look like the same process.
    this.toGo -= step;
    if (this.toGo <= 0) {
      this.target = this.rand();
      this.toGo = 5 + this.rand() * 15;
    }
    this.drift += (this.target - this.drift) * (1 - Math.exp(-step / 3.5));

    // Gusts: Poisson arrivals, but of *envelopes* rather than of impulses,
    // which is the whole difference. An impulse per event gives an even
    // scatter; an envelope per event gives a plate that is busy for a few
    // seconds and then is not.
    this.untilNext -= step * (0.5 + energy * 1.5 + this.drift);
    if (this.untilNext <= 0) {
      this.gusts.push(0);
      // Exponential gaps, so two gusts sometimes land together and sometimes
      // leave a long hole. Evenly spaced gusts are a metronome, not weather.
      this.untilNext = -Math.log(Math.max(1e-6, this.rand())) * GUST_EVERY;
    }
    let gust = 0;
    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const t = (this.gusts[i] += step);
      // Up fast, down slow: the shape of a drop landing, not of a bell.
      const env = t < ATTACK ? t / ATTACK : Math.exp(-(t - ATTACK) / DECAY);
      if (t > ATTACK + DECAY * 4) { this.gusts.splice(i, 1); continue; }
      gust = Math.max(gust, env);
    }
    // More than about three at once is a mess rather than weather.
    if (this.gusts.length > 3) this.gusts.splice(0, this.gusts.length - 3);

    /*
      The range, which the first version of this got badly wrong.

      It shaped to 0.74..1.50 — a fifty percent swing — and measured on a real
      plate as doing nothing at all: 1.3x busy-to-quiet against 1.3x with the
      phrasing switched off. Filmed liquid, measured the same way, runs about
      fifty times louder at its peaks than at its rests, and while a good deal
      of that is cuts between shots rather than motion within one, an envelope
      that only ever moves by half is inaudible underneath a plate that is
      already moving.

      So a rest is a real rest — a third of the pace — and a gust is a real
      event. What keeps that from looking broken is not a small range, it is
      that the fast part rides the gust and the clock only ever follows the
      drift, slowly.
    */
    const shaped = 0.3 + this.drift * 0.55 + gust * 1.9;
    return { drive: 1 + (shaped - 1) * a, gust: gust * a, drift: this.drift };
  }

  reset(): void {
    this.drift = 0.5;
    this.target = 0.5;
    this.toGo = 0;
    this.gusts.length = 0;
    this.untilNext = GUST_EVERY * 0.5;
  }
}
