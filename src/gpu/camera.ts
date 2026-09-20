/**
 * The camera pass on WebGPU (docs/webgpu-plan.md, P3), twin of
 * `lib/cameraPass.ts`.
 *
 * When it is on, the plate is drawn into a texture of this pass's own rather
 * than onto the canvas, and this looks at that texture the way a camera
 * would: refraction, depth of field, bloom, the sensor's roll-off, a vignette
 * and grain. All of it needs the finished picture to sample from, which is
 * why it cannot happen in the pass that draws the plate.
 *
 * `npm run camera` compares its output with the GLSL's, pixel for pixel.
 */

import { Disposer, PipelineCache, layoutFromWgsl } from './kit';
import { UniformPack } from './uniforms';
import { CAMERA_LAYOUT } from './wgsl/cameraFields';
import { CAMERA_WGSL } from './wgsl/camera';

/** What the show's frame says about the lens. */
export interface CameraView {
  time: number;
  amount: number;
  refraction: number;
  chromatic: number;
  focus: number;
  aperture: number;
  /** 0 when the post chain will finish the frame: it dithers once, at the end. */
  dither: number;
  bloom: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The uniforms, from the settings the show folded — worked out in one place, so nothing
 * downstream can be told a different thing about the same lens.
 */
export function fillCameraUniforms(pack: UniformPack, view: CameraView, width: number, height: number): void {
  pack.set('resolution', width, height);
  pack.set('time', view.time);
  pack.set('amount', clamp01(view.amount));
  pack.set('refraction', clamp01(view.refraction));
  pack.set('chromatic', clamp01(view.chromatic));
  pack.set('focus', clamp01(view.focus));
  pack.set('aperture', clamp01(view.aperture));
  pack.set('bloom', clamp01(view.bloom));
  // The sensor's roll-off always on, the vignette and the grain at fixed
  // strengths that no setting reaches.
  pack.set('filmic', 1);
  pack.set('vignette', 0.6);
  pack.set('grain', 0.6);
  pack.set('dither', view.dither);
}

export class WebGPUCamera {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly sampler: GPUSampler;
  private readonly ubo: GPUBuffer;
  readonly pack: UniformPack;

  /** What the plate draws into while this pass is on. */
  private scene: GPUTexture | null = null;
  private sceneSize = [0, 0];

  constructor(private readonly device: GPUDevice, private readonly format: GPUTextureFormat) {
    this.pipelines = new PipelineCache(device);
    this.pack = new UniformPack(CAMERA_LAYOUT);
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });
    this.ubo = this.disposer.track(device.createBuffer({
      label: 'camera uniforms', size: CAMERA_LAYOUT.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
  }

  /**
   * Where the plate goes instead of the canvas. The texture carries the
   * canvas's own format, so the plate's pipeline is the same one either way.
   */
  sceneView(width: number, height: number): GPUTextureView {
    if (!this.scene || this.sceneSize[0] !== width || this.sceneSize[1] !== height) {
      if (this.scene) this.disposer.release(this.scene);
      this.scene = this.disposer.track(this.device.createTexture({
        label: 'camera scene', size: [width, height], format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.sceneSize = [width, height];
    }
    return this.scene.createView();
  }

  /** The photograph: the scene and the plate's aux attachment, onto `target`. */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    aux: GPUTexture,
    timestamps?: GPURenderPassTimestampWrites,
    /** True when this frame goes into a texture another pass will sample. */
    toTexture = false,
    /** What it is drawing into: the chain's half floats, or the canvas. */
    format = this.format,
  ): void {
    if (!this.scene) return;
    this.device.queue.writeBuffer(this.ubo, 0, this.pack.bytes);
    const pipeline = this.pipelines.renderPipeline(`camera ${format}${toTexture ? ' flipped' : ''}`, (module) => ({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [layoutFromWgsl(this.device, CAMERA_WGSL, 'camera', GPUShaderStage.FRAGMENT)],
      }),
      vertex: { module: module(CAMERA_WGSL), entryPoint: 'vs', constants: toTexture ? { FLIP_Y: -1 } : undefined },
      fragment: { module: module(CAMERA_WGSL), entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
    }));
    const pass = encoder.beginRenderPass({
      label: 'camera',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      timestampWrites: timestamps,
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubo } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.scene.createView() },
        { binding: 3, resource: aux.createView() },
      ],
    }));
    pass.draw(6);
    pass.end();
  }

  dispose(): void {
    this.disposer.dispose();
    this.scene = null;
    this.sceneSize = [0, 0];
  }
}
