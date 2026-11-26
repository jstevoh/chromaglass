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
 * each cell's charge and light, stepped with the plate (wgsl/glow.ts says
 * the physics: the shear from the flow's strain and from the gap's
 * Poiseuille profile, the charge each firing spends and the seconds it
 * takes to refill, the tenth-of-a-second flash). The plate draws the light
 * as blue emission (wgsl/plateGlow.ts), added to whatever the lamp lights,
 * so it belongs to looks with the lamp low or off; under a full lamp it is
 * there and faint, as a wake is at noon.
 *
 * Off (Glow at 0, every look but the one that sets it) nothing here is made
 * or run, and the plate binds a 4-float stand-in.
 */
import { Disposer, PipelineCache, bindGroup, type Prep } from './kit';
import type { Opening } from './opening';
import { GLOW_KERNELS, type GlowKernel } from './wgsl/glow';

/** The glow's grid, square over the plate: 256 resolves a finger's wake (a few millimetres) on a 20 cm plate. */
export const GLOW_GRID = 256;
/** The threshold's default, per second: 30 s⁻¹ in seawater is 0.03 Pa, inside the range measured for Lingulodinium (Latz et al. 1994, 0.02 to 0.1 Pa). */
export const GLOW_SHEAR = 30;
/** Recharge's default, seconds: a stimulated cell needs seconds before it flashes as brightly again (a real cell minutes for its whole store; the stage's quicker). */
export const GLOW_RECHARGE = 8;
/** How fast a firing cell spends its charge, seconds: a flash or two under steady shear before it tires. */
export const GLOW_SPEND = 0.25;
/** A flash's fade, seconds: luciferase's light lasts about a tenth of a second (Widder and Case 1981). */
export const GLOW_FADE = 0.12;
/** The longest step the glow takes at once, seconds: past it the cells wait (a hitch). */
const MAX_STEP = 0.1;

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
  private readonly state: [GPUBuffer, GPUBuffer];
  private readonly lightBuf: GPUBuffer;
  private readonly pipe: GPUComputePipeline;
  /*
    The bind groups, one pair for each flow and gap texture the step has been
    handed. The squeeze film's gap is a ping-pong and the flow is the forced
    one or the ridden one, so there are at most four pairs, and they are made
    once each rather than every step (no new objects in the frame).
  */
  private readonly groups: { vel: GPUTexture; gap: GPUTexture; bg: [GPUBindGroup, GPUBindGroup] }[] = [];
  private flip = 0;
  private readonly args = new ArrayBuffer(48);
  private readonly u32 = new Uint32Array(this.args);
  private readonly f32 = new Float32Array(this.args);

  /** The glow's pipeline, for the show to build before it opens (gpu/prepare.ts): ahead when the look opens glowing (gpu/opening.ts, glow). */
  static prepare(device: GPUDevice, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'glow');
    return Object.entries(GLOW_KERNELS).map(([k, code]) => cache.computePrep(k, code, !open.glow));
  }

  constructor(private readonly device: GPUDevice, readonly n = GLOW_GRID) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.uni = this.disposer.track(device.createBuffer({ label: 'glow args', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    const cells = n * n;
    this.state = [
      this.disposer.track(device.createBuffer({ label: 'glow state a', size: cells * 8, usage })),
      this.disposer.track(device.createBuffer({ label: 'glow state b', size: cells * 8, usage })),
    ];
    this.lightBuf = this.disposer.track(device.createBuffer({ label: 'glow light', size: cells * 4, usage }));
    const p = PipelineCache.for(device, 'glow').computePipeline('glowStep' satisfies GlowKernel, GLOW_KERNELS.glowStep);
    if (!p) throw new Error('glow pipeline glowStep failed to build');
    this.pipe = p;
    this.reset();
  }

  /** Every cell fully charged and dark: a sea that has rested. */
  reset(): void {
    const full = new Float32Array(this.n * this.n * 2);
    for (let k = 0; k < full.length; k += 2) full[k] = 1;
    this.device.queue.writeBuffer(this.state[0], 0, full);
    this.device.queue.writeBuffer(this.state[1], 0, full);
    this.device.queue.writeBuffer(this.lightBuf, 0, new Float32Array(this.n * this.n));
  }

  /**
   * One step of the glow on `enc`: `seconds` of the show's clock, `vel` the
   * flow the dye rides and `travel` the uv a unit of it moves the dye this
   * step, `gap` the squeeze film's gap (gap units, gpu/fluid/constants.ts
   * GAP_METRES), and the two dials.
   */
  step(enc: GPUCommandEncoder, seconds: number, vel: GPUTexture, gap: GPUTexture, travel: number, shear: number, recharge: number): void {
    const dt = Math.min(MAX_STEP, seconds);
    if (!(dt > 0)) return;
    this.u32[0] = this.n;
    this.u32[1] = 0;
    this.u32[2] = 0;
    this.u32[3] = 0;
    this.f32[4] = Number.isFinite(travel) ? travel : 0;
    this.f32[5] = dt;
    this.f32[6] = Number.isFinite(shear) ? Math.max(0.1, shear) : GLOW_SHEAR;
    this.f32[7] = Number.isFinite(recharge) ? Math.max(0.05, recharge) : GLOW_RECHARGE;
    this.f32[8] = GLOW_SPEND;
    this.f32[9] = GLOW_FADE;
    // The step's own seconds, for the flow's speed: a hitch clamps the cells' clocks, never how fast the water went.
    this.f32[10] = seconds;
    this.f32[11] = 0;
    this.device.queue.writeBuffer(this.uni, 0, this.args);
    // A plain loop, not find(): no closure made each step.
    let g: (typeof this.groups)[number] | undefined;
    for (const e of this.groups) if (e.vel === vel && e.gap === gap) { g = e; break; }
    if (!g) {
      const [a, b] = this.state;
      g = {
        vel,
        gap,
        bg: [
          bindGroup(this.device, this.pipe, [this.uni, vel, gap, a, b, this.lightBuf]),
          bindGroup(this.device, this.pipe, [this.uni, vel, gap, b, a, this.lightBuf]),
        ],
      };
      // Never more than a handful; a texture remade (a new grid) leaves its old pair to fall out.
      if (this.groups.length >= 8) this.groups.shift();
      this.groups.push(g);
    }
    const pass = enc.beginComputePass({ label: 'glow' });
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, g.bg[this.flip]);
    const w = Math.ceil(this.n / 8);
    pass.dispatchWorkgroups(w, w);
    pass.end();
    this.flip ^= 1;
  }

  get field(): GlowField {
    return { light: this.lightBuf, n: this.n };
  }

  /** For checks: the charge and the light, read back (never in the show). */
  async read(): Promise<{ charge: Float32Array; light: Float32Array }> {
    const cells = this.n * this.n;
    const out = this.device.createBuffer({ size: cells * 12, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder();
    // The state the last step wrote is the one the next reads.
    enc.copyBufferToBuffer(this.state[this.flip], 0, out, 0, cells * 8);
    enc.copyBufferToBuffer(this.lightBuf, 0, out, cells * 8, cells * 4);
    this.device.queue.submit([enc.finish()]);
    await out.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(out.getMappedRange().slice(0));
    out.unmap();
    out.destroy();
    const charge = new Float32Array(cells);
    for (let k = 0; k < cells; k++) charge[k] = all[k * 2];
    return { charge, light: all.slice(cells * 2) };
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
