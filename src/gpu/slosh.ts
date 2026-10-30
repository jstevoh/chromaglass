import { SLOSH_KERNELS, type SloshKernel } from './wgsl/slosh';
import { Disposer, FIELD_USAGE, PipelineCache, type Prep } from './kit';
import { groupOf } from './groupCache';
import {
  SLOSH_N, SLOSH_G, SLOSH_REST_DEPTH, SLOSH_LENS, SLOSH_OIL_DENSITY, SLOSH_OIL_NU, SLOSH_PRESSES,
  sloshSteps, type SloshPress,
} from '../lib/slosh';

/**
 * The slosh dish on the GPU (PLAN 18a-13a, 18a-13d): `SloshDish`'s scheme
 * (src/lib/slosh.ts, where the physics is) in the kernels of wgsl/slosh.ts,
 * stepped on the solver's own command encoder before its step, so the flow it
 * hands `addSlosh` and the depth it hands the plate are this frame's.
 *
 * Nothing here is read back. The CPU decides when the dish is live from what
 * it is given (a tilt, a press) and from how long its drag takes to bring a
 * ring down after the last of them (`SloshDrive`, lib/slosh.ts's caller in the
 * visualizer), and lays it level again when that time is up.
 */
const RGBA32: GPUTextureFormat = 'rgba32float';
const WG = 8;

export class WebGPUSlosh {
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  /** The water (h − h₀, qx, qy, 0: the depth's departure from rest, wgsl/slosh.ts) and the oil (ox, oy, h₁, 0), three copies each: the step's start, the first stage, the second. */
  private readonly W: GPUTexture[];
  private readonly O: GPUTexture[];
  private cur = 0;
  /** The two layers' velocities for `addSlosh` (water xy, oil zw). */
  readonly flow: GPUTexture;
  /** The depth of both layers over the rest depth (red) and the oil's share (green), for the plate. */
  readonly depth: GPUTexture;
  /** One uniform block per stage; the oil, rest and out passes read the first. */
  private readonly uni: [GPUBuffer, GPUBuffer];
  private readonly data = new Float32Array(12 + 4 * SLOSH_PRESSES);
  private disposed = false;

  static prepare(device: GPUDevice): Prep[] {
    const cache = PipelineCache.for(device, 'slosh');
    // Behind the show: nothing sloshes in an opening's first steps (the dial is a hand's, at 0 on every look).
    return (Object.keys(SLOSH_KERNELS) as SloshKernel[]).map((k) => cache.computePrep(k, SLOSH_KERNELS[k], true));
  }

  constructor(private readonly device: GPUDevice, readonly n = SLOSH_N) {
    this.pipelines = PipelineCache.for(device, 'slosh');
    const tex = (label: string) => this.disposer.track(device.createTexture({ label, size: [n, n], format: RGBA32, usage: FIELD_USAGE }));
    this.W = [tex('slosh water 0'), tex('slosh water 1'), tex('slosh water 2')];
    this.O = [tex('slosh oil 0'), tex('slosh oil 1'), tex('slosh oil 2')];
    this.flow = tex('slosh flow');
    this.depth = tex('slosh depth');
    const ub = (label: string) => this.disposer.track(device.createBuffer({ label, size: this.data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.uni = [ub('slosh stage 1'), ub('slosh stage 2')];
  }

  /** The water as the step left it (its depth as the departure from rest), and the oil: for `npm run sloshgpu`. */
  get water(): GPUTexture { return this.W[this.cur]; }
  get oil(): GPUTexture { return this.O[this.cur]; }

  private pipe(k: SloshKernel): GPUComputePipeline | null {
    return this.pipelines.computePipeline(k, SLOSH_KERNELS[k]);
  }

  /** Whether every kernel is built: until then the dish waits, as the solver's other behind-the-show stages do. */
  ready(): boolean {
    return (Object.keys(SLOSH_KERNELS) as SloshKernel[]).every((k) => this.pipelines.hasCompute(k, SLOSH_KERNELS[k]));
  }

  private dispatch(pass: GPUComputePassEncoder, k: SloshKernel, res: (GPUBuffer | GPUTexture)[]): boolean {
    const p = this.pipe(k);
    if (!p) return false;
    pass.setPipeline(p);
    pass.setBindGroup(0, groupOf(this.device, p, res));
    pass.dispatchWorkgroups(Math.ceil(this.n / WG), Math.ceil(this.n / WG));
    return true;
  }

  /**
   * Advance the dish `seconds` (sloshSteps steps) under the tilt's acceleration,
   * the water's viscosity (plate widths² a second, `sloshNu`), the presses, and
   * the plate's oil (its mix texture and grid, or null). `level` lays it level
   * and still first, with the oil it now holds floating on it (the dish waking,
   * or put back to rest). Encoded as one compute pass on `enc`.
   */
  step(enc: GPUCommandEncoder, seconds: number, ax: number, ay: number, nu: number, presses: readonly SloshPress[],
    oil: { tex: GPUTexture; n: number } | null, level: boolean, timing?: GPUComputePassTimestampWrites): void {
    if (this.disposed) return;
    const subs = sloshSteps(seconds);
    const dt = seconds / subs;
    const d = this.data;
    d.fill(0);
    d[0] = dt; d[1] = Number.isFinite(ax) ? ax : 0; d[2] = Number.isFinite(ay) ? ay : 0;
    d[4] = SLOSH_G; d[5] = SLOSH_OIL_DENSITY; d[6] = Math.max(0, nu); d[7] = SLOSH_OIL_DENSITY * SLOSH_OIL_NU;
    d[8] = this.n; d[9] = SLOSH_REST_DEPTH; d[10] = SLOSH_LENS; d[11] = oil ? oil.n : 0;
    for (let s = 0; s < SLOSH_PRESSES; s++) {
      const p = presses[s];
      if (p && p.depth > 0 && p.radius > 0) d.set([p.x, p.y, p.radius, p.depth], 12 + s * 4);
    }
    d[3] = 1;
    this.device.queue.writeBuffer(this.uni[0], 0, d);
    d[3] = 2;
    this.device.queue.writeBuffer(this.uni[1], 0, d);

    const pass = enc.beginComputePass({ label: 'slosh', timestampWrites: timing });
    const [u1, u2] = this.uni;
    const next = () => (this.cur + 1) % 3;
    // The oil read from the plate, the water carried alongside. With no oil the depth texture stands in for the mix, and is not read (S.c.w is 0).
    this.dispatch(pass, 'sloshOil', [u1, this.W[this.cur], this.O[this.cur], oil ? oil.tex : this.depth, this.W[next()], this.O[next()]]);
    this.cur = next();
    if (level) {
      this.dispatch(pass, 'sloshRest', [u1, this.O[this.cur], this.W[next()], this.O[next()]]);
      this.cur = next();
    }
    for (let s = 0; s < subs; s++) {
      const b0 = this.cur, b1 = (this.cur + 1) % 3, b2 = (this.cur + 2) % 3;
      this.dispatch(pass, 'sloshStep', [u1, this.W[b0], this.O[b0], this.W[b0], this.O[b0], this.W[b1], this.O[b1]]);
      this.dispatch(pass, 'sloshStep', [u2, this.W[b1], this.O[b1], this.W[b0], this.O[b0], this.W[b2], this.O[b2]]);
      this.cur = b2;
    }
    this.dispatch(pass, 'sloshOut', [u1, this.W[this.cur], this.O[this.cur], this.flow, this.depth]);
    pass.end();
  }

  dispose(): void {
    this.disposed = true;
    this.disposer.dispose();
  }
}
