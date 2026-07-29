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
}

// ── FFT (radix-2, real input) ──────────────────────────────────────────
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
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

export interface FingerprintIndex {
  trackCount: number;
  tracks: { isrc: string; title?: string; artist?: string }[];
  /** hash → packed entries (trackIdx * 2^20 + anchorFrame) */
  inverted: Map<number, number[]>;
}

const FRAME_BITS = 20; // frames fit easily (a 10-min track ≈ 13k frames)

export function buildIndex(records: TrackFingerprint[]): FingerprintIndex {
  const inverted = new Map<number, number[]>();
  const tracks = records.map(r => ({ isrc: r.isrc, title: r.title, artist: r.artist }));
  records.forEach((rec, trackIdx) => {
    const packBase = trackIdx * (1 << FRAME_BITS);
    for (let i = 0; i < rec.hashes.length; i++) {
      const h = rec.hashes[i];
      let list = inverted.get(h);
      if (!list) { list = []; inverted.set(h, list); }
      list.push(packBase + rec.frames[i]);
    }
  });
  return { trackCount: records.length, tracks, inverted };
}

const MIN_SCORE = 12;        // aligned hash votes needed for a confident match
const NEIGHBOR_FRAMES = 6;   // deltas this close to the winner count as the same alignment

/** Match a live snippet against the index. */
export function matchSnippet(pcm: Float32Array, sampleRate: number, index: FingerprintIndex): FingerprintMatch | null {
  if (index.trackCount === 0) return null;
  const q = extractPeakHashes(pcm, sampleRate);
  if (q.hashes.length < 20) return null;

  // Vote on (track, referenceFrame - queryFrame) at raw frame granularity
  const DELTA_BIAS = 1 << 21;
  const KEY_STRIDE = 1 << 22;
  const votes = new Map<number, number>();
  for (let i = 0; i < q.hashes.length; i++) {
    const entries = index.inverted.get(q.hashes[i]);
    if (!entries) continue;
    for (const packed of entries) {
      const trackIdx = Math.floor(packed / (1 << FRAME_BITS));
      const refFrame = packed % (1 << FRAME_BITS);
      const delta = refFrame - q.frames[i];
      if (delta < -2) continue; // snippet can't start before the track
      const key = trackIdx * KEY_STRIDE + delta + DELTA_BIAS;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
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

  // Runner-up = best window on any OTHER track. Competing alignments within
  // the same track (loop-heavy music repeating a phrase) don't undermine the
  // track's identity — at worst the offset snaps to a repeat of the phrase.
  let runnerUp = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].trackIdx !== best.trackIdx && windowSums[i] > runnerUp) runnerUp = windowSums[i];
  }

  if (score < MIN_SCORE || score < runnerUp * 1.5) return null;

  const track = index.tracks[best.trackIdx];
  if (!track) return null;

  const offsetSec = Math.max(0, best.delta * FP_HOP_SEC + q.durationSec);
  return { isrc: track.isrc, title: track.title, artist: track.artist, offsetSec, score };
}
