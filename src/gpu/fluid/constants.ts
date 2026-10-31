/**
 * The solver's constants, the shapes it hands out and the few physics helpers they are
 * derived with: what was the top of `gpu/fluid.ts` above its class, moved here unchanged
 * (PLAN 19ai-7) so each file of the class can import them. `gpu/fluid.ts` re-exports the
 * ones it exported before, so nothing outside the solver changed its imports.
 */

import type { SolverCarry } from '../solverTypes';
import { SOLVER_VEL_FORMAT } from '../wgsl/pack';
import { DISH_METRES, thicknessViscosity } from '../../lib/turntable';

/*
  How many bubbles the air field has room for.

  `MAX_BUBBLES` in `lib/bubbles.ts` is 40 today, and that cap exists because
  the compositor looped over them per pixel. The field does not care — the
  splat costs the area the discs cover — so this is sized for where H6 is
  going rather than for where the list is now, and raising the list's cap
  needs nothing here.
*/
export const AIR_CAPACITY = 512;

/** What `handOver` copies out: the fields, on the device they were copied on. */
/** One step of `groupAt`'s walk: what it found here, and where each next object leads. */
export type GroupNode = { kids: Map<unknown, GroupNode>; group?: GPUBindGroup };

export interface FieldCarry extends SolverCarry {
  readonly device: GPUDevice;
  readonly phase: GPUTexture | null;
  readonly mix: GPUTexture | null;
  readonly rxn: GPUTexture | null;
  readonly lies: GPUTexture | null;
  /** Oil Bodies' tally of the oil poured: the oil is carried, so its tally is. */
  readonly oilPoured: number;
}

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
export const PRESSURE_SWEEPS = 12;
/*
  The projection as multigrid V-cycles rather than sweeps alone (see
  mgRestrict0 in wgsl/fluid.ts): two cycles of two sweeps each way per level,
  and enough sweeps at the coarsest (a few cells across) to finish it there.
*/
export const MG_CYCLES = 2;
export const MG_SWEEPS = 2;
export const MG_COARSE_SWEEPS = 16;
/** Workgroups summing the projection's right-hand side for its plate mean (divTiles). */
export const DIV_GROUPS = 64;
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
export const THIN_GAP_KERNELS = ['hsBody', 'hsPrep', 'hsDivergence', 'hsSmooth0', 'hsRestrict0', 'hsCoarsen', 'hsSmooth', 'hsRestrict', 'hsProlong', 'hsProlong0', 'hsGradient', 'carryCourant', 'carryPlan'];
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
export const CARRY_PAIRS = (CARRY_SUBSTEPS - 1) / 2;
/*
  The most whole cells a step the glass's drift is taken out of the carries
  by (driftCells): driftShift gathers that many cells into the one against
  the wall. Full Plate Rock drifts the film 5 cells a step on 384²; past 8
  what is left rides as flow, in substeps.
*/
export const DRIFT_MOST = 8;
/*
  And the least, in cells a step, worth taking out: below it the drift costs
  the carries nothing (a fifth of a cell is half their 0.4), and taking it
  out would cost every carried field a pass.
*/
export const DRIFT_LEAST = 0.2;
/** Iterations a step of the ferrofluid's own pressure, which keeps it from packing past full (phaseRelax). */
export const PHASE_RELAX = 6;
/*
  C_α, how much of what the flux step's limiter withheld at a moving edge of
  the ferrofluid is given back (phaseCompress in wgsl/fluid.ts, PLAN 29c-1).
  1 is all of it: the second-order flux the limiter cut at each face to stay
  monotone, ½c(1 − c) of the face's slope by the share withheld (wgsl/fluid.ts,
  withheld), which is what spreads a dragged drop's trailing edge. Nothing at
  rest whatever it is, nothing on a smooth profile, and nothing on the deep
  plate (the step).
*/
export const PHASE_COMPRESS = 1;
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
export const OIL_TENSION = 4e-4;
/*
  The most the oil's surface tension may move the liquid in a step, in cells
  (see mixForce). A drop rounding up is a slow thing, a second or so for a
  drop a tenth of the plate across, which is a fraction of a cell a step on
  any grid; the cap is there for the moment a fresh pour is breaking up,
  when the force is at its largest and least real.
*/
export const OIL_CELLS = 0.5;
export const SOAP_PULL = 0.5;
export const DYE_WEIGHT = 0.12;
export const HEAT_LIFT = 0.06;
/** The lamp under a standing plate: heat a second into the wax where the plate goes out of view, at full Gravity. */
export const LAMP_HEAT = 6;
/** Vorticity confinement's push, as a fraction of the local spin, per step. */
export const CONFINE = 0.35;
/** Cahn–Hilliard substeps a step for the oil (see the 'mix' stage). */
export const CH_SUBSTEPS = 4;
/*
  Film Hold at 1, as a chemical potential: what the water in a film one
  cell thick costs the oil, against the double well's own height (1/16)
  and its steepest pull (0.19 at a fifth full). Set in the lab against
  the packed splodascope plate (npm run filmhold): see there.
*/
export const FILM_MU = 0.6;
/*
  Film Hold at 1, as a push (mixFilm): the force on an edge with another
  edge touching it across the water, as a curvature, in the capillary
  force's own units (σκ∇c̃), so it scales with Oil Tension as the pull it
  answers does. The spurious pull across a film is the curvature of the
  waist the blur reads, up to about one over a cell.
*/
export const FILM_PUSH = 1.5;
/*
  The clear film (PLAN §20b, wgsl/film.ts), on a grid of its own.

  FILM_GRID is the prototype's (lace.py, 384²), whose numbers the kernels
  keep, so a hole is the size the prototype found on any solver that grid
  fits in; a smaller solver runs the film on its own grid and tears coarser.

  FILM_MAX is the thickest film Clear Film lays, at 1: the prototype's plateau,
  under the other glass's 0.9. FILM_RATE is the film's own time a second of the
  show. The prototype's lace took about five units, so at 0.15 a thin film
  (0.3 of the gap) tears in a second or two over the dust and a thick one
  (0.8) holds for twenty seconds and more, which is the pace a real film
  dewets at on a light show's dish. FILM_DT is the explicit step's limit
  (2 / M(64σ + 8·wall) is 2.6e-4 at the film's stiffest, see filmUpdate), so
  a second takes 0.15 / 2.2e-4 ≈ 680 substeps, twelve a frame at 60 frames;
  a slow frame takes no more than FILM_SUBSTEPS and the film runs slower
  rather than unstable. FILM_CARRY substeps carry it with the flow.
*/
export const FILM_GRID = 384;
export const FILM_MAX = 0.86;
export const FILM_RATE = 0.15;
export const FILM_DT = 2.2e-4;
export const FILM_SUBSTEPS = 12;
export const FILM_CARRY = 2;
/** The precursor film the glass keeps wet, as in wgsl/film.ts (F_HP): no film is laid thinner. */
export const FILM_HP = 0.06;
/** Liesegang's inner electrolyte, spread evenly through the gel. */
export const LIES_B0 = 0.2;
/*
  The ferrofluid maze (see phaseMu, mazeForce). Its period, in plate widths:
  set from the field's own stability analysis rather than tuned, so the maze
  is the same size on every grid. For the Ohta–Kawasaki energy with a
  screened repulsion α/(k² + m²) and unit surface stiffness, the fastest
  growing wavenumber is k*² = √α − m²; so from the period wanted, k*, then
  m = 0.4 k* (a screening longer than a stripe, shorter than a pool) and
  α = (k*² + m²)².
*/
export const MAZE_PERIOD = 0.045;
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
export const MAZE_FINEST = 3;
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
export const MAZE_GAIN = 2;
/** The share of the maze's field that is uniform (a coil under the whole plate); the hand magnet adds the rest where it is. */
export const MAZE_UNIFORM = 0.45;
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
  domes and out of the valleys (mazeForce, from μ); at the maze's own gain
  the pool had barely begun to part after four seconds. Both were chosen by
  rendering the lab's Magnet Garden with the magnet held, pull 1 and 0.5,
  flow 1, 2 and 4: at pull 1 the domes stayed packed in one raspberry, and
  at four times the flow the pool thinned to grey, the plate past half full
  falling from 8.6% to 7.3% in five seconds on 384². Without a maze field
  (the Magnet on Classic, which pours ferrofluid to gather) the pull stays
  whole: gathering along the hand is what `npm run magnet` holds that tool
  to, and the domes were only tuned on the ferrofluid looks.

  The half was a tuning, not physics: a magnet's pull on a ferrofluid does
  not weaken because peaks have formed. It stood in for what the model
  lacked, a layer that can stand taller than full: a real Rosensweig peak
  rises out of the layer and draws the liquid from the valleys into it,
  while the plate's was capped at full, so a pool pulled together could
  only spread sideways and the domes stood shoulder to shoulder, the gaps
  between them 16% of the plate near the magnet (PLAN.md §9f, `npm run
  domes`). That layer is now there (PLAN §9t, src/gpu/standing.ts), and
  both these act only past its window: under it the film shapes the layer
  and the plate's pull and maze flow step aside (STAND_ASIDE), the flow
  carrying only the layer's mean there (wgsl/fluid.ts, carried).
  What is left of them is the ring between the window (0.083 of the plate
  from the magnet on 384², fading out by 0.125) and the spikes' reach
  (0.155), where they still carry the pool's edge in and the fingers out
  (9i), and the values are the ones those were judged with. Whether that
  ring wants them now is PLAN 9t's question for a look on the Mac.
*/
export const SPIKE_PULL = 0.5;
export const SPIKE_FLOW = 2;
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
export const HAND_SCREEN = 0.04;
/** The reactions' own grids (see gridSplat). */
export const BZ_GRID = 256;
/*
  The Oregonator's own time a second of show (the bz stage). A real dish of
  ferroin BZ turns its spirals once in tens of seconds and its waves crawl a
  few millimetres a minute. The reaction ran twelve steps of 0.01 a solver
  step, 7.2 of its units a second at sixty steps, and one turn of the model's
  spiral is 5.3 units (the lab: the oxidised catalyst at a point peaked every
  0.73 s; the showreel saw blue rings pulse every 0.75 s, a metronome). At
  0.26 a turn takes 20 s, the quick end of a real dish. The shortcut, named:
  the model's wavelength is a fifth of the plate, so the plate is a patch of
  the dish about 6 mm across, as under a magnifier, and at the real period
  its waves cross it at the real speed for their wavelength (about 0.01 of
  the plate a second). On the show's clock (seconds a step), not a count of
  steps, so the governor's step rate does not change the chemistry's.
*/
export const BZ_PER_SECOND = 0.26;
/*
  The grid the reaction's diffusion lengths are given on (stepChemistry): the
  middle rung, so the coral and the print keep about the size the looks were
  judged at on the Mac, now on every rung. CHEM_STABLE is the explicit step's
  D·dt with headroom under its 1/4, and CHEM_MOST caps a frame's substeps,
  past which the reaction grows more slowly rather than costing more.
*/
export const CHEM_REF = 384;
export const CHEM_STABLE = 0.2;
export const CHEM_MOST = 24;
export const LIES_GRID = 128;
export const CURRENT_ITERS = 10;
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
  (PLAN 22k: what that costs, `npm run swirlcost`), and since 22j (#261)
  a look whose motor turns its liquid past the centrifuge's floor runs it on
  every step; a look nobody turns leaves both at exactly zero.
*/
export const SWIRL_DISH_MIN = 1e-3;
export const SWIRL_SPIN_MIN = 0.05;
/** The oil's density under the look's liquid, Δρ/ρ (lib/turntable.ts, dyeDensityContrast's note). */
export const SPIN_OIL_LIGHT = 0.12;
export const SQUEEZE_SWEEPS = 5;
export const VISC_ITERS = 4;
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
export const GRID_DAMP = 0.05;
/** The CPU solver's hard speed limit, in plate units per unit time. */
export const MAX_SPEED = 0.002;
/*
  The plate as a Hele-Shaw cell (PLAN §18a, wgsl/thinGap.ts): its real size.

  The drag between two glasses is 12ν/h², which needs the gap in metres.
  The gap field is in plate widths (0.03 at rest in the middle), so the
  plate needs a width: an overhead projector's stage takes a clock glass of
  about eight inches, 0.2 m, which puts the rest gap at 6 mm in the middle
  and the tightest the squeeze allows (0.004) at 0.8 mm. The same 0.03 is
  the unit the mobility is written in, so M is about c on an open plate.
  The turntable's dish, because hsPrep reads the clear liquid's viscosity
  back out of 12ν/W² with that width (PLAN 18d) and the two must agree.
*/
export const PLATE_METRES = DISH_METRES;
export const REST_GAP = 0.03;
/*
  Real molecular diffusion of food dye in water (PLAN 18h).
  Audit correction: the old Jacobi diffusion rate at default 0.0002 measured an
  effective D ≈ 1.7e-5 m²/s in the lab (~40,000× real food dye in water ~4e-10 m²/s,
  not "about 1000×").
*/
export const D_MOLECULAR = 4.0e-10; // m²/s
/*
  Thermal diffusivity of water (PLAN 18h): kappa ≈ 1.4e-7 m²/s (Lewis number
  Le ≈ 350 against dye). Heat gets its own physical diffusivity so the 12
  presets with diffusionRate at 0 still spread heat.
*/
export const KAPPA_WATER = 1.4e-7; // m²/s
/*
  The forces' own physics on a thin gap (PLAN 18a-2, wgsl/thinGap.ts's
  hsBody, hsPrep and hsDivergence).

  The reference liquid: the default Thickness, the one every look's forces
  were tuned on. A body force is read as the speed it drives this liquid to
  at the rest gap, so on the default Thickness nothing moves differently,
  and on any other the liquid answers as its viscosity says (hsPrep).
*/
export const NU_REF = thinGapViscosity(THIN_GAP_THICKNESS);
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
export const DRIP_WEIGHT = 0.5;
/*
  Plate Rock's tilt, as the dye's weight down the tilted plate (PLAN 27a).

  A hand rocking the clock glass tips the plate a few degrees. Flat on the
  projector gravity is straight through the glass and moves nothing; tipped
  by θ it has g·sinθ in the plate, and between two glasses a liquid denser
  than the one round it slides downhill at Darcy's speed h²Δρ g sinθ / 12μ
  while the lighter one rises past it. A plate of one liquid evenly coloured
  does not move at all (no weight is heavier than its neighbour): what moves
  is the colour, where it is thicker than the plate's mean.

  It went through the half-resolution current as a stir, × 0.2 of the
  spring's swing and × tanh of the dye over the mean, and was capped there
  with everything else the current carries. Measured in the lab on a thin
  gap at the default Speed (dt 0.003), forty pools of colour rocked at
  0.9 Hz at the most the app ever handed it: the picture differed from the
  same plate left still by 0.024 at most over two seconds (the dye's L1
  change against its total), where Turbulence at 0.5 moves it 0.72. Plate
  Rock was a dial that did nothing a person could see.

  So on a thin gap it is a body force in `hsBody`, with Rain Drip's
  heavy colour: `rock` is the plate's tilt (sinθ: the app's spring at
  full Plate Rock swings to about 0.2 on a strong kick, twelve degrees,
  which a hand on a clock glass does), and ROCK_FALL is how fast a unit of
  dye over the mean falls on a plate stood straight up, in the flow's
  per-step speeds, read against the reference liquid as every body force
  is. Its size: dyed water in a light mineral oil (Δρ about 150 kg/m³) in
  the plate's 6 mm middle, tipped fifteen degrees, would slide at about a
  quarter of the plate a second; colour in the same liquid (Δρ of ten or
  so) at a fiftieth. ROCK_FALL puts a pool at 0.73 in the flow's speeds at
  twelve degrees (`npm run rides`), about 6% of the plate a second at the
  default Speed, between the two, so a kick at full Plate Rock swings a pool
  a few percent of the plate and the spring brings it back. With forty
  pools rocked as the app rocks them the colour moved 0.43 against 0.028
  before, where a look's own stir moves it 0.79.
*/
export const ROCK_FALL = 12;
/*
  The oil rising up the same tipped plate (PLAN 27f-5, hsBody). Unlike the
  colour's weight this is not tuned: a light mineral oil is 12% lighter than
  the water (SPIN_OIL_LIGHT, the centrifuge's own), and between two glasses a
  column of it, tipped by θ, rises through the reference liquid at Darcy's
  Δρ g sinθ h₀² / 12μ_ref at the rest gap, which is how hsPrep reads a body
  force: 6 mm, 22 cSt, so 0.16 m/s per unit of sinθ, a column's speed with
  nothing round it to push aside. A round lens has the water to push round
  it (in a liquid of its own thickness it goes at half that, Hele-Shaw's
  inclusion), and on the default Plate Rock's leans of a few degrees it rises
  a few millimetres a lean. This is that free speed in m/s per unit sinθ; the
  step turns it into the flow's per-step speed as the breath's is turned.
  `npm run oillift` measures the lens against the same formula worked out in
  SI there, and the frame against moving.
*/
/*
  The grid the oil's lift is relaxed on (hsLiftSource, hsLiftRelax): the
  solver's own, up to LIFT_MOST on a side, coarser past it (a 384 or 512
  plate). Half the side was tried, a quarter the cells: Ψ is one integration
  smoother than the oil's edge, but a lens of the plate's usual size is only
  four of those cells across its radius, and in the lab a lens rose at 91% of
  the speed Darcy gives its own soft edge, against 97% on the solver's grid.
  The cost is the sweeps, LIFT_SWEEPS a step of over-relaxed red-black
  Gauss–Seidel, warm from the last step, which keep up with an oil that
  moves a few millimetres a lean: from cold, at the grid's best ω, about 200
  sweeps on a 192 plate, a third of a second of rocking. Short of converged
  it is still a closed circulation, a lens a little slow and never the frame.
*/
export const LIFT_MOST = 256;
export const LIFT_SWEEPS = 8;
export const LIFT_KERNELS = ['hsOilMean', 'hsLiftSource', 'hsLiftRelax'];
export const HEAT_KERNELS = ['hsHeatMean'];
export function liftGrid(n: number): number { return Math.max(2, 2 * Math.floor(Math.min(LIFT_MOST, n) / 2)); }
export const OIL_LIFT = SPIN_OIL_LIGHT * 9.81 * (REST_GAP * PLATE_METRES) ** 2 / (12 * NU_REF);
/*
  The lamp's heat, in kelvin, watts and seconds (PLAN 38f; `npm run plume`
  measures every number here against the law worked out in SI).

  What it replaced. The lamp warmed the plate at 0.24 K/s, worked out for a
  millimetre of water with no glass, and on the look's clock (Speed × 0.2 a
  step), so a fast look heated fast; Heat Decay cooled it by
  heatDecay^(4·dt), on the same clock; and the temperature is a half float,
  so at the app's step (dt about 0.003) Classic's cooling took 3e-4 of the
  heat a step, under half the field's last bit, and the plate rounded back
  to its own temperature every step: it warmed until the lamp's step was
  under that bit too, and never cooled.

  What it is. The sandwich (water over the gap, two glasses) is one
  temperature through its depth, as src/lib/lampBoil.ts has it: across a few
  millimetres of water and glass the depth evens out in seconds to a minute,
  and the heating and the cooling below take minutes. A square metre of it
  holds C = ρc_water·h + 2·ρc_glass·t per kelvin (6 mm and two 2 mm glasses:
  33 kJ/m²K), wherever the gap is h (decayVel reads it off the squeeze). The
  lamp puts LAMP_IRRADIANCE times the share the dye takes into it (the
  projector's heat filter in: a kilowatt a square metre at the stage, which
  is where 18f's 0.24 K/s came from); the air takes h_air·ΔT off each face
  and each face radiates εσ((T_room + ΔT)⁴ − T_room⁴). Heat Decay is the air:
  h_air = HEAT_AIR·(−ln v) a face, chosen so Classic's 0.98 keeps the time
  it took on Classic's clock (145 W/m²K: about 115 s with the radiation), a
  projector's fan blowing hard; Lava Lamp's 0.995 is 36, a gentle draught;
  0.998 is 14, still air; 0.9 is 760, past any fan (a setting may ramp past
  real; the law under it stays). Updraft adds the forced air of its own
  boundary layer on the top face (UPDRAFT_SPEED, decayVel).

  ΔT is stored over the room's HEAT_ROOM, as the field always was (18f's
  tempVisc reads it as kelvin). The lift is water's real density (Kell 1975,
  as lampBoil's waterDensity): B = 1 − ρ(T)/ρ(T_room), and the liquid it
  lifts rises between the glasses at B g h₀²/12ν_ref, HEAT_RISE per unit B,
  read as every body force on a thin gap is (hsBody, hsPrep), along the
  plate's up wherever the plate stands or is tipped. Water's expansion
  triples between 20 °C and 90 °C, so a hot plume rises harder than a
  straight line says. Buoyancy is a multiple of that: HEAT_BUOY_REAL (the
  dial's default) is water's own.
*/
export const HEAT_ROOM = 20;
export const RHOC_WATER = 4.18e6;
export const RHOC_GLASS = 2500 * 840;
export const GLASS_METRES = 2e-3;
export const LAMP_IRRADIANCE = 1000;
export const HEAT_AIR = 7200;
export const HEAT_EMISSIVITY = 0.9;
export const STEFAN_BOLTZMANN = 5.670e-8;
export const HEAT_BUOY_REAL = 0.45;
export const HEAT_RISE = 9.81 * (REST_GAP * PLATE_METRES) ** 2 / (12 * NU_REF);
/*
  Updraft as air (PLAN 38t), where it was a noise, snoise(p·0.05 − t)·4dt
  plus a uniform 8dt up the plate. The dial is the air's speed over the
  glass, UPDRAFT_SPEED at full (a desk fan's few metres a second). Air
  moving over a surface grows a laminar boundary layer from the edge it
  comes over (Blasius): at x from that edge its stress on the surface is
  τ = 0.332 ρ_air U^1.5 √(ν_air/x), and its heat transfer
  h = 0.332 k_air Pr^⅓ √(U/ν_air x)/x, both strongest where the air comes
  in and falling as x^-½ (Re_x stays under the 5e5 of a turbulent layer
  across any dish: 4e4 at 3 m/s over 0.2 m). The stress is read as the
  Blow's is (lib/breath.ts, PLAN 15g, which treats the liquid's face as the
  air's): the column's mean goes at τh/2μ. A stress the same everywhere on
  a closed sandwich is pushed back by its own pressure and moves nothing; on
  the solver's open rim it would slide the whole picture out of the dish, so
  the dish's mean of it (UPDRAFT_MEAN, worked out once below) is taken off:
  what moves the liquid is the stress's unevenness, strong near the edge it
  comes in at, which a draught over a closed dish does.
*/
export const UPDRAFT_SPEED = 3;
export const AIR_DENSITY = 1.2;
export const AIR_NU = 1.5e-5;
export const AIR_K = 0.026;
export const AIR_PR = 0.71;
/** √(PLATE_METRES/x) over the dish, x from the rim the air comes in at (toward −v), on a fine grid: the stress's dish mean per unit. */
export const UPDRAFT_MEAN = (() => {
  const n = 512;
  let s = 0, c = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5;
    if (u * u + v * v >= 0.25) continue;
    const lead = Math.sqrt(0.25 - u * u);
    s += 1 / Math.sqrt(Math.max(lead - v, 1 / n)); c++;
  }
  return s / c;
})();
/*
  A drop of ink slumping under its own weight on a level plate (PLAN 18m,
  wgsl/slump.ts has the physics).

  DYE_LAYER is how deep a layer of the dyed liquid one unit of dye is, in
  metres: the plate stores an amount of dye per cell, and the current's flux
  goes as the cube of a depth. Set by volume, from the drop the audit and
  `npm run slump` lay: the lab's soft disc 0.04 of the plate across in
  radius at 1.4 units in its middle (8 mm on the 0.2 m plate) holds
  1.4·πr²/2 = 1.41e-4 unit·m², and a drop from a dropper is 0.05 mL (twenty
  to the millilitre), so a unit is 5e-8/1.41e-4 = 0.36 mm of the liquid. The
  dye's cap of six units is then 2.1 mm, a third of the plate's 6 mm middle,
  and a look's pale wash of a few tenths a film a tenth of a millimetre deep,
  which (at the cube) barely moves: pools slump, washes and threads stay.
*/
export const DYE_LAYER = 3.55e-4;
/*
  The explicit slump's limits (wgsl/slump.ts, "The shortcuts (PLAN 18m-1,
  18m-1a)"): a face moves at most SLUMP_FACE of the difference across it in
  a substep (¼ is the edge of stability on a square grid), in at most
  SLUMP_SUBSTEPS substeps a step. At 1024² with Heavy dye at 1 (g′ = 1.47 m/s²)
  a cell at DYE_CAP (2.13 mm in a 6 mm gap) has an inertial bound of 4.57 a
  frame at 60 Hz, which asks for ceil(4.57 / 0.24) = 20 substeps (15 at 768²;
  6 in water at Dye Weight 0 on 768²; 2 on the default light-oil Thickness).
*/
export const SLUMP_FACE = 0.24;
export const SLUMP_SUBSTEPS = 20;
/** The Froude number for a gravity current front in the slumping regime (Huppert and Simpson 1980). */
export const FROUDE_FRONT = 1.19;
/** The dye's cap per cell (decayDye), the deepest layer the slump has to be ready for. */
export const DYE_CAP = 6;
/*
  The clear liquid's density, kg/m³, to turn a Blow's stress into the speed
  it drives the liquid to (τh/2μ, μ = ρν; lib/breath.ts). The plate's
  liquids are water and oils, 0.8 to 1.26 of water's; the clear liquid is
  taken as water's, as liquidProps takes the poured ones' against it.
*/
export const LIQUID_DENSITY = 1000;
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
  return thicknessViscosity(thickness);   // lib/turntable.ts, where the cover glass reads it too
}
/** The drag time ρh²/12μ, in seconds, at the plate's rest gap, for a Thickness. */
export function thinGapDragSeconds(thickness: number, gap = REST_GAP): number {
  const h = gap * PLATE_METRES;
  return (h * h) / (12 * thinGapViscosity(thickness));
}
/*
  How hard the magnet pulls the liquid where the ferrofluid is, per unit of
  magnetic energy gradient, in real seconds (phaseForce): the speed, in
  plate widths a second, that one unit of ∇ψ a plate width drives the
  reference liquid to at the rest gap, which is how hsPrep reads a body
  force (PLAN 18a-2). What that is in tesla, metres and seconds is worked
  out and printed by `npm run magnetgain` (PLAN 29c-2): the solver's ψ is
  the Langevin energy of a ferrofluid in the rod's field, so one unit of
  it is (χ/2μ₀)(SPIKE_B_REF·Br)²/MAGNET_E joules a cubic metre, and
  Darcy's speed for a force f between the glasses is f·h²/12μ, so the pull
  of Ferrotec's EFH1 (χ 2.64 by its sheet) under an N52 rod comes to
  GAIN_phys = (χ/2μ₀)(SPIKE_B_REF·Br)² h₀² / (12 ρ ν_ref L² MAGNET_E),
  5.8e-5 seconds. This is 0.10 of it (0.22 at the χ of 1.2 some papers
  give the same fluid).

  Kept at a tenth of the real pull, and why. Nearer a magnet than 0.3 of
  the plate the pull asks for more than a step can carry at any gain the
  plate has had: the hand's magnet asks 7.8 plate widths a second at
  this gain, against the 0.375 that MAGNET_CELLS allows on 384², so
  there the guard is the drop's speed and the gain does not show (a
  real drop under a hand's magnet is pinned to it, at metres a second;
  the solver draws it following at the grid's own limit, PLAN 29c-5).
  The gain sets only the far field: how fast a pool a third of the
  plate off creeps toward a look's own magnet, which every look with a
  magnet was tuned on, and at the real pull Magnet Garden's and Ferro
  Paint's own would gather the whole plate at the guard's speed. A real
  plate's far pools stay where they were poured for a reason the solver
  does not have, the contact line's pinning on the glass, which holds a
  small drop against a weak field's pull outright (PLAN 29c-6: add it,
  then set the gain to the physics). Calibrated in the lab before any of
  this was known: a hand-held magnet a fifth of the plate from a pool
  draws it in at a quarter of the plate a second.
*/
export const MAGNET_GAIN = 6e-6;
/*
  The most one step of the magnet may add to a cell, in plate widths a
  second: a guard, not a limit on the pull. At half a plate a second it
  clipped the edge of a pool nearest the magnet and not the far one, which
  flattened the pull, and a dragged magnet left the ferrofluid behind (CI:
  0.023 of the plate against a hand that crossed 0.65 of it).
*/
export const MAGNET_CAP = 3;
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
export const MAGNET_CELLS = 2.4;

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
export const BODY_PASSES = 2;
/*
  How strongly colour astray from its liquid is steered back (bodyPartition):
  the gain on the blurred oil's step across a face, so that any step at all
  points the way (it saturates at a fifth of a cell's colour a face), and how
  many blurs make the field it follows, each reaching two cells further.
  Beyond the reach, colour with no oil anywhere near is the water's.
*/
export const BODY_DRIFT = 2000;
export const BODY_REACH_BLURS = 4;
export const DISPLACE_INSIDE = 0.06;
export const DISPLACE_ITERS = 2;
export const PHASE_SUBSTEPS = 6;
export const GRAIN_PERIOD = 6;

export const VEL = SOLVER_VEL_FORMAT;
export const R32 = 'r32float';
export const RG32 = 'rg32float';
export const RGBA32 = 'rgba32float';

/** The Sim uniform, laid out as WGSL sees it (see SIM_STRUCT). */
export const SIM_FLOATS = 56;      // 36 scalars (33 is the vec2's alignment), the fingers' three magnets at 36..47, the magnets' radius at 48, surfaceClear at 49, lampHeat at 50, heatSeconds at 51, heatLift at 52..53, airCool at 54, a pad at 55
