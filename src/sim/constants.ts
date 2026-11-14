/**
 * The plate's grid and the constants the solver and the frame loop share.
 *
 * Moved out of `components/LiquidVisualizer.tsx` with the solver (PLAN
 * 19ai-3): each was a module constant there, read by both the class and the
 * component, so it lives where both can import it rather than in either.
 * The numbers and the reasons written beside them are as they were. A check
 * that reads one of these by name (`turing` reads the drift rates) reads
 * this file.
 */
import { VisualizerSettings } from '../types';

/**
 * Where the closeup is fully itself, and what a look that only says "macro"
 * means by it.
 *
 * The travel from the plate to the closeup runs from 1x to MACRO_FULL_ZOOM:
 * below that the exposure, the defocus, the silhouette warp and the relief are
 * mixed in rather than switched on, so pushing the slider reads as a lens
 * moving. Two is low enough that nothing pops on the way past and high enough
 * that a bead is worth looking at when it lands.
 */
export const MACRO_FULL_ZOOM = 2.0;

/** A preset or a saved show that sets `macroMode` with no zoom of its own. */
export const MACRO_PRESET_ZOOM = 4.0;

/** The zoom the frame is asked for: the slider's, or a macro look's own. */
export function macroZoomOf(s: VisualizerSettings): number {
  const setZoom = s.macroZoom ?? 1;
  return s.macroMode === true ? (setZoom > 1.05 ? setZoom : MACRO_PRESET_ZOOM) : Math.max(1, setZoom);
}

/**
 * How far into the closeup, 0 at the plate and 1 from MACRO_FULL_ZOOM on,
 * eased at both ends so the first notch of the slider starts it moving
 * rather than starting it at a slope.
 */
export function macroAmountOf(s: VisualizerSettings): number {
  const t = Math.max(0, Math.min(1, (macroZoomOf(s) - 1) / (MACRO_FULL_ZOOM - 1)));
  return t * t * (3 - 2 * t);
}

export const GRID_SIZE = 192;                    // sim resolution — higher = smoother liquid edges

export const GRID_SCALE = GRID_SIZE / 128;       // brush/seed geometry was tuned at 128

/** Turbulence 1.0 as an rms speed in solver units (the GPU shader has the same 0.5). */
export const TURB_SPEED = 0.5;

/**
 * How fast the print's Drift, as the solver is handed it, may move: a share of the
 * full range a second. The feed map's amplitude arrives all at once otherwise, and
 * measured in the lab (scripts/turing.mjs) a settled print handed Drift 0.7 in one
 * frame starves where the feed falls, and a 32-pixel tile of the plate stays dead
 * for about twenty seconds: the grey patch again. Reaching 0.7 over twenty-eight
 * seconds (0.025 a second) leaves no tile flatter than the still print's. The
 * check reads this number from here, and the iteration count below, so what it ramps
 * by is what the app does.
 */
export const TURING_DRIFT_PER_SECOND = 0.025;

/**
 * The solver iterations a second the rate above is counted in: a frame of one sixtieth
 * runs round(2.5) = 3 of them, 60 frames a second. The slew moves by the iterations a
 * frame really ran, not by the frame's seconds, because a slow machine runs fewer
 * steps a frame and a fast display alternates frames of one and none: counted in
 * seconds the Drift would reach a settled print faster (or slower) per iteration than
 * the lab, which ramps by iterations, ever measured. The check reads this too.
 */
export const TURING_ITERATIONS_PER_SECOND = 180;

/*
  How far the dye actually moves per unit of velocity, relative to what the
  beads and bubbles assume. Both of them turn a velocity into cells with a
  fixed dt of 0.05 and an advection of 1 (0.05 × 190 cells × 60 steps a second),
  where the dye moves by the solver's own dt × advection — about 0.001 at the
  defaults, so they drifted fifty times faster than the liquid under them and
  ignored Speed and Advection. Multiplying the sampled velocity by this puts
  them on the dye's clock without touching their own tuning (the beads' lag,
  the bubbles' lead).
*/
export function particleFlowScale(fluid: { dt: number } | undefined, s: VisualizerSettings): number {
  if (!fluid) return 0;
  return (fluid.dt * Math.max(0, s.advection ?? 1)) / 0.05;
}

/*
  The lasting current's gains: the speed each force asks for, in solver velocity
  units (at the default Speed one unit is about ten cells a second on the
  192-cell plate). The current relaxes toward that at the rate Damping sets.
  Tuned on an M4 against the picture: a preset's usual setting should give a
  current you can follow by eye, and the top of each slider a strong one,
  without sweeping the plate clear.
*/
export const CUR_BUOY = 0.3;    // × buoyancy × tanh(20 × temperature): the heat field is small, ~0.03 on average

export const CUR_GRAV = 0.25;   // × centre gravity × (density − mean)

/*
  How much of a blow is swirl rather than push.

  A push is curl-free and the projection removes it within the same step; a
  swirl is not and survives. Measured against nothing else in the plate, so
  it is written down rather than derived: 0.55 is the point at which a puff
  still reads as a puff rather than as a stirring rod, and the dye it moves
  keeps drifting for several seconds instead of stopping with the finger.
*/
export const BLOW_SWIRL = 0.55;

/*
  How much of a finger's wake is roll rather than carry.

  Higher than a puff's, because a finger is a solid thing dragged through the
  liquid and sheds a stronger pair of vortices than air blown across it does —
  and because the roll is the part that survives the projection.
*/
export const FINGER_SWIRL = 0.8;

/*
  A pour of clear oil onto the clear film (PLAN §20b): this much of the gap
  added at the middle of the drop, falling to nothing at its rim. A drop of
  oil on an oil film merges into it, so it thickens what is there; half the
  gap at the middle is a drop that fills a hole it lands in.
*/
export const FILM_POUR = 0.5;

/*
  Oil Bodies' pours (the onDeposit hook): a body is this many times the
  bottle's own radius (Oil's is 2, so about a tenth of the plate across
  on the full dose), and the pours stop once the oil covers this share of
  the plate. A dish in a show is a third or so oil: enough bodies to crowd
  and merge, and water enough round them for the colour to move through.
*/
export const BODY_DROP = 3;

export const BODY_COVER = 0.35;

/** Rain Drip 1.0: the downhill current in the streaks, solver units (GPU: same 0.5). */
export const DRIP_SPEED = 0.5;

export const GRID_AREA = GRID_SIZE * GRID_SIZE;

/**
 * How much curvature counts as a boundary rather than a wash, as a fraction of
 * the local range of the dye. The sharpening pass leaves anything below it
 * alone; see the note in `sharpenDye` in gpuFluid.ts. The GPU shader carries
 * the same number.
 */
export const SHARP_FLOOR = 0.08;

// Density histogram used to expose the macro closeup (see "Macro film exposure").
export const FILM_BINS = 64;

export const FILM_BIN_SCALE = 16;   // bins per unit of density — covers 0..4
