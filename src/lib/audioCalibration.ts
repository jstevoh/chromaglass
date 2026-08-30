/**
 * Room calibration for the audio analyser.
 *
 * A microphone in a living room, a phone across a bar and a laptop next to a
 * speaker all deliver wildly different levels, and a single fixed sensitivity
 * slider cannot serve them. Rather than asking the listener to find the number,
 * these trackers learn the room: each feature keeps its own noise floor and
 * signal ceiling, and reports where the current value sits between them.
 *
 * Two rules make it behave:
 *   - The floor drops quickly (a lull is real) and rises only from levels near
 *     it. A floor that chased the running level would climb to meet sustained
 *     music and squeeze the range shut a minute into every song.
 *   - The ceiling rises quickly (so a drop lands on the first beat, not the
 *     tenth) and decays slowly (so a quiet bridge doesn't blow up the gain).
 *
 * A minimum span stops a silent room from being normalised into full-scale
 * hiss: until something is genuinely louder than the floor, the output is 0.
 */

export interface AutoRangeOptions {
  /** Smallest floor-to-ceiling span treated as real signal, in the feature's own units. */
  minSpan: number;
  /** Seconds for the floor to follow a level that has risen. */
  floorRise?: number;
  /** Seconds for the ceiling to fall back after a loud passage. */
  ceilFall?: number;
}

const DEFAULT_FLOOR_RISE = 25;
const DEFAULT_CEIL_FALL = 12;
/** Fraction of the gap closed per update when a value moves *toward* the tracker fast. */
const FAST_ATTACK = 0.35;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tracks the live floor and ceiling of one feature and normalises against them. */
export class AutoRange {
  floor = 0;
  ceiling = 0;
  private seeded = false;
  private readonly minSpan: number;
  private readonly floorRise: number;
  private readonly ceilFall: number;

  constructor(opts: AutoRangeOptions) {
    this.minSpan = opts.minSpan;
    this.floorRise = opts.floorRise ?? DEFAULT_FLOOR_RISE;
    this.ceilFall = opts.ceilFall ?? DEFAULT_CEIL_FALL;
  }

  /** Feed one observation. `dt` is seconds since the previous update. */
  update(value: number, dt: number): void {
    if (!this.seeded) {
      this.floor = value;
      this.ceiling = value + this.minSpan;
      this.seeded = true;
      return;
    }
    const step = Math.max(0, Math.min(0.25, dt));
    const riseK = 1 - Math.exp(-step / this.floorRise);
    const fallK = 1 - Math.exp(-step / this.ceilFall);

    if (value < this.floor) {
      this.floor += (value - this.floor) * FAST_ATTACK;   // a new quiet moment is believed at once
    } else {
      // Only levels close to the floor lift it, and the pull falls off sharply
      // with distance: that tracks a room whose background noise is drifting
      // up, without letting four minutes of loud music redefine "quiet".
      const proximity = Math.exp(-(value - this.floor) / (this.minSpan * 2));
      this.floor += (value - this.floor) * riseK * proximity;
    }

    this.ceiling += value > this.ceiling
      ? (value - this.ceiling) * FAST_ATTACK
      : (value - this.ceiling) * fallK;

    if (this.ceiling < this.floor + this.minSpan) this.ceiling = this.floor + this.minSpan;
  }

  /** Where `value` sits between the learned floor and ceiling, 0..1. */
  normalize(value: number): number {
    const span = this.ceiling - this.floor;
    if (span <= 0) return 0;
    return clamp01((value - this.floor) / span);
  }

  /** True once the room has shown more dynamic range than the noise gate. */
  get hasSignal(): boolean {
    return this.ceiling - this.floor > this.minSpan * 1.05;
  }

  reset(): void {
    this.seeded = false;
    this.floor = 0;
    this.ceiling = 0;
  }
}

export interface RoomCalibration {
  /** Learned noise floor of the room, dBFS. */
  floorDb: number;
  /** Learned peak level of the material, dBFS. */
  peakDb: number;
  /** 0..1 — how far through the initial listen the calibration is. */
  progress: number;
  /** True until the first calibration pass has completed. */
  calibrating: boolean;
  /** True when the room is currently louder than its own noise floor. */
  signal: boolean;
  /**
   * Smoothed 0..1 version of `signal`. A single quiet frame between beats
   * shouldn't blank the visuals, so this opens fast and closes slowly.
   */
  gate: number;
}

/** Seconds of listening before calibration is reported as settled. */
export const CALIBRATION_SECONDS = 3;

/**
 * Learns the room's level in dBFS and derives the analyser window from it.
 *
 * An AnalyserNode maps [minDecibels, maxDecibels] onto the 0..255 byte spectrum.
 * The defaults (-100..-30) waste almost the entire range on a quiet room: music
 * peaking at -55 dB only ever reaches a byte value of about 60, which is the
 * mechanical reason a distant mic drives the visuals so weakly. Fitting the
 * window to the room recovers the full range.
 */
export class RoomTracker {
  private floor = new AutoRange({ minSpan: 8, floorRise: 30, ceilFall: 18 });
  private elapsed = 0;
  private gate = 0;

  /** Smoothed analyser window, dBFS. */
  minDb = -100;
  maxDb = -30;

  reset(): void {
    this.floor.reset();
    this.elapsed = 0;
    this.gate = 0;
    this.minDb = -100;
    this.maxDb = -30;
  }

  /**
   * Feed the loudest bin of this frame, in dBFS (from getFloatFrequencyData).
   * Returns the calibration state, including the analyser window to apply.
   */
  update(peakDb: number, dt: number): RoomCalibration {
    // -Infinity shows up for digital silence; park it at the bottom of the scale.
    const db = Number.isFinite(peakDb) ? peakDb : -140;
    this.elapsed += dt;
    this.floor.update(db, dt);

    const wantMin = Math.max(-120, Math.min(-35, this.floor.floor - 6));
    const wantMax = Math.max(wantMin + 25, Math.min(-3, this.floor.ceiling + 6));

    // Slew the window: retuning it abruptly would make the whole spectrum jump.
    const k = 1 - Math.exp(-Math.max(0, Math.min(0.25, dt)) / 1.5);
    this.minDb += (wantMin - this.minDb) * k;
    this.maxDb += (wantMax - this.maxDb) * k;
    if (this.maxDb < this.minDb + 20) this.maxDb = this.minDb + 20;

    const step = Math.max(0, Math.min(0.25, dt));
    const signal = this.floor.hasSignal && db > this.floor.floor + 4;
    // Open in ~0.05 s, close over ~1.5 s: the gaps between beats are silence
    // too, and gating on them would strobe the whole light show.
    const gateK = 1 - Math.exp(-step / (signal ? 0.05 : 1.5));
    this.gate += ((signal ? 1 : 0) - this.gate) * gateK;

    return {
      floorDb: this.floor.floor,
      peakDb: this.floor.ceiling,
      progress: Math.min(1, this.elapsed / CALIBRATION_SECONDS),
      calibrating: this.elapsed < CALIBRATION_SECONDS,
      signal: this.gate > 0.15,
      gate: this.gate,
    };
  }
}
