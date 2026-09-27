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
 * App, so the same ear, under the dock layout):
 *
 *   the band        the simulated band playing. The ear has to be reading
 *                   (at least 45 a second, or nothing below means anything);
 *                   the App renders at most 13 times a second (the ear tells
 *                   React ten times a second, EAR_VIEW_MS, and a few more are
 *                   allowed for the desk's own clocks); and the plate hears
 *                   a reading it had not heard on at least four frames in
 *                   five. The last is the feature, not the count: a fix that
 *                   stopped the renders by feeding the plate ten readings a
 *                   second would pass the count and step the picture, and
 *                   reads about one frame in six here.
 *   the quiet page  no sound source, on the Perform desk: the App renders at
 *                   most one and a half times a second (see below). On the
 *                   Design desk it rendered five times a second before,
 *                   every one of them a poll setting a label or a badge to
 *                   what it already was. The Perform desk because
 *                   the Design desk's layer badges follow how full each
 *                   layer is, which on a Mac's working plate really does
 *                   change, and a render for a real change is not a waste.
 *
 * The counts come from `?debug`: `appRenders` counts the App's function
 * bodies (so it counts renders React threw away too, which cost the same),
 * `ear.reads` the ear's readings by who asked, and the plate's `hearing` its
 * live frames and how many of them read a new reading.
 *
 * Where it runs: the counts need no GPU (the ear and the App run on the
 * "needs WebGPU" screen as on a working plate), so they run in the Measure
 * job and in a cloud session. The plate's frames do need one: with no
 * renderer the loop never starts, so the "hears a new reading" line and the
 * quiet page's frame floor are held on the Mac (`PLATE` below) and printed as
 * skipped elsewhere, never passed. CI runs this on both.
 *
 * The quiet page's bar is one and a half a second, not zero: the Perform
 * desk's "live for m:ss" clock ticks once a second, a real change on screen,
 * and a three-second window holds up to four of its ticks.
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
  const h = window.chromaglassDebug?.()?.hearing ?? { frames: 0, fresh: 0 };
  return { t: performance.now(), renders: c.appRenders, reads: r.frame + r.ask + r.tick, frames: h.frames, fresh: h.fresh };
});

async function open(browser, screen, { source, desk }) {
  const ctx = await browser.newContext({ viewport: screen.viewport, isMobile: screen.touch, hasTouch: screen.touch, deviceScaleFactor: screen.touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(({ source, desk }) => {
    try {
      localStorage.setItem('chromaglass-audio-source', source);
      if (desk) localStorage.setItem('chromaglass-desk-mode', desk);
    } catch { /* private window */ }
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
      reads: (b.reads - a.reads) / s,
      frames: b.frames - a.frames,
      fresh: b.fresh - a.fresh,
    });
  }
  return out;
}

const browser = await launchChromium(chromium);
let failed = 0;
try {
  for (const screen of SCREENS) {
    {
      const { page, ctx } = await open(browser, screen, { source: 'simulated', desk: null });
      const w = await measure(page);
      const f = (x) => x.toFixed(1);
      check(`${screen.name}, the band: the ear is reading`,
        w.every(x => x.reads >= 45), w.map(x => `${f(x.reads)}/s`).join(', '));
      check(`${screen.name}, the band: the App renders at most 13 times a second`,
        w.every(x => x.renders <= 13), w.map(x => `${f(x.renders)}/s`).join(', '));
      const hears = `${screen.name}, the band: the plate hears a new reading on four frames in five`;
      if (PLATE) {
        check(hears, w.every(x => x.frames >= 20 && x.fresh >= 0.8 * x.frames),
          w.map(x => `${x.fresh} of ${x.frames} frames`).join(', '));
      } else skip(hears, `no plate draws here (${w.map(x => x.frames).join(', ')} frames); held on the Mac`);
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, screen, { source: 'none', desk: 'perform' });
      const w = await measure(page);
      // Over frames on the Mac, so a plate that stopped drawing cannot pass it
      // by being quiet for the wrong reason.
      check(`${screen.name}, no sound, the Perform desk: the App renders at most one and a half times a second`,
        w.every(x => x.renders <= 1.5) && (!PLATE || w.every(x => x.frames >= 20)),
        w.map(x => `${x.renders.toFixed(1)}/s over ${x.frames} frames`).join(', '));
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
