#!/usr/bin/env node
/**
 * Do the looks' sound patches read anything, and can a patch hear the song?
 *
 *   npm run songpatch                     (node only)
 *   SONG=path/to/song.mp3 npm run songpatch   (and a real song, printed)
 *
 * PLAN 28f, steps 1 and 2. What was found (2026-10-11, the gallery review):
 * four of the shelf's sound patches named a drum or a note (`kick`, `hats`,
 * `note`, `tonalMid`) on the `sound` source, whose features are the hook's
 * loudness, bass, mid, treble, energy, timbre and complexity. The fold reads a
 * name its source does not have as 0, so Bass Drop's kick never threw the
 * plate, Microscopic Chaos's hats never shook a bead and Aurora's note and
 * mids moved nothing, every night since they were written. Comet's timbre was
 * patched at a depth of 45 (meant as degrees; a depth is a share of the
 * dial's travel, −1..1), so any timbre at all threw its heading to the clamp.
 * And the patch bay could hear the sound only second by second, where the
 * real shows filmed on 2026-09-26 follow the song's sections.
 *
 * What this asserts:
 *
 *   1. Every shipped look's patch reads something: folded with each source
 *      hearing everything it can hear at 0.7, every patch moves its control.
 *      A name its source lacks reads 0 and does not, which is the four. And
 *      every depth is on −1..1, which is all the travel there is.
 *   2. The song as a source (lib/songSource.ts), on songs whose sections are
 *      known to the sample (`scripts/arrangement.mjs`, as `npm run shape`
 *      uses), heard the way the show's loop hears them:
 *        - "In a breakdown" settles in through each breakdown the shape hears
 *          and is near nothing through the drops; "Build tension" climbs
 *          through each build and is nothing through a verse; "Drop swell"
 *          rises after each drop heard and is gone by the next phrase;
 *        - each section source moves over seconds, not on a frame: its
 *          largest change in one sixtieth of a second, against the shape's
 *          own word, which changes all at once;
 *        - "Hit strength" sees the kicks a plate drawing twenty frames a
 *          second is never handed the reading of (it is handed one in three),
 *          because it reads a hit's strength as held, not on its one reading;
 *        - "Pitch" stays on 0..1 and moves with the song.
 *   3. The patch bay folds the song through Sound Impact, its master: a patch
 *      on it moves its control by the value times the depth, nothing at an
 *      impact of 0, and nothing when there is no song to hear.
 *   4. Sound learn can bind a control to the song's shape: the binding comes
 *      back from a map file and becomes a `song` patch; a trigger bound to a
 *      level (which has no moment to fire on) is dropped as the file is read.
 *
 * With SONG set, a real song is decoded (ffmpeg) and its sections printed
 * every four seconds, with the events heard: a reading, not a gate, because
 * a real song's sections are not known to the sample.
 */

import { spawnSync } from 'node:child_process';
import { analysePcm, SOURCE_NAMES } from '../src/lib/audioFeatures.ts';
import { SongShape } from '../src/lib/songShape.ts';
import { SongSource, SONG_FEATURES } from '../src/lib/songSource.ts';
import { PatchBay, SETTING_TRAVEL } from '../src/lib/sceneMap.ts';
import { SoundLearn } from '../src/lib/soundLearn.ts';
import { parseMidiMap, serializeMidiMap, MIDI_FORMAT } from '../src/lib/midi.ts';
import { MODULATOR_FEATURES } from '../src/lib/modulators.ts';
import { PRESETS } from '../src/presets.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { arrange, SR } from './arrangement.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');

// ── 1. Every look's patches read something ─────────────────────────────────

console.log('Every shipped look\'s patches');
/*
  Each source hearing everything it can, at 0.7: the hook's numbers at 70 of
  100 (its scale), every named source and band at 0.7, every room and film
  feature at 0.7 (a reading whose every field is 0.7), every LFO at 0.7, and
  the song's six at 0.7. Not the song's own arithmetic here (part 2 is that):
  this asks only whether a patch's name is one its source has.
*/
const reading = { level: 0.7, kick: 0.7, bass: 0.7, snare: 0.7, hats: 0.7, note: 0.7, tonalLow: 0.7, tonalMid: 0.7, tonalHigh: 0.7, bands: Array(8).fill(0.7) };
const hook = { volume: 70, bass: 70, mid: 70, treble: 70, energy: 0.7, timbre: 70, complexity: 70, features: reading };
const scene = new Proxy({ ready: true, at: 0 }, { get: (t, k) => (k in t ? t[k] : 0.7) });
const ctx = {
  room: scene, film: scene, sound: hook,
  shape: { value: (f) => (MODULATOR_FEATURES.includes(f) ? 0.7 : 0) },
  song: { value: (f) => (SONG_FEATURES.includes(f) ? 0.7 : 0) },
  roomImpact: 1, filmImpact: 1, soundImpact: 1, shapeImpact: 1,
};
const dead = [], deep = [];
let patches = 0;
for (const p of PRESETS) {
  for (const m of p.settings.sceneMappings ?? []) {
    patches++;
    if (!(m.depth >= -1 && m.depth <= 1)) deep.push(`${p.id} ${m.source}:${m.feature} on ${m.setting} at ${m.depth}`);
    const travel = SETTING_TRAVEL[m.setting];
    // The control at the middle of its travel, so a patch either way has room to move it.
    const mid = travel ? (travel.min + travel.max) / 2 : 0.5;
    const base = { ...DEFAULT_SETTINGS, ...p.settings, [m.setting]: mid, sceneMappings: [m], layerCount: 1 };
    const bay = new PatchBay(base, 1);
    bay.fold(base, ctx, 1, 0);
    if (!travel || bay.global[m.setting] === mid) dead.push(`${p.id} ${m.source ?? 'room'}:${m.feature} on ${m.setting}`);
  }
}
check(`every patch on the shelf moves its control when its source hears something (${patches} patches)`,
  dead.length === 0 && patches > 10, dead.length ? `reads nothing: ${dead.join('; ')}` : `${patches} of ${patches} move`);
check('and every depth is a share of the travel, on −1..1', deep.length === 0, deep.join('; ') || 'all on −1..1');

// ── 2. The song as a source ────────────────────────────────────────────────

const CLUB = [
  { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 8 },
  { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 },
];
const SECTION = ['intensity', 'tension', 'dropSwell', 'inBreakdown'];

/**
 * The loop, reduced: the shape and the source fed once a frame. `every`
 * hands the loop one reading in that many, as a plate drawing slower than
 * the ear reads is handed (the analyser still reads every one of them).
 */
function hear(readings, every = 1) {
  const shape = new SongShape(), src = new SongSource();
  const frames = [], events = [];
  for (let i = 0; i < readings.length; i += every) {
    const r = readings[i];
    const ev = shape.update(r, r.time);
    src.update(shape.now, ev, r, r.time);
    for (const e of ev) events.push(e);
    const v = { t: r.time, section: shape.now.section, hit: r.onsets.kick.hit || r.onsets.snare.hit };
    for (const f of SONG_FEATURES) v[f] = src.value(f);
    frames.push(v);
  }
  return { frames, events };
}

console.log('\nThe song as a source (club, 128 bpm, as `npm run shape` hears it)');
const song = arrange({ bpm: 128, sections: CLUB, seed: 1 });
const readings = analysePcm(song.pcm, SR, 60);
const { frames, events } = hear(readings);
const between = (a, b) => frames.filter((f) => f.t >= a && f.t < b);
const max = (a, k) => a.reduce((m, f) => Math.max(m, f[k]), 0);
const mean = (a, k) => (a.length ? a.reduce((s, f) => s + f[k], 0) / a.length : NaN);
const sections = song.truth.sections;

/*
  Through each breakdown the shape hears, from two seconds after it says so
  to the section's end: "In a breakdown" has settled in. Asked of what the
  shape heard, not of the arrangement's truth, because how late the shape
  hears a breakdown is `npm run shape`'s to hold (two or three bars); this
  holds what the source does with it.
*/
const heardBreaks = [];
for (let i = 0; i < frames.length; i++) {
  if (frames[i].section === 'breakdown' && (i === 0 || frames[i - 1].section !== 'breakdown')) {
    let j = i; while (j < frames.length && frames[j].section === 'breakdown') j++;
    heardBreaks.push({ from: frames[i].t, to: frames[j - 1].t });
    i = j;
  }
}
const settled = heardBreaks.filter((b) => b.to - b.from > 4).map((b) => mean(between(b.from + 3, b.to), 'inBreakdown'));
const drops = sections.filter((s) => s.kind === 'drop');
const inDrops = drops.map((s) => max(between(s.start + 4, s.end), 'inBreakdown'));
check('"In a breakdown" settles in through each breakdown heard, and is near nothing through the drops',
  settled.length >= 1 && settled.every((v) => v > 0.6) && inDrops.every((v) => v < 0.1),
  `${heardBreaks.length} heard (${heardBreaks.map((b) => `${b.from.toFixed(1)}–${b.to.toFixed(1)} s`).join(', ')}): mean ${settled.map(f2).join(', ')} once in; through the drops at most ${inDrops.map(f2).join(', ')}`);

const builds = sections.filter((s) => s.kind === 'build');
const lateBuild = builds.map((s) => max(between(s.start + 0.75 * (s.end - s.start), s.end), 'tension'));
const verses = sections.filter((s) => s.kind === 'verse');
const inVerse = verses.map((s) => max(between(s.start + 2, s.end), 'tension'));
check('"Build tension" climbs through each build, and is nothing through a verse',
  lateBuild.every((v) => v > 0.3) && inVerse.every((v) => v < 0.05),
  `the last quarter of each build up to ${lateBuild.map(f2).join(', ')}; a verse at most ${inVerse.map(f2).join(', ')}`);

const heardDrops = events.filter((e) => e.kind === 'drop');
const swells = heardDrops.map((e) => ({ at: e.at, peak: max(between(e.at, e.at + 2), 'dropSwell'), later: mean(between(e.at + 12, e.at + 14), 'dropSwell') }));
// Away from every drop heard (the first is the beat coming in, in the verse), nothing.
const away = frames.filter((f) => !heardDrops.some((e) => f.t >= e.at && f.t < e.at + 16));
const verseSwell = [max(away, 'dropSwell')];
check('"Drop swell" rises after each drop heard, is gone by the next phrase, and is nothing away from a drop',
  swells.length >= drops.length && swells.every((s) => s.peak > 0.5 && s.later < 0.1) && verseSwell.every((v) => v < 0.05) && away.length > frames.length / 2,
  `${swells.map((s) => `${s.at.toFixed(1)} s: ${f2(s.peak)} within 2 s, ${f2(s.later)} 12 s on`).join('; ')}; at most ${verseSwell.map(f2).join(', ')} more than 16 s from a drop`);

/*
  Over seconds, not on a frame. The shape says which section the song is in
  as a word, and the word changes on one frame: read as 0 or 1 it moves the
  whole of its travel in a sixtieth of a second. Each section source's
  largest move in one frame, here, against that. A bar at 0.06 a frame: a
  full move takes at least seventeen frames (over a quarter of a second, the
  drop's own rise), and the slow ones take seconds (In a breakdown and
  Intensity under 0.01 a frame, which is two seconds' worth of frames).
*/
const step = (k) => frames.reduce((m, f, i) => (i ? Math.max(m, Math.abs(f[k] - frames[i - 1][k])) : 0), 0);
const word = frames.reduce((m, f, i) => (i && (f.section === 'breakdown') !== (frames[i - 1].section === 'breakdown') ? 1 : m), 0);
const steps = Object.fromEntries(SECTION.map((k) => [k, step(k)]));
check('each section source moves over seconds, not on a frame: its largest change in a sixtieth of a second',
  word === 1 && SECTION.every((k) => steps[k] < 0.06) && steps.inBreakdown < 0.01 && steps.intensity < 0.01,
  `${SECTION.map((k) => `${k} ${f3(steps[k])}`).join(', ')}; the shape's own word moves ${word}`);

/*
  The kick a slow plate never sees. At twenty frames a second the loop is
  handed one reading in three, and a hit's `strength` is on the one reading
  it landed on (`hit` the same): reading it there missed two hits in three.
  Read as held (`last`), every hit whose time moves is seen with the
  strength it had. Counted in the drops, against the hits the analyser heard.
*/
const slow = hear(readings, 3);
const heardHits = readings.filter((r) => r.onsets.kick.hit || r.onsets.snare.hit).length;
let seen = 0, onItsReading = 0;
for (let i = 1; i < slow.frames.length; i++) if (slow.frames[i].hitStrength > slow.frames[i - 1].hitStrength + 1e-6) seen++;
for (let i = 0; i < readings.length; i += 3) if (readings[i].onsets.kick.hit || readings[i].onsets.snare.hit) onItsReading++;
check('"Hit strength" sees the hits a plate drawing twenty frames a second is not handed the reading of',
  seen >= 0.85 * heardHits && seen > 2 * onItsReading,
  `${seen} of the ${heardHits} kicks and snares the analyser heard rose it, where the hit's own reading reached the loop for ${onItsReading}`);

const pitches = frames.map((f) => f.pitch);
const pMean = pitches.reduce((s, x) => s + x, 0) / pitches.length;
const pSd = Math.sqrt(pitches.reduce((s, x) => s + (x - pMean) ** 2, 0) / pitches.length);
check('"Pitch" stays on 0..1 and moves with the song', pitches.every((x) => x >= 0 && x <= 1) && pSd > 0.05,
  `mean ${f2(pMean)}, spread ${f2(pSd)}`);

// ── 3. Through the patch bay ───────────────────────────────────────────────

console.log('\nThrough the patch bay');
{
  const src = new SongSource();
  // A breakdown held for ten seconds: In a breakdown all but 1.
  const state = { section: 'breakdown', intensity: 0.4, action: 0, tension: 0, lastDrop: null, time: 0 };
  for (let t = 0; t <= 10; t += 1 / 60) { state.time = t; src.update(state, [], null, t); }
  const v = src.value('inBreakdown');
  const m = { source: 'song', feature: 'inBreakdown', setting: 'turbulenceScale', depth: -0.5 };
  const base = { ...DEFAULT_SETTINGS, turbulenceScale: 0.8, sceneMappings: [m], layerCount: 1 };
  const fold = (over) => { const bay = new PatchBay(base, 1); bay.fold(base, { room: null, film: null, sound: null, shape: null, song: src, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 0, ...over }, 1, 0); return bay.global.turbulenceScale; };
  const full = fold({}), half = fold({ soundImpact: 0.5 }), none = fold({ soundImpact: 0 }), gone = fold({ song: null });
  const want = 0.8 - v * 0.5 * 1;
  check('a patch on the song moves its control by the value times the depth, through Sound Impact, and not at all with no song',
    Math.abs(full - want) < 1e-9 && Math.abs(half - (0.8 - v * 0.25)) < 1e-9 && none === 0.8 && gone === 0.8,
    `In a breakdown ${f3(v)}: Turbulence 0.8 → ${f3(full)} at full, ${f3(half)} at half, ${none} at Sound Impact 0, ${gone} with no song`);
}

// ── 4. Sound learn ──────────────────────────────────────────────────────────

console.log('\nSound learn');
{
  const bindings = [
    { id: 's-1', source: 'inBreakdown', target: { kind: 'setting', key: 'turbulenceScale' }, depth: -0.4 },
    { id: 's-2', source: 'kick', target: { kind: 'setting', key: 'beads' }, depth: 0.3 },
    { id: 's-3', source: 'dropSwell', target: { kind: 'action', action: 'seed' } },
    // The drop as a moment still fires, so the one above is dropped for being a level, not for its action.
    { id: 's-4', source: 'drop', target: { kind: 'action', action: 'seed' } },
  ];
  const map = parseMidiMap(serializeMidiMap({ format: MIDI_FORMAT, version: 1, name: 'song', bindings: [], sound: bindings }));
  const kept = map.sound ?? [];
  const patchesOf = new SoundLearn().patchesOf(kept);
  const song = patchesOf.find((p) => p.feature === 'inBreakdown');
  const kick = patchesOf.find((p) => p.feature === 'kick');
  check('a control bound to the song\'s shape comes back from the map file as a song patch; a trigger on a level is dropped',
    kept.length === 3 && kept.some((b) => b.source === 'drop') && song?.source === 'song' && song.depth === -0.4 && kick?.source === 'bands' && !kept.some((b) => b.source === 'dropSwell'),
    `${kept.length} of 4 kept (${kept.map((b) => b.source).join(', ')}); patches ${patchesOf.map((p) => `${p.source}:${p.feature}`).join(', ')}`);
  check('the song\'s six names are not a band\'s or a drum\'s (a binding is stored by name alone)',
    SONG_FEATURES.every((f) => !SOURCE_NAMES.includes(f)));
}

// ── A real song, printed ───────────────────────────────────────────────────

if (process.env.SONG) {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-i', process.env.SONG, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (run.status !== 0 || !run.stdout?.byteLength) console.log(`\n${process.env.SONG}: could not be decoded (ffmpeg)`);
  else {
    const pcm = new Float32Array(Uint8Array.from(run.stdout).buffer);
    const real = hear(analysePcm(pcm, SR, 60));
    console.log(`\n${process.env.SONG}, ${(pcm.length / SR).toFixed(0)} s: ${real.events.map((e) => `${e.kind} at ${e.at.toFixed(1)} s`).join(', ') || 'no events'}`);
    for (let t = 0; t < pcm.length / SR; t += 4) {
      const at = real.frames.find((f) => f.t >= t);
      if (!at) break;
      console.log(`  ${String(t).padStart(4)} s  ${at.section.padEnd(9)} ${SONG_FEATURES.map((f) => `${f} ${f2(at[f])}`).join('  ')}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
