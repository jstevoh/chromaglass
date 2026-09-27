/**
 * Where is this build running, and on what?
 *
 * One codebase serves three situations: the hosted page anyone can open, the
 * same build served from a laptop on the LAN for a show, and (eventually) a
 * native shell. The solver, renderer and audio are identical in all three —
 * only the defaults differ, and the difference is entirely how much headroom
 * to assume. Everything here is a starting guess; the quality governor
 * (`governor.ts`) measures the real frame rate and moves from there.
 */

export type PlatformTier = 'hosted' | 'local' | 'native';

/** A coarse read of the GPU, from its adapter — `classifyAdapter` in `gpu/device.ts`. */
export type GpuClass = 'software' | 'weak' | 'mid' | 'strong';

/** One quality level: which solver grid, and how many device pixels to render. */
export interface QualityRung {
  /** Solver edge length. */
  grid: number;
  /**
   * How many pixels to draw. With no stage, canvas pixels per CSS pixel of
   * the show window, capped at the device's own ratio. With a stage (a
   * projector mirroring the canvas), the share of the stage's own width and
   * height: 1 is every pixel the projector has (PLAN.md §14c, `stageLadder`).
   */
  dpr: number;
}

/** A projector's own pixels, as the wall window announces them (`CastDisplay`). */
export interface StagePixels {
  width: number;
  height: number;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|.*\.local$)/i;

/** Read `?tier=` / `?gpu=` overrides for testing a tier on the wrong machine. */
const override = (key: string): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
};

export function detectTier(): PlatformTier {
  const forced = override('tier');
  if (forced === 'hosted' || forced === 'local' || forced === 'native') return forced;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: unknown; __TAURI__?: unknown };
  if (w.__CHROMAGLASS_NATIVE__ || w.__TAURI__ || /Electron/i.test(navigator.userAgent)) return 'native';
  if (PRIVATE_HOST.test(window.location.hostname)) return 'local';
  return 'hosted';
}

/** The device's pixel ratio, held to a sane range. */
export const devicePixels = (): number => Math.max(1, Math.min(3, window.devicePixelRatio || 1));

/**
 * `?dpr=` — render the plate at a fraction of the window's pixels.
 *
 * A diagnostic knob, like `?sim=` and `?tier=`, and the only one of them that
 * exists for a machine with no GPU at all. On a CI runner WebGL goes through
 * SwiftShader, and measuring that showed where the browser suite's time
 * actually went: the GPU process sat at 309% CPU — three of four cores — doing
 * nothing but shading fragments, while the renderer process running React and
 * the fluid solver used nine. Every step of the harness was queueing behind a
 * saturated compositor.
 *
 * Fragment cost is the pixel count, so it falls with the square of this: at
 * 0.5 the shader does a quarter of the work. Nothing the harness measures
 * changes — layout is CSS, geometry is CSS, luminance is a mean over whatever
 * resolution the canvas happens to be — only the sharpness of a picture that,
 * in a run with no screen, nobody is looking at.
 *
 * It is never read from anything but the query string, so no preset, fader or
 * saved look can reach it, and a plain visit renders at full resolution.
 */
export function renderScale(): number {
  const raw = override('dpr');
  if (raw === null) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.2, Math.min(1, n));
}

/**
 * The quality ladder for a tier, best rung first, plus where to start on it.
 *
 * Hosted never renders above 1.5x pixels and still starts low, but it no
 * longer stops at 384². The cap was a safety net written as a ceiling, and a
 * ceiling is the wrong shape for it: the governor already measures the real
 * frame interval and steps down within a couple of seconds, so a machine that
 * cannot hold 512² loses nothing by being offered it, while a machine that can
 * was being held at cells nearly three screen pixels wide on a 1080p
 * projector — which is most of what "the liquids look soft" turned out to be.
 * What the hosted page still will not do is 768² or above 1.5x pixels: that is
 * where a first visit on an unknown laptop starts costing more than it returns.
 *
 * Local and native run the full ladder — the point of running it yourself is
 * to use the whole machine. A software adapter gets the smallest grid and
 * nothing else: it will be slow, but a slow show is the right failure, and the
 * governor would only find the rest out one rung at a time.
 *
 * There was a CPU rung under all of this until P7. It was the WebGL
 * renderer's floor — that engine packed the JavaScript solver's arrays into
 * its own textures and drew them, so a machine with no usable float targets
 * still got a show. The WebGPU stage cannot: its compositor samples the
 * solver's textures, and a field that is not on the GPU has none. Left in, the
 * rung was not a slower show but a black one, which is what CI found — 1,676
 * frames of nothing over a plate that was simulating perfectly well. The
 * solver it fell back to is gone now, and so is the rung.
 *
 * With a stage attached the ladder is the stage's, not the laptop's: see
 * `stageLadder` below. With none, it is exactly what it was before a stage
 * had a ladder of its own, which `npm run rungs` holds to a fixture.
 */
export function qualityLadder(
  tier: PlatformTier,
  gpu: GpuClass,
  // Required, not defaulted: a caller that forgot the stage would compile
  // and quietly give a projector the laptop's ladder (the check-skeptic).
  stage: StagePixels | null,
  gridCap = Number.POSITIVE_INFINITY,
): { rungs: QualityRung[]; start: number } {
  const dpr = devicePixels();
  if (gpu === 'software') return { rungs: [{ grid: 256, dpr: 1 }], start: 0 };
  // Where to open, by the hardware's class (see the start, at the end).
  const wanted = gpu === 'strong' ? 512 : gpu === 'mid' ? 384 : 256;
  if (stage) return stageLadder(tier, wanted, stage, gridCap);

  const rungs: QualityRung[] =
    tier === 'hosted'
      ? [
          { grid: 512, dpr: Math.min(dpr, 1.5) },
          { grid: 512, dpr: 1 },
          { grid: 384, dpr: 1 },
          { grid: 256, dpr: 1 },
        ]
      : [
          /*
            1024², where a display has one pixel per pixel (H3).

            The rung H2 was written against, and its gate was "1024² holds 30
            fps on the M4 that manages 22 today". Measured on that M4 with
            `npm run ladder`, at thirty steps a second — which is what makes
            it possible, since at sixty the plate is in slow motion at this
            grid whatever the pixels:

              1024² @ 1x   30.8 ms   32 fps   29.8 of 30 steps
              1024² @ 2x   44.7 ms   22 fps      29 of 60 steps

            So it clears the gate at one device pixel and misses it at two —
            the solver step costs the same either way (25.2 ms both times: it
            is the grid, not the pixels), and what breaks it is shading four
            times the canvas. A rung that cannot hold is worse than no rung:
            the governor would climb into it, spend a step-down and a settling
            period finding out, and offer it again ninety seconds later, for
            about eight seconds of a degraded show every minute and a half.

            So it is offered where it was measured to hold. That is also the
            case that matters most — a show runs on a projector, and a
            projector has one pixel per pixel.
          */
          ...(dpr <= 1 ? [{ grid: 1024, dpr }] : []),
          { grid: 768, dpr },
          { grid: 512, dpr },
          { grid: 512, dpr: 1 },
          { grid: 384, dpr: 1 },
          { grid: 256, dpr: 1 },
        ];

  /*
    No rung twice.

    A rung is a grid and a number of device pixels, and on a display that has
    only one pixel per pixel — a projector, most external monitors, any
    machine that is not Retina — `{512, dpr}` and `{512, 1}` are the same
    rung written down twice. The governor cannot tell, so a machine
    struggling at 512² steps "down", waits out a settling period, measures
    the identical frame, and steps down again: four seconds of a slow show
    spent discovering that nothing happened.

    Deduplicating here rather than writing two ladders keeps the rungs in one
    place and lets the ratio decide, which is what actually varies.
  */
  const seen = new Set<string>();
  const distinct = rungs.filter((r) => {
    const key = `${r.grid}:${r.dpr.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  rungs.length = 0;
  rungs.push(...distinct);

  // Start one step below the best guess for the hardware so the first seconds
  // are smooth; the governor climbs within ~10 s if the machine has room.
  let start = rungs.findIndex((r) => r.grid <= wanted && r.dpr === 1);
  if (start < 0) start = rungs.length - 1;
  return { rungs, start };
}

/**
 * The most pixels a stage can have and still be offered 1024².
 *
 * The rung's gate was measured on the M4 as a pixel count, whatever it was
 * written as: 1024² held 32 fps drawing 1280×800 (1.0 Mpx) and fell to 22 at
 * 2560×1600 (4.1 Mpx), with the solver's step at 25 ms both times, so what
 * broke it was shading the canvas. On the laptop's own screen the pixel count
 * and the ratio go together and `dpr <= 1` said it. On a stage they come
 * apart: a 4K projector has one pixel per pixel and 8.3 Mpx, twice the count
 * measured to fail, and a 1080p projector behind 150 % Windows scaling has a
 * ratio of 1.5 and the same 2.1 Mpx as one at 100 %. So the stage is asked by
 * its pixels. 1920×1200 is the largest of the projectors this is written for
 * (WUXGA, the other common native size beside 1080p).
 *
 * 1080p itself sits between what was measured to hold and what was measured
 * to fail, twice the one and half the other. It is offered because a rung the
 * governor can climb into and come back from costs a few seconds, and a rung
 * that is never offered costs every show on a projector the finest plate this
 * build has. Whether it holds there is for `npm run ladder` on the Mac once
 * it can attach a stage, which it cannot yet (PLAN.md §14c).
 */
const STAGE_1024_MAX_PX = 1920 * 1200;

/** A stage's pixel rungs: all of it, three quarters, half (linear, so 100 %, 56 % and 25 % of the pixels). */
const STAGE_SHARES = [1, 0.75, 0.5];

/**
 * The quality ladder while a projector is mirroring the canvas (PLAN.md §14c).
 *
 * Before this, a stage had no ladder of its own. The rungs were the laptop's,
 * built from the laptop's pixel ratio, and each drew `dpr / devicePx` of the
 * stage. Read in the code, that goes wrong in opposite directions on the two
 * laptops that drive projectors. A Retina laptop opened on its `dpr: 1` rung,
 * which on a 2x screen is half of everything: a 1920×1080 projector started at
 * 960×540, stretched by the mirror, and at 150 % Windows scaling at 1280×720.
 * And 1024², written for projectors, was gated on the *laptop* having one pixel
 * per pixel, so the machines that run most shows never saw it. A 1x laptop on
 * a 4K projector had the reverse: `dpr / devicePx` was 1 on every rung, every
 * rung drew all 3840×2160, and the governor had only the grid to give up while
 * what costs on that wall is shading its pixels.
 *
 * The laptop's ratio says nothing about the wall, so a stage's rungs are
 * shares of the stage, and the laptop's ratio is not read at all. The start is
 * the grid this class of GPU opens on at every pixel the projector has, as it
 * was on a 1x laptop, which was the one case the old arithmetic got right: the
 * wall opens at its own resolution. Above the start the rungs climb in grid at
 * the stage's full pixels. At the start the pixel rungs come first, 0.75 and
 * then 0.5 of the stage, and only then the smaller grids at half: a machine
 * that cannot hold the grid it was expected to hold is short of what drawing
 * the wall costs, and on a projector that is the pixels. It is the order the
 * laptop's own 2x ladder already has, pixels given up at 512² before any grid
 * below it.
 *
 * A share below 1 is drawn smaller and scaled up by the wall window, which is
 * why the mirror's smoothing is set to 'high' there (`CastDisplay`).
 *
 * The hosted page keeps its own limits on a stage as it does on a laptop:
 * nothing above 512², since that is where a first visit on an unknown laptop
 * starts costing more than it returns.
 *
 * `gridCap` is the grid the GPU has run out of memory above (`gridCapRef` in
 * `LiquidVisualizer`). A stage's ladder is built under it, opening at the
 * largest grid that fits with the whole stage, rather than walked down to it:
 * below the opening grid this ladder has only half the stage, so a governor
 * stepped down past a grid that ran out of memory went 512² at 1, 0.75, 0.5,
 * marking each failed for good, and left a 1080p wall at 960×540 until a
 * reload, when all that ran out was the grid (the pre-push review). A laptop
 * with no stage had 384² at its full pixels to land on.
 */
function stageLadder(
  tier: PlatformTier,
  wanted: number,
  stage: StagePixels,
  gridCap: number,
): { rungs: QualityRung[]; start: number } {
  const all = tier === 'hosted'
    ? [512, 384, 256]
    : [...(stage.width * stage.height <= STAGE_1024_MAX_PX ? [1024] : []), 768, 512, 384, 256];
  // Never nothing: the smallest grid stays whatever the cap says, as the
  // laptop's ladder keeps its bottom rung (only its failing is the screen).
  const fits = all.filter((g) => g <= gridCap);
  const grids = fits.length ? fits : [all[all.length - 1]];
  const open = grids.find((g) => g <= wanted) ?? grids[grids.length - 1];
  const least = STAGE_SHARES[STAGE_SHARES.length - 1];
  const rungs: QualityRung[] = [
    ...grids.filter((g) => g > open).map((grid) => ({ grid, dpr: 1 })),
    ...STAGE_SHARES.map((dpr) => ({ grid: open, dpr })),
    ...grids.filter((g) => g < open).map((grid) => ({ grid, dpr: least })),
  ];
  return { rungs, start: rungs.findIndex((r) => r.grid === open && r.dpr === 1) };
}

/**
 * How many pixels the canvas should have, for a rung.
 *
 * A rung is a solver grid *and* a share of the display's pixels, and the two
 * are paid for in different places: the grid by the solver, the pixels by
 * everything that draws. This is the second half, and it lives here — pure,
 * with the display's ratio passed in rather than read from `window` — so a
 * harness can check it without a browser.
 *
 * It had to be gathered into one function because there were two and they
 * disagreed. The renderer's own sizing read the *display's* ratio where the
 * rung carries its own, so a step from 512² at 2x to 512² at 1x wrote a new
 * number into the label and left the canvas at full resolution. Every pixel
 * rung on the ladder was inert: measured with `npm run ladder`, the canvas
 * was 2560×1600 on all five rungs. The governor gave up a rung of quality,
 * believed it had bought headroom, found none, and went looking for the next
 * thing to give up — which is the worst shape a quality control can have.
 *
 * With a stage attached a projector is mirroring the canvas, so the stage's
 * own pixels are the target and the rung is a share of them; the mirror
 * shows the real picture and this window a scaled copy.
 *
 * That share used to be `dpr / devicePx`, the rung over the *laptop's* ratio,
 * which is what made a Retina laptop draw a 1080p wall at 960×540 and a 1x
 * laptop draw a 4K wall at full size on every rung (PLAN.md §14c). A stage's
 * rungs are shares of the stage now (`stageLadder`), so the share is the
 * rung's own number and the laptop's ratio is no longer an argument. A
 * fixed grid (the governor off) asks for 1, which is now the whole stage on
 * any laptop, where on a Retina one it was half of it.
 */
export function canvasPixelsFor(
  dpr: number,
  stagePx: StagePixels | null,
  cap: number,
  windowPx: { width: number; height: number },
): { width: number; height: number } {
  const hold = (v: number) => Math.max(1, Math.min(cap, Math.round(v)));
  if (stagePx) {
    const frac = Math.min(1, dpr);
    return { width: hold(stagePx.width * frac), height: hold(stagePx.height * frac) };
  }
  return { width: hold(windowPx.width * dpr), height: hold(windowPx.height * dpr) };
}

/** What the visualizer reports about the engine it is running. */
export interface EngineStatus {
  /** Short readout, e.g. "WebGPU · 512² · 1.0x". */
  label: string;
  /** The stage's solver, or 'none' before one is attached and after a device loss. */
  engine: 'webgpu' | 'none';
  grid: number;
  dpr: number;
  tier: PlatformTier;
  gpu: GpuClass;
  /** The GPU's name, as its own context reports it. */
  renderer: string;
  /** True while the governor is choosing (simResolution is 'auto'). */
  governed: boolean;
  /** The governor has had to drop below where it started on this machine. */
  steppedDown: boolean;
  /** The GPU solver is unavailable (no float render targets) rather than merely slow. */
  gpuUnavailable: boolean;
  /** Smoothed frame interval, milliseconds. */
  frameMs: number;
  /** Cost of one solver step across every layer, milliseconds. */
  simMs: number;
  /** How many plates are being solved — the solver's cost is per layer. */
  layers: number;
  /**
   * Solver steps actually being taken per second, against `stepRate`. Below
   * that the plate is in slow motion: the frames are fine and the liquid is
   * evolving slower than wall-clock, which a frame rate cannot show you. See
   * the catch-up rule in LiquidVisualizer.
   */
  stepsPerSec: number;
  /**
   * Steps a second the loop is *asking* for — sixty unless `?steps=` says
   * otherwise (H2b).
   *
   * It is here because the readout compared against a hard-coded sixty, and
   * the loop no longer always wants sixty. Thirty steps at twice the timestep
   * is the same liquid at the same speed, and the panel reported it as "50%
   * speed" in amber — the warning that exists to catch the plate silently
   * running slow, fired at a plate running exactly on time. A warning that
   * cries wolf is worse than no warning, because the operator learns to read
   * past it.
   */
  stepRate: number;
  /**
   * Frame time that is not the solver — renderer, readback, React, the bead
   * camera, everything else. The number that says whether a finer grid is
   * what is costing you, or whether the grid was never the problem.
   */
  otherMs: number;
}
