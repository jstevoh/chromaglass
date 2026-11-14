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
 *                   The ear's view is told eight to ten and a half times a
 *                   second (EAR_VIEW_MS): a floor too, because meters frozen
 *                   on one reading render nothing and would pass a ceiling,
 *                   and on the laptop the level in the desk's status line has
 *                   to move at least five times a second, read off the page.
 *                   The App renders for none of them (PLAN 46f: the view is a
 *                   store its readers subscribe to, where it was state on the
 *                   App and rendered the whole shell for each, 14.3 ms a time
 *                   on the owner's Mac), at most ALLOWED_EXTRA a second for
 *                   what is named there; every commit on the page, of any
 *                   component, is held to the ear's ten and those, so a
 *                   component listening to the ear and rendering itself per
 *                   reading cannot hide under the App's count; and the
 *                   components that render in a second are counted (`work`,
 *                   every one in every commit) and held to WORK_HEARING, so
 *                   a reader of the view that sits above a desk, and so
 *                   renders the desk ten times a second in a commit of its
 *                   own, is as red as the App doing it. And the plate: a new reading on four frames
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
 *                   ceiling), the App renders for each of those and no more
 *                   (and each of them commits, which is what says the commit
 *                   counter is fed on this page), the fader's last value
 *                   is where the setting lands, and, where a plate draws, the
 *                   Dimmer the plate draws changes at least twice as often as
 *                   the desk's (read by value on every frame, so a stale copy
 *                   cannot pass). That last one is the feature: a fix that stopped the
 *                   renders by feeding the plate React's ten-a-second state
 *                   would pass every count and step the picture. And a
 *                   second after the fader stops, no frame lays a ride at all
 *                   and the App renders for nothing: #348's first try laid
 *                   the ride over every frame for good after one touch.
 *   the quiet page  no sound source: the App does not render (at most
 *                   QUIET_APP a second), and on the laptop the page commits
 *                   0.6 to 1.5 times a second, which is the Perform desk's
 *                   "live for m:ss" clock in a component of its own (a real
 *                   change, once a second; a three-second window holds up
 *                   to four of its ticks): its text has to change, and at
 *                   most WORK_QUIET components render a second. The clock
 *                   was state on the App until PLAN 46f, so this line asked
 *                   0.6 to 1.5 App renders a second, each of them the whole
 *                   shell (13.8 ms on the owner's Mac, once a second, on a
 *                   page whose frame is 16.7). The phone has no desk and no
 *                   clock: nothing commits there, and what says its counters
 *                   are fed is that they counted the page's opening. On the
 *                   Design desk it rendered five times a second before §14f,
 *                   every one a poll setting a label or a badge to what it
 *                   already was, and the engine status did the same once a
 *                   second where a plate draws.
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
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/*
  The site it serves, built here when nothing built it first. In Measure's
  `browser2` part this leans on the iPhone app's remote building `dist/`
  before it, and that holds in a full run; but a pull request runs only the
  checks its diff reaches (PLAN 19k-4), and #673, which touched this script
  alone, ran it with nothing built ("The directory "dist" does not exist",
  red after 1 s). Built only when missing, so a full run still costs nothing.
*/
if (!existsSync('dist/index.html')) {
  console.log('  (no dist/ here: building it first)');
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
}

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
    t: performance.now(), renders: c.appRenders, commits: window.__commits ?? NaN, whoAt: window.__who?.length ?? 0, lost: window.__lost ?? 0,
    work: window.__work ?? NaN, workApp: window.__workApp ?? NaN, levelMoves: window.__levelMoves ?? 0,
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
    /*
      And who: each commit's topmost components that rendered, named, so a
      red ceiling says what besides the App committed (PLAN 19aa-14: six
      GitHub Mac runs read 1.6 to 2.3 commits a second for 1.0 to 1.3 App
      renders, and nothing said whose). A fiber rendered in this commit when
      it was not in the last commit's tree (React swaps in the alternate of
      every fiber it worked on) and carries PerformedWork (flag 1; a fiber
      cloned for a bailout has it cleared). The names are a production
      build's, minified, so the label is what survives minifying: the
      component's prop names and the first element it draws. The App
      itself is the label whose count matches its renders.
    */
    window.__who = [];
    window.__work = 0;
    /*
      And the GPU devices lost (LiquidVisualizer's loss handler logs each one):
      a loss and its recovery commit the plate's own state twice, without
      the App, so a window holding one reads two commits over the App's. The
      cloud's software WebGPU loses its device every nine seconds or so and
      reads the very 2.0 commits a second #595 did, all of them the plate's.
    */
    window.__lost = 0;
    const error = console.error.bind(console);
    console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('WebGPU device lost')) window.__lost++; error(...a); };
    let seen = new Set();
    const label = (f) => {
      const keys = Object.keys(f.memoizedProps ?? {}).filter(k => k !== 'children').slice(0, 4).join(',');
      let h = f.child;
      while (h && typeof h.type !== 'string') h = h.child;
      const el = h?.stateNode;
      const testId = el?.getAttribute?.('data-testid');
      const cls = typeof el?.className === 'string' ? el.className.split(' ')[0] : '';
      return `{${keys || 'no props'}}<${h?.type ?? '?'}${testId ? ` ${testId}` : cls ? `.${cls}` : ''}>`;
    };
    /*
      The count is kept in two: the components that ran in a commit the App
      itself rendered in, and those that ran in any other. On the Mac, with
      a plate drawing, the App renders now and then for reasons of its own
      (0.3 to 0.7 a second in CI's first run of this PR, inside what its
      own lines allow), and one App render is every panel of the desk, about
      530 components on the laptop: one of those in a three-second window
      read 177 a second and failed a bar of 10 that the ear and the clock
      had not come near (1.0 a second in the window beside it). The App's
      renders are held by their own lines; what the work lines hold is what
      runs when the App does not, which is where the ear's leaves and the
      clock now are, and where a leaf grown into a shell would show.
    */
    window.__workApp = 0;
    let appSeen = 0;
    const tops = (root) => {
      const now = new Set();
      const out = [];
      let n = 0;
      const stack = [[root.current.child, false]];
      while (stack.length) {
        const [first, under] = stack.pop();
        for (let f = first; f; f = f.sibling) {
          now.add(f);
          const worked = !seen.has(f) && (f.flags & 1) === 1 && f.alternate !== null && typeof f.type !== 'string';
          // Every one, not only the topmost: what a commit cost is how many
          // components ran, and a count of commits cannot tell one leaf from
          // the whole shell (PLAN 46f; `work` below).
          if (worked) n++;
          if (worked && !under) out.push(label(f));
          if (f.child) stack.push([f.child, under || worked]);
        }
      }
      seen = now;
      let app = appSeen;
      try { app = window.chromaglassCastState?.().appRenders ?? appSeen; } catch { /* before the App's first render */ }
      if (app !== appSeen) window.__workApp += n; else window.__work += n;
      appSeen = app;
      // A commit whose only work was a mount, or a render that bailed out, names no one, and says so.
      return out.length ? out : ['(no component re-rendered: a mount or a bail-out)'];
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {},
      onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
      onCommitFiberRoot(_id, root) {
        window.__commits++;
        window.__root = root;
        try { window.__who.push(...tops(root)); } catch { window.__who.push('(unnamed: the walk threw)'); }
      },
    };
  }, { source, desk, fader, map: FADER_MAP, pad });
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
  // Past the opening: the first seconds build pipelines, load the look and
  // learn the room, and each of those is a render that happens once.
  await page.waitForTimeout(5000);
  /*
    And, where a plate draws, until it draws: a second at a time, at most
    thirty, until one second holds fifteen frames, the rate at which the
    lines below fill a three-second window (on a slower plate they hold
    a window open past three seconds for their 45 frames: `heldOpen`).
    What was seen (`npm run flakes`, the week to 2026-10-24): the laptop's band lines red on 8 of 191 Mac runs, every one
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

/*
  Two windows, both held to the bars: a burst in either is red. Each is at
  least three seconds and, where a plate draws, held open until the plate
  has drawn FRAMES_ASKED frames, at most WINDOW_CAP_MS (PLAN 19aa-13).

  It was a fixed three seconds until 2026-11-07, and the lines that read
  frames ask 45 of them, so on the Mac it asked fifteen frames a second as
  well as what each line says. GitHub's Macs draw this page at 11 to 19
  frames a second, so "the ear is reading" went red 16 times there with its
  ratio green: #656 read 18.3 a second for 11.3 frames a second, and #546,
  #645 and #435 had a reading on 0.98 to 1.00 of the frames, each its own,
  over 40 to 43 frames in one phone window. No line claims a frame rate: the ear promises a reading on
  every frame the plate draws, whatever rate the machine keeps, and the 45
  is there so a ratio is taken over enough frames to mean something. So the
  window is held until it has them, and every bar is unchanged: the counts
  with a ceiling are still rates over the first three seconds, the ratios
  are over the whole window's frames, and the 45 is still asked by each
  line. A plate drawing under 4.5
  frames a second never fills a window and is red as before. How long each
  window took is printed beside the line, and a window held past three
  seconds says so.
*/
const FRAMES_ASKED = 45;
const WINDOW_CAP_MS = 10_000;
/** The window from `a` held open past `b` until the plate has drawn FRAMES_ASKED frames, or the cap. */
async function heldOpen(page, a, b) {
  // Both counters move on every live frame (LiquidVisualizer's loop); the lines read one or the other.
  while (PLATE && Math.min(b.frames - a.frames, b.rideFrames - a.rideFrames) < FRAMES_ASKED && b.t - a.t < WINDOW_CAP_MS) {
    await page.waitForTimeout(250);
    b = await sample(page);
  }
  return b;
}
/** Who committed between two samples, as `label ×n`, most first (see the devtools hook in `open`). */
async function whoBetween(page, a, b) {
  const names = await page.evaluate(([i, j]) => window.__who.slice(i, j), [a.whoAt, b.whoAt]);
  const n = new Map();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  const lost = b.lost - a.lost;
  return ([...n].sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ×${v}`).join(', ') || 'nothing') + (lost ? `, ${lost} GPU device${lost > 1 ? 's' : ''} lost` : '');
}
/** Printed beside a commits ceiling: who, for each window, when anything besides the App's own renders committed. */
const whoFor = (w) => (w.some(x => x.commits > x.renders + 0.2) ? `; committed: ${w.map(x => x.who).join(' | ')}` : '');
async function measure(page) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const a = await sample(page);
    await page.waitForTimeout(3000);
    const b3 = await sample(page);
    const b = await heldOpen(page, a, b3);
    const s = (b.t - a.t) / 1000;
    /*
      The counts with a ceiling (renders, commits, what React is told, the
      desk's moves) are read over the first three seconds whatever the
      window, as they always were (check-skeptic): spread over a held window
      of up to ten, a burst of renders that was red at +5 a second in three
      would read under its bar. What is asked per frame is read over the
      whole window: the frames, what the ear and the plate did on them, and
      the desk's moves beside the plate's (one ratio, one window).
    */
    const s3 = (b3.t - a.t) / 1000;
    out.push({
      renders: (b3.renders - a.renders) / s3,
      commits: (b3.commits - a.commits) / s3,
      published: (b3.published - a.published) / s3,
      deskMoves: (b3.deskMoves - a.deskMoves) / s3,
      work: (b3.work - a.work) / s3,
      workApp: (b3.workApp - a.workApp) / s3,
      levelMoves: (b3.levelMoves - a.levelMoves) / s3,
      reads: (b.reads - a.reads) / s,
      frames: b.frames - a.frames,
      frameRate: (b.frames - a.frames) / s,
      fresh: b.fresh - a.fresh,
      ownFrame: b.ownFrame - a.ownFrame,
      rideFrames: b.rideFrames - a.rideFrames,
      rideRate: (b.rideFrames - a.rideFrames) / s,
      laid: b.laid - a.laid,
      heldDeskMoves: (b.deskMoves - a.deskMoves) / s,
      drawnMoves: (b.drawnMoves - a.drawnMoves) / s,
      offered: (b.offered - a.offered) / s,
      seconds: s,
      who: await whoBetween(page, a, b3),
    });
  }
  return out;
}
const heldFor = (w) => (w.some(x => x.seconds > 3.5) ? ` (frames over windows of ${w.map(x => x.seconds.toFixed(1)).join(' and ')} s)` : '');

/*
  What may render the App, a second, while the band plays: the song line's
  build and drop readout, which the desk polls four times a second and which
  really changes while a build climbs (four). Named rather than folded into
  one round number, so a new renderer has to be added here, with its reason,
  to pass. It was `1 + 4` and "beside the ear's ten" until PLAN 46f: the one
  was the Perform desk's "live for" clock, which now ticks in a component of
  its own (CLOCK below), and the ten were the ear's view, which is now a
  store its readers subscribe to.
*/
const ALLOWED_EXTRA = 4;
/** The desk's clock: one commit a second where there is a desk (the laptop), in its own component. */
const CLOCK = 1;
/** App renders a second on a page where nothing is happening: none, with room for one stray in a three-second window. */
const QUIET_APP = 0.5;
/*
  Components that render in a second (`work`: every function or class
  component React ran, in every commit, counted by the devtools hook).

  This is the line PLAN 46f is held by. A count of renders or commits says
  how often and not how much: main's ten App renders a second and this
  tree's ten commits of one percentage both read "ten". Read 2026-11-13 in a
  cloud session, both screens, two windows each:
    the band    main 5,840 a second on the laptop and 714 on the phone, this tree 11 and 0
    no sound    main 531 a second on the laptop and 65 on the phone, this tree 1 and 0
  The bars sit an order of magnitude under main and a few times over what
  the readers need (a percentage ten times a second; a clock once), so a
  reader moved up the tree, or a new ten-a-second state on the App, is red
  long before it costs what main did.
*/
const WORK_HEARING = 60;
const WORK_QUIET = 10;
/** The quiet page, by screen: the App still, and the page committing for the desk's clock where there is one. */
const quietPage = (screen, renders, commits) => renders <= QUIET_APP
  && (screen.touch ? commits <= QUIET_APP : commits >= 0.6 * CLOCK && commits <= 1.5 * CLOCK);
const quietSays = (screen) => (screen.touch ? `at most ${QUIET_APP} App renders and commits a second` : `at most ${QUIET_APP} App renders a second, 0.6 to 1.5 commits for the desk's clock`);

const browser = await launchChromium(chromium);
let failed = 0;
try {
  for (const screen of SCREENS) {
    {
      const { page, ctx } = await open(browser, screen, { source: 'simulated', desk: 'perform' });
      // The level the desk's status line shows, read on every animation frame: how often what a person sees moves.
      await page.evaluate(() => {
        let last;
        window.__levelMoves = 0;
        const watch = () => {
          const t = document.querySelector('[data-testid="status-hearing"]')?.textContent ?? null;
          if (last !== undefined && t !== last) window.__levelMoves++;
          last = t;
          requestAnimationFrame(watch);
        };
        watch();
      });
      const w = await measure(page);
      const f = (x) => x.toFixed(1);
      /*
        Reading: in a cloud session, forty-five a second (the page draws its
        sixty); where a plate draws, once for every frame it drew, which is
        what the ear promises whatever rate the machine keeps (the Mac
        runner's app has drawn 28 a second).
      */
      check(`${screen.name}, the band: the ear is reading`,
        w.every(x => (PLATE ? x.frames >= FRAMES_ASKED && x.reads >= 0.9 * x.frameRate : x.reads >= 45)),
        w.map(x => `${f(x.reads)}/s${PLATE ? ` for ${f(x.frameRate)} frames/s, ${x.frames} frames` : ''}`).join(', ') + heldFor(w));
      check(`${screen.name}, the band: the ear's view is told what it heard eight to ten and a half times a second`,
        w.every(x => x.published >= 8 && x.published <= 10.5), w.map(x => `${f(x.published)}/s`).join(', '));
      /*
        And somebody is shown it. The floor that says the meters are alive
        was the App's own renders (one for each reading told); the App no
        longer renders for a reading, so the floor is what the page shows:
        the level in the desk's status line, which the band moves on nearly
        every reading (10.0 a second in a cloud session). The phone shows no
        level (no desk, no status line), and says so.
      */
      const levelLine = `${screen.name}, the band: the desk's level moves five to ten and a half times a second`;
      if (screen.touch) skip(levelLine, 'the phone shows no level');
      else check(levelLine, w.every(x => x.levelMoves >= 5 && x.levelMoves <= 10.5), w.map(x => `${f(x.levelMoves)}/s`).join(', '));
      check(`${screen.name}, the band: the App renders for none of those, at most ${ALLOWED_EXTRA} a second`,
        w.every(x => x.renders <= ALLOWED_EXTRA),
        w.map(x => `${f(x.renders)}/s for ${f(x.published)}`).join(', '));
      check(`${screen.name}, the band: and the page commits no more than the ear's view, the clock and those`,
        // A floor too, where the level is shown: each move of it is a commit,
        // so a counter the devtools hook stopped feeding (React swallows its
        // own errors injecting it) reads 0 and must not pass as "nothing".
        w.every(x => x.commits >= 0.9 * x.levelMoves && x.commits <= x.published + CLOCK + ALLOWED_EXTRA), w.map(x => `${f(x.commits)} commits/s for ${f(x.levelMoves)} moves of the level`).join(', ') + whoFor(w));
      check(`${screen.name}, the band: at most ${WORK_HEARING} components render a second outside the App's own renders`,
        // And a floor where the level is shown: the leaf that shows it renders for each move, so a
        // work counter that died (a fiber flag renamed, the walk throwing) reads 0 and is not "nothing rendered".
        w.every(x => x.work <= WORK_HEARING && Number.isFinite(x.work) && x.work >= 0.9 * x.levelMoves), w.map(x => `${f(x.work)}/s for ${f(x.levelMoves)} moves of the level (${f(x.workApp)}/s in the App's ${f(x.renders)} renders/s)`).join(', '));
      const hears = `${screen.name}, the band: the plate hears a new reading on four frames in five, nine in ten taken on that frame`;
      if (PLATE) {
        check(hears, w.every(x => x.frames >= FRAMES_ASKED && x.fresh >= 0.8 * x.frames && x.ownFrame >= 0.9 * x.frames),
          w.map(x => `${x.fresh} new and ${x.ownFrame} its own of ${x.frames} frames`).join(', ') + heldFor(w));
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
      check(`${screen.name}, a fader: the App renders for those, at most ${ALLOWED_EXTRA} a second besides, and each render commits`,
        // The commits' floor is what says the devtools hook is fed on this page (it was the band's line that said so, when the App rendered for the ear).
        // And the work counter's own floor on both screens (the phone shows no level for the band's line to hold it by): an App render is a component that rendered.
        w.every(x => x.renders >= 0.9 * x.deskMoves && x.renders <= x.deskMoves + ALLOWED_EXTRA && x.commits >= 0.9 * x.renders && x.commits <= x.deskMoves + CLOCK + ALLOWED_EXTRA && x.workApp >= 0.9 * x.renders),
        w.map(x => `${f(x.renders)}/s, ${f(x.commits)} commits/s, ${f(x.workApp)} components/s in them, for ${f(x.deskMoves)}`).join(', '));
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
        frames offered, which is 12.6 and up at the 45 frames a window this
        asks (the stub offers a new value on nearly every frame below 30 a
        second). The quarter over the desk's stays whatever the rate: it
        fails a plate fed by React by itself, at any rate the line allows.
        The ratio is printed, and the 0.9 is to be read on a Mac run before
        it is trusted: 0.79 was the lowest of the 48 windows above, against
        this bar's offered frames, which the earlier runs did not print.
      */
      const laidLine = `${screen.name}, a fader: the plate's Dimmer moves on nine frames in ten that were offered a new value, and more often than the desk's`;
      if (PLATE) {
        check(laidLine, w.every(x => x.rideFrames >= FRAMES_ASKED && x.offered > 0 && x.drawnMoves >= 0.9 * x.offered && x.drawnMoves >= 1.25 * x.heldDeskMoves && x.laid > 0),
          w.map(x => `${f(x.drawnMoves)}/s drawn on ${f(x.offered)} offered a new value (${(x.drawnMoves / Math.max(1e-9, x.offered)).toFixed(2)}) of ${f(x.rideRate)} frames/s, for ${f(x.heldDeskMoves)} on the desk, ${x.laid} of ${x.rideFrames} frames laid`).join(', ') + heldFor(w));
      } else skip(laidLine, `no plate draws here (${w.map(x => x.rideFrames).join(', ')} frames); held on the Mac`);
      // Let go, and give the last tenth of a second time to reach React.
      const at = await page.evaluate(() => { clearInterval(window.__sweep); return window.__faderAt; });
      await page.waitForTimeout(1000);
      const landed = await page.evaluate(() => window.chromaglassCastState().settings.dimmer);
      check(`${screen.name}, a fader: where it stops is where the Dimmer lands`,
        Math.abs(landed - at / 127) < 1e-6, `fader ${(at / 127).toFixed(3)}, Dimmer ${Number(landed).toFixed(3)}`);
      const still = await measure(page);
      // The same page whose counters read ten a second a moment ago: a still one here is the App, not a dead counter.
      const stillLine = `${screen.name}, a fader let go: no frame lays a ride, and the App renders for nothing (at most ${QUIET_APP} a second)`;
      check(stillLine,
        still.every(x => x.laid === 0 && x.renders <= QUIET_APP) && (!PLATE || still.every(x => x.rideFrames >= FRAMES_ASKED)),
        still.map(x => `${x.laid} laid of ${x.rideFrames} frames, ${f(x.renders)} renders/s`).join(', ') + heldFor(still));
      await page.evaluate(() => cancelAnimationFrame(window.__deskWatch));
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform' });
      const clockAt = () => page.evaluate(() => document.querySelector('[data-testid="live-for"]')?.textContent ?? null);
      const opened = await sample(page);
      const clock0 = await clockAt();
      const w = await measure(page);
      const clock1 = await clockAt();
      /*
        The App still, and on the laptop the page committing between its
        clock and one and a half: the clock has to tick (a dead counter
        reads 0.0 and must not pass), and a three-second window holds up to
        four of its ticks. The phone has no clock, so what says its counters
        are fed is the opening they counted before the window. Over frames
        on the Mac, so a plate that stopped drawing cannot pass it by being
        quiet for the wrong reason.
      */
      check(`${screen.name}, no sound, the Perform desk: ${quietSays(screen)}`,
        opened.renders >= 1 && opened.commits >= 1 && w.every(x => quietPage(screen, x.renders, x.commits)) && (!PLATE || w.every(x => x.frames >= FRAMES_ASKED)),
        w.map(x => `${x.renders.toFixed(1)} renders/s, ${x.commits.toFixed(1)} commits/s over ${x.frames} frames`).join(', ') + `; ${opened.renders} renders and ${opened.commits} commits in the opening` + heldFor(w) + whoFor(w));
      const tickLine = `${screen.name}, no sound, the Perform desk: the desk's clock moves on`;
      if (screen.touch) skip(tickLine, 'the phone has no desk and no clock');
      else check(tickLine, /^\d+:\d\d$/.test(clock0 ?? '') && /^\d+:\d\d$/.test(clock1 ?? '') && clock0 !== clock1, `${clock0} then ${clock1}`);
      check(`${screen.name}, no sound, the Perform desk: at most ${WORK_QUIET} components render a second outside the App's own renders`,
        // The floor is the clock's own leaf where the clock is shown (0.6 a second, as its commits' floor): the work counter alive on this page too.
        w.every(x => x.work <= WORK_QUIET && Number.isFinite(x.work) && (screen.touch || x.work >= 0.6)), w.map(x => `${x.work.toFixed(1)}/s (${x.workApp.toFixed(1)}/s in the App's ${x.renders.toFixed(1)} renders/s)`).join(', '));
      await ctx.close();
    }
    {
      /*
        The bottle in hand, with a Dye Budget reading that moves (PLAN 19aa-14).
        The quiet page above went red on GitHub's Macs at 2.0 and 2.3 commits
        a second for the App's 1.3 (#595, #670), and its gamepad windows at
        1.6 and 1.7 (#605, #640, #669), only where a plate draws: the bottle
        held its level in React state, and a plate whose mean density drifts
        moves the level a twentieth now and then, a commit of its own each
        time and one more on the next poll. Where no plate draws the reading
        never moves, so the lines above could not see it here. So the reading
        is made to move: the App's handle on the plate (the ref its
        `readDyeRoom` reads, found among the App's hooks by the `dyeRoom` it
        carries) answers a level that crosses two twentieths and back every
        0.7 s, wider than `shownRoom`'s hysteresis, as a hunting plate's
        would. Then the bottle has to show it (its `data-level` changes at
        least three times in the window: a bottle that stopped polling
        would pass the commits line by being still) and the page commits
        no more than the App's clock. Before the bottle moved its own level,
        this read 2.7 and 3.0 commits a second on both screens, every
        extra one the bottle's, named by the devtools hook.
      */
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform' });
      const testId = screen.touch ? 'phone-dye-bottle' : 'bottle-in-hand';
      const patched = await page.evaluate((testId) => {
        let v = null;
        const stack = [window.__root?.current?.child];
        while (stack.length && !v) {
          for (let f = stack.pop(); f && !v; f = f.sibling) {
            for (let k = f.memoizedState; k && typeof k === 'object' && 'next' in k; k = k.next) {
              const r = k.memoizedState;
              if (r && typeof r === 'object' && 'current' in r && typeof r.current?.dyeRoom === 'function') { v = r; break; }
            }
            if (f.child) stack.push(f.child);
          }
        }
        if (!v) return false;
        /*
          A reading two twentieths away from the last on every ask: the bottle
          is the one thing that asks (the App's `readDyeRoom`), every 0.4 s,
          so each of its polls has a move to draw. One stand-in per handle the
          visualizer hands over (its imperative handle is made again on its
          renders).
        */
        let flip = false;
        const moving = () => ((flip = !flip) ? 0.30 : 0.40);
        const standIn = (h) => h && new Proxy(h, { get: (t, k) => (k === 'dyeRoom' ? moving : t[k]) });
        let real = v.current, shown = standIn(real);
        Object.defineProperty(v, 'current', { configurable: true, get: () => shown, set: (x) => { real = x; shown = standIn(x); } });
        /*
          What the bottle draws, read off the page every 50 ms: the level it
          says and where its liquid stands (the rect's top, which is what a
          viewer sees move), with the App's renders at that moment. A
          change with no App render since the one before is the bottle's
          own poll drawing; a bottle that drew only when the App's clock
          re-rendered it would change about once a second and show none.
        */
        window.__levels = [];
        window.__levelWatch = setInterval(() => {
          const el = document.querySelector(`[data-testid="${testId}"]`);
          const l = el?.getAttribute('data-level') ?? null;
          const y = Number(el?.querySelector('rect[data-liquid]')?.getAttribute('y'));
          if (window.__levels.at(-1)?.l !== l || !Object.is(window.__levels.at(-1)?.y, y)) window.__levels.push({ l, y, renders: window.chromaglassCastState().appRenders });
        }, 50);
        return true;
      }, testId);
      await page.waitForTimeout(1500);
      const l0 = await page.evaluate(() => window.__levels.length);
      const w = await measure(page);
      const levels = await page.evaluate((n) => window.__levels.slice(Math.max(0, n - 1)), l0);
      const seen = levels.slice(1);
      // The levels planted and no other (a plate's own drift on the Mac cannot pass for them), the liquid where each says, and drawn by the bottle itself.
      const planted = seen.every((x, i) => (x.l === '0.30' || x.l === '0.40') && (i === 0 || x.l !== seen[i - 1].l));
      const drawn = seen.every((x) => Math.abs(x.y - (21 - 13.7 * Number(x.l))) < 1e-6);
      const own = seen.filter((x, i) => x.renders === levels[i].renders).length;
      check(`${screen.name}, the bottle in hand: it draws a Dye Budget reading that moves, on its own poll`,
        patched && seen.length >= 8 && planted && drawn && own >= 5,
        patched ? `${seen.length} levels in ${w.reduce((s, x) => s + x.seconds, 0).toFixed(1)} s, ${own} with no App render since the last (${seen.slice(0, 5).map(x => `${x.l} at y ${x.y.toFixed(2)}`).join(', ')}${seen.length > 5 ? ', …' : ''})${planted ? '' : '; not the planted levels'}${drawn ? '' : '; the liquid is not where the level says'}` : 'found no handle carrying dyeRoom among the App\'s hooks');
      check(`${screen.name}, the bottle in hand: and the page stays quiet while it moves (${quietSays(screen)})`,
        patched && w.every(x => quietPage(screen, x.renders, x.commits)),
        w.map(x => `${x.renders.toFixed(1)}/s, ${x.commits.toFixed(1)} commits/s`).join(', ') + whoFor(w));
      await page.evaluate(() => clearInterval(window.__levelWatch));
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
      // Its clock's renders over these three seconds, its frames over the held window (as in `measure`).
      const b = await sample(page);
      const bf = await heldOpen(page, a, b);
      const s = (b.t - a.t) / 1000;
      const moved = new Set(places.filter(Boolean)).size;
      check(`${screen.name}, a gamepad stick sweeping: the ring is on the page and changes place`,
        places.every(Boolean) && moved >= 5 && (await ringAt())?.on, `${places.filter(Boolean).length} of 12 looks found it, ${moved} places`);
      check(`${screen.name}, a gamepad stick sweeping: the page stays quiet (${quietSays(screen)})`,
        quietPage(screen, (b.renders - a.renders) / s, (b.commits - a.commits) / s) && (!PLATE || bf.frames - a.frames >= FRAMES_ASKED),
        `${((b.renders - a.renders) / s).toFixed(1)} renders/s, ${((b.commits - a.commits) / s).toFixed(1)} commits/s; ${bf.frames - a.frames} frames in ${((bf.t - a.t) / 1000).toFixed(1)} s` + whoFor([{ renders: (b.renders - a.renders) / s, commits: (b.commits - a.commits) / s, who: await whoBetween(page, a, b) }]));
      // The stick let go and the right trigger held: the ring swells and stays where it is.
      await page.evaluate(() => { clearInterval(window.__sweep); window.__pad.axes = [0, 0, 0, 0]; window.__pad.rt = 1; });
      await page.waitForTimeout(1000);
      const before = await ringAt();
      const c = await sample(page);
      await page.waitForTimeout(3000);
      const d = await sample(page);
      const df = await heldOpen(page, c, d);
      const after = await ringAt();
      const held = after ? after.width : null;
      const s2 = (d.t - c.t) / 1000;
      check(`${screen.name}, a gamepad trigger held: the ring is up and swollen, and the page stays quiet`,
        held === '44px' && before && after && before.at === after.at && after.on && after.shown && quietPage(screen, (d.renders - c.renders) / s2, (d.commits - c.commits) / s2) && (!PLATE || df.frames - c.frames >= FRAMES_ASKED),
        `ring ${held} ${before?.at === after?.at ? 'still' : 'moved'}${after?.on ? ', on the page' : ', off the page'}, ${((d.renders - c.renders) / s2).toFixed(1)} renders/s, ${((d.commits - c.commits) / s2).toFixed(1)} commits/s; ${df.frames - c.frames} frames in ${((df.t - c.t) / 1000).toFixed(1)} s` + whoFor([{ renders: (d.renders - c.renders) / s2, commits: (d.commits - c.commits) / s2, who: await whoBetween(page, c, d) }]));
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
