/**
 * The lamp's light traced through the liquid to the wall (PLAN 31s-2): the
 * host side of `wgsl/caustic.ts`, whose header holds the law. Each frame the
 * projector is focused off the liquid, each layer's derived path (`.w`) is
 * turned into a mesh of landed rays, the mesh is drawn where it lands with
 * each triangle's light, the result is spread by the lamp's disc, and the
 * wall's light per texel goes into one storage buffer the display reads at
 * binding 27 (`causticGain`, plateTransmit.ts):
 *
 *   [dz traced at, m, 0, 0, layer 0's m*m texels, layer 1's m*m texels]
 *
 * The header lets the display tell whether the light was traced for its own
 * Focus: a projector source drawn again with other uniforms (`drawSource`)
 * falls back to the first-order shadowgraph rather than read another's light.
 *
 * Nothing runs at Focus's middle (dz 0: the liquid in focus, no ray has
 * moved), in the camera's views (which keep their own relief, camLap), or
 * before the pipelines are built behind the show (the display draws the old
 * first order meanwhile).
 */
import { Disposer, PipelineCache, type Prep, layoutEntries, type RenderRecipe } from './kit';
import { groupOf, viewOf } from './groupCache';
import { DISH_GAP_METRES, DISH_METRES } from '../lib/turntable';
import {
  CAUSTIC_BORDER, CAUSTIC_KERNELS, CAUSTIC_MESH_WGSL, LAMP_HALF_ANGLE, PROJECTOR_DEFOCUS_METRES, type CausticKernel,
} from './wgsl/caustic';

/** The mesh's cells across, at most: 2 x 512^2 triangles, past which a frame pays more than the light shows. */
const MESH_MOST = 512;
/** The lamp disc's blur, in texels each side, at most (a far defocus is soft anyway, and the focus pass blurs it more). */
const REACH_MOST = 24;
/** The lamp disc's blur at least, in texels (paramsFor says why). */
const SIGMA_LEAST = 0.5;

const meshRecipe = (device: GPUDevice, splat = false): RenderRecipe => (module) => ({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [device.createBindGroupLayout({
      label: 'caustic mesh',
      entries: layoutEntries(CAUSTIC_MESH_WGSL, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT),
    })],
  }),
  vertex: { module: module(CAUSTIC_MESH_WGSL), entryPoint: splat ? 'vsSplat' : 'vs' },
  fragment: {
    module: module(CAUSTIC_MESH_WGSL),
    entryPoint: 'fs',
    targets: [{
      format: 'r16float',
      blend: {
        color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
        alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
      },
    }],
  },
  // No culling: a folded sheet of the map lands its triangles turned over, and they are light too.
  primitive: { topology: 'triangle-list', cullMode: 'none' },
});

/** What the trace needs from the frame's uniforms: Focus, Boundary Contrast's gain, and whether a camera draws. */
export interface CausticAsk {
  projectorFocus: number;
  boundaryContrast: number;
  /** The closeup or the photo camera: they draw their own relief. */
  camera: boolean;
  /** The derive pass ran (the display reads .w only then). */
  derived: boolean;
}

/** The dz the display compares against, Focus's throw times Boundary Contrast's gain (0: nothing to trace). */
export function causticDz(ask: CausticAsk): number {
  if (ask.camera || !ask.derived) return 0;
  const dz = (ask.projectorFocus - 0.5) * 1.5;
  if (Math.abs(dz) <= 0.001) return 0;
  return dz * Math.max(1, ask.boundaryContrast * 2);
}

export class PlateCaustics {
  private readonly sampler: GPUSampler;
  private readonly params: GPUBuffer[] = [];
  private readonly paramBytes = new ArrayBuffer(32);
  private readonly paramU32 = new Uint32Array(this.paramBytes);
  private readonly paramF32 = new Float32Array(this.paramBytes);
  private m = 0;
  private rays: GPUBuffer | null = null;
  private rows: GPUBuffer | null = null;
  private lit: GPUTexture | null = null;
  private light: GPUBuffer | null = null;

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, private readonly disposer: Disposer) {
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  }

  /** Built behind the show: no look opens with Focus off the middle. */
  static prepare(cache: PipelineCache, device: GPUDevice): Prep[] {
    return [
      ...Object.entries(CAUSTIC_KERNELS).map(([name, code]) => cache.computePrep(name, code, true)),
      cache.renderPrep('causticMesh', meshRecipe(device), true),
      cache.renderPrep('causticSplats', meshRecipe(device, true), true),
    ];
  }

  private size(m: number): void {
    if (this.m === m && this.light) return;
    for (const b of [this.rays, this.rows, this.light]) if (b) this.disposer.release(b);
    if (this.lit) this.disposer.release(this.lit);
    const side = m + 2 * CAUSTIC_BORDER + 1;
    const buf = (label: string, bytes: number, usage = GPUBufferUsage.STORAGE) => this.disposer.track(this.device.createBuffer({ label, size: bytes, usage }));
    this.rays = buf('caustic rays', side * side * 16);
    this.rows = buf('caustic rows', m * m * 4);
    // COPY_SRC so npm run caustics can read the light the display reads.
    this.light = buf('caustic light', (4 + 2 * m * m) * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.lit = this.disposer.track(this.device.createTexture({
      label: 'caustic wall', size: [m, m], format: 'r16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
    this.m = m;
  }

  private paramsFor(layer: number, m: number, dz: number): GPUBuffer {
    while (this.params.length <= layer) {
      this.params.push(this.disposer.track(this.device.createBuffer({
        label: `caustic params ${this.params.length}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })));
    }
    const metres = dz * PROJECTOR_DEFOCUS_METRES;
    // The lamp's disc on the wall, radius |dz| * angle, in texels of m across the plate.
    const radius = Math.abs(metres) * LAMP_HALF_ANGLE / (DISH_METRES / m);
    /*
      Never under half a texel: the path is one value a cell (the mesh's
      corners), so the wall's light holds nothing finer, and the splats of
      gathered triangles (CAUSTIC_SPLAT_FROM), tents closer than a texel,
      sum to a few percent of ripple at twice gathered, which this takes
      to under one.
    */
    const sigma = Math.max(SIGMA_LEAST, radius / 2);
    const reach = Math.min(REACH_MOST, Math.ceil(2.5 * sigma));
    this.paramU32[0] = m;
    this.paramU32[1] = CAUSTIC_BORDER;
    this.paramU32[2] = 4 + layer * m * m;
    this.paramU32[3] = reach;
    this.paramF32[4] = metres * DISH_GAP_METRES / (DISH_METRES * DISH_METRES);
    this.paramF32[5] = Math.max(sigma, 1e-3);
    this.paramF32[6] = dz;
    this.paramF32[7] = 0;
    this.device.queue.writeBuffer(this.params[layer], 0, this.paramBytes);
    return this.params[layer];
  }

  /**
   * Trace each layer's light (`derived`, the derive pass's targets, written
   * earlier in `encoder`) at `dz` (causticDz). Returns the light buffer, or
   * null when there is nothing to trace or a pipeline is not built yet.
   */
  trace(encoder: GPUCommandEncoder, derived: readonly GPUTexture[], dz: number): GPUBuffer | null {
    if (dz === 0 || !derived.length) return null;
    const pipe = (name: CausticKernel) => this.pipelines.computePipeline(name, CAUSTIC_KERNELS[name]);
    const rays = pipe('causticRays'), blurX = pipe('causticBlurX'), blurY = pipe('causticBlurY');
    const mesh = this.pipelines.renderPipeline('causticMesh', meshRecipe(this.device));
    const splats = this.pipelines.renderPipeline('causticSplats', meshRecipe(this.device, true));
    if (!rays || !blurX || !blurY || !mesh || !splats) return null;
    const m = Math.max(32, Math.min(MESH_MOST, Math.round(derived[0].width / 2)));
    this.size(m);
    const side = m + 2 * CAUSTIC_BORDER + 1;
    const cells = m + 2 * CAUSTIC_BORDER;
    const groups = Math.ceil(m / 8);
    for (let i = 0; i < Math.min(2, derived.length); i++) {
      const u = this.paramsFor(i, m, dz);
      const c = encoder.beginComputePass({ label: `caustic rays ${i}` });
      c.setPipeline(rays);
      c.setBindGroup(0, groupOf(this.device, rays, [u, derived[i], this.sampler, this.rays!]));
      c.dispatchWorkgroups(Math.ceil(side / 8), Math.ceil(side / 8));
      c.end();
      const r = encoder.beginRenderPass({
        label: `caustic mesh ${i}`,
        colorAttachments: [{ view: viewOf(this.lit!), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      const tris = 2 * cells * cells;
      r.setPipeline(mesh);
      r.setBindGroup(0, groupOf(this.device, mesh, [u, this.rays!]));
      r.draw(3 * tris);
      // The gathered triangles' light (CAUSTIC_SPLAT_FROM, _FULL), one tent each (wgsl/caustic.ts says why).
      r.setPipeline(splats);
      r.setBindGroup(0, groupOf(this.device, splats, [u, this.rays!]));
      r.draw(6 * tris);
      r.end();
      const b = encoder.beginComputePass({ label: `caustic lamp disc ${i}` });
      b.setPipeline(blurX);
      b.setBindGroup(0, groupOf(this.device, blurX, [u, this.lit!, this.rows!]));
      b.dispatchWorkgroups(groups, groups);
      b.setPipeline(blurY);
      b.setBindGroup(0, groupOf(this.device, blurY, [u, this.rows!, this.light!]));
      b.dispatchWorkgroups(groups, groups);
      b.end();
    }
    return this.light;
  }
}
