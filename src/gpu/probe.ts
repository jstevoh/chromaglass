/**
 * The flash guard's probe on WebGPU (docs/webgpu-plan.md, P4), twin of
 * `lib/frameProbe.ts`.
 *
 * The guard needs the *delivered* luminance — after the plate, the camera,
 * the projector's grade, the dimmer and the guard's own correction — because
 * anything measured earlier is a guess about what the audience sees, and a
 * guard fed its own uncorrected input would keep pulling against a flash it
 * had already flattened. So this reads the canvas's own texture, after the
 * frame is encoded, in the same task, which is the one moment it can be read
 * at all: a presented WebGPU canvas is no longer yours.
 *
 * The read is a frame or two behind, through the kit's readback ring, which
 * does not matter for a question about the last second — and is where the
 * WebGL probe already stood.
 */

import type { FlashGuardTiles } from '../lib/flashGuard';
import { Disposer, PipelineCache, type Prep, ReadbackRing, bindGroup } from './kit';
import { PROBE_GROUPS, PROBE_KERNELS, SOLID_WGSL } from './wgsl/probe';

/** Four 32-bit floats per tile: linear R, G, B sums and the tile's pixel count. */
const RESULT_BYTES = 16;

export class WebGPUFrameProbe {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly args: GPUBuffer;
  private readonly result: GPUBuffer;
  private readonly ring: ReadbackRing;
  private lum: number | null = null;
  private hasTiles = false;
  private readonly tileStore: FlashGuardTiles = {
    cols: 8,
    rows: 8,
    r: new Float32Array(PROBE_GROUPS),
    g: new Float32Array(PROBE_GROUPS),
    b: new Float32Array(PROBE_GROUPS),
    pixels: new Float32Array(PROBE_GROUPS),
  };

  /** The reduction every frame runs, built before the show opens (`gpu/prepare.ts`). */
  static prepare(device: GPUDevice): Prep[] {
    const cache = PipelineCache.for(device, 'probe');
    return (['probeTiles'] as const).map((name) => cache.computePrep(name, PROBE_KERNELS[name]));
  }

  constructor(private readonly device: GPUDevice) {
    this.pipelines = PipelineCache.for(device, 'probe');
    this.args = this.disposer.track(device.createBuffer({
      label: 'probe args', size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    const bytes = PROBE_GROUPS * RESULT_BYTES;
    this.result = this.disposer.track(device.createBuffer({
      label: 'probe tiles', size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    }));
    this.ring = new ReadbackRing(device, this.disposer, bytes, 3, 'probe');
  }

  /** The 8x8 tile reduction into `encoder`. */
  private encode(encoder: GPUCommandEncoder, frame: GPUTexture): void {
    const { width, height } = frame;
    const args = new ArrayBuffer(16);
    new Uint32Array(args).set([width, height, PROBE_GROUPS, 0]);
    this.device.queue.writeBuffer(this.args, 0, args);

    const tiles = this.pipelines.computePipeline('probeTiles', PROBE_KERNELS.probeTiles);
    if (!tiles) return;

    const pass = encoder.beginComputePass({ label: 'probe' });
    pass.setPipeline(tiles);
    pass.setBindGroup(0, bindGroup(this.device, tiles, [this.args, frame.createView(), this.result]));
    pass.dispatchWorkgroups(PROBE_GROUPS);
    pass.end();
  }

  /**
   * Measure the frame just drawn. Its own encoder and submit: the picture is
   * already on its way, and what this queues behind it is one dispatch over
   * the 8x8 tiles and the 64 linear RGB + pixel-count partials back.
   */
  measure(frame: GPUTexture): void {
    const encoder = this.device.createCommandEncoder({ label: 'probe' });
    this.encode(encoder, frame);
    const slot = this.ring.copyFrom(encoder, this.result);
    this.device.queue.submit([encoder.finish()]);
    if (slot) this.ring.collect(slot);
    const latest = this.ring.latest;
    if (latest) {
      // Unpack each tile's linear R, G, B sums and the pixel count of the frame
      // that was summed, carried through the readback ring so a pixel-ratio rung
      // change is not a flash.
      const view = new Float32Array(latest);
      const { r, g, b, pixels } = this.tileStore;
      let sumR = 0, sumG = 0, sumB = 0, totalPixels = 0;
      for (let i = 0; i < PROBE_GROUPS; i++) {
        const base = i * 4;
        const tr = view[base];
        const tg = view[base + 1];
        const tb = view[base + 2];
        const tp = view[base + 3];
        r[i] = tr;
        g[i] = tg;
        b[i] = tb;
        pixels[i] = tp;
        sumR += tr;
        sumG += tg;
        sumB += tb;
        totalPixels += tp;
      }
      if (totalPixels > 0) {
        this.lum = Math.min(1, (0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / totalPixels);
        this.hasTiles = true;
      }
    }
  }

  /** The most recent delivered mean luminance, or null before the first read lands. */
  get luminance(): number | null { return this.lum; }

  /** The most recent delivered 8x8 tile sums and pixel counts, or null before the first read lands. */
  get tiles(): FlashGuardTiles | null { return this.hasTiles ? this.tileStore : null; }

  /**
   * The same measurement, waited for. A stall: for the harness's check of the
   * reduction, never the render loop.
   */
  async measureNow(frame: GPUTexture): Promise<number> {
    const bytes = PROBE_GROUPS * RESULT_BYTES;
    const encoder = this.device.createCommandEncoder({ label: 'probe now' });
    this.encode(encoder, frame);
    const read = this.device.createBuffer({
      size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyBufferToBuffer(this.result, 0, read, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const view = new Float32Array(read.getMappedRange());
    let sumR = 0, sumG = 0, sumB = 0, totalPixels = 0;
    for (let i = 0; i < PROBE_GROUPS; i++) {
      const base = i * 4;
      sumR += view[base];
      sumG += view[base + 1];
      sumB += view[base + 2];
      totalPixels += view[base + 3];
    }
    read.unmap();
    read.destroy();
    return totalPixels > 0 ? Math.min(1, (0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / totalPixels) : 0;
  }

  /**
   * A painter for the self-test: white rectangles on black, whose mean the
   * caller knows by construction. Which way up a rectangle is put does not
   * matter to a mean over the whole frame, so the rectangles are taken in the
   * pixel coordinates the scissor uses — from the top — and the answer is the
   * same either way.
   */
  painter(format: GPUTextureFormat, rects: [number, number, number, number][]) {
    // Named by its format: the target is the caller's, and a painter asked
    // for a second format would otherwise draw with the first one's pipeline
    // — wrong even before the cache was shared, and now it outlives the probe.
    const pipeline = this.pipelines.renderPipeline(`solid ${format}`, (module) => ({
      layout: 'auto' as const,
      vertex: { module: module(SOLID_WGSL), entryPoint: 'vs' },
      fragment: { module: module(SOLID_WGSL), entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    }));
    return (encoder: GPUCommandEncoder, target: GPUTextureView): boolean => {
      if (!pipeline) return false;
      const pass = encoder.beginRenderPass({
        label: 'probe self-test',
        colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      pass.setPipeline(pipeline);
      for (const [x, y, w, h] of rects) {
        if (w <= 0 || h <= 0) continue;
        pass.setScissorRect(x, y, w, h);
        pass.draw(3);
      }
      pass.end();
      // It always paints: the clear is the picture when there are no rects.
      return true;
    };
  }

  dispose(): void {
    this.disposer.dispose();
    this.lum = null;
    this.hasTiles = false;
  }
}
