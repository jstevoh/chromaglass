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
 *   2. the grain is still there, in the bodies of the pools, where it was
 *      asked for (PLAN 4c, "pigment texture between the boundaries"), and
 *      it is a texture: what it changes varies from pixel to pixel (the
 *      change less its own 5×5 mean), so one grain value drawn everywhere,
 *      which is what a plate without its grain field would draw, is not
 *      taken for it; and twice the grain is over twice the texture (one grain
 *      value everywhere gives about 1.3 times). Asked only of the
 *      looks whose grain the film stock leaves at 0.2 or more (the stock's
 *      grain stands in for the plate's, plateUniforms.ts); the rest are named
 *   3. the plate is a plate: enough edges and enough lit body to measure,
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

  The edge's average move is printed but not judged. A line on it (under 10
  levels) went red on the Mac once the lamp looks landed (PLAN 18b): on the
  lamp the light comes through the thin dye at an edge, and the grain's soft
  mottle there moves the edge's pixels 9 to 10.6 levels on average with no
  fleck among them (0.04–0.47%), the same before this change as after it
  (Poster 1969 10.63 and 10.63), where a flecked edge read 13.8 and up. A
  mean cannot tell a fringe from a texture; the flecks can, and one grain
  value everywhere is caught by the texture's ratio (line 2).
*/
const FLECK = 40, MAX_FLECKS = 2, MIN_TEXTURE = 0.1, TEXTURE_RATIO = 2, TEXTURE_GRAIN = 0.2;
/** The looks the grain-before-the-curve shader failed check 1 on (6 to 20%, in the worst channel). */
const CONTROL = ['classic', 'jellyfish-bloom', 'stardust-collapse', 'oil-and-water', 'velvet-underground'];
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
  // The front plate in every look, then the back plate alone in each lamp look (line 4).
  const lampLooks = await page.evaluate((ids) => ids.filter((id) => (lab.look(id).settings.lampGround ?? 0) > 0), looks);
  for (const [id, back] of [...looks.map((id) => [id, false]), ...lampLooks.map((id) => [id, true])]) {
    const row = await page.evaluate(async ({ id, SIZE, FLECK, back }) => {
      const Lk = lab.look(id);
      const g0 = Lk.settings.granulation;
      // What the plate draws of it: the film stock's grain takes the plate's
      // place (plateUniforms.ts), so a look on film has less of its own.
      const eff = g0 * (1 - Math.min(1, Math.max(0, Lk.settings.stock ?? 0)));
      // Roy's comic print (Ben-Day Dots) decides ink or paper for every pixel
      // of the finished picture, by design: any change in the picture under it
      // flips some, grain or not, so it is the plate under the print that is
      // asked here. The print's own edges are benday's (and PLAN 1f).
      const under = (Lk.settings.benDay ?? 0) > 0 ? { benDay: 0 } : {};
      // The back plate alone: two plates, the front's level at 0 (the mixer
      // fades it to the bare lamp, so the back plate filters the lamp itself),
      // and no satellite droplets, which still read the front plate's dye.
      const alone = back ? { layerCount: 2, frontLevel: 0, microDroplets: 0 } : {};
      const shot = async (set) => new Uint8ClampedArray(await lab.render(SIZE, { ...Lk.settings, ...under, ...alone, ...set }, { zoom: 1, macroAmount: 0, grain: true, backPlate: back }));
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
      // Line 4's two readings. The grain's texture in the log of the light, in
      // the dense bodies: on the lamp the picture is lamp × T^k, so
      // ln(grained / grainless) is (grain − 1)·ln T, whatever the lamp's level
      // or tint, and it is near 0 under a law that leaves the grain out of a
      // dense body. Dense: a body pixel under half the bare glass (the grainless
      // picture's 99th percentile) and over 20 (8-bit rounding is 1/40 there).
      const sorted = Array.from(Lz).sort((p, q) => p - q), bare = sorted[Math.floor(P * 0.99)];
      const lr = new Float32Array(P); for (let i = 0; i < P; i++) lr[i] = Math.log((Lg[i] + 0.5) / (Lz[i] + 0.5));
      const logHi = (i) => { let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += lr[i + dy * W + dx]; return lr[i] - m / 25; };
      let dn = 0, dT = 0, lone = 0;
      // A fleck as line 1 means it, a pixel or two across: moved over FLECK
      // with at most one of its four neighbours moved as far, as against the
      // grain's mottle, whose moves come in patches.
      const far = (i) => moved(g, i) > FLECK;
      let e = 0, eD = 0, eF = 0, b = 0, bT = 0, bT2 = 0;
      for (let y = 3; y < W - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x;
        if (grad[i] >= hi) { const d = moved(g, i); e++; eD += d; if (d > FLECK) { eF++; if (far(i - 1) + far(i + 1) + far(i - W) + far(i + W) <= 1) lone++; } }
        else if (grad[i] < lo && Lz[i] > 20) { b++; bT += t1(i) ** 2; bT2 += t2(i) ** 2; if (Lz[i] < 0.5 * bare) { dn++; dT += logHi(i) ** 2; } }
      }
      if (e < 0.03 * P || b < 0.03 * P) throw new Error(`${id}: ${e} edge and ${b} body pixels: too few to measure`);
      const f = (v, k = 2) => +v.toFixed(k);
      return { id: `${id}${under.benDay === 0 ? ' (under its print)' : ''}${back ? ' (back plate)' : ''}`, back, g0, eff: f(eff), edge: f(100 * e / P, 1), body: f(100 * b / P, 1), flecks: f(100 * eF / e), edgeMove: f(eD / e), texture: f(Math.sqrt(bT / b), 3), texture2: f(Math.sqrt(bT2 / b), 3), dense: f(100 * dn / P, 1), logTex: f(Math.sqrt(dT / Math.max(1, dn)), 4), lone: f(100 * lone / e) };
    }, { id, SIZE, FLECK, back });
    rows.push(row);
    console.log(`  ${row.id.padEnd(20)} grain ${row.eff}  edges ${row.edge}%  body ${row.body}%  flecks ${row.flecks}%  edge moved ${row.edgeMove}  body texture ${row.texture} (x2 grain: ${row.texture2})  dense ${row.dense}% log texture ${row.logTex}  lone flecks ${row.lone}%`);
  }
} finally {
  await close();
}

const f2 = (v) => +v.toFixed(2);
const worst = (list, k, dir = 1) => list.reduce((m, r) => (dir * r[k] > dir * m[k] ? r : m), list[0]);
const backRows = rows.filter((r) => r.back);
rows.splice(0, rows.length, ...rows.filter((r) => !r.back));
const fl = worst(rows, 'flecks'), em = worst(rows, 'edgeMove');
const grained = rows.filter((r) => r.eff >= TEXTURE_GRAIN), filmed = rows.filter((r) => r.eff < TEXTURE_GRAIN);
const tx = worst(grained, 'texture', -1);
const controlRun = CONTROL.filter((id) => looks.includes(id));
check(`1. at the dye's edges under ${MAX_FLECKS}% of pixels are flecks of the grain (moved over ${FLECK} levels), in every look, the control's among them`,
  rows.length > 0 && rows.every((r) => r.flecks < MAX_FLECKS) && (only || controlRun.length === CONTROL.length),
  `worst ${fl?.id} ${fl?.flecks}% of ${rows.length} looks; control looks run ${controlRun.length}/${CONTROL.length}; the edge moved most in ${em?.id}, ${em?.edgeMove} on average (not judged: see above)`);
check(`2. the grain is a texture in the bodies (over ${MIN_TEXTURE} levels), and twice the grain over ${TEXTURE_RATIO}x the texture, in every look with ${TEXTURE_GRAIN} or more of it`,
  grained.length > 0 && grained.every((r) => r.texture > MIN_TEXTURE && (r.g0 >= 1 || r.texture2 > r.texture * TEXTURE_RATIO)),
  `least ${tx?.id} ${tx?.texture} (x2: ${tx?.texture2})${filmed.length ? `; on film, not asked: ${filmed.map((r) => r.id).join(', ')}` : ''}`);
check('3. every look\'s plate has edges and lit body to measure (each over 3% of the frame)',
  rows.length > 0 && rows.every((r) => r.edge > 3 && r.body > 3), `${rows.length} looks`);
/*
  4. The back plate's grain, on the lamp (PLAN 38h-4). 38h made the front
  plate's lamp take the pigment's grain as more or less pigment, T^grain;
  the back plate's lamp still took the grain's share of the opacity
  (grainedDepth), which is 1 in a body near opaque and near the grain only
  where the dye is thin. Drawn alone (the front's level at 0, and no
  satellite droplets, which read the front's dye), the back plate is asked
  what line 2 asks of the front, in every lamp look, and two things more.

  The law, read where the two laws part: in the dense bodies the grain's
  texture in the log of the light, (grain − 1)·ln T, at least BACK_VS_FRONT
  of the front plate's in the same look (same dye, same grain field, same
  law). In the log, not in levels: the back plate alone is drawn brighter
  than the front (Chemical Clock's bare glass 255 against 137, PLAN 38h-12),
  and in levels the brighter picture's texture reached the front's under
  the old law (Chemical Clock 0.114 and 0.99 of the front's passed). In the
  log, on SwiftShader over the eleven lamp looks: the old law 0.28 to 0.44 of
  the front's in every one, Chemical Clock 0.44; T^grain 1.00 to 1.50.

  Its edges: the same law in a brighter picture moves more of an edge past
  FLECK levels (Poster 1969 10% against 0.53%), in patches, the grain's
  mottle; flecks as line 1 means them, single pixels, are judged under
  MAX_FLECKS (0.55% at most, Poster 1969; the old law 0.3%), and the patches
  are printed (38h-12, docs/judging.md).
*/
const BACK_VS_FRONT = 0.9;
const frontOf = new Map(rows.map((r) => [r.id, r]));
const bgr = backRows.filter((r) => r.eff >= TEXTURE_GRAIN).map((r) => {
  const fr = frontOf.get(r.id.replace(' (back plate)', ''));
  return { ...r, frontDense: fr?.dense ?? 0, ofFront: fr ? f2(r.logTex / Math.max(1e-6, fr.logTex)) : 0 };
});
const btx = worst(bgr, 'texture', -1), bof = worst(bgr, 'ofFront', -1), bln = worst(backRows, 'lone'), bfl = worst(backRows, 'flecks');
// GRAINEDGE_ONLY with no lamp look among those named leaves the line unasked, not passed.
if (!only || backRows.length) check(`4. the back plate alone, in every lamp look with ${TEXTURE_GRAIN} or more grain: a texture in its bodies over ${MIN_TEXTURE} levels that twice the grain takes over ${TEXTURE_RATIO}x, in its dense bodies a log texture at least ${BACK_VS_FRONT} of the front plate's, under ${MAX_FLECKS}% single-pixel flecks at its edges, edges, body and dense body (both plates) each over 3%, 3% and 1%`,
  backRows.length > 0 && bgr.length > 0
    && backRows.every((r) => r.edge > 3 && r.body > 3 && r.lone < MAX_FLECKS)
    && bgr.every((r) => r.texture > MIN_TEXTURE && r.dense > 1 && r.frontDense > 1 && r.ofFront >= BACK_VS_FRONT && (r.g0 >= 1 || r.texture2 > r.texture * TEXTURE_RATIO)),
  `${backRows.length} lamp looks; least texture ${btx?.id} ${btx?.texture} (x2: ${btx?.texture2}); least log texture of the front's ${bof?.id} ${bof?.ofFront}; single-pixel flecks most ${bln?.id} ${bln?.lone}%; all moves past ${FLECK} most ${bfl?.id} ${bfl?.flecks}% (printed)`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
