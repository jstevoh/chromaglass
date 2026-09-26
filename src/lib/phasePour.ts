/**
 * Where a look pours its ferrofluid when it is laid.
 *
 * This lived inside `LiquidVisualizer`'s layPhase as one shape, a ring of
 * large drops round the middle. It is here, apart from the app, so that the
 * lab (`npm run ferropour`) pours exactly what the app pours rather than a
 * copy of it that drifts, and so that a look can ask for a different shape.
 *
 * Every drop is a soft disc added to the phase (phaseSplat in
 * src/gpu/wgsl/fluid.ts): 1 − d² of its amount at distance d of its radius
 * from the middle, so one drop holds amount · πr²/2 of ferrofluid.
 */

/**
 * `ring`: today's pour, and every look's but the ones listed in
 * PRESET_PHASE_POUR (src/presetPlate.ts). A few to two dozen drops on a
 * golden-angle spiral from 0.16 to 0.46 of the plate out, big when Ferrofluid
 * Scale is up. The middle is left clear and the corners bare, which is right
 * for Magnet Garden (a pool for the magnet to stand up) and Ferro Maze (a
 * maze drawn on a white table, the table round it is part of the picture).
 *
 * `scatter`: the ferrofluid over the whole plate, as many small drops.
 * Written for Ferro Paint, after the owner called it underwhelming beside
 * Chemical Bouillon's Colored I and II. In those the ferrofluid is worked
 * through the colour edge to edge: black channels and beads between cells of
 * dye across the whole frame, hundreds of them. Poured as a ring, the maze
 * only ever formed where the ring was, and most of the plate stayed plain
 * soft colour with a few black continents in it (the lab at 512², with Maze
 * Detail 0.55: fine fingers, still only in the ring). Poured this way, every
 * part of the plate has ferrofluid to finger out, and the maze fills it.
 */
export type PhasePourShape = 'ring' | 'scatter';

export interface PhaseDrop { x: number; y: number; r: number; amount: number }

/*
  How much of the plate the scatter covers with ferrofluid, per unit of
  Ferrofluid (phaseAmount). At Ferro Paint's 0.8 that is 0.4 of the plate's
  area in liquid (180 drops), and in the lab at 512² under Ferro Paint's field
  it set into black channels winding through the colour, Colored I's
  labyrinth. At 0.29 (130 drops) it broke up into separate black beads and
  worms on the colour instead: Colored I's spots, but none of its channels.
*/
const SCATTER_COVER = 0.5;
/*
  A splat is 0.9 full at its middle, as the ring's are: under half full it
  would not separate at all, and a full one clamps where drops overlap and
  loses liquid.
*/
const DROP_FILL = 0.9;
/*
  Enough to cover the plate with the finest drop Scale gives (0.02 of the
  plate), and a cap on how many one-off dispatches the pour makes.
*/
const SCATTER_MAX = 400;

/**
 * The drops for a pour, in plate coordinates (0–1).
 *
 * @param scale Ferrofluid Scale (phaseScale), 0–1: bigger and fewer drops.
 * @param amount Ferrofluid (phaseAmount), 0–1: how much is poured. The ring
 *   has always poured the same whatever this is (it sets how dark the
 *   ferrofluid draws), and it still does, so no look laid today changes.
 */
export function phasePour(shape: PhasePourShape, scale: number, amount: number): PhaseDrop[] {
  const s = Math.max(0, Math.min(1, scale));
  const drops: PhaseDrop[] = [];
  if (shape === 'scatter') {
    // 0.02 to 0.086 of the plate: Ferro Paint's Scale 0.3 gives 0.04, drops
    // about a third the width of the ring's at the same Scale, which is what
    // lets the maze start everywhere at once rather than from a few edges.
    const r = 0.02 + s * 0.066;
    const cover = SCATTER_COVER * Math.max(0, Math.min(1, amount));
    const count = Math.min(SCATTER_MAX, Math.round(cover / (DROP_FILL * Math.PI * r * r / 2)));
    for (let k = 0; k < count; k++) {
      // The R2 sequence (the plastic number's powers): even without a grid,
      // so there are no rows for the eye to find and no clumps or bare
      // patches for the maze to inherit. Deterministic, as the ring is: the
      // same look laid twice is the same plate twice, which rendering a song
      // depends on.
      drops.push({
        x: 0.03 + 0.94 * ((0.5 + k * 0.7548776662466927) % 1),
        y: 0.03 + 0.94 * ((0.5 + k * 0.5698402909980532) % 1),
        r, amount: DROP_FILL,
      });
    }
    return drops;
  }
  const count = Math.round(3 + (1 - s) * 22);
  const r = 0.04 + s * 0.16;
  for (let k = 0; k < count; k++) {
    const a = k * 2.399963229728653;
    const rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
    drops.push({ x: 0.5 + Math.cos(a) * rad, y: 0.5 + Math.sin(a) * rad, r, amount: DROP_FILL });
  }
  return drops;
}
