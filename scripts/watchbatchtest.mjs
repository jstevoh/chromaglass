#!/usr/bin/env node
/**
 * Batch runs, the rating page, the refit and the notes' themes (PLAN 47p-5:
 * scripts/watchbatch.mjs, watchrate.mjs, watchfit.mjs, watchnotes.mjs).
 *
 *   npm run watchbatch
 *
 * What a person does with them, in order, held step by step:
 *
 *   (a) a folder of four clips made here (one cut every second to a click
 *       track, one vivid take, one calm take, and a file that is not a video)
 *       is watched as one batch: every clip gets its own folder with its
 *       report and a rate.mp4 (H.264, the watched window's length), the
 *       broken file a row that says why, at the bottom, and the batch goes on
 *       past it; batch.md, batch.csv, batch.json, index.html and rate.html
 *       are written;
 *   (b) the table is ranked by the measure its heading names: by default
 *       colourfulness when not every clip has a card (the vivid take above the
 *       calm one), `pace` puts the fast cutter first, `score` the best card;
 *   (c) a list file (relative paths and links, comments skipped) and a
 *       playlist (its listing stubbed, so no network) give the same items,
 *       and two clips of one name get two folders;
 *   (d) rate.html is one file that loads nothing from anywhere (no script
 *       or picture from a link; the clips are the batch's own rate.mp4 files
 *       beside it), names every clip, and carries each clip's measures for a
 *       refit;
 *   (e) the page in a browser is `npm run ratepage` (the browser shard, where
 *       Chromium is; this one is the sound shard's, for ffmpeg);
 *   (f) the refit: on twelve clips whose marks rise with colourfulness, the
 *       fit's bands are the clips rated highest, its left-out agreement is
 *       high and it is used; card-fit.json is written beside ratings.json;
 *       a later watch of footage that would get no card (general) gets the
 *       fitted card and says so in its first line; with the same marks
 *       shuffled the left-out agreement falls and the fit is not used (the
 *       real-show card stays); clips kept aside are never fitted on and give
 *       their own figure; fewer than five rated clips are refused;
 *   (g) the card's agreement now reads the overall mark too (most raters give
 *       only that), and merging two rating files keeps both sets of moments;
 *   (h) the notes: "froze", "stuck" and "frozen" on three low-rated clips are
 *       one theme, freezes, flagged as a candidate fault check with the moments
 *       it was pinned at; "lovely colours" on two clips is a theme and no
 *       fault; a word on one clip is no theme; the batch table gains the
 *       person's marks and each clip's themes, and batch.md the themes.
 *
 * Mutants (each tried by hand, 2026-11-28, and each turned this red): the fit
 * always used (f), the held-out clips fitted on (f), the moments dropped on
 * merge (g), the fault words not folded (h), the broken clip ending the batch
 * (a). In the sound shard for its ffmpeg. About twenty seconds.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchVideo, findFfmpeg } from './watch.mjs';
import { batchItems, clipKeys, rankRows, runBatch, writeBatch, refitCommand } from './watchbatch.mjs';
import { refit, mergeRatings, MIN_RATED } from './watchfit.mjs';
import { noteThemes } from './watchnotes.mjs';
import { REAL_SHOW_CARDS, reportCard, loadRatings } from './watchcard.mjs';
import { blobTake } from './watchreadtest.mjs';
import { clipAudio, ffmpegVersion } from './watchffmpeg.mjs';

let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const ff = findFfmpeg();
const audio = clipAudio(ff);
if (!audio) { console.log(`FAIL no libvorbis or libopus in ${ffmpegVersion(ff)}`); process.exit(1); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchbatch-'));
// The library the ratings and the fit live in, for this run only.
const lib = path.join(dir, 'library');
fs.mkdirSync(lib);
process.env.REELREADER_REFERENCES = lib;

const W = 320, H = 180, FPS = 10, SEC = 8;
async function make(file, frame, sound) {
  const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-f', 'lavfi', '-i', sound, '-c:v', 'libvpx', '-b:v', '2M', ...audio, '-shortest', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err.trim()}`)))));
  for (let f = 0; f < FPS * SEC; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
}
const SETS = [[[240, 30, 20]], [[20, 60, 240]], [[30, 220, 40]], [[240, 200, 20]]];
const cutTakes = SETS.map((c, i) => blobTake(21 + i, [...c, [c[0][1], c[0][2], c[0][0]]], 0.5, W, H));
const vivid = blobTake(6, [[250, 80, 10], [230, 10, 160], [250, 220, 30], [10, 200, 240]], 0.8, W, H);
const calm = blobTake(2, [[60, 40, 30], [40, 50, 60], [50, 40, 55]], 0.1, W, H);
const CLICK = `aevalsrc='0.5*sin(2*PI*60*t)*exp(-30*mod(t\\,0.5))+0.3*sin(2*PI*1500*t)*exp(-80*mod(t\\,0.5))':s=44100:d=${SEC}`;
const folder = path.join(dir, 'takes');
fs.mkdirSync(folder);
await make(path.join(folder, 'a-fast cuts.webm'), f => cutTakes[Math.floor(f / FPS) % 4](f % FPS), CLICK);
await make(path.join(folder, 'b-vivid.webm'), vivid, `sine=f=220:d=${SEC}`);
await make(path.join(folder, 'c-calm.webm'), calm, `sine=f=180:d=${SEC}`);
fs.writeFileSync(path.join(folder, 'd-broken.mp4'), Buffer.from('this is not a video'));
fs.writeFileSync(path.join(folder, 'notes.txt'), 'not a video either, and not picked up');

// ─── (a) the batch ───────────────────────────────────────────────────────────
const out = path.join(dir, 'batch');
const res = await runBatch(folder, { out, quiet: true, rate: 4, frames: 8 }, watchVideo, { ff });
const rows = res.rows;
const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
check('(a) four rows, the text file not picked up', rows.length === 4, rows.map(r => r.key).join(', '));
check('(a) the broken file has a row that says why, at the bottom', rows.at(-1).key === 'd-broken' && !!rows.at(-1).error, rows.at(-1).error?.split('\n')[0]);
const okRows = rows.filter(r => !r.error);
check('(a) the batch went on past it: three clips watched', okRows.length === 3);
const probe = f => JSON.parse(spawnSync(ff.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }).stdout || '{}');
const clipsOk = okRows.map(r => {
  const p = probe(path.join(out, r.key, 'rate.mp4'));
  return { key: r.key, report: fs.existsSync(path.join(out, r.key, 'report.html')), h264: p.streams?.some(s => s.codec_name === 'h264'), dur: Number(p.format?.duration), span: r.span };
});
check('(a) every clip has its report and a rate.mp4 in H.264 of the watched length', clipsOk.every(c => c.report && c.h264 && near(c.dur, c.span, 0.35)), JSON.stringify(clipsOk.map(c => [c.key, c.report, c.h264, c.dur?.toFixed(2), c.span?.toFixed(2)])));
const files = ['batch.md', 'batch.csv', 'batch.json', 'index.html', 'rate.html'];
check('(a) batch.md, batch.csv, batch.json, index.html and rate.html written', files.every(f => fs.existsSync(path.join(out, f))), files.filter(f => !fs.existsSync(path.join(out, f))).join(', '));
const csv = fs.readFileSync(path.join(out, 'batch.csv'), 'utf8').trim().split('\n');
check('(a) batch.csv: a header and a row a clip', csv.length === 5 && /^rank,clip,input/.test(csv[0]), `${csv.length} lines`);
const idx = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
check('(a) index.html links each clip\'s report and the rating page', okRows.every(r => idx.includes(`href="${encodeURI(`${r.key}/report.html`)}"`)) && idx.includes('href="rate.html"'));

// ─── (b) ranking ─────────────────────────────────────────────────────────────
const fast = byKey['a-fast-cuts'], viv = byKey['b-vivid'], cal = byKey['c-calm'];
check('(b) the fast cutter has its cuts, the takes none', fast?.shots >= 7 && viv?.shots === 1 && cal?.shots === 1, `${fast?.shots}, ${viv?.shots}, ${cal?.shots}`);
const allScored = okRows.every(r => r.score != null);
check('(b) by default: colourfulness when not every clip has a card (the calm take gets none)', !allScored && res.rankedBy === 'colour' && rows.indexOf(viv) < rows.indexOf(cal), `${res.rankedBy}; scored ${okRows.filter(r => r.score != null).map(r => r.key).join(', ') || 'none'}`);
const [byColour] = rankRows(rows, 'colour');
check('(b) by colour: the vivid take above the calm one, the broken file last', byColour.indexOf(viv) < byColour.indexOf(cal) && byColour.at(-1).error, byColour.map(r => `${r.key} ${r.colourfulness?.toFixed(0)}`).join(', '));
const [byPace, kp, labelPace] = rankRows(rows, 'pace');
check('(b) --rank pace puts the fast cutter first and says so', byPace[0] === fast && kp === 'pace' && /cuts a minute/.test(labelPace), byPace.map(r => r.key).join(', '));
const md = fs.readFileSync(path.join(out, 'batch.md'), 'utf8');
check('(b) the table\'s heading names its measure', /^Ranked by colourfulness \(--rank colour\)\./m.test(md), (md.match(/^Ranked by.*/m) ?? [''])[0]);

// ─── (c) where a batch comes from ────────────────────────────────────────────
fs.writeFileSync(path.join(dir, 'list.txt'), `# my clips\ntakes/b-vivid.webm\n\nhttps://example.org/v/1\ntakes/c-calm.webm\n`);
const li = batchItems(path.join(dir, 'list.txt'));
check('(c) a list file: paths from its folder, links kept, comments skipped', li.length === 3 && li[0].input === path.join(folder, 'b-vivid.webm') && li[1].input === 'https://example.org/v/1', JSON.stringify(li));
const pl = batchItems('https://example.org/playlist?list=x', { listPlaylist: () => [{ input: 'https://example.org/v/1', name: 'First' }, { input: 'https://example.org/v/2', name: 'First' }] });
const keys = clipKeys(pl);
check('(c) a playlist\'s entries, two of one name in two folders', pl.length === 2 && keys[0] === 'first' && keys[1] === 'first-2', keys.join(', '));

// ─── (d) the rating page, as a file ──────────────────────────────────────────
const ratePath = path.join(out, 'rate.html');
const rateHtml = fs.readFileSync(ratePath, 'utf8');
const links = [...rateHtml.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('data:') && !u.startsWith('#'));
check('(d) it loads nothing from anywhere: its only files are the clips beside it', links.length === okRows.length && links.every(u => /^[\w.-]+\/rate\.mp4$/.test(u)) && !/<script[^>]+src=/.test(rateHtml) && !/https?:\/\//.test(links.join(' ')), links.join(', '));
const dataJson = JSON.parse(/const DATA=(.*?);\n/.exec(rateHtml)?.[1] ?? 'null');
check('(d) it names every watched clip and carries each one\'s read', dataJson?.clips?.length === 3 && dataJson.clips.every(c => okRows.some(r => r.key === c.key) && c.read && typeof c.read.rms === 'number'), dataJson?.clips?.map(c => c.key).join(', '));

// ─── (f) the refit ───────────────────────────────────────────────────────────
const base = REAL_SHOW_CARDS[2];
const reads = Array.from({ length: 12 }, (_, i) => ({ ...base, name: undefined, title: undefined, colourfulness: 20 + 10 * i, rms: 0.05 + 0.02 * i, forms: 4 + i }));
const marks = reads.map((_, i) => 1 + Math.floor(i / 3));
const rated = order => Object.fromEntries(reads.map((r, i) => [`clip-${i + 1}`, { overall: order[i], read: r }]));
const fit = refit(rated(marks));
check('(f) the fit\'s bands are the clips rated highest', fit.ok && fit.liked.join(',') === 'clip-10,clip-11,clip-12', fit.liked?.join(', '));
check('(f) left-out agreement high, and it is used', fit.used && fit.agreement.leaveOneOut.rho >= 0.6, fit.lines?.[1]);
const shuffled = [3, 1, 4, 2, 2, 4, 1, 3, 1, 3, 4, 2];
const bad = refit(rated(shuffled));
check('(f) with the marks shuffled the left-out agreement falls and it is not used', bad.ok && !bad.used && bad.agreement.leaveOneOut.rho < fit.agreement.leaveOneOut.rho, bad.lines?.find(l => /left out of the fit/.test(l)));
const withHeld = rated(marks);
for (const k of ['clip-2', 'clip-7', 'clip-12']) withHeld[k].heldOut = true;
const fh = refit(withHeld);
check('(f) clips kept aside are never fitted on, and get their own figure', fh.ok && !fh.liked.includes('clip-12') && fh.n === 9 && fh.agreement.heldOut?.n === 3, `${fh.liked?.join(', ')}; held ${JSON.stringify(fh.agreement?.heldOut)}`);
const few = refit(Object.fromEntries(Object.entries(rated(marks)).slice(0, MIN_RATED - 1)));
check(`(f) fewer than ${MIN_RATED} rated clips are refused`, !few.ok && /at least 5/.test(few.lines[0]), few.lines[0]);
// Through the command: the file merged into the library, card-fit.json beside it.
fs.writeFileSync(path.join(dir, 'mine.json'), JSON.stringify(rated(marks)));
const cmd = refitCommand({ input: path.join(dir, 'mine.json'), quiet: true });
check('(f) --refit merges the file into the library and writes card-fit.json beside it', fs.existsSync(path.join(lib, 'ratings.json')) && fs.existsSync(path.join(lib, 'card-fit.json')) && cmd.fit?.used, cmd.lines.slice(0, 2).join(' / '));
const loaded = loadRatings();
check('(f) later runs load the fit', Array.isArray(loaded.cal) && loaded.cal.length === 3 && /^Bands fitted to your ratings/.test(loaded.fitNote ?? ''), loaded.fitNote);
const rf = await watchVideo(path.join(folder, 'c-calm.webm'), { out: path.join(dir, 'calm-fitted'), rate: 4, frames: 8, quiet: true, liquid: false, report: false });
check('(f) footage that gets no card of its own gets the fitted card, and says so first', !!rf.card && /^Bands fitted to your ratings/.test(rf.card.lines[0]), rf.card?.lines?.[0]);
fs.writeFileSync(path.join(dir, 'shuffled.json'), JSON.stringify(rated(shuffled)));
fs.rmSync(path.join(lib, 'ratings.json'));
refitCommand({ input: path.join(dir, 'shuffled.json'), quiet: true });
const after = loadRatings(), fitFile = JSON.parse(fs.readFileSync(path.join(lib, 'card-fit.json'), 'utf8'));
check('(f) a fit that is not used is not loaded: the real-show card stays', Object.keys(after.ratings ?? {}).length === 12 && fitFile.used === false && !after.cal, `${Object.keys(after.ratings ?? {}).length} ratings, used ${fitFile.used}, cal ${!!after.cal}`);

// ─── (g) overall agreement, merging ──────────────────────────────────────────
{
  const card = reportCard(reads[11], { ratings: rated(marks), libDirs: [] });
  check('(g) the card\'s agreement reads the overall mark', card.agreement.Overall?.n === 12 && card.lines.some(l => /Overall rho/.test(l)), JSON.stringify(card.agreement.Overall));
  const m = mergeRatings({ x: { overall: 2, moments: [{ t: 1, note: 'a' }], updatedAt: '2026-11-28T01:00:00Z' } }, { x: { overall: 4, moments: [{ t: 3, note: 'b' }], updatedAt: '2026-11-28T02:00:00Z' } },
    { x: { overall: 1, moments: [{ t: 1, note: 'a' }], updatedAt: '2026-11-27T00:00:00Z' } });
  check('(g) merging: the newest mark wins, every moment kept once', m.x.overall === 4 && m.x.moments?.map(q => q.note).join() === 'a,b', JSON.stringify(m.x));
}

// ─── (h) the notes ───────────────────────────────────────────────────────────
const noted = {
  p: { overall: 1, note: 'It froze near the end', moments: [{ t: 12.4, note: 'froze' }] },
  q: { overall: 2, moments: [{ t: 3.0, note: 'stuck here for ages' }] },
  r: { overall: 1, note: 'frozen, then drained' },
  s: { overall: 5, note: 'lovely colours' },
  t: { overall: 4, note: 'Lovely colour, slow swirls' },
  u: { overall: 4, note: 'magnificent' },
};
const th = noteThemes(noted);
const fz = th.find(t => t.theme === 'freezes'), lv = th.find(t => t.theme === 'colour'), lov = th.find(t => t.theme === 'lovely');
check('(h) froze, stuck and frozen are one theme on three clips', fz?.clips.length === 3, JSON.stringify(fz?.clips));
check('(h) …a candidate fault check, with its moments and its low marks', fz?.candidate && fz.moments.length === 2 && fz.mean < fz.rest - 1, JSON.stringify({ moments: fz?.moments.map(m => `${m.key} ${m.t}`), mean: fz?.mean, rest: fz?.rest }));
check('(h) "lovely colours" on two clips is a theme and no fault', lv?.clips.length === 2 && lov?.clips.length === 2 && !lv.candidate && !lov.candidate, JSON.stringify(th.map(t => t.theme)));
check('(h) a word on one clip is no theme', !th.some(t => t.theme === 'magnificent' || t.theme === 'drained'), th.map(t => t.theme).join(', '));
const okKeys = okRows.map(r => r.key);
const ratedBatch = { [okKeys[0]]: { overall: 2, note: 'froze in the middle' }, [okKeys[1]]: { overall: 1, note: 'frozen', moments: [{ t: 2, note: 'stuck' }] }, [okKeys[2]]: { overall: 5, note: 'froze once but lovely' } };
const wb = writeBatch({ out, title: 'takes', rows, ratings: ratedBatch, ff });
const md2 = fs.readFileSync(path.join(out, 'batch.md'), 'utf8');
check('(h) the table gains the marks and each clip\'s themes; batch.md the themes', /\| you \| notes \|/.test(md2) && /## What your notes keep saying/.test(md2) && /\*\*freezes\*\* on 3 clips/.test(md2) && wb.sorted.length === 4,
  (md2.match(/^\|.*you.*/m) ?? [''])[0]);

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${total} FAIL` : `\nall ${total} ok`);
process.exit(failed ? 1 : 0);
