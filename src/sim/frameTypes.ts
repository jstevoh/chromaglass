/**
 * The shapes that cross the visualizer's edge: what a frame hands its
 * renderer (`FrameView`, `PlateRenderer`), what a song render reads back
 * (`VisualizerRender`, `FrameDigest`), and the song shape the handle reports.
 *
 * Moved out of `components/LiquidVisualizer.tsx` (PLAN 19ai-3) so that what
 * imports one of them (`hooks/useSongRender.ts`, the renderers) no longer
 * imports the component to get a type. The component's own handle
 * (`LiquidVisualizerHandle`) stays with the component.
 */
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings } from '../types';
import type { PostTest } from '../gpu/post';
import { type OutputConfig } from '../lib/outputConfig';
import { type FlashGuardTiles } from '../lib/flashGuard';
import { type MacroShot } from '../lib/macroCamera';
import { type GpuClass } from '../lib/platform';
import { type SongEvent, type SongShapeState } from '../lib/songShape';
import { type BarNow } from '../lib/barGrid';
import { type FluidSimulation } from './fluidSimulation';
import type { BeadField } from '../lib/beads';

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
export interface FrameView {
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
   * What the plate hears this frame: the pitch class and brightness from the
   * audio features, and where the frame sits between two beats (0..1, 0 with
   * no beat clock). The plate's uniforms read it as `PlateView.audio`
   * (gpu/plateUniforms.ts), which is where the shader's `pitchClass`,
   * `brightness` and `beatPhase` come from.
   */
  audio: { pitchClass: number; brightness: number; beatPhase: number; beatSway: number };
  /**
   * The oil beads, on the frames they moved and their mask is to be drawn
   * again (on the GPU, from their list: PLAN 14ab-6) — null on every other
   * frame, and whenever the beads are off. The show decides when it changes
   * so that both engines draw the same mask on the same frames rather than
   * each asking the bead field in its own way.
   */
  beadMask: BeadField | null;
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
export interface PlateRenderer {
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
  drawFrame(view: FrameView, fluids: FluidSimulation[]): FlashGuardTiles | null;
  /**
   * What the GPU spent on a frame that took `steps` solver steps, in
   * milliseconds — the drawing and the solver together, from timestamp
   * queries. Absent on an engine that cannot say (WebGL's timer queries count
   * queue waits on ANGLE and lie), and 0 until the first timings land.
   */
  gpuFrameMs?(steps: number): number;
  /**
   * What one solver step costs the GPU, every layer together (ms), from the
   * same timestamps: the governor predicts a climb's cost from it (PLAN.md
   * 14aa-3). Absent where `gpuFrameMs` is, 0 until the first timings land.
   */
  gpuStepMs?(): number;
  /**
   * What `?debug` should show about this engine in particular. It is spread
   * into `chromaglassDebug()` at the top level, so a harness reaching for
   * `chromaglassDebug().gl` finds it exactly where it always was.
   */
  debug?(): Record<string, unknown>;
}
