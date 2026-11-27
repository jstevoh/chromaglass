#!/usr/bin/env node
/**
 * Is a light press's bowl round, or the 192² grid's facets?
 *
 *   npm run pressfacets
 *
 * What was reported: with the Press tool's Amount low on its slider, the
 * pressed patch looked pixelated. What was found: on a thin gap the press
 * laid its bowl in the glass, −3·amount·(1 − d²/R²)², on the CPU's 192²
 * grid at a rounded centre, and the bilinear upsample carried it to the
 * solver's 384² (512² at gpu=high) as flat facets meeting at creases. A
 * hard press reaches the gap's floor, which flattens the bowl into a
 * plateau and hides them; a light one never does, so the creases are the
 * whole picture. PLAN 18a-14.
 *
 * What this measures: the gap read at the solver's own resolution
 * (`readSqueeze`) just before and just after one light press at a
 * fractional centre, δ = before − after, which is the bowl plus whatever
 * the plate did meanwhile. A clamped glass under a press bends as a smooth
 * bowl, so its Laplacian varies over the bowl's whole radius and blurring
 * that Laplacian by one CPU cell (σ = n/L) barely changes it. Facets put
 * their curvature on creases one CPU cell apart, zero between them, so the
 * blur takes most of it away. "creases" is rms(lap − blur(lap)) over
 * rms(blur(lap)) inside the bowl.
 *
 * It pins the grid at 512² (PRESS_RES to change it), where the upsample
 * is by 8/3 and the creases fall unevenly: measured on main, creases 0.70
 * to 0.73 there against 0.04 to 0.10 at gpu=mid (384², an even 2×, where
 * the relaxation between press and read has mostly rounded them). A row
 * of main's δ at gpu=high has a second difference that goes 0, −3.6,
 * −0.7, −0.7, −3.4, 0 … (×1e-6), the creases; the fine bowl's goes
 * smoothly −1.5, −1.6, −1.6. The pass mark, 0.3, sits between.
 *
 * The plate is slowed (globalSpeed) so its own motion between the reads is
 * small beside the bowl, and the same reads are taken with no press as a
 * control: the bowl must be about as deep as the press asked for and stand
 * well above that control, or the ratio is noise.
 */
import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = port(4361);
const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

/** The 5-point Laplacian of f (n×n), zero on the border. */
function lap(f, n) {
  const l = new Float64Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = x + y * n;
    l[i] = f[i - 1] + f[i + 1] + f[i - n] + f[i + n] - 4 * f[i];
  }
  return l;
}

/** RMS of f over the cells where mask is set. */
function rms(f, mask) {
  let s = 0, k = 0;
  for (let i = 0; i < f.length; i++) if (mask[i]) { s += f[i] * f[i]; k++; }
  return Math.sqrt(s / Math.max(k, 1));
}

/** A separable Gaussian blur of f, σ in cells. */
function blur(f, n, sigma) {
  const r = Math.ceil(3 * sigma), w = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(v); sum += v; }
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  const a = new Float64Array(n * n), b = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += w[i + r] * f[Math.min(n - 1, Math.max(0, x + i)) + y * n];
    a[x + y * n] = s;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += w[i + r] * a[x + Math.min(n - 1, Math.max(0, y + i)) * n];
    b[x + y * n] = s;
  }
  return b;
}

const browser = await launchChromium(chromium);
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=${process.env.PRESS_GPU || "high"}&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  // The solver's grid is pinned, not left to the governor. 'auto' steps the
  // grid down when the GPU is busy: on a quiet Mac gpu=high opened at 512²,
  // and with the owner's own app open beside the run it opened at 384²,
  // where main's creases mostly relax away in the read's 30 ms and the
  // check could no longer tell main from the fix. A pin is what the
  // settings offer for this (Perform's grid control), so the read is at
  // the grid it names whatever else the machine is doing.
  const res = +(process.env.PRESS_RES || 512);
  await page.evaluate((res) => {
    const d = window.chromaglassDebug();
    d.settings.simResolution = res;
    d.settings.automateRate = 0;
    d.settings.globalSpeed = 0.004;
    d.settings.fingering = 0;
  }, res);
  await page.waitForTimeout(3000);

  const thin = await page.evaluate(() => window.chromaglassDebug().fluids[0].thinGap);
  check('the plate runs as a thin gap (the press lays a bowl in the glass)', thin);

  const L = await page.evaluate(() => window.chromaglassDebug().gridSize);
  // At gpu=mid main's creases read 0.04 to 0.10, under the pass mark: the
  // check tells main from the fix only at 512², so a device that falls back
  // to a smaller solver must fail here, not pass on a resolution that
  // cannot see the facets.
  {
    const f = await page.evaluate(async () => (await window.chromaglassDebug().readSqueeze())?.n ?? 0);
    const want = res;
    check(`the solver runs at the pinned ${res}², where facets read`, f === want, `n ${f}`);
  }
  const read = () => page.evaluate(async () => {
    const f = await window.chromaglassDebug().readSqueeze();
    return f ? { n: f.n, gap: Array.from(f.gap) } : null;
  });

  /**
   * One press of the tool's outer disc at a centre between cells, the way
   * a pointer lands, or none for the control. Returns δ, its bowl's peak
   * and the Laplacian ratio.
   */
  // The press lands between cells, the way a pointer does; applySquish
  // takes cell indices and adds half a cell for the centre, so the mask
  // centre is the press's point plus 0.5.
  const FX = 0.37, FY = -0.21;
  const trial = async (radius, amount, ox = 0, oy = 0) => {
    const a = await read();
    if (!a) return null;
    if (amount > 0) await page.evaluate(([cx, cy, r, am]) => window.chromaglassDebug().fluids[0].applySquish(cx, cy, r, am, 0, false), [L / 2 + ox + FX, L / 2 + oy + FY, radius, amount]);
    // The glass springs back within a few hundred ms of one press (measured:
    // the bowl reads 4.8e-4 30 ms after a press of 3.6e-4 and is gone by
    // 250 ms), and that relaxation is itself a diffusion that rounds the
    // facets off, so the read is taken at once: what a held press shows,
    // where the bowl is laid again every step. The wait is in wall time,
    // not solver steps (no hook steps the solver by hand): a slow machine
    // runs fewer relaxation steps in it, which only keeps more of main's
    // creases, and the bowl-depth check catches a read taken before the
    // press reached the GPU.
    await page.waitForTimeout(30);
    const b = await read();
    const n = a.n, s = n / L;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) d[i] = a.gap[i] - b.gap[i];
    // radius in the CPU's cells is radius·GRID_SCALE, GRID_SCALE = L/128
    const Rs = radius * (L / 128) * s, cx = (L / 2 + ox + FX + 0.5) * s, cy = (L / 2 + oy + FY + 0.5) * s;
    const mask = new Uint8Array(n * n);
    let peak = 0, lo = Infinity, rest = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r < 0.85 * Rs) { mask[x + y * n] = 1; peak = Math.max(peak, d[x + y * n]); lo = Math.min(lo, b.gap[x + y * n]); rest = Math.max(rest, a.gap[x + y * n]); }
    }
    // The crease measure: how much of the bowl's curvature sits at the
    // scale of one CPU cell. A smooth bowl's Laplacian varies over its whole
    // radius, so blurring the Laplacian by one CPU cell barely changes it;
    // facets put it all on creases one CPU cell apart (between them it is
    // zero), so what the blur takes away is most of it.
    const l = lap(d, n), lb = blur(l, n, s);
    const resid = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) resid[i] = l[i] - lb[i];
    const raw = rms(l, mask);
    return { n, peak, lo, rest, raw, ratio: rms(resid, mask) / Math.max(rms(lb, mask), 1e-12) };
  };

  // Each press on glass of its own (a quadrant), so no bowl lands in another's.
  const spots = [[-L / 4, -L / 4], [L / 4, -L / 4], [-L / 4, L / 4], [L / 4, L / 4]];
  let spot = 0;
  for (const amount of [0.004 * 0.09, 0.004 * 0.25]) {
    const quiet = await trial(30, 0);
    for (const radius of [16, 8]) {
      const [ox, oy] = spots[spot++];
      const t = await trial(radius, amount, ox, oy);
      if (!t || !quiet) { check(`a press of radius ${radius} at Amount ${amount}`, false, 'no squeeze field to read'); continue; }
      console.log(`     amount ${amount.toExponential(2)} radius ${radius} (n ${t.n}): bowl ${t.peak.toExponential(2)} (gap ${t.rest.toExponential(2)} to ${t.lo.toExponential(2)}), ` +
        `curvature ${t.raw.toExponential(2)} (no press: ${quiet.raw.toExponential(2)}), creases ${t.ratio.toFixed(2)}`);
      // The bowl's depth at its centre is 3·amount (Stefan's law gives back
      // nearly that on a gap this thick); a third of it means the read caught
      // the bowl, not the plate's own drift (no press: quiet.peak).
      check(`a light press's bowl is in the read (radius ${radius})`, t.peak > amount && t.peak > 10 * quiet.peak,
        `bowl ${t.peak.toExponential(2)} against 3·amount ${(3 * amount).toExponential(2)}, no press ${quiet.peak.toExponential(2)}`);
      // A press that reaches the gap's floor flattens into a plateau and
      // hides the creases, so the light press must stay well off it (the
      // floor is far below half the resting gap).
      check(`a light press stays off the gap's floor (radius ${radius})`, t.lo > 0.5 * t.rest,
        `gap ${t.rest.toExponential(2)} to ${t.lo.toExponential(2)}`);
      // An empty δ scores 0, so roundness counts only with the bowl there.
      check(`it is round, not the 192² grid's facets (radius ${radius})`, t.peak > amount && t.ratio < 0.3,
        `creases ${t.ratio.toFixed(2)}; main's facets read 0.70 and up`);
    }
  }
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  stop();
}
const bad = checks.filter(c => !c.ok).length;
console.log(`\n${bad || failed ? `${bad} failed` : 'all passed'}`);
process.exit(bad || failed ? 1 : 0);
