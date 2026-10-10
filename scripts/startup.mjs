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
 *      without a step after) no later than the control was, with what
 *      neither page owns taken out of both: Chromium handing over the GPU,
 *      and the GPU compiling the pipelines the old way built on its frames.
 *      What is left, the page's own wait, may be no more than
 *      STEADY_SLACK_S longer than the control's; and the show may take no
 *      more than COMPILE_RATIO times as long a pipeline building them
 *      ahead as the control's stop took compiling them. Waiting for all
 *      eighty-seven passed everything else and opened at 23 s against the
 *      control's 14 (`gpu/prepare.ts`): a fix that trades the freeze for a
 *      longer wait is not one. Two openings' wall times, unpaired, could not
 *      say so: the same compile ran up to half as long again in one as in
 *      the other (STEADY_SLACK_S).
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
 *      a second past the end of the building behind it, whichever is last.
 *      A frame gap counts whole, except for the time in it, in the
 *      opening's first HELD_BY_S and before the first step, when the page's
 *      own thread ran nothing at all and its code was not picking up
 *      after an await (4b).
 *      Heartbeats and steps only begin once the show opens, so until then
 *      frames are the only measure of the building ahead.
 *   4b. and the page's thread held from outside it, in stretches
 *      beginning in the first HELD_BY_S and ending before the first step,
 *      no more than COLD_CAP_S all told: no frame, no tick of its own
 *      timer, no long task of its own, and not the page's own code picking
 *      up after a promise it awaits settled (`pagehold.mjs`, whose own
 *      cases are checked on every run, on the line before). That is how
 *      Chromium starting Metal on a cold runner looks from the page, on
 *      every opening read, and not how any stop of the show's own has (see
 *      openingGaps). The
 *      instruments have to be able to tell: long tasks observable, and the
 *      page's timer ticking as asked before the first step.
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
 * meaningful (and 4b's instruments can be tried, not its numbers), because they are about what the app asked for and when; 5
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
import { heldStretches, selfCheck } from './pagehold.mjs';

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
 * How much longer than the old way the show's own part of the wait to moving
 * for good may be (1b, waitOf). It was three seconds on the whole wait, from
 * load, on the reading that a cold compile "varies by a second or two from
 * one opening to the next". It varies by more. Over seventy runs of the open
 * shard (27 September to 3 October) the show less the control ran from -4.95
 * to +4.35 s, and went red on three (16.72 against 13.71 s on 36371919138,
 * 22.47 against 18.12 on 37095698733, 19.24 against 14.99 on 37143242070,
 * #223's). Each opening's wait is three things: Chromium handing over the
 * adapter and device (2.9 to 6.1 s after load), the GPU compiling the same
 * forty-five pipelines cold, and the page's own work around them. The first
 * is not the page's; the second took the two openings of one run from 0.75
 * to 1.5 times as long a pipeline as each other, the same pipelines on the
 * same runner a minute apart, and on the three reds the show's compile was
 * the slower by 22 to 31 per cent (12.9 to 16.8 s of it). The page's own
 * part, what the show waited for beyond the old way's list included, less
 * the control's read -0.90 to +0.31 s on every one of the seventy (mean
 * -0.13, sd 0.22), the three reds +0.05, +0.31 and +0.09 (replayed from
 * what each run printed, a proxy: each build's time approximated from the
 * total, the control's longest frame stop taken for the one waitOf picks). So that is what is held to the old way's, and a second is
 * above every run read: the eighty-seven the show once waited for add
 * forty pipelines of its own, nine seconds of them. The first cut read
 * the old way's compile off its steps' stop, and went red on #218's
 * deploy (37167643240) the first time a control froze before its first
 * step was counted: no stop in its steps, so nothing priced, and the
 * show's 1.14 s held to the control's whole 19.59 s as "not cold". Its
 * frames' stop (2.16 to 19.78 s) prices it: 2.0 s its own, the show's 1.14.
 */
const STEADY_SLACK_S = Number(process.env.STARTUP_STEADY_SLACK ?? 1);
/**
 * How much longer the show may take building the old way's pipelines ahead
 * than the old way's steps stopped while it compiled them on its frames (1b's
 * second line). Waited for one at a time with the async call, a cold compile
 * costs what it does on the frame (0.23 against 0.22 s, `gpu/prepare.ts`);
 * over the seventy runs the show's against the control's, opening against
 * opening, read 0.75 to 1.5 times, approximated from each run's total (the
 * logs print the whole build, not each), with the three reds at 1.22 to
 * 1.31. That spread is the runner's: the same compile, a minute apart. The
 * first line prices the show's compile as the runner's whatever it took, so
 * this is what holds the show to building no slower than the runner
 * compiles. At 1.75 it is above every pair read with room for what the
 * approximation hides, and a build made twice as slow (another eleven
 * seconds) is the page's. Slower than the runner's own spread, by less than
 * half again, one pair of openings cannot tell from the runner, and did not
 * before either: the old line went red on the runner instead.
 */
const COMPILE_RATIO = 1.75;
/**
 * The most time before the first step the page's thread may be held from
 * outside it, all told (4b). This is not what tells Chromium's stop from
 * the show's: that is the page's own timer, its long tasks and where the
 * promises it awaits settled (frameGaps in open()). It is the backstop if that
 * ever tells wrong, so that no reading of the instruments excuses the
 * nine-second freeze this check exists for. Over the fifty-three cold
 * openings of 26-27 September the stop at Chromium's start ran 1.25 to
 * 4.05 s in the show (median 2.48) and 1.40 to 4.18 s in the control
 * (median 3.00). At 3.5 s, the cap before this, two shows went over (4.05 s,
 * run 36294600123, and 3.75 s, 36338802046, each wholly inside a device
 * request that took four seconds): red on Chromium's time, not the show's.
 * Four and a half is above every opening read, the control's included, and
 * half the freeze; the owner chose it (2026-09-27). A stop of the show's
 * own does not reach this cap at all, being counted whole by check 4.
 */
const COLD_CAP_S = 4.5;
/**
 * How long the page's thread must run nothing, no frame, no timer and no
 * long task, for the stretch to count as held (4b).
 * The timer asks every 100 ms, so a free thread never goes half a second
 * without one; Chromium's hold at the
 * GPU's start was 1.2 s or more on every opening read.
 */
const HELD_MIN_S = 0.5;
/**
 * The most the page's own timer may take between ticks, as a median, for
 * its silence to mean anything: a timer throttled to a second would call
 * every second of a real freeze "held". Asked every 100 ms.
 */
const TICK_OK_MS = 150;
/**
 * The latest after load a held stretch may begin and still be taken for
 * Chromium's start (4b). Its hold began 0.98 to 1.42 s after load on all
 * 106 openings of the fifty-three runs read, and the one time a frame let
 * through split it, the second piece began at 2.32 s (36339282520). The
 * first step comes ten to twenty seconds in, so without this any stretch
 * of the show's own that held the page between the two would be excused
 * and share Chromium's budget; a stretch beginning later counts whole
 * against check 4.
 */
const HELD_BY_S = 3;

/**
 * The page's frame gaps, each with what is left of it once the time the
 * page's thread was held from outside it is taken out (see where frameGaps
 * is made in open()), and those held stretches. The frames' longest for
 * check 4 is the longest of what is left; 4b is the held stretches. A page
 * that drew no frame at all has none to show, and says so.
 */
const frameStops = (x) => {
  const [at, whole, own] = x.frameGaps[0] ?? [null, 0, 0];
  const longest = x.held.reduce((m, h) => (!m || h[1] > m[1] ? h : m), null);
  return {
    frames: { gap: own, whole, at, first: x.framesSeen ? 0 : null },
    held: {
      total: x.held.reduce((n, [, len]) => n + len, 0),
      stretches: x.held,
      gap: longest ? longest[1] : 0,
      at: longest ? longest[0] : null,
      first: longest ? 0 : null,
      seen: x.heldSeen,
    },
  };
};

/**
 * The page's frame gaps, each [began, whole, less the held time] with the
 * largest of what is left first, the held stretches, and the silent ones
 * kept as the page's own code after an await with what settled before each
 * (seconds). Nothing is taken out unless long tasks could be seen and the
 * page's timer ticked as asked before the first step: then the page's own
 * work would look held.
 */
const openingGaps = (x, heldByMs = HELD_BY_S * 1000) => {
  const { frames, frameRan, ...rest } = x.raw;
  const seenOk = x.heldSeen.longOk && x.heldSeen.tickMedian != null && x.heldSeen.tickMedian <= TICK_OK_MS;
  const { held, own } = seenOk
    ? heldStretches({ frames: frameRan, ...rest }, { stepRaw: x.stepRaw, t0: x.t0, heldMinMs: HELD_MIN_S * 1000, heldByMs })
    : { held: [], own: [] };
  const heldIn = (a, b) => held.reduce((n, [st, en]) => n + Math.max(0, Math.min(b, en) - Math.max(a, st)), 0);
  const ts = [...frames, x.now];
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push([ts[i - 1] / 1000, (ts[i] - ts[i - 1]) / 1000, (ts[i] - ts[i - 1] - heldIn(ts[i - 1], ts[i])) / 1000]);
  gaps.sort((p, q) => q[2] - p[2]);
  return {
    frameGaps: gaps.slice(0, 12),
    held: held.map(([a, b]) => [a / 1000, (b - a) / 1000]),
    settledStarts: own.map(([a, b, what]) => [a / 1000, (b - a) / 1000, what]),
  };
};

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
 * What every page the check opens is watched with, from its first moment
 * (added as an init script; see open() and instrumentsControl()).
 */
const instruments = () => {
  const t0 = performance.now();
  window.__startupT0 = t0;
  const frames = [];
  window.__startupFrames = frames;
  /*
    And when each frame's callback ran, which is not its timestamp: that
    is when the frame began, and a frame begun just before a second of
    the page's own code runs after it, carrying the earlier time (a
    cloud session: 835.9 ms on a frame whose callback ran at 1832 ms,
    behind code that began at 832.2). What ran after what (4b,
    `pagehold.mjs`) is read from these; the gaps from the timestamps.
  */
  const frameRan = [];
  window.__startupFrameRan = frameRan;
  const tick = (t) => { if (frames.length < 20000) { frames.push(t); frameRan.push(performance.now()); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const long = [];
  window.__startupLong = long;
  // Whether long tasks can be seen at all: without them a stretch of the
  // page's own work would look like a thread held from outside (4b).
  window.__startupLongOk = false;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
    window.__startupLongOk = PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
  } catch { /* no long tasks here; the frames still say it */ }
  /*
    And long animation frames, printed and not judged. The page's own
    JavaScript run as a promise's continuation, after an `await` on
    requestAdapter, requestDevice, createComputePipelineAsync,
    onSubmittedWorkDone or fetch, is not reported as a long task: a
    second of it in a cloud session left no long task and no tick, so it
    looked exactly like a thread held from outside. That second is a
    long animation frame (1.00 s), and a renderer stopped from outside
    for two seconds (SIGSTOP) left none, so these were tried as the tell.
    On the Mac they are not one: Chromium's own hold at the GPU's start
    was a long animation frame too (2.94 s from 1.01 s, over a frame gap
    of 2.80 s from 1.17 s, run 36353565837). What does tell is where the
    page's code after an await begins (__startupSettled below). The
    frame's scripts do tell for one kind of promise: the continuation of
    a fetch, a body read, an image or an audio decode is named as a
    script for as long as it runs, the GPU's promises' never are, and
    Chromium's hold names none (`pagehold.mjs`). So each frame's scripts
    are kept, [start, duration], for that; the frames stay printed.
  */
  const loaf = [];
  window.__startupLoaf = loaf;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) loaf.push([e.startTime, e.duration, e.renderStart ?? null, e.blockingDuration ?? null, (e.scripts ?? []).length, (e.scripts ?? []).map((x) => [x.startTime, x.duration])]);
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* none here; they are only printed */ }
  /*
    The page's own thread, every tenth of a second: a timer that does
    nothing but note when it ran. It runs whenever the thread is free,
    so a stretch with no tick and no long task, not begun where a
    promise settled (below), is one in which the page
    ran nothing at all (4b; frameGaps below).
  */
  const ticks = [];
  window.__startupTicks = ticks;
  const beat = () => { ticks.push(performance.now()); if (ticks.length < 20000) setTimeout(beat, 100); };
  setTimeout(beat, 100);
  // Every synchronous build, whoever asked: the ledger's own count is
  // only as good as every caller going through the cache.
  const direct = [];
  window.__startupDirect = direct;
  for (const name of ['createComputePipeline', 'createRenderPipeline']) {
    const f = GPUDevice.prototype[name];
    GPUDevice.prototype[name] = function (d) { direct.push([performance.now(), d?.label ?? '']); return f.call(this, d); };
  }
  /*
    The first time the page asked WebGPU for each thing it can do, and
    how often. A stop that no build of ours was under way for (run
    36298506575: 2.07 s from 17.17 s, a tenth of a second after the
    first step) is something else the first frames asked the GPU
    process for the first time; this is how the next one is named.
  */
  const firsts = new Map();
  window.__startupFirsts = firsts;
  /*
    And when the GPU finished each piece of work the page handed it, with
    what was in it. Through the stop after the first step the page's own
    timers kept firing (the timeline's rows every quarter second) while
    frames, heartbeats and steps all waited: the page's thread is free,
    so the wait is on the GPU. Writing every texel of the show's 75.8 MB
    of fields on a bare page stopped nothing (0.08 s, run 36304683847),
    nor did clearing them, nor a first dispatch of every kernel on
    scraps. So this records each submit's time handed over, its time
    done (onSubmittedWorkDone after it), and the pipelines it ran with
    their workgroup counts. It named the stop on its first run (run
    36305436208): 1.42 s of GPU time on the plate's first draw, 0.03 s
    on the same draw a few frames later. The render pipelines built
    ahead now draw once before the show opens (`gpu/kit.ts`, firstDraw),
    and the same submit took 0.14 s (run 36306162647).
  */
  const subs = [];
  window.__startupSubs = subs;
  const passOf = new WeakMap(), workOf = new WeakMap(), bufOf = new WeakMap();
  const note = (enc, label, n) => {
    let w = workOf.get(enc);
    if (!w) { w = new Map(); workOf.set(enc, w); }
    w.set(label, (w.get(label) ?? 0) + n);
  };
  for (const [begin, Pass] of [['beginComputePass', globalThis.GPUComputePassEncoder], ['beginRenderPass', globalThis.GPURenderPassEncoder]]) {
    const b = GPUCommandEncoder.prototype[begin];
    GPUCommandEncoder.prototype[begin] = function (...a) { const pass = b.apply(this, a); passOf.set(pass, { enc: this, label: '' }); return pass; };
    const sp = Pass?.prototype?.setPipeline;
    if (sp) Pass.prototype.setPipeline = function (pl) { const r = passOf.get(this); if (r) r.label = pl?.label || '?'; return sp.call(this, pl); };
  }
  const dw = globalThis.GPUComputePassEncoder?.prototype?.dispatchWorkgroups;
  if (dw) GPUComputePassEncoder.prototype.dispatchWorkgroups = function (x, y = 1, z = 1) { const r = passOf.get(this); if (r) note(r.enc, r.label, x * y * z); return dw.call(this, x, y, z); };
  const dr = globalThis.GPURenderPassEncoder?.prototype?.draw;
  if (dr) GPURenderPassEncoder.prototype.draw = function (...a) { const r = passOf.get(this); if (r) note(r.enc, `draw ${r.label}`, 1); return dr.apply(this, a); };
  const fin = GPUCommandEncoder.prototype.finish;
  GPUCommandEncoder.prototype.finish = function (...a) { const cb = fin.apply(this, a); bufOf.set(cb, workOf.get(this)); return cb; };
  const sub = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (cbs) {
    const r = sub.call(this, cbs);
    if (subs.length < 6000) {
      const work = new Map();
      for (const cb of cbs ?? []) for (const [k, n] of bufOf.get(cb) ?? []) work.set(k, (work.get(k) ?? 0) + n);
      const row = [performance.now(), null, [...work]];
      subs.push(row);
      this.onSubmittedWorkDone().then(() => { row[1] = performance.now(); }, () => {});
    }
    return r;
  };
  /*
    And how much memory the page asked for, and wrote, when. The stop
    after the first step kept on a warm cache (median 1.15 s over the
    forty looks' openings, run 36300733762), so it is not a compile:
    what the first frames make and fill is the next thing to see.
  */
  const bytes = [];
  window.__startupBytes = bytes;
  const bpp = { rgba32float: 16, rgba32uint: 16, rgba16float: 8, rg32float: 8, r32float: 4, rg16float: 4, r16float: 2, r8unorm: 1 };
  const texBytes = (d) => {
    const [w, h = 1, z = 1] = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1];
    return w * h * z * (bpp[d.format] ?? 4);
  };
  const log = (proto, key, kind, size) => {
    const f = proto?.[key];
    if (!f) return;
    proto[key] = function (...a) { try { bytes.push([performance.now(), kind, size(...a)]); } catch { /* measure only */ } return f.apply(this, a); };
  };
  log(GPUDevice.prototype, 'createTexture', 'texture', (d) => texBytes(d));
  log(GPUDevice.prototype, 'createBuffer', 'buffer', (d) => d.size);
  log(GPUQueue.prototype, 'writeTexture', 'written', (_, data) => data.byteLength ?? 0);
  log(GPUQueue.prototype, 'writeBuffer', 'written', (_, __, data, ___, size) => size ?? data.byteLength ?? 0);
  for (const name of ['GPUDevice', 'GPUQueue', 'GPUCommandEncoder', 'GPUComputePassEncoder', 'GPURenderPassEncoder', 'GPUBuffer', 'GPUCanvasContext', 'GPUTexture']) {
    const proto = globalThis[name]?.prototype;
    if (!proto) continue;
    for (const key of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, key);
      if (key === 'constructor' || typeof d?.value !== 'function') continue;
      const f = d.value, what = `${name.slice(3)}.${key}`;
      proto[key] = function (...a) {
        const row = firsts.get(what);
        if (row) row[1]++; else firsts.set(what, [performance.now(), 1]);
        return f.apply(this, a);
      };
    }
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
  /*
    When each promise the page's code awaits on its way to the first
    step settled: the moment its continuation begins. The page's own
    JavaScript after an `await` is no long task (above), so a stall of
    the show's there leaves no frame, no tick and no long task, as
    Chromium's hold does; but it begins where one of these settled,
    and Chromium's hold does not (it began 0.98 to 1.42 s after load
    on every opening read, with the adapter or device still pending,
    and ended at their handover). So a silent stretch that begins
    where a promise settled is the page's own (4b). The adapter's and
    the device's are gpuAt's; these are the rest the show awaits: its
    pipelines, its GPU's work done, mapped buffers, errors, and what
    it fetches. A continuation of anything not here (an import(), a
    decoded image) would still look held; COLD_CAP_S is the backstop.
  */
  const settled = [];
  window.__startupSettled = settled;
  const settles = (owner, name, what = name) => {
    const f = owner?.[name];
    if (!f) return;
    owner[name] = function (...a) {
      const p = f.apply(this, a);
      if (!p || typeof p.then !== 'function') return p;
      const at = () => { if (settled.length < 50000) settled.push([performance.now(), what]); };
      return p.then((v) => { at(); return v; }, (e) => { at(); throw e; });
    };
  };
  settles(globalThis.GPUDevice?.prototype, 'createComputePipelineAsync');
  settles(globalThis.GPUDevice?.prototype, 'createRenderPipelineAsync');
  settles(globalThis.GPUDevice?.prototype, 'popErrorScope');
  settles(globalThis.GPUQueue?.prototype, 'onSubmittedWorkDone');
  settles(globalThis.GPUBuffer?.prototype, 'mapAsync');
  settles(globalThis.GPUShaderModule?.prototype, 'getCompilationInfo');
  settles(globalThis, 'fetch');
  for (const k of ['json', 'text', 'arrayBuffer', 'blob']) settles(globalThis.Response?.prototype, k, `Response.${k}`);
  settles(globalThis, 'createImageBitmap');
  settles(globalThis.BaseAudioContext?.prototype, 'decodeAudioData');
  const rows = [];
  window.__startupRows = rows;
  const sample = () => {
    const d = window.chromaglassDebug?.();
    const f = d?.fluids?.[0];
    const made = window.__startupBytes ?? [];
    rows.push([performance.now() - t0, frames.length, d?.crash?.beats?.() ?? -1, f?.stepIndex ?? -1, f?.gpu?.N ?? 0,
      made.filter(([, k]) => k === 'texture').length, made.filter(([, k]) => k === 'written').length, window.__startupFirsts?.get('Queue.submit')?.[1] ?? 0]);
    if (rows.length < 2000) setTimeout(sample, 250);
  };
  setTimeout(sample, 250);
  /*
    What the page ran, for telling held stretches from its own
    (`pagehold.mjs`): frames by when their callback ran, the timer's ticks,
    long tasks, each promise it awaits settling, named (the adapter's and
    the device's too), and the long animation frames with their scripts.
    One function for the opening and the instruments' control, so the two
    read the same things.
  */
  window.__startupRaw = (now, stepRaw) => ({
    frames: window.__startupFrames.filter((t) => t <= now),
    frameRan: window.__startupFrameRan.filter((t) => t <= now),
    ticks: window.__startupTicks.filter((t) => t <= now),
    long: window.__startupLong.filter(([st]) => st <= now),
    marks: [...window.__startupSettled, ...window.__startupGpu.filter((r) => r[2] != null).map((r) => [r[2], r[0]])].filter(([t]) => t <= now),
    loaf: window.__startupLoaf.filter(([st]) => st <= Math.min(now, stepRaw)),
  });
};

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
    await page.addInitScript(instruments);
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
    /*
      Never shorter than the wait above for the plate to be running. On run
      36306624796 the control's freeze (12.83 s, on a runner whose adapter
      alone took 4.65 s) ended at 20.0 s, the plate was seen running at about
      22 s, and the watch, twenty seconds, read the steps to 20.0 s: a stop
      still going, so the control was "never" moving for good and check 1b
      failed on the control, the show having been moving from 13.53 s. The
      opening is read to a moment already seen, not one before it; for the
      show the builds behind it end later than that anyway, so what it is
      held to is unchanged.
    */
    const watch = await page.evaluate(async ([least, past, behindEnd]) => {
      const first = (window.__startupRows.find((r) => r[3] > 0) ?? [null])[0];
      const until = Math.max(least, first == null ? 0 : first + past, behindEnd == null ? 0 : behindEnd + 1000, performance.now());
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
    const opening = await page.evaluate(([watch, maxGap, heldBy]) => {
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
      /*
        What the frames waited for that was the show's, and what was not.

        On CI's cold Mac every opening, the control's and the show's, draws
        no frame for 1.25 to 4.2 s from 1.0 to 1.4 s after load (fifty-three
        runs of the open shard, 26-27 September). The rule before this one
        set apart the one frame gap beginning within a quarter second of
        where the control's own stop began, and held it to the control's
        plus a second. It went red on #204 (run 36346188828) with nothing of
        the show's under way: the show's adapter was asked for at 0.52 s and
        given at 4.00 s, and a long task of the page's (0.15 s from 1.27 s)
        let one frame through at 1.41 s, splitting the stop in two. The rule
        matched the 0.15 s piece at 1.26 s, and the 2.58 s piece from 1.41 s
        to 3.99 s went to check 4. The control's stop that day was 1.40 s
        from 1.02 s, ending at its own adapter's handover (2.35 s), so even
        the right piece was held to 2.40 s. Run 36339282520 split the same
        way (1.28 s from 1.04 s, then 1.68 s from 2.32 s) and passed only
        because the second piece was under two seconds. The moment the stop
        begins is not what makes it Chromium's, and the control's length is
        another browser's start on the same runner, not a bar for this one.

        What does tell it apart is the page's own thread. On all eight
        openings whose timeline was printed with such a stop (36255595521,
        36258502020, 36269690812, 36294600123, 36295658452, 36297416845,
        36338802046, 36346188828) the page's quarter-second rows stopped
        with the frames and came back with them (0.87 s to 4.74 s against
        frames 1.04 s to 4.79 s on 36338802046; 1.25 s to 3.99 s against
        1.41 s to 3.99 s on #204's), and no long task of the page's lay in
        it: the page ran nothing at all, not its JavaScript, not its
        timers. That held on 36269690812 too, where the device had been
        given at 0.55 s and the first pipelines were building through it
        (as on 36335261405, device at 0.53 s, stop 2.45 s from 1.11 s), so
        "before the device" is not the line either. Where the page was
        still waiting for its adapter or device when the stop began (105
        of the 106 openings), the stop ended within a tenth of a second of
        that handover in 89, earlier in the rest (a frame let through
        splits it), and never more than 0.11 s after: the page is let go
        when Chromium's GPU answers. The show's own stops look the other
        way. The freeze this check exists for, pipelines built on a frame,
        stopped frames, heartbeats and steps for nine seconds "while the
        page's own timers kept firing" (the header), because a compile
        holds the GPU process and not the page. The stop after the first
        step (2.43 s from 19.62 s on 36294600123) kept the rows coming
        every quarter second through it (19.78 s to 22.02 s, frames stuck
        at 605). And the page's own JavaScript, however long, is a long
        task, or, when it runs as the continuation of an awaited promise
        (all of the show's GPU setup does), begins the moment that promise
        settled (__startupSettled above).

        So each frame gap is counted less only the time in it when the
        page's thread was held: no frame callback, no tick of the page's
        own tenth-of-a-second timer and no long task, for HELD_MIN_S or
        more, beginning in the first HELD_BY_S after load and not where a
        promise the page awaits had just settled with nothing of the page's
        after it (`pagehold.mjs` has that rule and the cases it was tried
        on), and ending before the first step. If the show's builds held the
        frames past Chromium's start, the page's timer comes back while the
        frames still wait, and that part is counted in full for check 4.
        The held time is 4b's, held to COLD_CAP_S all told. None of it is
        taken out when long tasks cannot be seen, or the timer did not tick
        as asked before the first step: then the page's own work would look
        held. Chromium
        reports as long tasks only the tasks it gives to the page: a busy
        second in the page's own timer, frame or script is one, the same
        second run through Playwright's evaluate is not. So the harness's
        own evaluates here stay short polls.
      */
      const t0 = window.__startupT0;
      /*
        Before the first step means before the last quarter-second row that
        had not yet seen one, not the first row that had: that row is a
        timer, so a hold beginning just after the step delays it to the
        hold's end, and the hold would pass for one before the step. The
        show's own stops begin just there (the control's, 0.03 to 0.21 s
        after the row that saw its step, on all fifty-three).
      */
      const stepRow = rows.findIndex((r) => r[3] > 0);
      const stepRaw = stepRow < 0 ? now : stepRow === 0 ? t0 : rows[stepRow - 1][0] + t0;
      const ticks = window.__startupTicks.filter((t) => t <= now);
      // The timer's pace where it vouches for the silence: before the step.
      const early = ticks.filter((t) => t <= stepRaw);
      const spacing = early.slice(1).map((t, i) => t - early[i]).sort((x, y) => x - y);
      const tickMedian = spacing.length ? spacing[spacing.length >> 1] : null;
      const heldSeen = { longOk: !!window.__startupLongOk, tickMedian };
      /*
        What the page ran, handed back whole: which silent stretches were its
        thread held from outside and which its own is told in Node, by
        `pagehold.mjs`, whose own cases the check runs first (the long
        comment there says why the fifty milliseconds this used to allow
        after a promise settled were not the tell). Only when the
        instruments can see the page's work at all (heldSeen).
      */
      const raw = window.__startupRaw(now, stepRaw);
      return {
        raw,
        stepRaw,
        now,
        framesSeen: window.__startupFrames.filter((t) => t <= now).length,
        heldSeen,
        beats: longest(changes(2)),
        steps: longest(changes(3)),
        firstStep: (rows.find((r) => r[3] > 0) ?? [null])[0],
        // The intro's times (src/lib/intro.ts), for the line under the milestones.
        intro: { ...(window.__cgIntro ?? {}) },
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
        /*
          Every stretch of more than MAX_GAP_S without an animation frame,
          [from, how long], in performance.now()'s seconds: the old way's
          freeze, the GPU compiling on the frame what its first step asked
          for, which 1b prices (waitOf). Frames and not steps: on the
          deploy of #218 (run 37167643240) the control's first step asked
          for its pipelines and the frames stopped from 2.16 s to 19.78 s
          before the step was ever counted, so its steps never stopped at
          all, and the steps are only sampled every quarter second besides.
        */
        frameStopsRaw: (() => {
          const ts = window.__startupFrames.filter((t) => t <= now);
          const out = [];
          for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > maxGap * 1000) out.push([ts[i - 1] / 1000, (ts[i] - ts[i - 1]) / 1000]);
          return out;
        })(),
        long: window.__startupLong.filter(([s]) => s <= now),
        // The page's own timer (seconds), so 1b can tell a stop the GPU held
        // with the page's thread free from one in which the page stood still.
        ticks: window.__startupTicks.filter((t) => t <= now).map((t) => t / 1000),
        // The first seconds' long animation frames, [began, lasted], so a
        // run says whether one lay across Chromium's hold (4b).
        loaf: window.__startupLoaf.filter(([st]) => st <= Math.min(now, (heldBy + 3) * 1000))
          .map(([st, d, rs, bl, n]) => [st / 1000, d / 1000, rs == null ? null : rs / 1000, bl == null ? null : bl / 1000, n]),
        t0: window.__startupT0,
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
        bytes: window.__startupBytes.filter(([t]) => t <= now).map(([t, k, n]) => [t / 1000, k, n]),
        firsts: [...window.__startupFirsts].map(([what, [at, n]]) => [what, at / 1000, n]),
        subs: window.__startupSubs.filter(([t]) => t <= now).map(([t, d, w]) => [t / 1000, d == null ? null : d / 1000, w]),
        box: (d?.crash?.thisLoad?.() ?? []).map((e) => `${e.up.toFixed(1)}s ${e.level} ${e.source}: ${String(e.msg).slice(0, 140)}`),
      };
    }, [watch, MAX_GAP_S, HELD_BY_S]);
    Object.assign(opening, openingGaps(opening));
    delete opening.raw;

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
      await page.addInitScript(() => {
        const frames = [];
        window.__startupFrames = frames;
        const tick = (t) => { if (frames.length < 20000) frames.push(t); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
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
          // The longest frame gap from a second before the first step to
          // the end: the stop after the first step, on a warm cache.
          const fr = first == null ? [] : window.__startupFrames.filter((t) => t >= first - 1000);
          let stop = 0;
          for (let i = 1; i < fr.length; i++) stop = Math.max(stop, fr[i] - fr[i - 1]);
          return {
            stop: stop / 1000,
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
  /*
    And what 4b made of that wait, on both pages. On 36364179427 the show's
    hold (2.08 s from 1.03 s) was taken out as held, and the control's
    (3.82 s from 1.05 s, inside its device request) was neither held nor
    set aside, with nothing printed to say why. Only the show's is judged;
    this says, on the control too, whether a long task lay in the wait and
    how the page's timer ran before the first step.
  */
  const f = o.framesBefore;
  const inIt = f?.at == null ? [] : o.long.filter(([st, d]) => st < (f.at + f.gap) * 1000 && st + d > f.at * 1000);
  parts.push(`held ${o.held.length ? o.held.map(([a, n]) => `${n.toFixed(2)} s from ${a.toFixed(2)} s`).join(', ') : 'none'}`
    + `, long tasks in that wait ${inIt.length ? inIt.map(([st, d]) => `${(d / 1000).toFixed(2)} s from ${(st / 1000).toFixed(2)} s`).join(', ') : 'none'}`
    + `, the page's timer every ${o.heldSeen.tickMedian == null ? 'never' : `${o.heldSeen.tickMedian.toFixed(0)} ms`} before the first step`);
  return parts.join('; ');
};

/*
  Which builds were under way through a stop, and the slowest of each half.
  Printed on every run, red or green: a stop that one build spans end to end
  is that build's compile holding the GPU process, and a stop with none under
  way is the show's own frame. The three deploys that went red on check 4 in
  a row (2.43, 2.02 and 2.03 s against 2 s, runs 36294600123, 36295658452 and
  36297416845) each stopped a quarter second after the first step, with the
  half behind the show started a quarter second before it; which of the two
  held the frames could not be told from what was printed then.
*/
const underWay = (o, g) => {
  // The whole frame gap, not what is left of it once the held time is out.
  const gap = g?.at == null ? g : { at: g.at, gap: g.whole ?? g.gap };
  const all = [...(o.prepared?.builds ?? []).map((x) => ['ahead', ...x]), ...(o.behind?.builds ?? []).map((x) => ['behind', ...x])];
  const fmt = ([, key, at, ms]) => `${key} ${(ms / 1000).toFixed(2)} s from ${(at / 1000).toFixed(2)} s`;
  const inGap = gap?.at == null ? [] : all.filter(([, , at, ms]) => at < (gap.at + gap.gap) * 1000 && at + ms > gap.at * 1000);
  const slowest = (half) => all.filter(([h]) => h === half).sort((x, y) => y[3] - x[3]).slice(0, 4).map(fmt).join(', ') || 'none';
  // What the page asked of WebGPU for the first time in the second before
  // the stop began, or during it.
  const asked = gap?.at == null ? [] : (o.firsts ?? []).filter(([, at]) => at >= gap.at - 1 && at <= gap.at + gap.gap);
  const mb = (from, to) => {
    const sum = { texture: [0, 0], buffer: [0, 0], written: [0, 0] };
    for (const [t, k, n] of o.bytes ?? []) if (t >= from && t <= to) { sum[k][0]++; sum[k][1] += n; }
    return Object.entries(sum).map(([k, [c, n]]) => `${c} ${k === 'written' ? 'writes' : `${k}s`} (${(n / 2 ** 20).toFixed(1)} MB)`).join(', ');
  };
  const step = o.firstStep == null ? null : o.firstStep / 1000;
  const made = `made and written in the longest frame gap and the second before it: ${gap?.at == null ? 'nothing to say' : mb(gap.at - 1, gap.at + gap.gap)}`
    + `; in the two seconds from a second before the first step: ${step == null ? 'no step' : mb(step - 1, step + 1)}`
    + `; before that, all told: ${step == null ? 'no step' : mb(0, step - 1)}`;
  return `${made}; builds under way in the longest frame gap: ${inGap.length ? inGap.map(fmt).join(', ') : 'none'}; slowest ahead: ${slowest('ahead')}; slowest behind: ${slowest('behind')}`
    + `; asked of WebGPU for the first time from a second before it: ${asked.length ? asked.map(([w, at]) => `${w} at ${at.toFixed(2)} s`).join(', ') : 'nothing'}`;
};

/*
  Where each build of the opening spent its time, from its own ask: the
  compiler, or its first use (`firstUse` and `firstDraw` in gpu/kit.ts,
  which wait for the GPU). Printed on every run, not judged. The opening's
  `builds` are charged wall time without overlap, which says what held the
  page but not what a build cost, three being in flight at once; this is
  each build's own, overlaps and all, so its sums run to about three times
  the opening. What it is for: choosing the next cut at the opening
  (PLAN.md 14v). Run 37190509856 read 6.31 s of lane time in first uses,
  6.18 s of it three render pipelines' first draws at once, each lane idle
  for 2.06 s; the first uses have been handed over without waiting since,
  and the one wait for all of them is printed after.
*/
const splitAhead = (o) => {
  const raw = o.prepared?.raw ?? [];
  if (!raw.length) return 'each build ahead from its own ask: not recorded';
  const part = (what, i) => {
    const xs = raw.filter((r) => r[i] != null).map((r) => [r[0], r[i]]).sort((a, b) => b[1] - a[1]);
    if (!xs.length) return `no ${what}`;
    const sum = xs.reduce((t, [, ms]) => t + ms, 0);
    const med = xs[Math.floor(xs.length / 2)][1];
    return `${xs.length} ${what} in ${(sum / 1000).toFixed(2)} s all told (median ${(med / 1000).toFixed(3)} s; slowest ${xs.slice(0, 5).map(([k, ms]) => `${k} ${(ms / 1000).toFixed(2)} s`).join(', ')})`;
  };
  // The order they were asked in, which gpu/prepare.ts sets: the first few.
  // From `keys`, the list the lanes take from in turn, and not from `raw`'s
  // times, rounded to the millisecond, where the first three tie and fall
  // back to the order they finished in.
  const order = (o.prepared?.keys ?? []).slice(0, 4).join(', ');
  const wait = o.prepared?.useWait;
  return `each build ahead from its own ask: ${part('compiled', 2)}; ${part('first used (handed to the GPU)', 3)}`
    + `; then waited ${wait == null ? 'never' : `${(wait / 1000).toFixed(2)} s`} for the GPU to finish the first uses; asked first: ${order}`;
};

/*
  What the GPU was doing through the stop: each submit from a second before
  the first step to three after it, and the time the GPU spent on it (from
  when it was handed over, or when the GPU finished the one before, to when
  it was done). The page hands the GPU its first ~8 steps in a quarter
  second, and until the render pipelines drew once ahead it then waited a
  second or more for any frame; this names the submits the GPU spends
  longest on, and the pipelines in them, so the next stop of its kind names
  itself. Printed, not judged: check 4 judges the frames.
*/
const gpuTime = (o) => {
  const step = o.firstStep == null ? null : o.firstStep / 1000;
  if (step == null || !o.subs?.length) return ['no submits to say'];
  const win = o.subs.filter(([t]) => t >= step - 1 && t <= step + 3);
  let prev = 0;
  const rows = win.map(([t, d, w]) => {
    const from = Math.max(t, prev);
    const took = d == null ? null : d - from;
    if (d != null) prev = Math.max(prev, d);
    return { t, d, took, w };
  });
  const undone = rows.filter((r) => r.d == null).length;
  const total = rows.reduce((a, r) => a + (r.took ?? 0), 0);
  const top = (w) => [...w].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, n]) => `${k}×${n}`).join(' ') || 'no passes';
  const slow = [...rows].filter((r) => r.took != null).sort((x, y) => y.took - x.took).slice(0, 8).sort((x, y) => x.t - y.t);
  return [`${rows.length} submits from a second before the first step to three after (${undone} never done), ${total.toFixed(2)} s of GPU time among them; the longest:`,
    ...slow.map((r) => `  handed ${r.t.toFixed(2)} s, done ${r.d.toFixed(2)} s, ${r.took.toFixed(2)} s on it: ${top(r.w)}`)];
};

/*
  1b's reading of one opening: the wait from load to moving for good, split
  into Chromium's, the GPU's compile of the pipelines the old way built on
  its frames, and the rest, which is the page's own.

  Chromium's is the page's first request for an adapter and its first for a
  device, each from asked to handed over, overlap counted once. Not capped
  against the control's: the control is the same page, asking the same way
  (only ?prepare=0 differs), so a change to how it asks moves both sides, and
  what differs between the two is the runner (the show's handover less the
  control's read -4.08 to +1.28 s over the seventy runs). Any further request,
  a device lost and asked for again, is the page's own.

  The old way's compile is the stop in its frames that the builds it made on
  its frames sat in, from where it began to moving for good: on the seventy
  runs read it began 0.03 to 0.18 s after the first step, and on #218's
  deploy before the first step was counted at all (frameStopsRaw). The show's
  is how long each of the same pipelines took to build ahead, one at a time,
  its first build under that name only (`gpu/prepare.ts`). Both include each
  pipeline's first use, which the old way paid on its frames as well
  (`gpu/kit.ts`, firstUse). What the show waited for beyond the old way's
  list is not priced out: it is the show's own wait.

  Moving for good is read off steps sampled every quarter second, on both
  sides, so the two own waits are each good to about a quarter second. The
  seventy runs' logs printed only each control's longest frame stop and each
  show's whole build, so the replay of them (-0.90 to +0.31 s) is a proxy
  for this rule; every run now
  prints the stop it chose and where it began, to read it against.
*/
const waitOf = (x, oldWay) => {
  if (x.steadyFrom == null) return null;
  // Rows are from the init script's start; WebGPU's moments, the builds' and
  // the ledger's are performance.now()'s.
  const t0 = (x.t0 ?? 0) / 1000;
  const steady = x.steadyFrom / 1000 + t0;
  const firstOf = (w) => (x.gpu ?? []).filter(([k, a]) => k === w && a != null).sort((p, q) => p[1] - q[1])[0];
  const asks = ['adapter', 'device'].map(firstOf).filter((r) => r && r[1] < steady)
    .map(([, a, b]) => [a, Math.min(b ?? steady, steady)]).sort((p, q) => p[0] - q[0]);
  let chromium = 0, end = 0;
  for (const [a, b] of asks) { const from = Math.max(a, end); if (b > from) chromium += b - from; end = Math.max(end, b); }
  let compile = 0, count = 0, at = null, stops = null;
  if (x.prepared) {
    const seen = new Set();
    for (const [key, at, ms] of x.prepared.builds ?? []) {
      if (!oldWay.includes(key) || seen.has(key) || at / 1000 >= steady) continue;
      seen.add(key);
      compile += Math.min(ms / 1000, steady - at / 1000);
      count++;
    }
  } else {
    // The stops in its frames that the builds it made on its frames sat in,
    // summed, each as it reads once Chromium's part is taken off: from the
    // end of Chromium's requests at the earliest, so a first step built
    // inside the device's own hold is not counted twice, and only to the
    // frames' return, the quarter second to the next counted step being the
    // page's own on both sides. A build sits in the stop that holds it, or,
    // held by none, in one begun within the second after it (the frame it
    // was asked for in may close before the GPU stops the next); a stop no
    // build sat in is not the compile, however long or near the builds, so
    // a runner's stall is not priced as compile. What is left of a stop
    // under a quarter second, the steps' own resolution, is not one.
    //
    // On this PR's own first Mac run (run 37171671783) the control's frames
    // stopped through Chromium's handover of the device with its first
    // build in that stop, then from 4.76 s for 12.10 s while it built the
    // other 47. The first cut took the first stop alone, which less
    // Chromium's hold read 0.01 s of compile, and the show's 12.48 s
    // building the same 48 read as 917 times slower. Summed and not the
    // longest, so a compile split over two stops is not read as half.
    //
    // And a stop that begins within a second of the end of one the builds
    // sat in is that compile still going, though no build sits in it. On
    // #257's run (37216108435) the control asked for all
    // 47 inside one long task of its own, the page's thread busy 1.96 s from
    // 0.51 s, which stopped its frames 2.02 s from 0.54 s: every build sat
    // in that stop. Then the frames came back for 0.33 s, and from 2.89 s
    // they stopped 16.27 s while the GPU
    // process compiled what had been asked, with no build in it (they had
    // all been asked already). Only the first was priced, so the old way's
    // compile read 2.02 s, its own wait 16.99 s, and the show's 10.64 s
    // building the same 47 ahead read 5.28 times as slow: red on a PR that
    // never touched the opening. Priced with the stop that follows, the
    // control's compile is 18.29 s, its own 0.71 s; the show's own 1.36 s
    // is held to that (and passes, by 0.35 s), its build reads 0.58 times
    // the control's, beside the 0.62 to 0.82 of the four other runs read
    // since #242.
    // Not looser: what moves from the control's own wait to its compile
    // makes the first line stricter by the same amount as it makes this
    // one easier, and a stop must still begin within a second of the
    // builds' own to be priced, so a runner's stall later is not.
    //
    // And a stop the GPU itself says was the compile, though no build sits
    // in it and it began more than a second after them. On #287's merged
    // head (run 37252828490) the control built its 47 on its first step at
    // 3.23 s, its frames kept coming, and from 5.59 s they stopped 9.98 s
    // with no build in it: nothing priced, its own wait read 13.80 s, "its
    // cache was not cold", and the second line had nothing to compare. On
    // #283's green run the same stop came 0.52 s after the builds' own and
    // was priced as following it. When the frames stop after the builds is
    // the GPU process's business, not the page's (the page asked for them
    // all at once and went on), so no window of time after the builds is
    // the right one. What is the GPU's own: the first submit to run a
    // pipeline cannot be done before that pipeline is compiled. So a stop
    // is the compile when the first use of one of the pipelines built on
    // the frames was handed over before it began and was done as the
    // frames came back (to the quarter second, and with the page's own
    // thread running through it: see below). A runner's stall
    // later has no first use outstanding through it, those were done long
    // before; and a stop the first uses were all done ahead of is not
    // priced by this, however near the builds it lies.
    const builds = (x.ledger?.onFrame ?? []).filter((e) => e.at / 1000 <= steady);
    const built = builds.map((e) => e.at / 1000);
    const raw = (x.frameStopsRaw ?? []).filter(([from]) => from < steady);
    const holds = raw.map(() => 0);
    for (const t of built) {
      let i = raw.findIndex(([from, len]) => t >= from && t <= from + len);
      if (i < 0) i = raw.findIndex(([from]) => from > t && from <= t + 1);
      if (i >= 0) holds[i]++;
    }
    // The ledger names a pipeline scope/label, a submit's work by its label
    // (a draw as "draw label"); each build's first submit, [handed, done].
    const labels = new Set(builds.map((e) => e.name.slice(e.name.indexOf('/') + 1)));
    const firstUse = new Map();
    for (const [t, d, work] of x.subs ?? []) {
      for (const [k] of work ?? []) {
        const label = k.startsWith('draw ') ? k.slice(5) : k;
        if (labels.has(label) && !firstUse.has(label)) firstUse.set(label, [t, d]);
      }
    }
    const firstUses = [...firstUse.values()];
    /*
      Three things keep that from pricing a stop that was not the compile
      (check-skeptic on this PR). The first use must come back with the
      frames, within a quarter second of their return either way, not merely
      after it: one never done (a device lost, its promise rejected and the
      time left empty) or done long after would otherwise vouch for any stop
      later. And the page's own timer must have kept running through the
      stop, never silent longer than a frame stop itself (MAX_GAP_S): the
      done time is when the page heard back, on its own thread, so a stop in
      which the page's thread or the whole renderer stood still would hold
      that back too and pass for the GPU's. Waiting on a compile, the page's
      thread is free and its timers fire (they did through the first step's
      stop of run 36305436208, every quarter second). And a stop priced so
      does not open the second's window for the one after (below).
    */
    const silence = (s, e) => {
      const at = [s, ...(x.ticks ?? []).filter((t) => t > s && t < e), e];
      return Math.max(...at.slice(1).map((t, i) => t - at[i]));
    };
    const waited = raw.map(([s, len]) => (silence(s, s + len) > MAX_GAP_S ? 0
      : firstUses.filter(([t, d]) => t <= s && d != null && Math.abs(d - (s + len)) <= 0.25).length));
    // What each stop is printed with, so a rule that misses reads off the
    // log: the last first use out when it began, done how long after the
    // frames came back (null: never), and the page's longest silence in it.
    const why = raw.map(([s, len]) => {
      const out = firstUses.filter(([t, d]) => t <= s && (d == null || d > s));
      const last = out.some(([, d]) => d == null) ? null : out.length ? Math.max(...out.map(([, d]) => d)) - (s + len) : undefined;
      return { last, silent: silence(s, s + len) };
    });
    let compiling = -Infinity;
    stops = raw.map(([s, len], i) => {
      const from = Math.max(s, end);
      const n = Math.max(0, Math.min(s + len, steady) - from);
      const follows = holds[i] === 0 && s - compiling <= 1;
      const taken = (holds[i] > 0 || follows || waited[i] > 0) && n >= 0.25;
      /*
        Only a stop the builds sat in, and one priced at that, opens the
        second's window for the next (check-skeptic on #278): a priced stop
        that only followed passed the window on, so runner stalls 0.9 s apart
        chained without end into the control's compile (2.02 s of builds and
        three stalls read 16.02 s, against 5.02 s), and a builds' stop wholly
        inside Chromium's own hold (n under 0.25, unpriced) armed it for a
        15 s stall after it with no build in it, so "the cache was not cold"
        and 1b judged a stall. #257's run still prices its 18.29 s.
      */
      if (holds[i] > 0 && n >= 0.25) compiling = s + len;
      return { from: from - t0, len: n, builds: holds[i], follows, waited: waited[i], ...why[i], taken };
    });
    for (const st of stops.filter((st) => st.taken)) {
      compile += st.len;
      count++;
      at ??= [st.from, st.len];
    }
  }
  return { steady: steady - t0, chromium, compile, shared: count, at, what: x.prepared ? 'built ahead' : count === 1 ? 'stop' : 'stops', stops, own: steady - t0 - chromium - compile };
};
const sayWait = (w) => (w == null ? 'never moving for good'
  : `${w.steady.toFixed(2)} s from load, ${w.chromium.toFixed(2)} s of it Chromium's, ${w.compile.toFixed(2)} s compiling the old way's pipelines (${w.shared} ${w.what}${w.at ? ` from ${w.at[0].toFixed(2)} s` : ''}), ${w.own.toFixed(2)} s the page's own`
    // Every stop its frames made, so a pick that is wrong reads off the log.
    + (w.stops ? ` [its frames stopped: ${w.stops.length ? w.stops.map((st) => `${st.from.toFixed(2)} s for ${st.len.toFixed(2)} s after Chromium's, ${st.builds} built in it, ${st.waited} first used before it and done as it ended (${st.last === undefined ? 'none out as it began' : st.last === null ? 'one out as it began never done' : `the last out as it began done ${st.last.toFixed(2)} s from its end`}, the page's timer silent at most ${st.silent.toFixed(2)} s)${st.taken ? `${st.follows ? ' (the compile going on from the stop before)' : ''}, priced` : ''}`).join('; ') : 'never'}]` : ''));
const say = (g) => (g.first == null ? 'none at all' : `${g.gap.toFixed(2)} s${g.at != null ? ` from ${g.at.toFixed(2)} s` : ''}`);
const timeline = (o, held = null) => {
  // Whether the page's own thread was busy through a gap (a long task
  // covers it) or free and the frames were held elsewhere (the GPU process).
  const busy = (f) => {
    const len = f?.whole ?? f?.gap;
    const inGap = f?.at == null ? [] : o.long.filter(([s, d]) => s < (f.at + len) * 1000 && s + d > f.at * 1000);
    return inGap.length ? inGap.map(([s, d]) => `${(s / 1000).toFixed(2)} s for ${(d / 1000).toFixed(2)} s`).join(', ') : 'none';
  };
  console.log(`     (main-thread long tasks in the longest frame gap: ${busy(o.frames)}${held?.at != null ? `; in the longest stretch the page's thread was held: ${busy(held)}` : ''})`);
  console.log('       seconds · animation frames · heartbeats · steps · grid · textures made · writes · submits');
  for (const r of o.rows) console.log(`       ${r.join('  ')}`);
  for (const line of o.box) console.log(`       ${line}`);
};

/**
 * The instruments' own control, in a browser like the openings' with the
 * same init script: a page that runs 0.7 s of its own code after awaiting a
 * fetch's body (a promise the check wraps) and 0.7 s after awaiting a Blob's
 * (one it does not), read through openingGaps as an opening is. Each must
 * read as the page's own, and a long animation frame must name each as a
 * script: the rule leans on Chromium naming that code, which was tried on
 * the cloud's Chromium (141), not on the one CI installs, so a Chromium that
 * stops naming it is red here rather than a stall of the page's passing as
 * held. The thread is never held from outside on this page, so a held
 * stretch in it is the rule telling the page's own code wrong.
 */
async function instrumentsControl() {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage();
    await page.route('**/__pagehold', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>pagehold</body>' }));
    await page.addInitScript(instruments);
    await page.goto(`http://localhost:${PORT}/__pagehold`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    // A script of the page's own, so Chromium gives it to the page as it
    // does the app's (an evaluate's code is not).
    const run = (code) => page.evaluate((c) => { const el = document.createElement('script'); el.textContent = c; document.body.append(el); }, code);
    const busy = 'const t = performance.now(); (window.__busy ??= []).push(t); while (performance.now() - t < 700);';
    await run(`(async () => { await (await fetch('data:,x')).text(); ${busy} })()`);
    await page.waitForTimeout(1500);
    await run(`(async () => { await new Blob(['x']).arrayBuffer(); ${busy} })()`);
    await page.waitForTimeout(1500);
    const x = await page.evaluate(() => {
      const now = performance.now();
      const ticks = window.__startupTicks;
      const spacing = ticks.slice(1).map((t, i) => t - ticks[i]).sort((p, q) => p - q);
      return {
        raw: window.__startupRaw(now, now), stepRaw: now, now, t0: window.__startupT0,
        heldSeen: { longOk: !!window.__startupLongOk, tickMedian: spacing.length ? spacing[spacing.length >> 1] : null },
        busy: window.__busy ?? [], loaf: window.__startupLoaf,
      };
    });
    const read = openingGaps(x, Infinity);
    const each = ['after a fetch', 'after a Blob'].map((what, i) => {
      const t = x.busy[i];
      if (t == null) return { what, ok: false, say: `${what}: never ran` };
      /*
        The page's own either way it can be seen: a silent stretch kept as
        its code after an await, or a long task. Chromium on CI's Mac
        reported this page's code after each await as a long task, so its
        first run read neither (run 37170402977, "the page's own 0.00 s,
        held 0.00 s, named as a script 0.70 s"); the cloud's reported none.
      */
      const over = (a, b) => Math.max(0, Math.min(t + 700, b) - Math.max(t, a));
      const longMs = x.raw.long.reduce((n, [a, d]) => n + over(a, a + d), 0);
      const ownMs = read.settledStarts.filter(([a]) => Math.abs(a * 1000 - t) < 100).reduce((n, [, len]) => n + len * 1000, 0) + longMs;
      const heldMs = read.held.reduce((n, [a, len]) => n + Math.max(0, Math.min(t + 700, (a + len) * 1000) - Math.max(t, a * 1000)), 0);
      const named = Math.max(0, ...x.loaf.flatMap((f) => f[5] ?? []).filter(([a]) => Math.abs(a - t) < 50).map(([, d]) => d));
      return { what, ok: ownMs >= 650 && heldMs < 50 && named >= 650,
        say: `${what}: the page's own ${(ownMs / 1000).toFixed(2)} s (${(longMs / 1000).toFixed(2)} s of it a long task), held ${(heldMs / 1000).toFixed(2)} s, named as a script ${(named / 1000).toFixed(2)} s` };
    });
    const seen = `long tasks ${x.heldSeen.longOk ? 'seen' : 'not seen'}, the timer every ${x.heldSeen.tickMedian == null ? 'never' : `${x.heldSeen.tickMedian.toFixed(0)} ms`}`;
    return { ok: each.every((e) => e.ok), say: `${each.map((e) => e.say).join('; ')} (${seen})` };
  } catch (e) {
    return { ok: false, say: `the control did not run: ${String(e?.message ?? e).split('\n')[0]}` };
  } finally {
    await browser.close().catch(() => {});
  }
}

try {
  // ── The control: the old way, on a cold cache ─────────────────────
  const c = await open('&prepare=0', []);
  const { frames: cFrames, held: cHeld } = frameStops(c);
  c.frames = cFrames;
  console.log(`  control, ?prepare=0 (shader cache ${c.cache}): ${c.direct.length} pipelines built on a frame;`
    + ` longest wait for a frame ${say(c.frames)}, for a heartbeat ${say(c.beats)}, for a step ${say(c.steps)};`
    + ` first step at ${c.firstStep == null ? 'never' : `${(c.firstStep / 1000).toFixed(2)} s`}`);
  console.log(`     ${milestones(c)}`);
  if (process.env.STARTUP_TIMELINE) timeline(c);

  // ── The show as it ships ──────────────────────────────────────────
  const o = await open('', presetIds);
  const { held, frames } = frameStops(o);
  o.frames = frames;
  console.log(`  as shipped (shader cache ${o.cache})`);
  console.log(`     ${milestones(o)}`);
  /*
    How much of the opening the intro covered, printed and not judged
    (`npm run intro` judges it): it is up from the page's first frame and
    leaves on the plate's first step, so on a cold Mac this is the share of
    the wait nobody looks at a black plate. The first step here is the
    quarter-second row it was seen in; the intro's own leaving is exact.
  */
  const intro = o.intro ?? {};
  console.log(`     the intro: into the plate at ${intro.adopted == null ? 'never' : `${(intro.adopted / 1000).toFixed(2)} s`}, leaving at ${intro.out == null ? 'never' : `${(intro.out / 1000).toFixed(2)} s for "${intro.reason}"`}, the plate's first step seen by ${o.firstStep == null ? 'never' : `${(o.firstStep / 1000).toFixed(2)} s`}; held still ${(intro.still ?? []).map(([a, e]) => `${(a / 1000).toFixed(2)}–${e == null ? 'never let go' : `${(e / 1000).toFixed(2)} s`}`).join(', ') || 'never'} (from the first paint until the opening's render pipelines were built)`);
  const p = o.prepared;
  const b = o.behind;
  check('the show opens and the plate is stepping',
    o.running && o.firstStep != null && o.firstStep / 1000 <= FIRST_STEP_MAX_S,
    `${o.firstStep == null ? 'no step at all' : `first step at ${(o.firstStep / 1000).toFixed(2)} s (no later than ${FIRST_STEP_MAX_S} s)`}`
    + `${p ? `, after ${(p.ms / 1000).toFixed(2)} s building ${p.asked} pipelines ahead` : ''}${o.running ? '' : '; never two steady seconds'}`);
  const secs = (t) => (t == null ? 'never' : `${(t / 1000).toFixed(2)} s`);
  // What the old way built on its frames, on the same look: each should have
  // been waited for. Names, not a count, so a list that grew elsewhere and
  // lost one of these still fails.
  const oldWay = [...new Set((c.ledger?.onFrame ?? []).map((e) => e.name))];
  const cWait = waitOf(c, oldWay);
  const oWait = waitOf(o, oldWay);
  // A control that lost its device compiled on two, and its wait is no bar.
  const cDevices = c.ledger?.devices ?? 0;
  // The same pipelines on both sides, so the same count: a show that built
  // fewer of them ahead is check 2's to catch, and reads faster here.
  // And only against one device's compile, as the line above holds it.
  const rate = cWait?.compile > 0 && cDevices === 1 && oWait && oldWay.length ? oWait.compile / cWait.compile : null;
  console.log(`     1b, the wait to moving for good split up: ${sayWait(oWait)}; for ?prepare=0 ${sayWait(cWait)}`);
  check(`and it is moving for good no later than the old way was, Chromium's and the GPU's compile apart (with ${STEADY_SLACK_S} s to spare)`,
    // A control that never ran steadily is no bar at all: its window now
    // runs to when it was seen running (see the watch), and one that never
    // was would otherwise hand the show a late one. One that never stopped
    // for its compile was not cold, and prices nothing.
    o.steadyFrom != null && c.running && c.steadyFrom != null && o.steadyFrom / 1000 <= FIRST_STEP_MAX_S
      && !!oWait && !!cWait && cDevices === 1 && cWait.compile > 0 && oWait.own <= cWait.own + STEADY_SLACK_S,
    `the show's own ${oWait ? `${oWait.own.toFixed(2)} s` : 'unread'} against ${cWait ? `${cWait.own.toFixed(2)} s` : 'unread'} for ?prepare=0`
      + `${cWait && !(cWait.compile > 0) ? ' (it never stopped for what it built on its frames, so its cache was not cold)' : ''}`
      + `${cDevices === 1 ? '' : ` (the control had ${cDevices} devices, so its compile is no bar)`}`
      + `; moving for good from ${secs(o.steadyFrom)}, against ${secs(c.steadyFrom)}${c.running ? '' : ' (never running steadily)'}, read to ${secs(c.watch)}`);
  check(`and it built the old way's pipelines no slower than the old way compiled them on its frames (at most ${COMPILE_RATIO}×)`,
    rate != null && rate <= COMPILE_RATIO,
    rate == null ? `nothing to compare${cDevices === 1 ? '' : ` (the control had ${cDevices} devices)`}` : `${oWait.compile.toFixed(2)} s building ${oWait.shared} of the ${oldWay.length} ahead, against ${cWait.compile.toFixed(2)} s stopped for them: ${rate.toFixed(2)}×`);
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
    `longest wait for a frame ${say(o.frames)}${o.frames.whole - o.frames.gap > 0.005 ? ` (of a ${o.frames.whole.toFixed(2)} s gap, the rest the page's thread held, 4b)` : ''}, for a heartbeat ${say(o.beats)}, for a step ${say(o.steps)}, watched to ${secs(o.watch)}`);
  const heldAt = (h) => (h.stretches.length ? h.stretches.map(([a, n]) => `${n.toFixed(2)} s from ${a.toFixed(2)} s`).join(', ') : 'none');
  const seenOk = held.seen.longOk && held.seen.tickMedian != null && held.seen.tickMedian <= TICK_OK_MS;
  const loafs = o.loaf.filter(([, d]) => d >= 0.2);
  /*
    The silent stretches set aside as the page's own because they began where
    a promise it awaits had just settled, the show's and the control's. On
    36360768615 the show's hold (1.75 s from 1.03 s) was taken out and the
    control's (2.27 s from 1.11 s) was not, with neither printed here; so
    whether a fetch settling just before Chromium's hold can hide it is now
    read on every run.
  */
  const setAside = (x) => (x.settledStarts?.length ? x.settledStarts.map(([a, n, what]) => `${n.toFixed(2)} s from ${a.toFixed(2)} s (after ${what})`).join(', ') : 'none');
  const fmtLoaf = ([a, d, rs, bl, n]) => `${d.toFixed(2)} s from ${a.toFixed(2)} s (rendering from ${rs == null ? '?' : `${rs.toFixed(2)} s`}, blocking ${bl == null ? '?' : `${bl.toFixed(2)} s`}, ${n} script${n === 1 ? '' : 's'})`;
  /*
    The rule that says which silent stretches were the page's own code, on
    the cases it was made from, before its reading of this run is believed:
    a change to it that calls a second of the page's code after an await
    held, or Chromium's hold the page's, is red here whatever the run did.
  */
  const rule = selfCheck();
  const ctl = await instrumentsControl();
  check(`and what tells Chromium's hold from the page's own code after an await tells each of its ${rule.cases} cases as seen, and 0.7 s of a page's own code after an await as its own in this Chromium`,
    rule.cases >= 13 && rule.wrong.length === 0 && ctl.ok,
    `${rule.wrong.length ? `told wrong: ${rule.wrong.join('; ')}` : `${rule.cases} of ${rule.cases} (scripts/pagehold.mjs)`}; ${ctl.say}`);
  const heldOk = seenOk && held.total <= COLD_CAP_S;
  check(`and the page's thread was held from outside it, in the first ${HELD_BY_S} s and before the first step, no more than ${COLD_CAP_S} s all told (Chromium starting its GPU)`,
    heldOk,
    `${held.total.toFixed(2)} s (${heldAt(held)}), against ${cHeld.total.toFixed(2)} s (${heldAt(cHeld)}) for ?prepare=0`
      + `; long tasks ${held.seen.longOk ? 'seen' : 'not observable, so nothing is taken out'}`
      + `; not taken out, as the page's own code after an await: ${setAside(o)}, against ${setAside(c)} for ?prepare=0`
      + `; long animation frames of 0.2 s or more in the first ${HELD_BY_S + 3} s (printed, not judged): ${loafs.length ? loafs.map(fmtLoaf).join(', ') : 'none'}`
      + `, the page's timer every ${held.seen.tickMedian == null ? 'never' : `${held.seen.tickMedian.toFixed(0)} ms`} (no more than ${TICK_OK_MS})`);
  console.log(`     ${underWay(o, o.frames)}`);
  console.log(`     ${splitAhead(o)}`);
  for (const line of gpuTime(o)) console.log(`     ${line}`);
  /*
    The quarter seconds round the first step, on every run, with what the
    page had made, written and submitted by each: whether the page was still
    handing the GPU work through the stop after the first step, or had
    handed it all over before it and was waiting.
  */
  if (o.firstStep != null) {
    console.log('       seconds · animation frames · heartbeats · steps · grid · textures made · writes · submits (round the first step)');
    for (const r of o.rows.filter((r) => r[0] >= o.firstStep / 1000 - 1 && r[0] <= o.firstStep / 1000 + 3)) console.log(`       ${r.join('  ')}`);
  }
  if (worst > MAX_GAP_S || !heldOk || process.env.STARTUP_TIMELINE) timeline(o, held);

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
  /*
    The same stop on a warm cache: each look's longest frame gap from a
    second before its first step. Printed, not judged. The cold opening's
    stop after its first step (1.03 to 2.43 s over thirty-seven runs) is
    either the first frames' own work, which a warm cache does not take
    away, or a first use of something that a warm cache has already paid.
  */
  const stops = measured.map((e) => e.stop).filter((x) => x != null).sort((a, b) => a - b);
  if (stops.length) console.log(`  each look opened on a warm cache: longest frame gap from a second before its first step, median ${stops[stops.length >> 1].toFixed(2)} s, longest ${stops[stops.length - 1].toFixed(2)} s (${measured.filter((e) => e.stop === stops[stops.length - 1]).map((e) => e.id).join(', ')}), over ${stops.length}`);
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
