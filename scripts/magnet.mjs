#!/usr/bin/env node
/**
 * Does the Magnet tool move the ferrofluid, the way a hand does it?
 *
 *   npm run magnet
 *
 * Reported: "magnet tool isn't really working". `npm run ferro` proves the
 * physics with the magnet placed by setting, and every one of its checks
 * passed while the tool did very little in the hand: the pull was scaled by
 * the flow's own step, which a slow look keeps tiny, so a dragged magnet left
 * the ferrofluid behind, and on a look without ferrofluid it did nothing at
 * all. So this goes the way a visitor does, through the keyboard and the
 * mouse, on a look that has no ferrofluid of its own:
 *
 *   1. picking the Magnet pours ferrofluid, rather than doing nothing
 *   2. dragging it across the plate carries the ferrofluid with it, measured
 *      as the centre of mass moving toward the hand, against the same plate
 *      left alone for the same time (the flow moves the phase too)
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';

const PORT = 4341;
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

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) process.exit(1);

  /** How much ferrofluid is on the lead plate, and where its centre of mass is (plate 0..1). */
  const phase = () => page.evaluate(async () => {
    const f = await window.chromaglassDebug().readPhase();
    if (!f) return { total: -1, x: 0, y: 0 };
    const { n, data } = f;
    let total = 0, cx = 0, cy = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = data[x + y * n];
      total += v; cx += v * (x / n); cy += v * (y / n);
    }
    return { total, x: total ? cx / total : 0, y: total ? cy / total : 0 };
  });
  const amount = () => page.evaluate(() => window.chromaglassDebug().settings?.phaseAmount ?? 0);

  const before = await phase();
  const amountBefore = await amount();
  console.log(`     classic: ferrofluid ${amountBefore}, ${before.total.toFixed(0)} on the plate`);

  // 1. Pick the Magnet the way a hand does.
  await page.mouse.click(5, 5);
  await page.keyboard.press('m');
  await page.waitForTimeout(2500);
  const poured = await phase();
  const amountAfter = await amount();
  check('picking the Magnet on a look without ferrofluid pours some',
    amountAfter > 0.002 && poured.total > Math.max(50, before.total * 2),
    `setting ${amountBefore} → ${amountAfter}, on the plate ${before.total.toFixed(0)} → ${poured.total.toFixed(0)}`);

  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const at = (fx) => [box.x + box.width * fx, box.y + box.height * 0.5];

  // 2a. The control: the same plate, left alone for as long as the drag takes.
  const idle0 = await phase();
  await page.waitForTimeout(6000);
  const idle1 = await phase();
  const drift = idle1.x - idle0.x;

  // 2b. The drag: from the left of the plate to the right, slowly, then held.
  const drag0 = await phase();
  await page.mouse.move(...at(0.2));
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) { await page.mouse.move(...at(0.2 + 0.65 * i / 40)); await page.waitForTimeout(100); }
  await page.waitForTimeout(2000);
  const drag1 = await phase();
  await page.mouse.up();
  const moved = drag1.x - drag0.x;
  console.log(`     centre of mass across: alone ${idle0.x.toFixed(3)} → ${idle1.x.toFixed(3)}, dragged ${drag0.x.toFixed(3)} → ${drag1.x.toFixed(3)}`);
  check('dragging the Magnet carries the ferrofluid toward the hand',
    moved > drift + 0.05,
    `moved ${moved.toFixed(3)} of the plate toward the hand, against ${drift.toFixed(3)} on its own`);
  check('and the ferrofluid is still there after it', drag1.total > poured.total * 0.5,
    `${poured.total.toFixed(0)} → ${drag1.total.toFixed(0)}`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
