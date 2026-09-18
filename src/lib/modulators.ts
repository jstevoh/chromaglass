/**
 * Modulators: shapes to plug into the patch bay.
 *
 * The patch bay already had the hard part — a source, a destination, a bipolar
 * depth, summed across patches, folded per plate and clamped to each setting's
 * travel. What it did not have was anything to plug in that was not a *sensor*.
 * Room, film and sound all answer "what is happening out there", and a show
 * often wants the other thing: a shape that is happening because you said so.
 *
 * Four LFOs and two envelopes, which is the set a hardware synth settled on
 * long ago for good reasons.
 *
 * ## The LFOs run on bars, not on seconds
 *
 * A free-running LFO against music is a phaser: it drifts in and out of time
 * and everything it touches looks almost-but-not-quite deliberate. The app
 * already knows the tempo — from MIDI clock, from a tap, or from the beat
 * clock listening — so the LFOs are divisions of a bar and stay put against
 * it. With no tempo at all they fall back to the same rates in seconds at 120,
 * which is a guess but a stable one.
 *
 * ## The envelopes are fired, not free
 *
 * They do nothing until something fires them, which is what makes them
 * different from a fifth LFO. A MIDI note fires both; so does a pad, a phone
 * tap, or anything else that calls `fire`. One is short and one is long, so a
 * single press can do a snap and a swell at once.
 */

/** What a patch can name on the `shape` source. */
export type ModulatorFeature = 'lfo1' | 'lfo2' | 'lfo3' | 'lfo4' | 'env1' | 'env2';

export const MODULATOR_FEATURES: ModulatorFeature[] = ['lfo1', 'lfo2', 'lfo3', 'lfo4', 'env1', 'env2'];

/** What each one is, for a panel to print without knowing the arithmetic. */
export const MODULATOR_LABELS: Record<ModulatorFeature, string> = {
  lfo1: 'LFO 1 — sine, eight bars',
  lfo2: 'LFO 2 — sine, two bars',
  lfo3: 'LFO 3 — triangle, one bar',
  lfo4: 'LFO 4 — stepped, every beat',
  env1: 'Envelope 1 — snap',
  env2: 'Envelope 2 — swell',
};

/** Bars per cycle for each LFO; lfo4 steps once a beat instead. */
const BARS = { lfo1: 8, lfo2: 2, lfo3: 1 } as const;
/** Attack and decay in seconds. */
const ENVS = { env1: { a: 0.012, d: 0.28 }, env2: { a: 0.09, d: 1.6 } } as const;
/** With no tempo to hold onto, this is the one assumed. */
const FALLBACK_BPM = 120;

export class Modulators {
  /** Phase 0..1 per LFO, advanced on wall-clock seconds against the tempo. */
  private phase = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
  /** Where the stepped LFO is holding, and how far through its beat. */
  private held = 0.5;
  private beatPhase = 0;
  /** Seconds since each envelope was fired; -1 for one that never has been. */
  private fired = { env1: -1, env2: -1 };
  private rand: () => number;

  constructor(random: () => number = Math.random) {
    this.rand = random;
  }

  /** Advance by `dt` seconds at `bpm` (0 or absent for the fallback). */
  step(dt: number, bpm = 0): void {
    const step = Math.max(0, Math.min(0.25, dt));
    const beats = (bpm > 20 && bpm < 300 ? bpm : FALLBACK_BPM) / 60 * step;
    const bars = beats / 4;
    this.phase.lfo1 = (this.phase.lfo1 + bars / BARS.lfo1) % 1;
    this.phase.lfo2 = (this.phase.lfo2 + bars / BARS.lfo2) % 1;
    this.phase.lfo3 = (this.phase.lfo3 + bars / BARS.lfo3) % 1;
    this.beatPhase += beats;
    // Stepped: a new value held flat until the next beat. The one modulator
    // here that is not smooth, because everything smooth is already covered
    // and a plate sometimes wants a jump.
    while (this.beatPhase >= 1) { this.beatPhase -= 1; this.held = this.rand(); }
    for (const k of ['env1', 'env2'] as const) if (this.fired[k] >= 0) this.fired[k] += step;
  }

  /** Fire both envelopes — a note, a pad, a tap. `velocity` scales them. */
  fire(velocity = 1): void {
    this.fired.env1 = 0;
    this.fired.env2 = 0;
    this.velocity = Math.max(0, Math.min(1, velocity));
  }
  private velocity = 1;

  /** Every modulator's value, 0..1. */
  value(feature: ModulatorFeature): number {
    switch (feature) {
      // Sine and triangle mapped to 0..1: the patch's own depth is what makes
      // a modulation bipolar, so a source that went negative here would be
      // bipolar twice and reach half as far in one direction.
      case 'lfo1': return 0.5 + 0.5 * Math.sin(this.phase.lfo1 * Math.PI * 2);
      case 'lfo2': return 0.5 + 0.5 * Math.sin(this.phase.lfo2 * Math.PI * 2);
      case 'lfo3': return 1 - Math.abs(this.phase.lfo3 * 2 - 1);
      case 'lfo4': return this.held;
      case 'env1': case 'env2': {
        const t = this.fired[feature];
        if (t < 0) return 0;
        const { a, d } = ENVS[feature];
        return (t < a ? t / a : Math.exp(-(t - a) / d)) * this.velocity;
      }
      default: return 0;
    }
  }

  /** True while anything is worth reading — an envelope that has died is not. */
  get live(): boolean { return true; }

  reset(): void {
    this.phase = { lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0 };
    this.fired = { env1: -1, env2: -1 };
    this.beatPhase = 0;
    this.held = 0.5;
  }
}
