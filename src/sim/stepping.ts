/**
 * How the frame loop steps the solver, and the query-string switches that
 * pin it for a measurement: the step and its catch-up, the pinned rung, the
 * pinned step rate, the lockstep a cloud session reads frames in, and the
 * recovery limits.
 *
 * Moved out of `components/LiquidVisualizer.tsx` (PLAN 19ai-3) unchanged.
 * Each switch is read once, when this module loads, from the page's query
 * string and nothing else, as it was when it was read at the top of the
 * component's module; so is the `?asked` ledger below, which has to be on
 * before the first look asks for a pipeline.
 */
import { SimResolution } from '../types';
import { PipelineCache } from '../gpu/kit';
import { QualityGovernor } from '../lib/governor';

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
export const MAX_PINNED_GRID = 1024;

/**
 * `?stages` — have the solver time itself stage by stage from the first frame
 * (H0, docs/webgpu-plan.md).
 *
 * The same switch as `chromaglassDebug().webgpu.stageTimings(true)`, for a
 * measurement that wants the page to have been doing it all along rather than
 * from whenever a console line was typed. Diagnostic only: it is read from the
 * query string and nothing else, so no preset or saved look can reach it.
 */
export const STAGE_TIMINGS = (() => {
  try { return new URLSearchParams(window.location.search).has('stages'); } catch { return false; }
})();

/**
 * `?prepare=0`: open the show without building its pipelines ahead
 * (`gpu/prepare.ts`), as it opened before, each one built on the frame that
 * first asks. `npm run startup` opens the show once this way as its control.
 * Diagnostic only, from the query string alone, like `?stages`.
 */
export const PREPARE_OFF = (() => {
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
export const PINNED_RUNG = (() => {
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
export function postLevelLabel(governor: QualityGovernor | null | undefined): string {
  const level = governor?.postLevel ?? 0;
  return level === 1 ? ' · effects ½' : level === 2 ? ' · effects off' : '';
}

/**
 * The stage draws the show (docs/webgpu-plan.md): there is one engine.
 */

// choice to the frame-time governor.
/** How many times a lost device is asked for again before the screen says it is gone (~2 min of backoff). */
export const RECOVERY_TRIES = 8;

/** Consecutive frames that throw before the stage is rebuilt (about 1.5 s at 60 fps). */
export const SELF_HEAL_FRAMES = 90;

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
export const HANDOFF_KEEP = 0.02;

/** How many pours of the new palette arrive through the fade, on top of its seed. */
export const HANDOFF_POURS = 4;

/** Whether Evolve pours whole-plate floods at the peak of a gust. Off: evolve is subtle. */
export const EVOLVE_FLOODS = false;

/** GPU errors within three seconds that mean the stage's objects have gone invalid, not a one-off. */
export const ERROR_STORM = 45;

/**
 * `auto` is the grid 'auto' stands for: the governor's rung of the moment
 * live, its opening rung for a song render (see `QualityGovernor.openingRung`).
 */
export const resolveSimResolution = (setting: SimResolution | undefined, governor: QualityGovernor, maxTexture: number, auto = governor.rung.grid): number => {
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
export const SIM_STEP = 1 / 60;

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
export const PINNED_STEP_RATE = (() => {
  if (typeof window === 'undefined') return null;
  const n = Number(new URLSearchParams(window.location.search).get('steps'));
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : null;
})();

// `?warp=N` (diagnostic) lifts the catch-up cap so a slow renderer can still
// take many solver steps per frame: the sim never runs ahead of wall-clock,
// it just stops falling behind. Used to capture developed frames on machines
// that render at a few fps.
export const SIM_MAX_CATCHUP = (() => {
  if (typeof window === 'undefined') return 4;
  const warp = Number(new URLSearchParams(window.location.search).get('warp'));
  return Number.isFinite(warp) && warp >= 1 ? Math.min(240, Math.round(warp)) : 4;
})();

/*
  `?lockstep=1` (diagnostic, the checks' software runs only): a frame is one
  solver step long, whatever the wall clock says.

  Live, a frame's elapsed time is the wall clock's, and on a GPU that is a
  sixtieth of a second and a step. On a cloud session's software WebGPU a
  frame is one step and two to fifteen seconds (PLAN.md 19l), and everything
  the frame loop moves by elapsed time moved all of it: the lamp's wander,
  the gel wheel, the plate's rotation, the phrasing. Measured 2026-10-27 with
  `npm run bubbles`' two photographs of a slowed plate: 21.5% of its pixels
  moved across one step taking 7.4 s, 26.8% across three steps in 15 s, 34.3%
  across six in 23 s; the Mac, in its 1.2 s and 72 steps, moves 4 to 8%. What
  moved was the wall clock, not the liquid. So the software plate was a Mac
  plate with every wall-clock thing on it run fast, and a check that read it
  read neither.

  With the flag each frame's elapsed time is exactly the step it takes, so a
  software plate is the Mac's plate in slow motion: `npm run bubbles`' plate
  developed for 540 steps is the plate the Mac develops in nine seconds. What
  it does not reach: the show's own intervals (Evolve's six-second drift, the
  sequencer) and whatever stamps `showNow()`, which stay the wall clock's,
  and sound, which plays in real time. A harness asks for it through
  `engineQuery({ lockstep: true })` (scripts/frame.mjs), which a GPU never
  sends, so nothing a Mac measures moves.
*/
export const LOCKSTEP = (() => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('lockstep') === '1';
})();
