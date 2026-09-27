#!/usr/bin/env node
/**
 * The Finger and Blow move the ferrofluid, as they move the dye.
 * Measured on the GPU solver (scripts/lab.mjs).
 *
 *   npm run ferrohands
 *
 * Asked by the owner (PLAN.md §9n): "Shouldn't blowing and finger also move
 * around the ferrofluid?" Barely. Both tools add velocity to the plate,
 * and the ferrofluid rides the flow as the dye does, but the push is small
 * and lasts one step before the speed clamp (MAX_SPEED, fluid.ts) cuts it
 * back to an idle plate's: a Finger dragged 30 cells across a pool moved
 * its middle 0.2 of a cell. So the dye has been carried by hand, a take
 * and a put, since the Finger was built (LiquidVisualizer, carryDye), and
 * the oil with it (carryMix); the ferrofluid never was. Now it is
 * (carryPhase, the solver's phaseCarry).
 *
 * Each gesture is worked out as the app works it out, by the same functions
 * (lib/handCarry.ts: fingerCarry, blowCarry, which LiquidVisualizer's
 * fingerDrag and blowPhase call), from the arguments each hand gives: the
 * mouse's Finger (strength 0.09), the phone's (0.045, fingerDrag's half),
 * the mouse's Blow held still (a puff) and moved (along the stroke). The
 * tool's push is added to the flow as well, a disc of the tool's own
 * strength without its swirl: a stand-in, which moved the pool 0.06 % of
 * the plate with the app's own velocity loops copied cell for cell and
 * 0.01 % as a disc. Each gesture is made twice on the same pool, with the
 * carry and with the push alone, which is all the tools did before; so the
 * control is in the same run.
 *
 *   1. a Finger stroke across a pool carries the ferrofluid along it: the
 *      pool's centre of mass moves at least 0.02 of the plate the stroke's
 *      way for the mouse's Finger and 0.013 for the phone's, and with the
 *      push alone less than 0.005
 *   2. a puff held over a pool blows a hole in it: the ferrofluid within
 *      the puff's half radius falls to under half of what it was, and with
 *      the push alone stays over nine tenths
 *   3. a Blow moved across the pool pushes it along, the mouse's and the
 *      phone's (a directed blow, wider): at least 0.005 of the plate, the
 *      push alone less than 0.002. Less than the Finger asks, because a
 *      blow is narrower and takes less (0.48 against 0.72): it carries a
 *      tongue from where it crossed the pool to where it stopped rather
 *      than dragging the pool
 *   4. none of it makes or loses ferrofluid
 *
 * Not measured here: which of these a hand reaches in the app (the calls
 * in LiquidVisualizer), the Finger's carry waiting for each reading of the
 * dye (dyeMirrorCurrent) and how often a hand acts. The lab acts once every
 * two steps; the app about once a frame. A Mac check through the real
 * pointer is PLAN.md §9q.
 *
 * On 256². A couple of minutes in a cloud session.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  /*
    One gesture on a fresh pool: `tool` is 'finger', 'phone finger', 'puff'
    'blow moved' or 'phone blow'; with
    `carry` false only the tool's push is added. Returns the pool's centre
    of mass, the ferrofluid inside the half radius of where the gesture
    ended, and the mass, before and after.
  */
  const run = (tool, carry) => page.evaluate(async ({ tool, carry }) => {
    const { L } = await lab.create(256);
    const solver = lab.solver();
    const pool = { x: 0.42, y: 0.5, r: 0.14 };
    lab.addPhase(pool.x, pool.y, pool.r, 0.9);
    await lab.step(30);
    const read = async (cx, cy, rr) => {
      const f = await lab.phase(); const n = f.n, d = f.data;
      let m = 0, mx = 0, my = 0, inside = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = d[x + y * n], u = (x + 0.5) / n, w = (y + 0.5) / n;
        m += v; mx += v * u; my += v * w;
        if (Math.hypot(u - cx, w - cy) < rr) inside += v;
      }
      return { mass: m, cx: mx / m, cy: my / m, inside };
    };
    // Each hand's carry, as the app works it out, along x from the pool's
    // middle (a stroke) or held there (a puff); in the app's L-cell grid.
    const events = 30, span = 0.16;
    const along = (i) => ({ x: (pool.x + span * i / events) * L, y: pool.y * L });
    const gesture = [];
    for (let i = 1; i <= events; i++) {
      const p = tool === 'puff' ? { x: pool.x * L, y: pool.y * L } : along(i);
      const c = tool === 'finger' ? lab.fingerCarry(p.x, p.y, 7, 0.09, 1, 0, L)
        : tool === 'phone finger' ? lab.fingerCarry(p.x, p.y, 7, 0.09 * 0.5, 1, 0, L)
        : tool === 'phone blow' ? lab.blowCarry(p.x, p.y, 4 + 2, 0.06, 1, 0, L)
        : lab.blowCarry(p.x, p.y, 4, 0.06, tool === 'puff' ? 0 : 1, 0, L);
      gesture.push({ ...c, push: tool.includes('finger') ? (tool === 'finger' ? 0.09 : 0.045) : 0.06 });
    }
    const at = gesture[gesture.length - 1], R = at.r;
    const before = await read(at.x, at.y, R / 2);
    for (const g of gesture) {
      // The tool's own push, each time: out from the middle for a puff.
      if (g.outward) { for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lab.vel(g.x + ox * g.r / 2, g.y + oy * g.r / 2, g.r / 2, [ox * g.push, oy * g.push, 0, 0]); }
      else lab.vel(g.x, g.y, g.r, [g.ux * g.push, g.uy * g.push, 0, 0]);
      lab.flush();
      if (carry) {
        if (!solver.carryPhase) throw new Error('no carryPhase on this solver');
        solver.carryPhase(g.x, g.y, g.r, g.ux, g.uy, g.take, g.hop, g.outward);
      }
      await lab.step(2);
    }
    await lab.step(10);
    const after = await read(at.x, at.y, R / 2);
    return { before, after };
  }, { tool, carry });

  const got = {};
  for (const tool of ['finger', 'phone finger', 'puff', 'blow moved', 'phone blow']) for (const carry of [true, false]) {
    const t0 = Date.now();
    const m = got[`${tool} ${carry ? 'carried' : 'pushed'}`] = await run(tool, carry);
    console.log(`  ${tool}, ${carry ? 'with the carry' : 'the push alone'}: centre of mass moved ${((m.after.cx - m.before.cx) * 100).toFixed(2)}% of the plate along x, ` +
      `${((m.after.cy - m.before.cy) * 100).toFixed(2)}% along y; under the hand ${m.before.inside.toFixed(1)} → ${m.after.inside.toFixed(1)}; mass ${m.before.mass.toFixed(1)} → ${m.after.mass.toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log('');
  const dx = (m) => m.after.cx - m.before.cx;
  const kept = (m) => m.after.inside / Math.max(m.before.inside, 1e-9);
  check('a Finger stroke carries the ferrofluid along it, the mouse\'s and the phone\'s',
    dx(got['finger carried']) >= 0.02 && dx(got['phone finger carried']) >= 0.013 &&
      Math.abs(dx(got['finger pushed'])) < 0.005 && Math.abs(dx(got['phone finger pushed'])) < 0.005,
    `${(dx(got['finger carried']) * 100).toFixed(2)}% and ${(dx(got['phone finger carried']) * 100).toFixed(2)}% of the plate the stroke's way, against ${(dx(got['finger pushed']) * 100).toFixed(2)}% and ${(dx(got['phone finger pushed']) * 100).toFixed(2)}% with the push alone`);
  check('a puff blows a hole in it', kept(got['puff carried']) < 0.5 && kept(got['puff pushed']) > 0.9,
    `${(kept(got['puff carried']) * 100).toFixed(0)}% left under the puff, against ${(kept(got['puff pushed']) * 100).toFixed(0)}% with the push alone`);
  check('a Blow moved across it pushes it along, the mouse\'s and the phone\'s',
    ['blow moved', 'phone blow'].every(t => dx(got[`${t} carried`]) >= 0.005 && Math.abs(dx(got[`${t} pushed`])) < 0.002),
    ['blow moved', 'phone blow'].map(t => `${(dx(got[`${t} carried`]) * 100).toFixed(2)}% against ${(dx(got[`${t} pushed`]) * 100).toFixed(2)}%`).join('; ') + ' with the push alone');
  const drift = Math.max(...Object.values(got).map(m => Math.abs(m.after.mass / m.before.mass - 1)));
  check('and none is made or lost', drift < 0.001, `worst ${(drift * 100).toFixed(4)}%`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
