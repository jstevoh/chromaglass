#!/usr/bin/env node
/**
 * Which random looks come out too dark to watch, and what did they roll?
 *
 *   npm run rolls
 *
 * Randomise (Lucky) replaces every setting at once. Most rolls are a show;
 * some are a dark screen, and pressing it in front of a room is how that gets
 * found. One cause of this is already fixed — it used to roll the backdrop's
 * two colours independently and could give a flat saturated field — and this
 * asks whether there are others.
 *
 * Each roll is applied to a settled plate, given a moment, and photographed.
 * Then the dark rolls and the bright ones are compared setting by setting, so
 * the answer is a name rather than a hunch.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { installFrameReader, frameOf } from './frame.mjs';

const PORT0 = Number(process.env.ROLLS_PORT ?? 4560);
const N = Number(process.env.ROLLS_N ?? 40);

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
server.on('exit', (c) => { if (!leaving) { console.error(`preview exited (${c})`); process.exit(2); } });
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM','SIGINT','SIGHUP']) process.on(s, () => { stop(); process.exit(130); });

const judge = (px) => {
  const bins = new Map();
  let tot = 0, lum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    bins.set(k, (bins.get(k) ?? 0) + 1);
    lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    tot++;
  }
  let top = 0, key = 0;
  for (const [k, v] of bins) if (v > top) { top = v; key = k; }
  return { flat: top / tot, luma: lum / tot / 255, rgb: [(key >> 8) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17] };
};

const browser = await launchChromium(chromium);
const rolls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch {} });
  await installFrameReader(page);
  await page.goto(`http://localhost:${port}/?debug&gpu=mid&tier=local&look=classic`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  console.log(`  ${N} random looks, each applied to a running plate\n`);
  console.log('    #   flat%   luma    commonest');
  for (let i = 0; i < N; i++) {
    await page.evaluate(() => window.chromaglassAction?.('lucky'));
    await page.waitForTimeout(4200);
    const px = await frameOf(page, 320, 200);
    if (!px) continue;
    const j = judge(px);
    const settings = await page.evaluate(() => ({ ...window.chromaglassDebug().settings }));
    rolls.push({ ...j, settings });
    console.log(`  ${String(i + 1).padStart(3)}  ${(j.flat * 100).toFixed(0).padStart(4)}%  ${j.luma.toFixed(3)}  rgb(${j.rgb.join(',')})`);
  }
} finally { await browser.close(); stop(); }

const dark = rolls.filter(r => r.luma < 0.10 || r.flat > 0.35);
const fine = rolls.filter(r => !(r.luma < 0.10 || r.flat > 0.35));
console.log(`\n  ${dark.length} of ${rolls.length} rolls came out dark or covered.`);
if (!dark.length || !fine.length) process.exit(dark.length ? 1 : 0);

/*
  Setting by setting, the gap between the dark rolls' average and the good
  ones', in units of the good ones' own spread. A dial that is simply random
  scores near zero however wide its range; one that decides whether the look
  is watchable stands out.
*/
const keys = Object.keys(fine[0].settings).filter(k => typeof fine[0].settings[k] === 'number');
const score = keys.map((k) => {
  const a = dark.map(r => r.settings[k]), b = fine.map(r => r.settings[k]);
  const m = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = m(a), mb = m(b);
  const sd = Math.sqrt(m(b.map(v => (v - mb) ** 2))) || 1e-9;
  return { k, ma, mb, z: (ma - mb) / sd };
}).sort((x, y) => Math.abs(y.z) - Math.abs(x.z));

console.log('\n  What the dark rolls did differently (biggest first):');
for (const s of score.slice(0, 12)) {
  console.log(`    ${s.k.padEnd(22)} dark ${s.ma.toFixed(3).padStart(8)}   ok ${s.mb.toFixed(3).padStart(8)}   ${s.z > 0 ? '+' : ''}${s.z.toFixed(2)} sd`);
}
process.exit(dark.length ? 1 : 0);
