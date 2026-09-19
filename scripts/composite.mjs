#!/usr/bin/env node
/**
 * Does the WGSL composite draw the GLSL's picture? (docs/webgpu-plan.md, P3.)
 *
 *   npm run composite
 *
 * One case at a time, each turning on one thing: the page builds both shaders
 * over the same textures and the same uniforms, draws both and compares the
 * frames. Run on the dev server, because the page imports both sources.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.COMPOSITE_PORT ?? 4329);
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
  await page.goto(`http://localhost:${PORT}/composite.html?case=${name}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__composite?.done && window.__composite, null, { timeout: 120_000 })
    .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  await page.close();
  return { ...r, pageErrors: errors };
};

/**
 * Where a case is allowed more than a level or two, and why.
 *
 * `lacing` measures two widths with fwidth, and WGSL will not let a function
 * that takes a derivative be called from a per-pixel branch — the quad has to
 * run whole. The GLSL called it from inside one, so in any quad straddling
 * the threshold its derivatives were reading pixels that had taken a
 * different path: undefined, by its own spec. The WGSL runs the call for the
 * whole quad and masks the result, which is the defined version of the same
 * thing, and the two differ on a handful of pixels along a thread's edge — 8
 * of 786,432 subpixels here, by at most 8 of 255.
 */
const WORST = { 'display-lacing': 10 };

const ALL = [
  'derive', 'derive-boundary', 'derive-bspline',
  'display', 'display-lamp', 'display-gloss', 'display-boundary', 'display-per-pixel',
  'display-relief', 'display-cells', 'display-lacing', 'display-granulation', 'display-gooey',
  'display-droplets', 'display-bubbles', 'display-beads', 'display-kaleido', 'display-gel',
  'display-lumia', 'display-led', 'display-led-rainbow', 'display-photo', 'display-dish',
  'display-two-layers', 'display-dish-spread', 'display-film', 'display-mark', 'display-warmth',
  'display-dither-only', 'display-no-finish', 'display-camera', 'display-macro', 'display-macro-dof',
];
try {
  for (const name of (CASES.length ? CASES : ALL)) {
    const r = await run(name);
    if (r.error) { check(name, false, r.error); continue; }
    const d = r.diff;
    // Both draw into 8-bit targets through different compilers, so a level or
    // two apart is the same picture; what a translation bug looks like is a
    // region that differs, which is what the counts catch.
    if (process.env.COMPOSITE_VERBOSE) console.log('   ', JSON.stringify({ brightness: r.brightness, diff: d }));
    check(name, d.worst <= (WORST[name] ?? 4) && d.over2 < 0.002 && d.litFraction > 0.05,
      `worst ${d.worst}/255, mean ${d.mean}, ${(d.over2 * 100).toFixed(3)}% over 2, ${(d.litFraction * 100).toFixed(0)}% of the frame lit — ${r.adapter}`);
    if (r.errors?.length || r.pageErrors.length) check(`${name}: no GPU errors`, false, (r.errors ?? r.pageErrors).slice(0, 2).join(' | '));
  }
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
