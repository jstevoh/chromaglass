/**
 * A hand in the liquid as a solid (PLAN.md §15b, §18a-3): what the Finger
 * lays for the thin gap's solve to hold (hsPrep, in src/gpu/wgsl/thinGap.ts).
 *
 * What was there. The Finger added a disc of velocity, its push along the
 * stroke and a pair of counter-rotations either side, to the flow, and
 * moved the colour, the oil and the ferrofluid by hand-written carries
 * (carryDye, carryMix, fingerCarry), because the flow could not: on the old
 * plate the push was cut back to idle by the speed clamp at the end of the
 * step it was added in. On a thin gap (every look since #248) the clamp is
 * gone, but the push still moved nothing: a disc of velocity laid over
 * still liquid is mostly the divergent part of the flow, and the solve that
 * makes the flow conserve liquid takes that straight back out. Measured in
 * the lab on Classic's plate (`npm run fingerflow`), a Finger drawn 0.4 of
 * the plate through bands of colour moved them no further than the plate
 * moves them on its own.
 *
 * What a finger in a thin layer is: a solid that spans the layer and moves
 * at the hand's speed. The liquid it touches moves with it (no slip), the
 * liquid ahead has to get out of its way and the liquid behind closes in,
 * and how far round it the liquid is dragged is the solve's business, set
 * by the gap and the liquid's thickness. Brinkman's penalised solid puts
 * that in the solve: a second drag inside the hand, toward the hand's own
 * velocity, where χ is how much of the cell the hand fills (handEdge says
 * how it falls off at the hand's rim).
 *
 * Laid as (Σ χ·U, Σ χ) a cell, U the hand's own motion this step in cells
 * of the plate the hands lay on, so two hands overlapping share the cells
 * at their mean velocity and the solver takes the ratio.
 */

/*
  How hard a hand holds the liquid it touches (hsPrep, wgsl/thinGap.ts): the
  penalised solid's drag toward the hand's speed, in units of the cell's own
  drag. At 40 the liquid where the hand fills the cell goes at 40/41 of the
  hand's speed whatever its thickness. Higher holds closer to it and makes
  the hand's cells a steeper jump in mobility for the pressure solve (c falls
  as 1/(1 + 40)); lower lets the liquid slip through the hand: at 5 a stroke
  carried bands of colour half as far (`npm run fingerflow`, lab).
*/
export const HAND_GRIP = 40;

/**
 * The edge of a finger, in cells of an L-cell plate. A hand's no-slip does
 * not stop at its skin: in a thin layer the drag a solid puts on the liquid
 * beside it reaches out over the Brinkman screening length, h/√12 for a gap
 * h (the in-plane viscosity against the glass's drag), about 1.7 mm in the
 * plate's 6 mm middle. So χ ramps from 1 to 0 over two of those, ending at
 * the finger's radius. It was the numbers' reason too, while the carries
 * crossed faces rebuilt from the cells' velocities (PLAN 18a-8): a hard edge
 * (a cell and a half, the first try) is a forty-fold jump in the liquid's
 * mobility within a cell, and a drop of oil drawn 0.4 of the plate lost 1.2%
 * of itself at the jump, 0.44% over two Brinkman lengths (3.3 cells on the
 * app's 192). The carries now cross the thin solve's own faces (THIN_FACE),
 * which keep it whole (`npm run fingerflow`, lab), so the edge is the
 * physics' alone.
 */
export function handEdge(L: number): number {
  return (2 * 0.03 * L) / Math.sqrt(12);
}

/**
 * A finger at (x, y), `r` cells across its radius, that moved (mx, my)
 * cells this step, into `out` (L × L × 4). Cells at the plate's border are
 * left alone, as every tool leaves them. Returns how many cells it touched.
 */
export function layFinger(out: Float32Array, L: number, x: number, y: number, r: number, mx: number, my: number, edge = handEdge(L)): number {
  let cells = 0;
  const reach = Math.ceil(r);
  const cx = Math.round(x), cy = Math.round(y);
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      const nx = cx + i, ny = cy + j;
      if (nx <= 0 || nx >= L - 1 || ny <= 0 || ny >= L - 1) continue;
      const chi = Math.max(0, Math.min(1, (r - Math.hypot(nx - x, ny - y)) / edge));
      if (chi <= 0) continue;
      const k = (nx + ny * L) * 4;
      out[k] += chi * mx;
      out[k + 1] += chi * my;
      out[k + 2] += chi;
      cells++;
    }
  }
  return cells;
}
