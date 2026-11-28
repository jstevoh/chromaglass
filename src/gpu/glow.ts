/**
 * Bioluminescent trails (PLAN 48c): the plate's water holds dinoflagellates,
 * and the dark plate glows blue where a stroke shears it.
 *
 * What was asked (PLAN §48, the music-driven visuals, ranked after the
 * standing waves): a light that comes from the liquid, where it is sheared,
 * the way a wake glows on a summer night in a bay full of Noctiluca, and
 * that tires: a second stroke down the same path within seconds glows less,
 * because the cells spent their light on the first. The music plays it
 * through the cords that already move the water (Stir, Press, the pours):
 * the glow answers the flow they make, so a hit that stirs hard lights a
 * wake and a quiet passage lets the sea recharge.
 *
 * What it is. A grid over the plate (GLOW_GRID square, the plate's uv) holds
 * each cell's charge, flash light and plankton concentration, stepped with
 * the plate (wgsl/glow.ts says the physics: conservative carry & diffusion
 * of plankton patches (48c-1), local shear stress μ·S against the stress
 * threshold in pascals (48c-2), the unified open-layer 3D strain tensor for
 * flow + wave (48c-7), standing-wave steady streaming herding plankton into
 * the lattice's nodes (48c-8), the charge each firing spends and the seconds
 * it takes to refill, the tenth-of-a-second flash). The plate draws the light
 * as blue emission (wgsl/plateGlow.ts), attenuated through the dye above by
 * Beer–Lambert (48c-3).
 *
 * Off (Glow at 0, every look but the one that sets it) nothing here is made
 * or run, and the plate binds a 4-float stand-in.
 */
import { Disposer, PipelineCache, bindGroup, type Prep } from './kit';
import { GLOW_KERNELS, GLOW_PLANKTON_POUR, type GlowKernel } from './wgsl/glow';
import type { Opening } from './opening';
import { faradayHzOf, type FaradayField } from './faraday';
import { FARADAY_DEPTH, FARADAY_NU, faradayK, faradayOmega } from '../lib/faraday';

/** The glow's grid, square over the plate: 256 resolves a finger's wake (a few millimetres) on a 20 cm plate. */
export const GLOW_GRID = 256;
/** The threshold's default, mPa (0.03 Pa, which is 30 s⁻¹ in seawater at 1 mPa·s, inside Latz et al. 1994's 0.02 to 0.1 Pa). */
export const GLOW_SHEAR = 30;
/** Recharge's default, seconds: a stimulated cell needs seconds before it flashes as brightly again (a real cell minutes for its whole store; the stage's quicker). */
export const GLOW_RECHARGE = 8;
/** How fast a firing cell spends its charge, seconds: a flash or two under steady shear before it tires. */
export const GLOW_SPEND = 0.25;
/** A flash's fade, seconds: luciferase's light lasts about a tenth of a second (Widder and Case 1981). */
export const GLOW_FADE = 0.12;
/** The longest step the glow takes at once, seconds: past it the cells wait (a hitch). */
const MAX_STEP = 0.1;
/** Conservative carry substeps per step (covers up to 1.8 cells/step at Courant 0.45 without overshoot). */
const CARRY_SUBS = 4;

/** What the step asks of the glow (GpuStepParams.glow and its two dials): the front plate's alone, as the soap film's is. */
export type GlowStepParams = { glow?: number; glowShear?: number; glowRecharge?: number };

/** Glow off: one shared, frozen answer, so the default path makes no object a step (as the tank's NO_TANK). */
const NO_GLOW: GlowStepParams = Object.freeze({});

/** The step's glow settings for layer `layer`: none for a back plate, which the plate never draws a glow for. */
export function glowStep(s: GlowStepParams, layer: number): GlowStepParams {
  if (layer > 0 || !((s.glow ?? 0) > 0.001)) return NO_GLOW;
  return { glow: s.glow, glowShear: s.glowShear ?? GLOW_SHEAR, glowRecharge: s.glowRecharge ?? GLOW_RECHARGE };
}

export interface GlowField {
  /** The light, a share of a fully charged cell's brightest, n × n over the plate's uv, row 0 at uv y 0. */
  light: GPUBuffer;
  n: number;
}

export class GlowPlate {
  private readonly disposer = new Disposer();
  private readonly uni: GPUBuffer;
  private readonly pourUni: GPUBuffer;
  private readonly state: [GPUBuffer, GPUBuffer];
  private readonly lightBuf: GPUBuffer;
  private readonly pipe: GPUComputePipeline;
  private readonly carryPipe: GPUComputePipeline;
  private readonly pourPipe: GPUComputePipeline;
  /*
    The bind groups, one pair for each flow, gap, wave and species texture
    the step has been handed, cached so no new objects are made each frame.
  */
  private readonly groups: {
    vel: GPUTexture; gap: GPUTexture; wave: GPUBuffer; species: GPUTexture;
    bg: [GPUBindGroup, GPUBindGroup]; carryBg: [GPUBindGroup, GPUBindGroup];
  }[] = [];
  private readonly pourGroups: { gap: GPUTexture; bg: [GPUBindGroup, GPUBindGroup] }[] = [];
  private flip = 0;
  /** The wave's stand-in with no shaker: four floats, which the kernel reads as no wave. */
  private readonly still: GPUBuffer;
  /** Empty 1×1 rgba32float stand-in when no species texture is passed. */
  private readonly noSpecies: GPUTexture;
  /* The wave's k and ω, worked out again only when the drive's frequency changes (faradayK is a bisection). */
  private hz = -1;
  private waveK = 0;
  private waveOmega = 0;
  private readonly args = new ArrayBuffer(64);
  private readonly u32 = new Uint32Array(this.args);
  private readonly f32 = new Float32Array(this.args);
  private readonly pourArgs = new ArrayBuffer(48);
  private readonly pourU32 = new Uint32Array(this.pourArgs);
  private readonly pourF32 = new Float32Array(this.pourArgs);

  /** The glow's pipelines, for the show to build before it opens (gpu/prepare.ts): ahead when the look opens glowing (gpu/opening.ts, glow). */
  static prepare(device: GPUDevice, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'glow');
    return Object.entries(GLOW_KERNELS).map(([k, code]) => cache.computePrep(k, code, !open.glow));
  }

  constructor(private readonly device: GPUDevice, readonly n = GLOW_GRID) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.uni = this.disposer.track(device.createBuffer({ label: 'glow args', size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.pourUni = this.disposer.track(device.createBuffer({ label: 'glow pour args', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.still = this.disposer.track(device.createBuffer({ label: 'glow no wave', size: 16, usage: GPUBufferUsage.STORAGE }));
    this.noSpecies = this.disposer.track(device.createTexture({ label: 'glow no species', size: [1, 1], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }));
    const cells = n * n;
    this.state = [
      this.disposer.track(device.createBuffer({ label: 'glow state a', size: cells * 16, usage })),
      this.disposer.track(device.createBuffer({ label: 'glow state b', size: cells * 16, usage })),
    ];
    this.lightBuf = this.disposer.track(device.createBuffer({ label: 'glow light', size: cells * 4, usage }));
    const cache = PipelineCache.for(device, 'glow');
    const pipe = (k: GlowKernel): GPUComputePipeline => {
      const p = cache.computePipeline(k, GLOW_KERNELS[k]);
      if (!p) throw new Error(`glow pipeline ${k} failed to build`);
      return p;
    };
    this.carryPipe = pipe('glowCarry');
    this.pourPipe = pipe('glowPour');
    this.pipe = pipe('glowStep');
    this.reset();
  }

  /** Every cell fully charged, dark, and holding nominal seawater plankton (1.0): a sea that has rested. */
  reset(): void {
    const full = new Float32Array(this.n * this.n * 4);
    for (let k = 0; k < full.length; k += 4) { full[k] = 1; full[k + 2] = 1; }
    this.device.queue.writeBuffer(this.state[0], 0, full);
    this.device.queue.writeBuffer(this.state[1], 0, full);
    this.device.queue.writeBuffer(this.lightBuf, 0, new Float32Array(this.n * this.n));
  }

  /**
   * Pour or seed plankton onto the plate (PLAN 48c-1): `plankton` is the
   * bottle's concentration factor (1 = nominal Plankton bottle, 0 = clear
   * water); `push` true adds volume-displacing concentrated bloom, false sets
   * a patch directly (initial bloom seeding or non-thin lay).
   */
  pour(x: number, y: number, radius: number, take: number, plankton: number, push: boolean, gap: GPUTexture): void {
    if (!(radius > 0) || !(take > 0)) return;
    this.pourU32[0] = this.n;
    this.pourU32[1] = 0; this.pourU32[2] = 0; this.pourU32[3] = 0;
    this.pourF32[4] = x; this.pourF32[5] = y; this.pourF32[6] = radius; this.pourF32[7] = take;
    this.pourF32[8] = plankton * GLOW_PLANKTON_POUR;
    this.pourF32[9] = push ? 1 : 0;
    this.pourF32[10] = 0; this.pourF32[11] = 0;
    this.device.queue.writeBuffer(this.pourUni, 0, this.pourArgs);
    let pg: (typeof this.pourGroups)[number] | undefined;
    for (const e of this.pourGroups) if (e.gap === gap) { pg = e; break; }
    if (!pg) {
      const [a, b] = this.state;
      pg = {
        gap,
        bg: [
          bindGroup(this.device, this.pourPipe, [this.pourUni, gap, a, b]),
          bindGroup(this.device, this.pourPipe, [this.pourUni, gap, b, a]),
        ],
      };
      if (this.pourGroups.length >= 8) this.pourGroups.shift();
      this.pourGroups.push(pg);
    }
    const enc = this.device.createCommandEncoder({ label: 'glow pour' });
    const pass = enc.beginComputePass({ label: 'glow pour' });
    pass.setPipeline(this.pourPipe);
    pass.setBindGroup(0, pg.bg[this.flip]);
    const w = Math.ceil(this.n / 8);
    pass.dispatchWorkgroups(w, w);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.flip ^= 1;
  }

  /**
   * One step of the glow on `enc`: `seconds` of the show's clock, `vel` the
   * flow the dye rides and `travel` the uv a unit of it moves the dye this
   * step, `gap` the squeeze film's gap (gap units, gpu/fluid/constants.ts
   * GAP_METRES), and the two dials; `wave` the shaken dish's Faraday field
   * and `hz` its drive (Shaker), or null and 0 with no shaker; `species` the
   * poured liquids' species texture and `lnClear` the clear liquid's
   * ln(ν_clear / WATER_NU) for local shear stress (48c-2); `thin` whether the
   * open rim flushes spilled plankton (48c-1).
   */
  step(
    enc: GPUCommandEncoder, seconds: number, vel: GPUTexture, gap: GPUTexture, travel: number, shear: number, recharge: number,
    wave: FaradayField | null = null, hz = 0, species: GPUTexture | null = null, lnClear = 0, thin = false,
  ): void {
    const dt = Math.min(MAX_STEP, seconds);
    if (!(dt > 0)) return;
    this.u32[0] = this.n;
    this.u32[1] = CARRY_SUBS;
    this.u32[2] = thin ? 1 : 0;
    this.u32[3] = 0;
    this.f32[4] = Number.isFinite(travel) ? travel : 0;
    this.f32[5] = dt;
    this.f32[6] = Number.isFinite(shear) ? Math.max(0.1, shear) : GLOW_SHEAR;
    this.f32[7] = Number.isFinite(recharge) ? Math.max(0.05, recharge) : GLOW_RECHARGE;
    this.f32[8] = GLOW_SPEND;
    this.f32[9] = GLOW_FADE;
    // The step's own seconds, for the flow's speed: a hitch clamps the cells' clocks, never how fast the water went.
    this.f32[10] = seconds;
    this.f32[11] = Number.isFinite(lnClear) ? lnClear : 0;
    const shaken = wave !== null && hz > 0;
    if (shaken) {
      const f = faradayHzOf(hz);
      if (f !== this.hz) {
        this.hz = f;
        // The pattern's wavenumber and the wave's own ω, half the drive: the dispersion relation's, as the wave's step uses.
        this.waveK = faradayK(f);
        this.waveOmega = faradayOmega(this.waveK);
      }
    }
    this.f32[12] = shaken ? this.waveK : 0;
    this.f32[13] = this.waveOmega;
    this.f32[14] = FARADAY_DEPTH;
    this.f32[15] = FARADAY_NU;
    this.device.queue.writeBuffer(this.uni, 0, this.args);
    const w8 = shaken ? wave.h : this.still;
    const sp = species ?? this.noSpecies;
    // A plain loop, not find(): no closure made each step.
    let g: (typeof this.groups)[number] | undefined;
    for (const e of this.groups) if (e.vel === vel && e.gap === gap && e.wave === w8 && e.species === sp) { g = e; break; }
    if (!g) {
      const [a, b] = this.state;
      g = {
        vel,
        gap,
        wave: w8,
        species: sp,
        bg: [
          bindGroup(this.device, this.pipe, [this.uni, vel, gap, a, b, this.lightBuf, w8, sp]),
          bindGroup(this.device, this.pipe, [this.uni, vel, gap, b, a, this.lightBuf, w8, sp]),
        ],
        carryBg: [
          bindGroup(this.device, this.carryPipe, [this.uni, vel, a, b, w8]),
          bindGroup(this.device, this.carryPipe, [this.uni, vel, b, a, w8]),
        ],
      };
      // Never more than a handful; a texture remade (a new grid) or a shaker made again leaves its old pair to fall out.
      if (this.groups.length >= 8) this.groups.shift();
      this.groups.push(g);
    }
    const pass = enc.beginComputePass({ label: 'glow' });
    const w = Math.ceil(this.n / 8);
    // Conservative flux-form carry + diffusion of plankton concentration (48c-1, 48c-8).
    pass.setPipeline(this.carryPipe);
    for (let s = 0; s < CARRY_SUBS; s++) {
      pass.setBindGroup(0, g.carryBg[this.flip]);
      pass.dispatchWorkgroups(w, w);
      this.flip ^= 1;
    }
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, g.bg[this.flip]);
    pass.dispatchWorkgroups(w, w);
    pass.end();
    this.flip ^= 1;
  }

  get field(): GlowField {
    return { light: this.lightBuf, n: this.n };
  }

  /** For checks: the charge (scaled by plankton concentration), the light the plate draws, and the cells' own light before the depth weighs it (lit), read back (never in the show). */
  async read(): Promise<{ charge: Float32Array; light: Float32Array; lit: Float32Array }> {
    const cells = this.n * this.n;
    const out = this.device.createBuffer({ size: cells * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder();
    // The state the last step wrote is the one the next reads.
    enc.copyBufferToBuffer(this.state[this.flip], 0, out, 0, cells * 16);
    this.device.queue.submit([enc.finish()]);
    await out.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(out.getMappedRange().slice(0));
    out.unmap();
    out.destroy();
    const outLight = this.device.createBuffer({ size: cells * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc2 = this.device.createCommandEncoder();
    enc2.copyBufferToBuffer(this.lightBuf, 0, outLight, 0, cells * 4);
    this.device.queue.submit([enc2.finish()]);
    await outLight.mapAsync(GPUMapMode.READ);
    const light = new Float32Array(outLight.getMappedRange().slice(0));
    outLight.unmap();
    outLight.destroy();
    const charge = new Float32Array(cells);
    const lit = new Float32Array(cells);
    for (let k = 0; k < cells; k++) {
      const p = all[k * 4 + 2];
      charge[k] = all[k * 4] * p;
      lit[k] = all[k * 4 + 1] * p;
    }
    return { charge, light, lit };
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
