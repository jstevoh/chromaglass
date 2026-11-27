/**
 * What `?debug` shows, and what the crash log is told about the plate: the
 * report every harness reads through `chromaglassDebug()`, the three hooks
 * `?debug` puts on `window`, the line the crash log stamps on each entry, and
 * the report's larger part (PLAN 50c, 19ai-10: the frame loop's second piece
 * out of React).
 *
 * Moved verbatim from the frame loop's `useEffect` in
 * `components/LiquidVisualizer.tsx` (the block that began "What `?debug`
 * shows" and ran to `crashLog.provideReport`). The report's keys, their order
 * and every value's expression are the lines that ran there: eighty of the
 * scripts under `scripts/` call `chromaglassDebug()` at run time and read its
 * keys by name, so a key renamed or dropped here is a red check somewhere that
 * says nothing about why. The refs it read as the effect's closure it now reads from `refs`,
 * destructured under the same names. `attachDebug` is called at the block's
 * old place (after the frame's ask is put on `window`, before the self-heal is
 * declared), so the hooks land on `window` and the provider is registered at
 * the same moment of the effect's run, and `unprovide` is called where the
 * cleanup called it.
 *
 * Five lines are not the text they were, because the report does not only
 * read the plate, it reaches into the effect's own `let`s, which are not refs
 * and stay in the effect until that state has a home here:
 *
 * - It read `renderer`, which the effect assigns when a device starts and
 *   again after a loss. It comes in as a getter (`getRenderer()`), so a report
 *   asked for after a rebuild still spreads the new renderer's own part.
 * - Its four fault hooks WRITE four of them: `throwFrames(n)`,
 *   `stepDownFrames(n)`, `forceStepDown()` and `errorStorm(n)` set the
 *   counters and the flag the loop's guard and the frame read (`throwFrames`,
 *   `stepDownFrames`, `forcedStepDown`, `stormFrames`). The brief for a moved
 *   piece allowed a getter for a read and said a piece that writes waits. The
 *   lets were left exactly where they are, read by the guard and the frame as
 *   before, and each write goes through a setter passed beside the getter
 *   (`setThrowFrames(...)` for `throwFrames = ...`): the mirror of the getter
 *   rule, and it decides nothing about where that state finally lives. It can
 *   move with the guards (50c-3) or with the frame, and the setters go then.
 *
 * `outOfMemory` is declared in the effect a few lines after the report, so the
 * component passes a function that calls it rather than the function itself:
 * the hook reaches it when it is called, as the closure did, and the line here
 * is unchanged. `PALETTE_RGB` comes in with the refs because it lives in
 * `src/constants.ts`, outside what this folder may import.
 *
 * This file is the page's, like `pointer.ts`: it writes `window` and
 * `markTest` makes a canvas from `document`. When the loop leaves the page
 * thread (50d) the report is asked for across the seam; nothing in a frame
 * calls it, so nothing here is on the frame's path.
 */
import type { Box } from './types';
import type { FingerHand, CameraPinch } from './pointer';
import type { FluidSimulation } from '../sim/fluidSimulation';
import type { PlateRenderer } from '../sim/frameTypes';
import type { VisualizerSettings } from '../types';
import type { MacroShot } from '../lib/macroCamera';
import type { EngineStatus } from '../lib/platform';
import type { QualityGovernor } from '../lib/governor';
import type { BubbleField } from '../lib/bubbles';
import type { BeadField } from '../lib/beads';
import type { ChemistryField } from '../lib/chemistry';
import type { FlashGuard } from '../lib/flashGuard';
import type { BeatClock } from '../lib/beatClock';
import type { Phrase } from '../lib/phrasing';
import type { OutputConfig } from '../lib/outputConfig';
import { type DrawGate, stampFallbacks, stampMisses } from '../lib/drawGate';
import { padPictureSender } from '../lib/padPicture';
import { setShowSeed, showSeed } from '../lib/rng';
import * as crashLog from '../lib/crashLog';
import { pipelinesSeen } from '../gpu/prepare';
import { magnetsOnPlate } from '../gpu/plateUniforms';
import { GRID_SIZE } from '../sim/constants';
import { PINNED_STEP_RATE } from '../sim/stepping';
import type { DropLaid } from '../sim/tools';

/** A gesture from a hand that is not the pointer, as the component's `performGesture` takes it. */
type Gesture = { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; clear?: boolean; layer?: number; amount?: number; id?: number };

/**
 * The boxes the report reads (and the few it writes), each the component's ref
 * of the same name (see that ref's comment there for what it holds), and after
 * them what the block reached that is not a ref: the effect's two consts, the
 * palette, and the component's own functions.
 */
export interface DebugRefs {
  // The engine's state of health.
  isDraftRef: Box<boolean>;
  engineStatusRef: Box<EngineStatus | null>;
  engineStatusAtRef: Box<number>;
  onEngineStatusRef: Box<((status: EngineStatus) => void) | undefined>;
  governorRef: Box<QualityGovernor | null>;
  gridCapRef: Box<number>;
  glLostRef: Box<boolean>;
  // What the plate was handed and where its clocks are.
  activeLayerRef: Box<number>;
  activeToolRef: Box<string>;
  wallPointRef: Box<((u: number, v: number, layer: number, turned: boolean, reach?: boolean) => { x: number; y: number }) | null>;
  framesDrawnRef: Box<number>;
  clearTriggerRef: Box<number>;
  handedRef: Box<{ layers: number[]; clears: number[]; total: { layers: number; clears: number } }>;
  lastTimeRef: Box<number>;
  beatClockRef: Box<BeatClock>;
  // The sound, as far as the report shows it (the reading's own type lives in hooks/).
  audioDataRef: Box<{ volume: number; energy: number } | null>;
  hearingRef: Box<{ frames: number; fresh: number; ownFrame: number }>;
  ridingRef: Box<{ frames: number; laid: number }>;
  // The solver's timing and its plates.
  simMsRef: Box<number>;
  stepsPerSecRef: Box<number>;
  catchUpRef: Box<number>;
  fluidsRef: Box<FluidSimulation[]>;
  stepFramesRef: Box<number[]>;
  lateStepFramesRef: Box<number>;
  externalTiltRef: Box<{ x: number; y: number; at: number }>;
  blowStepsRef: Box<{ straw: number; wind: number; carried: number; strawFirst: number; directed: number; carries: number; aired: number }>;
  bubblesRef: Box<BubbleField>;
  bubbleDebugRef: Box<{ count: number; strength: number; amount: number }>;
  phraseRef: Box<Phrase>;
  isActiveRef: Box<boolean>;
  // The hands.
  mousePosRef: Box<{ x: number; y: number }>;
  isMouseDownRef: Box<boolean>;
  dropLaidRef: Box<DropLaid>;
  extraHandsRef: Box<Map<number, FingerHand>>;
  pinchRef: Box<CameraPinch | null>;
  lastClearTrigger: Box<number>;
  lastDrainTrigger: Box<number>;
  // The music's marks on the plate, and what else is on it.
  kickCountRef: Box<number>;
  heardKicksRef: Box<{ n: number; lastAt: number | null }>;
  musicBubblesRef: Box<{ chances: number; kicks: number; held: number; impact: number; drive: number; amount: number }>;
  beadsRef: Box<BeadField>;
  chemRef: Box<ChemistryField>;
  filmRef: Box<{ video: HTMLVideoElement | null; kind: 'none' | 'file' | 'camera' | 'window'; stream: MediaStream | null; url: string | null }>;
  rotationAnglesRef: Box<number[]>;
  spinVelRef: Box<number[]>;
  dishSpinRef: Box<number[]>;
  liquidSpinRef: Box<number[]>;
  // The picture: the output, the mark, the camera, the look.
  outputCfgRef: Box<OutputConfig>;
  markRef: Box<{ source: CanvasImageSource; aspect: number; dirty: boolean } | null>;
  macroShotRef: Box<MacroShot>;
  aimProbeRef: Box<{ downs: number; altDowns: number; aims: number; zoom: number; hasAim: boolean }>;
  harmonyRef: Box<number[]>;
  presetContractRef: Box<number[] | null>;
  paletteWindowRef: Box<{ size: number | null; lead: number }>;
  journeyRef: Box<{ lead: number; lastAt: number }>;
  lampRef: Box<{ x: number; y: number; x2: number; y2: number }>;
  settingsRef: Box<VisualizerSettings>;
  livePresetRef: Box<string>;
  autoEventsRef: Box<{ thinned: number; stroked: number; poured: number; palettes: number; kept: number }>;
  flashRef: Box<FlashGuard>;
  // Not refs: the effect's consts, the palette, and the component's functions.
  tier: EngineStatus['tier'];
  drawGate: DrawGate;
  PALETTE_RGB: { r: number; g: number; b: number }[];
  performGesture: (g: Gesture) => void;
  performGestureBanked: (g: Gesture) => void;
  flickSpin: (layer: number, strength?: number) => void;
  outOfMemory: (grid: number, detail: string) => void;
}

/**
 * The effect's own `let`s the report touches, which stay the effect's: a
 * getter for the one it reads, a setter for each of the four its fault hooks
 * write (see the header).
 */
export interface DebugLets {
  getRenderer: () => PlateRenderer | null;
  setThrowFrames: (n: number) => void;
  setStepDownFrames: (n: number) => void;
  setForcedStepDown: (on: boolean) => void;
  setStormFrames: (n: number) => void;
}

/**
 * Build the report, put the `?debug` hooks on `window` and register the crash
 * log's provider. Returns the report (`debugState`) and `unprovide`, which the
 * frame loop's cleanup calls where it called it before.
 */
export function attachDebug(refs: DebugRefs, lets: DebugLets) {
  const {
    isDraftRef, engineStatusRef, engineStatusAtRef, onEngineStatusRef, governorRef, gridCapRef, glLostRef,
    activeLayerRef, activeToolRef, wallPointRef, framesDrawnRef, clearTriggerRef, handedRef, lastTimeRef,
    beatClockRef, audioDataRef, hearingRef, ridingRef, simMsRef, stepsPerSecRef, catchUpRef, fluidsRef,
    stepFramesRef, lateStepFramesRef, externalTiltRef, blowStepsRef, bubblesRef, bubbleDebugRef, phraseRef,
    isActiveRef, mousePosRef, isMouseDownRef, dropLaidRef, extraHandsRef, pinchRef,
    lastClearTrigger, lastDrainTrigger, kickCountRef, heardKicksRef, musicBubblesRef, beadsRef, chemRef,
    filmRef, rotationAnglesRef, spinVelRef, dishSpinRef, liquidSpinRef, outputCfgRef, markRef, macroShotRef,
    aimProbeRef, harmonyRef, presetContractRef, paletteWindowRef, journeyRef, lampRef, settingsRef,
    livePresetRef, autoEventsRef, flashRef,
    tier, drawGate, PALETTE_RGB, performGesture, performGestureBanked, flickSpin, outOfMemory,
  } = refs;
  const { getRenderer, setThrowFrames, setStepDownFrames, setForcedStepDown, setStormFrames } = lets;
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
      /** What `prepareShow` built ahead and each pipeline built on a frame; the page's, so a setup with no renderer yet (a lost device's) still has it (PLAN 14v-12b). */
      pipelines: pipelinesSeen,
      /** The remote's Draw picture (lib/padPicture.ts): sent, their bytes, and whether a pad is asking. */
      padPicture: padPictureSender()?.debug ?? null,
      /** A wall point as the plate's, as a remote's touch is mapped (PLAN 8-draw-a). */
      wallToPlate: (u: number, v: number, layer = activeLayerRef.current, turned = true, reach = false) => wallPointRef.current?.(u, v, layer, turned, reach) ?? null,
      /** Frames through the loop since the page loaded, live or rendered. */
      frames: framesDrawnRef.current,
      /** The clears this engine has been handed (`clearTrigger`): `npm run draftwall` reads the wall's against the desk's copy (PLAN.md 8b). */
      clears: clearTriggerRef.current,
      /** What it was handed, in order: see `handedRef`. */
      handed: { layers: [...handedRef.current.layers], clears: [...handedRef.current.clears], total: { ...handedRef.current.total } },
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
      riding: { frames: ridingRef.current.frames, laid: ridingRef.current.laid },
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
        stepFrames: [...stepFramesRef.current],
        lateStepFrames: lateStepFramesRef.current,
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
      gesture: (g: Parameters<typeof performGesture>[0]) => performGestureBanked(g),
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
        /*
          Which plate the hands are laying on, and the clears and drains the
          loop has taken: what the phone's two-finger Drop prints when the
          plate it reads holds none of what the hands handed it (PLAN.md
          19h-2), so a red says whether the dye went to the other plate or
          was cleared in the window.
        */
        layer: activeLayerRef.current,
        clears: lastClearTrigger.current,
        drains: lastDrainTrigger.current,
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
      paletteRgb: () => PALETTE_RGB.map(({ r, g, b }) => [r, g, b]),
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
      throwFrames: (n: number) => { setThrowFrames(Math.max(0, n | 0)); },
      /*
        The doors S0 closed, made reachable (docs/stability-plan.md, S6).
        Out of memory cannot be caused on demand in a browser, so the hook
        runs the response to it — the cap, the step down — which is the
        half that was never exercised; the detection half is the error
        scope and the uncaptured-error listener, which S2 samples.
      */
      simulateOutOfMemory: () => outOfMemory(fluidsRef.current[0]?.gpu?.N ?? governorRef.current?.rung.grid ?? 0, 'simulated (chromaglassDebug)'),
      stepDownFrames: (n: number) => { setStepDownFrames(Math.max(0, n | 0)); },
      forceStepDown: (steppedDown = true) => {
        setForcedStepDown(steppedDown);
        if (steppedDown) governorRef.current?.failRung(performance.now() * 0.001);
        const prev = engineStatusRef.current;
        const next: EngineStatus = {
          label: prev?.label ?? 'WebGPU · 384² · 1.0x',
          engine: prev?.engine ?? 'webgpu',
          grid: prev?.grid ?? 384,
          dpr: prev?.dpr ?? 1,
          tier,
          gpu: prev?.gpu ?? 'mid',
          renderer: prev?.renderer ?? 'WebGPU',
          governed: true,
          steppedDown,
          gpuUnavailable: false,
          frameMs: prev?.frameMs ?? 24,
          simMs: prev?.simMs ?? 12,
          layers: prev?.layers ?? 1,
          stepsPerSec: prev?.stepsPerSec ?? 30,
          stepRate: prev?.stepRate ?? 30,
          otherMs: prev?.otherMs ?? 4,
        };
        engineStatusRef.current = next;
        engineStatusAtRef.current = performance.now() * 0.001;
        onEngineStatusRef.current?.(next);
      },
      errorStorm: (n: number) => { setStormFrames(Math.max(0, n | 0)); },
      gridCap: () => gridCapRef.current,
      ladderRungs: () => governorRef.current?.rungs ?? [],
      ...(getRenderer()?.debug?.() ?? {}),
    });
  if (!isDraftRef.current && new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { chromaglassDebug?: unknown }).chromaglassDebug = debugState;
    // The ride's counters themselves, read on every frame by `npm run renders`:
    // `chromaglassDebug()` builds its whole report, too much to call per frame.
    (window as unknown as { __cgRiding?: unknown }).__cgRiding = ridingRef.current;
    // Turn the plates to given angles (radians), for scripts/mirror.mjs to
    // reproduce a report's plate exactly.
    (window as unknown as { chromaglassRotation?: unknown }).chromaglassRotation = (angles: number[]) => {
      angles.forEach((a, i) => { if (Number.isFinite(a) && i < rotationAnglesRef.current.length) rotationAnglesRef.current[i] = a; });
    };
  }
  // What every line of the log carries, and the report's larger parts.
  const unprovide = isDraftRef.current ? () => {} : crashLog.provide('visualizer', () => {
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
  if (!isDraftRef.current) crashLog.provideReport({ debug: debugState });
  return { debugState, unprovide };
}
