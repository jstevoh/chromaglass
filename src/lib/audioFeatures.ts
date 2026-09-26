/**
 * Named bands and onsets: what the music is doing, by name, once a frame.
 *
 * Until this file the show heard music as three smoothed numbers (bass, mid,
 * treble) and one onset, the bass level crossing 0.45 inside the beat clock.
 * That is enough to breathe with a song and not enough to *play* it: sound
 * learn (PLAN §5) wants to bind a control to "the kick" or "the hats" or "the
 * fourth band", and a trigger to "each snare", and a song render (PLAN §6)
 * wants the same readings computed from the file, so that a film of the song
 * reacts exactly where the live show would have.
 *
 * So this is one analyser with two front doors and no other dependencies:
 *
 *   - Live, `useAudioAnalyzer` hands `AudioFeatures.update` the spectrum its
 *     AnalyserNode already produces each frame.
 *   - Offline, `analysePcm` runs `AnalyserEmulator` (the Web Audio analyser's
 *     own arithmetic, on a song's samples) and feeds the same class.
 *
 * Nothing here touches the DOM, Web Audio, a clock or a random number, so the
 * same song gives the same readings on every run and in node, which is where
 * `npm run bands` measures it.
 *
 * What a reading holds, per source (`level`, `kick`, `bass`, `snare`, `hats`
 * and eight log-spaced bands):
 *
 *   - a value, 0..1, where the source sits between its own recent floor and
 *     ceiling. The same `AutoRange` that fits the microphone to the room does
 *     this, per source, so a quiet room and a loud one both use the full range
 *     and a band that is always quiet in this song still moves its control
 *     across the whole of its travel;
 *   - an onset: whether a hit landed this frame, how hard relative to the
 *     source's recent hits, and when the last one was (so a consumer running
 *     at a different rate from the analyser can see a hit it missed, rather
 *     than depending on catching the one frame with `hit` set).
 *
 * How the onsets work, and why each piece is there, is written next to each
 * piece below. The short version: spectral flux in decibels per region
 * (level-independent by construction), an adaptive threshold from the
 * region's own recent flux, a refractory period, a presence test against the
 * region's own range, and, for the three drums only, a look at *where in the
 * spectrum the new energy landed*, because every drum leaks into its
 * neighbours' bands and flux alone cannot tell a hat's low tail from a snare.
 */

// Imports carry their extension because `npm run bands` runs this file under
// node's strip-types loader, which does not guess one; vite and esbuild accept
// either.
import { AutoRange } from './audioCalibration.ts';
import { fft } from './fft.ts';

/**
 * The live analyser's settings, owned here so the hook and the offline path
 * cannot drift apart. A render analysed with a different window or smoothing
 * from the show would react to a different song.
 *
 * 1024 points: ~47 Hz bins at 48 kHz, enough to keep a kick (50–100 Hz) in
 * bins of its own apart from a snare's body (~200 Hz), with a 21 ms window,
 * little more than one video frame at 60 fps, so a hit is visible in the first
 * or second frame after it lands.
 */
export const ANALYSER_FFT_SIZE = 1024;
/** The AnalyserNode's own time smoothing (`smoothingTimeConstant`). */
export const ANALYSER_SMOOTHING = 0.6;
/**
 * How often that smoothing is applied live: the node smooths once per read,
 * and the hook reads once per animation frame. The offline path scales the
 * constant to its own frame rate against this, so a render at 30 fps smooths
 * over the same stretch of time as the show does at 60.
 */
export const ANALYSER_RATE_HZ = 60;

/** The named sources, in the order a UI should list them. */
export const SOUND_SOURCES = ['level', 'kick', 'bass', 'snare', 'hats'] as const;
export type SoundSource = typeof SOUND_SOURCES[number];

/**
 * Eight log-spaced bands, 40 Hz to 16 kHz, a little over an octave each.
 *
 * Why eight: the 1024-point analyser has ~45 Hz bins, so below 200 Hz there
 * are only four of them. Twelve or sixteen log bands would make the bottom
 * several bands one bin each, duplicating each other and the kick, while the
 * top ones got no narrower in any way a listener hears. Eight octave-ish bands
 * give every band at least one bin of its own at 44.1 and 48 kHz and a
 * distinct musical job (sub, bass, low mids, mids, upper mids, presence,
 * brilliance, air), and eight rows is what a sound-learn picker can show
 * without scrolling. It is also the graphic-EQ convention, so the names read.
 */
export const BAND_COUNT = 8;
export const BAND_SOURCES = ['band1', 'band2', 'band3', 'band4', 'band5', 'band6', 'band7', 'band8'] as const;
export type BandSource = typeof BAND_SOURCES[number];

/** Every name a binding can use: the named sources, then the bands. */
export const SOURCE_NAMES = [...SOUND_SOURCES, ...BAND_SOURCES] as const;
export type SourceName = typeof SOURCE_NAMES[number];

const BAND_LOW_HZ = 40;
const BAND_HIGH_HZ = 16000;
/** The nine edges of the eight bands, in Hz (40, 84.6, 179, 378, 800, 1692, 3578, 7566, 16000). */
export const BAND_EDGES_HZ: readonly number[] = Array.from({ length: BAND_COUNT + 1 },
  (_, i) => BAND_LOW_HZ * Math.pow(BAND_HIGH_HZ / BAND_LOW_HZ, i / BAND_COUNT));

type Range = readonly [number, number];

/**
 * Where each named source lives.
 *
 * `bass` is 30–250 Hz, the same range as the hook's own `bass`, and so it
 * holds the kick too: its onset is any new low-end event, a kick or a bass
 * note. `kick` is the narrow bottom of that (30–120 Hz), plus the spectral
 * test below that the new energy really is down there. `snare` is 1–5 kHz,
 * where the crack of a snare or a clap lives (and where voices live too: as a
 * *level* it is the upper mids). `hats` is 7–16 kHz.
 */
const SOURCE_RANGES: Record<SoundSource, Range> = {
  level: [30, 16000],
  kick: [30, 120],
  bass: [30, 250],
  snare: [1000, 5000],
  hats: [7000, 16000],
};
/**
 * The low mids, which no source names but the kick test needs: where a
 * snare's body (150–250 Hz) and a tom's sit, and where a kick puts almost
 * nothing.
 */
const LOW_MIDS: Range = [150, 400];

/** One spectrum frame, in whichever form the analyser gave it. */
export interface SpectrumFrame {
  /** Bins 0..fftSize/2-1, as `getFloatFrequencyData` or `getByteFrequencyData` fill them. */
  bins: ArrayLike<number>;
  /** `db`: float decibels. `byte`: 0..255 across [minDb, maxDb]. `magnitude`: linear. */
  scale: 'db' | 'byte' | 'magnitude';
  sampleRate: number;
  fftSize: number;
  /** For `byte`: the analyser's window. Defaults are the AnalyserNode's (-100, -30). */
  minDb?: number;
  maxDb?: number;
}

export interface OnsetState {
  /** A hit landed on this frame. */
  hit: boolean;
  /** How hard, 0..1, against this source's hardest hits of the last several seconds; 0 when no hit. */
  strength: number;
  /** When the latest hit landed (the frame's own time units), null before the first. */
  at: number | null;
}

export interface AudioReading {
  /** The time passed in with the frame. */
  time: number;
  /** Each 0..1 against its own recent range. */
  level: number;
  kick: number;
  bass: number;
  snare: number;
  hats: number;
  /** BAND_COUNT values, 0..1, low to high; `band1` is `bands[0]`. */
  bands: number[];
  /** One per name in SOURCE_NAMES. */
  onsets: Record<SourceName, OnsetState>;
}

/** A reading's value for a source name, so a binding can be stored as a string. */
export function sourceValue(reading: AudioReading, name: SourceName): number {
  const band = (BAND_SOURCES as readonly string[]).indexOf(name);
  return band >= 0 ? reading.bands[band] : reading[name as SoundSource];
}

// ── Levels ────────────────────────────────────────────────────────────────

/**
 * Everything more than 60 dB under the loudest bin heard recently is treated
 * as that floor. Not for tidiness: the analyser's Blackman window leaks every
 * loud bin into every other at about -58 dB, so below this line a "rise" can
 * be the window's own sidelobes moving with a kick, and in the decibel domain
 * a rise from -110 to -80 counts as much as one from -30 to 0.
 */
const FLOOR_BELOW_REF_DB = 60;
/**
 * How fast that reference comes down after the loudest moment, dB per second.
 * Slow, so the floor does not dive into the gap between two kicks, and fast
 * enough that a song 20 dB quieter than the last one has its detail back
 * inside a few seconds (and 20 dB down is still 40 dB above the floor
 * meanwhile).
 */
const REF_FALL_DB_PER_S = 4;
/** Digital silence arrives as -Infinity; it is parked here. */
const ABS_FLOOR_DB = -140;
/**
 * A frame whose loudest bin is under this is digital silence (a file's lead-in,
 * a muted input): no room, no preamp, no dither is this quiet. The first frame
 * of sound after it is compared against nothing, so every bin in it "rises" by
 * tens of dB, and a pad fading in over a second fired the snare, the bass and
 * every band on its first frame. Out of silence only `level` may fire (sound
 * began, which is true); the named sources and bands wait for a frame with a
 * real one before it. The cost is a song whose very first sound is a kick:
 * that one kick reads as `level` only.
 */
const SILENCE_DB = -130;
/**
 * A source's range has to span at least this before it reads above 0, in dB.
 * The same rule `AutoRange` applies to the mic: a band holding nothing but a
 * flat floor is 0, not a full-scale flicker of its own noise.
 */
const LEVEL_MIN_SPAN_DB = 6;
/**
 * And at most this. `AutoRange` was written for a microphone in a room, whose
 * floor is the room's hiss and never far under the music. A band of a mastered
 * song has no such floor: a fade, a break, a bar with no hats puts the band
 * 60 or 80 dB under its ceiling, the floor follows it down at once (a new quiet
 * moment is believed immediately) and only climbs back from levels near it. On
 * the shelf that left every source reading about 0.9 whenever anything played
 * at all, a light that never moved. Thirty decibels is the range a listener
 * hears as "from barely there to full": the floor is held no further than that
 * under the ceiling, and a level fed to the range is capped at that line too,
 * so a silent bar cannot drag the ceiling down faster than music would. With
 * the cap the shelf's mean values came down to about 0.5.
 *
 * The floor is clamped after each update as well as the input capped, because
 * the first value a range sees seeds it as-is: a hats region that was empty
 * (-140 dB) on the first frame of sound kept that floor for the whole track,
 * and the harness's hats then read 0.78 at full level and 0.70 at -20 dB, a
 * source that was supposed to read the same at any level (`npm run bands`,
 * "-20 dB: hats reads the same", mean difference 0.074 before, 0.008 after).
 */
const LEVEL_MAX_SPAN_DB = 30;

// ── Onsets ────────────────────────────────────────────────────────────────

/**
 * The detection function is spectral flux in decibels, per region: the mean,
 * over the region's bins, of how many dB each bin rose since the last frame
 * (falls count zero). In decibels because a rise of 20 dB is a rise of 20 dB
 * at any playback level, which is most of what makes a quiet room and a loud
 * one fire the same hits; per region because a hat and a kick in the same
 * frame are two events, not one bigger one.
 *
 * A frame is a candidate when its flux clears
 *
 *     ODF_MIN_DB + median(recent flux) + ODF_K · MAD(recent flux)
 *
 * over the last ODF_WINDOW_S seconds. The median is the region's usual
 * frame-to-frame churn (a sustained pad or a crowd makes a band's flux
 * nonzero all the time), and the median rather than the mean because the hits
 * themselves are in the window: at sixteenth-note hats, 120 bpm, a hit's two
 * or three frames of flux fill 24 of the 60 frames in a second, which moves a
 * mean a long way and a median not at all. ODF_K = 3 MADs is about two
 * standard deviations of that churn. ODF_MIN_DB = 3 is the floor under it, for
 * a region that is otherwise perfectly still: a hit has to at least double the
 * power across its whole band inside one frame.
 */
const ODF_MIN_DB = 3;
/**
 * Plus a noise allowance that shrinks with the region's size: ODF_NOISE_DB
 * over the square root of its bin count. A region's flux is a mean over its
 * bins, and noise in each bin wanders by several dB frame to frame, so a mean
 * over two bins wanders far more than a mean over two hundred. With a flat
 * threshold, 16 s of nothing but a 16-bit dither floor fired band1 (one or two
 * bins) 66 times and the kick 14 times, while the wide regions stayed silent;
 * with this term neither noise track fires anything. 6 is the smallest that
 * keeps both silent; 9 started costing real hits (the bass found 23 of its 30
 * notes, and hats at 30 fps fell under the recall line).
 */
const ODF_NOISE_DB = 6;
/**
 * And no region is narrower than two bins (see `binsFor`), because at 44.1 kHz
 * the lowest band holds exactly one, and a single bin's flux is noise that the
 * allowance above cannot divide down.
 */
const MIN_BINS = 2;
const ODF_WINDOW_S = 1;
const ODF_K = 3;
/**
 * After a hit a source cannot fire again for 70 ms, and not until its flux has
 * dropped back under the threshold. One hit's rise is spread across two or
 * three frames by the 21 ms window and the analyser's smoothing (about 50 ms),
 * and sixteenth notes at 140 bpm are 107 ms apart: 70 ms sits between the two.
 */
const REFRACTORY_S = 0.07;
/**
 * A hit has to lift its source at least this far up the source's own range.
 * Flux says something *rose*; this says it arrived somewhere. Without it a
 * band sitting on its floor fires on anything that nudges it off: on the
 * harness's snare-only track, the release of each snare read as a kick.
 */
const PRESENCE = 0.35;
/** How long a hard hit keeps setting the scale that `strength` is measured against, s. */
const STRENGTH_FALL_S = 8;

/**
 * The drums leak into each other's bands, and flux cannot see that: a hat's
 * low tail rising out of silence at 3 kHz is as large a rise in decibels as a
 * snare. What separates them is *where the new energy landed*, measured as
 * power (not dB), counting only bins that rose by more than FRESH_RISE_DB in
 * the frame (so a sustained pad's slow beating adds nothing):
 *
 *   - kick:  the new power per bin at 30–120 Hz must beat that at 150–400 Hz
 *            by KICK_TILT_DB. A kick is a sub event; a snare's body and a
 *            tom's are low-mid events. (A bass *note* in the kick's octave
 *            passes too: nothing in one spectrum frame tells an 808 from a
 *            synth bass, and the harness prints that rather than hiding it.)
 *            And the kick's region must be within LOW_UNDER_REF_DB of the
 *            loudest bin heard recently: under a pad, the smear of a snare's
 *            body into the sub bins cleared the tilt test and fired a kick
 *            52 dB under the loudest thing playing, a kick nobody could hear.
 *            The bass carries the same rule for the same reason (hats over a
 *            pad fired it through the window's leakage).
 *   - hats vs snare: the new power per bin above 7 kHz against that at
 *            1–5 kHz. A hat's spectrum climbs; a snare's or a clap's is flat
 *            or falls. At HAT_TILT_DB and above it is a hat, below a snare.
 *            The harness's synthetic snare (noise with an 8 kHz roll-off,
 *            brighter than most real ones) measures about -2 dB and its hat
 *            (three poles at 7 kHz, duller than most) about +10: the line is
 *            between them, with real instruments further out on each side.
 *
 * A hat that lands exactly on a snare is reported as the snare. The snare's
 * own top end covers it, spectrally and to the ear, and the harness counts
 * those hats apart, as masked, rather than pretending they were found.
 *
 * Why FRESH_RISE_DB is 6 and not the obvious 3 (a doubling): the frame a hit
 * first shows in is often a glimpse, a few milliseconds of it at the tapered
 * end of the window, and under a sustained pad the pad's own chords beat by
 * 3–4 dB from frame to frame. At 3 dB that beating counted as new energy in
 * the snare's band, and pad-backed hats read as the snare four times in 16 s.
 * At 6 only the hit's own bins count. (Deferring close verdicts a frame was
 * tried instead; it cost a frame of latency on every hat and fixed less.)
 */
const FRESH_RISE_DB = 6;
const KICK_TILT_DB = 6;
const LOW_UNDER_REF_DB = 30;
const HAT_TILT_DB = 4;

const KICK = SOURCE_NAMES.indexOf('kick');
const BASS = SOURCE_NAMES.indexOf('bass');
const SNARE = SOURCE_NAMES.indexOf('snare');
const HATS = SOURCE_NAMES.indexOf('hats');
/** Region index of the low mids, which follow the named sources and bands. */
const LOW_MID = SOURCE_NAMES.length;

const toDb = (power: number): number => 10 * Math.log10(power + 1e-30);

/** One source's threshold, refractory period and strength scale. */
class OnsetDetector {
  private history: number[] = [];
  private historyAt: number[] = [];
  private lastHit = -Infinity;
  private armed = true;
  private peak = 0;
  private peakAt = 0;
  at: number | null = null;

  reset(): void {
    this.history = []; this.historyAt = [];
    this.lastHit = -Infinity; this.armed = true;
    this.peak = 0; this.peakAt = 0;
    this.at = null;
  }

  /** Is this frame a candidate hit? Also records its flux in the history. */
  candidate(time: number, odf: number, first: boolean, minimum: number): boolean {
    const n = this.history.length;
    let threshold = minimum;
    if (n > 0) {
      const sorted = this.history.slice().sort((a, b) => a - b);
      const median = sorted[n >> 1];
      const dev = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
      threshold += median + ODF_K * dev[n >> 1];
    }
    this.history.push(odf); this.historyAt.push(time);
    while (time - this.historyAt[0] > ODF_WINDOW_S) { this.history.shift(); this.historyAt.shift(); }
    if (odf <= threshold) this.armed = true;
    return !first && this.armed && odf > threshold && time - this.lastHit >= REFRACTORY_S;
  }

  /** A hit: returns its strength, 0..1, against the recent hardest. */
  fire(time: number, odf: number): number {
    this.armed = false;
    this.lastHit = time;
    this.at = time;
    this.peak = Math.max(this.peak * Math.exp(-(time - this.peakAt) / STRENGTH_FALL_S), odf);
    this.peakAt = time;
    return this.peak > 0 ? odf / this.peak : 1;
  }
}

/** Bins of one region; an empty range borrows the bin nearest its centre. */
function binsFor([lo, hi]: Range, hzPerBin: number, top: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= top; k++) {
    const f = k * hzPerBin;
    if (f >= lo && f < hi) out.push(k);
  }
  // Fewer than MIN_BINS (the lowest band at 44.1 and 48 kHz holds one bin; at
  // a small fftSize it can hold none): add the bins nearest the band's centre.
  const centre = Math.sqrt(lo * hi) / hzPerBin;
  while (out.length < Math.min(MIN_BINS, top)) {
    let best = -1;
    for (let k = 1; k <= top; k++) {
      if (!out.includes(k) && (best < 0 || Math.abs(k - centre) < Math.abs(best - centre))) best = k;
    }
    out.push(best);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The analyser: spectrum frames in, readings out.
 *
 * Stateful (ranges, thresholds, the previous frame), so one instance per
 * stream: the live hook keeps one per audio context, `analysePcm` makes a
 * fresh one per song. Times are in seconds on whatever clock the caller keeps
 * consistently: `performance.now() / 1000` live, the song's own offline.
 */
export class AudioFeatures {
  private layoutKey = '';
  private regions: number[][] = [];
  private top = 1;
  private db = new Float64Array(0);
  /** Last frame's spectrum, dB, unfloored. */
  private prev = new Float64Array(0);
  private hasPrev = false;
  private ref = ABS_FLOOR_DB;
  private prevPeak = ABS_FLOOR_DB;
  private lastTime: number | null = null;
  private levelDb = new Float64Array(0);
  private odf = new Float64Array(0);
  /** New power per bin (linear) this frame, per region. */
  private fresh = new Float64Array(0);
  /** Whether each range has had its first (seeding) value; its ceiling means nothing before. */
  private readonly heard = new Uint8Array(SOURCE_NAMES.length);
  private ranges: AutoRange[] = [];
  private readonly detectors = SOURCE_NAMES.map(() => new OnsetDetector());

  reset(): void {
    this.hasPrev = false;
    this.ref = ABS_FLOOR_DB;
    this.prevPeak = ABS_FLOOR_DB;
    this.lastTime = null;
    this.fresh.fill(0);
    this.ranges.forEach(r => r.reset());
    this.heard.fill(0);
    this.detectors.forEach(d => d.reset());
  }

  private layout(sampleRate: number, fftSize: number, count: number): void {
    const key = `${sampleRate}/${fftSize}/${count}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const hz = sampleRate / fftSize;
    const top = count - 1;
    this.top = Math.max(1, Math.min(top, Math.floor(BAND_HIGH_HZ / hz)));
    this.regions = [
      ...SOUND_SOURCES.map(s => binsFor(SOURCE_RANGES[s], hz, top)),
      ...BAND_SOURCES.map((_, i) => binsFor([BAND_EDGES_HZ[i], BAND_EDGES_HZ[i + 1]], hz, top)),
      binsFor(LOW_MIDS, hz, top),
    ];
    const R = this.regions.length;
    this.ranges = SOURCE_NAMES.map(() => new AutoRange({ minSpan: LEVEL_MIN_SPAN_DB }));
    this.heard.fill(0);
    this.db = new Float64Array(count);
    this.prev = new Float64Array(count);
    this.levelDb = new Float64Array(R);
    this.odf = new Float64Array(R);
    this.fresh = new Float64Array(R);
    this.hasPrev = false;
  }

  /**
   * Is this frame's new energy the drum's own? Every other source says yes.
   */
  private owns(r: number): boolean {
    const f = (i: number) => toDb(this.fresh[i]);
    if (r === KICK) return f(KICK) - f(LOW_MID) >= KICK_TILT_DB && this.levelDb[KICK] >= this.ref - LOW_UNDER_REF_DB;
    if (r === BASS) return this.levelDb[BASS] >= this.ref - LOW_UNDER_REF_DB;
    if (r === SNARE) return f(HATS) - f(SNARE) < HAT_TILT_DB;
    if (r === HATS) return f(HATS) - f(SNARE) >= HAT_TILT_DB;
    return true;
  }

  update(frame: SpectrumFrame, time: number): AudioReading {
    const n = frame.bins.length;
    this.layout(frame.sampleRate, frame.fftSize, n);
    const db = this.db;
    const minDb = frame.minDb ?? -100, maxDb = frame.maxDb ?? -30;
    for (let k = 0; k < n; k++) {
      const v = frame.bins[k];
      // A byte of 0 means "at or under minDb", so it reads as minDb.
      const d = frame.scale === 'db' ? v
        : frame.scale === 'byte' ? minDb + (v / 255) * (maxDb - minDb)
        : v > 0 ? 20 * Math.log10(v) : -Infinity;
      db[k] = Number.isFinite(d) ? Math.max(d, ABS_FLOOR_DB) : ABS_FLOOR_DB;
    }
    const dt = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;

    let peak = ABS_FLOOR_DB;
    for (let k = 1; k <= this.top; k++) if (db[k] > peak) peak = db[k];
    this.ref = Math.max(peak, this.ref - REF_FALL_DB_PER_S * dt);
    const floor = this.ref - FLOOR_BELOW_REF_DB;

    // Both frames are floored with *this* frame's floor. Keeping last frame's
    // floored values instead made a floor on its way down read as every bin
    // under it rising, and the first sound after silence rise from -140 dB,
    // a flux ten times any real hit's that then set the scale for `strength`.
    const first = !this.hasPrev;
    // Out of digital silence only `level` may fire: see SILENCE_DB.
    const waking = first || this.prevPeak < SILENCE_DB;
    const silent = peak < SILENCE_DB;
    this.prevPeak = peak;
    for (let r = 0; r < this.regions.length; r++) {
      const bins = this.regions[r];
      let power = 0, flux = 0, fresh = 0;
      for (const k of bins) {
        const now = Math.max(db[k], floor);
        const was = Math.max(this.prev[k], floor);
        const p = Math.pow(10, now / 10);
        power += p;
        if (!first && now > was) {
          flux += now - was;
          if (now - was > FRESH_RISE_DB) fresh += p - Math.pow(10, was / 10);
        }
      }
      this.levelDb[r] = toDb(power / bins.length);
      this.odf[r] = flux / bins.length;
      this.fresh[r] = fresh / bins.length;
    }
    this.prev.set(db);
    this.hasPrev = true;

    const values: number[] = [];
    const onsets = {} as Record<SourceName, OnsetState>;
    for (let r = 0; r < SOURCE_NAMES.length; r++) {
      const range = this.ranges[r];
      // Digital silence is not a floor. A file's lead-in, fed to the range,
      // pinned every source's floor at -200 dB for the rest of the song (it
      // only rises from levels near it), and the first 240 s of a shelf track
      // then read 0.95 on every source, all the time.
      if (!silent) {
        range.update(this.heard[r] ? Math.max(this.levelDb[r], range.ceiling - LEVEL_MAX_SPAN_DB) : this.levelDb[r], dt);
        if (range.floor < range.ceiling - LEVEL_MAX_SPAN_DB) range.floor = range.ceiling - LEVEL_MAX_SPAN_DB;
        this.heard[r] = 1;
      }
      const value = range.normalize(this.levelDb[r]);
      values.push(value);

      const det = this.detectors[r];
      const odf = this.odf[r];
      let hit = false, strength = 0;
      if (det.candidate(time, odf, r === 0 ? first : waking, ODF_MIN_DB + ODF_NOISE_DB / Math.sqrt(this.regions[r].length)) && value >= PRESENCE && this.owns(r)) {
        hit = true;
        strength = det.fire(time, odf);
      }
      // A candidate the drum does not own leaves it armed: the next frame may
      // be the same hit seen properly (a kick landing with a snare can read as
      // the snare's body in its first sliver, and as a kick a frame later).
      onsets[SOURCE_NAMES[r]] = { hit, strength, at: det.at };
    }

    return {
      time,
      level: values[0], kick: values[1], bass: values[2], snare: values[3], hats: values[4],
      bands: values.slice(SOUND_SOURCES.length),
      onsets,
    };
  }
}

// ── Offline ───────────────────────────────────────────────────────────────

/**
 * The Web Audio AnalyserNode, in arithmetic, so a song file can be heard the
 * way the show hears the room.
 *
 * The spec's frequency-domain steps: the most recent fftSize samples, a
 * Blackman window (alpha 0.16, over N rather than N-1, as the spec writes
 * it), an FFT, magnitudes scaled by 1/N, smoothed against the previous
 * frame's by the time constant, then 20·log10. That is what
 * `getFloatFrequencyData` returns, and so what the live path passes in.
 *
 * `dtSec` is the time since the previous frame: live, the smoothing constant
 * is applied once per ANALYSER_RATE_HZ tick, so offline it is raised to the
 * number of ticks the frame spans, and a 30 fps render smooths over the same
 * 33 ms that two live frames would.
 */
export class AnalyserEmulator {
  readonly fftSize: number;
  readonly sampleRate: number;
  private readonly smoothing: number;
  private readonly window: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly smoothed: Float64Array;
  private readonly out: Float32Array;

  constructor(sampleRate: number, fftSize = ANALYSER_FFT_SIZE, smoothing = ANALYSER_SMOOTHING) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.smoothing = smoothing;
    this.window = new Float32Array(fftSize);
    const a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;
    for (let i = 0; i < fftSize; i++) {
      const x = i / fftSize;
      this.window[i] = a0 - a1 * Math.cos(2 * Math.PI * x) + a2 * Math.cos(4 * Math.PI * x);
    }
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.smoothed = new Float64Array(fftSize / 2);
    this.out = new Float32Array(fftSize / 2);
  }

  /**
   * The spectrum of the fftSize samples ending just before sample `end`
   * (samples before 0 are silence), in dB. The returned array is reused by
   * the next call.
   */
  frame(pcm: Float32Array, end: number, dtSec: number): Float32Array {
    const N = this.fftSize;
    const start = end - N;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      this.re[i] = (s >= 0 && s < pcm.length ? pcm[s] : 0) * this.window[i];
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    const tau = Math.pow(this.smoothing, Math.max(0, dtSec) * ANALYSER_RATE_HZ);
    for (let k = 0; k < N / 2; k++) {
      const m = Math.hypot(this.re[k], this.im[k]) / N;
      this.smoothed[k] = tau * this.smoothed[k] + (1 - tau) * m;
      this.out[k] = this.smoothed[k] > 0 ? 20 * Math.log10(this.smoothed[k]) : -Infinity;
    }
    return this.out;
  }
}

/**
 * A song's readings, one per video frame, from its mono samples.
 *
 * Frame i is at time i / fps and hears the analyser window that ends there,
 * exactly as the live show would at that moment: a hit at time t shows up on
 * the first frame after t, or the one after that when the first caught only a
 * sliver of it. As many frames as it takes to cover the audio,
 * ceil(duration · fps).
 *
 * Deterministic: the same samples, rate and fps give the same readings, to
 * the bit, on every run (`npm run bands` compares two).
 */
export function analysePcm(pcm: Float32Array, sampleRate: number, fps: number): AudioReading[] {
  const analyser = new AnalyserEmulator(sampleRate);
  const features = new AudioFeatures();
  const frames = Math.ceil((pcm.length * fps) / sampleRate);
  const readings: AudioReading[] = [];
  for (let i = 0; i < frames; i++) {
    const end = Math.round((i * sampleRate) / fps);
    const bins = analyser.frame(pcm, end, 1 / fps);
    readings.push(features.update({ bins, scale: 'db', sampleRate, fftSize: analyser.fftSize }, i / fps));
  }
  return readings;
}
