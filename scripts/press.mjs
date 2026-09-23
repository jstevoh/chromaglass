#!/usr/bin/env node
/**
 * Does a press push the dye out into a ring?
 *
 *   npm run press
 *
 * "A press moves the dye" is not the claim. A hand on the top glass thins the
 * film under the palm and the dye goes *somewhere* — outward, into a ring —
 * and that shape is the thing a person sees and says is missing. Total change
 * cannot tell a ring from a shimmer, so this measures the disc against the
 * annulus around it, before and after, with the plate slowed so its own
 * motion does not drown the gesture.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4339;
const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    d.settings.automateRate = 0;
    d.settings.globalSpeed = 0.004;
  });
  await page.waitForTimeout(3000);

  /** Dye under the palm, and in the ring it should be pushed into. */
  const shape = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const N = d.gridSize, dens = d.fluids[0].readDensity;
    let disc = 0, dn = 0, ring = 0, rn = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2, y - N / 2) / N;
      if (r < 0.09) { disc += dens[x + y * N]; dn++; }
      else if (r > 0.12 && r < 0.20) { ring += dens[x + y * N]; rn++; }
    }
    return { disc: disc / dn, ring: ring / rn };
  });

  /** Press the way the app's own tool does, held the way a hand is. */
  const press = (amount) => page.evaluate((a) => {
    const d = window.chromaglassDebug();
    const f = d.fluids[0], N = d.gridSize;
    const fg = d.settings.fingering ?? 0;
    f.applySquish(N / 2, N / 2, 30, a, fg, true);
    f.applySquish(N / 2, N / 2, 18, a, fg);
    f.applySquish(N / 2, N / 2, 8, a, fg);
  }, amount);

  const run = async (amount, label) => {
    await page.evaluate(() => window.chromaglassDebug().fluids[0].clear?.());
    await page.evaluate(() => window.chromaglassDebug().seed?.());
    await page.waitForTimeout(4000);
    const before = await shape();
    for (let k = 0; k < 12; k++) { await press(amount); await page.waitForTimeout(90); }
    await page.waitForTimeout(1200);
    const after = await shape();
    // What a press does is move dye from under the palm into the ring.
    const moved = (before.disc - after.disc) / Math.max(before.disc, 1e-4);
    const gained = (after.ring - before.ring) / Math.max(before.ring, 1e-4);
    console.log(`     ${label}: under the palm ${before.disc.toFixed(3)} -> ${after.disc.toFixed(3)}` +
      `, ring ${before.ring.toFixed(3)} -> ${after.ring.toFixed(3)}`);
    return { moved, gained };
  };

  if (process.env.PRESS_SWEEP) {
    for (const a of [0.004, 0.02, 0.05, 0.12, 0.3]) await run(a, `amount ${a}`);
    process.exit(0);
  }
  const app = await run(0.004, "the app's own press (0.004)");
  check('the app\'s press thins the film under the palm', app.moved > 0.05,
    `${(app.moved * 100).toFixed(1)}% of the dye left the disc`);
  check('and it goes into the ring rather than nowhere', app.gained > 0.02,
    `the ring gained ${(app.gained * 100).toFixed(1)}%`);
} finally { await browser.close(); stop(); }
process.exit(checks.some(c => !c.ok) ? 1 : 0);
