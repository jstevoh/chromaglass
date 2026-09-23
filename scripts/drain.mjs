#!/usr/bin/env node
/**
 * Does lowering the speed drain the plate?
 *
 *   npm run drain
 *
 * Reported twice, once as "random evolve removes all of the dye" and once as
 * a screen filled with one flat colour after evolving and then lowering the
 * speed. Both are the same fault: evaporation was applied once a step with no
 * dt in it, while everything that *moves* the liquid is scaled by dt. Slow the
 * plate and it stops moving and goes on drying, until there is no dye left and
 * what is on screen is the bare backdrop — which the randomiser had just given
 * a new colour.
 *
 * So: two plates, identical but for their speed, left for the same wall-clock
 * time. The slow one may hold *more* dye than the fast one; it may not hold
 * dramatically less.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4340;
const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

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

  const mean = () => page.evaluate(() => {
    const a = window.chromaglassDebug().fluids[0].readDensity;
    let t = 0; for (let i = 0; i < a.length; i++) t += a[i];
    return t / a.length;
  });

  const held = async (speed) => {
    await page.evaluate((sp) => {
      const d = window.chromaglassDebug();
      d.settings.automateRate = 0;          // nothing poured in: only drying
      d.settings.globalSpeed = sp;
      d.fluids[0].clear?.();
    }, speed);
    await page.evaluate(() => window.chromaglassDebug().seed?.());
    await page.waitForTimeout(2500);
    const before = await mean();
    await page.waitForTimeout(25000);
    const after = await mean();
    return { before, after, kept: before > 1e-4 ? after / before : 0 };
  };

  const fast = await held(0.05);
  const slow = await held(0.004);
  console.log(`     full speed kept ${(fast.kept * 100).toFixed(1)}% of its dye over 25s ` +
    `(${fast.before.toFixed(3)} -> ${fast.after.toFixed(3)})`);
  console.log(`     a tenth speed kept ${(slow.kept * 100).toFixed(1)}% ` +
    `(${slow.before.toFixed(3)} -> ${slow.after.toFixed(3)})`);
  check('a slowed plate does not dry out faster than a fast one',
    slow.kept > fast.kept * 0.9,
    `${(slow.kept * 100).toFixed(1)}% kept against ${(fast.kept * 100).toFixed(1)}% at full speed`);
  check('and it still has dye on it at all', slow.after > slow.before * 0.5,
    `${slow.after.toFixed(3)} left of ${slow.before.toFixed(3)}`);
} finally { await browser.close(); stop(); }
process.exit(checks.some(c => !c.ok) ? 1 : 0);
