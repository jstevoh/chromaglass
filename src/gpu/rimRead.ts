import type { Disposer } from './kit';
import { rimMask } from '../lib/rimMask';

/**
 * A field's first channel averaged inside the dish's rim, read back into a
 * buffer kept from one read to the next (PLAN 14ab-9): thick liquid's share
 * (`WebGPUFluid.speciesShare`), about once a second.
 *
 * It went through `readField`, the harness's read, which made a MAP_READ
 * buffer, a 590 KB `slice` of the mapping and a 590 KB unpadded copy of that
 * on every read, and then took a square root a cell to find the rim. Here the
 * buffer is made once a size, the sum is taken where the buffer is mapped, row
 * by row past the padding (the same cells in the same order as the unpadded
 * copy, so the same sum to the bit), and the rim is a mask made once a grid.
 * One read at a time: a second asker shares the one in flight rather than
 * mapping the one buffer twice.
 */
export class RimRead {
  private buf: GPUBuffer | null = null;
  private reading: Promise<number> | null = null;
  private snapshot: Float32Array | null = null;
  constructor(private readonly device: GPUDevice, private readonly disposer: Disposer, private readonly label: string) {}

  /** The last field read, unpadded (L × L × 4 floats), or null before the first. */
  get data(): Float32Array | null { return this.snapshot; }

  /**
   * `encode` downsamples the field into `target` (L × L, rgba32float, rows
   * `row` bytes apart) as part of the encoder it is handed; this copies it out,
   * submits, and gives back the mean of its first channel inside the rim.
   */
  read(L: number, row: number, target: GPUTexture, encode: (enc: GPUCommandEncoder) => void): Promise<number> {
    return this.reading ??= this.readOnce(L, row, target, encode).finally(() => { this.reading = null; });
  }

  private async readOnce(L: number, row: number, target: GPUTexture, encode: (enc: GPUCommandEncoder) => void): Promise<number> {
    if (!this.buf || this.buf.size !== row * L) {
      if (this.buf) this.disposer.release(this.buf);
      this.buf = this.disposer.track(this.device.createBuffer({ label: this.label, size: row * L, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
    }
    const buf = this.buf, rim = rimMask(L);
    const enc = this.device.createCommandEncoder({ label: this.label });
    encode(enc);
    enc.copyTextureToBuffer({ texture: target }, { buffer: buf, bytesPerRow: row }, [L, L]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    let sum = 0, cells = 0;
    try {
      const f = new Float32Array(buf.getMappedRange());
      if (!this.snapshot || this.snapshot.length !== L * L * 4) this.snapshot = new Float32Array(L * L * 4);
      const out = this.snapshot;
      const stride = row / 4;
      for (let j = 0; j < L; j++) {
        out.set(f.subarray(j * stride, j * stride + L * 4), j * L * 4);
        for (let i = 0; i < L; i++) {
          if (!rim[i + j * L]) continue;
          sum += f[j * stride + i * 4];
          cells++;
        }
      }
    } finally { buf.unmap(); }
    return sum / Math.max(1, cells);
  }
}
