#!/usr/bin/env node
/**
 * The pigment's grain inside the dye, not at its edge.
 *
 *   npm run grainedge      (the lab: any adapter that computes)
 *
 * What was reported (2026-10-04), on the laptop's web app: "quite a few of
 * the looks seem very pixelated and look like they are on a computer with
 * poor graphics, less like liquids ... it just looks very digital". Every
 * look photographed at a laptop's size on the Mac (`npm run pixels`) showed
 * the same thing at both the rung the website settles on and the top one:
 * the dye's edges were not lines but a ragged fringe of single flecks, lit
 * and dark, a pixel or two across, like a dithered picture's.
 *
 * The cause was the order of two steps in the plate shader (wgsl/plate.ts).
 * Granulation, the pigment's grain (on at 0.5 in every look), scaled the
 * dye's opacity up and down by a noise; then the gooey contrast curve, which
 * is the meniscus that rounds a pool's edge, steepened that opacity about
 * 0.5 by as much as five times. Inside a pool the opacity is near 1 and the
 * curve's clamp hides the grain; at the edge it is near 0.5, the curve's
 * steepest place, and there every grain went to fully on or fully off. So
 * the edge, the one place a liquid is most smooth, was the one place the
 * grain was a threshold. And the grain's coordinates are carried by the
 * flow, so where the flow shears they are stretched along it and the
 * flecks lined up into streaks.
 *
 * The fix draws the grain after the edge, as what it is: pigment that sits
 * deeper in some places than others, which changes how much light the dye
 * stops (its optical depth), not where the liquid ends. Asked here, of every
 * shipped look with any grain, on one stirred plate of nine pools at 256²
 * (the rung the website's governor gives a laptop most often, and the
 * coarsest), each picture against the same plate with the grain at 0:
 *
 *   1. at the dye's edges (the 10% of the plate where the grainless picture
 *      changes fastest) almost no pixel is moved by the grain by more than
 *      40 of 255 in brightness, a fleck: under 0.5% of them. With the grain
 *      before the curve it was 3 to 15% in the five looks this was found on
 *   2. the edge is where the grainless one is: the grain moves the edge's
 *      pixels by under 7 levels on average (8 to 17 before)
 *   3. the grain is still there, in the bodies of the pools, where it was
 *      asked for (PLAN 4c, "pigment texture between the boundaries"): it
 *      moves their brightness, and twice the grain moves it more
 *   4. the plate is a plate: enough edges and enough lit body to measure
 *
 * The grain's own texture (the solver's grain field, advected) is used, as
 * the app hands it, so a shear-stretched grain is what is measured.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, STEPS = 300, SIZE = 720;
const FLECK = 40, MAX_FLECKS = 0.5, MAX_EDGE = 7;
const only = process.env.GRAINEDGE_ONLY?.split(',');

const { page, close } = await openLab();
const rows = [];
let looks = [];
try {
  // Every shipped look whose grain is on, over the defaults as the app lays it.
  looks = (await page.evaluate(() => lab.lookIds().filter((id) => lab.look(id).settings.granulation > 0)))
    .filter((id) => !only || only.includes(id));
  await page.evaluate(async ({ N, STEPS }) => {
    await lab.create(N);
    // Nine pools of three colours, stirred by pushes for STEPS steps, so the
    // edges are curved, sheared and every way round, and the grain field has
    // been carried as far as a look's first seconds carry it.
    let s = 4242; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) lab.dye(0.15 + 0.7 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [2 * r(), 2 * r(), 2 * r()], 1.0 + r());
    for (let k = 0; k < STEPS / 30; k++) {
      for (let i = 0; i < 6; i++) lab.vel(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.12, [(r() - 0.5) * 0.03, (r() - 0.5) * 0.03, 0, 0]);
      lab.flush(); await lab.step(30);
    }
  }, { N, STEPS });
  for (const id of looks) {
    const row = await page.evaluate(async ({ id, SIZE, FLECK }) => {
      const Lk = lab.look(id);
      const g0 = Lk.settings.granulation;
      const lum = async (set) => {
        const px = await lab.render(SIZE, { ...Lk.settings, ...set }, { zoom: 1, macroAmount: 0, grain: true });
        const L = new Float32Array(SIZE * SIZE);
        for (let i = 0; i < SIZE * SIZE; i++) L[i] = 0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2];
        return L;
      };
      const z = await lum({ granulation: 0 }), g = await lum({}), g2 = await lum({ granulation: Math.min(1, 2 * g0) });
      const W = SIZE;
      // The edges are the grainless picture's: where its brightness changes
      // fastest (the top tenth of its gradient among the pixels that change
      // at all). The bodies: lit, and in the slower half.
      const grad = new Float32Array(W * W);
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; grad[i] = Math.hypot(z[i + 1] - z[i - 1], z[i + W] - z[i - W]);
      }
      const moving = Array.from(grad).filter((v) => v > 0.5).sort((a, b) => a - b);
      const hi = moving[Math.floor(moving.length * 0.9)] ?? Infinity, lo = moving[Math.floor(moving.length * 0.5)] ?? 0;
      let e = 0, eD = 0, eF = 0, b = 0, bD = 0, bD2 = 0;
      for (let y = 2; y < W - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x, d = Math.abs(g[i] - z[i]);
        if (grad[i] >= hi) { e++; eD += d; if (d > FLECK) eF++; }
        else if (grad[i] < lo && z[i] > 20) { b++; bD += d; bD2 += Math.abs(g2[i] - z[i]); }
      }
      const f = (v, k = 2) => +v.toFixed(k);
      return { id, g0, edge: f(100 * e / (W * W), 1), body: f(100 * b / (W * W), 1), flecks: f(100 * eF / Math.max(1, e)), edgeMove: f(eD / Math.max(1, e)), bodyMove: f(bD / Math.max(1, b), 3), bodyMove2: f(bD2 / Math.max(1, b), 3) };
    }, { id, SIZE, FLECK });
    rows.push(row);
    console.log(`  ${row.id.padEnd(20)} grain ${row.g0}  edges ${row.edge}%  body ${row.body}%  flecks ${row.flecks}%  edge moved ${row.edgeMove}  body moved ${row.bodyMove} (x2 grain: ${row.bodyMove2})`);
  }
} finally {
  await close();
}

const worst = (k, dir = 1) => rows.reduce((m, r) => (dir * r[k] > dir * m[k] ? r : m), rows[0]);
const fl = worst('flecks'), em = worst('edgeMove'), bm = worst('bodyMove', -1);
check(`1. at the dye's edges under ${MAX_FLECKS}% of pixels are flecks of the grain (moved over ${FLECK} levels), in every look`,
  rows.length > 0 && rows.every((r) => r.flecks < MAX_FLECKS), `worst ${fl?.id} ${fl?.flecks}% of ${rows.length} looks`);
check(`2. the edge is the grainless one's: moved under ${MAX_EDGE} levels on average, in every look`,
  rows.length > 0 && rows.every((r) => r.edgeMove < MAX_EDGE), `worst ${em?.id} ${em?.edgeMove}`);
check('3. the grain is still in the bodies, and twice the grain moves them more, in every look',
  rows.length > 0 && rows.every((r) => r.bodyMove > 0.05 && (r.g0 >= 1 || r.bodyMove2 > r.bodyMove * 1.3)),
  `least ${bm?.id} ${bm?.bodyMove} (x2: ${bm?.bodyMove2})`);
check('4. every look\'s plate has edges and lit body to measure (each over 3% of the frame)',
  rows.length > 0 && rows.every((r) => r.edge > 3 && r.body > 3), `${rows.length} looks`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
