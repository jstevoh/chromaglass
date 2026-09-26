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
  /**
   * Until when an outside tempo is driving.
   *
   * A MIDI clock, a tap or a typed number does not have to be worked out from
   * onsets, so while one is speaking the onsets stop re-timing anything: they
   * are still absorbed (so a heard kick and a clocked one are not two kicks)
   * but they cannot drag the period around, which is the whole point of
   * plugging a clock in. Refreshed every frame by whoever is driving; a beat
   * or two after they stop, the microphone has it back.
   */
  private externalUntil = 0;
  /** The last outside beat taken, so the same one is not re-phased every frame. */
  private externalSeq = -1;

  /** True while something outside is setting the tempo. */
  driven(now: number): boolean {
    return now < this.externalUntil;
  }

  reset(): void {
    this.period = 0;
    this.confidence = 0;
    this.onsets = [];
    this.lastBeat = 0;
    this.predictedAt = 0;
    this.firedPrediction = false;
    this.lastLevel = 0;
    this.lastOnsetAt = -Infinity;
    this.externalUntil = 0;
    this.externalSeq = -1;
  }

  /**
   * Take the tempo from outside.
   *
   * Call every frame with whatever the tempo source is reading, and with null
   * when it is reading nothing. `beatAt` is when a beat actually fell, and is
   * the half that matters: a clock with the right period and the wrong phase
   * puts every kick half a beat late, which is worse than not being locked at
   * all. A source with no phase of its own (a typed bpm) passes null and the
   * clock keeps the bar it is already on.
   *
   * The phase is only re-snapped when `seq` says a *new* beat arrived, so a
   * held reading does not reset the prediction sixty times a second and stop
   * it ever firing.
   */
  setExternal(now: number, reading: { period: number; beatAt: number | null; seq: number } | null): void {
    if (!reading || !(reading.period > 0)) {
      this.externalSeq = -1;
      return;                      // externalUntil simply lapses
    }
    this.externalUntil = now + 250;
    this.period = Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, reading.period));
    this.confidence = 1;
    if (reading.seq !== this.externalSeq) {
      this.externalSeq = reading.seq;
      if (reading.beatAt !== null) {
        // The beat that just arrived *is* the beat, so the prediction is put
        // on it and not on the next one. Aiming at `beatAt + period` looks
        // right and never fires: a MIDI clock sends a beat every beat, so the
        // target was pushed another period into the future a frame before the
        // clock could reach it, every time, for ever. (Measured: locked to
        // 128.0 bpm and fired nothing in twelve seconds.)
        //
        // Absorbed the same way a heard onset is: if the run-ahead already
        // fired for this beat — which is exactly what a non-zero lead makes it
        // do — then it stays fired and this is not a second kick.
        const already = this.firedPrediction
          && Math.abs(reading.beatAt - this.predictedAt) < this.period * 0.3;
        this.lastBeat = reading.beatAt;
        this.predictedAt = reading.beatAt;
        this.firedPrediction = already;
      }
    }
  }

  /**
   * Whether the clock is sure enough of its beat to run ahead of the
   * microphone: it has a period, and either something outside is setting the
   * tempo or its confidence, scaled by how far the show trusts it (Beat
   * Prediction), is at least a half.
   *
   * Public because sound learn's triggers (`soundLearn.ts`) fire ahead of the
   * sound on exactly the beats this clock fires ahead on, and two copies of
   * the rule would be two answers to "is the beat locked" on the same frame.
   */
  isLocked(now: number, trust: number): boolean {
    return this.period > 0 && (this.driven(now) || this.confidence * trust >= 0.5);
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

    // A tempo that was told to the show rather than worked out from the room
    // locks whatever `trust` says: Beat Prediction is a judgement about how far
    // to run ahead of a *microphone*, and there is no microphone in a cable
    // from the desk or a hand on a tap button.
    const driven = this.driven(now);
    const locked = this.isLocked(now, trust);

    if (onset) {
      this.lastOnsetAt = now;
      this.onsets.push(now);
      while (this.onsets.length > 32 || now - this.onsets[0] > 12000) this.onsets.shift();
      // A heard beat the clock already fired for is the same beat: absorb it.
      // (Judged before the onset re-times the clock.)
      const sameBeat = locked && this.firedPrediction && Math.abs(now - this.predictedAt) < this.period * 0.3;
      // Driven from outside, an onset is only ever a thing to absorb. Letting
      // `hear` run would let a loud crowd or a bass note off the grid pull the
      // period away from the clock that is telling the truth.
      if (!driven) this.hear(now);
      if (!sameBeat) kick = true;
    }

    if (this.period > 0) {
      // Missed: the prediction came and went with no onset near it. Not while
      // driven — a clock is right about the beat whether or not anything in
      // the room happened to be loud on it.
      if (!driven && this.firedPrediction && now > this.predictedAt + this.period * 0.35) {
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
