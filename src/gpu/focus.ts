/**
 * Each projector's focus (PLAN 51b): the plate's picture blurred, projector
 * by projector, by its own lens's defocus. The law is `lib/projectorFocus.ts`,
 * the shaders `wgsl/focus.ts`; this owns the pictures and the pipelines and
 * runs them after the plate, as the lens pass (`glint.ts`) does.
 *
 * `WebGPUPlate.draw` asks `wanted()`. At the default, every projector sharp,
 * it says no: nothing here runs or is allocated, and the plate draws straight
 * into its target as it always did, to the byte. When a projector is soft the
 * plate draws, flipped and unfinished, into this pass's half-float picture,
 * with B's share of the wall in a third target (the display's `share`), and
 * the two passes here draw the blurred wall into the plate's target with the
 * finish the display would have laid.
 *
 * Why a pass after the plate and not a blur inside it: a defocus is a blur of
 * the light on the wall, which the display works out a pixel at a time; a
 * pixel there cannot see its neighbours' light. Blurring the dye instead
 * would be a different picture (the dye's light is exp(−absorbance), and the
 * mean of an exponential is not the exponential of the mean: a defocused edge
 * between clear glass and a deep dye glows on the wall, where a blurred dye
 * field would put a grey dye there).
 *
 * What it costs, measured by the tap count (wgsl/focus.ts): at the rack's
 * real end on a 2560-wide frame the bar is 60 by 30 pixels, 30 taps along a
 * row and 15 down a column, about 75 texture reads a pixel with one
 * projector soft (the rows read the share as well as the picture), against
 * the display's few hundred; and the two pictures between the passes, 16
 * bytes a pixel more (A's and B's rows, B's only with two projectors). A melt
 * past the rack is capped at FOCUS_TAPS a row and a column.
 *
 * A melt is boxed at a half or a quarter of the frame's size (PLAN 51b-3,
 * wgsl/focus.ts's header): once every soft projector's box is wide enough
 * (`focusScale`), `down` takes the light to the smaller picture, the rows and
 * columns run there, and `compose` draws it back with the finish. Two
 * projectors melted on a 1600-square frame cost 19.6 ms a draw on the Air at
 * full size, where the frame has 16.7. The small pictures are four of
 * them a sixteenth or a quarter of the frame's, made when first wanted and
 * let go with the rest.
 *
 * Not drawn with it, for now (PLAN 51b-3): the lens pass (glitter or the side
 * lamp up) draws the plate sharp, as does the tank's side view, and a
 * projector's own plate source (16b, `drawSource`). The mixer's rows laid
 * over both plates (the film, the LED ring) are in the display's picture
 * before the split, so they are shared out by B's share and blurred with it.
 */

import { Disposer, PipelineCache, type Prep, layoutFromWgsl, type RenderRecipe } from './kit';
import { groupOf, viewOf } from './groupCache';
import type { UniformPack } from './uniforms';
import { COLS_WGSL, COMPOSE_WGSL, DOWN_WGSL, LOW_COLS_WGSL, LOW_ROWS_WGSL, ROWS_WGSL } from './wgsl/focus';
import { focusScale, focusWanted } from '../lib/projectorFocus';

/** The plate's picture under the pass, and each projector's rows: half floats, so a dark ramp is not cut to the canvas's steps before the finish's dither. */
export const FOCUS_SCENE_FORMAT: GPUTextureFormat = 'rgba16float';
/** B's share of the wall, the display's third target. */
export const FOCUS_SHARE_FORMAT: GPUTextureFormat = 'rgba8unorm';

const rowsName = (two: boolean) => `focus rows${two ? ' two' : ''}`;
const colsName = (format: GPUTextureFormat, toTexture: boolean) => `focus cols ${format}${toTexture ? ' flipped' : ''}`;
const downName = (two: boolean, scale: number) => `focus down ${scale}${two ? ' two' : ''}`;
const lowRowsName = (two: boolean) => `focus low rows${two ? ' two' : ''}`;
const LOW_COLS = 'focus low cols';
const composeName = (format: GPUTextureFormat, toTexture: boolean) => `focus compose ${format}${toTexture ? ' flipped' : ''}`;

/** A pass of one fragment shader over the whole of its targets: drawn flipped (FLIP_Y −1, a uv is the scene's own row) unless it is the last into a canvas. */
function passRecipe(device: GPUDevice, label: string, wgsl: string, targets: GPUTextureFormat[], flip = true, constants?: Record<string, number>): RenderRecipe {
  const c = { ...(flip ? { FLIP_Y: -1 } : {}), ...constants };
  const consts = Object.keys(c).length ? c : undefined;
  return (module) => ({
    label,
    layout: device.createPipelineLayout({ bindGroupLayouts: [layoutFromWgsl(device, wgsl, label, GPUShaderStage.FRAGMENT)] }),
    vertex: { module: module(wgsl), entryPoint: 'vs', constants: flip ? { FLIP_Y: -1 } : undefined },
    fragment: { module: module(wgsl), entryPoint: 'fs', constants: consts, targets: targets.map((format) => ({ format })) },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}
const twoTargets = (two: boolean): GPUTextureFormat[] => (two ? [FOCUS_SCENE_FORMAT, FOCUS_SCENE_FORMAT] : [FOCUS_SCENE_FORMAT]);
const downRecipe = (device: GPUDevice, two: boolean, scale: number) => passRecipe(device, downName(two, scale), DOWN_WGSL, twoTargets(two), true, { SCALE: scale });
const lowRowsRecipe = (device: GPUDevice, two: boolean) => passRecipe(device, lowRowsName(two), LOW_ROWS_WGSL, twoTargets(two));
const lowColsRecipe = (device: GPUDevice) => passRecipe(device, LOW_COLS, LOW_COLS_WGSL, [FOCUS_SCENE_FORMAT]);
const composeRecipe = (device: GPUDevice, format: GPUTextureFormat, toTexture: boolean) => passRecipe(device, composeName(format, toTexture), COMPOSE_WGSL, [format], toTexture);

function rowsRecipe(device: GPUDevice, two: boolean): RenderRecipe {
  return (module) => ({
    label: rowsName(two),
    layout: device.createPipelineLayout({ bindGroupLayouts: [layoutFromWgsl(device, ROWS_WGSL, 'focus rows', GPUShaderStage.FRAGMENT)] }),
    vertex: { module: module(ROWS_WGSL), entryPoint: 'vs', constants: { FLIP_Y: -1 } },
    // One projector: B's output has no target and is dropped, and the second picture is never made.
    fragment: { module: module(ROWS_WGSL), entryPoint: 'fs', constants: { FLIP_Y: -1 }, targets: two ? [{ format: FOCUS_SCENE_FORMAT }, { format: FOCUS_SCENE_FORMAT }] : [{ format: FOCUS_SCENE_FORMAT }] },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}

function colsRecipe(device: GPUDevice, format: GPUTextureFormat, toTexture: boolean): RenderRecipe {
  return (module) => ({
    label: colsName(format, toTexture),
    layout: device.createPipelineLayout({ bindGroupLayouts: [layoutFromWgsl(device, COLS_WGSL, 'focus cols', GPUShaderStage.FRAGMENT)] }),
    vertex: { module: module(COLS_WGSL), entryPoint: 'vs', constants: toTexture ? { FLIP_Y: -1 } : undefined },
    fragment: { module: module(COLS_WGSL), entryPoint: 'fs', constants: toTexture ? { FLIP_Y: -1 } : undefined, targets: [{ format }] },
    primitive: { topology: 'triangle-list' as GPUPrimitiveTopology },
  });
}

type Pictures = { scene: GPUTexture; share: GPUTexture; rowsA: GPUTexture | null; rowsB: GPUTexture | null };
/** The small pictures of a melt (A's and B's light, then their rows; the wall back into `a`), and the scale they were made at. */
type Low = { scale: number; a: GPUTexture; b: GPUTexture; rowsA: GPUTexture; rowsB: GPUTexture };

/** Each projector's focus: see the file's header. */
export class PlateFocus {
  private pics: Pictures | null = null;
  private low: Low | null = null;
  /** The scale the last run drew at (1 the full frame): the lab reads it, `npm run focus`. */
  scale = 1;
  /** The most a melt is taken down by; the lab sets 1 or 2 to draw the same melt larger, the check's control. */
  maxScale = 8;
  private size = [0, 0];
  private readonly blank: GPUTexture;

  /** Built behind the show: no look opens with a projector soft. */
  static prepare(cache: PipelineCache, device: GPUDevice, format: GPUTextureFormat, picture: GPUTextureFormat): Prep[] {
    return [
      cache.renderPrep(rowsName(false), rowsRecipe(device, false), true),
      cache.renderPrep(rowsName(true), rowsRecipe(device, true), true),
      ...[...new Set([format, picture])].flatMap((f) => [false, true].map((t) => cache.renderPrep(colsName(f, t), colsRecipe(device, f, t), true))),
      // A melt's smaller pictures (PLAN 51b-3): built behind the show too, and until they are the melt draws at full size.
      ...[false, true].flatMap((two) => [2, 4, 8].map((k) => cache.renderPrep(downName(two, k), downRecipe(device, two, k), true))),
      ...[false, true].map((two) => cache.renderPrep(lowRowsName(two), lowRowsRecipe(device, two), true)),
      cache.renderPrep(LOW_COLS, lowColsRecipe(device), true),
      ...[...new Set([format, picture])].flatMap((f) => [false, true].map((t) => cache.renderPrep(composeName(f, t), composeRecipe(device, f, t), true))),
    ];
  }

  /** Whether the frame wants the pass: a projector soft by half a pixel or more (`projFocus`, lib/projectorFocus focusWanted). */
  static wanted(pack: UniformPack): boolean { return focusWanted(pack.get('projFocus')); }

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, private readonly disposer: Disposer) {
    this.blank = disposer.track(device.createTexture({ label: 'focus blank', size: [1, 1], format: FOCUS_SCENE_FORMAT, usage: GPUTextureUsage.TEXTURE_BINDING }));
  }

  /** The pass's pipelines, or false while one is missing: then the plate draws sharp, straight to its target. */
  ready(format: GPUTextureFormat, toTexture: boolean, two: boolean): boolean {
    return !!this.pipelines.renderPipeline(rowsName(two), rowsRecipe(this.device, two))
      && !!this.pipelines.renderPipeline(colsName(format, toTexture), colsRecipe(this.device, format, toTexture));
  }

  private picture(label: string, format: GPUTextureFormat, [w, h]: number[]): GPUTexture {
    return this.disposer.track(this.device.createTexture({
      label, size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
  }

  /** Where the plate draws while this pass is on: its picture, and B's share (the display's first and third targets). */
  targets(width: number, height: number, two: boolean): { scene: GPUTextureView; share: GPUTextureView } {
    if (!this.pics || this.size[0] !== width || this.size[1] !== height) {
      this.release();
      this.size = [width, height];
      this.pics = {
        scene: this.picture('focus scene', FOCUS_SCENE_FORMAT, this.size),
        share: this.picture('focus share', FOCUS_SHARE_FORMAT, this.size),
        rowsA: null,
        rowsB: null,
      };
    }
    if (!two && this.pics.rowsB) { this.disposer.release(this.pics.rowsB); this.pics.rowsB = null; }
    return { scene: viewOf(this.pics.scene), share: viewOf(this.pics.share) };
  }

  /** Every projector sharp again: the pictures go (a 2560 by 1600 frame's are 130 MB with two projectors). */
  release(): void {
    if (!this.pics) return;
    for (const t of [this.pics.scene, this.pics.share, this.pics.rowsA, this.pics.rowsB]) if (t) this.disposer.release(t);
    this.pics = null;
    this.releaseLow();
    this.size = [0, 0];
  }

  private releaseLow(): void {
    if (!this.low) return;
    for (const t of [this.low.a, this.low.b, this.low.rowsA, this.low.rowsB]) this.disposer.release(t);
    this.low = null;
  }

  get holding(): boolean { return !!this.pics; }

  /** The melt's pipelines at `scale`, or null while one is still building (then the melt draws at full size). */
  private lowPipes(format: GPUTextureFormat, toTexture: boolean, two: boolean, scale: number) {
    const p = this.pipelines, d = this.device;
    const down = p.renderPipeline(downName(two, scale), downRecipe(d, two, scale));
    const rows = p.renderPipeline(lowRowsName(two), lowRowsRecipe(d, two));
    const cols = p.renderPipeline(LOW_COLS, lowColsRecipe(d));
    const compose = p.renderPipeline(composeName(format, toTexture), composeRecipe(d, format, toTexture));
    return down && rows && cols && compose ? { down, rows, cols, compose } : null;
  }

  private pass(encoder: GPUCommandEncoder, label: string, pipe: GPURenderPipeline, targets: GPUTextureView[], bind: Parameters<typeof groupOf>[2]): void {
    const rp = encoder.beginRenderPass({
      label,
      colorAttachments: targets.map((view) => ({ view, loadOp: 'clear' as GPULoadOp, storeOp: 'store' as GPUStoreOp, clearValue: { r: 0, g: 0, b: 0, a: 1 } })),
    });
    rp.setPipeline(pipe);
    rp.setBindGroup(0, groupOf(this.device, pipe, bind));
    rp.draw(6);
    rp.end();
  }

  /**
   * After the plate has drawn into `targets`: the rows, then the columns and
   * the finish into `target`, at full size or, for a melt, at a smaller one
   * (`focusScale` of the box, `box` the pack's `projFocus`). `mark` is the logo the finish lays.
   */
  run(encoder: GPUCommandEncoder, target: GPUTextureView, toTexture: boolean, format: GPUTextureFormat, uniforms: GPUBuffer, sampler: GPUSampler, mark: GPUTexture, two: boolean, box: ArrayLike<number>): void {
    const pics = this.pics;
    if (!pics) return;
    const want = Math.min(this.maxScale, focusScale(box, two));
    const low = want > 1 ? this.lowPipes(format, toTexture, two, want) : null;
    this.scale = low ? want : 1;
    if (low) {
      const [w, h] = this.size;
      if (!this.low || this.low.scale !== want) {
        this.releaseLow();
        const at = [Math.ceil(w / want), Math.ceil(h / want)];
        this.low = { scale: want, a: this.picture('focus low A', FOCUS_SCENE_FORMAT, at), b: this.picture('focus low B', FOCUS_SCENE_FORMAT, at), rowsA: this.picture('focus low rows A', FOCUS_SCENE_FORMAT, at), rowsB: this.picture('focus low rows B', FOCUS_SCENE_FORMAT, at) };
      }
      const L = this.low;
      const ab = two ? [viewOf(L.a), viewOf(L.b)] : [viewOf(L.a)];
      const rowsAB = two ? [viewOf(L.rowsA), viewOf(L.rowsB)] : [viewOf(L.rowsA)];
      this.pass(encoder, 'focus down', low.down, ab, [uniforms, sampler, pics.scene, pics.share]);
      this.pass(encoder, 'focus low rows', low.rows, rowsAB, [uniforms, sampler, L.a, L.b]);
      // The wall, A's and B's added, back into A's small picture: its light is in the rows now.
      this.pass(encoder, 'focus low cols', low.cols, [viewOf(L.a)], [uniforms, sampler, L.rowsA, L.rowsB]);
      this.pass(encoder, 'focus compose', low.compose, [target], [uniforms, sampler, L.a, pics.scene, pics.share, mark]);
      return;
    }
    // Back at full size from a melt (racked in past the scale): its small pictures go.
    this.releaseLow();
    const rows = this.pipelines.renderPipeline(rowsName(two), rowsRecipe(this.device, two));
    const cols = this.pipelines.renderPipeline(colsName(format, toTexture), colsRecipe(this.device, format, toTexture));
    if (!rows || !cols) return;
    pics.rowsA ??= this.picture('focus rows A', FOCUS_SCENE_FORMAT, this.size);
    if (two) pics.rowsB ??= this.picture('focus rows B', FOCUS_SCENE_FORMAT, this.size);
    const rowsB = two ? pics.rowsB : null;
    this.pass(encoder, 'focus rows', rows, rowsB ? [viewOf(pics.rowsA), viewOf(rowsB)] : [viewOf(pics.rowsA)], [uniforms, sampler, pics.scene, pics.share]);
    this.pass(encoder, 'focus cols', cols, [target], [uniforms, sampler, pics.rowsA, rowsB ?? this.blank, mark]);
  }
}
