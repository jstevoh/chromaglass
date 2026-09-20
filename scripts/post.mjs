#!/usr/bin/env node
/**
 * Does the WGSL post chain finish the frame the way the GLSL does?
 * (docs/webgpu-plan.md, P3; docs/filters-plan.md, F0.)
 *
 *   npm run post
 *
 * Two passes, a case at a time. The finish is the frame's last three steps —
 * the dimmer, the mark, the dither — which both engines share with their own
 * plate shader rather than writing twice. The test effect stands in for the
 * effects still to come, and carries the part that has to be identical run to
 * run and machine to machine: seeded randomness, and a frame out of the
 * history ring.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.POST_PORT ?? 4335);
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
  await page.goto(`http://localhost:${PORT}/post.html?case=${name}`, { waitUntil: 'load' });
  const r = await page.waitForFunction(() => window.__post?.done && window.__post, null, { timeout: 120_000 })
    .then((h) => h.jsonValue()).catch((e) => ({ error: String(e.message).split('\n')[0] }));
  await page.close();
  return { ...r, pageErrors: errors };
};

/**
 * Where a case is allowed more than a level or two, and why.
 *
 * Nothing so far. Everything hashed here is hashed from the fragment
 * coordinate — the dither's pattern and the effects' PCG randomness — which
 * both engines can state exactly, and which is the whole reason the effects'
 * randomness is integer hashing rather than a sine.
 */
const TOLERANCE = {};

const ALL = [
  'plain', 'dimmed', 'blackout', 'mark', 'mark-faded', 'mark-blackout',
  'noise', 'noise-elsewhere', 'history-0', 'history-3', 'effect-off',
];
try {
  for (const name of (CASES.length ? CASES : ALL)) {
    const r = await run(name);
    if (r.error) { check(name, false, r.error); continue; }
    const d = r.diff;
    if (process.env.POST_VERBOSE) console.log('   ', JSON.stringify({ brightness: r.brightness, diff: d }));
    const tol = TOLERANCE[name] ?? { worst: 4, over2: 0.002 };
    // The same picture overall, whatever a handful of pixels of noise did.
    const sameBrightness = Math.abs(r.brightness.webgl - r.brightness.webgpu) <= 0.05;
    // `blackout` is the one case whose right answer is a dark frame: the
    // dimmer at zero takes the picture and leaves the mark, which is what
    // `mark-blackout` checks and this one is the control for.
    const wantLit = name === 'blackout' ? -1 : 0.05;
    check(name, d.worst <= tol.worst && d.over2 < tol.over2 && d.litFraction > wantLit && sameBrightness,
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
