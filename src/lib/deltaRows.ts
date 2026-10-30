/**
 * Which rows of the CPU's delta grids hold something to hand to the GPU solver
 * (PLAN.md 14ab-4).
 *
 * With the GPU solver attached, the plate's CPU arrays are not the plate but
 * what the CPU's writers added since the last step: a bubble's rim, a hand in
 * the liquid, a breath, a tool's few cells. `flushDeltas` used to copy all
 * 192² cells of them into two interleaved arrays and upload all three grids,
 * about 1.3 MB through three `writeTexture`s a step, and a hand's grid and a
 * breath's another 590 KB each, for what was usually a ring of a few hundred
 * cells. Measured in node on the copy alone: 206 µs a flush, before the upload.
 *
 * So the writers say which rows they wrote, and only those go across. Finding
 * the rows afterwards by looking was tried first and measured: scanning nine
 * arrays for a non-zero row costs 400 µs on a plate with a few cells written
 * in the middle, twice what the copy it would save costs. The writer knows
 * where it wrote for nothing.
 *
 * A writer that does not say (`whole()`, which FluidSimulation's old `dirty =
 * true` now means) sends the whole grid, as before: a writer that forgets is
 * slower, never wrong. The room's stir, a press, a lift and the liquids' own
 * step cover the plate or near it and stay whole.
 *
 * The rows are a mask, not one span from the first row written to the last:
 * a bubble near the top and a hand near the bottom in the same step are two
 * bands, and one span over both sent most of the plate (`npm run frameuploads`
 * read 1.10 MB of 1.33 for one cell, a hand's rows two flushes back being the
 * other end of the span). Bands closer than `MERGE_ROWS` go as one upload, so
 * a ring of bubbles is not thirty `writeTexture`s.
 *
 * The GPU's side of it is `rowsToWrite`: the solver's copy of a grid still
 * holds the rows the last upload wrote, and the fold reads every row of it, so
 * an upload goes over those rows too, from the CPU's arrays, which are zero
 * there again by then.
 */

import { holeRing, rimBand } from './bubbleDye';

/** Inclusive rows [first, last] of a grid. */
export type RowSpan = readonly [number, number];

/** Bands of rows this close together go across as one upload: 8 rows of a 192² RGBA32 grid is 24 KB, about what a call costs. */
export const MERGE_ROWS = 8;

export class DeltaRows {
  /** One byte a row, 1 where something was written. Read by flushDeltas and handed to the solver; cleared after. */
  readonly mask: Uint8Array;
  private marked = false;
  private all = false;

  constructor(readonly L: number) { this.mask = new Uint8Array(L); }

  /** Anything to hand across. */
  get any(): boolean { return this.all || this.marked; }

  /** Rows y0..y1 (cells, either order, clamped to the grid) were written. */
  add(y0: number, y1: number): void {
    const a = Math.max(0, Math.floor(Math.min(y0, y1)));
    const b = Math.min(this.L - 1, Math.ceil(Math.max(y0, y1)));
    if (b < a) return;
    this.mask.fill(1, a, b + 1);
    this.marked = true;
  }

  /** A disc of reach `r` round row `y`, as layFinger and layBreath lay one. */
  disc(y: number, r: number): void { this.add(Math.round(y) - Math.ceil(r), Math.round(y) + Math.ceil(r)); }

  /**
   * The rows a bubble of radius R round row `y` writes (bubbleDye.ts): its rim
   * deposit's ring, or (`hole`) the wider ring a popped bubble's hole is filled
   * from, a cell past it. The two differ past R = 22 cells, where marking the
   * deposit's ring for a fill left rows unsent (the review of 14ab-4).
   */
  rim(y: number, R: number, hole = false): void { const r = hole ? holeRing(R) + 1 : rimBand(R).rOut; this.add(y - r, y + r); }

  /** Something was written that did not say where: the whole grid goes. */
  whole(): void { this.all = true; }

  /** The rows written, as a mask, or null for all of them. */
  rows(): Uint8Array | null { return this.all || !this.marked ? null : this.mask; }

  clear(): void { if (this.marked) this.mask.fill(0); this.marked = false; this.all = false; }
}

/** The bands of set rows in `mask` (null: every row), bands closer than `merge` rows joined. */
export function bands(mask: Uint8Array | null, L: number, merge = MERGE_ROWS): RowSpan[] {
  if (!mask) return [[0, L - 1]];
  const out: [number, number][] = [];
  for (let y = 0; y < L; y++) {
    if (!mask[y]) continue;
    let e = y;
    while (e + 1 < L && mask[e + 1]) e++;
    const last = out[out.length - 1];
    if (last && y - last[1] - 1 < merge) last[1] = e;
    else out.push([y, e]);
    y = e;
  }
  return out;
}

/**
 * The rows an upload must cover: the rows written now (`rows`, null for all)
 * and the rows the last upload to the same grid wrote (`held`, which the GPU's
 * copy still holds and the CPU's arrays have since zeroed). `held` is updated
 * in place to the rows written now. A grid's first upload has every row
 * held, so it goes whole: a new texture is zeros, and the multiplier rests at
 * one. Returns the bands to upload.
 */
export function rowsToWrite(rows: Uint8Array | null, held: Uint8Array, L: number): RowSpan[] {
  const both = new Uint8Array(L);
  for (let y = 0; y < L; y++) both[y] = (rows ? rows[y] : 1) | held[y];
  if (rows) held.set(rows); else held.fill(1);
  return bands(both, L);
}

/**
 * The solver's uploads of its CPU delta grids: for each texture, the rows its
 * last upload wrote, and the bytes sent in all (for `npm run frameuploads`).
 * A grid's first upload is whole, since a new texture is zeros and the
 * multiplier rests at one (`npm run frameuploads`' lab half, handing its first
 * rows to a fresh solver, read the plate differently from the whole run from
 * the second step on until it was so; the app's first flush is whole anyway,
 * at attachGpu).
 */
export class RowUploads {
  private readonly held = new WeakMap<GPUTexture, Uint8Array>();
  bytes = 0;

  /** Upload `rowsToWrite`'s bands of one grid; returns them. */
  write(queue: GPUQueue, tex: GPUTexture, data: Float32Array, bytesPerCell: number, rows: Uint8Array | null, L: number): RowSpan[] {
    let held = this.held.get(tex);
    if (!held) this.held.set(tex, held = new Uint8Array(L).fill(1));
    const out = rowsToWrite(rows, held, L);
    const bytesPerRow = L * bytesPerCell;
    for (const [y0, y1] of out) {
      queue.writeTexture({ texture: tex, origin: [0, y0] }, data, { offset: y0 * bytesPerRow, bytesPerRow }, [L, y1 - y0 + 1]);
      this.bytes += (y1 - y0 + 1) * bytesPerRow;
    }
    return out;
  }
}

/** FluidSimulation's delta arrays (one value a cell; `hands`, `breath` and the two upload arrays four), null where not laid this step. */
export interface DeltaArrays {
  density: Float32Array; densityR: Float32Array; densityG: Float32Array; densityB: Float32Array; mul: Float32Array;
  vx: Float32Array; vy: Float32Array; temp: Float32Array; gap: Float32Array;
  dyeAdd: Float32Array; velAdd: Float32Array; hands: Float32Array | null; breath: Float32Array | null;
}

/**
 * Interleave the written rows into the two upload arrays, (R, G, B absorption,
 * density) and (vx, vy, temp, gap); returns the bands for `restRows`. The
 * upload arrays are zero outside them, as everything else is.
 */
export function packRows(a: DeltaArrays, rows: Uint8Array | null): RowSpan[] {
  const L = Math.round(Math.sqrt(a.density.length));
  const runs = bands(rows, L);
  const da = a.dyeAdd, va = a.velAdd;
  for (const [y0, y1] of runs) {
    for (let i = y0 * L; i < (y1 + 1) * L; i++) {
      const i4 = i * 4;
      da[i4] = a.densityR[i]; da[i4 + 1] = a.densityG[i]; da[i4 + 2] = a.densityB[i]; da[i4 + 3] = a.density[i];
      va[i4] = a.vx[i]; va[i4 + 1] = a.vy[i]; va[i4 + 2] = a.temp[i]; va[i4 + 3] = a.gap[i];
    }
  }
  return runs;
}

/**
 * Put the written rows back at rest once the solver has them (`writeTexture`
 * copies at the call): zero, the multiplier one, the upload arrays with them.
 * So the rows the last upload wrote, which the solver sends again to clear its
 * own copy, go across as zeros and not as the step before's dye.
 */
export function restRows(a: DeltaArrays, runs: RowSpan[]): void {
  const L = Math.round(Math.sqrt(a.density.length));
  for (const [y0, y1] of runs) {
    const s = y0 * L, e = (y1 + 1) * L;
    a.dyeAdd.fill(0, s * 4, e * 4); a.velAdd.fill(0, s * 4, e * 4);
    for (const f of [a.density, a.densityR, a.densityG, a.densityB, a.vx, a.vy, a.temp, a.gap]) f.fill(0, s, e);
    a.mul.fill(1, s, e);
    a.hands?.fill(0, s * 4, e * 4);
    a.breath?.fill(0, s * 4, e * 4);
  }
}
