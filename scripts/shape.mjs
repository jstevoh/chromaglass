#!/usr/bin/env node
/**
 * Does the show hear the song's shape: its builds, its drops, its breakdowns,
 * live, on songs it has never heard, and nothing in a song that has none?
 *
 *   npm run shape
 *
 * PLAN §10, step 2. `src/lib/songShape.ts` listens to the analyser's readings
 * and reports three kinds of event. This drives it exactly as the render loop
 * does, a frame at a time at 60 fps (and once at 30, a render's rate), with
 * songs synthesised by `scripts/arrangement.mjs`, whose sections are known to
 * the sample, and asserts the feature:
 *
 *   - every drop (the low end back after two bars or more without it, or the
 *     drop that ends a build) reported within one bar of the song, and never
 *     before it;
 *   - no drop anywhere else: not on a fill, not on a chorus coming in over a
 *     beat that never stopped;
 *   - every build reported before its drop, and never outside a build;
 *   - every breakdown reported within four bars, and never in a steady
 *     section. A build that begins by taking the beat away sounds like a
 *     breakdown until it starts to climb, and may be reported as one in its
 *     first half; in its second half it may not. An outro (the beat gone, the
 *     pad fading) is a breakdown by the same rule, and at most one is heard
 *     in it;
 *   - a bar of silence between a build and its drop does not cost the drop;
 *   - two songs that are nothing but their groove, for two minutes each, one
 *     four on the floor with a fill every eight bars and one a rock beat with
 *     a fill every four (the kick out for two beats under a snare run):
 *     nothing reported at all;
 *   - the same song 20 dB quieter hears the same events, within a tenth of a
 *     second; the same song arranged, analysed and heard twice hears them
 *     identically (each asked only of a song in which drops and builds were
 *     heard, so nothing matched to nothing does not pass);
 *   - a gap of two, three or four seconds between two songs forgets the
 *     first: the gap reads as quiet, the second's quiet intro is not a
 *     breakdown of the first's drop, and its beat coming in is a drop;
 *   - the slow intensity is higher through the drops than the breakdowns,
 *     and holds still through every bar of a groove while the level swings;
 *   - the line the desk and the phone print says "drop" for four seconds
 *     after each drop, the build's percentage while one is heard, and
 *     nothing through a groove;
 *   - the shelf's real tracks (ambient pieces, no beat to drop) are printed
 *     with their events a minute, and held to at most one drop and one
 *     build a minute, having been decoded to sound and heard as sound (not
 *     quiet) for most of their length.
 *
 * Latency is printed in bars of the song, because that is the unit the PLAN's
 * target is in ("a drop reported within one bar").
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { analysePcm } from '../src/lib/audioFeatures.ts';
import { SongShape, songShapeLine } from '../src/lib/songShape.ts';
import { SoundLearn } from '../src/lib/soundLearn.ts';
import { parseMidiMap, serializeMidiMap, MUSIC_SOURCES, MIDI_FORMAT } from '../src/lib/midi.ts';
import { arrange, rng, SR } from './arrangement.mjs';

// The working directory, not this file's: `npm run shape` runs a bundle of
// this file from node_modules/.cache, where '..' is not the repository.
const ROOT = `${process.cwd()}/`;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');

/** The render loop, reduced to what the tracker sees: one reading a frame. */
function listen(readings) {
  const shape = new SongShape();
  const events = [];
  const frames = [];
  for (const r of readings) {
    for (const e of shape.update(r, r.time)) events.push(e);
    frames.push({ t: r.time, ...shape.now });
  }
  return { events, frames };
}

const CLUB = [
  { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 8 },
  { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 },
];
const BAND = [
  { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 16 }, { kind: 'chorus', bars: 8 }, { kind: 'verse', bars: 8 },
  { kind: 'breakdown', bars: 4 }, { kind: 'chorus', bars: 8 }, { kind: 'outro', bars: 2 },
];
const GROOVE = [{ kind: 'verse', bars: 64 }];

/**
 * What should be heard in a song: the drops (every return of the kick after
 * two bars without it, and the first beat of every drop section, which in a
 * build that keeps its kick is the only mark), the builds and the breakdowns.
 */
function expected(truth) {
  const drops = [...truth.returns];
  for (const s of truth.sections) {
    if (s.kind === 'drop' && !drops.some((d) => Math.abs(d - s.start) < truth.bar)) drops.push(s.start);
  }
  drops.sort((a, b) => a - b);
  return {
    drops,
    builds: truth.sections.filter((s) => s.kind === 'build'),
    breakdowns: truth.sections.filter((s) => s.kind === 'breakdown'),
  };
}

/** Score one song's events against its truth. Prints each line; returns the numbers. */
function score(name, song, heard) {
  const { truth } = song;
  const bar = truth.bar;
  const want = expected(truth);
  const drops = heard.events.filter((e) => e.kind === 'drop');
  const builds = heard.events.filter((e) => e.kind === 'build');
  const breaks = heard.events.filter((e) => e.kind === 'breakdown');
  const sectionAt = (t) => truth.sections.find((s) => t >= s.start && t < s.end + 0.05) ?? null;

  // Drops: each one heard within a bar, none early.
  const late = want.drops.map((d) => {
    const hit = drops.find((e) => e.at >= d - 0.1 && e.at <= d + bar);
    return hit ? (hit.at - d) / bar : Infinity;
  });
  const found = late.filter(Number.isFinite).length;
  check(`${name}: every drop heard within one bar`, found === want.drops.length,
    `${found}/${want.drops.length}, ${late.map((x) => (Number.isFinite(x) ? `${x.toFixed(2)} bar` : 'missed')).join(', ')} late`);
  const stray = drops.filter((e) => !want.drops.some((d) => e.at >= d - 0.1 && e.at <= d + bar));
  check(`${name}: no drop anywhere else`, stray.length === 0,
    stray.length ? stray.map((e) => `${f1(e.at)} s in the ${sectionAt(e.at)?.kind ?? 'gap'}`).join(', ') : `${drops.length} heard`);

  // Builds: each heard before its section ends; none outside one.
  if (want.builds.length) {
    const into = want.builds.map((b) => {
      const hit = builds.find((e) => e.at >= b.start && e.at <= b.end + 0.1);
      return hit ? (hit.at - b.start) / (b.end - b.start) : Infinity;
    });
    check(`${name}: every build heard before its drop`, into.every(Number.isFinite),
      into.map((x) => (Number.isFinite(x) ? `${Math.round(x * 100)} % of the way in` : 'missed')).join(', '));
  }
  const strayBuild = builds.filter((e) => sectionAt(e.at)?.kind !== 'build');
  check(`${name}: no build outside a build`, strayBuild.length === 0,
    strayBuild.length ? strayBuild.map((e) => `${f1(e.at)} s in the ${sectionAt(e.at)?.kind ?? 'gap'}`).join(', ') : `${builds.length} heard`);

  // Breakdowns: each heard within four bars; none where the beat plays on.
  if (want.breakdowns.length) {
    const lateB = want.breakdowns.map((b) => {
      const hit = breaks.find((e) => e.at >= b.start && e.at <= b.start + 4 * bar);
      return hit ? (hit.at - b.start) / bar : Infinity;
    });
    check(`${name}: every breakdown heard within four bars`, lateB.every(Number.isFinite),
      lateB.map((x) => (Number.isFinite(x) ? `${x.toFixed(1)} bars in` : 'missed')).join(', '));
  }
  const strayBreak = breaks.filter((e) => {
    const s = sectionAt(e.at);
    if (!s) return false;                                        // after the last section: the song has ended
    if (s.kind === 'breakdown' || s.kind === 'outro') return false;
    if (s.kind === 'build' && e.at < (s.start + s.end) / 2) return false;
    return true;
  });
  check(`${name}: no breakdown where the beat plays on`, strayBreak.length === 0,
    strayBreak.length ? strayBreak.map((e) => `${f1(e.at)} s in the ${sectionAt(e.at)?.kind}`).join(', ') : `${breaks.length} heard`);
  // An outro is the beat gone and the pad playing on while it fades, which is
  // what a breakdown is, and one may be heard there (a trigger on "each
  // breakdown" fires as a song winds down); but only the one.
  const outroBreaks = truth.sections.filter((s) => s.kind === 'outro')
    .map((s) => breaks.filter((e) => e.at >= s.start && e.at < s.end + 3).length);
  if (outroBreaks.length) {
    check(`${name}: at most one breakdown in the outro`, outroBreaks.every((k) => k <= 1), `${outroBreaks.join(', ')} heard there`);
  }
  return { late, drops, builds, breaks };
}

const songs = {};
const make = (key, opts, fps = 60) => {
  const song = arrange(opts);
  const readings = analysePcm(song.pcm, SR, fps);
  songs[key] = { song, readings, heard: listen(readings) };
  return songs[key];
};

// ── Songs with a shape ─────────────────────────────────────────────────────

console.log('Songs with a shape (club: four on the floor; band: a rock beat with fills)');
const cases = [
  ['club, 128 bpm', { bpm: 128, sections: CLUB, seed: 1 }],
  ['club, 90 bpm', { bpm: 90, sections: CLUB, seed: 2 }],
  ['club, 140 bpm, 20 dB down', { bpm: 140, sections: CLUB, seed: 3, gainDb: -20 }],
  ['club, a build that keeps its kick', { bpm: 124, sections: CLUB, seed: 4, buildKick: true }],
  ['band, 110 bpm', { bpm: 110, sections: BAND, style: 'band', seed: 5 }],
  // The music stops dead for a bar between the build and the drop: long
  // enough to read as quiet, which must not cost the drop.
  ['club, a bar of silence before the drop', { bpm: 126, seed: 11, sections: [
    { kind: 'intro', bars: 2 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'silence', bars: 1 },
    { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 }] }],
];
const allLate = [];
for (const [name, opts] of cases) {
  const { song, heard } = make(name, opts);
  console.log(`\n  ${name}: ${song.truth.sections.map((s) => `${s.kind} ${f1(s.start)}`).join(' · ')}`);
  console.log(`  heard: ${heard.events.map((e) => `${e.kind} ${f1(e.at)}`).join(' · ') || 'nothing'}`);
  const { late } = score(name, song, heard);
  allLate.push(...late.filter(Number.isFinite));
}
{
  // The silence has to be heard as quiet for that song to ask anything of
  // the quiet: a drop out of a silence the tracker never noticed is just a drop.
  const { song, heard } = songs['club, a bar of silence before the drop'];
  const sil = song.truth.sections.find((s) => s.kind === 'silence');
  const quiet = heard.frames.filter((f) => f.t >= sil.start && f.t < sil.end + 0.05 && f.section === 'quiet');
  check('club, a bar of silence before the drop: the silence reads as quiet', quiet.length > 0,
    quiet.length ? `from ${f2(quiet[0].t - sil.start)} s into it` : 'never');
}
{
  const sorted = allLate.slice().sort((a, b) => a - b);
  console.log(`\n  drops heard: median ${f2(sorted[sorted.length >> 1])} bar late, the latest ${f2(sorted[sorted.length - 1])} bar`);
}

// ── At a render's rate ───────────────────────────────────────────────────

console.log('\nAt 30 fps, a render\'s rate');
{
  const { song, heard } = make('club, 128 bpm, 30 fps', { bpm: 128, sections: CLUB, seed: 1 }, 30);
  console.log(`  heard: ${heard.events.map((e) => `${e.kind} ${f1(e.at)}`).join(' · ')}`);
  score('club at 30 fps', song, heard);
  /*
    The same drops, builds and breakdowns, a quarter second apart at most.
    Except a breakdown in a build's first half, which is allowed above (the
    build has taken the beat away and not yet started to climb) and so sits
    on a knife-edge between the two readings: at 60 fps the club song's first
    build was heard as a breakdown for two seconds before it climbed, at 30
    it was not. Those are left out of the comparison and counted.
  */
  const firstHalfOfBuild = (e) => e.kind === 'breakdown' && song.truth.sections.some((s) => s.kind === 'build' && e.at >= s.start && e.at < (s.start + s.end) / 2);
  const a = heard.events.filter((e) => !firstHalfOfBuild(e));
  const b = songs['club, 128 bpm'].heard.events.filter((e) => !firstHalfOfBuild(e));
  // A drop to a quarter second; a build or a breakdown is recognised seconds
  // into it, on a ten-a-second tick, and is held to half a second.
  const same = a.length === b.length && a.every((e, i) => e.kind === b[i].kind && Math.abs(e.at - b[i].at) <= (e.kind === 'drop' ? 0.25 : 0.5));
  // And the 60 fps reading is itself a hearing, not nothing matched to nothing.
  const heard60 = ['drop', 'build'].every((k) => b.filter((e) => e.kind === k).length >= 2);
  check('at 30 fps it hears what it hears at 60: drops within a quarter second, the rest within a half', heard60 && same,
    `${a.length} events against ${b.length}, and ${heard.events.length - a.length} and ${songs['club, 128 bpm'].heard.events.length - b.length} breakdowns at the start of a build`);
}

// ── Songs with no shape ──────────────────────────────────────────────────

console.log('\nSongs that are nothing but their groove, two minutes and more each');
for (const [name, opts] of [
  ['four on the floor, 120 bpm', { bpm: 120, sections: GROOVE, seed: 6 }],
  ['a rock beat with a fill every four bars, 100 bpm', { bpm: 100, sections: GROOVE, style: 'band', seed: 7 }],
]) {
  const { song, heard } = make(name, opts);
  check(`${name}: nothing heard`, heard.events.length === 0,
    heard.events.length ? heard.events.map((e) => `${e.kind} ${f1(e.at)}`).join(', ') : `${f1(song.seconds)} s, ${song.truth.fills.length} fills`);
  const lit = heard.frames.filter((f) => f.t > song.truth.sections[0].start + 2);
  const steady = lit.filter((f) => f.section === 'steady').length / lit.length;
  check(`${name}: steady the whole way`, steady >= 0.99, `${(steady * 100).toFixed(1)} % of frames`);
}

// ── Level, determinism ───────────────────────────────────────────────────

console.log('\nThe same song, quieter, and twice');
{
  // Each asked of a song that was heard: the club song's two drops and two
  // builds at least, or "the same as nothing" would pass for a deaf tracker.
  const loud = songs['club, 128 bpm'].heard.events;
  const heardSomething = ['drop', 'build'].every((k) => loud.filter((e) => e.kind === k).length >= 2);
  const quiet = listen(analysePcm(arrange({ bpm: 128, sections: CLUB, seed: 1, gainDb: -20 }).pcm, SR, 60)).events;
  const match = quiet.length === loud.length && quiet.every((e, i) => e.kind === loud[i].kind && Math.abs(e.at - loud[i].at) <= 0.1);
  check('20 dB down, the same events within a tenth of a second', heardSomething && match,
    `${quiet.map((e) => `${e.kind} ${f1(e.at)}`).join(' · ')}`);
  // Twice from the start: arranged, analysed and heard again, not the same
  // readings heard twice.
  const again = listen(analysePcm(arrange({ bpm: 128, sections: CLUB, seed: 1 }).pcm, SR, 60)).events;
  check('the same song twice hears the same', heardSomething && JSON.stringify(again) === JSON.stringify(loud), `${again.length} events`);
}

// ── Between songs ────────────────────────────────────────────────────────

console.log('\nTwo songs with a gap between');
/*
  Between two tracks a player leaves two to four seconds, some of it the last
  track's tail. Measured from the last song's last hit to the next one's first
  sound: song a is cut half a second after its music ends (the harness pads
  every song with three seconds of tail, which at first made a "three second"
  gap six and a half, and hid that a real one was never heard as quiet), then
  room hiss, then song b, whose own lead-in is a beat of near silence.
*/
for (const silence of [2, 3, 4]) {
  const a = arrange({ bpm: 128, sections: [{ kind: 'verse', bars: 4 }, { kind: 'drop', bars: 8 }], seed: 8 });
  const b = arrange({ bpm: 100, sections: [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }], seed: 9 });
  const aEnd = a.truth.sections.at(-1).end;
  const aLen = Math.round((aEnd + 0.5) * SR);
  const gap = Math.round((silence - 0.5 - b.truth.sections[0].start) * SR);
  const pcm = new Float32Array(aLen + gap + b.pcm.length);
  pcm.set(a.pcm.subarray(0, aLen), 0);
  // The gap is a room, not digital silence: a player between tracks through a microphone.
  const hiss = rng(10);
  for (let i = 0; i < gap; i++) pcm[aLen + i] = 5e-4 * (hiss() * 2 - 1) * Math.sqrt(3);
  pcm.set(b.pcm, aLen + gap);
  const offset = (aLen + gap) / SR;
  const heard = listen(analysePcm(pcm, SR, 60));
  const tag = `${silence} s between them`;
  const introEnd = offset + b.truth.sections[0].end;
  const inIntro = heard.events.filter((e) => e.at > aEnd && e.at < introEnd - 0.1);
  check(`${tag}: the second song's quiet intro is not a breakdown of the first`, inIntro.length === 0,
    inIntro.length ? inIntro.map((e) => `${e.kind} ${f1(e.at)}`).join(', ') : 'nothing in the gap or the intro');
  const entry = offset + b.truth.returns[0];
  const drop = heard.events.find((e) => e.kind === 'drop' && e.at >= entry - 0.1 && e.at <= entry + b.truth.bar);
  check(`${tag}: and its beat coming in is a drop`, !!drop, drop ? `${f2((drop.at - entry) / b.truth.bar)} bar late` : `none near ${f1(entry)} s`);
  // Quiet in the gap, having been steady through the first song's drop: a
  // tracker that never left quiet (it starts there) would pass the second half alone.
  const drop1 = a.truth.sections.at(-1);
  const wasSteady = heard.frames.filter((f) => f.t > (drop1.start + drop1.end) / 2 && f.t < drop1.end).every((f) => f.section === 'steady');
  const quiet = heard.frames.filter((f) => f.t > aEnd && f.t < offset + b.truth.sections[0].start).some((f) => f.section === 'quiet');
  check(`${tag}: the first song's drop reads as steady and the gap as quiet`, wasSteady && quiet, `steady ${wasSteady}, quiet ${quiet}`);
}

// ── Intensity ────────────────────────────────────────────────────────────

console.log('\nThe slow intensity');
{
  const { song, heard } = songs['club, 128 bpm'];
  const mean = (kind) => {
    const spans = song.truth.sections.filter((s) => s.kind === kind);
    const xs = heard.frames.filter((f) => spans.some((s) => f.t >= (s.start + s.end) / 2 && f.t < s.end)).map((f) => f.intensity);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const inDrop = mean('drop'), inBreak = mean('breakdown');
  check('higher through the drops than the breakdowns', inDrop - inBreak >= 0.2,
    `the second half of the drops ${f2(inDrop)}, of the breakdowns ${f2(inBreak)}`);
}
/*
  And it does not move at the beat. Not asked frame by frame: at 60 fps an
  8 s time constant cannot move it more than 0.002 in a frame whatever it is
  fed, so a per-frame limit measured the constant and could not fail. Asked
  bar by bar, in the two songs that are nothing but their groove, once the
  intensity has had three time constants to settle: over a bar the constant
  lets it travel a fifth of the way to its target, so it holds still across a
  bar only if what it follows holds still across a bar. And beside it, how
  far the level itself swings inside the same bar, so the check shows there
  was a beat to follow (a kick is tens of dB over the gap after it) and the
  intensity did not. The rock song's fills, every fourth bar, are the hardest
  case: a fill is louder and fuller than the bar before it.
*/
for (const name of ['four on the floor, 120 bpm', 'a rock beat with a fill every four bars, 100 bpm']) {
  const { song, heard, readings } = songs[name];
  const from = song.truth.sections[0].start + 24, to = song.truth.sections.at(-1).end;
  let most = 0, swing = Infinity, where = 0;
  for (let b = from; b + song.truth.bar <= to; b += song.truth.bar) {
    const inBar = heard.frames.filter((f) => f.t >= b && f.t < b + song.truth.bar).map((f) => f.intensity);
    const lvl = readings.filter((r) => r.time >= b && r.time < b + song.truth.bar).map((r) => r.db[0]);
    const range = Math.max(...inBar) - Math.min(...inBar);
    if (range > most) { most = range; where = b; }
    swing = Math.min(swing, Math.max(...lvl) - Math.min(...lvl));
  }
  check(`${name}: it holds still through every bar while the level swings at the beat`, most < 0.02 && swing >= 10,
    `the intensity's widest range in a bar ${most.toFixed(4)} (at ${f1(where)} s); the level's narrowest swing in a bar ${f1(swing)} dB`);
}

// ── What the desk and the phone say ─────────────────────────────────────

/*
  The line the Perform desk's footer and the phone's Sound sheet print
  (`songShapeLine`), read off every frame of the club song as the app polls
  it: "drop" for four seconds after each drop heard, "build N%" from the build
  heard to its drop with N higher at the end than the start, "breakdown"
  through a breakdown heard; and nothing at all through the two grooves. The
  phone's own check (`npm run phone`) can only see that the line is there:
  without a GPU its render loop never runs the tracker.
*/
console.log('\nWhat the desk and the phone say');
{
  const { heard } = songs['club, 128 bpm'];
  const lines = heard.frames.map((f) => ({ t: f.t, line: songShapeLine(f) }));
  const drops = heard.events.filter((e) => e.kind === 'drop');
  const dropSaid = drops.every((d) => {
    const next = heard.events.find((e) => e.kind === 'drop' && e.at > d.at)?.at ?? Infinity;
    const within = lines.filter((l) => l.t >= d.at && l.t < Math.min(d.at + 4, next));
    const after = lines.filter((l) => l.t >= d.at + 4.1 && l.t < Math.min(d.at + 5, next));
    return within.length > 0 && within.every((l) => l.line === 'drop') && after.every((l) => l.line !== 'drop');
  });
  check('"drop" for four seconds after each drop, and not after', drops.length >= 2 && dropSaid, `${drops.length} drops`);
  const builds = heard.events.filter((e) => e.kind === 'build');
  const buildSaid = builds.map((b) => {
    const end = drops.find((d) => d.at > b.at)?.at ?? Infinity;
    const said = lines.filter((l) => l.t >= b.at && l.t < end);
    const ns = said.map((l) => /^build (\d+)%$/.exec(l.line)).map((m) => (m ? Number(m[1]) : NaN));
    // Climbing to the drop: high by its end and never falling far on the
    // way. Not "higher at the end than the start": a short build heard late
    // has already climbed its twenty decibels when it is heard (the club
    // song's second, four bars, heard at 65 %, says 100 % from the first).
    let peak = -Infinity, fell = 0;
    for (const n of ns) { peak = Math.max(peak, n); fell = Math.max(fell, peak - n); }
    return { ok: said.length > 0 && ns.every(Number.isFinite) && ns[ns.length - 1] >= 80 && fell <= 15, from: ns[0], to: ns[ns.length - 1], fell };
  });
  check('"build N%" from each build heard to its drop, climbing to 80 % or more', builds.length >= 2 && buildSaid.every((b) => b.ok),
    buildSaid.map((b) => `${b.from}% to ${b.to}%, falling ${b.fell} at most`).join(', '));
  const breaks = heard.events.filter((e) => e.kind === 'breakdown');
  const breakSaid = breaks.every((b) => lines.some((l) => l.t >= b.at && l.t < b.at + 0.1 && l.line === 'breakdown'));
  check('"breakdown" when a breakdown is heard', breaks.length >= 1 && breakSaid, `${breaks.length} breakdowns`);
  for (const name of ['four on the floor, 120 bpm', 'a rock beat with a fill every four bars, 100 bpm']) {
    const said = songs[name].heard.frames.map(songShapeLine).filter((l) => l !== '');
    check(`${name}: nothing said through the groove`, said.length === 0, said.length ? `${said.length} frames, "${said[0]}"` : `${songs[name].heard.frames.length} frames`);
  }
}

// ── Sound learn ──────────────────────────────────────────────────────────

/*
  A trigger bound to the drop, the build or the breakdown fires once for each
  one heard, on the frame it is heard, and nothing else fires it; and the
  binding survives the map file.
*/
console.log('\nBound to the song\'s shape (sound learn)');
{
  const { readings } = songs['club, 128 bpm'];
  const bindings = [
    { id: 'd', source: 'drop', target: { kind: 'action', action: 'preset-next' } },
    { id: 'b', source: 'build', target: { kind: 'action', action: 'seed' } },
    { id: 'k', source: 'breakdown', target: { kind: 'dye', paletteIndex: 1 } },
  ];
  const learn = new SoundLearn();
  const shape = new SongShape();
  const fired = [], heard = [];
  for (const r of readings) {
    const events = shape.update(r, r.time);
    heard.push(...events);
    for (const f of learn.step(r.time * 1000, r, null, bindings, events)) fired.push({ source: f.binding.source, at: f.at / 1000 });
  }
  for (const kind of ['drop', 'build', 'breakdown']) {
    const want = heard.filter((e) => e.kind === kind).map((e) => e.at);
    const got = fired.filter((f) => f.source === kind).map((f) => f.at);
    check(`a trigger on each ${kind} fires once for each, as heard`, want.length > 0 && got.length === want.length && got.every((t, i) => Math.abs(t - want[i]) < 1e-9),
      `${got.length} fired, ${want.length} heard`);
  }
  const map = parseMidiMap(serializeMidiMap({ format: MIDI_FORMAT, version: 1, name: 'shape', bindings: [], sound: bindings }));
  // Whole, not just the source: a target lost or mangled on the way through
  // the file is as broken as a source that was.
  const same = bindings.every((b) => map.sound?.some((m) => JSON.stringify(m) === JSON.stringify(b)));
  check('bindings on the song\'s shape come back from the map file', same && map.sound?.length === bindings.length
    && ['drop', 'build', 'breakdown'].every((k) => MUSIC_SOURCES.includes(k)), `${map.sound?.filter((m) => bindings.some((b) => JSON.stringify(m) === JSON.stringify(b))).length ?? 0} of 3 whole`);
}

// ── The shelf ────────────────────────────────────────────────────────────

/*
  The tracks in public/music, the same way `npm run bands` decodes them
  (ffmpeg, else Playwright's Chromium). They are ambient pieces: a drop in one
  is a swell of its low end the tracker has taken for the beat coming in. The
  gate is at most one a minute, which is loose on purpose: the pieces do
  swell, and what is being held is "not a drop machine", not "hears nothing".
  Builds are held to the same: before the tracker asked for a beat (the kick
  hitting, see BEAT_KICKS in songShape.ts) the pieces' swells read as builds
  two or three times a minute, and the desk said "build" on music with none.
*/
const SHELF_SECONDS = 360;
function viaFfmpeg(file) {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-t', String(SHELF_SECONDS), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  if (run.error || run.status !== 0) return null;
  const b = run.stdout;
  if (b.byteLength < SR * 4) return null;
  return new Float32Array(Uint8Array.from(b).buffer, 0, Math.floor(b.byteLength / 4));
}
async function viaChromium(files) {
  let chromium, launchChromium;
  try {
    ({ chromium } = await import('playwright'));
    ({ launchChromium } = await import('./chromium.mjs'));
  } catch { return null; }
  let browser;
  try { browser = await launchChromium(chromium); } catch { return null; }
  try {
    const page = await browser.newPage();
    await page.route('http://shelf.test/**', (route) => {
      const name = route.request().url().split('/').pop();
      return name.endsWith('.mp3')
        ? route.fulfill({ body: readFileSync(`${ROOT}public/music/${name}`), contentType: 'audio/mpeg' })
        : route.fulfill({ body: '<!doctype html><title>shelf</title>', contentType: 'text/html' });
    });
    await page.goto('http://shelf.test/index.html');
    const out = [];
    for (const file of files) {
      const samples = await page.evaluate(async ({ file, seconds, sr }) => {
        const data = await (await fetch(`http://shelf.test/${file}`)).arrayBuffer();
        const audio = await new OfflineAudioContext(1, 1, sr).decodeAudioData(data);
        const n = Math.min(audio.length, Math.round(seconds * audio.sampleRate));
        const mono = new Float32Array(n);
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const ch = audio.getChannelData(c);
          for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels;
        }
        // Across the wire as base64 of the raw floats: a plain array of
        // sixteen million numbers is a JSON string of a few hundred megabytes.
        const bytes = new Uint8Array(mono.buffer);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      }, { file, seconds: SHELF_SECONDS, sr: SR }).catch(() => null);
      out.push(samples ? new Float32Array(Uint8Array.from(Buffer.from(samples, 'base64')).buffer) : null);
    }
    return out;
  } finally {
    await browser.close();
  }
}

{
  const dir = `${ROOT}public/music`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort() : [];
  console.log(`\nThe shelf: ${files.length} tracks, up to ${SHELF_SECONDS / 60} minutes of each`);
  let decoded = files.map((f) => viaFfmpeg(`${dir}/${f}`));
  let how = 'ffmpeg';
  if (files.length && !decoded.every(Boolean)) { decoded = (await viaChromium(files)) ?? []; how = 'Chromium'; }
  if (!files.length || decoded.length !== files.length || !decoded.every(Boolean)) {
    // As in `npm run bands`: a skip on a laptop with no decoder, a failure on
    // CI, whose Measure job installs ffmpeg for exactly this.
    const where = process.env.CI ? 'FAIL' : 'SKIP';
    console.log(`  ${where}  no ffmpeg on the path and no Playwright Chromium to decode MP3 with: the shelf was NOT measured on this machine`);
    if (process.env.CI) failed++;
  } else {
    console.log(`  decoded with ${how}`);
    files.forEach((file, i) => {
      const heard = listen(analysePcm(decoded[i], SR, 60));
      const minutes = decoded[i].length / SR / 60;
      const per = (k) => heard.events.filter((e) => e.kind === k).length / minutes;
      const drops = heard.events.filter((e) => e.kind === 'drop');
      console.log(`      ${file.padEnd(20)} ${f1(minutes)} min: ${['drop', 'build', 'breakdown'].map((k) => `${k} ${f1(per(k))}/min`).join(', ')}`
        + `${heard.events.length ? `  (${heard.events.slice(0, 8).map((e) => `${e.kind[0]}${Math.round(e.at)}`).join(' ')}${heard.events.length > 8 ? ' …' : ''})` : ''}`);
      // Heard as sound first: a decode that returned silence would hear
      // nothing and pass everything below.
      let sq = 0;
      for (let j = 0; j < decoded[i].length; j++) sq += decoded[i][j] * decoded[i][j];
      const rmsDb = 10 * Math.log10(sq / Math.max(1, decoded[i].length) + 1e-30);
      const sounding = heard.frames.filter((f) => f.section !== 'quiet').length / heard.frames.length;
      check(`${file}: decoded to sound, and heard as sound for most of it`, rmsDb > -50 && rmsDb < -3 && sounding >= 0.9,
        `${f1(rmsDb)} dBFS, ${Math.round(sounding * 100)} % of frames not quiet`);
      check(`${file}: at most one drop a minute`, drops.length <= minutes, `${drops.length} in ${f1(minutes)} min`);
      const builds = heard.events.filter((e) => e.kind === 'build');
      check(`${file}: at most one build a minute`, builds.length <= minutes, `${builds.length} in ${f1(minutes)} min`);
      const bad = heard.frames.filter((f) => !(f.intensity >= 0 && f.intensity <= 1) || !(f.action >= -1 && f.action <= 1)).length;
      check(`${file}: intensity and action stay in range`, bad === 0, `${bad} bad frames`);
    });
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
