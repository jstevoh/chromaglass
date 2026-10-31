/**
 * What is put into the plate from outside a step: the CPU's deltas and the splats, a poured
 * image, the chemistry's seeds and prints, the phase, the film, the liquids, and a plate
 * handed over to another solver and taken back. Part of the solver's class chain; the map is
 * at the top of `gpu/fluid.ts`.
 */

import { PingPong, bindGroup } from '../kit';
import { splatKernel } from '../wgsl/splat';
import { SPLAT_FLOATS, type SplatList } from '../splats';
import type { SolverCarry } from '../solverTypes';
import { pressShare } from '../../lib/pressRing';
import { dyeAbsorbances } from '../../lib/dye';
import { LIES_B0, BZ_GRID, CHEM_REF, CHEM_STABLE, CHEM_MOST, LIES_GRID, R32, RGBA32, type FieldCarry } from './constants';
import { FluidPasses } from './passes';

export class FluidInputs extends FluidPasses {
  /**
   * The video pour (PLAN 14ab-2): its frame at the video's own size, the last
   * two at the grid's, and the deltas of the frames poured since the last
   * flush, which takes them with the CPU's. Made on the first frame poured.
   */
  private videoSrc: GPUTexture | null = null;
  private videoFrames: PingPong | null = null;
  private videoDye: PingPong | null = null;
  private videoVel: PingPong | null = null;
  /** Frames poured since the last flush. */
  private videoPending = false;
  /** `videoFrames` holds a frame this solver poured, so the next can be differenced against it. */
  private videoPrimed = false;
  private videoRefused = false;

  /**
   * Fold the CPU-side deltas into the field. `dyeAdd` is L²×4 (R,G,B
   * absorption, density), `velAdd` is L²×4 (vx, vy, temp, gap), `dyeMul` is
   * L² (1 = no change).
   */
  applyDeltas(dyeAdd: Float32Array, velAdd: Float32Array, dyeMul: Float32Array, dt: number, hands: Float32Array | null = null, breath: Float32Array | null = null, sheet: Float32Array | null = null, rows: Uint8Array | null = null): void {
    const q = this.device.queue;
    /*
      The press's plate mean used to be worked out here, from the gap deltas
      just handed across over a resting gap of 0.03, so its source could be
      made zero-mean: a press is a net source, and a closed plate's pressure
      has no solution for one (the press arrived as 0.4% of the dye moved
      before it was balanced at all). That estimate is what leaked. A press
      held in one place squeezes its gap to the floor, the delta is clamped
      away there and the gap's spring goes on moving it, so the source the
      GPU really applies is nothing like this guess, and the difference was a
      net source over the whole plate that the solve turned into a flow out
      from the middle (`npm run heldpress`, and the mirror check,
      `scripts/mirror.mjs`). The mean is now taken on the GPU from the source
      itself, in project().
    */
    this.uploads.write(q, this.cpuDyeTex, dyeAdd, 16, rows, this.L);
    this.uploads.write(q, this.cpuVelTex, velAdd, 16, rows, this.L);
    this.uploads.write(q, this.cpuMulTex, dyeMul, 4, rows, this.L);
    if (hands) {
      if (!this.handTex) {
        const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
        this.cpuHandTex = this.disposer.track(this.device.createTexture({ label: 'hands (cpu)', size: [this.L, this.L], format: RGBA32, usage }));
        this.handTex = this.disposer.track(this.device.createTexture({ label: 'hands', size: [this.N, this.N], format: RGBA32, usage }));
      }
      let fastest = 0;
      for (const [h0, h1] of this.uploads.write(q, this.cpuHandTex!, hands, 16, rows, this.L))
        for (let k = h0 * this.L * 4; k < (h1 + 1) * this.L * 4; k += 4) if (hands[k + 2] > 0.5) fastest = Math.max(fastest, Math.hypot(hands[k], hands[k + 1]) / hands[k + 2]);
      this.handFastest = fastest;
    }
    if (breath) {
      if (!this.breathTex) {
        const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
        this.cpuBreathTex = this.disposer.track(this.device.createTexture({ label: 'breath (cpu)', size: [this.L, this.L], format: RGBA32, usage }));
        this.breathTex = this.disposer.track(this.device.createTexture({ label: 'breath', size: [this.N, this.N], format: RGBA32, usage }));
      }
      this.uploads.write(q, this.cpuBreathTex!, breath, 16, rows, this.L);
    }
    if (sheet) {
      if (!this.sheetTex) {
        const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
        this.cpuSheetTex = this.disposer.track(this.device.createTexture({ label: 'sheet (cpu)', size: [this.L, this.L], format: R32, usage }));
        this.sheetTex = this.disposer.track(this.device.createTexture({ label: 'sheet', size: [this.N, this.N], format: R32, usage }));
      }
      this.uploads.write(q, this.cpuSheetTex!, sheet, 4, null, this.L);
    }
    this.simF[0] = this.N; this.simF[1] = this.L; this.simF[2] = dt;
    q.writeBuffer(this.sim, 0, this.simData);
    this.writeSplatArgs(0);
    const enc = this.device.createCommandEncoder({ label: 'deltas' });
    const pass = enc.beginComputePass({ label: 'deltas' });
    // Onto the full grid, the same bilinear the delta passes used to do
    // themselves, so the two paths meet at one place. The video pour's
    // frames since the last flush are added on the way (pourVideo).
    if (this.videoPending) {
      this.upsampleSum(pass, this.cpuDyeTex, this.videoDye!.read, this.deltaDyeTex);
      this.upsampleSum(pass, this.cpuVelTex, this.videoVel!.read, this.deltaVelTex);
      this.videoPending = false;
    } else {
      this.upsample(pass, this.cpuDyeTex, this.deltaDyeTex);
      this.upsample(pass, this.cpuVelTex, this.deltaVelTex);
    }
    this.upsample(pass, this.cpuMulTex, this.deltaMulTex);
    if (hands) this.upsample(pass, this.cpuHandTex!, this.handTex!);
    // Kept until the step takes them: a second flush before it (pullStateFromGpu's) brings no hands of its own.
    if (hands) this.handLive = true;
    if (breath) { this.upsample(pass, this.cpuBreathTex!, this.breathTex!); this.breathLive = true; }
    if (sheet) this.upsample(pass, this.cpuSheetTex!, this.sheetTex!);
    this.foldDeltas(pass, !!sheet);
    pass.end();
    this.submit(enc);
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
      this.groupRoot = { kids: new Map() };
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
    this.submit(enc);
  }

  /**
   * A picture poured onto the plate — `injectImage` and the text pour, at the
   * plate's own resolution rather than the 192² the CPU could manage.
   *
   * `box` is where it lands, in plate coordinates (0..1). `flipY` is for a
   * source that counts its rows downwards, which a 2D canvas does.
   */
  pourImage(src: ImageData | ImageBitmap | HTMLCanvasElement | HTMLVideoElement, box: [number, number, number, number], opts: { strength?: number; floor?: number; flipY?: boolean } = {}): void {
    const w = 'videoWidth' in src ? src.videoWidth : src.width;
    const h = 'videoHeight' in src ? src.videoHeight : src.height;
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
      this.groupRoot = { kids: new Map() };
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
    this.submit(enc);
    tex.destroy();
  }

  /**
   * A frame of the video pour (PLAN 14ab-2, lib/videoFlow.ts): its dye and
   * its motion as flow, worked out here and held until the next flush adds
   * them to the CPU's deltas, as the loop's writes were held in the CPU's
   * arrays. Two frames between two steps (a step rate under the refresh) add
   * up, as they did there. `fresh` is a new video: its first frame has no
   * last one to be differenced against.
   *
   * The loop it replaces read the frame back from a canvas every frame and
   * wrote 36,000 cells through `addDensity` and `addVelocity`, and marked
   * every row written, so each step sent all 1.3 MB of deltas across too.
   * Here nothing comes back and nothing goes over but the frame, which for
   * a video is a copy on the GPU (`npm run videoflow` has the numbers).
   *
   * False when nothing was poured (no frame yet, a frame that cannot be
   * read, a kernel not built), so the app can try its own way.
   */
  pourVideo(src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, fresh: boolean): boolean {
    const w = 'videoWidth' in src ? src.videoWidth : src.width;
    const h = 'videoHeight' in src ? src.videoHeight : src.height;
    if (!w || !h) return false;
    const d = this.device;
    if (!this.videoSrc || this.videoSrc.width !== w || this.videoSrc.height !== h) {
      if (this.videoSrc) this.disposer.release(this.videoSrc);
      this.videoSrc = this.disposer.track(d.createTexture({
        label: 'video frame', size: [w, h], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      }));
    }
    if (!this.videoFrames) {
      const pp = (format: GPUTextureFormat, label: string) => new PingPong(d, this.disposer, [this.L, this.L], format, label);
      this.videoFrames = pp('rgba8unorm', 'video frames');
      this.videoDye = pp(RGBA32, 'video dye');
      this.videoVel = pp(RGBA32, 'video flow');
    }
    try {
      // Turned over in the copy: a frame's rows count down and the grid's up the plate, and the
      // passes lay the texture's first row on the grid's first, so without it a poured video landed
      // upside down (PLAN 14ab-13). The loop turns its rows where it reads them (`pourVideoFrameCpu`).
      d.queue.copyExternalImageToTexture({ source: src, flipY: true }, { texture: this.videoSrc }, [w, h]);
    } catch (e) {
      // A video from another origin without CORS can be played and not read, here or by a canvas.
      if (!this.videoRefused) console.warn('[video pour] the frame could not be read', e);
      this.videoRefused = true;
      return false;
    }
    const frames = this.videoFrames, dye = this.videoDye!, vel = this.videoVel!;
    this.writeSplatArgs((fresh || !this.videoPrimed ? 0 : 1) | (this.videoPending ? 2 : 0));
    const enc = d.createCommandEncoder({ label: 'video pour' });
    const pass = enc.beginComputePass({ label: 'video pour' });
    /*
      The sampling's group is not cached: the frame's texture is made again
      when the video's size changes, under the same label. And a kernel not
      built (refused, or failed) pours nothing, rather than marking deltas
      that were never written: `dyeIn` would then be the frames the last
      flush already took, and they would land twice.
    */
    let poured = false;
    if (this.splatRun(pass, 'videoSample', 'rgba8unorm', [this.videoSrc, this.sampler, frames.write], this.L, false)) {
      frames.swap();                                  // read: this frame; write: the last, read before it is written again
      poured = this.splatRun(pass, 'videoFlow', RGBA32, [frames.read, frames.write, dye.read, vel.read, dye.write, vel.write], this.L);
    }
    pass.end();
    this.submit(enc);
    if (!poured) return false;
    dye.swap();
    vel.swap();
    this.videoPending = true;
    this.videoPrimed = true;
    return true;
  }

  /** A wiped plate takes no frame poured before it. */
  override clear(): void {
    super.clear();
    this.videoPending = false;
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
  ): boolean {
    const pipe = this.pipelines.computePipeline(`${name}:${format}`, splatKernel(name, format));
    if (!pipe) return false;
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
    return true;
  }

  private upsample(pass: GPUComputePassEncoder, src: GPUTexture, dst: GPUTexture): void {
    this.splatRun(pass, 'upsampleDelta', dst.format, [src, dst], this.N);
  }

  private upsampleSum(pass: GPUComputePassEncoder, src: GPUTexture, more: GPUTexture, dst: GPUTexture): void {
    this.splatRun(pass, 'upsampleDeltaSum', dst.format, [src, more, dst], this.N);
  }

  private splatPass(pass: GPUComputePassEncoder): void {
    this.splatRun(pass, 'splatDeltas', 'rgba32float', [this.splatBuf!, this.deltaDyeTex, this.deltaVelTex, this.deltaMulTex], this.N);
  }

  /** Dye, velocity and the plate gap take up whatever is in the delta fields, and with `sheet` the rhythm sheet's change. */
  private foldDeltas(pass: GPUComputePassEncoder, sheet = false): void {
    /*
      Oil Bodies: the dye that lands this frame is shared between the two
      liquids by how much of each is where it lands (bodyLand), before the
      whole is added to, so both read the same plate.
    */
    if (this.bodiesWanted && this.mix && this.mixLive && !this.oilDyeStale) {
      const od = this.ensureOilDye();
      this.run(pass, 'bodyLand', od.write, [od.read, this.deltaDyeTex, this.deltaMulTex, this.mix.read], this.arg('none', [0, 0, 0, 0]));
      od.swap();
    }
    this.run(pass, 'deltaDye', this.dye.write, [this.dye.read, this.deltaDyeTex, this.deltaMulTex, this.liquids0.read], this.arg('none', [0, 0, 0, 0]));
    this.dye.swap();
    this.run(pass, 'deltaVel', this.vel.write, [this.vel.read, this.deltaVelTex], this.arg('delta vel', [this.thinLive ? 1 : 0, 0, 0, 0]));
    this.vel.swap();
    this.run(pass, 'liquidForces', this.vel.write, [this.vel.read, this.liquids0.read, this.liquids1.read], this.arg('liquid forces', [1.1, this.thinLive ? 1 : 0, 2.6, 0.9, 3.0, 0.9, 0.22, 0]));
    this.vel.swap();
    if (sheet) this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex, this.sheetTex!], this.arg('squeeze delta sheet', [1, this.thinLive ? 1 : 0, 1, 0]));
    else this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex, this.blank('r')], this.arg('squeeze delta', [1, this.thinLive ? 1 : 0, 0, 0]));
    this.squeeze.swap();
  }

  /**
   * A pour of Turing Reagent at (x, y), `radius` in plate units: the reaction's
   * feed where it lands, its own pattern baked in (26c), and a speck of the
   * autocatalyst to start from (addReagent's kernel, and why).
   */
  addReagent(x: number, y: number, radius: number, amount: number, pattern_val: number): void {
    const enc = this.device.createCommandEncoder({ label: 'add reagent' });
    const pass = enc.beginComputePass({ label: 'add reagent' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'addReagent', this.chem.write, [this.chem.read],
      this.arg('reagent splat', [x, y, radius, amount, pattern_val, 0, 0, 0]), this.N);
    this.chem.swap();
    pass.end();
    this.submit(enc);
    this.chemLive = true;
    this.reagentLive = true;
  }

  seedChemistry(x: number, y: number, radius: number): void {
    const enc = this.device.createCommandEncoder({ label: 'seed chemistry' });
    const pass = enc.beginComputePass({ label: 'seed chemistry' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'seedChem', this.chem.write, [this.chem.read],
      this.arg('seedChem splat', [x, y, radius, 0, 0, 0, 0, 0]), this.N);
    this.chem.swap();
    pass.end();
    this.submit(enc);
    this.chemLive = true;
  }

  /**
   * The reaction's own time: `iters` steps of Gray–Scott's unit time a frame,
   * with feed and kill, and Du, Dv the diffusion lengths' squares in cells of
   * the CHEM_REF grid; `bath` is the reagent the whole plate stands in.
   *
   * Two things were wrong here, both making the pattern coarser and softer
   * than its chemistry (PLAN.md 26d, 26-colour-b).
   *
   * It was carried twice. The step carries the field with the dye's own
   * scheme (the same faces, the same substeps: 26a's "one flux pass"), and
   * this ran a second, semi-Lagrangian carry of a frame's displacement on
   * top: the stripes moved ahead of the colour they lay, and the bilinear
   * backtrace blurred them by about a cell every frame, which the reaction
   * then had to grow back. That carry is gone.
   *
   * And its width was in cells, so a stripe was twice as wide on the 256²
   * rung as on 512². Gray–Scott's wavelength goes as the square root of
   * D over the reaction's rate, so D here is given on CHEM_REF's grid and
   * scaled by (N / CHEM_REF)² onto this one: the same stripe on the plate
   * at every rung (`npm run turing` measures it by FFT). An explicit
   * five-point step is stable only while D·dt ≤ 1/4, and at 512² the
   * default width is 0.28 and the Width knob's top 1.1 (it went unstable
   * there before, the clamp to [0, 1] turning the plate to static), so each
   * unit of time is cut into as many substeps as D needs. The reaction's
   * own terms are the same per unit of time at any substep.
   */
  stepChemistry(iters: number, feed = 0.037, kill = 0.06, Du = 1.0, Dv = 0.5, bath = 0, drift = 0, clock = 0): void {
    if (!this.chemLive) return;
    const s = (this.N / CHEM_REF) ** 2;
    const du = Du * s, dv = Dv * s;
    const sub = Math.max(1, Math.ceil(Math.max(du, dv) / CHEM_STABLE));
    const n = Math.min(Math.max(1, iters) * sub, CHEM_MOST);
    const enc = this.device.createCommandEncoder({ label: 'step chemistry' });
    const pass = enc.beginComputePass({ label: 'step chemistry' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    // bath: the reagent the whole plate stands in (grayScott), 0 when only pours feed it.
    // drift: how far the feed/kill map wanders (grayScott), at `clock` seconds on the reaction's slow clock.
    const args = this.arg('chem rates', [du, dv, feed, kill, bath, 1 / sub, drift, clock]);
    for (let i = 0; i < n; i++) {
      this.run(pass, 'grayScott', this.chem.write, [this.chem.read], args, this.N);
      this.chem.swap();
    }
    pass.end();
    this.submit(enc);
  }

  /**
   * The colour the reaction makes, laid into the dye (`depositChem`).
   *
   * With `print` 0 the activator above `threshold` deposits `colour` at
   * `amount` a frame and the flow carries it off, Boyle's bench, as the coral
   * looks have always grown. With `print` above 0 the colour is an indicator
   * in the liquid the reaction runs in, starch with the iodine of a CIMA dish
   * (26d, Turing Print): the blue-black complex forms and comes apart with
   * the activator, so the print where the reaction is fed is the complex's
   * equilibrium with the field as it stands, `print` its depth, and nothing
   * piles up. It is drawn over the dye into `printDye`, which the plate then
   * shows in the dye's place; the solver's dye is left as poured. `bath` is the reagent the whole plate stands in, as stepChemistry
   * takes it, so the print covers what the reaction is fed.
   */
  depositChemistry(chem: GPUTexture, amount: number, colour: [number, number, number], threshold = 0.22, print = 0, bath = 0, wetOnly = 0): void {
    if (amount <= 0 && print <= 0) { this.printLive = false; return; }
    const log = dyeAbsorbances(...colour);
    const enc = this.device.createCommandEncoder({ label: 'chemistry deposit' });
    const pass = enc.beginComputePass({ label: 'chemistry deposit' });
    const args = this.arg('deposit', [amount, threshold, Math.max(0, print), Math.max(0, bath), ...log, wetOnly]);
    if (print > 0) {
      /*
        The print is drawn into its own picture and the dye is left as it is.
        Before it replaced the dye on every fed cell, every frame: a liquid
        poured on the plate was gone the frame it landed, and since the
        print was written into the dye the solver carried it as well.
      */
      this.printDye ??= this.disposer.track(this.device.createTexture({
        label: 'print dye', size: [this.N, this.N], format: this.dyeFormat,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      }));
      this.run(pass, 'depositChem', this.printDye, [this.dye.read, chem], args);
      this.printLive = true;
    } else {
      this.run(pass, 'depositChem', this.dye.write, [this.dye.read, chem], args);
      this.dye.swap();
      this.printLive = false;
    }
    pass.end();
    this.submit(enc);
  }

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
    this.submit(enc);
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
    this.resetFilm();
    const enc = this.device.createCommandEncoder({ label: 'clear phase' });
    const pass = enc.beginComputePass({ label: 'clear phase' });
    for (const t of [this.phase.a, this.phase.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    pass.end();
    this.submit(enc);
  }

  /**
   * A pour (PLAN 18c, 18d): `take` of the column at the middle of a disc,
   * less toward its rim (a dome, as the soap lands), comes in as new liquid.
   *
   * Its volume goes into the thin solve as a source (hsDivergence), so the
   * liquid already there is pushed out of the way, radially, and what
   * reaches the rim leaves the dish over it. Its liquid, when it is one
   * that mixes with the clear one (glycerine, syrup, milk, alcohol: `sp`),
   * is added to the species field as that share of the column, with its
   * ln(ν/ν_water), scatter (μs′, traded from density until 18d-4a) and index (lib/liquidProps.ts, speciesOf);
   * a clear-liquid pour (water, a dye, soap) adds the volume and nothing
   * to the field, and so dilutes what it lands in by pushing it aside.
   * Added, not replaced: the liquid that was in the column is not deleted
   * but carried out of it by the flow its volume makes, which is what
   * keeps every poured share accounted for until it leaves over the rim.
   *
   * `volume` false lays the liquid as though poured long ago, with no push:
   * for a check that needs a pool in place (`npm run thick`). Only on a thin
   * gap; in plate units.
   */
  pour(x: number, y: number, radius: number, take: number, sp: { lnNu: number; density: number; index: number; scatter?: number } | null, volume = true): void {
    if (!(radius > 0) || !(take > 0)) return;
    const enc = this.device.createCommandEncoder({ label: 'pour' });
    const pass = enc.beginComputePass({ label: 'pour' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    const push = volume && !!this.hsPour;
    if (sp) {
      if (!this.species) this.species = new PingPong(this.device, this.disposer, [this.N, this.N], 'rgba32float', 'species');
      const s = this.species;
      if (!this.speciesLive) for (const t of [s.a, s.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
      this.run(pass, 'speciesSplat', s.write, [s.read], this.arg('species splat', [x, y, radius, take, sp.lnNu, sp.scatter ?? 0, sp.index, push ? 1 : 0]));
      s.swap();
      this.speciesLive = true;
      this.speciesQuiet++;
    }
    if (push) {
      this.hsRun(pass, 'pourVolume', 'pourVolume', this.arg('pour volume', [x, y, radius, take]), [this.hsPour!]);
    }
    pass.end();
    this.submit(enc);
  }

  /**
   * A pour onto the clear film (PLAN §20b): clear oil (`film`, in fractions of
   * the gap at the middle of the pour) thickens it, a solvent (`solvent`) lands
   * where its Marangoni pull opens a hole. In plate units. Nothing while there
   * is no film on the plate: a drop of alcohol on bare water has nothing to
   * tear, and the oil goes where it always went.
   */
  addFilm(x: number, y: number, radius: number, what: { film?: number; solvent?: number }): void {
    if (!this.film || this.filmLaid <= 0) return;
    const enc = this.device.createCommandEncoder({ label: 'add film' });
    const pass = enc.beginComputePass({ label: 'add film' });
    const n = this.film.size[0];
    this.run(pass, 'filmSplat', this.film.write, [this.film.read],
      this.arg('film splat', [x, y, radius, 0, what.film ?? 0, what.solvent ?? 0, 0, 0]), n);
    this.film.swap();
    pass.end();
    this.submit(enc);
  }

  /** Pour Liesegang's outer electrolyte (A) at a spot. */
  addLiesegang(x: number, y: number, radius: number, amount = 1): void {
    const l = this.ensureLies();
    const enc = this.device.createCommandEncoder({ label: 'add liesegang' });
    const pass = enc.beginComputePass({ label: 'add liesegang' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'gridSplat', l.write, [l.read], this.arg('lies splat', [x, y, radius, LIES_GRID, amount, 0, 0, 0]), LIES_GRID);
    l.swap();
    pass.end();
    this.submit(enc);
    this.liesLive = true;
  }

  /**
   * Pour into the mix: oil, surfactant and acidity (+ acid, − base), each an
   * amount in `what`, as a soft disc at (x, y) in plate units.
   */
  addLiquidDrop(x: number, y: number, radius: number, what: { soap?: number; body?: number; repel?: number; weight?: number; polarity?: number; bz?: number }, amount: number, seconds?: number): void {
    /*
      The BZ gel's activator (PLAN 25i, bottles.ts): the gel fires where it
      lands and a ring runs out from there, the reaction's own colour; it
      lays none. A whole disc with no wake behind it, so a target wave, not a
      spiral (those start from a broken wave: the visualizer's seed). Without
      BZ Reaction the gel is neither stepped nor drawn, so it shows nothing.
    */
    if ((what.bz ?? 0) > 0) this.addRxn(x, y, radius, { bz: (what.bz ?? 0) * Math.min(1, amount) });
    const take = Math.min(1, Math.max(0, amount)) * 0.6;
    const soap = (what.soap ?? 0) * amount;
    const body = (what.body ?? 0) * amount;
    const repel = (what.repel ?? 0) * amount;
    const weight = what.weight ?? 0;
    const polar = what.polarity ?? 0;
    const enc = this.device.createCommandEncoder({ label: 'add liquid drop' });
    const pass = enc.beginComputePass({ label: 'add liquid drop' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'liquidSplat0', this.liquids0.write, [this.liquids0.read],
      this.arg('liquid splat 0', [x, y, radius, take, soap, body, repel, weight]));
    this.liquids0.swap();
    this.run(pass, 'liquidSplat1', this.liquids1.write, [this.liquids1.read],
      this.arg('liquid splat 1', [x, y, radius, take, polar, 0, 0, 0]));
    this.liquids1.swap();
    pass.end();
    this.submit(enc);
  }

  addMix(x: number, y: number, radius: number, what: { oil?: number; soap?: number; acid?: number }): void {
    const m = this.ensureMix();
    const enc = this.device.createCommandEncoder({ label: 'add mix' });
    const pass = enc.beginComputePass({ label: 'add mix' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'mixSplat', m.write, [m.read],
      this.arg('mix splat', [x, y, radius, 1, what.oil ?? 0, what.soap ?? 0, what.acid ?? 0, 0]));
    // Flat to its edge (mixSplat), so a disc's worth; the clamp at full is not counted.
    // A negative oil cuts a hole (a compound drop's, oilLay.ts), and is taken off.
    this.oilPoured = Math.max(0, this.oilPoured + Math.max(-1, Math.min(1, what.oil ?? 0)) * Math.PI * radius * radius);
    m.swap();
    pass.end();
    this.submit(enc);
    this.mixLive = true;
  }

  /**
   * Drag the oil along a gesture, as the app drags the dye (carryDye in
   * LiquidVisualizer): taken from each cell under the hand in proportion to
   * how near its middle the cell is, and put down a hop ahead. In plate
   * units. Only the oil moves; the soap and the acidity stay where they are.
   */
  carryMix(x: number, y: number, radius: number, ux: number, uy: number, take: number, hop: number): void {
    this.runMixCarry(radius, take, [x, y, radius, take, ux * hop, uy * hop, 0, 0]);
  }

  /**
   * The Press's oil (squeezeOut in LiquidVisualizer, through pressOil in
   * src/lib/pressRing.ts): the same share of every cell under the palm,
   * put down on the ring from the palm's rim to `outer`, where the dye goes.
   * The same kernel as carryMix in its other mode (mixCarry says how it
   * lands and why it keeps what would land off the plate).
   *
   * What a ring cell receives of the palm cell it reads is counted here, on
   * the kernel's own grid, as the colour's is counted on the mirror's
   * (pressShare, lib/pressRing.ts), rather than the formula's 1 / K, which a
   * small palm's ring does not tile: a puff six cells across (the Blow held
   * still off the straw, PLAN.md 15c) lost 3.3% of the oil it moved on a
   * Mac. Counted on the mirror's grid and handed to a finer solver, it made
   * oil instead (+0.7% of a press, `npm run pressoil`): the two grids have
   * different cells, so each counts its own.
   */
  pressMix(x: number, y: number, radius: number, outer: number, take: number): void {
    if (!(outer > radius)) return;
    const n = this.N;
    const share = pressShare(n, x * n - 0.5, y * n - 0.5, radius * n, outer / radius);
    this.runMixCarry(radius, take, [x, y, radius, take, share, 0, outer, 1]);
  }

  private runMixCarry(radius: number, take: number, args: number[]): void {
    if (!this.mix || !this.mixLive || !(radius > 0) || !(take > 0)) return;
    const m = this.mix;
    const enc = this.device.createCommandEncoder({ label: 'carry mix' });
    const pass = enc.beginComputePass({ label: 'carry mix' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'mixCarry', m.write, [m.read], this.arg('mix carry', args));
    m.swap();
    pass.end();
    this.submit(enc);
  }

  /**
   * Carry the ferrofluid along a gesture (the Finger, a directed blow) or
   * straight out from its middle (a puff): taken from each cell under the
   * hand in proportion to how near its middle the cell is, and put down a
   * hop away (phaseCarry). In plate units; the direction need not be unit
   * length for a stroke and is ignored for a puff. Only with ferrofluid on
   * the plate.
   */
  carryPhase(x: number, y: number, radius: number, ux: number, uy: number, take: number, hop: number, outward = false): void {
    if (!this.phaseLive || !(radius > 0) || !(take > 0) || !(hop > 0)) return;
    const len = Math.hypot(ux, uy);
    if (!outward && !(len > 1e-6)) return;
    const enc = this.device.createCommandEncoder({ label: 'carry phase' });
    const pass = enc.beginComputePass({ label: 'carry phase' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'phaseCarry', this.phase.write, [this.phase.read],
      this.arg('phase carry', [x, y, radius, Math.min(1, take), outward ? 0 : ux / len, outward ? 0 : uy / len, hop, outward ? 1 : 0]));
    this.phase.swap();
    pass.end();
    this.submit(enc);
  }

  /** Pour into the BZ reaction: its activator, and a wake of oxidised catalyst behind it (a wave broken on one side curls into a spiral). */
  addRxn(x: number, y: number, radius: number, what: { bz?: number; bzWake?: number }): void {
    const r = this.ensureRxn();
    const enc = this.device.createCommandEncoder({ label: 'add rxn' });
    const pass = enc.beginComputePass({ label: 'add rxn' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'gridSplat', r.write, [r.read],
      this.arg('rxn splat', [x, y, radius, BZ_GRID, what.bz ?? 0, what.bzWake ?? 0, 0, 0]), BZ_GRID);
    r.swap();
    pass.end();
    this.submit(enc);
    this.rxnLive = true;
  }

  /** Take the mix and the reactions off the plate. */
  clearChemistry(): void {
    const enc = this.device.createCommandEncoder({ label: 'clear chemistry' });
    const pass = enc.beginComputePass();
    if (this.mix) for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids0) for (const t of [this.liquids0.a, this.liquids0.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids1) for (const t of [this.liquids1.a, this.liquids1.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.species) for (const t of [this.species.a, this.species.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.speciesLive = false;
    // With the oil gone its colour is the water's: the share is emptied, the dye kept.
    if (this.oilDye) for (const t of [this.oilDye.a, this.oilDye.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.oilPoured = 0;
    if (this.rxn) for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
    if (this.lies) for (const t of [this.lies.a, this.lies.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    // Gray–Scott too: it was left out, so a look's coral kept growing, and
    // depositing, under the next look, in that look's colours.
    for (const t of [this.chem.a, this.chem.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    pass.end();
    this.submit(enc);
    this.mixLive = false;
    this.rxnLive = false;
    this.liesLive = false;
    this.chemLive = false;
    this.reagentLive = false;
  }

  /**
   * The liquids that live only here, copied out for the next solver (PLAN 9w).
   *
   * When the governor moves the grid the app builds a new solver and lets
   * this one go. The dye and the flow were always carried across, through
   * the CPU's 192² arrays (`FluidSimulation.attachGpu`); nothing else was,
   * because nothing else ever crosses to the CPU. So the ferrofluid, the oil
   * and soap and acidity of the mix, and the two reactions were simply gone
   * on the new grid, and the app filled the gap by pouring the look's
   * ferrofluid ring again whenever Ferrofluid was up: a pool dragged into a
   * shape came back as the ring, and ferrofluid poured from the bottle on a
   * look with none of its own came back as ferrofluid nobody poured. With
   * the Magnet moving only what is on the plate (9y), a pool lost that way
   * left the magnet nothing to hold mid-show.
   *
   * A copy on the GPU, not a read to the CPU and back: the read would be a
   * frame or more late and cost a megabyte or more each way, and the copy is
   * in queue order after this solver's last step, so what the next one
   * starts from is the plate as it was. Copies rather than this solver's own
   * textures, because the app releases the old solver before it builds the
   * new one (a solver is a couple of hundred megabytes at the top rungs, and
   * holding two doubles the peak): the copies are the field alone, 4 bytes a
   * cell for the ferrofluid and 16 for the mix, about 20 MB at 1024².
   *
   * Only what is on the plate is copied (the live flags), so a plate with
   * none of these pays one empty encoder. Null once disposed.
   */
  handOver(): FieldCarry | null {
    if (this.disposed) return null;
    const enc = this.device.createCommandEncoder({ label: 'hand over' });
    const made: GPUTexture[] = [];
    const copy = (pp: PingPong | null, live: boolean): GPUTexture | null => {
      if (!pp || !live) return null;
      const [w, h] = pp.size;
      const t = this.device.createTexture({
        label: `carried ${pp.read.label}`, size: [w, h], format: pp.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      });
      enc.copyTextureToTexture({ texture: pp.read }, { texture: t }, [w, h]);
      made.push(t);
      return t;
    };
    const carry: FieldCarry = {
      n: this.N,
      device: this.device,
      phase: copy(this.phase, this.phaseLive),
      mix: copy(this.mix, this.mixLive),
      rxn: copy(this.rxn, this.rxnLive),
      lies: copy(this.lies, this.liesLive),
      oilPoured: this.oilPoured,
      destroy: () => { for (const t of made.splice(0)) t.destroy(); },
    };
    this.submit(enc);
    return carry;
  }

  /**
   * Lay what the last solver handed over (`handOver`) onto this grid: the
   * ferrofluid and the mix resampled by area (carryArea), so the plate holds
   * the same amount of each, in the same place and shape to within a cell of
   * the coarser grid; the reactions copied as they were, their grids being
   * the same size on every solver. Call it on a fresh solver, after `clear`
   * and before its first step. False, and nothing laid, for a carry from
   * another device (the old one was lost, and its copies with it).
   *
   * The oil's share of the dye (Oil Bodies) is not carried: the dye itself
   * comes back through the CPU's 192² arrays, a frame old and at that grid,
   * so a share carried at full resolution would no longer be a share of it.
   * It starts empty, as it does whenever Oil Bodies is turned on over oil
   * that is already there, and bodyPartition hands the colour inside each
   * body back to it within a few steps.
   */
  takeOver(c: SolverCarry): boolean {
    const carry = c as FieldCarry;
    if (carry.device !== this.device || this.disposed) return false;
    const enc = this.device.createCommandEncoder({ label: 'take over' });
    const pass = enc.beginComputePass({ label: 'take over' });
    if (carry.phase) {
      this.run(pass, 'carryArea', this.phase.write, [carry.phase], this.arg('carry phase', [carry.n, this.N, 0, 0]));
      this.phase.swap();
      this.phaseLive = true;
      this.phaseGapPrimed = false;
    }
    if (carry.mix) {
      const m = this.ensureMix();
      this.run(pass, 'carryArea', m.write, [carry.mix], this.arg('carry mix', [carry.n, this.N, 0, 0]));
      m.swap();
      this.mixLive = true;
      this.oilPoured = carry.oilPoured;
      this.oilDyeStale = true;
    }
    pass.end();
    const same = (from: GPUTexture | null, to: PingPong) => {
      if (!from || from.width !== to.size[0] || from.format !== to.format) return false;
      enc.copyTextureToTexture({ texture: from }, { texture: to.read }, [from.width, from.height]);
      return true;
    };
    if (carry.rxn && same(carry.rxn, this.ensureRxn())) this.rxnLive = true;
    if (carry.lies && same(carry.lies, this.ensureLies())) this.liesLive = true;
    this.submit(enc);
    return true;
  }

  /** One frame of the drain: inward spiral, transport, evaporate. */
  drainStep(t: number): void {
    // The drain carries the solver's dye, and the print is not in it (it is
    // laid over the dye in its own texture, 26d-3). While it runs the
    // visualizer deposits nothing, so a print left live would hold its last
    // picture still over the draining pour for fifty frames and then jump to
    // the emptied plate. The plate shows the dye that is draining instead.
    this.printLive = false;
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
    this.submit(enc);
  }
}
