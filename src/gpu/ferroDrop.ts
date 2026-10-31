/**
 * The ferrofluid drop's surface for the closeup (PLAN §29a): the solve in
 * wgsl/ferroDrop.ts, run by the plate's pack pass on the lead plate, and
 * handed to the display in the packed flow's third channel.
 *
 * It runs only while it can be seen: the closeup far enough in that the
 * camera draws the drops (dropCam, past 0.4 of the zoom's fade), Relief / 3D
 * up, ferrofluid on the plate. Otherwise the flow is packed as it always
 * was (packVel) and nothing here costs anything.
 *
 * What it costs when it runs, on 384²: a source pass (the magnets' field
 * once a cell), a one-workgroup mean, 24 Jacobi sweeps of five reads a cell
 * (warm, from last frame's surface), and the pack. About 18 million texel
 * reads a frame, a tenth of what one 1080p frame of the display reads.
 * From cold (the first frame in, or a regrid) it sweeps 200 times once,
 * which is what a still drop needs to stand up from flat to within a
 * percent of its height when l_c is 3.3 cells (512²): the slowest mode
 * shrinks by 4 / (4 + 1/L²) a sweep.
 */
import { Disposer, PipelineCache } from './kit';
import { groupOf } from './groupCache';
import { DROP_KERNELS } from './wgsl/ferroDrop';
import { SPIKE_ONSET, SPIKE_PITCH } from './wgsl/spikes';
import { MAGNET_RADIUS } from './wgsl/magnetDisc';
import { CHI0, LANGEVIN } from './standing';
import { DISH_GAP_METRES, DISH_METRES } from '../lib/turntable';

const LC_UV = SPIKE_PITCH / (2 * Math.PI);
/* The plate's gap at rest (lib/turntable.ts DISH_GAP_METRES, 2 mm: PLAN 38r), in l_c: the most a drop can stand before the top glass. */
const GAP_LC = DISH_GAP_METRES / DISH_METRES / LC_UV;
const WARM_SWEEPS = 24;
const COLD_SWEEPS = 200;
/*
  The contact angle from Relief / 3D: 0 flat, 1 a bead at 160°. Past 160°
  an oil drop on glass under water is rolling, not sitting.
*/
const MAX_ANGLE = (160 * Math.PI) / 180;

function langevin(x: number): number { return x < 1e-3 ? x / 3 : 1 / Math.tanh(Math.min(x, 20)) - 1 / x; }
/*
  The magnet's pull in the film's units at full share: standing.ts's PULL
  with PULL_SHARE 1 (its comment has why this is the whole of the Kelvin
  pressure, 0.50 per unit of ln(sinh ξ / ξ)). The film takes none of it on
  the plate; the picture's drop takes all of it.
*/
const PULL = (2 / langevin(SPIKE_ONSET / LANGEVIN) ** 2) * (1 + 1 / (1 + CHI0)) / (3 * CHI0);

/** The drop's height on a wide flat top, in l_c, at Relief / 3D `relief`: a large sessile drop's 2 sin(θ/2). */
export function dropPlateau(relief: number): number {
  const theta = Math.max(0, Math.min(1, relief)) * MAX_ANGLE;
  return 2 * Math.sin(theta / 2);
}

interface State {
  size: number;
  h: [GPUTexture, GPUTexture];
  src: GPUTexture;
  mean: GPUBuffer;
  args: GPUBuffer;
  warm: boolean;
}

export class FerroDrop {
  private state: State | null = null;
  private ready = false;
  private building: Promise<void> | null = null;

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, private readonly disposer: Disposer) {}

  /** The kernels, built behind the show the first time the closeup asks (as the standing film's are). */
  prepare(): Promise<void> {
    if (!this.ready && !this.building) {
      this.building = (async () => {
        for (const [name, code] of Object.entries(DROP_KERNELS)) await this.pipelines.prepareCompute(name, code);
        this.ready = true;
      })();
    }
    return this.building ?? Promise.resolve();
  }

  /** Whether the closeup is in far enough, with relief and ferrofluid, for the drop to be seen. */
  static wanted(macroOn: number, relief: number, phaseAmount: number): boolean {
    return macroOn > 0.4 && relief > 0.005 && phaseAmount > 0.002;
  }

  /** Forget the surface, so the next frame stands it up from cold. */
  cool(): void { if (this.state) this.state.warm = false; }

  private ensure(size: number): State {
    if (this.state && this.state.size === size) return this.state;
    if (this.state) {
      for (const t of [...this.state.h, this.state.src]) this.disposer.release(t);
      for (const b of [this.state.mean, this.state.args]) this.disposer.release(b);
    }
    const tex = (label: string, format: GPUTextureFormat) => this.disposer.track(this.device.createTexture({
      label, size: [size, size], format, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    this.state = {
      size,
      h: [tex('drop height a', 'r32float'), tex('drop height b', 'r32float')],
      src: tex('drop source', 'rg32float'),
      mean: this.disposer.track(this.device.createBuffer({ label: 'drop mean', size: 8, usage: GPUBufferUsage.STORAGE })),
      args: this.disposer.track(this.device.createBuffer({ label: 'drop args', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })),
      warm: false,
    };
    return this.state;
  }

  /**
   * Solve the surface into the pass, and return the texture holding it, or
   * null if the kernels are not built yet (the caller packs the flow as
   * before). `magnets` is the plate's uniform of four (x, y, height,
   * strength), as the display draws them.
   */
  solve(pass: GPUComputePassEncoder, view: GPUTexture, relief: number, magnets: number[]): GPUTexture | null {
    if (!this.ready) { void this.prepare(); return null; }
    const pipes = (Object.keys(DROP_KERNELS) as (keyof typeof DROP_KERNELS)[]).map((k) => this.pipelines.computePipeline(k, DROP_KERNELS[k]));
    if (pipes.some((p) => !p)) return null;
    const [source, mean, relax] = pipes as GPUComputePipeline[];
    const n = view.width;
    const s = this.ensure(n);
    const args = new Float32Array(24);
    args.set([n, LC_UV * n, dropPlateau(relief), PULL, LANGEVIN, 0.95 * GAP_LC, MAGNET_RADIUS, 0]);
    args.set(magnets.slice(0, 16), 8);
    this.device.queue.writeBuffer(s.args, 0, args);
    const groups = Math.ceil(n / 8);
    pass.setPipeline(source);
    pass.setBindGroup(0, groupOf(this.device, source, [s.args, view, s.src]));
    pass.dispatchWorkgroups(groups, groups);
    pass.setPipeline(mean);
    pass.setBindGroup(0, groupOf(this.device, mean, [s.args, s.src, s.mean]));
    pass.dispatchWorkgroups(1);
    pass.setPipeline(relax);
    const ab = groupOf(this.device, relax, [s.args, s.src, s.mean, s.h[0], s.h[1]]);
    const ba = groupOf(this.device, relax, [s.args, s.src, s.mean, s.h[1], s.h[0]]);
    // An even count, so the surface ends where it started (h[0]) and the next frame warm-starts from it.
    const sweeps = s.warm ? WARM_SWEEPS : COLD_SWEEPS;
    for (let k = 0; k < sweeps; k++) {
      pass.setBindGroup(0, k % 2 === 0 ? ab : ba);
      pass.dispatchWorkgroups(groups, groups);
    }
    s.warm = true;
    return s.h[0];
  }

  /** The last surface solved, in l_c, row by row (for `npm run ferrodrop`), or null if none has been. */
  async read(): Promise<{ n: number; h: Float32Array } | null> {
    const s = this.state;
    if (!s || !s.warm) return null;
    const n = s.size;
    const row = Math.ceil((n * 4) / 256) * 256;
    const buf = this.device.createBuffer({ size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: s.h[0] }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Float32Array(buf.getMappedRange());
    const h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) h.set(src.subarray((y * row) / 4, (y * row) / 4 + n), y * n);
    buf.unmap(); buf.destroy();
    return { n, h };
  }
}
