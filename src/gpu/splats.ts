/**
 * A frame's pours, as records for the GPU (docs/webgpu-plan.md, P2).
 *
 * The app builds this list where it used to paint 192² arrays: one call per
 * drop, stroke, beat or preset blob, in the same logical-cell geometry. The
 * solver turns the list into full-resolution deltas in one dispatch
 * (`wgsl/splat.ts`).
 *
 * Colour is stored the way `addDensity` stores it — the dye's absorbance
 * (`lib/dye.ts`) weighted by how much dye lands — so the mixing is the mixing
 * the plate has always done.
 */
import { dyeAbsorbances } from '../lib/dye';

/** Floats per record; four vec4s (see `Splat` in wgsl/splat.ts). */
export const SPLAT_FLOATS = 20;

export type Falloff = 'flat' | 'linear' | 'squared' | 'gaussian';

const FALLOFF: Record<Falloff, number> = { flat: 0, linear: 1, squared: 2, gaussian: 3 };

export interface SplatOpts {
  /** How much dye lands at the middle. */
  amount?: number;
  /** The dye's colour, 0..1 per channel. */
  colour?: [number, number, number];
  /** Velocity added at the middle, in plate units. */
  vx?: number;
  vy?: number;
  /** Heat added at the middle. */
  temp?: number;
  /** Change in the plate gap (a press is negative). */
  gap?: number;
  /** What the dye already there is multiplied by at the middle. 1 leaves it. */
  mul?: number;
  falloff?: Falloff;
}

export class SplatList {
  private data: Float32Array;
  private n = 0;

  constructor(capacity = 256) {
    this.data = new Float32Array(capacity * SPLAT_FLOATS);
  }

  get count(): number { return this.n; }
  /** The records, packed, ready for the buffer. */
  get records(): Float32Array { return this.data.subarray(0, this.n * SPLAT_FLOATS); }
  get empty(): boolean { return this.n === 0; }

  clear(): this { this.n = 0; return this; }

  /** A disc, in logical cells. Radius 0 is the single cell under (x, y). */
  disc(x: number, y: number, radius: number, o: SplatOpts = {}): this {
    return this.write(x, y, Math.max(radius, 0.5), 0, x, y, o);
  }

  /** A stroke from (x0, y0) to (x1, y1), in logical cells. */
  line(x0: number, y0: number, x1: number, y1: number, radius: number, o: SplatOpts = {}): this {
    return this.write(x0, y0, Math.max(radius, 0.5), 1, x1, y1, o);
  }

  private write(x: number, y: number, radius: number, kind: number, ex: number, ey: number, o: SplatOpts): this {
    if (this.n * SPLAT_FLOATS >= this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const d = this.data;
    const i = this.n * SPLAT_FLOATS;
    const amount = o.amount ?? 0;
    const [r, g, b] = o.colour ?? [1, 1, 1];
    d[i] = x; d[i + 1] = y; d[i + 2] = radius; d[i + 3] = kind;
        const [ar, ag, ab, a3, a4, a5] = dyeAbsorbances(r, g, b);
    d[i + 4] = amount * ar;
    d[i + 5] = amount * ag;
    d[i + 6] = amount * ab;
    d[i + 7] = amount;
    d[i + 8] = amount * a3;
    d[i + 9] = amount * a4;
    d[i + 10] = amount * a5;
    d[i + 11] = 0;
    d[i + 12] = o.vx ?? 0; d[i + 13] = o.vy ?? 0; d[i + 14] = o.temp ?? 0; d[i + 15] = o.gap ?? 0;
    d[i + 16] = o.mul ?? 1; d[i + 17] = FALLOFF[o.falloff ?? 'flat']; d[i + 18] = ex; d[i + 19] = ey;
    this.n++;
    return this;
  }
}
