#!/usr/bin/env node
/**
 * Each poured liquid is as thick as it really is (PLAN 18d): on a thin gap,
 * does a pool of glycerine, alcohol or the clear liquid itself answer a push
 * as its own viscosity says? Measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run thick
 *
 * What was there: every bottle's thickness was one number on the CPU, `body`,
 * a drag against last frame's velocity added as a delta, and the thin gap's
 * drag knew one viscosity for the whole plate (the look's Thickness) and the
 * ferrofluid's. A pool of glycerine in the default clear liquid fell under
 * Rain Drip as fast as a pool of colour: the lab has no CPU, so the before
 * reading is the old plate's: the same pours with the thin gap's drag told
 * not to read the species (`readsSpecies`), measured and printed beside each.
 *
 * Each check is a consequence of Darcy's law with a number it gives. Between
 * two glasses the flow is u = M(f − ∇p), M ∝ 1/ν, and a circular pool of
 * mobility λ times the liquid's round it, pushed by a force on the pool
 * alone (Rain Drip weighs only the colour), moves at 2λ/(1+λ) of what a pool
 * of the surrounding liquid would: the liquid round it has to get out of
 * its way, and the pressure that makes it shares the push. On the grid both
 * ways read about an eighth further from 1 than the formula (0.044 for
 * glycerine and 2.04 for syrup on a pool 19 cells across, 0.049 and 2.05 on
 * this one of 10): the face between a poured cell and a clear one takes
 * the harmonic mean of the two, twice the lesser, so the pool's edge is a
 * little more open to the flow than a sharp one. The bands allow it and
 * still part each reading from 1 (the plate before 18d) and from what a
 * solve that ignored the plate round the pool would give (λ itself).
 *
 *   1. Glycerine in the default clear liquid (Thickness 0.45, 22 mm²/s;
 *      glycerine 1120 mm²/s, λ = 1/50): 2λ/(1+λ) = 0.039 of a pool of colour
 *      alone. Asked between 0.02 and 0.1, and it is still moving (not a
 *      pool stopped dead by a bad number, which would read 0). The same
 *      pour with the species not read must fall as colour alone, to 2%: the
 *      plate before 18d, and the proof that the difference is the viscosity.
 *   2. Alcohol (1.52 mm²/s) in a clear liquid as thin as itself (Thickness
 *      0.06, 1.51 mm²/s), λ = 1: as fast as colour alone, to 2%. This is
 *      what catches the clear liquid's viscosity read back wrong (hsPrep's
 *      12ν/W² with the dish's width): a plate width 5% off reads 0.95.
 *   3. Thin in thick: syrup (111 mm²/s) in the thickest look (Thickness 1,
 *      1000 mm²/s, λ = 9): 2λ/(1+λ) = 1.8, near the most a pool can be sped
 *      up by being thinner than what it is in. Asked over 1.5 and under 2.3
 *      (λ, 9, if the pool moved as though nothing were round it), and with
 *      the species not read, as colour alone, to 2%.
 *      Not alcohol in a thick look, the first try: its drag time in the
 *      plate's 6 mm gap is two seconds, so over half a second it is not
 *      held to Darcy at all but speeds up as a free liquid would, and it
 *      read 14 times colour alone. Real, and a reason the bands here are Darcy's only where
 *      both liquids' drag times are a few steps or less: syrup's is 27 ms.
 *   4. The species is kept: its total share after the steps is what was
 *      poured less only the fade (22 s to a third, exp(−t/22)), to 0.3%. The
 *      fade over the 30 steps is 2.2%, so no fade, or twice it, is far out.
 *   5. And carried with its colour: on the alcohol run, whose pool moves
 *      some three cells, the species' middle moves with the colour's to a
 *      tenth of a cell (the glycerine pool moves a fourteenth of a cell,
 *      too little to tell a carry from none); and the glycerine's colour
 *      moved less than colour alone.
 *   6. What it costs (PLAN 18d-11): the species' stage (its carry in the
 *      colour's substeps and its fade) timed alone on the plate's own
 *      textures, submit to done, at two counts back to back and the slope
 *      between them, the quickest of three (benchSpecies; CI's Mac grants
 *      no timestamp queries, swirlcost's way). After thirty stirred steps
 *      on glycerine, so the carry runs the substeps a moving plate asks for.
 *      At the app's top rung on a Mac (768²), on software at 256² only to
 *      show it runs. It asserts only that it measured something; the
 *      number is the finding, against PLAN 18d's budget of 0.5 to 0.7 ms
 *      for the whole of 18d and a 768² step's 6.6 ms on an M4.
 *   And any GPU validation error fails the run.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async (mac) => {
    const N = 128, STEPS = 30, out = {};
    /*
      The pool's colour-weighted velocity, its colour's middle and the
      species' total share and middle. Thirty steps: five drag times of the
      default liquid (forces.mjs, 2), so each pool is at its speed.
    */
    const read = async () => {
      const v = await lab.field('vel'), d = await lab.field('dye'), s = await lab.field('species');
      let w = 0, vx = 0, vy = 0, cx = 0, cy = 0, share = 0, sx = 0, sy = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = (i + j * N) * 4, a = d[k + 3];
        w += a; vx += a * v[k]; vy += a * v[k + 1]; cx += a * i; cy += a * j;
        share += s[k]; sx += s[k] * i; sy += s[k] * j;
      }
      return { w, speed: Math.hypot(vx, vy) / Math.max(w, 1e-9), cx: cx / w, cy: cy / w, share, sx: sx / Math.max(share, 1e-9), sy: sy / Math.max(share, 1e-9) };
    };
    const meanDye = async () => { const d = await lab.field('dye'); let s = 0; for (let k = 0; k < N * N; k++) s += d[k * 4 + 3]; return s / (N * N); };
    /*
      A pool of colour flat to its edge, and with it (unless `bottle` is
      null) a pour of that bottle on the same disc, a full column to within
      a percent of its rim (take 50: the dome clamps at 1 out to 0.99 of its
      radius). Both flat and both the same disc, because Darcy's 2λ/(1+λ) is
      for a force the same everywhere in a pool of one liquid. The first
      tries were not: colour as a dome, or the poured liquid wider than the
      colour, and in a poured liquid thinner than the plate's the colour
      sank through its own pool (the heavy middle down, the clear rim of the
      pool up round it), which the pool's thin liquid lets go as fast as its
      own viscosity says: syrup in the thickest look read 4 to 5 times colour
      alone, its pool 1.3. Real, and not what this asks.
    */
    const run = async (t, bottle, ignored = false) => {
      await lab.create(N, N);
      lab.solver().readsSpecies = !ignored;
      lab.dyeDisc(0.5, 0.5, 0.08, [1, 0, 0], 1);
      let sp = null;
      if (bottle) sp = lab.addSpecies(0.5, 0.5, 0.08, 50, bottle);
      lab.flush();
      const before = await read();
      const mean = await meanDye();
      await lab.step(STEPS, { thinGap: 1, gapThickness: t, gapSpring: 0, drip: 0.5, meanDensity: mean });
      return { sp, before, after: await read(), nuClear: lab.thinGapViscosity(t) };
    };
    for (const [name, t, bottle, ignored] of [['glycerine', 0.45, 'glycerine'], ['glycerine unread', 0.45, 'glycerine', true], ['colour 0.45', 0.45, null],
      ['alcohol', 0.06, 'alcohol'], ['colour 0.06', 0.06, null], ['syrup thick', 1, 'syrup'], ['syrup unread', 1, 'syrup', true], ['colour 1', 1, null]]) {
      out[name] = await run(t, bottle, ignored);
    }
    out.kept = Math.exp(-STEPS * lab.stepSeconds / lab.speciesSeconds);
    // 6. The stage's cost, on a stirred plate of glycerine.
    {
      const G = mac ? 768 : 256, [few, many] = mac ? [20, 220] : [2, 12];
      await lab.create(G, G);
      lab.solver().readsSpecies = true;
      lab.dyeDisc(0.5, 0.5, 0.2, [1, 0, 0], 1);
      lab.addSpecies(0.5, 0.5, 0.2, 2, 'glycerine');
      lab.flush();
      await lab.step(STEPS, { thinGap: 1, gapThickness: 0.45, gapSpring: 0, turbScale: 1 });
      const slopes = [];
      for (let k = 0; k < 3; k++) {
        const a = await lab.solver().benchSpecies(few), b = await lab.solver().benchSpecies(many);
        slopes.push((b - a) / (many - few));
      }
      out.cost = { grid: G, ms: Math.min(...slopes), all: slopes };
    }
    return out;
  }, process.platform === 'darwin');

  const ratio = (a, b) => r[a].after.speed / Math.max(r[b].after.speed, 1e-12);
  const lam = (name) => r[name].nuClear / (Math.exp(r[name].sp.lnNu) * 1e-6);
  const darcy = (l) => 2 * l / (1 + l);
  const f = (x, d = 3) => x.toFixed(d);

  const g = ratio('glycerine', 'colour 0.45'), g0 = ratio('glycerine unread', 'colour 0.45');
  check('glycerine in the default clear liquid falls as Darcy\'s inclusion says, not as fast as colour',
    g > 0.02 && g < 0.1 && r.glycerine.after.speed > 0 && Math.abs(g0 - 1) < 0.02,
    `${f(g)} of a pool of colour alone (λ ${f(lam('glycerine'), 4)}, 2λ/(1+λ) ${f(darcy(lam('glycerine')))}; species unread, as before 18d: ${f(g0)})`);
  const a = ratio('alcohol', 'colour 0.06');
  check('alcohol in a clear liquid as thin as itself falls as colour alone',
    Math.abs(a - 1) < 0.02, `${f(a)} (λ ${f(lam('alcohol'))}, Darcy ${f(darcy(lam('alcohol')))})`);
  const at = ratio('syrup thick', 'colour 1'), at0 = ratio('syrup unread', 'colour 1');
  check('syrup in the thickest look runs ahead of colour alone, toward Darcy\'s 2',
    at > 1.5 && at < 2.3 && Math.abs(at0 - 1) < 0.02,
    `${f(at)} (λ ${f(lam('syrup thick'), 2)}, Darcy ${f(darcy(lam('syrup thick')))}; species unread, as before 18d: ${f(at0)})`);

  const gl = r.glycerine, kept = r.kept;
  const shareRatio = gl.after.share / Math.max(gl.before.share * kept, 1e-9);
  check('the poured glycerine is kept, less only its fade',
    Math.abs(shareRatio - 1) < 0.003 && gl.before.share > 1,
    `total ${f(gl.after.share, 1)} cells against ${f(gl.before.share * kept, 1)} (${f(shareRatio, 4)}; the fade alone is ${f(1 - kept, 4)})`);
  const moved = (x) => Math.hypot(x.after.sx - x.before.sx, x.after.sy - x.before.sy);
  const colourMoved = (x) => Math.hypot(x.after.cx - x.before.cx, x.after.cy - x.before.cy);
  const al = r.alcohol;
  const sep = Math.hypot((al.after.sx - al.before.sx) - (al.after.cx - al.before.cx), (al.after.sy - al.before.sy) - (al.after.cy - al.before.cy));
  check('the poured liquid is carried with its colour, and glycerine\'s colour moved less than colour alone',
    colourMoved(al) > 1 && sep < 0.1 && colourMoved(gl) < colourMoved(r['colour 0.45']),
    `alcohol's species ${f(moved(al))} cells, its colour ${f(colourMoved(al))}, apart ${f(sep)}; glycerine's colour ${f(colourMoved(gl))} against ${f(colourMoved(r['colour 0.45']))} alone`);
  const c = r.cost;
  check(`the species' stage was timed (${process.platform === 'darwin' ? 'Metal' : 'software, not the finding'})`,
    Number.isFinite(c.ms) && c.ms > 0,
    `${f(c.ms, 3)} ms a step at ${c.grid}² (the three: ${c.all.map((x) => f(x, 3)).join(', ')})`);
  check('no GPU pass failed validation (a stage that never ran would read as an unchanged pool)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the lab ran', false, e.message.slice(0, 300));
}
await close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
