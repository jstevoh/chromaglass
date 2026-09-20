#!/usr/bin/env node
/**
 * The WebGPU stage starts (docs/webgpu-plan.md, P1).
 *
 *   npm run webgpu
 *
 * Under `?renderer=webgpu` the app gets a device, holds a black plate at the
 * display's rate, reads its own frame back, and runs the kit's self-test on
 * the GPU; a browser with no WebGPU adapter gets the "needs WebGPU" screen;
 * and without the flag nothing has changed.
 *
 * WebGPU needs Playwright's full Chromium (`channel: 'chromium'`): the default
 * headless shell has no adapter. In CI this runs on macOS, whose runners give
 * Chromium a Metal GPU; a Linux runner's software WebGPU cannot present a
 * canvas (the P0 spike, spike/webgpu-p0).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.WEBGPU_PORT ?? 4327);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const line = `${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!process.stdout.isTTY && process.stderr.isTTY) process.stderr.write(line + '\n');
};

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
const URL_BASE = `http://localhost:${PORT}/?debug&look=classic&tier=local`;

/** Console errors, less the ones every run has nothing to do with. */
const watch = (page) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  return errors;
};

// ── With WebGPU ──────────────────────────────────────────────────────
{
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = watch(page);
    await page.goto(`${URL_BASE}&renderer=webgpu`, { waitUntil: 'load' });
    const started = await page.waitForFunction(() => window.chromaglassDebug?.().webgpu?.frames > 30 && window.chromaglassDebug().webgpu, null, { timeout: 30_000 })
      .then((h) => h.jsonValue()).catch(() => null);
    const failure = await page.evaluate(() => window.chromaglassDebug?.().gpuFailure ?? null);
    check('the stage starts under ?renderer=webgpu', !!started,
      started ? `${started.label} (${started.gpuClass}${started.fallback ? ', software' : ''}), ${started.format}, timestamps ${started.timestamps}` : `no stage${failure ? `: ${failure.failure} — ${failure.detail}` : ''}`);
    if (started) {
      const engine = await page.evaluate(() => window.chromaglassDebug().engine);
      check('the engine label says WebGPU', /^WebGPU · /.test(engine), engine);

      // Against the display's own rate, not 60: a CI runner's headless display
      // asks for 30 a second — sometimes 18, under load — and the question is
      // whether the stage answers every one of them. How *fast* a frame is
      // belongs to `npm run bench`, on a machine whose speed is known; the
      // only speed asserted here is what the frame costs us on the CPU, which
      // no amount of runner contention changes.
      const rate = await page.evaluate(() => new Promise((done) => {
        const start = window.chromaglassDebug().webgpu.frames;
        const t0 = performance.now();
        let ticks = 0;
        const tick = () => {
          ticks++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else done({ ticks, frames: window.chromaglassDebug().webgpu.frames - start, ms: performance.now() - t0 });
        };
        requestAnimationFrame(tick);
      }));
      const fps = rate.frames / (rate.ms / 1000), display = rate.ticks / (rate.ms / 1000);
      check('it draws a frame for every one the display asks for', fps >= display * 0.9,
        `${fps.toFixed(1)} fps, the display asking ${display.toFixed(1)}`);
      const cpuMs = await page.evaluate(() => window.chromaglassDebug().webgpu.cpuMs);
      check('a frame costs little to encode', cpuMs > 0 && cpuMs < 8, `${cpuMs} ms of CPU in frame()`);

      // A presented WebGPU canvas reads black, so the frame is drawn and
      // copied in one task. What it should show is a plate: lit, and carrying
      // colour rather than a grey wash. (Until P3 it was a clear, and this
      // check asked for black.)
      const frame = await page.evaluate(async () => {
        const g = await window.chromaglassDebug().grabFrame();
        if (!g) return null;
        let max = 0, sum = 0, lit = 0, colour = 0;
        for (let i = 0; i < g.pixels.length; i += 4) {
          const hi = Math.max(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
          const lo = Math.min(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
          if (hi > max) max = hi;
          sum += hi;
          if (hi > 8) lit++;
          if (hi > 40 && (hi - lo) / hi > 0.25) colour++;
        }
        const n = g.pixels.length / 4;
        return { width: g.width, height: g.height, max, mean: sum / n, lit: lit / n, colour: colour / n };
      });
      check('grabFrame reads a plate with paint on it',
        !!frame && frame.max > 64 && frame.lit > 0.5 && frame.colour > 0.05,
        frame
          ? `${frame.width}×${frame.height}, brightest ${frame.max}, ${(frame.lit * 100).toFixed(0)}% lit, ${(frame.colour * 100).toFixed(0)}% in colour`
          : 'nothing read');

      const kit = await page.evaluate(() => window.chromaglassDebug().kitSelfTest());
      check('the kit on this GPU: pipelines, ping-pong, readback, profiler', kit?.ok, kit?.detail ?? 'not run');

      const timings = await page.evaluate(() => window.chromaglassDebug().webgpu.timings);
      if (started.timestamps) check('the frame is timed on the GPU', typeof timings.plate === 'number', JSON.stringify(timings));

      // The camera. `npm run camera` proves the shader against the GLSL's;
      // what is asked here is that the app runs it — a pass of its own,
      // timed on the GPU, taking a photograph that is not the plate as drawn.
      const lens = await page.evaluate(async () => {
        const dbg = () => window.chromaglassDebug();
        const shot = async () => (await dbg().grabFrame())?.pixels ?? null;
        const settle = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
        const share = (a, b) => {
          let hits = 0;
          for (let i = 0; i < a.length; i += 4) {
            const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
            if (d >= 8) hits++;
          }
          return hits / (a.length / 4);
        };
        const d = dbg();
        d.settings.camera = 0;
        await settle(4);
        const a = await shot();
        await settle(2);
        const b = await shot();
        const floor = share(a, b);
        Object.assign(d.settings, { camera: 0.9, aperture: 0.6, bloom: 0.8, refraction: 0.6, focus: 0.3 });
        await settle(3);
        const on = share(b, await shot());
        const timed = typeof dbg().webgpu.timings.camera === 'number';
        d.settings.camera = 0;
        await settle(3);
        return { floor, on, timed };
      });
      check('the camera takes the picture when it is on',
        lens.on > 0.3 && lens.on > lens.floor * 5 && (!started.timestamps || lens.timed),
        `${(lens.on * 100).toFixed(0)}% of the frame against a floor of ${(lens.floor * 100).toFixed(1)}%` +
        (started.timestamps ? `, its pass ${lens.timed ? 'timed' : 'never timed'} on the GPU` : ''));
    }
    check('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

// ── The pictures the plate is given ──────────────────────────────────
/**
 * The mark, the film's frame and the beads' mask are pictures the page hands
 * the compositor each frame. `npm run composite` proves the WGSL *samples*
 * them as the GLSL does — it feeds both shaders the same bytes — but it
 * cannot see the upload: whether a picture reaches its texture at all, and
 * which way up it lands there. So each engine is asked to lay the same mark
 * over its own plate, and the two are compared.
 *
 * The mark is `markTest`'s gradient, white at its left edge and transparent
 * at its right, which makes the answer directional: uploaded mirrored, the
 * bright end is at the other side; uploaded upside down, the lit rows are.
 * Both engines run their own show, so the liquid underneath is never the
 * same twice — what is compared is where the picture landed, never a pixel.
 */
const laidOver = (page) => page.evaluate(async () => {
  const dbg = () => window.chromaglassDebug();
  /** The frame as it stands: WebGPU is photographed, WebGL's buffer is kept. */
  const shot = async () => {
    const d = dbg();
    if (d.grabFrame) {
      const g = await d.grabFrame();
      return g && { w: g.width, h: g.height, px: g.pixels };
    }
    const c = document.querySelector('canvas');
    const off = document.createElement('canvas');
    off.width = c.width; off.height = c.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(c, 0, 0);
    return { w: off.width, h: off.height, px: ctx.getImageData(0, 0, off.width, off.height).data };
  };
  const settle = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };

  /**
   * How much two frames differ, inside a rectangle and outside it. The
   * rectangle is where the picture was asked to go, so "inside" is the
   * picture and "outside" is the liquid moving on its own — which is the
   * floor every one of these readings is judged against.
   */
  const changed = (a, b, rect) => {
    let inHit = 0, inN = 0, outHit = 0, outN = 0, left = 0, ln = 0, right = 0, rn = 0;
    for (let i = 0, p = 0; i < a.px.length; i += 4, p++) {
      const d = Math.max(
        Math.abs(a.px[i] - b.px[i]),
        Math.abs(a.px[i + 1] - b.px[i + 1]),
        Math.abs(a.px[i + 2] - b.px[i + 2]),
      );
      const x = (p % a.w) / a.w, y = ((p / a.w) | 0) / a.h;
      if (rect && Math.abs(x - rect.cx) <= rect.hw && Math.abs(y - rect.cy) <= rect.hh) {
        inN++; if (d >= 24) inHit++;
        if (x < rect.cx) { left += d; ln++; } else { right += d; rn++; }
      } else {
        outN++; if (d >= 24) outHit++;
      }
    }
    return {
      inside: inHit / Math.max(1, inN),
      outside: outHit / Math.max(1, outN),
      lean: (left / Math.max(1, ln)) / Math.max(0.5, right / Math.max(1, rn)),
    };
  };

  const d = dbg();
  const MARK = { scale: 0.4, x: 0.5, y: 0.3, aspect: 4 };   // markTest draws 128×32
  Object.assign(d.settings, { beads: 0, markMix: 0, markScale: MARK.scale, markX: MARK.x, markY: MARK.y });
  d.markTest(true);
  await settle(4);

  const a = await shot();
  // Where the mark was sent: `markY` is measured up from the bottom of the
  // frame, and the height follows the picture's own aspect against the
  // frame's, which is the arithmetic the shader is given.
  const rect = {
    cx: MARK.x, cy: 1 - MARK.y,
    hw: MARK.scale / 2,
    hh: (MARK.scale / 2) * ((a.w / a.h) / MARK.aspect),
  };
  await settle(2);
  const b = await shot();
  const floor = changed(a, b, rect);
  d.settings.markMix = 1;
  await settle(2);
  const mark = changed(b, await shot(), rect);

  // The beads. Their field is cleared when the setting reaches zero, so the
  // picture is taken away by turning them down to nothing instead: the same
  // beads, in the same places, no longer drawn. The field repopulates every
  // thirtieth frame, which two frames cannot reach.
  d.settings.markMix = 0;
  d.settings.beads = 0.8;
  await settle(120);
  const withBeads = await shot();
  await settle(2);
  const beadFloor = changed(withBeads, await shot(), null);
  const count = dbg().beads;
  const before = await shot();
  d.settings.beads = 0.001;
  await settle(2);
  const beads = changed(before, await shot(), null);

  // The film, which is the one picture that arrives every frame rather than
  // once: a video, here a canvas of flat blue streaming to itself, because a
  // headless browser has no projector and no camera. Only its colour is
  // asked about — that a blue film makes a blue frame is enough to know the
  // video reached the texture.
  const mean = (f) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < f.px.length; i += 4) { r += f.px[i]; g += f.px[i + 1]; b += f.px[i + 2]; }
    const n = f.px.length / 4;
    return { r: r / n, g: g / n, b: b / n };
  };
  d.settings.beads = 0;
  Object.assign(d.settings, { filmMix: 0 });
  await settle(4);
  const dry = mean(await shot());
  const reel = document.createElement('canvas');
  reel.width = 320; reel.height = 180;
  const ctx2 = reel.getContext('2d');
  const paint = () => { ctx2.fillStyle = '#00b4ff'; ctx2.fillRect(0, 0, reel.width, reel.height); requestAnimationFrame(paint); };
  paint();
  const reelVideo = document.createElement('video');
  reelVideo.srcObject = reel.captureStream(30);
  reelVideo.muted = true; reelVideo.playsInline = true;
  await reelVideo.play().catch(() => {});
  await settle(8);
  const playing = { readyState: reelVideo.readyState, width: reelVideo.videoWidth };
  d.film.video = reelVideo; d.film.kind = 'file';
  d.settings.filmMix = 0.9;
  await settle(24);
  const lit = mean(await shot());
  d.settings.filmMix = 0; d.film.kind = 'none'; d.film.video = null;

  return { size: [a.w, a.h], floor, mark, beadFloor, beads, count, film: { dry, lit, playing } };
});

{
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const read = async (query) => {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${URL_BASE}${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const d = window.chromaglassDebug?.();
      return d && d.engine && d.engine !== 'WebGPU · starting' && (d.webgpu ? d.webgpu.frames > 30 : true);
    }, null, { timeout: 30_000 });
    const out = await laidOver(page);
    await page.close();
    return out;
  };
  try {
    const seen = {};
    for (const [engine, query] of [['WebGPU', '&renderer=webgpu'], ['WebGL', '']]) {
      const m = await read(query);
      seen[engine] = m;
      const pc = (v) => `${(v * 100).toFixed(1)}%`;
      check(`${engine}: the mark lands in its own rectangle, the right way round`,
        m.mark.inside > 0.35 && m.mark.inside > m.mark.outside * 5 &&
        m.mark.inside > m.floor.inside * 5 && m.mark.lean > 1.5,
        `${pc(m.mark.inside)} of the rectangle changed against ${pc(m.mark.outside)} of the rest, ` +
        `${m.mark.lean.toFixed(2)}× brighter at its left end (the floor was ${pc(m.floor.inside)})`);
      check(`${engine}: the beads' mask reaches the plate`,
        m.count > 0 && m.beads.outside > 0.015 && m.beads.outside > m.beadFloor.outside * 2.5,
        `${m.count} beads, worth ${pc(m.beads.outside)} of the frame, against ${pc(m.beadFloor.outside)} of it moving on its own`);
      const blue = (c) => c.b - c.r;
      check(`${engine}: a blue film makes a blue frame`,
        m.film.playing.readyState >= 2 && m.film.playing.width > 0 &&
        blue(m.film.lit) > blue(m.film.dry) + 12,
        `blue led red by ${blue(m.film.dry).toFixed(1)} without the film and ${blue(m.film.lit).toFixed(1)} with it`);
    }
    // The picture belongs to the page, not to the engine: the same mark, the
    // same rectangle, leaning the same way.
    const g = seen.WebGPU, w = seen.WebGL;
    check('both engines lay the mark the same way',
      Math.abs(g.mark.inside - w.mark.inside) < 0.15 && g.mark.lean > 1.5 && w.mark.lean > 1.5,
      `WebGPU ${(g.mark.inside * 100).toFixed(1)}% at ${g.mark.lean.toFixed(2)}×, ` +
      `WebGL ${(w.mark.inside * 100).toFixed(1)}% at ${w.mark.lean.toFixed(2)}×`);
  } finally {
    await browser.close();
  }
}


// ── Without an adapter ───────────────────────────────────────────────
// The default headless shell has no WebGPU adapter: the stand-in for a
// browser without it.
{
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${URL_BASE}&renderer=webgpu`, { waitUntil: 'load' });
    const screen = await page.locator('[data-testid="needs-webgpu"]').first();
    const shown = await screen.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const text = shown ? (await screen.textContent()).replace(/\s+/g, ' ').trim() : '';
    check('without WebGPU, the "needs WebGPU" screen', shown && /needs WebGPU/.test(text), text.slice(0, 90));
  } finally {
    await browser.close();
  }
}

// ── Without the flag ─────────────────────────────────────────────────
{
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${URL_BASE}`, { waitUntil: 'load' });
    const engine = await page.waitForFunction(() => {
      const e = window.chromaglassDebug?.().engine;
      return e && e !== 'WebGPU · starting' ? e : null;
    }, null, { timeout: 30_000 }).then((h) => h.jsonValue()).catch(() => null);
    check('without the flag, WebGL as before', !!engine && !/WebGPU/.test(engine), engine ?? 'no engine');
  } finally {
    await browser.close();
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
