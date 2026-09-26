// Local Shazam-style audio fingerprinting.
//
// A track's first-listen recording is reduced to a constellation of spectral
// peaks; anchor→target peak pairs become 24-bit hashes stored per track.
// Live audio snippets are hashed the same way and matched by voting on the
// time-offset histogram — a strong aligned cluster identifies both the track
// and the playback position, with no API round-trip.
//
// Reference and query both come from the same capture chain (the user's mic
// or system audio), which makes matching robust to that channel's coloring.

// With its extension, because `npm run music` runs this file directly under
// node's strip-types loader, which resolves a path exactly as written and does
// not try `.ts` on a bare one the way vite and esbuild do.
import { fft } from './fft.ts';

export const FP_RATE = 11025;   // fingerprint sample rate
const FP_FRAME = 1024;          // FFT size → bins span 0–5512 Hz
const FP_HOP = 512;             // ~46 ms per frame
export const FP_HOP_SEC = FP_HOP / FP_RATE;

// Frequency bands (FFT bin ranges) — one candidate peak per band per frame
const BANDS: [number, number][] = [[1, 10], [10, 20], [20, 40], [40, 80], [80, 160], [160, 512]];
const PAIR_MIN_DT = 2;    // frames
const PAIR_MAX_DT = 63;   // frames (~2.9 s) — also the dt field's bit budget
const PAIR_FANOUT = 6;    // targets per anchor

export interface TrackFingerprint {
  isrc: string;
  title?: string;
  artist?: string;
  hashes: Uint32Array;    // packed (f1<<15 | f2<<6 | dt)
  frames: Uint32Array;    // anchor frame index per hash
  durationSec: number;
  createdAt: number;
}

export interface FingerprintMatch {
  isrc: string;
  title?: string;
  artist?: string;
  /** Estimated playback position (seconds into the track) at the END of the snippet. */
  offsetSec: number;
  score: number;
  /** Share of all the snippet's votes that landed in the winning alignment. */
  concentration: number;
  /** How many hashes the snippet produced, for judging the score against. */
  queryHashes: number;
  /** The winning track's own 90th-percentile alignment — the noise the winner must beat. */
  background: number;
  /** Winning votes per hash the snippet offered. */
  perHash: number;
}

const hann = new Float32Array(FP_FRAME);
for (let i = 0; i < FP_FRAME; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FP_FRAME - 1)));

/** Linear resample to the fingerprint rate. */
function resample(pcm: Float32Array, fromRate: number): Float32Array {
  if (fromRate === FP_RATE) return pcm;
  const ratio = fromRate / FP_RATE;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    out[i] = pcm[i0] * (1 - frac) + (pcm[i0 + 1] ?? pcm[i0]) * frac;
  }
  return out;
}

interface Peak { frame: number; bin: number }

/** Extract the peak constellation and pair-hash it. */
export function extractPeakHashes(pcm: Float32Array, sampleRate: number): { hashes: Uint32Array; frames: Uint32Array; durationSec: number } {
  const audio = resample(pcm, sampleRate);
  const frameCount = Math.max(0, Math.floor((audio.length - FP_FRAME) / FP_HOP));
  const re = new Float32Array(FP_FRAME);
  const im = new Float32Array(FP_FRAME);
  const peaks: Peak[] = [];

  for (let f = 0; f < frameCount; f++) {
    const off = f * FP_HOP;
    for (let i = 0; i < FP_FRAME; i++) { re[i] = audio[off + i] * hann[i]; im[i] = 0; }
    fft(re, im);

    // One peak per band, kept only if it stands out from the band's mean
    for (const [lo, hi] of BANDS) {
      let maxMag = 0, maxBin = -1, sum = 0;
      for (let b = lo; b < hi; b++) {
        const mag = re[b] * re[b] + im[b] * im[b];
        sum += mag;
        if (mag > maxMag) { maxMag = mag; maxBin = b; }
      }
      const mean = sum / (hi - lo);
      if (maxBin > 0 && maxMag > mean * 4 && maxMag > 1e-7) {
        peaks.push({ frame: f, bin: maxBin });
      }
    }
  }

  // Pair anchors with nearby future peaks
  const hashes: number[] = [];
  const frames: number[] = [];
  for (let a = 0; a < peaks.length; a++) {
    const anchor = peaks[a];
    let fanned = 0;
    for (let t = a + 1; t < peaks.length && fanned < PAIR_FANOUT; t++) {
      const target = peaks[t];
      const dt = target.frame - anchor.frame;
      if (dt < PAIR_MIN_DT) continue;
      if (dt > PAIR_MAX_DT) break;
      hashes.push(((anchor.bin & 511) << 15) | ((target.bin & 511) << 6) | (dt & 63));
      frames.push(anchor.frame);
      fanned++;
    }
  }

  return {
    hashes: Uint32Array.from(hashes),
    frames: Uint32Array.from(frames),
    durationSec: audio.length / FP_RATE,
  };
}

// ── In-memory inverted index over all stored track fingerprints ────────
//
// Every hash of every song ever mapped lives here, for the whole session, and
// the library only grows. It used to be a Map from hash to a plain array of
// packed numbers — a Map entry and a JS array (header, spare capacity, a
// double per entry once the packing passed the small-integer range) for each
// distinct hash — built on the main thread, and built again, from scratch,
// after every newly mapped song. Both the memory and the stall grew with the
// library, across sessions.
//
// Now it is a handful of segments, each a sorted run of hashes over flat typed
// arrays (compressed-sparse-row: key k's entries are starts[k]..starts[k+1]),
// eight bytes an entry and eight a distinct hash, and nothing for the
// collector to walk. A new
// song is one small segment of its own; segments of like size merge pairwise,
// the way a binary counter carries, so a lookup binary-searches a few
// segments (log of the library, not its size) and each entry is re-merged
// only a logarithmic number of times over its life. The first build, which
// is the big one, runs in a worker (see fingerprintIndexBuild.ts).

export interface IndexSegment {
  /** Distinct hashes, ascending. */
  keys: Uint32Array;
  /** keys.length + 1 offsets into track/frame. */
  starts: Uint32Array;
  /** Per entry: index into FingerprintIndex.tracks. */
  track: Uint32Array;
  /** Per entry: the anchor frame in that track. */
  frame: Uint32Array;
}

export interface FingerprintIndex {
  trackCount: number;
  tracks: { isrc: string; title?: string; artist?: string }[];
  /** Oldest (largest) first. Structured-cloneable, so a worker can hand one over. */
  segments: IndexSegment[];
}

// Hashes are 24 bits (9 + 9 + 6); an entry's position rides below them in one
// double for a native numeric sort, exact while the two together stay under
// 2^53 — 2^28 entries, some twenty thousand songs, in one segment.
const HASH_SPAN = 2 ** 28;

function buildSegment(records: TrackFingerprint[], firstTrack: number): IndexSegment {
  let total = 0;
  for (const r of records) total += r.hashes.length;
  const order = new Float64Array(total);
  const track = new Uint32Array(total);
  const frame = new Uint32Array(total);
  let n = 0;
  records.forEach((rec, i) => {
    for (let j = 0; j < rec.hashes.length; j++, n++) {
      order[n] = rec.hashes[j] * HASH_SPAN + n;
      track[n] = firstTrack + i;
      frame[n] = rec.frames[j];
    }
  });
  // Ascending by hash, and within one hash by position — so a hash's entries
  // keep the order they were added in.
  order.sort();

  const sortedTrack = new Uint32Array(total);
  const sortedFrame = new Uint32Array(total);
  let distinct = 0;
  let prev = -1;
  for (let i = 0; i < total; i++) {
    const h = Math.floor(order[i] / HASH_SPAN);
    if (h !== prev) { distinct++; prev = h; }
  }
  const keys = new Uint32Array(distinct);
  const starts = new Uint32Array(distinct + 1);
  prev = -1;
  let k = -1;
  for (let i = 0; i < total; i++) {
    const h = Math.floor(order[i] / HASH_SPAN);
    const from = order[i] - h * HASH_SPAN;
    if (h !== prev) { keys[++k] = h; starts[k] = i; prev = h; }
    sortedTrack[i] = track[from];
    sortedFrame[i] = frame[from];
  }
  starts[distinct] = total;
  return { keys, starts, track: sortedTrack, frame: sortedFrame };
}

/** Merge two segments in one linear pass; for a shared hash, a's entries come first. */
function mergeSegments(a: IndexSegment, b: IndexSegment): IndexSegment {
  const total = a.track.length + b.track.length;
  const track = new Uint32Array(total);
  const frame = new Uint32Array(total);
  const keys = new Uint32Array(a.keys.length + b.keys.length);
  const starts = new Uint32Array(keys.length + 1);
  let i = 0, j = 0, n = 0, k = 0;
  const copy = (s: IndexSegment, k: number) => {
    for (let e = s.starts[k]; e < s.starts[k + 1]; e++, n++) { track[n] = s.track[e]; frame[n] = s.frame[e]; }
  };
  while (i < a.keys.length || j < b.keys.length) {
    const ka = i < a.keys.length ? a.keys[i] : Infinity;
    const kb = j < b.keys.length ? b.keys[j] : Infinity;
    const key = Math.min(ka, kb);
    keys[k] = key;
    starts[k++] = n;
    if (ka === key) copy(a, i++);
    if (kb === key) copy(b, j++);
  }
  starts[k] = n;
  // Shared hashes leave the key arrays a little long; trim them to fit.
  return { keys: keys.slice(0, k), starts: starts.slice(0, k + 1), track, frame };
}

/** Build the whole index at once — the first load. */
export function buildIndex(records: TrackFingerprint[]): FingerprintIndex {
  const tracks = records.map(r => ({ isrc: r.isrc, title: r.title, artist: r.artist }));
  const segments = records.length ? [buildSegment(records, 0)] : [];
  return { trackCount: records.length, tracks, segments };
}

/**
 * Add one newly stored fingerprint to the index, in place, without touching
 * the rest. Returns false if that track is already indexed — a re-mapped song
 * whose stored fingerprint was just replaced — which the caller settles with
 * a full build, since its old entries are in there too.
 */
export function addToIndex(index: FingerprintIndex, rec: TrackFingerprint): boolean {
  if (index.tracks.some(t => t.isrc === rec.isrc)) return false;
  const segs = index.segments;
  segs.push(buildSegment([rec], index.trackCount));
  index.tracks.push({ isrc: rec.isrc, title: rec.title, artist: rec.artist });
  index.trackCount++;
  while (segs.length >= 2 && segs[segs.length - 2].track.length <= 2 * segs[segs.length - 1].track.length) {
    const b = segs.pop()!, a = segs.pop()!;
    segs.push(mergeSegments(a, b));
  }
  return true;
}

/** Visit every entry stored under one hash: fn(trackIdx, anchorFrame). */
export function forEachEntry(index: FingerprintIndex, hash: number, fn: (trackIdx: number, frame: number) => void) {
  for (const s of index.segments) {
    const keys = s.keys;
    let lo = 0, hi = keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const k = keys[mid];
      if (k < hash) lo = mid + 1;
      else if (k > hash) hi = mid - 1;
      else {
        for (let e = s.starts[mid]; e < s.starts[mid + 1]; e++) fn(s.track[e], s.frame[e]);
        break;
      }
    }
  }
}

const MIN_SCORE = 12;        // aligned hash votes needed for a confident match
const NEIGHBOR_FRAMES = 6;   // deltas this close to the winner count as the same alignment
/**
 * How far the winner must stand above its own track's background.
 *
 * The runner-up test alone cannot answer "is this track playing at all": with
 * one track in the library there is no runner-up, so the test is vacuous and
 * the matcher named that track for every song put in front of it — and a
 * library of one is where everybody starts. Even at two tracks it leaked one
 * stranger in six.
 *
 * Measured by `npm run music` over twelve genuine snippets (clean and through
 * a simulated microphone) and twelve from tracks the library had never heard:
 * genuine matches stand 3.9–5.0x over their track's own 90th-percentile
 * alignment, strangers 1.5–2.1x. Three is the gap between them, with close to
 * a factor of two of margin on each side.
 */
const MIN_BACKGROUND_RATIO = 3.0;

/** Match a live snippet against the index. */
export function matchSnippet(pcm: Float32Array, sampleRate: number, index: FingerprintIndex): FingerprintMatch | null {
  if (index.trackCount === 0) return null;
  const q = extractPeakHashes(pcm, sampleRate);
  if (q.hashes.length < 20) return null;

  // Vote on (track, referenceFrame - queryFrame) at raw frame granularity
  const DELTA_BIAS = 1 << 21;
  const KEY_STRIDE = 1 << 22;
  const votes = new Map<number, number>();
  let totalVotes = 0;
  for (let i = 0; i < q.hashes.length; i++) {
    const qFrame = q.frames[i];
    forEachEntry(index, q.hashes[i], (trackIdx, refFrame) => {
      const delta = refFrame - qFrame;
      if (delta < -2) return; // snippet can't start before the track
      const key = trackIdx * KEY_STRIDE + delta + DELTA_BIAS;
      votes.set(key, (votes.get(key) ?? 0) + 1);
      totalVotes++;
    });
  }
  if (votes.size === 0) return null;

  // Windowed alignment scores: for each candidate (track, delta), sum votes
  // within ±NEIGHBOR_FRAMES — genuine matches concentrate there, while noise
  // spreads evenly. The runner-up is the best window that does NOT overlap
  // the winner (another track or a distant offset), so both sides of the
  // confidence ratio are measured the same way.
  const entries = [...votes.entries()]
    .map(([key, v]) => ({
      trackIdx: Math.floor(key / KEY_STRIDE),
      delta: (key % KEY_STRIDE) - DELTA_BIAS,
      v,
    }))
    .sort((a, b) => a.trackIdx - b.trackIdx || a.delta - b.delta);

  const windowSums = new Array<number>(entries.length).fill(0);
  let lo = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    while (entries[lo].trackIdx !== e.trackIdx || e.delta - entries[lo].delta > NEIGHBOR_FRAMES) lo++;
    let sum = 0;
    for (let j = lo; j < entries.length && entries[j].trackIdx === e.trackIdx && entries[j].delta - e.delta <= NEIGHBOR_FRAMES; j++) {
      sum += entries[j].v;
    }
    windowSums[i] = sum;
  }

  let bestIdx = 0;
  for (let i = 1; i < entries.length; i++) if (windowSums[i] > windowSums[bestIdx]) bestIdx = i;
  const best = entries[bestIdx];
  const score = windowSums[bestIdx];

  // How loud is this track's own background? Every alignment the winning
  // track offers, at the 90th percentile: a genuine match towers over it,
  // while a chance match IS the background, being simply the largest bump in
  // a flat field of noise. A percentile rather than the runner-up window
  // because loop-heavy music legitimately matches its own repeated phrase —
  // one or two strong repeats barely move a percentile.
  const sameTrack = [];
  for (let i = 0; i < entries.length; i++) if (entries[i].trackIdx === best.trackIdx) sameTrack.push(windowSums[i]);
  sameTrack.sort((a, b) => a - b);
  const background = sameTrack.length ? sameTrack[Math.floor(sameTrack.length * 0.9)] : 0;

  // Runner-up = best window on any OTHER track. Competing alignments within
  // the same track (loop-heavy music repeating a phrase) don't undermine the
  // track's identity — at worst the offset snaps to a repeat of the phrase.
  let runnerUp = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].trackIdx !== best.trackIdx && windowSums[i] > runnerUp) runnerUp = windowSums[i];
  }

  if (score < MIN_SCORE || score < runnerUp * 1.5 || score < background * MIN_BACKGROUND_RATIO) return null;

  const track = index.tracks[best.trackIdx];
  if (!track) return null;

  const offsetSec = Math.max(0, best.delta * FP_HOP_SEC + q.durationSec);
  return { isrc: track.isrc, title: track.title, artist: track.artist, offsetSec, score,
           concentration: totalVotes > 0 ? score / totalVotes : 0, queryHashes: q.hashes.length,
           background, perHash: score / Math.max(1, q.hashes.length) };
}
