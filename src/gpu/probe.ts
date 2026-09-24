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

import { Disposer, PipelineCache, ReadbackRing, bindGroup } from './kit';
import { PROBE_GROUPS, PROBE_KERNELS, SOLID_WGSL } from './wgsl/probe';

/** Enough for the one number, at a size a buffer copy is happy with. */
const RESULT_BYTES = 16;

export class WebGPUFrameProbe {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly args: GPUBuffer;
  private readonly partials: GPUBuffer;
  private readonly result: GPUBuffer;
  private readonly ring: ReadbackRing;
  private lum: number | null = null;
  private pixels = 1;

  constructor(private readonly device: GPUDevice) {
    this.pipelines = PipelineCache.for(device, 'probe');
    this.args = this.disposer.track(device.createBuffer({
      label: 'probe args', size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    this.partials = this.disposer.track(device.createBuffer({
      label: 'probe partials', size: PROBE_GROUPS * 4,
      usage: GPUBufferUsage.STORAGE,
    }));
    this.result = this.disposer.track(device.createBuffer({
      label: 'probe result', size: RESULT_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    }));
    this.ring = new ReadbackRing(device, this.disposer, RESULT_BYTES, 3, 'probe');
  }

  /** The two dispatches, into `encoder`. */
  private encode(encoder: GPUCommandEncoder, frame: GPUTexture): void {
    const { width, height } = frame;
    this.pixels = Math.max(1, width * height);
    const args = new ArrayBuffer(16);
    new Uint32Array(args).set([width, height, PROBE_GROUPS, 0]);
    this.device.queue.writeBuffer(this.args, 0, args);

    const pass = encoder.beginComputePass({ label: 'probe' });
    const tiles = this.pipelines.computePipeline('probeTiles', PROBE_KERNELS.probeTiles);
    pass.setPipeline(tiles);
    pass.setBindGroup(0, bindGroup(this.device, tiles, [this.args, frame.createView(), this.partials]));
    pass.dispatchWorkgroups(PROBE_GROUPS);
    const fold = this.pipelines.computePipeline('probeFold', PROBE_KERNELS.probeFold);
    pass.setPipeline(fold);
    pass.setBindGroup(0, bindGroup(this.device, fold, [this.args, this.partials, this.result]));
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  /**
   * Measure the frame just drawn. Its own encoder and submit: the picture is
   * already on its way, and what this queues behind it is two dispatches over
   * a few hundred thousand texels and four bytes back.
   */
  measure(frame: GPUTexture): void {
    const encoder = this.device.createCommandEncoder({ label: 'probe' });
    this.encode(encoder, frame);
    const slot = this.ring.copyFrom(encoder, this.result);
    this.device.queue.submit([encoder.finish()]);
    if (slot) this.ring.collect(slot);
    const latest = this.ring.latest;
    if (latest) this.lum = Math.min(1, new Float32Array(latest)[0] / this.pixels);
  }

  /** The most recent delivered mean luminance, or null before the first read lands. */
  get luminance(): number | null { return this.lum; }

  /**
   * The same measurement, waited for. A stall: for the harness's check of the
   * reduction, never the render loop.
   */
  async measureNow(frame: GPUTexture): Promise<number> {
    const encoder = this.device.createCommandEncoder({ label: 'probe now' });
    this.encode(encoder, frame);
    const read = this.device.createBuffer({
      size: RESULT_BYTES, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyBufferToBuffer(this.result, 0, read, 0, RESULT_BYTES);
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const sum = new Float32Array(read.getMappedRange())[0];
    read.unmap();
    read.destroy();
    return Math.min(1, sum / this.pixels);
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
  }
}
