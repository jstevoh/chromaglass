/**
 * Somewhere to get the tempo from besides the microphone.
 *
 * The beat clock listens to onsets and does it well, and on a stage with a
 * clean aux send from the desk that is the right answer — it needs nothing
 * plugged in and it follows a band that speeds up. But onset detection is
 * still a guess, and there are rooms where the guess is hard: a loud bar
 * where the microphone hears the crowd as much as the kick, a DJ set where
 * the low end never stops, a rehearsal against Ableton where the tempo is
 * already a known number sitting on the other side of a cable.
 *
 * So: three ways to tell the show the tempo instead of making it work the
 * tempo out.
 *
 *   **MIDI clock** — twenty-four pulses a quarter note, on the port that is
 *   already open for the faders. Nothing to set up: if the desk is sending
 *   clock, the show is locked to it.
 *
 *   **Tap** — four taps on a pad or a key. What every VJ reaches for when
 *   the room is fighting the microphone, and the one thing this app made
 *   impossible (the APC40's Tap Tempo button is drawn on the controller
 *   picture and has never had anything behind it).
 *
 *   **A typed number** — when the tempo is on the setlist.
 *
 * A source that knows the tempo sets both the period *and* the phase, which
 * is the part that matters: a beat clock with the right tempo and the wrong
 * phase puts every kick exactly half a beat late.
 *
 * The audio clock is never turned off by any of this. It keeps listening,
 * and taking over again is one button.
 */

export type TempoSourceKind = 'clock' | 'tap' | 'manual';

export interface TempoReading {
  /** Milliseconds per beat. */
  period: number;
  /**
   * When a beat last fell, as `performance.now()` — or null for a source that
   * knows the tempo but not where the bar is (a typed number), which leaves
   * the beat clock's own phase alone.
   */
  beatAt: number | null;
  source: TempoSourceKind;
  /** Bumped on every fresh beat, so a reader can tell a new one from a held one. */
  seq: number;
}

/** The same range the beat clock works in: 60 to 200 bpm. */
const MIN_PERIOD = 300;
const MAX_PERIOD = 1000;

/** MIDI clock is twenty-four pulses to the quarter note. Always. */
const PPQ = 24;

/**
 * How long a MIDI clock is believed after the last pulse.
 *
 * At the slowest tempo in range a pulse arrives every 42ms, so a fifth of a
 * second is five missed pulses — a cable out, a desk stopped, a laptop that
 * went to sleep. Long enough not to drop out on a scheduling hiccup, short
 * enough that a stopped clock hands back within a beat.
 */
const CLOCK_HOLD = 400;

/** Taps more than this far apart are a new attempt, not a slower tempo. */
const TAP_GAP = 2500;
/** Two taps closer than this are one press arriving twice. */
const DOUBLE_TAP_MS = 25;

const clampPeriod = (ms: number) => Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, ms));

/**
 * Fold an interval into the 60–200 bpm range by halving or doubling.
 *
 * Zero and anything not finite go back unchanged rather than into the loop:
 * doubling zero never reaches the minimum, so this spun for ever and took the
 * tab with it. Two taps can genuinely share a millisecond — a pad that sends
 * its note twice, a button bound both on the controller and under a finger.
 * The caller treats a non-positive result as "no tempo yet".
 */
const fold = (ms: number): number => {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  let p = ms;
  while (p > MAX_PERIOD) p /= 2;
  while (p < MIN_PERIOD) p *= 2;
  return p;
};

export const bpmOf = (period: number): number => (period > 0 ? 60000 / period : 0);
export const periodOf = (bpm: number): number => (bpm > 0 ? 60000 / bpm : 0);

export class TempoSource {
  private kind: TempoSourceKind | null = null;
  private period = 0;
  private beatAt: number | null = null;
  private seq = 0;

  // MIDI clock
  private pulses = 0;
  private lastPulseAt = -Infinity;
  /** The last few beat times, for a period that does not jitter with one late pulse. */
  private clockBeats: number[] = [];

  // Tap
  private taps: number[] = [];

  /** What is driving the tempo right now, or null when nothing is. */
  get active(): TempoSourceKind | null {
    return this.kind;
  }

  /** Beats per minute of whatever is driving, or 0. */
  get bpm(): number {
    return this.kind ? bpmOf(this.period) : 0;
  }

  /** How many taps are in the current attempt, for a button that counts them in. */
  get tapCount(): number {
    return this.taps.length;
  }

  /**
   * The reading, or null when nothing outside is speaking.
   *
   * `now` is passed in rather than read here so the whole show agrees about
   * what time it is, and so this can be tested without a clock.
   */
  read(now: number): TempoReading | null {
    // A MIDI clock that has stopped sending stops being the tempo. Tap and a
    // typed number are deliberate acts and stay until they are replaced or
    // cleared — an operator who tapped a tempo did not mean "for four seconds".
    if (this.kind === 'clock' && now - this.lastPulseAt > CLOCK_HOLD) this.clear();
    if (!this.kind || this.period <= 0) return null;
    return { period: this.period, beatAt: this.beatAt, source: this.kind, seq: this.seq };
  }

  /** Back to listening: the microphone's own beat clock takes over again. */
  clear(): void {
    this.kind = null;
    this.period = 0;
    this.beatAt = null;
    this.pulses = 0;
    this.lastPulseAt = -Infinity;
    this.clockBeats = [];
    this.taps = [];
  }

  /**
   * One MIDI clock pulse (0xF8).
   *
   * Twenty-four of them is a beat. The period comes from the span across the
   * last few beats rather than from one, because a pulse arriving late — and
   * they do, through a USB stack and a browser's event loop — would otherwise
   * shorten one beat and lengthen the next.
   */
  clockPulse(now: number): void {
    this.lastPulseAt = now;
    if (++this.pulses < PPQ) return;
    this.pulses = 0;
    this.clockBeats.push(now);
    while (this.clockBeats.length > 5) this.clockBeats.shift();
    if (this.clockBeats.length >= 2) {
      const span = this.clockBeats[this.clockBeats.length - 1] - this.clockBeats[0];
      const period = span / (this.clockBeats.length - 1);
      // Not folded: a desk sending clock means the tempo it says, even if that
      // is 50 or 210 bpm, so this is clamped into what the solver can pulse at
      // rather than silently halved.
      this.period = clampPeriod(period);
      this.kind = 'clock';
      this.beatAt = now;
      this.seq++;
    }
  }

  /** Song position back to the top (0xFA / 0xFB): the next pulse begins a beat. */
  clockStart(now: number): void {
    this.pulses = 0;
    this.lastPulseAt = now;
    this.clockBeats = this.period > 0 ? [now] : [];
    if (this.period > 0) {
      this.beatAt = now;
      this.kind = 'clock';
      this.seq++;
    }
  }

  /** The desk stopped (0xFC). Hand back rather than coast on a tempo nobody is playing. */
  clockStop(): void {
    if (this.kind === 'clock') this.clear();
  }

  /**
   * A tap. Two give a tempo, four give a good one.
   *
   * Each tap is also a beat, so the phase lands on the operator's hand — tap
   * on the downbeats and the plate is pressed on the downbeats.
   */
  tap(now: number): void {
    const last = this.taps.length ? this.taps[this.taps.length - 1] : -Infinity;
    if (now - last > TAP_GAP) this.taps = [];
    // A second tap within a fortieth of a second is not a tempo of 1500 bpm,
    // it is one press arriving twice — a pad that double-fires, or a button
    // bound on the controller *and* under a finger on the screen. Swallowed
    // rather than folded into the average it would ruin.
    else if (now - last < DOUBLE_TAP_MS) return;
    this.taps.push(now);
    while (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 2) {
      // The first tap is still a beat: it sets the phase of whatever tempo is
      // already running, which is how a light show gets back on the bar after
      // a fill without retyping anything.
      if (this.kind) { this.beatAt = now; this.seq++; }
      return;
    }
    const ivs: number[] = [];
    for (let i = 1; i < this.taps.length; i++) ivs.push(this.taps[i] - this.taps[i - 1]);
    const mean = ivs.reduce((s, v) => s + v, 0) / ivs.length;
    const folded = fold(mean);
    if (folded <= 0) return;             // nothing usable in these taps yet
    this.period = clampPeriod(folded);
    this.kind = 'tap';
    this.beatAt = now;
    this.seq++;
  }

  /** A number off the setlist. No phase: the clock keeps whatever bar it is on. */
  setBpm(bpm: number): void {
    const period = periodOf(bpm);
    if (!(period > 0)) { if (this.kind === 'manual') this.clear(); return; }
    this.period = clampPeriod(period);
    this.kind = 'manual';
    this.beatAt = null;
    this.taps = [];
    this.seq++;
  }
}
