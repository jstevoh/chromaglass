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

const plain = await openLab();
let now, then;
try { now = await measure(plain.page); } finally { await plain.close(); }
const control = await openLab({ plugins: [CONTROL], tag: 'no-hue-gate' });
try {
  if (control.js === plain.js) throw new Error('holeline: the control built the same bundle as the plain lab (its edits matched nothing)');
  then = await measure(control.page);
} finally { await control.close(); }

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

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
