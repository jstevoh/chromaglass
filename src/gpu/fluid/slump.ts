/**
 * How the dye's slump runs a step (PLAN 18m, 18m-1a; the kernels and the
 * physics are in `../wgsl/slump.ts`), beside `passes.ts`, which dispatches
 * it, so neither it nor `../fluid.ts` grows. No class: numbers in, numbers out.
 *
 * `visc` is g′Δt/(3νΔx²) for one substep, in 1/m³: a cell's K Δt/Δx² is it
 * times η³(1 − η/b)³ and the dye's strength, on the GPU. `courant` is
 * Fr (Δt/Δx) √g′ for one substep: a cell's front Courant number is it times
 * √(η(1 − η/b)) and the strength. The substeps keep the fastest face (the
 * slower of its viscous rate and its Froude front, as the faces are) under
 * SLUMP_COURANT cells each, the sweeps are planned from the largest face rate
 * a substep can have, and both are planned from the deepest layer the plate
 * can hold (the dye's cap), not the plate's own thickest cell from the
 * measure: that lands a frame or two late, whenever its readback does, so
 * the plan (and the plate) would differ between two renders of the same seed
 * (`node scripts/render-app.mjs`: 221 of 240 frames differed from frame 20
 * when the old explicit substeps were planned from it). On a thick liquid
 * nothing moves (the rate goes as 1/ν: in glycerine a pool takes minutes to
 * spread a millimetre), and the plan is null: the pass is skipped.
 */
import { dyeDensityContrast } from '../../lib/turntable';
import { DYE_CAP, DYE_LAYER, FROUDE_FRONT, GAP_METRES, PLATE_METRES, SLUMP_COURANT, SLUMP_SUBSTEPS, SLUMP_SWEEPS, THIN_GAP_THICKNESS, thinGapViscosity } from './constants';

export interface SlumpPlan { visc: number; courant: number; substeps: number; sweeps: number }

export interface SlumpAsk {
  /** The step's seconds (`magnetSeconds`), a 60th when left out, held to 0.1. */
  seconds?: number;
  /** Thickness (`gapThickness`). */
  thickness?: number;
  /** Dye Weight (`solutalBuoyancy`). */
  dyeWeight?: number;
  /** Gravity, 0 flat to 1 upright (`plateUpright`): only cos θ of g is through the glass. */
  upright?: number;
}

export function slumpPlan(ask: SlumpAsk, N: number, coverGap: number): SlumpPlan | null {
  const seconds = Math.max(0, Math.min(0.1, ask.seconds ?? 1 / 60));
  const nu = thinGapViscosity(ask.thickness ?? THIN_GAP_THICKNESS);
  const upright = Math.max(0, Math.min(1, ask.upright ?? 0));
  const gPrime = 9.81 * dyeDensityContrast(ask.dyeWeight) * Math.cos(upright * Math.PI / 2);
  const dx = PLATE_METRES / N;
  const perStep = gPrime * seconds / (3 * nu * dx * dx);
  if (!(perStep > 0) || !Number.isFinite(perStep)) return null;
  const b = coverGap * GAP_METRES;
  // η³(1 − η/b)³ peaks at half the gap, and so does η(1 − η/b), the Froude speed's.
  const e = Math.min(DYE_CAP * DYE_LAYER, b / 2);
  const open = 1 - e / b;
  const mostVisc = perStep * e * e * e * open * open * open;
  // The front's Courant number for the step, at its fastest (Huppert and Simpson 1980).
  const mostFront = FROUDE_FRONT * (seconds / dx) * Math.sqrt(gPrime * e * open);
  if (Math.min(mostVisc, mostFront) < 1e-4) return null;
  // A face carries no more than the slower of its two regimes allows, so that is the front the substeps keep under a cell.
  const substeps = Math.max(1, Math.min(SLUMP_SUBSTEPS, Math.ceil(Math.min(mostFront, mostVisc) / SLUMP_COURANT)));
  const sweeps = Math.max(4, Math.min(SLUMP_SWEEPS, Math.ceil(2 * mostVisc / substeps) + 2));
  return { visc: perStep / substeps, courant: FROUDE_FRONT * (seconds / substeps / dx) * Math.sqrt(gPrime), substeps, sweeps };
}
