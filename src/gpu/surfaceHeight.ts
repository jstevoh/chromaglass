/**
 * Free-surface and oil-layer height field `h` on the solver grid (PLAN 31s-1).
 *
 * Each active step:
 *   1. Advects `h` conservatively in flux form (MUSCL + minmod) so total mass is kept.
 *   2. Levels `h` by the thin-film lubrication equation:
 *        dh/dt = div( h^3 / (3 mu) grad(p) ),   p = -sigma lap(h) + rho g h
 *      via semi-implicit Backward Euler solved with coupled 2x2 Red-Black multigrid
 *      V-cycles and finished with an exact face flux-divergence update.
 *   3. Seeds `h` where oil is poured (`mix.r`), defaulting to Sunflower oil's
 *      real viscosity, interfacial tension and density (`bottles.ts`).
 */

import { DEFAULT_LIQUID_TYPES } from '../bottles';
import { CARRY_SUBSTEPS, PLATE_METRES, R32, THIN_GAP_THICKNESS, thinGapViscosity } from './fluid/constants';
import { Disposer, PipelineCache, type Prep } from './kit';
import { groupOf } from './groupCache';
import type { Opening } from './opening';
import { SURFACE_KERNELS, type SurfaceKernel } from './wgsl/surfaceHeight';

const WG = 8;
const V_CYCLES = 2;
const SWEEPS = 1;
const COARSE_SWEEPS = 16;
/** Oil seed thickness in metres: fits the 2 mm dish while forming the ~1.9 mm capillary meniscus. */
export const SURFACE_OIL_SEED_METRES = 0.0015;

const OIL_BOTTLE = DEFAULT_LIQUID_TYPES.find((b) => b.id === 'oil');
export const DEFAULT_OIL_MU = (OIL_BOTTLE?.behaviour?.viscosity ?? 49) * 1e-3;
export const DEFAULT_OIL_SIGMA = (OIL_BOTTLE?.behaviour?.tension ?? 33) * 1e-3;
export const DEFAULT_OIL_RHO = (OIL_BOTTLE?.behaviour?.density ?? 0.92) * 1e3;
export const DEFAULT_WATER_SIGMA = 0.072;
export const DEFAULT_WATER_RHO = 1000;

export interface SurfaceProps {
  oilMu?: number;
  oilSigma?: number;
  oilRho?: number;
  waterMu?: number;
  waterSigma?: number;
  waterRho?: number;
}

interface Level {
  n: number;
  state: GPUBuffer;
  prop: GPUBuffer;
}

export class SurfaceHeight {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  /** The height field texture (`r32float`), in metres, exposed read-only to the plate. */
  readonly field: GPUTexture;
  private readonly scratchState: GPUBuffer;
  private readonly levels: Level[] = [];
  private readonly stepUni: GPUBuffer[] = [];
  private uniIdx = 0;
  private readonly dummyF32: GPUBuffer;
  private readonly defaultSub: GPUBuffer;
  private staging: GPUBuffer | null = null;
  private readonly paramsData = new ArrayBuffer(64);
  private readonly paramsU32 = new Uint32Array(this.paramsData);
  private readonly paramsF32 = new Float32Array(this.paramsData);
  private disposed = false;

  /** Live liquid properties (SI: Pa·s, N/m, kg/m³), updated when a bottle pours oil. */
  oilMu = DEFAULT_OIL_MU;
  oilSigma = DEFAULT_OIL_SIGMA;
  oilRho = DEFAULT_OIL_RHO;
  waterSigma = DEFAULT_WATER_SIGMA;
  waterRho = DEFAULT_WATER_RHO;
  waterMuOverride: number | null = null;
  /** True once oil is poured or a height profile is seeded cleanly. */
  live = false;
  /** Check-skeptic control: false turns lubrication levelling off after advection. */
  levellingEnabled = true;

  /** Build all kernels behind the show (`later = true`) so opening never waits on them. */
  static prepare(device: GPUDevice, _open?: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'surfaceHeight');
    return (Object.keys(SURFACE_KERNELS) as SurfaceKernel[]).map((k) => cache.computePrep(k, SURFACE_KERNELS[k], true));
  }

  constructor(private readonly device: GPUDevice, readonly n: number) {
    this.pipelines = PipelineCache.for(device, 'surfaceHeight');
    this.field = this.disposer.track(device.createTexture({
      label: 'surface height',
      size: [n, n],
      format: R32,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    const store = (label: string, size: number) => this.disposer.track(device.createBuffer({
      label,
      size: Math.max(16, size),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    }));
    this.scratchState = store('surface scratch state', n * n * 16);
    for (let m = n; m >= 4; m = Math.floor(m / 2)) {
      this.levels.push({
        n: m,
        state: store(`surface state ${m}`, m * m * 16),
        prop: store(`surface prop ${m}`, m * m * 16),
      });
      if (m % 2 !== 0) break;
    }
    this.dummyF32 = store('surface dummy', 16);
    this.defaultSub = store('surface sub default', 16);
    device.queue.writeBuffer(this.defaultSub, 0, new Float32Array([1, 1, 0, 0]));
    // Allocate enough uniform slots for seed, advect, prep, coarsen, V-cycles and finish in one encoder.
    for (let k = 0; k < 48; k++) {
      this.stepUni.push(this.disposer.track(device.createBuffer({
        label: `surface uni ${k}`,
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })));
    }
  }

  private uni(
    n: number,
    coarseN: number,
    parity: number,
    dt: number,
    disp: number,
    gapThickness?: number,
    seedH = SURFACE_OIL_SEED_METRES,
  ): GPUBuffer {
    if (this.uniIdx >= this.stepUni.length) {
      this.stepUni.push(this.disposer.track(this.device.createBuffer({
        label: `surface uni ${this.stepUni.length}`,
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })));
    }
    const buf = this.stepUni[this.uniIdx++];
    const u = this.paramsU32;
    const f = this.paramsF32;
    const nuW = thinGapViscosity(gapThickness ?? THIN_GAP_THICKNESS);
    u[0] = n;
    u[1] = Math.floor(n / 2);
    u[2] = coarseN;
    u[3] = parity;
    f[4] = PLATE_METRES / n;
    f[5] = dt;
    f[6] = this.oilMu;
    f[7] = this.oilSigma;
    f[8] = this.oilRho;
    f[9] = this.waterMuOverride ?? this.waterRho * nuW;
    f[10] = this.waterSigma;
    f[11] = this.waterRho;
    f[12] = disp;
    f[13] = seedH;
    f[14] = this.levellingEnabled ? 1 : 0;
    f[15] = 9.81;
    this.device.queue.writeBuffer(buf, 0, this.paramsData);
    return buf;
  }

  private dispatch2D(pass: GPUComputePassEncoder, name: SurfaceKernel, n: number, resources: (GPUBuffer | GPUTexture)[]): void {
    const pipe = this.pipelines.computePipeline(name, SURFACE_KERNELS[name]);
    if (!pipe) return;
    pass.setPipeline(pipe);
    pass.setBindGroup(0, groupOf(this.device, pipe, resources));
    const w = Math.ceil(n / WG);
    pass.dispatchWorkgroups(w, w);
  }

  private dispatch1D(pass: GPUComputePassEncoder, name: SurfaceKernel, count: number, resources: (GPUBuffer | GPUTexture)[], indirect?: { buf: GPUBuffer; offset: number }): void {
    const pipe = this.pipelines.computePipeline(name, SURFACE_KERNELS[name]);
    if (!pipe) return;
    pass.setPipeline(pipe);
    pass.setBindGroup(0, groupOf(this.device, pipe, resources));
    if (indirect) pass.dispatchWorkgroupsIndirect(indirect.buf, indirect.offset);
    else pass.dispatchWorkgroups(Math.ceil(count / 64));
  }

  setProps(props: SurfaceProps): void {
    if (props.oilMu !== undefined) this.oilMu = props.oilMu;
    if (props.oilSigma !== undefined) this.oilSigma = props.oilSigma;
    if (props.oilRho !== undefined) this.oilRho = props.oilRho;
    if (props.waterSigma !== undefined) this.waterSigma = props.waterSigma;
    if (props.waterRho !== undefined) this.waterRho = props.waterRho;
    if (props.waterMu !== undefined) this.waterMuOverride = props.waterMu;
  }

  clear(pass: GPUComputePassEncoder): void {
    if (this.disposed) return;
    this.uniIdx = 0;
    const u = this.uni(this.n, 0, 0, 0, 0);
    this.dispatch2D(pass, 'surfaceClear', this.n, [u, this.levels[0].state, this.field]);
    this.live = false;
  }

  seedFromMix(pass: GPUComputePassEncoder, prevMix: GPUTexture, nextMix: GPUTexture, mode: 'add' | 'replace', props?: { viscosity?: number; tension?: number; density?: number }, seedH = SURFACE_OIL_SEED_METRES): void {
    if (this.disposed) return;
    this.uniIdx = 0;
    if (props?.viscosity && props.viscosity > 0) this.oilMu = props.viscosity * 1e-3;
    if (props?.tension && props.tension > 0) this.oilSigma = props.tension * 1e-3;
    if (props?.density && props.density > 0) this.oilRho = props.density * 1e3;
    const u = this.uni(this.n, 0, mode === 'add' ? 0 : 1, 0, 0, undefined, seedH);
    this.dispatch2D(pass, 'surfaceSeedMix', this.n, [u, prevMix, nextMix, this.levels[0].state, this.field]);
    this.live = true;
  }

  setFromHost(data: Float32Array, props?: SurfaceProps): void {
    if (this.disposed || data.length !== this.n * this.n) return;
    if (props) this.setProps(props);
    if (!this.staging) {
      this.staging = this.disposer.track(this.device.createBuffer({
        label: 'surface host stage',
        size: this.n * this.n * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }));
    }
    this.device.queue.writeBuffer(this.staging, 0, data);
    this.uniIdx = 0;
    const u = this.uni(this.n, 0, 0, 0, 0);
    const enc = this.device.createCommandEncoder({ label: 'surface set' });
    const pass = enc.beginComputePass({ label: 'surface set' });
    this.dispatch2D(pass, 'surfaceSetBuf', this.n, [u, this.staging, this.levels[0].state, this.field]);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.live = true;
  }

  step(
    enc: GPUCommandEncoder,
    opts: {
      seconds: number;
      disp: number;
      vel: GPUTexture;
      mix: GPUTexture;
      gapThickness?: number;
      thin?: { pr: GPUBuffer; sq: GPUTexture; mob: GPUBuffer; sub: GPUBuffer; ind: GPUBuffer } | null;
      advectSubsteps?: number;
    },
    timing?: GPUComputePassTimestampWrites,
  ): void {
    if (this.disposed || !this.live) return;
    this.uniIdx = 0;
    const fine = this.levels[0];
    const pass = enc.beginComputePass({ label: 'surface height', timestampWrites: timing });

    // 1. Conservative flux-form advection, ending in `this.scratchState`.
    const thin = opts.thin;
    const advPr = thin?.pr ?? this.dummyF32;
    const advSq = thin?.sq ?? opts.mix;
    const advMob = thin?.mob ?? this.dummyF32;
    if (thin) {
      const u = this.uni(this.n, 0, 1, 0, opts.disp, opts.gapThickness);
      this.dispatch2D(pass, 'surfaceAdvect', this.n, [u, fine.state, this.scratchState, opts.vel, advPr, advSq, advMob, thin.sub]);
      const advPipe = this.pipelines.computePipeline('surfaceAdvect', SURFACE_KERNELS.surfaceAdvect);
      if (advPipe) {
        const toFine = groupOf(this.device, advPipe, [u, this.scratchState, fine.state, opts.vel, advPr, advSq, advMob, thin.sub]);
        const toScratch = groupOf(this.device, advPipe, [u, fine.state, this.scratchState, opts.vel, advPr, advSq, advMob, thin.sub]);
        pass.setPipeline(advPipe);
        for (let k = 0; k < Math.floor(CARRY_SUBSTEPS / 2); k++) {
          pass.setBindGroup(0, toFine);
          pass.dispatchWorkgroupsIndirect(thin.ind, 12 * k);
          pass.setBindGroup(0, toScratch);
          pass.dispatchWorkgroupsIndirect(thin.ind, 12 * k);
        }
      }
    } else {
      const subs = Math.max(1, Math.min(7, (opts.advectSubsteps ?? 1) | 1));
      const u = this.uni(this.n, 0, 0, 0, opts.disp / subs, opts.gapThickness);
      this.dispatch2D(pass, 'surfaceAdvect', this.n, [u, fine.state, this.scratchState, opts.vel, advPr, advSq, advMob, this.defaultSub]);
      for (let k = 1; k < subs; k += 2) {
        this.dispatch2D(pass, 'surfaceAdvect', this.n, [u, this.scratchState, fine.state, opts.vel, advPr, advSq, advMob, this.defaultSub]);
        this.dispatch2D(pass, 'surfaceAdvect', this.n, [u, fine.state, this.scratchState, opts.vel, advPr, advSq, advMob, this.defaultSub]);
      }
    }

    // 2. Semi-implicit thin-film lubrication levelling (1 substep at 60 Hz, 2 at 30 Hz).
    const seconds = Math.max(0, Math.min(0.1, opts.seconds));
    const levelSubs = seconds > 0.02 ? 2 : 1;
    const dtSub = seconds / levelSubs;
    for (let s = 0; s < levelSubs; s++) {
      const levelUnis: [GPUBuffer, GPUBuffer][] = this.levels.map((lv, idx) => {
        const cn = idx + 1 < this.levels.length ? this.levels[idx + 1].n : 0;
        return [
          this.uni(lv.n, cn, 0, dtSub, 0, opts.gapThickness),
          this.uni(lv.n, cn, 1, dtSub, 0, opts.gapThickness),
        ];
      });
      this.dispatch2D(pass, 'surfacePrepLevel', this.n, [levelUnis[0][0], opts.mix, this.scratchState, fine.state, fine.prop]);
      if (this.levellingEnabled && dtSub > 0) {
        for (let l = 0; l < this.levels.length - 1; l++) {
          this.dispatch2D(pass, 'surfaceCoarsenProp', this.levels[l + 1].n, [levelUnis[l][0], this.levels[l].prop, this.levels[l + 1].prop]);
        }
        const smooth = (l: number, count: number) => {
          const lv = this.levels[l];
          const elems = lv.n * Math.floor(lv.n / 2);
          for (let k = 0; k < count; k++) {
            this.dispatch1D(pass, 'surfaceSmooth', elems, [levelUnis[l][0], lv.state, lv.prop]);
            this.dispatch1D(pass, 'surfaceSmooth', elems, [levelUnis[l][1], lv.state, lv.prop]);
          }
        };
        const vcycle = (l: number) => {
          if (l === this.levels.length - 1) { smooth(l, COARSE_SWEEPS); return; }
          smooth(l, SWEEPS);
          const next = this.levels[l + 1];
          this.dispatch2D(pass, 'surfaceRestrict', next.n, [levelUnis[l][0], this.levels[l].state, this.levels[l].prop, next.state]);
          vcycle(l + 1);
          this.dispatch2D(pass, 'surfaceProlong', this.levels[l].n, [levelUnis[l][0], this.levels[l].state, next.state]);
          smooth(l, SWEEPS);
        };
        for (let v = 0; v < V_CYCLES; v++) vcycle(0);
      }
      this.dispatch2D(pass, 'surfaceFluxFinish', this.n, [levelUnis[0][0], fine.state, fine.prop, this.scratchState, this.field]);
    }
    pass.end();
  }

  dispose(): void {
    this.disposed = true;
    this.disposer.dispose();
  }
}
