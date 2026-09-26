#!/usr/bin/env node
/**
 * The solver's physics, measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run physics
 *
 * Each question with the control that makes it mean something:
 *
 *   1. the projection makes the flow incompressible: multigrid against the
 *      red-black sweeps alone, on the same violent, messy forcing
 *   2. the magnet draws ferrofluid toward it, as a force on the liquid
 *   3. and neither makes nor loses any, nor packs a cell past full
 *   4–10. the liquids' own physics and chemistry (docs/physics-plan.md):
 *      surface tension, Marangoni flow, buoyancy, vorticity confinement,
 *      the BZ reaction, Liesegang rings and the ferrofluid maze,
 *      each against the same plate with it off
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
  // ── 1: incompressible ──
  const divergence = async (solver) => {
    await page.evaluate(() => lab.create(192, 192));
    await page.evaluate((s) => { lab.solver().pressureSolver = s; }, solver);
    await page.evaluate(() => {
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 40; k++) lab.vel(r(), r(), 0.03 + 0.08 * r(), [(r() - 0.5) * 8, (r() - 0.5) * 8, 0, 0]);
      lab.flush();
    });
    await page.evaluate(() => lab.step(30));
    return page.evaluate(async () => {
      const v = await lab.field('vel'); const L = 192; let d = 0, m = 0;
      const at = (i, j, c) => v[(i + j * L) * 4 + c];
      for (let j = 1; j < L - 1; j++) for (let i = 1; i < L - 1; i++) {
        d += Math.abs((at(i + 1, j, 0) - at(i - 1, j, 0)) + (at(i, j + 1, 1) - at(i, j - 1, 1))) * 0.5;
        m += Math.hypot(at(i, j, 0), at(i, j, 1));
      }
      return d / m;
    });
  };
  const sweeps = await divergence('sweeps');
  const multigrid = await divergence('multigrid');
  check('multigrid makes the flow far more incompressible than the sweeps alone',
    multigrid * 3 < sweeps, `divergence per unit speed ${multigrid.toFixed(4)} against ${sweeps.toFixed(4)}`);

  // ── 2, 3: the magnet ──
  const blob = async (strength) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.solver().clearPhase(); lab.addPhase(0.55, 0.5, 0.08, 0.9); });
    const read = () => page.evaluate(async () => {
      const f = await lab.phase(); const n = f.n; let t = 0, cx = 0, peak = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = f.data[x + y * n]; t += q; cx += q * x / n; peak = Math.max(peak, q); }
      return { mass: t, x: cx / t, peak };
    });
    const before = await read();
    // The edge sharpening is off here: it is not conservative (it clamps),
    // and this asks about the transport, not about it.
    await page.evaluate((s) => lab.step(120, { magnetStrength: s, magnetX: 0.75, magnetY: 0.5, magnetHeight: 0.12, dt: 0.002, advection: 0.35, phaseSharp: 0, phaseTension: 0 }), strength);
    return { before, after: await read() };
  };
  const off = await blob(0);
  const on = await blob(0.9);
  const moved = on.after.x - on.before.x, drift = off.after.x - off.before.x;
  check('the magnet draws the ferrofluid toward it', moved > drift + 0.05,
    `centre of mass ${on.before.x.toFixed(3)} → ${on.after.x.toFixed(3)} toward a magnet at 0.75, against ${drift.toFixed(3)} with it off`);
  check('and none is made or lost', Math.abs(on.after.mass / on.before.mass - 1) < 0.01,
    `${on.before.mass.toFixed(1)} → ${on.after.mass.toFixed(1)}`);
  check('and no cell is packed past full', on.after.peak < 1.02, `peak ${on.after.peak.toFixed(3)}`);

  // ── 4: surface tension between oil and water ──
  const strip = async (tension) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { for (let k = 0; k < 9; k++) lab.solver().addMix(0.3 + k * 0.05, 0.5, 0.045, { oil: 1 }); });
    const read = () => page.evaluate(async () => {
      const f = await lab.solver().readChemistry('mix'); const n = f.n; let t = 0, cx = 0, cy = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = f.data[(x + y * n) * 4]; t += c; cx += c * x; cy += c * y; }
      cx /= t; cy /= t; let xx = 0, yy = 0, xy = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = f.data[(x + y * n) * 4]; xx += c * (x - cx) ** 2; yy += c * (y - cy) ** 2; xy += c * (x - cx) * (y - cy); }
      const tr = xx + yy, det = xx * yy - xy * xy, d = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      return { mass: t, aspect: Math.sqrt((tr / 2 + d) / (tr / 2 - d)) };
    });
    const before = await read();
    await page.evaluate((t) => lab.step(180, { oilTension: t, dt: 0.004 }), tension);
    return { before, after: await read() };
  };
  const flat = await strip(0), tense = await strip(1);
  check('surface tension pulls a strip of oil round', tense.after.aspect < tense.before.aspect * 0.7 && flat.after.aspect > flat.before.aspect * 0.95,
    `aspect ${tense.before.aspect.toFixed(2)} → ${tense.after.aspect.toFixed(2)}, against ${flat.after.aspect.toFixed(2)} with none`);
  check('and keeps all the oil', Math.abs(tense.after.mass / tense.before.mass - 1) < 0.01,
    `${tense.before.mass.toFixed(1)} → ${tense.after.mass.toFixed(1)}`);

  // ── 5: Marangoni flow ──
  const soapDrop = async (on) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.35, [1, 1, 1], 1); lab.flush(); lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }); });
    await page.evaluate((s) => lab.step(90, { surfactantFlow: s, dt: 0.004 }), on);
    return page.evaluate(async () => {
      const d = await lab.field('dye'); const L = 192; let inner = 0, tot = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const a = d[(i + j * L) * 4 + 3]; tot += a; if (Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5) < 0.1) inner += a; }
      return { inner, tot };
    });
  };
  const still = await soapDrop(0), burst = await soapDrop(1);
  check('soap drives the dye away from where it lands', burst.inner < still.inner * 0.6,
    `dye within a tenth of the drop ${still.inner.toFixed(0)} without the flow, ${burst.inner.toFixed(0)} with it`);
  check('and carries it rather than making or losing any', Math.abs(burst.tot / still.tot - 1) < 0.01,
    `${still.tot.toFixed(0)} → ${burst.tot.toFixed(0)}`);

  /*
    And at a frame's time step, the dial where a performer puts it: reported
    as a halftone lattice of dots over the dye with Soap Bursts at 80%. The
    soap's own spread was an explicit diffusion run near eight times past its
    limit, so the soap flipped between neighbouring cells every step and
    carried the dye into a checkerboard. Measured on 2x2 blocks (a - b - c + d,
    zero on anything smoother than the grid): 50 times the plate without soap
    before, about 5 after (what is left is the fronts themselves).
  */
  const lattice = async (soap) => {
    await page.evaluate(() => lab.create(256, 256));
    await page.evaluate(() => {
      let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 30; k++) lab.dye(r(), r(), 0.08 + 0.1 * r(), [r(), r(), r()], 0.6);
      lab.flush();
    });
    for (let b = 0; b < 8; b++) {
      await page.evaluate((b) => lab.solver().addMix(0.2 + 0.6 * ((b * 0.618) % 1), 0.2 + 0.6 * ((b * 0.382 + 0.3) % 1), 0.05, { soap: 1 }), b);
      await page.evaluate((s) => lab.step(20, { surfactantFlow: s, dt: 0.016 }), soap);
    }
    return page.evaluate(async () => {
      const d = await lab.field('dye'); const L = 256; let cb = 0, tot = 0;
      const a = (i, j) => d[(i + j * L) * 4 + 3];
      for (let j = 0; j < L - 1; j++) for (let i = 0; i < L - 1; i++) {
        cb += Math.abs(a(i, j) - a(i + 1, j) - a(i, j + 1) + a(i + 1, j + 1)); tot += a(i, j);
      }
      return cb / tot;
    });
  };
  const calmGrid = await lattice(0), soapGrid = await lattice(0.8);
  check('Soap Bursts at 80% leave no lattice of dots in the dye', soapGrid < 12 * calmGrid + 0.004,
    `checkerboard ${soapGrid.toFixed(4)} against ${calmGrid.toFixed(4)} with no soap`);

  // ── 6: buoyancy ──
  const sink = async (b) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.dye(0.5, 0.7, 0.12, [1, 1, 1], 1); lab.flush(); });
    await page.evaluate((b) => lab.step(120, { solutalBuoyancy: b, plateUpright: b, dt: 0.004 }), b);
    return page.evaluate(async () => { const d = await lab.field('dye'); const L = 192; let t = 0, cy = 0; for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const a = d[(i + j * L) * 4 + 3]; t += a; cy += a * j / L; } return cy / t; });
  };
  const floats = await sink(0), sinks = await sink(1);
  check('stand the plate up and heavy dye sinks', sinks < floats - 0.04, `centre of mass ${floats.toFixed(3)} lying flat, ${sinks.toFixed(3)} standing up`);

  // Down is the room's, not the dish's: the dish is drawn turned, and on a
  // turned dish Lava Lamp's wax poured off toward a corner and the plate was
  // empty in twenty seconds. With the lamp under the plate, where it goes
  // out of view, the wax sinks down the screen and is sent back up.
  const turned = await (async () => {
    const a = 1, reach = 0.25, gx = -Math.sin(a), gy = -Math.cos(a);
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.12, [1, 1, 1], 1); lab.flush(); });
    const P = { solutalBuoyancy: 0.6, plateUpright: 1, heatDecay: 0.995, dt: 0.004, gravityX: gx, gravityY: gy, gravityReach: reach };
    const at = () => page.evaluate(({ gx, gy, reach }) => lab.field('dye').then((d) => {
      const L = 192; let t = 0, along = 0, across = 0, seen = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const m = d[(i + j * L) * 4 + 3], x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5, s = x * gx + y * gy;
        t += m; along += m * s; across += m * (x * gy - y * gx); if (s < reach) seen += m;
      }
      return { along: along / t, across: across / t, seen: seen / t };
    }), { gx, gy, reach });
    await page.evaluate((P) => lab.step(120, P), P);
    const early = await at();
    await page.evaluate((P) => lab.step(600, P), P);
    return { early, late: await at() };
  })();
  check('on a turned dish it sinks down the screen, not down the dish',
    turned.early.along > 0.03 && Math.abs(turned.early.across) < turned.early.along * 0.3,
    `${turned.early.along.toFixed(3)} down the screen, ${turned.early.across.toFixed(3)} across it`);
  // Tilt Direction: the propped edge can be any side. Tipped to the right
  // (downhill +x in the plate), the dye runs right, not down.
  const sideways = await (async () => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.12, [1, 1, 1], 1); lab.flush(); });
    await page.evaluate(() => lab.step(120, { solutalBuoyancy: 0.6, plateUpright: 1, dt: 0.004, gravityX: 1, gravityY: 0, gravityReach: 0.33 }));
    return page.evaluate(() => lab.field('dye').then((d) => {
      const L = 192; let t = 0, cx = 0, cy = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const m = d[(i + j * L) * 4 + 3]; t += m; cx += m * ((i + 0.5) / L - 0.5); cy += m * ((j + 0.5) / L - 0.5); }
      return { x: cx / t, y: cy / t };
    }));
  })();
  check('tilted to the right, it runs right', sideways.x > 0.03 && Math.abs(sideways.y) < sideways.x * 0.3,
    `centre of mass ${sideways.x.toFixed(3)} across, ${sideways.y.toFixed(3)} down`);
  check('and the lamp under the plate keeps it in view', turned.late.seen > 0.8,
    `${(100 * turned.late.seen).toFixed(0)}% above the bottom of the screen after twelve seconds`);

  // ── 7: vorticity confinement ──
  const spin = async (v) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { let q = 3; const r = () => (q = (q * 16807) % 2147483647) / 2147483647; for (let k = 0; k < 30; k++) lab.vel(r(), r(), 0.05, [(r() - 0.5) * 6, (r() - 0.5) * 6, 0, 0]); lab.flush(); });
    await page.evaluate((v) => lab.step(90, { vorticity: v, dt: 0.004 }), v);
    return page.evaluate(async () => { const f = await lab.field('vel'); const L = 192; let w = 0; const at = (i, j, c) => f[(i + j * L) * 4 + c]; for (let j = 1; j < L - 1; j++) for (let i = 1; i < L - 1; i++) w += Math.abs((at(i + 1, j, 1) - at(i - 1, j, 1)) - (at(i, j + 1, 0) - at(i, j - 1, 0))); return w; });
  };
  const calm = await spin(0), swirl = await spin(1);
  check('vorticity confinement keeps the eddies spinning', swirl > calm * 3, `|curl| ${calm.toFixed(1)} → ${swirl.toFixed(1)}`);

  // ── 8: the BZ reaction ──
  await page.evaluate(() => lab.create(128));
  await page.evaluate(() => lab.solver().addRxn(0.5, 0.5, 0.04, { bz: 0.9 }));
  const front = async () => { await page.evaluate(() => lab.step(40, { bzReaction: 1, dt: 0.004 })); return page.evaluate(async () => { const f = await lab.solver().readChemistry('rxn'); const n = f.n; let far = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (f.data[(x + y * n) * 4] > 0.3) far = Math.max(far, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5)); return far; }); };
  const f1 = await front(), f2 = await front();
  check('a BZ wave travels out from where it was started', f1 > 0.08 && f2 > f1 + 0.05, `front at ${f1.toFixed(3)}, then ${f2.toFixed(3)} of the plate`);

  // ── 9: Liesegang rings ──
  await page.evaluate(() => lab.create(128));
  for (let t = 0; t < 8; t++) await page.evaluate(() => { lab.solver().addLiesegang(0.5, 0.5, 0.06, 4); return lab.step(60, { liesegang: 1, dt: 0.004 }); });
  const bands = await page.evaluate(async () => {
    const f = await lab.solver().readChemistry('lies'); const n = f.n; const y = n / 2; const starts = []; let prev = 0;
    for (let x = n / 2 + 8; x < n; x++) { const on = f.data[(x + y * n) * 4 + 3] > 0.2 ? 1 : 0; if (on && !prev) starts.push(x); prev = on; }
    return starts;
  });
  const gaps = bands.slice(1).map((b, i) => b - bands[i]);
  check('Liesegang bands form, spaced wider as they go out', bands.length >= 4 && gaps[gaps.length - 1] > gaps[0],
    `${bands.length} bands, gaps ${gaps.join(', ')} cells`);

  // ── 10: the ferrofluid maze ──
  /*
    Eighteen drops, eight seconds with the maze field on and with it off,
    and no magnet in either: the field's uniform part alone (a coil under
    the plate) is what is being tested, since a magnet's pull breaks a
    plate into fragments with as much edge as a maze. A labyrinth is edge: its length (cell pairs either
    side of half full) against the same plate without the field, the
    ferrofluid all still there, and the black solid, with no grid printed
    through it by the projection (see phaseAdvect's Rhie–Chow correction).
  */
  const maze = async (on) => {
    await page.evaluate(() => lab.create(256));
    await page.evaluate(() => { for (let k = 0; k < 18; k++) { const a = k * 2.399963229728653, rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
      lab.addPhase(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad, 0.088, 0.9); } });
    const read = () => page.evaluate(async () => {
      const f = await lab.phase(); const n = f.n, d = f.data; let mass = 0, edge = 0, hf = 0, inner = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = d[x + y * n]; mass += v;
        if (x + 1 < n && (v > 0.5) !== (d[x + 1 + y * n] > 0.5)) edge++;
        if (y + 1 < n && (v > 0.5) !== (d[x + (y + 1) * n] > 0.5)) edge++;
        if (x > 0 && y > 0 && x < n - 1 && y < n - 1 && v > 0.9 && Math.min(d[x + 1 + y * n], d[x - 1 + y * n], d[x + (y + 1) * n], d[x + (y - 1) * n]) > 0.6) {
          const b = (4 * v + 2 * (d[x + 1 + y * n] + d[x - 1 + y * n] + d[x + (y + 1) * n] + d[x + (y - 1) * n])
            + d[x + 1 + (y + 1) * n] + d[x - 1 + (y + 1) * n] + d[x + 1 + (y - 1) * n] + d[x - 1 + (y - 1) * n]) / 16;
          hf += Math.abs(v - b); inner++;
        }
      }
      return { mass, edge, grid: hf / Math.max(1, inner) };
    });
    const before = await read();
    await page.evaluate((on) => lab.step(480, { magnetStrength: 0, ferroLabyrinth: on ? 1 : 0, phaseSharp: 0.75 }), on);
    return { before, after: await read() };
  };
  const loose = await maze(false), laby = await maze(true);
  check('a strong field turns the ferrofluid into a labyrinth', laby.after.edge > loose.after.edge * 1.5,
    `edge ${laby.after.edge} cells with the field, ${loose.after.edge} without (${laby.before.edge} poured)`);
  check('and keeps all of it', Math.abs(laby.after.mass / laby.before.mass - 1) < 0.01,
    `${laby.before.mass.toFixed(1)} → ${laby.after.mass.toFixed(1)}`);
  check('with the black solid, no grid through it', laby.after.grid < 0.01,
    `grid-scale part inside it ${laby.after.grid.toFixed(4)} (0.045 before the correction)`);

} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
