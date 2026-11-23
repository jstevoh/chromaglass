#!/usr/bin/env node
/**
 * The spinning dish's CPU half (src/lib/turntable.ts, PLAN.md §22), in node:
 * the liquid's lag behind the dish, Auto Spin's rate and its tempo lock, and
 * the hand on the Spin tool. The swirl the solver makes of the same numbers
 * is `npm run dish`.
 *
 *   npm run turntable
 *
 *   1. the drag time h²/12ν at the plate's 2 mm rest gap (PLAN 38r): water
 *      0.33 s, the thick liquid 0.017 s, oil 0.0067 s (it was 3, 0.15 and
 *      0.06 s at the 6 mm gap before);
 *   2. the liquid follows a dish spun up from rest to 63% in one drag time,
 *      the same at 60 and 144 frames a second, and water takes twenty times
 *      as long as the thick liquid;
 *   3. at a steady speed the picture (the liquid) trails the dish by exactly
 *      Ω τ radians, to 2%: the lag the audience sees;
 *   4. Rate is rev/min, either way round, held to ±45;
 *   5. Tempo turns once every N beats: at 120 bpm and 16 beats a turn, 8 s
 *      a turn. The dish, a flywheel on the plate's own drag, is locked to it:
 *      with the tempo wandering ±3%, each turn is 16 beats to 0.03 rad, and
 *      knocked off by a flick it comes back to the beat it was on, where a
 *      motor that only asked for the speed stays knocked off it;
 *   6. Tempo with no tempo heard turns at the Rate, and a tempo once heard is
 *      held when the clock loses the beat;
 *   7. a hand going round at one turn a second, reported at 60 Hz, reads
 *      2π rad/s to 3%, across the ±π seam without a spike; held still it
 *      stops the dish within a fifth of a second; near the middle it reads
 *      nothing; lifted it lets go; a fast swipe past the middle turns the
 *      dish no faster than a hand can, a turn and a half a second;
 *   8. with Auto Spin off and no hand, the turntable is exactly zero, beside
 *      a look's own flywheel swinging with the music;
 *   9. and let go, the dish and its liquid come back to exactly zero, not
 *      for ever nearly.
 *
 * The look's own turning on the same dish (PLAN 22h, dishFrame): its motor,
 * the music routed to rotation and a flick turn the one dish the turntable
 * turns, and the picture turns with the liquid following their sum.
 *
 *  10. a look nobody turns (no motor, no music, no flick, no turntable):
 *      the dish, the liquid and the picture's angle stay exactly zero for ten
 *      minutes, so the change is nothing where nothing turns;
 *  11. a flick on a dish of water: the picture is still while the glass goes
 *      round (under a tenth of the dish's speed after a frame), and comes up
 *      to the dish with the drag time τ: the liquid's speed is the exact
 *      answer for a dish coasting on its bed to 2% at a quarter of τ and at
 *      τ, at 60 and at 144 frames a second. On the thick liquid it is
 *      with the dish within half a second;
 *  12. a look's steady motor: the picture turns at the motor's speed and
 *      ends Ωτ behind where the rigid picture did, to 2%, so a slow look
 *      does not lose its turn, it trails it by a fixed angle;
 *  13. a look's music sway, through the water: the liquid is a first-order
 *      filter of the dish with corner 1/τ, so at a swing every eight seconds
 *      (four bars at 120 bpm) the picture's sway is 1/√(1 + (ωτ)²) of the
 *      dish's, 0.97 on water and 1.00 on the thick liquid at the 2 mm gap
 *      (0.39 and 0.99 at the 6 mm gap before PLAN 38r), to 3%: the
 *      measure of what 22h changes on the nine thin looks with music;
 *  14. the turntable's share reaches the liquid: a look's flick and a
 *      turntable turning half as fast the other way leave the water going
 *      round at the half that is left, with the water's drag time; and a
 *      hand holding a flicked dish still (the turntable exactly against the
 *      look) has the dish at exactly zero every frame and the water at rest,
 *      exactly, when the drag time says, τ ln(2/LIQUID_REST), to a frame;
 *  15. the look's motor holds its way round whatever the band does (PLAN
 *      22j): with a band routed to rotation and gone quiet (every feature
 *      0, a sway of 0.4 − 1.2 = −0.8) acid-trip's dial still turns the dish
 *      forwards at the dial's speed, where the sway used to carry it
 *      backwards; the band's own share is the sway times the push, as it
 *      always was, at any sway; the dial is `v × 0.01` to the bit in its
 *      bottom tenth and has no step at 0.1; and the frame hands the dial
 *      and the band to the motor apart (read from its source, as `npm run
 *      backplate` reads the plate's own motor).
 *  16. on a thin gap each layer's spin drags with the liquid its thin solve
 *      drags with (PLAN 38v-4): spinNu is the Thickness dial's 10^(3t)
 *      mm²/s, not the Viscosity word's, and spinTau is that liquid's
 *      h²/12ν at the 2 mm gap, read from the real step's lastStep;
 *  17. and under its own glass: each layer's spinDrag gives the τ of its
 *      own cover gap (one at 1.5 mm, one at 3 mm), and the frame loop's lag
 *      for layer l is layer l's, not Layer 0's (read from its source).
 *
 * Owed lines. A line for work not built yet is named by its plan id and
 * passed in as `--owed=<ids>` on the run line in scripts/checks.json. An
 * owed line prints " owed" while the code is still in main's state (a
 * state worked out from something the build changes: a missing method, a
 * value read off the step that equals the old wrong one), fails loudly if
 * it passes ("no longer owed: take the id out") so the run line is kept
 * honest, and fails if the build has moved off main's state and still
 * misses. An unknown id is a FAIL, so a typo cannot excuse a line.
 */
import {
  AutoSpin, SpinHand, SPIN_RATE, SPIN_TEMPO, SPIN_OFF, WATER_NU, THICK_NU, OIL_NU,
  carrierViscosity, dishFollow, dishFrame, dragSeconds, liquidFollow, LIQUID_REST, lookMotor, lookMotorRate,
} from '../src/lib/turntable.ts';
import { readFileSync } from 'node:fs';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

const IDS = ['38v-4'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice(7).split(',').filter(Boolean) : []);
for (const id of owed) if (!IDS.includes(id)) check(`--owed names ${id}, which no line here carries`, false, `known: ${IDS.join(', ')}`);
// One line of an item: an ordinary check when the item is not owed; when it is, " owed" only while main's state holds.
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(`${name} (${id})`, ok, detail);
  if (ok) return check(`${name} (${id})`, false, `no longer owed: take ${id} out of --owed — ${detail}`);
  if (!mainState) return check(`${name} (${id})`, false, `built and misses — ${detail}`);
  console.log(` owed  ${name} (${id}) — ${detail}`);
};

// 1
const tw = dragSeconds(WATER_NU), tt = dragSeconds(THICK_NU), to = dragSeconds(OIL_NU);
// h²/12ν at the real sandwich's 2 mm (PLAN 38r), worked here from the millimetres, not from the code's constant.
const rest = 0.002 ** 2 / 12;
check('the drag time at the 2 mm rest gap: water 0.33 s, thick 0.017 s, oil 0.0067 s',
  near(tw, rest / WATER_NU, 0.01) && near(tt, rest / THICK_NU, 0.01) && near(to, rest / OIL_NU, 0.01), `${tw.toFixed(3)}, ${tt.toFixed(3)}, ${to.toFixed(3)} s`);
check('the look\'s Viscosity picks the liquid', carrierViscosity('thin') === WATER_NU && carrierViscosity('thick') === THICK_NU);

// 2
const follow = (tau, fps, seconds) => {
  let w = 0;
  for (let t = 0; t < seconds - 1e-9; t += 1 / fps) w = liquidFollow(w, 2, 1 / fps, tau);
  return w;
};
// Water's drag time, 20 frames at 60 (the thick liquid's is one frame at the 2 mm gap, too short to see a curve in).
const at60 = follow(tw, 60, tw), at144 = follow(tw, 144, tw);
check('the liquid reaches 63% of the dish in one drag time', near(at60, 2 * (1 - Math.exp(-1)), 0.03), `${(at60 / 2).toFixed(3)} of the dish at 60 fps`);
check('and the frame rate does not change it', near(at144, at60, 0.03), `${(at144 / 2).toFixed(3)} at 144 fps`);
const reach = (tau) => { let w = 0, t = 0; while (w < 2 * (1 - Math.exp(-1)) && t < 60) { w = liquidFollow(w, 2, 1 / 240, tau); t += 1 / 240; } return t; };
check('water takes twenty times as long as the thick liquid', near(reach(tw) / reach(tt), 20, 0.03), `${(reach(tw) / reach(tt)).toFixed(1)}×`);

// 3
{
  let w = 0, dishA = 0, liqA = 0;
  const O = 1.2;
  // The liquid's angle as the frame turns the picture, exactly over each frame (dishFrame's turn), not its speed at the frame's end times the frame.
  for (let k = 0; k < 60 * 30; k++) { const f = dishFrame(O, 0, w, 1 / 60, tw); w = f.liquid; dishA += O / 60; liqA += f.turn; }
  check('at a steady speed the picture trails the dish by Ω τ', near(dishA - liqA, O * tw, 0.02), `${(dishA - liqA).toFixed(3)} rad, Ω τ = ${(O * tw).toFixed(3)}`);
}

// 4
{
  const a = new AutoSpin();
  const six = a.target(SPIN_RATE, 6, 16, null, 0), back = a.target(SPIN_RATE, -6, 16, null, 0), top = a.target(SPIN_RATE, 90, 16, null, 0);
  check('Rate is rev/min: 6 is 0.628 rad/s', near(six, 2 * Math.PI * 6 / 60, 1e-9), six.toFixed(4));
  check('either way round', back === -six);
  check('held to 45', near(top, 2 * Math.PI * 45 / 60, 1e-9));
  check('Off asks for nothing', a.target(SPIN_OFF, 6, 16, null, 0) === 0);
}

// 5
{
  /*
    A real clock wanders: a band drifts a few per cent over a song, and the
    beat clock follows it. So the period here swings ±3% over twenty
    seconds, and at 70 s the dish is knocked (a flick, 0.5 rad/s). A motor
    that asks only for the speed keeps the rate and loses the beat: the
    knock is never taken back. The lock takes it back.
  */
  const D = (0.04 + 0.25 * 1.2) * 1.7;   // the frame's dragRate at the default Plate Drag, thick, no pressure
  const run = (lock) => {
    const a = new AutoSpin();
    let vel = 0, ang = 0, nowMs = 0, next = 500, period = 500, knocked = false;
    const dt = 1 / 60;
    const beats = [];
    for (let k = 0; k < 60 * 120; k++) {
      nowMs += dt * 1000;
      period = 500 * (1 + 0.03 * Math.sin((2 * Math.PI * nowMs) / 20000));
      while (next <= nowMs) { beats.push({ ms: next, ang: ang + vel * (next - nowMs) / 1000 }); next += period; }
      const tempo = { periodMs: period, nextBeatMs: next, nowMs };
      const motor = lock ? a.target(SPIN_TEMPO, 6, 16, tempo, ang) : (2 * Math.PI * 1000) / (period * 16);
      vel = dishFollow(vel, motor, D, dt);
      if (!knocked && nowMs > 70000) { vel += 0.5; knocked = true; }
      ang += vel * dt;
    }
    // Each turn over the last half minute: the angle 16 beats on, less a whole turn.
    let worst = 0;
    const late = beats.filter((b) => b.ms > 90000);
    for (let k = 16; k < late.length; k++) worst = Math.max(worst, Math.abs(late[k].ang - late[k - 16].ang - 2 * Math.PI));
    // And whether the beat still finds the dish where it found it before the knock.
    const before = beats.filter((b) => b.ms > 50000 && b.ms < 70000);
    const phaseOf = (b, k0, list) => b.ang - (list[0].ang + (2 * Math.PI * (k0)) / 16);
    const all = beats;
    const i0 = all.indexOf(before[0]);
    const offs = late.map((b) => phaseOf(b, all.indexOf(b) - i0, before));
    return { worst, kept: Math.max(...offs.map(Math.abs)), rate: vel };
  };
  const locked = run(true), free = run(false);
  check('Tempo turns once every 16 beats at 120 bpm: about 8 s a turn', near(locked.rate, 2 * Math.PI / 8, 0.04), `${locked.rate.toFixed(4)} rad/s`);
  check('each turn of the locked dish is 16 beats, while the tempo wanders ±3%', locked.worst < 0.03, `${locked.worst.toFixed(4)} rad`);
  check('and knocked, it comes back to the beat it was on', locked.kept < 0.05, `${locked.kept.toFixed(4)} rad off, 20 s after`);
  /*
    Turn for turn a motor asking only for the speed does nearly as well
    (0.0105 rad against the lock's 0.0109: the flywheel's 1.7 s lag is short
    against a 20 s swing), so what the lock is for is the knock: the free
    motor keeps the speed and never takes the knock back.
  */
  check('where a motor that only asks for the speed stays knocked off it', free.kept > 0.5,
    `${free.kept.toFixed(3)} rad off the beat (and ${free.worst.toFixed(4)} rad a turn)`);
}

// 6
{
  const a = new AutoSpin();
  const none = a.target(SPIN_TEMPO, 12, 16, null, 0);
  check('Tempo with no tempo heard turns at the Rate', near(none, 2 * Math.PI * 12 / 60, 1e-9), none.toFixed(4));
  a.target(SPIN_TEMPO, 12, 16, { periodMs: 400, nextBeatMs: 1200, nowMs: 1000 }, 0);
  const held = a.target(SPIN_TEMPO, 12, 16, null, 0);
  check('and a tempo once heard is held when the beat drops out', near(held, 2 * Math.PI * 1000 / (400 * 16), 1e-6), `${held.toFixed(4)} rad/s (150 bpm, 16 beats)`);
  check('the direction is the Rate\'s sign', a.target(SPIN_TEMPO, -12, 16, null, 0) < 0);
}

// 7
{
  const h = new SpinHand();
  let t = 0;
  const R = 0.3;
  const at = (phi) => [R * Math.cos(phi), R * Math.sin(phi)];
  h.down('m', ...at(Math.PI - 0.3), t);
  let spike = 0;
  for (let k = 1; k <= 30; k++) {
    t += 1000 / 60;
    h.move('m', ...at(Math.PI - 0.3 + 2 * Math.PI * k / 60), t);
    spike = Math.max(spike, Math.abs(h.rate(t)));
  }
  const going = h.rate(t);
  check('a hand going round at a turn a second reads 2π rad/s', near(going, 2 * Math.PI, 0.03), going.toFixed(3));
  check('across the ±π seam without a spike', spike < 2 * Math.PI * 1.03, `largest ${spike.toFixed(3)}`);
  const still = h.rate(t + 200);
  check('held still, it holds the dish still', Math.abs(still) < 0.05 * 2 * Math.PI, `${still.toFixed(4)} rad/s 0.2 s after it stopped`);
  const c = new SpinHand();
  c.down('c', 0.01, 0, 0); c.move('c', -0.01, 0.001, 16);
  check('near the middle, a hand reads nothing', c.rate(16) === 0);
  h.up('m');
  check('lifted, it lets go', h.rate(t) === null && !h.held);
  // A swipe straight across, 0.6 of the plate in a quarter of a second, passing 0.06 from the middle.
  const sw = new SpinHand();
  let peak = 0;
  for (let k = 0; k <= 15; k++) {
    sw.move('s', -0.3 + 0.6 * k / 15, 0.06, k * 1000 / 60);
    peak = Math.max(peak, Math.abs(sw.rate(k * 1000 / 60)));
  }
  check('a fast swipe across the middle turns the dish no faster than a turn and a half a second', peak <= SpinHand.MAX + 1e-9 && peak > 0.5 * SpinHand.MAX,
    `peak ${peak.toFixed(2)} rad/s, the hand's limit ${SpinHand.MAX.toFixed(2)} (22.4 unheld)`);
  const q = new SpinHand();
  q.move('remote:0', 0.2, 0, 0);
  q.forgetQuiet(400, 250, 'remote:');
  check('a remote finger that went quiet is let go', !q.held);
}

// 8
{
  /*
    With Auto Spin off and no hand, the turntable must stay exactly still, not
    nearly: the frame adds its liquid's turn to the picture's angle every
    frame, and the swirl runs on any speed over 1e-3, so a residue of 1e-17
    from a filter that only approaches zero would be a look changed by a
    feature nobody turned on. Ten minutes at 60 fps, with the look's own
    flywheel beside it swinging with the music as a sound-routed look's does,
    to show the two do not leak into each other.
  */
  const a = new AutoSpin();
  let dish = 0, look = 0, angle = 0;
  const D = (0.04 + 0.25 * 1.2) * 0.8;
  for (let k = 0; k < 60 * 600; k++) {
    look = dishFollow(look, 0.03 * Math.sin(k / 40), D, 1 / 60);
    dish = dishFollow(dish, a.target(SPIN_OFF, 6, 16, { periodMs: 500, nextBeatMs: 1000, nowMs: 900 }, angle), D, 1 / 60);
    angle += dish / 60;
  }
  check('with Auto Spin off and no hand, the turntable stays exactly still', dish === 0 && angle === 0,
    `turntable ${dish}, its angle ${angle}, beside a look swinging to ${look.toFixed(4)} rad/s`);
}

// 9
{
  // A hand spins the dish up and lets go: the turntable and the water it drags come back to exactly rest.
  const D = (0.04 + 0.25 * 1.2) * 0.8;
  let dish = 3, liq = 2, t = 0;
  while ((dish !== 0 || liq !== 0) && t < 600) {
    dish = dishFollow(dish, 0, D, 1 / 60);
    liq = liquidFollow(liq, dish, 1 / 60, tw);
    t += 1 / 60;
  }
  check('let go, the dish and its water come to rest exactly, not for ever nearly', dish === 0 && liq === 0 && t < 120,
    `at rest after ${t.toFixed(1)} s`);
}

// The look's turning on the same dish (PLAN 22h).
// A thin look's bed at the default Plate Drag with the glass not pressed (the
// flywheel in LiquidVisualizer: (0.04 + spinDrag 1.2) × 0.8 for thin, times
// 1 + Plate Pressure × 0.8, here 0). Used only against itself.
const BED = (0.04 + 0.25 * 1.2) * 0.8;

// 10
{
  let look = 0, liq = 0, angle = 0, worst = 0;
  for (let k = 0; k < 60 * 600; k++) {
    look = dishFollow(look, 0, BED, 1 / 60);
    const f = dishFrame(look, 0, liq, 1 / 60, tw);
    liq = f.liquid; angle += f.turn;
    worst = Math.max(worst, Math.abs(f.dish));
  }
  check('a look nobody turns: dish, liquid and picture exactly still for ten minutes', worst === 0 && liq === 0 && angle === 0,
    `dish ${worst}, liquid ${liq}, angle ${angle}`);
}

// 11
{
  /*
    The exact answer for the liquid behind a coasting dish. The flick sets the
    look's flywheel to Ω0 and its bed takes it down as e^(−Dt) (the dry
    friction's last grip is too small to matter in three seconds); the liquid,
    dω/dt = (Ω − ω)/τ from rest, is then Ω0 (e^(−Dt) − e^(−t/τ)) / (1 − Dτ).
  */
  const O0 = 2 * Math.PI * 0.6 * 0.5;   // a flick at the default Spin Impulse
  const exact = (t, tau) => O0 * (Math.exp(-BED * t) - Math.exp(-t / tau)) / (1 - BED * tau);
  const run = (fps, seconds, tau) => {
    let look = O0, liq = 0;
    const n = Math.round(seconds * fps);
    for (let k = 0; k < n; k++) {
      // The frame's order: the flywheel coasts, then the liquid follows it.
      look = dishFollow(look, 0, BED, 1 / fps);
      liq = dishFrame(look, 0, liq, 1 / fps, tau).liquid;
    }
    return { look, liq };
  };
  const early = run(60, 1 / 60, tw);
  check('a flick on water: the picture stays put while the glass goes round', early.liq < 0.1 * early.look,
    `liquid ${early.liq.toFixed(3)} against the dish's ${early.look.toFixed(3)} rad/s after a frame`);
  const errs = [];
  // A quarter and one drag time of water at the 2 mm gap (1 s and 3 s at the 6 mm gap before PLAN 38r), whole frames at both rates.
  for (const fps of [60, 144]) for (const t of [1 / 12, 1 / 3]) {
    const got = run(fps, t, tw).liq, want = exact(t, tw);
    errs.push(Math.abs(got - want) / want);
  }
  const worst = Math.max(...errs);
  check('and comes up to the dish with the water\'s drag time, at any frame rate', worst < 0.02,
    `worst ${(100 * worst).toFixed(2)}% off the exact answer at 1/12 s and 1/3 s, 60 and 144 fps; at 1/3 s ${run(60, 1 / 3, tw).liq.toFixed(3)} of ${run(60, 1 / 3, tw).look.toFixed(3)} rad/s`);
  /*
    And the picture's angle, which is what the room sees: the liquid's speed
    integrated over each frame exactly, so a frame that took a quarter of a
    second turns it as far as fifteen frames of a sixtieth do. Held to the
    exact answer for a dish at a steady Ω from rest, Ω T − τ ω_l(T). Taken as
    the speed at the frame's end times its length, the four-frames-a-second
    picture read 11% ahead after 2 s; CI's Mac drew a 0.46 s frame while the
    shaders were still building and the flick turned the water twice as far.
  */
  const angleAt = (fps) => {
    let liq = 0, a = 0;
    for (let k = 0; k < Math.round(2 * fps); k++) { const f = dishFrame(1.8, 0, liq, 1 / fps, tw); liq = f.liquid; a += f.turn; }
    return a;
  };
  const exactAngle = 1.8 * 2 - tw * 1.8 * (1 - Math.exp(-2 / tw));
  const a60 = angleAt(60), a4 = angleAt(4);
  check('the picture turns as far at four frames a second as at sixty, the exact angle', near(a60, exactAngle, 1e-6) && near(a4, exactAngle, 1e-6),
    `${a60.toFixed(5)} and ${a4.toFixed(5)} rad after 2 s, exactly ${exactAngle.toFixed(5)}`);
  const thick = run(60, 0.5, tt);
  check('on the thick liquid it is with the dish within half a second', thick.liq > 0.95 * thick.look,
    `${(thick.liq / thick.look).toFixed(3)} of the dish's speed`);
}

// 12
{
  // acid-trip's motor, the fastest a shipped look asks for (Rotation Speed
  // 0.421 since PLAN 22j moved its stir onto the dish; 0.1 × 0.01 rad/s before).
  const M = lookMotorRate(0.421);
  let look = 0, liq = 0, rigid = 0, angle = 0;
  for (let k = 0; k < 60 * 120; k++) {
    look = dishFollow(look, M, BED, 1 / 60);
    const f = dishFrame(look, 0, liq, 1 / 60, tw);
    liq = f.liquid; angle += f.turn; rigid += look / 60;
  }
  check('a look\'s steady motor: the picture turns at its speed and trails the rigid picture by Ωτ',
    near(liq, M, 1e-6) && near(rigid - angle, M * tw, 0.02), `${(rigid - angle).toFixed(5)} rad behind, Ωτ = ${(M * tw).toFixed(5)}`);
}

// 13
{
  const sway = (tau, period = 8) => {
    // The dish swung every eight seconds; amplitudes read over the last of
    // 60 s, once the start has died away. The dish's speed itself, not the
    // motor's: the flywheel's dry friction bends a sine near its zeros, and
    // what is measured here is the liquid's filter, not the flywheel's.
    const w = 2 * Math.PI / period, fps = 60;
    let liq = 0, aDish = 0, aLiq = 0;
    for (let k = 0; k < fps * 60; k++) {
      const t = k / fps;
      const look = 0.03 * Math.sin(w * t);
      liq = dishFrame(look, 0, liq, 1 / fps, tau).liquid;
      if (t > 52) { aDish = Math.max(aDish, Math.abs(look)); aLiq = Math.max(aLiq, Math.abs(liq)); }
    }
    return { ratio: aLiq / aDish, want: 1 / Math.sqrt(1 + (w * tau) ** 2) };
  };
  const water = sway(tw), thick = sway(tt);
  /*
    At the 2 mm gap water's τ is a third of a second, so an eight-second swing
    comes through at 0.97 and a sway with no filter at all (1.0) is only 3.4%
    off it: the line below would barely tell them apart. A swing every two
    seconds (a bar at 120 bpm), ωτ ≈ 1, is where the filter shows: 0.69.
  */
  const quick = sway(tw, 2);
  check('and a sway every two seconds through water is cut to 1/√(1 + (ωτ)²), well short of the dish\'s', near(quick.ratio, quick.want, 0.03) && quick.ratio < 0.8,
    `${quick.ratio.toFixed(3)} of the dish's sway, want ${quick.want.toFixed(3)}`);
  check('a look\'s music sway through water is filtered by its drag time', near(water.ratio, water.want, 0.03),
    `${water.ratio.toFixed(3)} of the dish's sway, 1/√(1 + (ωτ)²) = ${water.want.toFixed(3)}`);
  check('and through the thick liquid hardly at all', near(thick.ratio, thick.want, 0.03) && thick.ratio > 0.98,
    `${thick.ratio.toFixed(3)}, want ${thick.want.toFixed(3)}`);
}

// 14
{
  // A look flicked to Ω0 and a turntable held at −Ω0/2: the water goes to Ω0/2.
  let liq = 0;
  for (let k = 0; k < Math.round(60 * tw); k++) liq = dishFrame(1.2, -0.6, liq, 1 / 60, tw).liquid;
  check('the turntable\'s share reaches the same liquid', near(liq, 0.6 * (1 - Math.exp(-1)), 0.02),
    `${liq.toFixed(4)} rad/s after one drag time, the drag time says ${(0.6 * (1 - Math.exp(-1))).toFixed(4)}`);

  // A flicked plate, and a hand holding the glass still: the turntable is
  // exactly against the look (held = 0), the dish exactly zero.
  let look = 3, l2 = 2, t = 0, moved = 0;
  while (l2 !== 0 && t < 120) {
    look = dishFollow(look, 0, BED, 1 / 60);
    const f = dishFrame(look, -look, l2, 1 / 60, tw);
    if (f.dish !== 0) moved++;
    l2 = f.liquid;
    t += 1 / 60;
  }
  const want = tw * Math.log(2 / LIQUID_REST);
  check('a hand holding a flicked dish still: the dish is still and the water comes to rest when its drag time says',
    moved === 0 && l2 === 0 && Math.abs(t - want) < 1 / 60 + 1e-9,
    `${moved} frames the dish moved; at rest after ${t.toFixed(2)} s, τ ln(2/LIQUID_REST) = ${want.toFixed(2)} s`);
}

// 15
{
  const rate = lookMotorRate(0.421);
  // acid-trip's band (energy) gone quiet: rotationMod = 0, sway (0 − 0.4) × 3 + 0.4.
  const quiet = lookMotor(rate, 1, 0, 0.4 + (0 - 0.4) * 3);
  check('a look\'s motor turns its dish its own way round when the band routed to rotation goes quiet',
    quiet === rate && rate > 0.3, `${quiet.toFixed(4)} rad/s, the dial's ${rate.toFixed(4)} (the sway alone would have made it ${(rate * -0.8).toFixed(4)})`);
  let worst = 0;
  for (const music of [0, 0.002, 0.013, 0.05]) for (const sway of [-0.8, -0.1, 0, 0.4, 1.3, 2.2]) {
    worst = Math.max(worst, Math.abs(lookMotor(0, 1, music, sway) - music * sway), Math.abs(lookMotor(rate, -1, music, sway) - (music * sway - rate)));
  }
  check('and the band\'s own share is its push times its sway, as it always was', worst < 1e-15, `largest difference ${worst}`);
  const low = [0, 0.003, 0.05, 0.1].every((v) => lookMotorRate(v) === v * 0.01);
  check('the dial is v × 0.01 in its bottom tenth and has no step at 0.1', low && near(lookMotorRate(0.1 + 1e-9), 0.001, 1e-6),
    `${lookMotorRate(0.1)} and ${lookMotorRate(0.1 + 1e-9)} rad/s either side of 0.1`);
  const src = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
  /*
    And the frame wires it so. The call's shape alone would pass with the
    sway put back into the motor's way inside the band's block, so every
    assignment to motorWay in the code is read too: it starts as the plate's
    sign and only Spin Direction and the wander may change it.
  */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const ways = [...code.matchAll(/motorWay\s*([*+\-/]?=)\s*([^;]+);/g)].map((m) => `${m[1]} ${m[2].trim()}`);
  const allowed = ['= dirMod', '= 1', '= -1', '*= 1 + w * wander * 3.4'];
  const begin = code.indexOf('let motorWay = dirMod;');
  const band = code.indexOf('if (currentAudioData && currentSettings.audioMappings)', begin);
  check('the frame hands the dial and the band to the motor apart',
    /const motor = lookMotor\(motorRate, motorWay, musicSpeed, dirMod\)/.test(code)
    && /const motorRate = lookMotorRate\(asked\)/.test(code) && !/\btwist\b/.test(code)
    && begin > 0 && band > begin && ways.length === 4 && ways.every((w) => allowed.includes(w)),
    `motorWay set ${ways.length} times: ${ways.join(' · ')}`);
}

// 16 and 17: each layer's spin on its own liquid and its own glass (PLAN 38v-4)
{
  /*
    What the audit found (PLAN 38v-4, from RS-50). The spin's drag is the
    gap's, k = 12ν/h², and its lag behind the glass is τ = h²/12ν: both are
    the one liquid in the one gap the thin solve drags with. The step took
    the spin's ν from the look's Viscosity *word* (carrierViscosity: water,
    1 mm²/s, or the thick liquid, 20 mm²/s) while the thin solve, on every
    look since Thin Gap went on everywhere, drags with the Thickness dial's
    ν, 10^(3t) mm²/s, 22.4 mm²/s at the default 0.45. Nine 'thin' looks
    run on that: water's 1 mm²/s against 22.4, so a lag 22 times too long
    and a swirl 22 times too free. And the frame loop worked every layer's
    lag out at Layer 0's cover gap, so a second plate under a heavier or
    lighter glass lagged at the first one's.

    The law, worked here from the dial and the millimetres and not from the
    code's own functions (a build that changed both the same wrong way
    would otherwise pass):

        ν(t) = 10⁻⁶ · 10^(3t) m²/s        (water at 0, glycerine at 1)
        τ    = h² / (12 ν)                  (plane Poiseuille drag between two glasses)

    The step is the real FluidSimulation's on its CPU path, bundled here as
    `npm run musicstir` bundles it, so what is read is the spinNu and
    spinTau the GPU is handed (lastStep), not a function the step might not
    call. Two layers that differ in word and dial both ways round, and no
    dial at 0, where water's 1 mm²/s is the word's too and a step reading
    the word would pass by coincidence.

    A build that only imitates this cannot pass it: a spinNu scaled to look
    right on the default look misses the second layer's dial; a τ fixed
    for the dial but at the rest gap misses line 17's glasses; and a frame
    loop still reading Layer 0 is read off its source (node never runs the
    frame loop, as `npm run musicstir` says of its side doors).

    The API the build adds (named here, so the line below can call it):

        FluidSimulation.prototype.spinDrag(settings: VisualizerSettings)
          → { nu: number, gap: number, tau: number }

      nu  m²/s, the liquid the thin solve drags with on a thin gap
          (thinGapViscosity(settings.gapThickness)), the word's
          (carrierViscosity) with Thin Gap off;
      gap metres, this layer's own cover gap (this.gpu.coverMetres; the
          2 mm rest gap with no solver attached);
      tau seconds, gap² / (12 nu).

    deriveStep's spinNu and spinTau are its nu and tau, and the frame
    loop's dishFrame for layer l takes fluidsRef.current[l].spinDrag(...).tau.
  */
  globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  globalThis.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  globalThis.GPUMapMode = { READ: 1, WRITE: 2 };
  globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  const { build } = await import('esbuild');
  const { pathToFileURL } = await import('node:url');
  const out = 'node_modules/.cache/turntable-sim.mjs';
  await build({
    stdin: {
      contents: "export { FluidSimulation } from './src/sim/fluidSimulation';\nexport { DEFAULT_SETTINGS } from './src/types';",
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
  });
  const { FluidSimulation, DEFAULT_SETTINGS } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
  const nuOf = (t) => 1e-6 * 10 ** (3 * t);          // the Thickness dial, m²/s
  const tauOf = (h, nu) => (h * h) / (12 * nu);      // h in metres
  const H = 0.002;                                   // the sandwich's rest gap (PLAN 38r)
  const WORD = { thin: 1e-6, thick: 2e-5 };          // what the Viscosity word asked for
  const noise = (x, y) => Math.sin(x * 1.7 + 0.3) * Math.cos(y * 1.3 - 0.8);
  const layers = [
    { viscosity: 'thin', gapThickness: 0.45 },       // the default dial under a 'thin' look: the nine looks' case
    { viscosity: 'thick', gapThickness: 0.15 },      // a thick word over a thin dial: the mismatch the other way
  ];
  const stepped = layers.map((o, l) => {
    const sim = new FluidSimulation(48, 0, 0, 0.1);
    sim.layerIndex = l;
    const s = { ...DEFAULT_SETTINGS, ...o, thinGap: 1, layerCount: 2 };
    sim.step(s, 0, noise);
    return { sim, s, o, p: sim.lastStep };
  });
  const nuOk = stepped.every(({ o, p }) => p && p.thinGap > 0 && near(p.spinNu, nuOf(o.gapThickness), 1e-9));
  const nuWord = stepped.every(({ o, p }) => p && p.spinNu === WORD[o.viscosity]);
  line('38v-4', 'on a thin gap each layer\'s spin reads the liquid its thin solve drags with: spinNu = 10^(3t) mm²/s',
    nuOk, stepped.map(({ o, p }) => `${o.viscosity} at Thickness ${o.gapThickness}: ${p ? (p.spinNu * 1e6).toFixed(2) : 'no step'} mm²/s, the dial's ${(nuOf(o.gapThickness) * 1e6).toFixed(2)}`).join('; '), nuWord);
  const tauOk = stepped.every(({ o, p }) => p && near(p.spinTau, tauOf(H, nuOf(o.gapThickness)), 1e-6));
  const tauWord = stepped.every(({ o, p }) => p && near(p.spinTau, tauOf(H, WORD[o.viscosity]), 1e-6));
  line('38v-4', 'and its lag is that liquid\'s at the 2 mm gap: spinTau = h²/12ν',
    tauOk, stepped.map(({ o, p }) => `${o.viscosity}: ${p ? (p.spinTau * 1000).toFixed(1) : 'n/a'} ms, h²/12ν ${(tauOf(H, nuOf(o.gapThickness)) * 1000).toFixed(1)} ms`).join('; '), tauWord);

  /*
    17. Each layer its own glass. The cover's gap is the solver's
    (gpu.coverMetres, lib/cover.ts settling the glass on its liquid), so a
    layer stands in for its solver with only the two numbers the gap is
    read by, one glass at 1.5 mm and the other at 3 mm. Neither is the rest
    gap, so a spinDrag that ignores the glass misses both.
  */
  const glasses = [0.0015, 0.003];
  const has = stepped.every(({ sim }) => typeof sim.spinDrag === 'function');
  let dragOk = has;
  const told = [];
  for (let l = 0; l < stepped.length && has; l++) {
    const { sim, s, o } = stepped[l];
    const h = glasses[l];
    const was = sim.gpu;
    sim.gpu = { coverMetres: h, coverUnits: h / (H / 0.03) };
    let d = null;
    try { d = sim.spinDrag(s); } catch (e) { told.push(`layer ${l} threw ${e.message}`); }
    sim.gpu = was;
    const want = tauOf(h, nuOf(o.gapThickness));
    const good = !!d && near(d.nu, nuOf(o.gapThickness), 1e-9) && near(d.gap, h, 1e-9) && near(d.tau, want, 1e-6);
    dragOk &&= good;
    told.push(`layer ${l} under ${h * 1000} mm: ${d ? `${(d.tau * 1000).toFixed(2)} ms` : 'nothing'}, h²/12ν ${(want * 1000).toFixed(2)} ms`);
  }
  line('38v-4', 'each layer reads its own glass: spinDrag gives each layer the τ of its own cover gap',
    dragOk, has ? told.join('; ') : 'no spinDrag on the layer (the API this line names)', !has);
  const viz = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // The statement the frame loop's dishFrame takes its lag from: from the last `const tau =` before it.
  const at = viz.indexOf('dishFrame(spinVelRef.current[l]');
  const from = viz.lastIndexOf('const tau =', at), stmt = from >= 0 && at > from ? viz.slice(from, viz.indexOf(';', from) + 1) : '';
  const loopOk = /fluidsRef\.current\[l\]\??\.spinDrag\(/.test(stmt) && !/fluidsRef\.current\[0\]/.test(stmt) && !/carrierViscosity/.test(stmt);
  const loopMain = /fluidsRef\.current\[0\]\?*\.gpu\?*\.coverUnits/.test(stmt) && /carrierViscosity\(/.test(stmt);
  line('38v-4', 'and the frame loop\'s lag for layer l is layer l\'s spinDrag, not Layer 0\'s glass and the word\'s liquid',
    loopOk, stmt ? stmt.replace(/\s+/g, ' ').trim() : 'no dishFrame for layer l found', loopMain);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
