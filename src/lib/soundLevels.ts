/**
 * The show's first ear, as arithmetic: volume, bass, mid, treble, energy,
 * brightness and complexity, from one analyser frame.
 *
 * These are the numbers the plate has always been played by (sound drive, the
 * beat clock's kick, the sound mappings, the tempo pace), and until a song
 * could be rendered they only existed inside `useAudioAnalyzer`'s animation
 * frame, reading a live AnalyserNode. A render (PLAN.md §6) has to hand the
 * plate the *same* numbers from the song file, or the film reacts to a
 * different song from the one the show hears: a bass that reads 60 live and
 * 45 offline is a beat clock that locks live and never locks in the render.
 *
 * So the arithmetic moved here, unchanged, and both paths call it:
 *
 *   - live, the hook reads the node's float spectrum, its byte spectrum and
 *     its byte waveform, exactly as before, and hands them over;
 *   - offline, `songAudioTrack` (lib/songTrack.ts) builds the same three
 *     arrays from the song's samples with the analyser's own conversions
 *     (the Web Audio spec's, written out below) and hands them over.
 *
 * Nothing in here reads a clock, the DOM or a random number, so it runs in
 * node, where `npm run render` checks that the offline track is the same
 * bytes twice and that 30 and 60 fps agree about when things happen.
 *
 * The order matters and is the hook's: the float spectrum is read first and
 * fits the room (which moves the byte window), and only then are the bytes
 * read, through the window the room just set. The class keeps that order by
 * having two steps, `calibrate` and `levels`, and the room's gate from the
 * first is what the second multiplies by.
 */
import { AutoRange, RoomTracker, type RoomCalibration } from './audioCalibration.ts';

/** The trims a person sets on the Sound panel; read every frame, never baked in. */
export interface LevelParams {
  sensitivity: number;
  bassBoost: number;
  autoCalibrate: boolean;
}

/** One frame's readings before the per-feature smoothing. */
export interface RawLevels {
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  spectralCentroid: number;
  timbre: number;
  complexity: number;
  calibration: RoomCalibration | null;
}

/**
 * Per-feature smoothing factors, per analyser frame at the live rate.
 * Lower = smoother / more latent.  Higher = snappier / more jittery.
 * Bass needs to be snappy for kick detection; treble can be smoother.
 */
export const LEVEL_SMOOTHING = {
  volume:     0.25,
  bass:       0.35,   // fast — kicks need instant response
  mid:        0.20,
  treble:     0.15,
  energy:     0.30,
  centroid:   0.12,
  timbre:     0.12,
  complexity: 0.10,
} as const;

/**
 * Trim applied on top of auto-calibrated levels. The sensitivity slider runs
 * 0.1..3.0 and defaults to 0.4, so this maps that default onto unity gain:
 * calibration does the work of finding the room, and the slider stays a trim
 * either side of it rather than a control the listener has to get right.
 */
export const calibratedTrim = (sensitivity: number) => 0.5 + sensitivity * 1.25;

/**
 * The room tracker and the per-feature ranges for one audio stream: the live
 * hook keeps one per audio context, a render makes a fresh one per song.
 */
export class SoundLevels {
  private readonly room = new RoomTracker();
  private readonly ranges = {
    volume: new AutoRange({ minSpan: 3 }),
    bass:   new AutoRange({ minSpan: 4, ceilFall: 8 }),   // fast, for kicks
    mid:    new AutoRange({ minSpan: 3 }),
    treble: new AutoRange({ minSpan: 2.5 }),
    energy: new AutoRange({ minSpan: 0.02 }),
    timbre: new AutoRange({ minSpan: 4, floorRise: 40, ceilFall: 25 }),
  };
  private calibration: RoomCalibration | null = null;
  private readonly bassEnd: number;
  private readonly midEnd: number;

  readonly binCount: number;

  constructor(sampleRate: number, binCount: number) {
    this.binCount = binCount;
    // Pre-compute frequency-bin boundaries based on actual Hz thresholds.
    // sampleRate is typically 44100 or 48000.
    const nyquist = sampleRate / 2;
    const hzPerBin = nyquist / binCount;
    // Perceptually meaningful ranges:
    //   Sub-bass + bass : 20–250 Hz
    //   Mid             : 250–4 000 Hz
    //   Treble          : 4 000–nyquist
    this.bassEnd = Math.min(binCount, Math.ceil(250 / hzPerBin));
    this.midEnd = Math.min(binCount, Math.ceil(4000 / hzPerBin));
  }

  /**
   * Fit the analyser's window to the room, from this frame's float spectrum
   * (dB). Returns the window the byte spectrum is to be read through: the
   * room's when calibrating, the AnalyserNode's defaults when not. Do this
   * before reading the byte data so the spectrum this frame is already
   * scaled to the space the app is listening in.
   */
  calibrate(floatDb: ArrayLike<number>, dt: number, autoCalibrate: boolean): { minDb: number; maxDb: number } {
    if (!autoCalibrate) {
      this.calibration = null;
      return { minDb: -100, maxDb: -30 };
    }
    let peakDb = -Infinity;
    for (let i = 0; i < this.binCount; i++) if (floatDb[i] > peakDb) peakDb = floatDb[i];
    this.calibration = this.room.update(peakDb, dt);
    return { minDb: this.room.minDb, maxDb: this.room.maxDb };
  }

  /** This frame's levels, from the byte spectrum and byte waveform read through `calibrate`'s window. */
  levels(frequencyData: ArrayLike<number>, timeDomainData: ArrayLike<number>, dt: number, p: LevelParams): RawLevels {
    const { binCount, bassEnd, midEnd, ranges } = this;
    const sens = p.sensitivity, bBoost = p.bassBoost, autoCal = p.autoCalibrate;
    const calibration = this.calibration;

    // ── Raw band levels ───────────────────────────────────────
    let sum = 0;
    for (let i = 0; i < binCount; i++) sum += frequencyData[i];
    const rawVolume = (sum / binCount / 255) * 100;

    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += frequencyData[i];
    const rawBass = (bassSum / bassEnd / 255) * 100;

    let midSum = 0;
    const midBins = midEnd - bassEnd;
    for (let i = bassEnd; i < midEnd; i++) midSum += frequencyData[i];
    const rawMid = (midSum / midBins / 255) * 100;

    let trebleSum = 0;
    const trebleBins = binCount - midEnd;
    for (let i = midEnd; i < binCount; i++) trebleSum += frequencyData[i];
    const rawTreble = (trebleSum / trebleBins / 255) * 100;

    // ── Energy (RMS of waveform) ──────────────────────────────
    let energySum = 0;
    for (let i = 0; i < binCount; i++) {
      const n = (timeDomainData[i] - 128) / 128;
      energySum += n * n;
    }
    const rawEnergy = Math.sqrt(energySum / binCount);

    // ── Map each band onto its own learned range ──────────────
    // A band is reported as where it sits between its quietest and its
    // loudest in *this* room, so a distant mic and a mic on the speaker
    // both drive the visuals across their whole travel. The ceiling maps
    // to 85 rather than 100, leaving headroom for a genuine peak.
    let volume: number, bass: number, mid: number, treble: number, energy: number;
    if (autoCal) {
      const trim = calibratedTrim(sens);
      const gate = calibration?.gate ?? 0;
      ranges.volume.update(rawVolume, dt);
      ranges.bass.update(rawBass, dt);
      ranges.mid.update(rawMid, dt);
      ranges.treble.update(rawTreble, dt);
      ranges.energy.update(rawEnergy, dt);
      volume = ranges.volume.normalize(rawVolume) * 85 * trim * gate;
      bass   = ranges.bass.normalize(rawBass) * 85 * trim * bBoost * gate;
      mid    = ranges.mid.normalize(rawMid) * 85 * trim * gate;
      treble = ranges.treble.normalize(rawTreble) * 85 * trim * gate;
      energy = ranges.energy.normalize(rawEnergy) * 0.85 * trim * gate;
    } else {
      volume = rawVolume * sens;
      bass   = rawBass * sens * bBoost;
      mid    = rawMid * sens;
      treble = rawTreble * sens;
      energy = rawEnergy;
    }

    // ── Spectral centroid (brightness) ────────────────────────
    // Weight by magnitude² for better perceptual accuracy.
    let specNum = 0;
    let specDen = 0;
    for (let i = 0; i < binCount; i++) {
      const mag2 = frequencyData[i] * frequencyData[i];
      specNum += mag2 * i;
      specDen += mag2;
    }
    const spectralCentroid = specDen === 0 ? 0 : specNum / specDen;
    const rawTimbre = (spectralCentroid / binCount) * 100;
    let timbre: number;
    if (autoCal) {
      // Brightness lives in a narrow band for any given source; stretching
      // it over its own observed range is what makes timbre mappings read.
      ranges.timbre.update(rawTimbre, dt);
      timbre = ranges.timbre.normalize(rawTimbre) * 85 * calibratedTrim(sens);
    } else {
      timbre = rawTimbre * sens;
    }

    // ── Complexity (zero-crossing rate) ───────────────────────
    let zeroCrossings = 0;
    for (let i = 1; i < binCount; i++) {
      const prev = timeDomainData[i - 1] - 128;
      const curr = timeDomainData[i] - 128;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) zeroCrossings++;
    }
    // Read on a scale of a hundred like every other feature, but the rate
    // itself is a few percent: twice the dominant frequency over the sample
    // rate, 2% for a 500 Hz line and about 10% for hi-hats, snares and
    // distortion. Taken raw, every mapping to it moved about two percent of
    // its travel, and eight of the looks' sound mappings (Boiling Point's
    // pour and Acid Trip's colour among them) did nothing at all. So about
    // seven percent is the top, where the band's median reads a quarter of
    // the travel, near the other features. It is not ranged against the
    // room like the levels: it is a property of the sound rather than of
    // how loud it is here, and a range learned from it rides its transients
    // and reads nearly zero between them.
    const zcr = (zeroCrossings / (binCount - 1)) * 100;
    const complexity = Math.min(100, zcr * 15) * (autoCal ? calibratedTrim(sens) : sens);

    return { volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity, calibration };
  }
}

/** The smoothed fields, as `AudioData` carries them. */
export type SmoothedLevels = Omit<RawLevels, 'calibration'>;

/**
 * The per-feature exponential smoothing, one frame's worth.
 *
 * `frames` is how many live frames this one stands for: 1 live (the hook
 * smooths once per animation frame, and has since the start), and 60/fps in
 * a render, so a render at 30 fps smooths over the same stretch of *time* as
 * the show does at 60 rather than over the same number of frames, which
 * would make its bass twice as slow to rise. At `frames = 1` the factor is
 * exactly the constant above, so the live path is the arithmetic it was.
 */
export function smoothLevels(prev: SmoothedLevels | null, next: SmoothedLevels, frames = 1): SmoothedLevels {
  if (!prev) {
    const { volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity } = next;
    return { volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity };
  }
  const k = (c: number) => (frames === 1 ? c : 1 - Math.pow(1 - c, frames));
  const S = LEVEL_SMOOTHING;
  return {
    volume:          prev.volume          + (next.volume          - prev.volume)          * k(S.volume),
    bass:            prev.bass            + (next.bass            - prev.bass)            * k(S.bass),
    mid:             prev.mid             + (next.mid             - prev.mid)             * k(S.mid),
    treble:          prev.treble          + (next.treble          - prev.treble)          * k(S.treble),
    energy:          prev.energy          + (next.energy          - prev.energy)          * k(S.energy),
    spectralCentroid:prev.spectralCentroid+ (next.spectralCentroid- prev.spectralCentroid)* k(S.centroid),
    timbre:          prev.timbre          + (next.timbre          - prev.timbre)          * k(S.timbre),
    complexity:      prev.complexity      + (next.complexity      - prev.complexity)      * k(S.complexity),
  };
}

/**
 * The AnalyserNode's `getByteFrequencyData`, from its float spectrum: the Web
 * Audio spec's `floor(255 / (max - min) * (dB - min))`, clamped to a byte. A
 * bin at -Infinity (true silence) is 0, as the node gives it.
 */
export function bytesFromDb(db: ArrayLike<number>, minDb: number, maxDb: number, out: Uint8Array): Uint8Array {
  const k = 255 / (maxDb - minDb);
  for (let i = 0; i < out.length; i++) {
    const v = db[i];
    const b = Number.isFinite(v) ? Math.floor(k * (v - minDb)) : (v > 0 ? 255 : 0);
    out[i] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return out;
}

/**
 * The AnalyserNode's `getByteTimeDomainData` into an array of `out.length`,
 * for the fftSize samples ending just before `end`: the spec's
 * `floor(128 · (1 + x))` clamped to a byte. The node copies the most recent
 * fftSize samples from the front and drops what does not fit, so an array of
 * half the fftSize (which is what the hook passes, `frequencyBinCount`) gets
 * the *older* half of the window. Kept that way, rather than tidied into the
 * newest samples, because it is what the show has always measured energy and
 * complexity from.
 */
export function waveBytes(pcm: Float32Array, end: number, fftSize: number, out: Uint8Array): Uint8Array {
  const start = end - fftSize;
  for (let i = 0; i < out.length; i++) {
    const s = start + i;
    const x = s >= 0 && s < pcm.length ? pcm[s] : 0;
    const b = Math.floor(128 * (1 + x));
    out[i] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return out;
}
