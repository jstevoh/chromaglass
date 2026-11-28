#!/usr/bin/env node
/**
 * General footage gets a general read, and no liquid verdict (PLAN 47p-3).
 *
 *   npm run watchmode
 *
 * The watch tool is being packaged for anyone (reelreader, PLAN 47p), and its
 * physics read, report card, technique guesses, wet-show words and Settings
 * to try are calibrated on liquid light shows. Before 47p-3 they were said of
 * every film: Big Buck Bunny graded Arc 9.0/10 against the real shows. Now
 * `scripts/watchmode.mjs` reads liquid only from footage that shows one (one
 * take, its own motion, coloured light on a dark ground), or when asked. This
 * holds that:
 *
 *   (a) the measured films (scripts/watchmode.mjs's table, 2026-11-28): every
 *       liquid one reads liquid on all three cues, every general one fails at
 *       least two (so no page's words can tip it), and every real show in the
 *       report card's calibration passes the light cue the card's rows can
 *       show;
 *   (b) the choice itself: a flag or the config wins either way, a page naming
 *       a liquid technique lifts two cues to liquid but not one, and a page
 *       about olive oil names no technique;
 *   (c) a synthetic street film (bright, panning, cut every 4 s), watched with
 *       this repository's config (so a settings map is there to be wrongly
 *       used) and `--vs` a liquid read: read as general, saying why; no
 *       Physics, Techniques, Report card, Settings to try, physics gaps or side
 *       by side card; card null in the result and in design.json; no wet-show
 *       word; and none of the liquid show's vocabulary anywhere outside the
 *       one line that says why;
 *   (d) the same film with `--liquid`: all of those come back, and the
 *       vocabulary scan finds them, so (c)'s clean scan is the read and not a
 *       scan that sees nothing;
 *   (e) a synthetic liquid take (soft dye blobs drifting on a dark ground, one
 *       take) reads liquid by itself, with the physics read and the card;
 *   (f) the config's `mode: general` turns that take general, and a mode that
 *       is not auto, liquid or general is an error;
 *   (g) the before/after read of two general films leaves out the show's own
 *       measures, which a pair of liquid reads keeps;
 *   (h) every wet-show word's general form, reached or not by these clips, has
 *       a general term, a general source on reelreader/skill/watch-words.md, its number and
 *       no liquid word, and describe() of the liquid films with liquid: false
 *       says none of the wet words their liquid read says.
 *
 * The scan's words are built from the words table (BANDS), so a new wet term
 * is scanned for without editing this file. (a)'s rows are typed numbers from
 * clips that are not kept: they lock the bars to what was measured, not the
 * measuring; a change to the cue readers shows in (c) and (e).
 *
 * In the sound shard for its ffmpeg. About a minute.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchVideo, findFfmpeg } from './watch.mjs';
import { readMode, liquidCues, MIN_NEAR_BLACK, MIN_COLOURFULNESS } from './watchmode.mjs';
import { REAL_SHOW_CARDS } from './watchcard.mjs';
import { blobTake } from './watchreadtest.mjs';
import { compareReads, describe, BANDS } from './watchwords.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_CONFIG = path.join(HERE, 'reelreader.config.json');
let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// ─── (a) the measured films ──────────────────────────────────────────────────
// Watched 2026-11-28 with this version of the tool (scratch calibration, the
// clips are not kept: archive.org and Blender films, and two app takes from
// the project's shared folder). cutsPerMin counts hard cuts only.
const LIQUID_ROWS = [
  ['JLS Liquid Loops 1:00-2:00', { cutsPerMin: 0, wholeShare: 0.14, own: 8.40, black: 0.14, colourfulness: 98 }],
  ['JLS Liquid Loops 5:00-6:00 (3 dissolves)', { cutsPerMin: 0, wholeShare: 0.14, own: 3.75, black: 0.41, colourfulness: 85 }],
  ['glow ink in water', { cutsPerMin: 0, wholeShare: 0.41, own: 2.96, black: 0.58, colourfulness: 109 }],
  ['the app, rock take', { cutsPerMin: 0, wholeShare: 0.21, own: 3.98, black: 0.50, colourfulness: 106 }],
  ['the app, squeeze take', { cutsPerMin: 0, wholeShare: 0.23, own: 0.65, black: 0.41, colourfulness: 124 }],
];
const GENERAL_ROWS = [
  ['Big Buck Bunny 1:00-2:00', { cutsPerMin: 14, wholeShare: 0.21, own: 0.95, black: 0.02, colourfulness: 59 }],
  ['Big Buck Bunny 5:00-6:00', { cutsPerMin: 14, wholeShare: 0.23, own: 1.12, black: 0.07, colourfulness: 51 }],
  ['Sintel trailer', { cutsPerMin: 10.4, wholeShare: 0.53, own: 3.48, black: 0.42, colourfulness: 9 }],
  ['New York streets, one shot', { cutsPerMin: 0, wholeShare: 0.91, own: 2.52, black: 0.00, colourfulness: 5 }],
  ['New York streets, another', { cutsPerMin: 0, wholeShare: 0.98, own: 0.43, black: 0.00, colourfulness: 4 }],
  ['an interview', { cutsPerMin: 6, wholeShare: 0.89, own: 0.43, black: 0.04, colourfulness: 37 }],
];
{
  const bad = LIQUID_ROWS.filter(([, m]) => !readMode({ m }).liquid || liquidCues(m).some(c => !c.ok));
  check('(a) every measured liquid film reads liquid on all three cues', !bad.length, bad.map(b => b[0]).join(', ') || `${LIQUID_ROWS.length} of ${LIQUID_ROWS.length}`);
  const fails = GENERAL_ROWS.map(([n, m]) => [n, liquidCues(m).filter(c => !c.ok).length, readMode({ m }).liquid]);
  const weak = fails.filter(([, k, liq]) => liq || k < 2);
  check('(a) every measured general film reads general, failing at least two cues', !weak.length,
    fails.map(([n, k]) => `${n} ${k}`).join('; '));
  const dim = REAL_SHOW_CARDS.filter(r => !(r.blackMean >= MIN_NEAR_BLACK && r.colourfulness >= MIN_COLOURFULNESS));
  check(`(a) every real show in the card's calibration passes the light cue (near black >= ${MIN_NEAR_BLACK}, colourfulness >= ${MIN_COLOURFULNESS})`,
    REAL_SHOW_CARDS.length >= 3 && !dim.length, dim.map(r => `${r.name} ${r.blackMean}/${r.colourfulness}`).join(', ') || `${REAL_SHOW_CARDS.length} rows`);
}

// ─── (b) the choice ──────────────────────────────────────────────────────────
{
  const bunny = GENERAL_ROWS[0][1], loops = LIQUID_ROWS[0][1];
  const two = { ...loops, black: 0.02 };   // one take, its own motion, but daylight
  const page = { title: 'Liquid light show on an overhead projector with mineral oil and food colouring', description: '' };
  const cooking = { title: 'Pan-fried fish in olive oil, with a squid ink sauce', description: '' };
  check('(b) --liquid reads general footage as liquid, --general reads liquid footage as general',
    readMode({ forced: true, m: bunny }).liquid === true && readMode({ forced: false, m: loops }).liquid === false);
  const lifted = readMode({ m: two, info: page }), notLifted = readMode({ m: bunny, info: page }), noPage = readMode({ m: two });
  check('(b) a page naming a liquid technique lifts two cues to liquid, not one; no page, two cues stay general',
    lifted.liquid && lifted.how === 'page' && !notLifted.liquid && !noPage.liquid, `page words: ${lifted.page.join(', ')}`);
  const cook = readMode({ m: two, info: cooking });
  check('(b) a cooking page (olive oil, squid ink) names no liquid technique', !cook.liquid && !cook.page.length, cook.page.join(', ') || 'none');
}

// ─── clips ───────────────────────────────────────────────────────────────────
const W = 320, H = 180, FPS = 10, SEC = 16;
const ff = findFfmpeg();
async function encode(file, frame) {
  const p = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    '-an', '-c:v', 'libvpx', '-b:v', '2M', '-f', 'webm', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err.trim()}`)))));
  for (let f = 0; f < FPS * SEC; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
  return file;
}
// A street in daylight, as the tool sees one: a bright, muted, finely
// textured picture panned at 4% of the width a second, cut to another every
// 4 s (15 cuts a minute). The texture is fixed sines, so each shot moves only
// as the camera does.
function street(f) {
  const t = f / FPS, shot = Math.floor(t / 4), dx = t * 0.04 * W * (shot % 2 ? -1 : 1);
  const k = [[0.11, 0.07], [0.05, 0.13], [0.09, 0.09], [0.15, 0.04]][shot % 4], tint = [[1, 0.95, 0.85], [0.85, 0.95, 1], [0.95, 1, 0.9], [1, 0.9, 0.95]][shot % 4];
  const img = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x + dx;
    const v = 150 + 45 * Math.sin(u * k[0]) * Math.cos(y * k[1]) + 25 * Math.sin((u + 2 * y) * 0.031 + shot);
    const p = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) img[p + c] = Math.max(0, Math.min(255, v * tint[c]));
  }
  return img;
}
const take = blobTake(3, [[230, 90, 20], [200, 20, 120], [240, 200, 40], [20, 160, 200]], 0.5, W, H);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchmode-'));
const files = { street: await encode(path.join(dir, 'street.webm'), street), take: await encode(path.join(dir, 'take.webm'), take) };
const opts = (name, o = {}) => ({ out: path.join(dir, name), rate: 4, frames: 8, quiet: true, config: REPO_CONFIG, ...o });
const summary = r => fs.readFileSync(path.join(r.out, 'summary.md'), 'utf8');
const designJson = r => JSON.parse(fs.readFileSync(path.join(r.out, 'design.json'), 'utf8'));
// The wet show's own terms, from the words table itself (dark-ground, threads,
// lobes, cells, bloom, a turned dish...), less the two its general form keeps
// because they are general words too (luminous, fine). The check-skeptic's
// review: a scan of "liquid" and "oil" alone missed every one of them.
const WET = BANDS.filter(b => b.source === 'the wet show');
const WET_TERMS = new Set(WET.filter(b => !(b.general && !b.general.term)).map(b => b.term));
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The liquid show's vocabulary, and the sections only its read has. "## Read
// as" is left out of the scan: it is the one place that may say "liquid", to
// say why it was not.
const PROSE = new RegExp(`\\b(liquids?|oils?|dyes?|inks?|wet show|dish|pours?|fluid'?s?|real shows?|projector|marbling|filaments?|viscous|immiscible|lava|turbulence|${[...WET_TERMS].map(esc).join('|')})\\b`, 'gi');
const HEADS = /\/10:|## (Physics|Techniques|Report card|Settings to try)/g;
const outsideReadAs = md => md.split(/\n(?=## )/).filter(s => !s.startsWith('## Read as')).join('\n');
const liquidProse = md => [...new Set((outsideReadAs(md).match(PROSE) ?? []).map(w => w.toLowerCase()))];
const liquidVocab = md => [...liquidProse(md), ...new Set(outsideReadAs(md).match(HEADS) ?? [])];
// Where each area's words may come from (reelreader/skill/watch-words.md), with the
// general words' sources: film and photography lighting, Arnheim, Ching, Greenberg.
const DOC = fs.readFileSync(path.join(HERE, '..', 'reelreader', 'skill', 'watch-words.md'), 'utf8').toLowerCase();
const BOLD = new Set([...DOC.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].replace(/\s+/g, ' ').trim()));
const GENERAL_SOURCES = { light: ['itten', 'arnheim', 'photography'], form: ['greenberg', 'ching'] };
const generalOk = w => BOLD.has(String(w.term).toLowerCase()) && (GENERAL_SOURCES[w.area] ?? ['laban', 'ching', 'itten', 'greenberg', 'arnheim']).some(x => String(w.source).toLowerCase().includes(x)) && !/wet show/i.test(w.source);

// ─── (e) the liquid take, first: (c) compares against it ─────────────────────
const rTake = await watchVideo(files.take, opts('take'));
const takeMd = summary(rTake);
check('(e) a dye take on a dark ground reads liquid by itself, on all three cues', rTake.mode?.liquid === true && rTake.mode.how === 'footage' && rTake.mode.cues.every(c => c.ok),
  rTake.mode?.line);
check('(e) and gets the physics read and the report card', takeMd.includes('\n## Physics') && takeMd.includes('\n## Report card') && rTake.card?.canons?.length === 7);

// ─── (c) the street, general ─────────────────────────────────────────────────
const rStreet = await watchVideo(files.street, opts('street', { vs: rTake.out }));
const streetMd = summary(rStreet);
check('(c) the street reads general, failing all three cues, and says so with the cut count', rStreet.mode?.liquid === false && rStreet.mode.cues.length === 3 && rStreet.mode.cues.every(c => !c.ok) && /^Read as general footage, not a liquid light show: .*hard cuts a minute/m.test(streetMd),
  rStreet.mode?.line);
const missing = ['## Physics\n', '## Techniques', '## Report card', '## Settings to try', '## Physics against'].filter(s => streetMd.includes(s));
check('(c) no Physics, Techniques, Report card (side by side either), Settings to try or physics gaps, with a settings map configured and --vs given',
  !missing.length && streetMd.includes('## Motion') && streetMd.includes('## Design against'), missing.join(', ') || 'Motion and Design against present');
check('(c) no card in the result or in design.json; design.json says general', rStreet.card === null && designJson(rStreet).card === null && designJson(rStreet).mode?.liquid === false);
const wet = (rStreet.words?.words ?? []).filter(w => w.source === 'the wet show' || w.area === 'show' || WET_TERMS.has(w.term));
check("(c) no wet-show word in the street's words", (rStreet.words?.words?.length ?? 0) >= 4 && !wet.length,
  wet.map(w => w.term).join(', ') || `${rStreet.words.words.length} words: ${rStreet.words.words.map(w => w.term).join(', ')}`);
const unsourced = (rStreet.words?.words ?? []).filter(w => !generalOk(w));
check("(c) every one of the street's words is bold in reelreader/skill/watch-words.md with a general source", (rStreet.words?.words?.length ?? 0) >= 4 && !unsourced.length,
  unsourced.map(w => `${w.term} (${w.source})`).join(', ') || 'all');
const streetVocab = liquidVocab(streetMd);
check("(c) none of the liquid show's vocabulary anywhere in the street's summary", !streetVocab.length, streetVocab.join(', ') || 'clean');

// ─── (d) the street, --liquid ────────────────────────────────────────────────
const rForced = await watchVideo(files.street, opts('street-liquid', { liquid: true, vs: rTake.out }));
const forcedMd = summary(rForced);
const forcedProse = liquidProse(forcedMd);
const forcedWet = (rForced.words?.words ?? []).filter(w => WET_TERMS.has(w.term)).map(w => w.term);
check('(d) --liquid on the street brings back Physics, Techniques, the card and Settings to try', rForced.mode?.liquid === true && rForced.mode.how === '--liquid'
  && ['## Physics\n', '## Techniques', '## Report card', '## Settings to try'].every(s => forcedMd.includes(s)) && rForced.card?.canons?.length === 7);
check("(d) and the scan finds the liquid read's words in its prose, the wet-show terms its words said among them",
  forcedProse.length >= 4 && forcedWet.length >= 1 && forcedWet.every(t => forcedProse.includes(t)), `prose: ${forcedProse.join(', ')}; wet terms said: ${forcedWet.join(', ') || 'none'}`);

// ─── (f) the config's mode ───────────────────────────────────────────────────
const cfgGeneral = path.join(dir, 'general.config.json'), cfgBad = path.join(dir, 'bad.config.json');
fs.writeFileSync(cfgGeneral, JSON.stringify({ mode: 'general' }));
fs.writeFileSync(cfgBad, JSON.stringify({ mode: 'wet' }));
const rCfg = await watchVideo(files.take, opts('take-general', { config: cfgGeneral }));
check("(f) the config's mode general reads the dye take as general", rCfg.mode?.liquid === false && /config's mode, general/.test(rCfg.mode.line) && rCfg.card === null);
let badErr = '';
try { await watchVideo(files.take, opts('take-bad', { config: cfgBad })); } catch (e) { badErr = e.message; }
check('(f) a mode that is not auto, liquid or general is an error', /mode is "wet"/.test(badErr), badErr.split('\n')[0] || 'no error');

// ─── (g) before/after ────────────────────────────────────────────────────────
const areas = d => new Set([...d.changed, ...d.held].map(x => x.area));
const gPair = compareReads(rStreet, rStreet), lPair = compareReads(rTake, rTake);
check("(g) the before/after read of general films leaves out the show's own measures; liquid ones keep them",
  !areas(gPair).has('show') && areas(lPair).has('show') && areas(gPair).size >= 5, `general areas ${[...areas(gPair)].join(', ')}`);

// ─── (h) every general word, not only the ones the street reaches ──────────
{
  const bad = [];
  for (const b of WET.filter(x => x.general)) {
    const g = { ...b, ...b.general };
    const text = g.say(0.5, { lineAngle: 0 });
    if (WET_TERMS.has(g.term)) bad.push(`${b.term} keeps a wet term`);
    if (!generalOk(g)) bad.push(`${b.term} → ${g.term} (${g.source}) not bold or not a general source`);
    if (!/\d/.test(text) || (text.match(PROSE) ?? []).length) bad.push(`${b.term} → "${text}"`);
  }
  check('(h) every wet-show word with a general form has a general term, a general source, its number and no liquid word', WET.filter(x => x.general).length >= 8 && !bad.length,
    bad.join('; ') || `${WET.filter(x => x.general).length} general forms`);
  const wetIn = (r, liquid) => describe(r, { liquid }).words.filter(w => w.source === 'the wet show' || WET_TERMS.has(w.term)).map(w => w.term);
  const said = [...wetIn(rForced, true), ...wetIn(rTake, true)], left = [...wetIn(rForced, false), ...wetIn(rTake, false)];
  check('(h) describe() with liquid: false leaves out every wet-show word the liquid read of the same films says', said.length >= 2 && !left.length,
    `liquid read: ${said.join(', ')}; general read left: ${left.join(', ') || 'none'}`);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
