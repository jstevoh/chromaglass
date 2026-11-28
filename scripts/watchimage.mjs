// Image plumbing for the structure and light read (`watchstructure.mjs`,
// `watchdepth.mjs`): a frame brought to a working size, Gaussian blur,
// derivatives, labels, a distance transform and a PNG writer. Plain loops
// over typed arrays and nothing but node, like the rest of the watch tool.
//
// Why a module of its own: the two reads share every one of these, and the
// watch tool's older modules each carry their own small copy of a blur or a
// pool tuned to their one use (watchphysics.mjs pools luminance by whole
// pixels for the flow's block search). These work in floats on any size, and
// the structure read's tests hold them to known answers before the measures
// built on them are trusted.

import zlib from 'node:zlib';
import fs from 'node:fs';

/**
 * A frame (RGB24, W×H) as floats at a working width of at most `maxW`:
 * { w, h, R, G, B, L, scale } with L the Rec. 709 luminance of the 8-bit
 * values (0 to 1) and scale the source pixels per working pixel. Each
 * working pixel is the mean of the source pixels it covers, so a 4K take and
 * a 640-wide one are read at the same size, and the small specks a phone's
 * 1206-wide recording holds are kept as a smaller contrast, not dropped.
 */
export function toWork(px, W, H, maxW = 640) {
  const w = Math.min(W, maxW), s = W / w, h = Math.max(1, Math.round(H / s));
  const R = new Float32Array(w * h), G = new Float32Array(w * h), B = new Float32Array(w * h), L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * s), y1 = Math.max(y0 + 1, Math.min(H, Math.floor((y + 1) * s)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * s), x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) * s)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const p = (yy * W + xx) * 3;
        r += px[p]; g += px[p + 1]; b += px[p + 2]; n++;
      }
      const q = y * w + x;
      R[q] = r / n / 255; G[q] = g / n / 255; B[q] = b / n / 255;
      L[q] = 0.2126 * R[q] + 0.7152 * G[q] + 0.0722 * B[q];
    }
  }
  return { w, h, R, G, B, L, scale: s };
}

/** Separable Gaussian blur, edges clamped. */
export function blur(src, w, h, sigma) {
  if (!(sigma > 0.3)) return Float32Array.from(src);
  const r = Math.ceil(3 * sigma), k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = s;
  }
  return out;
}

/** Central-difference derivatives of a (blurred) image: { gx, gy, xx, yy, xy }. */
export function derivs(I, w, h) {
  const n = w * h, gx = new Float32Array(n), gy = new Float32Array(n), xx = new Float32Array(n), yy = new Float32Array(n), xy = new Float32Array(n);
  const at = (x, y) => I[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, c = I[p];
    gx[p] = (at(x + 1, y) - at(x - 1, y)) / 2;
    gy[p] = (at(x, y + 1) - at(x, y - 1)) / 2;
    xx[p] = at(x + 1, y) - 2 * c + at(x - 1, y);
    yy[p] = at(x, y + 1) - 2 * c + at(x, y - 1);
    xy[p] = (at(x + 1, y + 1) - at(x - 1, y + 1) - at(x + 1, y - 1) + at(x - 1, y - 1)) / 4;
  }
  return { gx, gy, xx, yy, xy };
}

/** Eigenvalues of the 2×2 symmetric [[a, b], [b, c]], larger magnitude first. */
export function eig2(a, b, c) {
  const m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const l1 = m + d, l2 = m - d;
  return Math.abs(l1) >= Math.abs(l2) ? [l1, l2] : [l2, l1];
}

/** Quantile of the finite values of an array (copied, sorted). */
export function quantile(a, p) {
  const s = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null;
}

export const median = a => quantile(a, 0.5);
export const mean = a => { let s = 0, n = 0; for (const v of a) if (Number.isFinite(v)) { s += v; n++; } return n ? s / n : null; };
/** Coefficient of variation (sd over mean) of the finite values. */
export function cv(a) {
  const v = Array.from(a).filter(Number.isFinite);
  if (v.length < 2) return null;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  if (!(m > 0)) return null;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / m;
}

/** Otsu's threshold over values in [lo, hi] (256 bins). */
export function otsu(v, lo, hi) {
  const bins = new Float64Array(256), span = hi - lo || 1;
  let n = 0;
  for (const x of v) { if (!Number.isFinite(x)) continue; bins[Math.min(255, Math.max(0, Math.floor(((x - lo) / span) * 256)))]++; n++; }
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * bins[i];
  let wB = 0, sumB = 0, best = 0, at = 128;
  for (let i = 0; i < 256; i++) {
    wB += bins[i]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += i * bins[i];
    const d = sumB / wB - (sumAll - sumB) / wF, between = wB * wF * d * d;
    if (between > best) { best = between; at = i; }
  }
  return lo + ((at + 1) / 256) * span;
}

/**
 * Connected components (4-neighbour) of the pixels where `on(p)` holds:
 * { lab: Int32Array (0 = none, 1.. = component), n, area: [], touches: [] }
 * with touches[k] true when component k reaches the frame's edge.
 */
export function components(w, h, on) {
  const lab = new Int32Array(w * h), area = [0], touches = [false], stack = new Int32Array(w * h);
  let n = 0;
  for (let p0 = 0; p0 < w * h; p0++) {
    if (lab[p0] || !on(p0)) continue;
    n++; let top = 0, a = 0, t = false;
    stack[top++] = p0; lab[p0] = n;
    while (top) {
      const p = stack[--top], x = p % w, y = (p - x) / w;
      a++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) t = true;
      if (x > 0 && !lab[p - 1] && on(p - 1)) { lab[p - 1] = n; stack[top++] = p - 1; }
      if (x < w - 1 && !lab[p + 1] && on(p + 1)) { lab[p + 1] = n; stack[top++] = p + 1; }
      if (y > 0 && !lab[p - w] && on(p - w)) { lab[p - w] = n; stack[top++] = p - w; }
      if (y < h - 1 && !lab[p + w] && on(p + w)) { lab[p + w] = n; stack[top++] = p + w; }
    }
    area.push(a); touches.push(t);
  }
  return { lab, n, area, touches };
}

/**
 * Every pixel given the label of the nearest labelled pixel, by a breadth-first
 * growth from all of them at once (4-neighbour). Where two cells' growths meet
 * is the middle of the border between them, which is all the sides, junctions
 * and border profiles need.
 */
export function grow(lab, w, h) {
  const out = Int32Array.from(lab), q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let p = 0; p < w * h; p++) if (out[p]) q[tail++] = p;
  while (head < tail) {
    const p = q[head++], x = p % w, l = out[p];
    if (x > 0 && !out[p - 1]) { out[p - 1] = l; q[tail++] = p - 1; }
    if (x < w - 1 && !out[p + 1]) { out[p + 1] = l; q[tail++] = p + 1; }
    if (p >= w && !out[p - w]) { out[p - w] = l; q[tail++] = p - w; }
    if (p < w * (h - 1) && !out[p + w]) { out[p + w] = l; q[tail++] = p + w; }
  }
  return out;
}

/** Chamfer (3-4) distance from each `on` pixel to the nearest off pixel, in pixels. */
export function distance(w, h, on) {
  const BIG = 1e9, d = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) d[p] = on(p) ? BIG : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!d[p]) continue;
    let v = d[p];
    if (x > 0) v = Math.min(v, d[p - 1] + 3);
    if (y > 0) { v = Math.min(v, d[p - w] + 3); if (x > 0) v = Math.min(v, d[p - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[p - w + 1] + 4); }
    d[p] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const p = y * w + x; if (!d[p]) continue;
    let v = d[p];
    if (x < w - 1) v = Math.min(v, d[p + 1] + 3);
    if (y < h - 1) { v = Math.min(v, d[p + w] + 3); if (x < w - 1) v = Math.min(v, d[p + w + 1] + 4); if (x > 0) v = Math.min(v, d[p + w - 1] + 4); }
    d[p] = v;
  }
  for (let p = 0; p < w * h; p++) d[p] = d[p] >= BIG ? Math.max(w, h) : d[p] / 3;
  return d;
}

/** Bilinear sample of a float image. */
export function sample(I, w, h, x, y) {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, p = y0 * w + x0;
  return I[p] * (1 - fx) * (1 - fy) + I[p + 1] * fx * (1 - fy) + I[p + w] * (1 - fx) * fy + I[p + w + 1] * fx * fy;
}

/** Hue (degrees, -1 for grey), chroma (max − min) and value of an RGB triple in 0..1. */
export function hcv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c <= 1e-6) return [-1, 0, mx];
  let hh = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return [(hh * 60 + 360) % 360, c, mx];
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

/** Write an RGB24 buffer as a PNG. */
export function savePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy ? rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3) : raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
