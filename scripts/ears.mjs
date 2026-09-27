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
  for (const e of events) if (ear.offer(e.driver, e.t)) taken[e.driver].push(e.t);
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
  const ticks3 = within(taken.tick, 2070, 3000);
  check('covered with no wall, the worker\'s tick reads about sixty a second',
    ticks3 >= 55, `${ticks3} readings in 930 ms`);
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
  for (let t = 0; t < 500; t += 1000 / 60) ear.offer('ask', t);
  const lastAsk = ear.lastRead;
  const tookFrame = ear.offer('frame', lastAsk + 1.5);
  const nextFrame = ear.offer('frame', lastAsk + 1.5 + 1000 / 60);
  check('an ask and a frame 1.5 ms apart are one reading, and the next frame reads',
    !tookFrame && nextFrame, `the frame 1.5 ms after the ask ${tookFrame ? 'read too' : 'did not read'}; the one after ${nextFrame ? 'did' : 'did not'}`);
}

/*
  A visible window hears exactly as it did, whatever its frame rate. Slow: a
  phone or a tired laptop at 15 fps, frames 67 ms apart, with the tick running
  all along; a fixed 50 ms stall let the tick read between every two frames
  (the pre-push review: 55 readings where there used to be 30). Fast: 240 Hz,
  4.2 ms apart with half a millisecond of jitter; a gap applied to every
  reading dropped three frames in ten. Both are changes to the per-reading
  smoothing, so the look, on the machines that differ most from the Mac.
*/
{
  const run = (fps, jitter) => {
    const ear = new EarClock();
    const events = [];
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < 2000; t += 1000 / fps) events.push({ driver: 'frame', t: t + (rand() - 0.5) * 2 * jitter });
    for (let t = 3.1; t < 2000; t += 16) events.push({ driver: 'tick', t });
    events.sort((a, b) => a.t - b.t);
    const took = { frame: 0, tick: 0 };
    for (const e of events) if (ear.offer(e.driver, e.t)) took[e.driver]++;
    return { offered: events.filter(e => e.driver === 'frame').length, ...took };
  };
  const slow = run(15, 0);
  check('visible at 15 fps, every frame reads and the tick never does',
    slow.frame === slow.offered && slow.tick === 0, `${slow.frame} of ${slow.offered} frames, ${slow.tick} ticks`);
  const fast = run(240, 0.5);
  check('visible at 240 Hz with jitter, every frame reads',
    fast.frame === fast.offered && fast.tick === 0, `${fast.frame} of ${fast.offered} frames, ${fast.tick} ticks`);
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
    window.requestAnimationFrame = (cb) => {
      if (!window.__covered) return raf(cb);
      const id = nextId++;
      held.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = (id) => { if (!held.delete(id)) caf(id); };
    window.__uncover = () => {
      window.__covered = false;
      const cbs = [...held.values()];
      held.clear();
      for (const cb of cbs) raf(cb);
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
  const watch = async (ms) => {
    const a = await ear(); const fa = await frames();
    const lv = await levels(ms);
    const b = await ear(); const fb = await frames();
    return { lv, d: delta(a, b), drawn: fb - fa, ear: b };
  };

  // Let the band start and the room calibrate.
  await page.waitForTimeout(4000);
  const v1 = await watch(2000);
  check('visible, the band is heard on the frames alone',
    v1.lv.size >= 10 && v1.d.frame > 40 && v1.d.ask === 0 && v1.d.tick === 0,
    `${v1.lv.size} distinct levels in 2 s; readings ${v1.d.frame} frame, ${v1.d.ask} ask, ${v1.d.tick} tick; context ${v1.ear.state}`);

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
  check('visible with the wall asking too, still only the frames read',
    v2.d.frame > 40 && v2.d.ask === 0 && v2.d.tick === 0,
    `readings ${v2.d.frame} frame, ${v2.d.ask} ask, ${v2.d.tick} tick`);

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
    v3.d.ask > 40 && v3.d.frame === 0 && v3.d.tick === 0 && Math.abs(v3.d.ask - v3.drawn) <= 2,
    `readings ${v3.d.ask} ask, ${v3.d.frame} frame, ${v3.d.tick} tick, over ${v3.drawn} frames asked for`);
  await wall.close();

  // No wall: the worker's tick.
  await page.waitForTimeout(300);
  const v4 = await watch(2000);
  check('covered with no wall, the worker\'s tick keeps the ear going',
    v4.lv.size >= 10 && v4.d.tick > 40 && v4.d.ask === 0 && v4.d.frame === 0,
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
    v5.d.frame > 40 && v5.d.tick === 0 && v5.d.ask === 0, `readings ${v5.d.frame} frame, ${v5.d.ask} ask, ${v5.d.tick} tick`);

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
