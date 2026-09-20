/**
 * The plate, drawn on WebGPU (docs/webgpu-plan.md, P3).
 *
 * Three passes, the same three the WebGL renderer runs:
 *
 *   pack     the solver's float fields into the 8-bit plate the composite
 *            reads (`wgsl/pack.ts`), one per layer
 *   derive   each plate's neighbourhood — the normal and the interface line —
 *            worked out once per texel rather than per screen pixel
 *   display  the composite itself (`wgsl/plate.ts`), which is the GLSL's twin
 *            and is checked against it pixel for pixel by `npm run composite`
 *
 * Everything it is told arrives in the uniform buffer, filled from the show's
 * frame by `plateUniforms.ts` — one mapping, so the two engines cannot drift
 * into being told different things.
 */

import { Disposer, PipelineCache, layoutFromWgsl } from './kit';
import { UniformPack } from './uniforms';
import { PLATE_LAYOUT } from './wgsl/plateFields';
import { DERIVE_WGSL, DISPLAY_MAIN, plateWgsl } from './wgsl/plate';
import { PACK_KERNELS } from './wgsl/pack';

/** What a layer needs on the way from the solver to the screen. */
interface LayerTargets {
  size: number;
  dye: GPUTexture;
  vel: GPUTexture;
  derived: GPUTexture;
}

/** A picture the plate is given each frame: the mark, the film, the beads. */
interface Source {
  texture: GPUTexture;
  width: number;
  height: number;
}

const PACK_ARGS = 16;

export class WebGPUPlate {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly sampler: GPUSampler;
  private readonly uniformBuffer: GPUBuffer;
  private readonly packArgs: GPUBuffer;
  readonly pack: UniformPack;

  private layers: LayerTargets[] = [];
  private sources = new Map<string, Source>();
  private aux: GPUTexture | null = null;
  private auxSize = [0, 0];
  /** A stand-in for a texture the frame does not have: one transparent texel. */
  private readonly blank: GPUTexture;

  constructor(private readonly device: GPUDevice, readonly format: GPUTextureFormat) {
    this.pipelines = new PipelineCache(device);
    this.pack = new UniformPack(PLATE_LAYOUT);
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });
    this.uniformBuffer = this.disposer.track(device.createBuffer({
      label: 'plate uniforms', size: PLATE_LAYOUT.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    this.packArgs = this.disposer.track(device.createBuffer({
      label: 'pack args', size: PACK_ARGS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    this.blank = this.disposer.track(device.createTexture({
      label: 'blank', size: [1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }));
    device.queue.writeTexture({ texture: this.blank }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1]);
  }

  // ── What the frame is drawn from ──────────────────────────────────

  /** Targets for `count` layers at grid `size`, reallocated when either changes. */
  private ensureLayers(count: number, size: number): void {
    while (this.layers.length > count) {
      const l = this.layers.pop()!;
      for (const t of [l.dye, l.vel, l.derived]) this.disposer.release(t);
    }
    for (let i = 0; i < count; i++) {
      const have = this.layers[i];
      if (have && have.size === size) continue;
      if (have) for (const t of [have.dye, have.vel, have.derived]) this.disposer.release(t);
      const tex = (label: string, format: GPUTextureFormat, usage: number) => this.disposer.track(this.device.createTexture({
        label: `${label} ${i}`, size: [size, size], format, usage,
      }));
      this.layers[i] = {
        size,
        dye: tex('packed dye', 'rgba8unorm', GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING),
        vel: tex('packed velocity', 'rgba8unorm', GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING),
        derived: tex('derived', 'rgba16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING),
      };
    }
  }

  /**
   * A picture from the page — the mark, a film frame, the bead mask — copied
   * into a texture of its own. Give it null to drop one.
   */
  setSource(name: string, image: CanvasImageSource | null, width = 0, height = 0): void {
    const have = this.sources.get(name);
    if (!image || width <= 0 || height <= 0) {
      if (have) { this.disposer.release(have.texture); this.sources.delete(name); }
      return;
    }
    if (!have || have.width !== width || have.height !== height) {
      if (have) this.disposer.release(have.texture);
      const texture = this.disposer.track(this.device.createTexture({
        label: `source ${name}`, size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      }));
      this.sources.set(name, { texture, width, height });
    }
    this.device.queue.copyExternalImageToTexture(
      { source: image as GPUCopyExternalImageSource },
      { texture: this.sources.get(name)!.texture },
      [width, height],
    );
  }

  private source(name: string): GPUTexture {
    return this.sources.get(name)?.texture ?? this.blank;
  }

  // ── The frame ─────────────────────────────────────────────────────

  /**
   * Draw the plate into `target`. `fields` is one entry per layer, straight
   * from the solver; `velRange` is the frame's peak speed, which the flow is
   * encoded against.
   */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    size: { width: number; height: number },
    fields: { dye: GPUTexture; velForced: GPUTexture; grain: GPUTexture | null }[],
    velRange: number,
  ): void {
    if (!fields.length) return;
    const grid = fields[0].dye.width;
    this.ensureLayers(fields.length, grid);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.pack.bytes);
    const args = new ArrayBuffer(PACK_ARGS);
    new Float32Array(args).set([grid, velRange, 0, 0]);
    this.device.queue.writeBuffer(this.packArgs, 0, args);

    // ── Pack ────────────────────────────────────────────────────────
    const packPass = encoder.beginComputePass({ label: 'pack' });
    const groups = Math.ceil(grid / 8);
    for (let i = 0; i < fields.length; i++) {
      for (const [name, src, dst] of [
        ['packDye', fields[i].dye, this.layers[i].dye],
        ['packVel', fields[i].velForced, this.layers[i].vel],
      ] as const) {
        const pipe = this.pipelines.computePipeline(name, PACK_KERNELS[name]);
        packPass.setPipeline(pipe);
        packPass.setBindGroup(0, this.device.createBindGroup({
          layout: pipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.packArgs } },
            { binding: 1, resource: src.createView() },
            { binding: 2, resource: dst.createView() },
          ],
        }));
        packPass.dispatchWorkgroups(groups, groups);
      }
    }
    packPass.end();

    // ── Derive ──────────────────────────────────────────────────────
    const derive = this.pipelines.renderPipeline('derive', (module) => ({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [layoutFromWgsl(this.device, DERIVE_WGSL, 'derive', GPUShaderStage.FRAGMENT)],
      }),
      vertex: { module: module(DERIVE_WGSL), entryPoint: 'vs' },
      fragment: { module: module(DERIVE_WGSL), entryPoint: 'fs', targets: [{ format: 'rgba16float' as GPUTextureFormat }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    }));
    for (let i = 0; i < fields.length; i++) {
      const pass = encoder.beginRenderPass({
        label: `derive ${i}`,
        colorAttachments: [{ view: this.layers[i].derived.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      pass.setPipeline(derive);
      pass.setBindGroup(0, this.device.createBindGroup({
        layout: derive.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.layers[i].dye.createView() },
        ],
      }));
      pass.draw(6);
      pass.end();
    }

    // ── Display ─────────────────────────────────────────────────────
    const code = plateWgsl(DISPLAY_MAIN);
    const display = this.pipelines.renderPipeline('display', (module) => ({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [layoutFromWgsl(this.device, code, 'display', GPUShaderStage.FRAGMENT)],
      }),
      vertex: { module: module(code), entryPoint: 'vs' },
      fragment: {
        module: module(code), entryPoint: 'fs',
        targets: [{ format: this.format }, { format: 'rgba8unorm' as GPUTextureFormat }],
      },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    }));

    // The second target is what the camera pass reads: the normal, the dye's
    // height and the bubble mask. Nothing samples it yet, but the shader
    // writes it, and a render pass has to be given somewhere to put it.
    if (!this.aux || this.auxSize[0] !== size.width || this.auxSize[1] !== size.height) {
      if (this.aux) this.disposer.release(this.aux);
      this.aux = this.disposer.track(this.device.createTexture({
        label: 'aux', size: [size.width, size.height], format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.auxSize = [size.width, size.height];
    }

    const one = this.layers[0];
    const two = this.layers[1] ?? one;
    const grain = (i: number) => fields[i]?.grain ?? this.blank;
    const pass = encoder.beginRenderPass({
      label: 'plate',
      colorAttachments: [
        { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
        { view: this.aux.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.5, g: 0.5, b: 0, a: 0 } },
      ],
    });
    pass.setPipeline(display);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: display.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: one.dye.createView() },
        { binding: 3, resource: two.dye.createView() },
        { binding: 4, resource: one.derived.createView() },
        { binding: 5, resource: two.derived.createView() },
        { binding: 6, resource: one.vel.createView() },
        { binding: 7, resource: two.vel.createView() },
        { binding: 8, resource: grain(0).createView() },
        { binding: 9, resource: grain(1).createView() },
        { binding: 10, resource: this.source('film').createView() },
        { binding: 11, resource: this.source('mark').createView() },
        { binding: 12, resource: this.source('beads').createView() },
      ],
    }));
    pass.draw(6);
    pass.end();
  }

  dispose(): void {
    this.disposer.dispose();
    this.sources.clear();
    this.layers = [];
  }
}
