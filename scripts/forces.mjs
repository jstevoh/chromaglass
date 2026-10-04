#!/usr/bin/env node
/**
 * The plate's forces as forces (PLAN 18a-2): on a thin gap, does each push
 * the liquid the way the thing it stands for would? Measured on the GPU
 * solver alone (scripts/lab.mjs).
 *
 *   npm run forces
 *
 * What was there: every force of a step (the magnet, the oil's surface
 * tension, the dye's weight, the look's stirring, Glass Smear, Rain Drip,
 * Updraft) was written as one step's velocity, and the thin gap read each
 * as the speed it drives *this* liquid to at the rest gap. A force that is
 * a speed whatever the liquid is not a force: the same pull moved glycerine
 * as fast as the default oil (the force itself grew with the viscosity), the
 * magnet pulled the ferrofluid eight times harder through a liquid eight
 * times thicker, Rain Drip slid the whole plate downhill out of the dish,
 * and Glass Smear and Updraft pushed only where there was colour.
 *
 * Each check asks for a consequence of the physics with a number the
 * physics gives, and prints what the old reading would have said beside it.
 *
 *   1. A body force moves a liquid as its viscosity says. A pool of colour
 *      under Rain Drip falls h²/12μ: in a liquid 7.9 times thicker (Thickness
 *      0.75 against the default 0.45, ν = 10^(3t) mm²/s) 7.9 times slower, to
 *      8%. The look's stirring (Turbulence, a hand through the layer, a
 *      declared dial) moves both alike, to 25%: what every force did before.
 *   2. So does the magnet's pull. A ferrofluid pool as thick as the clear
 *      liquid round it (the lab's ferroViscosity, so the whole plate is one
 *      viscosity and Darcy's ratio is exact) pulled by a magnet held high and
 *      far off, so its pull is the same wherever the pool has got to: in the
 *      thicker liquid 7.9 times slower, to 10%, read after five drag times of
 *      the default liquid (at two, the default pool was still at 86% of its
 *      speed and the ratio read 6.6). The old reading was the same speed in
 *      both. With the ferrofluid's own viscosity the pool is slower (asked:
 *      over 1.5 times) in the thicker liquid too, because the liquid round it has to get out
 *      of its way (Darcy's inclusion says 6.8 for these two; the pool's soft
 *      edge reads about 3.6), where the old reading made it 7.9 times faster.
 *   3. Rain Drip is heavy colour, not a sliding plate. The pool falls, the
 *      plate's mean flow under it is under 3% of the pool's speed (the clear
 *      liquid rises past it; before, the whole plate slid out of the dish at
 *      110% of the pool's), and a plate evenly coloured, nothing heavier than
 *      anything else, does not move: its mean speed under 2% of the pool's,
 *      where the same plate weighed against nothing (no mean taken off, the
 *      control) slides at over half the pool's speed.
 *   4. Glass Smear is the glass sliding. The liquid goes at half the glass's
 *      speed, the same in the default liquid, in the thick one and on a plate
 *      pressed evenly toward half the gap (the glass, closing as h³, stops at
 *      about 0.7 of rest in this lab, and the gap it reached is printed), each
 *      to 6% of 0.25·smear and to 4% of each other, and a pool of colour in it
 *      goes with it to 5% (on the old plate only the colour was pushed; a pass
 *      that pushed it twice would show). A body force there would go at the
 *      gap's square.
 *   5. Updraft is a draught's shear. Its mean goes as h/μ: on that pressed
 *      plate at the gap's share of the open plate's speed, and in the thick
 *      liquid at 1/7.9 of the default's, each to 8%; and the colour goes as
 *      the liquid there goes with no colour laid at all, to 3% (the draught's
 *      gusts make the pool's own speed differ from the plate's mean).
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as stillness.
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
/*
  A pass that fails validation (a binding the shader does not declare, a
  format it cannot write) does not throw: the lab prints it and the step
  goes on without it. A check that asks for stillness would then pass on a
  stage that never ran, so any GPU error fails the run.
*/
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async () => {
    const N = 128, out = {};
    const DEF = 0.45, THICK = 0.75;
    const inDish = (i, j) => Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) < 0.4;
    /*
      The flow, read in the middle of the dish (inside 0.4 of the plate, so
      the four points where the rim meets the box's walls, thingap's 18a-7,
      stay out of it): its mean, its mean speed, and the mean of the
      coloured liquid's, weighted by the colour.
    */
    const flow = async () => {
      const v = await lab.field('vel'), d = await lab.field('dye');
      const sq = await lab.squeeze();
      let n = 0, mx = 0, my = 0, sp = 0, w = 0, cx = 0, cy = 0, g = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!inDish(i, j)) continue;
        const k = (i + j * N) * 4, a = d[k + 3];
        mx += v[k]; my += v[k + 1]; sp += Math.hypot(v[k], v[k + 1]); n++;
        w += a; cx += a * v[k]; cy += a * v[k + 1];
        g += sq.gap[Math.min(sq.n - 1, Math.floor((i + 0.5) / N * sq.n)) + Math.min(sq.n - 1, Math.floor((j + 0.5) / N * sq.n)) * sq.n];
      }
      // The gap is read here, after the steps the flow was read on, over the same cells.
      return { mx: mx / n, my: my / n, speed: sp / n, colourVx: cx / Math.max(w, 1e-9), colourVy: cy / Math.max(w, 1e-9), colour: w, gap: g / n };
    };
    // The plate's mean colour, as the app hands the solver its meanDensity.
    const meanDye = async () => { const d = await lab.field('dye'); let s = 0; for (let k = 0; k < N * N; k++) s += d[k * 4 + 3]; return s / (N * N); };
    const pool = async () => { lab.dye(0.5, 0.5, 0.08, [1, 0, 0], 1); lab.flush(); };
    /*
      A plate pressed evenly toward half its rest gap (thingap's way) and held
      there. The glass closes as h³ (Stefan) and in this lab stops at about
      0.7 of rest, so it is stepped until the gap stops changing, and the gap
      the flow is held to is the one read with the flow (flow()), not this.
    */
    const halve = async (over) => {
      await lab.step(1, over);
      lab.vel(0.5, 0.5, 5, [0, 0, 0, -0.015]); lab.flush();
      let was = 1;
      for (let k = 0; k < 20; k++) {
        await lab.step(20, over);
        const sq = await lab.squeeze();
        const gap = sq.gap[sq.n / 2 + (sq.n / 2) * sq.n];
        if (Math.abs(gap - was) < 1e-5) break;
        was = gap;
      }
    };

    // 1 and 3. Rain Drip on a pool, and the hand stir on the same pool, at two thicknesses.
    out.drip = {};
    out.stir = {};
    for (const t of [DEF, THICK]) {
      const thin = { thinGap: 1, gapThickness: t, gapSpring: 0 };
      await lab.create(N, N); await pool();
      const mean = await meanDye();
      // Twenty drag times of the thicker liquid's slowest answer is nothing at
      // these drags (0.1 s and 0.013 s): thirty steps is steady for both.
      await lab.step(30, { ...thin, drip: 0.5, meanDensity: mean });
      out.drip[t] = await flow();
      await lab.create(N, N); await pool();
      await lab.step(30, { ...thin, turbScale: 1 });
      out.stir[t] = await flow();
    }
    // 3. An evenly coloured plate under Rain Drip.
    {
      await lab.create(N, N); lab.dye(0.5, 0.5, 5, [1, 0, 0], 1); lab.flush();
      const mean = await meanDye();
      await lab.step(30, { thinGap: 1, gapThickness: DEF, gapSpring: 0, drip: 0.5, meanDensity: mean });
      out.even = { ...(await flow()), mean };
      // The control: the same plate weighed against nothing (meanDensity 0) must slide, or the stillness above says nothing.
      await lab.create(N, N); lab.dye(0.5, 0.5, 5, [1, 0, 0], 1); lab.flush();
      await lab.step(30, { thinGap: 1, gapThickness: DEF, gapSpring: 0, drip: 0.5, meanDensity: 0 });
      out.evenControl = await flow();
    }

    // 2. The magnet's pull on a ferrofluid pool, as thick as the liquid round it and with its own viscosity.
    out.magnet = {};
    for (const own of [false, true]) {
      for (const t of [DEF, THICK]) {
        const nu = lab.thinGapViscosity(t);
        const over = { thinGap: 1, gapThickness: t, gapSpring: 0, magnetX: 0.9, magnetY: 0.5, magnetStrength: 0.4, magnetHeight: 0.4, ...(own ? {} : { ferroViscosity: nu }) };
        await lab.create(N, N);
        lab.addPhase(0.42, 0.5, 0.06, 1);
        await lab.step(1, { ...over, magnetStrength: 0 });
        /*
          Thirty steps: five drag times of the default liquid (0.1 s, six
          steps), so the pool is at its speed and not still getting there (at
          twelve, 86% of it, the ratio read 6.6), and a magnet weak enough that
          the faster pool has not moved far enough to feel a different pull.
        */
        await lab.step(30, over);
        const v = await lab.field('vel'), ph = await lab.phase();
        let s = 0, w = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const pi = Math.min(ph.n - 1, Math.floor((i + 0.5) / N * ph.n)), pj = Math.min(ph.n - 1, Math.floor((j + 0.5) / N * ph.n));
          const c = ph.data[pi + pj * ph.n];
          if (c < 0.5) continue;
          s += c * v[(i + j * N) * 4]; w += c;
        }
        out.magnet[`${own ? 'own' : 'even'}:${t}`] = s / Math.max(w, 1e-9);
      }
    }

    /*
      4 and 5. The slid glass and the draught, on an open plate at two
      thicknesses and on a pressed one, each with a pool of colour in it: the
      clear liquid's mean and the colour's both move, and the colour neither
      more nor less (on the old plate both pushed only the colour, and a
      thin-gap pass that pushed it twice would show here).
    */
    out.smear = {};
    out.air = {};
    for (const [name, t, halved] of [['default', DEF, false], ['thick', THICK, false], ['half', DEF, true]]) {
      const thin = { thinGap: 1, gapThickness: t, gapSpring: 0 };
      await lab.create(N, N);
      if (halved) await halve(thin);
      await pool();
      await lab.step(30, { ...thin, smearX: 0.01 });
      out.smear[name] = await flow();
      await lab.create(N, N);
      if (halved) await halve(thin);
      await pool();
      lab.setTime(0);
      await lab.step(30, { ...thin, air: 0.5 });
      out.air[name] = await flow();
      /*
        The draught has gusts (a noise in space and time), so the colour's
        speed is the gust where the pool sits, not the plate's mean. What says
        the colour is not pushed on its own is the same plate with no colour:
        the flow under where the pool was, at the same moment, the same.
      */
      if (name === 'default') {
        const d = await lab.field('dye');
        await lab.create(N, N);
        lab.setTime(0);
        await lab.step(30, { ...thin, air: 0.5 });
        const v = await lab.field('vel');
        let w = 0, cy = 0;
        for (let k = 0; k < N * N; k++) { w += d[k * 4 + 3]; cy += d[k * 4 + 3] * v[k * 4 + 1]; }
        out.air.clearUnderPool = cy / w;
      }
    }
    out.nuRatio = lab.thinGapViscosity(THICK) / lab.thinGapViscosity(DEF);
    return out;
  });

  const ratio = r.nuRatio;
  check('no GPU pass failed validation (a stage that never ran would read as stillness)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
  const pool = Math.abs(r.drip[0.45].colourVy);
  // 1.
  {
    const fall = r.drip[0.45].colourVy / r.drip[0.75].colourVy;
    const stir = r.stir[0.45].speed / r.stir[0.75].speed;
    // Downhill is −up, and up is +y at the default Tilt Direction (fluid.ts writeSim).
    check('a body force moves a liquid as its viscosity says: Rain Drip\'s pool falls downhill 7.9 times slower in a liquid 7.9 times thicker',
      r.drip[0.45].colourVy < 0 && Math.abs(fall / ratio - 1) < 0.08,
      `${fall.toFixed(2)} times (the viscosities ${ratio.toFixed(2)}); the pool falls ${(-r.drip[0.45].colourVy).toFixed(4)} and ${(-r.drip[0.75].colourVy).toFixed(4)}; the old reading, a speed whatever the liquid, would say 1`);
    check('and the hand stir, a dial, moves both alike: what every force did before',
      r.stir[0.45].speed > 0.1 && stir > 0.8 && stir < 1.25,
      `${stir.toFixed(2)} times (mean speed ${r.stir[0.45].speed.toFixed(4)} and ${r.stir[0.75].speed.toFixed(4)})`);
  }
  // 2.
  {
    const even = r.magnet['even:0.45'] / r.magnet['even:0.75'];
    const own = r.magnet['own:0.45'] / r.magnet['own:0.75'];
    check('the magnet\'s pull is a force too: a pool as thick as its liquid goes 7.9 times slower in a liquid 7.9 times thicker',
      r.magnet['even:0.45'] > 0 && Math.abs(even / ratio - 1) < 0.1,
      `${even.toFixed(2)} times (${r.magnet['even:0.45'].toFixed(4)} and ${r.magnet['even:0.75'].toFixed(4)} toward the magnet); the old reading would say 1`);
    check('and with the ferrofluid\'s own viscosity it is slower in the thicker liquid, which it has to push aside, where the old reading made it 7.9 times faster',
      r.magnet['own:0.45'] > 0 && own > 1.5,
      `${own.toFixed(2)} times (${r.magnet['own:0.45'].toFixed(4)} and ${r.magnet['own:0.75'].toFixed(4)}); the old reading ${(1 / ratio).toFixed(2)}; Darcy's inclusion says about 6.8 for a sharp edge`);
  }
  // 3. (3a fails the old whole-plate push; only 3b, with its control, guards the weight being taken over the plate's mean.)
  {
    check('Rain Drip is heavy colour, not a sliding plate: the clear liquid rises as the pool falls, the plate\'s mean under 3% of the pool\'s speed',
      Math.abs(r.drip[0.45].my) < 0.03 * pool,
      `the plate's mean ${r.drip[0.45].my.toFixed(5)} against the pool's ${(-pool).toFixed(4)} (on the thin gap before, the plate slid at 110% of it)`);
    check('and an evenly coloured plate, nothing heavier than anything else, does not move; weighed against nothing it would slide',
      r.even.mean > 0.9 && r.even.speed < 0.02 * pool && r.evenControl.speed > 0.5 * pool,
      `mean speed ${r.even.speed.toFixed(5)} against the pool's ${pool.toFixed(4)}, the plate's colour ${r.even.mean.toFixed(3)}; the control (no mean taken) ${r.evenControl.speed.toFixed(4)}`);
  }
  // 4.
  {
    const want = 0.25 * 0.01;
    const all = ['default', 'thick', 'half'];
    const h = r.smear.half.gap / r.smear.default.gap;
    check('Glass Smear is the glass sliding: the liquid goes at half its speed in any liquid and any gap, the clear liquid and the colour alike',
      all.every((n) => Math.abs(r.smear[n].mx / want - 1) < 0.06 && Math.abs(r.smear[n].colourVx / r.smear[n].mx - 1) < 0.05)
        && Math.abs(r.smear.thick.mx / r.smear.default.mx - 1) < 0.04 && Math.abs(r.smear.half.mx / r.smear.default.mx - 1) < 0.04 && h < 0.8,
      all.map((n) => `${n} ${r.smear[n].mx.toFixed(5)} (colour ${r.smear[n].colourVx.toFixed(5)})`).join(', ') + ` against ${want.toFixed(5)}, the pressed gap ${h.toFixed(3)} of the open one; a body force would go at ${(h * h).toFixed(3)} of it there and 1/${ratio.toFixed(1)} in the thick liquid`);
  }
  // 5.
  {
    const half = r.air.half.my / r.air.default.my;
    const thick = r.air.default.my / r.air.thick.my;
    const h = r.air.half.gap / r.air.default.gap;
    check('Updraft is a draught\'s shear: its flow goes as the gap, the clear liquid and the colour alike',
      r.air.default.my < 0 && Math.abs(half / h - 1) < 0.08 && h < 0.8 && Math.abs(r.air.default.colourVy / r.air.clearUnderPool - 1) < 0.03,
      `${half.toFixed(3)} of the open plate's speed (${r.air.half.my.toFixed(5)} against ${r.air.default.my.toFixed(5)}) where the gap is ${h.toFixed(3)} of it; a body force would be ${(h * h).toFixed(3)}, as the old reading was; the colour ${r.air.default.colourVy.toFixed(5)} against the clear liquid's there with no colour laid ${r.air.clearUnderPool.toFixed(5)}`);
    check('and as 1/μ: 7.9 times slower in a liquid 7.9 times thicker',
      Math.abs(thick / ratio - 1) < 0.08,
      `${thick.toFixed(2)} times (${r.air.default.my.toFixed(5)} and ${r.air.thick.my.toFixed(5)})`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
