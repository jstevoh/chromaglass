import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { layFinger } from '../lib/handSolid';
import { layBreath } from '../lib/breath';
import { fingerCarry, blowCarry, carryDyeAlong, blowDye, blowOil, BLOW_RADIUS, BLOW_STRENGTH, remoteBlowRadius } from '../lib/handCarry';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { wallAsked, plateFrame } from '../lib/earClock';
import { DrawGate, refreshStamp, stampFallbacks, stampMisses } from '../lib/drawGate';
import { VisualizerSettings, LiquidType, SimResolution } from '../types';
import { PRESET_CONTRACTS, PRESET_INJECT_STYLES, PRESET_LIQUIDS, phasePourShape, LIQUIDS_BY_ID, AUTO_DOSE, WORKING_DYES, dyesOnPlate } from '../presetPlate';
import { clockGlassBodies, clockGlassCell } from '../lib/oilLay';
import { plateAreas, areaForBand, areaCentre, areaDye, pointInArea, pickArea, type PlateArea } from '../lib/plateAreas';
import { phasePour } from '../lib/phasePour';
import { magnetDepth, magnetRadiusAt } from '../lib/magnetSize';
import { MAGNET_RADIUS } from '../gpu/wgsl/magnetDisc';
import { laidColour, pourTint } from '../lib/liquidColour';
import { PALETTE, PALETTE_RGB, hexToRgb, getAudioValue, type AudioFeatureKey, pickHarmony, harmonyColor, harmonyCycle } from '../constants';
import { WebGPUStage } from '../gpu/stage';
import { forgetReadbacks, readbacksLanded, trackReadbacks } from '../gpu/kit';
import { WebGPUFluid, THIN_GAP_THICKNESS } from '../gpu/fluid';
import { WebGPUPlate, pictureSize } from '../gpu/plate';
import { fillPlateUniforms, magnetsOnPlate } from '../gpu/plateUniforms';
import { WebGPUCamera, fillCameraUniforms } from '../gpu/camera';
import { WebGPUOutput, fillOutputUniforms } from '../gpu/output';
import { WebGPUFrameProbe } from '../gpu/probe';
import { WebGPUPostChain } from '../gpu/post';
import { isGpuFailure, type GpuFailure } from '../gpu/device';
import { kitSelfTest, pressureSelfTest } from '../gpu/selftest';
import { prepareLog, prepareShow } from '../gpu/prepare';
import { openingOf } from '../gpu/opening';
import { PipelineCache } from '../gpu/kit';
import type { PostTest } from '../gpu/post';
import type { TempoSource } from '../lib/tempo';
import { lookSpeed, musicPace, tempoMultiplier } from '../lib/tempoPace';
import { FlashGuard } from '../lib/flashGuard';
import { DEFAULT_OUTPUT, outputIsIdentity, sourcesAskedFor, type OutputConfig } from '../lib/outputConfig';
import { sourceSettings } from '../lib/plateSources';
import { BeatClock } from '../lib/beatClock';
import { AutoSpin, GRIP_SECONDS, SpinHand, carrierViscosity, dishFollow, dishFrame, dragSeconds, dyeDensityContrast, lookMotor, lookMotorRate } from '../lib/turntable';
import { MacroCamera, type MacroShot } from '../lib/macroCamera';
import { CELL_TRAVEL, DT_FLOOR, advanceCellClock, stepDisplacement } from '../lib/detailFlow';
import { stirOf } from '../lib/stir';
import { CUR_ROCK, kickRock, stepRock, rockSwing, swayAt } from '../lib/plateRock';
import type { GpuStepParams, PlateSolver, SolverCarry } from '../gpu/solverTypes';
import { canvasPixelsFor, detectTier, qualityLadder, renderScale, type EngineStatus, type GpuClass } from '../lib/platform';
import { QualityGovernor } from '../lib/governor';
import { BubbleField, MAX_BUBBLES } from '../lib/bubbles';
import { depositRim, fillHole, type DyeTarget } from '../lib/bubbleDye';
import { BeadField } from '../lib/beads';
import { ChemistryField } from '../lib/chemistry';
import { LiquidPhase } from '../lib/liquidPhase';
import { pourShare, speciesOf } from '../lib/liquidProps';
import { SCENE_LATTICE, type SceneReading } from '../lib/sceneSense';
import { PatchBay } from '../lib/sceneMap';
import { BackLook } from '../lib/backLook';
import { LEARNABLE_SETTINGS, type SoundBinding } from '../lib/midi';
import { SoundLearn } from '../lib/soundLearn';
import { SongShape, type SongEvent, type SongShapeState } from '../lib/songShape';
import { BarGrid, Accent, type BarNow } from '../lib/barGrid';
import { squishDisc, glassSpring, PressLifts, KickRelease, KICK_RADII, kickDepth, type Presser, type Stroke } from '../lib/squish';
import { ROOM_STALE_MS, RoomStir } from '../lib/roomStir';
import { Phrasing, type Phrase } from '../lib/phrasing';
import { PACE_NEUTRAL, approachPace, type PaceSample } from '../lib/scenePacing';
import { Modulators } from '../lib/modulators';
import * as crashLog from '../lib/crashLog';
import { makeRng, restartStreams, setShowSeed, showSeed, stream, streamDraws, type Rng } from '../lib/rng';
import { clockIsFixed, showEpochS, showNow } from '../lib/showClock';
import { pressDye, pressOil, pressTake } from '../lib/pressRing';
import { dyeAbsorbances } from '../lib/dye';
import { adoptIntro, introMove, introOut, introPlateFrame, introStill } from '../lib/intro';

/** Seconds a track must survive before it is allowed to touch the plate. */
const HAND_SETTLE = 0.25;
/** Seconds of standing still before a person becomes a palm on the glass. */
const HAND_STILL_HOLD = 0.35;
/** Frame widths a second above which a person is blowing rather than pressing. */
const HAND_MOVING = 0.06;


interface LiquidVisualizerProps {
  /** The sound as React last saw it (ten times a second from the room's ear; every frame from a render). */
  audioData: AudioData | null;
  /**
   * The sound now, asked for at the top of each frame (PLAN.md §14f). The
   * room's ear makes a reading every frame but tells React only ten times a
   * second, so a plate that read only `audioData` would move in steps. A
   * plate without one (the cast receiver, whose sound arrives as messages)
   * reads `audioData`.
   */
  hear?: () => AudioData | null;
  settings: VisualizerSettings;
  seedCount?: number;
  /**
   * A flick of one plate: spin it up and let it coast down.
   *
   * A counter and a layer rather than a speed, the way `seedCount` is a
   * counter: it is a momentary thing, and two flicks in a row have to both
   * land. The strength is `spinImpulse`, so a pad and the screen button hit
   * exactly as hard as each other.
   */
  spinFlick?: { seq: number; layer: number };
  selectedLiquid?: LiquidType;
  /**
   * Where the plate is drawn on this screen, in CSS pixels.
   *
   * The desk needs the plate to be a preview in the corner of a control
   * surface rather than the whole window, and the canvas cannot simply be
   * moved to a different place in the tree to achieve that — a remount takes
   * the GPU context with it and the show restarts. So the canvas stays
   * exactly where it is and this moves the box it is painted in.
   *
   * It does not change what is rendered. With a projector attached the render
   * size comes from the projector (see `resize`), and with none it comes from
   * the window — neither is this box. Shrinking the preview costs the audience
   * nothing, which is the whole reason the desk is affordable.
   */
  frame?: { top: number; left: number; width: number; height: number } | null;
  activeLayer?: number;
  clearTrigger?: number;
  drainTrigger?: number;
  /*
    `press` belongs here, and its absence was invisible.

    The component handles it thoroughly — a hand on the top glass, the film
    thinning under the palm — in five places, and `App.tsx` passes it: it is
    one of `TOOL_KEYS`. The type simply never listed it, so every
    `tool === 'press'` below compares two things that by this declaration
    cannot be equal.

    It works at run time, which is why nobody noticed: React has no type
    declarations installed, so the prop arrives through JSX as `any` and the
    real string gets through. Give the project `@types/react` and the
    compiler reports all five comparisons at once as unreachable.
  */
  activeTool?: 'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press' | 'finger' | 'magnet' | 'spin';
  isAutomated?: boolean;
  isActive?: boolean;
  /**
   * What the room camera is seeing, or null when nothing is watching. A ref
   * rather than a prop value: the reading changes twenty times a second and
   * only the render loop reads it, so putting it in state would re-render the
   * app around it for nothing.
   */
  sceneRef?: React.MutableRefObject<SceneReading | null>;
  /**
   * What the film projector's own picture is doing, when anything is reading
   * it. The same shape as the room's reading, because it is the same analysis
   * over a different video — see `useFilmSense`.
   */
  filmSenseRef?: React.MutableRefObject<SceneReading | null>;
  /** Called (throttled) while the user paints — feeds performance recording. */
  onManualGesture?: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; clear?: boolean }) => void;
  /**
   * A hand on the closeup camera: Alt-drag on the plate pans it, Alt-click
   * fixes it on the spot under the pointer. Plate uv (0-1), where the camera
   * should now be aimed.
   */
  onAim?: (x: number, y: number) => void;
  /**
   * Two fingers on the closeup move the camera rather than paint (the phone).
   *
   * Given, and only while the closeup is in: a pinch sets the magnification
   * through this, and the two fingers moving together pan the aim through
   * `onAim`. Left out, every finger is a hand on the plate, as it is with the
   * closeup out: two fingers lay two drops.
   */
  onPinchZoom?: (zoom: number) => void;
  /**
   * How much the tool in hand does, 1 being what it always did: the dye it
   * lays, the pressure of a press, the wind of a blow, the drag of a finger,
   * the pull of the magnet (lib/toolAmount.ts). Kept per tool by the app.
   */
  toolAmount?: number;
  /** Reports which solver is running, at what resolution, and how the governor is doing. */
  onEngineStatus?: (status: EngineStatus) => void;
  /**
   * The back plate's own look was let go of without anyone pressing Follow
   * the front: a render began or ended (see `resetStamps`). So the desk, the
   * phone and the Mixer stop saying the back plate is on a look it is not on.
   */
  onBackLookCleared?: () => void;
  /**
   * Where the tempo comes from when it is not the microphone: a MIDI clock,
   * a tapped tempo, a typed one. A ref for the same reason the room's reading
   * is one — it is read once a frame by the render loop and by nothing else,
   * so putting it in state would re-render the app around it for nothing.
   */
  tempoRef?: React.MutableRefObject<TempoSource | null>;
  /**
   * What the music is bound to (sound learn, PLAN §5; the MIDI map's
   * `sound`). Mappings are folded with the look's own patches, triggers are
   * stepped against the beat clock here, where the clock is, and handed back
   * through `onSoundTrigger` to run as the action, preset or dye they name.
   */
  soundBindings?: readonly SoundBinding[];
  onSoundTrigger?: (binding: SoundBinding) => void;
  /**
   * A hand is holding a magnet under a look that has none of its own
   * (magnetStrength 0), or no ferrofluid drawn (phaseAmount 0): the app gives
   * the look the magnet's strength, so that once let go it stays under the
   * glass where the hand set it down, and, when there is ferrofluid in the
   * solver (`ferrofluid`), turns Ferrofluid up so what is there is drawn
   * (magnetFor). Never ferrofluid of its own: a magnet brings none. Asked a
   * few times a second while held, until the settings say both.
   */
  onMagnetInHand?: (ferrofluid: boolean) => void;
  /**
   * The hand has poured ferrofluid from the bottle and it is in the solver,
   * but the look draws none (phaseAmount 0): the app turns Ferrofluid up so
   * the pour shows. Picking the bottle no longer does (App's
   * ferrofluidPoured says why): only ferrofluid that is there turns it up.
   * Asked a few times a second while the hand pours, until the settings say so.
   */
  onFerrofluidPoured?: () => void;
  /**
   * The projector's geometry and grade: flip, corner pin, edge blanking and
   * output grade. A property of the room rather than of the look, so it
   * arrives as its own prop instead of riding in `settings` where a preset
   * file would pick it up and carry someone else's keystone across the
   * country. Omitted, or identity, and the pass is never built.
   */
  output?: OutputConfig;
}

/**
 * Where the closeup is fully itself, and what a look that only says "macro"
 * means by it.
 *
 * The travel from the plate to the closeup runs from 1x to MACRO_FULL_ZOOM:
 * below that the exposure, the defocus, the silhouette warp and the relief are
 * mixed in rather than switched on, so pushing the slider reads as a lens
 * moving. Two is low enough that nothing pops on the way past and high enough
 * that a bead is worth looking at when it lands.
 */
const MACRO_FULL_ZOOM = 2.0;
/** A preset or a saved show that sets `macroMode` with no zoom of its own. */
const MACRO_PRESET_ZOOM = 4.0;

/** The zoom the frame is asked for: the slider's, or a macro look's own. */
function macroZoomOf(s: VisualizerSettings): number {
  const setZoom = s.macroZoom ?? 1;
  return s.macroMode === true ? (setZoom > 1.05 ? setZoom : MACRO_PRESET_ZOOM) : Math.max(1, setZoom);
}

/**
 * How far into the closeup, 0 at the plate and 1 from MACRO_FULL_ZOOM on,
 * eased at both ends so the first notch of the slider starts it moving
 * rather than starting it at a slope.
 */
function macroAmountOf(s: VisualizerSettings): number {
  const t = Math.max(0, Math.min(1, (macroZoomOf(s) - 1) / (MACRO_FULL_ZOOM - 1)));
  return t * t * (3 - 2 * t);
}

const GRID_SIZE = 192;                    // sim resolution — higher = smoother liquid edges
const GRID_SCALE = GRID_SIZE / 128;       // brush/seed geometry was tuned at 128
/** Turbulence 1.0 as an rms speed in solver units (the GPU shader has the same 0.5). */
const TURB_SPEED = 0.5;
/*
  How far the dye actually moves per unit of velocity, relative to what the
  beads and bubbles assume. Both of them turn a velocity into cells with a
  fixed dt of 0.05 and an advection of 1 (0.05 × 190 cells × 60 steps a second),
  where the dye moves by the solver's own dt × advection — about 0.001 at the
  defaults, so they drifted fifty times faster than the liquid under them and
  ignored Speed and Advection. Multiplying the sampled velocity by this puts
  them on the dye's clock without touching their own tuning (the beads' lag,
  the bubbles' lead).
*/
function particleFlowScale(fluid: { dt: number } | undefined, s: VisualizerSettings): number {
  if (!fluid) return 0;
  return (fluid.dt * Math.max(0, s.advection ?? 1)) / 0.05;
}

/*
  The lasting current's gains: the speed each force asks for, in solver velocity
  units (at the default Speed one unit is about ten cells a second on the
  192-cell plate). The current relaxes toward that at the rate Damping sets.
  Tuned on an M4 against the picture: a preset's usual setting should give a
  current you can follow by eye, and the top of each slider a strong one,
  without sweeping the plate clear.
*/
const CUR_BUOY = 0.3;    // × buoyancy × tanh(20 × temperature): the heat field is small, ~0.03 on average
const CUR_GRAV = 0.25;   // × centre gravity × (density − mean)
/*
  How much of a blow is swirl rather than push.

  A push is curl-free and the projection removes it within the same step; a
  swirl is not and survives. Measured against nothing else in the plate, so
  it is written down rather than derived: 0.55 is the point at which a puff
  still reads as a puff rather than as a stirring rod, and the dye it moves
  keeps drifting for several seconds instead of stopping with the finger.
*/
const BLOW_SWIRL = 0.55;
/*
  How much of a finger's wake is roll rather than carry.

  Higher than a puff's, because a finger is a solid thing dragged through the
  liquid and sheds a stronger pair of vortices than air blown across it does —
  and because the roll is the part that survives the projection.
*/
const FINGER_SWIRL = 0.8;
/*
  A moving Blow on the ferrofluid (PLAN.md §9n) pushes along the way the hand
  last went, for this long after it last moved. Long enough to cover a
  frame's later sim steps (the stroke is nothing on those) and a frame or two
  at 20 fps where the pointer reported no move; short enough that a hand that
  stops and holds is a puff, opening a hole, within a tenth of a second or so
  of stopping, which reads as at once.
*/
const BLOW_DIR_HOLD_MS = 150;
/*
  And the Blow is a straw only once the hand has been held for that long and
  for this many frames in which the pointer reported no move, counting the
  press itself as a move (PLAN.md §15c).

  The straw used to be "not going": no move within BLOW_DIR_HOLD_MS. Two holes
  in that, and the deploy after #230 fell into one: a Blow drawn across a pool
  lost 54 of its 229 of dye (main's deploy, run 37177982848), the old eraser's
  size of loss, though the wind had run 49 steps and carried 156.5. The
  stroke had also run 5 straw steps, and a straw step blows a real bubble,
  whose air takes the dye under it off the plate (airExclude) for as long as
  the bubble sits there.
  - A press has no move before it, so every step between the press and the
    first move the pointer reports was a straw step: a drag began by blowing
    a bubble in the middle of whatever it was drawn through. At 10 to 30
    frames a second, as the Mac runner draws, that is a frame or two of steps
    before the first move arrives (2, 3, 5 and 7 straw steps on its runs).
  - On a slow frame rate a hand that never stops reports its moves a frame
    apart, and 150 ms is a frame and a half at 10 fps: a drag on a struggling
    machine was a straw every time a move came a frame late.
  So the press starts the hold's clock as a move does, and the hold is both
  the time (a hand on a fast machine still reads as held within a sixth of a
  second) and a few frames with no move in them (a hand on a slow one that is
  moving reports a move every frame, and is not held).
*/
const BLOW_STRAW_FRAMES = 3;
type BlowDir = { x: number; y: number; at: number; still: number; moved: boolean };
/*
  A pour of clear oil onto the clear film (PLAN §20b): this much of the gap
  added at the middle of the drop, falling to nothing at its rim. A drop of
  oil on an oil film merges into it, so it thickens what is there; half the
  gap at the middle is a drop that fills a hole it lands in.
*/
const FILM_POUR = 0.5;
/*
  Oil Bodies' pours (the onDeposit hook): a body is this many times the
  bottle's own radius (Oil's is 2, so about a tenth of the plate across
  on the full dose), and the pours stop once the oil covers this share of
  the plate. A dish in a show is a third or so oil: enough bodies to crowd
  and merge, and water enough round them for the colour to move through.
*/
const BODY_DROP = 3;
const BODY_COVER = 0.35;

/** With Drop Height up, a held dropper lets go of a drop every this many solver steps (six a second). */
const DROP_EVERY = 10;
/*
  What one hand's Drop has handed the plate since it landed: the solver steps
  it was held on the plate, the drops it let go of (Drop Height up), and the
  dye it gave, the sum of every cell's share it put into the deltas (a drop
  counts its whole amount). Each finger keeps its own, so a second finger
  that started late or was skipped on some steps shows it here, before the
  solver has touched anything; `npm run phone` holds two fingers' counts to
  each other and the plate's dye to them.
*/
type DropLaid = { steps: number; drops: number; dye: number };
const freshLaid = (): DropLaid => ({ steps: 0, drops: 0, dye: 0 });

/*
  The bottle, from every tool that lays liquid.

  Only the Dropper put the selected bottle's liquid on the plate. Pour,
  Spray, Splat and Streak laid its colour and nothing else, so with the
  Ferrofluid bottle picked a Pour laid a pool of near-black dye that the
  Magnet could not move, and Oil laid orange water that never became an
  oil body; soap, milk, silicone and glycerine were only colours. That is
  the first row of the tool-by-liquid audit (PLAN §15), and the one a
  performer meets first: you pick a liquid and a way of putting it down,
  and you get the liquid.

  Each laying tool now calls this on the disc it lays, at the dose it lays
  with (1 is the Dropper's at the default Amount). A deposit is a pass on
  the GPU when the liquid reaches one of its fields (addPhase, addMix: a
  whole-plate dispatch and a submit each, two for Silicone with Oil
  Bodies), so every tool makes one a step per hand, as a held Dropper
  always has: the many-point tools (Spray, Splat) at one of their points,
  which wanders over the mist as the hand goes, not at all twelve.
*/
function layBottle(af: FluidSimulation, x: number, y: number, r: number, liq: LiquidType | undefined, dose: number): void {
  if (!liq?.behaviour || !(dose > 0)) return;
  af.liquid.deposit(x, y, Math.max(1, r), liq.behaviour, dose, af.dtSeconds);
}

/*
  How wide a tool lays the bottle: its own reach, but never wider than the
  bottle's own Dropper. An oil body is BODY_DROP times the radius it is
  poured at, and at the Pour's reach that was a body a fifth of the plate
  across every step, filling BODY_COVER in a fifth of a second; so the
  tools lay the liquid no wider than the Dropper does, and a Pour is a held
  Dropper's worth of the liquid (with its own, wider colour).
*/
/** What a look asks of the ferrofluid: how much is drawn (Ferrofluid) and the size it is poured at (Scale). */
export type LookPhase = { phaseAmount?: number; phaseScale?: number };

/** The tools that lay the bottle: every hand but the Blow, the Press, the Finger, the Magnet and the Spin. */
const LAYING_TOOLS: ReadonlySet<string> = new Set(['dropper', 'drop', 'pour', 'spray', 'splatter', 'streak']);

function bottleReach(liq: LiquidType | undefined, r: number): number {
  return Math.min(r, Math.max(2, (liq?.injectRadius ?? 3) * GRID_SCALE));
}

/*
  How much of a tool's usual dye a bottle lays with it.

  One, except for a liquid the plate draws itself. The ferrofluid's black is
  the second phase, drawn by the plate from where the phase is; its bottle's
  dye is a whisper (injectAmount 0.05, against 0.6 for Water) that the
  Dropper already honours by laying injectAmount. The other tools lay a
  fixed amount of whatever colour is picked, which for the Ferrofluid
  bottle was a heavy stain of near-black dye under the pool: the Magnet
  drew the ferrofluid off it and the stain stayed where it had been poured.
  So a magnetic bottle scales their dye by its own dose against the
  Dropper's default; every other bottle lays what it always did.
*/
function bottleDye(liq: LiquidType | undefined): number {
  if (!((liq?.behaviour?.magnetic ?? 0) > 0)) return 1;
  return Math.min(1, (liq?.injectAmount ?? 0.8) / 0.8);
}

/** Rain Drip 1.0: the downhill current in the streaks, solver units (GPU: same 0.5). */
const DRIP_SPEED = 0.5;
const GRID_AREA = GRID_SIZE * GRID_SIZE;
/**
 * How much curvature counts as a boundary rather than a wash, as a fraction of
 * the local range of the dye. The sharpening pass leaves anything below it
 * alone; see the note in `sharpenDye` in gpuFluid.ts. The GPU shader carries
 * the same number.
 */
const SHARP_FLOOR = 0.08;
const PALETTE_COUNT = PALETTE_RGB.length;

/**
 * The largest grid a pinned `?sim=` may ask for.
 *
 * This used to clamp to the context's own texture limit, which is not a safety
 * limit — it is how big a texture the driver will *describe*, not how big a
 * one it can afford. On a machine reporting 8192, `?sim=8192` asks for a
 * gigabyte in a single RGBA32F buffer and more than a dozen of them, and the
 * GPU context is lost: the plate stops, the render loop stops publishing, and
 * everything reading the engine's state freezes on whatever it last said. It
 * takes a documented query parameter to get there, which makes it reachable
 * rather than theoretical.
 *
 * 1024 is one step past the top of the ladder, so there is still room to try a
 * grid finer than the app will choose for itself, and the footprint stays in
 * the low hundreds of megabytes rather than the low gigabytes.
 */
const MAX_PINNED_GRID = 1024;

/**
 * `?stages` — have the solver time itself stage by stage from the first frame
 * (H0, docs/webgpu-plan.md).
 *
 * The same switch as `chromaglassDebug().webgpu.stageTimings(true)`, for a
 * measurement that wants the page to have been doing it all along rather than
 * from whenever a console line was typed. Diagnostic only: it is read from the
 * query string and nothing else, so no preset or saved look can reach it.
 */
const STAGE_TIMINGS = (() => {
  try { return new URLSearchParams(window.location.search).has('stages'); } catch { return false; }
})();

/**
 * `?prepare=0`: open the show without building its pipelines ahead
 * (`gpu/prepare.ts`), as it opened before, each one built on the frame that
 * first asks. `npm run startup` opens the show once this way as its control.
 * Diagnostic only, from the query string alone, like `?stages`.
 */
const PREPARE_OFF = (() => {
  try { return new URLSearchParams(window.location.search).get('prepare') === '0'; } catch { return false; }
})();

/**
 * `?asked`: write down every pipeline the show asks for from the moment it
 * loads (`PipelineLedger.asking`), so `npm run startup` can hold each look's
 * first steps against what was built before the look opened. From the start
 * of the page, because a harness setting it once the page is up is already
 * behind a look whose first step came first. Diagnostic only, like `?stages`.
 */
try {
  if (new URLSearchParams(window.location.search).has('asked')) PipelineCache.ledger().asking = new Map();
} catch { /* no window: nothing to write down */ }

/**
 * `?rung=N` — hold the governor on one rung of its ladder and measure it.
 *
 * A rung is a grid *and* a number of device pixels, and the two are paid for
 * in different places: the grid by the solver, the pixels by everything that
 * draws. `?sim=` could only ever pin the first, because pinning the grid
 * turns the governor off and an ungoverned frame renders at one device pixel
 * whatever the rung says — so the pixels, which is the half the ladder turns
 * out to be wrong about, could not be measured at all.
 *
 * Diagnostic only, read from the query string and nothing else.
 * `npm run ladder` walks it.
 */
const PINNED_RUNG = (() => {
  try {
    const raw = new URLSearchParams(window.location.search).get('rung');
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  } catch { return null; }
})();

// Which grid the solver should run on. A pinned size is honoured up to the
// smaller of the cap above and the context's texture limit; 'auto' hands the
/** The post chain's level in the engine label, only when it has been spent (see QualityGovernor.postLevel). */
function postLevelLabel(governor: QualityGovernor | null | undefined): string {
  const level = governor?.postLevel ?? 0;
  return level === 1 ? ' · effects ½' : level === 2 ? ' · effects off' : '';
}

/**
 * The stage draws the show (docs/webgpu-plan.md): there is one engine.
 */

// choice to the frame-time governor.
/** How many times a lost device is asked for again before the screen says it is gone (~2 min of backoff). */
const RECOVERY_TRIES = 8;
/** Consecutive frames that throw before the stage is rebuilt (about 1.5 s at 60 fps). */
const SELF_HEAL_FRAMES = 90;
/*
  A pressed look change hands over completely.

  Asked for: "as each preset (or user show) loads, the visuals should shift
  (over the specified time) completely to the new preset and not keep any
  aspects of the previous preset." It used to thin the old dye to 0.45 and
  pour the new palette on top, so every look carried the one before it. Now
  the old dye thins (to HANDOFF_KEEP) through the fade while the new look's
  own seed, worked out once, rises in place at the matching rate, on a plate
  cleared of the old chemistry; its phase and liquids arrive half way. The
  stage never sags darker than either end, and nothing flashes.
*/
/** How much of the old dye is left once the handover is done. */
const HANDOFF_KEEP = 0.02;
/** How many pours of the new palette arrive through the fade, on top of its seed. */
const HANDOFF_POURS = 4;
/** Whether Evolve pours whole-plate floods at the peak of a gust. Off: evolve is subtle. */
const EVOLVE_FLOODS = false;
/** GPU errors within three seconds that mean the stage's objects have gone invalid, not a one-off. */
const ERROR_STORM = 45;
/**
 * `auto` is the grid 'auto' stands for: the governor's rung of the moment
 * live, its opening rung for a song render (see `QualityGovernor.openingRung`).
 */
const resolveSimResolution = (setting: SimResolution | undefined, governor: QualityGovernor, maxTexture: number, auto = governor.rung.grid): number => {
  const want = setting === undefined || setting === 'auto' ? auto : setting;
  // A pin is held to what this GPU can actually allocate, so an old saved
  // look or a hand-typed query cannot ask for a texture the device refuses.
  //
  // And to an even number: the pressure solve colours the grid like a
  // chessboard and sweeps each colour in a half-sized dispatch (H2), which
  // only divides evenly if the edge does. Every rung on every ladder is even
  // already; this is for `?sim=513` and for a saved look that carries one.
  const held = Math.max(64, Math.min(Math.round(want), maxTexture, MAX_PINNED_GRID));
  return held - (held % 2);
};

// The solver advances at a fixed rate in wall-clock time rather than once per
// rendered frame, so the light show runs at the same speed on a 30 fps laptop,
// a 60 fps desktop and a 120 Hz display. A slow frame catches up by taking
// several steps, capped so a stall can't spiral into a burst of work.
const SIM_STEP = 1 / 60;
/**
 * `?steps=N` — take N solver steps a second instead of sixty (H2b).
 *
 * How far the liquid travels in a second is `steps per second × dt`, and the
 * loop has always held the first at sixty and scaled the second with the
 * Speed control. So a plate at Speed 0.012 runs the same hundred-odd
 * dispatches a step, sixty times a second, as one at 0.3 — it just multiplies
 * a smaller number in. Slow costs exactly what fast costs.
 *
 * It need not. Hold `dt` and lower the rate instead and the liquid moves the
 * same distance for proportionally less work, and the solver is most of a
 * frame's GPU time. What it cannot do is go too far: below about thirty steps
 * a second a plate stops flowing and starts stepping, and a larger `dt` is a
 * larger displacement per step, which semi-Lagrangian advection survives but
 * does not render faithfully.
 *
 * The governor owns that choice now (`QualityGovernor.stepRate`): it lowers
 * the rate before it gives up a rung or an effect, because this is the only
 * thing it can spend that costs nothing to look at. `?steps=` overrides it,
 * which is how the line above was found in the first place and how it can be
 * found again on a machine that is not this one. `SIM_STEP` stays the rate
 * the show was written against, and the stretch is measured from it.
 */
const PINNED_STEP_RATE = (() => {
  if (typeof window === 'undefined') return null;
  const n = Number(new URLSearchParams(window.location.search).get('steps'));
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : null;
})();
// `?warp=N` (diagnostic) lifts the catch-up cap so a slow renderer can still
// take many solver steps per frame: the sim never runs ahead of wall-clock,
// it just stops falling behind. Used to capture developed frames on machines
// that render at a few fps.
const SIM_MAX_CATCHUP = (() => {
  if (typeof window === 'undefined') return 4;
  const warp = Number(new URLSearchParams(window.location.search).get('warp'));
  return Number.isFinite(warp) && warp >= 1 ? Math.min(240, Math.round(warp)) : 4;
})();

/*
  The show's dice, one stream per purpose (lib/rng.ts).

  Every `Math.random` in this file that could change what reaches the plate
  now draws from one of these, or from the plate's own `rng` (FluidSimulation,
  one stream a layer), so the same seed plays the same show. They are split by
  what they decide rather than pooled, so that adding a draw to one — a new
  tool, a new automation event — cannot move the numbers another one draws:

    lay      what laying a look adds besides its dye: the plates' starting
             angles, the liquids poured with it, the handoff's pours, the Seed
             button's drops.
    hands    what a hand does beyond where it points: the spray's mist, the
             splatter's flung drops, a theme button's placement, a blow's
             bubble.
    evolve   the automation: when a drop lands and where, a thinned patch, a
             finger stroke, a palette re-pick.
    music    what the music pours: a style for each band's drop, a dose on the
             beat's ring, treble sparks, the squeeze, a bubble on the kick, a
             soap burst.
    liquids  which bottle a dose comes from (`doseLiquid`).
    palette  which of a look's dyes are the working set (`harmonyWithin`;
             `harmonyColor` and `pickHarmony` draw from the same stream).
    chem     where a reaction is seeded: the BZ waves and Boyle's chemistry.
    pour     where a paced scene's flood lands (`pour` on the handle), so a
             sequence's pours cannot move the automation's own draws.

  All of them are `plate.` streams, so laying a look restarts them from
  (seed, name, look) — see "Restarting, rather than continuing" in rng.ts.
  Module constants are safe to hold: a reseed re-keys a stream in place.
*/
const DICE = {
  lay: stream('plate.lay'),
  hands: stream('plate.hands'),
  evolve: stream('plate.evolve'),
  music: stream('plate.music'),
  liquids: stream('plate.liquids'),
  palette: stream('plate.palette'),
  chem: stream('plate.chemistry'),
  pour: stream('plate.pour'),
};

// Density histogram used to expose the macro closeup (see "Macro film exposure").
const FILM_BINS = 64;
const FILM_BIN_SCALE = 16;   // bins per unit of density — covers 0..4

/**
 * Pour one dose of whatever the preset keeps in the dish.
 *
 * Picks uniformly from the list, so the inert entries are the dilution: most
 * of the time this lands on `water`, which carries no property, which is what
 * makes `['water', 'water', 'soap']` a different plate from `['soap']`. On a
 * thin gap the water is still liquid (PLAN 18c): its volume pushes what is
 * there aside, and is what flushes the glycerine these looks pour (18d-2).
 *
 * The dose is scaled by the plate's remaining headroom for that liquid, so a
 * show left running overnight cannot end as a dish of solid glycerine. See
 * `CEILING` in `liquidPhase.ts` for why that matters and `npm run liquids`
 * for the measurement — unchecked, an hour of this leaves 92% of the plate
 * too thick to move.
 */
function doseLiquid(fluid: FluidSimulation, ids: string[], x: number, y: number, strength = 1): void {
  if ((window as any).__bottleTest) return;
  if (ids.length === 0) return;
  pourLiquid(fluid, DICE.liquids.pick(ids), x, y, strength);
}

/**
 * One dose of one named liquid: what `doseLiquid` pours once it has picked the
 * bottle, and what an area of the dish (lib/plateAreas.ts) pours, whose bottle
 * is its own and is not drawn for.
 */
function pourLiquid(fluid: FluidSimulation, id: string, x: number, y: number, strength = 1): void {
  const liq = LIQUIDS_BY_ID.get(id);
  if (!liq?.behaviour) return;
  const room = fluid.liquid.headroom(liq.behaviour);
  if (room <= 0.02) return;
  const r = Math.max(2, Math.round((liq.injectRadius ?? 3) * GRID_SCALE));
  fluid.liquid.deposit(x, y, r, liq.behaviour, AUTO_DOSE * strength * room);
}

/**
 * What a rendered frame was drawn from, apart from its pixels: for
 * `npm run render-app`, which can only be run on a real GPU, and so has to
 * say *why* two renders of the same seed differ, not only that they do.
 *
 * When the owner's Mac reports "240 of 240 frames differ", a hash of each
 * frame says the films are different and nothing else. So each frame, when
 * a check asks (`begin({ digest: true })`, which the render asks for only
 * when it is hashing frames), the numbers the frame is drawn from are kept
 * beside its hash, taken at the moment the plate is handed to the renderer:
 * the clocks, the canvas and the grid, the steps taken, the phrase and the
 * modulators, the rock and the lamp, the dye regulator's reading, the flash
 * guard's gain, the dice drawn so far on each stream, a few cells of the
 * readback, a hash of the settings. The check prints the first of these
 * that differs between two renders, which names the part of the plate that
 * carried something in from before the render, or that reads a clock it
 * should not. Plain numbers and strings, compared exactly: a value that is
 * the same to the last bit prints as the same. Null is "not there" (a
 * stream nothing has asked for yet).
 */
export type FrameDigest = Record<string, number | string | boolean | null>;

/**
 * A song render's hold on the plate (lib/render.ts, PLAN.md §6).
 *
 * The show normally draws a frame when the browser asks and steps the solver
 * as many times as the wall clock says it owes. A render inverts both: the
 * caller asks for frame i, the plate takes exactly the solver steps that
 * frame is owed at the render's step rate (worked out from i, not from a
 * clock), draws it at the film's size, and hands the drawn canvas back as a
 * VideoFrame in the same task, which is the only moment a WebGPU canvas is
 * guaranteed to still hold what was drawn.
 *
 * The caller owns the show clock (`beginFixedClock` before `begin`,
 * `endFixedClock` before `end`) and the seed (`setShowSeed` before
 * `begin`, which lays the look).
 */
export interface VisualizerRender {
  /**
   * Take the plate: the live loop stops, the canvas becomes width x height,
   * the solvers are rebuilt fresh at `grid` (the current grid when not
   * given), the plate's clocks and counters start from zero, and the look is
   * laid from the seed. Resolves once the laid plate's first readbacks have
   * landed, so the first frame reads the render's own plate, not the live
   * one's.
   */
  begin: (o: { fps: number; width: number; height: number; stepRate?: number; grid?: number | null; lookId?: string | null; digest?: boolean }) => Promise<{ grid: number; lookId: string; stepRate: number }>;
  /** Draw the next frame with this frame's sound, and return it as a VideoFrame with these times. */
  step: (audio: AudioData | null, timestampUs: number, durationUs: number) => VideoFrame;
  /** The state the last frame was drawn from, when `begin` was asked for digests (the checks); else null. */
  digest: () => FrameDigest | null;
  /** Resolves once the GPU has finished the frame and every readback it asked for has landed. */
  settle: () => Promise<void>;
  /** Give the plate back to the live loop, at its own size. */
  end: () => void;
}

/** What the song's shape tracker has heard, for the app to read (`songShape` on the handle). */
export interface SongShapeReport {
  now: SongShapeState;
  /** Where the beats fall and which is the one (`lib/barGrid.ts`). */
  bar: BarNow;
  /** The last few events, oldest first; `seq` counts every event since the plate started. */
  events: (SongEvent & { seq: number })[];
}

export interface LiquidVisualizerHandle {
  /** A song render's hold on the plate; see `VisualizerRender`. Null until the stage is up. */
  render: () => VisualizerRender | null;
  injectImage: (imageData: ImageData) => void;
  pourVideo: (video: HTMLVideoElement) => void;
  stopPourVideo: () => void;
  /**
   * Pour words into the lead plate: each row drawn at the biggest size its
   * share of the box allows, in `colour` (default: the look's brightest dye;
   * 'contrast' picks an ink that reads against the plate as it is), level on
   * the frame whatever angle the plate is turned to.
   */
  pourText: (rows: { text: string; weight?: number }[], opts?: { colour?: string | 'contrast'; columns?: [number, number] }) => void;
  /** Kicks heard (or predicted) since the plate started: a count to take differences of. */
  kicks: () => number;
  /**
   * The song's shape (`lib/songShape.ts`): where the song is now, and the
   * builds, drops and breakdowns heard lately, each numbered so a reader that
   * polls can take only the ones it has not seen.
   */
  songShape: () => SongShapeReport;
  /**
   * Where the closeup camera is pointed, in plate uv, or null while there is
   * no closeup (MacroCamera.centre): what Hold aims at, so it stays put (QA-12).
   */
  macroCentre: () => { x: number; y: number } | null;
  /** Move the look's working dyes on by one, the way the hue journey would. */
  stepDyes: () => void;
  /** Where a paced scene is (`lib/scenePacing.ts`); the plate follows it at its own rate. 1 and 1 is no pacing. */
  pace: (sample: PaceSample) => void;
  /** A flood across a good share of the lead plate, `gust` (0..1, default 0.8) its size and force. */
  pour: (gust?: number) => void;
  /**
   * Clear the plate and seed it as `presetId`; a user preset passes its own dyes, injection styles and liquids.
   * `phase` is the Ferrofluid (and its Scale) the look asks for, when the caller knows it: the look's settings
   * reach the plate a render after this call, so without it the ferrofluid is laid by the last look's.
   */
  applyPreset: (presetId: string, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }, phase?: LookPhase) => void;
  /** The dyes, injection styles and liquids in force, for saving the current look as a preset. */
  /** What is on each live layer: how full it is, and the colour of it. */
  layerReport: () => { index: number; fill: number; colour: string }[];
  describePlate: () => { contract: number[] | null; injectStyles: string[]; liquids: string[] };
  /**
   * Take on a preset's dyes, injection style and liquids without clearing the
   * plate — the sequencer's way of changing stage, and the desk's Go.
   *
   * `extras` is how a user preset gets adopted. Its dyes are not in the maps
   * here (they live in the saved file), so before this took them the only way
   * to register them was `applyPreset` — which clears. A sequence that
   * changed to one of your own looks cut the plate to black; the built-ins
   * next to it did not.
   */
  adoptPreset: (presetId: string, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }) => void;
  /** A pressed look change over `seconds`: the old dye thins while the new palette pours in. */
  /** A look fading in over `seconds`; `phase` as for applyPreset: what the incoming look asks of the ferrofluid, laid half way. */
  handoff: (seconds: number, phase?: LookPhase) => void;
  /**
   * Send a look to the back plate alone (PLAN.md §16a), or `null` to have it
   * follow the front again. Over `seconds`: its solver settings fade the way
   * a Go's do, its old dye thins and the look's own is laid in, and from then
   * on it pours the look's dyes, styles and liquids while the front pours
   * its own. `extras` is a user preset's dyes, as for `adoptPreset`.
   */
  sendBack: (presetId: string | null, look: VisualizerSettings | null, seconds: number, name?: string | null, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }) => void;
  /** Restrict the working palette to `size` of the contract's dyes, led by `lead`; null size = all of them. */
  setPaletteWindow: (size: number | null, lead: number) => void;
  setInjectStyle: (styles: string[]) => void;
  /** What the automation may pour, as liquid ids. An empty list is a plate with only dye on it. */
  setPlateLiquids: (ids: string[]) => void;
  /** Pin the color harmony to a specific palette-index set (music intelligence). */
  setHarmony: (indices: number[]) => void;
  /** User palette lock — overrides auto-rotation, drains, seeds and music. Pass null to unlock. */
  setHarmonyLock: (indices: number[] | null) => void;
  /** Fire a themed dye burst for a lyric word-trigger. */
  triggerTheme: (theme: string, energy?: number) => void;
  /** Re-fire a recorded manual gesture (performance replay). Normalized coords; `layer` defaults to the active one. */
  /**
   * A gesture from any hand: mouse, phone pad, pen, gamepad or MIDI. `amount`
   * (0..1, default 0.5) scales the drop's size or the puff's strength, so a
   * pen pressed harder drops more dye; `dx`/`dy` give a blow its direction
   * (a pen's tilt, a stick's push) instead of a radial puff.
   */
  applyGesture: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; clear?: boolean; layer?: number; amount?: number; id?: number }) => void;
  /** A tilt from outside — the phone's gyroscope — in −1..1 per axis. Fades out if not refreshed. */
  setExternalTilt: (x: number, y: number) => void;
  /** Where the picture sits on screen (letterboxed when a stage is attached), for overlays that track the plate. */
  drawnRect: () => DOMRect | null;
  /** What the dye is doing, cheaply, for an instrument that plays the plate. */
  plateReading: (voices: number) => { wetness: number; colour: [number, number, number]; cells: number[]; flow: number; swirl: number } | null;
  /** Film projector: a video file, the camera, or another window, shown through the dye. */
  loadFilmFile: (file: File) => Promise<void>;
  startFilmCamera: () => Promise<void>;
  /**
   * A window, a tab or a screen, picked from the browser's own chooser.
   *
   * `onEnded` fires if the capture stops from the browser's side — the Stop
   * sharing button, or the tab being closed — which is the one way a film
   * source can go away without the app asking. Without it the panel goes on
   * saying "window live" over a projector showing nothing.
   */
  /**
   * Capture a tab, window or screen as the film.
   *
   * `onBlank` fires when the capture yields nothing but black pixels, which a
   * window playing hardware-accelerated video does — see the note at the
   * implementation. The plate cannot tell that from a very dark film, so the
   * operator is told.
   */
  startFilmWindow: (onEnded?: () => void, onBlank?: () => void) => Promise<void>;
  clearFilm: () => void;
  /**
   * A logo or title card laid over the finished frame.
   *
   * Not `injectImage`, which pours a picture into the plate as dye: that is
   * the lovely thing to do with an image and the wrong thing to do with a
   * client's mark, which has to stay readable for three hours. This one sits
   * over the top and does not dissolve.
   *
   * Composited in the shader rather than as an element over the canvas, so it
   * reaches everything that reads the canvas: the projector window, a cast to
   * another screen, the recorder, and another machine capturing this window.
   */
  loadMark: (source: CanvasImageSource, width: number, height: number) => void;
  clearMark: () => void;
  /**
   * Fire the envelopes — a MIDI note, a pad, a finger on the phone.
   *
   * On the handle rather than reached through settings because it is an event,
   * and because the thing firing it should not have to know what an envelope
   * is. `velocity` scales how far they swing, so a hard note hits harder.
   */
  fireEnvelopes: (velocity?: number) => void;
  /**
   * The element the film is playing in, so it can be read back as a sensor
   * as well as shown through the dye. Null when nothing is loaded.
   *
   * Handed out rather than copied: there is one film, and a second video
   * element decoding the same source would double the cost and still drift a
   * frame from what is on the plate.
   */
  filmVideoEl: () => HTMLVideoElement | null;
  /**
   * A second display mirrors this canvas pixel for pixel: render at its size
   * (the projector's pixels) and letterbox it here. Null returns to the window.
   */
  setStage: (size: { width: number; height: number } | null) => void;
}


/** A working harmony drawn from inside a contract: the whole set when small, else WORKING_DYES of it. */
const harmonyWithin = (contract: number[]): number[] => {
  if (contract.length <= WORKING_DYES) return contract;
  const pool = [...contract];
  const out: number[] = [];
  while (out.length < WORKING_DYES) out.push(pool.splice(DICE.palette.int(pool.length), 1)[0]);
  return out;
};

/**
 * A window onto the contract: `size` dyes starting at `lead`, wrapping. This
 * is how a show walks its hues — the window slides one dye at a time, so the
 * plate keeps most of its colours while one drains and a new one arrives —
 * and how a monochrome opening is done: a window of one.
 */
const windowOf = (contract: number[], size: number | null, lead: number): number[] => {
  const n = contract.length;
  if (n === 0) return contract;
  const w = Math.max(1, Math.min(n, size ?? Math.min(n, WORKING_DYES)));
  const out: number[] = [];
  const start = ((Math.round(lead) % n) + n) % n;
  for (let i = 0; i < w; i++) out.push(contract[(start + i) % n]);
  return out;
};

// ─── Fluid Simulation ────────────────────────────────────────────────

class FluidSimulation {
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
  private dirty = false;
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
  /** Cells each presser's strokes have pressed on this plate (a kick's are Beat Squeeze's), and how deep, summed over those cells. */
  readonly pressedCells: Record<Presser, number> = { hand: 0, kick: 0 };
  readonly pressedDepth: Record<Presser, number> = { hand: 0, kick: 0 };
  /**
   * Beat Squeeze's kicks, given back (lib/squish.ts `KickRelease`): each
   * kick's press is held a moment and then let go over a third of a second,
   * or the lead plate's middle goes to the floor a few seconds into a song.
   * Public for `npm run squeeze`, which reads how many release steps it laid.
   */
  readonly kickRelease = new KickRelease();
  /** The last lift this plate laid: where, and how many cells it touched. */
  lastLift: { x: number; y: number; cells: number } | null = null;
  /** Forget the last press, as a fresh plate has none: a song render starts here, on its own clock. */
  forgetPress(): void { this.squishSteps = 0; this.squishLastAt = 0; this.squishLastStep = -1; this.pressLift.forget(); this.kickRelease.forget(); this.lastLift = null; }
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
    this.tiltX = 0; this.tiltY = 0; this.rockX = 0; this.rockY = 0;
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
    for (let i = 0; i < GRID_AREA; i++) {
      const d = dye[i * 4 + 3];
      this.rbDensity[i] = d;
      this.rbVx[i] = vel[i * 4];
      this.rbVy[i] = vel[i * 4 + 1];
      sum += d;
      sr += dye[i * 4]; sg += dye[i * 4 + 1]; sb += dye[i * 4 + 2];
    }
    this.meanDensity = sum / GRID_AREA;
    this.meanColor = [sr / GRID_AREA, sg / GRID_AREA, sb / GRID_AREA];
    this.rbSeq++;
  }

  private pullStateFromGpu() {
    const gpu = this.gpu!;
    // Nothing has come back from this solver yet: its readback is still the
    // zeros it was allocated as, so the plate is the seed it opened on (S3).
    // Whatever was added in the frame or two since is let go — a blank plate
    // is not.
    if (!this.gpuLanded && this.restoreSeed()) return;
    if (this.dirty) this.flushDeltas(this.dt || 0.01);
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

  private flushDeltas(dt: number) {
    const gpu = this.gpu!;
    const da = this.dyeAdd, va = this.velAdd;
    for (let i = 0; i < GRID_AREA; i++) {
      const i4 = i * 4;
      da[i4] = this.densityR[i]; da[i4 + 1] = this.densityG[i]; da[i4 + 2] = this.densityB[i]; da[i4 + 3] = this.density[i];
      va[i4] = this.vx[i]; va[i4 + 1] = this.vy[i]; va[i4 + 2] = this.temp[i]; va[i4 + 3] = this.gap[i];
    }
    gpu.applyDeltas(da, va, this.mul, dt, this.handsLaid ? this.hands : null, this.breathLaid ? this.breath : null);
    if (this.dyeMovePending) { this.dyeMovePending = false; this.dyeMoveAfter = gpu.rbDyeIssued + 1; }
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.temp.fill(0); this.gap.fill(0);
    this.mul.fill(1);
    if (this.handsLaid) { this.hands!.fill(0); this.handsLaid = false; }
    if (this.breathLaid) { this.breath!.fill(0); this.breathLaid = false; }
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
      if (depositRim(this.dyeTarget(), N, b.x, b.y, R, mass, aR, aG, aB)) this.dirty = true;
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
      this.dirty = true;
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

  addDensity(x: number, y: number, amount: number, r = 1, g = 1, b = 1) {
    const index = x + y * this.size;
    this.dirty = true;
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
    this.dirty = true;
    this.vx[index] += amountX;
    this.vy[index] += amountY;
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
    this.dirty = true;
    this.temp[index] += amount;
  }

  // Inject an image as colored dye — scales image to fit visible grid area
  injectImage(imgData: ImageData) {
    const w = imgData.width, h = imgData.height;
    const d = imgData.data; // RGBA Uint8ClampedArray
    // Map image into the central visible region of the grid
    const S = this.size;
    const gx0 = Math.round(S * 0.19), gx1 = Math.round(S * 0.81);
    const gy0 = Math.round(S * 0.31), gy1 = Math.round(S * 0.69);
    const gw = gx1 - gx0, gh = gy1 - gy0;
    for (let gy = gy0; gy < gy1; gy++) {
      for (let gx = gx0; gx < gx1; gx++) {
        // Sample the image pixel (bilinear centre of each grid cell)
        const imgX = Math.floor(((gx - gx0) / gw) * w);
        const imgY = Math.floor(((gy - gy0) / gh) * h);
        const pi = (imgY * w + imgX) * 4;
        const r = d[pi] / 255, g = d[pi + 1] / 255, b = d[pi + 2] / 255;
        const a = d[pi + 3] / 255;
        if (a < 0.05) continue; // skip transparent pixels
        const brightness = r * 0.3 + g * 0.59 + b * 0.11;
        const amount = (0.5 + brightness * 1.5) * a;
        this.addDensity(gx, gy, amount, r, g, b);
      }
    }
  }

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
    this.pressLift.forget(); this.kickRelease.forget(); this.lastLift = null;
    this.rbDensity.fill(0); this.rbVx.fill(0); this.rbVy.fill(0);
    this.cvx.fill(0); this.cvy.fill(0); this.cpr.fill(0); this.cdv.fill(0);
    this.dirty = false;
    this.dyeMovePending = false;
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
      const c = col(a.dye);
      this.splatBlob(a.x * S, a.y * S, R * 0.45, 3.2 * fill, c.r, c.g, c.b);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + this.rng.centred() * 0.5;
        const d = (0.55 + this.rng.float() * 0.3) * a.r * S;
        const cc = i % 3 === 2 ? col(a.dye + 1) : c;
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

    const areas = plateAreas(presetId);
    if (areas) { this.layAreas(areas, col); return harmony; }

    switch (presetId) {
      case 'galaxy': {
        // Bright core
        this.splatBlob(cx, cy, 5, 5.0, 0.85, 0.92, 1.0);
        this.splatBlob(cx, cy, 11, 2.5, 0.5, 0.25, 0.85);
        // Two logarithmic spiral arms
        for (let arm = 0; arm < 2; arm++) {
          const offset = arm * Math.PI;
          const c = col(arm);
          for (let t = 0.3; t < 5.5; t += 0.06) {
            const r = (3 + t * 8) * k;
            const theta = t * 1.3 + offset;
            const x = cx + r * Math.cos(theta), y = cy + r * Math.sin(theta);
            const bright = Math.max(0.1, 1.0 - t / 6.5);
            this.splatBlob(x, y, 1.8 + bright * 2.5, bright * 2.8, c.r, c.g, c.b);
          }
        }
        // Scattered stars
        for (let i = 0; i < 100; i++) {
          const a = this.rng.angle(), d = (3 + this.rng.float() * 48) * k;
          const c = this.rng.float() < 0.35 ? { r: 1, g: 1, b: 1 } : col(this.rng.int(4));
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
            0.6 + this.rng.float(), 0.4 + this.rng.float() * 1.2, c.r, c.g, c.b);
        }
        // Angular velocity for swirl
        for (let j = 2; j < S - 2; j += 2) {
          for (let i = 2; i < S - 2; i += 2) {
            const dx = i - cx, dy = j - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 55 * k) continue;
            const spd = 0.12 / (1 + (dist / k) * 0.025);
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

      case 'fillmore-1969': {
        // The Fillmore dish: a cool core at the centre of the plate (icy
        // blue over cobalt), a ring of warm blobs round it (orange, yellow,
        // cherry) that the beads sit in, and green and purple wisps out at
        // the rim. Amounts stay short of saturation so the ground shows.
        const cool = [3, 4].map(i => col(i));      // icy blue, emerald in the contract order
        this.splatBlob(cx, cy, 20, 1.1, cool[0].r, cool[0].g, cool[0].b);
        this.splatBlob(cx + 6 * k, cy - 4 * k, 9, 1.4, 0.65, 0.95, 0.95);
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * Math.PI * 2 + 0.3;
          const rr = (30 + (i % 3) * 7) * k;
          const c = col(i % 3);                     // orange, yellow, cherry
          this.splatBlob(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 7 + (i % 2) * 3, 1.5, c.r, c.g, c.b);
        }
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 1.1;
          const rr = 52 * k;
          const c = col(4 + (i % 2));               // emerald, purple
          this.splatBlob(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 6, 1.0, c.r, c.g, c.b);
        }
        break;
      }

      case 'classic': {
        /*
          Luminous, not thick, and on the screen.

          Seven blobs 2.5 deep, four of them at the plate's corners: the
          corners are off the screen (it shows the middle two thirds across
          and less than half down), and 2.5 is deep enough that light through
          the dye (Beer–Lambert) comes out near black. The gallery's Classic
          was a grey plate with dark rings where the three middle blobs were,
          lit only at their rims, for its first forty seconds and more; it
          only came alive once something spread the dye thin. So a ring of
          lighter blobs round the middle, where the screen is, and the
          corners as they were, thinner.
        */
        const blobs: [number, number, number][] = [[0.5, 0.5, 11]];
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + 0.3;
          blobs.push([0.5 + Math.cos(a) * 0.19, 0.5 + Math.sin(a) * 0.15, 9 + (i % 2) * 2]);
        }
        blobs.push([0.22, 0.22, 16], [0.78, 0.22, 16], [0.22, 0.78, 16], [0.78, 0.78, 16]);
        blobs.forEach(([fx, fy, rad], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, rad, 1.1, c.r, c.g, c.b);
        });
        break;
      }

      case 'deep-ocean': {
        for (let band = 0; band < 5; band++) {
          const by = S * (0.18 + band * 0.16);
          const c = col(band);
          for (let i = 2; i < S - 2; i++) {
            const wy = by + Math.sin(i * 0.06 + band * 1.5) * 8;
            this.splatBlob(i, wy, 6, 1.2, c.r, c.g, c.b);
          }
        }
        for (let j = 2; j < S - 2; j += 3)
          for (let i = 2; i < S - 2; i += 3)
            this.addVelocity(i, j, 0.04 + Math.sin(j * 0.05) * 0.02, 0);
        break;
      }

      case 'cyberpunk': {
        for (let s = 0; s < 5; s++) {
          const c = col(s);
          const sx = this.rng.float() * S * 0.3, sy = this.rng.float() * S;
          const a = Math.PI * 0.2 + s * 0.15;
          for (let t = 0; t < S * 1.2; t += 1.5) {
            const x = sx + Math.cos(a) * t, y = sy + Math.sin(a) * t;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            this.splatBlob(x, y, 2.5, 2.0, c.r, c.g, c.b);
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

      case 'timbre-shifter': {
        for (let j = 2; j < S - 2; j += 2)
          for (let i = 2; i < S - 2; i += 2) {
            const n = noise2D(i * 0.03, j * 0.03);
            const c = col(Math.floor((n + 1) * 2));
            this.addDensity(i, j, 0.8 + n * 0.4, c.r, c.g, c.b);
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
        for (let j = 0; j < 12; j++)
          for (let i = 0; i < 12; i++) {
            const c = col(i + j);
            this.splatBlob((10 + i * 9 + this.rng.centred() * 4) * k, (10 + j * 9 + this.rng.centred() * 4) * k, 3.5, 2.5, c.r, c.g, c.b);
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
        for (let jf = 0; jf < 4; jf++) {
          const jx = S * (0.2 + jf * 0.2 + this.rng.centred() * 0.1);
          const jy = S * (0.3 + this.rng.centred() * 0.3);
          const c = col(jf);
          const bellR = (8 + this.rng.float() * 6) * k;
          for (let a = -Math.PI; a < 0; a += 0.06)
            for (let r = 0; r < bellR; r += 1.5) {
              const x = jx + Math.cos(a) * r, y = jy + Math.sin(a) * r * 0.7;
              if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
              this.splatBlob(x, y, 1.5, (1.0 - r / bellR) * 2.0, c.r, c.g, c.b);
            }
          for (let t = 0; t < 3; t++) {
            let tx = jx + (t - 1) * bellR * 0.4;
            for (let dy = 0; dy < (18 + this.rng.float() * 10) * k; dy++) {
              const wb = Math.sin(dy * 0.2 + t) * 2 * k;
              this.splatBlob(tx + wb, jy + dy, 1.0, 0.8 / (1 + dy * 0.05), c.r, c.g, c.b);
            }
          }
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
        this.splatBlob(cx, cy, 6, 4.0, 1.0, 1.0, 1.0);
        const ringR = 30 * k;
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          const r = ringR + this.rng.centred() * 8 * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
          const c = col(i);
          this.splatBlob(x, y, 1.5 + this.rng.float() * 1.5, 1.5 + this.rng.float(), c.r, c.g, c.b);
          const dx = cx - x, dy = cy - y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.addVelocity(Math.floor(x), Math.floor(y), dx / dist * 0.08, dy / dist * 0.08);
        }
        for (let i = 0; i < 40; i++) {
          const a = this.rng.angle(), d = (5 + this.rng.float() * 45) * k;
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5 + this.rng.float() * 0.8, 0.3 + this.rng.float() * 0.5, 1, 1, 1);
        }
        for (let j = 2; j < S - 2; j += 3)
          for (let i = 2; i < S - 2; i += 3) {
            const dx = i - cx, dy = j - cy, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 50 * k) continue;
            const spd = 0.06 / (1 + (dist / k) * 0.02);
            this.addVelocity(i, j, -dy / dist * spd, dx / dist * spd);
          }
        break;
      }

      // ── Macro closeup seeds ──────────────────────────────────────
      // These three exist for the macro camera: it needs *separated* beads to
      // pick from, not one continuous wash covering the plate.
      case 'macro-bead': {
        for (let i = 0; i < 26; i++) {
          const x = 14 + this.rng.float() * (S - 28), y = 14 + this.rng.float() * (S - 28);
          const c = col(i);
          const r = (2 + this.rng.float() * 5) * k;
          this.splatBlob(x, y, r, 2.2 + this.rng.float() * 2.0, c.r, c.g, c.b);
          // A dark shoulder on one side — cells and lacing key off this contrast
          this.splatBlob(x + r * 0.9, y + r * 0.7, r * 0.5, 0.9, 0.06, 0.05, 0.05);
          const a = this.rng.angle();
          this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        }
        break;
      }

      case 'lace-run': {
        // A tongue of light dye running across the plate — its leading edge is
        // where the lacing filaments form.
        const head = col(0), trail = col(1);
        for (let t = 0; t < 90; t++) {
          const x = S * 0.2 + t * (S * 0.6 / 90);
          const y = S * 0.5 + Math.sin(t * 0.07) * 10 * k;
          this.splatBlob(x, y, (6 + Math.sin(t * 0.15) * 3) * k, 2.4, head.r, head.g, head.b);
          this.addVelocity(Math.floor(x), Math.floor(y), 0.07, 0.0);
        }
        for (let i = 0; i < 34; i++) {
          const x = S * 0.18 + this.rng.float() * S * 0.7;
          const y = S * 0.5 + this.rng.centred() * S * 0.35;
          this.splatBlob(x, y, (1 + this.rng.float() * 3) * k, 1.6, trail.r, trail.g, trail.b);
        }
        break;
      }

      case 'milk-marble': {
        // The dish on the kitchen table: a pale ground across the whole plate,
        // four spots of food colouring sitting on it, and nothing moving at
        // all until the soap arrives. Which is the entire trick — the colour
        // has been ready to run the whole time, it just had no reason to.
        this.splatBlob(cx, cy, S * 0.52, 0.85, 0.96, 0.94, 0.89);
        const spots: [number, number][] = [[0.37, 0.37], [0.63, 0.37], [0.37, 0.63], [0.63, 0.63]];
        spots.forEach(([fx, fy], i) => {
          const c = col(i);
          this.splatBlob(fx * S, fy * S, 7 * k, 3.2, c.r, c.g, c.b);
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
        shape(0.3, 0.36, 0.09, 0, [[2.6, 0.6], [4.2, 0.5]]);
        shape(0.5, 0.14, 0.05, 2, [[0.3, 0.6]]);
        shape(0.86, 0.46, 0.05, 1, []);
        shape(0.68, 0.74, 0.1, 2, [[5.6, 0.55], [1.9, 0.5]]);
        shape(0.16, 0.86, 0.055, 2, [[0, 0.6]]);
        shape(0.46, 0.86, 0.05, 1, [[3.4, 0.7]]);
        shape(0.6, 0.3, 0.045, 1, []);
        stroke(0.36, 0.58, 0.52, 0.42, 0.7, 0.54, 0.05, 0);
        stroke(0.86, 0.88, 0.95, 0.74, 0.84, 0.62, 0.035, 0);
        stroke(0.08, 0.56, 0.16, 0.44, 0.06, 0.3, 0.04, 1);
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

      // Boyle's bench starts from clean glass: the pattern is the subject,
      // not a seed of blobs. (Wilfred's lumia did too, until the owner found
      // it underwhelming; it is laid by its areas now, above.)
      case 'sensual-laboratory':
      // Ferro Maze is ink on a white light table: the ferrofluid is the
      // picture, poured with the look (layPhase), and the glass stays clear.
      case 'ferro-maze':
        break;
      default: {
        for (let i = 0; i < 5; i++) {
          const c = col(i);
          this.splatBlob(10 + this.rng.float() * (S - 20), 10 + this.rng.float() * (S - 20), 15, 2.0, c.r, c.g, c.b);
        }
        break;
      }
    }

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
    // The kicks' presses, let go (`pressKick`): no Fingering, so no spokes and
    // no dye, only the gap given back, which the shader never opens past rest.
    this.kickRelease.step(this.size, this.dtSeconds, this.squishCell);
  }

  /**
   * Beat Squeeze's kick: the top glass pressed over three nested discs
   * across most of the dish (KICK_RADII: a rough dome, so the dye spreads
   * from the middle instead of only at one hard ring), remembered for the lift like a hand's press, and let go a
   * moment later (`kickRelease`). `amount` is each disc's press.
   */
  pressKick(x: number, y: number, amount: number, fingering: number): void {
    x = Math.round(x);
    y = Math.round(y);
    KICK_RADII.forEach((r, i) => this.applySquish(x, y, r, amount, fingering, i === 0, 'press', 'kick'));
    this.kickRelease.kick(x, y, KICK_RADII.map((r) => Math.round(r * GRID_SCALE)), amount, this.thinGap);
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
      if (layFinger(this.hands, this.size, x, y, r, m.x, m.y) > 0) { this.dirty = true; this.handsLaid = true; }
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
        this.dirty = true; this.breathLaid = true; this.lastBlowAired = true;
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
      const applied = this.dirty;
      if (applied) this.flushDeltas(p.dt);
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
      this.density[i]  *= p.evapFactor;
      this.densityR[i] *= p.evapFactor;
      this.densityG[i] *= p.evapFactor;
      this.densityB[i] *= p.evapFactor;
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
    this.meanDensity = densSum / GRID_AREA;
    this.meanColor = [colR / GRID_AREA, colG / GRID_AREA, colB / GRID_AREA];
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
    const budget = Math.max(0.1, Math.min(1.2, settings.dyeBudget ?? 0.85));
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
    const regulatorEvap = Math.min(0.12, over * over * 0.6);
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
      // The lasting current. Damping is its drag per step — the first thing that
      // control has ever visibly done — and the cap keeps a step's travel under
      // ¾ of a cell whatever the Speed and Advection.
      currentDamp: Math.max(0.8, Math.min(0.995, settings.damping || 0.99)),
      currentBuoy: Math.max(0, settings.buoyancy ?? 0) * CUR_BUOY,
      rockX: this.tiltX * 10.0 + this.rockX * CUR_ROCK,
      rockY: this.tiltY * 10.0 + this.rockY * CUR_ROCK,
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
        let fx = p.rockX * dd;
        let fy = p.currentBuoy * Math.tanh(Math.max(0, this.temp[q]) * 20) + p.rockY * dd;   // saturated heat (see the GPU twin)
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



/**
 * What the show decided this frame, for whoever draws it
 * (docs/webgpu-plan.md, P3).
 *
 * Plain numbers and settings — no GL, no WGSL. Everything else a renderer
 * needs it reads from the refs it shares with the loop, or owns itself. The
 * list is short because the frame's own state was hoisted out of the draw
 * first: the lamp, the gel, the kaleidoscope and the bubbles are advanced by
 * the loop and read from their refs.
 */
interface FrameView {
  settings: VisualizerSettings;
  /** The simulation clock, which the speed control governs. */
  time: number;
  /** Where the macro camera is parked, and how hard it is moving. */
  shot: MacroShot;
  /** How far into the macro closeup, 0 at the plate and 1 once it is in. */
  macroOn: boolean;
  macroAmount: number;
  isDarkBlend: boolean;
  /** Plate-uv per unit of the cell clock per unit of solver velocity (lib/detailFlow.ts). */
  flowRate: number;
  /** The lead plate's dye travel, which the closeup's cells slide and breathe on. */
  cellClock: number;

  // What the show worked out this frame and the renderer only spends.
  /** Where each plate has turned to. */
  rotations: number[];
  /** The working harmony, as hues. */
  harmony: number[];
  /** Where the lamp and its second have wandered to, under the plate. */
  lamp: { x: number; y: number; x2: number; y2: number };
  /** The magnets the lead plate was last stepped with: what stands the ferrofluid up into spikes. */
  magnets: readonly { x: number; y: number; height: number; strength: number; radius: number }[];
  gelAngle: number;
  kaleidoPhase: number;
  /** The second plate's throw: how magnified, and how far it has drifted. */
  layer1: { zoom: number; dx: number; dy: number };
  /** How many bubbles are on the plate and how strongly they read. */
  bubbles: { count: number; strength: number; amount: number };
  /** Their geometry, packed for the shader. */
  bubblePack: { packed: Float32Array; shape: Float32Array };
  /** The flash guard's gain, from the luminance the last frame read back, times a paced scene's light (lib/scenePacing.ts). */
  dimmerGain: number;
  /** The exposure the film histogram settled on. */
  filmLevel: number;
  filmGain: number;
  /** The mark laid over the finished frame, and the film projected through it. */
  mark: { source: CanvasImageSource; aspect: number; dirty: boolean } | null;
  film: { video: HTMLVideoElement | null; kind: 'none' | 'file' | 'camera' | 'window'; stream: MediaStream | null; url: string | null };
  /**
   * The oil beads' mask, on the frames the beads moved and it was redrawn —
   * null on every other frame, and whenever the beads are off. The show
   * decides when it changes so that both engines upload the same picture on
   * the same frames rather than each asking the bead field in its own way.
   */
  beadMask: CanvasImageSource | null;
  /** Where the frame is going: the projector's shape, and the effects. */
  outputCfg: OutputConfig;
  postForce: boolean;
  postTest: PostTest | null;
  fxFrame: number;
  fxSeed: number;
}

/**
 * What the loop needs of whatever is drawing (docs/webgpu-plan.md, P3).
 *
 * The show decides a frame and hands it over; everything about *how* it is
 * drawn — the programs, the textures, the passes, which solver the fields
 * live on — is behind this. It is short because the frame's own state was
 * taken out of the draw first.
 */
interface PlateRenderer {
  /** For the engine badge: which API this is, and what it is running on. */
  readonly info: { renderer: string; gpuClass: GpuClass };
  /** The biggest texture this device will take, which decides the solver's grid. */
  readonly maxTexture: number;
  /** Size the canvas to the stage, at this device-pixel ratio. */
  resize(): void;
  /**
   * Put this field's solver on the GPU at `wantRes`, or take it off when the
   * resolution is 0. Returns false when this device cannot, and the caller
   * should stop asking.
   */
  attachSolver(fluid: FluidSimulation, wantRes: number): boolean;
  /** One frame. Returns what the flash guard read, or null when it is off. */
  drawFrame(view: FrameView, fluids: FluidSimulation[]): number | null;
  /**
   * What the GPU spent on a frame that took `steps` solver steps, in
   * milliseconds — the drawing and the solver together, from timestamp
   * queries. Absent on an engine that cannot say (WebGL's timer queries count
   * queue waits on ANGLE and lie), and 0 until the first timings land.
   */
  gpuFrameMs?(steps: number): number;
  /**
   * What `?debug` should show about this engine in particular. It is spread
   * into `chromaglassDebug()` at the top level, so a harness reaching for
   * `chromaglassDebug().gl` finds it exactly where it always was.
   */
  debug?(): Record<string, unknown>;
}


// ─── React Component ─────────────────────────────────────────────────

/**
 * A layer's mean dye as a swatch.
 *
 * Normalised by its own brightest channel rather than shown raw: a layer with
 * a little dye on it averages to almost black across the whole grid, and a row
 * of near-black squares says nothing. Scaling to the hue keeps a quiet layer
 * legible while `fill` carries how much is actually there.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const peak = Math.max(r, g, b);
  const k = peak > 0.001 ? 0.85 / peak : 0;
  const to = (v: number) => {
    const n = Math.round(Math.max(0, Math.min(1, v * k)) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return peak <= 0.001 ? '#111111' : `#${to(r)}${to(g)}${to(b)}`;
}

export const LiquidVisualizer = forwardRef<LiquidVisualizerHandle, LiquidVisualizerProps>(({
  audioData, hear, settings, seedCount = 0, spinFlick, selectedLiquid, frame = null, onAim, onPinchZoom, toolAmount = 1,
  activeLayer = 0, clearTrigger = 0, drainTrigger = 0, activeTool = 'dropper',
  isAutomated = false, isActive = true, sceneRef, filmSenseRef, onManualGesture, onEngineStatus, onBackLookCleared,
  output = DEFAULT_OUTPUT, tempoRef, soundBindings, onSoundTrigger, onMagnetInHand, onFerrofluidPoured,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Where the intro goes once the plate is on the page: just above the canvas, under everything else in the frame. */
  const introSlotRef = useRef<HTMLDivElement>(null);
  const fluidsRef = useRef<FluidSimulation[]>([]);
  /*
    The noise a look is laid with and the CPU turbulence stirs by.

    `createNoise2D()` with no argument builds its permutation table from
    `Math.random`, so the "timbre-shifter" wash and every noise-driven stir
    was a different field on every page load, and no seed could reach it.
    Now the table is made from the show's seed — a generator of its own
    (`makeRng`), not a stream, because the field is a function of the seed
    alone and laying a look should not rebuild it — and made again when the
    seed changes (`setShowSeed`), behind the same function, so everything
    that was handed `noise2D` keeps the one it was handed.
  */
  const noise2D = useMemo(() => {
    let keyedOn = -1;
    let field: (x: number, y: number) => number = () => 0;
    return (x: number, y: number): number => {
      if (keyedOn !== showSeed()) { keyedOn = showSeed(); field = createNoise2D(makeRng(keyedOn, 'plate.noise').float); }
      return field(x, y);
    };
  }, []);
  const lastSeedCount = useRef(seedCount);
  const lastClearTrigger = useRef(clearTrigger);
  const lastDrainTrigger = useRef(drainTrigger);
  /*
    Drain and Clear, where the render loop can see them.

    These are counters: the loop compares the prop against the last value it
    acted on and runs the animation when it has gone up. But the loop lives
    inside one very large effect whose dependencies are `[noise2D, seedCount,
    glEpoch]`, so a press that raised `drainTrigger` did not re-run it and the
    loop went on reading the value captured when the GL context was built.
    Drain did nothing — until the next Seed or a resolution change happened to
    rebuild the effect, at which point the loop woke up holding a counter that
    had gone up while it was not looking and drained the plate *then*, one
    press late and long after anyone had connected the two.

    Seed works only by accident of being in that dependency list, which is
    also why every seed rebuilds the whole GL context. Refs are how every
    other live prop reaches this loop (`isActiveRef`, `settingsRef`), and they
    are what these should have used.
  */
  const drainTriggerRef = useRef(drainTrigger);
  const clearTriggerRef = useRef(clearTrigger);
  /*
    And Seed, which is the reason the other two went unnoticed for so long.

    Seed is the same kind of counter, and it worked — but only because it was
    in that dependency list. Which means every press of Seed was tearing down
    and rebuilding the entire GL context: compiling every shader, reallocating
    every framebuffer, rebuilding the simulations. A button people press
    repeatedly while building a look was the most expensive thing in the app,
    and the plate blinked each time.

    Nothing in the effect's setup reads `seedCount` — the seeding itself
    happens inside the render loop, from this comparison — so the rebuild was
    never doing the work. It was only delivering the news.
  */
  const seedCountRef = useRef(seedCount);
  useEffect(() => { drainTriggerRef.current = drainTrigger; }, [drainTrigger]);
  useEffect(() => { clearTriggerRef.current = clearTrigger; }, [clearTrigger]);
  useEffect(() => { seedCountRef.current = seedCount; }, [seedCount]);
  const drainFrameRef = useRef(0); // >0 means drain animation is running
  /**
   * Where the mirror rig has turned to, in radians.
   *
   * Integrated rather than derived from elapsed time: a rate multiplied by
   * elapsed time moves the whole history, so every nudge of the speed used to
   * jump the pattern. In turns per second, which is why the 2π.
   */
  const kaleidoPhaseRef = useRef(0);
  // The opening palette from a generator of its own, keyed on the seed: this
  // line runs on every render, and a draw from the palette stream here would
  // move every colour after it by however many times React rendered.
  const harmonyRef = useRef(pickHarmony(makeRng(showSeed(), 'plate.palette', 'opening')));
  const harmonyLockRef = useRef<number[] | null>(null); // user-pinned palette
  const presetContractRef = useRef<number[] | null>(PRESET_CONTRACTS['classic']); // the preset's allowed dyes
  /** The sequencer's window onto the contract (size null = whatever the journey allows), and the hue journey's own lead. */
  const paletteWindowRef = useRef<{ size: number | null; lead: number }>({ size: null, lead: 0 });
  const journeyRef = useRef({ lead: 0, lastAt: -1 });
  /*
    The back plate's own look (PLAN.md §16a; the why is in lib/backLook.ts).

    Two halves. How it moves is `backLookRef`, which the patch bay folds in as
    the back plate's base, so the solver for layer 1 steps with the look's
    settings and every patch still rides them. What it pours is
    `backDyesRef`: the look's dyes, pour styles and liquids, which every pour
    aimed at plate 1 reads through `harmonyOf` and its two siblings instead
    of the front's refs. Null is the back plate following the front, which is
    every show until someone presses Go to Back Plate, so nothing here changes
    a plate that never asks for it.

    While the back plate has dyes of its own a front Go is the front's: its
    handoff thins and lays plate 0 only. It thinned every plate before, which
    was right for twins and would wipe a back plate that had just been given
    a look of its own.
  */
  const backLookRef = useRef(new BackLook());
  const backDyesRef = useRef<{ id: string; contract: number[] | null; harmony: number[]; styles: string[]; liquids: string[] } | null>(null);
  const backHandoffRef = useRef<{ start: number; dur: number; last: number; poured: number; seed: Float32Array[] | null } | null>(null);
  /** The fold's per-plate bases, one array reused: [front (always its own fold), back]. */
  const platesScratchRef = useRef<(VisualizerSettings | null)[]>([null, null]);
  /** The palette plate `layer` pours from. A palette the user pinned wins on every plate. */
  const harmonyOf = (layer: number): number[] => {
    const own = layer >= 1 ? backDyesRef.current : null;
    return own ? (harmonyLockRef.current ?? own.harmony) : harmonyRef.current;
  };
  const stylesOf = (layer: number): string[] => (layer >= 1 && backDyesRef.current ? backDyesRef.current.styles : injectStyleRef.current);
  const liquidsOf = (layer: number): string[] => (layer >= 1 && backDyesRef.current ? backDyesRef.current.liquids : plateLiquidsRef.current);
  /** A layer's areas of the dish: a back plate with a look of its own takes that look's. */
  const areasOf = (layer: number): PlateArea[] | null => (layer >= 1 && backDyesRef.current ? plateAreas(backDyesRef.current.id) : areasRef.current);
  /**
   * An area's dye (areaDye): from a palette lock if there is one, else from the
   * look's whole set, turned on by the journey's and the sequencer's steps.
   * Not from the working harmony, which a hue journey narrows by one dye, so
   * two of three areas would share a colour.
   */
  const areaDyeOf = (layer: number, a: PlateArea, shift = 0): number => {
    const own = layer >= 1 ? backDyesRef.current : null;
    const lock = harmonyLockRef.current;
    if (own) return areaDye(a, lock ?? own.contract ?? own.harmony, shift);
    const lead = lock ? 0 : paletteWindowRef.current.lead + journeyRef.current.lead;
    return areaDye(a, lock ?? presetContractRef.current ?? harmonyRef.current, lead + shift);
  };
  const areaColor = (layer: number, a: PlateArea) => PALETTE_RGB[areaDyeOf(layer, a)];
  /**
   * The music's colour in an area: the Color route's cycle (colFor's), run
   * between the area's own dye and the next one, as its laid pool has them.
   * So the route still moves the colour on an area look, and a kick's ring
   * still shows as a colour against its pool, without the area taking on the
   * whole palette and becoming every other area.
   */
  const areaCycle = (layer: number, a: PlateArea, t: number) => harmonyCycle([areaDyeOf(layer, a), areaDyeOf(layer, a, 1)], t);
  /** An area look's liquids, poured into its areas: `per` doses each, where it lays its pools. */
  const layAreaLiquids = (fluid: FluidSimulation, layer: number, areas: readonly PlateArea[], per: number) => {
    for (const a of areas) for (let i = 0; i < per; i++) {
      const p = pointInArea(a, GRID_SIZE, DICE.lay, 0.8);
      doseArea(fluid, layer, a, p.x, p.y, 1.2);
    }
  };
  /** One of a hand-off's palette pours on an area look: into an area, in its dye, with its liquid. */
  const pourIntoArea = (fluid: FluidSimulation, layer: number, areas: readonly PlateArea[], styles: string[]) => {
    const area = pickArea(areas, DICE.lay);
    const at = pointInArea(area, GRID_SIZE, DICE.lay, 0.7);
    const rx = Math.floor(at.x), ry = Math.floor(at.y);
    const color = areaColor(layer, area);
    fluid.autoInject(DICE.lay.pick(styles) ?? 'drop', rx, ry, 8.0, color.r, color.g, color.b, 0.5);
    fluid.addTemp(rx, ry, 1.2);
    doseArea(fluid, layer, area, rx, ry, 0.8);
  };
  /** Pour into an area: its own liquid while the bottles are the look's, else one of the bottles picked. */
  const doseArea = (fluid: FluidSimulation, layer: number, a: PlateArea, x: number, y: number, strength: number) => {
    if (areaBottlesRef.current || (layer >= 1 && backDyesRef.current)) pourLiquid(fluid, a.liquid, x, y, strength);
    else doseLiquid(fluid, liquidsOf(layer), x, y, strength);
  };
  /**
   * The working harmony for the current contract: the sequencer's window if
   * it set one, else the hue journey's window (one dye short of the contract,
   * so the walk is visible, and at most WORKING_DYES), else the whole set.
   */
  const harmonyFromContract = (contract: number[], journeyOn: boolean): number[] => {
    const pw = paletteWindowRef.current;
    const lead = pw.lead + journeyRef.current.lead;
    if (pw.size !== null) return windowOf(contract, pw.size, lead);
    if (journeyOn && contract.length >= 3) return windowOf(contract, dyesOnPlate(contract.length, true), lead);
    return contract.length <= WORKING_DYES ? windowOf(contract, null, lead) : harmonyWithin(contract);
  };
  const bubblesRef = useRef(new BubbleField(GRID_SIZE));
  /** The last values handed to the bubble uniforms, for the harness. */
  const bubbleDebugRef = useRef({ count: 0, strength: 0, amount: 0 });
  const beadsRef = useRef(new BeadField(GRID_SIZE));
  /** The plate's tilt: a damped spring kicked by the beat, plus a slow ambient sway. */
  const rockRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, phase: 0.7, lastBass: 0 });
  /** Where the projector lamp sits under the plate (fluid uv), and the second one. */
  const lampRef = useRef({ x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 });
  /** The camera pass, built the first time a frame asks for it. */
  /** The output pass: the projector's geometry and grade. Built only if it would change a pixel. */
  /**
   * The post chain (lib/postChain.ts): built the first frame an effect is on,
   * dropped when none is, so with every effect off the plate still finishes
   * the frame itself and nothing else is allocated.
   */
  /** The harness's switches: run the chain with no effect on, and its test effect. */
  const postForceRef = useRef(false);
  const postTestRef = useRef<PostTest | null>(null);
  /**
   * The effects' clock and dice: a frame count and a seed, never the wall
   * clock or Math.random, so the same seed makes the same film twice.
   */
  const fxFrameRef = useRef(0);
  const fxSeedRef = useRef(1);
  /** The harness's hold on the effects' clock: while set, every frame is this frame. */
  const fxHoldRef = useRef<number | null>(null);
  /**
   * Three flashes a second, and no more.
   *
   * The probe reads back what actually reached the screen; the guard counts
   * the flashes in it and, only once there are too many, hands back a gain
   * that rides the master dimmer. Nothing in this app was built to strobe, but
   * any audio band can be mapped onto any setting including `dimmer`, and a
   * bass-driven master brightness at 150 bpm is a 2.5 Hz full-field flash that
   * nobody chose. See `lib/flashGuard.ts`.
   */
  const flashRef = useRef(new FlashGuard());
  /** The gain the guard asked for last frame, applied to this one's dimmer. */
  const flashGainRef = useRef(1);
  /** How the second layer is currently viewed (zoom about the centre plus drift), for brush mapping. */
  const layer1ViewRef = useRef({ zoom: 1, dx: 0, dy: 0 });
  const externalTiltRef = useRef({ x: 0, y: 0, at: -1e9 });
  const chemRef = useRef(new ChemistryField(GRID_SIZE));
  /**
   * The steady part of the room's flow, learned and subtracted. Two floats a
   * lattice cell, and the reason a camera that can see the projection screen
   * does not turn the plate into an oscillator.
   */
  const roomStirRef = useRef(new RoomStir(SCENE_LATTICE));
  /**
   * The film's own stir, with its own learned baseline.
   *
   * Not the room's instance. `RoomStir` learns the steady part of the field it
   * is given and subtracts it, and a locked-off shot and a room with a fan in
   * the corner have nothing to say to each other — sharing one would have each
   * source cancelling the other's background.
   */
  const filmStirRef = useRef(new RoomStir(SCENE_LATTICE));
  /** The reading the room's hands last acted on, so each one acts once. */
  const lastHandsAtRef = useRef(-1);
  /** The settings with the room's mappings folded in, rewritten each frame. */
  /**
   * The patch bay, and the scratch it folds into.
   *
   * One per visualizer, built once: folding makes a settings object for the
   * picture and one per plate, and allocating those sixty times a second to
   * throw them away shows up as a stutter long before it shows up as a bug.
   */
  /**
   * The LFOs and envelopes, stepped here because this is where the frame is.
   *
   * Handed out on the visualizer's handle so a note, a pad or a phone tap can
   * fire the envelopes without any of them needing to know what one is.
   */
  const modRef = useRef(new Modulators());
  const patchRef = useRef<PatchBay | null>(null);
  if (!patchRef.current) patchRef.current = new PatchBay(settings);
  const gelAngleRef = useRef(0);
  /** The mark: a still over the finished frame, uploaded once and then left alone. */
  const markRef = useRef<{ source: CanvasImageSource; aspect: number; dirty: boolean } | null>(null);

  const videoPourRef = useRef<HTMLVideoElement | null>(null);
  const videoFlowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoFlowCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const videoFlowPrevRef = useRef<Uint8ClampedArray | null>(null);

  const filmRef = useRef<{ video: HTMLVideoElement | null; kind: 'none' | 'file' | 'camera' | 'window'; stream: MediaStream | null; url: string | null }>({ video: null, kind: 'none', stream: null, url: null });
  const filmVideo = () => {
    const f = filmRef.current;
    if (!f.video) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      f.video = v;
    }
    return f.video;
  };
  const stopFilm = () => {
    const f = filmRef.current;
    // Drop the listener before stopping the tracks. `stop()` does not fire
    // `ended` by specification, but a stream taken away underneath us and one
    // we put down deliberately must not run the same callback: the second
    // would tell the panel a source had failed when it had merely been
    // switched off.
    filmEndedRef.current = null;
    if (f.stream) { f.stream.getTracks().forEach(t => t.stop()); f.stream = null; }
    if (f.url) { URL.revokeObjectURL(f.url); f.url = null; }
    if (f.video) { f.video.pause(); f.video.removeAttribute('src'); f.video.srcObject = null; }
    f.kind = 'none';
  };
  /** Told when a captured window is taken away from the browser's side. */
  const filmEndedRef = useRef<(() => void) | null>(null);
  const injectStyleRef = useRef<string[]>(['drop']);
  const plateLiquidsRef = useRef<string[]>(PRESET_LIQUIDS['classic']);   // the dish, as the contract ref is the dyes
  /**
   * The live look's areas of the dish (lib/plateAreas.ts), or null for a look
   * built the old way: where its liquids, its automation's drops and its
   * music's hands land. Set with the liquids, wherever a look takes the plate.
   */
  const areasRef = useRef<PlateArea[] | null>(null);
  /**
   * Whether the bottles poured are still the look's own. An area pours its own
   * liquid while they are; once a hand picks the plate's bottles
   * (setPlateLiquids), the areas keep their places and colours and pour what
   * was picked.
   */
  const areaBottlesRef = useRef(true);
  /** Kicks landed on an area look, so successive kicks take its bass areas in turn (areaForBand). */
  const areaKicksRef = useRef(0);
  /** Seconds of wall clock, for gestures that should not slow with the look. */
  const wanderClockRef = useRef(0);
  const rotationAnglesRef = useRef<number[]>([]);
  /*
    The plate's angular velocity, in radians a second, one per layer.
    
    Rotation used to be a speed and nothing else: the angle took
    `rotationSpeed * dt` every frame and the plate turned at exactly what the
    slider said. A plate is a thing with mass resting on something, so this
    carries the speed as *state* — a flick adds to it, the bed it rests on
    takes it away, and the slider becomes a motor the flywheel relaxes toward
    rather than a position it is teleported to.
  */
  const spinVelRef = useRef<number[]>([]);
  const lastFlickRef = useRef(0);
  /*
    The turntable (PLAN.md §22, lib/turntable.ts), one per layer, beside the
    look's own flywheel above: the dish's speed (Auto Spin and the Spin
    tool), the liquid's bulk speed following it (added to the picture's
    turn), the dish's angle (for Tempo's lock), Auto Spin's motor, and the
    hands on the Spin tool.
  */
  const dishSpinRef = useRef<number[]>([]);
  const liquidSpinRef = useRef<number[]>([]);
  const dishAngleRef = useRef<number[]>([]);
  const autoSpinRef = useRef<AutoSpin[]>([]);
  const spinHandsRef = useRef<SpinHand[]>([]);
  const spinHandOf = (layer: number): SpinHand => (spinHandsRef.current[layer] ??= new SpinHand());

  /**
   * The GL context, lost and got back.
   *
   * A projector plugged into a running laptop, a Mac switching between its
   * integrated and discrete GPU, a driver that resets under load: the browser
   * takes the context away and every texture, buffer and program with it. The
   * default behaviour is that the canvas stays black for good and only a
   * reload brings it back — which mid-set also loses the plate, the cue list
   * and the sequencer's place. So the loss is caught instead: the GPU half of
   * the solver is dropped without a readback (`dropGpu`, which exists for
   * exactly this), and because the dye field lives in the CPU arrays as well,
   * the plate survives. `glEpoch` then rebuilds every GL object against the
   * new context and the show carries on where it was.
   */
  const glLostRef = useRef(false);
  /** Why there is no GPU to draw with, for the "needs WebGPU" screen. */
  const [gpuFailure, setGpuFailure] = useState<GpuFailure | null>(null);
  // The intro over the plate (lib/intro.ts): taken into the plate's frame as
  // soon as there is one, and gone the moment there is a reason to say why
  // there will be no plate, which it would otherwise cover.
  useLayoutEffect(() => { adoptIntro(introSlotRef.current); }, []);
  useEffect(() => { if (gpuFailure) introOut('failure'); }, [gpuFailure]);
  const [glLost, setGlLost] = useState(false);
  const [glEpoch, setGlEpoch] = useState(0);
  /** The look that is on the plate, so a rebuild can put the same one back. */
  const livePresetRef = useRef('classic');
  /**
   * Asking again for a device that did not come back. After a loss the
   * adapter is often not there on the first ask — the GPU process is still
   * restarting, or the driver is mid-reset — and giving up on that first
   * answer is what left the plate black until a reload. Reset on a success.
   */
  const recoveryTriesRef = useRef(0);
  /** When the stage was last rebuilt because frames kept throwing (ms), for the three-a-minute limit. */
  const selfHealsRef = useRef<number[]>([]);
  /** Whether the loss just handled kept the plate, so the recovery does not lay the look over it (S1). */
  const plateKeptRef = useRef(false);
  /*
    A look handing over to the next (a pressed Go or Back).

    `adoptPreset` changes the palette at once but leaves the plate alone, and
    at the default evaporation the old dye's half-life is minutes — so after
    a two-second fade the settings were the new look's and the colours were
    still the old one's, with the new palette's drops landing in them: for a
    long while the wall read as neither look. Over the fade now, the old dye
    thins to a little under half and six pours of the new palette arrive
    through the second half, so the colours change hands with the settings.
  */
  const handoffRef = useRef<{ start: number; dur: number; last: number; poured: number; dosed: number; seeds: (Float32Array[] | null)[] | null; plates?: number; phase?: LookPhase } | null>(null);
  /**
   * The largest grid this GPU has shown it can hold, learned the hard way.
   * A rebuild makes a new governor, which starts at the ladder's usual rung;
   * without this it would climb straight back into the grid that ran out of
   * memory and lose the plate again, round and round.
   */
  const gridCapRef = useRef(Number.POSITIVE_INFINITY);

  // Refs for reactive data (avoids useEffect thrashing).
  const audioDataRef = useRef(audioData);
  /** The sound the app is handing over, for a render to give back to when it ends. */
  const audioDataPropRef = useRef(audioData);
  audioDataPropRef.current = audioData;
  const hearRef = useRef(hear);
  hearRef.current = hear;
  /*
    The sound the live show hears now: the app's ear asked directly, else the
    prop. It used to be the prop alone, copied into `audioDataRef` by an
    effect after each render, so the plate heard every reading one frame late
    (the frame that made it had already drawn by the time the render that
    carried it committed), and the whole App re-rendered once per reading to
    deliver it. Asked at the top of the frame, it is this frame's reading.
  */
  const liveHeard = () => (hearRef.current ? hearRef.current() : audioDataPropRef.current);
  /**
   * The live frames, and how many of them heard a reading the frame before
   * had not, for `npm run renders`: with the ear reading once a frame, nearly
   * every frame should. A plate stepping on ten readings a second (the ear's
   * React state) would hear a new one on about one frame in six.
   */
  const hearingRef = useRef({ frames: 0, fresh: 0, ownFrame: 0, last: null as AudioData | null });
  /** The animation frame the plate is drawing (its timestamp), null for a frame the wall asked for. */
  const plateTsRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  const selectedLiquidRef = useRef(selectedLiquid);
  const activeLayerRef = useRef(activeLayer);
  const activeToolRef = useRef(activeTool);
  const onAimRef = useRef(onAim);
  onAimRef.current = onAim;
  const onPinchZoomRef = useRef(onPinchZoom);
  onPinchZoomRef.current = onPinchZoom;
  const toolAmountRef = useRef(toolAmount);
  toolAmountRef.current = Math.max(0.1, Math.min(3, Number.isFinite(toolAmount) ? toolAmount : 1));
  /** An Alt-drag on the closeup camera: where it started, and the aim it moves. */
  const aimDragRef = useRef<{ x0: number; y0: number; moved: number; aimX: number; aimY: number; sent: number } | null>(null);
  /** What the plate's pointer saw of Alt, for the harness (chromaglassDebug().aimProbe). */
  const aimProbeRef = useRef({ downs: 0, altDowns: 0, aims: 0, zoom: 0, hasAim: false });
  const isAutomatedRef = useRef(isAutomated);
  const isActiveRef = useRef(isActive);
  /*
    `ambientSeed(false)`: the three Lissajous orbits stop laying their dye
    (the "Ambient seeding" block below). They lay 0.05 a frame each, every
    frame on every look, wherever they are, so a cleared plate gathers
    their trails a quarter to a third of the plate out from its middle. A
    check that reads where a hand's colour went reads those trails too: on
    the Mac the tools check's pool, settled 1.5, 8 or 12 of the plate's
    seconds, drifted out from the palm at the same 0.004 of the plate a
    second whatever its age (a spreading drop slows as it ages; a source
    that never stops does not), and the plate's colour grew 6% in three
    seconds with nothing touching it. Only a harness turns it off;
    a ref, so a rebuild of the frame loop (a self-heal, a lost device) keeps it.
  */
  const ambientSeedRef = useRef(true);
  const isMouseDownRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Where the finger and the streak last acted, consumed each step.
   *
   * They took their direction from the pointer's move between the last two
   * mouse events, and the plate steps several times a frame with no event
   * while the pointer is still: so the last move was applied again every
   * step for as long as the button was held, and a finger that had stopped
   * went on pushing the liquid. This is the move since the tool last acted.
   */
  const strokeLastRef = useRef<{ x: number; y: number } | null>(null);
  // The pointer's Blow's last way of travel (BlowDir), kept like its stroke.
  const blowDirRef = useRef<BlowDir | undefined>(undefined);
  /**
   * The pointer's Blow steps, straw and wind, and the colour the wind carried: read by `npm run tools`.
   * `directed` counts the wind steps that had a way to go (a move within BLOW_DIR_HOLD_MS) and
   * `carries` the ones whose carry ran (a fresh dye reading), so a stroke that pushed little says
   * whether the wind lost its direction or waited on readings.
   */
  const blowStepsRef = useRef({ straw: 0, wind: 0, carried: 0, strawFirst: 0, directed: 0, carries: 0, aired: 0 });
  /**
   * Every finger on the glass after the first (the phone).
   *
   * The first finger is the pointer, as it always was: `mousePosRef`, the
   * button, the stroke and the drop clock above, the magnet, the performance
   * recorder. Before this a second finger did nothing and moving it moved
   * nothing; now each one is a hand of its own, with its own place, its own
   * stroke (so a finger dragged left and one dragged right each streak their
   * own way) and its own drop clock (so each lays its first drop as it lands).
   * Keyed by the touch's identifier; emptied when the fingers leave.
   */
  const extraHandsRef = useRef(new Map<number, { x: number; y: number; stroke: { x: number; y: number } | null; clock: number; laid: DropLaid; magnetAt?: number; blowDir?: BlowDir }>());
  /** Which touch is the pointer, while one is. */
  const primaryTouchRef = useRef<number | null>(null);
  /**
   * Two fingers on the closeup, moving the camera: where they started, and
   * the zoom and aim they started from. Held until every finger is up, so
   * lifting one of the pair does not turn the other into a brush mid-pinch.
   */
  const pinchRef = useRef<{
    d0: number; mx0: number; my0: number; zoom0: number; aimX: number; aimY: number; sent: number;
    /** The latest span, sent on lift if the frame's throttle held it back. */
    last: { d: number; mx: number; my: number } | null;
    /** Whether the pair has moved together far enough to be a pan, not only a pinch. */
    panned: boolean;
  } | null>(null);
  const simulationTimeRef = useRef(0);
  const lastTimeRef = useRef(showEpochS());
  const lastBass01Ref = useRef(0); // for beat edge detection
  /** The beat clock: kicks from the tempo, ahead of the microphone, once it has locked. */
  const beatClockRef = useRef(new BeatClock());
  /** The music's pace on the plate's clock (lib/tempoPace.ts), slewed, and the loudness it is taken from. */
  const tempoMulRef = useRef(1);
  /** When the reactions were last seeded (see the reactions' note in the loop). */
  const bzSeedAtRef = useRef(0);
  /** When the last Soap Burst landed. */
  const soapAtRef = useRef(0);
  const liesSeedAtRef = useRef(0);
  const loudnessRef = useRef(0);
  const kickRef = useRef<{ kick: boolean; predicted: boolean }>({ kick: false, predicted: false });
  /** Every kick since the plate started, for a show that acts on every Nth one. */
  const kickCountRef = useRef(0);
  /**
   * Every kick onset the ear handed the clock, once each (`npm run kicks`,
   * and the Mac's checks, compare it with the kicks the clock fired and the
   * kicks the band played).
   */
  const heardKicksRef = useRef({ n: 0, lastAt: null as number | null });
  /**
   * What the music did with its chances to release air, for
   * `chromaglassDebug().musicBubbles()` (`npm run kickbubbles`): the kicks
   * that reached the decision with room on the plate, the ones that released
   * air, the releases on a held bass note, and the Audio Impact, drive and
   * Bubbles the frame itself last used (the plate's settings, which a song's
   * chorus can lift above the App's).
   */
  const musicBubblesRef = useRef({ chances: 0, kicks: 0, held: 0, impact: NaN, drive: NaN, amount: NaN });
  /*
    Sound learn, read by the loop through refs like every other live prop: the
    bindings change when the map does, the trigger handler on every render of
    the app, and neither is a reason to rebuild the loop.
  */
  const soundLearnRef = useRef(new SoundLearn());
  /*
    The song's shape, heard live (lib/songShape.ts). Fed every frame, whether
    or not anything is bound to it, so the section is known the moment a
    sequence or a binding asks. Its events go to sound learn's triggers on the
    frame they are heard, and are kept, numbered, for the app to poll.
  */
  const songShapeRef = useRef(new SongShape());
  const songEventsRef = useRef<(SongEvent & { seq: number })[]>([]);
  const songSeqRef = useRef(0);
  const songClockRef = useRef(0);
  /*
    The bar (lib/barGrid.ts): where the beats fall and which of them is the
    one, heard from the same readings on the same clock as the song's shape,
    so Accent the One can weigh each kick's press by its place in the bar.
  */
  const barGridRef = useRef(new BarGrid());
  const accentRef = useRef(new Accent());
  const soundBindingsRef = useRef(soundBindings);
  soundBindingsRef.current = soundBindings;
  const onSoundTriggerRef = useRef(onSoundTrigger);
  onSoundTriggerRef.current = onSoundTrigger;
  /**
   * The plate's phrasing: what it should be doing this second.
   *
   * Stepped once a frame and read by the automation and by every solver, so
   * both plates surge together rather than each breathing to its own weather.
   */
  const phrasingRef = useRef(new Phrasing());
  const phraseRef = useRef<Phrase>({ drive: 1, gust: 0, drift: 0.5 });
  /** When the last flood pour landed, so gusts cannot stack into a wash. */
  const lastFloodRef = useRef(-1e9);
  /**
   * A flood: a wide, soft pour across a good share of the lead plate in one of
   * the working dyes, pushing the plate out of the way as it lands. `gust`
   * (0..1) is its size and force.
   *
   * Written once for two callers. It was the peak of an evolve gust (off now,
   * `EVOLVE_FLOODS`), and it is the moment a paced scene opens most swells
   * with (`lib/scenePacing.ts`), which is where a pour this big belongs: once
   * or twice a scene, with the light coming up on it, rather than whenever a
   * gust peaked.
   */
  const floodPour = (gust: number, energy: number, bubbles: number, dice: Rng, colourDice?: Rng) => {
    const af = fluidsRef.current[0];
    if (!af) return;
    // Evolve's flood leaves the colour to the palette's stream, as it always
    // did; a paced pour hands its own, so it cannot move the draws the
    // automation's palette picks read.
    const color = harmonyColor(harmonyRef.current, colourDice);
    const cx = GRID_SIZE * (0.25 + dice.float() * 0.5);
    const cy = GRID_SIZE * (0.25 + dice.float() * 0.5);
    // A third of the plate across, falling off to nothing, so it
    // is a pour arriving rather than a rectangle being filled.
    const R = GRID_SIZE * (0.18 + 0.16 * gust);
    const strength = (28 + energy * 40) * (0.5 + gust);
    for (let j = Math.max(1, Math.floor(cy - R)); j < Math.min(GRID_SIZE - 1, cy + R); j++) {
      for (let i = Math.max(1, Math.floor(cx - R)); i < Math.min(GRID_SIZE - 1, cx + R); i++) {
        const d = Math.hypot(i - cx, j - cy) / R;
        if (d >= 1) continue;
        const fall = (1 - d) * (1 - d);
        af.addDensity(i, j, strength * fall * 0.06, color.r, color.g, color.b);
      }
    }
    // And it lands: a pour pushes the plate out of the way.
    af.blowAir(Math.floor(cx), Math.floor(cy), Math.floor(R * 0.45), 0.22 + energy * 0.25, true);
    if (bubbles > 0) {
      bubblesRef.current.disturb(Math.floor(cx), Math.floor(cy), R * 0.6, 'dye', 1);
    }
  };
  /** The frame's Bubbles, patches and modulators folded in, for a pour that lands between frames. */
  const frameBubblesRef = useRef(0);
  /*
    The scene a running sequence is playing (`lib/scenePacing.ts`): where the
    sequencer says it should be, and where the plate has got to on its way
    there, stepped a frame at a time by `approachPace`. The activity scales the
    plate's clock (after the phrase's 2.5 s lean, not through it: see
    `paceMul`) and how often the automation acts; the dim scales the light, on
    top of the dimmer and the flash guard. Both 1 unless a sequence is pacing.
  */
  const paceTargetRef = useRef<PaceSample>({ ...PACE_NEUTRAL });
  const paceNowRef = useRef<PaceSample>({ ...PACE_NEUTRAL });
  const lastThinRef = useRef(-1e9);
  /*
    What the automation has actually done, for `npm run evolving`.

    Counting rather than inferring: a harness can watch the plate change and
    still not know *which* of the automation's hands changed it, and this
    repository has spent a day on checks that could not tell one cause from
    another. Two integers make the difference between "the plate moved" and
    "evolving thinned it twice and drew a finger through it once".
  */
  const autoEventsRef = useRef({ thinned: 0, stroked: 0, poured: 0 });
  /*
    A finger the automation is drawing, over frames rather than in one.

    A gesture applied in a single frame is a stamp; the finger only reads as a
    hand because it keeps moving, which is also the only reason it moves
    liquid at all (bubbles-plan.md §H: a drag leaves a shear, a push leaves a
    gradient the projection removes). So a stroke is a small piece of state
    that advances a step a frame and then stops.
  */
  const autoStrokeRef = useRef<{ x: number; y: number; dx: number; dy: number; left: number } | null>(null);
  const camBassRef = useRef(0);     // the camera's own onset memory, per frame
  const onManualGestureRef = useRef(onManualGesture);
  const gestureFrameRef = useRef(0); // throttles gesture recording to ~15 Hz
  const beadFrameRef = useRef(0);    // the beads' own frame clock (see the populate call)
  const dropClockRef = useRef(0);    // solver steps since the dropper was pressed (Drop Height lets go of drops on it)
  const dropLaidRef = useRef<DropLaid>(freshLaid());  // what the pointer's Drop has laid since it was pressed (DropLaid)
  const macroCamRef = useRef(new MacroCamera());
  const macroShotRef = useRef<MacroShot>({ cx: 0.5, cy: 0.5, zoom: 1, whip: 0 });
  const filmHistRef = useRef(new Uint32Array(FILM_BINS));
  const simAccumRef = useRef(0);
  /** Milliseconds the last frame spent in the solver: the catch-up cap adapts to it. */
  const simMsRef = useRef(0);
  /** Solver steps a second, smoothed — 60 when the show is keeping wall-clock time. */
  const stepsPerSecRef = useRef(60);
  /**
   * Frames the loop has been through, live or rendered: how `npm run render-app`
   * tells that the live loop is drawing again once a render hands the plate back.
   */
  const framesDrawnRef = useRef(0);
  /** What the catch-up rule allowed last frame, for the debug readout. */
  const catchUpRef = useRef(4);
  const onEngineStatusRef = useRef(onEngineStatus);
  const onBackLookClearedRef = useRef(onBackLookCleared);
  onBackLookClearedRef.current = onBackLookCleared;
  const outputCfgRef = useRef(output);
  outputCfgRef.current = output;
  const gpuSupportedRef = useRef<boolean | null>(null);   // null = not probed yet
  const engineStatusRef = useRef<EngineStatus | null>(null);
  const engineStatusAtRef = useRef(0);
  const governorRef = useRef<QualityGovernor | null>(null);
  const dprRef = useRef(1);
  /** The mirrored display's pixel size, when one is attached. */
  const stageRef = useRef<{ width: number; height: number } | null>(null);
  /** The desk's preview hole, for the handlers that run outside the render. */
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const resizeRef = useRef<() => void>(() => {});
  /** Build the governor's ladder again for the stage now attached, or none (PLAN.md §14c). */
  const reladderRef = useRef<() => void>(() => {});
  const [staged, setStaged] = useState(false);
  /**
   * A song render in progress: its rate, the steps a second it holds the
   * solver to, the frame it is on, the film's size and grid. Null live, and
   * every branch that reads it leaves the live show exactly as it was.
   */
  const renderingRef = useRef<{
    fps: number; stepRate: number; frame: number; width: number; height: number; grid: number;
    /** Whether the checks asked for a digest of every frame (see `FrameDigest`), and the last frame's. */
    digestOn: boolean; digest: FrameDigest | null;
  } | null>(null);
  const renderApiRef = useRef<VisualizerRender | null>(null);
  const lastMacroOnRef = useRef(false);
  const filmLevelRef = useRef(0.3);
  const filmGainRef = useRef(4.5);

  const drawnRectRef = useRef<(() => DOMRect) | null>(null);
  /**
   * A gesture from any hand, applied to the plate.
   *
   * The mouse, the pen, the phone pad, the gamepad, OSC, a replayed
   * performance and — since the room camera — a person standing in front of
   * the lens all arrive here. Keeping it one function is what lets a new kind
   * of hand be added without teaching it about bubbles, beads or the squeeze
   * film all over again.
   */
  const performGesture = (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; clear?: boolean; layer?: number; amount?: number; id?: number }) => {
    // The magnet moves no fluid itself: it is held where the gesture is, and
    // the next solver step pulls the ferrofluid toward it. Ahead of the drain
    // gate, since holding it over an emptying plate is harmless.
    switch (g.tool) {
      case 'magnet':
        magnetHandRef.current = { x: Math.max(0, Math.min(1, g.x)), y: Math.max(0, Math.min(1, g.y)), at: showNow() };
        return;
      /*
        A hand on the dish from anywhere but this screen's pointer: the
        remote's pad, a pen, OSC. Its point is the plate as the audience sees
        it (normalised, y up), so its angle round the middle is the hand's
        own. It moves no liquid: the dish turns under it (the frame's
        flywheel reads the hand), and a hand not heard from for a quarter of
        a second has let go (forgetQuiet there), since a pad's lift is not
        sent. Ahead of the drain gate, as the magnet is: a dish can be
        turned while it empties.
      */
      case 'spin': {
        const layer = Math.max(0, Math.floor(g.layer ?? activeLayerRef.current));
        // Each finger its own hand: two on one pad, or two remotes on one
        // plate, sharing one would read the jump between them as a whirl.
        const id = `gesture:${Number.isFinite(g.id) ? g.id : 0}`;
        if (Number.isFinite(g.x) && Number.isFinite(g.y)) spinHandOf(layer).move(id, g.x - 0.5, g.y - 0.5, showNow());
        return;
      }
    }
    const layer = g.layer ?? activeLayerRef.current;
    const af = fluidsRef.current[layer];
    if (!af || drainFrameRef.current > 0) return;
    const S = GRID_SIZE;
    const kToolRaw = toolAmountRef.current;
    const kTool = kToolRaw * kToolRaw;
    const kSoftTool = Math.sqrt(kTool);
    if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0) {
      const airy = g.tool === 'blow' || g.tool === 'press';
      bubblesRef.current.disturb(g.x * GRID_SIZE, g.y * GRID_SIZE, (airy ? 5 : 3) * kSoftTool * GRID_SCALE, airy ? 'air' : 'dye', kSoftTool);
    }
    const x = Math.max(1, Math.min(S - 2, Math.round(g.x * S)));
    const y = Math.max(1, Math.min(S - 2, Math.round(g.y * S)));
    /*
      A colour the gesture carries is the colour that was laid, the bottle's
      own through its dye (laidColour, lib/liquidColour.ts: a take records
      it, the phone's and the remote's Drop send it), so it lands as it
      comes; `clear` is a clear liquid that laid none. With neither it is
      the harmony's.
    */
    const poured = { dose: g.clear ? 0 : 1 };
    const rgb = g.color ? hexToRgb(g.color) : harmonyColor(harmonyOf(layer));
    const dyeOf = (liq: LiquidType | undefined) => bottleDye(liq) * poured.dose;
    // 0.5 is the mouse; a pen pressed hard or a trigger pulled all the way is 1.
    // And the amount set for this tool, on top of how hard this hand pressed.
    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;
    if (LAYING_TOOLS.has(g.tool) && (selectedLiquidRef.current?.behaviour?.magnetic ?? 0) > 0) handPoursFerro(af);

    switch (g.tool) {
      case 'blow':
        // The wind moves the colour and the oil, as the mouse's does
        // (blowWind's carries, PLAN.md §15c; a remote's wind is not yet
        // air on the film, 15g-5); a directed one erased 15% a step at
        // its middle, a puff 20% everywhere under it.
        if (g.dx !== undefined && g.dy !== undefined && (g.dx !== 0 || g.dy !== 0)) {
          af.blowWind(x, y, remoteBlowRadius(amt, true), BLOW_STRENGTH * amt, g.dx, g.dy, false);
          af.blowPhase(x, y, remoteBlowRadius(amt, true), BLOW_STRENGTH * amt, g.dx, g.dy);
        } else {
          af.blowWind(x, y, remoteBlowRadius(amt, false), BLOW_STRENGTH * amt, 0, 0);
          af.blowPhase(x, y, remoteBlowRadius(amt, false), BLOW_STRENGTH * amt, 0, 0);
        }
        if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0 && DICE.hands.float() < 0.15 * amt) {
          bubblesRef.current.spawn(x, y, 1.2 * GRID_SCALE, 2, 3 * GRID_SCALE);
        }
        break;
      case 'drop': {
        const liq = selectedLiquidRef.current;
        if (liq?.behaviour) af.liquid.deposit(x, y, Math.max(2, (liq.injectRadius ?? 3) * GRID_SCALE), liq.behaviour, amt);
        af.autoInject('drop', x, y, 5 * amt * bottleDye(liq), rgb.r, rgb.g, rgb.b, 0.5 * amt, false, poured.dose);
        af.addTemp(x, y, 0.6 * amt);
        break;
      }
      case 'streak': {
        // Directional smear along the recorded movement
        const dx = g.dx ?? 1, dy = g.dy ?? 0;
        const len = 8 * GRID_SCALE;
        const liq = selectedLiquidRef.current;
        const tint = dyeOf(liq);
        for (let t = -len; t <= len; t += 0.8) {
          const sx = Math.floor(x + dx * t), sy = Math.floor(y + dy * t);
          if (sx < 1 || sx >= S - 1 || sy < 1 || sy >= S - 1) continue;
          const w = 1.0 - Math.abs(t) / len;
          af.addDensity(sx, sy, 0.6 * w * tint, rgb.r, rgb.g, rgb.b);
          af.addVelocity(sx, sy, dx * 0.3 * w, dy * 0.3 * w);
        }
        layBottle(af, x, y, 2 * GRID_SCALE, liq, kTool);
        break;
      }
      case 'press': {
        // Pressed harder, the film thins over a wider palm.
        const a = 0.002 + 0.004 * amt;
        const fg = settingsRef.current.fingering ?? 0;
        af.applySquish(x, y, 20 + 12 * amt, a, fg, true);
        af.applySquish(x, y, 12 + 6 * amt, a, fg);
        af.applySquish(x, y, 6, a, fg);
        af.squeezeOut(x, y, (20 + 12 * amt) * GRID_SCALE, a);
        if (layer === 0) beadsRef.current.disturb(x, y, (10 + 6 * amt) * GRID_SCALE, 0.2);
        break;
      }
      case 'finger': {
        /*
          A finger from any hand but the mouse.

          It was only ever wired to the local pointer, so a finger arriving
          from the phone pad, a pen, the gamepad, OSC, a replayed performance
          or the room camera fell through to `default` and *dropped dye* —
          the opposite of mixing, and it added colour to a plate the performer
          was trying to blend. The direction is the gesture's own, the same
          one a directed blow uses; with no direction there is no drag, which
          is right, because you mix by moving.
        */
        if (g.dx !== undefined && g.dy !== undefined && (g.dx !== 0 || g.dy !== 0)) {
          af.fingerDrag(x, y, 7, 0.09 * amt * 0.5, g.dx, g.dy, true, { x: g.dx * S, y: g.dy * S });
          if (layer === 0) beadsRef.current.disturb(x, y, 10 * GRID_SCALE, 0.25);
        }
        break;
      }
      /*
        The laying tools from any other hand lay the bottle as the mouse's
        do (layBottle): a replayed take records the tool the hand held
        ('dropper', 'pour', ...), not 'drop', and every one of these fell
        through to colour alone, so a take played back with Oil or
        Ferrofluid in the bottle laid dye where the take had laid liquid.
        The bottle is the one picked now, which is what 'drop' has always
        read too: a take does not record which bottle it poured. So its dye
        follows the bottle as well (bottleDye): a take recorded with Water
        and played back with Ferrofluid picked lays the ferrofluid's whisper
        of dye, not the take's colour at full.
      */
      case 'spray': {
        const liq = selectedLiquidRef.current;
        const tint = dyeOf(liq);
        af.autoInject('spray', x, y, 5 * kTool * tint, rgb.r, rgb.g, rgb.b, 0.5);
        layBottle(af, x, y, 6 * GRID_SCALE, liq, kTool * 0.5);
        break;
      }
      case 'splatter': {
        const liq = selectedLiquidRef.current;
        af.autoInject('splatter', x, y, 4 * kTool * dyeOf(liq), rgb.r, rgb.g, rgb.b, 0.5);
        layBottle(af, x, y, 3 * GRID_SCALE, liq, kTool);
        break;
      }
      case 'pour': {
        const liq = selectedLiquidRef.current;
        af.autoInject('pour', x, y, 4 * kTool * dyeOf(liq), rgb.r, rgb.g, rgb.b, 0.5, true);
        layBottle(af, x, y, 4 * GRID_SCALE, liq, kTool);
        break;
      }
      default: { // dropper
        const liq = selectedLiquidRef.current;
        af.autoInject('drop', x, y, 4 * kTool * bottleDye(liq), rgb.r, rgb.g, rgb.b, 0.5, false, poured.dose);
        layBottle(af, x, y, Math.max(2, (liq?.injectRadius ?? 3) * GRID_SCALE), liq, kTool);
      }
    }
  };

  /**
   * Clear the plate and lay a preset's look on it: its dye, its liquids, its
   * palette.
   *
   * Pulled out of `applyPreset` because a lost GL context needs exactly this
   * and nothing else. The registration of a user preset's dyes belongs to
   * `applyPreset` (it is what the caller is telling us); laying the plate is
   * the part that has to be repeatable from inside.
   */
  /*
    The second plate, laid the way the look lays it.

    A look that brings a second layer usually arrives with it: the settings
    that add the layer and the call that lays the plate come in the same breath,
    and the layer is only built once React has taken the new count, a moment
    after the plate was laid. Laid only when it already existed, the second
    plate came out empty whenever the look before had one layer, and stayed
    empty: the music pours into the lead plate. Fillmore after Lumia had one
    dish and an empty ring, Fillmore after Classic had two. So the layer is laid
    here and again the moment it is built.
  */
  /** The opening look was laid before the GPU solver existed and still owes it its phase. */
  const phasePendingRef = useRef(false);
  /**
   * The magnet, when a hand has it: where on the plate (0–1) and when it was
   * last there. The Magnet tool, the phone pad and a replay all set it; the
   * solver steps read it, and keep the magnet there after the hand lets go.
   */
  const magnetHandRef = useRef<{ x: number; y: number; at: number } | null>(null);
  /** Where the lead plate's look put its magnet last frame, to see it moved (see magnetFor). */
  const magnetLookRef = useRef<{ x: number; y: number } | null>(null);
  /** The magnet's own slow walk when nobody is holding it: where along its path. */
  const magnetWalkRef = useRef(0);
  const magnetWalkAtRef = useRef(0);
  /** The settings handed to the lead plate's step, with the magnet where it is now. */
  const magnetStepRef = useRef<Record<string, unknown>>({});
  /** What the lead plate's magnet was last given, for the harness: where, how strong, and whether a hand held it. */
  const lastMagnetRef = useRef<{ x: number; y: number; strength: number; height: number; radius: number; held: boolean; field: number } | null>(null);
  /** The maze field's kick envelope: 1 on a kick, falling over about a second (see magnetFor). */
  const mazeKickRef = useRef({ env: 0, at: 0 });
  /** The lead solver the phase was last laid on, so a rebuilt one gets it too. */
  const phaseSolverRef = useRef<unknown>(null);
  /** Last frame's ferrofluid amount, to catch it being turned up mid-show. */
  const phaseAmountRef = useRef(0);
  const laidPresetRef = useRef<string | null>(null);
  const laySecondPlate = (fluid: FluidSimulation, presetId: string) => {
    // The Fillmore look is two projectors: the second plate starts with its own wash.
    if (presetId === 'fillmore-1969') fluid.seedPreset('fillmore-wash', noise2D);
  };

  const layPlate = (presetId: string, layBack = false, phase?: LookPhase) => {
    /*
      The plate's dice start again, from (seed, stream, this look), before
      anything below draws, so the numbers this look is laid with do not
      depend on how many were drawn before it. That is the dice, not the
      whole glass: the bead carpet survives a look change (only the beads
      dial at 0 clears it) and the phrasing, modulators and closeup camera
      keep their state, as they did before seeding. What it does buy: a
      render from a cue in the middle of a set, or the gallery shooting
      presets in any order, draws the same numbers for the same look. Why
      this and not one sequence running all night: lib/rng.ts, "Restarting,
      rather than continuing". Only `plate.` streams: Lucky and
      the wander are a person's and the set's, not the look's.
    */
    restartStreams(`look:${presetId}`, 'plate.');
    laidPresetRef.current = presetId;
    /*
      A back plate with a look of its own (§16a) is not the front's to lay: a
      cut on the front (the preset strip, a MIDI preset step, a user look)
      leaves it, its angle and its spin exactly as they were, as a Go on the
      front does. Only a plate that has to be laid again whatever it held
      (the device lost with nothing carried across, `layBack`) lays it too,
      from its own look.
    */
    const keepBack = !!backDyesRef.current && !layBack;
    const laid = keepBack ? fluidsRef.current.slice(0, 1) : fluidsRef.current;
    for (const fluid of laid) fluid.clearAll();
    bubblesRef.current.clear();
    fluidsRef.current[0]?.gpu?.clearChemistry?.();
    rotationAnglesRef.current = rotationAnglesRef.current.map((a, i) => (i < laid.length ? DICE.lay.angle() : a));
    spinVelRef.current = spinVelRef.current.map((v, i) => (i < laid.length ? 0 : v));
    // The turntable likewise: a kept back plate keeps its dish turning.
    dishSpinRef.current = dishSpinRef.current.map((v, i) => (i < laid.length ? 0 : v));
    liquidSpinRef.current = liquidSpinRef.current.map((v, i) => (i < laid.length ? 0 : v));
    autoSpinRef.current.forEach((a, i) => { if (i < laid.length) a?.release(); });
    presetContractRef.current = PRESET_CONTRACTS[presetId] ?? null;
    journeyRef.current = { lead: 0, lastAt: -1 };
    const fluid = fluidsRef.current[0];
    if (fluid) {
      const seeded = fluid.seedPreset(presetId, noise2D);
      const contract = presetContractRef.current;
      harmonyRef.current = harmonyLockRef.current ?? (contract && paletteWindowRef.current.size !== null ? harmonyFromContract(contract, false) : seeded);
    }
    /*
      The second phase, laid with the dye rather than waited for (H7).

      A few domains rather than one: the shapes this is for — labyrinths,
      chains, a lattice — need more than one body to be shapes at all, and a
      single blob under a magnet is just a blob. How many, and how big, comes
      from `phaseScale`: beads at one end, hands at the other.
    */
    {
      /*
        A look that says nothing about ferrofluid leaves it alone.

        This cleared the field first and poured afterwards, so laying *any*
        look — and every shipped look asks for none — binned whatever was on
        the plate. For an instrument that is the wrong instinct: a thing
        somebody poured by hand should not disappear because the look changed
        underneath it. It also made the field unmeasurable, because a harness
        pouring by hand was racing a seed that wiped it, which read as a
        physics fault and was not one.

        So the phase is only touched when a look actually asks for some.
      */
      // A look laid before the GPU solver exists (the opening look, laid on
      // mount) owes its phase to the solver when it attaches: laid here it
      // went nowhere, and Magnet Garden opened as a bare gold pool.
      /*
        By the amount this look asks for (`phase`, from the app), not the
        one in the settings: the app calls this before its new settings
        have reached the plate, so the settings still held the last look's
        amount, or the 0.6 that picking the Ferrofluid bottle used to set.
        Laid by that, a look with no ferrofluid in it cleared what the hand
        had poured and laid its own ring in its place: a big black chunk
        from pressing Go (the owner's "deposits a huge chunk", 2026-10-04).
      */
      const asked = phase?.phaseAmount ?? settingsRef.current.phaseAmount ?? 0;
      phasePendingRef.current = asked > 0.002 && !fluidsRef.current[0]?.gpu?.addPhase;
      layPhaseRef.current(presetId, asked, phase?.phaseScale);
    }
    for (const later of laid.slice(1)) {
      // Laid again with a look of its own: from that look, and its handover,
      // if one was running, is over (the plate it was rising into is gone).
      const own = backDyesRef.current;
      if (own) {
        backHandoffRef.current = null;
        const seeded = later.seedPreset(own.id, noise2D);
        if (!own.contract && seeded.length > 0) own.harmony = seeded;
        const ownAreas = plateAreas(own.id);
        if (ownAreas) layAreaLiquids(later, 1, ownAreas, 6);
        else for (let i = 0; i < 15; i++) doseLiquid(later, own.liquids, 10 + DICE.lay.float() * (GRID_SIZE - 20), 10 + DICE.lay.float() * (GRID_SIZE - 20), 1.2);
      } else laySecondPlate(later, presetId);
    }
    injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
    plateLiquidsRef.current = PRESET_LIQUIDS[presetId] ?? [];
    areasRef.current = plateAreas(presetId);
    areaBottlesRef.current = true;
    areaKicksRef.current = 0;
    // The plate is laid with its liquids as well as its dye, rather than
    // waiting a minute for the automation to dose its way there. Because
    // `doseLiquid` picks uniformly from the list, the inert entries thin
    // this out on their own: a plate of `['water', 'water', 'soap']` gets
    // about five spots of soap, one of `['soap', 'silicone']` gets fifteen.
    // A look built on areas pours each area's liquid into it instead, six
    // doses apiece, under the pool its seed laid there: the liquid is what
    // makes that part of the plate behave unlike the rest.
    const areas = areasRef.current;
    if (fluid && areas) layAreaLiquids(fluid, 0, areas, 6);
    else if (fluid) for (let i = 0; i < 15; i++) {
      doseLiquid(fluid, plateLiquidsRef.current,
        10 + DICE.lay.float() * (GRID_SIZE - 20), 10 + DICE.lay.float() * (GRID_SIZE - 20), 1.2);
    }
    drainFrameRef.current = 0;
    macroCamRef.current.reset();
    livePresetRef.current = presetId;
  };
  /**
   * The second phase for the look being laid, if it asks for some and the GPU
   * solver is there to take it. Poured in the look's own shape (phasePour):
   * the id is passed while a look is being laid, because livePresetRef only
   * becomes that look at the end of layPlate.
   */
  const layPhase = (presetId: string = livePresetRef.current, amt: number = settingsRef.current.phaseAmount ?? 0, scale: number = settingsRef.current.phaseScale ?? 0.4) => {
    const lead = fluidsRef.current[0]?.gpu;
    if (amt > 0.002 && lead?.addPhase) {
      phaseLaysRef.current++;
      phaseByHandRef.current = false;
      lead.clearPhase?.();
      for (const d of phasePour(phasePourShape(presetId), scale)) lead.addPhase(d.x, d.y, d.r, d.amount);
    }
  };
  const layPhaseRef = useRef(layPhase);
  /**
   * Whether the ferrofluid on the lead plate was last put there by a hand (the
   * bottle) rather than laid as the look's (layPhase). A new solver lays the
   * look's again only over the look's own: over a hand's pour it would put the
   * ring where the hand never poured (PLAN 15i). Carrying the pour across is 9w.
   */
  const phaseByHandRef = useRef(false);
  /** How many times the ferrofluid has been laid afresh (layPhase), for the harness: a lay clears what was there. */
  const phaseLaysRef = useRef(0);
  layPhaseRef.current = layPhase;
  /** Through a ref, because the context-loss listener is installed once, above this. */
  const layPlateRef = useRef(layPlate);
  layPlateRef.current = layPlate;

  useImperativeHandle(ref, () => ({
    render: () => renderApiRef.current,
    drawnRect: () => drawnRectRef.current?.() ?? null,
    /*
      Numbers, not a photograph.

      `npm run shelf`'s sibling instrument reads this several times a second,
      and a readback of the plate at that rate would cost more than the show
      it is supposed to accompany. The solver already keeps a mean and a mean
      colour; the only new work is sampling the density it has already read
      back at a few fixed places, so four voices can be lit by four different
      parts of the glass instead of all by the same average.
    */
    plateReading: (voices: number) => {
      const fluid = fluidsRef.current[0];
      if (!fluid) return null;
      const d = fluid.readDensity;
      if (!d || !d.length) return null;
      const cells: number[] = [];
      const n = Math.max(1, voices);
      for (let i = 0; i < n; i++) {
        // A ring inside the dish, turning slowly, so the voices are lit by
        // different weather rather than by one spot that may never get wet.
        const a = (i / n) * Math.PI * 2 + showNow() * 0.00002;
        const rr = 0.28 * GRID_SIZE;
        const x = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr);
        const y = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
        const idx = Math.max(0, Math.min(d.length - 1, x + y * GRID_SIZE));
        cells.push(Number.isFinite(d[idx]) ? d[idx] : 0);
      }
      /*
        And how the plate is moving: its mean speed and its mean turn, from
        the flow already read back, every eighth cell each way. The
        instrument's pulse and its air follow these, so a stirred plate
        sounds busier than a still one.
      */
      const vx = fluid.readVx, vy = fluid.readVy;
      let speed = 0, curl = 0, m = 0;
      if (vx?.length && vy?.length) {
        for (let j = 8; j < GRID_SIZE - 8; j += 8) {
          for (let i = 8; i < GRID_SIZE - 8; i += 8) {
            const k = i + j * GRID_SIZE;
            const u = vx[k], v = vy[k];
            if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
            speed += Math.hypot(u, v);
            // Turn about the middle: r × v, normalised by r.
            const rx = i - GRID_SIZE / 2, ry = j - GRID_SIZE / 2;
            curl += (rx * v - ry * u) / Math.max(1, Math.hypot(rx, ry));
            m++;
          }
        }
      }
      const c = fluid.meanColor;
      return {
        wetness: Number.isFinite(fluid.meanDensity) ? fluid.meanDensity : 0,
        colour: [c?.[0] ?? 0, c?.[1] ?? 0, c?.[2] ?? 0] as [number, number, number],
        cells,
        flow: m ? speed / m : 0,
        swirl: m ? curl / m : 0,
      };
    },
    injectImage: (imageData: ImageData) => {
      const fluid = fluidsRef.current[activeLayerRef.current];
      if (fluid) fluid.injectImage(imageData);
    },
    pourVideo: (video: HTMLVideoElement) => {
      if (videoPourRef.current) {
        videoPourRef.current.pause();
      }
      videoPourRef.current = video;
      video.play();
    },
    stopPourVideo: () => {
      if (videoPourRef.current) {
        videoPourRef.current.pause();
        videoPourRef.current = null;
      }
    },
    pourText: (rows, opts: { colour?: string; columns?: [number, number] } = {}) => {
      const fluid = fluidsRef.current[0];
      if (!fluid || rows.length === 0) return;
      // The box injectImage pours into, on the logical grid.
      const S = fluid.size;
      const w = Math.round(S * 0.81) - Math.round(S * 0.19);
      const h = Math.round(S * 0.69) - Math.round(S * 0.31);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (!g) return;
      const lum = (r: number, gg: number, b: number) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const brightest = (): string => {
        const idx = presetContractRef.current ?? harmonyRef.current;
        let best = { r: 1, g: 1, b: 1 }, bl = -1;
        for (const i of idx) { const p = PALETTE_RGB[i]; if (p && lum(p.r, p.g, p.b) > bl) { bl = lum(p.r, p.g, p.b); best = p; } }
        return `rgb(${Math.round(best.r * 255)}, ${Math.round(best.g * 255)}, ${Math.round(best.b * 255)})`;
      };
      let colour = opts.colour ?? brightest();
      if (colour === 'contrast') {
        // Dark letters on a bright plate, the look's brightest dye on a dark one.
        const m = fluid.meanColor, d = Math.min(1, fluid.meanDensity);
        colour = m && d > 0.25 && lum(m[0], m[1], m[2]) > 0.3 ? 'rgb(14, 14, 18)' : brightest();
      }
      const [c0, c1] = opts.columns ?? [0, 1];
      const x0 = Math.round(c0 * w), x1 = Math.round(c1 * w);
      const room = (x1 - x0) - 6;
      const face = (px: number) => `900 ${px}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
      const share = rows.reduce((a, r) => a + (r.weight ?? 1), 0);
      const usable = h - 6;
      g.fillStyle = colour;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // Turned against the plate's own angle so the words read level on the frame.
      const angle = rotationAnglesRef.current[0] ?? 0;
      if (angle) { g.translate(w / 2, h / 2); g.rotate(angle); g.translate(-w / 2, -h / 2); }
      let y = 3;
      for (const r of rows) {
        const band = usable * (r.weight ?? 1) / share;
        let px = Math.floor(band * 0.95);
        g.font = face(px);
        while (px > 6 && g.measureText(r.text).width > room) { px -= 1; g.font = face(px); }
        g.fillText(r.text, (x0 + x1) / 2, y + band / 2);
        y += band;
      }
      // The plate's rows run from the bottom of the frame up; a canvas's run down.
      const img = g.getImageData(0, 0, w, h);
      const flipped = g.createImageData(w, h);
      for (let yy = 0; yy < h; yy++) flipped.data.set(img.data.subarray((h - 1 - yy) * w * 4, (h - yy) * w * 4), yy * w * 4);
      fluid.injectImage(flipped);
    },
    kicks: () => kickCountRef.current,
    songShape: () => ({ now: { ...songShapeRef.current.now }, bar: { ...barGridRef.current.now }, events: songEventsRef.current.slice() }),
    // Off the closeup the camera is not running, and the centre it last had is
    // from some earlier closeup: an aim written from it would move the aim the
    // owner set to a place nobody is looking at.
    macroCentre: () => (lastMacroOnRef.current ? macroCamRef.current.centre : null),
    pace: (sample) => { paceTargetRef.current = { activity: sample.activity, dim: sample.dim }; },
    pour: (gust = 0.8) => {
      const energy = Math.min(1, audioDataRef.current?.energy ?? 0);
      floodPour(Math.max(0, Math.min(1, gust)), energy, frameBubblesRef.current, DICE.pour, DICE.pour);
    },
    stepDyes: () => {
      const w = paletteWindowRef.current;
      const n = presetContractRef.current?.length ?? 0;
      paletteWindowRef.current = { size: w.size ?? Math.max(1, Math.min(3, n > 1 ? n - 1 : 1)), lead: w.lead + 1 };
      if (harmonyLockRef.current) return;
      const contract = presetContractRef.current;
      if (contract) harmonyRef.current = harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0);
    },
    applyPreset: (presetId: string, extras, phase) => {
      // A user's preset carries its own dyes and injection styles; register
      // them under its id so seeding and adoption find them like a built-in.
      if (extras?.contract && extras.contract.length) PRESET_CONTRACTS[presetId] = extras.contract;
      else if (extras && !extras.contract) delete PRESET_CONTRACTS[presetId];
      if (extras?.injectStyles && extras.injectStyles.length) PRESET_INJECT_STYLES[presetId] = extras.injectStyles;
      if (extras?.liquids) PRESET_LIQUIDS[presetId] = extras.liquids;
      layPlateRef.current(presetId, false, phase);
    },
    /*
      What is on each layer.

      A layer was "Layer 1" and "Layer 2" and nothing else: no way to tell an
      empty one from a full one, which dyes were on it, or whether it was
      contributing anything to what you can see. So switching between them was
      blind, and anything that happened to change at the same time looked like
      the switch having done it — which is exactly the confusion this is here
      to remove.

      Both numbers come from sums the solver already keeps, so this costs a
      read of two fields per layer and nothing per frame.
    */
    layerReport: () => fluidsRef.current.slice(0, Math.max(1, Math.round(settingsRef.current.layerCount ?? 1))).map((f, i) => ({
      index: i,
      // How full it is. The scale is generous: a plate reads as busy long
      // before its mean density approaches one.
      fill: Math.max(0, Math.min(1, (f?.meanDensity ?? 0) / 0.35)),
      colour: f ? rgbToHex(f.meanColor[0], f.meanColor[1], f.meanColor[2]) : '#000000',
    })),
    describePlate: () => ({
      contract: presetContractRef.current ? [...presetContractRef.current] : null,
      injectStyles: [...injectStyleRef.current],
      liquids: [...plateLiquidsRef.current],
    }),
    adoptPreset: (presetId: string, extras) => {
      // The sequencer changing stage: the plate keeps what is on it, and the
      // new dyes and injection style take over from here. It is still the look
      // that is live, so a rebuild after a lost context puts this one back and
      // not the one that was clear-seeded three songs ago.
      livePresetRef.current = presetId;
      if (extras?.contract && extras.contract.length) PRESET_CONTRACTS[presetId] = extras.contract;
      if (extras?.injectStyles && extras.injectStyles.length) PRESET_INJECT_STYLES[presetId] = extras.injectStyles;
      if (extras?.liquids) PRESET_LIQUIDS[presetId] = extras.liquids;
      presetContractRef.current = PRESET_CONTRACTS[presetId] ?? null;
      journeyRef.current = { lead: 0, lastAt: -1 };
      injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
      // The plate keeps what is already dissolved in it; from here the new
      // preset's liquids are what gets poured, and into its areas if it has any.
      plateLiquidsRef.current = PRESET_LIQUIDS[presetId] ?? [];
      areasRef.current = plateAreas(presetId);
      areaBottlesRef.current = true;
      if (!harmonyLockRef.current) {
        const contract = presetContractRef.current;
        harmonyRef.current = contract ? harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0) : pickHarmony();
      }
    },
    handoff: (seconds: number, phase) => {
      if (!(seconds > 0)) { handoffRef.current = null; return; }
      const now = showNow();
      handoffRef.current = { start: now, dur: seconds * 1000, last: now, poured: 0, dosed: 0, seeds: null, phase };
    },
    sendBack: (presetId, look, seconds, name = null, extras) => {
      // Not while a render has the plate (a pad pressed mid-render): the
      // render owns both plates until it hands back (see `resetStamps`).
      if (stageRef.current) { onBackLookClearedRef.current?.(); return; }
      const now = showNow();
      if (presetId === null || !look) {
        // Following the front again: the solver settings fade back to the
        // front's, and from now the back plate pours the front's dyes. What
        // is on it stays; the front's pours take it over the way a stage
        // change does, rather than a wipe.
        backLookRef.current.send(null, settingsRef.current, now, seconds);
        backDyesRef.current = null;
        backHandoffRef.current = null;
        return;
      }
      // A user preset's dyes, registered as `adoptPreset` does, without
      // touching the front's refs.
      if (extras?.contract && extras.contract.length) PRESET_CONTRACTS[presetId] = extras.contract;
      if (extras?.injectStyles && extras.injectStyles.length) PRESET_INJECT_STYLES[presetId] = extras.injectStyles;
      if (extras?.liquids) PRESET_LIQUIDS[presetId] = extras.liquids;
      const contract = PRESET_CONTRACTS[presetId] ?? null;
      backDyesRef.current = {
        id: presetId,
        contract,
        // The front's sequencer windows and hue journey are the front's; the
        // back plate takes its look's dyes whole, as a look laid fresh does.
        // A look with no dyes of its own takes what its seed lays (below).
        harmony: contract ? (contract.length <= WORKING_DYES ? windowOf(contract, null, 0) : harmonyWithin(contract)) : harmonyRef.current,
        styles: PRESET_INJECT_STYLES[presetId] || ['drop'],
        liquids: PRESET_LIQUIDS[presetId] ?? [],
      };
      backLookRef.current.send(look, settingsRef.current, now, seconds, presetId, name);
      // The same handover a Go gives the front, over at least a second: a
      // cut to a look on a plate full of the last one reads as a glitch.
      backHandoffRef.current = { start: now, dur: Math.max(1, seconds) * 1000, last: now, poured: 0, seed: null };
    },
    setPaletteWindow: (size: number | null, lead: number) => {
      paletteWindowRef.current = { size: size === null ? null : Math.max(1, Math.round(size)), lead: Math.round(lead) };
      if (harmonyLockRef.current) return;
      const contract = presetContractRef.current;
      if (contract) harmonyRef.current = harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0);
    },
    setInjectStyle: (styles: string[]) => {
      injectStyleRef.current = styles;
    },
    setPlateLiquids: (ids: string[]) => {
      plateLiquidsRef.current = ids.filter(id => LIQUIDS_BY_ID.has(id));
      areaBottlesRef.current = false;
    },
    setHarmony: (indices: number[]) => {
      // Music-driven harmony never overrides an explicit user palette lock
      if (harmonyLockRef.current) return;
      if (indices.length > 0 && indices.every(i => i >= 0 && i < PALETTE_COUNT)) {
        // A song's identity colours the show, but inside the preset's dyes.
        const contract = presetContractRef.current;
        if (!contract) { harmonyRef.current = indices; return; }
        const inside = indices.filter(i => contract.includes(i));
        harmonyRef.current = inside.length >= 2 ? inside : harmonyWithin(contract);
      }
    },
    setExternalTilt: (x: number, y: number) => {
      // A phone's tilt is the room's hand, not the song's: a render hears
      // only its song (see `VisualizerRender`), so it is not taken while the
      // show clock is the film's.
      if (clockIsFixed()) return;
      const t = externalTiltRef.current;
      t.x = Math.max(-1, Math.min(1, x));
      t.y = Math.max(-1, Math.min(1, y));
      t.at = showNow() * 0.001;
    },
    setStage: (size) => {
      stageRef.current = size && size.width > 0 && size.height > 0 ? { width: Math.round(size.width), height: Math.round(size.height) } : null;
      setStaged(stageRef.current !== null);
      reladderRef.current();
      resizeRef.current();
    },
    loadFilmFile: async (file: File) => {
      stopFilm();
      const f = filmRef.current;
      const v = filmVideo();
      f.url = URL.createObjectURL(file);
      v.src = f.url;
      f.kind = 'file';
      try { await v.play(); } catch { /* autoplay policy: plays on the next gesture */ }
    },
    /*
      Film from a window.

      The same projector, fed by whatever else is on this machine: a browser
      tab playing a film off the Internet Archive, a media player, a slide
      deck, another copy of this app. The frames arrive through the browser's
      own capture, which is why this reaches things a URL cannot — a
      cross-origin video can be played in a page but not read back into a
      texture on the GPU, and almost nothing on the web sends the header that would
      allow it. A window has no origin.

      Nothing is requested until the button is pressed, and the browser's
      picker, not this app, decides what is shared.
    */
    startFilmWindow: async (onEnded?: () => void, onBlank?: () => void) => {
      const media = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
      };
      if (!media?.getDisplayMedia) throw new Error('This browser cannot capture a window.');
      // Asked for before `stopFilm`, so a picker the operator cancels leaves
      // whatever was already playing alone rather than putting the projector
      // out on the way to a dialog they changed their mind about.
      /*
        What the picker is told, and why each part of it.

        `displaySurface: 'browser'` opens the picker on its Tab list. It is a
        hint, not a restriction — a whole window or a screen is still one
        click away — and it is the right default for this feature twice over.
        A film is usually a video playing in a tab, and capturing the *tab*
        composites through the renderer, while capturing the *window* around
        it does not always: a video handed to a hardware overlay plane is
        drawn past the window's own surface, and window capture then yields
        black frames with the audio and the controls coming through perfectly.
        That is the most likely reading of a black plate from a playing movie,
        and the tab is the capture that does not have the problem.

        `selfBrowserSurface: 'exclude'` takes ChromaGlass out of the list.
        Offering it invites capturing the plate into the plate, and it is the
        one choice that can only ever be a mistake.

        `surfaceSwitching: 'exclude'` drops the "Share this tab instead"
        control Chrome otherwise puts up, which is a question about the app's
        own tab asked in the middle of choosing a film.
      */
      const stream = await media.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, displaySurface: 'browser' },
        // The plate is driven by the room's sound, not by the captured window,
        // and asking for audio makes the picker offer a checkbox that does
        // nothing here.
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions);
      stopFilm();
      const f = filmRef.current;
      const v = filmVideo();
      f.stream = stream;
      v.srcObject = stream;
      f.kind = 'window';
      filmEndedRef.current = onEnded ?? null;
      for (const t of stream.getVideoTracks()) {
        t.addEventListener('ended', () => {
          const cb = filmEndedRef.current;
          stopFilm();
          cb?.();
        });
      }
      try { await v.play(); } catch { /* as above */ }

      /*
        Say so when the capture is coming through black.

        A window that yields nothing but black pixels is indistinguishable, on
        the plate, from a film that is simply very dark — and from the feature
        being broken. So the frames are looked at: a few samples over a second
        and a half, and if every pixel of every one of them is black the
        operator is told, because the remedy (share the tab rather than the
        window) is not something anybody would guess.

        Sampled, not watched: one 32x32 read every 300ms, stopped as soon as
        anything lights up, on a machine that is also running a fluid solver.
      */
      if (onBlank) {
        const probe = document.createElement('canvas');
        probe.width = 32; probe.height = 32;
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        let looks = 0;
        const timer = setInterval(() => {
          looks++;
          if (!pctx || filmRef.current.kind !== 'window' || v.readyState < 2) {
            if (looks >= 5) clearInterval(timer);
            return;
          }
          try {
            pctx.drawImage(v, 0, 0, probe.width, probe.height);
            const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) { clearInterval(timer); return; }
            }
          } catch { clearInterval(timer); return; }   // tainted: not ours to read, and not black either
          if (looks >= 5) { clearInterval(timer); onBlank(); }
        }, 300);
      }
    },
    startFilmCamera: async () => {
      stopFilm();
      const f = filmRef.current;
      const v = filmVideo();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      f.stream = stream;
      v.srcObject = stream;
      f.kind = 'camera';
      try { await v.play(); } catch { /* as above */ }
    },
    clearFilm: () => stopFilm(),
    loadMark: (source, width, height) => {
      markRef.current = { source, aspect: width > 0 && height > 0 ? width / height : 1, dirty: true };
    },
    clearMark: () => { markRef.current = null; },
    fireEnvelopes: (velocity = 1) => modRef.current.fire(velocity),
    filmVideoEl: () => (filmRef.current.kind === 'none' ? null : filmRef.current.video),
    setHarmonyLock: (indices: number[] | null) => {
      harmonyLockRef.current = indices;
      if (indices) harmonyRef.current = indices;
    },
    triggerTheme: (theme: string, energy = 0.6) => {
      const af = fluidsRef.current[activeLayerRef.current];
      if (!af || drainFrameRef.current > 0) return;
      const S = GRID_SIZE;
      const rx = () => Math.floor(S * 0.2 + DICE.hands.float() * S * 0.6);
      const pick = (idxs: number[]) => PALETTE_RGB[DICE.hands.pick(idxs)];
      const amt = 4 + energy * 8;

      switch (theme) {
        case 'fire': { // warm palette, low placement, heat drives it upward
          const c = pick([0, 1, 3]);
          const x = rx(), y = Math.floor(S * 0.75);
          af.autoInject('splatter', x, y, amt, c.r, c.g, c.b, energy);
          af.addTemp(x, y, 3 + energy * 4);
          break;
        }
        case 'water': { // cool palette pours downward from the top
          const c = pick([7, 8, 9]);
          const x = rx(), y = Math.floor(S * 0.2);
          af.autoInject('pour', x, y, amt, c.r, c.g, c.b, energy);
          for (let d = 0; d < 10; d++) af.addVelocity(x, Math.min(S - 2, y + d), 0, 0.08);
          break;
        }
        case 'sky': { // icy blue + white mist high in the frame
          const c = pick([7, 15]);
          af.autoInject('spray', rx(), Math.floor(S * 0.25), amt, c.r, c.g, c.b, energy);
          break;
        }
        case 'earth': { // heavy warm browns settle low
          const c = pick([12, 13, 1]);
          af.autoInject('pour', rx(), Math.floor(S * 0.8), amt, c.r, c.g, c.b, energy * 0.6);
          break;
        }
        case 'love': { // pink bloom from the center
          const c = pick([2, 11]);
          af.autoInject('drop', Math.floor(S / 2), Math.floor(S / 2), amt * 1.2, c.r, c.g, c.b, energy);
          af.addTemp(Math.floor(S / 2), Math.floor(S / 2), 1.5);
          break;
        }
        case 'dark': { // ink splatter
          const c = pick([14, 4]);
          af.autoInject('splatter', rx(), rx(), amt, c.r * 0.4, c.g * 0.4, c.b * 0.4, energy);
          break;
        }
        case 'light': { // white-gold radial burst
          const c = pick([15, 0]);
          const x = Math.floor(S / 2), y = Math.floor(S / 2);
          af.autoInject('drop', x, y, amt, c.r, c.g, c.b, energy);
          af.applyRadialImpulse(x, y, Math.round(20 * GRID_SCALE), 0.3 + energy * 0.4);
          af.addTemp(x, y, 2 + energy * 2);
          break;
        }
        case 'motion': { // fast streaks in the current harmony
          const c = harmonyColor(harmonyOf(activeLayerRef.current));
          af.autoInject('streak', rx(), rx(), amt, c.r, c.g, c.b, Math.min(1, energy + 0.3));
          break;
        }
        default: {
          const c = harmonyColor(harmonyOf(activeLayerRef.current));
          af.autoInject('drop', rx(), rx(), amt, c.r, c.g, c.b, energy);
        }
      }
    },
    applyGesture: (g) => performGesture(g),
  }));

  // Outside a render: a harness's `pour` between frames reads the ref too.
  useEffect(() => { if (!renderingRef.current) audioDataRef.current = liveHeard(); }, [audioData]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  /**
   * Spin a plate up, in radians a second added to whatever it is already doing.
   *
   * Exported on the debug hook as well as wired to the prop, so a harness can
   * flick a plate without a pad or a pointer. A second flick adds to the
   * first, which is what a hand does to a turntable.
   */
  const flickSpin = (layer: number, strength = 1): void => {
    const l = Math.max(0, Math.min(spinVelRef.current.length - 1, Math.floor(layer)));
    if (!(l >= 0) || spinVelRef.current.length === 0) return;
    // Layers alternate direction, as they do for the motor, so a flick on the
    // back plate turns the other way and the two shear against each other.
    const dir = l % 2 === 0 ? 1 : -1;
    // Up to about six-tenths of a turn a second at full strength, about the
    // speed the rotationSpeed slider asks for at its top (lookMotorRate) and
    // twelve times the fastest look's motor: a flick is meant to be seen.
    const top = 2 * Math.PI * 0.6;
    const add = dir * Math.max(0, Math.min(2, strength)) * (settingsRef.current.spinImpulse ?? 0.5) * top;
    if (Number.isFinite(add)) spinVelRef.current[l] = (spinVelRef.current[l] ?? 0) + add;
  };

  useEffect(() => {
    if (!spinFlick || spinFlick.seq === lastFlickRef.current) return;
    lastFlickRef.current = spinFlick.seq;
    flickSpin(spinFlick.layer);
    // flickSpin reads refs only, so it does not belong in the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinFlick]);
  useEffect(() => { selectedLiquidRef.current = selectedLiquid; }, [selectedLiquid]);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isAutomatedRef.current = isAutomated; }, [isAutomated]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { onManualGestureRef.current = onManualGesture; }, [onManualGesture]);
  const onMagnetInHandRef = useRef(onMagnetInHand);
  useEffect(() => { onMagnetInHandRef.current = onMagnetInHand; }, [onMagnetInHand]);
  /** When a hold last told the app it brought a magnet (onMagnetInHand), on the show's clock. */
  const magnetToldRef = useRef(-Infinity);
  const onFerrofluidPouredRef = useRef(onFerrofluidPoured);
  useEffect(() => { onFerrofluidPouredRef.current = onFerrofluidPoured; }, [onFerrofluidPoured]);
  /** When a hand last laid from a magnetic bottle, and when the app was last asked to draw it, on the show's clock. */
  const ferroPouredAtRef = useRef(-Infinity);
  const ferroToldRef = useRef(-Infinity);
  /*
    A hand laying from the Ferrofluid bottle onto `af`, this step.

    A pour that starts while the plate draws no ferrofluid (Ferrofluid at 0)
    clears what is in the solver unseen first. A cut to a look with none
    leaves the last look's ring there, hidden by the amount at 0 (a look that
    asks for no ferrofluid leaves the field alone), and turning the amount up
    for this pour would have brought the whole ring back with one drop.
    Nothing visible goes: at 0 none of it is drawn. Only at the start of a
    pour (nothing laid from the bottle for a second), so the pour's own first
    drops are not cleared while the app's answer is a render away.
  */
  const handPoursFerro = (af: FluidSimulation) => {
    const now = showNow();
    if (now - ferroPouredAtRef.current > 1000 && (settingsRef.current.phaseAmount ?? 0) <= 0.002) af.gpu?.clearPhase?.();
    ferroPouredAtRef.current = now;
    if (af === fluidsRef.current[0]) phaseByHandRef.current = true;
  };
  useEffect(() => { onEngineStatusRef.current = onEngineStatus; }, [onEngineStatus]);

  useEffect(() => {
    const currentCount = fluidsRef.current.length;
    // Whole layers only, whatever arrives (a fade, a fader, a saved show): a
    // fractional count here builds a solver on one change and drops it on the next.
    const targetCount = Math.max(1, Math.min(2, Math.round(settings.layerCount ?? 1)));

    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const fluid = new FluidSimulation(GRID_SIZE, settings.diffusionRate, 0.0001, 0.01);
        fluid.layerIndex = i;
        if (i === 0) {
          // Seed initial preset pattern
          harmonyRef.current = fluid.seedPreset('classic', noise2D);
          presetContractRef.current = PRESET_CONTRACTS['classic'];
          for (let d = 0; d < 15; d++) {
            doseLiquid(fluid, plateLiquidsRef.current,
              10 + DICE.lay.float() * (GRID_SIZE - 20), 10 + DICE.lay.float() * (GRID_SIZE - 20), 1.2);
          }
        }
        // A back plate built for a look of its own is built by a Go to Back
        // Plate on a one-plate look (App keeps it on the stage for as long as
        // it has the look), and that Go's handover lays it.
        if (i > 0 && !backDyesRef.current && laidPresetRef.current) laySecondPlate(fluid, laidPresetRef.current);
        fluidsRef.current.push(fluid);
        rotationAnglesRef.current.push(DICE.lay.angle());
        spinVelRef.current.push(0);
        // A plate added is a dish at rest with still liquid, not the speeds a
        // plate dropped from this index left behind (the picture turns with
        // the liquid, so a stale one turned a fresh plate).
        dishSpinRef.current[i] = 0;
        liquidSpinRef.current[i] = 0;

      }
    } else if (currentCount > targetCount) {
      for (const dropped of fluidsRef.current.slice(targetCount)) { dropped.dropGpu(); dropped.forgetCarry(); }
      fluidsRef.current = fluidsRef.current.slice(0, targetCount);
      rotationAnglesRef.current = rotationAnglesRef.current.slice(0, targetCount);
      spinVelRef.current = spinVelRef.current.slice(0, targetCount);
    }
  }, [settings.layerCount]);

  /*
    A device, lost and given back.

    WebGL had an event for both halves, and this effect owned the listeners so
    it outlived the rebuild it triggered. WebGPU has neither: a lost device is
    a promise that settles, and there is no restore — the stage asks for a new
    device instead, which it does in the setup effect where the old one lived
    (see `s.lost.then` there). What is left of this is the two refs that tell
    the rest of the app the plate is being rebuilt, which the loss handler
    sets and the new stage clears.
  */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── The show's own frame loop ─────────────────────────────────────
    // Engine-free: it decides what a frame is and hands it to whichever
    // renderer started (docs/webgpu-plan.md, P3). Both branches below build
    // one and call `startWith`.
    const tier = detectTier();
    let animationFrameId = 0;
    let renderer: PlateRenderer | null = null;

    /*
      Which offers of a frame are drawn, from either window (PLAN.md §14b,
      lib/drawGate.ts). The projector window asks for a frame on every one of
      its refreshes (see __chromaglassFrame below) and this window's own
      animation frames keep coming while it is visible, so with the wall up
      there are two clocks. The gate stamps every draw, whichever of them
      asked, and turns down any offer that comes within 0.6 of a refresh of
      the last one: one draw a refresh, not one per clock.
    */
    const drawGate = new DrawGate();
    /*
      The loop, guarded.

      `renderFrame` schedules the next frame as its last line, so anything
      that threw in the fourteen hundred lines before it ended the show: no
      error on screen, no recovery, a still plate until a reload. That was
      the "stops and never comes back" on the live site that no device loss
      explained. Now a frame that throws is logged and the next one is asked
      for regardless; and frames that keep throwing — a second and a half of
      them — are treated like a lost device: the stage is destroyed, which
      runs the recovery that rebuilds everything from scratch. Three of those
      inside a minute and it stops trying, says so as a fatal, and keeps the
      loop alive in case whatever it was clears.
    */
    let frameErrors = 0;
    let lastFrameErrorLog = -Infinity;
    /** `chromaglassDebug().throwFrames(n)`: the next n frames throw, for the soak that proves the guard. */
    let throwFrames = 0;
    /** `stepDownFrames(n)`: a rung lost on each of the next n frames — swaps faster than a readback lands (S3, S6). */
    let stepDownFrames = 0;
    /** `errorStorm(n)`: an invalid GPU call on each of the next n frames, for the storm rebuild (S6). */
    let stormFrames = 0;
    /*
      This window's own animation frame. Offered to the gate first: while the
      projector is asking too, a frame that lands just after one the
      projector's ask drew is turned down, and the next is asked for at once,
      so this window's clock keeps ticking (and keeps being measured) whether
      or not it draws. With no projector asking, every frame is drawn, as it
      always was.

      Offered at `ts`, the time its refresh began, not the time this callback
      got to run (lib/drawGate.ts says why at length: a callback that waited
      behind the projector's draw in the same refresh looked like the next
      refresh's once a draw cost more than 0.6 of one). Called with nothing
      when the renderer starts the loop, and then it is now.
    */
    const render = (ts?: number) => {
      if (renderingRef.current) return;
      if (!drawGate.offer('frame', refreshStamp(ts, performance.now()))) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      // The ear reads for this frame first, if its own loop has not yet
      // (lib/earClock.ts plateFrame, PLAN.md §14f), so the frame hears itself.
      plateTsRef.current = ts ?? null;
      // Guarded: the whole ear reads here now, and a throw in it must cost
      // this frame its fresh reading, never the loop its re-arm (draw's own
      // guard below is what keeps the plate going).
      if (ts !== undefined) {
        try { plateFrame(ts); } catch (err) { console.error('ChromaGlass: the ear threw reading for the plate\'s frame', err); }
      }
      draw();
    };
    /** One frame, guarded; whichever window asked for it has already been let through the gate. */
    const draw = () => {
      // A song render is drawing the frames (`renderApiRef` below): the
      // browser's frame is not one of them.
      if (renderingRef.current) return;
      try {
        renderFrame();
        frameErrors = 0;
      } catch (err) {
        frameErrors++;
        const now = performance.now();
        if (frameErrors === 1 || now - lastFrameErrorLog > 5000) {
          lastFrameErrorLog = now;
          console.error(`ChromaGlass: a frame threw (${frameErrors} in a row); the loop carries on.`, err);
        }
        if (frameErrors >= SELF_HEAL_FRAMES) {
          frameErrors = 0;
          healStage(`frames keep throwing (${String((err as Error)?.message ?? err).slice(0, 160)})`);
        }
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(render);
      }
    };
    const renderFrame = () => {
      framesDrawnRef.current++;
      // The context is gone and not back yet. Keep the loop alive but touch
      // nothing: the restore bumps `glEpoch`, which rebuilds and restarts it.
      if (glLostRef.current) { animationFrameId = requestAnimationFrame(render); return; }
      if (throwFrames > 0) { throwFrames--; throw new Error('a test throw (throwFrames)'); }
      if (stepDownFrames > 0) { stepDownFrames--; governorRef.current?.failRung(performance.now() * 0.001); }
      if (stormFrames > 0 && stage) {
        stormFrames--;
        // A buffer with no usage is a validation error, uncaptured by design.
        try { stage.device.createBuffer({ size: 4, usage: 0 }); } catch { /* some implementations throw instead */ }
      }
      // The heartbeat: a visible tab that stops getting here has stopped.
      crashLog.beat();
      const workStart = performance.now();
      let frameS = 0;
      /** How many solver steps this frame took, for the governor's GPU budget. */
      let stepsThisFrame = 0;
      /*
        How many steps a second this frame is aiming for, and what one of them
        stands for in wall-clock seconds (H2b). Read once, here, so everything
        downstream that counts steps where it means seconds — the accumulator,
        the beads, the bubbles, the rocks, the room and film stirs, the liquid
        chemistry — agrees with the solver about how long a step is.
      */
      const rendering = renderingRef.current;
      const stepRate = rendering?.stepRate ?? PINNED_STEP_RATE ?? governorRef.current?.stepRate ?? 60;
      const simStepS = 1 / stepRate;
      // A render sets the frame's reading itself (`step`); the live show asks.
      if (!rendering) {
        audioDataRef.current = liveHeard();
        const h = hearingRef.current;
        h.frames++;
        if (audioDataRef.current !== h.last) { h.fresh++; h.last = audioDataRef.current; }
        // Taken on this very frame, not the one before (the order of two loops).
        if (plateTsRef.current !== null && audioDataRef.current?.frameTs === plateTsRef.current) h.ownFrame++;
      }
      const currentAudioData = audioDataRef.current;
      // ── The room, on the settings ─────────────────────────────
      // A scene mapping is a feature, a setting and a depth, the same shape
      // the music has used all along. Applied here, once, so everything
      // downstream reads a settings object that already has the room in it and
      // nothing has to learn about the camera.
      //
      // One object, reused: a copy per frame of a hundred-key settings object
      // is sixty allocations a second for a show that runs for hours.
      const patch = patchRef.current!;
      patch.fold(settingsRef.current, {
        room: clockIsFixed() ? null : sceneRef?.current ?? null,
        film: clockIsFixed() ? null : filmSenseRef?.current ?? null,
        sound: currentAudioData,
        shape: modRef.current,
        roomImpact: settingsRef.current.sceneImpact ?? 0,
        filmImpact: settingsRef.current.filmImpact ?? 0,
        soundImpact: settingsRef.current.soundImpact ?? 1,
        shapeImpact: settingsRef.current.shapeImpact ?? 1,
      }, settingsRef.current.layerCount ?? 1, showNow(),
      // Sound learn's mappings: the rig's, not the look's, folded the same way.
      soundLearnRef.current.patchesOf(soundBindingsRef.current),
      // The back plate's own look, when it has one (§16a): its base, which
      // the patches then ride. Null, which is every show that never sends it
      // one, leaves the fold exactly as it was.
      (platesScratchRef.current[1] = backLookRef.current.base(settingsRef.current, showNow()), platesScratchRef.current));
      // The picture. Everything aimed at one plate reaches it through
      // `patch.layer(i)` where the solver is stepped, and nowhere else: a
      // setting the render pass reads is global whatever it was aimed at,
      // which is why the panel will not let you aim one at a layer.
      const currentSettings = patch.global;
      /*
        Where the magnet is this frame.

        A hand on it wins: the Magnet tool (or the phone pad, or a replay)
        puts it where the pointer is, at no less than a firm pull, for as long
        as the hand keeps touching it (a quarter of a second of grace).

        And where the hand lets go of it, it stays. It used to go back to the
        look's own place a quarter of a second after the last touch, which on
        almost every look is the middle of the plate (magnetX and magnetY are
        0.5 unless a look says otherwise, and none does), so the ferrofluid
        the hand had just dragged to a corner flowed back to the centre on its
        own. Reported by the owner: "I don't like how the magnet draws the
        ferrofluid back to the center automatically. I want to just control
        it with the mouse." A magnet set down under a dish stays where it was
        put, so this one does too: at the look's own strength and height once
        released (the firm, low pull is the hand pressing it up to the glass),
        and not walking, since a walk is the magnet moving on its own.

        What takes it back from the hand is the look placing its magnet
        somewhere: Magnet Across or Up moved (the slider, a MIDI fader, a
        patch), seen as the lead plate's magnetX or magnetY changing from one
        frame to the next. Evolve no longer drifts those two (lib/drift.ts),
        so the automation cannot do it behind the performer's back. A new look
        that keeps the magnet where the last one had it leaves the hand's
        placement alone.

        With no hand ever on it and the automation on, a look with ferrofluid
        on it gets a magnet that walks: a slow figure around where the look
        put it, faster when the music is. A magnet that sits still under a
        still plate is a photograph of ferrofluid, not ferrofluid. Every other
        look is handed its settings untouched.
      */
      const magnetFor = <T extends Partial<VisualizerSettings>>(look: T): T => {
        const now = showNow();
        const lead = fluidsRef.current[0];
        if (lead) { lead.extraMagnets = []; lead.magnetRadius = MAGNET_RADIUS; }
        const hand = magnetHandRef.current;
        const held = hand !== null && now - hand.at < 250;
        const lookX = look.magnetX ?? 0.5, lookY = look.magnetY ?? 0.5;
        const seen = magnetLookRef.current;
        magnetLookRef.current = { x: lookX, y: lookY };
        if (!held && hand && seen && (Math.abs(lookX - seen.x) > 1e-4 || Math.abs(lookY - seen.y) > 1e-4)) {
          magnetHandRef.current = null;
        }
        // Let go of, and left where the hand put it.
        const placed = !held && magnetHandRef.current !== null;
        const strength = look.magnetStrength ?? 0;
        // The walk is a look setting, so a look (or a test) that places its
        // magnet keeps it there. Random Evolve walks it on any ferrofluid
        // look: at once, gently, and from then on its drift wanders the
        // setting itself (lib/drift.ts), which is what the slider shows.
        const walk = Math.max(look.magnetWalk ?? 0, isAutomatedRef.current ? 0.35 : 0);
        const walks = !held && !placed && walk > 0 && isActiveRef.current
          && strength > 0 && (look.phaseAmount ?? 0) > 0.002;
        /*
          The maze field plays the music: its strength breathes with how
          loud it is and steps up on a kick, and a stronger field makes the
          labyrinth finer and busier while a weaker one lets the fingers
          fatten and round (Zakinyan et al.; the ferrofluid speakers that
          drive a coil from the audio do the same). Slewed, so the maze
          breathes rather than flickers.
        */
        const lab = look.ferroLabyrinth ?? 0;
        let field = lab;
        if (lab > 0.001 && isActiveRef.current && currentAudioData) {
          const k = mazeKickRef.current;
          const dtS = k.at ? Math.min(0.1, (now - k.at) / 1000) : 0;
          k.at = now;
          k.env = kickRef.current?.kick ? 1 : k.env * Math.exp(-dtS / 0.8);
          const energy = Math.min(1, currentAudioData.energy);
          field = Math.min(1, lab * (0.55 + 0.35 * energy + 0.45 * k.env));
        }
        /*
          A hand bringing a magnet to a look that has none: the look takes
          it, at the strength the Magnet tool has always given such a look,
          so that let go it is set down under the glass where the hand left
          it (placed, below) rather than taken away with the hand.

          Read from the settings as the app holds them, not the folded look:
          the app answers from its own Magnet Strength, and a sound-learn
          patch riding the folded one must not decide whether the look has
          a magnet. And asked again a few times a second for as long as the
          hand holds it, rather than once a hold: a look fade that lands
          during the hold sets the strength back to the target look's, and
          a hold told only once would then set down a magnet with none. The
          app ignores a call when the look already has its magnet.
        */
        /*
          And no ferrofluid of its own. From 9x the first touch on a plate
          with none laid a pool under the hand, as big as Magnet Size, so a
          magnet over a bare plate did something; the owner, 2026-10-04: "Why
          does the magnet add ferrofluid? It should only work on ferrofluid
          that is already there." A magnet is a field. It moves the
          ferrofluid that was poured, and over a dish with none it moves
          nothing, which is what a real one does. The ferrofluid comes from
          the bottle (the Ferrofluid liquid with a laying tool) or the look.

          What the hold still tells the app is whether there is any in the
          solver to draw (phaseIsLive: something laid it and nothing has
          cleared it since), so Ferrofluid is turned up only over ferrofluid
          that is there. Turned up over none, the frame loop's "turned up on
          a bare plate" pour would lay the look's ring, which is the magnet
          adding ferrofluid again by the back door.
        */
        const ferroThere = !!(lead?.gpu as { phaseIsLive?: boolean } | undefined)?.phaseIsLive;
        const told = settingsRef.current;
        if (held && ((told.magnetStrength ?? 0) <= 0 || (ferroThere && (told.phaseAmount ?? 0) <= 0.002)) && now - magnetToldRef.current > 250) {
          magnetToldRef.current = now;
          onMagnetInHandRef.current?.(ferroThere);
        }
        if (!held && !placed && !walks) {
          // Said as it is, so the harness does not read the last held magnet
          // as still held once the hand has gone stale.
          lastMagnetRef.current = { x: lookX, y: lookY, strength, height: look.magnetHeight ?? 0.25, radius: MAGNET_RADIUS, held: false, field };
          return field === lab ? look : Object.assign(magnetStepRef.current, look, { ferroLabyrinth: field }) as T;
        }
        let mx: number, my: number, ms = strength, mh = look.magnetHeight ?? 0.25;
        if (held) {
          // A magnet in the hand is pressed up under the glass: low and
          // strong, so it grabs what is near it and drags it along, where a
          // look's own magnet is held further off and gathers broadly.
          mx = hand.x; my = hand.y; ms = Math.max(strength, 0.9) * toolAmountRef.current; mh = Math.min(mh, 0.15);
        } else if (placed) {
          mx = hand?.x ?? lookX; my = hand?.y ?? lookY;
        } else {
          const energy = currentAudioData ? Math.min(1, currentAudioData.energy) : 0;
          const last = magnetWalkAtRef.current || now;
          magnetWalkAtRef.current = now;
          magnetWalkRef.current += Math.min(0.1, (now - last) / 1000) * (0.35 + 1.1 * energy) * (0.6 + 0.6 * walk);
          const t = magnetWalkRef.current;
          mx = (look.magnetX ?? 0.5) + 0.34 * walk * Math.sin(t * 0.9);
          my = (look.magnetY ?? 0.5) + 0.28 * walk * Math.sin(t * 1.3 + 1.1);

          // Audio-Reactive Ferrofluid (Rosensweig Instability spikes)
          if (ms > 0 && isActiveRef.current && currentAudioData) {
            const energy = Math.min(1, currentAudioData.energy);
            const env = mazeKickRef.current.env ?? 0;
            // The magnetic field pulses violently with the kick and energy, causing spikes to jump
            ms = Math.min(1.0, ms * (0.4 + 0.4 * energy + 0.8 * env));
          }
        }
        /*
          The magnet's size (Magnet Size, lib/magnetSize.ts): held or set
          down it is the same magnet, k times as wide with its face
          where it was, its height and strength as they were (PLAN.md 9v).
          Not the walk's: that is the look's own magnet, which nobody's hand
          chose. Read from the folded look, so a patch (a fader's LFO, the
          room, the sound) aimed at Magnet Size moves it as it moves any
          other setting.
        */
        const radius = held || placed ? magnetRadiusAt(look.magnetSize ?? settingsRef.current.magnetSize) : MAGNET_RADIUS;
        if (lead) lead.magnetRadius = radius;
        lastMagnetRef.current = { x: Math.max(0.05, Math.min(0.95, mx)), y: Math.max(0.05, Math.min(0.95, my)), strength: ms, height: mh, radius, held, field };
        // The other fingers' magnets, while the first is held (see the hands
        // loop): each finger that held one within the same quarter second.
        if (lead) {
          const extras: { x: number; y: number }[] = [];
          if (held) {
            for (const h of extraHandsRef.current.values()) {
              if (extras.length < 3 && h.magnetAt !== undefined && now - h.magnetAt < 250) {
                extras.push({ x: Math.max(0.05, Math.min(0.95, h.x / GRID_SIZE)), y: Math.max(0.05, Math.min(0.95, h.y / GRID_SIZE)) });
              }
            }
          }
          lead.extraMagnets = extras;
        }
        return Object.assign(magnetStepRef.current, look, {
          magnetX: Math.max(0.05, Math.min(0.95, mx)),
          magnetY: Math.max(0.05, Math.min(0.95, my)),
          magnetStrength: ms,
          magnetHeight: mh,
          ferroLabyrinth: field,
        }) as T;
      };

      if (fluidsRef.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const now = showEpochS();
        // A render's frame is exactly 1/fps: the clock's own difference of two
        // large doubles is that to within a last bit, which would still be a
        // different last bit in every uniform downstream.
        const realDt = rendering ? 1 / rendering.fps : now - lastTimeRef.current;
        lastTimeRef.current = now;
        frameS = realDt;
        // One verdict per frame on whether this is a kick: from the beat
        // clock when it is locked (ahead of the microphone), else from the
        // onset as heard. Every reaction below reads this instead of its own
        // threshold crossing, so they all land together.
        {
          const nowMs = showNow();
          /*
            The kick the ear heard since the last frame, and when: the
            analyser's own kick onset (lib/audioFeatures.ts, spectral flux on
            30–120 Hz), not the smoothed bass level crossing a line, which the
            chorus of the show's own band held over the line from kick to kick
            and so never crossed (`npm run kicks`: 59 of 160 chorus kicks heard
            at 20 fps, 156 now).

            Read from the onset's time, `at`, which a reading carries until
            the next kick, and not from `hit`, which is true on the one
            reading the kick landed on. The ear and this loop do not tick
            together and React hands the loop the latest reading, not every
            one: on a busy page (the cloud's, drawing a dozen frames a
            second) the loop saw 1 hit in 30 s of the band while the ear
            fired on its kicks. `at` changing is a kick however many readings
            went by between two frames. Live, the reading's time is the
            page's clock, the same as `nowMs`, so the clock is told when the
            kick landed, not when this frame got round to it; a render's
            readings keep song time, and there the frame is the time it was
            heard.
          */
          const earReading = currentAudioData?.features ?? null;
          const kickAt = earReading?.onsets?.kick?.at ?? null;
          let heardAt: number | null = null;
          if (kickAt !== null && kickAt !== heardKicksRef.current.lastAt) {
            heardKicksRef.current.lastAt = kickAt;
            heardKicksRef.current.n++;
            heardAt = clockIsFixed() ? nowMs : Math.min(nowMs, kickAt * 1000);
          }
          const trust = isActiveRef.current && currentAudioData ? Math.max(0, Math.min(1, currentSettings.beatPrediction ?? 0)) : 0;
          // A clock from the desk, a tapped tempo or a typed one, if there is
          // one. Handed over every frame — the reading carries its own
          // sequence number, so the clock can tell a new beat from a held one.
          beatClockRef.current.setExternal(nowMs, clockIsFixed() ? null : tempoRef?.current?.read(nowMs) ?? null);
          kickRef.current = beatClockRef.current.update(nowMs, heardAt, trust, Math.max(0, currentSettings.beatLead ?? 0));
          if (kickRef.current.kick) kickCountRef.current++;
          /*
            Sound learn's triggers, right after the clock has decided this
            frame's beat, so a trigger on the kick and the plate's own kick
            reactions are promised the same beat by the same clock
            (`soundLearn.ts`). Paused, the show hears nothing: the engine is
            handed no reading and forgets its patterns, so nothing fires until
            the music is back and has been heard again.
          */
          /*
            The song's shape, on the reading's own clock (the page's seconds
            live, the song's in a render), and on from the last reading by the
            frame's length while there is none, so its quiet timer runs.
            Paused, it hears nothing, as sound learn does.
          */
          const heard = isActiveRef.current ? currentAudioData?.features ?? null : null;
          songClockRef.current = heard ? heard.time : songClockRef.current + realDt;
          const songEvents = songShapeRef.current.update(heard, songClockRef.current);
          barGridRef.current.update(heard, songClockRef.current);
          for (const e of songEvents) {
            songEventsRef.current.push({ ...e, seq: ++songSeqRef.current });
            if (songEventsRef.current.length > 16) songEventsRef.current.shift();
          }
          const learned = soundBindingsRef.current;
          if (learned && learned.length > 0) {
            const clock = beatClockRef.current;
            const fired = soundLearnRef.current.step(nowMs, heard, {
              period: clock.period,
              nextBeat: clock.nextBeat,
              locked: clock.isLocked(nowMs, trust),
              leadMs: Math.max(0, currentSettings.beatLead ?? 0),
            }, learned, songEvents);
            for (const f of fired) onSoundTriggerRef.current?.(f.binding);
          }
          /*
            Soap Bursts: with Soap Flow up, a drop of soap lands on the beat
            somewhere on the plate and the Marangoni flow blows the dye out
            from it (docs/physics-plan.md). The dial is how often: at full,
            most kicks; with no beat, every couple of seconds. A performer's
            control that does something on any look, rather than waiting for
            the look to have poured soap of its own.
          */
          const soapDial = currentSettings.surfactantFlow ?? 0;
          const leadSolver = fluidsRef.current[0]?.gpu;
          if (soapDial > 0.001 && leadSolver?.addMix && isActiveRef.current) {
            const beat = kickRef.current.kick && DICE.music.float() < 0.25 + 0.7 * soapDial;
            const idle = nowMs - soapAtRef.current > (2600 - 1800 * soapDial);
            if ((beat || idle) && !(window as any).__bottleTest) {
              soapAtRef.current = nowMs;
              leadSolver.addMix(0.15 + DICE.music.float() * 0.7, 0.15 + DICE.music.float() * 0.7, 0.03 + 0.04 * DICE.music.float(), { soap: 1 });
            }
          }
        }

        // Dynamic speed — settings only, never audio energy (prevents clock-driven jumps)
        let dynamicSpeed = 0.05;
        dynamicSpeed += currentSettings.platePressure * 0.02;
        dynamicSpeed += currentSettings.airVelocity * 0.01;
        dynamicSpeed += currentSettings.automateRate * 0.01;
        let speedMultiplier = currentSettings.globalSpeed / 0.05;
        if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
        dynamicSpeed *= speedMultiplier;
        /*
          The music's pace (lib/tempoPace.ts): the look's speed pulled toward
          what the track asks for, by Tempo Sync, and harder under Random
          Evolve. The tempo comes from the beat clock once it has locked, or
          from a clock, tap or typed tempo; the loudness is averaged over
          about eight seconds. The result is slewed over three, so the plate
          eases into a new song rather than jumping to it.
        */
        {
          const clock = beatClockRef.current;
          const heard = clock.period > 0 && clock.confidence >= 0.5 ? 60000 / clock.period : 0;
          // The desk's tempo (a clock, a tap, a typed number) is a live input
          // and a render does not follow it: its pace is the song's own, heard.
          const bpm = (clockIsFixed() ? 0 : tempoRef?.current?.bpm) || heard;
          const energy = currentAudioData ? Math.min(1, currentAudioData.energy) : 0;
          loudnessRef.current += (energy - loudnessRef.current) * (1 - Math.exp(-realDt / 8));
          const playing = isActiveRef.current && !!currentAudioData && loudnessRef.current > 0.01;
          const want = tempoMultiplier(lookSpeed(currentSettings), musicPace(bpm, loudnessRef.current, playing),
            currentSettings.tempoSync ?? 0.5, isAutomatedRef.current);
          tempoMulRef.current += (want - tempoMulRef.current) * (1 - Math.exp(-realDt / 3));
          for (const f of fluidsRef.current) if (f) f.tempoMul = tempoMulRef.current;
        }
        dynamicSpeed *= tempoMulRef.current;
        const timeMultiplier = dynamicSpeed * 20.0;

        /*
          The phrase, once a frame, before anything reads it.

          On wall-clock seconds rather than solver steps, because it is about
          how the show feels over the seconds a person watches rather than
          about how far the liquid has been pushed. Paused, it holds where it
          is instead of running on in the dark and coming back somewhere else.
        */
        // The LFOs, on the bar rather than on the second: see `modulators.ts`.
        if (isActiveRef.current) modRef.current.step(realDt, clockIsFixed() ? 0 : tempoRef?.current?.bpm ?? 0);

        // Followed while paused too, so a sequence stopped in the dark still
        // brings the light back up on a paused plate.
        paceNowRef.current = approachPace(paceNowRef.current, paceTargetRef.current, realDt);
        frameBubblesRef.current = currentSettings.bubbles ?? 0;
        if (isActiveRef.current) {
          const phrased = phrasingRef.current.step(
            realDt,
            currentSettings.surge ?? 0,
            currentAudioData ? Math.min(1, currentAudioData.energy) : 0,
          );
          phraseRef.current = phrased;
          for (const f of fluidsRef.current) if (f) {
            f.phrase = phraseRef.current; f.dtSeconds = simStepS;
            f.paceMul = paceNowRef.current.activity;
            f.dropHeight = currentSettings.dropHeight ?? 0;
            f.dropFingering = currentSettings.fingering ?? 0;
          }
        }

        if (isActiveRef.current) {
          simulationTimeRef.current += realDt * timeMultiplier;
          wanderClockRef.current += realDt;
        }
        const time = simulationTimeRef.current;

        // How many solver steps this frame owes, from wall-clock time. When a
        // step is already most of a frame, catching up would only turn one
        // slow frame into a run of them — better to let the show run a little
        // slow than to stutter.
        //
        // On the GPU path a step's JavaScript cost is only its submission, well
        // under a millisecond, so that measure never saw the GPU falling behind:
        // every slow frame owed the full four steps per layer, which made the
        // next frame slower still. Measured on an M4 with two layers at 512²:
        // 28 fps, running two steps a frame. The frame interval is what says
        // the GPU is behind, so it caps the catch-up too — except under ?warp,
        // where running ahead of the clock is the point.
        const frameMsNow = governorRef.current?.frameMs ?? 16.7;
        const behind = SIM_MAX_CATCHUP > 4 ? SIM_MAX_CATCHUP : frameMsNow > 40 ? 1 : frameMsNow > 24 ? 2 : SIM_MAX_CATCHUP;
        const catchUp = Math.min(behind, simMsRef.current > 10 ? 1 : simMsRef.current > 6 ? Math.min(2, SIM_MAX_CATCHUP) : SIM_MAX_CATCHUP);
        catchUpRef.current = catchUp;
        simAccumRef.current = Math.min(simAccumRef.current + realDt, simStepS * catchUp);
        let simSteps = Math.floor(simAccumRef.current / simStepS);
        simAccumRef.current -= simSteps * simStepS;
        if (rendering) {
          /*
            A render's steps are counted, not measured: frame i is owed the
            steps between floor(i·rate/fps) and floor((i+1)·rate/fps), in
            integers. The accumulator above works in floating seconds, where
            1/60 + 1/60 can floor to one step and then three, a judder a film
            would keep; and its catch-up cap is set from how busy the machine
            is, which a render must never depend on.
          */
          const i = rendering.frame;
          simSteps = Math.floor(((i + 1) * rendering.stepRate) / rendering.fps) - Math.floor((i * rendering.stepRate) / rendering.fps);
          simAccumRef.current = 0;
        }
        stepsThisFrame = simSteps;
        /*
          The same elapsed time, counted in sixtieths of a second (H2b).

          A handful of things downstream were written when a step was always
          1/60 s and so count steps where they mean time: the drain's
          progress, and the chemistry's growth rate and deposit. Left alone
          they change pace the moment the governor lowers the rate — the
          drain finishing a third faster, the reaction growing two thirds as
          quickly — which is a look changing because a machine got busy.

          This is `simSteps` exactly while the loop runs at sixty, so at the
          default nothing downstream sees any difference at all.
        */
        const sixtieths = simSteps * simStepS * 60;

        // How many steps a second that is actually producing.
        //
        // The cap above is the one thing in the loop that trades the show's
        // speed for a smooth frame, and it does it silently: when a step costs
        // more than a frame's budget the plate advances less than a second of
        // liquid per second of wall clock, and every frame still arrives on
        // time. A frame rate cannot show that — 15 fps with four steps a frame
        // and 15 fps with one are the same number and a quarter of the motion.
        // So measure the rate directly and report it next to the frame rate.
        if (realDt > 0) {
          const k = 1 - Math.exp(-realDt / 1.5);
          stepsPerSecRef.current += (simSteps / realDt - stepsPerSecRef.current) * k;
        }

        // ── Drain animation ────────────────────────────────────
        if (drainTriggerRef.current > lastDrainTrigger.current) {
          lastDrainTrigger.current = drainTriggerRef.current;
          drainFrameRef.current = 1;
          macroCamRef.current.reset();
          bubblesRef.current.clear();
          harmonyRef.current = harmonyLockRef.current ?? (presetContractRef.current ? harmonyFromContract(presetContractRef.current, (currentSettings.hueJourney ?? 0) > 0) : pickHarmony()); // fresh palette after drain
        }
        if (drainFrameRef.current > 0) {
          const DRAIN_FRAMES = 50;
          const frame = drainFrameRef.current;
          const t = frame / DRAIN_FRAMES;
          const pull = Math.pow(t, 0.4) * 4.0;
          const dcx = GRID_SIZE / 2, dcy = GRID_SIZE / 2;

          for (const af of fluidsRef.current) {
            if (af.gpu) { af.gpu.drainStep(t); continue; }

            // 1. Set drain velocity field (inward spiral)
            for (let j = 1; j < GRID_SIZE - 1; j++) {
              for (let i = 1; i < GRID_SIZE - 1; i++) {
                const idx = i + j * GRID_SIZE;
                const dx = dcx - i, dy = dcy - j;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const inward = pull * (1 + dist / 50);
                const swirl = pull * 0.7 * (1 - t * 0.5);
                af.vx[idx] = (dx / dist) * inward + (-dy / dist) * swirl;
                af.vy[idx] = (dy / dist) * inward + ( dx / dist) * swirl;
              }
            }

            // 2. Semi-lagrangian advection (backtrace through drain velocity)
            af.s.set(af.density);
            af.sR.set(af.densityR);
            af.sG.set(af.densityG);
            af.sB.set(af.densityB);

            for (let j = 1; j < GRID_SIZE - 1; j++) {
              for (let i = 1; i < GRID_SIZE - 1; i++) {
                const idx = i + j * GRID_SIZE;
                const srcX = Math.max(1, Math.min(GRID_SIZE - 2, i - af.vx[idx] * 0.3));
                const srcY = Math.max(1, Math.min(GRID_SIZE - 2, j - af.vy[idx] * 0.3));
                const i0 = Math.floor(srcX), j0 = Math.floor(srcY);
                const i1 = Math.min(GRID_SIZE - 2, i0 + 1), j1 = Math.min(GRID_SIZE - 2, j0 + 1);
                const sx = srcX - i0, sy = srcY - j0;
                const w00 = (1 - sx) * (1 - sy), w10 = sx * (1 - sy), w01 = (1 - sx) * sy, w11 = sx * sy;
                const idx00 = i0 + j0 * GRID_SIZE, idx10 = i1 + j0 * GRID_SIZE;
                const idx01 = i0 + j1 * GRID_SIZE, idx11 = i1 + j1 * GRID_SIZE;
                af.density[idx]  = af.s[idx00]  * w00 + af.s[idx10]  * w10 + af.s[idx01]  * w01 + af.s[idx11]  * w11;
                af.densityR[idx] = af.sR[idx00] * w00 + af.sR[idx10] * w10 + af.sR[idx01] * w01 + af.sR[idx11] * w11;
                af.densityG[idx] = af.sG[idx00] * w00 + af.sG[idx10] * w10 + af.sG[idx01] * w01 + af.sG[idx11] * w11;
                af.densityB[idx] = af.sB[idx00] * w00 + af.sB[idx10] * w10 + af.sB[idx01] * w01 + af.sB[idx11] * w11;
              }
            }

            // 3. Evaporate
            const evapRate = 0.03 + t * t * 0.35;
            for (let idx = 0; idx < GRID_AREA; idx++) {
              af.density[idx]  *= (1 - evapRate);
              af.densityR[idx] *= (1 - evapRate);
              af.densityG[idx] *= (1 - evapRate);
              af.densityB[idx] *= (1 - evapRate);
            }
          }

          // Sixtieths, not steps: `DRAIN_FRAMES` is five sixths of a second and
          // has to stay five sixths of a second at any rate. The floor this
          // used to carry made a frame that took no step advance the drain
          // anyway, which at thirty steps on a 60 Hz screen finished it a
          // third early.
          drainFrameRef.current += sixtieths;
          if (drainFrameRef.current > DRAIN_FRAMES) {
            for (const af of fluidsRef.current) af.clearAll();
            drainFrameRef.current = 0;
          }
        }

        // ── Clear trigger ──────────────────────────────────────
        if (clearTriggerRef.current > lastClearTrigger.current) {
          lastClearTrigger.current = clearTriggerRef.current;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af) af.clearAll();
          if (activeLayerRef.current === 0) bubblesRef.current.clear();
        }

        // ── Solver engine ──────────────────────────────────────
        // The GPU solver runs the same scheme at 2-4x the grid; the CPU solver
        // stays as the fallback for contexts without float render targets.
        const governor = governorRef.current!;
        const governed = currentSettings.simResolution === undefined || currentSettings.simResolution === 'auto';
        // `renderScale()` is the `?dpr=` diagnostic override and 1 on every
        // real visit. It multiplies the rung rather than replacing it so the
        // governor keeps choosing, and keeps reporting what it chose.
        const wantDpr = (governed ? governor.rung.dpr : 1) * renderScale();
        if (wantDpr !== dprRef.current) {
          dprRef.current = wantDpr;
          renderer?.resize();
        }
        const wantRes = renderer ? (rendering?.grid ?? resolveSimResolution(currentSettings.simResolution, governor, renderer.maxTexture)) : 0;
        for (const fluid of fluidsRef.current) {
          if (renderer && !renderer.attachSolver(fluid, gpuSupportedRef.current === false ? 0 : wantRes)) {
            gpuSupportedRef.current = false;
          }
        }
        /*
          The look's ferrofluid, laid on a new solver only when the plate's
          own could not come with it.

          The governor rebuilds the solver a few seconds into a show when it
          moves the grid. The dye was carried across that and the phase was
          not (Magnet Garden had its ferrofluid at 8 s and a bare gold pool
          by 20), so every new solver got the look's ring again while
          Ferrofluid was up. That put back the wrong ferrofluid: a pool
          dragged into a shape came back as the ring, and ferrofluid poured
          from the bottle on a look with none (Classic) came back as a ring
          nobody poured, a different amount in a different place.

          Now the old solver hands its ferrofluid to the new one, resampled
          by area so the amount is the same (handOver and takeOver in
          gpu/fluid.ts, PLAN 9w), and a solver that opened on that carry is
          left alone, ferrofluid or none: a plate that had none had none
          poured, and a new grid lays nothing on it (which `npm run magnet`
          asks). The look's pour is for a solver that opened on nothing it
          could take: the first one, for a look laid before it existed
          (phasePending), or one after the device was lost, whose plate
          comes back from the CPU's copy and whose ferrofluid never had one.
        */
        const lead = fluidsRef.current[0];
        const leadGpu = lead?.gpu ?? null;
        if (leadGpu !== phaseSolverRef.current) {
          phaseSolverRef.current = leadGpu;
          // Not over a hand's pour (phaseByHand): the look's ring would land where nobody poured (PLAN 15i).
          if (leadGpu?.addPhase && (phasePendingRef.current
            || ((settingsRef.current.phaseAmount ?? 0) > 0.002 && !lead?.openedOnCarry && !phaseByHandRef.current))) {
            phasePendingRef.current = false;
            layPhaseRef.current();
          }
        }
        /*
          The reactions start themselves (docs/physics-plan.md).

          BZ: a broken wave, which is how every spiral in a dish of it
          begins. A disc of activator with a wake of oxidised catalyst on one
          side cannot spread into its own wake, so its two free ends curl
          round and keep turning. A new one every half minute or so, where
          the dish has gone quiet, as a stray bubble or speck does in a real
          one. Liesegang: the outer electrolyte poured at the plate's centre
          and kept topped up, a reservoir the rings grow out from.
        */
        {
          const g = leadGpu;
          const s = settingsRef.current;
          const nowMs = showNow();
          const live = g?.chemistryLive;
          if (g?.addRxn && (s.bzReaction ?? 0) > 0.001 && (!live?.rxn || nowMs - bzSeedAtRef.current > 30000)) {
            bzSeedAtRef.current = nowMs;
            for (let k = 0; k < (live?.rxn ? 1 : 3); k++) {
              const x = 0.2 + DICE.chem.float() * 0.6, y = 0.2 + DICE.chem.float() * 0.6, a = DICE.chem.angle();
              g.addRxn(x, y, 0.035, { bz: 0.9 });
              g.addRxn(x + Math.cos(a) * 0.03, y + Math.sin(a) * 0.03, 0.035, { bzWake: 0.9 });
            }
          }
          if (g?.addLiesegang && (s.liesegang ?? 0) > 0.001 && nowMs - liesSeedAtRef.current > 1000) {
            liesSeedAtRef.current = nowMs;
            g.addLiesegang(0.5, 0.5, 0.06, 4);
          }
        }
        /*
          Ferrofluid turned up on a plate that has none: pour it. The phase
          was only ever laid with a look, so the Ferrofluid slider raised
          mid-show changed the setting and left the plate bare.
        */
        {
          const amt = settingsRef.current.phaseAmount ?? 0;
          // Not with the Ferrofluid bottle in the hand: that one goes where
          // it is dropped, not over the whole plate. It turns the amount up
          // only once it is poured (below), so the lead plate is bare then
          // only when the hand poured on the back plate. (The Magnet needs
          // no exception: neither picking nor holding it turns the amount up
          // unless there is ferrofluid in the solver already: phaseIsLive.)
          const pouringOwn = (selectedLiquidRef.current?.behaviour?.magnetic ?? 0) > 0;
          if (amt > 0.002 && phaseAmountRef.current <= 0.002 && leadGpu?.addPhase
              && !(leadGpu as { phaseIsLive?: boolean }).phaseIsLive && !pouringOwn) {
            layPhaseRef.current();
          }
          phaseAmountRef.current = amt;
          /*
            And the bottle's ferrofluid drawn once it is poured. Picking the
            Ferrofluid bottle turned the amount up, and with it up a new
            solver or the next look laid the look's ring with nothing poured
            (App's ferrofluidPoured). Now the amount rises when a hand has
            laid from the bottle in the last second and the phase is in the
            solver (phaseIsLive, on whichever plate it went to), so it never
            rises over a bare plate and the pour above cannot fire for it.
          */
          const nowMs = showNow();
          if (amt <= 0.002 && nowMs - ferroPouredAtRef.current < 1000 && nowMs - ferroToldRef.current > 250
              && fluidsRef.current.some((f) => (f?.gpu as { phaseIsLive?: boolean } | undefined)?.phaseIsLive)) {
            ferroToldRef.current = nowMs;
            onFerrofluidPouredRef.current?.();
          }
        }
        {
          const lead = fluidsRef.current[0];
          const gpuUnavailable = wantRes > 0 && gpuSupportedRef.current === false;
          const status: EngineStatus = {
            label: lead?.gpu
              ? `WebGPU · ${lead.gpu.N}² · ${dprRef.current.toFixed(1)}x${postLevelLabel(governorRef.current)}`
              : `WebGPU · ${gpuUnavailable ? 'unavailable' : 'starting'}`,
            engine: lead?.gpu ? 'webgpu' : 'none',
            grid: lead?.gpu ? lead.gpu.N : 0,
            dpr: dprRef.current,
            tier, gpu: renderer?.info.gpuClass ?? 'weak', renderer: renderer?.info.renderer ?? '',
            governed,
            steppedDown: governed && governor.steppedDown,
            gpuUnavailable,
            frameMs: governor.frameMs,
            simMs: simMsRef.current,
            layers: fluidsRef.current.length,
            stepsPerSec: stepsPerSecRef.current,
            stepRate,
            // The solver's share of a frame is one step's cost times the steps
            // that frame owed; what is left is everything that is not the
            // solver, and does not fall when the grid does.
            otherMs: Math.max(0, governor.frameMs - simMsRef.current * stepsPerSecRef.current * (governor.frameMs / 1000)),
          };
          const prev = engineStatusRef.current;
          // The label changes rarely; the frame time ticks over once a second.
          if (!prev || prev.label !== status.label || prev.steppedDown !== status.steppedDown || now - engineStatusAtRef.current > 1) {
            engineStatusRef.current = status;
            engineStatusAtRef.current = now;
            onEngineStatusRef.current?.(status);
          }
        }

        // ── Chemistry ─────────────────────────────────────────
        // Boyle's bench: a reaction-diffusion field grows coral and cells in
        // place and deposits dye where it is active; the flow then carries the
        // dye off while the pattern keeps growing underneath.
        {
          const chemAmt = Math.max(0, Math.min(1, currentSettings.chemistry ?? 0));
          const lead = fluidsRef.current[0];
          if (chemAmt > 0 && lead && isActiveRef.current && drainFrameRef.current === 0) {
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            const g = leadGpu;
            if (g && g.stepChemistry) {
              if (!(g as any).chemLive || (bass01 > 0.5 && DICE.chem.float() < 0.12) || DICE.chem.float() < 0.004) {
                g.seedChemistry?.(0.15 + DICE.chem.float() * 0.7, 0.15 + DICE.chem.float() * 0.7, 0.01 + DICE.chem.float() * 0.016);
              }
              // The dividing regime grows at a pace a show can watch; coral is slower than a set.
              const p = currentSettings.chemistryPattern ?? 0;
              const feed = 0.03 + p * 0.01;
              const kill = 0.055 + p * 0.005;
              const w = Math.pow(2, ((currentSettings.chemistryWidth ?? 0.5) - 0.5) * 4);
              g.stepChemistry?.(Math.max(1, Math.min(10, Math.round(sixtieths * 2.5))), feed, kill, 0.16 * w, 0.08 * w);
              const c = harmonyCycle(harmonyRef.current, time * 0.08);
              const amount = chemAmt * 0.02 * sixtieths;
              g.depositChemistry?.(g.chem.read, amount, [c.r, c.g, c.b], 0.22);
            }
          }
        }

        // ── Fixed-timestep phase ───────────────────────────────
        // Injection and the solver share one loop so dye-per-second, air
        // bursts and beat rings stay constant whatever the frame rate is.
        // ── The room ───────────────────────────────────────────
        // One verdict per frame on whether the camera has anything to say, so
        // every solver step this frame stirs from the same reading rather than
        // re-deciding. A reading that has stopped arriving is not the room.
        const roomDrive = Math.max(0, Math.min(1, currentSettings.sceneDrive ?? 0));
        const roomHands = Math.max(0, Math.min(1, currentSettings.sceneHands ?? 0));
        const roomFresh = (() => {
          if ((roomDrive <= 0 && roomHands <= 0) || !isActiveRef.current || drainFrameRef.current > 0) return null;
          const r = sceneRef?.current ?? null;
          if (!r || !r.ready || clockIsFixed()) return null;
          return performance.now() - r.at < ROOM_STALE_MS ? r : null;
        })();
        const roomReading = roomDrive > 0 ? roomFresh : null;

        /*
          The film, as a force.

          Until now the projector was a slide: light through the dye and
          nothing else. A film has motion in it — a pan, a crowd, a cut — and
          the same analysis that reads a room reads a reel, so the same stir
          puts it in the liquid.

          Read once a frame, like the room's, and only when something is
          asking for it: with Film Drive at zero the sensor is not even
          running, so a film that is only a slide costs exactly what it
          always did.
        */
        const filmDrive = Math.max(0, Math.min(1, currentSettings.filmDrive ?? 0));
        const filmReading = (() => {
          if (filmDrive <= 0 || !isActiveRef.current || drainFrameRef.current > 0) return null;
          const r = filmSenseRef?.current ?? null;
          if (!r || !r.ready || clockIsFixed()) return null;
          return performance.now() - r.at < ROOM_STALE_MS ? r : null;
        })();

        // ── The room's hands ───────────────────────────────────
        // Everyone the sensor is holding is a projectionist. Standing still is
        // a palm on the top glass, so the film thins exactly as the Press tool
        // does, and lifts into spokes (with Fingering) when they move on; moving is a puff along
        // the way they are going; arriving is a drop of their own dye.
        //
        // The dye is the point. A track's id picks from the working harmony,
        // which is already the preset's palette contract narrowed by whatever
        // the sequencer and the hue journey have done to it, so a person gets
        // a colour that is stable across a set and never one the preset was
        // not allowed. Lose the track and they come back as someone else,
        // which reads as a new dancer rather than as a fault.
        //
        // Once per reading, not once per frame: the sensor runs at 20 Hz and a
        // 120 Hz machine should not press six times as hard as a 20 Hz one.
        if (roomFresh && roomHands > 0 && roomFresh.at !== lastHandsAtRef.current) {
          lastHandsAtRef.current = roomFresh.at;
          const harmony = harmonyRef.current;
          for (const p of roomFresh.people) {
            if (p.age < HAND_SETTLE && !p.fresh) continue;
            const speed = Math.hypot(p.vx, p.vy);
            const size = Math.min(1, p.area * 8);
            const color = harmony.length ? PALETTE[harmony[p.id % harmony.length]].hex : undefined;

            if (p.fresh) {
              performGesture({ tool: 'drop', x: p.x, y: p.y, color, layer: 0, amount: roomHands * (0.35 + 0.4 * size) });
              continue;
            }
            if (p.still > HAND_STILL_HOLD) {
              performGesture({ tool: 'press', x: p.x, y: p.y, layer: 0, amount: roomHands * (0.3 + 0.7 * size) });
            } else if (speed > HAND_MOVING) {
              performGesture({
                tool: 'blow', x: p.x, y: p.y,
                dx: p.vx / speed, dy: p.vy / speed,
                layer: 0, amount: roomHands * Math.min(1, 0.25 + speed * 2.5),
              });
            }
          }
        }


        // ── Video Pour (Transparency & Optical Flow) ──


        if (videoPourRef.current && !videoPourRef.current.paused && videoPourRef.current.readyState >= 2) {


          const v = videoPourRef.current;


          const fluid = fluidsRef.current[0];


          if (fluid) {


            const S = fluid.size;


            if (!videoFlowCanvasRef.current) {


              const c = document.createElement('canvas');


              c.width = S; c.height = S;


              videoFlowCanvasRef.current = c;


              videoFlowCtxRef.current = c.getContext('2d', { willReadFrequently: true });


            }


            const ctx = videoFlowCtxRef.current;


            if (ctx) {


              ctx.drawImage(v, 0, 0, S, S);


              const imgData = ctx.getImageData(0, 0, S, S);


              const data = imgData.data;


              const prev = videoFlowPrevRef.current;


              const flowStrength = 0.8;


              


              for (let y = 1; y < S - 1; y++) {


                for (let x = 1; x < S - 1; x++) {


                  const i = (y * S + x) * 4;


                  const r = data[i], g = data[i+1], b = data[i+2];


                  const lum = 0.299 * r + 0.587 * g + 0.114 * b;


                  


                  // Luma-key transparency: Dark pixels are ignored


                  if (lum > 15) {


                    const alpha = lum / 255.0;


                    fluid.addDensity(x, y, alpha * 0.15, r/255.0, g/255.0, b/255.0);


                  }


                  


                  // Optical Flow Velocity


                  if (prev) {


                    const prevLum = 0.299 * prev[i] + 0.587 * prev[i+1] + 0.114 * prev[i+2];


                    const diff = lum - prevLum;


                    if (Math.abs(diff) > 10) {


                      const lumX = (0.299 * data[i+4] + 0.587 * data[i+5] + 0.114 * data[i+6]) - 


                                   (0.299 * data[i-4] + 0.587 * data[i-3] + 0.114 * data[i-2]);


                      const lumY = (0.299 * data[i + S*4] + 0.587 * data[i + S*4 + 1] + 0.114 * data[i + S*4 + 2]) - 


                                   (0.299 * data[i - S*4] + 0.587 * data[i - S*4 + 1] + 0.114 * data[i - S*4 + 2]);


                      const gradMag2 = lumX * lumX + lumY * lumY;


                      if (gradMag2 > 1) {


                        // Flow velocity formula: - (dI/dt) * Grad(I) / |Grad(I)|^2


                        const vx = -diff * lumX / gradMag2 * flowStrength;


                        const vy = -diff * lumY / gradMag2 * flowStrength;


                        fluid.addVelocity(x, y, vx, vy);


                      }


                    }


                  }


                }


              }


              videoFlowPrevRef.current = new Uint8ClampedArray(data);


            }


          }


        }


        for (let simStep = 0; simStep < simSteps; simStep++) {
          // The room stirs the lead plate: it is ambient, not a tool, so it
          // goes where the show is rather than onto whichever layer happens to
          // be selected.
          if (roomReading || filmReading) {
            const lead = fluidsRef.current[0];
            if (lead) {
              // Both, if both are asked for. They are separate fields with
              // separate baselines and the per-cell cap is per stir, so two
              // sources can add more than one — which is the point of turning
              // the second one up.
              if (roomReading) roomStirRef.current.apply(lead.vx, lead.vy, GRID_SIZE, roomReading, roomDrive, simStepS);
              if (filmReading) filmStirRef.current.apply(lead.vx, lead.vy, GRID_SIZE, filmReading, filmDrive, simStepS);
              lead.markDirty();
            }
          }

          // ── Manual injection ───────────────────────────────────
          /*
            The dropper's clock: the steps a hand has held it, 0 on the step
            it lands (so every press lets go of a drop at once) and counted up
            after each step it is held, below.

            It was counted up here, before the hands, and only "if this is not
            a frame's first step, or the clock has already started", so that
            a press's first step read 0. But a frame that runs one step has no
            other step, so a clock still at 0 stayed at 0 for as long as the
            frames ran one step each, which is every frame of a plate stepping
            at the display's own rate: a held Drop with Drop Height up let go
            of a splashing drop on every step instead of every tenth, until the
            first frame that happened to owe two. Counted after use, the first
            step is 0 and the next is 1 whatever the frames do.
          */
          if (!isMouseDownRef.current) {
            dropClockRef.current = 0; strokeLastRef.current = null; blowDirRef.current = undefined;
            if (dropLaidRef.current.steps > 0) dropLaidRef.current = freshLaid();
          }
          /*
            Every hand on the glass: the pointer, then each other finger on a
            touch screen (extraHandsRef). The same tool at the same Amount for
            all of them, each at its own place with its own stroke and its own
            drop clock, which is what three fingers on a real dish do. The
            pointer's stroke is written back to its ref for the next step; the
            other fingers' live in their own entries.
          */
          type Hand = { x: number; y: number; stroke: { x: number; y: number } | null; clock: number; laid: DropLaid; magnetAt?: number; blowDir?: BlowDir };
          const hands: { hand: Hand; primary: boolean }[] = [];
          if (isMouseDownRef.current) hands.push({ hand: { ...mousePosRef.current, stroke: strokeLastRef.current, clock: dropClockRef.current, laid: dropLaidRef.current, blowDir: blowDirRef.current }, primary: true });
          for (const h of extraHandsRef.current.values()) hands.push({ hand: h, primary: false });
          for (const { hand, primary } of hands) {
            /*
              Nothing is laid while the plate drains. But a magnet lays
              nothing: it is where the hand holds it, and the drain does not
              take it out of the hand. Breaking before it, a hold during the
              drain never reached magnetFor (below), so the look was never
              given its magnet and let go of there was none (PLAN.md 9s, left
              open by #227).
            */
            if (drainFrameRef.current !== 0) {
              // On the plate only, as below, and each finger as below too.
              const on = hand.x > 0 && hand.x < GRID_SIZE - 1 && hand.y > 0 && hand.y < GRID_SIZE - 1;
              if (!on || activeToolRef.current !== 'magnet' || !fluidsRef.current[activeLayerRef.current]) continue;
              if (primary) magnetHandRef.current = { x: hand.x / GRID_SIZE, y: hand.y / GRID_SIZE, at: showNow() };
              else hand.magnetAt = showNow();
              continue;
            }
            const { x, y } = hand;
            const af = fluidsRef.current[activeLayerRef.current];
            if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
              const tool = activeToolRef.current;
              // The Spin tool turns the dish (the pointer handlers and the
              // frame's flywheel); it lays, presses and stirs nothing.
              if (tool === 'spin') continue;
              const liq = selectedLiquidRef.current;
              if (LAYING_TOOLS.has(tool) && (liq?.behaviour?.magnetic ?? 0) > 0) handPoursFerro(af);
              const strokeFrom = hand.stroke ?? { x, y };
              const strokeDx = x - strokeFrom.x, strokeDy = y - strokeFrom.y;
              hand.stroke = { x, y };
              // The liquid's own colour through any dye in it; a clear liquid with none lays no colour (lib/liquidColour.ts).
              const poured = pourTint(liq);
              const rgb = poured.rgb;
              const heat = liq?.heatAmount ?? 0.05;
              // The Amount set for this tool (1 is what it always did).
              const kRaw = toolAmountRef.current;
              const k = kRaw * kRaw;
              // Its square root for a push and a reach: twice the dye is not twice the shove, and a drop with twice the dye in it covers twice the area.
              const kSoft = Math.sqrt(k);
              // Whatever lands on the lead plate lands on its bubbles too:
              // dye bursts the one under it and shoves the rest, air shoves.
              if (activeLayerRef.current === 0 && (currentSettings.bubbles ?? 0) > 0) {
                if (tool !== 'magnet') bubblesRef.current.disturb(x, y, (tool === 'blow' || tool === 'press' ? 5 : tool === 'spray' ? 6 : 3) * kSoft * GRID_SCALE, tool === 'blow' || tool === 'press' ? 'air' : 'dye', kSoft);
              }
              if (activeLayerRef.current === 0 && tool !== 'press' && tool !== 'magnet' && (currentSettings.beads ?? 0) > 0 && gestureFrameRef.current % 3 === 0) beadsRef.current.disturb(x, y, 4 * GRID_SCALE, 0.5);

              // Feed the performance recorder (~15 Hz while painting)
              if (primary && onManualGestureRef.current && gestureFrameRef.current++ % 4 === 0) {
                const gmx = mousePosRef.current.x - (lastMousePosRef.current?.x ?? x);
                const gmy = mousePosRef.current.y - (lastMousePosRef.current?.y ?? y);
                const gLen = Math.sqrt(gmx * gmx + gmy * gmy) || 1;
                onManualGestureRef.current({
                  tool,
                  x: x / GRID_SIZE,
                  y: y / GRID_SIZE,
                  dx: gmx / gLen,
                  dy: gmy / gLen,
                  // What was laid, not the bottle's dye (laidColour), so a take plays back as performed.
                  ...(tool === 'blow' || tool === 'press' ? {} : laidColour(liq)),
                });
              }

              if (tool === 'magnet') {
                /*
                  Nothing is laid: the magnet goes where the hand is. On a
                  touch screen every finger holds one (up to four), which is
                  what a hand does with a few small magnets under a dish:
                  each stands its own hedgehog of spikes and the pool between
                  them is pulled apart into fingers. The first finger's is the
                  magnet the rest of the show knows (magnetFor, the harness);
                  the others are noted on their own hands and go to the solver
                  with it.
                */
                if (primary) magnetHandRef.current = { x: x / GRID_SIZE, y: y / GRID_SIZE, at: showNow() };
                else hand.magnetAt = showNow();
              } else if (tool === 'press') {
                // A hand on the top glass: the film thins under the palm and
                // the dye spreads out in a ring, the rhythm plate worked by hand.
                const fg = currentSettings.fingering ?? 0;
                const pa = 0.004 * k;
                af.applySquish(x, y, 30, pa, fg, true);
                af.applySquish(x, y, 18, pa, fg);
                af.applySquish(x, y, 8, pa, fg);
                // And the liquid goes where a squeezed film sends it.
                const prR = 30;
                af.squeezeOut(x, y, prR * GRID_SCALE, pa);

                // The Photoscope (European School): Shearing/Twisting!
                // Twisting one slide against another tears the film into cellular structures.
                // We add a strong rotational velocity field within the press radius.
                const twistR = prR * GRID_SCALE;
                const twistAmount = 40.0 * pa * kSoft;
                for (let ddy = -twistR; ddy <= twistR; ddy++) {
                  for (let ddx = -twistR; ddx <= twistR; ddx++) {
                    const dd = Math.sqrt(ddx*ddx + ddy*ddy);
                    if (dd > twistR || dd < 0.1) continue;
                    const px = Math.floor(x + ddx);
                    const py = Math.floor(y + ddy);
                    if (px < 1 || px >= GRID_SIZE - 1 || py < 1 || py >= GRID_SIZE - 1) continue;
                    // Rotational velocity: (-dy, dx) normalized, stronger towards the center
                    const w = Math.pow(1 - dd/twistR, 2) * twistAmount;
                    af.addVelocity(px, py, (-ddy / dd) * w, (ddx / dd) * w);
                  }
                }
                
                if (activeLayerRef.current === 0) beadsRef.current.disturb(x, y, 18 * GRID_SCALE, 0.15);
              } else if (tool === 'blow') {
                /*
                  Held still on the lead plate, the Blow is a straw: one
                  bubble on the end of it, growing while the breath goes on,
                  its rim breaking into fingers and shedding a ring of small
                  ones (bubbles.ts, blow). Moving, it is the wind it was.
                */
                // One straw (bubbles.ts keeps a single straw bubble), so the
                // first finger blows it and any other finger is the wind.
                const still = Math.hypot(strokeDx, strokeDy) < 0.75;
                /*
                  And the ferrofluid, held or moved, straw or wind (PLAN.md
                  §9n). Moved, it pushes along the way the hand last went
                  (BlowDir): the stroke is nothing on every step after a
                  frame's first, and on a frame the pointer did not move, and
                  read afresh each step a slow drag swept then puffed then
                  swept, leaving a trench of holes and not a pushed tongue.
                */
                const now = performance.now();
                // The press counts as a move, with no direction (BLOW_STRAW_FRAMES).
                // The press step starts the frame count at 0 rather than counting itself.
                if (!still) hand.blowDir = { x: strokeDx, y: strokeDy, at: now, still: 0, moved: true };
                else if (!hand.blowDir) hand.blowDir = { x: 0, y: 0, at: now, still: 0, moved: false };
                else if (simStep === 0) hand.blowDir.still++;
                const going = now - hand.blowDir.at < BLOW_DIR_HOLD_MS ? hand.blowDir : null;
                const held = !going && hand.blowDir.still >= BLOW_STRAW_FRAMES;
                af.blowPhase(x, y, BLOW_RADIUS, BLOW_STRENGTH * k, going ? going.x : 0, going ? going.y : 0);
                /*
                  The straw only when the hand is held, not moved, by the same
                  clock the ferrofluid goes by and a few frames with no move
                  (BLOW_STRAW_FRAMES). Asked of `still` (no move this step), a
                  drag blew the straw on every step after a frame's first and
                  on every frame the pointer did not report a move, which is
                  most of them: a drag left a string of straw bubbles and ran
                  the wind a step a frame at best, so the wind's carry
                  (PLAN.md §15c) waited on the rare step that was both a wind
                  step and a fresh reading of the dye.
                */
                if (activeLayerRef.current === 0 && held && primary) {
                  bubblesRef.current.blow(x, y, simStepS, k);
                  blowStepsRef.current.straw++;
                  // Before the hand's first move: a press held, or a drag that blew a straw where it began (tools.mjs).
                  if (!hand.blowDir.moved) blowStepsRef.current.strawFirst++;
                } else {
                  // The wind: moving on a thin gap, the breath's air on the
                  // film, whose flow takes the colour, the oil and the
                  // ferrofluid the way the hand last went (PLAN.md §15g);
                  // held still, or off a thin gap, it carries them (§15c).
                  // It used to erase them.
                  /*
                    Along the way the hand last went until the hand is held,
                    not only for the 150 ms the ferrofluid's push keeps it
                    (BLOW_DIR_HOLD_MS). Between the two the wind was a puff,
                    and a puff carries the colour under the hand out onto a
                    ring a palm and more across: on a runner whose moves came
                    120 ms apart, a stroke's three or four puffs moved 80 to
                    106 of a pool of 210 to 244 out round the hand, which
                    near the pool's leading edge is backwards, and the
                    stroke out to the left moved the pool -0.26% against the
                    air's push (`npm run tools` on #300). A pointer that is
                    late is not a hand that stopped; a hand that stopped is
                    held within BLOW_STRAW_FRAMES and blows the straw, or on
                    a plate that is not the lead, the puff.
                  */
                  const aim = going ?? (hand.blowDir.moved && hand.blowDir.still < BLOW_STRAW_FRAMES ? hand.blowDir : null);
                  const carried = af.blowWind(x, y, BLOW_RADIUS, BLOW_STRENGTH * k, aim ? aim.x : 0, aim ? aim.y : 0);
                  blowStepsRef.current.carried += carried;
                  blowStepsRef.current.wind++;
                  if (going) blowStepsRef.current.directed++;
                  if (carried > 0) blowStepsRef.current.carries++;
                  // On a thin gap the moving wind is air on the film and carries nothing by hand (PLAN.md §15g).
                  if (af.lastBlowAired) blowStepsRef.current.aired++;
                  if (activeLayerRef.current === 0 && (currentSettings.bubbles ?? 0) > 0 && gestureFrameRef.current % 6 === 0) {
                    bubblesRef.current.spawn(x, y, 1.2 * GRID_SCALE, 2, 3 * GRID_SCALE);
                  }
                }

              } else if (tool === 'finger') {
                /*
                  A finger through the liquid: it carries what it touches and
                  loosens it.

                  The direction is the pointer's own motion since last frame,
                  the same way the directed blow takes its. A finger standing
                  still does nothing, which is right — you mix by moving.
                */
                af.fingerDrag(x, y, 7, Math.min(0.25, 0.09 * k), strokeDx, strokeDy);
                if (activeLayerRef.current === 0) beadsRef.current.disturb(x, y, 10 * GRID_SCALE, 0.25);

              } else if (tool === 'spray') {
                // Wide cone of fine mist — many small random particles in a radius
                const sprayR = 10 * GRID_SCALE * kSoft;
                const tint = bottleDye(liq) * poured.dose;
                for (let p = 0; p < 12; p++) {
                  const angle = DICE.hands.angle();
                  const dist = DICE.hands.float() * sprayR;
                  const px = Math.floor(x + Math.cos(angle) * dist);
                  const py = Math.floor(y + Math.sin(angle) * dist);
                  if (px < 1 || px >= GRID_SIZE - 1 || py < 1 || py >= GRID_SIZE - 1) continue;
                  const w = (1 - dist / sprayR) * 0.4 * k;
                  af.addDensity(px, py, w * tint, rgb.r, rgb.g, rgb.b);
                  if (heat > 0) af.addTemp(px, py, heat * w * 0.3);
                  // The liquid too, at the first point of the mist a step: one
                  // deposit a step, as a held Dropper makes (see layBottle).
                  if (p === 0) layBottle(af, px, py, bottleReach(liq, 1.5 * GRID_SCALE), liq, 1 - dist / sprayR);
                }

              } else if (tool === 'splatter') {
                // Fling droplets outward from cursor — random sizes, random directions
                // More droplets, not bigger ones, for a heavier hand.
                const flings = Math.max(1, Math.round(5 * k));
                const tint = bottleDye(liq) * poured.dose;
                for (let p = 0; p < flings; p++) {
                  const angle = DICE.hands.angle();
                  const flingDist = (3 + DICE.hands.float() * 15) * GRID_SCALE;
                  const px = Math.floor(x + Math.cos(angle) * flingDist);
                  const py = Math.floor(y + Math.sin(angle) * flingDist);
                  if (px < 2 || px >= GRID_SIZE - 2 || py < 2 || py >= GRID_SIZE - 2) continue;
                  const dropR = Math.round((1 + DICE.hands.int(3)) * GRID_SCALE);
                  const amt = 1.0 + DICE.hands.float() * 1.5;
                  for (let ddy = -dropR; ddy <= dropR; ddy++) {
                    for (let ddx = -dropR; ddx <= dropR; ddx++) {
                      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                      if (dd > dropR) continue;
                      const nx = px + ddx, ny = py + ddy;
                      if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                      const w = (1 - dd / dropR);
                      af.addDensity(nx, ny, amt * w * tint, rgb.r, rgb.g, rgb.b);
                    }
                  }
                  // The first droplet a step is the liquid as well as its colour.
                  if (p === 0) layBottle(af, px, py, bottleReach(liq, dropR), liq, k);
                  // Fling velocity outward
                  af.addVelocity(px, py, Math.cos(angle) * 0.5 * kSoft, Math.sin(angle) * 0.5 * kSoft);
                }

              } else if (tool === 'pour') {
                // Heavy thick stream — wide, dense, with downward velocity
                const pourR = Math.max(1, Math.round(4 * GRID_SCALE * kSoft));
                const amt = 2.0 * k * bottleDye(liq) * poured.dose;
                for (let ddy = -pourR; ddy <= pourR; ddy++) {
                  for (let ddx = -pourR; ddx <= pourR; ddx++) {
                    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dd > pourR) continue;
                    const nx = x + ddx, ny = y + ddy;
                    if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                    const w = (1 - dd / pourR) ** 1.5;
                    af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    /*
                      Spreading from where it lands. This pushed toward the
                      plate's +y as "downward gravity", but the camera looks
                      straight down: a stream poured from above lands and
                      runs outward, and any downhill is Gravity's, not the
                      pour's.
                    */
                    if (dd > 0) af.addVelocity(nx, ny, ddx / dd * 0.12 * w * kSoft, ddy / dd * 0.12 * w * kSoft);
                    if (heat > 0) af.addTemp(nx, ny, heat * w);
                  }
                }
                // The stream is the liquid, on the disc it lands on, as a held Dropper's is.
                layBottle(af, x, y, bottleReach(liq, pourR), liq, k);

              } else if (tool === 'streak') {
                // Thin high-velocity smear along mouse movement direction
                const mvx = strokeDx, mvy = strokeDy;
                const mvLen = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
                const streakLen = Math.min(12 * GRID_SCALE, Math.max(3, mvLen * 2));
                const nx_dir = mvx / mvLen, ny_dir = mvy / mvLen;
                const tint = bottleDye(liq) * poured.dose;
                for (let t = -streakLen; t <= streakLen; t += 0.8) {
                  const sx = Math.floor(x + nx_dir * t);
                  const sy = Math.floor(y + ny_dir * t);
                  if (sx < 1 || sx >= GRID_SIZE - 1 || sy < 1 || sy >= GRID_SIZE - 1) continue;
                  const w = 1.0 - Math.abs(t) / streakLen;
                  af.addDensity(sx, sy, 0.6 * w * k * tint, rgb.r, rgb.g, rgb.b);
                  af.addVelocity(sx, sy, nx_dir * 0.3 * w * kSoft, ny_dir * 0.3 * w * kSoft);
                }
                // The liquid under the middle of the smear: the hand moves every
                // step, so the discs it leaves are the stroke.
                layBottle(af, x, y, bottleReach(liq, 2 * GRID_SCALE), liq, k);

              } else if ((currentSettings.dropHeight ?? 0) > 0.02) {
                // The dropper held above the plate lets go of drops rather than
                // pouring a stream: one as the press lands, then one every
                // DROP_EVERY steps while it is held, each carrying the dye the
                // stream would have laid in that time and each landing with its
                // splash (autoInject's drop reads the height).
                hand.laid.steps++;
                if (hand.clock % DROP_EVERY === 0) {
                  const amt = (liq?.injectAmount ?? 0.8) * DROP_EVERY * k;
                  hand.laid.drops++;
                  hand.laid.dye += amt * poured.dose;
                  af.autoInject('drop', x, y, amt, rgb.r, rgb.g, rgb.b, 0.5, false, poured.dose);
                  if (heat > 0) af.addTemp(x, y, heat * 2);
                  if (liq?.behaviour) af.liquid.deposit(x, y, Math.round((liq.injectRadius ?? 3) * GRID_SCALE), liq.behaviour, k, DROP_EVERY * af.dtSeconds);
                }
              } else {
                // dropper (default)
                // Wider as well as denser: a held drop fills to the plate's
                // density ceiling in its middle, so more dye there alone would
                // not show; a drop with more in it spreads further.
                const r = Math.max(1, Math.round((liq?.injectRadius ?? 3) * GRID_SCALE * kSoft));
                const amt = (liq?.injectAmount ?? 0.8) * k * poured.dose;
                hand.laid.steps++;
                for (let dy = -r; dy <= r; dy++) {
                  for (let dx = -r; dx <= r; dx++) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                    const w = (1 - dist / r) ** 2;
                    hand.laid.dye += amt * w;
                    af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    if (heat > 0) af.addTemp(nx, ny, heat * w);
                  }
                }
                // Soap, milk, silicone and glycerine put their properties into
                // the plate on the same disc as their colour, and the plate
                // keeps acting on them long after the drop.
                if (liq?.behaviour) af.liquid.deposit(x, y, r, liq.behaviour, k, af.dtSeconds);
              }
            }
            // Counted after the step it was read on (see the clock above).
            hand.clock++;
            if (primary) { strokeLastRef.current = hand.stroke; blowDirRef.current = hand.blowDir; dropClockRef.current = hand.clock; }
          }

          // ── Automation logic ───────────────────────────────────
          if (isAutomatedRef.current && isActiveRef.current && drainFrameRef.current === 0) {
            const rate = Math.max(0, Math.min(1, currentSettings.automateRate ?? 0.12));
            const energy = currentAudioData ? Math.min(1, currentAudioData.energy) : 0;
            const trebleBoost = currentAudioData ? currentAudioData.treble / 255 : 0;
            const spectralCentroid = currentAudioData ? currentAudioData.spectralCentroid : 0;

            /*
              The rate scales everything: at the default it is one small drop
              or a soft breath every seven seconds or so, quickening a little
              with the music; at full, about one a second. Evolve is a
              slow drift by design — it used to be a drop or a blow every
              second at the default and a frenzy at full, with floods and the
              music's reactions doubled, and it read as fast, massive changes.

              The phrase is what gives it shape. Without it this is a Poisson
              process at a fixed rate, which means impulses arrive
              independently and the amount of them over any minute is the same
              as over any other — the plate is equally busy for as long as it
              is on. The phrase's drive bunches them into gusts with quiet
              between, which is what a dish being worked on actually looks
              like: a pour, then twenty seconds of watching it spread, then a
              press. At surge 0 the drive is 1 and this is the old behaviour
              exactly.
            */
            const ph = phraseRef.current;

            /*
              A gust does something, rather than doing more of the same.

              The first version of the phrasing only scaled the trickle — how
              often a drop lands and how big it is — and measured as changing
              nothing at all: the same frame-to-frame motion as with it
              switched off, at every lag from one second to fourteen. The
              reason is in `phrasing.ts`: a plate already covered in churning
              dye has a motion floor that swamps any modulation of small events
              on top of it. Filmed liquid gets its dynamics from whole-frame
              events, and from a dish that is often mostly still.

              So the peak of a gust pours. A wide, soft flood across a good
              share of the plate in one colour, which is the one thing here
              that changes the whole frame at once — and it is rare, because
              the rest between them is half of what makes it read.
            */
            // 0.45, not 0.82: the gust handed over here is already scaled by
            // surge, so a threshold near the top made the pour fire only above
            // surge 0.82 — nothing at the default of 0.55, and the feature was
            // a switch disguised as a dial. At 0.45 a quiet look still never
            // pours (its gust cannot reach it), the middle pours now and then,
            // and a loud one pours often, which is what the dial was for. The
            // size and the force still ride the gust, so a bigger surge is
            // also a bigger pour.
            /*
              Evolve is subtle now (the owner's call, after watching it: "fast
              changes that are massive on the screen"). A flood a third of the
              plate across is the opposite of subtle, so evolve no longer pours
              one; the plate is left to change the way a dish left on the
              projector does — slowly, in small places. `EVOLVE_FLOODS` brings
              it back.
            */
            if (EVOLVE_FLOODS && ph.gust > 0.45 && now - lastFloodRef.current > 4.5 && DICE.evolve.float() < 0.06) {
              lastFloodRef.current = now;
              autoEventsRef.current.poured++;
              floodPour(ph.gust, energy, currentSettings.bubbles ?? 0, DICE.evolve);
            }

            // About one small event every seven seconds at the default rate,
            // about one a second at full — against two or three a
            // second before, each of them large.
            // A paced scene's rests are rests for the automation's hands too.
            if (DICE.evolve.float() < rate * (0.012 + energy * 0.03) * ph.drive * paceNowRef.current.activity) {
              const af = DICE.evolve.pick(fluidsRef.current);
              if (af) {
                // A look built on areas tends them: the drop lands in one of
                // its areas (the bigger the area, the more often), in that
                // area's dye, with that area's liquid. Otherwise anywhere.
                const evolveAreas = areasOf(fluidsRef.current.indexOf(af));
                const area = evolveAreas ? pickArea(evolveAreas, DICE.evolve) : null;
                const at = area ? pointInArea(area, GRID_SIZE, DICE.evolve) : null;
                const rx = at ? Math.floor(at.x) : DICE.evolve.int(GRID_SIZE - 20) + 10;
                const ry = at ? Math.floor(at.y) : DICE.evolve.int(GRID_SIZE - 20) + 10;
                const isBlow = DICE.evolve.float() > 0.75 - (spectralCentroid / 128) * 0.4;
                if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0) {
                  bubblesRef.current.disturb(rx, ry, (isBlow ? 5 : 4) * GRID_SCALE, isBlow ? 'air' : 'dye', 0.8);
                }
                if (isBlow) {
                  af.blowAir(rx, ry, 2 + Math.floor(energy * 2), 0.03 + energy * 0.05, true);
                  if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0 && DICE.evolve.float() < 0.12 + (currentSettings.bubbles ?? 0) * 0.25
                      && bubblesRef.current.bubbles.length < 3 + Math.round(14 * (currentSettings.bubbles ?? 0))) {
                    bubblesRef.current.spawn(rx, ry, (1.0 + energy * 1.5) * GRID_SCALE, 2 + DICE.evolve.int(3), 4 * GRID_SCALE);
                  }
                } else {
                  const li = fluidsRef.current.indexOf(af);
                  const color = area ? areaColor(li, area) : harmonyColor(harmonyOf(li));
                  const styles = stylesOf(li);
                  const style = DICE.evolve.pick(styles);
                  // A gust is a bigger pour, not just a more frequent one:
                  // an even scatter of identical drops is the flatness this
                  // is here to break.
                  af.autoInject(style, rx, ry, 1.5 + energy * 4, color.r, color.g, color.b, energy);
                  af.addTemp(rx, ry, 0.3 + trebleBoost * 1.5);
                  // A hand reaching for the dropper reaches for whatever is on
                  // the bench, and half the bottles there are not just colour.
                  // At an area, the bottle is the one kept there.
                  if (area) doseArea(af, li, area, rx, ry, 0.25 + energy * 0.25);
                  else doseLiquid(af, liquidsOf(li), rx, ry, 0.25 + energy * 0.25);
                }
              }
            }

            // With no hue journey set, an evolving plate re-picks its palette at
            // random every ~3 min (it was ~45 s). Only the dye still to come
            // takes the new colours, so with small drops this is a drift, not
            // a change of scene. The journey itself runs below, evolving or not.
            if (!harmonyLockRef.current && (currentSettings.hueJourney ?? 0) <= 0 && DICE.evolve.float() < 0.0001) {
              harmonyRef.current = presetContractRef.current ? harmonyFromContract(presetContractRef.current, false) : pickHarmony();
            }

            /*
              And dye leaves, which nothing here used to do.

              Everything above adds: a drop, a blow, a flood. The only thing
              that ever took dye away was the global budget thinning the whole
              plate at once when it went over, so an evolving plate filled up
              and the only variety left was which colour came next. A patch
              going pale is what a dish does where the lamp is hottest, and it
              makes room for the next pour instead of painting over the last.

              Rarer than a pour and gentler: a fifth off the middle of a patch
              at most, softened to nothing at its rim.
            */
            if (now - lastThinRef.current > 9 && DICE.evolve.float() < rate * 0.004) {
              lastThinRef.current = now;
              autoEventsRef.current.thinned++;
              const af = DICE.evolve.pick(fluidsRef.current);
              if (af) {
                af.thinPatch(
                  GRID_SIZE * (0.2 + DICE.evolve.float() * 0.6),
                  GRID_SIZE * (0.2 + DICE.evolve.float() * 0.6),
                  GRID_SIZE * (0.10 + DICE.evolve.float() * 0.12),
                  0.80 + DICE.evolve.float() * 0.12,
                );
              }
            }

            /*
              And a finger goes through it now and then.

              The blow and the drop are the only gestures the automation had,
              and both of them arrive from outside the liquid. A finger is the
              one that works *what is already there* — it carries dye along its
              track and averages the chemistry under it, so two bottles that
              refuse each other come out briefly mixed. That is the gesture a
              person reaches for when a plate has gone static, which is exactly
              when this should be reaching for it.
            */
            if (!autoStrokeRef.current && DICE.evolve.float() < rate * 0.003) {
              autoEventsRef.current.stroked++;
              const a = DICE.evolve.angle();
              autoStrokeRef.current = {
                x: GRID_SIZE * (0.3 + DICE.evolve.float() * 0.4),
                y: GRID_SIZE * (0.3 + DICE.evolve.float() * 0.4),
                dx: Math.cos(a), dy: Math.sin(a),
                left: 18 + DICE.evolve.int(14),
              };
            }
            const stroke = autoStrokeRef.current;
            if (stroke) {
              const af = fluidsRef.current[0];
              if (af) {
                af.fingerDrag(stroke.x, stroke.y, 7, 0.07, stroke.dx * 3, stroke.dy * 3, false, { x: stroke.dx * 1.6, y: stroke.dy * 1.6 });
                if ((currentSettings.bubbles ?? 0) > 0) {
                  beadsRef.current.disturb(stroke.x, stroke.y, 9 * GRID_SCALE, 0.18);
                }
              }
              stroke.x += stroke.dx * 1.6;
              stroke.y += stroke.dy * 1.6;
              // Off the plate, or done: the hand lifts.
              if (--stroke.left <= 0 || stroke.x < 8 || stroke.y < 8 ||
                  stroke.x > GRID_SIZE - 8 || stroke.y > GRID_SIZE - 8) {
                autoStrokeRef.current = null;
              }
            }

          }

          /*
            The hue journey: a set drifts its colours over minutes, one dye
            draining as the next arrives, never a jump.

            It lived inside the evolve block above, so with Random Evolve off —
            the default — it never ran, and its "minutes" were the solver's clock:
            at the default Speed one of them took three and a half real minutes,
            at full Speed eight seconds. On the wall clock now, while playing.
          */
          if (isActiveRef.current && drainFrameRef.current === 0 && !harmonyLockRef.current) {
            const journeyMin = currentSettings.hueJourney ?? 0;
            if (journeyMin > 0) {
              const j = journeyRef.current;
              const nowS = showNow() * 0.001;
              if (j.lastAt < 0 || j.lastAt > nowS) j.lastAt = nowS;
              if (nowS - j.lastAt >= journeyMin * 60) {
                j.lastAt = nowS;
                j.lead += 1;
                const contract = presetContractRef.current;
                harmonyRef.current = contract ? harmonyFromContract(contract, true) : pickHarmony();
              }
            }
          }

          // ── A pressed look change handing over (see `handoffRef`) ──
          {
            const h = handoffRef.current;
            if (h && isActiveRef.current && drainFrameRef.current === 0) {
              const nowMs = showNow();
              const p = Math.min(1, (nowMs - h.start) / h.dur);
              const dtMs = Math.max(0, Math.min(100, nowMs - h.last));
              h.last = nowMs;
              // Everything on the plate thins, a little each frame, to
              // HANDOFF_KEEP of itself by the end; the new look is laid back
              // in at the rate it thins, so what is left of the old look at
              // the end is HANDOFF_KEEP and the new look is all the rest.
              const lambda = -Math.log(HANDOFF_KEEP);
              // The plates this Go is for: all of them, or only the front
              // while the back plate has a look of its own (see backDyesRef).
              // Decided on the handover's first frame and kept: a Follow the
              // front pressed half way through must not start thinning plate
              // 1 with no seed of this look to rise into it.
              h.plates ??= backDyesRef.current ? 1 : fluidsRef.current.length;
              const handed = fluidsRef.current.slice(0, h.plates);
              for (const fluid of handed) fluid.thinDye(Math.exp(-lambda * dtMs / h.dur));
              const id = livePresetRef.current;
              const lead = fluidsRef.current[0];
              /*
                The incoming look, laid once and risen into.

                At the start its seed is worked out once per plate and kept
                (captureSeed), the old look's chemistry and liquids cleared;
                every frame after, the same share of that one picture goes in
                as the plate thins, so what arrives is the new look coming up
                in place. Laid in eight separate doses it flashed: the seeding
                is random, so each dose put its blobs somewhere new, and a look
                with no palette of its own picked a new palette for each.
                The share balances the thinning (λ a fade), so by the end the
                new look is all but HANDOFF_KEEP of the plate.
              */
              if (!h.seeds) {
                for (const fluid of handed) { if (fluid.gpu instanceof WebGPUFluid) fluid.gpu.clearChemistry(); fluid.liquid.clear(); }
                fluidsRef.current[0]?.gpu?.clearChemistry?.();
                h.seeds = handed.map((fluid, i) => {
                  if (!id) return null;
                  if (i === 0) {
                    let seeded: number[] = [];
                    const seed = fluid.captureSeed(() => { seeded = fluid.seedPreset(id, noise2D); });
                    if (!harmonyLockRef.current && !presetContractRef.current) harmonyRef.current = seeded;
                    return seed;
                  }
                  return id === 'fillmore-1969' ? fluid.captureSeed(() => laySecondPlate(fluid, id)) : null;
                });
                h.dosed = 1;
              }
              const share = Math.min(1, lambda * dtMs / h.dur);
              h.seeds.forEach((seed, i) => { if (seed && i < handed.length) fluidsRef.current[i]?.addSeedShare(seed, share); });
              // The second phase, once, half way: it is a body, not a wash.
              if (h.dosed === 1 && p >= 0.5) {
                h.dosed = 2;
                /*
                  By what the incoming look asks for (h.phase, from the app),
                  not the settings: half way through the fade they are half
                  way between the looks, so from a plate with Ferrofluid up
                  (the bottle's pour) to a look with none they read 0.3 here,
                  and the incoming look's ring was laid over the pour, a black
                  chunk fading out over the second half (PLAN 15i).
                */
                const asked = h.phase?.phaseAmount ?? settingsRef.current.phaseAmount ?? 0;
                if (asked > 0.002) layPhaseRef.current(livePresetRef.current, asked, h.phase?.phaseScale);
                else lead?.gpu?.clearPhase?.();
                const handedAreas = areasRef.current;
                // An area look's liquids go into its areas, as laying it pours them.
                if (lead && handedAreas) layAreaLiquids(lead, 0, handedAreas, 2);
                else if (lead) {
                  for (let i = 0; i < 4; i++) {
                    doseLiquid(lead, plateLiquidsRef.current, 10 + DICE.lay.float() * (GRID_SIZE - 20), 10 + DICE.lay.float() * (GRID_SIZE - 20), 1.2);
                  }
                }
              }
              // And its palette, poured through the second half.
              const due = Math.floor(Math.max(0, Math.min(1, (p - 0.4) / 0.5)) * HANDOFF_POURS + 1e-6);
              while (h.poured < Math.min(due, HANDOFF_POURS)) {
                h.poured++;
                const fluid = handed[h.poured % Math.max(1, handed.length)];
                if (!fluid) break;
                // An area look's palette is poured into its areas, each its own dye.
                const handedAreas = areasRef.current;
                if (handedAreas) { pourIntoArea(fluid, 0, handedAreas, injectStyleRef.current); continue; }
                const rx = Math.floor(GRID_SIZE * (0.18 + DICE.lay.float() * 0.64));
                const ry = Math.floor(GRID_SIZE * (0.18 + DICE.lay.float() * 0.64));
                const color = harmonyColor(harmonyRef.current);
                const styles = injectStyleRef.current;
                fluid.autoInject(DICE.lay.pick(styles) ?? 'drop', rx, ry, 8.0, color.r, color.g, color.b, 0.5);
                fluid.addTemp(rx, ry, 1.2);
                doseLiquid(fluid, plateLiquidsRef.current, rx, ry, 0.8);
              }
              if (p >= 1) handoffRef.current = null;
            }
          }

          // ── The back plate taking a look of its own (§16a) ──
          /*
            The front's handover above, for plate 1 alone: its dye thins to
            HANDOFF_KEEP over the fade while the look's seed rises into it,
            then the look's palette is poured through the second half. Its
            chemistry and liquids are cleared at the start, as the front's
            are, and the room's chemistry field is left alone because it is
            the front's. Waits, rather than running out, while plate 1 is
            still being built: App raises the plate count on the same press.
          */
          {
            const h = backHandoffRef.current;
            const dyes = backDyesRef.current;
            const fluid = fluidsRef.current[1];
            if (h && dyes && isActiveRef.current && drainFrameRef.current === 0) {
              const nowMs = showNow();
              if (!fluid) { h.start = nowMs; h.last = nowMs; }
              else {
                const p = Math.min(1, (nowMs - h.start) / h.dur);
                const dtMs = Math.max(0, Math.min(100, nowMs - h.last));
                h.last = nowMs;
                const lambda = -Math.log(HANDOFF_KEEP);
                fluid.thinDye(Math.exp(-lambda * dtMs / h.dur));
                if (!h.seed) {
                  if (fluid.gpu instanceof WebGPUFluid) fluid.gpu.clearChemistry();
                  fluid.liquid.clear();
                  let seeded: number[] = [];
                  h.seed = fluid.captureSeed(() => { seeded = fluid.seedPreset(dyes.id, noise2D); });
                  if (!dyes.contract && seeded.length > 0) dyes.harmony = seeded;
                  const backAreas = plateAreas(dyes.id);
                  if (backAreas) layAreaLiquids(fluid, 1, backAreas, 2);
                  else for (let i = 0; i < 4; i++) {
                    doseLiquid(fluid, dyes.liquids, 10 + DICE.lay.float() * (GRID_SIZE - 20), 10 + DICE.lay.float() * (GRID_SIZE - 20), 1.2);
                  }
                }
                fluid.addSeedShare(h.seed, Math.min(1, lambda * dtMs / h.dur));
                const due = Math.floor(Math.max(0, Math.min(1, (p - 0.4) / 0.5)) * HANDOFF_POURS + 1e-6);
                while (h.poured < Math.min(due, HANDOFF_POURS)) {
                  h.poured++;
                  const backAreas = plateAreas(dyes.id);
                  if (backAreas) { pourIntoArea(fluid, 1, backAreas, dyes.styles); continue; }
                  const rx = Math.floor(GRID_SIZE * (0.18 + DICE.lay.float() * 0.64));
                  const ry = Math.floor(GRID_SIZE * (0.18 + DICE.lay.float() * 0.64));
                  const color = harmonyColor(harmonyOf(1));
                  fluid.autoInject(DICE.lay.pick(dyes.styles) ?? 'drop', rx, ry, 8.0, color.r, color.g, color.b, 0.5);
                  fluid.addTemp(rx, ry, 1.2);
                  doseLiquid(fluid, dyes.liquids, rx, ry, 0.8);
                }
                if (p >= 1) backHandoffRef.current = null;
              }
            }
          }

          // ── Seed trigger ───────────────────────────────────────
          if (seedCountRef.current > lastSeedCount.current && drainFrameRef.current === 0) {
            lastSeedCount.current = seedCountRef.current;
            macroCamRef.current.reset();
            harmonyRef.current = harmonyLockRef.current ?? pickHarmony();
            fluidsRef.current.forEach((fluid, li) => {
              // Each plate from its own look's dyes (§16a); the front's for a
              // back plate that follows it.
              const styles = stylesOf(li);
              for (let i = 0; i < 8; i++) {
                const rx = DICE.lay.int(GRID_SIZE - 20) + 10;
                const ry = DICE.lay.int(GRID_SIZE - 20) + 10;
                const color = harmonyColor(harmonyOf(li));
                const style = DICE.lay.pick(styles);
                fluid.autoInject(style, rx, ry, 10.0, color.r, color.g, color.b, 0.5);
                fluid.addTemp(rx, ry, 2.0);
                // A fresh plate is laid with its liquids, not dosed into them.
                doseLiquid(fluid, liquidsOf(li), rx, ry, 1.4);
              }
            });
          }

          if (isActiveRef.current && drainFrameRef.current === 0) {
            // ── Ambient seeding ────────────────────────────────
            const af = fluidsRef.current[activeLayerRef.current];
            if (af && ambientSeedRef.current) {
              // Three Lissajous orbits, each carrying its own harmony color —
              // keeps several distinct hues alive in the frame at all times.
              const phase = time * 0.18;
              const injPts = [
                { x: GRID_SIZE / 2 + Math.cos(phase) * GRID_SIZE * 0.28,
                  y: GRID_SIZE / 2 + Math.sin(phase * 1.3) * GRID_SIZE * 0.28 },
                { x: GRID_SIZE / 2 + Math.cos(phase * 0.7 + Math.PI) * GRID_SIZE * 0.3,
                  y: GRID_SIZE / 2 + Math.sin(phase * 0.9 + 1.0) * GRID_SIZE * 0.3 },
                { x: GRID_SIZE / 2 + Math.cos(phase * 1.1 + 2.1) * GRID_SIZE * 0.22,
                  y: GRID_SIZE / 2 + Math.sin(phase * 0.6 + 4.2) * GRID_SIZE * 0.33 },
              ];

              injPts.forEach((pt, idx) => {
                const px = Math.floor(pt.x), py = Math.floor(pt.y);
                if (px > 0 && px < GRID_SIZE - 1 && py > 0 && py < GRID_SIZE - 1) {
                  const c = harmonyCycle(harmonyOf(activeLayerRef.current), time * 0.25 + idx * 1.4);
                  af.addDensity(px, py, 0.05, c.r, c.g, c.b);
                  af.addTemp(px, py, 0.02);
                }
              });

            }

            // ── Audio input to fluid ──────────────────────────────
            if (currentAudioData && currentSettings.audioMappings) {
              const densityMod = getAudioValue(currentAudioData, currentSettings.audioMappings.density as AudioFeatureKey);
              const colorMod   = getAudioValue(currentAudioData, currentSettings.audioMappings.color as AudioFeatureKey);

              // The velocity route drives the bass burst. It was never read, and
              // the density route gated this whole block, so setting density to
              // "none" silenced every reaction to the music, bursts included.
              const velRoute = currentSettings.audioMappings.velocity as AudioFeatureKey;
              const velRaw = getAudioValue(currentAudioData, velRoute);
              // Same scale as bass01 below (feature / 70) so the default route,
              // bass, behaves exactly as before; energy is already 0–1.
              const vel01 = velRoute === 'energy' ? velRaw : Math.min(1, velRaw * (100 / 70));

              const impact = currentSettings.audioImpact ?? 0.45;
              if (impact > 0.01 && currentAudioData.volume > 3) {
                // True Synesthesia: Map the musical key (pitchClass 0-11) directly to the harmony's color cycle!
                const pitchClass = currentAudioData?.features?.pitchClass ?? 0;
                // Normalize pitchClass (0-11) to a full circle (0 - 2PI)
                const pitchAngle = (pitchClass / 12.0) * Math.PI * 2;
                
                // Each audio feature carries a different color from the harmony,
                // offset by the true musical pitch so chords paint distinct colors!
                const colFor = (off: number) => harmonyCycle(harmonyOf(activeLayerRef.current), time * 0.1 + pitchAngle + colorMod * Math.PI + off);
                const audioCol = colFor(0);

                const activeFluid = fluidsRef.current[activeLayerRef.current];
                if (activeFluid) {
                  const bass01   = Math.min(1, currentAudioData.bass   / 70);
                  const treble01 = Math.min(1, currentAudioData.treble / 70);
                  const energy01 = Math.min(1, currentAudioData.energy / 70);
                  const mid01    = Math.min(1, currentAudioData.mid    / 70);

                  // audioImpact (0–1) controls visual punch; auto mode adds extra multiplier
                  // At impact=0.45 (default) + no auto → ~1.0x baseline
                  // At impact=1.0 + auto → ~4.9x baseline
                  const impactMul = (currentSettings.audioImpact ?? 0.45) / 0.45;
                  // Evolve used to multiply every music reaction by 2.2 — dye,
                  // heat, bursts — which is most of why it read as massive. It
                  // leaves the music's own reactions as the look sets them now.
                  const autoAmp = impactMul;

                  const centerX = Math.floor(GRID_SIZE / 2);
                  const centerY = Math.floor(GRID_SIZE / 2);
                  const aStyles = stylesOf(activeLayerRef.current);
                  const aStyle = () => DICE.music.pick(aStyles);
                  /*
                    Where the music's hands land. On a look built on areas
                    (lib/plateAreas.ts) the bass's pulse, burst and ring land
                    in its bass area (the current kick's, when it has several),
                    the mid's stream circles its mid area and the treble's
                    sparks fall in its treble area, each in that area's dye.
                    Everywhere else they work from the middle as they always
                    have, in the colours they always had: centring every look's
                    music on one point is most of why a plate had one area of
                    interest, and the looks are moved over one at a time.
                  */
                  const musicAreas = areasOf(activeLayerRef.current);
                  // A kick moves the bass on to its next area (when the look
                  // has several) before anything of this kick lands, so its
                  // ring, its burst and Beat Squeeze's press all land together.
                  if (musicAreas && kickRef.current.kick && simStep === 0) areaKicksRef.current++;
                  const bassArea = musicAreas ? areaForBand(musicAreas, 'bass', areaKicksRef.current) : null;
                  const bassAt = bassArea ? areaCentre(bassArea, GRID_SIZE) : null;
                  const bassX = bassAt ? Math.floor(bassAt.x) : centerX;
                  const bassY = bassAt ? Math.floor(bassAt.y) : centerY;
                  // The mid's and the treble's areas, where a look gives them
                  // none of their own, take its areas in turn, a new one every
                  // eight seconds of the show.
                  const turn = Math.floor(time / 8);
                  const areaTime = time * 0.3 + colorMod * Math.PI;

                  // Center pulse — scales with density mapping
                  if (densityMod > 0.005) {
                    const pc = bassArea ? areaCycle(activeLayerRef.current, bassArea, areaTime) : audioCol;
                    activeFluid.autoInject(aStyle(), bassX, bassY, densityMod * 0.025 * autoAmp, pc.r, pc.g, pc.b, densityMod);
                    activeFluid.addTemp(bassX, bassY, densityMod * 0.018 * autoAmp);
                  }

                  // A hit on the velocity route: radial burst — scales with impact + auto mode
                  if (vel01 > 0.25) {
                    // In an area, no wider than the area: the push is that well's, not the plate's.
                    const burstR = Math.round(Math.min(bassArea ? bassArea.r * GRID_SIZE : Infinity,
                      18 * GRID_SCALE * Math.max(0.4, impactMul)));
                    const bassStr = (vel01 - 0.25) * autoAmp;
                    for (let bj = -burstR; bj <= burstR; bj += 3) {
                      for (let bi = -burstR; bi <= burstR; bi += 3) {
                        const dist = Math.sqrt(bi * bi + bj * bj);
                        if (dist < 2 || dist > burstR) continue;
                        const bx = bassX + bi, by = bassY + bj;
                        if (bx > 0 && bx < GRID_SIZE - 1 && by > 0 && by < GRID_SIZE - 1) {
                          const f = bassStr * 0.65 * (1 - dist / burstR);
                          activeFluid.addVelocity(bx, by, (bi / dist) * f, (bj / dist) * f);
                        }
                      }
                    }
                  }

                  // Beat edge: an organic bloom of varied droplets on each kick
                  // rather than a rigid geometric ring, so bass hits are visible
                  // in natural color dispersion
                  if (kickRef.current.kick && simStep === 0) {
                    // Against its pool: the cycle half way round, so the ring is the other of the area's two dyes.
                    const ringCol = bassArea ? areaCycle(activeLayerRef.current, bassArea, areaTime + 1.0) : colFor(2.0);
                    // In an area the ring is the area's size: a third of it out on a soft kick, most of it on a hard one.
                    const ringR = bassArea ? bassArea.r * GRID_SIZE * (0.35 + bass01 * 0.5) : (10 + bass01 * 14) * GRID_SCALE;
                    // Natural droplet count and organic dispersal with varied depths and sizes
                    const drops = 6 + DICE.music.int(7);
                    for (let d = 0; d < drops; d++) {
                      const a = (d / drops) * Math.PI * 2 + (DICE.music.float() - 0.5) * 0.45 + time;
                      const rad = ringR * (0.9 + 0.3 * DICE.music.float());
                      const rx2 = Math.floor(bassX + Math.cos(a) * rad);
                      const ry2 = Math.floor(bassY + Math.sin(a) * rad);
                      if (rx2 > 1 && rx2 < GRID_SIZE - 2 && ry2 > 1 && ry2 < GRID_SIZE - 2) {
                        const dropStr = bass01 * (0.5 + 0.7 * DICE.music.float()) * impactMul;
                        activeFluid.addDensity(rx2, ry2, dropStr, ringCol.r, ringCol.g, ringCol.b);
                        // Outward expansion with natural fluid swirl
                        const swirl = 0.2 * (DICE.music.float() - 0.5);
                        const pvx = (Math.cos(a) - Math.sin(a) * swirl) * (0.18 + 0.15 * DICE.music.float()) * bass01;
                        const pvy = (Math.sin(a) + Math.cos(a) * swirl) * (0.18 + 0.15 * DICE.music.float()) * bass01;
                        activeFluid.addVelocity(rx2, ry2, pvx, pvy);
                      }
                    }
                    // The beat dose: lands organically around the active area
                    {
                      const da = DICE.music.angle();
                      const doseDist = ringR * (0.95 + 0.15 * DICE.music.float());
                      if (bassArea) {
                        doseArea(activeFluid, activeLayerRef.current, bassArea,
                          bassX + Math.cos(da) * doseDist, bassY + Math.sin(da) * doseDist, bass01);
                      } else {
                        doseLiquid(activeFluid, liquidsOf(activeLayerRef.current),
                          centerX + Math.cos(da) * doseDist, centerY + Math.sin(da) * doseDist, bass01);
                      }
                    }
                  }
                  lastBass01Ref.current = bass01;

                  // Mid: organic meandering injection in its own hue
                  if (mid01 > 0.2) {
                    // On an area look, round the edge of its mid area, in that area's dye.
                    const midArea = musicAreas ? areaForBand(musicAreas, 'mid', turn) : null;
                    const midAt = midArea ? areaCentre(midArea, GRID_SIZE) : { x: centerX, y: centerY };
                    const midCol = midArea ? areaCycle(activeLayerRef.current, midArea, areaTime + 0.65) : colFor(1.3);
                    const orbitR = midArea ? midArea.r * GRID_SIZE * 0.8 : GRID_SIZE * 0.3;
                    const mx = Math.floor(midAt.x + (noise2D(time * 0.25, 12.3) * 0.7 + Math.cos(time * 0.45) * 0.3) * orbitR);
                    const my = Math.floor(midAt.y + (noise2D(47.1, time * 0.25) * 0.7 + Math.sin(time * 0.55) * 0.3) * orbitR);
                    if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
                      activeFluid.autoInject(aStyle(), mx, my, mid01 * 0.06 * autoAmp, midCol.r, midCol.g, midCol.b, mid01);
                      activeFluid.addTemp(mx, my, mid01 * 0.025 * autoAmp);
                    }
                  }

                  // Treble: scattered sparks — heat plus tiny bright dye specks
                  // so high frequencies glitter instead of acting invisibly
                  if (treble01 > 0.2) {
                    // On an area look, in its treble area and that area's dye.
                    const trebleArea = musicAreas ? areaForBand(musicAreas, 'treble', turn + 1) : null;
                    const sparkCol = trebleArea ? areaCycle(activeLayerRef.current, trebleArea, areaTime + 1.55) : colFor(3.1);
                    // Fewer, larger droplets: a cloud of one-cell specks blurs
                    // into fog, a handful of real drops stays drops.
                    const sparks = Math.floor(treble01 * 2 * impactMul);
                    for (let s = 0; s < sparks; s++) {
                      const sp = trebleArea ? pointInArea(trebleArea, GRID_SIZE, DICE.music) : null;
                      const sx = sp ? Math.floor(sp.x) : DICE.music.int(GRID_SIZE - 20) + 10;
                      const sy = sp ? Math.floor(sp.y) : DICE.music.int(GRID_SIZE - 20) + 10;
                      activeFluid.addTemp(sx, sy, treble01 * 0.6 * autoAmp);
                      for (let ddy = -1; ddy <= 1; ddy++) {
                        for (let ddx = -1; ddx <= 1; ddx++) {
                          const w = ddx === 0 && ddy === 0 ? 1.0 : 0.45;
                          activeFluid.addDensity(sx + ddx, sy + ddy, treble01 * 1.1 * w,
                            sparkCol.r * 0.5 + 0.5, sparkCol.g * 0.5 + 0.5, sparkCol.b * 0.5 + 0.5);
                        }
                      }
                    }
                  }

                  // Energy: roaming swell wandering naturally across the canvas
                  if (energy01 > 0.15) {
                    const swellCol = colFor(2.6);
                    const ex = Math.floor(centerX + (noise2D(time * 0.18, 71.9) * 0.7 + Math.cos(time * 0.32) * 0.3) * GRID_SIZE * 0.28);
                    const ey = Math.floor(centerY + (noise2D(88.4, time * 0.18) * 0.7 + Math.sin(time * 0.27) * 0.3) * GRID_SIZE * 0.28);
                    activeFluid.autoInject(aStyle(), ex, ey, energy01 * 0.06 * autoAmp, swellCol.r, swellCol.g, swellCol.b, energy01);
                  }
                }
              }
            }
          }


          // ── Rock the plate ─────────────────────────────────────
          // A hand on the clock face: the beat tips the whole plate one way
          // and a damped spring rocks it back, so the field sloshes instead
          // of only churning. Between beats a slow sway keeps it alive.
          {
            const rock = rockRef.current;
            const R = Math.max(0, Math.min(1, currentSettings.plateRock ?? 0));
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            const kickStep = kickRef.current.kick && simStep === 0;
            /*
              Accent the One (lib/barGrid.ts): this kick's weight by where it
              falls in the bar, the one pressed hardest, two and four let go.
              Asked of every kick, whatever the setting, so the one after a
              fill is known when the setting comes up; at 0 it is exactly 1,
              and so are kicks the bar grid is unsure of. A *predicted* kick
              fires beatLead ahead of what is heard, so the beat it means is
              that far on along the readings' clock the grid keeps; a kick
              fired from a heard onset (all of them with Beat Prediction at 0,
              and those before the clock locks or after it loses the lock)
              fires as it is heard and means the beat now. Shifting those too
              put them 80 ms past their beat at the default lead: at 140 bpm
              103 of 109 kicks fell off the beat and weighed 0 at full accent,
              so turning Accent up in detection-only mode all but stopped the
              squeeze (measured with the real grid on the club songs).
            */
            const accentAt = songClockRef.current + (kickRef.current.predicted ? Math.max(0, currentSettings.beatLead ?? 0) / 1000 : 0);
            const accent = kickStep ? accentRef.current.kick(barGridRef.current, accentAt, currentSettings.beatAccent ?? 0) : 1;
            // The hand's spring and sway, the slider applied once (lib/plateRock.ts, PLAN 27a).
            if (R > 0 && kickStep) kickRock(rock, bass01, accent);
            // The rhythm plate: on a kick the projectionist presses the top
            // glass and the dye spreads out in a ring, then relaxes back.
            const squeezeAmt = Math.max(0, Math.min(1, currentSettings.beatSqueeze ?? 0));
            if (squeezeAmt > 0 && kickStep && accent > 0 && isActiveRef.current && drainFrameRef.current === 0) {
              const leadPlate = fluidsRef.current[0];
              if (leadPlate) {
                // On an area look, the press lands on the kick's bass area.
                const sqAreas = areasOf(0);
                const sqArea = sqAreas ? areaForBand(sqAreas, 'bass', areaKicksRef.current) : null;
                const sqAt = sqArea ? areaCentre(sqArea, GRID_SIZE) : { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };
                const sqSpread = sqArea ? sqArea.r * GRID_SIZE : 30 * GRID_SCALE;
                const cx = sqAt.x + DICE.music.centred() * sqSpread;
                const cy = sqAt.y + DICE.music.centred() * sqSpread;
                // Twice what it was: at full it showed on 6 looks of 24 with the band playing.
                // (Whatever showed then was not the press, which never landed
                // until the centre was rounded, PLAN §10 step 4.) Pressed and
                // let go: `pressKick`.
                /*
                  And across the dish (KICK_RADII), deeper, and less at the
                  mercy of the bass reading (PLAN 27b). Measured in the lab on
                  a thin gap (`npm run rides`), a ring of colour 30 cells out
                  from a kick's centre: the old kick at the default squeeze and
                  the bass a kick usually reads (0.5, about 0.7) went out 1.7
                  cells and back, a hundredth of the plate, which nobody sees.
                  Now 5.7, and 11 at full. The glass closes as the film's own
                  resistance lets it (0.0192 at the middle for 0.0024 a disc,
                  0.0140 for 0.006), so deeper is not linear and never reaches
                  the floor. The bass reading is already in the kick that
                  fired this, and on top of it a soft kick pressed a third as
                  deep as a hard one; now two thirds (kickDepth).
                */
                const a = kickDepth(squeezeAmt, bass01, accent);
                leadPlate.pressKick(cx, cy, a, currentSettings.fingering ?? 0);
                if ((currentSettings.beads ?? 0) > 0) beadsRef.current.disturb(cx, cy, 30 * GRID_SCALE, 0.4 * squeezeAmt * bass01 * accent);
              }
            }
            stepRock(rock, simStepS);
            const [swingX, swingY] = rockSwing(rock, R, ...swayAt(noise2D, time));
            // A phone held by the projectionist: its tilt is the plate's, fading
            // out a couple of seconds after the last reading if the link drops.
            const ext = externalTiltRef.current;
            const extAge = showNow() * 0.001 - ext.at;
            const extK = extAge < 2.5 ? 1 - Math.max(0, extAge - 1.5) : 0;
            const tiltX = swingX * 0.004 + ext.x * 0.0045 * extK;
            const tiltY = swingY * 0.004 + ext.y * 0.0045 * extK;
            /*
              The plate takes the swing itself (±1–2 at full), scaled by the
              slider; the phone's tilt joins it. On a thin gap that is the
              plate tipped (× CUR_ROCK, sinθ), and a phone held tipped slides
              the colour downhill for as long as it is held, as a dish tipped
              in the hand does (PLAN 27a).
            */
            const rockX = swingX + ext.x * 1.1 * extK;
            const rockY = swingY + ext.y * 1.1 * extK;
            for (const fluid of fluidsRef.current) { fluid.tiltX = tiltX; fluid.tiltY = tiltY; fluid.rockX = rockX; fluid.rockY = rockY; }

            // ── Oil beads ───────────────────────────────────────
            {
              const beadAmt = Math.max(0, Math.min(1, currentSettings.beads ?? 0));
              const beads = beadsRef.current;
              if (beadAmt <= 0) {
                if (beads.beads.length) beads.clear();
              } else {
                // Every thirtieth frame. This read the gesture counter, which only
                // advances while someone is painting: before the first stroke it
                // repopulated on every frame (up to count × 6 placement tries,
                // each checking every bead), and after one it mostly never ran
                // again, so the beads stopped following their slider.
                // Drops take their colours from the look's palette (PLAN.md
                // batch 3); set every frame because it is one number, and the
                // palette with the populate below, since a new one is eased
                // toward over a second and a half rather than cut to.
                beads.drops = currentSettings.beadDrops ?? 0; // clamped, and NaN made 0, by the field
                if (simStep === 0 && (beadFrameRef.current % 30 === 0 || !beads.hasPalette) && beads.drops > 0) {
                  beads.setPalette(harmonyRef.current.map(i => PALETTE_RGB[i] ?? PALETTE_RGB[0]));
                }
                if (simStep === 0 && beadFrameRef.current++ % 30 === 0) {
                  const dens = fluidsRef.current[0]?.readDensity;
                  beads.populate(Math.round(60 + 360 * beadAmt), 0.8 + 0.4 * beadAmt, dens ? (bx, by) => dens[Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx))) + Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by))) * GRID_SIZE] : undefined);
                }
                if (isActiveRef.current && drainFrameRef.current === 0) {
                  const lead0 = fluidsRef.current[0];
                  const bvx = lead0?.readVx, bvy = lead0?.readVy;
                  const bk = particleFlowScale(lead0, currentSettings);
                  beads.step(simStepS, (bx, by) => {
                    if (!bvx || !bvy) return [0, 0];
                    /*
                      The clamp has to reject NaN, which the obvious one does
                      not. `Math.round(NaN)` is NaN, `Math.min` and `Math.max`
                      pass NaN through, an array indexed by NaN is `undefined`
                      and `undefined * bk` is NaN — so a bead that went bad
                      once was fed NaN for ever, and the gradient `beads.ts`
                      draws it with throws inside the frame loop. The canvas
                      stopped and the desk kept working.
                    */
                    const cell = (v: number): number =>
                      Number.isFinite(v) ? Math.max(0, Math.min(GRID_SIZE - 1, Math.round(v))) : -1;
                    const ix = cell(bx);
                    const iy = cell(by);
                    if (ix < 0 || iy < 0) return [0, 0];
                    const vx = bvx[ix + iy * GRID_SIZE] * bk;
                    const vy = bvy[ix + iy * GRID_SIZE] * bk;
                    // And the field itself: a solver that has gone unstable
                    // hands back NaN, and this is where it would get in.
                    return [Number.isFinite(vx) ? vx : 0, Number.isFinite(vy) ? vy : 0];
                  }, tiltX, tiltY);
                }
              }
            }

            // ── Bubbles ─────────────────────────────────────────
            const bubbleAmt = Math.max(0, Math.min(1, currentSettings.bubbles ?? 0));
            const bubbles = bubblesRef.current;
            // A look with no bubbles of its own keeps the ones blown by hand.
            if (bubbleAmt <= 0) {
              if (bubbles.anyBlown) bubbles.clearLooks();
              else if (bubbles.bubbles.length) bubbles.clear();
            }
            if ((bubbleAmt > 0 || bubbles.anyBlown) && isActiveRef.current && drainFrameRef.current === 0) {
              // A few bubbles at a time, not a foam: one on a kick (usually),
              // the odd extra under sustained bass, and none once the plate
              // already carries as many as the setting allows.
              // Air lives in the oil: a kick releases a few small bubbles into
              // the densest dye near the ring, where they gather into the packed
              // fields the references show, rather than one lens on bare glass.
              // Fewer than it used to be, on purpose. A field of forty reads as
              // foam on a shower door; three or four reading as air trapped in
              // the oil is the thing the references actually show.
              const room = bubbles.bubbles.filter((b) => !b.daughter).length < 3 + Math.round(14 * bubbleAmt);
              const onset = kickStep;
              /*
                And only as hard as Sound Drive lets the music reach the
                plate. Every other reaction to the music (the centre pulse,
                the bursts, the ring of dye on a kick, the liquids it doses)
                sits behind Audio Impact; these did not, so at 0, with every
                other reaction still, a fresh browser's first click started
                the built-in band and its kicks went on dropping air near the
                middle (found by the mirror check: 29 kicks over four drops,
                four bubbles near the middle, and the middle of the preview
                moving by itself from the second drop on). The odds follow
                the dye ring's own scale, impact over 0.45, up to 0.45 and no
                further: from 0.45 up (the defaults are 0.6, Classic's 0.55) a
                kick is as likely to release air as it always was, and the
                draws are the same draws in the same order, so a render there
                is the same render; below it the air thins with the fader, and
                at 0 the music releases none. The look's Bubbles setting still
                says how many the plate may carry, and the straw still blows
                its own.
              */
              const impactNow = currentSettings.audioImpact ?? 0.45;
              const drive = Math.min(1, Math.max(0, impactNow) / 0.45);
              const mb = musicBubblesRef.current;
              mb.impact = impactNow; mb.drive = drive; mb.amount = bubbleAmt;
              if (currentAudioData && room && onset) mb.chances++;
              const kickAir = !!currentAudioData && room && onset && DICE.music.float() < 0.45 * bubbleAmt * drive;
              const heldAir = !kickAir && !!currentAudioData && room && bass01 > 0.5 && DICE.music.float() < 0.003 * bubbleAmt * drive;
              if (kickAir || heldAir) {
                if (kickAir) mb.kicks++; else mb.held++;
                const dens = fluidsRef.current[0]?.readDensity;
                let bx = GRID_SIZE / 2, by = GRID_SIZE / 2, best = -1;
                for (let t = 0; t < 6; t++) {
                  const a = DICE.music.angle(), rr = (6 + DICE.music.float() * 40) * GRID_SCALE;
                  const px = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr), py = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
                  const d = dens ? dens[Math.max(0, Math.min(GRID_SIZE - 1, px)) + Math.max(0, Math.min(GRID_SIZE - 1, py)) * GRID_SIZE] : 0;
                  if (d > best) { best = d; bx = px; by = py; }
                }
                bubbles.spawn(bx, by, (0.9 + bass01 * 1.2) * GRID_SCALE, 2 + DICE.music.int(3), 3 * GRID_SCALE);
              }
              const lead = fluidsRef.current[0];
              const vx = lead?.readVx, vy = lead?.readVy;
              const treble01 = currentAudioData ? Math.min(1, currentAudioData.treble / 70) : 0;
              const qk = particleFlowScale(lead, currentSettings);
              bubbles.step(simStepS, (bx, by) => {
                if (!vx || !vy) return [0, 0];
                const ix = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx)));
                const iy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by)));
                return [vx[ix + iy * GRID_SIZE] * qk, vy[ix + iy * GRID_SIZE] * qk];
              }, tiltX, tiltY, 0.5 + bubbleAmt, treble01 * 0.6);
              // A bubble is air between the plates: the dye cannot sit under
              // it. A standing squeeze on each footprint keeps pumping the
              // dye out to the rim, so the field flows round the bubbles
              // instead of sliding underneath them as if they were painted on.
              if (lead) {
                for (const b of bubbles.bubbles) {
                  if (b.r < 1.2) continue;
                  const bx = Math.round(b.x), by = Math.round(b.y);
                  if (bx > 2 && by > 2 && bx < GRID_SIZE - 3 && by < GRID_SIZE - 3) lead.applySquish(bx, by, Math.max(1, b.r * 0.85 / GRID_SCALE), 0.0035);
                }
              }
              // A pop is an inward cavity collapse into the void left behind.
              for (const ev of bubbles.events) {
                if (ev.kind === 'pop' && lead) {
                  const px = Math.round(ev.x), py = Math.round(ev.y);
                  if (px > 2 && py > 2 && px < GRID_SIZE - 3 && py < GRID_SIZE - 3) lead.popBubble(px, py, Math.max(2, Math.round(ev.r / GRID_SCALE)), 0.04);
                }
              }
            }
            rock.lastBass = bass01;
          }

          // ── Advance the solver ───────────────────────────────
          if (isActiveRef.current && drainFrameRef.current === 0) {
            const t0 = performance.now();
            // What liquid is where acts first, so the forces it adds are in
            // the deltas the step is about to take. Costs nothing on a plate
            // with none of the four liquids on it, which is every preset that
            // does not ask for them.
            // At the dye's own rate: the solver's dt, not the wall-clock step,
            // which is five or six times larger. With the phase riding the flow
            // the dye rides (see readVx), the wall-clock rate carried the soap
            // across the plate ahead of the dye it is meant to be thinning.
            const adv = currentSettings.advection ?? 0.45;
            for (const fluid of fluidsRef.current) fluid.stepLiquid(simStepS, fluid.dt * adv * (GRID_SIZE - 2));
            // Each plate takes its own fold: a patch aimed at layer 1 changes
            // how layer 1 moves and leaves the others exactly as they were.
            for (let li = 0; li < fluidsRef.current.length; li++) {
              fluidsRef.current[li].step(li === 0 ? magnetFor(patch.layer(li)) : patch.layer(li), currentAudioData, time, noise2D);
            }
            const ms = performance.now() - t0;
            simMsRef.current += (ms - simMsRef.current) * 0.3;
          } else {
            /*
              Frozen or draining, the solver is not stepped, and magnetFor was
              only ever asked from the step. But it is also where a hold is
              read: where it tells the app the hand brought a magnet
              (onMagnetInHand) and where a let-go is noted as set down. So a
              hold while the show was frozen or draining gave the look no
              magnet, and a hold after Start did (PLAN.md 9s). Asked here for
              that alone, with the step's settings thrown away: a frozen plate
              does not move, so a magnet under it pulls nothing until it is
              thawed, as a real dish set down would not flow either, and then
              the magnet is where the hand left it with the strength it was
              given. Only with a hand on it, so a look's own magnet is left as it
              was through a drain (but for the one call that finds the look
              has moved its magnet since the hand let go, which forgets the
              hand and walks one step, as the solver's step would).
            */
            if (magnetHandRef.current) magnetFor(patch.layer(0));
          }
        }

        // GPU fields come back to the CPU once per frame for the readers below
        for (const fluid of fluidsRef.current) fluid.syncFromGpu();

        // ── Housekeeping & rotation (once per rendered frame) ──
        let hasContent = false;
        const isDarkBlend = currentSettings.blendMode === 'multiply';

        for (let l = 0; l < fluidsRef.current.length; l++) {
          const fluid = fluidsRef.current[l];

          // Check if there's content
          for (let i = 0; i < GRID_AREA; i++) {
            if (fluid.readDensity[i] > 0.001) { hasContent = true; break; }
          }

          // Emergency seeding
          if (!hasContent && time % 5 < 0.02 && l === 0 && drainFrameRef.current === 0) {
            const color = harmonyColor(harmonyRef.current);
            fluid.addDensity(GRID_SIZE / 2, GRID_SIZE / 2, 5.0, color.r, color.g, color.b);
          }

          // Update rotation angles
          if (isActiveRef.current) {
            let rotationMod = 0;
            let dirMod = l % 2 === 0 ? 1 : -1;
            /*
              The motor's own way round, which the music does not sway.

              `dirMod` below becomes the music's sway on a look with a band
              routed to rotation, and it crosses zero: with the band quiet
              (every feature near 0) it is 0.4 − 1.2 = −0.8, the plate pushed
              backwards. That is the music's push, and it used to carry the
              motor with it, which cost nothing while the motor was a
              thousandth of a radian a second. Since the motor's stir went
              onto the dish (PLAN 22j) the motor is most of what turns
              acid-trip (0.31 rad/s), and a quiet bar would have turned that
              whole dish backwards at a quarter of a radian a second. A motor
              holds its way round whatever the band does; the band's share
              keeps its sway exactly as it had it.
            */
            let motorWay = dirMod;

            if (currentAudioData && currentSettings.audioMappings) {
              const mappedFeature = currentSettings.audioMappings.rotation;
              if (mappedFeature !== 'none') {
                const mappedSpeed = getAudioValue(currentAudioData, mappedFeature as AudioFeatureKey);
                const layerFeatures = [
                  getAudioValue(currentAudioData, 'timbre'),
                  getAudioValue(currentAudioData, 'complexity'),
                  getAudioValue(currentAudioData, 'energy'),
                  getAudioValue(currentAudioData, 'treble'),
                ];
                const layerFeature = layerFeatures[l % layerFeatures.length];
                rotationMod = mappedSpeed * 0.04 + layerFeature * 0.03;
                const sway = (layerFeature - 0.4) * 3.0;
                dirMod = (l % 2 === 0 ? 1 : -1) * 0.4 + sway;
              }
            }

            /*
              Which way round, chosen rather than assumed.

              `dirMod` above is the plate's index: even plates one way, odd
              plates the other, which is where the shear between two dishes
              comes from and is why it stays the default. It was also the only
              option — a show could not turn its plates the same way, which is
              the projectionist's move, one motor under the whole wall.
            */
            const dirChoice = currentSettings.spinDirection ?? 0;
            if (dirChoice > 0.5) { dirMod = Math.abs(dirMod); motorWay = 1; }
            else if (dirChoice < -0.5) { dirMod = -Math.abs(dirMod); motorWay = -1; }

            /*
              A hand on a dish is never a motor.

              Wander moves the *direction* rather than the speed, which is why
              it can turn the plate back on itself: past about 0.45 the term
              crosses zero and the dish slows, stops and comes back, the way a
              plate being nudged by hand does. Under that it is a breath on a
              held speed. It is noise rather than a random number per frame,
              because the flywheel below integrates this and white noise would
              average to nothing at all — measured as no visible change at any
              setting before it was made coherent.
            */
            const wander = Math.max(0, Math.min(1, currentSettings.spinWander ?? 0));
            if (wander > 0.001) {
              /*
                A wall clock, not the simulation's.

                This read `time`, which is `simulationTimeRef` — realDt times
                the time multiplier, so it runs at the look's own speed and
                all but stops on a slow one. The drift was then frozen at
                whatever value it happened to hold: measured at full wander as
                139 readings backwards out of 140 with *less* variation than a
                steady motor, which is a stuck number rather than a drift, and
                raising the multiplier only made the stuck value stronger.

                A hand nudging a dish does not slow down because the look is
                slow, so this runs on its own clock.
              */
              const w = noise2D(wanderClockRef.current * 0.12 + l * 37.1, 11.5);   // -1..1, drifting
              /*
                3.4, chosen from what the noise actually does.

                The term flips the plate when `w < -1/(wander*k)`, and the
                drift was measured over ten minutes rather than assumed: it
                runs to about ±0.93 and sits below -0.29 for 30% of the time,
                below -0.59 for 12%. At 3.4 that makes the top of the dial
                turn back on itself regularly, half the dial an occasional
                change of mind, and the bottom third a breath on a held speed
                — which is the progression the label promises. At 2.2 the top
                of the dial needed -0.455, a fifth of the time, and twenty
                seconds of watching never caught one.
              */
              dirMod *= 1 + w * wander * 3.4;
              motorWay *= 1 + w * wander * 3.4;
            }

            /*
              The dial as a speed, rad/s (lookMotorRate, lib/turntable.ts,
              which says why it bends at a tenth).
            */
            // This plate's own motor: `rotationSpeed` is a solver key, so a
            // back plate with a look of its own (§16a), or a patch aimed at
            // one plate, turns that dish at its own speed, not the front's.
            const asked = Math.max(0, patch.layer(l).rotationSpeed ?? 0);
            const motorRate = lookMotorRate(asked);

            /*
              How hard the music pushes, kept off by default.

              Nine shipped looks route a band to rotation already and the
              amount they get is part of how they read, so that arithmetic is
              untouched. This adds to it and starts at zero, which is what
              those looks have always had, and reaches a flick's worth at the
              top for anyone who wants the bass actually turning the plate.
            */
            const audioDepth = Math.max(0, Math.min(1, currentSettings.spinAudioDepth ?? 0));

            // Use realDt only — never timeMultiplier, which spikes with audio energy
            const musicSpeed = Math.abs(rotationMod) * (0.3 + audioDepth * 26);
            /*
              An angle that accumulates cannot be allowed to go non-finite.

              Everything else recovers when the bad value goes away: a NaN
              velocity is overwritten next step, a NaN colour is one frame.
              This is a running total, so `angle += NaN` is NaN for the rest
              of the session — and the angle turns the dish, so the plate is
              sampled through a broken transform from then on and never comes
              back. A plate that has gone strange and *stays* strange after
              the setting is put back is this line.
            */
            /*
              The plate as a flywheel.

              `motor` is the motor: the speed the plate is *asked* to
              hold (the dial's, its way round, and the music's push), and the flywheel relaxes toward it rather than being set
              to it. With the motor at zero — which is most looks — a flick
              spins the plate up and the bed it rests on brings it back to
              rest, which is the whole point.

              Drag comes from what it is resting on, as well as from the
              slider. A syrupy dish squeezed flat against the glass takes the
              spin out of a plate faster than a thin one barely touching, so
              `viscosity` and `platePressure` are in it. Viscous relaxation
              on its own only ever *approaches* rest, so there is a dry
              friction term as well: without it a flicked plate creeps for
              ever at a speed too small to see and too large to be stopped.
            */
            const motor = lookMotor(motorRate, motorWay, musicSpeed, dirMod);
            const bed = (currentSettings.viscosity === 'thin' ? 0.8 : 1.7)
              * (1 + (patch.layer(l).platePressure ?? 0) * 0.8);
            /*
              The range was measured and widened. At (0.15 + drag*3) a flicked
              plate lost three-quarters of its speed in 2s at the slowest
              setting and stopped dead at the fastest, so the slider had one
              useful end. This gives a half-life of about eight seconds at 0 —
              a plate that coasts lazily across a whole phrase — a second at
              the default, and a quarter of a second at 1.
            */
            const dragRate = (0.04 + (currentSettings.spinDrag ?? 0.25) * 1.2) * bed;
            const vel0 = spinVelRef.current[l] ?? 0;
            // Dry friction, toward the motor's speed: with no motor that is rest (dishFollow).
            const vel = dishFollow(vel0, motor, dragRate, realDt);
            if (Number.isFinite(vel)) spinVelRef.current[l] = vel;
            /*
              The turntable (PLAN §22, lib/turntable.ts): Auto Spin's motor
              and a hand on the Spin tool, with the same bed and drag as the
              look's flywheel above. It is the same dish, not a second one
              (22h): the two speeds add, and the liquid follows their sum
              below. They are kept apart only because they are steered
              apart: the look's motor by the look and the music, this by
              Auto Spin, its tempo lock and the hand.

              Auto Spin's direction is the plate's (which layer, Spin
              Direction) and the Rate's sign, and nothing else: the music's
              sway moves the look's motor, not this one, or a dish locked to
              the tempo would be pushed off the beat by the music it is
              locked to. Its lock reads this dish's angle alone for the same
              reason.
            */
            const way = dirChoice > 0.5 ? 1 : dirChoice < -0.5 ? -1 : (l % 2 === 0 ? 1 : -1);
            const auto = (autoSpinRef.current[l] ??= new AutoSpin());
            const clock = beatClockRef.current;
            const tempo = clock.period > 0 && clock.confidence >= 0.5 && clock.nextBeat > 0
              ? { periodMs: clock.period, nextBeatMs: clock.nextBeat, nowMs: showNow() } : null;
            const autoRate = way * auto.target(Math.round(currentSettings.spinAuto ?? 0), currentSettings.spinRpm ?? 6,
              currentSettings.spinBeats ?? 16, tempo, way * (dishAngleRef.current[l] ?? 0));
            const dish0 = dishSpinRef.current[l] ?? 0;
            /*
              A hand on the dish turns it: the dish takes the hand's speed
              round its middle, times the tool's Amount, as fast as a hand
              grips glass, and a hand held still stops it. What the hand
              sets is the whole dish's speed, the look's turning included, so
              the turntable takes up the difference; let go, it coasts back
              to Auto Spin's speed on its drag. Tempo's lock lets go under a
              hand, so it does not wind the dish back to the beat against it.
            */
            const hands = spinHandsRef.current[l];
            hands?.forgetQuiet(showNow(), 250, 'gesture');
            const held = hands?.rate(showNow()) ?? null;
            let dishVel: number;
            if (held !== null && Number.isFinite(held)) {
              const want = held - (spinVelRef.current[l] ?? 0);
              dishVel = dish0 + (want - dish0) * (1 - Math.exp(-realDt / GRIP_SECONDS));
              auto.release();
            } else {
              dishVel = dishFollow(dish0, Number.isFinite(autoRate) ? autoRate : 0, dragRate, realDt);
            }
            if (Number.isFinite(dishVel)) dishSpinRef.current[l] = dishVel;
            const dishNow = dishSpinRef.current[l] ?? 0;
            if (Number.isFinite(dishNow * realDt)) dishAngleRef.current[l] = (dishAngleRef.current[l] ?? 0) + dishNow * realDt;
            /*
              And the liquid follows the whole dish with the drag time of its
              gap: three seconds for water, a sixth of one for the thick
              liquid. The picture turns with the liquid, because the liquid
              is what the lamp shines through; the dish itself is never seen.

              The whole dish, the look's turning included (PLAN 22h). Until
              then the look's motor, its music and a flick turned the picture
              rigidly, as if the liquid were bolted to the glass, and only
              the turntable went through the gap. That made a flicked plate
              of water go round at once and a turntable's the same speed
              trail by three seconds, two dishes of one glass. One dish now:
              a flick on a thin look leaves the water behind for a moment
              and it catches up (`npm run turntable`: 63% in one drag time,
              to 2%), and the solver's swirl, the dish's drag where the glass
              is pressed close (Ω − ω_l), and its centrifuge (ω_l) see every
              turn of the dish, not just the turntable's.

              What it changes on the shipped looks, measured in `npm run
              turntable` rather than guessed: a look with a steady motor ends
              where it did, Ωτ behind (a few thousandths of a radian on any
              of them); a thick look is unchanged to within its 0.15 s; the
              nine thin looks with music routed to rotation have their sway
              smoothed by the water's three seconds, as a dish of water
              would, and the swirl runs while they play. Judged on the Mac,
              `docs/judging.md` §28.

              An angle that accumulates cannot be allowed to go non-finite
              (the note above); dishFrame returns a finite turn or none.
            */
            const tau = dragSeconds(carrierViscosity(currentSettings.viscosity));
            const frame = dishFrame(spinVelRef.current[l] ?? 0, dishNow, liquidSpinRef.current[l] ?? 0, realDt, tau);
            if (Number.isFinite(frame.liquid)) liquidSpinRef.current[l] = frame.liquid;
            if (fluidsRef.current[l]) {
              fluidsRef.current[l].dishSpin = frame.dish;
              fluidsRef.current[l].liquidSpin = liquidSpinRef.current[l] ?? 0;
            }
            rotationAnglesRef.current[l] += frame.turn;
            const fl = fluidsRef.current[l];
            if (fl) {
              fl.plateAngle = rotationAnglesRef.current[l] ?? 0;
              /*
                A render frames by its film, not by the window. The element's
                CSS box is the window's (a render letterboxes the canvas in it,
                `objectFit: contain`), so a 16:9 film rendered from a 16:10
                window got gravity's reach worked out for a frame it does not
                have, and the same seed rendered from two window sizes was two
                films. The canvas's pixels are the film's while rendering;
                live it reads the box, exactly as it always did.
              */
              const [vw, vh] = rendering ? [canvas.width, canvas.height] : [canvas.clientWidth, canvas.clientHeight];
              const drawn = Math.max(1, 1.5 * Math.max(vw, vh));
              fl.viewHalfW = 0.5 * vw / drawn;
              fl.viewHalfH = 0.5 * vh / drawn;
            }
          }
        }

        // ── Macro camera ──────────────────────────────────────
        // Locks the frame onto one bead of dye. Off, this stays at the plate-wide
        // framing (centre 0.5,0.5 at zoom 1) and costs nothing.
        /*
          How far in we are, from the zoom alone.

          This used to be `macroMode === true` and nothing else, which made the
          zoom slider inert until a toggle somewhere else was found and turned
          on — and made the closeup a cut rather than a move: one frame at the
          plate, the next at six times on a bead, with a different exposure,
          a different depth of field and a different silhouette.

          The zoom is the control now. At 1 the frame is the whole plate; past
          it the camera picks a subject and pushes in, and `macroAmount` carries
          how far along that travel we are so the closeup's own behaviours can
          fade in over it instead of switching. Fully in by two times, which is
          about where a bead is big enough for any of them to read.

          `macroMode` is still honoured for the looks and saved shows that set
          it: on with a zoom nobody moved means the framing it has always meant.
        */
        // The slider and the zoom keys write macroMode = (zoom > 1.05) alongside
        // the zoom, so a floor of 4x under macroMode made every zoom from 1.05
        // to 4 render at 4x. The floor is only for a look that turns macroMode
        // on and leaves the zoom where it was.
        const wantZoom = macroZoomOf(currentSettings);
        const macroAmount = macroAmountOf(currentSettings);
        const macroOn = wantZoom > 1.005;
        if (macroOn !== lastMacroOnRef.current) {
          lastMacroOnRef.current = macroOn;
          if (macroOn) macroCamRef.current.reset();   // pick a fresh subject on the way in
        }
        if (macroOn && fluidsRef.current.length > 0) {
          if (isActiveRef.current && drainFrameRef.current === 0) {
            const subject = fluidsRef.current[activeLayerRef.current] ?? fluidsRef.current[0];
            const maxDim = Math.max(canvas.width, canvas.height) * 1.5;
            const camBass = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            macroShotRef.current = macroCamRef.current.update(
              { density: subject.readDensity, vx: subject.readVx, vy: subject.readVy, size: GRID_SIZE },
              realDt,
              {
                zoom: wantZoom,
                chase: currentSettings.macroChase ?? 0.6,
                hold: Math.max(0.5, currentSettings.macroHold ?? 5),
                floor: filmLevelRef.current,
                energy: currentAudioData ? Math.min(1, currentAudioData.energy) : 0,
                sync: currentSettings.macroSync ?? 0,
                bass: camBass,
                beat: kickRef.current.kick,
                treble: currentAudioData ? Math.min(1, currentAudioData.treble / 70) : 0,
                spanX: canvas.width / maxDim,
                spanY: canvas.height / maxDim,
                mode: currentSettings.macroCamera ?? 'hold',
                aimX: currentSettings.macroAimX ?? 0.5,
                aimY: currentSettings.macroAimY ?? 0.5,
              },
            );
            camBassRef.current = camBass;
          }
          /*
            Leaving the middle of the plate over the travel in, not at the
            first notch. The camera goes to its subject as soon as there is
            a zoom at all, and at 1.1x the frame may already move a fifth of
            the plate: the first step of the slider was a lurch sideways.
          */
          const raw = macroShotRef.current;
          macroShotRef.current = { ...raw, cx: 0.5 + (raw.cx - 0.5) * macroAmount, cy: 0.5 + (raw.cy - 0.5) * macroAmount };
        } else {
          macroShotRef.current = { cx: 0.5, cy: 0.5, zoom: 1, whip: 0 };
        }
        const shot = macroShotRef.current;

        // ── Macro film exposure ───────────────────────────────────
        // The solver spreads dye into a wash whose absolute density depends on
        // the preset, the audio and how long it has been running. A closeup
        // needs a *subject*, so read the plate's own density histogram each
        // frame and expose for it: everything under the level where the top
        // fifth of the plate begins renders as bare ground, and the range
        // above it is stretched to full opacity. Slewed, so exposure drifts
        // rather than pumping.
        if ((macroOn || (currentSettings.exposure ?? 0) > 0.001) && fluidsRef.current.length > 0) {
          const f0 = fluidsRef.current[activeLayerRef.current] ?? fluidsRef.current[0];
          const bins = filmHistRef.current;
          bins.fill(0);
          let samples = 0;
          for (let j = 1; j < GRID_SIZE - 1; j += 3) {
            for (let i = 1; i < GRID_SIZE - 1; i += 3) {
              const d = f0.readDensity[i + j * GRID_SIZE];
              const b = d <= 0 ? 0 : Math.min(FILM_BINS - 1, (d * FILM_BIN_SCALE) | 0);
              bins[b]++;
              samples++;
            }
          }
          // Walk down from the densest bin to the paint/ground split and to a
          // near-peak level, and derive the exposure from the two.
          const paintCount = samples * 0.14;
          const peakCount = samples * 0.03;
          let acc = 0, levelBin = 0, peakBin = FILM_BINS - 1;
          for (let b = FILM_BINS - 1; b >= 0; b--) {
            acc += bins[b];
            if (acc >= peakCount && peakBin === FILM_BINS - 1) peakBin = b;
            if (acc >= paintCount) { levelBin = b; break; }
          }
          let level = levelBin / FILM_BIN_SCALE;
          /*
            Never above what is in the frame.

            The level is the plate's: where its densest seventh begins. Zoomed
            far in, the frame is a small patch of that plate, and on a look
            that fills evenly the patch can sit wholly under the level, so all
            of it rendered as bare ground. Measured (npm run controls), Macro
            Zoom at 16 turned Poster 1969, Fractal Dream and Clock Glass black.
            So the level stays under the patch actually being shown.
          */
          if (macroOn) {
            const maxDim = Math.max(canvas.width, canvas.height) * 1.5;
            const hx = 0.5 * canvas.width / maxDim / Math.max(1, shot.zoom);
            const hy = 0.5 * canvas.height / maxDim / Math.max(1, shot.zoom);
            let inView = 0, n = 0;
            for (let sj = -3; sj <= 3; sj++) {
              for (let si = -3; si <= 3; si++) {
                const gx = Math.floor((shot.cx + si / 3 * hx) * GRID_SIZE);
                const gy = Math.floor((shot.cy + sj / 3 * hy) * GRID_SIZE);
                if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) continue;
                inView += Math.max(0, f0.readDensity[gx + gy * GRID_SIZE]);
                n++;
              }
            }
            if (n > 0) level = Math.min(level, 0.6 * inView / n);
          }
          // Floor the spread: a nearly flat histogram would otherwise produce a
          // huge gain and a hard-edged, binary-looking frame.
          const peak = Math.max(level + 0.35, peakBin / FILM_BIN_SCALE);
          const slew = 1 - Math.exp(-2.5 * Math.min(0.25, realDt));
          filmLevelRef.current += (level - filmLevelRef.current) * slew;
          filmGainRef.current += (3.2 / (peak - level) - filmGainRef.current) * slew;
        }

        // ── What the frame is, before anything is drawn ───────
        // These six advance once per rendered frame, and used to advance
        // inside the draw below — which made them the renderer's business
        // rather than the show's. They are the same numbers in the same
        // order; the draw now only reads them. (docs/webgpu-plan.md, P3.)

        // How far the macro detail slides with the paint: plate-uv per unit
        // of the cell clock per unit of the solver's velocity, which the
        // shader multiplies the packed flow by. Zero at the plate itself,
        // where the detail holds still, as it always has.
        /*
          A constant, and the clock does the work (lib/detailFlow.ts).

          This was one step's travel over this frame's `realDt`, and the
          closeup's cells slide by the flow times their whole life so far, so
          every frame time that was not exactly a sixtieth moved all of them
          at once: the reported jitter at 6x, where the cells are big enough
          to see. Now the lead plate counts its dye's travel step by step
          (`cellClock`) and the cells slide on that, so nothing measured from
          a frame is in it. It also no longer needs the frame's peak speed,
          which it read off a sparse pass over the grid every frame: the flow
          is packed raw, in half float, which needs no range (pack.ts).
        */
        const flowRate = macroOn ? CELL_TRAVEL : 0;
        const cellClock = fluidsRef.current[0]?.cellClock ?? 0;

        // The kaleidoscope's phase is integrated here rather than in the
        // shader, so a change of rate does not move where the rig already is.
        // See the note in the fragment source.
        if (isActiveRef.current) kaleidoPhaseRef.current += (currentSettings.kaleidoSpin ?? 0) * realDt * 6.283185307179586;

        // The lamp wanders slowly under the plate, and the plate's own rock
        // moves it too — a tilted plate is lit from a new side.
        {
          const motion = Math.max(0, Math.min(1, currentSettings.lampMotion ?? 0));
          const rock = rockRef.current;
          const lamp = lampRef.current;
          const rockK = Math.max(0, Math.min(1, currentSettings.plateRock ?? 0));
          lamp.x = 0.5 + noise2D(time * 0.021, 11.3) * 0.34 * motion + rock.x * 0.05 * rockK;
          lamp.y = 0.5 + noise2D(13.7, time * 0.017) * 0.34 * motion + rock.y * 0.05 * rockK;
          lamp.x2 = 0.5 - (lamp.x - 0.5) * 0.7 + noise2D(time * 0.019, 27.1) * 0.3 * motion;
          lamp.y2 = 0.5 - (lamp.y - 0.5) * 0.7 + noise2D(29.3, time * 0.023) * 0.3 * motion;
        }

        // The gel wheel turns on its own clock.
        gelAngleRef.current = (gelAngleRef.current + realDt * (currentSettings.gelSpeed ?? 0.5) / 60) % 1;

        // Second-layer throw: zoom grows with the setting, drift is a slow
        // Lissajous so the two scales slide past each other.
        {
          const variety = Math.max(0, Math.min(1, currentSettings.layerScaleVariety ?? 0));
          const view = layer1ViewRef.current;
          view.zoom = 1 + variety * 1.6;
          view.dx = Math.sin(time * 0.05) * 0.07 * variety;
          view.dy = Math.cos(time * 0.037) * 0.07 * variety;
        }

        // The bubbles are packed for whoever draws them. Fewer bubbles, not
        // fainter ones: the setting governs how many are on the plate, and
        // each one still has to read as a lens rather than as a smudge, so
        // its strength starts well above zero and climbs slowly. Scaling both
        // by the same number made a plate at the new default nearly
        // invisible — the harness caught it as "0 pixels changed".
        {
          const bubbleAmt = Math.max(0, Math.min(1, currentSettings.bubbles ?? 0));
          // And the ones blown by hand on a look with none of its own.
          const count = bubbleAmt > 0 || bubblesRef.current.anyBlown ? bubblesRef.current.pack(0.5 + bubbleAmt) : 0;
          bubbleDebugRef.current = {
            count: Math.min(MAX_BUBBLES, count),
            strength: Math.min(0.9, 0.35 + bubbleAmt * 0.8),
            amount: bubbleAmt,
          };
        }

        // The frame the effects run on.
        fxFrameRef.current = fxHoldRef.current ?? (fxFrameRef.current + 1) >>> 0;

        // The beads' mask: redrawn only on the frames they moved, which is
        // what `render()` answers with — null means the last upload still
        // stands. Off, it is not drawn at all, and the shader is told 0.
        const beadMask = (currentSettings.beads ?? 0) > 0 ? beadsRef.current.render() : null;

        // ── The frame, handed to whatever draws it ────────────
        // The renderer reads the show's state through `view` and nothing
        // else, which is what lets a second one take the same call
        // (docs/webgpu-plan.md, P3).
        /*
          The checks' digest of this frame (see `FrameDigest`), taken here,
          after everything the frame decides and before it is drawn. Only
          while a render that asked for it is running: live, and in a render
          nobody is comparing, this is one property read.
        */
        if (rendering?.digestOn) {
          const f0 = fluidsRef.current[0];
          const rd = f0?.readDensity, rvx = f0?.readVx;
          const cell = (fx: number, fy: number) => Math.floor(fx * GRID_SIZE) + Math.floor(fy * GRID_SIZE) * GRID_SIZE;
          let settingsHash = 0x811c9dc5;
          const js = JSON.stringify(currentSettings);
          for (let i = 0; i < js.length; i++) { settingsHash ^= js.charCodeAt(i); settingsHash = Math.imul(settingsHash, 0x01000193); }
          rendering.digest = {
            frame: rendering.frame,
            showNow: showNow(),
            realDt,
            simTime: time,
            steps: simSteps,
            canvas: `${canvas.width}x${canvas.height}`,
            grid: f0?.gpu?.N ?? 0,
            layers: fluidsRef.current.length,
            settings: (settingsHash >>> 0).toString(16),
            active: isActiveRef.current,
            evolve: isAutomatedRef.current,
            audioEnergy: currentAudioData?.energy ?? -1,
            audioBass: currentAudioData?.bass ?? -1,
            kick: kickRef.current.kick,
            kicks: kickCountRef.current,
            loudness: loudnessRef.current,
            tempoMul: tempoMulRef.current,
            phraseDrive: phraseRef.current.drive,
            phraseGust: phraseRef.current.gust,
            phraseDrift: phraseRef.current.drift,
            lfo1: modRef.current.value('lfo1'),
            lfo4: modRef.current.value('lfo4'),
            clockLean: f0?.clockLeanNow ?? 0,
            dt: f0?.dt ?? 0,
            solverSteps: f0?.stepCount ?? 0,
            meanDensity: f0?.meanDensity ?? 0,
            angle: rotationAnglesRef.current[0] ?? 0,
            spin: spinVelRef.current[0] ?? 0,
            rockX: rockRef.current.x,
            rockY: rockRef.current.y,
            lampX: lampRef.current.x,
            lampY: lampRef.current.y,
            gel: gelAngleRef.current,
            kaleido: kaleidoPhaseRef.current,
            filmLevel: filmLevelRef.current,
            filmGain: filmGainRef.current,
            flashGain: flashGainRef.current,
            shot: `${shot.cx},${shot.cy},${shot.zoom}`,
            harmony: harmonyRef.current.join(','),
            beads: beadsRef.current.beads.length,
            bubbles: bubblesRef.current.bubbles.length,
            diceLay: DICE.lay.draws,
            diceMusic: DICE.music.draws,
            diceEvolve: DICE.evolve.draws,
            dicePalette: DICE.palette.draws,
            diceFluid: f0?.rng.draws ?? 0,
            // The plate's other streams, by name (null: not asked for yet),
            // so a stream that drew once more in one render than the other
            // names itself in render-app's log.
            diceHands: streamDraws('plate.hands'),
            diceLiquids: streamDraws('plate.liquids'),
            diceChemistry: streamDraws('plate.chemistry'),
            diceBeads: streamDraws('plate.beads'),
            diceBubbles: streamDraws('plate.bubbles'),
            diceMacro: streamDraws('plate.macro'),
            diceModulators: streamDraws('plate.modulators'),
            dicePhrasing: streamDraws('plate.phrasing'),
            macroClock: macroCamRef.current.time,
            cellClock: f0?.cellClock ?? null,
            magnetHand: magnetHandRef.current ? `${magnetHandRef.current.x},${magnetHandRef.current.y},${magnetHandRef.current.at}` : 'none',
            magnetLook: magnetLookRef.current ? `${magnetLookRef.current.x},${magnetLookRef.current.y}` : 'none',
            rbCentre: rd?.[cell(0.5, 0.5)] ?? -1,
            rbA: rd?.[cell(0.3, 0.3)] ?? -1,
            rbB: rd?.[cell(0.7, 0.35)] ?? -1,
            rbC: rd?.[cell(0.4, 0.72)] ?? -1,
            rbVx: rvx?.[cell(0.5, 0.5)] ?? -1,
            fxFrame: fxFrameRef.current,
          };
        }
        const lum = renderer?.drawFrame({
          settings: currentSettings, time, shot,
          macroOn, macroAmount, isDarkBlend,
          flowRate, cellClock,
          rotations: rotationAnglesRef.current,
          harmony: harmonyRef.current,
          lamp: lampRef.current,
          magnets: magnetsOnPlate(fluidsRef.current[0]?.lastStep ?? null),
          gelAngle: gelAngleRef.current,
          kaleidoPhase: kaleidoPhaseRef.current,
          layer1: layer1ViewRef.current,
          bubbles: bubbleDebugRef.current,
          bubblePack: { packed: bubblesRef.current.packed, shape: bubblesRef.current.packedShape },
          dimmerGain: flashGainRef.current * paceNowRef.current.dim,
          filmLevel: filmLevelRef.current,
          filmGain: filmGainRef.current,
          mark: markRef.current,
          film: filmRef.current,
          audio: { 
            pitchClass: audioDataRef.current?.features?.pitchClass ?? 0, 
            brightness: audioDataRef.current?.features?.brightness ?? 0, 
            beatPhase: beatClockRef.current?.period > 0 
                ? (((time * 1000 - beatClockRef.current.nextBeat) / beatClockRef.current.period) % 1.0 + 1.0) % 1.0 
                : 0 
          },
          beadMask,
          outputCfg: rendering ? DEFAULT_OUTPUT : outputCfgRef.current,
          postForce: postForceRef.current,
          postTest: postTestRef.current,
          fxFrame: fxFrameRef.current,
          fxSeed: fxSeedRef.current,
        }, fluidsRef.current) ?? null;
        // The intro was covering for this frame: the first with a step in it,
        // or the first at all when the show opens paused. The fade begins on
        // the frame the plate is presented, so the plate is never held back.
        introPlateFrame((fluidsRef.current[0]?.stepCount ?? 0) > 0 || !isActiveRef.current);

        /*
          The projector window, in this task (docs/webgpu-plan.md, P3).

          It used to pull: its own rAF, drawing this canvas into its own. A
          presented WebGPU canvas answers that with black, so the projector
          draws it here instead — in the frame task that drew it, where the
          canvas is readable on either engine — and the mirror keeps only the
          letterbox and its own size.
        */
        const mirror = (window as unknown as { __chromaglassMirror?: (c: HTMLCanvasElement) => void }).__chromaglassMirror;
        if (mirror) {
          try { mirror(canvas); } catch { /* the projector window went away mid-frame */ }
        }

        // The flash guard: what the frame just read, folded into the gain the
        // next one is drawn with.
        if (lum !== null) flashGainRef.current = flashRef.current.sample(showNow(), lum);
        else if (flashGainRef.current !== 1) { flashRef.current.reset(); flashGainRef.current = 1; }
      }

      // Governor: judge this frame. A rung change takes effect through the
      // engine block on the next frame, which reallocates the solver and
      // resizes the canvas as needed.
      //
      // `frameS` is the interval since the last frame this loop *drew*, and
      // only frames the draw gate let through get here (PLAN.md §14b). Before
      // the gate, with the wall up, the show's frames and the projector's asks
      // interleaved, so the governor was fed two half-intervals for every
      // refresh: two clocks each managing thirty read as one holding sixty,
      // and it never stepped down while the wall was up.
      if (frameS > 0 && governorRef.current && !rendering) {
        // No heavy post pass exists yet (feedback and slit-scan will be the first).
        governorRef.current.heavyPost = false;
        // What this frame cost the GPU, where the engine can say. Without it
        // the budget is JavaScript time, which on the WebGPU path is half a
        // millisecond of encoding and says nothing about the machine's load.
        const gpuMs = renderer?.gpuFrameMs?.(stepsThisFrame) ?? 0;
        governorRef.current.sample(frameS, performance.now() - workStart, performance.now() * 0.001, isMouseDownRef.current, gpuMs);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    /*
      A song render's hold on the plate (see `VisualizerRender` for the
      contract, lib/render.ts for the other half).

      Everything the plate keeps from one frame to the next that is not the
      glass itself starts from zero here, because a render has to be a
      function of (seed, look, settings, song) and not of the evening before
      it: the time stamps the timers compare against (they held the browser's
      clock, and the show clock has just been handed to the render), the
      phrase, the modulators, the beat clock, the frame counters the beads,
      the drops and the effects count by, the flash guard's memory. The
      solvers are rebuilt rather than cleared, because a solver keeps state
      no clear reaches (its particles' frame count, its grain), and the
      readback rings are told to forget the live plate (gpu/kit.ts).

      Not reset, and so still able to differ between two renders in one
      page: anything a person set (the settings, a locked palette, the layer
      count), and the bead carpet's own dice (cleared, but drawn from its
      stream before the look restarts it, which is the same draw every time).

      That list was longer than it said. The same seed rendered twice in one
      page on CI's Mac came out different on every frame, the first included
      (`npm run render-app`, "the same seed twice draws the same frames: 240
      of 240 frames differ"), and reading every value the frame reads found
      these still carrying the evening into the film, each now reset below
      with the reason where it is done: the plate's rock (a spring, kicked
      live, that tilts the liquid and moves the lamp from the first step),
      the gel wheel's and the kaleidoscope's phases, the film exposure's slew,
      the closeup's last shot, Evolve's stamps and its finger stroke in
      flight, the magnet's memory of where the look put it, each plate's own
      history (FluidSimulation.forgetHistory), the flash probe's last reading
      and the post chain's ring of past frames (rebuilt in `begin`), and the
      grid, which followed the governor's rung of the moment.
    */
    const resetStamps = () => {
      lastTimeRef.current = showEpochS();
      /*
        Evolve's own stamps, on the show clock like the rest of these: a thin
        and a flood are each held back for a few seconds after the last
        (`now - lastThinRef > 9`). Carried into a render, a live stamp (the
        epoch, some 1.8e9 s) held every thin back for the whole film, and
        carried out of one, a film stamp (2^20 ms in, about 1049 s) is simply
        long ago; so an Evolve render's thins depended on whether the live
        show had thinned before it, and the second of two Evolve renders was
        held back by the first one's last thin.
      */
      lastThinRef.current = -1e9;
      lastFloodRef.current = -1e9;
      soapAtRef.current = 0;
      bzSeedAtRef.current = 0;
      liesSeedAtRef.current = 0;
      mazeKickRef.current = { env: 0, at: 0 };
      magnetWalkAtRef.current = 0;
      magnetHandRef.current = null;
      handoffRef.current = null;
      /*
        The back plate's own look (§16a), let go of. A render lays its look on
        every plate, as the look says, from its seed: a back plate on a look of
        the evening's is not something a render can reproduce, and its fade and
        handover are stamped on the live clock, which the film's clock (2^20 ms
        in) would put either all at once or twenty minutes in the future. On the
        way out the plate is the film's last frame, which is the front's look
        on both plates, so the back plate follows the front from there too.
      */
      if (backLookRef.current.active || backDyesRef.current) {
        backLookRef.current.clear();
        backDyesRef.current = null;
        backHandoffRef.current = null;
        onBackLookClearedRef.current?.();
      }
      externalTiltRef.current = { x: 0, y: 0, at: -1e9 };
      journeyRef.current.lastAt = -1;
      flashRef.current.reset();
      flashGainRef.current = 1;
      for (const f of fluidsRef.current) f.forgetPress();
      /*
        The beat clock too, both ways: its onsets and its lock are stamped
        in show milliseconds, which in a render start at 2^20 and live are
        the page's age. Kept across the hand-back, a young page's live clock
        read the render's stamps as in the future and held a lock on a beat
        nobody was playing. Sound learn's pattern is stamped on the same
        clock (the beat it last decided on, the recent levels), so it forgets
        with the clock: kept, the render's first beats would sit before the
        live show's last decided one and no trigger would fire until the
        render's clock had caught up with the page's age.
      */
      beatClockRef.current = new BeatClock();
      /*
        And the kick the loop last handed it is taken as heard: the onset's
        time on the reading now is on the clock being left (song seconds out
        of a render, the page's back into the live show), so the first
        reading on the other clock always differs from it. Forgotten, that
        difference read as a kick, and the fresh clock pressed the plate
        once on the hand-back with nothing playing.
      */
      heardKicksRef.current.lastAt = audioDataRef.current?.features?.onsets?.kick?.at ?? null;
      soundLearnRef.current.reset();
      // The song's shape is timed on the readings' clock, which a render
      // starts again at zero: its history and references belong to the song
      // before, so it starts fresh with the song it is about to hear.
      songShapeRef.current.reset();
      // The bar too, for the same reason: its beats are on the old clock.
      barGridRef.current.reset();
      accentRef.current.reset();
      // And the events it heard go with it: they are stamped on the old clock,
      // and a poll after a render would otherwise read the film's drops as
      // the song's.
      songEventsRef.current = [];
    };
    const resetPlateClocks = () => {
      resetStamps();
      simulationTimeRef.current = 0;
      simAccumRef.current = 0;
      wanderClockRef.current = 0;
      loudnessRef.current = 0;
      tempoMulRef.current = 1;
      kickRef.current = { kick: false, predicted: false };
      kickCountRef.current = 0;
      magnetWalkRef.current = 0;
      phrasingRef.current.reset();
      phraseRef.current = { drive: 1, gust: 0, drift: 0.5 };
      modRef.current.reset();
      beadsRef.current.clear();
      fxFrameRef.current = 0;
      dropClockRef.current = 0;
      dropLaidRef.current = freshLaid();
      beadFrameRef.current = 0;
      gestureFrameRef.current = 0;
      /*
        The rest of what the frame integrates from one frame to the next, at
        the values they are made with. The rock is a damped spring the beat
        kicks (Plate Rock is on by default, 0.45), and its displacement
        tilts every plate and moves the lamp from the render's first step, so
        a render began mid-sway wherever the live show's last kick had left
        it; its phase decides which way the next kick throws it. The gel
        wheel and the kaleidoscope turn by accumulating, the film exposure
        and the closeup slew toward what they read, and a finger stroke
        Evolve had begun would have carried on into the film.
      */
      rockRef.current = { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7, lastBass: 0 };
      lampRef.current = { x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 };
      gelAngleRef.current = 0;
      kaleidoPhaseRef.current = 0;
      filmLevelRef.current = 0.3;
      filmGainRef.current = 4.5;
      macroShotRef.current = { cx: 0.5, cy: 0.5, zoom: 1, whip: 0 };
      // The camera behind the shot, clock and all (see MacroCamera.forget):
      // `reset` alone keeps its clock, which the tremor and breathing are
      // drawn from.
      macroCamRef.current.forget();
      lastMacroOnRef.current = false;
      camBassRef.current = 0;
      lastBass01Ref.current = 0;
      autoStrokeRef.current = null;
      magnetLookRef.current = null;
      lastMagnetRef.current = null;
      // As if the look had just been laid with the amount it has, which it
      // is about to be: the "turned up on a bare plate" pour below reads it.
      phaseAmountRef.current = settingsRef.current.phaseAmount ?? 0;
    };
    renderApiRef.current = {
      begin: async (o) => {
        if (cancelled) throw new Error('the plate was rebuilt (the GPU was lost): start the render again');
        if (!renderer || !stage || glLostRef.current) throw new Error('the plate is not up yet');
        const governor = governorRef.current;
        /*
          The grid: what the settings pin, or for 'auto' the rung this
          machine opens on, never the governor's rung of the moment. That one
          climbs and falls with the live show's frame times, so two renders
          of the same seed a few seconds apart could be laid on two grids,
          which are two films (and the render reports its grid, so the check
          can see which it got).
        */
        /*
          And never above the out-of-memory cap (`gridCapRef`, every shortage
          this session): the opening rung within it for 'auto', and a pinned
          grid larger than it brought down to that rung too, since a render
          is exactly the moment the plate is rebuilt from scratch at its
          grid, and a grid the GPU has refused once it refuses again.
          (`o.grid` is the caller's own, for the checks, and left alone.)
        */
        const cap = gridCapRef.current;
        const within = governor?.openingRungWithin(cap).grid;
        const asked = governor && within !== undefined ? resolveSimResolution(settingsRef.current.simResolution, governor, renderer.maxTexture, within) : 256;
        const grid = o.grid ?? (asked > cap && within !== undefined ? within : asked);
        const stepRate = o.stepRate ?? 60;
        cancelAnimationFrame(animationFrameId);
        renderingRef.current = { fps: o.fps, stepRate, frame: 0, width: o.width, height: o.height, grid, digestOn: !!o.digest, digest: null };
        trackReadbacks(true);
        renderer.resize();
        resize();
        setStaged(true);
        for (const f of fluidsRef.current) {
          /*
            Nothing handed over: the render lays its own look on its own
            grid from the seed, and the live show's ferrofluid or oil in
            its solver would make two renders of one seed differ by what
            the show held when each began (PLAN 9w's carry is for the
            governor's moves, not this).
          */
          if (f.gpu) f.detachGpu(false);
          f.forgetCarry();
          renderer.attachSolver(f, grid);
        }
        /*
          The passes that remember a frame, rebuilt. The flash probe keeps
          its last reading outside its ring (`luminance` answers from it until
          a new one lands), so the render's first frame folded the live show's
          brightness into the flash guard; and the post chain keeps a ring of
          past frames that a delay effect reads. Both are built again on the
          first frame that wants them, knowing nothing of the evening.
        */
        probe?.dispose();
        probe = null;
        chain?.dispose();
        chain = null;
        resetPlateClocks();
        forgetReadbacks();
        const lookId = o.lookId ?? livePresetRef.current;
        layPlateRef.current(lookId);
        {
          // Each plate's own history, after the look has laid its angles.
          const drawn = Math.max(1, 1.5 * Math.max(o.width, o.height));
          fluidsRef.current.forEach((f, l) => f.forgetHistory(rotationAnglesRef.current[l] ?? 0, 0.5 * o.width / drawn, 0.5 * o.height / drawn));
        }
        // The laid plate, read back twice, so the first frame's readers (the
        // dye regulator, the beads) see this plate and not nothing.
        for (let k = 0; k < 2; k++) {
          for (const f of fluidsRef.current) f.syncFromGpu();
          await stage.device.queue.onSubmittedWorkDone();
          await readbacksLanded();
        }
        return { grid, lookId, stepRate };
      },
      step: (audio, timestampUs, durationUs) => {
        /*
          The loss first, then whether a render is running.

          The other way round, a GPU lost mid-render was reported as "step
          with no render running", which is true and says nothing: the loss
          rebuilds the stage through this effect's cleanup, the cleanup ends
          the render from outside (it clears `renderingRef`, so the new loop
          can draw), and by the time the render loop asks this hold for its
          next frame the ref it checked first was already empty. What
          happened was the GPU going away, and that is what the render has
          to say (`npm run render-app`, render L, measured it on the Mac:
          "The render failed: step with no render running."). So everything
          that means "this hold's stage is gone" is asked before anything
          else: the cleanup has run (`cancelled`), the loss handler has run
          and the rebuild has not (`glLostRef`), or there is no stage.
        */
        if (cancelled || glLostRef.current || !stage) throw new Error('the GPU was lost during the render');
        const r = renderingRef.current;
        if (!r) throw new Error('step with no render running');
        audioDataRef.current = audio;
        cancelAnimationFrame(animationFrameId);
        renderFrame();
        r.frame++;
        return new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
      },
      digest: () => renderingRef.current?.digest ?? null,
      settle: async () => {
        /*
          The same order as `step`, on both sides of the wait. Before it: a
          hold whose stage has gone has no queue to wait on, and it used to
          skip the wait and report the frame settled, so the loss surfaced one
          frame later as whatever `step` said. After it: the loss can land
          while this waits (a lost device settles its pending work), and the
          frame just waited for was drawn on a device that no longer exists.
          Either way the render stops here and says why.
        */
        const lost = () => cancelled || glLostRef.current || !stage;
        const gone = () => new Error('the GPU was lost during the render');
        if (lost()) throw gone();
        try {
          await stage!.device.queue.onSubmittedWorkDone();
          await readbacksLanded();
        } catch (e) {
          // A wait that failed because the device went is the loss, not
          // whatever the promise was rejected with.
          throw lost() ? gone() : e;
        }
        if (lost()) throw gone();
      },
      end: () => {
        // The loss first here too: a hold whose stage has gone was already
        // ended by the cleanup that retired it, and has nothing to hand back.
        if (cancelled || !renderingRef.current) return;
        renderingRef.current = null;
        /*
          The solvers' view half-extent back to the window's framing. During
          the render it was the film's (see the frame's rotation block), and
          live it is recomputed each frame, but only while the show is
          active: handed back to a paused show, the plate kept the film's
          framing, so gravity's reach was worked out for a 16:9 film on a
          16:10 window until someone pressed play. Worked out here the way
          the live frame does it, from the element's box.
        */
        {
          const vw = canvas.clientWidth, vh = canvas.clientHeight;
          const drawn = Math.max(1, 1.5 * Math.max(vw, vh));
          for (const f of fluidsRef.current) { f.viewHalfW = 0.5 * vw / drawn; f.viewHalfH = 0.5 * vh / drawn; }
        }
        trackReadbacks(false);
        resetStamps();
        // The flash probe's last reading is the film's last frame, not the
        // room's: built again, as at the start (see `begin`).
        probe?.dispose();
        probe = null;
        audioDataRef.current = liveHeard();
        setStaged(stageRef.current !== null);
        // The loop first, so that a resize which throws on a half-dead
        // device still leaves the show drawing (its guard handles the rest).
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(render);
        try { renderer?.resize(); resize(); } catch (e) { console.error('ChromaGlass: resizing after a render', e); }
      },
    };

    /*
      A frame the projector window can ask for (the wall going fullscreen).

      This loop is `requestAnimationFrame` and nothing else, and a browser
      stops rAF for a window it considers hidden. The projector window mirrors
      whatever *this* window draws — it pushes, it does not pull, because a
      presented WebGPU canvas answers a pull with black — so the moment this
      window is occluded the wall holds its last frame and the show freezes on
      it. Which is exactly what going fullscreen on the second screen does:
      the wall fills a display, this window is behind it, and the picture
      stops.

      So the window that *is* visible drives. The projector runs its own rAF
      and calls this; the draw gate is what keeps that from becoming a second
      clock when both windows are up (PLAN.md §14b, lib/drawGate.ts).

      The guard here used to compare an ask only with the projector's
      previous ask, 6 ms back. The show's own frames never set it, so with
      both windows visible on two displays' clocks every ask drew a second
      frame in the show's refresh: `npm run wall` measured 119.1 to 120.2
      draws a second against a 60 Hz display, with the projector's clock at
      every phase it tried. Now every draw is stamped whichever window asked, and
      an offer within 0.6 of a refresh of the last draw is turned down, an
      ask here or one of this window's own frames in `render` above, but only
      while both clocks are running. With this window covered its own frames
      have stopped, the wall's clock is the only one, and every ask draws,
      however ragged a busy machine makes them.

      `ts` is the time the projector's refresh began, already on this
      window's clock (CastDisplay converts it), so that an ask waiting behind
      this window's draw in the same refresh is still seen as that refresh's.
      An ask without one (a harness, a projector window from an older build)
      is offered at the time it ran, as before.
    */
    (window as unknown as { __chromaglassFrame?: (ts?: number) => void }).__chromaglassFrame = (ts?: number) => {
      if (renderingRef.current) return;             // a render is drawing; the wall mirrors its frames
      const now = performance.now();
      if (!drawGate.offer('ask', refreshStamp(ts, now))) return;   // this refresh already has a frame
      // The ear reads on the wall's clock: with this window covered its own
      // frames have stopped, and so, until PLAN.md §14a, had its hearing
      // (lib/earClock.ts). The plate asks for the reading at the top of the
      // frame (`hear`, PLAN.md §14f), so this frame hears it; it used to go
      // through React and land a frame later. It reads only while this
      // window's frames are
      // missing, so a visible show hears as it did. And only for an ask the
      // gate let through: the ear takes one reading per drawn frame (its
      // smoothing is per reading), so an ask that draws nothing hears
      // nothing either.
      wallAsked(now);
      plateTsRef.current = null;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      draw();
    };

    // ── What `?debug` shows ───────────────────────────────────────────
    // One surface whichever engine is drawing: the show's own state here, and
    // whatever the renderer wants to add spread in at the top level, so a
    // harness reaching for `chromaglassDebug().gl` finds it where it always
    // was (docs/webgpu-plan.md, P3).
    //
    // Built always, because the crash report carries it; only on `window`
    // under `?debug`.
    const debugState = () => ({
        engine: engineStatusRef.current?.label ?? '',
        /** Frames through the loop since the page loaded, live or rendered. */
        frames: framesDrawnRef.current,
        /**
         * The clock the last frame stepped the plate to, in milliseconds on
         * the page's own clock (Date.now, or the render's): what its dish,
         * its liquid and its picture's angle are the state at. `npm run
         * flick` times its flick and its readings by this, not by when it
         * happened to ask.
         */
        frameAt: lastTimeRef.current * 1000,
        /** The draw gate (PLAN.md §14b): offers drawn and turned down by window, and the refresh it is working to. */
        drawGate: { drawn: { ...drawGate.drawn }, skipped: { ...drawGate.skipped }, refreshMs: drawGate.refreshMs(performance.now()), twoClocks: drawGate.twoClocks(performance.now()), stampFallbacks, stampMisses: { ...stampMisses } },
        /** The beat clock's period (ms, 0 unknown) and how sure it is: a lock right after a render is one carried over from it. */
        beat: { period: beatClockRef.current.period, confidence: beatClockRef.current.confidence },
        /** The sound level the next frame will read (`npm run ears` asks whether it keeps moving while this window is hidden). */
        heard: audioDataRef.current ? { volume: audioDataRef.current.volume, energy: audioDataRef.current.energy } : null,
        /** Live frames drawn, how many read a reading the frame before had not, and how many a reading taken on that same frame (§14f). */
        hearing: { frames: hearingRef.current.frames, fresh: hearingRef.current.fresh, ownFrame: hearingRef.current.ownFrame },
        status: engineStatusRef.current,
        governor: governorRef.current,
        /** The solver's own timing: a step's cost, the rate it is managing, and the cap it is under. */
        solver: () => ({
          simMs: simMsRef.current,
          stepsPerSec: stepsPerSecRef.current,
          /** What it is asking for: the governor's rate, or `?steps=` over the top of it. */
          stepRate: PINNED_STEP_RATE ?? governorRef.current?.stepRate ?? 60,
          catchUp: catchUpRef.current,
          layers: fluidsRef.current.length,
        }),
        externalTilt: externalTiltRef.current,
        /** The pointer's Blow since the page loaded: steps as the straw, steps as the wind, and the colour the wind carried. */
        blowSteps: { ...blowStepsRef.current },
        /*
          The seed the show is running on (lib/rng.ts), which a crash report
          then carries too, so a night that went wrong can be played again on
          the same dice. `reseed` runs the show on another from here, as
          `?seed=` would from a fresh load; `window.__cgSeed` reads the same
          number without `?debug`.
        */
        seed: showSeed(),
        reseed: (n: number) => { setShowSeed(n); },
        /*
          What is on each plate, from the last readback: how full it is, its
          mean colour, how many cells are not a number, and the fastest cell.
          A plate that draws as bare ground is either empty or poisoned, and
          the picture cannot tell those apart; this can.
        */
        plateStats: () => fluidsRef.current.map((f) => {
          const d = f.readDensity, vx = f.readVx, vy = f.readVy;
          let nan = 0, vmax = 0;
          for (let i = 0; i < d.length; i++) {
            if (!Number.isFinite(d[i]) || !Number.isFinite(vx[i]) || !Number.isFinite(vy[i])) { nan++; continue; }
            const v = Math.abs(vx[i]) + Math.abs(vy[i]);
            if (v > vmax) vmax = v;
          }
          return { mean: f.meanDensity, colour: [...f.meanColor], nan, vmax };
        }),
        bubbles: bubblesRef.current,
        // What the shader was actually told about them last frame: a bubble
        // that is on the plate but not in these two numbers is not on screen.
        bubbleUniforms: () => ({ ...bubbleDebugRef.current }),
        // The phrasing, so a check can watch the signal rather than guess from
        // the picture whether it is arriving.
        phrase: () => ({ ...phraseRef.current, lean: fluidsRef.current[0]?.clockLeanNow ?? 1, dt: fluidsRef.current[0]?.dt ?? 0 }),
        /*
          Whether the loop reads the liquid as running: the flag the solver's
          step is gated on (Freeze the liquid, F), as the loop sees it, not as
          the App last rendered it. `npm run moving` samples it beside the
          step count, so that a freeze that did not take and a check that
          misread one are told apart (see the freeze's comment there).
        */
        active: () => isActiveRef.current,
        /** Where the pointer is on the plate, in grid cells: where a tool acts. */
        pointer: () => ({ ...mousePosRef.current, down: isMouseDownRef.current, grid: GRID_SIZE }),
        /** A gesture from a hand that is not the pointer (a replayed take, the pad, OSC): `npm run bottles`. */
        gesture: (g: Parameters<typeof performGesture>[0]) => performGesture(g),
        /** The tool the hand holds now, once the pick has reached the loop (`npm run bottles` waits on it). */
        tool: () => activeToolRef.current,
        /** Every finger on the glass, the pointer first, and whether two of them are the camera (npm run phone). */
        /**
         * Every magnet the lead plate was last stepped with (the fingers'
         * too), as the plate draws their spikes. Here beside `hands` rather
         * than with the stage's own hooks, so the phone check can ask it
         * wherever the plate steps, software WebGPU included.
         */
        magnets: () => magnetsOnPlate(fluidsRef.current[0]?.lastStep ?? null),
        hands: () => ({
          hands: [
            ...(isMouseDownRef.current ? [{ ...mousePosRef.current, laid: { ...dropLaidRef.current } }] : []),
            ...[...extraHandsRef.current.values()].map(h => ({ x: h.x, y: h.y, laid: { ...h.laid } })),
          ],
          pinch: pinchRef.current !== null,
        }),
        /** Kicks heard since the plate started: whether the beat is reaching the rides that follow it. */
        kicks: () => kickCountRef.current,
        /** Kick onsets the ear handed the beat clock, each once: what it heard, before the clock's own beats. */
        heardKicks: () => heardKicksRef.current.n,
        /** The music's chances to release air and what it did with them (see `musicBubblesRef`): none released at Audio Impact 0. */
        musicBubbles: () => ({ ...musicBubblesRef.current }),
        beads: beadsRef.current.beads.length,
        beadList: beadsRef.current.beads.map(b => [b.x, b.y, b.r]),
        chemistry: chemRef.current,
        film: filmRef.current,
        fluids: fluidsRef.current,
        rotation: rotationAnglesRef,
        /** Angular velocity per layer, rad/s, and the flick that adds to it. */
        spin: spinVelRef,
        /** The turntable's share of each dish's speed, and the liquid following the whole dish, rad/s (PLAN 22h). */
        turntable: dishSpinRef,
        liquidSpin: liquidSpinRef,
        flick: flickSpin,
        /** Whether the projector's output pass is built (it is not, unless it would change a pixel). */
        outputConfig: outputCfgRef.current,
        markTest: (on: boolean) => {
          if (!on) { markRef.current = null; return; }
          const c = document.createElement('canvas');
          c.width = 128; c.height = 32;
          const g2 = c.getContext('2d')!;
          const ramp = g2.createLinearGradient(0, 0, 128, 0);
          ramp.addColorStop(0, 'rgba(255,255,255,1)');
          ramp.addColorStop(1, 'rgba(255,255,255,0)');
          g2.fillStyle = ramp;
          g2.fillRect(0, 0, 128, 32);
          markRef.current = { source: c, aspect: 4, dirty: true };
        },
        shot: macroShotRef.current,
        aimProbe: { ...aimProbeRef.current },
        gridSize: GRID_SIZE,
        harmony: harmonyRef.current,
        contract: presetContractRef.current,
        paletteWindow: paletteWindowRef.current,
        journey: journeyRef.current,
        lamp: lampRef.current,
        settings: settingsRef.current,
        /*
          Which look is actually on the glass.

          `npm run gig` had to infer it from `renderStyle`, which several looks
          share, so a run that stepped through three presets reported the same
          thing three times and the log could not say what had arrived. The
          crash report carried this all along; the harness hook did not.
        */
        plate: livePresetRef.current,
        /** What Random Evolve has done with its own hands, since the page loaded. */
        autoEvents: { ...autoEventsRef.current },
        /*
          The flash guard's own state, which nothing could see from outside.

          It is the one thing that dims the whole show without a setting
          changing, and it holds once engaged — so when a plate goes dark with
          no setting moved, this is the first thing worth reading. It was not
          on the hook, so a harness could watch a show dim and have no way to
          tell whether the guard had it.
        */
        flash: flashRef.current.state,
        /** The black box: `.last()` is the line before a stop, `.previous()` the last load's tail. */
        crash: crashLog.crashApi,
        /** Make the next `n` frames throw: the guard should carry on, and past SELF_HEAL_FRAMES rebuild. */
        throwFrames: (n: number) => { throwFrames = Math.max(0, n | 0); },
        /*
          The doors S0 closed, made reachable (docs/stability-plan.md, S6).
          Out of memory cannot be caused on demand in a browser, so the hook
          runs the response to it — the cap, the step down — which is the
          half that was never exercised; the detection half is the error
          scope and the uncaptured-error listener, which S2 samples.
        */
        simulateOutOfMemory: () => outOfMemory(fluidsRef.current[0]?.gpu?.N ?? governorRef.current?.rung.grid ?? 0, 'simulated (chromaglassDebug)'),
        stepDownFrames: (n: number) => { stepDownFrames = Math.max(0, n | 0); },
        errorStorm: (n: number) => { stormFrames = Math.max(0, n | 0); },
        ambientSeed: (on: boolean) => { ambientSeedRef.current = !!on; },
        gridCap: () => gridCapRef.current,
        ...(renderer?.debug?.() ?? {}),
      });
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassDebug?: unknown }).chromaglassDebug = debugState;
      // Turn the plates to given angles (radians), for scripts/mirror.mjs to
      // reproduce a report's plate exactly.
      (window as unknown as { chromaglassRotation?: unknown }).chromaglassRotation = (angles: number[]) => {
        angles.forEach((a, i) => { if (Number.isFinite(a) && i < rotationAnglesRef.current.length) rotationAnglesRef.current[i] = a; });
      };
    }
    // What every line of the log carries, and the report's larger parts.
    const unprovide = crashLog.provide('visualizer', () => {
      const status = engineStatusRef.current;
      const rung = governorRef.current?.rung;
      return {
        engine: status?.label ?? 'none',
        rung: rung ? `${rung.grid}²@${rung.dpr}x` : undefined,
        fps: status?.frameMs ? +(1000 / status.frameMs).toFixed(1) : undefined,
        stepsPerSec: +stepsPerSecRef.current.toFixed(1),
        stats: { simMs: +simMsRef.current.toFixed(2), layers: fluidsRef.current.length, beads: beadsRef.current.beads.length, bubbles: bubblesRef.current.bubbles.length },
        plate: livePresetRef.current,
        lost: glLostRef.current,
      };
    });
    crashLog.provideReport({ debug: debugState });

    /**
     * Rebuild the stage from nothing: destroy the device, and the loss
     * handler does the rest — a new device, every pass built again, the look
     * laid again. The one cure for GPU objects that have gone invalid, which
     * nothing else can repair. Three in a minute and it stops, because
     * whatever it is is not something a rebuild fixes.
     */
    const healStage = (why: string): boolean => {
      const now = performance.now();
      const heals = selfHealsRef.current.filter((t) => now - t < 60_000);
      selfHealsRef.current = heals;
      if (heals.length >= 3) {
        crashLog.record('fatal', 'heal', `${why} — and ${heals.length} rebuilds in the last minute did not cure it`);
        return false;
      }
      if (!stage || glLostRef.current) return false;
      heals.push(now);
      console.error(`ChromaGlass: ${why}; rebuilding the stage.`);
      stage.device.destroy();
      return true;
    };

    /**
     * The GPU ran out of memory at this grid. Remember it across rebuilds,
     * and step down: in place when the governor has a rung to spare, by a
     * rebuild when it does not.
     */
    let lastOutOfMemory = -Infinity;
    const outOfMemory = (grid: number, detail: string) => {
      // One shortage reports once per object that failed — a dozen textures
      // in a solver — and it is one step down, not a dozen.
      const at = performance.now();
      if (at - lastOutOfMemory < 2000) return;
      lastOutOfMemory = at;
      gridCapRef.current = Math.min(gridCapRef.current, grid - 1);
      const governor = governorRef.current;
      console.warn(`ChromaGlass: out of GPU memory at ${grid}² (${detail}); capping the grid below it.`);
      /*
        On a projector the ladder is rebuilt under the cap instead: its rungs
        below the opening grid are all at half the stage, so stepping down
        from a grid that ran out of memory would give up the wall's pixels
        for good along with the grid (`stageLadder`). The new ladder opens
        at the largest grid that fits, on the whole stage.
      */
      if (governor && stageRef.current && renderer && !cancelled) {
        govern(renderer, true);
        return;
      }
      if (governor && governor.failRung(performance.now() * 0.001)) return;
      if (!healStage(`out of GPU memory at the smallest grid (${grid}²)`)) {
        setGpuFailure({ failure: 'no-adapter', detail: `out of GPU memory even at ${grid}²` });
      }
    };

    /*
      Error scopes on the frame (docs/stability-plan.md, S2).

      The uncaptured-error listener can count GPU errors but cannot say which
      frame, or which of the things built that frame, produced them. So one
      frame in sixty is drawn inside a validation scope and an out-of-memory
      scope, and so are the two frames after anything that allocates at the
      canvas's size — a resize, the camera, the post chain, the projector pass
      — which is where running out of memory happens that is not the solver's.
      A caught error is logged with the frame it came from and what had just
      been built, and out of memory steps the grid down like any other.
    */
    const SCOPE_EVERY = 60;
    let scopeCount = 0;
    let scopeSoon = 0;
    const scopedFrame = <T,>(device: GPUDevice, draw: () => T): T => {
      const soon = scopeSoon > 0;
      if (soon) scopeSoon--;
      const scoped = soon || ++scopeCount % SCOPE_EVERY === 0;
      if (!scoped) return draw();
      const built = [camera && 'camera', chain && 'post chain', projector && 'projector'].filter(Boolean).join(', ') || 'plate only';
      device.pushErrorScope('out-of-memory');
      device.pushErrorScope('validation');
      try {
        return draw();
      } finally {
        const where = `${soon ? 'the frame after a resize or a new pass' : 'a sampled frame'} (${built})`;
        void device.popErrorScope().then((err) => {
          if (err && !cancelled) console.error(`WebGPU validation error in ${where}: ${err.message.slice(0, 300)}`);
        }, () => { /* the device went; the loss handler has it */ });
        void device.popErrorScope().then((err) => {
          if (err && !cancelled) outOfMemory(fluidsRef.current[0]?.gpu?.N ?? governorRef.current?.rung.grid ?? 0, `${where}: ${err.message.slice(0, 200)}`);
        }, () => { /* as above */ });
      }
    };

    /** A picture upload that may throw, logged once per kind rather than every frame. */
    const uploadFailed = new Set<string>();
    const upload = (what: string, fn: () => void) => {
      try {
        fn();
        uploadFailed.delete(what);
      } catch (err) {
        if (!uploadFailed.has(what)) console.warn(`ChromaGlass: the ${what} picture would not upload; leaving it out.`, err);
        uploadFailed.add(what);
      }
    };

    /*
      The governor, on the ladder for what the canvas is drawn for: the
      laptop's screen, or a projector's own pixels when one is attached
      (PLAN.md §14c, `stageLadder` in lib/platform.ts).

      A stage comes and goes during a show, so this runs again when it does
      (`setStage`), and not only when the renderer starts. It used to run
      only here, which was harmless while a stage's rungs were the laptop's
      rungs anyway. Now they are not: a governor left holding the laptop's
      ladder under a stage would read its rungs as shares of the projector.
      The wall window announces its size on every resize and fullscreen
      change, and most of those change nothing the ladder depends on, so a
      new governor is built only when the rungs differ: a new one starts its
      settling period again and forgets a step rate it had given up.

      And when the rungs do differ but the one it is on is still among them,
      it stays on it. A wall window dragged across 1920×1200, or opened on a
      Retina screen and then fullscreened on the projector, gains or loses
      the 1024² rung and nothing else; opening the new ladder at its start
      would drop a plate that had climbed to 768² back to 512² and rebuild
      the solver mid-show (the pre-push review). Attaching or detaching a
      wall changes every rung, so those still open at the start.
    */
    let ladderKey = '';
    const govern = (r: PlateRenderer, fresh: boolean) => {
      const ladder = qualityLadder(tier, r.info.gpuClass, stageRef.current, gridCapRef.current);
      const key = ladder.rungs.map((x) => `${x.grid}@${x.dpr}`).join(' ');
      if (!fresh && key === ladderKey && governorRef.current) return;
      ladderKey = key;
      const was = fresh ? null : governorRef.current?.rung;
      const keep = was ? ladder.rungs.findIndex((x) => x.grid === was.grid && x.dpr === was.dpr) : -1;
      governorRef.current = new QualityGovernor(
        ladder.rungs,
        PINNED_RUNG ?? (keep >= 0 ? keep : ladder.start),
        performance.now() * 0.001,
        PINNED_RUNG !== null,
      );
      // Below whatever ran out of memory before.
      const g = governorRef.current;
      while (g.rung.grid > gridCapRef.current && g.failRung(performance.now() * 0.001)) { /* down a rung */ }
    };
    reladderRef.current = () => { if (renderer && !cancelled) govern(renderer, false); };

    /** The renderer is up: size it, give the governor its ladder, and go. */
    const startWith = (r: PlateRenderer) => {
      renderer = r;
      govern(r, true);
      r.resize();
      render();
    };


    // ── The stage ─────────────────────────────────────────────────────
    // Before anything else: a canvas holds one kind of context for life, so
    // the stage takes it here and everything else draws through what it
    // returns.
    let stage: WebGPUStage | null = null;
    let camera: WebGPUCamera | null = null;
    let projector: WebGPUOutput | null = null;
    /** The projector sources last frame drew, to scope the frame a new one is built on. */
    let sourcesBefore = '';
    let probe: WebGPUFrameProbe | null = null;
    let chain: WebGPUPostChain | null = null;
    /** The compositor, so the cleanup releases it by name rather than leaving it to the device's destroy (S13). */
    let platePass: WebGPUPlate | null = null;
    let cancelled = false;
    // What the frame costs us, as opposed to how often the display asks for
    // one: a CI runner's display rate says nothing about the stage.
    let cpuMs = 0;
    const size = () => {
      scopeSoon = 2;   // the canvas's own targets are about to be reallocated
      const dpr = dprRef.current;
      const px = renderingRef.current ?? canvasPixelsFor(
        dpr, stageRef.current, stage?.device.limits.maxTextureDimension2D ?? 8192,
        { width: window.innerWidth, height: window.innerHeight },
      );
      canvas.width = px.width;
      canvas.height = px.height;
      return dpr;
    };
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let healthyTimer: ReturnType<typeof setTimeout> | null = null;
    /*
      The device while its pipelines are building, before the stage has it.
      A teardown in that gap (React's development double-run, a heal or a
      resolution change bumping the epoch) destroys it at once, which settles
      every build still pending; waiting for the builds to finish instead held
      a device nobody wanted for as long as they took, compiling alongside the
      next effect's.
    */
    let preparing: GPUDevice | null = null;
    /*
      The device first, then the pipelines, then the show. The solver's first
      step used to ask for forty-four pipelines on the frame, and on a Mac
      with a cold shader cache the GPU process compiled them before it would
      present another frame: nine seconds of a stopped plate a few seconds
      into every CI run (`gpu/prepare.ts`). Built ahead, what the look opens
      with compiles while the starting frame is up and the first step finds
      it waiting; the rest compiles behind the show.
    */
    void WebGPUStage.start(canvas).then(async (s) => {
      if (cancelled || isGpuFailure(s)) return s;
      // `?prepare=0` opens the show the old way, every pipeline built on the
      // frame that first needs it: `npm run startup`'s control, so a run
      // measures the freeze it guards against as well as its absence.
      // The thin gap's pipelines too, which otherwise wait for nothing but
      // build behind the old plate (WebGPUFluid.buildAhead says why).
      if (PREPARE_OFF) { WebGPUFluid.buildAhead = false; return s; }
      /*
        Never the reason the show does not open. The builds themselves cannot
        fail (a pipeline that will not build ahead is left to the frame), but
        the lists are written by hand, and a kernel renamed under one throws
        while it is being read. Before this that name threw inside a frame,
        where the loop catches it; out here nothing would have, and the page
        would have sat on its starting frame with a live device and no stage.
      */
      preparing = s.device;
      try {
        // What the look now up turns on: the opening's, or the one on when a
        // lost device is replaced mid-show (`gpu/opening.ts`).
        // The intro held still while the render pipelines compile (`Quiet`
        // in gpu/prepare.ts says why).
        const got = await prepareShow(s.device, s.format, { float32Filterable: s.gpu.float32Filterable, quiet: { still: introStill, go: introMove } }, openingOf(settingsRef.current));
        if (got.timedOut || got.ready < got.asked) {
          console.warn(`ChromaGlass: ${got.ready} of ${got.asked} pipelines built ahead in ${got.ms} ms${got.timedOut ? ' (stopped waiting)' : ''}; the rest are built on the frame.`);
        }
      } catch (err) {
        console.warn('ChromaGlass: the pipelines could not be built ahead; the frame builds them.', err);
      } finally {
        preparing = null;
      }
      return s;
    }).then((s) => {
      // Too late: this effect has already been torn down. Destroy the device
      // and nothing else — `dispose` would also unconfigure the canvas, and in
      // React's development double-run the canvas is the one the second run
      // is already drawing on, so its next `getCurrentTexture` threw and the
      // loop died (S12). Only in dev, but it looked exactly like the real
      // thing and cost a hunt.
      if (cancelled) { if (!isGpuFailure(s)) s.device.destroy(); return; }
      if (isGpuFailure(s)) {
        // Coming back from a loss, the answer is usually "not yet" rather
        // than "never": ask again, backing off, for about two minutes.
        const tries = recoveryTriesRef.current;
        if (glLostRef.current && tries < RECOVERY_TRIES) {
          recoveryTriesRef.current = tries + 1;
          const wait = Math.min(30_000, 1000 * 2 ** tries);
          console.warn(`ChromaGlass: no device yet after a loss (${s.failure}: ${s.detail}); asking again in ${wait / 1000}s.`);
          retryTimer = setTimeout(() => setGlEpoch((n) => n + 1), wait);
          return;
        }
        console.error(`ChromaGlass needs WebGPU: ${s.failure} (${s.detail})`);
        setGpuFailure(s);
        return;
      }
      stage = s;
      const bornAt = performance.now();
      /*
        A device that has held for five seconds is a recovery that worked, and
        the count of tries starts again. Before this it only started again when
        a device that had lived that long was *lost*, so recoveries in quick
        succession — a heal, then a loss, then another — kept adding to one
        count across unrelated incidents, and a long session could spend all
        eight tries and put up the permanent screen on a loss it would
        otherwise have come back from. The soak's hung-request check found it.
      */
      healthyTimer = setTimeout(() => { if (stage === s) recoveryTriesRef.current = 0; }, 5000);
      // A new device is a new chance for the solver, whatever the last one
      // managed; the failure screen's "Try again" relies on it too.
      gpuSupportedRef.current = null;

      /*
        Errors the device reports on its own, counted. One is a bug to log;
        one every frame is GPU objects gone invalid — a texture that did not
        allocate, a bind group built on it — and a plate that will stay black
        with a device that is still alive, which no loss handler hears about.
        So a sustained stream is treated as a loss: rebuild. Out of memory
        says so, and caps the grid first.
      */
      let errorWindowStart = 0;
      let errorsInWindow = 0;
      s.device.addEventListener('uncapturederror', (e) => {
        if (cancelled || stage !== s) return;
        const error = (e as GPUUncapturedErrorEvent).error;
        if (typeof GPUOutOfMemoryError !== 'undefined' && error instanceof GPUOutOfMemoryError) {
          outOfMemory(fluidsRef.current[0]?.gpu?.N ?? governorRef.current?.rung.grid ?? 0, error.message);
          return;
        }
        const now = performance.now();
        if (now - errorWindowStart > 3000) { errorWindowStart = now; errorsInWindow = 0; }
        if (++errorsInWindow === ERROR_STORM) healStage(`${ERROR_STORM} GPU errors in 3s (last: ${error?.message?.slice(0, 160) ?? 'unknown'})`);
      });
      // The report's GPU and its frame. `grabFrame` is the only read that
      // works: a presented WebGPU canvas reads back black.
      crashLog.provideReport({
        gpu: () => {
          const l = s.device.limits;
          return {
            label: s.gpu.label, gpuClass: s.gpu.gpuClass, fallback: s.gpu.fallback, format: s.format,
            limits: { maxTextureDimension2D: l.maxTextureDimension2D, maxBufferSize: l.maxBufferSize, maxStorageBufferBindingSize: l.maxStorageBufferBindingSize, maxComputeWorkgroupStorageSize: l.maxComputeWorkgroupStorageSize },
            lost: stage !== s,
          };
        },
        grab: () => (stage === s ? s.grabFrame() : null),
      });

      /**
       * The GPU, taken away (docs/webgpu-plan.md, P4).
       *
       * A projector plugged into a running laptop, a Mac switching between
       * its GPUs, a driver resetting under load: the device is lost and
       * every texture, buffer and pipeline with it. WebGPU has no event to
       * say it is back — there is no restore, only a new device — so the
       * recovery is to ask for one, which is what bumping the epoch does:
       * this effect runs again from the top.
       *
       * `cancelled` is already set by then if the loss is our own teardown
       * destroying the device, so a normal unmount goes quietly.
       */
      s.lost.then((info) => {
        if (cancelled) return;
        console.error('WebGPU device lost:', info.reason, info.message);
        crashLog.deviceLost(info.reason);
        // A device that dies as soon as it is made is not "back"; asking for
        // the next one at once only feeds a loop of them. Back off instead.
        const shortLived = performance.now() - bornAt < 5000;
        // Dropping rather than detaching skips a readback from a dead
        // device. The plate is carried across on its last readback (S1),
        // unless the stage has already been rebuilt once in the last minute:
        // then the plate may be what is broken, and a fresh look is safer.
        const recentHeals = selfHealsRef.current.filter((t) => performance.now() - t < 60_000).length;
        const keep = recentHeals < 2;
        let kept = fluidsRef.current.length > 0;
        for (const fluid of fluidsRef.current) kept = fluid.dropGpu(keep) && kept;
        plateKeptRef.current = keep && kept;
        camera = null;
        projector = null;
        probe = null;
        stage = null;
        flashRef.current.reset();
        flashGainRef.current = 1;
        glLostRef.current = true;
        setGlLost(true);
        if (shortLived && recoveryTriesRef.current < RECOVERY_TRIES) {
          const tries = recoveryTriesRef.current++;
          retryTimer = setTimeout(() => setGlEpoch((n) => n + 1), Math.min(30_000, 1000 * 2 ** tries));
        } else {
          recoveryTriesRef.current = 0;
          setGlEpoch((n) => n + 1);
        }
      });

      // Coming back from one. The dye lived in the solver's textures and they
      // died with the device, but the last readback did not: the loss handler
      // put it back into the CPU arrays, and the solver the loop attaches next
      // opens on it — the same plate, a frame or two old (S1). Only when there
      // was nothing to carry, or the stage has been rebuilt twice in a minute,
      // is the look laid again instead.
      if (glLostRef.current) {
        const kept = plateKeptRef.current;
        plateKeptRef.current = false;
        if (!kept) layPlateRef.current(livePresetRef.current, true);
        glLostRef.current = false;
        setGlLost(false);
        crashLog.recovered(`a new device (${s.gpu.label}), ${kept ? 'the plate carried across' : `${livePresetRef.current} laid again`}`);
      }

      /**
       * WebGPU's side of the bargain (docs/webgpu-plan.md, P3).
       *
       * The solver is wired and so is the picture: the show's own loop
       * runs, the fields live in `gpu/fluid.ts`, and the composite draws
       * them over the three pictures the page hands across each frame —
       * then the camera, the post chain and the projector in turn, and the
       * flash probe reads back what the wall got.
       */
      const plate = new WebGPUPlate(s.device, s.format);
      platePass = plate;
      const gpuRenderer: PlateRenderer = {
        info: { renderer: s.gpu.label, gpuClass: s.gpu.gpuClass },
        maxTexture: s.device.limits.maxTextureDimension2D,
        resize: () => { size(); },
        attachSolver(fluid, wantRes) {
          if (wantRes <= 0) {
            if (fluid.gpu) fluid.detachGpu(false);
            return true;
          }
          if (fluid.gpu && fluid.gpu.N === wantRes) return true;
          /*
            The old solver goes before the new one is built, not after: at
            the top rungs a solver is a couple of hundred megabytes a layer,
            and holding both across the swap doubled the peak at exactly the
            moment the governor had decided there was room — the moment most
            likely to find there was not. `detachGpu` carries the field to
            the CPU arrays, and the new solver starts from them as before.
          */
          if (fluid.gpu) fluid.detachGpu();
          try {
            /*
              And out of memory is not an exception. A texture the GPU cannot
              hold comes back as an invalid object, silently, and every frame
              after that draws nothing — the black plate with a live device
              that no loss handler ever hears about. The scope is how it is
              heard: if it catches one, this solver is dropped and the
              governor steps down (see `outOfMemory`).
            */
            s.device.pushErrorScope('out-of-memory');
            const solver = new WebGPUFluid(s.device, wantRes, GRID_SIZE, {
              float32Filterable: s.gpu.float32Filterable,
              timestamps: s.gpu.timestamps,
            });
            solver.stageTimings = STAGE_TIMINGS;
            fluid.attachGpu(solver);
            void s.device.popErrorScope().then((oom) => {
              if (!oom || cancelled || stage !== s) return;
              // Keeping the plate: this solver never spoke, so what comes back
              // is the seed it opened on, and the smaller one opens on that.
              if (fluid.gpu === solver) fluid.dropGpu(true);
              outOfMemory(wantRes, oom.message);
            }, () => { /* the device went; the loss handler has it */ });
            return true;
          } catch (err) {
            /*
              No degraded show (docs/webgpu-plan.md, the decision).

              Dropping to the CPU solver is what this used to do, and while
              WebGPU was behind a flag that was a reasonable way to keep
              drawing. It is not one now: this stage samples the solver's
              textures, so a field on the CPU is a field it cannot draw —
              the plate would simulate perfectly well behind a black screen,
              which is the failure CI found on the ladder's bottom rung.

              So say so instead. A machine that cannot run the solver gets
              the same screen as a machine with no WebGPU at all.
            */
            fluid.dropGpu();
            /*
              But first, smaller. A grid that will not allocate is far more
              often a GPU short of memory — a projector's framebuffer added
              mid-set, another tab, the rung the governor had just climbed to
              — than a GPU that cannot run the show, and this used to end the
              show on the spot, with no way back but a reload. So the governor
              drops a rung and never climbs back to this one; the next frame
              attaches there. Only the bottom rung failing is the screen.
            */
            const governor = governorRef.current;
            if (governor && governor.failRung(performance.now() * 0.001)) {
              console.warn(`ChromaGlass: the solver would not start at ${wantRes}²; stepping down a rung.`, err);
              return true;
            }
            console.error('ChromaGlass: the WebGPU solver would not start.', err);
            setGpuFailure({
              failure: 'no-adapter',
              detail: `the solver would not start at ${wantRes}²: ${String(err).slice(0, 120)}`,
            });
            return false;
          }
        },
        drawFrame: (view, fluids) => scopedFrame(s.device, () => {
          const t0 = performance.now();
          // Every layer whose solver is the WebGPU one. A field still on
          // the CPU has nothing for the compositor to sample, so it sits
          // this frame out rather than drawing a stale plate.
          const fields = fluids
            .map((f) => (f.gpu instanceof WebGPUFluid ? f.gpu.fields : null))
            .filter((f): f is NonNullable<typeof f> => !!f);
          if (fields.length && stage) {
            // The three pictures the page hands over, on the frames they
            // change: the beads' mask when they moved, the mark on the
            // frame it arrives, and the film's frame every frame it plays.
            // The uniforms are told about each of them in `plateUniforms`,
            // under the same conditions, or the shader would be drawing a
            // picture it had not been given.
            //
            // Each upload is fenced. `copyExternalImageToTexture` throws on
            // a picture it cannot take — a video whose camera track ended, a
            // frame the size of which changed between measuring and copying,
            // a cross-origin image — and a throw here used to end the loop.
            // A picture that will not upload is left out of this frame.
            if (view.beadMask) upload('beads', () => plate.setSource('beads', view.beadMask!));
            const mk = view.mark;
            if (!mk) { plate.setSource('mark', null); chain?.setMark(null, 0, 0); }
            else if (mk.dirty) {
              // Clean whatever happens: a mark that will not upload once will
              // not upload the next sixty times either.
              mk.dirty = false;
              upload('mark', () => {
                plate.setSource('mark', mk.source);
                // The chain's finish lays the mark over the frame when it is
                // the one finishing, so it needs the picture as well.
                const [mw, mh] = pictureSize(mk.source);
                chain?.setMark(mk.source, mw, mh);
              });
            }
            const film = view.film;
            if (film.kind !== 'none' && film.video && film.video.readyState >= 2 && film.video.videoWidth > 0) {
              upload('film', () => plate.setSource('film', film.video!));
            }
            // Two passes when the camera is on: the plate is
            // drawn into a texture and the camera looks at it, because
            // refraction, depth of field, bloom and the sensor's roll-off
            // all need the finished picture to sample from. Built the first
            // frame it would do anything and dropped when it would not, so
            // a show without a camera never pays for the second target.
            const camAmt = Math.max(0, Math.min(1, view.settings.camera ?? 0));
            if (camAmt > 0.001 && !camera) { camera = new WebGPUCamera(s.device, s.format); scopeSoon = 2; }
            else if (camAmt <= 0.001 && camera) { camera.dispose(); camera = null; }
            const cam = camera;

            // The post chain, when an effect is on. None exist yet; the
            // harness's test effect is what runs (docs/filters-plan.md,
            // F0). Off, none of it is built and the plate finishes the
            // frame itself, exactly as before there was a chain.
            const postTest = view.postTest;
            // A look asking for film stock is what builds the chain, the same
            // as the harness's test effect is (F1).
            const wantStock = (view.settings.stock ?? 0) > 0.001;
            const wantPost = view.postForce || (postTest?.mode ?? 0) > 0 || wantStock;
            if (wantPost && !chain) {
              chain = new WebGPUPostChain(s.device, s.format);
              scopeSoon = 2;
              // A mark that arrived before the chain did: it is uploaded on
              // the frame it arrives and never again, so a chain built
              // later would finish every frame without it.
              if (view.mark) {
                const [mw, mh] = pictureSize(view.mark.source);
                chain.setMark(view.mark.source, mw, mh);
              }
            } else if (!wantPost && chain) { chain.dispose(); chain = null; }
            const post = chain;

            // The projector, last: flip, corner pin, blanking and grade.
            // Built the first frame it would change anything and dropped
            // when the operator resets it, so the common case — no
            // projector, nothing set — never pays for the extra target or
            // the extra draw.
            const wantOut = !outputIsIdentity(view.outputCfg);
            if (wantOut && !projector) { projector = new WebGPUOutput(s.device, s.format); scopeSoon = 2; }
            else if (!wantOut && projector) { projector.dispose(); projector = null; }
            const out = projector;
            const quads = out ? fillOutputUniforms(out.pack, view.outputCfg, canvas.width, canvas.height) : 0;
            fillPlateUniforms(plate.pack, {
              view, fluids,
              width: canvas.width, height: canvas.height,
              derived: true,
              grid: fields[0].dye.width,
              // The plate leaves the grain to the camera when it is on, and
              // still dithers into its 8-bit texture, or a dark ramp bands
              // before the camera ever sees it.
              cameraOn: !!cam,
              // With a chain, the finish happens at the end of it instead.
              postChain: !!post,
            });
            /*
              A projector's own source (PLAN.md §16b): the front plate alone,
              the back plate alone or the film alone, for each one an enabled
              surface asks for, and nothing at all when every surface shows
              the wall. Each is filled from the frame's settings with the
              other rows at nothing (lib/plateSources.ts), with no camera and
              no chain, so its display pass does its own finish: the dimmer,
              the flash guard's gain and the logo, as the wall has them.
            */
            const sourcesNow = out ? sourcesAskedFor(view.outputCfg) : [];
            // A source picked mid-show allocates two canvas-sized textures on
            // its first frame (the output's and the plate's second target):
            // scope that frame, as a new projector's is, so running out of
            // memory there steps the governor down rather than blacking every
            // projector with a bind group that fails each frame.
            const sourcesKey = sourcesNow.join(' ');
            if (sourcesKey !== sourcesBefore) { if (sourcesNow.some(k => !sourcesBefore.split(' ').includes(k))) scopeSoon = 2; sourcesBefore = sourcesKey; }
            plate.keepSources(sourcesNow);
            out?.keepSources(sourcesNow);
            for (const kind of sourcesNow) {
              fillPlateUniforms(plate.sourcePack(kind), {
                view: { ...view, settings: sourceSettings(kind, view.settings) }, fluids,
                width: canvas.width, height: canvas.height,
                derived: true,
                grid: fields[0].dye.width,
                cameraOn: false,
                postChain: false,
              });
            }
            // What the finish needs, taken from the uniforms the plate was
            // just given rather than worked out a second time here: the
            // dimmer with the flash guard folded in, and the mark's fader
            // and rectangle. One mapping, so the two cannot drift.
            const [dimmerNow] = plate.pack.get('dimmer');
            const [markOnNow] = plate.pack.get('markOn');
            const markRectNow = plate.pack.get('markRect') as [number, number, number, number];
            const markGradeNow = plate.pack.get('markGrade') as [number, number, number, number];
            const [markBlendNow] = plate.pack.get('markBlend');
            if (cam) {
              fillCameraUniforms(cam.pack, {
                time: view.time,
                amount: camAmt,
                refraction: view.settings.refraction ?? 0,
                chromatic: view.settings.chromaticAberration ?? 0,
                focus: view.settings.focus ?? 0.5,
                aperture: view.settings.aperture ?? 0,
                bloom: view.settings.bloom ?? 0,
                // Into the chain's half floats, nothing: its finish
                // dithers once, at the end.
                dither: post ? 0 : 1,
              }, canvas.width, canvas.height);
            }
            // The painter stays set, so `grabFrame` photographs the picture
            // rather than an empty pass.
            stage.paint = (encoder, target) => {
              const size = { width: canvas.width, height: canvas.height };
              /*
                The fields are read here rather than taken from the frame
                that set this painter, because the painter outlives that
                frame: `grabFrame` runs it again later, and by then a rung
                change may have disposed the solver those textures belonged
                to. A submit answers that with "Destroyed texture used in a
                submit" — which is what CI's show night found on the first
                run that had a machine slow enough to change rung while a
                harness was photographing the plate.
              */
              const live = fluidsRef.current
                .map((f) => (f.gpu instanceof WebGPUFluid ? f.gpu.fields : null))
                .filter((f): f is NonNullable<typeof f> => !!f);
              /*
                Nothing to draw from: a rung change disposed the solver and
                the next one is not up yet. Say so rather than returning
                quietly — a painter that declines leaves the target exactly
                as it was acquired, and a harness photographing it then
                reads every channel zero and calls it a black plate. This is
                what made `npm run wall` fail about once in a few runs on a
                slow machine, on the one check whose whole job is to catch a
                black frame in front of a room.
              */
              if (!live.length) return false;
              // A rebuild may also have changed the grid the uniforms were
              // filled for; the shader samples by that number.
              if (live[0].dye.width !== fields[0].dye.width) {
                plate.pack.set('gridSize', live[0].dye.width);
                for (const kind of sourcesNow) plate.sourcePack(kind).set('gridSize', live[0].dye.width);
              }
              // Where each pass hands the frame on: the projector's texture
              // if there is one, else the canvas; the chain's picture if
              // there is one, else that; and the camera's scene if there is
              // one, else that. Read inside out, it is the chain in order.
              const screen = out ? out.sceneView(size.width, size.height) : target;
              const afterEffects = post ? post.sceneView(size.width, size.height) : screen;
              // Each pass is told whether it is writing a texture or the
              // canvas, because a picture handed on has to be stored the
              // way the next pass reads it (FLIP_Y, in `wgsl/plate.ts`).
              // And what each one is drawing into, since the chain's
              // picture is half float where the canvas and the projector's
              // texture are not.
              const stageFormat = s.format;
              const plateFormat = cam ? stageFormat : post ? post.pictureFormat : stageFormat;
              /*
                The particles are drawn here, once, rather than in the solver
                step that moves them (H1).

                Several steps happen per frame and only the last is seen, so
                splatting per step would draw the whole population over again
                for each one and pay for it every time. This is also the last
                moment before the compositor samples the target, which is
                what makes one splat enough.
              */
              for (const f of fluidsRef.current) {
                if (f.gpu instanceof WebGPUFluid) {
                  f.gpu.splatParticles(encoder, (label) => stage?.profiler.renderPass(label));
                }
              }
              plate.draw(
                encoder,
                cam ? cam.sceneView(size.width, size.height) : afterEffects,
                size, live,
                stage?.profiler.renderPass('plate'),
                !!cam || !!post || !!out,
                plateFormat,
              );
              if (cam && plate.auxTarget) {
                cam.draw(
                  encoder, afterEffects, plate.auxTarget,
                  stage?.profiler.renderPass('camera'), !!post || !!out,
                  post ? post.pictureFormat : stageFormat,
                );
              }
              if (post) {
                post.effects(encoder, view.fxFrame, view.fxSeed, postTest);
                /*
                  The stock last, over whatever the effects left.

                  That is the order light met it: everything in front of the
                  lens happened, and then it was photographed. An effect that
                  ran after the stock would be a digital thing on top of
                  film, which is the look this is here to avoid.
                */
                post.stock(encoder, view.fxSeed, {
                  stock: view.settings.stock ?? 0,
                  stockType: view.settings.stockType ?? 0,
                  grain: view.settings.stockGrain ?? 0,
                  grainSize: view.settings.stockGrainSize ?? 2,
                  weave: view.settings.stockWeave ?? 0,
                  gate: view.settings.stockGate ?? 0,
                  // The film's own rate, not the display's: at 60 fps a
                  // 24 fps film holds each frame for two or three, which is
                  // what makes grain crawl rather than fizz.
                  filmFrame: Math.floor(view.fxFrame * (24 / 60)),
                });
                post.finish(encoder, screen, {
                  dimmer: dimmerNow,
                  markOn: markOnNow,
                  markRect: markRectNow,
                  markGrade: markGradeNow,
                  markBlend: markBlendNow,
                }, stage?.profiler.renderPass('finish'), !!out);
              }
              // Each projector source, from the plates this frame just packed
              // and derived: only the full-screen display again, timed on its
              // own so the Mac can say what a second picture costs.
              if (out) {
                for (const kind of sourcesNow) {
                  plate.drawSource(encoder, kind, out.sourceView(kind, size.width, size.height), size, live,
                    stage?.profiler.renderPass(`plate ${kind}`), stageFormat);
                }
                const drew = out.draw(encoder, target, quads, stage?.profiler.renderPass('output'));
                if (!drew) return false;
              }
              return true;
            };
          }
          /*
            The same list the compositor is given, handed to the solver too
            (H6 · A). Once a frame rather than once a step: the positions
            come from `bubbles.ts`, which moves at the frame's pace, and
            stamping them again on each of the step's iterations would pay
            for the splat several times over for one picture.
          */
          {
            // The lead plate only: bubbles sit on the front of the dish, the
            // same plate `disturb` works on above. Giving the list to every
            // layer would cut the same holes through the background loop.
            const lead = fluidsRef.current[0];
            if (lead?.gpu instanceof WebGPUFluid) {
              const live = Math.min(bubblesRef.current.bubbles.length, MAX_BUBBLES);
              lead.gpu.setBubbles(bubblesRef.current.packed, live, 0.25, bubblesRef.current.packedFinger);
              /*
                And the dye those bubbles displace, put back as a ring
                (H6 · A). Before the hand-off in reading order but after it in
                effect: the deposit goes into the CPU's delta buffers and is
                folded in on the next flush, by which time the solver has
                taken the disc. Measured without it, the plate drained to 83%
                of its dye in twenty seconds and a popped bubble never got
                its colour back.
              */
              lead.depositBubbleRims(bubblesRef.current.packed, live);
            }
          }
          const frame = stage?.frame();
          cpuMs += (performance.now() - t0 - cpuMs) * 0.1;

          // ── What the audience just saw ───────────────────────
          // The delivered frame, reduced on the GPU to one number, a frame
          // or two behind. The reading goes back rather than
          // the verdict: the loop folds it into the gain that reaches the
          // next frame's view.
          if (view.outputCfg.flashGuard && frame) {
            if (!probe) probe = new WebGPUFrameProbe(s.device);
            probe.measure(frame);
            return probe.luminance;
          }
          if (probe) { probe.dispose(); probe = null; }
          return null;
        }),
        /**
         * The drawing, plus one solver step per layer for each step the
         * loop took. The profiler's numbers are per pass and per step, so
         * the steps are what turns them into the cost of a frame.
         */
        gpuFrameMs: (steps: number) => {
          if (!stage) return 0;
          let ms = 0;
          for (const v of stage.profiler.ms.values()) ms += v;
          if (steps > 0) {
            for (const f of fluidsRef.current) {
              if (!(f.gpu instanceof WebGPUFluid)) continue;
              for (const v of f.gpu.profiler.ms.values()) ms += v * steps;
            }
          }
          return ms;
        },
        debug: () => ({
          webgpu: stage && {
            label: stage.gpu.label, gpuClass: stage.gpu.gpuClass, fallback: stage.gpu.fallback,
            timestamps: stage.gpu.timestamps, format: stage.format, frames: stage.frames,
            cpuMs: +cpuMs.toFixed(3),
            timings: Object.fromEntries(stage.profiler.ms),
            /**
             * The solver's own passes, per layer. It keeps a profiler of
             * its own — the stage's only sees what the stage encodes — and
             * without this the expensive half of a frame at the top rungs
             * was the half nothing reported.
             */
            solver: fluidsRef.current.map((f) => (
              f.gpu instanceof WebGPUFluid ? Object.fromEntries(f.gpu.profiler.ms) : null
            )),
            /**
             * Ask the step to time itself stage by stage (H0), or stop.
             *
             * `solver` above says a step costs 9 ms and nothing about which
             * of its hundred-odd dispatches that is. Turned on, every stage
             * gets its own pass and its own timestamps, and `solver` names
             * them: squeeze, viscosity, project 1, advect velocity, project
             * 2, forces, current, dye diffuse, advect dye, dye grid, sharpen, grain,
             * decay. It costs a dozen pass boundaries a step, so the total
             * reads a little high — the shares are the point, not the sum.
             */
            stageTimings: (on: boolean) => {
              for (const f of fluidsRef.current) {
                if (f.gpu instanceof WebGPUFluid) { f.gpu.profiler.ms.clear(); f.gpu.stageTimings = on; }
              }
              return on;
            },
            /**
             * The spun dish's swirl held off (`on` false) or let run, for
             * `npm run swirlcost` (PLAN 22k), and every layer's count of the
             * steps taken and the steps that ran it since the page opened.
             */
            swirl: (on?: boolean) => {
              if (on !== undefined) WebGPUFluid.swirlHeldOff = !on;
              return fluidsRef.current.map((f) => (f.gpu instanceof WebGPUFluid ? { ...f.gpu.swirlCount, heldOff: WebGPUFluid.swirlHeldOff } : null));
            },
            /** The lead plate's swirl stage timed on the GPU (WebGPUFluid.benchSwirl). */
            benchSwirl: async (reps: number, thin: boolean) => {
              const g = fluidsRef.current[0]?.gpu;
              return g instanceof WebGPUFluid ? await g.benchSwirl(reps, thin) : null;
            },
          },
          /** The picture as RGBA rows, drawn and copied in one task (a presented WebGPU canvas reads black). */
          grabFrame: () => stage?.grabFrame() ?? null,
          /** The air field (H6), for `npm run bubbles` to ask where the air is. */
          /** Whether the phase is being stepped, and how much is on the plate. */
          phaseState: () => {
            const g = fluidsRef.current[0]?.gpu;
            return g instanceof WebGPUFluid ? { live: g.phaseIsLive } : null;
          },
          /** The second phase (H7), for the harness. */
          /** Where the hand holds the magnet (plate units), while it does. */
          magnetHand: () => magnetHandRef.current,
          magnetNow: () => lastMagnetRef.current,
          phaseLays: () => phaseLaysRef.current,
          readPhase: async () => {
            const lead = fluidsRef.current[0];
            return lead?.gpu instanceof WebGPUFluid ? await lead.gpu.readPhase() : null;
          },
          /** The gap between the glasses and its rate, for the press checks. */
          readSqueeze: async () => {
            const lead = fluidsRef.current[0];
            return lead?.gpu instanceof WebGPUFluid ? await lead.gpu.readSqueeze() : null;
          },
          readAir: async () => {
            const lead = fluidsRef.current[0];
            return lead?.gpu instanceof WebGPUFluid ? await lead.gpu.readAir() : null;
          },
          /** The kit checked on this GPU: a compute pipeline, a ping-pong pair, the readback ring, the profiler. */
          kitSelfTest: () => (stage ? kitSelfTest(stage.device, stage.gpu.timestamps) : null),
          /**
           * How the show's pipelines were built: what `prepareShow` built
           * ahead for the opening (and for every device since), and every
           * one built on a frame on any device this page has had (`npm run
           * startup` reads it).
           */
          pipelines: () => ({ prepared: prepareLog[0] ?? null, prepares: prepareLog, ledger: PipelineCache.ledger() }),
          /**
           * Twelve red-black sweeps against twenty-four Jacobi passes on one
           * divergence field, by the residual each leaves (H2). The claim
           * that halving the projection costs nothing is a textbook one
           * about someone else's problem until this is run on this GPU.
           */
          pressureSelfTest: () => (stage ? pressureSelfTest(stage.device) : null),
          /**
           * Take the device away, as a driver would. The recovery is the
           * app's own: a new device, a rebuilt stage, the look laid again.
           */
          loseDevice: () => { stage?.device.destroy(); },
          /**
           * The projector's pass: built
           * only when it would change a pixel, so a harness asking whether
           * a mapping reached the engine asks this. One surface, one
           * question, either engine.
           */
          outputPass: projector,
          /**
           * The post chain, for `npm run fx`: what it is doing, and the four
           * hooks that set something, which write the show's own refs.
           */
          post: {
            active: !!chain,
            float: chain?.float ?? null,
            history: chain?.historySize ?? null,
            frame: fxFrameRef.current,
            force: (on: boolean) => { postForceRef.current = !!on; },
            test: (mode: 0 | 1 | 2, delay = 1) => { postTestRef.current = mode ? { mode, delay } : null; },
            seed: (n: number) => { fxSeedRef.current = n >>> 0; },
            /** Hold the effects' clock at one frame (null lets it run), so a frame can be drawn twice. */
            hold: (frame: number | null) => { fxHoldRef.current = frame === null ? null : frame >>> 0; },
            ringSelfTest: () => chain?.ringSelfTest() ?? null,
          },
          /** The guard's own state, and the luminance it is being fed. */
          flash: () => ({ ...flashRef.current.state, luminance: probe?.luminance ?? null }),
          /**
           * The reduction, against a frame whose mean is known by
           * construction: white rectangles on black, measured with a stall.
           */
          probeSelfTest: async (rects: [number, number, number, number][]) => {
            if (!stage) return null;
            if (!probe) probe = new WebGPUFrameProbe(s.device);
            const painted = stage.frame(probe.painter(stage.format, rects));
            const lit = rects.reduce((a, [, , w, h]) => a + w * h, 0) / (canvas.width * canvas.height);
            return { mean: await probe.measureNow(painted), lit };
          },
          gpuFailure,
        }),
      };
      startWith(gpuRenderer);
    });

    /*
      The canvas's own pixels (docs/webgpu-plan.md, P7).

      One path now, so this is where the size is decided for everything: the
      governor's rung as a device-pixel ratio, and a projector's own pixels
      when one is attached, with the renderer's texture limit as the ceiling.

      Both of those were lost on the WebGPU path while there were two. It
      sized the canvas from the raw device ratio — so the ladder's dpr rungs
      did nothing — and it returned before this listener was registered, so a
      window that changed size kept the pixels it started with.
    */
    const resize = () => {
      const px = renderingRef.current ?? canvasPixelsFor(
        dprRef.current, stageRef.current, renderer?.maxTexture ?? 8192,
        { width: window.innerWidth, height: window.innerHeight },
      );
      canvas.width = px.width;
      canvas.height = px.height;
    };
    resizeRef.current = resize;
    window.addEventListener('resize', resize);
    resize();

    // ── Mouse / touch handlers ─────────────────────────────────────
    // Where the picture actually sits in the element: the whole box, unless a
    // stage is attached and the canvas is letterboxed inside it.
    const drawnRect = (): DOMRect => {
      const box = canvas.getBoundingClientRect();
      // `objectFit: contain` is set for a stage *and* for the desk's preview,
      // so both letterbox and both need the same correction. Only the stage
      // used to get it, which put the brush wherever the letterbox bars moved
      // it to — on a 1200x800 buffer shown in a 582x606 hole that is 109px of
      // vertical error and a 2x scale error.
      if ((!stageRef.current && !frameRef.current) || canvas.width === 0 || canvas.height === 0) return box;
      const s = Math.min(box.width / canvas.width, box.height / canvas.height);
      const w = canvas.width * s, h = canvas.height * s;
      return new DOMRect(box.left + (box.width - w) / 2, box.top + (box.height - h) / 2, w, h);
    };
    drawnRectRef.current = drawnRect;
    /*
      Where a pointer is, in the plate's cells, not rounded: the Spin tool
      reads a hand's angle round the middle from it, and a pointer rounded to
      a cell is an angle rounded to a sixtieth of a radian at a third of the
      plate out, which at sixty readings a second is a turn a second of noise.
    */
    const fluidPointAt = (clientX: number, clientY: number, rect: DOMRect) => {
      const cxp = clientX - rect.left - rect.width / 2;
      const cyp = -(clientY - rect.top - rect.height / 2); // the plate's uv counts up, CSS counts down
      const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE;
      const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
      const rx = cxp * Math.cos(-angle) - cyp * Math.sin(-angle);
      const ry = cxp * Math.sin(-angle) + cyp * Math.cos(-angle);
      // Mirror the shader's camera transform so the brush lands under the
      // cursor at any magnification.
      const shot = macroShotRef.current;
      const z = Math.max(0.0001, shot.zoom);
      // As the plate's uniforms have it: gathered back to one plate as the closeup comes in.
      const spread = Math.max(0, Math.min(1, settingsRef.current.dishSpread ?? 0)) * (1 - macroAmountOf(settingsRef.current));
      if (spread > 0.001) {
        // The layers are spread into dishes: this layer's dish is its whole plate.
        const layer = activeLayerRef.current;
        const aspect = rect.width / Math.max(1, rect.height);
        const cen = layer === 0 ? [0.5 + 0.144 * spread / aspect, 0.5 - 0.02 * spread] : [0.5 - 0.304 * spread / aspect, 0.5 + 0.06 * spread];
        const rad = layer === 0 ? 0.98 + (0.66 - 0.98) * spread : 0.98 + (0.36 - 0.98) * spread;
        const u = (clientX - rect.left) / rect.width, v = 1 - (clientY - rect.top) / rect.height;
        let dx = (u - cen[0]) * aspect / (rad * 0.5), dy = (v - cen[1]) / (rad * 0.5);
        const ca = Math.cos(-angle), sa = Math.sin(-angle);
        const px = ca * dx - sa * dy, py = sa * dx + ca * dy;
        dx = px; dy = py;
        return { x: (0.5 + dx * 0.5) * GRID_SIZE, y: (0.5 + dy * 0.5) * GRID_SIZE };
      }
      let fx = rx / (scale * z) + shot.cx * GRID_SIZE;
      let fy = ry / (scale * z) + shot.cy * GRID_SIZE;
      // The second layer is viewed through its own zoom and drift.
      const view = layer1ViewRef.current;
      if (activeLayerRef.current === 1 && shot.zoom <= 1.0001 && view.zoom > 1.001) {
        fx = ((fx / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dx) * GRID_SIZE;
        fy = ((fy / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dy) * GRID_SIZE;
      }
      return { x: fx, y: fy };
    };
    const getTransformedMousePos = (clientX: number, clientY: number, rect: DOMRect) => {
      const p = fluidPointAt(clientX, clientY, rect);
      return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };
    /*
      A hand on the Spin tool (PLAN §22): where it is from the dish's middle
      as the audience sees it, in plate widths. The plate's cells turn with
      the liquid (`rotationAnglesRef`), so the point is turned back out by
      that angle; the hand's angle is then the room's, and its speed round
      the middle is what the dish is asked to turn at (lib/turntable.ts,
      SpinHand).
    */
    const spinHand = (id: string, clientX: number, clientY: number, landing: boolean) => {
      const p = fluidPointAt(clientX, clientY, drawnRect());
      const fx = p.x / GRID_SIZE - 0.5, fy = p.y / GRID_SIZE - 0.5;
      const a = rotationAnglesRef.current[activeLayerRef.current] || 0;
      const dx = fx * Math.cos(a) - fy * Math.sin(a), dy = fx * Math.sin(a) + fy * Math.cos(a);
      const hand = spinHandOf(activeLayerRef.current);
      if (landing) hand.down(id, dx, dy, showNow(), toolAmountRef.current); else hand.move(id, dx, dy, showNow(), toolAmountRef.current);
    };
    const spinLetGo = (id?: string) => {
      for (const h of spinHandsRef.current) { if (!h) continue; if (id === undefined) h.clear(); else h.up(id); }
    };

    /*
      The closeup camera by hand. Alt (Option) and drag grabs the view and
      pans it, the way a map moves under a hand; Alt-click fixes the camera
      on the spot under the pointer. The tools do nothing meanwhile. Only
      while zoomed in: at 1x there is nothing to aim.
    */
    const aimAtPointer = (clientX: number, clientY: number) => {
      const p = getTransformedMousePos(clientX, clientY, drawnRect());
      aimProbeRef.current.aims++;
      onAimRef.current?.(Math.min(1, Math.max(0, (p.x + 0.5) / GRID_SIZE)), Math.min(1, Math.max(0, (p.y + 0.5) / GRID_SIZE)));
    };
    const panAim = (e: MouseEvent) => {
      const drag = aimDragRef.current!;
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const rect = drawnRect();
      const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
      const scale = Math.max(rect.width, rect.height) * 1.5 * Math.max(0.0001, macroShotRef.current.zoom);
      const sx = e.movementX, sy = -e.movementY;   // the plate's uv counts up
      const du = (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale;
      const dv = (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale;
      drag.aimX = Math.min(1, Math.max(0, drag.aimX - du));
      drag.aimY = Math.min(1, Math.max(0, drag.aimY - dv));
      // At most once a frame: each is a settings write.
      const now = performance.now();
      if (now - drag.sent > 16) { drag.sent = now; onAimRef.current?.(drag.aimX, drag.aimY); }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (aimDragRef.current) { panAim(e); return; }
      const rect = drawnRect();
      const { x, y } = getTransformedMousePos(e.clientX, e.clientY, rect);
      lastMousePosRef.current = { ...mousePosRef.current };
      mousePosRef.current = { x, y };
      const activeFluid = fluidsRef.current[activeLayerRef.current];
      if (!activeFluid) return;
      /*
        The magnet in the hand moves no liquid itself: the pull does. This
        pressed the glass under the pointer and stirred along its path on
        every move, whatever the tool, and under the magnet that press spread
        the ferrofluid into a ring round the hand and the stir swept it on.
        Measured by npm run magnet on the app's own step replayed in the lab:
        the magnet alone gathers 46 to 275 at the hand, and in the app the
        hand's spot emptied (187 to 108) while a ring 0.15-0.2 out filled.
      */
      if (activeToolRef.current === 'magnet') return;
      // The Spin tool turns the dish under the pointer and touches no liquid.
      if (activeToolRef.current === 'spin') {
        if (isMouseDownRef.current) spinHand('mouse', e.clientX, e.clientY, false);
        return;
      }
      /*
        And only while the button is down. This ran on every move, so moving
        the mouse across the plate to reach a control pressed and stirred the
        picture on the wall without anything having been clicked.
      */
      if (!isMouseDownRef.current) return;
      if (x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
        /*
          Not under the Finger either: it carries the dye it touches
          (carryDye) and does not press the glass. A press here is a squeeze-
          film source, a flow that spreads out from under it, and dye
          advected through a spreading flow is copied over more plate than it
          came from: a stroke is thirty of these, and npm run tools measured
          the Finger adding dye (512 -> 1484 against +216 left alone) after
          its own carry had been made to conserve.
        */
        /*
          Nor under the Drop: it puts paint down and that is all. Reported
          twice as a "press or blow" going off with every drop; whatever else
          is found, a drop that also squeezes the film and shoves it along the
          stroke is not a drop.
        */
        if (activeToolRef.current === 'dropper') return;
        /*
          And the Finger neither presses nor stirs: its carry moves the dye.
          With the stir's vertical sign put right it pushed along the stroke,
          and a push through the film spreads the dye it carries over more
          plate than it came from, the same copying the press did (npm run
          tools: 310 -> 459 against +57 left alone).
        */
        if (activeToolRef.current === 'finger') return;
        activeFluid.applySquish(x, y, 8, 0.005);
        const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
        const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE * Math.max(0.0001, macroShotRef.current.zoom);
        // The plate's uv counts up and CSS counts down (getTransformedMousePos):
        // unflipped, a stroke up the screen shoved the liquid down it.
        const sx = e.movementX, sy = -e.movementY;
        const mx = (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale * 5;
        const my = (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale * 5;
        activeFluid.addVelocity(x, y, mx, my);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const probe = aimProbeRef.current;
      probe.downs++; if (e.altKey) probe.altDowns++;
      probe.zoom = macroShotRef.current.zoom; probe.hasAim = !!onAimRef.current;
      if (e.altKey && macroShotRef.current.zoom > 1.005 && onAimRef.current) {
        // Start from where the camera is looking now, whoever was moving it.
        const shot = macroShotRef.current;
        aimDragRef.current = { x0: e.clientX, y0: e.clientY, moved: 0, aimX: shot.cx, aimY: shot.cy, sent: 0 };
        e.preventDefault();
        return;
      }
      isMouseDownRef.current = true;
      // A fresh press's own clock and count, even if no step has run since
      // the last let go (the step loop's reset needs a step with no hand).
      dropClockRef.current = 0;
      dropLaidRef.current = freshLaid();
      if (activeToolRef.current === 'spin') spinHand('mouse', e.clientX, e.clientY, true);
    };
    const handleMouseUp = (e: MouseEvent) => {
      const drag = aimDragRef.current;
      if (drag) {
        aimDragRef.current = null;
        if (drag.moved < 4) aimAtPointer(e.clientX, e.clientY);
        else onAimRef.current?.(drag.aimX, drag.aimY);
        return;
      }
      isMouseDownRef.current = false;
      spinLetGo('mouse');
    };

    /*
      Fingers, each one a hand (extraHandsRef).

      This read `touches[0]` and nothing else, so on a phone a second finger
      did nothing, and lifting either finger let go of the pointer while the
      other was still on the glass. Now the first finger down is the pointer,
      exactly as before (so everything that follows the pointer, the magnet
      and the performance recorder, still follows one finger), and every other
      finger is a hand of its own. When the pointer's finger lifts and others
      are still down, the oldest of them becomes the pointer, so a hand that
      keeps one finger on the glass keeps the magnet.

      Two fingers on the closeup are the camera instead (onPinchZoom): apart
      and together is the magnification, both moving is the aim, the way a map
      moves under two fingers. Only with the closeup in, and only where the app
      asked for it; everywhere else two fingers are two hands.
    */
    const touchCell = (t: Touch) => getTransformedMousePos(t.clientX, t.clientY, drawnRect());
    /*
      The fingers on the glass, not on the page. `touches` counts every
      finger on the screen, so a thumb resting on the dock (a tool, the Amount
      slider) and one finger landing on the closeup read as a pinch, spanned
      down to the thumb, and the plate could not be painted until the thumb
      came off the dock. `targetTouches` is the fingers that began on the
      canvas.
    */
    const pinchSpan = (e: TouchEvent) => {
      const a = e.targetTouches[0], b = e.targetTouches[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 };
    };
    const letGo = () => {
      isMouseDownRef.current = false;
      primaryTouchRef.current = null;
      extraHandsRef.current.clear();
      spinLetGo();
    };
    const applyPinch = (pinch: NonNullable<typeof pinchRef.current>, span: { d: number; mx: number; my: number }) => {
      onPinchZoomRef.current?.(Math.max(1, Math.min(16, pinch.zoom0 * span.d / pinch.d0)));
      /*
        The pan, as the Alt-drag has it (panAim): the plate follows the
        fingers. Only once they have moved together, a few pixels: an aim
        takes the camera off Auto (App's aimMacro), and a pinch that only
        zooms should leave Auto on.
      */
      if (!pinch.panned && Math.hypot(span.mx - pinch.mx0, span.my - pinch.my0) < 8) return;
      pinch.panned = true;
      const rect = drawnRect();
      const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
      const scale = Math.max(rect.width, rect.height) * 1.5 * Math.max(0.0001, macroShotRef.current.zoom);
      const sx = span.mx - pinch.mx0, sy = -(span.my - pinch.my0);
      const du = (sx * Math.cos(-angle) - sy * Math.sin(-angle)) / scale;
      const dv = (sx * Math.sin(-angle) + sy * Math.cos(-angle)) / scale;
      onAimRef.current?.(Math.min(1, Math.max(0, pinch.aimX - du)), Math.min(1, Math.max(0, pinch.aimY - dv)));
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (pinchRef.current) return;
      /*
        On the closeup by what the look asks for, not by where the camera
        has got to: the camera eases in over a second or so after the Zoom
        button, and gating on its zoom left the first pinch in that second
        painting two drops instead (npm run phone found it on a slow plate).
      */
      const asked = macroZoomOf(settingsRef.current);
      if (e.targetTouches.length >= 2 && onPinchZoomRef.current && asked > 1.05) {
        // The second finger of a pair on the closeup: the camera, not a brush.
        // Whatever the first finger had started is let go of.
        letGo();
        const span = pinchSpan(e);
        const shot = macroShotRef.current;
        pinchRef.current = { d0: Math.max(10, span.d), mx0: span.mx, my0: span.my, zoom0: asked, aimX: shot.cx, aimY: shot.cy, sent: 0, last: null, panned: false };
        return;
      }
      for (const t of Array.from(e.changedTouches)) {
        const p = touchCell(t);
        // Every finger on the Spin tool is a hand on the dish; two go round together.
        if (activeToolRef.current === 'spin') spinHand(`touch${t.identifier}`, t.clientX, t.clientY, true);
        if (primaryTouchRef.current === null) {
          primaryTouchRef.current = t.identifier;
          isMouseDownRef.current = true;
          dropClockRef.current = 0;
          dropLaidRef.current = freshLaid();
          // From here, not from where the last finger lifted: the recorder's
          // first gesture of a touch takes its direction from this.
          lastMousePosRef.current = { ...p };
          mousePosRef.current = p;
        } else if (t.identifier !== primaryTouchRef.current) {
          extraHandsRef.current.set(t.identifier, { ...p, stroke: null, clock: 0, laid: freshLaid() });
        }
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (pinch) {
        if (e.targetTouches.length === 0) {
          // The last move a frame's throttle held back, so the camera ends
          // where the fingers did, as the Alt-drag's mouseup does.
          if (pinch.last) applyPinch(pinch, pinch.last);
          pinchRef.current = null;
        }
        return;
      }
      for (const t of Array.from(e.changedTouches)) {
        spinLetGo(`touch${t.identifier}`);
        if (t.identifier === primaryTouchRef.current) {
          const next = extraHandsRef.current.entries().next();
          if (next.done) {
            isMouseDownRef.current = false;
            primaryTouchRef.current = null;
          } else {
            // The oldest other finger takes over the pointer, stroke and clock
            // and all, so it carries on rather than landing a fresh drop.
            const [id, h] = next.value;
            extraHandsRef.current.delete(id);
            primaryTouchRef.current = id;
            mousePosRef.current = { x: h.x, y: h.y };
            lastMousePosRef.current = { x: h.x, y: h.y };
            strokeLastRef.current = h.stroke;
            dropClockRef.current = h.clock;
            dropLaidRef.current = h.laid;
          }
        } else {
          extraHandsRef.current.delete(t.identifier);
        }
      }
      if (e.targetTouches.length === 0) letGo();
    };
    const handleTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (pinch) {
        if (e.targetTouches.length < 2) return;
        pinch.last = pinchSpan(e);
        const now = performance.now();
        if (now - pinch.sent < 16) return;   // at most once a frame: each is a settings write
        pinch.sent = now;
        applyPinch(pinch, pinch.last);
        return;
      }
      const activeFluid = fluidsRef.current[activeLayerRef.current];
      for (const t of Array.from(e.changedTouches)) {
        const { x, y } = touchCell(t);
        if (activeToolRef.current === 'spin') { spinHand(`touch${t.identifier}`, t.clientX, t.clientY, false); continue; }
        if (t.identifier === primaryTouchRef.current) {
          lastMousePosRef.current = { ...mousePosRef.current };
          mousePosRef.current = { x, y };
        } else {
          const h = extraHandsRef.current.get(t.identifier);
          if (!h) continue;
          h.x = x; h.y = y;
        }
        // Not under the magnet, the finger or the drop, as for the mouse above.
        if (activeFluid && activeToolRef.current !== 'magnet' && activeToolRef.current !== 'finger' && activeToolRef.current !== 'dropper' && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
          activeFluid.applySquish(x, y, 8, 0.005);
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    canvas.addEventListener('touchmove', handleTouchMove);

    /**
     * One frame (docs/webgpu-plan.md, P3).
     *
     * Everything here is the renderer's: the programs, the textures, the
     * uniforms, the passes. What the show decided this frame arrives in
     * `view`, and nothing else crosses — which is what lets a WebGPU
     * renderer take the same call when its compositor lands.
     */
    return () => {
      cancelled = true;
      /*
        A render in progress does not survive its stage. A GPU lost halfway
        rebuilds everything through this cleanup, and the new loop's first
        frame returns at once while `renderingRef` is set: with it left set,
        the render's own hold (this closure's) was the only thing that could
        clear it, and the live show came back with no frame loop at all. So
        the render is ended here, from outside: the new loop draws, the next
        `step` on the old hold throws (`cancelled`), and the render's
        cleanup asks for whatever hold exists now, which has nothing to end.
      */
      if (renderingRef.current) {
        renderingRef.current = null;
        trackReadbacks(false);
        audioDataRef.current = liveHeard();
        setStaged(stageRef.current !== null);
      }
      renderApiRef.current = null;
      stopFilm();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
      // The fingers are let go of with their listeners; a mouse button held
      // through a rebuild is left as it always was, down until its mouseup.
      if (primaryTouchRef.current !== null) isMouseDownRef.current = false;
      primaryTouchRef.current = null;
      extraHandsRef.current.clear();
      pinchRef.current = null;
      cancelAnimationFrame(animationFrameId);
      // And the frame the projector could ask for goes with it.
      delete (window as unknown as { __chromaglassFrame?: () => void }).__chromaglassFrame;
      unprovide();
      if (retryTimer) clearTimeout(retryTimer);
      if (healthyTimer) clearTimeout(healthyTimer);
      preparing?.destroy();

      camera?.dispose();
      camera = null;
      projector?.dispose();
      projector = null;
      probe?.dispose();
      probe = null;
      chain?.dispose();
      chain = null;
      platePass?.dispose();
      platePass = null;
      stage?.dispose();
      stage = null;
    };
    /*
      What legitimately rebuilds the GL context, and nothing else.

      `noise2D` never changes, and `glEpoch` is a context loss or a resolution
      change — both of which really do mean building everything again. A
      control that merely tells the loop something belongs in a ref, and every
      one of them now is.
    */
  }, [noise2D, glEpoch]);

  return (
    <div
      // No transition on the box.
      //
      // It used to glide over 300ms when the plate became a preview, and the
      // glide does not always run: measured headless, the plate sat at
      // 0,0,1440,900 — the whole window, over the desk — while its own inline
      // style already said 288,104,824,708, and turning the transition off
      // snapped it to the right place instantly. Whatever stalls it, the
      // failure mode is the entire control surface covered by the plate, and
      // that is a bad trade for a third of a second of decoration.
      //
      // z-20 while framed, because the desk is `fixed z-10` and the preview is
      // a transparent hole in it: without this the plate shows through but the
      // desk is still the topmost element there, so every mousedown lands on
      // the hole and the canvas's own listeners never fire. The plate looked
      // painted on and was not — the bottles, the dyes and all seven tools did
      // nothing on either desk, and what the eye read as "my red came out
      // blue" was the preset's own automation carrying on untouched.
      //
      // Raising it is safe precisely because a framed plate is clipped to the
      // hole it was measured into: it covers the preview and nothing else, and
      // stays under the sheets (z-50) and the palette (z-80). Unframed it is
      // the whole window with no desk above it, so it stays where it was.
      className={`fixed bg-black overflow-hidden ${frame ? 'z-20 rounded-xl border border-white/10' : 'inset-0 w-full h-full'}`}
      style={frame ? { top: frame.top, left: frame.left, width: frame.width, height: frame.height } : undefined}
      data-testid="plate-frame"
    >
      <canvas
        ref={canvasRef}
        // No browser gestures on the glass. A finger on the plate is a hand
        // in the liquid; left to the browser, two of them zoomed the page, a
        // drag down pulled the phone's refresh, and a still finger raised the
        // copy-image callout over the show.
        className="w-full h-full cursor-crosshair touch-none select-none [-webkit-touch-callout:none]"
        // Letterboxed whenever the box it is shown in is not the shape it was
        // rendered at — with a projector attached, and in the desk's preview.
        style={staged || frame ? { objectFit: 'contain', objectPosition: 'center' } : undefined}
        id="liquid-canvas"
      />
      {/* The intro's place (lib/intro.ts); empty, and so not there at all, once it has gone. */}
      <div ref={introSlotRef} className="absolute inset-0 pointer-events-none empty:hidden" data-testid="intro-slot" />
      {/*
        A caption rather than a black rectangle. The recovery is automatic and
        usually takes well under a second, but a projector that goes dark with
        no explanation is the worst thing that can happen to an operator in
        front of a room: this says the machine knows, and is coming back.
      */}
      {/*
        A browser without WebGPU gets a clear screen rather than a degraded
        show (docs/webgpu-plan.md): what is missing, and where it works. There
        is no second renderer to fall back to any more, so this is the whole
        answer for a machine that cannot run it.
      */}
      {gpuFailure && (
        <div className="absolute inset-0 flex items-center justify-center p-6" data-testid="needs-webgpu">
          <div className="max-w-md text-center font-mono text-[12px] leading-relaxed text-white/70">
            <div className="mb-3 text-[15px] tracking-wide text-white">ChromaGlass needs WebGPU</div>
            <div className="mb-4 text-white/50">
              {gpuFailure.failure === 'no-webgpu' ? 'This browser has no WebGPU.'
                : gpuFailure.failure === 'no-adapter' ? 'This browser has WebGPU but no GPU to give it.'
                : 'The GPU would not start.'}
            </div>
            <div>It runs in Chrome or Edge on a desktop, Chrome on a recent Android phone, Safari 26 on macOS and iOS, and Firefox on Windows.</div>
            {gpuFailure.failure !== 'no-webgpu' && (
              /* A GPU that would not start a minute ago may start now — the
                 driver finished resetting, the other tab closed — and asking
                 again costs nothing next to a reload that loses the set. */
              <button
                onClick={() => {
                  recoveryTriesRef.current = 0;
                  gpuSupportedRef.current = null;
                  glLostRef.current = true;
                  setGlLost(true);
                  setGpuFailure(null);
                  setGlEpoch((n) => n + 1);
                }}
                className="pointer-events-auto mt-5 rounded-md border border-white/20 px-4 py-2 text-[12px] text-white/90 transition-colors hover:bg-white/10"
                data-testid="gpu-retry"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      {glLost && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="gl-lost">
          <span className="font-mono text-[11px] tracking-widest text-white/40">rebuilding the plate…</span>
        </div>
      )}
    </div>
  );
});
