#!/usr/bin/env node
/**
 * A drop lands where it is dropped, and nowhere else.
 *
 * Reported: on the Design desk, the Drop tool on the lead plate (not the
 * second) laid its dye under the hand and, in "the mirrored section above
 * it", the same gesture again, looking like a press. This drops on a calm
 * plate low in the preview and measures how much the picture changed in a
 * grid of cells over the preview, against the plate's own drift over the
 * same time: the cell under the hand should change and its mirror image
 * across the middle should not. It prints the map, so where an echo lands is
 * evidence rather than a description.
 *
 *   node scripts/mirror.mjs        (needs a WebGPU browser: CI's macOS runner)
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = 4351;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

const G = 6;   // the grid over the preview, G x G cells
const browser = await launchChromium(chromium);
try {
  for (const layer of [0, 1]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'design'); } catch { /* none */ } });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    // A calm plate, as npm run tools has it, and two layers so either can be picked.
    await page.evaluate((layer) => {
      window.chromaglassSettings?.({
        rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
        rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, layerCount: 2,
        audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
      });
      window.chromaglassAction?.('clear');
      window.chromaglassLayer?.(layer);
    }, layer);
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.chromaglassTool?.('dropper'));
    await page.waitForTimeout(400);
    const hole = await page.getByTestId('desk-preview').boundingBox();
    if (!hole) { check(`layer ${layer + 1}: the Design desk's preview is there`, false); await page.close(); continue; }
    const shot = async () => {
      const png = await page.screenshot({ clip: hole });
      return page.evaluate(async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, px: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
      }, png.toString('base64'));
    };
    const grid = (a, b) => {
      const out = Array.from({ length: G }, () => Array(G).fill(0));
      const n = Array.from({ length: G }, () => Array(G).fill(0));
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4;
        const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
        const gx = Math.min(G - 1, Math.floor(x / a.w * G)), gy = Math.min(G - 1, Math.floor(y / a.h * G));
        out[gy][gx] += d; n[gy][gx]++;
      }
      return out.map((row, y) => row.map((v, x) => v / Math.max(1, n[y][x])));
    };
    // The plate's own drift over the same time, then the drop.
    const s0 = await shot(); await page.waitForTimeout(1600); const s1 = await shot();
    const drift = grid(s0, s1);
    const at = { fx: 0.5, fy: 0.8 };   // low in the preview; its mirror is at 0.2
    await page.mouse.move(hole.x + hole.width * at.fx, hole.y + hole.height * at.fy);
    await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
    await page.mouse.move(hole.x + hole.width * 0.98, hole.y + hole.height * 0.02);
    await page.waitForTimeout(1000);
    const s2 = await shot();
    const change = grid(s1, s2);
    const cell = (fx, fy) => [Math.min(G - 1, Math.floor(fy * G)), Math.min(G - 1, Math.floor(fx * G))];
    const [hy, hx] = cell(at.fx, at.fy), [my, mx] = cell(at.fx, 1 - at.fy);
    const here = change[hy][hx], mirror = change[my][mx], floor = Math.max(1, drift[my][mx]);
    console.log(`     layer ${layer + 1}: change by cell (rows top to bottom), against the plate's own drift`);
    for (let y = 0; y < G; y++) console.log('       ' + change[y].map((v, x) => `${v.toFixed(1).padStart(6)}${y === hy && x === hx ? '*' : y === my && x === mx ? 'm' : ' '}`).join(''));
    const settings = await page.evaluate(() => { const s = window.chromaglassSettings?.() ?? {}; return { camera: s.camera, kaleido: s.kaleidoscope, beads: s.beads, bubbles: s.bubbles, dishSpread: s.dishSpread, layerCount: s.layerCount }; });
    console.log(`     (${JSON.stringify(settings)})`);
    check(`layer ${layer + 1}: a drop changes the picture where it lands`, here > 3 * Math.max(1, drift[hy][hx]),
      `${here.toFixed(1)} under the hand, against ${drift[hy][hx].toFixed(1)} of drift`);
    check(`layer ${layer + 1}: and not in its mirror image across the middle`, mirror < Math.max(3 * floor, 0.2 * here),
      `${mirror.toFixed(1)} at the mirror, against ${drift[my][mx].toFixed(1)} of drift there`);
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
