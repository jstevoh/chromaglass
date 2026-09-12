/**
 * Beats ahead of the microphone.
 *
 * Everything heard through a microphone reaches the visuals late: the
 * capture buffer, the analyser's window and its smoothing, the smoothing on
 * each band, then the wait for a level to cross the onset threshold. Sixty
 * to a hundred and fifty milliseconds, depending on the machine — enough
 * that a kick on the plate lands after the kick in the room. But the beat
 * in a song is the most predictable thing in it. This is a phase-locked
 * clock: it listens to the onsets, settles on a period and a phase, and
 * once it is confident it fires each beat a little *before* the onset would
 * be heard, then quietly absorbs the real onset when it arrives so nothing
 * fires twice. Lose the beat — a breakdown, a rubato passage, silence — and
 * confidence falls away and the clock hands back to plain detection.
 */

export interface BeatTick {
  /** Fire the kick reaction now. */
  kick: boolean;
  /** The kick came from the clock rather than the microphone. */
  predicted: boolean;
}

const MIN_PERIOD = 300;    // 200 bpm
const MAX_PERIOD = 1000;   // 60 bpm
const ONSET = 0.45;

/** Fold an interval into the 60–200 bpm range by halving or doubling. */
const fold = (ms: number): number => {
  let p = ms;
  while (p > MAX_PERIOD) p /= 2;
  while (p < MIN_PERIOD) p *= 2;
  return p;
};

export class BeatClock {
  /** The beat period in ms, 0 while unknown. */
  period = 0;
  /** How sure the clock is of its beat, 0..1. */
  confidence = 0;
  private onsets: number[] = [];
  private lastBeat = 0;          // when the last accepted beat fell (ms)
  private predictedAt = 0;       // the next beat the clock expects
  private firedPrediction = false;
  private lastLevel = 0;
  private lastOnsetAt = -Infinity;

  reset(): void {
    this.period = 0;
    this.confidence = 0;
    this.onsets = [];
    this.lastBeat = 0;
    this.predictedAt = 0;
    this.firedPrediction = false;
    this.lastLevel = 0;
    this.lastOnsetAt = -Infinity;
  }

  /** The next beat the clock expects, in ms, or 0 while it has no beat. */
  get nextBeat(): number {
    return this.period > 0 ? this.predictedAt : 0;
  }

  /**
   * Feed the bass level once a frame. `trust` (0..1) is how much the show
   * lets the clock run ahead of the microphone; `leadMs` how far ahead of
   * the heard onset a predicted kick fires — the pipeline's latency plus
   * whatever anticipation the show wants.
   */
  update(now: number, bass01: number, trust: number, leadMs: number): BeatTick {
    const onset = bass01 > ONSET && this.lastLevel <= ONSET;
    this.lastLevel = bass01;
    let kick = false;
    let predicted = false;

    // Nothing heard for a while: the clock loses its grip.
    if (now - this.lastOnsetAt > 3000 && this.confidence > 0) {
      this.confidence = Math.max(0, this.confidence - 0.02);
    }

    const locked = this.period > 0 && this.confidence * trust >= 0.5;

    if (onset) {
      this.lastOnsetAt = now;
      this.onsets.push(now);
      while (this.onsets.length > 32 || now - this.onsets[0] > 12000) this.onsets.shift();
      // A heard beat the clock already fired for is the same beat: absorb it.
      // (Judged before the onset re-times the clock.)
      const sameBeat = locked && this.firedPrediction && Math.abs(now - this.predictedAt) < this.period * 0.3;
      this.hear(now);
      if (!sameBeat) kick = true;
    }

    if (this.period > 0) {
      // Missed: the prediction came and went with no onset near it.
      if (this.firedPrediction && now > this.predictedAt + this.period * 0.35) {
        this.confidence = Math.max(0, this.confidence - 0.2);
        this.lastBeat = this.predictedAt;               // coast on the clock's own time
        this.predictedAt += this.period;
        this.firedPrediction = false;
      }
      // Keep the prediction ahead of now.
      while (this.predictedAt < now - this.period * 0.35) {
        this.predictedAt += this.period;
        this.firedPrediction = false;
      }
      if (locked && !this.firedPrediction && now >= this.predictedAt - leadMs) {
        this.firedPrediction = true;
        if (!kick) { kick = true; predicted = true; }
      }
    }

    return { kick, predicted };
  }

  /** An onset was heard: refine period and phase, or find a beat to begin with. */
  private hear(now: number): void {
    if (this.period === 0) {
      // Find a period: the last few inter-onset intervals, folded into range,
      // must agree with one another.
      const n = this.onsets.length;
      if (n < 4) return;
      const ivs: number[] = [];
      for (let i = n - 1; i > 0 && ivs.length < 6; i--) ivs.push(fold(this.onsets[i] - this.onsets[i - 1]));
      ivs.sort((a, b) => a - b);
      const med = ivs[Math.floor(ivs.length / 2)];
      const agree = ivs.filter(v => Math.abs(v - med) < med * 0.12).length;
      if (agree >= 3) {
        this.period = med;
        this.lastBeat = now;
        this.predictedAt = now + med;
        this.firedPrediction = false;
        this.confidence = 0.35;
      }
      return;
    }
    // A known beat: how far is this onset from where a beat should fall?
    const since = now - this.lastBeat;
    const k = Math.max(1, Math.round(since / this.period));
    const expected = this.lastBeat + k * this.period;
    const err = now - expected;
    if (Math.abs(err) < this.period * 0.3) {
      // On the beat (or a multiple of it): nudge the period, snap the phase.
      if (k <= 2) this.period += ((since / k) - this.period) * 0.15;
      this.period = Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, this.period));
      this.lastBeat = now;
      this.predictedAt = now + this.period;
      this.firedPrediction = false;
      this.confidence = Math.min(1, this.confidence + (k === 1 ? 0.15 : 0.05));
    } else {
      // Off the beat: a syncopation, a fill, or a new tempo. Lose a little
      // faith; enough of these and the clock starts over.
      this.confidence = Math.max(0, this.confidence - 0.08);
      if (this.confidence <= 0.05) {
        this.period = 0;
        this.onsets = this.onsets.slice(-4);
      }
    }
  }
}
