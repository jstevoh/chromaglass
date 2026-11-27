#!/usr/bin/env node
/**
 * Free-surface and oil-layer height h on the solver grid (PLAN 31s-1).
 *
 *   PW_WEBGPU=1 npm run surfaceheight
 *   PW_WEBGPU=1 npm run surfaceheight -- --no-level   (control: fails with levelling off)
 *
 * Verifies against the thin-film lubrication equation:
 *   dh/dt = div( h^3 / (3 mu) grad(p) ),   p = -sigma lap(h) + rho g h
 *
 *   (a) Still oil lens keeps the meniscus profile set by capillary length
 *       sqrt(sigma / (rho g)) within 10%.
 *   (b) Sine ripple of wavenumber k on a layer h0 decays on
 *       tau = 3 mu / (h0^3 (sigma k^4 + rho g k^2)) within 15% at two k,
 *       tested across 256^2 and 384^2 at 60 Hz and 30 Hz (printing ms/step).
 *   (c) Total of h is conserved to within 0.1% over 600 steps with flow running.
 */
import { performance } from 'node:perf_hooks';
import { openLab } from './lab.mjs';

const levelOn = !process.argv.includes('--no-level');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const L = 0.2;
const G = 9.81;
const OIL_MU = 0.049;
const OIL_SIGMA = 0.033;
const OIL_RHO = 920;
const LC = Math.sqrt(OIL_SIGMA / (OIL_RHO * G));

function i0(x) {
  let sum = 1;
  let term = 1;
  const y = 0.25 * x * x;
  for (let k = 1; k < 48; k++) {
    term *= y / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

const { page, close } = await openLab();
try {
  // ── (a) Still oil lens meniscus profile (256^2, 60 Hz) ──
  await page.evaluate(async (levelOn) => {
    await lab.create(256);
    lab.surfaceLevelling(levelOn);
    lab.solver().addMix(0.5, 0.5, 0.2, { oil: 1 });
    await lab.step(120, { dt: 0, advection: 0, magnetSeconds: 1 / 60, oilTension: 0 });
  }, levelOn);
  const lens = await page.evaluate(() => lab.surfaceHeight());
  const nLens = lens.n;
  const dxLens = L / nLens;
  const mid = nLens >> 1;
  let lastI = mid;
  for (let i = mid; i < nLens; i++) {
    if (lens.data[mid * nLens + i] > 0) lastI = i;
  }
  const rEff = (lastI + 1.5) * dxLens - 0.5 * L;
  const hCenter = lens.data[mid * nLens + mid];
  const hInf = hCenter / (1 - 1 / i0(rEff / LC));
  let rmsErr = 0;
  let maxErr = 0;
  let count = 0;
  for (let i = mid; i <= lastI; i++) {
    const r = (i + 0.5) * dxLens - 0.5 * L;
    const exact = hInf * (1 - i0(r / LC) / i0(rEff / LC));
    const err = Math.abs(lens.data[mid * nLens + i] - exact) / Math.max(hInf, 1e-9);
    if (err > maxErr) maxErr = err;
    rmsErr += err * err;
    count++;
  }
  rmsErr = Math.sqrt(rmsErr / Math.max(1, count));

  // Best-fit capillary length over the outer meniscus zone (5 * LC).
  let bestLc = 0;
  let bestFitErr = Infinity;
  for (let lMm = 0.1; lMm <= 6.0; lMm += 0.02) {
    const lTry = lMm * 1e-3;
    const hInfTry = hCenter / (1 - 1 / i0(rEff / lTry));
    let sq = 0;
    let mCnt = 0;
    for (let i = mid; i <= lastI; i++) {
      const r = (i + 0.5) * dxLens - 0.5 * L;
      if (r < rEff - 5 * LC) continue;
      const ex = hInfTry * (1 - i0(r / lTry) / i0(rEff / lTry));
      const d = (lens.data[mid * nLens + i] - ex) / Math.max(hInfTry, 1e-9);
      sq += d * d;
      mCnt++;
    }
    if (mCnt > 0 && sq < bestFitErr) {
      bestFitErr = sq;
      bestLc = lTry;
    }
  }
  const lcErr = Math.abs(bestLc - LC) / LC;
  check(
    'still oil lens keeps meniscus profile set by capillary length within 10%',
    rmsErr < 0.10 && maxErr < 0.10 && lcErr < 0.10 && hCenter > 1e-4,
    `lc=${(LC * 1000).toFixed(3)}mm fit=${(bestLc * 1000).toFixed(3)}mm (${(lcErr * 100).toFixed(2)}%) maxErr=${(maxErr * 100).toFixed(2)}% rmsErr=${(rmsErr * 100).toFixed(2)}%`,
  );

  // ── (b) Cosine ripple decay on tau at two wavenumbers k, plus 256^2 & 384^2 at 30/60 Hz ──
  const runWave = async (N, kMode, steps, hz) => {
    const dtStep = 1 / hz;
    const h0 = 0.0015;
    const amp0 = 0.05 * h0;
    const k = (kMode * Math.PI) / L;
    const dx = L / N;
    const t0 = performance.now();
    await page.evaluate(async ({ N, k, h0, amp0, steps, dtStep, levelOn, OIL_MU, OIL_SIGMA, OIL_RHO }) => {
      await lab.create(N);
      lab.surfaceLevelling(levelOn);
      const dx = 0.2 / N;
      const arr = new Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          arr[j * N + i] = h0 + amp0 * Math.cos(k * (i + 0.5) * dx);
        }
      }
      lab.setSurfaceHeight(arr, {
        oilMu: OIL_MU,
        oilSigma: OIL_SIGMA,
        oilRho: OIL_RHO,
        waterMu: OIL_MU,
        waterSigma: OIL_SIGMA,
        waterRho: OIL_RHO,
      });
      await lab.step(steps, { dt: 0, advection: 0, magnetSeconds: dtStep, oilTension: 0 });
    }, { N, k, h0, amp0, steps, dtStep, levelOn, OIL_MU, OIL_SIGMA, OIL_RHO });
    const elapsed = performance.now() - t0;
    const res = await page.evaluate(() => lab.surfaceHeight());
    let num = 0;
    let den = 0;
    let minVal = Infinity;
    let finite = true;
    const row = N >> 1;
    for (let i = 0; i < N; i++) {
      const hVal = res.data[row * N + i];
      if (!Number.isFinite(hVal)) finite = false;
      if (hVal < minVal) minVal = hVal;
      const c = Math.cos(k * (i + 0.5) * dx);
      num += (hVal - h0) * c;
      den += c * c;
    }
    const ampEnd = num / den;
    const tauTheory = (3 * OIL_MU) / (h0 * h0 * h0 * (OIL_SIGMA * k ** 4 + OIL_RHO * G * k * k));
    const ratio = ampEnd / amp0;
    const tauMeas = ratio > 0 && ratio < 1 ? -(steps * dtStep) / Math.log(ratio) : Infinity;
    const err = Math.abs(tauMeas - tauTheory) / tauTheory;
    return { finite, minVal, tauTheory, tauMeas, err, msPerStep: elapsed / steps };
  };

  const w1 = await runWave(256, 4, 30, 60);
  const w2 = await runWave(256, 10, 15, 60);
  const w3 = await runWave(384, 10, 15, 30);
  const w4 = await runWave(384, 10, 20, 60);
  const w5 = await runWave(256, 4, 15, 30);

  check(
    'sine ripple k1=62.8/m at 256^2 60Hz decays on tau within 15%',
    w1.finite && w1.err < 0.15,
    `tau=${w1.tauTheory.toFixed(4)}s meas=${w1.tauMeas.toFixed(4)}s err=${(w1.err * 100).toFixed(2)}% (${w1.msPerStep.toFixed(1)} ms/step)`,
  );
  check(
    'sine ripple k2=157.1/m at 256^2 60Hz decays on tau within 15%',
    w2.finite && w2.err < 0.15,
    `tau=${w2.tauTheory.toFixed(4)}s meas=${w2.tauMeas.toFixed(4)}s err=${(w2.err * 100).toFixed(2)}% (${w2.msPerStep.toFixed(1)} ms/step)`,
  );
  check(
    'stable and accurate at 384^2 30Hz (and 384^2 60Hz / 256^2 30Hz)',
    w3.finite && w4.finite && w5.finite && w3.err < 0.15 && w4.err < 0.15 && w5.err < 0.15,
    `384@30Hz err=${(w3.err * 100).toFixed(2)}% (${w3.msPerStep.toFixed(1)}ms) 384@60Hz err=${(w4.err * 100).toFixed(2)}% (${w4.msPerStep.toFixed(1)}ms) 256@30Hz=${w5.msPerStep.toFixed(1)}ms`,
  );

  // ── (c) Conservation of total h to 0.1% over 600 steps with flow running ──
  const cons = await page.evaluate(async (levelOn) => {
    await lab.create(256);
    lab.surfaceLevelling(levelOn);
    lab.solver().addMix(0.45, 0.5, 0.14, { oil: 1 });
    const rendered = await lab.render(64);
    const before = await lab.surfaceHeight();
    let sum0 = 0;
    let cx0 = 0;
    for (let j = 0; j < before.n; j++) {
      for (let i = 0; i < before.n; i++) {
        const v = before.data[j * before.n + i];
        sum0 += v;
        cx0 += v * ((i + 0.5) / before.n);
      }
    }
    cx0 /= Math.max(sum0, 1e-12);
    for (let block = 0; block < 10; block++) {
      lab.vel(0.42, 0.48, 0.24, [2.0, 0.6, 0, 0]);
      lab.vel(0.58, 0.52, 0.24, [1.2, -0.4, 0, 0]);
      lab.flush();
      await lab.step(60, { dt: 0.012, advection: 1, magnetSeconds: 1 / 60, oilTension: 0.5, thinGap: 0 });
    }
    const after = await lab.surfaceHeight();
    let sum1 = 0;
    let cx1 = 0;
    let nonZero = 0;
    let finite = true;
    for (let j = 0; j < after.n; j++) {
      for (let i = 0; i < after.n; i++) {
        const v = after.data[j * after.n + i];
        if (!Number.isFinite(v)) finite = false;
        if (v > 0) nonZero++;
        sum1 += v;
        cx1 += v * ((i + 0.5) / after.n);
      }
    }
    cx1 /= Math.max(sum1, 1e-12);
    const frameOk = rendered.length === 64 * 64 * 4 && rendered.every((v) => Number.isFinite(v));
    return { sum0, sum1, relErr: Math.abs(sum1 - sum0) / Math.max(sum0, 1e-12), move: Math.abs(cx1 - cx0), nonZero, finite, frameOk };
  }, levelOn);
  check(
    'total h is kept within 0.1% over 600 steps with flow running',
    cons.finite && cons.frameOk && cons.sum0 > 0 && cons.relErr < 0.001 && cons.move > 0.005,
    `relErr=${(cons.relErr * 100).toFixed(5)}% sum0=${cons.sum0.toFixed(4)} sum1=${cons.sum1.toFixed(4)} cxMove=${cons.move.toFixed(4)}`,
  );
} finally {
  await close();
}

const pass = checks.filter((c) => c.ok).length;
console.log(`\nsurfaceheight: ${pass}/${checks.length} checks passed (levelOn=${levelOn})`);
process.exit(pass === checks.length ? 0 : 1);
