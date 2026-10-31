/**
 * The bottom of the WebGPU solver's class chain (PLAN 19ai-7; the map is at the top of
 * `gpu/fluid.ts`): every field, in the order it was declared, so the fields are made in the
 * order they always were; the constructor; and `clear`, which it calls, with its helpers.
 */

import { Disposer, GpuProfiler, PingPong, PipelineCache, ReadbackRing, bindGroup } from '../kit';
import { kernel } from '../wgsl/fluid';
import { STATS_GROUPS } from '../wgsl/stats';
import type { SloshDrive } from '../../lib/slosh';
import { WebGPUSlosh } from '../slosh';
import { RimRead } from '../rimRead';
import { ReadGate } from '../readGate';
import { WebGPUParticles } from '../particles';
import { WebGPUAir } from '../air';
import { StandingFilm } from '../standing';
import { RowUploads } from '../../lib/deltaRows';
import { OIL_SIGMA } from '../../lib/liquidProps';
import { MG_CYCLES, DIV_GROUPS, LIES_B0, BZ_GRID, LIES_GRID, VEL, R32, RGBA32, SIM_FLOATS, type GroupNode, type FieldStats } from './constants';

export class FluidCore {
  readonly N: number;
  readonly L: number;
  protected readonly M: number;
  protected readonly disposer = new Disposer();
  protected readonly pipelines: PipelineCache;
  protected readonly groups = new Map<string, GPUBindGroup>();
  protected readonly dyeFormat: GPUTextureFormat;

  protected readonly dye: PingPong;
  public readonly chem: PingPong;
  public readonly activeMat: PingPong;
  public chemLive = false;
  /**
   * The plate's dye while a print is drawn: the dye in the solver with the
   * print laid over it (depositChem). Separate from the dye so the print is a
   * picture of the reaction as it stands, never a thing the flow carries or
   * the dye accumulates, and so liquid poured on the plate stays in the
   * solver as poured (PLAN 26d-3). Null until the first print.
   */
  protected printDye: GPUTexture | null = null;
  protected printLive = false;
  /** Turing Reagent has been poured since the chemistry was last cleared: the reaction runs on it even on a look without Chemistry. */
  public reagentLive = false;
  protected readonly liquids0: PingPong;
  protected readonly liquids1: PingPong;
  protected readonly vel: PingPong;
  protected readonly squeeze: PingPong;
  /** The plate shape the gap was last laid at; a change re-seeds it. */
  protected lastCurve: number | null = null;
  protected readonly phase: PingPong;
  /**
   * The pressure, in a storage buffer rather than a texture (H2).
   *
   * Red-black Gauss-Seidel updates a cell in place, and a shader cannot
   * write a texture it is also reading — read-write storage textures need a
   * language extension that is not broadly available. A storage buffer can,
   * everywhere, and the pressure is a single scalar per cell, so nothing is
   * lost by keeping it as one.
   */
  protected readonly press: GPUBuffer;
  /** The multigrid's coarse levels (level 0 is `press` itself): each half the size of the one above. */
  protected readonly mg: { n: number; p: GPUBuffer; b: GPUBuffer }[] = [];
  /** How the projection solves: multigrid V-cycles (the show), or the sweeps alone (kept for A/B checks). */
  pressureSolver: 'multigrid' | 'sweeps' = 'multigrid';
  /** The squeeze film's pressure, packed as two colour planes like `press`. */
  protected readonly spress: GPUBuffer;
  protected readonly cur: PingPong;
  protected readonly curP: PingPong;
  /** The spun dish's swirl, on the current's grid, and its projection's pressure and divergence (spinSwirl). */
  protected readonly swirl: PingPong;
  protected readonly swirlP: PingPong;
  protected readonly swirlDiv: GPUTexture;
  /** Whether the swirl holds anything: it is added to the flow only while it does. */
  protected swirlLive = false;
  /** Seconds the swirl runs on after its forcing stops, so what it made can die away. */
  protected swirlTail = 0;
  readonly swirlCount = { steps: 0, ran: 0 };
  protected readonly grain: PingPong | null;
  protected readonly div: GPUTexture;
  /*
    What divergence writes, before its plate mean is taken off into `div`
    (divTiles, divFold, divCentre in wgsl/fluid.ts): the partial sums, and
    the mean itself.
  */
  protected readonly divRaw: GPUTexture;
  protected readonly divPartials: GPUBuffer;
  protected readonly divMean: GPUBuffer;
  protected readonly curDiv: GPUTexture;
  protected readonly velForced: GPUTexture;
  /**
    The slosh dish (PLAN 18a-13, 18a-13a, 18a-13d): two-layer shallow water on
    the GPU (gpu/slosh.ts), made the first time the visualizer drives it and
    stepped on this solver's encoder before the solve while it is driven
    (`setSlosh`). `sloshTex` is its flow while it is, and null otherwise, and
    the thin stage then copies the gap's velocity exactly as it always did.
  */
  protected slosh: WebGPUSlosh | null = null;
  protected sloshDrive: SloshDrive | null = null;
  /** The dish is to be laid level before its next step: it was driven by nothing for a while, or has just been made. */
  protected sloshLevel = true;
  protected sloshTex: GPUTexture | null = null;
  /** velForced less the glass's drift this step, when there is one (driftCells): what the thin carries ride. */
  protected readonly velRide: GPUTexture;
  protected readonly scratchA: GPUTexture;
  protected readonly scratchB: GPUTexture;
  protected readonly readTarget: GPUTexture;
  protected readonly deltaDyeTex: GPUTexture;
  protected readonly deltaVelTex: GPUTexture;
  protected readonly deltaMulTex: GPUTexture;
  protected readonly cpuDyeTex: GPUTexture;
  protected readonly cpuVelTex: GPUTexture;
  protected readonly cpuMulTex: GPUTexture;
  protected splatBuf: GPUBuffer | null = null;
  protected readonly splatArgs: GPUBuffer;
  protected readonly statsArgs: GPUBuffer;
  protected readonly statsPartials: GPUBuffer;
  protected readonly statsResult: GPUBuffer;
  protected readonly statsRing: ReadbackRing;
  protected statsFresh = false;
  protected statsLatest: FieldStats = { meanDensity: 0, meanColor: [0, 0, 0], maxDensity: 0, maxSpeed: 0, maxVx: 0, maxVy: 0, at: -1 };

  protected readonly sim: GPUBuffer;
  protected readonly simData = new ArrayBuffer(SIM_FLOATS * 4);
  protected readonly simF = new Float32Array(this.simData);
  protected readonly simI = new Int32Array(this.simData);
  /** One small uniform for each call site that needs its own numbers within a step. */
  private readonly args = new Map<string, { buf: GPUBuffer; last: Float32Array; written: boolean }>();
  protected readonly sampler: GPUSampler;

  protected readonly rbRow: number;
  protected readonly rbStaging: { dye: GPUBuffer; vel: GPUBuffer };
  protected readonly rbRings: { dye: ReadbackRing; vel: ReadbackRing };
  protected readonly rbDye: Float32Array;
  /** The reading `rbDye` holds: the ring's sequence when it was copied in, not when the next one landed. */
  protected rbDyeSeq = -1;
  protected readonly rbVel: Float32Array;

  protected grainAge = 0;
  protected heatSeconds = 0;
  protected disposed = false;
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
  protected particles: WebGPUParticles | null = null;
  /** The air field (H6): where the bubbles are, so the dye can be taken out of it. */
  protected air: WebGPUAir | null = null;
  /** How hard the arriving air pushes the liquid aside (H6); 0 switches it off. */
  protected airPush = 0;
  /** Whether any of the second phase is on the plate; nothing runs without it. */
  protected phaseLive = false;
  /*
    The liquids' own physics and chemistry (docs/physics-plan.md), made only
    when a look uses them: the mix (oil, surfactant, acidity, and the oil's
    chemical potential) and the reactions (BZ's two species, the Liesegang
    reagent and its precipitate). 16 bytes a texel each, so a plate that
    never pours any pays nothing.
  */
  protected mix: PingPong | null = null;
  /*
    The clear film (PLAN §20b): thickness and solvent, on its own grid
    (FILM_GRID, at most the solver's), and its pressure, made the first step
    a plate asks for a film. filmLaid is the Clear Film it was laid at, 0
    while there is none on the plate (and nothing of it is run).
  */
  protected film: PingPong | null = null;
  protected filmP: GPUTexture | null = null;
  protected filmLaid = 0;
  /*
    The thin-gap solver's own storage (PLAN §18a), made the first time a
    plate is stepped with Thin Gap on: the velocity before the step's forces,
    the mobility a cell (row-major, negative past the rim), and the mobility
    on each coarse level of the multigrid.
  */
  protected hsPrev: GPUTexture | null = null;
  /** The velocity after the step's body forces (hsPrep reads them apart from the stirring), made with hsPrev. */
  protected hsMid: GPUTexture | null = null;
  /** What the step's hsPrep reads as the velocity after the body forces: hsMid, or hsPrev when no body force ran. */
  protected hsMidNow: GPUTexture | null = null;
  protected hsMob: GPUBuffer | null = null;
  protected hsOilMean: GPUBuffer | null = null;
  protected hsLiftSrc: GPUBuffer | null = null;
  protected hsLiftPsi: GPUBuffer | null = null;
  protected liftN = 2;
  protected hsP: GPUBuffer | null = null;
  /** Whether the thin gap's pipelines are built (prepareThinGap), and the build under way. */
  protected hsReady = false;
  protected hsBuilding: Promise<void> | null = null;
  /** And the old plate's (prepareOldPlate), which a show that opens on a thin gap builds only when Thin Gap is turned off. */
  protected oldReady = false;
  protected oldBuilding: Promise<void> | null = null;
  protected hsMobC: GPUBuffer[] = [];
  protected hsFaceC: GPUBuffer[] = [];
  /** The gap as the last thin step left it, a cell at a time: its change is the press (hsDivergence). */
  protected hsGap: GPUBuffer | null = null;
  /** The carries' plan on a thin gap (carryPlan): the step's largest Courant number, the pairs' indirect dispatches, and 1/n, n and that number. */
  protected carryMost: GPUBuffer | null = null;
  protected carryInd: GPUBuffer | null = null;
  protected carrySub: GPUBuffer | null = null;
  /*
    The glass's drift (PLAN 27a-1, 27a-4). A glass sliding over the film
    (Plate Rock's cover, Glass Smear) drags the whole of it toward half its
    speed, so the liquid goes across the plate together, a few cells a step:
    1.3, 2.8 and 5.0 on a 384² solver at Plate Rock 0.2, 0.45 and full with
    the band playing. The carries take as many substeps as their fastest
    face needs (carryPlan, CARRY_COURANT), so that drift alone asked for
    four, eight and thirteen of every carry where a rock without the glass
    asked for one, and with the band on the Mac the plate drew 10 to 21
    frames a second against 26 to 32 (`npm run renders` on main's deploy of
    10-10, which is why #340 took the glass out).

    A drift the whole plate shares is no reason to cut the step up: the
    substeps are there for flow that varies from cell to cell, where a carry
    that oversteps a face piles or tears what it carries. So the carries
    ride the flow less the drift (velRide, driftOff in wgsl/fluid.ts), the
    flow as seen from a frame going with the film, and take only the
    substeps what is left asks for; then each carried field is moved with
    the drift (driftShift): its whole cells by a shift, which is exact, and
    the fraction left, under half a cell, by one step of the carries' own
    limited flux. The two make one carry split in two, with the splitting's
    error the change across the flow's own variations over the drift's few
    cells: none on an even drift, and small beside the carry's own limiter
    where the flow round a press or a finger varies.

    The drift is the liquid's own speed under the glass, not the glass's:
    in the film the liquid comes up to the glass's pull in the drag time
    ρh²/12μ (hsPrep's implicit drag), so glassFlow follows the pull the same
    way, at the rest gap. Read against the lab's plate in the middle of the
    dish it is within 0.03 of a cell a step. It only decides which frame
    the carries work in: whatever it misses (the flow round a press, a
    thicker poured liquid, the tilt's own flow of heavy colour) is in the
    residual, which the plan carries in as many substeps as it needs, so a
    wrong guess costs substeps and never accuracy.

    Measured in the lab (an uneven plate of forty pools, the app's rock and
    kicks, 60 steps on the app's 384²): the carries took 1.00, 1.03 and
    2.17 substeps a step at Plate Rock 0.2, 0.45 and full with the glass,
    where in the frame they rode before they took 4.1, 8.0 and 12.2, and a
    plate held still 1.00. What is left at full is the colour the drift
    piles against the grid's wall where the rim meets it (carryCourant,
    PLAN 27a-6).
  */
  /** The film's speed under the sliding glass, in the flow's units (the drag time's lag on hsPrep's glass pull). */
  protected glassFlow: [number, number] = [0, 0];
  /** This step's drift in cells, whole and the fraction left (driftShift), and whether the carries ride velRide this step. */
  protected driftCells: [number, number, number, number] = [0, 0, 0, 0];
  /** The same before it is rounded, cells a step: for a check. */
  protected glassCells: [number, number] = [0, 0];
  protected riding = false;
  /** The ferrofluid's substeps on a thin gap (phasePlan): one indirect dispatch each, and the share 1/m and m. */
  protected phaseInd: GPUBuffer | null = null;
  protected phaseSub: GPUBuffer | null = null;
  /** False until a thin step has recorded the gap, and again whenever the glasses are re-laid rather than pressed. */
  protected hsPrimed = false;
  /** V-cycles a thin solve takes: the old solver's count, which leaves under 2% of the flow's divergence (`npm run thingap`). */
  protected readonly hsCycles = MG_CYCLES;
  /** Whether the last step ran as a thin gap: the next frame's deltas are imposed, not added. */
  protected thinLive = false;
  /*
    Oil Bodies: the oil's own share of the dye (see bodyPartition), in the
    dye's format, made the first step a plate has oil on it with Oil Bodies
    up. The water's share is the dye less this, so nothing else that reads
    the dye needs to know it exists.
  */
  protected oilDye: PingPong | null = null;
  /** The slump's K Δt/Δx² a cell, once a step (PLAN 18m, wgsl/slump.ts); made on the first step that slumps. */
  protected slumpK: GPUTexture | null = null;
  /** The oil blurred wide, for colour astray from its liquid to find the way back (bodyPartition). */
  protected oilReach: PingPong | null = null;
  /** Whether the last step asked for Oil Bodies (the setting, and oil's tension to have oil at all). */
  protected bodiesWanted = false;
  /** The oil's share went unkept for a step: stale, to be emptied before it is used again. */
  protected oilDyeStale = false;
  protected rxn: PingPong | null = null;
  /** Liesegang's four species (A, B, their product C, the precipitate P). */
  protected lies: PingPong | null = null;
  protected liesLive = false;
  protected mixLive = false;
  /*
    The poured liquids that mix with the clear one (PLAN 18d,
    src/lib/liquidProps.ts): share, Σ share·ln(ν/ν_water), Σ share·ρ,
    Σ share·n, carried with the colour on a thin gap and read by hsPrep as
    each column's own viscosity. Made at the first such pour; live until
    the last has been flushed out (speciesShare).
  */
  protected species: PingPong | null = null;
  protected speciesLive = false;
  /** Pours since the last read of the plate's poured share, so a read made before a pour cannot drop the field it landed in. */
  protected speciesQuiet = 0;
  /** The thin solve's volume source (PLAN 18c): the share of each column poured since the last step, which hsDivergence takes and empties. */
  protected hsPour: GPUBuffer | null = null;
  /** The last thin step's displacement scale, which the species' carry was given (benchSpecies repeats it). */
  protected speciesDisp = 0;
  /**
   * Whether the thin gap's drag reads the species (PLAN 18d). Only `npm run
   * thick` turns it off, to measure the plate as it was before 18d with the
   * same pour on it: a "before" that is read, not remembered.
   */
  readsSpecies = true;
  /**
   * Whether the species rides the colour's carry (PLAN 18d-11a). Only `npm
   * run thick` turns it off, to carry the same plate the way 18d-1 did, in a
   * stage of its own, and ask that both ways give the same fields.
   */
  fuseSpecies = true;
  /** How the last step carried the species: with the colour ('pair'), in its own stage ('alone'), or not at all (null). For `npm run thick`. */
  lastSpeciesCarry: 'pair' | 'alone' | null = null;
  /*
    How much of the plate the oil poured since it was last cleared covers,
    as a share of its area. Cahn–Hilliard and the flux transport both keep
    the oil exactly (npm run physics), so what went in is what is there,
    and a tally is the whole measurement: Oil Bodies stops pouring bodies
    when the plate is full of them.
  */
  protected oilPoured = 0;
  /*
    The oil's tension against the water, N/m (PLAN 38e): each pour's own
    (lib/liquidProps.ts, interfacialTension), averaged by the plate it
    covers, so a dish of sunflower oil is at 27 mN/m and one with silicone
    poured into it goes toward 37 as the silicone's share grows. One number
    for the plate's oil, not one a cell: the oil is one field, and two oils
    on one plate share it (PLAN 38e-1).
  */
  protected oilSigma = OIL_SIGMA;
  protected rxnLive = false;
  /** What the plate draws from the liquids' own physics, packed (see packView). */
  protected viewTex: GPUTexture | null = null;
  protected blankR: GPUTexture | null = null;
  protected blankPhaseTex: GPUTexture | null = null;
  /** Uploads by rows (lib/deltaRows.ts). */
  readonly uploads = new RowUploads();
  /** The hands in the liquid (applyDeltas' \`hands\`), on the CPU's grid and on the solver's, made when a hand first touches a thin gap. */
  protected cpuHandTex: GPUTexture | null = null;
  protected handTex: GPUTexture | null = null;
  /** Whether the next step has a hand in it: the hands are laid each step they move, and gone the step after. */
  protected handLive = false;
  /** The fastest hand laid for the next step, in the hands' cells a step (the ferrofluid's substeps follow it). */
  protected handFastest = 0;
  /** A Blow's breath on the liquid (applyDeltas' `breath`, lib/breath.ts), on the CPU's grid and on the solver's, made at the first breath on a thin gap. */
  protected cpuBreathTex: GPUTexture | null = null;
  protected breathTex: GPUTexture | null = null;
  /** Whether the next step has a breath on it: laid each step the wind blows, gone the step after, as the hands are. */
  protected breathLive = false;
  /** The rhythm sheet's change this step (applyDeltas' `sheet`, lib/sheet.ts), on the CPU's grid and on the solver's, made at the first kick it lays. */
  protected cpuSheetTex: GPUTexture | null = null;
  protected sheetTex: GPUTexture | null = null;
  protected blankRGBA: GPUTexture | null = null;
  /** Scratch for the vorticity and the ferrofluid's chemical potential. */
  protected scratchR: GPUTexture | null = null;
  protected rimPhi: GPUTexture | null = null;
  /** The ferrofluid's long-range repulsion ψ (see screenJacobi), kept between steps. */
  protected psi: PingPong | null = null;
  /** Its chemical potential (phaseMu), kept for the next step's maze force. */
  protected phaseMuT: GPUTexture | null = null;
  /** The ferrofluid blurred once a step (phaseBlur), for phaseCompress's edge normal. */
  protected phaseBlurT: GPUTexture | null = null;
  /** The ferrofluid's own phase velocity (phaseVelocity), for phaseAdvect and phaseCompress on a thin gap. */
  protected phaseVelT: GPUTexture | null = null;
  /*
    The ferrofluid standing up under a close magnet (standing.ts, PLAN §9t):
    the film, made the first time a magnet is that close, and the window the
    plate's own passes step aside by (zero wherever no film runs; standOn
    says whether the last step wrote one, to clear it once when it stops).
  */
  protected layer: StandingFilm | null = null;
  protected stand: GPUTexture | null = null;
  protected standOn = false;
  protected filmHeld = false;
  /**
    The steps the film has run in, for checks (`npm run standing`): a check
    that a layer stays flat, or lies back down, passes as well with the film
    never running, because the plate's own cap at full holds a pool flat.
  */
  filmSteps = 0;
  /**
   * The gap the ferrofluid last moved in, a cell at a time, so a step can
   * tell how far the glass closed on it (phaseAdvect, Thin Gap). Not primed
   * until a step has written it: a fresh plate, new glasses (Plate Shape)
   * and a pour onto an empty plate each start it again, so the first step
   * after one does not read the whole gap as the glass arriving.
   */
  protected phaseGap: GPUBuffer | null = null;
  protected phaseGapPrimed = false;
  protected mazeReady = false;
  protected airCover = 0;
  /*
    Last frame's coverage, so the rate term can be made zero-mean.

    A Neumann problem whose source does not average to zero has no solution
    for the projection to find, the condition pressureSelfTest exists to
    protect. The air's rate (a bubble arriving or leaving) is the only air
    source left: the standing one, which poured liquid out of every still
    bubble for as long as it lasted, is gone (see divergence in
    wgsl/fluid.ts), and the coverage it was balanced with is passed on but
    no longer read there.
  */
  protected airCoverPrev = 0;
  /** How much of a press reaches the flow, from the look's plate pressure. */
  protected squeezeGain = 0;
  protected lastDt = 1 / 60;

  constructor(protected readonly device: GPUDevice, physicalSize: number, logicalSize: number, opts: { float32Filterable: boolean; timestamps?: boolean }) {
    this.N = physicalSize;
    this.L = logicalSize;
    this.M = Math.max(32, Math.round(physicalSize / 2));
    this.pipelines = PipelineCache.for(device, 'fluid');
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
    /*
      The reaction's field in the dye's format: full floats wherever the GPU
      can filter them (every Mac, and SwiftShader). It was half floats, and a
      half float's step just under 1 is 1/2048: the substrate's refill, feed ×
      (1 − u) a step, falls under that step before the dish is full, so the
      stored u stopped rising there. How far short depends on how the GPU
      rounds a stored half float: SwiftShader rounds to nearest and stopped
      0.003 to 0.005 short (measured); the Mac's, by the widths it drew,
      rounds toward zero and drops every step under 1/2048, so it stops about
      twice as far short. The pattern's wavelength follows the substrate, so CI's
      Mac drew the labyrinth's stripe 3.08%, 3.35% and 3.51% of the plate at
      256², 384² and 512², 14% apart, where SwiftShader drew 3.06%, 3.12% and
      3.19%; the lab, rounding toward zero by hand, drew the Mac's widths to
      the hundredth. In full floats the dish fills to within 5e-6 of its
      reservoir, as the arithmetic says it should (`npm run turing`, line 1).
      A GPU that cannot filter full floats keeps half floats (PLAN 26d-5).
    */
    this.chem = pp(this.N, this.dyeFormat, 'chem');
    this.activeMat = pp(this.N, 'r32float', 'activeMat');
    this.liquids0 = pp(this.N, 'rgba16float', 'liquids 0');
    this.liquids1 = pp(this.N, 'rgba16float', 'liquids 1');
    this.vel = pp(this.N, VEL, 'vel');
    this.squeeze = pp(this.N, RGBA32, 'squeeze');
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
    for (let n = this.N; n % 2 === 0 && n / 2 >= 4;) {
      n /= 2;
      const make = (label: string) => this.disposer.track(device.createBuffer({ label, size: Math.max(16, n * n * 4), usage: GPUBufferUsage.STORAGE }));
      this.mg.push({ n, p: make(`mg p ${n}`), b: make(`mg b ${n}`) });
    }
    this.spress = this.disposer.track(device.createBuffer({
      label: 'squeeze pressure',
      size: this.N * this.N * 4,
      usage: GPUBufferUsage.STORAGE,
    }));
    this.cur = pp(this.M, VEL, 'current');
    this.curP = pp(this.M, R32, 'current pressure');
    this.swirl = pp(this.M, VEL, 'swirl');
    this.swirlP = pp(this.M, R32, 'swirl pressure');
    this.swirlDiv = tex(this.M, R32, 'swirl divergence');
    this.grain = opts.float32Filterable ? pp(this.N, RGBA32, 'grain') : null;
    this.div = tex(this.N, R32, 'divergence');
    this.divRaw = tex(this.N, R32, 'divergence raw');
    this.divPartials = this.disposer.track(device.createBuffer({ label: 'divergence partials', size: DIV_GROUPS * 4, usage: GPUBufferUsage.STORAGE }));
    this.divMean = this.disposer.track(device.createBuffer({ label: 'divergence mean', size: 16, usage: GPUBufferUsage.STORAGE }));
    this.curDiv = tex(this.M, R32, 'current divergence');
    this.velForced = tex(this.N, VEL, 'forced velocity');
    this.velRide = tex(this.N, VEL, 'velocity ridden');
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

  /**
   * A dispatch's eight numbers, in a buffer of their own under `name`, written
   * only when they differ from what that buffer was last given (H2c-4).
   *
   * It made a `Float32Array` and a slice and wrote the buffer on every call:
   * a write a dispatch, about 250 a step at 512², when most of those numbers
   * (a sweep's parity, a level's size, `none`) are the same every step of a
   * show. Skipping the write when the numbers match changes nothing the GPU
   * sees. A `writeBuffer` lands on the queue in call order, ahead of the next
   * submit, so what a buffer holds when a step's commands run is whatever was
   * written to it last, and that is exactly what `last` remembers. (Which is
   * also why one name must not carry two values in one step: both dispatches
   * read the second. That was so before, and this keeps it so, no worse.)
   */
  protected arg(name: string, values: number[]): GPUBuffer {
    const v = this.argScratch;
    const n = Math.min(8, values.length);
    for (let i = 0; i < 8; i++) v[i] = i < n ? values[i] : 0;
    return this.argWrite(name);
  }

  /** `argScratch` into the buffer under `name`, if it differs from what that buffer holds. */
  protected argWrite(name: string): GPUBuffer {
    let a = this.args.get(name);
    if (!a) {
      const buf = this.disposer.track(this.device.createBuffer({ label: `args ${name}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
      a = { buf, last: new Float32Array(8), written: false };
      this.args.set(name, a);
    }
    const v = this.argScratch;
    let same = a.written;
    for (let i = 0; same && i < 8; i++) same = Object.is(v[i], a.last[i]);
    if (!same) {
      a.last.set(v);
      a.written = true;
      this.device.queue.writeBuffer(a.buf, 0, a.last);
    }
    return a.buf;
  }

  protected readonly argScratch = new Float32Array(8);

  /**
   * The pipeline for a kernel and the format it writes, asked on every
   * dispatch: the `name:format` it is cached under made once, not a new
   * string each time (`npm run encode`).
   */
  protected pipeline(name: string, format: GPUTextureFormat): GPUComputePipeline | null {
    let byFormat = this.pipelineKeys.get(name);
    if (!byFormat) { byFormat = new Map(); this.pipelineKeys.set(name, byFormat); }
    let key = byFormat.get(format);
    if (key === undefined) { key = `${name}:${format}`; byFormat.set(format, key); }
    return this.pipelines.computePipeline(key, kernel(name, format));
  }

  protected readonly pipelineKeys = new Map<string, Map<string, string>>();

  protected readonly names = new Map<string, Map<number, Map<number, string>>>();

  /**
   * The dispatches' bind groups, found by the very objects they bind rather
   * than by a key string spelled out from their labels on every dispatch
   * (`run`, `runPressed`, `runThinFaced`): a walk down maps keyed by the
   * pipeline, the target, the args and each texture read, which makes nothing
   * once the step has been seen. By object, too, where the labels only stood
   * for the objects: a texture made again under the same label could never be
   * served a group that binds the one it replaced. Cleared with `groups`.
   */
  protected groupRoot: GroupNode = { kids: new Map() };

  protected groupAt(node: GroupNode, k: unknown): GroupNode {
    let n = node.kids.get(k);
    if (!n) { n = { kids: new Map() }; node.kids.set(k, n); }
    return n;
  }

  /** A dispatch: the kernel, its args, the textures it reads, the one it writes, and a sampler if it wants one. */
  protected run(
    pass: GPUComputePassEncoder,
    name: string,
    dst: GPUTexture,
    reads: (GPUTexture | GPUSampler)[],
    args: GPUBuffer,
    size = this.N,
  ): void {
    const pipe = this.pipeline(name, dst.format);
    if (!pipe) return;
    let at = this.groupAt(this.groupAt(this.groupAt(this.groupRoot, pipe), dst), args);
    for (const r of reads) at = this.groupAt(at, r);
    let group = at.group;
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...reads.filter((r) => r instanceof GPUTexture) as GPUTexture[], dst, ...reads.filter((r) => !(r instanceof GPUTexture)) as GPUSampler[]]);
      at.group = group;
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(size / 8);
    pass.dispatchWorkgroups(w, w);
  }

  protected fill(pass: GPUComputePassEncoder, dst: GPUTexture, value: [number, number, number, number], size: number): void {
    this.run(pass, 'fill', dst, [], this.arg(`fill ${dst.label}`, [...value, size, size, 0, 0]), size);
  }

  // ── The plate ─────────────────────────────────────────────────────

  /** Wipe the plate: no dye, no motion, the gap at rest. */
  clear(): void {
    this.heatSeconds = 0;
    // A wiped plate has no print: it is rebuilt from the dye and the reaction
    // on the next deposit, and until then the plate shows the (empty) dye.
    this.printLive = false;
    this.resetFilm();
    const enc = this.device.createCommandEncoder({ label: 'clear' });
    const pass = enc.beginComputePass({ label: 'clear' });
    // The sim buffer only needs its grid sizes for a fill.
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    for (const t of [this.dye.a, this.dye.b, this.scratchA, this.scratchB]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    for (const t of [this.vel.a, this.vel.b, this.velForced]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.glassFlow = [0, 0];
    for (const t of [this.div, this.divRaw]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.mix) for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids0) for (const t of [this.liquids0.a, this.liquids0.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids1) for (const t of [this.liquids1.a, this.liquids1.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.species) for (const t of [this.species.a, this.species.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.rxn) for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
    if (this.lies) for (const t of [this.lies.a, this.lies.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    this.mixLive = false;
    this.rxnLive = false;
    this.liesLive = false;
    this.clearBuffer(pass, this.press, 'clear pressure');
    this.clearBuffer(pass, this.spress, 'clear squeeze pressure');
    // At the dome's own shape, not flat: a plate filled flat then sprung
    // toward the dome pumps its liquid inward until the two agree.
    for (const t of [this.squeeze.a, this.squeeze.b]) this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
    this.hsPrimed = false;
    // The gap the ferrofluid last saw is from before the clear: the next
    // step must carry it by area until phaseGapSeen has read the new one.
    this.phaseGapPrimed = false;
    for (const t of [this.cur.a, this.cur.b]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    for (const t of [this.curP.a, this.curP.b, this.curDiv]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    for (const t of [this.swirl.a, this.swirl.b, this.swirlP.a, this.swirlP.b, this.swirlDiv]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    this.swirlLive = false;
    this.swirlTail = 0;
    if (this.grain) {
      // Identity coordinates: seedGrain with both phases reseeded. It reads the
      // other texture of the pair — a dispatch may not sample what it writes.
      const identity = this.arg('grain identity', [0, 0, 0, 0]);
      this.run(pass, 'seedGrain', this.grain.a, [this.grain.b], identity);
      this.run(pass, 'seedGrain', this.grain.b, [this.grain.a], identity);
    }
    // The mix and the reactions go with the plate they were poured on.
    if (this.mix) for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids0) for (const t of [this.liquids0.a, this.liquids0.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.liquids1) for (const t of [this.liquids1.a, this.liquids1.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.species) for (const t of [this.species.a, this.species.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.speciesLive = false;
    // A pour laid since the last step is poured onto the plate that was cleared, not the new one.
    if (this.hsPour) this.clearBuffer(pass, this.hsPour, 'clear pours');
    // The oil lift's Ψ is the last oil's shape; the next plate's starts from still.
    if (this.hsLiftPsi) this.dispatchBuf(pass, 'mgZero', 'mgZero:lift', this.arg('lift zero', [2 * this.liftN * this.liftN, 0, 0, 0]), [this.hsLiftPsi], 2 * this.liftN * this.liftN);
    if (this.oilDye) for (const t of [this.oilDye.a, this.oilDye.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.oilPoured = 0;
    this.oilSigma = OIL_SIGMA;
    if (this.rxn) for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
    if (this.lies) for (const t of [this.lies.a, this.lies.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    this.mixLive = false;
    this.rxnLive = false;
    this.liesLive = false;
    // The clear film goes with the plate, and is laid fresh on the next step a look asks for one.
    this.filmLaid = 0;
    pass.end();
    this.submit(enc);
    this.grainAge = 0;
  }

  /** Where the share is read into, kept (PLAN 14ab-9). */
  protected shareRead: RimRead | null = null;

  /**
   * Zero one of the packed pressure buffers, as the Jacobi's `fill` did, with
   * the multigrid's own zeroing (`mgZero` in `wgsl/fluid.ts` on why not a
   * kernel of its own).
   */
  protected clearBuffer(pass: GPUComputePassEncoder, buf: GPUBuffer, key: string): void {
    const pipe = this.pipelines.computePipeline('mgZero', kernel('mgZero', 'r32float'));
    if (!pipe) return;
    let group = this.groups.get(key);
    if (!group) {
      // The Sim, then the Args, then the buffer: every kernel here takes
      // bindings 0 and 1 from HEAD whether it reads them or not, and a group
      // that skips the Args puts the pressure on a uniform slot. The Args
      // under a name of their own and written once: a buffer is written
      // before the command buffer runs, so two values under one name in a
      // step would both read the last.
      group = bindGroup(this.device, pipe, [this.sim, this.arg('clear pressure', [this.N * this.N, 0, 0, 0]), buf]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil((this.N * this.N) / 64));
  }

  /** A one-dimensional dispatch over buffers, its bind group cached under `key`. */
  protected dispatchBuf(pass: GPUComputePassEncoder, name: string, key: string, args: GPUBuffer, resources: (GPUBuffer | GPUTexture)[], count: number): void {
    const pipe = this.pipelines.computePipeline(name, kernel(name, 'r32float'));
    if (!pipe) return;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
  }

  /**
   * A cleared plate starts the standing layer afresh: no magnet holding it
   * on, and the noise drawn from its first step again, so a plate cleared
   * and run again is the same run (the seeded renders, `npm run seed`).
   */
  protected resetFilm(): void {
    this.filmHeld = false;
    this.layer?.reset();
  }
  protected driftReady = false;

  protected readonly reads = new ReadGate();

  /** A submit that may change a field: counted, so the next readback reads it. */
  protected submit(enc: GPUCommandEncoder): void {
    this.device.queue.submit([enc.finish()]);
    this.reads.wroteOne();
  }

  /** A submit that only reads, which nothing need read again. */
  protected submitRead(enc: GPUCommandEncoder): void {
    this.device.queue.submit([enc.finish()]);
  }
}
