// Depth for the structure and light read (`watchstructure.mjs`): the focus
// layers a still holds, and the motion layers a clip holds.
//
// What was reported (the owner, 2026-11-28, of a macro film of soap foam):
// "his looks are substantially more complex and have layers as well". The
// layers are depth: a sharp foam in front of a second foam far out of focus,
// moving at a different rate as the camera glides. The watch tool had no
// sharpness map, so it could not see a sharp layer over a blurred one, and
// its flow read fits one affine field to the whole frame, so a glide whose
// near layer outran its far one left a shear in the fit, half of which is
// rotation by arithmetic (a velocity gradient du/dy = g is a turn of g/2
// plus a shear of g/2), and the read said "turning clockwise".
//
// Focus layers. In each block of a still, the 90th-percentile gradient at a
// fine scale (σ 0.7) over the same at a coarse one (σ 2). A blurred edge of
// blur s has a peak gradient proportional to 1/√(s² + σ²), so the ratio is
// √(s² + 4)/√(s² + 0.49): 2.9 for a pixel-sharp edge, 1.2 for one blurred by
// 3, and s is read back from it. Blocks with too little contrast to have an
// edge are left out. The blur values of every block of every still are then
// split into two or three groups (k-means on log blur), and a group counts as
// a layer only when it holds an eighth of the blocks or more and sits apart
// from its neighbour by two and a half pooled spreads and twice the blur:
// one layer of mixed sharpness (a focus falling off across a tilted plate)
// stays one layer.
//
// Motion layers. The flow of the physics read (`flowField`, block matching
// with sub-pixel refinement) on pairs a third of a second apart, then three
// fits to each pair's vectors: one translation; translation with a turn and a
// zoom about the vectors' centre; a full affine field. Their gains split the
// motion into translation, turn, zoom, shear and what no field explains (the
// scene's own motion). Speeds along a glide that spread 1.6 times or more (the fastest tenth over the slowest) are parallax too. A pair is a turn when the turn explains at least 30%
// and the shear less than half as much (a turn has no shear; parallax across a
// tilted scene brings equal parts of both); a glide when the vectors point one
// way (coherence |Σv|/Σ|v| at least 0.85) and translation explains half; a
// glide with parallax when, along the glide, the speeds fall into two groups
// (the near layer and the far one) or a sixth of the motion is shear or own.

import { blur, derivs, quantile, median } from './watchimage.mjs';
import { flowField } from './watchphysics.mjs';

/** Pool an RGB24 frame's luminance by k (the physics read's own pooling): { w, h, d }. */
export function poolFrame(px, W, H, k) {
  const w = Math.floor(W / k), h = Math.floor(H / k), d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const p = ((y * k + j) * W + x * k + i) * 3; s += 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]; }
    d[y * w + x] = Math.round(s / (k * k));
  }
  return { w, h, d };
}

/** 1-D k-means (k groups), seeded at evenly spaced quantiles: [{ m, v, n }] sorted by mean. */
function kmeans1(xs, k) {
  let c = Array.from({ length: k }, (_, i) => quantile(xs, (i + 0.5) / k));
  let g = [];
  for (let it = 0; it < 30; it++) {
    g = c.map(() => []);
    for (const x of xs) { let b = 0; for (let i = 1; i < k; i++) if (Math.abs(x - c[i]) < Math.abs(x - c[b])) b = i; g[b].push(x); }
    const nc = g.map((a, i) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : c[i]));
    if (nc.every((v, i) => Math.abs(v - c[i]) < 1e-6)) break;
    c = nc;
  }
  return g.map((a, i) => ({ m: c[i], v: a.length > 1 ? a.reduce((s, x) => s + (x - c[i]) ** 2, 0) / (a.length - 1) : 0, n: a.length, xs: a })).sort((a, b) => a.m - b.m);
}

/** Do adjacent groups stand apart: each big enough, separated by `sep` pooled spreads and `ratio` in value? */
function apart(gs, total, { share, sep, ratio, val }) {
  if (gs.some(g => g.n < share * total)) return false;
  for (let i = 1; i < gs.length; i++) {
    const a = gs[i - 1], b = gs[i], sd = Math.sqrt((a.v + b.v) / 2) || 1e-6;
    if ((b.m - a.m) / sd < sep || val(b.m) / Math.max(1e-6, val(a.m)) < ratio) return false;
  }
  return true;
}

/** Blur (in working pixels) read back from the fine-over-coarse gradient ratio. */
export const blurFromRatio = r => (r >= 2.85 ? 0 : r <= 1.02 ? 20 : Math.sqrt(Math.max(0, (4 - 0.49 * r * r) / (r * r - 1))));

/** Focus layers over working stills (from `toWork`). */
export function sharpnessLayers(imgs) {
  const blurs = [];
  let smooth = 0;
  for (const img of imgs) {
    const { w, h, L } = img, bs = Math.max(12, Math.round(24 * (w / 640)));
    const f = derivs(blur(L, w, h, 0.7), w, h), c = derivs(blur(L, w, h, 2), w, h);
    for (let by = 0; by + bs <= h; by += bs) for (let bx = 0; bx + bs <= w; bx += bs) {
      const gf = [], gc = [];
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const p = y * w + x; gf.push(Math.hypot(f.gx[p], f.gy[p])); gc.push(Math.hypot(c.gx[p], c.gy[p])); }
      const pf = quantile(gf, 0.9), pcc = quantile(gc, 0.9);
      if (!(pcc > 0.004)) continue;
      // Past a blur of 9 the block holds a ramp, not an edge (a smooth shading
      // reads the same as a far defocus), so it counts as smooth, not as a layer.
      const b = blurFromRatio(pf / pcc);
      if (b > 9) { smooth++; continue; }
      blurs.push(b);
    }
  }
  if (blurs.length < 8) return null;
  const xs = blurs.map(s => Math.log(s + 0.5)), val = m => Math.exp(m);
  let groups = [{ m: 0, n: xs.length, xs }];
  const g2 = kmeans1(xs, 2);
  if (apart(g2, xs.length, { share: 0.12, sep: 2.5, ratio: 2, val })) {
    groups = g2;
    const g3 = kmeans1(xs, 3);
    if (apart(g3, xs.length, { share: 0.1, sep: 2.5, ratio: 1.8, val })) groups = g3;
  }
  const w = imgs[0].w;
  return {
    count: groups.length, blocks: blurs.length, smoothShare: smooth / (smooth + blurs.length),
    sharpShare: blurs.filter(s => s < 1).length / blurs.length,
    blurPx: median(blurs),
    layers: groups.map(g => { const px = median(g.xs.map(x => Math.exp(x) - 0.5)); return { share: g.n / xs.length, blurPx: px, blur: (px / w) * 100 }; }),
  };
}

/** Fits to one set of vectors (see the head of the file). */
function fitCore(V) {
  const n = V.length;
  let su = 0, sv = 0, xm = 0, ym = 0, tot = 0, mag = 0;
  for (const p of V) { su += p.dx; sv += p.dy; xm += p.x; ym += p.y; tot += p.dx * p.dx + p.dy * p.dy; mag += Math.hypot(p.dx, p.dy); }
  const tu = su / n, tv = sv / n; xm /= n; ym /= n;
  let resT = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxu = 0, Syu = 0, Sxv = 0, Syv = 0;
  for (const p of V) {
    const x = p.x - xm, y = p.y - ym, u = p.dx - tu, v = p.dy - tv;
    resT += u * u + v * v; Sxx += x * x; Syy += y * y; Sxy += x * y; Sxu += x * u; Syu += y * u; Sxv += x * v; Syv += y * v;
  }
  const r2 = Sxx + Syy || 1e-9;
  const om = (Sxv - Syu) / r2, s = (Sxu + Syv) / r2;
  const rotG = om * om * r2, zoomG = s * s * r2, resR = Math.max(0, resT - rotG - zoomG);
  const det = Sxx * Syy - Sxy * Sxy || 1e-9;
  const a = (Sxu * Syy - Syu * Sxy) / det, b = (Syu * Sxx - Sxu * Sxy) / det, c = (Sxv * Syy - Syv * Sxy) / det, d = (Syv * Sxx - Sxv * Sxy) / det;
  const resA = Math.max(0, resT - (a * Sxu + b * Syu) - (c * Sxv + d * Syv));
  const t = tot || 1e-9;
  const coh = mag > 0 ? Math.hypot(su, sv) / mag : 0;
  // Speeds along the glide's direction, for two groups.
  const el = Math.hypot(tu, tv) || 1, ex = tu / el, ey = tv / el;
  const along = V.map(p => p.dx * ex + p.dy * ey);
  // Two layers when the speeds along the glide fall into two groups four
  // pooled spreads apart (a continuum split in two, as a tilted scene gives,
  // sits 3.5 apart), the ratio of their medians; and the speeds' spread, the
  // 90th over the 10th percentile, for parallax that is a gradient.
  let parallax = null, spread = null;
  if (coh >= 0.85) {
    const g = kmeans1(along, 2);
    if (g[0].m > 0 && apart(g, n, { share: 0.15, sep: 4, ratio: 1.3, val: m => m })) parallax = median(g[1].xs) / median(g[0].xs);
    const p10 = quantile(along, 0.1), p90 = quantile(along, 0.9);
    if (p10 > 0) spread = p90 / p10;
  }
  // Where the turn's field is still: the centre of the turn, in the vectors' own pixels.
  const centre = Math.abs(om) > 1e-6 ? [xm - tv / om, ym + tu / om] : null;
  const resid = V.map(p => { const x = p.x - xm, y = p.y - ym; return Math.hypot(p.dx - tu - a * x - b * y, p.dy - tv - c * x - d * y); });
  return { resid, centre, trans: 1 - resT / t, rot: rotG / t, zoom: zoomG / t, shear: Math.max(0, resR - resA) / t, own: resA / t, coh, om, speed: median(V.map(p => Math.hypot(p.dx, p.dy))), parallax, spread };
}

/**
 * Fits to one pair's vectors, after one pass that drops the wild ones: a
 * vector more than three times the median distance from the affine field
 * (and more than half a pixel) is a block that matched the wrong place,
 * at a layer's edge or in a featureless patch. On the test's checker of near
 * and far patches one block in six was wild, at up to five times the glide's
 * speed, and they alone made a clean glide read as the scene's own motion.
 * Two layers at two speeds are each well inside three medians of the field
 * between them, so parallax is not dropped as wild. `wild` is their share.
 */
export function fitPair(V) {
  const first = fitCore(V), med = median(first.resid) ?? 0, lim = Math.max(0.5, 3 * med);
  const keep = V.filter((_, i) => first.resid[i] <= lim);
  if (keep.length < 12 || keep.length === V.length) return { ...first, wild: 1 - keep.length / V.length };
  return { ...fitCore(keep), wild: 1 - keep.length / V.length };
}

/** The kind of one pair's motion from its fit and its speed (% of width a second). */
export function pairKind(fp, speedPct) {
  if (speedPct < 0.4) return 'still';
  if (fp.rot >= 0.3 && fp.shear < 0.5 * fp.rot) return 'turn';
  if (fp.coh >= 0.85 && fp.trans >= 0.5) return fp.parallax || fp.spread >= 1.6 || fp.shear + fp.own >= 0.15 ? 'glide with parallax' : 'glide';
  if (fp.zoom >= 0.3) return 'zoom';
  return 'own motion';
}

/** Motion layers over pooled luminance samples ({ w, h, d }) at `rate` a second. */
export function motionLayers(lum, { rate = 10, cut = null } = {}) {
  const g = Math.max(1, Math.round(rate * 0.3)), w = lum[0].w;
  const ks = [];
  for (let k = 0; k + g < lum.length; k++) {
    let ok = true;
    for (let j = k + 1; j <= k + g; j++) if (cut?.[j]) ok = false;
    if (ok) ks.push(k);
  }
  const stride = Math.max(1, Math.ceil(ks.length / 40)), fits = [];
  for (let i = 0; i < ks.length; i += stride) {
    const k = ks[i], F = flowField(lum[k], lum[k + g]);
    const V = F.v.filter(v => v && !v.edge && v.resid < 0.6);
    if (V.length < 12) continue;
    const fp = fitPair(V), sp = (fp.speed * rate / g / w) * 100;
    fits.push({ ...fp, speedPct: sp, kind: pairKind(fp, sp), cx: fp.centre ? fp.centre[0] / w : null, cy: fp.centre ? fp.centre[1] / lum[0].h : null });
  }
  if (!fits.length) return null;
  const tally = {};
  for (const fp of fits) tally[fp.kind] = (tally[fp.kind] ?? 0) + 1;
  const moving = fits.filter(fp => fp.kind !== 'still');
  let kind = 'still';
  if (moving.length >= Math.max(2, 0.3 * fits.length)) {
    // Glide and glide with parallax are one kind of camera move: counted
    // together for the verdict, then named by which of the two has more.
    const t = { ...tally }; delete t.still;
    const glides = (t.glide ?? 0) + (t['glide with parallax'] ?? 0);
    const best = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
    if (glides >= 0.4 * moving.length && glides >= best[1]) kind = (t['glide with parallax'] ?? 0) >= (t.glide ?? 0) ? 'glide with parallax' : 'glide';
    else kind = best[1] >= 0.4 * moving.length ? best[0] : 'mixed';
  }
  // A steady turn under the scene's own motion: half the moving pairs or
  // more with a turn of at least 15% of their motion, nine in ten of those
  // turning the same way. Measured 2026-11-28 on a macro foam film: every
  // second pair turned about the same point (0.45, 0.75 of the frame) at the
  // same rate, one turn in about 33 s, under 40 to 60% motion no one field
  // explains (bubbles and a second layer moving on their own), so no one pair
  // kind held the clip and it read as own motion.
  const turning = moving.filter(fp => fp.rot >= 0.15);
  const pos = turning.filter(fp => fp.om > 0).length;
  const steady = turning.length >= 0.5 * moving.length && turning.length >= 3 && Math.max(pos, turning.length - pos) >= 0.9 * turning.length;
  if (steady && kind !== 'turn' && !kind.startsWith('glide')) kind = 'turn with own motion';
  const par = moving.map(fp => fp.parallax).filter(Boolean);
  const turnSet = kind.startsWith('turn') ? (steady ? turning : moving.filter(fp => fp.kind === 'turn')) : moving;
  const om = median(turnSet.map(fp => fp.om)) ?? 0, omPerS = om * rate / g;
  const inside = turnSet.filter(fp => fp.cx != null && fp.cx > -0.5 && fp.cx < 1.5 && fp.cy > -0.5 && fp.cy < 1.5);
  return {
    kind, pairs: fits.length, shares: Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, v / fits.length])),
    speed: median(moving.map(fp => fp.speedPct)), coherence: median(moving.map(fp => fp.coh)),
    turn: median(moving.map(fp => fp.rot)), shear: median(moving.map(fp => fp.shear)), own: median(moving.map(fp => fp.own)),
    parallax: par.length >= Math.max(2, 0.25 * moving.length) ? median(par) : null,
    spread: median(moving.map(fp => fp.spread).filter(Boolean)),
    period: kind.startsWith('turn') && Math.abs(omPerS) > 1e-3 ? (2 * Math.PI) / Math.abs(omPerS) : null,
    // Image y runs down, so a positive ω here turns clockwise on screen.
    sense: kind.startsWith('turn') ? (omPerS > 0 ? 'clockwise' : 'anticlockwise') : null,
    centre: kind.startsWith('turn') && inside.length >= 0.5 * turnSet.length ? [median(inside.map(fp => fp.cx)), median(inside.map(fp => fp.cy))] : null,
  };
}

const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pc = x => (x == null ? '–' : `${Math.round(x * 100)}%`);

/** The focus and motion lines of the structure section. */
export function depthLines(layers, motion) {
  const out = [];
  out.push(layers
    ? `- **focus layers**: ${layers.count} (${layers.layers.map(l => `${pc(l.share)} at blur ${f(l.blurPx, 1)} px`).join(', ')}); ${pc(layers.sharpShare)} of the blocks with an edge sharp, ${pc(layers.smoothShare)} of the textured blocks smooth shading`
    : '- **focus layers**: not read (too few blocks with an edge)');
  if (motion) {
    const what = {
      still: 'still',
      turn: `a turn, ${motion.sense}, one turn in about ${f(motion.period, 0)} s${motion.centre ? ` about (${f(motion.centre[0], 2)}, ${f(motion.centre[1], 2)}) of the frame` : ''} (a turning dish and a camera's roll read alike from the picture)`,
      'turn with own motion': `a steady turn, ${motion.sense}, one turn in about ${f(motion.period, 0)} s${motion.centre ? ` about (${f(motion.centre[0], 2)}, ${f(motion.centre[1], 2)}) of the frame` : ''}, under the scene's own motion (a turning dish and a camera's roll read alike from the picture)`,
      glide: 'a camera glide (one direction, one speed)',
      'glide with parallax': `a camera glide with parallax${motion.parallax ? `: two layers, the near one moving ${f(motion.parallax, 1)}× the far one` : `: speeds along it spread ${f(motion.spread, 1)}× (fastest tenth over slowest), depth as a gradient`}`,
      zoom: 'a zoom',
      'own motion': 'the scene\'s own motion (no one field explains it)',
      mixed: 'mixed (no one kind holds 40% of the moving pairs)',
    }[motion.kind];
    out.push(`- **motion layers**: ${what}; ${f(motion.speed, 1)}% of the width a second, coherence ${f(motion.coherence, 2)}, turn ${pc(motion.turn)} and shear ${pc(motion.shear)} of the motion (${motion.pairs} pairs: ${Object.entries(motion.shares).map(([k, v]) => `${k} ${pc(v)}`).join(', ')})`);
  }
  return out;
}
