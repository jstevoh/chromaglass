/**
 * The thin solve's faces as the flow's state (PLAN 18a-8): what each face of
 * the grid would carry before the pressure turns it, for hsDivergence.
 *
 * What was reported, and what was measured. The thin gap's step kept the
 * velocity at the cells: hsPrep's u* was each cell's last velocity plus its
 * forces, the solve's faces carried the mean of two cells' M·u*, and
 * hsGradient gave each cell back its own M·u* less the mean of its two
 * faces' corrections. So a checkerboard in the cells' velocities (+u, −u,
 * +u along a row) had a mean of nothing at every face: the solve never saw
 * it, nothing but the drag took it out, and the next step began from it
 * again. In the lab (`npm run gridnull`), a checkerboard laid on an open
 * plate of water kept 93% of itself through a step and half through ten,
 * which is what the drag alone leaves (an oil's drag takes it in a step, so it shows least
 * there), and a floored dent's rim, where the corrections on a cell's two
 * faces are the most unlike, laid a new one every step. Everything that
 * reads the flow at a cell read that weave with it.
 *
 * What a real liquid has is no grid at all, and the grid that comes closest
 * to that for an incompressible flow is the staggered one (Harlow and Welch's
 * marker-and-cell): the velocity across each face is the state, the
 * divergence is read from the faces themselves, and every mode of the faces
 * is one the pressure sees. So the faces are kept: hsGradient leaves each
 * face's velocity in `flow` (the cell's east face, then its north, then
 * the solve's P at the cell for the oil's lip), and the
 * next step predicts each face from its own last velocity plus what the
 * step's forces asked of its two cells, the mean of the two, rather than
 * from the mean of the two cells' velocities. The forces stay at the cells
 * (they are written there by every kernel before the solve); a force laid
 * in a checkerboard averages to nothing at a face, which is right for a
 * push finer than the grid can carry, and lasts no further than its step.
 *
 * Why not rebuild the cell from its two faces and keep the cells as the
 * state (the obvious thing, tried first in PLAN 18a-8): that is a [1 2 1]
 * filter of the flow every step, a damping of 0.85 a step at eight cells,
 * which takes water's inertia out with the checkerboard.
 *
 * What the forces asked of a cell is u* less the velocity the cell was left
 * at, the mean of its two faces rounded as the half float the velocity is
 * stored in (quantizeToF16), so a cell nothing pushed asks exactly nothing
 * and the face carries itself unchanged. Anything that changed the cells'
 * velocities between two solves (the viscosity stage, a ferrofluid's
 * momentum, the decay, a regrid laying a new grid's flow, a wipe) is a
 * change the same way and reaches the faces as one.
 *
 * Each face's M·u* is the mean of its two cells' M times the face's
 * velocity plus that cell's ask, as before the faces were state, so a hand's
 * solid (whose cells ask for the hand's speed against a drag forty times
 * the liquid's, hsPrep) still drives the faces beside it at what the cell
 * holds, and `npm run fingerflow` reads the same stroke.
 */

/** starFace(q, ax, n): M·u* through cell q's east (ax 0) or north (ax 1) face. Needs `vel` (u*), `mob`, `flow`. */
export const FACE_STAR = /* wgsl */ `
fn fsIn(q: vec2i, n: i32) -> bool { return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n; }
fn fsAxis(ax: i32) -> vec2i { return select(vec2i(0, 1), vec2i(1, 0), ax == 0); }
// The velocity hsGradient left through cell q's face on the axis; nothing past the grid.
fn fsFlow(q: vec2i, ax: i32, n: i32) -> f32 {
  if (!fsIn(q, n)) { return 0.0; }
  let f = flow[q.x + q.y * n];
  return select(f.y, f.x, ax == 0);
}
// What this step asked of cell q on the axis: u* less the velocity it was left at, as stored.
fn fsAsk(q: vec2i, ax: i32, n: i32) -> f32 {
  let left = quantizeToF16(0.5 * (fsFlow(q, ax, n) + fsFlow(q - fsAxis(ax), ax, n)));
  let u = textureLoad(vel, q, 0).xy;
  return select(u.y, u.x, ax == 0) - left;
}
fn starFace(q: vec2i, ax: i32, n: i32) -> f32 {
  let b = q + fsAxis(ax);
  if (!fsIn(q, n) || !fsIn(b, n)) { return 0.0; }
  let ma = mob[q.x + q.y * n];
  let mb = mob[b.x + b.y * n];
  if (ma == 0.0 || mb == 0.0) { return 0.0; }
  let uf = fsFlow(q, ax, n);
  return 0.5 * (abs(ma) * (uf + fsAsk(q, ax, n)) + abs(mb) * (uf + fsAsk(b, ax, n)));
}
`;
