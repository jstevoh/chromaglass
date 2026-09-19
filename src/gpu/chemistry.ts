/**
 * The reaction on the GPU (docs/webgpu-plan.md, P2), twin of
 * `lib/chemistry.ts`. See `wgsl/chem.ts` for the kernels.
 *
 * The field lives here; the dye it deposits is added by the solver, which
 * owns the dye texture (`WebGPUFluid.depositChemistry`).
 */

import { Disposer, PingPong, PipelineCache, bindGroup, readTextureF32 } from './kit';
import { CHEM_KERNELS } from './wgsl/chem';

/** How many seeds one frame may drop. The show drops at most one. */
const SEED_SLOTS = 4;

export class WebGPUChemistry {
  private readonly disposer = new Disposer();
  private readonly field: PingPong;
  private readonly groups = new Map<string, GPUBindGroup>();
  private readonly uniforms: GPUBuffer[] = [];
  private readonly scratch = new Float32Array(8);
  private slot = 0;
  private feed = 0.042;
  private kill = 0.062;

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, readonly size: number) {
    this.field = new PingPong(device, this.disposer, [size, size], 'rg32float', 'chemistry');
    for (let i = 0; i < SEED_SLOTS + 2; i++) {
      this.uniforms.push(this.disposer.track(device.createBuffer({
        label: `chem uniform ${i}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })));
    }
    const enc = device.createCommandEncoder({ label: 'chemistry reset' });
    const pass = enc.beginComputePass({ label: 'chemistry reset' });
    this.reset(pass);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  /** The live field: substrate in r, activator in g. */
  get texture(): GPUTexture { return this.field.read; }

  /**
   * The uniform for one dispatch. Each dispatch in a frame needs its own
   * buffer: a queue write lands between submissions, not between dispatches.
   */
  private uniform(seed: [number, number, number]): GPUBuffer {
    const buf = this.uniforms[this.slot];
    this.slot = (this.slot + 1) % this.uniforms.length;
    const v = this.scratch;
    v[0] = this.size; v[1] = this.feed; v[2] = this.kill; v[3] = 0;
    v[4] = seed[0]; v[5] = seed[1]; v[6] = seed[2]; v[7] = 0;
    this.device.queue.writeBuffer(buf, 0, v);
    return buf;
  }

  private run(pass: GPUComputePassEncoder, name: string, uniform: GPUBuffer, reads: GPUTexture[], dst: GPUTexture): void {
    const pipe = this.pipelines.computePipeline(name, CHEM_KERNELS[name]);
    const key = `${name}:${uniform.label}:${reads.map((r) => r.label).join(',')}:${dst.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [uniform, ...reads, dst]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.size / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /** Substrate everywhere. The caller seeds it afterwards. */
  reset(pass: GPUComputePassEncoder): void {
    this.run(pass, 'chemFill', this.uniform([0, 0, 1]), [], this.field.write);
    this.field.swap();
  }

  /** A drop of activator, in normalised plate coordinates. */
  seed(pass: GPUComputePassEncoder, nx: number, ny: number, radius: number): void {
    const cx = Math.round(nx * this.size), cy = Math.round(ny * this.size);
    this.run(pass, 'chemSeed', this.uniform([cx, cy, Math.max(0.5, radius)]), [this.field.read], this.field.write);
    this.field.swap();
  }

  /**
   * Run the reaction. `feed`/`kill` choose the regime, as on the CPU: around
   * 0.055 / 0.062 grows coral, 0.037 / 0.065 divides like cells.
   */
  step(pass: GPUComputePassEncoder, iters: number, feed = 0.042, kill = 0.062): void {
    this.feed = feed;
    this.kill = kill;
    const u = this.uniform([0, 0, 1]);
    for (let i = 0; i < Math.max(0, iters); i++) {
      this.run(pass, 'chemStep', u, [this.field.read], this.field.write);
      this.field.swap();
    }
  }

  /** The field as (substrate, activator) pairs. For the harness, not the show. */
  read(): Promise<Float32Array> { return readTextureF32(this.device, this.field.read, 2); }

  dispose(): void {
    this.groups.clear();
    this.disposer.dispose();
  }
}
