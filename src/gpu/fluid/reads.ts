/**
 * What comes back from the plate: the readbacks the CPU draws from, the stats the governor
 * and the checks read, and the checks' own reads of single fields. Part of the solver's class
 * chain; the map is at the top of `gpu/fluid.ts`.
 */

import { PingPong, bindGroup } from '../kit';
import { STATS_GROUPS, STATS_KERNELS } from '../wgsl/stats';
import type { GpuStepParams } from '../solverTypes';
import { rimCount } from '../../lib/rimMask';
import { RimRead } from '../rimRead';
import { REST_GAP, RGBA32, type FieldStats } from './constants';
import { FluidInputs } from './inputs';

export class FluidReads extends FluidInputs {

  /**
   * The share of the dish that is poured liquid (PLAN 18d-2), the mean of the
   * species' first channel inside the rim, read back from the GPU: what the
   * automation's headroom asks before it doses glycerine, now that nothing
   * fades it (lib/liquidPhase.ts, headroom). A few hundred kilobytes, read
   * once a second or so (LiquidVisualizer). When the dish has been flushed
   * to a millionth and nothing was poured while it was read, the field is
   * dropped and its stage stops running.
   */
  async speciesShare(): Promise<number> {
    if (!this.species || !this.speciesLive) return 0;
    const pours = this.speciesQuiet;
    this.shareRead ??= new RimRead(this.device, this.disposer, 'species share');
    const share = await this.shareRead.read(this.L, this.rbRow, this.readTarget, (enc) => {
      this.simF[0] = this.N; this.simF[1] = this.L;
      this.device.queue.writeBuffer(this.sim, 0, this.simData);
      const pass = enc.beginComputePass();
      this.run(pass, 'downsample', this.readTarget, [this.speciesLive ? this.species!.read : this.blank('rgba')], this.arg('none', [0, 0, 0, 0]), this.L);
      pass.end();
    });
    if (share < 1e-6 && pours === this.speciesQuiet) this.speciesLive = false;
    return share;
  }

  /**
   * What the species costs the GPU (PLAN 18d-11), as benchSwirl times the
   * swirl's: `reps` of it back to back on the plate's own textures, after a
   * thin step has planned the carry's substeps, submit to done, in ms. Two
   * counts and the slope between them leave out the submit's fixed cost. For
   * `npm run thick`; CI's Mac grants no timestamp queries. `what`:
   *   'alone', the species' stage as 18d-1 ran it, its own carry and the rim;
   *   'dye', the colour's own carry alone, the work every thin step does
   *     whether anything is poured or not;
   *   'pair', the two together as a thin step now runs them (18d-11a): the
   *     colour's carry taking the species along, then the rim.
   * So the species costs a step 'alone' as it was and 'pair' less 'dye' as
   * it is, each readable as a share of 'dye' on whatever GPU runs the bench.
   */
  async benchSpecies(reps: number, what: 'alone' | 'dye' | 'pair' = 'alone'): Promise<number> {
    if (!this.species || !this.speciesLive || !this.carryInd) return NaN;
    const enc = this.device.createCommandEncoder({ label: 'bench species' });
    const pass = enc.beginComputePass({ label: 'bench species' });
    const args = this.arg('bench dye carry', [0, 0, 0, 0, 0, this.speciesDisp, 1, REST_GAP]);
    for (let k = 0; k < reps; k++) {
      if (what === 'alone') this.stepSpecies(pass);
      else {
        this.carrySubsteps(pass, 'bodyAdvect', this.dye, args, what === 'pair' ? this.species : undefined);
        if (what === 'pair') this.stepSpecies(pass, false);
      }
    }
    pass.end();
    await this.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    this.submit(enc);
    await this.device.queue.onSubmittedWorkDone();
    return performance.now() - t0;
  }

  /** The clear film read back whole (thickness, solvent, ·, ·), or null with none on the plate. For checks. */
  async readFilm(): Promise<{ n: number; data: Float32Array } | null> {
    if (!this.film || this.filmLaid <= 0) return null;
    const n = this.film.size[0];
    const row = Math.ceil((n * 16) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read film', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read film' });
    enc.copyTextureToBuffer({ texture: this.film.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n * 4);
    const stride = row / 4;
    for (let y = 0; y < n; y++) out.set(all.subarray(y * stride, y * stride + n * 4), y * n * 4);
    buf.unmap();
    buf.destroy();
    return { n, data: out };
  }

  /** The mix or the reactions, read back whole (RGBA per texel). For checks. */
  async readChemistry(which: 'mix' | 'rxn' | 'lies' | 'chem'): Promise<{ n: number; data: Float32Array } | null> {
    const pp = which === 'chem' ? this.chem : which === 'mix' ? this.mix : which === 'rxn' ? this.rxn : this.lies;
    if (!pp) return null;
    // The reaction's field is in the dye's format: half floats on a GPU that cannot filter full ones.
    if (pp.format !== RGBA32) return this.readHalf(pp);
    const n = pp.size[0];
    const row = Math.ceil((n * 16) / 256) * 256;
    const buf = this.device.createBuffer({ label: `read ${which}`, size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: `read ${which}` });
    enc.copyTextureToBuffer({ texture: pp.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n * 4);
    const stride = row / 4;
    for (let y = 0; y < n; y++) out.set(all.subarray(y * stride, y * stride + n * 4), y * n * 4);
    buf.unmap();
    buf.destroy();
    return { n, data: out };
  }
  /** An rgba16float field read back whole as floats (the Gray–Scott field where it is half floats), for checks. */
  private async readHalf(pp: PingPong): Promise<{ n: number; data: Float32Array }> {
    const n = pp.size[0];
    const row = Math.ceil((n * 8) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read half', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read half' });
    enc.copyTextureToBuffer({ texture: pp.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Uint16Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const half = (h: number) => {
      const e = (h >> 10) & 31, m = h & 1023, sign = h & 32768 ? -1 : 1;
      return sign * (e === 0 ? m * 2 ** -24 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15));
    };
    const out = new Float32Array(n * n * 4);
    const stride = row / 2;
    for (let y = 0; y < n; y++) for (let k = 0; k < n * 4; k++) out[y * n * 4 + k] = half(all[y * stride + k]);
    return { n, data: out };
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
    this.submitRead(enc);
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
   * RGBA32, so sixteen bytes a texel — r is the gap between the glasses, g is
   * how fast it is changing, which is the thing that moves any liquid at all.
   * (b is the rate the press's memory carries on, g without the rhythm
   * sheet's; a what the floor has refused the sheet: squeezeUpdate, PLAN
   * 27f-4. Not read back.)
   */
  async readSqueeze(): Promise<{ n: number; gap: Float32Array; rate: Float32Array } | null> {
    const n = this.N;
    const row = Math.ceil((n * 16) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read squeeze', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read squeeze' });
    enc.copyTextureToBuffer({ texture: this.squeeze.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const gap = new Float32Array(n * n), rate = new Float32Array(n * n);
    const stride = row / 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        gap[y * n + x] = all[y * stride + x * 4];
        rate[y * n + x] = all[y * stride + x * 4 + 1];
      }
    }
    buf.unmap();
    buf.destroy();
    return { n, gap, rate };
  }

  /**
   * What the swirl stage costs the GPU, for `npm run swirlcost` (PLAN 22k):
   * `reps` swirl stages, as a thin plate runs it (`thin`) or as the old
   * plate does, encoded back to back in one pass and timed from submit to
   * the queue's done, in milliseconds.
   *
   * Timed this way because CI's Mac grants no timestamp queries (the
   * profiler reads nothing there, measured on #258), and the frame rate
   * alone could not see it: two runs of the nine looks read the swirl at
   * 2 fps of 41 and at nothing of 30, each look's own pair scattered by
   * five frames either way. It waits for the queue to empty first, so the
   * frame's own work is not timed with it, and the caller times two counts
   * of reps and takes the slope, which leaves out the submit's fixed cost.
   *
   * On the plate's own swirl textures, with a made-up drive: on the thin
   * plate what it writes is overwritten by the next step that runs the
   * swirl, and the next step that does not empties it (swirlLive).
   */
  async benchSwirl(reps: number, thin: boolean): Promise<number> {
    const p = { spinDish: 0.01, spinLiquid: 0.02, spinTau: 3, spinNu: 1e-6, magnetSeconds: 1 / 60, spinDyeWeight: 0.5 } as GpuStepParams;
    const enc = this.device.createCommandEncoder({ label: 'bench swirl' });
    const pass = enc.beginComputePass({ label: 'bench swirl' });
    for (let k = 0; k < reps; k++) this.stepSwirl(pass, p, thin);
    pass.end();
    this.swirlLive = true;
    // Behind whatever the frame has already queued, so it is not timed with it.
    await this.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    this.submit(enc);
    await this.device.queue.onSubmittedWorkDone();
    return performance.now() - t0;
  }

  /**
   * The spun dish's swirl (spinSwirl), read back whole on its own grid: m × m
   * velocities (x, y), plate widths a second, in the frame turning with the
   * liquid. For `npm run dish`, not for a frame.
   */
  async readSwirl(): Promise<{ m: number; data: Float32Array }> {
    const m = this.M;
    const row = Math.ceil((m * 8) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read swirl', size: row * m, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read swirl' });
    enc.copyTextureToBuffer({ texture: this.swirl.read }, { buffer: buf, bytesPerRow: row }, [m, m]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const half = (h: number): number => {
      const e = (h >> 10) & 0x1f, f = h & 0x3ff, sgn = h & 0x8000 ? -1 : 1;
      return e === 0 ? sgn * f * 2 ** -24 : e === 31 ? (f ? NaN : sgn * Infinity) : sgn * (1 + f / 1024) * 2 ** (e - 15);
    };
    const data = new Float32Array(m * m * 2);
    const stride = row / 2;
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      data[(y * m + x) * 2] = half(halves[y * stride + x * 4]);
      data[(y * m + x) * 2 + 1] = half(halves[y * stride + x * 4 + 1]);
    }
    return { m, data };
  }

  async readAir(): Promise<{ n: number; data: Float32Array } | null> {
    if (!this.air) return null;
    const n = this.N;
    /*
      Eight bytes a texel, because the field is `rgba16float` (it was
      `r16float`, two bytes, before it carried the bubbles' looks).

      This read assumed four and a `Float32Array` when the field was
      `r32float`, and kept assuming it after the format changed. What it
      produced was not an error: it was a field with air in it, 190 cells
      of it, peaking at 0.01 and sitting a sixth of the plate from where the
      bubble was. Two half floats read as one single. Every conclusion drawn
      from it was about the reader.
    */
    // Four half floats a texel since the field carries the bubbles' looks too; the coverage is the first.
    const row = Math.ceil((n * 8) / 256) * 256;
    const buf = this.device.createBuffer({ label: 'read air', size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read air' });
    enc.copyTextureToBuffer({ texture: this.air.field }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n);
    const stride = row / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const h = halves[y * stride + x * 4];
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

  /**
   * How many substeps the last thin step's carries took, and the Courant
   * number that asked for them, and the whole cells of the glass's drift
   * taken out of them (driftCells): for a check. Null off a thin gap.
   */
  async readCarry(): Promise<{ n: number; courant: number; drift: [number, number]; glass: [number, number] } | null> {
    if (!this.carrySub) return null;
    const drift: [number, number] = this.riding ? [this.driftCells[0] + this.driftCells[2], this.driftCells[1] + this.driftCells[3]] : [0, 0];
    const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read carry' });
    enc.copyBufferToBuffer(this.carrySub, 0, buf, 0, 16);
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    return { n: f[1], courant: f[2], drift, glass: [this.glassCells[0], this.glassCells[1]] };
  }

  // ── What the CPU reads ────────────────────────────────────────────

  /**
   * Start a read of both fields, downsampled to the logical grid, and take
   * whatever has come back. The readers (the bead camera, the dye regulator)
   * see a field a frame or two old, as they did on WebGL.
   */
  readbackAsync(): boolean {
    // Asked only after a write, each landing taken once (`ReadGate`, PLAN 14ab-3).
    const rings = this.rbRings;
    if (this.reads.wants([rings.dye, rings.vel])) {
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
        slots.push({ which, buf: rings[which].copyFrom(enc, this.rbStaging[which]) });
      }
      this.submitRead(enc);
      for (const s of slots) if (s.buf) rings[s.which].collect(s.buf);
      if (slots.every((s) => s.buf)) this.reads.askedNow();
    }
    let fresh = false;
    for (const which of ['dye', 'vel'] as const) {
      const data = this.reads.take(rings[which]);
      if (!data) continue;
      const src = new Float32Array(data);
      const dst = which === 'dye' ? this.rbDye : this.rbVel;
      const stride = this.rbRow / 4;
      for (let y = 0; y < this.L; y++) dst.set(src.subarray(y * stride, y * stride + this.L * 4), y * this.L * 4);
      if (which === 'dye') this.rbDyeSeq = rings.dye.landed;
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
    new Float32Array(buf, 8, 1)[0] = this.thinLive ? 1 : 0;
    this.device.queue.writeBuffer(this.statsArgs, 0, buf);
    const enc = this.device.createCommandEncoder({ label: 'measure' });
    const pass = enc.beginComputePass({ label: 'measure' });
    this.statsRun(pass, 'statsTiles', [this.dye.read, this.velForced, this.statsPartials], STATS_GROUPS);
    this.statsRun(pass, 'statsFold', [this.statsPartials, this.statsResult], 1);
    pass.end();
    const slot = this.statsRing.copyFrom(enc, this.statsResult);
    this.submitRead(enc);
    if (slot) this.statsRing.collect(slot);
    const data = this.statsRing.latest;
    this.statsFresh = !!data;
    if (data && this.statsRing.landed > this.statsLatest.at) {
      const f = new Float32Array(data);
      const area = this.thinLive ? this.dishArea : this.N * this.N;
      this.statsLatest = {
        meanDensity: f[3] / area,
        meanColor: [f[0] / area, f[1] / area, f[2] / area],
        maxDensity: f[4], maxVx: f[5], maxVy: f[6], maxSpeed: f[7],
        at: this.statsRing.landed,
      };
    }
    return this.statsLatest;
  }

  /** Number of grid cells inside the circular dish rim (r < OPEN_RIM = 0.5) on a thin gap. */
  private get dishArea(): number { return rimCount(this.N); }

  /**
   * The same measurement, waiting for the GPU. For harnesses, not the show:
   * it answers about the plate as it is now rather than as it was two frames
   * ago, at the cost of a stall.
   */
  async measureNow(): Promise<FieldStats> {
    const buf = new ArrayBuffer(16);
    new Float32Array(buf, 0, 1)[0] = this.N;
    new Uint32Array(buf, 4, 1)[0] = STATS_GROUPS;
    new Float32Array(buf, 8, 1)[0] = this.thinLive ? 1 : 0;
    this.device.queue.writeBuffer(this.statsArgs, 0, buf);
    const out = this.device.createBuffer({ label: 'stats now', size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'measure now' });
    const pass = enc.beginComputePass({ label: 'measure now' });
    this.statsRun(pass, 'statsTiles', [this.dye.read, this.velForced, this.statsPartials], STATS_GROUPS);
    this.statsRun(pass, 'statsFold', [this.statsPartials, this.statsResult], 1);
    pass.end();
    enc.copyBufferToBuffer(this.statsResult, 0, out, 0, 32);
    this.submitRead(enc);
    await out.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(out.getMappedRange().slice(0));
    out.unmap();
    out.destroy();
    const area = this.thinLive ? this.dishArea : this.N * this.N;
    return {
      meanDensity: f[3] / area,
      meanColor: [f[0] / area, f[1] / area, f[2] / area],
      maxDensity: f[4], maxVx: f[5], maxVy: f[6], maxSpeed: f[7],
      at: this.statsLatest.at,
    };
  }

  private statsRun(pass: GPUComputePassEncoder, name: string, rest: (GPUBuffer | GPUTexture)[], groups: number): void {
    const pipe = this.pipelines.computePipeline(name, STATS_KERNELS[name]);
    if (!pipe) return;
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

  /** Read a field straight out, waiting for the GPU. For the parity harness, not the show. */
  async readField(which: 'dye' | 'vel' | 'grain' | 'oilDye' | 'species' | 'mix'): Promise<Float32Array> {
    const src = which === 'dye' ? this.dye.read : which === 'vel' ? this.velForced : which === 'oilDye' ? this.oilDye?.read
      : which === 'mix' ? (this.mixLive ? this.mix?.read : this.blank('rgba'))
      : which === 'species' ? (this.speciesLive ? this.species?.read : this.blank('rgba')) : this.grain?.read;
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
    this.submitRead(enc);
    await buf.mapAsync(GPUMapMode.READ);
    const padded = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const out = new Float32Array(this.L * this.L * 4);
    const stride = row / 4;
    for (let y = 0; y < this.L; y++) out.set(padded.subarray(y * stride, y * stride + this.L * 4), y * this.L * 4);
    return out;
  }
}
