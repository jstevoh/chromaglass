/**
 * The beat, whatever plays it: the kick drum when the song has one, and the
 * attack of the band (banjo, tuba, piano, a strummed chord) when it has none.
 *
 * ## What was reported, and what was measured
 *
 * The owner loved the six 1920s song films (acoustic 78s: the Wolverines,
 * Caruso, Rachmaninoff, Whiteman, King Oliver, Bessie Smith) and asked for
 * them to "react to the music a bit more". The plate's beat answers (Kick
 * Bloom, the beat clock's kicks, every patch on Kick hit) all wait for the
 * ear's kick: a new arrival of energy at 30–120 Hz that a kick drum owns
 * (`audioFeatures.ts`). Run over the six songs a frame at a time as a render
 * hears them, the kick fired 3 to 6 times a minute (the Wolverines, 22), where
 * a modern funk track fires 90 and a pop track 51. The songs are 100 to 200
 * bpm. The ear was not deaf; there is no kick drum on those records. An
 * acoustic recording horn could not take one (a bass drum threw the cutting
 * stylus out of the groove), so the bands of the day kept time on banjo,
 * tuba, piano and woodblock, which is where the beat is on the record, and
 * there is almost nothing under 120 Hz for a kick to be found in.
 *
 * So the beat has to be heard as a musician hears it there: as the attack of
 * whatever is keeping time. That is an onset over the whole band the music
 * lives in, here 60 Hz to 4 kHz (above it, on a 78, is surface hiss).
 *
 * ## Why SuperFlux, and its floor
 *
 * The ear's own whole-spectrum onset (`level`, 30 Hz–16 kHz, plain flux)
 * fired 4 to 45 times a minute on the same songs: its flux is a mean over
 * every bin, half of which are hiss churning by a few dB a frame, and that
 * churn sets the median the threshold stands on. Two changes recover the
 * beat, and both are the published onset method for exactly this material
 * (Böck and Widmer, "Maximum filter vibrato suppression for onset detection",
 * DAFx 2013, SuperFlux):
 *
 *   - Each bin's rise is measured against the loudest of its neighbours on
 *     the frame before (bins k-1..k+1), not against itself. A sung or bowed
 *     note's vibrato slides its partials across a bin a frame, which plain
 *     flux reads as a stream of small onsets and SuperFlux reads as nothing;
 *     a real attack rises in every bin at once and survives.
 *   - With the churn suppressed, the fixed floor under the threshold can come
 *     down: `PULSE_MIN_DB` plus the ear's own noise allowance for a region
 *     this wide (`ODF_NOISE_DB / sqrt(bins)`, about 0.33 dB at 340 bins).
 *
 * Measured over the six songs at 30 fps (the films' rate), hits a minute,
 * plain flux over 60 Hz–4 kHz against SuperFlux with the floor at each value:
 *
 *     floor (dB)       1.0   0.5   0.2
 *     Wolverines   23   77   114   133
 *     Caruso       15   32    43    54
 *     Rachmaninoff 55   95     –   135
 *     Whiteman     22   63    96   122
 *     Oliver       27   78     –   132
 *     Bessie       19   67     –   100
 *     pink noise    2    2     2     2   (its one hit is the first sound)
 *     chord + hiss  2    2     2     2
 *
 * 0.2 dB, and the gaps between hits fall at the songs' tempi (Whiteman and
 * Oliver at 200/100 bpm, the Wolverines at 180, Rachmaninoff at 78). The
 * median-and-MAD threshold over the last second (`OnsetDetector`) is what
 * keeps stationary noise from firing at any of those floors.
 *
 * ## When the pulse stands in for the kick
 *
 * Only when the kick is not keeping time. Where the kick plays, the beat is
 * the kick to the frame, exactly as before (a modern mix's pulse fires on
 * every hat and snare, and a ring on every sixteenth is not the beat). The
 * kick keeps time when it has come at least every `KICK_GAP_S` seconds for
 * the last `KICK_STEADY_S`: a kick on one and three down to 80 bpm. A
 * breakdown that drops the kick hands the beat to the band until the kick has
 * been steady again for those seconds, which is what a drummer laying out
 * does. (The kick's own hits are beats throughout.)
 *
 * Steadiness and not a count, because the band's own attacks fire the kick
 * now and then: a low chord's partials leak into 30–120 Hz through the
 * analysis window, and on the Wolverines the kick fires 22 times a minute in
 * runs of two or three on the low notes. `npm run pulse`'s synthetic band
 * does the same on its F chord (175 Hz), three kicks in a row every 8.6 s.
 * The first rule tried, three kicks in four seconds, took the beat back from
 * the pulse for four seconds after each run: the beat heard 71% of the
 * band's notes at 30 fps; six in eight seconds mended 30 fps and still heard
 * 66% at 60 fps, where the window leaks more and the runs are longer. A run
 * on one chord is never three steady seconds of kick.
 *
 * And no faster than `BEAT_MIN_GAP_S` (240 a minute). On a loop with
 * sixteenth-note hats and a sparse kick the pulse rang every 0.167 s (281 a
 * minute on the space-fighter fixture), a strobe that never lets Kick hit
 * fall (HitSource holds a hit for 0.25 s). Held to a quarter second, it lands
 * on the eighths, which carry the beat. Which eighths is a matter of where
 * it started, so a kick still always lands as a beat (`SAME_ATTACK_S` apart)
 * and pulls the pulse back onto the bar: with the kick held to the gap too,
 * the loop's beat sat on the off-eighths and caught 32% of its quarters at
 * 30 fps; with the kick free, all of them.
 *
 * ## Which attacks are the beat: entrainment
 *
 * A band does not only play on the beat. The cornet's melody, a piano's
 * right hand, a pickup note all land between beats, and every one of them is
 * an attack the pulse hears. A review of the first version gave
 * `npm run pulse`'s band a soft cornet note on every "and": 35% of the beats
 * the ear then reported were the cornet at 30 fps (20% at 60), and the clock
 * fired 96 times for 65 beats. Gating the attack by its size against the loud
 * ones was a knife edge: at the frame grid's worst phase a real beat's attack
 * is split across two frames, and some beats rose by 2.7 against the
 * cornet's 1.8 (median 7.7), so no ratio kept one and dropped the other.
 *
 * A listener does not judge each note alone; they hear a period and expect
 * the next beat on it (Large and Jones, "The dynamics of attending", 1999;
 * every beat tracker since keeps one). So the ear keeps one too: the median
 * of its last `ACCENT_OF` gaps between beats (a gap of two periods counts as
 * two, so a missed beat does not halve the tempo), locked once `LOCK_GAPS`
 * gaps are in. Then an attack that lands a whole number of periods after the
 * last beat (within `GRID_TOL` of a period) is a beat, and one that lands off
 * that grid is a beat only if it is at least as big as the median of the last
 * `ACCENT_OF` attacks (`OFF_GRID_ACCENT`): a downbeat after a stop, a fill,
 * a tempo change. Before the lock, an attack needs half that median
 * (`BOOT_ACCENT`). An attack's size is its flux over this frame and the one
 * before, so one split across a frame boundary is measured whole.
 *
 * The period lets go when the music does: `RELOCK_AFTER` beats off the grid
 * in a row (the tempo has changed) or a gap over `LOST_S` (a stop) clears it,
 * and the ear locks again from the next gaps. A kick is always a beat and
 * always feeds the period, so a drummer coming in sets the grid.
 *
 * With the cornet on every "and", the beat heard all 65 of the band's beats
 * and none of the cornet's, at 30 and at 60 fps, and the clock fired 67
 * times. The constants have room: `GRID_TOL` 0.3, `BOOT_ACCENT` 0.3 or 0.8,
 * `OFF_GRID_ACCENT` 0.7 or 1.5 all keep `npm run pulse` green; `GRID_TOL`
 * 0.12 drops a beat at the frame grid's worst phase. Over the six songs at
 * 30 fps the beat now comes 90, 37, 93, 109, 99 and 67 times a minute
 * (before entrainment 107, 45, 106, 114, 111, 83), its median gap still on
 * each song's tempo.
 *
 * Arithmetic over the frame's spectrum, as the ear's own regions are; the
 * only thing made per frame is the small state object the ear's onsets also
 * make.
 */

// Types only: the ear owns this module and hands it its own kind of detector,
// so the two files do not import each other's values (a cycle).
import type { OnsetDetector, OnsetState } from './audioFeatures.ts';

/** The band the pulse listens to, Hz: the rhythm section of a 78, under its hiss. */
export const PULSE_LO_HZ = 60;
export const PULSE_HI_HZ = 4000;
/** The fixed floor under the pulse's threshold, dB (see the table above). */
export const PULSE_MIN_DB = 0.2;
/** The ear's noise allowance, the same constant as `audioFeatures.ts`'s ODF_NOISE_DB. */
const NOISE_DB = 6;
/** The kick keeps time when it has come at least every KICK_GAP_S for the last KICK_STEADY_S seconds. */
export const KICK_GAP_S = 1.5;
export const KICK_STEADY_S = 3;
/** The pulse's beats come no closer than this, seconds (240 a minute). */
export const BEAT_MIN_GAP_S = 0.25;
/** A kick this soon after a pulse's beat is the same attack heard twice, seconds. */
export const SAME_ATTACK_S = 0.1;

/**
 * The summed rise over bins lo..hi of `db` against the loudest of each bin's
 * neighbours in `prev`, both floored at `floor`, dB. A plain function over
 * typed arrays so the frame's arithmetic stays unboxed (`npm run eargc`).
 *
 * The running values live in a Float64Array and not in `let`s on purpose. V8
 * boxed this loop's doubles: `npm run eargc` measured the ear at 6.33 KB of
 * garbage an update before the pulse, 9.15 with it written as plain locals
 * (over its bar of 8), and 7.95 with the accumulator in `ACC`. Typed-array
 * slots hold raw doubles, so nothing is allocated per bin.
 */
function superFlux(db: Float64Array, prev: Float64Array, lo: number, hi: number, floor: number): number {
  const acc = ACC;
  acc[0] = 0;
  for (let k = lo; k <= hi; k++) {
    acc[1] = db[k] > floor ? db[k] : floor;
    acc[2] = prev[k];
    if (prev[k - 1] > acc[2]) acc[2] = prev[k - 1];
    if (prev[k + 1] > acc[2]) acc[2] = prev[k + 1];
    if (acc[2] < floor) acc[2] = floor;
    if (acc[1] > acc[2]) acc[0] += acc[1] - acc[2];
  }
  return acc[0];
}
const ACC = new Float64Array(3);

/** The median of `src`'s finite values (Infinity marks an empty slot), sorted in `scratch`; Infinity if none. */
function medianOf(src: Float64Array, scratch: Float64Array): number {
  scratch.set(src);
  scratch.sort();
  let n = 0;
  while (n < scratch.length && scratch[n] !== Infinity) n++;
  return n ? scratch[(n - 1) >> 1] : Infinity;
}

/** How many recent attacks, and recent beat gaps, the ear remembers (see "entrainment" above). */
const ACCENT_OF = 8;
/** Before the period locks, an attack is a beat at this fraction of the median attack (0.3–0.8 pass). */
const BOOT_ACCENT = 0.5;
/** Off the grid, an attack is a beat only at this multiple of the median attack (0.7–1.5 pass). */
const OFF_GRID_ACCENT = 1;
/** On the grid means within this fraction of a period of a whole number of periods (0.12 fails, 0.3 passes). */
const GRID_TOL = 0.2;
/** Gaps before the period locks. */
const LOCK_GAPS = 3;
/** Beats off the grid in a row that mean the tempo changed: the period is cleared. */
const RELOCK_AFTER = 3;
/** A gap longer than this, seconds, is a stop: the period is cleared. */
const LOST_S = 4;

export class PulseEar {
  /** The ear's own median-and-MAD detector, the same arithmetic every region's onsets use. */
  private readonly det: OnsetDetector;
  constructor(det: OnsetDetector) { this.det = det; }
  /** Last frame's spectrum, kept raw and floored with each frame's own floor (as the ear does). */
  private prev = new Float64Array(0);
  private hasPrev = false;
  /** The last kick's time, and when the kick's present run of steady hits began. */
  private lastKick = -Infinity;
  private steadySince = Infinity;
  /** The beat's own onset state, the reading's `beat`. */
  private at: number | null = null;
  private last = 0;
  /** The last ACCENT_OF attacks' rises (Infinity where none yet), and a scratch copy to sort. */
  private rises = new Float64Array(ACCENT_OF).fill(Infinity);
  private scratch = new Float64Array(ACCENT_OF);
  private prevOdf = 0;
  /** The beat's period the ear has entrained to, seconds (0: none yet), from the last ACCENT_OF gaps. */
  private period = 0;
  private periods = new Float64Array(ACCENT_OF).fill(Infinity);
  private gaps = 0;
  /** Beats in a row taken off the period's grid; RELOCK_AFTER of them and the period is heard afresh. */
  private offGrid = 0;
  /** The pulse's own hits, whether or not they were handed on as the beat; read by the checks. */
  pulses = 0;
  /** The threshold the pulse's last frame was held to; read by the checks. */
  get threshold(): number { return this.det.threshold; }

  reset(): void {
    this.det.reset();
    this.hasPrev = false;
    this.lastKick = -Infinity;
    this.steadySince = Infinity;
    this.at = null;
    this.last = 0;
    this.pulses = 0;
    this.rises.fill(Infinity);
    this.prevOdf = 0;
    this.period = 0;
    this.periods.fill(Infinity);
    this.gaps = 0;
    this.offGrid = 0;
  }

  /** Whether the kick is keeping time at `time`: no gap over KICK_GAP_S for KICK_STEADY_S. */
  kickKeepsTime(time: number): boolean {
    return time - this.lastKick <= KICK_GAP_S && time - this.steadySince >= KICK_STEADY_S;
  }

  /** A beat came `since` seconds after the last: fold the gap into the period. */
  private entrain(since: number, onGrid: boolean): void {
    if (this.period > 0 && !onGrid) {
      if (++this.offGrid < RELOCK_AFTER) return;
      this.period = 0; this.periods.fill(Infinity); this.gaps = 0;
    }
    this.offGrid = 0;
    // A gap of two periods is a beat the band left out, and says one period.
    const whole = this.period > 0 ? Math.max(1, Math.round(since / this.period)) : 1;
    this.periods[this.gaps++ % ACCENT_OF] = since / whole;
    if (this.gaps >= LOCK_GAPS) this.period = medianOf(this.periods, this.scratch);
  }

  /**
   * One frame. `db` is the ear's spectrum (dBFS per bin, at least `top + 1`
   * long), `floor` the ear's floor this frame (60 dB under its falling
   * reference), `kick` the ear's kick onset this frame, `waking` true on the
   * first frame and out of digital silence (no onset can be heard then: see
   * the ear's SILENCE_DB), and `hand` the operator's own click, which is never
   * the music's beat.
   */
  update(db: Float64Array, hzPerBin: number, top: number, floor: number, time: number, kick: OnsetState, waking: boolean, hand: boolean): OnsetState {
    if (this.prev.length !== db.length) { this.prev = new Float64Array(db.length); this.hasPrev = false; }
    const lo = Math.max(1, Math.round(PULSE_LO_HZ / hzPerBin));
    const hi = Math.min(top - 1, Math.round(PULSE_HI_HZ / hzPerBin));
    const n = Math.max(1, hi - lo + 1);
    const flux = this.hasPrev ? superFlux(db, this.prev, lo, hi, floor) : 0;
    const first = !this.hasPrev;
    this.prev.set(db);
    this.hasPrev = true;

    if (kick.hit) {
      if (time - this.lastKick > KICK_GAP_S) this.steadySince = time;
      this.lastKick = time;
    }

    const odf = flux / n;
    let pulse = false, pulseStrength = 0, rise = 0, typical = 0;
    if (this.det.candidate(time, odf, first || waking, PULSE_MIN_DB + NOISE_DB / Math.sqrt(n))) {
      if (hand) this.det.swallow();
      else {
        pulse = true; pulseStrength = this.det.fire(time, odf); this.pulses++;
        // The attack's whole rise: this frame's and the one before, since an
        // attack that falls across the frame boundary is split between two.
        rise = odf + this.prevOdf;
        typical = medianOf(this.rises, this.scratch);
        this.rises[this.pulses % ACCENT_OF] = rise;
      }
    }
    this.prevOdf = odf;

    // Where the kick keeps time the beat is the kick, to the frame. Where it
    // does not, the band's pulse is the beat, and a lone kick (a stab, a
    // fill) still counts as one, unless it is the same attack the pulse heard
    // a frame or two before (within SAME_ATTACK_S).
    //
    // Which of the band's attacks are the beat is the listener's question:
    // the beat is a period the ear has entrained to, and an attack is on it
    // when it lands where the next beat was due (a whole number of periods
    // after the last, within GRID_TOL of one). An attack between (the
    // cornet's answer on the "and") is the melody, and is the beat only if it
    // is as hard as the band's usual attack (a push, or the tempo moving).
    // Before the ear has a period it takes the accented attacks only (at least
    // BOOT_ACCENT of the usual), so a soft run of eighths cannot set it at
    // twice the tempo. And no faster than BEAT_MIN_GAP_S, ever.
    //
    // All of that is decided only on a frame with an attack in it: most
    // frames have none, and the ear's garbage bar (`npm run eargc`) counts
    // every double an unoptimised frame boxes.
    if ((kick.hit || pulse) && this.decide(time, kick, pulse, pulseStrength, rise, typical)) {
      return { hit: true, strength: this.last, at: this.at, last: this.last };
    }
    return { hit: false, strength: 0, at: this.at, last: this.last };
  }

  /** A frame with an attack: is it the beat? If so, mark it and fold its gap into the period. */
  private decide(time: number, kick: OnsetState, pulse: boolean, pulseStrength: number, rise: number, typical: number): boolean {
    const since = this.at === null ? Infinity : time - this.at;
    // A stop longer than LOST_S lets the period go: the band may come back at another tempo.
    if (since > LOST_S) { this.period = 0; this.periods.fill(Infinity); this.gaps = 0; this.offGrid = 0; }
    let onGrid = false;
    if (this.period > 0 && since !== Infinity) {
      const e = since / this.period, whole = Math.round(e);
      onGrid = whole >= 1 && Math.abs(e - whole) <= GRID_TOL;
    }
    let strength: number;
    if (kick.hit && (this.kickKeepsTime(time) || since >= SAME_ATTACK_S)) strength = kick.strength;
    else if (pulse && !this.kickKeepsTime(time) && since >= BEAT_MIN_GAP_S
      && (this.period > 0
        ? onGrid || rise >= OFF_GRID_ACCENT * typical
        : typical === Infinity || rise >= BOOT_ACCENT * typical)) strength = pulseStrength;
    else return false;
    if (since <= LOST_S) this.entrain(since, onGrid);
    this.at = time; this.last = strength;
    return true;
  }
}
