import React, { useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings, LiquidType, SimResolution } from '../types';
import { PRESET_CONTRACTS, PRESET_INJECT_STYLES, PRESET_LIQUIDS, LIQUIDS_BY_ID, AUTO_DOSE } from '../presetPlate';
import { PALETTE, PALETTE_RGB, hexToRgb, getAudioValue, type AudioFeatureKey, pickHarmony, harmonyColor, harmonyCycle } from '../constants';
import { WebGPUStage } from '../gpu/stage';
import { WebGPUFluid } from '../gpu/fluid';
import { WebGPUPlate, pictureSize } from '../gpu/plate';
import { fillPlateUniforms } from '../gpu/plateUniforms';
import { WebGPUCamera, fillCameraUniforms } from '../gpu/camera';
import { WebGPUOutput, fillOutputUniforms } from '../gpu/output';
import { WebGPUFrameProbe } from '../gpu/probe';
import { WebGPUPostChain } from '../gpu/post';
import { isGpuFailure, type GpuFailure } from '../gpu/device';
import { kitSelfTest, pressureSelfTest } from '../gpu/selftest';
import type { PostTest } from '../gpu/post';
import type { TempoSource } from '../lib/tempo';
import { lookSpeed, musicPace, tempoMultiplier } from '../lib/tempoPace';
import { FlashGuard } from '../lib/flashGuard';
import { DEFAULT_OUTPUT, outputIsIdentity, type OutputConfig } from '../lib/outputConfig';
import { BeatClock } from '../lib/beatClock';
import { MacroCamera, type MacroShot } from '../lib/macroCamera';
import type { GpuStepParams, PlateSolver } from '../gpu/solverTypes';
import { canvasPixelsFor, detectTier, devicePixels, qualityLadder, renderScale, type EngineStatus, type GpuClass } from '../lib/platform';
import { QualityGovernor } from '../lib/governor';
import { BubbleField, MAX_BUBBLES } from '../lib/bubbles';
import { depositRim, fillHole, type DyeTarget } from '../lib/bubbleDye';
import { BeadField } from '../lib/beads';
import { ChemistryField } from '../lib/chemistry';
import { LiquidPhase } from '../lib/liquidPhase';
import { SCENE_LATTICE, type SceneReading } from '../lib/sceneSense';
import { PatchBay } from '../lib/sceneMap';
import { LEARNABLE_SETTINGS } from '../lib/midi';
import { ROOM_STALE_MS, RoomStir } from '../lib/roomStir';
import { Phrasing, type Phrase } from '../lib/phrasing';
import { Modulators } from '../lib/modulators';
import * as crashLog from '../lib/crashLog';

/** Seconds a track must survive before it is allowed to touch the plate. */
const HAND_SETTLE = 0.25;
/** Seconds of standing still before a person becomes a palm on the glass. */
const HAND_STILL_HOLD = 0.35;
/** Frame widths a second above which a person is blowing rather than pressing. */
const HAND_MOVING = 0.06;


interface LiquidVisualizerProps {
  audioData: AudioData | null;
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
  activeTool?: 'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press' | 'finger' | 'magnet';
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
  onManualGesture?: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string }) => void;
  /**
   * A hand on the closeup camera: Alt-drag on the plate pans it, Alt-click
   * fixes it on the spot under the pointer. Plate uv (0-1), where the camera
   * should now be aimed.
   */
  onAim?: (x: number, y: number) => void;
  /**
   * How much the tool in hand does, 1 being what it always did: the dye it
   * lays, the pressure of a press, the wind of a blow, the drag of a finger,
   * the pull of the magnet (lib/toolAmount.ts). Kept per tool by the app.
   */
  toolAmount?: number;
  /** Reports which solver is running, at what resolution, and how the governor is doing. */
  onEngineStatus?: (status: EngineStatus) => void;
  /**
   * Where the tempo comes from when it is not the microphone: a MIDI clock,
   * a tapped tempo, a typed one. A ref for the same reason the room's reading
   * is one — it is read once a frame by the render loop and by nothing else,
   * so putting it in state would re-render the app around it for nothing.
   */
  tempoRef?: React.MutableRefObject<TempoSource | null>;
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
const CUR_ROCK = 0.2;    // × the rock spring's displacement (±1–2) × (density − mean)
const CUR_GRAV = 0.25;   // × centre gravity × (density − mean)
const CUR_TWIST = 30;    // × rotation speed: angular drive, fastest at the centre
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

/** With Drop Height up, a held dropper lets go of a drop every this many solver steps (six a second). */
const DROP_EVERY = 10;

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
  the old dye goes (to HANDOFF_KEEP) through the first part of the fade, and
  the new look is laid as it would be from cold, in doses: its own seed,
  its phase, its liquids, on a plate cleared of the old chemistry.
*/
/** How much of the old dye is left once the handover is done. */
const HANDOFF_KEEP = 0.02;
/**
  The new look's seed arrives in this many doses through the fade, each at
  the strength the plate lost since the last, so the old look drains as the
  new one fills and the stage never sags darker than either end.
*/
const HANDOFF_DOSES = 8;
/** How many pours of the new palette arrive through the fade, on top of its seed. */
const HANDOFF_POURS = 4;
/** Whether Evolve pours whole-plate floods at the peak of a gust. Off: evolve is subtle. */
const EVOLVE_FLOODS = false;
/** GPU errors within three seconds that mean the stage's objects have gone invalid, not a one-off. */
const ERROR_STORM = 45;
const resolveSimResolution = (setting: SimResolution | undefined, governor: QualityGovernor, maxTexture: number): number => {
  const want = setting === undefined || setting === 'auto' ? governor.rung.grid : setting;
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

// Density histogram used to expose the macro closeup (see "Macro film exposure").
const FILM_BINS = 64;
const FILM_BIN_SCALE = 16;   // bins per unit of density — covers 0..4

/**
 * Pour one dose of whatever the preset keeps in the dish.
 *
 * Picks uniformly from the list, so the inert entries are the dilution: most
 * of the time this lands on `water` and returns having done nothing, which is
 * what makes `['water', 'water', 'soap']` a different plate from `['soap']`.
 *
 * The dose is scaled by the plate's remaining headroom for that liquid, so a
 * show left running overnight cannot end as a dish of solid glycerine. See
 * `CEILING` in `liquidPhase.ts` for why that matters and `npm run liquids`
 * for the measurement — unchecked, an hour of this leaves 92% of the plate
 * too thick to move.
 */
function doseLiquid(fluid: FluidSimulation, ids: string[], x: number, y: number, strength = 1): void {
  if (ids.length === 0) return;
  const liq = LIQUIDS_BY_ID.get(ids[Math.floor(Math.random() * ids.length)]);
  if (!liq?.behaviour) return;            // water, oil, ink, syrup: colour and nothing else
  const room = fluid.liquid.headroom(liq.behaviour);
  if (room <= 0.02) return;
  const r = Math.max(2, Math.round((liq.injectRadius ?? 3) * GRID_SCALE));
  fluid.liquid.deposit(x, y, r, liq.behaviour, AUTO_DOSE * strength * room);
}

export interface LiquidVisualizerHandle {
  injectImage: (imageData: ImageData) => void;
  /**
   * Pour words into the lead plate: each row drawn at the biggest size its
   * share of the box allows, in `colour` (default: the look's brightest dye;
   * 'contrast' picks an ink that reads against the plate as it is), level on
   * the frame whatever angle the plate is turned to.
   */
  pourText: (rows: { text: string; weight?: number }[], opts?: { colour?: string | 'contrast'; columns?: [number, number] }) => void;
  /** Kicks heard (or predicted) since the plate started: a count to take differences of. */
  kicks: () => number;
  /** Move the look's working dyes on by one, the way the hue journey would. */
  stepDyes: () => void;
  /** Clear the plate and seed it as `presetId`; a user preset passes its own dyes, injection styles and liquids. */
  applyPreset: (presetId: string, extras?: { contract?: number[] | null; injectStyles?: string[] | null; liquids?: string[] | null }) => void;
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
  handoff: (seconds: number) => void;
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
  applyGesture: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; layer?: number; amount?: number }) => void;
  /** A tilt from outside — the phone's gyroscope — in −1..1 per axis. Fades out if not refreshed. */
  setExternalTilt: (x: number, y: number) => void;
  /** Where the picture sits on screen (letterboxed when a stage is attached), for overlays that track the plate. */
  drawnRect: () => DOMRect | null;
  /** What the dye is doing, cheaply, for an instrument that plays the plate. */
  plateReading: (voices: number) => { wetness: number; colour: [number, number, number]; cells: number[] } | null;
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


/** A working harmony drawn from inside a contract: the whole set when small, else three of it. */
const harmonyWithin = (contract: number[]): number[] => {
  if (contract.length <= 3) return contract;
  const pool = [...contract];
  const out: number[] = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
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
  const w = Math.max(1, Math.min(n, size ?? (n <= 3 ? n : 3)));
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
   * How fast this plate is actually turning, in radians a second.
   *
   * Set by the frame from the flywheel, and read by the twist below. The
   * *setting* is a motor — what the plate is asked to hold — and this is what
   * it is doing, which after a flick are very different numbers.
   */
  plateSpin = 0;
  /**
   * The angle the dish is drawn turned to, and how far down from its centre
   * the plate is still on screen (in plate widths). Gravity is the room's,
   * not the dish's: set by the frame, read by the step below.
   */
  plateAngle = 0;
  /** The last step's parameters as the solver was given them, for the harness to replay in the lab. */
  lastStep: GpuStepParams | null = null;
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

  // ── GPU solver attachment ──
  // When `gpu` is set, the arrays above hold *deltas* — what the CPU-side
  // writers added since the last step — and `gap` holds gap deltas. They are
  // flushed into the high-res field each step and zeroed. Readers use the
  // read* accessors, which serve a 192² downsample of the GPU field.
  gpu: PlateSolver | null = null;
  private dirty = false;
  private mul: Float32Array;        // multiplicative dye change (blowAir thins by 0.8)
  /** The press being held (its spoke seed) and how many steps it has run, for the pile at the fingers' tips. */
  private squishSteps = 0;
  private squishLastAt = 0;
  private squishLastStep = -1;
  /** Solver steps taken, so per-press counting is per step, not per call. */
  private stepIndex = 0;
  private dyeAdd: Float32Array;     // interleaved upload buffers
  private velAdd: Float32Array;
  /*
    How many readbacks have landed. The rim deposit needs it: the mirror
    refreshes only when `readbackAsync` has something, and depositing from a
    mirror that has not moved puts the same displaced dye back twice — which
    measured as a plate 4-8% *over* its control and a popped bubble
    refilling to 124% of what had been there.
  */
  private rbSeq = 0;
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
  /** How much faster or slower the music wants this plate than its look (see `lib/tempoPace.ts`); set by the frame. */
  tempoMul = 1;
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
    this.liquid.onDeposit = (cx, cy, radius, what, amount) => {
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
      if (!g.addMix) return;
      const oilOn = (s.oilTension ?? 0) > 0.001;
      const oil = oilOn && !(what.magnetic ?? 0) ? Math.max(0, -(what.polarity ?? 0) - 0.5) * 2 * Math.min(1, amount) : 0;
      const soap = (s.surfactantFlow ?? 0) > 0.001 ? (what.soap ?? 0) * Math.min(1, amount) : 0;
      const acid = (s.phIndicator ?? 0) > 0.001 ? (what.acid ?? 0) * Math.min(1, amount) : 0;
      if (oil <= 0 && soap <= 0 && acid === 0) return;
      const L = this.size;
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
    if (this.gpu) {                       // resolution change: carry the field across
      this.pullStateFromGpu();
      this.gpu.dispose();
    }
    this.gpu = gpu;
    gpu.clear();
    // Its readings count from nothing again, and whatever was pending went with the last solver.
    this.dyeMoveAfter = 0; this.dyeMovePending = false;
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
  detachGpu() {
    if (!this.gpu) return;
    this.pullStateFromGpu();
    this.gpu.dispose();
    this.gpu = null;
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
    gpu.applyDeltas(da, va, this.mul, dt);
    if (this.dyeMovePending) { this.dyeMovePending = false; this.dyeMoveAfter = gpu.rbDyeIssued + 1; }
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.temp.fill(0); this.gap.fill(0);
    this.mul.fill(1);
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
    if (!this.gpu || !this.dyeMirrorCurrent()) return;
    const dye = this.gpu.rbDyeView;
    const N = this.size;
    const R = Math.max(2, radius);
    const rOut = R * 1.7;
    const disc: number[] = [], ring: number[] = [];
    const yl = Math.max(0, Math.floor(cy - rOut)), yh = Math.min(N - 1, Math.ceil(cy + rOut));
    const xl = Math.max(0, Math.floor(cx - rOut)), xh = Math.min(N - 1, Math.ceil(cx + rOut));
    for (let y = yl; y <= yh; y++) {
      for (let x = xl; x <= xh; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= R) disc.push(x + y * N);
        else if (d <= rOut) ring.push(x + y * N);
      }
    }
    if (disc.length === 0 || ring.length === 0) return;

    let mass = 0, aR = 0, aG = 0, aB = 0;
    // How much of what is under the palm goes, this press. A share rather
    // than all of it: a hand squeezes the film thin, it does not scrape it.
    // Once per current reading now (see dyeMoveAfter), a few frames apart, so a
    // bigger share each time for the same press.
    const take = Math.max(0, Math.min(0.6, amount * 48));
    for (const i of disc) {
      const i4 = i * 4;
      const v = dye[i4 + 3];
      if (!(v > 1e-5)) continue;
      mass += v * take; aR += dye[i4] * take; aG += dye[i4 + 1] * take; aB += dye[i4 + 2] * take;
    }
    if (!(mass > 1e-4)) return;
    this.dirty = true;
    // Out of the disc, through the multiplicative channel that exists for dye
    // being taken away...
    for (const i of disc) this.mul[i] *= 1 - take;
    // ...and into the ring, in the mirror's own log space so the colour that
    // arrives is the colour that left.
    const w = 1 / ring.length;
    for (const i of ring) {
      this.density[i] += mass * w;
      this.densityR[i] += aR * w; this.densityG[i] += aG * w; this.densityB[i] += aB * w;
    }
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
      */
      let was: { x: number; y: number; r: number } | null = null;
      for (let j = 0; j < this.coverCount; j++) {
        const q = j * 4;
        const px = this.coverPacked[q] * N, py = this.coverPacked[q + 1] * N, pr = this.coverPacked[q + 2] * N;
        if (Math.hypot(px - b.x, py - b.y) < Math.max(2, R * 0.5) && (!was || pr > was.r)) was = { x: px, y: py, r: pr };
      }
      let mass = 0, aR = 0, aG = 0, aB = 0;
      const lo = Math.max(0, Math.floor(b.y - R)), hi = Math.min(N - 1, Math.ceil(b.y + R));
      const xl = Math.max(0, Math.floor(b.x - R)), xh = Math.min(N - 1, Math.ceil(b.x + R));
      for (let y = lo; y <= hi; y++) {
        for (let x = xl; x <= xh; x++) {
          const dx = x - b.x, dy = y - b.y;
          if (dx * dx + dy * dy > R * R) continue;
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
    const eps = 0.002;
    this.densityR[index] += amount * (-Math.log(Math.max(eps, r)));
    this.densityG[index] += amount * (-Math.log(Math.max(eps, g)));
    this.densityB[index] += amount * (-Math.log(Math.max(eps, b)));
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
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.s.fill(0); this.sR.fill(0); this.sG.fill(0); this.sB.fill(0);
    this.temp.fill(0); this.temp0.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.vx0.fill(0); this.vy0.fill(0);
    this.pressure.fill(0); this.dhdt.fill(0);
    this.gap.fill(this.gpu ? 0 : 0.03);   // absolute at rest, or no delta
    this.mul.fill(1);
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
   * A look's own seed laid at `w` of its strength (0..1): what `seedPreset`
   * adds, scaled, on top of what is there. The four dye arrays are the
   * state on the CPU path and the pending deltas on the GPU path, and a seed
   * only adds to them, so the difference it made can be scaled either way.
   */
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
          const a = Math.random() * Math.PI * 2, d = (3 + Math.random() * 48) * k;
          const c = Math.random() < 0.35 ? { r: 1, g: 1, b: 1 } : col(Math.floor(Math.random() * 4));
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
            0.6 + Math.random(), 0.4 + Math.random() * 1.2, c.r, c.g, c.b);
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
          const sx = Math.random() * S * 0.3, sy = Math.random() * S;
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
          const off = (Math.random() - 0.5) * 12;
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
          const x = 8 + Math.random() * (S - 16), y = 8 + Math.random() * (S - 16);
          const c = col(i);
          this.splatBlob(x, y, 3 + Math.random() * 5, 2.0, c.r, c.g, c.b);
          this.addTemp(Math.floor(x), Math.floor(y), 3.0 + Math.random() * 4);
        }
        break;
      }

      case 'microscopic-chaos': {
        for (let j = 0; j < 12; j++)
          for (let i = 0; i < 12; i++) {
            const c = col(i + j);
            this.splatBlob((10 + i * 9 + (Math.random() - 0.5) * 4) * k, (10 + j * 9 + (Math.random() - 0.5) * 4) * k, 3.5, 2.5, c.r, c.g, c.b);
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
          const a = f * Math.PI * 2 / 8 + (Math.random() - 0.5) * 0.4;
          const c = col(f);
          const len = (20 + Math.random() * 25) * k;
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
          const jx = S * (0.2 + jf * 0.2 + (Math.random() - 0.5) * 0.1);
          const jy = S * (0.3 + (Math.random() - 0.5) * 0.3);
          const c = col(jf);
          const bellR = (8 + Math.random() * 6) * k;
          for (let a = -Math.PI; a < 0; a += 0.06)
            for (let r = 0; r < bellR; r += 1.5) {
              const x = jx + Math.cos(a) * r, y = jy + Math.sin(a) * r * 0.7;
              if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
              this.splatBlob(x, y, 1.5, (1.0 - r / bellR) * 2.0, c.r, c.g, c.b);
            }
          for (let t = 0; t < 3; t++) {
            let tx = jx + (t - 1) * bellR * 0.4;
            for (let dy = 0; dy < (18 + Math.random() * 10) * k; dy++) {
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

      case 'velvet-underground': {
        const pools: [number, number, number][] = [
          [0.3, 0.35, 22], [0.65, 0.55, 25], [0.45, 0.70, 20], [0.7, 0.25, 18],
        ];
        pools.forEach(([fx, fy, rad], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, rad, 4.0, c.r, c.g, c.b);
        });
        break;
      }

      case 'neon-coral-reef': {
        for (let branch = 0; branch < 6; branch++) {
          let bx = S * (0.15 + branch * 0.14), by = S * 0.85;
          const c = col(branch);
          for (let seg = 0; seg < 50; seg++) {
            by -= 1.0 + Math.random() * 0.8;
            bx += (Math.random() - 0.5) * 3;
            if (bx < 2 || bx >= S - 2 || by < 2) break;
            this.splatBlob(bx, by, 2 + Math.random() * 2, 2.0, c.r, c.g, c.b);
            if (Math.random() < 0.15) {
              let fx = bx, fy = by;
              const dir = Math.random() < 0.5 ? -1 : 1;
              for (let s2 = 0; s2 < 15; s2++) {
                fy -= 0.8 + Math.random() * 0.5;
                fx += dir * (0.8 + Math.random() * 0.5);
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
          const r = ringR + (Math.random() - 0.5) * 8 * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
          const c = col(i);
          this.splatBlob(x, y, 1.5 + Math.random() * 1.5, 1.5 + Math.random(), c.r, c.g, c.b);
          const dx = cx - x, dy = cy - y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.addVelocity(Math.floor(x), Math.floor(y), dx / dist * 0.08, dy / dist * 0.08);
        }
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, d = (5 + Math.random() * 45) * k;
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5 + Math.random() * 0.8, 0.3 + Math.random() * 0.5, 1, 1, 1);
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
          const x = 14 + Math.random() * (S - 28), y = 14 + Math.random() * (S - 28);
          const c = col(i);
          const r = (2 + Math.random() * 5) * k;
          this.splatBlob(x, y, r, 2.2 + Math.random() * 2.0, c.r, c.g, c.b);
          // A dark shoulder on one side — cells and lacing key off this contrast
          this.splatBlob(x + r * 0.9, y + r * 0.7, r * 0.5, 0.9, 0.06, 0.05, 0.05);
          const a = Math.random() * Math.PI * 2;
          this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        }
        break;
      }

      case 'cell-bloom': {
        const centers: [number, number][] = [[0.34, 0.40], [0.63, 0.58], [0.50, 0.24], [0.28, 0.70]];
        centers.forEach(([fx, fy], ci) => {
          const bx = fx * S, by = fy * S;
          const c = col(ci);
          this.splatBlob(bx, by, 15 * k, 3.2, c.r, c.g, c.b);
          // Nuclei clustered inside each pool — the densest cell patches
          for (let n = 0; n < 18; n++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * 13 * k;
            const cc = col(ci + 1 + (n % 2));
            this.splatBlob(bx + Math.cos(a) * d, by + Math.sin(a) * d,
              (1.5 + Math.random() * 2.5) * k, 1.8, cc.r, cc.g, cc.b);
          }
        });
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
          const x = S * 0.18 + Math.random() * S * 0.7;
          const y = S * 0.5 + (Math.random() - 0.5) * S * 0.35;
          this.splatBlob(x, y, (1 + Math.random() * 3) * k, 1.6, trail.r, trail.g, trail.b);
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
          this.splatBlob(cx + (Math.random() - 0.5) * S * 0.28, cy + (Math.random() - 0.5) * S * 0.28,
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

      case 'clock-glass': {
        // Curved glasses gather the liquid in the middle; seed it there, in
        // rings, so the dome has something to hold from the first frame.
        for (let ring = 0; ring < 3; ring++) {
          const c = col(ring);
          this.splatBlob(cx, cy, S * (0.3 - ring * 0.09), 2.4, c.r, c.g, c.b);
        }
        break;
      }

      // Boyle's bench and Wilfred's lumia start from clean glass: the pattern
      // and the light are the subject, not a seed of blobs.
      case 'sensual-laboratory':
      case 'lumia':
        break;
      default: {
        for (let i = 0; i < 5; i++) {
          const c = col(i);
          this.splatBlob(10 + Math.random() * (S - 20), 10 + Math.random() * (S - 20), 15, 2.0, c.r, c.g, c.b);
        }
        break;
      }
    }

    return harmony;
  }

  /**
   * Press the top glass over a disc. With `fingering`, the thinning is not
   * even round the press: the film thins more along a ring of spokes and the
   * outflow is pushed along them, so the front breaks into radial fingers
   * (Saffman–Taylor: the thin liquid shooting through the thick one) instead
   * of spreading as a smooth ring. The spoke phase is fixed by where the press
   * is, so a held press keeps its fingers.
   */
  applySquish(x: number, y: number, radius: number, amount: number, fingering = 0, pileTips = false) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    // Each press gets its own spoke count and phase (from where it is, so a
    // held press keeps them), and each spoke its own width, length and
    // strength, with a second harmonic shifting the spacing: a ragged
    // sunburst with dye surviving between the fingers, not a turbine.
    const seed = fingering > 0 ? (((x * 73856093) ^ (y * 19349663)) >>> 0) : 0;
    const spokes = fingering > 0 ? 8 + (seed % 9) + Math.round(8 * fingering) : 0;
    const phase = fingering > 0 ? ((seed >>> 8) % 1000) / 1000 * Math.PI * 2 : 0;
    const spokeGain = fingering * 0.9;
    // The first moments of a press shove the dye out to the fingers' tips,
    // where it piles up as a bright rim (the reference's bright finger
    // ends). Counted per press so a held press does not keep piling.
    // The pile at the fingers' tips belongs to one press, counted in solver
    // steps: only the outermost of the tool's nested radii piles (the Mac's
    // seventh look found the three radii tiling the palm with a blob), and a
    // press is one press while it keeps coming, even as a finger drifts
    // across grid cells; a pause of a moment starts a new one (a beat
    // squeeze on every kick).
    const nowMs = performance.now();
    if (nowMs - this.squishLastAt > 150) { this.squishSteps = 0; this.squishLastStep = -1; }
    this.squishLastAt = nowMs;
    if (pileTips && this.stepIndex !== this.squishLastStep) { this.squishLastStep = this.stepIndex; this.squishSteps++; }
    const pile = pileTips && fingering > 0 && this.squishSteps <= 45 ? 0.02 * fingering * Math.min(1, amount * 250) : 0;
    const spokeProp = (s: number) => { const h = ((s + 1) * 2654435761 + seed) >>> 0; return { w: 0.5 + ((h & 255) / 255) * 0.9, len: 0.45 + (((h >>> 8) & 255) / 255) * 0.6, k: 0.25 + (((h >>> 16) & 255) / 255) * 0.75 }; };
    const TAU = Math.PI * 2;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const d2 = i * i + j * j;
        if (d2 >= r2) continue;
        const nx = x + i;
        const ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          this.dirty = true;
          let a = amount;
          if (spokes > 0 && d2 > 0) {
            const theta = Math.atan2(j, i);
            const warped = theta + 0.35 * Math.cos((spokes * 0.5 + 1) * theta + phase * 1.7) / spokes * TAU;
            const sIdx = Math.floor(((warped + phase / spokes) / TAU * spokes) % spokes + spokes) % spokes;
            const prop = spokeProp(sIdx);
            const raw = Math.cos(spokes * warped + phase);
            // Narrow spokes: the cosine sharpened by this spoke's width.
            const ang = Math.max(-1, Math.min(1, (raw - (1 - prop.w * 0.85)) / (prop.w * 0.85)));
            a *= Math.max(0.05, 1 + spokeGain * ang * prop.k);
            // Along a spoke the outflow is shoved outward, and the invading
            // thin liquid carves the dye out of the channel (more toward the
            // rim, so the centre is not hollowed at once): the fingers stay
            // visible even once the gap has bottomed out and the flow stops.
            const dist = Math.sqrt(d2);
            // Under the palm the glass clears: the dye is pushed out to the
            // fingers' tips and the centre reads as near-black glass.
            if (dist < radius * 0.3) {
              const core = 1 - Math.min(0.05, amount * 1.4) * fingering * (1 - dist / (radius * 0.3));
              if (this.gpu) this.mul[idx] *= core;
              else { this.density[idx] *= core; this.densityR[idx] *= core; this.densityG[idx] *= core; this.densityB[idx] *= core; }
            }
            // The rim at the finger's end: a band hugging this spoke's own
            // tip, where the dye pushed along the channel piles up.
            const tipW = pile > 0 && ang > 0.1 ? Math.max(0, 1 - Math.abs(dist - radius * prop.len) / (radius * 0.2)) : 0;
            if (ang > 0 && dist < radius * prop.len) {
              const push = amount * 8 * ang * fingering * prop.k;
              this.vx[idx] += (i / dist) * push;
              this.vy[idx] += (j / dist) * push;
              if (ang > 0.25 && tipW === 0) {
                // Gentle per step: the finger reads over a held press and a
                // faint one stays faint; the dye between spokes is untouched,
                // and the channel stops short of the tip so the rim stands.
                const thin = 1 - Math.min(0.08, amount * 2.2) * fingering * prop.k * (ang - 0.25) / 0.75 * (0.25 + 0.75 * dist / (radius * prop.len));
                if (this.gpu) this.mul[idx] *= thin;
                else { this.density[idx] *= thin; this.densityR[idx] *= thin; this.densityG[idx] *= thin; this.densityB[idx] *= thin; }
              }
            }
            if (tipW > 0) {
              const thick = 1 + pile * prop.k * ang * tipW;
              if (this.gpu) this.mul[idx] *= thick;
              else { this.density[idx] *= thick; this.densityR[idx] *= thick; this.densityG[idx] *= thick; this.densityB[idx] *= thick; }
            }
          }
          if (this.gpu) {
            this.gap[idx] -= a;    // a delta; the shader clamps and derives dh/dt
            continue;
          }
          const prevGap = this.gap[idx];
          this.gap[idx] = Math.max(0.005, this.gap[idx] - a);
          this.dhdt[idx] = (this.gap[idx] - prevGap) / Math.max(this.dt, 0.0001);
        }
      }
    }
  }

  blowAir(x: number, y: number, radius: number, strength: number) {
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
   * The other half is `stir` on the liquid field, and it is the part no other
   * tool can do: it averages the chemistry under the finger, so two liquids
   * that refuse each other are briefly one liquid and stay mixed after the
   * finger has gone.
   */
  fingerDrag(x: number, y: number, radius: number, strength: number, dx: number, dy: number): void {
    const r = Math.round(radius * GRID_SCALE);
    const r2 = r * r;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-4)) return;
    const ux = dx / len, uy = dy / len;
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
    this.carryDye(x, y, r, ux, uy, Math.min(0.75, strength * 8));
    // And the chemistry under it is averaged, which is the mixing.
    this.liquid.stir(x, y, r, Math.min(0.5, strength * 2.5));
  }

  /**
   * Dye taken from behind a gesture and put in front of it.
   *
   * The conserving half of a drag: what leaves one cell arrives in another,
   * because both are read from the same mirror in the same pass.
   */
  private carryDye(cx: number, cy: number, r: number, ux: number, uy: number, take: number): void {
    if (!this.gpu || !this.dyeMirrorCurrent()) return;
    let moved = false;
    const dye = this.gpu.rbDyeView;
    const N = this.size;
    // A short hop: far enough to read as carried, short enough that the dye
    // lands somewhere the finger is still touching.
    const hop = Math.max(1, Math.round(r * 0.45));
    const r2 = r * r;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const d2 = i * i + j * j;
        if (d2 > r2) continue;
        const sx = Math.round(cx + i), sy = Math.round(cy + j);
        const tx = Math.round(sx + ux * hop), ty = Math.round(sy + uy * hop);
        if (sx < 1 || sy < 1 || sx >= N - 1 || sy >= N - 1) continue;
        if (tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) continue;
        const si = sx + sy * N, ti = tx + ty * N;
        const s4 = si * 4;
        const amount = dye[s4 + 3];
        if (!(amount > 1e-5)) continue;
        const w = take * (1 - Math.sqrt(d2) / r);
        if (!(w > 1e-4)) continue;
        this.dirty = true;
        moved = true;
        this.mul[si] *= 1 - w;
        this.density[ti] += amount * w;
        this.densityR[ti] += dye[s4] * w;
        this.densityG[ti] += dye[s4 + 1] * w;
        this.densityB[ti] += dye[s4 + 2] * w;
      }
    }
    if (moved) this.dyeMoved();
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
          if (this.gpu) this.mul[idx] *= 1 - 0.15 * w;
          else { const k = 1 - 0.15 * w; this.density[idx] *= k; this.densityR[idx] *= k; this.densityG[idx] *= k; this.densityB[idx] *= k; }
        }
      }
    }
  }

  autoInject(style: string, x: number, y: number, amount: number, r: number, g: number, b: number, energy: number) {
    const S = this.size;
    const k = GRID_SCALE;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    switch (style) {
      case 'spray': {
        const sprayR = (8 + energy * 5) * k;
        const count = 8 + Math.floor(energy * 8);
        for (let p = 0; p < count; p++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * sprayR;
          const px = Math.floor(x + Math.cos(a) * d), py = Math.floor(y + Math.sin(a) * d);
          if (px < 1 || px >= S - 1 || py < 1 || py >= S - 1) continue;
          this.addDensity(px, py, amount * (1 - d / sprayR) * 0.25, r, g, b);
        }
        break;
      }
      case 'splatter': {
        const count = 3 + Math.floor(energy * 4);
        for (let p = 0; p < count; p++) {
          const a = Math.random() * Math.PI * 2;
          const fling = (2 + Math.random() * (10 + energy * 8)) * k;
          const px = Math.floor(x + Math.cos(a) * fling), py = Math.floor(y + Math.sin(a) * fling);
          if (px < 2 || px >= S - 2 || py < 2 || py >= S - 2) continue;
          const dropR = Math.round((1 + Math.floor(Math.random() * 2)) * k);
          for (let ddy = -dropR; ddy <= dropR; ddy++)
            for (let ddx = -dropR; ddx <= dropR; ddx++) {
              const dd = Math.sqrt(ddx * ddx + ddy * ddy);
              if (dd > dropR) continue;
              const nx = clamp(px + ddx, 1, S - 2), ny = clamp(py + ddy, 1, S - 2);
              this.addDensity(nx, ny, amount * (1 - dd / dropR) * 0.6, r, g, b);
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
            this.addVelocity(nx, ny, 0, 0.1 * w);
          }
        break;
      }
      case 'streak': {
        const a = Math.random() * Math.PI * 2;
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
            this.addDensity(nx, ny, amount * thin * Math.pow(1 - dd / dropR, 2), r, g, b);
          }
        if (e > 0.02) this.splash(x, y, dropR, h, e, amount, r, g, b);
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
    this.applySquish(x, y, (dropR / k) * (1.6 + 1.8 * h), 0.0012 * e, this.dropFingering, true);

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

    const n = Math.round(e * 7 * (0.6 + Math.random() * 0.8));
    for (let q = 0; q < n; q++) {
      const a = Math.random() * Math.PI * 2;
      const dist = dropR * (1.4 + (1 + 5 * h) * Math.random());
      const px = Math.round(x + Math.cos(a) * dist), py = Math.round(y + Math.sin(a) * dist);
      if (!inside(px, py)) continue;
      const sr = Math.max(1, Math.round((0.8 + Math.random() * 1.2) * k * Math.min(1, 0.6 + 0.3 * e)));
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
    this.dt = Number.isFinite(wantDt) ? Math.min(Math.max(wantDt, 0.0000001), 0.05) : 0.0000001;
    this.stepIndex++;

    const p = this.deriveStep(settings, audioData, time, noise2D);
    this.lastStep = p;

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

    // 7. Immiscibility & fingering
    this.applyImmiscibility(p.immiscibility, time, noise2D);
    if (p.fingering > 0) this.applyFingering(p.fingering, time, noise2D);

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
    let turbScale = settings.turbulenceScale ?? 0;
    if (this.layerIndex > 0) turbScale *= 1 - 0.6 * Math.max(0, Math.min(1, settings.backgroundLoop ?? 0));
    let spin = 0;
    let vibIntensity = 0, vibFrequency = 0;
    if (audioData) {
      const impact = settings.audioImpact ?? 0.45;
      // Audio energy breathes extra turbulence into the field so the liquid
      // visibly churns with the music instead of drifting at constant pace.
      // Capped, now that turbulence is a real current: tripled on a loud
      // track it would tear a calm look apart rather than make it breathe.
      turbScale = Math.min(Math.max(turbScale, 1.2), turbScale * (1 + Math.min(1, audioData.energy) * impact * 2.0));
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

    // blobSurfaceTension trades cohesion for shear: low tension gives weak
    // cohesion and strong fingering (amoeba-like elongation and pinching),
    // high tension the reverse (rounder, self-contained blobs).
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
    const fingering = polarity * 0.15 * (0.4 + (1 - tension) * 1.8);

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
    // What the motor asks for, in the flywheel's units, so the twist below can
    // tell the plate's own momentum apart from the speed it was told to hold.
    const motorSpin = (settings.rotationSpeed ?? 0) * 0.01 * (this.layerIndex % 2 === 0 ? 1 : -1);
    const targetMean = settings.macroMode ? 0.28 : Math.max(0.1, Math.min(1.2, settings.dyeBudget ?? 0.85));
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
      turbScale, turbDetail, spin, immiscibility, fingering,
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
      magnetHeight: Math.max(0.02, (settings.magnetHeight ?? 0.25) * (0.5 + (settings.phaseScale ?? 0.4))),
      magnetStrength: Math.max(0, settings.magnetStrength ?? 0),
      magnetSeconds: Math.max(0, Math.min(0.1, this.dtSeconds)),
      vorticity: Math.max(0, Math.min(1, settings.vorticityConfinement ?? 0)),
      oilTension: Math.max(0, Math.min(1, settings.oilTension ?? 0)),
      surfactantFlow: Math.max(0, Math.min(1, settings.surfactantFlow ?? 0)),
      solutalBuoyancy: Math.max(0, Math.min(1, settings.solutalBuoyancy ?? 0)),
      plateUpright: Math.max(0, Math.min(1, settings.plateUpright ?? 0)),
      ...this.downhill(settings.tiltDirection ?? 180),
      doubleDiffusion: Math.max(0, Math.min(1, settings.doubleDiffusion ?? 0)),
      ferroLabyrinth: Math.max(0, Math.min(1, settings.ferroLabyrinth ?? 0)),
      bzReaction: Math.max(0, Math.min(1, settings.bzReaction ?? 0)),
      liesegang: Math.max(0, Math.min(1, settings.liesegang ?? 0)),
      plateCurve: Math.max(-1, Math.min(1, settings.plateCurve ?? 0)),
      depthDrag: Math.max(0, Math.min(3, settings.depthDrag ?? 0)),
      gapSpring: 1 - Math.pow(0.5, this.dt / Math.max(0.02, 2.2 * (1 - (settings.plateSpring ?? 0.35)) + 0.12)),
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
      rockX: this.rockX * CUR_ROCK,
      rockY: this.rockY * CUR_ROCK,
      currentGrav: Math.max(0, settings.centerGravity ?? 0) * CUR_GRAV,
      /*
        The liquid is dragged round by the glass it is touching.

        The first term is the motor's, unchanged, because every look is tuned
        against it. The second is the part of the plate's motion that the
        motor did not ask for — what a flick put there — and it is what makes
        dye follow a spun plate instead of sitting still while the plate turns
        underneath it.

        Scaled by how hard the plates are pressed together, because that is
        what contact means here: a plate barely touching drags its liquid
        weakly, and one squeezed down on it takes the liquid with it. Couette
        drag, in the one place this solver can express it without giving the
        current pass the gap field to read.
      */
      twist: (Math.max(0, Math.min(1, settings.rotationSpeed ?? 0)) * (this.layerIndex % 2 === 0 ? 1 : -1)
        + Math.max(-1, Math.min(1, (this.plateSpin - motorSpin) * 0.32))
          * (0.45 + 0.55 * Math.max(0, Math.min(1, settings.platePressure ?? 0)))) * CUR_TWIST,
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
    const sm = (e0: number, e1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
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
        const w = 1 - sm(0, 0.5, r);
        const tw = p.twist * w * w;
        fx += tw * ty; fy -= tw * tx;
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

  private applyFingering(strength: number, time: number, noise2D: (x: number, y: number) => number) {
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const d = this.density[idx];
        if (d < 0.05) continue;
        const gradX = (this.density[idx + 1] - this.density[idx - 1]) * 0.5;
        const gradY = (this.density[idx + this.size] - this.density[idx - this.size]) * 0.5;
        const gradMagSq = gradX * gradX + gradY * gradY;
        if (gradMagSq > 0.005) {
          const gradMag = Math.sqrt(gradMagSq);
          const nx = gradX / gradMag;
          const ny = gradY / gradMag;
          const n = noise2D(i * 0.02, j * 0.02 + time * 0.05);
          const force = n * strength * gradMag * 4.0;
          this.vx[idx] -= nx * force;
          this.vy[idx] -= ny * force;
        }
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
  /** The frame's own peak speed, and what it works out to in cells a second. */
  velRange: number;
  flowRate: number;

  // What the show worked out this frame and the renderer only spends.
  /** Where each plate has turned to. */
  rotations: number[];
  /** The working harmony, as hues. */
  harmony: number[];
  /** Where the lamp and its second have wandered to, under the plate. */
  lamp: { x: number; y: number; x2: number; y2: number };
  gelAngle: number;
  kaleidoPhase: number;
  /** The second plate's throw: how magnified, and how far it has drifted. */
  layer1: { zoom: number; dx: number; dy: number };
  /** How many bubbles are on the plate and how strongly they read. */
  bubbles: { count: number; strength: number; amount: number };
  /** Their geometry, packed for the shader. */
  bubblePack: { packed: Float32Array; shape: Float32Array };
  /** The flash guard's gain, from the luminance the last frame read back. */
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
  audioData, settings, seedCount = 0, spinFlick, selectedLiquid, frame = null, onAim, toolAmount = 1,
  activeLayer = 0, clearTrigger = 0, drainTrigger = 0, activeTool = 'dropper',
  isAutomated = false, isActive = true, sceneRef, filmSenseRef, onManualGesture, onEngineStatus,
  output = DEFAULT_OUTPUT, tempoRef,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidsRef = useRef<FluidSimulation[]>([]);
  const noise2D = useMemo(() => createNoise2D(), []);
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
  const harmonyRef = useRef(pickHarmony());
  const harmonyLockRef = useRef<number[] | null>(null); // user-pinned palette
  const presetContractRef = useRef<number[] | null>(PRESET_CONTRACTS['classic']); // the preset's allowed dyes
  /** The sequencer's window onto the contract (size null = whatever the journey allows), and the hue journey's own lead. */
  const paletteWindowRef = useRef<{ size: number | null; lead: number }>({ size: null, lead: 0 });
  const journeyRef = useRef({ lead: 0, lastAt: -1 });
  /**
   * The working harmony for the current contract: the sequencer's window if
   * it set one, else the hue journey's window (one dye short of the contract,
   * so the walk is visible), else the whole set.
   */
  const harmonyFromContract = (contract: number[], journeyOn: boolean): number[] => {
    const pw = paletteWindowRef.current;
    const lead = pw.lead + journeyRef.current.lead;
    if (pw.size !== null) return windowOf(contract, pw.size, lead);
    if (journeyOn && contract.length >= 3) return windowOf(contract, Math.max(2, contract.length - 1), lead);
    return contract.length <= 3 ? windowOf(contract, null, lead) : harmonyWithin(contract);
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
  const handoffRef = useRef<{ start: number; dur: number; last: number; poured: number; dosed: number } | null>(null);
  /**
   * The largest grid this GPU has shown it can hold, learned the hard way.
   * A rebuild makes a new governor, which starts at the ladder's usual rung;
   * without this it would climb straight back into the grid that ran out of
   * memory and lose the plate again, round and round.
   */
  const gridCapRef = useRef(Number.POSITIVE_INFINITY);

  // Refs for reactive data (avoids useEffect thrashing).
  const audioDataRef = useRef(audioData);
  const settingsRef = useRef(settings);
  const selectedLiquidRef = useRef(selectedLiquid);
  const activeLayerRef = useRef(activeLayer);
  const activeToolRef = useRef(activeTool);
  const onAimRef = useRef(onAim);
  onAimRef.current = onAim;
  const toolAmountRef = useRef(toolAmount);
  toolAmountRef.current = Math.max(0.1, Math.min(3, Number.isFinite(toolAmount) ? toolAmount : 1));
  /** An Alt-drag on the closeup camera: where it started, and the aim it moves. */
  const aimDragRef = useRef<{ x0: number; y0: number; moved: number; aimX: number; aimY: number; sent: number } | null>(null);
  /** What the plate's pointer saw of Alt, for the harness (chromaglassDebug().aimProbe). */
  const aimProbeRef = useRef({ downs: 0, altDowns: 0, aims: 0, zoom: 0, hasAim: false });
  const isAutomatedRef = useRef(isAutomated);
  const isActiveRef = useRef(isActive);
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
  const simulationTimeRef = useRef(0);
  const lastTimeRef = useRef(Date.now() * 0.001);
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
   * The plate's phrasing: what it should be doing this second.
   *
   * Stepped once a frame and read by the automation and by every solver, so
   * both plates surge together rather than each breathing to its own weather.
   */
  const phrasingRef = useRef(new Phrasing());
  const phraseRef = useRef<Phrase>({ drive: 1, gust: 0, drift: 0.5 });
  /** When the last flood pour landed, so gusts cannot stack into a wash. */
  const lastFloodRef = useRef(-1e9);
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
  const macroCamRef = useRef(new MacroCamera());
  const macroShotRef = useRef<MacroShot>({ cx: 0.5, cy: 0.5, zoom: 1, whip: 0 });
  const filmHistRef = useRef(new Uint32Array(FILM_BINS));
  const simAccumRef = useRef(0);
  /** Milliseconds the last frame spent in the solver: the catch-up cap adapts to it. */
  const simMsRef = useRef(0);
  /** Solver steps a second, smoothed — 60 when the show is keeping wall-clock time. */
  const stepsPerSecRef = useRef(60);
  /** What the catch-up rule allowed last frame, for the debug readout. */
  const catchUpRef = useRef(4);
  const onEngineStatusRef = useRef(onEngineStatus);
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
  const [staged, setStaged] = useState(false);
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
  const performGesture = (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; layer?: number; amount?: number }) => {
    // The magnet moves no fluid itself: it is held where the gesture is, and
    // the next solver step pulls the ferrofluid toward it. Ahead of the drain
    // gate, since holding it over an emptying plate is harmless.
    switch (g.tool) {
      case 'magnet':
        magnetHandRef.current = { x: Math.max(0, Math.min(1, g.x)), y: Math.max(0, Math.min(1, g.y)), at: performance.now() };
        return;
    }
    const layer = g.layer ?? activeLayerRef.current;
    const af = fluidsRef.current[layer];
    if (!af || drainFrameRef.current > 0) return;
    if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0) {
      const airy = g.tool === 'blow' || g.tool === 'press';
      bubblesRef.current.disturb(g.x * GRID_SIZE, g.y * GRID_SIZE, (airy ? 5 : 3) * GRID_SCALE, airy ? 'air' : 'dye');
    }
    const S = GRID_SIZE;
    const x = Math.max(1, Math.min(S - 2, Math.round(g.x * S)));
    const y = Math.max(1, Math.min(S - 2, Math.round(g.y * S)));
    const rgb = g.color ? hexToRgb(g.color) : harmonyColor(harmonyRef.current);
    // 0.5 is the mouse; a pen pressed hard or a trigger pulled all the way is 1.
    // And the amount set for this tool, on top of how hard this hand pressed.
    const kTool = toolAmountRef.current;
    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;

    switch (g.tool) {
      case 'blow':
        if (g.dx !== undefined && g.dy !== undefined && (g.dx !== 0 || g.dy !== 0)) af.blowDirected(x, y, 4 + 2 * amt, 0.06 * amt, g.dx, g.dy);
        else af.blowAir(x, y, 4, 0.06 * amt);
        if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0 && Math.random() < 0.15 * amt) {
          bubblesRef.current.spawn(x, y, 1.2 * GRID_SCALE, 2, 3 * GRID_SCALE);
        }
        break;
      case 'drop': {
        const liq = selectedLiquidRef.current;
        if (liq?.behaviour) af.liquid.deposit(x, y, Math.max(2, (liq.injectRadius ?? 3) * GRID_SCALE), liq.behaviour, amt);
        af.autoInject('drop', x, y, 5 * amt, rgb.r, rgb.g, rgb.b, 0.5 * amt);
        af.addTemp(x, y, 0.6 * amt);
        break;
      }
      case 'streak': {
        // Directional smear along the recorded movement
        const dx = g.dx ?? 1, dy = g.dy ?? 0;
        const len = 8 * GRID_SCALE;
        for (let t = -len; t <= len; t += 0.8) {
          const sx = Math.floor(x + dx * t), sy = Math.floor(y + dy * t);
          if (sx < 1 || sx >= S - 1 || sy < 1 || sy >= S - 1) continue;
          const w = 1.0 - Math.abs(t) / len;
          af.addDensity(sx, sy, 0.6 * w, rgb.r, rgb.g, rgb.b);
          af.addVelocity(sx, sy, dx * 0.3 * w, dy * 0.3 * w);
        }
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
          af.fingerDrag(x, y, 7, 0.09 * amt * 0.5, g.dx, g.dy);
          if (layer === 0) beadsRef.current.disturb(x, y, 10 * GRID_SCALE, 0.25);
        }
        break;
      }
      case 'spray':
        af.autoInject('spray', x, y, 5 * kTool, rgb.r, rgb.g, rgb.b, 0.5);
        break;
      case 'splatter':
        af.autoInject('splatter', x, y, 4 * kTool, rgb.r, rgb.g, rgb.b, 0.5);
        break;
      case 'pour':
        af.autoInject('pour', x, y, 4 * kTool, rgb.r, rgb.g, rgb.b, 0.5);
        break;
      default: // dropper
        af.autoInject('drop', x, y, 4 * kTool, rgb.r, rgb.g, rgb.b, 0.5);
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
   * solver steps read it, and let go of it a moment after the hand does.
   */
  const magnetHandRef = useRef<{ x: number; y: number; at: number } | null>(null);
  /** The magnet's own slow walk when nobody is holding it: where along its path. */
  const magnetWalkRef = useRef(0);
  const magnetWalkAtRef = useRef(0);
  /** The settings handed to the lead plate's step, with the magnet where it is now. */
  const magnetStepRef = useRef<Record<string, unknown>>({});
  /** What the lead plate's magnet was last given, for the harness: where, how strong, and whether a hand held it. */
  const lastMagnetRef = useRef<{ x: number; y: number; strength: number; height: number; held: boolean; field: number } | null>(null);
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

  const layPlate = (presetId: string) => {
    laidPresetRef.current = presetId;
    for (const fluid of fluidsRef.current) fluid.clearAll();
    bubblesRef.current.clear();
    chemRef.current.reset();
    rotationAnglesRef.current = rotationAnglesRef.current.map(() => Math.random() * Math.PI * 2);
    spinVelRef.current = spinVelRef.current.map(() => 0);
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
      phasePendingRef.current = (settingsRef.current.phaseAmount ?? 0) > 0.002 && !fluidsRef.current[0]?.gpu?.addPhase;
      layPhaseRef.current();
    }
    for (const later of fluidsRef.current.slice(1)) laySecondPlate(later, presetId);
    injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
    plateLiquidsRef.current = PRESET_LIQUIDS[presetId] ?? [];
    // The plate is laid with its liquids as well as its dye, rather than
    // waiting a minute for the automation to dose its way there. Because
    // `doseLiquid` picks uniformly from the list, the inert entries thin
    // this out on their own: a plate of `['water', 'water', 'soap']` gets
    // about five spots of soap, one of `['soap', 'silicone']` gets fifteen.
    if (fluid) for (let i = 0; i < 15; i++) {
      doseLiquid(fluid, plateLiquidsRef.current,
        10 + Math.random() * (GRID_SIZE - 20), 10 + Math.random() * (GRID_SIZE - 20), 1.2);
    }
    drainFrameRef.current = 0;
    macroCamRef.current.reset();
    livePresetRef.current = presetId;
  };
  /** The second phase for the look being laid, if it asks for some and the GPU solver is there to take it. */
  const layPhase = () => {
    const amt = settingsRef.current.phaseAmount ?? 0;
    const lead = fluidsRef.current[0]?.gpu;
    if (amt > 0.002 && lead?.addPhase) {
      lead.clearPhase?.();
      const scale = Math.max(0, Math.min(1, settingsRef.current.phaseScale ?? 0.4));
      const count = Math.round(3 + (1 - scale) * 22);
      const r = 0.04 + scale * 0.16;
      for (let k = 0; k < count; k++) {
        // Deterministic placement: the same look laid twice is the same
        // plate twice, which is what rendering a song depends on.
        const a = (k * 2.399963229728653);
        const rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
        lead.addPhase(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad, r, 0.9);
      }
    }
  };
  const layPhaseRef = useRef(layPhase);
  layPhaseRef.current = layPhase;
  /** Through a ref, because the context-loss listener is installed once, above this. */
  const layPlateRef = useRef(layPlate);
  layPlateRef.current = layPlate;

  useImperativeHandle(ref, () => ({
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
        const a = (i / n) * Math.PI * 2 + performance.now() * 0.00002;
        const rr = 0.28 * GRID_SIZE;
        const x = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr);
        const y = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
        const idx = Math.max(0, Math.min(d.length - 1, x + y * GRID_SIZE));
        cells.push(Number.isFinite(d[idx]) ? d[idx] : 0);
      }
      const c = fluid.meanColor;
      return {
        wetness: Number.isFinite(fluid.meanDensity) ? fluid.meanDensity : 0,
        colour: [c?.[0] ?? 0, c?.[1] ?? 0, c?.[2] ?? 0] as [number, number, number],
        cells,
      };
    },
    injectImage: (imageData: ImageData) => {
      const fluid = fluidsRef.current[activeLayerRef.current];
      if (fluid) fluid.injectImage(imageData);
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
    stepDyes: () => {
      const w = paletteWindowRef.current;
      const n = presetContractRef.current?.length ?? 0;
      paletteWindowRef.current = { size: w.size ?? Math.max(1, Math.min(3, n > 1 ? n - 1 : 1)), lead: w.lead + 1 };
      if (harmonyLockRef.current) return;
      const contract = presetContractRef.current;
      if (contract) harmonyRef.current = harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0);
    },
    applyPreset: (presetId: string, extras) => {
      // A user's preset carries its own dyes and injection styles; register
      // them under its id so seeding and adoption find them like a built-in.
      if (extras?.contract && extras.contract.length) PRESET_CONTRACTS[presetId] = extras.contract;
      else if (extras && !extras.contract) delete PRESET_CONTRACTS[presetId];
      if (extras?.injectStyles && extras.injectStyles.length) PRESET_INJECT_STYLES[presetId] = extras.injectStyles;
      if (extras?.liquids) PRESET_LIQUIDS[presetId] = extras.liquids;
      layPlateRef.current(presetId);
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
      // preset's liquids are what gets poured.
      plateLiquidsRef.current = PRESET_LIQUIDS[presetId] ?? [];
      if (!harmonyLockRef.current) {
        const contract = presetContractRef.current;
        harmonyRef.current = contract ? harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0) : pickHarmony();
      }
    },
    handoff: (seconds: number) => {
      if (!(seconds > 0)) { handoffRef.current = null; return; }
      const now = performance.now();
      handoffRef.current = { start: now, dur: seconds * 1000, last: now, poured: 0, dosed: 0 };
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
      const t = externalTiltRef.current;
      t.x = Math.max(-1, Math.min(1, x));
      t.y = Math.max(-1, Math.min(1, y));
      t.at = performance.now() * 0.001;
    },
    setStage: (size) => {
      stageRef.current = size && size.width > 0 && size.height > 0 ? { width: Math.round(size.width), height: Math.round(size.height) } : null;
      setStaged(stageRef.current !== null);
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
      const rx = () => Math.floor(S * 0.2 + Math.random() * S * 0.6);
      const pick = (idxs: number[]) => PALETTE_RGB[idxs[Math.floor(Math.random() * idxs.length)]];
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
          const c = harmonyColor(harmonyRef.current);
          af.autoInject('streak', rx(), rx(), amt, c.r, c.g, c.b, Math.min(1, energy + 0.3));
          break;
        }
        default: {
          const c = harmonyColor(harmonyRef.current);
          af.autoInject('drop', rx(), rx(), amt, c.r, c.g, c.b, energy);
        }
      }
    },
    applyGesture: (g) => performGesture(g),
  }));

  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
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
    // Up to about six-tenths of a turn a second at full strength, which is
    // sixty times what the rotationSpeed slider can ask for at its top. That
    // is deliberate: the slider is a drift that keeps a plate alive, and a
    // flick is meant to be seen.
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
              10 + Math.random() * (GRID_SIZE - 20), 10 + Math.random() * (GRID_SIZE - 20), 1.2);
          }
        }
        if (i > 0 && laidPresetRef.current) laySecondPlate(fluid, laidPresetRef.current);
        fluidsRef.current.push(fluid);
        rotationAnglesRef.current.push(Math.random() * Math.PI * 2);
        spinVelRef.current.push(0);

      }
    } else if (currentCount > targetCount) {
      for (const dropped of fluidsRef.current.slice(targetCount)) dropped.dropGpu();
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

    /** When the projector last asked for a frame; see __chromaglassFrame below. */
    let lastExternalFrame = 0;
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
    const render = () => {
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
      const stepRate = PINNED_STEP_RATE ?? governorRef.current?.stepRate ?? 60;
      const simStepS = 1 / stepRate;
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
        room: sceneRef?.current ?? null,
        film: filmSenseRef?.current ?? null,
        sound: currentAudioData,
        shape: modRef.current,
        roomImpact: settingsRef.current.sceneImpact ?? 0,
        filmImpact: settingsRef.current.filmImpact ?? 0,
        soundImpact: settingsRef.current.soundImpact ?? 1,
        shapeImpact: settingsRef.current.shapeImpact ?? 1,
      }, settingsRef.current.layerCount ?? 1, performance.now());
      // The picture. Everything aimed at one plate reaches it through
      // `patch.layer(i)` where the solver is stepped, and nowhere else: a
      // setting the render pass reads is global whatever it was aimed at,
      // which is why the panel will not let you aim one at a layer.
      const currentSettings = patch.global;
      /*
        Where the magnet is this frame.

        A hand on it wins: the Magnet tool (or the phone pad, or a replay)
        puts it where the pointer is, at no less than a firm pull, and it
        stays there a quarter of a second after the last touch. With nobody
        holding it and the automation on, a look with ferrofluid on it gets a
        magnet that walks: a slow figure around where the look put it, faster
        when the music is. A magnet that sits still under a still plate is a
        photograph of ferrofluid, not ferrofluid. Every other look is handed
        its settings untouched.
      */
      const magnetFor = <T extends Partial<VisualizerSettings>>(look: T): T => {
        const now = performance.now();
        const hand = magnetHandRef.current;
        const held = hand !== null && now - hand.at < 250;
        const strength = look.magnetStrength ?? 0;
        // The walk is a look setting, so a look (or a test) that places its
        // magnet keeps it there. Random Evolve walks it on any ferrofluid
        // look: at once, gently, and from then on its drift wanders the
        // setting itself (lib/drift.ts), which is what the slider shows.
        const walk = Math.max(look.magnetWalk ?? 0, isAutomatedRef.current ? 0.35 : 0);
        const walks = !held && walk > 0 && isActiveRef.current
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
        if (!held && !walks) {
          // Said as it is, so the harness does not read the last held magnet
          // as still held once the hand has gone stale.
          lastMagnetRef.current = { x: look.magnetX ?? 0.5, y: look.magnetY ?? 0.5, strength, height: look.magnetHeight ?? 0.25, held: false, field };
          return field === lab ? look : Object.assign(magnetStepRef.current, look, { ferroLabyrinth: field }) as T;
        }
        let mx: number, my: number, ms = strength, mh = look.magnetHeight ?? 0.25;
        if (held) {
          // A magnet in the hand is pressed up under the glass: low and
          // strong, so it grabs what is near it and drags it along, where a
          // look's own magnet is held further off and gathers broadly.
          mx = hand.x; my = hand.y; ms = Math.max(strength, 0.9) * toolAmountRef.current; mh = Math.min(mh, 0.15);
        } else {
          const energy = currentAudioData ? Math.min(1, currentAudioData.energy) : 0;
          const last = magnetWalkAtRef.current || now;
          magnetWalkAtRef.current = now;
          magnetWalkRef.current += Math.min(0.1, (now - last) / 1000) * (0.35 + 1.1 * energy) * (0.6 + 0.6 * walk);
          const t = magnetWalkRef.current;
          mx = (look.magnetX ?? 0.5) + 0.34 * walk * Math.sin(t * 0.9);
          my = (look.magnetY ?? 0.5) + 0.28 * walk * Math.sin(t * 1.3 + 1.1);
        }
        lastMagnetRef.current = { x: Math.max(0.05, Math.min(0.95, mx)), y: Math.max(0.05, Math.min(0.95, my)), strength: ms, height: mh, held, field };
        return Object.assign(magnetStepRef.current, look, {
          magnetX: Math.max(0.05, Math.min(0.95, mx)),
          magnetY: Math.max(0.05, Math.min(0.95, my)),
          magnetStrength: ms,
          magnetHeight: mh,
          ferroLabyrinth: field,
        }) as T;
      };

      if (fluidsRef.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const now = Date.now() * 0.001;
        const realDt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        frameS = realDt;
        // One verdict per frame on whether this is a kick: from the beat
        // clock when it is locked (ahead of the microphone), else from the
        // onset as heard. Every reaction below reads this instead of its own
        // threshold crossing, so they all land together.
        {
          const nowMs = performance.now();
          const bassNow = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
          const trust = isActiveRef.current && currentAudioData ? Math.max(0, Math.min(1, currentSettings.beatPrediction ?? 0)) : 0;
          // A clock from the desk, a tapped tempo or a typed one, if there is
          // one. Handed over every frame — the reading carries its own
          // sequence number, so the clock can tell a new beat from a held one.
          beatClockRef.current.setExternal(nowMs, tempoRef?.current?.read(nowMs) ?? null);
          kickRef.current = beatClockRef.current.update(nowMs, bassNow, trust, Math.max(0, currentSettings.beatLead ?? 0));
          if (kickRef.current.kick) kickCountRef.current++;
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
            const beat = kickRef.current.kick && Math.random() < 0.25 + 0.7 * soapDial;
            const idle = nowMs - soapAtRef.current > (2600 - 1800 * soapDial);
            if (beat || idle) {
              soapAtRef.current = nowMs;
              leadSolver.addMix(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 0.03 + 0.04 * Math.random(), { soap: 1 });
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
          const bpm = tempoRef?.current?.bpm || heard;
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
        if (isActiveRef.current) modRef.current.step(realDt, tempoRef?.current?.bpm ?? 0);

        if (isActiveRef.current) {
          phraseRef.current = phrasingRef.current.step(
            realDt,
            currentSettings.surge ?? 0,
            currentAudioData ? Math.min(1, currentAudioData.energy) : 0,
          );
          for (const f of fluidsRef.current) if (f) {
            f.phrase = phraseRef.current; f.dtSeconds = simStepS;
            f.dropHeight = currentSettings.dropHeight ?? 0;
            f.dropFingering = currentSettings.fingering ?? 0;
          }
        }

        if (isActiveRef.current) {
          simulationTimeRef.current += realDt * timeMultiplier;
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
        const simSteps = Math.floor(simAccumRef.current / simStepS);
        simAccumRef.current -= simSteps * simStepS;
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
        const wantRes = renderer ? resolveSimResolution(currentSettings.simResolution, governor, renderer.maxTexture) : 0;
        for (const fluid of fluidsRef.current) {
          if (renderer && !renderer.attachSolver(fluid, gpuSupportedRef.current === false ? 0 : wantRes)) {
            gpuSupportedRef.current = false;
          }
        }
        /*
          The phase goes to each new solver the lead plate gets, not only
          the first. The governor rebuilds the solver a few seconds into a
          show when it moves the grid, and the dye is carried across that
          but the phase is not: Magnet Garden had its ferrofluid at 8 s and
          a bare gold pool by 20.
        */
        const leadGpu = fluidsRef.current[0]?.gpu ?? null;
        if (leadGpu !== phaseSolverRef.current) {
          phaseSolverRef.current = leadGpu;
          if (leadGpu?.addPhase && (phasePendingRef.current || (settingsRef.current.phaseAmount ?? 0) > 0.002)) {
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
          const nowMs = performance.now();
          const live = g?.chemistryLive;
          if (g?.addRxn && (s.bzReaction ?? 0) > 0.001 && (!live?.rxn || nowMs - bzSeedAtRef.current > 30000)) {
            bzSeedAtRef.current = nowMs;
            for (let k = 0; k < (live?.rxn ? 1 : 3); k++) {
              const x = 0.2 + Math.random() * 0.6, y = 0.2 + Math.random() * 0.6, a = Math.random() * Math.PI * 2;
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
          mid-show (or the Magnet picked on a look without any) changed the
          setting and left the plate bare.
        */
        {
          const amt = settingsRef.current.phaseAmount ?? 0;
          // Not when it was turned up for the Ferrofluid bottle: that one
          // goes where it is dropped, not over the whole plate.
          const pouringOwn = (selectedLiquidRef.current?.behaviour?.magnetic ?? 0) > 0 && activeToolRef.current !== 'magnet';
          if (amt > 0.002 && phaseAmountRef.current <= 0.002 && leadGpu?.addPhase
              && !(leadGpu as { phaseIsLive?: boolean }).phaseIsLive && !pouringOwn) {
            layPhaseRef.current();
          }
          phaseAmountRef.current = amt;
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
            const chem = chemRef.current;
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            if ((bass01 > 0.5 && Math.random() < 0.12) || Math.random() < 0.004) {
              chem.seed(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 2 + Math.random() * 3);
            }
            // The dividing regime grows at a pace a show can watch; coral is slower than a set.
            chem.step(Math.max(1, Math.min(10, Math.round(sixtieths * 2.5))), 0.042, 0.062);
            const v = chem.activator;
            const c = harmonyCycle(harmonyRef.current, time * 0.08);
            // No floor here, unlike the iteration count above: a frame that
            // took no step has no time in it to deposit over, and floored it
            // would lay down half as much again at thirty steps a second.
            const amount = chemAmt * 0.02 * sixtieths;
            for (let y = 1; y < GRID_SIZE - 1; y++) {
              for (let x = 1; x < GRID_SIZE - 1; x++) {
                const a = v[x + y * GRID_SIZE];
                if (a > 0.22) lead.addDensity(x, y, amount * (a - 0.22), c.r, c.g, c.b);
              }
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
          if (!r || !r.ready) return null;
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
          if (!r || !r.ready) return null;
          return performance.now() - r.at < ROOM_STALE_MS ? r : null;
        })();

        // ── The room's hands ───────────────────────────────────
        // Everyone the sensor is holding is a projectionist. Standing still is
        // a palm on the top glass, so the film thins and fingering breaks it
        // into spokes exactly as the Press tool does; moving is a puff along
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
          // The dropper's clock runs while it is held and starts again at 0 on
          // the next press, so every press lands a drop at once.
          if (!isMouseDownRef.current) { dropClockRef.current = 0; strokeLastRef.current = null; }
          else if (simStep > 0 || dropClockRef.current > 0) dropClockRef.current++;
          if (isMouseDownRef.current && drainFrameRef.current === 0) {
            const { x, y } = mousePosRef.current;
            const af = fluidsRef.current[activeLayerRef.current];
            if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
              const tool = activeToolRef.current;
              const liq = selectedLiquidRef.current;
              const strokeFrom = strokeLastRef.current ?? { x, y };
              const strokeDx = x - strokeFrom.x, strokeDy = y - strokeFrom.y;
              strokeLastRef.current = { x, y };
              const rgb = hexToRgb(liq?.color ?? '#ffffff');
              const heat = liq?.heatAmount ?? 0.05;
              // The Amount set for this tool (1 is what it always did).
              const k = toolAmountRef.current;
              // Its square root for a push and a reach: twice the dye is not twice the shove, and a drop with twice the dye in it covers twice the area.
              const kSoft = Math.sqrt(k);
              // Whatever lands on the lead plate lands on its bubbles too:
              // dye bursts the one under it and shoves the rest, air shoves.
              if (activeLayerRef.current === 0 && (currentSettings.bubbles ?? 0) > 0) {
                if (tool !== 'magnet') bubblesRef.current.disturb(x, y, (tool === 'blow' || tool === 'press' ? 5 : tool === 'spray' ? 6 : 3) * GRID_SCALE, tool === 'blow' || tool === 'press' ? 'air' : 'dye');
              }
              if (activeLayerRef.current === 0 && tool !== 'press' && tool !== 'magnet' && (currentSettings.beads ?? 0) > 0 && gestureFrameRef.current % 3 === 0) beadsRef.current.disturb(x, y, 4 * GRID_SCALE, 0.5);

              // Feed the performance recorder (~15 Hz while painting)
              if (onManualGestureRef.current && gestureFrameRef.current++ % 4 === 0) {
                const gmx = mousePosRef.current.x - (lastMousePosRef.current?.x ?? x);
                const gmy = mousePosRef.current.y - (lastMousePosRef.current?.y ?? y);
                const gLen = Math.sqrt(gmx * gmx + gmy * gmy) || 1;
                onManualGestureRef.current({
                  tool,
                  x: x / GRID_SIZE,
                  y: y / GRID_SIZE,
                  dx: gmx / gLen,
                  dy: gmy / gLen,
                  color: tool === 'blow' || tool === 'press' ? undefined : (liq?.color ?? '#ffffff'),
                });
              }

              if (tool === 'magnet') {
                // Nothing is laid: the magnet goes where the hand is.
                magnetHandRef.current = { x: x / GRID_SIZE, y: y / GRID_SIZE, at: performance.now() };
              } else if (tool === 'press') {
                // A hand on the top glass: the film thins under the palm and
                // the dye spreads out in a ring, the rhythm plate worked by hand.
                const fg = currentSettings.fingering ?? 0;
                const pa = 0.004 * k;
                af.applySquish(x, y, 30, pa, fg, true);
                af.applySquish(x, y, 18, pa, fg);
                af.applySquish(x, y, 8, pa, fg);
                // And the liquid goes where a squeezed film sends it.
                af.squeezeOut(x, y, 30 * GRID_SCALE, pa);
                if (activeLayerRef.current === 0) beadsRef.current.disturb(x, y, 18 * GRID_SCALE, 0.15);
              } else if (tool === 'blow') {
                /*
                  Held still on the lead plate, the Blow is a straw: one
                  bubble on the end of it, growing while the breath goes on,
                  its rim breaking into fingers and shedding a ring of small
                  ones (bubbles.ts, blow). Moving, it is the wind it was.
                */
                const still = Math.hypot(strokeDx, strokeDy) < 0.75;
                if (activeLayerRef.current === 0 && still) {
                  bubblesRef.current.blow(x, y, simStepS, k);
                } else {
                  af.blowAir(x, y, 4, 0.06 * k);
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
                for (let p = 0; p < 12; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const dist = Math.random() * sprayR;
                  const px = Math.floor(x + Math.cos(angle) * dist);
                  const py = Math.floor(y + Math.sin(angle) * dist);
                  if (px < 1 || px >= GRID_SIZE - 1 || py < 1 || py >= GRID_SIZE - 1) continue;
                  const w = (1 - dist / sprayR) * 0.4 * k;
                  af.addDensity(px, py, w, rgb.r, rgb.g, rgb.b);
                  if (heat > 0) af.addTemp(px, py, heat * w * 0.3);
                }

              } else if (tool === 'splatter') {
                // Fling droplets outward from cursor — random sizes, random directions
                // More droplets, not bigger ones, for a heavier hand.
                const flings = Math.max(1, Math.round(5 * k));
                for (let p = 0; p < flings; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const flingDist = (3 + Math.random() * 15) * GRID_SCALE;
                  const px = Math.floor(x + Math.cos(angle) * flingDist);
                  const py = Math.floor(y + Math.sin(angle) * flingDist);
                  if (px < 2 || px >= GRID_SIZE - 2 || py < 2 || py >= GRID_SIZE - 2) continue;
                  const dropR = Math.round((1 + Math.floor(Math.random() * 3)) * GRID_SCALE);
                  const amt = 1.0 + Math.random() * 1.5;
                  for (let ddy = -dropR; ddy <= dropR; ddy++) {
                    for (let ddx = -dropR; ddx <= dropR; ddx++) {
                      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                      if (dd > dropR) continue;
                      const nx = px + ddx, ny = py + ddy;
                      if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                      const w = (1 - dd / dropR);
                      af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    }
                  }
                  // Fling velocity outward
                  af.addVelocity(px, py, Math.cos(angle) * 0.5 * kSoft, Math.sin(angle) * 0.5 * kSoft);
                }

              } else if (tool === 'pour') {
                // Heavy thick stream — wide, dense, with downward velocity
                const pourR = Math.max(1, Math.round(4 * GRID_SCALE * kSoft));
                const amt = 2.0 * k;
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

              } else if (tool === 'streak') {
                // Thin high-velocity smear along mouse movement direction
                const mvx = strokeDx, mvy = strokeDy;
                const mvLen = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
                const streakLen = Math.min(12 * GRID_SCALE, Math.max(3, mvLen * 2));
                const nx_dir = mvx / mvLen, ny_dir = mvy / mvLen;
                for (let t = -streakLen; t <= streakLen; t += 0.8) {
                  const sx = Math.floor(x + nx_dir * t);
                  const sy = Math.floor(y + ny_dir * t);
                  if (sx < 1 || sx >= GRID_SIZE - 1 || sy < 1 || sy >= GRID_SIZE - 1) continue;
                  const w = 1.0 - Math.abs(t) / streakLen;
                  af.addDensity(sx, sy, 0.6 * w * k, rgb.r, rgb.g, rgb.b);
                  af.addVelocity(sx, sy, nx_dir * 0.3 * w * kSoft, ny_dir * 0.3 * w * kSoft);
                }

              } else if ((currentSettings.dropHeight ?? 0) > 0.02) {
                // The dropper held above the plate lets go of drops rather than
                // pouring a stream: one as the press lands, then one every
                // DROP_EVERY steps while it is held, each carrying the dye the
                // stream would have laid in that time and each landing with its
                // splash (autoInject's drop reads the height).
                if (dropClockRef.current % DROP_EVERY === 0) {
                  const amt = (liq?.injectAmount ?? 0.8) * DROP_EVERY * k;
                  af.autoInject('drop', x, y, amt, rgb.r, rgb.g, rgb.b, 0.5);
                  if (heat > 0) af.addTemp(x, y, heat * 2);
                  if (liq?.behaviour) af.liquid.deposit(x, y, Math.round((liq.injectRadius ?? 3) * GRID_SCALE), liq.behaviour, k);
                }
              } else {
                // dropper (default)
                // Wider as well as denser: a held drop fills to the plate's
                // density ceiling in its middle, so more dye there alone would
                // not show; a drop with more in it spreads further.
                const r = Math.max(1, Math.round((liq?.injectRadius ?? 3) * GRID_SCALE * kSoft));
                const amt = (liq?.injectAmount ?? 0.8) * k;
                for (let dy = -r; dy <= r; dy++) {
                  for (let dx = -r; dx <= r; dx++) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                    const w = (1 - dist / r) ** 2;
                    af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    if (heat > 0) af.addTemp(nx, ny, heat * w);
                  }
                }
                // Soap, milk, silicone and glycerine put their properties into
                // the plate on the same disc as their colour, and the plate
                // keeps acting on them long after the drop.
                if (liq?.behaviour) af.liquid.deposit(x, y, r, liq.behaviour, k);
              }
            }
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
            if (EVOLVE_FLOODS && ph.gust > 0.45 && now - lastFloodRef.current > 4.5 && Math.random() < 0.06) {
              lastFloodRef.current = now;
              autoEventsRef.current.poured++;
              const af = fluidsRef.current[0];
              if (af) {
                const color = harmonyColor(harmonyRef.current);
                const cx = GRID_SIZE * (0.25 + Math.random() * 0.5);
                const cy = GRID_SIZE * (0.25 + Math.random() * 0.5);
                // A third of the plate across, falling off to nothing, so it
                // is a pour arriving rather than a rectangle being filled.
                const R = GRID_SIZE * (0.18 + 0.16 * ph.gust);
                const strength = (28 + energy * 40) * (0.5 + ph.gust);
                for (let j = Math.max(1, Math.floor(cy - R)); j < Math.min(GRID_SIZE - 1, cy + R); j++) {
                  for (let i = Math.max(1, Math.floor(cx - R)); i < Math.min(GRID_SIZE - 1, cx + R); i++) {
                    const d = Math.hypot(i - cx, j - cy) / R;
                    if (d >= 1) continue;
                    const fall = (1 - d) * (1 - d);
                    af.addDensity(i, j, strength * fall * 0.06, color.r, color.g, color.b);
                  }
                }
                // And it lands: a pour pushes the plate out of the way.
                af.blowAir(Math.floor(cx), Math.floor(cy), Math.floor(R * 0.45), 0.22 + energy * 0.25);
                if ((currentSettings.bubbles ?? 0) > 0) {
                  bubblesRef.current.disturb(Math.floor(cx), Math.floor(cy), R * 0.6, 'dye', 1);
                }
              }
            }

            // About one small event every seven seconds at the default rate,
            // about one a second at full — against two or three a
            // second before, each of them large.
            if (Math.random() < rate * (0.012 + energy * 0.03) * ph.drive) {
              const af = fluidsRef.current[Math.floor(Math.random() * fluidsRef.current.length)];
              if (af) {
                const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const isBlow = Math.random() > 0.75 - (spectralCentroid / 128) * 0.4;
                if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0) {
                  bubblesRef.current.disturb(rx, ry, (isBlow ? 5 : 4) * GRID_SCALE, isBlow ? 'air' : 'dye', 0.8);
                }
                if (isBlow) {
                  af.blowAir(rx, ry, 2 + Math.floor(energy * 2), 0.03 + energy * 0.05);
                  if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0 && Math.random() < 0.12 + (currentSettings.bubbles ?? 0) * 0.25
                      && bubblesRef.current.bubbles.length < 3 + Math.round(14 * (currentSettings.bubbles ?? 0))) {
                    bubblesRef.current.spawn(rx, ry, (1.0 + energy * 1.5) * GRID_SCALE, 2 + Math.floor(Math.random() * 3), 4 * GRID_SCALE);
                  }
                } else {
                  const color = harmonyColor(harmonyRef.current);
                  const styles = injectStyleRef.current;
                  const style = styles[Math.floor(Math.random() * styles.length)];
                  // A gust is a bigger pour, not just a more frequent one:
                  // an even scatter of identical drops is the flatness this
                  // is here to break.
                  af.autoInject(style, rx, ry, 1.5 + energy * 4, color.r, color.g, color.b, energy);
                  af.addTemp(rx, ry, 0.3 + trebleBoost * 1.5);
                  // A hand reaching for the dropper reaches for whatever is on
                  // the bench, and half the bottles there are not just colour.
                  doseLiquid(af, plateLiquidsRef.current, rx, ry, 0.25 + energy * 0.25);
                }
              }
            }

            // With no hue journey set, an evolving plate re-picks its palette at
            // random every ~3 min (it was ~45 s). Only the dye still to come
            // takes the new colours, so with small drops this is a drift, not
            // a change of scene. The journey itself runs below, evolving or not.
            if (!harmonyLockRef.current && (currentSettings.hueJourney ?? 0) <= 0 && Math.random() < 0.0001) {
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
            if (now - lastThinRef.current > 9 && Math.random() < rate * 0.004) {
              lastThinRef.current = now;
              autoEventsRef.current.thinned++;
              const af = fluidsRef.current[Math.floor(Math.random() * fluidsRef.current.length)];
              if (af) {
                af.thinPatch(
                  GRID_SIZE * (0.2 + Math.random() * 0.6),
                  GRID_SIZE * (0.2 + Math.random() * 0.6),
                  GRID_SIZE * (0.10 + Math.random() * 0.12),
                  0.80 + Math.random() * 0.12,
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
            if (!autoStrokeRef.current && Math.random() < rate * 0.003) {
              autoEventsRef.current.stroked++;
              const a = Math.random() * Math.PI * 2;
              autoStrokeRef.current = {
                x: GRID_SIZE * (0.3 + Math.random() * 0.4),
                y: GRID_SIZE * (0.3 + Math.random() * 0.4),
                dx: Math.cos(a), dy: Math.sin(a),
                left: 18 + Math.floor(Math.random() * 14),
              };
            }
            const stroke = autoStrokeRef.current;
            if (stroke) {
              const af = fluidsRef.current[0];
              if (af) {
                af.fingerDrag(stroke.x, stroke.y, 7, 0.07, stroke.dx * 3, stroke.dy * 3);
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
              const nowS = performance.now() * 0.001;
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
              const nowMs = performance.now();
              const p = Math.min(1, (nowMs - h.start) / h.dur);
              const dtMs = Math.max(0, Math.min(100, nowMs - h.last));
              h.last = nowMs;
              // Everything on the plate thins, a little each frame, to
              // HANDOFF_KEEP of itself by the end; the new look is laid back
              // in at the rate it thins, so what is left of the old look at
              // the end is HANDOFF_KEEP and the new look is all the rest.
              const lambda = -Math.log(HANDOFF_KEEP);
              for (const fluid of fluidsRef.current) fluid.thinDye(Math.exp(-lambda * dtMs / h.dur));
              const id = livePresetRef.current;
              const lead = fluidsRef.current[0];
              const doses = Math.min(HANDOFF_DOSES, Math.floor(p * HANDOFF_DOSES + 0.5 + 1e-6));
              while (h.dosed < doses) {
                h.dosed++;
                // The first dose clears the old look's chemistry and its
                // liquids; the middle one lays the new look's phase.
                if (h.dosed === 1) {
                  for (const fluid of fluidsRef.current) { if (fluid.gpu instanceof WebGPUFluid) fluid.gpu.clearChemistry(); fluid.liquid.clear(); }
                  chemRef.current.reset();
                }
                if (h.dosed === Math.ceil(HANDOFF_DOSES / 2)) {
                  if ((settingsRef.current.phaseAmount ?? 0) > 0.002) layPhaseRef.current();
                  else lead?.gpu?.clearPhase?.();
                  if (id) for (const later of fluidsRef.current.slice(1)) laySecondPlate(later, id);
                }
                if (lead && id) {
                  const seeded = lead.seedPresetScaled(id, noise2D, Math.min(1, lambda / HANDOFF_DOSES));
                  if (h.dosed === 1 && !harmonyLockRef.current && !presetContractRef.current) harmonyRef.current = seeded;
                  for (let i = 0; i < 2; i++) {
                    doseLiquid(lead, plateLiquidsRef.current, 10 + Math.random() * (GRID_SIZE - 20), 10 + Math.random() * (GRID_SIZE - 20), 1.2);
                  }
                }
              }
              // And its palette, poured through the second half.
              const due = Math.floor(Math.max(0, Math.min(1, (p - 0.4) / 0.5)) * HANDOFF_POURS + 1e-6);
              while (h.poured < Math.min(due, HANDOFF_POURS)) {
                h.poured++;
                const fluid = fluidsRef.current[h.poured % Math.max(1, fluidsRef.current.length)];
                if (!fluid) break;
                const rx = Math.floor(GRID_SIZE * (0.18 + Math.random() * 0.64));
                const ry = Math.floor(GRID_SIZE * (0.18 + Math.random() * 0.64));
                const color = harmonyColor(harmonyRef.current);
                const styles = injectStyleRef.current;
                fluid.autoInject(styles[Math.floor(Math.random() * styles.length)] ?? 'drop', rx, ry, 8.0, color.r, color.g, color.b, 0.5);
                fluid.addTemp(rx, ry, 1.2);
                doseLiquid(fluid, plateLiquidsRef.current, rx, ry, 0.8);
              }
              if (p >= 1) handoffRef.current = null;
            }
          }

          // ── Seed trigger ───────────────────────────────────────
          if (seedCountRef.current > lastSeedCount.current && drainFrameRef.current === 0) {
            lastSeedCount.current = seedCountRef.current;
            macroCamRef.current.reset();
            harmonyRef.current = harmonyLockRef.current ?? pickHarmony();
            const styles = injectStyleRef.current;
            for (const fluid of fluidsRef.current) {
              for (let i = 0; i < 8; i++) {
                const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const color = harmonyColor(harmonyRef.current);
                const style = styles[Math.floor(Math.random() * styles.length)];
                fluid.autoInject(style, rx, ry, 10.0, color.r, color.g, color.b, 0.5);
                fluid.addTemp(rx, ry, 2.0);
                // A fresh plate is laid with its liquids, not dosed into them.
                doseLiquid(fluid, plateLiquidsRef.current, rx, ry, 1.4);
              }
            }
          }

          if (isActiveRef.current && drainFrameRef.current === 0) {
            // ── Ambient seeding ────────────────────────────────
            const af = fluidsRef.current[activeLayerRef.current];
            if (af) {
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
                  const c = harmonyCycle(harmonyRef.current, time * 0.25 + idx * 1.4);
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
                // Each audio feature carries a different color from the harmony,
                // so bass, mids and swells paint distinguishable hues.
                const colFor = (off: number) => harmonyCycle(harmonyRef.current, time * 0.3 + colorMod * Math.PI + off);
                const audioCol = colFor(0);
                const ar_a = audioCol.r, ag_a = audioCol.g, ab_a = audioCol.b;

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
                  const aStyles = injectStyleRef.current;
                  const aStyle = () => aStyles[Math.floor(Math.random() * aStyles.length)];

                  // Center pulse — scales with density mapping
                  if (densityMod > 0.005) {
                    activeFluid.autoInject(aStyle(), centerX, centerY, densityMod * 0.025 * autoAmp, ar_a, ag_a, ab_a, densityMod);
                    activeFluid.addTemp(centerX, centerY, densityMod * 0.018 * autoAmp);
                  }

                  // A hit on the velocity route: radial burst — scales with impact + auto mode
                  if (vel01 > 0.25) {
                    const burstR = Math.round(18 * GRID_SCALE * Math.max(0.4, impactMul));
                    const bassStr = (vel01 - 0.25) * autoAmp;
                    for (let bj = -burstR; bj <= burstR; bj += 3) {
                      for (let bi = -burstR; bi <= burstR; bi += 3) {
                        const dist = Math.sqrt(bi * bi + bj * bj);
                        if (dist < 2 || dist > burstR) continue;
                        const bx = centerX + bi, by = centerY + bj;
                        if (bx > 0 && bx < GRID_SIZE - 1 && by > 0 && by < GRID_SIZE - 1) {
                          const f = bassStr * 0.65 * (1 - dist / burstR);
                          activeFluid.addVelocity(bx, by, (bi / dist) * f, (bj / dist) * f);
                        }
                      }
                    }
                  }

                  // Beat edge: a fresh-colored ring of dye blooms outward on each
                  // kick so bass hits are visible in COLOR, not just motion
                  if (kickRef.current.kick && simStep === 0) {
                    const ringCol = colFor(2.0);
                    const ringR = (10 + bass01 * 14) * GRID_SCALE;
                    const drops = 14;
                    for (let d = 0; d < drops; d++) {
                      const a = (d / drops) * Math.PI * 2 + time;
                      const rx2 = Math.floor(centerX + Math.cos(a) * ringR);
                      const ry2 = Math.floor(centerY + Math.sin(a) * ringR);
                      if (rx2 > 1 && rx2 < GRID_SIZE - 2 && ry2 > 1 && ry2 < GRID_SIZE - 2) {
                        activeFluid.addDensity(rx2, ry2, bass01 * 1.1 * impactMul, ringCol.r, ringCol.g, ringCol.b);
                        activeFluid.addVelocity(rx2, ry2, Math.cos(a) * 0.25 * bass01, Math.sin(a) * 0.25 * bass01);
                      }
                    }
                    // The beat is when an operator adds something, so it is
                    // when the plate's own liquids arrive too — somewhere on
                    // the ring rather than always dead centre, which would
                    // build one permanent patch of soap in the middle and
                    // leave the rest of the plate clean.
                    {
                      const da = Math.random() * Math.PI * 2;
                      doseLiquid(activeFluid, plateLiquidsRef.current,
                        centerX + Math.cos(da) * ringR, centerY + Math.sin(da) * ringR, bass01);
                    }
                  }
                  lastBass01Ref.current = bass01;

                  // Mid: orbital injection in its own hue
                  if (mid01 > 0.2) {
                    const midCol = colFor(1.3);
                    const orbitR = GRID_SIZE * 0.3;
                    const mx = Math.floor(centerX + Math.cos(time * 0.6) * orbitR);
                    const my = Math.floor(centerY + Math.sin(time * 0.8) * orbitR);
                    if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
                      activeFluid.autoInject(aStyle(), mx, my, mid01 * 0.06 * autoAmp, midCol.r, midCol.g, midCol.b, mid01);
                      activeFluid.addTemp(mx, my, mid01 * 0.025 * autoAmp);
                    }
                  }

                  // Treble: scattered sparks — heat plus tiny bright dye specks
                  // so high frequencies glitter instead of acting invisibly
                  if (treble01 > 0.2) {
                    const sparkCol = colFor(3.1);
                    // Fewer, larger droplets: a cloud of one-cell specks blurs
                    // into fog, a handful of real drops stays drops.
                    const sparks = Math.floor(treble01 * 2 * impactMul);
                    for (let s = 0; s < sparks; s++) {
                      const sx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                      const sy = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
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

                  // Energy: roaming swell in a third hue
                  if (energy01 > 0.15) {
                    const swellCol = colFor(2.6);
                    const ex = Math.floor(centerX + Math.cos(time * 0.4) * GRID_SIZE * 0.25);
                    const ey = Math.floor(centerY + Math.sin(time * 0.3) * GRID_SIZE * 0.25);
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
            if (R > 0 && kickStep) {
              // Twice what it was: at full, with the band playing, the rock
              // showed on 7 looks of 24 (npm run controls). A ride at full
              // should be unmistakable.
              rock.vx += Math.cos(rock.phase) * bass01 * 14 * R;
              rock.vy += Math.sin(rock.phase) * bass01 * 14 * R;
              rock.phase += 2.4;   // successive kicks go different ways
            }
            // The rhythm plate: on a kick the projectionist presses the top
            // glass and the dye spreads out in a ring, then relaxes back.
            const squeezeAmt = Math.max(0, Math.min(1, currentSettings.beatSqueeze ?? 0));
            if (squeezeAmt > 0 && kickStep && isActiveRef.current && drainFrameRef.current === 0) {
              const leadPlate = fluidsRef.current[0];
              if (leadPlate) {
                const cx = GRID_SIZE / 2 + (Math.random() - 0.5) * 30 * GRID_SCALE;
                const cy = GRID_SIZE / 2 + (Math.random() - 0.5) * 30 * GRID_SCALE;
                // Three nested discs make a rough dome, so the dye spreads
                // from the middle instead of only at one hard ring.
                // Twice what it was: at full it showed on 6 looks of 24 with the band playing.
                const a = 0.0024 * squeezeAmt * bass01;
                const fg = currentSettings.fingering ?? 0;
                leadPlate.applySquish(cx, cy, 40, a, fg, true);
                leadPlate.applySquish(cx, cy, 27, a, fg);
                leadPlate.applySquish(cx, cy, 15, a, fg);
                if ((currentSettings.beads ?? 0) > 0) beadsRef.current.disturb(cx, cy, 30 * GRID_SCALE, 0.4 * squeezeAmt * bass01);
              }
            }
            const w = 2 * Math.PI * 0.9, z = 0.22;
            const ax = -w * w * rock.x - 2 * z * w * rock.vx;
            const ay = -w * w * rock.y - 2 * z * w * rock.vy;
            rock.vx += ax * simStepS; rock.vy += ay * simStepS;
            rock.x += rock.vx * simStepS; rock.y += rock.vy * simStepS;
            const swayX = noise2D(time * 0.11, 3.7) * 0.35 * R;
            const swayY = noise2D(7.1, time * 0.09) * 0.35 * R;
            // A phone held by the projectionist: its tilt is the plate's, fading
            // out a couple of seconds after the last reading if the link drops.
            const ext = externalTiltRef.current;
            const extAge = performance.now() * 0.001 - ext.at;
            const extK = extAge < 2.5 ? 1 - Math.max(0, extAge - 1.5) : 0;
            const tiltX = (rock.x + swayX) * 0.004 * R + ext.x * 0.0045 * extK;
            const tiltY = (rock.y + swayY) * 0.004 * R + ext.y * 0.0045 * extK;
            // The current takes the rock itself (its spring's displacement and the
            // sway, ±1–2), scaled by the slider; the phone's tilt joins it.
            const rockX = (rock.x + swayX) * R + ext.x * 1.1 * extK;
            const rockY = (rock.y + swayY) * R + ext.y * 1.1 * extK;
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
              const room = bubbles.bubbles.length < 3 + Math.round(14 * bubbleAmt);
              const onset = kickStep;
              if (currentAudioData && room && ((onset && Math.random() < 0.45 * bubbleAmt) || (bass01 > 0.5 && Math.random() < 0.003 * bubbleAmt))) {
                const dens = fluidsRef.current[0]?.readDensity;
                let bx = GRID_SIZE / 2, by = GRID_SIZE / 2, best = -1;
                for (let t = 0; t < 6; t++) {
                  const a = Math.random() * Math.PI * 2, rr = (6 + Math.random() * 40) * GRID_SCALE;
                  const px = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr), py = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
                  const d = dens ? dens[Math.max(0, Math.min(GRID_SIZE - 1, px)) + Math.max(0, Math.min(GRID_SIZE - 1, py)) * GRID_SIZE] : 0;
                  if (d > best) { best = d; bx = px; by = py; }
                }
                bubbles.spawn(bx, by, (0.9 + bass01 * 1.2) * GRID_SCALE, 2 + Math.floor(Math.random() * 3), 3 * GRID_SCALE);
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
              // A pop is a puff of air into the dye where the bubble was.
              for (const ev of bubbles.events) {
                if (ev.kind === 'pop' && lead) {
                  const px = Math.round(ev.x), py = Math.round(ev.y);
                  if (px > 2 && py > 2 && px < GRID_SIZE - 3 && py < GRID_SIZE - 3) lead.blowAir(px, py, Math.max(2, Math.round(ev.r / GRID_SCALE)), 0.035);
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

            // Use realDt only — never timeMultiplier, which spikes with audio energy
            const rotationSpeed = (currentSettings.rotationSpeed ?? 0) * 0.01 + Math.abs(rotationMod) * 0.3;
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

              `rotationSpeed` is the motor: the speed the plate is *asked* to
              hold, and the flywheel relaxes toward it rather than being set
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
            const motor = rotationSpeed * dirMod;
            const bed = (currentSettings.viscosity === 'thin' ? 0.8 : 1.7)
              * (1 + (currentSettings.platePressure ?? 0) * 0.8);
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
            let vel = vel0 + (motor - vel0) * (1 - Math.exp(-dragRate * realDt));
            // Dry friction, toward the motor's speed: with no motor that is rest.
            const grip = dragRate * 0.02 * realDt;
            vel = Math.abs(vel - motor) <= grip ? motor : vel - Math.sign(vel - motor) * grip;
            if (Number.isFinite(vel)) spinVelRef.current[l] = vel;
            // The plate is told what it is doing, so the liquid touching it
            // can be dragged round by it (the twist in paramsFor).
            if (fluidsRef.current[l]) fluidsRef.current[l].plateSpin = spinVelRef.current[l] ?? 0;
            /*
              An angle that accumulates cannot be allowed to go non-finite —
              see the note above, which is why both of these are guarded and
              not just the sum.
            */
            const turn = (spinVelRef.current[l] ?? 0) * realDt;
            if (Number.isFinite(turn)) rotationAnglesRef.current[l] += turn;
            const fl = fluidsRef.current[l];
            if (fl) {
              fl.plateAngle = rotationAnglesRef.current[l] ?? 0;
              const drawn = Math.max(1, 1.5 * Math.max(canvas.clientWidth, canvas.clientHeight));
              fl.viewHalfW = 0.5 * canvas.clientWidth / drawn;
              fl.viewHalfH = 0.5 * canvas.clientHeight / drawn;
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
        const setZoom = currentSettings.macroZoom ?? 1;
        const wantZoom = currentSettings.macroMode === true
          ? (setZoom > 1.05 ? setZoom : MACRO_PRESET_ZOOM)
          : Math.max(1, setZoom);
        const macroAmount = Math.max(0, Math.min(1, (wantZoom - 1) / (MACRO_FULL_ZOOM - 1)));
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

        // Velocity range for the macro detail pass, encoded against the
        // frame's own peak speed so slow and fast passages both resolve;
        // u_flowRate converts back to fluid-UV per second in the shader.
        let flowRate = 0;
        let velRange = 1e-3;
        if (macroOn) {
          const probe = fluidsRef.current[0];
          const pvx = probe.readVx, pvy = probe.readVy;
          for (let j = 2; j < GRID_SIZE - 2; j += 4) {
            for (let i = 2; i < GRID_SIZE - 2; i += 4) {
              const idx = i + j * GRID_SIZE;
              const ax = Math.abs(pvx[idx]), ay = Math.abs(pvy[idx]);
              if (ax > velRange) velRange = ax;
              if (ay > velRange) velRange = ay;
            }
          }
          // cells advected per second = v * (dt * (N-2)) / N / realDt
          const frameDt = Math.max(1 / 240, Math.min(0.2, realDt));
          flowRate = velRange * (fluidsRef.current[0].dt * (GRID_SIZE - 2)) / GRID_SIZE / frameDt;
        }

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
        const lum = renderer?.drawFrame({
          settings: currentSettings, time, shot,
          macroOn, macroAmount, isDarkBlend,
          velRange, flowRate,
          rotations: rotationAnglesRef.current,
          harmony: harmonyRef.current,
          lamp: lampRef.current,
          gelAngle: gelAngleRef.current,
          kaleidoPhase: kaleidoPhaseRef.current,
          layer1: layer1ViewRef.current,
          bubbles: bubbleDebugRef.current,
          bubblePack: { packed: bubblesRef.current.packed, shape: bubblesRef.current.packedShape },
          dimmerGain: flashGainRef.current,
          filmLevel: filmLevelRef.current,
          filmGain: filmGainRef.current,
          mark: markRef.current,
          film: filmRef.current,
          beadMask,
          outputCfg: outputCfgRef.current,
          postForce: postForceRef.current,
          postTest: postTestRef.current,
          fxFrame: fxFrameRef.current,
          fxSeed: fxSeedRef.current,
        }, fluidsRef.current) ?? null;

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
        if (lum !== null) flashGainRef.current = flashRef.current.sample(performance.now(), lum);
        else if (flashGainRef.current !== 1) { flashRef.current.reset(); flashGainRef.current = 1; }
      }

      // Governor: judge this frame. A rung change takes effect through the
      // engine block on the next frame, which reallocates the solver and
      // resizes the canvas as needed.
      if (frameS > 0 && governorRef.current) {
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
      and calls this; the guard is what keeps that from becoming a second
      clock when both windows are up, because a frame already drawn this
      display interval is not drawn again.
    */
    (window as unknown as { __chromaglassFrame?: () => void }).__chromaglassFrame = () => {
      const now = performance.now();
      if (now - lastExternalFrame < 6) return;     // this interval already has a frame
      lastExternalFrame = now;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      render();
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
        /** Where the pointer is on the plate, in grid cells: where a tool acts. */
        pointer: () => ({ ...mousePosRef.current, down: isMouseDownRef.current, grid: GRID_SIZE }),
        /** Kicks heard since the plate started: whether the beat is reaching the rides that follow it. */
        kicks: () => kickCountRef.current,
        beads: beadsRef.current.beads.length,
        beadList: beadsRef.current.beads.map(b => [b.x, b.y, b.r]),
        chemistry: chemRef.current,
        film: filmRef.current,
        fluids: fluidsRef.current,
        rotation: rotationAnglesRef,
        /** Angular velocity per layer, rad/s, and the flick that adds to it. */
        spin: spinVelRef,
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

    /** The renderer is up: size it, give the governor its ladder, and go. */
    const startWith = (r: PlateRenderer) => {
      renderer = r;
      const ladder = qualityLadder(tier, r.info.gpuClass);
      governorRef.current = new QualityGovernor(
        ladder.rungs,
        PINNED_RUNG ?? ladder.start,
        performance.now() * 0.001,
        PINNED_RUNG !== null,
      );
      // Below whatever ran out of memory before.
      const g = governorRef.current;
      while (g.rung.grid > gridCapRef.current && g.failRung(performance.now() * 0.001)) { /* down a rung */ }
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
      const px = canvasPixelsFor(
        dpr, stageRef.current, stage?.device.limits.maxTextureDimension2D ?? 8192,
        devicePixels(), { width: window.innerWidth, height: window.innerHeight },
      );
      canvas.width = px.width;
      canvas.height = px.height;
      return dpr;
    };
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let healthyTimer: ReturnType<typeof setTimeout> | null = null;
    void WebGPUStage.start(canvas).then((s) => {
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
        if (!kept) layPlateRef.current(livePresetRef.current);
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
            if (fluid.gpu) fluid.detachGpu();
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
            // What the finish needs, taken from the uniforms the plate was
            // just given rather than worked out a second time here: the
            // dimmer with the flash guard folded in, and the mark's fader
            // and rectangle. One mapping, so the two cannot drift.
            const [dimmerNow] = plate.pack.get('dimmer');
            const [markOnNow] = plate.pack.get('markOn');
            const markRectNow = plate.pack.get('markRect') as [number, number, number, number];
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
                size, live, Math.max(view.velRange, 1e-6),
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
                }, stage?.profiler.renderPass('finish'), !!out);
              }
              if (out) out.draw(encoder, target, quads, stage?.profiler.renderPass('output'));
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
             * 2, forces, current, dye diffuse, advect dye, sharpen, grain,
             * decay. It costs a dozen pass boundaries a step, so the total
             * reads a little high — the shares are the point, not the sum.
             */
            stageTimings: (on: boolean) => {
              for (const f of fluidsRef.current) {
                if (f.gpu instanceof WebGPUFluid) { f.gpu.profiler.ms.clear(); f.gpu.stageTimings = on; }
              }
              return on;
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
      const px = canvasPixelsFor(
        dprRef.current, stageRef.current, renderer?.maxTexture ?? 8192,
        devicePixels(), { width: window.innerWidth, height: window.innerHeight },
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
    const getTransformedMousePos = (clientX: number, clientY: number, rect: DOMRect) => {
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
      const spread = settingsRef.current.macroMode ? 0 : Math.max(0, Math.min(1, settingsRef.current.dishSpread ?? 0));
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
        return { x: Math.floor((0.5 + dx * 0.5) * GRID_SIZE), y: Math.floor((0.5 + dy * 0.5) * GRID_SIZE) };
      }
      let fx = rx / (scale * z) + shot.cx * GRID_SIZE;
      let fy = ry / (scale * z) + shot.cy * GRID_SIZE;
      // The second layer is viewed through its own zoom and drift.
      const view = layer1ViewRef.current;
      if (activeLayerRef.current === 1 && shot.zoom <= 1.0001 && view.zoom > 1.001) {
        fx = ((fx / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dx) * GRID_SIZE;
        fy = ((fy / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dy) * GRID_SIZE;
      }
      return { x: Math.floor(fx), y: Math.floor(fy) };
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
    };

    const handleTouchStart = (e: TouchEvent) => {
      isMouseDownRef.current = true;
      if (e.touches[0]) {
        const rect = drawnRect();
        mousePosRef.current = getTransformedMousePos(e.touches[0].clientX, e.touches[0].clientY, rect);
      }
    };
    const handleTouchEnd = () => { isMouseDownRef.current = false; };
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const rect = drawnRect();
      const { x, y } = getTransformedMousePos(e.touches[0].clientX, e.touches[0].clientY, rect);
      mousePosRef.current = { x, y };
      const activeFluid = fluidsRef.current[activeLayerRef.current];
      // Not under the magnet, the finger or the drop, as for the mouse above.
      if (activeFluid && activeToolRef.current !== 'magnet' && activeToolRef.current !== 'finger' && activeToolRef.current !== 'dropper' && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
        activeFluid.applySquish(x, y, 8, 0.005);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);
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
      stopFilm();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
      // And the frame the projector could ask for goes with it.
      delete (window as unknown as { __chromaglassFrame?: () => void }).__chromaglassFrame;
      unprovide();
      if (retryTimer) clearTimeout(retryTimer);
      if (healthyTimer) clearTimeout(healthyTimer);

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
        className="w-full h-full cursor-crosshair"
        // Letterboxed whenever the box it is shown in is not the shape it was
        // rendered at — with a projector attached, and in the desk's preview.
        style={staged || frame ? { objectFit: 'contain', objectPosition: 'center' } : undefined}
        id="liquid-canvas"
      />
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
