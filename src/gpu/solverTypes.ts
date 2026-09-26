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
  /** The ferrofluid's labyrinth under a strong field (Ohta–Kawasaki). */
  ferroLabyrinth?: number;
  /** How fine the maze is: 0 keeps MAZE_PERIOD, 1 is a third of it (the grid still sets a floor of twelve cells). */
  mazeDetail?: number;
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
  /** How fast the plates spring back toward that dome, per step. */
  gapSpring: number;
  /** How much of a press's squeeze survives into the next step. */
  gapMemory: number;
  /** How hard the hand is on the glass: scales the press's push on the flow. */
  platePressure: number;
  fingering: number;
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
  twist: number;            // the top glass turning: a differential rotation, fastest inside
  meanDensity: number;
  maxCurrent: number;       // a speed that moves the dye at most ~¾ of a cell a step
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
  clearPhase?(): void;
  /** The liquids' own physics and chemistry (docs/physics-plan.md): pours into the mix and the reactions. */
  addMix?(x: number, y: number, radius: number, what: { oil?: number; soap?: number; acid?: number }): void;
  addRxn?(x: number, y: number, radius: number, what: { bz?: number; bzWake?: number }): void;
  addLiesegang?(x: number, y: number, radius: number, amount?: number): void;
  readonly chemistryLive?: { rxn: boolean; lies: boolean };
  step(p: GpuStepParams, deltasApplied: boolean): void;
  applyDeltas(dyeAdd: Float32Array, velAdd: Float32Array, dyeMul: Float32Array, dt: number): void;
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
}
