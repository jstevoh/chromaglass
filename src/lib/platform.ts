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
  /** Canvas pixels per CSS pixel, capped at the device's own ratio. */
  dpr: number;
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
 */
export function qualityLadder(tier: PlatformTier, gpu: GpuClass): { rungs: QualityRung[]; start: number } {
  const dpr = devicePixels();
  if (gpu === 'software') return { rungs: [{ grid: 256, dpr: 1 }], start: 0 };

  const rungs: QualityRung[] =
    tier === 'hosted'
      ? [
          { grid: 512, dpr: Math.min(dpr, 1.5) },
          { grid: 512, dpr: 1 },
          { grid: 384, dpr: 1 },
          { grid: 256, dpr: 1 },
        ]
      : [
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
  const wanted = gpu === 'strong' ? 512 : gpu === 'mid' ? 384 : 256;
  let start = rungs.findIndex((r) => r.grid <= wanted && r.dpr === 1);
  if (start < 0) start = rungs.length - 1;
  return { rungs, start };
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
 * own pixels are the target and the rung is a fraction of them; the mirror
 * shows the real picture and this window a scaled copy.
 */
export function canvasPixelsFor(
  dpr: number,
  stagePx: { width: number; height: number } | null,
  cap: number,
  devicePx: number,
  windowPx: { width: number; height: number },
): { width: number; height: number } {
  const hold = (v: number) => Math.max(1, Math.min(cap, Math.round(v)));
  if (stagePx) {
    const frac = Math.min(1, dpr / Math.max(devicePx, 1e-6));
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
