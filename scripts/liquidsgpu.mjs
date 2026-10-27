#!/usr/bin/env node
/**
 * Soap, glycerine, milk and silicone on the GPU plate, held to the stand-in's
 * scenes and bars (PLAN 15e).
 *
 *   npm run liquidsgpu      (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * What was there: `npm run liquids` measures the liquids' own forces on a 96²
 * stand-in of plain arrays (scripts/liquidStandIn.mjs), and nothing measured
 * them on the solver the app draws. The app has not run the stand-in's code
 * on the GPU plate since the liquids got fields of their own there: every
 * pour goes to `WebGPUFluid.addLiquidDrop` (LiquidVisualizer's onDeposit),
 * `liquidPhase` stands aside (`gpuNative`), and the GPU carries soap, body,
 * repel, weight and polarity in two textures and pushes the flow with them
 * in `liquidForces` (wgsl/fluid.ts), the same constants as liquidPhase.ts.
 * So whether soap clears a disc on the plate the owner sees was unmeasured.
 *
 * This lays the stand-in's four scenes on the lab's GPU solver, on the plate
 * the looks use (Thin Gap at the default Thickness, 0.45), at the logical
 * grid of the stand-in (96 cells, so a pool of 22 cells is the same pool),
 * the same pools of dye in the same place, and the same pours, at the step
 * the app takes at the default Speed (the lab's dt, 0.004: the app's is
 * 0.2 × 0.0592 × 0.3 = 0.0036). Then it asks two things of each liquid:
 *
 *   The stand-in's bar. The very line liquids.mjs holds the stand-in to:
 *   soap leaves under 92% of the dye at its spot in half a second and under
 *   75% in two, glycerine moves under 0.7 of the plate's speed, milk's pool
 *   ends tighter than bare dye's, silicone's middle under 75% with more dye
 *   in the ring round it than in the middle.
 *
 *   The stand-in's size, within a factor of two. Each liquid's effect (one
 *   less the share of its reading it leaves: 0.56 for soap at half a second,
 *   0.98 for silicone) on the GPU against the stand-in's. The two plates
 *   are not the same plate: the stand-in damps a hundredth a step and never
 *   projects, the GPU's thin gap drags and projects, so the same push can
 *   honestly move the dye some way further or less far. A factor of two
 *   allows that and still catches a liquid whose force arrives a fifth as
 *   strong, or not at all, which a bar alone can miss: a bar is a direction
 *   and a threshold, and soap a fifth as strong still clears a little.
 *
 * Each scene twice, because the app's GPU plate runs the liquids' forces
 * only inside the fold of the frame's deltas (foldDeltas), and the app folds
 * them only on a frame something was laid in (`dirty`: a hand, a drop, a
 * pour; LiquidVisualizer's step):
 *
 *   Every step: a fold before each step, with nothing else in it, as on a
 *   plate where something is laid every frame. The forces as they are when
 *   they run.
 *
 *   A still plate: the fold of the pour's own frame, then steps alone, as
 *   on a plate where nothing else is laid. What a drop of soap does on a
 *   quiet dish.
 *
 * And around them:
 *
 *   An empty plate is left alone: a stirred pool with no liquid poured,
 *   stepped with a fold every step and without, must end the same to a
 *   ten-thousandth of its densest cell (it reads exactly the same on
 *   SwiftShader). Without this, "every step" could be measuring the fold
 *   itself, not the liquids.
 *
 *   Each pour landed: the liquid field's total after the pour is more than
 *   nothing. A pour that never reached the field reads as a liquid with no
 *   force, which is the other failure this check exists to tell apart.
 *
 *   Glycerine's crawl is its own viscosity on a thin gap (PLAN 18d: the
 *   species field, `npm run thick`), so its pour is the app's: the bottle
 *   into the species, and its body into the liquid field, where on a thin
 *   gap liquidForces leaves it alone. The push is Rain Drip on the pool's
 *   colour (thick's way: a force on the pool alone), because a flow laid
 *   across a round dish is projected into a circulation and a pool that
 *   went with it would read its place in that circulation, not its
 *   thickness. Milk's pool is stirred by the turbulence (turbScale 1) where
 *   the stand-in drifts, for the same reason: a uniform drift is not a flow
 *   a closed dish can have. On the old plate (no thin gap) glycerine's
 *   thickness is the body's drag in liquidForces, measured once, every step.
 *
 * Two of the stand-in's lines are weaker than they read, and are held as
 * liquids.mjs holds them, with what they are worth said here. Silicone's
 * "more dye in the ring than the middle" passes on a plate where nothing
 * moved (the ring from 5 to 16 cells holds 306 to the middle's 67 before
 * the pour): "clears the middle" is the line that measures silicone, and the
 * plate's dye before and after is printed beside it, because the soap in it
 * thins the dye it lies on (the deltaDye multiply, a named shortcut, 15e-5)
 * on both plates: the ring loses dye on the stand-in too (306 to 262). And
 * milk's held edge is 0.4% of its spread on the stand-in, 1.2% on the GPU:
 * the GPU passes the bar and is three times the stand-in, so its "as strong
 * as" line is owed to 15e-4, milk's edge as a real one, not to a fix of the
 * GPU's push.
 *
 * Lines marked owed are measured and printed and do not fail the run: each
 * names the PLAN item that fixes it, and fails the run the day it passes,
 * so the fix promotes it to a gating line rather than leaving it owed. On
 * SwiftShader (2026-10-27) soap, milk and silicone do nothing on a still
 * plate (15e-1: glycerine still crawls there, its thickness being the thin
 * gap's own drag, every step), and where they run they arrive at about a
 * fifth of the stand-in's push (15e-2): the GPU scales each force by the solver's step,
 * 0.004, where the stand-in, and the app's CPU before the GPU had the
 * liquids, scaled it by the frame's 1/60 s. Folded with 1/60 in place of
 * 0.004 (a copy of this check, every fold's dt changed and nothing else) the
 * same soap leaves 50% at two seconds, the stand-in 54%, and both of the
 * "every step" lines owed to 15e-2 pass: soap at half a second by a hair
 * (effect 0.288 against the 0.280 a factor of two allows), silicone 0.826.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';
import { soapScene, glycerineScene, milkScene, siliconeScene } from './liquidStandIn.mjs';

/** Lines measured and owed by a PLAN item: printed, never failing, until they pass. */
const OWED = {
  'soap, a still plate: drives dye out of the spot': '15e-1',
  'soap, a still plate: the disc stays open': '15e-1',
  'soap, a still plate: as strong as the stand-in at half a second': '15e-1, 15e-2',
  'soap, a still plate: as strong as the stand-in at two seconds': '15e-1',
  'milk, a still plate: keeps its pool tighter than bare dye': '15e-1',
  'milk, a still plate: as strong as the stand-in': '15e-1, 15e-4',
  'silicone, a still plate: clears the middle': '15e-1',
  'silicone, a still plate: as strong as the stand-in': '15e-1, 15e-2',
  'soap, every step: as strong as the stand-in at half a second': '15e-2',
  'silicone, every step: as strong as the stand-in': '15e-2',
  'milk, every step: as strong as the stand-in': '15e-4',
  'glycerine on the old plate, every step: crawls where the plate flows': '15e-3',
};

const checks = [];
const check = (name, ok, detail = '') => {
  const owed = OWED[name];
  const failed = owed ? !!ok : !ok;
  checks.push({ name, failed });
  const tag = owed ? (ok ? 'FAIL' : 'owed') : ok ? 'ok  ' : 'FAIL';
  const why = owed ? (ok ? ` (passes now: take it out of OWED so it gates; PLAN ${owed})` : ` (PLAN ${owed})`) : '';
  console.log(` ${tag} ${name}${detail ? ` — ${detail}` : ''}${why}`);
};
/** The GPU's effect against the stand-in's: within a factor of two either way. */
const FACTOR = 2;
const agrees = (gpu, standIn) => gpu > standIn / FACTOR && gpu < standIn * FACTOR;
const f3 = (v) => v.toFixed(3);

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async () => {
    const L = 96, N = 128;
    const THIN = { thinGap: 1, gapThickness: 0.45, gapSpring: 0 };
    /** Plate units of a stand-in cell's middle: cell i of 96 lies at (i + 0.5) / 96. */
    const at = (c) => (c + 0.5) / L;
    const dyeAt = (d, i, j) => d[(i + j * L) * 4 + 3];
    const within = (d, cx, cy, rad) => { let s = 0; for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (Math.hypot(i - cx, j - cy) <= rad) s += dyeAt(d, i, j); return s; };
    const total = (d) => { let s = 0; for (let k = 0; k < L * L; k++) s += d[k * 4 + 3]; return s; };
    const spread = (d) => {
      let s = 0, mx = 0, my = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const a = dyeAt(d, i, j); if (a <= 0) continue; s += a; mx += a * i; my += a * j; }
      const cx = mx / s, cy = my / s;
      let w = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const a = dyeAt(d, i, j); if (a > 0) w += a * Math.hypot(i - cx, j - cy); }
      return w / s;
    };
    /** The stand-in's pool, cell for cell: 1 − d/r of density at cell (cx, cy), as liquidStandIn's `pool`. */
    const pool = (cx, cy, rad) => {
      const data = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const d = Math.hypot(i - cx, j - cy);
        if (d > rad) continue;
        const f = 1 - d / rad, k = (i + j * L) * 4;
        data[k] = f; data[k + 1] = 0.6 * f; data[k + 2] = 0.3 * f; data[k + 3] = f;
      }
      lab.addDye(data);
    };
    /*
      The GPU's own liquid fields, from the solver itself rather than the
      lab's API, so this check reaches no other check's page: `addLiquidDrop`
      is the solver's own call (the one the app's onDeposit makes), and its
      first liquid texture (soap, body, repel, weight) is read back through
      the same downsample `readField` reads the dye with.
    */
    const drop = (x, y, rad, what) => lab.solver().addLiquidDrop(x, y, rad, what, 1);
    const liquidField = async () => {
      const s = lab.solver(), device = s.device;
      s.simF[0] = s.N; s.simF[1] = s.L;
      device.queue.writeBuffer(s.sim, 0, s.simData);
      const enc = device.createCommandEncoder({ label: 'read liquids' });
      const pass = enc.beginComputePass();
      s.run(pass, 'downsample', s.readTarget, [s.liquids0.read], s.arg('none', [0, 0, 0, 0]), s.L);
      pass.end();
      const row = s.rbRow;
      const buf = device.createBuffer({ size: row * s.L, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      enc.copyTextureToBuffer({ texture: s.readTarget }, { buffer: buf, bytesPerRow: row }, [s.L, s.L]);
      device.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const padded = new Float32Array(buf.getMappedRange().slice(0));
      buf.unmap(); buf.destroy();
      return (i, c) => padded[Math.floor(i / L) * (row / 4) + (i % L) * 4 + c];
    };
    /** The liquid field's total in one channel (0 soap, 1 body, 2 repel): did the pour land? */
    const landed = async (ch) => { const f = await liquidField(); let s = 0; for (let k = 0; k < L * L; k++) s += Math.abs(f(k, ch)); return s; };
    /** `n` steps; with `every`, a fold of the (empty) deltas before each, as on a frame something was laid in. */
    const go = async (every, n, over = {}) => {
      if (!every) { await lab.step(n, { ...THIN, ...over }); return; }
      for (let k = 0; k < n; k++) { lab.flush(); await lab.step(1, { ...THIN, ...over }); }
    };
    const scenes = async (every) => {
      const out = {};
      // Soap: a pool of 22 cells, a spot of soap of 6 at its middle.
      {
        await lab.create(N, L);
        pool(48, 48, 22); lab.flush();
        const d0 = await lab.field('dye');
        drop(at(48), at(48), 6 / L, { soap: 1 });
        lab.flush();
        const soapLaid = await landed(0);
        await go(every, 30);
        const d1 = await lab.field('dye');
        await go(every, 90);
        const d2 = await lab.field('dye');
        out.soap = { before: within(d0, 48, 48, 8), early: within(d1, 48, 48, 8), late: within(d2, 48, 48, 8), laid: soapLaid, left: await landed(0), dye0: total(d0), dye2: total(d2) };
      }
      // Glycerine: a flat pool of colour under Rain Drip, with the bottle poured on it and without.
      for (const g of [false, true]) {
        await lab.create(N, L);
        lab.dyeDisc(at(30), at(48), 10 / L, [1, 0, 0], 1);
        if (g) {
          lab.addSpecies(at(30), at(48), 10 / L, 50, 'glycerine');
          drop(at(30), at(48), 10 / L, { body: 1 });
        }
        lab.flush();
        const d = await lab.field('dye');
        const bodyLaid = g ? await landed(1) : 0;
        await go(every, 90, { drip: 0.5, meanDensity: total(d) / (L * L) });
        const v = await lab.field('vel'), d2 = await lab.field('dye');
        let w = 0, vx = 0, vy = 0;
        for (let k = 0; k < L * L; k++) { const a = d2[k * 4 + 3]; w += a; vx += a * v[k * 4]; vy += a * v[k * 4 + 1]; }
        out[g ? 'glycerine' : 'plain'] = { speed: Math.hypot(vx, vy) / w, laid: bodyLaid, dye: w };
      }
      // Milk: a pool of 12 cells on a stirred plate, bare and with repel poured over all of it.
      for (const m of [false, true]) {
        await lab.create(N, L);
        pool(48, 48, 12); lab.flush();
        if (m) { drop(at(48), at(48), 12 / L, { repel: 1 }); lab.flush(); }
        const repelLaid = m ? await landed(2) : 0;
        await go(every, 120, { turbScale: 1 });
        out[m ? 'milk' : 'bare'] = { spread: spread(await lab.field('dye')), laid: repelLaid };
      }
      // Silicone: a pool of 20 cells, a spot of 7 at its middle.
      {
        await lab.create(N, L);
        pool(48, 48, 20); lab.flush();
        const d0 = await lab.field('dye');
        drop(at(48), at(48), 7 / L, { soap: 0.8, repel: 0.4 });
        lab.flush();
        const laid = await landed(0);
        await go(every, 72);
        const d1 = await lab.field('dye');
        const before = within(d0, 48, 48, 5), after = within(d1, 48, 48, 5);
        out.silicone = { before, after, ring: within(d1, 48, 48, 16) - after, ringBefore: within(d0, 48, 48, 16) - before, laid, dye0: total(d0), dye1: total(d1) };
      }
      return out;
    };
    const every = await scenes(true);
    const still = await scenes(false);
    // The control: the fold alone changes nothing on a plate with no liquid.
    const empty = [];
    for (const e of [true, false]) {
      await lab.create(N, L);
      pool(48, 48, 12); lab.flush();
      await go(e, 60, { turbScale: 1 });
      empty.push(await lab.field('dye'));
    }
    let diff = 0, top = 0;
    for (let k = 0; k < empty[0].length; k++) { diff = Math.max(diff, Math.abs(empty[0][k] - empty[1][k])); top = Math.max(top, Math.abs(empty[1][k])); }
    // Glycerine on the old plate (no thin gap): its thickness is the body's drag, every step.
    const old = {};
    for (const g of [false, true]) {
      await lab.create(N, L);
      lab.dyeDisc(at(30), at(48), 10 / L, [1, 0, 0], 1);
      if (g) drop(at(30), at(48), 10 / L, { body: 1 });
      lab.flush();
      const d = await lab.field('dye');
      for (let k = 0; k < 90; k++) { lab.flush(); await lab.step(1, { thinGap: 0, drip: 0.5, meanDensity: total(d) / (L * L) }); }
      const v = await lab.field('vel'), d2 = await lab.field('dye');
      let w = 0, vx = 0, vy = 0;
      for (let k = 0; k < L * L; k++) { const a = d2[k * 4 + 3]; w += a; vx += a * v[k * 4]; vy += a * v[k * 4 + 1]; }
      old[g ? 'glycerine' : 'plain'] = Math.hypot(vx, vy) / w;
    }
    return { every, still, empty: { diff, top }, old, adapter: lab.adapter() };
  });
} finally { await close(); }

const sIn = { soap: soapScene(), glycerine: glycerineScene(), milk: milkScene(), silicone: siliconeScene() };
const std = {
  soapEarly: 1 - sIn.soap.early / sIn.soap.before,
  soapLate: 1 - sIn.soap.late / sIn.soap.before,
  glycerine: 1 - sIn.glycerine.thickSpeed / sIn.glycerine.plainSpeed,
  milk: 1 - sIn.milk.tight / sIn.milk.loose,
  silicone: 1 - sIn.silicone.after / sIn.silicone.before,
};
console.log(`  adapter: ${r.adapter?.vendor ?? '?'} ${r.adapter?.architecture ?? ''}`.trimEnd());
console.log(`  the stand-in's effects: soap ${f3(std.soapEarly)} at 0.5 s and ${f3(std.soapLate)} at 2 s, glycerine ${f3(std.glycerine)}, milk ${f3(std.milk)}, silicone ${f3(std.silicone)}`);

check('an empty plate: a fold every step changes nothing', r.empty.diff <= r.empty.top * 1e-4,
  `largest difference ${r.empty.diff.toExponential(2)} against its densest cell ${r.empty.top.toFixed(3)}`);

for (const [mode, m] of [['every step', r.every], ['a still plate', r.still]]) {
  const s = m.soap;
  const early = s.early / s.before, late = s.late / s.before;
  console.log(`  soap, ${mode}: dye within 8 cells ${s.before.toFixed(0)} → ${s.early.toFixed(0)} → ${s.late.toFixed(0)}; soap laid ${s.laid.toFixed(1)}, ${s.left.toFixed(1)} left at 2 s; the plate's dye ${s.dye0.toFixed(0)} → ${s.dye2.toFixed(0)}`);
  check(`soap, ${mode}: the pour landed`, s.laid > 1, `${s.laid.toFixed(1)} of soap in the field`);
  check(`soap, ${mode}: drives dye out of the spot`, early < 0.92, `${(early * 100).toFixed(1)}% of it left at 0.5 s (the stand-in ${(sIn.soap.early / sIn.soap.before * 100).toFixed(1)}%, bar 92%)`);
  check(`soap, ${mode}: the disc stays open`, late < 0.75, `${(late * 100).toFixed(1)}% at 2 s (the stand-in ${(sIn.soap.late / sIn.soap.before * 100).toFixed(1)}%, bar 75%)`);
  check(`soap, ${mode}: as strong as the stand-in at half a second`, agrees(1 - early, std.soapEarly), `effect ${f3(1 - early)} against ${f3(std.soapEarly)}`);
  check(`soap, ${mode}: as strong as the stand-in at two seconds`, agrees(1 - late, std.soapLate), `effect ${f3(1 - late)} against ${f3(std.soapLate)}`);

  const g = m.glycerine.speed / m.plain.speed;
  console.log(`  glycerine, ${mode}: the pool falls at ${m.plain.speed.toFixed(4)} as colour, ${m.glycerine.speed.toFixed(4)} as glycerine`);
  check(`glycerine, ${mode}: the pour landed`, m.glycerine.laid > 1, `${m.glycerine.laid.toFixed(1)} of body in the field`);
  check(`glycerine, ${mode}: crawls where the plate flows`, g < 0.7 && m.glycerine.dye > 0, `${f3(g)} of the colour's speed (the stand-in ${f3(sIn.glycerine.thickSpeed / sIn.glycerine.plainSpeed)}, bar 0.7)`);
  check(`glycerine, ${mode}: as strong as the stand-in`, agrees(1 - g, std.glycerine), `effect ${f3(1 - g)} against ${f3(std.glycerine)}`);

  const k = m.milk.spread / m.bare.spread;
  console.log(`  milk, ${mode}: spread about its centre ${m.bare.spread.toFixed(3)} bare, ${m.milk.spread.toFixed(3)} held`);
  check(`milk, ${mode}: the pour landed`, m.milk.laid > 1, `${m.milk.laid.toFixed(1)} of repel in the field`);
  check(`milk, ${mode}: keeps its pool tighter than bare dye`, k < 1, `${f3(k)} of bare dye's spread (the stand-in ${f3(sIn.milk.tight / sIn.milk.loose)})`);
  check(`milk, ${mode}: as strong as the stand-in`, agrees(1 - k, std.milk), `effect ${(1 - k).toFixed(4)} against ${std.milk.toFixed(4)}`);

  const c = m.silicone;
  const mid = c.after / c.before;
  console.log(`  silicone, ${mode}: middle ${c.before.toFixed(0)} → ${c.after.toFixed(0)}, the ring ${c.ringBefore.toFixed(0)} → ${c.ring.toFixed(0)}; the plate's dye ${c.dye0.toFixed(0)} → ${c.dye1.toFixed(0)}`);
  check(`silicone, ${mode}: the pour landed`, c.laid > 1, `${c.laid.toFixed(1)} of soap in the field`);
  check(`silicone, ${mode}: clears the middle`, mid < 0.75, `${(mid * 100).toFixed(1)}% left (the stand-in ${(sIn.silicone.after / sIn.silicone.before * 100).toFixed(1)}%, bar 75%)`);
  check(`silicone, ${mode}: and more dye in the ring than the middle`, c.ring > c.after, `${c.ring.toFixed(0)} against ${c.after.toFixed(0)}`);
  check(`silicone, ${mode}: as strong as the stand-in`, agrees(1 - mid, std.silicone), `effect ${f3(1 - mid)} against ${f3(std.silicone)}`);
}

const og = r.old.glycerine / r.old.plain;
check('glycerine on the old plate, every step: crawls where the plate flows', og < 0.7,
  `${og.toFixed(4)} of the colour's speed (${r.old.glycerine.toFixed(5)} against ${r.old.plain.toFixed(5)})`);
check('no GPU errors', gpuErrors.length === 0, gpuErrors[0] ?? '');

const failed = checks.filter((c) => c.failed);
const owed = checks.filter((c) => OWED[c.name]).length;
console.log(`\n${checks.length - owed - failed.filter((c) => !OWED[c.name]).length}/${checks.length - owed} gating checks passed, ${owed} owed (PLAN 15e-1 to 15e-4)${failed.length ? `, ${failed.length} failed` : ''}`);
process.exit(failed.length ? 1 : 0);
