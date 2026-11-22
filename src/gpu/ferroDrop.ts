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
import { DROP_KERNELS, gapLc } from './wgsl/ferroDrop';
import { SPIKE_PITCH } from './wgsl/spikes';
import { LIFT_ONSET } from './wgsl/standing';
import { MAGNET_RADIUS } from './wgsl/magnetDisc';
import { CHI0, LANGEVIN } from './standing';
import { DISH_REST_GAP } from '../lib/turntable';

const LC_UV = SPIKE_PITCH / (2 * Math.PI);
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
const PULL = (2 / langevin(LIFT_ONSET) ** 2) * (1 + 1 / (1 + CHI0)) / (3 * CHI0);

/** The drop's height on a wide flat top, in l_c, at Relief / 3D `relief`: a large sessile drop's 2 sin(θ/2). */
export function dropPlateau(relief: number): number {
  const theta = Math.max(0, Math.min(1, relief)) * MAX_ANGLE;
  return 2 * Math.sin(theta / 2);
}

function f16(u: number): number {
  const s = u & 0x8000 ? -1 : 1;
  const e = (u >> 10) & 0x1f;
  const m = u & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (m / 1024);
  if (e === 0x1f) return m ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + m / 1024);
}

interface Level {
  n: number;
  phi: GPUBuffer;
  rhs: GPUBuffer;
  sorArgs: [GPUBuffer, GPUBuffer];
  gsArgs?: [GPUBuffer, GPUBuffer];
  gridArgs?: GPUBuffer;
  sweeps: number;
}

interface State {
  size: number;
  h: [GPUTexture, GPUTexture];
  spread: GPUTexture;
  src: GPUTexture;
  mean: GPUBuffer;
  args: GPUBuffer;
  levels: Level[];
  warm: boolean;
}

export class FerroDrop {
  private state: State | null = null;
  private velTex: GPUTexture | null = null;
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

  /** Record the packed flow texture that `packVelDrop` wrote this frame, for `read()`. */
  notePackedVel(vel: GPUTexture): void { this.velTex = vel; }

  private ensure(size: number): State {
    if (this.state && this.state.size === size) return this.state;
    if (this.state) {
      for (const t of [...this.state.h, this.state.spread, this.state.src]) this.disposer.release(t);
      for (const b of [this.state.mean, this.state.args]) this.disposer.release(b);
      for (const l of this.state.levels) {
        for (const b of [l.phi, l.rhs, ...l.sorArgs, ...(l.gsArgs ?? []), ...(l.gridArgs ? [l.gridArgs] : [])]) this.disposer.release(b);
      }
    }
    const tex = (label: string, format: GPUTextureFormat) => this.disposer.track(this.device.createTexture({
      label, size: [size, size], format, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    const sorUniform = (n: number, parity: number, w: number) => {
      const buf = this.disposer.track(this.device.createBuffer({ label: `drop sor ${n} ${parity}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      const data = new ArrayBuffer(16);
      new Uint32Array(data, 0, 2).set([n, parity]);
      new Float32Array(data, 8, 1).set([w]);
      this.device.queue.writeBuffer(buf, 0, data);
      return buf;
    };
    const dims: number[] = [];
    let cur = size;
    while (dims.length < 5) {
      dims.push(cur);
      if (cur % 2 === 0 && cur >= 32) cur >>= 1;
      else break;
    }
    const omegas = [1.50, 1.55, 1.60, 1.65];
    const sweepCounts = [24, 20, 24, 28];
    const levels: Level[] = dims.map((n, idx) => {
      const coarsest = idx === dims.length - 1;
      const w = coarsest ? 1.65 : omegas[Math.min(idx, omegas.length - 1)];
      const sweeps = coarsest ? 48 : sweepCounts[Math.min(idx, sweepCounts.length - 1)];
      const lvl: Level = {
        n,
        phi: this.disposer.track(this.device.createBuffer({ label: `drop phi ${n}`, size: n * n * 4, usage: GPUBufferUsage.STORAGE })),
        rhs: this.disposer.track(this.device.createBuffer({ label: `drop rhs ${n}`, size: n * n * 4, usage: GPUBufferUsage.STORAGE })),
        sorArgs: [sorUniform(n, 0, w), sorUniform(n, 1, w)],
        sweeps,
      };
      if (idx === 0) lvl.gsArgs = [sorUniform(n, 0, 1.0), sorUniform(n, 1, 1.0)];
      if (idx > 0) {
        const gb = this.disposer.track(this.device.createBuffer({ label: `drop grid ${dims[idx - 1]}->${n}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
        this.device.queue.writeBuffer(gb, 0, new Uint32Array([dims[idx - 1], n, 0, 0]));
        lvl.gridArgs = gb;
      }
      return lvl;
    });
    this.state = {
      size,
      h: [tex('drop height a', 'r32float'), tex('drop height b', 'r32float')],
      spread: tex('drop spread', 'r32float'),
      src: tex('drop source', 'rg32float'),
      mean: this.disposer.track(this.device.createBuffer({ label: 'drop mean', size: 8, usage: GPUBufferUsage.STORAGE })),
      args: this.disposer.track(this.device.createBuffer({ label: 'drop args', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })),
      levels,
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
  solve(pass: GPUComputePassEncoder, view: GPUTexture, relief: number, magnets: number[], gapMetres?: number): GPUTexture | null {
    if (!this.ready) { void this.prepare(); return null; }
    const pipes = (Object.keys(DROP_KERNELS) as (keyof typeof DROP_KERNELS)[]).map((k) => this.pipelines.computePipeline(k, DROP_KERNELS[k]));
    if (pipes.some((p) => !p)) return null;
    const [source, mean, relax, rhsPipe, downPipe, sorPipe, upPipe, squeezePipe] = pipes as GPUComputePipeline[];
    const n = view.width;
    const s = this.ensure(n);
    const args = new Float32Array(24);
    const lc = gapLc(gapMetres);
    args.set([n, LC_UV * n, dropPlateau(relief), PULL, LANGEVIN, 0.95 * lc, MAGNET_RADIUS, lc / DISH_REST_GAP]);
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

    // Squeeze any excess above the live gap out to neighbours conservatively via FMG Red-Black SOR.
    const L = s.levels;
    pass.setPipeline(rhsPipe);
    pass.setBindGroup(0, groupOf(this.device, rhsPipe, [s.args, s.h[0], view, L[0].rhs, L[0].phi]));
    pass.dispatchWorkgroups(groups, groups);
    for (let l = 0; l < L.length - 1; l++) {
      const c = L[l + 1];
      const cg = Math.ceil(c.n / 8);
      pass.setPipeline(downPipe);
      pass.setBindGroup(0, groupOf(this.device, downPipe, [c.gridArgs!, L[l].rhs, c.rhs, c.phi]));
      pass.dispatchWorkgroups(cg, cg);
    }
    const runSor = (lvl: Level, sorUniforms: [GPUBuffer, GPUBuffer], count: number) => {
      const gx = Math.ceil(Math.ceil(lvl.n / 2) / 8);
      const gy = Math.ceil(lvl.n / 8);
      pass.setPipeline(sorPipe);
      const g0 = groupOf(this.device, sorPipe, [sorUniforms[0], lvl.rhs, lvl.phi]);
      const g1 = groupOf(this.device, sorPipe, [sorUniforms[1], lvl.rhs, lvl.phi]);
      for (let k = 0; k < count; k++) {
        pass.setBindGroup(0, g0);
        pass.dispatchWorkgroups(gx, gy);
        pass.setBindGroup(0, g1);
        pass.dispatchWorkgroups(gx, gy);
      }
    };
    runSor(L[L.length - 1], L[L.length - 1].sorArgs, L[L.length - 1].sweeps);
    for (let l = L.length - 2; l >= 0; l--) {
      const f = L[l];
      const fg = Math.ceil(f.n / 8);
      pass.setPipeline(upPipe);
      pass.setBindGroup(0, groupOf(this.device, upPipe, [L[l + 1].gridArgs!, L[l + 1].phi, f.phi]));
      pass.dispatchWorkgroups(fg, fg);
      runSor(f, f.sorArgs, f.sweeps);
    }
    if (L[0].gsArgs) runSor(L[0], L[0].gsArgs, 4);
    pass.setPipeline(squeezePipe);
    pass.setBindGroup(0, groupOf(this.device, squeezePipe, [s.args, s.h[0], L[0].phi, s.spread]));
    pass.dispatchWorkgroups(groups, groups);

    s.warm = true;
    return s.spread;
  }

  /** The last surface solved, in l_c, row by row (for `npm run ferrodrop`), or null if none has been. */
  async read(): Promise<{ n: number; h: Float32Array; z: Float32Array } | null> {
    const s = this.state;
    if (!s || !s.warm) return null;
    const n = s.size;
    const rowH = Math.ceil((n * 4) / 256) * 256;
    const bufH = this.device.createBuffer({ size: rowH * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const hasVel = !!this.velTex && this.velTex.width === n && this.velTex.height === n;
    const rowZ = Math.ceil((n * 8) / 256) * 256;
    const bufZ = hasVel ? this.device.createBuffer({ size: rowZ * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: s.spread }, { buffer: bufH, bytesPerRow: rowH }, [n, n]);
    if (bufZ && this.velTex) enc.copyTextureToBuffer({ texture: this.velTex }, { buffer: bufZ, bytesPerRow: rowZ }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await bufH.mapAsync(GPUMapMode.READ);
    const srcH = new Float32Array(bufH.getMappedRange());
    const h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) h.set(srcH.subarray((y * rowH) / 4, (y * rowH) / 4 + n), y * n);
    bufH.unmap(); bufH.destroy();
    const z = new Float32Array(n * n);
    if (bufZ) {
      await bufZ.mapAsync(GPUMapMode.READ);
      const srcZ = new Uint16Array(bufZ.getMappedRange());
      for (let y = 0; y < n; y++) {
        const base = (y * rowZ) / 2;
        for (let x = 0; x < n; x++) z[y * n + x] = f16(srcZ[base + x * 4 + 2]);
      }
      bufZ.unmap(); bufZ.destroy();
    } else {
      z.set(h);
    }
    return { n, h, z };
  }
}
