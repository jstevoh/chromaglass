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

/** A coarse read of the GPU, from its renderer string. */
export type GpuClass = 'software' | 'weak' | 'mid' | 'strong';

/** One quality level: which solver grid, and how many device pixels to render. */
export interface QualityRung {
  /** Solver edge length, or the 192² CPU solver. */
  grid: number | 'cpu';
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

/** Classify a WebGL renderer string. Unknown hardware is assumed mid-range. */
export function classifyGpu(renderer: string): GpuClass {
  const forced = override('gpu');
  if (forced === 'software' || forced === 'weak' || forced === 'mid' || forced === 'strong') return forced;
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|mesa offscreen|basic render/.test(r)) return 'software';
  if (/apple m\d|apple gpu|geforce (rtx|gtx)|radeon (rx|pro)|arc a\d/.test(r)) return 'strong';
  if (/intel|mali|adreno|powervr|iris|uhd|hd graphics|videocore/.test(r)) return 'weak';
  return 'mid';
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
 * to use the whole machine. Software GL gets only the CPU solver; emulated
 * float render targets are far slower than the JavaScript solver and the
 * governor would only find that out the slow way.
 */
export function qualityLadder(
  tier: PlatformTier,
  gpu: GpuClass,
  /**
   * Whether the engine can draw a plate the CPU solver is holding
   * (docs/webgpu-plan.md, P5).
   *
   * The WebGL renderer packs the CPU's arrays into its own textures and draws
   * them, so the bottom of its ladder is a working show on a machine that
   * cannot afford any GPU grid. The WebGPU stage has no such path: its
   * compositor samples the solver's textures, and a field that is not on the
   * GPU has none. Left in, that rung is not a slower show but a black one —
   * which is what CI found, a stage drawing 1,676 frames of nothing over a
   * plate that was simulating perfectly well.
   *
   * So that engine's ladder stops at the smallest GPU grid. A machine that
   * cannot hold it gets a slow show rather than no show, which is the right
   * way round, and the rung goes for good when the CPU solver does (P7).
   */
  cpuFallback = true,
): { rungs: QualityRung[]; start: number } {
  const dpr = devicePixels();
  if (gpu === 'software') {
    return cpuFallback
      ? { rungs: [{ grid: 'cpu', dpr: 1 }], start: 0 }
      : { rungs: [{ grid: 256, dpr: 1 }], start: 0 };
  }

  const rungs: QualityRung[] =
    tier === 'hosted'
      ? [
          { grid: 512, dpr: Math.min(dpr, 1.5) },
          { grid: 512, dpr: 1 },
          { grid: 384, dpr: 1 },
          { grid: 256, dpr: 1 },
          { grid: 'cpu', dpr: 1 },
        ]
      : [
          { grid: 768, dpr },
          { grid: 512, dpr },
          { grid: 512, dpr: 1 },
          { grid: 384, dpr: 1 },
          { grid: 256, dpr: 1 },
          { grid: 'cpu', dpr: 1 },
        ];

  if (!cpuFallback) {
    const i = rungs.findIndex((r) => r.grid === 'cpu');
    if (i >= 0) rungs.splice(i, 1);
  }

  // Start one step below the best guess for the hardware so the first seconds
  // are smooth; the governor climbs within ~10 s if the machine has room.
  const wanted: number | 'cpu' = gpu === 'strong' ? 512 : gpu === 'mid' ? 384 : 256;
  let start = rungs.findIndex((r) => r.grid !== 'cpu' && r.grid <= wanted && r.dpr === 1);
  if (start < 0) start = rungs.findIndex((r) => r.grid === wanted);
  if (start < 0) start = Math.max(0, rungs.length - 2);
  return { rungs, start };
}

/** What the visualizer reports about the engine it is running. */
export interface EngineStatus {
  /** Short readout, e.g. "GPU · 512² · 1.0x". */
  label: string;
  /** WebGL's GPU solver, the CPU solver, or the WebGPU stage (?renderer=webgpu, until the cutover). */
  engine: 'gpu' | 'cpu' | 'webgpu';
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
   * Solver steps actually being taken per second, against the 60 the show
   * asks for. Below that the plate is in slow motion: the frames are fine and
   * the liquid is evolving slower than wall-clock, which a frame rate cannot
   * show you. See the catch-up rule in LiquidVisualizer.
   */
  stepsPerSec: number;
  /**
   * Frame time that is not the solver — renderer, readback, React, the bead
   * camera, everything else. The number that says whether a finer grid is
   * what is costing you, or whether the grid was never the problem.
   */
  otherMs: number;
}
