/**
 * The closeup's fine dye (PLAN 47a-1, 47a): the dye finer than the solver's
 * grid, carried over the camera's window and added to the plate as detail.
 *
 * **What it is for.** At 6x a solver cell covers tens of screen pixels, and
 * the grid's dye is smooth below a cell, so the closeup was one magnified
 * blur: 1.2 on the "fine over coarse" measure where a macro artist's films
 * of real dye in a dish read 2.2 to 3.1 (closeupWindow.ts has the numbers).
 * A real dye diffuses a thousand times more slowly than momentum (Schmidt
 * number about 10³), so a stirred dish folds it into threads far finer than
 * the flow's smallest eddy, the Batchelor scale. The flow itself is smooth
 * at the cell, and that is why a coarse velocity can carry a fine dye: it is
 * exactly the regime the real liquid is in.
 *
 * **How.** Two fields over the window (`closeupWindow.ts`), each a copy of
 * the grid's dye at about two screen pixels a texel, carried about once a
 * frame through the solver's own velocity with no diffusion (the Batchelor limit),
 * read back by a clamped Catmull-Rom that neither blurs nor rings. Where the
 * flow stretches and folds, an edge the grid had a cell wide becomes a
 * thread a texel wide, as in the dish. Each field is born again from the
 * grid every `FINE_LIFE` seconds, the two half a life apart, and they are
 * crossfaded by a triangle on their age (their weights always sum to one),
 * because a field carried for ever drifts away from the grid's dye: the grid
 * has its pours, its diffusion, its reactions and its walls, and the fine
 * field knows only the flow.
 *
 * What the plate shows is each fine field scaled so its mean round each
 * solver cell has the grid's thickness there, in the colour the field
 * carried, and the grid's own dye where the field holds less than the grid
 * (a pour since it was born). So how much dye there is at every scale the
 * grid holds stays the grid's: a pour shows at once, the 1x view and the
 * closeup agree, and only what lies below a cell comes from here.
 * (`FINE_DETAIL_WGSL` has the two forms the lab dropped on the way.)
 *
 * **What was tried first and dropped** (PLAN 47a-1, the handoff of
 * 2026-11-13): a fine grid nudged to the coarse every step lost the detail
 * (the coarse dye has lost the folded filaments, so nudging to it erases
 * them; fine over coarse 1.03 in a CPU toy), and the dye's particles born in
 * the window and splatted at screen scale made 2.8 on the measure but drew
 * Poisson grain and a speckled spray at every edge, because neighbouring
 * particles carry colours born at different times from a diffusing grid.
 * The CPU toy of this route drew sharp threads where the flow folds and
 * smooth dye elsewhere.
 *
 * A camera that pans, turns or zooms between steps is handled by the same
 * remap as the flow: a texel of the new window is traced back to where its
 * dye was and read from the old window there (`FINE_ADVECT_WGSL`). Dye that
 * comes in past the window's edge is the grid's.
 */

import { FINE_LAYOUT, FINE_ADVECT_WGSL, FINE_REDUCE_WGSL, FINE_DETAIL_WGSL } from './wgsl/fineDye';
import { UniformPack } from './uniforms';
import { PipelineCache, type Prep } from './kit';
import { groupOf } from './groupCache';
import type { Opening } from './opening';
import { type CloseupWindow, WINDOW_MIN_CELL } from './closeupWindow';

/**
 * Seconds a fine field is carried before it is born again from the grid.
 * Long enough for a stir to fold a cell-wide edge into threads (a shear of
 * a cell a second stretches an edge to a tenth of a cell in about ten
 * seconds, and the stirring of a show is faster than that); short enough
 * that the grid's own changes (a pour's spread, a reaction's front) are
 * never more than a couple of seconds stale in the detail, which is all the
 * fine field contributes anyway. The CPU toy settled on four.
 */
export const FINE_LIFE = 3;

/**
 * The least time, in the step's own units, between two steps of the fine
 * dye. The solver may run several steps a frame and only the last is seen;
 * stepping the fine dye at every one cost the owner's Mac a third of its
 * frame rate on a held closeup (Acid Trip 28 to 16 fps, Classic 27 to 17,
 * filmed 2026-11-13). So the steps' displacements and times are summed and
 * the fine dye takes them in one: about one step a frame at the app's pace
 * (a frame of a plate-second is about 0.01 of `dt`, lib/detailFlow.ts), every
 * third in the lab (dt 0.004). A semi-Lagrangian step is stable at any
 * length; the cost is that the velocity of the last step carries the whole
 * sum, which over a hundredth of a plate-second is the flow it already was.
 */
export const FINE_TICK = 0.01;

/*
  The seed is the grid's dye as it is. A version born with the grid's
  numerical diffusion undone (one backward heat step, clamped to its
  neighbours) made a still edge crisp, and on the owner's Mac it drew a
  poured column's edge as a row of regular teeth that held all fifteen
  seconds: the grid's own edge is a staircase at its cells, softened by the
  Catmull-Rom read, and sharpening a softened staircase gives back the
  stairs. Only the flow sharpens now, as it does in the dish (47a-3 is the
  edge carried as an interface instead).
*/

const WG = 8;

function tex(device: GPUDevice, label: string, w: number, h: number, format: GPUTextureFormat = 'rgba16float'): GPUTexture {
  return device.createTexture({
    label,
    size: [w, h],
    format,
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
}

export class FineDye {
  private readonly pipelines: PipelineCache;
  private readonly pack = new UniformPack(FINE_LAYOUT);
  private readonly uniform: GPUBuffer;
  /** The two fields, each a read and a write. */
  private f0: [GPUTexture, GPUTexture] | null = null;
  private f1: [GPUTexture, GPUTexture] | null = null;
  /** Each field's block means; sized for the smallest block (`WINDOW_MIN_CELL`). */
  private l0: GPUTexture | null = null;
  private l1: GPUTexture | null = null;
  /** What the plate multiplies the grid's dye by: the fine dye over the grid's, channel by channel. */
  private detailTex: GPUTexture | null = null;
  /** Which of each pair holds the fields now. */
  private read = 0;
  /** Where the camera looks and how much it wants (`setWindow`), for the next step. */
  private want: CloseupWindow | null = null;
  private amount = 0;
  /** The window the fields and the detail are in now: the last step's. Null while there is none. */
  private held: CloseupWindow | null = null;
  /** Each field's age, seconds. */
  private a0 = 0;
  private a1 = FINE_LIFE / 2;
  /** The steps' displacement and time not yet taken (FINE_TICK). */
  private sumDisp = 0;
  private sumDt = 0;
  private disposed = false;

  /**
   * Built before the show opens when the look opens in the closeup with
   * Fine Detail up (`open.closeup`), and behind the show otherwise: the
   * closeup is then reached by zooming in, after they are built.
   */
  static prepare(device: GPUDevice, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'fineDye');
    return [
      cache.computePrep('fine advect', FINE_ADVECT_WGSL, !open.closeup),
      cache.computePrep('fine reduce', FINE_REDUCE_WGSL, !open.closeup),
      cache.computePrep('fine detail', FINE_DETAIL_WGSL, !open.closeup),
    ];
  }

  constructor(private readonly device: GPUDevice) {
    this.pipelines = PipelineCache.for(device, 'fineDye');
    this.uniform = device.createBuffer({ label: 'fine dye', size: this.pack.bytes.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  /** Where the closeup looks and how much fine dye it shows (closeupWindow.ts); null or 0 stops it. Taken by the next step. */
  setWindow(w: CloseupWindow | null, amount: number): void {
    this.want = w;
    this.amount = amount;
  }

  /** The window the detail is in, which the plate reads it through; null when there is none. */
  get window(): CloseupWindow | null { return this.held; }

  /** How much of the detail the plate adds (Fine Detail times the closeup), with the window it was set with. */
  get strength(): number { return this.held ? this.amount : 0; }

  /** The detail texture, or null when there is none. */
  get detail(): GPUTexture | null { return this.held ? this.detailTex : null; }

  /** The textures for a window of this size, made again only when it changes; true when they are new. */
  private ensure(w: CloseupWindow): boolean {
    const t = this.detailTex;
    if (t && t.width === w.texX && t.height === w.texY) return false;
    this.release();
    const d = this.device;
    // The two fields are 32-bit. They are read back and written again every
    // step for three seconds, and at 16 bits the rounding of each store was
    // the texture: a still pool's smooth slope changes by less than one
    // 16-bit step across a texel, so each store snapped runs of texels to the
    // same value, and three hundred stores later the slope was a stair of
    // flat blocks about a solver cell across, which the plate drew as a grid
    // of squares and toothed rims (finedye's still rise 0.236 and still
    // texture 0.025 at 16 bits, 0.000 and 0.004 at 32). The means and the
    // detail are made fresh from the fields every step and stay 16-bit.
    this.f0 = [tex(d, 'fine dye 0a', w.texX, w.texY, 'rgba32float'), tex(d, 'fine dye 0b', w.texX, w.texY, 'rgba32float')];
    this.f1 = [tex(d, 'fine dye 1a', w.texX, w.texY, 'rgba32float'), tex(d, 'fine dye 1b', w.texX, w.texY, 'rgba32float')];
    const lx = Math.ceil(w.texX / WINDOW_MIN_CELL), ly = Math.ceil(w.texY / WINDOW_MIN_CELL);
    this.l0 = tex(d, 'fine dye means 0', lx, ly);
    this.l1 = tex(d, 'fine dye means 1', lx, ly);
    this.detailTex = tex(d, 'fine dye detail', w.texX, w.texY);
    this.read = 0;
    return true;
  }

  private release(): void {
    for (const t of [...(this.f0 ?? []), ...(this.f1 ?? []), this.l0, this.l1, this.detailTex]) t?.destroy();
    this.f0 = this.f1 = null;
    this.l0 = this.l1 = this.detailTex = null;
  }

  /**
   * One step, after the solver's dye has been carried by it: `dye` is the
   * grid's dye now and `vel` the velocity it rode, `disp` the uv a unit of
   * that velocity moved it, `dt` the step's seconds.
   */
  step(enc: GPUCommandEncoder, dye: GPUTexture, vel: GPUTexture, grid: number, stepDisp: number, stepDt: number): void {
    const w = this.want;
    if (this.disposed || !w || !(this.amount > 0.001)) { this.held = null; this.sumDisp = this.sumDt = 0; return; }
    // Gathered to about one step a frame (FINE_TICK); a window that is new or
    // moved to a new size steps at once, so it never shows a stale texture.
    this.sumDisp += stepDisp;
    this.sumDt += Math.max(0, stepDt);
    const sized = this.detailTex && this.detailTex.width === w.texX && this.detailTex.height === w.texY;
    if (this.held && sized && this.sumDt < FINE_TICK) return;
    const disp = this.sumDisp, dt = this.sumDt;
    this.sumDisp = this.sumDt = 0;
    const advect = this.pipelines.computePipeline('fine advect', FINE_ADVECT_WGSL);
    const reduce = this.pipelines.computePipeline('fine reduce', FINE_REDUCE_WGSL);
    const detail = this.pipelines.computePipeline('fine detail', FINE_DETAIL_WGSL);
    if (!advect || !reduce || !detail) { this.held = null; return; }
    // Fresh when there was no window, or its textures were made again: both
    // fields are born from the grid now, half a life apart in age.
    const fresh = this.ensure(w) || !this.held;
    let re0 = fresh, re1 = fresh;
    if (fresh) { this.a0 = 0; this.a1 = FINE_LIFE / 2; } else {
      const step = Math.max(0, dt);
      this.a0 += step; this.a1 += step;
      if (this.a0 >= FINE_LIFE) { this.a0 %= FINE_LIFE; re0 = true; }
      if (this.a1 >= FINE_LIFE) { this.a1 %= FINE_LIFE; re1 = true; }
    }
    // A triangle on age: 0 at birth and at death, 1 halfway, and the two
    // fields' weights sum to one at every moment.
    const tri = (a: number) => 1 - Math.abs(2 * a / FINE_LIFE - 1);
    const old = fresh ? w : this.held!;
    const texel = 2 * w.hx / w.texX;
    const block = Math.max(WINDOW_MIN_CELL, Math.round(1 / grid / texel));
    const lx = Math.ceil(w.texX / block), ly = Math.ceil(w.texY / block);
    this.pack
      .set('newWin', w.cx, w.cy, w.hx, w.hy)
      .set('newTurn', w.c, w.s, w.texX, w.texY)
      .set('oldWin', old.cx, old.cy, old.hx, old.hy)
      .set('oldTurn', old.c, old.s, 0, 0)
      .set('grid', grid)
      .set('disp', disp)
      .set('reseed0', re0 ? 1 : 0)
      .set('reseed1', re1 ? 1 : 0)
      .set('block', block)
      .set('lx', lx)
      .set('ly', ly)
      .set('w0', tri(this.a0))
      .set('w1', tri(this.a1));
    this.device.queue.writeBuffer(this.uniform, 0, this.pack.bytes);

    const r = this.read, wr = 1 - r;
    const f0 = this.f0!, f1 = this.f1!;
    const gx = Math.ceil(w.texX / WG), gy = Math.ceil(w.texY / WG);
    const pass = enc.beginComputePass({ label: 'fine dye' });
    pass.setPipeline(advect);
    pass.setBindGroup(0, groupOf(this.device, advect, [this.uniform, f0[r], f1[r], dye, vel, f0[wr], f1[wr]]));
    pass.dispatchWorkgroups(gx, gy);
    pass.setPipeline(reduce);
    pass.setBindGroup(0, groupOf(this.device, reduce, [this.uniform, f0[wr], f1[wr], this.l0!, this.l1!, dye]));
    pass.dispatchWorkgroups(Math.ceil(lx / WG), Math.ceil(ly / WG));
    pass.setPipeline(detail);
    pass.setBindGroup(0, groupOf(this.device, detail, [this.uniform, f0[wr], f1[wr], this.l0!, this.l1!, dye, this.detailTex!]));
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
    this.read = wr;
    this.held = w;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.held = null;
    this.release();
    this.uniform.destroy();
  }
}
