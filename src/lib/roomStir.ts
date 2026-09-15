/**
 * The room, onto the plate.
 *
 * `sceneSense` says what the camera saw; this puts it in the liquid. It takes
 * the velocity arrays rather than the solver, for two reasons: the solver
 * lives in a React component and could not otherwise be measured outside a
 * browser, and with the GPU solver attached those arrays are the *deltas* for
 * the next step, flushed as `applyDeltas` before it runs — so one loop drives
 * both engines and neither needed a new upload path.
 *
 * ## The loop, and what actually holds it
 *
 * A camera that can see the projection closes a loop: the plate moves, the
 * camera reports the movement, the movement stirs the plate. Two guards were
 * tried against it and `scripts/scene.mjs` is why only one of them is here.
 *
 * Subtracting the steady part of the flow field does not catch it. A pattern
 * that travels is in any given cell for only a fraction of the time, so its
 * per-cell average is small and almost nothing is taken out: measured against
 * a bar going round for fourteen seconds, a four-second baseline removed 0 %.
 *
 * Comparing the room's flow against the plate's own velocity — the loop is the
 * plate seen through a lens, so it should agree with itself — does not catch it
 * either, and fails in a way worth writing down: a fan in the corner of the
 * frame scored *higher* on that agreement than a genuine feedback loop did.
 * From one camera the two are not distinguishable, because a driven plate moves
 * the way the room moved. That guard was built, measured, and taken out again.
 *
 * What does hold it is the per-cell cap. The room can add at most `ROOM_MAX` a
 * step, the solver damps what is already there, and the two together put a
 * ceiling on the loop: it saturates instead of diverging. The harness runs a
 * closed loop for forty seconds to show where that ceiling is. It is not a
 * reason to aim the camera at the screen — a saturated plate is a plate being
 * stirred by nothing in particular — but it is the difference between a look
 * that goes wrong and a show that has to be restarted.
 *
 * The baseline stays as well, for what it was always going to catch: a camera
 * drifting on its auto-exposure, or a gradient across the lens.
 */

import type { SceneReading } from './sceneSense';

/**
 * Velocity added per solver step at full drive, for a cell carrying a flow of
 * 1. A hand dragged across the plate with the blow tool adds about 0.06 a
 * step; the room at full tilt is meant to be a little stronger than that,
 * because it is a room.
 */
export const ROOM_VELOCITY = 0.9;
/** No single cell may add more than this a step, whatever the camera saw. */
export const ROOM_MAX = 0.25;
/** Seconds over which the steady part of the field is learned and taken out. */
export const ROOM_BASELINE = 4.0;
/** A reading older than this is not the room any more. */
export const ROOM_STALE_MS = 600;

export class RoomStir {
  /** The steady part of the flow, learned. Two floats a lattice cell. */
  private readonly base: Float32Array;
  private readonly lattice: number;

  constructor(lattice: number) {
    this.lattice = lattice;
    this.base = new Float32Array(lattice * lattice * 2);
  }

  reset(): void {
    this.base.fill(0);
  }

  /**
   * Add one solver step's worth of the room to a velocity field.
   *
   * `addVx`/`addVy` are what the solver will take next — the plate's velocity
   * on the CPU engine, this step's delta on the GPU one, `size * size` and
   * row-major either way. `strength` is the Room Drive setting, 0..1.
   */
  apply(
    addVx: Float32Array,
    addVy: Float32Array,
    size: number,
    r: SceneReading,
    strength: number,
    dt: number,
  ): void {
    const L = r.lattice;
    if (L !== this.lattice) return;
    const cells = L * L;
    const base = this.base;

    const creep = 1 - Math.exp(-dt / ROOM_BASELINE);
    for (let c = 0; c < cells; c++) {
      base[c * 2] += (r.flowX[c] - base[c * 2]) * creep;
      base[c * 2 + 1] += (r.flowY[c] - base[c * 2 + 1]) * creep;
    }

    const gain = strength * ROOM_VELOCITY;
    if (gain <= 0) return;

    for (let j = 1; j < size - 1; j++) {
      // The lattice sits on cell centres, so the sample is half a cell in.
      const gy = (j / size) * L - 0.5;
      const jf = Math.floor(gy);
      const j0 = jf < 0 ? 0 : jf > L - 1 ? L - 1 : jf;
      const j1 = j0 + 1 > L - 1 ? L - 1 : j0 + 1;
      const dyf = gy - j0;
      const ty = dyf < 0 ? 0 : dyf > 1 ? 1 : dyf;

      for (let i = 1; i < size - 1; i++) {
        const gx = (i / size) * L - 0.5;
        const xf = Math.floor(gx);
        const i0 = xf < 0 ? 0 : xf > L - 1 ? L - 1 : xf;
        const i1 = i0 + 1 > L - 1 ? L - 1 : i0 + 1;
        const dxf = gx - i0;
        const tx = dxf < 0 ? 0 : dxf > 1 ? 1 : dxf;

        const a = i0 + j0 * L, b = i1 + j0 * L, c = i0 + j1 * L, d = i1 + j1 * L;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;

        const fx = (r.flowX[a] - base[a * 2]) * w00 + (r.flowX[b] - base[b * 2]) * w10
                 + (r.flowX[c] - base[c * 2]) * w01 + (r.flowX[d] - base[d * 2]) * w11;
        const fy = (r.flowY[a] - base[a * 2 + 1]) * w00 + (r.flowY[b] - base[b * 2 + 1]) * w10
                 + (r.flowY[c] - base[c * 2 + 1]) * w01 + (r.flowY[d] - base[d * 2 + 1]) * w11;
        if (fx === 0 && fy === 0) continue;

        const ax = fx * gain, ay = fy * gain;
        const idx = i + j * size;
        addVx[idx] += ax < -ROOM_MAX ? -ROOM_MAX : ax > ROOM_MAX ? ROOM_MAX : ax;
        addVy[idx] += ay < -ROOM_MAX ? -ROOM_MAX : ay > ROOM_MAX ? ROOM_MAX : ay;
      }
    }
  }
}
