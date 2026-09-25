#!/usr/bin/env node
/**
 * A drop lands where it is dropped, and nowhere else.
 *
 * Reported twice: on the Design desk, the Drop tool on the lead plate (not
 * the second) lays its dye under the hand and, somewhere across the plate, a
 * second reaction "like a press or a blow" — first mirrored top to bottom,
 * then left to right. The report that came with the second (Timbre Shifter,
 * two layers turned to 271 and 43 degrees, bubbles and beads on, output gain
 * 1.45 and gamma 2.5) is reproduced here as closely as a harness can, next to
 * a calm Classic plate, and each is judged the same way: the tool used low and
 * to one side of the preview, and how much every cell of a 6x6 grid over the
 * preview changed, against the plate's own drift over the same time. The
 * cells round the hand must change; no cell away from them may change by much
 * more than the plate does on its own. Where one does, it is printed, with
 * whether it is the hand's mirror image across either axis or the centre.
 *
 * Four times over, at the same spot, and the maps averaged. Judged on one
 * drop, a calm Classic plate "echoed" in a different cell every run, with no
 * bubble on it: a bead merging or a drip landing in the window. An echo of
 * the hand comes back every time; those do not.
 *
 * The Press echoes on the reported plate (the same cell, the hand's mirror
 * top to bottom on the screen, three runs out of three), so its variants
 * switch one suspect off at a time — the plate's turn, the bubbles, the
 * beads, the output pass — and a failure says which one it follows.
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

const G = 6, REPS = 4;
// Nothing but the hand moves the dye: the music, the turbulence, the drips and the turning held still.
const CALM = {
  turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
  rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, rotationSpeed: 0, spinImpulse: 0,
  audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
};
const REPORTED_OUTPUT = {
  flipX: false, flipY: false, corners: [0, 0, 1, 0, 1, 1, 0, 1], maskTop: 0, maskRight: 0, maskBottom: 0,
  maskLeft: 0, maskFeather: 0, gain: 1.45, gamma: 2.5, flashGuard: true, surfaces: [],
};
const PLAIN_OUTPUT = { ...REPORTED_OUTPUT, gain: 1, gamma: 1 };
const TIMBRE = { look: 'timbre-shifter', rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {} };
const SCENARIOS = [
  { name: 'Classic, calm, layer 1', look: 'classic', layer: 0, rotation: [0, 0], settings: { layerCount: 2 } },
  { name: 'Classic, calm, layer 2', look: 'classic', layer: 1, rotation: [0, 0], settings: { layerCount: 2 } },
  { ...TIMBRE, name: 'Timbre Shifter as reported, layer 1', layer: 0 },
  { ...TIMBRE, name: 'Timbre Shifter as reported, layer 2', layer: 1 },
  { ...TIMBRE, name: 'the Press, reported plate, layer 1', layer: 0, tool: 'press' },
  { ...TIMBRE, name: 'the Press, plate not turned', layer: 0, tool: 'press', rotation: [0, 0.75] },
  { ...TIMBRE, name: 'the Press, no beads', layer: 0, tool: 'press', settings: { beads: 0 } },
  { ...TIMBRE, name: 'the Press, no output pass', layer: 0, tool: 'press', output: PLAIN_OUTPUT },
  { ...TIMBRE, name: 'the Press, layer 2', layer: 1, tool: 'press' },
  // Does pressing the front glass press the second plate too, turned its own way?
  { ...TIMBRE, name: 'the Press, one plate only', layer: 0, tool: 'press', settings: { layerCount: 1 } },
];

const browser = await launchChromium(chromium);
try {
  for (const sc of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1418, height: 703 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'design'); } catch { /* none */ } });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${sc.look}${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    await page.evaluate(({ sc, CALM }) => {
      window.chromaglassSettings?.({ ...CALM, ...sc.settings });
      if (sc.output) window.chromaglassOutput?.(sc.output);
      if (sc.rotation) window.chromaglassRotation?.(sc.rotation);
      window.chromaglassLayer?.(sc.layer);
      window.chromaglassTool?.(sc.tool ?? 'dropper');
    }, { sc, CALM });
    await page.waitForTimeout(3000);
    const hole = await page.getByTestId('desk-preview').boundingBox();
    if (!hole) { check(`${sc.name}: the Design desk's preview is there`, false); await page.close(); continue; }
    // Pictures stay in the page and only the 6x6 means come back: shipping
    // every pixel out as JSON made ten scenarios outrun the job's timeout.
    let shots = 0;
    const shot = async () => {
      const png = await page.screenshot({ clip: hole });
      const id = shots++;
      await page.evaluate(async ({ b64, id }) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        (window.__shots ??= {})[id] = x.getImageData(0, 0, img.width, img.height);
      }, { b64: png.toString('base64'), id });
      return id;
    };
    const grid = (ia, ib) => page.evaluate(({ ia, ib, G }) => {
      const a = window.__shots[ia], b = window.__shots[ib];
      const out = Array.from({ length: G }, () => Array(G).fill(0));
      const n = Array.from({ length: G }, () => Array(G).fill(0));
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4;
        const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        const gx = Math.min(G - 1, Math.floor(x / a.width * G)), gy = Math.min(G - 1, Math.floor(y / a.height * G));
        out[gy][gx] += d; n[gy][gx]++;
      }
      return out.map((row, y) => row.map((v, x) => v / Math.max(1, n[y][x])));
    }, { ia, ib, G });
    const add = (acc, m) => acc.forEach((row, y) => row.forEach((_, x) => { row[x] += m[y][x] / REPS; }));
    const zero = () => Array.from({ length: G }, () => Array(G).fill(0));
    // Low and to the right, so its mirror images across each axis and the centre are three different cells.
    const at = { fx: 0.75, fy: 0.75 };
    const hx = hole.x + hole.width * at.fx, hy = hole.y + hole.height * at.fy;
    const drift = zero(), change = zero();
    let hand = null;
    for (let rep = 0; rep < REPS; rep++) {
      const a = await shot(); await page.waitForTimeout(1300); const b = await shot();
      await page.mouse.move(hx, hy);
      await page.mouse.down();
      if (!hand) hand = await page.evaluate(() => window.chromaglassDebug?.().pointer?.());
      for (let k = 1; k <= 6; k++) { await page.mouse.move(hx + k * 2, hy + k); await page.waitForTimeout(100); }
      await page.mouse.up();
      await page.mouse.move(hole.x + hole.width * 0.02, hole.y + hole.height * 0.02);
      await page.waitForTimeout(500);
      const c = await shot();
      add(drift, await grid(a, b)); add(change, await grid(b, c));
      await page.evaluate(() => { window.__shots = {}; });
    }
    const cellOf = (fx, fy) => [Math.min(G - 1, Math.floor(fy * G)), Math.min(G - 1, Math.floor(fx * G))];
    const [cy, cx] = cellOf(at.fx, at.fy);
    const tags = new Map([
      [cellOf(at.fx, 1 - at.fy).join(), 'mirror top/bottom'],
      [cellOf(1 - at.fx, at.fy).join(), 'mirror left/right'],
      [cellOf(1 - at.fx, 1 - at.fy).join(), 'mirror through the centre'],
    ]);
    const near = (y, x) => Math.abs(y - cy) <= 1 && Math.abs(x - cx) <= 1;
    const here = Math.max(...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => change[cy + dy]?.[cx + dx] ?? 0)));
    const away = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (near(y, x)) continue;
      // How far past what the plate does alone, in its own terms.
      const allowed = Math.max(2 * drift[y][x] + 4, 0.3 * here);
      away.push({ y, x, v: change[y][x], allowed, over: change[y][x] / allowed, tag: tags.get(`${y},${x}`) ?? '' });
    }
    away.sort((a, b) => b.over - a.over);
    const rot = await page.evaluate(() => window.chromaglassDebug?.().rotation?.current ?? null);
    const handAt = (hand ? ` — the hand on the plate at ${(hand.x / hand.grid).toFixed(2)},${(hand.y / hand.grid).toFixed(2)}` : '')
      + (rot ? `, plates turned ${rot.map((r) => r.toFixed(2)).join(', ')}` : '');
    console.log(`     ${sc.name}: mean change by cell over ${REPS} (rows top to bottom; * the hand, m its mirror images), drift in brackets${handAt}`);
    for (let y = 0; y < G; y++) {
      console.log('       ' + change[y].map((v, x) => {
        const mark = y === cy && x === cx ? '*' : tags.has(`${y},${x}`) ? 'm' : ' ';
        return `${v.toFixed(1).padStart(6)}${mark}(${drift[y][x].toFixed(1)})`;
      }).join(''));
    }
    const worst = away[0];
    check(`${sc.name}: the tool changes the picture where it is used`, here > 3,
      `${here.toFixed(1)} round the hand`);
    check(`${sc.name}: and nowhere else`, !worst || worst.over < 1,
      worst ? `most away from the hand ${worst.v.toFixed(1)} at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}, allowed ${worst.allowed.toFixed(1)}, against ${here.toFixed(1)} round the hand` : 'nothing');
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
