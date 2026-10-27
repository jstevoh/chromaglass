#!/usr/bin/env node
/**
 * The dish that boils, on the GPU, is the CPU reference's model (PLAN 36e-2).
 *
 *   npm run boilgpu                  (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *   npm run boilgpu -- --selftest    (the CPU reference in the GPU's contract: every bar can be met)
 *
 * `npm run boil` holds the CPU reference (src/lib/lampBoil.ts, PLAN 36e-1) to
 * the physics of a lamp heating a thin dish: the lamp in two bands, the air and
 * the glass's radiation cooling it, heat spreading through water and glass, warm
 * water rising by its real density only on an upright plate, every drop of
 * volume and every joule accounted, and boiling that needs its site's superheat,
 * holds the dish near 100 °C while a hand blocks the air and calms when it lifts.
 * The plate cannot run that reference: it is float64 JavaScript on a 48² dish,
 * with a conjugate-gradient solve a step, and the plate's grid is a GPU texture.
 * PLAN 36e-2 writes the same model as compute passes. This is what those passes
 * are held to, written before them, so the GPU is judged by the model and not by
 * whatever it draws. It was written the way `npm run soapgpu` was before 32c.
 *
 * Two kinds of line, and both are needed:
 *
 *   The physics, asked of the GPU. boil.mjs's dishes (scripts/boilgpu-scenes.ts:
 *   the same options, seeds, steps, holds and bars) stepped by the GPU solver and
 *   read back, every expected number worked out here from the textbook again
 *   (Kell, Vogel, the equilibrium nucleus, the exact Darcy inclusion, a radial
 *   heat balance, Newton's and Stefan–Boltzmann's cooling, a heat ledger). A
 *   solver that heats, cools, rises, accounts and boils as the physics says
 *   passes these whatever scheme it uses.
 *
 *   The model, asked of the GPU. A dish can warm and boil by another scheme than
 *   the reference's and pass the physics lines, and then the reference says
 *   nothing about the plate: that is how a look-alike would pass. So the same
 *   dishes are stepped on the CPU reference here, in node and in float64, and
 *   the GPU's fields are held to it cell by cell: the lamp's first step and
 *   first second, a warm patch's first second upright, a steam pocket's second,
 *   a boiling second under the hand (with no sites, so it is the rims', the
 *   latent heat's, the vapour's volume and the flow's second, not which cell
 *   crossed its threshold in which rounding), and the whole dish after five
 *   minutes of lamp; and the boil's course to the reference's: when it starts,
 *   where, its peak and its size when the hand lifts.
 *
 * The bars, and why each is what it is. The GPU stores its fields in float32 and
 * computes in it; the reference is float64. boil.mjs's bars that only float64 can
 * read are moved, each to what float32 storage can read and no further:
 *
 *   - H1 and H2 take one step of 10 ms, not 1 µs: a microsecond warms the dish by
 *     1.5e-6 K, under a float32's spacing at 20 °C (1.9e-6), so a float32 dish
 *     cannot show it at all. At 10 ms the lamp's warming is 0.015 K; what the air,
 *     the radiation, the sideways conduction and the expansion's carry change in
 *     one step is about 1e-4 of it, and float32's rounding of 20 °C 6e-5, so the
 *     bars are 1e-3 of the hottest cell's warming and of the half dial's
 *     (boil.mjs: 1e-6). The dark dye's ratio is 1e-2 (boil.mjs: 1e-6): its patch
 *     sits where the lamp is a fifteenth of its centre and warms 0.7 mK in the
 *     step, which a float32 at 20 °C holds to 1.3e-3 of itself, twice over in a
 *     ratio (the control read 2.4e-3); a dye ignored is 41% off, a dye that takes
 *     the infrared too several times. The dial at 0 must leave the dish within
 *     1e-4 K of the room (a float32 kelvin's spacing at 300 K is 3e-5) and every
 *     face at exactly zero.
 *   - H8's rim is read on a dish 10 K over and under 100 °C, not 3 K, its heat
 *     over one step of 1 ms and its steam over one of 10 µs. At boil.mjs's 10 µs
 *     the rim moves the temperature 2.6e-5 K, three float32 spacings at 103 °C;
 *     at 1 ms and 10 K the move is 8.7e-3 K, the spacing's rounding 4e-4 of it,
 *     and how a solver takes the rim within the step (the reference implicitly, a
 *     factor 1/(1 + h·G/C), 0.9e-3 here) moves it less than 1e-3, so that bar is
 *     3e-3. The steam keeps boil.mjs's 10 µs and its 1e-3: over 1 ms the cell
 *     makes 15% of its own steam, and whether the carry that pushes it out reads
 *     the steam before the step's or after moves the answer by 6% (the control,
 *     measured), an order of the step's operations and not the physics.
 *   - H8's sites: no site without vapour more than 1e-4 K over its superheat
 *     (boil.mjs: 1e-9; a float32's spacing at 105 °C is 7.6e-6).
 *   - H5's volume: every cell's face flows add up to the source its step asked
 *     for within 1e-3 of the largest source (boil.mjs: 1e-6, the reference's
 *     conjugate gradients to 1e-10). A float32 pressure solve stops well short of
 *     1e-6 (as soapgpu's divergence-free line found), and 1e-3 still reads a solve
 *     that drops a source (an error of 1) or stops early.
 *   - Everything else is boil.mjs's bar, unchanged.
 *
 *   The model's bars, cell by cell, are RMS differences over the RMS of the
 *   reference's own change: 1% on the lamp's first step and second, 2% on its
 *   flows, 2% on the warm patch's second, 5% on the steam pocket's and the
 *   boiling second's (a steep front of vapour, advected with a limiter, where a
 *   float32 sum can move a face's choice of slope), and 0.5% of the rise on the
 *   five-minute dish. The course: the first bubble within 1 s of the reference's
 *   (about 28 s after the hand), in the same cell or the next, and the peak
 *   vapour and the vapour when the hand lifts within 10% of the reference's. The
 *   control (--selftest) reads each well inside its bar; the margin is for the
 *   float32 arithmetic it does not do, and the Mac's first run says how much that
 *   took.
 *
 * And the work has to be the GPU's: the solver's bundle may not carry the CPU
 * reference's code, every step() must submit to the GPU queue and every read()
 * map a buffer (counted in the page), or the control itself, which is the
 * reference run in the page, would pass as a GPU solver. (So the solver copies
 * the reference's constants under the same names rather than importing them
 * from src/lib/lampBoil.ts.) That catches a solver left on the CPU, not one
 * disguised; only reading the solver says that.
 *
 * The pass's cost at the plate's grid (768 × 768) is printed, not judged:
 * SwiftShader's number says nothing about a Mac's, and 36e-2's PR reports
 * Metal's.
 *
 * The GPU solver's contract is written in scripts/boilgpu-cpu.ts, the control.
 * Until src/gpu/lampBoil.ts exists this prints that and exits 1: the check is
 * committed first so the build has something to be held to, as boil.mjs was.
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
const modulePath = selftest ? 'scripts/boilgpu-cpu.ts' : (process.env.BOILGPU_MODULE || 'src/gpu/lampBoil.ts');
if (!existsSync(modulePath)) {
  console.log(` FAIL ${modulePath} does not exist yet — PLAN 36e-2 builds the GPU dish that boils; this check is what it is built against (its contract: scripts/boilgpu-cpu.ts)`);
  console.log('\n0/1 checks passed');
  process.exit(1);
}
console.log(`  solver: ${modulePath}${selftest ? ' (the control: the CPU reference in the GPU\'s contract)' : ''}`);

// The CPU reference in the same contract, and the same dishes, in node, in float64.
mkdirSync('node_modules/.cache', { recursive: true });
const refOut = `node_modules/.cache/boilgpu-ref-${process.pid}.mjs`; // one per run: two runs at once must not import each other's half-written file
await build({
  stdin: { contents: "export { createBoilPlateReference, createBoilPlate } from './scripts/boilgpu-cpu.ts';\nexport * from './scripts/boilgpu-scenes.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: refOut, logLevel: 'warning',
});
const R = await import(`../${refOut}`);
const { scenes, DISH, H1_DISH, HAND, LAMP_DT, NO_SITE } = R;
const cpu = (name, arg) => scenes[name]((o) => R.createBoilPlateReference(o), arg);

// Whether the solver's own bundle carries the reference's code (a type or nothing imported from it is fine).
const meta = await build({ entryPoints: [modulePath], bundle: true, format: 'esm', write: false, metafile: true, logLevel: 'silent', outdir: 'node_modules/.cache/boilgpu-meta' });
const carriesReference = Object.values(meta.metafile.outputs).some((o) => (o.inputs['src/lib/lampBoil.ts']?.bytesInOutput ?? 0) > 0);

// The page: the solver's module, the dishes and a device, nothing else of the plate's.
// One entry, and so one bundle, per solver module, so two runs at once never load each other's.
const entry = `node_modules/.cache/boilgpu-${modulePath.replace(/[^A-Za-z0-9]+/g, '-')}.ts`;
writeFileSync(entry, `import * as S from ${JSON.stringify(resolve(modulePath))};
import { scenes, DISH } from ${JSON.stringify(resolve('scripts/boilgpu-scenes.ts'))};
const w = window as any;
// Count the GPU work the solver does, so a solver that steps on the CPU cannot pass as one that steps on the GPU.
const count = (w.__gpuCount = { submit: 0, map: 0 });
const submit = GPUQueue.prototype.submit, mapAsync = GPUBuffer.prototype.mapAsync;
GPUQueue.prototype.submit = function (...a: any[]) { count.submit++; return (submit as any).apply(this, a); };
GPUBuffer.prototype.mapAsync = function (...a: any[]) { count.map++; return (mapAsync as any).apply(this, a); };
w.__work = { steps: 0, idleSteps: 0, reads: 0, idleReads: 0 };
const make = async (o: any) => {
  const p: any = await (S as any).createBoilPlateGpu(w.__dev, o);
  const step = p.step.bind(p), read = p.read.bind(p);
  p.step = async (dt: number, c: any) => { const n0 = count.submit; await step(dt, c); w.__work.steps++; if (count.submit === n0) w.__work.idleSteps++; };
  p.read = async () => { const m0 = count.map; const r = await read(); w.__work.reads++; if (count.map === m0) w.__work.idleReads++; return r; };
  return p;
};
w.hasSolver = typeof (S as any).createBoilPlateGpu === 'function';
w.runScene = (name: string, arg: any) => (scenes as any)[name](make, arg);
w.makePlate = make;
w.boilDish = DISH;
w.labReady = true;
`);
const { page, close } = await openLab({ entry });

let exitCode = 1;
try {
  if (!(await page.evaluate(() => window.hasSolver))) {
    check(`${modulePath} exports createBoilPlateGpu(device, options)`, false, 'the contract is in scripts/boilgpu-cpu.ts');
    throw new Error('no solver');
  }
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    if (!a) throw new Error('no adapter');
    window.__dev = await a.requestDevice();
    window.__errors = [];
    window.__dev.addEventListener('uncapturederror', (e) => window.__errors.push(e.error.message.slice(0, 300)));
    return `${a.info.vendor} ${a.info.architecture}`.trim();
  });
  console.log(`  adapter: ${adapter || 'unnamed'}`);
  const gpu = (name, arg) => page.evaluate(([n, a]) => window.runScene(n, a), [name, arg]);
  // The page and node at once: the reference's float64 dishes run here while the page steps its own.
  const both = async (name, arg) => { const g = gpu(name, arg); const c = await cpu(name, arg); return [await g, c]; };

  // The textbook, typed again (boil.mjs's).
  const kell = (t) => (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t - 46.170461e-6 * t ** 3
    + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.879850e-3 * t);
  const vogel = (t) => 2.414e-5 * 10 ** (247.8 / (t + 273.15 - 140));
  const hsu = (r) => (2 * 0.0589 * 373.15) / (0.598 * 2.257e6 * r);   // the equilibrium nucleus (Carey, ch. 6)
  const RHO_C = 4.18e6, RHO_C_GLASS = 2500 * 840, SB = 5.670374e-8;
  const geo = (o) => {
    const n = o.n ?? 64, width = o.width ?? 0.1, dx = width / n;
    return { n, width, dx, xy: (k) => [((k % n) + 0.5) * dx - width / 2, (((k / n) | 0) + 0.5) * dx - width / 2] };
  };
  const rms = (a, b = null) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - (b ? b[i] : 0)) ** 2; return Math.sqrt(s / a.length); };
  const diff = (a, b) => Array.from(a, (x, i) => x - b[i]);
  // The GPU's field against the reference's, as an RMS over the RMS of the reference's change from `from`.
  const against = (G, C, from) => { const ref = from ? rms(diff(C, from)) : rms(C); return { ref, err: rms(G, C) / ref }; };
  const pct = (x) => `${(100 * x).toFixed(3)}%`;

  // ── H1, H2 and the model's first step and second: the lamp ──────────
  {
    const [G, C] = await both('lamp');
    const o = H1_DISH, g = geo(o), dt = LAMP_DT;
    const absorbs = (A) => 0.12 * (1 - Math.exp(-A)) + 0.88 * (1 - Math.exp(-600 * o.gap));
    const Cap = RHO_C * o.gap + RHO_C_GLASS * o.glass;
    const inside = (k) => Math.hypot(...g.xy(k)) < 0.45 * g.width;
    const expect = (k) => {
      const [x, y] = g.xy(k);
      const I = o.lampIrradiance * Math.exp(-((x - o.lampCentre[0]) ** 2 + (y - o.lampCentre[1]) ** 2) / (2 * o.lampWidth ** 2));
      return (dt * I * absorbs(G.dye[k])) / Cap;
    };
    let peak = 0, worst = 0, worstHalf = 0, still = 0, hot = -Infinity, hottest = -1;
    for (let k = 0; k < g.n * g.n; k++) if (inside(k)) peak = Math.max(peak, expect(k));
    for (let k = 0; k < g.n * g.n; k++) {
      if (!inside(k)) continue;
      const got = G.full.T[k] - 20;
      worst = Math.max(worst, Math.abs(got - expect(k)) / peak);
      worstHalf = Math.max(worstHalf, Math.abs((G.half.T[k] - 20) - 0.5 * got) / peak);
      still = Math.max(still, Math.abs(G.off.T[k] - 20));
      if (G.clear.T[k] > hot) { hot = G.clear.T[k]; hottest = k; }
    }
    const [hx, hy] = g.xy(hottest), off = Math.hypot(hx - o.lampCentre[0], hy - o.lampCentre[1]) / g.dx;
    check('H1 the first 10 ms warm each cell by the lamp × its absorbed fraction over the heat capacity', worst < 1e-3, `worst ${worst.toExponential(2)} of the hottest cell's ${(peak * 1000).toFixed(2)} mK (bar 1e-3)`);
    check('H1 the hottest cell of a clear dish is the lamp\'s centre, not the grid\'s', off <= 0.75, `${off.toFixed(2)} cells from the lamp's centre (bar 0.75)`);
    let kd = -1;
    for (let k = 0; k < g.n * g.n && kd < 0; k++) { const [x, y] = g.xy(k); if (G.dye[k] > 0 && Math.hypot(x + 0.02, y - 0.01) < g.dx) kd = k; }
    const ratio = (G.full.T[kd] - 20) / (G.clear.T[kd] - 20), want = absorbs(1.5) / absorbs(0);
    check('H1 dark dye warms faster than clear water in the same light, by the ratio of what each absorbs', Math.abs(ratio / want - 1) < 1e-2, `${ratio.toFixed(4)}×, Beer–Lambert ${want.toFixed(4)}× (bar 1e-2)`);
    check('H2 the Heat dial at 0.5 warms by half of what it does at 1', worstHalf < 1e-3, `worst ${worstHalf.toExponential(2)} off half (bar 1e-3)`);
    check('H2 at 0 the dish does not warm and nothing moves', still < 1e-4 && G.off.fastest === 0, `${still.toExponential(2)} K, fastest face ${G.off.fastest} m/s`);

    const t1 = against(G.full.T, C.full.T, C.off.T);
    const f1 = against([...G.full.u, ...G.full.v], [...C.full.u, ...C.full.v]);
    check('the model: the lamp\'s first step warms the dish cell by cell as the reference\'s (within 1%)', t1.ref > 0 && t1.err <= 0.01, `RMS difference ${pct(t1.err)} of the reference's ${(t1.ref * 1000).toFixed(3)} mK`);
    check('the model: and its first flows (the warming water\'s expansion) are the reference\'s (within 2%)', f1.ref > 0 && f1.err <= 0.02, `RMS difference ${pct(f1.err)} of the reference's ${f1.ref.toExponential(2)} m/s`);
    const t20 = against(G.second.T, C.second.T, C.off.T), f20 = against([...G.second.u, ...G.second.v], [...C.second.u, ...C.second.v]);
    check('the model: after a second (20 steps of 50 ms) the dish is the reference\'s, cell by cell (within 1% of its warming, 2% of its flows)', t20.ref > 0 && f20.ref > 0 && t20.err <= 0.01 && f20.err <= 0.02,
      `temperature ${pct(t20.err)} of ${(t20.ref * 1000).toFixed(2)} mK, flows ${pct(f20.err)} of ${f20.ref.toExponential(2)} m/s`);
  }

  // ── H3: the air, a hand that blocks it, and heat spreading ──────────
  {
    const G = await gpu('air');
    const gap = 0.5e-3, glass = 1e-3, Cap = RHO_C * gap + RHO_C_GLASS * glass;
    // Newton's air and the glass faces' radiation, 2εσ(T⁴ − Ta⁴), integrated here (RK4).
    const cool = (h) => {
      const f = (T) => -(h * (T - 20) + 2 * 0.9 * SB * ((T + 273.15) ** 4 - 293.15 ** 4)) / Cap;
      let T = 60;
      for (let i = 0; i < 1000; i++) { const d = 0.01, k1 = f(T), k2 = f(T + d * k1 / 2), k3 = f(T + d * k2 / 2), k4 = f(T + d * k3); T += (d / 6) * (k1 + 2 * k2 + 2 * k3 + k4); }
      return T - 20;
    };
    const fan = G.fan - 20, held = G.held - 20, wantFan = cool(50), wantHeld = cool(10);
    check('H3 with the lamp off a warm dish cools by the fan\'s h and the glass\'s radiation', Math.abs(fan / wantFan - 1) < 0.005, `${fan.toFixed(3)} K over the room, integrated ${wantFan.toFixed(3)} (bar 0.5%)`);
    check('H3 under a held hand it cools by natural convection\'s h and the radiation', Math.abs(held / wantHeld - 1) < 0.005, `${held.toFixed(3)} K, integrated ${wantHeld.toFixed(3)} (bar 0.5%)`);
    const B = await gpu('bump');
    const D = (0.6 * gap + 1.0 * glass) / Cap, want = (10 * B.s0 * B.s0) / (B.s0 * B.s0 + 2 * D * 40), got = B.peak - 20;
    check('H3 heat spreads sideways through the water and the glass as the heat equation says', Math.abs(got / want - 1) < 0.03, `peak ${got.toFixed(3)} K after 40 s, the heat equation ${want.toFixed(3)} K (10 K at the start; bar 3%)`);
  }

  // ── H4 and the model's upright second: buoyancy ─────────────────────
  {
    const [G, C] = await both('rise');
    const o = { n: 96, width: 0.1, gap: 1e-3 }, g = geo(o), R0 = 0.45 * o.width, a = G.a;
    const exact = (T) => {
      const f = (kell(20) - kell(T)) * 9.81;
      const Mi = o.gap ** 2 / (12 * vogel(T)), Mo = o.gap ** 2 / (12 * vogel(20));
      const eps = (a * a) / (R0 * R0), kk = (1 + eps) / (1 - eps);
      return (f * Mi * Mo * kk) / (Mi + Mo * kk);
    };
    const e40 = exact(40), e70 = exact(70);
    check('H4 a 40 °C patch on an upright plate rises at the exact inclusion speed', Math.abs(G.u40 / e40 - 1) < 0.05, `${(G.u40 * 1000).toFixed(3)} mm/s, exact ${(e40 * 1000).toFixed(3)} (bar 5%)`);
    check('H4 a 70 °C patch rises at the exact inclusion speed', Math.abs(G.u70 / e70 - 1) < 0.05, `${(G.u70 * 1000).toFixed(3)} mm/s, exact ${(e70 * 1000).toFixed(3)} (bar 5%)`);
    check('H4 heat has a strength: 70 °C over 40 °C by water\'s real density and viscosity', Math.abs((G.u70 / G.u40) / (e70 / e40) - 1) < 0.03, `${(G.u70 / G.u40).toFixed(3)}×, exact ${(e70 / e40).toFixed(3)}× (bar 3%)`);
    const centroid = (T) => { let sx = 0, sy = 0, w = 0; for (let k = 0; k < g.n * g.n; k++) { const e = T[k] - 20; if (e > 0) { const [x, y] = g.xy(k); sx += e * x; sy += e * y; w += e; } } return [sx / w, sy / w]; };
    const [x0, y0] = centroid(G.T0), [lx, ly] = centroid(G.level), [, uy] = centroid(G.upright);
    const dl = Math.hypot(lx - x0, ly - y0) / g.dx, du = (y0 - uy) / g.dx;
    check('H4 on a level plate warm liquid has no "up": the patch stays where it is', dl < 0.05, `moved ${dl.toFixed(4)} cells in 5 s (bar 0.05)`);
    check('H4 on an upright plate it rises', du > 3, `rose ${du.toFixed(2)} cells in 5 s (bar 3)`);
    const m = against(G.second, C.second, C.T0);
    check('the model: the warm patch\'s first second upright is the reference\'s, cell by cell (within 2% of its change)', m.ref > 0 && m.err <= 0.02, `RMS difference ${pct(m.err)} of the reference's ${(m.ref * 1000).toFixed(2)} mK`);
  }

  // ── H6: the plate's own sites, and the threshold ────────────────────
  {
    const G = await gpu('sites');
    const rc = 5e-6, density = 2e5, lambda = density * G.dx * G.dx;
    let cells = 0;
    const sup = [];
    for (let k = 0; k < G.inside.length; k++) { cells += G.inside[k]; if (G.inside[k] && G.dTnuc[k] < NO_SITE) sup.push(G.dTnuc[k]); }
    sup.sort((x, y) => x - y);
    // Sites are a density on the glass: a cell holds a Poisson count of mean λ = density·dx² and
    // starts at its largest cavity's superheat, so P(ΔT ≤ y) = 1 − (e^(−λ(1 − F(A/y))) − e^(−λ))/(1 − e^(−λ)).
    const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
    const F = (r) => 0.5 * (1 + erf(Math.log(r / rc) / (0.3 * Math.SQRT2)));
    const A = hsu(1);
    const cdf = (y) => 1 - (Math.exp(-lambda * (1 - F(A / y))) - Math.exp(-lambda)) / (1 - Math.exp(-lambda));
    let ks = 0;
    sup.forEach((y, i) => { const c = cdf(y); ks = Math.max(ks, Math.abs(c - i / sup.length), Math.abs(c - (i + 1) / sup.length)); });
    const ksBar = 1.63 / Math.sqrt(Math.max(1, sup.length));
    const share = sup.length / cells, want = 1 - Math.exp(-lambda), sd = Math.sqrt(want * (1 - want) / cells);
    check('H6 each of the plate\'s own sites has the equilibrium nucleus\'s superheat for its largest cavity, over the whole distribution', sup.length > 0 && ks < ksBar, `KS distance ${ks.toFixed(4)} over ${sup.length} sites (bar ${ksBar.toFixed(4)}, the 1% level)${sup.length ? `; median ${sup[sup.length >> 1].toFixed(2)} K` : ''}`);
    check('H6 the share of cells with a site is the density\'s, within three binomial σ', Math.abs(share - want) < 3 * sd, `${sup.length} of ${cells} cells, ${share.toFixed(3)} (${want.toFixed(3)} ± ${(3 * sd).toFixed(3)})`);
    const under = G.under.starts.reduce((s, x) => s + x, 0);
    let missed = 0, stray = 0, born = 0;
    for (let k = 0; k < G.inside.length; k++) {
      if (!G.inside[k]) continue;
      const site = G.dTnuc[k] < NO_SITE, b = G.over.starts[k] > 0;
      born += b ? 1 : 0;
      if (site && !b) missed++;
      if (!site && b) stray++;
    }
    check('H6 at 98% of each site\'s superheat no bubble starts', under === 0 && G.under.vapour === 0, `${under} started`);
    check('H6 at 102% every site starts one, and no cell without a site does at 130 °C', missed === 0 && stray === 0 && born === sup.length, `${born} of ${sup.length} sites, ${stray} without a site`);
  }

  // ── H6: the nucleus, its size and its latent heat ───────────────────
  {
    /*
      Every line above lets a nucleus be any size and cost nothing: measured, a
      reference whose nucleus takes no latent heat, and one whose nucleus is a
      tenth of the gap's cell (α 0.1) instead of a sphere as wide as the gap
      (π d²/6dx², 0.03 here), each passed boil.mjs's 38 and this check's other
      lines. So one site alone, at 102% of its 5 K: the bubble is the gap-wide
      sphere, less the share of it its own volume pushes out of the cell in the
      step (1 − α(1 − ρ_v/ρ_l), as the rim's), within 1%; and the cell is colder
      by that steam's latent heat over its heat capacity, within 2% (5 mK, which a
      float32 at 105 °C holds to 1.5e-3; a solver that also starts the rim's
      exchange in the same 10 µs moves it 0.25%).
    */
    const G = await gpu('nucleus');
    const gap = 0.5e-3, glass = 1e-3, T = 105.1;
    const seed = Math.min(0.5, (Math.PI * gap * gap) / (6 * G.dx * G.dx)), keep = 1 - seed * (1 - 0.598 / kell(T));
    const drop = (seed * 0.598 * 2.257e6 * gap) / (RHO_C * gap + RHO_C_GLASS * glass);
    const ra = G.alpha / (seed * keep), rt = (T - G.T) / drop;
    check('H6 a nucleus is a bubble as wide as the gap, at its site and nowhere else', G.starts === 1 && G.elsewhere === 0 && Math.abs(ra - 1) < 0.01,
      `α ${G.alpha.toFixed(5)}, a gap-wide sphere ${(seed * keep).toFixed(5)} (bar 1%); ${G.starts} started at the site, ${G.elsewhere} elsewhere`);
    check('H6 and the cell pays its steam\'s latent heat', Math.abs(rt - 1) < 0.02, `colder by ${((T - G.T) * 1000).toFixed(3)} mK, the latent heat ${(drop * 1000).toFixed(3)} mK (bar 2%)`);
  }

  // ── H8: the bubble's rim, both ways ─────────────────────────────────
  {
    // The heat over 1 ms, the steam over 10 µs (see the header: a float32 dish cannot read
    // 10 µs of warming, and 1 ms of steam is 15% of the cell's, where how a solver orders
    // the exchange and the carry within the step moves it by a few per cent).
    const gap = 0.5e-3, glass = 1e-3, hi = 1e4;
    const rim = async (T) => {
      const [H, V] = [await gpu('rim', { T, dt: 1e-3 }), await gpu('rim', { T, dt: 1e-5 })];
      const Gr = hi * 2 * Math.sqrt(Math.PI * 0.3) * (gap / H.dx), Cap = 0.7 * RHO_C * gap + RHO_C_GLASS * glass;
      const dT = (-1e-3 * Gr * (T - 100)) / Cap, dA = (1e-5 * Gr * (T - 100)) / (0.598 * 2.257e6 * gap);
      // The steam made pushes the mixture out of the cell, its own vapour with it: a cell keeps 1 − α(1 − ρ_v/ρ_l) of it.
      const keep = 1 - 0.3 * (1 - 0.598 / kell(T));
      return { t: (H.T - T) / dT, a: (V.alpha - 0.3) / (dA * keep) };
    };
    const hot = await rim(110), cold = await rim(90);
    const ok = (r) => Math.abs(r.t - 1) < 3e-3 && Math.abs(r.a - 1) < 1e-3;
    check('H8 superheated liquid boils into a bubble at its rim\'s exchange: the heat it loses and the steam it makes', ok(hot), `${hot.t.toFixed(5)} (1 ms, bar 3e-3) and ${hot.a.toFixed(5)} (10 µs, bar 1e-3) of h_i·2√(πα)·d/dx·ΔT at 110 °C`);
    check('H8 subcooled liquid condenses it the same way, giving the heat back', ok(cold), `${cold.t.toFixed(5)} and ${cold.a.toFixed(5)} at 90 °C`);
  }

  // ── H5, H7, H8, H9 and the model's course: the dish the hand boils ──
  let divWorst = 0, divSteps = 0;
  {
    const sites = Array.from(R.createBoilPlate(DISH).dTnuc);
    const [G, C] = await both('dish', sites);
    const g = geo(DISH);
    const inside = (k) => Math.hypot(...g.xy(k)) < 0.45 * g.width;
    divWorst = Math.max(divWorst, G.divWorst); divSteps += G.divSteps;
    let grew = 0;
    for (let k = 0; k < g.n * g.n; k++) if (inside(k)) grew += Math.log(kell(20) / kell(G.fan.T[k])) * g.dx * g.dx;
    check('H7 the lamp at full with the fan blowing warms the dish for five minutes and never boils it', G.fan.starts === 0 && G.fan.tmax < 100, `${G.fan.starts} bubbles, hottest ${G.fan.tmax.toFixed(2)} °C`);
    check('H5 warming water pushes out of the rim the volume its density says it grew by', Math.abs(G.fan.pushed / grew - 1) < 0.02, `${(G.fan.pushed * 1e6).toFixed(3)} against ${(grew * 1e6).toFixed(3)} mm² per unit depth (bar 2%)`);
    // The same five minutes as a radial problem, by finite volumes on 300 rings (boil.mjs's).
    {
      const R0 = 0.45 * 0.1, N = 300, dr = R0 / N;
      const K = 0.6 * DISH.gap + 1.0 * DISH.glass, Cap = RHO_C * DISH.gap + RHO_C_GLASS * DISH.glass;
      const ab = 0.88 * (1 - Math.exp(-600 * DISH.gap));
      const T = new Float64Array(N).fill(20), q = new Float64Array(N);
      for (let i = 0; i < N; i++) { const r = (i + 0.5) * dr; q[i] = DISH.lampIrradiance * ab * Math.exp(-(r * r) / (2 * DISH.lampWidth ** 2)); }
      const steps = Math.ceil(300 / (0.2 * dr * dr * Cap / K)), h = 300 / steps;
      const Fl = new Float64Array(N + 1);
      for (let s = 0; s < steps; s++) {
        for (let i = 1; i < N; i++) Fl[i] = K * i * dr * (T[i] - T[i - 1]) / dr;
        Fl[N] = K * R0 * (20 - T[N - 1]) / (dr / 2);
        for (let i = 0; i < N; i++) T[i] += (h / Cap) * ((Fl[i + 1] - Fl[i]) / ((i + 0.5) * dr * dr) - DISH.hForced * (T[i] - 20) - 2 * 0.9 * SB * ((T[i] + 273.15) ** 4 - 293.15 ** 4) + q[i]);
      }
      const rr = (g.dx / Math.SQRT2) / dr - 0.5, i0 = Math.floor(rr), fr = rr - i0;
      const want = T[i0] * (1 - fr) + T[i0 + 1] * fr;
      check('H7 the dish\'s hottest point after five minutes is the radial heat balance\'s', Math.abs((G.fan.tmax - 20) / (want - 20) - 1) < 0.01, `${G.fan.tmax.toFixed(2)} °C, the radial solve ${want.toFixed(2)} °C (bar 1% of the rise)`);
    }
    check('H7 before it boils heat moves a level plate only by its expansion (no whole-plate flow)', G.fan.levelSpeed < 1e-5, `fastest face ${(G.fan.levelSpeed * 1e6).toFixed(3)} µm/s (bar 10)`);
    const five = against(G.fan.T, C.fan.T, C.fan.T.map(() => 20));
    check('the model: after five minutes of lamp and fan the dish is the reference\'s, cell by cell (within 0.5% of its rise)', five.ref > 0 && five.err <= 0.005, `RMS difference ${pct(five.err)} of the reference's ${five.ref.toFixed(2)} K`);

    const siteMax = Math.max(...sites.filter((x) => x < NO_SITE));
    const bubbles = G.starts.reduce((s, x) => s + x, 0);
    let strays = 0, atLamp = 0;
    G.starts.forEach((s, k) => {
      if (!s) return;
      const [x, y] = g.xy(k);
      if (Math.hypot(x - HAND.x, y - HAND.y) > HAND.r + g.dx) strays += s;
      if (Math.hypot(x, y) < 2 * g.dx) atLamp += s;
    });
    check('H8 a hand that blocks the air boils it within a minute', G.first > 0 && G.first < 60, G.first > 0 ? `first bubble ${G.first.toFixed(1)} s after the hand` : 'no bubble');
    check('H8 every bubble starts under the hand, none at the lamp\'s hot spot beside it', bubbles > 0 && strays === 0 && atLamp === 0, `${bubbles} started, ${strays} outside the hand, ${atLamp} at the lamp`);
    check('H8 and no site without vapour is hotter than its own superheat allows', G.overSite <= 1e-4, `worst ${G.overSite.toFixed(5)} K over its threshold (bar 1e-4)`);
    check('H8 so the boil holds the dish near 100 °C under the hand', G.hotLiquid > 99.5 && G.hotLiquid <= 100 + siteMax, `hottest under the hand ${G.hotLiquid.toFixed(2)} °C, the widest site's superheat ${siteMax.toFixed(2)} K`);
    check('H9 lift the hand and within 5 s the vapour is under 1% of its peak', G.calmV >= 0 && G.calmV <= 5, G.calmV >= 0 ? `${G.calmV.toFixed(1)} s` : 'never');
    check('H9 within 10 s the flow is under 2% of the boil\'s', G.calmU >= 0 && G.calmU <= 10, G.calmU >= 0 ? `${G.calmU.toFixed(1)} s (peak ${(G.peakU * 1000).toFixed(2)} mm/s)` : 'never');
    const wantE = G.gained - G.lost;
    check('H5 the dish\'s heat over the boil and the calm is what the lamp gave less what left it', Math.abs(G.dE - wantE) < 0.03 * G.gained, `changed ${G.dE.toFixed(1)} J, the ledger ${wantE.toFixed(1)} J of ${G.gained.toFixed(1)} J the lamp gave (bar 3% of that)`);
    check('H9 and no bubble starts again while the hand is off', G.startsAfter === 0, `${G.startsAfter} started`);

    // The course, against the reference's own.
    const holdEnd = 600 - 1;
    const [gEnd, cEnd] = [G.vap[holdEnd], C.vap[holdEnd]];
    check('the model: the hand\'s boil starts when the reference\'s does (within 1 s)', G.first > 0 && C.first > 0 && Math.abs(G.first - C.first) <= 1, `${G.first.toFixed(1)} s against ${C.first.toFixed(1)} s after the hand`);
    check('the model: its peak vapour and its vapour when the hand lifts are the reference\'s (within 10%)', C.peakV > 0 && Math.abs(G.peakV / C.peakV - 1) <= 0.1 && Math.abs(gEnd / cEnd - 1) <= 0.1,
      `peak ${(G.peakV * 1e6).toFixed(1)} against ${(C.peakV * 1e6).toFixed(1)} mm², at the lift ${(gEnd * 1e6).toFixed(1)} against ${(cEnd * 1e6).toFixed(1)} mm²`);
    const where = (S) => { const a = []; S.forEach((s, k) => { if (s) a.push(k); }); return a; };
    const [gw, cw] = [where(G.firstStarts), where(C.firstStarts)];
    const close = gw.length > 0 && gw.every((k) => cw.some((m) => Math.abs((k % g.n) - (m % g.n)) <= 1 && Math.abs(((k / g.n) | 0) - ((m / g.n) | 0)) <= 1));
    check('the model: and the first bubble starts in the reference\'s cell or the next', close, `the GPU's first cells ${gw.join(', ') || 'none'}, the reference's ${cw.join(', ') || 'none'}`);
  }

  // ── H5, H10: the Heat dial on a hotter lamp ─────────────────────────
  {
    const G = await gpu('hotter', Array.from(R.createBoilPlate({ ...DISH, lampIrradiance: 40000 }).dTnuc));
    divWorst = Math.max(divWorst, G.divWorst); divSteps += G.divSteps;
    const wantE = G.gained - G.lost;
    check('H5 the hotter boil\'s heat, through its dry-out, is what the lamp gave less what left it', G.dry > 0 && Math.abs(G.dE - wantE) < 0.03 * G.gained, `changed ${G.dE.toFixed(1)} J, the ledger ${wantE.toFixed(1)} J of ${G.gained.toFixed(1)} J (bar 3%); ${G.dry} dried-out cell-steps`);
    check('H10 the Heat dial at 0.5 makes no bubble in two minutes', G.half === 0, `${G.half} started`);
    check('H10 at 1 it boils within a minute', G.first >= 0 && G.first < 60, G.first >= 0 ? `${G.first.toFixed(1)} s` : 'no bubble');
    check('H10 back at 0 the vapour is under 1% of its peak within 5 s', G.calm >= 0 && G.calm <= 5, G.calm >= 0 ? `${G.calm.toFixed(1)} s` : 'never');
  }
  check('H5 every cell\'s face flows add up to the volume the step asked for, on every step of the boils', divSteps > 1000 && divWorst < 1e-3, `worst ${divWorst.toExponential(2)} of the largest source over ${divSteps} steps (bar 1e-3, float32)`);

  // ── H11 and the model's pocket: vapour rises on an upright plate ────
  {
    const [G, C] = await both('pocket');
    check('H11 on an upright plate a pocket of steam rises', G.up.dy < -2, `moved ${G.up.dy.toFixed(2)} cells in 1 s (up is −; bar −2)`);
    check('H11 on a level plate it stays', Math.abs(G.flat.d) < 0.05, `moved ${G.flat.d.toFixed(4)} cells in 1 s, either way (bar 0.05)`);
    const m = against(G.up.alpha, C.up.alpha, C.a0);
    check('the model: the pocket\'s second upright is the reference\'s, cell by cell (within 5% of its change)', m.ref > 0 && m.err <= 0.05, `RMS difference ${pct(m.err)} of the reference's change, ${m.ref.toFixed(4)} in α`);
  }

  // ── The model's boiling second ──────────────────────────────────────
  {
    const [G, C] = await both('boil');
    const t1 = against(G.one.T, C.one.T, C.T0), a1 = against(G.one.alpha, C.one.alpha, C.alpha0);
    const f1 = against([...G.one.u, ...G.one.v], [...C.one.u, ...C.one.v]);
    check('the model: the first step of a boil under the hand is the reference\'s, cell by cell (temperature, steam and flows, within 5% of each)', [t1, a1, f1].every((m) => m.ref > 0 && m.err <= 0.05),
      `temperature ${pct(t1.err)} of ${t1.ref.toFixed(3)} K, steam ${pct(a1.err)} of ${a1.ref.toFixed(4)}, flows ${pct(f1.err)} of ${f1.ref.toExponential(2)} m/s`);
    const t10 = against(G.ten.T, C.ten.T, C.T0), a10 = against(G.ten.alpha, C.ten.alpha, C.alpha0);
    check('the model: and its first second (temperature and steam, within 5% of each)', [t10, a10].every((m) => m.ref > 0 && m.err <= 0.05),
      `temperature ${pct(t10.err)} of ${t10.ref.toFixed(3)} K, steam ${pct(a10.err)} of ${a10.ref.toFixed(4)}`);
  }

  const work = await page.evaluate(() => window.__work);
  check('the work is the GPU\'s: every step submits to the GPU and every read maps a buffer', selftest || (work.steps > 0 && work.idleSteps === 0 && work.idleReads === 0),
    selftest ? 'not asked of the control, which is the CPU reference by design' : `${work.idleSteps} of ${work.steps} steps submitted nothing, ${work.idleReads} of ${work.reads} reads mapped nothing`);
  check('and the solver does not carry the CPU reference', selftest || !carriesReference, selftest ? 'the control is the reference' : carriesReference ? `${modulePath}'s bundle includes src/lib/lampBoil.ts's code` : 'src/lib/lampBoil.ts is not in its bundle');
  const errs = await page.evaluate(() => window.__errors.splice(0));
  check('no WebGPU errors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : 'none raised');

  // The passes' cost at the plate's grid: printed, not judged (the control, a float64 CG on 768², is not timed).
  if (!selftest) {
    const ms = await page.evaluate(async () => {
      const P = await window.makePlate({ ...window.boilDish, n: 768 });
      for (let k = 0; k < 3; k++) await P.step(1 / 60, { heat: 1, holds: [] });
      await P.read();
      const t0 = performance.now();
      for (let k = 0; k < 10; k++) await P.step(1 / 60, { heat: 1, holds: [] });
      await P.read();
      const t = (performance.now() - t0) / 10;
      P.destroy?.();
      return t;
    });
    console.log(`  cost: ${ms.toFixed(2)} ms a step at 768 × 768 on ${adapter || 'this adapter'}, lamp on (printed, not judged)`);
  }
} catch (e) {
  if (e.message !== 'no solver') { console.log(` FAIL ${e.message}`); checks.push({ ok: false }); }
} finally {
  await close();
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  exitCode = failed.length || !checks.length ? 1 : 0;
}
process.exit(exitCode);
