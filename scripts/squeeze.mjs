#!/usr/bin/env node
/**
 * `npm run squeeze`: Beat Squeeze presses the lead plate on a kick.
 *
 * What was found: the rhythm plate never pressed. Its centre was the middle
 * of the plate plus a fraction of thirty cells, never rounded, so every cell
 * index its disc reported was a fraction, and the plate's typed arrays drop a
 * write at a fractional index without a word. From the day it was written
 * until #185 (PLAN §10 step 4), every kick on every look with Beat Squeeze up
 * (Fillmore East, 1969 at 0.9 among them) rocked the plate and pressed
 * nothing. No check asked, because none counted what a kick laid.
 *
 * So this counts it, in the app itself, with the band playing: the cells
 * the lead plate's kick strokes lay (`pressedCells.kick`, counted as the
 * stroke reports them, whole cells only, since a fractional one is the bug)
 * against the show's kicks over the same seconds, on Fillmore East, 1969,
 * on a beat tapped in (why tapped, below). And the control: the same
 * seconds with Beat Squeeze at 0, where the kicks go on and nothing is
 * pressed, which says the count is the squeeze's
 * and not something else a kick does.
 *
 * It needs the app's plate to step. On software WebGPU (a cloud session)
 * the full app barely does, so the kicks never reach the squeeze and there
 * is nothing to ask: it says so and passes only there. The Mac shard always
 * asks (SQUEEZE_GPU=1 there, as `npm run phone` has PHONE_GPU).
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { kickDepth } from '../src/lib/squish.ts';

const PORT = Number(process.env.SQUEEZE_PORT ?? 4371);
const NEED_GPU = process.env.SQUEEZE_GPU === '1';
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
  });
  return proc;
}
const server = await serve();
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } };
process.on('exit', stopServer);

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('  [pageerror]', e.message.slice(0, 200)); });
  // The band, chosen before the page loads: simulated audio otherwise waits
  // for a first gesture a harness never makes (`npm run killer` found that).
  await page.addInitScript(() => {
    try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ }
  });
  await page.goto(`http://localhost:${PORT}/?debug&look=fillmore-1969`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassDebug === 'function' && window.chromaglassDebug().fluids?.length > 0, null, { timeout: 60_000 });
  const settings = (patch) => page.evaluate((p) => {
    if (typeof window.chromaglassSettings !== 'function') throw new Error('window.chromaglassSettings is gone');
    window.chromaglassSettings(p);
  }, patch);
  const read = () => page.evaluate(() => {
    const d = window.chromaglassDebug();
    const lead = d.fluids[0];
    if (!lead.pressedCells) throw new Error('the lead plate has no pressedCells');
    if (!lead.kickRelease) throw new Error('the lead plate has no kickRelease');
    return {
      kicks: d.kicks(), kick: lead.pressedCells.kick, depth: lead.pressedDepth.kick, steps: lead.stepCount, squeeze: d.settings.beatSqueeze,
      released: lead.kickRelease.steps, given: lead.kickRelease.given, pressedKicks: lead.kickRelease.kicks, owed: lead.kickRelease.size,
      dt: lead.dtSeconds, stepRate: d.solver().stepRate,
    };
  });
  // Settle into the look and let the band start before counting anything.
  await page.waitForTimeout(8000);
  /*
    The beat, tapped in at 150 bpm, four taps a beat apart (the Tap Tempo
    action, as a pad or the Tap button sends it). Not the band's 122: a
    clock that locked onto the band by ear would also beat every 492 ms, so
    only a tempo the band does not play says the taps are what drive it.
    Faster than the band, so a timer the busy page runs late moves the
    tapped tempo away from the band's and not toward it (check-skeptic: at
    130 bpm a mean delay of 16 ms a tap brought it within 15 ms of 492).

    Why not the kicks the show hears: it hears too few of them to count on.
    The band plays four on the floor at 122 bpm, two kicks a second, and on
    the Mac the show heard 6 in 12 s on one run and 3 in 45 s on the next
    (the #190 deploy, on main, where this failed with every other line
    green), and 6 in 42 s with Beat Squeeze at 0, so it is the ear, not the
    press: the plate stepped at the same rate either way (898 steps in 45 s,
    805 in 42 s). What the show hears of a band is the ear's question and
    PLAN has it; this check asks what the squeeze does with a kick, and a
    tapped tempo gives it one on every beat, the way a projectionist on a
    tap button or a desk's clock does. The band still plays, so each kick
    presses as hard as the bass it lands on, as in a show.
  */
  // The taps' own times, since a busy page runs a timer late: the period
  // the clock should take is the mean of the intervals as tapped. Each tap
  // is aimed at its own time from the first, so lateness does not add up.
  const tapped = await page.evaluate(() => new Promise((resolve, reject) => {
    const at = [];
    const t0 = performance.now();
    const bail = setTimeout(() => reject(new Error(`the taps did not finish: ${at.length} of 4`)), 10_000);
    const tap = () => {
      at.push(performance.now());
      window.chromaglassAction('tap-tempo');
      if (at.length < 4) setTimeout(tap, t0 + at.length * (60000 / 150) - performance.now());
      else { clearTimeout(bail); resolve((at[3] - at[0]) / 3); }
    };
    tap();
  }));
  // The clock the kicks come from, read after the taps have reached the loop:
  // driven from outside, it takes the tapped period and is sure of it.
  const beat = () => page.evaluate(() => window.chromaglassDebug().beat);
  /*
    A window of at least `ms`, held open until the show has kicked six times
    or 45 s have passed. Written when the kicks were the ones heard from the
    band, whose song has sections: on the Mac's first run it kicked 9 times
    in the first 12 s and not once in the next 12 (a breakdown), and the
    control, which needs kicks to show that at 0 they press nothing, had
    none to ask about. On the tapped beat a 12 s window holds about two
    dozen (30 at 150 bpm); the hold stays as the floor under a plate that stalls.
  */
  const window_ = async (ms) => {
    const a = await read();
    const t0 = Date.now();
    await page.waitForTimeout(ms);
    let b = await read();
    while (b.kicks - a.kicks < 6 && Date.now() - t0 < 45_000) {
      await page.waitForTimeout(1000);
      b = await read();
    }
    return {
      seconds: (Date.now() - t0) / 1000,
      kicks: b.kicks - a.kicks, cells: b.kick - a.kick, depth: b.depth - a.depth, steps: b.steps - a.steps, squeeze: b.squeeze,
      released: b.released - a.released, pressedKicks: b.pressedKicks - a.pressedKicks, owed: b.owed, total: b,
    };
  };
  const on = await window_(12000);
  await settings({ beatSqueeze: 0 });
  /*
    Until the setting has reached the loop and the last kick pressed before
    it is given back. A fixed half second was not enough (check-skeptic): a
    kick pressed just before is owed 0.48 s of *plate* time, which runs
    slower than the wall's whenever the plate steps below its rate, and its
    last release steps would land in the window that asks for none.
  */
  await page.waitForFunction(() => {
    const d = window.chromaglassDebug();
    return d.settings.beatSqueeze === 0 && d.fluids[0].kickRelease.size === 0;
  }, null, { timeout: 10_000 }).catch(() => {});
  const off = await window_(12000);
  // The clock and the tempo source it is handed, read together. No optional
  // chaining on the hook: a page without it throws here rather than reading
  // as "no tempo", which the check below would only report as a red it
  // could not explain.
  const { clock, tempo } = await page.evaluate(() => ({ clock: window.chromaglassDebug().beat, tempo: window.chromaglassTempo() }));
  console.log(`  Fillmore East, 1969: ${on.kicks} kicks and ${on.steps} plate steps in ${on.seconds.toFixed(0)} s at Beat Squeeze ${on.squeeze}; ${off.kicks} kicks, ${off.steps} steps in ${off.seconds.toFixed(0)} s at 0`);

  if (errors.length) {
    check('the page runs without errors while the band plays', false, errors[0].slice(0, 200));
  } else if ((on.kicks < 5 || on.steps < 200) && !NEED_GPU) {
    console.log(' --   the app heard too few kicks or stepped too little here to ask (SQUEEZE_GPU=1 on the Mac shard asks it)');
  } else {
    /*
      Each kick lays three nested discs (radii 40, 27 and 15 at GRID_SCALE),
      a few thousand cells, but only on a kick that lands on a plate step
      with the plate active and not draining, and with bass under it (the
      amount is the bass, and a break has none), so not every kick is a kick
      pressed. Asked: the show kicked, the squeeze pressed on it (at least a
      thousand cells a kick, which one fractional disc could
      never reach, since it lays none).
    */
    const perKick = on.cells / Math.max(1, on.kicks);
    // The look and the setting it measured, and a plate that stepped: an
    // unknown look falls back to a random one, and a stalled plate presses
    // nothing while the kicks, counted a frame, go on.
    check('on Fillmore East, 1969 at its Beat Squeeze, then at 0, the plate stepping throughout',
      on.squeeze === 0.9 && off.squeeze === 0 && on.steps >= 200 && off.steps >= 200,
      `Beat Squeeze ${on.squeeze} then ${off.squeeze}; ${on.steps} and ${off.steps} steps`);
    /*
      At the tapped 150 bpm the clock beats every 400 ms, and still does
      after both windows: tapped, the tempo stays until it is cleared. (Its
      confidence is not asked: driven it is set to 1 each frame and then
      loses 0.02 on any frame 3 s past the last onset heard, so it reads
      0.98 as often as 1 while the tap is driving perfectly well.)

      Asked as two claims, each on one stopwatch (PLAN 0-tap). It used to be
      one: the clock's period within 2 ms of the harness's mean tap interval.
      But the harness stamps a tap in the page just before it calls
      `chromaglassAction('tap-tempo')`, and the app stamps it again inside
      `tapTempo`, so a pause between the two (a collection, the first call
      into `runAction` on a busy runner) lands in one mean and not the
      other. Both Mac reds read the clock short of the harness: 396.6
      against 401.4 ms (#195's deploy) and 401.7 against 404.1 (#216's show
      shard), a first stamp 14.4 and 7.2 ms late spread over three gaps,
      while the clock, as the code reads, is on the app's own period every
      frame: the feature worked and the check measured the dispatch.

      First, the feature: the clock runs on the tempo source's own period.
      `setExternal` copies it every frame with the same clamp, so the two
      agree exactly; 0.5 ms leaves room only for a heard onset nudging the
      period between a frame and this read. A tap that never reached the
      source (no tempo) or a clock that ignores it (the ear's 492 ms, or 0)
      is red here.
    */
    const sourcePeriod = tempo && tempo.source === 'tap' && tempo.period > 0 ? tempo.period : 0;
    check('the tapped beat drives the show\'s clock, the band playing under it',
      sourcePeriod > 0 && Math.abs(clock.period - sourcePeriod) <= 0.5 && Math.abs(sourcePeriod - 60000 / 122) > 15,
      `a beat every ${clock.period.toFixed(1)} ms, the tapped tempo ${sourcePeriod ? sourcePeriod.toFixed(1) + ' ms' : 'not set'} (the band plays 122, 492 ms)`);
    /*
      Second, that the taps the app counted are the harness's taps, across
      the two stopwatches, so here the dispatch is allowed for. 30 ms is
      six times the worst gap between the two means seen (4.8 ms), and a
      tap dropped or counted twice moves a mean of three 400 ms gaps by
      100 ms or more (one dropped leaves 400 and 800, a mean of 600; one
      counted twice 30 ms late adds a fourth gap, a mean of 300).
    */
    check('and the tapped tempo is the one the harness tapped',
      sourcePeriod > 0 && Math.abs(sourcePeriod - tapped) < 30,
      `the app's ${sourcePeriod ? sourcePeriod.toFixed(1) : '-'} ms against the harness's ${tapped.toFixed(1)} ms (${(60000 / tapped).toFixed(1)} bpm), over four taps`);
    /*
      And kicks on it, as many as the window has beats (three quarters of
      them, for a frame late enough to carry the clock past a beat). Asked
      as a count and not as "some": the ear alone heard 6 in 12 s on one
      run, so ">= 5" would pass on a clock that took the tapped period and
      never fired, which beatClock.ts's setExternal records happening once
      (locked to 128 bpm, nothing fired in twelve seconds). Only a floor:
      band onsets heard off the tapped grid are kicks too, on top.
    */
    const beats = (w) => w.seconds * 1000 / tapped;
    check('and the show kicks on it', on.kicks >= 0.75 * beats(on) && off.kicks >= 0.75 * beats(off),
      `${on.kicks} and ${off.kicks} kicks in ${on.seconds.toFixed(0)} and ${off.seconds.toFixed(0)} s, of ${beats(on).toFixed(0)} and ${beats(off).toFixed(0)} tapped beats`);
    /*
      And pressed as deep as a kick at this look's squeeze: each disc
      kickDepth(0.9, the bass /70 capped at 1, the accent 1 at Accent 0),
      0.005 × 0.9 × (0.6 + 0.4 × the bass) since PLAN 27b, so the softest
      kick presses 0.0027 at the middle. On a thin gap a disc is a bowl
      (3 × depth × (1 − r²/R²)², squishDisc), whose mean over its own cells
      is the depth itself, and the three nested discs count each cell once
      a disc, so the mean depth a cell is at least half the softest kick's:
      a kick pressing at a tenth of its depth fails. A cell counted at a
      depth of nothing would not count as pressed at all (only cells that
      close the gap are counted).
    */
    const meanDepth = on.depth / Math.max(1, on.cells);
    check('and Beat Squeeze presses the lead plate on them', on.cells > 0 && perKick > 1000 && meanDepth >= 0.5 * kickDepth(0.9, 0, 1),
      `${on.cells} cells laid by kicks, ${perKick.toFixed(0)} a kick, ${meanDepth.toFixed(5)} deep a cell`);
    check('while at 0 the kicks go on and press nothing', off.kicks >= 0.75 * beats(off) && off.cells === 0, `${off.kicks} kicks, ${off.cells} cells`);
    /*
      And every kick lets go (lib/squish.ts KickRelease): pressed and never
      released, the lead plate's middle goes to the floor a few seconds into
      a song on every look whose glass comes back slowly, which is nearly all
      of them. A third of a second at the plate's step rate is a handful of
      release steps a kick, so the release laid at least three steps for each
      kick the plate pressed, is not piling up kicks it owes, and at 0, with
      nothing pressed, lays nothing.

      Not piling up: a kick is owed for KICK_HOLD + KICK_RELEASE (0.483 s) of
      *plate* time, which is the wall's only when the plate steps at the rate
      its dt says. Below it (the Mac shard stepped 20 times a second), a kick
      is owed for longer on the wall, and the kicks come as fast as the clock
      and the ear make them. So as many as land in one kick's owed time on
      the wall, at the rate they came in the window, and three more. A fixed
      4 was not that (check-skeptic): at 20 steps a second against a dt of
      1/60, a kick is owed 1.45 s, three or four clock kicks and the ear's.
    */
    const plateRate = (on.steps / on.seconds) * on.total.dt;          // plate seconds a wall second
    const owedWall = 0.483 / Math.max(0.05, plateRate);
    const owedMax = Math.ceil(owedWall * on.kicks / on.seconds) + 3;
    check('and lets each kick go again, the glass given back after it', on.pressedKicks >= 1 && on.released >= 3 * on.pressedKicks && on.owed <= owedMax,
      `${on.released} release steps for ${on.pressedKicks} kicks pressed (${on.kicks} kicks); ${on.owed} still owed at the end, of ${owedMax} (a kick owed ${owedWall.toFixed(2)} s: ${(on.steps / on.seconds).toFixed(0)} steps a second at dt 1/${(1 / on.total.dt).toFixed(0)}, step rate ${on.total.stepRate})`);
    /*
      Given back where it was taken, and as much: the release lays the kick's
      own discs with its sign turned, so over the whole run, once nothing is
      owed, the gap it gave back is the depth the kicks pressed, cell for
      cell. The app's glue (the radii at GRID_SCALE handed to the release)
      is asked here and nowhere else: discs of the wrong size would give back
      a different sum.
    */
    const t = off.total;
    check('every kick\'s gap given back, as much as it pressed', t.owed === 0 && t.depth > 0 && Math.abs(t.given - t.depth) <= 0.01 * t.depth,
      `${t.given.toFixed(3)} given back against ${t.depth.toFixed(3)} pressed over the run`);
    check('with nothing pressed, nothing is given back', off.released === 0 && off.owed === 0, `${off.released} release steps, ${off.owed} owed`);
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
