/**
 * The solver on WebGPU (docs/webgpu-plan.md, P2): the same scheme as
 * `lib/gpuFluid.ts`, as compute passes over storage textures.
 *
 * It keeps that class's shape — `applyDeltas`, `step`, `readbackAsync`,
 * `drainStep`, `clear` — so the CPU side above it does not know which engine
 * is under it, and so `npm run parity` can run one step through both and
 * compare the fields.
 *
 * What is the same: the physics, pass for pass (see `wgsl/fluid.ts`), the
 * logical 192² grid the CPU writes and reads, and the order of a step.
 *
 * What is different:
 * - Compute dispatches, so a step is one command buffer rather than 88 draws.
 * - The fields WebGL held as 16-bit floats and WebGPU cannot store to
 *   (pressure, divergence, the plate gap) are 32-bit here. That is more
 *   precision, not less.
 * - The deltas are full-resolution fields. The CPU can still fill them from
 *   its 192² arrays (`applyDeltas`, which upsamples on the way in), but a
 *   pour is better given as splats (`applySplats`), which are laid down at
 *   the plate's own resolution and never cross the bus.
 */

import { Disposer, GpuProfiler, PingPong, PipelineCache, ReadbackRing, bindGroup } from './kit';
import { kernel } from './wgsl/fluid';
import { splatKernel } from './wgsl/splat';
import { STATS_GROUPS, STATS_KERNELS } from './wgsl/stats';
import { SPLAT_FLOATS, type SplatList } from './splats';
import type { GpuStepParams } from './solverTypes';
import { WebGPUParticles } from './particles';
import { WebGPUAir } from './air';

/*
  How many bubbles the air field has room for.

  `MAX_BUBBLES` in `lib/bubbles.ts` is 40 today, and that cap exists because
  the compositor looped over them per pixel. The field does not care — the
  splat costs the area the discs cover — so this is sized for where H6 is
  going rather than for where the list is now, and raising the list's cap
  needs nothing here.
*/
const AIR_CAPACITY = 512;

/** What the app used to scan the whole field for (see `measure`). */
export interface FieldStats {
  /** Dye per cell, averaged over the plate. */
  meanDensity: number;
  /** The plate's average absorption, channel by channel. */
  meanColor: [number, number, number];
  /** The thickest cell — "is there anything on the plate". */
  maxDensity: number;
  maxVx: number;
  maxVy: number;
  /** The fastest flow anywhere, for the macro detail pass. */
  maxSpeed: number;
  /** Which copy these numbers came from; it rises as fresh ones land. */
  at: number;
}

/**
 * Red-black Gauss-Seidel sweeps in the projection (H2).
 *
 * Twelve where there were twenty-four Jacobi passes, because Gauss-Seidel
 * converges about twice as fast per unit of arithmetic and a sweep is two
 * half-grid dispatches — the same work as one Jacobi pass. The residual
 * after twelve sweeps is measured against the residual after twenty-four
 * Jacobi passes by `chromaglassDebug().webgpu.pressureSelfTest()`, which is
 * the only honest way to claim the two are equivalent.
 */
const PRESSURE_SWEEPS = 12;
const CURRENT_ITERS = 10;
const SQUEEZE_SWEEPS = 5;
const VISC_ITERS = 4;
const DYE_ITERS = 4;
/** The CPU solver's hard speed limit, in plate units per unit time. */
const MAX_SPEED = 0.002;
const GRAIN_PERIOD = 6;

const VEL = 'rgba16float';
const R32 = 'r32float';
const RG32 = 'rg32float';
const RGBA32 = 'rgba32float';

/** The Sim uniform, laid out as WGSL sees it (see SIM_STRUCT). */
const SIM_FLOATS = 36;      // 33 used, rounded up for the uniform's 16-byte tail

export class WebGPUFluid {
  readonly N: number;
  readonly L: number;
  private readonly M: number;
  private readonly disposer = new Disposer();
  private readonly pipelines: PipelineCache;
  private readonly groups = new Map<string, GPUBindGroup>();
  private readonly dyeFormat: GPUTextureFormat;

  private readonly dye: PingPong;
  private readonly vel: PingPong;
  private readonly squeeze: PingPong;
  /** The plate shape the gap was last laid at; a change re-seeds it. */
  private lastCurve: number | null = null;
  private readonly phase: PingPong;
  /**
   * The pressure, in a storage buffer rather than a texture (H2).
   *
   * Red-black Gauss-Seidel updates a cell in place, and a shader cannot
   * write a texture it is also reading — read-write storage textures need a
   * language extension that is not broadly available. A storage buffer can,
   * everywhere, and the pressure is a single scalar per cell, so nothing is
   * lost by keeping it as one.
   */
  private readonly press: GPUBuffer;
  /** The squeeze film's pressure, packed as two colour planes like `press`. */
  private readonly spress: GPUBuffer;
  private readonly cur: PingPong;
  private readonly curP: PingPong;
  private readonly grain: PingPong | null;
  private readonly div: GPUTexture;
  private readonly curDiv: GPUTexture;
  private readonly velForced: GPUTexture;
  private readonly scratchA: GPUTexture;
  private readonly scratchB: GPUTexture;
  private readonly readTarget: GPUTexture;
  private readonly deltaDyeTex: GPUTexture;
  private readonly deltaVelTex: GPUTexture;
  private readonly deltaMulTex: GPUTexture;
  private readonly cpuDyeTex: GPUTexture;
  private readonly cpuVelTex: GPUTexture;
  private readonly cpuMulTex: GPUTexture;
  private splatBuf: GPUBuffer | null = null;
  private readonly splatArgs: GPUBuffer;
  private readonly statsArgs: GPUBuffer;
  private readonly statsPartials: GPUBuffer;
  private readonly statsResult: GPUBuffer;
  private readonly statsRing: ReadbackRing;
  private statsFresh = false;
  private statsLatest: FieldStats = { meanDensity: 0, meanColor: [0, 0, 0], maxDensity: 0, maxSpeed: 0, maxVx: 0, maxVy: 0, at: -1 };

  private readonly sim: GPUBuffer;
  private readonly simData = new ArrayBuffer(SIM_FLOATS * 4);
  private readonly simF = new Float32Array(this.simData);
  private readonly simI = new Int32Array(this.simData);
  /** One small uniform for each call site that needs its own numbers within a step. */
  private readonly args = new Map<string, GPUBuffer>();
  private readonly sampler: GPUSampler;

  private readonly rbRow: number;
  private readonly rbStaging: { dye: GPUBuffer; vel: GPUBuffer };
  private readonly rbRings: { dye: ReadbackRing; vel: ReadbackRing };
  private readonly rbDye: Float32Array;
  private readonly rbVel: Float32Array;

  private grainAge = 0;
  private disposed = false;
  /** Per-pass GPU times under ?debug. */
  readonly profiler: GpuProfiler;
  /**
   * Time a step stage by stage instead of as one number (H0).
   *
   * A step is one compute pass carrying one timestamp pair, so what comes
   * back is 9 ms for about a hundred dispatches and no way to tell which of
   * them it is. `timestampWrites` is per pass, so the only way to ask is to
   * open a pass per stage — which costs a little, and is why this is off
   * unless something asks for it (`?stages`, or
   * `chromaglassDebug().webgpu.stageTimings(true)`).
   *
   * Splitting is safe: WebGPU orders dispatches within a pass and between
   * passes alike, so the same work happens in the same order either way.
   * What changes is about a dozen pass boundaries per step, which is what
   * makes the total under this flag a little higher than the real one — read
   * the shares, not the sum.
   */
  stageTimings = false;
  /**
   * Dye carried by particles (H1, `gpu/particles.ts`), or null until a step
   * asks for some. Built on demand and released when the amount goes back to
   * 0: a population at this grid is several megabytes, and every look made
   * before H1 wants none of it.
   */
  private particles: WebGPUParticles | null = null;
  /** The air field (H6): where the bubbles are, so the dye can be taken out of it. */
  private air: WebGPUAir | null = null;
  /** How hard the arriving air pushes the liquid aside (H6); 0 switches it off. */
  private airPush = 0;
  /** Whether any of the second phase is on the plate; nothing runs without it. */
  private phaseLive = false;
  /** For the harness: whether the phase stage is running at all. */
  get phaseIsLive(): boolean { return this.phaseLive; }
  private airCover = 0;
  /*
    Last frame's coverage, so the rate term can be made zero-mean.

    The standing term has the plate's air fraction subtracted because a
    Neumann problem whose source does not average to zero has no solution for
    the projection to find — the condition pressureSelfTest exists to
    protect. The rate term never had the same treatment, and it is the
    suspect for why pushing the air source harder has bought so little: a
    hundred times the strength moved the interior from 0.67 to 0.62.
  */
  private airCoverPrev = 0;
  /** The plate's mean of the press source, so the projection has a solution. */
  private squeezeMean = 0;
  /** How much of a press reaches the flow, from the look's plate pressure. */
  private squeezeGain = 0;
  private lastDt = 1 / 60;

  constructor(private readonly device: GPUDevice, physicalSize: number, logicalSize: number, opts: { float32Filterable: boolean; timestamps?: boolean }) {
    this.N = physicalSize;
    this.L = logicalSize;
    this.M = Math.max(32, Math.round(physicalSize / 2));
    this.pipelines = new PipelineCache(device);
    this.profiler = new GpuProfiler(device, this.disposer, !!opts.timestamps);
    // As WebGL: the dye is a 32-bit float where one can be filtered, because
    // it is written several times a step and a half float loses a part in a
    // thousand each time. Velocity stays half.
    this.dyeFormat = opts.float32Filterable ? RGBA32 : VEL;

    const pp = (size: number, format: GPUTextureFormat, label: string) => new PingPong(device, this.disposer, [size, size], format, label);
    const tex = (size: number, format: GPUTextureFormat, label: string) => this.disposer.track(device.createTexture({
      label, size: [size, size], format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    }));

    this.dye = pp(this.N, this.dyeFormat, 'dye');
    this.vel = pp(this.N, VEL, 'vel');
    this.squeeze = pp(this.N, RG32, 'squeeze');
    /*
      The second phase (H7): one number a cell, how much of the dark liquid is
      there.

      R32 and not R16, because a compute pass writes it — single-channel
      16-bit float is not in WebGPU's core storage formats, and asking for one
      rejects the whole command buffer and freezes the plate. The air field
      next door is r16float for the opposite reason: it blends, and 32-bit
      floats do not.
    */
    this.phase = pp(this.N, R32, 'phase');
    this.press = this.disposer.track(device.createBuffer({
      label: 'pressure',
      size: this.N * this.N * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    }));
    this.spress = this.disposer.track(device.createBuffer({
      label: 'squeeze pressure',
      size: this.N * this.N * 4,
      usage: GPUBufferUsage.STORAGE,
    }));
    this.cur = pp(this.M, VEL, 'current');
    this.curP = pp(this.M, R32, 'current pressure');
    this.grain = opts.float32Filterable ? pp(this.N, RGBA32, 'grain') : null;
    this.div = tex(this.N, R32, 'divergence');
    this.curDiv = tex(this.M, R32, 'current divergence');
    this.velForced = tex(this.N, VEL, 'forced velocity');
    this.scratchA = tex(this.N, this.dyeFormat, 'scratch a');
    this.scratchB = tex(this.N, this.dyeFormat, 'scratch b');
    this.readTarget = tex(this.L, RGBA32, 'readback');
    this.deltaDyeTex = tex(this.N, RGBA32, 'dye delta');
    this.deltaVelTex = tex(this.N, RGBA32, 'velocity delta');
    this.deltaMulTex = tex(this.N, R32, 'dye multiplier');
    this.cpuDyeTex = tex(this.L, RGBA32, 'dye delta (cpu)');
    this.cpuVelTex = tex(this.L, RGBA32, 'velocity delta (cpu)');
    this.cpuMulTex = tex(this.L, R32, 'dye multiplier (cpu)');

    this.sim = this.disposer.track(device.createBuffer({ label: 'sim', size: SIM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.splatArgs = this.disposer.track(device.createBuffer({ label: 'splat args', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.statsArgs = this.disposer.track(device.createBuffer({ label: 'stats args', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.statsPartials = this.disposer.track(device.createBuffer({ label: 'stats partials', size: STATS_GROUPS * 2 * 16, usage: GPUBufferUsage.STORAGE }));
    this.statsResult = this.disposer.track(device.createBuffer({ label: 'stats result', size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    this.statsRing = new ReadbackRing(device, this.disposer, 32, 2, 'stats');
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    this.rbDye = new Float32Array(this.L * this.L * 4);
    this.rbVel = new Float32Array(this.L * this.L * 4);
    this.rbRow = Math.ceil((this.L * 16) / 256) * 256;
    const bytes = this.rbRow * this.L;
    const staging = (label: string) => this.disposer.track(device.createBuffer({ label, size: bytes, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
    this.rbStaging = { dye: staging('readback dye'), vel: staging('readback vel') };
    this.rbRings = { dye: new ReadbackRing(device, this.disposer, bytes, 2, 'dye readback'), vel: new ReadbackRing(device, this.disposer, bytes, 2, 'vel readback') };

    this.clear();
  }

  // ── Plumbing ──────────────────────────────────────────────────────

  private arg(name: string, values: number[]): GPUBuffer {
    let buf = this.args.get(name);
    if (!buf) {
      buf = this.disposer.track(this.device.createBuffer({ label: `args ${name}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      this.args.set(name, buf);
    }
    const v = new Float32Array(8);
    v.set(values.slice(0, 8));
    this.device.queue.writeBuffer(buf, 0, v);
    return buf;
  }

  private pipeline(name: string, format: GPUTextureFormat): GPUComputePipeline {
    return this.pipelines.computePipeline(`${name}:${format}`, kernel(name, format));
  }

  /** A dispatch: the kernel, its args, the textures it reads, the one it writes, and a sampler if it wants one. */
  private run(
    pass: GPUComputePassEncoder,
    name: string,
    dst: GPUTexture,
    reads: (GPUTexture | GPUSampler)[],
    args: GPUBuffer,
    size = this.N,
  ): void {
    const pipe = this.pipeline(name, dst.format);
    const key = `${name}:${dst.format}:${dst.label}:${reads.map((r) => (r instanceof GPUTexture ? r.label : 'sampler')).join(',')}:${args.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...reads.filter((r) => r instanceof GPUTexture) as GPUTexture[], dst, ...reads.filter((r) => !(r instanceof GPUTexture)) as GPUSampler[]]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(size / 8);
    pass.dispatchWorkgroups(w, w);
  }

  private fill(pass: GPUComputePassEncoder, dst: GPUTexture, value: [number, number, number, number], size: number): void {
    this.run(pass, 'fill', dst, [], this.arg(`fill ${dst.label}`, [...value, size, size, 0, 0]), size);
  }

  private writeSim(p: GpuStepParams, disp: number): void {
    const f = this.simF, i = this.simI;
    f[0] = this.N; f[1] = this.L; f[2] = p.dt; f[3] = p.time; f[4] = disp; f[5] = p.visc;
    f[6] = p.turbScale; f[7] = p.spin; f[8] = p.immiscibility; f[9] = p.fingering;
    f[10] = p.vibIntensity; f[11] = p.vibFrequency; f[12] = p.drip; f[13] = p.air;
    f[14] = p.smearX; f[15] = p.smearY;
    f[16] = p.damping; f[17] = p.heatDecay; f[18] = MAX_SPEED; f[19] = p.evapFactor; f[20] = p.sharpness;
    i[21] = Math.max(1, Math.min(4, Math.round(p.turbDetail)));
    f[22] = p.currentDamp; f[23] = p.currentBuoy; f[24] = p.currentGrav; f[25] = p.twist;
    f[26] = p.meanDensity; f[27] = p.maxCurrent;
    f[28] = p.rockX; f[29] = p.rockY;
    f[30] = p.plateCurve; f[31] = p.gapSpring; f[32] = p.gapMemory;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
  }

  // ── The plate ─────────────────────────────────────────────────────

  /** Wipe the plate: no dye, no motion, the gap at rest. */
  clear(): void {
    const enc = this.device.createCommandEncoder({ label: 'clear' });
    const pass = enc.beginComputePass({ label: 'clear' });
    // The sim buffer only needs its grid sizes for a fill.
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    for (const t of [this.dye.a, this.dye.b, this.scratchA, this.scratchB]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    for (const t of [this.vel.a, this.vel.b, this.velForced]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.fill(pass, this.div, [0, 0, 0, 0], this.N);
    this.clearBuffer(pass, this.press, 'clear pressure');
    this.clearBuffer(pass, this.spress, 'clear squeeze pressure');
    // At the dome's own shape, not flat: a plate filled flat then sprung
    // toward the dome pumps its liquid inward until the two agree.
    for (const t of [this.squeeze.a, this.squeeze.b]) this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
    for (const t of [this.cur.a, this.cur.b]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    for (const t of [this.curP.a, this.curP.b, this.curDiv]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    if (this.grain) {
      // Identity coordinates: seedGrain with both phases reseeded. It reads the
      // other texture of the pair — a dispatch may not sample what it writes.
      const identity = this.arg('grain identity', [0, 0, 0, 0]);
      this.run(pass, 'seedGrain', this.grain.a, [this.grain.b], identity);
      this.run(pass, 'seedGrain', this.grain.b, [this.grain.a], identity);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.grainAge = 0;
  }

  /**
   * Fold the CPU-side deltas into the field. `dyeAdd` is L²×4 (R,G,B
   * absorption, density), `velAdd` is L²×4 (vx, vy, temp, gap), `dyeMul` is
   * L² (1 = no change).
   */
  applyDeltas(dyeAdd: Float32Array, velAdd: Float32Array, dyeMul: Float32Array, dt: number): void {
    const q = this.device.queue;
    /*
      What the press just did to the plate as a whole, so its source can be
      made zero-mean.

      A Neumann problem whose source does not average to zero has no solution
      for the projection to find — the condition `pressureSelfTest` exists to
      protect, and the same one the air's standing term already obeys. A press
      is a net source over the whole plate: liquid is pushed out from under the
      palm and nothing anywhere absorbs it. Left unbalanced, the solve spends
      itself on the imbalance and the press arrives as almost nothing, which is
      what it measured — 0.4% of the dye moved, for a press seventy-five times
      harder than the tool's own.

      The gap delta rides channel 3 of the velocity deltas (see `flushDeltas`),
      so the mean is a sum over what was just handed across, and the source it
      produces is that rate over a resting gap.
    */
    let gapSum = 0;
    for (let i = 3; i < velAdd.length; i += 4) gapSum += velAdd[i];
    const meanGap = gapSum / (this.L * this.L);
    this.squeezeMean = -(meanGap / Math.max(dt, 1e-4)) / 0.03;
    q.writeTexture({ texture: this.cpuDyeTex }, dyeAdd, { bytesPerRow: this.L * 16 }, [this.L, this.L]);
    q.writeTexture({ texture: this.cpuVelTex }, velAdd, { bytesPerRow: this.L * 16 }, [this.L, this.L]);
    q.writeTexture({ texture: this.cpuMulTex }, dyeMul, { bytesPerRow: this.L * 4 }, [this.L, this.L]);
    this.simF[0] = this.N; this.simF[1] = this.L; this.simF[2] = dt;
    q.writeBuffer(this.sim, 0, this.simData);
    this.writeSplatArgs(0);
    const enc = this.device.createCommandEncoder({ label: 'deltas' });
    const pass = enc.beginComputePass({ label: 'deltas' });
    // Onto the full grid, the same bilinear the delta passes used to do
    // themselves, so the two paths meet at one place.
    this.upsample(pass, this.cpuDyeTex, this.deltaDyeTex);
    this.upsample(pass, this.cpuVelTex, this.deltaVelTex);
    this.upsample(pass, this.cpuMulTex, this.deltaMulTex);
    this.foldDeltas(pass);
    pass.end();
    q.submit([enc.finish()]);
  }

  /**
   * Lay a frame's pours down at full resolution. The list is the app's
   * (`gpu/splats.ts`); nothing but the records crosses the bus.
   */
  applySplats(list: SplatList, dt: number): void {
    if (list.empty) return;
    const q = this.device.queue;
    const bytes = Math.max(64, list.count * SPLAT_FLOATS * 4);
    if (!this.splatBuf || this.splatBuf.size < bytes) {
      if (this.splatBuf) this.disposer.release(this.splatBuf);
      this.splatBuf = this.disposer.track(this.device.createBuffer({
        label: 'splats', size: Math.ceil(bytes * 1.5 / 256) * 256,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }));
      this.groups.clear();
    }
    q.writeBuffer(this.splatBuf, 0, list.records);
    this.simF[0] = this.N; this.simF[1] = this.L; this.simF[2] = dt;
    q.writeBuffer(this.sim, 0, this.simData);
    this.writeSplatArgs(list.count);
    const enc = this.device.createCommandEncoder({ label: 'splats' });
    const pass = enc.beginComputePass({ label: 'splats' });
    this.splatPass(pass);
    this.foldDeltas(pass);
    pass.end();
    q.submit([enc.finish()]);
  }

  /**
   * A picture poured onto the plate — `injectImage` and the text pour, at the
   * plate's own resolution rather than the 192² the CPU could manage.
   *
   * `box` is where it lands, in plate coordinates (0..1). `flipY` is for a
   * source that counts its rows downwards, which a 2D canvas does.
   */
  pourImage(src: ImageData | ImageBitmap | HTMLCanvasElement, box: [number, number, number, number], opts: { strength?: number; floor?: number; flipY?: boolean } = {}): void {
    const w = src.width, h = src.height;
    if (!w || !h) return;
    const tex = this.device.createTexture({
      label: 'pour source', size: [w, h], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    if (src instanceof ImageData) this.device.queue.writeTexture({ texture: tex }, src.data, { bytesPerRow: w * 4 }, [w, h]);
    else this.device.queue.copyExternalImageToTexture({ source: src }, { texture: tex }, [w, h]);

    const rec = new Float32Array(SPLAT_FLOATS);
    rec.set(box, 0);
    rec[7] = opts.floor ?? 0.5;                       // the dye a dark pixel still pours
    rec[12] = opts.strength ?? 1.5;
    rec[13] = opts.flipY === false ? 0 : 1;
    const bytes = SPLAT_FLOATS * 4;
    if (!this.splatBuf || this.splatBuf.size < bytes) {
      if (this.splatBuf) this.disposer.release(this.splatBuf);
      this.splatBuf = this.disposer.track(this.device.createBuffer({ label: 'splats', size: 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
      this.groups.clear();
    }
    this.device.queue.writeBuffer(this.splatBuf, 0, rec);
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.writeSplatArgs(1);

    const enc = this.device.createCommandEncoder({ label: 'pour image' });
    const pass = enc.beginComputePass({ label: 'pour image' });
    this.fill(pass, this.deltaMulTex, [1, 0, 0, 0], this.N);     // the picture adds; it takes nothing away
    this.splatRun(pass, 'pourImage', 'rgba32float', [this.splatBuf, this.deltaDyeTex, tex, this.sampler], this.N, false);
    this.run(pass, 'deltaDye', this.dye.write, [this.dye.read, this.deltaDyeTex, this.deltaMulTex], this.arg('none', [0, 0, 0, 0]));
    this.dye.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
    tex.destroy();
  }

  private writeSplatArgs(count: number): void {
    const buf = new ArrayBuffer(16);
    new Uint32Array(buf, 0, 1)[0] = count;
    new Float32Array(buf, 4, 3).set([this.N, this.L, 0]);
    this.device.queue.writeBuffer(this.splatArgs, 0, buf);
  }

  /**
   * A splat-side dispatch. `rest` is the bindings after the args uniform, in
   * the order the source declares them, and `format` is whatever storage
   * format its destination wants.
   *
   * `cache` is off where a binding is a one-shot texture: a cached group
   * would outlive it.
   */
  private splatRun(
    pass: GPUComputePassEncoder,
    name: string,
    format: GPUTextureFormat,
    rest: (GPUBuffer | GPUTexture | GPUSampler)[],
    size: number,
    cache = true,
  ): void {
    const pipe = this.pipelines.computePipeline(`${name}:${format}`, splatKernel(name, format));
    const label = (r: GPUBuffer | GPUTexture | GPUSampler) => (r instanceof GPUSampler ? 'sampler' : r.label);
    const key = `splat ${name}:${format}:${rest.map(label).join(',')}`;
    let group = cache ? this.groups.get(key) : undefined;
    if (!group) {
      group = bindGroup(this.device, pipe, [this.splatArgs, ...rest]);
      if (cache) this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(size / 8);
    pass.dispatchWorkgroups(w, w);
  }

  private upsample(pass: GPUComputePassEncoder, src: GPUTexture, dst: GPUTexture): void {
    this.splatRun(pass, 'upsampleDelta', dst.format, [src, dst], this.N);
  }

  private splatPass(pass: GPUComputePassEncoder): void {
    this.splatRun(pass, 'splatDeltas', 'rgba32float', [this.splatBuf!, this.deltaDyeTex, this.deltaVelTex, this.deltaMulTex], this.N);
  }

  /** Dye, velocity and the plate gap take up whatever is in the delta fields. */
  private foldDeltas(pass: GPUComputePassEncoder): void {
    this.run(pass, 'deltaDye', this.dye.write, [this.dye.read, this.deltaDyeTex, this.deltaMulTex], this.arg('none', [0, 0, 0, 0]));
    this.dye.swap();
    this.run(pass, 'deltaVel', this.vel.write, [this.vel.read, this.deltaVelTex], this.arg('none', [0, 0, 0, 0]));
    this.vel.swap();
    this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex], this.arg('squeeze delta', [1, 0, 0, 0]));
    this.squeeze.swap();
  }

  /**
   * Lay down the dye the reaction has grown (`gpu/chemistry.ts`), in the same
   * breath as the deltas — before the step, so this frame's flow carries it.
   * `amount` is per cell per step, `colour` the dye's own colour.
   */
  depositChemistry(chem: GPUTexture, amount: number, colour: [number, number, number], threshold = 0.22): void {
    if (amount <= 0) return;
    const eps = 0.002;
    const log = colour.map((c) => -Math.log(Math.max(eps, c)));
    const enc = this.device.createCommandEncoder({ label: 'chemistry deposit' });
    const pass = enc.beginComputePass({ label: 'chemistry deposit' });
    this.run(pass, 'depositChem', this.dye.write, [this.dye.read, chem], this.arg('deposit', [amount, threshold, 0, 0, ...log, 0]));
    this.dye.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** One solver step. Call applyDeltas first when there is anything to add. */
  step(p: GpuStepParams, deltasApplied: boolean): void {
    const N = this.N;
    const disp = p.dt * p.advection * ((N - 2) / N);
    this.writeSim(p, disp);
    const enc = this.device.createCommandEncoder({ label: 'step' });

    /*
      The air field, before any compute pass opens (H6 · A).

      It is a render pass and the stage that reads it is a compute pass, so
      it has to be encoded first — commands run in the order they are
      recorded, and a compute pass cannot be interrupted to draw into a
      texture it is sampling. It is also cheap and unconditional: the load op
      is what clears the field, so skipping it on a frame with no bubbles
      would leave the last frame's air behind and the dye would stay missing
      under a bubble that had already popped.
    */
    if (!this.air) this.air = new WebGPUAir(this.device, this.N, AIR_CAPACITY);
    this.air.splat(enc, (label) => this.profiler.renderPass(label));
    this.airPush = this.air.any ? (p.bubbleClear ?? 1) : 0;
    this.squeezeGain = Math.max(0, Math.min(1, p.platePressure ?? 0.4)) * 2.2;
    this.airCoverPrev = this.airCover;
    this.airCover = this.air.coverage;
    this.lastDt = p.dt;

    /*
      One pass, or one per stage.

      Off (the show), everything below is encoded into a single compute pass
      with one timestamp pair around it — the cheapest thing to submit. On
      (`stageTimings`), each named stage gets its own pass and its own pair,
      so the profiler can say which of the hundred-odd dispatches the time is
      in. The stages are the same dispatches in the same order either way.
    */
    const shared = this.stageTimings
      ? null
      : enc.beginComputePass({ label: 'step', timestampWrites: this.profiler.pass('solver step') });
    /*
      `when` is false for a stage with nothing to do, and it matters to the
      reading as well as the cost.
      
      A stage that opens a pass and dispatches nothing still takes a
      timestamp pair, and an empty pass's pair does not produce a usable
      interval — the profiler's sanity check rejects it and leaves the label
      at whatever it last read. So turning dye diffusion off skipped four
      Jacobi passes, the solver took 14% more steps a second for it, and the
      profiler went on reporting the stage at 1.31 ms as though nothing had
      changed. Not opening the pass at all lets the entry decay to zero,
      which is the truth.
    */
    const stage = (label: string, body: (pass: GPUComputePassEncoder) => void, when = true): void => {
      if (!when) return;
      if (shared) { body(shared); return; }
      const own = enc.beginComputePass({ label, timestampWrites: this.profiler.pass(label) });
      body(own);
      own.end();
    };

    const none = this.arg('none', [0, 0, 0, 0]);

    // 1. Hele-Shaw squeeze-film flow
    stage('squeeze', (pass) => {
      /*
        A new plate shape is a new pair of glasses, not a press.

        The gap springs toward its rest dome at `gapSpring`, which is tuned
        for a press lifting — about a second — and measures as a time constant
        near half a minute on a slow plate. That is right for a press and
        wrong for the dome itself: turning Plate Shape up is swapping the
        glasses, and the answer should be the shape they are, not a shape they
        reach ninety seconds later. Measured before this: eight seconds after
        setting the curve to 1, the gap had moved a sixth of the way.

        So the gap is *shifted* by the change, in `gapReshape`, which leaves a
        press's own dent in place and does not touch the rate. Re-laying it
        outright was the first version and it is a trap: the plate shape is a
        per-plate patch target, so a sound or camera mapping can drive it every
        frame, and a reset would wipe a live press sixty times a second.
      */
      if (this.lastCurve === null) {
        /*
          A plate that has just appeared is laid at the shape it is meant to
          have, absolutely.

          This branch is not a formality. The ladder builds a new solver a few
          seconds into a show, and the clear that comes with it lays the gap
          flat — so a plate whose shape was already set came back flat and
          then crept toward its dome at the spring's rate. Measured: the dome
          held for six seconds, snapped to 0.03 everywhere, and started over.
          Adopting the current shape without laying it is what caused that.
        */
        for (const t of [this.squeeze.a, this.squeeze.b]) {
          this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
        }
        this.lastCurve = p.plateCurve;
      } else if (this.lastCurve !== p.plateCurve) {
        this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
          this.arg('gap reshape', [this.lastCurve, p.plateCurve, 0, 0]));
        this.squeeze.swap();
        this.lastCurve = p.plateCurve;
      }
      if (!deltasApplied) {
        this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex], this.arg('squeeze no delta', [0, 0, 0, 0]));
        this.squeeze.swap();
      }
      /*
        Five red-black sweeps where this was ten Jacobi passes.

        The same operator as the projection in the same Neumann box, so the
        same treatment: half the arithmetic for about the same convergence,
        on a buffer whose two colour planes keep each sweep's writes
        contiguous. It warm-starts, as the ping-pong did — nothing clears
        this between steps, it carries on from where the last one left off.
      */
      const rb = this.pipelines.computePipeline('squeezeRedBlack', kernel('squeezeRedBlack', 'r32float'));
      const half = Math.ceil((this.N * (this.N / 2)) / 64);
      for (let k = 0; k < SQUEEZE_SWEEPS; k++) {
        for (const parity of [0, 1]) {
          const key = `squeezeRedBlack:${parity}:${this.squeeze.read.label}`;
          let group = this.groups.get(key);
          if (!group) {
            group = bindGroup(this.device, rb, [this.sim, this.arg(`squeeze ${parity}`, [parity, 0, 0, 0]), this.squeeze.read, this.spress]);
            this.groups.set(key, group);
          }
          pass.setPipeline(rb);
          pass.setBindGroup(0, group);
          pass.dispatchWorkgroups(half);
        }
      }

      const sv = this.pipelines.computePipeline('squeezeVelBuf', kernel('squeezeVelBuf', 'rgba16float'));
      const svKey = `squeezeVelBuf:${this.vel.write.label}:${this.squeeze.read.label}`;
      let svGroup = this.groups.get(svKey);
      if (!svGroup) {
        svGroup = bindGroup(this.device, sv, [this.sim, none, this.vel.read, this.squeeze.read, this.vel.write, this.spress]);
        this.groups.set(svKey, svGroup);
      }
      pass.setPipeline(sv);
      pass.setBindGroup(0, svGroup);
      pass.dispatchWorkgroups(Math.ceil(this.N / 8), Math.ceil(this.N / 8));
      this.vel.swap();
    });

    // 3. Viscous diffusion of momentum (xy) and heat (z)
    const n2 = (N - 2) * (N - 2);
    const visc: [number, number, number, number] = [p.dt * p.nu * n2, p.dt * p.nu * n2, p.dt * p.diff * n2, 0];
    stage('viscosity', (pass) => {
      this.jacobi(pass, this.vel, visc, VISC_ITERS, 'vel');
    }, visc.some((v) => v > 0));

    // 4. Project, 5. advect velocity by itself, 6. project again
    stage('project 1', (pass) => this.project(pass));
    stage('advect velocity', (pass) => this.macCormack(pass, this.vel, this.vel.read, disp, 'vel'));
    stage('project 2', (pass) => this.project(pass));

    // 6.5–8.7 The post-projection forces
    stage('forces', (pass) => {
      this.run(pass, 'forcesB', this.vel.write, [this.vel.read, this.dye.read], none);
      this.vel.swap();
    });

    // 8.9. The lasting current, and the flow the dye rides
    stage('current', (pass) => {
      this.stepCurrent(pass);
      // The gap rides along: the plate's depth is a mobility on the flow that
      // carries the dye (F), and this is the field that carries it.
      this.run(pass, 'addCurrent', this.velForced, [this.vel.read, this.cur.read, this.squeeze.read],
        this.arg('current grid', [0, this.M, p.depthDrag, 0]));
    });

    // 9. Dye: diffuse, then advect through the forced velocity
    const a = p.dt * p.diff * n2;
    stage('dye diffuse', (pass) => this.jacobi(pass, this.dye, [a, a, a, a], DYE_ITERS, 'dye'), a > 0);
    stage('advect dye', (pass) => this.macCormack(pass, this.dye, this.velForced, disp, 'dye'));

    /*
      Where air is, dye is not (H6 · A).

      After the advection, so the dye that moved this step is the dye the
      hole is cut from; before anything reads the plate, so nothing sees
      liquid where the bubble is. Skipped entirely when no bubble is on the
      plate, which is most looks — `stage` does not open a pass it is told
      not to, so the profiler reads zero rather than the cost of nothing.
    */
    stage('air exclude', (pass) => {
      this.run(pass, 'airExclude', this.dye.write, [this.dye.read, this.air!.field], this.arg('air clear', [p.bubbleClear ?? 1, 0, 0, 0]));
      this.dye.swap();
    }, !!this.air?.any && (p.bubbleClear ?? 1) > 0.001);

    /*
      The second phase, carried and kept sharp (H7).

      After the dye's own advection, on the same velocity, so the two move
      together — and before anything reads the plate, so the compositor sees
      the phase where it actually is this frame.

      The magnet enters here rather than in the forces, and that is the whole
      trick: it moves the phase by adding to the displacement this advection
      backtraces along, not by pushing the fluid. A magnet's pull is radial,
      radial is curl-free, and curl-free is precisely what the projection
      removes — a magnetic body force on the velocity would be deleted in the
      same step that applied it, which is the mistake H6 made three times.

      Skipped entirely on a plate with no phase on it, which is most looks.
    */
    stage('phase', (pass) => {
      this.run(pass, 'phaseAdvect', this.phase.write, [this.phase.read, this.velForced, this.sampler],
        this.arg('phase advect', [
          p.magnetX, p.magnetY, p.magnetHeight, p.magnetStrength * (this.phaseLive ? 1 : 0),
          p.magnetPolarity, disp, 0, 0,
        ]));
      this.phase.swap();
      this.run(pass, 'phaseSeparate', this.phase.write, [this.phase.read],
        this.arg('phase separate', [p.phaseSharp, p.phaseTension, 0, 0]));
      this.phase.swap();
    }, this.phaseLive);

    // 9.5. Sharpen what the advection and the diffusion softened
    if (p.sharpness > 0.0001) {
      stage('sharpen', (pass) => {
        this.run(pass, 'sharpenDye', this.dye.write, [this.dye.read], none);
        this.dye.swap();
      });
    }

    // 9.6. Pigment coordinates ride along with the dye
    if (this.grain) {
      stage('grain', (pass) => {
        this.run(pass, 'advect', this.grain!.write, [this.grain!.read, this.velForced, this.sampler], this.arg('advect grain', [disp, 0, 0, 0]));
        this.grain!.swap();
        const before = this.grainAge;
        this.grainAge = (this.grainAge + p.dt) % GRAIN_PERIOD;
        const crossed = (from: number, to: number, at: number) => (from < at && to >= at) || to < from;
        const keepA = crossed(before, this.grainAge, 0) && this.grainAge < GRAIN_PERIOD * 0.5 ? 0 : 1;
        const keepB = before < GRAIN_PERIOD * 0.5 && this.grainAge >= GRAIN_PERIOD * 0.5 ? 0 : 1;
        if (keepA === 0 || keepB === 0) {
          this.run(pass, 'seedGrain', this.grain!.write, [this.grain!.read], this.arg('grain keep', [keepA, keepB, 0, 0]));
          this.grain!.swap();
        }
      });
    }

    // 10. Decay: damping, the speed limit, evaporation, the cap, heat decay
    stage('decay', (pass) => {
      this.run(pass, 'decayDye', this.dye.write, [this.dye.read], none);
      this.dye.swap();
      this.run(pass, 'decayVel', this.vel.write, [this.vel.read], none);
      this.vel.swap();
    });

    shared?.end();

    /*
      And the particles, after everything that moves the field they ride.

      In this encoder, not one of their own: they read `velForced` and the
      dye as the stages above have just left them, and a separate submit
      would put a frame of slack between the flow and what is carried by it.
    */
    this.stepParticles(enc, p);

    this.profiler.resolveInto(enc);
    this.device.queue.submit([enc.finish()]);
    this.profiler.afterSubmit();
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

  /**
   * Lay the second phase down, as a soft disc (H7).
   *
   * A pour rather than a field the caller owns: the phase is the solver's,
   * like the dye, and what a hand does to it is put more of it somewhere.
   */
  addPhase(x: number, y: number, radius: number, amount: number): void {
    const enc = this.device.createCommandEncoder({ label: 'add phase' });
    const pass = enc.beginComputePass({ label: 'add phase' });
    this.run(pass, 'phaseSplat', this.phase.write, [this.phase.read],
      this.arg('phase splat', [x, y, radius, amount]));
    this.phase.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.phaseLive = true;
  }

  /** Take the phase off the plate. */
  /**
   * Take the phase off the plate — the field as well as the flag.
   *
   * This used to flip the flag and leave the texture alone, so "cleared" meant
   * "not being stepped" while the liquid was still sitting there. The next
   * pour landed on top of it, and a harness comparing two arms was really
   * comparing one arm against itself plus the other. That is why it read an
   * empty plate on one run and a full one on the next.
   */
  clearPhase(): void {
    this.phaseLive = false;
    const enc = this.device.createCommandEncoder({ label: 'clear phase' });
    const pass = enc.beginComputePass({ label: 'clear phase' });
    for (const t of [this.phase.a, this.phase.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  setBubbles(packed: Float32Array, count: number, soft = 0.25): void {
    if (!this.air) this.air = new WebGPUAir(this.device, this.N, AIR_CAPACITY);
    this.air.setBubbles(packed, count, soft);
  }

  /**
   * The air field, read back whole. For checks, not for a frame.
   *
   * A field can be the right size, hold the right amount and still be wrong
   * — flipped in y, or off by a texel — and every one of those still looks
   * like air in the right quantity. The only question that catches it is
   * *where*, which needs the field itself rather than a summary of it.
   */
  /**
   * The second phase, read back whole. For checks, not for a frame.
   *
   * Four bytes a texel, because the phase is `r32float` — and that is worth
   * saying next to `readAir` below, which is two, because the two fields have
   * opposite formats for opposite reasons and a reader that assumes the wrong
   * one produces a plausible field in the wrong place rather than an error.
   */
  async readPhase(): Promise<{ n: number; data: Float32Array } | null> {
    // Not gated on `phaseLive`: a readback for checks has to be able to say
    // "the field is empty", and a null that means both "no phase" and "no GPU"
    // is an instrument that cannot tell a cleared plate from a broken one.
    if (!this.device) return null;
    const n = this.N;
    const row = Math.ceil((n * 4) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read phase', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read phase' });
    enc.copyTextureToBuffer({ texture: this.phase.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n);
    const stride = row / 4;
    for (let y = 0; y < n; y++) out.set(all.subarray(y * stride, y * stride + n), y * n);
    buf.unmap();
    buf.destroy();
    return { n, data: out };
  }

  /**
   * The squeeze film, read back whole: the gap and its rate. For checks.
   *
   * RG32, so eight bytes a texel and two floats a cell — r is the gap between
   * the glasses, g is how fast it is changing, which is the thing that moves
   * any liquid at all.
   */
  async readSqueeze(): Promise<{ n: number; gap: Float32Array; rate: Float32Array } | null> {
    const n = this.N;
    const row = Math.ceil((n * 8) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read squeeze', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read squeeze' });
    enc.copyTextureToBuffer({ texture: this.squeeze.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const gap = new Float32Array(n * n), rate = new Float32Array(n * n);
    const stride = row / 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        gap[y * n + x] = all[y * stride + x * 2];
        rate[y * n + x] = all[y * stride + x * 2 + 1];
      }
    }
    buf.unmap();
    buf.destroy();
    return { n, gap, rate };
  }

  async readAir(): Promise<{ n: number; data: Float32Array } | null> {
    if (!this.air) return null;
    const n = this.N;
    /*
      Two bytes a texel, because the field is `r16float`.

      This read assumed four and a `Float32Array` when the field was
      `r32float`, and kept assuming it after the format changed. What it
      produced was not an error: it was a field with air in it, 190 cells
      of it, peaking at 0.01 and sitting a sixth of the plate from where the
      bubble was. Two half floats read as one single. Every conclusion drawn
      from it was about the reader.
    */
    const row = Math.ceil((n * 2) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read air', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read air' });
    enc.copyTextureToBuffer({ texture: this.air.field }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n);
    const stride = row / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const h = halves[y * stride + x];
        const sign = h & 0x8000 ? -1 : 1;
        const exp = (h >> 10) & 0x1f;
        const man = h & 0x3ff;
        out[y * n + x] = exp === 0 ? sign * man * 2 ** -24
          : exp === 31 ? (man ? NaN : sign * Infinity)
          : sign * (man + 1024) * 2 ** (exp - 25);
      }
    }
    buf.unmap();
    buf.destroy();
    return { n, data: out };
  }

  private stepParticles(enc: GPUCommandEncoder, p: GpuStepParams): void {
    const want = Math.max(0, Math.min(1, p.particles ?? 0));
    if (want <= 0) {
      if (this.particles) { this.particles.dispose(); this.particles = null; }
      return;
    }
    if (!this.particles) this.particles = new WebGPUParticles(this.device, this.N);
    this.particles.step(enc, this.dye.read, this.velForced, {
      amount: want,
      life: p.particleLife,
      // Born only where there is dye worth carrying. Below this a particle
      // would pick up a colour that is mostly the plate's own floor and lay
      // it back down as a haze.
      floor: 0.02,
      disp: p.dt * p.advection * ((this.N - 2) / this.N),
      dt: p.dt,
      seed: 0x9e3779b9,
    }, this.stageTimings ? (label) => this.profiler.pass(label) : undefined);
  }

  /**
   * The splat, once a frame: the population drawn into the texture the
   * compositor adds. Encoded into the *frame's* encoder rather than a step's,
   * because several steps happen per frame and only the last one is seen.
   */
  splatParticles(enc: GPUCommandEncoder, timing?: (label: string) => GPURenderPassTimestampWrites | undefined): void {
    this.particles?.splat(enc, timing);
  }

  private jacobi(pass: GPUComputePassEncoder, field: PingPong, a: [number, number, number, number], iters: number, label: string): void {
    if (a.every((v) => v <= 0)) return;
    const scratch = label === 'dye' ? this.scratchA : this.scratchB;
    // x0, the field before the diffusion, kept while the field ping-pongs.
    this.run(pass, 'scaleDye', scratch, [field.read], this.arg('scale one', [1, 0, 0, 0]));
    const rcp = a.map((v) => 1 / (1 + 4 * v));
    const args = this.arg(`jacobi ${label}`, [...a, ...rcp]);
    for (let k = 0; k < iters; k++) {
      this.run(pass, 'jacobi', field.write, [field.read, scratch], args);
      field.swap();
    }
  }

  /** Zero one of the packed pressure buffers, as the Jacobi's `fill` did. */
  private clearBuffer(pass: GPUComputePassEncoder, buf: GPUBuffer, key: string): void {
    const pipe = this.pipelines.computePipeline('pressureClear', kernel('pressureClear', 'r32float'));
    let group = this.groups.get(key);
    if (!group) {
      // The Sim, then the Args, then the buffer: every kernel here takes
      // bindings 0 and 1 from HEAD whether it reads them or not, and a group
      // that skips the Args puts the pressure on a uniform slot.
      group = bindGroup(this.device, pipe, [this.sim, this.arg('none', [0, 0, 0, 0]), buf]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil((this.N * this.N) / 64));
  }

  /**
   * Make the velocity divergence-free: find the pressure whose gradient
   * cancels the divergence, and subtract it.
   *
   * `PRESSURE_SWEEPS` red-black Gauss-Seidel sweeps where this was
   * `PRESSURE_ITERS` Jacobi passes. Each sweep is two dispatches over half
   * the grid — the same arithmetic as one Jacobi pass — and converges about
   * twice as fast, because the second half of a sweep reads a first half
   * that has already moved. See the kernel in `wgsl/fluid.ts` for why the
   * pressure had to leave its texture to allow it.
   */
  private project(pass: GPUComputePassEncoder): void {
    const none = this.arg('none', [0, 0, 0, 0]);
    // The fifth number is the mean of the rate term over the plate, which the
    // kernel subtracts so that term averages to zero as the standing one does.
    const invDt = 1 / Math.max(this.lastDt, 1e-4);
    this.run(pass, 'divergence', this.div, [this.vel.read, this.air!.field, this.air!.prev, this.squeeze.read],
      this.arg('air source', [this.airPush, invDt, this.airCover, 0,
        (this.airCover - this.airCoverPrev) * invDt,
        // The press: its plate-mean, so the source averages to zero, and how
        // much of it reaches the flow.
        this.squeezeMean, this.squeezeGain, 0]));
    this.clearBuffer(pass, this.press, 'clear pressure');

    const pipe = this.pipelines.computePipeline('pressureRedBlack', kernel('pressureRedBlack', 'r32float'));
    const half = Math.ceil((this.N * (this.N / 2)) / 64);
    for (let k = 0; k < PRESSURE_SWEEPS; k++) {
      for (const parity of [0, 1]) {
        const args = this.arg(`pressure ${parity}`, [parity, 0, 0, 0]);
        const key = `pressureRedBlack:${parity}`;
        let group = this.groups.get(key);
        if (!group) {
          group = bindGroup(this.device, pipe, [this.sim, args, this.div, this.press]);
          this.groups.set(key, group);
        }
        pass.setPipeline(pipe);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(half);
      }
    }

    const grad = this.pipelines.computePipeline('gradientSubtractBuf', kernel('gradientSubtractBuf', 'rgba16float'));
    const gkey = `gradientSubtractBuf:${this.vel.write.label}`;
    let ggroup = this.groups.get(gkey);
    if (!ggroup) {
      ggroup = bindGroup(this.device, grad, [this.sim, none, this.vel.read, this.vel.write, this.press]);
      this.groups.set(gkey, ggroup);
    }
    pass.setPipeline(grad);
    pass.setBindGroup(0, ggroup);
    pass.dispatchWorkgroups(Math.ceil(this.N / 8), Math.ceil(this.N / 8));
    this.vel.swap();
  }

  /** The lasting current: forces, then its own projection, on the M grid. */
  private stepCurrent(pass: GPUComputePassEncoder): void {
    const m = this.arg('current grid', [0, this.M, 0, 0]);
    this.run(pass, 'currentForces', this.cur.write, [this.cur.read, this.vel.read, this.dye.read], m, this.M);
    this.cur.swap();
    this.run(pass, 'curDivergence', this.curDiv, [this.cur.read], m, this.M);
    for (let k = 0; k < CURRENT_ITERS; k++) {
      this.run(pass, 'curPressure', this.curP.write, [this.curP.read, this.curDiv], m, this.M);
      this.curP.swap();
    }
    this.run(pass, 'curGradient', this.cur.write, [this.cur.read, this.curP.read], m, this.M);
    this.cur.swap();
  }

  private macCormack(pass: GPUComputePassEncoder, field: PingPong, velTex: GPUTexture, disp: number, label: string): void {
    const fwd = this.arg('advect forward', [disp, 0, 0, 0]);
    const back = this.arg('advect back', [-disp, 0, 0, 0]);
    const phi0 = field.read;
    this.run(pass, 'advect', this.scratchA, [phi0, velTex, this.sampler], fwd);
    this.run(pass, 'advect', this.scratchB, [this.scratchA, velTex, this.sampler], back);
    this.run(pass, 'macCormack', field.write, [phi0, this.scratchA, this.scratchB, velTex, this.sampler], fwd);
    field.swap();
    void label;
  }

  /** One frame of the drain: inward spiral, transport, evaporate. */
  drainStep(t: number): void {
    const pull = Math.pow(t, 0.4) * 4.0;
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    const enc = this.device.createCommandEncoder({ label: 'drain' });
    const pass = enc.beginComputePass({ label: 'drain' });
    this.run(pass, 'drainVel', this.vel.write, [], this.arg('drain', [pull, t, 0, 0]));
    this.vel.swap();
    this.run(pass, 'advect', this.dye.write, [this.dye.read, this.vel.read, this.sampler], this.arg('drain advect', [0.3 / this.L, 0, 0, 0]));
    this.dye.swap();
    this.run(pass, 'scaleDye', this.dye.write, [this.dye.read], this.arg('drain fade', [1 - (0.03 + t * t * 0.35), 0, 0, 0]));
    this.dye.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  // ── What the CPU reads ────────────────────────────────────────────

  /**
   * Start a read of both fields, downsampled to the logical grid, and take
   * whatever has come back. The readers (the bead camera, the dye regulator)
   * see a field a frame or two old, as they did on WebGL.
   */
  readbackAsync(): boolean {
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    const none = this.arg('none', [0, 0, 0, 0]);
    const enc = this.device.createCommandEncoder({ label: 'readback' });
    const slots: { which: 'dye' | 'vel'; buf: GPUBuffer | null }[] = [];
    for (const which of ['dye', 'vel'] as const) {
      const pass = enc.beginComputePass({ label: `downsample ${which}` });
      this.run(pass, 'downsample', this.readTarget, [which === 'dye' ? this.dye.read : this.velForced], none, this.L);
      pass.end();
      enc.copyTextureToBuffer({ texture: this.readTarget }, { buffer: this.rbStaging[which], bytesPerRow: this.rbRow }, [this.L, this.L]);
      slots.push({ which, buf: this.rbRings[which].copyFrom(enc, this.rbStaging[which]) });
    }
    this.device.queue.submit([enc.finish()]);
    for (const s of slots) if (s.buf) this.rbRings[s.which].collect(s.buf);
    let fresh = false;
    for (const which of ['dye', 'vel'] as const) {
      const data = this.rbRings[which].latest;
      if (!data) continue;
      const src = new Float32Array(data);
      const dst = which === 'dye' ? this.rbDye : this.rbVel;
      const stride = this.rbRow / 4;
      for (let y = 0; y < this.L; y++) dst.set(src.subarray(y * stride, y * stride + this.L * 4), y * this.L * 4);
      fresh = true;
    }
    return fresh;
  }

  /**
   * Measure the plate on the GPU: the mean dye, the mean colour, the peak
   * density and the fastest flow, in 32 bytes rather than a megabyte.
   *
   * The velocity it measures is the forced one the dye rides, which is what
   * the CPU's mirror held. Like `readbackAsync`, it starts a read and takes
   * whatever has landed, so the answer is a frame or two old — which is what
   * the readers had before.
   */
  measure(): FieldStats {
    const buf = new ArrayBuffer(16);
    new Float32Array(buf, 0, 1)[0] = this.N;
    new Uint32Array(buf, 4, 1)[0] = STATS_GROUPS;
    this.device.queue.writeBuffer(this.statsArgs, 0, buf);
    const enc = this.device.createCommandEncoder({ label: 'measure' });
    const pass = enc.beginComputePass({ label: 'measure' });
    this.statsRun(pass, 'statsTiles', [this.dye.read, this.velForced, this.statsPartials], STATS_GROUPS);
    this.statsRun(pass, 'statsFold', [this.statsPartials, this.statsResult], 1);
    pass.end();
    const slot = this.statsRing.copyFrom(enc, this.statsResult);
    this.device.queue.submit([enc.finish()]);
    if (slot) this.statsRing.collect(slot);
    const data = this.statsRing.latest;
    this.statsFresh = !!data;
    if (data && this.statsRing.landed > this.statsLatest.at) {
      const f = new Float32Array(data);
      const area = this.N * this.N;
      this.statsLatest = {
        meanDensity: f[3] / area,
        meanColor: [f[0] / area, f[1] / area, f[2] / area],
        maxDensity: f[4], maxVx: f[5], maxVy: f[6], maxSpeed: f[7],
        at: this.statsRing.landed,
      };
    }
    return this.statsLatest;
  }

  /** The last measurement, without asking for another. */
  get stats(): FieldStats { return this.statsLatest; }

  /**
   * The same measurement, waiting for the GPU. For harnesses, not the show:
   * it answers about the plate as it is now rather than as it was two frames
   * ago, at the cost of a stall.
   */
  async measureNow(): Promise<FieldStats> {
    const buf = new ArrayBuffer(16);
    new Float32Array(buf, 0, 1)[0] = this.N;
    new Uint32Array(buf, 4, 1)[0] = STATS_GROUPS;
    this.device.queue.writeBuffer(this.statsArgs, 0, buf);
    const out = this.device.createBuffer({ label: 'stats now', size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'measure now' });
    const pass = enc.beginComputePass({ label: 'measure now' });
    this.statsRun(pass, 'statsTiles', [this.dye.read, this.velForced, this.statsPartials], STATS_GROUPS);
    this.statsRun(pass, 'statsFold', [this.statsPartials, this.statsResult], 1);
    pass.end();
    enc.copyBufferToBuffer(this.statsResult, 0, out, 0, 32);
    this.device.queue.submit([enc.finish()]);
    await out.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(out.getMappedRange().slice(0));
    out.unmap();
    out.destroy();
    const area = this.N * this.N;
    return {
      meanDensity: f[3] / area,
      meanColor: [f[0] / area, f[1] / area, f[2] / area],
      maxDensity: f[4], maxVx: f[5], maxVy: f[6], maxSpeed: f[7],
      at: this.statsLatest.at,
    };
  }

  /** Whether any measurement has come back yet. */
  get measured(): boolean { return this.statsFresh; }

  /** Which copy the last measurement came from; it rises as fresh ones land. */
  get measuredSeq(): number { return this.statsLatest.at; }

  private statsRun(pass: GPUComputePassEncoder, name: string, rest: (GPUBuffer | GPUTexture)[], groups: number): void {
    const pipe = this.pipelines.computePipeline(name, STATS_KERNELS[name]);
    // The dye is a ping-pong, so the key has to name the half that is bound:
    // a group cached under the kernel's name alone would go on measuring
    // whichever texture happened to be the read side when it was made.
    const key = `stats ${name}:${rest.map((r) => r.label).join(',')}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.statsArgs, ...rest]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(groups);
  }

  /**
   * The fields as the CPU last saw them. WebGPU cannot read a texture back
   * without waiting for the queue, and the callers of this — carrying the
   * plate across a resolution change, and detaching — would rather have the
   * frame-old copy the ring already holds than stall the show for a fresh
   * one. Call `readbackAsync` first if the age matters.
   */
  readback(): { dye: Float32Array; vel: Float32Array } {
    this.readbackAsync();
    return { dye: this.rbDye, vel: this.rbVel };
  }

  get rbDyeView(): Float32Array { return this.rbDye; }
  get rbVelView(): Float32Array { return this.rbVel; }

  /** Read a field straight out, waiting for the GPU. For the parity harness, not the show. */
  async readField(which: 'dye' | 'vel' | 'grain'): Promise<Float32Array> {
    const src = which === 'dye' ? this.dye.read : which === 'vel' ? this.velForced : this.grain?.read;
    if (!src) throw new Error(`no ${which} field`);
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    const enc = this.device.createCommandEncoder({ label: 'read field' });
    const pass = enc.beginComputePass();
    this.run(pass, 'downsample', this.readTarget, [src], this.arg('none', [0, 0, 0, 0]), this.L);
    pass.end();
    const row = this.rbRow;
    const buf = this.device.createBuffer({ size: row * this.L, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: this.readTarget }, { buffer: buf, bytesPerRow: row }, [this.L, this.L]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const padded = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const out = new Float32Array(this.L * this.L * 4);
    const stride = row / 4;
    for (let y = 0; y < this.L; y++) out.set(padded.subarray(y * stride, y * stride + this.L * 4), y * this.L * 4);
    return out;
  }

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

  /** The fields, for the compositor (P3) to read directly. */
  get fields() {
    return {
      dye: this.dye.read,
      vel: this.vel.read,
      velForced: this.velForced,
      grain: this.grain?.read ?? null,
      /** The particle splat, or null when the amount is 0 and none exist. */
      particles: this.particles && !this.particles.idle ? this.particles.target : null,
      /** The air field (H6), or null when no bubble is on this plate. */
      air: this.air?.any ? this.air.field : null,
      /** The second phase (H7), or null when none has been poured. */
      phase: this.phaseLive ? this.phase.read : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles?.dispose();
    this.particles = null;
    this.air?.dispose();
    this.air = null;
    this.disposer.dispose();
    this.groups.clear();
  }
}
