#!/usr/bin/env node
/**
 * Does the show keep hearing while its window is hidden?
 *
 *   npm run ears                    # builds, then about half a minute
 *
 * Reported as PLAN.md §14a, found by reading the code: the analyser was read on
 * the show window's animation frames and nowhere else, and a browser gives a
 * hidden window none. At a gig the show window spends the set behind the
 * projector's, so the wall kept moving on the last reading it had and stopped
 * hearing the music. The picture never stopped (the projector window asks for
 * the frames), which is why nobody saw it: a plate that is deaf still moves.
 *
 * What is measured:
 *
 *   the arithmetic   lib/earClock.ts in node: a visible window reads once per
 *                    frame and never on the wall's asks, however they
 *                    interleave; a covered one reads once per ask; with
 *                    neither, the worker's tick reads; uncovered, the frames
 *                    take back over at once
 *   the wall         the real app with the simulated band and a second window
 *                    asking for frames the way the projector window does
 *                    (`CastDisplay`, seven lines copied): visible, the show
 *                    still reads on its own frames only; covered (its
 *                    animation frames withheld), the level the *plate* reads
 *                    keeps changing, one reading per frame the wall asks for
 *   no wall          the asking window closed too: the worker's tick keeps
 *                    the ear going
 *   the control      the tick stopped too: the level stands still and the
 *                    watchdog calls the ear deaf
 *   back again       frames returned: they read and the others stop
 *   deaf             the context suspended by hand: the desk's sound line
 *                    says "not hearing" (and the next touch brings it back)
 *
 * Why the frames are withheld by hand rather than the window hidden: a
 * headless browser never hides a window. Minimised, covered or in a
 * background tab it reports "visible" and keeps its animation frames (tried,
 * 2026-09-27), so the only way to put the show where a covered window is, is
 * to stop its `requestAnimationFrame` from calling back, which is exactly and
 * only what a browser does to a covered window. Its timers are left running,
 * which is kinder than a real hidden window (throttled to about one a second),
 * so this cannot tell a worker's tick from a page timer; the header of
 * lib/earClock.ts says why the tick is a worker's.
 *
 * The control is on the same page: with the frames withheld and nothing
 * asking and no tick (the ear the way it was before, which this page can put
 * back by stopping the worker), the level stands still on its last reading.
 * If it does not, the withholding is not doing what it claims and every "keeps
 * hearing" line means nothing. A build whose ear reads on frames alone (the
 * old one) was run against this check and went red on all three of them.
 *
 * No GPU needed: the wall's ask and the loop's frame count run whether or
 * not a renderer came up, and the plate's copy of the sound is set either
 * way. So it runs in a cloud session as it is, and on the Mac shard.
 */

import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { EarClock } from '../src/lib/earClock.ts';

const PORT = Number(process.env.EARS_PORT ?? 4331);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The arithmetic ─────────────────────────────────────────────────────
//
// Two clocks at 60 Hz on different phases (the laptop's display and the
// projector's), then the laptop's frames stopping, then nothing but ticks,
// then the frames back. Every offer is in time order, as a browser's tasks are.
{
  const ear = new EarClock();
  const events = [];
  const add = (driver, from, to, period, phase) => {
    for (let t = from + phase; t < to; t += period) events.push({ driver, t });
  };
  add('frame', 0, 1000, 1000 / 60, 0);        // visible: the show's own frames
  add('ask', 0, 2000, 1000 / 60, 7.3);        // the wall asking, all along
  add('tick', 0, 4000, 16, 3.1);              // the worker, all along
  add('frame', 3000, 4000, 1000 / 60, 0.5);   // uncovered again, the wall gone
  events.sort((a, b) => a.t - b.t);
  const taken = { frame: [], ask: [], tick: [] };
  // Covered from 1000 to 3000: the page says hidden, as Chrome's does.
  const hidden = (t) => t >= 1000 && t < 3000;
  for (const e of events) if (ear.offer(e.driver, e.t, hidden(e.t))) taken[e.driver].push(e.t);
  const within = (arr, a, b) => arr.filter(t => t >= a && t < b).length;
  const frames1 = events.filter(e => e.driver === 'frame' && e.t < 1000).length;
  check('visible, every frame reads and nothing else does',
    within(taken.frame, 0, 1000) === frames1 && within(taken.ask, 0, 1000) === 0 && within(taken.tick, 0, 1000) === 0,
    `${within(taken.frame, 0, 1000)} of ${frames1} frames, ${within(taken.ask, 0, 1000)} asks, ${within(taken.tick, 0, 1000)} ticks`);
  /*
    Fixed windows, not ones measured from the code's own EAR_STALL_MS: the
    wall has to take over within 70 ms of the frames stopping (four frames at
    60 Hz) whatever the stall is set to, so a stall raised to 100 goes red here
    rather than moving the window with it.
  */
  const asks2 = events.filter(e => e.driver === 'ask' && e.t >= 1070 && e.t < 2000).length;
  const took2 = within(taken.ask, 1070, 2000);
  check('covered, the wall\'s asks read once each and the tick stays out',
    took2 === asks2 && within(taken.tick, 1000, 2000) === 0,
    `${took2} of ${asks2} asks from 70 ms on, ${within(taken.tick, 1000, 2000)} ticks`);
  const firstAsk = taken.ask.find(t => t >= 1000);
  check('and the first of them within 70 ms of the last frame',
    firstAsk !== undefined && firstAsk - 1000 <= 70,
    `${firstAsk === undefined ? 'none' : (firstAsk - 1000).toFixed(1)} ms after the frames stopped`);
  /*
    The wall closes at 2000. The tick gives the wall's asks a quarter second
    (the wall's frames are as ragged as any window's; see the ragged wall
    below), so it has to take over within a third of a second, and from then
    on read every time it offers.
  */
  const lastAsk2 = Math.max(...taken.ask.filter(t => t < 2000));
  const firstTick3 = taken.tick.find(t => t >= 2000);
  check('covered with no wall, the worker\'s tick takes over within a third of a second',
    firstTick3 !== undefined && firstTick3 - lastAsk2 <= 330,
    `${firstTick3 === undefined ? 'none' : (firstTick3 - lastAsk2).toFixed(0)} ms after the wall's last ask`);
  const offered3 = events.filter(e => e.driver === 'tick' && e.t >= 2330 && e.t < 3000).length;
  const ticks3 = within(taken.tick, 2330, 3000);
  check('and reads about sixty a second, every tick it offers',
    ticks3 === offered3 && ticks3 >= 40, `${ticks3} of ${offered3} ticks in 670 ms`);
  const frames4 = events.filter(e => e.driver === 'frame' && e.t >= 3000).length;
  check('uncovered, the frames read again, all of them, and the tick stops',
    within(taken.frame, 3000, 4000) === frames4 && within(taken.tick, 3000 + 1, 4000) === 0,
    `${within(taken.frame, 3000, 4000)} of ${frames4} frames, ${within(taken.tick, 3000 + 1, 4000)} ticks`);
}
/*
  Two in one instant: the moment a covered window is uncovered, its first frame
  can land a millisecond after the wall's ask has read. Both would be one
  reading counted twice, and the per-reading smoothing would run twice as fast
  for that frame. The phases above never bring two drivers that close (with the
  gap set to 0 they all still pass), so this puts them there on purpose.
*/
{
  const ear = new EarClock();
  for (let t = 0; t < 500; t += 1000 / 60) ear.offer('ask', t, true);
  const lastAsk = ear.lastRead;
  const tookFrame = ear.offer('frame', lastAsk + 1.5, false);
  const nextFrame = ear.offer('frame', lastAsk + 1.5 + 1000 / 60, false);
  check('an ask and a frame 1.5 ms apart are one reading, and the next frame reads',
    !tookFrame && nextFrame, `the frame 1.5 ms after the ask ${tookFrame ? 'read too' : 'did not read'}; the one after ${nextFrame ? 'did' : 'did not'}`);
}

/*
  Covered, with the wall's frames ragged. On the Mac runner the wall drew 44
  a second with the show covered, and the tick read 5 times in two seconds in
  the gaps between them, each one a second reading for a frame the wall drew.
  Gaps from 20 to 200 ms, as a busy machine's frames come, with the tick
  running all along: every ask reads, no tick does.
*/
{
  const ear = new EarClock();
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const events = [];
  for (let t = 0; t < 2000; t += 20 + rand() * 180) events.push({ driver: 'ask', t });
  for (let t = 3.1; t < 2000; t += 16) events.push({ driver: 'tick', t });
  events.sort((a, b) => a.t - b.t);
  const took = { ask: 0, tick: 0 };
  let offered = 0;
  for (const e of events) {
    if (e.driver === 'ask') offered++;
    if (ear.offer(e.driver, e.t, true)) took[e.driver]++;
  }
  check('covered with the wall\'s frames ragged, 20 to 200 ms apart, every ask reads and no tick',
    took.ask === offered && took.tick === 0, `${took.ask} of ${offered} asks, ${took.tick} ticks`);
}

/*
  A visible window hears exactly as it did, whatever its frames do. Slow: a
  phone or a tired laptop at 15 fps, 67 ms apart. Ragged: the Mac runner's
  app drew 28 a second with gaps well past 50 ms, and a stall measured from
  the frames let the tick read between them (11 extra readings in two
  seconds; this check's first run on the Mac). Fast: 240 Hz, 4.2 ms apart
  with half a millisecond of jitter, where a gap on every reading dropped
  three frames in ten. Each is a change to the per-reading smoothing, so to
  the look, on the machines least like the one it was tuned on.
*/
{
  const run = (gapMs) => {
    const ear = new EarClock();
    const events = [];
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < 2000; t += gapMs(rand)) events.push({ driver: 'frame', t });
    for (let t = 3.1; t < 2000; t += 16) events.push({ driver: 'tick', t });
    for (let t = 7.3; t < 2000; t += 1000 / 60) events.push({ driver: 'ask', t });
    events.sort((a, b) => a.t - b.t);
    const took = { frame: 0, tick: 0, ask: 0 };
    for (const e of events) if (ear.offer(e.driver, e.t, false)) took[e.driver]++;
    return { offered: events.filter(e => e.driver === 'frame').length, ...took };
  };
  const cases = [
    ['at 15 fps', () => 1000 / 15],
    ['ragged, 20 to 200 ms apart', (r) => 20 + 180 * r()],
    ['at 240 Hz with jitter', (r) => 1000 / 240 + (r() - 0.5)],
  ];
  for (const [name, gap] of cases) {
    const r = run(gap);
    check(`visible ${name}, with the wall asking and the tick running, every frame reads and nothing else`,
      r.frame === r.offered && r.tick === 0 && r.ask === 0, `${r.frame} of ${r.offered} frames, ${r.ask} asks, ${r.tick} ticks`);
  }
  /*
    And a visible page whose frames have simply stopped, as a window manager
    can do to a covered window without the page being told it is hidden: it
    still hears, a quarter of a second late.
  */
  const ear = new EarClock();
  for (let t = 0; t < 500; t += 1000 / 60) ear.offer('frame', t, false);
  let firstTick = null;
  for (let t = 503; t < 1500; t += 16) if (ear.offer('tick', t, false) && firstTick === null) firstTick = t;
  check('visible but its frames stopped, the tick reads within a third of a second',
    firstTick !== null && firstTick - 500 <= 330, `${firstTick === null ? 'never' : `${(firstTick - 500).toFixed(0)} ms`} after the last frame`);
}
/*
  A long task on the page: the worker's timer kept running, so its ticks were
  queued and land all at once when the page is free. One reading of that
  moment, not one per queued tick; then one per tick again.
*/
{
  const ear = new EarClock();
  for (let t = 0; t < 500; t += 1000 / 60) ear.offer('frame', t, true);
  let burst = 0;
  for (let i = 0; i < 40; i++) if (ear.offer('tick', 1100 + i * 0.05, true)) burst++;
  let after = 0;
  for (let t = 1116; t < 1500; t += 16) if (ear.offer('tick', t, true)) after++;
  check('forty ticks queued behind a long task read once, then every tick reads',
    burst === 1 && after === 24, `${burst} of the queued 40 read; ${after} of the 24 after`);
}
/*
  The other side of that spacing: a busy page gets the worker's messages a
  few milliseconds late each, so two ticks can land 10 ms apart. Every one of
  them has to read (the tick is the only ear there is behind a wall-less
  cover); at a spacing of 12 ms, 118 of 125 did.
*/
{
  const ear = new EarClock();
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let offered = 0, took = 0;
  for (let t = 0; t < 2000; t += 16) {
    offered++;
    if (ear.offer('tick', t + rand() * 6, true)) took++;
  }
  check('covered with no wall, ticks each arriving 0 to 6 ms late all read',
    took === offered, `${took} of ${offered}`);
}
/*
  And the quarter second itself, from below: a visible page whose frames come
  240 ms apart is slow, not stalled, and hears on its frames alone. A stall
  lowered into the 200s reads ticks here, where the ragged case above (gaps to
  200 ms) would not notice.
*/
{
  const ear = new EarClock();
  let ticks = 0;
  for (let t = 0; t < 3000; t += 1) {
    if (t % 240 === 0) ear.offer('frame', t, false);
    if (t % 16 === 3 && ear.offer('tick', t, false)) ticks++;
  }
  check('visible with frames 240 ms apart, the tick stays out', ticks === 0, `${ticks} ticks`);
}

// ── The app ────────────────────────────────────────────────────────────
const notes = [];
function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(proc); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
  });
}
const server = await serve();
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stopServer);

const browser = await launchChromium(chromium);
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(() => {
    // The band, chosen before the page loads (as `npm run squeeze` does).
    try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ }
    /*
      A covered window, as far as this page can tell: while `__covered` is
      set, animation frames are held and not called back. Held, not dropped,
      and cancellable by their ids, because that is what a browser does: a
      covered window's pending frame fires when it is uncovered, once, unless
      something cancelled it first (the show's loop cancels its pending frame
      each time the wall asks).
    */
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const held = new Map();
    let nextId = 1e9;
    window.__covered = false;
    // And the page says what a covered one says: hidden. Chrome marks a window
    // another covers as hidden; the ear listens to that (lib/earClock.ts).
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__covered });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__covered ? 'hidden' : 'visible') });
    /*
      When the page's frames actually came, so the check can tell a tick
      that read between ordinary frames (wrong: a second clock) from one that
      read in a stall past a quarter second (what the tick is for). Every
      callback in one frame lands within a millisecond, so one stamp a frame.
    */
    window.__rafTimes = [];
    const stamp = (cb) => (ts) => {
      const now = performance.now();
      const a = window.__rafTimes;
      if (!a.length || now - a[a.length - 1] > 1) {
        a.push(now);
        if (a.length > 4000) a.splice(0, 2000);
      }
      cb(ts);
    };
    window.requestAnimationFrame = (cb) => {
      if (!window.__covered) return raf(stamp(cb));
      const id = nextId++;
      held.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => { if (!held.delete(id)) caf(id); };
    window.__uncover = () => {
      window.__covered = false;
      const cbs = [...held.values()];
      held.clear();
      for (const cb of cbs) raf(stamp(cb));
    };
  });
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && !!window.chromaglassCastState().ear, null, { timeout: 60_000 });

  const ear = () => page.evaluate(() => window.chromaglassCastState().ear);
  /*
    Distinct levels over a window, sampled every 50 ms, from the plate's own
    copy (`heard`: what its next frame reads, `audioDataRef`), and from nothing
    else. A band that is playing moves its level every reading; one heard by
    nobody gives one value however long it is watched. No reading at all is
    not "one value": it throws, so a dead ear cannot pass the control.
  */
  const levels = async (ms) => {
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await page.evaluate(() => window.chromaglassDebug?.().heard?.volume ?? null);
      if (v === null) throw new Error('the plate has no sound reading at all');
      seen.add(v.toFixed(4));
      await page.waitForTimeout(50);
    }
    return { size: seen.size, values: [...seen] };
  };
  const delta = (a, b) => ({ frame: b.reads.frame - a.reads.frame, ask: b.reads.ask - a.reads.ask, tick: b.reads.tick - a.reads.tick });
  const frames = () => page.evaluate(() => window.chromaglassDebug().frames);
  /*
    Where each reading by the wall or the tick landed, against the page's own
    frames. A visible page's tick and wall are meant to read only once its
    frames have stalled for a quarter second (lib/earClock.ts: a visible page
    whose frames stop still hears, a quarter second late), and such stalls
    happen on a visible page on the Mac runner, whose show is still building
    pipelines behind it for its first half minute (`npm run startup`: frame
    gaps to 0.36 s there). The third run of this check read 3 ticks against
    46 frames in one, and a check that wanted none went red on the feature
    working.

    So every such reading is held to the frame before it: more than 250 ms
    after the page's last frame, or it is a second clock beside the frames
    (the first run's 11 ticks between frames 36 ms apart). Each one on its
    own, not a count against the stalls in the window: a pooled allowance let
    a long task's stall, where the queued ticks read once, pay for ticks read
    between ordinary frames elsewhere, and a covered gap straddling the
    window's start paid for hundreds (the check-skeptic's controls, both green
    on broken builds). The 250 is written here, not imported, so a stall
    lowered in the code shows up as readings this refuses (a node case above
    holds it at 240 ms gaps).

    Two cross-checks keep the instrument honest: the clock's record of these
    readings has to agree with its counts, and the stamps have to keep up
    with the ear's own frames, or a stamp gone quiet would make every reading
    look like one in a stall.
  */
  const snap = () => page.evaluate(() => ({
    ear: window.chromaglassCastState().ear, frames: window.chromaglassDebug().frames, now: performance.now(),
  }));
  const placed = (t0, t1, d) => page.evaluate(([t0, t1, d]) => {
    const stamps = window.__rafTimes;
    const recent = window.chromaglassCastState().ear.recent.filter(r => r.at > t0 && r.at <= t1);
    let misplaced = 0, closest = Infinity;
    for (const r of recent) {
      let last = -Infinity;
      for (const t of stamps) { if (t < r.at) last = t; else break; }
      const gap = r.at - last;
      closest = Math.min(closest, gap);
      if (gap <= 250) misplaced++;
    }
    const counted = { ask: recent.filter(r => r.driver === 'ask').length, tick: recent.filter(r => r.driver === 'tick').length };
    const stamped = stamps.filter(t => t > t0 && t <= t1).length;
    return {
      misplaced, closest, n: recent.length, stamped,
      honest: counted.ask === d.ask && counted.tick === d.tick && stamped >= d.frame - 1,
    };
  }, [t0, t1, d]);
  const watch = async (ms) => {
    const a = await snap();
    const lv = await levels(ms);
    const b = await snap();
    const d = delta(a.ear, b.ear);
    return { lv, d, drawn: b.frames - a.frames, ear: b.ear, at: await placed(a.now, b.now, d) };
  };
  const inStalls = (v) => v.at.honest && v.at.misplaced === 0;
  const stallNote = (v) => `; ${v.at.n ? `${v.at.misplaced} of ${v.at.n} read within 250 ms of a frame (closest ${v.at.closest.toFixed(0)} ms)` : 'none read off a frame'}` +
    `${v.at.honest ? '' : `; the record does not agree (${v.at.stamped} frames stamped)`}`;

  /*
    How many readings make "hearing": more than ten a second. Not sixty: on the
    Mac runner the app is busy, and every reading re-renders the whole of App
    (PLAN.md §14f), so its own frames came 28 a second and the tick's readings
    15 a second on the first run there, against 60 in a cloud session with no
    plate. The claim is that the readings keep coming and the level keeps
    moving, not how fast this machine can take them; the level's own count
    (ten distinct in two seconds) is what says the band is being heard.
  */
  // Let the band start and the room calibrate.
  await page.waitForTimeout(4000);
  const v1 = await watch(2000);
  check('visible, the band is heard on the frames alone (the tick only where its frames stalled past 250 ms)',
    v1.lv.size >= 10 && v1.d.frame > 20 && v1.d.ask === 0 && inStalls(v1),
    `${v1.lv.size} distinct levels in 2 s; readings ${v1.d.frame} frame, ${v1.d.ask} ask, ${v1.d.tick} tick; context ${v1.ear.state}${stallNote(v1)}`);

  /*
    The wall: a second window asking for frames on its own animation frames,
    as the projector window does (CastDisplay's `ask`). It asks whether the
    show window is covered or not, so the first thing it has to show is that
    a *visible* show still reads on its own frames only: the doubled reading
    lib/earClock.ts is written to prevent.
  */
  const [wall] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate(() => { window.open('about:blank', 'wall', 'popup,width=480,height=270'); }),
  ]);
  await wall.evaluate(() => {
    const ask = () => {
      try { const o = window.opener; if (o && !o.closed) o.__chromaglassFrame?.(); } catch { /* gone */ }
      requestAnimationFrame(ask);
    };
    requestAnimationFrame(ask);
  });
  await page.waitForTimeout(300);
  const v2 = await watch(2000);
  check('visible with the wall asking too, still only the frames read (the wall only where the frames stalled past 250 ms)',
    v2.d.frame > 20 && inStalls(v2),
    `readings ${v2.d.frame} frame, ${v2.d.ask} ask, ${v2.d.tick} tick${stallNote(v2)}`);

  // Covered, the wall still asking.
  await page.evaluate(() => { window.__covered = true; });
  await page.waitForTimeout(300);
  const v3 = await watch(2000);
  check('covered, with the wall asking, the plate keeps hearing the band',
    v3.lv.size >= 10, `${v3.lv.size} distinct levels in 2 s`);
  /*
    One reading per ask the show answered. `frames` counts passes through the
    loop, and every ask that reads calls `render()` once, so the two have to
    match both ways: more readings than asks answered is a second clock, fewer
    is an ask the ear missed.
  */
  check('and it hears on the wall\'s asks, one a frame, not on its own frames or the tick',
    v3.d.ask > 20 && v3.d.frame === 0 && v3.d.tick === 0 && Math.abs(v3.d.ask - v3.drawn) <= 2,
    `readings ${v3.d.ask} ask, ${v3.d.frame} frame, ${v3.d.tick} tick, over ${v3.drawn} frames asked for`);
  await wall.close();

  // No wall: the worker's tick.
  await page.waitForTimeout(300);
  const v4 = await watch(2000);
  check('covered with no wall, the worker\'s tick keeps the ear going',
    v4.lv.size >= 10 && v4.d.tick > 20 && v4.d.ask === 0 && v4.d.frame === 0,
    `${v4.lv.size} distinct levels in 2 s; readings ${v4.d.tick} tick, ${v4.d.ask} ask, ${v4.d.frame} frame`);

  /*
    The control: covered, nothing asking, the tick stopped. The ear as it was
    before this, on this same page. The level has to stand still on a real
    reading (the last one heard), which is what says the withholding works and
    that every "keeps hearing" above was the fix and not the harness; and the
    watchdog has to call it deaf, which is the silence a performer cannot see.
  */
  const lastHeard = await page.evaluate(() => window.chromaglassDebug().heard.volume.toFixed(4));
  const stopped = await page.evaluate(() => typeof window.__earTick === 'function' ? (window.__earTick(false), true) : false);
  await page.waitForTimeout(100);
  const held = await page.evaluate(() => window.chromaglassDebug().heard.volume.toFixed(4));
  const control = await levels(1500);
  const controlEar = await ear();
  check('control: covered with nothing reading, the level stands still on the last reading',
    stopped && control.size === 1 && control.values[0] === held,
    `${control.size} distinct level${control.size === 1 ? '' : 's'} in 1.5 s (${control.values.join(', ')}; held ${held}, last before ${lastHeard})${stopped ? '' : ' (no way to stop the tick)'}`);
  check('and the watchdog calls that ear deaf', controlEar.deaf === true,
    `deaf ${controlEar.deaf}, context ${controlEar.state}`);
  await page.evaluate(() => window.__earTick(true));
  await page.waitForTimeout(400);
  const revived = await ear();
  check('and not once it hears again', revived.deaf === false, `deaf ${revived.deaf}`);

  // Uncovered.
  await page.evaluate(() => window.__uncover());
  await page.waitForTimeout(300);
  const v5 = await watch(2000);
  check('uncovered, the frames read again and the tick stands back',
    v5.d.frame > 20 && v5.d.ask === 0 && inStalls(v5), `readings ${v5.d.frame} frame, ${v5.d.ask} ask, ${v5.d.tick} tick${stallNote(v5)}`);

  // Deaf: the context suspended.
  const line = () => page.evaluate(() => document.body.innerText.includes('not hearing'));
  const before = await line();
  /*
    Suspended the way a browser leaves it: the show asks for it back at once
    (on the context's statechange), so a plain suspend() would be undone
    before anything could see it. What a real one does is refuse, as Chrome
    does before the page has been touched and iOS does through a phone call,
    so `resume` is made to refuse until the touch below.
  */
  await page.evaluate(() => {
    const ctx = window.__earContext;
    ctx.resume = () => Promise.resolve();
    return ctx.suspend();
  });
  await page.waitForTimeout(800);
  const deaf = await page.evaluate(() => window.chromaglassCastState().ear);
  const says = await line();
  check('suspended, the ear is called deaf and the desk says "not hearing"',
    !before && deaf.deaf && says, `before ${before ? 'said it already' : 'quiet'}; state ${deaf.state}, deaf ${deaf.deaf}, the desk ${says ? 'says it' : 'is silent'}`);
  await page.evaluate(() => { delete window.__earContext.resume; });
  await page.mouse.click(5, 690);
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => window.chromaglassCastState().ear);
  check('and a touch brings it back', back.state === 'running' && !back.deaf, `state ${back.state}, deaf ${back.deaf}`);
} catch (err) {
  check('the run completed', false, String(err?.message ?? err));
  failed = 1;
} finally {
  await browser.close();
  stopServer();
}

const bad = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad || failed ? 1 : 0);
