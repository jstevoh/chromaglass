#!/usr/bin/env node
/**
 * Do the two Tilt knobs tip the plate the way a hand would? (PLAN 18a-13m)
 *
 *   npm run handtilt
 *
 * What was asked. The owner, 2026-11-15: "I want to be able to control the
 * tilt of the plate from my midi controller. Maybe two knobs?" The feature is
 * two settings, Tilt Left/Right and Tilt Up/Down (`plateTiltX`, `plateTiltY`),
 * that MIDI learns like any other, and lib/handTilt.ts, which turns where the
 * knobs are into the tilt the frame loop hands the solver, beside the remote
 * phone's. So this asserts what a knob does to that tilt, in node, on the same
 * functions the frame loop calls:
 *
 *   level      a knob at its middle (CC 64, and a hand's few steps either
 *              side) leaves the plate level, exactly, so a knob left alone
 *              for a set does not drain the plate to one edge;
 *   reach      a full knob tips the plate to Plate Rock's strong swing, rock 2
 *              (KNOB_ROCK, PLAN 18a-13n), past the phone's full tip (1.1),
 *              at the same sinθ plateSin gives that swing; the steps near
 *              level are as fine as they were, and no step tips it back;
 *   eased      a knob thrown end to end in one message moves the plate
 *              there over a hand's time, not in a step: its first sixtieth of
 *              a second moves it less than a fiftieth of the way, it is past
 *              nine tenths by 0.4 s, and it never goes past the knob; and the
 *              same at 30 or 120 steps a second, since the solver's rate
 *              changes under load (the governor) and the plate must not;
 *   signed     up is the right edge (and the top) down, the screen's +x
 *              and +y;
 *   turned     and turned into the dish as Tilt Direction is (downhill() in
 *              sim/fluidSimulation.ts), so on a look whose dish turns, right
 *              is still the screen's right;
 *   joined     the remote phone's tilt adds to it, reaching no further
 *              than the knobs' own corner, the slosh's tilt no further than
 *              the phone's, and the phone still fades out after its last reading;
 *   learnable  MIDI can learn both, over −1..1, they sit in Tilt & Rock, and
 *              neither the sound, the patch bay nor Evolve can move them
 *              (the plate tipped on the beat is the whole picture moving);
 *   no change  at their default (0, and absent in a look saved before them)
 *              each plate gets the hold tilt, rock and slosh tilt the old frame
 *              loop gave it from the phone alone, through tipPlate, the function
 *              the frame loop now calls for every plate.
 *
 * What it cannot see: what the solver does with that tilt. That is the rock's
 * path the phone already took, measured by `npm run rides` (a pool of heavy dye
 * slides down the tipped thin gap), `npm run oillift` (light oil rises the
 * other way) and `npm run slosh`; and how it looks at sixty frames a second is
 * the Mac's.
 */
import { knobTip, makeHandTilt, stepHandTilt, levelHandTilt, tipPlate, TILT_DEAD, KNOB_REACH, KNOB_ROCK } from '../src/lib/handTilt.ts';
import { HOLD_TILT, plateSin, ROCK_LEAN } from '../src/lib/plateRock.ts';
import { LEARNABLE_SETTINGS, soundMappable, valueAt } from '../src/lib/midi.ts';
import { PIN_RANGE, PINNABLE } from '../src/lib/deskPins.ts';
import { PATCH_TARGETS } from '../src/lib/sceneMap.ts';
import { DRIFTABLE } from '../src/lib/drift.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
const NOW = 1000;
const noPhone = { x: 0, y: 0, at: -1e9 };
// A plate as the frame loop hands it the step: stepHandTilt, then tipPlate (LiquidVisualizer's step).
const plate = { plateAngle: 0, tiltX: 0, tiltY: 0, rockX: 0, rockY: 0, extTiltX: 0, extTiltY: 0 };
function step(h, ext, nowS, kx, ky, dt, angle = 0, swingX = 0, swingY = 0) {
  stepHandTilt(h, ext, nowS, kx, ky, dt);
  plate.plateAngle = angle;
  tipPlate(plate, h, swingX, swingY);
  return plate;
}
// A CC's value as the knob's setting, through the same travel MIDI takes (valueAt, curve 1).
const cc = (n) => valueAt(n / 127, -1, 1);

// ── level ──
{
  const mid = [62, 63, 64, 65, 66].map(n => knobTip(cc(n)));
  check('a knob at its middle, and two steps either side, is level', mid.every(v => v === 0), `CC 62–66 → ${mid.map(f3).join(' ')}`);
  check('past the level middle the tip starts from zero, not with a jump', knobTip(TILT_DEAD + 0.01) < 0.02, `just past it → ${knobTip(TILT_DEAD + 0.01).toFixed(4)}`);
  check('a reading that is not a number is level', knobTip(undefined) === 0 && knobTip(NaN) === 0);
}

// ── reach (PLAN 18a-13n) ──
{
  const ends = [knobTip(cc(0)), knobTip(cc(127))];
  check('the ends are a full knob\'s reach either way, past the phone\'s full tip', ends[0] === -KNOB_REACH && ends[1] === KNOB_REACH && KNOB_REACH > 1.5,
    `CC 0 → ${f3(ends[0])}, CC 127 → ${f3(ends[1])} of the phone's full tip`);
  // The plate as the solver takes it, knob held at full until the ease has arrived, no Plate Rock.
  const h = makeHandTilt();
  for (let i = 0; i < 240; i++) step(h, noPhone, NOW, 1, 0, 1 / 60);
  const knobSin = plateSin(plate.tiltX, plate.rockX);
  const phone = makeHandTilt();
  for (let i = 0; i < 2; i++) step(phone, { x: 1, y: 0, at: NOW }, NOW, 0, 0, 1 / 60);
  const phoneSin = plateSin(plate.tiltX, plate.rockX), phoneRock = plate.rockX;
  // Plate Rock at the top of its dial (3) on a full lean with the sway at its crest: its swing, and the sinθ it hands the solver.
  const strong = ROCK_LEAN * 3 * (1 + 0.12 / 0.55);
  const strongSin = plateSin(strong * HOLD_TILT, strong);
  step(h, noPhone, NOW, 1, 0, 1 / 60);
  check('a full knob hands the solver Plate Rock\'s strong swing, rock 2, not the phone\'s 1.1',
    Math.abs(plate.rockX - KNOB_ROCK) < 1e-9 && KNOB_ROCK === 2 && Math.abs(phoneRock - 1.1) < 1e-12,
    `knob rock ${plate.rockX.toFixed(3)}, phone's ${phoneRock.toFixed(3)}, Plate Rock's top ${strong.toFixed(3)}`);
  check('on the same law: the plate\'s sinθ a full knob gives is Plate Rock\'s at that swing, within 2%',
    Math.abs(knobSin / plateSin(KNOB_ROCK * HOLD_TILT, KNOB_ROCK) - 1) < 0.02 && knobSin > phoneSin * 1.7 && knobSin <= strongSin * 1.1,
    `sinθ knob ${knobSin.toFixed(3)} (${(Math.asin(knobSin) * 180 / Math.PI).toFixed(1)}°), phone ${phoneSin.toFixed(3)} (${(Math.asin(phoneSin) * 180 / Math.PI).toFixed(1)}°), Plate Rock at 3 ${strongSin.toFixed(3)}`);
  // The gentle end: where a performer lays a slow drain (a tip under a tenth of the phone's full),
  // each CC step tips no more than it did when full was the phone's.
  const before = (v) => { const a = Math.abs(v); return a <= TILT_DEAD ? 0 : Math.sign(v) * (a - TILT_DEAD) / (1 - TILT_DEAD); };
  let worst = 0, last = 64;
  for (let n = 64; knobTip(cc(n + 1)) < 0.1; n++) { worst = Math.max(worst, (knobTip(cc(n + 1)) - knobTip(cc(n))) / (before(cc(n + 1)) - before(cc(n)) || 1)); last = n + 1; }
  check('near level each CC step tips the plate as finely as before (within 20%)', worst < 1.2 && last > 68, `largest step × the old step ${worst.toFixed(3)} over CC 64–${last}, tips under 0.1`);
  let back = 0, prev = 0;
  for (let n = 64; n <= 127; n++) { const t = knobTip(cc(n)); back = Math.min(back, t - prev); prev = t; }
  check('no step of the knob tips the plate back', back >= 0);
  const at = (f) => knobTip(TILT_DEAD + f * (1 - TILT_DEAD));
  check('half a turn from the middle is gentler than the phone, the last third is past it',
    at(0.5) < 1 && at(0.5) > 0.5 && at(0.7) > 1, `half ${at(0.5).toFixed(3)}, 0.7 ${at(0.7).toFixed(3)} of the phone's full tip`);
}

// ── eased ──
function throwKnob(rate, seconds, to = 1) {
  const h = makeHandTilt();
  const trace = [];
  const steps = Math.round(seconds * rate);
  for (let i = 0; i < steps; i++) {
    step(h, noPhone, NOW, to, 0, 1 / rate);
    trace.push(plate.rockX / 1.1);  // the tip in the phone's units (the slosh's extTiltX stops at the phone's reach)
  }
  return trace;
}
{
  const t60 = throwKnob(60, 1);
  for (let i = 0; i < t60.length; i++) t60[i] /= KNOB_REACH;  // the share of the way to where the knob is
  check('one sixtieth of a second after the throw the plate has hardly moved', t60[0] < 0.02, `${t60[0].toFixed(4)} of the way`);
  check('past nine tenths by 0.4 s', t60[23] > 0.9, `at 0.4 s: ${t60[23].toFixed(3)}`);
  check('never past where the knob is', Math.max(...t60) <= 1 + 1e-12, `most ${Math.max(...t60).toFixed(6)}`);
  // No step bigger than the hand's own pace: the largest change in a sixtieth.
  let most = 0;
  for (let i = 1; i < t60.length; i++) most = Math.max(most, t60[i] - t60[i - 1]);
  check('no step of the plate bigger than a tenth of the travel in a sixtieth', most < 0.1, `largest ${most.toFixed(3)}`);
  const at = (rate) => throwKnob(rate, 0.3).at(-1);
  const a30 = at(30), a60 = at(60), a120 = at(120);
  check('the same plate at 30, 60 and 120 steps a second', Math.abs(a30 - a60) < 1e-9 && Math.abs(a120 - a60) < 1e-9,
    `at 0.3 s: ${a30.toFixed(6)} ${a60.toFixed(6)} ${a120.toFixed(6)}`);
  // And back: let the knob go to the middle, the plate comes level, not past it.
  const h = makeHandTilt();
  for (let i = 0; i < 60; i++) step(h, noPhone, NOW, 1, 0, 1 / 60);
  let least = 1;
  for (let i = 0; i < 120; i++) { step(h, noPhone, NOW, 0, 0, 1 / 60); least = Math.min(least, plate.extTiltX); }
  check('back to the middle, the plate comes level and does not swing past it', least >= -1e-9 && Math.abs(plate.extTiltX) < 1e-3, `after 2 s: ${plate.extTiltX.toExponential(1)}, least ${f3(least)}`);
  levelHandTilt(h);
  check('levelled at once when the show starts over', h.every(v => v === 0));
}

// ── signed ──
{
  const h = makeHandTilt();
  for (let i = 0; i < 60; i++) step(h, noPhone, NOW, 0.5, -0.5, 1 / 60);
  check('Tilt Left/Right up is +x, Tilt Up/Down down is −y', plate.extTiltX > 0.4 && plate.extTiltY < -0.4, `x ${f3(plate.extTiltX)}, y ${f3(plate.extTiltY)}`);
}

// ── turned into the dish ──
{
  // downhill() in sim/fluidSimulation.ts: a screen direction turned back by the dish's angle.
  const downhill = (dx, dy, a) => [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
  let worst = 0, detail = '';
  for (const a of [0, Math.PI / 2, 2.1, -0.7, Math.PI]) {
    const h = makeHandTilt();
    for (let i = 0; i < 120; i++) step(h, noPhone, NOW, 0.7, -0.3, 1 / 60, a);
    const [gx, gy] = downhill(h[0], h[2], a);
    const e = Math.hypot(plate.extTiltX - gx, plate.extTiltY - gy);
    if (e > worst) { worst = e; detail = `dish at ${a.toFixed(2)} rad`; }
  }
  check('a knob\'s tip is turned into the dish as Tilt Direction is, so right stays the screen\'s right', worst < 1e-12, `largest difference ${worst.toExponential(1)}${detail ? `, ${detail}` : ''}`);
  const h = makeHandTilt();
  for (let i = 0; i < 120; i++) step(h, noPhone, NOW, 1, 0, 1 / 60, Math.PI / 2);
  // Both knobs at full on a turning dish: the same tip at every angle, in the screen's direction.
  const lens = [], dirs = [];
  for (const a of [0, Math.PI / 8, Math.PI / 4, 1.3, Math.PI]) {
    const g = makeHandTilt();
    for (let i = 0; i < 120; i++) step(g, noPhone, NOW, 1, 1, 1 / 60, a);
    lens.push(Math.hypot(plate.extTiltX, plate.extTiltY));
    // Back into the screen's axes: the turn undone.
    dirs.push(Math.atan2(plate.extTiltX * Math.sin(a) + plate.extTiltY * Math.cos(a), plate.extTiltX * Math.cos(a) - plate.extTiltY * Math.sin(a)) * 180 / Math.PI);
  }
  check('both knobs at full tip as far at every angle of the dish, toward the same corner of the screen',
    Math.max(...lens) - Math.min(...lens) < 1e-3 && dirs.every(d => Math.abs(d - 45) < 0.1),
    `lengths ${lens.map(v => v.toFixed(3)).join(' ')}, screen direction ${dirs.map(d => d.toFixed(1)).join(' ')}°`);
  step(h, noPhone, NOW, 1, 0, 1 / 60, Math.PI / 2);
  check('the dish turned a quarter: the screen\'s right is the dish\'s −y', Math.abs(plate.rockX) < 1e-6 && plate.rockY < -KNOB_ROCK + 0.01, `rock x ${f3(plate.rockX)}, y ${f3(plate.rockY)}`);
}

// ── joined ──
{
  const h = makeHandTilt();
  const phone = { x: 0.8, y: 0, at: NOW };
  for (let i = 0; i < 120; i++) step(h, { x: 1, y: 1, at: NOW }, NOW, 1, 0.6, 1 / 60);
  // In the phone's units, from the rock (× 1.1) the plate is handed.
  const tip = [plate.rockX / 1.1, plate.rockY / 1.1], reach = Math.hypot(...tip);
  check('the phone and the knobs together reach no further than the knobs\' own corner', Math.abs(reach - KNOB_REACH * Math.SQRT2) < 1e-9 && tip[0] > tip[1],
    `phone (1, 1) + knobs (1, 0.6) → (${f3(tip[0])}, ${f3(tip[1])}), length ${reach.toFixed(4)} of ${(KNOB_REACH * Math.SQRT2).toFixed(4)}`);
  const slosh = Math.hypot(plate.extTiltX, plate.extTiltY);
  check('the slosh\'s tilt stays within the phone\'s reach, in the same direction', Math.abs(slosh - Math.SQRT2) < 1e-9 && Math.abs(plate.extTiltX / plate.extTiltY - tip[0] / tip[1]) < 1e-9,
    `slosh tilt length ${slosh.toFixed(4)}`);
  for (let i = 0; i < 120; i++) step(h, noPhone, NOW, 0.6, 0, 1 / 60);
  step(h, phone, NOW + 3, 0.6, 0, 1 / 60);
  check('the phone fades out after its last reading, and the knob stays', plate.extTiltX === h[0] && h[0] > 0.55, `3 s on: ${f3(plate.extTiltX)}, the knob's own ${f3(h[0])}`);
}

// ── no change ──
{
  // What the frame loop handed each plate before, from the phone alone (LiquidVisualizer before 18a-13m).
  const before = (ext, nowS, swingX, swingY) => {
    const age = nowS - ext.at;
    const k = age < 2.5 ? 1 - Math.max(0, age - 1.5) : 0;
    return [swingX * HOLD_TILT + ext.x * 0.0045 * k, swingY * HOLD_TILT + ext.y * 0.0045 * k,
      swingX + ext.x * 1.1 * k, swingY + ext.y * 1.1 * k, ext.x * k, ext.y * k];
  };
  let worst = 0, ages = [Infinity, -Infinity];
  const h = makeHandTilt();
  for (let i = 0; i < 600; i++) {
    const nowS = NOW + i / 60;
    // Readings up to ±1 each way (setExternalTilt's clamp), from fresh to gone (ages 0 to 3.2 s), on a swinging, turned dish.
    const ext = { x: Math.max(-1, Math.min(1, 1.3 * Math.sin(i / 17))), y: Math.max(-1, Math.min(1, 1.2 * Math.cos(i / 23))), at: nowS - (i % 97) / 30 };
    ages = [Math.min(ages[0], nowS - ext.at), Math.max(ages[1], nowS - ext.at)];
    const sx = 1.5 * Math.sin(i / 11), sy = Math.cos(i / 13);
    const got = step(h, ext, nowS, DEFAULT_SETTINGS.plateTiltX, undefined, 1 / 60, i / 40, sx, sy);
    const want = before(ext, nowS, sx, sy);
    const have = [got.tiltX, got.tiltY, got.rockX, got.rockY, got.extTiltX, got.extTiltY];
    for (let q = 0; q < 6; q++) worst = Math.max(worst, Math.abs(have[q] - want[q]));
  }
  check('at the default (and absent) each plate gets exactly the phone\'s tilt, rock and slosh tilt it got before',
    worst < 1e-15 && DEFAULT_SETTINGS.plateTiltX === 0 && DEFAULT_SETTINGS.plateTiltY === 0,
    `largest difference ${worst.toExponential(1)} over phone ages ${ages[0].toFixed(1)}–${ages[1].toFixed(1)} s`);
}

// ── learnable ──
for (const key of ['plateTiltX', 'plateTiltY']) {
  const l = LEARNABLE_SETTINGS.find(s => s.key === key);
  check(`MIDI learns ${key} over −1..1`, !!l && l.min === -1 && l.max === 1, l ? `${l.label} ${l.min}..${l.max}` : 'not learnable');
  const pin = PINNABLE.find(s => s.key === key);
  check(`${key} sits in Tilt & Rock, on the desks and the phone`, !!pin && pin.section === 'tilt' && PIN_RANGE.get(key)?.min === -1, pin ? `section ${pin.section}` : 'not pinnable');
  check(`neither the sound, the patch bay nor Evolve moves ${key}`,
    !soundMappable(key) && !PATCH_TARGETS.some(s => s.key === key) && !DRIFTABLE.includes(key));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
