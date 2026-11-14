#!/usr/bin/env node
/**
 * A bubble blown through a straw.
 *
 *   npm run straw      (the list in node, the air field in the lab: any adapter that computes and renders)
 *
 * Held still and never moved, the Blow is a straw: one bubble on the end of
 * it, growing while the breath goes on. It is round and it sheds nothing
 * (PLAN.md 15g-12): it used to break into six to eighteen fingers and throw
 * a ring of small bubbles off its rim, the "flower like things around the
 * floating bubbles" the owner reported (2026-11-13), with a finger count
 * that put a gap a twenty-first of the plate's into Paterson's formula. At
 * the plate's own gap the count is under one, and a front that does not
 * finger pinches nothing off (src/lib/bubbles.ts, blow). The count is still
 * Paterson's, so a liquid thick enough does finger, and that is held here
 * too, on the list and where the fingers have to land: in the air field the
 * solver takes the liquid out of and the plate draws the bubble from.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The list ────────────────────────────────────────────────────────
{
  const out = 'node_modules/.cache/straw-bubbles.mjs';
  await build({ entryPoints: ['src/lib/bubbles.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
  const { BubbleField, strawFingers, DISH_METRES } = await import(`../${out}`);
  const N = 192, dt = 1 / 60;
  const still = () => [0, 0];
  const at = { x: 110, y: 80 };
  /*
    Three seconds of breath on a fresh plate whose liquid is `thick` times
    the default oil's viscosity: the most its rim fingered, Paterson's count
    at its fastest and at its end, and what is on the plate after.
  */
  const breathe = (thick) => {
    const f = new BubbleField(N);
    f.liquid({});
    const mu = f.liquidMu * thick;
    let fing = 0, count = 0, r0 = 0;
    for (let t = 0; t < 180; t++) {           // three seconds of breath
      f.liquidMu = mu;
      f.blow(at.x, at.y, dt, 1);
      f.step(dt, still, 0, 0, 0);
      const b = f.bubbles.find((q) => q.straw);
      if (!b) continue;
      fing = Math.max(fing, b.fing);
      const speed = (b.r - r0) / dt; r0 = b.r;
      if (t > 0) count = Math.max(count, strawFingers(mu * speed * (DISH_METRES / N) / f.liquidSigma, b.r * (DISH_METRES / N) / f.gapMetres));
    }
    return { f, fing, count, mu };
  };
  const oil = breathe(1);
  const f = oil.f;
  const blown = f.bubbles.filter((q) => q.straw);
  const big = blown.reduce((m, q) => (q.r > (m?.r ?? 0) ? q : m), null);
  const sats = f.bubbles.length - blown.length;
  check('held still, one bubble grows on the end of the straw', blown.length === 1 && big && big.r > N * 0.05,
    big ? `${blown.length} blown, radius ${(big.r / N).toFixed(3)} of the plate` : 'none');
  check('and stays at the straw', big && Math.hypot(big.x - at.x, big.y - at.y) < 1, big ? `${Math.hypot(big.x - at.x, big.y - at.y).toFixed(2)} cells off` : '');
  check('it stays round while it grows: in the plate\'s oil at the plate\'s gap Paterson\'s count never reaches two fingers',
    oil.fing === 0 && oil.count > 0.5 && oil.count < 2, `fingering ${oil.fing.toFixed(3)} at most, ${oil.count.toFixed(2)} fingers at its fastest (μ ${oil.mu.toFixed(3)} Pa·s)`);
  check('and it sheds nothing: the one bubble is all there is on the plate', sats === 0 && f.bubbles.length === 1, `${sats} others after three seconds of breath (it shed about five a second)`);
  // The count is alive, not a constant: in a liquid three hundred times as thick the same breath's front does finger.
  const thick = breathe(300);
  const tb = thick.f.bubbles.find((q) => q.straw);
  check('in a liquid three hundred times as thick the same breath does finger, by the same count',
    thick.count >= 2 && thick.fing > 0.25 && tb && tb.lobes >= 2 && tb.lobes <= 18 && thick.f.bubbles.length === 1,
    `${thick.count.toFixed(1)} fingers at its fastest, fingering ${thick.fing.toFixed(2)}, drawn with ${tb?.lobes} lobes`);
  for (let t = 0; t < 240; t++) f.step(dt, still, 0, 0, 0);   // let go for four seconds
  const after = f.bubbles.find((q) => q.straw && q.r > N * 0.04);
  check('let go, it stays on the plate, round', after && after.fing < 0.1, after ? `fingering ${after.fing.toFixed(3)}` : 'gone');
  f.clearLooks();
  check('a look with no bubbles of its own keeps it', f.bubbles.some((q) => q.straw) && f.anyBlown);
  f.blow(40, 150, dt, 1); f.step(dt, still, 0, 0, 0);
  check('moved and blown again, it is a second bubble', f.bubbles.filter((q) => q.straw).length >= 2);
}

// ── The air field ───────────────────────────────────────────────────
{
  const { page, close } = await openLab();
  try {
    const ring = async (fing) => page.evaluate(async (fing) => {
      await lab.create(256);
      const solver = lab.solver();
      const cx = 0.6, cy = 0.4, r = 0.06;
      solver.setBubbles(new Float32Array([cx, cy, r, 1]), 1, 0.1, new Float32Array([fing, 11, 0.7, 0]));
      await lab.step(1);
      const air = await solver.readAir();
      const n = air.n;
      // How much of a circle at 1.35 of the radius is air, and how much inside is.
      let out = 0, outN = 0, inside = 0, inN = 0;
      for (let k = 0; k < 360; k++) {
        const a = k * Math.PI / 180;
        const px = Math.round((cx + Math.cos(a) * r * 1.35) * n - 0.5), py = Math.round((cy + Math.sin(a) * r * 1.35) * n - 0.5);
        out += air.data[px + py * n] > 0.5 ? 1 : 0; outN++;
        const qx = Math.round((cx + Math.cos(a) * r * 0.6) * n - 0.5), qy = Math.round((cy + Math.sin(a) * r * 0.6) * n - 0.5);
        inside += air.data[qx + qy * n] > 0.5 ? 1 : 0; inN++;
      }
      return { out: out / outN, inside: inside / inN };
    }, fing);
    const round = await ring(0), fingered = await ring(1);
    check('a round bubble is round in the air field', round.inside > 0.95 && round.out < 0.02,
      `${(100 * round.inside).toFixed(0)}% air inside, ${(100 * round.out).toFixed(0)}% at 1.35 of its radius`);
    check('a fingered one reaches out in fingers, not a bigger disc', fingered.inside > 0.95 && fingered.out > 0.08 && fingered.out < 0.6,
      `${(100 * fingered.out).toFixed(0)}% of the circle at 1.35 of its radius is air`);
  } finally { await close(); }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
