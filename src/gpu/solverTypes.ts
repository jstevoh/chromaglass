/**
 * What a solver is told, and what the plate needs of one
 * (docs/webgpu-plan.md, P7).
 *
 * Both of these were declared in `lib/gpuFluid.ts`, the WebGL solver, because
 * that is where they were first needed — `PlateSolver` is the narrow face the
 * frame loop sees, and it existed so that two solvers could both be one.
 * There is one now, so they live beside it.
 */

/** Everything a step needs, already derived from settings by the caller. */
export interface GpuStepParams {
  dt: number;
  /**
   * How completely a bubble empties the dye under it (H6 · A).
   *
   * 1 is the physical answer — a bubble is a hole, and a hole holds no
   * liquid. Lower keeps some of the old look, where a bubble shaded what was
   * behind it rather than removing it, for presets built around that. 0
   * skips the stage altogether.
   */
  bubbleClear?: number;
  visc: number;         // Hele-Shaw viscosity (thick 1.5 / thin 0.5)
  nu: number;           // kinematic viscosity for momentum diffusion
  diff: number;         // dye / heat diffusivity
  buoyancy: number;
  gravity: number;      // centre-gravity strength (already × 0.05)
  tiltX: number;        // plate tilt, applied as a uniform acceleration
  tiltY: number;
  cometX: number;
  cometY: number;
  advection: number;
  /** Interface sharpening, 0 = off. Counteracts the solver's own numerical diffusion. */
  sharpness: number;
  damping: number;
  heatDecay: number;
  turbScale: number;
  turbDetail: number;
  spin: number;         // vorticity strength (0 = off)
  immiscibility: number;
  /** The dome the two glasses leave at rest: <0 touches in the middle, >0 at the rim. */
  /*
    The second phase and the magnet under the glass (H7).

    The two liquids are kept apart by Cahn–Hilliard (see the phase stage in
    fluid.ts), which conserves and rounds; `phaseSharp` is its mobility, how
    fast a blurred edge separates again. `phaseTension` no longer reaches the
    GPU: Cahn–Hilliard carries its own surface tension, and the pairwise
    sharpening that took it set drops into blocky squares.
  */
  phaseSharp: number;
  phaseTension: number;
  /** Where the hand is holding it, in plate coordinates, 0..1. */
  magnetX: number;
  magnetY: number;
  /** How far below the glass. The control that matters most: it sets the falloff. */
  magnetHeight: number;
  magnetStrength: number;
  /**
    The magnet's radius in plate widths (wgsl/magnetDisc.ts): Magnet Size's,
    MAGNET_RADIUS at the tool's own size and when not given. It is a cylinder
    held with its face where the height says; a bigger one keeps the face
    there.
  */
  magnetRadius?: number;
  /**
    The other fingers holding a magnet on a touch screen, up to three, in
    plate coordinates; each at this magnet's height and strength. Only read
    while this one is on.
  */
  extraMagnets?: readonly { x: number; y: number }[];
  /**
    Seconds of real time this step stands for, as the magnet counts it. The
    flow moves by `dt × advection`, which a slow look keeps tiny on purpose;
    a magnet pulls in real time however slow the look is, or a hand dragging
    it leaves the ferrofluid behind.
  */
  magnetSeconds: number;
  /*
    The liquids' own physics and chemistry (docs/physics-plan.md). All 0..1,
    all off by default, so every look that does not ask for them runs the
    solver it always did.
  */
  /** Vorticity confinement: small eddies spun back up (a look option). */
  vorticity?: number;
  /** Surface tension between oil and water (Cahn–Hilliard + capillary force). */
  oilTension?: number;
  /** Oil Bodies: the oil and the water each keep their own colour (see bodyPartition). */
  oilBodies?: number;
  /** The ferrofluid's labyrinth under a strong field (Ohta–Kawasaki). */
  ferroLabyrinth?: number;
  /** How fine the maze is: 0 keeps MAZE_PERIOD, 1 is a third of it (the grid still sets a floor of twelve cells). */
  mazeDetail?: number;
  /** How hard the ferrofluid pushes the dye aside where it moves (0 leaves the dye where it was, under the black). */
  phaseDisplace?: number;
  /**
   * A clear film against the glass (PLAN §20b, wgsl/film.ts): 0 none, and the
   * film run not at all; up, a film that thick (a share of FILM_MAX of the gap)
   * laid over the plate, which tears into lace by its own physics. Moved while
   * a film is on, the film is raised or lowered everywhere by the difference.
   */
  clearFilm?: number;
  /** The dish's dust under the clear film: 1 in a show; 0 a clean dish, for a check. */
  filmDust?: number;
  /** Marangoni flow: liquid pulled away from where soap lowers the tension. */
  surfactantFlow?: number;
  /** Dye makes the liquid heavier and heat lighter: buoyancy in the plate. */
  solutalBuoyancy?: number;
  /** How far the plate stands up (0 flat on the projector, 1 upright). */
  plateUpright?: number;
  /**
   * Which way is downhill in the plate, as a unit vector: Tilt Direction on
   * the screen, wherever the dish has been turned to. (0, −1) by default.
   */
  gravityX?: number;
  gravityY?: number;
  /** How far downhill from the centre the plate is still in view, in plate widths: the lamp sits just beyond. */
  gravityReach?: number;
  /** Heat diffusing faster than dye (the double-diffusive case). */
  doubleDiffusion?: number;
  /** The Belousov–Zhabotinsky reaction's spirals. */
  bzReaction?: number;
  /** Liesegang rings: precipitate bands behind a diffusing front. */
  liesegang?: number;
  plateCurve: number;
  /** Hele-Shaw wall drag, keyed to how far the gap is from nominal (F). */
  depthDrag: number;
  /**
   * The plate as a Hele-Shaw cell (PLAN §18a, wgsl/thinGap.ts): over 0.5, the
   * flow between the glasses has the gap's drag and a variable-mobility
   * projection with an open rim, in place of the speed clamp. Off (0) is the
   * solver every look was made on.
   */
  thinGap?: number;
  /** The liquid's thickness for a thin gap, 0 (water) to 1 (glycerine), log in viscosity. */
  gapThickness?: number;
  /**
   * The ferrofluid's kinematic viscosity in a thin gap, m²/s. Not a setting:
   * the default is a real ferrofluid's (FERRO_NU in fluid.ts), and only the
   * lab sets it, to hold a check against a ferrofluid as thick as the clear
   * liquid round it.
   */
  ferroViscosity?: number;
  /**
   * For the lab only: 0 carries the ferrofluid by area under Thin Gap too,
   * as before the Press on the ferrofluid (PLAN 15d), so `npm run
   * ferropress` can hold its checks against what was there. Unset is on.
   */
  phaseVolume?: number;
  /** How fast the plates spring back toward that dome, per step. */
  gapSpring: number;
  /** How much of a press's squeeze survives into the next step. */
  gapMemory: number;
  /** How hard the hand is on the glass: scales the press's push on the flow. */
  platePressure: number;
  vibIntensity: number;
  vibFrequency: number;
  drip: number;         // rainDrip (0 = off)
  smearX: number;       // per-step shear, precomputed on the CPU
  smearY: number;
  air: number;          // airVelocity (0 = off)
  evapFactor: number;
  time: number;
  /**
   * The lasting current (see `stepCurrent`). Everything here is per second in
   * solver velocity units, except `currentDamp` (per step) and `maxCurrent`.
   */
  currentDamp: number;      // how much of the current survives a step (the Damping control)
  currentBuoy: number;      // heat rising: × the temperature field
  rockX: number;            // the plate's rock, × (density − mean): heavy dye slides downhill
  rockY: number;
  currentGrav: number;      // a concave dish, × (density − mean): heavy dye pools in the middle
  meanDensity: number;
  maxCurrent: number;       // a speed that moves the dye at most ~¾ of a cell a step
  /**
   * The spinning dish (PLAN.md §22, lib/turntable.ts, `spinSwirl` in
   * wgsl/fluid.ts). The solver works in a frame turning with the liquid's
   * bulk; these say how the dish and the liquid move against that frame.
   * All absent or zero and the swirl never runs: a plate nobody spins steps
   * exactly as it did.
   */
  spinDish?: number;        // the dish's speed in the liquid's frame, Ω − ω_l, rad/s
  spinLiquid?: number;      // the liquid bulk's own speed, ω_l, rad/s: the centrifuge
  spinTau?: number;         // the bulk's drag time h²/12ν at the rest gap, s: the frame's own lag
  spinNu?: number;          // the look's liquid, m²/s (lib/turntable.ts, carrierViscosity)
  spinDyeWeight?: number;   // the dye's density over the liquid's, less one (dyeDensityContrast)
  /**
   * Dye carried by particles (H1): how much of the picture they are, 0 = off.
   *
   * The grid keeps the body of colour and particles add the structure it
   * cannot hold, so this is a dial rather than a switch between two plates,
   * and at 0 the solver does not allocate them at all.
   */
  particles: number;
  /** Seconds a particle carries its colour before it is reborn somewhere with dye. */
  particleLife: number;
  /**
   * The share of the grid's checkerboard the dye loses a step (dampGrid).
   * Left out, the solver's own GRID_DAMP; the app never sets it. For
   * `npm run grating`, to step the same pressed plate with the pass off.
   */
  gridDamp?: number;
  /**
   * For lab checks only (PLAN 1.3 / S18): mutate simF uniforms directly after writeSim
   * before copying to GPU buffer, allowing tests to inject corrupted uniform values.
   */
  rawSim?: (simF: Float32Array) => void;
  clearChemistry?(): void;
  seedChemistry?(x: number, y: number, radius: number): void;
  addReagent?(x: number, y: number, radius: number, amount: number, pattern_val: number): void;
  stepChemistry?(iters: number, feed?: number, kill?: number, Du?: number, Dv?: number): void;
  depositChemistry?(chem: any, amount: number, colour: [number, number, number], threshold?: number): void;
  chem?: any;
}


/**
 * What one solver hands the next when the grid moves (PLAN 9w): the liquids
 * that live only on the GPU, copied out before the old solver goes. Opaque
 * here; `gpu/fluid.ts` holds what is in it.
 */
export interface SolverCarry {
  /** The grid it was copied from. */
  readonly n: number;
  /** Let its copies go. */
  destroy(): void;
}

/**
 * What the plate needs of a solver, whichever API it runs on
 * (docs/webgpu-plan.md, P3).
 *
 * `GpuFluid` below and `gpu/fluid.ts`'s `WebGPUFluid` both satisfy this, so
 * `FluidSimulation` can hold either without knowing which. What is *not* here
 * is anything one of them cannot do: `packInto` renders into a framebuffer,
 * which is WebGL's alone, so the WebGL renderer narrows to its own class at
 * the one place it needs it.
 */
export interface PlateSolver {
  /** The physical grid it is solving on. */
  readonly N: number;
  /** The crossfade between the pigment's two phases. */
  readonly grainMix: number;
  /** The coordinates the pigment rides, where the device can carry them. */
  readonly grainTexture?: unknown;
  /**
   * How much of the plate the air is taking, 0 when nothing is excluding.
   *
   * Optional because only the WebGPU solver carries an air field; the
   * budget servo that reads it treats absence as none (H6 · A).
   */
  readonly airDisplacing?: number;
  /**
   * Pour the second phase onto the plate, and take it off (H7).
   *
   * Optional because only the WebGPU solver carries a phase field.
   */
  addPhase?(x: number, y: number, radius: number, amount: number): void;
  addLiquidDrop?(x: number, y: number, radius: number, what: { soap?: number; body?: number; repel?: number; weight?: number; polarity?: number }, amount: number, seconds?: number): void;
  clearPhase?(): void;
  /** The liquids' own physics and chemistry (docs/physics-plan.md): pours into the mix and the reactions. */
  addMix?(x: number, y: number, radius: number, what: { oil?: number; soap?: number; acid?: number }): void;
  /**
   * A pour on a thin gap (PLAN 18c, 18d): `take` of the column at the middle
   * comes in as new liquid, its volume pushing the plate's aside and out
   * over the rim, and, for a liquid that mixes with the clear one (`sp`),
   * its share into the species field. Plate units.
   */
  pour?(x: number, y: number, radius: number, take: number, sp: { lnNu: number; density: number; index: number } | null, volume?: boolean): void;
  /** The share of the dish that is poured liquid, read back (PLAN 18d-2): the automation's headroom for thick liquids. */
  speciesShare?(): Promise<number>;
  /** A pour onto the clear film (PLAN §20b): clear oil thickens it, a solvent lands where it can open a hole. Plate units. Nothing without a film. */
  addFilm?(x: number, y: number, radius: number, what: { film?: number; solvent?: number }): void;
  /** How much of the plate the oil poured since the last clear covers, 0..1 (Oil Bodies' budget). */
  readonly oilCover?: number;
  /** Oil Bodies: the oil dragged along a gesture as its colour is (carryDye), in plate units. */
  carryMix?(x: number, y: number, radius: number, ux: number, uy: number, take: number, hop: number): void;
  /**
   * Whether the last step ran the plate as a thin gap (PLAN §18a): then a
   * hand on the glass lays only the glass, and the flow carries the liquid
   * (lib/squish.ts). Optional because only the WebGPU solver has one.
   */
  readonly thinGapLive?: boolean;
  /** Oil Bodies: the oil a press squeezes out, onto the ring (radius to outer) the dye lands on (pressOil). */
  pressMix?(x: number, y: number, radius: number, outer: number, take: number): void;
  /** The ferrofluid carried along a gesture, or straight out from its middle for a puff (Finger and Blow), in plate units. */
  carryPhase?(x: number, y: number, radius: number, ux: number, uy: number, take: number, hop: number, outward?: boolean): void;
  addRxn?(x: number, y: number, radius: number, what: { bz?: number; bzWake?: number }): void;
  addLiesegang?(x: number, y: number, radius: number, amount?: number): void;
  readonly chemistryLive?: { rxn: boolean; lies: boolean };
  /**
   * The liquids that never cross to the CPU (the ferrofluid, the mix, the
   * reactions), copied for the solver that replaces this one, and laid onto
   * that one's grid (PLAN 9w). Optional because only the WebGPU solver holds
   * any; `takeOver` is false when it could not take the carry (another
   * device's).
   */
  handOver?(): SolverCarry | null;
  takeOver?(carry: SolverCarry): boolean;
  step(p: GpuStepParams, deltasApplied: boolean): void;
  /**
   * `hands`, when a hand is in the liquid on a thin gap: L²×4 of (Σ χ·U, Σ χ, 0),
   * U the hand's own motion in cells a step and χ how much of the cell it
   * fills, held as a solid for the next step only (PLAN 15b; hsPrep).
   * `breath`, when a Blow's wind blows on a thin gap: L²×4 of (τx, τy, 0, 0),
   * the air's stress on the surface in pascals, for the next step only
   * (PLAN 15g; lib/breath.ts, hsBody).
   */
  applyDeltas(dyeAdd: Float32Array, velAdd: Float32Array, dyeMul: Float32Array, dt: number, hands?: Float32Array | null, breath?: Float32Array | null): void;
  /** Start a read and take whatever has landed; false before the first. */
  readbackAsync(): boolean;
  readonly rbDyeView: Float32Array;
  /** The dye readback's newest copy issued, and the one `rbDyeView` holds. */
  readonly rbDyeIssued: number;
  readonly rbDyeLanded: number;
  readonly rbVelView: Float32Array;
  /** The fields as the CPU last saw them, for carrying state across a change. */
  readback(): { dye: Float32Array; vel: Float32Array };
  drainStep(t: number): void;
  clear(): void;
  dispose(): void;
  clearChemistry?(): void;
  seedChemistry?(x: number, y: number, radius: number): void;
  addReagent?(x: number, y: number, radius: number, amount: number, pattern_val: number): void;
  stepChemistry?(iters: number, feed?: number, kill?: number, Du?: number, Dv?: number): void;
  depositChemistry?(chem: any, amount: number, colour: [number, number, number], threshold?: number): void;
  chem?: any;
}
