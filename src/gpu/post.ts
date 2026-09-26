/**
 * The post chain on WebGPU (docs/webgpu-plan.md, P3; docs/filters-plan.md,
 * F0), twin of `lib/postChain.ts`.
 *
 * With no effect on, none of this is built: the plate finishes the frame
 * itself and draws straight to the canvas, the projector or the camera. With
 * one on, the plate draws into the chain's picture unfinished, the effects run
 * over it, and the finish does the last three things — the dimmer, the mark,
 * the dither — on the way out.
 *
 *   plate → camera → effects → finish → projector → canvas
 *
 * The picture is a pair of half-float targets, ping-ponged, so an effect
 * always reads one and writes the other. The history ring is a stack of past
 * frames at half resolution, which is what a time-based effect reaches into;
 * it keeps the picture as it came in, before the frame's own effects.
 *
 * It was proved against a GLSL chain, pixel for pixel, by `npm run post`.
 * Both went with the WebGL renderer (P7); `npm run fx` covers this now.
 */

import { Disposer, PipelineCache, type Prep, layoutFromWgsl, type RenderRecipe } from './kit';
import { UniformPack } from './uniforms';
import { POST_LAYOUT } from './wgsl/postFields';
import { BLIT_WGSL, FINISH_PASS_WGSL, STOCK_PASS_WGSL, TEST_PASS_WGSL } from './wgsl/post';
/**
 * What the harness can ask the chain to do; never set by a look. It was
 * declared with the WebGL chain, which is gone (P7).
 */
export interface PostTest {
  /** 0 off, 1 seeded noise, 2 the picture from `delay` frames ago. */
  mode: 0 | 1 | 2;
  delay: number;
}

/**
 * The film stock a look is photographed on (F1, docs/filters-plan.md E6).
 *
 * `stock*` and not `film*`: the existing `film` settings drive the film
 * *projector*, the one that plays a video through the dye.
 */
export interface StockSettings {
  /** 0 = off. Nothing below is built while it is 0. */
  stock: number;
  /** 0 16mm reversal, 1 slide, 2 faded negative, 3 Super 8, 4 monochrome. */
  stockType: number;
  grain: number;
  grainSize: number;
  weave: number;
  gate: number;
  /** The film's own frame, so grain and weave move at the film's rate. */
  filmFrame: number;
}

/** As the GLSL's ring keeps: about half a second at sixty frames a second. */
const RING_FRAMES = 32;
/** The picture's own format. Storage and filterable on every WebGPU device. */
export const PICTURE_FORMAT: GPUTextureFormat = 'rgba16float';

/** What the finish is told, from the show's own frame. */
export interface FinishView {
  dimmer: number;
  markOn: number;
  markRect: readonly [number, number, number, number];
}

/*
  A pass's pipeline as a recipe, apart from the class, so the frame and
  `WebGPUPostChain.prepare` cannot describe two pipelines under one name.
*/
function passName(name: string, format: GPUTextureFormat, toTexture: boolean): string {
  return `${name} ${format}${toTexture ? ' flipped' : ''}`;
}

function passRecipe(device: GPUDevice, name: string, code: string, format: GPUTextureFormat, toTexture: boolean, stages = GPUShaderStage.FRAGMENT): RenderRecipe {
  return (module) => ({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layoutFromWgsl(device, code, name, stages)],
    }),
    vertex: { module: module(code), entryPoint: 'vs', constants: toTexture ? { FLIP_Y: -1 } : undefined },
    fragment: { module: module(code), entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}

export class WebGPUPostChain {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly sampler: GPUSampler;
  private readonly ubo: GPUBuffer;
  readonly pack: UniformPack;

  /** The two pictures, ping-ponged; `cur` is the one holding the frame so far. */
  private targets: GPUTexture[] = [];
  private size = [0, 0];
  private cur = 0;

  /** The ring, allocated the first time an effect asks for it. */
  private ring: GPUTexture | null = null;
  private ringSize = [0, 0];
  private ringNext = 0;
  private ringFilled = 0;
  /** The mark, when the show has one; the finish composites it over the frame. */
  private markTexture: GPUTexture | null = null;
  private readonly blankMark: GPUTexture;

  /**
   * What a look with film stock draws with, built before the show opens
   * (`gpu/prepare.ts`): the stock over the picture, the ring's copy, and the
   * finish onto the canvas or into the projector's picture. Not the test
   * effect, which is the harness's and in no look.
   */
  static prepare(device: GPUDevice, format: GPUTextureFormat): Prep[] {
    const cache = PipelineCache.for(device, 'post');
    const pass = (name: string, code: string, f: GPUTextureFormat, toTexture: boolean) =>
      () => cache.prepareRender(passName(name, f, toTexture), passRecipe(device, name, code, f, toTexture));
    return [
      pass('stock', STOCK_PASS_WGSL, PICTURE_FORMAT, true),
      pass('ring blit', BLIT_WGSL, PICTURE_FORMAT, true),
      pass('finish', FINISH_PASS_WGSL, format, false),
      pass('finish', FINISH_PASS_WGSL, format, true),
    ];
  }

  constructor(private readonly device: GPUDevice, private readonly format: GPUTextureFormat) {
    this.pipelines = PipelineCache.for(device, 'post');
    this.pack = new UniformPack(POST_LAYOUT);
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
    });
    this.ubo = this.disposer.track(device.createBuffer({
      label: 'post uniforms', size: POST_LAYOUT.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }));
    // A frame with no mark still binds one: a bind group's entries are all or
    // nothing, and one transparent texel is the picture of no mark.
    this.blankMark = this.disposer.track(device.createTexture({
      label: 'blank mark', size: [1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }));
    device.queue.writeTexture({ texture: this.blankMark }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1]);
    // The effects' own fields, so the struct is whole from the first frame.
    this.pack.set('mode', 0).set('layer', 0).set('frame', 0).set('seed', 0);
  }

  /** Half floats here as in WebGL, so an effect has room above 1 to work in. */
  get float(): boolean { return PICTURE_FORMAT === 'rgba16float'; }

  /** What a pass drawing into the chain has to be built for. */
  get pictureFormat(): GPUTextureFormat { return PICTURE_FORMAT; }

  get historySize(): { width: number; height: number; frames: number; filled: number } {
    return { width: this.ringSize[0], height: this.ringSize[1], frames: this.ring ? RING_FRAMES : 0, filled: this.ringFilled };
  }

  private ensure(width: number, height: number): void {
    if (this.size[0] === width && this.size[1] === height && this.targets.length === 2) return;
    for (const t of this.targets) this.disposer.release(t);
    this.targets = [0, 1].map((i) => this.disposer.track(this.device.createTexture({
      label: `post picture ${i}`, size: [width, height], format: PICTURE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })));
    this.size = [width, height];
    this.cur = 0;
  }

  /** Where the plate — or the camera, when one is on — draws the frame. */
  sceneView(width: number, height: number): GPUTextureView {
    this.ensure(width, height);
    return this.targets[this.cur].createView();
  }

  /** The mark, uploaded when it arrives and then left alone. */
  setMark(image: CanvasImageSource | null, width: number, height: number): void {
    if (!image || width <= 0 || height <= 0) {
      if (this.markTexture) { this.disposer.release(this.markTexture); this.markTexture = null; }
      return;
    }
    if (!this.markTexture || this.markTexture.width !== width || this.markTexture.height !== height) {
      if (this.markTexture) this.disposer.release(this.markTexture);
      this.markTexture = this.disposer.track(this.device.createTexture({
        label: 'post mark', size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      }));
    }
    this.device.queue.copyExternalImageToTexture(
      { source: image as GPUCopyExternalImageSource },
      { texture: this.markTexture },
      [width, height],
    );
  }

  private ensureRing(): GPUTexture {
    const [w, h] = this.size;
    const scale = Math.max(w, h) > 2560 ? 4 : 2;
    const rw = Math.max(1, Math.floor(w / scale));
    const rh = Math.max(1, Math.floor(h / scale));
    if (this.ring && this.ringSize[0] === rw && this.ringSize[1] === rh) return this.ring;
    if (this.ring) this.disposer.release(this.ring);
    this.ring = this.disposer.track(this.device.createTexture({
      label: 'history ring', size: [rw, rh, RING_FRAMES], format: PICTURE_FORMAT,
      // COPY_SRC because the self-test reads layers back; without it the copy
      // is a validation error and every layer reads as zeros, which looks
      // exactly like a ring that kept nothing.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    this.ringSize = [rw, rh];
    this.ringNext = 0;
    this.ringFilled = 0;
    return this.ring;
  }

  /** The layer holding the picture from `delay` pushes ago (1 is the last one pushed). */
  private layerAt(delay: number): number {
    const d = Math.max(1, Math.min(Math.max(1, this.ringFilled), Math.round(delay)));
    return (this.ringNext - d + RING_FRAMES * 2) % RING_FRAMES;
  }

  private pipeline(name: string, code: string, format: GPUTextureFormat, toTexture: boolean, stages = GPUShaderStage.FRAGMENT): GPURenderPipeline {
    return this.pipelines.renderPipeline(passName(name, format, toTexture), passRecipe(this.device, name, code, format, toTexture, stages));
  }

  /**
   * The effects, in the plan's order (optics, time, matte, iris, film). None
   * exist yet; the harness's test effect stands in for them, and what it
   * proves is the shape they arrive into — a picture in, a picture out, and a
   * ring of past frames to reach into.
   */
  /**
   * The stock, over the picture.
   *
   * Its own pass rather than a branch inside the test one: the test effect is
   * the harness's and never in a look, and this is a look's and never the
   * harness's. They share the picture and nothing else.
   */
  stock(encoder: GPUCommandEncoder, seed: number, st: StockSettings): void {
    if (st.stock <= 0.001 || this.targets.length !== 2) return;
    const out = 1 - this.cur;
    this.pack.set('stock', st.stock);
    this.pack.set('stockType', Math.max(0, Math.min(4, Math.round(st.stockType))));
    this.pack.set('stockGrain', st.grain);
    this.pack.set('stockGrainSize', Math.max(1, st.grainSize));
    this.pack.set('stockWeave', st.weave);
    this.pack.set('stockGate', st.gate);
    this.pack.set('stockFrame', st.filmFrame >>> 0);
    this.pack.set('seed', seed >>> 0);
    this.pack.set('resolution', this.size[0], this.size[1]);
    this.device.queue.writeBuffer(this.ubo, 0, this.pack.bytes);

    const pipe = this.pipeline('stock', STOCK_PASS_WGSL, PICTURE_FORMAT, true);
    const pass = encoder.beginRenderPass({
      label: 'film stock',
      colorAttachments: [{ view: this.targets[out].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubo } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.targets[this.cur].createView() },
        { binding: 3, resource: (this.markTexture ?? this.blankMark).createView() },
      ],
    }));
    pass.draw(6);
    pass.end();
    this.cur = out;
  }

  effects(encoder: GPUCommandEncoder, frame: number, seed: number, test: PostTest | null): void {
    if (!test || test.mode === 0 || this.targets.length !== 2) return;
    const ring = this.ensureRing();
    const out = 1 - this.cur;

    this.pack.set('mode', test.mode);
    this.pack.set('layer', this.layerAt(test.delay));
    this.pack.set('frame', frame >>> 0);
    this.pack.set('seed', seed >>> 0);
    this.pack.set('resolution', this.size[0], this.size[1]);
    this.device.queue.writeBuffer(this.ubo, 0, this.pack.bytes);

    const pipe = this.pipeline('test', TEST_PASS_WGSL, PICTURE_FORMAT, true);
    const pass = encoder.beginRenderPass({
      label: 'post effects',
      colorAttachments: [{ view: this.targets[out].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubo } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.targets[this.cur].createView() },
        { binding: 3, resource: (this.markTexture ?? this.blankMark).createView() },
        { binding: 4, resource: ring.createView({ dimension: '2d-array' }) },
      ],
    }));
    pass.draw(6);
    pass.end();

    // The ring keeps the picture as it came in, before this frame's effects.
    this.push(encoder, this.targets[this.cur]);
    this.cur = out;
  }

  /** One frame into the ring, scaled down on the way. */
  private push(encoder: GPUCommandEncoder, picture: GPUTexture): void {
    const ring = this.ensureRing();
    const pipe = this.pipeline('ring blit', BLIT_WGSL, PICTURE_FORMAT, true);
    const pass = encoder.beginRenderPass({
      label: 'history push',
      colorAttachments: [{
        view: ring.createView({ dimension: '2d', baseArrayLayer: this.ringNext, arrayLayerCount: 1 }),
        loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: picture.createView() },
      ],
    }));
    pass.draw(6);
    pass.end();
    this.ringNext = (this.ringNext + 1) % RING_FRAMES;
    this.ringFilled = Math.min(RING_FRAMES, this.ringFilled + 1);
  }

  /** The last three things, onto whatever comes next: the projector, or the canvas. */
  finish(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    view: FinishView,
    timestamps?: GPURenderPassTimestampWrites,
    /** True when the finish goes into the projector's texture, not the canvas. */
    toTexture = false,
  ): void {
    if (this.targets.length !== 2) return;
    this.pack.set('dimmer', view.dimmer);
    this.pack.set('markOn', view.markOn);
    this.pack.set('markRect', ...view.markRect);
    this.pack.set('resolution', this.size[0], this.size[1]);
    this.device.queue.writeBuffer(this.ubo, 0, this.pack.bytes);

    const pipe = this.pipeline('finish', FINISH_PASS_WGSL, this.format, toTexture);
    const pass = encoder.beginRenderPass({
      label: 'post finish',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      timestampWrites: timestamps,
    });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ubo } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.targets[this.cur].createView() },
        { binding: 3, resource: (this.markTexture ?? this.blankMark).createView() },
      ],
    }));
    pass.draw(6);
    pass.end();
    // Back to the first picture for the next frame, so a frame's effects
    // always start from the target the plate drew into.
    this.cur = 0;
  }

  /**
   * The ring, proved: five flat colours pushed through it, then read back at
   * three delays. It is the same check the WebGL chain offers under the same
   * name, because the harness asks it of whichever engine is running.
   *
   * A stall — it maps a buffer and waits — so it belongs to the harness and
   * never to a frame.
   */
  async ringSelfTest(): Promise<{ ok: boolean; detail: string }> {
    if (!this.size[0]) return { ok: false, detail: 'the chain has not drawn a frame yet' };
    const ring = this.ensureRing();
    const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255]];
    const scratch = this.targets[this.cur];
    const encoder = this.device.createCommandEncoder({ label: 'ring self-test' });
    for (const [r, g, b] of colours) {
      // A flat frame, then the same push a real frame takes.
      const paint = encoder.beginRenderPass({
        colorAttachments: [{
          view: scratch.createView(), loadOp: 'clear', storeOp: 'store',
          clearValue: { r: r / 255, g: g / 255, b: b / 255, a: 1 },
        }],
      });
      paint.end();
      this.push(encoder, scratch);
    }
    const [rw, rh] = this.ringSize;
    const row = Math.ceil((rw * 8) / 256) * 256;    // rgba16float: eight bytes a texel
    const reads = [1, 2, 5].map((delay) => ({ delay, layer: this.layerAt(delay), buf: this.device.createBuffer({
      size: row * rh, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    }) }));
    for (const r of reads) {
      encoder.copyTextureToBuffer(
        { texture: ring, origin: [0, 0, r.layer] },
        { buffer: r.buf, bytesPerRow: row },
        [rw, rh, 1],
      );
    }
    this.device.queue.submit([encoder.finish()]);

    const bad: string[] = [];
    for (const r of reads) {
      await r.buf.mapAsync(GPUMapMode.READ);
      const half = new Uint16Array(r.buf.getMappedRange().slice(0));
      r.buf.unmap();
      r.buf.destroy();
      const want = colours[colours.length - r.delay];
      const at = ((rh >> 1) * (row / 2) + (rw >> 1) * 4);
      const got = [0, 1, 2].map((k) => Math.round(halfToFloat(half[at + k]) * 255));
      if (got.some((v, k) => Math.abs(v - want[k]) > 2)) {
        bad.push(`delay ${r.delay} read ${got.join(',')}, pushed ${want.join(',')}`);
      }
    }
    return { ok: bad.length === 0, detail: bad.join('; ') || `${rw}×${rh}, ${RING_FRAMES} frames` };
  }

  dispose(): void {
    this.disposer.dispose();
    this.targets = [];
    this.ring = null;
    this.markTexture = null;
    this.size = [0, 0];
    this.ringSize = [0, 0];
    this.ringNext = 0;
    this.ringFilled = 0;
  }
}

/** One half float, as a number: the ring is `rgba16float` and JavaScript has no such view. */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}
