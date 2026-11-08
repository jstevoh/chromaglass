#!/usr/bin/env node
/**
 * The album sheet (PLAN.md 37x-3 in docs/plan/37-marketing.md): one record's
 * family of looks, written before its build.
 *
 *   npm run album -- --owed=sheet,lineage,builds,seeds     (node only, seconds)
 *   npm run albumplate -- --owed=carry                      (the built app; a WebGPU adapter)
 *
 * Every line here is written ahead of the code it measures, printed as owed
 * while it fails and red the day it passes with its id still listed (the
 * convention of `timers.mjs`, `wallflash.mjs` and `liveshow.mjs`). An owed
 * line is excused only while what it measures is absent: the module, or the
 * one export or check hook the line calls. A build that is there and misses
 * is red, owed or not.
 *
 * **The contract the build implements.** `src/lib/albumSheet.ts`, the sheet
 * as data with no browser in it, so the desks and the phone call the same
 * functions (CLAUDE.md, "the phone shares, never forks"):
 *
 *   readAlbumFile(text, known)   → { album, warnings }; throws on a file
 *                                  with nothing usable, as readSetListFile
 *                                  does. `known(key)` says a setting exists.
 *   trackPalette(album, i)       → the PALETTE indices (src/constants.ts)
 *                                  track i plays, four or five of them.
 *   trackStart(album, i)         → seconds on the album's clock.
 *   buildAt(album, sec)          → the building quantity's value at that
 *                                  second of the album's clock.
 *   trackSeed(album, i)          → a seed for rng.ts (a uint32).
 *   albumSetList(album)          → a SetList (setList.ts): the tracks in
 *                                  order, each item carrying its song. The
 *                                  Perform desk and the phone's Play screen
 *                                  both show this list.
 *
 * The file (`*.chromaglass-album.json`), as SHEET below writes it: format,
 * version, name, seed, palette (four or five PALETTE indices), build
 * ({ key, from, to }: a numeric setting that rises across the album), and
 * tracks, each { song, seconds, licence, look, fade?, opensOnBlack? }. Tracks carry
 * no palettes of their own: the lineage is derived from the album's one
 * palette, which is what "the sheet derives them from one place" means and
 * what `lineage` measures. A sheet may say more (a liquid, a motif, a hand
 * written step on a track); this check neither needs nor forbids it.
 *
 * **sheet.** SHEET reads with no warnings, its three tracks in order with
 * their licences, on the album's clock at 0, 200 and 380 s, and as a set list
 * of three items carrying their songs. A six-dye palette is refused (the
 * plate carries five, WORKING_DYES in src/presetPlate.ts), and a build on a
 * setting that does not exist is named, not taken.
 *
 * **lineage.** The distance between two palettes is the mean OKLab distance
 * of their dyes, paired the way that makes it least (every pairing tried; a
 * palette is a set, its order the hue walk's). The bars are not numbers
 * picked here but read from the looks that ship: on 2026-11-08 the 465 pairs
 * of shipped looks with five or more dyes (their first five, as the plate
 * draws them) sat at a median of 0.158, a tenth of them under 0.088; one
 * dye of Classic's five swapped for any other colour moves it 0.014 to
 * 0.138, median 0.070. So neighbouring tracks stay within half the median
 * of two different shipped looks, track 1 and track 3 differ by at least
 * 0.03 (one dye moved by about a palette step, ΔE 0.15, out of five), and on
 * a seven-track album track 7 is still nearer track 1 than two shipped looks
 * usually are to each other: "recognisably the same record" (the plan). Track
 * 1 plays the album's own palette. The bar is a one-dye swap's scale, and it
 * is meant to be: the plan also offered "a step around the wheel", and every
 * one of SHEET's five dyes moved one PALETTE hue along reads 0.125 one way
 * and 0.207 the other (the check-skeptic, 2026-11-08), more than half as far
 * as two different shipped looks; on a 24-colour palette the wheel's step is
 * too coarse to keep a record recognisable from song to song, so the plan's
 * item now says a track swaps a dye or two, never the whole palette.
 *
 * **builds.** buildAt sampled every second of the album never falls, starts
 * at `from`, peaks inside the last track at `to`, and no second moves it more
 * than the whole rise spread over Evolve's shortest glide (GLIDE_MIN in
 * slowEvolve.ts): so a staircase that jumps at each song boundary is red, and
 * so is a build that peaks in track 1 and holds.
 *
 * **seeds.** trackSeed is a uint32, the same read twice, read again, and in
 * a second, separate load of the module (a salt drawn at load would differ), different for each track, all different under another
 * album seed, and the same for track i whichever song is put at i: drawn from
 * the album's seed and the track's number, as the plan says, so the rehearsal
 * and the night start each song from the same laid pattern.
 *
 * **carry (the app).** The plate is not cleared between songs: what song 1
 * leaves on the glass is where song 2 starts. The app gains a check hook,
 * declared in src/lib/checkHooks.ts with its setter:
 *
 *   window.chromaglassAlbum(op?) → { track, tracks } | null
 *     op { load: text }   reads a sheet as the desk's Open would and puts
 *                         track 1 up as the album's start;
 *     op { go: i }        goes to track i (from 0) as the album does at that
 *                         song's boundary: its look, its palette, its seed.
 *
 * Read twice a moment apart (half a second, and on software the plate's
 * share of the steps; frame.mjs's settlePlate), the picture's luma on a 96x54
 * frame, and the settings, so a hook that answers and does nothing is red:
 * of the numeric settings track 2's look (Jellyfish Bloom) sets apart from
 * where the plate stood, a quarter and at least three have moved toward it.
 * Kept: the two reads correlated pixel by pixel (the same dye in the
 * same places under a changing grade; a new pattern laid after a clear
 * correlates near 0), and the second's luma spread at least HELD of the
 * first's (a pattern still there, not a flat field). Song 2's first second
 * keeps song 1's last by both, correlated at least KEEP; a track
 * marked `opensOnBlack` (SHEET's third) opens on a plate whose pattern is
 * gone (correlation under KEEP and under HELD of the spread) within ten
 * seconds, read every quarter second (so a build that clears and at once
 * lays a new pattern is seen; SHEET's black track has fade 0). Tracks fade
 * over their `fade` (8 s in SHEET, as a set item's does), so on a Mac the
 * grade has barely moved at the second read, half a second in: the first
 * version took the control's Go over 2 s and read it a second in, and in
 * software the half-done grade alone took the correlation from 0.85 on one
 * run to 0.60 on the next. The solver's mean dye
 * (`plateStats()`) is printed, not judged: in software it is read back
 * seldom, and on main it read 0.34 before Clear and 0.38 after it while the
 * picture had gone flat. Two lines that hold on main show the
 * readout can tell the two apart: a look taken with Go (useLookFades: "a
 * fade, without a clear", the path a song's look should ride) keeps the
 * plate by the same bars, and Clear (the action a pad fires) does not.
 *
 * What it does not say: whether a track's look is good, whether its palette
 * is the one the plate draws (the hook's go is trusted to apply it; the
 * owner judges the record), the motif, or the Design desk's editor.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'node_modules', '.cache', 'album');
mkdirSync(cache, { recursive: true });

const APP = process.argv.includes('--app');
const IDS = APP ? ['carry'] : ['sheet', 'lineage', 'builds', 'seeds'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

/** The check's own three-track album. Its input: a build changes the code, never this. */
const SHEET = {
  format: 'chromaglass-album',
  version: 1,
  name: 'Three songs for the check',
  seed: 20261108,
  palette: [0, 17, 2, 20, 18],   // yellow, amber, hot pink, magenta, ultramarine: Classic's first five
  build: { key: 'lampWarmth', from: 0, to: 1.5 },   // the lamp warming across the record
  tracks: [
    { song: { title: 'First Light', artist: 'The Check Band' }, seconds: 200, licence: 'CC BY 4.0', look: 'classic', fade: 8 },
    { song: { title: 'Second Pour', artist: 'The Check Band' }, seconds: 180, licence: 'CC BY 4.0', look: 'jellyfish-bloom', fade: 8 },
    { song: { title: 'Third Night', artist: 'The Check Band' }, seconds: 220, licence: 'CC BY-SA 4.0', look: 'classic', fade: 0, opensOnBlack: true },
  ],
};
const text = (o) => JSON.stringify(o, null, 2);

const bundle = async (contents, name) => {
  const outfile = join(cache, `${name}.mjs`);
  await build({ stdin: { contents, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
  return import(`${pathToFileURL(outfile).href}?${Date.now()}`);
};

if (!APP) {
  const base = await bundle(`
    export { PALETTE } from './src/constants';
    export { PRESET_CONTRACTS, WORKING_DYES } from './src/presetPlate';
    export { GLIDE_MIN } from './src/lib/slowEvolve';
    export { DEFAULT_SETTINGS } from './src/types';
  `, 'base');
  const libPath = join(root, 'src', 'lib', 'albumSheet.ts');
  const lib = existsSync(libPath) ? await bundle(`export * from './src/lib/albumSheet';`, 'albumSheet') : {};
  // A second, separate load of the same module: the rehearsal and the night are two sessions.
  const lib2 = existsSync(libPath) ? await bundle(`export * from './src/lib/albumSheet';`, 'albumSheet-again') : {};
  const has = (...names) => names.every((n) => typeof lib[n] === 'function');
  const missing = (...names) => { const m = names.filter((n) => typeof lib[n] !== 'function'); return m.length ? `no ${m.join(', ')} exported from src/lib/albumSheet.ts${existsSync(libPath) ? '' : ' (no such file)'}` : ''; };
  const known = (k) => typeof base.DEFAULT_SETTINGS[k] === 'number' || k in base.DEFAULT_SETTINGS;
  const attempt = (fn) => { try { return { value: fn() }; } catch (e) { return { error: String(e?.message ?? e) }; } };

  // ── OKLab and the palette distance ──
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const LAB = base.PALETTE.map(({ hex }) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  });
  const de = (a, b) => Math.hypot(LAB[a][0] - LAB[b][0], LAB[a][1] - LAB[b][1], LAB[a][2] - LAB[b][2]);
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  /** Mean OKLab distance, paired the way that makes it least; palettes of unequal size are as far apart as any. */
  const dist = (p, q) => {
    if (p.length !== q.length) return Infinity;
    let best = Infinity;
    for (const pp of perms(q)) { let s = 0; for (let i = 0; i < p.length; i++) s += de(p[i], pp[i]); best = Math.min(best, s / p.length); }
    return best;
  };
  const shipped = Object.values(base.PRESET_CONTRACTS).filter((c) => c.length >= 5).map((c) => c.slice(0, 5));
  const apart = [];
  for (let i = 0; i < shipped.length; i++) for (let j = i + 1; j < shipped.length; j++) apart.push(dist(shipped[i], shipped[j]));
  apart.sort((a, b) => a - b);
  const MEDIAN = apart[apart.length >> 1];
  const NEAR = MEDIAN / 2;
  const APART_MIN = 0.03;
  console.log(`  shipped looks: ${apart.length} pairs, median palette distance ${MEDIAN.toFixed(3)}; neighbours within ${NEAR.toFixed(3)}, tracks 1 and 3 at least ${APART_MIN} apart`);
  check('control: the distance sees a palette change and none (Classic to itself 0; to Lava Lamp more than the bar)',
    dist(shipped[0], shipped[0]) === 0 && dist(base.PRESET_CONTRACTS.classic.slice(0, 5), base.PRESET_CONTRACTS['lava-lamp'].slice(0, 5)) > NEAR,
    `Classic to Lava Lamp ${dist(base.PRESET_CONTRACTS.classic.slice(0, 5), base.PRESET_CONTRACTS['lava-lamp'].slice(0, 5)).toFixed(3)}`);

  const read = has('readAlbumFile') ? attempt(() => lib.readAlbumFile(text(SHEET), known)) : { error: missing('readAlbumFile') };
  const album = read.value?.album;
  const seven = has('readAlbumFile') ? attempt(() => lib.readAlbumFile(text({ ...SHEET, tracks: [0, 1, 2, 0, 1, 2, 0].map((i, n) => ({ ...SHEET.tracks[i], song: { ...SHEET.tracks[i].song, title: `Track ${n + 1}` }, opensOnBlack: undefined })) }), known)).value?.album : null;

  // ── sheet ──
  {
    const need = ['readAlbumFile', 'trackStart', 'albumSetList'];
    let ok = false, detail = missing(...need) || read.error || '';
    if (has(...need) && album) {
      const warnings = read.value.warnings ?? [];
      const titles = (album.tracks ?? []).map((t) => t.song?.title).join(' / ');
      const licences = (album.tracks ?? []).map((t) => t.licence).join(' / ');
      const starts = [0, 1, 2].map((i) => attempt(() => lib.trackStart(album, i)).value);
      const list = attempt(() => lib.albumSetList(album)).value;
      const items = list?.items ?? [];
      const six = attempt(() => lib.readAlbumFile(text({ ...SHEET, palette: [0, 17, 2, 20, 18, 8] }), known));
      const sixRefused = !!six.error || (six.value?.warnings ?? []).length > 0;
      const sixKept = (six.value?.album?.palette ?? []).length > base.WORKING_DYES;
      const badKey = attempt(() => lib.readAlbumFile(text({ ...SHEET, build: { key: 'lampWarmthh', from: 0, to: 1 } }), known));
      const named = !!badKey.error || (badKey.value?.warnings ?? []).some((w) => w.includes('lampWarmthh'));
      const parts = {
        'no warnings': warnings.length === 0,
        'three tracks in order': titles === 'First Light / Second Pour / Third Night',
        'licences kept': licences === 'CC BY 4.0 / CC BY 4.0 / CC BY-SA 4.0',
        'clock 0, 200, 380': starts.join() === '0,200,380',
        'a set list of the three, with their songs': items.length === 3 && items.map((it) => it.song?.title).join(' / ') === titles,
        'six dyes refused': sixRefused && !sixKept,
        'a build on no setting named': named,
      };
      ok = Object.values(parts).every(Boolean);
      detail = `${Object.entries(parts).filter(([, v]) => !v).map(([k]) => `not: ${k}`).join('; ') || 'all seven parts'}; tracks ${titles}; starts ${starts.join(', ')}; set list ${items.length} items${warnings.length ? `; warnings: ${warnings.join(' | ')}` : ''}`;
    }
    line('sheet', '37x-3: the album sheet reads as written, on the album\'s clock, and as a set list', ok, detail, !has(...need));
  }

  // ── lineage ──
  {
    const need = ['readAlbumFile', 'trackPalette'];
    let ok = false, detail = missing(...need) || read.error || '';
    if (has(...need) && album) {
      const pal = (a, i) => attempt(() => lib.trackPalette(a, i)).value ?? [];
      const valid = (p) => Array.isArray(p) && p.length >= 4 && p.length <= base.WORKING_DYES && new Set(p).size === p.length && p.every((c) => Number.isInteger(c) && c >= 0 && c < base.PALETTE.length);
      const three = [0, 1, 2].map((i) => pal(album, i));
      const seven7 = seven ? [0, 1, 2, 3, 4, 5, 6].map((i) => pal(seven, i)) : [];
      const nb = (ps) => ps.slice(1).map((p, i) => dist(ps[i], p));
      const n3 = nb(three), n7 = nb(seven7);
      const d13 = dist(three[0], three[2]);
      const d17 = seven7.length === 7 ? dist(seven7[0], seven7[6]) : Infinity;
      const parts = {
        'every palette four or five distinct dyes of PALETTE': [...three, ...seven7].every(valid) && seven7.length === 7,
        'track 1 plays the album palette': dist(three[0], SHEET.palette) === 0,
        [`neighbours within ${NEAR.toFixed(3)}`]: [...n3, ...n7].every((d) => d <= NEAR),
        [`tracks 1 and 3 at least ${APART_MIN} apart`]: d13 >= APART_MIN,
        [`track 7 nearer track 1 than ${MEDIAN.toFixed(3)}`]: d17 < MEDIAN,
      };
      ok = Object.values(parts).every(Boolean);
      const f = (ds) => ds.map((d) => (Number.isFinite(d) ? d.toFixed(3) : 'unequal sizes')).join(' ');
      detail = `${Object.entries(parts).filter(([, v]) => !v).map(([k]) => `not: ${k}`).join('; ') || 'all five parts'}; neighbours ${f(n3)} (seven tracks: ${f(n7)}); 1 to 3 ${f([d13])}; 1 to 7 ${f([d17])}; palettes ${three.map((p) => `[${p.join(',')}]`).join(' ')}`;
    }
    line('lineage', '37x-3: one palette lineage: neighbouring songs near, track 1 and track 3 apart, track 7 still the same record', ok, detail, !has(...need));
  }

  // ── builds ──
  {
    const need = ['readAlbumFile', 'trackStart', 'buildAt'];
    let ok = false, detail = missing(...need) || read.error || '';
    if (has(...need) && album) {
      const total = SHEET.tracks.reduce((s, t) => s + t.seconds, 0);
      const last = attempt(() => lib.trackStart(album, 2)).value ?? NaN;
      const { from, to } = SHEET.build;
      const range = to - from;
      const v = [];
      for (let t = 0; t <= total; t++) v.push(Number(attempt(() => lib.buildAt(album, t)).value));
      let falls = 0, worst = 0, peakAt = 0;
      for (let t = 1; t < v.length; t++) {
        if (v[t] < v[t - 1] - 1e-9) falls++;
        worst = Math.max(worst, Math.abs(v[t] - v[t - 1]));
        if (v[t] > v[peakAt] + 1e-9) peakAt = t;
      }
      const fastest = range / base.GLIDE_MIN;
      const parts = {
        'every second a number': v.every(Number.isFinite),
        'never falls': falls === 0,
        'starts at from': Math.abs(v[0] - from) <= 0.05 * range,
        'peaks at to inside the last track': peakAt >= last && Math.abs(v[peakAt] - to) <= 0.05 * range,
        [`no second moves it more than ${fastest.toFixed(3)}`]: worst <= fastest + 1e-9,
      };
      ok = Object.values(parts).every(Boolean);
      detail = `${Object.entries(parts).filter(([, x]) => !x).map(([k]) => `not: ${k}`).join('; ') || 'all five parts'}; ${SHEET.build.key} ${v[0]?.toFixed(3)} at 0 s, ${v[200]?.toFixed(3)} at 200 s, ${v[380]?.toFixed(3)} at 380 s, peak ${v[peakAt]?.toFixed(3)} at ${peakAt} s (last track from ${last} s), ${falls} falls, largest step ${worst.toFixed(4)} a second`;
    }
    line('builds', '37x-3: something builds: the album\'s quantity rises on the album\'s clock, at Evolve\'s pace, to its peak in the last song', ok, detail, !has(...need));
  }

  // ── seeds ──
  {
    const need = ['readAlbumFile', 'trackSeed'];
    let ok = false, detail = missing(...need) || read.error || '';
    if (has(...need) && album) {
      const seeds = (a) => [0, 1, 2].map((i) => attempt(() => lib.trackSeed(a, i)).value);
      const s = seeds(album), again = seeds(album);
      const reread = attempt(() => lib.readAlbumFile(text(SHEET), known)).value?.album;
      const s2 = reread ? seeds(reread) : [];
      const fresh = typeof lib2.trackSeed === 'function' && typeof lib2.readAlbumFile === 'function'
        ? [0, 1, 2].map((i) => attempt(() => lib2.trackSeed(lib2.readAlbumFile(text(SHEET), known).album, i)).value) : [];
      const other = attempt(() => lib.readAlbumFile(text({ ...SHEET, seed: SHEET.seed + 1 }), known)).value?.album;
      const so = other ? seeds(other) : [];
      const swapped = attempt(() => lib.readAlbumFile(text({ ...SHEET, tracks: [SHEET.tracks[0], SHEET.tracks[2], SHEET.tracks[1]] }), known)).value?.album;
      const ss = swapped ? seeds(swapped) : [];
      const u32 = (x) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
      const parts = {
        'each a uint32': s.every(u32),
        'the same read twice, read again, and in a fresh load of the module': s.join() === again.join() && s.join() === s2.join() && s.join() === fresh.join(),
        'a different one for each track': new Set(s).size === 3,
        'all different under another album seed': so.length === 3 && so.every((x, i) => x !== s[i]),
        'track i\'s whichever song is at i': ss.join() === s.join(),
      };
      ok = Object.values(parts).every(Boolean);
      detail = `${Object.entries(parts).filter(([, x]) => !x).map(([k]) => `not: ${k}`).join('; ') || 'all five parts'}; seeds ${s.join(', ')}; another album seed ${so.join(', ')}; songs 2 and 3 swapped ${ss.join(', ')}`;
    }
    line('seeds', '37x-3: one seed lineage: each track\'s seed drawn from the album\'s and the track\'s number', ok, detail, !has(...need));
  }
} else {
  // ── carry: the built app ──
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const { launchChromium, port } = await import('./chromium.mjs');
  const { engineQuery, installFrameReader, frameOf, lastFrameRead, settlePlate, waitForShow } = await import('./frame.mjs');
  const PORT = port(4395, 'ALBUM_PORT');
  const KEEP = 0.6;    // the two reads' luma, correlated: the same pattern of dye
  const HELD = 0.5;    // the pattern's luma spread a second later, of what it was
  const W = 96, H = 54;
  const { PRESETS } = await bundle(`export { PRESETS } from './src/presets';`, 'presets');
  const JELLY = PRESETS.find((p) => p.id === 'jellyfish-bloom').settings;
  /*
    Did the Go (or the song change) happen at all? A hook that answered and
    changed nothing would leave the plate as it was and read as kept (the
    check-skeptic, 2026-11-08). So the settings are read too: of the numeric
    settings Jellyfish Bloom (track 2's look and the control's) sets apart
    from where the plate stood, a quarter, and at least three, have moved
    toward its values by the second read.
  */
  const settingsNow = (page) => page.evaluate(() => window.chromaglassSettings?.() ?? null);
  const toward = (s0, s1, target) => {
    if (!s0 || !s1) return { moved: 0, of: 0 };
    let moved = 0, of = 0;
    for (const [k, t] of Object.entries(target)) {
      if (typeof t !== 'number' || typeof s0[k] !== 'number' || typeof s1[k] !== 'number' || Math.abs(s0[k] - t) < 1e-6) continue;
      of++;
      if (Math.abs(s1[k] - t) < Math.abs(s0[k] - t) - 1e-9) moved++;
    }
    return { moved, of };
  };
  const began = (m) => m.moved >= 3 && m.moved >= 0.25 * m.of;

  const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { cwd: root, detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
  let leaving = false;
  server.on('exit', (code) => { if (!leaving) { console.error(`preview server exited (${code})`); process.exit(2); } });
  const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
  process.on('exit', stop);
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
  await new Promise((r) => setTimeout(r, 2500));

  const browser = await launchChromium(chromium, { present: true });
  const errors = [];
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
    await page.evaluate(() => document.body.classList.add('overlays-hidden'));
    const opened = await waitForShow(page, 90_000);
    return { page, opened };
  };
  /*
    One read: the solver's mean dye and the picture's luma. The first
    version counted lit pixels, and on main it read 86% of Classic's frame
    lit and 100% after Clear: the lamp lights the empty glass, so "lit"
    could not see dye go. The pattern can: the luma of the two reads,
    correlated pixel by pixel, is near 1 while the same dye sits in the same
    places under a changing grade, and falls to nothing when the dye goes or
    a new pattern is laid in its place.
  */
  const readPlate = async (page) => {
    const mean = await page.evaluate(() => window.chromaglassDebug?.().plateStats?.()?.[0]?.mean ?? null);
    const px = await frameOf(page, W, H);
    const luma = px ? Array.from({ length: W * H }, (_, i) => (0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2]) / 255) : null;
    return { mean, luma, how: px ? null : await lastFrameRead(page) };
  };
  const spread = (r) => {
    if (!r.luma) return 0;
    const m = r.luma.reduce((s, v) => s + v, 0) / r.luma.length;
    return Math.sqrt(r.luma.reduce((s, v) => s + (v - m) ** 2, 0) / r.luma.length);
  };
  const kept = (a, b) => {
    if (!a.luma || !b.luma) return null;
    const n = a.luma.length;
    const ma = a.luma.reduce((s, v) => s + v, 0) / n, mb = b.luma.reduce((s, v) => s + v, 0) / n;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { const x = a.luma[i] - ma, y = b.luma[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  };
  const say = (a, b) => `luma spread ${spread(a).toFixed(3)} then ${spread(b).toFixed(3)}, pattern correlation ${kept(a, b) === null ? 'unread' : kept(a, b).toFixed(3)}, mean dye ${a.mean?.toFixed?.(4)} then ${b.mean?.toFixed?.(4)}${a.how || b.how ? `; read: ${JSON.stringify(a.how ?? b.how)}` : ''}`;
  const carries = (a, b) => kept(a, b) !== null && kept(a, b) >= KEEP && spread(b) >= HELD * spread(a);
  /** The pattern gone: no longer correlated, and under HELD of the spread it had (the lamp's own falloff stays). */
  const blank = (before, after) => kept(before, after) !== null && kept(before, after) < KEEP && spread(after) < HELD * spread(before);
  /*
    Up to ten seconds for a clear or a drain to land, read every quarter
    second (on software, every step), keeping the read nearest to black. On
    the Mac's first run (#732) Clear left the old pattern (correlation 0.36)
    but the last read held half its spread again: the plate refills itself
    after a clear (the automation and the visualizer's reseed after a
    drain), so a black that lasts a moment is the black there is, and the
    last read is the wrong one to judge.
  */
  const untilBlank = async (page, before) => {
    const t0 = Date.now(); let best = null;
    while (Date.now() - t0 < 10_000) {
      await settlePlate(page, 250);
      const c = await readPlate(page);
      if (!best || (c.luma && spread(c) < spread(best))) best = c;
      if (blank(before, best)) break;
    }
    return best ?? before;
  };

  try {
    // The readout, on main as on the build: Go keeps the plate, Clear does not.
    {
      const { page, opened } = await open();
      check('the show opened (a WebGPU adapter: on a Mac, or with PW_WEBGPU=1)', opened !== null, opened === null ? 'no solver step in 90 s' : `${opened.toFixed(1)} s`);
      if (opened !== null) {
        await settlePlate(page, 4000);
        const a = await readPlate(page);
        check('there is a pattern of dye on the plate to carry', spread(a) >= 0.03, say(a, a));
        const s0 = await settingsNow(page);
        const t0 = Date.now();
        await page.evaluate(() => window.chromaglassGo?.('jellyfish-bloom', 8));
        await settlePlate(page, 500);
        const b = await readPlate(page);
        const ms = Date.now() - t0;
        const m = toward(s0, await settingsNow(page), JELLY);
        check(`control: a look taken with Go keeps the plate (its pattern correlated at least ${KEEP}, at least ${HELD * 100}% of its spread) while its settings move`, began(m) && carries(a, b),
          `${m.moved} of ${m.of} settings moving toward Jellyfish Bloom's; ${say(a, b)}; read ${ms} ms after the Go`);
        await page.evaluate(() => window.chromaglassAction?.('clear'));
        const c = await untilBlank(page, b);
        // Clear's own claim is that the pattern goes; whether the plate stays dark after is the automation's, not Clear's.
        check('control: and Clear does not: the old pattern gone within ten seconds, by the same reading', (kept(b, c) ?? 1) < KEEP, `nearest-black read: ${say(b, c)}`);
      }
      await page.close();
    }
    // The album: song 2 starts on what song 1 left; a track that says so opens on black.
    {
      const { page, opened } = await open();
      const hook = await page.evaluate(() => typeof window.chromaglassAlbum === 'function');
      if (opened === null) check('the album\'s page opened', false, 'no solver step in 90 s');
      else if (!hook) line('carry', '37x-3: the plate is not cleared between songs; a track marked opensOnBlack opens on black', false, 'no window.chromaglassAlbum hook (src/lib/checkHooks.ts)', true);
      else {
        const loaded = await page.evaluate((t) => window.chromaglassAlbum({ load: t }), text(SHEET));
        await settlePlate(page, 4000);
        const a = await readPlate(page);
        const s0 = await settingsNow(page);
        const t0 = Date.now();
        const went = await page.evaluate(() => window.chromaglassAlbum({ go: 1 }));
        await settlePlate(page, 500);
        const b = await readPlate(page);
        const ms = Date.now() - t0;
        const m = toward(s0, await settingsNow(page), JELLY);
        await page.evaluate(() => window.chromaglassAlbum({ go: 2 }));
        const c = await untilBlank(page, b);
        const parts = {
          'loaded: three tracks, on track 1': loaded?.tracks === 3 && loaded?.track === 0,
          'went to track 2, its look\'s settings moving': went?.track === 1 && began(m),
          'a pattern of dye at song 1\'s end': spread(a) >= 0.03,
          'song 2 starts on it': carries(a, b),
          'song 3 opens on black': blank(b, c),
        };
        line('carry', '37x-3: the plate is not cleared between songs; a track marked opensOnBlack opens on black', Object.values(parts).every(Boolean),
          `${Object.entries(parts).filter(([, x]) => !x).map(([k]) => `not: ${k}`).join('; ') || 'all five parts'}; song 1 to 2: ${m.moved} of ${m.of} settings moving, ${say(a, b)}, read ${ms} ms after; song 3's nearest-black read: ${say(b, c)}`, false);
      }
      await page.close();
    }
  } catch (e) {
    check('the run finished', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed${owed.size ? ` (owed: ${[...owed].join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
