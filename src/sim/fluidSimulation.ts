/**
 * The CPU fluid solver: the plate as typed arrays, stepped on the main thread.
 *
 * Moved here from `components/LiquidVisualizer.tsx` (PLAN 19ai-3), where it
 * sat above the component as 3,900 lines of module code. Nothing in it
 * changed in the move. It was there because the visualizer was the only thing
 * that made one; it is here because a session working on the physics had to
 * page through the component's props and handle to reach it, and one working
 * on the show had to page through the solver.
 *
 * It is still the visualizer's: the frame loop owns the one instance, the GPU
 * solver (`gpu/fluid.ts`) is handed it as the CPU half of the plate (the
 * tools' strokes, the readbacks, the liquids' phases), and the lab steps the
 * GPU side alone. What it reads from the rest of `src/sim/` is the grid and
 * the solver's constants (`constants.ts`) and the step (`stepping.ts`).
 */
import { layFinger } from '../lib/handSolid';
import { layBreath } from '../lib/breath';
import { fingerCarry, blowCarry, carryDyeAlong, blowDye, blowOil, BLOW_STRENGTH } from '../lib/handCarry';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings } from '../types';
import { lookTarget as dyeLookTarget } from '../lib/dyeTarget';
import { findPreset } from '../presets';
import { PRESET_CONTRACTS } from '../presetPlate';
import { clockGlassBodies, clockGlassCell, splodascopeCell, splodascopeDiscs } from '../lib/oilLay';
import { plateAreas, areaFamily, OWN_SEED_AREAS, type PlateArea } from '../lib/plateAreas';
import { magnetDepth } from '../lib/magnetSize';
import { MAGNET_RADIUS } from '../gpu/wgsl/magnetDisc';
import { PALETTE_RGB, pickHarmony } from '../constants';
import { THIN_GAP_THICKNESS, thinGapViscosity, NU_REF } from '../gpu/fluid';
import { SloshClock, sloshAccel, rockAccel, sloshDrag, sloshNu, glassHeld, type SloshPress } from '../lib/slosh';
import { OPEN_RIM, carrierViscosity, dragSeconds, dyeDensityContrast } from '../lib/turntable';
import { DT_FLOOR, advanceCellClock, stepDisplacement } from '../lib/detailFlow';
import { stirOf } from '../lib/stir';
import { frameSway, plateSin } from '../lib/plateRock';
import type { GpuStepParams, PlateSolver, SolverCarry } from '../gpu/solverTypes';
import { pourPictureCpu } from '../lib/videoFlow';
import { depositRim, fillHole, type DyeTarget } from '../lib/bubbleDye';
import { DeltaRows, packRows, restRows } from '../lib/deltaRows';
import { LiquidPhase } from '../lib/liquidPhase';
import { pourShare, speciesOf } from '../lib/liquidProps';
import { RhythmSheet, stampedVolume, kickRoom } from '../lib/sheet';
import { squishDisc, glassSpring, PressLifts, KickRelease, KICK_HOLD, KICK_RELEASE, BassPress, type Presser, type Stroke } from '../lib/squish';
import { type Phrase } from '../lib/phrasing';
import { stream, type Rng } from '../lib/rng';
import { showNow } from '../lib/showClock';
import { pressDye, pressOil, pressTake } from '../lib/pressRing';
import { dyeAbsorbances } from '../lib/dye';
import { macroAmountOf, GRID_SIZE, GRID_SCALE, TURB_SPEED, CUR_BUOY, CUR_GRAV, BLOW_SWIRL, FINGER_SWIRL, FILM_POUR, BODY_DROP, BODY_COVER, DRIP_SPEED, GRID_AREA, SHARP_FLOOR } from './constants';
import { SIM_STEP } from './stepping';
import { rimCount, rimMask } from '../lib/rimMask';

export class FluidSimulation {
  size: number;
  dt: number;
  diff: number;
  visc: number;

  s: Float32Array;
  sR: Float32Array;
  sG: Float32Array;
  sB: Float32Array;
  density: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;

  vx: Float32Array;
  vy: Float32Array;
  vx0: Float32Array;
  vy0: Float32Array;

  pressure: Float32Array;
  gap: Float32Array;
  dhdt: Float32Array;

  temp: Float32Array;
  temp0: Float32Array;
  /**
   * The dish under this plate (PLAN.md §22, lib/turntable.ts dishFrame), in
   * radians a second: how fast the glass turns, everything that turns it
   * together (the look's motor, its music and a flick, Auto Spin, a hand on
   * the Spin tool), and how fast the liquid's bulk follows it with the drag
   * time of a thin gap. The picture turns with the liquid; the solver drags
   * the liquid toward the dish by the difference (the swirl) and flings it
   * by the liquid's own speed (the centrifuge). Both are zero on a dish
   * nobody turns, and the swirl does not run.
   */
  dishSpin = 0;
  liquidSpin = 0;
  /**
   * The angle the dish is drawn turned to, and how far down from its centre
   * the plate is still on screen (in plate widths). Gravity is the room's,
   * not the dish's: set by the frame, read by the step below.
   */
  plateAngle = 0;
  /** The last step's parameters as the solver was given them, for the harness to replay in the lab. */
  lastStep: GpuStepParams | null = null;
  /**
   * The other fingers holding the magnet on a touch screen, in plate
   * coordinates, set by the show each frame (magnetFor) and handed to the
   * solver with the first finger's magnet (GpuStepParams.extraMagnets).
   */
  extraMagnets: readonly { x: number; y: number }[] = [];
  /** The magnet's radius, Magnet Size's (magnetFor; gpu/wgsl/magnetDisc.ts). */
  magnetRadius = MAGNET_RADIUS;
  /** Half the screen's width and height, in plate widths (the plate is drawn 1.5× the long side). */
  viewHalfW = 0.33;
  viewHalfH = 0.21;
  meanDensity = 0; // rolling measure of how full the plate is
  /** Mean density inside the dish laid by the most recent `seedPreset` (null if cleared by hand). */
  seedMean: number | null = null;
  /** The Dye Budget of the look `seedMean` was laid for (`lib/dyeTarget.ts` scales the slider against it). */
  seedBudget = 0.85;
  /**
   * Whether this plate is a look that sits on black with little dye
   * (`isSparseDark`), set each frame by the loop that reads the settings, so
   * the solver does not read `lampGround` itself (`npm run panel` keeps every
   * setting the solver reads on the per-plate list, and this one is the whole
   * show's, not a plate's).
   */
  sparseDarkLook = false;
  /** Everything `addDensity` has been given, summed, so a frame's hand can be told from the music's. */
  private laidMass = 0;
  private handMarkMass = 0;
  /**
   * Dye a hand has laid on a seeded plate, as a mean over the dish, that the
   * regulator still holds room for. It falls away over `HAND_BANK_SECONDS` of
   * show time (`stepHandBank`). See `bankHand`.
   */
  private handBank = 0;
  static readonly HAND_BANK_SECONDS = 10;
  /**
   * The average colour on this layer, 0..1 per channel.
   *
   * Summed in the same loops that already sum density, so it costs three
   * adds per cell and no extra read. It is what a layer *is* rather than a
   * record of what was dropped on it: a tab can show the colour actually
   * sitting there, including after it has mixed into something else.
   */
  meanColor: [number, number, number] = [0, 0, 0];
  /** Plate tilt this step — a uniform acceleration, set by the show each step. */
  tiltX = 0;
  tiltY = 0;
  /** The plate's rock as the render loop last set it (not scaled to a tilt): drives the current. */
  /** How far a dropped liquid falls, 0–1 (set each frame from Drop Height), and the plate's Fingering for its splash. */
  dropHeight = 0;
  dropFingering = 0;
  rockX = 0;
  rockY = 0;
  /** The cover glass's slide over the film, m/s (lib/plateRock.ts, stepCover): drags the liquid at half its speed on a thin gap. */
  coverX = 0;
  coverY = 0;
  /**
    The phone's tilt, −1..1 and faded as the link drops (the frame loop sets it
    beside tiltX): the one part of the plate's motion the slosh follows, since
    it is the owner's hand and not the music. Not `tiltX`, which carries the
    sound's swing, and not `rockX` (stepSlosh).
  */
  extTiltX = 0;
  extTiltY = 0;
  /** Plate Rock's swing alone (lib/plateRock.ts rockSwing), for the slosh dish where Frame Sway lets it (stepSlosh, rockAccel). */
  swingX = 0;
  swingY = 0;
  /**
    The slosh dish (lib/slosh.ts) runs on the GPU and is never read back, so
    its clock says when it is driven and when its ring has gone (SloshClock).
    And the kicks' presses on it (Beat Squeeze, `pressKick`): where each landed,
    plate units, how deep each of its three discs went, and how long ago.
  */
  private sloshClock = new SloshClock();
  private dishKicks: { x: number; y: number; amount: number; radii: number[]; t: number }[] = [];
  // The lasting current on the CPU engine — the twin of GpuFluid.stepCurrent,
  // at half the logical grid: velocity, warm pressure and divergence.
  private readonly CM = GRID_SIZE / 2;
  private cvx = new Float32Array((GRID_SIZE / 2) * (GRID_SIZE / 2));
  private cvy = new Float32Array((GRID_SIZE / 2) * (GRID_SIZE / 2));
  private cpr = new Float32Array((GRID_SIZE / 2) * (GRID_SIZE / 2));
  private cdv = new Float32Array((GRID_SIZE / 2) * (GRID_SIZE / 2));
  /** Which plate this is: 0 is the live plate, the rest run behind it as a background loop. */
  layerIndex = 0;
  /**
   * This plate's dice, carried on the fluid (PLAN.md §6): every splat a look
   * is laid with, every spray, splatter and streak the automation pours, and
   * every satellite drop of a press draws from `plate.fluid.<layer>`.
   *
   * One stream per layer rather than one for the solver, because the layers
   * run side by side: the second plate's Fillmore wash would otherwise take
   * its numbers out of the middle of the first plate's sequence, and turning
   * on a second layer would move every drop on the first. Looked up by the
   * layer rather than fixed at construction because `layerIndex` is assigned
   * after the constructor runs. Replacing `Math.random()` here was a straight
   * substitution — each helper draws exactly once, in the same order — so
   * the only thing that changed about a laid look is which numbers it drew.
   */
  private dice: Rng | null = null;
  private diceLayer = -1;
  get rng(): Rng {
    if (this.diceLayer !== this.layerIndex) { this.dice = stream(`plate.fluid.${this.layerIndex}`); this.diceLayer = this.layerIndex; }
    return this.dice!;
  }

  // ── GPU solver attachment ──
  // When `gpu` is set, the arrays above hold *deltas* — what the CPU-side
  // writers added since the last step — and `gap` holds gap deltas. They are
  // flushed into the high-res field each step and zeroed. Readers use the
  // read* accessors, which serve a 192² downsample of the GPU field.
  gpu: PlateSolver | null = null;
  /** lib/deltaRows.ts: `dirty = true` is every row. */
  private rows = new DeltaRows(GRID_SIZE);
  private get dirty() { return this.rows.any; }
  private set dirty(v: boolean) { if (v) this.rows.whole(); else this.rows.clear(); }
  /** The solver holds video frames for the next flush (pourVideoFrame). */
  private videoLaid = false;
  private mul: Float32Array;        // multiplicative dye change (a carry's take; the show's own puffs thin by 0.8)
  /** The press being held (its spoke seed) and how many steps it has run, for the pile at the fingers' tips. */
  private squishSteps = 0;
  private squishLastAt = 0;
  private squishLastStep = -1;
  /**
   * The press's memory, for the lift (lib/squish.ts): where the last press
   * was, how deep it went and when it let go, so that the glass coming back
   * up can break the rim it left into fingers. Public for the phone's
   * check (`npm run phone`), which reads it and `lastLift` to see a lift
   * run where the finger was.
   */
  readonly pressLift = new PressLifts();
  /** Cells each presser (lib/squish.ts Presser) has pressed on this plate, and how deep, summed over them. */
  readonly pressedCells: Record<Presser, number> = { hand: 0, kick: 0, bubble: 0 };
  readonly pressedDepth: Record<Presser, number> = { hand: 0, kick: 0, bubble: 0 };
  /**
   * Beat Squeeze's kicks, given back (lib/squish.ts `KickRelease`): each
   * kick's press is held a moment and then let go over a third of a second,
   * or the lead plate's middle goes to the floor a few seconds into a song.
   * Public for `npm run squeeze`, which reads how many release steps it laid.
   */
  readonly kickRelease = new KickRelease();
  /**
   * Beat Squeeze's rhythm sheet, solved (lib/sheet.ts, PLAN 27f-4): off the
   * frame-moving looks on a thin gap a kick is a fingertip on this sheet,
   * and the sheet's own motion, held and let go, is what the gap is laid
   * each step (`sheetGap`, through its own channel). Public for `npm run sheet`.
   */
  readonly sheet = new RhythmSheet();
  /** The sheet's change this step on the plate's grid, and whether anything is in it. */
  private sheetGap: Float32Array | null = null;
  private sheetLaid = false;
  /** Sound Drive's bass, as a hand on the glass (lib/squish.ts `BassPress`, PLAN 27e). */
  readonly bassPress = new BassPress();
  /** The last lift this plate laid: where, and how many cells it touched. */
  lastLift: { x: number; y: number; cells: number } | null = null;
  /** Forget the last press, as a fresh plate has none: a song render starts here, on its own clock. */
  forgetPress(): void { this.squishSteps = 0; this.squishLastAt = 0; this.squishLastStep = -1; this.pressLift.forget(); this.kickRelease.forget(); this.sheet.forget(); this.bassPress.forget(); this.lastLift = null; }
  /**
   * Forget everything this plate carries from one frame to the next that is
   * not the liquid itself: a song render starts here (VisualizerRender.begin),
   * after the solver is rebuilt and the look laid.
   *
   * The render made twice with the same seed on CI's Mac differed on every
   * frame from the first (`npm run render-app`: "240 of 240 frames differ"),
   * and these are the plate's share of why. Each of them was written by the
   * live show in the frames before the render and read by the render's first
   * step, so the first frame of a film depended on what the evening had been
   * doing a moment before it:
   *
   *   - `clockLean`, the phrase's slow lean on the timestep (slewed over 2.5
   *     s, so it is never quite where the render's reset phrase would put
   *     it): every step's `dt` is multiplied by it;
   *   - `plateAngle` and the dish's spin, which the frame sets only after
   *     the solver has stepped, so the render's first steps read the live
   *     plate's angle (gravity's direction) and spin (the swirl) rather than
   *     the ones the look was just laid with;
   *   - the bubbles' bookkeeping (`prevPacked`, `coverPacked`, the holes
   *     still filling, the mirror's sequence the rim deposit keys on): the
   *     bubbles are cleared with the look, and a list of last frame's bubbles
   *     that is not cleared with them reads as every one of them popping at
   *     once, whose holes are then filled from the render's own plate at the
   *     live bubbles' positions;
   *   - the mean density the dye regulator reads before the render's first
   *     readback lands, the step counter a press counts by, and the last
   *     step's parameters.
   *
   * `angle` is the angle the look was laid at (`rotationAnglesRef`), and
   * `viewHalfW`/`viewHalfH` the film's own framing: see the frame's rotation
   * block for why a render frames by its canvas, not by the window.
   */
  forgetHistory(angle: number, viewHalfW: number, viewHalfH: number): void {
    this.forgetPress();
    this.clockLean = 1;
    this.dishSpin = 0;
    this.liquidSpin = 0;
    this.plateAngle = angle;
    this.viewHalfW = viewHalfW;
    this.viewHalfH = viewHalfH;
    this.tiltX = 0; this.tiltY = 0; this.rockX = 0; this.rockY = 0; this.coverX = 0; this.coverY = 0;
    this.phrase = { drive: 1, gust: 0, drift: 0.5 };
    this.tempoMul = 1;
    this.paceMul = 1;
    this.stepIndex = 0;
    this.meanDensity = 0;
    this.meanColor = [0, 0, 0];
    this.lastSettings = null;
    this.lastStep = null;
    this.cellClock = 0;
    this.rbSeq = 0;
    this.rimSeq = -1;
    this.prevCount = 0;
    this.coverCount = 0;
    this.fillingHoles = [];
  }
  /**
   * The dye's own travel, counted in plate-seconds at the default Advection
   * and wrapped (lib/detailFlow.ts): the clock the closeup's drawn cells
   * slide and breathe on, so they go exactly as far as the paint did.
   */
  cellClock = 0;
  /** Solver steps taken since the last `forgetHistory`: for a render's per-frame digest. */
  get stepCount(): number { return this.stepIndex; }
  /** Solver steps taken, so per-press counting is per step, not per call. */
  private stepIndex = 0;
  private dyeAdd: Float32Array;     // interleaved upload buffers
  private velAdd: Float32Array;
  /** The fingers in the liquid this step on a thin gap (lib/handSolid.ts), made when one first touches it. */
  private hands: Float32Array | null = null;
  private handsLaid = false;
  /** A Blow's wind on a thin gap this step, as the air's stress on the surface (lib/breath.ts), made at the first breath. */
  private breath: Float32Array | null = null;
  private breathLaid = false;
  /** Whether the last blowWind blew as air on the film (PLAN 15g) rather than by the carries: `npm run tools` counts it. */
  lastBlowAired = false;
  /*
    How many readbacks have landed. The rim deposit needs it: the mirror
    refreshes only when `readbackAsync` has something, and depositing from a
    mirror that has not moved puts the same displaced dye back twice — which
    measured as a plate 4-8% *over* its control and a popped bubble
    refilling to 124% of what had been there.
  */
  private rbSeq = 0;
  /**
   * Readbacks landed, for a check to know the mirror is live without asking
   * the thing it measures. `npm run phone` used to take "the dye changed" as
   * proof of readbacks, so fingers that laid no dye read as "no readbacks
   * here" and skipped instead of failing.
   */
  get readbacks(): number { return this.rbSeq; }
  /**
   * The dye readback a hand's move must wait for: one copied after its last
   * move reached the plate.
   *
   * Press and Finger move dye by reading how much is under the hand from the
   * readback mirror, taking it out with a multiply and putting it down
   * elsewhere. They ran every step, several a frame, and the mirror is a frame
   * or two old, so each step read the dye the steps before had already moved
   * and put it down again: the multiply compounded and the deposit repeated.
   * npm run tools measured it: Finger 159 -> 566 and Press 89 -> 206 against
   * -4 and -10 for the same pool left alone. Now each acts once per reading
   * that already includes its last move, and takes more when it does.
   */
  private dyeMoveAfter = 0;
  /** The Press's oil and the Blow's (squeezeOut, blowWind), once a dye reading. */
  private oilPressAfter = 0;
  /*
    A move not yet handed to the GPU. The reading to wait for was counted
    from the move, two copies on, on the grounds that the deltas go across at
    the next step. But a frame can run no step at all (the loop steps at its
    own rate), and the copies go on being issued once a frame while the move
    waits on the CPU, so two on could still be a reading from before it: the
    Finger read dye it had already carried, put it down again, and the plate
    gained (CI: 327 -> 569 against +75 left alone, on a commit that did not
    touch it). So the count starts when the deltas actually go: the first
    copy issued after that flush is submitted after it, and holds the move.
  */
  private dyeMovePending = false;
  private dyeMirrorCurrent(): boolean {
    return !!this.gpu && !this.dyeMovePending && this.gpu.rbDyeLanded >= this.dyeMoveAfter;
  }
  private dyeMoved(): void {
    if (this.gpu) this.dyeMovePending = true;
  }
  private rimSeq = -1;
  /*
    Whether the attached solver has handed anything back yet, and what it was
    seeded with (docs/stability-plan.md, S3).

    From the moment a solver is attached until its first readback lands, the
    plate exists in one place only: the GPU. The CPU arrays have been flushed
    into it and zeroed, and the solver's readback copy is still the zeros it
    was allocated as. Two rung changes inside that window — the governor
    stepping twice, or an out-of-memory step straight after a climb — read
    those zeros back as the plate and carried a blank field into the next
    solver while the show ran on. So the opening state is kept, and a solver
    that is swapped out before it has spoken gives that back instead.
  */
  private gpuLanded = false;
  private seed: Float32Array[] | null = null;
  /*
    The liquids that never cross to the CPU (the ferrofluid, the mix, the
    reactions), handed from the last solver to this one (PLAN 9w; handOver
    in gpu/fluid.ts says why a copy on the GPU). Kept until this solver's
    first readback lands, for the same reason as the seed above: a solver
    swapped out before it has spoken (out of memory straight after a climb,
    or a second move inside a frame or two) hands the next one this, not
    whatever it managed in a frame: on a solver that ran out of memory that
    would be a copy of textures that were never made.
  */
  private carry: SolverCarry | null = null;
  private carried = false;
  /**
   * Whether the attached solver opened on what the one before it handed
   * over. The frame loop lays a look's ferrofluid on a new solver only when
   * it did not: a solver that opened on the last one's plate already has
   * the plate's ferrofluid, or none because there was none.
   */
  get openedOnCarry(): boolean { return this.carried; }
  /** Last frame's bubbles, for spotting the ones that have popped. */
  private prevPacked = new Float32Array(0);
  private prevCount = 0;
  /**
   * The bubbles as they stood at the last rim deposit, live ones only: a
   * cell a bubble already covered then has had its dye moved to the rim
   * once, and is not counted again.
   */
  private coverPacked = new Float32Array(0);
  private coverCount = 0;
  /** Holes still closing: carried so the fill converges instead of running once. */
  private fillingHoles: { at: Float32Array; left: number }[] = [];
  private rbDensity: Float32Array;  // downsampled readback
  private rbVx: Float32Array;
  private rbVy: Float32Array;
  private fvx: Float32Array;
  private fvy: Float32Array;
  private mcA: Float32Array;        // MacCormack intermediates (CPU path)
  private mcB: Float32Array;
  /** What the plate is being asked to do this moment; set from outside once a frame. */
  phrase: Phrase = { drive: 1, gust: 0, drift: 0.5 };
  /** The clock's own lean, slewed so no one frame can move it far. */
  private clockLean = 1;
  get clockLeanNow(): number { return this.clockLean; }
  /** Wall-clock seconds this step covers, for smoothing that means the same thing at any frame rate. */
  dtSeconds = 1 / 60;
  /*
    The automation's headroom for a thick bottle (lib/liquidPhase.ts,
    gpuShare) reads the GPU's poured share, since on a thin gap nothing
    fades it (PLAN 18d-2). Read about once a second, never two at once: the
    share moves only as fast as pours and the rim change it, and a read is
    the species field downsampled to the CPU's grid, about 600 KB.
  */
  private shareSteps = 0;
  private shareReading = false;
  private readPouredShare(): void {
    const g = this.gpu;
    if (!this.liquid.thickOnGpu || !g?.speciesShare) { this.liquid.gpuShare = null; return; }
    if (this.shareReading || ++this.shareSteps < 60) return;
    this.shareSteps = 0;
    this.shareReading = true;
    g.speciesShare()
      .then((share) => { this.liquid.gpuShare = share; }, () => { /* a lost device: the next read tries again */ })
      .finally(() => { this.shareReading = false; });
  }
  /** How much faster or slower the music wants this plate than its look (see `lib/tempoPace.ts`); set by the frame. */
  tempoMul = 1;
  /** A paced scene's activity (`lib/scenePacing.ts`): under 1 a rest, over it a swell; set by the frame. */
  paceMul = 1;
  /** A channel's pre-sharpening copy, so the pass reads the field it is rewriting. */
  private shp: Float32Array;
  /** The thickness as the sharpening pass found it: every channel gates on this. */
  private shpA: Float32Array;

  get readDensity(): Float32Array { return this.gpu ? this.rbDensity : this.density; }
  // The flow the dye was carried by this step (see GpuFluid.velForced): on the
  // CPU, the snapshot taken before the end-of-step clamp.
  get readVx(): Float32Array { return this.gpu ? this.rbVx : this.fvx; }
  get readVy(): Float32Array { return this.gpu ? this.rbVy : this.fvy; }

  constructor(size: number, diffusion: number, viscosity: number, dt: number) {
    this.size = size;
    this.dt = dt;
    this.diff = diffusion;
    this.visc = viscosity;
    /*
      A pour reaches the GPU's own fields as well (docs/physics-plan.md): oil
      and silicone into the oil, soap into the surfactant, acid and base into
      the acidity. Only into a field whose effect is on, so a look that doses
      soap for what it already does pays nothing for the passes that would
      move it.
    */
    this.liquid.onDeposit = (cx, cy, radius, what, amount, seconds) => {
      const g = this.gpu;
      const s = this.lastSettings;
      if (!g || !s || amount <= 0) return;
      /*
        A magnetic liquid pours into the second phase, where it lands and
        nowhere else. The phase is additive and full at 1, so a held drop
        builds a pool over a few steps rather than filling it at once.
      */
      if ((what.magnetic ?? 0) > 0 && g.addPhase) {
        const L = this.size;
        g.addPhase(cx / L, cy / L, Math.max(1.5, radius * 1.4) / L, 0.25 * Math.min(1, what.magnetic ?? 0) * Math.min(1, amount));
      }
      /*
        A clear film on the plate (PLAN §20b): a solvent (alcohol, or soap)
        lands in it and opens a hole, and clear oil joins it, thickening it
        where it lands, rather than going into the mix as well (the film is
        that oil). Nothing while there is no film.
      */
      const filmOn = this.layerIndex === 0 && (s.clearFilm ?? 0) > 0.001 && !!g.addFilm;
      const clearOil = !(what.magnetic ?? 0) ? Math.max(0, -(what.polarity ?? 0) - 0.5) * 2 * Math.min(1, amount) : 0;
      if (filmOn) {
        const solvent = Math.max(what.solvent ?? 0, what.soap ?? 0) * Math.min(1, amount);
        const L = this.size;
        if (solvent > 0 || clearOil > 0) g.addFilm!(cx / L, cy / L, Math.max(1.5, radius) / L, { film: FILM_POUR * Math.min(1, clearOil), solvent });
      }
      /*
        On a thin gap every bottle's pour is volume (PLAN 18c): it pushes the
        liquid already there out of its way, radially, and what reaches the
        rim leaves the dish. A liquid of its own that mixes with the clear
        one (glycerine, syrup, milk, alcohol) also lands in the species field
        as its share of the column, and the thin gap's drag takes its own
        viscosity from there (PLAN 18d, lib/liquidProps.ts); a clear-liquid
        pour dilutes what it lands in. A held bottle puts down what its
        stream lets go in the step, a one-shot dose its amount (pourShare).
        Only on a thin gap: the old plate has no volume to push and no
        viscosity a cell to give it.
      */
      if (this.thinGap && g.pour) {
        const L = this.size;
        const r = Math.max(1.5, radius) / L;
        g.pour(cx / L, cy / L, r, pourShare(r, amount, seconds), speciesOf(what));
      }
      if (('active' in what) && (g as any).addActive) {
        (g as any).addActive(cx / this.size, cy / this.size, Math.max(1.5, radius) / this.size, (what.active as number) * amount);
      }
      if (('reagent' in what) && g.addReagent) {
        g.addReagent(cx / this.size, cy / this.size, Math.max(1.5, radius) / this.size, (what.reagent as number) * amount, s.chemistryPattern ?? 0);
      }
      if (!g.addMix) return;
      const oilOn = (s.oilTension ?? 0) > 0.001;
      let oil = oilOn && !filmOn ? clearOil : 0;
      const soap = (s.surfactantFlow ?? 0) > 0.001 ? (what.soap ?? 0) * Math.min(1, amount) : 0;
      const acid = (s.phIndicator ?? 0) > 0.001 ? (what.acid ?? 0) * Math.min(1, amount) : 0;
      const L = this.size;
      /*
        With Oil Bodies a pour of oil is a body: full to a sharp edge and
        the size of what a dropper lets go (BODY_DROP times the bottle's
        radius, less for a gentler dose), until the plate is BODY_COVER oil.
        Without it a dose is a thin film a few cells across, a quarter to
        four fifths full, which Cahn–Hilliard either dissolves back into the
        water or leaves as a speck: there was never a body on the plate for
        a colour to keep to. The soap and the acid in the same bottle land
        as they always did.
      */
      if (oil > 0 && (s.oilBodies ?? 0) > 0.001) {
        const room = 1 - (g.oilCover ?? 0) / BODY_COVER;
        if (room > 0) {
          const r = Math.max(1.5, radius) * BODY_DROP * Math.sqrt(Math.min(1, oil) * Math.min(1, room + 0.25));
          g.addMix(cx / L, cy / L, r / L, { oil: 1 });
        }
        oil = 0;
      }
      
      if (g.addLiquidDrop) {
        g.addLiquidDrop(cx / L, cy / L, Math.max(1.5, radius) / L, what, amount, seconds);
      }
      
      if (oil <= 0 && soap <= 0 && acid === 0) return;
      g.addMix(cx / L, cy / L, Math.max(1.5, radius) / L, { oil, soap, acid });
    };

    this.s = new Float32Array(GRID_AREA);
    this.sR = new Float32Array(GRID_AREA);
    this.sG = new Float32Array(GRID_AREA);
    this.sB = new Float32Array(GRID_AREA);
    this.density = new Float32Array(GRID_AREA);
    this.densityR = new Float32Array(GRID_AREA);
    this.densityG = new Float32Array(GRID_AREA);
    this.densityB = new Float32Array(GRID_AREA);

    this.vx = new Float32Array(GRID_AREA);
    this.vy = new Float32Array(GRID_AREA);
    this.vx0 = new Float32Array(GRID_AREA);
    this.vy0 = new Float32Array(GRID_AREA);

    this.pressure = new Float32Array(GRID_AREA);
    this.gap = new Float32Array(GRID_AREA).fill(0.03);
    this.dhdt = new Float32Array(GRID_AREA);

    this.temp = new Float32Array(GRID_AREA);
    this.temp0 = new Float32Array(GRID_AREA);

    this.mul = new Float32Array(GRID_AREA).fill(1);
    this.dyeAdd = new Float32Array(GRID_AREA * 4);
    this.velAdd = new Float32Array(GRID_AREA * 4);
    this.rbDensity = new Float32Array(GRID_AREA);
    this.rbVx = new Float32Array(GRID_AREA);
    this.rbVy = new Float32Array(GRID_AREA);
    this.fvx = new Float32Array(GRID_AREA);
    this.fvy = new Float32Array(GRID_AREA);
    this.mcA = new Float32Array(GRID_AREA);
    this.mcB = new Float32Array(GRID_AREA);
    this.shp = new Float32Array(GRID_AREA);
    this.shpA = new Float32Array(GRID_AREA);
  }

  // ── GPU solver lifecycle ───────────────────────────────────────────

  /** Move the simulation onto the GPU. Whatever the CPU arrays hold becomes the opening state. */
  attachGpu(gpu: PlateSolver) {
    if (this.gpu) this.releaseGpu();      // resolution change: carry the field across
    this.gpu = gpu;
    gpu.clear();
    this.carried = !!this.carry && !!gpu.takeOver?.(this.carry);
    // Its readings count from nothing again, and whatever was pending went with the last solver.
    this.dyeMoveAfter = 0; this.dyeMovePending = false; this.oilPressAfter = 0;
    this.keepSeed();
    this.gpuLanded = false;
    // Absolute state → opening delta. The gap is absolute at rest (0.03).
    for (let i = 0; i < GRID_AREA; i++) this.gap[i] -= 0.03;
    this.dhdt.fill(0);
    this.mul.fill(1);
    this.dirty = true;
    // Readers see the CPU state until the first readback lands
    this.rbDensity.set(this.density);
    this.rbVx.set(this.vx);
    this.rbVy.set(this.vy);
  }

  /** Bring the field back to the CPU arrays and release the GPU solver. */
  detachGpu(handOver = true) {
    if (!this.gpu) return;
    this.releaseGpu(handOver);
    this.gpu = null;
  }

  /**
   * The plate off the attached solver before it goes: the dye and the flow
   * to the CPU arrays, the rest as a carry for the next solver (handOver),
   * unless there is no next solver to take one (`handOver` false: going to
   * no solver at all, or to a render that lays its own plate). A solver that
   * has not spoken keeps the carry it was handed, as above.
   */
  private releaseGpu(handOver = true) {
    const gpu = this.gpu!;
    this.pullStateFromGpu();
    if (!handOver) this.forgetCarry();
    else if (!(this.carry && !this.gpuLanded)) {
      const next = gpu.handOver?.() ?? null;
      if (next) {
        this.carry?.destroy();
        this.carry = next;
      }
    }
    gpu.dispose();
  }

  /** Let a held carry go: nothing will take it (a plate removed, a render's fresh plate). */
  forgetCarry() {
    this.carry?.destroy();
    this.carry = null;
  }

  /**
   * Release the GPU solver without a readback — the context is going away.
   *
   * With `keepPlate`, the plate survives it (S1). The device is gone, but
   * the last readback it sent is ordinary memory on this side, a frame or two
   * old, and so is the seed a solver that never spoke was started from: the
   * field goes back into the CPU arrays, and the next solver opens on it
   * instead of on a freshly laid look. False when there was nothing to keep.
   */
  dropGpu(keepPlate = false): boolean {
    const gpu = this.gpu;
    let kept = false;
    if (gpu && keepPlate) {
      kept = this.gpuLanded ? this.restoreFrom(gpu.rbDyeView, gpu.rbVelView) : this.restoreSeed();
    }
    gpu?.dispose();
    this.gpu = null;
    return kept;
  }

  /** The state a new solver opens on, kept for `restoreSeed`. */
  private keepSeed() {
    const src = [this.densityR, this.densityG, this.densityB, this.density, this.vx, this.vy, this.temp];
    if (!this.seed) this.seed = src.map(() => new Float32Array(GRID_AREA));
    for (let k = 0; k < src.length; k++) this.seed[k].set(src[k]);
  }

  /** Put the attached solver's opening state back; for a solver that never handed anything back. */
  private restoreSeed(): boolean {
    if (!this.seed) return false;
    const dst = [this.densityR, this.densityG, this.densityB, this.density, this.vx, this.vy, this.temp];
    for (let k = 0; k < dst.length; k++) dst[k].set(this.seed[k]);
    this.restAfterRestore();
    return true;
  }

  /**
   * The plate from a readback, into the CPU arrays. Anything not finite is
   * zeroed on the way: a plate carried across a rebuild must not carry across
   * whatever broke the one before it.
   */
  private restoreFrom(dye: Float32Array, vel: Float32Array): boolean {
    const clean = (v: number) => (Number.isFinite(v) ? v : 0);
    for (let i = 0; i < GRID_AREA; i++) {
      this.densityR[i] = clean(dye[i * 4]);
      this.densityG[i] = clean(dye[i * 4 + 1]);
      this.densityB[i] = clean(dye[i * 4 + 2]);
      this.density[i] = clean(dye[i * 4 + 3]);
      this.vx[i] = clean(vel[i * 4]);
      this.vy[i] = clean(vel[i * 4 + 1]);
      this.temp[i] = clean(vel[i * 4 + 2]);
    }
    this.restAfterRestore();
    return true;
  }

  /** The CPU arrays hold absolute state again: the gap at rest, nothing pending. */
  private restAfterRestore() {
    this.gap.fill(0.03);
    this.dhdt.fill(0);
    this.pressure.fill(0);
    this.mul.fill(1);
    this.dirty = false;
    this.dyeMovePending = false;
  }

  /** Once per rendered frame: refresh the readback the CPU-side readers use. */
  syncFromGpu() {
    if (!this.gpu) return;
    // One frame of latency instead of a pipeline stall every frame.
    if (!this.gpu.readbackAsync()) return;
    this.gpuLanded = true;
    // This solver has spoken, and has whatever it was handed: the copies can go.
    if (this.carry) { this.carry.destroy(); this.carry = null; }
    const dye = this.gpu.rbDyeView, vel = this.gpu.rbVelView;
    let sum = 0, sr = 0, sg = 0, sb = 0;
    // The rim's cells, a mask made once (PLAN 14ab-3), not a test a cell a frame.
    const rim = this.thinGap ? rimMask(this.size) : null;
    const S = this.size;
    let count = 0;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const idx = i + j * S;
        const d = dye[idx * 4 + 3];
        this.rbDensity[idx] = d;
        this.rbVx[idx] = vel[idx * 4];
        this.rbVy[idx] = vel[idx * 4 + 1];
        if (rim && !rim[idx]) continue;
        sum += d;
        sr += dye[idx * 4]; sg += dye[idx * 4 + 1]; sb += dye[idx * 4 + 2];
        count++;
      }
    }
    const area = count > 0 ? count : GRID_AREA;
    this.meanDensity = sum / area;
    this.meanColor = [sr / area, sg / area, sb / area];
    this.rbSeq++;
  }

  /** Number of grid cells inside the circular dish rim (r < OPEN_RIM = 0.5) on a thin gap. */
  private get dishArea(): number { return rimCount(this.size); }

  private pullStateFromGpu() {
    const gpu = this.gpu!;
    // Nothing has come back from this solver yet: its readback is still the
    // zeros it was allocated as, so the plate is the seed it opened on (S3).
    // Whatever was added in the frame or two since is let go — a blank plate
    // is not.
    if (!this.gpuLanded && this.restoreSeed()) return;
    if (this.dirty || this.videoLaid) this.flushDeltas(this.dt || 0.01);
    const { dye, vel } = gpu.readback();
    for (let i = 0; i < GRID_AREA; i++) {
      this.densityR[i] = dye[i * 4];
      this.densityG[i] = dye[i * 4 + 1];
      this.densityB[i] = dye[i * 4 + 2];
      this.density[i] = dye[i * 4 + 3];
      this.vx[i] = vel[i * 4];
      this.vy[i] = vel[i * 4 + 1];
      this.temp[i] = vel[i * 4 + 2];
    }
    this.gap.fill(0.03);
    this.dhdt.fill(0);
    this.pressure.fill(0);
    this.mul.fill(1);
    this.dirty = false;
  }

  /** The written rows to the GPU, then zeroed (lib/deltaRows.ts). */
  private flushDeltas(dt: number) {
    // For the video's frames alone no row is sent (`rows()` would say all).
    const gpu = this.gpu!, rows = this.rows.any ? this.rows.rows() : this.rows.mask;
    this.videoLaid = false;
    const a = { ...this.dyeTarget(), vx: this.vx, vy: this.vy, temp: this.temp, gap: this.gap, dyeAdd: this.dyeAdd, velAdd: this.velAdd, hands: this.handsLaid ? this.hands : null, breath: this.breathLaid ? this.breath : null };
    const runs = packRows(a, rows);
    gpu.applyDeltas(a.dyeAdd, a.velAdd, a.mul, dt, a.hands, a.breath, this.sheetLaid ? this.sheetGap : null, rows);
    if (this.dyeMovePending) { this.dyeMovePending = false; this.dyeMoveAfter = gpu.rbDyeIssued + 1; }
    restRows(a, runs);
    this.handsLaid = this.breathLaid = false;
    if (this.sheetLaid) { this.sheetGap!.fill(0); this.sheetLaid = false; }
    this.dirty = false;
  }

  /**
   * The dye a press squeezes out, put where it goes: a ring around the palm.
   *
   * Everything in the solver was tried first and each was measured. More
   * strength — seventy-five times — moved the same 1%. So did slower springs,
   * the solver's own clamp, and the squeeze entered as a source in the
   * divergence the projection solves. The film itself is fine: the gap
   * collapses from 0.030 to 0.004 under the palm at a rate of 166. The
   * velocity under the palm stays at **0.97x idle**. Nothing downstream of the
   * film carries the result.
   *
   * That is the same finding as the bubbles, twice over. A source in the
   * divergence is a weak instrument here because the transport cannot carry
   * it; and anything driven by a *gradient* does nothing in a uniform middle,
   * which is exactly what a pressed disc is — the gap is at its floor
   * everywhere under the palm, so there is no slope to push along.
   *
   * So the dye is moved here, where the palm's position and size are known
   * rather than inferred from a field. It is the same operator that fills a
   * popped bubble, run the other way: take a share of what is under the palm
   * and put it in the annulus outside, conserving by construction because both
   * halves read the same mirror.
   */
  squeezeOut(cx: number, cy: number, radius: number, amount: number): void {
    /*
      Not on a thin gap (PLAN §18a): there the flow does what this was
      written to stand in for. The glass closing pushes the liquid out with
      its colour and its oil, and the glass coming back up draws them back
      in, which a carry here could never do: it took the colour out to a
      ring and nothing ever brought it home, so a press only pushed things
      away (the owner, 2026-09-28: "it just pushes everything out instead of
      bringing it back when you release"). On top of the flow it moved the
      colour out twice and back once.
    */
    if (this.thinGap) return;
    if (!this.gpu || !this.dyeMirrorCurrent()) return;
    const N = this.size;
    const R = Math.max(2, radius);
    // How much of what is under the palm goes, this press (pressRing.ts).
    const take = pressTake(amount);
    /*
      With Oil Bodies the oil goes with its colour (PLAN 15d): the same share
      of every cell, landed on the same cell of the ring as the colour it
      carried (pressMix; pressDye below is the same map on the CPU). Without
      it a press drew a body's colour out into the water and left the oil
      where it was, colourless. Before the dye's own early return, so a body
      the old fault already left clear can still be pressed out, and on its
      own clock, once a dye reading as the dye's is: with no colour under the
      palm the dye never marks its move pending, so without this the oil
      would be pressed every step at a share sized for one press a reading.
    */
    if ((this.lastSettings?.oilBodies ?? 0) > 0.001 && this.gpu.rbDyeLanded >= this.oilPressAfter) {
      pressOil(this.gpu, cx, cy, R, N, take);
      this.oilPressAfter = this.gpu.rbDyeIssued + 1;
    }
    const out = { mul: this.mul, density: this.density, densityR: this.densityR, densityG: this.densityG, densityB: this.densityB };
    if (!(pressDye(this.gpu.rbDyeView, N, cx, cy, R, take, out) > 1e-4)) return;
    this.dirty = true;
    this.dyeMoved();
  }

  /**
   * Dye lifted off the plate, softly, over a patch.
   *
   * Evolving only ever *added*: drops, blows and the occasional flood, with
   * nothing taking any away except the global dye budget, which thins the
   * whole plate at once when it is over. So an evolving plate filled up and
   * the only variety left was which colour arrived next.
   *
   * This is the other half — a patch going pale, the way a dish does where
   * the lamp is hottest or where a rag has been over it. It is a multiply,
   * which destroys what it removes, and that is the point: H6 · A wanted a
   * bubble to *displace* dye and a multiply was the bug there. Here the dye
   * is meant to leave.
   *
   * Soft-edged, because a disc with a hard rim reads as a wipe with a
   * stencil. `keep` is what survives in the middle, rising to 1 at the rim.
   */
  thinPatch(cx: number, cy: number, radius: number, keep: number): void {
    const N = this.size;
    const R = Math.max(2, radius);
    const k = Math.max(0, Math.min(1, keep));
    const yl = Math.max(0, Math.floor(cy - R)), yh = Math.min(N - 1, Math.ceil(cy + R));
    const xl = Math.max(0, Math.floor(cx - R)), xh = Math.min(N - 1, Math.ceil(cx + R));
    for (let y = yl; y <= yh; y++) {
      for (let x = xl; x <= xh; x++) {
        const d = Math.hypot(x - cx, y - cy) / R;
        if (d >= 1) continue;
        const fall = (1 - d) * (1 - d);
        this.mul[x + y * N] *= 1 - (1 - k) * fall;
      }
    }
    this.dirty = true;
  }

  /**
   * The dye a bubble displaces, put back as a ring around it (H6 · A).
   *
   * The exclusion on the GPU is a multiply, because it is the only operator
   * that reaches the middle of a bubble — every gradient-driven one is zero
   * where the air is uniform, which is measured in `bubbles-plan.md`. A
   * multiply destroys what it removes, and that was measured too: the plate
   * drained to 83% of its dye in twenty seconds with one bubble on it, and a
   * popped bubble refilled to 20% of what had been there and stopped. A
   * permanent scar is worse than the shading H6 exists to replace.
   *
   * So the mass goes back, as a ring just outside the rim, which is where a
   * bubble in a thin layer really does push it. Two things make this cheap
   * rather than the three blur passes it first looked like:
   *
   * The mirror is a frame behind, and that is exactly right. On the frame a
   * bubble arrives the mirror still holds the dye the GPU is removing this
   * frame, so the disc total *is* the mass to redeposit. A frame later the
   * mirror shows the emptied disc and there is nothing to move, which is
   * also right — the bubble has already taken what was under it.
   *
   * And both halves read the same mirror, so it conserves by construction
   * rather than by a servo. A servo was tried: the plate's dye-budget loop
   * made symmetric, which never engaged, because the deficit term is
   * quadratic and a 10% shortfall contributes 0.0001.
   */
  depositBubbleRims(packed: Float32Array, count: number): void {
    if (!this.gpu) return;
    // Once per mirror, not once per frame: see `rbSeq`.
    if (this.rbSeq === this.rimSeq) return;
    this.rimSeq = this.rbSeq;
    // A cleared list is not nothing to do: every bubble that was there has
    // popped, and each one's hole has to be filled back in.
    if (count <= 0 && this.prevCount <= 0) return;
    const dye = this.gpu.rbDyeView;
    const N = this.size;
    for (let k = 0; k < count; k++) {
      // The packed block, because it carries the fade as its opacity and the
      // Bubble record does not — a bubble part-way in has taken part of the
      // dye, and the ring has to match or the plate gains colour.
      const o = k * 4;
      const b = { x: packed[o] * N, y: packed[o + 1] * N, r: packed[o + 2] * N, opacity: packed[o + 3] };
      // The bubble list is in logical cells already, which is the grid the
      // mirror and the deltas are both on, so nothing is mapped.
      const R = b.r;
      if (!(R > 0.7) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
      const clear = Math.max(0, Math.min(1, b.opacity));
      if (clear < 0.02) continue;
      /*
        Only cells it did not already cover at the last deposit.

        The mirror is a few frames behind the GPU, which has already taken the
        dye out from under the bubble as it stood then. A bubble sitting still
        or drifting shows that as nothing under it; a bubble growing fast (the
        straw's) covers, deposit after deposit, cells the mirror still shows
        full, and the same dye went to the rim once per deposit: the Blow's
        bubble turned 36 of dye into 358 in the tools check. Each cell's dye
        now goes to the rim once, the first time the bubble covers it.

        And what a bubble covers by growing goes to the rim not at all: its
        own flow has already taken it there. The air arriving is a source in
        the projection (the divergence pass, wgsl/fluid.ts), so a growing
        bubble pushes the liquid and its dye out ahead of its edge, and the
        multiply finds next to nothing left to remove. Measured in the lab
        with the straw's own growth (bubbles.ts, blow: to 0.047 of the plate
        in 1.5 s, fingers and all) on a pool of 834 and no deposit at all,
        the plate kept its dye: 834 -> 827. The same growth with this deposit
        emulated as the app runs it made 50 to 74 more (+7 to +10%), all of
        it laid round the bubble, and more the staler the mirror: the Blow's
        "pushes it out to the rim rather than making more" read 494 -> 920
        on CI's Mac. A bubble that appears where it was not, or moves onto
        dye, is not the same: the multiply takes what is under it before
        any flow has moved it (the lab: -12.6% for a bubble put down whole,
        -10.4% for one drifting across a pool, with no deposit), and that is
        what the ring is for. So a bubble that was here at the last deposit
        counts only the cells it has moved onto at the size it was then; the
        ring it has grown into is the flow's.
      */
      let was: { x: number; y: number; r: number } | null = null;
      for (let j = 0; j < this.coverCount; j++) {
        const q = j * 4;
        const px = this.coverPacked[q] * N, py = this.coverPacked[q + 1] * N, pr = this.coverPacked[q + 2] * N;
        if (Math.hypot(px - b.x, py - b.y) < Math.max(2, R * 0.5) && (!was || pr > was.r)) was = { x: px, y: py, r: pr };
      }
      const reach = was ? Math.min(R, was.r) : R;
      let mass = 0, aR = 0, aG = 0, aB = 0;
      const lo = Math.max(0, Math.floor(b.y - R)), hi = Math.min(N - 1, Math.ceil(b.y + R));
      const xl = Math.max(0, Math.floor(b.x - R)), xh = Math.min(N - 1, Math.ceil(b.x + R));
      for (let y = lo; y <= hi; y++) {
        for (let x = xl; x <= xh; x++) {
          const dx = x - b.x, dy = y - b.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          if (was && (x - was.x) * (x - was.x) + (y - was.y) * (y - was.y) <= was.r * was.r) continue;
          const i4 = (x + y * N) * 4;
          const d = dye[i4 + 3];
          if (!(d > 1e-5)) continue;
          mass += d * clear;
          aR += dye[i4] * clear; aG += dye[i4 + 1] * clear; aB += dye[i4 + 2] * clear;
        }
      }
      if (!(mass > 1e-4)) continue;
      // Into the ring just outside the rim (bubbleDye.ts), in the mirror's
      // own log-space rather than through `addDensity`, which takes a colour
      // and takes its log: going out to a colour and back would lose the mix.
      if (depositRim(this.dyeTarget(), N, b.x, b.y, R, mass, aR, aG, aB)) this.rows.rim(b.y, R);
    }
    this.fillPoppedHoles(packed, count, dye, N);
    if (this.coverPacked.length < count * 4) this.coverPacked = new Float32Array(Math.max(4, count * 4));
    this.coverPacked.set(packed.subarray(0, count * 4));
    this.coverCount = count;
    /*
      Next frame's list to diff against: this frame's bubbles, *plus* the
      ones still filling.

      Without the second part the fill runs exactly once per popped bubble —
      the single frame it leaves the list — and moves 0.35 of the deficit and
      then never again. It reached 43-53% of the surroundings and sat there,
      right on the gate, for that reason and not for any physical one. A hole
      is carried for a few more frames so the fill converges, and it drops
      out when it has nothing left to move.
    */
    const keep = this.fillingHoles.filter(h => h.left > 0);
    const total = count + keep.length;
    if (this.prevPacked.length < total * 4) this.prevPacked = new Float32Array(total * 4);
    this.prevPacked.set(packed.subarray(0, count * 4));
    for (let i = 0; i < keep.length; i++) this.prevPacked.set(keep[i].at, (count + i) * 4);
    this.prevCount = total;
    this.fillingHoles = keep;
  }

  /**
   * A popped bubble's hole, filled back in from the ring around it (H6 · A).
   *
   * This is the half that was missing, and it was the whole reason the
   * exclusion could not ship. The dye a bubble displaces is conserved — the
   * plate holds 99.6–105.1% of a no-bubble control — but once the air is gone
   * nothing points inward, so the hole stayed open: 0.123 against 2.410
   * twenty-four seconds after a pop, a clear scar drifting around the plate
   * as a ghost.
   *
   * Two solver-side attempts did not reach it. A leaky trail, so the
   * divergence's sink outlives the pop by a second rather than one clamped
   * frame, moved the refill from 0.003 to 0.032–0.060. Making that same
   * source zero-mean — a real fault, since a Neumann problem whose source
   * does not average to zero has no solution to find — reached 0.061. Both
   * are twenty times better than nothing and two orders short of enough.
   *
   * So it is done here instead, where it is exact. And it needs no ledger of
   * what each bubble took, which is what made the earlier designs awkward: a
   * collapsing ring falls inward until the level evens out, so the hole is
   * simply filled from its own annulus until the two concentrations match.
   * That conserves by construction, stops itself at the right moment, and
   * needs nothing remembered but where the bubbles were last frame.
   */
  private dyeTarget(): DyeTarget {
    return { density: this.density, densityR: this.densityR, densityG: this.densityG, densityB: this.densityB, mul: this.mul };
  }

  private fillPoppedHoles(packed: Float32Array, count: number, dye: Float32Array, N: number): void {
    if (this.prevCount <= 0) return;
    for (let k = 0; k < this.prevCount; k++) {
      const o = k * 4;
      const x = this.prevPacked[o] * N, y = this.prevPacked[o + 1] * N, R = this.prevPacked[o + 2] * N;
      if (!(R > 0.7) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      /*
        Still there? Bubbles have no identity across frames, so they are
        matched by where they are: they drift with the liquid, a frame apart,
        so anything within half a radius is the same bubble. A cleared list
        matches nothing, which is exactly right — all of them popped at once.
      */
      let alive = false;
      for (let j = 0; j < count && !alive; j++) {
        const q = j * 4;
        if (Math.hypot(packed[q] * N - x, packed[q + 1] * N - y) < Math.max(2, R * 0.5)) alive = true;
      }
      if (alive) continue;

      // One pass of the ring falling back in (bubbleDye.ts).
      if (!(fillHole(this.dyeTarget(), dye, N, x, y, R) > 0)) continue;
      this.rows.rim(y, R, true);
      /*
        And keep this hole on the books while it is still worth filling. The
        deficit shrinks every pass, so this drops out on its own — the count
        is a ceiling for a hole that never closes, not the schedule.
      */
      if (!this.fillingHoles.some(h => Math.hypot(h.at[0] * N - x, h.at[1] * N - y) < Math.max(2, R * 0.5))) {
        this.fillingHoles.push({ at: this.prevPacked.slice(o, o + 4), left: 45 });
      } else {
        for (const h of this.fillingHoles) {
          if (Math.hypot(h.at[0] * N - x, h.at[1] * N - y) < Math.max(2, R * 0.5)) h.left--;
        }
      }
    }
  }

  /** Call before a hand lays anything this frame; `bankHand` after reads what it laid. */
  markHand() { this.handMarkMass = this.laidMass; }

  /**
   * Hold room on a sparse seeded plate for what a hand just poured.
   *
   * A seeded look's regulator target is its own opening picture (0.40 to 0.47
   * on Jellyfish Bloom), and a hand pour on such a plate is dye the target never
   * counted: `over` goes up at once, and with `regStepScale` (up to 12.5× at a
   * slow dt) and the surface term the plate takes it back in about a second
   * (review of #401, ask 2). Music pours are held by `pourRoom`; a hand's
   * stroke is not, so its mass is banked here and added to the target, and
   * falls away over `HAND_BANK_SECONDS` rather than all at once.
   *
   * Only a sparse dark plate banks (`sparseDarkLook`). On a look where the
   * slider itself is the cap (`seedMean >= dyeBudget`) the target already is
   * the slider, a hand pour was held at it on main, and banking would raise the
   * ceiling above what the owner set; those looks stay the program they were.
   *
   * Named shortcut (PLAN 28d-A): a mean-over-the-dish bookkeeping, not a
   * volume. The honest answer is PLAN 18c-2, where a pour adds volume.
   */
  bankHand() {
    if (!this.sparseDarkLook) return;
    const mass = this.laidMass - this.handMarkMass;
    if (mass > 0) this.handBank += mass / Math.max(1, this.dishArea);
  }

  /** The bank for this solver step, decayed by the show seconds the step stands for. */
  stepHandBank(): number {
    if (this.handBank > 1e-6) this.handBank *= Math.exp(-this.dtSeconds / FluidSimulation.HAND_BANK_SECONDS);
    else this.handBank = 0;
    return this.handBank;
  }

  addDensity(x: number, y: number, amount: number, r = 1, g = 1, b = 1) {
    const index = x + y * this.size;
    this.rows.add(y, y);
    this.laidMass += amount;
    this.density[index] += amount;
    // Store log-space absorptions for Scott Burns geometric mean mixing.
    // At render time: channel = exp(-densityChannel / density)
    // This gives r1^w1 * r2^w2 weighted mixing — physically correct subtractive colorimetry.
    // The absorbance is a real dye's, never a perfect filter's (lib/dye.ts).
    const [ar, ag, ab] = dyeAbsorbances(r, g, b);
    this.densityR[index] += amount * ar;
    this.densityG[index] += amount * ag;
    this.densityB[index] += amount * ab;
  }

  addVelocity(x: number, y: number, amountX: number, amountY: number) {
    const index = x + y * this.size;
    this.rows.add(y, y);
    this.vx[index] += amountX;
    this.vy[index] += amountY;
  }

  /** A video pour's frame to the solver's own passes (PLAN 14ab-2), held there for the next flush; false when it has none (lib/videoFlow.ts). */
  pourVideoFrame(src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, fresh: boolean): boolean {
    if (!this.gpu?.pourVideo?.(src, fresh)) return false;
    return (this.videoLaid = true);
  }

  /**
   * Say that the delta arrays have been written to directly. A caller that
   * fills a whole field in one pass — the room's flow does — has no reason to
   * pay for the bounds check and the flag on every one of 37,000 cells.
   */
  markDirty() {
    this.dirty = true;
  }

  /**
   * What liquid is where on this plate. Empty until one of the four liquids
   * that do something is dropped, and skipped entirely while it is empty, so a
   * plate of ordinary dye runs exactly the arithmetic it always did.
   */
  readonly liquid = new LiquidPhase(GRID_SIZE);
  /** The settings the last step ran with, for deciding what a pour feeds. */
  private lastSettings: VisualizerSettings | null = null;

  /**
   * Let the liquid field act, then carry it along with the plate.
   *
   * Both go through the delta arrays, which is what makes this work on the GPU
   * engine as well: what is written here is uploaded and applied before the
   * next step. The field itself moves on the readback, which is the plate's
   * own velocity on the CPU engine and one frame old on the GPU one.
   */
  stepLiquid(dt: number, disp: number) {
    if (!this.liquid.active) return;
    /*
      Which way is downhill, so a weight difference has something to act on.

      Tilt *and* rock: the tilt is where the plate is being held and the rock
      is the projectionist moving it, and a liquid heavier than the one it is
      in settles against both. On a plate that is perfectly level and still
      this is zero and nothing separates by weight, which is correct — a level
      dish separates by standing still.
    */
    this.liquid.setTilt(this.tiltX + this.rockX * 0.02, this.tiltY + this.rockY * 0.02);
    this.liquid.thickOnGpu = this.thinGap && !!this.gpu?.pour;
    this.liquid.gpuNative = !!this.gpu?.addLiquidDrop;
    this.readPouredShare();
    this.liquid.apply(this.vx, this.vy, this.mul, this.readVx, this.readVy, this.readDensity, dt);
    // `mul` is the GPU engine's dye multiplier: it is uploaded with the rest of
    // the deltas and nothing else reads it. The CPU solver has no such step —
    // its density arrays *are* the plate — so on the fallback the thinning has
    // to be folded in here, or the forces arrive and soap's clear disc simply
    // never opens. Every other writer of `mul` in this file is already guarded
    // by `if (this.gpu)` with an else branch doing exactly this; the liquid
    // pass is shared between both engines, so it does it after the fact.
    if (!this.gpu) {
      for (let i = 0; i < GRID_AREA; i++) {
        const m = this.mul[i];
        if (m === 1) continue;
        this.density[i] *= m; this.densityR[i] *= m; this.densityG[i] *= m; this.densityB[i] *= m;
        this.mul[i] = 1;
      }
    }
    this.liquid.step(this.readVx, this.readVy, disp, dt);
    this.dirty = true;
  }

  /**
   * All the dye on this layer, thinned by `factor` (0..1). A look handing
   * over to the next one: the old colours make room for the new ones instead
   * of sitting under them for minutes.
   */
  thinDye(factor: number) {
    const f = Math.max(0, Math.min(1, factor));
    if (f >= 1) return;
    if (this.gpu) {
      for (let i = 0; i < GRID_AREA; i++) this.mul[i] *= f;
      this.dirty = true;
    } else {
      for (let i = 0; i < GRID_AREA; i++) {
        this.density[i] *= f; this.densityR[i] *= f; this.densityG[i] *= f; this.densityB[i] *= f;
      }
    }
  }

  addTemp(x: number, y: number, amount: number) {
    const index = x + y * this.size;
    this.rows.add(y, y);
    this.temp[index] += amount;
  }

  /** A still picture poured as dye, into the middle of the dish (lib/videoFlow.ts). */
  injectImage(imgData: ImageData) { pourPictureCpu(this, imgData, this.size); }

  clearAll() {
    this.liquid.clear();
    this.gpu?.clear();
    if (this.gpu && 'clearChemistry' in this.gpu) (this.gpu as any).clearChemistry();
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.s.fill(0); this.sR.fill(0); this.sG.fill(0); this.sB.fill(0);
    this.temp.fill(0); this.temp0.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.vx0.fill(0); this.vy0.fill(0);
    this.pressure.fill(0); this.dhdt.fill(0);
    this.gap.fill(this.gpu ? 0 : 0.03);   // absolute at rest, or no delta
    this.mul.fill(1);
    if (this.handsLaid) { this.hands!.fill(0); this.handsLaid = false; }
    if (this.breathLaid) { this.breath!.fill(0); this.breathLaid = false; }
    // A lift still running would go on laying the old plate's spokes into
    // the cleared one for up to a second, at the old look's Fingering.
    this.pressLift.forget(); this.kickRelease.forget(); this.sheet.forget(); this.bassPress.forget(); this.lastLift = null;
    if (this.sheetLaid) { this.sheetGap!.fill(0); this.sheetLaid = false; }
    this.rbDensity.fill(0); this.rbVx.fill(0); this.rbVy.fill(0);
    this.cvx.fill(0); this.cvy.fill(0); this.cpr.fill(0); this.cdv.fill(0);
    this.dirty = false;
    this.dyeMovePending = false;
    this.seedMean = null;
    this.handBank = 0;
    this.gpu?.clear();
  }

  private splatBlob(cx: number, cy: number, radius: number, amount: number, r: number, g: number, b: number) {
    radius *= GRID_SCALE; // caller radii are in 128-grid units
    // A round window, wide enough that the Gaussian has died away at its
    // edge: the old square window cut the blob off where it was still 14%
    // strong, and seeded plates showed square blobs with soft middles.
    const rCeil = Math.ceil(radius * 2.6);
    const rLimit2 = rCeil * rCeil;
    for (let dy = -rCeil; dy <= rCeil; dy++) {
      for (let dx = -rCeil; dx <= rCeil; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > rLimit2) continue;
        const nx = Math.floor(cx) + dx, ny = Math.floor(cy) + dy;
        if (nx < 1 || nx >= this.size - 1 || ny < 1 || ny >= this.size - 1) continue;
        const w = Math.exp(-dist2 / (2 * radius * radius));
        if (w < 0.01) continue;
        this.addDensity(nx, ny, amount * w, r, g, b);
      }
    }
  }

  /**
   * A look built on areas of the dish (lib/plateAreas.ts) is laid as a pool in
   * each: a core of the area's dye and a ring of smaller drops round it, one
   * in three of them the next dye of the set, so each pool has an edge and an
   * accent of its own rather than one soft disc. The pools are laid apart, so
   * the dark between them stays dark until the plate's own flow brings
   * something across. Where the liquids go is the frame's to lay (layPlate),
   * since the dye's seed is also captured and replayed for a hand-off.
   */
  private layAreas(areas: readonly PlateArea[], col: (i: number) => { r: number; g: number; b: number }) {
    const S = this.size;
    for (const a of areas) {
      const R = a.r * S / GRID_SCALE;     // in the 128-grid units splatBlob takes
      const fill = a.fill ?? 1;
      const fam = areaFamily(a);
      const c = col(fam[0]);
      this.splatBlob(a.x * S, a.y * S, R * 0.45, 3.2 * fill, c.r, c.g, c.b);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + this.rng.centred() * 0.5;
        const d = (0.55 + this.rng.float() * 0.3) * a.r * S;
        const cc = i % 3 === 2 ? col(fam[1 % fam.length]) : c;
        this.splatBlob(a.x * S + Math.cos(ang) * d, a.y * S + Math.sin(ang) * d,
          R * (0.14 + this.rng.float() * 0.1), 2.2 * fill, cc.r, cc.g, cc.b);
      }
    }
  }

  /**
   * A look's own seed laid at `w` of its strength (0..1): what `seedPreset`
   * adds, scaled, on top of what is there. The four dye arrays are the
   * state on the CPU path and the pending deltas on the GPU path, and a seed
   * only adds to them, so the difference it made can be scaled either way.
   */
  /**
   * What `lay` would put on the plate, as a picture to add later rather than
   * dye added now: the dye it lays is taken back out and returned (its
   * velocity stays, laid once). A look change lays the incoming look a share
   * at a time from one of these, so the same picture rises in place; laying
   * the look again for each share put its blobs somewhere new each time (the
   * seeding is random) and the change flashed through several pictures.
   */
  captureSeed(lay: () => void): Float32Array[] {
    const arrays = [this.density, this.densityR, this.densityG, this.densityB];
    const before = arrays.map(a => a.slice());
    lay();
    const delta = arrays.map((a, c) => {
      const d = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) d[i] = a[i] - before[c][i];
      a.set(before[c]);
      return d;
    });
    this.dirty = true;
    return delta;
  }

  /** Add `k` of a captured seed (see `captureSeed`) to the plate. */
  addSeedShare(seed: Float32Array[], k: number): void {
    if (!(k > 0)) return;
    const arrays = [this.density, this.densityR, this.densityG, this.densityB];
    for (let c = 0; c < 4; c++) {
      const a = arrays[c], d = seed[c];
      for (let i = 0; i < a.length; i++) a[i] += d[i] * k;
    }
    this.dirty = true;
  }

  seedPresetScaled(presetId: string, noise2D: (x: number, y: number) => number, w: number): number[] {
    const k = Math.max(0, Math.min(1, w));
    const before = [this.density.slice(), this.densityR.slice(), this.densityG.slice(), this.densityB.slice()];
    const harmony = this.seedPreset(presetId, noise2D);
    const now = [this.density, this.densityR, this.densityG, this.densityB];
    for (let c = 0; c < 4; c++) {
      const a = now[c], b = before[c];
      for (let i = 0; i < a.length; i++) a[i] = b[i] + (a[i] - b[i]) * k;
    }
    this.dirty = true;
    return harmony;
  }

  seedPreset(presetId: string, noise2D: (x: number, y: number) => number): number[] {
    const S = this.size;
    const cx = S / 2, cy = S / 2;
    const k = GRID_SCALE; // absolute distances below were tuned on a 128 grid

    const harmony = PRESET_CONTRACTS[presetId] || pickHarmony();
    const col = (i: number) => PALETTE_RGB[harmony[i % harmony.length]];

    const dishSum = () => {
      let s = 0;
      for (let j = 0; j < S; j++) {
        const v = (j + 0.5) / S - 0.5;
        for (let i = 0; i < S; i++) {
          const u = (i + 0.5) / S - 0.5;
          if (u * u + v * v < OPEN_RIM * OPEN_RIM) s += Math.min(6.0, this.density[i + j * S]);
        }
      }
      return s / Math.max(1, this.dishArea);
    };
    const beforeMean = dishSum();

    const areas = plateAreas(presetId);
    if (areas && !OWN_SEED_AREAS.has(presetId)) {
      this.layAreas(areas, col);
      if (presetId === 'cell-bloom') {
        for (const [ringR, count, rad, amt] of [
          [0.22, 8, 15, 1.4],
          [0.34, 10, 16, 1.8],
        ] as const) {
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + ringR;
            const c = col(i);
            this.splatBlob(
              cx + Math.cos(a) * S * ringR,
              cy + Math.sin(a) * S * ringR,
              rad,
              amt,
              c.r,
              c.g,
              c.b,
            );
          }
        }
      } else if (presetId === 'red-cabbage') {
        // Additional anthocyanin pH zones (violet neutral, teal-green and gold
        // base) around the two acid/base wells so the dish holds >=3 hues at luma <=0.50 (PLAN 28i-2).
        const rings: [number, number, number, number][] = [
          [0.32, 0.68, 15, 2],
          [0.68, 0.32, 15, 3],
          [0.50, 0.50, 14, 0],
          [0.22, 0.32, 13, 1],
          [0.78, 0.68, 13, 2],
        ];
        for (const [fx, fy, rad, ci] of rings) {
          const c = col(ci);
          this.splatBlob(fx * S, fy * S, rad, 2.3, c.r, c.g, c.b);
        }
      }
      this.seedMean = Math.max(0, dishSum() - beforeMean);
      this.seedBudget = findPreset(presetId)?.settings.dyeBudget ?? 0.85;
      return harmony;
    }

    switch (presetId) {
      case 'galaxy': {
        // Bright core + compact two-arm spiral so the outer cosmos stays dark (PLAN 28i-2).
        this.splatBlob(cx, cy, 4.2, 3.8, 0.85, 0.92, 1.0);
        this.splatBlob(cx, cy, 8.5, 1.8, 0.5, 0.25, 0.85);
        // Two logarithmic spiral arms
        for (let arm = 0; arm < 2; arm++) {
          const offset = arm * Math.PI;
          const c = col(arm);
          for (let t = 0.3; t < 4.6; t += 0.09) {
            const r = (2.5 + t * 6.8) * k;
            const theta = t * 1.3 + offset;
            const x = cx + r * Math.cos(theta), y = cy + r * Math.sin(theta);
            const bright = Math.max(0.12, 1.0 - t / 5.2);
            this.splatBlob(x, y, 1.4 + bright * 1.9, bright * 2.1, c.r, c.g, c.b);
          }
        }
        // Scattered stars
        for (let i = 0; i < 36; i++) {
          const a = this.rng.angle(), d = (3 + this.rng.float() * 40) * k;
          const c = this.rng.float() < 0.25 ? { r: 1, g: 1, b: 1 } : col(this.rng.int(4));
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
            0.5 + this.rng.float() * 0.7, 0.35 + this.rng.float() * 0.85, c.r, c.g, c.b);
        }
        // Angular velocity for swirl
        for (let j = 2; j < S - 2; j += 2) {
          for (let i = 2; i < S - 2; i += 2) {
            const dx = i - cx, dy = j - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 55 * k) continue;
            const spd = 0.14 / (1 + (dist / k) * 0.025);
            this.addVelocity(i, j, -dy / dist * spd, dx / dist * spd);
          }
        }
        break;
      }

      case 'fillmore-wash': {
        // The second projector: a soft green and purple wash with a cobalt
        // corner, the plate seen at the left of the Fillmore stills.
        this.splatBlob(cx - 18 * k, cy + 10 * k, 24, 1.0, col(0).r, col(0).g, col(0).b);
        this.splatBlob(cx + 22 * k, cy - 14 * k, 20, 1.0, col(1).r, col(1).g, col(1).b);
        this.splatBlob(cx + 4 * k, cy + 30 * k, 14, 0.9, col(2).r, col(2).g, col(2).b);
        break;
      }

      case 'classic': {
        /*
          Luminous, not thick, and on the screen, with open dark glass around
          the pools (PLAN 28i-2).
        */
        const blobs: [number, number, number][] = [[0.5, 0.5, 8.5]];
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + 0.3;
          blobs.push([0.5 + Math.cos(a) * 0.18, 0.5 + Math.sin(a) * 0.14, 7.5 + (i % 2) * 1.5]);
        }
        blobs.push([0.24, 0.24, 10], [0.76, 0.24, 10], [0.24, 0.76, 10], [0.76, 0.76, 10]);
        blobs.forEach(([fx, fy, rad], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, rad, 0.85, c.r, c.g, c.b);
        });
        break;
      }

      case 'cyberpunk': {
        // Full-plate neon pink, cyan, and violet washes + diagonal streaks so
        // the plate stays <60% near-black at the 95th percentile and holds >=3 hues (PLAN 28i-2).
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 4; i++) {
            const c = col(i + j);
            const px = S * (0.16 + i * 0.22);
            const py = S * (0.20 + j * 0.30);
            this.splatBlob(px, py, 13, 2.2, c.r, c.g, c.b);
          }
        }
        for (let s = 0; s < 6; s++) {
          const c = col(s);
          const sx = this.rng.float() * S * 0.25, sy = this.rng.float() * S * 0.85;
          const a = Math.PI * 0.16 + s * 0.12;
          for (let t = 0; t < S * 1.1; t += 1.5) {
            const x = sx + Math.cos(a) * t, y = sy + Math.sin(a) * t;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            this.splatBlob(x, y, 3.0, 2.2, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'acid-trip': {
        for (let ring = 0; ring < 5; ring++) {
          const r = (8 + ring * 10) * k;
          const c = col(ring);
          for (let a = 0; a < Math.PI * 2; a += 0.04) {
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            this.splatBlob(x, y, 3, 1.8, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'bass-drop': {
        for (let i = 0; i < 4; i++) {
          const c = col(i);
          const off = this.rng.centred() * 12;
          this.splatBlob(cx + off, cy + off, 20 - i * 3, 4.0 - i * 0.5, c.r, c.g, c.b);
        }
        break;
      }

      case 'boiling-point': {
        for (let i = 0; i < 40; i++) {
          const x = 8 + this.rng.float() * (S - 16), y = 8 + this.rng.float() * (S - 16);
          const c = col(i);
          this.splatBlob(x, y, 3 + this.rng.float() * 5, 2.0, c.r, c.g, c.b);
          this.addTemp(Math.floor(x), Math.floor(y), 3.0 + this.rng.float() * 4);
        }
        break;
      }

      case 'microscopic-chaos': {
        // Wide, soft-edged stained pools instead of 144 tiny dots so the slide
        // moves smoothly with detail <= half its 10-19 reading (PLAN 28i-2).
        const c0 = col(0);
        this.splatBlob(cx, cy, 62, 2.2, c0.r, c0.g, c0.b);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const r = S * 0.24;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          const c = col(i + 1);
          this.splatBlob(x, y, 32, 2.2, c.r, c.g, c.b);
          this.addVelocity(Math.floor(x), Math.floor(y), -Math.sin(a) * 0.09, Math.cos(a) * 0.09);
        }
        break;
      }

      case 'aurora-borealis': {
        for (let band = 0; band < 4; band++) {
          const by = S * (0.25 + band * 0.15);
          const c = col(band);
          for (let i = 2; i < S - 2; i++) {
            const wave = (Math.sin(i * 0.04 + band * 2.0) * 12 + Math.sin(i * 0.09) * 5) * k;
            const w = 3 + Math.sin(i * 0.07 + band) * 2;
            this.splatBlob(i, by + wave, w, 1.5, c.r, c.g, c.b);
          }
        }
        for (let j = 2; j < S - 2; j += 4)
          for (let i = 2; i < S - 2; i += 4) this.addVelocity(i, j, 0.03, 0);
        break;
      }

      case 'solar-flare': {
        this.splatBlob(cx, cy, 8, 6.0, 1.0, 0.95, 0.8);
        this.splatBlob(cx, cy, 15, 3.0, 1.0, 0.5, 0.0);
        for (let f = 0; f < 8; f++) {
          const a = f * Math.PI * 2 / 8 + this.rng.centred() * 0.4;
          const c = col(f);
          const len = (20 + this.rng.float() * 25) * k;
          for (let t = 5 * k; t < len; t += 1.5) {
            const wb = Math.sin(t * 0.3 + f) * 2 * k;
            const x = cx + Math.cos(a) * t + Math.cos(a + Math.PI / 2) * wb;
            const y = cy + Math.sin(a) * t + Math.sin(a + Math.PI / 2) * wb;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            const br = 1.0 - t / len;
            this.splatBlob(x, y, 2 + br * 2, br * 3.0, c.r, c.g, c.b);
            this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.15, Math.sin(a) * 0.15);
          }
        }
        this.addTemp(Math.floor(cx), Math.floor(cy), 5.0);
        break;
      }

      case 'jellyfish-bloom': {
        /*
          The bells sit in the look's areas (lib/plateAreas.ts), where its
          music lands, each in its area's dye; they were at random across the
          top half (x ±0.05, y 0.15 to 0.45 of the plate), so the music's hands
          had no bell to find (PLAN 25b-6, 25h). The same draws are made, so
          the rest of the seed is laid as it was.
        */
        const bells = plateAreas('jellyfish-bloom')!;
        for (let jf = 0; jf < 4; jf++) {
          const bell = bells[jf];
          this.rng.centred(); this.rng.centred();
          const jx = S * (0.5 + (bell.x - 0.5) * 0.72);
          const jy = S * (bell.y + 0.14);
          const c = col(bell.dye);
          const rim = col(bell.dye + 1);
          const bellR = (11.5 + this.rng.float() * 6.5) * k;
          for (let a = -Math.PI; a < 0; a += 0.06)
            for (let r = 0; r < bellR; r += 1.5) {
              const x = jx + Math.cos(a) * r, y = jy + Math.sin(a) * r * 0.72;
              if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
              const edge = r / bellR;
              const colMix = edge > 0.65 ? rim : c;
              this.splatBlob(x, y, 2.1, (0.2 + 0.8 * edge) * (1.2 - edge * 0.7) * 0.132, colMix.r, colMix.g, colMix.b);
            }
          for (let t = 0; t < 3; t++) {
            const len = (32 + this.rng.float() * 14) * k;
            for (let strand = -1; strand <= 1; strand += 2) {
              const tx = jx + (t - 1 + strand * 0.25) * bellR * 0.52;
              for (let dy = 0; dy < len; dy += 1.2) {
                const wb = Math.sin(dy * 0.18 + t * 1.4 + jf + strand) * 3.8 * k;
                const tc = (t === 1) ? rim : c;
                this.splatBlob(tx + wb, jy + dy, 1.8, 0.053 / (1 + dy * 0.03), tc.r, tc.g, tc.b);
              }
            }
          }
          this.addVelocity(Math.floor(jx), Math.floor(jy), (jf % 2 === 0 ? 1 : -1) * 0.06, -0.08);
        }
        break;
      }

      case 'fractal-dream': {
        const rings: [number, number, number][] = [
          [cx, cy, 30 * k], [cx - 15 * k, cy - 10 * k, 18 * k], [cx + 15 * k, cy + 10 * k, 20 * k],
          [cx + 8 * k, cy - 15 * k, 12 * k], [cx - 12 * k, cy + 12 * k, 15 * k],
        ];
        rings.forEach(([rx, ry, rr], idx) => {
          const c = col(idx);
          for (let a = 0; a < Math.PI * 2; a += 0.05)
            this.splatBlob(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr, 2.5, 1.8, c.r, c.g, c.b);
        });
        break;
      }

      case 'neon-coral-reef': {
        for (let branch = 0; branch < 6; branch++) {
          let bx = S * (0.15 + branch * 0.14), by = S * 0.85;
          const c = col(branch);
          for (let seg = 0; seg < 50; seg++) {
            by -= 1.0 + this.rng.float() * 0.8;
            bx += this.rng.centred() * 3;
            if (bx < 2 || bx >= S - 2 || by < 2) break;
            this.splatBlob(bx, by, 2 + this.rng.float() * 2, 2.0, c.r, c.g, c.b);
            if (this.rng.float() < 0.15) {
              let fx = bx, fy = by;
              const dir = this.rng.float() < 0.5 ? -1 : 1;
              for (let s2 = 0; s2 < 15; s2++) {
                fy -= 0.8 + this.rng.float() * 0.5;
                fx += dir * (0.8 + this.rng.float() * 0.5);
                if (fx < 2 || fx >= S - 2 || fy < 2) break;
                this.splatBlob(fx, fy, 1.5, 1.2, c.r, c.g, c.b);
              }
            }
          }
        }
        break;
      }

      case 'stardust-collapse': {
        // Saturated core + colourful ring of gas clouds and coloured stars so
        // the collapse keeps >=0.30 colourfulness and >=20% near-black (PLAN 28i-2).
        const coreCol = col(0);
        this.splatBlob(cx, cy, 5, 2.6, coreCol.r, coreCol.g, coreCol.b);
        const ringR = 24 * k;
        for (let i = 0; i < 42; i++) {
          const a = (i / 42) * Math.PI * 2;
          const r = ringR + this.rng.centred() * 7 * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
          const c = col(i);
          this.splatBlob(x, y, 2.2 + this.rng.float() * 1.8, 2.2 + this.rng.float() * 1.2, c.r, c.g, c.b);
          const dx = cx - x, dy = cy - y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.addVelocity(Math.floor(x), Math.floor(y), dx / dist * 0.08, dy / dist * 0.08);
        }
        for (let i = 0; i < 20; i++) {
          const a = this.rng.angle(), d = (5 + this.rng.float() * 36) * k;
          const sc = col(i + 1);
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.9 + this.rng.float() * 1.1, 0.9 + this.rng.float() * 0.8, sc.r, sc.g, sc.b);
        }
        for (let j = 2; j < S - 2; j += 3)
          for (let i = 2; i < S - 2; i += 3) {
            const dx = i - cx, dy = j - cy, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 50 * k) continue;
            const spd = 0.08 / (1 + (dist / k) * 0.02);
            this.addVelocity(i, j, -dy / dist * spd, dx / dist * spd);
          }
        break;
      }

      // ── Macro closeup seeds ──────────────────────────────────────
      // These three exist for the macro camera: it needs *separated* beads to
      // pick from, not one continuous wash covering the plate.
      case 'macro-bead': {
        for (let i = 0; i < 30; i++) {
          const x = 14 + this.rng.float() * (S - 28), y = 14 + this.rng.float() * (S - 28);
          const c = col(i);
          const r = 2.5 + this.rng.float() * 5.5;
          this.splatBlob(x, y, r, 2.6 + this.rng.float() * 2.0, c.r, c.g, c.b);
          // A contrasting shoulder on one side — cells and lacing key off this contrast,
          // and the closeup sees >=2 distinct hues on every bead (PLAN 28i-2).
          const c2 = col(i + 1);
          this.splatBlob(x + r * k * 1.15, y + r * k * 0.85, r * 0.85, 2.5, c2.r, c2.g, c2.b);
          const a = this.rng.angle();
          this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.09, Math.sin(a) * 0.09);
        }
        break;
      }

      case 'lace-run': {
        // Three contrasting tongues of dye running across the plate, each paired
        // with a companion filament so the closeup always frames >=2 hues
        // and cuts across >=6 colour changes/min (PLAN 28i-2).
        for (let band = 0; band < 3; band++) {
          const head = col(band);
          const side = col(band + 1);
          const yBase = S * (0.28 + band * 0.22);
          const dir = band % 2 === 0 ? 1 : -1;
          for (let t = 0; t < 60; t++) {
            const x = S * 0.16 + t * (S * 0.68 / 60);
            const y = yBase + Math.sin(t * 0.1 + band * 1.7) * 8 * k;
            const r = 5 + Math.sin(t * 0.18 + band) * 2.5;
            this.splatBlob(x, y, r, 2.6, head.r, head.g, head.b);
            this.splatBlob(x, y + 6 * k * dir, r * 0.85, 2.5, side.r, side.g, side.b);
            this.addVelocity(Math.floor(x), Math.floor(y), 0.09 * dir, 0.02 * (band - 1));
          }
        }
        for (let i = 0; i < 36; i++) {
          const trail = col(i + 1);
          const x = S * 0.15 + this.rng.float() * S * 0.7;
          const y = S * 0.5 + this.rng.centred() * S * 0.36;
          this.splatBlob(x, y, 2.0 + this.rng.float() * 3.5, 2.2, trail.r, trail.g, trail.b);
        }
        break;
      }

      case 'milk-marble': {
        // A warm cream milk ground tamed in depth so the overhead light does not
        // bleach the dish white, with vivid food-colouring spots ready to run (PLAN 28i-2).
        this.splatBlob(cx, cy, S * 0.44, 0.42, 0.62, 0.59, 0.54);
        const spots: [number, number, number][] = [
          [0.34, 0.34, 8.5], [0.66, 0.34, 8.5], [0.34, 0.66, 8.5], [0.66, 0.66, 8.5],
          [0.50, 0.28, 7.0], [0.50, 0.72, 7.0], [0.28, 0.50, 7.0], [0.72, 0.50, 7.0],
        ];
        spots.forEach(([fx, fy, rad], i) => {
          const c = col(i);
          this.splatBlob(fx * S, fy * S, rad * k, 3.6, c.r, c.g, c.b);
        });
        break;
      }

      case 'soap-film': {
        // One unbroken sheet. Everything this preset does it does by tearing
        // holes in that sheet, so the seed is the sheet and nothing else.
        for (let i = 0; i < 3; i++) {
          const c = col(i);
          this.splatBlob(cx + this.rng.centred() * S * 0.28, cy + this.rng.centred() * S * 0.28,
            S * 0.4, 1.1, c.r, c.g, c.b);
        }
        break;
      }

      case 'glycerine-drift': {
        // Bands laid across the plate, drifting in alternate directions. The
        // look is what happens where a patch that will not move meets one
        // that will, so the seed lays something for the shear to cut.
        for (let b = 0; b < 5; b++) {
          const c = col(b);
          const y = S * (0.15 + b * 0.175);
          for (let t = 0; t < 48; t++) {
            const x = S * 0.06 + t * (S * 0.88 / 48);
            this.splatBlob(x, y + Math.sin(t * 0.13 + b) * 6 * k, 9 * k, 1.5, c.r, c.g, c.b);
            this.addVelocity(Math.floor(x), Math.floor(y), b % 2 === 0 ? 0.05 : -0.05, 0);
          }
        }
        break;
      }

      case 'magnet-garden': {
        // The ferrofluid is dark and only reads against something bright, so
        // the plate starts as a full pool of light dye for it to stand on.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2, d = S * (i === 0 ? 0 : 0.26);
          const c = col(i);
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, S * 0.2, 2.2, c.r, c.g, c.b);
        }
        break;
      }

      case 'ferro-paint': {
        // A patchwork of the three dyes over the whole plate, touching, so
        // the ferrofluid fingers through colour everywhere and amber meets
        // teal (the references' green) along the seams.
        //
        // Each patch a Gaussian of sigma 0.09 of the plate, on a
        // grid a quarter of the plate apart. The radius was S × 0.15 in
        // splatBlob's 128-grid units, which it scales by GRID_SCALE again:
        // 0.225 of the plate, nearly the spacing, so the sixteen patches lay
        // on top of each other and the plate opened as one mixed green
        // (the Mac gallery at 12 s and 30 s: a green plate with black
        // holes, where Colored I and II hold amber, teal and coral apart).
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          const c = col(i + j * 2);
          const x = S * (0.14 + i * 0.24) + Math.sin(j * 1.7 + i) * 4 * k;
          const y = S * (0.14 + j * 0.24) + Math.cos(i * 1.3 + j) * 4 * k;
          this.splatBlob(x, y, (S * 0.09) / k, 2.6, c.r, c.g, c.b);
        }
        break;
      }

      case 'roy': {
        /*
          A panel, laid out: flat shapes and two brushstrokes of the three
          inks, apart on white paper, and three fields of pale wash for the
          print (benDay) to lay as Ben-Day dots.

          The owner, 2026-10-04: Roy "always starts with this giant black
          stain". It was this seed. splatBlob takes its radius in the 128
          grid's units and scales it by GRID_SCALE itself, and the old seed
          handed it plate fractions times S, already in cells: each of the
          four pools came out a Gaussian 0.24 of the plate wide in its core
          and 0.43 in its wash, so all four lay over each other across the
          whole glass. Red over blue over yellow absorbs every channel, and
          the print draws dark as black: the lab, rendering the dye the app
          had laid, printed 57% of the view black and 37% red, with no white,
          no yellow and no blue (the owner's screenshot, nine seconds in).

          Here every size is a plate fraction turned into splatBlob's units
          (u). A solid shape is a Gaussian of half its radius: at 1.2 it is
          solid ink out to about two sigma, and gone a little past that, so
          shapes laid apart stay apart and the paper between them is paper.
          The composition sits in the middle 0.7 of the plate, which is what
          the plate's view shows at 1x.

          A field of dots has to be an even wash at the strength the print
          reads as a tint, and that strength is narrow and not the same for
          each ink. Measured in the lab on flat squares through the real plate
          shader with Roy's settings: blue prints dots from 0.09 to 0.11 and
          is solid by 0.13, yellow from 0.11 to 0.13, red from 0.11 to 0.13
          and solid by 0.15. One wide Gaussian crosses that band in a thin
          ring, so a field is a lattice of small ones, 1.3 sigma apart, which
          sums to the even wash (TINT) in the band's middle.

          Those were the strengths until the pigment's grain moved after the
          gooey curve (#267, PLAN 1a): the grain the lab reads (a blank field,
          about 0.75) had thinned every wash by a quarter in front of the
          curve, and behind it thins the depth instead, so the same wash
          printed solid. The deploy that took both read 47 dots on Roy's
          opening against the 150 royopen asks. Swept as a whole (the seed's
          TINT times 0.6 to 0.9, `npm run royopen`): 0.6 printed 29 dots, 0.7
          256, 0.75 272, 0.8 240 and 0.9 102, every ink's fields dotting
          across 0.7 to 0.8, so TINT is the old strengths times 0.75, the
          band's middle. It is the same scaling the print's own check took
          (benday's washes 0.14 → 0.10).
        */
        const u = S / GRID_SCALE;
        const M = (v: number) => 0.5 + (v - 0.5) * 0.7;
        const TINT = [0.098, 0.09, 0.071];
        const ink = (x: number, y: number, r: number, amount: number, i: number) => {
          const c = col(i);
          this.splatBlob(M(x) * S, M(y) * S, r * 0.7 * 0.5 * u, amount, c.r, c.g, c.b);
        };
        const field = (x: number, y: number, R: number, i: number) => {
          const sg = 0.02, dx = sg * 1.3, dy = dx * Math.sqrt(3) / 2;
          const per = TINT[i % TINT.length] * dx * dy / (2 * Math.PI * sg * sg);
          const c = col(i);
          R *= 0.7;
          for (let j = -Math.floor(R / dy); j * dy <= R; j++) {
            for (let k = -Math.ceil(R / dx); k * dx <= R; k++) {
              const ox = (k + (j & 1 ? 0.5 : 0)) * dx, oy = j * dy;
              if (ox * ox + oy * oy > R * R) continue;
              this.splatBlob((M(x) + ox) * S, (M(y) + oy) * S, sg * u, per, c.r, c.g, c.b);
            }
          }
        };
        const shape = (x: number, y: number, r: number, i: number, lobes: [number, number][]) => {
          ink(x, y, r, 1.2, i);
          for (const [a, f] of lobes) ink(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * f, 1.0, i);
        };
        // A brushstroke: a chain of shapes along a bend from (x0, y0) through
        // (xm, ym) to (x1, y1), fattest in the middle.
        const stroke = (x0: number, y0: number, xm: number, ym: number, x1: number, y1: number, r: number, i: number) => {
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const v = 1 - t;
            ink(v * v * x0 + 2 * v * t * xm + t * t * x1, v * v * y0 + 2 * v * t * ym + t * t * y1,
              r * (0.6 + 0.4 * Math.sin(Math.PI * t)), 0.9, i);
          }
        };
        field(0.74, 0.27, 0.21, 2);
        field(0.25, 0.74, 0.2, 0);
        field(0.18, 0.2, 0.17, 1);
        field(0.9, 0.86, 0.12, 1);
        shape(0.3, 0.36, 0.10, 0, [[2.6, 0.6], [4.2, 0.5], [0.4, 0.6]]);
        shape(0.5, 0.14, 0.05, 2, [[0.3, 0.6]]);
        shape(0.86, 0.46, 0.05, 1, []);
        shape(0.68, 0.74, 0.1, 2, [[5.6, 0.55], [1.9, 0.5]]);
        shape(0.16, 0.86, 0.055, 2, [[0, 0.6]]);
        shape(0.46, 0.86, 0.05, 1, [[3.4, 0.7]]);
        shape(0.6, 0.3, 0.045, 1, []);
        stroke(0.36, 0.58, 0.52, 0.42, 0.7, 0.54, 0.05, 0);
        stroke(0.86, 0.88, 0.95, 0.74, 0.84, 0.62, 0.035, 0);
        stroke(0.08, 0.56, 0.16, 0.44, 0.06, 0.3, 0.04, 1);
        // Additional comic shapes in the same ink as their neighbours so they
        // never create a three-channel stain while keeping gallery flat <=0.50
        // and luma <=0.60 across the 16:9 frame (PLAN 28i-2).
        shape(0.48, 0.63, 0.095, 0, [[0.2, 0.6]]);
        shape(0.36, 0.15, 0.086, 2, [[3.1, 0.6]]);
        shape(0.94, 0.24, 0.092, 2, []);
        shape(0.06, 0.72, 0.092, 0, [[0.2, 0.55]]);
        shape(-0.04, 0.32, 0.115, 1, []);
        shape(-0.04, 0.48, 0.12, 0, [[1.5, 0.6]]);
        shape(1.04, 0.46, 0.125, 0, [[4.7, 0.65]]);
        shape(1.04, 0.24, 0.11, 2, []);
        shape(-0.04, 0.68, 0.115, 0, []);
        shape(1.04, 0.68, 0.115, 0, []);
        break;
      }

      case 'clock-glass': {
        /*
          A clock-glass dish is coloured water and oil that will not mix
          (src/lib/oilLay.ts, and why): the water is the first dye, laid wide
          and deepest in the middle where the bowed glasses hold the most,
          and bodies of oil are laid over it across the dish, each with one
          of the other dyes in it. With Oil Bodies on (the look's) each body
          keeps its colour while it moves, and two only mix where they merge,
          as two dyed oils do. The oil is laid only where the solver is there
          to take it; before it is, the colours still land, as spots in the
          water.
        */
        const water = col(0);
        const bodies = clockGlassBodies(this.rng.float, harmony.length);
        /*
          Each cell as clockGlassCell lays it (and why): a body's colour in
          its oil and nowhere else, the water's wash in what is left.
        */
        const g = this.gpu;
        for (const b of bodies) g?.addMix?.(b.x, b.y, b.r, { oil: 1 });
        for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
          const cell = clockGlassCell((x + 0.5) / S, (y + 0.5) / S, S, bodies);
          if (cell.water > 0) this.addDensity(x, y, cell.water, water.r, water.g, water.b);
          if (cell.dye > 0) {
            const c = col(bodies[cell.body].dye);
            this.addDensity(x, y, cell.dye, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'splodascope': {
        /*
          The splodascope's crowd (src/lib/oilLay.ts, and why): a blue water
          across the dish and a packed crowd of oil drops in it, each with
          one of the other dyes, a few big ones holding a drop of another
          colour in a ring of water. The look's Film Hold keeps them apart
          where they touch, and Oil Bodies keeps each one's colour its own.
        */
        const water = col(0);
        const discs = splodascopeDiscs(this.rng.float, harmony.length);
        const g = this.gpu;
        for (const d of discs) g?.addMix?.(d.x, d.y, d.r, { oil: d.oil });
        for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
          const cell = splodascopeCell((x + 0.5) / S, (y + 0.5) / S, S, discs);
          if (cell.water > 0) this.addDensity(x, y, cell.water, water.r, water.g, water.b);
          if (cell.dye > 0) {
            const c = col(discs[cell.disc].dye);
            this.addDensity(x, y, cell.dye, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'turing-print': {
        // Coloured ink pools across the plate so the reaction-diffusion print
        // carves through saturated indigo, magenta, and gold from the start
        // instead of bleaching to a 0.85-0.94 white sheet (PLAN 28i-2).
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.2;
          const c = col(i);
          this.splatBlob(
            cx + Math.cos(a) * S * 0.22,
            cy + Math.sin(a) * S * 0.18,
            15,
            2.1,
            c.r,
            c.g,
            c.b,
          );
        }
        const c0 = col(0);
        this.splatBlob(cx, cy, 14, 1.9, c0.r, c0.g, c0.b);
        break;
      }

      case 'red-cabbage': {
        // Distinct anthocyanin pH zones (crimson acid, violet neutral, teal-green
        // and gold base) so the indicator dish shows >=3 hues at luma <=0.50 (PLAN 28i-2).
        const rings: [number, number, number, number][] = [
          [0.30, 0.34, 15, 0],
          [0.70, 0.34, 15, 1],
          [0.32, 0.68, 15, 2],
          [0.68, 0.66, 15, 3],
          [0.50, 0.50, 13, 0],
          [0.20, 0.50, 12, 1],
          [0.80, 0.50, 12, 2],
        ];
        for (const [fx, fy, rad, ci] of rings) {
          const c = col(ci);
          this.splatBlob(fx * S, fy * S, rad, 2.3, c.r, c.g, c.b);
        }
        break;
      }

      case 'chemical-clock': {
        // Translucent indicator pools (seedMean ~0.68 <= 0.75 budget, spaced
        // apart with exposure 0.58 so Beer-Lambert transmission stays bright at
        // 8 s while the oscillating clock reorganises its colour histogram >=6
        // times/min, PLAN 28i-2).
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const c = col(i);
          const x = cx + Math.cos(a) * S * 0.24;
          const y = cy + Math.sin(a) * S * 0.20;
          this.splatBlob(x, y, 12, 1.55, c.r, c.g, c.b);
          this.addVelocity(Math.floor(x), Math.floor(y), -Math.sin(a) * 0.10, Math.cos(a) * 0.10);
        }
        break;
      }

      case 'lava-lamp': {
        // Translucent wax plumes (seedMean ~0.52 so Beer-Lambert transmission stays
        // bright at 8 s without opaque blackout) with warm rising lower blobs and
        // sinking upper blobs so convection is already underway by 8 s and sustains
        // >=0.02 motion through 40 s at luma <=0.60 (PLAN 28i-2).
        const blobs: [number, number, number, number, number, number][] = [
          [0.50, 0.66, 14, 0, 14, -0.10],
          [0.34, 0.62, 13, 1, 12, -0.08],
          [0.66, 0.60, 13, 2, 12, -0.08],
          [0.48, 0.46, 13, 0,  6, -0.05],
          [0.34, 0.36, 12, 1,  0,  0.08],
          [0.66, 0.36, 12, 2,  0,  0.08],
        ];
        for (const [fx, fy, rad, ci, heat, vy] of blobs) {
          const c = col(ci);
          const x = fx * S, y = fy * S;
          this.splatBlob(x, y, rad, 1.15, c.r, c.g, c.b);
          if (heat > 0) this.addTemp(Math.floor(x), Math.floor(y), heat);
          this.addVelocity(Math.floor(x), Math.floor(y), 0, vy);
        }
        break;
      }

      default: {
        for (let i = 0; i < 5; i++) {
          const c = col(i);
          this.splatBlob(10 + this.rng.float() * (S - 20), 10 + this.rng.float() * (S - 20), 15, 2.0, c.r, c.g, c.b);
        }
        break;
      }
    }

    this.seedMean = Math.max(0, dishSum() - beforeMean);
    this.seedBudget = findPreset(presetId)?.settings.dyeBudget ?? 0.85;
    return harmony;
  }

  /**
   * Press the top glass over a disc: the film thins by `amount` under it.
   *
   * With `fingering`, the press is still round (lib/squish.ts: squeezing is
   * the stable direction of Saffman–Taylor): the centre clears and, in a
   * press's first moments, the dye stands up in a round rim. The fingers
   * come when it lets go. The outermost disc of a press (`pileTips`) is
   * remembered, and once no press has come for 150 ms the step lays the
   * lift, the spokes running in from the rim as the glass comes up
   * (`liftStep`). A drop's impact is the `splash` stroke, which keeps the
   * fingers on the way down that every press used to draw.
   */
  applySquish(x: number, y: number, radius: number, amount: number, fingering = 0, pileTips = false, stroke: Exclude<Stroke, 'lift'> = 'press', who: Presser = 'hand') {
    radius = Math.round(radius * GRID_SCALE);
    /*
      A press lands on a whole cell. Beat Squeeze's centre was the middle of
      the plate plus a fraction of thirty cells, never rounded, so every cell
      index its disc reported was a fraction too, and a write to a typed
      array at a fractional index is dropped without a word: the rhythm
      plate never pressed, from the day it was written until #185 found it
      (PLAN §10 step 4). Rounded here, for every caller, and in squishDisc
      too, so the lab and the checks draw the same disc.
    */
    x = Math.round(x);
    y = Math.round(y);
    // The first moments of a press shove the dye out to its front, where it
    // piles up as a bright rim (the reference's bright finger ends, round
    // now on a press, at the fingers' tips on a splash). Counted per press
    // so a held press does not keep piling.
    // The pile belongs to one press, counted in solver steps: only the
    // outermost of the tool's nested radii piles (the Mac's seventh look
    // found the three radii tiling the palm with a blob), and a press is one
    // press while it keeps coming, even as a finger drifts across grid
    // cells; a pause of a moment starts a new one.
    const nowMs = showNow();
    if (nowMs - this.squishLastAt > 150) { this.squishSteps = 0; this.squishLastStep = -1; }
    this.squishLastAt = nowMs;
    if (pileTips && this.stepIndex !== this.squishLastStep) { this.squishLastStep = this.stepIndex; this.squishSteps++; }
    const pile = pileTips && fingering > 0 && this.squishSteps <= 45 ? 0.02 * fingering * Math.min(1, amount * 250) : 0;
    if (pileTips && stroke === 'press') this.pressLift.press(who, x, y, radius, amount, fingering, nowMs);
    // Counted by who pressed, whole cells that close the gap only (a
    // fractional one is dropped by the arrays, and a cell pressed by nothing
    // is no press), with the depth laid there, so `npm run squeeze` can ask
    // whether a kick's press reached the plate at all, and whether the kick's
    // release gave back what it took.
    let laid = 0, depth = 0;
    // On a thin gap a press lays only the glass, as a bowl, and the flow moves the liquid (squishDisc).
    squishDisc(this.size, x, y, radius, amount, fingering, stroke, pile, (idx, g, vx, vy, m) => {
      if (Number.isInteger(idx) && g < 0) { laid++; depth -= g; }
      this.squishCell(idx, g, vx, vy, m);
    }, this.thinGap);
    this.pressedCells[who] += laid;
    this.pressedDepth[who] += depth;
  }

  /**
   * The glass coming back up after a press (lib/squish.ts), laid once a
   * solver step for as long as the lift runs: nothing while a press is held,
   * and nothing at all with Fingering at 0.
   */
  private liftStep(): void {
    for (const lift of this.pressLift.step(showNow(), this.dtSeconds)) {
      // Cells that land: an index that is not a whole number is a write a
      // typed array drops without a word (the beat squeeze's fractional
      // centre, PLAN §10 step 4), and counting those called a lift that
      // laid nothing a lift.
      let cells = 0;
      squishDisc(this.size, lift.x, lift.y, lift.radius, lift.amount, lift.fingering, 'lift', 0, (idx, gap, vx, vy, m) => {
        if (Number.isInteger(idx)) cells++;
        this.squishCell(idx, gap, vx, vy, m);
      }, this.thinGap);
      this.lastLift = { x: lift.x, y: lift.y, cells };
    }
    // The kicks' presses, held against the spring, let go (`pressKick`): only the gap
    // given back, never past rest.
    this.kickRelease.step(this.size, this.dtSeconds, this.squishCell, this.lastStep?.gapSpring);
    // The rhythm sheet (pressKick): solved a step, laid as the gap's change, with the spring (lib/sheet.ts).
    if (this.sheet.live) {
      if (!this.gpu || !this.thinGap) { this.sheet.forget(); return; }
      if (!this.sheetGap) this.sheetGap = new Float32Array(this.size * this.size);
      const depth = this.sheet.closed, cells = this.sheet.pressedCells;
      if (this.sheet.step(this.size, this.dtSeconds, this.lastStep?.gapSpring ?? 0, this.sheetGap, this.lastStep?.plateCurve ?? 0) > 0) {
        this.sheetLaid = true;
        this.dirty = true;
        // As a stroke counts them (applySquish): the cells a held finger closes, and the depth.
        this.pressedCells.kick += this.sheet.pressedCells - cells;
        this.pressedDepth.kick += this.sheet.closed - depth;
      }
    }
  }

  /**
   * Beat Squeeze's kick (lib/squish.ts `kickPress`): the rhythm sheet's one
   * dent, as wide as the sheet bends over this liquid in the time the kick
   * holds it, or on a look that may move the frame the glass over three
   * nested discs across most of the dish. `radii` in cells of a 128 plate,
   * `amount` each disc's press. Remembered for the lift like a hand's press,
   * and let go a moment later (`kickRelease`).
   */
  pressKick(x: number, y: number, amount: number, fingering: number, radii: readonly number[], nu = NU_REF, curve = 0): void {
    x = Math.round(x);
    y = Math.round(y);
    if (radii.length === 1 && this.gpu && this.thinGap) {
      /*
        The rhythm sheet, solved (lib/sheet.ts, PLAN 27f-4): a fingertip on
        it here, held KICK_HOLD and lifted, pushing out from under it as much
        liquid as the stamped bowl closed over the same reach (stampedVolume),
        and from then on the sheet's own equation lays the gap, step by step
        (liftStep). The lift's memory still hears the kick as a press, so
        Fingering's fingers follow it as they followed the bowl.
      */
      const radius = Math.round(radii[0] * GRID_SCALE);
      this.pressLift.press('kick', x, y, radius, amount, fingering, showNow());
      this.sheet.setLiquid(nu);
      // No deeper than the dome's rest under it (kickRoom): where the glasses touch, a kick presses nothing.
      const u = (x + 0.5) / this.size, v = (y + 0.5) / this.size;
      this.sheet.pressVolume(u, v, stampedVolume(amount, radii[0] / 128), radii[0] / 128, KICK_HOLD, kickRoom(u, v, curve));
    } else {
      radii.forEach((r, i) => this.applySquish(x, y, r, amount, fingering, i === 0, 'press', 'kick'));
      this.kickRelease.kick(x, y, radii.map((r) => Math.round(r * GRID_SCALE)), amount, this.thinGap);
    }
    // And the same glass on the slosh dish (stepSlosh), over the same radii the
    // gap was pressed with: off the frame-moving looks that is the sheet's one
    // dent (kickPress), so the dish is pushed down where the plate is and no
    // wider, and the liquid it moves runs out as a ring and back off the rim.
    if (this.thinGap && amount > 0) {
      this.dishKicks.push({ x: (x + 0.5) / this.size, y: (y + 0.5) / this.size, amount, radii: [...radii], t: 0 });
      if (this.dishKicks.length > 2) this.dishKicks.shift();
    }
  }

  /**
   * Sound Drive's bass on a thin gap (PLAN 27e): the glass held `depth` down
   * over a disc of `radius` cells about (x, y), followed each step and let up
   * as the bass falls (depth 0 lets it all go). Off a thin gap it lets go of
   * anything it held: there the bass burst pushes as it always has.
   */
  pressBass(x: number, y: number, radius: number, depth: number): void {
    if (!this.thinGap) { if (this.bassPress.depth > 0) this.bassPress.letGo(this.size, false, this.squishCell); return; }
    this.bassPress.follow(this.size, x, y, radius, depth, true, this.squishCell);
  }

  /** Whether the plate is stepping as a thin gap (PLAN §18a), where a hand lays only the glass. */
  get thinGap(): boolean { return !!this.gpu?.thinGapLive; }

  /** One cell of a press, a lift or a splash: into the deltas on the GPU, into the fields on the CPU engine. */
  private readonly squishCell = (idx: number, gap: number, vx: number, vy: number, m: number): void => {
    this.dirty = true;
    this.vx[idx] += vx;
    this.vy[idx] += vy;
    if (this.gpu) {
      if (m !== 1) this.mul[idx] *= m;
      this.gap[idx] += gap;    // a delta; the shader clamps and derives dh/dt
      return;
    }
    if (m !== 1) { this.density[idx] *= m; this.densityR[idx] *= m; this.densityG[idx] *= m; this.densityB[idx] *= m; }
    const prevGap = this.gap[idx];
    // As the shader's squeezeUpdate: a lift opens the glass back to rest (0.03 here), never past it.
    this.gap[idx] = gap > 0 ? Math.min(prevGap + gap, Math.max(prevGap, 0.03)) : Math.max(0.005, prevGap + gap);
    this.dhdt[idx] = (this.gap[idx] - prevGap) / Math.max(this.dt, 0.0001);
  };

  /**
   * A puff of air: out from the middle, with a swirl, and (`erase`) the dye
   * under it thinned by 0.8 a step. The show's own puffs erase: a pour's
   * burst, the automation's breath and a bubble's pop, where a clearing is
   * the look. A hand's Blow does not (blowWind, PLAN.md §15c). No default:
   * a new hand that called this for a breath would erase without a word.
   */
  blowAir(x: number, y: number, radius: number, strength: number, erase: boolean) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq >= r2 || distSq === 0) continue;
        const nx = x + i;
        const ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          const dist = Math.sqrt(distSq);
          this.dirty = true;
          /*
            A puff is not only a push outward.

            This was purely radial, and a purely radial field is exactly what
            the pressure projection exists to remove — so most of a puff was
            deleted at the end of the very step that applied it, and what
            little survived was gone inside a second. That is why blowing
            registered as a nudge that stopped rather than as something the
            plate remembers.

            Real air does not push a liquid aside so much as roll vorticity
            into it, and vorticity is the part a projection cannot touch. So
            the puff carries a swirl as well, and the swirl is what is still
            turning long after the push has been solved away.

            The direction comes from where the puff landed rather than from a
            random number: the same show rendered twice has to be the same
            film twice.
          */
          const swirl = ((x * 7 + y * 13) & 1) === 0 ? BLOW_SWIRL : -BLOW_SWIRL;
          this.vx[idx] += ((i / dist) + (-j / dist) * swirl) * strength;
          this.vy[idx] += ((j / dist) + (i / dist) * swirl) * strength;
          if (!erase) continue;
          if (this.gpu) {
            this.mul[idx] *= 0.8;     // multiplicative change rides its own delta channel
          } else {
            this.density[idx] *= 0.8;
            this.densityR[idx] *= 0.8;
            this.densityG[idx] *= 0.8;
            this.densityB[idx] *= 0.8;
          }
        }
      }
    }
  }

  /**
   * Cavity collapse and fluid shockwave when a bubble pops.
   *
   * Surface tension and pressure drive surrounding liquid rapidly inward
   * to fill the collapsing void, while asymmetric rupture rolls an annular
   * vortex ring into the flow. Unlike an outward air puff, dye is preserved
   * rather than erased, leaving the fill pass (bubbleDye.ts) to heal the hole.
   */
  popBubble(x: number, y: number, radius: number, strength: number) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq >= r2 || distSq === 0) continue;
        const nx = x + i;
        const ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          const dist = Math.sqrt(distSq);
          this.dirty = true;
          const swirl = ((x * 7 + y * 13) & 1) === 0 ? BLOW_SWIRL : -BLOW_SWIRL;
          this.vx[idx] += ((-i / dist) + (-j / dist) * swirl) * strength;
          this.vy[idx] += ((-j / dist) + (i / dist) * swirl) * strength;
        }
      }
    }
  }

  /**
   * A finger drawn through the liquid: it carries what it touches and loosens it.
   *
   * The drag is the easy half and it is deliberately not a push. A push is
   * radial, radial is curl-free, and curl-free is what the projection removes —
   * this codebase has paid for that five times. A finger does not push anyway:
   * it drags, and what a drag leaves behind is a shear, which is vorticity and
   * survives. So the velocity added is the finger's own motion in the middle
   * and a counter-rotation either side of its track, which is the pair of
   * vortices a stick pulled through water actually leaves.
   *
   * On a thin gap (every look) none of the above is how it moves the
   * liquid: it is a solid in the layer, and the flow carries what it touches
   * (see the first block below, PLAN.md §15b).
   *
   * The other half is `stir` on the liquid field, and it is the part no other
   * tool can do: it averages the chemistry under the finger, so two liquids
   * that refuse each other are briefly one liquid and stay mixed after the
   * finger has gone.
   */
  fingerDrag(x: number, y: number, radius: number, strength: number, dx: number, dy: number, phase = true, moved?: { x: number; y: number }): void {
    const r = Math.round(radius * GRID_SCALE);
    const r2 = r * r;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-4)) return;
    const ux = dx / len, uy = dy / len;
    /*
      On a thin gap (every look since #248) the finger is a solid in the
      layer, moving as far as the hand moved this step (`moved`: the
      pointer's stroke is its own, a remote's or the automation's stroke
      says what it moved), and the flow carries everything it touches: the
      colour, the oil and the ferrofluid alike, conserved by the carries
      that move them with the flow, so none of the hand-written carries
      below runs (PLAN.md §15b; lib/handSolid.ts has the story and the
      numbers, `npm run fingerflow` the check). How hard the hand pressed
      (`strength`, the tool's Amount) does not change how fast the liquid
      it touches goes, which is the hand's own speed; it was the size of a
      push, and a solid has no push to size. Amount still mixes the
      chemistry under it harder (stir, below).

      Not the automation's stroke on a plate with ferrofluid on it
      (`phase` false): a solid moves every liquid alike, and it would pull
      tongues out of the pools unasked (see the ferrofluid's carry below).
      That stroke keeps the colour's carry, as it had.
    */
    const ferroUnasked = !phase && !!(this.gpu as { phaseIsLive?: boolean } | null)?.phaseIsLive;
    if (this.gpu && this.thinGap && !ferroUnasked) {
      const m = moved ?? { x: dx, y: dy };
      if (!this.hands) this.hands = new Float32Array(GRID_AREA * 4);
      if (layFinger(this.hands, this.size, x, y, r, m.x, m.y) > 0) { this.rows.disc(y, r); this.handsLaid = true; }
      this.liquid.stir(x, y, r, Math.min(0.5, strength * 2.5));
      return;
    }
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const d2 = i * i + j * j;
        if (d2 >= r2) continue;
        const nx = x + i, ny = y + j;
        if (nx <= 0 || nx >= this.size - 1 || ny <= 0 || ny >= this.size - 1) continue;
        const idx = nx + ny * this.size;
        const w = 1 - Math.sqrt(d2) / r;
        this.dirty = true;
        // Across the track: which side of the finger this cell is on.
        const side = i * -uy + j * ux;
        const sgn = side >= 0 ? 1 : -1;
        const rr = Math.sqrt(d2) || 1;
        // Carried along, and rolled either side — the wake of a stick in water.
        this.vx[idx] += (ux + (-j / rr) * sgn * FINGER_SWIRL) * strength * w;
        this.vy[idx] += (uy + (i / rr) * sgn * FINGER_SWIRL) * strength * w;
      }
    }
    /*
      And the dye is carried, because adding velocity does not carry it.

      The velocity above is kept — it disturbs the beads and feeds the flow —
      but it is not what moves the liquid, and the commit that added this tool
      claimed otherwise. It argued that a drag leaves a shear, which is
      vorticity, which survives the projection. That was a hypothesis and it
      was never measured. Measured now, against an idle plate over the same
      window:

        idle          speed 2.47e-1   dye moved 0.1382
        addVelocity   speed 2.49e-1   dye moved 0.1012   (0.5 a cell, 250x the clamp)
        blow          speed 2.52e-1   dye moved 0.1138
        finger        speed 2.48e-1   dye moved 0.1182

      Every tool leaves the plate at an idle plate's speed. Strength is not it
      (a quarter-thousand times the speed clamp does nothing) and neither is
      the clamp (raising it tenfold does nothing). It is the projection, for
      the seventh time in this codebase: a localised blob of velocity is mostly
      a gradient, and a gradient is what the projection exists to remove.

      So the dye is moved the way the press moves it and the magnet moves the
      phase — as transport, on the CPU, where the gesture's geometry is known.
      Dye is taken from behind the finger and put in front of it, conserving
      because both halves read the same mirror.
    */
    // More per act than it was: it acts once per current reading, not every step.
    const carried = this.carryDye(x, y, r, ux, uy, Math.min(0.75, strength * 8));
    /*
      With Oil Bodies the oil goes with its colour, the same take and the
      same hop (carryMix), and only when the colour went (the carry acts once
      per reading of the dye, not every step). Before the deltas fold, so the
      colour carried here lands in the oil that went with it and stays the
      oil's.
    */
    if (carried && (this.lastSettings?.oilBodies ?? 0) > 0.001 && this.gpu?.carryMix) {
      const L = this.size;
      this.gpu.carryMix(x / L, y / L, r / L, ux, uy, Math.min(0.75, strength * 8), Math.max(1, Math.round(r * 0.45)) / L);
    }
    /*
      And the ferrofluid, the same take and the same hop, when the colour
      went: it rode the flow alone and stayed where it was under a Finger
      (asked: "Shouldn't blowing and finger also move around the
      ferrofluid?"; PLAN.md §9n, `npm run ferrohands`). A hand's Finger
      only (phase): the automation's evolve stroke drags a finger too, and
      on a ferro look it would pull tongues out of the pools unasked, as
      the automation's breath would (see blowPhase).
    */
    const fc = carried && phase && this.gpu?.carryPhase ? fingerCarry(x, y, radius, strength, dx, dy, this.size) : null;
    if (fc) this.gpu!.carryPhase!(fc.x, fc.y, fc.r, fc.ux, fc.uy, fc.take, fc.hop, fc.outward);
    // And the chemistry under it is averaged, which is the mixing.
    this.liquid.stir(x, y, r, Math.min(0.5, strength * 2.5));
  }

  /**
   * Dye taken from behind a gesture and put in front of it.
   *
   * The conserving half of a drag: what leaves one cell arrives in another,
   * because both are read from the same mirror in the same pass.
   */
  private carryDye(cx: number, cy: number, r: number, ux: number, uy: number, take: number): boolean {
    if (!this.gpu || !this.dyeMirrorCurrent()) return false;
    // A short hop: far enough to read as carried, short enough that the dye
    // lands somewhere the finger is still touching.
    const hop = Math.max(1, Math.round(r * 0.45));
    const out = { mul: this.mul, density: this.density, densityR: this.densityR, densityG: this.densityG, densityB: this.densityB };
    if (carryDyeAlong(this.gpu.rbDyeView, this.size, cx, cy, r, ux, uy, take, hop, out) > 0) {
      this.dirty = true;
      this.dyeMoved();
    }
    return true;
  }

  /** A puff with a direction: air pushed across the plate the way a straw or a pen tilt would. */
  blowDirected(x: number, y: number, radius: number, strength: number, dx: number, dy: number) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq >= r2) continue;
        const nx = x + i, ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          const w = 1 - Math.sqrt(distSq) / radius;
          this.dirty = true;
          /*
            And a directed blow rolls a *pair* of vortices, one either side of
            the jet, turning opposite ways — which is what air blown across a
            liquid actually leaves behind, and what keeps the dye moving after
            the push itself has been projected away.

            A straight push does carry some vorticity of its own, where the
            jet's profile shears against the still liquid beside it, but it is
            weak and it is all at the flanks. This puts it there on purpose.
          */
          const r = Math.sqrt(distSq) || 1;
          const side = i * -dy + j * dx;       // across the jet
          const sgn = side >= 0 ? 1 : -1;
          this.vx[idx] += (dx + (-j / r) * sgn * BLOW_SWIRL) * strength * w;
          this.vy[idx] += (dy + (i / r) * sgn * BLOW_SWIRL) * strength * w;
        }
      }
    }
  }

  /**
   * A hand's Blow that is not the straw: the wind. It pushes the flow
   * (along the way the hand went, or out from the middle held still) and
   * carries the colour, and with Oil Bodies the oil with it, rather than
   * erasing the colour under it as it did (PLAN.md §15c; blowDye in
   * lib/handCarry.ts has the story and the numbers, `npm run wind` the
   * check). The ferrofluid's half is blowPhase, which the hands call
   * alongside, straw or wind. `dx`, `dy` of zero is held still.
   *
   * The carry acts once per reading of the dye, as the Finger's and the
   * Press's do (dyeMoveAfter): the mirror is a frame or two old, and a carry
   * run every step would take the colour it had already moved and put it
   * down again. The oil keeps its own clock, the Press's (oilPressAfter),
   * so a breath over a body with no colour under it is not carried every
   * step at a share sized for one carry a reading. Returns the colour it
   * moved (in the mirror's units), for `npm run tools`.
   */
  blowWind(x: number, y: number, radius: number, strength: number, dx: number, dy: number, air = true): number {
    const moving = Math.hypot(dx, dy) > 1e-4;
    this.lastBlowAired = false;
    /*
      On a thin gap (every look since #248) the moving wind is air on the
      film (PLAN.md §15g; lib/breath.ts has the physics and the numbers,
      `npm run airblow` the check): the breath's stress on the surface, a
      force the solve takes in with the other body forces for as long as the
      breath goes on, and the flow it drives carries the colour, the oil and
      the ferrofluid, so neither the push below nor any carry runs. The
      Amount (`strength` against the tool's own) is how hard one blows.
      Held still, a puff is the jet's pressure and an outward shear, which a
      rigid film moves nothing by; it keeps the carries until the jet's
      dimple is built (PLAN.md 15g-2). And a remote hand's wind (`air`
      false) keeps them too: its strokes arrive a message at a time, so a
      breath laid only on those steps would push the liquid for one step in
      every few, a fraction of the mouse's, until it is held between
      messages as the pointer's direction is (PLAN.md 15g-5).
    */
    if (moving && air && this.airsFilm()) {
      if (!this.breath) this.breath = new Float32Array(GRID_AREA * 4);
      const r = radius * GRID_SCALE;
      if (layBreath(this.breath, this.size, x, y, r, dx, dy, strength / BLOW_STRENGTH) > 0) {
        this.rows.disc(y, r); this.breathLaid = true; this.lastBlowAired = true;
      }
      return 0;
    }
    if (moving) this.blowDirected(x, y, radius, strength, dx, dy);
    else this.blowAir(x, y, radius, strength, false);
    if (!this.gpu) return 0;
    const N = this.size;
    if ((this.lastSettings?.oilBodies ?? 0) > 0.001 && this.gpu.rbDyeLanded >= this.oilPressAfter) {
      blowOil(this.gpu, x, y, radius, strength, dx, dy, N);
      this.oilPressAfter = this.gpu.rbDyeIssued + 1;
    }
    if (!this.dyeMirrorCurrent()) return 0;
    const out = { mul: this.mul, density: this.density, densityR: this.densityR, densityG: this.densityG, densityB: this.densityB };
    const moved = blowDye(this.gpu.rbDyeView, N, x, y, radius, strength, dx, dy, out);
    if (!(moved > 1e-4)) return 0;
    this.dirty = true;
    this.dyeMoved();
    return moved;
  }

  /** Whether a moving Blow blows as air on the film here: a thin gap on the GPU (blowWind). */
  private airsFilm(): boolean {
    return !!this.gpu && this.thinGap;
  }

  /**
   * A hand's Blow on the ferrofluid (PLAN.md §9n): held still it opens a
   * hole, moved it pushes the ferrofluid along (blowCarry). Its own method,
   * called where a hand blows, and not inside blowAir: blowAir is also the
   * pour event's burst, the automation's breath and every bubble's pop,
   * and a pour-sized carry would punch a hole a fifth of the plate across
   * in a ferro look (and take 220 times the tool's puff to run).
   *
   * The push blowAir and blowDirected add barely moves it: it lasts one
   * step before the solver's speed clamp cuts it back (phaseCarry, in the
   * solver's shaders, has the numbers).
   */
  blowPhase(x: number, y: number, radius: number, strength: number, dx: number, dy: number): void {
    if (!this.gpu?.carryPhase) return;
    // A moving wind on a thin gap is air on the film, whose flow carries the ferrofluid (blowWind).
    if (Math.hypot(dx, dy) > 1e-4 && this.airsFilm()) return;
    const c = blowCarry(x, y, radius, strength, dx, dy, this.size);
    this.gpu.carryPhase(c.x, c.y, c.r, c.ux, c.uy, c.take, c.hop, c.outward);
  }

  /*
    `dye`, the share of `amount` that is colour: 0 for a clear liquid poured
    with no dye in it (lib/liquidColour.ts). A drop's impact is its size, not
    its colour, so a clear drop from a height still splashes; only what it
    lays is scaled.
  */
  autoInject(style: string, x: number, y: number, amount: number, r: number, g: number, b: number, energy: number, outward = false, dye = 1) {
    const S = this.size;
    const k = GRID_SCALE;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    switch (style) {
      case 'spray': {
        const sprayR = Math.round((12 + energy * 8) * k);
        for (let ddy = -sprayR; ddy <= sprayR; ddy++) {
          for (let ddx = -sprayR; ddx <= sprayR; ddx++) {
            const dd = Math.sqrt(ddx*ddx + ddy*ddy);
            if (dd > sprayR) continue;
            const px = Math.floor(x + ddx);
            const py = Math.floor(y + ddy);
            if (px < 1 || px >= S - 1 || py < 1 || py >= S - 1) continue;
            const noise = this.rng.float();
            if (noise > 0.4) continue;
            const w = Math.pow(1 - dd / sprayR, 2) * 0.25 * (1 - noise);
            this.addDensity(px, py, amount * w, r, g, b);
          }
        }
        break;
      }
      case 'splatter': {
        const splatCount = 4 + Math.floor(energy * 6);
        for (let p = 0; p < splatCount; p++) {
          const a = this.rng.angle();
          const sprayR = (12 + this.rng.float() * 20) * k;
          const px = Math.floor(x + Math.cos(a) * sprayR);
          const py = Math.floor(y + Math.sin(a) * sprayR);
          if (px < 1 || px >= S - 1 || py < 1 || py >= S - 1) continue;
          
          const dropR = Math.round((1 + this.rng.float() * 2) * k);
          for (let ddy = -dropR; ddy <= dropR; ddy++) {
            for (let ddx = -dropR; ddx <= dropR; ddx++) {
              const dd = Math.sqrt(ddx * ddx + ddy * ddy);
              if (dd > dropR) continue;
              const nx = clamp(px + ddx, 1, S - 2), ny = clamp(py + ddy, 1, S - 2);
              this.addDensity(nx, ny, amount * (1 - dd / dropR) * 0.6, r, g, b);
            }
          }
          this.addVelocity(px, py, Math.cos(a) * (0.3 + energy * 0.5), Math.sin(a) * (0.3 + energy * 0.5));
        }
        break;
      }
      case 'pour': {
        const pourR = Math.round((3 + Math.floor(energy * 2)) * k);
        for (let ddy = -pourR; ddy <= pourR; ddy++)
          for (let ddx = -pourR; ddx <= pourR; ddx++) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd > pourR) continue;
            const nx = clamp(x + ddx, 1, S - 2), ny = clamp(y + ddy, 1, S - 2);
            const w = Math.pow(1 - dd / pourR, 1.5);
            this.addDensity(nx, ny, amount * 1.3 * w, r, g, b);
            /*
              `outward` is a hand's Pour from anywhere but the mouse, which
              spreads from where it lands as the mouse's does (see the hand
              loop's Pour: the camera looks straight down, and any downhill is
              Gravity's). Without it this is the show's own pour, for Evolve,
              the music, Seed and a score of looks' inject styles, which has
              always run toward +y and which the lyric theme `earth` leans on
              to settle low; those are left as they were.
            */
            if (outward) { if (dd > 0) this.addVelocity(nx, ny, (ddx / dd) * 0.1 * w, (ddy / dd) * 0.1 * w); }
            else this.addVelocity(nx, ny, 0, 0.1 * w);
          }
        break;
      }
      case 'streak': {
        const a = this.rng.angle();
        const len = (5 + Math.floor(energy * 10)) * k;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let t = -len; t <= len; t += 0.8) {
          const sx = Math.floor(x + dx * t), sy = Math.floor(y + dy * t);
          if (sx < 1 || sx >= S - 1 || sy < 1 || sy >= S - 1) continue;
          const w = 1.0 - Math.abs(t) / len;
          this.addDensity(sx, sy, amount * 0.35 * w, r, g, b);
          this.addVelocity(sx, sy, dx * 0.2 * w, dy * 0.2 * w);
        }
        break;
      }
      default: { // drop
        // How hard it lands: the height it fell from, times how big a drop it
        // is — so a real drop from the dropper or the bench splashes, and the
        // faint pulse the music lays down on every frame (which also takes this
        // shape) does not.
        const h = Math.max(0, Math.min(1, this.dropHeight));
        // Impact grows as the square root of the height (the speed a fall
        // reaches does), so the middle of the slider already splashes.
        const e = Math.sqrt(h) * Math.min(1.5, amount / 5);
        // A drop from higher spreads thinner as it lands: a wider disc, the
        // same dye.
        const spread = 1 + 0.6 * e;
        const dropR = Math.round(3 * k * spread);
        const thin = 1 / (spread * spread);
        for (let ddy = -dropR; ddy <= dropR; ddy++)
          for (let ddx = -dropR; ddx <= dropR; ddx++) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd > dropR) continue;
            const nx = clamp(x + ddx, 1, S - 2), ny = clamp(y + ddy, 1, S - 2);
            this.addDensity(nx, ny, amount * dye * thin * Math.pow(1 - dd / dropR, 2), r, g, b);
          }
        if (e > 0.02) this.splash(x, y, dropR, h, e, amount * dye, r, g, b);
        break;
      }
    }
  }

  /*
    A drop landing from a height: what liquid falling into liquid does between
    two plates of glass.

    - It presses the film. The impact is a squeeze pulse under the drop — the
      same machinery as the beat squeeze and the Press tool — which drives the
      liquid out in a ring and, with Fingering up, breaks the ring into fingers.
    - The crown pushes outward: a ring-shaped kick just outside the drop, the
      liquid it displaced shoving its neighbours.
    - It throws satellites: droplets of its own dye flung clear of the impact,
      more of them and further out the higher it fell.

    `e` is the impact (height × drop size); `h` the height alone, which sets
    how far things are thrown.
  */
  private splash(x: number, y: number, dropR: number, h: number, e: number, amount: number, r: number, g: number, b: number) {
    const S = this.size;
    const k = GRID_SCALE;
    const inside = (px: number, py: number) => px >= 2 && px < S - 2 && py >= 2 && py < S - 2;
    this.applySquish(x, y, (dropR / k) * (1.6 + 1.8 * h), 0.0012 * e, this.dropFingering, true, 'splash');

    const r0 = dropR * 0.6, r1 = dropR * (2 + 3 * h);
    const R = Math.ceil(r1);
    for (let j = -R; j <= R; j += 2) {
      for (let i = -R; i <= R; i += 2) {
        const d = Math.sqrt(i * i + j * j);
        if (d < r0 || d > r1) continue;
        const px = x + i, py = y + j;
        if (!inside(px, py)) continue;
        const f = 0.9 * e * Math.sin(Math.PI * (d - r0) / (r1 - r0));
        this.addVelocity(px, py, (i / d) * f, (j / d) * f);
      }
    }

    const n = Math.round(e * 7 * (0.6 + this.rng.float() * 0.8));
    for (let q = 0; q < n; q++) {
      const a = this.rng.angle();
      const dist = dropR * (1.4 + (1 + 5 * h) * this.rng.float());
      const px = Math.round(x + Math.cos(a) * dist), py = Math.round(y + Math.sin(a) * dist);
      if (!inside(px, py)) continue;
      const sr = Math.max(1, Math.round((0.8 + this.rng.float() * 1.2) * k * Math.min(1, 0.6 + 0.3 * e)));
      for (let dy = -sr; dy <= sr; dy++) {
        for (let dx = -sr; dx <= sr; dx++) {
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > sr || !inside(px + dx, py + dy)) continue;
          this.addDensity(px + dx, py + dy, amount * 0.22 * (1 - dd / sr), r, g, b);
        }
      }
      const kick = (0.25 + 0.5 * h) * Math.min(1, e);
      this.addVelocity(px, py, Math.cos(a) * kick, Math.sin(a) * kick);
    }
  }

  applyVibration(intensity: number, frequency: number, time: number) {
    if (intensity <= 0.0005 || frequency <= 0.001) return;
    const freqX = frequency * 0.5;
    const freqY = frequency * 0.5;
    const speed = time * 20;

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        if (this.density[idx] > 0.05) {
          this.vx[idx] += Math.sin(i * freqX + speed) * Math.cos(j * freqY) * intensity;
          this.vy[idx] += Math.cos(i * freqX) * Math.sin(j * freqY + speed) * intensity;
        }
      }
    }
  }

  step(settings: VisualizerSettings, audioData: AudioData | null, time: number, noise2D: (x: number, y: number) => number) {
    this.lastSettings = settings;
    // ── Dynamic speed — settings only, no audio energy to avoid clock jumps ──
    let dynamicSpeed = 0.05;
    dynamicSpeed += settings.platePressure * 0.02;
    dynamicSpeed += settings.airVelocity * 0.01;
    dynamicSpeed += settings.automateRate * 0.01;

    /*
      A setting that is not a number must not become a timestep.

      `settings.globalSpeed` is typed as one, and at run time it comes from
      whatever was in a saved look or off a wire, where a key can simply be
      missing. Undefined divided by 0.05 is NaN, NaN multiplies through
      `dynamicSpeed`, and the clamp below does not stop it: `Math.max(NaN, x)`
      is NaN and so is `Math.min(NaN, y)`. This is the same NaN-transparent
      clamp that let a non-finite bead reach `createRadialGradient` and freeze
      the plate — the comment in `plate.mjs` is about that one.
    */
    let speedMultiplier = (Number.isFinite(settings.globalSpeed) ? settings.globalSpeed : 0.05) / 0.05;
    if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
    dynamicSpeed *= speedMultiplier;

    /*
      And the clock leans forward and back.

      The note above says audio energy is kept out of the timestep to stop it
      jumping, and that is right: a clock that tracks a kick drum stutters,
      because a solver asked for a big step and then a small one does not
      advect smoothly, it lurches. What is safe is a *slow* lean, so this rides
      the phrase's drift rather than its gust — seconds, not beats — and is
      slewed on top of that so no single frame can move it far. Nothing else in
      the plate reads the clock, so this is the only place speed can come from
      without the picture tearing.
    */
    /*
      Follow the whole phrase, and let the slew be what keeps it civil.

      This followed the drift alone, on the reasoning that a clock which jumps
      with a gust would lurch. True, but the drift hovers around the middle of
      its range — measured on a running plate it sat between 0.45 and 0.58 —
      so the lean never left a few percent of 1 and the timestep moved by three
      percent over half a minute. Which is not a speed-up by any definition.

      The slew below is the thing that stops a lurch, and it is a two and a
      half second time constant: a gust that takes half a second to arrive is
      already smoothed into a swell by the time the clock sees it. So take the
      whole drive and let the filter do its job.
    */
    const want = 1 + (this.phrase.drive - 1) * 0.85;
    /*
      Slewed on seconds rather than on steps.
      
      This was a flat 0.02 per solver step, which is not a smoothing constant
      at all — it is a different smoothing constant on every machine. At sixty
      steps a second it arrives in under a second; on the box this was measured
      on, running two steps a second, it needed half a minute and so never
      arrived at all, which is most of why the first version of the phrasing
      measured as doing nothing. A time constant is the same on both.
    */
    this.clockLean += (want - this.clockLean) * (1 - Math.exp(-this.dtSeconds / 2.5));
    dynamicSpeed *= this.clockLean;
    // And the music's own pace (lib/tempoPace.ts), already slewed by the frame.
    dynamicSpeed *= Number.isFinite(this.tempoMul) ? this.tempoMul : 1;
    /*
      And the scene's (lib/scenePacing.ts), after the lean rather than through
      it. The phrase's drive can jump with a gust, so the lean slews it on 2.5
      seconds; a scene's swell is already a smooth curve, arriving over 1.5 to
      3 seconds, and put through that slew as well it measured as barely a
      swell at all (`npm run pacing`: the clock reached about half of each
      one). The frame smooths it on a third of a second, which is enough.
    */
    dynamicSpeed *= Number.isFinite(this.paceMul) ? this.paceMul : 1;

    // Plates behind the lead are the background loop: the same show, slower
    // and calmer, that the live plate is worked over.
    if (this.layerIndex > 0) dynamicSpeed *= 1 - 0.7 * Math.max(0, Math.min(1, settings.backgroundLoop ?? 0));

    /*
      The timestep, stretched to whatever rate the loop is stepping at (H2b).

      How far the liquid travels in a second is `steps per second × dt`. The
      loop sets the first and this scales the second, so halving the rate and
      doubling `dt` is the same motion for half the work.

      `dtSeconds` is what the frame told this plate one step stands for, so
      the stretch is measured rather than assumed: it is one while the loop
      runs at sixty, and follows the governor down without this needing to
      know the governor exists.
    */
    const wantDt = dynamicSpeed * 0.2 * (this.dtSeconds / SIM_STEP);
    // Finite first, then clamped: a clamp cannot catch a NaN, it carries one.
    this.dt = Number.isFinite(wantDt) ? Math.min(Math.max(wantDt, DT_FLOOR), 0.05) : DT_FLOOR;
    this.stepIndex++;
    this.liftStep();

    const p = this.deriveStep(settings, audioData, time, noise2D);
    this.lastStep = p;
    // The closeup's cells ride this: as far as this step moves the dye.
    this.cellClock = advanceCellClock(this.cellClock, stepDisplacement(p.dt, p.advection, this.gpu?.N ?? this.size));

    if (this.gpu) {
      const applied = this.dirty || this.videoLaid;
      if (applied) this.flushDeltas(p.dt);
      this.stepSlosh(settings, p);
      this.gpu.step(p, applied);
      return;
    }

    const dt = p.dt;

    // 1. Squeeze-Film Flow
    this.solveSqueezePressure(p.visc);
    this.updateSqueezeVelocity(p.visc);

    // 2. Buoyancy, the rock and centre gravity act on the lasting current now
    // (stepCurrent, below); here the end-of-step limit took them straight out.

    // 3-6. Velocity: diffuse → project → advect → project
    this.diffuse(1, this.vx0, this.vx, p.nu, dt);
    this.diffuse(2, this.vy0, this.vy, p.nu, dt);
    this.project(this.vx0, this.vy0, this.vx, this.vy);
    // Velocity takes the cheaper first-order transport: MacCormack pays for
    // itself on the dye, where it keeps filaments, and costs a third of the
    // step on a field nobody sees directly.
    this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, dt * p.advection);
    this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, dt * p.advection);
    this.project(this.vx, this.vy, this.vx0, this.vy0);

    // 6.5. Multi-octave curl turbulence — detail at every scale
    this.applyCurlTurbulence(p.turbScale, p.turbDetail, time, noise2D);

    // 6.6. Mid/treble-driven vorticity — small spinning eddies in dense dye
    if (p.spin > 0) this.injectVorticity(p.spin, time, noise2D);

    // 7. Immiscibility (the fingering push is gone: see forcesB in wgsl/fluid.ts)
    this.applyImmiscibility(p.immiscibility, time, noise2D);

    // 8. Vibration — only when explicitly cranked up
    if (p.vibIntensity > 0) this.applyVibration(p.vibIntensity, p.vibFrequency, time);

    // 8.5-8.7 Dripping, smearing, airflow — only above meaningful thresholds
    if (p.drip > 0) this.applyDripping(p.drip, dt, time, noise2D);
    if (settings.glassSmear > 0.2) this.applySmear(settings.glassSmear, dt, time, noise2D, audioData);
    if (p.air > 0) this.applyAirflow(p.air, dt, time, noise2D);

    // 8.9. The lasting current joins the flow the dye is about to ride.
    this.stepCurrent(p);

    // 9. Diffuse & advect density + temp. MacCormack keeps the filaments that
    // plain semi-Lagrangian transport would smear away within a few steps.
    this.diffuse(0, this.s,     this.density,  p.diff, dt, 4);
    this.diffuse(0, this.sR,    this.densityR, p.diff, dt, 4);
    this.diffuse(0, this.sG,    this.densityG, p.diff, dt, 4);
    this.diffuse(0, this.sB,    this.densityB, p.diff, dt, 4);
    this.diffuse(0, this.temp0, this.temp,     p.diff, dt, 4);
    this.advectMacCormack(0, this.density,  this.s,     this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityR, this.sR,    this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityG, this.sG,    this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityB, this.sB,    this.vx, this.vy, dt * p.advection);
    this.advect(0, this.temp,     this.temp0, this.vx, this.vy, dt * p.advection);

    // 9.5. Sharpen the interfaces the advection and the diffusion just softened.
    this.sharpenDye(p.sharpness);

    // 10. Evaporation, damping, stability — after keeping the flow the dye
    // was just carried by, for the readers (readVx/readVy).
    this.fvx.set(this.vx);
    this.fvy.set(this.vy);
    let densSum = 0, colR = 0, colG = 0, colB = 0;
    for (let i = 0; i < GRID_AREA; i++) {
      this.vx[i] *= p.damping;
      this.vy[i] *= p.damping;
      const speedSq = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
      if (speedSq > 0.000004) {
        const factor = 0.002 / Math.sqrt(speedSq);
        this.vx[i] *= factor;
        this.vy[i] *= factor;
      }
      if (!this.thinGap) {
        this.density[i]  *= p.evapFactor;
        this.densityR[i] *= p.evapFactor;
        this.densityG[i] *= p.evapFactor;
        this.densityB[i] *= p.evapFactor;
      } else {
        const x = (i % this.size + 0.5) / this.size - 0.5;
        const y = (Math.floor(i / this.size) + 0.5) / this.size - 0.5;
        if (x * x + y * y >= OPEN_RIM * OPEN_RIM) {
          this.density[i] = 0;
          this.densityR[i] = 0;
          this.densityG[i] = 0;
          this.densityB[i] = 0;
        } else {
          this.density[i]  *= p.evapFactor;
          this.densityR[i] *= p.evapFactor;
          this.densityG[i] *= p.evapFactor;
          this.densityB[i] *= p.evapFactor;
        }
      }
      // Per-cell soft cap — keeps color ratios but stops runaway thickness,
      // so fresh dye can always shift a cell's hue
      if (this.density[i] > 6) {
        const capScale = 6 / this.density[i];
        this.density[i] *= capScale;
        this.densityR[i] *= capScale;
        this.densityG[i] *= capScale;
        this.densityB[i] *= capScale;
      }
      densSum += this.density[i];
      colR += this.densityR[i]; colG += this.densityG[i]; colB += this.densityB[i];
      this.temp[i]     *= p.heatDecay;
      this.dhdt[i]     *= 0.5;
      this.gap[i]       = Math.min(0.03, this.gap[i] + 0.005);

      // NaN guard
      if (isNaN(this.density[i]))  this.density[i]  = 0;
      if (isNaN(this.densityR[i])) this.densityR[i] = 0;
      if (isNaN(this.densityG[i])) this.densityG[i] = 0;
      if (isNaN(this.densityB[i])) this.densityB[i] = 0;
      if (isNaN(this.vx[i]))      this.vx[i]       = 0;
      if (isNaN(this.vy[i]))      this.vy[i]       = 0;
    }
    const area = this.thinGap ? this.dishArea : GRID_AREA;
    this.meanDensity = densSum / area;
    this.meanColor = [colR / area, colG / area, colB / area];
  }

  /**
   * Everything one step needs, derived once from settings and audio so the CPU
   * and GPU solvers run from the same numbers.
   */
  /**
   * Downhill, in the plate, for a tilt pointing `degrees` round the screen
   * (0 the top, 90 right, 180 the bottom, 270 left).
   *
   * The camera looks straight down, so the screen has no "up": the tilt is
   * which edge of the plate stands propped, and it belongs to the stage, not
   * the dish, so it stays put while the dish turns under it. The screen is
   * the plate turned by `plateAngle` (uvToFluid in wgsl/plate.ts), so the
   * screen direction is turned back by it. The reach is how far the screen
   * extends that way from the centre: the lamp sits just past it.
   */
  private downhill(degrees: number): { gravityX: number; gravityY: number; gravityReach: number } {
    const t = (Number.isFinite(degrees) ? degrees : 180) * Math.PI / 180;
    const dx = Math.sin(t), dy = Math.cos(t);
    const c = Math.cos(this.plateAngle), s = Math.sin(this.plateAngle);
    return {
      gravityX: dx * c + dy * s,
      gravityY: -dx * s + dy * c,
      gravityReach: Math.abs(dx) * this.viewHalfW + Math.abs(dy) * this.viewHalfH,
    };
  }

  /**
    The slosh dish (lib/slosh.ts, gpu/slosh.ts): what drives it this frame,
    handed to the solver, which steps it on the GPU before its own step. Led
    by what the owner's hand sets (the Gravity and Tilt Direction faders and the
    phone's tilt, through the Slosh dial) and by Beat Squeeze's glass on the
    kick (`pressKick`), the same glass the thin gap is pressed by. And by Plate
    Rock's swing only as far as Frame Sway lets the music move the frame
    (rockAccel: a rocked dish sways the whole picture), so at Frame Sway's
    default 0 not at all, and on Bass Drop at its 0.35. With nothing driving it and its ring gone (SloshClock) it is
    not stepped at all and the solver is told once, so the default plate is the
    same bits it was (`npm run slosh`, `npm run sloshgpu`).
  */
  private stepSlosh(settings: VisualizerSettings, p: GpuStepParams) {
    const gpu = this.gpu;
    if (!gpu) return;
    const dt = p.magnetSeconds ?? 1 / 60;
    // The CPU film and the other layers' solvers without a thin gap ignore it (PLAN 18a-13).
    if (!this.thinGap) {
      if (this.sloshClock.live) gpu.setSlosh(null);
      this.sloshClock.stop();
      this.dishKicks.length = 0;
      return;
    }
    const [hx, hy] = sloshAccel(settings.slosh ?? 0, p.plateUpright ?? 0, p.gravityX ?? 0, p.gravityY ?? 0, this.extTiltX, this.extTiltY);
    const [rx, ry] = rockAccel(this.swingX, this.swingY, frameSway(settings.frameSway));
    const ax = hx + rx, ay = hy + ry;
    // The kicks' glass, over the radii the gap was pressed with (kickPress: the sheet's one dent, or the glass's three nested discs on a frame-moving look), held and let go as the thin gap's are.
    const presses: SloshPress[] = [];
    for (const k of this.dishKicks) {
      const held = glassHeld(k.t, KICK_HOLD, KICK_RELEASE);
      for (const r of k.radii) presses.push({ x: k.x, y: k.y, radius: r / 128, depth: k.amount * held });
      k.t += dt;
    }
    this.dishKicks = this.dishKicks.filter((k) => k.t < KICK_HOLD + KICK_RELEASE + dt);
    const r = sloshDrag(thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS));
    const driven = ax !== 0 || ay !== 0 || presses.some((q) => q.depth > 0);
    const tick = this.sloshClock.tick(dt, driven, r);
    gpu.setSlosh(tick ? { ax, ay, nu: sloshNu(r), presses, level: tick.level } : null);
  }

  private deriveStep(settings: VisualizerSettings, audioData: AudioData | null, time: number, noise2D: (x: number, y: number) => number): GpuStepParams {
    const dt = this.dt;
    const visc = settings.viscosity === 'thick' ? 1.5 : 0.5;

    // Momentum diffuses at a viscosity derived from the plate's thickness
    // setting — not at the dye's diffusivity, which is a different quantity.
    // Scaled so the defaults reproduce the near-zero momentum diffusion the
    // presets were tuned against: in a thin film the viscous drag is carried by
    // the squeeze-film wall shear, which is modelled separately.
    const nu = visc * 0.0001;

    const turbDetail = Math.max(1, Math.min(4, Math.round(settings.turbulenceDetail ?? 3)));
    /*
      Turbulence, the hand stirring the layer (PLAN 27c). Measured on the
      Mac with the band playing (`npm run controls`, 2026-10-05): turned
      from a look's own value to full it changed nothing a person could see
      on five looks of six. Two reasons, both fixed here.

      Its top was the bottom's speed doubled: the dial was the stir's speed
      itself, and a look's 0.3 and the slider's 1 differ by three, which on
      a plate already moving with the music reads as the same drift. A hand
      stirring a dish goes from a slow trail to a stick dragged round at a
      quarter of the dish a second, so the dial runs as t(1 + 3t³): the
      looks' own values (most are 0.3 or under) within 8% of where they were
      and full four times what it was.

      And the music took the difference back. A loud track multiplied the
      stir by up to three and then held it to the larger of the dial and
      1.2, so with the band playing 0.5 already ran at 0.9 and full could
      only reach 1.2: a third more, for twice the dial. Now the music
      multiplies whatever the dial says, by at most two: audio energy still
      breathes extra stir into the field so the liquid churns with the
      music, and a loud track still cannot triple a calm look's (lib/stir.ts).
    */
    let turbScale = stirOf(settings.turbulenceScale ?? 0, audioData ? audioData.energy : null, settings.audioImpact ?? 0.45);
    if (this.layerIndex > 0) turbScale *= 1 - 0.6 * Math.max(0, Math.min(1, settings.backgroundLoop ?? 0));
    let spin = 0;
    let vibIntensity = 0, vibFrequency = 0;
    if (audioData) {
      const impact = settings.audioImpact ?? 0.45;
      const mid01 = Math.min(1, audioData.mid / 70);
      const treble01 = Math.min(1, audioData.treble / 70);
      const s = (mid01 * 0.6 + treble01 * 0.4) * impact;
      if (s > 0.08) spin = s * 0.03;
    }
    /*
      Vibration: a standing ripple on the per-step channel, the plate being
      tapped. It was energy × setting × 0.002 behind two gates (the setting above
      0.3, the result above 0.001), which with the analyser's energy topping out
      at 0.85 meant nothing below about 0.6 and nothing at all without a mic.
      Now a floor that works in silence and swells with the music.

      The first version of this ran the wavelength down to 4.6 cells at the top
      and pushed hard enough to move the dye most of a cell each way — and a
      sin × cos standing wave that fine and that deep is a checkerboard: the
      looks that set vibration high (Acid Trip 0.9, Cyberpunk 0.8, Boiling
      Point 0.7) broke up into blocky squares. The wave is 52 cells long at the
      bottom of the slider and 15 at the top now, and the dye moves at most
      about a fiftieth of a wavelength: a shimmer on the boundaries, which is
      what a tapped plate does, not a tear. `vibFrequency` is twice the wave
      number (both solvers halve it).
    */
    {
      const vf = Math.max(0, Math.min(1, settings.vibrationFrequency ?? 0));
      if (vf > 0.005) {
        const energy = audioData ? Math.min(1, audioData.energy) : 0;
        vibIntensity = vf * (0.3 + 0.7 * energy) * 0.15;
        vibFrequency = 2 * (0.12 + vf * 0.3);
      }
    }

    // blobSurfaceTension is how strongly two colours hold apart
    // (immiscibility, below). It also set a fingering push, a noise pushing
    // the dye along its own gradient, which grew a grating in every pool
    // and is gone (forcesB in wgsl/fluid.ts, and why).
    const tension = Math.max(0, Math.min(1, settings.blobSurfaceTension ?? 0.5));
    const polarity = settings.polarity || 0;
/*
      Named `immiscibility` and not `surfaceTension`, which is what it was
      called until 2026-09-21.

      There was also a *setting* called `surfaceTension`, written by all
      thirty-two presets, and this local shadowed it well enough that an
      audit for unread settings counted `p.surfaceTension` as its reads and
      called it live. It was not: nothing ever read the setting, and the
      presets' comments for it describe what `blobSurfaceTension` does. The
      setting is gone; the name goes with it so the next audit cannot be
      told the same lie.
    */
    const immiscibility = polarity * 0.04 * (0.4 + tension * 1.2);

    let smearX = 0, smearY = 0;
    if (settings.glassSmear > 0.2) {
      const t = time * 0.3;
      smearX = noise2D(t, 100) * settings.glassSmear * 12.0 * dt;
      smearY = noise2D(100, t) * settings.glassSmear * 12.0 * dt;
    }

    // Self-regulating dye budget: as the plate fills toward saturation,
    // evaporation ramps up hard so injection and removal find equilibrium
    // with plenty of empty glass left — a saturated plate has no boundaries
    // or gradients and reads as a static colour wash. A macro frame needs
    // empty ground around its subject, so the budget drops hard while the
    // closeup camera is running.
    // Eased down over the zoom's travel, not dropped at the first notch: the
    // plate emptying at 1.05x was a jump of its own (reported as the zoom
    // not being smooth, "especially at the beginning steps").
    // Named regulator shortcut (PLAN 18g / 28d-A, pending 18c-2): a seeded look
    // whose opening composition covers less of the dish than its `dyeBudget`
    // slider (`seedMean < seedBudget`, e.g. Jellyfish Bloom 0.40 to 0.47 vs 0.85, Comet
    // 0.16 vs 0.85, Cyberpunk 0.11 vs 0.50) holds its own picture, scaled by the
    // slider's position against the look's own budget (`lookTarget`, so the
    // slider stays live), so the music turns the bodies over rather than
    // filling the black void up to 0.85. And because `stepDecay` runs once per `dt`-scaled solver step while
    // frame-driven injectors run at 60 Hz, `regStepScale` scales the per-step
    // regulator ceiling by `1 / (dt / 0.05)` on seeded plates so slow-`dt` looks
    // (`jellyfish-bloom` dt 0.008, `deep-ocean` dt 0.009) hold their budget.
    const handBank = this.stepHandBank();
    const rawBudget = dyeLookTarget(this.seedMean, settings.dyeBudget ?? 0.85, this.seedBudget) + (this.seedMean !== null && this.seedMean > 0 ? handBank : 0);
    const budget = Math.max(0.06, Math.min(Math.max(1.2, this.seedMean ?? 0), rawBudget));
    const targetMean = budget + (0.28 - budget) * macroAmountOf(settings);
    const over = Math.max(0, this.meanDensity / targetMean - 1);
    /*
      Steep enough to actually hold the budget.

      At 0.012 with a ceiling of 0.02 the plate settled at **2.1x** whatever it
      was told to hold, and stayed there: measured on soap-film at evolve speed
      0.2, dye 1.05 against a budget of 0.50, for seven minutes without
      drifting back. A budget the plate runs at twice is not a budget, and what
      it produces is the fault this regulator's own comment describes — a
      saturated plate with no boundaries or gradients, reading as a static
      colour wash. Reported as "the entire screen yellow... trying to go under
      a completely dye saturated layer", and measured at the moment it happened
      as 94-95% of the plate wet with peaks at the 6.0 clamp.

      Quadratic, with the ceiling doing the work, and the linear shapes tried
      on the way here are below because both gave the fault back.

      Quadratic at 0.6 holds soap-film beautifully — 2.1x down to 1.15x — and
      overshot the other way on the looks with a small budget: macro-bead asks
      for 0.28 and sat at 0.12, less than half of it, because a flood landing
      on a thin plate makes `over` large, the square makes it enormous, and the
      bite crashes the plate through its own target. Measured as flatness:
      macro-bead 31% to 53%, cell-bloom 18% to 52%. That overshoot is the price,
      and the paragraph below is why it was paid rather than tuned away.

      Linear at 0.1 with a ceiling of 0.04 left soap-film at 1.27x and
      oil-on-water at 21% of the frame in one colour; dropping the ceiling to
      0.018 to spare the thin looks put soap-film back to 1.05 — 2.1x, exactly
      where it started — and oil-on-water back to 47%. **The ceiling is what
      does the work**, not the slope near the budget, and softening it simply
      undoes the fix.

      What it costs is the closeup looks, which run thin by design and which a
      firm ceiling thins further: macro-bead reads 31% flat before and 48-53%
      after. That is inside its own noise — the same preset measured 17%, 40%
      and 63% on three runs with nothing changed at all — while oil-on-water's
      52% to 11% is far outside its. The trade is taken with open eyes: the
      fault reported was a plate drowning in dye, and that is the half of the
      scale worth being right about.

      It cannot dry a plate out, and that is structural rather than a matter of
      tuning: `over` is clamped at zero, so at or under budget this contributes
      exactly nothing however steep it is. The only thing a bigger number can
      do is stop a plate exceeding what it was asked for.
    */
    // PLAN 18g: Kept as a named safety cap until PLAN 18c-2 (pours add volume): prevents
    // runaway saturation on looks where colour is injected without added volume.
    const regStepScale = this.seedMean !== null ? 1 / Math.max(0.08, Math.min(1, Math.max(0, this.dt) / 0.05)) : 1;
    const regulatorEvap = Math.min(0.28, Math.min(0.12, over * over * 0.6) * regStepScale);
    /*
      Only ever upward, and H6 tried the other direction and took it out
      again. A bubble's exclusion is a multiply, so it destroys the dye it
      removes, and making this loop symmetric was the first attempt at
      keeping the plate's colour. It never engaged: the deficit term is
      quadratic, so a plate 10% under its budget contributed 0.0001. The dye
      goes back where it physically went instead — a ring at the bubble's
      rim, in `depositBubbleRims` — which conserves by construction because
      both halves read the same mirror.
    */
    /*
      Per second of the plate's own time, not per step.

      This was a flat multiply applied once a step with no dt in it at all,
      while every other rate in here is scaled by dt — so lowering the speed
      slowed the liquid down and left the drying running at full pace. A plate
      set slow therefore stopped moving and went on evaporating until there
      was no dye left, and what you were looking at was the bare backdrop,
      which the randomiser had just given a new colour. That is the reported
      "random evolve fills the screen with one colour", and the older "evolve
      removes all of the dye" is the same fault without the recolour.

      Raised to dt over the reference step, the drying takes the same time per
      second of plate time at any speed, which is what a dish does.
    */
    const perStep = 1.0 - settings.evaporationRate * 0.02 - regulatorEvap;
    /*
      Referenced to a full-speed step, so no existing look changes.

      Normalising to SIM_STEP was tried first and is wrong in the other
      direction: dt at full speed is 0.05, three times the 1/60 reference, so
      every normal plate would have dried three times faster while the crawl
      stayed as it was. DT_FULL is the dt a plate runs at when the speed is up
      — the same value the clamp above stops at — so at full speed this is
      exactly the number it always was, and only a slowed plate changes, which
      is the whole point.
    */
    const DT_FULL = 0.05;
    /*
      No ceiling on the drying, and the reason is worth keeping.

      One was added here on this reasoning: at Speed 0.25 the timestep reaches
      DT_FULL, the exponent becomes one, and the budget regulator's ceiling of
      0.12 becomes 0.88 a step — 0.88^60, five parts in ten thousand left after
      a second. The arithmetic is right and the conclusion was wrong. Measured
      with the budget slammed to 0.2 and the speed to 0.25, the plate falls
      from 1.08 to 0.14 and stops there, because the overshoot clamps at zero
      and the regulator switches itself off the moment the plate reaches its
      budget. It cannot dry past the target however steep it is.

      The control said so plainly — with the ceiling and without it, the same
      readings to two decimal places — so it was taken out rather than kept as
      insurance against something that does not happen.
    */
    const evapFactor = Math.pow(Math.max(0.0001, perStep), Math.max(0, this.dt) / DT_FULL);

    return {
      dt, visc, nu,
      /*
        A bubble is a hole, so it empties the dye under it (H6 · A).

        1 is the physical answer and the default: this is the change H6
        exists to make, and every look with bubbles on it is meant to show
        it. `bubbleClear` is a look setting in the plan, for presets that
        want some of the old shading back; until the compositor half lands
        there is nothing to tune it against, so it is not a slider yet.
      */
      bubbleClear: 1,
      diff: settings.diffusionRate,
      buoyancy: settings.buoyancy,
      gravity: (settings.centerGravity || 0) * 0.05,
      tiltX: this.tiltX, tiltY: this.tiltY,
      cometX: (settings.cometSpeed ?? 0) * 1.5 * Math.cos((settings.cometAngle ?? 0) * Math.PI / 180),
      cometY: (settings.cometSpeed ?? 0) * 1.5 * Math.sin((settings.cometAngle ?? 0) * Math.PI / 180),
      advection: settings.advection,
      // The nine-point stencil pushes about twice as hard per unit as the
      // four-point one it replaced, so the slider maps to half of what it did.
      // The curve is chosen to hold the middle and compress the top: at 0.5 it
      // is the strength that measured well on the projector, and at 1.0 it stops
      // three-quarters of the way up, short of where a bright rim appears along
      // boundaries and thin dye goes blocky.
      sharpness: (s => s * (0.225 - 0.09 * s))(Math.max(0, Math.min(1, settings.sharpness ?? 0))),
      damping: settings.damping || 0.99,
      heatDecay: settings.heatDecay || 0.98,
      turbScale, turbDetail, spin, immiscibility,
      /*
        The two glasses (2026-09-21).

        `plateSpring` is a slider from 0 to 1 and the shader wants a fraction
        per *step*, so it is converted here rather than there: the ladder
        gives up the step rate before anything else, and a fixed per-step
        spring would make a press lift at two speeds on two machines.

        The old behaviour was a flat 0.005 a step over a range of 0.025 —
        five steps, a twelfth of a second — and a `gapMemory` of 0.5, which
        is a seventeen-millisecond half-life. Both are far quicker than a
        hand, which is why a press registered as a flicker.
      */
      /*
        The second phase and the magnet (H7).

        phaseScale is one slider that moves the look from beads to hands, and
        it does it by setting the tension and the magnet's falloff together —
        a big domain needs a strong tension to hold its shape and a broad pull
        to move it, and a bead needs neither. One control, because the two are
        never independently interesting.
      */
      phaseSharp: Math.max(0, Math.min(1, settings.phaseSharp ?? 0.35)),
      phaseTension: Math.max(0, Math.min(1, (settings.phaseScale ?? 0.4) * 0.45)),
      magnetX: Math.max(0, Math.min(1, settings.magnetX ?? 0.5)),
      /*
        Not flipped, and it was for a while on the strength of a bad reading.

        The phase saturates at 1, so the brightest cell is the first one to get
        there and says nothing about where the liquid went. Read that way the
        magnet looked y-flipped and a flip was duly added. Read by centre of
        mass it was never flipped: the liquid gathers 0.236 from where the
        magnet was asked for and 0.350 from the mirror of it. The instrument
        was wrong, not the axis.
      */
      magnetY: Math.max(0, Math.min(1, settings.magnetY ?? 0.5)),
      // Held further away for a bigger look, which is what spreads the pull.
      magnetHeight: magnetDepth(settings.magnetHeight, settings.phaseScale),
      magnetStrength: Math.max(0, settings.magnetStrength ?? 0),
      extraMagnets: this.extraMagnets,
      magnetRadius: this.magnetRadius,
      magnetSeconds: Math.max(0, Math.min(0.1, this.dtSeconds)),
      vorticity: Math.max(0, Math.min(1, settings.vorticityConfinement ?? 0)),
      oilTension: Math.max(0, Math.min(1, settings.oilTension ?? 0)),
      oilBodies: Math.max(0, Math.min(1, settings.oilBodies ?? 0)),
      filmHold: Math.max(0, Math.min(1, settings.filmHold ?? 0)),
      surfactantFlow: Math.max(0, Math.min(1, settings.surfactantFlow ?? 0)),
      // The front plate only: the display reads the film from the front
      // plate's packed view alone, so a film on the back plate would be
      // computed and never seen (PLAN 20b-5).
      clearFilm: this.layerIndex === 0 ? Math.max(0, Math.min(1, settings.clearFilm ?? 0)) : 0,
      solutalBuoyancy: Math.max(0, Math.min(1, settings.solutalBuoyancy ?? 0)),
      plateUpright: Math.max(0, Math.min(1, settings.plateUpright ?? 0)),
      ...this.downhill(settings.tiltDirection ?? 180),
      doubleDiffusion: Math.max(0, Math.min(1, settings.doubleDiffusion ?? 0)),
      ferroLabyrinth: Math.max(0, Math.min(1, settings.ferroLabyrinth ?? 0)),
      mazeDetail: Math.max(0, Math.min(1, settings.mazeDetail ?? 0)),
      phaseDisplace: Math.max(0, Math.min(1, settings.phaseDisplace ?? 0)),
      bzReaction: Math.max(0, Math.min(1, settings.bzReaction ?? 0)),
      liesegang: Math.max(0, Math.min(1, settings.liesegang ?? 0)),
      plateCurve: Math.max(-1, Math.min(1, settings.plateCurve ?? 0)),
      depthDrag: Math.max(0, Math.min(3, settings.depthDrag ?? 0)),
      // The plate as a Hele-Shaw cell (PLAN §18a): a switch, and the liquid's thickness for it.
      thinGap: (settings.thinGap ?? 1) > 0.5 ? 1 : 0,
      gapThickness: Math.max(0, Math.min(1, settings.gapThickness ?? THIN_GAP_THICKNESS)),
      /*
        The half-life the comment above means is in seconds, and `this.dt`
        is not one: it is the look's step, Speed × 0.2, so on Classic
        (0.0018 a step) Press Lift's default 1.55 s half-life came out at
        about fourteen seconds, and the glass was still half down long after
        the hand had gone. On the old solver that only shapes how long the
        film stays thin, and every look is tuned on it, so it stays. On a
        thin gap the glass coming up is what draws the liquid back under the
        palm, so it rises in the show's seconds, `dtSeconds`, as a hand
        lets go of it: the ring a press pushed out is a third of the way
        back in a second and within 3% of where it began once the glass is
        (`npm run presslift`, Classic's glass; on the look's clock, 4% in
        that second). Keyed on the thin gap running, not the setting: while
        its pipelines build, or where it cannot run, the old solver steps,
        and its glass stays on the clock its looks were tuned on.
      */
      gapSpring: glassSpring(settings.plateSpring ?? 0.35, this.thinGap ? this.dtSeconds : this.dt),
      gapMemory: Math.pow(0.5, this.dt / 0.22),
      platePressure: Math.max(0, Math.min(1, settings.platePressure ?? 0.4)),
      vibIntensity, vibFrequency,
      drip: settings.rainDrip > 0.01 ? settings.rainDrip : 0,
      smearX, smearY,
      air: settings.airVelocity > 0.1 ? settings.airVelocity : 0,
      evapFactor, time,
      dimmer: typeof settings.dimmer === 'number' ? settings.dimmer : 1,
      surfaceClear: this.seedMean !== null && this.seedMean > 0 && this.sparseDarkLook ? 1 : 0,
      // The lasting current. Damping is its drag per step — the first thing that
      // control has ever visibly done — and the cap keeps a step's travel under
      // ¾ of a cell whatever the Speed and Advection.
      currentDamp: Math.max(0.8, Math.min(0.995, settings.damping || 0.99)),
      currentBuoy: Math.max(0, settings.buoyancy ?? 0) * CUR_BUOY,
      rockX: plateSin(this.tiltX, this.rockX),
      rockY: plateSin(this.tiltY, this.rockY),
      coverX: this.coverX,
      coverY: this.coverY,
      currentGrav: Math.max(0, settings.centerGravity ?? 0) * CUR_GRAV,
      /*
        No stir for the look's motor (PLAN 22j). The current had one, a
        swirl round the middle at rotationSpeed × 30, fastest at the centre
        and nothing at the rim: a stand-in from when the motor turned the
        picture rigidly and nothing else made the liquid go round. The motor
        turns the dish now (22h, dishFrame), and a dish turning steadily
        under its liquid drags it round through the gap until it turns with
        the glass, after which there is nothing left to stir: the picture
        turns, and the liquid in it is still. What the glass does to the
        liquid while it catches up, or where a palm, a dome or oil grips it
        harder than the bulk, is the swirl's (spinSwirl), worked out from the
        gap's drag. The stir was most of what turned some looks (acid-trip's
        middle at 0.95 rad/s against its motor's 0.001), so their motors
        were turned up to move the liquid in view as fast (presets.ts, the
        note on Rotation Speed).
      */
      /*
        The spun dish (PLAN §22, lib/turntable.ts): the dish's speed in the
        frame that turns with the liquid, the liquid's own speed (the
        centrifuge), the bulk's drag time at the rest gap, and the liquid.
        All but the last are zero on a dish nobody turns, and the swirl
        does not run.
      */
      spinDish: this.dishSpin - this.liquidSpin,
      spinLiquid: this.liquidSpin,
      spinTau: dragSeconds(carrierViscosity(settings.viscosity)),
      spinNu: carrierViscosity(settings.viscosity),
      spinDyeWeight: dyeDensityContrast(settings.solutalBuoyancy),
      particles: settings.particles ?? 0,
      particleLife: 4,
      meanDensity: this.meanDensity,
      maxCurrent: 0.75 / Math.max(1e-6, dt * Math.max(0.01, settings.advection ?? 0.45) * (GRID_SIZE - 2)),
    };
  }

  /**
   * One step of the lasting current on the CPU engine (see GpuFluid.stepCurrent):
   * forces and drag at half the logical grid, a warm Gauss-Seidel projection,
   * then added into the velocity the dye is about to be carried by. The legacy
   * field's end-of-step limit takes it back out of vx/vy afterwards; the current
   * itself lives in cvx/cvy.
   */
  private stepCurrent(p: GpuStepParams) {
    const M = this.CM, S = this.size;
    const cvx = this.cvx, cvy = this.cvy, cpr = this.cpr, cdv = this.cdv;
    for (let j = 1; j < M - 1; j++) {
      for (let i = 1; i < M - 1; i++) {
        const k = i + j * M;
        const q = Math.min(S - 2, i * 2) + Math.min(S - 2, j * 2) * S;
        const dd = Math.tanh(this.density[q] - p.meanDensity);   // saturated (see the GPU twin)
        const upright = Math.max(0, Math.min(1, p.plateUpright ?? 0));
        let fx = p.rockX * dd;
        let fy = upright * p.currentBuoy * Math.min(50, Math.max(0, this.temp[q])) + p.rockY * dd;   // Boussinesq linear in temperature, gated on upright (see the GPU twin)
        const tx = 0.5 - (i + 0.5) / M, ty = 0.5 - (j + 0.5) / M;
        const r = Math.sqrt(tx * tx + ty * ty);
        if (r > 1e-4) { fx += (tx / r) * p.currentGrav * dd; fy += (ty / r) * p.currentGrav * dd; }
        // Relax toward the flow the forces ask for (see the GPU twin).
        let vx = cvx[k] * p.currentDamp + fx * (1 - p.currentDamp);
        let vy = cvy[k] * p.currentDamp + fy * (1 - p.currentDamp);
        const s = Math.sqrt(vx * vx + vy * vy);
        if (s > p.maxCurrent) { vx *= p.maxCurrent / s; vy *= p.maxCurrent / s; }
        cvx[k] = vx; cvy[k] = vy;
      }
    }
    // Walls: no flow through them.
    for (let i = 0; i < M; i++) { cvx[i] = cvy[i] = cvx[i + (M - 1) * M] = cvy[i + (M - 1) * M] = 0; cvx[i * M] = cvy[i * M] = cvx[M - 1 + i * M] = cvy[M - 1 + i * M] = 0; }
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const k = i + j * M;
      cdv[k] = -0.5 * (cvx[k + 1] - cvx[k - 1] + cvy[k + M] - cvy[k - M]) / M;
    }
    for (let it = 0; it < 10; it++) {
      for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
        const k = i + j * M;
        cpr[k] = (cdv[k] + cpr[k - 1] + cpr[k + 1] + cpr[k - M] + cpr[k + M]) * 0.25;
      }
      for (let i = 0; i < M; i++) { cpr[i] = cpr[i + M]; cpr[i + (M - 1) * M] = cpr[i + (M - 2) * M]; cpr[i * M] = cpr[1 + i * M]; cpr[M - 1 + i * M] = cpr[M - 2 + i * M]; }
    }
    for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
      const k = i + j * M;
      cvx[k] -= 0.5 * (cpr[k + 1] - cpr[k - 1]) * M;
      cvy[k] -= 0.5 * (cpr[k + M] - cpr[k - M]) * M;
    }
    // Into the velocity the dye is carried by, sampled up to the logical grid.
    for (let j = 1; j < S - 1; j++) {
      const y = j * 0.5 - 0.25, j0 = Math.max(0, Math.min(M - 2, Math.floor(y))), fyy = Math.max(0, Math.min(1, y - j0));
      for (let i = 1; i < S - 1; i++) {
        const x = i * 0.5 - 0.25, i0 = Math.max(0, Math.min(M - 2, Math.floor(x))), fxx = Math.max(0, Math.min(1, x - i0));
        const k = i0 + j0 * M;
        const ux = (cvx[k] * (1 - fxx) + cvx[k + 1] * fxx) * (1 - fyy) + (cvx[k + M] * (1 - fxx) + cvx[k + M + 1] * fxx) * fyy;
        const uy = (cvy[k] * (1 - fxx) + cvy[k + 1] * fxx) * (1 - fyy) + (cvy[k + M] * (1 - fxx) + cvy[k + M + 1] * fxx) * fyy;
        this.vx[i + j * S] += ux;
        this.vy[i + j * S] += uy;
      }
    }
  }

  // ── Private simulation methods ─────────────────────────────────────

  private solveSqueezePressure(viscosity: number) {
    for (let k = 0; k < 10; k++) {
      for (let j = 1; j < this.size - 1; j++) {
        for (let i = 1; i < this.size - 1; i++) {
          const idx = i + j * this.size;
          const h = this.gap[idx];
          let source = (12.0 * viscosity * this.dhdt[idx]) / (h * h * h);
          source = Math.max(-100, Math.min(100, source));
          this.pressure[idx] = (
            this.pressure[idx - 1] + this.pressure[idx + 1] +
            this.pressure[idx - this.size] + this.pressure[idx + this.size] - source
          ) * 0.25;
        }
      }
      this.setBoundary(0, this.pressure);
    }
  }

  private updateSqueezeVelocity(viscosity: number) {
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const gradPX = (this.pressure[idx + 1] - this.pressure[idx - 1]) * 0.5;
        const gradPY = (this.pressure[idx + this.size] - this.pressure[idx - this.size]) * 0.5;
        const h = this.gap[idx];
        const coeff = -(h * h) / (12.0 * viscosity);
        this.vx[idx] += coeff * gradPX;
        this.vy[idx] += coeff * gradPY;
      }
    }
  }

  private applyImmiscibility(immiscibility: number, time: number, noise2D: (x: number, y: number) => number) {
    const strength = immiscibility * 0.8;
    const sharpness = 2.0;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const d = this.density[idx];
        if (d < 0.01) continue;

        const dr = this.densityR[idx] / d;
        const dg = this.densityG[idx] / d;
        const db = this.densityB[idx] / d;

        const dL = this.density[idx - 1];
        const dR = this.density[idx + 1];
        const dB = this.density[idx - this.size];
        const dT = this.density[idx + this.size];

        let colorDiffX = 0;
        let colorDiffY = 0;

        if (dR > 0.01 && dL > 0.01) {
          const diffR = Math.sqrt(
            (this.densityR[idx + 1] / dR - dr) ** 2 +
            (this.densityG[idx + 1] / dR - dg) ** 2 +
            (this.densityB[idx + 1] / dR - db) ** 2
          );
          const diffL = Math.sqrt(
            (this.densityR[idx - 1] / dL - dr) ** 2 +
            (this.densityG[idx - 1] / dL - dg) ** 2 +
            (this.densityB[idx - 1] / dL - db) ** 2
          );
          colorDiffX = diffR ** sharpness - diffL ** sharpness;
        }

        if (dT > 0.01 && dB > 0.01) {
          const diffT = Math.sqrt(
            (this.densityR[idx + this.size] / dT - dr) ** 2 +
            (this.densityG[idx + this.size] / dT - dg) ** 2 +
            (this.densityB[idx + this.size] / dT - db) ** 2
          );
          const diffB = Math.sqrt(
            (this.densityR[idx - this.size] / dB - dr) ** 2 +
            (this.densityG[idx - this.size] / dB - dg) ** 2 +
            (this.densityB[idx - this.size] / dB - db) ** 2
          );
          colorDiffY = diffT ** sharpness - diffB ** sharpness;
        }

        const n = noise2D(i * 0.03, j * 0.03 + time * 0.05);
        const noiseMod = 1.0 + n * 2.0;
        this.vx[idx] -= colorDiffX * strength * d * noiseMod;
        this.vy[idx] -= colorDiffY * strength * d * noiseMod;
      }
    }
  }

  private applyAirflow(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number) {
    const upwardForce = -strength * 8.0 * dt;
    for (let i = 0; i < GRID_AREA; i++) {
      if (this.density[i] > 0.01) {
        const xi = i % this.size;
        const yi = (i - xi) / this.size;
        this.vx[i] += noise2D(xi * 0.05, yi * 0.05 - time) * strength * 4.0 * dt;
        this.vy[i] += upwardForce + noise2D(yi * 0.05, xi * 0.05 + time) * strength * 4.0 * dt;
      }
    }
  }

  private applySmear(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number, audioData: AudioData | null) {
    const smearSpeed = time * 0.3;
    const shearX = noise2D(smearSpeed, 100) * strength * 12.0 * dt;
    const shearY = noise2D(100, smearSpeed) * strength * 12.0 * dt;

    const totalShearX = shearX;
    const totalShearY = shearY;

    for (let i = 0; i < GRID_AREA; i++) {
      if (this.density[i] > 0.01) {
        const xi = i % this.size;
        const yi = (i - xi) / this.size;
        const localNoise = noise2D(xi * 0.1, yi * 0.1) * 0.5 + 0.5;
        this.vx[i] += totalShearX * localNoise;
        this.vy[i] += totalShearY * localNoise;
      }
    }
  }

  // Rain drip: streaks of the plate sliding downhill, with the glass between
  // them holding on. The pull was 0.3 × dt per step, under a thousandth of a
  // cell and never visible, while the friction between streaks switched on at
  // full strength past 0.1 and only slowed everything else down. The pull is a
  // current now (DRIP_SPEED at 1.0, about five cells a second in the streaks)
  // and the friction grows with the slider.
  private applyDripping(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number) {
    const dripPull = DRIP_SPEED * strength;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const streak = (noise2D(i * 0.15, j * 0.02 - time * 0.2) + 1) * 0.5;
        this.vy[idx] -= dripPull * (0.1 + streak * streak * 0.9);   // downhill is -y (see the GPU twin)
        const friction = (0.5 + (1.0 - Math.max(0, streak)) ** 3 * 20.0) * strength;
        const decay = Math.exp(-friction * dt);
        this.vy[idx] *= decay;
        this.vx[idx] *= decay;
      }
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number, iterations = 10) {
    const a = dt * diff * (this.size - 2) * (this.size - 2);
    this.linSolve(b, x, x0, a, 1 + 4 * a, iterations);
  }

  // Iteration counts are tuned per use: pressure projection needs the most,
  // dye diffusion converges almost immediately (tiny diffusion coefficients).
  private linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number, iterations = 12) {
    const cRecip = 1.0 / c;
    for (let k = 0; k < iterations; k++) {
      for (let j = 1; j < this.size - 1; j++) {
        for (let i = 1; i < this.size - 1; i++) {
          x[i + j * this.size] =
            (x0[i + j * this.size] +
              a * (x[i + 1 + j * this.size] + x[i - 1 + j * this.size] +
                   x[i + (j + 1) * this.size] + x[i + (j - 1) * this.size])) * cRecip;
        }
      }
      this.setBoundary(b, x);
    }
  }

  private project(velocX: Float32Array, velocY: Float32Array, p: Float32Array, div: Float32Array) {
    const sizeRecip = 1.0 / this.size;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        div[i + j * this.size] =
          -0.5 * (velocX[i + 1 + j * this.size] - velocX[i - 1 + j * this.size] +
                  velocY[i + (j + 1) * this.size] - velocY[i + (j - 1) * this.size]) * sizeRecip;
        p[i + j * this.size] = 0;
      }
    }
    this.setBoundary(0, div);
    this.setBoundary(0, p);
    this.linSolve(0, p, div, 1, 4);

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        velocX[i + j * this.size] -= 0.5 * (p[i + 1 + j * this.size] - p[i - 1 + j * this.size]) * this.size;
        velocY[i + j * this.size] -= 0.5 * (p[i + (j + 1) * this.size] - p[i + (j - 1) * this.size]) * this.size;
      }
    }
    this.setBoundary(1, velocX);
    this.setBoundary(2, velocY);
  }

  private advect(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array, dt: number) {
    const dtx = dt * (this.size - 2);
    const dty = dt * (this.size - 2);
    const Nfloat = this.size - 2;

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        let x = i - dtx * velocX[i + j * this.size];
        let y = j - dty * velocY[i + j * this.size];

        if (x < 0.5) x = 0.5;
        if (x > Nfloat + 0.5) x = Nfloat + 0.5;
        if (y < 0.5) y = 0.5;
        if (y > Nfloat + 0.5) y = Nfloat + 0.5;

        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        const s1 = x - i0;
        const s0 = 1.0 - s1;
        const t1 = y - j0;
        const t0 = 1.0 - t1;
        const i1 = i0 + 1;
        const j1 = j0 + 1;

        d[i + j * this.size] =
          s0 * (t0 * d0[i0 + j0 * this.size] + t1 * d0[i0 + j1 * this.size]) +
          s1 * (t0 * d0[i1 + j0 * this.size] + t1 * d0[i1 + j1 * this.size]);
      }
    }
    this.setBoundary(b, d);
  }

  /**
   * MacCormack advection: advect forward, advect the result back, correct by
   * half the round-trip error, and clamp to the range of the four cells the
   * forward step interpolated between so the correction can't overshoot.
   * Semi-Lagrangian transport alone is dissipative enough to smear a thin
   * filament away within a few steps; this is what lets them survive.
   */
  /**
   * Interface sharpening: anti-diffusion with a clamp. The GPU solver runs the
   * same operation in `sharpenDye`; see the note there for why the clamp is
   * what keeps backwards diffusion from growing a checkerboard.
   */
  private sharpenDye(k: number) {
    if (k <= 0.0001) return;
    const N = this.size;
    // How much of an interface a pair of cells straddles: 1 where both hold
    // comparable liquid, 0 where one is empty. It is read from the thickness
    // for every channel, never from the channel being sharpened — see the note
    // in `sharpenDye` in gpuFluid.ts for why a per-channel gate cancels itself
    // at exactly the boundaries this pass is for.
    const gate = (a: number, b: number) => (a < b ? a / (b + 1e-4) : b / (a + 1e-4));
    // The thickness as it stands before any channel is touched, including
    // before the thickness itself is: the gate must not shift under the pass.
    this.shpA.set(this.density);
    const ga = this.shpA;
    for (const ch of [this.density, this.densityR, this.densityG, this.densityB]) {
      this.shp.set(ch);
      const o = this.shp;
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = x + y * N;
          const c = o[i], l = o[i - 1], r = o[i + 1], d = o[i - N], u = o[i + N];
          const dl = o[i - N - 1], dr = o[i - N + 1], ul = o[i + N - 1], ur = o[i + N + 1];
          // The isotropic nine-point weights; see the note in gpuFluid.ts for
          // why the diagonals matter.
          const a = ga[i];
          const f = 0.20 * (gate(a, ga[i - 1]) * (c - l) + gate(a, ga[i + 1]) * (c - r) + gate(a, ga[i - N]) * (c - d) + gate(a, ga[i + N]) * (c - u))
                  + 0.05 * (gate(a, ga[i - N - 1]) * (c - dl) + gate(a, ga[i - N + 1]) * (c - dr) + gate(a, ga[i + N - 1]) * (c - ul) + gate(a, ga[i + N + 1]) * (c - ur));
          const lo = Math.min(Math.min(l, r), Math.min(d, u), Math.min(dl, dr), Math.min(ul, ur), c);
          const hi = Math.max(Math.max(l, r), Math.max(d, u), Math.max(dl, dr), Math.max(ul, ur), c);
          // Curvature below a fraction of the local range is a wash, not an
          // edge; growing it is what terraces a smooth dish. See the note in
          // `sharpenDye` in gpuFluid.ts.
          const fl = Math.sign(f) * Math.max(Math.abs(f) - SHARP_FLOOR * (hi - lo), 0);
          const s = c + k * fl;
          ch[i] = Math.max(0, Math.min(hi, Math.max(lo, s)));
        }
      }
    }
  }

  private advectMacCormack(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array, dt: number) {
    this.advect(b, this.mcA, d0, velocX, velocY, dt);         // φ̂ₙ₊₁ = A(φₙ)
    this.advect(b, this.mcB, this.mcA, velocX, velocY, -dt);  // φ̂ₙ = A⁻¹(φ̂ₙ₊₁)

    const N = this.size;
    const dtx = dt * (N - 2);
    const Nfloat = N - 2;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = i + j * N;
        let x = i - dtx * velocX[idx];
        let y = j - dtx * velocY[idx];
        if (x < 0.5) x = 0.5; else if (x > Nfloat + 0.5) x = Nfloat + 0.5;
        if (y < 0.5) y = 0.5; else if (y > Nfloat + 0.5) y = Nfloat + 0.5;
        const i0 = Math.floor(x), j0 = Math.floor(y);
        const i1 = i0 + 1, j1 = j0 + 1;
        const a = d0[i0 + j0 * N], b2 = d0[i1 + j0 * N], c = d0[i0 + j1 * N], e = d0[i1 + j1 * N];
        const mn = Math.min(a, b2, c, e), mx = Math.max(a, b2, c, e);
        const v = this.mcA[idx] + 0.5 * (d0[idx] - this.mcB[idx]);
        d[idx] = v < mn ? mn : v > mx ? mx : v;
      }
    }
    this.setBoundary(b, d);
  }

  private setBoundary(b: number, x: Float32Array) {
    for (let i = 1; i < this.size - 1; i++) {
      x[i]                            = b === 2 ? -x[i + this.size]            : x[i + this.size];
      x[i + (this.size - 1) * this.size] = b === 2 ? -x[i + (this.size - 2) * this.size] : x[i + (this.size - 2) * this.size];
    }
    for (let j = 1; j < this.size - 1; j++) {
      x[j * this.size]                    = b === 1 ? -x[1 + j * this.size]            : x[1 + j * this.size];
      x[(this.size - 1) + j * this.size]  = b === 1 ? -x[(this.size - 2) + j * this.size] : x[(this.size - 2) + j * this.size];
    }
    x[0] = 0.5 * (x[1] + x[this.size]);
    x[(this.size - 1) * this.size] = 0.5 * (x[1 + (this.size - 1) * this.size] + x[(this.size - 2) * this.size]);
    x[this.size - 1] = 0.5 * (x[this.size - 2] + x[this.size - 1 + this.size]);
    x[(this.size - 1) + (this.size - 1) * this.size] = 0.5 * (
      x[(this.size - 2) + (this.size - 1) * this.size] + x[(this.size - 1) + (this.size - 2) * this.size]
    );
  }

  // Radial outward velocity impulse — simulates bass-frequency plate strike
  applyRadialImpulse(cx: number, cy: number, radius: number, strength: number) {
    this.dirty = true;
    const r2 = radius * radius;
    for (let j = cy - radius; j <= cy + radius; j++) {
      for (let i = cx - radius; i <= cx + radius; i++) {
        const dx = i - cx, dy = j - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq < r2 && distSq > 0 && i > 0 && i < this.size - 1 && j > 0 && j < this.size - 1) {
          const dist = Math.sqrt(distSq);
          const falloff = (1 - dist / radius) * (1 - dist / radius); // quadratic falloff
          this.vx[i + j * this.size] += (dx / dist) * strength * falloff;
          this.vy[i + j * this.size] += (dy / dist) * strength * falloff;
        }
      }
    }
  }

  // Multi-octave curl noise — a current at several scales at once. Octave 0 is
  // a slow swirl that carries whole blobs; the higher octaves add ripples and
  // filament trails, each 0.55 of the one below.
  //
  // It used to be scaled by the raw difference of two noise samples 1.5 cells
  // apart, never divided by that span: about 1% of the strength its constants
  // describe, with the octaves weighted the wrong way round (the finest was the
  // strongest). Measured on an M4, the picture moved the same at 0, 0.3 and 1.
  // Now each octave is a real gradient (rms ≈ 3 in noise space) and `scale` is
  // an rms speed: TURB_SPEED solver units at 1.0, which at the default Speed is
  // about five cells a second on a 192-cell plate. It is applied to the liquid
  // everywhere, because clear oil flows too and a curl weighted by dye density
  // is not divergence-free: it piles dye up along its own edges.
  applyCurlTurbulence(scale: number, octaves: number, time: number, noise2D: (x: number, y: number) => number) {
    if (scale <= 0.005) return;
    const step = 2;   // sampled on a stride, and each sample fills its 2x2 block
    const eps = 0.75; // finite-difference offset in grid cells
    const k = scale * (TURB_SPEED / 3);
    for (let o = 0; o < octaves; o++) {
      const freq = (0.012 / GRID_SCALE) * (1 << o); // feature size stays constant relative to the frame
      const amp = k * Math.pow(0.55, o) / (2 * eps * freq);
      const tOff = time * (0.06 + o * 0.05) + o * 37.7;
      for (let j = 1; j < this.size - 2; j += step) {
        for (let i = 1; i < this.size - 2; i += step) {
          const idx = i + j * this.size;
          // Curl of scalar noise field: v = (dn/dy, -dn/dx) — divergence-free
          const dn_dx = noise2D((i + eps) * freq, j * freq + tOff) - noise2D((i - eps) * freq, j * freq + tOff);
          const dn_dy = noise2D(i * freq, (j + eps) * freq + tOff) - noise2D(i * freq, (j - eps) * freq + tOff);
          const ux = dn_dy * amp, uy = -dn_dx * amp;
          this.vx[idx] += ux; this.vx[idx + 1] += ux; this.vx[idx + this.size] += ux; this.vx[idx + this.size + 1] += ux;
          this.vy[idx] += uy; this.vy[idx + 1] += uy; this.vy[idx + this.size] += uy; this.vy[idx + this.size + 1] += uy;
        }
      }
    }
  }

  // Inject curl-noise vorticity into dense fluid regions — driven by mid/treble
  // The same fix as the turbulence: the difference over 0.01 of noise space is
  // divided by it, so `strength` (0–0.03) reaches an rms of about 0.4 at the top
  // instead of a thousandth of that. Every 3rd cell, filling its 3x3 block.
  injectVorticity(strength: number, time: number, noise2D: (x: number, y: number) => number) {
    const step = 3;
    const k = (strength / 0.03) * (0.4 / 3) * 100;
    for (let j = 1; j < this.size - 3; j += step) {
      for (let i = 1; i < this.size - 3; i += step) {
        const idx = i + j * this.size;
        const d = this.density[idx];
        if (d > 0.05) {
          // Curl noise: perpendicular to gradient of noise field
          const n = noise2D(i * 0.025, j * 0.025 + time * 0.08);
          const dn_dx = noise2D(i * 0.025 + 0.01, j * 0.025 + time * 0.08) - n;
          const dn_dy = noise2D(i * 0.025, j * 0.025 + 0.01 + time * 0.08) - n;
          const m = k * Math.min(1, d);
          for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
            const c = idx + a + b * this.size;
            this.vx[c] +=  dn_dy * m;
            this.vy[c] += -dn_dx * m;
          }
        }
      }
    }
  }
}
