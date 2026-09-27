/**
 * Where the beats fall, and which of them is the one.
 *
 * PLAN §10 step 3 asks for the accents a projectionist plays: a squeeze on
 * the downbeat, not on every kick. That needs the one, and nothing in the
 * show knew it. The beat clock (`beatClock.ts`) runs ahead of the microphone
 * on the kick and knows nothing of bars; sound learn's "Each bar" fires on
 * every fourth beat counted from whenever the clock happened to lock, which
 * is the one a quarter of the time. So this listens for the bar on its own.
 *
 * ## The beats: tempo and phase from the last eight seconds
 *
 * Every frame gives an onset strength: how far each of the analyser's
 * thirteen levels rose since the last frame, in decibels, summed (a rise
 * anywhere in the spectrum, the usual measure). Four times a second the last
 * BEAT_WINDOW seconds of it, spread into bins at GRID_HZ, are autocorrelated
 * over the lags for 70 to 180 bpm, weighted toward 120 (a log-normal an
 * octave and a bit wide, so a tempo and its double are told apart the way a
 * listener would), and the best lag refined between bins. The phase is the
 * offset whose comb of beats back through the window collects the most onset
 * strength, the recent beats counting most.
 *
 * Not the beat clock, which was tried first and measured: on
 * `npm run downbeat`'s songs, fed the kick onsets, it was locked on the beat
 * for about a third of the groove (four on the floor at 128 bpm: 59 of 96
 * beats locked, 12 of those off the beat). A bass line on the root under a
 * kick keeps the kick region from ever falling back under the clock's onset
 * threshold. The comb over eight seconds names a real beat within 70 ms on
 * every tick of every groove of the eight songs, once its lag is refined
 * between bins (whole bins at 60 Hz put 96 bpm at 94.7 and the phase slid a
 * tenth of a second across the window) and each frame's onset is spread over
 * the bins it stands for and smoothed across a frame at 30 fps. At 30 fps, a
 * frame to every third bin, the comb found 91 % of beats, the rest half a
 * beat out on the rock song's eighth-note hats; spread over its bins, 94 %;
 * smoothed as well, every one, and at 60 fps the beats it names moved 8 ms
 * nearer the truth.
 *
 * ## The one: evidence, beat by beat, kept across the song
 *
 * Each beat of the last BAR_WINDOW seconds is read for three things:
 *
 *   - **the harmony moves** (HARMONY_W): the two beats from this one against
 *     the two before it, in the four bands from 40 to 800 Hz, each band's
 *     median over its beat so a drum's transient does not count. A chord and
 *     its bass note change on the bar line more than anywhere else, and
 *     across two beats a fill's toms on three and four (which are in those
 *     bands) weigh half what they did across one;
 *   - **the backbeat is not the one** (SNARE_W, against): a snare on two and
 *     four;
 *   - **the kick is on it** (KICK_W): the loudest kick of the beat's first
 *     quarter.
 *
 * Each standardised against the window's own, with a floor under the snare's
 * and the kick's spread so a song with neither does not have its noise
 * blown up into evidence; and a beat where the kick comes back after two
 * beats without it (the end of a fill, or of a break) is given FILL_W more,
 * because a drummer's fill lands on the one.
 *
 * The first version scored the four places in the bar afresh over each
 * sixteen seconds, and its pick was right 97 to 100 % of the time on these
 * songs. But how sure it was could not be told: a loop of kicks on one chord
 * scored as confidently as a rock song, because a sixteen-second window of
 * noise, standardised, always has a winner. So the beats are numbered (the
 * latest is the last estimate's latest, moved on by whole beats) and each
 * beat's evidence is kept, once, against its number modulo four, fading by
 * DECAY a beat. Kept as pairs: each beat against each of the three before it,
 * so what neighbouring beats share (a louder chorus, a fill's snare run, the
 * chord) cancels, which is what let the rock songs' one stand out (its
 * paired t reached 3 in a verse where the unpaired one stayed under 2). And
 * kept only where there is a kick within a beat: a breakdown's pad and
 * hats, and a build's snare roll, hold the evidence still rather than
 * wash it out.
 *
 * The place with the most evidence is the one once it stands over each of
 * the other three by BAR_SURE_ON in the paired t (and stays so until it falls
 * under BAR_SURE_OFF), a mark set over what a bar-less loop reaches by
 * chance. Where it does not, but the two places two beats apart
 * stand over the other two (the backbeat is heard, the one is not yet told
 * from three), the grid is sure of the half bar only: the strong beats and
 * the weak. On four on the floor with a chord a bar, the one is told from
 * three by the chord alone, faintly, and the half bar is what is known for
 * the first bars of each section (on the slowest song, at 90 bpm, for half
 * of each sixteen-bar section).
 *
 * A grid that moves off its numbering (a fifth of a beat, or its tempo by
 * 4 %) for SLIP_HOLD seconds is a new one, and everything heard is
 * forgotten; for less, it is unsure while it lasts and picks up where it
 * was (a build's thirty-second roll can pull the tempo to its double for a
 * second or two).
 *
 * ## What it does not know
 *
 * Bars that are not four beats; a song whose chord changes land between bar
 * lines. The songs it was weighed on are synthesised, with a chord a bar or
 * every two: nothing on the shelf has a beat, so no recorded song has been
 * measured.
 *
 * Pure: readings and their times in, the grid out. `npm run downbeat` feeds
 * it the songs of `scripts/arrangement.mjs`, whose bars are known to the
 * sample.
 */
import type { AudioReading } from './audioFeatures.ts';

export interface BarNow {
  /** Seconds a beat, 0 while there is no tempo. */
  period: number;
  /** When the latest beat fell, on the readings' clock, seconds; null while there is none. */
  beatAt: number | null;
  /** That beat's place in the bar: 0 is the one. Null while unsure. */
  place: number | null;
  /**
   * Whether that beat is a strong one (the one or three: 0) or a weak one
   * (two or four: 1). Known sooner than `place`; null while unsure.
   */
  half: number | null;
  /** 0..1: how sure of the beat (the tempo's peak against the onsets' spread). */
  beatConfidence: number;
  /** 0..1: how far the one stands over the next best place, as a share of twice the sure mark. */
  barConfidence: number;
}

/** `placeAt`'s answer for a moment the grid is sure of that falls between beats. */
export const OFF_THE_BEAT = -1;
/** `placeAt`'s answer for the one or three, where the grid knows only the half bar. */
export const STRONG_BEAT = -2;
/** `placeAt`'s answer for two or four, where the grid knows only the half bar. */
export const WEAK_BEAT = -3;

/*
  The numbers.

  GRID_HZ: onset strength is binned at 100 a second, whatever the frame rate
  (a render reads at 30, a ProMotion display at 120), so the lags are the
  same length in time for all of them. SMOOTH 4 bins: 40 ms either side,
  about a frame at 30 fps.

  BEAT_WINDOW 8 s: sixteen beats at 120, enough for the comb to settle and
  short enough to follow a tempo change within a phrase. BAR_WINDOW 16 s:
  the beats read for the bar, and the spread each feature is standardised
  against; the evidence itself is kept across the song.

  PREFER_BPM / PREFER_OCTAVES: the log-normal the tempo is weighted by.
  HARMONY_W, SNARE_W, KICK_W, FILL_W: see "The one" above. The backbeat at
  twice the harmony found the rock songs' one where either alone did not
  (the harmony alone: every club song, a third of the rock ones, whose kick
  on the "and" of three reads as harmony in 40–84 Hz; the backbeat alone the
  other way about). SNARE_FLOOR, KICK_FLOOR: the least spread either is
  standardised by, in its own units: on a pad with a hat on each beat the
  snare's spread was 0.03 and the kick's 0.7 dB, against 0.17 and 4.3 in a
  rock verse.

  KERNEL 2: beats either side for the harmony's change.

  DECAY 0.993 a beat: the evidence's half-life is about 100 beats, a verse
  and a chorus. With a sure mark of 2, at 0.985 (half-life 46) the
  four-on-the-floor songs were sure of the one on their eight-bar sections
  33 to 67 % of the time, at 0.993 33 to 89 %; longer still gained little
  and cost a slower change of mind.

  BAR_SURE_ON 2.2, BAR_SURE_OFF 1.5: the paired t. Three loops of kicks,
  hats and a bass on one chord (118, 126 and 132 bpm), where no one could say
  which beat is the one, reach 1.02, 1.51 and 1.65 at their worst over 48
  bars each, and the half bar's t 0.9 at most; a pulse with no kick, 0. The
  mark was 2.6 at first, set over 2.3 on the loops and blamed on a detuned
  pad's slow beating. It was not the pad: the loops' bass played its octave
  on the "and" of four, a pickup into every one, which is a bar line. Under
  a mark of 1 the loop at 126 with its pickup was sure on 91 ticks of 216,
  every one at the same place, and its t reached 2.62 (2.31 before the lag
  and the bins were mended, below), against 1.51 with the pickup gone
  (`arrangement.mjs`). So the mark came down, measured on the way
  (`npm run downbeat`: the one known at its kick, of 230 ones on eight
  songs; no other kick taken for it at any mark, no loop ever sure): 2.6,
  67 %; 2.4, 74 %; 2.2, 78 %; 2.0, 81 %, but at 2.0 the same song 20 dB
  down was placed alike on only 93 % of its kicks, a grid on a knife's edge.
  2.2 stands a third over the worst loop. The songs' one reaches 3 to 5, the
  half bar's t 4 to 12. An accent on the wrong beat is worse than none. OFF
  keeps the ratio to ON it had.

  MIN_READ 12: the beats a window must hold before its evidence counts. A
  window just after a new grid began is a few beats long, and standardised
  against so few its noise is kept for a hundred beats.

  KICK_THERE_DB: a beat has a kick when its kick is within 12 dB of the
  window's loudest and over KICK_FLOOR_DB.

  SLIP, TEMPO_SLIP, SLIP_HOLD: see "The one", last paragraph.

  ON_BEAT: a moment is on a beat when it is within this share of a period of
  one; a kick further off (the "and") is OFF_THE_BEAT.

  MIN_BEAT_CONFIDENCE: under it there is no beat to speak of and nothing is
  placed.
*/
const GRID_HZ = 100;
const SMOOTH = 4;
const BEAT_WINDOW = 8;
const BAR_WINDOW = 16;
const TICK_S = 0.25;
const MIN_BPM = 70, MAX_BPM = 180;
const PREFER_BPM = 120, PREFER_OCTAVES = 0.9;
const HARMONY_BANDS = [5, 6, 7, 8];    // reading.db: band1..band4, 40–800 Hz
const KICK = 1;
const HARMONY_W = 1, SNARE_W = 2, KICK_W = 1, FILL_W = 3;
const SNARE_FLOOR = 0.08, KICK_FLOOR = 2;
const KERNEL = 2;
const MIN_READ = 12;
const DECAY = 0.993;
const BAR_SURE_ON = 2.2, BAR_SURE_OFF = 1.5;
const KICK_THERE_DB = 12, KICK_FLOOR_DB = -70;
const SLIP = 0.2, TEMPO_SLIP = 0.04, SLIP_HOLD = 4;
const ON_BEAT = 0.2;
const MIN_BEAT_CONFIDENCE = 0.15;

interface Frame { t: number; onset: number; harmony: number[]; snare: number; kick: number; }
interface Beat { harmony: number[]; snare: number; kick: number; }

const EMPTY: BarNow = { period: 0, beatAt: null, place: null, half: null, beatConfidence: 0, barConfidence: 0 };

const median = (a: number[]): number => {
  if (!a.length) return -120;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
};
const standardise = (a: number[], floor: number): number[] => {
  const n = a.length || 1;
  const m = a.reduce((s, x) => s + x, 0) / n;
  const sd = Math.max(floor, Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / n)) || 1;
  return a.map(x => (x - m) / sd);
};
const mod4 = (i: number): number => ((i % 4) + 4) % 4;
const square = (): number[][] => [0, 1, 2, 3].map(() => [0, 0, 0, 0]);

export class BarGrid {
  private frames: Frame[] = [];
  private lastDb: number[] | null = null;
  private tickAt = -Infinity;
  private state: BarNow = { ...EMPTY };
  // The numbering (see "The one").
  private anchorAt: number | null = null;
  private anchorPeriod = 0;
  private anchorIndex = 0;
  private slipSince: number | null = null;
  private grooveFrom = -Infinity;
  // The evidence: each place's decayed sum, and for each pair of places the
  // decayed sum of the later beat's score less the earlier's, of its square,
  // and how many.
  private heardTo = -Infinity;
  private sum = [0, 0, 0, 0];
  private pairSum = square();
  private pairSquares = square();
  private pairs = square();
  private recent: { at: number; x: number }[] = [];
  private sureOfOne = false;
  private sureOfHalf = false;
  private estimated = 0;

  reset(): void {
    this.frames = [];
    this.lastDb = null;
    this.tickAt = -Infinity;
    this.state = { ...EMPTY };
    this.anchorAt = null;
    this.slipSince = null;
    this.grooveFrom = -Infinity;
    this.forget();
  }

  private forget(): void {
    this.heardTo = -Infinity;
    this.sum = [0, 0, 0, 0];
    this.pairSum = square();
    this.pairSquares = square();
    this.pairs = square();
    this.recent = [];
    this.sureOfOne = false;
    this.sureOfHalf = false;
  }

  get now(): Readonly<BarNow> { return this.state; }

  /**
   * How many estimates it has made. The estimate is the costly part, four a
   * second on the render loop's thread, and `npm run downbeat` times each one
   * by watching this move; timing every frame and dividing, as it did first,
   * averaged the estimates' spikes into the frames between them.
   */
  get estimates(): number { return this.estimated; }

  /**
   * One frame, at `time` seconds on the readings' clock; null when nothing is
   * heard. A clock that goes back, or jumps on by more than five seconds,
   * starts it afresh.
   *
   * With nothing heard the grid is kept for a beat window and then let go:
   * no estimate runs on a null reading, so without this the last grid stood
   * for as long as the show was paused, `placeAt` extrapolating it along the
   * advancing clock and the phone saying "Counting the one" to silence.
   */
  update(reading: AudioReading | null, time: number): void {
    const newest = this.frames.length ? this.frames[this.frames.length - 1].t : null;
    if (newest !== null && (time < newest - 0.5 || time > newest + 5)) this.reset();
    if (!reading || !reading.db) {
      this.lastDb = null;
      if (this.state.beatAt !== null && time - this.state.beatAt > BEAT_WINDOW) this.state = { ...EMPTY };
      return;
    }
    const db = reading.db;
    let onset = 0;
    if (this.lastDb) for (let i = 0; i < db.length; i++) onset += Math.max(0, db[i] - this.lastDb[i]);
    this.lastDb = db;
    this.frames.push({ t: time, onset, harmony: HARMONY_BANDS.map(k => db[k]), snare: reading.snare, kick: db[KICK] });
    while (this.frames.length && time - this.frames[0].t > BAR_WINDOW + 1) this.frames.shift();
    if (time - this.tickAt >= TICK_S) { this.tickAt = time; this.estimate(time); }
  }

  /**
   * The place in the bar of a moment `t` (seconds, the readings' clock): 0 on
   * the one, 1 to 3 the other beats; STRONG_BEAT or WEAK_BEAT where only the
   * half bar is known; OFF_THE_BEAT between beats (the "and"); null while the
   * grid is unsure.
   */
  placeAt(t: number): number | null {
    const s = this.state;
    if (s.half === null || s.beatAt === null || !(s.period > 0)) return null;
    const k = Math.round((t - s.beatAt) / s.period);
    if (Math.abs(t - (s.beatAt + k * s.period)) > ON_BEAT * s.period) return OFF_THE_BEAT;
    if (s.place !== null) return mod4(s.place + k);
    return mod4(s.half + k) % 2 === 0 ? STRONG_BEAT : WEAK_BEAT;
  }

  private estimate(now: number): void {
    this.estimated++;
    // Onset strength in bins over the beat window, each frame spread over
    // the bins it stands for.
    const n = Math.round(BEAT_WINDOW * GRID_HZ);
    const from = now - BEAT_WINDOW;
    if (!this.frames.length || this.frames[0].t > from + 1) { this.state = { ...EMPTY }; return; }
    const bins = new Float64Array(n);
    for (let k = 0; k < this.frames.length; k++) {
      const f = this.frames[k];
      // A millionth of a bin over, so a frame that falls exactly on a bin's
      // edge lands in the same bin whatever the clock reads. On the page's
      // clock (an hour and more of seconds) the subtraction rounds a frame
      // exactly 3.05 s into the window to bin 304.99999…, and the floor put
      // it one bin early:
      // measured, the same song on a clock at 4321 s was placed alike on
      // 93 to 98 % of its kicks at sure marks of 2.0 and 2.4, and on 100 %
      // with this. A real clock seldom lands on an edge; a render's does.
      const i0 = Math.floor((f.t - from) * GRID_HZ + 1e-6);
      const span = k > 0 ? Math.max(1, Math.min(8, Math.round((f.t - this.frames[k - 1].t) * GRID_HZ))) : 1;
      for (let i = i0 - span + 1; i <= i0; i++) if (i >= 0 && i < n) bins[i] += f.onset / span;
    }
    // And smoothed, a triangle SMOOTH bins either side (see "The beats").
    {
      const raw = bins.slice();
      for (let i = 0; i < n; i++) {
        let s = 0, w = 0;
        for (let k = -SMOOTH; k <= SMOOTH; k++) {
          const j = i + k;
          if (j < 0 || j >= n) continue;
          const wk = SMOOTH + 1 - Math.abs(k);
          s += wk * raw[j]; w += wk;
        }
        bins[i] = s / w;
      }
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += bins[i];
    mean /= n;
    const x = Array.from(bins, v => v - mean);
    let zero = 0;
    for (let i = 0; i < n; i++) zero += x[i] * x[i];
    if (!(zero > 0)) { this.state = { ...EMPTY }; return; }

    // Tempo: the autocorrelation's best lag, weighted toward PREFER_BPM.
    const lo = Math.floor((GRID_HZ * 60) / MAX_BPM), hi = Math.ceil((GRID_HZ * 60) / MIN_BPM);
    const ac = new Float64Array(hi + 2);
    for (let lag = lo - 1; lag <= hi + 1; lag++) {
      let s = 0;
      for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
      ac[lag] = s;
    }
    let best = lo, bestV = -Infinity;
    for (let lag = lo; lag <= hi; lag++) {
      const bpm = (GRID_HZ * 60) / lag;
      const w = Math.exp(-0.5 * (Math.log2(bpm / PREFER_BPM) / PREFER_OCTAVES) ** 2);
      if (ac[lag] * w > bestV) { bestV = ac[lag] * w; best = lag; }
    }
    // Refined between bins at the autocorrelation's own peak, and only there.
    //
    // What was reported: the parabola through the best lag and its two
    // neighbours was fitted wherever it curved downward, and the best lag is
    // the best of the autocorrelation *weighted toward 120*, which is often
    // on the flank of a peak of the autocorrelation itself, not on the peak.
    // On a flank that is nearly straight the parabola's vertex is anywhere:
    // measured on `npm run downbeat`'s songs, 12 to 147 estimates a song were
    // refined from a flank, the worst 28.7 bins off (the grid named 393 bpm in
    // a song at 128, and 194 in one at 96), and a fuzzed onset stream drove
    // the lag to thousands of bins, or below zero, where the beat walk below
    // never ends (the render loop hangs). So: climb from the weighted best to
    // the top of the peak it stands on (within the lags searched), and fit the
    // parabola only there, where its vertex is within half a bin. Not just
    // "refine only at a peak, else keep the whole bin", which was measured
    // too: on a flank the whole bin put the period up to 1.3 % off the song's
    // (the phase then slides across the window, see "The beats"), where the
    // climb keeps it within 0.5 %, as it was before on the estimates that
    // were on a peak. The lag named is therefore always within half a bin of
    // the range searched: 32.5 to 86.5 bins, 69 to 185 bpm.
    let top = best;
    while (top < hi && ac[top + 1] > ac[top]) top++;
    while (top > lo && ac[top - 1] > ac[top]) top--;
    let lag = top;
    const a = ac[top - 1], b = ac[top], c = ac[top + 1], d = a - 2 * b + c;
    if (d < 0 && b >= a && b >= c) lag += (0.5 * (a - c)) / d;
    // The climb keeps the lag in range; this is the second lock on the door.
    // Both the phase's comb and the beat walk below step by the lag: a lag of
    // a hair over zero steps a comb of millions of teeth, one at or under
    // zero walks the beats forever, on the render loop's thread. With the
    // refinement as it was and this lock off, `npm run downbeat`'s fuzzed
    // streams never returned (killed at its two-minute deadline). Nothing
    // known is better than that.
    if (!(lag >= lo - 0.5 && lag <= hi + 0.5)) { this.state = { ...EMPTY }; return; }
    const beatConfidence = Math.max(0, Math.min(1, ac[best] / zero));

    // Phase: the comb back from now collecting the most onset, recent beats first.
    let phase = 0, phaseV = -Infinity;
    for (let ph = 0; ph < lag; ph += 0.5) {
      let s = 0, w = 1;
      for (let p = n - 1 - ph; p >= 1; p -= lag) {
        const i = Math.round(p);
        s += w * (bins[i] + 0.5 * (bins[i - 1] ?? 0) + 0.5 * (bins[i + 1] ?? 0));
        w *= 0.9;
      }
      if (s > phaseV) { phaseV = s; phase = ph; }
    }
    const period = lag / GRID_HZ;
    const beatAt = from + (n - 1 - phase + 0.5) / GRID_HZ;
    const unsure: BarNow = { period, beatAt, place: null, half: null, beatConfidence, barConfidence: 0 };
    if (beatConfidence < MIN_BEAT_CONFIDENCE) { this.state = unsure; return; }

    // The beats of the bar window, read one by one: the frames are in time
    // order, so one walk through them serves every beat.
    const starts: number[] = [];
    const first = Math.max(now - BAR_WINDOW, this.grooveFrom, this.frames[0].t);
    for (let t = beatAt; t >= first; t -= period) starts.unshift(t);
    const beats: Beat[] = [];
    let k0 = 0;
    for (const t0 of starts) {
      while (k0 < this.frames.length && this.frames[k0].t < t0 - 0.02) k0++;
      const harmony: number[][] = HARMONY_BANDS.map(() => []);
      let snare = 0, kick = -120;
      for (let k = k0; k < this.frames.length && this.frames[k].t < t0 + period - 0.02; k++) {
        const f = this.frames[k];
        for (let h = 0; h < harmony.length; h++) harmony[h].push(f.harmony[h]);
        if (f.t < t0 + period / 2) snare = Math.max(snare, f.snare);
        if (f.t < t0 + period / 4 + 0.02) kick = Math.max(kick, f.kick);
      }
      beats.push({ harmony: harmony.map(median), snare, kick });
    }
    if (beats.length < 2 * KERNEL + 2) { this.state = unsure; return; }
    const last = beats.length - 1;

    // Number the beats (see "The one", last paragraph).
    const moved = this.anchorAt === null ? NaN : (beatAt - this.anchorAt) / this.anchorPeriod;
    const agrees = Number.isFinite(moved) && Math.abs(moved - Math.round(moved)) <= SLIP && Math.abs(period - this.anchorPeriod) <= TEMPO_SLIP * period;
    if (this.anchorAt !== null && !agrees) {
      if (this.slipSince === null) this.slipSince = now;
      if (now - this.slipSince < SLIP_HOLD) { this.state = unsure; return; }
      // A new grid: forget the old one's evidence, and read no beat from
      // before this one began (what came before is on another grid, at
      // another tempo, perhaps another song, and its kicks would set the
      // mark this one's are measured against).
      this.forget();
      this.anchorAt = null;
      this.grooveFrom = this.slipSince - period;
    }
    this.slipSince = null;
    this.anchorIndex = this.anchorAt === null ? 0 : this.anchorIndex + Math.round(moved);
    this.anchorAt = beatAt;
    this.anchorPeriod = period;

    // The evidence of each beat not yet heard whose neighbours are all in:
    // the harmony's change wants KERNEL beats on either side, and the latest
    // is still going.
    const js: number[] = [];
    for (let j = KERNEL; j + KERNEL <= last; j++) js.push(j);
    const span = (j0: number, j1: number): number[] => HARMONY_BANDS.map((_, h) => {
      let s = 0;
      for (let j = j0; j < j1; j++) s += beats[j].harmony[h];
      return s / (j1 - j0);
    });
    const change = js.map(j => {
      const before = span(j - KERNEL, j), after = span(j, j + KERNEL);
      return before.reduce((s, v, h) => s + Math.abs(v - after[h]), 0);
    });
    const zc = standardise(change, 0);
    const zs = standardise(js.map(j => beats[j].snare), SNARE_FLOOR);
    const zk = standardise(js.map(j => beats[j].kick), KICK_FLOOR);
    const kickMax = Math.max(...beats.map(f => f.kick));
    const kicked = (j: number): boolean => j >= 0 && j <= last && beats[j].kick >= Math.max(KICK_FLOOR_DB, kickMax - KICK_THERE_DB);
    js.forEach((j, i) => {
      if (js.length < MIN_READ) return;
      const at = this.anchorIndex - (last - j);
      if (at <= this.heardTo) return;
      this.heardTo = at;
      if (!(kicked(j) || kicked(j - 1) || kicked(j + 1))) return;
      const fillEnd = kicked(j) && !kicked(j - 1) && !kicked(j - 2) ? FILL_W : 0;
      const score = HARMONY_W * zc[i] - SNARE_W * zs[i] + KICK_W * zk[i] + fillEnd;
      const p = mod4(at);
      for (let q = 0; q < 4; q++) {
        this.sum[q] *= DECAY;
        for (let r = 0; r < 4; r++) { this.pairSum[q][r] *= DECAY; this.pairSquares[q][r] *= DECAY; this.pairs[q][r] *= DECAY; }
      }
      this.sum[p] += score;
      for (const r of this.recent) {
        if (at - r.at > 3) continue;
        const q = mod4(r.at), dx = score - r.x;
        this.pairSum[p][q] += dx; this.pairSquares[p][q] += dx * dx; this.pairs[p][q] += 1;
        this.pairSum[q][p] -= dx; this.pairSquares[q][p] += dx * dx; this.pairs[q][p] += 1;
      }
      this.recent.push({ at, x: score });
      if (this.recent.length > 3) this.recent.shift();
    });

    // How far place p stands over place q: the paired t.
    const over = (p: number, q: number): number => {
      const m = this.pairs[p][q];
      if (!(m > 2)) return 0;
      const mean = this.pairSum[p][q] / m;
      const spread = Math.sqrt(Math.max(1e-12, this.pairSquares[p][q] / m - mean * mean));
      return mean / (spread / Math.sqrt(m));
    };
    const one = [0, 1, 2, 3].reduce((p, q) => (this.sum[q] > this.sum[p] ? q : p), 0);
    const tOne = Math.min(...[1, 2, 3].map(k => over(one, mod4(one + k))));
    const strong = [one, mod4(one + 2)], weak = [mod4(one + 1), mod4(one + 3)];
    const tHalf = Math.min(...strong.flatMap(p => weak.map(q => over(p, q))));
    this.sureOfOne = tOne >= (this.sureOfOne ? BAR_SURE_OFF : BAR_SURE_ON);
    this.sureOfHalf = this.sureOfOne || tHalf >= (this.sureOfHalf ? BAR_SURE_OFF : BAR_SURE_ON);
    const place = mod4(this.anchorIndex - one);
    this.state = {
      period, beatAt, beatConfidence,
      place: this.sureOfOne ? place : null,
      half: this.sureOfHalf ? place % 2 : null,
      barConfidence: Math.max(0, Math.min(1, tOne / (2 * BAR_SURE_ON))),
    };
  }
}

/**
 * What the grid knows, in the words the phone's Sound sheet prints beside
 * Accent the One: the setting does nothing until the bar is known, and a
 * performer turning it up should see why the plate has not changed yet.
 */
export function barLine(now: Readonly<BarNow>): string {
  if (now.place !== null) return 'Counting the one';
  if (now.half !== null) return 'Hearing the backbeat, not yet the one';
  if (now.beatAt !== null && now.beatConfidence > 0) return 'Hearing the beat, not yet the bar';
  // Nothing yet: the phone says "Listening for the beat." itself, as it does
  // before the first reading, so the one line has one wording.
  return '';
}

/*
  The accent: how hard a kick's press lands, by where it falls in the bar.

  What a projectionist does with a rhythm plate, and what PLAN §10 step 3
  asks for: the big press on the one, a lighter one on three, the backbeat
  and the "and" left to the plate's own motion. With `amount` at 0 every
  kick is 1, exactly, which is the show as it was; at 1 the one lands at
  ONE_GAIN, three at THREE_GAIN, and everything else not at all. Between,
  it slides. Where only the half bar is known, the strong beats keep their
  press (1) and the weak ones lose it, as two and four would.

  The one after a fill (no kick for FILL_GAP_BEATS up to FILL_GAP_MAX_BEATS,
  then a kick on a strong beat) lands at AFTER_FILL_GAIN: the moment a
  drummer's fill is for. Two and a half beats at the least, because the
  longest ordinary gap is a rock beat's, from the "and" of three to the next
  one: a beat and a half. Four and a half at the most: a fill is the last
  beat or two of a bar, so the gap it leaves runs from the kick before it to
  the next bar's one, at most a whole bar and the half beat a late kick
  adds; a gap longer than that is not a fill but the beat coming back, which
  the song's shape hears (a drop). A kick on a strong beat after
  a fill is taken for the one even where the grid knows only the half bar:
  a fill ends on the one. The kicks are the ones the plate reacts to, so in
  the app a beat clock that keeps firing through a fill on its own
  prediction hides the fill from this.

  Where the grid is unsure (no beat, no bar, a kick heard before the grid has
  gathered enough) every kick is 1, as though the setting were off: an
  accent on the wrong beat is worse than none, and the plate never goes
  still because the grid lost the bar.

  ONE_GAIN 1.25: at the squeeze's full a press is already the plate's
  biggest move, so the one is lifted by a quarter and not doubled; the
  contrast comes from the others falling away. THREE_GAIN 0.4: three is the
  half-bar, and a rock kick is on it; felt, not pressed.
*/
const ONE_GAIN = 1.25;
const AFTER_FILL_GAIN = 1.5;
const THREE_GAIN = 0.4;
const FILL_GAP_BEATS = 2.5, FILL_GAP_MAX_BEATS = 4.5;

/** A kick's weight by its place (`BarGrid.placeAt`): 1 when `amount` is 0 or the grid is unsure. */
export function accentGain(place: number | null, amount: number, afterFill = false): number {
  const a = Math.max(0, Math.min(1, amount));
  if (!(a > 0) || place === null) return 1;
  if (afterFill && (place === 0 || place === STRONG_BEAT)) return 1 + a * (AFTER_FILL_GAIN - 1);
  if (place === 0) return 1 + a * (ONE_GAIN - 1);
  if (place === STRONG_BEAT) return 1;
  if (place === 2) return 1 - a * (1 - THREE_GAIN);
  return 1 - a;
}

/**
 * The accent for the kicks as they come: remembers when the last one was, so
 * the one after a fill is known. `kick(grid, t, amount)` at each kick the
 * plate reacts to, on the grid's clock.
 */
export class Accent {
  private lastKick = -Infinity;
  reset(): void { this.lastKick = -Infinity; }
  kick(grid: BarGrid, t: number, amount: number): number {
    const place = grid.placeAt(t);
    const period = grid.now.period;
    const gap = t - this.lastKick;
    const afterFill = period > 0 && gap >= FILL_GAP_BEATS * period && gap <= FILL_GAP_MAX_BEATS * period;
    this.lastKick = t;
    return accentGain(place, amount, afterFill);
  }
}
