/**
 * The grid sweep, run by the app instead of by a person.
 *
 * The question this exists to answer is which half of a frame costs what. A
 * finer grid costs more to solve, so if frame time rises with the grid then
 * the solver is what to make faster; if it does not, the grid was never the
 * problem and the cost is somewhere that changing the grid cannot reach —
 * the readback, React, the bead camera.
 *
 * Taking that reading by hand means setting a grid, waiting for it to settle,
 * reading a line, and repeating five times without losing track of which
 * number went with which grid. It is exactly the sort of measurement that is
 * quick to do wrong: read too early and the averages still carry the last
 * rung's numbers, read once and a garbage-collection pause becomes a data
 * point, and both mistakes look like a result rather than like a mistake.
 *
 * So: change the grid, wait for the solver to actually be rebuilt, wait again
 * for the averages to forget the rung before, then sample repeatedly and keep
 * the median. The median rather than the mean because the failure being
 * guarded against is a single long frame, and one outlier moves a mean.
 *
 * Nothing here leaves the machine. The report is text, printed and shown, for
 * whoever ran it to do what they like with.
 */

import type { SimResolution } from '../types';
import type { EngineStatus } from './platform';

/** One grid's reading. */
export interface BenchRow {
  /** What was asked for. */
  want: SimResolution;
  /** What the solver actually ran — a grid can be clamped by the texture limit. */
  grid: number;
  engine: 'gpu' | 'cpu';
  frameMs: number;
  fps: number;
  /** One solver step across every layer. CPU submission time on the GPU path. */
  simMs: number;
  /** The frame minus the solver: renderer, readback, React, everything else. */
  otherMs: number;
  stepsPerSec: number;
  /** Set when the rung could not be run, with the reason; the numbers are then meaningless. */
  skipped?: string;
}

export interface BenchMachine {
  renderer: string;
  tier: string;
  gpuClass: string;
  layers: number;
  dpr: number;
  screen: string;
  ua: string;
}

export interface BenchReport {
  at: string;
  machine: BenchMachine;
  rows: BenchRow[];
}

export interface BenchDeps {
  /** Put the show on a grid. */
  setGrid(g: SimResolution): void;
  /** The engine's live status, or null before the first frame. */
  read(): EngineStatus | null;
  /** The GPU's name, if the context will give it. */
  renderer(): string;
  sleep(ms: number): Promise<void>;
  /**
   * Wall clock, milliseconds.
   *
   * Every wait here is measured against this rather than by adding up what was
   * asked for, because on the machines this exists to measure the two are not
   * the same number. A `setTimeout(100)` on a page rendering at eleven frames
   * a second comes back in six or seven hundred milliseconds — the timer
   * cannot fire until the main thread is free, and the main thread is busy
   * being the thing under test. Counting requested sleeps made a three second
   * sample window take twenty, and every timeout with it: the sweep still
   * finished and still finished correctly, it just took five times as long on
   * precisely the slow machine whose owner is least willing to wait.
   */
  now(): number;
  /** Progress, for the overlay. */
  onProgress?(done: number, total: number, label: string): void;
}

export interface BenchOptions {
  /** Which grids to walk. */
  rungs?: SimResolution[];
  /** How long to wait after a grid change before believing any number. */
  settleMs?: number;
  /** How long to sample for, once settled. */
  sampleMs?: number;
  /** How often to sample inside that window. */
  everyMs?: number;
  /** Take at least this many samples, however slow the page is. */
  minSamples?: number;
  /** How long to wait for the solver to be rebuilt on the new grid. */
  rebuildMs?: number;
}

export const BENCH_RUNGS: SimResolution[] = [256, 384, 512, 768, 'cpu'];

/**
 * Long enough for the frame-time average to forget the rung before it.
 *
 * The governor holds for 2.5 s after any change before it will judge at all,
 * and the step-rate average has a 1.5 s time constant on top of that. Four
 * seconds clears both with room to spare; less and the first rung's numbers
 * bleed into the second's, which is the failure that looks most like data.
 */
const SETTLE_MS = 4000;
const SAMPLE_MS = 3000;
const EVERY_MS = 250;
const REBUILD_MS = 6000;
/**
 * A median wants more than a couple of numbers under it, and a page slow
 * enough to matter may not produce many in a fixed window — so the window is
 * a floor on time and this is a floor on samples.
 */
const MIN_SAMPLES = 5;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Whether the engine is now running what was asked for. */
const onRung = (s: EngineStatus, want: SimResolution): boolean =>
  want === 'cpu' ? s.engine === 'cpu' : s.engine === 'gpu' && s.grid === want;

export async function runBench(deps: BenchDeps, opts: BenchOptions = {}): Promise<BenchReport> {
  const rungs = opts.rungs ?? BENCH_RUNGS;
  const settleMs = opts.settleMs ?? SETTLE_MS;
  const sampleMs = opts.sampleMs ?? SAMPLE_MS;
  const everyMs = opts.everyMs ?? EVERY_MS;
  const rebuildMs = opts.rebuildMs ?? REBUILD_MS;
  const minSamples = opts.minSamples ?? MIN_SAMPLES;

  const first = deps.read();
  const rows: BenchRow[] = [];

  for (let i = 0; i < rungs.length; i++) {
    const want = rungs[i];
    const label = want === 'cpu' ? 'CPU 192²' : `${want}²`;
    deps.onProgress?.(i, rungs.length, label);
    deps.setGrid(want);

    // Wait for the solver to actually be on the new grid. A rung the GPU
    // cannot allocate never arrives, and that is a result rather than a
    // hang — record it as one and move on.
    const giveUpAt = deps.now() + rebuildMs;
    let arrived = false;
    while (deps.now() < giveUpAt) {
      await deps.sleep(everyMs);
      const s = deps.read();
      if (s && onRung(s, want)) { arrived = true; break; }
    }

    if (!arrived) {
      const s = deps.read();
      rows.push({
        want, grid: s?.grid ?? 0, engine: s?.engine ?? 'cpu',
        frameMs: 0, fps: 0, simMs: 0, otherMs: 0, stepsPerSec: 0,
        skipped: s?.gpuUnavailable
          ? 'no float render targets — the GPU solver is unavailable here'
          : `the solver never reached ${label} (it stayed on ${s?.grid ?? '?'}²)`,
      });
      continue;
    }

    const settledAt = deps.now() + settleMs;
    while (deps.now() < settledAt) await deps.sleep(Math.min(everyMs, settleMs));

    const frame: number[] = [], sim: number[] = [], other: number[] = [], steps: number[] = [];
    const sampleUntil = deps.now() + sampleMs;
    // The sample-count floor waits for readings that a null status would never
    // supply, so it gets a deadline of its own: a measurement that cannot be
    // taken has to end as a short row, never as a loop with no way out.
    const hardStop = deps.now() + sampleMs + rebuildMs;
    while ((deps.now() < sampleUntil || frame.length < minSamples) && deps.now() < hardStop) {
      await deps.sleep(everyMs);
      const s = deps.read();
      if (!s) continue;
      frame.push(s.frameMs); sim.push(s.simMs); other.push(s.otherMs); steps.push(s.stepsPerSec);
    }

    const s = deps.read();
    const frameMs = median(frame);
    rows.push({
      want,
      grid: s?.grid ?? 0,
      engine: s?.engine ?? 'cpu',
      frameMs,
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      simMs: median(sim),
      otherMs: median(other),
      stepsPerSec: median(steps),
    });
  }

  deps.onProgress?.(rungs.length, rungs.length, 'done');

  return {
    at: new Date().toISOString(),
    machine: {
      renderer: first?.renderer || deps.renderer(),
      tier: first?.tier ?? '?',
      gpuClass: first?.gpu ?? '?',
      layers: first?.layers ?? 0,
      dpr: first?.dpr ?? 1,
      screen: typeof window === 'undefined' ? '?' : `${window.screen.width}x${window.screen.height}`,
      ua: typeof navigator === 'undefined' ? '?' : navigator.userAgent,
    },
    rows,
  };
}

const pad = (s: string, n: number): string => s.length >= n ? s : s + ' '.repeat(n - s.length);
const padL = (s: string, n: number): string => s.length >= n ? s : ' '.repeat(n - s.length) + s;

/** The report as a block of text to paste somewhere. */
export function formatBench(r: BenchReport): string {
  const m = r.machine;
  const head = [
    `ChromaGlass grid sweep · ${r.at}`,
    `${m.renderer}`,
    `tier ${m.tier} · gpu ${m.gpuClass} · ${m.layers} layer${m.layers === 1 ? '' : 's'} · dpr ${m.dpr} · ${m.screen}`,
    '',
  ];
  const cols = ['grid', 'fps', 'frame', 'solver', 'other', 'steps/s', 'speed'];
  const widths = [9, 6, 8, 9, 9, 9, 7];
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? pad(c, widths[i]) : padL(c, widths[i]))).join('');
  const out = [...head, line(cols)];
  for (const row of r.rows) {
    const name = row.want === 'cpu' ? 'cpu192' : `${row.want}²`;
    if (row.skipped) { out.push(`${pad(name, widths[0])}  — ${row.skipped}`); continue; }
    out.push(line([
      name,
      row.fps.toFixed(0),
      `${row.frameMs.toFixed(1)}ms`,
      `${row.simMs.toFixed(1)}ms`,
      `${row.otherMs.toFixed(1)}ms`,
      row.stepsPerSec.toFixed(0),
      `${Math.round((row.stepsPerSec / 60) * 100)}%`,
    ]));
  }
  out.push('');
  out.push('solver = one step across every layer (CPU submission time on the GPU path).');
  out.push('other  = the frame minus the solver. speed = steps/s against the 60 the show asks for.');
  return out.join('\n');
}

/** The GPU's name from a throwaway context, for the report's header. */
export function readRenderer(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'no webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext
      ? String(gl.getParameter((ext as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return name || 'unknown';
  } catch {
    return 'unknown';
  }
}
