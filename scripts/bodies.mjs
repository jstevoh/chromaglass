#!/usr/bin/env node
/**
 * Oil Bodies: oil and water on the plate as two bodies, each keeping its own
 * colour, measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run bodies
 *
 * Roadmap §I, PLAN.md batch 10 step 5. The plate had one dye field and the
 * oil was a second field beside it that the dye knew nothing about, so
 * "amber oil on teal water" was amber and teal blending wherever the two
 * met, and an oil drop that moved (by the flow, or by Cahn–Hilliard, which
 * moves the oil with no liquid moving) left its colour behind. With Oil
 * Bodies the oil carries its own share of the dye (bodyPartition and
 * bodyAdvect in src/gpu/wgsl/fluid.ts). This asks whether the colours stay
 * in their liquids while the liquids move, not whether a pass ran:
 *
 *   1. after a stir with the bodies rounding and merging, the oil's colour
 *      left in the open water, and the water's colour inside the bodies,
 *      against the same plate with the setting off (the control)
 *   2. the plate makes and loses no dye doing it
 *   3. at 0 the oil's share is never made: a look that does not ask for it
 *      runs the plate it always did, and pays nothing
 *   4. dye poured over a body becomes the body's colour, and dye poured on
 *      open water stays the water's (bodyLand)
 *   5. a hand dragging the oil moves the oil and keeps all of it (mixCarry)
 *   6. and the oil's own surface tension no longer eats the colour inside a
 *      drop: a settled drop keeps its dye with the setting off too. It kept
 *      41% in 120 steps before the tension was rebuilt (mixForce), which on
 *      the plate was an oil drop gone black in a second.
 *
 * The plate: 192² (the lab's display size, so the dye is read back cell for
 * cell), seven oil drops and a strip of nine overlapping ones, amber inside
 * the oil and teal in the water, laid from the oil actually on the plate so
 * the colour starts exactly where its liquid is. Then 360 steps with Oil
 * Tension 0.9: the strip rounds and drops that touch merge. (It had the
 * look's motor stirring the middle too, until PLAN 22j took that stir out of
 * the solver; it moved nothing this measures, the plate moving 51.4% with it
 * and 51.6% without.) Amber and teal are told apart by
 * their absorbances (teal takes red, amber blue), solved per cell from the
 * red and blue channels; "open water" is a cell under 0.05 oil and "inside a
 * body" over 0.95, the band between is the edge and belongs to neither.
 *
 * Measured while writing this, on software WebGPU (the bounds below are set
 * well short of these, and well clear of the control or the old solver):
 *
 *   ① the plate moved: 51.4% of the start's body cells were not body cells
 *     at the end, on and off alike                                  > 25%
 *     and the oil the same on and off, cell for cell   0.0 apart   < 1e-3
 *     amber in open water after the stir   0.14%   (off 7.76%)    < 0.5%, off > 10×
 *     teal inside the bodies               0.01%   (off 0.30%)    < 0.1%, off > 3×
 *     amber per unit of oil 1.225, teal per unit of water 0.801 (laid 1.2
 *     and 0.8; off 0.600 and 0.766)                                 ±10%
 *     negative residue of the two-colour reading 0.00%              < 0.5%
 *   ② dye 30702.2 → 30702.2, amber 3633.1 → 3633.2, teal 27069.1 → 27069.3,
 *     oil 3026.8 → 3026.8 (off lost 11.5% of its dye)               < 1%
 *   ④ a dab over a body: 100.0% the oil's, and all the oil took still its own
 *     30 steps on; on water 0.00%, 99.9% of both dabs arrived; across the
 *     edge 46.1% the oil's against 46.1% predicted from the oil under it
 *   ⑤ the oil's middle moved 0.0102 of the plate right, 0.0000 across (the
 *     CPU copy of mixCarry predicts 0.0103); 100.00% of it kept
 *   ⑥ a settled drop keeps 85.7% of the dye inside it (41% with the old
 *     force, as a share of the whole plate's)                       > 80%
 *
 * And what it took to get ① there, each found by this check: the colour laid
 * as dye landed a tenth of the amber as the water's (so the check now lays
 * each liquid's colour as its own); the evening-out's regulariser let open
 * water hold a fiftieth of the oil's colour by right, which the hand-over
 * then gave to the water; the dye's diffusion spread the oil's colour past
 * the rim; and the flow's transport smeared it out a cell or two a second,
 * which only a drift back toward the oil undoes. 10.3% → 6.5% → 2.0% → 0.14%.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else (about twenty minutes there).
 */
import { openLab } from './lab.mjs';

// The share of the start's body cells a stir of 360 steps must leave (see ①):
// half the 51.4% it measured, on and off alike. A plate whose step was
// dropped (a kernel that failed validation drops the whole encoder) moves
// none, and fails here before any colour row can pass on it.
const MOVED = 0.25;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
const STEPS = 360;
const TEAL = [1.1, 0.25, 0.35];
const AMBER = [0.1, 0.5, 1.5];
const { page, close } = await openLab();
// A kernel that fails validation drops the whole step's encoder: the plate
// then does not move at all, keeps every colour where it was, and would pass
// the separation checks below on nothing. The lab only prints GPU errors, so
// they are counted here and fail the run.
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  // Seven drops and a strip; the oil first, one step so the setting is known
  // to the solver, then the colour laid from where the oil is.
  const lay = (bodies) => page.evaluate(async ({ N, bodies, TEAL, AMBER }) => {
    await lab.create(N, N);
    const s = lab.solver();
    let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 7; k++) s.addMix(0.18 + 0.64 * rnd(), 0.18 + 0.64 * rnd(), 0.035 + 0.04 * rnd(), { oil: 1 });
    for (let k = 0; k < 9; k++) s.addMix(0.3 + k * 0.05, 0.5, 0.03, { oil: 1 });
    await lab.step(1, { oilTension: 0.9, oilBodies: bodies });
    const m = await s.readChemistry('mix');
    const d = new Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const c = Math.max(0, Math.min(1, m.data[i * 4]));
      for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = 0.8 * (1 - c) * TEAL[ch] + 1.2 * c * AMBER[ch];
      d[i * 4 + 3] = 0.8 * (1 - c) + 1.2 * c;
    }
    lab.addDye(d);
    lab.flush();
    // With the bodies on, the amber is the oil's from the start. Laid as dye
    // alone it lands split by the oil under it, and on a rim four cells wide
    // that gave the water a tenth of the amber before the stir began (2.6%
    // of it in open water after 30 steps, 9.6% after 360, all as the water's
    // share): a check of the landing, which ④ makes, not of the bodies.
    if (bodies > 0) {
      const o = new Array(N * N * 4);
      for (let i = 0; i < N * N; i++) {
        const c = Math.max(0, Math.min(1, m.data[i * 4]));
        for (let ch = 0; ch < 3; ch++) o[i * 4 + ch] = 1.2 * c * AMBER[ch];
        o[i * 4 + 3] = 1.2 * c;
      }
      lab.share(o);
    }
  }, { N, bodies, TEAL, AMBER });

  /*
    Amber and teal per cell from the red and blue absorbances, and the oil.
    Each is solved per cell and can come out a little negative where the
    per-channel limiters and half floats leave a colour that is not an exact
    mix of the two; summed signed, a leak could cancel against that residue,
    so the positive parts are summed and the negative parts reported (and
    held small, or the two-colour reading does not describe the plate).
    Beside the shares: each colour's concentration in its own liquid (amber
    per unit of oil deep in the bodies, laid at 1.2; teal per unit of water
    in open water, laid at 0.8), which catches colour piled on or drained
    from the rim, the band both shares leave out.
  */
  const read = () => page.evaluate(async ({ N, TEAL, AMBER }) => {
    const d = await lab.field('dye'); const m = await lab.solver().readChemistry('mix');
    const det = TEAL[0] * AMBER[2] - AMBER[0] * TEAL[2];
    let amber = 0, teal = 0, neg = 0, amberOut = 0, tealIn = 0, mass = 0, oil = 0;
    let amberBody = 0, cBody = 0, tealWater = 0, wWater = 0;
    const cs = new Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const R = d[i * 4], B = d[i * 4 + 2];
      const t = (R * AMBER[2] - AMBER[0] * B) / det, a = (TEAL[0] * B - TEAL[2] * R) / det;
      const ap = Math.max(0, a), tp = Math.max(0, t);
      const c = m.data[i * 4];
      cs[i] = c;
      amber += ap; teal += tp; neg += Math.max(0, -a) + Math.max(0, -t); mass += d[i * 4 + 3]; oil += c;
      if (c < 0.05) { amberOut += ap; tealWater += tp; wWater += 1 - c; }
      if (c > 0.95) { tealIn += tp; amberBody += ap; cBody += c; }
    }
    return { amber, teal, neg: neg / (amber + teal), amberOut: amberOut / amber, tealIn: tealIn / teal, mass, oil,
      amberConc: amberBody / cBody, tealConc: tealWater / wWater, cs };
  }, { N, TEAL, AMBER });

  const stir = { oilTension: 0.9, maxCurrent: 0.01, currentDamp: 0.97 };
  const arm = async (bodies) => {
    await lay(bodies);
    const start = await read();
    await page.evaluate(([n, o]) => lab.step(n, o), [STEPS, { ...stir, oilBodies: bodies }]);
    const end = await read();
    // How much of the plate's body moved: the start's body cells that are
    // body no longer. A step dropped whole leaves this at nothing.
    let was = 0, gone = 0;
    for (let i = 0; i < N * N; i++) if (start.cs[i] > 0.95) { was++; if (end.cs[i] <= 0.95) gone++; }
    return { start, end, moved: gone / was };
  };
  const off = await arm(0);
  const on = await arm(1);
  const pct = (v, n = 2) => `${(v * 100).toFixed(n)}%`;
  for (const [name, r] of [['off', off], ['on ', on]]) {
    console.log(`  ${name}: amber in open water ${pct(r.start.amberOut)} → ${pct(r.end.amberOut)}, `
      + `teal inside the bodies ${pct(r.start.tealIn)} → ${pct(r.end.tealIn)}, `
      + `amber per unit of oil ${r.start.amberConc.toFixed(3)} → ${r.end.amberConc.toFixed(3)}, `
      + `teal per unit of water ${r.start.tealConc.toFixed(3)} → ${r.end.tealConc.toFixed(3)}, `
      + `dye ${r.start.mass.toFixed(1)} → ${r.end.mass.toFixed(1)}, oil ${r.start.oil.toFixed(1)} → ${r.end.oil.toFixed(1)}, `
      + `body moved ${pct(r.moved, 1)}, negative residue ${pct(r.end.neg)}`);
  }
  let oilDiff = 0;
  for (let i = 0; i < N * N; i++) oilDiff = Math.max(oilDiff, Math.abs(on.end.cs[i] - off.end.cs[i]));

  // ── 1 ──
  check('the plate moved', on.moved > MOVED && off.moved > MOVED,
    `${pct(on.moved, 1)} of the body cells were body no longer at the end (${pct(off.moved, 1)} with it off)`);
  check('and the bodies moved the oil as it moves with them off', oilDiff < 1e-3,
    `the oil differs by at most ${oilDiff.toExponential(1)} a cell`);
  check('the oil\'s colour stays out of the open water', on.end.amberOut < 0.005,
    `${pct(on.end.amberOut)} of the amber in open water after the stir`);
  check('and the water\'s colour out of the bodies', on.end.tealIn < 0.001,
    `${pct(on.end.tealIn)} of the teal inside a body`);
  check('with the setting off, the same stir fails both', off.end.amberOut >= 0.005 && off.end.tealIn >= 0.001,
    `${pct(off.end.amberOut)} of the amber in open water, ${pct(off.end.tealIn)} of the teal in a body`);
  check('each colour keeps its strength in its own liquid, rims included',
    Math.abs(on.end.amberConc / 1.2 - 1) < 0.1 && Math.abs(on.end.tealConc / 0.8 - 1) < 0.1,
    `amber per unit of oil ${on.end.amberConc.toFixed(3)} (laid at 1.2), teal per unit of water ${on.end.tealConc.toFixed(3)} (0.8)`);
  check('and the reading holds: the plate is the two colours', on.end.neg < 0.005,
    `negative residue ${pct(on.end.neg)} of the colour`);
  // ── 2 ──
  check('no dye is made or lost', Math.abs(on.end.mass / on.start.mass - 1) < 0.01
      && Math.abs(on.end.amber / on.start.amber - 1) < 0.01 && Math.abs(on.end.teal / on.start.teal - 1) < 0.01,
    `dye ${on.start.mass.toFixed(1)} → ${on.end.mass.toFixed(1)}, amber ${on.start.amber.toFixed(1)} → ${on.end.amber.toFixed(1)}, teal ${on.start.teal.toFixed(1)} → ${on.end.teal.toFixed(1)}`);
  check('and no oil', Math.abs(on.end.oil / on.start.oil - 1) < 0.01,
    `${on.start.oil.toFixed(1)} → ${on.end.oil.toFixed(1)}`);

  // ── 3 ──
  const made = (bodies) => page.evaluate(async (bodies) => {
    await lab.create(128);
    lab.solver().addMix(0.5, 0.5, 0.2, { oil: 1 });
    lab.dye(0.5, 0.5, 0.3, [0.5, 0.5, 0.5], 1); lab.flush();
    await lab.step(20, { oilTension: 0.9, oilBodies: bodies });
    try { await lab.field('oilDye'); return 'made'; } catch (e) {
      if (/no oilDye field/.test(String(e))) return 'never made';
      throw e;
    }
  }, bodies);
  const zero = await made(0), one = await made(1);
  check('at 0 the oil\'s share is never made (and at 1 it is)', zero === 'never made' && one === 'made', `at 0 ${zero}, at 1 ${one}`);

  // ── 4 ──
  // Off the plate's middle line, so a flip of the landing's lookup either
  // way puts the dab somewhere else; and a third dab across the edge, where
  // the split is the oil's share of each cell and not a switch.
  const land = await page.evaluate(async () => {
    await lab.create(128, 128);
    const s = lab.solver();
    s.addMix(0.3, 0.35, 0.15, { oil: 1 });
    await lab.step(30, { oilTension: 0.9, oilBodies: 1 });
    const sum = async (which) => { const o = await lab.field(which); let t = 0; for (let k = 3; k < o.length; k += 4) t += o[k]; return t; };
    const disc = (x, y, r) => { const w = new Float64Array(128 * 128);
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
        const dx = (i + 0.5) / 128 - x, dy = (j + 0.5) / 128 - y; w[i + j * 128] = Math.max(0, 1 - (dx * dx + dy * dy) / (r * r)); }
      return w; };
    const dab = (() => { let t = 0; for (const v of disc(0.3, 0.35, 0.06)) t += v; return t; })();
    const s0 = await sum('oilDye'), t0 = await sum('dye');
    lab.dye(0.3, 0.35, 0.06, [0.5, 0.5, 0.5], 1); lab.flush();
    const s1 = await sum('oilDye');
    lab.dye(0.75, 0.35, 0.06, [0.5, 0.5, 0.5], 1); lab.flush();
    const s2 = await sum('oilDye'), t2 = await sum('dye');
    const m = await s.readChemistry('mix');
    const w = disc(0.45, 0.35, 0.06); let wc = 0, ww = 0;
    for (let i = 0; i < w.length; i++) { wc += w[i] * Math.max(0, Math.min(1, m.data[i * 4])); ww += w[i]; }
    lab.dye(0.45, 0.35, 0.06, [0.5, 0.5, 0.5], 1); lab.flush();
    const s3 = await sum('oilDye'), t3 = await sum('dye');
    await lab.step(30, { oilTension: 0.9, oilBodies: 1 });
    const s4 = await sum('oilDye');
    return { onOil: (s1 - s0) / dab, onWater: (s2 - s1) / dab, arrived: (t2 - t0) / (2 * dab),
      edge: (s3 - s2) / (t3 - t2), predicted: wc / ww, kept: (s4 - s0) / (s3 - s0) };
  });
  check('dye poured over a body becomes its colour', land.onOil > 0.95 && land.kept > 0.9,
    `${pct(land.onOil, 1)} of a dab over the body went to the oil, and of all the oil took ${pct(land.kept, 1)} is still its own 30 steps on`);
  check('and dye poured on open water stays the water\'s', Math.abs(land.onWater) < 0.01 && Math.abs(land.arrived - 1) < 0.01,
    `${pct(land.onWater)} of a dab on the water went to the oil; ${pct(land.arrived, 1)} of both dabs reached the plate`);
  check('and across the edge each cell\'s share goes by the oil in it', Math.abs(land.edge - land.predicted) < 0.02,
    `${pct(land.edge, 1)} of a dab across the edge went to the oil, ${pct(land.predicted, 1)} predicted from the oil under it`);

  // ── 5 ──
  const carry = await page.evaluate(async () => {
    await lab.create(128, 128);
    const s = lab.solver();
    s.addMix(0.4, 0.35, 0.1, { oil: 1 });
    await lab.step(1, { oilTension: 0.9, oilBodies: 1 });
    const cm = async () => { const m = await s.readChemistry('mix'); let t = 0, x = 0, y = 0;
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const c = m.data[(i + j * 128) * 4]; t += c; x += c * (i + 0.5) / 128; y += c * (j + 0.5) / 128; }
      return { t, x: x / t, y: y / t }; };
    const a = await cm();
    // Ten drags to the right through the drop's middle, as fingerDrag hands them over with Thin Gap off
    // (on a thin gap the Finger is a solid and the flow carries the oil: `npm run fingerflow`).
    for (let k = 0; k < 10; k++) s.carryMix(0.4 + k * 0.01, 0.35, 0.06, 1, 0, 0.5, 2 / 128);
    const b = await cm();
    return { moved: b.x - a.x, across: b.y - a.y, kept: b.t / a.t };
  });
  // 0.0103 predicted by a CPU copy of the splat's profile and mixCarry.
  check('a hand drags the oil the way it went', carry.moved > 0.007 && carry.moved < 0.014 && Math.abs(carry.across) < 0.001,
    `the oil's middle moved ${carry.moved.toFixed(4)} of the plate to the right and ${carry.across.toFixed(4)} across`);
  check('and keeps all of it', Math.abs(carry.kept - 1) < 0.005, `${pct(carry.kept)} of the oil`);

  // ── 6 ──
  // The plate the 41% was measured on, so the two numbers are one
  // comparison: a 128 grid read at the lab's 192, a flat disc of oil two
  // fifths of the plate across with dye laid on it as a disc of the same
  // size. The dye counted is the dye still in the drop (over half oil), so
  // colour spread out of it and kept on the plate does not pass as kept.
  const drop = await page.evaluate(async () => {
    await lab.create(128);
    const s = lab.solver(); const L = 192;
    const d = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5;
      const q = Math.min(1, Math.max(0, (0.2 - Math.hypot(x, y)) * 128 / 1.5 + 0.5));
      const k = (i + j * L) * 4; d[k] = 0.1 * q; d[k + 1] = 0.5 * q; d[k + 2] = 1.5 * q; d[k + 3] = q;
    }
    lab.addDye(d);
    s.addMix(0.5, 0.5, 0.2, { oil: 1 });
    lab.flush();
    const inDrop = async () => {
      const f = await lab.field('dye'); const m = await s.readChemistry('mix'); let t = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const c = m.data[(Math.floor(i * 128 / L) + Math.floor(j * 128 / L) * 128) * 4];
        if (c > 0.5) t += f[(i + j * L) * 4 + 3];
      }
      return t;
    };
    const a = await inDrop();
    await lab.step(120, { oilTension: 0.9, oilBodies: 0 });
    return (await inDrop()) / a;
  });
  check('a settled drop keeps its colour with the setting off', drop > 0.8,
    `${pct(drop, 1)} of its dye still in it after 120 steps (41% of the plate's before the tension was rebuilt)`);

  check('no GPU errors', gpuErrors.length === 0, gpuErrors.length ? gpuErrors[0] : 'none');
} finally {
  await close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
