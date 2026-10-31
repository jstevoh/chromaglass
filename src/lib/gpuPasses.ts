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

/** A profiler as this file reads it: whether it is timing, and its smoothed ms per label. */
export interface PassClock {
  readonly enabled: boolean;
  readonly ms: ReadonlyMap<string, number>;
}

/**
 * A layer's solver profiler, or null for a layer with no GPU solver. The
 * caller says how to find it (`gpu/gpuTimes.ts`: an `instanceof` the solver
 * class), so this file stays free of the GPU and a node check can drive it
 * with plain objects.
 */
export type ClockOf<L> = (layer: L) => { readonly ms: ReadonlyMap<string, number> } | null;

/**
 * The steps a frame is taking, from the loop's steps a second and its frame
 * interval in ms: sixty steps a second at 33.3 ms frames is two a frame. Not
 * the frame's own count, which is a whole number that alternates (0, 1, 1, 2)
 * on an uneven clock; the readout is smoothed, so its scale is too.
 */
export function stepsPerFrame(stepsPerSec: number, frameMs: number): number {
  const s = stepsPerSec * frameMs / 1000;
  return Number.isFinite(s) && s > 0 ? s : 0;
}

/**
 * One solver step, every layer together (ms). The governor asks it every
 * frame (`gpuStepMs`), so it is a plain loop that makes nothing.
 */
export function solverStepMs<L>(layers: readonly L[], clockOf: ClockOf<L>): number {
  let ms = 0;
  for (const layer of layers) {
    const clock = clockOf(layer);
    if (!clock) continue;
    for (const v of clock.ms.values()) ms += v;
  }
  return ms;
}

/**
 * What the GPU spent on a frame that took `steps` steps (ms): the drawing,
 * plus one solver step per layer for each step. The governor's number, and
 * what the readout's total must come to for the same steps.
 */
export function frameGpuMs<L>(drawing: PassClock | null, layers: readonly L[], clockOf: ClockOf<L>, steps: number): number {
  if (!drawing) return 0;
  let ms = 0;
  for (const v of drawing.ms.values()) ms += v;
  return steps > 0 ? ms + solverStepMs(layers, clockOf) * steps : ms;
}

/**
 * The frame's passes, costliest first, in ms a frame.
 *
 * `drawing` is the stage's profiler, null before there is a stage. Null
 * comes back when there is none or when it is not timing: a device without
 * 'timestamp-query' still has a profiler, with an empty map, and an empty list
 * would read as a frame that cost nothing (or as timings still on their way,
 * for ever), so the readout says "no timestamps" instead. Each layer's solver
 * passes are per step, so they are multiplied by `stepsPerFrame`.
 */
export function framePasses<L>(
  drawing: PassClock | null,
  layers: readonly L[],
  clockOf: ClockOf<L>,
  stepsPerFrame: number,
): GpuPassTime[] | null {
  if (!drawing || !drawing.enabled) return null;
  const steps = Number.isFinite(stepsPerFrame) && stepsPerFrame > 0 ? stepsPerFrame : 0;
  const out: GpuPassTime[] = [];
  for (const [label, ms] of drawing.ms) if (ms >= PASS_FLOOR_MS) out.push({ label, ms });
  let n = 0;
  for (const layer of layers) {
    const clock = clockOf(layer);
    if (!clock) continue;
    n++;
    // The first layer is the plate everyone means; only the ones behind it are named.
    const tag = n > 1 ? `L${n} ` : '';
    for (const [label, ms] of clock.ms) {
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
