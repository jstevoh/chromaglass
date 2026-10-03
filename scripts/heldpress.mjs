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

const { page, close } = await openLab();
try {
  const run = (press) => page.evaluate(async ({ press, DT, AMOUNT, RADIUS, AT, SETTLE, WATCH }) => {
    await lab.create(256, 192);
    const L = 192;
    // The far plate: every cell more than a third of the plate from the press.
    const far = (v) => {
      let mag = 0, out = 0, fromPress = 0, n = 0;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        if (Math.hypot(x + 0.5 - AT[0], y + 0.5 - AT[1]) < L / 3) continue;
        const u = v[(x + y * L) * 4], w = v[(x + y * L) * 4 + 1];
        if (!Number.isFinite(u) || !Number.isFinite(w)) { mag = Infinity; continue; }
        const cx = (x + 0.5) / L - 0.5, cy = (y + 0.5) / L - 0.5, r = Math.hypot(cx, cy) || 1e-6;
        const px = x + 0.5 - AT[0], py = y + 0.5 - AT[1], pr = Math.hypot(px, py);
        mag += Math.hypot(u, w); out += (cx * u + cy * w) / r; fromPress += (px * u + py * w) / pr; n++;
      }
      return { speed: mag / n, outward: mag > 0 ? out / mag : 0, fromPress: mag > 0 ? fromPress / mag : 0 };
    };
    const hold = async (steps) => {
      for (let k = 0; k < steps; k++) {
        if (press) lab.squish(AT[0], AT[1], RADIUS, AMOUNT, 0, 'press', 0);
        lab.flush(DT);
        await lab.step(1, { dt: DT }, true);
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
    let gap = null;
    if (sq) {
      const n = sq.n, gx = Math.floor((AT[0] + 0.5) / L * n), gy = Math.floor((AT[1] + 0.5) / L * n);
      gap = sq.gap[gx + gy * n];
    }
    return { closing, speed, outward, fromPress, peak, gap };
  }, { press, DT, AMOUNT, RADIUS, AT, SETTLE, WATCH });

  const still = await run(false);
  const held = await run(true);
  const e = (x) => x.toExponential(2);
  console.log(`  no press:   far speed ${e(still.speed)} (peak ${e(still.peak)}), outward ${still.outward.toFixed(2)}`);
  console.log(`  held press: far speed ${e(held.speed)} (peak ${e(held.peak)}), outward ${held.outward.toFixed(2)} (from the press ${held.fromPress.toFixed(2)}); while closing ${e(held.closing.speed)}; gap under it ${held.gap?.toFixed(4)}`);

  check('the press reached the floor and is holding there', held.gap !== null && held.gap < 0.006,
    `gap ${held.gap?.toFixed(4)} under the press (floor 0.004, rest ~0.03)`);
  // That the press did push liquid out while it closed, so "still once steady"
  // below is a press that stopped, not a press that never reached the flow.
  check('while it closes, the press moves the far plate', held.closing.speed > 4 * Math.max(still.speed, 1e-7),
    `${e(held.closing.speed)} against ${e(still.speed)} with no press`);
  /*
    Held to the press's own flow while it closed, not to the control's: the
    plate with no press reads exactly nothing, and a solve converged to its
    last digit is not what this asks. Before the fix the far plate went on
    at 3.99e-3 once the press was steady, as fast as while it closed
    (3.85e-3), and 0.95 of it straight in or out from the middle; after it,
    3.1e-5, and no direction to speak of (-0.03).
  */
  check('once steady, the far plate is nearly still', held.speed < held.closing.speed / 20,
    `${e(held.speed)}, against ${e(held.closing.speed)} while the press closed (under a twentieth to pass)`);
  check('and not flowing in or out, from the middle of the plate or from the press',
    Math.abs(held.outward) < 0.3 && Math.abs(held.fromPress) < 0.3,
    `${held.outward.toFixed(2)} of the far flow is radial about the middle, ${held.fromPress.toFixed(2)} about the press`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
