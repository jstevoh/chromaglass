#!/usr/bin/env node
/**
 * Does the WGSL projector place the picture where the GLSL does?
 * (docs/webgpu-plan.md, P3.)
 *
 *   npm run output
 *
 * One case at a time — a pin, a flip, blanking, a grade, each shape, a cube,
 * a blackout: the page builds both shaders over the same scene and the same
 * mapping, draws both and compares the frames. Run on the dev server, because
 * the page imports both sources.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.OUTPUT_PORT ?? 4333);
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
  await page.goto(`http://localhost:${PORT}/output.html?case=${name}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__output?.done && window.__output, null, { timeout: 120_000 })
    .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  await page.close();
  return { ...r, pageErrors: errors };
};

/**
 * Where a case is allowed more than a level or two, and why.
 *
 * Nothing yet: this pass hashes only the fragment coordinate, which both
 * engines can state exactly, and the geometry is the same TypeScript on both
 * sides rather than a port. A difference here is a difference in the drawing.
 */
const TOLERANCE = {};

const ALL = [
  'plain', 'pinned', 'flip-x', 'flip-y', 'mask', 'grade',
  'rect', 'ellipse', 'triangle', 'diamond',
  'cube', 'cube-pinned', 'blackout', 'everything',
];
try {
  for (const name of (CASES.length ? CASES : ALL)) {
    const r = await run(name);
    if (r.error) { check(name, false, r.error); continue; }
    const d = r.diff;
    if (process.env.OUTPUT_VERBOSE) console.log('   ', JSON.stringify({ brightness: r.brightness, diff: d }));
    const tol = TOLERANCE[name] ?? { worst: 4, over2: 0.002 };
    // The same picture overall, whatever a handful of pixels of noise did.
    const sameBrightness = Math.abs(r.brightness.webgl - r.brightness.webgpu) <= 0.05;
    // `blackout` is the one case whose right answer is a dark frame: every
    // shape switched off is a blackout, not an absence of mapping.
    const wantLit = name === 'blackout' ? 0 : 0.05;
    check(name, d.worst <= tol.worst && d.over2 < tol.over2 && d.litFraction >= wantLit && sameBrightness,
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
