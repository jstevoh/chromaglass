#!/usr/bin/env node
/**
 * The spinning dish's CPU half (src/lib/turntable.ts, PLAN.md §22), in node:
 * the liquid's lag behind the dish, Auto Spin's rate and its tempo lock, and
 * the hand on the Spin tool. The swirl the solver makes of the same numbers
 * is `npm run dish`.
 *
 *   npm run turntable
 *
 *   1. the drag time h²/12ν at the plate's 6 mm rest gap: water 3 s, the
 *      thick liquid 0.15 s, oil 0.06 s (the numbers every note quotes);
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
 *      round (under a tenth of the dish's speed after a tenth of a second),
 *      and comes up to the dish with the drag time τ: the liquid's speed is
 *      the exact answer for a dish coasting on its bed to 2% at 1 s and
 *      3 s, at 60 and at 144 frames a second. On the thick liquid it is
 *      with the dish within half a second;
 *  12. a look's steady motor: the picture turns at the motor's speed and
 *      ends Ωτ behind where the rigid picture did, to 2%, so a slow look
 *      does not lose its turn, it trails it by a fixed angle;
 *  13. a look's music sway, through the water: the liquid is a first-order
 *      filter of the dish with corner 1/τ, so at a swing every eight seconds
 *      (four bars at 120 bpm) the picture's sway is 1/√(1 + (ωτ)²) of the
 *      dish's, 0.39 on water and 0.99 on the thick liquid, to 3%: the
 *      measure of what 22h changes on the nine thin looks with music;
 *  14. the turntable's share reaches the liquid: a look's flick and a
 *      turntable turning half as fast the other way leave the water going
 *      round at the half that is left, with the water's drag time; and a
 *      hand holding a flicked dish still (the turntable exactly against the
 *      look) has the dish at exactly zero every frame and the water at rest,
 *      exactly, when the drag time says, τ ln(2/LIQUID_REST), to a frame.
 */
import {
  AutoSpin, SpinHand, SPIN_RATE, SPIN_TEMPO, SPIN_OFF, WATER_NU, THICK_NU, OIL_NU,
  carrierViscosity, dishFollow, dishFrame, dragSeconds, liquidFollow, LIQUID_REST,
} from '../src/lib/turntable.ts';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

// 1
const tw = dragSeconds(WATER_NU), tt = dragSeconds(THICK_NU), to = dragSeconds(OIL_NU);
check('the drag time at the rest gap: water 3 s, thick 0.15 s, oil 0.06 s',
  near(tw, 3, 0.01) && near(tt, 0.15, 0.01) && near(to, 0.06, 0.01), `${tw.toFixed(3)}, ${tt.toFixed(3)}, ${to.toFixed(3)} s`);
check('the look\'s Viscosity picks the liquid', carrierViscosity('thin') === WATER_NU && carrierViscosity('thick') === THICK_NU);

// 2
const follow = (tau, fps, seconds) => {
  let w = 0;
  for (let t = 0; t < seconds - 1e-9; t += 1 / fps) w = liquidFollow(w, 2, 1 / fps, tau);
  return w;
};
const at60 = follow(tt, 60, 0.15), at144 = follow(tt, 144, 0.15);
check('the liquid reaches 63% of the dish in one drag time', near(at60, 2 * (1 - Math.exp(-1)), 0.03), `${(at60 / 2).toFixed(3)} of the dish at 60 fps`);
check('and the frame rate does not change it', near(at144, at60, 0.03), `${(at144 / 2).toFixed(3)} at 144 fps`);
const reach = (tau) => { let w = 0, t = 0; while (w < 2 * (1 - Math.exp(-1)) && t < 60) { w = liquidFollow(w, 2, 1 / 240, tau); t += 1 / 240; } return t; };
check('water takes twenty times as long as the thick liquid', near(reach(tw) / reach(tt), 20, 0.03), `${(reach(tw) / reach(tt)).toFixed(1)}×`);

// 3
{
  let w = 0, dishA = 0, liqA = 0;
  const O = 1.2;
  for (let k = 0; k < 60 * 30; k++) { w = liquidFollow(w, O, 1 / 60, tw); dishA += O / 60; liqA += w / 60; }
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
  const early = run(60, 0.1, tw);
  check('a flick on water: the picture stays put while the glass goes round', early.liq < 0.1 * early.look,
    `liquid ${early.liq.toFixed(3)} against the dish's ${early.look.toFixed(3)} rad/s after 0.1 s`);
  const errs = [];
  for (const fps of [60, 144]) for (const t of [1, 3]) {
    const got = run(fps, t, tw).liq, want = exact(t, tw);
    errs.push(Math.abs(got - want) / want);
  }
  const worst = Math.max(...errs);
  check('and comes up to the dish with the water\'s drag time, at any frame rate', worst < 0.02,
    `worst ${(100 * worst).toFixed(2)}% off the exact answer at 1 s and 3 s, 60 and 144 fps; at 3 s ${run(60, 3, tw).liq.toFixed(3)} of ${run(60, 3, tw).look.toFixed(3)} rad/s`);
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
  // acid-trip's motor, the fastest a shipped look asks for: 0.1 × 0.01 rad/s.
  const M = 0.001;
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
  const sway = (tau) => {
    // The dish swung every eight seconds; amplitudes read over the last of
    // 60 s, once the start has died away. The dish's speed itself, not the
    // motor's: the flywheel's dry friction bends a sine near its zeros, and
    // what is measured here is the liquid's filter, not the flywheel's.
    const w = 2 * Math.PI / 8, fps = 60;
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
  check('a look\'s music sway through water is filtered by its drag time', near(water.ratio, water.want, 0.03),
    `${water.ratio.toFixed(3)} of the dish's sway, 1/√(1 + (ωτ)²) = ${water.want.toFixed(3)}`);
  check('and through the thick liquid hardly at all', near(thick.ratio, thick.want, 0.03) && thick.ratio > 0.98,
    `${thick.ratio.toFixed(3)}, want ${thick.want.toFixed(3)}`);
}

// 14
{
  // A look flicked to Ω0 and a turntable held at −Ω0/2: the water goes to Ω0/2.
  let liq = 0;
  for (let k = 0; k < 60 * 3; k++) liq = dishFrame(1.2, -0.6, liq, 1 / 60, tw).liquid;
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

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
