#!/usr/bin/env node
/**
 * Do the looks' sound patches read anything, and can a patch hear the hits?
 *
 *   npm run soundpatch        (node only)
 *
 * PLAN 28f. What was found (2026-10-11, the gallery review): four of the
 * shelf's sound patches named a drum or a note (`kick`, `hats`, `note`,
 * `tonalMid`) on the `sound` source, whose features are the hook's loudness,
 * bass, mid, treble, energy, timbre and complexity. The fold reads a name its
 * source does not have as 0, so Bass Drop's kick never threw the plate,
 * Microscopic Chaos's hats never shook a bead and Aurora's note and mids moved
 * nothing, every night since they were written. Comet's timbre was patched at
 * a depth of 45 (meant as degrees; a depth is a share of the dial's travel,
 * −1..1), so any timbre at all threw its heading to the clamp. And the patch
 * bay could hear each drum's level but not its hits, so nothing could answer
 * a hard kick harder than a soft one, nor stay still between kicks.
 *
 * The owner then (the same morning): "only use things that we can detect
 * quickly and make changes that are appropriate for the music". So the looks'
 * patches read what is heard at once (the levels, the bands, the hits), never
 * the song's sections, which are heard bars late.
 *
 * What this asserts:
 *
 *   1. Every shipped look's patch reads something: folded with each source
 *      hearing everything it can hear at 0.7, every patch moves its control.
 *      A name its source lacks reads 0 and does not, which is the four. And
 *      every depth is on −1..1, which is all the travel there is.
 *   2. Every sound patch on the shelf reads what is heard at once (`sound`,
 *      `bands`, `hits`), and the three looks written as the pattern for the
 *      rest (Cyberpunk, Fillmore East, Lava Lamp) each have two or three,
 *      into the liquid and never onto a dial that moves the whole frame.
 *   3. The hits (lib/hitSource.ts), on a song whose drums are known to the
 *      sample (`scripts/arrangement.mjs`, as `npm run shape` uses), heard the
 *      way the show's loop hears them:
 *        - a hit is there on the frame the loop first sees it, at the
 *          strength the analyser gave it (fast: no smoothing in front of it);
 *        - it has fallen to a tenth within 0.6 s, and a kick patch is under
 *          half its depth for most of a groove (still between the hits);
 *        - a plate drawing twenty frames a second, handed one reading in
 *          three, still sees the hits whose own reading it never had;
 *        - pitch stays on 0..1, moves with the song, and lets go when the
 *          music stops.
 *   4. The patch bay folds the hits through Sound Impact, its master, and
 *      reads nothing with no reading.
 *   5. Sound learn can bind a control to a hit: it comes back from a map
 *      file and becomes a `hits` patch; a trigger bound to a hit's level
 *      (which has no moment of its own) is dropped as the file is read.
 */

import { analysePcm, SOURCE_NAMES } from '../src/lib/audioFeatures.ts';
import { HitSource, HIT_FEATURES } from '../src/lib/hitSource.ts';
import { PatchBay, SETTING_TRAVEL } from '../src/lib/sceneMap.ts';
import { SoundLearn } from '../src/lib/soundLearn.ts';
import { parseMidiMap, serializeMidiMap, MIDI_FORMAT, MUSIC_SOURCES } from '../src/lib/midi.ts';
import { MODULATOR_FEATURES } from '../src/lib/modulators.ts';
import { FRAME_MOTION } from '../src/lib/drift.ts';
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
  every hit at 0.7. Not the hits' own arithmetic here (part 3 is that): this
  asks only whether a patch's name is one its source has.
*/
const reading = { level: 0.7, kick: 0.7, bass: 0.7, snare: 0.7, hats: 0.7, note: 0.7, tonalLow: 0.7, tonalMid: 0.7, tonalHigh: 0.7, bands: Array(8).fill(0.7) };
const hook = { volume: 70, bass: 70, mid: 70, treble: 70, energy: 0.7, timbre: 70, complexity: 70, features: reading };
const scene = new Proxy({ ready: true, at: 0 }, { get: (t, k) => (k in t ? t[k] : 0.7) });
const ctx = {
  room: scene, film: scene, sound: hook,
  shape: { value: (f) => (MODULATOR_FEATURES.includes(f) ? 0.7 : 0) },
  hits: { value: (f) => (HIT_FEATURES.includes(f) ? 0.7 : 0) },
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

// ── 2. What the patches read, and the pattern ─────────────────────────────

const FAST = new Set(['sound', 'bands', 'hits']);
const NOT_SOUND = new Set(['room', 'film', 'shape']);
const slow = [];
for (const p of PRESETS) for (const m of p.settings.sceneMappings ?? []) {
  const src = m.source ?? 'room';
  if (!FAST.has(src) && !NOT_SOUND.has(src)) slow.push(`${p.id} ${src}:${m.feature}`);
}
const PATTERN = ['cyberpunk', 'fillmore-1969', 'lava-lamp'];
const pattern = PATTERN.map((id) => {
  const ms = PRESETS.find((p) => p.id === id)?.settings.sceneMappings ?? [];
  return { id, n: ms.length, ok: ms.length >= 2 && ms.length <= 3 && ms.every((m) => FAST.has(m.source) && !FRAME_MOTION.has(m.setting)),
    says: ms.map((m) => `${m.source}:${m.feature} on ${m.setting} ${m.depth}`).join(', ') };
});
check('every sound patch on the shelf reads what is heard at once, and the three pattern looks have two or three each, into the liquid',
  slow.length === 0 && pattern.every((x) => x.ok),
  `${slow.length ? `not heard at once: ${slow.join('; ')}; ` : ''}${pattern.map((x) => `${x.id}: ${x.says || 'none'}`).join(' | ')}`);

// ── 3. The hits ─────────────────────────────────────────────────────────────

console.log('\nThe hits (club, 128 bpm, as `npm run shape` hears it)');
const CLUB = [
  { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 8 },
  { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 },
];
const song = arrange({ bpm: 128, sections: CLUB, seed: 1 });
const readings = analysePcm(song.pcm, SR, 60);

/** The loop, reduced: the source fed once a frame, handed one reading in `every`. */
function hear(every = 1, silentAfter = Infinity) {
  const src = new HitSource();
  const frames = [];
  for (let i = 0; i < readings.length; i += every) {
    const r = readings[i];
    const heard = r.time < silentAfter ? r : null;
    src.update(heard, r.time);
    const v = { t: r.time, r: heard };
    for (const f of HIT_FEATURES) v[f] = src.value(f);
    frames.push(v);
  }
  return frames;
}
const frames = hear();

// On the frame: every kick the analyser heard is in Kick hit on its own frame, at its strength.
const onTime = frames.filter((f) => f.r?.onsets.kick.hit);
const late = onTime.filter((f) => f.kickHit + 1e-9 < f.r.onsets.kick.strength);
check('a kick is in Kick hit on the frame it is heard, at the strength the analyser gave it',
  onTime.length > 50 && late.length === 0, `${onTime.length} kicks, ${late.length} under their strength on their frame`);

// And gone: 0.6 s after each kick with none in between, under a tenth of where it was.
const lens = [];
for (let i = 0; i < frames.length; i++) {
  if (!frames[i].r?.onsets.kick.hit) continue;
  const at = frames[i].t, peak = frames[i].kickHit;
  const later = frames.find((f) => f.t >= at + 0.6);
  const between = frames.filter((f) => f.t > at && f.t < at + 0.6).some((f) => f.r?.onsets.kick.hit);
  if (later && !between && peak > 0.2) lens.push(later.kickHit / peak);
}
const drop = song.truth.sections.filter((s) => s.kind === 'drop');
const inDrop = frames.filter((f) => drop.some((s) => f.t >= s.start && f.t < s.end));
const overHalf = inDrop.filter((f) => f.kickHit > 0.5).length / inDrop.length;
check('it has fallen to a tenth 0.6 s after a kick, and is under half for most of a drop: still between the hits',
  lens.length > 10 && Math.max(...lens) < 0.1 && overHalf < 0.3,
  `${lens.length} lone kicks, at most ${f3(Math.max(...lens))} of their peak 0.6 s on; over half on ${(100 * overHalf).toFixed(0)}% of the drops' frames`);

/*
  The kick a slow plate never sees. At twenty frames a second the loop is
  handed one reading in three, and a hit's `strength` is on the one reading
  it landed on (`hit` the same): reading it there missed two hits in three.
  Read as held (`last`), every hit whose time moves is seen with the
  strength it had.
*/
const twenty = hear(3);
const heardHits = readings.filter((r) => r.onsets.kick.hit || r.onsets.snare.hit).length;
let seen = 0, onItsReading = 0;
for (let i = 1; i < twenty.length; i++) if (twenty[i].anyHit > twenty[i - 1].anyHit + 1e-6) seen++;
for (let i = 0; i < readings.length; i += 3) if (readings[i].onsets.kick.hit || readings[i].onsets.snare.hit) onItsReading++;
check('"Any hit" sees the hits a plate drawing twenty frames a second is not handed the reading of',
  seen >= 0.85 * heardHits && seen > 2 * onItsReading,
  `${seen} of the ${heardHits} kicks and snares the analyser heard rose it, where the hit's own reading reached the loop for ${onItsReading}`);

const pitches = frames.map((f) => f.pitch);
const pMean = pitches.reduce((s, x) => s + x, 0) / pitches.length;
const pSd = Math.sqrt(pitches.reduce((s, x) => s + (x - pMean) ** 2, 0) / pitches.length);
const stopAt = 60;
const stopped = hear(1, stopAt);
const after = stopped.find((f) => f.t >= stopAt + 1);
const before = stopped.find((f) => f.t >= stopAt - 0.05);
check('"Pitch" stays on 0..1, moves with the song, and lets go within a second of the music stopping',
  pitches.every((x) => x >= 0 && x <= 1) && pSd > 0.05 && before.pitch > 0.05 && after.pitch < 0.01 && after.kickHit < 0.01,
  `mean ${f2(pMean)}, spread ${f2(pSd)}; ${f3(before.pitch)} as the music stops, ${f3(after.pitch)} a second on`);

// ── 4. Through the patch bay ───────────────────────────────────────────────

console.log('\nThrough the patch bay');
{
  const src = new HitSource();
  const r = readings.find((x) => x.onsets.kick.hit && x.onsets.kick.strength > 0.5);
  src.update(r, r.time);
  const v = src.value('kickHit');
  const m = { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.4 };
  const base = { ...DEFAULT_SETTINGS, turbulenceScale: 0.2, sceneMappings: [m], layerCount: 1 };
  const sound = { features: r };
  const fold = (over) => { const bay = new PatchBay(base, 1); bay.fold(base, { room: null, film: null, sound, shape: null, hits: src, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 0, ...over }, 1, 0); return bay.global.turbulenceScale; };
  const full = fold({}), half = fold({ soundImpact: 0.5 }), none = fold({ soundImpact: 0 }), deaf = fold({ sound: { features: null } }), gone = fold({ hits: null });
  check('a patch on a hit moves its control by the hit times the depth, through Sound Impact, and not at all with nothing heard',
    v > 0.5 && Math.abs(full - (0.2 + v * 0.4)) < 1e-9 && Math.abs(half - (0.2 + v * 0.2)) < 1e-9 && none === 0.2 && deaf === 0.2 && gone === 0.2,
    `Kick hit ${f3(v)}: Turbulence 0.2 → ${f3(full)} at full, ${f3(half)} at half, ${none} at Sound Impact 0, ${deaf} with no reading, ${gone} with no source`);
}

// ── 5. Sound learn ──────────────────────────────────────────────────────────

console.log('\nSound learn');
{
  const bindings = [
    { id: 's-1', source: 'kickHit', target: { kind: 'setting', key: 'turbulenceScale' }, depth: 0.4 },
    { id: 's-2', source: 'kick', target: { kind: 'setting', key: 'beads' }, depth: 0.3 },
    { id: 's-3', source: 'kickHit', target: { kind: 'action', action: 'seed' } },
    // The kick as a moment still fires, so the one above is dropped for being a level, not for its action.
    { id: 's-4', source: 'kick', target: { kind: 'action', action: 'seed' } },
  ];
  const map = parseMidiMap(serializeMidiMap({ format: MIDI_FORMAT, version: 1, name: 'hits', bindings: [], sound: bindings }));
  const kept = map.sound ?? [];
  const patchesOf = new SoundLearn().patchesOf(kept);
  const hit = patchesOf.find((p) => p.feature === 'kickHit');
  const kick = patchesOf.find((p) => p.feature === 'kick');
  check('a control bound to a hit comes back from the map file as a hits patch; a trigger on a hit\'s level is dropped',
    kept.length === 3 && kept.some((b) => b.id === 's-4') && hit?.source === 'hits' && hit.depth === 0.4 && kick?.source === 'bands' && !kept.some((b) => b.id === 's-3'),
    `${kept.length} of 4 kept (${kept.map((b) => b.id).join(', ')}); patches ${patchesOf.map((p) => `${p.source}:${p.feature}`).join(', ')}`);
  check('a hit\'s name is not a band\'s, a drum\'s or a trigger\'s (a binding is stored by name alone)',
    HIT_FEATURES.every((f) => !SOURCE_NAMES.includes(f) && !MUSIC_SOURCES.includes(f)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
