#!/usr/bin/env node
/**
 * `npm run watchwords`: the watch tool's plain words and its before/after
 * read (PLAN 47x), held to clips whose answers are known by construction.
 *
 * What was asked (the owner, 2026-11-22): the watch tool reads a film as
 * numbers, and should also say in words what it sees, in a vocabulary from
 * art criticism, architecture and the light shows themselves
 * (docs/watch-words.md), and tell what changed between a before and an
 * after film. This check is the contract for both, written before either
 * was built, so the words are held to pictures and not to their own
 * thresholds: a steady drift must read sustained and a picture that sits and
 * jumps sudden, whatever edges the code's table chooses.
 *
 * The contract, as this file reads it:
 *
 *   watchVideo(file, opts)            (scripts/watch.mjs) returns, besides
 *                                     what it returns today, `words`: the
 *                                     describe() result for the film, and
 *                                     writes a "## In words" section into
 *                                     summary.md holding words.lines.
 *   describe(read)                    (scripts/watchwords.mjs) takes what
 *                                     watchVideo returns (shape, design,
 *                                     design.physics, rows, and whatever
 *                                     else it needs) → { lines, words }
 *                                     words: [{ area, term, value, measure,
 *                                     steady, source, text }], one entry for
 *                                     each word said. area is one of time,
 *                                     weight, space, flow, effort, build,
 *                                     colour, light, form, edges,
 *                                     composition, show. term is the word
 *                                     itself ("sustained"). value is the
 *                                     finite number that decided it and
 *                                     measure names it. steady is false when
 *                                     the measure does not hold from take to
 *                                     take (swells, calm, half-life), and its
 *                                     text then says "may vary from take to
 *                                     take". source names a source on
 *                                     docs/watch-words.md (Laban, Itten,
 *                                     Ching, Greenberg, Arnheim, or the wet
 *                                     show), the one its area draws on there
 *                                     (time, weight, space, flow and effort:
 *                                     Laban; build: Laban or Ching; colour:
 *                                     Itten; light: Itten, Arnheim or the wet
 *                                     show; form: the wet show or Greenberg;
 *                                     edges: Greenberg; composition: Arnheim,
 *                                     Greenberg or Ching; show: the wet show).
 *                                     term is one of the words in bold on
 *                                     that page. text is the line said, and
 *                                     prints the value to two significant
 *                                     figures at least (an integer as it is,
 *                                     a share may be a percentage). lines
 *                                     holds every text.
 *   watchPair(before, after, opts)    (scripts/watchpair.mjs) watches both
 *                                     with the same options into
 *                                     opts.out/before and opts.out/after and
 *                                     returns { before, after, diff, out };
 *                                     writes opts.out/diff.md (first line
 *                                     "# What changed"), diff-timeline.png
 *                                     (the two timelines stacked) and
 *                                     pairs.png (frames at matched times,
 *                                     before beside after).
 *   diff                              { changed, held, lines }. changed:
 *                                     [{ area, measure, from, to, steps,
 *                                     steady, text }], each at least one
 *                                     just-noticeable step (steps >= 1), in
 *                                     falling order of steps. from and to are
 *                                     the measure's values in the two reads,
 *                                     and where a word was said from the
 *                                     same measure, the same name and the
 *                                     same value as that word's, with its
 *                                     steady. A ratio measure (an edge
 *                                     width, a scale) is sized in steps of
 *                                     1.5x. held: [{ area, measure }], the
 *                                     measures compared that moved less than
 *                                     a step.
 *   npm run watch -- --before A --after B --out D   the same from the
 *                                     command line.
 *
 * The clips (320×180, 30 fps, 12 s, no sound, WebM through a pipe like the
 * app's recordings):
 *   drift    blue and teal stripes, a 64 px sine, drifting 1 px a frame over
 *            the whole frame: steady, all-over, analogous.
 *   drift2   the same at another phase: a second take of the same look, for
 *            what must not read as a change.
 *   jumps    red and cyan stripes (opposite hues) that sit still and jump to
 *            a new phase every half second: sudden and strong.
 *   crisp    one amber disc (radius 45 px) at the centre of a black frame,
 *            its stripes drifting inside it, a hard edge (one pixel).
 *   soft     the same disc with its edge blurred over 14 px: only the edge
 *            changed.
 *
 * What today's reads give on these clips (measured 2026-11-22, before the words were built),
 * so the poles are known to sit far apart in the measures the words come from:
 *   per-sample motion p50 / p90   drift 2.96 / 3.01 (1.02x)   jumps 0.02 / 11.6 (500x)
 *   hue gap (design)              drift 30 degrees            jumps 180 degrees
 *   spread of the light           drift 0.29                  crisp 0.09
 *   near-black share (shape)      drift 0                     crisp 0.89
 *   edge width (% of the width)   crisp 0.62                  soft 2.67 (4.3x, 3.6 steps)
 * And today's compareDesign and comparePhysics on crisp against soft: the edge width 3.6 steps,
 * the spectrum slope 4.2, and nothing else past 0.6 of a step (colour and light 0.1 at most);
 * on drift against drift2 nothing past 0.4.
 * jumps' calm share comes back NaN and its swells a minute null: the words must say nothing
 * from a measure that is not there, rather than a word without a number.
 *
 * Run it: npm run watchwords
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { watchVideo, findFfmpeg } from './watch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = 320, H = 180, FPS = 30, SEC = 12;
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`); };

const ff = findFfmpeg();
if (!ff) { console.log(' FAIL ffmpeg — none found, so no clip can be made'); process.exit(1); }

/** Encode frames as WebM through a pipe (no duration in the header, as MediaRecorder writes). */
async function clip(dir, name, frame) {
  const out = path.join(dir, `${name}.webm`);
  const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-c:v', 'libvpx', '-b:v', '2M', '-f', 'webm', 'pipe:1'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const file = fs.createWriteStream(out);
  p.stdout.pipe(file);
  const done = Promise.all([
    new Promise((ok, no) => p.on('close', c => (c === 0 ? ok() : no(new Error(`encoding ${name} failed (${c})`))))),
    new Promise(ok => file.on('finish', ok)),
  ]);
  for (let f = 0; f < FPS * SEC; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
  return out;
}

const mix = (a, b, u) => [0, 1, 2].map(i => Math.round(a[i] * (1 - u) + b[i] * u));
/** Vertical stripes of two colours, a sine of period 64 px, at a phase in px. */
function stripes(c1, c2, phase, img = Buffer.alloc(W * H * 3), inside = () => 1) {
  const row = [];
  for (let x = 0; x < W; x++) row.push(mix(c1, c2, 0.5 + 0.5 * Math.sin((2 * Math.PI * (x - phase)) / 64)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = inside(x, y);
    if (a > 0) img.set(a >= 1 ? row[x] : row[x].map(v => Math.round(v * a)), (y * W + x) * 3);
  }
  return img;
}
const BLUE = [30, 80, 230], TEAL = [20, 200, 190], RED = [230, 40, 30], CYAN = [20, 200, 220];
const AMBER = [250, 170, 20], ORANGE = [220, 90, 10];
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jumpPhase = Array.from({ length: SEC * 2 + 1 }, () => Math.floor(rnd() * 64));
const disc = edge => (x, y) => {
  const r = Math.hypot(x - W / 2 + 0.5, y - H / 2 + 0.5);
  if (edge <= 1) return Math.max(0, Math.min(1, 45.5 - r));
  const u = Math.max(0, Math.min(1, (45 + edge / 2 - r) / edge));
  return u * u * (3 - 2 * u);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchwords-'));
// Neutral names on disk, so nothing can read the answer from a file name.
const files = {
  drift: await clip(dir, 'c0', f => stripes(BLUE, TEAL, f)),
  drift2: await clip(dir, 'c1', f => stripes(BLUE, TEAL, f + 23)),
  jumps: await clip(dir, 'c2', f => stripes(RED, CYAN, jumpPhase[Math.floor(f / (FPS / 2))])),
  crisp: await clip(dir, 'c3', f => stripes(AMBER, ORANGE, f, Buffer.alloc(W * H * 3), disc(1))),
  soft: await clip(dir, 'c4', f => stripes(AMBER, ORANGE, f, Buffer.alloc(W * H * 3), disc(14))),
};

let watchPair = null, describe = null;
try { ({ watchPair } = await import('./watchpair.mjs')); } catch (e) { check('scripts/watchpair.mjs loads', false, e.message.split('\n')[0]); }
try { ({ describe } = await import('./watchwords.mjs')); } catch (e) { check('scripts/watchwords.mjs loads', false, e.message.split('\n')[0]); }

const OUT = { drift: 'o0', jumps: 'o2', crisp: 'o3', soft: 'o4' };
const opts = name => ({ out: path.join(dir, OUT[name]), quiet: true, frames: 12, perSheet: 12 });
const read = {};
for (const k of ['drift', 'jumps', 'crisp', 'soft']) {
  try { read[k] = await watchVideo(files[k], opts(k)); } catch (e) { read[k] = null; check(`${k}: watched`, false, e.message.split('\n')[0]); }
}
const terms = (r, area) => (r?.words?.words ?? []).filter(w => w.area === area).map(w => w.term.toLowerCase());
const said = (r, area) => terms(r, area).join(', ') || 'nothing';
const has = (r, area, re) => terms(r, area).some(t => re.test(t));
// A "does not read" holds only for a film that was read in words at all: no words is a FAIL, not a pass.
const hasNot = (r, area, re) => (r?.words?.words?.length ?? 0) >= 4 && !has(r, area, re);

// ─── the words for one film ──────────────────────────────────────────────────
const doc = fs.readFileSync(path.join(here, '..', 'docs', 'watch-words.md'), 'utf8').toLowerCase();
// The terms are the page's words in bold, and each area draws on its own sources: "laban" in
// any source string, or a term that is merely somewhere in nine kilobytes of prose, would
// pass anything.
const BOLD = new Set([...doc.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].replace(/\s+/g, " ").trim().toLowerCase()));
const AREA_SOURCES = { time: ['laban'], weight: ['laban'], space: ['laban'], flow: ['laban'], effort: ['laban'],
  build: ['laban', 'ching'], colour: ['itten'], light: ['itten', 'arnheim', 'wet show'], form: ['wet show', 'greenberg'],
  edges: ['greenberg'], composition: ['arnheim', 'greenberg', 'ching'], show: ['wet show'] };
const sourced = w => (AREA_SOURCES[w.area] ?? []).some(s => String(w.source ?? '').toLowerCase().includes(s));
const termOk = w => BOLD.has(String(w.term ?? '').toLowerCase().replace(/^contrast /, ''));
for (const k of ['drift', 'jumps', 'crisp', 'soft']) {
  const r = read[k];
  const ws = r?.words?.words ?? [];
  check(`${k}: words come back from watchVideo, every text among its lines`, Array.isArray(ws) && ws.length >= 4 && Array.isArray(r.words.lines) && ws.every(w => r.words.lines.some(l => l.includes(w.text))),
    `${ws.length} words, ${r?.words?.lines?.length ?? 0} lines`);
  const bad = ws.filter(w => !Number.isFinite(w.value) || !w.measure || !w.text || numIn(w.text, w.value) == null);
  check(`${k}: every word carries the number that chose it`, ws.length && !bad.length,
    bad.length ? `no number in: ${bad.slice(0, 3).map(w => JSON.stringify(w.text ?? w.term)).join('; ')}` : `${ws.length} of ${ws.length}`);
  const unsourced = ws.filter(w => !sourced(w) || !termOk(w));
  check(`${k}: every word and its source are on docs/watch-words.md`, ws.length && !unsourced.length,
    unsourced.length ? unsourced.slice(0, 4).map(w => `${w.term} (${w.source ?? 'no source'})`).join(', ') : 'all');
  const unhedged = ws.filter(w => w.steady === false && !/may vary from take to take/.test(w.text));
  const hedgedSteady = ws.filter(w => w.steady !== false && /may vary from take to take/.test(w.text));
  check(`${k}: unsteady words say so, steady ones do not`, typeof ws[0]?.steady === 'boolean' && !unhedged.length && !hedgedSteady.length,
    `${ws.filter(w => w.steady === false).length} unsteady${unhedged.length ? `, unhedged: ${unhedged.map(w => w.term).join(', ')}` : ''}${hedgedSteady.length ? `, hedged though steady: ${hedgedSteady.map(w => w.term).join(', ')}` : ''}`);
  let summary = '';
  try { summary = fs.readFileSync(path.join(opts(k).out, 'summary.md'), 'utf8'); } catch {}
  const sec = summary.split(/^## In words\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  check(`${k}: summary.md has the "In words" section with every word in it`, sec && ws.length && ws.every(w => sec.includes(w.text)),
    sec ? `${sec.trim().split('\n').length} lines` : 'no "## In words" heading');
}
/**
 * The number as the text prints it: a number standing on its own in the text (not the 90 of
 * "p90") that rounds to the value at the precision printed, with two significant figures at
 * least, or the exact integer; a percentage counts as a hundredth of itself. A plain
 * substring test let "0" or "10" anywhere in a line stand in for 0.29.
 */
function numIn(text, v) {
  if (!Number.isFinite(v)) return null;
  for (const m of String(text).matchAll(/(?<![\w.])([-\u2212]?)(\d+(?:\.\d+)?)(%?)/g)) {
    const digits = m[2], d = (digits.split('.')[1] ?? '').length;
    const p = Number(digits) * (m[1] ? -1 : 1), target = m[3] ? 100 * v : v;
    const sig = digits.replace('.', '').replace(/^0+/, '').length;
    if (Number.isInteger(target) && p === target) return m[0];
    if (sig >= 2 && Math.abs(p - target) <= 0.5 * 10 ** -d + 1e-9) return m[0];
  }
  return null;
}

// Laban's Time and Weight, against clips made to sit at the poles.
check('drift reads sustained (Time)', has(read.drift, 'time', /^sustained/), said(read.drift, 'time'));
check('jumps reads sudden (Time)', has(read.jumps, 'time', /^sudden/), said(read.jumps, 'time'));
check('jumps reads strong (Weight)', has(read.jumps, 'weight', /^strong/), said(read.jumps, 'weight'));
check('drift does not read strong (Weight)', hasNot(read.drift, 'weight', /^strong/), said(read.drift, 'weight'));
check('jumps does not read sustained, drift not sudden (Time)', hasNot(read.jumps, 'time', /^sustained/) && hasNot(read.drift, 'time', /^sudden/), `${said(read.jumps, 'time')} / ${said(read.drift, 'time')}`);
// A word's value is the number that chose it: the two poles are read from one measure, at two
// different values (a constant value on every word would otherwise pass).
const word = (r, area, re) => (r?.words?.words ?? []).find(w => w.area === area && re.test(String(w.term).toLowerCase()));
const pole = (a, b) => (a && b ? `${a.measure} ${a.value} / ${b.measure} ${b.value}` : 'a pole unsaid');
{ const a = word(read.drift, 'time', /^sustained/), b = word(read.jumps, 'time', /^sudden/);
  check('sustained and sudden come from one measure, at different values', a && b && a.measure === b.measure && a.value !== b.value, pole(a, b)); }
// Itten: blue and teal sit about 30° apart as measured; red and cyan opposite.
check('drift reads analogous (colour)', has(read.drift, 'colour', /analogous/), said(read.drift, 'colour'));
check('jumps reads complementary (colour)', has(read.jumps, 'colour', /complementary/), said(read.jumps, 'colour'));
check('drift does not read complementary', hasNot(read.drift, 'colour', /complementary/), said(read.drift, 'colour'));
check('jumps does not read analogous', hasNot(read.jumps, 'colour', /analogous/), said(read.jumps, 'colour'));
// Composition: stripes to every edge against one disc in the middle of black.
check('drift reads all-over (composition)', has(read.drift, 'composition', /all-over/), said(read.drift, 'composition'));
check('crisp reads centred (composition)', has(read.crisp, 'composition', /^centred/), said(read.crisp, 'composition'));
check('crisp does not read all-over', hasNot(read.crisp, 'composition', /all-over/), said(read.crisp, 'composition'));
check('drift does not read centred', hasNot(read.drift, 'composition', /^centred/), said(read.drift, 'composition'));
check('crisp reads dark-ground (light)', has(read.crisp, 'light', /dark-ground/), said(read.crisp, 'light'));
check('drift does not read dark-ground', hasNot(read.drift, 'light', /dark-ground/), said(read.drift, 'light'));
// Edges: the same disc, one pixel against fourteen.
check('crisp reads hard-edged (edges)', has(read.crisp, 'edges', /hard-edged/), said(read.crisp, 'edges'));
check('soft reads soft or painterly (edges)', has(read.soft, 'edges', /soft|painterly/), said(read.soft, 'edges'));
check('crisp does not read soft, soft not hard-edged', hasNot(read.crisp, 'edges', /soft|painterly/) && hasNot(read.soft, 'edges', /hard-edged/), `${said(read.crisp, 'edges')} / ${said(read.soft, 'edges')}`);
{ const a = word(read.crisp, 'edges', /hard-edged/), b = word(read.soft, 'edges', /soft|painterly/);
  check('hard-edged and soft come from one measure, the hard edge the narrower', a && b && a.measure === b.measure && a.value < b.value, pole(a, b)); }
{ let again = null, err = '';
  try { again = describe && read.drift ? describe(read.drift) : null; } catch (e) { err = e.message.split('\n')[0]; }
  check('describe() is the same words watchVideo gave', again && read.drift.words?.lines?.length && JSON.stringify(again.lines) === JSON.stringify(read.drift.words.lines),
    err || (describe ? `compared ${read.drift?.words?.lines?.length ?? 0} lines` : 'no describe()')); }

// ─── what changed ────────────────────────────────────────────────────────────
const ranked = d => d.changed.every((c, i) => i === 0 || c.steps <= d.changed[i - 1].steps);
const steadyChanges = d => d.changed.filter(c => c.steady !== false);
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const heldAreas = d => new Set((d.held ?? []).map(h => h?.area));
// A change's steady is the steady of the word said from the same measure, so marking every
// change unsteady cannot hide it from the "held" checks.
const steadyMismatch = p => p.diff.changed.filter(c => [...(p.before.words?.words ?? []), ...(p.after.words?.words ?? [])]
  .some(w => w.measure === c.measure && w.steady !== c.steady));
const list = d => d.changed.map(c => `${c.area}/${c.measure} ${Number(c.steps).toFixed(1)}`).join(', ') || 'none';

let edge = null;
if (watchPair) try { edge = await watchPair(files.crisp, files.soft, { out: path.join(dir, 'p1'), quiet: true, frames: 12, perSheet: 12 }); }
catch (e) { check('crisp → soft: watched as a pair', false, e.message.split('\n')[0]); }
if (edge) {
  const d = edge.diff;
  check('crisp → soft: every change is at least one step, in falling order', d.changed.length && d.changed.every(c => c.steps >= 1 && c.text) && ranked(d), list(d));
  // Blurring the edge widens the edge width (0.62 to 2.67% of the width measured, 3.6 steps of 1.5×)
  // and steepens the detail spectrum's slope (about −2.2 to −3.9, about 4 steps of 0.4): both
  // are the one change, said as softer or smoother, so either may lead, but it must be one of
  // the two, and the edge width must be named.
  check('crisp → soft: the largest change is the softer edge', ['edges', 'form'].includes(d.changed[0]?.area) && /soft|smooth/i.test(d.changed[0]?.text ?? ''), d.changed[0]?.text ?? 'no change');
  check('crisp → soft: the edge width is named, softer', d.changed.some(c => c.area === 'edges' && /edge/i.test(c.measure) && /soft/i.test(c.text)), list(d));
  check('crisp → soft: motion, colour, light and composition held', d.changed.length && !steadyChanges(d).some(c => ['time', 'weight', 'colour', 'light', 'composition'].includes(c.area)), list(d));
  { const c = d.changed.find(x => x.area === 'edges' && /edge/i.test(x.measure));
    const bw = edge.before.words?.words?.find(w => w.measure === c?.measure), aw = edge.after.words?.words?.find(w => w.measure === c?.measure);
    check('crisp → soft: the edge change is the two words\' numbers, widening, sized in steps of 1.5x, steady',
      c && bw && aw && close(c.from, bw.value) && close(c.to, aw.value) && c.to > c.from && c.steady === true &&
      Math.abs(c.steps - Math.log(c.to / c.from) / Math.log(1.5)) <= 0.5,
      c ? `${c.measure} ${c.from} → ${c.to}, ${c.steps} steps; words ${bw?.value ?? 'none'} / ${aw?.value ?? 'none'}` : 'no edge change'); }
  check('crisp → soft: each change\'s steady is its word\'s', !steadyMismatch(edge).length, steadyMismatch(edge).map(c => c.measure).join(', ') || 'all agree');
  check('crisp → soft: what held is listed, colour and light among it', d.held.length >= 3 && ['colour', 'light'].every(a => heldAreas(d).has(a)),
    `${d.held.length} held: ${[...heldAreas(d)].join(', ')}`);
  const md = (() => { try { return fs.readFileSync(path.join(edge.out, 'diff.md'), 'utf8'); } catch { return ''; } })();
  check('crisp → soft: diff.md opens "# What changed" and holds both In words reads', /^# What changed/.test(md) && edge.before.words.lines.every(l => md.includes(l)) && edge.after.words.lines.every(l => md.includes(l)),
    md ? md.split('\n')[0] : 'no diff.md');
  for (const png of ['diff-timeline.png', 'pairs.png']) {
    let b = Buffer.alloc(0); try { b = fs.readFileSync(path.join(edge.out, png)); } catch {}
    const w = b.length > 24 ? b.readUInt32BE(16) : 0, h = b.length > 24 ? b.readUInt32BE(20) : 0;
    check(`crisp → soft: ${png} is a picture`, b.subarray(1, 4).toString() === 'PNG' && w >= 320 && h >= 90, b.length ? `${w}×${h}` : 'missing');
  }
}

let shift = null;
if (watchPair) try { shift = await watchPair(files.drift, files.jumps, { out: path.join(dir, 'p2'), quiet: true, frames: 12, perSheet: 12 }); }
catch (e) { check('drift → jumps: watched as a pair', false, e.message.split('\n')[0]); }
if (shift) {
  const d = shift.diff;
  check('drift → jumps: Time changed, said as sudden', d.changed.some(c => c.area === 'time' && /sudden/i.test(c.text)), list(d));
  check('drift → jumps: the colour changed', d.changed.some(c => c.area === 'colour'), list(d));
  check('drift → jumps: in falling order of steps', ranked(d), list(d));
  check('drift → jumps: each change\'s steady is its word\'s', !steadyMismatch(shift).length, steadyMismatch(shift).map(c => c.measure).join(', ') || 'all agree');
}

// The same look twice, from the command line: nothing steady may read as changed.
const cliOut = path.join(dir, 'p3');
const cli = spawnSync(process.execPath, [path.join(here, 'watch.mjs'), '--before', files.drift, '--after', files.drift2, '--out', cliOut, '--quiet', '--frames', '12'], { encoding: 'utf8' });
const same = (() => { try { return fs.readFileSync(path.join(cliOut, 'diff.md'), 'utf8'); } catch { return ''; } })();
check('npm run watch -- --before --after writes diff.md', cli.status === 0 && /^# What changed/.test(same), cli.status === 0 ? same.split('\n')[0] || 'empty diff.md' : `exit ${cli.status}: ${(cli.stderr || '').trim().split('\n').pop()}`);
if (watchPair) {
  let again = null;
  try { again = await watchPair(files.drift, files.drift2, { out: path.join(dir, 'p4'), quiet: true, frames: 12, perSheet: 12 }); } catch (e) { check('drift → drift2: watched as a pair', false, e.message.split('\n')[0]); }
  if (again) {
    check('drift → drift2 (the same look, another phase): no steady change past a step; time, colour and composition held',
      !steadyChanges(again.diff).length && again.diff.held.length >= 5 && ['time', 'colour', 'composition'].every(a => heldAreas(again.diff).has(a)),
      `changed: ${list(again.diff)}; held: ${[...heldAreas(again.diff)].join(', ')}`);
    check('drift → drift2: each change\'s steady is its word\'s', !steadyMismatch(again).length, steadyMismatch(again).map(c => c.measure).join(', ') || 'all agree');
  }
}

fs.rmSync(dir, { recursive: true, force: true });
const failed = results.filter(x => !x).length;
console.log(failed ? `watchwords: ${failed} of ${results.length} FAIL` : `watchwords: ok ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
