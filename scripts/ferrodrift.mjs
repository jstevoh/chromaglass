#!/usr/bin/env node
/**
 * Does the ferrofluid poured round Classic's middle stay where it was poured
 * while the band plays?
 *
 *   npm run ferrodrift
 *
 * Found by #238 (PLAN.md, "with the band playing, the ferrofluid poured round
 * Classic's middle drifts into it"): with the band playing, the disc 0.12
 * round the middle went from 0.180 to 0.501 of black in nine seconds on the
 * Mac, against 0.099 to 0.084 in silence, and nothing in the lab moved it.
 * #230 took that pour out of the Magnet's pick and the line out of
 * `npm run magnet`, so no check watched it after.
 *
 * So this pours the look's ring the way a performer does now (Ferrofluid
 * turned up on a bare plate pours the look's own shape, LiquidVisualizer
 * "Ferrofluid turned up on a plate that has none"), with the band started by
 * the page's first click, and watches the disc round the middle, the
 * ferrofluid's mean distance from the middle, and the flow under it, on
 * several pages that each take one thing away, so a run says which one it is.
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';

const PORT = 4347;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

/*
  The pages. Each is Classic with its ring poured and watched for twelve
  seconds; all but the first with the band let start, and each of the rest
  with one of the things the band reaches taken away.
*/
const VARIANTS = [
  { name: 'silence', band: false, set: {} },
  { name: 'band', band: true, set: {} },
  { name: 'band, no bubbles', band: true, set: { bubbles: 0 } },
  { name: 'band, no centre gravity', band: true, set: { centerGravity: 0 } },
  { name: 'band, Audio Impact 0', band: true, set: { audioImpact: 0 } },
  { name: 'band, Tempo Sync 0', band: true, set: { tempoSync: 0 } },
  { name: 'band, no vibration', band: true, set: { vibrationFrequency: 0 } },
];
const only = process.env.DRIFT_ONLY ? process.env.DRIFT_ONLY.split(',') : null;

const browser = await launchChromium(chromium);
const results = [];
try {
  for (const v of VARIANTS) {
    if (only && !only.includes(v.name)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
    if (!v.band) {
      await page.addInitScript(() => {
        try { localStorage.setItem('chromaglass-audio-source', 'none'); } catch { /* none */ }
      });
    }
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&sim=256${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
    if (!isGpuEngine(engine)) {
      check(`${v.name}: the GPU solver is the one being measured`, false, engine ?? 'no debug hook');
      await page.close();
      continue;
    }

    /** The ferrofluid: the disc 0.12 round the middle (its mean), the whole plate's share, its mean distance from the middle, and the flow it sits in, toward the middle. */
    const read = () => page.evaluate(async () => {
      const d = window.chromaglassDebug();
      const f = await d.readPhase();
      if (!f) return null;
      const { n, data } = f;
      let total = 0, disc = 0, discCells = 0, rsum = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = data[x + y * n];
        const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5);
        total += v; rsum += v * r;
        if (r < 0.12) { disc += v; discCells++; }
      }
      // The flow under the ferrofluid, on the plate's CPU copy (grid G):
      // its speed toward the middle, weighted by the ferrofluid there.
      const fl = d.fluids?.[0];
      const vx = fl?.readVx, vy = fl?.readVy;
      let inward = 0, speed = 0, w = 0;
      if (vx && vy) {
        const G = Math.round(Math.sqrt(vx.length));
        for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) {
          const p = data[x + y * n];
          if (p < 0.05) continue;
          const gx = Math.min(G - 1, Math.floor((x + 0.5) / n * G)), gy = Math.min(G - 1, Math.floor((y + 0.5) / n * G));
          const ux = vx[gx + gy * G], uy = vy[gx + gy * G];
          const dx = (x + 0.5) / n - 0.5, dy = (y + 0.5) / n - 0.5, r = Math.hypot(dx, dy) || 1;
          inward += p * -(ux * dx + uy * dy) / r; speed += p * Math.hypot(ux, uy); w += p;
        }
      }
      const st = fl?.lastStep;
      return {
        n, disc: disc / Math.max(1, discCells), total: total / (n * n), r: total ? rsum / total : 0,
        inward: w ? inward / w : 0, speed: w ? speed / w : 0,
        dt: st ? +st.dt : 0, tempo: fl?.tempoMul ?? 1,
        bubbles: d.bubbles?.bubbles?.length ?? -1, kicks: d.kicks?.() ?? -1,
        band: typeof window.__band === 'function',
      };
    });

    // The first click (in the corner, off the plate's middle) starts the band where it is let.
    await page.mouse.click(5, 5);
    await page.evaluate((set) => Object.assign(window.chromaglassDebug().settings, set), v.set);
    await page.waitForTimeout(500);
    const laysBefore = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    await page.evaluate(() => { window.chromaglassDebug().settings.phaseAmount = 0.6; });
    await page.waitForTimeout(600);
    const laysAfter = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    const series = [];
    for (let t = 0; t <= 12; t += 1.5) {
      const s = await read();
      series.push({ t, ...s });
      if (t < 12) await page.waitForTimeout(1500);
    }
    const first = series[0], last = series[series.length - 1];
    console.log(`  ${v.name}: poured ${laysAfter - laysBefore} time(s); grid ${first?.n} → ${last?.n}; band ${last?.band ? 'playing' : 'off'}, ${last?.kicks} kicks`);
    for (const s of series) {
      if (!s) { console.log('     (no phase read)'); continue; }
      console.log(`     t=${s.t.toFixed(1).padStart(4)} s  disc ${s.disc.toFixed(3)}  plate ${(s.total * 100).toFixed(2)}%  r ${s.r.toFixed(3)}  ` +
        `inward ${(s.inward * 1e3).toFixed(3)}  speed ${(s.speed * 1e3).toFixed(3)} (thousandths)  dt ${s.dt.toFixed(5)}  tempo ${s.tempo.toFixed(2)}  bubbles ${s.bubbles}`);
    }
    results.push({ v, first, last, poured: laysAfter - laysBefore });
    await page.close();
  }
} finally {
  await browser.close();
}

const by = (name) => results.find(r => r.v.name === name);
const band = by('band');
if (band?.first && band?.last) {
  check('with the band playing, the ferrofluid poured round the middle does not gather into it',
    band.poured === 1 && band.first.n === band.last.n && band.last.disc < Math.max(0.2, band.first.disc * 1.5),
    `the disc 0.12 round the middle ${band.first.disc.toFixed(3)} → ${band.last.disc.toFixed(3)} in twelve seconds, mean distance ${band.first.r.toFixed(3)} → ${band.last.r.toFixed(3)}`);
} else if (!only) {
  check('with the band playing, the ferrofluid poured round the middle does not gather into it', false, 'no reading');
}
const failed = checks.filter(c => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
