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
import { PLATE_METRES } from './fluid/constants';
import {
  FARADAY_DEPTH, FARADAY_G, FARADAY_HZ_MAX, FARADAY_HZ_MIN, FARADAY_NU, FARADAY_RHO, FARADAY_SHAKE_MAX, FARADAY_SIGMA,
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
}

const NO_FARADAY: FaradayStepParams = Object.freeze({});
/* One object, refilled: besideStep spreads it into the step's params at once, so no frame keeps it. */
const SHAKEN: FaradayStepParams = { faraday: 0, faradayHz: 0 };

export function faradayStep(s: FaradayStepParams, layer: number): FaradayStepParams {
  if (layer > 0 || !((s.faradayHz ?? 0) > 0)) return NO_FARADAY;
  SHAKEN.faraday = s.faraday ?? 0;
  SHAKEN.faradayHz = s.faradayHz;
  return SHAKEN;
}

/** The drive's frequency the step uses: the setting held to the range the grid resolves. */
export function faradayHzOf(hz: number | undefined): number {
  const h = Number.isFinite(hz) ? (hz as number) : 0;
  return Math.max(FARADAY_HZ_MIN, Math.min(FARADAY_HZ_MAX, h));
}

/** What the plate draws: the standing wave's amplitude, metres, on an n × n grid over the plate. */
export interface FaradayField {
  h: GPUBuffer;
  n: number;
}

export class FaradayPlate {
  private readonly disposer = new Disposer();
  private readonly spec: GPUBuffer;
  private readonly z: GPUBuffer;
  /** The cubic's stiffness gauge: the largest u² and |∇u|² of the substep, as float bits (wgsl/faraday.ts). */
  private readonly stiff: GPUBuffer;
  readonly field: FaradayField;
  /** One uniform buffer a substep slot, so each substep's seed is its own (writes land before the encoder runs). */
  private readonly uni: GPUBuffer[] = [];
  /* Each substep slot's seven passes, their bind groups built once (one uniform buffer a slot). */
  private readonly passes: { pipe: GPUComputePipeline; group: GPUBindGroup; x: number; y: number }[][] = [];
  private readonly args = new Float32Array(16);
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
    const h = this.disposer.track(device.createBuffer({ label: 'faraday height', size: n * n * 4, usage: store }));
    this.stiff = this.disposer.track(device.createBuffer({ label: 'faraday stiffness', size: 16, usage: store }));
    this.field = { h, n };
    for (let s = 0; s < FARADAY_SUBSTEPS; s++) {
      this.uni.push(this.disposer.track(device.createBuffer({ label: `faraday args ${s}`, size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })));
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
    const fft = pipe('faradayFft'), height = pipe('faradayHeight'), cubic = pipe('faradayCubic'), advance = pipe('faradayAdvance');
    const flat = Math.ceil((n * n) / 64);
    const at = (p: GPUComputePipeline, res: GPUBuffer[], x: number, y = 1) => ({ pipe: p, group: bindGroup(device, p, res), x, y });
    for (const uni of this.uni) {
      this.passes.push([
        at(fft, [uni, rowB, this.z], n), at(fft, [uni, colB, this.z], n),
        at(height, [uni, this.z, h, this.stiff], flat),
        at(cubic, [uni, h, this.z, this.stiff], n / 8, n / 8),
        at(fft, [uni, rowF, this.z], n), at(fft, [uni, colF, this.z], n),
        at(advance, [uni, this.z, this.spec, this.stiff], flat),
      ]);
    }
  }

  /**
   * One step of `seconds` on `enc`: the dish shaken at `shakeG` (its peak
   * acceleration in g, the Shake setting) and `hz` (the Shaker setting).
   */
  step(enc: GPUCommandEncoder, seconds: number, shakeG: number, hz: number): void {
    const total = Math.max(0, Math.min(0.1, Number.isFinite(seconds) ? seconds : 0));
    if (!(total > 0)) return;
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
    }
    const n = FARADAY_N;
    a[0] = n; a[1] = PLATE_METRES; a[2] = dt; a[3] = Math.log2(n);
    a[4] = FARADAY_G * Math.max(0, Math.min(FARADAY_SHAKE_MAX, Number.isFinite(shakeG) ? shakeG : 0));
    a[5] = f; a[6] = FARADAY_DEPTH; a[7] = FARADAY_NU; a[8] = FARADAY_G; a[9] = FARADAY_SIGMA / FARADAY_RHO;
    a[13] = FARADAY_NOISE; a[15] = 0;
    const pass = enc.beginComputePass({ label: 'faraday' });
    for (let s = 0; s < subs; s++) {
      // A 24-bit linear congruence in 32-bit integers: in doubles its product passes 2^53 and the sequence falls into a short cycle.
      this.seed = (Math.imul(this.seed, 1103515245) + 12345) & 0xffffff;
      a[14] = this.seed;
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
    e.clearBuffer(this.spec); e.clearBuffer(this.z); e.clearBuffer(this.field.h); e.clearBuffer(this.stiff);
    if (!enc) this.device.queue.submit([e.finish()]);
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
