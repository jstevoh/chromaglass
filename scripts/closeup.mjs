#!/usr/bin/env node
/**
 * Does turning the closeup on mid-show fill the frame with one colour?
 *
 *   npm run closeup
 *   CLOSEUP_LOOKS=soap-film,classic npm run closeup
 *
 * `npm run gig` killed a show on this single action, twice:
 *
 *   294s   13%  dye 1.05/0.85  pour a dye: splatter of Midnight
 *   298s   90%  dye 0.76/0.28  desk action: macro-toggle
 *
 * — and the plate underneath was 96% wet with 125 colours, so the dye was
 * fine and the picture was not. The camera cuts between subjects on a hold,
 * which is the shot it is meant to give; what it cuts *to* is the question.
 *
 * Three toggles per look, because the subject picker jitters its own score on
 * purpose ("keeps repeat runs from looking scripted") and one reading off a
 * deliberately random choice is not a measurement.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { installFrameReader, frameOf } from './frame.mjs';

const PORT0 = Number(process.env.CLOSEUP_PORT ?? 4660);
const LOOKS = (process.env.CLOSEUP_LOOKS ?? 'soap-film,classic,oil-on-water,galaxy').split(',');
const RUNS = Number(process.env.CLOSEUP_RUNS ?? 3);
/** Over this much of the frame in one colour is the fault, not a dark passage. */
const BAR = 0.5;

let server = null, port = PORT0, leaving = false;
for (let t = 0; t < 6 && !server; t++) {
  const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT0 + t), '--strictPort'],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let died = false;
  child.on('exit', () => { died = true; });
  await new Promise(r => setTimeout(r, 2500));
  if (died) continue;
  server = child; port = PORT0 + t;
}
if (!server) { console.error('no free port'); process.exit(2); }
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
server.on('exit', (c) => { if (!leaving) { console.error(`\npreview exited (${c})`); process.exit(2); } });
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

const flatness = (px) => {
  const c = new Map();
  let tot = 0;
  for (let i = 0; i < px.length; i += 4) {
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    c.set(k, (c.get(k) ?? 0) + 1); tot++;
  }
  let top = 0;
  for (const v of c.values()) if (v > top) top = v;
  return top / tot;
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const browser = await launchChromium(chromium);
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  console.log(`\n  the closeup turned on over a filled plate, ${RUNS} times each\n`);
  console.log('  look                 plate dye   worst frame   median frame');
  console.log('  ------------------------------------------------------------');

  for (const look of LOOKS) {
    const worsts = [], medians = [];
    let dye = 0;
    for (let run = 0; run < RUNS; run++) {
      await page.goto(`http://localhost:${port}/?debug&gpu=mid&tier=local&look=${look}`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      // The band only starts on a gesture, and a silent plate pours far less —
      // it would never fill, which is the whole condition being tested.
      await page.mouse.move(530, 350); await page.mouse.down(); await page.mouse.up();
      await page.waitForTimeout(20000);
      const before = await page.evaluate(() => window.chromaglassDebug().fluids?.[0]?.meanDensity ?? -1);
      if (before < 0.3) throw new Error(`${look} never filled — ${before.toFixed(2)} on the glass, nothing to zoom into`);
      dye = before;
      await page.evaluate(() => window.chromaglassAction?.('macro-toggle'));
      // The action sets React state; the settings the hook hands back are last
      // frame's until it lands. Read too early and the check says the closeup
      // never came on when it came on perfectly well.
      await page.waitForTimeout(600);
      const on = await page.evaluate(() => window.chromaglassDebug().settings.macroZoom);
      if (!(on > 1.05)) throw new Error(`macro-toggle did not turn the closeup on — zoom ${on}`);
      const seen = [];
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(1000);
        seen.push(flatness(await frameOf(page, 320, 200)));
      }
      worsts.push(Math.max(...seen)); medians.push(median(seen));
    }
    const worst = median(worsts), mid = median(medians);
    const bad = worst > BAR;
    if (bad) failed++;
    console.log(`  ${look.padEnd(20)} ${dye.toFixed(2).padStart(5)}   ` +
      `${(worst * 100).toFixed(0).padStart(9)}%   ${(mid * 100).toFixed(0).padStart(10)}%` +
      (bad ? '   <- FAIL' : ''));
  }
  console.log('');
  console.log(failed
    ? `  ${failed} of ${LOOKS.length} looks put over ${BAR * 100}% of the frame in one colour when the closeup came on.`
    : '  the closeup keeps a picture on every look');
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
