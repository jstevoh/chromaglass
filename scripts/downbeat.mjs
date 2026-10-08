#!/usr/bin/env node
/**
 * Does the show know which beat is the one?
 *
 *   npm run downbeat
 *
 * PLAN §10, step 3: a projectionist squeezes on the downbeat, not on every
 * kick. `src/lib/barGrid.ts` listens to the analyser's readings for the
 * beats and for the bar, and `Accent` turns a kick into a weight by its place
 * in the bar. This drives both exactly as the render loop does, a reading a
 * frame at 60 fps (and once at 30, a render's rate), with songs synthesised
 * by `scripts/arrangement.mjs`, whose beats and bars are known to the sample,
 * and asserts the feature, not a moment of it:
 *
 *   - through the groove (verse, chorus, drop), from eight seconds into the
 *     section (the beat window: before it the grid is listening to what came
 *     before), the latest beat the grid names is a real beat within 70 ms,
 *     at the song's tempo within 2 %, on 95 % of its ticks or more;
 *   - at every kick of that groove, as the plate would ask at the moment it
 *     reacts: a beat that is not the one is called the one 3 % of the time
 *     or less (0 measured: a wrong accent is worse than none); the one is
 *     called the one on ONE_KNOWN of its kicks or more (four on the floor
 *     40 %, rock 65 %, all together 70 %; measured 49 to 88 %, 75 to 100 %
 *     and 78 %), and where it is not, the half bar carries it: the one's
 *     kick never weighs under 1, and the backbeat and the "and" weigh under 1;
 *   - every kick weighs exactly what the place it was heard at says (the
 *     one 1.25, three 0.4, the one after a fill 1.5, a strong beat 1, the
 *     rest 0, 1 while unsure), the one outweighs three, and `accentGain`
 *     gives its documented table;
 *   - the grid is unsure (every kick weighs 1) through a pad with a hat on
 *     each beat, and through loops at 118, 126 and 132 bpm with no bar
 *     anywhere in them: no chord change, no snare, no pickup. Each on a beat
 *     the grid does hear, at its tempo. Nothing to hear the one by, so
 *     nothing may be claimed;
 *   - after a fill (the kick out for two beats under a snare run), the one
 *     it lands on weighs 1.5 on 80 % of fills or more (every one of 32
 *     measured), club and rock alike; and no other kick
 *     weighs over the one's 1.25;
 *   - with the accent at 0, every kick of every song weighs 1, exactly: the
 *     show as it was, asked of the kicks the accent at 1 moves;
 *   - the same song 20 dB quieter, at 30 fps, on a clock that starts at an
 *     hour and a bit (the page's clock, not the song's), is called the same;
 *   - two songs at different tempos with a gap between: the second's one is
 *     found by bar 16 of its groove and held from then;
 *   - an estimate costs under a millisecond at its median and under four at
 *     its 99th percentile (it runs four times a second on the render loop's
 *     thread);
 *   - no period named, on any song, loop or fuzzed stream of onsets, is
 *     outside the tempos searched, and no estimate fails to return;
 *   - the phone's line names each state of the grid, and the plate feeds
 *     the grid and weighs each kick's squeeze and rock by it (greps).
 *
 * The songs are four on the floor at 90, 128 and 140 bpm and a rock beat at
 * 96, 110 and 132, a chord a bar, and one of each style with a chord every
 * two bars (half the bar lines then have no harmony moving on them). All
 * synthesised: no song on the shelf has a beat, so no recorded song has been
 * asked. That is the step's open question (PLAN §10).
 */

import { analysePcm } from '../src/lib/audioFeatures.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BarGrid, Accent, accentGain, barLine, OFF_THE_BEAT, STRONG_BEAT, WEAK_BEAT } from '../src/lib/barGrid.ts';
import { arrange, rng, SR } from './arrangement.mjs';
import { kickRock } from '../src/lib/plateRock.ts';
import { kickDepth } from '../src/lib/squish.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const pc = (a, b) => (b > 0 ? `${((100 * a) / b).toFixed(0)} %` : 'n/a');

/*
  The club songs' grooves are sixteen bars. They were eight, and two things
  followed that the check did not say. A club fill is on the last bar of
  every eight (`arrangement.mjs`), so on eight-bar sections every club fill
  was its section's last bar and the one it lands on was a build's first
  beat, where there is no kick: never asked. All twenty fills the check
  weighed were rock fills. And eight bars less the eight seconds the beat
  window needs left three to five of each section's ones settled: club 128
  and club 140 asked the one of nine kicks, and held "a quarter known" by a
  single kick. At sixteen bars a club fill also lands on bar 8, mid-groove,
  and each club song asks its one thirty times or more.
*/
const CLUB = [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 16 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 16 }, { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 16 }, { kind: 'outro', bars: 4 }];
const BAND = [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 16 }, { kind: 'chorus', bars: 8 }, { kind: 'verse', bars: 8 }, { kind: 'breakdown', bars: 4 }, { kind: 'chorus', bars: 8 }, { kind: 'outro', bars: 4 }];
const GROOVE = new Set(['verse', 'chorus', 'drop']);
const SETTLE = 8;       // seconds into a groove section before it is asked (the beat window)
const TOL = 0.07;       // a beat named within 70 ms of a real one
const PERIOD_TOL = 0.02; // and a period within 2 % of the song's beat
/*
  The periods the grid may name at all: the lags it searches, 33 to 86 bins
  at 100 a second (70 to 180 bpm, `barGrid.ts`), each refined by at most
  half a bin either way. Written here as numbers, not read from the module,
  so a module whose range moves goes red here and someone has to say why.
  The refinement was once unbounded (a parabola fitted on a flank): the grid
  named 393 bpm in a song at 128, and a lag at or under zero, reached by a
  fuzzed stream, hung the beat walk.
*/
const PERIOD_MIN = 0.325, PERIOD_MAX = 0.865;
/*
  How much of the groove the one must be known for. Measured when the loops
  lost their bass pickup and the sure mark came down from 2.6 to 2.2
  (barGrid.ts, BAR_SURE_ON), on club sections of sixteen bars: the rock
  songs 75 to 100 %, four on the floor 49 to 88 % (the half bar the rest of
  the time, which is what BACKBEAT_DOWN asks of them), all together 78 %.
  It was held at 55, 25 and 50 %, over 63 to 100, 33 to 44 and 61 %
  measured then, with club songs asking nine ones. Held a little under, so
  a check that goes red means the grid got worse, not that a song's last
  bar fell the other side of a tick. What never gives: no other kick taken
  for the one (3 % at most; 0 measured), and the one's own kick never
  weighed down.
*/
const BACKBEAT_DOWN = 0.8;
const ONE_KNOWN = { band: 0.65, club: 0.4, all: 0.7 };
/*
  What each kick must weigh with the accent at 1, by the place the grid
  heard it at: the one lifted by a quarter, three felt at 0.4, the one after
  a fill at 1.5, the other beats and the "and" let go, a strong beat of a
  half bar kept at 1, and 1 where the grid is unsure. Written here as numbers,
  as PLAN §10 step 3 states them, and not asked of `accentGain`: the fill
  check used to measure against `accentGain(0, 1)`, so its yardstick moved
  with the weight it measured, and with the one at 1 or three at 1.25 every
  check stayed green.
*/
const WEIGHT = { one: 1.25, three: 0.4, afterFill: 1.5, strong: 1, unsure: 1, letGo: 0 };
const weightOf = (heard) => (heard === null ? WEIGHT.unsure : heard === 0 ? WEIGHT.one : heard === 2 ? WEIGHT.three : heard === STRONG_BEAT ? WEIGHT.strong : WEIGHT.letGo);
const same = (a, b) => Math.abs(a - b) < 1e-9;

const SONGS = [
  { name: 'club 128', style: 'club', bpm: 128, seed: 1 },
  { name: 'club 90', style: 'club', bpm: 90, seed: 2 },
  { name: 'band 110', style: 'band', bpm: 110, seed: 5 },
  { name: 'band 96', style: 'band', bpm: 96, seed: 6 },
  { name: 'band 132', style: 'band', bpm: 132, seed: 7 },
  { name: 'club 124, a chord every two bars', style: 'club', bpm: 124, seed: 8, chordBars: 2 },
  { name: 'band 104, a chord every two bars', style: 'band', bpm: 104, seed: 9, chordBars: 2 },
];

/*
  Every period the grid names, anywhere in this check: each song, loop and
  fuzzed stream folds its periods in, and the last section asks that all of
  them were in the range above.
*/
const named = { lo: Infinity, hi: -Infinity, n: 0, out: 0 };
const nameOf = (period) => {
  if (period === 0) return;  // no tempo: the grid names none
  named.n++;
  named.lo = Math.min(named.lo, period);
  named.hi = Math.max(named.hi, period);
  if (!(period >= PERIOD_MIN - 1e-9 && period <= PERIOD_MAX + 1e-9)) named.out++;
};

/*
  Streams of onsets no song makes, for the grid's arithmetic rather than its
  ear: a click at tempos outside the range searched (so the weighted best
  sits at its edge, on the flank of a peak outside it), a sweep through and
  past the range, a glide between two tempos with every second or third beat
  late (the stream that found the unbounded lag: thousands of bins, and at or
  under zero, where the beat walk never ended), onsets at random, every frame
  random, a lone click every five seconds, silence. Each thirty seconds at 60
  frames a second. Run in a child process with a deadline (below), because a
  grid that hangs would hang this check with it and never print a FAIL.
*/
function fuzzStreams() {
  const streams = [];
  const clicks = (period, jitter = 0, seed = 1) => { const r = rng(seed); const out = []; for (let t = 0.3; t < 30; t += period) out.push(t + jitter * (r() - 0.5)); return out; };
  for (const bpm of [30, 40, 50, 60, 66, 68, 69, 186, 188, 190, 192, 195, 200, 220, 240, 300, 400, 600]) streams.push({ name: `clicks at ${bpm}`, onsets: clicks(60 / bpm), steady: true });
  for (let bpm = 176; bpm <= 200; bpm += 0.5) streams.push({ name: `clicks at ${bpm}, jittered`, onsets: clicks(60 / bpm, 0.01, bpm * 2), steady: true });
  for (let bpm = 64; bpm <= 74; bpm += 0.25) streams.push({ name: `clicks at ${bpm}, jittered`, onsets: clicks(60 / bpm, 0.01, bpm * 4), steady: true });
  for (const [a, b] of [[50, 250], [250, 50], [150, 200], [80, 60]]) {
    const out = []; for (let t = 0.3; t < 30;) { out.push(t); t += 60 / (a + (b - a) * t / 30); }
    streams.push({ name: `a sweep from ${a} to ${b} bpm`, onsets: out });
  }
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed * 7919);
    const pA = 0.33 + 0.17 * r(), pB = 0.33 + 0.17 * r(), sub = r() < 0.5 ? 2 : 3, subW = r();
    const out = []; let k = 0;
    for (let t = 0; t < 30;) { out.push(t); k++; t += ((k % sub === 0 ? 1 + subW : 1) * (pA + (pB - pA) * t / 30)) / (1 + subW / sub); }
    streams.push({ name: `a glide, seed ${seed}`, onsets: out });
  }
  for (let seed = 1; seed <= 12; seed++) {
    const r = rng(seed * 104729), rate = 1 + 7 * r();
    const out = []; for (let t = 0; t < 30;) { t += -Math.log(1 - r()) / rate; out.push(t); }
    streams.push({ name: `onsets at random, ${rate.toFixed(1)} a second`, onsets: out });
  }
  for (let seed = 1; seed <= 4; seed++) streams.push({ name: `every frame random, seed ${seed}`, noise: seed });
  streams.push({ name: 'a lone click every five seconds', onsets: [0.5, 5.5, 10.5, 15.5, 20.5, 25.5] });
  streams.push({ name: 'silence', onsets: [] });
  return streams;
}
const BEAT_WINDOW_S = 8;  // the grid's beat window (barGrid.ts, BEAT_WINDOW): a tempo is owed from then
function fuzz() {
  let lo = Infinity, hi = -Infinity, n = 0, out = 0, estimates = 0, threw = 0, worst = '', steady = 0, tempoless = 0, lost = '';
  for (const s of fuzzStreams()) {
    const grid = new BarGrid();
    const r = rng(s.noise ?? 3);
    let k = 0;
    try {
      for (let f = 0; f < 30 * 60; f++) {
        const t = f / 60;
        const db = new Array(13).fill(-80);
        if (s.noise) for (let i = 0; i < 13; i++) db[i] = -80 + 60 * r();
        else if (k < s.onsets.length && s.onsets[k] <= t) { while (k < s.onsets.length && s.onsets[k] <= t) k++; for (let i = 0; i < 13; i++) db[i] = -20 - 6 * r(); }
        const before = grid.estimates;
        grid.update({ time: t, db, snare: s.noise ? r() : 0 }, t);
        // A steady click, once the window is full, always has a tempo named:
        // the nearest the range holds. Giving up (the lock on the lag's
        // range, barGrid.ts) is safe but wrong, and is what the refinement
        // as it was did at the edges of the range.
        if (s.steady && t >= BEAT_WINDOW_S + 1 && grid.estimates > before) {
          steady++;
          if (!(grid.now.period > 0)) { tempoless++; lost ||= s.name; }
        }
        // Zero is "no tempo"; anything else, a number or not, is a period named.
        const p = grid.now.period;
        if (p !== 0) {
          n++; lo = Math.min(lo, p); hi = Math.max(hi, p);
          if (!(p >= PERIOD_MIN - 1e-9 && p <= PERIOD_MAX + 1e-9)) { out++; if (!worst) worst = `${s.name}: a period of ${p.toFixed(3)} s`; }
        }
      }
    } catch (e) { threw++; worst ||= `${s.name}: ${e.message}`; }
    estimates += grid.estimates;
  }
  return { streams: fuzzStreams().length, lo, hi, n, out, estimates, threw, worst, steady, tempoless, lost };
}
if (process.argv[2] === '--fuzz') {
  console.log(JSON.stringify(fuzz()));
  process.exit(0);
}

/**
 * Where the kicks are, from the truth: the arrangement's own rule (every beat
 * of the groove in `club`, the one, three and the "and" of three in `band`,
 * none over a fill's last two beats). Each with its place in the bar, the
 * "and" as OFF_THE_BEAT, and whether it is the one after a fill.
 */
function kicksOf(truth, style) {
  const kicks = [];
  const inFill = (t) => truth.fills.some(f => t >= f - 0.01 && t < f + 2 * truth.beat - 0.01);
  const fillEnds = new Set(truth.fills.map(f => Math.round((f + 2 * truth.beat) * 1000)));
  truth.beats.forEach((t, i) => {
    const sec = truth.sections.find(s => t >= s.start && t < s.end);
    if (!sec || !GROOVE.has(sec.kind) || inFill(t)) return;
    const q = truth.beatInBar[i];
    const settled = t >= sec.start + SETTLE;
    const afterFill = fillEnds.has(Math.round(t * 1000));
    if (style !== 'band' || q === 0 || q === 2) kicks.push({ t, place: q, settled, afterFill, style });
    if (style === 'band' && q === 2) kicks.push({ t: t + truth.beat / 2, place: OFF_THE_BEAT, settled, afterFill: false, style });
  });
  return kicks;
}

/**
 * The render loop, reduced to what the grid sees: a reading a frame, and at
 * each kick the plate reacts to, the accent asked at that moment. `offset`
 * moves the whole song along the clock (the page's seconds).
 */
function listen(readings, kicks, { amount = 1, offset = 0 } = {}) {
  const grid = new BarGrid();
  const accent = new Accent();
  const ticks = [];
  const heard = [];
  const estimateMs = [];
  const states = [];
  let k = 0, lastBeatAt = null;
  for (const r of readings) {
    const t = r.time + offset;
    const before = grid.estimates;
    const t0 = performance.now();
    grid.update(r, t);
    const ms = performance.now() - t0;
    // Each estimate timed on its own: the frame that made one. Timing every
    // frame and dividing by four a second hid a spike of three milliseconds
    // in an average of half of one.
    const n = grid.now;
    if (grid.estimates > before) {
      estimateMs.push(ms);
      states.push({ t: t - offset, period: n.period, beatAt: n.beatAt === null ? null : n.beatAt - offset, place: n.place, half: n.half });
    }
    nameOf(n.period);
    // A tick is when the grid names a new latest beat.
    if (n.beatAt !== null && n.beatAt !== lastBeatAt) ticks.push({ t: t - offset, beatAt: n.beatAt - offset, period: n.period, place: n.place });
    lastBeatAt = n.beatAt;
    while (k < kicks.length && kicks[k].t + offset <= t) {
      const kk = kicks[k++];
      const place = grid.placeAt(kk.t + offset);
      heard.push({ ...kk, heard: place, gain: accent.kick(grid, kk.t + offset, amount) });
    }
  }
  return { ticks, heard, estimateMs, states };
}

/** Whether a tick's latest beat is a real one, within TOL, at the song's period within PERIOD_TOL. */
const onTheBeat = (truth, x) => truth.beats.some(b => Math.abs(b - x.beatAt) < TOL);
const atThePeriod = (truth, x) => Math.abs(x.period - truth.beat) <= PERIOD_TOL * truth.beat;

function score(truth, { ticks, heard, states }) {
  const inGroove = (t) => truth.sections.some(s => GROOVE.has(s.kind) && t >= s.start + SETTLE && t < s.end);
  const beats = ticks.filter(x => inGroove(x.t));
  const estimates = states.filter(x => inGroove(x.t));
  const onBeat = beats.filter(x => onTheBeat(truth, x)).length;
  const settled = heard.filter(h => h.settled);
  const plain = settled.filter(h => !h.afterFill);
  const ones = settled.filter(h => h.place === 0);
  const others = settled.filter(h => h.place !== 0);
  const backbeat = settled.filter(h => h.place === 1 || h.place === 3);
  const ands = settled.filter(h => h.place === OFF_THE_BEAT);
  return {
    beats: beats.length, onBeat,
    periodOk: beats.filter(x => atThePeriod(truth, x)).length,
    worstPeriod: beats.reduce((w, x) => Math.max(w, Math.abs(x.period - truth.beat) / truth.beat), 0),
    // Estimates in the settled groove that named no tempo at all. A tick is
    // a new beat named, so an estimate that gave up (the grid's lock on the
    // lag's range, barGrid.ts) makes no tick and was not seen by the two
    // checks above: with the lag's refinement unbounded again and the lock
    // on, every check was green.
    tempoless: estimates.filter(x => !(x.period > 0)).length, estimates: estimates.length,
    ones: ones.length,
    onesKnown: ones.filter(h => h.heard === 0).length,
    onesKept: ones.filter(h => h.gain >= 1).length,
    others: others.length, falseOnes: others.filter(h => h.heard === 0).length,
    // The kicks that are not the one and that the grid did place: "none
    // taken for the one" of kicks it never placed is true of a grid that
    // knows nothing (measured: with place and half always null, every such
    // check stayed green).
    othersPlaced: others.filter(h => h.heard !== null).length,
    backbeat: backbeat.length, backbeatDown: backbeat.filter(h => h.gain < 1).length,
    ands: ands.length, andsDown: ands.filter(h => h.gain < 1).length,
    fills: settled.filter(h => h.afterFill),
    // Every kick not after a fill weighs what its heard place says, exactly.
    plain: plain.length,
    misweighed: plain.filter(h => !same(h.gain, weightOf(h.heard))),
    heardOne: plain.filter(h => h.heard === 0).map(h => h.gain),
    heardThree: plain.filter(h => h.heard === 2).map(h => h.gain),
    notFillUp: plain.filter(h => h.gain > WEIGHT.one + 1e-9).length,
  };
}

console.log('The beats and the one, on songs whose bars are known\n');
const total = { beats: 0, onBeat: 0, periodOk: 0, ones: 0, onesKnown: 0, onesKept: 0, others: 0, othersPlaced: 0, falseOnes: 0, backbeat: 0, backbeatDown: 0, ands: 0, andsDown: 0, plain: 0 };
const fills = [];
const heardOne = [], heardThree = [];
let notFillUp = 0;
const kept = {};
for (const s of SONGS) {
  const song = arrange({ bpm: s.bpm, sections: s.style === 'club' ? CLUB : BAND, style: s.style, seed: s.seed, chordBars: s.chordBars ?? 1 });
  const readings = analysePcm(song.pcm, SR, 60);
  const kicks = kicksOf(song.truth, s.style);
  const run = listen(readings, kicks);
  const sc = score(song.truth, run);
  kept[s.name] = { song, readings, kicks, run };
  for (const k of Object.keys(total)) total[k] += sc[k];
  fills.push(...sc.fills);
  heardOne.push(...sc.heardOne);
  heardThree.push(...sc.heardThree);
  notFillUp += sc.notFillUp;
  console.log(`  ${s.name.padEnd(34)} beats ${pc(sc.onBeat, sc.beats).padStart(5)}   the one known ${pc(sc.onesKnown, sc.ones).padStart(5)} of ${String(sc.ones).padStart(3)}, kept ${pc(sc.onesKept, sc.ones).padStart(5)}   others called the one ${sc.falseOnes} of ${sc.others}   two and four softened ${pc(sc.backbeatDown, sc.backbeat)}`);
  check(`${s.name}: the latest beat named is a real one, within 70 ms`, sc.beats >= 20 && sc.onBeat >= 0.95 * sc.beats, `${sc.onBeat} of ${sc.beats} ticks`);
  // The beat within 70 ms is not the tempo: a grid at half the tempo names
  // every other beat, each a real one, and was green on every song at 100 %.
  check(`${s.name}: at the song's tempo, within 2 %, and never without one`, sc.beats >= 20 && sc.periodOk >= 0.95 * sc.beats && sc.estimates >= 100 && sc.tempoless === 0,
    `${sc.periodOk} of ${sc.beats} ticks (worst ${(100 * sc.worstPeriod).toFixed(1)} % off); no tempo on ${sc.tempoless} of ${sc.estimates} estimates`);
  check(`${s.name}: no kick but the one is called the one`, sc.others >= 24 && sc.othersPlaced >= 12 && sc.falseOnes <= 0.03 * sc.others, `${sc.falseOnes} of ${sc.others}, ${sc.othersPlaced} of them placed`);
  check(`${s.name}: the one's kick never weighs under 1`, sc.ones >= 8 && sc.onesKept >= 0.97 * sc.ones, `${sc.onesKept} of ${sc.ones}`);
  if (s.style === 'club') check(`${s.name}: two and four weigh under 1`, sc.backbeat >= 16 && sc.backbeatDown >= BACKBEAT_DOWN * sc.backbeat, `${pc(sc.backbeatDown, sc.backbeat)} of ${sc.backbeat}, held to ${pc(BACKBEAT_DOWN, 1)}`);
  check(`${s.name}: the one is known`, sc.ones >= 20 && sc.onesKnown >= ONE_KNOWN[s.style] * sc.ones, `${pc(sc.onesKnown, sc.ones)} of ${sc.ones}, held to ${pc(ONE_KNOWN[s.style], 1)}`);
  check(`${s.name}: every kick weighs what its place says`, sc.plain >= 40 && sc.misweighed.length === 0,
    sc.misweighed.length ? `${sc.misweighed.length} of ${sc.plain}, the first heard at ${sc.misweighed[0].heard} and weighed ${sc.misweighed[0].gain.toFixed(3)}` : `${sc.plain} kicks, ${sc.heardOne.length} at ${WEIGHT.one}, ${sc.heardThree.length} at ${WEIGHT.three}`);
}
console.log('');
/*
  The songs together, each over a floor of its own: a total of nothing asked
  passes "at most 3 %" and "at least half" alike, and a grid that is never
  sure asks nothing. The floors are about half what the eight songs ask.
*/
check('all songs: beats within 70 ms', total.beats >= 600 && total.onBeat >= 0.95 * total.beats, `${pc(total.onBeat, total.beats)} of ${total.beats} ticks, asked of 600 or more`);
check('all songs: at the song\'s tempo', total.beats >= 600 && total.periodOk >= 0.95 * total.beats, `${pc(total.periodOk, total.beats)} of ${total.beats} ticks`);
check('all songs: a kick that is not the one taken for it', total.others >= 250 && total.othersPlaced >= 200 && total.falseOnes <= 0.03 * total.others, `${total.falseOnes} of ${total.others}, ${total.othersPlaced} of them placed, asked of 250 or more and 200 placed`);
check('all songs: the one known at its kick', total.ones >= 100 && total.onesKnown >= ONE_KNOWN.all * total.ones, `${pc(total.onesKnown, total.ones)} of ${total.ones}, held to ${pc(ONE_KNOWN.all, 1)}, asked of 100 or more`);
check('all songs: two and four weigh under 1', total.backbeat >= 100 && total.backbeatDown >= BACKBEAT_DOWN * total.backbeat, `${pc(total.backbeatDown, total.backbeat)} of ${total.backbeat}, asked of 100 or more`);
check('the rock kick\'s "and" of three weighs under 1', total.ands >= 24 && total.andsDown >= BACKBEAT_DOWN * total.ands, `${pc(total.andsDown, total.ands)} of ${total.ands}`);
/*
  The weights themselves. "Every kick weighs what its place says" above
  holds each kick to WEIGHT; this holds the order the accent is for, over
  the kicks the grid actually placed: the least the one ever weighed is over
  the most three ever did, on at least fifty of each.
*/
check('the one outweighs three, on every kick heard at either',
  heardOne.length >= 50 && heardThree.length >= 50 && Math.min(...heardOne) > Math.max(...heardThree),
  `the one ${heardOne.length ? Math.min(...heardOne).toFixed(2) : 'n/a'} at least, on ${heardOne.length}; three ${heardThree.length ? Math.max(...heardThree).toFixed(2) : 'n/a'} at most, on ${heardThree.length}`);
{
  // And the function, place by place, as documented (barGrid.ts, "The accent").
  const table = [
    [0, 1, false, 1.25], [2, 1, false, 0.4], [1, 1, false, 0], [3, 1, false, 0],
    [OFF_THE_BEAT, 1, false, 0], [STRONG_BEAT, 1, false, 1], [WEAK_BEAT, 1, false, 0], [null, 1, false, 1],
    [0, 0.5, false, 1.125], [2, 0.5, false, 0.7], [1, 0.5, false, 0.5], [0, 0, false, 1], [2, 0, false, 1],
    [0, 1, true, 1.5], [STRONG_BEAT, 1, true, 1.5], [2, 1, true, 0.4], [null, 1, true, 1], [0, 2, false, 1.25], [0, -1, false, 1],
  ];
  const wrong = table.filter(([p, a, f, w]) => !same(accentGain(p, a, f), w));
  check('accentGain, place by place and amount by amount, as documented', wrong.length === 0,
    wrong.length ? wrong.map(([p, a, f, w]) => `(${p}, ${a}${f ? ', after a fill' : ''}) is ${accentGain(p, a, f)}, not ${w}`).join('; ') : `${table.length} cases`);
}

console.log('\nAfter a fill');
{
  /*
    Every fill's one that was asked, whatever the grid heard it as: those it
    placed as the one or a strong beat, which weigh WEIGHT.afterFill; and
    those it did not, which are in the count and fail it. The fill's kick
    was counted only when heard as the one or a strong beat, so a fill whose
    one the grid missed vanished from the question. And both styles: on
    eight-bar club sections, every one of the twenty was a rock fill.
  */
  const up = fills.filter(h => same(h.gain, WEIGHT.afterFill)).length;
  const placed = fills.filter(h => h.heard === 0 || h.heard === STRONG_BEAT).length;
  const club = fills.filter(h => h.style === 'club').length, band = fills.filter(h => h.style === 'band').length;
  check(`the one a fill lands on weighs ${WEIGHT.afterFill}, over the ordinary one's ${WEIGHT.one}, on 80 % of fills or more`,
    club >= 8 && band >= 8 && up >= 0.8 * fills.length,
    `${up} of ${fills.length} fills (${club} club, ${band} rock); ${placed} heard as the one or a strong beat, ${fills.filter(h => h.heard === null).length} while unsure, ${fills.length - placed - fills.filter(h => h.heard === null).length} elsewhere`);
  check(`no kick but the one after a fill weighs over ${WEIGHT.one}`, total.plain >= 500 && notFillUp === 0, `${notFillUp} of ${total.plain}`);
}

console.log('\nNothing to hear the one by');
/*
  A pulse, and loops at three tempos, where no one could say which beat is
  the one: the grid must say nothing, on a beat it does hear. Each asked
  first whether its beat is heard at all, at the right tempo: "names no
  place" on a grid that has lost the beat is no measure of the bar. The
  loops were one at 126, and it had a bar cue (the bass's octave pickup on
  the "and" of four), which the grid's sure mark had been set over.
*/
for (const { name, song, from } of [
  // A pad on one chord and a quiet hat on each beat: a pulse, no kick, no bar.
  { name: 'a pulse with no kick', song: arrange({ bpm: 120, sections: [{ kind: 'breakdown', bars: 32 }], style: 'club', seed: 11, chordBars: 1000 }), from: 16 },
  // Four on the floor, hats, a bass on one note, no backbeat, no fills, no
  // pickup, no chord change: a beat anyone can dance to and no one can count.
  { name: 'a loop with no bar at 126', song: arrange({ bpm: 126, sections: [{ kind: 'verse', bars: 48 }], style: 'loop', seed: 12, chordBars: 1000 }), from: 16 },
  { name: 'a loop with no bar at 118', song: arrange({ bpm: 118, sections: [{ kind: 'verse', bars: 48 }], style: 'loop', seed: 13, chordBars: 1000 }), from: 16 },
  { name: 'a loop with no bar at 132', song: arrange({ bpm: 132, sections: [{ kind: 'verse', bars: 48 }], style: 'loop', seed: 14, chordBars: 1000 }), from: 16 },
]) {
  const readings = analysePcm(song.pcm, SR, 60);
  const kicks = song.truth.beats.filter(t => t > from).map(t => ({ t, place: 0, settled: true, afterFill: false }));
  const run = listen(readings, kicks);
  const asked = run.ticks.filter(x => x.t > from);
  const beatHeard = asked.filter(x => onTheBeat(song.truth, x) && atThePeriod(song.truth, x)).length;
  const sure = asked.filter(x => x.place !== null).length;
  const moved = run.heard.filter(h => h.gain !== 1).length;
  check(`${name}: its beat is heard, at its tempo`, asked.length >= 40 && beatHeard >= 0.9 * asked.length, `${beatHeard} of ${asked.length} ticks`);
  check(`${name}: the grid names no place in the bar`, asked.length >= 40 && sure <= 0.05 * asked.length, `sure on ${sure} of ${asked.length} ticks`);
  check(`${name}: and every kick weighs 1`, run.heard.length >= 40 && moved <= 0.05 * run.heard.length, `${moved} of ${run.heard.length} weighed otherwise`);
}

console.log('\nThe accent at 0');
{
  /*
    Asked of the kicks the accent at 1 moved: "every kick weighs 1" is also
    what a grid that is never sure gives, so the question is only asked where
    there was something to leave alone.
  */
  let n = 0, movedAtOne = 0, off = 0;
  for (const name of Object.keys(kept)) {
    const { readings, kicks, run: atOne } = kept[name];
    const run = listen(readings, kicks, { amount: 0 });
    n += run.heard.length;
    off += run.heard.filter(h => h.gain !== 1).length;
    // The same kicks, in the same order, as the run at 1 heard them.
    movedAtOne += run.heard.filter((h, i) => h.t === atOne.heard[i]?.t && atOne.heard[i].gain !== 1).length;
  }
  check('every kick of every song weighs exactly 1: the show as it was', movedAtOne >= 300 && off === 0, `${off} of ${n}, of which the accent at 1 moved ${movedAtOne}`);
}

console.log('\nQuieter, slower, on the page\'s clock');
{
  /*
    Each asked on a song whose one is known on ten kicks or more: "known as
    long" and "placed alike" are also true of two grids that know nothing.
  */
  const s = SONGS[3];
  const { run: base } = kept[s.name];
  const quiet = arrange({ bpm: s.bpm, sections: BAND, style: s.style, seed: s.seed, gainDb: -20 });
  const kicks = kicksOf(quiet.truth, s.style);
  const sameAs = (other) => {
    const a = base.heard.filter(h => h.settled), b = other.heard.filter(h => h.settled);
    return a.length === b.length && a.length > 0 ? a.filter((h, i) => h.heard === b[i].heard).length / a.length : 0;
  };
  const bs = score(kept[s.name].song.truth, base);
  const q = listen(analysePcm(quiet.pcm, SR, 60), kicks);
  const qs = score(quiet.truth, q);
  check('20 dB down: the one known as long, none taken wrongly, the kicks placed alike', bs.onesKnown >= 10 && qs.onesKnown >= bs.onesKnown - 2 && qs.falseOnes <= 0.03 * qs.others && sameAs(q) >= 0.95, `${qs.onesKnown} of ${qs.ones} known (${bs.onesKnown} at full level), ${qs.falseOnes} wrong, ${(100 * sameAs(q)).toFixed(0)} % placed alike`);
  const r30 = listen(analysePcm(kept[s.name].song.pcm, SR, 30), kept[s.name].kicks);
  const s30 = score(kept[s.name].song.truth, r30);
  check('at 30 fps: the beats, and the one known as long, none taken wrongly', s30.beats >= 20 && bs.onesKnown >= 10 && s30.onBeat >= 0.95 * s30.beats && s30.periodOk >= 0.95 * s30.beats && s30.onesKnown >= bs.onesKnown - 2 && s30.falseOnes <= 0.03 * s30.others, `beats ${pc(s30.onBeat, s30.beats)}, at the tempo ${pc(s30.periodOk, s30.beats)}, the one ${s30.onesKnown} of ${s30.ones} (${bs.onesKnown} at 60), ${s30.falseOnes} wrong`);
  /*
    On the page's clock, every estimate the same as on the song's: the same
    frames, the same period, the same beat to a microsecond, the same place
    and half bar. It asked only that the kicks were placed alike, and they
    were, at the sure mark of the day; at 2.0 and 2.4 they were not (93 and
    98 %), because the bins a frame fell in moved with the clock's rounding
    (barGrid.ts, the bins): measured without the mend, one estimate's period
    0.33 s and its beat 0.71 s from the song clock's, and four placed
    differently.
  */
  const late = listen(kept[s.name].readings, kept[s.name].kicks, { offset: 4321.37 });
  const ls = score(kept[s.name].song.truth, late);
  const a0 = base.states, a1 = late.states;
  const differ = a0.filter((x, i) => {
    const y = a1[i];
    return !y || x.t !== y.t || Math.abs(x.period - y.period) > 1e-9 || (x.beatAt === null) !== (y.beatAt === null)
      || (x.beatAt !== null && Math.abs(x.beatAt - y.beatAt) > 1e-6) || x.place !== y.place || x.half !== y.half;
  }).length;
  check('on a clock at 4321 s: every estimate and every kick as on the song\'s', ls.onesKnown >= 10 && a0.length >= 400 && a0.length === a1.length && differ === 0 && sameAs(late) === 1,
    `${differ} of ${a0.length} estimates differ, ${(100 * sameAs(late)).toFixed(1)} % of kicks placed alike, the one known on ${ls.onesKnown}`);
}

console.log('\nOne song, a gap, another at a new tempo');
{
  const a = arrange({ bpm: 128, sections: [{ kind: 'verse', bars: 16 }], style: 'club', seed: 21 });
  // A verse of twenty-four bars: sixteen, and a one first known at bar 14,
  // left "held from then" asked of three kicks.
  const b = arrange({ bpm: 96, sections: [{ kind: 'intro', bars: 2 }, { kind: 'verse', bars: 24 }], style: 'band', seed: 22 });
  const gap = 2.5;
  const shift = a.seconds + gap;
  const pcm = new Float32Array(Math.ceil((shift + b.seconds) * SR));
  pcm.set(a.pcm, 0);
  pcm.set(b.pcm, Math.round(shift * SR));
  const truth = {
    beat: b.truth.beat,
    fills: b.truth.fills.map(t => t + shift),
    beats: b.truth.beats.map(t => t + shift),
    beatInBar: b.truth.beatInBar,
    sections: b.truth.sections.map(s => ({ ...s, start: s.start + shift, end: s.end + shift })),
  };
  // When the one is first known, in bars of the groove, and whether it is
  // known at every one after.
  const lock = (run, t0) => {
    const ones = run.heard.filter(h => h.place === 0 && h.t >= t0);
    const first = ones.findIndex(h => h.heard === 0);
    const after = first < 0 ? [] : ones.slice(first);
    return { bar: first < 0 ? Infinity : first, held: after.filter(h => h.heard === 0).length, of: after.length };
  };
  const groove = truth.sections.find(s => s.kind === 'verse').start;
  const both = listen(analysePcm(pcm, SR, 60), kicksOf(truth, 'band'));
  const alone = listen(analysePcm(b.pcm, SR, 60), kicksOf(b.truth, 'band'));
  const sc = score(truth, both);
  const lb = lock(both, groove), la = lock(alone, groove - shift);
  console.log(`  the second song alone knows its one from bar ${la.bar + 1} of its groove, after the first and a gap from bar ${lb.bar + 1}`);
  check('after the gap, the second song\'s beats, and no kick taken for its one', sc.beats >= 20 && sc.others >= 12 && sc.othersPlaced >= 12 && sc.onBeat >= 0.95 * sc.beats && sc.periodOk >= 0.95 * sc.beats && sc.falseOnes <= 0.03 * sc.others, `beats ${pc(sc.onBeat, sc.beats)} of ${sc.beats}, at the tempo ${pc(sc.periodOk, sc.beats)}, others ${sc.falseOnes} of ${sc.others} (${sc.othersPlaced} placed)`);
  // Measured: heard alone, its one from bar 7 of the groove; after the
  // first song and the gap, from bar 14. The old grid is held for SLIP_HOLD
  // before it is let go, and the new one then gathers from nothing: a cost
  // PLAN.md carries as an open item. Held here to sixteen bars, and then
  // held on eight ones or more.
  check('its one known by bar 16, and held from then', Number.isFinite(lb.bar) && lb.bar < 16 && lb.of >= 8 && lb.held >= 0.9 * lb.of, `bar ${lb.bar + 1} (alone: ${la.bar + 1}), held ${lb.held} of ${lb.of}`);
}

console.log('\nCost');
{
  /*
    Each estimate timed on its own, the frame that made it, and held two
    ways: the median under a millisecond (what it costs) and the 99th
    percentile under four (what a frame at 60 fps, 16.7 ms, can lose to it
    now and then). It was one average of wall time over the song, which hid
    a spike of three milliseconds in half of one and went red on five runs
    of seven under load.

    Warm, the songs above having been through it as the show's loop has
    after its first minute, and three passes over the same song: each
    estimate is the same arithmetic on the same readings each time, so the
    least of its three times is its own cost, and a pass that was put aside
    by another process on a shared runner (measured with the machine's load
    at 9 on 4 cores: single estimates of 100 to 300 ms, and a 99th
    percentile of 8 ms from passes whose median was 0.5) does not count
    against it. An estimate that is slow every time, as a slow one would
    be, is slow in all three and is counted.
  */
  const { readings, kicks } = kept[SONGS[4].name];
  const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
  const passes = [0, 1, 2].map(() => listen(readings, kicks).estimateMs);
  const least = passes[0].map((_, i) => Math.min(...passes.map(p => p[i])));
  const median = q(least, 0.5), p99 = q(least, 0.99), most = Math.max(...least);
  check('an estimate costs under a millisecond, and under four at its 99th percentile',
    passes.every(p => p.length === passes[0].length) && least.length >= 350 && median < 1 && p99 < 4,
    `median ${median.toFixed(2)} ms, 99th percentile ${p99.toFixed(2)} ms, the most ${most.toFixed(2)} ms, over ${least.length} estimates (each the least of three passes)`);
}

console.log('\nThe tempo\'s range, and streams no song makes');
{
  /*
    The fuzzed streams in a child process, with a deadline: a grid that
    never returns (a lag at or under zero in the beat walk) is then a FAIL
    here, printed, and not a check that hangs until the runner kills it.
  */
  const t0 = Date.now();
  const child = spawnSync(process.execPath, [process.argv[1], '--fuzz'], { encoding: 'utf8', timeout: 120000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  let f = null;
  try { f = JSON.parse(child.stdout.trim().split('\n').pop()); } catch { /* no answer: hung or crashed */ }
  check('streams no song makes: every estimate returns', f !== null && child.status === 0 && f.threw === 0 && f.estimates >= 10000,
    f ? `${f.streams} streams, ${f.estimates} estimates in ${secs} s${f.threw ? `, ${f.threw} threw (${f.worst})` : ''}` : `no answer in ${secs} s (${child.error?.code ?? child.signal ?? `exit ${child.status}`})`);
  check('streams no song makes: every period named is within 69 to 185 bpm', f !== null && f.n >= 100000 && f.out === 0,
    f ? `${f.out} of ${f.n} outside, ${(60 / f.hi).toFixed(1)} to ${(60 / f.lo).toFixed(1)} bpm${f.worst ? ` (${f.worst})` : ''}` : 'no answer');
  check('a steady click at any tempo: a tempo always named once the window is full', f !== null && f.steady >= 5000 && f.tempoless === 0,
    f ? `none on ${f.tempoless} of ${f.steady} estimates${f.lost ? ` (${f.lost})` : ''}` : 'no answer');
  check('every song and loop above: every period named is within 69 to 185 bpm', named.n >= 100000 && named.out === 0,
    `${named.out} of ${named.n} outside, ${(60 / named.hi).toFixed(1)} to ${(60 / named.lo).toFixed(1)} bpm`);
}

/*
  What the Sound sheet prints under Accent the One, from each state of the
  grid, so a performer turning it up sees why nothing has changed yet.
*/
console.log('\nWhat the phone says');
{
  const says = (now) => barLine({ period: 0.5, beatAt: null, place: null, half: null, beatConfidence: 0, barConfidence: 0, ...now });
  check('it names each state the grid can be in, and only the one is "counting the one"',
    says({}) === ''
    && says({ beatAt: 1, beatConfidence: 0.4 }) === 'Hearing the beat, not yet the bar'
    && says({ beatAt: 1, beatConfidence: 0.4, half: 0 }) === 'Hearing the backbeat, not yet the one'
    && says({ beatAt: 1, beatConfidence: 0.4, half: 0, place: 2 }) === 'Counting the one');
  /*
    And lets go of the bar when nothing is heard: paused, the grid used to
    keep its last estimate for good and the phone said "Counting the one" to
    silence. Kept for a beat window, then empty.
  */
  {
    const g = new BarGrid();
    let t = 0;
    for (const r of kept['band 110'].readings) { t = r.time; g.update(r, t); }
    const heard = barLine(g.now);
    g.update(null, t + 1);
    const soon = barLine(g.now);
    g.update(null, t + 9);
    const later = barLine(g.now);
    check('and lets go of it once nothing has been heard for a beat window', heard !== '' && soon === heard && later === '',
      `"${heard}" while heard, "${soon}" a second after, "${later}" nine seconds after`);
  }
}

/*
  Greps, and weak ones: they cannot say the wiring works, only that someone
  did not take it out. Each names a line whose absence would leave every
  check above green while the plate pressed every kick alike. The app's own
  frames cannot be read in a cloud session; the Mac's controls run
  (controls.yml) measures Beat Squeeze and Plate Rock on the real plate.
*/
console.log('\nWiring');
{
  const src = f => readFileSync(join(process.cwd(), f), 'utf8');
  const vis = src('src/components/LiquidVisualizer.tsx');
  const app = src('src/App.tsx');
  check('the plate hears the bar from the same readings, on the same clock, as the song\'s shape',
    /songShapeRef\.current\.update\(heard, songClockRef\.current\);\s*barGridRef\.current\.update\(heard, songClockRef\.current\);/.test(vis)
    && /songShapeRef\.current\.reset\(\);[\s\S]{0,200}barGridRef\.current\.reset\(\);\s*accentRef\.current\.reset\(\);/.test(vis));
  check('each kick is weighed by the accent, at the beat the clock means, with the setting',
    /const accentAt = songClockRef\.current \+ \(kickRef\.current\.predicted \? Math\.max\(0, currentSettings\.beatLead \?\? 0\) \/ 1000 : 0\);\s*const accent = kickStep \? accentRef\.current\.kick\(barGridRef\.current, accentAt, currentSettings\.beatAccent \?\? 0\) : 1;/.test(vis));
  /*
    The rock's shove and the squeeze's depth moved into src/lib/plateRock.ts
    and src/lib/squish.ts (PLAN 27a, 27b), so the lab's `npm run rides` could
    measure the same numbers the app uses. The grep now reads that the frame
    loop hands them the accent, and the helpers are called to show the accent
    scales what they give: a grep of a helper's body would pass on a helper
    that took the accent and dropped it.
  */
  const shove = accent => { const r = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 }; kickRock(r, 0.8, accent); return Math.hypot(r.vx, r.vy); };
  const shoveScales = shove(1) > 0 && Math.abs(shove(1.5) / shove(1) - 1.5) < 1e-9;
  const depthScales = kickDepth(0.9, 0.8, 1) > 0 && Math.abs(kickDepth(0.9, 0.8, 1.5) / kickDepth(0.9, 0.8, 1) - 1.5) < 1e-9;
  check('and the weight reaches the rock, the squeeze and the beads',
    /if \(R > 0 && kickStep\) kickRock\(rock, bass01, accent\);/.test(vis)
    && /const a = kickDepth\(squeezeAmt, bass01, accent\);/.test(vis) && /0\.4 \* squeezeAmt \* bass01 \* accent\)/.test(vis)
    && shoveScales && depthScales,
    `the rock's shove ×${(shove(1.5) / shove(1)).toFixed(3)} and the squeeze's depth ×${(kickDepth(0.9, 0.8, 1.5) / kickDepth(0.9, 0.8, 1)).toFixed(3)} at an accent of 1.5`);
  check('the app reads what the grid knows for the phone', /const bar = report \? barLine\(report\.bar\) : '';/.test(app)
    && /bar: \{ \.\.\.barGridRef\.current\.now \}/.test(vis));
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
