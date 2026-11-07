/**
 * What the GPU spent, read off the profilers' timestamps: the frame's cost
 * for the governor, and every pass by name for `?debug`'s readout (PLAN.md
 * 14ab-16).
 *
 * The stage keeps one `GpuProfiler` for the drawing and each solver keeps its
 * own for its passes; the stage's only sees what the stage encodes, so the
 * expensive half of a frame at the top rungs is in the solvers'. The sums were
 * written inline in the visualizer's renderer; the arithmetic is now in
 * `lib/gpuPasses.ts`, where `npm run passtimes` holds it with plain objects,
 * and this file is only where a layer's solver is found: a `WebGPUFluid`'s
 * profiler, which a node check cannot build (the solver needs a device).
 * The visualizer, which may not grow (`npm run sizes`), carries one line for
 * each.
 */

import { frameGpuMs as frameMs, framePasses as passes, solverStepMs as stepMs, stepsPerFrame, type GpuPassTime } from '../lib/gpuPasses';
import { WebGPUFluid } from './fluid';
import type { WebGPUStage } from './stage';

/** A plate layer, as far as this file cares: its solver, if it is a GPU one. */
type Layer = { readonly gpu: unknown };

const clockOf = (f: Layer) => (f.gpu instanceof WebGPUFluid ? f.gpu.profiler : null);

/** One solver step, every layer together (ms); every frame, for the governor. */
export const solverStepMs = (layers: readonly Layer[]): number => stepMs(layers, clockOf);

/** The drawing, plus one solver step per layer for each step the loop took (ms). */
export const frameGpuMs = (stage: WebGPUStage | null, layers: readonly Layer[], steps: number): number =>
  frameMs(stage?.profiler ?? null, layers, clockOf, steps);

/**
 * Every pass, costliest first, in ms a frame, for a loop taking `stepsPerSec`
 * steps a second at `frameMs` frames; null where the device grants no timestamps.
 */
export const framePasses = (stage: WebGPUStage | null, layers: readonly Layer[], stepsPerSec: number, frameMs: number): GpuPassTime[] | null =>
  passes(stage?.profiler ?? null, layers, clockOf, stepsPerFrame(stepsPerSec, frameMs));
