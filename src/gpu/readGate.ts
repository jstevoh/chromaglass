import type { ReadbackRing } from './kit';

/**
 * When the solver's fields are worth reading back, and which readbacks have
 * been handed out (PLAN 14ab-3, and 14j's "a readback every frame, even
 * frozen"), for `WebGPUFluid.readbackAsync`.
 *
 * The frame asks every frame, at the display's rate, and the solver steps at
 * its own. Each readback is two downsample dispatches, two 590 KB copies off
 * the GPU and two mappings, and it was asked for on every call: at 120 Hz with
 * sixty steps, or with the governor at thirty, every other frame read the
 * same fields back again, and a frozen plate read an unchanged one sixty times
 * a second. So every solver submit that may change a field is counted
 * (`wroteOne`), and a readback is wanted only when the count has moved since
 * the last one asked, or a ring has nothing from this epoch yet
 * (`forgetReadbacks`). A readback that found a ring with all its slots still
 * in flight is not counted as asked, so the next frame asks again rather than
 * leaving the mirror on the field before the write.
 *
 * And a landing is handed out once (`take`). It was taken whenever the ring
 * held anything, which was every frame after the first: the rows copied out
 * again and the caller's loop over every cell run again on the same numbers.
 * `syncFromGpu` counts what is taken as a fresh mirror (`rbSeq`), and the
 * bubbles' rim deposit is told by that count not to put the same displaced
 * dye back twice.
 */
export class ReadGate {
  private wrote = 1;
  private asked = 0;
  private readonly taken = new Map<ReadbackRing, number>();

  /** A submit that may have changed a field. */
  wroteOne(): void { this.wrote++; }

  /** Whether to ask: written since the last readback asked, or a ring with nothing landed this epoch. */
  wants(rings: readonly ReadbackRing[]): boolean {
    return this.wrote !== this.asked || rings.some((r) => !r.latest);
  }

  /** A readback asked for, every ring having found a free slot. */
  askedNow(): void { this.asked = this.wrote; }

  /** The ring's newest data if it has not been handed out before, else null. */
  take(ring: ReadbackRing): ArrayBuffer | null {
    const data = ring.latest;
    if (!data || this.taken.get(ring) === ring.landed) return null;
    this.taken.set(ring, ring.landed);
    return data;
  }
}
