#!/usr/bin/env node
/**
 * Does the show know which song is playing, and keep time with it?
 *
 *   npm run music
 *
 * The local matcher naming songs it has heard before (and never naming one it
 * has not), the beat clock against a typed tempo and a loud room, and On a New
 * Song's default. Where one song ends and the next begins is `npm run songends`,
 * on recordings of real songs.
 */

import { extractPeakHashes, buildIndex, addToIndex, forEachEntry, matchSnippet, FP_RATE } from '../src/lib/localFingerprint.ts';
import { TempoSource, bpmOf } from '../src/lib/tempo.ts';
import { BeatClock, LevelOnsets } from '../src/lib/beatClock.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

let failed = 0;
const checks = [];

/*
  The gap between songs used to be measured here, on level traces made up for
  it: a CD's two seconds, a streaming service's one, a crossfade's none. It is
  measured now on recordings of real songs joined the ways players join them,
  in a quiet room and a noisy one, with whole songs that must not trigger
  (`npm run songends`, PLAN 14z): made-up traces had no song ending in its own
  decay, no last chord after a stop and no soft intro, which is where the old
  rule went wrong.
*/


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

// ── The index a song at a time ──────────────────────────────────────
//
// In the app the index is built once, at load, and then each newly mapped
// song is added to it on its own — segments merging as they go — rather than
// the whole library being rebuilt. That only works if the index it ends up
// as answers every question exactly as a fresh build of the same library
// would: the same entries under every hash, and the same verdict (track,
// offset, score, background) on every snippet.
{
  const all = [fpA, fpC, ...STRANGERS.map((pcm, i) => fingerprint(`TEST-S${i}`, pcm))];
  const full = buildIndex(all);
  const grown = buildIndex(all.slice(0, 1));
  for (const rec of all.slice(1)) addToIndex(grown, rec);

  const entriesOf = (index, h) => {
    const out = [];
    forEachEntry(index, h, (t, f) => out.push(`${t}:${f}`));
    return out.sort().join(',');
  };
  let hashesSame = true, checked = 0;
  for (const rec of all) {
    for (const h of rec.hashes) { checked++; if (entriesOf(full, h) !== entriesOf(grown, h)) hashesSame = false; }
  }
  const questions = [...all.map((_, i) => (i < 2 ? [A, C][i] : STRANGERS[i - 2])), song(4242)]
    .flatMap(pcm => [5, 20, 38].map(at => snippet(pcm, at)));
  const answers = (index) => JSON.stringify(questions.map(q => matchSnippet(q, FP_RATE, index)));
  const verdictsSame = answers(full) === answers(grown);
  const refused = !addToIndex(grown, fpC);

  console.log(`\nThe index grown a song at a time: ${all.length} tracks in ${grown.segments.length} segment(s), ${checked} hash lookups, ${questions.length} snippets`);
  checks.push(['an index grown a song at a time holds what a full build holds', hashesSame && grown.trackCount === full.trackCount]);
  checks.push(['and names every snippet the same way', verdictsSame]);
  checks.push(['and will not index a track twice', refused && grown.trackCount === all.length]);
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
    // A synthetic bass level, heard where it crosses the clock's old line.
    const level = new LevelOnsets();
    const fired = [];
    for (let t = 0; t < seconds * 1000; t += FRAME) {
      feed(t, tempo);
      clock.setExternal(t, tempo ? tempo.read(t) : null);
      const tick = clock.update(t, level.at(t, bass(t)), 0, lead);
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

  // A control that fires twice.
  //
  // A pad that double-sends, or a button bound on the controller *and* under a
  // finger on the screen, puts two taps in the same millisecond. That used to
  // average to a zero interval, and folding zero into the tempo range doubles
  // it for ever: the tab hung. It also must not quietly poison a real tapped
  // tempo with a 1500 bpm interval.
  {
    const t = new TempoSource();
    t.tap(1000); t.tap(1000); t.tap(1000);
    const survived = t.active === null || t.bpm > 0;
    console.log(`  three taps in one instant  ${t.active ?? 'nothing'}${t.bpm ? ` at ${t.bpm.toFixed(1)} bpm` : ''}`);
    checks.push(['taps in the same instant do not hang the show', survived]);

    const u = new TempoSource();
    // 100 bpm, with the second press arriving twice.
    for (const at of [0, 10, 600, 1200, 1800]) u.tap(at);
    console.log(`  a tap that double-fired    ${u.bpm.toFixed(1)} bpm`);
    checks.push(['and a double-fired tap does not poison the tempo', Math.abs(u.bpm - 100) < 1]);
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

/*
  Until the boundary is trusted on recorded sets (PLAN 14z), nobody gets a look
  changed by it without asking: it misses crossfades and gapless sets and can
  fire on a quiet bridge, and a look that changes at the wrong moment is worse
  on a wall than one that holds. This reads the shipped default, not a copy.
*/
checks.push(['a new song keeps the look unless someone asks for more (On a New Song opens on Keep)', DEFAULT_SETTINGS.onNewSong === 'off']);

console.log('');
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}`);
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
