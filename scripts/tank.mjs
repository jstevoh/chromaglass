#!/usr/bin/env node
/**
 * The tank seen through its side (PLAN 47n): the CPU reference
 * (src/lib/tank.ts) held to the physics of a heavy dye in water.
 *
 *   npm run tank
 *
 * What each line asks, and why it is the phenomenon and not a moment of the
 * picture:
 *
 *   Nothing is made or lost. The dye in the tank is what the nozzle fed in
 *   less what left across the floor or the surface, to float64's rounding,
 *   and the flow is incompressible to the pressure solve's tolerance. A
 *   scheme that is not in flux form (the plate's semi-Lagrangian carry)
 *   loses or makes dye at 1e-4 a second and fails the first.
 *
 *   A still tank stays still. Dye stacked heavy under light (stable) is in
 *   hydrostatic balance: its weight is a pure gradient and the pressure
 *   takes all of it. A solver whose weight and pressure sit on different
 *   points (a collocated grid, a weight on the cells and a pressure on the
 *   faces) stirs a stratified tank by itself; this one must move nothing
 *   above a micron a second in ten seconds.
 *
 *   Heavy over light falls (Rayleigh–Taylor). The same layers turned over,
 *   with a ripple on the interface, overturn: the dye's centre falls by a
 *   fifth of the tank in ten seconds. With g′ = 0 it stays where it is.
 *
 *   A gravity current runs at the speed real ones do. The classic
 *   benchmark: a full-depth lock exchange, heavy fluid in one half of a
 *   tank H deep, released. Benjamin (1968) gives a front Froude number
 *   U/√(g′H) of ½ for the inviscid current; experiments (Keulegan 1958,
 *   Shin, Dalziel and Linden 2004) measure 0.44 to 0.48 along a no-slip
 *   floor, nearer ½ under a free surface. The bars: both fronts within
 *   0.38 to 0.55, and the floor's no faster than the surface's (no slip
 *   slows the floor's). Measured 0.42 and 0.46 on 128 × 32 (0.42 and the
 *   same on 96 and 200 wide, so it is the model's, not the grid's).
 *
 *   The jet thins as gravity speeds it up. The nozzle's dye, steady after
 *   twelve seconds: what crosses each row downward is what the nozzle
 *   feeds (within 5%; a row the thread has not reached, or a solver whose
 *   jet leaks sideways, fails), and lower down the same flux is carried
 *   faster in less dye: at 55% of the height the dye per row is under
 *   0.85 of its value at 80% and its mean speed over 1.15 times. The
 *   speed stays under free fall from the nozzle (√(feed² + 2g′Δz)) and
 *   over a quarter of it. Measured: 1.76 → 1.33 mm of dye, 3.2 → 4.2 cm/s,
 *   free fall 7.8 cm/s.
 *
 *   And gravity is what does it. The same nozzle with g′ = 0: the jet is
 *   only its feed, slows as viscosity spreads it, and by eight seconds has
 *   put under 1% of the dye at 55% of the height that the heavy jet had.
 *
 *   The drain is where the water goes. With the drain shut (0) the level
 *   rises and the heavy dye stays (under 0.25% leaves, the grid's smear
 *   beside the nozzle); open (1), dye that reached the floor
 *   leaves through it and none at the surface.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const modulePath = process.env.TANK_MODULE || 'src/lib/tank.ts';
if (!existsSync(modulePath)) {
  console.log(` FAIL ${modulePath} does not exist`);
  process.exit(1);
}
mkdirSync('node_modules/.cache', { recursive: true });
const out = `node_modules/.cache/tank-${process.pid}.mjs`;
await build({ stdin: { contents: `export * from './${modulePath}';`, resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { createTank, stepTank, tankDye, tankDivergence, nozzleSpan } = await import(`../${out}`);

const DT = 1 / 60;
const G = 9.81 * 0.005;
const run = (t, seconds, o, each) => { const n = Math.round(seconds / DT); for (let k = 1; k <= n; k++) { stepTank(t, DT, o); each?.(k * DT); } };
const maxAbs = (a) => { let m = 0; for (const x of a) m = Math.max(m, Math.abs(x)); return m; };
const centroidY = (t) => { let m = 0, y = 0; for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) { const c = t.c[j * t.nx + i]; m += c; y += c * (j + 0.5); } return y / m / t.ny; };

// --- A still tank, and heavy over light ---------------------------------
{
  const strat = (flip, g) => {
    const t = createTank({ nx: 64, ny: 48, width: 0.12 });
    for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
      const y = (j + 0.5) / t.ny;
      if (!flip) t.c[j * t.nx + i] = 1 - y; // heavy at the floor
      else {
        // light under heavy, the interface rippled by a tenth of a cell's worth of the tank
        const edge = 0.5 + 0.02 * Math.cos(2 * Math.PI * 2 * (i + 0.5) / t.nx);
        t.c[j * t.nx + i] = y > edge ? 1 : 0;
      }
    }
    const y0 = centroidY(t);
    run(t, 10, { gPrime: g, feed: 0, drain: 0 });
    return { t, fall: y0 - centroidY(t) };
  };
  const still = strat(false, G);
  const vmax = Math.max(maxAbs(still.t.u), maxAbs(still.t.v));
  check('a stable tank stays still: dye heavy at the floor moves nothing in 10 s', vmax < 1e-6, `largest flow ${vmax.toExponential(1)} m/s (bar 1e-6)`);
  const rt = strat(true, G);
  check('heavy over light overturns (Rayleigh–Taylor): the dye\'s centre falls a fifth of the tank in 10 s', rt.fall > 0.2, `fell ${(rt.fall * 100).toFixed(1)}% of the height`);
  const none = strat(true, 0);
  check('and without gravity it stays where it is', Math.abs(none.fall) < 1e-6, `moved ${(none.fall * 100).toExponential(1)}%`);
}

// --- The lock exchange ---------------------------------------------------
{
  const nx = 128, ny = 32, H = 0.1;
  const t = createTank({ nx, ny, width: 0.4 });
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) t.c[j * nx + i] = 1;
  const floorFront = () => { let f = 0; for (let j = 0; j < ny / 4; j++) for (let i = 0; i < nx; i++) if (t.c[j * nx + i] > 0.5 && i > f) f = i; return (f + 0.5) * t.dx; };
  const surfaceFront = () => { let f = nx; for (let j = ny - ny / 4; j < ny; j++) for (let i = 0; i < nx; i++) if (t.c[j * nx + i] < 0.5 && i < f) f = i; return (f + 0.5) * t.dx; };
  const at = {};
  run(t, 6, { gPrime: G, feed: 0, drain: 0 }, (s) => { const k = Math.round(s * 60); if (k === 120 || k === 360) at[k] = [floorFront(), surfaceFront()]; });
  const U = Math.sqrt(G * H);
  const frFloor = (at[360][0] - at[120][0]) / 4 / U, frTop = (at[120][1] - at[360][1]) / 4 / U;
  check('a lock exchange\'s floor front runs at a real gravity current\'s speed', frFloor >= 0.38 && frFloor <= 0.55, `U/√(g′H) ${frFloor.toFixed(3)} (Benjamin 0.5; experiments 0.44–0.48; bar 0.38–0.55)`);
  check('and its surface front too', frTop >= 0.38 && frTop <= 0.55, `${frTop.toFixed(3)}`);
  check('and the no-slip floor is no faster than the free surface', frFloor <= frTop + 0.01, `floor ${frFloor.toFixed(3)}, surface ${frTop.toFixed(3)}`);
  const lost = Math.abs(tankDye(t) - 0.2 * 0.1);
  check('nothing is made or lost in the lock exchange', lost < 1e-12, `${lost.toExponential(1)} c·m² of 0.02`);
}

// --- The nozzle's jet ----------------------------------------------------
const W = 0.24, NX = 128, NY = 72, FEED = 0.015, NOZ = 0.004;
const jet = (g, seconds, drain = 1, at8) => {
  const t = createTank({ nx: NX, ny: NY, width: W });
  run(t, seconds, { gPrime: g, feed: FEED, nozzleW: NOZ, drain }, (s) => { if (at8 && Math.round(s * 60) === 480) at8(t); });
  return t;
};
// The dye per row (∫c dx, metres of c = 1), the downward flux through it (∫(−v)c dx) and their ratio, the dye's mean speed.
const row = (t, frac) => {
  const j = Math.round(frac * t.ny);
  let m = 0, F = 0;
  for (let i = 0; i < t.nx; i++) {
    const c = t.c[j * t.nx + i];
    m += c; F += -0.5 * (t.v[j * t.nx + i] + t.v[(j + 1) * t.nx + i]) * c;
  }
  return { m: m * t.dx, F: F * t.dx, v: F / Math.max(m, 1e-30), z: (t.ny - j - 0.5) * t.dx };
};
{
  let mh = 0;
  const t = jet(G, 12, 1, (t8) => { mh = row(t8, 0.55).m; });
  const [i0, i1] = nozzleSpan(NX, t.dx, 0.5, NOZ);
  const Q = FEED * (i1 - i0) * t.dx;
  const hi = row(t, 0.8), mid = row(t, 0.55);
  check('the jet is steady: what crosses 80% of the height is what the nozzle feeds', Math.abs(hi.F / Q - 1) < 0.05, `${(hi.F / Q * 100).toFixed(1)}% of Q`);
  check('and what crosses 55%', Math.abs(mid.F / Q - 1) < 0.05, `${(mid.F / Q * 100).toFixed(1)}% of Q`);
  check('the thread thins as it falls', mid.m < 0.85 * hi.m, `${(hi.m * 1e3).toFixed(2)} → ${(mid.m * 1e3).toFixed(2)} mm of dye (bar under 0.85×)`);
  check('because it speeds up', mid.v > 1.15 * hi.v, `${(hi.v * 100).toFixed(1)} → ${(mid.v * 100).toFixed(1)} cm/s (bar over 1.15×)`);
  const free = Math.sqrt(FEED * FEED + 2 * G * mid.z);
  check('no faster than falling freely from the nozzle, and not stalled', mid.v < free && mid.v > 0.25 * free, `${(mid.v * 100).toFixed(1)} cm/s, free fall ${(free * 100).toFixed(1)} cm/s`);
  const kept = tankDye(t), owed = t.fedIn - t.leftOut;
  check('nothing is made or lost: the tank holds what was fed less what drained', Math.abs(kept - owed) < 1e-9 * t.fedIn, `${kept.toExponential(4)} held, ${owed.toExponential(4)} owed`);
  check('fed at the nozzle\'s rate', Math.abs(t.fedIn / (Q * 12) - 1) < 1e-9, `${t.fedIn.toExponential(4)} fed, Q·t ${(Q * 12).toExponential(4)}`);
  check('the flow is incompressible', tankDivergence(t) < 1e-6, `largest cell divergence ${tankDivergence(t).toExponential(1)} m/s·cell`);
  check('with the drain open, the dye that landed leaves through the floor', t.leftOut > 0, `${t.leftOut.toExponential(2)} c·m² drained`);
  const light = jet(0, 8);
  const ml = row(light, 0.55).m;
  check('gravity is what pulls it: with g′ = 0 the jet barely reaches 55% of the height', ml < 0.01 * mh, `${ml.toExponential(1)} vs ${mh.toExponential(1)} m of dye at 8 s`);
  /*
    Not zero: the top cell beside the nozzle holds a trace of dye that the
    grid's own smearing spreads sideways from the nozzle, and with the drain
    shut the rising level carries that cell's water out of the frame (a
    rigid lid riding the surface). Measured 3e-7 of 6.8e-4 fed in 12 s,
    0.05%; a solver that let the heavy jet itself reach the surface outflow
    would leave percents.
  */
  const shut = jet(G, 8, 0);
  check('with the drain shut the level rises and the heavy dye stays in the tank', shut.leftOut < 2.5e-3 * shut.fedIn, `${(shut.leftOut / shut.fedIn * 100).toFixed(3)}% of the fed dye left at the surface (bar 0.25%)`);
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
