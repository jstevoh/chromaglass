/**
 * Dye carried by particles: the buffer, the three passes and the target
 * (H1, docs/roadmap.md; the shaders and the why are in `wgsl/particles.ts`).
 *
 * The plate's structure at 4–8 px is the oldest measured shortfall in
 * `PLAN.md`, and the cause is that the dye lives in a grid which is resampled
 * every step. A particle is not resampled: it takes a colour once and carries
 * it, so what it draws is as fine as one texel. This owns a population of
 * them, moves them through the same velocity field the dye rides, and splats
 * them into a texture the compositor adds on top of the dye.
 *
 * **Alongside the grid, not instead of it.** The grid keeps the body of
 * colour; particles add what the grid cannot hold. So the amount is a dial
 * from nothing, every look made before this means what it meant, and a
 * machine that cannot afford them simply does not have them.
 */

import { PARTICLE_LAYOUT, SEED_WGSL, ADVECT_WGSL, SPLAT_WGSL } from './wgsl/particles';
import { UniformPack } from './uniforms';
import { Disposer, PipelineCache, bindGroup, layoutFromWgsl } from './kit';

/** Bytes per particle: `pos`, `born`, `tint` — see the struct in the WGSL. */
const STRIDE = 32;

/** How many particles an amount of 1 asks for, per solver cell. */
export const PER_CELL = 4;

/**
 * How much finer the splat target is than the solver grid.
 *
 * It was 1 — the same grid — and that is the one number that made the whole
 * pass pointless. The dye is already on that grid; splatting particles into
 * a texture of the same size means the finest thing they can draw is a cell,
 * which is exactly the limit they exist to get past. Measured on one plate
 * with the amount toggled under it, that version did not add structure, it
 * removed it: hard edges fell from 55% of pixels to 7%, the typical local
 * gradient from 36.8 to 1.2, and the only scales that gained were 16 and 32
 * px. A smoother plate, which is the opposite of the point.
 *
 * At 2 a particle can land half a cell from its neighbour. The target costs
 * four times the memory — 8 MB at a 512² solver — and the splat four times
 * the fragments, which is why this is a constant to be raised deliberately
 * rather than a setting.
 */
export const SPLAT_SCALE = 2;

/**
 * Workgroup size, matching `@workgroup_size(64)` in both compute shaders.
 * It is here as well because the dispatch count has to agree with it, and a
 * disagreement is silent: too few groups and the tail of the population
 * simply stops moving.
 */
const GROUP = 64;

export interface ParticleParams {
  /** 0 to 1: how much of the picture is particles. At 0 nothing runs. */
  amount: number;
  /** Seconds a particle carries its colour before it is reborn. */
  life: number;
  /** Dye thickness below which a particle is not born. */
  floor: number;
  /** The solver's own advection displacement for this step. */
  disp: number;
  dt: number;
  seed: number;
}

export class WebGPUParticles {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly pack = new UniformPack(PARTICLE_LAYOUT);
  private readonly uniform: GPUBuffer;
  private readonly buffer: GPUBuffer;
  /** What the compositor samples: the splat, finer than the solver's grid. */
  readonly target: GPUTexture;
  /** The splat target's edge, in texels. */
  readonly splatEdge: number;
  /** How many particles the buffer can hold. */
  readonly capacity: number;
  /** How many are live this frame — `capacity` scaled by the amount. */
  private live = 0;
  private frame = 0;
  private disposed = false;

  constructor(private readonly device: GPUDevice, readonly grid: number) {
    this.pipelines = new PipelineCache(device);
    this.capacity = grid * grid * PER_CELL;
    this.buffer = this.disposer.track(device.createBuffer({
      label: 'particles',
      size: this.capacity * STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
    this.uniform = this.disposer.track(device.createBuffer({
      label: 'particle uniforms',
      size: PARTICLE_LAYOUT.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    /*
      The splat target is half float, not 8-bit.

      Every particle landing on a texel is added to what is already there, and
      a busy cell takes a dozen in a frame. In 8-bit that saturates to white
      and the plate grows bright patches where the flow happens to converge;
      in half float it keeps summing and the compositor divides it back down.
    */
    this.splatEdge = grid * SPLAT_SCALE;
    this.target = this.disposer.track(device.createTexture({
      label: 'particle splat',
      size: [this.splatEdge, this.splatEdge],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
  }

  /** Nothing is being drawn: the amount is 0, or the population is empty. */
  get idle(): boolean { return this.live === 0; }

  /**
   * One step's worth: birth, then motion.
   *
   * Encoded into the caller's encoder, beside the solver's own step, because
   * the field a particle reads is the one the solver has just written and
   * putting them in separate submits would let a frame's worth of ordering go
   * wrong for no gain.
   */
  step(enc: GPUCommandEncoder, dye: GPUTexture, velForced: GPUTexture, p: ParticleParams, timing?: (label: string) => GPUComputePassTimestampWrites | undefined): void {
    this.live = Math.min(this.capacity, Math.round(this.capacity * Math.max(0, Math.min(1, p.amount))));
    if (this.live === 0) return;

    this.frame = (this.frame + 1) >>> 0;
    this.pack
      .set('grid', this.grid)
      .set('splat', this.splatEdge)
      .set('count', this.live)
      .set('disp', p.disp)
      .set('dt', p.dt)
      .set('life', Math.max(0.05, p.life))
      .set('gain', 1)
      .set('floor', p.floor)
      .set('frame', this.frame)
      .set('seed', p.seed >>> 0);
    this.device.queue.writeBuffer(this.uniform, 0, this.pack.bytes);

    const groups = Math.ceil(this.live / GROUP);
    const seed = this.pipelines.computePipeline('particle seed', SEED_WGSL);
    const advect = this.pipelines.computePipeline('particle advect', ADVECT_WGSL);

    const pass = enc.beginComputePass({ label: 'particles', timestampWrites: timing?.('particles') });
    pass.setPipeline(seed);
    pass.setBindGroup(0, bindGroup(this.device, seed, [this.uniform, this.buffer, dye]));
    pass.dispatchWorkgroups(groups);
    pass.setPipeline(advect);
    pass.setBindGroup(0, bindGroup(this.device, advect, [this.uniform, this.buffer, velForced]));
    pass.dispatchWorkgroups(groups);
    pass.end();
  }

  /**
   * The splat, once a frame rather than once a step.
   *
   * A step moves the particles; only the last one before a frame is drawn is
   * visible, so splatting per step would draw the same population several
   * times over and pay for it each time. The target is cleared by the load
   * op, which is why this is safe to skip entirely when nothing is live —
   * the compositor is told the amount is 0 and never reads it.
   */
  splat(enc: GPUCommandEncoder, timing?: (label: string) => GPURenderPassTimestampWrites | undefined): void {
    if (this.live === 0) return;
    const pipeline = this.pipelines.renderPipeline('particle splat', (module) => ({
      label: 'particle splat',
      layout: this.device.createPipelineLayout({
        label: 'particle splat',
        bindGroupLayouts: [layoutFromWgsl(this.device, SPLAT_WGSL, 'particle splat', GPUShaderStage.VERTEX)],
      }),
      vertex: { module: module(SPLAT_WGSL), entryPoint: 'vs' },
      fragment: {
        module: module(SPLAT_WGSL),
        entryPoint: 'fs',
        targets: [{
          format: 'rgba16float' as GPUTextureFormat,
          // Additive, and on both channels: the colour sums and so does the
          // weight in alpha, which is what the compositor divides by to get
          // a colour back out of a pile of overlapping splats.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      // Four vertices an instance, as a strip: the disc's corners. It was a
      // point list first, one texel a particle, and the speckle that produced
      // is written up in `wgsl/particles.ts`.
      primitive: { topology: 'triangle-strip' as GPUPrimitiveTopology },
    }));

    const pass = enc.beginRenderPass({
      label: 'particle splat',
      colorAttachments: [{
        view: this.target.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
      timestampWrites: timing?.('particle splat'),
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup(this.device, pipeline, [this.uniform, this.buffer]));
    pass.draw(4, this.live);
    pass.end();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposer.dispose();
  }
}
