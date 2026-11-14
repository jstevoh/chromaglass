#!/usr/bin/env node
/**
 * No line round a bubble's hole, and none where two dyes meet.
 *
 *   npm run holeline      (the lab: any adapter that computes; in Measure's lab part)
 *
 * What was reported (2026-10-19), on the live site: "bubbles still look
 * really pixelated around themselves". Rendered in the lab, every hole the
 * air cuts in the dye had a stepped halo round it, bright and dark blocks a
 * couple of cells out on a cross, a "+" stamped round each small bubble. The
 * dye field under it was clean: with Boundary Contrast at 0 the halo went.
 * The cause was the line drawn between two dyes (boundaryDiff in
 * wgsl/plate.ts, on at 0.35 in every look), which read one dye thinning to
 * nothing at a hole's edge as two colours meeting; a gate on the dye's hue
 * took it off the holes and kept it between two dyes.
 *
 * And again (2026-11-13), on Comet River: "I don't really like the super
 * thick black lines around things. Where does this even come from?" That
 * was the same line where it had been kept. Since the light was put under
 * the glass (38h-2) it was drawn as a deflection, the colour step bending
 * the lamp's light out of the lens's aperture: a band four or five cells
 * wide with up to 78% of the light gone, wherever two colours met. Two dyes
 * in one liquid have no index step between them and no surface to slope, so
 * they bend nothing; what a boundary between them does is absorb with both
 * dyes where they overlap, which the decode already draws. The line is gone
 * from the wall and from a photographed look (PLAN 18e-5; the long comment
 * over boundaryDiff in wgsl/plate.ts). Measured on main the day it went, the lines below read:
 * round a hole and at the pool's rim 0 levels (the hue gate's work), and
 * between two dyes 173 levels at one depth, 136 at depths five times apart,
 * 13 at hues 0.2 apart, 141 photographed, the seam on the wall 43 levels
 * darker than the darker of its two dyes (3 now, the dither and the blend).
 *
 * Asked on plates the lab lays out and the real solver and plate shader
 * draw (the air cut into the dye as the app cuts it, bubbleClear 1, the
 * bubbles' own drawing off so only the hole is seen), each picture against
 * the same plate with Boundary Contrast at 0, at the dial's 0.35, 1 and 2,
 * so what is measured is only what the dial adds. The two shots share a
 * time and a dither laid by pixel, so a pixel the dial does not touch
 * differs by exactly nothing:
 *
 *   0. the dial is live in these pictures: out of focus (Focus 0.8), where
 *      it scales the optical path's contrast, it moves the pool's rim by
 *      more than LIVE levels on average. So "moves nothing" below is the
 *      shader's answer and not a setting the lab dropped
 *   1. round holes of 1.8 to 14 cells in one flat dye: no pixel in a ring
 *      from half the hole's radius to HALO_OUT cells past its rim is moved
 *      by more than MAX_MOVE levels in any channel
 *   2. the pool's own rim into clear water, the same. The pool's edge, its
 *      relief and its meniscus are drawn elsewhere and are untouched
 *   3. two dyes meeting, at one depth, at depths five times apart and at
 *      near hues, and the first photographed (the camera's path): no pixel
 *      in a band across where they meet is moved by more than MAX_MOVE.
 *      (Hues 0.08 apart read 0 on main too, under the old gate's floor.)
 *   3b. and the seam is what the two dyes absorb, not a line: at one depth,
 *      with the dial at 1, no pixel of the band is darker in any channel
 *      than the darker of the two dyes beside it, or brighter than the
 *      brighter, by more than SEAM levels (at one depth the dye across the
 *      seam is a blend of the two, so by Beer-Lambert each channel lies
 *      between them; the line began as a bright seam, so both sides are
 *      asked), and only once the two sides are shown to be two colours (over
 *      SIDES levels apart). It reads 3 and 4 (the dither, and the blend's
 *      own curve through the grade) against main's 43, so SEAM is 6. This
 *      is the one line that would see a line the dial did not scale
 *
 * Printed, not judged: the closeup (2x, centred on the seam, the dial at 1
 * against 0). Up close the colour step is still read, as the closeup's
 * relief (the derive pass's camera branch in wgsl/plate.ts says why it is
 * kept and what was tried in its place), so there a seam between two dyes
 * is still shaded darker and the dial still moves it: PLAN 18e-7, whose
 * build turns these printed numbers into lines.
 *
 * Not asked here: the back plate. Its painted bright rim (the dye's slope
 * times the dial, refractionOptics note 5, PLAN 18e-1) is kept, drawn on a
 * step in depth and not on a step in colour, and these plates have one layer.
 *
 * Before any of it is judged, the plates are asked to be what they say:
 * every picture is whole, every ring selects the pixels its area says, and
 * each hole is cut where it was put, its rim within RIM_SLACK cells of its
 * radius along a ray, so a plate whose air missed the dye, or cut it wider
 * and left the ring in clear water (where nothing is ever drawn), throws.
 *
 * A fourth line (33b, 2026-10-20), on the same plate A: no light on the dye's
 * relief round a hole. The report: "bubbles still look pixelated around
 * themselves", and after the line above went, a faint glow was still there, a
 * pale ring on the lamp's side and a dark one opposite, a few cells wide,
 * round every hole. Its cause is the dye's edge relief (meniscus() in
 * wgsl/plate.ts, Edge Relief 0.6 and up in every look): the air cuts the dye
 * with a rim about a texel and a half wide, the relief reads that steep ramp
 * as a pool's edge into clear liquid and lights it, when a hole is the
 * bubble's own edge, drawn by the bubble pass, and the dye beside it is flat.
 * The fix flattens the dye's normal where a bubble's air is within the relief's
 * reach (airNear). Asked, with the bubbles' drawing off but their air field
 * handed to the plate (airField), Boundary Contrast 0 so the line above is not
 * in it:
 *
 *   4. the mean, over the pixels HOLE_FROM to HOLE_TO cells past each hole's
 *      rim, of how far the pixel is from the dye HOLE_REF cells out (the
 *      biggest of the three channels) is under MAX_GLOW levels. A mean of
 *      the size of the deviation, not the signed mean, so the lit side's
 *      pale ring and the opposite dark one do not cancel. Pixels near another
 *      hole are left out. The control (CONTROL_AIR: the shader with airNear's
 *      call taken out of the lead layer's normal) must find the glow: over CONTROL_GLOW
 *      on every hole of 5 cells or more (a hole of 3 or 1.8 cells is smaller
 *      than the relief's own tap, so what the glow is there is printed)
 *   5. the pool's rim into clear liquid keeps its relief: what Edge Relief
 *      moves a pixel there, on the ring across the rim away from the holes,
 *      is at least KEEP_RIM of what it moves in the control, and above
 *      MIN_RIM levels in the control, so a relief that is not there at all
 *      cannot pass for one that is kept
 *
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 768;
const MOVED = 24, MAX_MOVE = 4, HALO_OUT = 6, RIM_SLACK = 1.5;
const DIALS = [0.35, 1, 2], LIVE = 3, SEAM = 6, SIDES = 60;
const SIZES = [1.8, 3, 5, 8, 14];
const HOLE_FROM = 1, HOLE_TO = 6, HOLE_REF = 10, MAX_GLOW = 6, CONTROL_GLOW = 6, KEEP_RIM = 0.98, KEEP_ARC = 0.95, ARC_REACH = 24, PART_SMALL = 0.9, MIN_RIM = 3, MAX_NEAR = 1, CONTROL_NEAR = 5;

/*
  The 33b control: wgsl/plate.ts with the air's mask taken off the lead layer's
  normal, so the dye's relief is drawn at a hole as it was. As above, the edit
  is found once or it throws.
*/
const CONTROL_AIR = {
  name: 'no-air-mask',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let s = readFileSync(a.path, 'utf8');
      const cut = 'vec3f(0.0, 0.0, 1.0), airNear(fuv0)';
      const found = s.split(cut).length - 1;
      if (found !== 1) throw new Error(`holeline: the air control found ${found} of 1 "${cut}" in wgsl/plate.ts`);
      s = s.replace(cut, 'vec3f(0.0, 0.0, 1.0), 0.0');
      return { contents: s, loader: 'ts' };
    });
  },
};

const measure = (page) => page.evaluate(async ({ N, SIZE, SIZES, MOVED, HALO_OUT, DIALS }) => {
  const { L } = await lab.create(N);
  // The frame shows the middle 1/1.5 of the plate (plate.ts), so a point x
  // on the plate is at 0.5 + (x - 0.5) * 1.5 in the picture.
  const F = 1.5, W = SIZE, px = (W * F) / N; // pixels per solver cell, at zoom 1
  const plateAt = (u) => 0.5 + (u - 0.5) / F;
  const pink = [1.2, 0.3, 0.8], teal = [0.2, 1.0, 1.3];
  const shot = async (bc, over = {}, cam = {}) => {
    const p = new Uint8ClampedArray(await lab.render(SIZE, { boundaryContrast: bc, ...over }, { zoom: 1, macroAmount: 0, view: true, bubbles: 0, ...cam }));
    if (p.length !== W * W * 4) throw new Error(`holeline: a picture came back ${p.length} bytes, not ${W * W * 4}`);
    return p;
  };
  const moved = (a, b, i) => Math.max(Math.abs(a[4 * i] - b[4 * i]), Math.abs(a[4 * i + 1] - b[4 * i + 1]), Math.abs(a[4 * i + 2] - b[4 * i + 2]));
  // `area` is the selection's area on the plate; a selection that picks much
  // less than its area (the plate moved, the frame changed) throws rather
  // than reads as nothing moved.
  const share = (on, off, pick, area) => {
    let n = 0, sum = 0, max = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (!pick(plateAt((x + 0.5) / W), plateAt((y + 0.5) / W))) continue;
      const d = moved(on, off, x + y * W);
      n++; sum += d; if (d > max) max = d;
    }
    const want = area * (W * F) ** 2;
    if (n < 0.9 * want) throw new Error(`holeline: a selection picked ${n} pixels of the ${Math.round(want)} its area holds`);
    return { n, mean: sum / n, max };
  };
  // A plate at the dial's 0 and at each of its settings: four pictures, and every
  // selection on that plate is read off the same four (the check ran 61 pictures
  // when each selection took its own, 50 minutes on a shared SwiftShader).
  const dials = async (over = {}) => {
    const off = await shot(0, over), ons = [];
    for (const bc of DIALS) ons.push(await shot(bc, over));
    return { off, ons };
  };
  // The most any of the dial's settings moves a pixel of the selection, against the dial at 0.
  const dialled = (d, pick, area) => {
    let n = 0, max = 0;
    for (const on of d.ons) { const r = share(on, d.off, pick, area); n = r.n; max = Math.max(max, r.max); }
    return { n, max, off: d.off };
  };
  const at = (p, x, y) => { const u = 0.5 + (x - 0.5) * F, v = 0.5 + (y - 0.5) * F; const i = Math.floor(u * W) + Math.floor(v * W) * W; return [p[4 * i], p[4 * i + 1], p[4 * i + 2]]; };
  const far = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));

  // Plate A: one flat dye, a pool whose rim is inside the frame (the frame
  // shows the plate from 0.167 to 0.833), and a row of holes across its
  // middle, clear of the rim.
  const C = 0.5, R = 0.29;
  lab.dyeDisc(C, C, R, pink, 1.3);
  lab.flush(); await lab.step(10);
  const holes = SIZES.map((r, i) => ({ x: 0.3 + i * 0.09, y: 0.5, r: r / N }));
  const list = holes.flatMap((h) => [h.x, h.y, h.r, 1]);
  lab.solver().setBubbles(new Float32Array(list), holes.length, 0.25, new Float32Array(holes.length * 4));
  await lab.step(2, { bubbleClear: 1 });
  const halo = [], plateA = await dials();
  for (const h of holes) {
    const lo = 0.5 * h.r, hi = h.r + HALO_OUT / N, area = Math.PI * (hi * hi - lo * lo);
    const s = dialled(plateA, (x, y) => { const d = Math.hypot(x - h.x, y - h.y); return d >= lo && d <= hi; }, area);
    // Where the hole's rim is: out from the centre along a ray, the first
    // point within MOVED levels of the dye ten cells past the rim.
    const beside = at(s.off, h.x, h.y + h.r + 10 / N);
    let rim = NaN;
    for (let d = 0; d <= h.r + 10 / N; d += 0.1 / N) if (far(at(s.off, h.x, h.y + d), beside) <= MOVED) { rim = d * N; break; }
    halo.push({ cells: h.r * N, max: s.max, n: s.n, cut: far(at(s.off, h.x, h.y), beside), rim });
  }
  const rimRing = (x, y) => Math.abs(Math.hypot(x - C, y - C) - R) < HALO_OUT / N && Math.abs(y - 0.5) > 0.1;
  const rim = dialled(plateA, rimRing, 0);
  // Line 0: out of focus the dial scales the optical path's contrast, and the pool's rim shows it.
  const live = share(await shot(1, { projectorFocus: 0.8 }), await shot(0, { projectorFocus: 0.8 }), rimRing, 0).mean;

  // Plate B: two dyes meeting down the middle.
  const band = (x, y) => Math.abs(x - 0.5) < 4 / N && y > 0.25 && y < 0.75;
  const meet = async (left, dl, right, dr, over = {}, closeup = false) => {
    await lab.create(N);
    const add = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L, y = (j + 0.5) / L;
      if (x < 0.15 || x > 0.85 || y < 0.15 || y > 0.85) continue;
      const [c, d] = x < 0.5 ? [left, dl] : [right, dr];
      const k = (i + j * L) * 4;
      add[k] = c[0] * d; add[k + 1] = c[1] * d; add[k + 2] = c[2] * d; add[k + 3] = d;
    }
    lab.addDye(add); lab.flush(); await lab.step(10);
    const d = await dials(over), r = dialled(d, band, (8 / N) * 0.5);
    // The seam against the two dyes beside it, row by row, with the dial at 1:
    // how far any pixel between the columns lo and hi is outside the two
    // sides' own colours (read at the columns a and b), darker or brighter.
    const seam = (on, a, b, lo, hi, y0, y1) => {
      let dark = 0, bright = 0, sides = 255;
      for (let y = y0; y < y1; y++) {
        const A = [0, 1, 2].map((k) => on[4 * (a + y * W) + k]), B = [0, 1, 2].map((k) => on[4 * (b + y * W) + k]);
        sides = Math.min(sides, far(A, B));
        for (let x = lo; x < hi; x++) for (let k = 0; k < 3; k++) {
          const v = on[4 * (x + y * W) + k];
          dark = Math.max(dark, Math.min(A[k], B[k]) - v); bright = Math.max(bright, v - Math.max(A[k], B[k]));
        }
      }
      return { dark, bright, sides };
    };
    // On the wall: the sides 12 cells out, the band 4 cells either way, the rows the band's selection holds.
    const col = (u) => Math.floor((0.5 + (u - 0.5) * F) * W);
    const wall = (p) => seam(p, col(0.5 - 12 / N), col(0.5 + 12 / N), col(0.5 - 4 / N), col(0.5 + 4 / N) + 1, Math.ceil(0.5 * W - 0.25 * F * W) + 2, Math.floor(0.5 * W + 0.25 * F * W) - 2);
    const on = wall(d.ons[DIALS.indexOf(1)]);
    // In the closeup, centred on the seam, the dial at 1 against 0: the sides a quarter of
    // the frame out, everything between 30% and 70% of it, and what the dial moves there.
    let close = null;
    if (closeup) {
      const cam = { zoom: 2, macroAmount: 1, cx: 0.5, cy: 0.5 }, lo = Math.ceil(0.3 * W), hi = Math.floor(0.7 * W);
      const c1 = await shot(1, over, cam), c0 = await shot(0, over, cam);
      let max = 0;
      for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) max = Math.max(max, moved(c1, c0, x + y * W));
      close = { ...seam(c1, Math.floor(0.25 * W), Math.floor(0.75 * W), lo, hi, lo, hi), max };
    }
    return { max: r.max, n: r.n, ...on, close };
  };
  if (DIALS.indexOf(1) < 0) throw new Error('holeline: the seam is read with the dial at 1, which DIALS does not hold');
  const even = await meet(pink, 1.3, teal, 1.3, {}, true), uneven = await meet(pink, 2.0, teal, 0.4, {}, true);
  // Near hues: the green absorbance moved so exp(-c) moves about 0.08 and 0.2.
  const near = await meet(pink, 1.3, [1.2, 0.414, 0.8], 1.3), nearer = await meet(pink, 1.3, [1.2, 0.614, 0.8], 1.3);
  // The camera's path: the same two dyes photographed.
  const photo = await meet(pink, 1.3, teal, 1.3, { renderStyle: 'photo' });
  return { halo, rim, live, even, uneven, near, nearer, photo, px };
}, { N, SIZE, SIZES, MOVED, HALO_OUT, DIALS });

/*
  Plate A again, with the air handed to the plate and the bubbles not drawn.
  Edge Relief is the setting under test: a render at the look's own value
  against one at 0, so the pool's rim has something to be compared with.
*/
const glow = (page) => page.evaluate(async ({ N, SIZE, SIZES, HOLE_FROM, HOLE_TO, HOLE_REF, ARC_REACH }) => {
  await lab.create(N);
  const F = 1.5, W = SIZE;
  const pink = [1.2, 0.3, 0.8];
  const shot = async (over) => {
    const p = new Uint8ClampedArray(await lab.render(SIZE, { boundaryContrast: 0, ...over }, { zoom: 1, macroAmount: 0, view: true, bubbles: 0, airField: true }));
    if (p.length !== W * W * 4) throw new Error(`holeline: a picture came back ${p.length} bytes, not ${W * W * 4}`);
    return p;
  };
  const C = 0.5, R = 0.29;
  lab.dyeDisc(C, C, R, pink, 1.3);
  lab.flush(); await lab.step(10);
  // The holes sit 28 cells apart with the big ones between small ones, so no
  // hole's ring of 1 to 6 cells reaches another hole or the pool's rim (side by
  // side in size order the 8 and 14 cell holes' rings lay inside each other).
  const ORDER = [3, 14, 1.8, 8, 5].filter((r) => SIZES.includes(r));
  if (ORDER.length !== SIZES.length) throw new Error('holeline: the glow row does not hold every size of SIZES');
  const holes = ORDER.map((r, i) => ({ x: 0.27 + i * 0.11, y: 0.5, r: r / N }));
  // One more hole, 16 cells inside the pool's rim: its reach (3 + 4.5 cells)
  // ends 8.5 cells from the rim, outside the rim ring measured below (6 cells),
  // so the rim line stays equal to the control's by construction. A mask
  // reaching far past 4.5 cells would take the relief of the rim beside it,
  // but that arc is only about 13 % of the ring, so the ring's mean moves by a
  // few percent (a dense 12-cell mask: 0.93 of the control's on the ring, 0.49
  // on the arc). Both are read below: the ring at KEEP_RIM and the arc within
  // ARC_REACH cells of the hole at KEEP_ARC. The lab draws it at the mirror of
  // where its v says (the display's rows), so the pixel it was cut at is found
  // by asking which of the two candidates is not dye. It is not reported as a hole.
  holes.push({ x: C, y: C - R + 16 / N, r: 3 / N, aside: true });
  lab.solver().setBubbles(new Float32Array(holes.flatMap((h) => [h.x, h.y, h.r, 1])), holes.length, 0.25, new Float32Array(holes.length * 4));
  await lab.step(2, { bubbleClear: 1 });
  const on = await shot({}), off = await shot({ edgeRelief: 0 });
  const rgb = (p, i) => [p[4 * i], p[4 * i + 1], p[4 * i + 2]];
  const idx = (u, v) => Math.floor((0.5 + (u - 0.5) * F) * W) + Math.floor((0.5 + (v - 0.5) * F) * W) * W;
  const dev = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
  const dyeAt = (u, v) => {
    const ref = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const c = rgb(on, idx(u, v) + dx + dy * W);
      for (let k = 0; k < 3; k++) ref[k] += c[k] / 25;
    }
    return ref;
  };
  const aside = holes.find((h) => h.aside);
  const askew = [[aside.x, aside.y], [aside.x, 1 - aside.y]].filter(([u, v]) => dev(rgb(on, idx(u, v)), dyeAt(u, v + (v < 0.5 ? 10 : -10) / N)) > 24);
  if (askew.length !== 1) throw new Error(`holeline: the aside hole is cut at ${askew.length} of its two candidate places, not one`);
  const [au, av] = askew[0];
  const out = holes.filter((h) => !h.aside).map((h) => {
    // The dye ten cells out, above the hole: the mean of a 5 x 5 block of
    // pixels, so a dither on one pixel is not the reference.
    const ru = h.x, rv = h.y + h.r + HOLE_REF / N;
    const ref = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const c = rgb(on, idx(ru, rv) + dx + dy * W);
      for (let k = 0; k < 3; k++) ref[k] += c[k] / 25;
    }
    // The reference is dye and the hole is not: the centre is far from it.
    const cut = dev(rgb(on, idx(h.x, h.y)), ref);
    if (!(cut > 24)) throw new Error(`holeline: the hole of ${(h.r * N).toFixed(1)} cells is ${cut.toFixed(1)} levels from the dye ${HOLE_REF} cells out (not cut, or the reference is not dye)`);
    // Two rings: the whole 1 to 6 cells and the 1 to 3 cells nearest the rim,
    // where a small hole's glow is (a hole of 1.8 cells has little else).
    // Each is read two ways: from the dye ten cells out (what the owner sees)
    // and as what Edge Relief moves a pixel there (on against off).
    const rings = [HOLE_TO, 3].map((reach) => {
      const lo = h.r + HOLE_FROM / N, hi = h.r + reach / N;
      let n = 0, sum = 0, moved = 0, worst = 0;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const u = 0.5 + ((x + 0.5) / W - 0.5) / F, v = 0.5 + ((y + 0.5) / W - 0.5) / F;
        const d = Math.hypot(u - h.x, v - h.y);
        if (d < lo || d > hi) continue;
        // Another hole's own ring or reach is not this one's.
        if (holes.some((o) => o !== h && Math.hypot(u - o.x, v - o.y) < o.r + (HOLE_TO + 1) / N)) continue;
        const e = dev(rgb(on, x + y * W), ref);
        n++; sum += e; moved += dev(rgb(on, x + y * W), rgb(off, x + y * W)); if (e > worst) worst = e;
      }
      const want = Math.PI * (hi * hi - lo * lo) * (W * F) ** 2;
      if (n < 0.5 * want) throw new Error(`holeline: the glow ring of the hole of ${(h.r * N).toFixed(1)} cells (to ${reach} cells) picked ${n} pixels of the ${Math.round(want)} its area holds`);
      return { mean: sum / n, moved: moved / n, worst, n };
    });
    return { cells: h.r * N, mean: rings[0].mean, worst: rings[0].worst, n: rings[0].n, moved: rings[0].moved, mean3: rings[1].mean, moved3: rings[1].moved };
  });
  // The pool's rim: what Edge Relief moves a pixel on the ring across it, away
  // from the row of holes.
  let rn = 0, rsum = 0, an = 0, asum = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = 0.5 + ((x + 0.5) / W - 0.5) / F, v = 0.5 + ((y + 0.5) / W - 0.5) / F;
    if (Math.abs(Math.hypot(u - C, v - C) - R) > 6 / N || Math.abs(v - 0.5) < 0.1) continue;
    const e = dev(rgb(on, x + y * W), rgb(off, x + y * W));
    rn++; rsum += e;
    if (Math.hypot(u - au, v - av) < ARC_REACH / N) { an++; asum += e; }
  }
  if (rn < 1000) throw new Error(`holeline: the pool's rim ring picked only ${rn} pixels`);
  if (an < 500) throw new Error(`holeline: the rim arc beside the aside hole picked only ${an} pixels`);
  return { holes: out, rim: rsum / rn, rimN: rn, arc: asum / an, arcN: an };
}, { N, SIZE, SIZES, HOLE_FROM, HOLE_TO, HOLE_REF, ARC_REACH });

const t0 = Date.now(), lap = (what) => console.log(`   (${what}: ${((Date.now() - t0) / 1000).toFixed(0)} s in)`);
const plain = await openLab();
let now, glowNow, glowThen;
try { now = await measure(plain.page); lap('the plain lab measured'); glowNow = await glow(plain.page); lap('and its glow'); } finally { await plain.close(); }

const airOff = await openLab({ plugins: [CONTROL_AIR], tag: 'no-air-mask' });
try {
  if (airOff.js === plain.js) throw new Error('holeline: the air control built the same bundle as the plain lab (its edits matched nothing)');
  glowThen = await glow(airOff.page); lap('the air control');
} finally { await airOff.close(); }

console.log('   what Boundary Contrast moves (0.35, 1 and 2 against 0), in levels:');
for (const h of now.halo) console.log(`     hole ${h.cells.toFixed(1)} cells: at most ${h.max} of ${h.n} ring pixels; centre ${h.cut} levels from the dye, rim at ${h.rim.toFixed(1)} cells`);
console.log(`     pool rim into water: at most ${now.rim.max} (${now.rim.n} pixels); out of focus the dial moves it ${now.live.toFixed(2)} on average`);
for (const [name, k] of [['one depth', 'even'], ['depths five times apart', 'uneven'], ['near hues, about 0.08 apart', 'near'], ['near hues, about 0.2 apart', 'nearer'], ['one depth, photographed', 'photo']]) {
  const r = now[k];
  console.log(`     two dyes meeting, ${name}: at most ${r.max} (${r.n} pixels); the seam ${r.dark} darker than the darker dye beside it and ${r.bright} brighter than the brighter, the two sides ${r.sides} apart${r.close ? `; in the closeup (printed, 18e-7) the dial moves at most ${r.close.max}, the seam ${r.close.dark} and ${r.close.bright}, sides ${r.close.sides} apart` : ''}`);
}

// The plates are what they say, before anything is judged on them.
for (const h of now.halo) {
  if (!(h.cut > MOVED)) throw new Error(`holeline: the hole of ${h.cells.toFixed(1)} cells is not cut in the dye (centre ${h.cut} levels from it)`);
  if (!(Math.abs(h.rim - h.cells) <= RIM_SLACK)) throw new Error(`holeline: the hole of ${h.cells.toFixed(1)} cells has its rim at ${h.rim} cells (the air cut it elsewhere, or wider)`);
}

check(`0. the dial is live: out of focus it moves the pool's rim (${now.live.toFixed(2)} levels > ${LIVE})`, now.live > LIVE);
const most = Math.max(...now.halo.map((h) => h.max));
check(`1. no line round a hole in one dye (at most ${most} levels ≤ ${MAX_MOVE})`, most <= MAX_MOVE);
check(`2. no line round the pool's rim (at most ${now.rim.max} levels ≤ ${MAX_MOVE})`, now.rim.max <= MAX_MOVE);
for (const [name, k] of [['one depth', 'even'], ['depths five times apart', 'uneven'], ['near hues', 'near'], ['nearer hues', 'nearer'], ['one depth, photographed', 'photo']]) {
  check(`3. no line where two dyes meet, ${name} (at most ${now[k].max} levels ≤ ${MAX_MOVE})`, now[k].max <= MAX_MOVE);
}
check(`3b. the seam is the two dyes' own absorbance (${now.even.dark} levels darker than the darker side, ${now.even.bright} brighter than the brighter, ≤ ${SEAM}; the sides ${now.even.sides} apart > ${SIDES})`, now.even.dark <= SEAM && now.even.bright <= SEAM && now.even.sides > SIDES);

for (const [name, r] of [['the shader', glowNow], ['the control (no air mask)', glowThen]]) {
  console.log(`   ${name}, the dye ${HOLE_FROM} to ${HOLE_TO} cells past a hole's rim, from the dye ${HOLE_REF} cells out:`);
  for (const h of r.holes) console.log(`     hole ${h.cells.toFixed(1)} cells: mean ${h.mean.toFixed(2)} levels, at most ${h.worst.toFixed(1)} levels (${h.n} pixels); Edge Relief moves it ${h.moved.toFixed(2)}; within 3 cells: mean ${h.mean3.toFixed(2)}, moved ${h.moved3.toFixed(2)}`);
  console.log(`     pool rim into water: Edge Relief moves a pixel by ${r.rim.toFixed(2)} levels on average (${r.rimN} pixels); within ${ARC_REACH} cells of the aside hole ${r.arc.toFixed(2)} (${r.arcN} pixels)`);
}
const some = (hs, want) => {
  if (hs.length !== want) throw new Error(`holeline: ${hs.length} holes picked, not ${want}`);
  return hs;
};
const bigThen = some(glowThen.holes.filter((h) => h.cells >= 5), 3);
const meanOf = (hs) => Math.max(...hs.map((h) => h.mean));
const leastOf = (hs) => Math.min(...hs.map((h) => h.mean));
check(`the control finds the glow (least ${leastOf(bigThen).toFixed(1)} levels > ${CONTROL_GLOW} on the holes of 5 cells or more)`, leastOf(bigThen) > CONTROL_GLOW);
check(`no glow round a hole (worst mean ${meanOf(glowNow.holes).toFixed(2)} levels < ${MAX_GLOW}; the control reads it on the holes of 5 cells or more, the smaller two are printed)`, meanOf(glowNow.holes) < MAX_GLOW, `the control: ${meanOf(glowThen.holes).toFixed(1)}`);
/*
  The same line asked of Edge Relief itself, on the three cells beside the rim
  where the glow is brightest, and on the holes of 3 cells or more: the
  1.8-cell hole is left out because its mask is only partly there (PLAN 33b-3,
  the control moves it 5.5 levels and the shader 4.6).
*/
const nearNow = some(glowNow.holes.filter((h) => h.cells >= 3), 4), nearThen = some(glowThen.holes.filter((h) => h.cells >= 3), 4);
const nearMax = (hs) => Math.max(...hs.map((h) => h.moved3)), nearMin = (hs) => Math.min(...hs.map((h) => h.moved3));
check(`the control's Edge Relief lights the first 3 cells (least ${nearMin(nearThen).toFixed(1)} levels > ${CONTROL_NEAR}, holes of 3 cells or more)`, nearMin(nearThen) > CONTROL_NEAR);
check(`and the shader's does not (most ${nearMax(nearNow).toFixed(2)} levels < ${MAX_NEAR})`, nearMax(nearNow) < MAX_NEAR);
/*
  The 1.8-cell hole has to be reached at all: the nine taps find it along few
  directions so it is only partly flattened (0.83 of the control's relief at
  3 cells), but with the mask taken out it is all of it (1.0).
*/
const smallNow = glowNow.holes.find((h) => h.cells < 2), smallThen = glowThen.holes.find((h) => h.cells < 2);
check(`the smallest hole is partly flattened (${smallNow.moved3.toFixed(2)} ≤ ${PART_SMALL} × the control's ${smallThen.moved3.toFixed(2)} within 3 cells)`, smallNow.moved3 <= PART_SMALL * smallThen.moved3);
check(`the pool's relief into water is there (the control moves a pixel ${glowThen.rim.toFixed(1)} levels > ${MIN_RIM})`, glowThen.rim > MIN_RIM);
check(`and kept (${glowNow.rim.toFixed(2)} ≥ ${KEEP_RIM} × the control's ${glowThen.rim.toFixed(2)})`, glowNow.rim >= KEEP_RIM * glowThen.rim);
check(`and kept beside a bubble (the arc within ${ARC_REACH} cells of the aside hole ${glowNow.arc.toFixed(2)} ≥ ${KEEP_ARC} × the control's ${glowThen.arc.toFixed(2)})`, glowNow.arc >= KEEP_ARC * glowThen.arc);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
