#!/usr/bin/env node
/**
 * Velvet Underground's three pools stay pools (PLAN 28i-7c).
 *
 *   npm run pools
 *
 * Reported on the owner's film of every look (2026-11-11): the frame was the
 * violet ground with one ultramarine lobe and a fleck of red where the seed
 * lays three pools, 83% of it near black; more dye, more exposure, a brighter
 * lamp and another blend left it as it was. Where the dye went, measured in
 * the app on Metal (a probe, five runs on the owner's Mac, PR for 28i-7c):
 * not off the plate (the dish held 0.43 to 0.42 of mean dye for a minute)
 * but out of the pools into a thin veil between them, the magenta glycerine
 * keeping 38% of its dye in 90 s, the dye outside the areas 0.001 to 0.117.
 * Not the regulator, the music, the hands, the rock, the smear, the drip, the
 * air, the surge, the lamp's heat, the buoyancy or the cover glass: each off
 * alone left the drain as it was, and every one of them off at once still
 * drained. Only Advection 0 stopped it, so the solver was making the flow
 * itself, and it was Turbulence: the look never named it, so it ran the
 * default 0.5, a curl noise added to the flow everywhere, every step (forcesB
 * in wgsl/fluid/forces.ts). Off, the pools kept 97%, 96% and 95% over 90 s.
 *
 * So this loads the look as it ships and as it shipped (the same look with
 * the stir put back), and reads the dye inside each of its areas after a
 * minute of show against what was there at the start:
 *
 *   1. each area keeps at least KEEP of its dye as the look ships;
 *   2. with the old stir every area does not: the control, so a check that
 *      read nothing (or a plate that never moves) cannot pass by measuring
 *      a still one twice. If the stir stops draining for some other reason
 *      the control goes red and the check says so, rather than passing on
 *      a bar nothing tests;
 *   3. and the look's plate still moves: the flow inside the areas is not
 *      nothing (a frozen plate, Advection 0, keeps every pool and is not
 *      the fix).
 *
 * Read from the plate's own readback (`fluids[0].readDensity`), in the
 * dish's frame, which is the areas' frame (the motor turns the picture, not
 * the grid; lib/plateAreas.ts). No sound: the drain needed none, and the
 * band's runs read the same to the third decimal.
 */
import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { installFrameReader, engineQuery, isGpuEngine } from './frame.mjs';

const LOOK = 'velvet-underground';
// Velvet's areas, as lib/plateAreas.ts lays them (x, y, r in the dish's units).
const AREAS = [
  { x: 0.26, y: 0.34, r: 0.15 },
  { x: 0.73, y: 0.42, r: 0.14 },
  { x: 0.47, y: 0.73, r: 0.14 },
];
const SECONDS = 60;
/*
  The bar. Off the stir the pools kept 0.974 / 0.959 / 0.947 over 90 s and
  0.982 / 0.967 / 0.960 at 60 s; with it 0.679 / 0.756 / 0.909 at 60 s on
  the same Mac. 0.85 sits under the first with room for a runner's noise and
  over the stirred glycerine and soap by ten points.
*/
const KEEP = 0.85;
// The flow inside the areas, in the solver's velocity units: 0.14 across the plate with the stir off, 0.43 with it.
const MOVING = 0.02;

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = port(4362);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
const run = async (over) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${LOOK}&seed=1${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    await page.evaluate((o) => Object.assign(window.chromaglassDebug().settings, o), over);
    const read = () => page.evaluate((areas) => {
      const d = window.chromaglassDebug(), f = d.fluids[0];
      const a = f.readDensity, S = f.size, vx = f.readVx, vy = f.readVy;
      const inA = areas.map(() => 0); let speed = 0, n = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S, v = (j + 0.5) / S;
        const k = areas.findIndex(r => Math.hypot(u - r.x, v - r.y) < r.r * 1.3);
        if (k < 0) continue;
        inA[k] += a[i + j * S];
        speed += Math.hypot(vx[i + j * S] || 0, vy[i + j * S] || 0); n++;
      }
      return { inA, speed: speed / Math.max(1, n), engine: d.engine, steps: f.stepIndex };
    }, AREAS);
    const first = await read();
    let speed = 0;
    for (let t = 0; t < SECONDS; t += 5) { await page.waitForTimeout(5000); speed += (await read()).speed; }
    const last = await read();
    return { engine: first.engine, kept: last.inA.map((v, k) => v / Math.max(1e-9, first.inA[k])), laid: first.inA, speed: speed / (SECONDS / 5), steps: last.steps - first.steps };
  } finally { await context.close(); }
};

try {
  const ships = await run({});
  if (!isGpuEngine(ships.engine)) {
    console.log(` skip  the plate ran on ${ships.engine || 'no engine'}: this needs the app's GPU solver (the Mac's WebGPU shards)`);
    process.exit(0);
  }
  const stirred = await run({ turbulenceScale: 0.5 });
  const fmt = (r) => r.kept.map(v => (v * 100).toFixed(1) + '%').join(' / ');
  console.log(`     as it ships: ${fmt(ships)} kept over ${SECONDS} s (${ships.steps} steps), flow in the areas ${ships.speed.toFixed(3)}`);
  console.log(`     the old stir (Turbulence 0.5): ${fmt(stirred)} (${stirred.steps} steps), flow ${stirred.speed.toFixed(3)}`);
  check('the plate laid three pools to keep', ships.laid.every(v => v > 1) && stirred.laid.every(v => v > 1),
    `dye in the areas at the start ${ships.laid.map(v => v.toFixed(0)).join(' / ')}`);
  check(`each of Velvet Underground's pools keeps at least ${KEEP * 100}% of its dye over a minute`,
    ships.kept.every(v => v >= KEEP), fmt(ships));
  check('and the old stir does not (the control: this check can tell a draining pool)',
    stirred.kept.some(v => v < KEEP), fmt(stirred));
  check('and the plate still moves (a frozen plate keeps every pool and is not the fix)',
    ships.speed > MOVING && ships.steps > SECONDS * 10, `flow ${ships.speed.toFixed(3)} over ${MOVING}, ${ships.steps} steps`);
} finally { await browser.close(); stop(); }
process.exit(checks.some(c => !c.ok) ? 1 : 0);
