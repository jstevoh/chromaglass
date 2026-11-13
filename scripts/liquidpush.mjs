#!/usr/bin/env node
/**
 * A poured liquid acts on every step, whatever else is written (PLAN 14ab-16).
 *
 *   npm run liquidpush        (the lab on SwiftShader, about a minute)
 *
 * What was wrong. A bottle's liquid (soap, a heavy syrup, an oil that keeps
 * to itself) is carried on the GPU in two fields of its own, and what it does
 * to the plate was done in the pass that folds the frame's hand-laid deltas
 * into the dye and the flow: its forces (`liquidForces`: the soap's pull down
 * its own gradient, a thick liquid's drag, a heavy one's slide down a rocked
 * plate) after `deltaVel`, and the soap's thinning of the dye inside
 * `deltaDye`. A step with no deltas to fold has no such pass. The app made
 * one every step by accident: the CPU's own copy of the liquids marked the
 * deltas written for as long as it held any, and it held the first pour
 * forever because it stopped decaying once the GPU took the liquids over.
 * After a Clear the CPU's copy is empty and stays so (the GPU has the
 * liquids, the CPU skips the pour), so a newly poured liquid was carried and
 * drawn and did nothing until a hand, a kick or a bubble wrote a delta; and
 * on a frame with two folds (the deltas, then the pours at full resolution)
 * it acted twice. A liquid's force on the liquid round it is not an event
 * of the hand's; it is there every instant the liquid is.
 *
 * What this asks. One plate with two drops on it, the plate rocked, six
 * steps, on the open plate and the thin gap. On the left a heavy liquid,
 * which slides downhill: a force with a direction, which a projection does
 * not take away as it takes a pure gradient. On the right a soap, which
 * thins the dye under it. Apart, because the rock also drives the lasting
 * current by the dye's weight, and under a soap's thinned dye that current
 * is the weaker: one drop of both would read the two against each other.
 * Three ways of stepping the plate:
 *
 *   alone    nothing else writes: no fold at all;
 *   one      one fold of empty deltas before each step;
 *   two      two folds before each step, as a frame with a pour has.
 *
 * and beside each a plate with no drop, stepped the same way, taken off: the
 * rock drives the lasting current too, and that is not the drop's doing.
 *
 *   reach    the drops do something: with one fold a step (the only way they
 *            acted before) the dye under the soap thins, and on the open
 *            plate the liquid under the heavy drop slides the rock's way,
 *            both well clear of the plate without them. On a thin gap the
 *            slide is not asked to reach: the push meets the plate before
 *            the gap keeps the flow it had, so it is momentum the gap's
 *            drag has within the step and not a drive (PLAN 15e-10), and it
 *            reads under a thousandth of the flow beside it, less than the
 *            half float the flow is kept in resolves. The soap's thinning
 *            carries the thin gap's lines.
 *   alone    with no fold the slide and the thinning are the one-fold
 *            plate's, within a part in fifty (the slide, where it is under
 *            the reading's floor, within that floor).
 *   two      with two folds they are the one-fold plate's too, not twice it.
 *   clear    after a Clear and a new pour, the same: `clear` must leave the
 *            solver ready to act on the next liquid.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEPS = 6;
const PLATES = [['open plate', {}], ['thin gap', { thinGap: 1 }]];

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|validation|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 160)); });
try {
  const r = await page.evaluate(async ([plates, STEPS]) => {
    const N = 64, R = 0.09, HEAVY = 0.33, SOAP = 0.67;
    /** The mean of the flow's x under the heavy drop's inner half and of the dye's amount under the soap's, after the run. */
    const under = async () => {
      const v = await lab.field('vel'), d = await lab.field('dye');
      let vx = 0, dye = 0, n = 0, m = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N, y = (j + 0.5) / N - 0.5, k = (j * N + i) * 4;
        if (Math.hypot(x - HEAVY, y) <= R / 2) { vx += v[k]; n++; }
        if (Math.hypot(x - SOAP, y) <= R / 2) { dye += d[k + 3]; m++; }
      }
      return { vx: vx / n, dye: dye / m, n };
    };
    /** One plate: `folds` folds of empty deltas before each step, with the drop or without, after a Clear or on a new plate. */
    const run = async (over, folds, drop, cleared) => {
      await lab.create(N, N);
      const s = lab.solver();
      const pour = () => {
        lab.dyeDisc(0.5, 0.5, 0.4, [1, 1, 1], 1);
        lab.flush();
        if (drop) {
          s.addLiquidDrop(HEAVY, 0.5, R, { weight: 1 }, 1);
          s.addLiquidDrop(SOAP, 0.5, R, { soap: 1 }, 1);
        }
      };
      if (cleared) {
        // A liquid somewhere else first, stepped, then the plate cleared: what the app's Clear leaves the solver in.
        s.addLiquidDrop(0.5, 0.25, R, { soap: 1, weight: 1 }, 1);
        await lab.step(2, over);
        s.clear();
      }
      pour();
      for (let k = 0; k < STEPS; k++) {
        for (let f = 0; f < folds; f++) lab.flush();
        await lab.step(1, { ...over, rockX: 0.5 }, folds > 0);
      }
      return { ...(await under()), thin: s.thinGapLive };
    };
    const out = [];
    for (const [name, over] of plates) {
      const row = { name, thin: null, ways: {} };
      for (const [way, folds, cleared] of [['alone', 0, false], ['one', 1, false], ['two', 2, false], ['clear', 0, true]]) {
        const a = await run(over, folds, true, cleared), z = await run(over, folds, false, cleared);
        row.thin = a.thin;
        row.ways[way] = { slide: a.vx - z.vx, thinned: 1 - a.dye / z.dye, still: z.vx, cells: a.n };
      }
      out.push(row);
    }
    return { out, drew: lab.adapter() };
  }, [PLATES, STEPS]);

  const who = r.drew ? `${r.drew.vendor} ${r.drew.architecture}`.trim() : 'no adapter';
  console.log(`a poured liquid acts on every step (drawn by ${who}; ${STEPS} steps, a heavy drop and a soap's on a rocked plate)`);
  check('the lab ran without a GPU error', !gpuErrors.length, gpuErrors.length ? gpuErrors.slice(0, 2).join(' | ') : 'none');
  const e = (x) => x.toExponential(2), pc = (x) => `${(x * 100).toFixed(2)}%`;
  for (const [i, row] of r.out.entries()) {
    const w = row.ways, one = w.one;
    const say = (x) => `slide ${e(x.slide)}, dye thinned ${pc(x.thinned)}`;
    const thin = PLATES[i][1].thinGap === 1;
    const asked = row.thin === thin;
    /*
      The reach's floors. The slide is asked to be the rock's way and at
      least ten times the half-float's step at the flow's size there, read
      from the plate without a drop (a difference of two means over some
      twenty cells is good to far better); the thinning at least half a
      percent, when six steps of this soap thin the dye by several.
    */
    const floor = Math.max(1e-7, Math.abs(one.still) * 2 ** -10 * 10);
    check(`reach, ${row.name}: with one fold a step the soap thins its dye${thin ? '' : " and the heavy drop slides the rock's way"}`,
      asked && (thin || one.slide > floor) && one.thinned > 0.005,
      `${say(one)} over ${one.cells} cells (floors ${e(floor)} and 0.50%; without a drop the flow there is ${e(one.still)})${asked ? '' : ', not the plate asked for'}`);
    const same = (x) => Math.abs(x.slide - one.slide) <= Math.max(Math.abs(one.slide) * 0.02, floor) && Math.abs(x.thinned - one.thinned) <= Math.abs(one.thinned) * 0.02;
    const ratio = (x) => `${(x.slide / one.slide).toFixed(3)}× the slide, ${(x.thinned / one.thinned).toFixed(3)}× the thinning`;
    check(`alone, ${row.name}: with no fold at all it does the same (within a fiftieth)`, same(w.alone), `${say(w.alone)}: ${ratio(w.alone)}`);
    check(`two, ${row.name}: with two folds a step it does the same, not twice`, same(w.two), `${say(w.two)}: ${ratio(w.two)}`);
    check(`clear, ${row.name}: a liquid poured after a Clear, with no fold, does the same`, same(w.clear), `${say(w.clear)}: ${ratio(w.clear)}`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) { console.error(`\n${failed.length} of ${checks.length} failed.`); process.exit(1); }
console.log(`\nAll ${checks.length} passed.`);
