/**
 * The passes a step runs, below `step` itself: the projection (Jacobi sweeps and the
 * multigrid V-cycle), the thin gap's projection and its substepped carries, the current and
 * the spun dish's swirl, the ferrofluid's phase passes, the species and the particles. Part of
 * the solver's class chain; the map is at the top of `gpu/fluid.ts`.
 */

import { PingPong, bindGroup } from '../kit';
import { kernel } from '../wgsl/fluid';
import type { GpuStepParams } from '../solverTypes';
import { stepDisplacement } from '../../lib/detailFlow';
import { WebGPUSlosh } from '../slosh';
import { OIL_NU, OPEN_RIM, dyeDensityContrast } from '../../lib/turntable';
import { WebGPUParticles } from '../particles';
import { PRESSURE_SWEEPS, MG_CYCLES, MG_SWEEPS, MG_COARSE_SWEEPS, DIV_GROUPS, THIN_GAP_THICKNESS, FERRO_NU, CARRY_COURANT, CARRY_SUBSTEPS, CARRY_PAIRS, DRIFT_MOST, DRIFT_LEAST, BZ_GRID, LIES_GRID, CURRENT_ITERS, SPIN_OIL_LIGHT, PLATE_METRES, REST_GAP, REST_GAP_METRES, GAP_METRES, NU_REF, DYE_LAYER, SLUMP_FACE, SLUMP_SUBSTEPS, FROUDE_FRONT, DYE_CAP, thinGapViscosity, R32 } from './constants';
import { FluidFields } from './fields';

export class FluidPasses extends FluidFields {
  /** What each cell with air in it divides its amounts among this substep (airGive), made by the first carry that sees the air. */
  private airGiveTex: GPUTexture | null = null;
  /** And the share of a cell each of its faces brings in this substep (airGive's second output). */
  private airInTex: GPUTexture | null = null;
  /** Whether the amounts' carries take the air's room this step (set in `step`, PLAN 15g-8b). */
  protected airCarry = false;
  /** airPair's answers, kept so a step allocates nothing for them: the air's four, or four blanks. */
  private readonly airTex: GPUTexture[] = [];
  private readonly noAirTex: GPUTexture[] = [];
  /** The planned substeps' arguments with the air (airArgs), and their buffers' names, made once. */
  private readonly airArgBufs: GPUBuffer[] = [];
  private readonly airArgNames = Array.from({ length: 1 + 2 * CARRY_PAIRS }, (_, i) => `body advect thin @${i}`);

  /**
   * A carry on a thin gap through the solve's own faces (THIN_FACE in
   * wgsl/fluid.ts), in one pass: runPressed's bindings with the solve's P in
   * place of the pressure, then the gap and the mobility.
   */
  protected runThinFaced(pass: GPUComputePassEncoder, name: string, dst: GPUTexture, src: GPUTexture, args: GPUBuffer): void {
    const pipe = this.pipeline(name, dst.format);
    if (!pipe) return;
    const ride = this.ride();
    // bodyAdvectThin carries amounts, so it sees the air (airLiquid in wgsl/fluid.ts, PLAN 15g-8b).
    const air = name === 'bodyAdvectThin' ? this.airPair() : null;
    if (air) this.airGive(pass, false, args);
    let at = this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupRoot, 'thin faced'), pipe), dst), src), args), this.squeeze.read);
    if (air) at = this.groupAt(at, air[0]);
    const last = this.groupAt(at, ride);
    let group = last.group;
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, src, ride, dst, this.hsP!, this.squeeze.read, this.hsMob!, ...(air ?? [])]);
      last.group = group;
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * The step's air before and after it and what each cell with air in it
   * divides its amounts among this substep (airGive), for the carries of
   * amounts (airLiquid in wgsl/fluid.ts); blanks, so no air, on a plate that
   * has never had a bubble. The same array each call, its first the step's
   * air before it, which names the pair (the other is its twin).
   */
  protected airPair(): GPUTexture[] {
    if (!this.air) {
      if (!this.noAirTex.length) this.noAirTex.push(this.blank('rgba'), this.blank('rgba'), this.blank('r'), this.blank('rgba'));
      return this.noAirTex;
    }
    if (!this.airGiveTex || !this.airInTex) {
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
      this.airGiveTex = this.disposer.track(this.device.createTexture({ label: 'air give', size: [this.N, this.N], format: R32, usage }));
      this.airInTex = this.disposer.track(this.device.createTexture({ label: 'air in', size: [this.N, this.N], format: 'rgba32float', usage }));
    }
    const t = this.airTex;
    t[0] = this.air.prev; t[1] = this.air.field; t[2] = this.airGiveTex; t[3] = this.airInTex;
    return t;
  }

  /** Whether both airGive kernels are built (asking builds them): a carry takes the air only then. */
  protected airGiveReady(): boolean {
    return !!this.airGivePipe(true) && !!this.airGivePipe(false);
  }

  private airGivePipe(planned: boolean): GPUComputePipeline | null {
    const name = planned ? 'airGiveSub' : 'airGiveThin';
    // Prebuilt with the thin gap's kernels (THIN_GAP_KERNELS), under the same key.
    return this.pipelines.computePipeline(this.pipelineKey(name, 'thin'), kernel(name, 'rgba16float'));
  }

  /**
   * Each planned substep's arguments for a carry taking the air: its index
   * (A.a.x, the share of the step done before it is the plan's share times
   * it, decided on the GPU), how much of a cell the air takes, the step's
   * displacement. The first is 0, then each pair's two are 1 + 2k and 2 + 2k.
   */
  protected airArgs(room: number, disp: number): GPUBuffer[] {
    const v = this.argScratch;
    for (let i = 0; i < this.airArgNames.length; i++) {
      v[0] = i; v[1] = room; v[2] = 0; v[3] = 0; v[4] = 0; v[5] = disp; v[6] = 1; v[7] = REST_GAP;
      this.airArgBufs[i] = this.argWrite(this.airArgNames[i]);
    }
    return this.airArgBufs;
  }

  /**
   * airGive for the carry about to run with `args`, while there is air to
   * carry round (airCarry): the planned substeps' through the same indirect
   * dispatch as the carry (`indirect` its offset), the hand's sixths whole.
   * With no air the carries read a liquid of 1 and never look at it.
   */
  private airGive(pass: GPUComputePassEncoder, planned: boolean, args: GPUBuffer, indirect?: number): void {
    if (!this.airCarry || !this.air) return;
    const pipe = this.airGivePipe(planned);
    if (!pipe) return;
    const air = this.airPair();
    const ride = this.ride();
    const at = this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupRoot, 'air give'), pipe), args), ride), this.squeeze.read);
    const last = this.groupAt(at, air[0]);
    let group = last.group;
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ride, air[2], this.hsP!, ...(planned ? [this.carrySub!] : []), this.squeeze.read, this.hsMob!, air[0], air[1], air[3]]);
      last.group = group;
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    if (indirect === undefined) {
      const w = Math.ceil(this.N / 8);
      pass.dispatchWorkgroups(w, w);
    } else {
      pass.dispatchWorkgroupsIndirect(this.carryInd!, indirect);
    }
  }

  /** The ferrofluid's carry velocity on a thin gap (phaseVelocity), or the mixture's off it. */
  private phaseVel(thin = true): GPUTexture { return thin && this.phaseVelT ? this.phaseVelT : this.ride(); }

  /**
   * phaseAdvect: runPressed's bindings, then the gap, the gap the phase last
   * saw, and the thin solve's pressure and mobility (a stand-in for each until
   * Thin Gap has run: the kernel reads them only under it).
   */
  protected runPhaseAdvect(pass: GPUComputePassEncoder, args: GPUBuffer): void {
    const pipe = this.pipeline('phaseAdvect', this.phase.write.format);
    if (!pipe) return;
    const thin = !!this.hsP && !!this.hsMob;
    /*
      The ferrofluid's own velocity only on a step that wrote it: hsP and
      hsMob outlive Thin Gap, so keyed off them alone, a plate whose Thin Gap
      was switched off kept carrying the ferrofluid on the last thin step's
      phaseVelT, frozen (a dragged drop, magnet off, slid on 0.0425 of the
      plate in 120 steps and smeared to no half-full cell; PLAN 29c-8).
    */
    const ride = this.phaseVel(thin && this.thinLive);
    const key = `phaseAdvect:${this.phase.read.label}:${this.squeeze.read.label}:${args.label}:${thin}:${ride.label}`;
    let group = this.groups.get(key);
    if (!group) {
      const gap = this.ensurePhaseGap();
      group = bindGroup(this.device, pipe, [this.sim, args, this.phase.read, ride, this.phase.write, this.press, this.squeeze.read, gap,
        thin ? this.hsP! : gap, thin ? this.hsMob! : gap, this.ensureStand()]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * phaseCompress: run's bindings, then the phase's substep plan (phasePlan's
   * psub: 1/m and m), for the substeps the step's carry ran, which the
   * step's deficit at each face is summed over.
   */
  protected runPhaseCompress(pass: GPUComputePassEncoder, stand: GPUTexture, args: GPUBuffer): void {
    const pipe = this.pipeline('phaseCompress', this.phase.write.format);
    if (!pipe) return;
    const reads = [this.phase.read, this.phaseBlurT!, this.phaseVel(), this.squeeze.read, stand];
    const key = `phaseCompress:${this.phase.write.label}:${reads.map((r) => r.label).join(',')}:${args.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...reads, this.phase.write, this.phaseSub!]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * The ferrofluid carried as a volume on a thin gap: phasePlan picks the
   * substeps from the colour's plan this step (planCarry, run in the advect
   * dye stage before this), at least `least`, and each is phaseAdvectPlan from
   * the read field to the write and phaseGridPlan back, dispatched
   * indirectly, so one not needed runs no workgroups and the phase ends in
   * the read field whatever the count.
   */
  protected runPhasePlanned(pass: GPUComputePassEncoder, least: number, disp: number, stand: GPUTexture): void {
    const plan = this.pipeline('phasePlan', R32);
    const adv = this.pipeline('phaseAdvectPlan', this.phase.write.format);
    const grid = this.pipeline('phaseGridPlan', this.phase.write.format);
    if (!plan || !adv || !grid) return;
    const w = Math.ceil(this.N / 8);
    const planArgs = this.arg('phase plan', [least, CARRY_SUBSTEPS, w, 0]);
    let group = this.groups.get(`phasePlan:${planArgs.label}`);
    if (!group) {
      group = bindGroup(this.device, plan, [this.sim, planArgs, this.carrySub!, this.phaseInd!, this.phaseSub!]);
      this.groups.set(`phasePlan:${planArgs.label}`, group);
    }
    pass.setPipeline(plan);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(1);
    const gap = this.ensurePhaseGap();
    const there = this.phase.read, back = this.phase.write, ride = this.phaseVel();
    for (let j = 0; j < CARRY_SUBSTEPS; j++) {
      const a = this.arg(this.nameOf('phase advect plan ', j), [1, j, 0, REST_GAP, 0, disp, 1, 0]);
      const ka = `phaseAdvectPlan:${there.label}:${this.squeeze.read.label}:${a.label}:${stand.label}:${ride.label}`;
      let ga = this.groups.get(ka);
      if (!ga) {
        ga = bindGroup(this.device, adv, [this.sim, a, there, ride, back, this.press, this.squeeze.read, gap, this.hsP!, this.hsMob!, stand, this.phaseSub!]);
        this.groups.set(ka, ga);
      }
      pass.setPipeline(adv);
      pass.setBindGroup(0, ga);
      pass.dispatchWorkgroupsIndirect(this.phaseInd!, 12 * j);
      const g = this.arg4(this.nameOf('phase grid plan ', j), j);
      const kg = `phaseGridPlan:${back.label}:${this.squeeze.read.label}:${g.label}:${stand.label}`;
      let gg = this.groups.get(kg);
      if (!gg) {
        gg = bindGroup(this.device, grid, [this.sim, g, back, there, this.squeeze.read, gap, stand, this.phaseSub!]);
        this.groups.set(kg, gg);
      }
      pass.setPipeline(grid);
      pass.setBindGroup(0, gg);
      pass.dispatchWorkgroupsIndirect(this.phaseInd!, 12 * j);
    }
  }

  /** The gap as the phase has now seen it (phaseGapSeen), every step the phase moves, whichever solver. */
  protected runPhaseGapSeen(pass: GPUComputePassEncoder): void {
    const pipe = this.pipeline('phaseGapSeen', R32);
    if (!pipe) return;
    const key = `phaseGapSeen:${this.squeeze.read.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, this.arg('none', [0, 0, 0, 0]), this.squeeze.read, this.ensurePhaseGap()]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
    this.phaseGapPrimed = true;
  }

  /** Step the dish on `enc` if it is driven and built, and say which flow `addSlosh` lays over the gap's. */
  protected stepSloshDish(enc: GPUCommandEncoder, p: GpuStepParams): void {
    const drive = this.sloshDrive;
    if (!drive) { this.sloshTex = null; return; }
    if (!this.slosh) this.slosh = new WebGPUSlosh(this.device);
    // Built behind the show unless the look tips its dish (Opening.slosh); until built, it waits.
    if (!this.slosh.ready()) { this.sloshTex = null; return; }
    // The oil is the mix's, while the look has Oil Tension and the mix is made (lib/slosh.ts: the lens floats at its capillary thickness).
    const oil = this.mix && (p.oilTension ?? 0) > 0 ? { tex: this.mix.read, n: this.N } : null;
    this.slosh.step(enc, p.magnetSeconds ?? 1 / 60, drive.ax, drive.ay, drive.nu, drive.presses, oil, this.sloshLevel, this.profiler.pass('slosh'));
    this.sloshLevel = false;
    this.sloshTex = this.slosh.flow;
  }

  /**
   * The species' stage (PLAN 18d): its carry in the colour's substeps, unless
   * the colour's carry has taken it along already (`carry` false, PLAN 18d-11a:
   * bodyAdvectPairSub), then the rim. What the flow has carried past the rim has left the dish over
   * it (the open rim, OPEN_RIM, where the thin solve holds the pressure at
   * the air's), so it is taken off the plate there; nothing else takes any
   * away (18d-2: a liquid leaves by being flushed, it does not fade).
   */
  protected stepSpecies(pass: GPUComputePassEncoder, carry = true): void {
    const sp = this.species!;
    if (carry) this.carrySubsteps(pass, 'bodyAdvect', sp, this.arg('species advect thin', [0, 0, 0, 0, 0, this.speciesDisp, 1, REST_GAP]));
    this.run(pass, 'speciesSplat', sp.write, [sp.read], this.arg('species rim', [0, 0, 0, 0, 0, 0, 0, OPEN_RIM]));
    sp.swap();
  }

  protected packView(pass: GPUComputePassEncoder): void {
    if (!this.viewTex) {
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
      this.viewTex = this.disposer.track(this.device.createTexture({ label: 'view', size: [this.N, this.N], format: 'rgba32uint', usage }));
    }
    this.blank('r');
    const has = [this.phaseLive, this.mixLive && !!this.mix, this.rxnLive && !!this.rxn, this.liesLive && !!this.lies];
    const film = this.filmLaid > 0 && !!this.film;
    this.run(pass, 'packView', this.viewTex, [
      has[0] ? this.phase.read : this.blankR!,
      has[1] ? this.mix!.read : this.blankRGBA!,
      has[2] ? this.rxn!.read : this.blankRGBA!,
      has[3] ? this.lies!.read : this.blankRGBA!,
      this.squeeze.read,
      film ? this.film!.read : this.blankRGBA!,
    ], this.arg('view', [...has.map((h) => (h ? 1 : 0)), BZ_GRID, LIES_GRID, film ? this.film!.size[0] : 1, film ? 1 : 0]));
  }

  /**
   * How the dye's slump runs this step (PLAN 18m, wgsl/slump.ts), or null when
   * it would move nothing a person could see.
   *
   * `rate` is g′Δt/(3νΔx²) for one substep, in 1/m³: K Δt/Δx² is it times
   * η³(1 − η/b)³ and the dye's strength, cell by cell, on the GPU. The
   * substeps are as many as the deepest layer the plate can hold asks for
   * (the dye's cap), up to SLUMP_SUBSTEPS. Not the plate's own thickest cell
   * from the measure: that lands a frame or two late, whenever its readback
   * does, so the substeps (and the plate) would differ between two renders of
   * the same seed (`node scripts/render-app.mjs`: 221 of 240 frames differed
   * from frame 20 when they were planned from it). On a thick liquid nothing moves (the rate goes as 1/ν: in
   * glycerine a pool takes minutes to spread a millimetre), and the pass is
   * skipped.
   */
  protected slumpPlan(p: GpuStepParams): { rate: number; substeps: number; inertRate: number } | null {
    const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
    const nu = thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS);
    // Stood up by θ (Gravity, 0 flat to 1 upright), only cos θ of g is through the glass.
    const upright = Math.max(0, Math.min(1, p.plateUpright ?? 0));
    const gPrime = 9.81 * dyeDensityContrast(p.solutalBuoyancy) * Math.cos(upright * Math.PI / 2);
    const dx = PLATE_METRES / this.N;
    const perStep = gPrime * seconds / (3 * nu * dx * dx);
    if (!(perStep > 0) || !Number.isFinite(perStep)) return null;
    const eta = DYE_CAP * DYE_LAYER;
    const b = REST_GAP_METRES;
    // η³(1 − η/b)³ rises to its peak at half the gap.
    const e = Math.min(eta, b / 2);
    const open = 1 - e / b;
    const mostVisc = perStep * e * e * e * open * open * open;
    // The inertial Froude current's maximum speed √(g′e(1 - e/b)) (Huppert and Simpson 1980).
    const mostInert = FROUDE_FRONT * (seconds / dx) * Math.sqrt(gPrime * e * open);
    const most = Math.min(mostVisc, mostInert);
    if (most < 1e-4) return null;
    const substeps = Math.max(1, Math.min(SLUMP_SUBSTEPS, Math.ceil(most / SLUMP_FACE)));
    const dtSub = seconds / substeps;
    const inertRate = FROUDE_FRONT * (dtSub / dx) * Math.sqrt(gPrime);
    return { rate: perStep / substeps, substeps, inertRate };
  }

  protected stepParticles(enc: GPUCommandEncoder, p: GpuStepParams): void {
    const want = Math.max(0, Math.min(1, p.particles ?? 0));
    if (want <= 0) {
      if (this.particles) { this.particles.dispose(); this.particles = null; }
      return;
    }
    if (!this.particles) this.particles = new WebGPUParticles(this.device, this.N);
    this.particles.step(enc, this.dye.read, this.velForced, {
      amount: want,
      life: p.particleLife,
      // Born only where there is dye worth carrying. Below this a particle
      // would pick up a colour that is mostly the plate's own floor and lay
      // it back down as a haze.
      floor: 0.02,
      disp: stepDisplacement(p.dt, p.advection, this.N),
      dt: p.dt,
      seed: 0x9e3779b9,
    }, this.stageTimings ? (label) => this.profiler.pass(label) : undefined);
  }

  protected jacobi(pass: GPUComputePassEncoder, field: PingPong, a: [number, number, number, number], iters: number, label: string): void {
    if (a.every((v) => v <= 0)) return;
    const scratch = label === 'dye' ? this.scratchA : this.scratchB;
    // x0, the field before the diffusion, kept while the field ping-pongs.
    this.run(pass, 'scaleDye', scratch, [field.read], this.arg('scale one', [1, 0, 0, 0]));
    const rcp = a.map((v) => 1 / (1 + 4 * v));
    const args = this.arg(`jacobi ${label}`, [...a, ...rcp]);
    for (let k = 0; k < iters; k++) {
      this.run(pass, 'jacobi', field.write, [field.read, scratch], args);
      field.swap();
    }
  }

  /** Red-black sweeps on level 0, the packed buffer. */
  private smooth0(pass: GPUComputePassEncoder, sweeps: number): void {
    const pipe = this.pipelines.computePipeline('pressureRedBlack', kernel('pressureRedBlack', 'r32float'));
    if (!pipe) return;
    const half = Math.ceil((this.N * (this.N / 2)) / 64);
    for (let k = 0; k < sweeps; k++) {
      for (let parity = 0; parity < 2; parity++) {
        const args = this.arg4(this.nameOf('pressure ', parity), parity);
        const key = `pressureRedBlack:${parity}`;
        let group = this.groups.get(key);
        if (!group) {
          group = bindGroup(this.device, pipe, [this.sim, args, this.div, this.press]);
          this.groups.set(key, group);
        }
        pass.setPipeline(pipe);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(half);
      }
    }
  }

  /**
   * One multigrid V-cycle from level `l` down (see `mgRestrict0` in
   * `wgsl/fluid.ts` for why). Smooth, hand the residual to the level below,
   * solve there, bring the correction back, smooth again; the coarsest level
   * is small enough for sweeps alone to finish it.
   */
  private vcycle(pass: GPUComputePassEncoder, l: number): void {
    const smooth = (level: number, sweeps: number) => {
      if (level === 0) { this.smooth0(pass, sweeps); return; }
      const lv = this.mg[level - 1];
      for (let k = 0; k < sweeps; k++) {
        for (let parity = 0; parity < 2; parity++) {
          this.dispatchBuf(pass, 'mgSmooth', this.nameOf('mgSmooth:', level, ':', parity), this.arg4(this.nameOf('mg smooth ', level, ' ', parity), lv.n, parity),
            [lv.b, lv.p], lv.n * Math.ceil(lv.n / 2));
        }
      }
    };
    if (l === this.mg.length) { smooth(l, MG_COARSE_SWEEPS); return; }
    smooth(l, MG_SWEEPS);
    const below = this.mg[l];
    if (l === 0) {
      this.dispatchBuf(pass, 'mgRestrict0', 'mgRestrict0', this.arg('none', [0, 0, 0, 0]), [this.div, this.press, below.b], below.n * below.n);
    } else {
      const here = this.mg[l - 1];
      this.dispatchBuf(pass, 'mgRestrict', this.nameOf('mgRestrict:', l), this.arg4(this.nameOf('mg level ', l), here.n), [here.p, here.b, below.b], below.n * below.n);
    }
    this.dispatchBuf(pass, 'mgZero', this.nameOf('mgZero:', l + 1), this.arg4(this.nameOf('mg zero ', l + 1), below.n * below.n), [below.p], below.n * below.n);
    this.vcycle(pass, l + 1);
    if (l === 0) {
      // Into level 0's packed buffer (A.a.y = 1): `mgProlong` in wgsl/fluid.ts.
      this.dispatchBuf(pass, 'mgProlong', 'mgProlong0', this.arg('mg prolong 0', [this.N, 1, 0, 0]), [below.p, this.press], this.N * this.N);
    } else {
      const here = this.mg[l - 1];
      this.dispatchBuf(pass, 'mgProlong', this.nameOf('mgProlong:', l), this.arg4(this.nameOf('mg level ', l), here.n), [below.p, here.p], here.n * here.n);
    }
    smooth(l, MG_SWEEPS);
  }

  /**
   * Make the velocity divergence-free: find the pressure whose gradient
   * cancels the divergence, and subtract it.
   *
   * `PRESSURE_SWEEPS` red-black Gauss-Seidel sweeps where this was
   * `PRESSURE_ITERS` Jacobi passes. Each sweep is two dispatches over half
   * the grid — the same arithmetic as one Jacobi pass — and converges about
   * twice as fast, because the second half of a sweep reads a first half
   * that has already moved. See the kernel in `wgsl/fluid.ts` for why the
   * pressure had to leave its texture to allow it.
   */
  protected project(pass: GPUComputePassEncoder): void {
    const none = this.arg('none', [0, 0, 0, 0]);
    // The fifth number is the mean of the rate term over the plate, which the
    // kernel subtracts so that term averages to zero.
    const invDt = 1 / Math.max(this.lastDt, 1e-4);
    this.run(pass, 'divergence', this.divRaw, [this.vel.read, this.air!.field, this.air!.prev, this.squeeze.read],
      this.arg('air source', [this.airPush, invDt, this.airCover, 0,
        (this.airCover - this.airCoverPrev) * invDt,
        // The press: how much of it reaches the flow. Its mean is no longer
        // guessed here (see divTiles).
        0, this.squeezeGain, 0]));
    /*
      Then the whole right-hand side made to sum to zero, exactly: its plate
      mean found on the GPU and taken off every cell (divTiles in
      wgsl/fluid.ts says why that is the closed plate's physics and not a
      patch). Three small dispatches, against the dozens the solve runs.
    */
    this.dispatchBuf(pass, 'divTiles', 'divTiles', this.arg('none', [0, 0, 0, 0]), [this.divRaw, this.divPartials], DIV_GROUPS * 64);
    this.dispatchBuf(pass, 'divFold', 'divFold', this.arg('div fold', [DIV_GROUPS, 0, 0, 0]), [this.divPartials, this.divMean], 64);
    this.dispatchBuf2(pass, 'divCentre', 'divCentre', [this.divRaw, this.divMean, this.div]);
    this.clearBuffer(pass, this.press, 'clear pressure');

    if (this.pressureSolver === 'multigrid' && this.mg.length > 0) {
      for (let c = 0; c < MG_CYCLES; c++) this.vcycle(pass, 0);
    } else {
      this.smooth0(pass, PRESSURE_SWEEPS);
    }

    const grad = this.pipelines.computePipeline('gradientSubtractBuf', kernel('gradientSubtractBuf', 'rgba16float'));
    if (grad) {
      const gkey = `gradientSubtractBuf:${this.vel.write.label}`;
      let ggroup = this.groups.get(gkey);
      if (!ggroup) {
        ggroup = bindGroup(this.device, grad, [this.sim, none, this.vel.read, this.vel.write, this.press]);
        this.groups.set(gkey, ggroup);
      }
      pass.setPipeline(grad);
      pass.setBindGroup(0, ggroup);
      pass.dispatchWorkgroups(Math.ceil(this.N / 8), Math.ceil(this.N / 8));
      this.vel.swap();
    }
  }

  /** The swirl: the dish's drag and the centrifuge, then the current's projection on its own textures. */
  protected stepSwirl(pass: GPUComputePassEncoder, p: GpuStepParams, thin: boolean): void {
    const spin = p.spinLiquid ?? 0;
    const tau = Math.max(1e-4, p.spinTau ?? 1);
    const mixOn = this.mixLive && !!this.mix;
    this.run(pass, 'spinSwirl', this.swirl.write, [
      this.swirl.read, this.dye.read, this.squeeze.read,
      mixOn ? this.mix!.read : this.blank('rgba'),
      this.phaseLive ? this.phase.read : this.blank('r'),
    ], this.arg('swirl', [p.spinDish ?? 0, 1 / tau, spin * spin, thin ? -1 : Math.max(0, p.magnetSeconds ?? 1 / 60),
      Math.max(1e-7, p.spinNu ?? 1e-6), OIL_NU, Math.max(0, p.spinDyeWeight ?? 0), SPIN_OIL_LIGHT]), this.M);
    this.swirl.swap();
    /*
      A thin gap stops here, at one dispatch where it was thirteen (PLAN 22k).

      There the swirl field is the dish's drive, a speed at the rest gap
      (spinSwirl's thin branch, which keeps no state), and it goes into the
      flow before the thin solve, which makes the whole flow conserve liquid
      with the gap in it: ∇·(h u) = 0, by its own multigrid. Projecting the
      drive first, by ten Jacobi sweeps of ∇·u = 0 on the current's grid, did
      a weaker version of the same job with the wrong operator. Where the gap
      is even the solve takes away exactly what it took away; where a press
      or a dome makes it uneven what it took away is a gradient of u, not of
      hu, and handing the solve the drive as it is lets the right projection
      decide. Since #252 the nine thin music looks run the swirl on most of
      their steps while the band plays; this is the part of it that did
      nothing the solve after it does not do. The old plate has no solve
      after it that sees the swirl (it is laid over the projected flow), so
      it keeps its own projection.
    */
    if (thin) return;
    const m = this.arg('current grid', [0, this.M, 0, 0]);
    this.run(pass, 'curDivergence', this.swirlDiv, [this.swirl.read], m, this.M);
    for (let k = 0; k < CURRENT_ITERS; k++) {
      this.run(pass, 'curPressure', this.swirlP.write, [this.swirlP.read, this.swirlDiv], m, this.M);
      this.swirlP.swap();
    }
    this.run(pass, 'curGradient', this.swirl.write, [this.swirl.read, this.swirlP.read], m, this.M);
    this.swirl.swap();
  }

  /**
   * A carried field moved the rest of the way with the glass's drift, in
   * cells (driftShift), after its carry rode the flow less the drift.
   * Nothing when there is none.
   */
  protected shiftCarried(pass: GPUComputePassEncoder, field: PingPong, what: 'amount' | 'mix' | 'volume' = 'amount'): void {
    if (!this.riding) return;
    const mode = what === 'mix' ? 1 : what === 'volume' ? 2 : 0;
    this.run(pass, 'driftShift', field.write, [field.read, this.squeeze.read], this.arg(`drift shift ${what}`, [...this.driftCells, mode, 0, 0, 0]));
    field.swap();
  }

  /**
   * How many substeps this step's carries take on a thin gap, decided on the
   * GPU (carryCourant, carryPlan in wgsl/fluid.ts): after the velocity the
   * carries ride is final, before the first of them.
   */
  protected planCarry(pass: GPUComputePassEncoder, disp: number): void {
    this.ensureThinGap();
    const ride = this.ride();
    this.hsRun(pass, 'carryCourant', `carryCourant:${ride.label}:${this.squeeze.read.label}`, this.arg('carry courant', [0, 0, 0, 0, 0, disp, 1, REST_GAP]),
      [ride, this.hsP!, this.carryMost!, this.squeeze.read, this.hsMob!]);
    this.hsRun(pass, 'carryPlan', 'carryPlan', this.arg('carry plan', [CARRY_COURANT, CARRY_SUBSTEPS, Math.ceil(this.N / 8), CARRY_PAIRS]),
      [this.carryMost!, this.carryInd!, this.carrySub!], 1);
  }

  /**
   * One carry (`bodyAdvect` or `mixAdvect`) of `field` along the step's
   * velocity, in the substeps planCarry chose: the first as always, the rest
   * in pairs that go to the write field and back, each pair dispatched
   * indirectly so one this step does not need runs no workgroups. The field
   * ends swapped once, as a single carry leaves it.
   */
  protected carrySubsteps(pass: GPUComputePassEncoder, name: 'bodyAdvect' | 'mixAdvect', field: PingPong, args: GPUBuffer, also?: PingPong, argsAt?: GPUBuffer[]): void {
    // With `also` (the species, always rgba32float), bodyAdvect's pair: both fields through the same faces in one pass.
    const kernelName = also ? 'bodyAdvectPairSub' : `${name}Sub`;
    const pipe = this.pipeline(kernelName, field.format);
    if (!pipe) return;
    const ride = this.ride();
    // The amounts' carries see the air (airLiquid in wgsl/fluid.ts, PLAN 15g-8b): the step's air before and after it.
    const air = name === 'bodyAdvect' ? this.airPair() : null;
    const group = (a: GPUBuffer, src: GPUTexture, dst: GPUTexture, src2?: GPUTexture, dst2?: GPUTexture) => {
      let at = this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupRoot, 'carry'), pipe), a), src), dst);
      if (src2) at = this.groupAt(at, src2);
      at = this.groupAt(this.groupAt(at, this.squeeze.read), ride);
      if (air) at = this.groupAt(at, air[0]);
      let g = at.group;
      if (!g) {
        g = bindGroup(this.device, pipe, [this.sim, a, src, ride, dst, this.hsP!, this.carrySub!, this.squeeze.read, this.hsMob!, ...(src2 && dst2 ? [src2, dst2] : []), ...(air ?? [])]);
        at.group = g;
      }
      return g;
    };
    /*
      With `argsAt` (airArgs, only while the carry takes the air), each
      substep its own arguments, which carry its index, and airGive before
      each, through the same dispatch.
    */
    const gives = !!argsAt && !!air;
    const w = Math.ceil(this.N / 8);
    const a0 = argsAt ? argsAt[0] : args;
    if (gives) this.airGive(pass, true, a0);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group(a0, field.read, field.write, also?.read, also?.write));
    pass.dispatchWorkgroups(w, w);
    field.swap();
    also?.swap();
    const there = argsAt ? null : group(args, field.read, field.write, also?.read, also?.write);
    const back = argsAt ? null : group(args, field.write, field.read, also?.write, also?.read);
    for (let k = 0; k < CARRY_PAIRS; k++) {
      for (let half = 1; half <= 2; half++) {
        const a = argsAt ? argsAt[half + 2 * k] : args;
        if (gives) this.airGive(pass, true, a, 12 * k);
        pass.setPipeline(pipe);
        pass.setBindGroup(0, half === 1
          ? there ?? group(a, field.read, field.write, also?.read, also?.write)
          : back ?? group(a, field.write, field.read, also?.write, also?.read));
        pass.dispatchWorkgroupsIndirect(this.carryInd!, 12 * k);
      }
    }
    // And the rest of the way with the glass's drift.
    this.shiftCarried(pass, field, name === 'mixAdvect' ? 'mix' : 'amount');
    if (also) this.shiftCarried(pass, also);
  }

  /** A dispatch over textures and buffers in binding order, its group cached under `key`: 2D over the grid, or 1D over `count`. */
  protected hsRun(pass: GPUComputePassEncoder, name: string, key: string, args: GPUBuffer, resources: (GPUBuffer | GPUTexture)[], count?: number): void {
    const pipe = this.pipelines.computePipeline(this.pipelineKey(name, 'thin'), kernel(name, 'rgba16float'));
    if (!pipe) return;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    if (count === undefined) {
      const w = Math.ceil(this.N / 8);
      pass.dispatchWorkgroups(w, w);
    } else {
      pass.dispatchWorkgroups(Math.ceil(count / 64));
    }
  }

  /**
   * One step of the plate as a Hele-Shaw cell (wgsl/thinGap.ts): the forces
   * read as terminal speeds and the drag, the mobility, the right-hand side,
   * a variable-coefficient multigrid with the rim held open, and the
   * velocity the step ends with.
   */
  protected thinProject(pass: GPUComputePassEncoder, p: GpuStepParams, disp: number, hands: GPUTexture | null): void {
    const prev = this.ensureThinGap();
    const mob = this.hsMob!;
    const nu = thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS);
    const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
    const phase = this.phaseLive ? this.phase.read : this.blankPhase();
    const mid = this.hsMidNow ?? prev;
    /*
      Glass Smear is the glass sliding over the liquid (hsPrep): the liquid's
      column goes at half the glass's speed. The old push gave the colour a
      noise's 0 to 1 of smearX, half on average, and a pool pushed while the
      clear liquid round it is not goes at about half its push (Darcy's), so
      the colour went at about a quarter of smearX (lab: 0.27). The glass is
      taken at half smearX, so the liquid, colour and all, goes at a quarter
      (0.25): a look's smear moves its colour as fast as it did, and now
      moves the liquid it is in with it.

      Plate Rock's cover glass is the same glass moving (PLAN 27a-1,
      lib/plateRock.ts): its slide, in m/s, in the flow's units (seconds
      over the plate's width and disp, as the breath's), and the liquid
      dragged toward half of it.
    */
    const toFlow = seconds / (PLATE_METRES * Math.max(disp, 1e-9));
    // A slide that is not a number is none: glassFlow keeps what it is given, and the plate would keep the NaN.
    const slide = (v: number | undefined) => (Number.isFinite(v) ? v as number : 0);
    const glassX = 0.25 * p.smearX + 0.5 * slide(p.coverX) * toFlow;
    const glassY = 0.25 * p.smearY + 0.5 * slide(p.coverY) * toFlow;
    /*
      And how far that pull carries the film this step, for the carries to
      take out (driftCells, and why): hsPrep's drag, u = (u + kΔt·glass) /
      (1 + kΔt), at the rest gap, in whole cells a step.
    */
    const kdt = 12 * nu / (REST_GAP_METRES * REST_GAP_METRES) * seconds;
    this.glassFlow = [(this.glassFlow[0] + kdt * glassX) / (1 + kdt), (this.glassFlow[1] + kdt * glassY) / (1 + kdt)];
    this.glassCells = [this.glassFlow[0] * disp * this.N, this.glassFlow[1] * disp * this.N];
    const whole = (c: number) => Math.max(-DRIFT_MOST, Math.min(DRIFT_MOST, Math.round(c)));
    const [wx, wy] = [whole(this.glassCells[0]), whole(this.glassCells[1])];
    const frac = (c: number, w: number) => Math.max(-0.5, Math.min(0.5, c - w));
    const on = Math.max(Math.abs(this.glassCells[0]), Math.abs(this.glassCells[1])) >= DRIFT_LEAST;
    this.driftCells = on ? [wx, wy, frac(this.glassCells[0], wx), frac(this.glassCells[1], wy)] : [0, 0, 0, 0];
    const hand = hands ?? this.blankPhase();
    // The poured liquids' viscosities (PLAN 18d), or nothing poured.
    const species = this.species && this.speciesLive && this.readsSpecies ? this.species.read : this.blank('rgba');
    const film = this.filmLaid > 0 && !!this.film ? this.film.read : this.blank('rgba');
    this.hsRun(pass, 'hsPrep', `hsPrep:${this.vel.read.label}:${mid.label}:${this.squeeze.read.label}:${phase.label}:${hand.label}:${species.label}:${film.label}`,
      this.arg('thin prep', [12 * nu / (GAP_METRES * GAP_METRES), seconds, REST_GAP, OPEN_RIM, this.phaseLive ? (p.ferroViscosity ?? FERRO_NU) / nu : 1,
        NU_REF / nu, glassX, glassY]),
      [this.vel.read, prev, mid, this.squeeze.read, phase, hand, this.vel.write, mob, species, film]);
    this.vel.swap();
    this.hsRun(pass, 'hsDivergence', `hsDivergence:${this.vel.read.label}:${this.squeeze.read.label}:${this.air!.field.label}:${this.air!.prev.label}`,
      this.arg('thin divergence', [this.airPush, 0, this.airCover, REST_GAP, (this.airCover - this.airCoverPrev) / Math.max(disp, 1e-9), 1 / Math.max(disp, 1e-9), this.hsPrimed ? 0 : 1, 0]),
      [this.vel.read, this.squeeze.read, this.air!.field, this.air!.prev, this.div, mob, this.hsGap!, this.hsPour!]);
    this.hsPrimed = true;
    // Each coarse level's faces and rim, from the level above it.
    for (let l = 0; l < this.mg.length; l++) {
      const fineN = l === 0 ? this.N : this.mg[l - 1].n;
      const cells = l === 0 ? mob : this.hsMobC[l - 1];
      // Level 0 has no face buffer (its faces are its cells' harmonic means), so its
      // cells fill the slot too: read twice is allowed, read and written in one dispatch is not.
      const faces = l === 0 ? mob : this.hsFaceC[l - 1];
      this.hsRun(pass, 'hsCoarsen', this.nameOf('hsCoarsen:', l), this.arg4(this.nameOf('thin coarsen ', l), fineN, l === 0 ? 1 : 0),
        [cells, faces, this.hsMobC[l], this.hsFaceC[l]], this.mg[l].n * this.mg[l].n);
    }
    /*
      Warm-started: the solve begins from the last step's P, not from zero.
      It looked as if it began from zero: hsP was cleared under the bind
      group key 'clear pressure', which the old plate's clear of `press` had
      already built on `press`, so it zeroed `press` (which hsGradient then
      overwrites) and left hsP as the last step had it; after a groups.clear()
      the first caller took the key, and the thin gap went cold. Every number
      Thin Gap was measured and shipped on came from the warm start, and a
      cold one does not reach them in hsCycles V-cycles: in `npm run thingap`
      a press on a 130² grid moved its ring 63% of the way the displaced
      volume puts it, against 100% warm (128² is 100% either way). A Hele-Shaw
      cell's pressure changes smoothly from one step to the next, so the last
      step's is the standard first guess; it is chosen here rather than left
      to whichever clear ran first (PLAN 18a-12).
    */
    for (let c = 0; c < this.hsCycles; c++) this.hsCycle(pass, 0);
    this.hsRun(pass, 'hsGradient', `hsGradient:${this.vel.read.label}:${this.squeeze.read.label}`, this.arg('thin gradient', [REST_GAP, 0, 0, 0]),
      [this.vel.read, this.squeeze.read, this.vel.write, this.hsP!, mob, this.press]);
    this.vel.swap();
  }

  /** One V-cycle of the thin gap's variable-coefficient multigrid, as `vcycle` is for the old one. */
  private hsCycle(pass: GPUComputePassEncoder, l: number): void {
    const mob = this.hsMob!;
    const smooth = (level: number, sweeps: number) => {
      for (let k = 0; k < sweeps; k++) {
        for (let parity = 0; parity < 2; parity++) {
          if (level === 0) {
            this.hsRun(pass, 'hsSmooth0', this.nameOf('hsSmooth0:', parity), this.arg4(this.nameOf('pressure ', parity), parity), [this.div, this.hsP!, mob], this.N * (this.N / 2));
          } else {
            const lv = this.mg[level - 1];
            this.hsRun(pass, 'hsSmooth', this.nameOf('hsSmooth:', level, ':', parity), this.arg4(this.nameOf('mg smooth ', level, ' ', parity), lv.n, parity),
              [lv.b, lv.p, this.hsMobC[level - 1], this.hsFaceC[level - 1]], lv.n * Math.ceil(lv.n / 2));
          }
        }
      }
    };
    if (l === this.mg.length) { smooth(l, MG_COARSE_SWEEPS); return; }
    smooth(l, MG_SWEEPS);
    const below = this.mg[l];
    if (l === 0) {
      this.hsRun(pass, 'hsRestrict0', 'hsRestrict0', this.arg('none', [0, 0, 0, 0]), [this.div, this.hsP!, mob, below.b], below.n * below.n);
    } else {
      const here = this.mg[l - 1];
      this.hsRun(pass, 'hsRestrict', this.nameOf('hsRestrict:', l), this.arg4(this.nameOf('mg level ', l), here.n), [here.p, here.b, this.hsMobC[l - 1], this.hsFaceC[l - 1], below.b], below.n * below.n);
    }
    this.dispatchBuf(pass, 'mgZero', this.nameOf('mgZero:', l + 1), this.arg4(this.nameOf('mg zero ', l + 1), below.n * below.n), [below.p], below.n * below.n);
    this.hsCycle(pass, l + 1);
    if (l === 0) {
      this.hsRun(pass, 'hsProlong0', 'hsProlong0', this.arg('none', [0, 0, 0, 0]), [below.p, this.hsP!, mob], this.N * this.N);
    } else {
      const here = this.mg[l - 1];
      this.hsRun(pass, 'hsProlong', this.nameOf('hsProlong:', l), this.arg4(this.nameOf('mg level ', l), here.n), [below.p, here.p, this.hsMobC[l - 1]], here.n * here.n);
    }
    smooth(l, MG_SWEEPS);
  }

  /** The lasting current: forces, then its own projection, on the M grid. */
  protected stepCurrent(pass: GPUComputePassEncoder): void {
    const m = this.arg('current grid', [0, this.M, 0, 0]);
    this.run(pass, 'currentForces', this.cur.write, [this.cur.read, this.vel.read, this.dye.read], m, this.M);
    this.cur.swap();
    this.run(pass, 'curDivergence', this.curDiv, [this.cur.read], m, this.M);
    for (let k = 0; k < CURRENT_ITERS; k++) {
      this.run(pass, 'curPressure', this.curP.write, [this.curP.read, this.curDiv], m, this.M);
      this.curP.swap();
    }
    this.run(pass, 'curGradient', this.cur.write, [this.cur.read, this.curP.read], m, this.M);
    this.cur.swap();
  }

  protected macCormack(pass: GPUComputePassEncoder, field: PingPong, velTex: GPUTexture, disp: number, label: string): void {
    const fwd = this.arg('advect forward', [disp, 0, 0, 0]);
    const back = this.arg('advect back', [-disp, 0, 0, 0]);
    const phi0 = field.read;
    this.run(pass, 'advect', this.scratchA, [phi0, velTex, this.sampler], fwd);
    this.run(pass, 'advect', this.scratchB, [this.scratchA, velTex, this.sampler], back);
    // The dye is an amount and thins where the flow spreads (see macCormack);
    // the velocity is carried as it was.
    const last = label === 'dye' ? this.arg('advect dye conserving', [disp, 1, 0, 0]) : fwd;
    this.run(pass, 'macCormack', field.write, [phi0, this.scratchA, this.scratchB, velTex, this.sampler], last);
    field.swap();
  }
}
