#!/usr/bin/env node
/**
 * Does a played melody draw itself across the plate?
 *
 *   npm run melody        (node only)
 *
 * PLAN 24.3-place. What this asserts is the feature, not a moment of a plate:
 * a tune of known notes goes through the real analyser's arithmetic
 * (`analysePcm`, as the show's ear reads it) and the walk (lib/melodyWalk.ts)
 * hears the readings the way the visualizer's loop does, and what comes out
 * is the drops it would let go of.
 *
 *   1. A rising scale of 17 notes, a kick under it on every beat: one drop per
 *      note the ear called (not one per kick), each on the note that was
 *      played (within a semitone), and across the plate in pitch order: the
 *      x of the drops never goes backward, and the top note is more than half
 *      the line away from the bottom one.
 *   2. Why a drop waits for its pitch: the same readings placed on the onset's
 *      own reading put a good share of the drops on the note before. The
 *      waiting version has to be the better one by a margin, or the wait is
 *      doing nothing.
 *   3. A kick and a snare alone lay nothing, and the walk counts the note
 *      onsets the drums called, so the rule is seen working.
 *   4. A hard note is a bigger drop than a soft one (the strength it carries),
 *      and a tune that returns to a note returns to its place.
 *   5. At thirty readings a second the median takes twice as long to turn, and
 *      the reading says so (`pitchSettleS`); the drops are still on the notes.
 *   6. Silence, and no reading, lay nothing; every drop is on the plate; every
 *      look's line is on the plate and the two named looks have their own.
 */
import { analysePcm } from '../src/lib/audioFeatures.ts';
import { MelodyWalk, MELODY_LINES, DEFAULT_MELODY_LINE, melodyLine, fifthsPlace, SCALE_LOW, SCALE_HIGH } from '../src/lib/melodyWalk.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS } from '../src/presets.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');

const SR = 44100;
/** How near a drop's pitch must be to the played note: the analyser's bins are 43 Hz, a semitone and a half at 300 Hz. */
const TOL = 1.5;

/** A plucked note: five harmonics, a 10 ms attack, a two-second-ish decay, so the next one is a new arrival. */
function tone(pcm, t0, dur, midi, amp) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const n0 = Math.round(t0 * SR), n1 = Math.min(pcm.length, Math.round((t0 + dur) * SR));
  for (let n = n0; n < n1; n++) {
    const t = (n - n0) / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 2.5);
    let s = 0;
    for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
    pcm[n] += amp * env * s * 0.4;
  }
}
/** A kick: a 60 Hz sine falling to 45 Hz and a click, 150 ms. */
function kick(pcm, t0, amp = 0.9) {
  const n0 = Math.round(t0 * SR), n1 = Math.min(pcm.length, n0 + Math.round(0.15 * SR));
  let ph = 0;
  for (let n = n0; n < n1; n++) {
    const t = (n - n0) / SR;
    ph += 2 * Math.PI * (45 + 80 * Math.exp(-t * 30)) / SR;
    pcm[n] += amp * Math.exp(-t * 18) * Math.sin(ph);
  }
}
/** A snare: noise through a 1.5 to 5 kHz crack and a 190 Hz body, 120 ms. */
function snare(pcm, t0, amp = 0.7, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; };
  const n0 = Math.round(t0 * SR), n1 = Math.min(pcm.length, n0 + Math.round(0.12 * SR));
  let lp = 0;
  for (let n = n0; n < n1; n++) {
    const t = (n - n0) / SR;
    lp += (rnd() - lp) * 0.6;
    pcm[n] += amp * Math.exp(-t * 28) * ((rnd() - lp) * 1.4 + 0.4 * Math.sin(2 * Math.PI * 190 * t));
  }
}

/** The loop's way of hearing: every reading in turn, or only every `every`th, as a plate drawing slower than the ear is handed. */
function walkOver(readings, { every = 1, settle = true, line = DEFAULT_MELODY_LINE } = {}) {
  const walk = new MelodyWalk();
  const drops = [];
  readings.forEach((r, i) => {
    if (i % every) return;
    // The un-waiting variant: say the pitch is settled the moment the onset lands.
    const heard = settle ? r : { ...r, pitchSettleS: 0 };
    for (const d of walk.update(heard, line)) drops.push(d);
  });
  return { walk, drops };
}

/** Which played note a drop belongs to: the one whose start is the last at or before the drop's onset. */
function noteOf(drop, notes) {
  let best = null;
  for (const n of notes) if (n.t <= drop.at + 0.1 && (!best || n.t > best.t)) best = n;
  return best;
}

// ── 1. A scale, a kick under it ────────────────────────────────────────────

console.log('A rising scale with a kick on the beat');
const SCALE = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];
const notes = SCALE.map((m, i) => ({ t: 0.3 + i * 0.5, m }));
const pcm = new Float32Array(SR * (SCALE.length * 0.5 + 1));
for (const n of notes) tone(pcm, n.t, 0.5, n.m, 0.6);
// Kicks at 120 bpm a fifth of a second before each note, and a snare on the backbeat: close to the notes but never the same moment.
for (let t = 0.2; t < pcm.length / SR - 0.3; t += 0.5) kick(pcm, t);
for (let t = 0.65; t < pcm.length / SR - 0.3; t += 1.0) snare(pcm, t);
const r60 = analysePcm(pcm, SR, 60);
const { walk, drops } = walkOver(r60);
const placed = drops.map((d) => ({ d, n: noteOf(d, notes) }));
const right = placed.filter(({ d, n }) => n && Math.abs(d.pitch - n.m) <= TOL).length;
const kicks = Math.floor((pcm.length / SR - 0.5) / 0.5);
check('one drop for more than half the notes, never one per kick',
  drops.length > SCALE.length / 2 && drops.length <= SCALE.length, `${drops.length} drops for ${SCALE.length} notes and ${kicks} kicks`);
check('each drop is on the note that was played (within a semitone and a half)',
  right >= drops.length * 0.9, `${right} of ${drops.length}`);
const xs = drops.map((d) => d.x);
const backward = xs.filter((x, i) => i > 0 && x < xs[i - 1] - 1e-9).length;
check('they step across the plate in pitch order: x never goes back',
  backward === 0, `${backward} steps back of ${xs.length - 1}; x ${xs.map(f2).join(' ')}`);
const run = Math.max(...xs) - Math.min(...xs);
check('the top of the scale is over half the line from the bottom',
  run > 0.5 * (DEFAULT_MELODY_LINE.x1 - DEFAULT_MELODY_LINE.x0), `${f2(run)} of ${f2(DEFAULT_MELODY_LINE.x1 - DEFAULT_MELODY_LINE.x0)}`);

// ── 2. Why a drop waits ────────────────────────────────────────────────────

console.log('\nWhy a drop waits for its pitch');
const eager = walkOver(r60, { settle: false });
const eagerRight = eager.drops.filter((d) => { const n = noteOf(d, notes); return n && Math.abs(d.pitch - n.m) <= TOL; }).length;
check('read on the onset itself, the pitch is the note before more often than not',
  eagerRight < eager.drops.length * 0.7 && right - eagerRight >= 4,
  `placed on the onset: ${eagerRight} of ${eager.drops.length} on the note; after the settle: ${right} of ${drops.length}`);

// ── 3. Drums are not notes ─────────────────────────────────────────────────

console.log('\nDrums alone');
const dpcm = new Float32Array(SR * 8);
for (let t = 0.2; t < 7.5; t += 0.5) kick(dpcm, t);
for (let t = 0.45; t < 7.5; t += 1.0) snare(dpcm, t);
const drummed = walkOver(analysePcm(dpcm, SR, 60));
check('a kick and a snare lay no drops', drummed.drops.length === 0, `${drummed.drops.length} drops in 8 s of drums`);
check('the walk saw note onsets and gave them to the drums', drummed.walk.drummed > 0, `${drummed.walk.drummed} given to a drum`);

// ── 4. Strength and return ─────────────────────────────────────────────────

console.log('\nHard and soft, and coming back');
const tune = [{ m: 60, a: 0.15 }, { m: 67, a: 0.6 }, { m: 72, a: 0.15 }, { m: 67, a: 0.6 }, { m: 60, a: 0.15 }, { m: 72, a: 0.6 }];
const tpcm = new Float32Array(SR * (tune.length * 0.6 + 1));
const tnotes = tune.map((n, i) => ({ t: 0.3 + i * 0.6, m: n.m }));
tune.forEach((n, i) => tone(tpcm, tnotes[i].t, 0.6, n.m, n.a));
const t = walkOver(analysePcm(tpcm, SR, 60));
const by = (m) => t.drops.filter((d) => { const n = noteOf(d, tnotes); return n && n.m === m; });
const soft = t.drops.filter((d) => { const n = noteOf(d, tnotes); return n && tune.find((q, i) => tnotes[i] === n)?.a === 0.15; });
const hard = t.drops.filter((d) => { const n = noteOf(d, tnotes); return n && tune.find((q, i) => tnotes[i] === n)?.a === 0.6; });
const mean = (a) => a.reduce((s, d) => s + d.strength, 0) / Math.max(1, a.length);
check('a hard note is a bigger drop than a soft one',
  soft.length > 0 && hard.length > 0 && mean(hard) > mean(soft) + 0.05, `soft ${f2(mean(soft))} (${soft.length}), hard ${f2(mean(hard))} (${hard.length})`);
const g = by(67);
check('a note it comes back to is a place it comes back to',
  g.length === 2 && Math.abs(g[0].y - g[1].y) < 1e-9, `G at y ${g.map((d) => f2(d.y)).join(' and ')}`);
check('notes a fifth apart sit nearer the line than notes a tritone apart',
  Math.abs(fifthsPlace(0) - fifthsPlace(7)) === 1 && Math.abs(fifthsPlace(0) - fifthsPlace(6)) === 6);

// ── 5. A slower ear ────────────────────────────────────────────────────────

console.log('\nThirty readings a second');
const r30 = analysePcm(pcm, SR, 30);
const settle30 = r30[r30.length - 1].pitchSettleS, settle60 = r60[r60.length - 1].pitchSettleS;
check('the reading says how long the median takes, and it follows the ear\'s rate',
  Math.abs(settle60 - 8 / 60) < 0.01 && Math.abs(settle30 - 8 / 30) < 0.02, `${f2(settle60)} s at 60, ${f2(settle30)} s at 30`);
const slow = walkOver(r30);
const slowRight = slow.drops.filter((d) => { const n = noteOf(d, notes); return n && Math.abs(d.pitch - n.m) <= TOL; }).length;
check('at thirty a second the drops are still on the notes',
  slow.drops.length >= 10 && slowRight >= slow.drops.length * 0.85, `${slowRight} of ${slow.drops.length}`);

// ── 6. Nothing to hear, and the plate's edges ──────────────────────────────

console.log('\nSilence, and the lines');
const quiet = walkOver(analysePcm(new Float32Array(SR * 3), SR, 60));
const none = new MelodyWalk();
check('silence lays nothing', quiet.drops.length === 0);
check('no reading lays nothing, and forgets an armed note', none.update(null).length === 0);
check('every drop is on the plate', drops.every((d) => d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1 && d.strength >= 0 && d.strength <= 1));
const onPlate = (l) => [l.x0, l.y0, l.x1, l.y1].every((v) => v >= 0.05 && v <= 0.95) && l.spread >= 0 && l.spread <= 0.5;
check('every line is on the plate', onPlate(DEFAULT_MELODY_LINE) && Object.values(MELODY_LINES).every(onPlate));
const ids = new Set(PRESETS.map((p) => p.id));
check('the named looks are real looks and have their own line',
  ['aurora-borealis', 'oil-and-water'].every((id) => ids.has(id) && melodyLine(id) === MELODY_LINES[id]) && melodyLine('classic') === DEFAULT_MELODY_LINE);
const walkers = PRESETS.filter((p) => (p.settings.melodyWalk ?? 0) > 0).map((p) => p.id);
check('Melody Walk is set on Aurora Borealis and Oil & Water and on no other look yet',
  walkers.length === 2 && walkers.includes('aurora-borealis') && walkers.includes('oil-and-water'), walkers.join(', '));

// ── 7. The plate lays them ─────────────────────────────────────────────────

console.log('\nThe plate');
/*
  The walk's drops are laid by the visualizer, which a node run cannot drive
  (the app's loop needs a GPU the cloud lacks, and at software speed its steps
  are a twentieth of the Mac's). So the wiring is read from the source, as
  `npm run panel` reads the tools': the walk hears every reading, queues only
  while the dial is up, lays on the plate the music plays, with the dye under
  the look's fill and the dial's gain on the drop, and is forgotten on a render.
*/
const vis = readFileSync(join(process.cwd(), 'src/components/LiquidVisualizer.tsx'), 'utf8');
const lay = vis.slice(vis.indexOf('const layMelodyDrop'), vis.indexOf('/** Pour into an area'));
check('the walk hears every reading and queues only while Melody Walk is up',
  /melodyWalkRef\.current\.update\(heard, melodyLineRef\.current\)/.test(vis) && /\(currentSettings\.melodyWalk \?\? 0\) > 0/.test(vis));
check('a drop is laid on the active plate as a dropper drop, its dye held under the look\'s fill and sized by the dial and the note',
  /fluid\.autoInject\('drop'/.test(lay) && /room > 0\.001/.test(lay) && /gain \* \(0\.3 \+ 0\.7 \* d\.strength/.test(lay) && /activeLayerRef\.current, d, melodyLineRef\.current, gain, room/.test(vis));
check('the line\'s own liquid, or the look\'s draw, is poured where it lands',
  /pourLiquid\(fluid, line\.liquid/.test(lay) && /doseLiquid\(fluid, liquidsOf\(layer\)/.test(lay));
check('a render starts the walk afresh, and a look takes its own line', /melodyWalkRef\.current\.reset\(\)/.test(vis) && (vis.match(/melodyLineRef\.current = melodyLine\(presetId\)/g) ?? []).length === 2);
check('Melody Walk is 0 by default, so no look but the two written for it changes', DEFAULT_SETTINGS.melodyWalk === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
