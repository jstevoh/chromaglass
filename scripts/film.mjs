#!/usr/bin/env node
/**
 * Every look, filmed with the band playing, and measured the way the real
 * shows were.
 *
 *   npm run film
 *   FILM_ONLY=fillmore-1969,soap-film FILM_SECONDS=90 npm run film
 *
 * Asked for (the plan "Playing the plate like the real thing", step 0,
 * chosen by the owner as "measure first"): before anything changes how the
 * plate moves, know how it moves now, in the same units the footage study
 * used on the Joshua Light Show, the Dregs and a 2016 show in a bar. The
 * study's finding was that real shows come in swells and scenes, perform
 * their black, and follow the music only over whole sections, while our plate
 * is equally busy all the time (`src/lib/phrasing.ts` measured that much and
 * stopped). Each later step of the plan says what it changed in these
 * columns, so this is the before.
 *
 * For each look: a fresh page, the band in a box, nine seconds to settle,
 * then FILM_SECONDS (default 120) through the app's own Record button
 * (`scripts/recorder.mjs`), watched with `scripts/watch.mjs` and reduced to
 * its shape (`shape()` there says what each number is and how it was
 * checked). Two minutes because the band's sections are eight bars, about
 * 16 s, and motion against loudness over 20 s windows needs five windows
 * before it says anything; a minute gives three.
 *
 * It measures and does not judge. What a look should score is taste, and
 * some looks are meant to be busy; the yardstick rows at the top of the table
 * are there to read against, not to pass. It fails only when a take is not a
 * show at all (`notAShow` below): no file from the recorder, the wrong
 * length, long black, a stopped picture, or a silent band.
 *
 * Writes FILM_OUT (default `film/`): film.md (the table), film.json (every
 * number), and per look a folder with its timeline, sheets and summary. The
 * takes themselves are deleted after watching (tens of megabytes each)
 * unless FILM_KEEP=1. Needs a GPU that presents WebGPU and ffmpeg: the
 * macOS runner, by hand (.github/workflows/film.yml).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { engineQuery } from './frame.mjs';
import { PRESETS } from '../src/presets.ts';
import { watchVideo, WatchError } from './watch.mjs';
import { AUTOPLAY, withBand, recordTake, untilRunning } from './recorder.mjs';

const PORT = Number(process.env.FILM_PORT ?? 4352);
const OUT = path.resolve(process.env.FILM_OUT ?? 'film');
const ONLY = process.env.FILM_ONLY ? process.env.FILM_ONLY.split(',').map(s => s.trim()).filter(Boolean) : null;
const SECONDS = Number(process.env.FILM_SECONDS || 120);
if (!(Number.isFinite(SECONDS) && SECONDS >= 30)) { console.error(`FILM_SECONDS must be a number of seconds, at least 30 (got "${process.env.FILM_SECONDS}")`); process.exit(2); }
// Four samples a second, as the footage study watched the real shows: motion
// is the change between samples, so the same plate reads larger at four than
// at ten, and the yardstick rows are only comparable at the rate they were
// measured at.
const RATE = 4;
const KEEP = process.env.FILM_KEEP === '1';

// The footage study's shows, watched by this same tool at four samples a
// second (the numbers `npm run watch -- <clip> --rate 4` prints for them;
// footage.md has the links and the windows). Not targets to hit: the range
// real shows live in.
const YARDSTICK = [
  { id: 'Joshua Light Show, Liquid Loops 1969 (film)', swells: 3.1, gap: 10.0, peak: 2.6, calm: 0.42, half: 2.0, black: [0.02, 1.0], hues: 2, reorg: 9.8, r1: null, r20: null },
  { id: 'The Dregs, Freq Salon 2023 (live, TV)', swells: 2.0, gap: 9.3, peak: 2.5, calm: 0.23, half: 7.3, black: [0.02, 0.61], hues: 3, reorg: 8.7, r1: -0.13, r20: -0.20 },
  { id: 'Sheep at The Dip 2016 (live, one camera)', swells: 2.0, gap: 21.3, peak: 1.9, calm: 0.20, half: 4.8, black: [0.61, 0.79], hues: 0, reorg: 0, r1: 0.22, r20: 0.39 },
];

const looks = PRESETS.filter(p => !ONLY || ONLY.includes(p.id));
if (ONLY && looks.length !== ONLY.length) {
  const known = new Set(PRESETS.map(p => p.id));
  console.error(`no such look: ${ONLY.filter(id => !known.has(id)).join(', ')}`);
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

// The table: the yardstick first, then every look in the same columns.
const n1 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1));
const n2 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(2));
const pc = x => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(0)}%`);
function tableLines() {
  return [
    `# The looks, filmed`,
    '',
    `${results.length} of ${looks.length} looks, ${SECONDS} s each with the band in a box, watched at ${RATE} samples a second. What each column is: \`shape()\` in scripts/watch.mjs ("colour changes" sees colour, not where shapes are). The first rows are real shows for scale, not targets. A dash is a number there was nothing to measure for (a still take, a flat sound, too few windows).`,
    '',
    '| | swells/min | gap s | peak × median | calm | half-life s | near black 5–95% | hues | colour changes/min | r 1 s | r 20 s |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...YARDSTICK.map(y => `| *${y.id}* | ${n1(y.swells)} | ${n1(y.gap)} | ${n1(y.peak)} | ${pc(y.calm)} | ${n1(y.half)} | ${pc(y.black[0])}–${pc(y.black[1])} | ${y.hues} | ${n1(y.reorg)} | ${n2(y.r1)} | ${n2(y.r20)} |`),
    ...results.map(r => {
      const s = r.shape;
      if (!s) return `| ${r.id} | ${r.problems.join('; ')} | | | | | | | | | |`;
      return `| ${r.id}${r.problems.length ? ' ⚠' : ''} | ${n1(s.swells.perMin)} | ${n1(s.swells.gap)} | ${n1(s.swells.peakOverMedian)} | ${pc(s.calm)} | ${n1(s.halfLife)} | ${pc(s.black.p5)}–${pc(s.black.p95)} | ${s.hues} | ${n1(s.reorgPerMin)} | ${n2(s.sections?.[1]?.r)} | ${n2(s.sections?.[20]?.r)} |`;
    }),
    '',
    ...results.filter(r => r.problems.length).map(r => `- ${r.id}: ${r.problems.join('; ')}`),
  ];
}
function writeTable() {
  fs.writeFileSync(path.join(OUT, 'film.md'), tableLines().join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ seconds: SECONDS, rate: RATE, yardstick: YARDSTICK, looks: results }, null, 1));
}

/**
 * Why a take is not a show, if it is not: every number after these would
 * describe nothing. Each was a way the check-skeptic review found a broken
 * take passing with plausible numbers.
 *
 *   - the wrong length (the recorder stopped early, or never stopped)
 *   - black for a long stretch: the mean over the take hides 100 s of black
 *     beside 20 s of plate, so it is any run of 20 s at 95% near black or
 *     more (a scene's fade to black in a real show is 5 to 15 s)
 *   - stopped: a renderer that stops, or a device that is lost, leaves the
 *     recorder repeating one frame, which through the codec reads about
 *     0.01% a sample, not zero (the self-test's clip E); a live plate, even
 *     frozen on purpose with its grain, reads 0.03% and more (`npm run
 *     moving` on Metal). More than a tenth of the samples under 0.02%, or a
 *     median under shape()'s bar for a still, is a stopped picture. A share,
 *     not a run: the codec's keyframes put a blip in a stopped stretch every
 *     few seconds and break any run up.
 *   - silent: an audio track that carries nothing makes every correlation
 *     read about zero, which is what real shows score. As in `moving`, the
 *     band must sound (over -50 dB) in at least 80% of the seconds.
 */
function notAShow(r) {
  const out = [];
  if (!(Math.abs(r.span - SECONDS) <= 2.5)) out.push(`the take is ${r.span.toFixed(1)} s, not ${SECONDS}`);
  let run = 0, longest = 0;
  for (const x of r.rows) { run = x.dark >= 0.95 ? run + 1 : 0; longest = Math.max(longest, run); }
  if (longest / r.rate >= 20) out.push(`${(longest / r.rate).toFixed(0)} s on end of black canvas`);
  const moving = r.rows.slice(1).filter(x => !x.cut);
  const stopped = moving.filter(x => x.motion < 0.02).length / Math.max(1, moving.length);
  if (stopped > 0.1 || r.shape.still) out.push(`the picture stopped: ${(stopped * 100).toFixed(0)}% of samples unchanged`);
  if (!r.pr.audio) out.push('no sound track in the take');
  else {
    const seconds = new Map();
    for (const x of r.rows) { const k = Math.floor(x.t); seconds.set(k, Math.max(seconds.get(k) ?? -Infinity, x.loud ?? -Infinity)); }
    const heard = [...seconds.values()].filter(v => v > -50).length;
    if (heard < 0.8 * seconds.size) out.push(`the band sounded in only ${heard} of ${seconds.size} seconds`);
  }
  return out;
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${code}): port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

console.log(`  ${looks.length} looks, ${SECONDS} s each with the band in a box, into ${OUT}\n`);
const results = [];
const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
try {
  for (const look of looks) {
    const dir = path.join(OUT, look.id), take = path.join(dir, 'take.webm');
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(take, { force: true });
    const row = { id: look.id, name: look.name, problems: [] }, started = Date.now();
    results.push(row);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    try {
      const page = await context.newPage();
      page.on('pageerror', e => row.problems.push(`page error: ${e.message.slice(0, 120)}`));
      await withBand(page);
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${look.id}${engineQuery()}`, { waitUntil: 'load' });
      // The opening freeze of a fresh runner is waited out, not filmed
      // (`untilRunning` in recorder.mjs says why), and how long it took is
      // printed with the look. Nine seconds first, as `npm run depth` does:
      // the freeze starts about four and a half seconds after load, so two
      // steady seconds looked for any sooner can be the two before it.
      await page.waitForTimeout(9000);
      const running = await untilRunning(page);
      row.opening = 9 + running.waited;
      if (!running.ok) row.problems.push(`the show never ran steadily in ${row.opening.toFixed(0)} s after load`);
      else {
        const got = await recordTake(page, SECONDS, take);
        if (!got.ok) row.problems.push(got.reason);
      }
    } catch (e) {
      row.problems.push(`recording failed: ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
    if (fs.existsSync(take)) {
      try {
        const r = await watchVideo(take, { out: dir, frames: 12, rate: RATE, quiet: true });
        Object.assign(row, { span: r.span, shape: r.shape, timeline: r.timeline });
        row.problems.push(...notAShow(r));
      } catch (e) {
        if (!(e instanceof WatchError)) throw e;
        row.problems.push(`the take could not be read: ${e.message.split('\n')[0]}`);
      }
      if (!KEEP) fs.rmSync(take, { force: true });
    }
    row.seconds = (Date.now() - started) / 1000;
    const s = row.shape;
    console.log(` ${row.problems.length ? 'FAIL' : 'ok  '} ${look.id} (${row.seconds.toFixed(0)} s, running ${row.opening?.toFixed(1) ?? '?'} s after load)${s && !s.still ? ` — ${s.swells.perMin.toFixed(1)} swells/min, calm ${(s.calm * 100).toFixed(0)}%, black ${(s.black.p5 * 100).toFixed(0)}–${(s.black.p95 * 100).toFixed(0)}%, ${s.hues} hues` : ''}${row.problems.length ? ` — ${row.problems.join('; ')}` : ''}`);
    // After every look, so a run that hits the job's time limit still leaves
    // the table for the looks it did.
    writeTable();
  }
} finally {
  await browser.close();
}

writeTable();
console.log(`\n${tableLines().slice(4).join('\n')}\n\n  ${path.join(OUT, 'film.md')}`);
const failed = results.filter(r => r.problems.length);
console.log(`\n${results.length - failed.length}/${results.length} looks filmed`);
process.exit(failed.length ? 1 : 0);
