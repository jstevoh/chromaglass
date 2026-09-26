#!/usr/bin/env node
/**
 * Does the show open without stopping? (gpu/prepare.ts)
 *
 *   npm run startup
 *
 * What was reported, by `npm run depth` on every fresh Mac runner: a few
 * seconds after load the plate took eight steps and then stopped for about
 * nine seconds (9.30 s on run 36245105594, 8.58 s on 36243996678), with no
 * animation frame and no loop heartbeat while the page's own timers kept
 * firing. The black box logged it as "no frame for 6s". The first step had
 * asked for forty-four pipelines on the frame, and the GPU process compiled
 * them, cold, before it would present another.
 *
 * The fix builds them ahead, with the async calls, while the starting frame
 * is up. The show is opened twice, each time on a cold shader cache: once
 * with `?prepare=0`, the old way, as the control, and once as it ships. The
 * control is printed, not judged: it is what says the cache really was cold
 * and the instruments below really can see the freeze. The show as it ships
 * is asked four things:
 *
 *   1. it opens: the plate is stepping in every quarter second, and the
 *      first step comes within FIRST_STEP_MAX_S of load
 *   2. every pipeline it asked for ahead was built ahead, and it asked for
 *      at least the forty-four the opening used to build on its frames
 *   3. no pipeline was built on a frame, on any device the page had, in the
 *      opening or on a change to any of the looks the show can open on: the
 *      lists in `WebGPUFluid.prepare` and its neighbours falling behind what
 *      the frame draws with, which brings the freeze back a pipeline at a
 *      time. The ledger is compared against a count taken from WebGPU's own
 *      `createComputePipeline` and `createRenderPipeline`, so a build that
 *      goes around the cache is counted too.
 *   4. no stop in the opening: no two animation frames, no two loop
 *      heartbeats, and no two plate steps more than MAX_GAP_S apart, each
 *      measured from its first to the moment of reading (so a stop still
 *      going then counts), over WATCH_S or ten seconds past the first step
 *
 * Cold, because a Mac keeps compiled shaders in a cache that outlives the
 * browser (`com.apple.metal`, under the user's cache directory), and a run
 * on a warm one passes whatever the app does. On CI, or with STARTUP_COLD=1,
 * that cache is emptied before each opening; the line saying what was
 * emptied is how to tell. It also runs first on CI's tools shard, where
 * depth used to be the check that saw the freeze.
 *
 * In a cloud session (`PW_WEBGPU=1`, software WebGPU) 2 and 3 are meaningful,
 * because they are about what the app asked for and when. 1 and 4 fail
 * there, as every app check does: SwiftShader loses the app's device every
 * few seconds, and the loop's heartbeat stops while it waits for the next.
 * Only a Mac shows the freeze itself.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { engineQuery } from './frame.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const PORT = 4357;
/**
 * The longest a frame, a heartbeat or a step may take to follow the last
 * one. Two seconds, because the freeze was nine and a healthy show on the
 * Mac draws every sixteen milliseconds; anything past two is a stop an
 * audience sees, not a slow frame.
 */
const MAX_GAP_S = Number(process.env.STARTUP_MAX_GAP ?? 2);
/**
 * How much of the opening is watched: twenty seconds, or ten past the first
 * step if that is later, so a show that opens late is still watched running.
 */
const WATCH_S = 20;
const WATCH_AFTER_STEP_S = 10;
/**
 * The latest the plate may start stepping. Generous: the cold compile of the
 * opening's pipelines stopped the plate for nine seconds in depth's runs and
 * for nineteen in the film harness's first look (#162), and building them
 * ahead moves that wait before the first step rather than after it. What
 * this catches is a show that never really opens.
 */
const FIRST_STEP_MAX_S = Number(process.env.STARTUP_FIRST_STEP ?? 45);
/** What the classic opening built on its frames before this (the control prints today's number). */
const MIN_ASKED = 44;
/** Steps each look is given to ask for what it draws with. */
const LOOK_STEPS = 6;

const presetIds = [...readFileSync('src/presets.ts', 'utf8').matchAll(/^ {4}id: '([^']+)'/gm)].map((m) => m[1]);

/**
 * Empty the Mac's compiled-shader cache, and say what was there. Only on CI
 * or when asked: on the owner's machine it costs every app one slow start.
 */
function coldCache() {
  if (process.platform !== 'darwin' || !(process.env.CI || process.env.STARTUP_COLD)) return 'left as it was (not CI; STARTUP_COLD=1 empties it)';
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
  return found.length ? `emptied ${found.length} (${found.map((p) => p.slice(root.length)).join(', ')})` : `none found under ${root}`;
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let up = true, leaving = false;
// Only a surprise before we ask it to go (depth.mjs has the long version).
server.on('exit', (c) => {
  up = false;
  if (leaving) return;
  console.error(`\npreview server exited (${c}) — port ${PORT} in use?`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));
if (!up) process.exit(2);

/**
 * One opening, in a browser of its own (a fresh profile, so Chromium's own
 * GPU cache is empty too). From the moment the page starts: the time of every
 * animation frame, the main thread's long tasks, every pipeline WebGPU was
 * asked to build synchronously, and a row every quarter second of frames,
 * heartbeats, lead-plate steps and grid (depth.mjs's timeline). Then, if
 * given looks, each of them in turn.
 */
async function open(query, looks) {
  const cache = coldCache();
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
    await page.addInitScript(() => {
      const t0 = performance.now();
      const frames = [];
      window.__startupFrames = frames;
      const tick = (t) => { if (frames.length < 20000) frames.push(t); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const long = [];
      window.__startupLong = long;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push([e.startTime, e.duration]); })
          .observe({ type: 'longtask', buffered: true });
      } catch { /* no long tasks here; the frames still say it */ }
      // Every synchronous build, whoever asked: the ledger's own count is
      // only as good as every caller going through the cache.
      const direct = [];
      window.__startupDirect = direct;
      for (const name of ['createComputePipeline', 'createRenderPipeline']) {
        const f = GPUDevice.prototype[name];
        GPUDevice.prototype[name] = function (d) { direct.push([performance.now(), d?.label ?? '']); return f.call(this, d); };
      }
      const rows = [];
      window.__startupRows = rows;
      const sample = () => {
        const d = window.chromaglassDebug?.();
        const f = d?.fluids?.[0];
        rows.push([performance.now() - t0, frames.length, d?.crash?.beats?.() ?? -1, f?.stepIndex ?? -1, f?.gpu?.N ?? 0]);
        if (rows.length < 2000) setTimeout(sample, 250);
      };
      setTimeout(sample, 250);
    });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${query}${engineQuery()}`, { waitUntil: 'load' });

    // Running: the plate stepped in each of the last nine quarter seconds
    // (two seconds, as depth waits), for up to a minute.
    const running = await page.evaluate(async () => {
      const t0 = performance.now();
      const rows = () => window.__startupRows ?? [];
      const steady = () => {
        const r = rows().slice(-9);
        return r.length === 9 && r.every((row, i) => i === 0 || row[3] > r[i - 1][3]);
      };
      while (!steady() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 250));
      return steady();
    });
    const watch = await page.evaluate(async ([least, past]) => {
      const first = (window.__startupRows.find((r) => r[3] > 0) ?? [null])[0];
      const until = Math.max(least, first == null ? 0 : first + past);
      while (performance.now() < until) await new Promise((r) => setTimeout(r, 100));
      return until;
    }, [WATCH_S * 1000, WATCH_AFTER_STEP_S * 1000]);

    /*
      The longest stretch of each, from its first to now, within the watch.
      Now counts: a stop still going when this reads is the longest of all,
      and measuring only between samples called a stop that never ended
      "0.017 s". Frames from the first frame, heartbeats from the first beat,
      steps from the first step, since before each there is nothing yet to
      stop. Heartbeats and steps are seen at the quarter-second row where
      their count went up, so they are good to a quarter second, which is
      plenty against a bound of two.
    */
    const opening = await page.evaluate((watch) => {
      const now = Math.min(performance.now(), watch);
      const longest = (times) => {
        let gap = 0, at = null;
        const ts = [...times.filter((t) => t <= now), now];
        for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > gap) { gap = ts[i] - ts[i - 1]; at = ts[i - 1]; }
        return { gap: gap / 1000, at: at == null ? null : at / 1000, first: times.length ? times[0] / 1000 : null };
      };
      const rows = window.__startupRows.filter((r) => r[0] <= now);
      const changes = (col) => rows.filter((r, i) => i > 0 && rows[i - 1][col] >= 0 && r[col] > rows[i - 1][col]).map((r) => r[0]);
      const d = window.chromaglassDebug?.();
      return {
        frames: longest(window.__startupFrames),
        beats: longest(changes(2)),
        steps: longest(changes(3)),
        firstStep: (rows.find((r) => r[3] > 0) ?? [null])[0],
        long: window.__startupLong.filter(([s]) => s <= now),
        rows: rows.map((r) => [+(r[0] / 1000).toFixed(2), ...r.slice(1)]),
        prepared: d?.pipelines?.()?.prepared ?? null,
        box: (d?.crash?.thisLoad?.() ?? []).map((e) => `${e.up.toFixed(1)}s ${e.level} ${e.source}: ${String(e.msg).slice(0, 140)}`),
      };
    }, watch);

    /*
      Then every look, through the app's own `applyPreset`, each until the
      lead plate has taken LOOK_STEPS steps (or eight seconds). A look put on
      mid-show asks for what that look opens with, and in one page rather
      than thirty-eight loads.
    */
    const slow = [];
    for (const id of looks) {
      const done = await page.evaluate(async ([id, n]) => {
        window.chromaglassApplyPreset?.(id);
        const at = () => window.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? 0;
        const s0 = at(), t0 = performance.now();
        while (at() < s0 + n && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
        return at() >= s0 + n;
      }, [id, LOOK_STEPS]);
      if (!done) slow.push(id);
    }
    // The ledger is the page's and outlives a device, but the debug hook that
    // hands it over is the renderer's, which is gone between a lost device
    // and the next: ask for a while before calling it missing.
    const after = await page.evaluate(async () => {
      let ledger = null;
      for (let t0 = performance.now(); !ledger && performance.now() - t0 < 15000;) {
        ledger = window.chromaglassDebug?.()?.pipelines?.()?.ledger ?? null;
        if (!ledger) await new Promise((r) => setTimeout(r, 100));
      }
      return { ledger, direct: window.__startupDirect.map(([t, l]) => [+(t / 1000).toFixed(2), l]) };
    });
    return { cache, running, watch, ...opening, ...after, slow };
  } finally { await browser.close(); }
}

const say = (g) => (g.first == null ? 'none at all' : `${g.gap.toFixed(2)} s${g.at != null ? ` from ${g.at.toFixed(2)} s` : ''}`);
const timeline = (o) => {
  const f = o.frames;
  const inGap = f.at == null ? [] : o.long.filter(([s, d]) => s < (f.at + f.gap) * 1000 && s + d > f.at * 1000);
  // Whether the page's own thread was busy through it (a long task covers
  // it) or free and the frames were held elsewhere (the GPU process).
  console.log(`     (main-thread long tasks in the longest frame gap: ${inGap.length ? inGap.map(([s, d]) => `${(s / 1000).toFixed(2)} s for ${(d / 1000).toFixed(2)} s`).join(', ') : 'none'})`);
  console.log('       seconds · animation frames · heartbeats · steps · grid');
  for (const r of o.rows) console.log(`       ${r.join('  ')}`);
  for (const line of o.box) console.log(`       ${line}`);
};

try {
  // ── The control: the old way, on a cold cache ─────────────────────
  const c = await open('&prepare=0', []);
  console.log(`  control, ?prepare=0 (shader cache ${c.cache}): ${c.direct.length} pipelines built on a frame;`
    + ` longest wait for a frame ${say(c.frames)}, for a heartbeat ${say(c.beats)}, for a step ${say(c.steps)};`
    + ` first step at ${c.firstStep == null ? 'never' : `${(c.firstStep / 1000).toFixed(2)} s`}`);
  if (process.env.STARTUP_TIMELINE) timeline(c);

  // ── The show as it ships ──────────────────────────────────────────
  const o = await open('', presetIds);
  console.log(`  as shipped (shader cache ${o.cache})`);
  const p = o.prepared;
  check('the show opens and the plate is stepping',
    o.running && o.firstStep != null && o.firstStep / 1000 <= FIRST_STEP_MAX_S,
    `${o.firstStep == null ? 'no step at all' : `first step at ${(o.firstStep / 1000).toFixed(2)} s (no later than ${FIRST_STEP_MAX_S} s)`}`
    + `${p ? `, after ${(p.ms / 1000).toFixed(2)} s building pipelines ahead` : ''}${o.running ? '' : '; never two steady seconds'}`);
  check('every pipeline it asked for ahead was built ahead',
    !!p && p.asked >= MIN_ASKED && p.ready === p.asked && !p.timedOut,
    p ? `${p.ready} of ${p.asked} (at least ${MIN_ASKED} asked) in ${(p.ms / 1000).toFixed(2)} s${p.timedOut ? ', and it stopped waiting' : ''}`
      : 'nothing was prepared (no `pipelines` in chromaglassDebug)');
  const late = o.ledger?.onFrame ?? [];
  const inOpening = late.filter((e) => e.at <= o.watch).length;
  check(`no pipeline was built on a frame, opening or across all ${presetIds.length} looks`,
    !!o.ledger && late.length === 0 && o.direct.length === 0 && presetIds.length > 30 && o.slow.length === 0,
    !o.ledger ? 'no ledger in chromaglassDebug'
      : `${late.length} in the ledger (${inOpening} in the opening), ${o.direct.length} counted at WebGPU across ${o.ledger.devices} device(s)`
        + (late.length ? `: ${[...new Set(late.map((e) => e.name))].join(', ')}` : '')
        + (o.direct.length !== late.length ? `; the two counts differ, so something builds around the cache: ${o.direct.slice(0, 6).map(([t, l]) => `${l} at ${t} s`).join(', ')}` : '')
        // A look that never stepped never asked for what it draws with, so
        // it cannot count as having built nothing on a frame.
        + (o.slow.length ? `; ${o.slow.length} look(s) never took ${LOOK_STEPS} steps, so went unmeasured (${o.slow.slice(0, 6).join(', ')})` : ''));
  const worst = Math.max(o.frames.gap, o.beats.gap, o.steps.gap);
  check(`no stop in the opening (frames, heartbeats and steps each no more than ${MAX_GAP_S} s apart)`,
    o.frames.first != null && o.beats.first != null && o.steps.first != null && worst <= MAX_GAP_S,
    `longest wait for a frame ${say(o.frames)}, for a heartbeat ${say(o.beats)}, for a step ${say(o.steps)}`);
  if (worst > MAX_GAP_S || process.env.STARTUP_TIMELINE) timeline(o);
} finally { stop(); }

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
