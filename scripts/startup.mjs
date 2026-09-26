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
 * The fix builds them ahead, with the async calls, one at a time: what the
 * look opens with while the starting frame is up, the rest behind the show
 * once it is. The show is opened twice, each time on a cold shader cache:
 * once with `?prepare=0`, the old way, as the control, and once as it ships.
 * The control is printed, and judged only as the bar for 1b: it is what
 * says the cache really was cold and the instruments below really can see
 * the freeze. The show as it ships is asked:
 *
 *   1. it opens: the plate is stepping in every quarter second, and the
 *      first step comes within FIRST_STEP_MAX_S of load
 *   1b. and it is moving for good (no stretch of more than MAX_GAP_S
 *      without a step after) no more than STEADY_SLACK_S later than the
 *      control was. Waiting for all eighty-seven passed everything else and
 *      opened at 23 s against the control's 14 (`gpu/prepare.ts`): a fix
 *      that trades the freeze for a longer wait is not one.
 *   2. every pipeline it asked for ahead was built ahead, before the show
 *      opened and behind it, on the device it opened on, and it waited for
 *      every pipeline the control built on its frames, by name
 *   3. no pipeline was built on a frame, on any device the page had, in the
 *      opening or on a change to any of the looks once the rest was built:
 *      the lists in `WebGPUFluid.prepare` and its neighbours falling behind
 *      what the frame draws with, which brings the freeze back a pipeline
 *      at a time. The ledger is compared against a count taken from
 *      WebGPU's own `createComputePipeline` and `createRenderPipeline`, so a
 *      build that goes around the cache is counted too.
 *   4. no stop in the opening: no two animation frames, no two loop
 *      heartbeats, and no two plate steps more than MAX_GAP_S apart, each
 *      measured from its first to the moment of reading (so a stop still
 *      going then counts), over WATCH_S, ten seconds past the first step or
 *      a second past the end of the building behind it, whichever is last
 *   5. every look, opened on its own, asks in its first OPENING_STEPS
 *      steps and OPENING_SECONDS seconds for nothing the show did not wait
 *      for (`?asked`, `gpu/opening.ts`); and each part some look waits for
 *      is asked for by some look, or the window closed before that part
 *      switched on and the first half measured nothing for it. Asked, not
 *      built on the frame: with a warm cache the rest is built behind the
 *      show before a look's first step can find it missing, so a count of
 *      builds on the frame would pass whatever the split said.
 *
 * Cold, because a Mac keeps compiled shaders in a cache that outlives the
 * browser (`com.apple.metal`, under the user's cache directory), and a run
 * on a warm one passes whatever the app does. On CI, or with STARTUP_COLD=1,
 * that cache is emptied before each opening; the line saying what was
 * emptied is how to tell. It also runs first on CI's tools shard, where
 * depth used to be the check that saw the freeze.
 *
 * In a cloud session (`PW_WEBGPU=1`, software WebGPU) 3 and 5 are
 * meaningful, because they are about what the app asked for and when; 5
 * needs STARTUP_LOOK_CAP=90 there, forty software steps being slow. 1, 1b,
 * 2 and 4 fail there (2 because the building behind the show is cut short
 * by the next lost device), as every app check does: SwiftShader loses the app's device every
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
/** Steps each look is given to ask for what it draws with. */
const LOOK_STEPS = 6;
/**
 * Steps each look is opened for, in 5. More than a change is given, because
 * a look's own parts do not all switch on at its first step: the second
 * phase, the mix and the gel wait for the show to lay their first drop. The
 * forty-three and each look's own were read after forty steps of each.
 */
const OPENING_STEPS = 40;
/**
 * And for at least this long past its first step. A step is a sixtieth of a
 * second on the Mac, so forty of them are gone before the drops the show
 * lays on a clock, or the governor's first measure, have come; and on a cold
 * Mac the rest takes nine seconds to be built behind the show, so anything a
 * look asks for in its first seconds has to have been waited for.
 */
const OPENING_SECONDS = 3;
/** The most one look is given, and all thirty-eight, before calling it unmeasured. */
const LOOK_CAP_S = Number(process.env.STARTUP_LOOK_CAP ?? 20);
const OPENINGS_BUDGET_S = Number(process.env.STARTUP_OPENINGS_BUDGET ?? 360);
/**
 * How much later than the old way the plate may start moving for good. The
 * old way was moving from the end of its freeze; this one waits for its
 * look's own pipelines, one at a time, where the old way had the GPU compile
 * them in a burst, and a cold compile on the runner varies by a second or two
 * from one opening to the next. Three seconds says the wait was moved, not
 * made longer; the twenty-three it took when the show waited for everything
 * fails it by far.
 */
const STEADY_SLACK_S = Number(process.env.STARTUP_STEADY_SLACK ?? 3);

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
      /*
        When the page asked for the GPU and when it had it. The first stop
        seen with the pipelines built ahead (2.08 s from 1.01 s, run
        36255595521) came before any step and before the prepare, with no
        long task on the page's thread: these say whether it sits inside
        the device request, which no ordering of pipelines can move.
      */
      const gpuAt = [];
      window.__startupGpu = gpuAt;
      const timed = (what, owner, name) => {
        const f = owner?.[name];
        if (!f) return;
        owner[name] = function (...a) {
          const row = [what, performance.now(), null];
          gpuAt.push(row);
          return f.apply(this, a).finally(() => { row[2] = performance.now(); });
        };
      };
      timed('adapter', navigator.gpu, 'requestAdapter');
      timed('device', globalThis.GPUAdapter?.prototype, 'requestDevice');
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
    /*
      The half built behind the show (`gpu/prepare.ts`), on the device the
      show opened on. Waited for before the opening is read, so the watch
      covers every build behind the show as well as the ones before it (a
      compile behind the show should cost frames, not stop them), and before
      any look is changed to: a change is a mid-show ask, and what that
      measures is whether the lists hold everything a show can ask for once
      they have been built, not a race between a look change and the builds.
    */
    const behind = query.includes('prepare=0') ? null : await page.evaluate(async () => {
      const t0 = performance.now();
      const later = () => {
        const all = window.chromaglassDebug?.()?.pipelines?.()?.prepares ?? [];
        const first = all.find((p) => p.stage === 'opening');
        return first ? all.find((p) => p.stage === 'later' && p.device === first.device) ?? null : null;
      };
      while (!later() && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 100));
      return later();
    });
    const watch = await page.evaluate(async ([least, past, behindEnd]) => {
      const first = (window.__startupRows.find((r) => r[3] > 0) ?? [null])[0];
      const until = Math.max(least, first == null ? 0 : first + past, behindEnd == null ? 0 : behindEnd + 1000);
      while (performance.now() < until) await new Promise((r) => setTimeout(r, 100));
      return until;
    }, [WATCH_S * 1000, WATCH_AFTER_STEP_S * 1000, behind ? behind.at + behind.ms : null]);

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
    const opening = await page.evaluate(([watch, maxGap]) => {
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
        /*
          When the plate started moving for good: the end of the last stretch
          of more than MAX_GAP_S without a step, or the first step if there
          was none. What an audience waits for. The old way stepped at four
          seconds and then stopped for nine, so its first step says little.
        */
        steadyFrom: (() => {
          const ts = changes(3);
          let from = ts.length ? ts[0] : null;
          for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > maxGap * 1000) from = ts[i];
          // A stop still going when this reads: not moving for good at all.
          return ts.length && now - ts[ts.length - 1] > maxGap * 1000 ? null : from;
        })(),
        long: window.__startupLong.filter(([s]) => s <= now),
        rows: rows.map((r) => [+(r[0] / 1000).toFixed(2), ...r.slice(1)]),
        prepared: d?.pipelines?.()?.prepares?.find((p) => p.stage === 'opening') ?? null,
        gpu: window.__startupGpu.map(([w, a, b]) => [w, a / 1000, b == null ? null : b / 1000]),
        // A stop before the first step is one the pipelines cannot have made
        // in the control, where none is built until that step: said apart.
        // Up to the first step, not to now: after it is the gap above.
        framesBefore: (() => {
          const step = rows.find((r) => r[3] > 0)?.[0] ?? now;
          const ts = window.__startupFrames.filter((t) => t <= step);
          let gap = 0, at = null;
          for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > gap) { gap = ts[i] - ts[i - 1]; at = ts[i - 1]; }
          return { gap: gap / 1000, at: at == null ? null : at / 1000, first: ts.length ? ts[0] / 1000 : null };
        })(),
        box: (d?.crash?.thisLoad?.() ?? []).map((e) => `${e.up.toFixed(1)}s ${e.level} ${e.source}: ${String(e.msg).slice(0, 140)}`),
      };
    }, [watch, MAX_GAP_S]);

    /*
      Then every look, through the app's own `applyPreset`, each until the
      lead plate has taken LOOK_STEPS steps (or eight seconds). A look put on
      mid-show asks for what that look opens with, and in one page rather
      than thirty-eight loads.
    */
    const slow = [];
    for (const id of looks) {
      const done = await page.evaluate(async ([id, n]) => {
        // Without the hook every "change" is the same look thirty-eight times.
        if (typeof window.chromaglassApplyPreset !== 'function') throw new Error('no chromaglassApplyPreset');
        window.chromaglassApplyPreset(id);
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
    return { cache, running, watch, ...opening, ...after, behind, slow };
  } finally { await browser.close(); }
}

/**
 * Each look opened on its own, in one browser (the shader cache warm by now,
 * so each takes a few seconds): what its opening built on the frame. The
 * show opens on a look picked at random, and waits only for what some look
 * opens with (`gpu/prepare.ts`), so a look that opens on a pipeline left
 * for later brings back a stop at the opening, a pipeline at a time. A look
 * changed to mid-show, above, is not the same ask: it comes after the rest
 * is built, and it asks for what the change needs (a new glass shape, say),
 * which no opening does.
 */
async function openings(ids) {
  const browser = await launchChromium(chromium);
  const out = [];
  const t0 = Date.now();
  try {
    for (const id of ids) {
      // Out of time: the rest are reported unmeasured rather than the shard
      // killed with nothing printed.
      if (Date.now() - t0 > OPENINGS_BUDGET_S * 1000) { out.push({ id, stepped: false, error: 'out of time' }); continue; }
      // A page each: a second `goto` on one page threw "frame was detached"
      // mid-teardown of the last show.
      const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
      try {
        await page.goto(`http://localhost:${PORT}/?debug&asked&gpu=mid&tier=local&look=${id}${engineQuery()}`, { waitUntil: 'load' });
        out.push({ id, ...await page.evaluate(async ([n, secs, cap]) => {
          const t0 = performance.now();
          const at = () => window.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? 0;
          let first = null;
          while (performance.now() - t0 < cap) {
            if (first == null && at() > 0) first = performance.now();
            if (first != null && at() >= n && performance.now() - first >= secs) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          const p = window.chromaglassDebug?.()?.pipelines?.();
          const waitedFor = p?.prepares?.find((x) => x.stage === 'opening')?.keys ?? [];
          const before = new Set(waitedFor);
          const asked = p?.ledger?.asking ? [...p.ledger.asking.keys()] : null;
          return {
            stepped: first != null && at() >= n && performance.now() - first >= secs,
            asked,
            waitedFor,
            // Asked for in its opening and not built before it opened: left
            // for later, or on no list at all.
            late: asked ? asked.filter((k) => !before.has(k)) : null,
          };
        }, [OPENING_STEPS, OPENING_SECONDS * 1000, LOOK_CAP_S * 1000]) });
      } catch (err) {
        out.push({ id, stepped: false, error: String(err).split('\n')[0].slice(0, 160) });
      } finally { await page.close().catch(() => {}); }
    }
  } finally { await browser.close(); }
  return out;
}

/** When the device came and the pipelines were built, against load. */
const milestones = (o) => {
  const at = (t) => (t == null ? 'never' : `${t.toFixed(2)} s`);
  const parts = o.gpu.map(([w, a, b]) => `${w} asked ${at(a)}, given ${at(b)}`);
  const p = o.prepared;
  if (p?.at != null) parts.push(`built ahead from ${at(p.at / 1000)} to ${at((p.at + p.ms) / 1000)}`);
  const b = o.behind;
  if (b?.at != null) parts.push(`the rest behind it from ${at(b.at / 1000)} to ${at((b.at + b.ms) / 1000)}`);
  parts.push(`first step ${at(o.firstStep == null ? null : o.firstStep / 1000)}`);
  parts.push(`longest wait for a frame before it ${say(o.framesBefore)}`);
  return parts.join('; ');
};

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
  console.log(`     ${milestones(c)}`);
  if (process.env.STARTUP_TIMELINE) timeline(c);

  // ── The show as it ships ──────────────────────────────────────────
  const o = await open('', presetIds);
  console.log(`  as shipped (shader cache ${o.cache})`);
  console.log(`     ${milestones(o)}`);
  const p = o.prepared;
  const b = o.behind;
  check('the show opens and the plate is stepping',
    o.running && o.firstStep != null && o.firstStep / 1000 <= FIRST_STEP_MAX_S,
    `${o.firstStep == null ? 'no step at all' : `first step at ${(o.firstStep / 1000).toFixed(2)} s (no later than ${FIRST_STEP_MAX_S} s)`}`
    + `${p ? `, after ${(p.ms / 1000).toFixed(2)} s building ${p.asked} pipelines ahead` : ''}${o.running ? '' : '; never two steady seconds'}`);
  const secs = (t) => (t == null ? 'never' : `${(t / 1000).toFixed(2)} s`);
  check(`and it is moving for good no later than the old way was (with ${STEADY_SLACK_S} s to spare)`,
    o.steadyFrom != null && c.steadyFrom != null && o.steadyFrom <= c.steadyFrom + STEADY_SLACK_S * 1000
      && o.steadyFrom / 1000 <= FIRST_STEP_MAX_S,
    `from ${secs(o.steadyFrom)}, against ${secs(c.steadyFrom)} for ?prepare=0`);
  // What the old way built on its frames, on the same look: each should have
  // been waited for. Names, not a count, so a list that grew elsewhere and
  // lost one of these still fails.
  const oldWay = [...new Set((c.ledger?.onFrame ?? []).map((e) => e.name))];
  const notWaited = p ? oldWay.filter((k) => !p.keys.includes(k)) : oldWay;
  check('every pipeline it asked for ahead was built ahead, before it opened and behind it, on the device it opened on',
    !!p && !!b && oldWay.length > 0 && notWaited.length === 0 && p.ready === p.asked && !p.timedOut && b.ready === b.asked && !b.timedOut,
    !p ? 'nothing was prepared (no `pipelines` in chromaglassDebug)'
      : `${p.ready} of ${p.asked} before it opened in ${(p.ms / 1000).toFixed(2)} s${p.timedOut ? ', and it stopped waiting' : ''}; `
        + (b ? `${b.ready} of ${b.asked} behind it in ${(b.ms / 1000).toFixed(2)} s${b.timedOut ? ', and it stopped waiting' : ''}` : 'nothing built behind it')
        + `; waited for ${oldWay.length - notWaited.length} of the ${oldWay.length} the old way built on its frames`
        + (notWaited.length ? ` (not: ${notWaited.join(', ')})` : ''));
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
  check(`no stop in the opening, or while the rest was built behind it (frames, heartbeats and steps each no more than ${MAX_GAP_S} s apart)`,
    o.frames.first != null && o.beats.first != null && o.steps.first != null && worst <= MAX_GAP_S,
    `longest wait for a frame ${say(o.frames)}, for a heartbeat ${say(o.beats)}, for a step ${say(o.steps)}, watched to ${secs(o.watch)}`);
  if (worst > MAX_GAP_S || process.env.STARTUP_TIMELINE) timeline(o);

  // ── Every look, opened on its own ─────────────────────────────────
  const each = await openings(presetIds);
  const leaky = each.filter((e) => e.stepped && (e.late == null || e.late.length > 0));
  const unmeasured = each.filter((e) => !e.stepped);
  const measured = each.filter((e) => e.stepped && e.asked);
  /*
    And the other way: a part some look waits for that no look asked for.
    Either the split waits for what nothing opens with, or the window closed
    before the part switched on in the look that has it, and then the line
    above measured nothing for that part. Parts every look waits for are
    left out: those are waited for whether used or not (the projector's
    pass, which a show with nothing set never asks for, is one).
  */
  const waitedBy = (k) => measured.filter((e) => e.waitedFor.includes(k)).length;
  const own = [...new Set(measured.flatMap((e) => e.waitedFor))].filter((k) => waitedBy(k) < measured.length);
  const askedAny = new Set(measured.flatMap((e) => e.asked));
  const unused = own.filter((k) => !askedAny.has(k));
  const waits = measured.map((e) => e.waitedFor.length);
  check(`every look opens on only what the show waited for, and each look's own part is asked for (all ${presetIds.length}, each opened on its own)`,
    each.length === presetIds.length && presetIds.length > 30 && measured.length === each.length && leaky.length === 0 && unused.length === 0,
    `waited for ${waits.length ? `${Math.min(...waits)} to ${Math.max(...waits)}` : 'nothing'} pipelines over ${OPENING_STEPS} steps and ${OPENING_SECONDS} s`
      + (leaky.length ? `; asked for what it had not waited for: ${leaky.slice(0, 6).map((e) => `${e.id} (${e.late == null ? 'no record' : e.late.join(', ')})`).join('; ')}` : '')
      + (unused.length ? `; waited for by a look and asked for by none: ${unused.join(', ')}` : '')
      + (unmeasured.length ? `; unmeasured: ${unmeasured.slice(0, 6).map((e) => `${e.id}${e.error ? ` (${e.error})` : ''}`).join(', ')}` : ''));
} finally { stop(); }

const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
