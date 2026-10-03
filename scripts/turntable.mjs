#!/usr/bin/env node
/**
 * The spinning dish's CPU half (src/lib/turntable.ts, PLAN.md §21), in node:
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
 *   8. with Auto Spin off and no hand, the turntable and its liquid are
 *      exactly zero, so a look nobody spins turns as it always did;
 *   9. and let go, they come back to exactly zero, not for ever nearly.
 */
import {
  AutoSpin, SpinHand, SPIN_RATE, SPIN_TEMPO, SPIN_OFF, WATER_NU, THICK_NU, OIL_NU,
  carrierViscosity, dishFollow, dragSeconds, liquidFollow,
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
  let dish = 0, liq = 0, look = 0, angle = 0;
  const D = (0.04 + 0.25 * 1.2) * 0.8;
  for (let k = 0; k < 60 * 600; k++) {
    look = dishFollow(look, 0.03 * Math.sin(k / 40), D, 1 / 60);
    dish = dishFollow(dish, a.target(SPIN_OFF, 6, 16, { periodMs: 500, nextBeatMs: 1000, nowMs: 900 }, angle), D, 1 / 60);
    liq = liquidFollow(liq, dish, 1 / 60, tw);
    angle += dish / 60;
  }
  check('with Auto Spin off and no hand, the turntable and its liquid stay exactly still', dish === 0 && liq === 0 && angle === 0,
    `dish ${dish}, liquid ${liq}, angle ${angle}, beside a look swinging to ${look.toFixed(4)} rad/s`);
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

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
