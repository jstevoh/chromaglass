/**
 * How long is the plate empty after a look arrives mid-show?
 *
 * A look change calls `layPlate`, which calls `clearAll()` on every fluid and
 * re-seeds from `seedPreset`. Two looks re-seed nothing on purpose — lumia and
 * sensual-laboratory "start from clean glass" — which is right for a plate
 * being laid at the top of a set and is a cut to black in the middle of one.
 *
 * This fills a plate, switches to each look in turn, and reports the dye at
 * 1, 2, 4, 8 and 14 seconds after it lands.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { PRESETS } from '../src/presets.ts';

const PORT = Number(process.env.ARRIVE_PORT ?? 4580);
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'ignore'], cwd: '/Users/jameshiggins/chromaglass' });
let leaving = false;
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
server.on('exit', (c) => { if (!leaving) { console.error(`preview exited ${c}`); process.exit(2); } });
await new Promise(r => setTimeout(r, 2500));

const ids = PRESETS.map(p => p.id);
const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.mouse.move(530, 350); await page.mouse.down(); await page.mouse.up();  // the band starts on a gesture
  await page.waitForTimeout(9000);

  const dye = () => page.evaluate(() => window.chromaglassDebug().fluids?.[0]?.meanDensity ?? -1);
  console.log('  arriving mid-show, from a filled plate\n');
  console.log('  look                     1s    2s    4s    8s   14s');
  console.log('  ------------------------------------------------------');
  const empty = [];
  for (const id of ids) {
    // back to a full plate first, so every look arrives on the same thing
    await page.evaluate((x) => window.chromaglassAction?.('preset', x), 'classic');
    await page.waitForTimeout(6000);
    const from = await dye();
    await page.evaluate((x) => window.chromaglassAction?.('preset', x), id);
    const at = [];
    let last = 0;
    for (const s of [1, 2, 4, 8, 14]) {
      await page.waitForTimeout((s - last) * 1000); last = s;
      at.push(await dye());
    }
    const row = at.map(v => v.toFixed(2).padStart(5)).join(' ');
    const dead = at.slice(0, 3).filter(v => v < 0.02).length;
    console.log(`  ${id.padEnd(22)} ${row}${dead ? `   <- empty for ${[1,2,4][dead-1]}s+ (from ${from.toFixed(2)})` : ''}`);
    if (dead) empty.push({ id, dead, at });
  }
  console.log('');
  if (!empty.length) console.log('  every look arrives with something on the glass');
  else for (const e of empty) console.log(`  ${e.id}: nothing on the glass for at least ${[1,2,4][e.dead-1]}s after it arrives`);
} finally {
  await browser.close();
  stop();
}
