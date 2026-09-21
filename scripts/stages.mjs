/**
 * Where a solver step's time goes, stage by stage (H0, docs/webgpu-plan.md).
 *
 * A step is one compute pass with one timestamp pair on it, so what the
 * profiler reports is about nine milliseconds for a hundred-odd dispatches
 * and no way to tell which of them it is. `?stages` opens a pass per named
 * stage instead, and this reads them back.
 *
 * It prints two tables: the stages at the grid asked for, and the same totals
 * against the single-pass number, because splitting adds a dozen pass
 * boundaries a step and the sum is therefore a little high. Read the shares.
 *
 *   npm run stages                  the local ladder's top rung (768²)
 *   npm run stages -- --grid 512    somewhere else on it
 *   npm run stages -- --seconds 30  longer, for a quieter median
 *
 * **Compare two settings by alternating runs in pairs, not by running each
 * once.** The plate is chaotic and its state changes what a step costs: one
 * pass over the grids read 384² as *slower* than 512², which would have meant
 * a rung on the quality ladder that costs more than the finer one above it.
 * Run again at eighteen seconds, alternating, and 384² is 6.60 ms against
 * 512²'s 8.26 — the first reading was the weather. Two runs each way, and
 * read the pair, not the number.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4331;
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const GRID = Number(argOf('grid', 768)) || 768;
const SECONDS = Number(argOf('seconds', 20)) || 20;
/** `--set turbScale=0;spin=0` — measure the same plate with a force switched off. */
const SET = argOf('set', null);

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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage['chromaglass-audio-source'] = 'simulated'; } catch { /* first run */ } });

// `?stages` from the first frame, a pinned grid so the governor is not also
// moving, and the classic look so the plate is the same plate every run.
await page.goto(`http://localhost:${PORT}/?debug&stages&look=classic&tier=local&sim=${GRID}${argOf('steps', null) ? `&steps=${argOf('steps', '')}` : ''}`, { waitUntil: 'load' });
await page.waitForFunction((g) => window.chromaglassDebug?.().status?.grid === g, GRID, { timeout: 60_000 });
if (SET) {
  const patch = Object.fromEntries(SET.split(';').map((kv) => {
    const [k, v] = kv.split('=');
    return [k, v === 'true' ? true : v === 'false' ? false : Number(v)];
  }));
  await page.evaluate((x) => window.chromaglassSettings(x), patch);
  console.log(`  set ${JSON.stringify(patch)}`);
}
console.log(`\n${await page.evaluate(() => window.chromaglassDebug().engine)}  ·  ${SECONDS}s\n`);

// Let the plate fill and the profiler's smoothing settle before reading.
await page.waitForTimeout(SECONDS * 1000);

const read = async () => page.evaluate(() => {
  const d = window.chromaglassDebug();
  return {
    solver: d.webgpu?.solver ?? [],
    stage: d.webgpu?.timings ?? {},
    steps: d.solver().stepsPerSec,
    layers: d.solver().layers,
    // The timestep itself: what the loop is stepping the liquid by. Motion a
    // second is this times the rate, and H2b's whole claim is that the
    // product holds while the rate falls.
    dt: d.fluids?.[0]?.dt ?? 0,
    lean: d.fluids?.[0]?.clockLean ?? 1,
    drive: d.phrase?.().drive ?? 1,
    speed: d.settings?.globalSpeed ?? 0,
    frameMs: d.status?.frameMs ?? 0,
  };
});
const staged = await read();

// The same plate with the splitting off, for what a step really costs.
await page.evaluate(() => window.chromaglassDebug().webgpu.stageTimings(false));
await page.waitForTimeout(8000);
const whole = await read();

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

for (let i = 0; i < staged.solver.length; i++) {
  const rows = Object.entries(staged.solver[i] ?? {}).filter(([k]) => k !== 'solver step');
  if (!rows.length) continue;
  const sum = rows.reduce((a, [, ms]) => a + ms, 0);
  console.log(`layer ${i} — ${rows.length} stages, ${sum.toFixed(2)} ms a step split, ` +
    `${(whole.solver[i]?.['solver step'] ?? 0).toFixed(2)} ms whole\n`);
  console.log(`  ${pad('stage', 18)}${padL('ms', 8)}${padL('share', 8)}`);
  for (const [k, ms] of rows.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(k, 18)}${padL(ms.toFixed(3), 8)}${padL((ms / sum * 100).toFixed(1) + '%', 8)}`);
  }
  console.log('');
}

const drawing = Object.entries(whole.stage).reduce((a, [, ms]) => a + ms, 0);
const stepMs = whole.solver.reduce((a, s) => a + (s?.['solver step'] ?? 0), 0);
console.log(`a frame at ${GRID}²: ${whole.frameMs.toFixed(1)} ms, ` +
  `${whole.steps.toFixed(1)} steps/s over ${whole.layers} layer(s)`);
console.log(`  dt ${whole.dt.toExponential(3)} — ${(whole.steps * whole.dt).toExponential(3)} of liquid a second` +
  `  (speed ${whole.speed}, clock lean ${whole.lean.toFixed(3)}, phrase drive ${whole.drive.toFixed(3)})`);
console.log(`  the solver   ${stepMs.toFixed(2)} ms a step, every layer`);
console.log(`  the drawing  ${drawing.toFixed(2)} ms a frame`);

await browser.close();
stop();
