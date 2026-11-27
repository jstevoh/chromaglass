#!/usr/bin/env node
/**
 * Keep full in the app: Lava Pop left running, and an emptied dish topped back
 * up by the dropper (PLAN 18a-22; `npm run keepfullapp`, the Mac, about four
 * minutes; it builds first).
 *
 * What was reported. The owner left the player running for an evening on Lava
 * Pop with Evolve off, and the plate emptied (sim/keepFull.ts has the causes).
 * `npm run keepfull` holds the hand's sums and wiring in node; this asks the
 * real solver, on Metal, what only it can answer:
 *
 *  0. Lava Pop opened with its dish laid (the dish's own measure, inside the
 *     rim, at least a third of the look's amount), or nothing below means
 *     anything.
 *  1. Left alone with Keep Full off, today's Lava Pop keeps its dye over
 *     LEAK_S (at least 90%), and the rate is printed as a half-life in hours:
 *     the slow leak a night is made of.
 *  2. The control: the dish cleared with Keep Full off stays empty for 20 s
 *     (under 15% of the look's amount), so 3 cannot pass on the look's own
 *     pours or the readback catching up.
 *  3. Switched on, the dropper brings the cleared dish back to at least 60% of
 *     the look's amount within REFILL_S, by its own drops (the hand's count
 *     rises), with no setting of the look moved.
 *  4. And it stops: once full, fewer than three drops in the next 20 s.
 */
import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const LEAK_S = Number(process.env.KEEPFULL_LEAK_S ?? 120);
const REFILL_S = Number(process.env.KEEPFULL_REFILL_S ?? 90);
const PORT = port(4352);
const checks = [];
const check = (n, ok, d = '') => { checks.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(12000);

  /** The dish's own measure (inside the rim on a thin gap), the look's amount, the hand's drops, and a few look settings to see none moved. */
  const read = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0];
    const s = window.chromaglassSettings?.() ?? d.settings;
    const budget = s.dyeBudget ?? 0.85, seed = f.seedMean, sb = f.seedBudget ?? 0.85;
    // lib/dyeTarget.ts lookTarget, as the hand reads it.
    const target = !(seed > 0) ? budget : seed > 0.85 && budget >= 0.85 ? seed * budget / Math.max(0.85, sb) : seed < sb ? seed * budget / sb : budget;
    return { mean: f.meanDensity, target, kept: d.autoEvents?.kept ?? 0, plate: d.plate, look: [s.dyeBudget, s.globalSpeed, s.plateRock, s.evaporationRate, s.automateRate] };
  });
  const set = (patch) => page.evaluate((p) => window.chromaglassSettings(p), patch);

  await set({ keepFull: false });
  const r0 = await read();
  console.log(`     ${r0.plate?.id ?? r0.plate} dish ${r0.mean.toFixed(3)} of its look's ${r0.target.toFixed(3)}`);
  check('0. Lava Pop opened with its dish laid', r0.mean > r0.target / 3, `${r0.mean.toFixed(3)} against ${r0.target.toFixed(3)}`);

  // 1. Left alone.
  await page.waitForTimeout(LEAK_S * 1000);
  const r1 = await read();
  const kept = r0.mean > 1e-4 ? r1.mean / r0.mean : 0;
  const halfH = kept > 0 && kept < 1 ? (LEAK_S * Math.LN2 / -Math.log(kept)) / 3600 : Infinity;
  check(`1. left alone ${LEAK_S} s with Keep Full off, it keeps its dye`, kept >= 0.9,
    `${(kept * 100).toFixed(1)}% kept (${r0.mean.toFixed(3)} -> ${r1.mean.toFixed(3)}), half gone in ${Number.isFinite(halfH) ? halfH.toFixed(1) + ' h' : 'never'}`);

  // 2. The control: cleared, off.
  await page.evaluate(() => window.chromaglassAction('clear'));
  await page.waitForTimeout(20000);
  const r2 = await read();
  check('2. control: cleared with Keep Full off, the dish stays empty for 20 s', r2.mean < 0.15 * r2.target, `${r2.mean.toFixed(3)} of ${r2.target.toFixed(3)}`);

  // 3. On.
  await set({ keepFull: true });
  const t0 = Date.now();
  let r3 = await read(), at = null;
  while (Date.now() - t0 < REFILL_S * 1000) {
    await page.waitForTimeout(3000);
    r3 = await read();
    if (r3.mean >= 0.6 * r3.target) { at = (Date.now() - t0) / 1000; break; }
  }
  const drops = r3.kept - r2.kept;
  check(`3. switched on, the dropper refills it to 60% of the look's amount within ${REFILL_S} s`, at !== null && drops > 0,
    `${r3.mean.toFixed(3)} of ${r3.target.toFixed(3)} ${at !== null ? `after ${at.toFixed(0)} s` : 'at the end'}, ${drops} drops`);
  check('   with no look setting moved', JSON.stringify(r3.look) === JSON.stringify(r0.look), `${JSON.stringify(r0.look)} -> ${JSON.stringify(r3.look)}`);

  // 4. It stops.
  let r4 = r3;
  const tFull = Date.now();
  while (r4.mean < 0.95 * r4.target && Date.now() - tFull < 60000) { await page.waitForTimeout(3000); r4 = await read(); }
  await page.waitForTimeout(5000);
  const a = await read();
  await page.waitForTimeout(20000);
  const b = await read();
  check('4. once full it stops: fewer than three drops in the next 20 s', b.kept - a.kept < 3, `${b.kept - a.kept} drops, dish ${b.mean.toFixed(3)} of ${b.target.toFixed(3)}`);
} finally { await browser.close(); stop(); }
process.exit(checks.every(Boolean) ? 0 : 1);
