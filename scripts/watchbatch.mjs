/**
 * Batch runs (PLAN 47p-5): watch a folder of videos, a playlist or a list of
 * links as one run, rank them in one table, and write the page a person rates
 * them on; and the two steps that follow a rating round, the refit and the
 * notes' themes. Beside watch.mjs, which reaches it through `--batch`,
 * `--refit` and `--notes` and hands it watchVideo.
 *
 *   npm run watch -- --batch ~/takes [--rank score|colour|motion|pace|beat] [--out DIR]
 *   npm run watch -- --batch https://www.youtube.com/playlist?list=…
 *   npm run watch -- --batch links.txt          (one file or link a line; # comments)
 *   npm run watch -- --refit [ratings.json]     (merge it into the library's, fit, report)
 *   npm run watch -- --notes [ratings.json]     (what the notes keep saying)
 *
 * Why one table. Watching one film tells a person about that film; the
 * questions people bring a folder to are comparative (which of my takes is
 * strongest, which edit cuts faster, which grade drifts), and twenty
 * summaries side by side answer none of them. The table is ranked by one
 * measure, said in its heading, so the ranking is never a mystery score:
 * `score` (the report card's mean, the default when every clip has a card:
 * liquid footage, or any footage once the card is fitted to the person's
 * ratings), `colour` (colourfulness, the default otherwise), `motion`
 * (median change between samples), `pace` (cuts a minute) or `beat` (the
 * share of hard cuts on a beat). A clip that could not be watched keeps its
 * row, with the reason, at the bottom.
 *
 * Every clip is watched exactly as a single run watches it (same reads, same
 * folder of files, its own report.html), into `<out>/<key>/`, and the batch
 * adds batch.md, batch.csv and batch.json (every row with its measures),
 * index.html (the table, linking each clip's report) and rate.html
 * (watchrate.mjs). For the rating page each clip's watched window is copied
 * small (rate.mp4, H.264 at 640 px, which every browser plays, where the
 * source may be an MKV a phone will not open).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './watchconfig.mjs';
import { libraryDirs, libraryForKeep, refName } from './watchrefs.mjs';
import { cardMetrics, loadRatings } from './watchcard.mjs';
import { cardScore, mergeRatings, refit, writeFit } from './watchfit.mjs';
import { clipThemes, noteThemes, themeLines } from './watchnotes.mjs';
import { dataUri, esc, renderPage } from './watchreport.mjs';
import { ratePage } from './watchrate.mjs';

export const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|mpg|mpeg|ts|mts|ogv)$/i;
const RANKS = {
  score: { label: 'report card score (mean of graded canons)', get: r => r.score, desc: true },
  colour: { label: 'colourfulness', get: r => r.colourfulness, desc: true },
  motion: { label: 'median motion', get: r => r.motion, desc: true },
  pace: { label: 'cuts a minute', get: r => r.cutsPerMin, desc: true },
  beat: { label: 'share of hard cuts on a beat', get: r => (r.onBeat?.of ? r.onBeat.on / r.onBeat.of : null), desc: true },
};
const PASS = ['frames', 'perSheet', 'rate', 'from', 'to', 'crop', 'noAutocrop', 'settings', 'config', 'liquid', 'report'];

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function ytdlp() {
  if (spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0) return ['yt-dlp'];
  if (spawnSync('python3', ['-m', 'yt_dlp', '--version'], { stdio: 'ignore' }).status === 0) return ['python3', '-m', 'yt_dlp'];
  return null;
}

/**
 * What a batch source holds, as [{ input, name }]: a folder's videos (sorted
 * by name, not into its subfolders), a list file's lines, or a playlist's
 * entries (yt-dlp's flat listing, which reads the playlist page without
 * fetching any video). A single video link is a batch of one.
 */
export function batchItems(source, { listPlaylist = defaultPlaylist } = {}) {
  if (/^https?:\/\//i.test(source)) return listPlaylist(source);
  if (!fs.existsSync(source)) throw new Error(`--batch: ${source} is not a folder, a list file or a link`);
  const st = fs.statSync(source);
  if (st.isDirectory()) {
    return fs.readdirSync(source).filter(f => VIDEO_EXT.test(f) && fs.statSync(path.join(source, f)).isFile()).sort()
      .map(f => ({ input: path.join(source, f), name: f.replace(/\.[^.]+$/, '') }));
  }
  const base = path.dirname(path.resolve(source));
  return fs.readFileSync(source, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => (/^https?:\/\//i.test(l) ? { input: l, name: null } : { input: path.resolve(base, l), name: path.basename(l).replace(/\.[^.]+$/, '') }));
}

function defaultPlaylist(url) {
  const y = ytdlp();
  if (!y) throw new Error('--batch with a link needs yt-dlp (`brew install yt-dlp`, or `python3 -m pip install yt-dlp`)');
  const r = spawnSync(y[0], [...y.slice(1), '--flat-playlist', '--dump-single-json', '--no-warnings', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000 });
  if (r.status !== 0) throw new Error(`--batch: yt-dlp could not list ${url}: ${(r.stderr || '').trim().split('\n').slice(-2).join(' ')}`);
  const j = JSON.parse(r.stdout);
  const entries = Array.isArray(j.entries) ? j.entries : [j];
  return entries.map(e => ({ input: e.webpage_url || e.url || (e.id && j.extractor_key === 'Youtube' ? `https://www.youtube.com/watch?v=${e.id}` : e.url), name: e.title || e.id || null })).filter(e => e.input);
}

/** Unique folder names for the clips, from their names (or links). */
export function clipKeys(items) {
  const seen = new Map();
  return items.map((it, i) => {
    const base = refName(it.name || it.input.replace(/^https?:\/\/(www\.)?/, '')) || `clip-${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return n > 1 ? `${base}-${n}` : base;
  });
}

/** The watched window as a small H.264 copy for the rating page. */
export function rateClip({ ff, file, from, span, out, hasAudio }) {
  const enc = spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '';
  const video = /^\s*V\S*\s+libx264\s/m.test(enc) ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p'] : ['-c:v', 'mpeg4', '-q:v', '6'];
  const f = path.join(out, 'rate.mp4');
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(from), '-i', file, '-t', String(span),
    '-vf', "scale='min(640,iw)':-2", ...video, ...(hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']), '-movflags', '+faststart', f]);
  return r.status === 0 && fs.existsSync(f) ? f : null;
}

/** A picture small enough for a page of twenty clips: JPEG, at most 960 px wide. */
function smallJpeg(file, ff, width = 960) {
  if (!file || !fs.existsSync(file)) return null;
  const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `scale='min(${width},iw)':-2`, '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 && r.stdout?.length ? `data:image/jpeg;base64,${r.stdout.toString('base64')}` : dataUri(file, null, { jpeg: false });
}

/** One clip's row of the table, from its watchVideo result. */
export function batchRow(key, item, r) {
  const motions = r.rows.filter((x, k) => k > 0 && !x.cut && !x.fade).map(x => x.motion).sort((a, b) => a - b);
  return {
    key, input: item.input, title: item.name || key, out: r.out,
    readAs: r.mode?.liquid ? 'liquid' : 'general',
    from: r.rows[0]?.t ?? 0, span: r.span,
    shots: r.shots?.count ?? null, avgShot: r.shots?.avg ?? null, onBeat: r.shots?.onBeat ?? null, bpm: r.shots?.beat?.bpm ?? null,
    cutsPerMin: r.shape?.cutsPerMin ?? null,
    colourfulness: r.design?.colourfulness?.med ?? null,
    motion: motions.length ? motions[motions.length >> 1] : null,
    score: cardScore(r.card), verdict: r.card?.verdict ?? null,
    best: r.best ? { from: r.best.from, to: r.best.to } : null,
    read: cardMetrics(r),
  };
}

/** Sort rows by a rank key (failed rows and rows without the measure last); returns [rows, key, label]. */
export function rankRows(rows, want = '') {
  const ok = rows.filter(r => !r.error);
  const key = want && RANKS[want] ? want : ok.length && ok.every(r => r.score != null) ? 'score' : 'colour';
  const { get, label } = RANKS[key];
  const sorted = [...rows].sort((a, b) => {
    const va = a.error ? null : get(a), vb = b.error ? null : get(b);
    if (va == null && vb == null) return a.key.localeCompare(b.key);
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || a.key.localeCompare(b.key);
  });
  return [sorted, key, label];
}

const f1 = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const beatCell = r => (r.onBeat?.of ? `${r.onBeat.on}/${r.onBeat.of} (chance ${(r.onBeat.chance * 100).toFixed(0)}%)` : r.bpm ? 'no cuts' : '–');

/** The table as Markdown lines (batch.md and the command line). */
export function tableLines(rows, { key, label, ratings = null, themes = [] }) {
  const you = ratings && rows.some(r => typeof ratings[r.key]?.overall === 'number');
  const head = ['#', 'clip', 'read as', 'watched', 'shots (avg s)', 'cuts on a beat', 'score', 'colourful', 'motion', ...(you ? ['you'] : []), ...(themes.length ? ['notes'] : [])];
  const lines = [`Ranked by ${label}${key === 'score' ? '' : ` (--rank ${key})`}.`, '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  rows.forEach((r, i) => {
    if (r.error) { lines.push(`| ${i + 1} | ${r.key} | could not be watched: ${r.error.replace(/\|/g, '/').split('\n')[0].slice(0, 120)} |${' |'.repeat(head.length - 3)}`); return; }
    lines.push(`| ${[i + 1, r.key, r.readAs, `${f1(r.span, 0)} s`, r.shots == null ? '–' : `${r.shots} (${f1(r.avgShot)})`, beatCell(r), f1(r.score), f1(r.colourfulness, 0), f1(r.motion, 2),
      ...(you ? [ratings[r.key]?.overall ?? ''] : []), ...(themes.length ? [clipThemes(themes, r.key).join(', ')] : [])].join(' | ')} |`);
  });
  return lines;
}

/** Write batch.md, batch.csv, batch.json, index.html and rate.html into `out`. */
export function writeBatch({ out, title, rows, rank = '', ratings = null, ff }) {
  const [sorted, key, label] = rankRows(rows, rank);
  const themes = ratings ? noteThemes(Object.fromEntries(Object.entries(ratings).filter(([k]) => rows.some(r => r.key === k)))) : [];
  const md = [`# ${title}`, '', `${rows.length} clips, ${rows.filter(r => r.error).length} could not be watched.`, '', ...tableLines(sorted, { key, label, ratings, themes }), '',
    ...(themes.length ? ['## What your notes keep saying', '', ...themeLines(themes), ''] : []),
    'Each clip has its own folder here with its report.html. Rate them on rate.html, then `--refit` with the ratings.json it saves.'];
  fs.writeFileSync(path.join(out, 'batch.md'), md.join('\n') + '\n');
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = ['rank,clip,input,read_as,from_s,span_s,shots,avg_shot_s,cuts_on_beat,hard_cuts,beat_chance,bpm,cuts_per_min,score,colourfulness,motion,error',
    ...sorted.map((r, i) => [i + 1, r.key, r.input, r.readAs, r.from?.toFixed(2), r.span?.toFixed(2), r.shots, r.avgShot?.toFixed(2), r.onBeat?.on, r.onBeat?.of, r.onBeat?.chance?.toFixed(3),
      r.bpm?.toFixed(1), r.cutsPerMin?.toFixed(2), r.score?.toFixed(2), r.colourfulness?.toFixed(1), r.motion?.toFixed(3), r.error?.split('\n')[0]].map(q).join(','))];
  fs.writeFileSync(path.join(out, 'batch.csv'), csv.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'batch.json'), JSON.stringify({ title, rankedBy: key, rows: sorted.map(({ out: o, ...r }) => ({ ...r, folder: o ? path.basename(o) : null })) }, null, 1) + '\n');
  // index.html: the table with each clip's report linked, on the shared shell.
  const cells = sorted.map((r, i) => r.error
    ? `<tr><td>${i + 1}</td><td>${esc(r.key)}</td><td colspan="7">could not be watched: ${esc(r.error.split('\n')[0])}</td></tr>`
    : `<tr><td>${i + 1}</td><td><a href="${esc(encodeURI(`${r.key}/report.html`))}">${esc(r.key)}</a></td><td>${esc(r.readAs)}</td><td>${f1(r.span, 0)} s</td><td>${r.shots ?? '–'}${r.avgShot != null ? ` (${f1(r.avgShot)} s)` : ''}</td><td>${esc(beatCell(r))}</td><td>${f1(r.score)}</td><td>${f1(r.colourfulness, 0)}</td><td>${f1(r.motion, 2)}</td></tr>`).join('');
  const index = renderPage({ title, meta: [esc(`${rows.length} clips, ranked by ${label}`)], sections: [
    { id: 'table', title: 'Ranked', html: `<div class="scroll"><table><thead><tr><th>#</th><th>clip</th><th>read as</th><th>watched</th><th>shots</th><th>cuts on a beat</th><th>score</th><th>colourful</th><th>motion</th></tr></thead><tbody>${cells}</tbody></table></div><p><a href="rate.html">Rate these clips</a> to build your own eval set.</p>` },
    ...(themes.length ? [{ id: 'notes', title: 'What your notes keep saying', html: `<ul>${themeLines(themes).map(l => `<li>${esc(l.replace(/^- /, '').replace(/\*\*/g, ''))}</li>`).join('')}</ul>` }] : []),
  ], footer: 'Made by reelreader. Each clip\'s own page is in its folder beside this one.' });
  fs.writeFileSync(path.join(out, 'index.html'), index);
  const clips = sorted.filter(r => !r.error && r.rateClip).map(r => ({ key: r.key, title: r.title, video: `${r.key}/rate.mp4`, from: r.from, span: r.span,
    timeline: smallJpeg(path.join(r.out, 'timeline.png'), ff, 1200), sheet: smallJpeg(path.join(r.out, 'sheet-1.png'), ff), read: r.read }));
  const prior = ratings ? Object.fromEntries(Object.entries(ratings).filter(([k]) => clips.some(c => c.key === k))) : {};
  fs.writeFileSync(path.join(out, 'rate.html'), ratePage({ title: `Rate: ${title}`, id: `${refName(title)}-${clips.length}`, clips, prior, meta: [esc(`${clips.length} clips`)] }));
  return { md, themes, sorted, key };
}

/**
 * The batch run: watch every item into its own folder, copy its window for
 * the rating page, and write the batch's files. `watchVideo` is watch.mjs's;
 * `opt` the command line's options.
 */
export async function runBatch(source, opt, watchVideo, { ff, listPlaylist } = {}) {
  ff ??= (await import('./watch.mjs')).findFfmpeg();
  const items = batchItems(source, { listPlaylist });
  if (!items.length) throw new Error(`--batch: no videos in ${source}`);
  const title = /^https?:/.test(source) ? source.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80) : path.basename(path.resolve(source));
  const out = path.resolve(opt.out || path.join(os.tmpdir(), loadConfig().scratch, `batch-${refName(title) || 'run'}`));
  fs.mkdirSync(out, { recursive: true });
  const keys = clipKeys(items), rows = [];
  const pass = Object.fromEntries(PASS.filter(k => opt[k] != null && opt[k] !== '').map(k => [k, opt[k]]));
  for (let i = 0; i < items.length; i++) {
    const it = items[i], key = keys[i], dir = path.join(out, key);
    if (!opt.quiet) console.log(`[${i + 1}/${items.length}] ${key}`);
    try {
      const r = await watchVideo(it.input, { ...pass, out: dir, quiet: true });
      const row = batchRow(key, it, r);
      row.rateClip = rateClip({ ff, file: r.file, from: row.from, span: row.span, out: dir, hasAudio: !!r.pr?.audio });
      rows.push(row);
    } catch (e) {
      rows.push({ key, input: it.input, title: it.name || key, error: e?.message ?? String(e) });
    }
  }
  const { ratings } = loadRatings();
  const res = writeBatch({ out, title, rows, rank: opt.rank, ratings, ff });
  if (!opt.quiet) console.log([...res.md, '', `batch: ${path.join(out, 'batch.md')}`, `table: ${path.join(out, 'index.html')}`, `rate: ${path.join(out, 'rate.html')}`].join('\n'));
  return { out, rows: res.sorted, rankedBy: res.key, themes: res.themes };
}

/**
 * `--refit [file]`: merge the file (if given) into the library's ratings.json,
 * fit the card to the result, write card-fit.json beside it and print the
 * agreement and the notes' themes. `--notes [file]`: the themes alone.
 */
export function refitCommand({ input = '', notesOnly = false, env = process.env, quiet = false } = {}) {
  const lib = libraryDirs(env)[0] ?? libraryForKeep(env);
  const libFile = path.join(lib, 'ratings.json');
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  let ratings = fs.existsSync(libFile) ? read(libFile) : {};
  const lines = [];
  if (input) {
    const given = read(input);
    if (notesOnly) ratings = given;
    else {
      ratings = mergeRatings(ratings, given);
      fs.mkdirSync(lib, { recursive: true });
      fs.writeFileSync(libFile, JSON.stringify(ratings, null, 1) + '\n');
      lines.push(`Merged ${Object.keys(given).length} ratings from ${input} into ${libFile} (${Object.keys(ratings).length} in all).`, '');
    }
  }
  if (!Object.keys(ratings).length) lines.push(`No ratings: rate a batch on its rate.html and pass the ratings.json it saves.`);
  let fit = null;
  if (!notesOnly && Object.keys(ratings).length) {
    fit = refit(ratings, { libDirs: [lib, ...libraryDirs(env).filter(d => d !== lib)] });
    lines.push(...fit.lines);
    if (fit.ok) lines.push(`- written: ${writeFit(fit, lib)}`);
    lines.push('');
  }
  const themes = noteThemes(ratings);
  lines.push('What your notes keep saying:', ...themeLines(themes));
  if (!quiet) console.log(lines.join('\n'));
  return { lines, fit, themes, ratings, lib };
}

/** watch.mjs's way in: `--batch`, `--refit` or `--notes`. */
export async function command(opt, watchVideo) {
  try {
    if (opt.batch) return await runBatch(opt.batch, opt, watchVideo);
    return refitCommand({ input: opt.input, notesOnly: !opt.refit && opt.notes, quiet: opt.quiet });
  } catch (e) {
    // A bad folder or an unreadable ratings.json is the user's to fix: say so, no stack.
    if (e?.code != null && typeof e.code === 'number') throw e;
    console.error(`watch: ${e?.message ?? e}`);
    process.exit(2);
  }
}

export { stamp };
