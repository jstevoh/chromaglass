#!/usr/bin/env node
/**
 * The watch tool's page for a person and its best moment (PLAN 47p-4).
 *
 *   npm run watchreport
 *
 * Every run now writes report.html (one self-contained page) and the clip's
 * strongest 10-15 s and frame as best.mp4 and best.png
 * (scripts/watchreport.mjs says why and how they are chosen). This holds:
 *
 *   (a) the choice on rows made to have one answer: a 120 s clip, calm and
 *       grey, with 12 s of colour and motion at 70 s, gets its window on those
 *       12 s and its still inside them; the same burst at 20 s moves the window
 *       to 20 s (so the window follows the picture, not a fixed place); with
 *       sound, a loud passage pulls the window when the picture is level;
 *   (b) a title card, however bright and busy, is never the best moment;
 *   (c) a window wins without a cut inside it over one with cuts, and a cut
 *       just inside the window's start moves the window to start on it;
 *   (d) a clip shorter than 10 s is all of it, and the window is 10 to 15 s
 *       whatever is asked;
 *   (e) end to end, on a 34 s film made here (a calm dim take, a hard cut at
 *       16 s into 12 s of bright, fast dye with loud sound, a cut back at
 *       28 s): the window is 16 to 28 s; best.mp4 is 12 s with picture and
 *       sound, and its first frame is the source's frame at 16 s, not one a
 *       second off; best.png is the source's frame at its time, at the source's
 *       size; its sound is the window's; summary.md and design.json name
 *       the moment;
 *  (e2) the same film watched from 8 s with a crop: the window is the same
 *       seconds of the file, and the clip and still are the crop, the clip
 *       beginning on the source's cropped frame;
 *   (f) report.html: opens on a phone (viewport, pictures that shrink, tables
 *       that scroll), holds every picture inside it (no file, no link, no
 *       script), the clip both beside it and inside it, its sections in
 *       reading order with one figure per contact sheet, the summary's words,
 *       and no folder of the machine that made it; the page's title and
 *       description from the video's page are escaped, so a title holding
 *       markup shows as text;
 *   (g) `--no-report` writes none of the three and clears the last run's from
 *       the folder;
 *   (h) piece 5's way in: an extra section placed after a named one lands
 *       there, in the order given.
 *
 * Each choice rule (a cut's cost, a title's exclusion, shared ranks for ties,
 * the still's choice and its exclusions) and each seek was broken by hand once
 * and turned this red (2026-11-28). In the sound shard for its ffmpeg. About
 * half a minute.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchVideo, findFfmpeg } from './watch.mjs';
import { bestMoment, mdToHtml, renderPage, reportSections, writeReport, BEST_MIN, BEST_MAX, BEST_EMBED_BYTES } from './watchreport.mjs';
import { blobTake } from './watchreadtest.mjs';
import { clipAudio, ffmpegVersion } from './watchffmpeg.mjs';

let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ─── (a)-(d) the choice, on rows ─────────────────────────────────────────────
// Rows as watch.mjs makes them: a calm, grey clip whose measures wobble a
// little (so ranks are not all ties), with stretches set to stand out.
function rowsOf(sec, rate, edit = () => {}) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rows = [];
  for (let k = 0; k < sec * rate; k++) {
    const r = { t: k / rate, motion: 0.4 + 0.2 * rnd(), colour: 0.1 + 0.05 * rnd(), dark: 0.3 + 0.05 * rnd(), bright: 0.01, sat: 0.2, title: false, cut: false, fade: false };
    edit(r, k / rate, k);
    rows.push(r);
  }
  return rows;
}
const RATE = 4;
const burstAt = at => (r, t) => { if (t >= at && t < at + 12) Object.assign(r, { motion: 2 + 0.01 * Math.cos(7 * t), colour: 0.6 + 0.1 * Math.sin(t), dark: 0.1 }); };
{
  const b70 = bestMoment(rowsOf(120, RATE, burstAt(70)), { rate: RATE });
  check('(a) a burst of colour and motion at 70 s is the window', b70.from === 70 && b70.to === 82, `${b70.from}-${b70.to}`);
  // The still: one sample of the burst, 75.25 s, the most coloured and lit;
  // brighter still are a dissolve's sample, a dissolve's middle (a cut) and
  // the sample after it, none of which a still may be (a dissolve costs the
  // window nothing, so the window stays where it was).
  const stillRows = rowsOf(120, RATE, (r, t) => {
    burstAt(70)(r, t);
    if (t === 75.25) Object.assign(r, { colour: 0.9, dark: 0.02 });
    if (t === 78) Object.assign(r, { colour: 1, dark: 0, fade: true });
    if (t === 78.75) Object.assign(r, { colour: 1, dark: 0, cut: true, dissolve: true });
    if (t === 79) Object.assign(r, { colour: 1, dark: 0 });
  });
  const st = bestMoment(stillRows, { rate: RATE });
  check('(a) its still is the burst\'s most coloured, lit frame, never a cut, a dissolve or the frame after a cut', st.from === 70 && st.at === 75.25, `${st.from}, still ${st.at}`);
  const b20 = bestMoment(rowsOf(120, RATE, burstAt(20)), { rate: RATE });
  check('(a) the same burst at 20 s moves the window there', near(b20.from, 20, 0.26), `${b20.from}`);
  const loud = bestMoment(rowsOf(120, RATE, (r, t) => { r.loud = t >= 40 && t < 52 ? -10 : -40 + (t % 3); }), { rate: RATE });
  check('(a) with the picture level, the loud passage is the window', near(loud.from, 40, 0.26), `${loud.from}`);
  // A flat track on a level picture: ties must share their rank, or the
  // samples would rank by position and every window lean to the clip's end.
  const level = bestMoment(rowsOf(120, RATE), { rate: RATE }), flat = bestMoment(rowsOf(120, RATE, r => { r.loud = -30; }), { rate: RATE });
  check('(a) a flat sound track moves nothing', level.from === flat.from && level.at === flat.at, `${level.from} vs ${flat.from}`);

  // (b) A title card from 60 s, bright, coloured and busy, straight before an
  // 8 s burst: a window over the card and the burst would hold only burst
  // samples once the card's are left out of the measures, and beat any window
  // that has to take calm samples after the burst. It must still not win.
  const titled = bestMoment(rowsOf(120, RATE, (r, t) => {
    if (t >= 70 && t < 78) Object.assign(r, { motion: 2, colour: 0.7, dark: 0.1 });
    if (t >= 60 && t < 70) Object.assign(r, { title: true, motion: 5, colour: 0.9, dark: 0 });
  }), { rate: RATE });
  check('(b) a title card is never in the best moment', titled.from >= 70 || titled.to <= 60, `${titled.from}-${titled.to}`);

  // (c) Two bursts, the one at 20 s a little stronger but with two cuts
  // inside: the clean one wins, and would not without the cost of a cut.
  const cutRows = rowsOf(120, RATE, (r, t) => { burstAt(20)(r, t); burstAt(70)(r, t); if (t >= 20 && t < 32) { r.motion += 0.2; r.colour += 0.05; } if (near(t, 24, 0.01) || near(t, 27, 0.01)) r.cut = true; });
  const clean = bestMoment(cutRows, { rate: RATE });
  check('(c) the burst without cuts inside wins', near(clean.from, 70, 0.26) && clean.cuts === 0, `${clean.from}, ${clean.cuts} cuts`);
  // A burst from 50.5 s (rows at quarter seconds) whose first second is
  // ahead of a cut at 51.5 s: the window starts on the cut.
  const edgeRows = rowsOf(120, RATE, (r, t) => { if (t >= 50.5 && t < 63) Object.assign(r, { motion: 2, colour: 0.7, dark: 0.1 }); if (t === 51.5) r.cut = true; });
  const edge = bestMoment(edgeRows, { rate: RATE });
  check('(c) a cut just inside the start moves the window onto it', edge.from === 51.5 && edge.cuts === 0, `${edge.from}, ${edge.cuts} cuts`);

  // (d) Lengths.
  const short = bestMoment(rowsOf(6, RATE), { rate: RATE });
  check('(d) a 6 s clip is all of it', short.from === 0 && near(short.to, 6, 1e-9), `${short.from}-${short.to}`);
  const lens = [3, 12, 40].map(s => { const b = bestMoment(rowsOf(60, RATE), { rate: RATE, seconds: s }); return b.to - b.from; });
  check('(d) the window is 10 to 15 s whatever is asked', lens.join(',') === `${BEST_MIN},12,${BEST_MAX}`, lens.join(', '));
  check('(d) no rows, no moment', bestMoment([], { rate: RATE }) === null);
}

// ─── (e) end to end ──────────────────────────────────────────────────────────
const ff = findFfmpeg();
const audio = clipAudio(ff);
if (!audio) { console.log(`FAIL no libvorbis or libopus in ${ffmpegVersion(ff)}`); process.exit(1); }
const W = 320, H = 180, FPS = 10, SEC = 34;
const calm = blobTake(2, [[60, 40, 30], [40, 50, 60], [50, 40, 55]], 0.08, W, H);
const vivid = blobTake(6, [[250, 80, 10], [230, 10, 160], [250, 220, 30], [10, 200, 240]], 1.6, W, H);
const frame = f => (f / FPS >= 16 && f / FPS < 28 ? vivid(f - 16 * FPS - 60) : calm(f));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchreport-'));
const film = path.join(dir, 'film.webm');
{
  const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-f', 'lavfi', '-i', `sine=f=220:d=${SEC},volume='if(between(t,16,28),1,0.05)':eval=frame`, '-c:v', 'libvpx', '-b:v', '3M', ...audio, '-shortest', film], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err.trim()}`)))));
  for (let f = 0; f < FPS * SEC; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
}
// The page's own words, as a fetched video's sidecar holds them: written by
// whoever uploaded it, so markup in them must reach the page as text.
const HOSTILE = '<img src=x onerror=alert(1)> Oils & "dyes"';
fs.writeFileSync(path.join(dir, 'film.info.json'), JSON.stringify({ title: HOSTILE, uploader: 'someone <b>bold</b>', webpage_url: 'https://example.org/v', description: 'a <script>alert(2)</script> show' }));

const out = path.join(dir, 'out');
const r = await watchVideo(film, { out, rate: 10, frames: 12, quiet: true, liquid: true });
const b = r.best;
check('(e) the window is the bright 12 s, 16 to 28 s, with no cut inside', b && near(b.from, 16, 0.05) && near(b.to - b.from, 12, 1e-9) && b.cuts === 0, b && `${b.from}-${b.to}, ${b.cuts} cuts: ${b.why}`);
check('(e) its still is inside them, not on the cut', b && b.at > 16 && b.at < 28 && !r.rows[b.k].cut, b && `${b.at}`);

const probe = f => JSON.parse(spawnSync(ff.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }).stdout || '{}');
const clip = path.join(out, 'best.mp4'), still = path.join(out, 'best.png');
const pc = fs.existsSync(clip) ? probe(clip) : {};
const vStream = pc.streams?.find(s => s.codec_type === 'video'), aStream = pc.streams?.find(s => s.codec_type === 'audio');
check('(e) best.mp4 is 12 s', near(Number(pc.format?.duration), 12, 0.25), `${pc.format?.duration}`);
check('(e) best.mp4 has picture (H.264) and sound', vStream?.codec_name === 'h264' && !!aStream, `${vStream?.codec_name}, ${aStream?.codec_name ?? 'no sound'}`);
// Its sound is the window's: as loud as the source over the window, and well
// above the quiet take before it (the film's sound is 26 dB down outside it).
const volume = (file, from, dur) => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync(ff, ['-hide_banner', ...(from != null ? ['-ss', String(from), '-t', String(dur)] : []), '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)?.[1]);
const vClip = volume(clip), vWin = volume(film, b.from, b.to - b.from), vQuiet = volume(film, 4, 12);
check('(e) its sound is the window\'s', near(vClip, vWin, 1.5) && vClip > vQuiet + 15, `${vClip} dB, the window ${vWin} dB, the quiet take ${vQuiet} dB`);
// A frame as small RGB, from a file at a time.
const grab = (file, t) => spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 24 }).stdout;
const diff = (x, y) => { if (!x?.length || x.length !== y?.length) return Infinity; let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
const first = grab(clip, 0);
const dHere = diff(first, grab(film, b.from + 0.02)), dLater = diff(first, grab(film, b.from + 1.02));
check('(e) the clip begins on the source\'s frame at its start, not a second later', dHere < 6 && dLater > 3 * dHere + 2, `${dHere.toFixed(1)} vs ${dLater.toFixed(1)}`);
const ps = fs.existsSync(still) ? probe(still).streams?.[0] : null;
check('(e) best.png is at the source\'s size', ps?.width === W && ps?.height === H, `${ps?.width}x${ps?.height}`);
const dStill = diff(grab(still, 0), grab(film, b.at + 0.02)), dStillOff = diff(grab(still, 0), grab(film, b.at + 1.02));
check('(e) best.png is the source\'s frame at its time', dStill < 6 && dStillOff > 2 * dStill + 1, `${dStill.toFixed(1)} vs ${dStillOff.toFixed(1)}`);
const md = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
const dj = JSON.parse(fs.readFileSync(path.join(out, 'design.json'), 'utf8'));
check('(e) summary.md names the moment and the page', /^- best moment: 0:16\.\d to 0:28\.\d/m.test(md) && md.includes('report.html'), md.match(/^- best moment.*$/m)?.[0]);
check('(e) design.json holds the moment for a later batch', dj.best?.from === b.from && dj.best?.to === b.to && dj.best?.at === b.at);

// ─── (f) the page ────────────────────────────────────────────────────────────
const html = fs.existsSync(path.join(out, 'report.html')) ? fs.readFileSync(path.join(out, 'report.html'), 'utf8') : '';
check('(f) report.html written', html.length > 1000, `${(html.length / 1024).toFixed(0)} KB`);
check('(f) it opens on a phone: viewport, pictures shrink, tables scroll',
  /<meta name="viewport" content="width=device-width/.test(html) && /img,video\{[^}]*max-width:100%/.test(html) && /<div class="scroll"><table>/.test(html));
const srcs = [...html.matchAll(/<(img|source|script|link|iframe)\b[^>]*>/g)].map(m => m[0]);
const imgs = srcs.filter(t => t.startsWith('<img'));
// The timeline, every sheet, the palette and the best frame: an <img> whose
// picture could not be read is left out of the page, so count them.
const wantImgs = 1 + r.sheets.length + 1 + 1;
check('(f) every picture is inside the page', imgs.length === wantImgs && imgs.every(t => /src="data:image\/(jpeg|png);base64,/.test(t)), `${imgs.length} of ${wantImgs} pictures`);
const tlUri = /<section id="timeline">[\s\S]*?src="data:image\/jpeg;base64,([^"]+)"/.exec(html)?.[1];
const tlDims = tlUri ? (() => { const f = path.join(dir, 'tl.jpg'); fs.writeFileSync(f, Buffer.from(tlUri, 'base64')); return probe(f).streams?.[0]; })() : null;
const tlPng = probe(r.timeline).streams?.[0];
check('(f) the timeline on the page is the run\'s timeline', tlDims?.width === tlPng?.width && tlDims?.height === tlPng?.height, `${tlDims?.width}x${tlDims?.height} vs ${tlPng?.width}x${tlPng?.height}`);
check('(f) no script, stylesheet link or frame', !srcs.some(t => /^<(script|link|iframe)/.test(t)) && !/<script/i.test(html));
const sources = srcs.filter(t => t.startsWith('<source'));
const embedded = /src="data:video\/mp4;base64,([^"]+)"/.exec(html)?.[1];
check('(f) the clip is beside the page and inside it', sources.some(t => t.includes('src="best.mp4"')) && !!embedded && Buffer.from(embedded, 'base64').equals(fs.readFileSync(clip)), sources.map(t => t.slice(0, 40)).join(' | '));
{
  // A clip over the embedding bar is only beside the page (a sparse file:
  // its size is what is read).
  const big = path.join(dir, 'big.mp4');
  fs.writeFileSync(big, '');
  fs.truncateSync(big, BEST_EMBED_BYTES + 1);
  const secs = reportSections({ best: b, bestFiles: { clip: big } });
  const bestHtml = secs.find(x => x.id === 'best')?.html ?? '';
  check('(f) a clip over 8 MB is beside the page, not inside it', bestHtml.includes('src="best.mp4"') && !bestHtml.includes('data:video'));
}
const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map(m => m[1]);
// The shot list (47p-5) is piece 5's section, placed after the timeline by writeReport's `extra`.
check('(f) its sections, in reading order', ids.join(',') === 'best,timeline,shots,read,words,numbers,sheets,detail', ids.join(','));
const sheetFigs = (html.split('<section id="sheets">')[1] ?? '').split('</section>')[0].match(/<figure><img src="data:image\//g)?.length ?? 0;
check('(f) one figure per contact sheet', sheetFigs === r.sheets.length && r.sheets.length > 0, `${sheetFigs} of ${r.sheets.length}`);
// Every line of the words, as text, inside the words section.
const textOf = h => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const wordsText = textOf((html.split('<section id="words">')[1] ?? '').split('</section>')[0]);
const wordLines = r.words.lines.filter(l => l.trim()).map(l => l.replace(/^\s*[-*]\s+/, '').replace(/^#+\s+/, '').replace(/\*\*|`/g, '').trim());
const missing = wordLines.filter(l => !wordsText.includes(l));
check('(f) every line of the summary\'s words is on it', wordLines.length >= 3 && !missing.length, missing[0] ?? `${wordLines.length} lines`);
check('(f) the report card is on it, for a liquid read', /<h3>Report card<\/h3>/.test(html) && textOf(html).includes(r.card.lines[0].replace(/\*\*|`/g, '')));
check('(f) it names no folder of the machine that made it', !html.includes(dir) && !html.includes(os.homedir() + '/') && /file: film\.webm/.test(html));
check('(f) the video page\'s title and words are escaped',
  html.includes('&lt;img src=x onerror=alert(1)&gt; Oils &amp; &quot;dyes&quot;') && !html.includes('<img src=x') && html.includes('&lt;script&gt;') && html.includes('&lt;b&gt;bold') && !html.includes('<b>bold'));
check('(f) Markdown is escaped before it is marked up', mdToHtml(['# a <b>', '- **x** & `<y>`']) === '<h2>a &lt;b&gt;</h2>\n<ul><li><strong>x</strong> &amp; <code>&lt;y&gt;</code></li></ul>');

// ─── (e2) a crop and a start ─────────────────────────────────────────────────
// Rows carry the file's own seconds (opt.from + k/rate) and the clip seeks by
// them; the clip and the still are cut to the run's crop as every picture is.
{
  const out2 = path.join(dir, 'out2');
  const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };
  const rc = await watchVideo(film, { out: out2, from: 8, rate: 10, frames: 6, quiet: true, liquid: true, crop });
  const bc = rc.best;
  const cw = W * crop.w, cropF = `crop=${cw}:${H}:${W * crop.x}:0`;
  const grabC = (file, t, vf) => spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 24 }).stdout;
  const p2 = probe(path.join(out2, 'best.png')).streams?.[0], c2 = probe(path.join(out2, 'best.mp4')).streams?.find(x => x.codec_type === 'video');
  check('(e2) from 8 s, the window is still 16 to 28 s of the file', bc && near(bc.from, 16, 0.05) && bc.cuts === 0, bc && `${bc.from}-${bc.to}`);
  check('(e2) the still and the clip are the crop', p2?.width === cw && p2?.height === H && c2?.width === cw && c2?.height === H, `${p2?.width}x${p2?.height}, ${c2?.width}x${c2?.height}`);
  const f0 = grabC(path.join(out2, 'best.mp4'), 0, `scale=${cw}:${H}`);
  const dC = diff(f0, grabC(film, bc.from + 0.02, cropF)), dCoff = diff(f0, grabC(film, bc.from + 1.02, cropF));
  check('(e2) the clip begins on the source\'s cropped frame at its start', dC < 6 && dCoff > 3 * dC + 2, `${dC.toFixed(1)} vs ${dCoff.toFixed(1)}`);
}

// ─── (g) --no-report ─────────────────────────────────────────────────────────
const r2 = await watchVideo(film, { out, rate: 4, frames: 6, quiet: true, report: false });
const left = ['report.html', 'best.mp4', 'best.png'].filter(f => fs.existsSync(path.join(out, f)));
check('(g) --no-report writes none and clears the last run\'s', !r2.best && !left.length && !/best moment/.test(fs.readFileSync(path.join(out, 'summary.md'), 'utf8')), left.join(', ') || 'none left');

// ─── (h) piece 5's way in ────────────────────────────────────────────────────
{
  const d = path.join(dir, 'extra');
  fs.mkdirSync(d);
  writeReport({ out: d, title: 't', overall: ['x'], words: ['- y'], timeline: null }, { extra: [{ after: 'read', id: 'shots', title: 'Shots', html: '<p>s</p>' }, { after: 'read', id: 'beats', title: 'Beats', html: '' }, { after: 'nowhere', id: 'end', title: 'End', html: '' }] });
  const got = [...fs.readFileSync(path.join(d, 'report.html'), 'utf8').matchAll(/<section id="([^"]+)"/g)].map(m => m[1]).join(',');
  check('(h) extra sections land after the one they name, in order', got === 'read,shots,beats,words,numbers,end', got);
  check('(h) renderPage escapes its title', renderPage({ title: '<x>' }).includes('<title>&lt;x&gt;</title>'));
}

if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true }); else console.log(dir);
console.log(`\n${total - failed}/${total} ok`);
process.exit(failed ? 1 : 0);
