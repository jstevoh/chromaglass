/**
 * The cover glass on its liquid (PLAN 38r-5): the solver's layer that lays the
 * gap's shape.
 *
 * Moved here from the squeeze stage of `step` in gpu/fluid.ts as it was, so
 * the cover's own state can be built beside it without growing that file
 * past its byte ceiling (CLAUDE.md "Size"; fluid.ts sat 21 bytes under it).
 */

import { FluidReads } from './reads';
import type { GpuStepParams } from '../solverTypes';

export class FluidCover extends FluidReads {
  /** The gap's shape: laid on a new plate, shifted on a new curve (the squeeze stage's first job). */
  protected gapShape(pass: GPUComputePassEncoder, p: GpuStepParams): void {
    /*
      A new plate shape is a new pair of glasses, not a press.

      The gap springs toward its rest dome at `gapSpring`, which is tuned
      for a press lifting — about a second — and measures as a time constant
      near half a minute on a slow plate. That is right for a press and
      wrong for the dome itself: turning Plate Shape up is swapping the
      glasses, and the answer should be the shape they are, not a shape they
      reach ninety seconds later. Measured before this: eight seconds after
      setting the curve to 1, the gap had moved a sixth of the way.

      So the gap is *shifted* by the change, in `gapReshape`, which leaves a
      press's own dent in place and does not touch the rate. Re-laying it
      outright was the first version and it is a trap: the plate shape is a
      per-plate patch target, so a sound or camera mapping can drive it every
      frame, and a reset would wipe a live press sixty times a second.
    */
    if (this.lastCurve === null) {
      /*
        A plate that has just appeared is laid at the shape it is meant to
        have, absolutely.

        This branch is not a formality. The ladder builds a new solver a few
        seconds into a show, and the clear that comes with it lays the gap
        flat — so a plate whose shape was already set came back flat and
        then crept toward its dome at the spring's rate. Measured: the dome
        held for six seconds, snapped to 0.03 everywhere, and started over.
        Adopting the current shape without laying it is what caused that.
      */
      for (const t of [this.squeeze.a, this.squeeze.b]) {
        this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
      }
      this.lastCurve = p.plateCurve;
      this.hsPrimed = false;
      this.phaseGapPrimed = false;
    } else if (this.lastCurve !== p.plateCurve) {
      this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
        this.arg('gap reshape', [this.lastCurve, p.plateCurve, 0, 0]));
      this.squeeze.swap();
      this.lastCurve = p.plateCurve;
      // New glasses, not a press: a thin gap takes the new shape as it is.
      this.hsPrimed = false;
      this.phaseGapPrimed = false;
    }
  }
}
