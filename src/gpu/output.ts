/**
 * The projector's pass on WebGPU (docs/webgpu-plan.md, P3), twin of
 * `lib/outputPass.ts`.
 *
 * The last thing that happens to a frame before it is light on a wall:
 * mirrored for a rear screen, pulled square against a projector that could
 * not be hung on axis, blanked at the edges, graded for a room with light in
 * it. Everything upstream draws it into this pass's texture and this draws
 * the projection.
 *
 * It is built only when it would change a pixel, as the WebGL one is, so a
 * machine that has never seen a projector pays nothing at all.
 */

import { Disposer, PipelineCache, layoutFromWgsl } from './kit';
import { UniformPack } from './uniforms';
import { OUTPUT_LAYOUT } from './wgsl/outputFields';
import { OUTPUT_WGSL } from './wgsl/output';
import {
  MAX_SURFACES, composeOntoPin, cornerPinMatrix,
  type OutputConfig, type SurfaceShape,
} from '../lib/outputConfig';

const SHAPE_INDEX: Record<SurfaceShape, number> = { rect: 0, ellipse: 1, triangle: 2, diamond: 3 };

/**
 * Every quad of a frame into the buffer at once, and how many there are.
 *
 * The geometry is worked out by the same `cornerPinMatrix` and
 * `composeOntoPin` the WebGL pass calls, so the two engines cannot disagree
 * about where a surface is: only the drawing of it is ported. A quad dragged
 * flat has no matrix and is skipped rather than divided by, which is why the
 * count comes back rather than being the number of surfaces.
 */
export function fillOutputUniforms(pack: UniformPack, cfg: OutputConfig, width: number, height: number): number {
  pack.set('mask', cfg.maskTop, cfg.maskRight, cfg.maskBottom, cfg.maskLeft);
  pack.set('flip', cfg.flipX ? -1 : 1, cfg.flipY ? -1 : 1);
  pack.set('resolution', width, height);
  pack.set('feather', cfg.maskFeather);
  pack.set('gain', cfg.gain);
  pack.set('gamma', cfg.gamma);

  let n = 0;
  const quad = (
    corners: OutputConfig['corners'],
    src: readonly [number, number, number, number],
    shape: SurfaceShape,
    feather: number,
    opacity: number,
  ) => {
    if (n >= MAX_SURFACES) return;
    const m = cornerPinMatrix(corners);
    if (!m) return;
    const at = n;
    pack.setAt('warpA', at, m[0], m[1], m[2], 0);
    pack.setAt('warpB', at, m[3], m[4], m[5], 0);
    pack.setAt('warpC', at, m[6], m[7], m[8], 0);
    pack.setAt('cornerAB', at, corners[0], corners[1], corners[2], corners[3]);
    pack.setAt('cornerCD', at, corners[4], corners[5], corners[6], corners[7]);
    pack.setAt('src', at, src[0], src[1], src[2], src[3]);
    pack.setAt('form', at, SHAPE_INDEX[shape], feather, opacity, 0);
    n++;
  };

  const surfaces = cfg.surfaces ?? [];
  if (surfaces.length === 0) {
    // No mapping at all: the picture lands on the pinned rectangle, exactly
    // as it did before any of this existed.
    quad(cfg.corners, [0, 0, 1, 1], 'rect', 0, 1);
  } else {
    // Mapped, and possibly all of it switched off — which is a blackout, not
    // an absence of mapping.
    for (const s of surfaces) {
      if (!s.enabled || s.opacity <= 0) continue;
      const placed = composeOntoPin(s.corners, cfg.corners);
      if (placed) quad(placed, s.src, s.shape, s.feather, s.opacity);
    }
  }
  // Everything past the last quad still has to hold something: a uniform
  // buffer is read whole, and an unwritten slot is whatever the last frame
  // left there. They are never drawn, but they are never undefined either.
  for (let i = n; i < MAX_SURFACES; i++) {
    for (const f of ['warpA', 'warpB', 'warpC', 'cornerAB', 'cornerCD', 'src', 'form'] as const) {
      pack.setAt(f, i, 0, 0, 0, 0);
    }
  }
  return n;
}

export class WebGPUOutput {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly sampler: GPUSampler;
  private readonly ubo: GPUBuffer;
  readonly pack: UniformPack;

  private scene: GPUTexture | null = null;
  private sceneSize = [0, 0];

  constructor(private readonly device: GPUDevice, private readonly format: GPUTextureFormat) {
    this.pipelines = new PipelineCache(device);
    this.pack = new UniformPack(OUTPUT_LAYOUT);
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });
    this.ubo = this.disposer.track(device.createBuffer({
      label: 'output uniforms', size: OUTPUT_LAYOUT.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
  }

  /** Where the frame is drawn before this pass projects it. */
  sceneView(width: number, height: number): GPUTextureView {
    if (!this.scene || this.sceneSize[0] !== width || this.sceneSize[1] !== height) {
      if (this.scene) this.disposer.release(this.scene);
      this.scene = this.disposer.track(this.device.createTexture({
        label: 'projector scene', size: [width, height], format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.sceneSize = [width, height];
    }
    return this.scene.createView();
  }

  /**
   * The projection, onto `target`. `quads` is what `fillOutputUniforms`
   * counted: one instance each, in the order the surfaces were given, which
   * is the order the blending needs.
   *
   * The frame is cleared first because everything here is a quad rather than
   * the whole screen — what is not covered is the dark between the shapes,
   * and a projector on three panels lights three panels and leaves the wall
   * between them alone.
   */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    quads: number,
    timestamps?: GPURenderPassTimestampWrites,
  ): void {
    if (!this.scene) return;
    this.device.queue.writeBuffer(this.ubo, 0, this.pack.bytes);
    const pipeline = this.pipelines.renderPipeline('output', (module) => ({
      layout: this.device.createPipelineLayout({
        // The vertex stage reads the uniforms too — the quad's corners are
        // in the buffer rather than in a vertex attribute — so the layout has
        // to say both stages, or the entry point does not match it.
        bindGroupLayouts: [layoutFromWgsl(this.device, OUTPUT_WGSL, 'output', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)],
      }),
      vertex: { module: module(OUTPUT_WGSL), entryPoint: 'vs' },
      fragment: {
        module: module(OUTPUT_WGSL), entryPoint: 'fs',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha' as GPUBlendFactor, dstFactor: 'one-minus-src-alpha' as GPUBlendFactor, operation: 'add' as GPUBlendOperation },
            alpha: { srcFactor: 'src-alpha' as GPUBlendFactor, dstFactor: 'one-minus-src-alpha' as GPUBlendFactor, operation: 'add' as GPUBlendOperation },
          },
        }],
      },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    }));
    const pass = encoder.beginRenderPass({
      label: 'output',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      timestampWrites: timestamps,
    });
    if (quads > 0) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.ubo } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.scene.createView() },
        ],
      }));
      pass.draw(6, quads);
    }
    pass.end();
  }

  dispose(): void {
    this.disposer.dispose();
    this.scene = null;
    this.sceneSize = [0, 0];
  }
}
