/**
 * The plate's lens pass (PLAN 47e, 47d, 47b-side): glitter in the liquid, the
 * lens that photographs it, and a side lamp. The laws are in `lib/glint.ts`,
 * the shaders in `wgsl/glint.ts`; this owns the specks' buffer, the two
 * pictures and the three pipelines, and runs them after the plate.
 *
 * `WebGPUPlate.draw` asks `wanted()`. When it says no (Glitter and Side Light
 * both at 0, every look made before this) nothing here runs, nothing is
 * allocated, and the plate draws straight into its target as it always did.
 * When it says yes the plate draws, flipped and unfinished, into this pass's
 * own picture; the specks are stepped and splatted; and the lens pass draws
 * the photograph into the plate's target, laying the finish the plate would
 * have laid (`lensFinish`).
 *
 * The specks are moved here, in the frame, and not in the solver's step: they
 * ride the solver's own field (the packed `velForced` the dye rides) by the
 * solver's own displacement, the lead plate's cell clock (lib/detailFlow:
 * every step adds its displacement to it), so a speck and the dye beside it
 * travel together however many steps a frame took. One step a frame is what
 * the picture needs; the solver's step is in `gpu/fluid.ts`, which is held at
 * its size, and a second population in it would be paid for at every step.
 */

import { Disposer, PipelineCache, type Prep, layoutFromWgsl, type RenderRecipe } from './kit';
import { groupOf, viewOf } from './groupCache';
import type { UniformPack } from './uniforms';
import { LENS_WGSL, SPECK_STRIDE, SPLAT_VERTS, SPLAT_WGSL, STEP_WGSL } from './wgsl/glint';
import { SIDE_RADIANCE, SPECK_MAX, glintWanted, speckCount } from '../lib/glint';
import { CELL_CLOCK_WRAP, CELL_TRAVEL } from '../lib/detailFlow';

const GROUP = 256;
const GLINT_FORMAT: GPUTextureFormat = 'rgba16float';
/*
  The plate's picture under the pass: half floats, whatever the target. The
  display draws into it without its finish (the pass lays that), so in the
  canvas's 8 bits a dark ramp would be cut to steps before the pass's dither
  could break them up, the banding the dither is there for (plateUniforms).
*/
export const GLINT_SCENE_FORMAT: GPUTextureFormat = 'rgba16float';
/** A gap in the plate's clock longer than this (a stopped show, a hidden window, a frame the pass sat out) carries nothing: the flakes start again from where they are. */
const FRAME_GAP = 0.25;
const ADD: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

function lensName(format: GPUTextureFormat, toTexture: boolean): string {
  return `glint lens ${format}${toTexture ? ' flipped' : ''}`;
}

function lensRecipe(device: GPUDevice, format: GPUTextureFormat, toTexture: boolean): RenderRecipe {
  return (module) => ({
    label: lensName(format, toTexture),
    layout: device.createPipelineLayout({ bindGroupLayouts: [layoutFromWgsl(device, LENS_WGSL, 'glint lens', GPUShaderStage.FRAGMENT)] }),
    vertex: { module: module(LENS_WGSL), entryPoint: 'vs', constants: toTexture ? { FLIP_Y: -1 } : undefined },
    fragment: { module: module(LENS_WGSL), entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}

function splatRecipe(device: GPUDevice): RenderRecipe {
  return (module) => ({
    label: 'glint splat',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [layoutFromWgsl(device, SPLAT_WGSL, 'glint splat', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)],
    }),
    vertex: { module: module(SPLAT_WGSL), entryPoint: 'vs' },
    fragment: { module: module(SPLAT_WGSL), entryPoint: 'fs', targets: [{ format: GLINT_FORMAT, blend: ADD }] },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}

/** The plate's lens pass: see the file's header. */
export class PlateGlint {
  private specks: GPUBuffer | null = null;
  private readonly stepArgs: GPUBuffer;
  private readonly stepData = new Float32Array(4);
  private scene: GPUTexture | null = null;
  private glints: GPUTexture | null = null;
  private size = [0, 0];
  private sceneFormat: GPUTextureFormat | null = null;
  private readonly blank: GPUTexture;
  private lastClock: number | null = null;
  private lastTime: number | null = null;

  /** Built behind the show, never before it opens: no look opens with glitter or the side lamp. */
  static prepare(cache: PipelineCache, device: GPUDevice, format: GPUTextureFormat, picture: GPUTextureFormat): Prep[] {
    return [
      cache.computePrep('glint step', STEP_WGSL, true),
      cache.renderPrep('glint splat', splatRecipe(device), true),
      ...[...new Set([format, picture])].flatMap((f) => [false, true].map((t) => cache.renderPrep(lensName(f, t), lensRecipe(device, f, t), true))),
    ];
  }

  /** Whether the frame wants the pass: Glitter or Side Light above nothing (lib/glint glintWanted). */
  static wanted(pack: UniformPack): boolean {
    // The pack holds the side lamp's radiance (Side Light × SIDE_RADIANCE); the threshold is the dial's.
    return glintWanted(pack.get('glitter')[0], pack.get('sideLight')[0] / SIDE_RADIANCE);
  }

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, private readonly disposer: Disposer) {
    this.stepArgs = disposer.track(device.createBuffer({ label: 'glint step', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.blank = disposer.track(device.createTexture({
      label: 'glint blank', size: [1, 1], format: GLINT_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    }));
  }

  /** The pipelines this pass needs, or false while any is missing: then the plate draws straight to its target, as without it. */
  ready(format: GPUTextureFormat, toTexture: boolean, specks: boolean): boolean {
    if (!this.pipelines.renderPipeline(lensName(format, toTexture), lensRecipe(this.device, format, toTexture))) return false;
    if (!specks) return true;
    return !!this.pipelines.computePipeline('glint step', STEP_WGSL) && !!this.pipelines.renderPipeline('glint splat', splatRecipe(this.device));
  }

  /** Where the plate draws while this pass is on: its own picture, in half floats (GLINT_SCENE_FORMAT). */
  sceneView(width: number, height: number): GPUTextureView {
    const format = GLINT_SCENE_FORMAT;
    if (!this.scene || this.size[0] !== width || this.size[1] !== height || this.sceneFormat !== format) {
      if (this.scene) this.disposer.release(this.scene);
      if (this.glints) { this.disposer.release(this.glints); this.glints = null; }
      this.scene = this.disposer.track(this.device.createTexture({
        label: 'glint scene', size: [width, height], format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.size = [width, height];
      this.sceneFormat = format;
    }
    return viewOf(this.scene);
  }

  /**
   * The specks' displacement this frame: how far the lead plate's dye moved
   * per unit of velocity since the last frame, from its cell clock (which
   * wraps at CELL_CLOCK_WRAP). A jump backward that is not a wrap, a rebuilt
   * solver's clock starting again, moves nothing.
   */
  private frameDisp(clock: number): number {
    const last = this.lastClock;
    this.lastClock = clock;
    if (last === null || !Number.isFinite(clock)) return 0;
    let d = clock - last;
    if (d < 0) d += CELL_CLOCK_WRAP;
    if (d < 0 || d > CELL_CLOCK_WRAP * 0.25) return 0;
    return d * CELL_TRAVEL;
  }

  /*
    The seconds since the last frame, on the plate's own clock (the pack's
    time), not the wall's: a paused or offline-rendered show stops or steps
    the flakes' ageing and settling with its picture. A gap past FRAME_GAP,
    or the clock running back, carries nothing and starts the displacement
    clock again too, so a frame the pass sat out cannot hand the flakes a
    quarter of the clock's wrap in one step.
  */
  private frameSeconds(time: number): number {
    const last = this.lastTime;
    this.lastTime = time;
    if (last === null || !Number.isFinite(time)) return 0;
    const dt = time - last;
    if (!(dt >= 0) || dt > FRAME_GAP) { this.lastClock = null; return 0; }
    return Math.min(0.1, dt);
  }

  /** Let go of the pass's pictures and flakes: the plate calls this on a frame that does not want the pass, so dials at 0 hold nothing. */
  release(): void {
    if (this.scene) { this.disposer.release(this.scene); this.scene = null; }
    if (this.glints) { this.disposer.release(this.glints); this.glints = null; }
    if (this.specks) { this.disposer.release(this.specks); this.specks = null; }
    this.sceneFormat = null;
    this.size = [0, 0];
    this.lastClock = null;
    this.lastTime = null;
  }

  /** Whether the pass holds anything to let go of. */
  get holding(): boolean { return !!(this.scene || this.glints || this.specks); }

  /**
   * After the plate has drawn into `sceneView`: step and splat the specks,
   * then the lens pass into `target`. `aux` is the plate's second
   * attachment (its normals, the dye's height, the bubbles), `vel` the lead
   * plate's packed flow, `mark` the logo the finish lays.
   */
  run(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    toTexture: boolean,
    format: GPUTextureFormat,
    pack: UniformPack,
    uniforms: GPUBuffer,
    sampler: GPUSampler,
    aux: GPUTexture,
    vel: GPUTexture,
    mark: GPUTexture,
  ): void {
    if (!this.scene) return;
    const [width, height] = this.size;
    const count = speckCount(pack.get('glitter')[0]);
    const dt = this.frameSeconds(pack.get('time')[0]);
    const disp = this.frameDisp(pack.get('cellClock')[0]);
    let glints = this.blank;
    if (count > 0) {
      if (!this.specks) {
        // COPY_SRC: the lab reads the flakes back to see them ride the flow (`npm run glint`).
        this.specks = this.disposer.track(this.device.createBuffer({ label: 'glitter', size: SPECK_MAX * SPECK_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
      }
      if (!this.glints) {
        this.glints = this.disposer.track(this.device.createTexture({
          label: 'glints', size: [width, height], format: GLINT_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }));
      }
      this.stepData[0] = count;
      this.stepData[1] = disp;
      this.stepData[2] = dt;
      this.stepData[3] = 0x2545;
      this.device.queue.writeBuffer(this.stepArgs, 0, this.stepData);
      const step = this.pipelines.computePipeline('glint step', STEP_WGSL);
      const splat = this.pipelines.renderPipeline('glint splat', splatRecipe(this.device));
      if (step && splat) {
        const cp = encoder.beginComputePass({ label: 'glint step' });
        cp.setPipeline(step);
        cp.setBindGroup(0, groupOf(this.device, step, [this.stepArgs, sampler, vel, this.specks]));
        cp.dispatchWorkgroups(Math.ceil(count / GROUP));
        cp.end();
        const rp = encoder.beginRenderPass({
          label: 'glint splat',
          colorAttachments: [{ view: viewOf(this.glints), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
        });
        rp.setPipeline(splat);
        rp.setBindGroup(0, groupOf(this.device, splat, [uniforms, sampler, this.specks, this.scene, aux]));
        rp.draw(SPLAT_VERTS, count);
        rp.end();
        glints = this.glints;
      }
    } else {
      // Glitter off with the side lamp on: the flakes wait where they are (their buffer is small and kept), the
      // full-size glints picture goes, and the clocks start again when Glitter is back.
      if (this.glints) { this.disposer.release(this.glints); this.glints = null; }
      this.lastClock = null;
      this.lastTime = null;
    }
    const lens = this.pipelines.renderPipeline(lensName(format, toTexture), lensRecipe(this.device, format, toTexture));
    if (!lens) return;
    const pass = encoder.beginRenderPass({
      label: 'glint lens',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(lens);
    pass.setBindGroup(0, groupOf(this.device, lens, [uniforms, sampler, this.scene, glints, aux, mark]));
    pass.draw(6);
    pass.end();
  }
}
