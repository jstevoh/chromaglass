#!/usr/bin/env node
/**
 * No line round a bubble's hole; the line between two dyes kept.
 *
 *   npm run holeline      (the lab: any adapter that computes)
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
 * Asked here, on plates the lab lays out and the real solver and plate shader
 * draw (the air cut into the dye as the app cuts it, bubbleClear 1, the
 * bubbles' own drawing off so only the hole is seen), each picture against the
 * same plate with Boundary Contrast at 0, so what is measured is only what the
 * line adds:
 *
 *   1. round holes of 1.8 to 14 cells in one flat dye: under MAX_HALO % of the
 *      pixels in a ring from half the hole's radius to HALO_OUT cells past its
 *      rim are moved by the line by more than MOVED levels in any channel.
 *      Before the fix: CONTROL_HALO below
 *   2. two dyes meeting, at one depth and at depths five times apart (a
 *      density gate, tried first, took the second's line off): the line still
 *      moves at least KEEP of the pixels it moved before the fix (BEFORE_*), in a band
 *      across where they meet, and that is more than MIN_LINE % of the band,
 *      so a line that drew nothing anywhere would fail here, not pass line 1
 *   3. the holes are holes: each one's centre is more than MOVED levels from
 *      the dye beside it, in the picture with the line off, so a plate whose
 *      air was not cut (or was cut somewhere else) throws rather than reads as
 *      no halo
 *
 * The edge of a pool into clear water is printed, not judged. It is the
 * same error as the hole's (one dye's depth running to nothing, read as a
 * second colour) and the fix takes the line off it as well, 16.8 % of the
 * pixels round the rim moved before and none after; the pool's own edge,
 * its relief and its meniscus are drawn elsewhere and are untouched.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 768;
/*
  From the lab on SwiftShader (2026-10-19), the shader before the fix: the
  line moved 8.9, 8.9, 11.5, 13.6 and 18.3 % of the ring round holes of 1.8,
  3, 5, 8 and 14 cells (none after), and 52.8 % and 61.1 % of the band where
  two dyes meet at one depth and at depths five times apart (52.8 % and
  58.3 % after). BEFORE_* are those two, which the line must keep KEEP of.
*/
const MOVED = 24, MAX_HALO = 1, HALO_OUT = 6, KEEP = 0.8, MIN_LINE = 10;
const SIZES = [1.8, 3, 5, 8, 14];
const CONTROL_HALO = 'before the fix: 8.9 to 18.3 %';
const BEFORE_EVEN = 52.8, BEFORE_UNEVEN = 61.1;

const { page, close } = await openLab();
let out;
try {
  out = await page.evaluate(async ({ N, SIZE, SIZES, MOVED, HALO_OUT }) => {
    const { L } = await lab.create(N);
    // The frame shows the middle 1/1.5 of the plate (plate.ts), so a point x
    // on the plate is at 0.5 + (x - 0.5) * 1.5 in the picture.
    const F = 1.5, W = SIZE, px = (W * F) / N; // pixels per solver cell, at zoom 1
    const plateAt = (u) => 0.5 + (u - 0.5) / F;
    const pink = [1.2, 0.3, 0.8], teal = [0.2, 1.0, 1.3];
    const shot = async (bc) => new Uint8ClampedArray(await lab.render(SIZE, { boundaryContrast: bc }, { zoom: 1, macroAmount: 0, view: true, bubbles: 0 }));
    const moved = (a, b, i) => Math.max(Math.abs(a[4 * i] - b[4 * i]), Math.abs(a[4 * i + 1] - b[4 * i + 1]), Math.abs(a[4 * i + 2] - b[4 * i + 2]));
    const share = (on, off, pick) => {
      let n = 0, m = 0;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        if (!pick(plateAt((x + 0.5) / W), plateAt((y + 0.5) / W))) continue;
        n++; if (moved(on, off, x + y * W) > MOVED) m++;
      }
      return { n, pct: n ? (100 * m) / n : 0 };
    };

    // Plate A: one flat dye, a pool whose rim is inside the plate, and a row
    // of holes across its middle.
    const C = 0.5, R = 0.33;
    lab.dyeDisc(C, C, R, pink, 1.3);
    lab.flush(); await lab.step(10);
    const holes = SIZES.map((r, i) => ({ x: 0.28 + i * 0.11, y: 0.5, r: r / N }));
    const list = holes.flatMap((h) => [h.x, h.y, h.r, 1]);
    lab.solver().setBubbles(new Float32Array(list), holes.length, 0.25, new Float32Array(holes.length * 4));
    await lab.step(2, { bubbleClear: 1 });
    const aOn = await shot(0.35), aOff = await shot(0);
    const at = (p, x, y) => { const u = 0.5 + (x - 0.5) * F, v = 0.5 + (y - 0.5) * F; const i = Math.floor(u * W) + Math.floor(v * W) * W; return [p[4 * i], p[4 * i + 1], p[4 * i + 2]]; };
    const halo = holes.map((h) => {
      const lo = 0.5 * h.r, hi = h.r + HALO_OUT / N;
      const s = share(aOn, aOff, (x, y) => { const d = Math.hypot(x - h.x, y - h.y); return d >= lo && d <= hi; });
      const c = at(aOff, h.x, h.y), beside = at(aOff, h.x, h.y + h.r + 10 / N);
      return { cells: h.r * N, pct: s.pct, n: s.n, cut: Math.max(...c.map((v, k) => Math.abs(v - beside[k]))) };
    });
    // The pool's own rim into clear water, away from the holes' row.
    const rim = share(aOn, aOff, (x, y) => Math.abs(Math.hypot(x - C, y - C) - R) < HALO_OUT / N && Math.abs(y - 0.5) > 0.1);

    // Plate B: two dyes meeting down the middle, at one depth and at two.
    const meet = async (dl, dr) => {
      await lab.create(N);
      const add = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const x = (i + 0.5) / L, y = (j + 0.5) / L;
        if (x < 0.15 || x > 0.85 || y < 0.15 || y > 0.85) continue;
        const [c, d] = x < 0.5 ? [pink, dl] : [teal, dr];
        const k = (i + j * L) * 4;
        add[k] = c[0] * d; add[k + 1] = c[1] * d; add[k + 2] = c[2] * d; add[k + 3] = d;
      }
      lab.addDye(add); lab.flush(); await lab.step(10);
      const on = await shot(0.35), off = await shot(0);
      return share(on, off, (x, y) => Math.abs(x - 0.5) < 4 / N && y > 0.25 && y < 0.75);
    };
    const even = await meet(1.3, 1.3), uneven = await meet(2.0, 0.4);
    return { halo, rim, even, uneven, px };
  }, { N, SIZE, SIZES, MOVED, HALO_OUT });
} finally {
  await close();
}

const { halo, rim, even, uneven } = out;
for (const h of halo) console.log(`   hole ${h.cells.toFixed(1)} cells: ${h.pct.toFixed(2)}% of ${h.n} ring pixels moved by the line; centre ${h.cut} levels from the dye`);
console.log(`   pool rim into water: ${rim.pct.toFixed(2)}% of ${rim.n} pixels moved (printed, not judged)`);
console.log(`   two dyes meeting: ${even.pct.toFixed(1)}% of the band at one depth, ${uneven.pct.toFixed(1)}% at depths five times apart`);

const worst = Math.max(...halo.map((h) => h.pct));
check(`no line round a hole in one dye (worst ${worst.toFixed(2)}% < ${MAX_HALO}%)`, worst < MAX_HALO, CONTROL_HALO);
for (const [name, s, before] of [['one depth', even, BEFORE_EVEN], ['depths five times apart', uneven, BEFORE_UNEVEN]]) {
  check(`the line between two dyes is drawn, ${name} (${s.pct.toFixed(1)}% > ${MIN_LINE}%)`, s.pct > MIN_LINE);
  check(`and kept, ${name} (${s.pct.toFixed(1)}% ≥ ${KEEP} × ${before}%)`, s.pct >= KEEP * before);
}
const uncut = halo.filter((h) => h.cut <= MOVED);
if (uncut.length) throw new Error(`holeline: no hole cut at ${uncut.map((h) => h.cells.toFixed(1)).join(', ')} cells (the air missed the dye, or landed elsewhere)`);
check('every hole is cut in the dye', true);

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} FAIL` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
