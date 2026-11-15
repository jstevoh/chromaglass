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
 *   the faces and the dye cell by cell after two steps (within 1e-3 of the
 *   reference's RMS: float32 against float64 reads 1.1e-6 on the x-faces,
 *   8e-7 on the y-faces and 9e-8 on the dye, so a pass in the wrong order, a
 *   missing weight or a wall that slips, each a change to the equations,
 *   has three orders of magnitude to show in), and the dye after one second
 *   of the nozzle's jet (within 2%: float32's rounding through the jet's
 *   shear measured under 0.001%; the bar leaves room for a GPU compiler that
 *   fuses the arithmetic differently, as Metal may).
 *
 *   The physics, asked of the GPU at the app's own V-cycles a substep
 *   (TANK_CYCLES), fewer than the reference's solve to tolerance: the lock
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
let CYCLES = 0; // the app's V-cycles a substep, read from the solver in the page

const entry = `node_modules/.cache/tankgpu-${modulePath.replace(/[^A-Za-z0-9]+/g, '-')}.ts`;
writeFileSync(entry, `import * as S from ${JSON.stringify(resolve(modulePath))};
import * as P from ${JSON.stringify(resolve('src/gpu/tankPlate.ts'))};
import * as D from ${JSON.stringify(resolve('src/gpu/tankDraw.ts'))};
import { PipelineCache } from ${JSON.stringify(resolve('src/gpu/kit.ts'))};
(window as any).tankGpu = S;
(window as any).tankPlate = { ...P, ...D, PipelineCache };
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
  CYCLES = await page.evaluate(() => window.tankGpu.TANK_CYCLES);
  console.log(`  adapter: ${adapter || 'unnamed'}; the app's V-cycles a substep: ${CYCLES}`);

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
    const s = { nx: 64, ny: 32, width: 0.2, dt: DT, steps: 2, reads: [2], o: { gPrime: G, feed: 0.015, nozzleW: 0.009, drain: 0.5, cycles: CYCLES }, c: lockStart(64, 32) };
    const g = tally(await gpu(s)).reads[2], r = cpu(s);
    const du = rmsDiff(g.u, r.u) / rms(r.u), dv = rmsDiff(g.v, r.v) / rms(r.v), dc = rmsDiff(g.c, r.c) / rms(r.c);
    check('two steps, cell by cell: the x-faces are the reference\'s', du < 1e-3, `${du.toExponential(1)} of the reference's RMS`);
    check('the y-faces', dv < 1e-3, `${dv.toExponential(1)}`);
    check('the dye', dc < 1e-3, `${dc.toExponential(1)}`);
  }
  // --- The model: one second of the jet ---
  {
    const s = { nx: 96, ny: 54, width: 0.24, dt: DT, steps: 60, reads: [60], o: { gPrime: G, feed: 0.015, nozzleW: 0.005, drain: 1, cycles: CYCLES } };
    const g = tally(await gpu(s)).reads[60], r = cpu(s);
    const dc = rmsDiff(g.c, r.c) / rms(r.c);
    check('a second of the nozzle\'s jet: the dye is the reference\'s', dc < 0.02, `${(dc * 100).toFixed(3)}% of its RMS`);
  }
  // --- The physics at the app's cycles: the lock exchange ---
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
  // --- The physics at the app's cycles: the jet ---
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
      if (!(d <= dmax)) dmax = d;
    }
    console.log(`  the jet's leftover divergence at ${CYCLES} V-cycles: ${dmax.toExponential(1)} m/s·cell (the feed is ${FEED} m/s; the reference solves to 1e-9)`);
  }
  /*
    The app's half (src/gpu/tankPlate.ts and tankDraw.ts), on its own grid:
    the settings in their units (Feed cm/s, so after k steps the tank holds
    feed/100 · the nozzle's bore · k/60 of dye, to float32's rounding, before
    any reaches the floor), a held finger carrying the nozzle from where the
    Nozzle setting put it (a hold at 0.8 of the plate is 0.95 of the screen:
    the plate's field spans 1.5 screens), and the draw: nothing without a
    tank (the plate draws itself), the dye drawn under the nozzle with a tank,
    black water where there is none.
  */
  {
    const r = await page.evaluate(async () => {
      const dev = window.__dev, M = window.tankPlate;
      const tp = new M.TankPlate(dev);
      const nx = M.TANK_PLATE_NX, ny = M.TANK_PLATE_NY, dx = M.TANK_PLATE_WIDTH / nx;
      const params = { tank: 1, tankFeed: 3, tankWeight: 1, tankNozzle: 0.25, tankDrain: 1, tankHue: 120 };
      const readC = async () => {
        const b = dev.createBuffer({ size: nx * ny * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const e = dev.createCommandEncoder(); e.copyBufferToBuffer(tp.field.c, 0, b, 0, nx * ny * 4); dev.queue.submit([e.finish()]);
        await b.mapAsync(GPUMapMode.READ); const c = new Float32Array(b.getMappedRange().slice(0)); b.unmap(); b.destroy(); return c;
      };
      const step = (holds) => { const e = dev.createCommandEncoder(); tp.step(e, 1 / 60, params, holds); dev.queue.submit([e.finish()]); };
      for (let k = 0; k < 30; k++) step([]);
      const a = await readC();
      for (let k = 0; k < 30; k++) step([{ x: 0.8, y: 0.5 }]);
      const b = await readC();
      const topAt = (c, frac) => { let m = 0; const i0 = Math.round(frac * nx); for (let i = i0 - 3; i <= i0 + 3; i++) m = Math.max(m, c[(ny - 1) * nx + i]); return m; };
      let held = 0; for (const x of a) held += x;
      const fed = (3 / 100) * Math.max(1, Math.round(M.TANK_NOZZLE_W / dx)) * dx * (30 / 60);
      // The draw, into the plate's two targets.
      const pipes = M.PipelineCache.for(dev, 'tankgpu');
      const tex = (f) => dev.createTexture({ size: [128, 72], format: f, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const col = tex('rgba8unorm'), aux = tex('rgba8unorm');
      const e = dev.createCommandEncoder();
      const none = M.drawTank(dev, pipes, e, col.createView(), aux.createView(), null, { width: 128, height: 72 }, undefined, false, 'rgba8unorm', (x) => x);
      const drew = M.drawTank(dev, pipes, e, col.createView(), aux.createView(), tp.field, { width: 128, height: 72 }, undefined, false, 'rgba8unorm', (x) => x);
      const out = dev.createBuffer({ size: 512 * 72, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      e.copyTextureToBuffer({ texture: col }, { buffer: out, bytesPerRow: 512 }, [128, 72]);
      dev.queue.submit([e.finish()]);
      await out.mapAsync(GPUMapMode.READ); const px = new Uint8Array(out.getMappedRange().slice(0)); out.unmap();
      // Screen row 0 is the top of the canvas (the draw was not flipped), where the nozzle is.
      const g = (x, y) => px[y * 512 + x * 4 + 1];
      let under = 0; for (let y = 0; y < 4; y++) for (let x = 119; x <= 124; x++) under = Math.max(under, g(x, y));
      let away = 0; for (let y = 0; y < 72; y++) for (let x = 40; x <= 80; x++) away = Math.max(away, g(x, y));
      tp.dispose();
      return { held: held * dx * dx, fed, at25: topAt(a, 0.25), at95a: topAt(a, 0.95), at95b: topAt(b, 0.95), none, drew, under, away, colour: Array.from(tp.field.colour) };
    });
    check('the app\'s tank takes Feed in cm/s: half a second at 3 cm/s holds what the bore fed', Math.abs(r.held / r.fed - 1) < 1e-3, `${r.held.toExponential(4)} held, ${r.fed.toExponential(4)} fed`);
    check('the Nozzle setting puts the nozzle there', r.at25 > 0.5 && r.at95a < 1e-6, `top row ${r.at25.toFixed(2)} at 0.25, ${r.at95a.toExponential(1)} at 0.95`);
    check('a finger held at 0.8 of the plate carries it to 0.95 of the screen', r.at95b > 0.5, `top row ${r.at95b.toFixed(2)} at 0.95`);
    check('with no tank the draw declines and the plate draws itself', r.none === false && r.drew === true, `${r.none}, ${r.drew}`);
    check('with one, the dye glows under the nozzle (Glow Hue 120 is green) and the water away from it is black', r.under > 100 && r.away < 8, `green ${r.under} under it, ${r.away} at most away; colour ${r.colour.map((v) => v.toFixed(2)).join(',')}`);
  }
  /*
    The app's tank at the heaviest settings the desk allows (Dye Weight 3%,
    Feed 6 cm/s, the sliders' tops in midi.ts), set through TankPlate.step
    as the desk sets them, so its conversion to g′ and m/s is in the test.
    This is the line that found the pressure solve wanting: at Weight 1% and
    Feed 3 cm/s, 40 SOR sweeps a substep left the 144-cell-tall tank
    divergent, the dye's flux ran past its bound, and the tank was NaN in a
    quarter of a second. Three seconds: at two (before the jet lands, about
    2.2 s in) the tank holds exactly what the bore fed, so the dye is real and
    none was made or lost; at three the jet has reached the floor (the
    impact and the drain, where the pressure spans the whole tank), and the
    field must be finite, the dye within the limiter's [0, 1] (an overshoot
    past 1 is the flux outrunning its bound, the first sign of that blowup),
    and the flow divergence-free to a bar far under the feed. The largest
    divergence is taken so that a NaN carries through (`!(d <= dmax)`): a
    blown-up field fails the line on its own, not only beside the finite one.
    Measured: 2.5e-8 m/s·cell at one second, at most 6.8e-8 over four.
  */
  {
    const r = await page.evaluate(async () => {
      const dev = window.__dev, M = window.tankPlate;
      const tp = new M.TankPlate(dev);
      const nx = M.TANK_PLATE_NX, ny = M.TANK_PLATE_NY, dx = M.TANK_PLATE_WIDTH / nx;
      const params = { tank: 1, tankFeed: 6, tankWeight: 3, tankNozzle: 0.5, tankDrain: 1, tankHue: 205 };
      const step = () => { const e = dev.createCommandEncoder(); tp.step(e, 1 / 60, params, []); dev.queue.submit([e.finish()]); };
      for (let k = 0; k < 120; k++) step();
      const a = await tp.tank.read();
      let held = 0; for (const x of a.c) held += x;
      for (let k = 0; k < 60; k++) step();
      const b = await tp.tank.read();
      tp.dispose();
      let floor = 0; for (let i = 0; i < nx; i++) floor = Math.max(floor, b.c[i]);
      return { nx, ny, held: held * dx * dx, fed: (6 / 100) * Math.max(1, Math.round(M.TANK_NOZZLE_W / dx)) * dx * 2, floor, u: Array.from(b.u), v: Array.from(b.v), c: Array.from(b.c) };
    });
    const { nx, ny } = r;
    let finite = true, cMin = Infinity, cMax = -Infinity;
    for (const arr of [r.u, r.v, r.c]) for (const x of arr) if (!Number.isFinite(x)) finite = false;
    for (const x of r.c) { if (!(x >= cMin)) cMin = x; if (!(x <= cMax)) cMax = x; }
    let dmax = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = Math.abs(r.u[j * (nx + 1) + i + 1] - r.u[j * (nx + 1) + i] + r.v[(j + 1) * nx + i] - r.v[j * nx + i]);
      if (!(d <= dmax)) dmax = d;
    }
    check('the app\'s tank at Weight 3% and Feed 6 cm/s holds what the bore fed for two seconds', Math.abs(r.held / r.fed - 1) < 1e-3, `${r.held.toExponential(4)} held, ${r.fed.toExponential(4)} fed`);
    check('and at three the jet is on the floor', r.floor > 0.05, `the floor row's dye at most ${r.floor.toFixed(3)}`);
    check('still finite, the dye within [0, 1]', finite && cMin > -1e-3 && cMax < 1.001, `${finite ? 'finite' : 'NOT finite'}; dye ${cMin.toExponential(1)} to ${cMax.toFixed(4)}`);
    check('and its flow divergence-free', dmax < 1e-6, `${Number.isFinite(dmax) ? dmax.toExponential(1) : dmax} m/s·cell at most (bar 1e-6; the feed is 0.06 m/s)`);
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
