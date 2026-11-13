#!/usr/bin/env node
/**
 * Hear the set ahead, from files (PLAN.md §17, docs/plan/17-hear-ahead.md):
 * the checks written before the build.
 *
 *   npm run hearahead -- --owed=files,sections,ahead,loudness,clock,tags   (node only)
 *
 * Live, the show only reacts: a song's map is made from its first play, so
 * at a gig the first time a song is played nothing is known ahead of the
 * note that is sounding. §17 has the show play the set from the performer's
 * own files, analyse each song before the show with the code the film render
 * already uses (`SongEar`, src/lib/songTrack.ts), and so know every beat and
 * section before it sounds. These lines are the contract the build meets,
 * each named by an id in `--owed` while it is owed: printed as owed while it
 * fails in main's state (what it asks for is absent), red the day it passes
 * with its id still listed, and red if what it asks for has been built and
 * misses. The convention is `timers.mjs`'s and `deskreach.mjs`'s; the build
 * takes its id out of `--owed` in scripts/checks.json and never edits a line.
 *
 * The song. A made-up record, so every beat and every section change is
 * known to the sample: 126 BPM at 48 kHz (128 from the drop), an intro of pad alone (32 beats),
 * a verse with a kick and a bass (64), a chorus whose chords change and whose
 * hats come in (64), a breakdown of pad alone with no beat (32), a drop with
 * everything, louder (64), an outro of kick and pad (32), and a three-second
 * tail of pad after the last kick, and a kick on the off-beat of each of the
 * verse's last four beats (a fill the ear hears as hits, off the pace).
 * 139 s; `SongEar` reads it in about two seconds here. The changes fall on beats 32, 96, 160, 192 and 256, which are
 * not whole seconds, so a boundary rounded to the second is caught.
 *
 * **ear** (holds on main): `SongEar` at 60 fps, the render's own ear, hears
 * the made-up kicks: at least 98% of them within 25 ms (a frame and a half),
 * three of the fill's four off-beat kicks heard as hits (so the grid has hits
 * to refuse), and at most 2% of its beats where there is neither. This is what makes the
 * song a fair test; if it fails, the song or the ear changed, not the build.
 *
 * **files** (17a): `analyseSongAhead(pcm, sampleRate)` from
 * src/lib/hearAhead.ts. Its `hits` are exactly the frames where `SongEar`
 * hears a beat (`features.beat.hit`), at `i / 60` s: the same ear as the
 * render, not a second beat tracker that could disagree with it. Its `grid`
 * runs from the first hit to the last and carries on through the breakdown
 * at the song's pace, following its step to 128 and refusing the fill's
 * off-beat hits: a beat within 25 ms of every true beat from 32 to 287,
 * and none more than 25 ms from one. `durationSec` is the samples over the
 * rate exactly. Two runs give the same JSON, and the JSON is at most 8 KB a
 * minute of song, so a twenty-song set's analyses are kept in IndexedDB and
 * a whole set is never held as the render's per-frame readings (a few KB a
 * frame, tens of MB a song).
 *
 * **sections** (17b): its `sections` cover the song end to end, with a
 * boundary within one beat of every true change and no boundary more than a
 * beat from one, each boundary within 25 ms of a beat of the grid, and
 * exactly one section a `drop` (by `sectionKind`): the one where the beat
 * comes back after the breakdown (a build that called every section a drop
 * would fire a drop's lead before each of them).
 * Today's segmenter (`segment` in src/lib/songMapAnalysis.ts, ~1 s
 * super-frames, chroma and brightness only) is printed for comparison: on
 * the scratch measurement of 2026-11-08 it merged a drum entrance with an
 * unchanged pad into the intro, which is the change anticipation most needs.
 *
 * **ahead** (17c): a lead on a "when", in beats, not seconds. On a hand-made
 * song whose grid is uneven (no beat for 4 s, the bridge slower, a chorus
 * starting between two beats), `dueActions` given a clock whose `ahead`
 * carries the grid and sections fires
 * `{ at: 'section', section: 'drop', beatsAhead: 4 }` once, on the first
 * tick (1/60 s) at or after the fourth grid beat before the drop, while the
 * clock still says the bridge; `{ at: 'section', section: 'chorus',
 * beatsAhead: 2 }` two beats before each chorus, once each; the second
 * chorus with `nth: 2` and `beatsAhead: 8` only before that one;
 * `{ at: 'last-beat' }` on the song's last grid beat, and with `beatsAhead:
 * 8` eight beats before it; a lead reaching before the grid's first beat
 * fires on that beat. Then the same on the made-up song with its own
 * `SongAhead` as the clock's `ahead` (the analysis and the lead joined): the
 * drop's lead on beat 188, the last-beat action on beat 287. And the lead
 * survives a file and an assistant: `parseSongAction` keeps `beatsAhead` as
 * whole beats from 1 to 64 and knows `last-beat`, and `describeWhen` says
 * "4 beats before every drop", "8 beats before the last beat" and "On the
 * last beat".
 *
 * **late** (holds on main): the same show with nothing known ahead (the first
 * live listen, `ahead` null): a lead fires on the section itself, late but
 * never lost, and a last-beat action does not fire at all, because nothing
 * can know the last beat until the song is over.
 *
 * **loudness** (17d): `songLoudness(pcm, sampleRate)`, ITU-R BS.1770 on the
 * mono mix (K-weighting, 400 ms blocks overlapping by 75%, the -70 LUFS
 * absolute gate and the -10 LU relative gate). Sines at -20 dBFS read, within
 * 0.1, -23.0 LUFS at 1 kHz, -26.60 at 60 Hz and -19.66 at 10 kHz (the
 * K-weighting; at 1 kHz alone a plain RMS passes), and -23.0 at 1 kHz at
 * 44.1 kHz (the filter at another rate); the analysis's `loudnessLufs` is
 * this function's reading of the song; the song made 12 dB quieter reads 12.0 lower
 * (within 0.05); thirty seconds of digital silence after it move it by under
 * 0.1, and thirty seconds of pad 25 dB down by under 0.5 (the gates).
 *
 * **clock** (17e): `setPosition(durations, gapSec, elapsedSec)`, where in the
 * set the player is, to the sample: the song and the seconds since its first
 * note, negative in the gap before it (a count-in a show can read), null when
 * the set is over.
 *
 * **tags** (17f): `readSongTags(bytes)` reads the ISRC (normalised to its
 * twelve characters, hyphens dropped, upper case; anything else is no ISRC),
 * title, artist and front cover (picture type 3, before a back cover) from
 * ID3v2.4 (synchsafe sizes, the frames over 127 bytes), ID3v2.3 (a UTF-16
 * title) and a FLAC's Vorbis comment and PICTURE block; a twelve-character
 * ISRC of the wrong form is refused; a file with no tags gives an empty
 * object and a truncated tag never throws.
 *
 * Once src/lib/hearAhead.ts exists, every owed line is red unless it passes:
 * an export misnamed is a build that misses, not one still owed.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'node_modules', '.cache', 'hearahead');
mkdirSync(cache, { recursive: true });

const IDS = ['files', 'sections', 'ahead', 'loudness', 'clock', 'tags'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** An owed line: excused only in main's state, red once it passes with its id still listed. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

// ── The code under test, bundled (the lib is TypeScript with .ts imports) ──
const lib = (f) => JSON.stringify(join(root, 'src', 'lib', f));
const hasAhead = existsSync(join(root, 'src', 'lib', 'hearAhead.ts'));
const entry = join(cache, 'entry.ts');
writeFileSync(entry, [
  `export * as shows from ${lib('songShows.ts')};`,
  `export { SongEar } from ${lib('songTrack.ts')};`,
  `export { analyze, segment } from ${lib('songMapAnalysis.ts')};`,
  hasAhead ? `export * as ahead from ${lib('hearAhead.ts')};` : 'export const ahead = null;',
].join('\n'));
const outfile = join(cache, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
const { shows, SongEar, analyze, segment, ahead } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
console.log(`  src/lib/hearAhead.ts: ${hasAhead ? 'present' : 'absent (main\'s state)'}`);
/** The build's export, or null when it is not there yet (main's state). */
const fn = (name) => (ahead && typeof ahead[name] === 'function' ? ahead[name] : null);

// ── The made-up song ─────────────────────────────────────────────────
// 126 BPM to the drop, 128 from it: a grid drawn from the first hit to the
// last in even steps, or at one global pace, misses the step (check-skeptic,
// 2026-11-08: a linspace grid passed a metronomic song).
const SR = 48000, BPM = 126, BPM2 = 128, BEAT = 60 / BPM, BEAT2 = 60 / BPM2, STEP_BEAT = 192;
const PLAN = [ // [first beat, beats, kind]
  [0, 32, 'intro'], [32, 64, 'verse'], [96, 64, 'chorus'], [160, 32, 'breakdown'], [192, 64, 'drop'], [256, 32, 'outro'],
];
const LAST_BEAT = 287, TAIL = 3;
/** When beat `b` (a fraction for a sixteenth) falls, in seconds. */
const beatTime = (b) => (b < STEP_BEAT ? b * BEAT : STEP_BEAT * BEAT + (b - STEP_BEAT) * BEAT2);
/** Which beat (with its fraction) a time falls in: beatTime's inverse. */
const beatAt = (t) => (t < STEP_BEAT * BEAT ? t / BEAT : STEP_BEAT + (t - STEP_BEAT * BEAT) / BEAT2);
const CHANGES = [32, 96, 160, 192, 256].map(beatTime);
const TRUE_KICKS = [];
for (const [b0, n, kind] of PLAN) if (!['intro', 'breakdown'].includes(kind)) for (let b = b0; b < b0 + n; b++) TRUE_KICKS.push(beatTime(b));
// A fill at the end of the verse: a kick on the off-beat ("and") of each of
// its last four beats. The ear hears three of the four as hits (sixteenths
// it does not: the beat ear will not take hits that close); the grid must not
// take them.
const FILL = [92.5, 93.5, 94.5, 95.5];
const FILL_TIMES = FILL.map(beatTime);
const TRUE_GRID = Array.from({ length: LAST_BEAT - 32 + 1 }, (_, i) => beatTime(32 + i));

function makeSong(gain = 1) {
  const sec = beatTime(LAST_BEAT + 1) + TAIL;
  const n = Math.round(sec * SR), pcm = new Float32Array(n);
  let seed = 7;
  const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const sin = (hz, t) => Math.sin(2 * Math.PI * hz * t);
  const kick = (tb, amp) => amp * Math.exp(-tb * 18) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-tb * 30)) * tb);
  // The pad's chords by section: A minor, then F and C in the chorus and drop.
  const chord = { intro: [220, 261.6, 329.6], verse: [220, 261.6, 329.6], chorus: [174.6, 220, 261.6],
    breakdown: [174.6, 220, 261.6], drop: [196, 246.9, 293.7], outro: [220, 261.6, 329.6] };
  const bassHz = { verse: 55, chorus: 43.65, drop: 49, outro: 55 };
  const end = beatTime(LAST_BEAT + 1);
  for (let i = 0; i < n; i++) {
    const t = i / SR, beat = beatAt(t), b = Math.floor(beat);
    const sect = PLAN.find(([b0, len]) => b >= b0 && b < b0 + len)?.[2] ?? 'tail';
    const tailFade = sect === 'tail' ? Math.max(0, 1 - (t - end) / TAIL) : 1;
    const c = chord[sect] ?? chord.outro;
    let s = 0.05 * (sin(c[0], t) + sin(c[1], t) + sin(c[2], t)) * tailFade;
    const kicks = sect === 'verse' || sect === 'chorus' || sect === 'drop' || sect === 'outro';
    if (kicks) {
      const tb = t - beatTime(b);
      s += kick(tb, 0.7);
      // A plucked bass, one note a beat dying away: a drone held under the
      // kick masks it from the ear (it heard 162 of 224 with a held 55 Hz sine).
      if (bassHz[sect]) s += 0.12 * sin(bassHz[sect], t) * Math.exp(-tb * 3);
    }
    for (const f of FILL) { const tf = t - beatTime(f); if (tf >= 0 && tf < 0.2) s += kick(tf, 0.7); }
    if (sect === 'chorus' || sect === 'drop') {
      const th = t - beatTime(b + 0.5);
      if (th >= 0) s += 0.12 * Math.exp(-th * 60) * noise();
    }
    if (sect === 'drop') s *= 1.6;
    pcm[i] = s * gain;
  }
  return pcm;
}
const pcm = makeSong();
const minutes = pcm.length / SR / 60;
console.log(`  the song: ${(pcm.length / SR).toFixed(2)} s at ${SR} Hz, ${BPM} BPM then ${BPM2} from the drop, off-beat kicks ending the verse, changes at ${CHANGES.map((t) => t.toFixed(3)).join(', ')} s`);

/** How many of `truth` have one of `found` within `tol`, and how many of `found` have none of `truth`. */
function match(truth, found, tol) {
  const near = (x, list) => list.some((y) => Math.abs(x - y) <= tol);
  return { hit: truth.filter((x) => near(x, found)).length, extra: found.filter((y) => !near(y, truth)).length };
}
const TOL = 0.025;

// ── ear: the render's ear hears the song (holds on main) ─────────────
const refHits = [];
{
  const t0 = performance.now();
  const ear = new SongEar(pcm, SR, 60);
  for (let i = 0; i < ear.frames; i++) if (ear.next().features.beat?.hit) refHits.push(i / 60);
  const m = match(TRUE_KICKS, refHits, TOL);
  const f = match(FILL_TIMES, refHits, TOL);
  const extra = match([...TRUE_KICKS, ...FILL_TIMES], refHits, TOL).extra;
  check('ear: SongEar at 60 fps hears the made-up kicks, and the fill as hits (the song is a fair test)',
    m.hit >= 0.98 * TRUE_KICKS.length && f.hit >= 3 && extra <= 0.02 * refHits.length,
    `${m.hit}/${TRUE_KICKS.length} kicks within 25 ms, ${f.hit}/${FILL.length} of the fill's off-beat kicks, ${extra} of ${refHits.length} beats with neither, ${(performance.now() - t0).toFixed(0)} ms`);
}

// ── files: a song analysed ahead, by the render's ear ────────────────
const analyse = fn('analyseSongAhead');
let A = null;
{
  let detail = 'no analyseSongAhead in src/lib/hearAhead.ts', ok = false;
  if (analyse) {
    const t0 = performance.now();
    A = analyse(pcm, SR);
    const ms = performance.now() - t0;
    const again = JSON.stringify(analyse(pcm, SR));
    const json = JSON.stringify(A);
    const hits = A?.hits ?? [], grid = A?.grid ?? [];
    const sameHits = hits.length === refHits.length && hits.every((h, i) => Math.abs(h - refHits[i]) < 1e-9);
    const g = match(TRUE_GRID, grid, TOL);
    const durOk = A?.durationSec === pcm.length / SR;
    const kbPerMin = json.length / 1000 / minutes;
    ok = sameHits && g.hit === TRUE_GRID.length && g.extra === 0 && durOk && again === json && kbPerMin <= 8;
    detail = `hits ${sameHits ? 'are' : 'are NOT'} SongEar's (${hits.length} vs ${refHits.length}); grid ${g.hit}/${TRUE_GRID.length} true beats, ${g.extra} extra; `
      + `duration ${durOk ? 'exact' : `${A?.durationSec} vs ${pcm.length / SR}`}; ${again === json ? 'deterministic' : 'two runs DIFFER'}; `
      + `${kbPerMin.toFixed(1)} KB a minute; ${ms.toFixed(0)} ms`;
  }
  line('files', '17a: a song analysed ahead by the render\'s own ear, its beat grid through the breakdown, small and the same every run',
    ok, detail, !hasAhead);
}

// ── sections: boundaries on the beat, the drums' entrance seen, the drop named ──
{
  const today = segment(analyze(pcm.length ? downTo22k(pcm) : pcm, 22050));
  console.log(`  today's segmenter (songMapAnalysis): ${today.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)} ${s.label}`).join(', ')}`);
  let detail = 'no analysis to read sections from', ok = false;
  if (A) {
    const S = A.sections ?? [];
    const bounds = S.slice(1).map((s) => s.start);
    const covers = S.length > 0 && S[0].start === 0 && Math.abs(S[S.length - 1].end - A.durationSec) < 1e-6
      && S.every((s, i) => i === 0 || Math.abs(s.start - S[i - 1].end) < 1e-9);
    const m = match(CHANGES, bounds, BEAT);
    const onGrid = bounds.filter((x) => (A.grid ?? []).some((g) => Math.abs(g - x) <= TOL)).length;
    // Exactly one drop, and it is the beat's return: a build that names every
    // section a drop would fire a drop's lead before every section.
    const drops = S.filter((s) => shows.sectionKind(s.label) === 'drop');
    const drop = drops.length === 1 && Math.abs(drops[0].start - beatTime(STEP_BEAT)) <= BEAT ? drops[0] : null;
    ok = covers && m.hit === CHANGES.length && m.extra === 0 && onGrid === bounds.length && !!drop;
    detail = `${S.map((s) => `${s.start.toFixed(2)} ${s.label}`).join(', ')}; ${covers ? 'covers the song' : 'does NOT cover the song end to end'}; `
      + `${m.hit}/${CHANGES.length} changes within a beat, ${m.extra} boundaries away from one, ${onGrid}/${bounds.length} on the grid; `
      + `${drops.length} section(s) a drop${drop ? ', the beat\'s return' : `, want one, at ${beatTime(STEP_BEAT).toFixed(2)} s`}`;
  }
  line('sections', '17b: sections end to end, a boundary on the beat at every change (the drums coming in too), the drop named',
    ok, detail, !hasAhead);
}

/** A plain 48k → 22.05k resample for today's segmenter (what songMap.ts's decode hands it), for the printout only. */
function downTo22k(x) {
  const r = 22050 / SR, n = Math.floor(x.length * r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i / r, j = Math.floor(p), f = p - j; out[i] = x[j] * (1 - f) + (x[j + 1] ?? 0) * f; }
  return out;
}

// ── ahead and late: a lead on a "when", in beats ─────────────────────
{
  // A hand-made song, independent of the analysis, and uneven on purpose
  // (check-skeptic, 2026-11-08: on an even grid a lead in seconds,
  // start - beats x the first gap, passed for one in beats): no beat for the
  // first 4 s, then 120 BPM, the bridge slower (a beat every 0.55 s), 120
  // again from the drop; the second chorus starts between two beats (90.25).
  const MAP = [
    [0, 12, 'intro'], [12, 40, 'verse'], [40, 62, 'chorus'], [62, 90.25, 'verse'],
    [90.25, 112, 'chorus'], [112, 134, 'bridge'], [134, 164, 'drop'], [164, 180, 'outro'],
  ].map(([start, end, label]) => ({ start, end, label }));
  const GRID = [
    ...Array.from({ length: 216 }, (_, i) => 4 + i * 0.5),
    ...Array.from({ length: 40 }, (_, i) => 112 + i * 0.55),
    ...Array.from({ length: 92 }, (_, i) => 134 + i * 0.5),
  ];
  const DURATION = 180;
  const act = (id, when) => ({ id, when, what: { do: 'dyes' } });
  const A2 = {
    drop4: act('drop4', { at: 'section', section: 'drop', beatsAhead: 4 }),
    chorus2: act('chorus2', { at: 'section', section: 'chorus', beatsAhead: 2 }),
    second8: act('second8', { at: 'section', section: 'chorus', nth: 2, beatsAhead: 8 }),
    last: act('last', { at: 'last-beat' }),
    last8: act('last8', { at: 'last-beat', beatsAhead: 8 }),
    plain: act('plain', { at: 'section', section: 'chorus' }),
    verse32: act('verse32', { at: 'section', section: 'verse', nth: 1, beatsAhead: 32 }), // reaches before the grid: its first beat
  };
  const show = { id: 's', song: { title: 'T', artist: 'A' }, look: { kind: 'preset', id: 'classic' }, actions: Object.values(A2) };
  const play = (known) => {
    const fired = new Map(), log = Object.fromEntries(Object.keys(A2).map((k) => [k, []]));
    const sectionAtFire = {};
    const tick = shows.SONG_SHOW_TICK_MS / 1000;
    for (let k = 0; k * tick <= DURATION; k++) {
      const t = k * tick;
      const clock = { t, duration: DURATION, ...shows.sectionsAt(MAP, t), kicks: Math.floor(t * 2), ahead: known ? { grid: GRID, sections: MAP } : null };
      for (const a of shows.dueActions(show, clock, fired)) { log[a.id].push(t); sectionAtFire[a.id] ??= clock.section?.label; }
    }
    return { log, sectionAtFire };
  };
  const tick = shows.SONG_SHOW_TICK_MS / 1000;
  const firedAt = (times, targets) => times.length === targets.length
    && times.every((t, i) => t >= targets[i] - 1e-6 && t < targets[i] + tick + 1e-6);
  const fmt = (log) => Object.entries(log).map(([k, v]) => `${k} [${v.map((t) => t.toFixed(2)).join(' ')}]`).join(', ');

  const known = play(true);
  const L = known.log;
  const ok = firedAt(L.drop4, [131.8]) && firedAt(L.chorus2, [39, 89.5]) && firedAt(L.second8, [86.5])
    && firedAt(L.last, [179.5]) && firedAt(L.last8, [175.5]) && firedAt(L.plain, [40, 90.25]) && firedAt(L.verse32, [4])
    && known.sectionAtFire.drop4 === 'bridge' && known.sectionAtFire.verse32 === 'intro';
  const mainState = firedAt(L.drop4, [134]) && L.last.length === 0;
  line('ahead', '17c: with the song known ahead, a lead fires its beats before the section (or the last beat), once, while the clock still says the section before',
    ok, `${fmt(L)}; the drop's lead fired during "${known.sectionAtFire.drop4 ?? '—'}" (want drop4 131.8, chorus2 39 89.5, second8 86.5, last 179.5, last8 175.5, plain 40 90.25, verse32 4)`, mainState);

  // The analysis and the lead joined: the made-up song's own SongAhead as the
  // clock's ahead, so a shape that differs between the two (a start in beats,
  // another field name) cannot pass each line alone.
  {
    let detail = 'no analysis to run the show on', ok2 = false, main2 = true;
    if (A) {
      const S = A.sections ?? [];
      const dropAt = S.find((s) => shows.sectionKind(s.label) === 'drop')?.start;
      const joined = { id: 'j', song: show.song, look: show.look, actions: [A2.drop4, A2.last] };
      const fired = new Map(), log = { drop4: [], last: [] };
      for (let k = 0; k * tick <= A.durationSec; k++) {
        const t = k * tick;
        const clock = { t, duration: A.durationSec, ...shows.sectionsAt(S, t), kicks: 0, ahead: { grid: A.grid, sections: S } };
        for (const a of shows.dueActions(joined, clock, fired)) log[a.id].push(t);
      }
      const near = (times, target) => times.length === 1 && times[0] >= target - TOL && times[0] <= target + TOL + tick;
      ok2 = near(log.drop4, beatTime(STEP_BEAT - 4)) && near(log.last, beatTime(LAST_BEAT));
      main2 = dropAt === undefined || (log.drop4.length === 1 && Math.abs(log.drop4[0] - dropAt) <= tick + 1e-6 && log.last.length === 0);
      detail = `drop4 [${log.drop4.map((t) => t.toFixed(3)).join(' ')}] (want ${beatTime(STEP_BEAT - 4).toFixed(3)}, beat 188), `
        + `last [${log.last.map((t) => t.toFixed(3)).join(' ')}] (want ${beatTime(LAST_BEAT).toFixed(3)}, beat 287)`;
    }
    line('ahead', '17c: on the analysed song itself, the drop\'s lead four beats ahead and the last beat on the last kick',
      ok2, detail, !hasAhead || main2);
  }

  // The lead survives a file and an assistant (parseSongAction, PLAN 44f),
  // held to whole beats from 1 to 64, and is said in words on the desk.
  const parsed = (when) => shows.parseSongAction({ when, what: { do: 'dyes' } })?.when ?? null;
  const p1 = parsed({ at: 'section', section: 'drop', beatsAhead: 4 });
  const p2 = parsed({ at: 'section', section: 'chorus', beatsAhead: 200 });
  const p3 = parsed({ at: 'section', section: 'chorus', beatsAhead: 2.6 });
  const p4 = parsed({ at: 'last-beat', beatsAhead: 8 });
  const p5 = parsed({ at: 'last-beat' });
  const words = [p1, p4, p5].map((w) => (w ? shows.describeWhen(w) : '—'));
  const parseOk = p1?.beatsAhead === 4 && p2?.beatsAhead === 64 && p3?.beatsAhead === 3 && p4?.at === 'last-beat' && p4?.beatsAhead === 8
    && p5?.at === 'last-beat' && /^4 beats before every drop$/i.test(words[0]) && /^8 beats before the last beat$/i.test(words[1]) && /^On the last beat$/i.test(words[2]);
  line('ahead', '17c: a lead is kept by a file or an assistant, whole beats from 1 to 64, and said in words',
    parseOk, `parsed ${JSON.stringify([p1, p2, p3, p4, p5])}; said "${words.join('", "')}"`, p1?.beatsAhead === undefined && p4 === null);

  const blind = play(false).log;
  check('late: with nothing known ahead, a lead fires on the section itself and a last-beat action not at all',
    firedAt(blind.drop4, [134]) && firedAt(blind.chorus2, [40, 90.25]) && firedAt(blind.second8, [90.25])
      && blind.last.length === 0 && blind.last8.length === 0 && firedAt(blind.plain, [40, 90.25]) && firedAt(blind.verse32, [12]),
    fmt(blind));
}

// ── loudness: BS.1770 on the mono mix ────────────────────────────────
{
  const loud = fn('songLoudness');
  let detail = 'no songLoudness in src/lib/hearAhead.ts', ok = false;
  if (loud) {
    const tone = (hz, rate) => { const x = new Float32Array(20 * rate); for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin(2 * Math.PI * hz * i / rate); return x; };
    const lSine = loud(tone(1000, SR), SR);
    // The K-weighting itself: at 1 kHz its gain cancels the -0.691, so a
    // plain RMS passes the 1 kHz line (check-skeptic, 2026-11-08). At 60 Hz
    // and 10 kHz the standard's 48 kHz filter gives -26.60 and -19.66 for a
    // -20 dBFS sine (its two biquads' response, worked out by hand); and the
    // filter is the standard's at another rate too (1 kHz at 44.1 kHz).
    const l60 = loud(tone(60, SR), SR), l10k = loud(tone(10000, SR), SR), l441 = loud(tone(1000, 44100), 44100);
    const lSong = loud(pcm, SR);
    const lQuiet = loud(makeSong(10 ** (-12 / 20)), SR);
    const withSilence = new Float32Array(pcm.length + 30 * SR); withSilence.set(pcm);
    const lSilence = loud(withSilence, SR);
    const padTail = new Float32Array(pcm.length + 30 * SR); padTail.set(pcm);
    const k = 10 ** (-25 / 20);
    for (let i = 0; i < 30 * SR; i++) padTail[pcm.length + i] = pcm[i % Math.round(30 * BEAT * SR)] * k; // the intro's pad, 25 dB down
    const lPad = loud(padTail, SR);
    const inAnalysis = A ? A.loudnessLufs === lSong : null;
    ok = Math.abs(lSine + 23.0) <= 0.1 && Math.abs(l60 + 26.60) <= 0.1 && Math.abs(l10k + 19.66) <= 0.1 && Math.abs(l441 + 23.0) <= 0.1
      && Math.abs(lSong - lQuiet - 12) <= 0.05 && Math.abs(lSilence - lSong) < 0.1 && Math.abs(lPad - lSong) < 0.5 && inAnalysis === true;
    detail = `1 kHz ${lSine.toFixed(2)} LUFS (want -23.0), 60 Hz ${l60.toFixed(2)} (-26.60), 10 kHz ${l10k.toFixed(2)} (-19.66), 1 kHz at 44.1 kHz ${l441.toFixed(2)} (-23.0); `
      + `the analysis's loudnessLufs ${inAnalysis === null ? 'not read (no analysis)' : inAnalysis ? 'is this' : `is ${A.loudnessLufs}, not this`}; song ${lSong.toFixed(2)}, 12 dB down ${lQuiet.toFixed(2)} (${(lSong - lQuiet).toFixed(3)} apart); `
      + `with silence after ${lSilence.toFixed(2)}, with quiet pad after ${lPad.toFixed(2)}`;
  }
  line('loudness', '17d: the song\'s loudness from the file, BS.1770 with its gates, so a quiet master drives the plate as a loud one does',
    ok, detail, !hasAhead);
}

// ── clock: where in the set the player is ────────────────────────────
{
  const pos = fn('setPosition');
  let detail = 'no setPosition in src/lib/hearAhead.ts', ok = false;
  if (pos) {
    const D = [180, 200.5, 95.25];
    const cases = [
      [0, 0, { index: 0, t: 0 }], [0, -0.5, { index: 0, t: -0.5 }], [0, 179.999, { index: 0, t: 179.999 }],
      [0, 180, { index: 1, t: 0 }], [0, 380.5, { index: 2, t: 0 }], [0, 475.7499, { index: 2, t: 95.2499 }], [0, 475.75, null],
      [2, 181, { index: 1, t: -1 }], [2, 182, { index: 1, t: 0 }], [2, 382.5, { index: 2, t: -2 }], [2, 384.5, { index: 2, t: 0 }],
      [2, 479.75, null],
    ];
    const bad = [];
    for (const [gap, at, want] of cases) {
      const got = pos(D, gap, at);
      const same = want === null ? got === null : got && got.index === want.index && Math.abs(got.t - want.t) < 1e-9;
      if (!same) bad.push(`gap ${gap} at ${at}: ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
    }
    ok = bad.length === 0;
    detail = ok ? `${cases.length} positions to the sample, across songs, gaps and the end` : bad.join('; ');
  }
  line('clock', '17e: the player\'s place in the set, song and seconds, negative in the gap before a song, none after the last',
    ok, detail, !hasAhead);
}

// ── tags: ISRC, title, artist and cover from the file ────────────────
{
  const tags = fn('readSongTags');
  let detail = 'no readSongTags in src/lib/hearAhead.ts', ok = false;
  if (tags) {
    const enc = new TextEncoder();
    const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
    const be32 = (n) => new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
    const le32 = (n) => new Uint8Array([n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255]);
    const safe = (n) => new Uint8Array([n >>> 21 & 127, n >>> 14 & 127, n >>> 7 & 127, n & 127]);
    // Covers of 300 bytes, so the APIC frame and the tag are over 127 bytes,
    // where a synchsafe size and a plain one differ (check-skeptic, 2026-11-08).
    const cover = (k) => { const b = new Uint8Array(300); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < 300; i++) b[i] = (i * k) & 255; return b; };
    const PNG = cover(7), BACK = cover(13);
    const utf16 = (s) => { const b = [0xff, 0xfe]; for (const ch of s) { const c = ch.charCodeAt(0); b.push(c & 255, c >> 8); } return new Uint8Array(b); };
    const id3 = (ver, frames) => {
      const body = cat(...frames.map(([id, data]) => cat(enc.encode(id), ver === 4 ? safe(data.length) : be32(data.length), new Uint8Array(2), data)));
      return cat(enc.encode('ID3'), new Uint8Array([ver, 0, 0]), safe(body.length), body, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
    };
    const text = (s) => cat(new Uint8Array([3]), enc.encode(s));
    const apic = (type, bytes) => cat(new Uint8Array([0]), enc.encode('image/png'), new Uint8Array([0, type, 0]), bytes);
    const v24 = id3(4, [['TIT2', text('Dark Star')], ['TPE1', text('The Band')], ['TSRC', text('QZ-AAA-26-00001')], ['APIC', apic(3, PNG)], ['APIC', apic(4, BACK)]]);
    const v23 = id3(3, [['TIT2', cat(new Uint8Array([1]), utf16('Après'))], ['TPE1', text('The Band')], ['TSRC', text('qzaaa2600002')]]);
    const block = (type, last, data) => cat(new Uint8Array([(last ? 0x80 : 0) | type, data.length >>> 16 & 255, data.length >>> 8 & 255, data.length & 255]), data);
    const vc = (pairs) => cat(le32(3), enc.encode('ref'), le32(pairs.length), ...pairs.map((p) => cat(le32(enc.encode(p).length), enc.encode(p))));
    const pic = cat(be32(3), be32(9), enc.encode('image/png'), be32(0), be32(1), be32(1), be32(24), be32(0), be32(PNG.length), PNG);
    const flac = cat(enc.encode('fLaC'), block(0, false, new Uint8Array(34)),
      block(4, false, vc(['TITLE=Morning Dew', 'ARTIST=The Band', 'ISRC=QZAAA2600003'])), block(6, true, pic));
    const badIsrc = id3(4, [['TSRC', text('QZAAA26ABCDE')]]); // twelve characters, but not an ISRC's
    const none = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
    const truncated = v24.slice(0, 30);
    const bad = [];
    const safely = (name, b) => { try { return tags(b); } catch (e) { bad.push(`${name} threw: ${e.message}`); return null; } };
    const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
    const r24 = safely('ID3v2.4', v24), r23 = safely('ID3v2.3', v23), rf = safely('FLAC', flac);
    const rb = safely('a bad ISRC', badIsrc), rn = safely('no tags', none);
    safely('a truncated tag', truncated);
    if (r24 && !(r24.isrc === 'QZAAA2600001' && r24.title === 'Dark Star' && r24.artist === 'The Band' && r24.cover?.mime === 'image/png' && same(r24.cover?.bytes, PNG))) bad.push(`ID3v2.4 ${JSON.stringify({ ...r24, cover: r24.cover && { mime: r24.cover.mime, n: r24.cover.bytes?.length } })}`);
    if (r23 && !(r23.isrc === 'QZAAA2600002' && r23.title === 'Après' && r23.artist === 'The Band')) bad.push(`ID3v2.3 ${JSON.stringify(r23)}`);
    if (rf && !(rf.isrc === 'QZAAA2600003' && rf.title === 'Morning Dew' && rf.artist === 'The Band' && rf.cover?.mime === 'image/png' && same(rf.cover?.bytes, PNG))) bad.push(`FLAC ${JSON.stringify({ ...rf, cover: rf.cover && { mime: rf.cover.mime, n: rf.cover.bytes?.length } })}`);
    if (rb && rb.isrc !== undefined) bad.push(`a bad ISRC read as ${rb.isrc}`);
    if (rn && Object.keys(rn).length) bad.push(`no tags read as ${JSON.stringify(rn)}`);
    ok = bad.length === 0;
    detail = ok ? 'ID3v2.4, ID3v2.3 (UTF-16), FLAC; a bad ISRC refused, no tags empty, a truncated tag survived' : bad.join('; ');
  }
  line('tags', '17f: the ISRC, title, artist and cover from the file\'s own tags, and never a throw',
    ok, detail, !hasAhead);
}

console.log(`\n${passed}/${passed + failed} checks passed${owed.size ? ` (${owed.size} owed: ${[...owed].join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
