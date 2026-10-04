#!/usr/bin/env node
/**
 * A press held in one place moves the liquid around it, not the whole plate.
 *
 *   npm run heldpress     (the solver, in the lab: any adapter that computes)
 *
 * What was reported: the mirror check's "and nowhere else" (`scripts/mirror.mjs`)
 * went red on four PRs that touched nothing near it. The plate it asks about is Classic, calm
 * (no turbulence, no sound, nothing turning it), and on the Mac the drop's own
 * change was fine; what failed was the rest of the plate, which had started
 * moving on its own before the fourth drop. Six rounds of measurement on the
 * Mac runner found the motion was a single plate-wide flow straight out from
 * the middle (0.63 to 0.88 of it outward, mean speed up to 0.34), that it
 * began with the first bubble a drop trapped, and that with Bubbles at 0 it
 * never began at all (mean speed stayed near 0.005 and nothing was outward).
 *
 * The cause is the press source's balance. Every bubble presses the glass a
 * little over its footprint on every frame (LiquidVisualizer's standing
 * squeeze), and a press is a source: liquid pushed out of a closing gap. The
 * pressure solve has walls all round, and on a closed plate a source that does
 * not sum to zero has no solution — the liquid has nowhere to go. The press
 * was balanced with its plate mean worked out on the CPU from the gap deltas
 * just handed across, divided by a resting gap of 0.03. But what reaches the
 * solve is the squeeze film's rate over the gap it really has, and a held
 * press has squeezed its gap to the floor (0.004): there the next delta is
 * clamped away, the gap's spring and memory go on moving it, and the true
 * source is nothing like the estimate. The difference was a net source over
 * the whole plate, every frame, and the solve's best answer to an impossible
 * problem is a flow out from the middle that grows each step.
 *
 * And on the app's glass a second leak with the same shape: the press's
 * memory (gapMemory, a 0.22 s half-life of remembered squeeze that never
 * moves the gap) was summed into the rate of a press that was still on, so a
 * held press pushed out some three hundred times what its gap lost, and kept
 * pushing from a gap already on the floor. The squeeze film now reports what
 * the gap really does while a press is on (squeezeUpdate).
 *
 * So this holds a press the size of a bubble's in one place, each step, as
 * the app does, at Classic's timestep, until its gap has gone down to the
 * floor and stays there; and then asks what the plate far from it is doing.
 * A press that has stopped closing pushes nothing out, so the far plate
 * should come nearly to rest, and in particular not be flowing in or out
 * from the middle. While the gap is still closing it does push liquid
 * everywhere (the glass rises a little all over to take what the palm put
 * out), so that is measured too, and is the yardstick: the check is that the
 * far flow dies to a small part of what the closing press made, not that a
 * press moves nothing ever. A plate with no press at all is run beside it
 * and printed, to show the far plate has nothing else moving it.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Classic's own step, as the Mac measured it (0.0005 to 0.0012): the press's
// rate is a delta over dt, so the small step is the one that shows it.
const DT = 0.001;
// A bubble's press, as LiquidVisualizer lays one: 0.0035 before every step
// (it is inside the loop that steps the solver), over 0.85 of the bubble's
// radius; a trapped bubble is a few cells across. Each step follows the press
// it was flushed with, as the app's loop says (`step(p, applied)`): stepped
// without it, the lab springs the gap a second time each step, an opening
// under the press the app never has, and measures that instead.
const AMOUNT = 0.0035, RADIUS = 5;
// Off the middle in both axes. The far plate is mostly across the middle
// from the press, where a flow out from either points much the same way, so
// the direction is read about both and neither may lead.
const AT = [56, 64];
const SETTLE = 240, WATCH = 120;
/*
  And the bubbles a drop's music traps: the four the Mac found near the middle
  of a calm Classic plate (scripts/mirror.mjs, PR #238's measuring run), at
  their plate fractions, with radii in cells of the app's 384 grid. A bubble
  sitting still between two glasses pushes no liquid anywhere. The air's
  "standing" source in the projection made each one pour liquid out for as
  long as it lasted, the rest of the plate the sink: in this lab, held still
  with their presses on, the far plate went on at 4.57e-3 once steady, 0.79 of
  it out from them, about as fast as when they arrived (5.07e-3); without that
  source, 1.83e-5.
*/
const BUBBLES = [[0.47, 0.56, 2.0], [0.49, 0.55, 2.0], [0.55, 0.65, 3.7], [0.53, 0.61, 6.5]];
/*
  On Classic's glass, as the app works it out from the look and the step
  (LiquidVisualizer, "The two glasses"): its spring, its plate pressure and
  its dome, and the press's memory, whose half-life is 0.22 s of the plate's
  time. The lab's own glass (a spring forty times the app's and no memory)
  is a plate the app never has: on it this check first passed on a fix that
  left the app's plate flowing exactly as before (3.35e-2 once steady, 0.56
  of it outward, check-skeptic), because there the memory went on pushing
  out of a gap already sitting on the floor.
*/
const glass = (settings) => ({
  dt: DT,
  gapSpring: 1 - Math.pow(0.5, DT / Math.max(0.02, 2.2 * (1 - (settings.plateSpring ?? 0.35)) + 0.12)),
  gapMemory: Math.pow(0.5, DT / 0.22),
  platePressure: Math.max(0, Math.min(1, settings.platePressure ?? 0.4)),
  plateCurve: Math.max(-1, Math.min(1, settings.plateCurve ?? 0)),
});

const { page, close } = await openLab();
try {
  const over = glass(await page.evaluate(() => lab.look('classic').settings));
  console.log(`  Classic's glass at dt ${DT}: spring ${over.gapSpring.toExponential(2)}, memory ${over.gapMemory.toFixed(5)}, pressure ${over.platePressure}, dome ${over.plateCurve}`);
  const run = (press, trapped = false) => page.evaluate(async ({ press, trapped, AMOUNT, RADIUS, AT, BUBBLES, SETTLE, WATCH, over }) => {
    await lab.create(256, 192);
    const L = 192;
    // The trapped bubbles: their air on the plate, held still, each with the
    // press LiquidVisualizer lays on its footprint. Measured about where they are.
    if (trapped) {
      const packed = new Float32Array(BUBBLES.length * 4);
      BUBBLES.forEach(([x, y, r], i) => packed.set([x, y, r / 384, 1], i * 4));
      lab.solver().setBubbles(packed, BUBBLES.length, 0.25, new Float32Array(BUBBLES.length * 4));
      AT = [BUBBLES.reduce((a, b) => a + b[0], 0) / BUBBLES.length * L, BUBBLES.reduce((a, b) => a + b[1], 0) / BUBBLES.length * L];
    }
    // The far plate: every cell more than a third of the plate from the press.
    const far = (v) => {
      let mag = 0, out = 0, fromPress = 0, n = 0;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        if (Math.hypot(x + 0.5 - AT[0], y + 0.5 - AT[1]) < L / 3) continue;
        const u = v[(x + y * L) * 4], w = v[(x + y * L) * 4 + 1];
        // A plate gone to NaN is not a still one: read as speed it is
        // infinite, and as a direction it would read as none at all.
        if (!Number.isFinite(u) || !Number.isFinite(w)) throw new Error(`the velocity is not finite at ${x},${y}`);
        const cx = (x + 0.5) / L - 0.5, cy = (y + 0.5) / L - 0.5, r = Math.hypot(cx, cy) || 1e-6;
        const px = x + 0.5 - AT[0], py = y + 0.5 - AT[1], pr = Math.hypot(px, py);
        mag += Math.hypot(u, w); out += (cx * u + cy * w) / r; fromPress += (px * u + py * w) / pr; n++;
      }
      return { speed: mag / n, outward: mag > 0 ? out / mag : 0, fromPress: mag > 0 ? fromPress / mag : 0 };
    };
    const hold = async (steps) => {
      for (let k = 0; k < steps; k++) {
        if (press) lab.squish(AT[0], AT[1], RADIUS, AMOUNT, 0, 'press', 0);
        if (trapped) for (const [x, y, r] of BUBBLES) if (r >= 1.2) lab.squish(Math.round(x * L), Math.round(y * L), Math.max(1, r * 0.85 / 2), AMOUNT, 0, 'press', 0);
        lab.flush(over.dt);
        await lab.step(1, over, true);
      }
    };
    await hold(20);
    const closing = far(await lab.field('vel'));
    await hold(SETTLE - 20);
    let speed = 0, outward = 0, fromPress = 0, peak = 0;
    const SAMPLES = 4;
    for (let s = 0; s < SAMPLES; s++) {
      await hold(WATCH / SAMPLES);
      const f = far(await lab.field('vel'));
      speed += f.speed / SAMPLES; outward += f.outward / SAMPLES; fromPress += f.fromPress / SAMPLES; peak = Math.max(peak, f.speed);
    }
    // Did the press reach the floor? The squeeze film's gap under it.
    const sq = await lab.squeeze();
    let gap = null, rate = null;
    if (sq) {
      const n = sq.n, gx = Math.floor((AT[0] + 0.5) / L * n), gy = Math.floor((AT[1] + 0.5) / L * n);
      gap = sq.gap[gx + gy * n];
      rate = sq.rate[gx + gy * n];
    }
    // How much of the plate the solver reads as air it is pushing on: a
    // bubble that never reached the field (too small for the grid, a
    // setBubbles that stopped landing) would leave the stillness below green
    // with nothing on the plate to be still about.
    const air = trapped ? lab.solver().airDisplacing : 0;
    return { closing, speed, outward, fromPress, peak, gap, rate, air };
  }, { press, trapped, AMOUNT, RADIUS, AT, BUBBLES, SETTLE, WATCH, over });

  const still = await run(false);
  const held = await run(true);
  const bubbles = await run(false, true);
  const e = (x) => x.toExponential(2);
  console.log(`  no press:   far speed ${e(still.speed)} (peak ${e(still.peak)}), outward ${still.outward.toFixed(2)}`);
  console.log(`  held press: far speed ${e(held.speed)} (peak ${e(held.peak)}), outward ${held.outward.toFixed(2)} (from the press ${held.fromPress.toFixed(2)}); while closing ${e(held.closing.speed)}; gap under it ${held.gap?.toFixed(4)}, its rate ${held.rate?.toFixed(3)} a second`);

  check('the press reached the floor and is holding there', held.gap !== null && held.gap < 0.006 && still.gap > 0.02,
    `gap ${held.gap?.toFixed(4)} under the press (floor 0.004), ${still.gap?.toFixed(4)} there with no press`);
  /*
    The source itself: a film sitting on the floor is not closing, so the
    rate the press source reads under it should be next to nothing. Before
    the bound on the memory it read -8.5 a second here (the closing it
    remembered); the spring's own nudge at the floor is about 0.01.
  */
  check('and the film under it has stopped closing', held.rate !== null && Math.abs(held.rate) < 0.1,
    `dh/dt ${held.rate?.toFixed(3)} a second under the press`);
  // That the press did push liquid out while it closed, so "still once steady"
  // below is a press that stopped, not a press that never reached the flow.
  check('while it closes, the press moves the far plate', held.closing.speed > 4 * Math.max(still.speed, 1e-7),
    `${e(held.closing.speed)} against ${e(still.speed)} with no press`);
  /*
    Held to the press's own flow while it closed, and to a fixed ceiling,
    not to the control's: the plate with no press reads exactly nothing,
    and a solve converged to its last digit is not what this asks. On
    Classic's glass, main went on at 3.28e-2 once the press was steady, as
    fast as while it closed, half of it straight out from the middle; with
    the source balanced and the press's memory stopped while the press is
    on, 4.6e-5 (peak 6.3e-5). On the lab's glass, where only the balance
    was wrong, 3.99e-3 and 0.95 of it radial before, 3.1e-5 after.

    The direction is asked at half: what is left is the press's own push
    on the liquid round it, a little of which still points away from it
    (0.31 about the press, -0.02 about the middle, at a fiftieth of the
    closing flow's speed); the leak was a flow nine-tenths radial at the
    closing flow's own speed.
  */
  check('once steady, the far plate is nearly still', held.speed < held.closing.speed / 20 && held.peak < 3e-4,
    `${e(held.speed)} (peak ${e(held.peak)}, under 3e-4 to pass), against ${e(held.closing.speed)} while the press closed (under a twentieth)`);
  check('and not flowing in or out, from the middle of the plate or from the press',
    Math.abs(held.outward) < 0.5 && Math.abs(held.fromPress) < 0.5,
    `${held.outward.toFixed(2)} of the far flow is radial about the middle, ${held.fromPress.toFixed(2)} about the press (under 0.5 to pass)`);
  console.log(`  trapped bubbles: far speed ${e(bubbles.speed)} (peak ${e(bubbles.peak)}), outward ${bubbles.outward.toFixed(2)} (from the bubbles ${bubbles.fromPress.toFixed(2)}); as they arrived ${e(bubbles.closing.speed)}`);
  check('the trapped bubbles are on the plate as air the solver pushes on', bubbles.air > 0.0005,
    `${(100 * bubbles.air).toFixed(3)}% of the plate is air`);
  // Their arrival and their presses closing are the physical push (a bubble
  // appearing displaces liquid, a closing gap pushes it out), so that is the
  // yardstick, as the closing press is above.
  check('a trapped bubble arriving moves the far plate', bubbles.closing.speed > 4 * Math.max(still.speed, 1e-7),
    `${e(bubbles.closing.speed)} against ${e(still.speed)} with nothing on the plate`);
  check('and once the bubbles sit still, the far plate is nearly still', bubbles.speed < bubbles.closing.speed / 20 && bubbles.peak < 3e-4,
    `${e(bubbles.speed)} (peak ${e(bubbles.peak)}, under 3e-4 to pass), against ${e(bubbles.closing.speed)} as they arrived (under a twentieth)`);
  /*
    The direction asked as a flow, not as a fraction. What is left once the
    bubbles sit still is their presses' own push on the liquid round them,
    and at a six-hundredth of the leak's speed its direction is whatever that
    push happens to be: on the Mac 0.59 of it pointed away from the bubbles,
    at 7.7e-6 (4.6e-6 of outward flow), where the lab read 0.26. The leak was
    a flow straight out at the arrival's own speed: 4.57e-3, 0.79 of it out
    from them, 3.6e-3 of outward flow, 0.71 of what the arrival made. So the
    outward part of the far flow is held to a fiftieth of the arrival's.
  */
  const outFlow = Math.max(Math.abs(bubbles.outward), Math.abs(bubbles.fromPress)) * bubbles.speed;
  check('and not flowing out from them or from the middle', outFlow < bubbles.closing.speed / 50,
    `${e(outFlow)} of it flows straight out (${bubbles.outward.toFixed(2)} of the far flow about the middle, ${bubbles.fromPress.toFixed(2)} about the bubbles), against ${e(bubbles.closing.speed)} as they arrived (under a fiftieth)`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
