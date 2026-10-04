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

import { Disposer, GpuProfiler, PingPong, PipelineCache, ReadbackRing, bindGroup, type Prep } from './kit';
import type { Opening } from './opening';
import { kernel } from './wgsl/fluid';
import { spikesOnAxis } from './wgsl/spikes';
import { splatKernel } from './wgsl/splat';
import { STATS_GROUPS, STATS_KERNELS } from './wgsl/stats';
import { SPLAT_FLOATS, type SplatList } from './splats';
import type { GpuStepParams } from './solverTypes';
import { SOLVER_VEL_FORMAT } from './wgsl/pack';
import { stepDisplacement } from '../lib/detailFlow';
import { pressShare } from '../lib/pressRing';
import { DISH_GAP_RANGE, OIL_NU, dragSeconds } from '../lib/turntable';
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
/*
  The projection as multigrid V-cycles rather than sweeps alone (see
  mgRestrict0 in wgsl/fluid.ts): two cycles of two sweeps each way per level,
  and enough sweeps at the coarsest (a few cells across) to finish it there.
*/
const MG_CYCLES = 2;
const MG_SWEEPS = 2;
const MG_COARSE_SWEEPS = 16;
/** Workgroups summing the projection's right-hand side for its plate mean (divTiles). */
const DIV_GROUPS = 64;
/** The Thickness a thin gap runs at when a look does not set one: a light oil (PLAN §18a). */
export const THIN_GAP_THICKNESS = 0.45;
/**
 * A ferrofluid's kinematic viscosity, m²/s, in a thin gap (wgsl/thinGap.ts,
 * hsPrep). A light hydrocarbon ferrofluid of the kind sold for display and
 * art (6 mPa·s at 1.2 g/cm³, Ferrotec's EFH1 data sheet): five times water,
 * and a quarter of Thin Gap's default clear liquid (Thickness 0.45, 22
 * mm²/s, a light oil). So on the default plate the ferrofluid is the
 * thinner of the two and fingers where it pushes the oil (a press); in
 * water it is the thicker and fingers where the water pushes it (a lift).
 */
export const FERRO_NU = 5e-6;
/** The thin gap's kernels (wgsl/thinGap.ts): built before the opening's first step, or when first turned on in a show that opened without it. */
const THIN_GAP_KERNELS = ['hsBody', 'hsPrep', 'hsDivergence', 'hsSmooth0', 'hsRestrict0', 'hsCoarsen', 'hsSmooth', 'hsRestrict', 'hsProlong', 'hsProlong0', 'hsGradient', 'carryCourant', 'carryPlan'];
/*
  The carries' substeps on a thin gap (carryPlan in wgsl/fluid.ts): what one
  substep may carry across a face, in cells, and the most substeps a step
  takes. 0.4 leaves the flux step's own clamp (0.45) a margin for the
  limiter's slope. The app's Press at 1× asks 21 at most: its fastest face
  is 8 cells a step on a 384² solver under Classic's clock (`npm run
  presslift`), with the glass closing as h³ (squeezeUpdate). 33 leaves room
  for a harder press and a finer solver. Odd, since the first substep runs
  alone and the rest in pairs. A step that needs one costs, for each carry,
  one substep and thirty-two dispatches of no workgroups (sixteen pairs),
  and once a step the Courant pass and the plan: with Oil Bodies and the
  mix on, three carries, so ninety-six empty dispatches a step.
*/
export const CARRY_COURANT = 0.4;
export const CARRY_SUBSTEPS = 33;
const CARRY_PAIRS = (CARRY_SUBSTEPS - 1) / 2;
/** Iterations a step of the ferrofluid's own pressure, which keeps it from packing past full (phaseRelax). */
const PHASE_RELAX = 6;
/*
  The mix's forces, each in plate widths a second at full strength (see
  mixForce), set in the lab (scripts/lab.mjs) so each effect is plainly
  there at full and gone at zero.

  OIL_TENSION is σ for the capillary force (σ κ ∇c̃, see mixForce), in
  plate widths: κ and ∇c̃ are taken in cells, so the step multiplies it by
  N² and a drop rounds up in the same time on a 256 grid as on a 512. At
  full a drop a tenth of the plate across goes from a smear to round in
  about a second, which is how an oil drop on a real dish behaves; the
  Korteweg force it replaced (−σ c ∇μ) had its own σ and no N², and a
  second-derivative field under it that did not scale either.
*/
const OIL_TENSION = 4e-4;
/*
  The most the oil's surface tension may move the liquid in a step, in cells
  (see mixForce). A drop rounding up is a slow thing, a second or so for a
  drop a tenth of the plate across, which is a fraction of a cell a step on
  any grid; the cap is there for the moment a fresh pour is breaking up,
  when the force is at its largest and least real.
*/
const OIL_CELLS = 0.5;
const SOAP_PULL = 0.5;
const DYE_WEIGHT = 0.12;
const HEAT_LIFT = 0.06;
/** The lamp under a standing plate: heat a second into the wax where the plate goes out of view, at full Gravity. */
const LAMP_HEAT = 6;
/** Vorticity confinement's push, as a fraction of the local spin, per step. */
const CONFINE = 0.35;
/** Cahn–Hilliard substeps a step for the oil (see the 'mix' stage). */
const CH_SUBSTEPS = 4;
/** Liesegang's inner electrolyte, spread evenly through the gel. */
const LIES_B0 = 0.2;
/*
  The ferrofluid maze (see phaseMu, mazeForce). Its period, in plate widths:
  set from the field's own stability analysis rather than tuned, so the maze
  is the same size on every grid. For the Ohta–Kawasaki energy with a
  screened repulsion α/(k² + m²) and unit surface stiffness, the fastest
  growing wavenumber is k*² = √α − m²; so from the period wanted, k*, then
  m = 0.4 k* (a screening longer than a stripe, shorter than a pool) and
  α = (k*² + m²)².
*/
const MAZE_PERIOD = 0.045;
/*
  How much finer Maze Detail can make it: at 1 the period is a third of
  MAZE_PERIOD, 0.015 of the plate.

  The owner's references (Chemical Bouillon's ferrofluid films) run fingers
  about a sixtieth of the frame wide, and MAZE_PERIOD drew them two to three
  times wider than that in the lab. It stays the default because every look
  made so far was made with it. It cannot just be made smaller, though,
  because of the twelve-cell floor in step(): a period is only as fine as the
  grid can hold, and turning Detail up on a smaller grid stops at the floor
  rather than washing the stripes out to grey. Where it stops, by grid
  (qualityLadder in lib/platform.ts): 256² at 0 (the default is already at
  the floor there), 384² at 0.33, 512² at 0.59, 768² at 0.96, and only 1024²
  reaches 0.015. The hosted site tops out at 512², so there the top two
  fifths of the slider do nothing; the other way, mapping the slider onto
  what each grid can hold, would give each machine a different maze for the
  same setting, which is what the constant period was chosen to avoid. The
  step from default to finest is geometric, so each part of the slider
  changes the size by the same ratio.
*/
const MAZE_FINEST = 3;
/*
  How hard the maze's own potential moves the liquid, in plate widths a
  second per unit of its gradient (per cell). From the lab at 256²: drops
  turn to starfish in two seconds and to a branched maze in eight; the
  experiments give a second or a few for a viscous Hele-Shaw maze. Scaled
  by the grid over 256: at a given Maze Detail the maze is the same size in
  the plate on every grid, so on a finer one its potential changes less per
  cell. Maze Detail itself is not scaled for: a finer maze has the sharper
  force per cell, and it forms faster for it (its growth goes as the
  wavenumber to the fourth). The step's motion stays capped at MAGNET_CELLS
  a step, and `npm run maze` finds no grid printed through the black at
  Detail 0.5 on 512²; a 768² or 1024² plate at full Detail is only judged by
  eye (docs/judging.md).
*/
const MAZE_GAIN = 2;
/** The share of the maze's field that is uniform (a coil under the whole plate); the hand magnet adds the rest where it is. */
const MAZE_UNIFORM = 0.45;
/*
  A magnet close enough to stand the ferrofluid up into spikes (the Magnet
  tool pressed under the glass; wgsl/spikes.ts has why and where, and
  spikesOnAxis how far into them a magnet is). What changes under them,
  each ramped in with the spikes so a magnet brought up slowly (Magnet
  Height on a fader) never steps:

  The magnet's pull at half, where there is a maze field: at full it held
  the pool packed round under the magnet, the one round blob that was
  reported, and the domes need the liquid to be able to spread out between
  them. The maze's flow at twice: it is what carries the liquid into the
  domes and out of the valleys (mazeForce, from μ, which now has the
  spikes' wells in it); at the maze's own gain the pool had barely begun to
  part after four seconds. Both were chosen by rendering the lab's Magnet
  Garden with the magnet held, pull 1 and 0.5, flow 1, 2 and 4: at pull 1
  the domes stayed packed in one raspberry, and at four times the flow the
  pool thinned to grey, the plate past half full falling from 8.6% to 7.3%
  in five seconds on 384². Without a maze field (the Magnet on Classic,
  which pours ferrofluid to gather) the pull stays whole: gathering along
  the hand is what `npm run magnet` holds that tool to, and the domes were
  only tuned on the ferrofluid looks. SPIKE_RELAX: see the phase stage.

  The half is a tuning, not physics: a magnet's pull on a ferrofluid does
  not weaken because peaks have formed. It stands in for what the model
  lacks, a layer that can stand taller than full: a real Rosensweig peak
  rises out of the layer and draws the liquid from the valleys into it,
  while ours is capped at full, so a pool pulled together can only spread
  sideways and the domes stand shoulder to shoulder, the gaps between them
  16% of the plate near the magnet (PLAN.md §9f, `npm run domes`). A pull
  eased further while the hand was held still opened them to 41% and kept
  a dragged pool following, but it was a second tuning on the first and
  was dropped; the domes standing up is PLAN.md §9t.
*/
const SPIKE_PULL = 0.5;
const SPIKE_FLOW = 2;
const SPIKE_RELAX = 16;
/*
  Past the spikes, fingers (PLAN.md §9i, `npm run fingers`). A pool bigger
  than the spikes' reach stayed round past them: the maze's repulsion was
  screened at the look's own reach, and a dipole's field reaches a long
  way. So under the hand's magnet the maze field is at least as strong as
  its spikes (field, in step), and pushes from further.

  HAND_SCREEN: how far the push reaches, as the screening's share of the
  maze's wavenumber squared (0.16 for the look's own maze, which sets its
  period: m = 0.4 k*). A pool pushed only from within five cells of each
  point had its edge wrinkle and stop; from four times as far (0.04) it
  goes out in fingers. The repulsion α is set with it so the fastest
  wavelength stays the maze's: k*² = √α − m², so √α = (1 + share) k*².

  Only on a look with a Labyrinth. The first version gave the hand's magnet
  this field on every look, Classic too, with the pull eased so the edge
  could get out; on the Mac `npm run ferro` then found a close magnet on
  Classic no longer gathered scattered drops, which is that tool's job
  there, and with the pull whole Classic's fingers came out grey (7, 1, 0
  and 0 on the four circles of `npm run fingers`). Classic is left as it
  was; fingering it is PLAN.md §9o.
*/
const HAND_SCREEN = 0.04;
/** The reactions' own grids (see gridSplat). */
const BZ_GRID = 256;
const LIES_GRID = 128;
const CURRENT_ITERS = 10;
/*
  The spun dish's swirl (spinSwirl, PLAN.md §22).

  It runs while the dish and its liquid are moving against each other, or
  the liquid is turning fast enough to be a centrifuge, and then for five of
  the slowest drag times the plate can have (its widest gap, the look's own
  liquid) so what it made dies away rather than stopping dead; then its field
  is emptied and it stops. A plate nobody spins never runs it.

  The two thresholds are where it stops being visible. The dish against its
  liquid: at 1e-3 rad/s the swirl at the rim is under 5e-4 plate widths a
  second, a cell of 768 in three seconds, for as long as the lag lasts. The
  centrifuge: at 0.05 rad/s water's drift outward is 3e-4 plate widths a
  second at the rim with the heaviest dye. Since 22h (#252) the look's own
  turning is on the same dish, so a look with music routed to rotation sways
  its dish under its liquid and runs the swirl on most steps while it plays
  (PLAN 22k: what that costs, `npm run swirlcost`); a look nobody turns
  leaves both at exactly zero.
*/
const SWIRL_DISH_MIN = 1e-3;
const SWIRL_SPIN_MIN = 0.05;
/** The oil's density under the look's liquid, Δρ/ρ (lib/turntable.ts, dyeDensityContrast's note). */
const SPIN_OIL_LIGHT = 0.12;
const SQUEEZE_SWEEPS = 5;
const VISC_ITERS = 4;
const DYE_ITERS = 4;
/*
  How much of the grid's checkerboard the dye loses a step, the diffusion's
  share included (dampGrid). A twentieth: the grating the closeup showed is
  gone in a second (4% of it left at sixty steps), and on a pressed plate
  what the presses grow is held to a fifth of what it reaches without.
  The price is the finest diagonal the liquid draws for itself: ripple four
  cells across at 45° keeps 81% over the same second, six cells 98%, and
  anything along the grid all of it. Stronger clears faster and softens
  those more; this clears what a look already has before an audience
  notices it going.
*/
const GRID_DAMP = 0.05;
/** The CPU solver's hard speed limit, in plate units per unit time. */
const MAX_SPEED = 0.002;
/*
  The plate as a Hele-Shaw cell (PLAN §18a, wgsl/thinGap.ts): its real size.

  The drag between two glasses is 12ν/h², which needs the gap in metres.
  The gap field is in plate widths (0.03 at rest in the middle), so the
  plate needs a width: an overhead projector's stage takes a clock glass of
  about eight inches, 0.2 m, which puts the rest gap at 6 mm in the middle
  and the tightest the squeeze allows (0.004) at 0.8 mm. The same 0.03 is
  the unit the mobility is written in, so M is about c on an open plate.
*/
const PLATE_METRES = 0.2;
const REST_GAP = 0.03;
/*
  The dish's rim, in plate widths from the middle: the plate's inscribed
  circle, which is all the picture ever shows of it (plate.ts keeps both
  dishes inside it). Past it the liquid is open to the air.
*/
const OPEN_RIM = 0.5;
/*
  The forces' own physics on a thin gap (PLAN 18a-2, wgsl/thinGap.ts's
  hsBody, hsPrep and hsDivergence).

  The reference liquid: the default Thickness, the one every look's forces
  were tuned on. A body force is read as the speed it drives this liquid to
  at the rest gap, so on the default Thickness nothing moves differently,
  and on any other the liquid answers as its viscosity says (hsPrep).
*/
const NU_REF = thinGapViscosity(THIN_GAP_THICKNESS);
/*
  Rain Drip's weight: the speed a unit of dye over the plate's mean drives
  the reference liquid to at the rest gap, per unit of the slider, in the
  flow's per-step speeds. Set so a pool of colour falls as fast as it did on
  the thin gap before (lab, Rain Drip 0.5, a pool of 1: 0.079 against
  0.083), where it fell because the whole plate slid downhill out of the
  dish at 0.092 round it; now it falls through clear liquid that rises past
  it (the plate's mean 0.001). Measured by hand in the lab against main;
  `npm run forces` holds the physics, not this number. Linear in the dye, as
  Boussinesq weight is (the mix's Dye Weight saturates with a tanh): a pool
  poured thick, up to the dye's cap of 6, is that much heavier and falls
  that much faster.
*/
const DRIP_WEIGHT = 0.5;
/*
  Updraft's shear, over the old push it is made from. The old push was only
  on the colour, and a pool pushed while the clear liquid round it is not
  goes at about half the push (Darcy's: the liquid round it has to get out
  of its way); the draught's shear is on all of it, so it is halved to move
  a pool as fast as it went (lab, by hand against main: a pool 0.0179 at
  the full push against 0.0096 before).
*/
const AIR_SHEAR = 0.5;
/*
  The liquid's thickness, as a kinematic viscosity in m²/s, from the
  Thickness dial (0 to 1): water (1 mm²/s) at 0, glycerine (about a thousand)
  at 1, on a log scale, which is how viscosities are spread: a light mineral
  oil sits near 0.45, a heavy one near 0.6, olive oil near 0.63, syrup at
  the top. The drag time h²/12ν in the middle of the plate is then about
  three seconds for water, a tenth of a second at 0.45, and a millisecond
  for glycerine.
*/
export function thinGapViscosity(thickness: number): number {
  return 1e-6 * Math.pow(10, 3 * Math.max(0, Math.min(1, thickness)));
}
/** The drag time ρh²/12μ, in seconds, at the plate's rest gap, for a Thickness. */
export function thinGapDragSeconds(thickness: number, gap = REST_GAP): number {
  const h = gap * PLATE_METRES;
  return (h * h) / (12 * thinGapViscosity(thickness));
}
/*
  How hard the magnet pulls the liquid where the ferrofluid is, per unit of
  magnetic energy gradient, in real seconds (phaseForce). Calibrated in the
  lab (scripts/lab.mjs): a hand-held magnet a fifth of the plate from a pool
  draws it in at a quarter of the plate a second, fast enough to follow a
  hand dragging it, and a pool a sixth of the plate off arrives in about a
  second.
*/
const MAGNET_GAIN = 6e-6;
/*
  The most one step of the magnet may add to a cell, in plate widths a
  second: a guard, not a limit on the pull. At half a plate a second it
  clipped the edge of a pool nearest the magnet and not the far one, which
  flattened the pull, and a dragged magnet left the ferrofluid behind (CI:
  0.023 of the plate against a hand that crossed 0.65 of it).
*/
const MAGNET_CAP = 3;
/*
  And never more than this many cells a step, whatever the look's clock.

  The pull is in real seconds, so a slow look (a tiny step) multiplies it:
  on Classic, five times the lab's, it asked for velocities of several
  hundred, fifty cells a step, which the velocity's own advection and the
  ferrofluid's flux step (0.45 of a cell) cannot carry, and the dragged
  ferrofluid went nowhere (CI: 0.003 of the plate). In cells a step the cap
  means the same on every look and every grid. The ferrofluid's flux step is
  substepped to match (PHASE_SUBSTEPS).

  And no more than those substeps can carry (0.45 of a cell each): at 6,
  on a machine drawing ten frames a second (each step then a tenth of a
  second of pull), the flux step was asked for more than its limit and the
  plate lost an eighth of its ferrofluid in a few seconds (CI: 86% kept).
*/
const MAGNET_CELLS = 2.4;

/*
  Ferro Pushes Dye's two exchanges at full (phaseDisplace in wgsl/fluid.ts),
  per pass, and passes a step. A cell gives away at most 4·(push + inside) of
  its dye in one pass, so the two together stay at or under a quarter or the
  exchange would overshoot and ring. The push is most of it because it is
  what the eye sees: the colour moved ahead of a growing finger and packed
  along the edge. The inside only has to walk dye poured under a pool out to
  the edge eventually, since the middle is drawn black.
*/
export const DISPLACE_PUSH = 0.18;
/*
  Oil Bodies at full (bodyPartition): how fast each colour is evened out
  through its own liquid across an edge, a pass; how much of the colour
  stranded in the wrong liquid, deep in it, is handed over a pass; how fast
  the oil's colour evens out inside a body; and passes a step. The first is
  a diffusion's rate and stays at or under a quarter; each exchange is held
  besides to a fifth of what the giver has.
*/
export const BODY_EVEN = 0.2;
export const BODY_HAND = 0.1;
export const BODY_INSIDE = 0.02;
const BODY_PASSES = 2;
/*
  How strongly colour astray from its liquid is steered back (bodyPartition):
  the gain on the blurred oil's step across a face, so that any step at all
  points the way (it saturates at a fifth of a cell's colour a face), and how
  many blurs make the field it follows, each reaching two cells further.
  Beyond the reach, colour with no oil anywhere near is the water's.
*/
const BODY_DRIFT = 2000;
const BODY_REACH_BLURS = 4;
export const DISPLACE_INSIDE = 0.06;
const DISPLACE_ITERS = 2;
const PHASE_SUBSTEPS = 6;
const GRAIN_PERIOD = 6;

const VEL = SOLVER_VEL_FORMAT;
const R32 = 'r32float';
const RG32 = 'rg32float';
const RGBA32 = 'rgba32float';

/** The Sim uniform, laid out as WGSL sees it (see SIM_STRUCT). */
const SIM_FLOATS = 48;      // 36 scalars (33 is the vec2's alignment), then the fingers' three magnets at 36..47

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
  /** The multigrid's coarse levels (level 0 is `press` itself): each half the size of the one above. */
  private readonly mg: { n: number; p: GPUBuffer; b: GPUBuffer }[] = [];
  /** How the projection solves: multigrid V-cycles (the show), or the sweeps alone (kept for A/B checks). */
  pressureSolver: 'multigrid' | 'sweeps' = 'multigrid';
  /** The squeeze film's pressure, packed as two colour planes like `press`. */
  private readonly spress: GPUBuffer;
  private readonly cur: PingPong;
  private readonly curP: PingPong;
  /** The spun dish's swirl, on the current's grid, and its projection's pressure and divergence (spinSwirl). */
  private readonly swirl: PingPong;
  private readonly swirlP: PingPong;
  private readonly swirlDiv: GPUTexture;
  /** Whether the swirl holds anything: it is added to the flow only while it does. */
  private swirlLive = false;
  /** Seconds the swirl runs on after its forcing stops, so what it made can die away. */
  private swirlTail = 0;
  /**
   * For `npm run swirlcost` (PLAN 22k): the same plate with the swirl held
   * off, to read what it costs, and how many steps ran it of how many were
   * taken. Never set by the app. On the class, so a solver the ladder builds
   * mid-measurement is held off too.
   */
  static swirlHeldOff = false;
  readonly swirlCount = { steps: 0, ran: 0 };
  private readonly grain: PingPong | null;
  private readonly div: GPUTexture;
  /*
    What divergence writes, before its plate mean is taken off into `div`
    (divTiles, divFold, divCentre in wgsl/fluid.ts): the partial sums, and
    the mean itself.
  */
  private readonly divRaw: GPUTexture;
  private readonly divPartials: GPUBuffer;
  private readonly divMean: GPUBuffer;
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
  /** The reading `rbDye` holds: the ring's sequence when it was copied in, not when the next one landed. */
  private rbDyeSeq = -1;
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
  /*
    The liquids' own physics and chemistry (docs/physics-plan.md), made only
    when a look uses them: the mix (oil, surfactant, acidity, and the oil's
    chemical potential) and the reactions (BZ's two species, the Liesegang
    reagent and its precipitate). 16 bytes a texel each, so a plate that
    never pours any pays nothing.
  */
  private mix: PingPong | null = null;
  /*
    The thin-gap solver's own storage (PLAN §18a), made the first time a
    plate is stepped with Thin Gap on: the velocity before the step's forces,
    the mobility a cell (row-major, negative past the rim), and the mobility
    on each coarse level of the multigrid.
  */
  private hsPrev: GPUTexture | null = null;
  /** The velocity after the step's body forces (hsPrep reads them apart from the stirring), made with hsPrev. */
  private hsMid: GPUTexture | null = null;
  /** What the step's hsPrep reads as the velocity after the body forces: hsMid, or hsPrev when no body force ran. */
  private hsMidNow: GPUTexture | null = null;
  private hsMob: GPUBuffer | null = null;
  private hsP: GPUBuffer | null = null;
  /** Whether the thin gap's pipelines are built (prepareThinGap), and the build under way. */
  private hsReady = false;
  private hsBuilding: Promise<void> | null = null;
  /** And the old plate's (prepareOldPlate), which a show that opens on a thin gap builds only when Thin Gap is turned off. */
  private oldReady = false;
  private oldBuilding: Promise<void> | null = null;
  private hsMobC: GPUBuffer[] = [];
  private hsFaceC: GPUBuffer[] = [];
  /** The gap as the last thin step left it, a cell at a time: its change is the press (hsDivergence). */
  private hsGap: GPUBuffer | null = null;
  /** The carries' plan on a thin gap (carryPlan): the step's largest Courant number, the pairs' indirect dispatches, and 1/n, n and that number. */
  private carryMost: GPUBuffer | null = null;
  private carryInd: GPUBuffer | null = null;
  private carrySub: GPUBuffer | null = null;
  /** False until a thin step has recorded the gap, and again whenever the glasses are re-laid rather than pressed. */
  private hsPrimed = false;
  /** V-cycles a thin solve takes: the old solver's count, which leaves under 2% of the flow's divergence (`npm run thingap`). */
  private readonly hsCycles = MG_CYCLES;
  /** Whether the last step ran as a thin gap: the next frame's deltas are imposed, not added. */
  private thinLive = false;
  /** The same, for the hands (PlateSolver.thinGapLive). */
  get thinGapLive(): boolean { return this.thinLive; }
  /*
    Oil Bodies: the oil's own share of the dye (see bodyPartition), in the
    dye's format, made the first step a plate has oil on it with Oil Bodies
    up. The water's share is the dye less this, so nothing else that reads
    the dye needs to know it exists.
  */
  private oilDye: PingPong | null = null;
  /** The oil blurred wide, for colour astray from its liquid to find the way back (bodyPartition). */
  private oilReach: PingPong | null = null;
  /** Whether the last step asked for Oil Bodies (the setting, and oil's tension to have oil at all). */
  private bodiesWanted = false;
  /** The oil's share went unkept for a step: stale, to be emptied before it is used again. */
  private oilDyeStale = false;
  private rxn: PingPong | null = null;
  /** Liesegang's four species (A, B, their product C, the precipitate P). */
  private lies: PingPong | null = null;
  private liesLive = false;
  private mixLive = false;
  /*
    How much of the plate the oil poured since it was last cleared covers,
    as a share of its area. Cahn–Hilliard and the flux transport both keep
    the oil exactly (npm run physics), so what went in is what is there,
    and a tally is the whole measurement: Oil Bodies stops pouring bodies
    when the plate is full of them.
  */
  private oilPoured = 0;
  get oilCover(): number { return this.oilPoured; }
  private rxnLive = false;
  get chemistryLive(): { rxn: boolean; lies: boolean } { return { rxn: this.rxnLive, lies: this.liesLive }; }
  /** What the plate draws from the liquids' own physics, packed (see packView). */
  private viewTex: GPUTexture | null = null;
  private blankR: GPUTexture | null = null;
  private blankPhaseTex: GPUTexture | null = null;
  private blankRGBA: GPUTexture | null = null;
  /** Scratch for the vorticity and the ferrofluid's chemical potential. */
  private scratchR: GPUTexture | null = null;
  /** The ferrofluid's long-range repulsion ψ (see screenJacobi), kept between steps. */
  private psi: PingPong | null = null;
  /** Its chemical potential (phaseMu), kept for the next step's maze force. */
  private phaseMuT: GPUTexture | null = null;
  /**
   * The gap the ferrofluid last moved in, a cell at a time, so a step can
   * tell how far the glass closed on it (phaseAdvect, Thin Gap). Not primed
   * until a step has written it: a fresh plate, new glasses (Plate Shape)
   * and a pour onto an empty plate each start it again, so the first step
   * after one does not read the whole gap as the glass arriving.
   */
  private phaseGap: GPUBuffer | null = null;
  private phaseGapPrimed = false;
  private mazeReady = false;
  /** For the harness: whether the phase stage is running at all. */
  get phaseIsLive(): boolean { return this.phaseLive; }
  private airCover = 0;
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
  private airCoverPrev = 0;
  /** How much of a press reaches the flow, from the look's plate pressure. */
  private squeezeGain = 0;
  private lastDt = 1 / 60;

  /**
   * The kernels a step runs, on any look a show can open on, built before
   * the show opens (`gpu/prepare.ts`) in the formats this device's solver
   * will ask for.
   *
   * A list, and so a thing that can fall behind the step. It was taken from
   * what the show actually built: every `computePipeline` call a show at
   * `?gpu=mid&look=classic` made in its first twenty seconds (thirty-seven
   * here, forty-four with the plate, the probe and the air), and then the
   * ones each of the other thirty-seven looks added in its first steps:
   * vorticity for galaxy, the dye's own diffusion for eleven of them, the
   * mix for soap-film, the reaction for chemical-clock, the second phase and
   * the gel for others. The show opens on a
   * look picked at random (`OPENING_LOOK`), so a list for one look left the
   * freeze in place for the nights that opened on another. `npm run startup`
   * holds it to all of them: it fails when an opening, or a change to any
   * look, builds a pipeline on a frame.
   *
   * Past what the looks were seen to ask for, the rest of what a step can
   * run is here too (below), so a setting turned up mid-set does not
   * compile on the frame either.
   *
   * `dye` is the dye's own format, which is a half float on a GPU that cannot
   * filter a full one; the scratch textures the advection writes are the
   * dye's format too, and so is one pass of the velocity's advection.
   */
  static prepare(device: GPUDevice, opts: { float32Filterable: boolean }, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'fluid');
    const dye: GPUTextureFormat = opts.float32Filterable ? RGBA32 : VEL;
    /*
      Each with whether the show waits for it (`gpu/opening.ts`): true for
      what every look's first steps ask for, the part of the look that uses
      it, or false for what is built behind the show once it is up. The
      forty-three every opening asks for were read off all thirty-eight
      looks' openings; `npm run startup` reads them again on every run.
    */
    const byFormat: [string, GPUTextureFormat[], boolean][] = [
      ['fill', [dye, RGBA32, VEL, R32], true],
      ['gapRest', [RG32], true],
      // A change to the plate's shape: a look changed to mid-show, never an opening.
      ['gapReshape', [RG32], false],
      ['deltaDye', [dye], true],
      ['deltaVel', [VEL], true],
      ['squeezeUpdate', [RG32], true],
      ['scaleDye', [dye], true],
      // The dye's grid pattern, in every look its diffusion does not reach (dampGrid).
      ['dampGrid', [dye], true],
      // The dye's diffusion, in twenty-nine of the thirty-eight: not worth a rule.
      ['jacobi', [VEL, dye], true],
      ['advect', opts.float32Filterable ? [dye, RGBA32] : [dye], true],
      ['forcesB', [VEL], true],
      ['currentForces', [VEL], true],
      ['curDivergence', [R32], true],
      ['curPressure', [R32], true],
      ['curGradient', [VEL], true],
      ['addCurrent', [VEL], true],
      // The spun dish (PLAN §22): no look spins at opening, so built behind.
      ['spinSwirl', [VEL], false],
      ['decayDye', [dye], true],
      ['decayVel', [VEL], true],
      ['packView', ['rgba32uint'], true],
      ['downsample', [RGBA32], true],
      ...(opts.float32Filterable ? [['seedGrain', [RGBA32], true] as [string, GPUTextureFormat[], boolean]] : []),
      // Vorticity (galaxy): the curl into a single-channel scratch.
      ['curl', [R32], open.vorticity],
      ['confine', [VEL], open.vorticity],
      // The mix (soap-film), always full float, and its surface tension on
      // the dye as well as on itself.
      ['marangoniFlux', [dye, RGBA32], open.mix],
      ['mixSplat', [RGBA32], open.mix],
      // The mix's carry on the old plate; on a thin gap it is carried in
      // substeps (mixAdvectSub, below), so a look opening on one never asks.
      ['mixAdvect', [RGBA32], open.mix && !open.thinGap],
      ['mixRelax', [RGBA32], open.mix],
      ['mixMu', [RGBA32], open.mix],
      ['mixUpdate', [RGBA32], open.mix],
      /*
        Oil Bodies, and the oil's smoothed shape that its reach and the
        oil's surface tension (mixForce) both read: built behind the show,
        like mixForce. They were first waited for whenever a look with Oil
        Bodies opened the show, and `npm run startup` on Metal failed it:
        Oil & Water, opened on its own, asked for none of the six in its
        first forty steps, because nothing runs them until oil has been
        poured, and the opening's rule is to wait only for what a look's
        first steps use. Behind the show they are ready some fifteen
        seconds after it opens, as mixForce always has been.
      */
      ['mixSmooth', [R32], false],
      /*
        The dye across faces is also how the dye moves wherever the maze
        flows (the advect dye stage), from the maze's first step, so a look
        that opens with it waits for it as it waits for mazeForce.
      */
      ['bodyAdvect', [dye], open.maze],
      ['bodyPartition', [dye], false],
      ['bodyUnspread', [dye], false],
      ['bodyLand', [dye], false],
      ['mixCarry', [RGBA32], false],
      // A hand's carry of the ferrofluid (PLAN.md §9n): no look runs it in
      // its first steps, only a Finger or a Blow does, so like mixCarry it is
      // built behind the show; waited for at the open, `npm run startup`
      // fails it as asked for by none.
      ['phaseCarry', [R32], false],
      // The reaction (chemical-clock) and the gel, each on its own
      // full-float grid.
      ['rxnStep', [RGBA32], open.reaction],
      ['liesStep', [RGBA32], open.gel],
      ['gridSplat', [RGBA32], open.reaction || open.gel],
      // The second phase, single-channel, and what it does to the flow.
      ['phaseSplat', [R32], open.phase],
      ['phaseAdvect', [R32], open.phase],
      ['phaseGapSeen', [R32], open.phase],
      ['phaseSeparate', [R32], open.phase],
      // The two volume forms (phaseGrid, phaseCHVolume) run only on a thin
      // gap. Every look opens on one now (Thin Gap, on in every look), so a
      // ferrofluid look carries its ferrofluid as a volume from its first
      // steps and waits for them; a look opened with Thin Gap off builds them
      // behind, as it did when no look opened on one (`npm run startup`
      // fails a pipeline waited for and asked for by none).
      ['phaseGrid', [R32], open.phase && open.thinGap],
      ['phaseRelax', [R32], open.phase],
      ['screenJacobi', [R32], open.phase],
      ['phaseMu', [RG32], open.phase],
      ['phaseCH', [R32], open.phase],
      ['phaseCHVolume', [R32], open.phase && open.thinGap],
      ['phaseForce', [VEL], open.phase],
      ['mazeForce', [VEL], open.maze],
      // The ferrofluid pushing the dye (Pushes Dye), on the dye's own grid.
      ['phaseDisplace', [dye], open.displace],
      // And the rest of what a step can run: the mix's push on the flow,
      // sharpening, the bubbles clearing dye, the reaction's deposit, the
      // drain. None was seen in a look's first steps, the mix's and the
      // reaction's own looks included, but each is one setting away, and a
      // compile on the frame mid-set is the same stop: built behind.
      ['mixForce', [VEL], false],
      ['sharpenDye', [dye], false],
      ['airExclude', [dye], false],
      ['depositChem', [dye], false],
      ['drainVel', [VEL], false],
    ];
    // The ones asked for by name alone, each with the one format it writes:
    // zeroing a pressure (the old plate's, between projections) and a
    // coarse level, which both solvers do every step. The old plate's own
    // solve is in oldPlateBuilds.
    const byName: [string, GPUTextureFormat][] = [['mgZero', R32]];
    const keyed = new Map<string, [string, boolean]>();
    const add = (key: string, code: string, now: boolean) => keyed.set(key, [code, now || (keyed.get(key)?.[1] ?? false)]);
    for (const [name, formats, now] of byFormat) for (const f of formats) add(`${name}:${f}`, kernel(name, f), now);
    for (const [name, f] of byName) add(name, kernel(name, f), true);
    /*
      The thin gap's kernels (PLAN §18a): waited for by a look that opens on a
      thin gap, which since the owner's pick (2026-10-03) is every look, so
      its first step is a thin one and asks for every one of them. Left off
      the list for a look that opens with Thin Gap off: they are then built
      when it is first turned on (prepareThinGap), as before, so a show that
      never turns it on does not pay for them behind it either (see there).
      The mix's carry in substeps waits only where the look opens with the
      mix, as the mix's own carry does, and is built behind otherwise.
    */
    if (open.thinGap) {
      for (const [key, code] of WebGPUFluid.thinBuilds(dye)) add(key, code, true);
      add('mixAdvectSub:rgba32float', kernel('mixAdvectSub', 'rgba32float'), open.mix);
    } else {
      /*
        And the other way: the old plate's projections, its velocity's
        self-advection, its squeeze's own solve and its dye's backtrace,
        which a thin step never asks for. Waited for only by a look that
        opens with Thin Gap off; otherwise built when Thin Gap is first
        turned off (prepareOldPlate), with the plate staying thin until they
        are in. Every opening built both solvers otherwise, fourteen
        pipelines for nothing: about 3.4 s of a cold opening at prepare.ts's
        0.23 s each on CI's Mac, which `npm run startup`'s 1b counts as the
        show's own wait, against its 1 s of slack, since nothing asks for them.
      */
      for (const [key, code] of WebGPUFluid.oldPlateBuilds(dye)) add(key, code, true);
    }
    // The splats' deltas brought up to the grid, every step.
    for (const f of [RGBA32, R32] as GPUTextureFormat[]) add(`upsampleDelta:${f}`, splatKernel('upsampleDelta', f), true);
    // A tool, a pour: the splats, always into the full-float deltas. And the
    // plate measured (`measure`), keyed by name as `statsRun` asks. Neither
    // was asked for in any look's first forty steps, nor in the classic
    // opening's first twenty seconds on the Mac: built behind, and `npm run
    // startup` gives each look's opening seconds as well as steps to say so.
    for (const name of ['splatDeltas', 'pourImage']) add(`${name}:${RGBA32}`, splatKernel(name, RGBA32), false);
    for (const name of ['statsTiles', 'statsFold'] as const) add(name, STATS_KERNELS[name], false);
    return [...keyed].map(([key, [code, now]]) => cache.computePrep(key, code, !now));
  }

  /**
   * What a thin step needs built before it can run (prepare, prepareThinGap,
   * thinGapOn): its kernels, the velocity's snapshot in the velocity's own
   * format, and the dye's carry in substeps. Not the mix's carry, which only
   * a look with the mix asks for.
   */
  private static thinBuilds(dye: GPUTextureFormat): [string, string][] {
    return [
      ...THIN_GAP_KERNELS.map((name): [string, string] => [`${name}:thin`, kernel(name, 'rgba16float')]),
      [`scaleDye:${VEL}`, kernel('scaleDye', VEL)],
      [`bodyAdvectSub:${dye}`, kernel('bodyAdvectSub', dye)],
    ];
  }

  /** The old plate's own pipelines, which a thin step never asks for (prepare, prepareOldPlate). */
  private static oldPlateBuilds(dye: GPUTextureFormat): [string, string][] {
    const byName: [string, GPUTextureFormat][] = [
      ['pressureRedBlack', R32], ['squeezeRedBlack', R32],
      ['mgRestrict0', R32], ['mgSmooth', R32], ['mgRestrict', R32], ['mgProlong', R32],
      // The projection's right-hand side made zero-mean, every step (divTiles).
      ['divTiles', R32], ['divFold', R32], ['divCentre', R32],
      ['squeezeVelBuf', VEL], ['gradientSubtractBuf', VEL],
    ];
    return [
      ...byName.map(([name, f]): [string, string] => [name, kernel(name, f)]),
      [`divergence:${R32}`, kernel('divergence', R32)],
      // The dye's backtrace and the velocity's self-advection (one key when the dye is half float).
      ...[...new Set([dye, VEL])].map((f): [string, string] => [`macCormack:${f}`, kernel('macCormack', f)]),
    ];
  }

  /**
   * Off only for `?prepare=0`, the show opened the old way, every pipeline
   * built on the frame that first asks (`npm run startup`'s control). There
   * the thin gap's are built on the frame too, at its first step, rather than
   * behind it while the plate runs the old way: otherwise the control's first
   * seconds would be the old plate's, and its pipelines the old plate's, and
   * the startup check would price the show's wait for the thin gap's against
   * a control that never waited for them.
   */
  static buildAhead = true;

  constructor(private readonly device: GPUDevice, physicalSize: number, logicalSize: number, opts: { float32Filterable: boolean; timestamps?: boolean }) {
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

  /** As run, with the pressure buffer bound after the texture written. */
  private runPressed(pass: GPUComputePassEncoder, name: string, dst: GPUTexture, reads: GPUTexture[], args: GPUBuffer): void {
    const pipe = this.pipeline(name, dst.format);
    const key = `${name}:${dst.format}:${dst.label}:${reads.map((r) => r.label).join(',')}:${args.label}:press`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...reads, dst, this.press]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /** The gap the ferrofluid has seen, made zero (unprimed) the first time. */
  private ensurePhaseGap(): GPUBuffer {
    if (!this.phaseGap) {
      this.phaseGap = this.disposer.track(this.device.createBuffer({ label: 'phase gap seen', size: Math.max(16, this.N * this.N * 4), usage: GPUBufferUsage.STORAGE }));
    }
    return this.phaseGap;
  }

  /**
   * phaseAdvect: runPressed's bindings, then the gap, the gap the phase last
   * saw, and the thin solve's pressure and mobility (a stand-in for each until
   * Thin Gap has run: the kernel reads them only under it).
   */
  private runPhaseAdvect(pass: GPUComputePassEncoder, args: GPUBuffer): void {
    const pipe = this.pipeline('phaseAdvect', this.phase.write.format);
    const thin = !!this.hsP && !!this.hsMob;
    const key = `phaseAdvect:${this.phase.read.label}:${this.squeeze.read.label}:${args.label}:${thin}`;
    let group = this.groups.get(key);
    if (!group) {
      const gap = this.ensurePhaseGap();
      group = bindGroup(this.device, pipe, [this.sim, args, this.phase.read, this.velForced, this.phase.write, this.press, this.squeeze.read, gap,
        thin ? this.hsP! : gap, thin ? this.hsMob! : gap]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /** phaseGrid: the phase's grid filter as a volume, on the gaps phaseAdvect's substep ended at. */
  private runPhaseGrid(pass: GPUComputePassEncoder, args: GPUBuffer): void {
    const pipe = this.pipeline('phaseGrid', this.phase.write.format);
    const key = `phaseGrid:${this.phase.read.label}:${this.squeeze.read.label}:${args.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, this.phase.read, this.phase.write, this.squeeze.read, this.ensurePhaseGap()]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /** The gap as the phase has now seen it (phaseGapSeen), every step the phase moves, whichever solver. */
  private runPhaseGapSeen(pass: GPUComputePassEncoder): void {
    const pipe = this.pipeline('phaseGapSeen', R32);
    const key = `phaseGapSeen:${this.squeeze.read.label}`;
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, this.arg('none', [0, 0, 0, 0]), this.squeeze.read, this.ensurePhaseGap()]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
    this.phaseGapPrimed = true;
  }

  private fill(pass: GPUComputePassEncoder, dst: GPUTexture, value: [number, number, number, number], size: number): void {
    this.run(pass, 'fill', dst, [], this.arg(`fill ${dst.label}`, [...value, size, size, 0, 0]), size);
  }

  private writeSim(p: GpuStepParams, disp: number): void {
    const f = this.simF, i = this.simI;
    f[0] = this.N; f[1] = this.L; f[2] = p.dt; f[3] = p.time; f[4] = disp; f[5] = p.visc;
    f[6] = p.turbScale; f[7] = p.spin; f[8] = p.immiscibility; f[9] = 0;
    f[10] = p.vibIntensity; f[11] = p.vibFrequency; f[12] = p.drip; f[13] = p.air;
    f[14] = p.smearX; f[15] = p.smearY;
    /*
      A thin gap has its drag in the projection (wgsl/thinGap.ts), so decayVel
      neither damps nor clamps it: only the heat decays there.
    */
    const thin = this.thinGapOn(p);
    f[16] = thin ? 1 : p.damping; f[17] = p.heatDecay; f[18] = thin ? 1000 : MAX_SPEED; f[19] = p.evapFactor; f[20] = p.sharpness;
    i[21] = Math.max(1, Math.min(4, Math.round(p.turbDetail)));
    f[22] = p.currentDamp; f[23] = p.currentBuoy; f[24] = p.currentGrav; f[25] = p.twist;
    f[26] = p.meanDensity; f[27] = p.maxCurrent;
    f[28] = p.rockX; f[29] = p.rockY;
    f[30] = p.plateCurve; f[31] = p.gapSpring; f[32] = p.gapMemory;
    const gl = Math.hypot(p.gravityX ?? 0, p.gravityY ?? -1) || 1;
    f[34] = -(p.gravityX ?? 0) / gl; f[35] = -(p.gravityY ?? -1) / gl;
    const extras = p.magnetStrength > 0.0001 ? p.extraMagnets ?? [] : [];
    for (let k = 0; k < 3; k++) {
      const m = extras[k];
      f[36 + k * 4] = m?.x ?? 0; f[37 + k * 4] = m?.y ?? 0;
      f[38 + k * 4] = p.magnetHeight; f[39 + k * 4] = m ? p.magnetStrength : 0;
    }
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
    for (const t of [this.div, this.divRaw]) this.fill(pass, t, [0, 0, 0, 0], this.N);
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
    if (this.oilDye) for (const t of [this.oilDye.a, this.oilDye.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.oilPoured = 0;
    if (this.rxn) for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
    if (this.lies) for (const t of [this.lies.a, this.lies.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    this.mixLive = false;
    this.rxnLive = false;
    this.liesLive = false;
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
    this.run(pass, 'deltaDye', this.dye.write, [this.dye.read, this.deltaDyeTex, this.deltaMulTex], this.arg('none', [0, 0, 0, 0]));
    this.dye.swap();
    this.run(pass, 'deltaVel', this.vel.write, [this.vel.read, this.deltaVelTex], this.arg('delta vel', [this.thinLive ? 1 : 0, 0, 0, 0]));
    this.vel.swap();
    this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex], this.arg('squeeze delta', [1, this.thinLive ? 1 : 0, 0, 0]));
    this.squeeze.swap();
  }

  /**
   * Lay down the dye the reaction has grown, in the same breath as the deltas
   * — before the step, so this frame's flow carries it. `amount` is per cell
   * per step, `colour` the dye's own colour.
   *
   * Nothing calls this now. It was the deposit half of `WebGPUChemistry`, the
   * GPU twin of `lib/chemistry.ts`, which was never wired in and has gone
   * (S13); the show grows the reaction on the CPU and lays its dye from there.
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
    const disp = stepDisplacement(p.dt, p.advection, N);
    // The ferrofluid maze: how strong the field is, and its constants on this grid (MAZE_PERIOD).
    const maze = this.phaseLive ? Math.max(0, Math.min(1, p.ferroLabyrinth ?? 0)) : 0;
    /*
      Whether a magnet is close enough under the glass to stand the
      ferrofluid up into spikes (wgsl/spikes.ts, spikeAmp on the magnet's
      axis, where the field is strongest): then the spikes' wells go into μ
      and the maze's flow carries the liquid into them, maze field or not.
      And the magnet's own field is a maze field as strong as its spikes, on
      a look with a Labyrinth (see HAND_SCREEN).
    */
    const spikeAmt = this.phaseLive ? spikesOnAxis(p.magnetStrength, p.magnetHeight) : 0;
    const spikes = spikeAmt > 0;
    const field = maze > 0.001 ? Math.max(maze, spikeAmt) : 0;
    // Never under twelve cells a period: the edge is three or four wide, and
    // on 192² (8.6 cells) the stripes washed out to grey. Maze Detail divides
    // the period by up to three (MAZE_FINEST), and that floor is why it is
    // a setting and not a new constant: see MAZE_FINEST. (Finer still under
    // the hand was tried for thinner fingers: at 384² they came out at the
    // floor, grey and too thin to draw.)
    const period = MAZE_PERIOD / Math.pow(MAZE_FINEST, Math.max(0, Math.min(1, p.mazeDetail ?? 0)));
    const kk = (2 * Math.PI / Math.max(period * N, 12)) ** 2;
    const m2f = 0.16 + (HAND_SCREEN - 0.16) * spikeAmt;
    const mazeK = { m2: m2f * kk, alpha: ((1 + m2f) * kk) ** 2 };
    if (maze <= 0.001 && !spikes) this.mazeReady = false;
    const thin = this.thinGapOn(p);
    if (!thin) this.hsPrimed = false;
    if (!this.phaseLive) this.phaseGapPrimed = false;
    this.thinLive = thin;
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
        this.hsPrimed = false;
        this.phaseGapPrimed = false;
      } else if (this.lastCurve !== p.plateCurve) {
        this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
          this.arg('gap reshape', [this.lastCurve, p.plateCurve, 0, 0]));
        this.squeeze.swap();
        this.lastCurve = p.plateCurve;
        // New glasses, not a press: a thin gap takes the new shape as it is.
        this.hsPrimed = false;
        this.phaseGapPrimed = false;
      }
      if (!deltasApplied) {
        this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex], this.arg('squeeze no delta', [0, 0, 0, 0]));
        this.squeeze.swap();
      }
      /*
        A thin gap stops here: the gap is the liquid's mobility and its rate
        is the press, both read by the thin-gap projection, and the film's
        own pressure below adds a pure gradient that a projection deletes
        (wgsl/fluid.ts, divergence). Kept as it was otherwise.
      */
      if (thin) return;
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
    /*
      Heat diffuses through water about a hundred times faster than a dye or
      a salt does (a Lewis number near 100). The two used to share one
      diffusivity, which rules out the double-diffusive instabilities (salt
      fingers) altogether. doubleDiffusion raises the heat's alone.
    */
    const heatDiff = p.diff * (1 + 99 * Math.max(0, Math.min(1, p.doubleDiffusion ?? 0)));
    const visc: [number, number, number, number] = [p.dt * p.nu * n2, p.dt * p.nu * n2, p.dt * heatDiff * n2, 0];
    stage('viscosity', (pass) => {
      this.jacobi(pass, this.vel, visc, VISC_ITERS, 'vel');
    }, visc.some((v) => v > 0));

    /*
      A thin gap keeps the velocity from before the forces, so it can read
      what they asked for as a speed to drive the liquid to (hsPrep).
    */
    stage('thin gap keep', (pass) => {
      this.run(pass, 'scaleDye', this.ensureThinGap(), [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
    }, thin);

    // 4. Project, 5. advect velocity by itself, 6. project again
    /*
      The magnet, as a force on the liquid where the ferrofluid is (H7,
      phaseForce): before the projection, which keeps the part that carries a
      drop toward the magnet and the water around it. Real seconds over the
      flow's own displacement is what makes the pull the same on a slow look
      as a fast one. Only with a magnet under a plate that has ferrofluid.
    */
    const magnetOn = this.phaseLive && p.magnetStrength > 0.0001 && (p.magnetSeconds ?? 0) > 0;
    if (magnetOn) {
      stage('magnet', (pass) => {
        const perStep = (p.magnetSeconds ?? 0) / Math.max(disp, 1e-7);
        // Under a maze field the magnet's pull gives way to the dipoles'
        // repulsion: pulled hard to one spot, the ferrofluid stacks into
        // rings round it rather than a maze (the gradient orders the
        // stripes across it). Still enough that the maze follows the hand.
        const pull = (1 - 0.75 * maze) * (maze > 0.001 ? 1 - (1 - SPIKE_PULL) * spikeAmt : 1);
        this.run(pass, 'phaseForce', this.vel.write, [this.vel.read, this.phase.read],
          this.arg('magnet force', [p.magnetX, p.magnetY, p.magnetHeight, p.magnetStrength, MAGNET_GAIN * perStep * pull,
            Math.min(MAGNET_CAP * perStep, MAGNET_CELLS / Math.max(disp * N, 1e-9)), 0, 0]));
        this.vel.swap();
      });
    }
    // The maze's own flow (mazeForce), from last step's chemical potential.
    const mazeFlow = this.mazeReady && !!this.phaseMuT && (p.magnetSeconds ?? 0) > 0;
    if (mazeFlow) {
      stage('maze force', (pass) => {
        const perStep = (p.magnetSeconds ?? 0) / Math.max(disp, 1e-7);
        this.run(pass, 'mazeForce', this.vel.write, [this.vel.read, this.phase.read, this.phaseMuT!],
          this.arg('maze force', [MAZE_GAIN * (1 + (SPIKE_FLOW - 1) * spikeAmt) * (N / 256) * perStep, MAGNET_CELLS / Math.max(disp * N, 1e-9), 0, 0]));
        this.vel.swap();
      });
    }
    /*
      What the mix does to the flow (see mixForce): surface tension round the
      oil, Marangoni flow away from soap, buoyancy from the dye's weight and
      the heat. Here, before the projection, for the same two reasons as the
      magnet: the projection keeps the part of each that is real flow, and
      the step's flow is built from what is added before it (the velocity
      carried from step to step is capped small in \`decayVel\`; what moves
      the plate is what each step adds and the lasting current).
      In real seconds: each strength is plate widths a second.
    */
    const oil = Math.max(0, Math.min(1, p.oilTension ?? 0));
    const soap = Math.max(0, Math.min(1, p.surfactantFlow ?? 0));
    /*
      Dye weighs something whether or not a look says how much, so standing
      the plate up (Gravity) pours it downhill on any look; Dye Weight, where
      a look sets it, says how much. Flat on the projector gravity is
      straight through the glass and this is zero either way.
    */
    const upright = Math.max(0, Math.min(1, p.plateUpright ?? 0));
    const buoy = Math.max(Math.max(0, Math.min(1, p.solutalBuoyancy ?? 0)), upright > 0.001 ? 0.5 : 0);
    if (buoy > 0.001) this.ensureMix();
    const mix = this.mix;
    /*
      Oil Bodies (see bodyPartition): only where there is oil for the colour
      to keep to, which takes the oil's own surface tension, since the oil is
      poured into the mix only while that is on.
    */
    const bodies = Math.max(0, Math.min(1, p.oilBodies ?? 0));
    this.bodiesWanted = bodies > 0.001 && oil > 0.001;
    const bodiesOn = this.bodiesWanted && !!mix && this.mixLive;
    if (bodiesOn) this.ensureOilDye();
    const bodiesFresh = bodiesOn && this.oilDyeStale;
    if (bodiesOn) this.oilDyeStale = false;
    else if (this.oilDye) this.oilDyeStale = true;
    const perSecond = (p.magnetSeconds ?? 1 / 60) / Math.max(disp, 1e-7);
    stage('mix force', (pass) => {
      /*
        Gravity in the plate: how far it stands up, toward the bottom of the
        room. The dish is drawn turned (Rotation, and a flick), and gravity
        does not turn with it: reported, Lava Lamp's wax poured off toward
        whichever corner the dish had started turned to and the plate was
        empty in twenty seconds. (Its rock and tilt move the dye already,
        through the lasting current.)

        And a lamp under it, just where the plate goes out of view: what
        sinks there is warmed, rises, cools as it goes and sinks again,
        which is what keeps a lava lamp going rather than settled.
      */
      const gl = Math.hypot(p.gravityX ?? 0, p.gravityY ?? -1) || 1;
      const gx = upright * (p.gravityX ?? 0) / gl, gy = upright * (p.gravityY ?? -1) / gl;
      const lamp = upright > 0.001 ? LAMP_HEAT * upright * (p.magnetSeconds ?? 1 / 60) : 0;
      const smooth = this.scratch();
      this.run(pass, 'mixSmooth', smooth, [mix!.read], none);
      this.run(pass, 'mixForce', this.vel.write, [this.vel.read, mix!.read, this.dye.read, smooth],
        this.arg('mix force', [oil * OIL_TENSION * perSecond * N * N, OIL_CELLS / Math.max(disp * N, 1e-9), lamp, Math.max(0.05, Math.min(0.5, p.gravityReach ?? 0.3)),
          gx, gy, buoy * DYE_WEIGHT * perSecond, buoy * HEAT_LIFT * perSecond]));
      this.vel.swap();
    }, !!mix && ((this.mixLive && oil > 0.001) || buoy > 0.001));
    /*
      On a thin gap, Rain Drip's heavy dye and Updraft's shear join the body
      forces (hsBody), and the velocity is kept here, after all of them and
      before the stirring, so hsPrep can read the two apart: a body force
      moves a liquid as its viscosity says, a stir as the dial says (PLAN
      18a-2, wgsl/thinGap.ts). With no body force this step there is nothing
      to keep, and hsPrep reads the velocity from before the forces in its
      place, which makes the body forces' share zero.
    */
    const mixOn = !!mix && ((this.mixLive && oil > 0.001) || buoy > 0.001);
    const thinBody = thin && (p.drip > 0.01 || p.air > 0.1);
    if (thinBody) {
      stage('thin body', (pass) => {
        this.ensureThinGap();
        this.hsRun(pass, 'hsBody', `hsBody:${this.vel.read.label}:${this.dye.read.label}:${this.squeeze.read.label}`,
          this.arg('thin body', [p.drip > 0.01 ? DRIP_WEIGHT * p.drip : 0, AIR_SHEAR, REST_GAP, 0, 0, 0, 0, 0]),
          [this.vel.read, this.dye.read, this.squeeze.read, this.vel.write]);
        this.vel.swap();
      });
    }
    if (thin) {
      const body = magnetOn || mazeFlow || mixOn || thinBody;
      const prev = this.ensureThinGap();
      this.hsMidNow = body ? this.hsMid! : prev;
      stage('thin gap mid', (pass) => {
        this.run(pass, 'scaleDye', this.hsMid!, [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
      }, body);
    }
    // Vorticity confinement, a look option (see `curl` in wgsl/fluid.ts).
    stage('confine', (pass) => {
      const w = this.scratch();
      // The spin of the flow the plate actually moved by last step: the
      // velocity carried between steps is capped small (decayVel).
      this.run(pass, 'curl', w, [this.velForced], none);
      this.run(pass, 'confine', this.vel.write, [this.vel.read, w], this.arg('confine', [Math.min(1, p.vorticity ?? 0) * CONFINE, 0, 0, 0]));
      this.vel.swap();
    }, (p.vorticity ?? 0) > 0.001);
    /*
      8.8. The spun dish's swirl (PLAN §22): only while something spins.
      Worked out ahead of either solve, because it reads nothing they write
      and a thin gap takes it in before its solve, with the current: the
      swirl is a speed the dish's drag holds the liquid to against the
      glass, which is what the thin solve takes a current to be, and the
      solve then makes it conserve liquid with everything else. There the
      swirl field holds the drive as a speed at the rest gap, a/k0, not the
      integrated swirl: the thin solve brings the liquid to whatever it is
      given at k0 and then drags it with its own 12ν/h², so handed the swirl
      itself it counted the gap twice and a pressed palm went round at 0.045
      of the dish's turn where the old plate gives 0.53 (measured in the lab,
      the press of `npm run dish`, which now runs both plates). On the old
      plate it is laid over the flow after both projections, as the current
      is, and it is divergence-free already (stepSwirl projects it).
    */
    const swirlOn = this.swirlWanted(p) && !WebGPUFluid.swirlHeldOff;
    this.swirlCount.steps++;
    if (swirlOn) this.swirlCount.ran++;
    stage('swirl', (pass) => {
      if (swirlOn) { this.stepSwirl(pass, p, thin); return; }
      for (const t of [this.swirl.a, this.swirl.b, this.swirlP.a, this.swirlP.b]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    }, swirlOn || this.swirlLive);
    this.swirlLive = swirlOn;
    const swirlScale = swirlOn ? (p.magnetSeconds ?? 1 / 60) / Math.max(disp, 1e-7) : 0;

    /*
      A thin gap takes the stirring in with the other forces, before the
      solve, so it lasts through the drag time like any push and the flow it
      makes conserves liquid; then one projection with the drag in it, and no
      self-advection or second projection (the header of wgsl/thinGap.ts,
      "What the step no longer does", says why they can go and what it costs).
    */
    if (thin) {
      stage('forces', (pass) => {
        this.run(pass, 'forcesB', this.vel.write, [this.vel.read, this.dye.read], this.arg('forces thin', [1, 0, 0, 0]));
        this.vel.swap();
      });
      /*
        And the lasting current with them. On the old plate the current is a
        speed laid over the flow after both projections, divergence-free in
        u, which in a gap is not liquid conserved: stirred with a current,
        glycerine's |∇·(hu)| came to 0.0093 of its flux where without one it
        was 0.0030 (npm run thingap). Here it goes in as the other forces do,
        a speed the liquid is driven to against the glass, and the solve
        makes it conserve liquid with everything else. The rock, the twist,
        the buoyancy and the lamp's pull still come from the current's own
        solver (PLAN §18a has their move into this field as forces).
      */
      stage('current', (pass) => {
        this.stepCurrent(pass);
        this.run(pass, 'addCurrent', this.vel.write, [this.vel.read, this.cur.read, this.squeeze.read, this.swirl.read], this.arg('current grid thin', [0, this.M, 0, swirlScale]));
        this.vel.swap();
      });
      stage('thin gap', (pass) => {
        this.thinProject(pass, p, disp);
        // What the dye rides is the flow itself: the current is in it now.
        this.run(pass, 'scaleDye', this.velForced, [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
      });
    } else {
      stage('project 1', (pass) => this.project(pass));
      stage('advect velocity', (pass) => this.macCormack(pass, this.vel, this.vel.read, disp, 'vel'));
      stage('project 2', (pass) => this.project(pass));

      // 6.5–8.7 The post-projection forces
      stage('forces', (pass) => {
        this.run(pass, 'forcesB', this.vel.write, [this.vel.read, this.dye.read], none);
        this.vel.swap();
      });
    }

    // 8.9. The lasting current, and the flow the dye rides (a thin gap took
    // its current in before the solve, above).
    stage('current', (pass) => {
      this.stepCurrent(pass);
      // The gap rides along: the plate's depth is a mobility on the flow that
      // carries the dye (F), and this is the field that carries it.
      this.run(pass, 'addCurrent', this.velForced, [this.vel.read, this.cur.read, this.squeeze.read, this.swirl.read],
        this.arg('current grid', [0, this.M, p.depthDrag, swirlScale]));
    }, !thin);

    // 9. Dye: diffuse, then advect through the forced velocity
    const a = p.dt * p.diff * n2;
    stage('dye diffuse', (pass) => {
      this.jacobi(pass, this.dye, [a, a, a, a], DYE_ITERS, 'dye');
      /*
        With Oil Bodies on, only the water's colour diffuses. The oil's
        share is diffused too, but only to know how much of the whole's
        diffusion was the oil's (the diffusion is linear, so the water's
        part of it is the whole's less the oil's); bodyUnspread then keeps
        the water's part and puts the oil's colour back where it was.
        Diffusing only the whole spread the oil's colour into the water as
        the water's own, where nothing could tell it apart again: a green
        haze of amber in teal round every body. Diffusing both alike, as
        this first did, spread it into the water as the oil's, a cell or
        two a second past the edge's tail, where the evening-out has no oil
        to carry it back to: the oil's colour in open water grew from 1.1%
        to 1.8% of it between 90 and 180 steps in \`npm run bodies\` and did
        not stop. The oil's colour does mix inside a body, slowly
        (bodyPartition's inside rate), as two dyed oils do. (A share begun
        this step is empty, and the transport below clears it first.)
      */
      if (bodiesOn && !bodiesFresh) {
        const od = this.oilDye!;
        this.jacobi(pass, od, [a, a, a, a], DYE_ITERS, 'oil dye');
        // The oil's share before the diffusion is the Jacobi's x0, still in scratchB.
        this.run(pass, 'bodyUnspread', this.dye.write, [this.dye.read, od.read, this.scratchB], this.arg('unspread dye', [0, 0, 0, 0]));
        this.run(pass, 'bodyUnspread', od.write, [this.dye.read, od.read, this.scratchB], this.arg('unspread oil', [0, 0, 0, 1]));
        this.dye.swap();
        od.swap();
      }
    }, a > 0);
    stage('advect dye', (pass) => {
      /*
        Under the maze's flow the dye crosses faces, as the ferrofluid does
        (phaseAdvect), and not by the backtrace (PLAN.md §9f, `npm run
        domes`). Reported: where the Magnet parts a pool into domes, the
        gaps between them showed a dark amber film, not the bright dye the
        references have between their domes. The dye had not been pushed
        out (Pushes Dye is off on Magnet Garden); it was lost. mazeForce's
        flow is strongest at the grid's scale, along every edge of the
        ferrofluid, and the backtrace thins a cell where such a flow spreads
        and caps it where it gathers (bodyAdvect has the account, from the
        oil's surface tension, which does the same): measured in the lab,
        16 dye patches on 256², a pool of ferrofluid under the Magnet for
        240 steps, 6% of the plate's dye gone and the dye within 0.08 of the
        magnet down from 834 to 63; with the maze's flow off, all of it
        kept. Across faces nothing is made or lost: 71874 → 71879, and 1510
        within 0.08 (on 384², `npm run domes`: 6% of the plate's dye gone
        before, 0.1% after).

        In the ferrofluid's substeps (PHASE_SUBSTEPS), each a sixth of the
        step: a face carries at most 0.45 of a cell a pass, and the magnet's
        flow reaches more than two cells a step (MAGNET_CELLS), which is why
        the ferrofluid is substepped. Carried in one pass, the dye would
        stop at 0.45 of a cell while the ferrofluid went on, and a cell
        emptied through all four faces could give more than it held, which
        the floor then makes up: conserved only at low speed (the pre-push
        review's reading). Whenever the maze flows, which is every look with
        a Labyrinth and also Classic while the Magnet stands spikes over its
        ferrofluid (mazeReady); the whole plate's dye then moves this way,
        not only the dye near the magnet. Every other look's dye moves as
        it did.

        In a thin gap, when the maze is not flowing, the dye goes through the
        faces too, as it does with Oil Bodies (bodyAdvect). The dye is colour per unit of plate, h·C, and
        the liquid carries C, so what it obeys is ∂(hC)/∂t + ∇·(hC u) = 0:
        an amount moved across faces by u, which is what the fluxes are. The
        backtrace copies a value and thins it by the flow's spread, held to
        e^±0.5 a step so one bad texel cannot flood a cell, and under a press
        the flow leaving a closing gap spreads past that hold: a disc of dye
        under a press laid in one step went from 332 to 656 (npm run thingap).
        Divided by the depth, carried as C and multiplied back, the disc
        gained 13% and a ring round a press laid over ten steps 12%, since a
        backtrace keeps no sum. Across faces both keep every drop (332.0 and
        336.0, before and after), and the ring lands where the displaced
        volume puts it (100% of the shift, against 85% by backtrace).

        Both at once (a thin gap under a Labyrinth) take the maze's substeps:
        the same face fluxes, in sixths, so the faster flow is carried too.
      */
      /*
        And in substeps on a thin gap, as many as the step's flow needs
        (carryPlan, and why): a hand on the glass moves the liquid many cells
        a step, and a carry that cannot keep up leaves the colour behind.
      */
      if (thin) this.planCarry(pass, disp);
      if (!bodiesOn && mazeFlow) {
        const flux = this.arg('dye flux', [0, 0, 0, 0, 0, disp / PHASE_SUBSTEPS, 1, 0]);
        for (let k = 0; k < PHASE_SUBSTEPS; k++) {
          this.runPressed(pass, 'bodyAdvect', this.dye.write, [this.dye.read, this.velForced], flux);
          this.dye.swap();
        }
        return;
      }
      if (!bodiesOn && thin) {
        this.carrySubsteps(pass, 'bodyAdvect', this.dye, this.arg('body advect', [0, 0, 0, 0, 0, disp, 1, 0]));
        return;
      }
      if (!bodiesOn) { this.macCormack(pass, this.dye, this.velForced, disp, 'dye'); return; }
      /*
        With Oil Bodies, the dye and the oil's share of it cross the same
        faces as the oil does (bodyAdvect, and why). A share left from an
        earlier stretch with it off is stale, so it starts empty: whatever
        is inside a body is handed to it within a few steps.
      */
      const od = this.oilDye!;
      if (bodiesFresh) for (const t of [od.a, od.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
      const adv = this.arg('body advect', [0, 0, 0, 0, 0, disp, 1, 0]);
      if (thin) {
        this.carrySubsteps(pass, 'bodyAdvect', this.dye, adv);
        this.carrySubsteps(pass, 'bodyAdvect', od, adv);
        return;
      }
      this.runPressed(pass, 'bodyAdvect', this.dye.write, [this.dye.read, this.velForced], adv);
      this.dye.swap();
      this.runPressed(pass, 'bodyAdvect', od.write, [od.read, this.velForced], adv);
      od.swap();
    });
    /*
      The grid's checkerboard out of the dye (dampGrid, and why), topped up to
      GRID_DAMP a step in every look. Jacobi above removes about 8a/(1+8a)
      of it a step (what a converged solve would; four sweeps take less at
      large a, about 9% at 1024² and a ≈ 10, still above GRID_DAMP): most
      of it in the looks with strong diffusion, none in the eleven with none (Red Cabbage, Classic,
      Fillmore, Oil & Water, Agate, the ferrofluids…), and a few percent in
      the slow ones with a little (Galaxy at 512², 3%). So this takes only
      what the diffusion leaves short, and is not run at all where it leaves
      nothing: the looks the diffusion already clears are as they were.
    */
    const gridDiff = (8 * a) / (1 + 8 * a);
    const gridTop = ((p.gridDamp ?? GRID_DAMP) - gridDiff) / (1 - gridDiff);
    stage('dye grid', (pass) => {
      const k = this.arg('dye grid', [gridTop, 0, 0, 0]);
      this.run(pass, 'dampGrid', this.dye.write, [this.dye.read], k);
      this.dye.swap();
      // The oil's share has the same grid in it, from the same faces.
      if (bodiesOn) {
        this.run(pass, 'dampGrid', this.oilDye!.write, [this.oilDye!.read], k);
        this.oilDye!.swap();
      }
    }, gridTop > 0.002);
    /*
      Marangoni flow (see marangoniFlux): the dye, and the mix itself, carried
      away from soap along the surface, conservatively. The mix goes second,
      reading the same soap the dye was moved by.
    */
    stage('marangoni', (pass) => {
      const pull = soap * SOAP_PULL * (p.magnetSeconds ?? 1 / 60) * N;
      const k = this.arg('marangoni', [pull, 0, 0, 0]);
      const kMix = this.arg('marangoni mix', [pull, 1, 0, 0]);
      for (let s2 = 0; s2 < 2; s2++) {
        this.run(pass, 'marangoniFlux', this.dye.write, [this.dye.read, mix!.read], k);
        this.dye.swap();
        this.run(pass, 'marangoniFlux', mix!.write, [mix!.read, mix!.read], kMix);
        mix!.swap();
      }
    }, !!mix && this.mixLive && soap > 0.001);

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

      The flow carries it, in flux form so none is made or lost, and its own
      pressure keeps it from packing past full. The magnet acts on the flow,
      earlier in the step.

      Skipped entirely on a plate with no phase on it, which is most looks.
    */
    stage('phase', (pass) => {
      // With a magnet on, the flow near it can carry the ferrofluid further
      // than one flux step may (0.45 of a cell): so in substeps.
      // And under Thin Gap, where a press moves the liquid as fast as the
      // glass comes down (a cell a step and more round a palm, lab).
      const subs = this.phaseLive && (p.magnetStrength > 0.0001 || maze > 0.001 || thin) ? PHASE_SUBSTEPS : 1;
      // A.b.z: the Rhie–Chow correction on (see phaseAdvect), which needs the
      // projection's pressure to still be the one velForced was made with.
      /*
        A.a: under Thin Gap the ferrofluid is carried as a volume, the gap
        going from what the phase last moved in to the gap now across the
        substeps (phaseAdvect), so each substep has its own arguments.
      */
      const volume = thin && this.phaseGapPrimed && p.phaseVolume !== 0 ? 1 : 0;
      const adv = (k: number) => this.arg(`phase advect ${k}`, [volume, k / subs, (k + 1) / subs, REST_GAP, 0, disp / subs, 1, 0]);
      /*
        And the grid-scale filter alone after each substep (phaseSeparate
        with no sharpening or tension). The Rhie–Chow correction removes
        most of what a collocated projection leaves at the finest scale;
        this takes what remains, which a maze's sharp forces otherwise drew
        as lines every other cell through the black.
      */
      const grid = this.arg('phase grid', [0, 0, 0, 0]);
      for (let k = 0; k < subs; k++) {
        this.runPhaseAdvect(pass, adv(k));
        this.phase.swap();
        // Carried as a volume, the filter moves volume too (phaseGrid, and why).
        if (volume) this.runPhaseGrid(pass, this.arg(`phase grid ${k}`, [(k + 1) / subs, 0, 0, 0]));
        else this.run(pass, 'phaseSeparate', this.phase.write, [this.phase.read], grid);
        this.phase.swap();
      }
      this.runPhaseGapSeen(pass);
      for (let k = 0; k < PHASE_RELAX; k++) {
        this.run(pass, 'phaseRelax', this.phase.write, [this.phase.read], none);
        this.phase.swap();
      }
      /*
        Cahn–Hilliard keeps the two liquids apart, maze or not: it conserves
        and it rounds. The pairwise sharpening that stood in for it without
        a maze (phaseSeparate) exchanged only along the axes, and a plate of
        drops set into blocky squares with holes punched in them. Under a
        maze field (the look's, stronger under the hand's magnet) the
        dipoles' repulsion (phaseMu's ψ term) is added.
      */
      if (!this.psi) this.psi = new PingPong(this.device, this.disposer, [this.N, this.N], R32, 'psi');
      if (!this.phaseMuT) {
        this.phaseMuT = this.disposer.track(this.device.createTexture({
          label: 'phase mu', size: [this.N, this.N], format: RG32,
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        }));
      }
      const psi = this.psi, mu = this.phaseMuT;
      if (field > 0.001) {
        const screen = this.arg('screen', [mazeK.m2, 0, 0, 0]);
        for (let k = 0; k < 16; k++) {
          this.run(pass, 'screenJacobi', psi.write, [psi.read, this.phase.read], screen);
          psi.swap();
        }
      }
      // Phase Edge is how fast it separates: its mobility, M dt, from 0.006
      // to 0.018 (under the explicit limit, about 0.028).
      const args = this.arg('phase ch', [p.magnetX, p.magnetY, p.magnetHeight, p.magnetStrength,
        0.006 + 0.012 * Math.max(0, Math.min(1, p.phaseSharp ?? 0.35)), field > 0.001 ? mazeK.alpha * (0.5 + 0.5 * field) : 0, MAZE_UNIFORM * maze / Math.max(field, 1e-6), p.time ?? 0]);
      for (let k = 0; k < CH_SUBSTEPS; k++) {
        this.run(pass, 'phaseMu', mu, [this.phase.read, psi.read], args);
        // Carried as a volume, Cahn–Hilliard moves volume too (phaseCHVolume, and why).
        if (volume) this.run(pass, 'phaseCHVolume', this.phase.write, [this.phase.read, mu, this.squeeze.read], args);
        else this.run(pass, 'phaseCH', this.phase.write, [this.phase.read, mu], args);
        this.phase.swap();
      }
      /*
        Under spikes, the pressure again after the separation. The spikes'
        wells draw the liquid into each dome by the Cahn–Hilliard flux, and
        μ reads the phase clamped to full, so nothing in it pushes back once
        a dome is past full. Measured (npm run spikes, the fullest cell):
        1.17 with no passes here, 1.04 with six, 1.008 with sixteen. Run
        between the substeps instead, the same passes spread each dome back
        into its valleys before it had parted, so they run after.
      */
      if (spikes) {
        for (let j = 0; j < SPIKE_RELAX; j++) {
          this.run(pass, 'phaseRelax', this.phase.write, [this.phase.read], none);
          this.phase.swap();
        }
      }
      if (maze > 0.001 || spikes) {
        // Once more on where the phase ended, for the next step's force.
        this.run(pass, 'phaseMu', mu, [this.phase.read, psi.read], args);
        this.mazeReady = true;
      }
    }, this.phaseLive);

    /*
      The dye gets out of the ferrofluid's way (Ferro Pushes Dye).

      After the phase has moved for this step, so the dye is pushed from
      where the ferrofluid now is. The why, and the two exchanges, are at
      phaseDisplace in wgsl/fluid.ts. Twice a step: a finger's tip advances
      under a cell a step, and one exchange moves at most 4·DISPLACE_PUSH of
      a cell's dye, so a single pass let the tip overrun its own colour.
      Off (and not run) at 0, which is every look but the ones that ask.
    */
    const displace = Math.max(0, Math.min(1, p.phaseDisplace ?? 0));
    stage('phase displace', (pass) => {
      const args = this.arg('phase displace', [DISPLACE_PUSH * displace, DISPLACE_INSIDE * displace, 0, 0]);
      for (let k = 0; k < DISPLACE_ITERS; k++) {
        this.run(pass, 'phaseDisplace', this.dye.write, [this.dye.read, this.phase.read], args);
        this.dye.swap();
      }
    }, this.phaseLive && displace > 0.001);

    /*
      The mix: oil and water, soap, acidity (docs/physics-plan.md).

      Carried by the flow in flux form, then its own evolution: the oil
      separates from the water (Cahn–Hilliard), the soap spreads and breaks
      down, acid and base diffuse and cancel. And then what it does to the
      flow, for the next step's projection to shape: surface tension round
      the oil, Marangoni flow away from the soap, buoyancy from the dye's
      weight and the heat. The buoyancy needs no mix, but it shares the pass,
      so a plate asking for it gets an empty mix to read.
    */
    stage('mix', (pass) => {
      const m = mix!;
      if (this.mixLive) {
        // The oil with its colour: in the dye's substeps on a thin gap (carryPlan).
        if (thin) this.carrySubsteps(pass, 'mixAdvect', m, this.arg('mix advect', [0, 0, 0, 0, 0, disp, 1, 0]));
        else {
          this.runPressed(pass, 'mixAdvect', m.write, [m.read, this.velForced], this.arg('mix advect', [0, 0, 0, 0, 0, disp, 1, 0]));
          m.swap();
        }
        for (let k = 0; k < PHASE_RELAX; k++) {
          this.run(pass, 'mixRelax', m.write, [m.read], none);
          m.swap();
        }
        /*
          M dt under the explicit limit (1/64 for this stencil), in several
          substeps: the flow smears the oil's edge every step and the
          separation has to win it back as fast. Surfactant diffuses and
          lasts about ten seconds; acidity diffuses slowly. Only the first
          substep diffuses those two, so their rates do not depend on how
          many the oil takes.
        */
        const subs = oil > 0 ? CH_SUBSTEPS : 1;
        for (let k = 0; k < subs; k++) {
          this.run(pass, 'mixMu', m.write, [m.read], none);
          m.swap();
          this.run(pass, 'mixUpdate', m.write, [m.read], k === 0
            ? this.arg('mix update', [0.012 * (oil > 0 ? 1 : 0), 0.08, Math.pow(0.1, (p.magnetSeconds ?? 1 / 60) / 10), 0.04])
            : this.arg('mix update oil', [0.012, 0, 1, 0]));
          m.swap();
        }
      }
    }, !!mix && this.mixLive);

    /*
      Oil Bodies: each liquid keeps its own colour (bodyPartition, and why).

      After the mix, so the colour is kept to where the oil is at the end of
      this step, carried and rounded. Two passes, each writing the whole dye
      and then the oil's share from the same inputs before either is
      swapped: an edge moves a fraction of a cell a step and the evening-out
      moves up to a fifth of a cell's colour to each side a pass, which in
      one pass left the water's colour a step behind a fast edge.
    */
    stage('bodies', (pass) => {
      const od = this.oilDye!;
      const reach = this.ensureReach();
      // The oil blurred wide (four 5×5 binomials: a reach of eight cells),
      // for colour astray from its liquid to find the way back.
      this.run(pass, 'mixSmooth', reach.write, [mix!.read], none);
      reach.swap();
      for (let k = 1; k < BODY_REACH_BLURS; k++) {
        this.run(pass, 'mixSmooth', reach.write, [reach.read], none);
        reach.swap();
      }
      const tint = this.arg('bodies dye', [BODY_EVEN * bodies, BODY_HAND * bodies, BODY_INSIDE * bodies, 0, BODY_DRIFT * bodies]);
      const share = this.arg('bodies oil', [BODY_EVEN * bodies, BODY_HAND * bodies, BODY_INSIDE * bodies, 1, BODY_DRIFT * bodies]);
      for (let k = 0; k < BODY_PASSES; k++) {
        this.run(pass, 'bodyPartition', this.dye.write, [this.dye.read, od.read, mix!.read, reach.read], tint);
        this.run(pass, 'bodyPartition', od.write, [this.dye.read, od.read, mix!.read, reach.read], share);
        this.dye.swap();
        od.swap();
      }
    }, bodiesOn);

    /*
      The reactions: BZ's spirals and Liesegang's rings, each in a gel on a
      grid of its own (see gridSplat). Several small steps a frame: the
      Oregonator is stiff, and its step has to stay near a hundredth of its
      own time. A gel does not flow, which is the point of one: the bands
      are laid where the front was, and stay.
    */
    const bz = Math.max(0, Math.min(1, p.bzReaction ?? 0));
    const lies = Math.max(0, Math.min(1, p.liesegang ?? 0));
    const rxn = this.rxn;
    stage('bz', (pass) => {
      const r = rxn!;
      const args = this.arg('bz step', [0.01, 0, BZ_GRID, 1.0]);
      const steps = Math.max(1, Math.round(12 * bz));
      for (let k = 0; k < steps; k++) {
        this.run(pass, 'rxnStep', r.write, [r.read], args, BZ_GRID);
        r.swap();
      }
    }, !!rxn && this.rxnLive && bz > 0.001);
    const gel = this.lies;
    stage('liesegang', (pass) => {
      const l = gel!;
      const args = this.arg('lies step', [0.01, 0, LIES_GRID, 0]);
      const steps = Math.max(1, Math.round(24 * lies));
      for (let k = 0; k < steps; k++) {
        this.run(pass, 'liesStep', l.write, [l.read], args, LIES_GRID);
        l.swap();
      }
    }, !!gel && this.liesLive && lies > 0.001);

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

    // What the plate draws from all of it, once the step has settled it.
    stage('view', (pass) => this.packView(pass));

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

  private ensureMix(): PingPong {
    if (!this.mix) {
      this.mix = new PingPong(this.device, this.disposer, [this.N, this.N], 'rgba32float', 'mix');
      const enc = this.device.createCommandEncoder({ label: 'mix clear' });
      const pass = enc.beginComputePass();
      for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }
    return this.mix;
  }

  private ensureRxn(): PingPong {
    if (!this.rxn) {
      this.rxn = new PingPong(this.device, this.disposer, [BZ_GRID, BZ_GRID], 'rgba32float', 'rxn');
      const enc = this.device.createCommandEncoder({ label: 'rxn clear' });
      const pass = enc.beginComputePass();
      for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }
    return this.rxn;
  }

  /** An empty 1×1 phase, for a kernel that reads the ferrofluid when none is on the plate. */
  private blankPhase(): GPUTexture {
    if (!this.blankPhaseTex) {
      this.blankPhaseTex = this.disposer.track(this.device.createTexture({ label: 'blank phase', size: [1, 1], format: R32, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING }));
    }
    return this.blankPhaseTex;
  }

  private packView(pass: GPUComputePassEncoder): void {
    if (!this.viewTex) {
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
      this.viewTex = this.disposer.track(this.device.createTexture({ label: 'view', size: [this.N, this.N], format: 'rgba32uint', usage }));
    }
    this.blank('r');
    const has = [this.phaseLive, this.mixLive && !!this.mix, this.rxnLive && !!this.rxn, this.liesLive && !!this.lies];
    this.run(pass, 'packView', this.viewTex, [
      has[0] ? this.phase.read : this.blankR!,
      has[1] ? this.mix!.read : this.blankRGBA!,
      has[2] ? this.rxn!.read : this.blankRGBA!,
      has[3] ? this.lies!.read : this.blankRGBA!,
      this.squeeze.read,
    ], this.arg('view', [...has.map((h) => (h ? 1 : 0)), BZ_GRID, LIES_GRID, 0, 0]));
  }

  private ensureLies(): PingPong {
    if (!this.lies) {
      this.lies = new PingPong(this.device, this.disposer, [LIES_GRID, LIES_GRID], 'rgba32float', 'liesegang');
      this.fillLies();
    }
    return this.lies;
  }

  /** The gel as it starts: B spread evenly, nothing else. */
  private fillLies(): void {
    const enc = this.device.createCommandEncoder({ label: 'liesegang fill' });
    const pass = enc.beginComputePass();
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    for (const t of [this.lies!.a, this.lies!.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    pass.end();
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
    this.liesLive = true;
  }

  private scratch(): GPUTexture {
    if (!this.scratchR) {
      this.scratchR = this.disposer.track(this.device.createTexture({
        label: 'scratch r', size: [this.N, this.N], format: R32,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    return this.scratchR;
  }

  /**
   * Pour into the mix: oil, surfactant and acidity (+ acid, − base), each an
   * amount in `what`, as a soft disc at (x, y) in plate units.
   */
  addMix(x: number, y: number, radius: number, what: { oil?: number; soap?: number; acid?: number }): void {
    const m = this.ensureMix();
    const enc = this.device.createCommandEncoder({ label: 'add mix' });
    const pass = enc.beginComputePass({ label: 'add mix' });
    this.simF[0] = this.N; this.simF[1] = this.L;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
    this.run(pass, 'mixSplat', m.write, [m.read],
      this.arg('mix splat', [x, y, radius, 1, what.oil ?? 0, what.soap ?? 0, what.acid ?? 0, 0]));
    // Flat to its edge (mixSplat), so a disc's worth; the clamp at full is not counted.
    this.oilPoured += Math.max(0, Math.min(1, what.oil ?? 0)) * Math.PI * radius * radius;
    m.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
    this.rxnLive = true;
  }

  private ensureReach(): PingPong {
    if (!this.oilReach) this.oilReach = new PingPong(this.device, this.disposer, [this.N, this.N], R32, 'oil reach');
    return this.oilReach;
  }

  private ensureOilDye(): PingPong {
    if (!this.oilDye) this.oilDye = new PingPong(this.device, this.disposer, [this.N, this.N], this.dyeFormat, 'oil dye');
    return this.oilDye;
  }

  /** Take the mix and the reactions off the plate. */
  clearChemistry(): void {
    const enc = this.device.createCommandEncoder({ label: 'clear chemistry' });
    const pass = enc.beginComputePass();
    if (this.mix) for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    // With the oil gone its colour is the water's: the share is emptied, the dye kept.
    if (this.oilDye) for (const t of [this.oilDye.a, this.oilDye.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    this.oilPoured = 0;
    if (this.rxn) for (const t of [this.rxn.a, this.rxn.b]) this.fill(pass, t, [0, 0, 0, 0], BZ_GRID);
    if (this.lies) for (const t of [this.lies.a, this.lies.b]) this.fill(pass, t, [0, LIES_B0, 0, 0], LIES_GRID);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.mixLive = false;
    this.rxnLive = false;
    this.liesLive = false;
  }

  /** The mix or the reactions, read back whole (RGBA per texel). For checks. */
  async readChemistry(which: 'mix' | 'rxn' | 'lies'): Promise<{ n: number; data: Float32Array } | null> {
    const pp = which === 'mix' ? this.mix : which === 'rxn' ? this.rxn : this.lies;
    if (!pp) return null;
    const n = pp.size[0];
    const row = Math.ceil((n * 16) / 256) * 256;
    const buf = this.device.createBuffer({ label: `read ${which}`, size: row * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: `read ${which}` });
    enc.copyTextureToBuffer({ texture: pp.read }, { buffer: buf, bytesPerRow: row }, [n, n]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(buf.getMappedRange().slice(0));
    const out = new Float32Array(n * n * 4);
    const stride = row / 4;
    for (let y = 0; y < n; y++) out.set(all.subarray(y * stride, y * stride + n * 4), y * n * 4);
    buf.unmap();
    buf.destroy();
    return { n, data: out };
  }

  setBubbles(packed: Float32Array, count: number, soft = 0.25, finger?: Float32Array): void {
    if (!this.air) this.air = new WebGPUAir(this.device, this.N, AIR_CAPACITY);
    this.air.setBubbles(packed, count, soft, finger);
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
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
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
    this.device.queue.submit([enc.finish()]);
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
      disp: stepDisplacement(p.dt, p.advection, this.N),
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

  /**
   * Zero one of the packed pressure buffers, as the Jacobi's `fill` did, with
   * the multigrid's own zeroing (`mgZero` in `wgsl/fluid.ts` on why not a
   * kernel of its own).
   */
  private clearBuffer(pass: GPUComputePassEncoder, buf: GPUBuffer, key: string): void {
    const pipe = this.pipelines.computePipeline('mgZero', kernel('mgZero', 'r32float'));
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

  /** Red-black sweeps on level 0, the packed buffer. */
  private smooth0(pass: GPUComputePassEncoder, sweeps: number): void {
    const pipe = this.pipelines.computePipeline('pressureRedBlack', kernel('pressureRedBlack', 'r32float'));
    const half = Math.ceil((this.N * (this.N / 2)) / 64);
    for (let k = 0; k < sweeps; k++) {
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
  }

  /** A one-dimensional dispatch over buffers, its bind group cached under `key`. */
  private dispatchBuf(pass: GPUComputePassEncoder, name: string, key: string, args: GPUBuffer, resources: (GPUBuffer | GPUTexture)[], count: number): void {
    const pipe = this.pipelines.computePipeline(name, kernel(name, 'r32float'));
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
  }

  /** As dispatchBuf, over the grid in 8 × 8 tiles, with no args of its own. */
  private dispatchBuf2(pass: GPUComputePassEncoder, name: string, key: string, resources: (GPUBuffer | GPUTexture)[]): void {
    const pipe = this.pipelines.computePipeline(name, kernel(name, 'r32float'));
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, this.arg('none', [0, 0, 0, 0]), ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    const w = Math.ceil(this.N / 8);
    pass.dispatchWorkgroups(w, w);
  }

  /**
   * One multigrid V-cycle from level `l` down (see `mgRestrict0` in
   * `wgsl/fluid.ts` for why). Smooth, hand the residual to the level below,
   * solve there, bring the correction back, smooth again; the coarsest level
   * is small enough for sweeps alone to finish it.
   */
  private vcycle(pass: GPUComputePassEncoder, l: number): void {
    const smooth = (level: number, sweeps: number) => {
      if (level === 0) { this.smooth0(pass, sweeps); return; }
      const lv = this.mg[level - 1];
      for (let k = 0; k < sweeps; k++) {
        for (const parity of [0, 1]) {
          this.dispatchBuf(pass, 'mgSmooth', `mgSmooth:${level}:${parity}`, this.arg(`mg smooth ${level} ${parity}`, [lv.n, parity, 0, 0]),
            [lv.b, lv.p], lv.n * Math.ceil(lv.n / 2));
        }
      }
    };
    if (l === this.mg.length) { smooth(l, MG_COARSE_SWEEPS); return; }
    smooth(l, MG_SWEEPS);
    const below = this.mg[l];
    if (l === 0) {
      this.dispatchBuf(pass, 'mgRestrict0', 'mgRestrict0', this.arg('none', [0, 0, 0, 0]), [this.div, this.press, below.b], below.n * below.n);
    } else {
      const here = this.mg[l - 1];
      this.dispatchBuf(pass, 'mgRestrict', `mgRestrict:${l}`, this.arg(`mg level ${l}`, [here.n, 0, 0, 0]), [here.p, here.b, below.b], below.n * below.n);
    }
    this.dispatchBuf(pass, 'mgZero', `mgZero:${l + 1}`, this.arg(`mg zero ${l + 1}`, [below.n * below.n, 0, 0, 0]), [below.p], below.n * below.n);
    this.vcycle(pass, l + 1);
    if (l === 0) {
      // Into level 0's packed buffer (A.a.y = 1): `mgProlong` in wgsl/fluid.ts.
      this.dispatchBuf(pass, 'mgProlong', 'mgProlong0', this.arg('mg prolong 0', [this.N, 1, 0, 0]), [below.p, this.press], this.N * this.N);
    } else {
      const here = this.mg[l - 1];
      this.dispatchBuf(pass, 'mgProlong', `mgProlong:${l}`, this.arg(`mg level ${l}`, [here.n, 0, 0, 0]), [below.p, here.p], here.n * here.n);
    }
    smooth(l, MG_SWEEPS);
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
    // kernel subtracts so that term averages to zero.
    const invDt = 1 / Math.max(this.lastDt, 1e-4);
    this.run(pass, 'divergence', this.divRaw, [this.vel.read, this.air!.field, this.air!.prev, this.squeeze.read],
      this.arg('air source', [this.airPush, invDt, this.airCover, 0,
        (this.airCover - this.airCoverPrev) * invDt,
        // The press: how much of it reaches the flow. Its mean is no longer
        // guessed here (see divTiles).
        0, this.squeezeGain, 0]));
    /*
      Then the whole right-hand side made to sum to zero, exactly: its plate
      mean found on the GPU and taken off every cell (divTiles in
      wgsl/fluid.ts says why that is the closed plate's physics and not a
      patch). Three small dispatches, against the dozens the solve runs.
    */
    this.dispatchBuf(pass, 'divTiles', 'divTiles', this.arg('none', [0, 0, 0, 0]), [this.divRaw, this.divPartials], DIV_GROUPS * 64);
    this.dispatchBuf(pass, 'divFold', 'divFold', this.arg('div fold', [DIV_GROUPS, 0, 0, 0]), [this.divPartials, this.divMean], 64);
    this.dispatchBuf2(pass, 'divCentre', 'divCentre', [this.divRaw, this.divMean, this.div]);
    this.clearBuffer(pass, this.press, 'clear pressure');

    if (this.pressureSolver === 'multigrid' && this.mg.length > 0) {
      for (let c = 0; c < MG_CYCLES; c++) this.vcycle(pass, 0);
    } else {
      this.smooth0(pass, PRESSURE_SWEEPS);
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

  /**
   * Whether the spun dish's swirl runs this step (see SWIRL_DISH_MIN): while
   * the dish and its liquid move against each other or the liquid is a
   * centrifuge, and for five of the slowest drag times after.
   */
  private swirlWanted(p: GpuStepParams): boolean {
    const dish = Math.abs(p.spinDish ?? 0), spin = Math.abs(p.spinLiquid ?? 0);
    if (!Number.isFinite(dish) || !Number.isFinite(spin)) return false;
    const nu = Math.max(1e-7, p.spinNu ?? 1e-6);
    if (dish > SWIRL_DISH_MIN || spin > SWIRL_SPIN_MIN) {
      this.swirlTail = 5 * dragSeconds(nu, DISH_GAP_RANGE[1]);
      return true;
    }
    this.swirlTail -= Math.max(0, p.magnetSeconds ?? 1 / 60);
    return this.swirlTail > 0;
  }

  /** The swirl: the dish's drag and the centrifuge, then the current's projection on its own textures. */
  private stepSwirl(pass: GPUComputePassEncoder, p: GpuStepParams, thin: boolean): void {
    const spin = p.spinLiquid ?? 0;
    const tau = Math.max(1e-4, p.spinTau ?? 1);
    const mixOn = this.mixLive && !!this.mix;
    this.run(pass, 'spinSwirl', this.swirl.write, [
      this.swirl.read, this.dye.read, this.squeeze.read,
      mixOn ? this.mix!.read : this.blank('rgba'),
      this.phaseLive ? this.phase.read : this.blank('r'),
    ], this.arg('swirl', [p.spinDish ?? 0, 1 / tau, spin * spin, thin ? -1 : Math.max(0, p.magnetSeconds ?? 1 / 60),
      Math.max(1e-7, p.spinNu ?? 1e-6), OIL_NU, Math.max(0, p.spinDyeWeight ?? 0), SPIN_OIL_LIGHT]), this.M);
    this.swirl.swap();
    /*
      A thin gap stops here, at one dispatch where it was thirteen (PLAN 22k).

      There the swirl field is the dish's drive, a speed at the rest gap
      (spinSwirl's thin branch, which keeps no state), and it goes into the
      flow before the thin solve, which makes the whole flow conserve liquid
      with the gap in it: ∇·(h u) = 0, by its own multigrid. Projecting the
      drive first, by ten Jacobi sweeps of ∇·u = 0 on the current's grid, did
      a weaker version of the same job with the wrong operator. Where the gap
      is even the solve takes away exactly what it took away; where a press
      or a dome makes it uneven what it took away is a gradient of u, not of
      hu, and handing the solve the drive as it is lets the right projection
      decide. Since #252 the nine thin music looks run the swirl on most of
      their steps while the band plays; this is the part of it that did
      nothing the solve after it does not do. The old plate has no solve
      after it that sees the swirl (it is laid over the projected flow), so
      it keeps its own projection.
    */
    if (thin) return;
    const m = this.arg('current grid', [0, this.M, 0, 0]);
    this.run(pass, 'curDivergence', this.swirlDiv, [this.swirl.read], m, this.M);
    for (let k = 0; k < CURRENT_ITERS; k++) {
      this.run(pass, 'curPressure', this.swirlP.write, [this.swirlP.read, this.swirlDiv], m, this.M);
      this.swirlP.swap();
    }
    this.run(pass, 'curGradient', this.swirl.write, [this.swirl.read, this.swirlP.read], m, this.M);
    this.swirl.swap();
  }

  /** A 1×1 texture of zeros, for a pass whose optional field a plate does not have. */
  private blank(kind: 'r' | 'rgba'): GPUTexture {
    if (!this.blankR || !this.blankRGBA) {
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
      this.blankR = this.disposer.track(this.device.createTexture({ label: 'blank r', size: [1, 1], format: R32, usage }));
      this.blankRGBA = this.disposer.track(this.device.createTexture({ label: 'blank rgba', size: [1, 1], format: 'rgba32float', usage }));
    }
    return kind === 'r' ? this.blankR : this.blankRGBA;
  }

  /**
   * Whether this step runs the plate as a Hele-Shaw cell (PLAN §18a). It
   * needs the multigrid's levels, which every grid the ladder builds has.
   */
  private thinGapOn(p: GpuStepParams): boolean {
    const want = (p.thinGap ?? 0) > 0.5 && this.mg.length > 0;
    if (want && !this.hsReady) {
      /*
        Built ahead at the opening (prepare), which is every look's now: the
        first step is a thin one. Asking prepareThinGap here would find them
        built but say so only after an await, and the first steps would run
        the old way meanwhile, asking for the old plate's pipelines. Under
        `?prepare=0` they are built on this frame, as everything there is.
      */
      if (!WebGPUFluid.buildAhead || this.thinBuilt()) { this.hsReady = true; return true; }
      void this.prepareThinGap();
      return false;
    }
    if (!want && !this.oldReady) {
      /*
        Turned off in a show that opened thin: the old plate's pipelines were
        not built (prepare), so the plate stays thin while they build, as it
        stays old while the thin gap's build in the other direction. Built
        already when the look opened with it off; built on this frame under
        `?prepare=0`, and when the plate cannot run thin either (a new
        device's first steps before its thin gap is built: the stop the
        opening's list exists to prevent, which the re-laid opening's own
        list should have spared it).
      */
      if (!WebGPUFluid.buildAhead || this.oldBuilt()) { this.oldReady = true; return false; }
      void this.prepareOldPlate();
      if (this.hsReady && this.mg.length > 0) return true;
      this.oldReady = true;
    }
    return want;
  }

  /**
   * The thin gap's pipelines, built off the frame one at a time, the first
   * time it is asked for in a show that opened with it off; the plate runs
   * the old way until they are in. A look that opens on a thin gap, which is
   * every look since the owner picked every look (2026-10-03), has them
   * built before its first step instead (`prepare`, and thinGapOn).
   *
   * Not behind the show for one that opened with it off. Behind the show a
   * compile costs the frames it takes (gpu/prepare.ts): the page draws
   * between compiles, not during them, so every pipeline there is paid for
   * by every show's first seconds, and on a slow runner the WebGPU smoke's
   * "the stage starts" (thirty frames in thirty seconds) went red with these
   * twelve of them added (run 36367898896: 31 frames drawn by 37 s after load, where
   * another PR's green run that hour had drawn 852; that runner was slow
   * all round, so how much was these twelve is not known). A show that
   * opened with Thin Gap off and never turns it on should not pay for it;
   * one that turns it on runs the old way for as long as its compiles take
   * (fifteen with the carries' substeps and their plan: about three and a
   * half seconds at prepare.ts's 0.23 s each on CI's Mac), rather than
   * stopping on the frame to build them.
   */
  prepareThinGap(): Promise<void> {
    if (!this.hsBuilding) {
      this.hsBuilding = (async () => {
        // The kernels; the snapshot before the forces and the copy the dye
        // rides, both into the velocity's format; the dye's carry in substeps.
        for (const [key, code] of WebGPUFluid.thinBuilds(this.dyeFormat)) await this.pipelines.prepareCompute(key, code);
        // And the oil's (carryPlan), which only a look with the mix asks for.
        await this.pipelines.prepareCompute('mixAdvectSub:rgba32float', kernel('mixAdvectSub', 'rgba32float'));
        this.hsReady = true;
      })();
    }
    return this.hsBuilding;
  }

  /** The old plate's pipelines, built off the frame when Thin Gap is first turned off in a show that opened thin (thinGapOn). */
  prepareOldPlate(): Promise<void> {
    if (!this.oldBuilding) {
      this.oldBuilding = (async () => {
        for (const [key, code] of WebGPUFluid.oldPlateBuilds(this.dyeFormat)) await this.pipelines.prepareCompute(key, code);
        await this.pipelines.prepareCompute('mixAdvect:rgba32float', kernel('mixAdvect', 'rgba32float'));
        this.oldReady = true;
      })();
    }
    return this.oldBuilding;
  }

  private oldBuilt(): boolean {
    return WebGPUFluid.oldPlateBuilds(this.dyeFormat).every(([key, code]) => this.pipelines.hasCompute(key, code));
  }

  /** Whether every pipeline a thin step needs is already built (at the opening, by prepare). */
  private thinBuilt(): boolean {
    return WebGPUFluid.thinBuilds(this.dyeFormat).every(([key, code]) => this.pipelines.hasCompute(key, code));
  }

  /** The thin-gap solver's storage, made once; returns the velocity snapshot. */
  private ensureThinGap(): GPUTexture {
    if (!this.hsPrev) {
      this.hsPrev = this.disposer.track(this.device.createTexture({
        label: 'thin gap before forces', size: [this.N, this.N], format: VEL,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
      const buf = (label: string, n: number) => this.disposer.track(this.device.createBuffer({ label, size: Math.max(16, n * n * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
      this.hsMid = this.disposer.track(this.device.createTexture({
        label: 'thin gap after body forces', size: [this.N, this.N], format: VEL,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.hsMob = buf('thin gap mobility', this.N);
      // The thin solve's own P, packed as the old solver's pressure is. hsGradient
      // hands the advections c·P in that one (wgsl/thinGap.ts, hsGradient).
      this.hsP = buf('thin gap pressure', this.N);
      this.hsGap = buf('thin gap before', this.N);
      this.hsMobC = this.mg.map((lv) => buf(`thin gap rim ${lv.n}`, lv.n));
      // Each coarse level's faces: every cell's east face, then every cell's north.
      this.hsFaceC = this.mg.map((lv) => this.disposer.track(this.device.createBuffer({ label: `thin gap faces ${lv.n}`, size: Math.max(16, 2 * lv.n * lv.n * 4), usage: GPUBufferUsage.STORAGE })));
      this.carryMost = this.disposer.track(this.device.createBuffer({ label: 'carry courant', size: 16, usage: GPUBufferUsage.STORAGE }));
      this.carryInd = this.disposer.track(this.device.createBuffer({ label: 'carry pairs', size: 12 * CARRY_PAIRS, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT }));
      this.carrySub = this.disposer.track(this.device.createBuffer({ label: 'carry substeps', size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }));
    }
    return this.hsPrev;
  }

  /**
   * How many substeps this step's carries take on a thin gap, decided on the
   * GPU (carryCourant, carryPlan in wgsl/fluid.ts): after the velocity the
   * carries ride is final, before the first of them.
   */
  private planCarry(pass: GPUComputePassEncoder, disp: number): void {
    this.ensureThinGap();
    this.hsRun(pass, 'carryCourant', `carryCourant:${this.velForced.label}`, this.arg('carry courant', [0, 0, 0, 0, 0, disp, 1, 0]),
      [this.velForced, this.press, this.carryMost!]);
    this.hsRun(pass, 'carryPlan', 'carryPlan', this.arg('carry plan', [CARRY_COURANT, CARRY_SUBSTEPS, Math.ceil(this.N / 8), CARRY_PAIRS]),
      [this.carryMost!, this.carryInd!, this.carrySub!], 1);
  }

  /**
   * One carry (`bodyAdvect` or `mixAdvect`) of `field` along the step's
   * velocity, in the substeps planCarry chose: the first as always, the rest
   * in pairs that go to the write field and back, each pair dispatched
   * indirectly so one this step does not need runs no workgroups. The field
   * ends swapped once, as a single carry leaves it.
   */
  private carrySubsteps(pass: GPUComputePassEncoder, name: 'bodyAdvect' | 'mixAdvect', field: PingPong, args: GPUBuffer): void {
    const kernelName = `${name}Sub`;
    const pipe = this.pipeline(kernelName, field.format);
    const group = (src: GPUTexture, dst: GPUTexture) => {
      const key = `${kernelName}:${src.label}:${dst.label}:${args.label}`;
      let g = this.groups.get(key);
      if (!g) {
        g = bindGroup(this.device, pipe, [this.sim, args, src, this.velForced, dst, this.press, this.carrySub!]);
        this.groups.set(key, g);
      }
      return g;
    };
    const w = Math.ceil(this.N / 8);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group(field.read, field.write));
    pass.dispatchWorkgroups(w, w);
    field.swap();
    const there = group(field.read, field.write), back = group(field.write, field.read);
    for (let k = 0; k < CARRY_PAIRS; k++) {
      pass.setBindGroup(0, there);
      pass.dispatchWorkgroupsIndirect(this.carryInd!, 12 * k);
      pass.setBindGroup(0, back);
      pass.dispatchWorkgroupsIndirect(this.carryInd!, 12 * k);
    }
  }

  /**
   * How many substeps the last thin step's carries took, and the Courant
   * number that asked for them: for a check. Null off a thin gap.
   */
  async readCarry(): Promise<{ n: number; courant: number } | null> {
    if (!this.carrySub) return null;
    const buf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder({ label: 'read carry' });
    enc.copyBufferToBuffer(this.carrySub, 0, buf, 0, 16);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    return { n: f[1], courant: f[2] };
  }

  /** A dispatch over textures and buffers in binding order, its group cached under `key`: 2D over the grid, or 1D over `count`. */
  private hsRun(pass: GPUComputePassEncoder, name: string, key: string, args: GPUBuffer, resources: (GPUBuffer | GPUTexture)[], count?: number): void {
    const pipe = this.pipelines.computePipeline(`${name}:thin`, kernel(name, 'rgba16float'));
    let group = this.groups.get(key);
    if (!group) {
      group = bindGroup(this.device, pipe, [this.sim, args, ...resources]);
      this.groups.set(key, group);
    }
    pass.setPipeline(pipe);
    pass.setBindGroup(0, group);
    if (count === undefined) {
      const w = Math.ceil(this.N / 8);
      pass.dispatchWorkgroups(w, w);
    } else {
      pass.dispatchWorkgroups(Math.ceil(count / 64));
    }
  }

  /**
   * One step of the plate as a Hele-Shaw cell (wgsl/thinGap.ts): the forces
   * read as terminal speeds and the drag, the mobility, the right-hand side,
   * a variable-coefficient multigrid with the rim held open, and the
   * velocity the step ends with.
   */
  private thinProject(pass: GPUComputePassEncoder, p: GpuStepParams, disp: number): void {
    const prev = this.ensureThinGap();
    const mob = this.hsMob!;
    const nu = thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS);
    const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
    const phase = this.phaseLive ? this.phase.read : this.blankPhase();
    const mid = this.hsMidNow ?? prev;
    /*
      Glass Smear is the glass sliding over the liquid (hsPrep): the liquid's
      column goes at half the glass's speed. The old push gave the colour a
      noise's 0 to 1 of smearX, half on average, and a pool pushed while the
      clear liquid round it is not goes at about half its push (Darcy's), so
      the colour went at about a quarter of smearX (lab: 0.27). The glass is
      taken at half smearX, so the liquid, colour and all, goes at a quarter
      (0.25): a look's smear moves its colour as fast as it did, and now
      moves the liquid it is in with it.
    */
    this.hsRun(pass, 'hsPrep', `hsPrep:${this.vel.read.label}:${mid.label}:${this.squeeze.read.label}:${phase.label}`,
      this.arg('thin prep', [12 * nu / (PLATE_METRES * PLATE_METRES), seconds, REST_GAP, OPEN_RIM, this.phaseLive ? (p.ferroViscosity ?? FERRO_NU) / nu : 1,
        NU_REF / nu, 0.25 * p.smearX, 0.25 * p.smearY]),
      [this.vel.read, prev, mid, this.squeeze.read, phase, this.vel.write, mob]);
    this.vel.swap();
    const invDt = 1 / Math.max(this.lastDt, 1e-4);
    this.hsRun(pass, 'hsDivergence', `hsDivergence:${this.vel.read.label}:${this.squeeze.read.label}:${this.air!.field.label}:${this.air!.prev.label}`,
      this.arg('thin divergence', [this.airPush, invDt, this.airCover, REST_GAP, (this.airCover - this.airCoverPrev) * invDt, 1 / Math.max(disp, 1e-9), this.hsPrimed ? 0 : 1, 0]),
      [this.vel.read, this.squeeze.read, this.air!.field, this.air!.prev, this.div, mob, this.hsGap!]);
    this.hsPrimed = true;
    // Each coarse level's faces and rim, from the level above it.
    for (let l = 0; l < this.mg.length; l++) {
      const fineN = l === 0 ? this.N : this.mg[l - 1].n;
      const cells = l === 0 ? mob : this.hsMobC[l - 1];
      // Level 0 has no face buffer (its faces are its cells' harmonic means), so its
      // cells fill the slot too: read twice is allowed, read and written in one dispatch is not.
      const faces = l === 0 ? mob : this.hsFaceC[l - 1];
      this.hsRun(pass, 'hsCoarsen', `hsCoarsen:${l}`, this.arg(`thin coarsen ${l}`, [fineN, l === 0 ? 1 : 0, 0, 0]),
        [cells, faces, this.hsMobC[l], this.hsFaceC[l]], this.mg[l].n * this.mg[l].n);
    }
    /*
      Warm-started: the solve begins from the last step's P, not from zero.
      It looked as if it began from zero: hsP was cleared under the bind
      group key 'clear pressure', which the old plate's clear of `press` had
      already built on `press`, so it zeroed `press` (which hsGradient then
      overwrites) and left hsP as the last step had it; after a groups.clear()
      the first caller took the key, and the thin gap went cold. Every number
      Thin Gap was measured and shipped on came from the warm start, and a
      cold one does not reach them in hsCycles V-cycles: in `npm run thingap`
      a press on a 130² grid moved its ring 63% of the way the displaced
      volume puts it, against 100% warm (128² is 100% either way). A Hele-Shaw
      cell's pressure changes smoothly from one step to the next, so the last
      step's is the standard first guess; it is chosen here rather than left
      to whichever clear ran first (PLAN 18a-12).
    */
    for (let c = 0; c < this.hsCycles; c++) this.hsCycle(pass, 0);
    this.hsRun(pass, 'hsGradient', `hsGradient:${this.vel.read.label}:${this.squeeze.read.label}`, this.arg('thin gradient', [REST_GAP, 0, 0, 0]),
      [this.vel.read, this.squeeze.read, this.vel.write, this.hsP!, mob, this.press]);
    this.vel.swap();
  }

  /** One V-cycle of the thin gap's variable-coefficient multigrid, as `vcycle` is for the old one. */
  private hsCycle(pass: GPUComputePassEncoder, l: number): void {
    const mob = this.hsMob!;
    const smooth = (level: number, sweeps: number) => {
      for (let k = 0; k < sweeps; k++) {
        for (const parity of [0, 1]) {
          if (level === 0) {
            this.hsRun(pass, 'hsSmooth0', `hsSmooth0:${parity}`, this.arg(`pressure ${parity}`, [parity, 0, 0, 0]), [this.div, this.hsP!, mob], this.N * (this.N / 2));
          } else {
            const lv = this.mg[level - 1];
            this.hsRun(pass, 'hsSmooth', `hsSmooth:${level}:${parity}`, this.arg(`mg smooth ${level} ${parity}`, [lv.n, parity, 0, 0]),
              [lv.b, lv.p, this.hsMobC[level - 1], this.hsFaceC[level - 1]], lv.n * Math.ceil(lv.n / 2));
          }
        }
      }
    };
    if (l === this.mg.length) { smooth(l, MG_COARSE_SWEEPS); return; }
    smooth(l, MG_SWEEPS);
    const below = this.mg[l];
    if (l === 0) {
      this.hsRun(pass, 'hsRestrict0', 'hsRestrict0', this.arg('none', [0, 0, 0, 0]), [this.div, this.hsP!, mob, below.b], below.n * below.n);
    } else {
      const here = this.mg[l - 1];
      this.hsRun(pass, 'hsRestrict', `hsRestrict:${l}`, this.arg(`mg level ${l}`, [here.n, 0, 0, 0]), [here.p, here.b, this.hsMobC[l - 1], this.hsFaceC[l - 1], below.b], below.n * below.n);
    }
    this.dispatchBuf(pass, 'mgZero', `mgZero:${l + 1}`, this.arg(`mg zero ${l + 1}`, [below.n * below.n, 0, 0, 0]), [below.p], below.n * below.n);
    this.hsCycle(pass, l + 1);
    if (l === 0) {
      this.hsRun(pass, 'hsProlong0', 'hsProlong0', this.arg('none', [0, 0, 0, 0]), [below.p, this.hsP!, mob], this.N * this.N);
    } else {
      const here = this.mg[l - 1];
      this.hsRun(pass, 'hsProlong', `hsProlong:${l}`, this.arg(`mg level ${l}`, [here.n, 0, 0, 0]), [below.p, here.p, this.hsMobC[l - 1]], here.n * here.n);
    }
    smooth(l, MG_SWEEPS);
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
    // The dye is an amount and thins where the flow spreads (see macCormack);
    // the velocity is carried as it was.
    const last = label === 'dye' ? this.arg('advect dye conserving', [disp, 1, 0, 0]) : fwd;
    this.run(pass, 'macCormack', field.write, [phi0, this.scratchA, this.scratchB, velTex, this.sampler], last);
    field.swap();
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
      if (which === 'dye') this.rbDyeSeq = this.rbRings.dye.landed;
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
  /** The dye readback's sequence: the newest copy issued, and the newest landed in `rbDyeView`. */
  get rbDyeIssued(): number { return this.rbRings.dye.issued; }
  /*
    The reading in rbDyeView, not the newest to land in the ring. A copy lands
    asynchronously and waits in the ring until the next readbackAsync copies
    it across, so the ring's `landed` ran up to a frame ahead of the view:
    Finger and Press, told their last move was in the reading, read the one
    before it and put the dye they had already moved down again, and the
    Finger added a third of what it stroked (npm run tools, +172 on 426).
  */
  get rbDyeLanded(): number { return this.rbDyeSeq; }
  get rbVelView(): Float32Array { return this.rbVel; }

  /** Read a field straight out, waiting for the GPU. For the parity harness, not the show. */
  async readField(which: 'dye' | 'vel' | 'grain' | 'oilDye'): Promise<Float32Array> {
    const src = which === 'dye' ? this.dye.read : which === 'vel' ? this.velForced : which === 'oilDye' ? this.oilDye?.read : this.grain?.read;
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
      /** The mix (oil, soap, acidity) and the reactions, or null where none. */
      mix: this.mixLive && this.mix ? this.mix.read : null,
      rxn: this.rxnLive && this.rxn ? this.rxn.read : null,
      lies: this.liesLive && this.lies ? this.lies.read : null,
      /** All of it packed for the plate (see packView), once a step has run. */
      view: this.viewTex,
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
