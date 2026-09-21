/**
 * The air field (H6 · A, docs/bubbles-plan.md).
 *
 * `bubbles.ts` stays exactly as it is — it keeps the list, and does the
 * stretch, wobble, merge, split and pop. What changes is where that list
 * lands: it used to go to the compositor as forty uniforms and be drawn
 * *over* the plate, and now it is stamped into a field the solver carries,
 * so the dye can be taken out of where the air is.
 *
 * A render pass with instanced discs rather than a compute pass looping over
 * the list per cell, for the same reason the particle splat is one: the cost
 * is the area the discs cover rather than cells times bubbles. The forty-cap
 * exists because a per-pixel loop over forty was already as much as the
 * compositor could afford; this is what makes hundreds possible later.
 *
 * The blend is `max`, not `add`. Two overlapping bubbles do not make a cell
 * twice as empty — 1 already means no liquid at all — so the field saturates
 * the way the thing it describes does.
 */

import { AIR_SPLAT_WGSL } from './wgsl/air';
import { Disposer, PipelineCache, bindGroup, layoutFromWgsl } from './kit';

/** x, y, radius (all as a fraction of the grid) and opacity. */
const STRIDE = 4 * 4;

export class WebGPUAir {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly buffer: GPUBuffer;
  private readonly uniform: GPUBuffer;
  /** The air field itself, 0–1 in red. */
  readonly field: GPUTexture;
  private live = 0;
  private disposed = false;

  constructor(private readonly device: GPUDevice, readonly grid: number, capacity: number) {
    this.pipelines = new PipelineCache(device);
    this.buffer = this.disposer.track(device.createBuffer({
      label: 'air discs',
      size: Math.max(1, capacity) * STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
    this.uniform = this.disposer.track(device.createBuffer({
      label: 'air uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    /*
      r32float rather than r16float: the exclusion multiplies the dye by
      `1 - a`, so a coarse a shows up as banding in the thinnest dye, which
      is where a bubble's rim lives. One channel at the solver grid is 2.4 MB
      at 768², against the 9 MB the velocity already costs.
    */
    this.field = this.disposer.track(device.createTexture({
      label: 'air',
      size: [grid, grid],
      format: 'r32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
  }

  /**
   * The bubbles as the field should hold them, from `BubbleField.packed`
   * (x/N, y/N, r/N, opacity). `count` is how many of them are real.
   */
  setBubbles(packed: Float32Array, count: number, soft: number): void {
    this.live = Math.max(0, Math.min(count, Math.floor(this.buffer.size / STRIDE)));
    if (this.live > 0) this.device.queue.writeBuffer(this.buffer, 0, packed, 0, this.live * 4);
    this.device.queue.writeBuffer(this.uniform, 0, new Uint32Array([this.live]));
    this.device.queue.writeBuffer(this.uniform, 4, new Float32Array([soft, 0, 0]));
  }

  /** Whether anything would be drawn — the caller skips the exclusion without it. */
  get any(): boolean { return this.live > 0; }

  /**
   * Stamp the list into the field.
   *
   * Always run, even with nothing live, because the load op is what clears
   * the field: skipping it would leave the last frame's air in place and the
   * dye would stay missing under a bubble that had popped.
   */
  splat(enc: GPUCommandEncoder, timing?: (label: string) => GPURenderPassTimestampWrites | undefined): void {
    const pipeline = this.pipelines.renderPipeline('air splat', (module) => ({
      label: 'air splat',
      layout: this.device.createPipelineLayout({
        label: 'air splat',
        bindGroupLayouts: [layoutFromWgsl(this.device, AIR_SPLAT_WGSL, 'air splat', GPUShaderStage.VERTEX)],
      }),
      vertex: { module: module(AIR_SPLAT_WGSL), entryPoint: 'vs' },
      fragment: {
        module: module(AIR_SPLAT_WGSL),
        entryPoint: 'fs',
        targets: [{
          format: 'r32float' as GPUTextureFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' as GPUPrimitiveTopology },
    }));

    const pass = enc.beginRenderPass({
      label: 'air splat',
      colorAttachments: [{
        view: this.field.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
      timestampWrites: timing?.('air splat'),
    });
    if (this.live > 0) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup(this.device, pipeline, [this.uniform, this.buffer]));
      pass.draw(4, this.live);
    }
    pass.end();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposer.dispose();
  }
}
