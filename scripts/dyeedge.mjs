#!/usr/bin/env node
/**
 * A colour's edge stays as sharp as the grid can hold while the flow
 * carries it on a thin gap (PLAN 1l).
 *
 *   npm run dyeedge      (the lab: any adapter that computes; lab2)
 *
 * What was reported: Galaxy looked like a blurry lens, not a sharp Hubble
 * picture of a galaxy. What was measured: even at 768² every dye edge on
 * the plate was a soft ramp several cells wide, and the plate's optics
 * (the camera, the sampling) were not what softened it. The carry was.
 *
 * Real dye in water hardly spreads at all over a show: its molecular
 * diffusivity is about 4e-10 m²/s (D_MOLECULAR), so in ten seconds it
 * reaches a tenth of a millimetre, under one cell of a 768² solver on a
 * 20 cm plate. The Péclet number of a millimetre-a-second swirl a
 * centimetre across is about 25 000: the flow folds the colour and
 * nothing smooths it. What smoothed it here was the scheme. On a thin
 * gap the dye goes across each cell's faces (bodyAdvect in
 * wgsl/fluid/carry.ts), a MUSCL flux whose slope was limited by minmod,
 * the most cautious of the limiters: at every edge it falls back to plain
 * first-order upwind, whose error is a diffusion of about ½|u|Δx(1 − c),
 * hundreds of times the dye's own at the speeds a look runs. Substepped
 * (carryPlan) and run every step, it rounds every edge it touches.
 *
 * The plate: Galaxy's step and gap on a 128² grid (SwiftShader runs it in
 * CI's lab2), three flat discs of colour of radius 0.07 off the middle,
 * turned by a solid-body swirl laid each step, two hundred steps.
 *
 * Asked:
 *   1. the swirl carried them: the red disc's middle moved more than
 *      MOVED_LEAST cells (it moves about 3 in the two hundred steps,
 *      measured 2026-11-22), so a still plate,
 *      whose edge never smears, cannot pass the edge line;
 *   2. the colour kept to TOTAL_KEPT %: a less cautious limiter must still
 *      be a flux, making and losing nothing;
 *   3. no overshoot: no cell deeper than PEAK_MOST times the discs, since
 *      a limiter that gives too much slope piles colour on an edge;
 *   4. the edge: part-full cells (a tenth to nine tenths deep) per full
 *      cell under EDGE_MOST. A disc of 9 cells' radius moved a fraction of
 *      a cell has about 0.29 even when carried exactly (its rim straddles
 *      cells); minmod left 0.713, MC (monotonized central, this fix) 0.541,
 *      superbee 0.457. EDGE_MOST sits between minmod and MC.
 */
import { openLab } from './lab.mjs';

const TOTAL_KEPT = 0.1;
const PEAK_MOST = 1.02;
const EDGE_MOST = 0.62;
const MOVED_LEAST = 2;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
let failed = false;
try {
  const r = await page.evaluate(async () => {
    const N = 128, L = 128, STEPS = 200, OMEGA = 1;
    const look = lab.look('galaxy').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, diff: look.diffusionRate };
    await lab.create(N, L);
    lab.dyeDisc(0.5, 0.28, 0.07, [0.9, 0.05, 0.05], 1);
    lab.dyeDisc(0.69, 0.61, 0.07, [0.05, 0.9, 0.05], 1);
    lab.dyeDisc(0.31, 0.61, 0.07, [0.05, 0.05, 0.9], 1);
    lab.flush(DT);
    const read = async () => {
      const d = await lab.field('dye');
      let t = 0, mx = 0, part = 0, full = 0, rx = 0, ry = 0, rw = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = (i + j * L) * 4, v = d[k + 3];
        t += v; mx = Math.max(mx, v);
        if (v > 0.9) full++; else if (v > 0.1) part++;
        if (d[k] > 2 * (d[k + 1] + d[k + 2])) { rx += i * d[k]; ry += j * d[k]; rw += d[k]; }
      }
      return { t, mx, part, full, red: rw > 0 ? [rx / rw, ry / rw] : null };
    };
    const t0 = await read();
    const spin = [];
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5;
      spin.push(-OMEGA * y, OMEGA * x, 0, 0);
    }
    for (let k = 0; k < STEPS; k++) {
      lab.addVel(spin); lab.flush(DT);
      await lab.step(1, over, true);
    }
    return { t0, end: await read() };
  });
  const { t0, end } = r;
  if (!t0.red || !end.red) throw new Error('no red disc to follow');
  const moved = Math.hypot(end.red[0] - t0.red[0], end.red[1] - t0.red[1]);
  const kept = (100 * (end.t - t0.t)) / t0.t;
  const edge0 = t0.part / t0.full, edge = end.part / Math.max(1, end.full);
  console.log(`total ${t0.t.toFixed(1)} -> ${end.t.toFixed(1)} (${kept.toFixed(3)}%), deepest ${end.mx.toFixed(3)}, red moved ${moved.toFixed(1)} cells, part/full ${t0.part}/${t0.full} -> ${end.part}/${end.full}`);
  check(`the swirl carried the discs more than ${MOVED_LEAST} cells`, moved > MOVED_LEAST, moved.toFixed(1));
  check(`the colour kept to ${TOTAL_KEPT}%`, Math.abs(kept) < TOTAL_KEPT, `${kept.toFixed(3)}%`);
  check(`no overshoot, the deepest cell under ${PEAK_MOST}`, end.mx < PEAK_MOST, end.mx.toFixed(3));
  check(`the edge stays sharp, part-full per full cell under ${EDGE_MOST}`, edge0 < 0.01 && edge < EDGE_MOST, `${edge0.toFixed(3)} -> ${edge.toFixed(3)}`);
} catch (e) {
  console.log(` FAIL the lab ran — ${e.message.slice(0, 300)}`);
  failed = true;
} finally {
  await close();
}
failed ||= checks.some((c) => !c.ok);
console.log(failed ? `\n${checks.filter((c) => !c.ok).length} of ${checks.length} failed${checks.length < 4 ? ', and the lab stopped before the rest' : ''}` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
