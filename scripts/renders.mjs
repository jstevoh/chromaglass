#!/usr/bin/env node
/**
 * Does the sound re-render the page?
 *
 *   npm run renders                 # builds, then about a minute
 *
 * Reported as PLAN.md §14f, found by reading the code and then measured: the
 * ear (hooks/useAudioAnalyzer.ts) handed every reading to React as state, so
 * the whole App, with its desks, panels and the plate's component, rendered
 * once per reading. With the simulated band playing on a laptop-sized page it
 * rendered 69.8 to 70.3 times a second against 60 readings (the rest were
 * polls that set a label to what it already was). And the plate, the one
 * reader that needs every reading, got it last: the prop was copied into its
 * ref by an effect after the render committed, a frame after the reading was
 * made.
 *
 * What is measured, on a laptop-sized page and on an emulated phone (the same
 * App, so the same ear, under the dock layout), both on the Perform desk (the
 * Design desk's layer badges follow how full each layer is, which on a Mac's
 * working plate really does change, and a render for a real change is not a
 * waste; which renders are allowed is named in ALLOWED_EXTRA below):
 *
 *   the band        the simulated band playing. The ear has to be reading
 *                   (forty-five a second here; where a plate draws, once for
 *                   every frame it drew), or nothing below means anything.
 *                   React is told eight to ten and a half times a second
 *                   (EAR_VIEW_MS): a floor too, because meters frozen on one
 *                   reading render nothing and would pass a ceiling. The App
 *                   renders for each of those and at most ALLOWED_EXTRA a
 *                   second besides, so a dead counter is red as well as a
 *                   busy one, and every commit on the page, of any component,
 *                   is held to the same, so a component listening to the ear
 *                   and rendering itself per reading cannot hide under the
 *                   App's count. And the plate: a new reading on four frames
 *                   in five, and on nine in ten a reading taken on that very
 *                   frame. The last two are the feature, not the counts: a
 *                   fix that stopped the renders by feeding the plate the
 *                   ten-a-second state would pass every count and step the
 *                   picture (one frame in six new at 60 fps), and a plate
 *                   whose loop runs before the ear's in each frame would hear
 *                   every reading one frame late (the old lag, by another
 *                   route).
 *   a fader         no sound, and a MIDI fader (a stubbed controller, one
 *                   CC bound to the Dimmer) swept up and down sixty messages
 *                   a second. It rendered the App once a frame while it moved
 *                   (`rideSetting` handed React each move on an animation
 *                   frame), 60 a second here; now React is told ten times a
 *                   second, for the desk's number, and the plate reads the
 *                   ride itself (PLAN.md §14f). So: the desk's Dimmer changes
 *                   seven to ten and a half times a second (a floor too: a
 *                   desk frozen on one value renders nothing and passes a
 *                   ceiling), the App renders for each of those plus the
 *                   Perform desk's clock and no more, the fader's last value
 *                   is where the setting lands, and, where a plate draws, the
 *                   Dimmer the plate draws changes at least twice as often as
 *                   the desk's (read by value on every frame, so a stale copy
 *                   cannot pass). That last one is the feature: a fix that stopped the
 *                   renders by feeding the plate React's ten-a-second state
 *                   would pass every count and step the picture. And a
 *                   second after the fader stops, no frame lays a ride at all
 *                   and the App is back to its clock: #348's first try laid
 *                   the ride over every frame for good after one touch.
 *   the quiet page  no sound source: the App renders between 0.6 and 1.5
 *                   times a second, which is the Perform desk's "live for
 *                   m:ss" clock (a real change, once a second; a
 *                   three-second window holds up to four of its ticks) and
 *                   nothing else. On the Design desk it rendered five times a
 *                   second before, every one a poll setting a label or a
 *                   badge to what it already was, and the engine status did
 *                   the same once a second where a plate draws.
 *
 * The counts come from `?debug`: `appRenders` counts the App's function
 * bodies (so it counts renders React threw away too, which cost the same),
 * `ear.reads` the ear's readings by who asked and `ear.published` how many
 * React was told, the plate's `hearing` its live frames, how many read a new
 * reading and how many one stamped with the frame's own time; the commits
 * from a devtools hook installed before React loads.
 *
 * Where it runs: the counts need no GPU (the ear and the App run on the
 * "needs WebGPU" screen as on a working plate), so they run in the Measure
 * job and in a cloud session. The plate's frames do need one: with no
 * renderer the loop never starts, so the plate's line and the frame floors
 * are held on the Mac (`PLATE` below) and printed as skipped elsewhere,
 * never passed. CI runs this on both.
 */

import { chromium } from 'playwright';
import { launchChromium, port } from './chromium.mjs';
import { spawn } from 'node:child_process';

const PORT = port(4333, 'RENDERS_PORT');
// Where a plate draws: the Mac, or a machine that says it has one.
const PLATE = process.platform === 'darwin' || !!process.env.RENDERS_PLATE;
const skip = (name, why) => console.log(`skip  ${name} — ${why}`);
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

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

const SCREENS = [
  { name: 'laptop', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
];

/** Everything counted, at one moment. */
const sample = (page) => page.evaluate(() => {
  const c = window.chromaglassCastState();
  const r = c.ear?.reads ?? { frame: 0, ask: 0, tick: 0 };
  const h = window.chromaglassDebug?.()?.hearing ?? { frames: 0, fresh: 0, ownFrame: 0 };
  const rd = window.chromaglassDebug?.()?.riding ?? { frames: 0, laid: 0 };
  return {
    rideFrames: rd.frames, laid: rd.laid, deskMoves: window.__deskMoves ?? 0, drawnMoves: window.__drawnMoves ?? 0, offered: window.__offered ?? 0,
    t: performance.now(), renders: c.appRenders, commits: window.__commits ?? NaN,
    reads: r.frame + r.ask + r.tick, published: c.ear?.published ?? 0,
    frames: h.frames, fresh: h.fresh, ownFrame: h.ownFrame ?? 0,
  };
});

/*
  A MIDI controller with one fader, for the fader's phase: Web MIDI stubbed
  before the app loads, enabled, and a map binding CC 7 on channel 1 to the
  Dimmer (the room's, so no look and no track override takes it). The app
  wires its handler onto `onmidimessage` like any input's, and the page then
  calls it as a controller's driver would.
*/
const FADER_MAP = JSON.stringify({
  format: 'chromaglass-midi', version: 1, name: 'renders', bindings: [
    { id: 'fader', source: { kind: 'cc', channel: 0, number: 7 }, target: { kind: 'setting', key: 'dimmer', min: 0, max: 1 }, mode: 'absolute' },
  ],
});

async function open(browser, screen, { source, desk, fader = false, pad = false }) {
  const ctx = await browser.newContext({ viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(({ source, desk, fader, map, pad }) => {
    if (pad) {
      // A standard game controller, stood in for (as showcursor.mjs does): sticks and right trigger are `window.__pad`'s.
      window.__pad = { axes: [0, 0, 0, 0], rt: 0 };
      Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() {
        return [{ id: 'Stand-in pad', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: window.__pad.axes.slice(),
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && window.__pad.rt > 0.05, touched: false, value: i === 7 ? window.__pad.rt : 0 })) }];
      } });
    }
    try {
      sessionStorage.setItem('chromaglass-audio-source', source);
      localStorage.setItem('chromaglass-desk-mode', desk);
      if (fader) {
        localStorage.setItem('chromaglass-midi-enabled', '1');
        localStorage.setItem('chromaglass-midi-map', map);
      }
    } catch { /* private window */ }
    if (fader) {
      const input = { id: 'renders-fader', name: 'renders fader', onmidimessage: null };
      window.__fader = input;
      navigator.requestMIDIAccess = async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null });
    }
    /*
      Every commit React makes, of any component, not only the App's: a
      component that listened to the ear and set its own state on every
      reading would re-render its subtree sixty times a second and never
      show in the App's own count. React calls a devtools hook on every
      commit, in a production build too, when one is installed before it
      loads; this is the smallest one it accepts.
    */
    window.__commits = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {},
      onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
      onCommitFiberRoot() { window.__commits++; },
    };
  }, { source, desk, fader, map: FADER_MAP, pad });
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
  // Past the opening: the first seconds build pipelines, load the look and
  // learn the room, and each of those is a render that happens once.
  await page.waitForTimeout(5000);
  /*
    And, where a plate draws, until it draws: a second at a time, at most
    thirty, until one second holds the fifteen frames the lines below ask of
    each window (45 in 3 s). What was seen (`npm run flakes`, the week to
    2026-10-24): the laptop's band lines red on 8 of 191 Mac runs, every one
    in the first window and every second window fine, the plate drawing 0.0,
    1.7, 1.9, 9.9, 10.8, 12.2, 13.6 and 14.5 frames a second there against
    16.5 to 28.4 in the next. Five seconds in, the page was still opening on
    a cold runner (this runs on the open shard after startup, which empties
    the Mac's shader cache), so those windows measured the opening, not the
    ear. As squeeze.mjs does for its steps: a plate that never gets there is
    still measured, and fails; a warm one passes this at once. How long it
    waited is printed.
  */
  if (PLATE) {
    const t0 = Date.now();
    const drawn = () => page.evaluate(() => window.chromaglassDebug?.()?.riding?.frames ?? 0);
    let up = false;
    for (let k = 0; k < 30 && !up; k++) {
      const a = await drawn();
      await page.waitForTimeout(1000);
      up = (await drawn()) - a >= 15;
    }
    const waited = (Date.now() - t0) / 1000;
    if (!up) console.log(`  (${screen.name}: the plate never drew fifteen frames in a second, ${waited.toFixed(1)} s after the five-second wait; measured anyway)`);
    else if (waited > 1.5) console.log(`  (${screen.name}: the plate came up to fifteen frames a second ${waited.toFixed(1)} s after the five-second wait)`);
  }
  return { page, ctx };
}

/** Two windows of three seconds each, both held to the bars: a burst in either is red. */
async function measure(page) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const a = await sample(page);
    await page.waitForTimeout(3000);
    const b = await sample(page);
    const s = (b.t - a.t) / 1000;
    out.push({
      renders: (b.renders - a.renders) / s,
      commits: (b.commits - a.commits) / s,
      reads: (b.reads - a.reads) / s,
      published: (b.published - a.published) / s,
      frames: b.frames - a.frames,
      frameRate: (b.frames - a.frames) / s,
      fresh: b.fresh - a.fresh,
      ownFrame: b.ownFrame - a.ownFrame,
      rideFrames: b.rideFrames - a.rideFrames,
      rideRate: (b.rideFrames - a.rideFrames) / s,
      laid: b.laid - a.laid,
      deskMoves: (b.deskMoves - a.deskMoves) / s,
      drawnMoves: (b.drawnMoves - a.drawnMoves) / s,
      offered: (b.offered - a.offered) / s,
    });
  }
  return out;
}

/*
  What else may render the App, a second, beside the ear's ten: the Perform
  desk's "live for" clock (one) and the song line's build and drop readout,
  which the desk polls four times a second and which really changes while a
  build climbs (four). Named rather than folded into one round number, so a
  new renderer has to be added here, with its reason, to pass.
*/
const ALLOWED_EXTRA = 1 + 4;

const browser = await launchChromium(chromium);
let failed = 0;
try {
  for (const screen of SCREENS) {
    {
      const { page, ctx } = await open(browser, screen, { source: 'simulated', desk: 'perform' });
      const w = await measure(page);
      const f = (x) => x.toFixed(1);
      /*
        Reading: in a cloud session, forty-five a second (the page draws its
        sixty); where a plate draws, once for every frame it drew, which is
        what the ear promises whatever rate the machine keeps (the Mac
        runner's app has drawn 28 a second).
      */
      check(`${screen.name}, the band: the ear is reading`,
        w.every(x => (PLATE ? x.frames >= 45 && x.reads >= 0.9 * x.frameRate : x.reads >= 45)),
        w.map(x => `${f(x.reads)}/s${PLATE ? ` for ${f(x.frameRate)} frames/s` : ''}`).join(', '));
      check(`${screen.name}, the band: React is told what the ear heard eight to ten and a half times a second`,
        w.every(x => x.published >= 8 && x.published <= 10.5), w.map(x => `${f(x.published)}/s`).join(', '));
      check(`${screen.name}, the band: the App renders for each of those and at most ${ALLOWED_EXTRA} a second besides`,
        w.every(x => x.renders >= 0.9 * x.published && x.renders <= x.published + ALLOWED_EXTRA),
        w.map(x => `${f(x.renders)}/s for ${f(x.published)}`).join(', '));
      check(`${screen.name}, the band: and nothing else on the page commits more`,
        // A floor too: every App render React finishes is a commit, so a
        // counter the devtools hook stopped feeding (React swallows its own
        // errors injecting it) reads 0 and must not pass as "nothing".
        w.every(x => x.commits >= 0.9 * x.renders && x.commits <= x.published + ALLOWED_EXTRA), w.map(x => `${f(x.commits)} commits/s for ${f(x.renders)} renders`).join(', '));
      const hears = `${screen.name}, the band: the plate hears a new reading on four frames in five, nine in ten taken on that frame`;
      if (PLATE) {
        check(hears, w.every(x => x.frames >= 45 && x.fresh >= 0.8 * x.frames && x.ownFrame >= 0.9 * x.frames),
          w.map(x => `${x.fresh} new and ${x.ownFrame} its own of ${x.frames} frames`).join(', '));
      } else skip(hears, `no plate draws here (${w.map(x => x.frames).join(', ')} frames); held on the Mac`);
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform', fader: true });
      const f = (x) => x.toFixed(1);
      /*
        The sweep, and a watch on the desk's own value: how many times the
        Dimmer the App rendered changed, read on every animation frame. Up
        and down the whole travel, so soft takeover picks the fader up on the
        first pass through wherever the Dimmer sat.
      */
      const wired = await page.evaluate(() => typeof window.__fader?.onmidimessage === 'function');
      check(`${screen.name}, a fader: the app is listening to the stubbed controller`, wired);
      await page.evaluate(() => {
        let v = 0, dir = 2, last, lastDrawn, lastAt;
        window.__deskMoves = 0;
        window.__drawnMoves = 0;
        window.__offered = 0;
        const watch = () => {
          const d = window.chromaglassCastState().settings.dimmer;
          if (last !== undefined && d !== last) window.__deskMoves++;
          last = d;
          // And the Dimmer the plate last drew: a value, so a copy handed
          // back unchanged frame after frame cannot pass for a moving fader.
          const drawn = window.__cgRiding?.drawn?.dimmer;
          if (lastDrawn !== undefined && drawn !== lastDrawn) window.__drawnMoves++;
          lastDrawn = drawn;
          // And the frames the plate was offered a new value on: the stub's
          // 60 Hz timer beats against the frames, so some have no message to
          // draw, and the plate cannot move its Dimmer on those.
          const at = window.__faderAt;
          if (lastAt !== undefined && at !== lastAt) window.__offered++;
          lastAt = at;
          window.__deskWatch = requestAnimationFrame(watch);
        };
        watch();
        window.__sweep = setInterval(() => {
          v += dir;
          if (v >= 127) { v = 127; dir = -2; } else if (v <= 0) { v = 0; dir = 2; }
          window.__faderAt = v;
          window.__fader.onmidimessage?.({ data: new Uint8Array([0xb0, 7, v]) });
        }, 1000 / 60);
      });
      // Past the first pickup: the fader has to cross the Dimmer before it takes it.
      await page.waitForTimeout(2500);
      const w = await measure(page);
      check(`${screen.name}, a fader: the desk shows its value seven to ten and a half times a second`,
        w.every(x => x.deskMoves >= 7 && x.deskMoves <= 10.5), w.map(x => `${f(x.deskMoves)}/s`).join(', '));
      check(`${screen.name}, a fader: the App renders for those and the desk's clock, at most ${ALLOWED_EXTRA} a second besides`,
        w.every(x => x.renders >= 0.9 * x.deskMoves && x.renders <= x.deskMoves + ALLOWED_EXTRA && x.commits <= x.deskMoves + ALLOWED_EXTRA),
        w.map(x => `${f(x.renders)}/s, ${f(x.commits)} commits/s for ${f(x.deskMoves)}`).join(', '));
      /*
        On nine frames in ten that were offered a new value the plate draws
        it, and a quarter more often than React is told, at least: at sixty
        messages a second the plate's Dimmer changes on nearly every frame it
        is offered one, and a plate fed only React's would change on React's
        7 to 10.5 a second, once each, whatever its frame rate.

        It asked "twice as often as the desk's" until 2026-10-24, which says
        the same at the 24 to 60 frames a second it was written against and
        asks for more changes than frames below 20: red on 8 of 191 Mac runs
        in the week to 10-24 (all 8 green on the same commit), every one with
        the phone's page drawing 14.6 to 22.5 frames a second and the Dimmer
        changing on 93 to 100% of them ("18.5/s drawn for 10.2 on the desk"
        with 18.7 frames a second, where 20.4 was asked).

        The first replacement asked four frames in five of all it draws, and
        that was no safer than the bar it replaced: over the 48 windows of 12
        green open shards of 10-24, the Dimmer changed on 0.79 to 0.99 of the
        frames drawn (median 0.88), falling as the rate rises (about 0.95 at
        26 to 30 frames a second, about 0.83 at 40 to 45), and one window,
        laptop, 30.9 frames a second, 24.5 changes (0.79), failed 0.8. The
        stub's 60 Hz timer beats against the frames, so some frames have no
        new message to draw, more of them the faster the frames come. That
        ratio reads the stub's timer, not the ride. So the claim is asked of
        the frames that were offered a new value (the watch below counts a
        frame whose newest message differs from the last frame's): a working
        ride reads close to 1.0 there. A plate fed by React's 7 to 10.5 a
        second changes at most that often, against a floor of 0.9 of the
        frames offered, which is 12.6 and up at the 45 frames in 3 s this
        asks (the stub offers a new value on nearly every frame below 30 a
        second). The quarter over the desk's stays whatever the rate: it
        fails a plate fed by React by itself, at any rate the line allows.
        The ratio is printed, and the 0.9 is to be read on a Mac run before
        it is trusted: 0.79 was the lowest of the 48 windows above, against
        this bar's offered frames, which the earlier runs did not print.
      */
      const laidLine = `${screen.name}, a fader: the plate's Dimmer moves on nine frames in ten that were offered a new value, and more often than the desk's`;
      if (PLATE) {
        check(laidLine, w.every(x => x.rideFrames >= 45 && x.offered > 0 && x.drawnMoves >= 0.9 * x.offered && x.drawnMoves >= 1.25 * x.deskMoves && x.laid > 0),
          w.map(x => `${f(x.drawnMoves)}/s drawn on ${f(x.offered)} offered a new value (${(x.drawnMoves / Math.max(1e-9, x.offered)).toFixed(2)}) of ${f(x.rideRate)} frames/s, for ${f(x.deskMoves)} on the desk, ${x.laid} of ${x.rideFrames} frames laid`).join(', '));
      } else skip(laidLine, `no plate draws here (${w.map(x => x.rideFrames).join(', ')} frames); held on the Mac`);
      // Let go, and give the last tenth of a second time to reach React.
      const at = await page.evaluate(() => { clearInterval(window.__sweep); return window.__faderAt; });
      await page.waitForTimeout(1000);
      const landed = await page.evaluate(() => window.chromaglassCastState().settings.dimmer);
      check(`${screen.name}, a fader: where it stops is where the Dimmer lands`,
        Math.abs(landed - at / 127) < 1e-6, `fader ${(at / 127).toFixed(3)}, Dimmer ${Number(landed).toFixed(3)}`);
      const still = await measure(page);
      const stillLine = `${screen.name}, a fader let go: no frame lays a ride, and the App renders for its clock alone (0.6 to 1.5 a second)`;
      check(stillLine,
        still.every(x => x.laid === 0 && x.renders >= 0.6 && x.renders <= 1.5) && (!PLATE || still.every(x => x.rideFrames >= 45)),
        still.map(x => `${x.laid} laid of ${x.rideFrames} frames, ${f(x.renders)} renders/s`).join(', '));
      await page.evaluate(() => cancelAnimationFrame(window.__deskWatch));
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform' });
      const w = await measure(page);
      /*
        Between its clock and one and a half: the clock has to tick (a dead
        counter or a frozen App reads 0.0 and must not pass), and a
        three-second window holds up to four of its ticks. Over frames on
        the Mac, so a plate that stopped drawing cannot pass it by being
        quiet for the wrong reason.
      */
      check(`${screen.name}, no sound, the Perform desk: the App renders for its clock and no more (0.6 to 1.5 a second)`,
        w.every(x => x.renders >= 0.6 && x.renders <= 1.5 && x.commits >= 0.6 && x.commits <= 1.5) && (!PLATE || w.every(x => x.frames >= 45)),
        w.map(x => `${x.renders.toFixed(1)}/s, ${x.commits.toFixed(1)} commits/s over ${x.frames} frames`).join(', '));
      await ctx.close();
    }
    {
      /*
        A game controller (PLAN.md 14ab-8). The hook handed the App a new
        cursor object every thirty-third of a second while the ring showed, so
        the whole App rendered thirty times a second to move a ring. Now the
        ring listens to the hook's store and the App is told nothing: it
        renders for its clock and no more, with the ring up and moving and with
        a trigger held on a still ring. The feature is the ring, not the
        quiet: it has to be on the page and its place has to change while the
        stick sweeps, or a ring that never showed would pass any count.
      */
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform', pad: true });
      const ringAt = () => page.evaluate(() => {
        const r = document.querySelector('[data-testid="gamepad-cursor"]');
        if (!r) return null;
        const b = r.getBoundingClientRect();
        // On the page (its centre inside the window) and drawn, not only present in the tree.
        const on = b.width > 0 && b.left + b.width / 2 >= 0 && b.left + b.width / 2 <= innerWidth && b.top + b.height / 2 >= 0 && b.top + b.height / 2 <= innerHeight;
        return { at: `${r.style.left},${r.style.top}`, width: r.style.width, on, shown: Number(getComputedStyle(r).opacity) > 0 };
      });
      await page.evaluate(() => {
        // The stick swings left and right across the plate every 600 ms.
        let flip = 1;
        window.__sweep = setInterval(() => { flip = -flip; window.__pad.axes = [0.9 * flip, 0.5 * flip, 0, 0]; }, 600);
      });
      await page.waitForTimeout(1500);
      const places = [];
      const a = await sample(page);
      for (let i = 0; i < 12; i++) {
        places.push(await page.evaluate(() => { const r = document.querySelector('[data-testid="gamepad-cursor"]'); return r ? `${r.style.left},${r.style.top}` : null; }));
        await page.waitForTimeout(250);
      }
      const b = await sample(page);
      const s = (b.t - a.t) / 1000;
      const moved = new Set(places.filter(Boolean)).size;
      check(`${screen.name}, a gamepad stick sweeping: the ring is on the page and changes place`,
        places.every(Boolean) && moved >= 5 && (await ringAt())?.on, `${places.filter(Boolean).length} of 12 looks found it, ${moved} places`);
      check(`${screen.name}, a gamepad stick sweeping: the App renders for its clock and no more (0.6 to 1.5 a second)`,
        (b.renders - a.renders) / s >= 0.6 && (b.renders - a.renders) / s <= 1.5 && (b.commits - a.commits) / s <= 1.5 && (!PLATE || b.frames - a.frames >= 45),
        `${((b.renders - a.renders) / s).toFixed(1)} renders/s, ${((b.commits - a.commits) / s).toFixed(1)} commits/s`);
      // The stick let go and the right trigger held: the ring swells and stays where it is.
      await page.evaluate(() => { clearInterval(window.__sweep); window.__pad.axes = [0, 0, 0, 0]; window.__pad.rt = 1; });
      await page.waitForTimeout(1000);
      const before = await ringAt();
      const c = await sample(page);
      await page.waitForTimeout(3000);
      const d = await sample(page);
      const after = await ringAt();
      const held = after ? after.width : null;
      const s2 = (d.t - c.t) / 1000;
      check(`${screen.name}, a gamepad trigger held: the ring is up and swollen, and the App renders for its clock and no more`,
        held === '44px' && before && after && before.at === after.at && after.on && after.shown && (d.renders - c.renders) / s2 >= 0.6 && (d.renders - c.renders) / s2 <= 1.5 && (d.commits - c.commits) / s2 <= 1.5 && (!PLATE || d.frames - c.frames >= 45),
        `ring ${held} ${before?.at === after?.at ? 'still' : 'moved'}${after?.on ? ', on the page' : ', off the page'}, ${((d.renders - c.renders) / s2).toFixed(1)} renders/s, ${((d.commits - c.commits) / s2).toFixed(1)} commits/s`);
      await ctx.close();
    }
  }
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
