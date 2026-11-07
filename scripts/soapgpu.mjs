#!/usr/bin/env node
/**
 * The draining soap film on the GPU is the CPU reference's model (PLAN 32c).
 *
 *   npm run soapgpu                  (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *   npm run soapgpu -- --selftest    (the CPU reference in the GPU's contract: every bar can be met)
 *
 * `npm run soapfilm` holds the CPU reference (src/lib/soapFilm.ts) to the
 * physics of a vertical film: gravity sorts it, nothing is made or lost,
 * gravity is the only driver, the flow is a flow and the thickness moves with
 * it, and it drains from the top to Newton black. The plate cannot run that
 * reference: it is float64 JavaScript on a 32 × 64 film, and the plate's grid
 * is a GPU texture. PLAN 32c writes the same model as compute passes. This is
 * what those passes are held to, written before them, so the GPU is judged by
 * the model and not by whatever it draws.
 *
 * Two kinds of line, and both are needed:
 *
 *   The physics, asked of the GPU. soapfilm.mjs's C1–C4 and C6 scenarios, the
 *   same films, the same seeds, the same steps and the same bars, run through
 *   the GPU solver and read back. A GPU solver that sorts, conserves and drains
 *   passes these whatever scheme it uses.
 *
 *   The model, asked of the GPU. A film can sort and drain by a different
 *   scheme than the reference's, and then the reference's 23 lines say nothing
 *   about the plate: that is how a look-alike would pass. So the same films are
 *   stepped on the CPU reference here, in float64, and the GPU's face flows and
 *   thickness are held to it cell by cell over the first step and the first
 *   second, and its sort and drain to the reference's own distances and quarter
 *   means over the whole run.
 *
 * The tolerances, and why each is what it is (the GPU computes in float32, the
 * reference in float64, and the two solve the film's tension iteratively, so
 * neither is the exact solution; the CPU's Gauss–Seidel stops at a residual of
 * 5e-5 of the fastest unprojected speed):
 *
 *   - Cell by cell, one step: the face flows within 2% (RMS of the difference
 *     over RMS of the reference's flows), the thickness's change within 5%
 *     (over the RMS of the reference's change). The control (--selftest) reads
 *     zero to float32's rounding. Measured on the reference with one thing
 *     changed: an MC limiter reads 7.0% on the change, first-order upwind 14%,
 *     a projection stopped at 20 sweeps 18% on the flows and 138% on the
 *     change, Jacobi at 200 sweeps 2.8% on the flows; red-black SOR at 60
 *     sweeps, a plausible GPU solver, 0.4% and 2.8%.
 *   - Cell by cell, one second (20 steps): the thickness within 5% of the RMS
 *     of the reference's own change over that second, and the same over a second
 *     stepped at the frame's 1/60 s, and at zeta 0.25 and dt 0.2 s, where the
 *     reference takes several CFL sub-steps.
 *   - The sort and the reverse sort: each patch's travel within 1.5 rows of
 *     the reference's (a 64-row film; the patch is 8 rows across).
 *   - The drain: every quarter's mean thickness, every 5 s to 120 s, within 2%
 *     of the reference's, and the top quarter a tenth black within one sample
 *     (5 s) of when the reference's is. The reference goes black at 115 s, one
 *     sample inside soapfilm.mjs's 120 s, so the run goes on to 150 s: a
 *     solver a sample slower is then measured as a sample slower, and it is
 *     the "by 120 s" line, the reference's own bar, that says whether that is
 *     too slow.
 *   - A hole torn in the film: never refilled, and the black that spreads
 *     from it within 15% of the reference's count of black cells at 10 s.
 *   - Float32 storage moves two of soapfilm.mjs's float64 bars, and only those:
 *     the total thickness is conserved to 1e-6 (not 1e-9; a flux form in
 *     float32 rounds each cell to about 3e-5 nm of 800 a step, 1e-8 of the
 *     total over these 200 steps if the rounding is fair, 7e-6 if every
 *     rounding fell one way; a scheme that is not in flux form, the plate's
 *     semi-Lagrangian advection, loses or makes thickness at 1e-4 and more;
 *     float32 storage of the whole reference measured 7.7e-9), and a still film
 *     stays still to 1e-5 nm against the float32 film it was handed (not 1e-6
 *     against the float64 one: writing the film rounds it by up to 6e-5 nm at
 *     800, and with g = 0 or a uniform film the drive g (h - hbar) is exactly
 *     zero, so a faithful solver moves nothing at all from there).
 *
 * And the work has to be the GPU's: the solver's bundle may not carry the CPU
 * reference's code, every step() must submit to the GPU queue and every read()
 * map a buffer (counted in the page), or the control itself, which is the
 * reference run in the page, would pass as a GPU solver. (So the solver copies
 * the reference's constants, 30 nm, 8 nm, 0.5 s, zeta 1.5, under the same
 * names, rather than importing them from src/lib/soapFilm.ts.) That catches a
 * solver left on the CPU, not one disguised: a renamed copy of the reference
 * that submits an empty command buffer a step and maps a buffer it never
 * wrote passes all of it (measured), and only reading the solver says so.
 *
 * Every other bar is soapfilm.mjs's, unchanged. Each scenario prints that the
 * film moved, so two solvers that both stood still cannot pass by agreeing.
 * The pass's cost at the plate's grid (256 × 256) is printed, not judged:
 * SwiftShader's number says nothing about a Mac's, and 32c's PR reports Metal's.
 *
 * The GPU solver's contract is written in scripts/soapgpu-cpu.ts, the control.
 * Until src/gpu/soapFilm.ts exists this prints that and exits 1: the check is
 * committed first so the build has something to be held to, as soapfilm.mjs was.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const selftest = process.argv.includes('--selftest');
const modulePath = selftest ? 'scripts/soapgpu-cpu.ts' : (process.env.SOAPGPU_MODULE || 'src/gpu/soapFilm.ts');
if (!existsSync(modulePath)) {
  console.log(` FAIL ${modulePath} does not exist yet — PLAN 32c builds the GPU solver; this check is what it is built against (its contract: scripts/soapgpu-cpu.ts)`);
  console.log('\n0/1 checks passed');
  process.exit(1);
}
console.log(`  solver: ${modulePath}${selftest ? ' (the control: the CPU reference in the GPU\'s contract)' : ''}`);

// The CPU reference, in node, in float64.
const refOut = `node_modules/.cache/soapgpu-ref-${process.pid}.mjs`; // one per run: two runs at once must not import each other's half-written file
await build({
  stdin: { contents: "export * from './src/lib/soapFilm.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: refOut, logLevel: 'warning',
});
const { createSoapFilm, stepSoapFilm } = await import(`../${refOut}`);

// Whether the solver's own bundle carries the reference's code (a type or nothing imported from it is fine).
const meta = await build({ entryPoints: [modulePath], bundle: true, format: 'esm', write: false, metafile: true, logLevel: 'silent', outdir: 'node_modules/.cache/soapgpu-meta' });
const carriesReference = Object.values(meta.metafile.outputs).some((o) => (o.inputs['src/lib/soapFilm.ts']?.bytesInOutput ?? 0) > 0);

// The page: the solver's module and a device, nothing else of the plate's.
mkdirSync('node_modules/.cache', { recursive: true });
// One entry, and so one bundle, per solver module, so two runs at once never load each other's.
const entry = `node_modules/.cache/soapgpu-${modulePath.replace(/[^A-Za-z0-9]+/g, '-')}.ts`;
writeFileSync(entry, `import * as S from ${JSON.stringify(resolve(modulePath))};
(window as any).soapGpu = S;
// Count the GPU work the solver does, so a solver that steps on the CPU cannot pass as one that steps on the GPU.
const count = ((window as any).__gpuCount = { submit: 0, map: 0 });
const submit = GPUQueue.prototype.submit, mapAsync = GPUBuffer.prototype.mapAsync;
GPUQueue.prototype.submit = function (...a: any[]) { count.submit++; return (submit as any).apply(this, a); };
GPUBuffer.prototype.mapAsync = function (...a: any[]) { count.map++; return (mapAsync as any).apply(this, a); };
(window as any).labReady = true;
`);
const { page, close } = await openLab({ entry });

let exitCode = 1;
try {
  const has = await page.evaluate(() => typeof window.soapGpu.createSoapFilmGpu === 'function');
  if (!has) {
    check(`${modulePath} exports createSoapFilmGpu(device, { nx, ny, dx })`, false, 'the contract is in scripts/soapgpu-cpu.ts');
    throw new Error('no solver');
  }
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    if (!a) throw new Error('no adapter');
    window.__dev = await a.requestDevice();
    window.__errors = [];
    window.__work = { steps: 0, idleSteps: 0, reads: 0, idleReads: 0 };
    window.__dev.addEventListener('uncapturederror', (e) => window.__errors.push(e.error.message.slice(0, 300)));
    return `${a.info.vendor} ${a.info.architecture}`.trim();
  });
  console.log(`  adapter: ${adapter || 'unnamed'}`);

  /*
    One film, stepped `steps` times at dt with the step options, in the page.
    Read back after each step named in `reads` (thickness, and the face flows
    when `flows`), and every `watch` steps for the rupture marks: a cell that
    has been under 30 nm and is over it again is counted as refilled.
  */
  const gpu = (s) => page.evaluate(async (s) => {
    const film = window.soapGpu.createSoapFilmGpu(window.__dev, { nx: s.nx, ny: s.ny, dx: 1e-3 });
    film.write(new Float32Array(s.h));
    const reads = {}, c = window.__gpuCount;
    let refilled = 0, steps = 0, readsDone = 0, idleSteps = 0, idleReads = 0;
    // The film it was handed is the first word on which cells are black: a hole refilled in the first step counts.
    const black = Uint8Array.from(s.h, (v) => (v < 30 ? 1 : 0));
    for (let k = 1; k <= s.steps; k++) {
      const n0 = c.submit;
      await film.step(s.dt, s.opts);
      steps++; if (c.submit === n0) idleSteps++;
      const keep = s.reads.includes(k), watch = s.watch && k % s.watch === 0;
      if (!keep && !watch) continue;
      const m0 = c.map;
      const r = await film.read();
      readsDone++; if (c.map === m0) idleReads++;
      if (watch) {
        for (let i = 0; i < r.h.length; i++) { if (r.h[i] < 30) black[i] = 1; else if (black[i]) refilled++; }
      }
      if (keep) reads[k] = { h: Array.from(r.h), uf: s.flows ? Array.from(r.uf) : null, vf: s.flows ? Array.from(r.vf) : null };
    }
    film.destroy?.();
    window.__work.steps += steps; window.__work.idleSteps += idleSteps; window.__work.reads += readsDone; window.__work.idleReads += idleReads;
    return { reads, refilled };
  }, s);
  // The same on the CPU reference, in float64.
  const cpu = (s) => {
    const f = createSoapFilm({ nx: s.nx, ny: s.ny, noise: 0 });
    f.h.set(s.h);
    for (let i = 0; i < f.h.length; i++) f.ruptured[i] = f.h[i] < 30 ? 1 : 0;
    const reads = {};
    for (let k = 1; k <= s.steps; k++) {
      stepSoapFilm(f, s.dt, s.opts);
      if (s.reads.includes(k)) reads[k] = { h: Array.from(f.h), uf: Array.from(f.uf), vf: Array.from(f.vf) };
    }
    return { reads };
  };
  const scenario = (o) => ({ dt: 0.05, opts: {}, reads: [], flows: false, watch: 0, ...o });

  // The 32a films, made as soapfilm.mjs makes them.
  const film = (o) => createSoapFilm({ nx: 32, ny: 64, ...o });
  const patch = (f, cx, cy, r, v) => {
    for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) if (Math.hypot(i - cx, j - cy) < r) f.h[j * f.nx + i] = v;
  };
  const centroid = (h, nx, ny, left, thick) => {
    let m = 0, y = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if ((i < nx / 2) !== left) continue;
      const v = h[j * nx + i], w = thick ? Math.max(0, v - 900) : Math.max(0, 700 - v);
      m += w; y += w * j;
    }
    return m ? y / m : NaN;
  };
  const rms = (a, b = null) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - (b ? b[i] : 0)) ** 2; return Math.sqrt(s / a.length); };
  const diff = (a, b) => a.map((x, i) => x - b[i]);
  const ROWS = 1.5;
  const errors = async () => page.evaluate(() => window.__errors.splice(0));

  // ── The model, step for step: a noisy film, one step and twenty ──────
  {
    const f = film({ noise: 0.3, seed: 9 });
    const h0 = Array.from(f.h);
    const s = scenario({ nx: 32, ny: 64, h: h0, steps: 20, reads: [1, 20], flows: true });
    const [G, C] = [await gpu(s), cpu(s)];
    const g1 = G.reads[1], c1 = C.reads[1];
    const flowRef = rms([...c1.uf, ...c1.vf]);
    const flowErr = rms([...g1.uf, ...g1.vf], [...c1.uf, ...c1.vf]) / flowRef;
    check('the first step\'s face flows are the reference\'s (within 2%)', flowRef > 0 && flowErr <= 0.02,
      `RMS difference ${(100 * flowErr).toFixed(3)}% of the reference's ${flowRef.toExponential(2)} m/s`);
    const dC = diff(c1.h, h0), stepRef = rms(dC), stepErr = rms(diff(g1.h, h0), dC) / stepRef;
    check('the first step\'s change in thickness is the reference\'s (within 5%)', stepRef > 0 && stepErr <= 0.05,
      `RMS difference ${(100 * stepErr).toFixed(3)}% of the reference's change, ${stepRef.toExponential(2)} nm`);
    const secRef = rms(diff(C.reads[20].h, h0)), secErr = rms(G.reads[20].h, C.reads[20].h) / secRef;
    check('after a second (20 steps) the thickness is the reference\'s (within 5% of its change)', secRef > 0 && secErr <= 0.05,
      `RMS difference ${(100 * secErr).toFixed(3)}% of the reference's change, ${secRef.toFixed(2)} nm`);

    // C4's interval: soapfilm.mjs's film (noise 0.3, seed 9), its one step, its margin, on the GPU's own flows.
    const { uf, vf } = g1, nx = 32, ny = 64, dx = 1e-3, dtc = 0.05, h1 = g1.h;
    let wall = 0;
    for (let j = 0; j < ny; j++) wall = Math.max(wall, Math.abs(uf[j * (nx + 1)]), Math.abs(uf[j * (nx + 1) + nx]));
    for (let i = 0; i < nx; i++) wall = Math.max(wall, Math.abs(vf[i]), Math.abs(vf[ny * nx + i]));
    const iv = (u, a, b) => (u >= 0 ? [u * Math.min(a, b), u * Math.max(a, b)] : [u * Math.max(a, b), u * Math.min(a, b)]);
    const margin = 0.05 * rms(diff(h1, h0));
    let outside = 0, moved = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i; let lo = 0, hi = 0;
      const add = (sign, u, a, b) => { const [l, h] = iv(u, a, b); if (sign > 0) { lo += l; hi += h; } else { lo -= h; hi -= l; } };
      if (i < nx - 1) add(1, uf[j * (nx + 1) + i + 1], h0[c], h0[c + 1]);
      if (i > 0) add(-1, uf[j * (nx + 1) + i], h0[c], h0[c - 1]);
      if (j < ny - 1) add(1, vf[(j + 1) * nx + i], h0[c], h0[c + nx]);
      if (j > 0) add(-1, vf[j * nx + i], h0[c], h0[c - nx]);
      const a = -dtc * hi / dx, b = -dtc * lo / dx, got = h1[c] - h0[c];
      moved += Math.abs(got) > margin ? 1 : 0;
      if (got < a - margin || got > b + margin) outside++;
    }
    const frac = outside / (nx * ny);
    check('C4 the thickness moves with the flow it reports (-dt div(h u), walls shut)', moved > 0.05 * nx * ny && frac < 0.01 && wall === 0,
      `${(100 * frac).toFixed(2)}% of cells changed by more than the faces allow (under 1%), ${moved} cells moved, flow through the walls ${wall.toExponential(1)}`);
  }

  /*
    The step's own inputs. Every 32a scenario steps 0.05 s at the default drag
    (zeta 1.5) and never needs the reference's CFL sub-steps (the fastest
    face moves a third of 0.45 of a cell a step), so a solver that ignored dt,
    zeta or the sub-steps passed every line above: measured, a reference that
    always steps 0.05 s and one with no sub-steps each read 25 of 25. The
    plate steps the film by the frame (1/60 s), and 32d's time compression is
    zeta (shortcut b). So the noisy film again, held to the reference cell by
    cell over one second (the same 5%-of-its-change bar): at the frame's dt,
    and at a sixth of the drag and four times the dt, where the reference
    itself takes several sub-steps (printed, and asked: if it took one, this
    line would not be asking about them).
  */
  {
    const f = film({ noise: 0.3, seed: 9 }), h0 = Array.from(f.h), nx = 32, ny = 64;
    const frame = scenario({ nx, ny, h: h0, dt: 1 / 60, steps: 60, reads: [60] });
    const [G, C] = [await gpu(frame), cpu(frame)];
    const ref = rms(diff(C.reads[60].h, h0)), err = rms(G.reads[60].h, C.reads[60].h) / ref;
    check('at the frame\'s dt (1/60 s, 60 steps) the thickness is the reference\'s (within 5% of its change)', ref > 0 && err <= 0.05,
      `RMS difference ${(100 * err).toFixed(3)}% of the reference's change, ${ref.toFixed(2)} nm`);
    const fast = scenario({ nx, ny, h: h0, dt: 0.2, steps: 5, reads: [1, 5], flows: true, opts: { zeta: 0.25 } });
    const [Gz, Cz] = [await gpu(fast), cpu(fast)];
    let uMax = 0; for (const x of [...Cz.reads[1].uf, ...Cz.reads[1].vf]) uMax = Math.max(uMax, Math.abs(x));
    const subs = Math.max(1, Math.ceil((uMax * 0.2) / (0.45 * 1e-3)));
    const refz = rms(diff(Cz.reads[5].h, h0)), errz = rms(Gz.reads[5].h, Cz.reads[5].h) / refz;
    check('at a sixth of the drag (zeta 0.25) and dt 0.2 s, where the reference sub-steps, the thickness is the reference\'s (within 5% of its change)', subs > 1 && refz > 0 && errz <= 0.05,
      `RMS difference ${(100 * errz).toFixed(3)}% of the reference's change, ${refz.toFixed(2)} nm; the reference's first step takes ${subs} sub-steps (wanted more than 1)`);
  }

  // ── C1 / C4: the sort ────────────────────────────────────────────────
  {
    const f = film({ noise: 0 });
    patch(f, 10, 32, 4, 1600); patch(f, 22, 32, 4, 400);
    const h0 = Array.from(f.h), nx = 32, ny = 64;
    const s = scenario({ nx, ny, h: h0, steps: 600, reads: [100, 300, 600], flows: true });
    const [G, C] = [await gpu(s), cpu(s)];
    const y0 = [centroid(h0, nx, ny, true, true), centroid(h0, nx, ny, false, false)];
    const travel = (R) => [centroid(R.reads[600].h, nx, ny, true, true) - y0[0], y0[1] - centroid(R.reads[600].h, nx, ny, false, false)];
    const [tg, tc] = [travel(G), travel(C)];
    check('C1 the thick patch sinks', tg[0] >= ny / 4, `down ${tg[0].toFixed(1)} rows, wanted ${ny / 4}`);
    check('C1 the thin patch rises', tg[1] >= ny / 4, `up ${tg[1].toFixed(1)} rows, wanted ${ny / 4}`);
    check(`C1 each patch travels as far as the reference's (within ${ROWS} rows)`, Math.abs(tg[0] - tc[0]) <= ROWS && Math.abs(tg[1] - tc[1]) <= ROWS,
      `thick ${tg[0].toFixed(2)} against ${tc[0].toFixed(2)}, thin ${tg[1].toFixed(2)} against ${tc[1].toFixed(2)}`);
    // The patch at 5 s: its peak near its own centroid, and its own excess over 900 nm in its half.
    const peak0 = Math.max(...h0);
    const at5 = (h) => {
      const c = Math.round(centroid(h, nx, ny, true, true)); let p = 0, m = 0;
      for (let j = Math.max(0, c - 6); j <= Math.min(ny - 1, c + 6); j++) for (let i = 0; i < nx / 2; i++) p = Math.max(p, h[j * nx + i]);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) m += Math.max(0, h[j * nx + i] - 900);
      return { peak: (p - 800) / (peak0 - 800), mass: m };
    };
    let ex0 = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) ex0 += Math.max(0, h0[j * nx + i] - 900);
    const [pg, pc] = [at5(G.reads[100].h), at5(C.reads[100].h)];
    check('C4 the sinking patch keeps its thickness at 5 s (a flow, not a blur)', pg.peak >= 0.45,
      `${(100 * pg.peak).toFixed(0)}% of its excess, wanted at least 45% (the reference keeps ${(100 * pc.peak).toFixed(0)}%)`);
    check('C4 it is the patch that moved: its excess mass is kept at 5 s', pg.mass >= 0.3 * ex0 && pg.mass <= 1.7 * ex0,
      `${(pg.mass / ex0).toFixed(2)} of its starting excess, wanted 0.3 to 1.7`);
    const { uf, vf } = G.reads[300];
    let divMax = 0, uMax = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = (uf[j * (nx + 1) + i + 1] - uf[j * (nx + 1) + i] + vf[(j + 1) * nx + i] - vf[j * nx + i]) / 1e-3;
      divMax = Math.max(divMax, Math.abs(d));
    }
    for (const x of uf) uMax = Math.max(uMax, Math.abs(x));
    for (const x of vf) uMax = Math.max(uMax, Math.abs(x));
    const bar = 1e-3 * uMax / 1e-3;
    check('C4 the flow is divergence-free', uMax > 0 && divMax <= bar, `max |div u| ${divMax.toExponential(1)} /s against ${bar.toExponential(1)} (speed max ${uMax.toExponential(1)} m/s)`);
  }

  // ── C2: nothing made or lost ─────────────────────────────────────────
  {
    const f = film({ noise: 0.3, seed: 3 });
    const h0 = Array.from(f.h);
    const G = await gpu(scenario({ nx: 32, ny: 64, h: h0, steps: 200, reads: [200] }));
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const drift = Math.abs(sum(G.reads[200].h) / sum(h0) - 1), moved = rms(G.reads[200].h, h0);
    check('C2 total thickness is conserved with no evaporation (to 1e-6, float32)', moved > 1 && drift < 1e-6, `drift ${drift.toExponential(1)}, the film moved ${moved.toFixed(1)} nm RMS`);
    const U = await gpu(scenario({ nx: 32, ny: 64, h: new Array(32 * 64).fill(800), steps: 100, reads: [100] }));
    const worst = Math.max(...U.reads[100].h.map((v) => Math.abs(v - 800)));
    check('C2 a uniform film stays uniform (to 1e-5 nm)', worst < 1e-5, `largest change ${worst.toExponential(1)} nm`);
  }

  // ── C3: gravity is the only driver ───────────────────────────────────
  {
    const nx = 32, ny = 64;
    const a = film({ noise: 0.3, seed: 5 }), ha = Array.from(a.h);
    const A = await gpu(scenario({ nx, ny, h: ha, steps: 200, reads: [200], opts: { g: 0 } }));
    const worst = Math.max(...A.reads[200].h.map((v, i) => Math.abs(v - Math.fround(ha[i]))));
    check('C3 with g = 0 the film does not move (to 1e-5 nm of the float32 film it was handed)', worst < 1e-5, `largest change ${worst.toExponential(1)} nm`);

    const b = film({ noise: 0 }); patch(b, 10, 32, 4, 1600);
    const hb = Array.from(b.h), y0 = centroid(hb, nx, ny, true, true);
    const run = async (steps, g) => {
      const s = scenario({ nx, ny, h: hb, steps, reads: [steps], opts: { g } });
      const [G, C] = [await gpu(s), cpu(s)];
      return [centroid(G.reads[steps].h, nx, ny, true, true) - y0, centroid(C.reads[steps].h, nx, ny, true, true) - y0];
    };
    const [rev, half, full] = [await run(300, -9.81), await run(50, 4.905), await run(50, 9.81)];
    const ratio = half[0] / full[0];
    check('C3 half the gravity sorts about half as fast (g is the driver, not its sign)', ratio > 0.35 && ratio < 0.7,
      `${ratio.toFixed(2)} of the full-gravity distance in 2.5 s, wanted 0.35 to 0.7 (the reference: ${(half[1] / full[1]).toFixed(2)})`);
    check('C3 with gravity reversed the thick patch rises', rev[0] <= -ny / 8, `moved ${rev[0].toFixed(1)} rows (negative is up), wanted at most ${-ny / 8}`);
    const off = Math.max(...[rev, half, full].map(([g, c]) => Math.abs(g - c)));
    check(`C3 reversed, half and full gravity each move the patch as far as the reference's (within ${ROWS} rows)`, off <= ROWS,
      `reversed ${rev[0].toFixed(2)} against ${rev[1].toFixed(2)}, half ${half[0].toFixed(2)} against ${half[1].toFixed(2)}, full ${full[0].toFixed(2)} against ${full[1].toFixed(2)}`);
  }

  // ── C6: it drains the way a real one does, and the reference's way ───
  {
    const f = film({ nx: 48, ny: 96, noise: 0, h0: 800 });
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let b = 0; b < 60; b++) {
      const cx = rnd() * f.nx, cy = rnd() * f.ny, r = 2 + rnd() * 5, a = (rnd() - 0.5) * 2 * 0.5 * 800;
      for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
        const d = Math.hypot(i - cx, j - cy) / r;
        if (d < 2) f.h[j * f.nx + i] += a * Math.exp(-d * d);
      }
    }
    for (let i = 0; i < f.h.length; i++) f.h[i] = Math.max(100, f.h[i]);
    const { nx, ny } = f, h0 = Array.from(f.h), dt = 0.05, every = Math.round(5 / dt), T = 150, T6 = 120;
    const samples = []; for (let k = every; k <= T / dt; k += every) samples.push(k);
    const sc = scenario({ nx, ny, h: h0, steps: T / dt, reads: samples, opts: { evap: 5 }, watch: 10 });
    const [G, C] = [await gpu(sc), cpu(sc)];
    const q = (h, k) => { // mean thickness and black fraction of quarter k
      const n = nx * (ny / 4); let m = 0, bk = 0;
      for (let j = k * (ny / 4); j < (k + 1) * (ny / 4); j++) for (let i = 0; i < nx; i++) { const v = h[j * nx + i]; m += v; if (v < 30) bk++; }
      return [m / n, bk / n];
    };
    const read = (R) => {
      let ordered = true, topFirst = true, orderedAt = '', topBlackAt = -1;
      const means = [];
      for (const k of [0, ...samples]) {
        const t = k * dt, h = k ? R.reads[k].h : h0, m = [0, 1, 2, 3].map((i) => q(h, i));
        if (t <= T6) means.push(m.map((x) => x[0]));
        if (t >= 30 && t <= T6 && !(m[0][0] < m[1][0] && m[1][0] < m[2][0] && m[2][0] < m[3][0])) { ordered = false; orderedAt = `t=${t}s means ${m.map((x) => x[0].toFixed(0)).join(' ')}`; }
        if (t <= T6 && m[3][1] > 0 && m[0][1] < 0.1) topFirst = false;
        if (topBlackAt < 0 && m[0][1] >= 0.1) topBlackAt = t;
      }
      return { ordered, topFirst, orderedAt, topBlackAt, means };
    };
    const [rg, rc] = [read(G), read(C)];
    check('C6 thin at the top, thick at the bottom, at every time after 30 s', rg.ordered, rg.ordered ? 'quarter means rise top to bottom' : rg.orderedAt);
    check('C6 the top reaches black first', rg.topFirst, rg.topFirst ? 'the bottom quarter had no black before the top was a tenth black' : 'black appeared at the bottom first');
    check('C6 the top does go black: a tenth of its cells under 30 nm by the end (120 s)', rg.topBlackAt >= 0 && rg.topBlackAt <= T6, rg.topBlackAt < 0 ? 'never' : `at ${rg.topBlackAt} s (the reference: ${rc.topBlackAt} s)`);
    check('C6 a ruptured cell stays black', G.refilled === 0, G.refilled ? `${G.refilled} reads of a cell over 30 nm after it was under` : 'none refilled past 30 nm (read every 0.5 s)');
    let worst = 0, where = '';
    rg.means.forEach((m, s) => m.forEach((v, k) => { const e0 = Math.abs(v / rc.means[s][k] - 1), e = Number.isFinite(e0) ? e0 : Infinity; if (e > worst) { worst = e; where = `quarter ${k + 1} at ${s * 5} s: ${v.toFixed(1)} against ${rc.means[s][k].toFixed(1)} nm`; } }));
    const moved = Math.abs(rc.means.at(-1)[3] - rc.means.at(-1)[0]);
    check('C6 every quarter drains as the reference\'s does (means within 2%, every 5 s to 120 s)', moved > 100 && worst <= 0.02, `worst ${(100 * worst).toFixed(2)}%, ${where}`);
    check('C6 and the top goes black when the reference\'s does (within 5 s)', rg.topBlackAt >= 0 && Math.abs(rg.topBlackAt - rc.topBlackAt) <= 5,
      `${rg.topBlackAt} s against ${rc.topBlackAt} s`);
  }

  /*
    The drain above never puts thick film against black film hard enough to
    refill it: the reference made to let thickness flow into a ruptured cell
    read "none refilled" there too, measured. So the rupture marks are asked
    for where they matter: a black hole (10 nm, four cells across) torn in the
    middle of a noisy film, evaporating, for 10 s, read every step. The thick
    film flowing at it must stop at its edge (shortcut d: black film is pinned
    at 8 nm, it does not refill), and with the inflow stopped the film
    downstream of it thins to black too, so the reference's black grows from
    45 cells to 160. A solver without the marks refills the hole in a few
    steps (no black left at 10 s, measured on the reference without them).
  */
  {
    const nx = 32, ny = 64, f = film({ noise: 0.3, seed: 11 });
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (Math.hypot(i - 16, j - 32) < 4) f.h[j * nx + i] = 10;
    const h0 = Array.from(f.h), sc = scenario({ nx, ny, h: h0, steps: 200, reads: [200], opts: { evap: 5 }, watch: 1 });
    const [G, C] = [await gpu(sc), cpu(sc)];
    const blackOf = (h) => h.filter((v) => v < 30).length, [bg, bc] = [blackOf(G.reads[200].h), blackOf(C.reads[200].h)];
    check('C6 a hole torn in the film is not refilled', G.refilled === 0, G.refilled ? `${G.refilled} reads of a cell over 30 nm after it was under` : 'none refilled past 30 nm (read every step)');
    check('C6 and the black spreads from it as the reference\'s does (within 15%)', bc > blackOf(h0) && Math.abs(bg / bc - 1) <= 0.15,
      `${bg} black cells at 10 s against the reference's ${bc} (${blackOf(h0)} at the start)`);
  }

  /*
    PLAN 32f and 32g: the frame's Plateau border and the black spots, held to
    the reference (soapfilm.mjs C8 and C9 hold the reference to the laws).
    The border: the noisy film with a 1 mm bottom border and no evaporation
    for 3 s, cell by cell (the same 5%-of-its-change bar) and the volume it
    loses (within 2%: a solver with no border loses none).
    The spots: a 40 nm patch in a still 300 nm film for 5 s, where the
    reference blackens the patch from its thinnest cell out and pushes the
    liquid into a rim; the GPU must blacken as many cells (within 10%), keep
    the liquid (float32: 1e-5), and do it on Vrij's clock, a uniform 40 nm
    film going black on the same step as the reference's.
  */
  {
    const nx = 32, ny = 64, f = film({ noise: 0.3, seed: 9 }), h0 = Array.from(f.h);
    const s = scenario({ nx, ny, h: h0, steps: 60, reads: [60], opts: { border: 1e-3 } });
    const [G, C] = [await gpu(s), cpu(s)];
    const ref = rms(diff(C.reads[60].h, h0)), err = rms(G.reads[60].h, C.reads[60].h) / ref;
    const total = (h) => h.reduce((a, x) => a + x, 0), lostC = total(h0) - total(C.reads[60].h), lostG = total(h0) - total(G.reads[60].h);
    check('32f with a Plateau border the film drains as the reference\'s does (cell by cell within 5% of its change, the volume lost within 2%)',
      ref > 0 && err <= 0.05 && lostC > 0 && Math.abs(lostG / lostC - 1) <= 0.02,
      `RMS difference ${(100 * err).toFixed(3)}% of the reference's change; lost ${(100 * lostG / total(h0)).toFixed(3)}% against the reference's ${(100 * lostC / total(h0)).toFixed(3)}%`);

    const sp = createSoapFilm({ nx: 32, ny: 32, noise: 0, h0: 300 });
    patch(sp, 16, 16, 3, 40);
    const p0 = Array.from(sp.h), ss = scenario({ nx: 32, ny: 32, h: p0, steps: 100, reads: [100], opts: { g: 0 } });
    const [Gs, Cs] = [await gpu(ss), cpu(ss)];
    const blk = (h) => h.filter((v) => v <= 8.01).length, [bg, bc] = [blk(Gs.reads[100].h), blk(Cs.reads[100].h)];
    const drift = Math.abs(total(Gs.reads[100].h) - total(p0)) / total(p0);
    // Cell by cell too: a shader that blackened as many cells but spread the liquid over the film would match the count.
    const spRef = rms(diff(Cs.reads[100].h, p0)), spErr = rms(Gs.reads[100].h, Cs.reads[100].h) / spRef;
    check('32g a thin patch goes black as the reference\'s does (black cells within 10%, cell by cell within 1% of its change) and keeps its liquid (1e-5)',
      bc > 0 && Math.abs(bg / bc - 1) <= 0.1 && spRef > 0 && spErr <= 0.01 && drift < 1e-5,
      `${bg} black cells against the reference's ${bc}; RMS difference ${(100 * spErr).toFixed(3)}% of the reference's change; total drift ${drift.toExponential(1)}`);

    const u = Array(64).fill(40), su = scenario({ nx: 8, ny: 8, h: u, dt: 0.01, steps: 200, reads: Array.from({ length: 200 }, (_, k) => k + 1), opts: { g: 0 } });
    const [Gu, Cu] = [await gpu(su), cpu(su)];
    const first = (R) => { for (let k = 1; k <= 200; k++) if (R.reads[k].h.some((v) => v <= 8.01)) return k; return Infinity; };
    const [kg, kc] = [first(Gu), first(Cu)];
    check('32g Vrij\'s clock: a uniform 40 nm film goes black on the reference\'s step (within one)', Number.isFinite(kc) && Math.abs(kg - kc) <= 1,
      `step ${kg} against the reference's ${kc} (dt 0.01 s)`);
  }

  const work = await page.evaluate(() => window.__work);
  check('the work is the GPU\'s: every step submits to the GPU and every read maps a buffer', selftest || (work.steps > 0 && work.idleSteps === 0 && work.idleReads === 0),
    selftest ? 'not asked of the control, which is the CPU reference by design' : `${work.idleSteps} of ${work.steps} steps submitted nothing, ${work.idleReads} of ${work.reads} reads mapped nothing`);
  check('and the solver does not carry the CPU reference', selftest || !carriesReference, selftest ? 'the control is the reference' : carriesReference ? `${modulePath}'s bundle includes src/lib/soapFilm.ts's code` : 'src/lib/soapFilm.ts is not in its bundle');
  const errs = await errors();
  check('no WebGPU errors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'none raised');

  // The pass's cost at the plate's grid: printed, not judged.
  const ms = await page.evaluate(async () => {
    const n = 256, film = window.soapGpu.createSoapFilmGpu(window.__dev, { nx: n, ny: n, dx: 1e-3 });
    const h = new Float32Array(n * n);
    for (let i = 0; i < h.length; i++) h[i] = 800 + 200 * Math.sin(i * 0.37) * Math.cos(i * 0.011);
    film.write(h);
    for (let k = 0; k < 3; k++) await film.step(1 / 60, {});
    await window.__dev.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) await film.step(1 / 60, {});
    await film.read();
    const t = (performance.now() - t0) / 10;
    film.destroy?.();
    return t;
  });
  console.log(`  cost: ${ms.toFixed(2)} ms a step at 256 × 256 on ${adapter || 'this adapter'} (printed, not judged)`);
} catch (e) {
  if (e.message !== 'no solver') { console.log(` FAIL ${e.message}`); checks.push({ ok: false }); }
} finally {
  await close();
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  exitCode = failed.length || !checks.length ? 1 : 0;
}
process.exit(exitCode);
