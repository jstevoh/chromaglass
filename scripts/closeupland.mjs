#!/usr/bin/env node
/**
 * The closeup comes in on liquid, never on bare glass.
 *
 *   npm run closeupland -- --node  the camera and the button's press (CI: logic)
 *   npm run closeupland           the app: the desk's Close-up button on a plate
 *                                 whose middle is bare (CI: the Mac's tools
 *                                 shard; PW_WEBGPU=1 in a cloud session)
 *
 * What was reported (the owner, 2026-10-29, with a screenshot of the Recipe
 * panel): "this closeup button doesn't seem to do anything besides make the
 * canvas black/empty?" The closeup's camera is Hold by default, aimed at the
 * middle of the plate, and Hold sat on its aim and nowhere else, so on a plate
 * whose middle was bare the closeup was four times the size of nothing. In
 * the app (software WebGPU), one pool a fifth of the way across a cleared
 * plate: the frame's mean 1.4 of 255 and no pixel over 24, for as long as the
 * closeup was in. And the button flipped `macroMode` alone, so the frame went
 * to 4x while the Macro Zoom knob beside it read 1.00x.
 *
 * The node half drives the real MacroCamera (src/lib/macroCamera.ts) on
 * made-up plates at 4x, through a 16:10 frame:
 *
 *   1. the control: on the plate of the report (one pool off the middle), the
 *      frame on the aim, where Hold used to sit, holds under BARE of the
 *      plate's average dye. Without it the lines below could pass on a plate
 *      that never gave the camera bare glass to come in on
 *   2. Hold and Follow, coming in on that plate, frame the pool from the first
 *      frame: the frame holds at least half what the plate's fullest frame
 *      holds, and the pool's middle is in the middle third of it
 *   3. with liquid under the aim, Hold does not move: the frame stays on the
 *      aim to 1e-6 (a look whose middle is full comes in where it always did)
 *   4. nearest, not fullest: two equal pools, it lands on the one by the aim
 *   5. a hand that moves the aim during the closeup is obeyed, onto bare glass
 *      if that is where it points
 *   6. an empty plate coming in waits on the aim, and lands on the first pour,
 *      in Hold and in Follow; a zoom ramped in from 1.01x (the pinch, the
 *      slider) lands too; a switch from Auto to Hold mid-closeup does not
 *   7. out and in again lands again, whatever a hand did last time
 *   8. the button's press (`closeupToggle`, the M key's too) goes in by the
 *      zoom, to 4x, and comes out to the plate with both settings; a look
 *      carrying a zoom with the flag off is read as in
 *
 * The app half: classic, the plate cleared and one pool laid at (0.22, 0.30)
 * through the debug hook; at 1x the pool is drawn (the control: a black frame
 * is also what a frame that could not be read gives); the readback's dye in
 * the 4x frame on the aim is under BARE of the plate's (the control for the
 * press); the desk's Close-up button pressed: lit, the knob at 4x, over
 * LIT_SHARE of the frame's pixels lit with the shot on the pool and the aim
 * still bare; pressed again, out at 1x.
 */
import { MacroCamera } from '../src/lib/macroCamera.ts';
import { stream } from '../src/lib/rng.ts';
import { closeupToggle } from '../src/sim/constants.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

/** A held frame under this share of the plate's average dye is bare glass (BARE_SHARE in macroCamera.ts). */
const BARE = 0.1;
/** Share of the app's 4x frame that must be lit (pixels over 24 of 255); measured 0.00 before, 0.32 with the landing before it was centred. */
const LIT_SHARE = 0.15;

const fx = (v) => v.toFixed(3);

if (process.argv.includes('--node')) {
  const SIZE = 192, DT = 1 / 60, ZOOM = 4;
  const spanX = 1 / 1.5, spanY = spanX / 1.6;
  const hx = spanX / ZOOM * 0.5 * SIZE, hy = spanY / ZOOM * 0.5 * SIZE;
  const plate = () => ({ density: new Float32Array(SIZE * SIZE), size: SIZE });
  const pour = (f, u, v, amp = 2, r = 7) => {
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
      f.density[j * SIZE + i] += amp * Math.exp(-((i - u * SIZE) ** 2 + (j - v * SIZE) ** 2) / (r * r));
    }
  };
  const opts = (mode, aimX = 0.5, aimY = 0.5) => ({ zoom: ZOOM, chase: 0.6, hold: 5, spanX, spanY, mode, aimX, aimY });
  const mean = (f, cx, cy) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, Math.floor(cy - hy)); j <= Math.min(SIZE - 1, Math.ceil(cy + hy)); j++) {
      for (let i = Math.max(0, Math.floor(cx - hx)); i <= Math.min(SIZE - 1, Math.ceil(cx + hx)); i++) { s += f.density[j * SIZE + i]; n++; }
    }
    return s / n;
  };
  const plateMean = (f) => f.density.reduce((a, b) => a + b, 0) / f.density.length;
  const fullest = (f) => {
    let best = 0;
    for (let y = hy; y <= SIZE - hy; y += 2) for (let x = hx; x <= SIZE - hx; x += 2) best = Math.max(best, mean(f, x, y));
    return best;
  };
  /** How much of the fullest frame's dye the shot's frame holds, and how far (in frame halves) a point is from its middle. */
  const read = (f, shot, u, v) => ({
    share: mean(f, shot.cx * SIZE, shot.cy * SIZE) / fullest(f),
    off: Math.max(Math.abs(u - shot.cx) * SIZE / hx, Math.abs(v - shot.cy) * SIZE / hy),
  });

  // 1. The plate of the report.
  const report = plate();
  pour(report, 0.22, 0.30);
  const onAim = mean(report, SIZE / 2, SIZE / 2) / plateMean(report);
  check('the control: on the plate of the report, the frame on the aim is bare glass', onAim < BARE,
    `the frame where Hold used to sit holds ${fx(onAim)} of the plate's average dye (under ${BARE} wanted)`);

  // 2. Hold and Follow come in on it.
  for (const mode of ['hold', 'follow']) {
    const cam = new MacroCamera(stream('plate.macro'));
    const first = read(report, cam.update(report, DT, opts(mode)), 0.22, 0.30);
    let shot;
    for (let t = 0; t < 60; t++) shot = cam.update(report, DT, opts(mode));
    const last = read(report, shot, 0.22, 0.30);
    check(`${mode}, coming in on bare glass, frames the pool from the first frame`,
      first.share >= 0.5 && last.share >= 0.5 && first.off < 1 / 3 && last.off < 1 / 3,
      `the frame holds ${fx(first.share)} then ${fx(last.share)} of the fullest frame's dye (0.5 wanted), the pool ${fx(first.off)} then ${fx(last.off)} of a half-frame off its middle (under 0.333 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 3. Liquid under the aim: Hold stays.
  {
    const f = plate();
    pour(f, 0.5, 0.5, 1.5, 6); pour(f, 0.22, 0.30, 3, 9);
    const cam = new MacroCamera(stream('plate.macro'));
    let worst = 0;
    for (let t = 0; t < 60; t++) { const s = cam.update(f, DT, opts('hold')); worst = Math.max(worst, Math.hypot(s.cx - 0.5, s.cy - 0.5)); }
    check('with liquid under the aim, Hold comes in on the aim', worst < 1e-6,
      `the frame strayed ${worst.toExponential(1)} of the plate from it (a fuller pool elsewhere; under 1e-6 wanted)`);
  }

  // 4. Nearest, not fullest.
  {
    const f = plate();
    pour(f, 0.35, 0.55); pour(f, 0.82, 0.8, 2.4);
    const cam = new MacroCamera(stream('plate.macro'));
    let shot;
    for (let t = 0; t < 30; t++) shot = cam.update(f, DT, opts('hold'));
    const r = read(f, shot, 0.35, 0.55);
    check('it lands on the pool by the aim, not the fullest across the plate', r.off < 1 / 3,
      `the near pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 5. A hand's aim during the closeup is obeyed, onto bare glass.
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold'));
    let shot;
    for (let t = 0; t < 90; t++) shot = cam.update(report, DT, opts('hold', 0.7, 0.65));
    const miss = Math.hypot(shot.cx - 0.7, shot.cy - 0.65);
    const bare = mean(report, shot.cx * SIZE, shot.cy * SIZE) / plateMean(report);
    check('a hand that moves the aim onto bare glass is obeyed', miss < 0.005 && bare < BARE,
      `the frame ${fx(miss)} of the plate from the hand's aim (under 0.005 wanted), on ${fx(bare)} of the plate's average dye`);
  }

  // 6. An empty plate comes in on the aim and lands on the first pour.
  for (const mode of ['hold', 'follow']) {
    const f = plate();
    const cam = new MacroCamera(stream('plate.macro'));
    let waited = 0, shot;
    for (let t = 0; t < 60; t++) { shot = cam.update(f, DT, opts(mode)); waited = Math.max(waited, Math.hypot(shot.cx - 0.5, shot.cy - 0.5)); }
    pour(f, 0.72, 0.3);
    shot = cam.update(f, DT, opts(mode));
    const r = read(f, shot, 0.72, 0.3);
    check(`${mode}, an empty plate waits on the aim and lands on the first pour`, waited < 1e-6 && r.off < 1 / 3,
      `${waited.toExponential(1)} of the plate off the aim while empty (under 1e-6 wanted), then the pour ${fx(r.off)} of a half-frame off the middle the frame it was poured (under 0.333 wanted)`);
  }

  // 6b. The pinch and the slider come in a notch at a time: 1.01x is
  // nearly the whole plate, and not bare, so the landing is asked again
  // until the zoom is fully in (the review's ramp ended on 0.5, 0.5).
  for (const mode of ['hold', 'follow']) {
    const cam = new MacroCamera(stream('plate.macro'));
    let shot;
    for (let t = 0; t <= 60; t++) shot = cam.update(report, DT, { ...opts(mode), zoom: 1.01 + (ZOOM - 1.01) * Math.min(1, t / 60) });
    for (let t = 0; t < 30; t++) shot = cam.update(report, DT, opts(mode));
    const r = read(report, shot, 0.22, 0.30);
    check(`${mode}, a zoom ramped in from 1.01x lands on the pool`, r.off < 1 / 3 && r.share >= 0.5,
      `the pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted), the frame ${fx(r.share)} of the fullest's dye (0.5 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 6c. A switch from Auto to Hold during the closeup is a hand on the
  // camera, not the closeup coming in: Hold goes to its aim, glass or not
  // (App writes the camera's centre into the aim as it switches, QA-12, so
  // in the app this is no move at all; `npm run holdjump`).
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 60; t++) cam.update(report, DT, opts('auto'));
    let shot;
    for (let t = 0; t < 90; t++) shot = cam.update(report, DT, opts('hold'));
    const miss = Math.hypot(shot.cx - 0.5, shot.cy - 0.5);
    check('a switch from Auto to Hold mid-closeup is not a landing', miss < 0.005,
      `the frame ${fx(miss)} of the plate from Hold's aim on bare glass (under 0.005 wanted)`);
  }

  // 7. Out and in again lands again.
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold', 0.7, 0.65));
    cam.reset();   // what LiquidVisualizer does as the closeup comes in
    let shot;
    for (let t = 0; t < 30; t++) shot = cam.update(report, DT, opts('hold', 0.7, 0.65));
    const r = read(report, shot, 0.22, 0.30);
    check('out and in again, it lands again', r.off < 1 / 3,
      `the pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted), the aim left on bare glass by a hand the time before`);
  }

  // 8. The button's press.
  {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const inFromPlate = closeupToggle({ macroMode: false, macroZoom: 1 });
    const outOfFlag = closeupToggle({ macroMode: true, macroZoom: 1 });
    const outOfZoom = closeupToggle({ macroMode: false, macroZoom: 2.1 });
    const outOfBoth = closeupToggle({ macroMode: true, macroZoom: 6 });
    check('the Close-up press goes in by the zoom and out with both settings',
      same(inFromPlate, { macroMode: true, macroZoom: 4 }) && same(outOfFlag, { macroMode: false, macroZoom: 1 })
      && same(outOfZoom, { macroMode: false, macroZoom: 1 }) && same(outOfBoth, { macroMode: false, macroZoom: 1 }),
      `in ${JSON.stringify(inFromPlate)}; out of a flag-only look ${JSON.stringify(outOfFlag)}, of a zoom-only look ${JSON.stringify(outOfZoom)}`);
  }
} else {
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const { launchChromium, presentsInXvfb } = await import('./chromium.mjs');
  const { engineQuery, installFrameReader, frameOf, waitForShow, waitForEngine, settlePlate } = await import('./frame.mjs');
  const PORT = 4793;
  const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: 'ignore' });
  const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await launchChromium(chromium, { present: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
    const opened = await waitForShow(page, presentsInXvfb() ? 300_000 : 60_000);
    if (opened === null) throw new Error('the show never opened');
    await waitForEngine(page);
    await settlePlate(page, 3000);
    /*
      The plate of the report: cleared, one pool off the middle. The look's
      opening may still be pouring when a software plate gets here (it did
      on the first run of this in a cloud session: the frame on the aim held
      3.6 times the plate's average after the clear), so the clear is laid
      again until the plate stays as laid, at most four times; the control
      below says whether it did.
    */
    const layPool = () => page.evaluate(() => {
      const d = window.chromaglassDebug(); const f = d.fluids[0]; const N = d.gridSize;
      f.clearAll();
      for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
        if (i * i + j * j < 100) f.addDensity(Math.round(N * 0.22) + i, Math.round(N * 0.3) + j, 1.5, 1, 0.3, 0.1);
      }
      f.markDirty();
    });
    const lit = async () => {
      const px = await frameOf(page, 160, 100);
      if (!px) return null;
      let n = 0, top = 0;
      for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; if (l > 24) n++; if (l > top) top = l; }
      lit.top = top;
      return n / (px.length / 4);
    };
    const state = () => page.evaluate(() => {
      const d = window.chromaglassDebug(); const rd = d.fluids[0].readDensity; const N = d.gridSize; const s = d.settings;
      // The 4x frame on the aim, as the camera reads it (a 16:10 canvas, the frame 1/1.5 of the plate across at 1x).
      const hx = (1 / 1.5) / 4 * 0.5 * N, hy = hx / 1.6;
      let all = 0, frame = 0, n = 0;
      for (let k = 0; k < rd.length; k++) all += Math.max(0, rd[k]);
      const cx = (s.macroAimX ?? 0.5) * N, cy = (s.macroAimY ?? 0.5) * N;
      for (let j = Math.floor(cy - hy); j <= Math.ceil(cy + hy); j++) for (let i = Math.floor(cx - hx); i <= Math.ceil(cx + hx); i++) { frame += Math.max(0, rd[i + j * N]); n++; }
      // How far the shot is from the pool, in halves of the frame it shows.
      const c = document.querySelector('#liquid-canvas') ?? document.querySelector('canvas');
      const w = c?.width || 16, h = c?.height || 10, maxDim = Math.max(w, h) * 1.5, z = Math.max(1, d.shot.zoom);
      const off = Math.max(Math.abs(d.shot.cx - 0.22) / (w / maxDim / z * 0.5), Math.abs(d.shot.cy - 0.3) / (h / maxDim / z * 0.5));
      return { onAim: (frame / n) / (all / rd.length), off, zoom: d.shot.zoom, macroMode: s.macroMode, macroZoom: s.macroZoom };
    });
    let before = null;
    for (let tries = 0; tries < 4 && !(before?.onAim < BARE); tries++) {
      await layPool();
      await settlePlate(page, 2000);
      before = await state();
    }
    /*
      Then the pool laid once more, fresh, and the closeup pressed on it at
      once. On the Mac two seconds is 120 of classic's steps at Turbulence
      0.5, and on a re-run its 1x frame read 0.000 lit where three runs had
      read 0.017 to 0.026: the pool stirred thin, under the 24 of 255 the
      line counts, which the 4x frame's exposure (kept under what the frame
      holds) still lit. The plate stays as laid now (the loop above), so a
      fresh pool needs a frame or two drawn, not two seconds of stirring.
    */
    if (before?.onAim < BARE) {
      await layPool();
      await settlePlate(page, 250);
      before = await state();
    }
    const flat = await lit();
    // The pool is about half a percent of the plate; measured 0.017 to
    // 0.026 of the 1x frame lit two seconds after it was laid.
    check('the control: at 1x the pool is drawn', flat !== null && flat > 0.005,
      `${flat === null ? 'no frame read' : fx(flat)} of the frame lit, its brightest pixel ${Math.round(lit.top ?? 0)} of 255 (over 0.005 wanted: a frame that could not be read is black too)`);
    check('the control: the frame on the aim is bare glass', before.onAim < BARE,
      `the 4x frame on the aim holds ${fx(before.onAim)} of the plate's average dye (under ${BARE} wanted)`);
    const button = page.locator('[data-testid="macro-button"]');
    // Clicked in the page: a software plate's frames outlast Playwright's own wait after a click.
    await button.evaluate((b) => b.click());
    await settlePlate(page, 1500);
    const inside = await state();
    const pressed = await button.getAttribute('aria-pressed');
    const close = await lit();
    // Lit, and lit by the pool: the shot on it, and the aim still bare, so
    // a look that poured into the middle meanwhile cannot light the frame
    // for the old camera.
    check('Close-up lands on the liquid, not on bare glass',
      close !== null && close > LIT_SHARE && inside.off < 1 / 3 && inside.onAim < BARE,
      `${close === null ? 'no frame read' : fx(close)} of the 4x frame lit (over ${LIT_SHARE} wanted), the pool ${fx(inside.off)} of a half-frame off its middle (under 0.333 wanted), the aim's frame still ${fx(inside.onAim)} of the plate's average`);
    check('and the button lights and the zoom reads 4x', pressed === 'true' && inside.macroZoom === 4 && inside.zoom > 3,
      `aria-pressed ${pressed}, Macro Zoom ${inside.macroZoom}, the frame at ${fx(inside.zoom)}x`);
    await button.evaluate((b) => b.click());
    await settlePlate(page, 1000);
    const out = await state();
    check('pressed again, it is out at the plate', out.macroMode === false && out.macroZoom === 1,
      `macroMode ${out.macroMode}, Macro Zoom ${out.macroZoom}`);
  } finally {
    await browser.close();
    stop();
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
