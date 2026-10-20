#!/usr/bin/env node
/**
 * No line round a bubble's hole; the line between two dyes kept.
 *
 *   npm run holeline      (the lab: any adapter that computes; in Measure's lab part)
 *
 * What was reported (2026-10-19), on the live site: "bubbles still look
 * really pixelated around themselves". Rendered in the lab, every hole the
 * air cuts in the dye had a stepped halo round it, bright and dark blocks a
 * couple of cells out on a cross, a "+" stamped round each small bubble. The
 * dye field under it was clean: with Boundary Contrast at 0 the halo went.
 *
 * The cause was the line drawn between two dyes (boundaryDiff in
 * wgsl/plate.ts, on at 0.35 in every look). It is drawn where the lit colour
 * changes between taps on a cross, and the lit colour is the dye's depth as
 * well as its hue: one dye thinning to nothing at a hole's edge read as two
 * colours meeting, and the taps' offsets drew the cross. The fix gates that
 * line by how far the dye's colour per unit of dye moves between the same
 * taps, which a hole in one dye does not move and two dyes meeting do.
 *
 * Two labs draw the same plates: the shader as it is, and a control built
 * from it with that gate taken out (CONTROL below, an esbuild plugin that
 * must find each of its two edits once, and a bundle that must differ from
 * the plain one). So every run shows that the halo is still there to be
 * found without the gate, and what the gate keeps is judged against the
 * line as it is drawn without it, on the same adapter, in the same run,
 * rather than against numbers remembered from one rasteriser.
 *
 * Asked on plates the lab lays out and the real solver and plate shader
 * draw (the air cut into the dye as the app cuts it, bubbleClear 1, the
 * bubbles' own drawing off so only the hole is seen), each picture against
 * the same plate with Boundary Contrast at 0, so what is measured is only
 * what the line adds. The two shots share a time and a dither laid by pixel,
 * so a pixel the line does not touch differs by exactly nothing:
 *
 *   1. round holes of 1.8 to 14 cells in one flat dye: under MAX_HALO % of the
 *      pixels in a ring from half the hole's radius to HALO_OUT cells past its
 *      rim are moved by the line by more than MOVED levels in any channel,
 *      and none by more than MAX_MOVE levels, so a halo turned down rather
 *      than taken off (a gate set too soft) fails too. The control must find
 *      the halo: more than CONTROL_WORST % on the worst hole, CONTROL_EACH %
 *      on every one (8.9 to 18.3 % read on SwiftShader, 2026-10-19)
 *   2. the pool's own rim into clear water, the same error (one dye's depth
 *      running to nothing, read as a second colour): under MAX_HALO % with
 *      the gate, more than CONTROL_EACH % without it. The pool's edge, its
 *      relief and its meniscus are drawn elsewhere and are untouched
 *   3. two dyes meeting, at one depth and at depths five times apart (a
 *      density gate, tried first, took the second's line off): the line moves
 *      at least KEEP of the pixels the control's line moves in a band across
 *      where they meet, and more than MIN_LINE % of the band, so a line that
 *      drew nothing anywhere fails here, not passes line 1
 *
 * Before any of it is judged, the plates are asked to be what they say:
 * every picture is whole, every ring selects the pixels its area says, and
 * each hole is cut where it was put, its rim within RIM_SLACK cells of its
 * radius along a ray, so a plate whose air missed the dye, or cut it wider
 * and left the ring in clear water (where no line is ever drawn), throws.
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
 *      call taken out of both normals) must find the glow: over CONTROL_GLOW
 *      on every hole of 5 cells or more (a hole of 3 or 1.8 cells is smaller
 *      than the relief's own tap, so what the glow is there is printed)
 *   5. the pool's rim into clear liquid keeps its relief: what Edge Relief
 *      moves a pixel there, on the ring across the rim away from the holes,
 *      is at least KEEP_RIM of what it moves in the control, and above
 *      MIN_RIM levels in the control, so a relief that is not there at all
 *      cannot pass for one that is kept
 *
 * Printed, not judged: the same rings with the bubbles drawn (Bubbles 1,
 * the picture the owner sees), and the line between two dyes of near hue,
 * about 0.08 and 0.2 apart in colour per unit of dye, against the control.
 * The gate fades the line between 0.03 and 0.12, so the first loses some of
 * its line: what the fix gives up, shown rather than hidden.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 768;
const MOVED = 24, MAX_HALO = 1, MAX_MOVE = 4, HALO_OUT = 6, KEEP = 0.8, MIN_LINE = 10;
const CONTROL_WORST = 5, CONTROL_EACH = 3, RIM_SLACK = 1.5;
const SIZES = [1.8, 3, 5, 8, 14];
const HOLE_FROM = 1, HOLE_TO = 6, HOLE_REF = 10, MAX_GLOW = 6, CONTROL_GLOW = 6, KEEP_RIM = 0.8, MIN_RIM = 3, MAX_NEAR = 1, CONTROL_NEAR = 5;

/*
  The control: wgsl/plate.ts with the hue gate taken off the line, so the line
  is drawn as it was before the fix. Each edit must be found exactly once; a
  refactor that renames them makes the control throw rather than quietly
  build the fixed shader twice.
*/
const CONTROL = {
  name: 'no-hue-gate',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let s = readFileSync(a.path, 'utf8');
      for (const cut of [' * hueX;', ' * hueY;']) {
        const found = s.split(cut).length - 1;
        if (found !== 1) throw new Error(`holeline: the control found ${found} of 1 "${cut}" in wgsl/plate.ts`);
        s = s.replace(cut, ';');
      }
      return { contents: s, loader: 'ts' };
    });
  },
};

/*
  The 33b control: wgsl/plate.ts with the air's mask taken off both layers'
  normals, so the dye's relief is drawn at a hole as it was. As above, each
  edit is found once or it throws.
*/
const CONTROL_AIR = {
  name: 'no-air-mask',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let s = readFileSync(a.path, 'utf8');
      for (const k of ['0', '1']) {
        const cut = `vec3f(0.0, 0.0, 1.0), airNear(fuv${k})`;
        const found = s.split(cut).length - 1;
        if (found !== 1) throw new Error(`holeline: the air control found ${found} of 1 "${cut}" in wgsl/plate.ts`);
        s = s.replace(cut, 'vec3f(0.0, 0.0, 1.0), 0.0');
      }
      return { contents: s, loader: 'ts' };
    });
  },
};

const measure = (page) => page.evaluate(async ({ N, SIZE, SIZES, MOVED, HALO_OUT }) => {
  const { L } = await lab.create(N);
  // The frame shows the middle 1/1.5 of the plate (plate.ts), so a point x
  // on the plate is at 0.5 + (x - 0.5) * 1.5 in the picture.
  const F = 1.5, W = SIZE, px = (W * F) / N; // pixels per solver cell, at zoom 1
  const plateAt = (u) => 0.5 + (u - 0.5) / F;
  const pink = [1.2, 0.3, 0.8], teal = [0.2, 1.0, 1.3];
  const shot = async (bc, bubbles = 0) => {
    const p = new Uint8ClampedArray(await lab.render(SIZE, { boundaryContrast: bc }, { zoom: 1, macroAmount: 0, view: true, bubbles }));
    if (p.length !== W * W * 4) throw new Error(`holeline: a picture came back ${p.length} bytes, not ${W * W * 4}`);
    return p;
  };
  const moved = (a, b, i) => Math.max(Math.abs(a[4 * i] - b[4 * i]), Math.abs(a[4 * i + 1] - b[4 * i + 1]), Math.abs(a[4 * i + 2] - b[4 * i + 2]));
  // `area` is the selection's area on the plate; a selection that picks much
  // less than its area (the plate moved, the frame changed) throws rather
  // than reads as nothing moved.
  const share = (on, off, pick, area) => {
    let n = 0, m = 0, max = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (!pick(plateAt((x + 0.5) / W), plateAt((y + 0.5) / W))) continue;
      const d = moved(on, off, x + y * W);
      n++; if (d > MOVED) m++; if (d > max) max = d;
    }
    const want = area * (W * F) ** 2;
    if (n < 0.9 * want) throw new Error(`holeline: a selection picked ${n} pixels of the ${Math.round(want)} its area holds`);
    return { n, pct: (100 * m) / n, max };
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
  const aOn = await shot(0.35), aOff = await shot(0);
  const bOn = await shot(0.35, 1), bOff = await shot(0, 1);
  const halo = holes.map((h) => {
    const lo = 0.5 * h.r, hi = h.r + HALO_OUT / N, area = Math.PI * (hi * hi - lo * lo);
    const ring = (x, y) => { const d = Math.hypot(x - h.x, y - h.y); return d >= lo && d <= hi; };
    const s = share(aOn, aOff, ring, area), drawn = share(bOn, bOff, ring, area);
    // Where the hole's rim is: out from the centre along a ray, the first
    // point within MOVED levels of the dye ten cells past the rim.
    const beside = at(aOff, h.x, h.y + h.r + 10 / N);
    let rim = NaN;
    for (let d = 0; d <= h.r + 10 / N; d += 0.1 / N) if (far(at(aOff, h.x, h.y + d), beside) <= MOVED) { rim = d * N; break; }
    return { cells: h.r * N, pct: s.pct, max: s.max, n: s.n, drawn: drawn.pct, cut: far(at(aOff, h.x, h.y), beside), rim };
  });
  const rim = share(aOn, aOff, (x, y) => Math.abs(Math.hypot(x - C, y - C) - R) < HALO_OUT / N && Math.abs(y - 0.5) > 0.1, 0);

  // Plate B: two dyes meeting down the middle.
  const meet = async (left, dl, right, dr) => {
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
    const on = await shot(0.35), off = await shot(0);
    return share(on, off, (x, y) => Math.abs(x - 0.5) < 4 / N && y > 0.25 && y < 0.75, (8 / N) * 0.5).pct;
  };
  const even = await meet(pink, 1.3, teal, 1.3), uneven = await meet(pink, 2.0, teal, 0.4);
  // Near hues: the green absorbance moved so exp(-c) moves about 0.08 and 0.2.
  const near = await meet(pink, 1.3, [1.2, 0.414, 0.8], 1.3), nearer = await meet(pink, 1.3, [1.2, 0.614, 0.8], 1.3);
  return { halo, rim, even, uneven, near, nearer, px };
}, { N, SIZE, SIZES, MOVED, HALO_OUT });

/*
  Plate A again, with the air handed to the plate and the bubbles not drawn.
  Edge Relief is the setting under test: a render at the look's own value
  against one at 0, so the pool's rim has something to be compared with.
*/
const glow = (page) => page.evaluate(async ({ N, SIZE, SIZES, HOLE_FROM, HOLE_TO, HOLE_REF }) => {
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
  // so a mask that grew past its reach would take the rim's relief and the
  // rim line would no longer be equal to the control's by construction. It is
  // in the list so no ring of the row reaches it, but it is not reported.
  holes.push({ x: C, y: C - R + 16 / N, r: 3 / N, aside: true });
  lab.solver().setBubbles(new Float32Array(holes.flatMap((h) => [h.x, h.y, h.r, 1])), holes.length, 0.25, new Float32Array(holes.length * 4));
  await lab.step(2, { bubbleClear: 1 });
  const on = await shot({}), off = await shot({ edgeRelief: 0 });
  const rgb = (p, i) => [p[4 * i], p[4 * i + 1], p[4 * i + 2]];
  const idx = (u, v) => Math.floor((0.5 + (u - 0.5) * F) * W) + Math.floor((0.5 + (v - 0.5) * F) * W) * W;
  const dev = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
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
  let rn = 0, rsum = 0;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = 0.5 + ((x + 0.5) / W - 0.5) / F, v = 0.5 + ((y + 0.5) / W - 0.5) / F;
    if (Math.abs(Math.hypot(u - C, v - C) - R) > 6 / N || Math.abs(v - 0.5) < 0.1) continue;
    rn++; rsum += dev(rgb(on, x + y * W), rgb(off, x + y * W));
  }
  if (rn < 1000) throw new Error(`holeline: the pool's rim ring picked only ${rn} pixels`);
  return { holes: out, rim: rsum / rn, rimN: rn };
}, { N, SIZE, SIZES, HOLE_FROM, HOLE_TO, HOLE_REF });

const t0 = Date.now(), lap = (what) => console.log(`   (${what}: ${((Date.now() - t0) / 1000).toFixed(0)} s in)`);
const plain = await openLab();
let now, then, glowNow, glowThen;
try { now = await measure(plain.page); lap('the plain lab measured'); glowNow = await glow(plain.page); lap('and its glow'); } finally { await plain.close(); }
const control = await openLab({ plugins: [CONTROL], tag: 'no-hue-gate' });
try {
  if (control.js === plain.js) throw new Error('holeline: the control built the same bundle as the plain lab (its edits matched nothing)');
  then = await measure(control.page); lap('the hue control');
} finally { await control.close(); }

const airOff = await openLab({ plugins: [CONTROL_AIR], tag: 'no-air-mask' });
try {
  if (airOff.js === plain.js) throw new Error('holeline: the air control built the same bundle as the plain lab (its edits matched nothing)');
  glowThen = await glow(airOff.page); lap('the air control');
} finally { await airOff.close(); }

for (const [name, r] of [['the shader', now], ['the control (no hue gate)', then]]) {
  console.log(`   ${name}:`);
  for (const h of r.halo) console.log(`     hole ${h.cells.toFixed(1)} cells: ${h.pct.toFixed(2)}% of ${h.n} ring pixels moved by the line, at most ${h.max} levels; ${h.drawn.toFixed(2)}% with the bubbles drawn; centre ${h.cut} levels from the dye, rim at ${h.rim.toFixed(1)} cells`);
  console.log(`     pool rim into water: ${r.rim.pct.toFixed(2)}% of ${r.rim.n} pixels moved, at most ${r.rim.max} levels`);
  console.log(`     two dyes meeting: ${r.even.toFixed(1)}% of the band at one depth, ${r.uneven.toFixed(1)}% at depths five times apart; near hues (about 0.08 and 0.2 apart) ${r.near.toFixed(1)}% and ${r.nearer.toFixed(1)}% (printed)`);
}

// The plates are what they say, before anything is judged on them.
for (const r of [now, then]) for (const h of r.halo) {
  if (!(h.cut > MOVED)) throw new Error(`holeline: the hole of ${h.cells.toFixed(1)} cells is not cut in the dye (centre ${h.cut} levels from it)`);
  if (!(Math.abs(h.rim - h.cells) <= RIM_SLACK)) throw new Error(`holeline: the hole of ${h.cells.toFixed(1)} cells has its rim at ${h.rim} cells (the air cut it elsewhere, or wider)`);
}

const worst = (r) => Math.max(...r.halo.map((h) => h.pct));
const least = (r) => Math.min(...r.halo.map((h) => h.pct));
check(`the control finds the halo (worst ${worst(then).toFixed(1)}% > ${CONTROL_WORST}%, least ${least(then).toFixed(1)}% > ${CONTROL_EACH}%)`, worst(then) > CONTROL_WORST && least(then) > CONTROL_EACH);
check(`no line round a hole in one dye (worst ${worst(now).toFixed(2)}% < ${MAX_HALO}%)`, worst(now) < MAX_HALO, `the control: ${worst(then).toFixed(1)}%`);
const most = Math.max(...now.halo.map((h) => h.max));
check(`nor a fainter one (at most ${most} levels ≤ ${MAX_MOVE})`, most <= MAX_MOVE);
check(`no line round the pool's rim (${now.rim.pct.toFixed(2)}% < ${MAX_HALO}%; the control ${then.rim.pct.toFixed(1)}% > ${CONTROL_EACH}%)`, now.rim.pct < MAX_HALO && then.rim.pct > CONTROL_EACH);
for (const [name, k] of [['one depth', 'even'], ['depths five times apart', 'uneven']]) {
  check(`the line between two dyes is drawn, ${name} (${now[k].toFixed(1)}% > ${MIN_LINE}%)`, now[k] > MIN_LINE);
  check(`and kept, ${name} (${now[k].toFixed(1)}% ≥ ${KEEP} × the control's ${then[k].toFixed(1)}%)`, now[k] >= KEEP * then[k]);
}

for (const [name, r] of [['the shader', glowNow], ['the control (no air mask)', glowThen]]) {
  console.log(`   ${name}, the dye ${HOLE_FROM} to ${HOLE_TO} cells past a hole's rim, from the dye ${HOLE_REF} cells out:`);
  for (const h of r.holes) console.log(`     hole ${h.cells.toFixed(1)} cells: mean ${h.mean.toFixed(2)} levels, at most ${h.worst.toFixed(1)} levels (${h.n} pixels); Edge Relief moves it ${h.moved.toFixed(2)}; within 3 cells: mean ${h.mean3.toFixed(2)}, moved ${h.moved3.toFixed(2)}`);
  console.log(`     pool rim into water: Edge Relief moves a pixel by ${r.rim.toFixed(2)} levels on average (${r.rimN} pixels)`);
}
const bigNow = glowNow.holes.filter((h) => h.cells >= 5), bigThen = glowThen.holes.filter((h) => h.cells >= 5);
const meanOf = (hs) => Math.max(...hs.map((h) => h.mean));
const leastOf = (hs) => Math.min(...hs.map((h) => h.mean));
check(`the control finds the glow (least ${leastOf(bigThen).toFixed(1)} levels > ${CONTROL_GLOW} on the holes of 5 cells or more)`, leastOf(bigThen) > CONTROL_GLOW);
check(`no glow round a hole (worst mean ${meanOf(glowNow.holes).toFixed(2)} levels < ${MAX_GLOW}, every size)`, meanOf(glowNow.holes) < MAX_GLOW, `the control: ${meanOf(glowThen.holes).toFixed(1)}`);
/*
  The same line asked of Edge Relief itself, on the three cells beside the rim
  where the glow is brightest, and on the holes of 3 cells or more: the
  1.8-cell hole is left out because its mask is only partly there (PLAN 33b-4,
  the control moves it 5.5 levels and the shader 4.6).
*/
const nearNow = glowNow.holes.filter((h) => h.cells >= 3), nearThen = glowThen.holes.filter((h) => h.cells >= 3);
const nearMax = (hs) => Math.max(...hs.map((h) => h.moved3)), nearMin = (hs) => Math.min(...hs.map((h) => h.moved3));
check(`the control's Edge Relief lights the first 3 cells (least ${nearMin(nearThen).toFixed(1)} levels > ${CONTROL_NEAR}, holes of 3 cells or more)`, nearMin(nearThen) > CONTROL_NEAR);
check(`and the shader's does not (most ${nearMax(nearNow).toFixed(2)} levels < ${MAX_NEAR})`, nearMax(nearNow) < MAX_NEAR);
check(`the pool's relief into water is there (the control moves a pixel ${glowThen.rim.toFixed(1)} levels > ${MIN_RIM})`, glowThen.rim > MIN_RIM);
check(`and kept (${glowNow.rim.toFixed(2)} ≥ ${KEEP_RIM} × the control's ${glowThen.rim.toFixed(2)})`, glowNow.rim >= KEEP_RIM * glowThen.rim);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
