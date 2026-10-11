#!/usr/bin/env node
/**
 * `npm run breakdown`: does the plate go quiet when the band does?
 *
 * What was reported (the showreel, PLAN 28d, 2026-10-11): every look rendered
 * to the same minute of a real song, which grooves, drops 7 to 8 dB into a
 * breakdown and comes back. On 28 of the 41 looks the plate moved more in the
 * breakdown than in the groove. A real show goes quiet with the band.
 *
 * What was measured, on that minute through the ear a render uses
 * (`songAudioTrack`): the levels the plate's hands read fell only to 0.6 to
 * 0.76 of the groove's in the breakdown while the song's amplitude fell to
 * 0.4, because each is a decibel reading ranged against its own ceiling, and
 * the ceilings fall back in seconds. And one hand rose: Sound Drive's bass on a
 * thin gap, which moves the liquid by the change in its depth (the flow is the
 * gap's rate, lib/squish.ts). The groove's bass sat over the route's line 0.55
 * of every second, so the glass was held flat and the kicks moved nothing,
 * while the breakdown's bass, under the line, rose and fell with every note.
 * Its change per second was 1.44 times the groove's, and per second it
 * followed Classic's measured motion at r 0.74 (Roy 0.68, Red Cabbage 0.68,
 * Clock Glass 0.66, Aurora 0.65; the looks that did follow the band, Acid
 * Trip, Solar Flare, Cell Bloom, read -0.11 to -0.44 against it).
 *
 * What changed: the ear reports how loud the passage is against the song's
 * loud passages, as an amplitude (`Passage`, lib/soundLevels.ts), and the
 * music's hands are scaled by it; and the press reads the band over its own
 * ceiling (`bassPressLevel`), so a loud groove's kicks press and let go.
 *
 * So this plays a song with the shape of that minute, made here from the
 * show's own band (`renderBand`, its chorus, then its verse 8 dB down, then
 * the chorus), through the same ear, a frame at a time at 30 fps, and asks:
 *
 *   1. the control: the old press (the route over 70, no passage) changes more
 *      a second in the breakdown than in the groove, as on the showreel; if it
 *      does not, the song has lost the shape and nothing below means anything;
 *   2. the press now changes less in the breakdown than in the groove, by at
 *      least a quarter, and the groove's own change is not less than it was
 *      (the groove's kicks still move the plate);
 *   3. the hands' levels times the passage fall in the breakdown to at most
 *      0.6 of the groove's, and the passage reads the groove at 0.85 or more;
 *   4. a song that is quiet all through is not a breakdown: the same band 8 dB
 *      down from its first bar reads a passage of 0.85 or more;
 *   5. the volume turned down 10 dB in the middle of a long groove: the plate
 *      calms with it and has learned the new level (0.75 or more) within three
 *      minutes. Printed with its times, because that is the price of a
 *      reference slow enough to hold a breakdown.
 *
 *   BREAKDOWN_SONG=song.f32 npm run breakdown   also prints the same numbers for a
 *   real song: mono float32 at 48 kHz (`ffmpeg -ss 78 -t 60 -i Funkorama.mp3 -ac 1
 *   -ar 48000 -f f32le song.f32`), sections BREAKDOWN_SECTIONS (default
 *   "10-26,28-44,46-60", the showreel minute's groove, breakdown and return).
 */
import fs from 'node:fs';
import { renderBand } from './band.mjs';
import { songAudioTrack } from '../src/lib/songTrack.ts';
import { bassPressDepth, bassPressLevel, BASS_PRESS } from '../src/lib/squish.ts';
import { levels01 } from '../src/lib/soundLevels.ts';
import { setShowSeed } from '../src/lib/rng.ts';

// The band's noise (hats, snares) is drawn from the show's seed: fixed, so a run is the same song every time.
setShowSeed(7);

const SR = 48000, FPS = 30, IMPACT = 0.55;   // Classic's Sound Drive
const STEPS_PER_SECTION = 8 * 16;
const CHORUS = 4 * STEPS_PER_SECTION, VERSE = 1 * STEPS_PER_SECTION;
const DOWN = 10 ** (-8 / 20);

let failed = 0;
const check = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

const concat = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const scaled = (pcm, k) => pcm.map((x) => x * k);

/** Per second of the song: the press's change (new and old), the hands' level (new and old), the passage. */
function measure(pcm) {
  const t = songAudioTrack(pcm, SR, FPS);
  const secs = Math.floor(t.length / FPS);
  const rows = [];
  let prevNew = 0, prevOld = 0;
  for (let s = 0; s < secs; s++) {
    let pressNew = 0, pressOld = 0, handsNew = 0, handsOld = 0, passage = 0;
    for (let i = s * FPS; i < (s + 1) * FPS; i++) {
      const a = t[i], g = a.passage ?? 1;
      const route = Math.min(1, a.bass / 100);   // getAudioValue's 'bass', the default velocity route
      const dNew = bassPressDepth(bassPressLevel(route, false), IMPACT) * g;
      const dOld = bassPressDepth(Math.min(1, route * (100 / 70)), IMPACT);
      pressNew += Math.abs(dNew - prevNew) / BASS_PRESS; prevNew = dNew;
      pressOld += Math.abs(dOld - prevOld) / BASS_PRESS; prevOld = dOld;
      const l = levels01(a), mean = (l.bass + l.mid + l.treble + l.energy) / 4;
      handsNew += mean * g / FPS; handsOld += mean / FPS; passage += g / FPS;
    }
    rows.push({ pressNew, pressOld, handsNew, handsOld, passage });
  }
  return rows;
}
const over = (rows, [a, b], k) => rows.slice(a, b).reduce((s, r) => s + r[k], 0) / Math.max(1, Math.min(b, rows.length) - a);

function table(rows, sections, names) {
  for (const k of ['pressOld', 'pressNew', 'handsOld', 'handsNew', 'passage']) {
    const v = sections.map((sec) => over(rows, sec, k));
    console.log(`     ${k.padEnd(9)} ${names.map((n, i) => `${n} ${f2(v[i])}`).join('  ')}  breakdown/groove ${f2(v[1] / v[0])}`);
  }
}

// ── The song: groove, breakdown 8 dB down, groove ─────────────────────────────
const groove = renderBand(20, SR, CHORUS).pcm;
const quiet = scaled(renderBand(16, SR, VERSE).pcm, DOWN);
const back = renderBand(16, SR, CHORUS).pcm;
const rows = measure(concat(groove, quiet, back));
// Two seconds in from each edge: the passage is heard over a bar.
const G = [4, 20], B = [22, 36], R = [38, 52];
console.log('The band: chorus 0–20 s, its verse 8 dB down 20–36 s, chorus 36–52 s (per second, mean over each section)');
table(rows, [G, B, R], ['groove', 'breakdown', 'return']);

const pOld = [over(rows, G, 'pressOld'), over(rows, B, 'pressOld')];
const pNew = [over(rows, G, 'pressNew'), over(rows, B, 'pressNew')];
const hNew = [over(rows, G, 'handsNew'), over(rows, B, 'handsNew')];
check(pOld[1] > pOld[0], 'control: the old press changes more a second in the breakdown than in the groove (the showreel\'s fault)',
  `${f2(pOld[1])} against ${f2(pOld[0])}, ${f2(pOld[1] / pOld[0])}×`);
check(pNew[1] <= 0.75 * pNew[0], 'the press changes at most three quarters as much in the breakdown as in the groove',
  `${f2(pNew[1])} against ${f2(pNew[0])}, ${f2(pNew[1] / pNew[0])}×`);
check(pNew[0] >= 0.9 * pOld[0], 'the groove\'s press moves at least nine tenths as much as before (its kicks press and let go)',
  `${f2(pNew[0])} a second, was ${f2(pOld[0])}`);
check(hNew[1] <= 0.6 * hNew[0], 'the hands fall to at most 0.6 of the groove\'s in the breakdown',
  `${f2(hNew[1] / hNew[0])}× (the levels alone: ${f2(over(rows, B, 'handsOld') / over(rows, G, 'handsOld'))}×)`);
check(over(rows, G, 'passage') >= 0.85, 'the passage reads the groove as the song\'s level', f2(over(rows, G, 'passage')));

// ── A quiet song is not a breakdown ───────────────────────────────────────────
{
  const q = measure(scaled(concat(renderBand(20, SR, CHORUS).pcm, renderBand(16, SR, CHORUS).pcm), DOWN));
  const p = over(q, [4, 36], 'passage');
  check(p >= 0.85, 'a song 8 dB down from its first bar reads as its own level, not as a breakdown', `passage ${f2(p)}`);
}

// ── The volume turned down mid-song ───────────────────────────────────────────
{
  const bar = renderBand(16, SR, CHORUS).pcm;
  const tile = (n, k) => concat(...Array.from({ length: n }, () => scaled(bar, k)));
  const turned = measure(concat(tile(3, 1), tile(15, 10 ** (-10 / 20))));   // 48 s loud, then 240 s at -10 dB
  const at = (s) => over(turned, [s - 2, s + 2], 'passage');
  const learned = turned.findIndex((r, s) => s > 48 && over(turned, [s, s + 4], 'passage') >= 0.75);
  console.log(`     volume down 10 dB at 48 s: passage ${f2(at(40))} before, ${f2(at(52))} just after, ${f2(at(108))} a minute on, ${f2(at(168))} two, ${f2(at(228))} three`);
  check(learned > 48 && learned - 48 <= 180, 'the volume turned down 10 dB is learned as the new level within three minutes',
    learned > 48 ? `0.75 reached ${learned - 48} s after` : 'never reached 0.75');
}

// ── A real song, when one is given ────────────────────────────────────────────
if (process.env.BREAKDOWN_SONG) {
  const buf = fs.readFileSync(process.env.BREAKDOWN_SONG);
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const secs = (process.env.BREAKDOWN_SECTIONS ?? '10-26,28-44,46-60').split(',').map((r) => r.split('-').map(Number));
  console.log(`\n${process.env.BREAKDOWN_SONG}: ${(pcm.length / SR).toFixed(0)} s, sections ${secs.map((s) => s.join('–')).join(', ')} (not gated)`);
  table(measure(pcm), secs, ['groove', 'breakdown', 'return']);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
