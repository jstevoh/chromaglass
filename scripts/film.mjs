#!/usr/bin/env node
/**
 * Every look, filmed with the band playing, and measured the way the real
 * shows were.
 *
 *   npm run film
 *   FILM_ONLY=fillmore-1969,soap-film FILM_SECONDS=90 FILM_TAKES=1 npm run film
 *   FILM_SHARD=2/6 npm run film        every sixth look from the second
 *   FILM_COMBINE=shards npm run film   one table from the shards' film.json
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
 * For each look, FILM_TAKES takes (default 3) on seeds 1, 2, 3, each a
 * fresh page with the band in a box, waited on until the show runs steadily,
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
 * number), and per look and seed a folder with its timeline, sheets and summary. The
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

// Each look is filmed on the same seeds every run (`?seed=1`, `?seed=2`, …),
// one take a seed. Why more than one. The first two Metal runs of the same
// three looks disagreed by far more than any change we would want to judge:
// Classic's motion half-life read 8.3 s on one and 0.3 s on the other, and
// Fillmore's motion against loudness over 20 s windows 0.40 and -0.41. Each
// load draws its own seed (#153), so a single two-minute take is one plate
// among many, and a later change measured on one take could not be told from
// a luckier seed. So each column is the median over the takes, with their
// range beside it, and the seeds are fixed so a later run is the same plates
// with the change, not new ones.
const TAKES = Number(process.env.FILM_TAKES || 3);
if (!(Number.isInteger(TAKES) && TAKES >= 1 && TAKES <= 9)) { console.error(`FILM_TAKES must be a whole number from 1 to 9 (got "${process.env.FILM_TAKES}")`); process.exit(2); }
const SEEDS = Array.from({ length: TAKES }, (_, i) => i + 1);

// FILM_SHARD=k/n films every n-th look from the k-th, so film.yml can spread
// the whole list over parallel runners (three takes of every look is several
// hours on one); FILM_COMBINE=<dir> reads every film.json under it and writes
// the one table, without filming anything.
const SHARD = process.env.FILM_SHARD ? process.env.FILM_SHARD.split('/').map(Number) : null;
if (SHARD && !(SHARD.length === 2 && Number.isInteger(SHARD[0]) && Number.isInteger(SHARD[1]) && SHARD[0] >= 1 && SHARD[0] <= SHARD[1])) {
  console.error(`FILM_SHARD must be k/n with 1 <= k <= n (got "${process.env.FILM_SHARD}")`); process.exit(2);
}
const COMBINE = process.env.FILM_COMBINE ? path.resolve(process.env.FILM_COMBINE) : null;

const picked = PRESETS.filter(p => !ONLY || ONLY.includes(p.id));
if (ONLY && picked.length !== ONLY.length) {
  const known = new Set(PRESETS.map(p => p.id));
  console.error(`no such look: ${ONLY.filter(id => !known.has(id)).join(', ')}`);
  process.exit(2);
}
const looks = SHARD ? picked.filter((_, i) => i % SHARD[1] === SHARD[0] - 1) : picked;
fs.mkdirSync(OUT, { recursive: true });

// The columns, each read off one take's shape().
const COLUMNS = [
  { head: 'swells/min', get: s => s.swells.perMin, fmt: 'n1' },
  { head: 'gap s', get: s => s.swells.gap, fmt: 'n1' },
  { head: 'peak × median', get: s => s.swells.peakOverMedian, fmt: 'n1' },
  { head: 'calm', get: s => s.calm, fmt: 'pc' },
  { head: 'half-life s', get: s => s.halfLife, fmt: 'n1' },
  { head: 'near black 5%', get: s => s.black.p5, fmt: 'pc' },
  { head: 'near black 95%', get: s => s.black.p95, fmt: 'pc' },
  { head: 'hues', get: s => s.hues, fmt: 'n0' },
  { head: 'colour changes/min', get: s => s.reorgPerMin, fmt: 'n1' },
  { head: 'r 1 s', get: s => s.sections?.[1]?.r, fmt: 'n2' },
  { head: 'r 20 s', get: s => s.sections?.[20]?.r, fmt: 'n2' },
];
const YARD = y => [y.swells, y.gap, y.peak, y.calm, y.half, y.black[0], y.black[1], y.hues, y.reorg, y.r1, y.r20];

const n0 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(0));
const n1 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1));
const n2 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(2));
const pc = x => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(0)}%`);
const FMT = { n0, n1, n2, pc };

/**
 * One look's column over its takes: the median, and the range when the takes
 * differ. Only takes that were a show count (a take with a problem is listed
 * under the table instead), and a number a take had nothing to measure for
 * (a dash) is left out rather than read as zero. The median of an even count
 * is the mean of the middle two, so two takes do not quietly report the
 * larger.
 */
function spread(look, col) {
  const v = look.takes.filter(t => t.shape && !t.shape.still && !t.problems.length)
    .map(t => col.get(t.shape)).filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { med: null, lo: null, hi: null, n: 0 };
  const m = v.length >> 1;
  return { med: v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2, lo: v[0], hi: v[v.length - 1], n: v.length };
}
function cell(look, col) {
  const s = spread(look, col), f = FMT[col.fmt];
  if (!s.n) return '–';
  return f(s.lo) === f(s.hi) ? f(s.med) : `${f(s.med)} (${f(s.lo)}–${f(s.hi)})`;
}
const problemsOf = look => look.takes.flatMap(t => t.problems.map(p => `seed ${t.seed}: ${p}`));

function tableLines(results) {
  return [
    `# The looks, filmed`,
    '',
    `${results.length} looks, ${TAKES} take${TAKES > 1 ? 's' : ''} each on seeds ${SEEDS.join(', ')}, ${SECONDS} s a take with the band in a box, watched at ${RATE} samples a second. Each cell is the median over the takes, with their range in brackets when they differ. What each column is: \`shape()\` in scripts/watch.mjs ("colour changes" sees colour, not where shapes are). The first rows are real shows for scale, not targets. A dash is a number there was nothing to measure for (a still take, a flat sound, too few windows).`,
    '',
    `| | ${COLUMNS.map(c => c.head).join(' | ')} |`,
    `|---|${COLUMNS.map(() => '---').join('|')}|`,
    ...YARDSTICK.map(y => `| *${y.id}* | ${YARD(y).map((x, i) => FMT[COLUMNS[i].fmt](x)).join(' | ')} |`),
    ...results.map(r => `| ${r.id}${problemsOf(r).length ? ' ⚠' : ''} | ${COLUMNS.map(c => cell(r, c)).join(' | ')} |`),
    '',
    ...results.filter(r => problemsOf(r).length).map(r => `- ${r.id}: ${problemsOf(r).join('; ')}`),
  ];
}
function writeTable(results) {
  fs.writeFileSync(path.join(OUT, 'film.md'), tableLines(results).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ seconds: SECONDS, rate: RATE, seeds: SEEDS, yardstick: YARDSTICK, looks: results }, null, 1));
}

if (COMBINE) {
  // The shards' film.json files, in the preset list's order.
  const found = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'film.json') found.push(f); } };
  walk(COMBINE);
  const all = found.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).looks ?? []);
  const order = new Map(PRESETS.map((p, i) => [p.id, i]));
  all.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  if (!all.length) { console.error(`no film.json under ${COMBINE}`); process.exit(1); }
  // A runner that died before its first take leaves no film.json, and the
  // table would simply be shorter. So every look asked for that no shard
  // brought back is its own row and its own failure.
  const have = new Set(all.map(r => r.id));
  for (const look of picked) if (!have.has(look.id)) all.push({ id: look.id, name: look.name, takes: [{ seed: '-', problems: ['no runner brought this look back'] }] });
  all.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  writeTable(all);
  console.log(`${tableLines(all).slice(4).join('\n')}\n\n  ${found.length} shard(s), ${all.length} looks: ${path.join(OUT, 'film.md')}`);
  process.exit(all.some(r => problemsOf(r).length) ? 1 : 0);
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

console.log(`  ${looks.length} looks${SHARD ? ` (shard ${SHARD.join('/')})` : ''}, ${TAKES} take${TAKES > 1 ? 's' : ''} each on seeds ${SEEDS.join(', ')}, ${SECONDS} s a take with the band in a box, into ${OUT}\n`);
const results = [];
const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
try {
  for (const look of looks) {
    const row = { id: look.id, name: look.name, takes: [] };
    results.push(row);
    for (const seed of SEEDS) {
      const dir = path.join(OUT, look.id, `seed-${seed}`), take = path.join(dir, 'take.webm');
      fs.mkdirSync(dir, { recursive: true });
      fs.rmSync(take, { force: true });
      const t = { seed, problems: [] }, started = Date.now();
      row.takes.push(t);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      try {
        const page = await context.newPage();
        page.on('pageerror', e => t.problems.push(`page error: ${e.message.slice(0, 120)}`));
        await withBand(page);
        await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${look.id}&seed=${seed}${engineQuery()}`, { waitUntil: 'load' });
        // The opening freeze of a fresh runner is waited out, not filmed
        // (`untilRunning` in recorder.mjs says why), and how long it took is
        // printed with the take. Nine seconds first, as `npm run depth` does:
        // the freeze starts about four and a half seconds after load, so two
        // steady seconds looked for any sooner can be the two before it.
        await page.waitForTimeout(9000);
        const running = await untilRunning(page);
        t.opening = 9 + running.waited;
        if (!running.ok) t.problems.push(`the show never ran steadily in ${t.opening.toFixed(0)} s after load`);
        else {
          const got = await recordTake(page, SECONDS, take);
          if (!got.ok) t.problems.push(got.reason);
        }
      } catch (e) {
        t.problems.push(`recording failed: ${e.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
      if (fs.existsSync(take)) {
        try {
          const r = await watchVideo(take, { out: dir, frames: 12, rate: RATE, quiet: true });
          Object.assign(t, { span: r.span, shape: r.shape, timeline: r.timeline });
          t.problems.push(...notAShow(r));
        } catch (e) {
          if (!(e instanceof WatchError)) throw e;
          t.problems.push(`the take could not be read: ${e.message.split('\n')[0]}`);
        }
        if (!KEEP) fs.rmSync(take, { force: true });
      }
      t.seconds = (Date.now() - started) / 1000;
      const s = t.shape;
      console.log(` ${t.problems.length ? 'FAIL' : 'ok  '} ${look.id} seed ${seed} (${t.seconds.toFixed(0)} s, running ${t.opening?.toFixed(1) ?? '?'} s after load)${s && !s.still ? ` — ${s.swells.perMin.toFixed(1)} swells/min, calm ${(s.calm * 100).toFixed(0)}%, half-life ${n1(s.halfLife)} s, black ${(s.black.p5 * 100).toFixed(0)}–${(s.black.p95 * 100).toFixed(0)}%, ${s.hues} hues` : ''}${t.problems.length ? ` — ${t.problems.join('; ')}` : ''}`);
      // After every take, so a run that hits the job's time limit still
      // leaves the table for what it did.
      writeTable(results);
    }
  }
} finally {
  await browser.close();
}

writeTable(results);
console.log(`\n${tableLines(results).slice(4).join('\n')}\n\n  ${path.join(OUT, 'film.md')}`);
const failed = results.filter(r => problemsOf(r).length);
console.log(`\n${results.length - failed.length}/${results.length} looks filmed on every seed`);
process.exit(failed.length ? 1 : 0);
