/**
 * The watch tool's report a person reads, and the clip's best moment (PLAN 47p-4,
 * reelreader piece 4 of 5, the owner's pick, 2026-11-28).
 *
 * Until now a run left a folder: summary.md, a timeline, a few contact sheets,
 * a palette strip, stats.tsv and design.json. Claude reads that folder well; a
 * person does not. They have to open five files in three programs, and the
 * words that explain the sheets sit in a Markdown file that names the sheets
 * by their absolute paths. Packaged for anyone (an editor, a colourist, a VJ),
 * the first thing a run must give is one page that can be opened, read top to
 * bottom on a laptop or a phone, and sent to someone else. So every run now
 * also writes:
 *
 *   report.html   one self-contained page: the best moment, the timeline, the
 *                 overall read, the words, the numbers, every contact sheet and
 *                 the palette. Pictures are inside it (JPEG data, so a run of
 *                 four sheets stays a few megabytes), the clip too when it is
 *                 small enough (BEST_EMBED_BYTES), so the one file can be
 *                 mailed or dropped in a chat and still shows everything. It
 *                 names no folder on the machine that made it: a report is
 *                 sent to other people, and an absolute path says whose home
 *                 folder it came from. Every word from the video's page (its
 *                 title, its uploader, its description) is escaped: those are
 *                 written by whoever uploaded the video.
 *   best.mp4      the strongest 10 to 15 s of the clip (BEST_SECONDS), as H.264
 *                 with its sound, at most 1280 px wide: something to show
 *                 someone, or to drop into an edit.
 *   best.png      the strongest frame inside it, at the source's own size.
 *
 * What "the strongest moment" is. Not one measure: the loudest passage of a
 * concert film can be a black stage, and the most motion in a cartoon is its
 * whip pans. It is the stretch where most is happening and there is most to
 * see, from four of the measures every run already takes per sample:
 *
 *   motion    how much the picture changes (cut and dissolve samples left out:
 *             a cut is the editor's change, not the picture's), weight 0.4;
 *   colour    the share of the frame that is coloured, 0.3;
 *   lit       the share neither near black nor blown out, 0.15;
 *   loudness  when there is sound, 0.15 (the weights share out without it).
 *
 * Each is taken as its rank in this clip (0 the clip's least, 1 its most), so
 * no measure's units outweigh another's and a dim, calm film still has a best
 * moment of its own. A window's score is the mean of its samples' scores, each
 * measure averaged over the samples that have it. Windows holding a title card
 * (scripts/watchfootage.mjs) are not candidates, unless every window does. Each
 * hard cut inside a window costs CUT_COST: a moment is one shot when it can be,
 * and in a film cut every four seconds every window pays alike. A cut on the
 * window's first sample is where it starts, not a cut inside it, so a window
 * that would open on a blink of the shot before a cut moves onto the cut by
 * itself: a second of the next shot's ordinary picture costs far less than
 * 0.15. (A separate step that snapped the edges onto nearby cuts was written
 * first and taken out: with this cost it never changed a window, so nothing
 * could hold it.)
 * The still is the window's best sample by the same score without motion and
 * loudness (a frame is judged by what is in it: its colour and its light), never
 * a cut or dissolve sample or the one straight after a cut.
 *
 * For a liquid show this picks a swell (shape() in watch.mjs: motion rising to
 * two and a half times its median for a few seconds) where the dye is brightest;
 * for an edited film the busiest, most colourful sequence. Held by
 * `npm run watchreport` (scripts/watchreporttest.mjs).
 *
 * Built to be added to. The page is a list of sections (`reportSections`), each
 * { id, title, html }; `writeReport` takes `extra` sections, each placed `after`
 * a named one, and `renderPage` is the page's shell alone. Piece 5 (PLAN 47p-5:
 * a shot list, batch runs and a rating page) adds its shot table as a section
 * after the timeline and builds the batch's index and rating pages on
 * `renderPage`, so every page the tool writes looks and reads the same.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The best moment's length, in seconds, and what a cut inside it costs. */
export const BEST_SECONDS = 12;
export const BEST_MIN = 10, BEST_MAX = 15;
export const CUT_COST = 0.15;
/** A clip at most this big goes inside the page as well as beside it. */
export const BEST_EMBED_BYTES = 8 * 1024 * 1024;
const WEIGHTS = { motion: 0.4, colour: 0.3, lit: 0.15, loud: 0.15 };

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Each sample's rank (0 to 1) in one measure, over the samples that have it;
 * null for those that do not. Ties share their mean rank, so a flat measure
 * (a silent track, a clip with no colour) ranks every sample 0.5 and moves no
 * window against another.
 */
function ranks(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => v != null && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const out = values.map(() => null);
  const m = idx.length;
  for (let i = 0; i < m;) {
    let j = i;
    while (j + 1 < m && idx[j + 1][0] === idx[i][0]) j++;
    const r = m > 1 ? (i + j) / 2 / (m - 1) : 0.5;
    for (let q = i; q <= j; q++) out[idx[q][1]] = r;
    i = j + 1;
  }
  return out;
}

/**
 * The strongest stretch of a clip, from its per-sample rows (watch.mjs's
 * `rows`: t, motion, colour, dark, bright, loud, cut, fade, title).
 * Returns { from, to, at, k, score, cuts, why } in the clip's own seconds
 * (`from` inclusive, `to` the end), `at` the still's time and `k` its sample,
 * or null with no rows. `seconds` is clamped to 10 to 15 s, and to the clip.
 */
export function bestMoment(rows, { rate, seconds = BEST_SECONDS } = {}) {
  const n = rows?.length ?? 0;
  if (!n || !(rate > 0)) return null;
  const len = Math.max(BEST_MIN, Math.min(BEST_MAX, seconds));
  const win = Math.max(1, Math.min(n, Math.round(len * rate)));
  const hasLoud = rows.some(r => r.loud != null);
  const noMotion = (r, k) => k === 0 || r.cut || r.fade || r.title;
  const rk = {
    motion: ranks(rows.map((r, k) => (noMotion(r, k) ? null : r.motion))),
    colour: ranks(rows.map(r => (r.title ? null : r.colour))),
    lit: ranks(rows.map(r => (r.title ? null : 1 - r.dark - r.bright))),
    loud: hasLoud ? ranks(rows.map(r => (r.title ? null : r.loud))) : null,
  };
  const keys = Object.keys(WEIGHTS).filter(key => rk[key]);
  // Prefix sums of each measure's ranks and counts, so every window is O(1).
  const pre = {};
  for (const key of keys) {
    const s = new Float64Array(n + 1), c = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) { const v = rk[key][k]; s[k + 1] = s[k] + (v ?? 0); c[k + 1] = c[k] + (v == null ? 0 : 1); }
    pre[key] = { s, c };
  }
  const titles = new Float64Array(n + 1), cutsAt = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) { titles[k + 1] = titles[k] + (rows[k].title ? 1 : 0); cutsAt[k + 1] = cutsAt[k] + (rows[k].cut && !rows[k].dissolve ? 1 : 0); }
  const windowScore = (a, b) => {
    let tot = 0, wsum = 0;
    for (const key of keys) {
      const { s, c } = pre[key], cnt = c[b] - c[a];
      if (cnt > 0) { tot += WEIGHTS[key] * ((s[b] - s[a]) / cnt); wsum += WEIGHTS[key]; }
    }
    // A cut on the window's first sample is its start, not a cut inside it.
    const inside = cutsAt[b] - cutsAt[a + 1];
    return (wsum ? tot / wsum : 0) - CUT_COST * inside;
  };
  const anyClean = (() => { for (let a = 0; a + win <= n; a++) if (titles[a + win] - titles[a] === 0) return true; return false; })();
  let best = null;
  for (let a = 0; a + win <= n; a++) {
    if (anyClean && titles[a + win] - titles[a] > 0) continue;
    const s = windowScore(a, a + win);
    if (!best || s > best.s) best = { a, s };
  }
  const { a } = best, b = a + win;
  // The still: the window's best frame by what is in it, never a cut, a
  // dissolve, a title or the sample straight after a cut.
  let still = null;
  for (let k = a; k < b; k++) {
    const r = rows[k];
    if (r.cut || r.fade || r.title || (k > 0 && rows[k - 1].cut)) continue;
    const s = 0.65 * (rk.colour[k] ?? 0) + 0.35 * (rk.lit[k] ?? 0);
    if (!still || s > still.s) still = { k, s };
  }
  const k = still?.k ?? Math.min(n - 1, a + (win >> 1));
  const med = arr => { const s = arr.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const sl = rows.slice(a, b);
  const mWin = med(sl.filter((r, i) => !noMotion(r, a + i)).map(r => r.motion)), mAll = med(rows.filter((r, i) => !noMotion(r, i)).map(r => r.motion));
  const cWin = sl.reduce((s, r) => s + r.colour, 0) / sl.length, cAll = rows.reduce((s, r) => s + r.colour, 0) / n;
  const nCuts = cutsAt[b] - cutsAt[a + 1];
  const pct = x => `${Math.round(x * 100)}%`;
  const why = [
    mWin != null && mAll > 0 ? `motion ${(mWin / mAll).toFixed(1)}× the clip's median` : null,
    `colour over ${pct(cWin)} of the frame (the clip's mean ${pct(cAll)})`,
    nCuts ? `${nCuts} cut${nCuts > 1 ? 's' : ''} inside` : 'no cut inside',
  ].filter(Boolean).join(', ');
  return { from: rows[a].t, to: rows[a].t + win / rate, at: rows[k].t, k, score: best.s, cuts: nCuts, why, start: a };
}

/**
 * The best moment's clip and still, beside the report. `crop` is the run's
 * crop (fractions), so a film of a room gives the projection, as every other
 * picture of the run does. Returns { clip, still } (paths, null when ffmpeg
 * could not write one). H.264 when the build has libx264 (every common one
 * does), MPEG-4 part 2 when not, which plays in fewer places but plays.
 */
export function exportBest({ ff, file, out, best, crop, hasAudio }) {
  if (!best) return { clip: null, still: null };
  const cropF = crop ? `crop=trunc(iw*${crop.w}/2)*2:trunc(ih*${crop.h}/2)*2:trunc(iw*${crop.x}):trunc(ih*${crop.y})` : null;
  const encoders = spawnSync(ff, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '';
  const video = /^\s*V\S*\s+libx264\s/m.test(encoders) ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'] : ['-c:v', 'mpeg4', '-q:v', '3'];
  const clip = path.join(out, 'best.mp4'), still = path.join(out, 'best.png');
  const q = ['-hide_banner', '-loglevel', 'error', '-y'];
  // -ss after -i: exact to the sample (the clip must begin where the window
  // does, which the check measures), and a 12 s seek decode costs little.
  const r1 = spawnSync(ff, [...q, '-i', file, '-ss', String(best.from), '-t', String(best.to - best.from),
    '-vf', [cropF, "scale='min(1280,iw)':-2:flags=lanczos"].filter(Boolean).join(','), ...video,
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']), '-movflags', '+faststart', clip]);
  const r2 = spawnSync(ff, [...q, '-i', file, '-ss', String(best.at), '-frames:v', '1', ...(cropF ? ['-vf', cropF] : []), still]);
  return { clip: r1.status === 0 && fs.existsSync(clip) ? clip : null, still: r2.status === 0 && fs.existsSync(still) ? still : null };
}

// ─── the page ────────────────────────────────────────────────────────────────

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Inline Markdown the summary uses: **bold**, `code`, *emphasis*; escaped first. */
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

/**
 * The summary's Markdown as HTML: headings, bullets (one level of indent),
 * quotes, tables and paragraphs, which is all summary.md writes. Everything
 * is escaped before any tag is added, so a title or a page description from
 * the video's site can hold no markup.
 */
export function mdToHtml(lines) {
  const html = [];
  let list = null, table = null, para = [];
  const flushPara = () => { if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (list) html.push(`<ul>${list.map(li => `<li${li.sub ? ' class="sub"' : ''}>${inline(li.text)}</li>`).join('')}</ul>`); list = null; };
  const flushTable = () => {
    if (table) {
      const [headRow, ...body] = table.filter(r => !/^\|?\s*:?-{2,}/.test(r));
      const cells = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      html.push(`<div class="scroll"><table><thead><tr>${cells(headRow).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    }
    table = null;
  };
  const flush = () => { flushPara(); flushList(); flushTable(); };
  for (const raw of lines) {
    const line = String(raw ?? '');
    const h = /^(#{1,4})\s+(.*)$/.exec(line), li = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (h) { flush(); const lvl = Math.min(4, h[1].length + 1); html.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); }
    else if (/^\s*\|/.test(line)) { flushPara(); flushList(); (table ??= []).push(line.trim()); }
    else if (li) { flushPara(); flushTable(); (list ??= []).push({ text: li[2], sub: li[1].length >= 2 }); }
    else if (/^>\s?/.test(line)) { flush(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else { flushList(); flushTable(); para.push(line.trim()); }
  }
  flush();
  return html.join('\n');
}

/**
 * A picture as a data URI: JPEG through ffmpeg when it can (a 1568 px contact
 * sheet is about 2 MB as PNG and a tenth of that as JPEG at q 3, and a page of
 * four sheets has to load on a phone), the file itself when not.
 */
export function dataUri(file, ff, { jpeg = true } = {}) {
  if (!file || !fs.existsSync(file)) return null;
  if (jpeg && ff) {
    const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0 && r.stdout?.length) return `data:image/jpeg;base64,${r.stdout.toString('base64')}`;
  }
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.mp4' ? 'video/mp4' : 'application/octet-stream';
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

const CSS = `
:root{--bg:#141416;--panel:#1d1d21;--ink:#ececf0;--dim:#a2a2ad;--rule:#33333a;--accent:#f0b35a}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
header h1{font-size:1.6rem;line-height:1.25;margin:0 0 6px;overflow-wrap:anywhere}
.meta{color:var(--dim);font-size:.92rem;margin:0 0 4px;overflow-wrap:anywhere}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin:14px 0 4px;font-size:.9rem}
nav a{color:var(--accent);text-decoration:none}
section{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:16px;margin:18px 0}
section>h2{font-size:1.15rem;margin:0 0 10px}
h3{font-size:1.02rem;margin:18px 0 6px}h4,h5{font-size:.95rem;margin:14px 0 4px;color:var(--dim)}
p,li{overflow-wrap:anywhere}ul{padding-left:20px;margin:6px 0}li{margin:3px 0}li.sub{margin-left:18px;list-style:circle}
blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid var(--rule);color:var(--dim);overflow-wrap:anywhere}
img,video{display:block;max-width:100%;height:auto;border-radius:6px;background:#000}
figure{margin:12px 0}figcaption{color:var(--dim);font-size:.88rem;margin-top:6px}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;align-items:start}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}img.wide{min-width:720px;max-width:none;width:100%}
table{border-collapse:collapse;font-size:.85rem;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--rule);padding:4px 10px;text-align:left;white-space:nowrap}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:#0000004d;padding:1px 4px;border-radius:4px;overflow-wrap:anywhere}
details>summary{cursor:pointer;color:var(--accent);margin:4px 0}
footer{color:var(--dim);font-size:.85rem;margin-top:28px}
`;

/**
 * The page's shell: title, a line or two under it, the sections' index and the
 * sections. Every page the tool writes is this one shell, the run's report now
 * and piece 5's batch index and rating page later (PLAN 47p-5).
 */
export function renderPage({ title, meta = [], sections = [], footer = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="reelreader">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>${esc(title)}</h1>
${meta.map(m => `<p class="meta">${m}</p>`).join('\n')}
<nav>${sections.map(s => `<a href="#${esc(s.id)}">${esc(s.title)}</a>`).join('')}</nav>
</header>
${sections.map(s => `<section id="${esc(s.id)}">\n<h2>${esc(s.title)}</h2>\n${s.html}\n</section>`).join('\n')}
<footer>${footer}</footer>
</main>
</body>
</html>
`;
}

/**
 * The run's sections, in reading order: what a person wants first (the best
 * moment, the whole clip at a glance, the verdict in words) before what they
 * look up (the numbers, every sheet, the detail reads). `doc` is what watch.mjs
 * hands over: the summary's Markdown in its parts, the pictures' paths and the
 * best moment.
 */
export function reportSections(doc, { ff } = {}) {
  const { numbers = [], footage = [], readAs = [], overall = [], card = [], words = [], refWords = null, refTitle = null, detail = [], table = [],
    timeline, sheets = [], stills = [], palette, best, bestFiles = {} } = doc;
  const img = (file, alt) => { const u = dataUri(file, ff); return u ? `<img src="${u}" alt="${esc(alt)}" loading="lazy">` : ''; };
  const sections = [];
  if (best) {
    const clip = bestFiles.clip, size = clip && fs.existsSync(clip) ? fs.statSync(clip).size : 0;
    const embed = size && size <= BEST_EMBED_BYTES ? `<source src="${dataUri(clip, null, { jpeg: false })}" type="video/mp4">` : '';
    const video = clip ? `<figure><video controls playsinline preload="metadata"><source src="best.mp4" type="video/mp4">${embed}</video><figcaption>${esc(stamp(best.from))} to ${esc(stamp(best.to))}, ${esc((best.to - best.from).toFixed(0))} s (best.mp4 beside this page)</figcaption></figure>` : '';
    const still = bestFiles.still ? `<figure>${img(bestFiles.still, 'The strongest frame')}<figcaption>The strongest frame, at ${esc(stamp(best.at))} (best.png, full size)</figcaption></figure>` : '';
    sections.push({ id: 'best', title: 'Best moment', html: `<p>${esc(stamp(best.from))} to ${esc(stamp(best.to))}: ${esc(best.why)}.</p>\n<div class="pair">${video}${still}</div>` });
  }
  if (timeline) sections.push({ id: 'timeline', title: 'Timeline', html: `<p>The centre column of every sample, left to right over the whole clip; under it motion${doc.hasAudio ? ', loudness' : ''} and the cuts (red). On a phone it scrolls sideways.</p><div class="scroll">${img(timeline, 'Timeline').replace('<img ', '<img class="wide" ')}</div>` });
  const read = [...(readAs.length ? ['## Read as', '', ...readAs, ''] : []), '## Overall', '', ...overall, ...(card.length ? ['', '## Report card', '', ...card] : [])];
  sections.push({ id: 'read', title: 'The read', html: mdToHtml(read) });
  sections.push({ id: 'words', title: 'In words', html: mdToHtml([...words, ...(refWords ? ['', `## Reference in words (${refTitle})`, '', ...refWords] : [])]) });
  sections.push({ id: 'numbers', title: 'Numbers', html: mdToHtml([...numbers, '', ...footage]) + (palette ? `<figure>${img(palette, 'Palette')}<figcaption>The palette, each colour as wide as its share</figcaption></figure>` : '') });
  if (sheets.length || stills.length) {
    sections.push({ id: 'sheets', title: 'Contact sheets', html: [...sheets.map(s => `<figure>${img(s.f, `Contact sheet ${path.basename(s.f)}`)}<figcaption>${esc(s.count)} frames, ${esc(stamp(s.from))} to ${esc(stamp(s.to))}</figcaption></figure>`),
      ...stills.map(f => `<figure>${img(f, 'Still')}<figcaption>${esc(path.basename(f))}</figcaption></figure>`)].join('\n') });
  }
  if (detail.length || table.length) sections.push({ id: 'detail', title: 'Detail', html: `${mdToHtml(detail)}<details><summary>Over time, in ${esc(Math.max(0, table.length - 2))} steps</summary>${mdToHtml(table)}</details>` });
  return sections;
}

/**
 * Write report.html into `doc.out`. `extra` sections ({ after, id, title,
 * html }) go after the section named `after` (at the end when there is none),
 * in the order given: piece 5's shot list goes `after: 'timeline'`.
 */
export function writeReport(doc, { ff, extra = [] } = {}) {
  const sections = reportSections(doc, { ff });
  for (const x of extra) {
    const i = sections.findIndex(s => s.id === x.after);
    sections.splice(i < 0 ? sections.length : i + 1 + sections.slice(i + 1).filter(s => s.extraOf === x.after).length, 0, { ...x, extraOf: x.after });
  }
  const meta = (doc.meta ?? []).map(m => (m.html ? m.html : esc(m)));
  const html = renderPage({ title: doc.title, meta, sections,
    footer: `Made by reelreader, which reads how a video looks and moves, not what is in it. The other files of this run (summary.md, stats.tsv, design.json, the sheets as PNG) sit beside this page.` });
  const file = path.join(doc.out, 'report.html');
  fs.writeFileSync(file, html);
  return file;
}
