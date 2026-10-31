/**
 * Every GPU pass of a frame and what it cost, for `?debug`'s readout under
 * the grid (PLAN.md 14ab-16).
 *
 * What was asked. The owner wanted to know where the GPU's time goes, pass by
 * pass, on their own machine. The timings were already being taken: the stage
 * and every solver keep a `GpuProfiler` (`gpu/kit.ts`) that puts a timestamp
 * pair on each labelled pass wherever the device grants 'timestamp-query',
 * because the governor reads the frame's GPU cost from them (14aa-3). What
 * they reached was a console line, `chromaglassDebug().webgpu`, and the
 * `npm run stages` harness. Nothing on the screen said "the plate pass is
 * 2 ms and the pressure solve is 1.2", which is the sentence a person tuning a
 * look or a grid wants.
 *
 * This is the arithmetic between the profilers and that sentence, kept apart
 * from both so a node check (`npm run passtimes`) can hold it without a GPU.
 *
 * **Per frame, not per pass.** The stage's passes (the plate, the camera, the
 * finish, the output) run once a frame. The solver's run once a *step*, and a
 * frame takes as many steps as the step clock owes it: two at sixty steps on a
 * thirty-frame plate, half of one at thirty steps on a sixty-frame plate. Put
 * side by side unscaled, a 1.2 ms pressure solve on the first plate reads as
 * cheaper than a 1.5 ms plate pass when it costs the frame 2.4. So the solver's
 * numbers are multiplied by the steps a frame is taking, which is also how the
 * governor turns them into a frame's cost (`gpuFrameMs`).
 *
 * **What is not a reading.** A profiler's entry for a pass that stopped running
 * decays toward zero rather than vanishing (`GpuProfiler.afterSubmit` says why),
 * so a pass switched off an hour ago is still in the map at 1e-30 ms. Those
 * are dropped below a microsecond: a pass that cheap is not a pass anyone is
 * looking for, and a list of forty entries mostly at zero hides the six that
 * matter.
 *
 * **Chrome's timestamps are coarse.** Chrome quantises timestamp queries to
 * 100 µs unless its WebGPU developer features are on. Each pass's begin and
 * end are rounded separately and the profiler smooths over about ten frames,
 * so a 40 µs pass averages out near 40 µs rather than reading 0 or 100, but a
 * single frame's number under a tenth of a millisecond is noise. Read the
 * order, and the big ones.
 */

/** One GPU pass and what it cost a frame. */
export interface GpuPassTime {
  /** The pass's label; `L2 squeeze` for the second layer's. */
  label: string;
  /** Milliseconds a frame, smoothed. */
  ms: number;
}

/** Below this a decayed entry is not a reading (ms): see the header. */
export const PASS_FLOOR_MS = 0.001;

/**
 * The frame's passes, costliest first.
 *
 * `drawing` is the stage's profiler map (ms a frame), or null when the device
 * has no timestamps, and then the answer is null: the readout says so rather
 * than showing an empty list that looks like a frame that cost nothing.
 * `solvers` is each layer's profiler map (ms a step), null for a layer with no
 * GPU solver; `stepsPerFrame` is the steps the loop is taking a frame.
 */
export function gpuPassTimes(
  drawing: ReadonlyMap<string, number> | null,
  solvers: readonly (ReadonlyMap<string, number> | null)[],
  stepsPerFrame: number,
): GpuPassTime[] | null {
  if (!drawing) return null;
  const steps = Number.isFinite(stepsPerFrame) && stepsPerFrame > 0 ? stepsPerFrame : 0;
  const out: GpuPassTime[] = [];
  for (const [label, ms] of drawing) if (ms >= PASS_FLOOR_MS) out.push({ label, ms });
  let layer = 0;
  for (const solver of solvers) {
    if (!solver) continue;
    layer++;
    // The first layer is the plate everyone means; only the ones behind it are named.
    const tag = layer > 1 ? `L${layer} ` : '';
    for (const [label, ms] of solver) {
      const perFrame = ms * steps;
      if (perFrame >= PASS_FLOOR_MS) out.push({ label: tag + label, ms: perFrame });
    }
  }
  return out.sort((a, b) => b.ms - a.ms);
}

/** The whole frame's GPU time: the sum of the passes. */
export function gpuPassTotal(passes: readonly GpuPassTime[]): number {
  let ms = 0;
  for (const p of passes) ms += p.ms;
  return ms;
}
