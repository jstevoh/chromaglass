#!/usr/bin/env node
/**
 * Does the show notice that the song changed?
 *
 * "On a New Song" is one of the few settings that changes what the audience
 * sees without anyone touching anything, and it hangs off one question asked
 * of the microphone twenty times a second: is the room quiet? This drives that
 * question with level traces rather than with a stereo and a stopwatch.
 *
 *   npm run music
 *
 * Each case is a level trace in dBFS at 20 Hz, fed through the same
 * `RoomTracker` the analyser uses and the same `roomIsQuiet` rule the hook
 * uses, into `SongBoundary`. What is reported is whether the boundary fired
 * and how long after the next song's first note it took.
 *
 * The gaps are the ones real players leave: a compact disc's two seconds,
 * a streaming service's one, a DJ's crossfade of none. Anything that needs a
 * gap longer than four seconds does not work on real music.
 */

import { extractPeakHashes, buildIndex, matchSnippet, FP_RATE } from '../src/lib/localFingerprint.ts';
import { RoomTracker } from '../src/lib/audioCalibration.ts';
import { SongBoundary, roomIsQuiet, DEFAULT_BOUNDARY } from '../src/lib/songBoundary.ts';
import { TempoSource, bpmOf } from '../src/lib/tempo.ts';
import { BeatClock } from '../src/lib/beatClock.ts';

const HZ = 20;
const DT = 1 / HZ;

/** Music at a working level, with the level dipping between beats. */
const MUSIC_DB = -18;
/** A room with nobody playing anything: air conditioning and a mic preamp. */
const ROOM_DB = -62;

/**
 * One trace: seconds of music, a gap, more music. Level in dBFS per frame,
 * with a 2 Hz beat modulation so the "silence between beats" the gate exists
 * for is actually present.
 */
function trace({ firstSong, gap, secondSong, fadeGap = false, roomDb = ROOM_DB, leadIn = 5 }) {
  const out = [];
  const push = (seconds, level) => {
    for (let i = 0; i < Math.round(seconds * HZ); i++) {
      const t = out.length * DT;
      // A kick every half second: 6 dB of dip between hits.
      const beat = level > roomDb ? -6 * (0.5 + 0.5 * Math.cos(2 * Math.PI * 2 * t)) : 0;
      out.push(level + beat);
    }
  };
  // Room tone first. The calibration seeds its floor from the first thing it
  // hears, so a show started in the middle of a song has no idea what quiet
  // sounds like until the first one arrives — and cannot call a gap until it
  // does. Five seconds of an empty room is what turning the microphone on
  // before the music actually looks like.
  push(leadIn, roomDb);
  push(firstSong, MUSIC_DB);
  if (fadeGap) {
    // A crossfade: never actually quiet.
    for (let i = 0; i < Math.round(gap * HZ); i++) out.push(MUSIC_DB - 4);
  } else {
    push(gap, roomDb);
  }
  push(secondSong, MUSIC_DB);
  return { levels: out, nextSongFrame: Math.round((leadIn + firstSong + gap) * HZ) };
}

/** Run one trace and report when (or whether) the boundary fired. */
function run({ levels, nextSongFrame }, { useHeldGate, minGapMs }) {
  const room = new RoomTracker();
  const boundary = new SongBoundary(minGapMs ? { ...DEFAULT_BOUNDARY, minGapMs } : {});
  let firedFrame = null;
  let quietFrames = 0;

  for (let f = 0; f < levels.length; f++) {
    const cal = room.update(levels[f], DT);
    // `useHeldGate` is what the hook did before: time the gap against the
    // gate that exists to stop the visuals strobing.
    const quiet = useHeldGate ? !cal.signal : roomIsQuiet(cal, 0, 0);
    if (quiet) quietFrames++;
    if (boundary.update(quiet, f * DT * 1000) && firedFrame === null) firedFrame = f;
  }
  return {
    fired: firedFrame !== null,
    lateMs: firedFrame === null ? null : Math.round((firedFrame - nextSongFrame) * DT * 1000),
    quietSeconds: +(quietFrames * DT).toFixed(1),
  };
}

const CASES = [
  // A second or less is below what can be told from a break inside a song;
  // a gapless set is for identification to catch, not for listening.
  { name: 'gapless, 1 s gap', t: { firstSong: 30, gap: 1.0, secondSong: 10 }, expect: false },
  { name: 'a CD, 2 s gap', t: { firstSong: 30, gap: 2.0, secondSong: 10 }, expect: true },
  { name: 'a playlist, 3 s gap', t: { firstSong: 30, gap: 3.0, secondSong: 10 }, expect: true },
  { name: 'a long 6 s gap', t: { firstSong: 30, gap: 6.0, secondSong: 10 }, expect: true },
  { name: 'a DJ crossfade', t: { firstSong: 30, gap: 4.0, secondSong: 10, fadeGap: true }, expect: false },
  { name: 'a rest inside a song', t: { firstSong: 30, gap: 0.4, secondSong: 20 }, expect: false },
  { name: 'a gap too early to count', t: { firstSong: 8, gap: 3.0, secondSong: 10 }, expect: false },
  { name: 'a loud room, 2 s gap', t: { firstSong: 30, gap: 2.0, secondSong: 10, roomDb: -44 }, expect: true },
];

const pad = (s, n) => String(s).padEnd(n);
const verdict = (r, expect) => (r.fired === expect ? ' ok ' : 'FAIL');

console.log('Timing the gap against the held gate — what the hook used to do:\n');
console.log(`${pad('case', 26)} ${pad('fired', 7)} ${pad('late', 9)} quiet seen`);
const before = CASES.map(c => {
  const r = run(trace(c.t), { useHeldGate: true });
  console.log(`${pad(c.name, 26)} ${pad(r.fired ? 'yes' : 'no', 7)} ${pad(r.lateMs === null ? '—' : `${r.lateMs} ms`, 9)} ${r.quietSeconds} s`);
  return r;
});

console.log('\nTiming it against the unsmoothed verdict, gap 1.8 s:\n');
console.log(`${pad('case', 26)} ${pad('fired', 7)} ${pad('late', 9)} quiet seen`);
const after = CASES.map(c => {
  const r = run(trace(c.t), { useHeldGate: false, minGapMs: 1_800 });
  console.log(`${pad(c.name, 26)} ${pad(r.fired ? 'yes' : 'no', 7)} ${pad(r.lateMs === null ? '—' : `${r.lateMs} ms`, 9)} ${r.quietSeconds} s`);
  return r;
});

console.log('');
let failed = 0;
const checks = [];
CASES.forEach((c, i) => {
  const ok = after[i].fired === c.expect;
  if (!ok) failed++;
  const moved = before[i].fired !== after[i].fired ? `   (was ${before[i].fired ? 'yes' : 'no'})` : '';
  console.log(`${verdict(after[i], c.expect)}  ${c.name} — should fire: ${c.expect ? 'yes' : 'no'}${moved}`);
});

// A boundary that fires a second after the next song has started is no use to
// anything that wants to change the look on the downbeat.
const worst = Math.max(...after.filter((r, i) => CASES[i].expect && r.fired).map(r => r.lateMs));
console.log(`${worst <= 400 ? ' ok ' : 'FAIL'}  the latest a real gap is noticed: ${worst} ms after the next song starts`);
if (worst > 400) failed++;


// ── Naming the track ────────────────────────────────────────────────
//
// The local matcher is what names a song the show has heard before, and it is
// the only identification most people will ever have, because the fingerprint
// API needs a proxy with an API key behind it. Naming the WRONG song is worse
// than naming none: the plate takes on another track's colours and evolution,
// and nothing about the picture says it is wrong.
//
// Two synthetic songs, built from different note sequences over the same kind
// of material, so a match is a match on structure rather than on timbre.

function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A minute of "music": a note sequence with harmonics, hats and a kick. */
function song(seed, seconds = 60) {
  const rnd = prng(seed);
  const n = Math.round(seconds * FP_RATE);
  const pcm = new Float32Array(n);
  const scale = [0, 2, 3, 5, 7, 8, 10, 12];
  const noteLen = Math.round(0.5 * FP_RATE);
  for (let start = 0; start < n; start += noteLen) {
    const semis = scale[Math.floor(rnd() * scale.length)] + (rnd() < 0.3 ? 12 : 0);
    const f0 = 110 * Math.pow(2, semis / 12);
    const len = Math.min(noteLen, n - start);
    for (let i = 0; i < len; i++) {
      const t = i / FP_RATE;
      const env = Math.exp(-t * 3);
      let v = 0;
      for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / (h * h);
      // A kick at the top of each note and a hat halfway through it.
      const kick = Math.exp(-t * 26) * Math.sin(2 * Math.PI * 58 * Math.exp(-t * 7) * t);
      const hatAt = Math.abs(t - 0.25) < 0.03 ? (rnd() * 2 - 1) * 0.6 : 0;
      pcm[start + i] = v * 0.35 * env + kick * 0.5 + hatAt + (rnd() * 2 - 1) * 0.01;
    }
  }
  return pcm;
}

function fingerprint(isrc, pcm) {
  const { hashes, frames, durationSec } = extractPeakHashes(pcm, FP_RATE);
  return { isrc, title: isrc, artist: 'Test', hashes, frames, durationSec, createdAt: Date.now() };
}

const snippet = (pcm, atSec, seconds = 4) =>
  pcm.slice(Math.round(atSec * FP_RATE), Math.round((atSec + seconds) * FP_RATE));

const A = song(1), C = song(1234);
const fpA = fingerprint('TEST-A', A), fpC = fingerprint('TEST-C', C);

/**
 * The same audio as a microphone in a room would deliver it: band-limited,
 * with the room's noise on top and the level wrong. The reference in the
 * library was recorded through the same chain, but not on the same day, in
 * the same place, at the same volume — so a genuine match has to survive this
 * much difference and still be told apart from a track nobody has heard.
 */
function throughAMic(pcm, seed) {
  const rnd = prng(seed);
  const out = new Float32Array(pcm.length);
  let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < pcm.length; i++) {
    lp += (pcm[i] - lp) * 0.45;          // top end rolled off
    hp = 0.97 * (hp + lp - prev); prev = lp;  // and the bottom
    out[i] = hp * 0.55 + (rnd() * 2 - 1) * 0.02;
  }
  return out;
}

const library = [
  { name: 'one track in the library', index: buildIndex([fpA]) },
  { name: 'two tracks in the library', index: buildIndex([fpA, fpC]) },
];

const ratio = (m) => (m ? m.score / Math.max(1, m.background) : 0);
const OFFSETS = [8, 17, 25, 33, 41, 49];
/** Six songs the library has never heard. */
const STRANGERS = [77, 404, 909, 1515, 2020, 3131].map(seed => song(seed));

console.log('');
for (const { name, index } of library) {
  console.log(`${name}:`);
  const genuine = OFFSETS.map(at => matchSnippet(snippet(A, at), FP_RATE, index));
  const degraded = OFFSETS.map(at => matchSnippet(throughAMic(snippet(A, at), at), FP_RATE, index));
  const strangers = STRANGERS.map(s2 => matchSnippet(snippet(s2, 25), FP_RATE, index));
  const noise = matchSnippet(Float32Array.from({ length: 4 * FP_RATE }, () => Math.random() * 2 - 1), FP_RATE, index);

  const named = (ms, want) => ms.filter(m => (want ? m && m.isrc === 'TEST-A' : m !== null)).length;
  const ratios = (ms) => ms.filter(Boolean).map(ratio);
  const lo = (a) => (a.length ? Math.min(...a).toFixed(1) : '—');
  const hi = (a) => (a.length ? Math.max(...a).toFixed(1) : '—');
  const offErr = genuine.filter(Boolean).map((m, i) => Math.abs(m.offsetSec - (OFFSETS[i] + 4)));

  console.log(`  clean, six offsets     named ${named(genuine, true)}/6, background ratio ${lo(ratios(genuine))}–${hi(ratios(genuine))}, worst offset error ${offErr.length ? Math.max(...offErr).toFixed(2) : '—'} s`);
  console.log(`  through a microphone   named ${named(degraded, true)}/6, background ratio ${lo(ratios(degraded))}–${hi(ratios(degraded))}`);
  console.log(`  six unheard tracks     named ${named(strangers, false)}/6 (want 0), background ratio ${lo(ratios(strangers))}–${hi(ratios(strangers))}`);
  console.log(`  white noise            ${noise ? `named, ratio ${ratio(noise).toFixed(1)}` : 'no match'}`);

  checks.push([`${name}: names the track it knows, every time`, named(genuine, true) === 6]);
  checks.push([`${name}: and through a microphone`, named(degraded, true) >= 5]);
  checks.push([`${name}: and knows where in it`, offErr.length === 6 && Math.max(...offErr) < 1.0]);
  checks.push([`${name}: says nothing about six tracks it has not heard`, named(strangers, false) === 0]);
  checks.push([`${name}: says nothing about noise`, noise === null]);
}

// ── Taking the tempo from somewhere that knows ──────────────────────
//
// Onset detection is a guess, and there are rooms where the guess is hard.
// A MIDI clock, a tap or a typed number is not a guess, and the thing that
// matters about all three is the *phase*: a clock with the right tempo and
// the wrong bar puts every kick half a beat late, which is worse than not
// being locked at all. So each of these checks where the beats land, not
// just how far apart they are.

console.log('\nTelling the show the tempo rather than making it work it out:\n');
{
  const FRAME = 1000 / 60;

  /** Run the clock for `seconds`, driven by `tempo`, and collect when it fired. */
  const runClock = ({ seconds, tempo, bass = () => 0, feed = () => {}, lead = 0 }) => {
    const clock = new BeatClock();
    const fired = [];
    for (let t = 0; t < seconds * 1000; t += FRAME) {
      feed(t, tempo);
      clock.setExternal(t, tempo ? tempo.read(t) : null);
      const tick = clock.update(t, bass(t), 0, lead);
      if (tick.kick) fired.push(t);
    }
    return { clock, fired };
  };

  /** Intervals between fired beats, ignoring the first (the clock settling). */
  const spacing = (fired) => {
    const ivs = [];
    for (let i = 2; i < fired.length; i++) ivs.push(fired[i] - fired[i - 1]);
    return ivs;
  };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const worst = (a, want) => (a.length ? Math.max(...a.map(v => Math.abs(v - want))) : Infinity);

  // A desk sending clock at 128 bpm: twenty-four pulses a beat, forever.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    const { clock, fired } = runClock({
      seconds: 12,
      tempo,
      feed: (t, tp) => { while (nextPulse <= t) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const ivs = spacing(fired);
    const err = worst(ivs, PERIOD);
    console.log(`  midi clock, 128 bpm      locked ${bpmOf(clock.period).toFixed(1)} bpm, ${fired.length} beats, worst spacing error ${err.toFixed(1)} ms`);
    // One frame of slop: the clock can only fire on a frame boundary.
    checks.push(['a MIDI clock sets the tempo', Math.abs(bpmOf(clock.period) - 128) < 0.5]);
    checks.push(['and every beat lands where the clock says', err <= FRAME + 1]);
  }

  // The clock stops. The show must hand back rather than coast on a tempo
  // nobody is playing any more.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    const { clock } = runClock({
      seconds: 10,
      tempo,
      // Pulses for five seconds, then the cable comes out.
      feed: (t, tp) => { while (nextPulse <= t && nextPulse < 5000) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const stillDriven = clock.driven(10000);
    console.log(`  the cable comes out      still driven after five seconds of nothing: ${stillDriven ? 'yes' : 'no'}`);
    checks.push(['a stopped MIDI clock hands back to the microphone', !stillDriven]);
  }

  // Four taps at 100 bpm. The tempo must come out right, and — the part that
  // matters — the beats must land on the taps, not somewhere between them.
  {
    const PERIOD = 600;                       // 100 bpm
    const tempo = new TempoSource();
    const taps = [2000, 2600, 3200, 3800];
    let next = 0;
    const { clock, fired } = runClock({
      seconds: 12,
      tempo,
      feed: (t, tp) => { while (next < taps.length && taps[next] <= t) tp.tap(taps[next++]); },
    });
    const after = fired.filter(t => t > 4200);
    // How far each fired beat is from the grid the taps set up.
    const offGrid = after.map(t => {
      const k = Math.round((t - taps[3]) / PERIOD);
      return Math.abs(t - (taps[3] + k * PERIOD));
    });
    const phaseErr = offGrid.length ? Math.max(...offGrid) : Infinity;
    console.log(`  four taps, 100 bpm       ${bpmOf(clock.period).toFixed(1)} bpm, ${after.length} beats, worst distance off the tapped grid ${phaseErr.toFixed(1)} ms`);
    checks.push(['four taps set the tempo', Math.abs(bpmOf(clock.period) - 100) < 1]);
    checks.push(['and the bar lands on the hand that tapped it', phaseErr <= FRAME + 1]);
  }

  // A typed number: the tempo, and nothing said about the bar.
  {
    const tempo = new TempoSource();
    tempo.setBpm(140);
    const { clock, fired } = runClock({ seconds: 10, tempo });
    const err = worst(spacing(fired), 60000 / 140);
    console.log(`  a typed 140 bpm          ${bpmOf(clock.period).toFixed(1)} bpm, worst spacing error ${err.toFixed(1)} ms`);
    checks.push(['a typed tempo drives the clock', Math.abs(bpmOf(clock.period) - 140) < 0.5 && err <= FRAME + 1]);
  }

  // A loud room, off the grid. This is the whole reason to plug a clock in:
  // onsets that disagree with the desk must not drag the tempo around.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    // Bass that peaks on a *different* tempo entirely — a crowd, a monitor,
    // the previous song bleeding through the wall.
    const bass = (t) => (Math.sin((t / 1000) * 2 * Math.PI * 1.7) > 0.9 ? 1 : 0);
    const { clock } = runClock({
      seconds: 20,
      tempo,
      bass,
      feed: (t, tp) => { while (nextPulse <= t) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const drift = Math.abs(bpmOf(clock.period) - 128);
    console.log(`  clock against a loud room ${bpmOf(clock.period).toFixed(1)} bpm after twenty seconds of onsets at 102 bpm (drift ${drift.toFixed(2)})`);
    checks.push(['onsets cannot drag a clocked tempo off the desk\'s', drift < 0.5]);
  }
}

console.log('');
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}`);
}

process.exit(failed === 0 ? 0 : 1);
