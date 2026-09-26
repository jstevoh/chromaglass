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
  /** Each disc's rim: fingering, finger count, finger phase, 0 (bubbles.ts, packedFinger). */
  private readonly fingers: GPUBuffer;
  private readonly uniform: GPUBuffer;
  /*
    Two fields, and the second is not a convenience.

    The liquid has to be pushed out of a bubble's way, and what does the
    pushing is how fast the air is *arriving* — a growing bubble displaces
    liquid, a popping one lets it back. That is a rate, so it needs the frame
    before this one to difference against. Kept here rather than derived,
    because the field is rebuilt from the list every frame and there is
    nowhere else the previous one survives.
  */
  private readonly fields: [GPUTexture, GPUTexture];
  private which = 0;
  private live = 0;
  /** The list as last handed over, for the coverage the source needs. */
  private packed = new Float32Array(0);
  private disposed = false;

  constructor(private readonly device: GPUDevice, readonly grid: number, capacity: number) {
    this.pipelines = PipelineCache.for(device, 'air');
    this.buffer = this.disposer.track(device.createBuffer({
      label: 'air discs',
      size: Math.max(1, capacity) * STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
    this.fingers = this.disposer.track(device.createBuffer({
      label: 'air fingers',
      size: Math.max(1, capacity) * STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
    this.uniform = this.disposer.track(device.createBuffer({
      label: 'air uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    /*
      r16float, because **float32 is not blendable** and this pass blends.

      It was r32float first, on the reasoning that the exclusion multiplies
      the dye by `1 - a` so a coarse `a` would band in the thinnest dye. That
      reasoning was fine and the format was not available for it: WebGPU does
      not blend 32-bit float targets, and the whole pipeline was rejected —
      silently, as far as anything downstream could tell. Sixteen bits of
      float carry a 0-to-1 coverage with about three decimal places, which is
      finer than the dye it multiplies, and it costs half the memory.
    */
    /*
      And four channels of it: the coverage (r) the solver reads, and for the
      plate which bubble is there and where in it. Every bubble looked alike
      because the plate had only the coverage
      to draw from, and coverage is flat inside a bubble. Precisely: g and b
      are where in its bubble a texel is (weighted by the coverage), a its
      size, film age and number packed (see wgsl/air.ts).
    */
    const one = (n: string) => this.disposer.track(device.createTexture({
      label: n,
      size: [grid, grid],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    this.fields = [one('air a'), one('air b')];
  }

  /** The air as it is now. */
  get field(): GPUTexture { return this.fields[this.which]; }
  /** The air as it was last frame, for the rate the liquid is pushed at. */
  get prev(): GPUTexture { return this.fields[1 - this.which]; }

  /**
   * The bubbles as the field should hold them, from `BubbleField.packed`
   * (x/N, y/N, r/N, opacity). `count` is how many of them are real.
   */
  setBubbles(packed: Float32Array, count: number, soft: number, finger?: Float32Array): void {
    this.live = Math.max(0, Math.min(count, Math.floor(this.buffer.size / STRIDE)));
    this.packed = packed;
    if (this.live > 0) {
      this.device.queue.writeBuffer(this.buffer, 0, packed, 0, this.live * 4);
      // Round when nobody says otherwise.
      const f = finger && finger.length >= this.live * 4 ? finger : new Float32Array(this.live * 4);
      this.device.queue.writeBuffer(this.fingers, 0, f, 0, this.live * 4);
    }
    this.device.queue.writeBuffer(this.uniform, 0, new Uint32Array([this.live]));
    this.device.queue.writeBuffer(this.uniform, 4, new Float32Array([soft, 0, 0]));
  }

  /** Whether anything would be drawn — the caller skips the exclusion without it. */
  get any(): boolean { return this.live > 0; }

  /**
   * What fraction of the plate is air, from the list rather than the field.
   *
   * The source the projection solves has to average to zero over the plate,
   * or there is no solution to find — the same Neumann condition the pressure
   * self-test exists to keep. A sustained push inside every bubble is not
   * zero-mean on its own, so the mean is subtracted, and it is cheaper to add
   * up the discs here than to reduce the field on the GPU.
   */
  get coverage(): number {
    let a = 0;
    for (let i = 0; i < this.live; i++) {
      const r = this.packed[i * 4 + 2];
      a += Math.PI * r * r * this.packed[i * 4 + 3];
    }
    return Math.min(1, a);
  }

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
        /*
          Both stages: `layoutFromWgsl` gives every binding the one
          visibility it is handed, and the fragment shader reads `A.soft`
          for the rim.

          (This was my first guess at why the field was empty, and it was
          wrong — the layout error in the console was a cascade from an
          invalid pipeline, not its cause. It is still the correct
          visibility, so it stays; the actual fault was the target format,
          above.)
        */
        bindGroupLayouts: [layoutFromWgsl(this.device, AIR_SPLAT_WGSL, 'air splat', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)],
      }),
      vertex: { module: module(AIR_SPLAT_WGSL), entryPoint: 'vs' },
      fragment: {
        module: module(AIR_SPLAT_WGSL),
        entryPoint: 'fs',
        targets: [{
          format: 'rgba16float' as GPUTextureFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' as GPUPrimitiveTopology },
    }));

    // Into the one that is not current, which then becomes current: what was
    // there is last frame's air, which is what the push differences against.
    this.which = 1 - this.which;
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
      pass.setBindGroup(0, bindGroup(this.device, pipeline, [this.uniform, this.buffer, this.fingers]));
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
