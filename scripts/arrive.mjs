#!/usr/bin/env node
/**
 * How long is the glass empty after a look arrives mid-show?
 *
 *   npm run arrive
 *
 * A look change calls `layPlate`, which calls `clearAll()` on every fluid and
 * re-seeds from `seedPreset`. That is right at the top of a set and is a cut
 * to black in the middle of one. `npm run gig` caught it in 19 seconds:
 *
 *   15s   22%  dye 0.22/0.28   work the glass: finger
 *   19s  100%  dye 0.00/0.28   step to the next look
 *
 * The closeup looks seed very little by design, and two of them — lumia and
 * sensual-laboratory — seed nothing at all, on purpose. This fills a plate,
 * steps into every look in turn, and times how long each one leaves the glass
 * empty after it lands.
 *
 * It refuses to report on a look it did not actually reach. The first version
 * drove the app with `chromaglassAction('preset', id)`; that hook takes a name
 * and drops everything after it, so the plate never changed and all 32 rows
 * read 1.02–1.07 — the opening plate, sitting still — which reads as "every
 * look arrives fine" and is the opposite of the truth.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { installFrameReader, frameOf } from './frame.mjs';
import { PRESETS } from '../src/presets.ts';

const PORT0 = Number(process.env.ARRIVE_PORT ?? 4580);
const FROM = process.env.ARRIVE_FROM ?? 'classic';
/*
  The frame, not the dye, decides.

  This judged `meanDensity` first and called lumia a failure: nothing on the
  glass for the full fourteen seconds after it lands. Laid fresh from its own
  URL it reads 0.03 after thirty seconds, so that is simply what lumia is —
  Wilfred's lumia is projected light and its picture is not made of dye, which
  is exactly what `seedPreset` says when it seeds nothing for it on purpose.
  A harness watching the dye would have had that look "fixed" until it stopped
  being itself.

  So the dye is kept, because it tells an empty plate from a drowned one, and
  the verdict is the photograph.
*/
const DARK = 0.02;      // luma this low is a black frame whatever the plate holds

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

const ids = PRESETS.map(p => p.id);
const browser = await launchChromium(chromium);
let bad = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await installFrameReader(page);
  await page.goto(`http://localhost:${port}/?debug&gpu=mid&tier=local&look=${FROM}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  // The simulated band only starts on the first gesture, and a silent plate is
  // a different app: it pours far less, so an arrival would look emptier than
  // it is and stay emptier for longer.
  await page.mouse.move(530, 350); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(9000);

  const read = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    return { dye: d.fluids?.[0]?.meanDensity ?? -1, plate: d.plate };
  });
  const luma = async () => {
    const px = await frameOf(page, 320, 200);
    if (!px) throw new Error('could not photograph the plate');
    let l = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { l += (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255; n++; }
    return l / n;
  };
  if ((await read()).plate === undefined)
    throw new Error('chromaglassDebug() has no `plate` — this build cannot say which look is on the glass');

  /** Step with the only action that exists, and stop if it does not land. */
  const goTo = async (want) => {
    for (let n = 0; n < ids.length + 2; n++) {
      if ((await read()).plate === want) return;
      await page.evaluate(() => window.chromaglassAction?.('preset-next'));
      await page.waitForTimeout(450);
    }
    throw new Error(`stepped ${ids.length + 2} times and never reached ${want} — ` +
      `the plate is on ${(await read()).plate}`);
  };

  console.log(`\n  every look arriving mid-show, on a plate filled by ${FROM}\n`);
  console.log('  look                    luma 1s    2s    4s    8s   14s   (dye at 14s)');
  console.log('  ----------------------------------------------------------------------');
  const empty = [];
  for (const id of ids) {
    await goTo(FROM);
    await page.waitForTimeout(7000);          // fill it again
    const from = (await read()).dye;
    if (from < 0.2) throw new Error(`${FROM} did not refill before ${id} — only ${from.toFixed(2)} on the glass`);
    await goTo(id);
    const at = [];
    let last = 0;
    for (const s of [1, 2, 4, 8, 14]) {
      await page.waitForTimeout((s - last) * 1000); last = s;
      at.push(await luma());
    }
    const dyeNow = (await read()).dye;
    const when = [1, 2, 4, 8, 14].filter((_, i) => at[i] < DARK);
    console.log(`  ${id.padEnd(22)} ${at.map(v => v.toFixed(3).padStart(5)).join(' ')}   ${dyeNow.toFixed(2)}` +
      (when.length ? `   <- black at ${when.join('s, ')}s` : ''));
    if (when.length) empty.push({ id, upto: when[when.length - 1], from, dye: dyeNow });
  }

  console.log('');
  if (!empty.length) console.log('  every look arrives with a picture');
  else {
    for (const e of empty)
      console.log(`  FAIL ${e.id}: the frame is still black ${e.upto}s after it lands, ` +
        `off a plate that held ${e.from.toFixed(2)} — ${e.dye.toFixed(2)} on the glass now`);
    bad = empty.length;
    console.log(`\n  ${bad} of ${ids.length} looks cut the show to black on arrival.`);
  }
} finally {
  await browser.close();
  stop();
}
process.exit(bad ? 1 : 0);
