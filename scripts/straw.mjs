#!/usr/bin/env node
/**
 * A bubble blown through a straw.
 *
 *   npm run straw      (the list in node, the air field in the lab: any adapter that computes and renders)
 *
 * Held still, the Blow is a straw: one bubble on the end of it, growing while
 * the breath goes on, its rim breaking into fingers the faster it grows and
 * shedding a ring of small bubbles, and rounding off once let go. The list
 * is checked on its own (bubbles.ts); the fingers are checked where they
 * have to land, in the air field the solver takes the liquid out of and the
 * plate draws the bubble from.
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
  const { BubbleField } = await import(`../${out}`);
  const N = 192, dt = 1 / 60;
  const f = new BubbleField(N);
  const still = () => [0, 0];
  let growingFing = 0, sats = 0;
  const at = { x: 110, y: 80 };
  for (let t = 0; t < 180; t++) {           // three seconds of breath
    f.blow(at.x, at.y, dt, 1);
    f.step(dt, still, 0, 0, 1, 0);
    const b = f.bubbles.find((q) => q.straw);
    if (t === 60) growingFing = b?.fing ?? 0;
  }
  const blown = f.bubbles.filter((q) => q.straw);
  const big = blown.reduce((m, q) => (q.r > (m?.r ?? 0) ? q : m), null);
  sats = f.bubbles.length - blown.length;
  check('held still, one bubble grows on the end of the straw', blown.length === 1 && big && big.r > N * 0.05,
    big ? `${blown.length} blown, radius ${(big.r / N).toFixed(3)} of the plate` : 'none');
  check('and stays at the straw', big && Math.hypot(big.x - at.x, big.y - at.y) < 1, big ? `${Math.hypot(big.x - at.x, big.y - at.y).toFixed(2)} cells off` : '');
  check('its rim breaks into fingers while it grows fast', growingFing > 0.25, `fingering ${growingFing.toFixed(2)} a second in`);
  check('and it sheds a ring of small ones', sats >= 3, `${sats} satellites`);
  for (let t = 0; t < 240; t++) f.step(dt, still, 0, 0, 1, 0);   // let go for four seconds
  const after = f.bubbles.find((q) => q.straw && q.r > N * 0.04);
  check('let go, it stays on the plate and rounds off', after && after.fing < 0.1, after ? `fingering ${after.fing.toFixed(3)}` : 'gone');
  f.clearLooks();
  check('a look with no bubbles of its own keeps it', f.bubbles.some((q) => q.straw) && f.anyBlown);
  f.blow(40, 150, dt, 1); f.step(dt, still, 0, 0, 1, 0);
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
