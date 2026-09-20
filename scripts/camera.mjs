#!/usr/bin/env node
/**
 * Does the WGSL camera take the GLSL's photograph? (docs/webgpu-plan.md, P3.)
 *
 *   npm run camera
 *
 * One case at a time, each turning on one part of the lens: the page builds
 * both shaders over the same scene and the same aux attachment, draws both
 * and compares the frames. Run on the dev server, because the page imports
 * both sources.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.CAMERA_PORT ?? 4331);
const CASES = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
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
const server = spawn('./node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 3000));

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});

const run = async (name) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));
  await page.goto(`http://localhost:${PORT}/camera.html?case=${name}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__camera?.done && window.__camera, null, { timeout: 120_000 })
    .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  await page.close();
  return { ...r, pageErrors: errors };
};

/**
 * Where a case is allowed more than a level or two, and why.
 *
 * The grain hashes `v_uv * u_resolution`, and two compilers' interpolators do
 * not hand a shader the same last bit of `v_uv` at every pixel. Where that
 * bit differs the hash is a different number, and a different number out of a
 * hash is a different grain sample — so those pixels differ by the grain's
 * own amplitude and by nothing else. It is ±0.02, or ±5 of 255, which is
 * where the worst of 10 comes from: the same noise drawn once each way.
 *
 * The control is `dither`, the same hash fed the fragment coordinate, which
 * is exactly representable in both: worst 1. Nothing about either picture is
 * wrong, and both frames have the same mean brightness to two decimals, which
 * is what the check below asks of every case.
 */
const TOLERANCE = {
  grain: { worst: 12, over2: 0.006 },
  everything: { worst: 12, over2: 0.006 },
};

const ALL = [
  'through', 'plain', 'refraction', 'chromatic', 'dof', 'dof-far',
  'bloom', 'filmic', 'vignette', 'grain', 'dither', 'half', 'everything',
];
try {
  for (const name of (CASES.length ? CASES : ALL)) {
    const r = await run(name);
    if (r.error) { check(name, false, r.error); continue; }
    const d = r.diff;
    if (process.env.CAMERA_VERBOSE) console.log('   ', JSON.stringify({ brightness: r.brightness, diff: d }));
    const tol = TOLERANCE[name] ?? { worst: 4, over2: 0.002 };
    // The same picture overall, whatever a handful of pixels of noise did.
    const sameBrightness = Math.abs(r.brightness.webgl - r.brightness.webgpu) <= 0.05;
    check(name, d.worst <= tol.worst && d.over2 < tol.over2 && d.litFraction > 0.05 && sameBrightness,
      `worst ${d.worst}/255, mean ${d.mean}, ${(d.over2 * 100).toFixed(3)}% over 2, ` +
      `brightness ${r.brightness.webgl} vs ${r.brightness.webgpu}, ` +
      `${(d.litFraction * 100).toFixed(0)}% of the frame lit — ${r.adapter}`);
    if (r.errors?.length || r.pageErrors.length) check(`${name}: no GPU errors`, false, (r.errors ?? r.pageErrors).slice(0, 2).join(' | '));
  }
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} cases failed` : `\nall ${checks.length} cases passed`);
process.exit(failed.length ? 1 : 0);
