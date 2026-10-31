/**
 * The fields a look makes the first time it needs them (the mix, the film, the reaction's
 * grids, the thin gap's), the getters the frame loop reads, and the dispatch helpers the
 * passes above share. Part of the solver's class chain; the map is at the top of `gpu/fluid.ts`.
 */

import { PingPong, bindGroup } from '../kit';
import { RIM_SAMPLES, kernel } from '../wgsl/fluid';
import type { GpuStepParams } from '../solverTypes';
import type { SloshDrive } from '../../lib/slosh';
import { DISH_GAP_RANGE, dragSeconds } from '../../lib/turntable';
import { WebGPUAir } from '../air';
import { StandingFilm } from '../standing';
import { AIR_CAPACITY, CARRY_SUBSTEPS, CARRY_PAIRS, FILM_GRID, LIES_B0, BZ_GRID, LIES_GRID, SWIRL_DISH_MIN, SWIRL_SPIN_MIN, liftGrid, GRAIN_PERIOD, VEL, R32, type FieldStats } from './constants';
import { FluidCore } from './core';

export class FluidFields extends FluidCore {
  /** The same, for the hands (PlateSolver.thinGapLive). */
  get thinGapLive(): boolean { return this.thinLive; }
  get oilCover(): number { return this.oilPoured; }
  get chemistryLive(): { rxn: boolean; lies: boolean } { return { rxn: this.rxnLive, lies: this.liesLive }; }
  /** For the harness: whether the phase stage is running at all. */
  get phaseIsLive(): boolean { return this.phaseLive; }

  /**
   * `arg` with four numbers and no array to carry them: for the multigrids'
   * sweeps, the most asked of all, where the array literal a call is written
   * with was most of what was left of a step's garbage (`npm run encode`).
   */
  protected arg4(name: string, x: number, y = 0, z = 0, w = 0): GPUBuffer {
    const v = this.argScratch;
    v[0] = x; v[1] = y; v[2] = z; v[3] = w; v[4] = 0; v[5] = 0; v[6] = 0; v[7] = 0;
    return this.argWrite(name);
  }

  /** `pipeline`'s key for a kernel built under a suffix of its own (`hsRun`'s `:thin`), made once. */
  protected pipelineKey(name: string, suffix: string): string {
    let bySuffix = this.pipelineKeys.get(name);
    if (!bySuffix) { bySuffix = new Map(); this.pipelineKeys.set(name, bySuffix); }
    let key = bySuffix.get(suffix);
    if (key === undefined) { key = `${name}:${suffix}`; bySuffix.set(suffix, key); }
    return key;
  }

  /**
   * The names the multigrids ask for on every sweep (`mg smooth 3 1`,
   * `hsSmooth:3:1`), each made once. A template literal is a new string every
   * time it runs, and the map it is looked up in hashes it again: the two
   * V-cycles a step asked for some two hundred of each (`npm run encode`).
   * Each prefix is used with one separator, so the prefix alone keys the table.
   */
  protected nameOf(prefix: string, b: number, sep?: string, c?: number): string {
    let byB = this.names.get(prefix);
    if (!byB) { byB = new Map(); this.names.set(prefix, byB); }
    let byC = byB.get(b);
    if (!byC) { byC = new Map(); byB.set(b, byC); }
    const k = c ?? -1;
    let name = byC.get(k);
    if (name === undefined) { name = c === undefined ? `${prefix}${b}` : `${prefix}${b}${sep}${c}`; byC.set(k, name); }
    return name;
  }

  /** As run, with the pressure buffer bound after the texture written. */
  protected runPressed(pass: GPUComputePassEncoder, name: string, dst: GPUTexture, reads: GPUTexture[], args: GPUBuffer): void {
    const pipe = this.pipeline(name, dst.format);
    if (!pipe) return;
    let at = this.groupAt(this.groupAt(this.groupAt(this.groupAt(this.groupRoot, 'press'), pipe), dst), args);
    for (const r of reads) at = this.groupAt(at, r);
    let group = at.group;
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...reads, dst, this.press]);
      at.group = group;
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /** The gap the ferrofluid has seen, made zero (unprimed) the first time. */
  protected ensurePhaseGap(): GPUBuffer {
    if (!this.phaseGap) {
      this.phaseGap = this.disposer.track(this.device.createBuffer({ label: 'phase gap seen', size: Math.max(16, this.N * this.N * 4), usage: GPUBufferUsage.STORAGE }));
    }
    return this.phaseGap;
  }

  /**
    Drive the slosh dish for the coming step (lib/slosh.ts SloshDrive: the tilt,
    the water's viscosity, the presses, and whether to lay it level first), or
    null to leave it out and at rest: the plate's thin stage is then the one it
    was before the dish existed, bit for bit. The visualizer decides, without a
    readback, when the dish has rung down (`SloshClock`).
  */
  setSlosh(drive: SloshDrive | null): void {
    if (!drive) { this.sloshDrive = null; this.sloshTex = null; this.sloshLevel = true; return; }
    this.sloshDrive = drive;
    if (drive.level) this.sloshLevel = true;
  }

  /** The dish's depth for the plate's drawing (red: both layers over the rest depth; green: the oil's share), while it is driven. */
  get sloshDepth(): GPUTexture | null { return this.sloshTex && this.slosh ? this.slosh.depth : null; }

  protected writeSplatArgs(count: number): void {
    const buf = new ArrayBuffer(16);
    new Uint32Array(buf, 0, 1)[0] = count;
    new Float32Array(buf, 4, 3).set([this.N, this.L, 0]);
    this.device.queue.writeBuffer(this.splatArgs, 0, buf);
  }

  /**
   * Birth and motion for the particle population, building or releasing it
   * as the amount crosses zero.
   *
   * The population is sized by the grid, so a rung change takes it with the
   * rest of the solver — a new `WebGPUFluid` is built and this one is
   * disposed, and the particles go with it. They do not survive the change,
   * which is right: they carry positions in a field that no longer exists.
   */
  /**
   * The bubbles this plate is carrying, from `BubbleField.packed`.
   *
   * Called by the frame rather than the step: the list is the renderer's
   * bookkeeping and moves at the frame's pace, and stamping the same
   * positions again on every one of the step's iterations would cost the
   * splat several times over for one picture.
   */
  /**
   * How much of the plate the air is taking, or 0 when nothing is excluding.
   *
   * The budget servo needs it: the exclusion is a multiply, so the dye it
   * displaces leaves the field, and the servo is what keeps the plate's
   * total rather than a ring at the rim (H6 · A).
   */
  get airDisplacing(): number { return this.airPush > 0 ? this.airCover : 0; }

  protected ensureMix(): PingPong {
    if (!this.mix) {
      this.mix = new PingPong(this.device, this.disposer, [this.N, this.N], 'rgba32float', 'mix');
      const enc = this.device.createCommandEncoder({ label: 'mix clear' });
      const pass = enc.beginComputePass();
      for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
      pass.end();
      this.submit(enc);
    }
    return this.mix;
  }

  /** The clear film's fields (PLAN §20b), made the first time a plate asks for a film. */
  protected ensureFilm(): PingPong {
    if (!this.film) {
      const n = Math.min(FILM_GRID, this.N);
      this.film = new PingPong(this.device, this.disposer, [n, n], 'rgba32float', 'film');
      this.filmP = this.disposer.track(this.device.createTexture({
        label: 'film pressure', size: [n, n], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.film;
  }

  /** Whether a clear film is on the plate (PLAN §20b). */
  get filmOn(): boolean { return this.filmLaid > 0; }

  protected ensureRxn(): PingPong {
    if (!this.rxn) {
      this.rxn = new PingPong(this.device, this.disposer, [BZ_GRID, BZ_GRID], 'rgba32float', 'rxn');
      const enc = this.device.createCommandEncoder({ label: 'rxn clear' });
      const pass = enc.beginComputePass();
      for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
      pass.end();
      this.submit(enc);
    }
    return this.rxn;
  }

  /** An empty 1×1 phase, for a kernel that reads the ferrofluid when none is on the plate. */
  protected blankPhase(): GPUTexture {
    if (!this.blankPhaseTex) {
      this.blankPhaseTex = this.disposer.track(this.device.createTexture({ label: 'blank phase', size: [1, 1], format: R32, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING }));
    }
    return this.blankPhaseTex;
  }

  protected ensureLies(): PingPong {
    if (!this.lies) {
      this.lies = new PingPong(this.device, this.disposer, [LIES_GRID, LIES_GRID], 'rgba32float', 'liesegang');
      this.fillLies();
    }
    return this.lies;
  }

  /** The gel as it starts: B spread evenly, nothing else. */
  private fillLies(): void {
    const enc = this.device.createCommandEncoder({ label: 'liesegang fill' });
    const pass = enc.beginComputePass();
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    for (const t of [this.lies!.a, this.lies!.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    pass.end();
    this.submit(enc);
  }

  /**
   * The oil's pressure round the open rim (rimLaplace, PLAN 18g-6): one row,
   * a sample about a cell of the rim apart, a multiple of the kernel's 64
   * threads and at most its arrays' RIM_SAMPLES (past 1024 cells round, a
   * 330 plate, the samples spread to a cell and a half and more; the
   * force they sum is a blur five cells wide). Zero until first written,
   * which on the old plate, whose rim is closed, it never is.
   */
  protected rimRing(): GPUTexture {
    if (!this.rimPhi) {
      const k = Math.min(RIM_SAMPLES, 64 * Math.ceil(Math.PI * this.N / 64));
      this.rimPhi = this.disposer.track(this.device.createTexture({
        label: 'rim oil pressure', size: [k, 1], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.rimPhi;
  }

  protected scratch(): GPUTexture {
    if (!this.scratchR) {
      this.scratchR = this.disposer.track(this.device.createTexture({
        label: 'scratch r', size: [this.N, this.N], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.scratchR;
  }

  protected ensureReach(): PingPong {
    if (!this.oilReach) this.oilReach = new PingPong(this.device, this.disposer, [this.N, this.N], R32, 'oil reach');
    return this.oilReach;
  }

  /** The slump's per-cell rate, made once (PLAN 18m). */
  protected ensureSlump(): GPUTexture {
    if (!this.slumpK) {
      this.slumpK = this.disposer.track(this.device.createTexture({
        label: 'slump rate', size: [this.N, this.N], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.slumpK;
  }

  protected ensureOilDye(): PingPong {
    // A share just made starts from the plate as it is, as a stale one does
    // (the 'advect dye' stage, bodiesFresh): the oil already laid holds the
    // colour already in it.
    if (!this.oilDye) { this.oilDye = new PingPong(this.device, this.disposer, [this.N, this.N], this.dyeFormat, 'oil dye'); this.oilDyeStale = true; }
    return this.oilDye;
  }


  setBubbles(packed: Float32Array, count: number, soft = 0.25, finger?: Float32Array): void {
    if (!this.air) this.air = new WebGPUAir(this.device, this.N, AIR_CAPACITY);
    this.air.setBubbles(packed, count, soft, finger);
    // How far the air's push has to carry the liquid: the widest bubble's
    // reach, fingers and all, in cells (airDisplace's passes follow it).
    let reach = 0;
    for (let i = 0; i < count; i++) {
      const f = finger ? Math.max(0, Math.min(1, finger[i * 4])) : 0;
      reach = Math.max(reach, packed[i * 4 + 2] * this.N * (1 + 0.9 * f));
    }
    this.airReach = Number.isFinite(reach) ? reach : 0;
  }

  /**
   * The splat, once a frame: the population drawn into the texture the
   * compositor adds. Encoded into the *frame's* encoder rather than a step's,
   * because several steps happen per frame and only the last one is seen.
   */
  splatParticles(enc: GPUCommandEncoder, timing?: (label: string) => GPURenderPassTimestampWrites | undefined): void {
    this.particles?.splat(enc, timing);
  }

  /** As dispatchBuf, over the grid in 8 × 8 tiles, with no args of its own. */
  protected dispatchBuf2(pass: GPUComputePassEncoder, name: string, key: string, resources: (GPUBuffer | GPUTexture)[]): void {
    const pipe = this.pipelines.computePipeline(name, kernel(name, 'r32float'));
    if (!pipe) return;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, this.arg('none', [0, 0, 0, 0]), ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * Whether the spun dish's swirl runs this step (see SWIRL_DISH_MIN): while
   * the dish and its liquid move against each other or the liquid is a
   * centrifuge, and for five of the slowest drag times after.
   */
  protected swirlWanted(p: GpuStepParams): boolean {
    const dish = Math.abs(p.spinDish ?? 0), spin = Math.abs(p.spinLiquid ?? 0);
    if (!Number.isFinite(dish) || !Number.isFinite(spin)) return false;
    const nu = Math.max(1e-7, p.spinNu ?? 1e-6);
    if (dish > SWIRL_DISH_MIN || spin > SWIRL_SPIN_MIN) {
      this.swirlTail = 5 * dragSeconds(nu, DISH_GAP_RANGE[1]);
      return true;
    }
    this.swirlTail -= Math.max(0, p.magnetSeconds ?? 1 / 60);
    return this.swirlTail > 0;
  }

  /** A 1×1 texture of zeros, for a pass whose optional field a plate does not have. */
  protected blank(kind: 'r' | 'rgba'): GPUTexture {
    if (!this.blankR || !this.blankRGBA) {
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
      this.blankR = this.disposer.track(this.device.createTexture({ label: 'blank r', size: [1, 1], format: R32, usage }));
      this.blankRGBA = this.disposer.track(this.device.createTexture({ label: 'blank rgba', size: [1, 1], format: 'rgba32float', usage }));
    }
    return kind === 'r' ? this.blankR : this.blankRGBA;
  }

  /**
   * The film's kernels built now, as prepareThinGap builds the thin gap's:
   * for checks, which measure the film from a magnet's first step. The app
   * builds them behind the show, the first time a magnet is close enough.
   */
  prepareFilm(): Promise<void> {
    if (!this.layer) this.layer = new StandingFilm(this.device, this.pipelines, this.disposer, this.N);
    return this.layer.prepare();
  }

  /** The standing layer's window (see standOn), made once, zero until a film writes it. */
  protected ensureStand(): GPUTexture {
    if (!this.stand) {
      this.stand = this.disposer.track(this.device.createTexture({
        label: 'stand', size: [this.N, this.N], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.stand;
  }

  /** The thin-gap solver's storage, made once; returns the velocity snapshot. */
  protected ensureThinGap(): GPUTexture {
    if (!this.hsPrev) {
      this.hsPrev = this.disposer.track(this.device.createTexture({
        label: 'thin gap before forces', size: [this.N, this.N], format: VEL,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
      const buf = (label: string, n: number) => this.disposer.track(this.device.createBuffer({ label, size: Math.max(16, n * n * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
      this.hsMid = this.disposer.track(this.device.createTexture({
        label: 'thin gap after body forces', size: [this.N, this.N], format: VEL,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.hsMob = buf('thin gap mobility', this.N);
      // The oil's lift (PLAN 27f-5, hsBody): the water's colour's mean, and the circulation's Ψ and its right-hand side.
      this.hsOilMean = buf('thin gap oil mean', 1);
      this.liftN = liftGrid(this.N);
      this.hsLiftSrc = this.disposer.track(this.device.createBuffer({ label: 'oil lift source', size: this.liftN * this.liftN * 8, usage: GPUBufferUsage.STORAGE }));
      this.hsLiftPsi = this.disposer.track(this.device.createBuffer({ label: 'oil lift psi', size: this.liftN * this.liftN * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
      // The thin solve's own P, packed as the old solver's pressure is. The thin
      // carries read it (THIN_FACE); hsGradient hands phaseAdvect's area form c·P
      // in that one (wgsl/thinGap.ts, hsGradient).
      this.hsP = buf('thin gap pressure', this.N);
      this.hsGap = buf('thin gap before', this.N);
      this.hsPour = this.disposer.track(this.device.createBuffer({ label: 'thin pour', size: Math.max(16, this.N * this.N * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
      this.hsMobC = this.mg.map((lv) => buf(`thin gap rim ${lv.n}`, lv.n));
      // Each coarse level's faces: every cell's east face, then every cell's north.
      this.hsFaceC = this.mg.map((lv) => this.disposer.track(this.device.createBuffer({ label: `thin gap faces ${lv.n}`, size: Math.max(16, 2 * lv.n * lv.n * 4), usage: GPUBufferUsage.STORAGE })));
      this.carryMost = this.disposer.track(this.device.createBuffer({ label: 'carry courant', size: 16, usage: GPUBufferUsage.STORAGE }));
      this.carryInd = this.disposer.track(this.device.createBuffer({ label: 'carry pairs', size: 12 * CARRY_PAIRS, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT }));
      this.carrySub = this.disposer.track(this.device.createBuffer({ label: 'carry substeps', size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
      this.phaseInd = this.disposer.track(this.device.createBuffer({ label: 'phase substeps', size: 12 * CARRY_SUBSTEPS, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT }));
      this.phaseSub = this.disposer.track(this.device.createBuffer({ label: 'phase share', size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    }
    return this.hsPrev;
  }

  /** The flow the thin carries ride: the forced flow, less the glass's drift when it has one (driftCells). */
  protected ride(): GPUTexture {
    return this.riding ? this.velRide : this.velForced;
  }

  /** The last measurement, without asking for another. */
  get stats(): FieldStats { return this.statsLatest; }

  /** Whether any measurement has come back yet. */
  get measured(): boolean { return this.statsFresh; }

  /** Which copy the last measurement came from; it rises as fresh ones land. */
  get measuredSeq(): number { return this.statsLatest.at; }

  get rbDyeView(): Float32Array { return this.rbDye; }
  /** The dye readback's sequence: the newest copy issued, and the newest landed in `rbDyeView`. */
  get rbDyeIssued(): number { return this.rbRings.dye.issued; }
  /*
    The reading in rbDyeView, not the newest to land in the ring. A copy lands
    asynchronously and waits in the ring until the next readbackAsync copies
    it across, so the ring's `landed` ran up to a frame ahead of the view:
    Finger and Press, told their last move was in the reading, read the one
    before it and put the dye they had already moved down again, and the
    Finger added a third of what it stroked (npm run tools, +172 on 426).
  */
  get rbDyeLanded(): number { return this.rbDyeSeq; }
  get rbVelView(): Float32Array { return this.rbVel; }

  /** The pigment coordinates' crossfade. */
  get grainMix(): number {
    const c = Math.cos(Math.PI * (this.grainAge / GRAIN_PERIOD));
    return c * c;
  }

  /**
   * The pigment's coordinates, where the device can carry them. Named as the
   * WebGL solver names it, because that is what the plate asks both of them
   * for (`PlateSolver` in `lib/gpuFluid.ts`).
   */
  get grainTexture(): GPUTexture | null { return this.grain?.read ?? null; }

  /** The print stops: the plate shows the solver's dye alone again (no reaction on the plate, or a look that does not print). */
  endPrint(): void { this.printLive = false; }

  /** The fields, for the compositor (P3) to read directly. */
  get fields() {
    return {
      dye: this.printLive && this.printDye ? this.printDye : this.dye.read,
      vel: this.vel.read,
      velForced: this.velForced,
      grain: this.grain?.read ?? null,
      /** The particle splat, or null when the amount is 0 and none exist. */
      particles: this.particles && !this.particles.idle ? this.particles.target : null,
      /** The air field (H6), or null when no bubble is on this plate. */
      air: this.air?.any ? this.air.field : null,
      /** The second phase (H7), or null when none has been poured. */
      phase: this.phaseLive ? this.phase.read : null,
      /** The mix (oil, soap, acidity) and the reactions, or null where none. */
      mix: this.mixLive && this.mix ? this.mix.read : null,
      rxn: this.rxnLive && this.rxn ? this.rxn.read : null,
      lies: this.liesLive && this.lies ? this.lies.read : null,
      /** All of it packed for the plate (see packView), once a step has run. */
      view: this.viewTex,
      chem: this.chemLive ? this.chem.read : null,
      /** The poured species field (carries scatter in b channel). */
      species: this.speciesLive && this.species ? this.species.read : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles?.dispose();
    this.particles = null;
    this.air?.dispose();
    this.air = null;
    this.slosh?.dispose();
    this.slosh = null;
    this.disposer.dispose();
    this.groups.clear();
    this.groupRoot = { kids: new Map() };
  }
}
