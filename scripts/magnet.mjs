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

  /**
   * How much ferrofluid is on the lead plate, where its centre of mass is
   * (plate 0..1), and how much sits within 0.12 of a point (the hand).
   */
  const phase = (at = null) => page.evaluate(async (at) => {
    const f = await window.chromaglassDebug().readPhase();
    if (!f) return { total: -1, x: 0, y: 0, near: 0 };
    const { n, data } = f;
    let total = 0, cx = 0, cy = 0, near = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = data[x + y * n];
      total += v; cx += v * (x / n); cy += v * (y / n);
      if (at && Math.hypot((x + 0.5) / n - at.x, (y + 0.5) / n - at.y) < 0.12) near += v;
    }
    return { total, x: total ? cx / total : 0, y: total ? cy / total : 0, near };
  }, at);
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

  /*
    2. The drag. Measured where the hand ends up, not over the whole plate:
    a magnet drags the ferrofluid it passes near and leaves the rest, so the
    plate's centre of mass hardly moves even when the pull is doing exactly
    its job (the first version of this check asked for that and failed a
    magnet that worked). The control is the same plate left alone as long,
    read at the same spot; it also carries the plate's own slow losses (the
    edge sharpening is not conservative), which the drag is compared against
    rather than blamed for.
  */
  const end = at(0.85);
  await page.mouse.move(...end);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  await page.mouse.up();
  await page.waitForTimeout(500);
  const idle0 = await phase(spot);
  await page.waitForTimeout(6000);
  const idle1 = await phase(spot);
  const drag0 = await phase(spot);
  await page.mouse.move(...at(0.2));
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) { await page.mouse.move(...at(0.2 + 0.65 * i / 40)); await page.waitForTimeout(100); }
  await page.waitForTimeout(2000);
  const drag1 = await phase(spot);
  await page.mouse.up();
  console.log(`     the hand ends at ${spot ? `${spot.x.toFixed(2)},${spot.y.toFixed(2)}` : 'nowhere'}; ferrofluid within 0.12 of it: ` +
    `alone ${idle0.near.toFixed(0)} → ${idle1.near.toFixed(0)}, dragged ${drag0.near.toFixed(0)} → ${drag1.near.toFixed(0)}`);
  check('dragging the Magnet gathers the ferrofluid where the hand ends up',
    !!spot && drag1.near > drag0.near + Math.max(0, idle1.near - idle0.near) + 0.1 * Math.max(1, drag0.near) && drag1.near > 1.5 * Math.max(1, idle1.near),
    `${drag0.near.toFixed(0)} → ${drag1.near.toFixed(0)} dragged, against ${idle0.near.toFixed(0)} → ${idle1.near.toFixed(0)} left alone`);
  const keptDrag = drag1.total / Math.max(1, drag0.total), keptIdle = idle1.total / Math.max(1, idle0.total);
  check('and dragging it neither makes nor loses more liquid than the plate does alone',
    Math.abs(keptDrag - keptIdle) < 0.08,
    `kept ${(keptDrag * 100).toFixed(0)}% dragged, ${(keptIdle * 100).toFixed(0)}% left alone`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
