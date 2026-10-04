#!/usr/bin/env node
/**
 * A hand's Blow pushes the colour and keeps it, rather than erasing it:
 * measured on the GPU solver (scripts/lab.mjs).
 *
 *   npm run wind
 *
 * Found auditing every tool against every liquid (PLAN.md §15c): a Blow
 * that was not blowing the straw's bubble (moved, a second finger on the
 * phone, a plate that is not the lead, and every remote hand) multiplied
 * the dye under it by 0.8 a step. It cleared a trail and moved nothing,
 * because its push is the one-step push the speed clamp cuts back (§15b).
 * Now it carries the colour as the Finger does (lib/handCarry.ts: blowDye,
 * which the app's blowWind calls), and with Oil Bodies the oil with it
 * (blowOil).
 *
 * Each gesture is made as the app makes it, from the arguments each hand
 * gives (lib/handCarry.ts: BLOW_RADIUS and BLOW_STRENGTH, which the app's
 * pointer and performGesture call with; remoteBlowRadius for a remote
 * hand's directed blow at a mouse's pressure), on a pool of colour, once a dye reading: the lab reads the
 * dye back, hands it to the carry as the app's mirror, flushes and steps
 * twice. Each is made three ways on the same pool: with the carry (now),
 * with the old eraser (the control: blowAir's 0.8 on every cell under it,
 * twice a reading, as the app ran it every step) and with the push alone.
 * The tool's push is added to the flow each time as a stand-in, a disc of
 * the tool's strength along the stroke, as `npm run ferrohands` adds it.
 *
 *   1. the wind drawn across a pool keeps the colour: the plate's total
 *      moves by less than 1% of it; the old eraser loses over 5% (it lost
 *      21%, the mouse's 0.8 a step and a remote hand's 15% at its middle
 *      alike)
 *   2. and pushes it along: the pool's centre of mass moves at least 0.004
 *      of the plate the wind's way, for the mouse's and a remote hand's,
 *      and the push alone and the old eraser less than 0.001 (the eraser
 *      goes backwards). What was under the wind's path is carried to its
 *      end: more than 10 of colour past where the wind stopped, where the
 *      push alone leaves none
 *   3. held still (a puff that is not the straw), it blows the colour out
 *      from under it onto a ring and keeps it: under the puff's half radius
 *      falls below half, the total moves by less than 2% (the Press's ring
 *      does not tile a small ring exactly on an uneven pool: 99.4% kept,
 *      PLAN.md 15f), and the old eraser loses over 5%
 *   4. with Oil Bodies the oil goes where its colour goes: a wind across
 *      the edge of a sheet of oil, along x and on a slant, and a puff on
 *      it; the colour carried once on a mirror holding exactly the oil and
 *      the oil once through the solver, each cell's change of the one
 *      against the other's, summed, under 10% of what moved for the wind
 *      (the dye scatters to the nearest cell ahead and the oil's kernel
 *      gathers from the one behind, which round alike along an axis but
 *      not always on a slant) and 1% for the puff (the Press's ring: the
 *      oil's kernel counts its ring's share on its own grid as the colour's
 *      is counted on the mirror's, pressShare, so on one grid the two land
 *      the same amounts; with the formula's 1 / K they were 0.09 apart of
 *      5.83 on a Mac). None of the oil made or lost, to 3% of
 *      what moved: a ring six cells in is exact only on an even palm, and
 *      the puff's sits on the oil's edge, where it loses what its colour
 *      loses (1.9%; with the formula's 1 / K, 3.3% on a Mac, which is how
 *      this went red and found it).
 *
 * Not measured here: the app itself. This runs the functions the app calls,
 * not the app, so an app that went back to erasing passes it (checked:
 * with LiquidVisualizer as it was, 1 to 3 pass). Which Blow a hand reaches
 * (the straw or the wind), the wind's wait for a fresh dye reading and that
 * it keeps the colour are `npm run tools`, on the Mac through the real
 * pointer; a remote hand's Blow through performGesture is measured by
 * neither (PLAN.md 15f).
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
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
    One gesture on a fresh pool of colour. `tool` is 'blow moved', 'remote
    blow' or 'puff'; `how` is 'carry', 'erase' or 'push'. Returns the dye's
    total, its centre of mass, what is inside the puff's half radius and
    what is past where the wind stopped, before and after.
  */
  const run = (tool, how) => page.evaluate(async ({ tool, how }) => {
    const M = 192;
    await lab.create(M, M);
    const pool = { x: 0.42, y: 0.5, r: 0.12 };
    lab.dye(pool.x, pool.y, pool.r, [0.2, 0.5, 0.9], 1);
    lab.flush();
    await lab.step(4);
    // The app's own numbers (lib/handCarry.ts): the mouse's Blow, and a
    // remote hand's directed one at a mouse's pressure (amount 1).
    const radius = tool === 'remote blow' ? lab.remoteBlowRadius(1, true) : lab.BLOW_RADIUS, strength = lab.BLOW_STRENGTH;
    const events = 30, span = 0.16;
    const at = (i) => tool === 'puff' ? { x: Math.round(pool.x * M), y: Math.round(pool.y * M) }
      : { x: Math.round((pool.x + span * i / events) * M), y: Math.round(pool.y * M) };
    const end = at(events);
    const R = Math.round(radius * M / 128);
    const read = async () => {
      const d = await lab.field('dye');
      let m = 0, mx = 0, my = 0, inside = 0, past = 0;
      for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
        const v = d[(x + y * M) * 4 + 3];
        m += v; mx += v * (x + 0.5) / M; my += v * (y + 0.5) / M;
        if (Math.hypot(x - end.x, y - end.y) < R / 2) inside += v;
        if (x > end.x && Math.abs(y - end.y) <= R) past += v;
      }
      return { mass: m, cx: mx / m, cy: my / m, inside, past, d };
    };
    const before = await read();
    let mirror = before.d;
    for (let i = 1; i <= events; i++) {
      const p = at(i);
      const dx = tool === 'puff' ? 0 : 1;
      // The tool's own push, each time, as a stand-in (npm run ferrohands).
      lab.vel((p.x + 0.5) / M, (p.y + 0.5) / M, R / M, [dx * strength, 0, 0, 0]);
      if (how === 'carry') lab.blowDye(mirror, p.x, p.y, radius, strength, dx, 0);
      else if (how === 'erase') for (let k = 0; k < 2; k++) lab.eraseDye(p.x, p.y, radius, tool === 'remote blow');
      lab.flush();
      await lab.step(2);
      mirror = await lab.field('dye');
    }
    await lab.step(10);
    const after = await read();
    delete before.d; delete after.d;
    return { before, after };
  }, { tool, how });

  const got = {};
  for (const tool of ['blow moved', 'remote blow', 'puff']) for (const how of ['carry', 'erase', 'push']) {
    const t0 = Date.now();
    const m = got[`${tool} ${how}`] = await run(tool, how);
    console.log(`  ${tool}, ${how === 'carry' ? 'carried' : how === 'erase' ? 'the old eraser' : 'the push alone'}: colour ${m.before.mass.toFixed(1)} → ${m.after.mass.toFixed(1)}; ` +
      `centre moved ${((m.after.cx - m.before.cx) * 100).toFixed(2)}% of the plate along x, ${((m.after.cy - m.before.cy) * 100).toFixed(2)}% along y; ` +
      `under where it ended ${m.before.inside.toFixed(1)} → ${m.after.inside.toFixed(1)}; past it ${m.before.past.toFixed(1)} → ${m.after.past.toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }

  // 4: the oil and its colour, from the same breath.
  const oil = await page.evaluate(async () => {
    const M = 192;
    const read = async (s) => Array.from((await s.readChemistry('mix')).data.filter((_, k) => k % 4 === 0));
    const out = {};
    for (const [name, dx, x0] of [['wind', 1, 0.47], ['slant', 1, 0.47], ['puff', 0, 0.5]]) {
      await lab.create(M, M);
      const s = lab.solver();
      s.addMix(-0.5, 0.5, 1.0, { oil: 0.5 });
      const a = await read(s);
      const x = Math.round(x0 * M), y = Math.round(0.5 * M), dy = name === 'slant' ? 0.6 : 0;
      lab.blowOil(x, y, lab.BLOW_RADIUS, lab.BLOW_STRENGTH, dx, dy, M);
      const b = await read(s);
      const mirror = new Array(M * M * 4).fill(0);
      a.forEach((v, i) => { mirror[i * 4] = v; mirror[i * 4 + 3] = v; });
      const d = lab.blowDye(mirror, x, y, lab.BLOW_RADIUS, lab.BLOW_STRENGTH, dx, dy, false);
      // Each cell's change, the oil's against the colour's: a cell under the
      // hand both gives and receives, so the gross take and put of the two
      // do not compare, their net does.
      let oilIn = 0, dyeIn = 0, apart = 0, oilTotal = [0, 0];
      for (let i = 0; i < M * M; i++) {
        const og = b[i] - a[i], dg = d.density[i] - a[i] * (1 - d.mul[i]);
        oilIn += Math.max(0, og); dyeIn += Math.max(0, dg); apart += Math.abs(og - dg);
        oilTotal[0] += a[i]; oilTotal[1] += b[i];
      }
      out[name] = { moved: d.moved, oilIn, dyeIn, apart, oilTotal };
    }
    return out;
  });
  for (const [name, o] of Object.entries(oil)) {
    console.log(`  oil, ${name}: colour moved ${o.moved.toFixed(2)}; cells gained, net, colour ${o.dyeIn.toFixed(2)} and oil ${o.oilIn.toFixed(2)}; ` +
      `apart cell by cell ${o.apart.toFixed(3)}; the oil ${o.oilTotal[0].toFixed(2)} → ${o.oilTotal[1].toFixed(2)}`);
  }
  console.log('');

  const kept = (m) => m.after.mass / m.before.mass;
  const dx = (m) => m.after.cx - m.before.cx;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const winds = ['blow moved', 'remote blow'];
  check('the wind drawn across a pool keeps the colour, the mouse\'s and a remote hand\'s',
    winds.every((t) => Math.abs(kept(got[`${t} carry`]) - 1) < 0.01) && winds.every((t) => kept(got[`${t} erase`]) < 0.95),
    winds.map((t) => `${pct(kept(got[`${t} carry`]))} kept, the old eraser ${pct(kept(got[`${t} erase`]))}`).join('; '));
  check('and pushes it along, to where the wind stopped',
    winds.every((t) => dx(got[`${t} carry`]) >= 0.004 && Math.abs(dx(got[`${t} push`])) < 0.001 && dx(got[`${t} erase`]) < 0.001
      && got[`${t} carry`].after.past > 10 && got[`${t} carry`].after.past > got[`${t} push`].after.past + 10),
    winds.map((t) => `centre ${(dx(got[`${t} carry`]) * 100).toFixed(2)}% of the plate its way (push alone ${(dx(got[`${t} push`]) * 100).toFixed(2)}%), ` +
      `past its end ${got[`${t} carry`].after.past.toFixed(1)} against ${got[`${t} push`].after.past.toFixed(1)}; the old eraser's centre ${(dx(got[`${t} erase`]) * 100).toFixed(2)}%`).join('; '));
  const puff = got['puff carry'];
  check('held still, it blows the colour out from under it and keeps it',
    puff.after.inside < 0.5 * puff.before.inside && Math.abs(kept(puff) - 1) < 0.02 && kept(got['puff erase']) < 0.95 && got['puff push'].after.inside > 0.9 * got['puff push'].before.inside,
    `under it ${puff.before.inside.toFixed(1)} → ${puff.after.inside.toFixed(1)} (push alone ${got['puff push'].before.inside.toFixed(1)} → ${got['puff push'].after.inside.toFixed(1)}), ${pct(kept(puff))} kept, the old eraser ${pct(kept(got['puff erase']))}`);
  const lands = (o, tol) => o.moved > 0.5 && o.oilIn > 0.3 * o.moved && o.dyeIn > 0.3 * o.moved && o.apart < tol * o.moved && Math.abs(o.oilTotal[1] - o.oilTotal[0]) < 0.03 * o.moved;
  check('with Oil Bodies the oil goes where its colour goes, along, on a slant and held still',
    lands(oil.wind, 0.1) && lands(oil.slant, 0.1) && lands(oil.puff, 0.01),
    Object.entries(oil).map(([n, o]) => `${n} ${o.apart.toFixed(2)} apart of ${o.moved.toFixed(2)} moved`).join(', '));
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
