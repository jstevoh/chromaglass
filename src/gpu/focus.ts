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
 * Not drawn with it, for now (PLAN 51b-3): the lens pass (glitter or the side
 * lamp up) draws the plate sharp, as does the tank's side view; a projector's
 * own source (the Mixer's plate rows into a projector, 16b) is drawn sharp.
 */

import { Disposer, PipelineCache, type Prep, layoutFromWgsl, type RenderRecipe } from './kit';
import { groupOf, viewOf } from './groupCache';
import type { UniformPack } from './uniforms';
import { COLS_WGSL, ROWS_WGSL } from './wgsl/focus';
import { focusWanted } from '../lib/projectorFocus';

/** The plate's picture under the pass, and each projector's rows: half floats, so a dark ramp is not cut to the canvas's steps before the finish's dither. */
export const FOCUS_SCENE_FORMAT: GPUTextureFormat = 'rgba16float';
/** B's share of the wall, the display's third target. */
export const FOCUS_SHARE_FORMAT: GPUTextureFormat = 'rgba8unorm';

const rowsName = (two: boolean) => `focus rows${two ? ' two' : ''}`;
const colsName = (format: GPUTextureFormat, toTexture: boolean) => `focus cols ${format}${toTexture ? ' flipped' : ''}`;

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

type Pictures = { scene: GPUTexture; share: GPUTexture; rowsA: GPUTexture; rowsB: GPUTexture | null };

/** Each projector's focus: see the file's header. */
export class PlateFocus {
  private pics: Pictures | null = null;
  private size = [0, 0];
  private readonly blank: GPUTexture;

  /** Built behind the show: no look opens with a projector soft. */
  static prepare(cache: PipelineCache, device: GPUDevice, format: GPUTextureFormat, picture: GPUTextureFormat): Prep[] {
    return [
      cache.renderPrep(rowsName(false), rowsRecipe(device, false), true),
      cache.renderPrep(rowsName(true), rowsRecipe(device, true), true),
      ...[...new Set([format, picture])].flatMap((f) => [false, true].map((t) => cache.renderPrep(colsName(f, t), colsRecipe(device, f, t), true))),
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
        rowsA: this.picture('focus rows A', FOCUS_SCENE_FORMAT, this.size),
        rowsB: null,
      };
    }
    if (two && !this.pics.rowsB) this.pics.rowsB = this.picture('focus rows B', FOCUS_SCENE_FORMAT, this.size);
    if (!two && this.pics.rowsB) { this.disposer.release(this.pics.rowsB); this.pics.rowsB = null; }
    return { scene: viewOf(this.pics.scene), share: viewOf(this.pics.share) };
  }

  /** Every projector sharp again: the pictures go (a 2560 by 1600 frame's are 130 MB with two projectors). */
  release(): void {
    if (!this.pics) return;
    for (const t of [this.pics.scene, this.pics.share, this.pics.rowsA, this.pics.rowsB]) if (t) this.disposer.release(t);
    this.pics = null;
    this.size = [0, 0];
  }

  get holding(): boolean { return !!this.pics; }

  /** After the plate has drawn into `targets`: the rows, then the columns and the finish into `target`. `mark` is the logo the finish lays. */
  run(encoder: GPUCommandEncoder, target: GPUTextureView, toTexture: boolean, format: GPUTextureFormat, uniforms: GPUBuffer, sampler: GPUSampler, mark: GPUTexture, two: boolean): void {
    const pics = this.pics;
    if (!pics) return;
    const rows = this.pipelines.renderPipeline(rowsName(two), rowsRecipe(this.device, two));
    const cols = this.pipelines.renderPipeline(colsName(format, toTexture), colsRecipe(this.device, format, toTexture));
    if (!rows || !cols) return;
    const rowsB = two ? pics.rowsB : null;
    const clear = { r: 0, g: 0, b: 0, a: 1 };
    const rp = encoder.beginRenderPass({
      label: 'focus rows',
      colorAttachments: [
        { view: viewOf(pics.rowsA), loadOp: 'clear', storeOp: 'store', clearValue: clear },
        ...(rowsB ? [{ view: viewOf(rowsB), loadOp: 'clear' as GPULoadOp, storeOp: 'store' as GPUStoreOp, clearValue: clear }] : []),
      ],
    });
    rp.setPipeline(rows);
    rp.setBindGroup(0, groupOf(this.device, rows, [uniforms, sampler, pics.scene, pics.share]));
    rp.draw(6);
    rp.end();
    const cp = encoder.beginRenderPass({
      label: 'focus cols',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: clear }],
    });
    cp.setPipeline(cols);
    cp.setBindGroup(0, groupOf(this.device, cols, [uniforms, sampler, pics.rowsA, rowsB ?? this.blank, mark]));
    cp.draw(6);
    cp.end();
  }
}
