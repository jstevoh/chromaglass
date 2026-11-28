#!/usr/bin/env node
/**
 * `npm run watchstructure`: the structure and light read (watchstructure.mjs,
 * watchdepth.mjs) held to pictures whose answers are known by construction.
 *
 * Why this exists (the owner, 2026-11-28): the watch tool read three macro
 * foam films as whole-frame statistics and missed what made them look real
 * (cells, double-walled borders, light on the edges, a sharp foam over a
 * blurred one, satellite bubbles), and the eye that supplied those words is
 * the thing a measure is meant to replace. So every measure here is built on
 * a picture drawn to hold a known answer, and each answer is chosen so the
 * obvious wrong measure fails it:
 *
 * - a honeycomb and a random Voronoi tiling with the same walls: both have
 *   six sides on average (Euler), so the mean alone proves nothing; the
 *   honeycomb's μ2 is 0 and its junctions sit at 120°, the random tiling's
 *   do not. A read that cannot tell them apart cannot check Plateau's law.
 * - the same honeycomb lit both ways: bright walls on dark cells (dark field)
 *   and dark walls on light cells (bright field) must read opposite signs.
 * - walls pink at their core and blue at their flanks: the hue by structure
 *   must find both, where a mean hue would call the wall violet.
 * - profiles of a step, a line, a double line and a halo, each with a known
 *   width.
 * - planted highlights, a planted lateral colour fringe and none.
 * - specks of three known sizes and counts; dots on a ring against dots at
 *   random.
 * - a texture half sharp and half blurred (two focus layers) against one all
 *   sharp; a picture drawn flat against one with depth, grain and specks.
 * - motion: a glide with a near layer at 2.5 times the far one, a glide over
 *   a tilted scene (speed growing down the frame, the trap that read as a
 *   turn: its shear is half rotation by arithmetic), a true turn of known
 *   period and sense, and a still frame.
 * - and the watch itself: a clip of foam through `watchVideo` carries the
 *   section in summary.md and the read in design.json.
 *
 * Nothing but node and ffmpeg (for the last). About a minute and a half.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { structureFrame, structureSummary, classifyProfile, illustrated, hueSplit } from './watchstructure.mjs';
import { sharpnessLayers, motionLayers } from './watchdepth.mjs';
import { toWork, blur } from './watchimage.mjs';

let fails = 0, oks = 0;
const ok = (cond, msg) => { if (cond) { oks++; console.log(`ok    ${msg}`); } else { fails++; console.log(`FAIL  ${msg}`); } };
const f2 = x => (x == null ? '–' : Number(x).toFixed(2));

// A seeded generator, so every run draws the same pictures.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const W = 640, H = 480;
const img = (fn, w = W, h = H) => { const px = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const p = (y * w + x) * 3; px[p] = Math.max(0, Math.min(255, r)); px[p + 1] = Math.max(0, Math.min(255, g)); px[p + 2] = Math.max(0, Math.min(255, b)); } return toWork(px, w, h); };

// Seeds of a honeycomb (cells `a` across flat to flat) or at random.
const hexSeeds = a => { const s = []; for (let j = -1; j * a * Math.sqrt(3) / 2 < H + a; j++) for (let i = -1; i * a < W + a; i++) s.push([i * a + (j % 2 ? a / 2 : 0), j * a * Math.sqrt(3) / 2]); return s; };
const randSeeds = (n, seed) => { const r = rng(seed); return Array.from({ length: n }, () => [r() * (W + 80) - 40, r() * (H + 80) - 40]); };
/** Distance from (x, y) to the wall between its nearest seed and the next. */
function wallDist(seeds, x, y) {
  let i1 = -1, i2 = -1, d1 = Infinity, d2 = Infinity;
  for (let i = 0; i < seeds.length; i++) { const d = (seeds[i][0] - x) ** 2 + (seeds[i][1] - y) ** 2; if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; } }
  const [ax, ay] = seeds[i1], [bx, by] = seeds[i2];
  return (d2 - d1) / (2 * Math.hypot(bx - ax, by - ay));
}
const PINK = [255, 90, 170], BLUE = [60, 120, 255], DARK = [8, 12, 30], LIGHT = [230, 200, 140], INK = [30, 20, 15];
function foam(seeds, { wall = 8, dark = true, core = false, double = false, grain = 0 } = {}) {
  const r = rng(7);
  return img((x, y) => {
    const d = wallDist(seeds, x, y), n = grain ? (r() - 0.5) * grain : 0;
    if (double) {
      // Two thin bright walls 3 px wide with a dark gap between them.
      const on = d < wall / 2 && d > wall / 2 - 3;
      return (on ? [235, 235, 235] : DARK).map(v => v + n);
    }
    if (d < wall / 2) return (dark ? (core && d < wall / 4 ? PINK : core ? BLUE : [235, 235, 235]) : INK).map(v => v + n);
    return (dark ? DARK : LIGHT).map(v => v + n);
  });
}

// ─── cells, junctions, borders ───────────────────────────────────────────────
const hex = hexSeeds(64), hexF = structureFrame(foam(hex));
// The hexagons whose inside (less half the 8-px wall) lies wholly in the
// frame: flat sides a/2 either side of the seed, corners a/√3 above and below.
const hexWhole = hex.filter(([x, y]) => x - 32 + 4 > 0 && x + 32 - 4 < W - 1 && y - 64 / Math.sqrt(3) + 4 > 0 && y + 64 / Math.sqrt(3) - 4 < H - 1).length;
ok(Math.abs(hexF.cells.whole - hexWhole) <= 3, `honeycomb: ${hexF.cells.whole} whole cells (${hexWhole} lie wholly in the frame)`);
ok(hexF.cells.sidesN >= hexF.cells.whole - 3 && Math.abs(hexF.cells.sides - 6) < 0.3 && hexF.cells.mu2 != null && hexF.cells.mu2 < 0.2, `honeycomb: ${f2(hexF.cells.sides)} sides over ${hexF.cells.sidesN} cells, μ2 ${f2(hexF.cells.mu2)} (6 and 0, every whole cell counted)`);
ok(hexF.cells.threeWay > 0.9 && hexF.cells.angleN >= 300 && hexF.cells.angleDev != null && hexF.cells.angleDev < 6, `honeycomb: ${f2(hexF.cells.threeWay)} of junctions three-way, ${hexF.cells.angleN} angles ${f2(hexF.cells.angleDev)}° off 120° (all three-way, 300 angles or more, under 6°)`);
const thickPx = hexF.cells.thick / 100 * W;
ok(Math.abs(thickPx - 8) < 2.4, `honeycomb: walls ${f2(thickPx)} px thick (drawn 8, within 30%)`);
ok(Math.abs(hexF.cells.diam - 64 * Math.sqrt(2 * Math.sqrt(3) / Math.PI) / W * 100 * (1 - 8 / 64)) < 1.5, `honeycomb: cells ${f2(hexF.cells.diam)}% across (a 64-px hexagon less its wall is about 8.5% of 640 as a circle of equal area)`);
const vor = structureFrame(foam(randSeeds(70, 3)));
ok(vor.cells.whole >= 25, `random tiling: ${vor.cells.whole} whole cells (70 seeds, most inside)`);
ok(vor.cells.sidesN >= vor.cells.whole - 3 && Math.abs(vor.cells.sides - 6) < 0.8, `random tiling: ${f2(vor.cells.sides)} sides on average (Euler: about 6 for any tiling with three-way junctions)`);
ok(vor.cells.mu2 != null && vor.cells.mu2 > 0.8, `random tiling: μ2 ${f2(vor.cells.mu2)} (a Poisson–Voronoi tiling's is about 1.8; the honeycomb's 0)`);
ok(vor.cells.angleN >= 100 && vor.cells.angleDev > hexF.cells.angleDev + 8, `random tiling: angles ${f2(vor.cells.angleDev)}° off 120° against the honeycomb's ${f2(hexF.cells.angleDev)}° (Plateau's law tells them apart)`);

// ─── light ───────────────────────────────────────────────────────────────────
const bright = structureFrame(foam(hex, { dark: false }));
ok(hexF.light.darkField > 0.5, `dark field (bright walls, dark cells): index ${f2(hexF.light.darkField)} (over 0.5)`);
ok(bright.light.darkField < -0.4, `bright field (ink walls, light cells): index ${f2(bright.light.darkField)} (under -0.4)`);
ok(bright.cells.whole >= 30 && Math.abs(bright.cells.sides - 6) < 0.3, `bright field: the same honeycomb, ${bright.cells.whole} cells, ${f2(bright.cells.sides)} sides`);
const cored = structureFrame(foam(hex, { core: true, wall: 12 }));
const ch = cored.light.hues;
ok(ch.cores?.name === 'rose' || ch.cores?.name === 'magenta', `walls pink at the core: cores read ${ch.cores?.name} (rose or magenta)`);
ok(ch.flanks?.name === 'blue' || ch.flanks?.name === 'azure', `walls blue at the flanks: flanks read ${ch.flanks?.name} (blue or azure)`);
const cs = structureSummary([cored]);
ok(cs.light.hueSplit > 0.6, `interiors (dark navy) against walls (pink and blue): colour split ${f2(cs.light.hueSplit)} (over 0.6)`);
{
  // A known middle answer: interiors the hue of the flanks (azure navy), so
  // only the cores differ. A split read from the cores alone reads about 1,
  // one from the flanks alone about 0.
  const navy = img((x, y) => { const d = wallDist(hex, x, y); return d < 6 ? (d < 3 ? PINK : BLUE) : [20, 40, 85]; });
  const mid = structureSummary([structureFrame(navy)]).light.hueSplit;
  ok(mid > 0.3 && mid < 0.6, `interiors the flanks' hue, cores pink: colour split ${f2(mid)} (0.3 to 0.6)`);
}
ok(hueSplit({ interiors: { bins: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, flanks: { bins: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }) === 0, 'one hue throughout: colour split 0');

// Speculars: 20 small white highlights in the cells, and none.
{
  const r = rng(11), dots = [];
  while (dots.length < 20) { const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60); if (wallDist(hex, x, y) > 14 && dots.every(([a, b]) => Math.hypot(a - x, b - y) > 20)) dots.push([x, y]); }
  const base = foam(hex), withDots = img((x, y) => { for (const [a, b] of dots) if (Math.hypot(a - x, b - y) < 2.2) return [255, 255, 255]; const p = y * W + x; return [base.R[p] * 255, base.G[p] * 255, base.B[p] * 255]; });
  const sp = structureFrame(withDots).light.speculars;
  ok(Math.abs(sp - 20) <= 3, `20 planted highlights: ${sp} speculars (17 to 23)`);
  ok(hexF.light.speculars <= 2, `no highlights planted: ${hexF.light.speculars} speculars`);
}
// A lateral colour fringe: red drawn 1.5% further from the centre and blue
// 1.5% nearer than green, as a lens's lateral aberration does; and none.
{
  const ch3 = (k, x, y) => { const d = wallDist(hex, W / 2 + (x - W / 2) / k, H / 2 + (y - H / 2) / k); return d < 4 ? 235 : 12; };
  const fr = structureFrame(img((x, y) => [ch3(1.015, x, y), ch3(1, x, y), ch3(0.985, x, y)])).light.fringe;
  const half = structureFrame(img((x, y) => [ch3(1.0075, x, y), ch3(1, x, y), ch3(0.9925, x, y)])).light.fringe;
  ok(fr && fr.radialPx > 0.8, `lateral fringe planted (red out, blue in, 3% apart): ${f2(fr?.radialPx)} px outward (over 0.8)`);
  // Half the aberration, half the fringe: the read follows its size, not
  // only its sign.
  const ratio = fr?.radialPx / half?.radialPx;
  ok(ratio > 1.6 && ratio < 2.4, `half the aberration: ${f2(half?.radialPx)} px, the full one ${f2(ratio)}× it (1.6 to 2.4)`);
  ok(hexF.light.fringe?.n >= 50 && hexF.light.fringe.radialPx != null && Math.abs(hexF.light.fringe.radialPx) < 0.3, `no fringe planted: ${f2(hexF.light.fringe?.radialPx)} px over ${hexF.light.fringe?.n} edges (under 0.3, 50 edges or more)`);
}

// ─── edge profiles ───────────────────────────────────────────────────────────
{
  const n = 41, c = 20, g = (x, s) => Math.exp(-(x * x) / (2 * s * s));
  const step = classifyProfile(Array.from({ length: n }, (_, i) => 0.2 + 0.6 / (1 + Math.exp(-(i - c) / 1.5))));
  ok(step?.type === 'step' && Math.abs(step.width - 6.6) < 1.2, `step (logistic, scale 1.5): ${step?.type}, 10–90% rise ${f2(step?.width)} (6.6)`);
  const line = classifyProfile(Array.from({ length: n }, (_, i) => 0.1 + 0.7 * g(i - c, 2)));
  ok(line?.type === 'line' && Math.abs(line.width - 4.7) < 1, `line (Gaussian σ 2): ${line?.type}, width at half height ${f2(line?.width)} (4.7)`);
  const dbl = classifyProfile(Array.from({ length: n }, (_, i) => 0.1 + 0.7 * (g(i - c - 4, 1.2) + g(i - c + 4, 1.2))));
  ok(dbl?.type === 'double' && dbl.gap === 8, `double line (two walls 8 apart): ${dbl?.type}, gap ${dbl?.gap}`);
  const halo = classifyProfile(Array.from({ length: n }, (_, i) => 0.4 + 0.5 * g(i - c, 1.5) - 0.25 * (g(i - c - 5, 1.5) + g(i - c + 5, 1.5))));
  ok(halo?.type === 'halo', `line with dark fringes either side: ${halo?.type} (halo)`);
  ok(classifyProfile(Array.from({ length: n }, () => 0.5)) === null, 'flat profile: not classed');
}
{
  const plain = structureFrame(foam(hex, { wall: 4 })), dbl = structureFrame(foam(hex, { wall: 12, double: true }));
  ok(plain.edges.types.line > 0.6, `thin bright walls: ${f2(plain.edges.types.line)} of profiles read as lines (over 0.6)`);
  ok(dbl.edges.types.double > 0.5, `double walls (two bright lines, a dark gap): ${f2(dbl.edges.types.double)} read as double lines (over 0.5)`);
}

// ─── specks ──────────────────────────────────────────────────────────────────
{
  const r = rng(5), discs = [];
  const place = (cnt, d) => { let tries = 0; while (cnt && tries++ < 20000) { const x = 20 + r() * (W - 40), y = 20 + r() * (H - 40); if (discs.every(q => Math.hypot(q.x - x, q.y - y) > (q.d + d) / 2 + 6)) { discs.push({ x, y, d }); cnt--; } } };
  place(10, 24); place(20, 10); place(40, 4);
  const sp = structureFrame(img((x, y) => { for (const q of discs) { const e = Math.hypot(q.x - x, q.y - y) - q.d / 2; if (e < 0.5) return Array(3).fill(100 + 140 * Math.min(1, 0.5 - e)); } return [100, 100, 100]; })).specks;
  const band = (lo, hi) => Object.entries(sp.bands).filter(([b]) => { const m = /([\d.]+)–([\d.]+)%/.exec(b); return m && +m[1] >= lo && +m[2] <= hi; }).reduce((s, [, v]) => s + v, 0);
  ok(Math.abs(sp.n - 70) <= 10, `70 planted specks: ${sp.n} found (60 to 80)`);
  ok(Math.abs(band(0.5, 1) - 40) <= 8, `40 of 4 px (0.6%): ${band(0.5, 1)} in 0.5–1%`);
  ok(Math.abs(band(1, 2) - 20) <= 5, `20 of 10 px (1.6%): ${band(1, 2)} in 1–2%`);
  ok(Math.abs(band(2, 4) - 10) <= 3, `10 of 24 px (3.8%): ${band(2, 4)} in 2–4%`);
  const dotsAt = pts => structureFrame(img((x, y) => (pts.some(([a, b]) => Math.hypot(a - x, b - y) < 2.5) ? [230, 230, 230] : [40, 40, 40]))).specks;
  const ring = dotsAt(Array.from({ length: 24 }, (_, i) => [W / 2 + 150 * Math.cos(i / 24 * 2 * Math.PI), H / 2 + 150 * Math.sin(i / 24 * 2 * Math.PI)]));
  const rr = rng(9), pts = Array.from({ length: 60 }, () => [20 + rr() * (W - 40), 20 + rr() * (H - 40)]), random = dotsAt(pts);
  // The planted points' own ratio (this draw happens to sit at 0.85), so the
  // read is held to the truth of the draw, not to the 1 of an endless one.
  const truth = pts.map(a => Math.min(...pts.filter(b => b !== a).map(b => Math.hypot(a[0] - b[0], a[1] - b[1])))).reduce((t, v) => t + v, 0) / pts.length / (0.5 / Math.sqrt(pts.length / (W * H)));
  const lattice = dotsAt(Array.from({ length: 48 }, (_, i) => [40 + (i % 8) * 80, 40 + Math.floor(i / 8) * 80]));
  ok(ring.chain > 0.8, `24 dots on a ring: ${f2(ring.chain)} in chains (over 0.8)`);
  ok(random.chain < 0.35 && Math.abs(random.clarkEvans - truth) < 0.1, `60 dots at random: ${f2(random.chain)} in chains, Clark–Evans ${f2(random.clarkEvans)} (under 0.35; the draw's own ${f2(truth)})`);
  ok(lattice.clarkEvans > 1.6, `48 dots on a square lattice: Clark–Evans ${f2(lattice.clarkEvans)} (even: about 2 for a lattice this sparse)`);
}

// ─── focus layers ────────────────────────────────────────────────────────────
const texture = (seed, w = W, h = H) => { const r = rng(seed), L = new Float32Array(w * h); for (let k = 0; k < 900; k++) { const x0 = r() * w, y0 = r() * h, len = 10 + r() * 40, a = r() * Math.PI, v = r() < 0.5 ? 0.9 : 0.05; for (let t = 0; t < len; t++) { const x = Math.round(x0 + t * Math.cos(a)), y = Math.round(y0 + t * Math.sin(a)); if (x >= 0 && y >= 0 && x < w && y < h) L[y * w + x] = v; } } return L; };
{
  const T = texture(21).map(v => v || 0.4), Tb = blur(T, W, H, 4);
  const half = img((x, y) => Array(3).fill(255 * (x < W / 2 ? T : Tb)[y * W + x])), all = img((x, y) => Array(3).fill(255 * T[y * W + x]));
  const two = sharpnessLayers([half]), one = sharpnessLayers([all]);
  const soft = two?.layers?.[two.layers.length - 1];
  ok(two?.count === 2, `half sharp, half blurred by 4: ${two?.count} focus layers (2)`);
  ok(two?.count === 2 && Math.abs(two.layers[0].share - 0.5) < 0.15 && soft.blurPx > 2.5 && soft.blurPx < 6, `the two layers: ${two?.layers.map(l => `${f2(l.share)} at ${f2(l.blurPx)} px`).join(', ')} (about half each, the soft one at 2.5 to 6 px)`);
  ok(one?.count === 1 && one.sharpShare > 0.8, `all sharp: ${one?.count} layer, ${f2(one?.sharpShare)} sharp`);
}

// ─── the illustrated index ───────────────────────────────────────────────────
{
  const drawn = structureFrame(foam(hex, { dark: false, wall: 6 }));
  const r = rng(13), vs = randSeeds(90, 17), T = texture(31);
  const photo = structureFrame(img((x, y) => {
    const d = wallDist(vs, x, y), n = (r() - 0.5) * 30, g = 40 * Math.sin(x / 23) * Math.cos(y / 17);
    if (d < 5) return (d < 2.5 ? PINK : BLUE).map(v => v + n);
    const t = T[y * W + x];
    return t ? [t * 255 + n, t * 255 + n, t * 255 + n] : [20 + g + n, 40 + g + n, 90 + g + n];
  }));
  const iD = structureSummary([drawn]).illustrated, iP = structureSummary([photo]).illustrated;
  ok(iD.index > 0.6, `drawn (flat fills, one line width, one size, no specks): illustrated ${f2(iD.index)} (over 0.6)`);
  ok(Object.values(iD.parts).every(v => v != null && v > 0.5), `drawn: every part at the drawn end (${Object.entries(iD.parts).map(([k, v]) => `${k} ${f2(v)}`).join(', ')})`);
  ok(iP.index < 0.35, `photographic (shading, grain, specks of every size, colour by structure, cells of many sizes): illustrated ${f2(iP.index)} (under 0.35)`);
  ok(illustrated({ flatShare: null, lineCv: null, diamCv: 0.1, bandsHeld: null, specks: null, hueTv: null }).index === null, 'too few parts measured: no index');
}

// ─── motion layers ───────────────────────────────────────────────────────────
{
  const w = 160, h = 120, rate = 10, base = texture(41, 480, 360), far = blur(base, 480, 360, 1.5), near = texture(43, 480, 360);
  const at = (I, x, y) => { x = ((x % 480) + 480) % 480; y = ((y % 360) + 360) % 360; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % 480, y1 = (y0 + 1) % 360; return I[y0 * 480 + x0] * (1 - fx) * (1 - fy) + I[y0 * 480 + x1] * fx * (1 - fy) + I[y1 * 480 + x0] * (1 - fx) * fy + I[y1 * 480 + x1] * fx * fy; };
  const clip = (n, pos) => Array.from({ length: n }, (_, k) => { const d = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, pos(k, x, y)))); return { w, h, d }; });
  const bgv = v => v || 0.35;
  // Near patches (a checker of 40-px squares) at 2.5 px a frame, the far layer at 1.
  const par = motionLayers(clip(40, (k, x, y) => ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? bgv(at(near, x + 2.5 * k + 100, y + 50)) : bgv(at(far, x + 1 * k, y)))), { rate });
  ok(par?.kind === 'glide with parallax', `glide, near layer 2.5× the far: ${par?.kind}`);
  ok(par?.parallax > 1.9 && par?.parallax < 3.1, `parallax speed ratio ${f2(par?.parallax)} (2.5)`);
  const tilt = motionLayers(clip(40, (k, x, y) => bgv(at(base, x + (0.6 + 1.6 * y / h) * k, y))), { rate });
  ok(tilt?.kind?.startsWith('glide'), `glide over a tilted scene (speed 0.6 to 2.2 px a frame down the frame, shear as much as turn): ${tilt?.kind} (a glide, not a turn)`);
  const om = 0.02;
  const turn = motionLayers(clip(40, (k, x, y) => { const c = Math.cos(om * k), s = Math.sin(om * k), dx = x - w / 2, dy = y - h / 2; return bgv(at(base, 240 + c * dx + s * dy, 180 - s * dx + c * dy)); }), { rate });
  ok(turn?.kind === 'turn', `a turn of 0.02 rad a frame: ${turn?.kind}`);
  ok(turn?.period > 26 && turn?.period < 37 && turn?.sense === 'clockwise', `its period ${f2(turn?.period)} s (31.4) and sense ${turn?.sense} (clockwise on screen)`);
  ok(turn?.centre && Math.abs(turn.centre[0] - 0.5) < 0.1 && Math.abs(turn.centre[1] - 0.5) < 0.1, `its centre (${turn?.centre?.map(f2).join(', ')}) (0.5, 0.5)`);
  const r = rng(3), still = motionLayers(clip(30, (k, x, y) => bgv(at(base, x, y)) + (r() - 0.5) * 0.01), { rate });
  ok(still?.kind === 'still' && still.pairs >= 25 && still.shares.still === 1, `a still frame with grain: ${still?.kind}, ${still?.pairs} pairs all still (25 or more)`);
}

// ─── through the watch ───────────────────────────────────────────────────────
{
  const ff = process.env.FFMPEG || 'ffmpeg';
  if (spawnSync(ff, ['-version'], { stdio: 'ignore' }).status !== 0) ok(false, 'ffmpeg is needed for the watch run');
  else {
    const { watchVideo } = await import('./watch.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-')), film = path.join(dir, 'foam.mp4');
    const fw = 480, fh = 360, frames = [];
    // A random foam, not a honeycomb: a lattice drifting one pixel a frame
    // matches itself a period away as well as one pixel away, and the flow
    // read took the period (16 px) on the first try of this test.
    const foamSeeds = Array.from({ length: 60 }, (_, i) => { const r = rng(100 + i); return [r() * (fw + 60) - 30, r() * (fh + 60) - 30]; });
    let firstPx = null;
    for (let k = 0; k < 30; k++) { const seeds = foamSeeds.map(([x, y]) => [x + k, y]), px = Buffer.alloc(fw * fh * 3); for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const d = wallDist(seeds, x, y), v = d < 3 ? 235 : 15; px.fill(v, (y * fw + x) * 3, (y * fw + x) * 3 + 3); } frames.push(px); firstPx ??= px; }
    const enc = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${fw}x${fh}`, '-r', '10', '-i', 'pipe:0', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '12', film], { input: Buffer.concat(frames) });
    if (enc.status !== 0) ok(false, `encode the foam clip: ${enc.stderr}`);
    else {
      const out = path.join(dir, 'out'), r = await watchVideo(film, { out, rate: 10, frames: 6, quiet: true, report: false });
      const st = r.design.structure, md = fs.readFileSync(path.join(out, 'summary.md'), 'utf8'), dj = JSON.parse(fs.readFileSync(path.join(out, 'design.json'), 'utf8'));
      // The same count as the read of its first frame straight from the
      // pixels (the honeycomb tests above hold that read to the truth), give
      // or take what the drift and the codec move.
      const exp = structureFrame(toWork(firstPx, fw, fh)).cells.whole;
      ok(Math.abs(st?.cells?.whole - exp) <= Math.max(3, 0.1 * exp), `watchVideo on a drifting foam: ${st?.cells?.whole} whole cells in the structure read (about ${exp})`);
      ok(/## Structure and light/.test(md) && /\*\*cells\*\*: \d+ whole/.test(md) && /illustrated index\*\* \d\.\d\d/.test(md), 'summary.md carries the structure and light section, with numbers');
      ok(dj.structure?.cells?.whole === st.cells.whole, 'design.json carries the structure read (for a later --vs)');
      const png = fs.existsSync(path.join(out, 'structure.png')) ? fs.readFileSync(path.join(out, 'structure.png')) : null;
      ok(png && png.readUInt32BE(16) === fw && png.readUInt32BE(20) === fh, `structure.png (the overlay) written beside the summary at ${png ? `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}` : 'nothing'} (${fw}×${fh})`);
      // 1 px a frame at 10 a second on 480 px: 2.08% of the width a second.
      ok(st?.motion?.kind?.startsWith('glide') && Math.abs(st.motion.speed - 2.08) < 0.5, `the foam drifts one way at one speed: motion ${st?.motion?.kind} at ${f2(st?.motion?.speed)}% of the width a second (2.08)`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
