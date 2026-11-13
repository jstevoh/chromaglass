/**
 * The frame's soap film on the plate (PLAN 32d): the draining film of §32,
 * stepped with the plate and drawn by it.
 *
 * What was reported (2026-11-12, the looks filmed against the owner's
 * references): Soap Film was 82 to 87% black, mean luminance 0.05 against
 * 0.48 for the owner's "Liquid Tapestry" photograph, and one hue (spread 0.02
 * against 0.41). The look had no film in it. Its colour was Thin Film's ring
 * table read off the *dye's* amount and multiplied onto the dye's own colour,
 * so where the soap tore the dye away there was nothing to colour, and where
 * it stayed the rainbow was a tint of one pigment. The holes tore a sheet
 * that never refilled.
 *
 * What it is now. The frame holds a real film, with a thickness in
 * nanometres (`createSoapFilmGpu`, src/gpu/soapFilm.ts, the solver `npm run
 * soapgpu` holds to the CPU reference): thick film sinks and thin film rises
 * in an inextensible sheet, the frame's Plateau border drains it, it
 * evaporates, black spots open on Vrij's clock. The plate draws its reflected
 * interference colour (plateThinFilm.ts, `soapFilmOver`), so the rainbow is
 * the Newton series of the film's own thickness, from silver through the
 * orders to black, and it is everywhere there is film. Two things join it to
 * the plate (wgsl/soapFilmPlate.ts says why each is the physics):
 *
 * - the air over the frame (gpu/soapAir.ts, 32d-1), a fluid of its own that
 *   the plate's tools and the music stir and the film's own plumes spin up,
 *   keeps turning and drags the film with it, and the film's tension turns
 *   that into swirls and combed streaks, never a stretch;
 * - when the film has drained (mean under SOAP_REDIP_NM) the frame is dipped
 *   and drawn again, top first, a fresh film thick at the bottom.
 *
 * Off (Soap Film at 0, every look but this one) nothing here is made or run.
 */
import { Disposer, PipelineCache, bindGroup, type Prep } from './kit';
import type { Opening } from './opening';
import { createSoapFilmGpu, type SoapFilmGpu } from './soapFilm';
import { SoapAir } from './soapAir';
import { SOAP_KERNELS } from './wgsl/soapFilm';
import { NOISE_CELLS, SOAP_PLATE_KERNELS, type SoapPlateKernel } from './wgsl/soapFilmPlate';

/** The film's grid, square, filling the plate. 128 keeps the solver's single-workgroup passes under a couple of milliseconds on Metal. */
export const SOAP_PLATE_GRID = 128;
/** A cell of it, metres: a 12.8 cm frame, the size of a hand-held one. */
export const SOAP_PLATE_DX = 1e-3;
/** Evaporation, nm/s: the reference's (32a). */
export const SOAP_EVAP = 5;
/** The frame's Plateau border radius, metres (32f). */
export const SOAP_BORDER = 1e-3;
/** A film whose mean thickness is under this, nm, is drawn again: mostly black film by then, the colour gone. */
export const SOAP_REDIP_NM = 160;
/** A fresh film's thickness at the top and the bottom of the frame, nm (a film drawn at hand speed is a micron or two, Frankel's law). */
export const SOAP_FRESH_TOP = 350;
export const SOAP_FRESH_BOTTOM = 750;
/**
 * Its noise, a share of its thickness. A drawn film is never even, and the
 * uneven patches are what the buoyancy turns into rising and sinking plumes.
 * It was the CPU reference's 25% on 6 mm patches (32a), which on the plate
 * left a frame of small, faint blobs: about 12 forms a frame on the Mac
 * against the owner's photograph's 55 (2026-11-13). A film drawn by hand
 * from a bath comes out in thick and thin sheets a centimetre or more across
 * that differ by tens of percent (the frame's pull is never steady: Frankel's
 * thickness goes as the pull speed to the 2/3, so a hand slowing by half
 * lays film 37% thinner), and those sheets are what the film's big swirls
 * (gpu/soapAir.ts, 32k) fold into marbling. So 50% on 12 mm patches, still
 * named a laid profile and not a pull (32d-2).
 */
export const SOAP_FRESH_NOISE = 0.5;
/** The frame comes out of the bath in about two seconds of the film's clock. */
const PULL_SECONDS = 2;
/** The longest step the film takes at once, seconds: past it the frame waits (a hitch, or a rate far past real). */
const MAX_STEP = 0.25;

/**
 * What the step asks of the film (GpuStepParams.soapFilm, soapFilmRate, soapFilmTilt): the
 * front plate's alone. The frame hangs in front of the plates, and the plate
 * draws the front layer's film, so a back plate never runs one (and Soap Film
 * is not a setting a patch can aim at one plate, npm run panel).
 */
export function soapFilmStep(s: { soapFilm?: number; soapFilmRate?: number; soapFilmTilt?: number }, layer: number): { soapFilm?: number; soapFilmRate?: number; soapFilmTilt?: number } {
  return layer > 0 ? {} : { soapFilm: s.soapFilm ?? 0, soapFilmRate: s.soapFilmRate ?? 1, soapFilmTilt: s.soapFilmTilt ?? 90 };
}

/** A fresh film's mean thickness, nm: the mean of Mysels' √z from top to bottom. */
const FRESH_MEAN = SOAP_FRESH_TOP + (SOAP_FRESH_BOTTOM - SOAP_FRESH_TOP) * (2 / 3);
/**
 * A fresh film's thickness at depth `depth` (0 the top, 1 the bottom), before
 * its noise: Mysels' √z (wgsl/soapFilmPlate.ts) for a hanging frame. `lean`
 * is the sine of the frame's tilt from flat (32h): the profile is drainage
 * under gravity's pull along the film, so a frame lying nearer flat comes out
 * of the bath evener, the same film on the average.
 */
export function freshFilm(depth: number, lean = 1): number {
  const hanging = SOAP_FRESH_TOP + (SOAP_FRESH_BOTTOM - SOAP_FRESH_TOP) * Math.sqrt(Math.max(0, Math.min(1, depth)));
  return FRESH_MEAN + lean * (hanging - FRESH_MEAN);
}

/** The sine of a frame tilt in degrees from flat (Frame Tilt, 32h): gravity's share along the film. */
export function soapLean(tiltDeg: number | undefined): number {
  const t = Math.max(0, Math.min(90, tiltDeg ?? 90));
  return Math.sin((t * Math.PI) / 180);
}

export interface SoapFilmField {
  /** Thickness, nm, row 0 at the top of the frame. */
  h: GPUBuffer;
  nx: number;
  ny: number;
}

export class SoapFilmPlate {
  private readonly disposer = new Disposer();
  private readonly film: SoapFilmGpu;
  private readonly uni: GPUBuffer;
  private readonly pullBuf: GPUBuffer;
  readonly air: SoapAir;
  private readonly statePipe: GPUComputePipeline;
  private readonly pullPipe: GPUComputePipeline;
  private readonly stateBg: GPUBindGroup;
  private readonly pullBg: GPUBindGroup;
  private readonly args = new ArrayBuffer(48);
  private readonly u32 = new Uint32Array(this.args);
  private readonly f32 = new Float32Array(this.args);
  private seed = 1;
  /** The sine of the frame's tilt from flat (soapLean): 1 hanging. */
  lean = 1;

  /**
   * The film's pipelines, for the show to build before it opens (gpu/prepare.ts):
   * the solver's and the plate's, in their caches' names, ahead when the look
   * hangs a frame from its first step (gpu/opening.ts, soap), behind otherwise.
   */
  static prepare(device: GPUDevice, open: Opening): Prep[] {
    const film = PipelineCache.for(device, 'soapFilm');
    const plate = PipelineCache.for(device, 'soapFilmPlate');
    const air = PipelineCache.for(device, 'soapAir');
    return [
      ...Object.entries(SOAP_KERNELS).map(([k, code]) => film.computePrep(k, code, !open.soap)),
      ...Object.entries(SOAP_PLATE_KERNELS).map(([k, code]) => plate.computePrep(k, code, !open.soap)),
      ...SoapAir.kernels().map(([k, code]) => air.computePrep(k, code, !open.soap)),
    ];
  }

  constructor(private readonly device: GPUDevice, n = SOAP_PLATE_GRID, lean = 1) {
    this.lean = lean;
    this.film = createSoapFilmGpu(device, { nx: n, ny: n, dx: SOAP_PLATE_DX });
    this.disposer.track({ destroy: () => this.film.destroy() });
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.uni = this.disposer.track(device.createBuffer({ label: 'soap plate args', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.pullBuf = this.disposer.track(device.createBuffer({ label: 'soap pull', size: 16, usage }));
    const pipelines = PipelineCache.for(device, 'soapFilmPlate');
    const pipe = (k: SoapPlateKernel): GPUComputePipeline => {
      const p = pipelines.computePipeline(k, SOAP_PLATE_KERNELS[k]);
      if (!p) throw new Error(`soapFilmPlate pipeline ${k} failed to build`);
      return p;
    };
    this.statePipe = pipe('soapPullState');
    this.pullPipe = pipe('soapPull');
    const b = this.film.buffers;
    this.air = new SoapAir(device, n, SOAP_PLATE_DX, b);
    this.disposer.track({ destroy: () => this.air.dispose() });
    this.stateBg = bindGroup(device, this.statePipe, [this.uni, b.stats, this.pullBuf]);
    this.pullBg = bindGroup(device, this.pullPipe, [this.uni, this.pullBuf, b.h, b.ruptured, b.age]);
    this.lay();
  }

  /** Lay a whole fresh film at once: the look opening on a film already drawn. */
  lay(): void {
    const { nx, ny } = this.film;
    const h = new Float32Array(nx * ny);
    // The pull's patches (wgsl/soapFilmPlate.ts patchNoise): a seeded lattice NOISE_CELLS apart, smoothly between.
    const lx = Math.ceil(nx / NOISE_CELLS) + 2, ly = Math.ceil(ny / NOISE_CELLS) + 2;
    const lat = new Float32Array(lx * ly);
    let s = 12345;
    for (let k = 0; k < lat.length; k++) { s = (s * 16807) % 2147483647; lat[k] = (s / 2147483647) * 2 - 1; }
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let j = 0; j < ny; j++) {
      const laid = freshFilm((j + 0.5) / ny, this.lean);
      const y = j / NOISE_CELLS, y0 = Math.floor(y), sy = smooth(y - y0);
      for (let i = 0; i < nx; i++) {
        const x = i / NOISE_CELLS, x0 = Math.floor(x), sx = smooth(x - x0);
        const a = lat[y0 * lx + x0], b = lat[y0 * lx + x0 + 1], c = lat[(y0 + 1) * lx + x0], d = lat[(y0 + 1) * lx + x0 + 1];
        const v = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
        h[j * nx + i] = laid * (1 + v * SOAP_FRESH_NOISE);
      }
    }
    this.film.write(h);
    this.device.queue.writeBuffer(this.pullBuf, 0, new Float32Array([0, 0, 0, 7]));
    const enc = this.device.createCommandEncoder({ label: 'soap lay' });
    this.air.calm(enc);
    this.device.queue.submit([enc.finish()]);
  }

  /**
   * One step of the film on `enc`, `seconds` of its own clock (the show's
   * seconds times the drain rate). `vel` is the plate's flow and `travel`
   * the metres of the frame a unit of it carries the dye on this step: the
   * stir the film's air takes up, at the speed the plate carries its dye,
   * whatever the drain rate. With no flow the air turns only with what the
   * film's own plumes give it.
   */
  step(enc: GPUCommandEncoder, seconds: number, vel: GPUTexture | null, travel: number): void {
    const dt = Math.min(MAX_STEP, seconds);
    if (!(dt > 0)) return;
    const airScale = travel / dt;
    const { nx, ny } = this.film;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.u32[0] = nx;
    this.u32[1] = ny;
    this.u32[2] = this.seed;
    this.u32[3] = 0;
    this.f32[4] = 0;
    this.f32[5] = SOAP_REDIP_NM;
    this.f32[6] = (ny * dt) / PULL_SECONDS;
    this.f32[7] = freshFilm(0, this.lean);
    this.f32[8] = freshFilm(1, this.lean);
    this.f32[9] = SOAP_FRESH_NOISE;
    this.device.queue.writeBuffer(this.uni, 0, this.args);
    // The air takes its step first, on the film's last velocities, and
    // writes the push the film takes on this one (gpu/soapAir.ts).
    this.air.step(enc, dt, vel, airScale, this.lean);
    this.film.encode(enc, dt, { evap: SOAP_EVAP, border: SOAP_BORDER, g: 9.81 * this.lean });
    const pass = enc.beginComputePass({ label: 'soap pull' });
    pass.setPipeline(this.statePipe);
    pass.setBindGroup(0, this.stateBg);
    pass.dispatchWorkgroups(1);
    pass.setPipeline(this.pullPipe);
    pass.setBindGroup(0, this.pullBg);
    pass.dispatchWorkgroups(Math.ceil((nx * ny) / 64));
    pass.end();
  }

  get field(): SoapFilmField {
    return { h: this.film.buffers.h, nx: this.film.nx, ny: this.film.ny };
  }

  /** For checks: the film's thickness, read back (never in the show). */
  read(): Promise<{ h: Float32Array }> {
    return this.film.read();
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
