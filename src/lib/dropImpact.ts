/*
  A drop falling into the liquid (PLAN 18c-2, 18c-3): what it brings and how
  hard it lands, as numbers the sim, the lab and the checks share.

  What was reported (the owner's reference, 2026-11-13, a Liquid Light Lab
  clip): a drop lands in a pool of dark dye and in one 50 ms frame opens a
  bright round window, the drop's own colour in the middle, a dark collar of
  pushed dye round it, still open a second and a half later. No satellites.
  Ours stamped the drop's dye on top of what was there (the middle went from
  2.23 to 2.64 absorbance: a darker smudge), pushed with a ring of velocity the
  pressure solve deletes (it is curl-free), and threw satellites at any height.

  What a drop is, physically: liquid. It arrives with a volume V and has to go
  somewhere, so it pushes the liquid already there out of its way, radially,
  and fills the middle itself. Between two plates at the gap h it fills a
  disc of radius √(V/πh) and the old dye stands in a collar round it. That is
  the window, and the solver already has every part of it: a bottle's pour is
  a volume source in the thin solve (PLAN 18c-1, hsDivergence, pourVolume),
  and `npm run flush` holds that what it pushes is conserved. Only the
  colour's drops were never given one.

  So a drop here is a pour of its volume, and its dye arrives with that
  volume rather than on top of what was there. Two choices are numerical, not
  physical, and both are said here so they are not mistaken for physics:

  - A one-step source mixes in the cell: the column it lands in keeps
    1/(1 + f) of its old dye, half of it at f = 1, so a whole drop in one
    step is a grey smudge, not a window. A real drop enters over its own
    capillary time, τ = √(ρD³/σ) ≈ 40 ms for a 4.6 mm water drop (2 to 4
    frames), from a contact patch smaller than the disc it ends up filling.
    So the same volume is delivered through a tighter dome, `DROP_CORE` of
    the final window's radius, over `steps` solver steps, each at most a
    whole column: the middle keeps 1/(1 + f)ⁿ of its old dye and the cells
    outside the core are pushed, not mixed.
  - The volume follows the bottle dose's convention (lib/liquidProps.ts):
    a share of 1 over a dome of `DROP_DISC` (3 · GRID_SCALE cells, the drop's
    old stamp) is amount 5, about 0.07 mL on the 20 cm dish at 2 mm, a
    dropper's drop. From `amount`, not amount × dye: a clear drop has volume.

  How hard it lands (18c-3): the drop's Weber and Ohnesorge numbers from the
  height it fell, `dropHeight` 1 standing for `DROP_HEIGHT_METRES`. Whether a
  drop on a film of depth h splashes (throws a crown and satellites) or only
  spreads is Cossali, Coghe and Marengo's 1997 threshold on K = We·Oh^−0.4:
  above 2100 + 5880 (h/D)^1.44 it splashes, below it does not. For a 5 mm
  water drop (amount 5) on 2 mm that is a fall of about 0.2 m, Drop Height
  0.67: a dropper held 10 to 15 cm over the dish, as in the reference,
  throws nothing. The crown's fingers number √We·Re^¼/(4√3) (Bhola and
  Chandra 1999), 16 at 10 cm and 24 at 20 cm for that drop, against the
  reference's about 20.

  Pure, so the sim (src/sim/fluidSimulation.ts), the lab
  (scripts/lab-entry.ts) and `npm run dropwindow` run the same numbers.
*/

import { DISH_METRES, DISH_GAP_METRES } from './turntable';

/** The drop's old stamp radius, in plate widths (3 · GRID_SCALE cells of 192): the dome a share of 1 is amount 5 over. */
export const DROP_DISC = 4.5 / 192;
/** The amount that is a share of 1 over `DROP_DISC`: a dropper's drop, about 0.07 mL (lib/liquidProps.ts's dose). */
export const DROP_AMOUNT = 5;
/** The contact patch the drop enters through, as a share of the window it fills (see the header). */
export const DROP_CORE = 0.7;
/** At least this many steps, so no step is one cell's whole column replaced at once, and at most this many. */
export const DROP_STEPS_MIN = 2;
export const DROP_STEPS_MAX = 10;
/** The smallest contact patch, in cells: the pour's dome needs a cell or two to be a dome at all. */
export const DROP_CORE_CELLS = 1.5;

/**
 * Below this amount a "drop" is the music's trickle laid a frame at a time
 * (LiquidVisualizer's bass, mid and swell pours, Evolve's): a dropper's tip
 * hangs on to what it is fed until the drop is heavy enough to fall, Tate's
 * law, 2πrσ = mg, about 0.046 mL from a 1 mm tip, amount 3.3 here. So the
 * trickle accrues (`dropTrickle`) and falls as one drop.
 */
export const DROP_TRICKLE = 0.5;
export const DROP_TATE = 3.3;

/** `dropHeight` 1 is a fall of this many metres (0 lays it on the plate; the slider reaches 2). */
export const DROP_HEIGHT_METRES = 0.3;

const RHO = 1000, SIGMA = 0.072, MU = 1e-3, G = 9.81;

/** A drop's volume in m³ from its amount (the dome convention above, at the rest gap). */
export function dropVolume(amount: number, gap = DISH_GAP_METRES): number {
  if (!(amount > 0)) return 0;
  const r = DROP_DISC * DISH_METRES;
  return (amount / DROP_AMOUNT) * (Math.PI * r * r / 2) * gap;
}

/** Its diameter as a sphere, in metres. */
export function dropDiameter(amount: number): number {
  return Math.cbrt(6 * dropVolume(amount) / Math.PI);
}

/**
 * How a drop of `amount` is delivered on a plate of N cells: the contact
 * patch's radius (plate widths), the share of the column at its middle each
 * step, and how many steps. The window it fills has R² = W/2 for W the dome
 * share × r² it brings (a full column holds twice a dome of the same radius).
 */
export function dropSchedule(amount: number, N: number): { radius: number; share: number; steps: number; window: number } {
  if (!(amount > 0) || !(N > 0)) return { radius: 0, share: 0, steps: 0, window: 0 };
  const W = (amount / DROP_AMOUNT) * DROP_DISC * DROP_DISC;
  const window = Math.sqrt(W / 2);
  const radius = Math.max(DROP_CORE_CELLS / N, DROP_CORE * window);
  const steps = Math.max(DROP_STEPS_MIN, Math.min(DROP_STEPS_MAX, Math.ceil(W / (radius * radius))));
  const share = Math.min(1, W / (steps * radius * radius));
  return { radius, share, steps, window };
}

/** The impact's numbers for a drop of `amount` falling `dropHeight` (the setting) onto a film `gap` deep. */
export function dropImpact(amount: number, dropHeight: number, gap = DISH_GAP_METRES) {
  const D = Math.max(1e-4, dropDiameter(amount));
  const H = Math.max(0, dropHeight) * DROP_HEIGHT_METRES;
  const v = Math.sqrt(2 * G * H);
  const We = RHO * v * v * D / SIGMA;
  const Re = RHO * v * D / MU;
  const Oh = MU / Math.sqrt(RHO * SIGMA * D);
  const K = We * Math.pow(Oh, -0.4);
  const Kc = 2100 + 5880 * Math.pow(gap / D, 1.44);
  return {
    D, v, We, Re, Oh, K, Kc,
    /** Throws a crown and satellites (Cossali 1997). */
    splashes: K >= Kc,
    /** The crown's fingers (Bhola and Chandra 1999), 0 for a drop laid on. */
    fingers: v > 0 ? Math.round(Math.sqrt(We) * Math.pow(Re, 0.25) / (4 * Math.sqrt(3))) : 0,
  };
}

/*
  The drops on their way in: a fixed ring of slots, each (x, y) in cells,
  the patch's radius in plate widths, the share a step, the steps left, the
  dye a step and its colour. A Float32Array and plain functions, because
  this is drained every solver step (CLAUDE.md, no ceremony in the frame).
*/
export const DROP_SLOTS = 16;
const F = 9;

export interface DropQueue { q: Float32Array; trickle: number }

export function makeDropQueue(): DropQueue {
  return { q: new Float32Array(DROP_SLOTS * F), trickle: 0 };
}

/** Queue a drop of `amount` at (x, y) in cells, laying `dye` of colour (r, g, b) with its volume. False when every slot is busy. */
export function queueDrop(dq: DropQueue, N: number, x: number, y: number, amount: number, dye: number, r: number, g: number, b: number): boolean {
  const s = dropSchedule(amount, N);
  if (s.steps === 0) return false;
  const q = dq.q;
  for (let k = 0; k < DROP_SLOTS; k++) {
    const o = k * F;
    if (q[o + 4] > 0) continue;
    q[o] = x; q[o + 1] = y; q[o + 2] = s.radius; q[o + 3] = s.share; q[o + 4] = s.steps;
    q[o + 5] = Math.max(0, dye) / s.steps; q[o + 6] = r; q[o + 7] = g; q[o + 8] = b;
    return true;
  }
  return false;
}

/** The music's trickle (see DROP_TRICKLE): what falls as a drop now, or 0 while the tip still holds it. */
export function dropTrickle(dq: DropQueue, amount: number): number {
  dq.trickle += Math.max(0, amount);
  if (dq.trickle < DROP_TATE) return 0;
  const fall = dq.trickle;
  dq.trickle = 0;
  return fall;
}

/** Whether a drop is still on its way in. */
export function dropsLive(dq: DropQueue): boolean {
  for (let k = 0; k < DROP_SLOTS; k++) if (dq.q[k * F + 4] > 0) return true;
  return false;
}

/**
 * One solver step of every drop on its way in: `pour(x, y, radius, share)`
 * in plate units, and its dye cell by cell over the same dome as the volume
 * (`lay(i, j, amount, r, g, b)`, cells of the N grid), so the colour comes in
 * with the liquid that carries it and the middle tends to the drop's own.
 */
export function stepDrops(
  dq: DropQueue, N: number,
  pour: (x: number, y: number, radius: number, share: number) => void,
  lay: (i: number, j: number, amount: number, r: number, g: number, b: number) => void,
): void {
  const q = dq.q;
  for (let k = 0; k < DROP_SLOTS; k++) {
    const o = k * F;
    if (!(q[o + 4] > 0)) continue;
    const x = q[o], y = q[o + 1], rp = q[o + 2];
    pour((x + 0.5) / N, (y + 0.5) / N, rp, q[o + 3]);
    const dye = q[o + 5];
    if (dye > 0) {
      const rc = rp * N, R = Math.ceil(rc);
      // Normalised over the cells it can land on, so a drop at the plate's
      // edge lays all its dye rather than losing the part past the edge.
      const cx = Math.round(x), cy = Math.round(y);
      let sum = 0;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const w = 1 - (i * i + j * j) / (rc * rc), px = cx + i, py = cy + j;
        if (w > 0 && px > 0 && py > 0 && px < N - 1 && py < N - 1) sum += w;
      }
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const w = 1 - (i * i + j * j) / (rc * rc), px = cx + i, py = cy + j;
        if (w > 0 && sum > 0 && px > 0 && py > 0 && px < N - 1 && py < N - 1) lay(px, py, dye * w / sum, q[o + 6], q[o + 7], q[o + 8]);
      }
    }
    q[o + 4]--;
  }
}

/** Drop every drop still on its way in (a new plate, a look change). */
export function clearDrops(dq: DropQueue): void {
  dq.q.fill(0);
  dq.trickle = 0;
}
