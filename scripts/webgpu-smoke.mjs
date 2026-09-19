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

      const frame = await page.evaluate(async () => {
        const g = await window.chromaglassDebug().grabFrame();
        if (!g) return null;
        let max = 0, sum = 0;
        for (let i = 0; i < g.pixels.length; i += 4) {
          const v = Math.max(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
          if (v > max) max = v;
          sum += v;
        }
        return { width: g.width, height: g.height, max, mean: sum / (g.pixels.length / 4) };
      });
      check('grabFrame reads the frame, and the plate is black', !!frame && frame.max === 0,
        frame ? `${frame.width}×${frame.height}, brightest ${frame.max}` : 'nothing read');

      const kit = await page.evaluate(() => window.chromaglassDebug().kitSelfTest());
      check('the kit on this GPU: pipelines, ping-pong, readback, profiler', kit?.ok, kit?.detail ?? 'not run');

      const timings = await page.evaluate(() => window.chromaglassDebug().webgpu.timings);
      if (started.timestamps) check('the frame is timed on the GPU', typeof timings.plate === 'number', JSON.stringify(timings));
    }
    check('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));
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
