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
      /*
        Sized to the press the app actually makes, which is radius 30 before
        GRID_SCALE — about 0.31 of the grid, not 0.09.

        Twice now this has measured its "ring" from inside the palm and
        reported the dye vanishing rather than moving. A footprint is a thing
        to look up, not to guess.
      */
      if (r < 0.28) { disc += dens[x + y * N]; dn++; }
      else if (r > 0.34 && r < 0.52) { ring += dens[x + y * N]; rn++; }
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
    f.squeezeOut?.(N / 2, N / 2, 30 * (d.gridScale ?? 2), a);
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

  if (process.env.PRESS_TRACE) {
    /*
      Where does a press stop reaching?

      Strength, timing, the solver clamp, the divergence source and its mean
      have each been tried and none moved the dye. That is five guesses, so
      this measures the chain instead: what the velocity does under the palm,
      and what the dye does, before and during.
    */
    const probe = () => page.evaluate(() => {
      const d = window.chromaglassDebug();
      const f = d.fluids[0], N = d.gridSize;
      const vx = f.readVx, vy = f.readVy, dens = f.readDensity;
      let v = 0, dy = 0, k = 0, vOut = 0, kOut = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
        const i = x + y * N;
        if (r < 0.25) { v += Math.hypot(vx[i], vy[i]); dy += dens[i]; k++; }
        else if (r > 0.35 && r < 0.6) { vOut += Math.hypot(vx[i], vy[i]); kOut++; }
      }
      return { vIn: v / k, dye: dy / k, vOut: vOut / kOut };
    });
    // And the gap itself, which is the first link in the chain.
    const film = () => page.evaluate(async () => {
      const d = window.chromaglassDebug();
      const f = await d.readSqueeze();
      if (!f) return null;
      const { n, gap, rate } = f;
      let g = 0, r = 0, k = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (Math.hypot(x - n / 2, y - n / 2) / (n / 2) > 0.25) continue;
        g += gap[x + y * n]; r += rate[x + y * n]; k++;
      }
      return { gap: g / k, rate: r / k };
    });
    await page.evaluate(() => window.chromaglassDebug().fluids[0].clear?.());
    await page.evaluate(() => window.chromaglassDebug().seed?.());
    await page.waitForTimeout(4000);
    const a = await probe(), fa = await film();
    for (let k = 0; k < 12; k++) { await press(0.004); await page.waitForTimeout(90); }
    const mid = await probe(), fm = await film();
    console.log(`  gap under the palm: ${fa ? fa.gap.toFixed(5) : '?'} -> ${fm ? fm.gap.toFixed(5) : '?'}` +
      `   rate ${fa ? fa.rate.toExponential(2) : '?'} -> ${fm ? fm.rate.toExponential(2) : '?'}`);
    const row = (n, p) => `  ${n.padEnd(9)} speed under palm ${p.vIn.toExponential(2)}   outside ${p.vOut.toExponential(2)}   dye ${p.dye.toFixed(3)}`;
    console.log(row('before', a));
    console.log(row('pressing', mid));
    console.log(`  under the palm, pressing is ${(mid.vIn / Math.max(a.vIn, 1e-9)).toFixed(2)}x idle`);
    process.exit(0);
  }
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
