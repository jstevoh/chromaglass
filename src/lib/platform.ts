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
 * Hosted caps at 384² and never renders above 1.5x pixels: a page someone is
 * trying for the first time must not stutter, and the governor can climb from
 * the start rung if there's room. Local and native run the full ladder — the
 * point of running it yourself is to use the whole machine. Software GL gets
 * only the CPU solver; emulated float render targets are far slower than the
 * JavaScript solver and the governor would only find that out the slow way.
 */
export function qualityLadder(tier: PlatformTier, gpu: GpuClass): { rungs: QualityRung[]; start: number } {
  const dpr = devicePixels();
  if (gpu === 'software') return { rungs: [{ grid: 'cpu', dpr: 1 }], start: 0 };

  const rungs: QualityRung[] =
    tier === 'hosted'
      ? [
          { grid: 384, dpr: Math.min(dpr, 1.5) },
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
  engine: 'gpu' | 'cpu';
  grid: number;
  dpr: number;
  tier: PlatformTier;
  gpu: GpuClass;
  /** True while the governor is choosing (simResolution is 'auto'). */
  governed: boolean;
  /** The governor has had to drop below where it started on this machine. */
  steppedDown: boolean;
  /** The GPU solver is unavailable (no float render targets) rather than merely slow. */
  gpuUnavailable: boolean;
  /** Smoothed frame interval, milliseconds. */
  frameMs: number;
}
