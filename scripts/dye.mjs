#!/usr/bin/env node
/**
 * Does a dye paint the colour you picked?
 *
 *   npm run dye
 *
 * From a user report: "I put red silicone on a yellow background and it came
 * out as blue on the screen." Four hypotheses died to measurement before this
 * existed — the absorption store, the renderer, the subtractive mix, the
 * sharpening pass — and all four were tested on the CPU solver, which is not
 * the one the report came from. `classifyGpu()` maps SwiftShader to
 * 'software' and the quality ladder pins that class to the CPU rung, so every
 * headless check until now has measured a renderer nobody runs. `?gpu=mid`
 * overrides it.
 *
 * The test is the user's own: a plate with a yellow ground, a bottle set to
 * Cherry Red, painted with a real mouse drag, photographed before and after.
 * The answer is the hue of what changed.
 *
 * Silicone and water are both run, on identical plates. Silicone carries a
 * behaviour (soap 0.8, repel 0.45) and lays a fifth as much dye as water, so
 * if the colour only goes wrong for the one that changes the interface, that
 * narrows it to the liquid rather than to the dye path.
 *
 * ── A note on where to run this ──
 *
 * It has not yet produced a verdict in the sandbox it was written in. The GPU
 * solver does run there — that part was worth establishing, and it contradicts
 * an earlier claim of mine that it could not — but under software
 * rasterisation a 384² plate renders at six frames a second, every Playwright
 * step queues behind that render loop, and a run that takes a few seconds on
 * real hardware takes a quarter of an hour and does not reliably finish.
 *
 * On a machine with a GPU this is a fast check. That is where to run it.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4322;
const checks = [];
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

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

const RED = '#FF0000';           // Cherry Red, PALETTE[3]
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1e-6) return null;
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  return h;
};

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', /^GPU/.test(engine ?? ''), engine ?? 'no debug hook');
  if (!/^GPU/.test(engine ?? '')) throw new Error('not on the GPU path — the report came from that one');

  /*
    Everything below drives the DOM directly rather than through Playwright's
    locators.

    `locator.click()` stalls in this environment: its call log stops at
    "locator resolved to <button …>" and never reports an actionability
    verdict, while a raw `page.mouse.click` at the same coordinates works and
    the button visibly takes the selection. The element is stable (traced over
    twenty animation frames: one bounding box) and hit-testable
    (`elementFromPoint` returns the button itself), so this is the harness's
    machinery queueing behind a busy renderer, not the app.
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

  /*
    Which look to paint on, so the report can be chased across presets:

      LOOK="soap film" npm run dye

    Sunny Side Up by default, for its yellow ground. The reason this is a
    knob: red silicone measured 345° there — red — so whatever turns it blue
    is not the bottle, and the next suspects are per-preset renderer settings.
    Iridescence is the strongest: it is thin-film interference, which cycles
    through blue by construction, and Soap Film runs it at 0.75.
  */
  const LOOK = process.env.LOOK || 'sunny';
  await palette(LOOK);
  note(`painting on “${LOOK}”`);
  await page.waitForTimeout(3000);

  const grab = (slot) => page.evaluate((slot) => {
    const c = document.getElementById('liquid-canvas');
    const s = document.createElement('canvas');
    s.width = c.width; s.height = c.height;
    const ctx = s.getContext('2d');
    ctx.drawImage(c, 0, 0);
    (window.__dye ??= {})[slot] = ctx.getImageData(0, 0, s.width, s.height);
    return { w: s.width, h: s.height };
  }, slot);

  /** The plate's own colour, so "what the dye did" can be told from it. */
  const groundHue = async () => page.evaluate(() => {
    const d = document.getElementById('liquid-canvas');
    const s = document.createElement('canvas');
    s.width = d.width; s.height = d.height;
    s.getContext('2d').drawImage(d, 0, 0);
    const px = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    return [r / n / 255, g / n / 255, b / n / 255];
  });

  /** Paint with the real thing: a mouse drag over the canvas. */
  const paint = async () => {
    const box = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="desk-preview"]').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await page.mouse.move(cx - 40, cy);
    await page.mouse.down();
    for (let i = 0; i <= 12; i++) {
      await page.mouse.move(cx - 40 + i * 7, cy + Math.sin(i / 2) * 6);
      await page.waitForTimeout(90);
    }
    await page.mouse.up();
  };

  /*
    What hue did the *stroke* end up, as distinct from the plate it landed on?

    The first version counted every pixel that differed between a before and
    an after shot. On a quiet look that is the stroke; on a busy one it is the
    whole plate. Galaxy runs at automateRate 0.14 with thin viscosity and
    fragmenting filaments, and it reported 362,366 of 583,000 pixels
    "changed" and their average hue as 248° — which is the colour of Galaxy,
    not of the dye. Water measured 248° too, on the same plate, which is what
    gave it away: a real dye bug would not treat both bottles alike.

    So the stroke is bracketed, the way the bubble harness learned to do it.
    Two bare shots a paint-duration apart say how much the plate moves on its
    own; a pixel counts only where those two agree — the liquid did not move
    there — and the after-paint shot differs from both. Everything the plate
    did by itself is excluded by construction rather than by threshold.
  */
  const paintedHue = () => page.evaluate(() => {
    const P = window.__dye.before.data;     // before, and
    const Q = window.__dye.drift.data;      // a paint-duration later, unpainted
    const B = window.__dye.after.data;      // and after the stroke
    const d3 = (X, Y, i) =>
      Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]);
    let r = 0, g = 0, b = 0, n = 0, drifted = 0;
    for (let i = 0; i < P.length; i += 4) {
      if (d3(P, Q, i) > 24) { drifted++; continue; }   // the plate moved here: not evidence
      if (Math.min(d3(B, P, i), d3(B, Q, i)) < 30) continue;
      r += B[i]; g += B[i + 1]; b += B[i + 2]; n++;
    }
    return n ? { n, drifted, rgb: [r / n / 255, g / n / 255, b / n / 255] } : { n: 0, drifted, rgb: null };
  });

  const run = async (bottleId, label) => {
    await palette('clear the plate');
    await page.waitForTimeout(2500);
    await clickOn(`bottle-${bottleId}`);
    await page.waitForTimeout(400);
    await clickOn(`swatch-${RED.slice(1)}`);
    await page.waitForTimeout(600);

    const picked = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="swatch-FF0000"]');
      return !!el && /FAFAFA|250, 250, 250/.test(getComputedStyle(el).boxShadow);
    });
    check(`${label}: the bottle is set to Cherry Red`, picked, picked ? '#FF0000 selected' : 'the swatch does not read as selected');

    const ground = await groundHue();
    await grab('before');
    // A paint-duration of nothing at all, so the plate's own motion is on
    // record before the stroke is added to it.
    await page.waitForTimeout(5200);
    await grab('drift');
    await paint();
    await page.waitForTimeout(4000);
    await grab('after');
    const out = await paintedHue();

    check(`${label}: it actually painted something`, out.n > 1500,
      `${out.n} pixels are the stroke (${out.drifted} excluded as the plate's own drift)`);
    if (out.n > 1500) {
      const h = hueOf(...out.rgb);
      const gh = hueOf(...ground);
      let off = h == null ? 999 : Math.abs(h - 0);
      if (off > 180) off = 360 - off;
      note(`${label}: ground ${gh == null ? 'grey' : `${gh.toFixed(0)}°`}, painted ${h == null ? 'grey' : `${h.toFixed(0)}°`} ` +
           `(rgb ${out.rgb.map(v => v.toFixed(2)).join(', ')})`);
      // Red is 0°. Yellow ground is ~50°, so anything warm is explicable as
      // red over yellow; blue is 180–260° and is not.
      check(`${label}: red paints warm, not blue`,
        h != null && !(h > 150 && h < 290),
        `${h == null ? 'grey' : `${h.toFixed(0)}°`}, ${off.toFixed(0)}° from red`);
    }
  };

  await run('silicone', 'silicone');
  await run('water', 'water');
} finally {
  await browser.close();
  stop();
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
