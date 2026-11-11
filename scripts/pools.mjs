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
 *   3. and the look's plate still moves: the dye inside the areas is
 *      rearranged at least half as much again (cell by cell, |d − d₀| over d₀) as
 *      on the same plate frozen (Advection 0), the second control. A frozen
 *      plate keeps every pool and is not the fix; the flow's speed cannot
 *      tell it, since Advection scales how far the dye is carried and not
 *      the velocity (stepDisplacement), so the frozen plate is run and read.
 *
 * Each run waits for the GPU solver and must keep it (`fluids[0].gpu`, and
 * readbacks landing all the minute: `readDensity` falls back to the CPU's
 * frozen copy if the solver is dropped, which would read as every pool
 * kept), must step about as often as the Mac does, and must still carry the
 * Turbulence it was given when it ends (a look change or a ride hands the
 * plate a new settings object, which would end the override).
 *
 * Read from the plate's own readback (`fluids[0].readDensity`), in the
 * dish's frame, which is the areas' frame (the motor turns the picture, not
 * the grid; lib/plateAreas.ts). No sound: the drain needed none, and the
 * band's runs read the same to the third decimal.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium, port, untilServing } from './chromium.mjs';
import { installFrameReader, engineQuery, waitForEngine } from './frame.mjs';
import { plateAreas } from '../src/lib/plateAreas';

const LOOK = 'velvet-underground';
const AREAS = plateAreas(LOOK).map(({ x, y, r }) => ({ x, y, r }));
const SECONDS = 60;
/*
  The bar. Off the stir the pools kept 98.3 / 96.7 / 96.0% over 60 s (98.4 /
  95.4 / 94.3% on this check's first Mac run); with it 67.2 / 75.5 / 90.9%
  (71.6 / 79.3 / 92.6%). 0.85 sits under the first with room for a runner's
  noise and over the stirred glycerine and soap by ten points. The stirred
  syrup stays over it (it is the pool the stir moves least), so the control
  asks only that some pool drains.
*/
const KEEP = 0.85;
/*
  Steps a run must make: four fifths of thirty a second. The loop's governor
  steps a busy plate at thirty and doubles each step's time (H2b, `dtSeconds`),
  so the plate's own minute is the same at either rate: on the owner's Mac one
  run stepped 3519 times and the next three 1806 each. Fewer than this, and a
  starved runner would read as a plate that kept its pools.
*/
const STEPS = 0.8 * 30 * SECONDS;
/*
  How much more the shipped plate rearranges its pools than the frozen one.
  Frozen still changes cell by cell (the readback's own noise, the sharpening,
  the regulator): 11.0% over the minute on the Mac, against 21.0% as the look
  ships and 70.9% with the old stir. 1.5x sits between with a quarter of room.
*/
const MOVES = 1.5;

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = port(4362);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await untilServing(PORT, { child: server });

const browser = await launchChromium(chromium);
const run = async (name, over) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${LOOK}&seed=1${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    await waitForEngine(page);
    // The GPU solver itself, not its label (a label reads WebGPU while it is still starting).
    for (let t = 0; t < 60; t++) {
      if (await page.evaluate(() => !!window.chromaglassDebug?.().fluids?.[0]?.gpu && window.chromaglassDebug().fluids[0].readbacks > 0)) break;
      await page.waitForTimeout(500);
    }
    await page.evaluate((o) => Object.assign(window.chromaglassDebug().settings, o), over);
    const read = (keep) => page.evaluate(([areas, keep]) => {
      const d = window.chromaglassDebug(), f = d.fluids[0];
      const a = f.readDensity, S = f.size;
      const inA = areas.map(() => 0), cellsA = areas.map(() => 0); let out = 0, cellsOut = 0;
      const pick = keep ? [] : null;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S, v = (j + 0.5) / S;
        if (Math.hypot(u - 0.5, v - 0.5) >= 0.5) continue;
        const k = areas.findIndex(r => Math.hypot(u - r.x, v - r.y) < r.r * 1.3);
        const x = a[i + j * S];
        if (k < 0) { out += x; cellsOut++; continue; }
        inA[k] += x; cellsA[k]++;
        if (pick) pick.push(x);
      }
      return { inA, meanA: inA.map((v, k) => v / Math.max(1, cellsA[k])), meanOut: out / Math.max(1, cellsOut), cells: pick,
        gpu: !!f.gpu, readbacks: f.readbacks, steps: f.stepIndex, turb: f.lastSettings?.turbulenceScale, engine: d.engine };
    }, [AREAS, keep]);
    const first = await read(true);
    let turbHeld = first.turb === over.turbulenceScale, gpuHeld = first.gpu;
    for (let t = 0; t < SECONDS; t += 5) {
      await page.waitForTimeout(5000);
      const r = await read(false);
      turbHeld &&= r.turb === over.turbulenceScale; gpuHeld &&= r.gpu;
    }
    const last = await read(true);
    let moved = 0, laid = 0;
    for (let i = 0; i < first.cells.length; i++) { moved += Math.abs(last.cells[i] - first.cells[i]); laid += first.cells[i]; }
    const r = {
      name, engine: first.engine, kept: last.inA.map((v, k) => v / Math.max(1e-9, first.inA[k])),
      laid: first.meanA, outside: first.meanOut, moved: moved / Math.max(1e-9, laid),
      steps: last.steps - first.steps, readbacks: last.readbacks - first.readbacks, gpuHeld, turbHeld, turb: last.turb,
    };
    console.log(`     ${name}: ${r.kept.map(v => (v * 100).toFixed(1) + '%').join(' / ')} kept over ${SECONDS} s, moved ${(r.moved * 100).toFixed(1)}%, ${r.steps} steps, ${r.readbacks} readbacks, Turbulence ${r.turb}, ${r.engine}`);
    return r;
  } finally { await context.close(); }
};

try {
  const ships = await run('as it ships', { turbulenceScale: 0 });
  const stirred = await run('the old stir', { turbulenceScale: 0.5 });
  const frozen = await run('frozen (Advection 0)', { turbulenceScale: 0, advection: 0 });
  const fmt = (r) => r.kept.map(v => (v * 100).toFixed(1) + '%').join(' / ');
  const runs = [ships, stirred, frozen];
  check('each run is the GPU solver, kept all the minute, its readbacks landing',
    runs.every(r => r.gpuHeld && r.readbacks >= SECONDS * 10),
    runs.map(r => `${r.name} ${r.gpuHeld ? 'gpu' : 'lost its solver'} ${r.readbacks} readbacks`).join('; '));
  check(`each run stepped at least ${STEPS} times (the governed thirty a second, at least)`,
    runs.every(r => r.steps >= STEPS), runs.map(r => `${r.name} ${r.steps}`).join('; '));
  check('each run kept the Turbulence it was given to the end', runs.every(r => r.turbHeld),
    runs.map(r => `${r.name} ${r.turb}`).join('; '));
  check('the plate laid three pools on a dark ground (each area ten times the dye between them)',
    runs.every(r => r.laid.every(m => m > 10 * r.outside && m > 0.05)),
    `${ships.laid.map(v => v.toFixed(3)).join(' / ')} against ${ships.outside.toFixed(4)} between`);
  check(`each of Velvet Underground's pools keeps at least ${KEEP * 100}% of its dye over a minute`,
    ships.kept.every(v => v >= KEEP), fmt(ships));
  check('and the old stir does not (the control: this check can tell a draining pool)',
    stirred.kept.some(v => v < KEEP), fmt(stirred));
  check(`and the plate still moves: its pools rearranged at least ${MOVES}x as much as frozen (the second control)`,
    ships.moved > MOVES * frozen.moved, `${(ships.moved * 100).toFixed(1)}% against ${(frozen.moved * 100).toFixed(1)}% with Advection 0`);
} finally { await browser.close(); stop(); }
process.exit(checks.some(c => !c.ok) ? 1 : 0);
