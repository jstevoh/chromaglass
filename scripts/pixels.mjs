#!/usr/bin/env node
/**
 * Does the plate show its grid? Every look, at the size a laptop shows it.
 *
 *   npm run pixels                     every look, as the website runs them
 *   npm run pixels -- --rung 0         every look held on the ladder's top rung
 *   PIXELS_ONLY=classic,agate npm run pixels
 *
 * What was reported (2026-10-04): on the laptop's web app, "quite a few of
 * the looks seem very pixelated and look like they are on a computer with
 * poor graphics, less like liquids". A real liquid has no grid. The plate
 * does: the solver's fields are N×N cells, and every pixel on screen is
 * drawn from them, so wherever the drawing lets a cell's edge through, the
 * picture carries a lattice at exactly the cell's pitch, W/N pixels across
 * and H/N down.
 *
 * That makes it measurable without anyone's eyes. Bilinear filtering is
 * smooth inside a cell and creased along its edges (its slope jumps there),
 * so the second difference of the picture's brightness is near nothing
 * inside each cell and spikes on its edges, every W/N pixels. Averaged down
 * the columns, those spikes are a comb, and the comb is a peak in the
 * spectrum at a frequency of N/W cycles a pixel. A picture drawn as a liquid
 * would be, with no grid in it, has nothing there: its creases fall where the
 * colour does, at no particular pitch. So the number is the comb's power at
 * the cell's frequency over the spectrum's median beside it (`lock`), across
 * and down. About 1 is no grid; a lattice reads tens.
 *
 * It also says which rung the website's governor put each look on, because
 * a plate drawn from 256² cells has a coarser grid to show than one drawn
 * from 512², and on the website the governor, not the look, decides that.
 *
 * Writes, under pixels/ (or PIXELS_OUT):
 *   <id>.jpg          the frame, 720 px wide
 *   <id>-crop.png     the middle 360×225 canvas pixels, one to one
 *   index.json        every number below
 *
 * Needs a GPU that presents WebGPU: the macOS runner (pixels.yml).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { PRESETS } from '../src/presets.ts';
import { installFrameReader, lastFrameRead } from './frame.mjs';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(process.env.PIXELS_PORT ?? 4346);
const OUT = process.env.PIXELS_OUT ?? 'pixels';
const ONLY = process.env.PIXELS_ONLY ? process.env.PIXELS_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
const SECONDS = Number(argOf('seconds', 20)) || 20;
const RUNG = argOf('rung', null);
/** A 13-inch laptop's window: 1440×900 CSS pixels on a Retina panel. */
const VIEW = { width: 1440, height: 900 };
const SCALE = 2;

fs.mkdirSync(OUT, { recursive: true });

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${code}): port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const looks = PRESETS.filter((p) => !ONLY || ONLY.includes(p.id));
const index = [];
const browser = await launchChromium(chromium);
try {
  console.log(`  ${looks.length} looks, ${SECONDS}s each, ${VIEW.width}×${VIEW.height} at ${SCALE}x, ${RUNG === null ? 'governed as the website is' : `held on rung ${RUNG}`}\n`);
  for (const preset of looks) {
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
    await installFrameReader(page);
    // tier=hosted: a preview on localhost would otherwise get the local
    // ladder (up to 768²), which is not what the website gives a laptop.
    // No ?gpu=: the runner's adapter is classed as the owner's would be.
    const q = `?debug&tier=hosted&look=${preset.id}${RUNG === null ? '' : `&rung=${RUNG}`}`;
    await page.goto(`http://localhost:${PORT}/${q}`, { waitUntil: 'load' });
    await page.mouse.click(8, 8);   // the gesture the band needs
    const labels = [];
    for (let s = 0; s < SECONDS; s++) {
      await page.waitForTimeout(1000);
      const label = await page.evaluate(() => window.chromaglassDebug?.()?.engine ?? '');
      if (labels[labels.length - 1] !== label) labels.push(label);
    }
    await page.evaluate(() => document.body.classList.add('overlays-hidden'));
    await page.waitForTimeout(300);
    const got = await page.evaluate(async () => {
      const size = await window.__cgShot?.('px');
      const img = window.__shots?.px;
      if (!size || !img) return null;
      const label = window.chromaglassDebug?.()?.engine ?? '';
      const N = Number(/(\d+)²/.exec(label)?.[1] ?? 0);
      const { width: W, height: H, data } = img;
      const L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.2126 * data[4 * i] + 0.7152 * data[4 * i + 1] + 0.0722 * data[4 * i + 2];
      // The comb: |second difference| averaged down the columns (across)
      // and along the rows (down).
      const across = new Float64Array(W), down = new Float64Array(H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const c = L[y * W + x];
          across[x] += Math.abs(L[y * W + x - 1] - 2 * c + L[y * W + x + 1]);
          down[y] += Math.abs(L[(y - 1) * W + x] - 2 * c + L[(y + 1) * W + x]);
        }
      }
      const power = (p, f) => {
        let m = 0; for (let i = 1; i < p.length - 1; i++) m += p[i]; m /= p.length - 2;
        let re = 0, im = 0;
        for (let i = 1; i < p.length - 1; i++) { const a = 2 * Math.PI * f * i; re += (p[i] - m) * Math.cos(a); im -= (p[i] - m) * Math.sin(a); }
        return re * re + im * im;
      };
      // The cell's frequency against the median of the spectrum around it
      // (0.6 to 1.4 of it, the bins within 3 of the cell's left out): the
      // grid's pitch is the one place a lattice can be, so this asks
      // whether it is there and not whether the picture is busy.
      const lock = (p, len) => {
        if (!N) return null;
        const f0 = N / len;
        if (f0 >= 0.5) return null;
        const step = 1 / len;
        const at = power(p, f0);
        const side = [];
        for (let f = f0 * 0.6; f <= Math.min(0.5, f0 * 1.4); f += step) if (Math.abs(f - f0) > 3 * step) side.push(power(p, f));
        side.sort((a, b) => a - b);
        const med = side[Math.floor(side.length / 2)] || 1e-9;
        return +(at / med).toFixed(1);
      };
      // How lively the picture is at all, so a black frame's "no lattice"
      // is not read as a smooth one.
      let lit = 0; for (let i = 0; i < W * H; i++) if (L[i] > 8) lit++;
      const full = document.createElement('canvas'); full.width = W; full.height = H;
      full.getContext('2d').putImageData(img, 0, 0);
      const out = document.createElement('canvas'); out.width = 720; out.height = Math.round(720 * H / W);
      const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(full, 0, 0, out.width, out.height);
      const crop = document.createElement('canvas'); crop.width = 360; crop.height = 225;
      crop.getContext('2d').drawImage(full, Math.round(W / 2 - 180), Math.round(H / 2 - 112), 360, 225, 0, 0, 360, 225);
      return {
        label, N, W, H, lit: +(lit / (W * H)).toFixed(3),
        lockX: lock(across, W), lockY: lock(down, H),
        pitch: N ? [+(W / N).toFixed(2), +(H / N).toFixed(2)] : null,
        jpg: out.toDataURL('image/jpeg', 0.88), png: crop.toDataURL('image/png'),
      };
    });
    if (!got) {
      console.log(`  ${preset.id.padEnd(22)} no frame: ${JSON.stringify(await lastFrameRead(page)).slice(0, 160)}`);
      index.push({ id: preset.id, labels, frame: null });
      await page.close();
      continue;
    }
    fs.writeFileSync(path.join(OUT, `${preset.id}.jpg`), Buffer.from(got.jpg.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, `${preset.id}-crop.png`), Buffer.from(got.png.split(',')[1], 'base64'));
    const { jpg, png, ...row } = got;
    index.push({ id: preset.id, labels, ...row });
    console.log(`  ${preset.id.padEnd(22)} ${got.W}×${got.H} ${String(got.N).padStart(4)}²  cell ${got.pitch?.join('×') ?? '-'} px  lock ${got.lockX}/${got.lockY}  lit ${got.lit}  rungs: ${labels.join(' → ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  stop();
}
