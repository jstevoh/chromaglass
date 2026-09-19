/**
 * Every texture unit the renderer binds, in one table.
 *
 * A texture that is the current draw's render target and is also bound on a
 * unit the draw's shader samples is a feedback loop: WebGL refuses the draw
 * (INVALID_OPERATION) and the frame comes out black. The units used to be
 * picked owner by owner, each looking for one "above" the others, and it went
 * wrong twice:
 *
 * - The output pass took 11, which the plate binds its bead mask on every
 *   frame. The frame the pass was first built (the first touch of any
 *   projector control) and every resize after, the plate drew into a target
 *   that was also on its own bead unit: a black frame.
 * - The flash guard's probe took 12, which the plate uses for pigment
 *   coordinates. Harmless only because the probe is never sampled.
 *
 * Every owner now reads its unit from here, so two owners can only share a
 * unit by sharing a line in this table.
 *
 * WebGL2 guarantees 32 combined units; one shader can sample at most 16.
 */
export const UNIT = {
  /** The plates' packed dye. The GPU solver also works on 0–3 while it steps. */
  layer0: 0,
  layer1: 1,
  /** The derive pass's output, per plate (0 is also its source while it runs). */
  derived0: 2,
  derived1: 3,
  /** The post chain's two targets: the picture, and the one being written. */
  post0: 4,
  post1: 5,
  /** The plates' velocity, for the closeup and the cells. */
  vel0: 6,
  vel1: 7,
  /** The film projector's frame. */
  film: 8,
  /** The camera pass: the plate as drawn, and its aux target. */
  cameraScene: 9,
  cameraAux: 10,
  /** The oil beads' mask. */
  beads: 11,
  /** Pigment coordinates, per plate. */
  grain0: 12,
  grain1: 13,
  /** The mark (Logo & Titles). */
  mark: 14,
  /** The output pass's target. */
  output: 15,
  /** The flash guard's probe. */
  probe: 16,
  /** The post chain's frame-history ring. */
  history: 17,
} as const;
