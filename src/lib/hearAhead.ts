/**
 * Hear a song ahead, from its file (PLAN.md §17).
 *
 * Live, the show only reacts: it records a song's first play and learns its
 * structure afterwards. When the performer loads a set as files, we can
 * decode each song ahead of time and extract everything a show wants before
 * its first note:
 *
 *   - `analyseSongAhead(pcm, sampleRate)`: runs the render's own ear (`SongEar`
 *     at 60 fps) so `hits` match frame-for-frame what the render hears, builds a
 *     local-tempo-following beat `grid` from first hit to last (bridging
 *     beatless breakdowns and refusing off-beat fills), segments `sections` on
 *     the beat with the drop named, and measures `loudnessLufs`.
 *   - `songLoudness(pcm, sampleRate)`: ITU-R BS.1770-4 integrated loudness on
 *     the mono mix (K-weighting derived from the analogue prototype for any
 *     sample rate, 400 ms blocks overlapping 75%, −70 LUFS absolute gate and
 *     −10 LU relative gate).
 *   - `setPosition(durations, gapSec, elapsedSec)`: sample-accurate place in
 *     a set, negative in the count-in gap before a song, null after the last.
 *   - `readSongTags(bytes)`: ISRC, title, artist and front cover (picture
 *     type 3) from ID3v2.4 (synchsafe), ID3v2.3 (UTF-16) and FLAC Vorbis
 *     comments / PICTURE blocks; never throws on truncated or absent tags.
 */

import { centreChroma } from './chroma.ts';
import type { SongSection } from './musicTypes.ts';
import { SongEar } from './songTrack.ts';

export interface SongAhead {
  durationSec: number;
  hits: number[];
  grid: number[];
  sections: SongSection[];
  loudnessLufs: number;
}

export interface SongTags {
  isrc?: string;
  title?: string;
  artist?: string;
  cover?: { mime: string; bytes: Uint8Array };
}

export interface SetPlace {
  index: number;
  t: number;
}

// ── 17d: ITU-R BS.1770 loudness ─────────────────────────────────────────

interface Biquad {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
}

/**
 * Derive the two BS.1770-4 K-weighting biquad stages for any sample rate from
 * their analogue prototype (bilinear transform). At 48000 Hz this reproduces
 * the published standard table to ~14 digits.
 */
function kWeightingCoeffs(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: acoustic head-effect high shelf (+4 dB around 1.68 kHz).
  const f1 = Math.min(0.45 * sampleRate, 1681.974450955533);
  const gDb = 3.999843853973347;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f1) / sampleRate);
  const vh = Math.pow(10, gDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a01 = 1 + k1 / q1 + k1 * k1;
  const s1: Biquad = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / a01,
    b1: (2 * (k1 * k1 - vh)) / a01,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / a01,
    a1: (2 * (k1 * k1 - 1)) / a01,
    a2: (1 - k1 / q1 + k1 * k1) / a01,
  };

  // Stage 2: Revised Low-Frequency B-weighting (RLB) high-pass (~38.1 Hz).
  // BS.1770 keeps unit numerator [1, -2, 1] because the ~0.043 dB passband
  // factor at 1 kHz is folded into the standard's −0.691 dB offset.
  const f2 = Math.min(0.45 * sampleRate, 38.13547087602444);
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f2) / sampleRate);
  const a02 = 1 + k2 / q2 + k2 * k2;
  const s2: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k2 * k2 - 1)) / a02,
    a2: (1 - k2 / q2 + k2 * k2) / a02,
  };

  return [s1, s2];
}

/**
 * Integrated loudness in LUFS (ITU-R BS.1770-4) over a mono PCM signal.
 *
 * Streams in 100 ms sub-blocks without copying `pcm` into a second full-song
 * float64 array (a 10-minute song at 48 kHz would otherwise take 230 MB just
 * for the filtered copy), then groups 4 consecutive sub-blocks into 400 ms
 * gating blocks overlapping by 75%.
 */
export function songLoudness(pcm: Float32Array, sampleRate: number): number {
  const n = pcm.length;
  if (n === 0 || !(sampleRate > 0)) return -70;

  const [s1, s2] = kWeightingCoeffs(sampleRate);
  const hop = Math.max(1, Math.round(0.1 * sampleRate));
  const blockSamples = 4 * hop;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let u1 = 0, u2 = 0, v1 = 0, v2 = 0;

  if (n < blockSamples) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = pcm[i];
      const w = s1.b0 * x + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = w;
      const z = s2.b0 * w + s2.b1 * u1 + s2.b2 * u2 - s2.a1 * v1 - s2.a2 * v2;
      u2 = u1; u1 = w; v2 = v1; v1 = z;
      sum += z * z;
    }
    const ms = sum / n;
    const lufs = ms > 0 ? -0.691 + 10 * Math.log10(ms) : -70;
    return Math.max(-70, lufs);
  }

  const subCount = Math.floor(n / hop);
  const subSums = new Float64Array(subCount);
  for (let k = 0; k < subCount; k++) {
    const start = k * hop;
    const end = start + hop;
    let sum = 0;
    for (let i = start; i < end; i++) {
      const x = pcm[i];
      const w = s1.b0 * x + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = w;
      const z = s2.b0 * w + s2.b1 * u1 + s2.b2 * u2 - s2.a1 * v1 - s2.a2 * v2;
      u2 = u1; u1 = w; v2 = v1; v1 = z;
      sum += z * z;
    }
    subSums[k] = sum;
  }

  const numBlocks = subCount - 3;
  const blockMeanSq = new Float64Array(numBlocks);
  const absThresh = Math.pow(10, (-70 + 0.691) / 10);
  let absSum = 0;
  let absCount = 0;

  for (let b = 0; b < numBlocks; b++) {
    const e = (subSums[b] + subSums[b + 1] + subSums[b + 2] + subSums[b + 3]) / blockSamples;
    blockMeanSq[b] = e;
    if (e > absThresh) {
      absSum += e;
      absCount++;
    }
  }
  if (absCount === 0) return -70;

  // Relative gate: −10 LU below the absolute-gated mean energy.
  const relThresh = (absSum / absCount) * 0.1;
  let relSum = 0;
  let relCount = 0;
  for (let b = 0; b < numBlocks; b++) {
    const e = blockMeanSq[b];
    if (e > absThresh && e > relThresh) {
      relSum += e;
      relCount++;
    }
  }
  if (relCount === 0) return -0.691 + 10 * Math.log10(absSum / absCount);
  return -0.691 + 10 * Math.log10(relSum / relCount);
}

// ── 17e: Set position clock ─────────────────────────────────────────────

/**
 * Where the player is inside a set of `durations` separated by `gapSec`:
 * `{ index, t }`, with `t` negative during the count-in gap before a song,
 * and `null` once the last song has ended.
 */
export function setPosition(durations: readonly number[], gapSec: number, elapsedSec: number): SetPlace | null {
  if (!durations.length) return null;
  const gap = Math.max(0, gapSec);
  let cursor = 0;
  for (let i = 0; i < durations.length; i++) {
    const start = i === 0 ? 0 : cursor + gap;
    const end = start + Math.max(0, durations[i]);
    if (elapsedSec < end) return { index: i, t: elapsedSec - start };
    cursor = end;
  }
  return null;
}

// ── 17f: Song tags (ID3v2.3 / ID3v2.4 / FLAC) ───────────────────────────

const utf8Dec = new TextDecoder('utf-8', { fatal: false });
const utf16LeDec = new TextDecoder('utf-16le', { fatal: false });
const utf16BeDec = new TextDecoder('utf-16be', { fatal: false });

function normalizeIsrc(raw: string): string | undefined {
  const clean = raw.replace(/\0+$/g, '').trim().replace(/-/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(clean) ? clean : undefined;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function decodeId3Text(payload: Uint8Array): string {
  if (payload.length === 0) return '';
  const enc = payload[0];
  const body = payload.subarray(1);
  let text = '';
  if (enc === 0) {
    text = decodeLatin1(body);
  } else if (enc === 1) {
    if (body.length < 2) return '';
    const b0 = body[0], b1 = body[1];
    if (b0 === 0xff && b1 === 0xfe) text = utf16LeDec.decode(body.subarray(2));
    else if (b0 === 0xfe && b1 === 0xff) text = utf16BeDec.decode(body.subarray(2));
    else text = utf16LeDec.decode(body);
  } else if (enc === 2) {
    text = utf16BeDec.decode(body);
  } else {
    text = utf8Dec.decode(body);
  }
  const nul = text.indexOf('\0');
  return (nul >= 0 ? text.slice(0, nul) : text).trim();
}

function synchsafe(b: Uint8Array, off: number): number {
  return ((b[off] & 0x7f) << 21) | ((b[off + 1] & 0x7f) << 14) | ((b[off + 2] & 0x7f) << 7) | (b[off + 3] & 0x7f);
}

function readU32BE(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function readU32LE(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}

function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i];
    if (b[i] === 0xff && i + 1 < b.length && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

function parseApic(payload: Uint8Array): { type: number; mime: string; bytes: Uint8Array } | null {
  if (payload.length < 4) return null;
  const enc = payload[0];
  let p = 1;
  while (p < payload.length && payload[p] !== 0) p++;
  if (p >= payload.length) return null;
  const mime = decodeLatin1(payload.subarray(1, p)) || 'image/jpeg';
  p++; // skip NUL
  if (p >= payload.length) return null;
  const type = payload[p++];
  // Skip null-terminated description (2-byte NUL for UTF-16).
  if (enc === 1 || enc === 2) {
    while (p + 1 < payload.length && !(payload[p] === 0 && payload[p + 1] === 0)) p += 2;
    p += 2;
  } else {
    while (p < payload.length && payload[p] !== 0) p++;
    p++;
  }
  if (p >= payload.length) return null;
  return { type, mime, bytes: payload.slice(p) };
}

function parseId3v2(bytes: Uint8Array, out: SongTags): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const ver = bytes[3];
  if (ver !== 3 && ver !== 4) return 0;
  const flags = bytes[5];
  const tagSize = synchsafe(bytes, 6);
  const tagEnd = Math.min(bytes.length, 10 + tagSize);

  let data = bytes.subarray(10, tagEnd);
  if (ver === 3 && (flags & 0x80) !== 0) data = deunsync(data);

  let pos = 0;
  // Extended header
  if ((flags & 0x40) !== 0 && pos + 4 <= data.length) {
    const extSize = ver === 4 ? synchsafe(data, pos) : 4 + readU32BE(data, pos);
    pos += Math.max(4, extSize);
  }

  let hasFrontCover = false;
  while (pos + 10 <= data.length) {
    if (data[pos] === 0) break; // padding
    const id = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = ver === 4 ? synchsafe(data, pos + 4) : readU32BE(data, pos + 4);
    const frameFlags = (data[pos + 8] << 8) | data[pos + 9];
    pos += 10;
    if (size === 0 || pos + size > data.length) break;

    let payload = data.subarray(pos, pos + size);
    pos += size;

    if (ver === 4) {
      if ((frameFlags & 0x02) !== 0) payload = deunsync(payload);
      if ((frameFlags & 0x01) !== 0 && payload.length >= 4) payload = payload.subarray(4);
    }

    if (id === 'TIT2') {
      const t = decodeId3Text(payload);
      if (t) out.title = t;
    } else if (id === 'TPE1') {
      const a = decodeId3Text(payload);
      if (a) out.artist = a;
    } else if (id === 'TSRC') {
      const isrc = normalizeIsrc(decodeId3Text(payload));
      if (isrc) out.isrc = isrc;
    } else if (id === 'APIC') {
      const pic = parseApic(payload);
      if (pic && (pic.type === 3 || (!hasFrontCover && !out.cover))) {
        out.cover = { mime: pic.mime, bytes: pic.bytes };
        if (pic.type === 3) hasFrontCover = true;
      }
    }
  }
  return 10 + tagSize;
}

function parseFlac(bytes: Uint8Array, offset: number, out: SongTags): void {
  if (offset + 4 > bytes.length) return;
  if (bytes[offset] !== 0x66 || bytes[offset + 1] !== 0x4c || bytes[offset + 2] !== 0x61 || bytes[offset + 3] !== 0x43) return;
  let pos = offset + 4;
  let hasFrontCover = Boolean(out.cover);

  while (pos + 4 <= bytes.length) {
    const hdr = bytes[pos];
    const isLast = (hdr & 0x80) !== 0;
    const type = hdr & 0x7f;
    const len = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    pos += 4;
    if (pos + len > bytes.length) break;
    const block = bytes.subarray(pos, pos + len);
    pos += len;

    if (type === 4 && block.length >= 8) {
      // Vorbis comment block
      const vendorLen = readU32LE(block, 0);
      let p = 4 + vendorLen;
      if (p + 4 <= block.length) {
        const count = readU32LE(block, p);
        p += 4;
        for (let i = 0; i < count && p + 4 <= block.length; i++) {
          const cLen = readU32LE(block, p);
          p += 4;
          if (p + cLen > block.length) break;
          const comment = utf8Dec.decode(block.subarray(p, p + cLen));
          p += cLen;
          const eq = comment.indexOf('=');
          if (eq <= 0) continue;
          const key = comment.slice(0, eq).toUpperCase();
          const val = comment.slice(eq + 1).trim();
          if (!val) continue;
          if (key === 'TITLE' && !out.title) out.title = val;
          else if (key === 'ARTIST' && !out.artist) out.artist = val;
          else if (key === 'ISRC' && !out.isrc) {
            const isrc = normalizeIsrc(val);
            if (isrc) out.isrc = isrc;
          }
        }
      }
    } else if (type === 6 && block.length >= 32) {
      // METADATA_BLOCK_PICTURE
      const picType = readU32BE(block, 0);
      const mimeLen = readU32BE(block, 4);
      let p = 8;
      if (p + mimeLen + 4 <= block.length) {
        const mime = decodeLatin1(block.subarray(p, p + mimeLen)) || 'image/jpeg';
        p += mimeLen;
        const descLen = readU32BE(block, p);
        p += 4 + descLen + 16; // skip description, width, height, depth, indexed colors
        if (p + 4 <= block.length) {
          const dataLen = readU32BE(block, p);
          p += 4;
          if (p + dataLen <= block.length && (picType === 3 || (!hasFrontCover && !out.cover))) {
            out.cover = { mime, bytes: block.slice(p, p + dataLen) };
            if (picType === 3) hasFrontCover = true;
          }
        }
      }
    }
    if (isLast) break;
  }
}

/**
 * Read ISRC, title, artist and front cover (picture type 3) from an MP3
 * (ID3v2.3/v2.4) or FLAC file header. Never throws on malformed or truncated
 * bytes.
 */
export function readSongTags(bytes: Uint8Array): SongTags {
  const out: SongTags = {};
  try {
    if (!bytes || bytes.length < 4) return out;
    const afterId3 = parseId3v2(bytes, out);
    parseFlac(bytes, afterId3, out);
  } catch {
    // Truncated or corrupt metadata never fails the load.
  }
  return out;
}

// ── 17a: Beat grid from SongEar hits ────────────────────────────────────

const ANALYSIS_FPS = 60;
const MIN_PERIOD_S = 0.30; // 200 BPM
const MAX_PERIOD_S = 1.25; // 48 BPM
const PERIOD_STEP_S = 0.002;
const PERIOD_BINS = Math.floor((MAX_PERIOD_S - MIN_PERIOD_S) / PERIOD_STEP_S) + 1;

function medianNumber(arr: readonly number[]): number {
  if (!arr.length) return 0.5;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

/**
 * Estimate the dominant beat period near `centerTime` from hits within a local
 * window, weighting adjacent inter-onset intervals over skip-1/skip-2 pairs
 * and gently preferring the canonical 80–160 BPM octave so half-time or
 * double-time aliases lose.
 */
function estimateLocalPeriod(hits: readonly number[], centerTime: number, fallback: number): number {
  if (hits.length < 2) return fallback;

  // Gather hits within ±10 s, expanding if needed so we have enough pairs.
  let lo = 0;
  let hi = hits.length - 1;
  while (lo < hits.length && hits[lo] < centerTime - 10) lo++;
  while (hi > lo && hits[hi] > centerTime + 10) hi--;
  while (hi - lo + 1 < Math.min(16, hits.length)) {
    if (lo > 0) lo--;
    if (hi < hits.length - 1 && hi - lo + 1 < Math.min(16, hits.length)) hi++;
    if (lo === 0 && hi === hits.length - 1) break;
  }
  if (hi - lo + 1 < 4) return fallback;

  const scores = new Float64Array(PERIOD_BINS);
  const sigma = 0.014;
  const inv2s2 = 1 / (2 * sigma * sigma);

  for (let i = lo; i < hi; i++) {
    for (let j = i + 1; j <= hi && j - i <= 3; j++) {
      const dt = hits[j] - hits[i];
      if (dt < MIN_PERIOD_S - 0.03 || dt > MAX_PERIOD_S + 0.03) continue;
      const w = j === i + 1 ? 1.0 : j === i + 2 ? 0.35 : 0.15;
      const bMin = Math.max(0, Math.floor((dt - 0.045 - MIN_PERIOD_S) / PERIOD_STEP_S));
      const bMax = Math.min(PERIOD_BINS - 1, Math.ceil((dt + 0.045 - MIN_PERIOD_S) / PERIOD_STEP_S));
      for (let b = bMin; b <= bMax; b++) {
        const p = MIN_PERIOD_S + b * PERIOD_STEP_S;
        const d = p - dt;
        scores[b] += w * Math.exp(-d * d * inv2s2);
      }
    }
  }

  let bestBin = -1;
  let bestScore = 0;
  for (let b = 0; b < PERIOD_BINS; b++) {
    const p = MIN_PERIOD_S + b * PERIOD_STEP_S;
    // Gentle log-Gaussian tempo prior centered near 115 BPM (0.52 s).
    const oct = Math.log2(p / 0.52) / 0.9;
    const s = scores[b] * Math.exp(-0.5 * oct * oct);
    if (s > bestScore) { bestScore = s; bestBin = b; }
  }
  if (bestBin < 0) return fallback;

  const peakP = MIN_PERIOD_S + bestBin * PERIOD_STEP_S;
  let num = 0, den = 0;
  for (let i = lo; i < hi; i++) {
    for (let j = i + 1; j <= hi && j - i <= 3; j++) {
      const dt = hits[j] - hits[i];
      if (Math.abs(dt - peakP) <= 0.025) {
        const w = j === i + 1 ? 1.0 : j === i + 2 ? 0.35 : 0.15;
        num += w * dt;
        den += w;
      }
    }
  }
  return den > 0 ? num / den : peakP;
}

/**
 * Dynamic-programming beat tracker (Ellis 2007 style) over one contiguous
 * stretch of hits, stepping on the 60 fps grid so missed beats are filled in,
 * off-beat fills are refused, and local tempo shifts are followed.
 */
function trackStretch(stretchHits: readonly number[], fallbackPeriod: number): number[] {
  if (stretchHits.length === 0) return [];
  if (stretchHits.length === 1) return [stretchHits[0]];

  const f0 = Math.round(stretchHits[0] * ANALYSIS_FPS);
  const f1 = Math.round(stretchHits[stretchHits.length - 1] * ANALYSIS_FPS);
  const len = f1 - f0 + 1;
  if (len <= 1) return [f0 / ANALYSIS_FPS];

  const hitAt = new Uint8Array(len);
  for (const h of stretchHits) {
    const idx = Math.round(h * ANALYSIS_FPS) - f0;
    if (idx >= 0 && idx < len) hitAt[idx] = 1;
  }

  // Sample local period every 15 frames (0.25 s) and interpolate per frame.
  const sampleStep = 15;
  const pSamples: number[] = [];
  for (let idx = 0; idx < len; idx += sampleStep) {
    pSamples.push(estimateLocalPeriod(stretchHits, (f0 + idx) / ANALYSIS_FPS, fallbackPeriod));
  }
  const pFrames = new Float64Array(len);
  for (let idx = 0; idx < len; idx++) {
    const q = idx / sampleStep;
    const s0 = Math.min(pSamples.length - 1, Math.floor(q));
    const s1 = Math.min(pSamples.length - 1, s0 + 1);
    const fr = q - s0;
    pFrames[idx] = (pSamples[s0] * (1 - fr) + pSamples[s1] * fr) * ANALYSIS_FPS;
  }

  const dp = new Float64Array(len).fill(-1e9);
  const prev = new Int32Array(len).fill(-1);

  // Allow starting on the first hit or within one beat if the first hit was an upbeat pickup.
  const startSpan = Math.min(len - 1, Math.round(pFrames[0]));
  for (let idx = 0; idx <= startSpan; idx++) {
    if (hitAt[idx] || idx === 0) dp[idx] = hitAt[idx] - 0.001 * idx;
  }

  for (let idx = 1; idx < len; idx++) {
    const pf = pFrames[idx];
    const dMin = Math.max(1, Math.round(0.75 * pf));
    const dMax = Math.round(1.32 * pf);
    const reward = hitAt[idx] ? 1.0 : 0.0;
    for (let d = dMin; d <= dMax; d++) {
      const j = idx - d;
      if (j < 0) break;
      const logRatio = Math.log(d / pf);
      const cand = dp[j] + reward - 12 * logRatio * logRatio;
      if (cand > dp[idx]) {
        dp[idx] = cand;
        prev[idx] = j;
      }
    }
  }

  // Pick the highest-scoring ending beat near the end of the stretch.
  const endSpan = Math.max(0, len - 1 - Math.round(pFrames[len - 1]));
  let bestEnd = len - 1;
  let bestVal = -1e9;
  for (let idx = endSpan; idx < len; idx++) {
    const score = dp[idx] + 0.0005 * idx;
    if (score > bestVal) { bestVal = score; bestEnd = idx; }
  }

  const frames: number[] = [];
  for (let cur = bestEnd; cur >= 0; cur = prev[cur]) frames.push(f0 + cur);
  frames.reverse();

  // Refine beat times via local linear regression over matched hits (±6 beats)
  // to average out 60 fps quantization jitter.
  const rawTimes = frames.map((f) => f / ANALYSIS_FPS);
  const matchedHit: (number | null)[] = rawTimes.map((t) => {
    let best: number | null = null;
    let bestDist = 0.025;
    for (const h of stretchHits) {
      const d = Math.abs(h - t);
      if (d <= bestDist) { bestDist = d; best = h; }
    }
    return best;
  });

  const refined = new Array<number>(rawTimes.length);
  for (let k = 0; k < rawTimes.length; k++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
    for (let j = Math.max(0, k - 6); j <= Math.min(rawTimes.length - 1, k + 6); j++) {
      const h = matchedHit[j];
      if (h === null) continue;
      sx += j; sy += h; sxx += j * j; sxy += j * h; cnt++;
    }
    let t = rawTimes[k];
    if (cnt >= 3) {
      const denom = cnt * sxx - sx * sx;
      if (denom > 0) {
        const slope = (cnt * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / cnt;
        const est = intercept + slope * k;
        if (Math.abs(est - rawTimes[k]) <= 0.018) t = est;
      }
    }
    refined[k] = t;
  }
  return refined;
}

function buildBeatGrid(hits: readonly number[]): number[] {
  if (hits.length === 0) return [];
  if (hits.length === 1) return [hits[0]];

  const adjIntervals: number[] = [];
  for (let i = 1; i < hits.length; i++) {
    const dt = hits[i] - hits[i - 1];
    if (dt >= MIN_PERIOD_S && dt <= MAX_PERIOD_S) adjIntervals.push(dt);
  }
  const rough = adjIntervals.length ? medianNumber(adjIntervals) : 0.5;
  const fallback = estimateLocalPeriod(hits, hits[Math.floor(hits.length / 2)], rough);
  const gapSplit = Math.max(2.2, 3.2 * rough);

  // Split into active stretches separated by beatless gaps.
  const stretches: number[][] = [[hits[0]]];
  for (let i = 1; i < hits.length; i++) {
    if (hits[i] - hits[i - 1] > gapSplit) stretches.push([hits[i]]);
    else stretches[stretches.length - 1].push(hits[i]);
  }

  const tracked = stretches.map((s) => trackStretch(s, fallback));
  const grid: number[] = [];

  for (let s = 0; s < tracked.length; s++) {
    const cur = tracked[s];
    if (s > 0 && grid.length > 0 && cur.length > 0) {
      const prev = tracked[s - 1];
      const tA = grid[grid.length - 1];
      const tB = cur[0];
      const pA = prev.length >= 2
        ? medianNumber(prev.slice(-Math.min(8, prev.length)).map((v, i, a) => (i > 0 ? v - a[i - 1] : 0)).slice(1))
        : fallback;
      const pB = cur.length >= 2
        ? medianNumber(cur.slice(0, Math.min(8, cur.length)).map((v, i, a) => (i > 0 ? v - a[i - 1] : 0)).slice(1))
        : pA;
      const gap = tB - tA;
      const k = Math.round(gap / pA);
      if (k >= 2) {
        if (Math.abs(gap - k * pA) <= 0.35 * pA) {
          const step = gap / k;
          for (let j = 1; j < k; j++) grid.push(tA + j * step);
        } else {
          for (let t = tA + pA; t + 0.5 * pB < tB; t += pA) grid.push(t);
        }
      }
    }
    for (const t of cur) grid.push(t);
  }

  return grid;
}

// ── 17b: Beat-synchronous sections with the drop named ──────────────────

function sectionMeanEnergy(frameLevel: Float32Array, startSec: number, endSec: number): number {
  const f0 = Math.max(0, Math.floor(startSec * ANALYSIS_FPS));
  const f1 = Math.min(frameLevel.length, Math.max(f0 + 1, Math.ceil(endSec * ANALYSIS_FPS)));
  let sum = 0;
  for (let f = f0; f < f1; f++) sum += frameLevel[f];
  return f1 > f0 ? sum / (f1 - f0) : 0;
}

function buildSections(
  durationSec: number,
  hits: readonly number[],
  grid: readonly number[],
  frameChroma: Float32Array,
  frameBands: Float32Array,
  frameLevelDb: Float32Array,
  frameLevel: Float32Array,
): SongSection[] {
  const nFrames = frameLevel.length;
  if (grid.length < 4) {
    return [{ start: 0, end: durationSec, label: 'song', energy: sectionMeanEnergy(frameLevel, 0, durationSec) }];
  }

  const B = grid.length;
  const beatHasHit = new Uint8Array(B);
  const beatChroma = Array.from({ length: B }, () => new Float64Array(12));
  const beatSpecShape = Array.from({ length: B }, () => new Float64Array(8));
  const beatLevelDb = new Float64Array(B);

  let hitCursor = 0;
  for (let b = 0; b < B; b++) {
    const t0 = grid[b];
    const localP = b + 1 < B ? grid[b + 1] - t0 : b > 0 ? t0 - grid[b - 1] : 0.5;
    const t1 = b + 1 < B ? grid[b + 1] : Math.min(durationSec, t0 + localP);

    // Check whether a SongEar beat hit landed on this grid beat.
    const tol = Math.min(0.18, 0.35 * localP);
    while (hitCursor < hits.length && hits[hitCursor] < t0 - tol) hitCursor++;
    if (hitCursor < hits.length && Math.abs(hits[hitCursor] - t0) <= tol) beatHasHit[b] = 1;

    const f0 = Math.max(0, Math.round(t0 * ANALYSIS_FPS));
    const f1 = Math.min(nFrames, Math.max(f0 + 1, Math.round(t1 * ANALYSIS_FPS)));
    const count = Math.max(1, f1 - f0);
    const ch = beatChroma[b];
    const sp = beatSpecShape[b];
    let dbSum = 0;

    for (let f = f0; f < f1; f++) {
      const cOff = f * 12;
      for (let k = 0; k < 12; k++) ch[k] += frameChroma[cOff + k];
      const bOff = f * 8;
      for (let k = 0; k < 8; k++) sp[k] += frameBands[bOff + k];
      dbSum += frameLevelDb[f];
    }
    for (let k = 0; k < 12; k++) ch[k] /= count;
    let spMean = 0;
    for (let k = 0; k < 8; k++) { sp[k] /= count; spMean += sp[k]; }
    spMean /= 8;
    for (let k = 0; k < 8; k++) sp[k] -= spMean;
    beatLevelDb[b] = dbSum / count;
  }

  // Structural boundaries on beat indices: first beat after an intro, and
  // entry/exit of any beatless stretch >= 8 beats (breakdown -> drop).
  const structural = new Set<number>();
  const breakdownRanges: { startBeat: number; endBeat: number }[] = [];
  let b = 0;
  while (b < B) {
    if (beatHasHit[b]) { b++; continue; }
    const start = b;
    while (b < B && !beatHasHit[b]) b++;
    if (start > 0 && b < B && b - start >= 8) {
      structural.add(start);
      structural.add(b);
      breakdownRanges.push({ startBeat: start, endBeat: b });
    }
  }

  // Within each active beat stretch, find harmony / timbre / level changes
  // using a beat-synchronous symmetric comparison window (Foote novelty).
  const sortedStruct = [0, ...[...structural].sort((x, y) => x - y), B];
  const noveltyBounds: number[] = [];
  const cL = new Float64Array(12), cR = new Float64Array(12);
  const cLc = new Float64Array(12), cRc = new Float64Array(12);
  const sL = new Float64Array(8), sR = new Float64Array(8);

  for (let r = 0; r + 1 < sortedStruct.length; r++) {
    const r0 = sortedStruct[r];
    const r1 = sortedStruct[r + 1];
    if (breakdownRanges.some((br) => br.startBeat === r0 && br.endBeat === r1)) continue;
    const rLen = r1 - r0;
    if (rLen < 24) continue;

    const win = rLen >= 48 ? 16 : 8;
    const nov = new Float64Array(rLen);
    const activeNov: number[] = [];

    for (let i = win; i <= rLen - win; i++) {
      const center = r0 + i;
      cL.fill(0); cR.fill(0); sL.fill(0); sR.fill(0);
      let lL = 0, lR = 0;
      for (let j = 0; j < win; j++) {
        const bL = beatChroma[center - 1 - j];
        const bR = beatChroma[center + j];
        const sbL = beatSpecShape[center - 1 - j];
        const sbR = beatSpecShape[center + j];
        for (let k = 0; k < 12; k++) { cL[k] += bL[k]; cR[k] += bR[k]; }
        for (let k = 0; k < 8; k++) { sL[k] += sbL[k]; sR[k] += sbR[k]; }
        lL += beatLevelDb[center - 1 - j];
        lR += beatLevelDb[center + j];
      }
      for (let k = 0; k < 12; k++) { cL[k] /= win; cR[k] /= win; }
      for (let k = 0; k < 8; k++) { sL[k] /= win; sR[k] /= win; }
      lL /= win; lR /= win;

      let chromaNov = 0;
      if (centreChroma(cL, cLc) && centreChroma(cR, cRc)) {
        let dot = 0;
        for (let k = 0; k < 12; k++) dot += cLc[k] * cRc[k];
        chromaNov = 0.5 * (1 - Math.max(-1, Math.min(1, dot)));
      }
      let specSq = 0;
      for (let k = 0; k < 8; k++) { const d = sL[k] - sR[k]; specSq += d * d; }
      const specNov = Math.sqrt(specSq / 8) / 12;
      const lvlNov = Math.abs(lL - lR) / 8;

      const v = chromaNov + 0.6 * specNov + 0.4 * lvlNov;
      nov[i] = v;
      activeNov.push(v);
    }

    const med = medianNumber(activeNov);
    const mad = medianNumber(activeNov.map((v) => Math.abs(v - med)));
    const thresh = Math.max(0.18, med + 2.5 * mad);

    let lastPick = 0;
    for (let i = win; i <= rLen - win; i++) {
      const v = nov[i];
      if (v <= thresh || i - lastPick < 12 || rLen - i < 12) continue;
      let isPeak = true;
      for (let d = -8; d <= 8; d++) {
        if (d === 0) continue;
        const j = i + d;
        if (j >= win && j <= rLen - win && nov[j] > v) { isPeak = false; break; }
        if (d < 0 && j >= win && nov[j] === v) { isPeak = false; break; }
      }
      if (isPeak) {
        noveltyBounds.push(r0 + i);
        lastPick = i;
      }
    }
  }

  // Assemble sorted beat-index boundaries -> section objects.
  const firstPeriod = grid.length >= 2 ? grid[1] - grid[0] : 0.5;
  const hasIntro = grid[0] > Math.max(0.8, 1.5 * firstPeriod);
  const beatBounds = [...new Set([...(hasIntro ? [0] : []), ...structural, ...noveltyBounds])].sort((a, b2) => a - b2);

  // Pick the single strongest beat-return after a breakdown as 'drop'.
  let dropStartBeat: number | null = null;
  if (breakdownRanges.length === 1) {
    dropStartBeat = breakdownRanges[0].endBeat;
  } else if (breakdownRanges.length > 1) {
    let bestJump = -Infinity;
    for (const br of breakdownRanges) {
      let beforeSum = 0, beforeN = 0;
      for (let j = Math.max(0, br.startBeat - 4); j < br.startBeat; j++) { beforeSum += beatLevelDb[j]; beforeN++; }
      let afterSum = 0, afterN = 0;
      for (let j = br.endBeat; j < Math.min(B, br.endBeat + 4); j++) { afterSum += beatLevelDb[j]; afterN++; }
      const jump = (afterN ? afterSum / afterN : -140) - (beforeN ? beforeSum / beforeN : -140);
      if (jump > bestJump) { bestJump = jump; dropStartBeat = br.endBeat; }
    }
  }

  const rawBounds: { startSec: number; beatIdx: number | null }[] = [{ startSec: 0, beatIdx: hasIntro ? null : 0 }];
  for (const bb of beatBounds) {
    if (bb === 0 && !hasIntro) continue;
    rawBounds.push({ startSec: grid[bb], beatIdx: bb });
  }

  const sections: SongSection[] = [];
  for (let s = 0; s < rawBounds.length; s++) {
    const start = rawBounds[s].startSec;
    const end = s + 1 < rawBounds.length ? rawBounds[s + 1].startSec : durationSec;
    const bi = rawBounds[s].beatIdx;

    let label = 'section';
    if (s === 0 && hasIntro) label = 'intro';
    else if (bi !== null && dropStartBeat !== null && bi === dropStartBeat) label = 'drop';
    else if (bi !== null && breakdownRanges.some((br) => br.startBeat === bi)) label = 'breakdown';
    else if (s === rawBounds.length - 1) label = 'outro';

    sections.push({ start, end, label, energy: sectionMeanEnergy(frameLevel, start, end) });
  }

  return sections;
}

/**
 * Analyse a mono PCM recording ahead of playback using the render's own
 * `SongEar` at 60 fps. Deterministic, JSON-compact, and pure.
 */
export function analyseSongAhead(pcm: Float32Array, sampleRate: number): SongAhead {
  const durationSec = pcm.length / sampleRate;
  const ear = new SongEar(pcm, sampleRate, ANALYSIS_FPS);
  const nFrames = ear.frames;
  const hits: number[] = [];
  const frameChroma = new Float32Array(nFrames * 12);
  const frameBands = new Float32Array(nFrames * 8);
  const frameLevelDb = new Float32Array(nFrames);
  const frameLevel = new Float32Array(nFrames);

  for (let i = 0; i < nFrames; i++) {
    const f = ear.next()?.features;
    if (!f) {
      frameLevelDb[i] = -140;
      continue;
    }
    if (f.beat?.hit) hits.push(i / ANALYSIS_FPS);
    const cOff = i * 12;
    for (let k = 0; k < 12; k++) frameChroma[cOff + k] = f.chroma[k] ?? 0;
    const bOff = i * 8;
    for (let k = 0; k < 8; k++) frameBands[bOff + k] = f.db[9 + k] ?? -140;
    frameLevelDb[i] = f.db[0] ?? -140;
    frameLevel[i] = f.level ?? 0;
  }

  const grid = buildBeatGrid(hits);
  const sections = buildSections(durationSec, hits, grid, frameChroma, frameBands, frameLevelDb, frameLevel);
  const loudnessLufs = songLoudness(pcm, sampleRate);

  return { durationSec, hits, grid, sections, loudnessLufs };
}
