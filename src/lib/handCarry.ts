import { pressDye, pressOil, type DyeOut, type OilPress } from './pressRing';

/**
 * What a hand's Finger or Blow carries of the ferrofluid (PLAN.md §9n), as
 * the solver's carryPhase takes it: in plate units.
 *
 * One place for the numbers, because two things need them: the app, where
 * a hand calls them (LiquidVisualizer: fingerDrag, blowPhase), and
 * `npm run ferrohands`, which measures what they carry. A check that copied
 * them would go on passing on numbers the app had stopped using.
 *
 * `x`, `y` and `radius` are in cells of the app's L-cell plate, as the
 * tools are; `gridScale` is L over 128, the grid the brushes were tuned on.
 */
export type HandCarry = {
  x: number; y: number; r: number;
  /** The direction, unit length; ignored when outward. */
  ux: number; uy: number;
  /** The share taken from the cell at the hand's middle, falling to none at its rim. */
  take: number;
  /** How far what is taken is put down. */
  hop: number;
  /** Straight out from the middle (a puff held still), not along a stroke. */
  outward: boolean;
};

/**
 * The Finger: the same geometry as the dye's carry (carryDye), so the
 * ferrofluid and the colour move together. `radius` is the Finger's own (7,
 * before gridScale) and `strength` what fingerDrag was given.
 */
export function fingerCarry(x: number, y: number, radius: number, strength: number, dx: number, dy: number, L: number): HandCarry | null {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-4)) return null;
  const r = Math.round(radius * L / 128);
  return { x: x / L, y: y / L, r: r / L, ux: dx / len, uy: dy / len,
    take: Math.min(0.75, strength * 8), hop: Math.max(1, Math.round(r * 0.45)) / L, outward: false };
}

/**
 * Blow: held still it blows straight down and opens a hole, the ferrofluid
 * going out from under it on every side; moved, or a directed blow, it
 * sweeps the ferrofluid along as a Finger does, at the Finger's share of
 * its strength (eight times it, to half at most). Held still it takes half
 * that, because it acts on the same cells every frame the breath goes on:
 * at the Finger's share a puff emptied the pool under it in a few frames.
 * Measured (`npm run ferrohands`): at four times the strength, as the puff
 * takes, a mouse's Blow drawn across a pool moved it 0.35 % of the plate,
 * a tongue too faint to read as pushed. `dx`, `dy` of zero is held still.
 */
export function blowCarry(x: number, y: number, radius: number, strength: number, dx: number, dy: number, L: number): HandCarry {
  const len = Math.hypot(dx, dy);
  const r = Math.round(radius * L / 128);
  const outward = !(len > 1e-4);
  return { x: x / L, y: y / L, r: r / L, ux: outward ? 0 : dx / len, uy: outward ? 0 : dy / len,
    take: Math.min(0.5, strength * (outward ? 4 : 8)), hop: Math.max(1, Math.round(r * 0.45)) / L, outward };
}

/**
 * Dye taken from behind a gesture and put a hop ahead of it, on the CPU
 * through the dye mirror (`dye`, rgba amounts, N x N): the Finger's carry
 * (carryDye in LiquidVisualizer) and the Blow's wind (blowDye below). What
 * leaves a cell goes out through `mul`, the channel for dye taken away, and
 * what arrives comes in through the density deltas, both read from the same
 * mirror in the same pass, so what leaves one cell arrives in another and
 * nothing is made or lost. The share taken falls from `take` at the middle
 * to none at the rim; a cell whose landing is off the plate keeps its dye.
 * `cx`, `cy`, `r` and `hop` are in mirror cells. Returns the dye moved.
 */
export function carryDyeAlong(dye: ArrayLike<number>, N: number, cx: number, cy: number, r: number,
  ux: number, uy: number, take: number, hop: number, out: DyeOut): number {
  let moved = 0;
  const r2 = r * r;
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      const d2 = i * i + j * j;
      if (d2 > r2) continue;
      const sx = Math.round(cx + i), sy = Math.round(cy + j);
      const tx = Math.round(sx + ux * hop), ty = Math.round(sy + uy * hop);
      if (sx < 1 || sy < 1 || sx >= N - 1 || sy >= N - 1) continue;
      if (tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) continue;
      const si = sx + sy * N, ti = tx + ty * N;
      const s4 = si * 4;
      const amount = dye[s4 + 3];
      if (!(amount > 1e-5)) continue;
      const w = take * (1 - Math.sqrt(d2) / r);
      if (!(w > 1e-4)) continue;
      moved += amount * w;
      out.mul[si] *= 1 - w;
      out.density[ti] += amount * w;
      out.densityR[ti] += dye[s4] * w;
      out.densityG[ti] += dye[s4 + 1] * w;
      out.densityB[ti] += dye[s4 + 2] * w;
    }
  }
  return moved;
}

/**
 * The Blow's size and strength as each hand gives them, before the tool's
 * Amount: the mouse's (and a finger's on the phone's own plate), and a
 * remote hand's (performGesture: the phone as the laptop's remote, a pen,
 * OSC, a replayed take), whose directed blow is wider the harder it is
 * pressed. Here so that `npm run wind` measures the Blow the app blows,
 * not a copy of its numbers.
 */
export const BLOW_RADIUS = 4;
export const BLOW_STRENGTH = 0.06;
export const remoteBlowRadius = (amt: number, directed: boolean): number => directed ? BLOW_RADIUS + 2 * amt : BLOW_RADIUS;

/*
  The Blow on the colour (PLAN.md §15c).

  It was an eraser. Every step a Blow was held where it was not blowing a
  straw bubble (moved, or a second finger, or on a plate that is not the
  lead), the dye under it was multiplied by 0.8, which clears a patch in
  about ten steps, and its push outward was the one-step push the solver's
  speed clamp cuts back to idle (§15b). So the wind left a trail of black
  where it went and moved nothing: a light-show artist blowing across the
  plate pushes the colour ahead of the breath, and it piles up at the far
  side of where the air went. Measured (`npm run wind`, 30 readings of a
  mouse's Blow drawn a sixth of the plate from a pool's middle), the eraser
  lost 21% of the pool (a remote hand's directed one too) and moved its
  middle 1.05% of the plate backwards, because it cleared the side the wind
  went to; the push alone moved it 0.05%.

  So the wind carries the colour the way the Finger does, a take and a put,
  with the numbers the ferrofluid's wind already uses (blowCarry), so the
  colour and the ferrofluid go the same way from the same breath. Held still
  (a puff that is not the straw) it blows the colour out from under it onto
  the ring round it, the Press's ring (pressDye), which is conserving and
  has its oil's twin (pressOil), so an oil body under a puff goes out with
  its colour rather than left colourless. Moving, the oil goes along with
  its colour through carryMix, as under the Finger.

  `x`, `y` and `radius` are in cells of the N-cell mirror, as the tools
  have them; `dx`, `dy` of zero is held still. Returns the dye moved; the
  caller marks the mirror spent (dyeMoved) when it is more than nothing.
*/
export function blowDye(dye: ArrayLike<number>, N: number, x: number, y: number, radius: number, strength: number,
  dx: number, dy: number, out: DyeOut): number {
  const c = blowCarry(x, y, radius, strength, dx, dy, N);
  const r = Math.round(c.r * N);
  if (c.outward) return pressDye(dye, N, x, y, Math.max(2, r), c.take, out);
  return carryDyeAlong(dye, N, x, y, r, c.ux, c.uy, c.take, Math.round(c.hop * N), out);
}

export interface OilCarry extends OilPress {
  carryMix?(x: number, y: number, radius: number, ux: number, uy: number, take: number, hop: number): void;
}

/**
 * The oil's half of blowDye (Oil Bodies): the same take, the same hop or
 * the same ring, on the GPU. Arguments as blowDye's. A mirror cell x is the
 * plate's (x + 0.5) / N, as pressOil has it, so the oil's hand sits on the
 * colour's rather than half a cell off it.
 */
export function blowOil(gpu: OilCarry, x: number, y: number, radius: number, strength: number, dx: number, dy: number, N: number): void {
  const c = blowCarry(x, y, radius, strength, dx, dy, N);
  const r = Math.round(c.r * N);
  if (c.outward) { pressOil(gpu, x, y, Math.max(2, r), N, c.take); return; }
  gpu.carryMix?.((x + 0.5) / N, (y + 0.5) / N, r / N, c.ux, c.uy, c.take, Math.round(c.hop * N) / N);
}
