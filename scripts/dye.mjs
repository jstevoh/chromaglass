#!/usr/bin/env node
/**
 * Does a dye paint the colour you picked?
 *
 *   npm run dye                 # Sunny Side Up
 *   LOOK=galaxy npm run dye     # any look, by palette search
 *
 * From a user report: "I put red silicone on a yellow background and it came
 * out as blue on the screen."
 *
 * ── What this used to do, and why it never answered ──
 *
 * It photographed the plate before and after a mouse drag and reported the
 * average hue of the pixels that changed. That number is the dye only on a
 * plate that is otherwise still. On Galaxy it read 362,366 of 583,000 pixels
 * as "changed" and their hue as 248° — the colour of Galaxy, not of the dye.
 * Bracketing the stroke against the plate's own drift did not save it: a
 * still brush on a thin look still showed 2,549 cells gaining density when
 * the dropper can reach 69, and it returned the same 219° for a red bottle
 * and for a green one. A check that cannot tell red from green is not
 * measuring dye, whatever number it prints.
 *
 * ── What it does now ──
 *
 * Freeze the plate first (F). Frozen, the solver never steps, so it never
 * flushes the CPU-side deltas to the GPU, and `density` / `densityR..B` hold
 * exactly what the brush just put there — nothing advected in, nothing mixed
 * with what was already on the plate. Manual injection is gated only on the
 * drain, not on isActive, so the dropper still works while the liquid is
 * still. The dye's own colour is then the absorptions that appeared over the
 * density that appeared, and it comes back exact: Cherry Red reads
 * (1, 0.002, 0.002) and Limpid Green reads (0.224, 1, 0.078), which are the
 * PALETTE entries to three places.
 *
 * Green is not decoration. It is the control that proves the measurement can
 * tell one dye from another at all — the thing three earlier versions of this
 * file could not do, and did not say so.
 *
 * ── The engine ──
 *
 * `classifyGpu()` maps SwiftShader to 'software' and the quality ladder pins
 * that class to the CPU rung, so a headless check measures a renderer nobody
 * runs unless it says otherwise. `?gpu=mid` lifts that. But the governor also
 * steps the engine *down* mid-run when frames are slow, and they are slow
 * here: a run that read "GPU · 384²" at startup was measured on "CPU · 192²"
 * forty seconds later. So the grid is pinned with `?sim=384`, which takes the
 * governor out of the decision, and the engine is read at the moment of each
 * measurement rather than once at the top.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { engineName, engineQuery } from './frame.mjs';

const PORT = 4322;
const LOOK = process.env.LOOK || 'sunny';
const checks = [];
/*
  This one stays on WebGL, and says so rather than running and measuring
  nothing (docs/webgpu-plan.md, P5).

  What it measures is what colour a bottle deposits, by diffing the CPU's own
  density and colour arrays before and after a brush stroke. Those arrays are
  where the WebGL path stages a pour; the WebGPU path stages it on the GPU and
  mirrors only density back, so every reading here would be zero and every
  check would fail for a reason that has nothing to do with dye.

  What would be lost by not running it here is covered elsewhere: the bottle's
  chemistry is CPU-side and shared by both engines, and that a pour deposits
  the same dye whichever solver takes it is `npm run parity`'s gate — the same
  drop through both, agreeing to 4e-5 of rms.
*/
if (engineName() !== 'webgl') {
  console.log(`the dye bottles are measured on the CPU's own arrays, which ${engineName()} does not fill.`);
  console.log('what a pour deposits on that path is `npm run parity`; nothing to do here.');
  process.exit(0);
}

const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!process.stdout.isTTY) process.stderr.write(line + '\n');
};
const note = (s) => {
  console.log(`     ${s}`);
  if (!process.stdout.isTTY) process.stderr.write(`     ${s}\n`);
};

{
  const held = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, '127.0.0.1');
  });
  if (held) {
    console.error(`port ${PORT} is in use — a previous run's preview server is still up, and this run would measure whatever build it serves.`);
    process.exit(2);
  }
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  detached: true, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });

await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);

// The bottle's colour, and a control far from it in hue so the measurement has
// to prove it can tell two dyes apart.
const DYES = [
  { hex: 'FF0000', name: 'Cherry Red',   hue: 0 },
  { hex: '39FF14', name: 'Limpid Green', hue: 111 },
];
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1e-6) return null;
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  return h;
};
const apart = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&sim=384&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = () => page.evaluate(() => window.chromaglassDebug?.().engine ?? null);

  /*
    Everything below drives the DOM directly rather than through Playwright's
    locators.

    `locator.click()` stalls in this environment: its call log stops at
    "locator resolved to <button …>" and never reports an actionability
    verdict, while a raw `page.mouse.click` at the same coordinates works and
    the button visibly takes the selection. `locator.screenshot()` stalls the
    same way, at "waiting for element to be stable" — which a plate of moving
    liquid never is. Both are the harness queueing behind a busy renderer,
    not the app.
  */
  const clickOn = async (testId) => {
    const box = await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, testId);
    if (!box) throw new Error(`no element [data-testid="${testId}"]`);
    await page.mouse.click(box.x, box.y);
  };

  /** ⌘K, type, Enter. In Design a look goes on straight away. */
  const palette = async (query) => {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);
    await page.evaluate((q) => {
      const input = document.querySelector('[data-testid="palette-input"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, query);
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  };

  await palette(LOOK);
  note(`painting on “${LOOK}”`);

  const plate = () => page.evaluate(() => {
    const r = document.querySelector('[data-testid="desk-preview"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  /*
    The desk is `fixed z-10` and its preview is a transparent hole in it, so
    whether the plate can be painted at all comes down to which element is
    topmost over that hole. It was the hole: the plate showed through and every
    mousedown landed on the desk, the canvas's own listeners never fired, and
    the bottles, the dyes and all seven tools did nothing on either desk. What
    that looks like from the room is the preset carrying on untouched, which
    on a blue look is a red bottle "coming out blue".
  */
  {
    const c = await plate();
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { isCanvas: el === document.getElementById('liquid-canvas'), what: el?.dataset?.testid || el?.id || el?.tagName || 'nothing' };
    }, [c.x, c.y]);
    check('the plate takes the pointer, not the desk over it', hit.isCanvas, `the cursor is over ${hit.what}`);
  }

  // Frozen from here on: the solver stops, so nothing advects and nothing is
  // flushed to the GPU, and the delta arrays are the brush's own output.
  await page.keyboard.press('f');
  await page.waitForTimeout(1200);

  /** The dye that was just injected: absorptions that appeared over density that appeared. */
  const injected = () => page.evaluate(() => {
    const f = window.chromaglassDebug().fluids[0];
    const A = window.__dyeBefore, n = f.density.length;
    const gains = [];
    for (let i = 0; i < n; i++) {
      const d = f.density[i] - A[i * 4 + 3];
      if (d > 1e-4) gains.push([d, i]);
    }
    gains.sort((p, q) => q[0] - p[0]);
    let r = 0, g = 0, b = 0, d = 0;
    for (const [, i] of gains.slice(0, 80)) {          // the dropper's own disc
      r += f.densityR[i] - A[i * 4]; g += f.densityG[i] - A[i * 4 + 1];
      b += f.densityB[i] - A[i * 4 + 2]; d += f.density[i] - A[i * 4 + 3];
    }
    // The store is log-space absorption per unit density (Scott Burns
    // geometric-mean mixing); the renderer undoes it as exp(-absorption/density).
    return d < 1e-4 ? { cells: gains.length, density: d, rgb: null }
      : { cells: gains.length, density: d, rgb: [Math.exp(-r / d), Math.exp(-g / d), Math.exp(-b / d)] };
  });

  const snapshot = () => page.evaluate(() => {
    const f = window.chromaglassDebug().fluids[0], n = f.density.length;
    const A = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      A[i * 4] = f.densityR[i]; A[i * 4 + 1] = f.densityG[i];
      A[i * 4 + 2] = f.densityB[i]; A[i * 4 + 3] = f.density[i];
    }
    window.__dyeBefore = A;
  });

  const run = async (bottleId, dye) => {
    const label = `${bottleId} · ${dye.name}`;
    await clickOn(`bottle-${bottleId}`);
    await page.waitForTimeout(400);
    await clickOn(`swatch-${dye.hex}`);
    await page.waitForTimeout(600);

    const picked = await page.evaluate((hex) => {
      const el = document.querySelector(`[data-testid="swatch-${hex}"]`);
      return !!el && /FAFAFA|250, 250, 250/.test(getComputedStyle(el).boxShadow);
    }, dye.hex);
    check(`${label}: the bottle is set`, picked, picked ? `#${dye.hex} selected` : 'the swatch does not read as selected');

    await snapshot();
    const c = await plate();
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(500);       // a still brush: one disc, not a smear
    await page.mouse.up();
    await page.waitForTimeout(200);

    const eng = await engine();
    check(`${label}: measured on the GPU solver`, /^GPU/.test(eng ?? ''), eng ?? 'no debug hook');

    const out = await injected();
    check(`${label}: the brush put dye on the plate`, out.rgb !== null && out.cells > 10,
      `${out.cells} cells, ${out.density.toFixed(1)} density`);
    if (!out.rgb) return;

    const h = hueOf(...out.rgb);
    const off = h == null ? 999 : apart(h, dye.hue);
    note(`${label}: injected rgb ${out.rgb.map(v => v.toFixed(3)).join(', ')} — ${h == null ? 'grey' : `${h.toFixed(0)}°`}`);
    check(`${label}: paints the colour the bottle is set to`, off < 20,
      `${h == null ? 'grey' : `${h.toFixed(0)}°`}, ${off.toFixed(0)}° from ${dye.name}`);
  };

  // Silicone carries a behaviour (soap 0.8, repel 0.45) and lays a fifth as
  // much dye as water, so running both says whether anything that goes wrong
  // belongs to the liquid rather than to the dye path.
  for (const bottle of ['silicone', 'water']) {
    for (const dye of DYES) await run(bottle, dye);
  }
} finally {
  await browser.close();
  stop();
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
