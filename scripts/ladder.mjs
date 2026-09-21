/**
 * What each rung of the quality ladder actually costs.
 *
 * The governor walks a list of rungs — a solver grid and a number of device
 * pixels — stepping down when frames are slow and up when they are fast. It
 * has no idea what any of them costs. The order of the list *is* its model,
 * and the list was written on the assumption that a finer grid costs
 * proportionally more, which measurement says is not true: from 96² to 768²
 * the solver sees sixty-four times the cells for eleven times the cost
 * (docs/webgpu-plan.md). So a step down the ladder may save a great deal or
 * almost nothing, and nothing in the app knows which.
 *
 * This measures it. `?rung=N` holds the governor on one rung — the whole
 * rung, grid and pixels together, which `?sim=` could not do — and each is
 * sampled for its frame time, its solver cost and its drawing cost.
 *
 *   npm run ladder                    every rung, twice, alternating
 *   npm run ladder -- --repeats 3     more passes for a quieter median
 *   npm run ladder -- --seconds 20    longer on each
 *
 * **Alternating is the point, not a nicety.** The plate is chaotic and its
 * state changes what a step costs; one pass over the grids read 384² as
 * slower than 512², which would have meant a rung costing more than the
 * finer one above it. Measured again with the two alternating, it was not.
 * So this walks the ladder top to bottom, then bottom to top, and reports
 * the median of what it saw — never one run of one rung.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { isGpuEngine } from './frame.mjs';

const PORT = 4333;
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SECONDS = Number(argOf('seconds', 14)) || 14;
const REPEATS = Number(argOf('repeats', 2)) || 2;
/** `?gpu=` — measure the ladder a different machine class would be given. */
const GPU = argOf('gpu', 'strong');
const TIER = argOf('tier', 'local');
/**
 * `--device-pixels N` — what `window.devicePixelRatio` reports.
 *
 * The half of a rung nobody had measured. Headless Chrome says 1, which is a
 * projector and an external monitor, and on that display half the local
 * ladder is *the same rung twice*: `{512, dpr}` and `{512, 1}` are one rung
 * when dpr is 1. At 2 they are two, and the pixels are four times the work.
 * The ladder has to be right on both.
 */
const DEVICE_PIXELS = Number(argOf('device-pixels', 1)) || 1;

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

const browser = await launchChromium(chromium);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: DEVICE_PIXELS });
await page.addInitScript(() => { try { localStorage['chromaglass-audio-source'] = 'simulated'; } catch { /* first run */ } });

const url = (rung) => `http://localhost:${PORT}/?debug&look=classic&gpu=${GPU}&tier=${TIER}&rung=${rung}`;

/** How many rungs this ladder has, and what they are. */
await page.goto(url(0), { waitUntil: 'load' });
await page.waitForFunction(() => (window.chromaglassDebug?.().governor?.rungs?.length ?? 0) > 0, null, { timeout: 60_000 });
const rungs = await page.evaluate(() => window.chromaglassDebug().governor.rungs.map((r) => ({ grid: r.grid, dpr: r.dpr })));
const engine = await page.evaluate(() => window.chromaglassDebug().engine);
if (!isGpuEngine(engine)) {
  console.error(`  ⚠ not on a GPU (${engine}) — the numbers below would be of a machine nobody runs this on.`);
}
const distinct = new Set(rungs.map((r) => `${r.grid}:${r.dpr}`)).size;
console.log(`\n${engine}  ·  tier ${TIER}, gpu ${GPU}, devicePixelRatio ${DEVICE_PIXELS}  ·  ` +
  `${rungs.length} rungs${distinct < rungs.length ? `, only ${distinct} of them distinct` : ''}  ·  ${SECONDS}s each, ${REPEATS} passes\n`);

/** One rung, settled and read. */
const measure = async (i) => {
  await page.goto(url(i), { waitUntil: 'load' });
  await page.waitForFunction(() => (window.chromaglassDebug?.().status?.grid ?? 0) > 0, null, { timeout: 60_000 });
  await page.waitForTimeout(SECONDS * 1000);
  return page.evaluate(() => {
    const d = window.chromaglassDebug();
    const solver = d.solver();
    const drawing = Object.entries(d.webgpu?.timings ?? {}).reduce((a, [, ms]) => a + ms, 0);
    return {
      grid: d.status.grid,
      dpr: d.status.dpr,
      // The canvas the rung's device-pixel count is supposed to produce. A
      // rung that changes `dpr` and not this is a rung that does nothing.
      canvas: (() => { const c = document.querySelector('canvas'); return c ? `${c.width}x${c.height}` : '?'; })(),
      frameMs: d.status.frameMs,
      simMs: solver.simMs,
      steps: solver.stepsPerSec,
      layers: solver.layers,
      drawing,
      // What the solver's own profiler says a step costs on the GPU, across
      // every layer — the number the CPU-side `simMs` cannot see.
      stepMs: (d.webgpu?.solver ?? []).reduce((a, s) => a + (s?.['solver step'] ?? 0), 0),
    };
  });
};

const seen = rungs.map(() => []);
for (let pass = 0; pass < REPEATS; pass++) {
  // Top to bottom, then bottom to top: a rung measured early in one pass is
  // measured late in the next, so a plate that thickens over the run does
  // not land on the same rungs every time.
  const order = pass % 2 === 0 ? rungs.map((_, i) => i) : rungs.map((_, i) => rungs.length - 1 - i);
  for (const i of order) {
    const r = await measure(i);
    seen[i].push(r);
    process.stdout.write(`  pass ${pass + 1}  rung ${i}: ${r.grid}² @ ${r.dpr.toFixed(2)}x, canvas ${r.canvas} — ${r.frameMs.toFixed(1)} ms\n`);
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const rows = seen.map((runs, i) => ({
  i,
  grid: runs[0].grid,
  dpr: runs[0].dpr,
  frameMs: median(runs.map((r) => r.frameMs)),
  stepMs: median(runs.map((r) => r.stepMs)),
  steps: median(runs.map((r) => r.steps)),
  drawing: median(runs.map((r) => r.drawing)),
}));

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`\n  ${pad('rung', 6)}${pad('grid', 7)}${padL('dpr', 5)}${padL('frame', 9)}${padL('fps', 6)}${padL('step', 8)}${padL('steps/s', 9)}${padL('drawing', 9)}   what the step down saves`);
for (const r of rows) {
  const prev = rows[r.i - 1];
  const saved = prev ? `${(prev.frameMs - r.frameMs).toFixed(1)} ms  ${((1 - r.frameMs / prev.frameMs) * 100).toFixed(0)}%` : '';
  const what = prev ? (prev.grid !== r.grid ? (prev.dpr !== r.dpr ? 'grid and pixels' : 'the grid') : 'the pixels') : '';
  console.log(
    `  ${pad(r.i, 6)}${pad(`${r.grid}²`, 7)}${padL(r.dpr.toFixed(2), 5)}${padL(r.frameMs.toFixed(1), 9)}` +
    `${padL((1000 / r.frameMs).toFixed(0), 6)}${padL(r.stepMs.toFixed(2), 8)}${padL(r.steps.toFixed(0), 9)}` +
    `${padL(r.drawing.toFixed(2), 9)}   ${pad(saved, 14)}${what}`,
  );
}

console.log(`
  frame    the whole frame, as the governor sees it
  step     one solver step across every layer, on the GPU
  steps/s  against the 60 the show asks for — below that the plate is in slow motion
  drawing  every pass the stage encodes, per frame
`);

await browser.close();
stop();
