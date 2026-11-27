#!/usr/bin/env node
/**
 * Faraday waves stand up from the liquid's own physics (PLAN 48f).
 *
 *   npm run faraday      (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * The owner asked for visuals the music itself moves, standing waves first.
 * The Shake setting is a dish's acceleration on a speaker (a cord carries the
 * music onto it); src/gpu/faraday.ts steps the standing wave a shaken layer
 * grows. This holds that step to what a real layer does, on the app's own
 * grid (256² over the 0.2 m plate) and its own substeps, on the GPU:
 *
 *   - **No pattern under the threshold.** At 0.7 of the threshold the
 *     drive's own resonant wave cannot outgrow its damping, so after five
 *     seconds the surface is only the dish's whisper of noise: under a
 *     micron r.m.s., and its light (the curvature's lens, as the plate draws
 *     it) under a fifth of a per cent. A step that faked a pattern, or
 *     pumped every wave, or let the noise run away, fails here.
 *   - **A pattern over it, growing at the Mathieu equation's rate.** At
 *     three times the threshold the r.m.s. grows by e-folds at the first
 *     tongue's Floquet rate (src/lib/faraday.ts faradayGrowth) within 20%,
 *     measured between two reads while the wave is still small; grown, it
 *     saturates, finite, under the steepness a real wave breaks at (k u < 1).
 *   - **Its wavelength is the dispersion relation's**, within 10%, at three
 *     drive frequencies (20, 50, 100 Hz): the power spectrum's ring, by its
 *     power-weighted wavenumber, against the root of ω(k) = Ω/2. Bass makes
 *     the big cells and a high drive the fine ones because the liquid says
 *     so, which is the claim of the feature.
 *   - **The dial's top holds.** Two g at 10 Hz and at 150 Hz for 4 s stands
 *     as a grown pattern (k u over 0.05: not a field the solver's NaN guard
 *     wiped back to still water, which would pass a finiteness line alone),
 *     finite and under breaking. Before the step held its spectrum to a real
 *     field's, a 150 Hz lattice at 2 g blew up after three seconds; before
 *     the cubic's stiff part went into the exact step, the 10 Hz one blew up
 *     in its second second. And the same at 10 Hz stepped in tenths of a
 *     second, the slowest frame the step takes (four substeps of 25 ms), as
 *     a stalled tab steps it.
 *   - **It dies with the note.** Shake taken to nothing (at 50 Hz), the pattern rings
 *     down at the resonant wave's damping (2νk² and the floor's boundary
 *     layer) within 25%.
 *
 * And the pattern moves (PLAN 48f-6, 48f-9), each the real phenomenon:
 *
 *   - **Rock.** The strobe slipped off the wave at 0.5 Hz: after a second
 *     the surface drawn is the crest turned to trough (corr −1), half a
 *     second more it is caught flat, and the liquid stepped under it is the
 *     one stepped without it to the last bit, because a strobe moves no water.
 *   - **Riding the flow.** A perfect stripe on a plate flowing 2 mm/s goes
 *     4 mm in 2 s with it (within 10%), and on still water stays put.
 *   - **Breaking into motion.** At 4× the threshold a grown pattern holds its
 *     place over 4 s (corr over 0.9); at 12× it is a different pattern 4 s
 *     later (under 0.8), then settles into a new one (over 0.9 ten seconds
 *     on). A perfect stripe, and a perfect square, drive no mean flow (their
 *     push is a gradient the projection removes); a grown square's harmonics
 *     and a grown pattern's defects do, rising with the drive, and with Γ = 0
 *     there is none. The mean flow moves the pattern: the dish with it is not
 *     the dish without it (over 3% of the r.m.s. at 4×).
 *
 *   - **The plate draws it, and only moves the light.** The lab's real solver
 *     and plate shader on a dyed plate: four seconds on a 90 Hz shaker at
 *     1.4 g changes the picture, and its mean brightness stays the still
 *     plate's within 2%; the shaker off and on again is still water. At
 *     Strength 4 the same waves move the light more than twice as hard and
 *     the mean holds within 5% (the aperture's loss and the dark folds).
 *
 * And printed, not held: which pattern stands (stripes, squares) by the
 * spectrum's peaks round the ring. The cubic that picks it is a shortcut set
 * to a real wave's size, not derived (PLAN 48f-2), so the check does not
 * hold a shape to it.
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

mkdirSync('node_modules/.cache', { recursive: true });
const libOut = `node_modules/.cache/faraday-lib-${process.pid}.mjs`;
await build({ stdin: { contents: "export * from './src/lib/faraday.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: libOut, logLevel: 'warning' });
const F = await import(`../${libOut}`);

const entry = 'node_modules/.cache/faraday-entry.ts';
writeFileSync(entry, `import * as P from ${JSON.stringify(resolve('src/gpu/faraday.ts'))};
(window as any).faraday = P;
(window as any).labReady = true;
`);
let { page, close } = await openLab({ entry });

const G = F.FARADAY_G;
const PLATE = 0.2;
const DT = 1 / 60;
// The lens the plate draws through (wgsl/plateFaraday.ts): D (1 − 1/n), D the depth.
const LENS = F.FARADAY_DEPTH * (1 - 1 / F.FARADAY_INDEX);

/*
  A dish stepped in the page: `segments` of [seconds, shake g, keep, rock Hz],
  at `hz`, read after each. And for the checks of the pattern's motion
  (PLAN 48f-6, 48f-9):
    - `flow`: the plate's flow, m/s along x, as the plate hands it (a
      velocity texture of one unit and the travel that makes the unit that
      speed);
    - `stripe`: [m, metres]: the dish started as one perfect stripe of m
      waves across the plate, written into the step's spectrum, so where
      it goes is the phase of that one mode; with `square`, a second stripe
      across it, the square pattern, two-dimensional and every mode on the
      ring;
    - `still`: the waves' own mean flow taken out (its coupling Γ set to
      nought after the first step), the control for what it moves;
    - each read also carries the surface the strobe sees (eta), the stripe's
      mode and the mean flow's r.m.s. speed.
*/
const run = (s) => page.evaluate(async (s) => {
  const dev = window.__dev;
  const plate = new window.faraday.FaradayPlate(dev);
  const n = plate.field.n;
  const grab = async (buf, floats) => {
    const b = dev.createBuffer({ size: floats * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e = dev.createCommandEncoder();
    e.copyBufferToBuffer(buf, 0, b, 0, floats * 4);
    dev.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    const out = Array.from(new Float32Array(b.getMappedRange()));
    b.destroy();
    return out;
  };
  let vel = null;
  if (s.flow) {
    vel = dev.createTexture({ size: [2, 2], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    // Half-float 1.0 is 0x3c00: the flow's unit along x in every texel.
    dev.queue.writeTexture({ texture: vel }, new Uint16Array([0x3c00, 0, 0, 0, 0x3c00, 0, 0, 0, 0x3c00, 0, 0, 0, 0x3c00, 0, 0, 0]), { bytesPerRow: 16 }, [2, 2]);
  }
  if (s.stripe) {
    // u = a cos(2π m x / L): the back transform divides by n², so the pair at ±m holds a n² / 2 each.
    const [m, a] = s.stripe;
    const v = new Float32Array([(a * n * n) / 2, 0]);
    const at = s.square ? [m, n - m, m * n, (n - m) * n] : [m, n - m];
    for (const i of at) { dev.queue.writeBuffer(plate.spec, i * 8, v); dev.queue.writeBuffer(plate.z, i * 8, v); }
  }
  const reads = [];
  let first = true;
  for (const [seconds, shake, keep, rock = 0] of s.segments) {
    const steps = Math.round(seconds / s.dt);
    for (let k = 0; k < steps; k++) {
      const e = dev.createCommandEncoder();
      plate.step(e, s.dt, shake, s.hz, rock, vel, vel ? (s.flow * s.dt) / 0.2 : 0);
      dev.queue.submit([e.finish()]);
      if (first && s.still) plate.args[17] = 0;
      first = false;
      if (k % 30 === 29) await dev.queue.onSubmittedWorkDone();
    }
    const h = await grab(plate.field.h, n * n);
    const out = { rms: Math.sqrt(h.reduce((a, x) => a + x * x, 0) / h.length) };
    if (keep) out.h = h;
    if (s.eta) out.eta = await grab(plate.field.eta, n * n);
    if (s.stripe) { const z = await grab(plate.spec, 2 * (s.stripe[0] + 1)); out.mode = [z[2 * s.stripe[0]], z[2 * s.stripe[0] + 1]]; }
    const u = await grab(plate.zu, 2 * n * n);
    out.flow = Math.sqrt(u.reduce((a, x) => a + x * x, 0) / (n * n));
    reads.push(out);
  }
  plate.dispose();
  vel?.destroy();
  return { n, reads, errors: window.__errors.slice() };
}, s);

const rmsOf = (r) => r.rms;
const corr = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb); };

/* The 2-D power spectrum, by rows then columns (a plain radix-2 FFT). */
function spectrum(h, n) {
  const re = Float64Array.from(h), im = new Float64Array(n * n);
  const line = (get, set) => {
    const r = new Float64Array(n), q = new Float64Array(n);
    for (let i = 0; i < n; i++) { const [a, b] = get(i); r[i] = a; q[i] = b; }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [r[i], r[j]] = [r[j], r[i]]; [q[i], q[j]] = [q[j], q[i]]; }
    }
    for (let m = 2; m <= n; m <<= 1) {
      const ang = (-2 * Math.PI) / m;
      for (let s0 = 0; s0 < n; s0 += m) {
        for (let k = 0; k < m / 2; k++) {
          const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
          const a = s0 + k, b = a + m / 2;
          const tr = wr * r[b] - wi * q[b], ti = wr * q[b] + wi * r[b];
          r[b] = r[a] - tr; q[b] = q[a] - ti; r[a] += tr; q[a] += ti;
        }
      }
    }
    for (let i = 0; i < n; i++) set(i, r[i], q[i]);
  };
  for (let y = 0; y < n; y++) line((i) => [re[y * n + i], im[y * n + i]], (i, a, b) => { re[y * n + i] = a; im[y * n + i] = b; });
  for (let x = 0; x < n; x++) line((i) => [re[i * n + x], im[i * n + x]], (i, a, b) => { re[i * n + x] = a; im[i * n + x] = b; });
  const p = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}

/* The ring's wavenumber (1/m), power-weighted round the strongest band, and the angles of its peaks. */
function ringOf(h, n) {
  const p = spectrum(h, n);
  const dk = (2 * Math.PI) / PLATE;
  const bins = new Float64Array(n);
  const at = [];
  for (let fy = 0; fy < n; fy++) for (let fx = 0; fx < n; fx++) {
    const sx = fx < n / 2 ? fx : fx - n, sy = fy < n / 2 ? fy : fy - n;
    if (!sx && !sy) continue;
    const r = Math.hypot(sx, sy);
    bins[Math.round(r)] += p[fy * n + fx];
    at.push([r, Math.atan2(sy, sx), p[fy * n + fx]]);
  }
  let best = 1;
  for (let b = 1; b < n / 2; b++) if (bins[b] > bins[best]) best = b;
  let w = 0, wr = 0;
  const lo = best * 0.75, hi = best * 1.25;
  const ang = new Float64Array(36);
  for (const [r, a, q] of at) {
    if (r < lo || r > hi) continue;
    w += q; wr += q * r;
    ang[Math.floor((((a % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 36)) % 36] += q;
  }
  // The pattern's peaks round the half ring (a standing wave's k and −k are one), each over a fifth of the strongest.
  const top = Math.max(...ang);
  let peaks = 0;
  for (let i = 0; i < 36; i++) if (ang[i] > top * 0.2 && ang[i] >= ang[(i + 35) % 36] && ang[i] > ang[(i + 1) % 36]) peaks++;
  return { k: (wr / w) * dk, peaks };
}

/*
  The light the plate draws from a read field at its brightest cell: D′ ∇²u,
  the lens's first-order term, with the five-point stencil the plate's own
  (wgsl/plateFaraday.ts) sums from its Hessian. Read from the field itself
  and not from its r.m.s. times the pattern's k², because noise sits at the
  grid's finest waves, whose curvature is many times the pattern's.
*/
function lightOf(h) {
  const n = Math.round(Math.sqrt(h.length)), dx = PLATE / n;
  let top = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = h[y * n + x];
    const lap = h[y * n + (x + 1) % n] + h[y * n + (x + n - 1) % n] + h[((y + 1) % n) * n + x] + h[((y + n - 1) % n) * n + x] - 4 * c;
    top = Math.max(top, Math.abs((LENS * lap) / (dx * dx)));
  }
  return top;
}

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
  console.log(`  adapter: ${adapter || 'unnamed'}`);
  const errs = [];

  // --- Under the threshold: nothing stands up ---
  {
    const hz = 40, ac = F.faradayThreshold(hz) / G;
    const r = await run({ hz, dt: DT, segments: [[5, 0.7 * ac, true]] });
    errs.push(...r.errors);
    const h = r.reads[0].h, rms = rmsOf(r.reads[0]);
    const light = lightOf(h);
    check(`at 0.7 of the threshold (${(0.7 * ac).toFixed(3)} g at ${hz} Hz) no pattern stands after 5 s`, rms < 1e-6, `r.m.s. ${(rms * 1e6).toFixed(3)} µm`);
    check('and its light on the wall is invisible', light < 0.002, `${(light * 100).toFixed(3)}% of the lamp at its brightest cell`);
  }

  // --- Over it: growth at the Mathieu rate ---
  {
    const hz = 40, ac = F.faradayThreshold(hz) / G, k = F.faradayK(hz);
    const shake = 3 * ac;
    const want = F.faradayGrowth(k, shake * G, hz);
    /*
      Read at 4 s and 5.5 s: late enough that the resonant ring has outgrown
      the noise of every other wave (it starts as a few hundred of the grid's
      65,536 modes, so at first the r.m.s. is the noise's), and still far
      under its saturation.
    */
    const r = await run({ hz, dt: DT, segments: [[4, shake, false], [1.5, shake, false]] });
    errs.push(...r.errors);
    const [a, b] = r.reads.map(rmsOf);
    const grown = Math.log(b / a) / 1.5;
    check(`at 3× the threshold the wave grows at the Mathieu rate (${want.toFixed(2)}/s)`, Math.abs(grown / want - 1) < 0.2, `measured ${grown.toFixed(2)}/s, ${(a * 1e6).toFixed(2)} → ${(b * 1e6).toFixed(2)} µm`);
  }

  // --- The wavelength is the dispersion relation's, the pattern saturates, and at 50 Hz it dies with the note ---
  for (const hz of [20, 50, 100]) {
    const ac = F.faradayThreshold(hz) / G, want = F.faradayK(hz);
    const shake = Math.min(F.FARADAY_SHAKE_MAX, 4 * ac);
    const grow = F.faradayGrowth(want, shake * G, hz);
    // Long enough to grow from the noise to saturation: twelve e-folds and a second.
    const seconds = Math.min(20, 12 / Math.max(0.5, grow) + 1);
    /*
      At 50 Hz the shake is then taken away: read 3 s after it stops, when
      the wave is a fifteenth of its saturated height and its own cubic no
      longer speeds the decay, and a second later.
    */
    const ringDown = hz === 50;
    const r = await run({ hz, dt: DT, segments: [[seconds, shake, true], ...(ringDown ? [[3, 0, false], [1, 0, false]] : [])] });
    errs.push(...r.errors);
    const ring = ringOf(r.reads[0].h, r.n);
    const off = ring.k / want - 1;
    check(`at ${hz} Hz the pattern's wavelength is the dispersion relation's`, Math.abs(off) < 0.1,
      `${((2 * Math.PI / ring.k) * 1e3).toFixed(2)} mm against ${((2 * Math.PI / want) * 1e3).toFixed(2)} mm (${off >= 0 ? '+' : ''}${(off * 100).toFixed(1)}%), ${shake.toFixed(2)} g for ${seconds.toFixed(1)} s, ${ring.peaks} peak${ring.peaks === 1 ? '' : 's'} round the ring (1 stripes, 2 squares, 3 hexagons)`);
    const u = rmsOf(r.reads[0]), steep = want * Math.sqrt(2) * u;
    check(`and stands as a finite pattern under the steepness a wave breaks at`, Number.isFinite(steep) && steep > 0.02 && steep < 1, `k u ${steep.toFixed(3)}, r.m.s. ${(u * 1e3).toFixed(3)} mm, light ${(LENS * want * want * u * Math.sqrt(2) * 100).toFixed(1)}% of the lamp`);
    if (ringDown) {
      const a = rmsOf(r.reads[1]), b = rmsOf(r.reads[2]);
      const decay = -Math.log(b / a), wantD = F.faradayDamping(want);
      check(`with the shake gone the pattern rings down at its damping (${wantD.toFixed(2)}/s)`, Math.abs(decay / wantD - 1) < 0.25, `measured ${decay.toFixed(2)}/s`);
    }
  }

  // --- The dial's top holds: the strongest shake at both ends of the Shaker stays a finite, unbroken surface ---
  for (const [hz, dt] of [[10, DT], [150, DT], [10, 0.1]]) {
    const shake = F.FARADAY_SHAKE_MAX, k = F.faradayK(hz);
    const r = await run({ hz, dt, segments: [[4, shake, true]] });
    errs.push(...r.errors);
    const h = r.reads[0].h;
    const u = rmsOf(r.reads[0]), steep = k * Math.sqrt(2) * u;
    const frames = dt === DT ? '' : `, stepped ${dt} s a frame`;
    check(`at the dial's top (${shake} g at ${hz} Hz${frames}) a pattern stands, finite and under breaking`, h.every(Number.isFinite) && steep > 0.05 && steep < 1, `k u ${steep.toFixed(3)}, r.m.s. ${(u * 1e3).toFixed(3)} mm`);
  }

  // --- Rock (48f-6): the strobe slips, the surface drawn trades crest for trough, and the liquid stepped is the same ---
  {
    const hz = 20, shake = 4 * F.faradayThreshold(hz) / G;
    // Eight seconds still (φ = 0), then a second and a half at 0.5 Hz: φ = π after the second, 3π/2 after the half.
    const segs = (rock) => [[8, shake, true, 0], [1, shake, true, rock], [0.5, shake, true, rock]];
    const a = await run({ hz, dt: DT, eta: true, segments: segs(0.5) });
    const b = await run({ hz, dt: DT, segments: segs(0) });
    errs.push(...a.errors, ...b.errors);
    const [g, half, quarter] = a.reads;
    const ratio = (r) => Math.sqrt(r.eta.reduce((t, x) => t + x * x, 0) / r.eta.length) / r.rms;
    // The strobe's phase is exact arithmetic (φ advanced by 2π·rock·dt a substep), so the bars are tight: a cos φ
    // off by a substep's slip (0.5 Hz × 1/120 s, 0.026 rad) still passes, a missing or doubled slip does not.
    check('Rock still (φ = 0): the surface drawn is the crest the step holds', corr(g.eta, g.h) > 0.999 && Math.abs(ratio(g) - 1) < 0.01,
      `corr ${corr(g.eta, g.h).toFixed(4)}, size ${ratio(g).toFixed(4)} of it`);
    check('Rock at 0.5 Hz for a second (φ = π): crests and troughs have traded places', corr(half.eta, half.h) < -0.999 && Math.abs(ratio(half) - 1) < 0.01,
      `corr ${corr(half.eta, half.h).toFixed(4)}, size ${ratio(half).toFixed(4)}`);
    check('and half a second on (φ = 3π/2) the strobe catches the surface flat', ratio(quarter) < 0.03, `size ${ratio(quarter).toFixed(4)} of the crest's`);
    let d = 0;
    for (let i = 0; i < quarter.h.length; i++) d += (quarter.h[i] - b.reads[2].h[i]) ** 2;
    const moved = Math.sqrt(d / quarter.h.length) / b.reads[2].rms;
    // The rock is the light's, not the liquid's: the same plate stepped without it must be the same numbers.
    check('and the liquid stepped under the rock is the one stepped without it', moved < 1e-6, `differs by ${moved.toExponential(2)} of its r.m.s.`);
  }

  let stripeFlow = NaN;
  const broke = [];
  // --- Riding the flow (48f-9): a perfect stripe on a plate flowing 2 mm/s goes with it, and on still water stays put ---
  {
    const hz = 20, m = 10, k = (2 * Math.PI * m) / PLATE, shake = 3 * F.faradayThreshold(hz) / G;
    const v = 0.002, t = 2;
    const base = { hz, dt: DT, stripe: [m, 20e-6], segments: [[3, shake, false], [t, shake, false]] };
    const moving = await run({ ...base, flow: v });
    const still = await run(base);
    // The square twice: one step after it is laid down, before the cubic has made any harmonic, and after the
    // same 3 s the stripe had, when it has.
    const seeded = await run({ ...base, square: true, segments: [[DT, shake, false], [DT, shake, false]] });
    const square = await run({ ...base, square: true });
    errs.push(...moving.errors, ...still.errors, ...seeded.errors, ...square.errors);
    const shift = (r) => { const [a, b] = r.reads.map((q) => Math.atan2(q.mode[1], q.mode[0])); let dp = b - a; dp -= 2 * Math.PI * Math.round(dp / (2 * Math.PI)); return -dp / k; };
    const w = Math.PI * hz;
    const u = still.reads[1].rms;
    const go = shift(moving), stay = shift(still), scale = w * k * u * u;
    stripeFlow = still.reads[1].flow;
    // 4 mm is a fifth of the stripe's 20 mm wavelength, so a phase read can neither alias nor round to it by luck;
    // the semi-Lagrangian carry's interpolation smooths a little, measured 3% short (2026-11-21), so 10%.
    check(`riding the flow: a stripe on a plate flowing ${v * 1e3} mm/s goes ${(v * t * 1e3).toFixed(0)} mm in ${t} s with it`, Math.abs(go / (v * t) - 1) < 0.1,
      `moved ${(go * 1e3).toFixed(3)} mm`);
    check('and on still water it stays put', Math.abs(stay) < 0.02 * v * t, `${(stay * 1e3).toFixed(4)} mm`);
    // A pattern whose every mode sits on the critical ring pushes as a pure gradient, which the projection removes:
    // ∇²u = −k²u there, so −Γ ∇²u ∇u = Γ k² ∇(u²/2), however tall (wgsl/faraday.ts, faradayForce). A stripe alone
    // cannot tell that from the projection doing its job (any push that varies along x only is a gradient on a
    // periodic plate), so the line is held on a square too: two-dimensional, its push a gradient only while every
    // mode is on the ring. What it catches is a push of the wrong shape (a component taken along the wrong axis,
    // a term that is not some f(u) times ∇u), not a wrong size: Γ's size and sign keep a gradient a gradient.
    // Each pattern against its own scale ω k u², u its own r.m.s. Measured 2026-11-21 on Metal: the stripe 3e-5
    // of it, the square one step after it is laid down 9e-4 (its u is the 20 µm seed, so its scale is 8.5 µm/s
    // and its flow 0.008), so the bars are 1e-3 and 1e-2.
    const own = (r) => r.reads[1].flow / (w * k * r.reads[1].rms ** 2);
    check('a perfect stripe, and a perfect square, drive no mean flow of their own (their push is a gradient)',
      stripeFlow < 1e-3 * scale && own(seeded) < 1e-2 && Number.isFinite(own(seeded)) && seeded.reads[1].rms > 0.5 * 20e-6,
      `${(stripeFlow * 1e6).toFixed(3)} µm/s against ω k u² ${(scale * 1e6).toFixed(0)}, and ${(seeded.reads[1].flow * 1e6).toFixed(3)} against ${(w * k * seeded.reads[1].rms ** 2 * 1e6).toFixed(1)}`);
    // Grown 3 s, the square's cubic has made its cross harmonics, (k, 2k) and the rest, off the ring: their push is
    // no longer a gradient and the square streams, as a real one does. Measured 2026-11-21: 155 µm/s, 3.4% of its
    // scale, forty times the seeded square's share; the bar is ten.
    check('and once its harmonics grow, the square streams',
      own(square) > 10 * own(seeded) && square.reads[1].rms > 0.5 * u,
      `${(square.reads[1].flow * 1e6).toFixed(1)} µm/s, ${(own(square) * 100).toFixed(2)}% of ω k u² against ${(own(seeded) * 100).toFixed(3)}% one step after it was laid down`);
  }

  // --- Breaking into motion (48f-9): the waves' own mean flow, on a pattern grown from the dish's noise ---
  for (const times of [4, 12]) {
    const hz = 20, k = F.faradayK(hz), shake = Math.min(F.FARADAY_SHAKE_MAX, times * F.faradayThreshold(hz) / G);
    const grow = F.faradayGrowth(k, shake * G, hz);
    const seconds = Math.min(20, 12 / Math.max(0.5, grow) + 1);
    // Two more reads ten seconds on, to tell lasting chaos from a pattern reorganising once as it saturates.
    const segs = [[seconds, shake, true], [4, shake, true], [10, shake, true], [4, shake, true]];
    const on = await run({ hz, dt: DT, segments: segs });
    const off = await run({ hz, dt: DT, still: true, segments: segs });
    errs.push(...on.errors, ...off.errors);
    const w = Math.PI * hz, u = on.reads[1].rms;
    const steep = (r) => k * Math.SQRT2 * r.rms;
    // How far the waves' mean flow carried the pattern: the same dish, same seed, with and without it (Γ = 0
    // only touches the push, so every difference is the carry's).
    let dd = 0;
    for (let i = 0; i < on.reads[1].h.length; i++) dd += (on.reads[1].h[i] - off.reads[1].h[i]) ** 2;
    broke.push({ times, shake, on: corr(on.reads[0].h, on.reads[1].h), off: corr(off.reads[0].h, off.reads[1].h),
      lateOn: corr(on.reads[2].h, on.reads[3].h), lateOff: corr(off.reads[2].h, off.reads[3].h),
      carried: Math.sqrt(dd / on.reads[1].h.length) / u,
      steeps: [on.reads[1], on.reads[3], off.reads[1], off.reads[3]].map(steep),
      flow: on.reads[1].flow, offFlow: off.reads[1].flow, scale: w * k * u * u, steep: k * Math.SQRT2 * u });
  }
  {
    const [lo, hi] = broke;
    const say = (b) => `${b.times}×: corr ${b.on.toFixed(3)} (${b.off.toFixed(3)} without the mean flow), flow ${(b.flow * 1e6).toFixed(0)} µm/s, k u ${b.steep.toFixed(2)}`;
    // Measured 2026-11-21 on Metal: 0.95 at 4×, 0.61 at 12×, and ten seconds on 0.99 at 12× and 0.9997 at the
    // dial's top (2 g): driven hard the pattern grows past where it can stand, breaks up and moves for some seconds,
    // then locks into a new one. A real dish far past threshold goes on to lasting defect chaos (Kudrolli and
    // Gollub 1996); this equation's cubic picks a stable pattern instead, so the lasting motion is the Rock's and
    // the plate's flow, and the chaos is PLAN 48f-12. The late window holds the settling, which a plate that blew
    // up and was wiped to noise would not show.
    // A plate that blew up is wiped back to noise by the step's guard (wgsl/faraday.ts, faradayAdvance), and noise
    // against noise correlates near nought too: every read the correlations rest on must be a standing wave, its
    // steepness k √2 u between a twentieth and one.
    const live = (b) => b.steeps.every((x) => Number.isFinite(x) && x > 0.05 && x < 1);
    const steeps = (b) => b.steeps.map((x) => x.toFixed(2)).join(' ');
    check(`a pattern at 4× the threshold holds its place over 4 s`, live(lo) && lo.on > 0.9 && lo.off > 0.9, `${say(lo)}, steepness ${steeps(lo)}`);
    check(`and at ${hi.times}× it breaks into motion: 4 s after it grows it is a different pattern, then it settles into a new one`,
      live(hi) && hi.on < 0.8 && hi.off < 0.8 && hi.lateOn > 0.9 && hi.lateOff > 0.9,
      `${say(hi)}, late ${hi.lateOn.toFixed(3)} (${hi.lateOff.toFixed(3)}), steepness ${steeps(hi)}`);
    // What the mean flow does to the pattern, not only that it exists: the same dish with and without it, where it
    // holds its place (4×, so the difference is a carry and not two chaotic runs parting). The carry is the only
    // road from Γ to the surface (wgsl/faraday.ts, faradayCubic), so cutting it there makes the two runs the same
    // numbers to the bit; done by hand 2026-11-21 (carried 0). With it, measured 8.6% at 4× and 40% at 12×: the
    // bar is a third of that.
    const CARRY_MIN = 0.03;
    check('and the mean flow moves the pattern: the dish with it is not the dish without it',
      lo.carried > CARRY_MIN && Number.isFinite(lo.carried), `${(lo.carried * 100).toFixed(2)}% of the r.m.s. at 4× (${(hi.carried * 100).toFixed(1)}% at ${hi.times}×)`);
    // The defects and the amplitude's modulation of a grown pattern are what drive a mean flow; the perfect stripe above
    // drove none. Measured 350 and 830 µm/s against the stripe's 0.15: the bar is a hundredfold. Γ = 0 being still
    // only proves the harness's own switch is wired (Γ multiplies the push); what the flow moves is the line above.
    check('a grown pattern streams: its defects drive a mean flow a perfect stripe does not, rising with the drive',
      lo.flow > 100 * stripeFlow && hi.flow > lo.flow && lo.offFlow === 0 && hi.offFlow === 0,
      `${(lo.flow * 1e6).toFixed(0)} and ${(hi.flow * 1e6).toFixed(0)} µm/s against ${(stripeFlow * 1e6).toFixed(2)}, ${hi.offFlow} with Γ = 0`);
  }

  /*
    --- The plate draws it, and only moves the light ---
    The same dyed plate stepped four seconds still and four seconds on a
    90 Hz shaker at 1.4 g, through the lab's real solver and plate shader
    (the field reaching display binding 25 by fields.faraday, the lean gate
    U.faraday, coversOver): the shaken picture differs from the still one by
    a lattice, and its mean brightness is the still one's within 2%, the
    Jacobian of the map back moving the lamp's light and making none (the
    first version, 1/det at the source, brightened the whole plate by more).
    Then the shaker off for a frame (its solver goes) and on again with no
    shake: still water, the still picture again.
  */
  await close();
  ({ page, close } = await openLab());
  const draw = await page.evaluate(async () => {
    const cam = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
    const lay = async () => {
      await lab.create(256);
      let s = 7;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 9; i++) lab.dye(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.08 + 0.1 * r(), [0.3 + 1.2 * r(), 0.3 + 1.2 * r(), 0.3 + 1.2 * r()], 1.2);
      lab.flush(); await lab.step(10);
    };
    const shake = { faradayHz: 90, faraday: 1.4 };
    await lay(); await lab.step(240);
    const still = Array.from(await lab.render(256, {}, cam));
    await lab.step(2);
    const still2 = Array.from(await lab.render(256, shake, cam));
    await lay(); await lab.step(240, shake);
    const shaken = Array.from(await lab.render(256, shake, cam));
    const shaken4 = Array.from(await lab.render(256, { ...shake, faradayGain: 4 }, cam));
    await lab.step(1, { faradayHz: 0, faraday: 0 });
    await lab.step(1, { faradayHz: 90, faraday: 0 });
    const again = Array.from(await lab.render(256, shake, cam));
    return { still, still2, shaken, shaken4, again };
  });
  const meanOf = (px) => { let t = 0; for (let i = 0; i < px.length; i += 4) t += px[i] + px[i + 1] + px[i + 2]; return t / (px.length / 4) / 3; };
  const diffOf = (a, b) => { let t = 0; for (let i = 0; i < a.length; i += 4) t += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return t / (a.length / 4) / 3; };
  const mStill = meanOf(draw.still), mShaken = meanOf(draw.shaken);
  const dShaken = diffOf(draw.shaken, draw.still), dAgain = diffOf(draw.again, draw.still2);
  check('the plate draws the shaken dish (90 Hz at 1.4 g, 4 s): the picture differs from the still one', dShaken > 2, `mean |Δ| ${dShaken.toFixed(2)} levels`);
  check('and the light is only moved, never made: the mean brightness held within 2%', Math.abs(mShaken / mStill - 1) < 0.02, `${mStill.toFixed(2)} still, ${mShaken.toFixed(2)} shaken`);
  const dGain = diffOf(draw.shaken4, draw.still), mGain = meanOf(draw.shaken4);
  // Strength 4 racks the lens four times further past the dye: the same waves bend the light four times as hard
  // (measured 13.9 levels against 3.3). The mean is 5% and not 2%: at that throw the steepest slopes tilt light out of
  // the lens (the aperture's loss, a real projector's) and the folds past a caustic are drawn dark (PLAN 48f-11).
  check('Strength 4 throws the same waves\' light harder', dGain > 2 * dShaken, `mean |Δ| ${dGain.toFixed(2)} against ${dShaken.toFixed(2)} at 1`);
  check('and still only moves it: the mean brightness held within 5%', Math.abs(mGain / mStill - 1) < 0.05, `${mStill.toFixed(2)} still, ${mGain.toFixed(2)} at 4`);
  check('the shaker off and on again is still water: the still picture', dAgain < 0.3, `mean |Δ| ${dAgain.toFixed(2)} levels`);

  check('no GPU errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  exitCode = failed ? 1 : 0;
} catch (e) {
  console.log(' FAIL the run —', e.message);
} finally {
  await close();
  process.exit(exitCode);
}
