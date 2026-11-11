#!/usr/bin/env node
/**
 * A diagnosis, not a check (PLAN 28i-7c): where do Velvet Underground's pools go?
 *
 *   npm run build && node scripts/velvetprobe.mjs [variant ...]
 *
 * Loads the look in the app (seed 1, no sound), waits for the show, applies one
 * variant's settings, then reads the plate's dye every 3 s for 90 s: the dye
 * inside each of the look's three areas, the dye outside them, the dish's mean
 * against the regulator's target. Each variant turns one suspect off, so the
 * one whose pools hold is the cause. Prints one table per variant and a JSON
 * line per variant at the end.
 */
import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';
import { withBand } from './recorder.mjs';

const VARIANTS = {
  base: {},
  noAuto: { automateRate: 0 },
  noSpin: { rotationSpeed: 0 },
  noRock: { plateRock: 0, platePressure: 0 },
  noSmear: { glassSmear: 0, rainDrip: 0, vibrationFrequency: 0, airVelocity: 0 },
  lamp: { lampGround: 0.06 },
  noDiff: { diffusionRate: 0 },
  noPress: { platePressure: 0 },
  noRockOnly: { plateRock: 0 },
  noGlassSmear: { glassSmear: 0 },
  noDrip: { rainDrip: 0 },
  noVib: { vibrationFrequency: 0 },
  noAir: { airVelocity: 0 },
  noSurge: { surge: 0 },
  noBuoy: { buoyancy: 0 },
  dark: { dimmer: 0 },
  noAdv: { advection: 0 },
  noPolar: { polarity: 0 },
  noGooey: { gooeyEffect: 0 },
  thinCarrier: { viscosity: 'normal' },
  calm: { rotationSpeed: 0, plateRock: 0, platePressure: 0, glassSmear: 0, rainDrip: 0, vibrationFrequency: 0, airVelocity: 0, surge: 0, buoyancy: 0, dimmer: 0, automateRate: 0 },
  noCover: { coverWeight: 0 },
  deep: { liquidMl: 150 },
  noTurb: { turbulenceScale: 0 },
  noTurbSpin: { turbulenceScale: 0, rotationSpeed: 0 },
  noTurbBand: { band: true, turbulenceScale: 0 },
  still: { rotationSpeed: 0, plateRock: 0, platePressure: 0, glassSmear: 0, rainDrip: 0, vibrationFrequency: 0, airVelocity: 0, surge: 0 },
  // With the simulated band (the film's sound): the music's pours and paddles.
  band: { band: true },
  bandNoAuto: { band: true, automateRate: 0 },
  bandBudget: { band: true, dyeBudget: 1.2 },
  bandLamp: { band: true, lampGround: 0.06 },
  bandNoCords: { band: true, sceneMappings: [] },
};
const pick = process.argv.slice(2).filter(a => VARIANTS[a]);
const run = pick.length ? pick : ['base', 'noTurb', 'noTurbSpin', 'noTurbBand'];
const SHOTS = process.env.PROBE_SHOTS || '';
const SECONDS = Number(process.env.PROBE_SECONDS) || 90;
const LOOK = process.env.PROBE_LOOK || 'velvet-underground';
const AREAS = [
  { x: 0.26, y: 0.34, r: 0.15 },
  { x: 0.73, y: 0.42, r: 0.14 },
  { x: 0.47, y: 0.73, r: 0.14 },
];

const PORT = port(4361);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
const out = {};
try {
  for (const name of run) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await installFrameReader(page);
    const { band, ...over } = VARIANTS[name];
    if (band) await withBand(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${LOOK}&seed=1${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    await page.evaluate((over) => Object.assign(window.chromaglassDebug().settings, over), over);
    const read = () => page.evaluate((areas) => {
      const d = window.chromaglassDebug(), f = d.fluids[0];
      const a = f.readDensity, S = f.size, vx = f.readVx, vy = f.readVy;
      const inA = areas.map(() => 0); let outside = 0, dish = 0, cells = 0;
      const vOut = areas.map(() => 0), vMag = areas.map(() => 0), vN = areas.map(() => 0);
      let radial = 0, swirl = 0, speed = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S, v = (j + 0.5) / S;
        if (Math.hypot(u - 0.5, v - 0.5) >= 0.5) continue;
        const x = a[i + j * S]; dish += x; cells++;
        const k = areas.findIndex(r => Math.hypot(u - r.x, v - r.y) < r.r * 1.3);
        if (k >= 0) inA[k] += x; else outside += x;
        const ux = vx[i + j * S] || 0, uy = vy[i + j * S] || 0, rr = Math.hypot(u - 0.5, v - 0.5) || 1;
        radial += (ux * (u - 0.5) + uy * (v - 0.5)) / rr; swirl += (uy * (u - 0.5) - ux * (v - 0.5)) / rr; speed += Math.hypot(ux, uy);
        if (k >= 0) { const ar = areas[k], dd = Math.hypot(u - ar.x, v - ar.y) || 1; vOut[k] += (ux * (u - ar.x) + uy * (v - ar.y)) / dd; vMag[k] += Math.hypot(ux, uy); vN[k]++; }
      }
      return { vOut: vOut.map((v, k) => v / Math.max(1, vN[k])), vMag: vMag.map((v, k) => v / Math.max(1, vN[k])),
        radial: radial / cells, swirl: swirl / cells, speed: speed / cells,
        gap: f.gpu?.coverUnits ?? null, inA: inA.map(v => v / cells), outside: outside / cells, dish: dish / cells,
        mean: f.meanDensity, seedMean: f.seedMean, seedBudget: f.seedBudget, sparse: f.sparseDarkLook,
        dt: f.dt, thin: f.thinGap, steps: f.stepIndex, engine: d.engine };
    }, AREAS);
    const rows = [];
    for (let t = 0; t <= SECONDS; t += 3) {
      if (t) await page.waitForTimeout(3000);
      rows.push({ t, ...(await read()) });
      if (SHOTS && (t === 0 || t + 3 > SECONDS)) await page.screenshot({ path: `${SHOTS}/${name}-${t}s.png` }).catch(() => {});
    }
    const r0 = rows[0];
    console.log(`\n== ${name} ${JSON.stringify(VARIANTS[name])} engine ${r0.engine} seedMean ${r0.seedMean?.toFixed(3)} seedBudget ${r0.seedBudget} sparse ${r0.sparse} dt ${r0.dt?.toFixed(4)} thin ${r0.thin}`);
    console.log('   t   area0   area1   area2   outside  dish   mean   steps');
    for (const r of rows) if (r.t % 15 === 0 || r.t + 3 > SECONDS) console.log(`${String(r.t).padStart(4)}  ${r.inA.map(v => v.toFixed(4)).join('  ')}  ${r.outside.toFixed(4)}  ${r.dish.toFixed(4)} ${(r.mean ?? 0).toFixed(4)} ${r.steps}`);
    console.log('   t   gap     speed    radial    swirl   | pool out-flow (from its centre) | pool speed');
    for (const r of rows) if (r.t % 6 === 0) console.log(`${String(r.t).padStart(4)}  ${(r.gap ?? NaN).toFixed(4)}  ${r.speed.toExponential(2)} ${r.radial.toExponential(2)} ${r.swirl.toExponential(2)} | ${r.vOut.map(v => v.toExponential(2)).join(' ')} | ${r.vMag.map(v => v.toExponential(2)).join(' ')}`);
    const last = rows[rows.length - 1];
    out[name] = { kept: last.inA.map((v, k) => +(v / Math.max(1e-6, r0.inA[k])).toFixed(3)), outside: [r0.outside, last.outside].map(v => +v.toFixed(4)), dish: [r0.dish, last.dish].map(v => +v.toFixed(4)) };
    await context.close();
  }
} finally { await browser.close(); stop(); }
for (const [k, v] of Object.entries(out)) console.log('JSON', k, JSON.stringify(v));
process.exit(0);
