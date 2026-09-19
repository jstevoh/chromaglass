/**
 * Shapes for the brand art: organic blobs, smooth curves through points, and
 * ribbons that taper along those curves.
 *
 * Everything takes a seed, so the art comes out identical on every run and a
 * change to it is always a change somebody made.
 */

export const r1 = (n) => Math.round(n * 10) / 10;

/** mulberry32: small, fast, and the same numbers on every machine. */
export function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A closed Catmull-Rom curve through the points, as cubic Béziers. */
export function closedPath(pts) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${r1(p1[1] + (p2[1] - p0[1]) / 6)} `
      + `${r1(p2[0] - (p3[0] - p1[0]) / 6)},${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])},${r1(p2[1])}`;
  }
  return d + 'Z';
}

/** A drop of liquid: a circle whose radius wobbles with a few low harmonics. */
export function blob({ cx, cy, r, sx = 1, sy = 1, rot = 0, amp = 0.06, seed = 1, n = 18 }) {
  const R = rng(seed);
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  const a = rot * Math.PI / 180;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    const k = 1 + amp * (Math.sin(2 * t + ph[0]) * 0.6 + Math.sin(3 * t + ph[1]) * 0.3 + Math.sin(5 * t + ph[2]) * 0.1);
    const x = Math.cos(t) * r * k * sx, y = Math.sin(t) * r * k * sy;
    pts.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
  }
  return closedPath(pts);
}

/** An open Catmull-Rom curve through the points, sampled evenly in parameter. */
export function spline(P, samples) {
  const out = [];
  const m = P.length - 1;
  for (let s = 0; s <= samples; s++) {
    const g = s / samples * m;
    const i = Math.min(m - 1, Math.floor(g));
    const u = g - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(m, i + 2)];
    out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u)));
  }
  return out;
}

/**
 * A ribbon along a sampled curve: `width(s)` for s from 0 to 1, and `shift(s)`
 * to slide it sideways — which is how a thin bright filament is laid along
 * one edge of a wider stream.
 */
export function ribbon(Q, width, shift = () => 0) {
  const L = [], R = [];
  for (let i = 0; i < Q.length; i++) {
    const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const s = i / (Q.length - 1);
    const w = width(s) / 2, o = shift(s);
    const cx = Q[i][0] - ty * o, cy = Q[i][1] + tx * o;
    L.push([cx - ty * w, cy + tx * w]);
    R.push([cx + ty * w, cy - tx * w]);
  }
  return 'M' + [...L, ...R.reverse()].map(p => `${r1(p[0])},${r1(p[1])}`).join('L') + 'Z';
}

const stops = (s) => s.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}"${op === 1 ? '' : ` stop-opacity="${op}"`}/>`).join('');
export const radial = (id, s, attrs = '') => `<radialGradient id="${id}" ${attrs}>${stops(s)}</radialGradient>`;
export const linear = (id, [x1, y1, x2, y2], s) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}">${stops(s)}</linearGradient>`;
export const blur = (id, sd) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
