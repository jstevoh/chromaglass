/**
 * One plate, photographed under two settings.
 *
 * The plate is chaotic. Two runs of the same preset with the same settings
 * differ more than most changes worth making do — a macro-bead capture came
 * out at 1.6 MB on one run and 2.8 MB on the next, which is the difference
 * between a plate that has found its structure and one that has not. So a
 * measurement that runs the app twice and compares the frames is measuring
 * the weather, and several of this session's were.
 *
 * This runs it once. The plate settles, is photographed, has one setting
 * moved under it, is given long enough to answer, and is photographed again.
 * Everything that makes two runs differ — the seeding, the automation, which
 * bead the macro camera chose — is held fixed by construction, because there
 * is only one of it.
 *
 *   npm run ab -- --preset macro-bead --set particles=0.8
 *   npm run ab -- --preset fillmore-1969 --set "particles=0.7;particleMix=0.3"
 *   npm run ab -- --preset macro-bead --set particles=0.8 --settle 10
 *
 * It writes `before.png` and `after.png` and prints what `scripts/detail.mjs`
 * makes of them, so the answer is one command.
 *
 * What it cannot hold still is time: the plate keeps evolving through the
 * settle between the two frames. Keep that short enough to matter less than
 * the change being measured and long enough for the change to have arrived —
 * particles need a life or so to populate, which is why the default is six
 * seconds rather than one.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { installFrameReader, isGpuEngine } from './frame.mjs';

const PORT = 4332;
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PRESET = argOf('preset', 'fillmore-1969');
const SECONDS = Number(argOf('seconds', 34)) || 34;
const SETTLE = Number(argOf('settle', 6)) || 6;
const WIDTH = Number(argOf('width', 1400)) || 1400;
const OUT = argOf('out', path.join(process.env.TMPDIR ?? '/tmp', 'chromaglass-ab'));

const raw = argOf('set', null);
if (!raw) { console.error('usage: npm run ab -- --preset <id> --set key=value[;key=value]'); process.exit(2); }
const PATCH = Object.fromEntries(raw.split(';').filter(Boolean).map((kv) => {
  const [k, v] = kv.split('=');
  return [k, v === 'true' ? true : v === 'false' ? false : Number(v)];
}));

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) { console.error(`port ${PORT} is already in use.`); process.exit(2); }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChromium(chromium);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage['chromaglass-audio-source'] = 'simulated'; } catch { /* first run */ } });
await installFrameReader(page);
await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=classic`, { waitUntil: 'load' });
await page.mouse.click(8, 8);
await page.waitForTimeout(4000);

const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? 'unknown');
console.log(`Engine: ${engine}`);
if (!isGpuEngine(engine)) console.log('  ⚠ not on a GPU — the numbers below are of a plate that has barely started.');

const applied = await page.evaluate((id) => {
  const fn = window.chromaglassApplyPreset;
  if (typeof fn !== 'function') return false;
  fn(id);
  return true;
}, PRESET);
if (!applied) { console.error('  no chromaglassApplyPreset on the page — stale build, or ?debug was dropped.'); await browser.close(); stop(); process.exit(1); }

/** Read the canvas at `WIDTH`, overlays hidden, exactly as `shots` does. */
const shoot = async (name) => {
  await page.evaluate(() => document.body.classList.add('overlays-hidden'));
  await page.waitForTimeout(300);
  const dataUrl = await page.evaluate(async ({ width }) => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.round(width * (c.height / c.width));
    const ctx = out.getContext('2d');
    const shot = await window.__cgShot('ab');
    if (shot) {
      const full = document.createElement('canvas');
      full.width = shot.w; full.height = shot.h;
      full.getContext('2d').putImageData(window.__shots.ab, 0, 0);
      ctx.drawImage(full, 0, 0, out.width, out.height);
    } else {
      ctx.drawImage(c, 0, 0, out.width, out.height);
    }
    return out.toDataURL('image/png');
  }, { width: WIDTH });
  await page.evaluate(() => document.body.classList.remove('overlays-hidden'));
  if (!dataUrl) { console.error('  no canvas to read.'); return null; }
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  console.log(`  ${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  return file;
};

console.log(`\n${PRESET}: settling ${SECONDS}s`);
await page.waitForTimeout(SECONDS * 1000);
const before = await shoot('before');

console.log(`  set ${JSON.stringify(PATCH)}, then ${SETTLE}s`);
await page.evaluate((patch) => window.chromaglassSettings?.(patch), PATCH);
await page.waitForTimeout(SETTLE * 1000);
const after = await shoot('after');

await browser.close();
stop();

if (before && after) {
  console.log('');
  console.log(execFileSync(process.execPath, ['scripts/detail.mjs', before, after], { encoding: 'utf8' }));
}
