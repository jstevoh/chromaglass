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
 * a calm Classic plate, and each is judged the same way: a drop low and to one
 * side of the preview, and how much every cell of a 6x6 grid over the preview
 * changed, against the plate's own drift over the same time. The cells round
 * the hand must change; no cell away from them may change by much more than
 * the plate does on its own. Where one does, it is printed, with whether it
 * is the hand's mirror image across either axis or the centre.
 *
 * Variants of the reported plate switch off one suspect at a time (the
 * bubbles, the output pass), so a failure says which one it follows.
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

const G = 6;
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
const SCENARIOS = [
  { name: 'Classic, calm, layer 1', look: 'classic', layer: 0, settings: { layerCount: 2 } },
  { name: 'Classic, calm, layer 2', look: 'classic', layer: 1, settings: { layerCount: 2 } },
  // Classic, calm, echoed on layer 1 with the Drop laying paint alone: what
  // else a drop on the lead plate does is burst and shove its bubbles, shove
  // its beads, and put the liquid's properties down. One of each off.
  { name: 'Classic, layer 1, no bubbles', look: 'classic', layer: 0, settings: { layerCount: 2, bubbles: 0 } },
  { name: 'Classic, layer 1, no beads', look: 'classic', layer: 0, settings: { layerCount: 2, beads: 0 } },
  { name: 'Classic, layer 1, neither', look: 'classic', layer: 0, settings: { layerCount: 2, bubbles: 0, beads: 0 } },
  { name: 'Timbre Shifter as reported, layer 1', look: 'timbre-shifter', layer: 0, rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {} },
  { name: '… without bubbles', look: 'timbre-shifter', layer: 0, rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: { bubbles: 0 } },
  { name: '… without the output pass', look: 'timbre-shifter', layer: 0, rotation: [4.73, 0.75], output: PLAIN_OUTPUT, settings: {} },
  { name: '… layer 2', look: 'timbre-shifter', layer: 1, rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {} },
  // The Drop no longer presses the glass; the Press still does, so whatever
  // echoed the drop's press would echo this.
  { name: '… the Press, layer 1', look: 'timbre-shifter', layer: 0, rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {}, tool: 'press' },
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
    // The bubbles, in plate units (y up), to say what they did when the echo follows them.
    const bubblesNow = () => page.evaluate(() => {
      const d = window.chromaglassDebug?.(); const f = d?.bubbles; const n = d?.pointer?.().grid ?? 192;
      return (f?.bubbles ?? []).map((b) => ({ x: b.x / n, y: b.y / n, r: b.r / n }));
    });
    const moves = (a, b) => {
      const out = [];
      for (const p of a) {
        let best = null, bd = Infinity;
        for (const q of b) { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd) { bd = dd; best = q; } }
        if (!best || bd > 0.02) out.push(`${p.x.toFixed(2)},${p.y.toFixed(2)} r${p.r.toFixed(3)} ${best && bd < 0.2 ? `→ ${best.x.toFixed(2)},${best.y.toFixed(2)}` : 'gone'}`);
      }
      for (const q of b) if (!a.some((p) => Math.hypot(q.x - p.x, q.y - p.y) < 0.2)) out.push(`new ${q.x.toFixed(2)},${q.y.toFixed(2)} r${q.r.toFixed(3)}`);
      return out.length ? out.join('; ') : 'none';
    };
    const b0 = await bubblesNow();
    const s0 = await shot(); await page.waitForTimeout(1800); const s1 = await shot();
    const b1 = await bubblesNow();
    const drift = grid(s0, s1);
    // Low and to the right, so its mirror images across each axis and the centre are three different cells.
    const at = { fx: 0.75, fy: 0.75 };
    const hx = hole.x + hole.width * at.fx, hy = hole.y + hole.height * at.fy;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    const hand = await page.evaluate(() => window.chromaglassDebug?.().pointer?.());
    for (let k = 1; k <= 6; k++) { await page.mouse.move(hx + k * 2, hy + k); await page.waitForTimeout(100); }
    await page.mouse.up();
    await page.mouse.move(hole.x + hole.width * 0.02, hole.y + hole.height * 0.02);
    await page.waitForTimeout(1200);
    const s2 = await shot();
    const b2 = await bubblesNow();
    if (hand) {
      const px = hand.x / hand.grid, py = hand.y / hand.grid;
      console.log(`     the hand on the plate ${px.toFixed(2)},${py.toFixed(2)} (its mirror across the plate's y ${px.toFixed(2)},${(1 - py).toFixed(2)}); ${b1.length} bubbles`);
    }
    console.log(`     bubbles that moved or popped while left alone: ${moves(b0, b1)}`);
    console.log(`     and across the drop: ${moves(b1, b2)}`);
    const change = grid(s1, s2);
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
      away.push({ y, x, v: change[y][x], excess: change[y][x] - 3 * Math.max(1, drift[y][x]), tag: tags.get(`${y},${x}`) ?? '' });
    }
    away.sort((a, b) => b.excess - a.excess);
    console.log(`     ${sc.name}: change by cell (rows top to bottom; * the hand, m its mirror images), drift in brackets`);
    for (let y = 0; y < G; y++) {
      console.log('       ' + change[y].map((v, x) => {
        const mark = y === cy && x === cx ? '*' : tags.has(`${y},${x}`) ? 'm' : ' ';
        return `${v.toFixed(1).padStart(6)}${mark}(${drift[y][x].toFixed(1)})`;
      }).join(''));
    }
    const settings = await page.evaluate(() => { const s = window.chromaglassSettings?.() ?? {}; return { bubbles: s.bubbles, beads: s.beads, layerCount: s.layerCount, blend: s.blendMode }; });
    const rot = await page.evaluate(() => window.chromaglassDebug?.().rotation ?? null);
    console.log(`     (${JSON.stringify(settings)}, rotation ${JSON.stringify(rot)})`);
    const worst = away[0];
    check(`${sc.name}: a drop changes the picture where it lands`, here > 3,
      `${here.toFixed(1)} round the hand`);
    check(`${sc.name}: and nowhere else`, !worst || worst.v < Math.max(3 * drift[worst.y][worst.x] + 3, 0.25 * here),
      worst ? `most away from the hand ${worst.v.toFixed(1)} at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}, against ${here.toFixed(1)} round the hand` : 'nothing');
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
