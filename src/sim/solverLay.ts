/*
  Classic's dish laid at the solver's own grid (PLAN 38w-8), moved out of
  fluidSimulation.ts, which is at its size ceiling.

  What was reported: Classic was "pixelated" and "mush" beside the 1960s
  stills (the owner, 2026-11-21: "complexity and clarity"). What was measured:
  the cells were laid into the CPU's 192² arrays and the solver carried them up
  to its own N² (about 768 in the app) by a bilinear upsample, so every cell's
  rim was four solver cells of ramp and a cell under about six CPU cells across
  could not be laid at all. A real dish's rim is a meniscus a fraction of a
  millimetre wide, and the dye on either side of it does not mix in the minutes
  a show lasts (diffusion of a dye in water is about 1e-9 m²/s, a few tenths of
  a millimetre in a minute). So the rim belongs to the oil, at the solver's
  grid, and the dye's edge with it.

  layClassicOnSolver lays the same crowd layCrowd lays on the CPU (its oil
  through addMix, which is already at the solver's grid; the water's wash; each
  cell's colour in its oil, the oil's share kept apart as layOilShare keeps it)
  but on N², and hands both to the solver whole (FluidInputs.layDye). It
  returns the dish's mean as dishSum counts it (each solver cell a (S/N)² of a
  CPU one) and the mass laid, or null where the solver cannot take it (no GPU,
  or a grid no finer than the CPU's), and the caller lays on the CPU as before.
*/
import type { PlateSolver } from '../gpu/solverTypes';
import { layCrowd } from '../lib/oilLay';
import { dyeAbsorbances } from '../lib/dye';
import { OPEN_RIM } from '../lib/turntable';
import { plateLook } from '../presetPlate';

export function layClassicOnSolver(
  gpu: PlateSolver | null, S: number, rand: () => number, dyes: number,
  col: (i: number) => { r: number; g: number; b: number }, dishArea: number,
): { mean: number; mass: number } | null {
  const n = gpu?.N ?? 0;
  if (!gpu?.layDye || !gpu.layShare || !(n > S)) return null;
  const dye = new Float32Array(n * n * 4), oil = new Float32Array(n * n * 4);
  const abs: number[][] = [];
  const absOf = (i: number) => {
    if (!abs[i]) { const c = col(i); abs[i] = dyeAbsorbances(c.r, c.g, c.b); }
    return abs[i];
  };
  let mass = 0, inRim = 0;
  const put = (to: Float32Array, i: number, d: number, a: readonly number[]) => {
    to[i * 4] += d * a[0]; to[i * 4 + 1] += d * a[1]; to[i * 4 + 2] += d * a[2]; to[i * 4 + 3] += d;
  };
  layCrowd('classic', n, rand, dyes, (x, y, r, amount) => gpu.addMix?.(x, y, r, { oil: amount }),
    (x, y, d) => { put(dye, x + y * n, d, absOf(0)); mass += d; },
    (x, y, d, k) => { const a = absOf(k); put(dye, x + y * n, d, a); put(oil, x + y * n, d, a); mass += d; });
  if (!gpu.layDye(dye, oil)) return null;
  // The same in-rim sum dishSum takes over the CPU's arrays, capped as it caps.
  for (let j = 0; j < n; j++) {
    const v = (j + 0.5) / n - 0.5;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      if (u * u + v * v < OPEN_RIM * OPEN_RIM) inRim += Math.min(6.0, dye[(i + j * n) * 4 + 3]);
    }
  }
  const cell = (S / n) * (S / n);
  return { mean: (inRim * cell) / Math.max(1, dishArea), mass: mass * cell };
}

/**
 * Which seeds hold a lay the solver took at its own grid, and the share a lay
 * gives it at once. A look change does not lay its seed whole: captureSeed
 * takes the seed's delta and addSeedShare adds it a share at a time over the
 * glide. The four arrays carry a CPU lay's shares; a lay on the solver's grid
 * is not in them, so the seed is marked here and each share goes to the solver
 * too (FluidInputs.layShare). `scale` is the share a lay adds at once: 1 for a
 * plain seedPreset, the weight for seedPresetScaled, none (null) while
 * captureSeed takes a seed to add later.
 */
export class SolverSeeds {
  private scale: number | null = 1;
  private laid = false;
  /** The dish mean the solver's lays added since `took` last asked (dishSum cannot see them). */
  private mean = 0;
  private readonly held = new WeakSet<Float32Array[]>();

  /** Run `f` with a lay's share at once `k` (none stays none, inside a capture). */
  scaled<T>(k: number, f: () => T): T {
    const s = this.scale;
    if (s !== null) this.scale = k;
    try { return f(); } finally { this.scale = s; }
  }

  /** True outside a capture and a scaled lay: a seed laid whole, at once. */
  plain(): boolean { return this.scale === 1; }

  /** Run a capture's lay with no share at once; true when it laid on the solver. */
  capture(lay: () => void): boolean {
    const s = this.scale;
    this.scale = null;
    this.laid = false;
    try { lay(); } finally { this.scale = s; }
    const laid = this.laid;
    this.laid = false;
    return laid;
  }

  /** Mark a captured seed as holding a lay on the solver. */
  keep(seed: Float32Array[], onSolver: boolean): void { if (onSolver) this.held.add(seed); }

  /** A share of a captured seed: the solver's part of it, if it holds one. */
  share(seed: Float32Array[], gpu: PlateSolver | null, k: number): void {
    if (this.held.has(seed)) gpu?.layShare?.(k);
  }

  /**
   * Classic's lay on the solver's grid (layClassicOnSolver), with its share at
   * once: the mass laid, 0 where the solver could not take it. The dish mean
   * waits for `took`, so seedPreset's sum of the CPU arrays can add it.
   */
  lay(gpu: PlateSolver | null, S: number, rand: () => number, dyes: number,
    col: (i: number) => { r: number; g: number; b: number }, dishArea: number): number {
    const laid = layClassicOnSolver(gpu, S, rand, dyes, col, dishArea);
    if (!laid) return 0;
    this.laid = true;
    this.mean += laid.mean;
    if (this.scale !== null) gpu?.layShare?.(this.scale);
    return laid.mass;
  }

  /** The dish mean laid on the solver since the last ask, and zero after. */
  took(): number {
    const m = this.mean;
    this.mean = 0;
    return m;
  }
}

/*
  The CPU side of a captured seed, moved here beside the solver's side
  (SolverSeeds) so fluidSimulation.ts does not grow past its size budget: the
  three loops a look change runs over the four dye arrays. Each is a plain
  pass over typed arrays, run once per look change, never per frame.
*/

/** What was laid since `before`, taken back out of `arrays` and returned. */
export function takeBack(arrays: Float32Array[], before: Float32Array[]): Float32Array[] {
  return arrays.map((a, c) => {
    const d = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) d[i] = a[i] - before[c][i];
    a.set(before[c]);
    return d;
  });
}

/** Add `k` of a taken-back seed to `arrays`. */
export function addShare(arrays: Float32Array[], seed: Float32Array[], k: number): void {
  for (let c = 0; c < arrays.length; c++) {
    const a = arrays[c], d = seed[c];
    for (let i = 0; i < a.length; i++) a[i] += d[i] * k;
  }
}

/** Keep `k` of what was laid on `arrays` since `before`. */
export function scaleSince(arrays: Float32Array[], before: Float32Array[], k: number): void {
  for (let c = 0; c < arrays.length; c++) {
    const a = arrays[c], b = before[c];
    for (let i = 0; i < a.length; i++) a[i] = b[i] + (a[i] - b[i]) * k;
  }
}

/*
  A look laid before any solver is attached, owed its oil (PLAN 38w-21).

  What was reported: Classic's red and orange cells kept soft rims in the app,
  and Crisp Edges, which draws the oil's edge one pixel wide, did not change
  them. What was measured (2026-11-22, the app on Metal, ?look=classic&seed=1,
  14 s in): the solver held no oil at all. Its mix field had never been made
  (mix null, mixLive false, oilPoured 0), on main and on the branch alike, and
  the same look applied again a few seconds later laid 280 bodies of oil
  (mixLive true, oilPoured 0.29). The app lays its opening look into the CPU
  arrays before the GPU device is up (LiquidVisualizer seeds the first layer
  as it makes it), and these looks lay their oil only on the solver (addMix,
  layOil, layDye): with none attached it went nowhere, and the colours landed
  as dye in water with no second liquid to hold an edge. A dye edge with no
  interface under it diffuses, and there is no interface for the plate to
  draw sharp, which is the soft rim. The lab check (classicdish) lays on a
  solver it already has, so it never saw this.

  So a plain lay of one of these looks with no solver is remembered with what
  it put in the four dye arrays, and the first solver attached that carries no
  plate across has that taken back out and the look laid again on it, oil and
  all. The picture is the same look laid fresh a moment later, not the CPU's
  layout: the CPU's dye spots were never a dish anyone saw with its oil.
*/
export const SOLVER_OIL_LOOKS: ReadonlySet<string> = new Set(['classic', 'clock-glass', 'splodascope', 'foam-cells', 'lava-lamp']);

type Noise = (x: number, y: number) => number;

export class OwedLay {
  private owed: { look: string; noise: Noise; delta: Float32Array[] } | null = null;

  /** `arrays` hands over the four dye arrays as they are now (a resize makes new ones). */
  constructor(private readonly arrays: () => Float32Array[]) {}

  /**
   * Run a lay `f` of `look`. When `free` (no solver attached, a plain seed)
   * and the look lays its oil on the solver, keep what `f` put in the dye
   * arrays, to take back and lay again at the attach.
   */
  lay<T>(free: boolean, look: string, noise: Noise, f: () => T): T {
    /*
      Any later lay supersedes what was owed, whether or not it is owed in
      turn. A Go before the device is up lays the next look through a capture
      (not free), and an owed Classic kept past it had its oil laid into the
      middle of the new look's glide at the attach (found in review). What the
      plate shows from here is the new lay, so nothing older is owed.
    */
    this.owed = null;
    const arrays = this.arrays();
    const before = free && SOLVER_OIL_LOOKS.has(plateLook(look)) ? arrays.map(a => a.slice()) : null;
    const out = f();
    if (before) {
      const delta = arrays.map((a, c) => {
        const d = new Float32Array(a.length), b = before[c];
        for (let i = 0; i < a.length; i++) d[i] = a[i] - b[i];
        return d;
      });
      this.owed = { look, noise, delta };
    }
    return out;
  }

  clear(): void { this.owed = null; }

  /**
   * At an attach: nothing is owed after it. With `relay` (no plate carried
   * across), the owed lay's dye is taken back out of the arrays and `lay` is
   * handed its look and noise to lay them on the solver.
   */
  take(relay: boolean, lay: (look: string, noise: Noise) => void): void {
    const o = this.owed;
    this.owed = null;
    if (!o || !relay) return;
    const arrays = this.arrays();
    if (arrays.some((a, c) => a.length !== o.delta[c].length)) return; // resized since: the delta no longer lines up
    for (let c = 0; c < arrays.length; c++) {
      const a = arrays[c], d = o.delta[c];
      for (let i = 0; i < a.length; i++) a[i] = Math.max(0, a[i] - d[i]);
    }
    lay(o.look, o.noise);
  }
}

/** The dish's mean dye inside the open rim, each cell capped at 6 (seedPreset's measure of what a look laid). */
export function dishMean(density: Float32Array, S: number, dishArea: number): number {
  let s = 0;
  for (let j = 0; j < S; j++) {
    const v = (j + 0.5) / S - 0.5;
    for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S - 0.5;
      if (u * u + v * v < OPEN_RIM * OPEN_RIM) s += Math.min(6.0, density[i + j * S]);
    }
  }
  return s / Math.max(1, dishArea);
}
