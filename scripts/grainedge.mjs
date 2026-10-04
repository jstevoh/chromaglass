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
 *      40 of 255 in any channel, a fleck: under 2% of them. With the grain
 *      before the curve it was 6 to 35% in the looks this was found on
 *      (CONTROL below), which must be among those run
 *   2. the edge is where the grainless one is: the grain moves the edge's
 *      pixels by little on average (MAX_EDGE levels, in the worst channel)
 *   3. the grain is still there, in the bodies of the pools, where it was
 *      asked for (PLAN 4c, "pigment texture between the boundaries"), and
 *      it is a texture: what it changes varies from pixel to pixel (the
 *      change less its own 5×5 mean), so one grain value drawn everywhere,
 *      which is what a plate without its grain field would draw, is not
 *      taken for it; and twice the grain is over twice the texture (one grain
 *      value everywhere gives about 1.3 times). Asked only of the
 *      looks whose grain the film stock leaves at 0.2 or more (the stock's
 *      grain stands in for the plate's, plateUniforms.ts); the rest are named
 *   4. the plate is a plate: enough edges and enough lit body to measure,
 *      in every look (an empty band throws rather than reads as no flecks)
 *
 * The band is the grainless picture's steepest tenth, which takes in more
 * than the dye's edges (a gloss line, a rim), and those the grain cannot
 * move: they dilute the share of flecks. The control's 6 to 35% was read
 * through the same band, so the gap it shows is the gap there is.
 *
 * The grain's own texture (the solver's grain field, advected) is used, as
 * the app hands it, so a shear-stretched grain is what is measured; the lab
 * throws if the adapter has none.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, STEPS = 300, SIZE = 720;
/*
  The lines, from the lab on SwiftShader (seven looks, the five CONTROL ones,
  Classic and Home Movie), the grain before the curve against after it:
  flecks 6.1–34.6% of the edge's pixels against 0–0.61%; the edge moved
  13.8–34.7 levels against 1.1–7.2; the bodies' texture, twice the grain over
  the grain, 2.2–5.5 against 2.5–2.9. With the grain field unbound (one grain
  value drawn everywhere, the lab patched to bind none) the edge moved 13–18
  and twice the grain gave 1.24–1.31 the texture: the texture's ratio, not
  its size (0.15–0.33 there, 0.20–0.59 with the grain), is what tells a grain
  from one value.
*/
const FLECK = 40, MAX_FLECKS = 2, MAX_EDGE = 10, MIN_TEXTURE = 0.1, TEXTURE_RATIO = 2, TEXTURE_GRAIN = 0.2;
/** The looks the grain-before-the-curve shader failed check 1 on (6 to 20%, in the worst channel). */
const CONTROL = ['colorful-cosmos', 'jellyfish-bloom', 'stardust-collapse', 'oil-and-water', 'velvet-underground'];
const only = process.env.GRAINEDGE_ONLY?.split(',').map((x) => x.trim()).filter(Boolean);

const { page, close } = await openLab();
const rows = [];
let looks = [];
try {
  // Every shipped look whose grain is on, over the defaults as the app lays it.
  const all = await page.evaluate(() => lab.lookIds());
  const unknown = (only ?? []).filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`GRAINEDGE_ONLY: no look ${unknown.join(', ')}`);
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
      // What the plate draws of it: the film stock's grain takes the plate's
      // place (plateUniforms.ts), so a look on film has less of its own.
      const eff = g0 * (1 - Math.min(1, Math.max(0, Lk.settings.stock ?? 0)));
      const shot = async (set) => new Uint8ClampedArray(await lab.render(SIZE, { ...Lk.settings, ...set }, { zoom: 1, macroAmount: 0, grain: true }));
      const z = await shot({ granulation: 0 }), g = await shot({}), g2 = await shot({ granulation: Math.min(1, 2 * g0) });
      const W = SIZE, P = W * W;
      const lum = (p) => { const L = new Float32Array(P); for (let i = 0; i < P; i++) L[i] = 0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]; return L; };
      const Lz = lum(z), Lg = lum(g), Lg2 = lum(g2);
      // The worst channel's change: a fleck between two hues of one
      // brightness is a fleck.
      const moved = (a, i) => Math.max(Math.abs(a[4 * i] - z[4 * i]), Math.abs(a[4 * i + 1] - z[4 * i + 1]), Math.abs(a[4 * i + 2] - z[4 * i + 2]));
      // The edges are the grainless picture's: where its brightness changes
      // fastest (the top tenth of its gradient among the pixels that change
      // at all). The bodies: lit, and in the slower half.
      const grad = new Float32Array(P);
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; grad[i] = Math.hypot(Lz[i + 1] - Lz[i - 1], Lz[i + W] - Lz[i - W]);
      }
      const changing = Array.from(grad).filter((v) => v > 0.5).sort((a, b) => a - b);
      if (changing.length < 0.05 * P) throw new Error(`${id}: the grainless picture hardly changes anywhere (${changing.length} px): nothing to measure`);
      const hi = changing[Math.floor(changing.length * 0.9)], lo = changing[Math.floor(changing.length * 0.5)];
      // The grain's texture: its change less the change's own 5×5 mean, so
      // what follows the dye (one grain value scaling a smooth pool) is
      // taken out and what varies pixel to pixel is left.
      const texture = (L) => {
        const d = new Float32Array(P); for (let i = 0; i < P; i++) d[i] = L[i] - Lz[i];
        return (i) => { let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += d[i + dy * W + dx]; return d[i] - m / 25; };
      };
      const t1 = texture(Lg), t2 = texture(Lg2);
      let e = 0, eD = 0, eF = 0, b = 0, bT = 0, bT2 = 0;
      for (let y = 3; y < W - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x;
        if (grad[i] >= hi) { const d = moved(g, i); e++; eD += d; if (d > FLECK) eF++; }
        else if (grad[i] < lo && Lz[i] > 20) { b++; bT += t1(i) ** 2; bT2 += t2(i) ** 2; }
      }
      if (e < 0.03 * P || b < 0.03 * P) throw new Error(`${id}: ${e} edge and ${b} body pixels: too few to measure`);
      const f = (v, k = 2) => +v.toFixed(k);
      return { id, g0, eff: f(eff), edge: f(100 * e / P, 1), body: f(100 * b / P, 1), flecks: f(100 * eF / e), edgeMove: f(eD / e), texture: f(Math.sqrt(bT / b), 3), texture2: f(Math.sqrt(bT2 / b), 3) };
    }, { id, SIZE, FLECK });
    rows.push(row);
    console.log(`  ${row.id.padEnd(20)} grain ${row.eff}  edges ${row.edge}%  body ${row.body}%  flecks ${row.flecks}%  edge moved ${row.edgeMove}  body texture ${row.texture} (x2 grain: ${row.texture2})`);
  }
} finally {
  await close();
}

const worst = (list, k, dir = 1) => list.reduce((m, r) => (dir * r[k] > dir * m[k] ? r : m), list[0]);
const fl = worst(rows, 'flecks'), em = worst(rows, 'edgeMove');
const grained = rows.filter((r) => r.eff >= TEXTURE_GRAIN), filmed = rows.filter((r) => r.eff < TEXTURE_GRAIN);
const tx = worst(grained, 'texture', -1);
const controlRun = CONTROL.filter((id) => looks.includes(id));
check(`1. at the dye's edges under ${MAX_FLECKS}% of pixels are flecks of the grain (moved over ${FLECK} levels), in every look, the control's among them`,
  rows.length > 0 && rows.every((r) => r.flecks < MAX_FLECKS) && (only || controlRun.length === CONTROL.length),
  `worst ${fl?.id} ${fl?.flecks}% of ${rows.length} looks; control looks run ${controlRun.length}/${CONTROL.length}`);
check(`2. the edge is the grainless one's: moved under ${MAX_EDGE} levels on average, in every look`,
  rows.length > 0 && rows.every((r) => r.edgeMove < MAX_EDGE), `worst ${em?.id} ${em?.edgeMove}`);
check(`3. the grain is a texture in the bodies (over ${MIN_TEXTURE} levels), and twice the grain over ${TEXTURE_RATIO}x the texture, in every look with ${TEXTURE_GRAIN} or more of it`,
  grained.length > 0 && grained.every((r) => r.texture > MIN_TEXTURE && (r.g0 >= 1 || r.texture2 > r.texture * TEXTURE_RATIO)),
  `least ${tx?.id} ${tx?.texture} (x2: ${tx?.texture2})${filmed.length ? `; on film, not asked: ${filmed.map((r) => r.id).join(', ')}` : ''}`);
check('4. every look\'s plate has edges and lit body to measure (each over 3% of the frame)',
  rows.length > 0 && rows.every((r) => r.edge > 3 && r.body > 3), `${rows.length} looks`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
