/**
 * The air over the frame's soap film (PLAN 32d-1), stepped before the film
 * and written into its `ext` faces. Kernels in `wgsl/soapAir.ts`.
 *
 * What was reported (2026-11-13, the owner's "Liquid Tapestry" photograph
 * against Soap Film filmed on the Mac after 32d): about 12 bright forms a frame
 * against the photograph's 55 to 62, and none of its combed, folded streaks.
 * What was measured in the lab (the real solver and plate shader, the film
 * stirred by a random swirl every third step): the stir moved the film a cell
 * or two and the picture stayed the film's laid 6 mm patches and its drainage
 * plumes, 14 to 26 forms, the same with the stir as without it. The film took
 * the plate's flow as its air, step by step: it moved only while the plate
 * moved, as far as the dye moved, and stopped when the plate stopped. Nothing
 * over the film kept turning.
 *
 * A real film's air does. A hand-held film is overdamped (its mass per area
 * is a milligram per square centimetre, its friction time milliseconds), so it
 * goes where the air over it goes, and the air is a fluid with inertia: a
 * breath, a hand passing, the film's own draining plumes set it moving and it
 * keeps turning for seconds (its slab a few millimetres deep, δ ≈ √(ν t) for a
 * motion of a second or two, loses its momentum to the still room at ν/δ²,
 * about 0.6 a second), rolling up into eddies the size of the frame's
 * centimetres. Those eddies are what fold a film into streaks and marbling:
 * the air's flow stretches the film's patches into threads (chaotic
 * advection), and the film's tension keeps it inextensible while it does.
 * So the air here is its own fluid (`wgsl/soapAir.ts` says what acts on it),
 * on a grid half the film's, stepped on the film's clock.
 *
 * The plate's flow is still how the hands and the music reach it (named
 * shortcut 32d-1: no breath or hand of its own), now as a stir the air takes
 * up and keeps, not a velocity the film copies.
 */
import { Disposer, PipelineCache, bindGroup } from './kit';
import { SOAP_AIR_KERNELS, type SoapAirKernel } from './wgsl/soapAir';

/** The air's grid over the frame: half the film's, 2 mm cells (its eddies are centimetres). */
export const SOAP_AIR_RATIO = 2;
/** Air: kinematic viscosity (m²/s), density (kg/m³), dynamic viscosity (Pa·s). */
const NU_AIR = 1.5e-5;
const RHO_AIR = 1.2;
const MU_AIR = NU_AIR * RHO_AIR;
/**
 * The slab of air the film drags, metres: the boundary layer a motion of a
 * couple of seconds carries, √(ν t) at t = 2 s.
 */
export const SOAP_AIR_DEPTH = 5.5e-3;
/** The film's two faces drag the slab toward the film's velocity, per second: 2 μ / (ρ δ²). */
export const SOAP_AIR_K_FILM = (2 * MU_AIR) / (RHO_AIR * SOAP_AIR_DEPTH * SOAP_AIR_DEPTH);
/** The still room behind the slab takes its momentum back, per second: ν / δ². */
export const SOAP_AIR_DECAY = NU_AIR / (SOAP_AIR_DEPTH * SOAP_AIR_DEPTH);
/**
 * The plate's flow pushes the air, per second (named shortcut 32d-1). A push,
 * not a drag toward the plate's velocity, so where the plate is still the air
 * keeps turning. Its size: the film used to copy the plate's velocity at once
 * (as far as the dye went), and the air's spin-up of 1 / (kFilm + λ), about
 * 0.7 s, would leave a short stir carrying the film a third as far; at 6 a
 * second a half-second stir carries it about as far as it did
 * (`npm run soapplate`: 11.6 nm under the stir, against 15 when that line was
 * written and 5.9 at a push of 3), and a stir held steady leaves the air
 * turning at kStir / (kFilm + λ), four times the dye's speed. Named: the
 * dye rides a thick liquid, and the air a hand moves over the film is quicker
 * than it; how much quicker is this constant until the air has a stir of its
 * own (32d-1).
 */
export const SOAP_AIR_K_STIR = 6;
/**
 * The film's own resistance (PLAN 32k). The air's drag on the film's two
 * faces, Pa·s/m: 2 μ_air / δ, the same for a motion of any size.
 */
export const SOAP_ZETA_AIR = (2 * MU_AIR) / SOAP_AIR_DEPTH;
/** The solver's Darcy friction (wgsl/soapFilm.ts DEFAULT_ZETA), tuned to the film's patches (32i). */
const ZETA_PATCH = 1.5;
/**
 * The film's surface shear viscosity, Pa·s·m: the one at which its own
 * resistance to a motion the size of the laid patches (6 mm, k = 2π / 6 mm)
 * is the solver's tuned ζ, η k² = ζ, so the patches crawl as they did and
 * only the bigger motions are freed. 1.4e-6 Pa·s·m (1.4e-3 surface poise),
 * inside what is measured on glycerol-and-polymer bubble solutions.
 */
export const SOAP_ETA_FILM = ZETA_PATCH / (2 * Math.PI / 6e-3) ** 2;
/** Sweeps a step of the Brinkman solve, warm-started (even). */
const BRINK = 40;
/** The projection's sweeps a step, warm-started from the last step's pressure (even, so it ends in the buffer it began in). */
const JACOBI = 40;

export class SoapAir {
  private readonly disposer = new Disposer();
  readonly g: number;
  private readonly uni: GPUBuffer;
  private readonly air: GPUBuffer;
  private readonly next: GPUBuffer;
  private readonly div: GPUBuffer;
  private readonly p: [GPUBuffer, GPUBuffer];
  private readonly src: GPUBuffer;
  private forceBg: GPUBindGroup | null = null;
  private readonly w: [GPUBuffer, GPUBuffer];
  private readonly wp: GPUBuffer;
  private readonly pw: [GPUBuffer, GPUBuffer];
  private readonly wDivBg: GPUBindGroup;
  private readonly wJacobiBg: [GPUBindGroup, GPUBindGroup];
  private readonly wProjectBg: GPUBindGroup;
  private readonly brinkSourceBg: GPUBindGroup;
  private readonly brinkBg: [GPUBindGroup, GPUBindGroup];
  private readonly still: GPUTexture;
  private readonly pipes: Record<SoapAirKernel, GPUComputePipeline>;
  private readonly divBg: GPUBindGroup;
  private readonly jacobiBg: [GPUBindGroup, GPUBindGroup];
  private readonly projectBg: GPUBindGroup;
  private readonly extBg: GPUBindGroup;
  private forceVel: GPUTexture | null = null;
  private readonly args = new ArrayBuffer(64);
  private readonly u32 = new Uint32Array(this.args);
  private readonly f32 = new Float32Array(this.args);

  /**
   * `n` the film's cells a side and `dx` a film cell in metres; `uf`, `vf`
   * the film's projected face velocities (what drags the air) and `ext` the
   * film's outside push (what the air writes).
   */
  constructor(private readonly device: GPUDevice, private readonly n: number, dx: number, private readonly film: { h: GPUBuffer; uf: GPUBuffer; vf: GPUBuffer; ext: GPUBuffer }) {
    if (n % SOAP_AIR_RATIO) throw new Error(`soap air: the film's ${n} cells do not halve`);
    this.g = n / SOAP_AIR_RATIO;
    const cells = this.g * this.g;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const buf = (label: string, bytes: number) => this.disposer.track(device.createBuffer({ label, size: bytes, usage }));
    this.uni = this.disposer.track(device.createBuffer({ label: 'soap air args', size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.air = buf('soap air', cells * 8);
    this.next = buf('soap air next', cells * 8);
    this.div = buf('soap air div', cells * 4);
    this.p = [buf('soap air p0', cells * 4), buf('soap air p1', cells * 4)];
    this.src = buf('soap brinkman source', cells * 16);
    this.w = [buf('soap brinkman w0', cells * 8), buf('soap brinkman w1', cells * 8)];
    this.wp = buf('soap brinkman projected', cells * 8);
    this.pw = [buf('soap brinkman p0', cells * 4), buf('soap brinkman p1', cells * 4)];
    // Bound in the plate's flow's place when there is none: still air, no stir.
    this.still = this.disposer.track(device.createTexture({ label: 'soap air still', size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }));
    const cache = PipelineCache.for(device, 'soapAir');
    const pipe = (k: SoapAirKernel): GPUComputePipeline => {
      const p = cache.computePipeline(k, SOAP_AIR_KERNELS[k]);
      if (!p) throw new Error(`soapAir pipeline ${k} failed to build`);
      return p;
    };
    this.pipes = {
      soapAirForce: pipe('soapAirForce'),
      soapAirDiv: pipe('soapAirDiv'),
      soapAirJacobi: pipe('soapAirJacobi'),
      soapAirProject: pipe('soapAirProject'),
      soapAirBrinkSource: pipe('soapAirBrinkSource'),
      soapAirBrinkJacobi: pipe('soapAirBrinkJacobi'),
      soapAirExt: pipe('soapAirExt'),
    };
    this.divBg = bindGroup(device, this.pipes.soapAirDiv, [this.uni, this.next, this.div]);
    this.jacobiBg = [
      bindGroup(device, this.pipes.soapAirJacobi, [this.uni, this.p[0], this.div, this.p[1]]),
      bindGroup(device, this.pipes.soapAirJacobi, [this.uni, this.p[1], this.div, this.p[0]]),
    ];
    this.projectBg = bindGroup(device, this.pipes.soapAirProject, [this.uni, this.next, this.p[0], this.air]);
    this.brinkSourceBg = bindGroup(device, this.pipes.soapAirBrinkSource, [this.uni, film.h, this.src]);
    this.brinkBg = [
      bindGroup(device, this.pipes.soapAirBrinkJacobi, [this.uni, this.src, this.w[0], this.w[1]]),
      bindGroup(device, this.pipes.soapAirBrinkJacobi, [this.uni, this.src, this.w[1], this.w[0]]),
    ];
    // The big swirls are a flow of the film, which is inextensible: projected
    // here on the air's grid as the air is, so the solver's own projection is
    // left only the fine scales' residue to take out.
    this.wDivBg = bindGroup(device, this.pipes.soapAirDiv, [this.uni, this.w[0], this.div]);
    this.wJacobiBg = [
      bindGroup(device, this.pipes.soapAirJacobi, [this.uni, this.pw[0], this.div, this.pw[1]]),
      bindGroup(device, this.pipes.soapAirJacobi, [this.uni, this.pw[1], this.div, this.pw[0]]),
    ];
    this.wProjectBg = bindGroup(device, this.pipes.soapAirProject, [this.uni, this.w[0], this.pw[0], this.wp]);
    this.extBg = bindGroup(device, this.pipes.soapAirExt, [this.uni, this.air, this.wp, this.src, film.ext]);
    this.u32[0] = this.g;
    this.u32[1] = n;
    this.f32[5] = dx * SOAP_AIR_RATIO;
    this.f32[7] = SOAP_AIR_K_FILM;
    this.f32[8] = SOAP_AIR_K_STIR;
    this.f32[9] = SOAP_AIR_DECAY;
    const cell = dx * SOAP_AIR_RATIO;
    this.f32[10] = SOAP_ETA_FILM / SOAP_ZETA_AIR / (cell * cell);
  }

  /** The kernels, for the show to build before it opens (SoapFilmPlate.prepare). */
  static kernels(): [string, string][] {
    return Object.entries(SOAP_AIR_KERNELS);
  }

  /** Still air: a fresh frame in a quiet room. */
  calm(enc: GPUCommandEncoder): void {
    enc.clearBuffer(this.air);
    enc.clearBuffer(this.p[0]);
    enc.clearBuffer(this.p[1]);
    enc.clearBuffer(this.w[0]);
    enc.clearBuffer(this.w[1]);
    enc.clearBuffer(this.pw[0]);
    enc.clearBuffer(this.pw[1]);
  }

  /**
   * One step of the air on `enc`, `dt` film seconds, stirred by the plate's
   * flow `vel` at `stirScale` m/s a unit (none when `vel` is null), then
   * written into the film's `ext`. The film's faces it reads are the last
   * step's: the air and the film take turns.
   */
  step(enc: GPUCommandEncoder, dt: number, vel: GPUTexture | null, stirScale: number, lean = 1): void {
    // Gravity along the film: g times the sine of the frame's tilt from flat (32h).
    const rhoG = 1000 * 9.81 * 1e-9 * lean;
    this.f32[11] = rhoG / SOAP_ZETA_AIR;
    this.f32[12] = rhoG / ZETA_PATCH;
    this.f32[4] = dt;
    this.f32[6] = vel && Number.isFinite(stirScale) ? stirScale : 0;
    this.device.queue.writeBuffer(this.uni, 0, this.args);
    const tex = vel ?? this.still;
    if (tex !== this.forceVel || !this.forceBg) {
      this.forceBg = bindGroup(this.device, this.pipes.soapAirForce, [this.uni, tex, this.film.uf, this.film.vf, this.air, this.next]);
      this.forceVel = tex;
    }
    const cellsGroups = Math.ceil((this.g * this.g) / 64);
    const faces = (this.n + 1) * this.n * 2;
    const pass = enc.beginComputePass({ label: 'soap air' });
    pass.setPipeline(this.pipes.soapAirForce);
    pass.setBindGroup(0, this.forceBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirDiv);
    pass.setBindGroup(0, this.divBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirJacobi);
    for (let s = 0; s < JACOBI; s++) {
      pass.setBindGroup(0, this.jacobiBg[s & 1]);
      pass.dispatchWorkgroups(cellsGroups);
    }
    pass.setPipeline(this.pipes.soapAirProject);
    pass.setBindGroup(0, this.projectBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirBrinkSource);
    pass.setBindGroup(0, this.brinkSourceBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirBrinkJacobi);
    for (let s = 0; s < BRINK; s++) {
      pass.setBindGroup(0, this.brinkBg[s & 1]);
      pass.dispatchWorkgroups(cellsGroups);
    }
    pass.setPipeline(this.pipes.soapAirDiv);
    pass.setBindGroup(0, this.wDivBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirJacobi);
    for (let s = 0; s < JACOBI; s++) {
      pass.setBindGroup(0, this.wJacobiBg[s & 1]);
      pass.dispatchWorkgroups(cellsGroups);
    }
    pass.setPipeline(this.pipes.soapAirProject);
    pass.setBindGroup(0, this.wProjectBg);
    pass.dispatchWorkgroups(cellsGroups);
    pass.setPipeline(this.pipes.soapAirExt);
    pass.setBindGroup(0, this.extBg);
    pass.dispatchWorkgroups(Math.ceil(faces / 64));
    pass.end();
  }

  /** For checks: the air's velocity, (x, y) a cell, m/s, row 0 at the top (never in the show). */
  async read(): Promise<Float32Array> {
    const bytes = this.g * this.g * 8;
    const rb = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.air, 0, rb, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(rb.getMappedRange()).slice();
    rb.destroy();
    return out;
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
