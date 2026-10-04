#!/usr/bin/env node
/**
 * What the spun dish's swirl costs a frame on the looks it now runs on
 * (PLAN.md 22k), read on a GPU that draws.
 *
 *   npm run swirlcost                       laptop and phone, the nine looks
 *   npm run swirlcost -- --screen phone     one layout
 *   npm run swirlcost -- --looks galaxy,acid-trip
 *
 * Since 22h (#252) a look whose music is routed to rotation sways its dish
 * under its liquid, so Ω − ω_l is over the swirl's floor most of the time
 * and the swirl's dispatches run on every step while the band plays: the
 * nine thin looks with music on rotation. Nobody had measured what that
 * costs. This plays each of them with the built-in band, on the app's own
 * governor (`gpu=mid`, what a visitor's laptop gets), and alternates the
 * same page between the swirl let run and held off
 * (`chromaglassDebug().webgpu.swirl(false)`), on, off, off, on, so a plate
 * that drifts in cost over the measurement weighs on both sides alike (the
 * plate is chaotic and its own state changes what a step costs: compare in
 * pairs, `scripts/stages.mjs` says why). Each window reads:
 *
 *   - the solver's whole step on the GPU (timestamp queries, the profiler's
 *     `solver step`), sampled four times a second and averaged;
 *   - the frames the page drew and the steps it took, over the window;
 *   - how many of those steps ran the swirl (its own count, so a window
 *     that was meant to run it and did not says so instead of reading zero
 *     cost).
 *
 * Then once more with the step split into its stages (`stageTimings`), for
 * the swirl stage's own GPU time and its share of the split step: the
 * direct number, which the whole-step difference should agree with.
 *
 * It asserts only that the measurement measured something: the band
 * played, the swirl ran on most steps of the windows that let it and on
 * none of the windows that held it off, and the GPU gave times. What the
 * numbers are is the finding (PLAN 22k), printed as a table.
 *
 * Mac only: the app's plate does not step on a cloud session's software
 * WebGPU (SWIRLCOST_PLATE=1 to try anyway).
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = Number(process.env.SWIRLCOST_PORT ?? 4371);
const PLATE = process.platform === 'darwin' || !!process.env.SWIRLCOST_PLATE;
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// The nine thin looks with music routed to rotation (src/presets.ts).
const NINE = ['galaxy', 'cyberpunk', 'acid-trip', 'timbre-shifter', 'boiling-point',
  'aurora-borealis', 'solar-flare', 'fractal-dream', 'stardust-collapse'];
const LOOKS = argOf('looks', null)?.split(',') ?? NINE;
const SCREENS = {
  laptop: { viewport: { width: 1418, height: 703 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true },
};
const which = argOf('screen', process.env.SWIRLCOST_SCREEN ?? 'both');
const screens = which === 'both' ? ['laptop', 'phone'] : [which];
const WINDOW_MS = Number(argOf('window', 4000));
const ORDER = [true, false, false, true];

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!PLATE) {
  console.log('skip  the swirl\'s cost — no plate draws here; measured on the Mac (SWIRLCOST_PLATE=1 to run anyway)');
  process.exit(0);
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const snap = (page) => page.evaluate(() => {
  const d = window.chromaglassDebug();
  const counts = d.webgpu?.swirl?.() ?? [];
  return {
    at: performance.now(),
    frames: d.frames ?? 0,
    grid: d.status?.grid ?? 0,
    step: d.webgpu?.solver?.[0]?.['solver step'] ?? null,
    steps: counts.reduce((a, c) => a + (c?.steps ?? 0), 0),
    ran: counts.reduce((a, c) => a + (c?.ran ?? 0), 0),
    dish: d.fluids?.[0]?.lastStep?.spinDish ?? null,
    band: typeof window.__band === 'function' ? window.__band() : null,
    phone: !!document.querySelector('[data-testid="phone-stage"]'),
  };
});
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** One window: the swirl let run or held off, a second to settle, then read. */
const windowOf = async (page, on) => {
  await page.evaluate((on) => window.chromaglassDebug().webgpu?.swirl?.(on), on);
  await page.waitForTimeout(1000);
  const a = await snap(page);
  const samples = [];
  const end = Date.now() + WINDOW_MS;
  while (Date.now() < end) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => window.chromaglassDebug().webgpu?.solver?.[0]?.['solver step'] ?? null);
    if (typeof s === 'number') samples.push(s);
  }
  const b = await snap(page);
  const secs = (b.at - a.at) / 1000;
  // A count that went down is a solver the ladder built afresh mid-window:
  // its count started at zero, so what it holds is the window's since then.
  if (b.steps < a.steps) { a.steps = 0; a.ran = 0; }
  return {
    on, grid: b.grid, stepMs: mean(samples), fps: (b.frames - a.frames) / secs,
    stepsPerSec: (b.steps - a.steps) / secs, ranShare: (b.ran - a.ran) / Math.max(1, b.steps - a.steps),
    steps: b.steps - a.steps, ran: b.ran - a.ran,
  };
};

/** The step split into stages, the swirl let run: its own stage's GPU time. */
const stagesOf = async (page) => {
  await page.evaluate(() => { const w = window.chromaglassDebug().webgpu; w?.swirl?.(true); w?.stageTimings?.(true); });
  await page.waitForTimeout(1500);
  const rows = [];
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(250);
    rows.push(await page.evaluate(() => ({ ...(window.chromaglassDebug().webgpu?.solver?.[0] ?? {}) })));
  }
  await page.evaluate(() => window.chromaglassDebug().webgpu?.stageTimings?.(false));
  const swirl = mean(rows.map((r) => r.swirl ?? 0));
  const sum = mean(rows.map((r) => Object.entries(r).filter(([k]) => k !== 'solver step').reduce((a, [, ms]) => a + ms, 0)));
  return { swirl, sum };
};

const results = [];
const browser = await launchChromium(chromium, { args: ['--enable-webgpu-developer-features'] });
try {
  for (const name of screens) {
    const screen = SCREENS[name];
    const ctx = await browser.newContext({
      viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    for (const look of LOOKS) {
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${look}${engineQuery()}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.chromaglassDebug === 'function' && !!window.chromaglassDebug().webgpu?.swirl, null, { timeout: 60_000 });
      // A plate that draws, not one still building its shaders (flick.mjs says why).
      const from = Date.now();
      let steady = 0;
      while (steady < 2 && Date.now() - from < 40_000) {
        const f0 = (await snap(page)).frames;
        await page.waitForTimeout(500);
        steady = (await snap(page)).frames - f0 >= 10 ? steady + 1 : 0;
      }
      // The first gesture starts the built-in band.
      const box = await page.locator('canvas').first().boundingBox();
      const at = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: screen.viewport.width / 2, y: screen.viewport.height / 3 };
      if (screen.touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(3000);
      const windows = [];
      for (const on of ORDER) windows.push(await windowOf(page, on));
      const stages = await stagesOf(page);
      const last = await snap(page);
      results.push({ screen: name, look, windows, stages, band: last.band, phone: last.phone });
      if (process.env.SWIRLCOST_VERBOSE) console.log(JSON.stringify({ windows, stages, last }));
      const ons = windows.filter((w) => w.on), offs = windows.filter((w) => !w.on);
      const row = {
        on: mean(ons.map((w) => w.stepMs)), off: mean(offs.map((w) => w.stepMs)),
        fpsOn: mean(ons.map((w) => w.fps)), fpsOff: mean(offs.map((w) => w.fps)),
        ran: mean(ons.map((w) => w.ranShare)), ranOff: Math.max(...offs.map((w) => w.ran)),
        grid: [...new Set(windows.map((w) => w.grid))].join('/'),
      };
      Object.assign(results.at(-1), row);
      console.log(`  ${name.padEnd(6)} ${look.padEnd(18)} grid ${row.grid.padEnd(8)} step ${row.on.toFixed(2)} ms on, ${row.off.toFixed(2)} off ` +
        `(${(row.on - row.off >= 0 ? '+' : '')}${(row.on - row.off).toFixed(3)}); ${row.fpsOn.toFixed(1)} fps on, ${row.fpsOff.toFixed(1)} off; ` +
        `swirl stage ${stages.swirl.toFixed(3)} ms of ${stages.sum.toFixed(2)} split (${(stages.swirl / stages.sum * 100).toFixed(1)}%); ran ${(row.ran * 100).toFixed(0)}% of steps`);
    }
    await ctx.close();
  }
} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
} finally {
  await browser.close();
  stop();
}

for (const name of screens) {
  const rs = results.filter((r) => r.screen === name);
  if (!rs.length) continue;
  const where = name === 'phone' ? 'the phone layout' : "the laptop's layout";
  check(`${name}: every page is ${where}`, rs.every((r) => (name === 'phone') === r.phone));
  check(`${name}: the band played on every look`, rs.every((r) => !!r.band),
    rs.filter((r) => !r.band).map((r) => r.look).join(', ') || `${rs.length} looks`);
  check(`${name}: the GPU gave the step's time in every window`, rs.every((r) => r.windows.every((w) => Number.isFinite(w.stepMs))));
  const ranLow = rs.filter((r) => !(r.ran >= 0.5));
  check(`${name}: the swirl ran on most steps where it was let run`, ranLow.length === 0,
    rs.map((r) => `${r.look} ${(r.ran * 100).toFixed(0)}%`).join(', '));
  check(`${name}: and on none where it was held off`, rs.every((r) => r.ranOff === 0));
  const d = mean(rs.map((r) => r.on - r.off)), on = mean(rs.map((r) => r.on));
  const sw = mean(rs.map((r) => r.stages.swirl)), split = mean(rs.map((r) => r.stages.sum));
  console.log(`\n  ${name}: over ${rs.length} looks the step is ${on.toFixed(2)} ms with the swirl, ${(on - d).toFixed(2)} without ` +
    `(${d >= 0 ? '+' : ''}${d.toFixed(3)} ms, ${(d / (on - d) * 100).toFixed(1)}%); the swirl stage ${sw.toFixed(3)} ms of a ${split.toFixed(2)} ms split step ` +
    `(${(sw / split * 100).toFixed(1)}%); ${mean(rs.map((r) => r.fpsOn)).toFixed(1)} fps with, ${mean(rs.map((r) => r.fpsOff)).toFixed(1)} without\n`);
}

const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
