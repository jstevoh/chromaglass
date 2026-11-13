#!/usr/bin/env node
/**
 * The tank on the GPU is the CPU reference's model (PLAN 47n).
 *
 *   npm run tankgpu      (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * `npm run tank` holds the CPU reference (src/lib/tank.ts) to the physics of
 * heavy dye in water: nothing made or lost, a still tank still, heavy over
 * light overturning, a gravity current at a real one's speed, a jet that thins
 * as gravity speeds it. The app cannot run that reference (float64 JavaScript,
 * a pressure solved to a tolerance); src/gpu/tank.ts writes the same substep
 * as compute passes. This is what those passes are held to.
 *
 * Two kinds of line, as the soap film's GPU check has, and for the same
 * reason: a solver can meet the physics by another scheme, and then the
 * reference's lines say nothing about the app.
 *
 *   The model, asked of the GPU. The same tank stepped on both, the CPU told
 *   to take the GPU's fixed sweep count so the two solve the same equations:
 *   the faces and the dye cell by cell after one step (within 1e-3 of the
 *   reference's RMS: float32 against float64 over one step reads about 1e-6,
 *   and a pass in the wrong order, a missing weight or a wall that slips
 *   reads percents), and the dye after one second of the nozzle's jet
 *   (within 2%: float32's rounding grows through the jet's shear, measured
 *   0.0x%, where a solver that carried the dye first-order upwind reads 30%).
 *
 *   The physics, asked of the GPU at the app's own sweep count (TANK_SWEEPS),
 *   which is fewer than the reference's solve to tolerance: the lock
 *   exchange's two fronts in the reference's bars (0.38 to 0.55 of √(g′H)),
 *   the closed tank's dye kept to float32's rounding (1e-5 of it over six
 *   seconds), the jet steady at 80% and 55% of the height (within 5% of the
 *   nozzle's flux), thinning (under 0.85×) because it speeds up (over
 *   1.15×), and the flow's leftover divergence printed beside the
 *   reference's.
 *
 *   And the work is the GPU's: every step submits to the queue and every read
 *   maps a buffer, and the solver's bundle does not carry src/lib/tank.ts.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const modulePath = process.env.TANKGPU_MODULE || 'src/gpu/tank.ts';
mkdirSync('node_modules/.cache', { recursive: true });
const refOut = `node_modules/.cache/tankgpu-ref-${process.pid}.mjs`;
await build({ stdin: { contents: "export * from './src/lib/tank.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: refOut, logLevel: 'warning' });
const { createTank, stepTank, nozzleSpan } = await import(`../${refOut}`);
const meta = await build({ entryPoints: [modulePath], bundle: true, format: 'esm', write: false, metafile: true, logLevel: 'silent', outdir: 'node_modules/.cache/tankgpu-meta' });
const carriesReference = Object.values(meta.metafile.outputs).some((o) => (o.inputs['src/lib/tank.ts']?.bytesInOutput ?? 0) > 0);
let SWEEPS = 0; // the app's sweep count, read from the solver in the page

const entry = `node_modules/.cache/tankgpu-${modulePath.replace(/[^A-Za-z0-9]+/g, '-')}.ts`;
writeFileSync(entry, `import * as S from ${JSON.stringify(resolve(modulePath))};
(window as any).tankGpu = S;
const count = ((window as any).__gpuCount = { submit: 0, map: 0 });
const submit = GPUQueue.prototype.submit, mapAsync = GPUBuffer.prototype.mapAsync;
GPUQueue.prototype.submit = function (...a: any[]) { count.submit++; return (submit as any).apply(this, a); };
GPUBuffer.prototype.mapAsync = function (...a: any[]) { count.map++; return (mapAsync as any).apply(this, a); };
(window as any).labReady = true;
`);
const { page, close } = await openLab({ entry });

const DT = 1 / 60, G = 9.81 * 0.005;
const rms = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
const rmsDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); };
const sum = (a) => { let s = 0; for (const x of a) s += x; return s; };

let exitCode = 1;
try {
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    if (!a) throw new Error('no adapter');
    window.__dev = await a.requestDevice();
    window.__errors = [];
    window.__dev.addEventListener('uncapturederror', (e) => window.__errors.push(e.error.message.slice(0, 300)));
    return `${a.info.vendor} ${a.info.architecture}`.trim();
  });
  SWEEPS = await page.evaluate(() => window.tankGpu.TANK_SWEEPS);
  console.log(`  adapter: ${adapter || 'unnamed'}; the app's sweeps a substep: ${SWEEPS}`);

  /*
    A tank stepped `steps` times in the page from `start`, read back at each
    step named in `reads` (and the work counted).
  */
  const gpu = (s) => page.evaluate(async (s) => {
    const t = window.tankGpu.createTankGpu(window.__dev, { nx: s.nx, ny: s.ny, width: s.width });
    t.write({ c: s.c });
    const c = window.__gpuCount, reads = {};
    let idle = 0, idleReads = 0;
    for (let k = 1; k <= s.steps; k++) {
      const n0 = c.submit;
      t.step(s.dt, s.o);
      if (c.submit === n0) idle++;
      if (s.reads.includes(k)) {
        const m0 = c.map;
        const r = await t.read();
        if (c.map === m0) idleReads++;
        reads[k] = { u: Array.from(r.u), v: Array.from(r.v), c: Array.from(r.c) };
      }
    }
    t.destroy();
    return { reads, idle, idleReads };
  }, s);
  const cpu = (s) => {
    const t = createTank({ nx: s.nx, ny: s.ny, width: s.width });
    if (s.c) t.c.set(s.c);
    for (let k = 1; k <= s.steps; k++) stepTank(t, s.dt, s.o);
    return t;
  };
  const lockStart = (nx, ny) => { const c = new Array(nx * ny).fill(0); for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) c[j * nx + i] = 1; return c; };
  let idleSteps = 0, idleReads = 0;
  const tally = (r) => { idleSteps += r.idle; idleReads += r.idleReads; return r; };

  // --- The model: one step, cell by cell ---
  {
    const s = { nx: 64, ny: 32, width: 0.2, dt: DT, steps: 2, reads: [2], o: { gPrime: G, feed: 0.015, nozzleW: 0.009, drain: 0.5, sweeps: SWEEPS }, c: lockStart(64, 32) };
    const g = tally(await gpu(s)).reads[2], r = cpu(s);
    const du = rmsDiff(g.u, r.u) / rms(r.u), dv = rmsDiff(g.v, r.v) / rms(r.v), dc = rmsDiff(g.c, r.c) / rms(r.c);
    check('two steps, cell by cell: the x-faces are the reference\'s', du < 1e-3, `${du.toExponential(1)} of the reference's RMS`);
    check('the y-faces', dv < 1e-3, `${dv.toExponential(1)}`);
    check('the dye', dc < 1e-3, `${dc.toExponential(1)}`);
  }
  // --- The model: one second of the jet ---
  {
    const s = { nx: 96, ny: 54, width: 0.24, dt: DT, steps: 60, reads: [60], o: { gPrime: G, feed: 0.015, nozzleW: 0.005, drain: 1, sweeps: SWEEPS } };
    const g = tally(await gpu(s)).reads[60], r = cpu(s);
    const dc = rmsDiff(g.c, r.c) / rms(r.c);
    check('a second of the nozzle\'s jet: the dye is the reference\'s', dc < 0.02, `${(dc * 100).toFixed(3)}% of its RMS`);
  }
  // --- The physics at the app's sweeps: the lock exchange ---
  {
    const nx = 128, ny = 32, H = 0.1;
    const s = { nx, ny, width: 0.4, dt: DT, steps: 360, reads: [120, 360], o: { gPrime: G, feed: 0, drain: 0 }, c: lockStart(nx, ny) };
    const g = tally(await gpu(s)).reads;
    const dx = 0.4 / nx;
    const floorFront = (c) => { let f = 0; for (let j = 0; j < ny / 4; j++) for (let i = 0; i < nx; i++) if (c[j * nx + i] > 0.5 && i > f) f = i; return (f + 0.5) * dx; };
    const surfaceFront = (c) => { let f = nx; for (let j = ny - ny / 4; j < ny; j++) for (let i = 0; i < nx; i++) if (c[j * nx + i] < 0.5 && i < f) f = i; return (f + 0.5) * dx; };
    const U = Math.sqrt(G * H);
    const frFloor = (floorFront(g[360].c) - floorFront(g[120].c)) / 4 / U;
    const frTop = (surfaceFront(g[120].c) - surfaceFront(g[360].c)) / 4 / U;
    check('the lock exchange\'s floor front at a real gravity current\'s speed', frFloor >= 0.38 && frFloor <= 0.55, `U/√(g′H) ${frFloor.toFixed(3)} (bar 0.38–0.55)`);
    check('and its surface front', frTop >= 0.38 && frTop <= 0.55, `${frTop.toFixed(3)}`);
    const held = sum(g[360].c) / (nx * ny / 2) - 1;
    check('a closed tank keeps its dye to float32\'s rounding', Math.abs(held) < 1e-5, `${held.toExponential(1)} of it over 6 s`);
  }
  // --- The physics at the app's sweeps: the jet ---
  {
    const NX = 128, NY = 72, W = 0.24, FEED = 0.015, NOZ = 0.004;
    const s = { nx: NX, ny: NY, width: W, dt: DT, steps: 720, reads: [720], o: { gPrime: G, feed: FEED, nozzleW: NOZ, drain: 1 } };
    const g = tally(await gpu(s)).reads[720];
    const dx = W / NX;
    const row = (frac) => {
      const j = Math.round(frac * NY);
      let m = 0, F = 0;
      for (let i = 0; i < NX; i++) { const c = g.c[j * NX + i]; m += c; F += -0.5 * (g.v[j * NX + i] + g.v[(j + 1) * NX + i]) * c; }
      return { m: m * dx, F: F * dx, v: F / Math.max(m, 1e-30) };
    };
    const [i0, i1] = nozzleSpan(NX, dx, 0.5, NOZ);
    const Q = FEED * (i1 - i0) * dx;
    const hi = row(0.8), mid = row(0.55);
    check('the jet is steady at 80% of the height', Math.abs(hi.F / Q - 1) < 0.05, `${(hi.F / Q * 100).toFixed(1)}% of Q`);
    check('and at 55%', Math.abs(mid.F / Q - 1) < 0.05, `${(mid.F / Q * 100).toFixed(1)}% of Q`);
    check('the thread thins as it falls', mid.m < 0.85 * hi.m, `${(hi.m * 1e3).toFixed(2)} → ${(mid.m * 1e3).toFixed(2)} mm of dye`);
    check('because it speeds up', mid.v > 1.15 * hi.v, `${(hi.v * 100).toFixed(1)} → ${(mid.v * 100).toFixed(1)} cm/s`);
    let dmax = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const d = Math.abs(g.u[j * (NX + 1) + i + 1] - g.u[j * (NX + 1) + i] + g.v[(j + 1) * NX + i] - g.v[j * NX + i]);
      if (d > dmax) dmax = d;
    }
    console.log(`  the jet's leftover divergence at ${SWEEPS} sweeps: ${dmax.toExponential(1)} m/s·cell (the feed is ${FEED} m/s; the reference solves to 1e-9)`);
  }
  check('every step submitted GPU work', idleSteps === 0, `${idleSteps} idle`);
  check('every read mapped a buffer', idleReads === 0, `${idleReads} idle`);
  check('and the solver does not carry the CPU reference', !carriesReference, carriesReference ? `${modulePath}'s bundle includes src/lib/tank.ts` : 'src/lib/tank.ts is not in its bundle');
  const errors = await page.evaluate(() => window.__errors);
  check('no WebGPU validation errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  exitCode = checks.every((c) => c.ok) ? 0 : 1;
} catch (e) {
  console.log(` FAIL ${e.message}`);
} finally {
  await close();
}
const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(exitCode);
