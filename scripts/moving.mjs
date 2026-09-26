#!/usr/bin/env node
/**
 * Does the show keep moving, and how does it move with the music?
 *
 *   npm run moving
 *   MOVING_LOOK=classic MOVING_SECONDS=40 npm run moving
 *
 * Every other check here photographs the plate at a moment. What an audience
 * watches is the plate over time, and two faults only exist over time: the
 * plate standing still, and the plate ignoring the music. The first is not
 * hypothetical: `npm run depth` caught the lead plate taking no steps for six
 * seconds, about a third of runs, and nothing else noticed.
 *
 * So this records the show the way the owner does, with the Record button
 * (the canvas and the sound, `useRecorder.ts`), with "a band in a box" playing
 * so there is music in the file, and watches the take with `scripts/watch.mjs`
 * (the same tool the `watch` skill uses on references).
 *
 * A frozen plate is not a still picture. The first version looked for frames
 * that did not change at all, and the check-skeptic review showed it could
 * not see the fault it was named for: when the solver stops, the loop goes on
 * drawing, the plate's film grain moves with the frame clock (plate.ts), and
 * through the recorder's codec a stalled plate reads 0.03–0.1% change a
 * sample, never zero. A fixed bar for "still" is a guess at the grain.
 *
 * So the take carries its own control. Four seconds in the middle of it, the
 * liquid is frozen on purpose (the palette's "Freeze the liquid", the same
 * stop a stalled solver makes: no steps, the plate still drawn). What the
 * film reads there is what a freeze looks like on this machine, through this
 * codec, and the bar for "still" is set from it:
 *
 *   1. the take is a show: as long as asked, with music through most of it,
 *      the plate drawn in it (not a black canvas)
 *   2. the film tells frozen from moving: outside the control the plate moves
 *      several times more than inside it (if not, every check below would be
 *      measuring grain)
 *   3. the plate stops stepping when frozen and steps again when thawed
 *      (read from the plate, since the key press is not the freeze), and
 *      the film finds the freeze where the plate stood
 *   4. and nowhere else does the plate stand still for two seconds
 *
 * And it prints, without judging, how motion follows loudness: the
 * correlation and the lag. What that should be is a matter of taste and of
 * the look (docs/judging.md); a bar will be set from runs on the owner's
 * machine, not guessed here. The timeline and sheets are written to
 * MOVING_OUT (default /tmp/chromaglass-moving) for a person or Claude to read.
 *
 * Needs a GPU that presents WebGPU (the macOS runner, in checks.yml), and
 * ffmpeg (see the header of scripts/watch.mjs).
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { engineQuery } from './frame.mjs';
import { watchVideo, freezes, WatchError } from './watch.mjs';
import { AUTOPLAY, withBand, recordTake, untilRunning } from './recorder.mjs';

const PORT = Number(process.env.MOVING_PORT ?? 4351);
const LOOK = process.env.MOVING_LOOK ?? 'soap-film';
const SECONDS = Math.max(24, Number(process.env.MOVING_SECONDS ?? 30));
const OUT = path.resolve(process.env.MOVING_OUT ?? '/tmp/chromaglass-moving');
const FREEZE_AT = 12, FREEZE_FOR = 4;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

fs.mkdirSync(OUT, { recursive: true });
const take = path.join(OUT, 'take.webm');
fs.rmSync(take, { force: true });

// The autoplay flag, the band, and the palette: scripts/recorder.mjs says
// why each is there (every one was a silent empty take without it).
const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
let froze = 0, thawed = 0, steps = [], t0 = 0, opening = null;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await withBand(page);
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${LOOK}${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  // The opening freeze of a fresh runner is waited out (recorder.mjs says
  // why): a take begun inside it has a stretch of stillness no one made.
  opening = await untilRunning(page);
  if (!opening.ok) {
    check('the show runs steadily before the take', false, `not in ${(9 + opening.waited).toFixed(0)} s after load`);
    process.exit(1);
  }
  /*
    When the plate really stopped and started, from the plate.

    The palette's key press is not the freeze. Run 36251764464 made it at
    12.8 s and the film found the plate still from 14.1 s, 1.3 s on, and
    failed the one-second bound; the two runs before found it 0.8 s and
    0.3 s on, while the thaw landed within 0.1 s every time. Something
    between the command and the picture takes a varying time to stop it,
    and a check timed from the key press measures that as much as it
    measures the film. So the lead plate's step count is sampled every
    tenth of a second on the page's own clock, and the freeze the film is
    asked to find is the stretch in which it did not step. How far that
    was from the key press is printed, so a lag in the product is seen
    rather than absorbed.
  */
  await page.evaluate(() => {
    const rows = [];
    window.__movingSteps = rows;
    const tick = () => {
      rows.push([Date.now(), window.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? -1]);
      if (rows.length < 3000) setTimeout(tick, 100);
    };
    tick();
  });
  const got = await recordTake(page, SECONDS, take, [
    { at: FREEZE_AT, query: 'Freeze the liquid' },
    { at: FREEZE_AT + FREEZE_FOR, query: 'Thaw the liquid' },
  ]);
  if (!got.ok) {
    check('the recorder hands back a file', false, got.reason);
    process.exit(1);
  }
  [froze, thawed] = got.cues.map(c => c.ran);
  t0 = got.t0;
  steps = (await page.evaluate(() => window.__movingSteps ?? [])).map(([ms, n]) => ({ t: (ms - t0) / 1000, n }));
} finally {
  await browser.close();
}

console.log(`  ${LOOK}, recorded ${SECONDS} s with a band in a box (running ${(9 + opening.waited).toFixed(1)} s after load${opening.gap >= 1 ? `, after ${opening.gap.toFixed(1)} s with no frame` : ''}), frozen on purpose ${froze.toFixed(1)}–${thawed.toFixed(1)} s: ${take}\n`);

// The stretch the plate did not step: from the first sample showing the
// count it held at the thaw command, to the first showing more.
const reported = steps.length > 0 && steps.every(x => x.n >= 0);
const held = [...steps].reverse().find(x => x.t < thawed)?.n;
const stopped = steps.find(x => x.t > froze - 0.5 && x.n === held)?.t;
const resumed = steps.find(x => x.t > thawed && x.n > held)?.t;
const stood = reported && stopped != null && resumed != null && steps.filter(x => x.t >= stopped && x.t < resumed).every(x => x.n === held);
// Both ends bounded, and tightly: the key reaches the loop through one
// React effect (isActiveRef), a frame or two, and the thaw has landed within
// a tenth of a second on every run. Half a second either way is a lag an
// operator would feel, and a product fault this check must not absorb by
// timing the film from the plate instead of the key.
check('the plate stops stepping when frozen and steps again when thawed',
  stood && stopped - froze < 0.5 && resumed - thawed < 0.5,
  !reported ? 'the page does not report the plate\'s steps'
    : stood ? `freeze pressed ${froze.toFixed(1)} s, last step ${stopped.toFixed(1)} s; thaw pressed ${thawed.toFixed(1)} s, stepping ${resumed.toFixed(1)} s`
      : `no still stretch in the steps between ${froze.toFixed(1)} and ${thawed.toFixed(1)} s`);
if (!stood) process.exit(1);
let r;
try {
  r = await watchVideo(take, { out: OUT, frames: 12, quiet: true });
} catch (e) {
  if (!(e instanceof WatchError)) throw e;
  check('the take can be read', false, e.message.split('\n')[0]);
  process.exit(1);
}
const rows = r.rows.slice(1);
const mean = f => r.rows.reduce((s, x) => s + f(x), 0) / r.rows.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

check('the take is as long as the show was recorded', Math.abs(r.span - SECONDS) <= 2.5, `${r.span.toFixed(1)} s of ${SECONDS}`);
// Music by the second, not by the sample. A sample is a tenth of a second,
// and music has rests between its hits: the first run on Metal read 66% of
// samples above -50 dB with the band playing throughout. What is claimed is
// that the band played through the take, so each whole second is asked
// whether anything in it sounded; a single click still passes one second,
// not eighty per cent of them.
const seconds = new Map();
for (const x of r.rows) { const s = Math.floor(x.t); seconds.set(s, Math.max(seconds.get(s) ?? -Infinity, x.loud ?? -Infinity)); }
const heard = [...seconds.values()].filter(v => v > -50).length;
check('with the music through most of it', r.pr.audio && heard >= 0.8 * seconds.size,
  r.pr.audio ? `sound in ${heard} of ${seconds.size} seconds` : 'no audio track');
check('with the plate drawn in it', mean(x => x.dark) < 0.95 && mean(x => x.lum) > 0.02,
  `near black ${(mean(x => x.dark) * 100).toFixed(0)}% of the frame, brightness ${mean(x => x.lum).toFixed(3)}`);

// Half a second in from each edge of the control, for the palette's own
// latency and the recorder's; a second clear of it on the outside.
const inside = rows.filter(x => x.t > stopped + 0.5 && x.t < resumed - 0.5).map(x => x.motion);
const outside = rows.filter(x => x.t > 2 && (x.t < froze - 1 || x.t > resumed + 1) && !x.cut).map(x => x.motion);
const frozenP90 = q(inside, 0.9), movingMedian = q(outside, 0.5);
check('the film tells a frozen plate from a moving one', inside.length >= 20 && movingMedian > 4 * frozenP90,
  `moving: median change ${movingMedian.toFixed(3)}% a sample; frozen on purpose: 90th percentile ${frozenP90.toFixed(3)}%`);

// "Still" is anything under twice what the frozen plate read at its busiest.
// (A floor for the Mac's codec returning exactly the same frame: then the
// frozen stretch reads zero, and twice zero would find nothing.)
const below = Math.max(2 * frozenP90, 0.005);
const found = freezes(r, { below, minSeconds: 2 })
  .map(f => ({ ...f, from: Math.max(f.from, r.rows[0].t + 2) }))   // the recorder's own start-up is not the plate
  .filter(f => f.to - f.from >= 2 - 1e-9);
const control = found.filter(f => f.from < resumed && f.to > stopped);
const show = a => a.map(f => `${f.from.toFixed(1)}–${f.to.toFixed(1)} s`).join(', ') || 'none';
check('the freeze made on purpose is found where it was made',
  control.length === 1 && Math.abs(control[0].from - stopped) <= 1 && Math.abs(control[0].to - resumed) <= 1,
  `the plate stood ${stopped.toFixed(1)}–${resumed.toFixed(1)} s, found ${show(control)} (still = under ${below.toFixed(3)}%)`);
const others = found.filter(f => !control.includes(f));
check('and nowhere else does the plate stand still for two seconds', !others.length, `elsewhere: ${show(others)}`);

if (r.sync) {
  console.log(`\n  measured, not judged: motion follows loudness with r = ${r.sync.r0.toFixed(2)} at no lag, ` +
    `best ${r.sync.best.toFixed(2)} with motion ${r.sync.lag >= 0 ? 'following' : 'leading'} by ${Math.abs(r.sync.lag).toFixed(2)} s`);
}
console.log(`  cuts: ${r.cuts.length ? r.cuts.map(k => `${r.rows[k].t.toFixed(1)} s`).join(', ') : 'none'}`);
console.log(`  timeline: ${r.timeline}`);

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
