/*
  A colour drop landing on a plate (PLAN 18c-2, 18c-3): `autoInject`'s
  default style, moved out of fluidSimulation.ts, which is at its size
  ceiling, with the splash it used to call.

  On a thin gap a drop is liquid: it brings its volume (lib/dropImpact.ts,
  `queueDrop`), which pushes the liquid already there aside into a collar and
  fills the middle with the drop's own colour, and its dye comes in with that
  volume over the next few steps (`stepPlateDrops`, drained by the sim's
  step). Before, it stamped its dye on top of what was there, a darker smudge
  where the reference opens a bright window (the owner's clip, 2026-11-13).

  How hard it lands is the height it fell (Drop Height, `dropHeight`): the
  crater it presses, and whether it splashes at all. A splash, a crown that
  throws satellites, needs K = We·Oh^−0.4 past Cossali's threshold, a fall of
  about 0.2 m for a 5 mm drop (`dropImpact`); below it, nothing is thrown.
  Before, any drop with an impact over 0.02 threw a random handful.

  And the ring of outward velocity the splash added round the drop is gone:
  a radial kick is curl-free, the pressure solve takes every curl-free part
  of the velocity out on the step it is laid, so it moved nothing but cost
  the writes (PLAN 18c-3). What pushes the liquid out now is the drop's
  volume, and on the old plate the splash's own squeeze pulse.

  Off a thin gap (the old plate, the CPU engine) there is no volume to push,
  so a drop is the stamp it always was.
*/

import type { FluidSimulation } from './fluidSimulation';
import { GRID_SCALE } from './constants';
import { dropImpact, dropTrickle, queueDrop, stepDrops, DROP_TRICKLE } from '../lib/dropImpact';

/** A drop's dye over its disc, (1 − d/R)², at the cell (x, y), `amount` at its middle. */
function stamp(sim: FluidSimulation, x: number, y: number, R: number, amount: number, r: number, g: number, b: number): void {
  const S = sim.size;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > R) continue;
      const nx = Math.max(1, Math.min(S - 2, x + dx)), ny = Math.max(1, Math.min(S - 2, y + dy));
      sim.addDensity(nx, ny, amount * Math.pow(1 - dd / R, 2), r, g, b);
    }
}

/** The dye a stamp of radius R with `amount` at its middle lays in all. */
function stampMass(R: number, amount: number): number {
  let m = 0;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= R) m += Math.pow(1 - dd / R, 2);
    }
  return m * amount;
}

/**
 * A drop of `amount` at the cell (x, y), of colour (r, g, b), `dye` the share
 * of it that is colour. `volume` false for a drop that brings none: a fresh
 * plate's lay, or a bottle whose own pour already brought it (onDeposit).
 */
export function layDrop(sim: FluidSimulation, x: number, y: number, amount: number, r: number, g: number, b: number, dye: number, volume: boolean): void {
  const k = GRID_SCALE;
  const h = Math.max(0, Math.min(2, sim.dropHeight));
  // The crater it presses grows as the square root of the height (the speed
  // a fall reaches) and with the drop's size, as it always has.
  const e = Math.sqrt(h) * Math.min(1.5, amount / 5);
  // A drop from higher spreads thinner as it lands: a wider disc, the same dye.
  const spread = 1 + 0.6 * e;
  const dropR = Math.round(3 * k * spread);
  const pours = volume && sim.thinGap && !!sim.gpu?.pour && amount > 0;
  if (!pours) {
    stamp(sim, x, y, dropR, amount * dye / (spread * spread), r, g, b);
  } else if (amount < DROP_TRICKLE) {
    // The music's trickle: its dye as it always laid, its volume held at the
    // dropper's tip until a drop's worth falls (Tate's law, dropTrickle).
    stamp(sim, x, y, dropR, amount * dye / (spread * spread), r, g, b);
    const fall = dropTrickle(sim.drops, amount);
    if (fall > 0) queueDrop(sim.drops, sim.size, x, y, fall, 0, r, g, b);
  } else {
    // The same dye the stamp laid, brought in with the drop's volume.
    const mass = stampMass(Math.round(3 * k), amount * dye);
    /*
      With every slot busy the drop is let go, not stamped. The slots fill
      only when drops keep coming and the plate takes no steps: Freeze the
      liquid, while the automation and the music still drop. A stamp there
      reached the frozen plate through the readback's flush and the colour
      kept arriving on a plate meant to stand still: `npm run moving` (Mac,
      soap-film) found its four-second freeze ending 1.2 to 1.9 s early,
      from when the sixteen slots had filled. Sixteen drops within one
      drop's five steps is not a show running.
    */
    queueDrop(sim.drops, sim.size, x, y, amount, mass, r, g, b);
  }
  if (e > 0.02) splash(sim, x, y, dropR, h, e, amount, amount * dye, r, g, b);
}

/*
  A drop landing from a height. It presses the film: on a thin gap the
  crater is the glass's bowl (squishDisc's thin `press`), and the flow that
  closing it makes carries the colour, with no drawn multiplies or pushes;
  on the old plate the `splash` stroke as it was. And past Cossali's
  threshold it throws satellites, droplets of its own dye flung clear of the
  impact, as many as the crown has fingers (Bhola and Chandra), further out
  the higher it fell.
*/
function splash(sim: FluidSimulation, x: number, y: number, dropR: number, h: number, e: number, amount: number, dyeAmount: number, r: number, g: number, b: number): void {
  const S = sim.size;
  const k = GRID_SCALE;
  const inside = (px: number, py: number) => px >= 2 && px < S - 2 && py >= 2 && py < S - 2;
  sim.applySquish(x, y, (dropR / k) * (1.6 + 1.8 * h), 0.0012 * e, sim.dropFingering, !sim.thinGap, sim.thinGap ? 'press' : 'splash');

  const imp = dropImpact(amount, h);
  if (!imp.splashes) return;
  // A few of the crown's fingers pinch off (Rayleigh–Plateau), not all of
  // them: a third, give or take, as the satellites always numbered.
  const n = Math.round(imp.fingers * (0.2 + sim.rng.float() * 0.25));
  for (let q = 0; q < n; q++) {
    const a = sim.rng.angle();
    const dist = dropR * (1.4 + (1 + 5 * h) * sim.rng.float());
    const px = Math.round(x + Math.cos(a) * dist), py = Math.round(y + Math.sin(a) * dist);
    if (!inside(px, py)) continue;
    const sr = Math.max(1, Math.round((0.8 + sim.rng.float() * 1.2) * k * Math.min(1, 0.6 + 0.3 * e)));
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > sr || !inside(px + dx, py + dy)) continue;
        sim.addDensity(px + dx, py + dy, dyeAmount * 0.22 * (1 - dd / sr), r, g, b);
      }
    }
    const kick = (0.25 + 0.5 * h) * Math.min(1, e);
    sim.addVelocity(px, py, Math.cos(a) * kick, Math.sin(a) * kick);
  }
}

/** One solver step of the drops on their way in: their volume to the GPU's pour, their dye into the deltas. */
export function stepPlateDrops(sim: FluidSimulation): void {
  const g = sim.gpu;
  if (!g?.pour) return;
  stepDrops(sim.drops, sim.size, (px, py, radius, share) => g.pour!(px, py, radius, share, null, true), (i, j, a, r, gg, b) => sim.addDensity(i, j, a, r, gg, b));
}
