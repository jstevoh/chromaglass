#!/usr/bin/env node
/**
 * Does the sound re-render the page?
 *
 *   npm run renders                 # builds, then about half a minute
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
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.RENDERS_PORT ?? 4333);
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
  return {
    t: performance.now(), renders: c.appRenders, commits: window.__commits ?? NaN,
    reads: r.frame + r.ask + r.tick, published: c.ear?.published ?? 0,
    frames: h.frames, fresh: h.fresh, ownFrame: h.ownFrame ?? 0,
  };
});

async function open(browser, screen, { source, desk }) {
  const ctx = await browser.newContext({ viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(({ source, desk }) => {
    try {
      localStorage.setItem('chromaglass-audio-source', source);
      localStorage.setItem('chromaglass-desk-mode', desk);
    } catch { /* private window */ }
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
  }, { source, desk });
  await page.goto(`http://localhost:${PORT}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && typeof window.chromaglassDebug === 'function', null, { timeout: 60_000 });
  // Past the opening: the first seconds build pipelines, load the look and
  // learn the room, and each of those is a render that happens once.
  await page.waitForTimeout(5000);
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
        w.every(x => x.commits <= x.published + ALLOWED_EXTRA), w.map(x => `${f(x.commits)} commits/s`).join(', '));
      const hears = `${screen.name}, the band: the plate hears a new reading on four frames in five, nine in ten taken on that frame`;
      if (PLATE) {
        check(hears, w.every(x => x.frames >= 45 && x.fresh >= 0.8 * x.frames && x.ownFrame >= 0.9 * x.frames),
          w.map(x => `${x.fresh} new and ${x.ownFrame} its own of ${x.frames} frames`).join(', '));
      } else skip(hears, `no plate draws here (${w.map(x => x.frames).join(', ')} frames); held on the Mac`);
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
        w.every(x => x.renders >= 0.6 && x.renders <= 1.5 && x.commits <= 1.5) && (!PLATE || w.every(x => x.frames >= 45)),
        w.map(x => `${x.renders.toFixed(1)}/s, ${x.commits.toFixed(1)} commits/s over ${x.frames} frames`).join(', '));
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
