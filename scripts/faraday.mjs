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
 *   - **The plate draws it, and only moves the light.** The lab's real solver
 *     and plate shader on a dyed plate: four seconds on a 90 Hz shaker at
 *     1.4 g changes the picture, and its mean brightness stays the still
 *     plate's within 2%; the shaker off and on again is still water.
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

/* A dish stepped in the page: `segments` of [seconds, shake g], at `hz`, read after each. */
const run = (s) => page.evaluate(async (s) => {
  const dev = window.__dev;
  const plate = new window.faraday.FaradayPlate(dev);
  const n = plate.field.n;
  const read = async () => {
    const b = dev.createBuffer({ size: n * n * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e = dev.createCommandEncoder();
    e.copyBufferToBuffer(plate.field.h, 0, b, 0, n * n * 4);
    dev.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    const out = Array.from(new Float32Array(b.getMappedRange()));
    b.destroy();
    return out;
  };
  const reads = [];
  for (const [seconds, shake, keep] of s.segments) {
    const steps = Math.round(seconds / s.dt);
    for (let k = 0; k < steps; k++) {
      const e = dev.createCommandEncoder();
      plate.step(e, s.dt, shake, s.hz);
      dev.queue.submit([e.finish()]);
      if (k % 30 === 29) await dev.queue.onSubmittedWorkDone();
    }
    const h = await read();
    reads.push(keep ? h : { rms: Math.sqrt(h.reduce((a, x) => a + x * x, 0) / h.length) });
  }
  plate.dispose();
  return { n, reads, errors: window.__errors.slice() };
}, s);

const rmsOf = (h) => (Array.isArray(h) ? Math.sqrt(h.reduce((a, x) => a + x * x, 0) / h.length) : h.rms);

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
    const h = r.reads[0], rms = rmsOf(h);
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
    const ring = ringOf(r.reads[0], r.n);
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
    const h = r.reads[0];
    const u = rmsOf(h), steep = k * Math.sqrt(2) * u;
    const frames = dt === DT ? '' : `, stepped ${dt} s a frame`;
    check(`at the dial's top (${shake} g at ${hz} Hz${frames}) a pattern stands, finite and under breaking`, h.every(Number.isFinite) && steep > 0.05 && steep < 1, `k u ${steep.toFixed(3)}, r.m.s. ${(u * 1e3).toFixed(3)} mm`);
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
    await lab.step(1, { faradayHz: 0, faraday: 0 });
    await lab.step(1, { faradayHz: 90, faraday: 0 });
    const again = Array.from(await lab.render(256, shake, cam));
    return { still, still2, shaken, again };
  });
  const meanOf = (px) => { let t = 0; for (let i = 0; i < px.length; i += 4) t += px[i] + px[i + 1] + px[i + 2]; return t / (px.length / 4) / 3; };
  const diffOf = (a, b) => { let t = 0; for (let i = 0; i < a.length; i += 4) t += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return t / (a.length / 4) / 3; };
  const mStill = meanOf(draw.still), mShaken = meanOf(draw.shaken);
  const dShaken = diffOf(draw.shaken, draw.still), dAgain = diffOf(draw.again, draw.still2);
  check('the plate draws the shaken dish (90 Hz at 1.4 g, 4 s): the picture differs from the still one', dShaken > 2, `mean |Δ| ${dShaken.toFixed(2)} levels`);
  check('and the light is only moved, never made: the mean brightness held within 2%', Math.abs(mShaken / mStill - 1) < 0.02, `${mStill.toFixed(2)} still, ${mShaken.toFixed(2)} shaken`);
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
