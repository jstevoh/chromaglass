#!/usr/bin/env node
/**
 * How long the plate's opening takes, one way against another, on a cold
 * shader cache (PLAN 14v-10).
 *
 *   npm run openingtime -- --cold --runs 3 --variants ",lanes=2,lanes=6"
 *
 * Not a check: it judges nothing and is in no shard. It is the instrument
 * for choosing how the opening builds its pipelines, which `npm run startup`
 * cannot be: startup opens the show once as it ships (and once the old way,
 * as its control), on whatever the runner gives it that minute, and a cold
 * Mac's opening varies by seconds from one opening to the next (first step
 * 10.04 to 14.60 s over eight of CI's runs on 2026-10-28). Telling two ways
 * apart takes several openings of each, interleaved so a runner that slows
 * down slows both.
 *
 * What it found first (PR #540's run 40683027073, CI's Mac, three cold
 * openings of each): the intro held still to the end of the opening, and six
 * lanes once the render pipelines were done, each opened within the spread of
 * the opening as it ships (first step 13.47 to 14.77 s for all twelve). Six
 * lanes doubled every compile (median 0.69 s against 0.36) and built no
 * faster: the Mac's compiler, not the lanes, sets the pace. PLAN 14v-10 has
 * the numbers; the two flags were taken out again.
 *
 * Each variant is a query string added to the opening's address (any the
 * app reads, `lanes` in `gpu/prepare.ts` among them; empty is the opening as
 * it ships). Each opening gets its own browser, and on a Mac
 * the compiled-shader cache is emptied before it with `--cold` (and on CI),
 * the same emptying as `npm run startup`'s: it costs every app on the machine
 * one slow start, so on the owner's machine it is asked for, never assumed.
 * Without it a Mac times a warm opening, which compiles almost nothing.
 *
 * What it prints, per opening: when the device was given, when the opening's
 * builds began and ended, the first step, the longest wait for a frame from
 * load to two seconds past the first step, when the intro was held still,
 * and the slowest compiles from their own ask, with when each was asked.
 * Then, per variant, the median of each over its runs.
 */

import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { engineQuery } from './frame.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg('runs', '3'));
const VARIANTS = arg('variants', ',lanes=2,lanes=6').split(',');
const COLD = process.argv.includes('--cold') || !!process.env.CI;
const PORT = 4363;

function coldCache() {
  if (!COLD || process.platform !== 'darwin') return 'left as it was (--cold empties it)';
  let root;
  try { root = execFileSync('getconf', ['DARWIN_USER_CACHE_DIR'], { encoding: 'utf8' }).trim(); } catch { return 'no DARWIN_USER_CACHE_DIR'; }
  const found = [];
  const walk = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      if (e.name === 'com.apple.metal') found.push(p);
      else if (depth < 3) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  for (const p of found) rmSync(p, { recursive: true, force: true });
  return `emptied ${found.length}`;
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

/** Frames by when they ran, and the device's ask and gift, from the page's first moment. */
function instruments() {
  const frames = [];
  window.__otFrames = frames;
  const tick = (t) => { frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const gpu = navigator.gpu;
  if (gpu?.requestAdapter) {
    const ra = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (...a) => {
      const adapter = await ra(...a);
      if (adapter) {
        const rd = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...b) => { const d = await rd(...b); window.__otDevice = performance.now(); return d; };
      }
      return adapter;
    };
  }
}

async function openOnce(variant) {
  const cache = coldCache();
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
    await page.addInitScript(instruments);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${variant ? `&${variant}` : ''}${engineQuery()}`, { waitUntil: 'load' });
    return await page.evaluate(async (cacheSaid) => {
      const t0 = performance.now();
      const step = () => window.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? -1;
      let first = null;
      // Kept as it is seen: on software WebGPU the device is lost every few
      // seconds, and with it, for a moment, the debug hooks that hold the log.
      let p = null;
      while (performance.now() - t0 < 90000) {
        p ??= window.chromaglassDebug?.()?.pipelines?.()?.prepares?.find((x) => x.stage === 'opening') ?? null;
        if (first === null && step() > 0) first = performance.now();
        if (first !== null && performance.now() > first + 2000) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const until = (first ?? performance.now()) + 2000;
      const f = window.__otFrames.filter((t) => t <= until);
      let gap = 0, gapAt = 0;
      for (let i = 1; i < f.length; i++) if (f[i] - f[i - 1] > gap) { gap = f[i] - f[i - 1]; gapAt = f[i - 1]; }
      const still = window.__cgIntro?.still ?? [];
      return {
        cache: cacheSaid,
        device: window.__otDevice ?? null,
        from: p ? p.at : null,
        to: p ? p.at + p.ms : null,
        first,
        gap, gapAt,
        still: still.map(([a, b]) => [a, b]),
        asked: p?.asked ?? 0,
        raw: (p?.raw ?? []).map(([k, at, c]) => [k, at, c]),
      };
    }, cache);
  } finally {
    await browser.close();
  }
}

const s = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};

const results = Object.fromEntries(VARIANTS.map((v) => [v, []]));
for (let run = 0; run < RUNS; run++) {
  for (const v of VARIANTS) {
    const r = await openOnce(v);
    results[v].push(r);
    const slow = r.raw.filter((x) => x[2] != null).sort((a, b) => b[2] - a[2]).slice(0, 5)
      .map(([k, at, c]) => `${k.replace(/^(fluid|plate)\//, '')} ${s(c)} from ${s(at)}`).join(', ');
    const compiles = r.raw.map((x) => x[2]).filter((x) => x != null);
    // The most compiles in flight at once, from their own asks to their compiles: what the lanes came to.
    const edges = r.raw.filter((x) => x[2] != null).flatMap(([, at, c]) => [[at, 1], [at + c, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let inFlight = 0, most = 0;
    for (const [, d] of edges) most = Math.max(most, inFlight += d);
    console.log(`run ${run + 1} [${v || 'as shipped'}] (cache ${r.cache}): device ${s(r.device)}; built ahead ${s(r.from)}–${s(r.to)} (${r.asked}, at most ${most} at once, median compile ${s(median(compiles))}, all told ${s(compiles.reduce((a, b) => a + b, 0))}); first step ${s(r.first)}; longest frame wait ${s(r.gap)} from ${s(r.gapAt)}; held still ${r.still.map(([a, b]) => `${s(a)}–${s(b)}`).join(', ') || 'never'}`);
    console.log(`    slowest: ${slow}`);
  }
}
console.log('\nmedians over the runs:');
for (const v of VARIANTS) {
  const rs = results[v];
  const build = rs.map((r) => (r.to != null && r.from != null ? r.to - r.from : null));
  const afterDevice = rs.map((r) => (r.first != null && r.device != null ? r.first - r.device : null));
  console.log(`  ${(v || 'as shipped').padEnd(32)} first step ${s(median(rs.map((r) => r.first)))}, from the device ${s(median(afterDevice))}, building ${s(median(build))}, longest frame wait ${s(median(rs.map((r) => r.gap)))} (worst ${s(Math.max(...rs.map((r) => r.gap)))})`);
}
process.exit(0);
