/**
 * Reading YouTube and phone footage honestly (`npm run watch`, PLAN 47x-11).
 *
 * A clean recording from the app's Record button fills its frame with the
 * plate, has no title cards or watermarks, holds the camera still, and runs
 * at high bitrate. Real YouTube and phone references do not:
 *
 *   1. Letterbox / pillarbox: black bars on the edges stay black and still
 *      on >= 95% of samples, whereas a dark-ground plate has grain and moves.
 *      Detected first and cropped before any read (`--crop` wins; `--no-autocrop`
 *      disables).
 *   2. Overlays (logos, watermarks, captions): regions that stay still with
 *      sharp edges while the rest of the frame moves. Masked out of every
 *      pixel, design and flow read so a corner mark does not bias colourfulness,
 *      forms or flow.
 *   3. Title cards: spans where most of the frame is still on a flat ground
 *      with sharp text edges, then gone. Excluded from design, physics and
 *      shape reads the way cuts and fades are.
 *   4. Compression softness: 8 px blockiness, high-frequency spectral cutoff,
 *      and bits per pixel. When a clip is too blocky or bitrate-starved for
 *      fine detail, detail measures (spectrum slope, edge width, form scale,
 *      forms a frame) are flagged `reliable: false`, printed as
 *      "unreliable (compression)", skipped in `--vs` gaps, and withheld on
 *      the report card.
 *
 * Camera motion is estimated from the block flow in `watchphysics.mjs` via a
 * robust (Tukey IRLS) global translation fit and subtracted from the fluid
 * drift; `cameraShare` is the share of motion explained by global camera
 * translation, while `wholeShare` keeps its documented meaning (full affine
 * whole-field fit including dish rotation and uniform spread).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fft } from './watchphysics.mjs';

const BAR_LUMA_MAX = 0.035;
const BAR_BRIGHT_SHARE = 0.02;
const BAR_DIFF_MAX = 0.004;
const BAR_SPATIAL_STD_MAX = 0.009;
const BAR_HOLD_FRAC = 0.95;
const BAR_MIN_SHARE = 0.02;
const MIN_REMAINING = 0.25;

const TITLE_DIFF_MAX = 0.008;
const TITLE_MOVED_FRAC_MAX = 0.02;
const TITLE_GROUND_SHARE_MIN = 0.60;
const TITLE_FLAT_FRAC_MIN = 0.65;
const TITLE_EDGE_MIN = 0.004;
const TITLE_EDGE_MAX = 0.35;

const OVERLAY_STILL_FRAC = 0.90;
const OVERLAY_DIFF_MAX = 0.015;
const OVERLAY_EDGE_MIN = 0.08;
const OVERLAY_MAX_SHARE = 0.35;

/** Compute [0, 1] luminance array for an RGB24 frame. */
export function frameLuma(px, W, H) {
  const N = W * H;
  const lum = new Float32Array(N);
  for (let i = 0, p = 0; p < N; i += 3, p++) {
    lum[p] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  }
  return lum;
}

/**
 * Detect contiguous black-and-still letterbox/pillarbox bars from frame edges.
 * A dark-ground plate moves and carries grain (higher temporal diff or spatial
 * spread) and is left untouched. Returns `{ x, y, w, h, top, bottom, left, right }`
 * in fractions of frame dimensions, or `null` when no bars are present.
 */
export function detectAutocrop(frames, W, H) {
  if (!frames || frames.length < 2 || W < 16 || H < 16) return null;
  const lums = frames.map(f => (f instanceof Float32Array ? f : frameLuma(f.px ?? f, W, H)));
  const n = lums.length;
  const pairs = n - 1;
  const rowCounts = new Int32Array(H);
  const colCounts = new Int32Array(W);

  const rowOk = (L, y) => {
    let sum = 0, sum2 = 0, bright = 0;
    const off = y * W;
    for (let x = 0; x < W; x++) {
      const v = L[off + x];
      sum += v; sum2 += v * v;
      if (v > 0.06) bright++;
    }
    const mean = sum / W;
    const std = Math.sqrt(Math.max(0, sum2 / W - mean * mean));
    return mean < BAR_LUMA_MAX && bright / W < BAR_BRIGHT_SHARE && std < BAR_SPATIAL_STD_MAX;
  };
  const colOk = (L, x) => {
    let sum = 0, sum2 = 0, bright = 0;
    for (let y = 0; y < H; y++) {
      const v = L[y * W + x];
      sum += v; sum2 += v * v;
      if (v > 0.06) bright++;
    }
    const mean = sum / H;
    const std = Math.sqrt(Math.max(0, sum2 / H - mean * mean));
    return mean < BAR_LUMA_MAX && bright / H < BAR_BRIGHT_SHARE && std < BAR_SPATIAL_STD_MAX;
  };

  let prevRowOk = Array.from({ length: H }, (_, y) => rowOk(lums[0], y));
  let prevColOk = Array.from({ length: W }, (_, x) => colOk(lums[0], x));

  for (let k = 1; k < n; k++) {
    const cur = lums[k], prv = lums[k - 1];
    const curRowOk = Array.from({ length: H }, (_, y) => rowOk(cur, y));
    const curColOk = Array.from({ length: W }, (_, x) => colOk(cur, x));
    for (let y = 0; y < H; y++) {
      if (!prevRowOk[y] || !curRowOk[y]) continue;
      let d = 0;
      const off = y * W;
      for (let x = 0; x < W; x++) d += Math.abs(cur[off + x] - prv[off + x]);
      if (d / W < BAR_DIFF_MAX) rowCounts[y]++;
    }
    for (let x = 0; x < W; x++) {
      if (!prevColOk[x] || !curColOk[x]) continue;
      let d = 0;
      for (let y = 0; y < H; y++) d += Math.abs(cur[y * W + x] - prv[y * W + x]);
      if (d / H < BAR_DIFF_MAX) colCounts[x]++;
    }
    prevRowOk = curRowOk;
    prevColOk = curColOk;
  }

  const barRow = Array.from({ length: H }, (_, y) => rowCounts[y] / pairs >= BAR_HOLD_FRAC);
  const barCol = Array.from({ length: W }, (_, x) => colCounts[x] / pairs >= BAR_HOLD_FRAC);

  let top = 0;
  while (top < H && barRow[top]) top++;
  let bottom = 0;
  while (bottom < H - top && barRow[H - 1 - bottom]) bottom++;
  let left = 0;
  while (left < W && barCol[left]) left++;
  let right = 0;
  while (right < W - left && barCol[W - 1 - right]) right++;

  const minH = Math.max(3, Math.round(BAR_MIN_SHARE * H));
  const minW = Math.max(3, Math.round(BAR_MIN_SHARE * W));
  if (top < minH) top = 0;
  if (bottom < minH) bottom = 0;
  if (left < minW) left = 0;
  if (right < minW) right = 0;

  // A letterbox or pillarbox appears as an opposite pair (top+bottom or
  // left+right); a single-sided black margin (e.g. a widening dark side) stays.
  if (!top || !bottom) { top = 0; bottom = 0; }
  if (!left || !right) { left = 0; right = 0; }

  if (!top && !bottom && !left && !right) return null;
  const cw = (W - left - right) / W;
  const ch = (H - top - bottom) / H;
  if (cw < MIN_REMAINING || ch < MIN_REMAINING) return null;

  // When all four sides look bordered, skip centered dark-ground discs whose
  // bounding-box corners remain black and still across the shot.
  if (top && bottom && left && right) {
    const iw = W - left - right, ih = H - top - bottom;
    const cs = Math.max(2, Math.floor(Math.min(iw, ih) * 0.12));
    const corners = [
      [left, top], [W - right - cs, top],
      [left, H - bottom - cs], [W - right - cs, H - bottom - cs],
    ];
    let darkCorners = 0;
    for (const [cx, cy] of corners) {
      let maxMean = 0;
      for (let k = 0; k < n; k++) {
        const L = lums[k];
        let s = 0;
        for (let y = cy; y < cy + cs; y++) for (let x = cx; x < cx + cs; x++) s += L[y * W + x];
        const m = s / (cs * cs);
        if (m > maxMean) maxMean = m;
      }
      if (maxMean < BAR_LUMA_MAX) darkCorners++;
    }
    if (darkCorners >= 3) return null;
  }

  return {
    x: left / W,
    y: top / H,
    w: cw,
    h: ch,
    top: top / H,
    bottom: bottom / H,
    left: left / W,
    right: right / W,
  };
}

/**
 * Find title-card spans: consecutive samples that are still, mostly flat
 * ground with sharp text edges, and then gone (leaving active footage).
 */
export function detectTitleSpans(lums, W, H, rate, t0 = 0) {
  const n = lums.length;
  const isTitle = new Array(n).fill(false);
  if (n < 4 || W < 16 || H < 16) return { isTitle, spans: [] };

  const N = W * H;
  const diffMean = new Float64Array(n);
  const movedFrac = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const a = lums[k - 1], b = lums[k];
    let s = 0, mv = 0;
    for (let p = 0; p < N; p++) {
      const d = Math.abs(b[p] - a[p]);
      s += d;
      if (d > 0.03) mv++;
    }
    diffMean[k] = s / N;
    movedFrac[k] = mv / N;
  }

  const looksLikeTitle = new Array(n).fill(false);
  const hist = new Int32Array(16);
  const intN = Math.max(1, (W - 2) * (H - 2));
  for (let k = 0; k < n; k++) {
    const L = lums[k];
    hist.fill(0);
    for (let p = 0; p < N; p++) hist[Math.min(15, Math.max(0, Math.floor(L[p] * 16)))]++;
    let bestGround = 0;
    for (let b = 0; b < 15; b++) bestGround = Math.max(bestGround, hist[b] + hist[b + 1]);
    if (bestGround / N < TITLE_GROUND_SHARE_MIN) continue;

    let flat = 0, sharp = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const gx = (L[p + 1] - L[p - 1]) * 0.5;
        const gy = (L[p + W] - L[p - W]) * 0.5;
        const g = Math.hypot(gx, gy);
        if (g < 0.015) flat++;
        if (g > 0.12) sharp++;
      }
    }
    // Text/captions cross each scanline many times (letters), unlike a single solid shape.
    const rowStep = H >= 60 ? 2 : 1;
    let textRows = 0;
    for (let y = 1; y < H - 1; y += rowStep) {
      let crossings = 0, lastX = -10;
      const off = y * W;
      for (let x = 2; x < W - 2; x++) {
        if (Math.abs(L[off + x + 1] - L[off + x - 1]) > 0.12 && x - lastX >= 2) {
          crossings++;
          lastX = x;
        }
      }
      if (crossings >= 6) textRows++;
    }
    if (flat / intN >= TITLE_FLAT_FRAC_MIN && sharp / intN >= TITLE_EDGE_MIN && sharp / intN <= TITLE_EDGE_MAX && textRows >= Math.max(3, Math.floor((H / rowStep) * 0.03))) {
      looksLikeTitle[k] = true;
    }
  }

  // A sample is a static title frame if it has title-card structure AND stays
  // still relative to its predecessor or successor.
  const cand = new Array(n).fill(false);
  for (let k = 0; k < n; k++) {
    if (!looksLikeTitle[k]) continue;
    const stillPrev = k > 0 && diffMean[k] < TITLE_DIFF_MAX && movedFrac[k] < TITLE_MOVED_FRAC_MAX;
    const stillNext = k + 1 < n && diffMean[k + 1] < TITLE_DIFF_MAX && movedFrac[k + 1] < TITLE_MOVED_FRAC_MAX;
    if (stillPrev || stillNext) cand[k] = true;
  }

  // Group into spans of at least 0.4 s (min 2 samples), and require that
  // active non-title footage remains ("then gone").
  const minLen = Math.max(2, Math.round(0.4 * rate));
  const rawSpans = [];
  for (let k = 0; k < n; k++) {
    if (!cand[k]) continue;
    let e = k;
    while (e + 1 < n && cand[e + 1]) e++;
    if (e - k + 1 >= minLen) rawSpans.push([k, e]);
    k = e;
  }

  const totalTitle = rawSpans.reduce((s, [a, b]) => s + (b - a + 1), 0);
  if (!rawSpans.length || totalTitle >= 0.75 * n || n - totalTitle < Math.max(3, Math.round(0.5 * rate))) {
    return { isTitle, spans: [] };
  }

  // Verify the title span actually transitions into/from different content
  // (a stationary dark frame with a border isn't a title that is "then gone").
  const spans = [];
  for (const [s, e] of rawSpans) {
    const outNext = e + 1 < n && (diffMean[e + 1] >= 0.02 || movedFrac[e + 1] >= 0.04);
    const outPrev = s > 0 && (diffMean[s] >= 0.02 || movedFrac[s] >= 0.04);
    if (!outNext && !outPrev) continue;
    for (let k = s; k <= e; k++) isTitle[k] = true;
    spans.push({
      fromSample: s,
      toSample: e,
      from: t0 + s / rate,
      to: t0 + (e + 1) / rate,
    });
  }
  return { isTitle, spans };
}

/**
 * Detect still sharp-edged burnt-in overlays (logos, watermarks, captions)
 * while the rest of the frame moves. Returns `{ mask: Uint8Array | null, boxes }`.
 */
export function detectOverlays(frames, lums, isTitle, W, H) {
  const active = [];
  for (let k = 0; k < frames.length; k++) if (!isTitle[k]) active.push(k);
  if (active.length < 4 || W < 16 || H < 16) return { mask: null, boxes: [] };

  const N = W * H;
  const diffSum = new Float64Array(N);
  const stillCnt = new Int32Array(N);
  const meanRgb = new Float32Array(N * 3);
  let pairs = 0;

  for (let idx = 0; idx < active.length; idx++) {
    const px = frames[active[idx]].px ?? frames[active[idx]];
    for (let i = 0; i < N * 3; i++) meanRgb[i] += px[i] / 255;
    if (idx === 0 || active[idx] !== active[idx - 1] + 1) continue;
    const prev = frames[active[idx - 1]].px ?? frames[active[idx - 1]];
    pairs++;
    for (let p = 0, i = 0; p < N; p++, i += 3) {
      const d = (Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2])) / (3 * 255);
      diffSum[p] += d;
      if (d < 0.025) stillCnt[p]++;
    }
  }
  if (pairs < 3) return { mask: null, boxes: [] };
  for (let i = 0; i < N * 3; i++) meanRgb[i] /= active.length;

  const still = new Uint8Array(N);
  let movingPixels = 0;
  for (let p = 0; p < N; p++) {
    const sFrac = stillCnt[p] / pairs;
    const mDiff = diffSum[p] / pairs;
    if (sFrac >= OVERLAY_STILL_FRAC && mDiff < OVERLAY_DIFF_MAX) still[p] = 1;
    else if (sFrac < 0.75 || mDiff > 0.02) movingPixels++;
  }
  // If almost nothing moves, the whole shot is still — not an overlay over moving footage.
  if (movingPixels / N < 0.08) return { mask: null, boxes: [] };

  // A pixel is a seed if it is still AND has a sharp edge between two
  // still pixels (so a moving shape beside a still black/flat region never fires).
  const seed = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!still[p]) continue;
      const i = p * 3;
      let stillGrad = 0;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (!still[q]) continue;
        const qi = q * 3;
        const mg = Math.max(Math.abs(meanRgb[i] - meanRgb[qi]), Math.abs(meanRgb[i + 1] - meanRgb[qi + 1]), Math.abs(meanRgb[i + 2] - meanRgb[qi + 2]));
        if (mg > stillGrad) stillGrad = mg;
      }
      if (stillGrad > OVERLAY_EDGE_MIN) seed[p] = 1;
    }
  }

  // Flood-fill from edge seeds into any connected still, non-black interior
  // (so a solid opaque logo/badge wider than 8 px is masked whole, not just its rim).
  const filled = new Uint8Array(seed);
  const fstack = [];
  for (let p = 0; p < N; p++) if (seed[p]) fstack.push(p);
  while (fstack.length) {
    const p = fstack.pop();
    const x = p % W, y = (p - x) / W;
    for (const q of [x > 0 ? p - 1 : -1, x + 1 < W ? p + 1 : -1, y > 0 ? p - W : -1, y + 1 < H ? p + W : -1]) {
      if (q < 0 || filled[q] || !still[q]) continue;
      const qi = q * 3;
      const qLum = 0.2126 * meanRgb[qi] + 0.7152 * meanRgb[qi + 1] + 0.0722 * meanRgb[qi + 2];
      if (qLum > 0.12) { filled[q] = 1; fstack.push(q); }
    }
  }

  // Dilate by 4 px to bridge thin letter strokes and codec halos into one component.
  const dilate = (src, r) => {
    const tmp = new Uint8Array(N), out = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      let last = -r - 1;
      for (let x = 0; x < W; x++) {
        if (src[y * W + x]) last = x;
        if (x - last <= r) tmp[y * W + x] = 1;
      }
      last = W + r;
      for (let x = W - 1; x >= 0; x--) {
        if (src[y * W + x]) last = x;
        if (last - x <= r) tmp[y * W + x] = 1;
      }
    }
    for (let x = 0; x < W; x++) {
      let last = -r - 1;
      for (let y = 0; y < H; y++) {
        if (tmp[y * W + x]) last = y;
        if (y - last <= r) out[y * W + x] = 1;
      }
      last = H + r;
      for (let y = H - 1; y >= 0; y--) {
        if (tmp[y * W + x]) last = y;
        if (last - y <= r) out[y * W + x] = 1;
      }
    }
    return out;
  };

  // Bridge nearby still pixels (up to 2 px inside still regions + 1 px edge fringe)
  // without expanding the reported overlay box deep into moving background pixels.
  const bridged = dilate(filled, 2);
  for (let p = 0; p < N; p++) bridged[p] = bridged[p] && still[p] ? 1 : 0;
  const dilated = dilate(bridged, 1);
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const kept = new Uint8Array(N);
  const boxes = [];

  for (let s0 = 0; s0 < N; s0++) {
    if (!dilated[s0] || seen[s0]) continue;
    let top = 0; stack[top++] = s0; seen[s0] = 1;
    let seedsInComp = 0;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    const pts = [];
    while (top) {
      const p = stack[--top];
      pts.push(p);
      if (seed[p]) seedsInComp++;
      const x = p % W, y = (p - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (filled[p]) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
      if (x > 0 && dilated[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x + 1 < W && dilated[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && dilated[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
      if (y + 1 < H && dilated[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
    }
    if (seedsInComp < 12) continue;
    for (const p of pts) kept[p] = 1;
    if (bx1 < bx0) { bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
    boxes.push({
      x: bx0 / W,
      y: by0 / H,
      w: (bx1 - bx0 + 1) / W,
      h: (by1 - by0 + 1) / H,
    });
  }

  let keptCount = 0;
  for (let p = 0; p < N; p++) if (kept[p]) keptCount++;
  if (!keptCount || keptCount / N > OVERLAY_MAX_SHARE) return { mask: null, boxes: [] };
  return { mask: kept, boxes };
}

/**
 * 8-pixel blockiness: ratio of mean luminance step across 8 px block boundaries
 * to mean step between them. Near 1.0 on clean footage; > 1.25 when blocky.
 */
export function measureBlockiness(frames, W, H) {
  if (!frames?.length || W < 24 || H < 24) return 1.0;
  const step = Math.max(1, Math.floor(frames.length / 6));
  const ratios = [];
  for (let idx = 0; idx < frames.length && ratios.length < 6; idx += step) {
    const px = frames[idx].px ?? frames[idx];
    const lum = frameLuma(px, W, H);
    let bh = 0, ch = 0, ih = 0, cih = 0;
    let bv = 0, cv = 0, iv = 0, civ = 0;
    for (let y = 0; y < H; y++) {
      const off = y * W;
      for (let x = 1; x < W; x++) {
        const d = Math.abs(lum[off + x] - lum[off + x - 1]) * 255;
        if (x % 8 === 0) { bh += d; ch++; } else { ih += d; cih++; }
      }
    }
    for (let y = 1; y < H; y++) {
      const off = y * W;
      for (let x = 0; x < W; x++) {
        const d = Math.abs(lum[off + x] - lum[off - W + x]) * 255;
        if (y % 8 === 0) { bv += d; cv++; } else { iv += d; civ++; }
      }
    }
    const iMean = (ih / Math.max(1, cih)) + (iv / Math.max(1, civ));
    if (iMean < 0.35) continue;
    const bMean = (bh / Math.max(1, ch)) + (bv / Math.max(1, cv));
    ratios.push(bMean / iMean);
  }
  if (!ratios.length) return 1.0;
  ratios.sort((a, b) => a - b);
  return ratios[ratios.length >> 1];
}

/**
 * High-frequency cutoff of the 2D radial power spectrum (normalized to Nyquist,
 * 0..1): the wavenumber where 95% of non-DC radial power has arrived.
 */
export function measureCutoff(frames, W, H) {
  let S = 128;
  while (S > Math.min(W, H)) S >>= 1;
  if (!frames?.length || S < 32) return null;
  const step = Math.max(1, Math.floor(frames.length / 8));
  const cutoffs = [];
  const x0 = (W - S) >> 1, y0 = (H - S) >> 1;
  const half = S >> 1;
  const re = Array.from({ length: S }, () => new Float64Array(S));
  const im = Array.from({ length: S }, () => new Float64Array(S));
  const cr = new Float64Array(S), ci = new Float64Array(S);
  const bins = new Float64Array(half + 1);

  for (let idx = 0; idx < frames.length && cutoffs.length < 8; idx += step) {
    const px = frames[idx].px ?? frames[idx];
    let mean = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const p = ((y0 + y) * W + x0 + x) * 3;
        const v = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
        re[y][x] = v; im[y][x] = 0; mean += v;
      }
    }
    mean /= S * S;
    for (let y = 0; y < S; y++) {
      const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (S - 1));
      for (let x = 0; x < S; x++) {
        const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (S - 1));
        re[y][x] = (re[y][x] - mean) * wx * wy;
      }
    }
    for (let y = 0; y < S; y++) fft(re[y], im[y]);
    for (let x = 0; x < S; x++) {
      for (let y = 0; y < S; y++) { cr[y] = re[y][x]; ci[y] = im[y][x]; }
      fft(cr, ci);
      for (let y = 0; y < S; y++) { re[y][x] = cr[y]; im[y][x] = ci[y]; }
    }
    bins.fill(0);
    let tot = 0;
    for (let y = 0; y < S; y++) {
      const ky = y <= half ? y : y - S;
      for (let x = 0; x < S; x++) {
        const kx = x <= half ? x : x - S;
        const k = Math.round(Math.hypot(kx, ky));
        if (k >= 2 && k <= half) {
          const pw = re[y][x] ** 2 + im[y][x] ** 2;
          bins[k] += pw;
          tot += pw;
        }
      }
    }
    if (tot <= 1e-6) continue;
    let run = 0, k95 = half;
    for (let k = 2; k <= half; k++) {
      run += bins[k];
      if (run >= 0.95 * tot) { k95 = k; break; }
    }
    cutoffs.push(k95 / half);
  }
  if (!cutoffs.length) return null;
  cutoffs.sort((a, b) => a - b);
  return cutoffs[cutoffs.length >> 1];
}

/**
 * Bits per pixel per frame from ffprobe stream bitrate, ffmpeg probe line,
 * or file size over duration. Returns `null` if size/rate cannot be known.
 */
export function probeBitrate(file, pr, span, ff) {
  const [sw, sh] = String(pr?.stored ?? '').split('x').map(Number);
  const fps = pr?.fps || 30;
  if (!sw || !sh || !fps) return null;
  let bps = null;
  if (ff) {
    const ffprobe = ff.replace(/ffmpeg$/, 'ffprobe');
    try {
      const r = spawnSync(ffprobe, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=bit_rate', '-of', 'default=nw=1:nk=1', file,
      ], { encoding: 'utf8', timeout: 10_000 });
      const v = Number((r.stdout ?? '').trim());
      if (r.status === 0 && Number.isFinite(v) && v > 0) bps = v;
    } catch { /* ffprobe optional */ }
  }
  if (bps == null && pr?.raw) {
    const m = /bitrate:\s*(\d+)\s*kb\/s/i.exec(pr.raw);
    if (m) bps = Number(m[1]) * 1000;
  }
  if (bps == null) {
    const dur = pr?.duration ?? span;
    if (dur && dur > 0 && fs.existsSync(file)) {
      const bytes = fs.statSync(file).size;
      if (bytes > 0) bps = (bytes * 8) / dur;
    }
  }
  if (bps == null || !Number.isFinite(bps)) return null;
  return bps / (sw * sh * fps);
}

/**
 * Analyse decoded samples and file metadata for footage artefacts:
 * title cards, burnt-in overlays, blockiness, spectral cutoff, bpp,
 * and detail reliability.
 */
export function analyseFootage({ frames, W, H, rate, from, file, pr, span, crop, autocrop, optCrop, ff, nativeFrames }) {
  const lums = frames.map(f => frameLuma(f.px ?? f, W, H));
  const { isTitle, spans: titleSpans } = detectTitleSpans(lums, W, H, rate, from);
  const { mask: overlayMask, boxes: overlays } = detectOverlays(frames, lums, isTitle, W, H);

  const activeNative = nativeFrames?.length ? nativeFrames : frames.filter((_, k) => !isTitle[k]);
  const nW = nativeFrames?.length ? nativeFrames[0].W : W;
  const nH = nativeFrames?.length ? nativeFrames[0].H : H;
  const activeDown = frames.filter((_, k) => !isTitle[k]);
  const blockiness = measureBlockiness(activeNative.length ? activeNative : frames, nW, nH);
  const cutoff = measureCutoff(activeDown.length ? activeDown : frames, W, H);
  const bpp = probeBitrate(file, pr, span, ff);

  // Flag detail unreliable when clear blocking is visible OR bitrate is starved
  // alongside blocky/soft high frequencies. Sparse/dark sharp plates compress
  // to low bpp with zero blocking and high spectral cutoff and stay reliable.
  const severeBlocking = blockiness >= 1.30;
  const starvedLow = bpp != null && bpp < 0.015 && (blockiness >= 1.10 || (cutoff != null && cutoff < 0.50));
  const starvedMid = bpp != null && bpp < 0.045 && (blockiness >= 1.12 || (cutoff != null && cutoff < 0.42));
  const compressedSoft = severeBlocking || starvedLow || starvedMid;
  let detailOk = true;
  let detailReason = null;
  if (compressedSoft) {
    detailOk = false;
    detailReason = severeBlocking
      ? `blockiness ${blockiness.toFixed(2)} on 8 px grid`
      : `low bitrate (${bpp.toFixed(3)} bpp) with ${blockiness >= 1.10 ? `blockiness ${blockiness.toFixed(2)}` : `soft cutoff ${cutoff.toFixed(2)}`}`;
  }

  return {
    crop: crop ? { ...crop } : null,
    autocrop: autocrop ? { ...autocrop } : null,
    manualCrop: !!optCrop,
    overlays,
    overlayMask,
    titleSpans,
    isTitle,
    cameraShare: null,
    blockiness,
    cutoff,
    bpp,
    reliable: { detail: detailOk, reason: detailReason },
  };
}

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const pct = x => `${(x * 100).toFixed(0)}%`;

/** Format `## Footage` lines for `summary.md`. */
export function footageLines(ft) {
  if (!ft) return ['## Footage', '', 'clean'];
  const items = [];
  if (ft.autocrop) {
    const a = ft.autocrop;
    const sides = [
      a.top ? `top ${pct(a.top)}` : null,
      a.bottom ? `bottom ${pct(a.bottom)}` : null,
      a.left ? `left ${pct(a.left)}` : null,
      a.right ? `right ${pct(a.right)}` : null,
    ].filter(Boolean).join(', ');
    items.push(`- cropped black bars (${sides}) → crop ${a.x.toFixed(3)},${a.y.toFixed(3)},${a.w.toFixed(3)},${a.h.toFixed(3)}`);
  } else if (ft.manualCrop && ft.crop) {
    const c = ft.crop;
    items.push(`- manual crop: ${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}`);
  }
  if (ft.overlays?.length) {
    items.push(`- masked ${ft.overlays.length} still overlay${ft.overlays.length > 1 ? 's' : ''}: ${ft.overlays.map(b => `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.w.toFixed(2)}×${b.h.toFixed(2)})`).join('; ')}`);
  }
  if (ft.titleSpans?.length) {
    items.push(`- excluded ${ft.titleSpans.length} title span${ft.titleSpans.length > 1 ? 's' : ''}: ${ft.titleSpans.map(s => `${stamp(s.from)}–${stamp(s.to)}`).join(', ')}`);
  }
  if (ft.cameraShare != null && ft.cameraShare >= 0.15) {
    items.push(`- camera motion: ${pct(ft.cameraShare)} of total motion (global translation subtracted)`);
  }
  if (ft.reliable && ft.reliable.detail === false) {
    items.push(`- compression softness: detail measures unreliable (${ft.reliable.reason}; blockiness ${ft.blockiness?.toFixed(2) ?? '–'}, cutoff ${ft.cutoff?.toFixed(2) ?? '–'}${ft.bpp != null ? `, ${ft.bpp.toFixed(3)} bpp` : ''})`);
  }
  return ['## Footage', '', ...(items.length ? items : ['clean'])];
}

/** Strip non-serializable per-pixel/per-sample arrays before saving to design.json. */
export function footageOut(ft) {
  if (!ft) return null;
  const { overlayMask, isTitle, manualCrop, ...rest } = ft;
  return rest;
}
