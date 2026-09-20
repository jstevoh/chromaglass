#!/usr/bin/env node
/**
 * Pictures of the plate, taken by the app.
 *
 *   npm run shots
 *
 * The README was forty thousand words of prose with not one image in it, for
 * a project whose entire output is something to look at. The audiences it has
 * to reach — VJs, shader people, anyone scrolling a list of links — decide in
 * about a second and they decide with their eyes.
 *
 * So the pictures are generated rather than taken by hand, which means they
 * can be regenerated whenever the look changes instead of slowly becoming a
 * photograph of a version nobody runs any more.
 *
 * **Run this on a machine with a real GPU.** It asks for the GPU solver at a
 * high grid, but a runner or a sandbox rasterising in software will quietly
 * fall back to the 192² CPU path and produce an honest picture of a plate
 * that nobody's laptop draws. The header it prints says which engine actually
 * made the images, so a set shot on the wrong machine is obvious rather than
 * merely disappointing.
 *
 *   npm run shots -- --preset fillmore-1969 --seconds 40
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { engineQuery, installFrameReader } from './frame.mjs';

const PORT = 4326;
const OUT = 'docs/shots';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/**
 * What to photograph.
 *
 * Chosen to show that this is a range rather than one effect: the plate as a
 * ballroom projected it, the Fillmore's separate dishes, a macro closeup, and
 * the photographic render. The wait is per-preset because a plate needs
 * different amounts of time to become itself — the Fillmore has to build its
 * beads and cells, a macro shot has to find a bead to chase.
 */
const SHOTS = [
  { id: 'fillmore-1969', name: 'fillmore-east-1969', seconds: 34 },
  { id: 'oil-on-water', name: 'oil-on-water', seconds: 30 },
  { id: 'macro-bead', name: 'macro-bead', seconds: 30 },
  { id: 'lumia', name: 'lumia', seconds: 25 },
  // These two are the ones that need a real graphics card, and they are at the
  // end so a set shot in a sandbox still has four usable frames in it. Both
  // fill their plate a step at a time — Classic drop by drop from the
  // automation, the Sensual Laboratory by growing a reaction — and a machine
  // rasterising in software takes so few solver steps a second that what comes
  // out is a photograph of a plate that has not started yet rather than of the
  // look. The wait is long on purpose and still is not enough there.
  { id: 'classic', name: 'classic-light-show', seconds: 75 },
  { id: 'sensual-laboratory', name: 'sensual-laboratory', seconds: 60 },
];

/**
 * How wide the pictures come out, and in what.
 *
 * A README image is read at about 700 pixels across in a browser and a good
 * deal less on a phone, so 1200 is already generous — and a plate full of
 * grain is about as incompressible as a picture gets, which had the first set
 * at seven megabytes for four frames. JPEG at 92 is indistinguishable here and
 * an order of magnitude smaller. `--png` keeps them lossless for anything that
 * is not a README.
 */
const WIDTH = Number(argOf('width', 1200)) || 1200;
const PNG = process.argv.includes('--png');

const only = argOf('preset', null);
const extra = Number(argOf('seconds', 0)) || 0;
const shots = only ? SHOTS.filter(s => s.id === only) : SHOTS;
if (shots.length === 0) {
  console.error(`No preset called "${only}". Known: ${SHOTS.map(s => s.id).join(', ')}`);
  process.exit(2);
}

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) {
    console.error(`port ${PORT} is already in use — a previous run's preview server is still up.`);
    process.exit(2);
  }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  detached: true, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

fs.mkdirSync(OUT, { recursive: true });

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  // The band drives it, so the plate is doing what it does in front of music
  // rather than sitting in whatever state automation happens to leave it.
  await installFrameReader(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.mouse.click(8, 8);              // the gesture the band needs
  await page.waitForTimeout(6000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? 'unknown');
  console.log(`Engine: ${engine}`);
  if (!/^GPU/.test(engine)) {
    console.log('  ⚠ software rasterisation — these will not look like the app on a real machine.');
  }

  for (const shot of shots) {
    // Through the app's own `applyPreset`, via the debug hook: above 1024px
    // the desk owns the window and the overlay's preset menu is not rendered
    // at all, so driving the menu here would mean photographing the app at a
    // width nobody projects from. `npm run qa` is the harness that checks the
    // menu a hand would actually use.
    const ok = await page.evaluate((id) => {
      const fn = window.chromaglassApplyPreset;
      if (typeof fn !== 'function') return false;
      fn(id);
      return true;
    }, shot.id);
    if (!ok) {
      console.error('  no chromaglassApplyPreset on the page — stale build, or ?debug was dropped.');
      process.exitCode = 1;
      break;
    }
    await page.waitForTimeout((shot.seconds + extra) * 1000);
    // Everything off the wall: no toolbar, no cursor, just the plate.
    await page.evaluate(() => document.body.classList.add('overlays-hidden'));
    await page.waitForTimeout(400);
    const file = path.join(OUT, `${shot.name}.${PNG ? 'png' : 'jpg'}`);
    // Read the canvas, do not photograph it. `locator.screenshot()` waits for
    // the element to be "stable", and a canvas repainting sixty times a second
    // never is — it waits for fonts, then for stillness, then times out. The
    // context is created with `preserveDrawingBuffer`, so the canvas can just
    // be read at any moment. The downscale happens in the page too, which
    // keeps this script free of an image library.
    const dataUrl = await page.evaluate(async ({ width, png }) => {
      const c = document.querySelector('#liquid-canvas');
      if (!c) return null;
      const scale = Math.min(1, width / c.width);
      const out = document.createElement('canvas');
      out.width = Math.round(c.width * scale);
      out.height = Math.round(c.height * scale);
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      // Through the shared reader, because a presented WebGPU canvas hands
      // `drawImage` a black frame and these are pictures somebody looks at.
      const shot = await window.__cgShot('still');
      if (shot) {
        const full = document.createElement('canvas');
        full.width = shot.w; full.height = shot.h;
        full.getContext('2d').putImageData(window.__shots.still, 0, 0);
        ctx.drawImage(full, 0, 0, out.width, out.height);
      } else {
        ctx.drawImage(c, 0, 0, out.width, out.height);
      }
      return png ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.92);
    }, { width: WIDTH, png: PNG });
    if (!dataUrl) { console.error(`  no canvas to read for ${shot.name}`); process.exitCode = 1; continue; }
    fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    await page.evaluate(() => document.body.classList.remove('overlays-hidden'));
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`  ${file}  ${kb} KB`);
  }
} finally {
  await browser.close();
  stop();
}
console.log(`\nWritten to ${OUT}/. Regenerate whenever the look changes.`);
process.exit(0);
