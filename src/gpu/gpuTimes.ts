/**
 * What the GPU spent, read off the profilers' timestamps: the frame's cost
 * for the governor, and every pass by name for `?debug`'s readout (PLAN.md
 * 14ab-16).
 *
 * The stage keeps one `GpuProfiler` for the drawing and each solver keeps its
 * own for its passes; the stage's only sees what the stage encodes, so the
 * expensive half of a frame at the top rungs is in the solvers'. These were
 * summed inline in the visualizer's renderer; they are here so the readout's
 * list and the governor's number come from one reading of the same maps, and
 * so the visualizer, which may not grow (`npm run sizes`), carries one line
 * for each instead of a loop.
 *
 * `solverStepMs` runs every frame (the governor's `gpuStepMs`), so it is a
 * plain loop that makes nothing. `framePasses` makes an array and an object
 * per pass, and is asked once a second and only under `?debug`.
 */

import { gpuPassTimes, type GpuPassTime } from '../lib/gpuPasses';
import { WebGPUFluid } from './fluid';
import type { WebGPUStage } from './stage';

/** A plate layer, as far as this file cares: its solver, if it is a GPU one. */
type Layer = { readonly gpu: unknown };

/** One solver step, every layer together (ms): the solver keeps its own profiler, per pass and per step. */
export function solverStepMs(layers: readonly Layer[]): number {
  let ms = 0;
  for (const f of layers) {
    if (!(f.gpu instanceof WebGPUFluid)) continue;
    for (const v of f.gpu.profiler.ms.values()) ms += v;
  }
  return ms;
}

/**
 * The drawing, plus one solver step per layer for each step the loop took
 * (ms). The profilers' numbers are per pass and per step, so the steps are
 * what turns them into the cost of a frame.
 */
export function frameGpuMs(stage: WebGPUStage | null, layers: readonly Layer[], steps: number): number {
  if (!stage) return 0;
  let ms = 0;
  for (const v of stage.profiler.ms.values()) ms += v;
  return steps > 0 ? ms + solverStepMs(layers) * steps : ms;
}

/**
 * Every pass, costliest first, in ms a frame (`lib/gpuPasses.ts`), or null
 * where the device granted no timestamps: then every profiler is off and
 * an empty list would read as a frame that cost nothing.
 */
export function framePasses(stage: WebGPUStage | null, layers: readonly Layer[], stepsPerFrame: number): GpuPassTime[] | null {
  if (!stage || !stage.profiler.enabled) return null;
  return gpuPassTimes(
    stage.profiler.ms,
    layers.map((f) => (f.gpu instanceof WebGPUFluid ? f.gpu.profiler.ms : null)),
    stepsPerFrame,
  );
}
