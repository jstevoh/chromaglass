#!/usr/bin/env node
/**
 * Does the show hear the drums, by name, on time, and only the ones played?
 *
 *   npm run bands
 *
 * `src/lib/audioFeatures.ts` turns each analyser frame into named levels
 * (level, kick, bass, snare, hats, eight bands) and an onset per name. Sound
 * learn will bind controls and triggers to those names, and a song render will
 * compute them from the file, so what is measured here is the feature itself:
 * that a kick fires `kick` and nothing else, on the frame it can first be
 * heard, at any playback level, identically on every run.
 *
 * The drums are synthesised so the truth is known to the sample:
 *
 *   kick   a 60→50 Hz sine, 120 ms decay, on every beat at 120 bpm;
 *   snare  a 200 Hz body plus noise high-passed at 1 kHz (two poles) and
 *          rolled off at 8 kHz, on beats one and three (so half the kicks
 *          land with a snare, as they do in four-on-the-floor);
 *   hats   noise through three poles at 7 kHz, 15 ms decay, on every eighth;
 *   bass   a sawtooth line, a new note each off-beat, re-articulated;
 *   pad    a four-note chord of sawtooth-ish partials, each note a detuned pair
 *          (±3.5 cents, so it beats the way a real chorus pad does), chords
 *          crossfading every two bars. Never silent: it is the "sustained pad
 *          under them".
 *
 * Every hit is humanised by up to ±8 ms and given a random velocity, from a
 * seeded generator, so hits fall at every phase of the frame grid rather than
 * all at one, and the run is the same every time. Every track carries a
 * 16-bit-level noise floor (-96 dBFS) because no recording or microphone is
 * digitally silent between hits; the analyser treats digital silence
 * specially (see SILENCE_DB there) and a synthetic track of zeros between
 * drums would be measuring that rule instead of the drums.
 *
 * What "on time" means: the analyser window ends at each frame's time, so the
 * first frame that can hear a hit is the first whose window ends after it.
 * An onset must land on that frame or the next one (the first often holds
 * only a few milliseconds of the hit, at the tapered end of the window). At 60
 * fps that is 0 to 33 ms after the hit; the measured latencies are printed.
 *
 * Then the shelf: the tracks in public/music, decoded (ffmpeg if there is one,
 * else Playwright's Chromium, else a printed SKIP) and run through the same
 * analyser, as a sanity line: rates per source per minute, nothing NaN,
 * nothing firing on every frame.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analysePcm, SOUND_SOURCES, SOURCE_NAMES, BAND_COUNT, BAND_EDGES_HZ } from '../src/lib/audioFeatures.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SR = 44100;
const FPS = 60;
const BEAT = 60 / 120;
const SECONDS = 16;
const DRUMS = ['kick', 'snare', 'hats'];

/*
  The gates, and why these numbers.

  RECALL and PRECISION 0.95: a trigger that drops or invents one hit in twenty
  is already visible on a plate that pulses with every beat, and these are
  clean synthetic drums; real music is harder, not easier, so this is the bar
  the analyser has to clear with room to spare. BASS_RECALL is 0.9 because a
  re-articulated legato line is a softer onset than a drum, and `bass` is
  mostly bound as a level, not a trigger. Measured values are printed with
  each.

  STRAYS 0.05: on a track holding one instrument, each drum it is not may fire
  on at most one in twenty of its hits. That is the cross-talk gate: "a
  kick-only track fires kick, not hats".

  LEVEL_COUNT 0.05: the same song 20 dB quieter (over the same room hiss, so
  the quiet one also has 20 dB less signal over noise) fires within 5% of the
  same number of onsets per source (or within one). LEVEL_VALUE 0.05: and each
  source's 0..1 value differs by at most that, on average over the song.

  RATE 0.1: on real music, no source fires on more than one frame in ten, six
  a second. The refractory period alone caps a source near one in four, so a
  source anywhere near the cap is a detector firing on its own noise.
*/
const RECALL = 0.95;
const PRECISION = 0.95;
const BASS_RECALL = 0.9;
const STRAYS = 0.05;
const LEVEL_COUNT = 0.05;
const LEVEL_VALUE = 0.05;
const RATE = 0.1;
/** How much of each shelf track is analysed: all of the three short ones, the first six minutes of the long one. */
const SHELF_SECONDS = 360;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Synthesis ─────────────────────────────────────────────────────────────

/** mulberry32: a seeded generator, so every run synthesises the same tracks. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function highPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = rc / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  return y;
}
function lowPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = (1 / SR) / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let py = 0;
  for (let i = 0; i < x.length; i++) { py += a * (x[i] - py); y[i] = py; }
  return y;
}
const noise = (n, rand) => Float32Array.from({ length: n }, () => rand() * 2 - 1);
/** A linear fade over the last `sec` of a sound, so no hit ends in a click of its own. */
const tail = (i, len, sec) => Math.min(1, (len - i) / (sec * SR));

function kick(out, t0, vel) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.4 * SR);
  let phase = 0;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    phase += 2 * Math.PI * (50 + 10 * Math.exp(-t / 0.04)) / SR;
    out[s0 + i] += 0.8 * vel * Math.min(1, t / 0.001) * Math.exp(-t / 0.12) * tail(i, len, 0.1) * Math.sin(phase);
  }
}
function snare(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.25 * SR);
  const n = lowPass(highPass(highPass(noise(len, rand), 1000), 1000), 8000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    const body = 0.35 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 200 * t);
    out[s0 + i] += vel * Math.min(1, t / 0.001) * tail(i, len, 0.05) * (body + 0.5 * Math.exp(-t / 0.07) * n[i]);
  }
}
function hat(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.08 * SR);
  const n = highPass(highPass(highPass(noise(len, rand), 7000), 7000), 7000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    out[s0 + i] += 0.6 * vel * Math.min(1, t / 0.0005) * Math.exp(-t / 0.015) * tail(i, len, 0.02) * n[i];
  }
}
const BASS_NOTES = [55, 73.42, 65.41, 82.41, 55, 98, 87.31, 61.74];
/**
 * One bass note: a band-limited sawtooth, 5 ms attack, 150 ms decay (a
 * plucked or plucky synth bass, as most dance-music bass lines are; a fully
 * legato bass line has no onsets to find, only a change of pitch).
 */
function bassNote(out, t0, dur, hz, vel) {
  const s0 = Math.round(t0 * SR), len = Math.round(dur * SR);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * hz * h * t) / h;
    out[s0 + i] += 0.3 * vel * Math.min(1, t / 0.005) * Math.exp(-t / 0.15) * tail(i, len, 0.03) * s;
  }
}
function pad(out) {
  const chords = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [130.81, 261.63, 329.63, 392], [98, 196, 246.94, 293.66]];
  const bar = 8 * BEAT, fade = 0.5;
  // Weight of chord c at time t: 1 inside its two bars, a raised-cosine
  // crossfade across each boundary with the next.
  const weight = (c, t) => {
    if (c < 0) return 0;
    const inside = Math.min(t - c * bar, (c + 1) * bar - t);
    if (c === 0 && t < bar / 2) return 1;
    if (inside >= fade / 2) return 1;
    if (inside <= -fade / 2) return 0;
    return 0.5 + 0.5 * Math.sin(Math.PI * inside / fade);
  };
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const c = Math.floor(t / bar);
    let s = 0;
    for (const k of [c - 1, c, c + 1]) {
      const w = weight(k, t);
      if (w <= 0) continue;
      for (const f of chords[k % chords.length]) for (const detune of [0.998, 1.002]) {
        for (let h = 1; h <= 5; h++) s += w * Math.sin(2 * Math.PI * f * detune * h * t) / h;
      }
    }
    out[i] += 0.02 * Math.min(1, t / 1.0) * s;
  }
}

/** -96 dBFS RMS: a 16-bit recording's own floor. */
const DITHER = 1.6e-5;
/** -66 dBFS RMS: a quiet room through a microphone. */
const ROOM = 5e-4;

/**
 * One track and its truth. `optional` holds hits that may be found without
 * being required: hats that land on a snare (masked by it; see
 * audioFeatures.ts), and, for `bass`, the kicks (a kick is a low-end event).
 */
function track({ kicks, snares, hats, bass, withPad, gain = 1, hiss = DITHER, seed = 1, seconds = SECONDS }) {
  const rand = rng(seed);
  const out = new Float32Array(seconds * SR);
  const truth = { kick: [], snare: [], hats: [], bass: [] };
  const optional = { kick: [], snare: [], hats: [], bass: [] };
  let note = 0;
  for (let b = 1; b * BEAT < seconds - 0.5; b++) {
    for (let e = 0; e < 2; e++) {
      const t = b * BEAT + e * BEAT / 2 + (rand() - 0.5) * 0.016;
      const onSnare = e === 0 && snares && b % 2 === 1;
      if (hats) { hat(out, t, 0.6 + 0.4 * rand(), rand); (onSnare ? optional : truth).hats.push(t); }
      if (e === 0 && kicks) { kick(out, t, 0.7 + 0.3 * rand()); truth.kick.push(t); optional.bass.push(t); }
      if (onSnare) { snare(out, t, 0.7 + 0.3 * rand(), rand); truth.snare.push(t); }
      if (e === 1 && bass) { bassNote(out, t, BEAT, BASS_NOTES[note++ % BASS_NOTES.length], 0.8 + 0.2 * rand()); truth.bass.push(t); }
    }
  }
  if (withPad) pad(out);
  for (let i = 0; i < out.length; i++) out[i] = out[i] * gain + hiss * (rand() * 2 - 1) * Math.sqrt(3);
  return { pcm: out, truth, optional };
}

// ── Scoring ───────────────────────────────────────────────────────────────

/** The first frame whose analysis window ends after sample `s`. */
function firstFrame(s, fps) {
  let f = Math.floor((s * fps) / SR);
  while (Math.round((f * SR) / fps) <= s) f++;
  return f;
}

/**
 * Onsets of `src` against the truth: each hit claims the first unclaimed
 * onset on its first audible frame or the next. Optional hits may claim one
 * too (so finding a masked hat is not a false positive) but are not required.
 */
function score(readings, fps, src, required, optional = []) {
  const frames = [];
  readings.forEach((r, f) => { if (r.onsets[src].hit) frames.push(f); });
  const used = new Set();
  const latencies = [];
  const claim = (t) => {
    const f0 = firstFrame(Math.round(t * SR), fps);
    const f = frames.find((x) => !used.has(x) && x >= f0 && x <= f0 + 1);
    if (f === undefined) return false;
    used.add(f);
    latencies.push((f / fps - t) * 1000);
    return true;
  };
  const found = required.filter(claim).length;
  const optionalFound = optional.filter(claim).length;
  return {
    hits: required.length, found, optional: optional.length, optionalFound, fired: frames.length,
    recall: required.length ? found / required.length : 1,
    precision: frames.length ? (found + optionalFound) / frames.length : 1,
    latencies,
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const ms = (a) => a.length ? `${Math.round(a.reduce((s, x) => s + x, 0) / a.length)}/${Math.round(Math.max(...a))} ms` : '-';

// ── The drums ─────────────────────────────────────────────────────────────
console.log(`${BAND_COUNT} bands, edges ${BAND_EDGES_HZ.map((e) => Math.round(e)).join(' / ')} Hz; ${SR} Hz at ${FPS} fps\n`);
console.log('Each drum on its own and together, with and without a pad under it.');
console.log('  found/hits, precision, mean/max latency after the hit\n');

const CASES = [
  ['kick', { kicks: true }],
  ['snare', { snares: true }],
  ['hats', { hats: true }],
  ['kick + snare + hats', { kicks: true, snares: true, hats: true }],
  ['kick + pad', { kicks: true, withPad: true }],
  ['snare + pad', { snares: true, withPad: true }],
  ['hats + pad', { hats: true, withPad: true }],
  ['kick + snare + hats + pad', { kicks: true, snares: true, hats: true, withPad: true }],
];

const table = [];
for (const [name, opts] of CASES) {
  const { pcm, truth, optional } = track(opts);
  const readings = analysePcm(pcm, SR, FPS);
  const played = DRUMS.filter((d) => truth[d].length);
  const cells = [];
  for (const d of played) {
    const s = score(readings, FPS, d, truth[d], optional[d]);
    cells.push(`${d} ${s.found}/${s.hits} ${pct(s.precision)} ${ms(s.latencies)}${s.optional ? ` (masked under a snare: ${s.optionalFound}/${s.optional} found)` : ''}`);
    check(`${name}: ${d} found`, s.recall >= RECALL, `${s.found}/${s.hits} = ${pct(s.recall)}`);
    check(`${name}: ${d} fires only on its own hits`, s.precision >= PRECISION, `${s.found + s.optionalFound}/${s.fired} = ${pct(s.precision)}`);
  }
  if (played.length === 1) {
    const hits = truth[played[0]].length;
    const strays = DRUMS.filter((d) => d !== played[0]).map((d) => [d, readings.filter((r) => r.onsets[d].hit).length]);
    for (const [d, n] of strays) check(`${name}: no ${d} from it`, n <= STRAYS * hits, `${n} on ${hits} hits`);
    cells.push(`strays ${strays.map(([d, n]) => `${d} ${n}`).join(', ')}`);
  }
  table.push(`      ${name.padEnd(26)} ${cells.join(' | ')}`);
}
console.log(table.join('\n'));

// ── The bass line ─────────────────────────────────────────────────────────
{
  console.log('\nA bass line: a new note on every off-beat.');
  const { pcm, truth } = track({ bass: true });
  const readings = analysePcm(pcm, SR, FPS);
  const s = score(readings, FPS, 'bass', truth.bass);
  check('bass line: bass finds its notes', s.recall >= BASS_RECALL, `${s.found}/${s.hits} = ${pct(s.recall)}, ${ms(s.latencies)}`);
  check('bass line: bass fires only on them', s.precision >= PRECISION, `${s.found}/${s.fired} = ${pct(s.precision)}`);
  const stray = Object.fromEntries(DRUMS.map((d) => [d, readings.filter((r) => r.onsets[d].hit).length]));
  check('bass line: no snare or hats from it', stray.snare + stray.hats <= STRAYS * s.hits, `snare ${stray.snare}, hats ${stray.hats}`);

  /*
    What is not gated, and why; measured every run so it cannot quietly get
    worse or be forgotten.

    A bass note in the kick's octave reads as a kick: one spectrum frame
    cannot tell a synth bass from an 808.

    Under a pad, or in the tail of a kick, a plucked bass note rises about
    5 dB per frame through the analyser's 0.6 smoothing, under what a band has
    to clear to stay quiet on room noise (ODF_NOISE_DB). And a kick over a
    bass line nearly as loud as it in the sub rises about 6 dB, where on its
    own it rises 30. Lowering the floor to find them made a quiet room fire
    the low bands on its own hiss; that trade was taken for the room.
  */
  const band = track({ kicks: true, snares: true, hats: true, bass: true, withPad: true });
  const inBand = analysePcm(band.pcm, SR, FPS);
  const underPad = track({ bass: true, withPad: true });
  const padded = analysePcm(underPad.pcm, SR, FPS);
  const k = score(inBand, FPS, 'kick', band.truth.kick);
  const b1 = score(padded, FPS, 'bass', underPad.truth.bass);
  const b2 = score(inBand, FPS, 'bass', band.truth.bass, band.optional.bass);
  console.log(`      known, not gated: ${stray.kick} of ${s.hits} bass notes (55–98 Hz) also read as a kick`);
  console.log(`      known, not gated: bass notes under a pad ${b1.found}/${b1.hits}; in the full band ${b2.found}/${b2.hits}`);
  console.log(`      known, not gated: kicks over that bass line ${k.found}/${k.hits}, precision ${pct(k.precision)}`);
}

// ── Level ─────────────────────────────────────────────────────────────────
{
  console.log('\nThe drums and pad at full level and 20 dB down.');
  const opts = { kicks: true, snares: true, hats: true, withPad: true };
  // Counts over the same room hiss, so the quiet one also has 20 dB less
  // signal over noise: the harder case, and the one a real room is.
  const loud = track({ ...opts, hiss: ROOM }), quiet = track({ ...opts, hiss: ROOM, gain: 0.1 });
  const a = analysePcm(loud.pcm, SR, FPS), b = analysePcm(quiet.pcm, SR, FPS);
  for (const src of SOUND_SOURCES) {
    const na = a.filter((r) => r.onsets[src].hit).length;
    const nb = b.filter((r) => r.onsets[src].hit).length;
    check(`-20 dB in a room: ${src} fires as often`, Math.abs(na - nb) <= Math.max(1, LEVEL_COUNT * na), `${na} loud, ${nb} quiet`);
  }
  for (const d of DRUMS) {
    const s = score(b, FPS, d, quiet.truth[d], quiet.optional[d]);
    check(`-20 dB in a room: ${d} still found, and only it`, s.recall >= RECALL && s.precision >= PRECISION, `${s.found}/${s.hits}, precision ${pct(s.precision)}`);
  }
  // The values with no noise at all: this is the normalisation itself. Any
  // fixed noise floor is a different sound once the music is 20 dB nearer
  // it, and right to read differently: over the room it measured 0.11 on
  // snare and 0.21 on hats, and 0.07 on hats even over a 16-bit floor, all
  // of it in the gaps between hits, where the quiet version hears the noise.
  const c = analysePcm(track({ ...opts, hiss: 0 }).pcm, SR, FPS), q = analysePcm(track({ ...opts, hiss: 0, gain: 0.1 }).pcm, SR, FPS);
  for (const src of SOUND_SOURCES) {
    const dv = c.reduce((s, r, i) => s + Math.abs(r[src] - q[i][src]), 0) / c.length;
    check(`-20 dB: ${src} reads the same`, dv <= LEVEL_VALUE, `mean difference ${dv.toFixed(3)}`);
  }
}

// ── A room with nothing playing ───────────────────────────────────────────
{
  console.log('\nNothing but noise: 16 s of a 16-bit floor, and of a quiet room.');
  for (const [name, hiss] of [['dither', DITHER], ['room hiss', ROOM]]) {
    const { pcm } = track({ hiss });
    const readings = analysePcm(pcm, SR, FPS);
    const fired = SOURCE_NAMES.map((n) => [n, readings.filter((r) => r.onsets[n].hit).length]).filter(([, c]) => c > 0);
    // `level` may fire once, on the first frame of sound after the file's
    // digital lead-in: sound did begin.
    const bad = fired.filter(([n, c]) => n !== 'level' || c > 1);
    check(`${name} alone fires nothing`, bad.length === 0, fired.length ? fired.map(([n, c]) => `${n} ${c}`).join(', ') : 'no onsets');
  }
}

// ── 30 fps ────────────────────────────────────────────────────────────────
{
  console.log('\nThe drums and pad at 30 fps: the same hits, on a coarser frame grid.');
  const t = track({ kicks: true, snares: true, hats: true, withPad: true });
  const r30 = analysePcm(t.pcm, SR, 30), r60 = analysePcm(t.pcm, SR, 60);
  for (const d of DRUMS) {
    const s = score(r30, 30, d, t.truth[d], t.optional[d]);
    const n60 = r60.filter((r) => r.onsets[d].hit).length;
    check(`30 fps: ${d}`, s.recall >= RECALL && s.precision >= PRECISION && Math.abs(s.fired - n60) <= Math.max(1, LEVEL_COUNT * n60),
      `${s.found}/${s.hits}, precision ${pct(s.precision)}, ${ms(s.latencies)}; ${s.fired} onsets at 30 fps, ${n60} at 60`);
  }
}

// ── Deterministic ─────────────────────────────────────────────────────────
{
  console.log('\nTwice, from scratch: a render must be the same film every time.');
  const opts = { kicks: true, snares: true, hats: true, bass: true, withPad: true, hiss: ROOM };
  const one = JSON.stringify(analysePcm(track(opts).pcm, SR, FPS));
  const two = JSON.stringify(analysePcm(track(opts).pcm, SR, FPS));
  const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  check('two runs are byte-identical', one === two, `${one.length} bytes, sha256 ${hash(one)} and ${hash(two)}`);
}

// ── The shelf ─────────────────────────────────────────────────────────────

/**
 * Per-source onset counts, and how many values or strengths were not a number
 * in 0..1. Runs in node and, as source text, in the page.
 */
function summarise(readings, names, sources) {
  const counts = {};
  let bad = 0;
  for (const n of names) counts[n] = 0;
  for (const r of readings) {
    for (const n of names) {
      const o = r.onsets[n];
      if (o.hit) counts[n]++;
      if (!Number.isFinite(o.strength) || o.strength < 0 || o.strength > 1) bad++;
    }
    for (const s of sources) if (!Number.isFinite(r[s]) || r[s] < 0 || r[s] > 1) bad++;
    for (const v of r.bands) if (!Number.isFinite(v) || v < 0 || v > 1) bad++;
  }
  return { frames: readings.length, counts, bad };
}

/** Mono float PCM at 44.1 kHz from ffmpeg, or null when there is no ffmpeg. */
function viaFfmpeg(file) {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-t', String(SHELF_SECONDS), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  if (run.error || run.status !== 0) return null;
  const b = run.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
}

/**
 * Decode and analyse in Chromium instead: its MP3 decoder, and this same
 * module bundled into the page, so a few hundred megabytes of samples never
 * cross the wire. Null when there is no browser to launch (the ubuntu Measure
 * runner installs none).
 */
async function viaChromium(files) {
  let chromium, build, launchChromium;
  try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
    ({ launchChromium } = await import('./chromium.mjs'));
  } catch { return null; }
  let browser;
  try { browser = await launchChromium(chromium); } catch { return null; }
  try {
    const bundle = await build({
      entryPoints: [`${ROOT}src/lib/audioFeatures.ts`], bundle: true, format: 'iife',
      globalName: 'AudioFeaturesLib', write: false, logLevel: 'warning',
    });
    const page = await browser.newPage();
    await page.route('http://shelf.test/**', (route) => {
      const name = route.request().url().split('/').pop();
      return name.endsWith('.mp3')
        ? route.fulfill({ body: readFileSync(`${ROOT}public/music/${name}`), contentType: 'audio/mpeg' })
        : route.fulfill({ body: '<!doctype html><title>shelf</title>', contentType: 'text/html' });
    });
    await page.goto('http://shelf.test/index.html');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const out = [];
    for (const file of files) {
      out.push(await page.evaluate(async ({ file, seconds, fps, summariseSource }) => {
        const lib = window.AudioFeaturesLib;
        const summariseInPage = new Function(`return (${summariseSource})`)();
        const data = await (await fetch(`http://shelf.test/${file}`)).arrayBuffer();
        const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
        const n = Math.min(audio.length, Math.round(seconds * audio.sampleRate));
        const mono = new Float32Array(n);
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const ch = audio.getChannelData(c);
          for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels;
        }
        return summariseInPage(lib.analysePcm(mono, audio.sampleRate, fps), lib.SOURCE_NAMES, lib.SOUND_SOURCES);
      }, { file, seconds: SHELF_SECONDS, fps: FPS, summariseSource: summarise.toString() }).catch((e) => ({ error: String(e) })));
    }
    return out;
  } finally {
    await browser.close();
  }
}

{
  const dir = `${ROOT}public/music`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort() : [];
  console.log(`\nThe shelf: ${files.length} tracks, up to ${SHELF_SECONDS / 60} minutes of each, onsets per minute.`);
  let results = null, how = '';
  const decoded = files.map((f) => viaFfmpeg(`${dir}/${f}`));
  if (files.length && decoded.every(Boolean)) {
    results = decoded.map((pcm) => summarise(analysePcm(pcm, SR, FPS), SOURCE_NAMES, SOUND_SOURCES));
    how = 'ffmpeg';
  } else if (files.length) {
    results = await viaChromium(files);
    how = 'Chromium';
  }
  if (!results) {
    console.log('  SKIP  no ffmpeg on the path and no Playwright Chromium to decode MP3 with: the shelf was NOT measured on this machine');
  } else {
    console.log(`  decoded with ${how}`);
    const names = [...SOUND_SOURCES, ...SOURCE_NAMES.filter((n) => !SOUND_SOURCES.includes(n))];
    console.log(`      ${'track'.padEnd(20)}${names.map((n) => n.replace('band', 'b').padStart(7)).join('')}`);
    let levels = 0;
    files.forEach((file, i) => {
      const r = results[i];
      if (r.error) { check(`${file} decodes and analyses`, false, r.error); return; }
      const minutes = r.frames / FPS / 60;
      console.log(`      ${file.padEnd(20)}${names.map((n) => (r.counts[n] / minutes).toFixed(1).padStart(7)).join('')}`);
      levels += r.counts.level;
      const busiest = names.reduce((m, n) => (r.counts[n] > r.counts[m] ? n : m), names[0]);
      check(`${file}: every value and strength is a number in 0..1`, r.bad === 0, `${r.bad} bad over ${r.frames} frames`);
      check(`${file}: nothing fires on more than one frame in ten`, r.counts[busiest] <= RATE * r.frames,
        `busiest ${busiest}, ${pct(r.counts[busiest] / r.frames)} of frames`);
      check(`${file}: something is heard`, names.some((n) => r.counts[n] > 0), `${names.reduce((s, n) => s + r.counts[n], 0)} onsets in ${minutes.toFixed(1)} min`);
    });
    check('the shelf fires `level` at all', levels > 0, `${levels} level onsets`);
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
