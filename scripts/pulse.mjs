#!/usr/bin/env node
/**
 * `npm run pulse`: the beat, whatever plays it (`src/lib/pulseEar.ts`).
 *
 * What was reported: the owner's six 1920s song films (acoustic 78s) should
 * "react to the music a bit more". What was measured: every beat answer on
 * the plate (Kick Bloom, the beat clock's kicks, each patch on Kick hit) waits
 * for the ear's kick, and on those records the kick fired 3 to 6 times a
 * minute (the Wolverines 22) in songs of 100 to 200 bpm, because there is no
 * bass drum on a record cut into an acoustic horn. The band keeps time on
 * banjo, tuba and piano. The ear now hears that attack as the beat when no
 * kick keeps time (SuperFlux over 60 Hz–4 kHz), and leaves the kick alone
 * where one does.
 *
 * What this asserts, on songs synthesised here so every note's time is known,
 * heard through the ear a render uses (`SongEar`, the analyser emulated) at
 * 30 frames a second (the films') and 60 (the live show's):
 *
 *   1. A kickless band (banjo chords on every beat, a tuba on one and three,
 *      a sung note with vibrato held over them, a soft cornet note on every
 *      "and" of two, hiss), 112 bpm: the kick alone hears under a fifth of
 *      the beats (the control: the band here is the band the films have), and
 *      the beat hears at least 90% of them, within 70 ms, with at most 10%
 *      beats that land on no beat. The cornet is the melody between beats; a
 *      review found the first version took it for the beat (35% stray at
 *      30 fps), which is why the ear now entrains to a period.
 *   2. The beat clock, driven as the frame loop drives it in a render (Beat
 *      Prediction and Beat Lead at the show's defaults), fires its kick on
 *      at least 85% of the band's beats from the beat, at most 10% of its
 *      kicks on no beat, and its count within 10% of the beats, against under
 *      a quarter from the kick (the control, whose clock fires no more than
 *      the kicks): the plate's kick answers are what the owner sees.
 *   3. The patch bay's Kick hit (`hitSource.ts`) rises on at least 90% of the
 *      band's beats with at most 10% stray, from the same readings (and from
 *      the kick alone, no more often than the kicks).
 *   4. The same band with a kick drum on every beat and hats between: every
 *      beat after the first four seconds is a kick, to the frame, and every
 *      kick is a beat. Where a kick keeps time nothing about the beat moved.
 *   5. A breakdown: the kick plays 0–12 s, lays out to 24 s and comes back.
 *      With it out the band carries at least 90% of the beats, and three
 *      steady seconds after it returns every beat is a kick again.
 *   6. Nothing to hear: white noise, a held chord with vibrato and hiss, and
 *      digital silence each make at most one pulse (the first sound's) and at
 *      most one beat more than the kick's.
 *
 * What it cannot see: how the plate looks when it fires (the before/after
 * films on the owner's Mac are that), and a real 78 (the six songs are not
 * the repo's to ship; their numbers are in `pulseEar.ts`'s comment and the
 * PR).
 */
import { SongEar } from '../src/lib/songTrack.ts';
import { HitSource } from '../src/lib/hitSource.ts';
import { BeatClock } from '../src/lib/beatClock.ts';

const SR = 48000;
const BPM = 112;
const BEAT_S = 60 / BPM;
const TRUST = 0.7;    // DEFAULT_SETTINGS.beatPrediction
const LEAD_MS = 80;   // DEFAULT_SETTINGS.beatLead
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) failures++; };

// A seeded generator, so every run hears the same hiss.
let seed = 0x9e3779b9;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Add a plucked string: harmonics 1..n of f0, the higher ones dying faster. */
function pluck(out, at, f0, amp, decay, n) {
  const start = Math.round(at * SR), len = Math.round(decay * 6 * SR);
  for (let h = 1; h <= n; h++) {
    const f = f0 * h; if (f > 6000) break;
    const a = amp / h, d = decay / (1 + 0.15 * h), w = 2 * Math.PI * f / SR;
    for (let i = 0; i < len && start + i < out.length; i++) out[start + i] += a * Math.exp(-i / SR / d) * Math.sin(w * i);
  }
}
/**
 * A soft-attacked brass note (30 ms rise), harmonics of f0 from the second:
 * an acoustic recording horn took little under about 170 Hz, so a tuba's
 * fundamental is not on the record (the listener's ear supplies it), and
 * that is why the kick finds nothing on these songs.
 */
function blow(out, at, f0, amp, dur) {
  const start = Math.round(at * SR), len = Math.round(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR, env = Math.min(1, t / 0.03) * Math.exp(-t / dur);
    let s = 0; for (let h = 2; h <= 7; h++) s += Math.sin(2 * Math.PI * f0 * h * t) / h;
    out[start + i] += amp * env * s;
  }
}
/** A held, sung note with vibrato (±1.5% at 5.5 Hz) over the whole stretch. */
function sing(out, f0, amp) {
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = f0 * (1 + 0.015 * Math.sin(2 * Math.PI * 5.5 * i / SR));
    phase += 2 * Math.PI * f / SR;
    let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(h * phase) / (h * h);
    out[i] += amp * s;
  }
}
/** A kick drum: a sine swept 120→50 Hz, a quarter-second body. */
function kick(out, at, amp) {
  const start = Math.round(at * SR), len = Math.round(0.35 * SR);
  let phase = 0;
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR; phase += 2 * Math.PI * (50 + 70 * Math.exp(-t / 0.04)) / SR;
    out[start + i] += amp * Math.exp(-t / 0.12) * Math.sin(phase);
  }
}
const hiss = (out, amp) => { for (let i = 0; i < out.length; i++) out[i] += amp * (2 * rand() - 1); };
function noiseBurst(out, at, amp, dur) {
  const start = Math.round(at * SR), len = Math.round(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) out[start + i] += amp * Math.exp(-i / SR / (dur / 4)) * (2 * rand() - 1);
}

/**
 * The acoustic recording horn: a 170 Hz second-order high-pass over the whole
 * mix (RBJ biquad, Q 0.707). The horn's throat passed little under about
 * 170 Hz, which is why a 78's tuba has no fundamental and why it took no bass
 * drum; this is what makes the kickless band a 78 and not a band in a room.
 */
function horn(out) {
  const w = 2 * Math.PI * 170 / SR, al = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
}

/** The kickless band, `seconds` long; returns its samples and its beats' times. */
function band(seconds, withKick, inRoom = false) {
  const out = new Float32Array(Math.round(seconds * SR));
  const chords = [[196, 247, 294], [220, 277, 330], [175, 220, 262], [196, 247, 294]];
  const beats = [];
  for (let b = 0, t = 0.5; t < seconds - 1; b++, t += BEAT_S) {
    beats.push(t);
    for (const f of chords[(b >> 2) % 4]) pluck(out, t + 0.004 * rand(), f, 0.09, 0.12, 12);
    if (b % 2 === 0) blow(out, t, 146.8, 0.12, 0.35);
    // A soft cornet answer on the "and" of every other beat: every real 78 has
    // melody between its beats, and a band that only ever sounded on the beat
    // could not tell "the beat" from "any attack".
    if (b % 2 === 1) blow(out, t + BEAT_S / 2, 523.3, 0.04, 0.2);
    if (withKick) { kick(out, t, 0.7); noiseBurst(out, t + BEAT_S / 2, 0.12, 0.04); }
  }
  sing(out, 440, 0.06);
  hiss(out, 0.015);
  if (!withKick && !inRoom) horn(out);
  return { pcm: out, beats };
}

/** Run the ear over `pcm` at `fps`: every frame's kick and beat onset time and HitSource's Kick hit, and the clock's kicks. */
function hear(pcm, fps, fromBeat = true) {
  const ear = new SongEar(pcm, SR, fps);
  const hits = new HitSource();
  const clock = new BeatClock();
  const kicks = [], beats = [], clockKicks = [], kickHitRises = [];
  let lastKick = null, lastBeat = null, lastHeard = null, prevKickHit = 0;
  for (let i = 0; i < ear.frames; i++) {
    const time = i / fps;
    const f = ear.next().features;
    if (f.beat === undefined) throw new Error('the reading has no beat: nothing here would measure the pulse');
    if (f.onsets.kick.at !== null && f.onsets.kick.at !== lastKick) { lastKick = f.onsets.kick.at; kicks.push(lastKick); }
    if (f.beat && f.beat.at !== null && f.beat.at !== lastBeat) { lastBeat = f.beat.at; beats.push(lastBeat); }
    // The frame loop in a render (clockIsFixed): the frame is when it was heard.
    const heardOn = (fromBeat ? f.beat ?? f.onsets.kick : f.onsets.kick).at;
    let heardAt = null;
    if (heardOn !== null && heardOn !== lastHeard) { lastHeard = heardOn; heardAt = time * 1000; }
    if (clock.update(time * 1000, heardAt, TRUST, LEAD_MS).kick) clockKicks.push(time);
    hits.update(fromBeat ? f : { ...f, beat: undefined }, time);
    const kh = hits.value('kickHit');
    if (kh > prevKickHit + 0.05) kickHitRises.push(time);
    prevKickHit = kh;
  }
  return { kicks, beats, clockKicks, kickHitRises, pulses: ear.features.pulseEar.pulses, frames: ear.frames };
}

/** Of the true beats after `from` s, the fraction with an event in [t - early, t + late]. */
function caught(truth, events, from, early, late) {
  const want = truth.filter((t) => t >= from);
  let n = 0;
  for (const t of want) if (events.some((e) => e >= t - early && e <= t + late)) n++;
  return want.length ? n / want.length : 0;
}
/** Of the events after `from` s, the fraction near no true beat. */
function stray(truth, events, from, early, late) {
  const got = events.filter((e) => e >= from);
  let n = 0;
  for (const e of got) if (!truth.some((t) => e >= t - early && e <= t + late)) n++;
  return got.length ? n / got.length : 0;
}
const pct = (x) => `${(100 * x).toFixed(0)}%`;

const WARM = 4; // seconds: the detectors' one-second windows and the clock's lock
const kickless = band(40, false);
for (const fps of [30, 60]) {
  console.log(`\n# the kickless band, ${BPM} bpm, ${fps} fps (${kickless.beats.length} beats)`);
  const heard = hear(kickless.pcm, fps, true);
  const control = hear(kickless.pcm, fps, false);
  const kickCaught = caught(kickless.beats, heard.kicks, WARM, 0.02, 0.07);
  check(kickCaught < 0.2, `control: the kick alone hears ${pct(kickCaught)} of the band's beats (under 20%: the band has no kick drum)`);
  const beatCaught = caught(kickless.beats, heard.beats, WARM, 0.02, 0.07);
  const beatStray = stray(kickless.beats, heard.beats, WARM, 0.02, 0.07);
  check(beatCaught >= 0.9, `the beat hears ${pct(beatCaught)} of the band's beats within 70 ms (at least 90%)`);
  check(beatStray <= 0.1, `${pct(beatStray)} of the beats land on no note (at most 10%)`);
  // The clock fires up to LEAD_MS ahead of a heard beat once it has locked,
  // and on the frame it hears one before then: from LEAD_MS + 30 ms early to
  // 70 ms late. Caught and stray both, and as many kicks as beats: a clock
  // that fired on every frame would catch every beat.
  const CLOCK_EARLY = (LEAD_MS + 30) / 1000, CLOCK_LATE = 0.07;
  const clockOn = caught(kickless.beats, heard.clockKicks, WARM, CLOCK_EARLY, CLOCK_LATE);
  const clockStray = stray(kickless.beats, heard.clockKicks, WARM, CLOCK_EARLY, CLOCK_LATE);
  const clockN = heard.clockKicks.filter((t) => t >= WARM).length, beatsN = kickless.beats.filter((t) => t >= WARM).length;
  check(control.kicks.length === 0 || control.clockKicks.length <= control.kicks.length + 2,
    `control: the beat clock fed the kick fires ${control.clockKicks.length} times for ${control.kicks.length} kicks`);
  check(clockOn >= 0.85, `the beat clock fed the beat fires on ${pct(clockOn)} of the band's beats (at least 85%)`);
  check(clockStray <= 0.1 && Math.abs(clockN - beatsN) <= 0.1 * beatsN,
    `the clock fires ${clockN} times for ${beatsN} beats, ${pct(clockStray)} on no beat (within 10%, at most 10%)`);
  const patch = caught(kickless.beats, heard.kickHitRises, WARM, 0.02, 0.1);
  const patchStray = stray(kickless.beats, heard.kickHitRises, WARM, 0.02, 0.1);
  check(patch >= 0.9 && patchStray <= 0.1, `the patch bay's Kick hit rises on ${pct(patch)} of the band's beats, ${pct(patchStray)} of its rises on no beat (at least 90%, at most 10%)`);
  const ctlRises = control.kickHitRises.filter((t) => t >= WARM).length;
  check(ctlRises <= control.kicks.filter((t) => t >= WARM).length + 1, `control: Kick hit fed the kick alone rises ${ctlRises} times (no more than the kick fires)`);
}

// The same band without the horn: the F chord's 175 Hz partials leak into the
// kick's 30-120 Hz through the analysis window, and the kick fires in runs of
// two or three on it (the Wolverines do this, 22 kicks a minute). A run must
// not take the beat away from the band (pulseEar.ts's KICK_STEADY_S).
const room = band(40, false, true);
for (const fps of [30, 60]) {
  console.log(`\n# the kickless band in a room (no horn), ${fps} fps`);
  const heard = hear(room.pcm, fps, true);
  const kickCaught = caught(room.beats, heard.kicks, WARM, 0.02, 0.07);
  check(kickCaught >= 0.1, `precondition: the kick fires on ${pct(kickCaught)} of the band's beats (at least 10%, or this case tests nothing)`);
  const beatCaught = caught(room.beats, heard.beats, WARM, 0.02, 0.07);
  check(beatCaught >= 0.9, `the beat hears ${pct(beatCaught)} of the band's beats within 70 ms (at least 90%)`);
  check(stray(room.beats, heard.beats, WARM, 0.02, 0.07) <= 0.1, `at most 10% of the beats land on no note`);
}

// A loop: a kick once a bar (too sparse to keep time) and a hat on every
// sixteenth. The pulse rings on every hat; the beat must not strobe faster than
// BEAT_MIN_GAP_S, and must still land on the quarters.
const loop = (() => {
  const out = new Float32Array(30 * SR), beats = [];
  for (let b = 0, t = 0.5; t < 29; b++, t += BEAT_S) {
    beats.push(t);
    if (b % 4 === 0) kick(out, t, 0.7);
    // A closed hat rings 50-100 ms. A 30 ms burst at 30 fps (a frame every 33 ms)
    // falls across two frames as the grid drifts against the sixteenths, and
    // the pulse missed every hat for a bar in each 7.5 s: an ear limit at the
    // films' frame rate, written in the plan, not what this case measures.
    for (let q = 0; q < 4; q++) noiseBurst(out, t + q * BEAT_S / 4, 0.1, 0.06);
  }
  hiss(out, 0.01);
  return { pcm: out, beats };
})();
for (const fps of [30, 60]) {
  console.log(`\n# a loop with a kick once a bar and sixteenth-note hats, ${fps} fps`);
  const heard = hear(loop.pcm, fps, true);
  const b = heard.beats.filter((t) => t >= WARM);
  // Two beats closer than BEAT_MIN_GAP_S only where the second is the bar's
  // kick (pulseEar.ts: it pulls the pulse back onto the beat), and never
  // closer than SAME_ATTACK_S, one attack heard twice.
  const kickSet = new Set(heard.kicks);
  let pulseGap = Infinity, anyGap = Infinity;
  for (let i = 1; i < b.length; i++) {
    const g = b[i] - b[i - 1];
    anyGap = Math.min(anyGap, g);
    if (!kickSet.has(b[i])) pulseGap = Math.min(pulseGap, g);
  }
  const pulsed = heard.beats.length - heard.kicks.length;
  check(pulsed >= loop.beats.length, `precondition: the pulse gives ${pulsed} beats the kick did not (the hats are heard)`);
  check(pulseGap >= 0.25 - 1e-9, `the band's beats come no closer than ${pulseGap.toFixed(3)} s (at least 0.25 s, 240 a minute)`);
  check(anyGap >= 0.1 - 1e-9, `no beat comes within ${anyGap.toFixed(3)} s of another (at least 0.1 s: one attack is one beat)`);
  const q = caught(loop.beats, heard.beats, WARM, 0.02, 0.07);
  check(q >= 0.9, `the beat lands on ${pct(q)} of the quarters (at least 90%)`);
}

const drummed = band(30, true);
for (const fps of [30, 60]) {
  console.log(`\n# the same band with a kick drum on every beat and hats between, ${fps} fps`);
  const heard = hear(drummed.pcm, fps, true);
  const k = heard.kicks.filter((t) => t >= WARM), b = heard.beats.filter((t) => t >= WARM);
  const same = k.length === b.length && k.every((t, i) => t === b[i]);
  check(k.length >= 0.9 * drummed.beats.filter((t) => t >= WARM).length, `the kick hears ${k.length} of ${drummed.beats.filter((t) => t >= WARM).length} kicks (the control: a kick that keeps time)`);
  check(same, `every beat is a kick and every kick a beat, to the frame (${b.length} beats, ${k.length} kicks)`);
}

// A breakdown: the drummer plays 0-12 s, lays out 12-24 s, and comes back at
// 24 s. The band carries the beat while the kick is out (from KICK_GAP_S after
// its last hit), and the beat is the kick to the frame again once it has been
// steady for KICK_STEADY_S (pulseEar.ts).
const breakdown = (() => {
  const b = band(36, false, true);
  for (const t of b.beats) if (t < 12 || t >= 24) kick(b.pcm, t, 0.7);
  return b;
})();
for (const fps of [30, 60]) {
  console.log(`\n# a breakdown: kick, then none from 12 s, then the kick again from 24 s, ${fps} fps`);
  const heard = hear(breakdown.pcm, fps, true);
  const out = breakdown.beats.filter((t) => t >= 12 + 1.5 && t < 24);
  const carried = caught(out, heard.beats.filter((t) => t < 24), 0, 0.02, 0.07);
  check(carried >= 0.9, `with the kick out the band carries ${pct(carried)} of the beats from 13.5 s (at least 90%)`);
  const back = 24 + 3 + 0.5;
  const k = heard.kicks.filter((t) => t >= back), b = heard.beats.filter((t) => t >= back);
  check(k.length >= 0.9 * breakdown.beats.filter((t) => t >= back).length && k.length === b.length && k.every((t, i) => t === b[i]),
    `with the kick back, from ${back} s every beat is a kick and every kick a beat (${b.length} beats, ${k.length} kicks)`);
}

console.log('\n# nothing to hear');
const quiet = [
  ['white noise', (() => { const o = new Float32Array(30 * SR); hiss(o, 0.1); return o; })()],
  ['a held chord with vibrato and hiss', (() => { const o = new Float32Array(30 * SR); sing(o, 220, 0.1); sing(o, 277.2, 0.08); hiss(o, 0.01); return o; })()],
  ['digital silence', new Float32Array(10 * SR)],
];
for (const [name, pcm] of quiet) {
  for (const fps of [30, 60]) {
    const heard = hear(pcm, fps, true);
    const extra = heard.beats.filter((t) => !heard.kicks.includes(t)).length;
    check(extra <= 1 && heard.pulses <= 1, `${name}, ${fps} fps: ${heard.pulses} pulses, ${extra} beats that are not kicks (at most 1 each, the first sound)`);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
