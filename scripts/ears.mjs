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
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { EarClock } from '../src/lib/earClock.ts';

const PORT = port(4331, 'EARS_PORT');
/*
  What a window waits for before it is judged (`watch`): 30 of whatever the
  runner offers, half again the largest bar below (more than 20 readings),
  so a line is judged on enough to clear its bar with room, and at most
  15 s of waiting for it. `--slow=N` runs the page and the wall at 1/N of
  the CPU, to put this machine where a starved runner is.
*/
const ENOUGH = 30;
const WINDOW_CAP_MS = 15_000;
const SLOW = Number(process.argv.find(a => a.startsWith('--slow='))?.slice(7) ?? 0);
/*
  `--busy=MS` keeps the page's main thread busy for MS of every MS + 10:
  the other way a runner starves, a page free a few times a second while the
  CPU is not slowed (deploy 729's 15 ticks in two seconds).
*/
const BUSY = Number(process.argv.find(a => a.startsWith('--busy='))?.slice(7) ?? 0);
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
    try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ }
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
      read in a stall past a quarter second (what the tick is for). One stamp
      a frame, told apart by the frame's own timestamp, which every callback
      of one frame is given. Not by the callbacks' own times: the page has
      several loops (the ear's, the show's render, the ride), and the render
      alone took 3 to 9 ms a frame in a cloud session and up to 153 ms with
      software WebGPU, so "within a millisecond" stamped one frame twice and
      the frame count below could double on a working clock (the check
      skeptic's control: 119 frames read of "238 drawn").
    */
    window.__rafTimes = [];
    window.__rafCount = 0;
    /*
      How many turns the page got, counted by a timer of its own every 16 ms:
      on a free page about 60 a second, on a starved one as few as the
      runner allows (a browser runs a late interval once, not once per
      period missed). It is what a starved runner offered the worker's tick,
      so the tick's window waits on it (`watch` below), not on the ticks.
    */
    window.__turns = 0;
    setInterval(() => { window.__turns++; }, 16);
    let lastTs = null;
    const stamp = (cb) => (ts) => {
      if (ts !== lastTs) {
        lastTs = ts;
        const a = window.__rafTimes;
        a.push(performance.now());
        window.__rafCount++;
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
  const slow = async (pg) => { if (SLOW > 1) await (await pg.context().newCDPSession(pg)).send('Emulation.setCPUThrottlingRate', { rate: SLOW }); };
  await slow(page);
  if (BUSY > 0) {
    await page.addInitScript((ms) => {
      setInterval(() => { const end = performance.now() + ms; while (performance.now() < end) { /* busy */ } }, ms + 10);
    }, BUSY);
  }
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
  /*
    Sampled for `ms`, or, given `enough`, for at least `ms` and on until
    the runner has offered enough to judge by (see `watch`), at most
    WINDOW_CAP_MS. Each sample also reads the page's own counts, so the
    window knows what it has been offered without a second round trip.
  */
  const levels = async (ms, enough = null) => {
    const seen = new Set();
    const t0 = Date.now();
    const count = () => page.evaluate(() => {
      const dbg = window.chromaglassDebug?.();
      return {
        v: dbg?.heard?.volume ?? null, stamped: window.__rafCount, turns: window.__turns,
        asked: window.__wallAsks ?? 0, reads: { ...window.chromaglassCastState().ear.reads },
      };
    });
    const first = await count();
    let samples = 0, got = null, capped = false;
    for (;;) {
      const c = await count();
      if (c.v === null) throw new Error('the plate has no sound reading at all');
      seen.add(c.v.toFixed(4));
      samples++;
      got = {
        samples, stamped: c.stamped - first.stamped, turns: c.turns - first.turns, asked: c.asked - first.asked,
        read: c.reads.ask + c.reads.tick - first.reads.ask - first.reads.tick,
      };
      const spent = Date.now() - t0;
      if (spent >= WINDOW_CAP_MS) { capped = !!enough; break; }
      // The clock's record holds 256 readings by the wall and the tick;
      // a window that grew past that could not be checked against it.
      if (spent >= ms && (!enough || enough(got) || got.read >= 200)) break;
      await page.waitForTimeout(50);
    }
    return { size: seen.size, values: [...seen], ms: Date.now() - t0, got, capped };
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
    const inWindow = stamps.filter(t => t > t0 && t <= t1);
    const stamped = inWindow.length;
    // The frames the clock was right to pass over: one whose frame came less
    // than EAR_MIN_GAP_MS (4) after an ask's or a tick's reading, which the
    // clock takes as the same reading. Each such frame by name, not one per
    // off-frame reading: a reading far from any frame excuses nothing.
    const excused = inWindow.filter(t => recent.some(r => r.at <= t && t - r.at < 4)).length;
    return {
      misplaced, closest, n: recent.length, stamped, excused,
      honest: counted.ask === d.ask && counted.tick === d.tick && stamped >= d.frame,
    };
  }, [t0, t1, d]);
  /*
    A window long enough to judge by, counted in what the runner offered and
    not in seconds. Every line below was a fixed two seconds, and on
    2026-11-09 three of them went red on GitHub's starved Macs on what the
    runner offered rather than on the ear, each on a different line: deploy
    729's "covered with no wall" read 15 ticks and 7 levels in its two
    seconds (the page free about 7 times a second), #718's "uncovered" too
    few frames to clear its 20, #744's "visible with the wall asking" 7
    frames of the 10 it needs. Each window still lasts at least two seconds,
    so a free runner measures exactly as before, and then runs on until the
    runner has offered enough: `enough` names that in the runner's own
    terms (frames the page drew, frames the wall asked for, turns the page
    got, samples of the level taken), never in the readings being judged,
    so a window cannot wait for the ear to pass. At most WINDOW_CAP_MS: an
    ear that is deaf, or a clock that reads in the wrong place, is as red at
    the cap as it was at two seconds, and every bar is the one it was. Slowed
    by hand to a sixteenth (`--slow=16`, Chromium's CPU throttle), the
    two-second windows read 8 to 12 frames and went red on four lines here,
    as the hosted Macs did; these went green with the same bars.
  */
  const watch = async (ms, enough) => {
    const a = await snap();
    const lv = await levels(ms, enough);
    const b = await snap();
    const d = delta(a.ear, b.ear);
    return { lv, d, drawn: b.frames - a.frames, ear: b.ear, at: await placed(a.now, b.now, d), t0: a.now, t1: b.now };
  };
  const inStalls = (v) => v.at.honest && v.at.misplaced === 0;
  /*
    "The frames read" as the feature, not as the runner's frame rate. This
    was `more than 20 frame readings in 2 s`, and on #195's deploy (main
    6c6d17e) it went red on the Mac at 14: that page drew 14 frames in the
    two seconds, still building pipelines behind the show (`npm run
    startup`: the rest is built from about 19 s to 43 s, and this runs
    inside that), and the wall's 10 asks all read in its stalls, more than
    250 ms after a frame, as the clock is written to. Nothing was wrong with
    the ear; the floor measured how fast that runner drew. So: every frame
    the page drew read, but for a frame that came within EAR_MIN_GAP_MS of
    an ask's or a tick's reading (`excused` above, each one named). No slack
    for the window's edges: a snapshot is its own task and cannot fall
    between one frame's callbacks. And at least ten frames, so a page that
    barely drew cannot pass on nothing.
  */
  const everyFrame = (v) => v.at.stamped >= 10 && v.d.frame >= v.at.stamped - v.at.excused;
  const frameNote = (v) => ` (of ${v.at.stamped} frames the page drew${v.at.excused ? `, ${v.at.excused} of them within 4 ms of another reading` : ''})`;
  // A window that ran to WINDOW_CAP_MS without the runner offering enough says so.
  const capNote = (v) => (v.lv.capped ? ` (the ${WINDOW_CAP_MS / 1000} s cap: the runner offered too little to judge)` : '');
  const stallNote = (v) => `; over ${(v.lv.ms / 1000).toFixed(1)} s${capNote(v)}; ${v.at.n ? `${v.at.misplaced} of ${v.at.n} read within 250 ms of a frame (closest ${v.at.closest.toFixed(0)} ms)` : 'none read off a frame'}` +
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
  const v1 = await watch(2000, (g) => g.stamped >= ENOUGH && g.samples >= ENOUGH);
  check('visible, the band is heard on the frames alone (the tick only where its frames stalled past 250 ms)',
    v1.lv.size >= 10 && everyFrame(v1) && v1.d.ask === 0 && inStalls(v1),
    `${v1.lv.size} distinct levels in ${(v1.lv.ms / 1000).toFixed(1)} s; readings ${v1.d.frame} frame, ${v1.d.ask} ask, ${v1.d.tick} tick${frameNote(v1)}; context ${v1.ear.state}${stallNote(v1)}`);

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
  await slow(wall);
  await wall.evaluate(() => {
    // With its refresh's time on the show's clock, as CastDisplay asks (PLAN.md §14b).
    const ask = (ts) => {
      try {
        const o = window.opener;
        if (o && !o.closed) {
          // Counted on the show's side, so the window knows how many the wall offered.
          o.__wallAsks = (o.__wallAsks ?? 0) + 1;
          // And when, on the show's clock, so an ask the ear passed over can
          // be told from one it never got (the covered line below).
          const at = (o.__wallAskAt ??= []);
          at.push(o.performance.now());
          if (at.length > 4000) at.splice(0, 2000);
          o.__chromaglassFrame?.(ts + performance.timeOrigin - o.performance.timeOrigin);
        }
      } catch { /* gone */ }
      requestAnimationFrame(ask);
    };
    requestAnimationFrame(ask);
  });
  await page.waitForTimeout(300);
  const v2 = await watch(2000, (g) => g.stamped >= ENOUGH);
  check('visible with the wall asking too, still only the frames read (the wall only where the frames stalled past 250 ms)',
    everyFrame(v2) && inStalls(v2),
    `readings ${v2.d.frame} frame, ${v2.d.ask} ask, ${v2.d.tick} tick${frameNote(v2)}${stallNote(v2)}`);

  // Covered, the wall still asking.
  await page.evaluate(() => { window.__covered = true; });
  await page.waitForTimeout(300);
  const v3 = await watch(2000, (g) => g.asked >= ENOUGH && g.samples >= ENOUGH);
  check('covered, with the wall asking, the plate keeps hearing the band',
    v3.lv.size >= 10, `${v3.lv.size} distinct levels in ${(v3.lv.ms / 1000).toFixed(1)} s`);
  /*
    One reading per ask the show answered. `frames` counts passes through the
    loop, and every ask that reads calls `draw()` once, so the two have to
    match both ways: more readings than asks answered is a second clock, fewer
    is an ask the ear missed.

    The tick draws nothing (it reads; only an ask or the window's own frame
    calls `draw()`, LiquidVisualizer's `askFrame` and `render`), so the
    count this held to, asks and ticks together within 2 of the frames drawn,
    was right only while ticks were 0 or 1. Slowed to a sixteenth here the
    wall's asks came more than 250 ms apart, the tick read in those gaps as it
    is written to, and the line read 32 asks and 9 ticks over 32 frames drawn:
    every frame an ask's, and red. So the two ways, exactly: no more ask
    readings than frames drawn, and frames drawn past the ask readings only
    for asks that came just after a tick's reading (within EAR_MIN_GAP_MS an
    ask is that reading, lib/earClock.ts), each found by its own time
    (`excused` below). The 44 asks and 1 tick over 45 frames of #718's red
    on 2026-11-08 read as that: one ask that drew on the tick's reading.
  */
  /*
    "Not the tick" as the clock is written, not as the runner's frame rate.
    This wanted no tick at all, and on GitHub's Macs it went red twice on
    2026-11-08 (#718: 44 asks, 1 tick, over 45 frames asked for; #734: 65 and
    1 over 66): the wall there drew 22 and 33 frames a second, and the tick is
    written to take over once the wall's asks have stopped for
    EAR_ASK_HOLD_MS (250 ms, lib/earClock.ts), which is what it did, once,
    in a gap of the wall's. The ask-and-tick count matched the frames drawn
    both times, so nothing read twice. The visible lines above went the same
    way and were mended the same way (`placed`): every tick held to the ask
    before it, each on its own, more than 250 ms after it or it is a second
    clock beside the wall. The 250 is written here, not imported, for the
    reason given there. The record has to hold every ask and tick counted,
    or a record missing its asks would put every tick an infinity from one
    (the check-skeptic's note). A build whose tick runs beside the asks
    reads it within 16 ms of one, and fails here as it did before.
  */
  const v3t = await page.evaluate(([t0, t1]) => {
    const recent = window.chromaglassCastState().ear.recent;
    let misplaced = 0, closest = Infinity, n = 0;
    const asks = recent.filter(r => r.driver === 'ask' && r.at > t0 && r.at <= t1).length;
    for (const r of recent) {
      if (r.driver !== 'tick' || r.at <= t0 || r.at > t1) continue;
      n++;
      let last = -Infinity;
      for (const q of recent) { if (q.driver === 'ask' && q.at < r.at) last = q.at; }
      const gap = r.at - last;
      closest = Math.min(closest, gap);
      if (gap <= 250) misplaced++;
    }
    /*
      The asks the clock was right to pass over: one that came within
      EAR_MIN_GAP_MS (4) of a tick's reading, which it takes as that reading.
      Each by its own time on the wall's side, not one per tick: a tick read
      in a gap left by asks that never reached the ear (dropped before
      `offer`, so the hold never saw them) would otherwise excuse them, and
      the check-skeptic's control, an ear deaf to every ask in the first half
      of each second, went green on that at 31 asks read, 49 ticks, 61 frames
      drawn. The wall stamps its ask a moment before the show takes its own
      time for it, so 6 ms here, not 4.
    */
    const askAt = (window.__wallAskAt ?? []).filter(a => a > t0 && a <= t1);
    const excused = askAt.filter(a => recent.some(r => r.driver === 'tick' && a - r.at >= 0 && a - r.at < 6)).length;
    return { n, asks, misplaced, closest, excused };
  }, [v3.t0, v3.t1]);
  check('and it hears on the wall\'s asks, one a frame, not on its own frames, nor the tick but where the asks stopped past 250 ms',
    v3.d.ask > 20 && v3.d.frame === 0 && v3t.n === v3.d.tick && v3t.asks === v3.d.ask && v3t.misplaced === 0 && v3.d.ask <= v3.drawn && v3.drawn - v3.d.ask <= v3t.excused,
    `readings ${v3.d.ask} ask, ${v3.d.frame} frame, ${v3.d.tick} tick, over ${v3.drawn} frames asked for` +
    `${v3t.excused ? `, ${v3t.excused} of them asked within 6 ms of a tick's reading` : ''}${capNote(v3)}` +
    `${v3t.n ? `; ${v3t.misplaced} of ${v3t.n} ticks within 250 ms of an ask (closest ${v3t.closest.toFixed(0)} ms)` : ''}` +
    `${v3t.n === v3.d.tick && v3t.asks === v3.d.ask ? '' : `; the record does not agree (${v3t.n} ticks, ${v3t.asks} asks recorded)`}`);
  await wall.close();

  /*
    No wall: the worker's tick. A window stretched for a starved runner makes
    "more than 20" easy to clear (a tick at a quarter of its rate would, over
    15 s), so the tick is also held to a rate across the whole window: the
    ten readings a second that make "hearing" (see "How many readings"
    above), or, where the page itself got fewer turns than that, half the
    turns it got (each turn has a tick waiting; a queue of them reads once,
    EAR_TICK_MIN_MS). Not half the turns alone: that was this PR's first
    try, and on a GitHub Mac (2026-11-14) the page's own 16 ms timer fired
    99 times in 2.1 s while the worker's tick read 48, a worker thread that
    runs about half as often as the page there, which is still hearing at
    23 a second. Measured: 128 ticks against 127 turns in 2.0 s at full speed
    here, 46 against 30 turns over 4.3 s on a page busy 130 ms in every 140
    (`--busy=130`), 38 and 45 in 2 s on the hosted Macs of 11-09.
  */
  await page.waitForTimeout(300);
  const v4 = await watch(2000, (g) => g.turns >= ENOUGH && g.samples >= ENOUGH);
  check('covered with no wall, the worker\'s tick keeps the ear going',
    v4.lv.size >= 10 && v4.d.tick > 20 && v4.d.tick >= Math.min(10 * v4.lv.ms / 1000, v4.lv.got.turns / 2) && v4.d.ask === 0 && v4.d.frame === 0,
    `${v4.lv.size} distinct levels in ${(v4.lv.ms / 1000).toFixed(1)} s${capNote(v4)}; readings ${v4.d.tick} tick, ${v4.d.ask} ask, ${v4.d.frame} frame; ${v4.lv.got.turns} turns the page got`);

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

  /*
    Uncovered: every frame drawn reads (`everyFrame`, as the visible lines),
    not only more than 20 of them, which an ear reading every other frame
    cleared too, and a stretched window makes easier still.
  */
  await page.evaluate(() => window.__uncover());
  await page.waitForTimeout(300);
  const v5 = await watch(2000, (g) => g.stamped >= ENOUGH);
  check('uncovered, the frames read again and the tick stands back',
    v5.d.frame > 20 && everyFrame(v5) && v5.d.ask === 0 && inStalls(v5),
    `readings ${v5.d.frame} frame, ${v5.d.ask} ask, ${v5.d.tick} tick${frameNote(v5)}${stallNote(v5)}`);

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
