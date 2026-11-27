/**
 * Faraday waves on the plate (PLAN 48f): the dish shaken up and down, and the
 * standing pattern its liquid grows, stepped with the plate and drawn by it
 * (wgsl/plateFaraday.ts).
 *
 * What was asked (the owner, 2026-11-21): "anything that can be impacted by
 * the music itself. Like the standing-wave patterns for example." A real
 * dish of water on a speaker playing the music makes exactly that: past a
 * threshold the shaking stands up as a lattice of waves at half its
 * frequency, cells big under a bass note and fine under a high one, growing
 * over a second as the note swells and settling as it dies.
 *
 * The rule the music keeps (CLAUDE.md, *Physics writes, rendering reads*):
 * the sound reaches this only through a cord on Shake, the dish's
 * acceleration, which the patch bay folds into the settings like any other.
 * Nothing here hears the music; the solver's step takes the acceleration
 * and the drive's frequency and nothing else, and the pattern, its scale and
 * whether it is there at all are the liquid's (src/lib/faraday.ts,
 * wgsl/faraday.ts).
 *
 * Off (Shaker at 0 Hz, every look until a performer turns it on) nothing
 * here is made or run; turned off, it goes, and the next time the water is
 * still.
 */
import { PipelineCache, bindGroup, Disposer, type Prep } from './kit';
import { FARADAY_KERNELS, FARADAY_N, type FaradayKernel } from './wgsl/faraday';
import { PLATE_METRES, VEL } from './fluid/constants';
import {
  FARADAY_DEPTH, FARADAY_G, FARADAY_HZ_MAX, FARADAY_HZ_MIN, FARADAY_NU, FARADAY_RHO, FARADAY_ROCK_MAX, FARADAY_SHAKE_MAX, FARADAY_SIGMA,
  faradayCapillaryShare, faradayK, faradayOmega,
} from '../lib/faraday';
import type { Opening } from './opening';

export { FARADAY_N };

/*
  S0, the saturation's scale (wgsl/faraday.ts, N(u)): the steepness k u a
  pattern settles at is S0 √(4(ε − ε_c)/3), so at the Shake dial's top over
  a 40 Hz drive (ε − ε_c 0.6 of the restoring force) 0.5, a steep but
  unbroken wave, and at twice the threshold about 0.1.
*/
export const FARADAY_S0 = 0.6;
/** The dish's own disturbances, m/√s: what a pattern grows from (wgsl/faraday.ts). */
export const FARADAY_NOISE = 1e-7;
/** The longest substep, seconds: two a frame at 60. */
export const FARADAY_SUBSTEP = 1 / 120;
/** At most this many a step: a slow frame steps longer substeps, not more of them. */
export const FARADAY_SUBSTEPS = 4;

/** What a step needs of the settings: the front plate's only (one dish on the speaker). */
export interface FaradayStepParams {
  /** Shake: the dish's peak acceleration, in g. */
  faraday?: number;
  /** Shaker: the drive's frequency, Hz; 0 is no shaker. */
  faradayHz?: number;
  /** Rock: how far the strobe slips from the wave's own frequency, Hz; 0 holds the pattern at its crest. */
  faradayRock?: number;
}

const NO_FARADAY: FaradayStepParams = Object.freeze({});
/* One object, refilled: besideStep spreads it into the step's params at once, so no frame keeps it. */
const SHAKEN: FaradayStepParams = { faraday: 0, faradayHz: 0, faradayRock: 0 };

export function faradayStep(s: FaradayStepParams, layer: number): FaradayStepParams {
  if (layer > 0 || !((s.faradayHz ?? 0) > 0)) return NO_FARADAY;
  SHAKEN.faraday = s.faraday ?? 0;
  SHAKEN.faradayHz = s.faradayHz;
  SHAKEN.faradayRock = s.faradayRock ?? 0;
  return SHAKEN;
}

/** The drive's frequency the step uses: the setting held to the range the grid resolves. */
export function faradayHzOf(hz: number | undefined): number {
  const h = Number.isFinite(hz) ? (hz as number) : 0;
  return Math.max(FARADAY_HZ_MIN, Math.min(FARADAY_HZ_MAX, h));
}

/**
 * The standing wave on an n × n grid over the plate, metres: `h` its
 * amplitude (the envelope the solver steps), `eta` the surface as the strobe
 * catches it (h cos φ), which is what the plate draws.
 */
export interface FaradayField {
  h: GPUBuffer;
  eta: GPUBuffer;
  n: number;
}

/*
  The waves' own mean flow (wgsl/faraday.ts, faradayForce, faradayStream):
  the push is Γ ∇²u ∇u, and the flow it makes in a layer h deep over a floor
  is held by the floor's friction r = ν (π/2h)², the first shear mode of a
  layer that cannot slip at its floor and is free at its top. Γ is set so
  that, at the pattern's own wavelength, the flow a defect makes is the
  waves' streaming scale ω k u², the speed of the drift a standing wave's
  particles make (Longuet-Higgins 1953; the Stokes drift of each of its two
  travelling halves): Γ k_c² u² k_c / (r + ν k_c²) = ω k_c u², so
  Γ = ω (r + ν k_c²) / k_c². At a 40 Hz drive and k u 0.3 that is about
  2 cm/s near a defect, a cell's width in a second or two, which is the
  pace Kudrolli and Gollub (1996) filmed defects moving at in shaken dishes.
  It is a scale and not a derivation (PLAN 48f-8): the Faraday mean flow
  proper (Vega, Knobloch and Martel 2001) has terms this leaves out.
*/
function floorFriction(): number {
  return FARADAY_NU * (Math.PI / (2 * FARADAY_DEPTH)) ** 2;
}

/* Where the cubic sits in a slot's pass list (the constructor's order). */
const CUBIC_PASS = 9;

export class FaradayPlate {
  private readonly disposer = new Disposer();
  private readonly spec: GPUBuffer;
  private readonly z: GPUBuffer;
  /* The waves' push on the liquid, packed (Fx + i Fy), and the flow it makes (Ux + i Uy), m/s. */
  private readonly zf: GPUBuffer;
  private readonly zu: GPUBuffer;
  /* No plate flow: a texel of nought, for a dish stepped on its own (the lab's checks). */
  private readonly still: GPUTexture;
  /* The flow the cubic's groups were built over: rebuilt when the plate hands it another (fields.ts ride). */
  private vel: GPUTexture | null = null;
  private readonly cubicPipe: GPUComputePipeline;
  /** The cubic's stiffness gauge: the largest u² and |∇u|² of the substep, as float bits (wgsl/faraday.ts). */
  private readonly stiff: GPUBuffer;
  readonly field: FaradayField;
  /** One uniform buffer a substep slot, so each substep's seed is its own (writes land before the encoder runs). */
  private readonly uni: GPUBuffer[] = [];
  /* Each substep slot's thirteen passes, their bind groups built once (one uniform buffer a slot); the cubic's are rebuilt on a new plate flow. */
  private readonly passes: { pipe: GPUComputePipeline; group: GPUBindGroup; x: number; y: number }[][] = [];
  private readonly args = new Float32Array(20);
  /* The strobe's slip, radians, carried across steps so a rock never jumps (wrapped at a turn). */
  private phase = 0;
  /* What the drive's frequency sets, worked out again only when it changes (faradayK is a bisection). */
  private hz = -1;
  private seed = 1;

  /** The kernels, for the show to build before it opens (gpu/prepare.ts): ahead when the look opens with the shaker on. */
  static prepare(device: GPUDevice, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'faraday');
    return Object.entries(FARADAY_KERNELS).map(([k, code]) => cache.computePrep(k, code, !open.faraday));
  }

  constructor(private readonly device: GPUDevice) {
    const n = FARADAY_N;
    const store = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.spec = this.disposer.track(device.createBuffer({ label: 'faraday spectrum', size: n * n * 8, usage: store }));
    this.z = this.disposer.track(device.createBuffer({ label: 'faraday work', size: n * n * 8, usage: store }));
    this.zf = this.disposer.track(device.createBuffer({ label: 'faraday push', size: n * n * 8, usage: store }));
    this.zu = this.disposer.track(device.createBuffer({ label: 'faraday mean flow', size: n * n * 8, usage: store }));
    const h = this.disposer.track(device.createBuffer({ label: 'faraday height', size: n * n * 4, usage: store }));
    const eta = this.disposer.track(device.createBuffer({ label: 'faraday surface', size: n * n * 4, usage: store }));
    this.stiff = this.disposer.track(device.createBuffer({ label: 'faraday stiffness', size: 16, usage: store }));
    this.still = this.disposer.track(device.createTexture({ label: 'faraday still', size: [1, 1], format: VEL, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }));
    this.field = { h, eta, n };
    for (let s = 0; s < FARADAY_SUBSTEPS; s++) {
      this.uni.push(this.disposer.track(device.createBuffer({ label: `faraday args ${s}`, size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })));
    }
    const cfg = (label: string, axis: number, sign: number) => {
      const b = this.disposer.track(device.createBuffer({ label: `faraday fft ${label}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      device.queue.writeBuffer(b, 0, new Float32Array([axis, sign, 0, 0]));
      return b;
    };
    const rowF = cfg('rows forward', 0, -1), colF = cfg('cols forward', 1, -1), rowB = cfg('rows back', 0, 1), colB = cfg('cols back', 1, 1);
    const cache = PipelineCache.for(device, 'faraday');
    const pipe = (k: FaradayKernel): GPUComputePipeline => {
      const p = cache.computePipeline(k, FARADAY_KERNELS[k]);
      if (!p) throw new Error(`faraday pipeline ${k} failed to build`);
      return p;
    };
    const fft = pipe('faradayFft'), height = pipe('faradayHeight'), force = pipe('faradayForce'), stream = pipe('faradayStream');
    const advance = pipe('faradayAdvance');
    this.cubicPipe = pipe('faradayCubic');
    const flat = Math.ceil((n * n) / 64);
    const at = (p: GPUComputePipeline, res: (GPUBuffer | GPUTexture)[], x: number, y = 1) => ({ pipe: p, group: bindGroup(device, p, res), x, y });
    for (const uni of this.uni) {
      this.passes.push([
        // Back to real space: the amplitude, the surface the strobe catches.
        at(fft, [uni, rowB, this.z], n), at(fft, [uni, colB, this.z], n),
        at(height, [uni, this.z, h, this.stiff, eta], flat),
        // The waves' push, and the mean flow it makes (Fourier space and back).
        at(force, [uni, h, this.zf], n / 8, n / 8),
        at(fft, [uni, rowF, this.zf], n), at(fft, [uni, colF, this.zf], n),
        at(stream, [uni, this.zf, this.zu], flat),
        at(fft, [uni, rowB, this.zu], n), at(fft, [uni, colB, this.zu], n),
        // What the linear step leaves out: the saturation, the carry by both flows, the noise.
        at(this.cubicPipe, [uni, h, this.z, this.stiff, this.zu, this.still], n / 8, n / 8),
        at(fft, [uni, rowF, this.z], n), at(fft, [uni, colF, this.z], n),
        at(advance, [uni, this.z, this.spec, this.stiff], flat),
      ]);
    }
  }

  /* The cubic's groups over the plate's flow `vel` (or none): built again only when the plate hands another texture. */
  private bindFlow(vel: GPUTexture | null): void {
    if (vel === this.vel) return;
    this.vel = vel;
    const n = FARADAY_N;
    for (let s = 0; s < this.uni.length; s++) {
      const list = this.passes[s];
      list[CUBIC_PASS] = {
        pipe: this.cubicPipe,
        group: bindGroup(this.device, this.cubicPipe, [this.uni[s], this.field.h, this.z, this.stiff, this.zu, vel ?? this.still]),
        x: n / 8, y: n / 8,
      };
    }
  }

  /**
   * One step of `seconds` on `enc`: the dish shaken at `shakeG` (its peak
   * acceleration in g, the Shake setting) and `hz` (the Shaker setting), the
   * strobe slipped `rock` Hz (the Rock setting), and the pattern carried by
   * the plate's flow `vel` (the solver's velocity texture, none for a dish
   * on its own), whose unit moves the dye `travel` of the plate's width a
   * step of `seconds` (lib/detailFlow.ts stepDisplacement).
   */
  step(enc: GPUCommandEncoder, seconds: number, shakeG: number, hz: number, rock = 0, vel: GPUTexture | null = null, travel = 0): void {
    const total = Math.max(0, Math.min(0.1, Number.isFinite(seconds) ? seconds : 0));
    if (!(total > 0)) return;
    this.bindFlow(vel);
    const subs = Math.max(1, Math.min(FARADAY_SUBSTEPS, Math.ceil(total / FARADAY_SUBSTEP)));
    const dt = total / subs;
    const a = this.args;
    const f = faradayHzOf(hz);
    if (f !== this.hz) {
      this.hz = f;
      const kc = faradayK(f);
      a[10] = (faradayOmega(kc) / 4) * (kc / FARADAY_S0) ** 2;
      a[11] = faradayCapillaryShare(kc);
      a[12] = kc;
      const r = floorFriction();
      a[17] = (Math.PI * f) * (r + FARADAY_NU * kc * kc) / (kc * kc);
      a[18] = r;
    }
    const n = FARADAY_N;
    a[0] = n; a[1] = PLATE_METRES; a[2] = dt; a[3] = Math.log2(n);
    a[4] = FARADAY_G * Math.max(0, Math.min(FARADAY_SHAKE_MAX, Number.isFinite(shakeG) ? shakeG : 0));
    a[5] = f; a[6] = FARADAY_DEPTH; a[7] = FARADAY_NU; a[8] = FARADAY_G; a[9] = FARADAY_SIGMA / FARADAY_RHO;
    a[13] = FARADAY_NOISE; a[15] = 0;
    // The plate's flow in m/s a unit: what it moves the dye a step, over the step's seconds.
    a[16] = vel && Number.isFinite(travel) && travel > 0 ? (travel * PLATE_METRES) / total : 0;
    const slip = 2 * Math.PI * Math.max(-FARADAY_ROCK_MAX, Math.min(FARADAY_ROCK_MAX, Number.isFinite(rock) ? rock : 0));
    const pass = enc.beginComputePass({ label: 'faraday' });
    for (let s = 0; s < subs; s++) {
      // A 24-bit linear congruence in 32-bit integers: in doubles its product passes 2^53 and the sequence falls into a short cycle.
      this.seed = (Math.imul(this.seed, 1103515245) + 12345) & 0xffffff;
      a[14] = this.seed;
      /*
        The strobe. A standing wave's surface swings u cos(ωt/2) at half the
        drive; a light flashed once a swing at the crest sees it still, and
        one flashed a little slower than the swing catches it a little later
        each flash, so the crests sink and the troughs rise, and they trade
        places at the slip's rate (a stroboscope's beat). The liquid is the
        same; only the light's timing differs, so φ only scales what is
        drawn (faradayHeight's eta), never what is stepped.
      */
      this.phase = (this.phase + slip * dt) % (2 * Math.PI);
      a[19] = Math.cos(this.phase);
      this.device.queue.writeBuffer(this.uni[s], 0, a);
      const list = this.passes[s];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        pass.setPipeline(p.pipe);
        pass.setBindGroup(0, p.group);
        pass.dispatchWorkgroups(p.x, p.y);
      }
    }
    pass.end();
  }

  /** Still water again (the plate's wipe). */
  reset(enc?: GPUCommandEncoder): void {
    const e = enc ?? this.device.createCommandEncoder({ label: 'faraday reset' });
    e.clearBuffer(this.spec); e.clearBuffer(this.z); e.clearBuffer(this.field.h); e.clearBuffer(this.field.eta); e.clearBuffer(this.stiff);
    e.clearBuffer(this.zf); e.clearBuffer(this.zu);
    this.phase = 0;
    if (!enc) this.device.queue.submit([e.finish()]);
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
