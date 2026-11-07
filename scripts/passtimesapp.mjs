/**
 * The GPU pass readout in the app (PLAN.md 14ab-16): the half of
 * `npm run passtimes` that needs the page.
 *
 *   npm run passtimesapp
 *
 * `npm run passtimes` holds the arithmetic and the words with plain objects
 * in node. What it cannot hold is the wiring: that the visualizer asks for
 * the list on a `?debug` page, that it reaches the engine's status, and that
 * the Simulation section draws it, on the phone (the desk and the laptop are
 * the same SettingsPanel). The check-skeptic's control for #642 cut each of
 * those (the readout unmounted, the status line gone, the timestamps gate
 * removed) and the node check stayed green. This opens the app on software
 * WebGPU (`PW_WEBGPU=1`, `scripts/chromium.mjs`) at a phone's size, waits
 * for the engine, goes More → Settings → Simulation, and asks:
 *
 *   1. the engine's status carries the list (an array, or null where the GPU
 *      grants no timestamps), not undefined, which is a page that never asked;
 *   2. the readout is drawn and says what the status says: the passes and
 *      their total, "no timestamps" for null, "no timings back yet" for an
 *      empty list (SwiftShader grants timestamp-query and, at the software
 *      plate's crawl, no reading comes back in the time this waits, so the
 *      cloud and CI's Linux see the last; the Mac's GPU sees the first);
 *   3. it lies inside the phone's screen.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';

const PORT = 4337;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

let failed = 0;
const line = (ok, what, got) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${got === undefined ? '' : `  (${got})`}`);
  if (!ok) failed++;
};

const browser = await launchChromium(chromium);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  // The engine is up when its label names WebGPU: the readout lives in the engine's status.
  let engine = '';
  for (let i = 0; i < 240 && !engine.startsWith('WebGPU ·'); i++) {
    await page.waitForTimeout(250);
    engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? '').catch(() => '');
  }
  line(engine.startsWith('WebGPU ·'), 'the app is running on WebGPU', engine || 'no engine');
  const tap = async (id) => { await page.getByTestId(id).first().tap(); await page.waitForTimeout(300); };
  await tap('phone-open-more');
  await tap('phone-settings');
  await tap('settings-nav-simulation');
  // The status is told once a second; the panel polls once a second.
  for (let i = 0; i < 16 && !(await page.getByTestId('gpu-passes').count()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1200);
  const got = await page.evaluate(() => {
    const passes = window.chromaglassDebug?.().status?.gpuPasses;
    const el = document.querySelector('[data-testid="gpu-passes"]');
    let box = null;
    if (el) { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); box = { left: r.left, right: r.right, width: window.innerWidth }; }
    return { kind: passes === undefined ? 'undefined' : passes === null ? 'null' : `array of ${passes.length}`, total: Array.isArray(passes) ? passes.reduce((a, p) => a + p.ms, 0) : 0, text: el?.textContent ?? null, box };
  });
  line(got.kind !== 'undefined', "on a ?debug page the engine's status carries the pass list", got.kind);
  const says = got.kind === 'null' ? /no timestamps/
    : got.kind === 'array of 0' ? /no timings back yet/
      : new RegExp(`GPU ${got.total.toFixed(1).replace('.', '\\.')} ms a frame, by pass`);
  line(!!got.text && says.test(got.text), 'the phone\'s Settings → Simulation draws it, saying what the status says', got.text ? `"${got.text.slice(0, 80)}" for ${got.kind}` : 'not drawn');
  line(!!got.box && got.box.left >= 0 && got.box.right <= got.box.width + 0.5, 'inside the phone\'s screen',
    got.box ? `${Math.round(got.box.left)}–${Math.round(got.box.right)} of ${got.box.width} px` : 'not drawn');
} finally {
  await browser.close();
  stop();
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
