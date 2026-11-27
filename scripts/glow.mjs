#!/usr/bin/env node
/**
 * Bioluminescent trails (PLAN 48c): `npm run glow`.
 *
 * What was asked: the dark plate glows where the liquid is sheared, the way
 * a wake glows in a bay full of dinoflagellates, and the glow tires: each
 * cell lights where the shear passes a threshold and spends a charge that
 * refills over Glow Recharge's seconds (gpu/glow.ts, wgsl/glow.ts). The plan
 * named the check: no glow on a still plate; glow along a stroke and only
 * there; a second stroke down the same path within the recharge glows less
 * than the first. This holds those, and the two things that make them mean
 * something:
 *
 *   1. A still plate is dark. Two hundred steps of a plate nobody touches,
 *      Glow up: not one cell lights (the brightest under 1e-4), and every
 *      cell keeps its charge (the lowest over 0.999). A glow that lit by
 *      itself, a noise or a floor, would fail here.
 *
 *   2. A stroke lights its own path, and only it. A finger dragged left to
 *      right across the lower half of the plate (uv y 0.35, x 0.2 to 0.6):
 *      the charge it spends, summed over the band it crossed, is many times
 *      what is spent anywhere far from it, and many times what is spent in
 *      the band's mirror across the middle (uv y 0.65), so a flow read upside
 *      down fails. The spent charge is the record of where the cells fired,
 *      and does not fade a tenth of a second later as the light does.
 *
 *   3. The threshold is a threshold. The same stroke at a twentieth of its
 *      speed (a drift, the plate's slow flow) spends nothing to speak of:
 *      under a twentieth of what the full stroke spent. A glow that grew
 *      with speed but had no threshold (light proportional to shear) would
 *      spend a twentieth here and fail.
 *
 *   4. A second stroke too soon glows less. The stroke again down the same
 *      path 30 steps after the first (Recharge 8 s): its brightest
 *      moment, over the band, under 0.97 of the first's, and three more
 *      strokes each 30 steps after the last each dimmer than the one
 *      before, the fifth under 0.85 of the first. Why a tenth and not half:
 *      a passing finger fires a cell for the few hundredths of a second its
 *      shear lasts, and a cell spends a share of its store in a flash
 *      (Lingulodinium gives several flashes from one store before it is
 *      spent; GLOW_SPEND is that), so one pass dims the next a little and a
 *      sea stirred again and again tires, as a wake does. Control, on a fresh
 *      plate: the same two strokes and the same 30-step rest, with Recharge
 *      at its 0.05 s floor (refilled to e^-10 in that rest), glow alike
 *      (within 2%). Only the store changed and the first stroke's leftover
 *      flow is still there, so it is the spent charge that dims the second,
 *      not that flow (measured 0.1836 then 0.1837). And 3's positive
 *      control: the same drift under a threshold twenty times lower spends,
 *      so 3's nothing is the threshold's and not a drift with no flow.
 *
 *   5. Off is off, and the plate draws it. Stepped at Glow 0 there is no
 *      glow solver at all. Drawn mid-stroke at Glow 1, the plate's picture is
 *      bluer than the same moment drawn at 0 (the mean of blue minus red up
 *      by over 2 of 255 inside the band, and under a tenth of that far from
 *      it), and drawn at 0 twice it is the same bytes (the comparison sees
 *      the glow, not a plate that never draws the same twice).
 *
 *   6. The shaken dish lights the sea (PLAN 48c-6): the music's bass on the
 *      dish's speaker (Music Shake, on Shake) stands up a Faraday wave, and
 *      the wave's strain fires the cells. No stroke, Shaker at 30 Hz:
 *        - shaken at half the wave's threshold (nothing stands up), the
 *          plate stays dark and keeps its charge, as a still one does;
 *        - shaken at 1 g, twelve times the threshold, the lattice lights:
 *          charge is spent across the plate. Twelve times, because the
 *          pattern grows from the dish's whisper of noise at the Mathieu
 *          rate (9 per second here, 2 at 0.3 g) and the lab steps four
 *          seconds; Glow Recharge at 0.5 s, so a firing cell holds a third
 *          of its charge or more and every cell's share can be read below;
 *        - where it lights is the wave's: the cells' firing share, read back
 *          as their light over their charge, is held against a share worked
 *          out here from the wave's own amplitude field (read back from the
 *          Faraday solver), by sampling the linear wave's strain at a
 *          thousand heights through the layer and the floor's Stokes layer
 *          (not the closed form the kernel uses), cell by cell: correlated
 *          over 0.9 and the same in the mean within 15%. The same share
 *          worked out with the wave read upside down correlates far less
 *          (a field read with its rows reversed fails);
 *        - the threshold is a threshold: the same shake under a Glow Shear
 *          ten times higher spends under a tenth as much;
 *          The cells strictly between none and all of the depth are
 *          counted (over a fifth), so r is the strain's shape and not just
 *          the nodal lines; the wave read with rows reversed or turned on
 *          its side correlates under 0.5;
 *        - a known wave, the kernel alone: u = A cos kx written into a wave
 *          field by hand and stepped once, its share along a row against
 *          the strain worked by hand from the exact derivatives with
 *          ω = π · 30 as a fixed number (not the kernel's stencil nor the
 *          dispersion relation's ω), within 0.03 of the depth everywhere,
 *          the crest's share between 0.2 and 0.8;
 *        - the note dies: the shake back to 0.3 of the threshold with the
 *          shaker still on, as Night Sea's quiet bass is, and the wave rings
 *          down and the sea is dark within four seconds.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { openLab } from './lab.mjs';

const libOut = `node_modules/.cache/glow-faraday-lib-${process.pid}.mjs`;
await build({ stdin: { contents: "export * from './src/lib/faraday.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: libOut, logLevel: 'warning' });
const F = await import(`../${libOut}`);
rmSync(libOut, { force: true });
const SHAKE_HZ = 30;
const SHAKE_G = 1;
const SHAKE_AC = F.faradayThreshold(SHAKE_HZ) / F.FARADAY_G;
/** The threshold every run here uses, per second (Glow Shear's default). */
const GLOW_TH = 30;
/** The known wave's amplitude, metres: the antinode's share of the depth about a half at 30 Hz. */
const KNOWN_A = 5.1e-4;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++; else failed++;
};

const { page, close } = await openLab();
let o;
try {
  o = await page.evaluate(async ({ shakeHz, shakeG, shakeAc, glowTh, knownA, knownK }) => {
    const N = 128, R = 192, n = 256;
    const cam = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
    const dark = { ledColor: '#000000', ledPlatform: false };
    const glowOf = () => lab.solver().glowPlate;
    const P = (over = {}) => ({ glow: 1, glowShear: glowTh, glowRecharge: 8, ...over });
    // Sums over a box of the glow grid, uv x0..x1, y0..y1 (row 0 at uv y 0).
    const box = (a, x0, x1, y0, y1) => {
      let s = 0, c = 0;
      for (let j = Math.floor(y0 * n); j < Math.ceil(y1 * n); j++)
        for (let i = Math.floor(x0 * n); i < Math.ceil(x1 * n); i++) { s += a[j * n + i]; c++; }
      return s / c;
    };
    const band = (a) => box(a, 0.15, 0.65, 0.28, 0.42);
    const mirror = (a) => box(a, 0.15, 0.65, 0.58, 0.72);
    const far = (a) => (box(a, 0.05, 0.95, 0.85, 0.95) + box(a, 0.8, 0.95, 0.05, 0.95)) / 2;
    const fresh = async () => { await lab.create(N); lab.dye(0.5, 0.5, 0.35, [0.6, 0.2, 0.1], 0.6); lab.flush(); };
    // A finger dragged across, a step at a time: returns the brightest band light of any step.
    const stroke = async (speed, over = {}, picture = null) => {
      let peak = 0;
      for (let k = 0; k < 12; k++) {
        lab.vel(0.2 + (0.4 * k) / 11, 0.35, 0.05, [speed, 0, 0, 0]);
        lab.flush();
        await lab.step(1, P(over));
        const g = await glowOf().read();
        peak = Math.max(peak, band(g.light));
        if (picture && k === 6) await picture();
      }
      return peak;
    };
    const rest = async (steps, over = {}) => { await lab.step(steps, P(over)); };
    const spent = (g) => g.charge.map((c) => 1 - c);
    const r = {};

    // 1. A still plate.
    await fresh();
    await rest(200);
    let g = await glowOf().read();
    r.stillMax = Math.max(...g.light);
    r.stillMinCharge = Math.min(...g.charge);

    // 2 and 5. A stroke, the plate drawn in the middle of it.
    const pics = {};
    r.peak1 = await stroke(1.5, {}, async () => {
      pics.on = Array.from(await lab.render(R, { ...dark, glow: 1 }, cam));
      pics.off = Array.from(await lab.render(R, { ...dark, glow: 0 }, cam));
      pics.off2 = Array.from(await lab.render(R, { ...dark, glow: 0 }, cam));
    });
    g = await glowOf().read();
    const s = spent(g);
    r.spentBand = band(s); r.spentMirror = mirror(s); r.spentFar = far(s);
    r.lightMax = Math.max(...g.light);

    // 4. Again, 30 steps later.
    r.peaks = [r.peak1];
    for (let k = 0; k < 4; k++) { await rest(30); r.peaks.push(await stroke(1.5)); }
    r.peak2 = r.peaks[1];

    // 3. The same stroke as a drift.
    await fresh();
    await rest(5);
    await stroke(1.5 / 20);
    r.spentDrift = band(spent(await glowOf().read()));
    // Its positive control: the same drift with the threshold twenty times lower must spend,
    // so the 0 above is the threshold's and not a drift that made no flow at all.
    await fresh();
    await rest(5, { glowShear: 1.5 });
    await stroke(1.5 / 20, { glowShear: 1.5 });
    r.spentDriftLow = band(spent(await glowOf().read()));

    // 4's control: the same half-second rest, but Recharge at its floor (0.05 s refills to
    // e^-10 in that rest). Only the store changes, so the first stroke's leftover flow is still
    // there: if the second stroke still dimmed, the dimming would be that flow's, not the charge's.
    await fresh();
    await rest(5, { glowRecharge: 0.05 });
    r.ctl1 = await stroke(1.5, { glowRecharge: 0.05 });
    await rest(30, { glowRecharge: 0.05 });
    r.ctl2 = await stroke(1.5, { glowRecharge: 0.05 });

    // 5. Off.
    await lab.step(1, P({ glow: 0 }));
    r.keptOff = lab.solver().glowPlate !== null && lab.solver().glowPlate !== undefined;
    await fresh();
    await lab.step(20, P({ glow: 0 }));
    r.madeOff = lab.solver().glowPlate !== null && lab.solver().glowPlate !== undefined;

    // The pictures: blue minus red, in the band and far, picture row 0 at the top (uv y 1).
    const bmr = (px, x0, x1, y0, y1) => {
      let t = 0, c = 0;
      for (let y = Math.floor((1 - y1) * R); y < Math.ceil((1 - y0) * R); y++)
        for (let x = Math.floor(x0 * R); x < Math.ceil(x1 * R); x++) { const k = (y * R + x) * 4; t += px[k + 2] - px[k]; c++; }
      return t / c;
    };
    // The band itself, never the larger of it and its mirror: the plate's uv runs up the picture
    // (plateThinFilm.ts), so a glow read upside down lands in the mirror and must fail here.
    r.picBand = bmr(pics.on, 0.15, 0.65, 0.28, 0.42) - bmr(pics.off, 0.15, 0.65, 0.28, 0.42);
    r.picMirror = bmr(pics.on, 0.15, 0.65, 0.58, 0.72) - bmr(pics.off, 0.15, 0.65, 0.58, 0.72);
    r.picFar = bmr(pics.on, 0.05, 0.95, 0.85, 0.95) - bmr(pics.off, 0.05, 0.95, 0.85, 0.95);
    r.picSame = pics.off.every((v, k) => v === pics.off2[k]);

    // 6. The shaken dish. The wave's amplitude field, read back from its solver.
    const readWave = async () => {
      const sv = lab.solver(), fp = sv.faradayPlate, dev = sv.device;
      const size = fp.field.n * fp.field.n * 4;
      const out = dev.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = dev.createCommandEncoder();
      enc.copyBufferToBuffer(fp.field.h, 0, out, 0, size);
      dev.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ);
      const h = Array.from(new Float32Array(out.getMappedRange().slice(0)));
      out.unmap(); out.destroy();
      return { h, n: fp.field.n };
    };
    const shaken = (shake, over = {}) => P({ faradayHz: shakeHz, faraday: shake, ...over });
    await fresh();
    await lab.step(240, shaken(shakeAc * 0.5));
    g = await glowOf().read();
    r.belowMax = Math.max(...g.light);
    r.belowMinCharge = Math.min(...g.charge);
    r.readCells = g.light.length;
    await fresh();
    await lab.step(240, shaken(shakeG, { glowRecharge: 0.5 }));
    g = await glowOf().read();
    r.shakenSpent = spent(g).reduce((t, v) => t + v, 0) / (n * n);
    r.shakenLit = Array.from(g.lit);
    r.shakenCharge = Array.from(g.charge);
    r.shakenMax = Math.max(...g.light);
    r.wave = await readWave();
    // The note dies: the shake back to 0.3 of the threshold, the shaker still on (Night Sea's
    // quiet bass). Under the drive the wave rings down at its damping less the pump, about 0.6
    // per second, and the sea must go dark with it.
    await lab.step(240, shaken(shakeAc * 0.3, { glowRecharge: 0.5 }));
    g = await glowOf().read();
    r.ringMax = Math.max(...g.light);
    await fresh();
    await lab.step(240, shaken(shakeG, { glowShear: 300, glowRecharge: 0.5 }));
    g = await glowOf().read();
    r.highSpent = spent(g).reduce((t, v) => t + v, 0) / (n * n);

    /*
      A known wave, the kernel alone: a fresh glow grid stepped once by hand on a still plate's
      flow and gap with a field written here, u = A cos(k x), so its derivatives are exact and
      the reference below can use them (and ω = π · 30, half the drive, as a fixed number)
      rather than the kernel's stencil.
    */
    await fresh();
    await lab.step(2, P());
    {
      const sv = lab.solver(), dev = sv.device, gp = glowOf();
      const wn = 256, A = knownA, k = knownK;
      const h = new Float32Array(wn * wn);
      for (let j = 0; j < wn; j++) for (let i = 0; i < wn; i++) h[j * wn + i] = A * Math.cos(k * (((i + 0.5) / wn) - 0.5) * 0.2);
      const buf = dev.createBuffer({ size: h.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      dev.queue.writeBuffer(buf, 0, h);
      gp.reset();
      const enc = dev.createCommandEncoder();
      gp.step(enc, 1 / 60, sv.ride(), sv.squeeze.read, 0, glowTh, 8, { h: buf, n: wn }, shakeHz);
      dev.queue.submit([enc.finish()]);
      const kg = await gp.read();
      buf.destroy();
      // One row through the middle, away from the grid's wrap: the firing share, light over charge.
      r.knownRow = Array.from({ length: wn }, (_, i) => kg.lit[(wn >> 1) * wn + i] / Math.max(1e-6, kg.charge[(wn >> 1) * wn + i]));
    }
    return r;
  }, { shakeHz: SHAKE_HZ, shakeG: SHAKE_G, shakeAc: SHAKE_AC, glowTh: GLOW_TH, knownA: KNOWN_A, knownK: F.faradayK(SHAKE_HZ) });
} finally {
  await close();
}

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
console.log(`glow: still max ${f(o.stillMax, 6)} min charge ${f(o.stillMinCharge)}; stroke peak ${f(o.peak1)} brightest ${f(o.lightMax)}; spent band ${f(o.spentBand)} mirror ${f(o.spentMirror, 5)} far ${f(o.spentFar, 5)} drift ${f(o.spentDrift, 5)} (low threshold ${f(o.spentDriftLow)}); second ${f(o.peak2)} (${f(o.peak2 / o.peak1, 2)}×); control ${f(o.ctl1)} then ${f(o.ctl2)} (${f(o.ctl2 / o.ctl1, 2)}×); picture band ${f(o.picBand, 2)} mirror ${f(o.picMirror, 2)} far ${f(o.picFar, 2)}`);
check('a still plate is dark and keeps its charge', o.stillMax < 1e-4 && o.stillMinCharge > 0.999, `brightest ${f(o.stillMax, 6)}, lowest charge ${f(o.stillMinCharge)}`);
check('a stroke lights (its band glows)', o.peak1 > 0.02, `band peak ${f(o.peak1)}`);
check('the stroke spends charge along its path, not far from it', o.spentBand > 0.01 && o.spentBand > 10 * o.spentFar, `band ${f(o.spentBand)} far ${f(o.spentFar, 5)}`);
check('and not in its mirror (a flow read upside down)', o.spentBand > 10 * o.spentMirror, `band ${f(o.spentBand)} mirror ${f(o.spentMirror, 5)}`);
check('a drift under the threshold spends almost nothing', o.spentDrift < o.spentBand / 20, `drift ${f(o.spentDrift, 5)} vs stroke ${f(o.spentBand)}`);
check('control: that drift under a threshold twenty times lower does spend', o.spentDriftLow > o.spentBand / 2, `drift ${f(o.spentDriftLow)} vs stroke ${f(o.spentBand)}`);
check('a second stroke within the recharge glows less', o.peak2 < 0.97 * o.peak1, `${f(o.peak2)} vs ${f(o.peak1)}`);
check('stroked again and again, the sea tires (each pass dimmer, the fifth under 0.85)', o.peaks.every((v, k) => k === 0 || v < o.peaks[k - 1]) && o.peaks[4] < 0.85 * o.peaks[0], o.peaks.map((v) => f(v, 3)).join(' → '));
check('control: rested past a short recharge, the second glows as the first', Math.abs(o.ctl2 / o.ctl1 - 1) < 0.02, `${f(o.ctl2)} vs ${f(o.ctl1)}`);
check('turned off, the glow goes', !o.keptOff, '');
check('off from the start, no glow is made', !o.madeOff, '');
check('the plate draws the glow blue in the band', o.picBand > 2, `blue−red up ${f(o.picBand, 2)} of 255`);
check('and not in its mirror (a picture drawn upside down)', Math.abs(o.picMirror) < o.picBand / 10, `mirror ${f(o.picMirror, 2)}`);
check('and not far from it', Math.abs(o.picFar) < Math.max(0.2, o.picBand / 10), `far ${f(o.picFar, 2)}`);
check('control: the plate drawn twice at 0 is the same bytes', o.picSame, '');

/*
  6's reference share, worked out here from the wave's field and not by the
  kernel's closed form: the linear wave's strain sampled at a thousand
  heights through the layer, and the floor's Stokes layer (a twentieth of
  the depth at 30 Hz) at its own envelope. A height fires if either passes
  the threshold there.
*/
const shareOf = (h, n, flip, transpose = false) => {
  const k = F.faradayK(SHAKE_HZ), w = F.faradayOmega(k), d = F.FARADAY_DEPTH, nu = F.FARADAY_NU, th = GLOW_TH;
  const dx = 0.2 / n, sh = Math.sinh(k * d), delta = Math.sqrt((2 * nu) / w), LEVELS = 1000;
  const at = (i0, j0) => {
    const i = transpose ? j0 : i0, j = transpose ? i0 : j0, jj = flip ? n - 1 - j : j;
    return h[(((jj % n) + n) % n) * n + (((i % n) + n) % n)];
  };
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = at(i, j), e = at(i + 1, j), ww = at(i - 1, j), s = at(i, j + 1), q = at(i, j - 1);
    const uxx = (e - 2 * u + ww) / (dx * dx), uyy = (s - 2 * u + q) / (dx * dx);
    const uxy = (at(i + 1, j + 1) - at(i + 1, j - 1) - at(i - 1, j + 1) + at(i - 1, j - 1)) / (4 * dx * dx);
    const gx = (e - ww) / (2 * dx), gy = (s - q) / (2 * dx);
    const wall = ((w / k) * Math.hypot(gx, gy) / sh) * Math.sqrt(w / nu);
    let fire = 0;
    for (let l = 0; l < LEVELS; l++) {
      const z = ((l + 0.5) / LEVELS) * d;
      const C = Math.cosh(k * z) / sh, S = Math.sinh(k * z) / sh;
      const exx = (w / k) * C * uxx, eyy = (w / k) * C * uyy, exy = (w / k) * C * uxy, ezz = w * k * C * u;
      const exz = w * S * gx, eyz = w * S * gy;
      const rate = Math.sqrt(2 * (exx * exx + eyy * eyy + ezz * ezz + 2 * exy * exy + 2 * exz * exz + 2 * eyz * eyz));
      if (rate > th || wall * Math.exp(-z / delta) > th) fire++;
    }
    out[j * n + i] = fire / LEVELS;
  }
  return out;
};
const corr = (a, b, keep) => {
  let m = 0, sa = 0, sb = 0;
  for (let k = 0; k < a.length; k++) if (keep[k]) { m++; sa += a[k]; sb += b[k]; }
  const ma = sa / m, mb = sb / m;
  let ab = 0, aa = 0, bb = 0;
  for (let k = 0; k < a.length; k++) if (keep[k]) { const x = a[k] - ma, y = b[k] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return { r: ab / Math.sqrt(aa * bb), ma, mb, n: m };
};
{
  const { h, n } = o.wave;
  const want = shareOf(h, n, false), flipped = shareOf(h, n, true), turned = shareOf(h, n, false, true);
  // The cells' firing share now: their light over their charge (a firing cell's light is its share times its charge, wgsl/glow.ts).
  const got = o.shakenLit.map((L, k) => L / Math.max(1e-6, o.shakenCharge[k]));
  const keep = o.shakenCharge.map((c) => c > 0.05);
  const cs = corr(got, want, keep), cf = corr(got, flipped, keep), ct = corr(got, turned, keep);
  // How many cells the share is a share in, not all or nothing: r must come from the strain's shape, not the nodal lines.
  let mid = 0, kept = 0;
  for (let k = 0; k < want.length; k++) if (keep[k]) { kept++; if (want[k] > 0.05 && want[k] < 0.95) mid++; }
  /*
    The known wave, worked by hand: u = A cos(k x), so at phase θ = k x the Hessian is
    −k²A cos θ along x and the gradient −kA sin θ; with ω = π · 30 exactly, the strain's
    amplitude at height ζ is 2ωkA √(cos²θ cosh²kζ + sin²θ sinh²kζ) / sinh kd (the textbook deep
    limit, 2ωkA at a crest, is this at ζ = d, kd large), and the floor's Stokes layer shears at
    ωA |sin θ| √(ω/ν) / sinh kd. Its share of the depth at a thousand heights, cell by cell along
    the middle row, against the kernel's.
  */
  const kk = F.faradayK(SHAKE_HZ), om = Math.PI * SHAKE_HZ, dd = F.FARADAY_DEPTH, nu = F.FARADAY_NU, shd = Math.sinh(kk * dd), delta = Math.sqrt((2 * nu) / om);
  const handShare = (theta) => {
    let fire = 0;
    const wall = (om * KNOWN_A * Math.abs(Math.sin(theta)) * Math.sqrt(om / nu)) / shd;
    for (let l = 0; l < 1000; l++) {
      const z = ((l + 0.5) / 1000) * dd;
      const rate = (2 * om * kk * KNOWN_A * Math.hypot(Math.cos(theta) * Math.cosh(kk * z), Math.sin(theta) * Math.sinh(kk * z))) / shd;
      if (rate > GLOW_TH || wall * Math.exp(-z / delta) > GLOW_TH) fire++;
    }
    return fire / 1000;
  };
  let knownErr = 0, crest = { got: 0, want: 0 }, node = { got: 0, want: 1, d: 9 };
  for (let i = 8; i < n - 8; i++) {
    const theta = kk * (((i + 0.5) / n) - 0.5) * 0.2, wantK = handShare(theta), gotK = o.knownRow[i];
    knownErr = Math.max(knownErr, Math.abs(gotK - wantK));
    if (i === n / 2) crest = { got: gotK, want: wantK };
    const dn = Math.abs(Math.cos(theta));
    if (dn < node.d) node = { got: gotK, want: wantK, d: dn };
  }
  console.log(`glow known wave (A ${KNOWN_A * 1e3} mm, ω π·30): crest ${f(crest.got)} vs hand ${f(crest.want)}, nearest node ${f(node.got)} vs hand ${f(node.want)}, worst cell ${f(knownErr)}; shares strictly between 0.05 and 0.95: ${mid} of ${kept}; transposed r ${f(ct.r, 3)}; after the note ${f(o.ringMax, 5)} (lit ${f(o.shakenMax)})`);
  console.log(`glow shaken (${SHAKE_HZ} Hz, threshold ${f(SHAKE_AC, 3)} g): below it max ${f(o.belowMax, 6)} min charge ${f(o.belowMinCharge)}; at ${SHAKE_G} g spent ${f(o.shakenSpent)} (Glow Shear ×10: ${f(o.highSpent, 5)}); share mean ${f(cs.ma)} vs reference ${f(cs.mb)}, r ${f(cs.r, 3)} (upside down ${f(cf.r, 3)}); after the note ${f(o.ringMax, 5)}`);
  check('shaken under the wave\'s threshold, the sea stays dark and charged', o.readCells === 256 * 256 && o.belowMax < 1e-4 && o.belowMinCharge > 0.999, `brightest ${f(o.belowMax, 6)}, lowest charge ${f(o.belowMinCharge)} over ${o.readCells} cells`);
  check('shaken past it, the standing wave lights the sea', o.shakenSpent > 0.01, `mean spent ${f(o.shakenSpent)}`);
  check('it lights where the wave strains the water (cell by cell against the depth-sampled share)', cs.r > 0.9, `r ${f(cs.r, 3)} over ${cs.n} cells`);
  check('and the share is a share there, not all or nothing (a fifth of the cells strictly between)', mid > 0.2 * kept, `${mid} of ${kept}`);
  check('and as much of the depth as the wave strains past the threshold (mean within 15%)', Math.abs(cs.ma / cs.mb - 1) < 0.15, `${f(cs.ma)} vs ${f(cs.mb)}`);
  check('and not the wave read upside down, nor turned on its side', Math.abs(cf.r) < 0.5 && Math.abs(ct.r) < 0.5, `upside down r ${f(cf.r, 3)}, transposed r ${f(ct.r, 3)}`);
  check('a known wave, A cos kx, lights as the hand-worked strain says, cell by cell (within 0.03 of the depth)', knownErr < 0.03 && crest.want > 0.2 && crest.want < 0.8, `crest ${f(crest.got)} vs ${f(crest.want)}, node ${f(node.got)} vs ${f(node.want)}, worst ${f(knownErr)}`);
  check('the threshold holds for the wave too: ten times the Glow Shear spends under a tenth', o.highSpent < o.shakenSpent / 10, `${f(o.highSpent, 5)} vs ${f(o.shakenSpent)}`);
  check('the note dies (the shake under the threshold, the shaker on): the wave rings down and the sea goes dark in four seconds', o.shakenMax > 0.1 && o.ringMax < 1e-3, `lit ${f(o.shakenMax)}, then ${f(o.ringMax, 5)}`);
}
console.log(`${passed} passed, ${failed} failed`);

process.exit(failed ? 1 : 0);
