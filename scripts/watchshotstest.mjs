#!/usr/bin/env node
/**
 * The watch tool's shot list (PLAN 47p-5, scripts/watchshots.mjs).
 *
 *   npm run watchshots
 *
 * An editor asks where the cuts fall, how long the shots run and whether the
 * picture is cut to the music; a colourist whether the shots match. This
 * holds the shot list to films and sounds whose answers are known because
 * they were made here:
 *
 *   (a) the beat tracker on sound alone: a click track at 128 bpm for a
 *       minute (a period, 0.469 s, that is no whole number of the envelope's
 *       10 ms hops, so a fixed grid at the measured tempo would drift off
 *       the clicks within the minute) gives 128 bpm and every beat within
 *       20 ms of its click, the last as close as the first; 90 bpm reads 90,
 *       not its double or half; a steady tone and white noise give no beat;
 *   (b) cutsOnBeat counts a cut 50 ms from a beat as on, one 100 ms off as
 *       off, and chance as twice the tolerance over the period;
 *   (c) end to end, on a 24 s film made here at 30 frames a second with a
 *       click track at 120 bpm and seven hard cuts, five on a beat (3.0,
 *       5.5, 11.0, 17.5, 20.0 s) and two off it (8.25 s, a quarter beat off,
 *       and 14.1 s, 100 ms off): watched at four samples a second, seven
 *       cuts are found, each to within one frame of where it was made (the
 *       samples alone put them up to a quarter second late), 5 of 7 are on a
 *       beat at 120 bpm, against 2.0 by chance; eight shots whose lengths
 *       are the made ones within a frame; shots.csv holds them; the summary,
 *       design.json and report.html say so;
 *   (d) each shot's palette is its own: the red shot's colours are red and
 *       hold no blue, the blue shot's the other way about;
 *   (e) the same film without its sound says "no sound", and with a steady
 *       tone "no steady beat", and neither counts a cut on a beat;
 *   (f) a dissolve is a shot boundary but not a cut on a beat (rows made by
 *       hand, so the count is the tool's and not the dissolve finder's).
 *
 * Mutants (each tried by hand, 2026-11-28, and each turned this red): the
 * grid in place of the tracker (a), cut times left at the sample (c), the
 * tolerance doubled (b and c), the palette taken over the whole clip (d),
 * dissolves counted as cuts (f). In the sound shard for its ffmpeg. About
 * half a minute.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchVideo, findFfmpeg } from './watch.mjs';
import { onsetEnvelope, trackBeats, cutsOnBeat, shotList, BEAT_TOL } from './watchshots.mjs';
import { blobTake } from './watchreadtest.mjs';
import { clipAudio, ffmpegVersion } from './watchffmpeg.mjs';

let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ─── (a) beats from sound alone ──────────────────────────────────────────────
const SR = 8000;
function clicks(bpm, seconds, { drone = 0.05, noise = 0 } = {}) {
  const a = new Int16Array(SR * seconds), P = 60 / bpm;
  let s = 1;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR, ph = t % P;
    const n = noise ? ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise : 0;
    a[i] = Math.round(32767 * Math.max(-1, Math.min(1, 0.5 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-30 * ph) + 0.3 * Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-80 * ph) + drone * Math.sin(2 * Math.PI * 220 * t) + n)));
  }
  return a;
}
{
  const b = trackBeats(onsetEnvelope(clicks(128, 60)));
  const P = 60 / 128;
  const errs = b.beats.map(t => { const k = Math.round(t / P); return Math.abs(t - k * P); });
  const late = errs.slice(-10);
  check('(a) 128 bpm reads 128', b.bpm && near(b.bpm, 128, 2), `${b.bpm?.toFixed(1)} bpm`);
  check('(a) every beat within 20 ms of its click over the minute, the last ten too (no drift)', errs.length > 100 && Math.max(...errs) <= 0.02 && Math.max(...late) <= 0.02,
    `${errs.length} beats, worst ${(Math.max(...errs) * 1000).toFixed(0)} ms, last ten worst ${(Math.max(...late) * 1000).toFixed(0)} ms`);
  const b90 = trackBeats(onsetEnvelope(clicks(90, 30)));
  check('(a) 90 bpm reads 90, not its double or half', b90.bpm && near(b90.bpm, 90, 2), `${b90.bpm?.toFixed(1)} bpm`);
  const tone = new Int16Array(SR * 20).map((_, i) => Math.round(12000 * Math.sin(2 * Math.PI * 220 * i / SR)));
  const noise = clicks(120, 20, { drone: 0, noise: 0.4 }).map((v, i) => { let s = (i * 2654435761) >>> 0; s ^= s >>> 13; return Math.round(((s % 20000) - 10000) * 1.2); });
  check('(a) a steady tone has no beat', trackBeats(onsetEnvelope(tone)).bpm == null, `${trackBeats(onsetEnvelope(tone)).bpm}`);
  const nb = trackBeats(onsetEnvelope(noise));
  check('(a) white noise has no beat', nb.bpm == null, `${nb.bpm?.toFixed(1)}`);
}

// ─── (b) on a beat or not ────────────────────────────────────────────────────
{
  const beat = { beats: [0, 0.5, 1, 1.5, 2], period: 0.5, bpm: 120 };
  const c = cutsOnBeat([0.55, 1.1, 1.97], beat);
  check('(b) 50 ms and 30 ms from a beat are on, 100 ms is off', c.on === 2 && c.of === 3, `${c.on} of ${c.of}, offsets ${c.offsets.map(x => x.toFixed(2)).join(', ')}`);
  check('(b) chance is twice the tolerance over the period', near(c.chance, (2 * BEAT_TOL) / 0.5, 1e-9), `${c.chance}`);
  check('(b) no beat, no count', cutsOnBeat([1], { beats: [], period: null }) === null);
}

// ─── (c)–(e) end to end ──────────────────────────────────────────────────────
const ff = findFfmpeg();
const audio = clipAudio(ff);
if (!audio) { console.log(`FAIL no libvorbis or libopus in ${ffmpegVersion(ff)}`); process.exit(1); }
const W = 320, H = 180, FPS = 30, SEC = 24;
const CUTS = [3.0, 5.5, 8.25, 11.0, 14.1, 17.5, 20.0];
const ON = [true, true, false, true, false, true, true];
const SETS = [
  [[240, 30, 20], [200, 60, 10]],            // red
  [[20, 60, 240], [10, 120, 220]],           // blue
  [[30, 220, 40], [120, 230, 20]],           // green
  [[240, 200, 20], [250, 140, 10]],          // amber
  [[200, 20, 200], [140, 30, 230]],          // violet
  [[20, 220, 220], [30, 160, 200]],          // cyan
  [[240, 30, 20], [200, 60, 10]],            // red again
  [[230, 230, 230], [180, 180, 200]],        // white
];
const takes = SETS.map((c, i) => blobTake(11 + i, c, 0.6, W, H));
const shotOf = t => CUTS.filter(c => t >= c - 1e-9).length;
// Frame f shows the take for its own time; a cut at t lands on frame round(t * FPS).
const frame = f => { const i = shotOf(f / FPS + 1e-6); return takes[i](f - (i ? Math.round(CUTS[i - 1] * FPS) : 0)); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchshots-'));
async function make(file, sound) {
  const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    ...(sound ? ['-f', 'lavfi', '-i', sound] : []), '-c:v', 'libvpx', '-b:v', '3M', ...(sound ? [...audio, '-shortest'] : ['-an']), file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err.trim()}`)))));
  for (let f = 0; f < FPS * SEC; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
}
const CLICK = `aevalsrc='0.5*sin(2*PI*60*t)*exp(-30*mod(t\\,0.5))+0.3*sin(2*PI*1500*t)*exp(-80*mod(t\\,0.5))+0.05*sin(2*PI*220*t)':s=44100:d=${SEC}`;
const film = path.join(dir, 'film.webm'), mute = path.join(dir, 'mute.webm'), drone = path.join(dir, 'drone.webm');
await make(film, CLICK);
await make(mute, null);
await make(drone, `sine=f=220:d=${SEC}`);

const out = path.join(dir, 'out');
const r = await watchVideo(film, { out, rate: 4, frames: 12, quiet: true, liquid: false });
const s = r.shots;
const hard = s.shots.filter(x => x.startsWith === 'cut');
check('(c) seven hard cuts found', hard.length === 7, `${hard.length}: ${hard.map(x => x.start.toFixed(3)).join(', ')}`);
const frameErr = hard.map((x, i) => Math.abs(x.start - Math.round(CUTS[i] * FPS) / FPS));
check('(c) each cut within one frame of where it was made', hard.length === 7 && Math.max(...frameErr) <= 1 / FPS + 1e-3, `worst ${(Math.max(...frameErr) * 1000).toFixed(0)} ms`);
const sampleErr = r.cuts.map((k, i) => Math.abs(r.rows[k].t - CUTS[i]));
check('(c) …where the samples alone were coarser', Math.max(...sampleErr) > 1 / FPS + 1e-3, `samples' worst ${(Math.max(...sampleErr) * 1000).toFixed(0)} ms`);
check('(c) 5 of 7 cuts on a beat at 120 bpm', s.onBeat?.on === 5 && s.onBeat?.of === 7 && near(s.beat?.bpm ?? 0, 120, 2), `${s.onBeat?.on} of ${s.onBeat?.of} at ${s.beat?.bpm?.toFixed(1)} bpm`);
check('(c) the right five', hard.length === 7 && hard.every((x, i) => x.onBeat === ON[i]), hard.map(x => `${x.start.toFixed(2)} ${x.onBeat ? 'on' : 'off'} (${(x.beatOffset * 1000).toFixed(0)} ms)`).join(', '));
const want = [0, ...CUTS, SEC].map(t => Math.round(t * FPS) / FPS);
const lenErr = s.shots.map((x, i) => Math.abs(x.length - (want[i + 1] - want[i])));
check('(c) eight shots, their lengths the made ones within a frame', s.count === 8 && Math.max(...lenErr) <= 1 / FPS + 0.01, `${s.count} shots, worst ${(Math.max(...lenErr) * 1000).toFixed(0)} ms; average ${s.avg.toFixed(2)} s`);
const csv = fs.existsSync(path.join(out, 'shots.csv')) ? fs.readFileSync(path.join(out, 'shots.csv'), 'utf8').trim().split('\n') : [];
check('(c) shots.csv: a header and a row a shot', csv.length === 9 && /^shot,start_s,end_s,length_s,starts_with,on_beat/.test(csv[0]), `${csv.length} lines`);
const summary = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
check('(c) the summary says it, chance beside it', /- shots: 8 shots, average 3\.0 s .*5 of 7 hard cuts on a beat .* at about 120 bpm, against 2 by chance \(28%\)/.test(summary), (summary.match(/- shots:.*/) ?? [''])[0]);
const dj = JSON.parse(fs.readFileSync(path.join(out, 'design.json'), 'utf8'));
check('(c) design.json carries the list', dj.shots?.count === 8 && dj.shots?.onBeat?.on === 5 && !('lines' in dj.shots), `${dj.shots?.count}`);
const page = fs.readFileSync(path.join(out, 'report.html'), 'utf8');
const ids = [...page.matchAll(/<section id="([^"]+)"/g)].map(m => m[1]);
check('(c) report.html has the shot list after the timeline', ids.includes('timeline') && ids[ids.indexOf('timeline') + 1] === 'shots' && (page.match(/<tr><td>\d+<\/td><td>\d:\d\d\.\d/g) ?? []).length === 8, ids.join(', '));

// (d) palettes: shot 1 red, shot 2 blue.
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const colours = sh => sh.palette.map(c => hexRGB(c.colour)).filter(([R, G, B]) => Math.max(R, G, B) > 80);
const red = colours(s.shots[0]), blue = colours(s.shots[1]);
check('(d) the red shot\'s colours are red, none blue', red.length > 0 && red.every(([R, , B]) => R > B), JSON.stringify(s.shots[0].palette));
check('(d) the blue shot\'s colours are blue, none red', blue.length > 0 && blue.every(([R, , B]) => B > R), JSON.stringify(s.shots[1].palette));

// (e) no sound, no beat.
const rm = await watchVideo(mute, { out: path.join(dir, 'mute'), rate: 4, frames: 12, quiet: true, report: false });
check('(e) without sound: "no sound", no count', /no sound, so no beat/.test(rm.shots.lines[0]) && rm.shots.onBeat == null && rm.shots.count === 8, rm.shots.lines[0]);
const rd = await watchVideo(drone, { out: path.join(dir, 'drone'), rate: 4, frames: 12, quiet: true, report: false });
check('(e) with a steady tone: "no steady beat", no count', /no steady beat/.test(rd.shots.lines[0]) && rd.shots.onBeat == null, rd.shots.lines[0]);

// ─── (f) a dissolve is a boundary, not a cut on a beat ───────────────────────
{
  const rate = 4, n = 40;
  const rows = Array.from({ length: n }, (_, k) => ({ t: k / rate, motion: 1, hist: Array(64).fill(1 / 64) }));
  const cuts = [8, 20, 32];
  rows[8].cut = rows[32].cut = true;
  rows[20].cut = rows[20].dissolve = true;
  for (let j = 17; j <= 23; j++) rows[j].fade = true;
  const pcm = clicks(120, 10);
  const sl = await shotList({ rows, cuts, dissolves: [{ from: 16, to: 23, mid: 20 }], rate, pcm, end: 10 });
  check('(f) four shots, one after a dissolve', sl.count === 4 && sl.shots[2].startsWith === 'dissolve', sl.shots.map(x => x.startsWith).join(', '));
  check('(f) the beat count is the two hard cuts only', sl.onBeat?.of === 2, `${sl.onBeat?.on} of ${sl.onBeat?.of}`);
  check('(f) cut times stay at the sample with no picture to read, and say so', /to the sample only/.test(sl.lines[0]), sl.lines[0]);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${total} FAIL` : `\nall ${total} ok`);
process.exit(failed ? 1 : 0);
