/**
 * The cover glass on its liquid (PLAN 38r-5): the solver's layer that lays the
 * gap's shape.
 *
 * Moved here from the squeeze stage of `step` in gpu/fluid.ts as it was, so
 * the cover's own state can be built beside it without growing that file
 * past its byte ceiling (CLAUDE.md "Size"; fluid.ts sat 21 bytes under it).
 */

import { PingPong, bindGroup } from '../kit';
import { kernel } from '../wgsl/fluid';
import { FluidReads } from './reads';
import type { GpuStepParams, SolverSnapshot } from '../solverTypes';
import type { FieldSnapshot } from './snapshot';
import { THIN_GAP_THICKNESS, thinGapViscosity, CARRY_COURANT, PLATE_METRES, REST_GAP, GAP_METRES, LIQUID_DENSITY, WET_SUBSTEPS, WET_PAIRS, R32, VEL } from './constants';
import { DISH_METRES, DISH_REST_GAP, DISH_GAP_FIELD_METRES, OPEN_RIM } from '../../lib/turntable';
import { CONTACT_ANGLE, COVER_AREA, COVER_FULL_ML, COVER_GLASS_G, carrierTension, coverNew, coverAdd, coverStep, type CoverState } from '../../lib/cover';

export class FluidCover extends FluidReads {
  /** The liquid's ledger under the glass (lib/cover.ts); null until the first step, and again after a clear. */
  protected cover: CoverState | null = null;
  /** The Liquid dial as last read, so a turn of it is liquid added or taken off. */
  private coverMl = COVER_FULL_ML;
  /** Poured since the last step, m³ (pour). */
  private coverPoured = 0;
  private coverLaid = DISH_REST_GAP;

  /**
   * The cover's gap over the 2 mm the solver's constants were worked out at,
   * squared: what a Darcy speed in the gap (the colour's fall down a tipped
   * plate, ROCK_FALL; the oil's rise, OIL_LIFT; the oil's tension pull,
   * OIL_TENSION_GAP) is multiplied by on a live cover, since each is
   * Δρ g h²/12μ or σ-driven flow with the same h² mobility. 1 at the default.
   */
  protected get coverH2(): number {
    const r = this.coverGap / DISH_REST_GAP;
    return r * r;
  }

  /**
   * The glass on its liquid, one step (lib/cover.ts coverStep): the dial's
   * turn and the step's pours into the ledger, then the glass settles or
   * lifts. Before writeSim, so the step's kernels read this step's cover.
   */
  protected coverAdvance(p: GpuStepParams): void {
    const ml = Number.isFinite(p.liquidMl) ? p.liquidMl! : COVER_FULL_ML;
    if (!this.cover) {
      this.cover = coverNew(ml);
      this.coverPoured = 0;
    } else if (ml !== this.coverMl) coverAdd(this.cover, (ml - this.coverMl) * 1e-6);
    this.coverMl = ml;
    if (this.coverPoured > 0) coverAdd(this.cover, this.coverPoured);
    this.coverPoured = 0;
    const wetBefore = this.cover.wet;
    const hBefore = this.cover.h;
    const plateBefore = this.cover.plate;
    const h = coverStep(this.cover, Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60)), {
      nu: thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS),
      grams: Number.isFinite(p.coverGrams) ? p.coverGrams! : COVER_GLASS_G,
      hand: p.coverHand ?? 0,
    });
    this.coverGap = h / DISH_GAP_FIELD_METRES;
    this.rimIsAir = this.cover.wet < COVER_AREA * (1 - 1e-7);
    const dvCover = (h - hBefore) * COVER_AREA;
    const dvBead = Math.max(0, this.cover.plate - plateBefore);
    this.rimBeadShare = this.rimIsAir && dvCover > 1e-12 ? Math.min(1, dvBead / dvCover) : 0;
    if (this.rimIsAir) {
      if (!this.wetStarted) this.wetInitRadius = OPEN_RIM * Math.sqrt(Math.min(1, Math.max(0, wetBefore / COVER_AREA)));
      this.wetDirty = true;
    }
    this.wetSeed = Math.floor(Number.isFinite(p.airSeed) ? Math.abs(p.airSeed as number) : 1) % 16777216;
  }

  /** The cover's gap, metres, and in gap units. */
  get coverMetres(): number {
    return this.coverGap * DISH_GAP_FIELD_METRES;
  }
  get coverUnits(): number {
    return this.coverGap;
  }

  /**
   * A pour's volume goes into the ledger as well as into the thin solve: the
   * take of a column over a dome of πr²/2 at the live gap (lib/liquidProps.ts
   * pourShare, the other way round). The glass rises by it next step, and the
   * solve's source and the glass's rise cancel at the rim: a pour under a
   * glass the edge still holds spills nothing.
   */
  pour(x: number, y: number, radius: number, take: number, sp: Parameters<FluidReads['pour']>[4], volume = true): void {
    super.pour(x, y, radius, take, sp, volume);
    if (volume && radius > 0 && take > 0 && this.hsPour) {
      const r = radius * DISH_METRES;
      this.coverPoured += take * (Math.PI * r * r) / 2 * this.coverMetres;
    }
  }

  /** A cleared plate is a fresh one: the dial's liquid, the glass where it rests on it. */
  clear(): void {
    super.clear();
    this.cover = null;
  }

  /** Copy every live GPU field and cover state for plate-level Undo (PLAN 49a). */
  takeSnapshot(): SolverSnapshot | null {
    return this.captureFieldSnapshot({
      cover: this.cover ? { ...this.cover } : null,
      coverMl: this.coverMl,
      coverPoured: this.coverPoured,
      coverLaid: this.coverLaid,
    });
  }

  /** Restore fields and cover state captured by `takeSnapshot`. */
  restoreSnapshot(snap: SolverSnapshot): boolean {
    const s = this.applyFieldSnapshot(snap as FieldSnapshot);
    if (!s) return false;
    this.cover = s.cover ? { ...s.cover } : null;
    this.coverMl = s.coverMl;
    this.coverPoured = s.coverPoured;
    this.coverLaid = s.coverLaid;
    return true;
  }

  /** The gap's shape: laid on a new plate, shifted on a new curve (the squeeze stage's first job). */
  protected gapShape(pass: GPUComputePassEncoder, p: GpuStepParams): void {
    /*
      A new plate shape is a new pair of glasses, not a press.

      The gap springs toward its rest dome at `gapSpring`, which is tuned
      for a press lifting — about a second — and measures as a time constant
      near half a minute on a slow plate. That is right for a press and
      wrong for the dome itself: turning Plate Shape up is swapping the
      glasses, and the answer should be the shape they are, not a shape they
      reach ninety seconds later. Measured before this: eight seconds after
      setting the curve to 1, the gap had moved a sixth of the way.

      So the gap is *shifted* by the change, in `gapReshape`, which leaves a
      press's own dent in place and does not touch the rate. Re-laying it
      outright was the first version and it is a trap: the plate shape is a
      per-plate patch target, so a sound or camera mapping can drive it every
      frame, and a reset would wipe a live press sixty times a second.
    */
    if (this.lastCurve === null) {
      /*
        A plate that has just appeared is laid at the shape it is meant to
        have, absolutely.

        This branch is not a formality. The ladder builds a new solver a few
        seconds into a show, and the clear that comes with it lays the gap
        flat — so a plate whose shape was already set came back flat and
        then crept toward its dome at the spring's rate. Measured: the dome
        held for six seconds, snapped to 0.03 everywhere, and started over.
        Adopting the current shape without laying it is what caused that.
      */
      for (const t of [this.squeeze.a, this.squeeze.b]) {
        this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
      }
      this.lastCurve = p.plateCurve;
      this.hsPrimed = false;
      this.phaseGapPrimed = false;
    } else if (this.lastCurve !== p.plateCurve || this.coverGap !== this.coverLaid) {
      this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
        this.arg('gap reshape', [this.lastCurve, p.plateCurve, this.coverLaid, this.coverGap]));
      this.squeeze.swap();
      /*
        New glasses, not a press: a thin gap takes the new shape as it is. A
        cover moving on its liquid is the other case. It is a squeeze, so the
        solve is left primed and hsDivergence turns the shift, through its
        gap from before, into flow: liquid drawn in at the rim under a rising
        glass that nothing poured, pushed out over it under a settling one.
      */
      if (this.lastCurve !== p.plateCurve) {
        this.hsPrimed = false;
        this.phaseGapPrimed = false;
      }
      this.lastCurve = p.plateCurve;
    }
    this.coverLaid = this.coverGap;
  }

  /** Read the wet fraction (1 liquid, 0 air) on the N×N grid row by row from y = 0 (PLAN 38r-16). */
  async readWet(): Promise<Float32Array> {
    const n = this.N;
    if (!this.wet || !this.wetStarted) {
      const out = new Float32Array(n * n);
      const rLim = this.cover ? OPEN_RIM * Math.sqrt(Math.min(1, Math.max(0, this.cover.wet / COVER_AREA))) : OPEN_RIM;
      for (let y = 0; y < n; y++) {
        const dy = (y + 0.5) / n - 0.5;
        for (let x = 0; x < n; x++) {
          const dx = (x + 0.5) / n - 0.5;
          out[y * n + x] = dx * dx + dy * dy < rLim * rLim ? 1 : 0;
        }
      }
      return out;
    }
    const row = Math.ceil((n * 4) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read wet', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read wet' });
    enc.copyTextureToBuffer({ texture: this.wet.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n);
    const stride = row / 4;
    for (let y = 0; y < n; y++) out.set(all.subarray(y * stride, y * stride + n), y * n);
    buf.unmap();
    buf.destroy();
    return out;
  }

  private ensureWet(): void {
    if (this.wet) return;
    this.wet = new PingPong(this.device, this.disposer, [this.N, this.N], R32, 'wet');
    this.wetSoft = this.disposer.track(this.device.createTexture({
      label: 'wet soft', size: [this.N, this.N], format: R32,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    }));
    const buf = (label: string, size: number, usage = GPUBufferUsage.STORAGE) =>
      this.disposer.track(this.device.createBuffer({ label, size, usage }));
    this.wetGapSeen = buf('wet gap seen', Math.max(16, this.N * this.N * 4));
    this.wetJump = buf('wet jump', Math.max(16, this.N * this.N * 4));
    this.wetMost = buf('wet courant', 16);
    this.wetInd = buf('wet pairs', 12 * WET_PAIRS, GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT);
    this.wetSub = buf('wet substeps', 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  }

  /** Initialise the wet field and smooth it before thinProject runs. */
  protected wetPrepareStep(pass: GPUComputePassEncoder): void {
    if (!this.wetDirty) return;
    this.ensureThinGap();
    this.ensureWet();
    if (!this.wetStarted) {
      const initArgs = this.arg('wet init', [this.wetInitRadius, 0, 0, 0]);
      for (const t of [this.wet!.a, this.wet!.b]) this.run(pass, 'wetInit', t, [], initArgs);
      this.hsRun(pass, 'wetGapInit', `wetGapInit:${this.squeeze.read.label}`, this.arg('wet gap init', [this.hsPrimed ? 0 : 1, 0, 0, 0]),
        [this.squeeze.read, this.hsGap!, this.wetGapSeen!]);
      this.wetStarted = true;
    }
    this.run(pass, 'wetSmooth', this.wetSoft!, [this.wet!.read], this.arg('wet smooth', [this.rimIsAir ? 1 : 0, 0, 0, 0]));
  }

  /** Mark air cells in hsMob and write capillary curvature + rim roughness jumps into wetJump. */
  protected override wetPrepPass(pass: GPUComputePassEncoder, p: GpuStepParams, disp: number): void {
    if (!this.wetDirty || !this.wet || !this.wetSoft || !this.wetJump) return;
    const nu = thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS);
    const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
    const sigma = carrierTension(nu);
    const cosTheta = Math.cos(CONTACT_ANGLE);
    const paToSol = seconds * seconds / (LIQUID_DENSITY * Math.max(disp, 1e-9) * PLATE_METRES * PLATE_METRES);
    const hM = Math.max(this.coverMetres, 0.004 * GAP_METRES);
    const roughPa = (2 * sigma * cosTheta) / hM;
    this.hsRun(pass, 'wetPrep', `wetPrep:${this.wet.read.label}:${this.wetSoft.label}:${this.squeeze.read.label}:${this.vel.read.label}:${this.vel.write.label}`,
      this.arg('wet prep', [sigma, cosTheta, paToSol, this.rimIsAir ? 1 : 0, this.wetSeed, roughPa, 0, 0]),
      [this.wet.read, this.wetSoft, this.squeeze.read, this.vel.read, this.vel.write, this.hsMob!, this.wetJump]);
    this.vel.swap();
  }

  /** Advance the air edge with Courant substepping (< 1 cell/substep), relax overshoots, and sharpen isotropically. */
  protected stepWet(pass: GPUComputePassEncoder, disp: number): void {
    if (!this.wetDirty || !this.wet || !this.wetGapSeen) return;
    const wJump = this.wetJumpBuf();
    const rimAir = this.rimIsAir ? 1 : 0;
    this.hsRun(pass, 'wetCourant', `wetCourant:${this.velForced.label}:${this.squeeze.read.label}:${wJump.label}`,
      this.arg('wet courant', [0, 0, 0, 0, 0, disp, 1, REST_GAP]),
      [this.velForced, this.hsP!, this.wetMost!, this.squeeze.read, this.hsMob!, wJump]);
    this.hsRun(pass, 'wetPlan', 'wetPlan',
      this.arg('wet plan', [CARRY_COURANT, WET_SUBSTEPS, Math.ceil(this.N / 8), WET_PAIRS, this.rimBeadShare > 0 ? 15 : 1]),
      [this.wetMost!, this.wetInd!, this.wetSub!], 1);
    const pipe = this.pipelines.computePipeline('wetAdvect:r32float', kernel('wetAdvect', R32));
    if (pipe) {
      const advGroup = (a: GPUBuffer, src: GPUTexture, dst: GPUTexture) => {
        let at = this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupRoot, 'wet'), pipe), a), src), dst), this.squeeze.read);
        at = this.groupAt(this.groupAt(at, this.velForced), wJump);
        let g = at.group;
        if (!g) {
          g = bindGroup(this.device, pipe, [this.sim, a, src, this.velForced, dst, this.hsP!, this.squeeze.read, this.wetGapSeen!, this.hsMob!, wJump, this.wetSub!]);
          at.group = g;
        }
        return g;
      };
      this.wetParity ^= 1;
      for (let k = 0; k < WET_PAIRS; k++) {
        const ax0 = (k + this.wetParity) & 1;
        for (let half = 0; half < 2; half++) {
          const axis = ax0 ^ half;
          const tA = half === 0 ? 0 : 0.5;
          const tB = half === 0 ? 0.5 : 1.0;
          const a = this.arg(`wet advect @${2 * k + half}`, [k, disp, REST_GAP, rimAir, this.rimBeadShare, axis, tA, tB]);
          pass.setPipeline(pipe);
          pass.setBindGroup(0, advGroup(a, this.wet.read, this.wet.write));
          pass.dispatchWorkgroupsIndirect(this.wetInd!, 12 * k);
          this.wet.swap();
        }
      }
    }
    this.hsRun(pass, 'wetGapSeen', `wetGapSeen:${this.squeeze.read.label}`, this.arg('wet gap seen', [0, 0, 0, 0]),
      [this.squeeze.read, this.wetGapSeen]);
    const none = this.arg('none', [0, 0, 0, 0]);
    for (let k = 0; k < 6; k++) {
      this.run(pass, 'wetRelax', this.wet.write, [this.wet.read, this.squeeze.read], none);
      this.wet.swap();
    }
    const sh = this.arg('wet sharpen', [0.68, 0, 0, 0]);
    for (let k = 0; k < 1; k++) {
      this.run(pass, 'wetSharpen', this.wet.write, [this.wet.read, this.squeeze.read], sh);
      this.wet.swap();
    }
  }

  /** Shed any residual dye left in dry air-edge cells into neighbouring liquid cells. */
  protected shedWetDye(pass: GPUComputePassEncoder): void {
    if (!this.wetDirty || !this.wet) return;
    this.run(pass, 'wetShedDye', this.dye.write, [this.dye.read, this.wet.read], this.arg('none', [0, 0, 0, 0]));
    this.dye.swap();
  }

  /** Write the air edge (1 − w inside the rim) into the composited air field for the plate to draw. */
  protected finishWet(pass: GPUComputePassEncoder, thin: boolean): void {
    if (!thin || !this.wetDirty || !this.wet) {
      this.airOutLive = false;
      return;
    }
    if (!this.airOutTex) {
      this.airOutTex = this.disposer.track(this.device.createTexture({
        label: 'air with edge', size: [this.N, this.N], format: VEL,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      }));
    }
    const existing = this.air?.any ? this.air.field : this.blank('rgba');
    this.run(pass, 'wetToAir', this.airOutTex, [this.wet.read, existing], this.arg('wet to air', [this.air?.any ? 1 : 0, 0, 0, 0]));
    this.airOutLive = true;
  }
}
