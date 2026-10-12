/**
 * The twelve notes of the octave, heard in a spectrum: how much of what is
 * sounding is an A, how much a B flat, and so on round to G sharp, whatever
 * octave each is played in.
 *
 * PLAN.md 28g. A song map read by the clock fits only the recording it was
 * made from; a band playing the same song live plays it slower or faster, on
 * other instruments, in another mix, and a solo runs as long as it runs. What
 * survives all of that is the harmony: the chords of the verse are the chords
 * of the verse whoever plays them. So the follower (`songFollow.ts`) matches
 * the map and the room by this profile, frame by frame, and not by anything
 * the sound's colour decides (its brightness, its drums, its loudness).
 *
 * The same function makes both sides of the match. The live ear computes it
 * from the analyser's bins every frame (`audioFeatures.ts`), and the map is
 * made by running the analyser's own arithmetic over the recorded listen
 * (`songFollow.ts` `mapChroma`), at the sample rate and FFT size that give
 * bins of the same width as the room's. A profile made at a finer resolution
 * than the one it is compared with is systematically sharper, and a match of
 * a sharp profile against a blurred one costs the difference on every frame.
 *
 * Why the bins are spread and weighted as they are. The show's analyser has
 * 1024 points: at 44.1 kHz a bin is 43 Hz wide, which is three semitones at
 * 220 Hz and a sixth of one at 4 kHz. A bin wider than about two semitones
 * cannot say which note it holds, so the profile starts where a bin is two
 * semitones wide (about 370 Hz there) and runs to 4 kHz: the second to
 * fourth harmonics of a pad's chord, the guitar's and piano's body, the
 * voice; not the bass's fundamental, which the kick shares. Each bin is
 * shared between the notes either side of its centre (a triangle a semitone
 * wide, or half the bin's own width where that is wider), and weighted by its
 * width in semitones, so that every octave counts the same: unweighted, the
 * octave from 2 to 4 kHz has eight times the bins of the one from 250 to 500
 * and would decide the profile alone. The level is in decibels above a floor
 * CHROMA_RANGE_DB under the frame's loudest bin: a log compression, as the
 * literature's chroma features use (Müller's CLP chroma), so a loud note
 * does not drown a quiet one of the same chord, and a mix that turns the
 * guitar up does not change which chord it is.
 */

/** Below this the bins are too wide to tell a note from its neighbours (at the analyser's own size; see above). */
export const CHROMA_MAX_SEMITONES_PER_BIN = 2;
/** The time over which each bin's median is taken, to keep the notes and lose the drums (see `ChromaEar`). */
export const CHROMA_MEDIAN_SEC = 0.25;
/** The top of the profile: above it, harmonics and drums, not notes. */
export const CHROMA_HIGH_HZ = 4000;
/** Bins this far under the frame's loudest count nothing. */
export const CHROMA_RANGE_DB = 50;
/** A frame whose loudest bin in the range is under this is silence: an all-zero profile. */
export const CHROMA_SILENCE_DB = -90;

/** The bins the profile reads, for bins `hzPerBin` wide, `count` of them (see the header). */
export function chromaRange(hzPerBin: number, count: number): { first: number; last: number } {
  const key = `${hzPerBin}/${count}`;
  const cached = ranges.get(key);
  if (cached) return cached;
  // A bin k spans k ± 1/2; its width in semitones is 12·log2((k+½)/(k-½)).
  const width = (k: number) => 12 * Math.log2((k + 0.5) / (k - 0.5));
  let first = 2;
  while (first < count - 1 && width(first) > CHROMA_MAX_SEMITONES_PER_BIN) first++;
  const range = { first, last: Math.max(first, Math.min(count - 2, Math.floor(CHROMA_HIGH_HZ / hzPerBin))) };
  ranges.set(key, range);
  return range;
}
const ranges = new Map<string, { first: number; last: number }>();

/**
 * The profile of one spectrum in dBFS (`db`, bins `hzPerBin` wide), written
 * into `out` (twelve values, C first) and summed to 1; all zero for silence.
 *
 * Notes are read as peaks: a bin louder than both its neighbours, its
 * frequency refined by the parabola through the three (the standard
 * quadratic interpolation of a windowed sinusoid's peak, good to a tenth of
 * a bin), and its level in decibels over the floor shared between the two
 * notes either side of that frequency. Measured, on a pad's A minor in the
 * intro of `npm run songfollow`'s song: a bin's centre taken as its note
 * read the A at 440 Hz (bin 10.2 at 43 Hz) as G sharp and A by halves and
 * the profile's A at 0.04 of the frame; the refined peak is where the note
 * is. And the skirt of a louder note below the range (the window's leakage
 * from a 200 Hz fundamental into the 390 Hz bin) falls away monotonically,
 * so it is no peak: integrated instead of peak-picked, that skirt was G, A
 * and B flat in every frame of the song, and every frame correlated 0.99
 * with every other.
 */
export function chromaFromDb(db: ArrayLike<number>, hzPerBin: number, out: number[] | Float64Array): void {
  const { first, last } = chromaRange(hzPerBin, db.length);
  for (let i = 0; i < 12; i++) out[i] = 0;
  let peak = -Infinity;
  for (let k = first; k <= last; k++) if (db[k] > peak) peak = db[k];
  if (!(peak >= CHROMA_SILENCE_DB)) return;
  const floor = peak - CHROMA_RANGE_DB;
  let total = 0;
  for (let k = first; k <= last; k++) {
    const a = db[k - 1], b = db[k], c = db[k + 1];
    if (!(b >= a && b >= c)) continue;
    const v = b - floor;
    if (v <= 0) continue;
    const den = a - 2 * b + c;
    const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const m = 69 + 12 * Math.log2(((k + d) * hzPerBin) / 440);
    const lo = Math.floor(m), fr = m - lo;
    out[((lo % 12) + 12) % 12] += v * (1 - fr);
    out[(((lo + 1) % 12) + 12) % 12] += v * fr;
    total += v;
  }
  if (total > 0) for (let i = 0; i < 12; i++) out[i] /= total;
}

/**
 * The profile as the show hears it, frame by frame: each bin's median over
 * the last CHROMA_MEDIAN_SEC, then `chromaFromDb`.
 *
 * Why the median. A note is held; a drum is a hit. The median of a bin over
 * a quarter second keeps what sounds through most of that quarter second
 * and drops what sounds through less than half of it, which is Fitzgerald's
 * median-filtering separation of the harmonic from the percussive (2010),
 * done along time only. Without it the snare's and the hats' noise, peaks
 * everywhere in the range, were most of a groove's profile: two copies of
 * the same chorus in one recording correlated about 0.7 frame by frame.
 *
 * The live ear (`audioFeatures.ts`) and the map (`songFollow.ts`
 * `mapChroma`) each hold one, fed every frame, so both sides of the match
 * are made by the same arithmetic.
 */
export class ChromaEar {
  private ring: Float64Array[] = [];
  private times: number[] = [];
  private pos = 0;
  private key = '';
  private med = new Float64Array(0);
  private readonly col = new Float64Array(32);
  private readonly live = new Int32Array(32);

  reset(): void { this.ring = []; this.times = []; this.pos = 0; this.key = ''; }

  /** One frame of bins in dBFS, at `time` seconds; writes the profile into `out`. */
  push(db: ArrayLike<number>, hzPerBin: number, time: number, out: number[] | Float64Array): void {
    const n = db.length;
    const key = `${hzPerBin}/${n}`;
    // Enough slots for a quarter second at 120 fps; frames older than the
    // window are skipped by their time, so 30 fps takes the median of 8.
    if (key !== this.key) {
      this.key = key;
      this.ring = Array.from({ length: 32 }, () => new Float64Array(n));
      this.times = new Array(32).fill(-Infinity);
      this.pos = 0;
      this.med = new Float64Array(n).fill(-Infinity);
    }
    const { first, last } = chromaRange(hzPerBin, n);
    const slot = this.ring[this.pos];
    for (let k = first - 1; k <= last + 1; k++) slot[k] = db[k];
    this.times[this.pos] = time;
    this.pos = (this.pos + 1) % this.ring.length;
    // Which slots are in the window, once a frame; then each bin's median by
    // insertion into a sorted run (at most 32 values; a comparator sort per
    // bin added 49 µs to the ear's frame, measured in node over 1800
    // frames; this adds 5, on 237).
    const live = this.live;
    let m = 0;
    for (let j = 0; j < this.ring.length; j++) if (time >= this.times[j] && time - this.times[j] < CHROMA_MEDIAN_SEC - 1e-9) live[m++] = j;
    const col = this.col;
    for (let k = first - 1; k <= last + 1; k++) {
      for (let a = 0; a < m; a++) {
        const v = this.ring[live[a]][k];
        let b = a;
        while (b > 0 && col[b - 1] > v) { col[b] = col[b - 1]; b--; }
        col[b] = v;
      }
      const h = m >> 1;
      this.med[k] = m % 2 ? col[h] : 0.5 * (col[h - 1] + col[h]);
    }
    chromaFromDb(this.med, hzPerBin, out);
  }
}

/**
 * A profile with its mean taken out and scaled to length 1, so that the dot
 * product of two is their correlation: 1 for the same chord, about 0 for
 * unrelated ones, negative for chords with no note in common. Taking the
 * mean out is what makes the drums not matter: a snare or a hat lifts every
 * note about equally, which moves the mean and not the shape. Returns false
 * (and zeros) for a flat or silent profile, which says nothing about harmony.
 */
export function centreChroma(v: ArrayLike<number>, out: number[] | Float64Array): boolean {
  let m = 0;
  for (let i = 0; i < 12; i++) m += v[i];
  m /= 12;
  let n = 0;
  for (let i = 0; i < 12; i++) { out[i] = v[i] - m; n += out[i] * out[i]; }
  n = Math.sqrt(n);
  if (!(m > 0) || !(n > 1e-3 * m * 12)) { for (let i = 0; i < 12; i++) out[i] = 0; return false; }
  for (let i = 0; i < 12; i++) out[i] /= n;
  return true;
}
