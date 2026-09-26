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
 *   3. the freeze made on purpose is found, where it was made
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

// Without this the band in a box never starts (no one has clicked the page,
// so its AudioContext stays suspended), its audio track gives the recorder
// no data, and MediaRecorder hands back an empty file that the app then
// quietly does not save: no download, no error. An owner has always clicked.
const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
let froze = 0, thawed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch {} });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${LOOK}${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  // Through the command palette, as qa.mjs reaches things under a desk: the
  // round Record button is hidden while a desk is up, and a desk is up at
  // this size, as on the owner's laptop. Resolves when the command has run.
  const viaPalette = async (query) => {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    await page.evaluate((q) => {
      const input = document.querySelector('[data-testid="palette-input"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, query);
    await page.waitForTimeout(400);
    const row = await page.evaluate(() => document.querySelector('[data-row="0"]')?.textContent ?? '');
    // A row carries its key after the name ("Freeze the liquidF").
    if (!row.startsWith(query)) throw new Error(`the palette offered "${row}" for "${query}"`);
    await page.keyboard.press('Enter');
  };
  await viaPalette('Record the plate');
  const t0 = Date.now();
  const at = s => page.waitForTimeout(Math.max(0, t0 + s * 1000 - Date.now()));
  await at(FREEZE_AT);
  await viaPalette('Freeze the liquid');
  froze = (Date.now() - t0) / 1000;
  await at(FREEZE_AT + FREEZE_FOR);
  await viaPalette('Thaw the liquid');
  thawed = (Date.now() - t0) / 1000;
  await at(SECONDS);
  const download = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await viaPalette('Stop recording');
  const file = await download;
  if (!file) {
    check('the recorder hands back a file', false, 'no download within 20 s of Stop: an empty recording, or the recorder failed to start');
    process.exit(1);
  }
  await file.saveAs(take);
} finally {
  await browser.close();
}

console.log(`  ${LOOK}, recorded ${SECONDS} s with a band in a box, frozen on purpose ${froze.toFixed(1)}–${thawed.toFixed(1)} s: ${take}\n`);
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
const inside = rows.filter(x => x.t > froze + 0.5 && x.t < thawed - 0.5).map(x => x.motion);
const outside = rows.filter(x => x.t > 2 && (x.t < froze - 1 || x.t > thawed + 1) && !x.cut).map(x => x.motion);
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
const control = found.filter(f => f.from < thawed && f.to > froze);
const show = a => a.map(f => `${f.from.toFixed(1)}–${f.to.toFixed(1)} s`).join(', ') || 'none';
check('the freeze made on purpose is found where it was made',
  control.length === 1 && Math.abs(control[0].from - froze) <= 1 && Math.abs(control[0].to - thawed) <= 1,
  `made ${froze.toFixed(1)}–${thawed.toFixed(1)} s, found ${show(control)} (still = under ${below.toFixed(3)}%)`);
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
