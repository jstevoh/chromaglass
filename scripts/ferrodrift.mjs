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
  seconds, with the band let start or not, and some with the plate's own
  currents held still 2.5 s after the pour the way `npm run magnet` held
  them when #238 read the drift (turbulence, Audio Impact, the rock, Beat
  Squeeze, the heat's lift and the turning off, and an ordinary plate
  clock), so that the band is all that moves the plate. #238 read it before
  #248 turned Thin Gap on in every look, so the old plate is asked too (Thin Gap turned off and waited for
  before the click, as bottles.mjs does).

  The first run (all looks as they are) read the same gathering with the
  band and without it: the disc 0.099 → 0.196 in nine seconds in silence,
  0.088 → 0.184 with the band, 0.104 → 0.255 with no centre gravity, and the
  ferrofluid's mean distance from the middle growing in every one, which is
  the ring spreading both ways, not drifting in.

  The second, held: on the thin gap the band moved nothing in (the disc
  0.097 → 0.082 with it, 0.114 → 0.117 in silence), and on the old plate it
  still did, 0.099 → 0.150 with the mean distance falling 0.310 → 0.298,
  against 0.107 → 0.098 in silence. So the old plate with no bubbles is
  asked here, the band's bubbles being the one thing it does there that a
  held plate keeps.
*/
const HELD = {
  rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0, globalSpeed: 0.025,
};
const VARIANTS = [
  { name: 'held, silence', band: false, held: true, set: {} },
  { name: 'held, band', band: true, held: true, set: {} },
  { name: 'held, silence, old plate', band: false, held: true, set: {}, oldPlate: true },
  { name: 'held, band, old plate', band: true, held: true, set: {}, oldPlate: true },
  { name: 'held, band, old plate, no bubbles', band: true, held: true, set: { bubbles: 0 }, oldPlate: true },
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

    /** The ferrofluid: the disc 0.12 round the middle (its mean), the whole plate's share and its mean distance from the middle. */
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
      const fl = d.fluids?.[0];
      const st = fl?.lastStep;
      return {
        n, disc: disc / Math.max(1, discCells), total: total / (n * n), r: total ? rsum / total : 0,
        dt: st ? +st.dt : 0, tempo: fl?.tempoMul ?? 1,
        bubbles: d.bubbles?.bubbles?.length ?? -1, kicks: d.kicks?.() ?? -1,
        band: typeof window.__band === 'function',
      };
    });

    if (v.oldPlate) {
      await page.evaluate(() => window.chromaglassSettings?.({ thinGap: 0 }));
      for (let k = 0; k < 400 && (await page.evaluate(() => !!window.chromaglassDebug().fluids?.[0]?.thinGap)); k++) await page.waitForTimeout(50);
      const old = await page.evaluate(() => !window.chromaglassDebug().fluids?.[0]?.thinGap);
      if (!old) console.log(`  ${v.name}: the plate was still on a thin gap after 20 s`);
    }

    // The first click (in the corner, off the plate's middle) starts the band where it is let.
    await page.mouse.click(5, 5);
    await page.evaluate((set) => Object.assign(window.chromaglassDebug().settings, set), v.set);
    await page.waitForTimeout(500);
    const laysBefore = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    await page.evaluate(() => { window.chromaglassDebug().settings.phaseAmount = 0.6; });
    await page.waitForTimeout(600);
    const laysAfter = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    if (v.held) {
      await page.waitForTimeout(1900);
      await page.evaluate((held) => {
        const d = window.chromaglassDebug();
        Object.assign(d.settings, held, { audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' } });
      }, HELD);
    }
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
      console.log(`     t=${s.t.toFixed(1).padStart(4)} s  disc ${s.disc.toFixed(3)}  plate ${(s.total * 100).toFixed(2)}%  r ${s.r.toFixed(3)}  dt ${s.dt.toFixed(5)}  tempo ${s.tempo.toFixed(2)}  bubbles ${s.bubbles}`);
    }
    results.push({ v, first, last, poured: laysAfter - laysBefore });
    await page.close();
  }
} finally {
  await browser.close();
}

const by = (name) => results.find(r => r.v.name === name);
const gain = (r) => r?.first && r?.last && r.poured === 1 && r.first.n === r.last.n ? r.last.disc - r.first.disc : null;
const band = by('held, band'), quiet = by('held, silence');
if (!only || (band && quiet)) {
  const gb = gain(band), gq = gain(quiet);
  check('with the band playing, the ferrofluid poured round the middle gathers into it no more than in silence',
    gb !== null && gq !== null && gb < gq + 0.05,
    `the disc 0.12 round the middle ${gb === null ? 'unread' : `${band.first.disc.toFixed(3)} → ${band.last.disc.toFixed(3)}`} with the band, ` +
    `${gq === null ? 'unread' : `${quiet.first.disc.toFixed(3)} → ${quiet.last.disc.toFixed(3)}`} in silence, over twelve seconds`);
}
const failed = checks.filter(c => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
