// The structure and light read of a watched video or a still: what a frame is
// made of and where its light sits, as numbers (`npm run watch`, and on its
// own `node scripts/watchstructure.mjs <video or image>`).
//
// What was reported (the owner, 2026-11-28): sent three macro films of soap
// foam lit from the side, the watch tool came back with whole-frame
// statistics (palette, motion, one edge width, one detail slope, a count of
// bright blobs) and "didn't see a lot of the things in the images that make
// them different from our own generated ones, or things that would help us
// build simulated physics versions". Every word about cells, borders and
// specks in that thread had come from looking at stills, not from the tool,
// and the tool read a slow camera glide as a turning dish. The owner's own
// word for our takes beside his references was "sad illustrated versions".
//
// So this read segments a frame instead of summing it, and every measure
// names something a picture is built from, liquid or not:
//
//   cells      the regions borders enclose, found by a border strength at
//              four scales (a line's ridge or a step's gradient, whichever is
//              stronger) under Otsu's threshold with hysteresis. Whole cells a
//              frame, their size (equivalent diameter, % of width) and its
//              spread, sides per cell (mean and μ2, the variance: 0 for a
//              honeycomb, about 1 to 1.5 for a soap froth that has coarsened,
//              more for a random tiling), junctions (the share where three
//              meet, and how far their angles sit from 120°, Plateau's law for
//              films at equilibrium), border thickness against cell size and
//              the share of the frame the borders cover (a foam's wetness).
//   edges      profiles across the borders, each classed as a step (one
//              region to another), a line (one ridge or groove), a double line
//              (two walls with a gap, a meniscus seen from above) or a halo (a
//              line with an opposite-polarity fringe either side, defocus or a
//              lens edge), with the width of each and the spread of widths.
//   light      where the brightness sits: the dark-field index (border against
//              interior brightness, from -1 bright field to +1 dark field) and
//              the share of the light on borders over their share of the area;
//              the hue of interiors, of the walls and of the nodes where walls
//              meet; small white highlights (speculars) a frame; and the colour
//              fringe at edges (red against blue edge position along the
//              normal, signed outward from the centre, as a lens's lateral
//              chromatic aberration grows outward).
//   specks     a census of small round things by size, across octaves of the
//              scale-normalised Laplacian (blob detection, Lindeberg 1998),
//              bright and dark, with the ones much smaller than the cells
//              (satellites) and how they are arranged: Clark and Evans' ratio
//              (under 1 clumped, 1 random, over 1 even) and the share that sit
//              in chains (a dotted line or ring).
//   depth      the sharp and blurred layers and the motion layers
//              (`watchdepth.mjs`): how many focus layers, how blurred each is,
//              and whether the motion is the scene's own, a camera glide (with
//              parallax between near and far) or a turn.
//   illustrated  how drawn a frame looks: flat fills, one width of line, one
//              size of form, few octaves of detail, one focus layer. Each part
//              0 to 1 and the index their mean, with the parts printed so the
//              number can be argued with.
//
// Each still is read at a working width of 640 (`toWork`): what one pixel
// means is fixed, so a 4K take and a phone recording read alike, and every
// size is printed in % of the frame's width. Where the read cannot stand (too
// few cells to count sides, no edges strong enough for a fringe) it says so
// and prints a dash, never a guess.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toWork, blur, derivs, eig2, quantile, median, mean, cv, otsu, components, grow, distance, sample, hcv, savePng } from './watchimage.mjs';
import { sharpnessLayers, motionLayers, depthLines, poolFrame } from './watchdepth.mjs';
import { colourName } from './watchdesign.mjs';

const clamp01 = x => Math.max(0, Math.min(1, x));
const HUE_NAMES = ['red', 'orange', 'yellow', 'chartreuse', 'green', 'spring green', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'rose'];
const hueName = h => (h == null || h < 0 ? 'grey' : HUE_NAMES[Math.floor(((h + 15) % 360) / 30)]);

/**
 * Border strength at one scale σ: the stronger of a step's normalised
 * gradient σ|∇L| and a line's normalised ridge σ²|λ| (the Hessian's larger
 * eigenvalue), over the frame's luminance range. A step of height A reads
 * about 0.4 A at every scale and a line of contrast A about 0.3 to 0.5 A at
 * the scale matched to its width, so lines and steps of the same contrast
 * are found alike.
 */
function strengthAt(L, w, h, rng, s) {
  const S = new Float32Array(w * h), d = derivs(blur(L, w, h, s), w, h);
  for (let p = 0; p < w * h; p++) {
    const [l1] = eig2(d.xx[p], d.xy[p], d.yy[p]);
    S[p] = Math.max(s * Math.hypot(d.gx[p], d.gy[p]), s * s * Math.abs(l1)) / rng;
  }
  return S;
}

/**
 * Solidity (area over convex hull area) of each listed component, from its
 * rows' outer pixel corners: a foam's cells are convex polygons, and a region
 * a reflection or a missing wall has cut or joined is not.
 */
function solidity(reg, w, h, ks) {
  const box = new Map(ks.map(k => [k, { y0: h, y1: -1 }]));
  for (let p = 0; p < w * h; p++) { const b = box.get(reg.lab[p]); if (b) { const y = (p - (p % w)) / w; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; } }
  for (const b of box.values()) { b.mn = new Float64Array(b.y1 - b.y0 + 1).fill(Infinity); b.mx = new Float64Array(b.y1 - b.y0 + 1).fill(-Infinity); }
  for (let p = 0; p < w * h; p++) { const b = box.get(reg.lab[p]); if (b) { const x = p % w, r = (p - x) / w - b.y0; if (x < b.mn[r]) b.mn[r] = x; if (x > b.mx[r]) b.mx[r] = x; } }
  const out = new Map();
  for (const [k, b] of box) {
    const pts = [];
    for (let r = 0; r < b.mn.length; r++) if (b.mn[r] <= b.mx[r]) { const y = b.y0 + r; pts.push([b.mn[r] - 0.5, y - 0.5], [b.mn[r] - 0.5, y + 0.5], [b.mx[r] + 0.5, y - 0.5], [b.mx[r] + 0.5, y + 0.5]); }
    pts.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
    const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
    const lower = [], upper = [];
    for (const q of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    let a = 0;
    for (let i = 0; i < hull.length; i++) { const [x1, y1] = hull[i], [x2, y2] = hull[(i + 1) % hull.length]; a += x1 * y2 - x2 * y1; }
    out.set(k, Math.abs(a) / 2 > 0 ? reg.area[k] / (Math.abs(a) / 2) : 0);
  }
  return out;
}

/**
 * Borders and cells, by search. A macro film's cells hold reflections, rings
 * and specks as strong as their walls, so no one scale and no one threshold
 * finds the walls: at the finest scale under Otsu's threshold the first
 * version of this read covered 72% of a foam frame with "border" and cut its
 * cells into a hundred fragments. So the read tries the border strength over
 * three scale bands (finest σ 1, 2 or 4, each band four times its finest),
 * each at Otsu's threshold and one and a half and two and a half times it,
 * with hysteresis (weak pixels count where they join a strong one, so a wall
 * that fades along its length still closes its cell), and keeps the
 * segmentation whose convex whole cells (solidity 0.85 or more) cover the
 * most of the frame. Where nothing in the frame is a tiling of cells the best
 * of these still finds few, and the read says so.
 */
function segment(L, w, h, rng, base, minArea) {
  const maps = new Map(), at = s => { if (!maps.has(s)) maps.set(s, strengthAt(L, w, h, rng, Math.max(0.8, s * base))); return maps.get(s); };
  let best = null;
  const tryBorder = (border, how) => {
    // A bright reflection or a ring inside a cell is not a wall: border
    // pieces that touch no other region than one cell are filled into it.
    const bc = components(w, h, p => !!border[p]), first = components(w, h, p => !border[p]);
    const only = new Int32Array(bc.n + 1);
    for (let p = 0; p < w * h; p++) {
      const k = bc.lab[p]; if (!k || only[k] < 0) continue;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || border[q]) continue;
        const l = first.lab[q];
        if (!only[k]) only[k] = l; else if (only[k] !== l) { only[k] = -1; break; }
      }
    }
    for (let p = 0; p < w * h; p++) { const k = bc.lab[p]; if (k && !bc.touches[k] && only[k] > 0 && first.area[only[k]] >= minArea) border[p] = 0; }
    const reg = components(w, h, p => !border[p]);
    const ks = [];
    for (let k = 1; k <= reg.n; k++) if (reg.area[k] >= minArea && !reg.touches[k]) ks.push(k);
    const sol = solidity(reg, w, h, ks);
    // A tiling needs cells: one convex region a quarter of the frame or more
    // is the frame itself less a few marks, not a cell, and scored alone it
    // beat a whole honeycomb in the tests.
    let score = 0, cnt = 0;
    for (const k of ks) if (sol.get(k) >= 0.85 && reg.area[k] < 0.25 * w * h) { score += reg.area[k]; cnt++; }
    if (cnt < 3) score = 0;
    if (!best || score > best.score) best = { score, border, reg, how };
  };
  // Edges: border strength over a scale band, with hysteresis.
  for (const s0 of [1, 2, 4]) {
    const S = new Float32Array(w * h);
    for (const s of [s0, 2 * s0, 4 * s0]) { const M = at(s); for (let p = 0; p < w * h; p++) if (M[p] > S[p]) S[p] = M[p]; }
    const T0 = otsu(S, 0, quantile(S, 0.995) || 1);
    for (const m of [1, 1.5, 2.5]) {
      const T = T0 * m, weak = components(w, h, p => S[p] > 0.6 * T), strong = new Uint8Array(weak.n + 1);
      for (let p = 0; p < w * h; p++) if (S[p] > T) strong[weak.lab[p]] = 1;
      const border = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) if (weak.lab[p] && strong[weak.lab[p]]) border[p] = 1;
      tryBorder(border, `edges σ ${s0}, ${m}× Otsu`);
    }
  }
  // Phases: the brightness itself, smoothed so what is inside a cell melts
  // into it, cut at Otsu's threshold over the frame or against the local
  // mean four times wider, with the borders as the bright phase (dark field)
  // or the dark one (bright field).
  for (const sc of [2, 4, 8]) {
    const Lc = blur(L, w, h, sc * base), bg = blur(Lc, w, h, 4 * sc * base);
    const T = otsu(Lc, quantile(Lc, 0.005), quantile(Lc, 0.995));
    for (const pol of [1, -1]) for (const local of [false, true]) {
      const border = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) border[p] = pol * (Lc[p] - (local ? bg[p] : T)) > 0 ? 1 : 0;
      tryBorder(border, `${pol > 0 ? 'bright' : 'dark'} borders, σ ${sc}, ${local ? 'local' : 'Otsu'}`);
    }
  }
  return best;
}

/** Interior extrema of a 1-D profile with their prominence: [{ i, v, sign, prom }]. */
function extrema(p) {
  const out = [];
  for (let i = 1; i < p.length - 1; i++) {
    for (const sign of [1, -1]) {
      const c = sign * p[i];
      if (!(c > sign * p[i - 1] && c >= sign * p[i + 1])) continue;
      let lm = c, rm = c;
      for (let j = i - 1; j >= 0 && sign * p[j] <= c; j--) lm = Math.min(lm, sign * p[j]);
      for (let j = i + 1; j < p.length && sign * p[j] <= c; j++) rm = Math.min(rm, sign * p[j]);
      out.push({ i, v: p[i], sign, prom: c - Math.max(lm, rm) });
    }
  }
  return out;
}

/** Width at half height of the feature at index i (sign +1 a peak, -1 a trough) over a base level. */
function halfWidth(p, i, sign, baseLevel) {
  const half = baseLevel + (p[i] - baseLevel) / 2, above = v => sign * (v - half) > 0;
  let l = i, r = i;
  while (l > 0 && above(p[l - 1])) l--;
  while (r < p.length - 1 && above(p[r + 1])) r++;
  const fl = l > 0 ? (p[l] - half) / (p[l] - p[l - 1] || 1) : 0, fr = r < p.length - 1 ? (p[r] - half) / (p[r] - p[r + 1] || 1) : 0;
  return r - l + Math.max(0, Math.min(1, fl)) + Math.max(0, Math.min(1, fr));
}

/**
 * One profile across a border, classed. Prominent extrema are those standing
 * a quarter of the profile's range above what surrounds them; the ends are
 * the outer sixth each side. A step has none and ends that differ; a line has
 * one; a double line two of the same polarity with the opposite between them;
 * a halo one, with the profile dipping past both ends on either flank.
 * Widths: a line's full width at half height over its flanks, a double
 * line's from the outer half-height crossings, a step's 10 to 90% rise.
 */
export function classifyProfile(raw) {
  const n = raw.length, p = raw.map((v, i) => (raw[Math.max(0, i - 1)] + 2 * v + raw[Math.min(n - 1, i + 1)]) / 4);
  let mx = -Infinity, mn = Infinity;
  for (const v of p) { if (v > mx) mx = v; if (v < mn) mn = v; }
  const range = mx - mn;
  if (!(range > 0.03)) return null;
  const k = Math.max(2, Math.round(n / 6));
  const endL = p.slice(0, k).reduce((s, v) => s + v, 0) / k, endR = p.slice(n - k).reduce((s, v) => s + v, 0) / k;
  const ex = extrema(p).filter(e => e.prom >= 0.25 * range && e.i >= k / 2 && e.i <= n - 1 - k / 2);
  const step = Math.abs(endR - endL);
  if (!ex.length) {
    if (step < 0.5 * range) return null;
    const lo = Math.min(endL, endR), a = lo + 0.1 * step, b = lo + 0.9 * step, up = endR > endL;
    const cross = lvl => { for (let i = 1; i < n; i++) { const u = up ? p[i - 1] < lvl && p[i] >= lvl : p[i - 1] > lvl && p[i] <= lvl; if (u) return i - 1 + (lvl - p[i - 1]) / (p[i] - p[i - 1] || 1); } return null; };
    const ia = cross(up ? a : b), ib = cross(up ? b : a);
    return { type: 'step', width: ia != null && ib != null ? Math.abs(ib - ia) : null, range };
  }
  const main = ex.reduce((m, e) => (e.prom > m.prom ? e : m));
  const same = ex.filter(e => e.sign === main.sign).sort((a, b) => a.i - b.i);
  if (same.length >= 2) {
    // Two of one polarity: a double line when the opposite between the two
    // nearest the main one is itself prominent.
    const j = same.indexOf(main), other = same[j + 1] ?? same[j - 1];
    const [a, b] = main.i < other.i ? [main, other] : [other, main];
    const between = ex.find(e => e.sign !== main.sign && e.i > a.i && e.i < b.i);
    if (between) {
      const lvl = main.sign > 0 ? Math.min(endL, endR) : Math.max(endL, endR);
      const half = lvl + (Math.min(main.sign * a.v, main.sign * b.v) * main.sign - lvl) / 2;
      let l = a.i, r = b.i;
      while (l > 0 && main.sign * (p[l - 1] - half) > 0) l--;
      while (r < n - 1 && main.sign * (p[r + 1] - half) > 0) r++;
      return { type: 'double', width: r - l + 1, gap: b.i - a.i, polarity: main.sign, range };
    }
  }
  // One line. Its flanks: the opposite extreme between it and each end.
  const flankL = p.slice(0, main.i).reduce((m, v) => (main.sign > 0 ? Math.min(m, v) : Math.max(m, v)), p[0]);
  const flankR = p.slice(main.i + 1).reduce((m, v) => (main.sign > 0 ? Math.min(m, v) : Math.max(m, v)), p[n - 1]);
  const past = (f, e) => main.sign * (e - f) > 0.15 * range;
  const halo = past(flankL, endL) && past(flankR, endR);
  const baseLevel = main.sign > 0 ? Math.max(flankL, flankR) : Math.min(flankL, flankR);
  return { type: halo ? 'halo' : 'line', width: halfWidth(p, main.i, main.sign, baseLevel), polarity: main.sign, range };
}

/** Centroid along a profile of where a channel changes most (|d/ds|-weighted position). */
function edgeCentre(q) {
  let s = 0, sw = 0;
  for (let i = 1; i < q.length; i++) { const d = Math.abs(q[i] - q[i - 1]); s += d * (i - 0.5); sw += d; }
  return sw > 1e-4 ? s / sw : null;
}

/**
 * The read of one still (a working frame from `toWork`). Returns the
 * measures, and with `keep` the maps the overlay picture is drawn from.
 */
export function structureFrame(img, { keep = false } = {}) {
  const { w, h, L, R, G, B } = img, n = w * h, base = w / 640;
  const lo = quantile(L, 0.02), hi = quantile(L, 0.98), rng = Math.max(0.05, hi - lo);
  // Cells: what the borders enclose, at least 2.5% of the width across.
  const minArea = Math.max(24, Math.PI / 4 * (0.025 * w) ** 2);
  const { border, reg, how: segHow } = segment(L, w, h, rng, base, minArea);
  const cellOf = new Int32Array(reg.n + 1);
  const cells = [];
  for (let k = 1; k <= reg.n; k++) if (reg.area[k] >= minArea) { cells.push({ k, area: reg.area[k], edge: reg.touches[k], sx: 0, sy: 0 }); cellOf[k] = cells.length; }
  const lab = new Int32Array(n);
  for (let p = 0; p < n; p++) { const c = cellOf[reg.lab[p]]; if (c) { lab[p] = c; cells[c - 1].sx += p % w; cells[c - 1].sy += Math.floor(p / w); } }
  for (const c of cells) { c.cx = c.sx / c.area; c.cy = c.sy / c.area; c.diam = (Math.sqrt((4 * c.area) / Math.PI) / w) * 100; }
  const whole = cells.filter(c => !c.edge);
  const filled = cells.length ? grow(lab, w, h) : lab;

  // Borders between cells in the grown map: pair counts (sides), their pixels
  // (profiles), the boundary length (thickness).
  const pairs = new Map(), bpts = [];
  let crossings = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, a = filled[p];
    if (!a) continue;
    for (const q of [x < w - 1 ? p + 1 : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0) continue;
      const b = filled[q];
      if (!b || b === a) continue;
      crossings++;
      const key = Math.min(a, b) * 65536 + Math.max(a, b);
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      bpts.push(p);
    }
  }
  // A crossing counts once per pixel step across, so a line at angle θ is
  // counted |cos θ| + |sin θ| per unit length, 4/π on average.
  const length = crossings / (4 / Math.PI);
  let borderArea = 0;
  for (let p = 0; p < n; p++) borderArea += border[p];
  const thickPx = length > 0 ? borderArea / length : null;
  const nb = new Map();
  const minShared = Math.max(3, 3 * base);
  for (const [key, cnt] of pairs) {
    if (cnt < minShared) continue;
    const a = Math.floor(key / 65536), b = key % 65536;
    nb.set(a, (nb.get(a) ?? 0) + 1); nb.set(b, (nb.get(b) ?? 0) + 1);
  }
  const sides = whole.map(c => nb.get(cells.indexOf(c) + 1) ?? 0).filter(s => s >= 3);
  const sMean = sides.length ? sides.reduce((s, v) => s + v, 0) / sides.length : null;
  const mu2 = sides.length > 2 ? sides.reduce((s, v) => s + (v - sMean) ** 2, 0) / sides.length : null;

  // Junctions: where three or more cells meet in the grown map.
  const medDiamPx = whole.length ? (median(whole.map(c => c.diam)) / 100) * w : cells.length ? (median(cells.map(c => c.diam)) / 100) * w : 0;
  const rj = Math.max(3 * base, (thickPx ?? 2) * 0.75), ra = Math.max(6 * base, 0.3 * (medDiamPx / 2));
  const juncs = [];
  if (cells.length >= 3) {
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const p = y * w + x, s = new Set([filled[p], filled[p + 1], filled[p + w], filled[p + w + 1]]);
      s.delete(0);
      if (s.size < 3) continue;
      const near = juncs.find(j => (j.x - x) ** 2 + (j.y - y) ** 2 < (2 * rj) ** 2);
      if (!near) juncs.push({ x, y });
    }
  }
  const angles = [], degrees = [];
  for (const j of juncs) {
    const R2 = rj + 1 + ra;
    if (j.x < R2 || j.y < R2 || j.x > w - 1 - R2 || j.y > h - 1 - R2) continue;
    const labs = new Set();
    for (let y = Math.floor(j.y - rj - 2); y <= j.y + rj + 2; y++) for (let x = Math.floor(j.x - rj - 2); x <= j.x + rj + 2; x++) if ((x - j.x) ** 2 + (y - j.y) ** 2 <= (rj + 2) ** 2) labs.add(filled[y * w + x]);
    labs.delete(0);
    degrees.push(labs.size);
    if (labs.size !== 3) continue;
    const dir = new Map();
    for (let y = Math.floor(j.y - R2); y <= j.y + R2; y++) for (let x = Math.floor(j.x - R2); x <= j.x + R2; x++) {
      const r = Math.hypot(x - j.x, y - j.y);
      if (r < rj + 1 || r > R2) continue;
      const p = y * w + x, a = filled[p];
      for (const q of [p + 1, p + w]) {
        const b = filled[q];
        if (b === a || !labs.has(a) || !labs.has(b)) continue;
        const key = Math.min(a, b) * 65536 + Math.max(a, b), d = dir.get(key) ?? [0, 0];
        d[0] += (x - j.x) / r; d[1] += (y - j.y) / r; dir.set(key, d);
      }
    }
    if (dir.size !== 3) continue;
    const th = [...dir.values()].map(([dx, dy]) => Math.atan2(dy, dx)).sort((a, b) => a - b);
    for (let i = 0; i < 3; i++) angles.push(((th[(i + 1) % 3] - th[i] + 2 * Math.PI) % (2 * Math.PI)) * 180 / Math.PI);
  }
  const dev = angles.map(a => Math.abs(a - 120));

  // Profiles across the borders, a few hundred spread along them.
  const t = thickPx ?? 2, Rp = Math.round(Math.max(6 * base, t + 2)), win = Math.round(Math.max(6 * base, t / 2 + 4));
  const stride = Math.max(1, Math.floor(bpts.length / 300));
  const profiles = [], fringes = [];
  for (let s = 0; s < bpts.length; s += stride) {
    const p = bpts[s], x = p % w, y = (p - x) / w;
    if (x < Rp + win || y < Rp + win || x > w - 1 - Rp - win || y > h - 1 - Rp - win) continue;
    const a = filled[p], b = filled[p + 1] !== a ? filled[p + 1] : filled[p + w];
    let ax = 0, ay = 0, na = 0, bx = 0, by = 0, nbb = 0;
    for (let yy = y - win; yy <= y + win; yy++) for (let xx = x - win; xx <= x + win; xx++) {
      const l = lab[yy * w + xx];
      if (l === a) { ax += xx; ay += yy; na++; } else if (l === b) { bx += xx; by += yy; nbb++; }
    }
    if (!na || !nbb) continue;
    let nx = bx / nbb - ax / na, ny = by / nbb - ay / na;
    const nl = Math.hypot(nx, ny); if (!nl) continue;
    nx /= nl; ny /= nl;
    const cx = x + 0.5, cy = y + 0.5, LP = [], RP = [], BP = [];
    for (let i = -Rp; i <= Rp; i++) { const sx = cx + nx * i, sy = cy + ny * i; LP.push(sample(L, w, h, sx, sy)); RP.push(sample(R, w, h, sx, sy)); BP.push(sample(B, w, h, sx, sy)); }
    const c = classifyProfile(LP);
    if (!c) continue;
    profiles.push(c);
    // The fringe only on edges where red and blue both change, by amounts
    // within a factor of two: across an orange-to-black edge red changes and
    // blue hardly does, their centres differ by the colour, not the lens, and
    // the app's takes (no lens at all) read 2.7 px "outward" until this.
    const rr = Math.max(...RP) - Math.min(...RP), br = Math.max(...BP) - Math.min(...BP);
    if (c.range > 0.1 && rr > 0.08 && br > 0.08 && rr / br < 2 && br / rr < 2) {
      const cr = edgeCentre(RP), cb = edgeCentre(BP);
      if (cr != null && cb != null) {
        const rx = cx - w / 2, ry = cy - h / 2, rl = Math.hypot(rx, ry) || 1, out = (nx * rx + ny * ry) / rl;
        fringes.push({ abs: Math.abs(cr - cb), radial: Math.abs(out) > 0.3 ? (cr - cb) * Math.sign(out) : null, r: rl / (w / 2) });
      }
    }
  }
  const types = { step: 0, line: 0, double: 0, halo: 0 };
  for (const pr of profiles) types[pr.type]++;
  const widths = profiles.filter(pr => pr.width != null).map(pr => pr.width);
  const lineWidths = profiles.filter(pr => pr.type !== 'step' && pr.width != null).map(pr => pr.width);

  // Light against structure.
  const dIn = distance(w, h, p => !border[p]);
  const dB = distance(w, h, p => !!border[p]);
  let sb = 0, nbP = 0, si = 0, ni = 0, sAll = 0;
  const interior = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    sAll += L[p];
    if (border[p]) { sb += L[p]; nbP++; } else if (lab[p] && dIn[p] > 2 * base) { si += L[p]; ni++; interior[p] = 1; }
  }
  const Lb = nbP ? sb / nbP : null, Li = ni ? si / ni : null;
  const darkField = Lb != null && Li != null && Lb + Li > 0 ? (Lb - Li) / (Lb + Li) : null;
  const edgeLight = nbP && sAll > 0 ? (sb / sAll) / (nbP / n) : null;
  // Nodes: border pixels near a junction; walls: the rest of the border.
  const node = new Uint8Array(n), rn = Math.max(rj, t);
  for (const j of juncs) for (let y = Math.max(0, Math.floor(j.y - rn)); y <= Math.min(h - 1, j.y + rn); y++) for (let x = Math.max(0, Math.floor(j.x - rn)); x <= Math.min(w - 1, j.x + rn); x++) if (border[y * w + x] && (x - j.x) ** 2 + (y - j.y) ** 2 <= rn * rn) node[y * w + x] = 1;
  // Colour of a class of pixels: chroma-weighted hue over twelve 30° bins,
  // the two strongest with their shares (a border can be blue at its flanks
  // and pink at its core, and one mean hue would call it violet).
  const hueOf = sel => {
    const bins = new Float64Array(12);
    let sc = 0, cnt = 0, all = 0;
    for (let p = 0; p < n; p++) {
      if (!sel(p)) continue;
      all++;
      const [hh, c, v] = hcv(R[p], G[p], B[p]);
      if (hh < 0 || c < 0.08 || v < 0.1) continue;
      bins[Math.floor(((hh + 15) % 360) / 30)] += c; sc += c; cnt++;
    }
    if (!all) return null;
    if (cnt < 0.05 * all) return { hue: null, name: 'grey', top: [], chroma: cnt ? sc / cnt : 0, share: cnt / all };
    const top = [...bins.keys()].sort((a, b) => bins[b] - bins[a]).slice(0, 2).filter(i => bins[i] > 0.1 * sc).map(i => ({ name: HUE_NAMES[i], hue: i * 30, share: bins[i] / sc }));
    return { hue: top[0].hue, name: top[0].name, top, bins: [...bins].map(v => v / sc), chroma: sc / cnt, share: cnt / all };
  };
  const coreAt = Math.max(1.5, t / 4);
  const hues = { interiors: hueOf(p => interior[p]), flanks: hueOf(p => border[p] && !node[p] && dB[p] < coreAt), cores: hueOf(p => border[p] && !node[p] && dB[p] >= coreAt), nodes: hueOf(p => node[p]) };
  // Speculars: small, near white, much brighter than what is around them.
  const Ls = blur(L, w, h, 4 * base), hiL = Math.max(0.8, quantile(L, 0.995));
  const spec = components(w, h, p => L[p] >= hiL && L[p] - Ls[p] > 0.2 && hcv(R[p], G[p], B[p])[1] < 0.3);
  const specMax = (0.02 * w) ** 2;
  let speculars = 0;
  for (let k = 1; k <= spec.n; k++) if (spec.area[k] <= specMax) speculars++;

  // Specks: scale-normalised Laplacian extrema over octaves, round only.
  const sig = [1, 1.41, 2, 2.83, 4, 5.66, 8].map(s => Math.max(0.7, s * base));
  const lap = [], hes = [];
  for (const s of sig) {
    const d = derivs(blur(L, w, h, s), w, h), N = new Float32Array(n);
    for (let p = 0; p < n; p++) N[p] = s * s * (d.xx[p] + d.yy[p]);
    lap.push(N); hes.push(d);
  }
  // The walls' thickness, where there is a tiling to have walls.
  // Walls thinner than half a cell, that is: a field of discs reads as fat
  // "borders" round small "cells", and its ground holds the small dots.
  const tSp = whole.length >= 3 && thickPx != null && thickPx < 0.5 * medDiamPx ? t : 2;
  const specks = [];
  for (let k = 0; k < sig.length; k++) {
    const N = lap[k], tau = Math.max(0.12 * rng, 5 * (quantile(N.map(Math.abs), 0.5) ?? 0));
    const m = Math.ceil(2 * sig[k]);
    for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
      const p = y * w + x, v = N[p];
      if (Math.abs(v) < tau) continue;
      let best = true;
      for (let kk = Math.max(0, k - 1); kk <= Math.min(sig.length - 1, k + 1) && best; kk++) {
        for (let dy = -1; dy <= 1 && best; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (kk === k && !dx && !dy) continue;
          const u = lap[kk][p + dy * w + dx];
          if (Math.sign(u) === Math.sign(v) && Math.abs(u) > Math.abs(v)) { best = false; break; }
        }
      }
      if (!best) continue;
      const d = hes[k], [l1, l2] = eig2(d.xx[p], d.xy[p], d.yy[p]);
      if (Math.abs(l2) < 0.5 * Math.abs(l1) || Math.sign(l1) !== Math.sign(l2)) continue;
      specks.push({ x, y, d: (2 * Math.SQRT2 * sig[k] / w) * 100, bright: v < 0, v: Math.abs(v) });
    }
  }
  // One speck, one count: an extremum inside a stronger one of the same
  // polarity (the same dot found at two scales a pixel apart, or two dots
  // touching) is dropped. Without this 60 dots at random read as 66, and the
  // pairs pulled Clark and Evans' ratio to 0.74 as if they were clumped.
  specks.sort((a, b) => b.v - a.v);
  for (let i = 0; i < specks.length; i++) {
    const a = specks[i], ra = (a.d / 100) * w / 2;
    for (let j = 0; j < i; j++) { const b = specks[j]; if (b.drop || b.bright !== a.bright) continue; if (Math.hypot(a.x - b.x, a.y - b.y) < Math.max(ra, (b.d / 100) * w / 2)) { a.drop = true; break; } }
  }
  // Nor is the knot where three walls meet a speck: at the walls' own width a
  // Y of lines is as round to the Laplacian as a dot, and a drawn honeycomb
  // of 76 cells counted some two hundred "specks", one at every junction.
  // An extremum within a junction's radius and no wider than three walls is
  // the junction. (A real bubble sitting on a node is lost with it, which
  // costs a handful a frame against the hundreds a macro foam film holds.)
  // So is a wall that meets the frame's edge, a T under the blur's clamped
  // border. And the bright corner of a cell between two dark walls is as
  // round, six to a hexagon. All three are dropped, unless the extremum is a
  // "cell" of its own size: in a field of dots the dots segment as cells, and
  // the knots of the ground between them are not on the dots.
  const jr = Math.max(rj, tSp) + 2, em = 1.5 * tSp + 2;
  for (const sp of specks) {
    const c = lab[sp.y * w + sp.x], ownCell = c && cells[c - 1].diam < 3 * sp.d;
    if (sp.drop || ownCell || (sp.d / 100) * w >= 3 * tSp + 2) continue;
    if (sp.x < em || sp.y < em || sp.x > w - 1 - em || sp.y > h - 1 - em || juncs.some(j => (j.x - sp.x) ** 2 + (j.y - sp.y) ** 2 < jr * jr)) sp.drop = true;
  }
  for (let i = specks.length - 1; i >= 0; i--) if (specks[i].drop) specks.splice(i, 1);
  const BANDS = [0.5, 1, 2, 4, 8, Infinity], bandName = ['under 0.5%', '0.5–1%', '1–2%', '2–4%', '4–8%', 'over 8%'];
  const bands = BANDS.map(() => 0);
  for (const s of specks) bands[BANDS.findIndex(b => s.d < b)]++;
  const cellD = whole.length ? median(whole.map(c => c.diam)) : null;
  const satellites = specks.filter(s => s.d < (cellD ? 0.2 * cellD : 1)).length;
  const small = specks.filter(s => s.d < 2);
  let ce = null, chain = null;
  if (small.length >= 8) {
    const nn = [];
    let chained = 0;
    for (const a of small) {
      let d1 = Infinity, d2 = Infinity, b1 = null, b2 = null;
      for (const b of small) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = b; } else if (d < d2) { d2 = d; b2 = b; }
      }
      nn.push(d1);
      if (b2 && d2 < 1.5 * d1) {
        const ang = Math.acos(Math.max(-1, Math.min(1, ((b1.x - a.x) * (b2.x - a.x) + (b1.y - a.y) * (b2.y - a.y)) / (d1 * d2))));
        if (ang > (140 * Math.PI) / 180) chained++;
      }
    }
    ce = mean(nn) / (0.5 / Math.sqrt(small.length / n));
    chain = chained / small.length;
  }

  // Illustrated: flat lit fills, one width of line, one size of form, few octaves.
  const mL = blur(L, w, h, 2 * base), mL2 = blur(L.map(v => v * v), w, h, 2 * base);
  let lit = 0, flat = 0;
  for (let p = 0; p < n; p++) {
    if (L[p] < 0.08) continue;
    lit++;
    if (Math.sqrt(Math.max(0, mL2[p] - mL[p] * mL[p])) < 0.008) flat++;
  }
  const flatShare = lit ? flat / lit : null;
  const bandsHeld = bands.filter(b => b >= Math.max(2, 0.05 * specks.length)).length;

  const out = {
    w, h,
    cells: { whole: whole.length, partial: cells.length - whole.length, diam: cellD, diamCv: cv(whole.map(c => c.diam)), sides: sMean, mu2, sidesN: sides.length,
      junctions: degrees.length, threeWay: degrees.length ? degrees.filter(d => d === 3).length / degrees.length : null, angleDev: median(dev), angleN: angles.length,
      thick: thickPx != null && cells.length ? (thickPx / w) * 100 : null, thickOverCell: thickPx != null && cellD ? (thickPx / w) * 100 / cellD : null, borderShare: borderArea / n, seg: segHow },
    edges: { n: profiles.length, types: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, profiles.length ? v / profiles.length : null])),
      width: median(widths) != null ? (median(widths) / w) * 100 : null, widthP10: widths.length ? (quantile(widths, 0.1) / w) * 100 : null, widthP90: widths.length ? (quantile(widths, 0.9) / w) * 100 : null,
      lineCv: cv(lineWidths), widthCv: cv(widths) },
    light: { darkField, edgeLight, hues, speculars, fringe: fringes.length >= 5 ? { abs: (median(fringes.map(f => f.abs)) / w) * 100, absPx: median(fringes.map(f => f.abs)), radialPx: median(fringes.map(f => f.radial).filter(v => v != null)), n: fringes.length } : null },
    specks: { n: specks.length, bright: specks.filter(s => s.bright).length, bands: Object.fromEntries(bandName.map((b, i) => [b, bands[i]])), satellites, clarkEvans: ce, chain },
    flatShare, bandsHeld,
  };
  if (keep) out.maps = { border, lab, juncs, specks, cells };
  return out;
}

/**
 * Total variation distance between the hue histograms of the interiors and
 * the borders (flanks and cores together): 0 when the colour is the same
 * whatever the structure, 1 when the two share no hue.
 */
export function hueSplit(hues) {
  const i = hues?.interiors?.bins, parts = [hues?.flanks, hues?.cores].filter(x => x?.bins);
  if (!i || !parts.length) return null;
  const b = i.map((_, k) => parts.reduce((s, x) => s + x.bins[k], 0) / parts.length);
  return 0.5 * i.reduce((s, v, k) => s + Math.abs(v - b[k]), 0);
}

/**
 * The illustrated index: how drawn a frame looks, from six parts, each 0 to 1
 * (1 the drawn end): flat lit fills (the share of lit pixels with almost no
 * local variation), one width of line, one size of form, few octaves of
 * specks, few specks at all, and colour that ignores structure (the same hues
 * in the middles as on the borders, as a fill does, where light bent by a
 * real border takes another colour). Calibrated on 2026-11-28 against macro
 * foam films and the app's takes the owner called "sad illustrated versions"
 * of them (the films read 0.1 to 0.2, the takes 0.4 to 0.6); the focus layers
 * are printed beside it and kept out, since a sharp foam over a soft one and a
 * drawn halo both read as two layers of blur.
 */
export function illustrated({ flatShare, lineCv, diamCv, bandsHeld, specks, hueTv }) {
  const parts = {
    flat: flatShare == null ? null : clamp01((flatShare - 0.05) / 0.5),
    lineWidth: lineCv == null ? null : clamp01(1 - lineCv / 0.5),
    formSize: diamCv == null ? null : clamp01(1 - diamCv / 0.5),
    octaves: bandsHeld == null ? null : clamp01(1 - (bandsHeld - 1) / 4),
    fewSpecks: specks == null ? null : clamp01(1 - Math.log10(1 + specks) / Math.log10(201)),
    colourIgnoresStructure: hueTv == null ? null : clamp01(1 - hueTv / 0.4),
  };
  const v = Object.values(parts).filter(x => x != null);
  return { index: v.length >= 3 ? v.reduce((s, x) => s + x, 0) / v.length : null, parts };
}

const medOf = (frames, f) => median(frames.map(f).filter(v => v != null && Number.isFinite(v)));

/** Medians over the stills of every measure, the depth reads, and the illustrated index. */
export function structureSummary(frames, { layers = null, motion = null } = {}) {
  if (!frames.length) return null;
  const hueMed = key => {
    const hs = frames.map(f => f.light.hues[key]).filter(Boolean);
    if (!hs.length) return null;
    const acc = new Map();
    for (const x of hs) for (const t of x.top ?? []) acc.set(t.name, (acc.get(t.name) ?? 0) + t.share / hs.length);
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name, share]) => ({ name, hue: HUE_NAMES.indexOf(name) * 30, share }));
    const withBins = hs.filter(x => x.bins), bins = withBins.length ? withBins[0].bins.map((_, k) => withBins.reduce((t, x) => t + x.bins[k], 0) / withBins.length) : null;
    return top.length ? { hue: top[0].hue, name: top[0].name, top, bins, chroma: medOf(hs, x => x.chroma) } : { hue: null, name: 'grey', top: [], bins, chroma: medOf(hs, x => x.chroma) };
  };
  const s = {
    stills: frames.length, size: `${frames[0].w}x${frames[0].h}`,
    cells: Object.fromEntries(['whole', 'partial', 'diam', 'diamCv', 'sides', 'mu2', 'junctions', 'threeWay', 'angleDev', 'thick', 'thickOverCell', 'borderShare'].map(k => [k, medOf(frames, f => f.cells[k])])),
    edges: { n: medOf(frames, f => f.edges.n), types: Object.fromEntries(['step', 'line', 'double', 'halo'].map(k => [k, mean(frames.map(f => f.edges.types[k]))])),
      width: medOf(frames, f => f.edges.width), widthP10: medOf(frames, f => f.edges.widthP10), widthP90: medOf(frames, f => f.edges.widthP90), lineCv: medOf(frames, f => f.edges.lineCv) },
    light: { darkField: medOf(frames, f => f.light.darkField), edgeLight: medOf(frames, f => f.light.edgeLight), speculars: medOf(frames, f => f.light.speculars),
      hues: { interiors: hueMed('interiors'), flanks: hueMed('flanks'), cores: hueMed('cores'), nodes: hueMed('nodes') },
      fringe: frames.some(f => f.light.fringe) ? { abs: medOf(frames, f => f.light.fringe?.abs), absPx: medOf(frames, f => f.light.fringe?.absPx), radialPx: medOf(frames, f => f.light.fringe?.radialPx) } : null },
    specks: { n: medOf(frames, f => f.specks.n), bright: medOf(frames, f => f.specks.bright), satellites: medOf(frames, f => f.specks.satellites), clarkEvans: medOf(frames, f => f.specks.clarkEvans), chain: medOf(frames, f => f.specks.chain),
      bands: Object.fromEntries(Object.keys(frames[0].specks.bands).map(b => [b, medOf(frames, f => f.specks.bands[b])])) },
    layers, motion,
  };
  s.light.hueSplit = hueSplit(s.light.hues);
  s.illustrated = illustrated({ flatShare: medOf(frames, f => f.flatShare), lineCv: s.edges.lineCv, diamCv: s.cells.diamCv, bandsHeld: medOf(frames, f => f.bandsHeld), specks: s.specks.n, hueTv: s.light.hueSplit });
  return s;
}

const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pc = x => (x == null ? '–' : `${Math.round(x * 100)}%`);
const hueWords = x => (!x ? '–' : x.hue == null || !x.top?.length ? 'grey' : x.top.map(t => `${t.name} ${Math.round(t.share * 100)}%`).join(' + '));

/** The summary's section, in words with the numbers beside them. */
export function structureLines(s) {
  if (!s) return ['## Structure and light', '', '- not read: no still at a size the read needs (the source is under 360 pixels wide, or no frame decoded)'];
  const c = s.cells, e = s.edges, l = s.light, k = s.specks;
  const order = c.mu2 == null ? '' : c.mu2 < 0.3 ? ', ordered like a honeycomb' : c.mu2 < 1.8 ? ', the spread of a coarsened soap froth' : ', disordered';
  const plateau = c.angleDev == null ? '' : c.angleDev < 12 ? ' (Plateau\'s 120° holds)' : ' (off Plateau\'s 120°)';
  const df = l.darkField == null ? '' : l.darkField > 0.25 ? 'dark field: the light lives on the edges' : l.darkField < -0.25 ? 'bright field: the edges are darker than the middles' : 'even: edges and middles alike';
  const lines = [
    '## Structure and light',
    '',
    `Read on ${s.stills} still${s.stills === 1 ? '' : 's'} at ${s.size} (sizes in % of the frame's width).`,
    c.whole >= 3
      ? `- **cells**: ${f(c.whole, 0)} whole a frame (+${f(c.partial, 0)} cut by the edge), ${f(c.diam)}% across (spread ${f(c.diamCv, 2)}); ${c.whole >= 8 ? `${f(c.sides)} sides each (μ2 ${f(c.mu2, 2)}${order})` : 'too few whole cells for sides'}; ${c.junctions >= 4 ? `${pc(c.threeWay)} of ${f(c.junctions, 0)} junctions three-way, angles ${f(c.angleDev, 0)}° from 120° at the median${c.junctions >= 8 ? plateau : ' (too few junctions to call Plateau\'s law)'}` : 'too few junctions to read'}`
      : `- **cells**: ${f(c.whole, 0)} whole a frame: too few to read sizes, sides or junctions (the frame is not a tiling of cells, or its borders do not close)`,
    `- **borders**: ${f(c.thick, 2)}% thick, ${f(c.thickOverCell, 2)}× the cell size; they cover ${pc(c.borderShare)} of the frame`,
    `- **edges**: ${f(e.n, 0)} profiles: step ${pc(e.types.step)}, line ${pc(e.types.line)}, double line ${pc(e.types.double)}, halo ${pc(e.types.halo)}; width ${f(e.width, 2)}% (${f(e.widthP10, 2)} to ${f(e.widthP90, 2)}), line widths spread ${f(e.lineCv, 2)}`,
    `- **light**: dark-field index ${f(l.darkField, 2)}${df ? ` (${df})` : ''}; borders hold ${f(l.edgeLight, 2)}× their share of the light; ${f(l.speculars, 0)} specular highlights a frame`,
    `- **colour by structure** (chroma-weighted): interiors ${hueWords(l.hues.interiors)}; border flanks ${hueWords(l.hues.flanks)}; border cores ${hueWords(l.hues.cores)}; nodes where borders meet ${hueWords(l.hues.nodes)}; interiors and borders differ by ${f(l.hueSplit, 2)} (0 one colour throughout, 1 no hue shared)`,
    `- **colour fringe**: ${l.fringe ? `red and blue edges ${f(l.fringe.absPx, 2)} px apart at the median, ${f(l.fringe.radialPx, 2)} px outward (a lens's lateral aberration reads above about 0.3)` : 'no edges strong enough to read'}`,
    `- **specks**: ${f(k.n, 0)} a frame (${f(k.bright, 0)} bright), by size ${Object.entries(k.bands).map(([b, v]) => `${b} ${f(v, 0)}`).join(', ')}; ${f(k.satellites, 0)} satellites (under a fifth of a cell); arranged ${k.clarkEvans == null ? '–' : k.clarkEvans < 0.8 ? 'clumped' : k.clarkEvans > 1.25 ? 'evenly' : 'at random'} (Clark–Evans ${f(k.clarkEvans, 2)}), ${pc(k.chain)} in chains or rings`,
    ...depthLines(s.layers, s.motion),
    `- **illustrated index** ${f(s.illustrated.index, 2)} (0 photographic, 1 drawn): flat fills ${f(s.illustrated.parts.flat, 2)}, one line width ${f(s.illustrated.parts.lineWidth, 2)}, one form size ${f(s.illustrated.parts.formSize, 2)}, few octaves ${f(s.illustrated.parts.octaves, 2)}, few specks ${f(s.illustrated.parts.fewSpecks, 2)}, colour ignores structure ${f(s.illustrated.parts.colourIgnoresStructure, 2)}`,
  ];
  return lines;
}

/** The measures two reads are compared on: [key path, label, digits]. */
export const COMPARE = [
  ['cells.whole', 'whole cells a frame', 0], ['cells.diam', 'cell size (% width)', 1], ['cells.diamCv', 'cell size spread', 2], ['cells.mu2', 'sides μ2', 2], ['cells.angleDev', 'junction angle off 120° (°)', 0],
  ['cells.thickOverCell', 'border thickness / cell', 2], ['cells.borderShare', 'border share of frame', 2],
  ['edges.types.double', 'double-line edges', 2], ['edges.types.halo', 'halo edges', 2], ['edges.width', 'edge width (% width)', 2], ['edges.lineCv', 'line width spread', 2],
  ['light.darkField', 'dark-field index', 2], ['light.edgeLight', 'light on borders (× share)', 2], ['light.speculars', 'specular highlights', 0], ['light.fringe.radialPx', 'fringe outward (px)', 2], ['light.hueSplit', 'colour split by structure', 2],
  ['specks.n', 'specks a frame', 0], ['specks.satellites', 'satellites a frame', 0], ['specks.chain', 'specks in chains', 2],
  ['layers.count', 'focus layers', 0], ['layers.sharpShare', 'sharp share', 2], ['motion.parallax', 'parallax speed ratio', 2], ['illustrated.index', 'illustrated index', 2],
];
const at = (o, k) => k.split('.').reduce((v, p) => (v == null ? null : v[p]), o);

/** A side-by-side table of two reads. */
export function compareStructure(ref, cur, refName = 'the reference', curName = 'this') {
  const rows = [`| measure | ${refName} | ${curName} |`, '|---|---|---|'];
  for (const [k, label, d] of COMPARE) rows.push(`| ${label} | ${f(at(ref, k), d)} | ${f(at(cur, k), d)} |`);
  for (const key of ['interiors', 'flanks', 'cores', 'nodes']) rows.push(`| hue of ${key} | ${hueWords(ref?.light?.hues?.[key])} | ${hueWords(cur?.light?.hues?.[key])} |`);
  rows.push(`| motion | ${ref?.motion?.kind ?? '–'} | ${cur?.motion?.kind ?? '–'} |`);
  return rows;
}

/** The overlay: the still dimmed, borders white, cells tinted, junctions red, specks cyan. */
export function overlayPng(file, img, maps) {
  const { w, h, R, G, B } = img, rgb = Buffer.alloc(w * h * 3);
  const tint = k => [(k * 97) % 255, (k * 57 + 80) % 255, (k * 151 + 40) % 255];
  for (let p = 0; p < w * h; p++) {
    let r = R[p] * 140, g = G[p] * 140, b = B[p] * 140;
    if (maps.border[p]) { r = g = b = 235; } else if (maps.lab[p]) { const [tr, tg, tb] = tint(maps.lab[p]); r = r * 0.6 + tr * 0.4; g = g * 0.6 + tg * 0.4; b = b * 0.6 + tb * 0.4; }
    rgb[p * 3] = r; rgb[p * 3 + 1] = g; rgb[p * 3 + 2] = b;
  }
  const dot = (x, y, col, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || dx * dx + dy * dy > rad * rad) continue; const p = (yy * w + xx) * 3; rgb[p] = col[0]; rgb[p + 1] = col[1]; rgb[p + 2] = col[2]; } };
  for (const s of maps.specks) { const r = Math.max(1, Math.round((s.d / 100) * w / 2)); for (let a = 0; a < 24; a++) { const x = Math.round(s.x + r * Math.cos(a / 24 * 2 * Math.PI)), y = Math.round(s.y + r * Math.sin(a / 24 * 2 * Math.PI)); dot(x, y, [0, 230, 255], 0); } }
  for (const j of maps.juncs) dot(Math.round(j.x), Math.round(j.y), [255, 40, 40], 2);
  savePng(file, w, h, rgb);
}

/**
 * The read for a watch: `stills` are native-resolution frames ({ px, W, H },
 * the ones watch.mjs decodes for its footage checks), `lum` the pooled
 * luminance samples its physics read keeps ({ w, h, d }), `rate` their rate,
 * `cut[k]` true where sample k starts a shot. Writes structure.png (the
 * overlay of the first still) into `out` when given. With `physics` (the
 * physics read's summary) it marks the motion's kind there, so the physics
 * read's rotation line can say a glide is not a turn.
 */
export function structureRead(stills, { lum = null, rate = 10, cut = null, physics = null, out = null } = {}) {
  const frames = [], imgs = [];
  for (const s of stills ?? []) { const img = toWork(s.px, s.W, s.H); imgs.push(img); frames.push(structureFrame(img, { keep: !frames.length && !!out })); }
  const layers = imgs.length ? sharpnessLayers(imgs) : null;
  const motion = lum?.length > 2 ? motionLayers(lum, { rate, cut }) : null;
  if (physics && motion) physics.motionKind = motion.kind;
  const sum = frames.length ? structureSummary(frames, { layers, motion }) : null;
  if (out && frames[0]?.maps) { overlayPng(path.join(out, 'structure.png'), imgs[0], frames[0].maps); delete frames[0].maps; }
  return { ...(sum ?? { stills: 0, motion }), lines: structureLines(sum && { ...sum, motion }) };
}

// ─── on its own: node scripts/watchstructure.mjs <video or image> … ──────────

const IMAGE = /\.(png|jpe?g|webp|bmp|tiff?)$/i;

function probe(ff, file) {
  const r = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(r.stderr ?? ''), d = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr ?? '');
  return { W: m ? +m[1] : null, H: m ? +m[2] : null, dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null };
}

function grab(ff, file, vf, args = []) {
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', ...args, '-i', file, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 30 });
  return r.status === 0 ? r.stdout : null;
}

/**
 * Read a file: `stills` frames spread over the clip (one for an image) at up
 * to 1280 wide, and for a video the luminance samples the motion read needs,
 * 10 a second at 320 wide pooled to 160, as watch.mjs keeps them.
 */
export function readFile(file, { ff = process.env.FFMPEG || 'ffmpeg', crop = null, stills = 6, from = 0, to = null, out = null } = {}) {
  const pr = probe(ff, file);
  if (!pr.W) throw new Error(`no video stream in ${file}`);
  const cw = crop ? Math.round(pr.W * crop[2] / 2) * 2 : pr.W, ch = crop ? Math.round(pr.H * crop[3] / 2) * 2 : pr.H;
  const cf = crop ? `crop=${cw}:${ch}:${Math.round(pr.W * crop[0])}:${Math.round(pr.H * crop[1])},` : '';
  const sw = Math.min(1280, cw), sh = Math.round(ch * sw / cw / 2) * 2;
  const frames = [];
  const isImage = IMAGE.test(file) || !pr.dur || pr.dur < 0.2;
  const end = Math.min(pr.dur ?? 0, to ?? Infinity);
  const times = isImage ? [null] : Array.from({ length: stills }, (_, i) => from + ((i + 0.5) / stills) * (end - from));
  for (const t of times) {
    const buf = grab(ff, file, `${cf}scale=${sw}:${sh}:flags=area`, t == null ? [] : ['-ss', String(t)]);
    if (buf && buf.length >= sw * sh * 3) frames.push({ px: buf.subarray(0, sw * sh * 3), W: sw, H: sh });
  }
  let lum = null, cut = null;
  if (!isImage) {
    const lw = 320, lh = Math.round(ch * lw / cw / 2) * 2, span = Math.min(20, end - from);
    const buf = grab(ff, file, `${cf}fps=10,scale=${lw}:${lh}:flags=area`, ['-ss', String(from), '-t', String(span)]);
    if (buf) {
      lum = [];
      for (let o = 0; o + lw * lh * 3 <= buf.length; o += lw * lh * 3) lum.push(poolFrame(buf.subarray(o, o + lw * lh * 3), lw, lh, 2));
      cut = lum.map(() => false);
    }
  }
  return structureRead(frames, { lum, rate: 10, cut, out });
}

const main = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const args = process.argv.slice(2), files = [], opt = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opt.out = args[++i];
    else if (a === '--vs') opt.vs = args[++i];
    else if (a === '--crop') opt.crop = args[++i].split(',').map(Number);
    else if (a === '--from') opt.from = +args[++i];
    else if (a === '--to') opt.to = +args[++i];
    else if (a === '--stills') opt.stills = +args[++i];
    else if (a === '--json') opt.json = true;
    else if (a === '-h' || a === '--help') { files.length = 0; opt.help = true; break; }
    else files.push(a);
  }
  if (opt.help || !files.length) {
    console.log('usage: node scripts/watchstructure.mjs <video or image> [--crop x,y,w,h] [--from s] [--to s] [--stills n] [--out dir] [--vs structure.json|design.json|dir] [--json]\n\nThe structure and light read on its own: cells and borders, edge profiles, light against structure, focus and motion layers, specks, and the illustrated index. --out writes structure.json and structure.png (the overlay) there; --vs prints a table against an earlier read.');
    process.exit(files.length ? 0 : 2);
  }
  const res = [];
  for (const file of files) {
    const out = opt.out ? (files.length > 1 ? path.join(opt.out, path.basename(file).replace(/\.[^.]+$/, '')) : opt.out) : null;
    if (out) fs.mkdirSync(out, { recursive: true });
    const r = readFile(file, { ...opt, out });
    res.push([file, r]);
    if (out) fs.writeFileSync(path.join(out, 'structure.json'), JSON.stringify({ file: path.basename(file), ...r }, null, 1) + '\n');
    if (!opt.json) console.log([`# ${path.basename(file)}`, '', ...r.lines, ...(out ? ['', `- ${path.join(out, 'structure.png')} (borders white, cells tinted, junctions red, specks cyan)`] : []), ''].join('\n'));
  }
  if (opt.vs) {
    let vf = opt.vs;
    if (fs.existsSync(vf) && fs.statSync(vf).isDirectory()) vf = ['structure.json', 'design.json'].map(x => path.join(opt.vs, x)).find(fs.existsSync) ?? vf;
    const doc = JSON.parse(fs.readFileSync(vf, 'utf8')), ref = doc.structure ?? doc;
    console.log(['## Against ' + (doc.title ?? doc.file ?? path.basename(opt.vs)), '', ...compareStructure(ref, res[0][1], doc.title ?? doc.file ?? 'the reference', path.basename(res[0][0]))].join('\n'));
  } else if (res.length === 2) {
    console.log(['## Side by side', '', ...compareStructure(res[0][1], res[1][1], path.basename(res[0][0]), path.basename(res[1][0]))].join('\n'));
  }
  if (opt.json) console.log(JSON.stringify(res.map(([file, r]) => ({ file, ...r, lines: undefined })), null, 1));
}
