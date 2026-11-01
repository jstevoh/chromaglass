#!/usr/bin/env node
/**
 * A bubble's colour on a thin gap goes where its liquid goes, and none is
 * made or lost (PLAN 15g-8b).
 *
 *   npm run bubbledye      (the lab: any adapter that computes; in Measure's lab2 part)
 *
 * What was wrong: on a thin gap the GPU multiplied the colour under every
 * bubble away each step (airExclude) and the CPU painted it back as a ring
 * round the rim from the readback mirror (depositBubbleRims), which on a
 * slow machine is frames behind the GPU. Blowing the straw, a new bubble
 * each hold, swung the plate's colour 15 to 20% either way. Under it the
 * thin solve's air source was clamped at a fortieth of what a bubble put
 * down whole asks for (hsDivergence), so the flow moved 2.6% of the liquid
 * a bubble stood on and the multiply deleted the rest.
 *
 * Now the air's arrival is the source it should be, the carries move each
 * cell's colour per unit of its liquid (airLiquid in wgsl/fluid.ts), the
 * multiply is off a thin gap only and the CPU stands down there. This lab
 * has no CPU half, so what it measures is the GPU's alone: on main the lab
 * lost 2.6% of a pool's colour to a bubble put down whole, 3.2% to one
 * growing and 6.4% to one drifting across it.
 *
 * The plate: Classic's step and gap on a 128² grid (at 256² the run takes
 * nine minutes under SwiftShader and pushed CI's lab2 part past its 25; at
 * 128² under two), a pool of one colour (depth 1) of
 * radius 0.3 in the middle, one bubble in it, sixty steps:
 *
 *   whole  a bubble of radius 0.05 put down whole and kept;
 *   grow   one growing from nothing to 0.06 over forty steps;
 *   move   one of 0.04 drifting a fifth of the plate across the pool;
 *   pop    the whole one, then gone, and thirty steps more.
 *
 * Asked of each:
 *   1. the plate's colour kept to TOTAL_KEPT % at the end (main: −2.6%,
 *      −3.2%, −6.4% for whole, grow and move);
 *   2. no ring: the deepest cell under PEAK_MOST times the pool's depth
 *      (the push this replaced, airDisplace in #636, piled 3–4×; a donor
 *      that hands on more than it holds made 6×);
 *   3. the bubble emptied: the colour left in the middle of it (cells
 *      inside 0.6 of its radius) under LEFT_MOST of the pool's depth, where
 *      a carry dividing by the cell rather than by the liquid in it left
 *      10–11%, and capping a donor at what it holds without what comes in
 *      left the same (the handoff's lab, 15g-8b);
 *   4. pop: the hole fills back, its middle back to HOLE_BACK of the pool's
 *      depth thirty steps after, since a hole is a sink the liquid round it
 *      flows into (airPush stays on the step after the last pop).
 *
 * Why these bars and not tighter: the solve gives the air the liquid's
 * mobility (PLAN 18i), so liquid runs through a bubble, and a carry that
 * counts what comes in at the least it can be leaves some of it behind
 * (here 1.2% under a whole bubble, 6.6% under a moving one, 1.0% under a
 * growing one; at 256² 3.3%, 4.8% and 1.0%), and a whole bubble's middle at the end of its step holds the
 * floor's sliver of liquid. The totals are kept to rounding.
 */
import { openLab } from './lab.mjs';

const TOTAL_KEPT = 0.1;
const PEAK_MOST = 1.25;
const LEFT_MOST = 0.08;
const HOLE_BACK = 0.5;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
let failed = false;
try {
  for (const kind of ['whole', 'grow', 'move', 'pop']) {
    const r = await page.evaluate(async (kind) => {
      const N = 128, L = 128;
      const look = lab.look('classic').settings;
      const DT = look.globalSpeed * 0.2;
      const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, bubbleClear: 1 };
      await lab.create(N, L);
      const s = lab.solver();
      lab.dyeDisc(0.5, 0.5, 0.3, [0.2, 0.5, 0.9], 1);
      lab.flush(DT);
      await lab.step(5, over);
      const read = async (bx, by, br) => {
        const d = await lab.field('dye');
        let t = 0, mx = 0, inside = 0, nIn = 0;
        for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
          const v = d[(i + j * L) * 4 + 3]; t += v; mx = Math.max(mx, v);
          if (br > 0 && Math.hypot((i + 0.5) / L - bx, (j + 0.5) / L - by) < br * 0.6) { inside += v; nIn++; }
        }
        return { t, mx, inside: nIn ? inside / nIn : 0 };
      };
      const t0 = await read(0, 0, 0);
      const put = (x, y, rr) => s.setBubbles(new Float32Array([x, y, rr, 1]), 1, 0.25, new Float32Array(4));
      let last = { x: 0.5, y: 0.5, r: 0.05 };
      for (let k = 0; k < 60; k++) {
        if (kind === 'whole' || kind === 'pop') put(0.5, 0.5, 0.05);
        if (kind === 'grow') { last = { x: 0.5, y: 0.5, r: 0.005 + 0.055 * Math.min(1, k / 40) }; put(last.x, last.y, last.r); }
        if (kind === 'move') { last = { x: 0.4 + 0.2 * k / 60, y: 0.5, r: 0.04 }; put(last.x, last.y, last.r); }
        await lab.step(1, over);
      }
      const mid = await read(last.x, last.y, last.r);
      if (kind !== 'pop') return { t0, mid, end: mid };
      s.setBubbles(new Float32Array(4), 0, 0.25, new Float32Array(4));
      await lab.step(30, over);
      return { t0, mid, end: await read(last.x, last.y, last.r) };
    }, kind);
    const kept = (100 * (r.end.t - r.t0.t)) / r.t0.t;
    console.log(`${kind}: total ${r.t0.t.toFixed(1)} -> ${r.end.t.toFixed(1)} (${kept.toFixed(3)}%), deepest ${r.mid.mx.toFixed(3)} then ${r.end.mx.toFixed(3)}, under the bubble ${r.mid.inside.toFixed(3)}${kind === 'pop' ? `, the hole after ${r.end.inside.toFixed(3)}` : ''}`);
    check(`${kind}: the plate's colour kept to ${TOTAL_KEPT}%`, Math.abs(kept) < TOTAL_KEPT, `${kept.toFixed(3)}%`);
    check(`${kind}: no ring, the deepest cell under ${PEAK_MOST}× the pool`, r.mid.mx < PEAK_MOST && r.end.mx < PEAK_MOST, `${r.mid.mx.toFixed(3)}, ${r.end.mx.toFixed(3)}`);
    check(`${kind}: the bubble emptied, under ${LEFT_MOST} of the pool left in its middle`, r.mid.inside < LEFT_MOST, r.mid.inside.toFixed(3));
    if (kind === 'pop') check(`pop: the hole fills back to ${HOLE_BACK} of the pool in thirty steps`, r.end.inside > HOLE_BACK, r.end.inside.toFixed(3));
  }
} catch (e) {
  console.log(` FAIL the lab ran — ${e.message.slice(0, 300)}`);
  failed = true;
} finally {
  await close();
}
failed ||= checks.some((c) => !c.ok);
console.log(failed ? `\n${checks.filter((c) => !c.ok).length} of ${checks.length} failed${checks.length < 13 ? ', and the lab stopped before the rest' : ''}` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
