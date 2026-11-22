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

  A bottle's drop is the same drop (PLAN 18c-10). The hand's Dropper, the
  phone's and the remote's drops, and the drops a held dropper lets go from
  a height, used to stamp their dye at once while the bottle's deposit
  poured the volume on its own: the colour was laid first and the drop's
  clear liquid then pushed it out into a ring, a darker collar round a
  window of the plate's own colour, where a real drop (ink, syrup, milk:
  the colour is in the liquid) opens a window of its own colour. Filmed on
  the owner's Mac, 2026-11-21: the hand's drops opened no window at all
  while the queue's opened one about three cells across, as the lab does.
  So `dropBottle` queues the bottle's drop with its liquid, and the deposit
  only tells the plate's other fields of it. And a stream held on the plate
  (`layStream`) lays its colour with its volume each step, the liquid's own
  concentration over the dome it pours, not a stamp beside a separate pour.
*/

import type { FluidSimulation } from './fluidSimulation';
import { GRID_SCALE } from './constants';
import { dropImpact, dropTrickle, queueDrop, stepDrops, DROP_TRICKLE, DROP_AMOUNT, DROP_DISC } from '../lib/dropImpact';
import { pourShare, speciesOf } from '../lib/liquidProps';
import type { LiquidDeposit } from '../lib/liquidPhase';

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

/*
  The dye in a full column of drop liquid at `dye` 1 on an N grid: a drop's
  dye (the stamp's mass, as it always laid) over the column-cells of volume
  the queue pours for it, π(DROP_DISC·N)²/2 at DROP_AMOUNT. So a stream of
  the same bottle carries its colour at the same strength as its drops.
*/
export function dropColumnDye(N: number): number {
  const R = DROP_DISC * N;
  return stampMass(Math.round(3 * GRID_SCALE), 1) * DROP_AMOUNT / (Math.PI * R * R / 2);
}

/** Whether the plate takes liquid as volume now: a thin gap with its pour kernel built (pourReady). */
function pouring(sim: FluidSimulation): boolean {
  return sim.thinGap && !!sim.gpu?.pour && (sim.gpu.pourReady?.() ?? true);
}

/**
 * A drop of `amount` at the cell (x, y), of colour (r, g, b), `dye` the share
 * of it that is colour. `volume` false for a drop that brings none (a fresh
 * plate's lay). `what`, a bottle's liquid, comes in with the drop's volume.
 * True when the drop was queued to come in as volume.
 */
export function layDrop(sim: FluidSimulation, x: number, y: number, amount: number, r: number, g: number, b: number, dye: number, volume: boolean, what?: LiquidDeposit): boolean {
  const k = GRID_SCALE;
  const h = Math.max(0, Math.min(2, sim.dropHeight));
  // The crater it presses grows as the square root of the height (the speed
  // a fall reaches) and with the drop's size, as it always has.
  const e = Math.sqrt(h) * Math.min(1.5, amount / 5);
  // A drop from higher spreads thinner as it lands: a wider disc, the same dye.
  const spread = 1 + 0.6 * e;
  const dropR = Math.round(3 * k * spread);
  // Until the pour's kernel is built (behind the show), a drop is the stamp:
  // asking for it sooner compiles it on that frame, in the opening (pourReady).
  const pours = volume && amount > 0 && pouring(sim);
  let queued = false;
  if (!pours) {
    stamp(sim, x, y, dropR, amount * dye / (spread * spread), r, g, b);
  } else if (amount < DROP_TRICKLE && !what) {
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
    queued = queueDrop(sim.drops, sim.size, x, y, amount, mass, r, g, b, sim.dtSeconds, what ? speciesOf(what) : null, what ?? null);
  }
  if (e > 0.02) splash(sim, x, y, dropR, h, e, amount, amount * dye, r, g, b);
  return queued;
}

/**
 * A bottle's drop at the cell (x, y): `layDrop` with the bottle's liquid
 * `what` in its volume, then the bottle's deposit on a disc of `radius`
 * cells (`dose`, `seconds` as liquidPhase.deposit takes them), which pours
 * the volume itself only where the drop could not (PLAN 18c-10).
 */
export function dropBottle(sim: FluidSimulation, x: number, y: number, amount: number, r: number, g: number, b: number, dye: number, what: LiquidDeposit | undefined, radius: number, dose: number, seconds?: number): void {
  const queued = layDrop(sim, x, y, amount, r, g, b, dye, true, what);
  if (what) sim.liquid.deposit(x, y, radius, what, dose, seconds, !queued);
}

/**
 * One step of a stream held on the plate at the cell (x, y), a disc of `R`
 * cells: on a thin gap the bottle's liquid poured as volume, its colour
 * (`dye`, its strength against a drop's) laid with that volume over the same
 * dome, (1 − d²/R²); off one, the stamp (1 − d/R)² of `amount` it always
 * laid. `heat` over the stamp's disc either way, and the bottle's deposit
 * `what` at `k`. Returns the dye laid, for the hand's regulator.
 */
export function layStream(sim: FluidSimulation, x: number, y: number, R: number, amount: number, dye: number, cr: number, cg: number, cb: number, heat: number, what: LiquidDeposit | undefined, k: number): number {
  const N = sim.size, g = sim.gpu;
  const pours = pouring(sim) && k > 0;
  const rc = Math.max(1.5, R);
  const per = pours ? dropColumnDye(N) * dye * pourShare(rc / N, k, sim.dtSeconds, g!.coverMetres) : 0;
  if (pours) g!.pour!((x + 0.5) / N, (y + 0.5) / N, rc / N, pourShare(rc / N, k, sim.dtSeconds, g!.coverMetres), what ? speciesOf(what) : null, true, what);
  let laid = 0;
  const E = Math.ceil(Math.max(R, rc));
  for (let dy = -E; dy <= E; dy++)
    for (let dx = -E; dx <= E; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || nx >= N - 1 || ny < 1 || ny >= N - 1) continue;
      const d2 = dx * dx + dy * dy, w = R > 0 && d2 <= R * R ? (1 - Math.sqrt(d2) / R) ** 2 : 0;
      const a = pours ? per * Math.max(0, 1 - d2 / (rc * rc)) : amount * w;
      if (a > 0) { laid += a; sim.addDensity(nx, ny, a, cr, cg, cb); }
      if (heat > 0 && w > 0) sim.addTemp(nx, ny, heat * w);
    }
  if (what) sim.liquid.deposit(x, y, R, what, k, sim.dtSeconds, !pours);
  return laid;
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
  const dq = sim.drops;
  stepDrops(dq, sim.size, (px, py, radius, share, k) => g.pour!(px, py, radius, share, dq.sp[k], true, dq.what[k] ?? undefined), (i, j, a, r, gg, b) => sim.addDensity(i, j, a, r, gg, b));
}
