#!/usr/bin/env node
/**
 * Does the show know where it is in a song it has heard before, when a band
 * plays it live: slower, faster, on other instruments, with its form
 * changed, and does it know when it does not?
 *
 *   npm run songfollow
 *
 * PLAN.md 28g, step 1. `src/lib/songFollow.ts` follows a song map by the
 * harmony heard in the room. This makes the map exactly as the app does
 * (the worker's own analysis, `songMapAnalysis.ts`, for its sections, and
 * `mapChroma` for its harmony, rounded as it is stored) from one recording
 * of a synthesised song, then plays the follower other takes of the same
 * song through the live ear (`analysePcm`, the analyser's arithmetic, one
 * reading a frame), and asserts, in bars of the song:
 *
 *   - a take 15% slower and one 15% faster, each on another instrument
 *     (an organ, an electric piano, not the record's pad), with the other
 *     drum style, 6 dB quieter or not: nine hops in ten within a bar of the
 *     true place in the map, after the first twelve bars, the very place
 *     (the second verse, not the first), and the tempo against the map
 *     within 5% of the true ratio;
 *   - the bridge left out, the last chorus played twice, the solo played
 *     for twice its length: back within a bar of the true place within four
 *     bars of the change, and nine hops in ten within a bar outside those
 *     four bars. Here "the true place" counts any copy of the section (the
 *     third chorus played twice is the first chorus as much as the third:
 *     the two sound the same, and the map cannot say which), and the copy
 *     the follower picks is printed;
 *   - sixteen bars of a jam on chords the song never had (C sharp minor,
 *     G sharp minor, B, F sharp minor): confidence, from its third bar,
 *     under 0.3 on average and under half of what it was where the song
 *     was followed; then found again within four bars of the chorus after;
 *   - a band speeding up through the song, a section at a time from 100 to
 *     140 bpm, with a bar of silence the record did not have before the
 *     solo: nine hops in ten within a bar of the very place, and the tempo
 *     within 5% in the second half of every section;
 *   - a follower that first hears the band at its second verse finds its
 *     place within four bars;
 *   - told where the band is (the score's nudge, PLAN.md 28h, `anchor`):
 *     there from the first bar; told a wrong place, back within four;
 *   - confidence where the song is followed at least 0.5 on average, so
 *     the jam's low confidence is the jam and not a follower never sure;
 *   - silence before the song reports no place at all;
 *   - the same take followed twice reports the same places, to the bit;
 *   - the take at 30 fps (a render's rate, or a slow laptop's) as at 60.
 *
 * Each take is a different seed, so the drums' humanising and the noise
 * floor differ from the record's as well. The song is in A minor, with a
 * verse that is not its chorus (Am F C G; Dm G C E), a bridge on B flat and
 * a solo going round A minor, D, F and E: a song whose sections have their own
 * chords, as songs have. A song that is one chord loop throughout (the
 * other harnesses' Am F C G every bar) has no place to find, by anyone.
 */

import { analysePcm } from '../src/lib/audioFeatures.ts';
import { SongFollower, mapChroma, storedChroma, FOLLOW_RATE } from '../src/lib/songFollow.ts';
import { analyze, segment } from '../src/lib/songMapAnalysis.ts';
import { arrange, SR } from './arrangement.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');

/** The song's sections: `kind` for the drums (`arrangement.mjs`), `name` for the truth. */
const S = {
  intro: { kind: 'intro', name: 'intro', bars: 4, chords: ['Am'] },
  verse: { kind: 'verse', name: 'verse', bars: 8, chords: ['Am', 'F', 'C', 'G'] },
  chorus: { kind: 'chorus', name: 'chorus', bars: 8, chords: ['Dm', 'G', 'C', 'E'] },
  bridge: { kind: 'breakdown', name: 'bridge', bars: 8, chords: ['Bb', 'F', 'C', 'Dm'] },
  solo: { kind: 'verse', name: 'solo', bars: 8, chords: ['Am', 'D', 'F', 'E'] },
  outro: { kind: 'outro', name: 'outro', bars: 4, chords: ['Am'] },
  jam: { kind: 'verse', name: 'jam', bars: 16, chords: ['Csm', 'Gsm', 'B', 'Fsm'] },
};
const RECORD = [S.intro, S.verse, S.chorus, S.verse, S.chorus, S.bridge, S.solo, S.chorus, S.outro];
const RECORD_BPM = 120;

// ── The map, made as the app makes it ─────────────────────────────────────

const record = arrange({ bpm: RECORD_BPM, sections: RECORD, style: 'band', seed: 1 });
/** The listen, resampled to the map's 22050 Hz as `decodeToMono` does (here a pair's mean). */
const half = new Float32Array(Math.floor(record.pcm.length / 2));
for (let i = 0; i < half.length; i++) half[i] = 0.5 * (record.pcm[2 * i] + record.pcm[2 * i + 1]);
const feat = analyze(half, SR / 2);
const mapSections = segment(feat);
const map = { chroma: storedChroma(mapChroma(half, SR / 2)), sections: mapSections };
const mapBar = record.truth.bar;
console.log(`the map: ${(map.chroma.length / 12 / FOLLOW_RATE).toFixed(1)} s, ${mapSections.length} sections found by the worker's analysis:`);
console.log(`  found  ${mapSections.map(s => `${s.label} ${s.start.toFixed(0)}–${s.end.toFixed(0)}`).join(', ')}`);
console.log(`  played ${record.truth.sections.map((s, i) => `${RECORD[i].name} ${s.start.toFixed(0)}–${s.end.toFixed(0)}`).join(', ')}`);

/** Where each of the record's sections starts in the map, by index, and its name. */
const recordAt = record.truth.sections.map((s, i) => ({ ...s, name: RECORD[i].name, bars: RECORD[i].bars }));

// ── Takes ─────────────────────────────────────────────────────────────────

/**
 * A take: the sections played, each naming the record's section it is (by
 * index into RECORD, or null for the jam), so the true place in the map is
 * known at every moment of the take. A section played longer than the
 * record's goes round its own bars again (a solo's vamp).
 */
function take({ bpm, plan, voicing, style, gainDb = 0, seed }) {
  const sections = plan.map(([i, bars]) => (i === null ? S.jam : { ...RECORD[i], bars: bars ?? RECORD[i].bars }));
  const t = arrange({ bpm, sections, style, voicing, gainDb, seed });
  const spans = t.truth.sections.map((s, k) => ({ ...s, record: plan[k][0], bars: sections[k].bars }));
  return { pcm: t.pcm, bar: t.truth.bar, spans, ratio: bpm / RECORD_BPM };
}

/** The true place in the map at take time `t`, or null (silence before, the jam, after the end). */
function truthAt(tk, t) {
  for (const s of tk.spans) {
    if (t < s.start || t >= s.end) continue;
    if (s.record === null) return null;
    const r = recordAt[s.record];
    const intoBars = ((t - s.start) / tk.bar) % r.bars;
    return { pos: r.start + intoBars * mapBar, section: s.record, name: r.name, sectionStart: s.start };
  }
  return null;
}

/**
 * Places the map itself cannot tell from each other. A chorus played three
 * times is three places that sound the same, and a solo vamping on two
 * chords is a place every two bars; after a skip or a repeat, nothing
 * heard says which copy the band is in, and a follower that picks another
 * copy has found the music, not lost it. So "within a bar of the true
 * place" counts any place where the score is the same: a section with the
 * same chords, at the same point in their progression (the same bar of
 * it, round again for a progression shorter than its section, and the
 * same point in that bar). Defined by the song's chords, never by what the
 * follower reported; and the share of the map that is the same as a place
 * is printed and held small, so the check cannot pass by everything
 * counting.
 */
const recordSpans = record.truth.sections;
/** The map times whose score is the same as at map time `t` (`t` itself included). */
function sameAs(t) {
  const i = recordSpans.findIndex(s => t >= s.start && t < s.end);
  if (i < 0) return [t];
  const chords = RECORD[i].chords, cycle = chords.length * mapBar;
  const into = (t - recordSpans[i].start) % cycle;
  const out = [];
  for (let j = 0; j < recordSpans.length; j++) {
    if (RECORD[j].chords.join() !== chords.join()) continue;
    for (let x = recordSpans[j].start + into; x < recordSpans[j].end; x += cycle) out.push(x);
  }
  return out;
}

/** Error in bars against the true place, and against any place the map cannot tell from it. */
function errorBars(pos, truth) {
  const exact = Math.abs(pos - truth.pos) / mapBar;
  let any = exact;
  for (const x of sameAs(truth.pos)) any = Math.min(any, Math.abs(pos - x) / mapBar);
  return { exact, any };
}

{
  let share = 0, most = 0;
  // As a share of the song: each same place stands for a bar of the map either side of it.
  const song = record.truth.sections.at(-1).end - record.truth.sections[0].start;
  let k = 0;
  for (let t = record.truth.sections[0].start; t < song; t += 1 / FOLLOW_RATE, k++) {
    const n = Math.min(1, (sameAs(t).length * 2 * mapBar) / song);
    share += n; most = Math.max(most, n);
  }
  share /= k;
  // A property of the test song, not of the follower: that the song leaves a
  // follower something to find, so "within a bar of a same place" is a claim.
  check('the song: places its score cannot tell apart are few (within a bar of one: under a fifth of it on average, under 30% anywhere)', share < 0.2 && most < 0.3, `${(100 * share).toFixed(1)}% on average, at most ${(100 * most).toFixed(1)}%`);
}

function follow(tk, fps = 60, withMap = map) {
  const readings = analysePcm(tk.pcm, SR, fps);
  const f = new SongFollower(withMap);
  const out = [];
  const t0 = performance.now();
  for (const r of readings) {
    const s = f.update(r);
    out.push({ t: r.time, position: s.position, tempo: s.tempo, confidence: s.confidence, quality: s.quality, agreement: s.agreement });
  }
  const ms = performance.now() - t0;
  return { out, msPerSecond: ms / (readings.length / fps) };
}

/**
 * Score a followed take. `changes` are take times where the form changed
 * (a skip, a repeat, the solo going round, the jam ending): the four bars
 * after each are the relock window, judged by the relock bar instead.
 */
function score(tk, run, { changes = [], exactToo = false }) {
  const settle = tk.spans[0].start + 12 * tk.bar;
  let n = 0, within = 0, withinExact = 0, confSum = 0, confN = 0;
  const tempos = [];
  const relock = changes.map(c => ({ at: c, bars: Infinity }));
  // Per hop (the readings between hops repeat the state); sample at the hop rate.
  let next = 0;
  for (const o of run.out) {
    if (o.t < next) continue;
    next = o.t + 1 / FOLLOW_RATE;
    const tr = truthAt(tk, o.t);
    if (!tr || o.t < settle) continue;
    const inWindow = changes.some(c => o.t >= c && o.t < c + 4 * tk.bar);
    if (o.position === null) { if (!inWindow) n++; continue; }
    const e = errorBars(o.position, tr);
    if (!inWindow) {
      n++;
      if (e.any <= 1) within++;
      if (e.exact <= 1) withinExact++;
      confSum += o.confidence; confN++;
      tempos.push(o.tempo);
    }
  }
  // Relock: the first hop after a change from which every hop for the next
  // two bars is within a bar of the true place (or a place the score cannot
  // tell from it). Two bars, not "to the end of the section": a chorus is
  // its four chords twice, and after a repeat nothing heard says whether the
  // band is in the first four bars or the second; a follower that guessed
  // the second round finds out when the map's chorus ends and the band's
  // does not, and is back within a bar or so. That slip is real and is
  // counted, in the share of hops within a bar; it is not a failure to find
  // the song again, which is what this measures.
  for (const r of relock) {
    const hops = [];
    let next2 = 0;
    for (const o of run.out) {
      if (o.t < r.at || o.t < next2) continue;
      next2 = o.t + 1 / FOLLOW_RATE;
      const tr = truthAt(tk, o.t);
      hops.push({ t: o.t, ok: !!tr && o.position !== null && errorBars(o.position, tr).any <= 1 });
      if (o.t > r.at + 12 * tk.bar) break;
    }
    r.bars = Infinity;
    for (let i = 0; i < hops.length; i++) {
      const until = hops[i].t + 2 * tk.bar;
      let held = hops[i].ok;
      for (let j = i; j < hops.length && hops[j].t <= until && held; j++) held = hops[j].ok;
      if (held && hops.at(-1).t >= until) { r.bars = (hops[i].t - r.at) / tk.bar; break; }
    }
  }
  tempos.sort((a, b) => a - b);
  return {
    share: n ? within / n : 0, shareExact: n ? withinExact / n : 0, n,
    conf: confN ? confSum / confN : 0,
    tempo: tempos.length ? tempos[Math.floor(tempos.length / 2)] : NaN,
    relock,
  };
}

const I = { intro: 0, verse1: 1, chorus1: 2, verse2: 3, chorus2: 4, bridge: 5, solo: 6, chorus3: 7, outro: 8 };
const whole = RECORD.map((_, i) => [i]);
const changeAt = (tk, k) => tk.spans[k].start;

const results = [];
function report(name, tk, run, sc) {
  const relocks = sc.relock.map(r => (Number.isFinite(r.bars) ? r.bars.toFixed(1) : 'never')).join(', ');
  console.log(`  ${name}: ${sc.n} hops, ${(100 * sc.share).toFixed(0)}% within a bar (${(100 * sc.shareExact).toFixed(0)}% the very place), tempo ${f2(sc.tempo)} of ${f2(tk.ratio)}, confidence ${f2(sc.conf)}${sc.relock.length ? `, back in ${relocks} bars` : ''}; ${run.msPerSecond.toFixed(2)} ms a second of sound`);
  results.push({ name, sc });
}

console.log('\ntakes:');

// The same form, slower and faster, other instruments.
const slow = take({ bpm: 102, plan: whole, voicing: 'organ', style: 'club', gainDb: -6, seed: 2 });
const slowRun = follow(slow);
const slowSc = score(slow, slowRun, {});
report('15% slower, organ, four on the floor, 6 dB down', slow, slowRun, slowSc);
check('a take 15% slower on an organ: nine hops in ten within a bar of the very place', slowSc.shareExact >= 0.9, `${(100 * slowSc.shareExact).toFixed(0)}%`);
check('… and its tempo against the map within 5%', Math.abs(slowSc.tempo / slow.ratio - 1) <= 0.05, `${f2(slowSc.tempo)} of ${f2(slow.ratio)}`);

const fast = take({ bpm: 138, plan: whole, voicing: 'keys', style: 'band', seed: 3 });
const fastRun = follow(fast);
const fastSc = score(fast, fastRun, {});
report('15% faster, electric piano, rock beat', fast, fastRun, fastSc);
check('a take 15% faster on an electric piano: nine hops in ten within a bar of the very place', fastSc.shareExact >= 0.9, `${(100 * fastSc.shareExact).toFixed(0)}%`);
check('… and its tempo against the map within 5%', Math.abs(fastSc.tempo / fast.ratio - 1) <= 0.05, `${f2(fastSc.tempo)} of ${f2(fast.ratio)}`);

const fast30 = follow(fast, 30);
const fast30Sc = score(fast, fast30, {});
report('the same at 30 fps', fast, fast30, fast30Sc);
check('… and the same at 30 fps', fast30Sc.shareExact >= 0.9 && Math.abs(fast30Sc.tempo / fast.ratio - 1) <= 0.05, `${(100 * fast30Sc.shareExact).toFixed(0)}%, tempo ${f2(fast30Sc.tempo)}`);

// The form changed.
const formChecks = [
  { name: 'the bridge left out', bpm: 110, voicing: 'organ', style: 'band', seed: 4,
    plan: [[I.intro], [I.verse1], [I.chorus1], [I.verse2], [I.chorus2], [I.solo], [I.chorus3], [I.outro]], change: 5 },
  { name: 'the last chorus played twice', bpm: 126, voicing: 'keys', style: 'club', seed: 5,
    plan: [[I.intro], [I.verse1], [I.chorus1], [I.verse2], [I.chorus2], [I.bridge], [I.solo], [I.chorus3], [I.chorus3], [I.outro]], change: 8 },
  { name: 'the solo played twice as long', bpm: 115, voicing: 'organ', style: 'club', seed: 6,
    plan: [[I.intro], [I.verse1], [I.chorus1], [I.verse2], [I.chorus2], [I.bridge], [I.solo, 16], [I.chorus3], [I.outro]], change: 6, round: 8 },
];
const formTakes = [];
for (const fc of formChecks) {
  const tk = take(fc);
  formTakes.push(tk);
  const run = follow(tk);
  const at = changeAt(tk, fc.change) + (fc.round ? fc.round * tk.bar : 0);
  const sc = score(tk, run, { changes: [at] });
  report(fc.name, tk, run, sc);
  check(`${fc.name}: back within a bar of the true place within four bars of the change`, sc.relock[0].bars <= 4, `${Number.isFinite(sc.relock[0].bars) ? sc.relock[0].bars.toFixed(1) : 'never'} bars`);
  check(`${fc.name}: nine hops in ten within a bar outside those four`, sc.share >= 0.9, `${(100 * sc.share).toFixed(0)}%`);
}

// The form's own transitions. Today the worker's sections are coarse (the
// map above: one "chorus" over verse, chorus, verse, chorus), so what finds
// the song again after a change is the leak, not the jump at a section's
// end (measured: with no jumps at all every number above is the same). With
// the record's own sections, as a better segmentation would give (PLAN.md
// 28g-4), the jump must do the work: the repeated chorus is found sooner
// than from the leak.
{
  const trueMap = { chroma: map.chroma, sections: record.truth.sections.map((s, i) => ({ start: s.start, end: s.end, label: RECORD[i].name })) };
  const tk = formTakes[1];
  const at = changeAt(tk, formChecks[1].change);
  const coarse = score(tk, follow(tk), { changes: [at] }).relock[0].bars;
  const fine = score(tk, follow(tk, 60, trueMap), { changes: [at] }).relock[0].bars;
  console.log(`  the last chorus twice, back in: ${coarse.toFixed(1)} bars on the worker's sections, ${fine.toFixed(1)} on the record's own`);
}

// A band that speeds up through the song, a section at a time from 100 to
// 140 bpm (the record is 120), with a bar of silence before the solo: the
// place held, and the tempo followed section by section.
{
  const plan = [I.intro, I.verse1, I.chorus1, I.verse2, I.chorus2, I.bridge, 'silence', I.solo, I.chorus3, I.outro];
  const bpms = [100, 104, 108, 113, 118, 124, 124, 130, 135, 140];
  const parts = [], spans = [];
  let at = 60 / 100;
  let pcmLen = Math.round(at * SR);
  plan.forEach((p, k) => {
    const sec = p === 'silence' ? { kind: 'silence', bars: 1 } : RECORD[p];
    const one = arrange({ bpm: bpms[k], sections: [sec], style: 'band', voicing: 'organ', seed: 20 + k });
    const s0 = Math.round(one.truth.sections[0].start * SR), s1 = Math.round(one.truth.sections[0].end * SR);
    parts.push(one.pcm.subarray(s0, s1));
    const len = (s1 - s0) / SR;
    spans.push({ kind: sec.kind, start: at, end: at + len, record: p === 'silence' ? null : p, bars: sec.bars, bar: one.truth.bar });
    at += len; pcmLen += s1 - s0;
  });
  const pcm = new Float32Array(pcmLen + 3 * SR);
  let o = Math.round((60 / 100) * SR);
  for (const part of parts) { pcm.set(part, o); o += part.length; }
  // `truthAt` reads one bar length a take; this one has a bar a section.
  const tk = { pcm, spans, bar: 2, ratio: 1 };
  const truth = (t) => {
    const s = spans.find(x => t >= x.start && t < x.end);
    if (!s || s.record === null) return null;
    const r = recordAt[s.record];
    return { pos: r.start + (((t - s.start) / s.bar) % r.bars) * mapBar, section: s.record };
  };
  const run = follow(tk);
  let n = 0, within = 0, next = 0;
  const perSection = spans.map(() => []);
  for (const h of run.out) {
    if (h.t < next) continue;
    next = h.t + 1 / FOLLOW_RATE;
    const tr = truth(h.t);
    const k = spans.findIndex(x => h.t >= x.start && h.t < x.end);
    if (!tr || h.t < spans[2].start || h.position === null) continue;
    n++;
    if (Math.abs(h.position - tr.pos) <= mapBar) within++;
    if (h.t >= (spans[k].start + spans[k].end) / 2) perSection[k].push(h.tempo);
  }
  const misses = [];
  spans.forEach((s, k) => {
    if (k < 2 || s.record === null || !perSection[k].length) return;
    const v = perSection[k].sort((a, b) => a - b)[perSection[k].length >> 1];
    const want = bpms[k] / RECORD_BPM;
    if (Math.abs(v / want - 1) > 0.05) misses.push(`${RECORD[s.record].name} ${f2(v)} of ${f2(want)}`);
  });
  console.log(`  speeding up 100 to 140 bpm: ${n} hops, ${(100 * within / Math.max(1, n)).toFixed(0)}% within a bar of the very place; ${run.msPerSecond.toFixed(2)} ms a second of sound`);
  check('a band speeding up from 100 to 140 bpm, a bar of silence before the solo: nine hops in ten within a bar of the very place', n > 0 && within / n >= 0.9, `${(100 * within / Math.max(1, n)).toFixed(0)}% of ${n}`);
  check('… and the tempo against the map within 5% in the second half of every section', misses.length === 0, misses.length ? misses.join(', ') : `all ${spans.length - 3} sections`);
}

// Joined mid-song: a follower that hears the band first at its second verse
// (a song recognised a minute in, a set joined late) finds its place within
// four bars, from the leak, against a start prior that says "the intro".
{
  const tk = take({ bpm: 120, plan: [[I.verse2], [I.chorus2], [I.bridge], [I.solo], [I.chorus3], [I.outro]], voicing: 'keys', style: 'club', seed: 30 });
  const sc = score(tk, follow(tk), { changes: [tk.spans[0].start] });
  check('joined at the second verse: found within four bars', sc.relock[0].bars <= 4, `${Number.isFinite(sc.relock[0].bars) ? sc.relock[0].bars.toFixed(1) : 'never'} bars`);
}

// A jam the song never had, then its chorus.
const jam = take({ bpm: 120, voicing: 'keys', style: 'band', seed: 8,
  plan: [[I.intro], [I.verse1], [I.chorus1], [I.verse2], [I.chorus2], [I.bridge], [I.solo], [null], [I.chorus3], [I.outro]] });
const jamRun = follow(jam);
const jamSpan = jam.spans[7];
const jamSc = score(jam, jamRun, { changes: [jam.spans[8].start] });
report('sixteen bars of a jam in E, then the chorus', jam, jamRun, jamSc);
let jc = 0, jn = 0, nextHop = 0;
for (const o of jamRun.out) {
  if (o.t < nextHop) continue;
  nextHop = o.t + 1 / FOLLOW_RATE;
  if (o.t >= jamSpan.start + 2 * jam.bar && o.t < jamSpan.end) { jc += o.confidence; jn++; }
}
const jamConf = jn ? jc / jn : NaN;
console.log(`  confidence in the jam from its third bar: ${f2(jamConf)} over ${jn} hops; where the song was followed: ${f2(jamSc.conf)}`);
check('a jam on chords the song never had: confidence under 0.3', jamConf < 0.3, f2(jamConf));
check('… and under half of what it is where the song is followed', jamConf < 0.5 * jamSc.conf, `${f2(jamConf)} against ${f2(jamSc.conf)}`);
check('… and the chorus after it found within four bars', jamSc.relock[0].bars <= 4, `${Number.isFinite(jamSc.relock[0].bars) ? jamSc.relock[0].bars.toFixed(1) : 'never'} bars`);

// Confidence where it follows.
const confs = [slowSc, fastSc, ...results.slice(3).map(r => r.sc)].map(s => s.conf);
const meanConf = confs.reduce((a, b) => a + b, 0) / confs.length;
check('confidence where the song is followed: at least 0.5 on average over every take', meanConf >= 0.5, `${f2(meanConf)} (${confs.map(f2).join(', ')})`);

// Silence before the song.
const lead = slowRun.out.filter(o => o.t < slow.spans[0].start - 0.05);
check('silence before the song reports no place', lead.length > 0 && lead.every(o => o.position === null), `${lead.length} frames of the lead, ${lead.filter(o => o.position !== null).length} with a place`);

// The score's nudge (PLAN.md 28h): told the band is at the record's second
// chorus while it is, mid-way through a take the follower had not heard the
// start of, it is there at once; told a wrong place, what it hears brings it
// back within four bars.
{
  const readings = analysePcm(fast.pcm, SR, 60);
  const at = fast.spans[4].start + 0.25;
  const told = (f, place) => {
    let i = 0;
    for (; i < readings.length && readings[i].time < at; i++);
    f.anchor(place);
    const out = [];
    let next = 0;
    for (; i < readings.length && readings[i].time < at + 6 * fast.bar; i++) {
      const s = f.update(readings[i]);
      if (readings[i].time < next) continue;
      next = readings[i].time + 1 / FOLLOW_RATE;
      const tr = truthAt(fast, readings[i].time);
      out.push({ t: readings[i].time, ok: !!tr && s.position !== null && errorBars(s.position, tr).any <= 1 });
    }
    return out;
  };
  const right = told(new SongFollower(map), recordAt[I.chorus2].start + 0.25 * mapBar / fast.bar);
  const firstBar = right.filter(o => o.t < at + fast.bar);
  check('told where the band is (the score\'s nudge): within a bar from the first bar', firstBar.length > 0 && firstBar.every(o => o.ok), `${firstBar.filter(o => o.ok).length} of ${firstBar.length} hops`);
  const wrong = told(new SongFollower(map), recordAt[I.bridge].start + 2 * mapBar);
  // Back as `score` counts it: the first hop from which two bars hold.
  let back = Infinity;
  for (let i = 0; i < wrong.length && back === Infinity; i++) {
    const until = wrong[i].t + 2 * fast.bar;
    if (wrong.at(-1).t < until) break;
    if (wrong.filter(o => o.t >= wrong[i].t && o.t <= until).every(o => o.ok)) back = (wrong[i].t - at) / fast.bar;
  }
  check('told a wrong place: back within a bar within four bars of hearing', back <= 4, `${Number.isFinite(back) ? back.toFixed(1) : 'never'} bars`);
}

// The same take twice.
const again = follow(slow);
const same = again.out.length === slowRun.out.length && again.out.every((o, i) => o.position === slowRun.out[i].position && o.confidence === slowRun.out[i].confidence);
check('the same take followed twice reports the same places, to the bit', same);

console.log(`\n${passed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
