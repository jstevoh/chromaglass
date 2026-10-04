/**
 * The ferrofluid standing up into domes under a magnet (PLAN §9t): the patch
 * round each magnet where the layer's thickness is stepped as a thin film.
 * The physics, and what it replaced, are in wgsl/standing.ts; this is how
 * the plate's step drives it.
 */
import { Disposer, PipelineCache, bindGroup } from './kit';
import { SPIKES_WGSL, SPIKE_ONSET, SPIKE_PITCH } from './wgsl/spikes';
import { FILM_H0, STAND_WINDOW, standingKernels } from './wgsl/standing';

/*
  The layer, in the capillary length l_c = √(σ / Δρ g), which the plate
  already has: spikes.ts's SPIKE_PITCH, 0.04 of the plate, is the onset's
  wavelength 2π l_c, so l_c is 0.0064 of the plate (1.3 mm on the 0.2 m
  plate fluid.ts's thin gap is sized to).

  H0: how deep a full cell's layer is, 0.3 l_c (0.4 mm), the lab's depth: the
  references' films are a fraction of a millimetre, and a layer thinner than
  its domes is what lets the valleys dry. EPS: the precursor film over the
  dry glass, a tenth of that. THETA: the contact angle, 10°. The lab's 35°
  made a layer 0.3 deep thinner than the puddle the angle wants (2 sin(θ/2),
  0.6 l_c), so a poured pool drew itself in to half its radius with no field
  under it, which a real pool on the plate does not. HS: where the lift
  stops growing with height (wgsl/standing.ts, S(h)).

  LANGEVIN: the field at which the liquid is a third saturated, as a share
  of the hand's magnet at the glass (wgsl/standing.ts, lift).
*/
const H0 = FILM_H0;
const EPS = 0.03;
const THETA = (10 * Math.PI) / 180;
const HS = 2;
const LANGEVIN = 0.035;
const LC = SPIKE_PITCH / (2 * Math.PI);
/*
  The liquid's initial susceptibility, the slope of its magnetisation at
  nought field: 2.6 for Ferrotec's EFH1, the light-show grade. It sets how
  hard the magnet pulls the layer against how hard it lifts it
  (wgsl/standing.ts, filmPressure): the pull's scale, in the film's units,
  is the lift's at saturation (2 / L(onset / LANGEVIN)², 3.08) times
  (1 + 1/μr) / (3 χ0), so 0.50. With the lab's earlier LANGEVIN of 0.07,
  where the shares below were tried, it was 0.84: under the Magnet a
  pressure 5.4 l_c deep on the axis against the pool's rim 0.12 away
  (19 l_c). A pool that size 0.27 l_c deep holds 300 l_c³; held in a
  paraboloid of that pressure against its own weight it is a mound about
  1.7 l_c high and 11 l_c (0.07 of the plate) in radius.

  The plate takes none of it yet (PULL_SHARE 0), a shortcut (PLAN 9t):
  under the film the layer is not pulled toward the magnet, only lifted,
  and the plate's own pull (phaseForce) brings the pool to the window's
  edge. Each share tried, in the lab on 384² with the hand's Magnet over a
  pool 0.12 across for four seconds:

    - the whole of it: the pool gathered into that mound, one smooth heap
      1.8 l_c high with the pool's rim left out at 0.08 as a thin ring,
      cover 0.28 within 0.08 and no domes on it: the blob the owner
      reported, now for the right reason. A real mound under a magnet
      carries a hedgehog of spikes, because the real lift is hundreds of
      times the onset's (μ0 Ms² / Δρ g l_c is about 600 for EFH1). The
      plate's lift is held to a G of 2.8 under the hand (LANGEVIN, in
      wgsl/standing.ts) so its domes stay a capillary wavelength apart,
      wider than the grid's cells; the pull, scaled as the lift is, then
      wins everywhere the domes would have
    - a quarter and a tenth: the gathering front, a contact line moving
      over dry glass on a grid of 2.4 cells to l_c, set the domes as
      ridges along the grid's axes, a cross of bars round the magnet, at
      a film step of 0.5, 0.25 and 0.125 alike, on the 5-point and the
      isotropic 9-point stencils alike
    - none: domes and short ridges strewn radially over the pool, the
      colour between them, cover 0.3, no grid in them.

  Putting it back means a finer grid under the magnet than the plate's
  (the patch at twice the plate's cells), where a front can move across
  the glass without the grid steering it; the scale it would take is the
  whole one above, with a lift nearer the real one to stand domes on the
  mound it makes.
*/
const CHI0 = 2.6;
const PULL_SHARE = 0;
function langevin(x: number): number { return x < 1e-3 ? x / 3 : 1 / Math.tanh(Math.min(x, 20)) - 1 / x; }
const PULL = PULL_SHARE * (2 / langevin(SPIKE_ONSET / LANGEVIN) ** 2) * (1 + 1 / (1 + CHI0)) / (3 * CHI0);
/*
  The film's time unit, 3 μ l_c / σ = 3 μ / (l_c Δρ g), in seconds: an
  oil-based ferrofluid of 6 mPa·s (Ferrotec's light-show grades are 5 to
  10) under water, 200 kg/m³ the denser, l_c 1.3 mm. About 7 ms, so a
  sixtieth of a second is 2.3 units, and under the hand's Magnet the pool
  0.12 across starts to part a second and a half in and is in domes by
  four (in the lab, `npm run standing`): a real one stands up faster, in
  a fraction of a second, because its G is far higher (wgsl/standing.ts,
  LIFT).

  A substep is at most a quarter of a unit (FILM_DT): at one the domes
  came out a different pattern from the same start (a starfish where
  half-unit steps made domes), at 2.3 as rings copied from the field's
  symmetry, and at a half the layer, under the pull, parted half as fast
  as at a quarter or an eighth (cover 0.50 a little over a second in,
  against 0.25 and 0.28), which agree. And at most FILM_SUBSTEPS a step:
  a slow frame runs the layer slower than real time rather than costing
  more, which at 60 frames a second is 0.87 of it.
*/
// 0.2: the plate's width in metres (fluid.ts, PLATE_METRES).
export const FILM_SECOND = (3 * 0.006) / (LC * 0.2 * 200 * 9.81);
const FILM_DT = 0.25;
const FILM_SUBSTEPS = 8;
/*
  The patch: the plate's own cells, a power of two across for the FFT, at
  least a third of the plate (the hand's field is past the onset out to 0.155
  of the plate), and 256 at most (the workgroup's line). The film acts fully
  out to half its half-width and not at all past three quarters: the FFT's
  patch wraps round, and its edges must be still. On 384² that is 0.083 and
  0.125 of the plate; on 1024², where the patch is a quarter of it, 0.06 and
  0.09.

  Why not wider, and what the window does not change. At 0.65 and 0.9
  (0.11 and 0.15 of the plate) the pool held under the hand by `npm run
  fingers` threw fewer fingers past its rim than without the film: 7/5/5/4
  on the circles 0.06 to 0.15 past the poured edge, against 11/10/9/5 with
  the window at nothing. A smaller window did not bring them back (at half
  and three quarters 6/6/8/1, at 0.4 and 0.65 6/4/6/3), nor did raising the
  plate's ceiling only where the film acts fully. What is left is the
  film's own flow, and the likeliest part of it (inferred, not yet
  isolated in a run) is the lift: it is stronger where the field is, so the
  film's pressure is lower over the magnet and the layer drains from the
  pool's rim into the domes. Measured at the end of that run, the ring 0.125 to 0.17 from the
  magnet holds 0.30 of full where the pour put 0.48, and the middle 1.1 to
  1.3. A real layer does the same (it is the magnetic normal traction's
  gradient, a pull of its own), so the rim has less to finger with; PLAN
  9t-8. Half and three quarters are kept because they leave the most of
  the pool to the plate's own fingering for the domes they give (13 within
  0.08 of the magnet, `npm run standing`).
*/
function patchSize(n: number): number {
  let p = 32;
  while (p < n / 3 && p < 256) p *= 2;
  return Math.min(p, n);
}
const WIN_FULL = 0.5;
const WIN_NONE = 0.75;
/*
  And no further on the plate than they reach on 384²: the patch is a
  different share of the plate on each grid (a third or more of it, a
  power of two), so as fractions of the patch alone the window was 0.125
  and 0.19 of the plate on 256² and 512², wider than the 0.11 and 0.15
  that cost the rim its fingers, and it jumped when the governor changed
  rungs mid-show. Capped at 0.083 and 0.125 of the plate, it is the same
  ground on every grid the patch is wide enough for; on 1024², where the
  patch is a quarter of the plate, it is the patch's half and three
  quarters (0.0625 and 0.094), as before.
*/
const WIN_FULL_PLATE = 1 / 12;
const WIN_NONE_PLATE = 1 / 8;

/*
  How far under the onset a magnet that raised domes keeps the film, as a
  share of the onset's field. Turned down, the domes lie back into the pool
  (in the lab, all of them two seconds after the field on the axis went to
  0.95 of the onset: `npm run standing`), and the film has to keep stepping
  the layer while they do, or the plate would be left holding them standing
  with nothing to lower them. Half the onset's field is well past where
  they were gone. Real domes stay a few per cent under the field that
  raised them (the hysteresis); these do not (PLAN 9t).
*/
export const FILM_FROM = 0.5;

export interface FilmMagnet { x: number; y: number; height: number; strength: number }

export class StandingFilm {
  readonly P: number;
  private readonly logP: number;
  private readonly h: GPUBuffer;
  private readonly z: GPUBuffer;
  private readonly pr: GPUBuffer;
  private readonly sh: GPUBuffer;
  private readonly tot: GPUBuffer;
  private readonly films: GPUBuffer[] = [];
  private readonly ffts: Record<'rowF' | 'colLift' | 'colStab' | 'rowB' | 'colB', GPUBuffer>;
  private readonly wins: GPUBuffer;
  private readonly groups = new Map<string, GPUBindGroup>();
  private readonly kernels: Record<string, string>;
  private ready = false;
  /** The film's steps so far, every magnet's: the noise's draw (wgsl/standing.ts, NOISE). */
  private count = 0;
  private building: Promise<void> | null = null;

  constructor(private readonly device: GPUDevice, private readonly pipelines: PipelineCache, disposer: Disposer, private readonly N: number) {
    this.P = patchSize(N);
    this.logP = Math.round(Math.log2(this.P));
    const P2 = this.P * this.P;
    const buf = (label: string, bytes: number) => disposer.track(device.createBuffer({ label, size: bytes, usage: GPUBufferUsage.STORAGE }));
    this.h = buf('film h', P2 * 4);
    this.z = buf('film z', P2 * 8);
    this.pr = buf('film p', P2 * 4);
    this.sh = buf('film short', P2 * 16);
    this.tot = buf('film total', 16);
    for (let k = 0; k < 4; k++) {
      this.films.push(disposer.track(device.createBuffer({ label: `film ${k}`, size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })));
    }
    const fft = (label: string, axis: number, sign: number, mode: number) => {
      const b = disposer.track(device.createBuffer({ label: `fft ${label}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      device.queue.writeBuffer(b, 0, new Float32Array([axis, sign, mode, 0]));
      return b;
    };
    this.ffts = { rowF: fft('rows forward', 0, -1, 0), colLift: fft('lift', 1, -1, 1), colStab: fft('stabilise', 1, -1, 2), rowB: fft('rows back', 0, 1, 0), colB: fft('cols back', 1, 1, 0) };
    this.wins = disposer.track(device.createBuffer({ label: 'film windows', size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    this.kernels = standingKernels(SPIKES_WGSL);
  }

  /**
   * Built behind the show, the first time a magnet is close enough to want
   * it: no look opens with a magnet that close, so no show's opening pays.
   * Until then the plate keeps its ferrofluid as it did without the film.
   */
  isReady(): boolean {
    void this.prepare();
    return this.ready;
  }

  /** The build isReady starts, to wait on: for checks, which measure the film from a magnet's first step. */
  prepare(): Promise<void> {
    if (!this.ready && !this.building) {
      this.building = (async () => {
        for (const [name, code] of Object.entries(this.kernels)) await this.pipelines.prepareCompute(`film:${name}`, code);
        await this.pipelines.prepareCompute('film:window', STAND_WINDOW);
        this.ready = true;
      })();
    }
    return this.building ?? Promise.resolve();
  }

  /** From the first step's noise again (fluid.ts, resetFilm). */
  reset(): void { this.count = 0; }

  /** The window's radii in cells: full inside the first, none past the second. */
  private win(): [number, number] {
    return [Math.min(WIN_FULL_PLATE * this.N, (WIN_FULL * this.P) / 2), Math.min(WIN_NONE_PLATE * this.N, (WIN_NONE * this.P) / 2)];
  }

  /** The patch's first plate cell for a magnet at (x, y): its middle on the magnet's cell. */
  private origin(m: FilmMagnet): [number, number] {
    return [Math.floor(m.x * this.N) - this.P / 2, Math.floor(m.y * this.N) - this.P / 2];
  }

  /** The window the plate's own passes step aside by, over the whole plate. */
  window(pass: GPUComputePassEncoder, mags: FilmMagnet[], dst: GPUTexture): void {
    const v = new Float32Array(20);
    mags.slice(0, 4).forEach((m, k) => {
      const [ox, oy] = this.origin(m);
      v[k * 4] = ox + this.P / 2; v[k * 4 + 1] = oy + this.P / 2;
    });
    v[16] = this.N; v[17] = Math.min(mags.length, 4);
    [v[18], v[19]] = this.win();
    this.device.queue.writeBuffer(this.wins, 0, v);
    const pipe = this.pipelines.computePipeline('film:window', STAND_WINDOW);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.group(`window:${dst.label}`, pipe, [this.wins, dst]));
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * One step of the layer round magnet `slot` (0 to 3), from `src` into
   * `dst` (the plate's phase, read and written whole). `seconds` is the
   * step's real time.
   */
  step(pass: GPUComputePassEncoder, slot: number, m: FilmMagnet, seconds: number, src: GPUTexture, dst: GPUTexture): void {
    const total = seconds / FILM_SECOND;
    const subs = Math.max(1, Math.min(FILM_SUBSTEPS, Math.ceil(total / FILM_DT)));
    const dt = Math.min(FILM_DT, total / subs);
    const [ox, oy] = this.origin(m);
    const dx = 1 / this.N / LC;
    const kappa = ((1 - Math.cos(THETA)) * 8 * 2) / (6 * EPS);
    const film = this.films[slot];
    this.device.queue.writeBuffer(film, 0, new Float32Array([
      m.x, m.y, m.height, m.strength,
      ox, oy, this.P, this.logP,
      this.N, dx, dt, H0,
      EPS, kappa, HS, LANGEVIN,
      ...this.win(), PULL, this.count++ % 16777216,
    ]));
    const k = `${slot}`;
    const patch = Math.ceil(this.P / 8);
    const run8 = (name: string, res: (GPUBuffer | GPUTexture)[], size = patch) => {
      const pipe = this.pipelines.computePipeline(`film:${name}`, this.kernels[name]);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, this.group(`${name}:${k}:${res.map((r) => r.label).join(',')}`, pipe, [film, ...res]));
      pass.dispatchWorkgroups(size, size);
    };
    const fft = (cfg: GPUBuffer) => {
      const pipe = this.pipelines.computePipeline('film:filmFft', this.kernels.filmFft);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, this.group(`fft:${k}:${cfg.label}`, pipe, [film, cfg, this.z, this.tot]));
      pass.dispatchWorkgroups(this.P);
    };
    run8('filmGather', [src, this.h, this.z, this.sh]);
    run8('filmSum', [this.sh, this.tot], 1);
    for (let s = 0; s < subs; s++) {
      // The lift: |k| of √G S(h).
      fft(this.ffts.rowF); fft(this.ffts.colLift); fft(this.ffts.rowB); fft(this.ffts.colB);
      run8('filmPressure', [this.h, this.z, this.pr]);
      run8('filmFlux', [this.h, this.pr, this.z]);
      // The change, smoothed by 1 / (1 + dt k⁴).
      fft(this.ffts.rowF); fft(this.ffts.colStab); fft(this.ffts.rowB); fft(this.ffts.colB);
      run8('filmApply', [this.h, this.z, this.sh]);
      run8('filmSum', [this.sh, this.tot], 1);
      run8('filmTake', [this.h, this.sh, this.tot, this.z]);
    }
    run8('filmScatter', [src, this.h, dst], Math.ceil(this.N / 8));
  }

  private group(key: string, pipe: GPUComputePipeline, res: (GPUBuffer | GPUTexture)[]): GPUBindGroup {
    let g = this.groups.get(key);
    if (!g) {
      g = bindGroup(this.device, pipe, res);
      this.groups.set(key, g);
    }
    return g;
  }
}
