/**
 * Full plate snapshot & restore (PLAN 49a): captures every fluid layer's GPU
 * solver state and CPU fields, bubbles, beads, palette/preset refs and spin
 * state so New plate, Drain, Clear and Randomise can undo back to the exact
 * glass before the reset.
 */

import type { SolverSnapshot } from '../gpu/solverTypes';
import type { BubbleField } from '../lib/bubbles';
import type { BeadField } from '../lib/beads';
import type { LiquidPhase } from '../lib/liquidPhase';
import { GRID_AREA } from './constants';

export interface SimStateSnapshot {
  gpu: SolverSnapshot | null;
  density: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;
  rbDensity: Float32Array;
  rbVx: Float32Array;
  rbVy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  gap: Float32Array;
  temp: Float32Array;
  liquid: ReturnType<LiquidPhase['snapshot']>;
  oilAdd: Float32Array | null;
  meanDensity: number;
  meanColor: [number, number, number];
  seedMean: number | null;
  seedBudget: number;
  plateAngle: number;
  dishSpin: number;
  liquidSpin: number;
  cellClock: number;
  stepIndex: number;
}

export interface VisualizerRefsState {
  livePreset: string;
  laidPreset: string | null;
  harmony: number[];
  harmonyLock: number[] | null;
  contract: number[] | null;
  paletteWindow: { size: number | null; lead: number };
  journey: { lead: number; lastAt: number };
  injectStyle: string[];
  plateLiquids: string[];
  areas: unknown;
  melodyLine: unknown;
  rotationAngles: number[];
  spinVel: number[];
  dishSpin: number[];
  liquidSpin: number[];
  backDyes: { id: string; contract: number[] | null; harmony: number[]; styles: string[]; liquids: string[] } | null;
}

export interface PlateSnapshotData {
  layers: SimStateSnapshot[];
  bubbles: ReturnType<BubbleField['snapshot']>;
  beads: ReturnType<BeadField['snapshot']>;
  refs: VisualizerRefsState;
  destroy: () => void;
}

/** Mutable sim surface passed from FluidSimulation without exposing private fields globally. */
export interface SnapshotSimAccess {
  gpu: {
    N: number;
    takeSnapshot?: () => SolverSnapshot | null;
    restoreSnapshot?: (s: SolverSnapshot) => boolean;
  } | null;
  density: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;
  readonly rbDensity: Float32Array;
  readonly rbVx: Float32Array;
  readonly rbVy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  gap: Float32Array;
  temp: Float32Array;
  readonly liquid: LiquidPhase;
  meanDensity: number;
  meanColor: [number, number, number];
  seedMean: number | null;
  seedBudget: number;
  plateAngle: number;
  dishSpin: number;
  liquidSpin: number;
  cellClock: number;
  forgetPress(): void;
}

export function captureSimSnapshot(
  sim: SnapshotSimAccess,
  stepIndex: number,
  oilAdd: Float32Array | null,
): SimStateSnapshot {
  const gpuSnap = sim.gpu?.takeSnapshot?.() ?? null;
  // With GPU active, CPU `density` holds pending deltas while `rbDensity` holds the
  // latest downsampled full field; save `density*` if CPU-only, `rbDensity` if GPU.
  const srcD = sim.gpu ? sim.rbDensity : sim.density;
  return {
    gpu: gpuSnap,
    density: new Float32Array(srcD),
    densityR: new Float32Array(sim.densityR),
    densityG: new Float32Array(sim.densityG),
    densityB: new Float32Array(sim.densityB),
    rbDensity: new Float32Array(sim.rbDensity),
    rbVx: new Float32Array(sim.rbVx),
    rbVy: new Float32Array(sim.rbVy),
    vx: new Float32Array(sim.gpu ? sim.rbVx : sim.vx),
    vy: new Float32Array(sim.gpu ? sim.rbVy : sim.vy),
    gap: new Float32Array(sim.gap),
    temp: new Float32Array(sim.temp),
    liquid: sim.liquid.snapshot(),
    oilAdd: oilAdd ? new Float32Array(oilAdd) : null,
    meanDensity: sim.meanDensity,
    meanColor: [...sim.meanColor] as [number, number, number],
    seedMean: sim.seedMean,
    seedBudget: sim.seedBudget,
    plateAngle: sim.plateAngle,
    dishSpin: sim.dishSpin,
    liquidSpin: sim.liquidSpin,
    cellClock: sim.cellClock,
    stepIndex,
  };
}

export function restoreSimSnapshot(
  sim: SnapshotSimAccess,
  snap: SimStateSnapshot,
  restCpu: () => void,
): { stepIndex: number; oilAdd: Float32Array | null; forceUpload: boolean } {
  sim.forgetPress();
  sim.liquid.restore(snap.liquid);
  sim.meanDensity = snap.meanDensity;
  sim.meanColor = [...snap.meanColor] as [number, number, number];
  sim.seedMean = snap.seedMean;
  sim.seedBudget = snap.seedBudget;
  sim.plateAngle = snap.plateAngle;
  sim.dishSpin = snap.dishSpin;
  sim.liquidSpin = snap.liquidSpin;
  sim.cellClock = snap.cellClock;

  const gpuRestored = !!(sim.gpu && snap.gpu && sim.gpu.restoreSnapshot?.(snap.gpu));
  sim.rbDensity.set(snap.rbDensity);
  sim.rbVx.set(snap.rbVx);
  sim.rbVy.set(snap.rbVy);

  if (gpuRestored) {
    sim.density.fill(0);
    sim.densityR.fill(0);
    sim.densityG.fill(0);
    sim.densityB.fill(0);
    sim.vx.fill(0);
    sim.vy.fill(0);
    sim.temp.fill(0);
    sim.gap.fill(0);
    return {
      stepIndex: snap.stepIndex,
      oilAdd: snap.oilAdd ? new Float32Array(snap.oilAdd) : null,
      forceUpload: false,
    };
  }

  sim.density.set(snap.density);
  sim.densityR.set(snap.densityR);
  sim.densityG.set(snap.densityG);
  sim.densityB.set(snap.densityB);
  sim.vx.set(snap.vx);
  sim.vy.set(snap.vy);
  sim.temp.set(snap.temp);
  if (sim.gpu) {
    for (let i = 0; i < GRID_AREA; i++) sim.gap[i] = snap.gap[i] - 0.03;
    return {
      stepIndex: snap.stepIndex,
      oilAdd: snap.oilAdd ? new Float32Array(snap.oilAdd) : null,
      forceUpload: true,
    };
  }
  sim.gap.set(snap.gap);
  restCpu();
  return {
    stepIndex: snap.stepIndex,
    oilAdd: snap.oilAdd ? new Float32Array(snap.oilAdd) : null,
    forceUpload: false,
  };
}

export interface VisualizerSnapshotBag {
  fluids: SnapshotSimAccess & { snapshotPlate?: () => SimStateSnapshot; restorePlate?: (s: SimStateSnapshot) => void };
}

export interface LiveRefsHost {
  fluids: { snapshotPlate: () => SimStateSnapshot; restorePlate: (s: SimStateSnapshot) => void }[];
  bubbles: BubbleField;
  beads: BeadField;
  refs: VisualizerRefsState;
  resetOnRestore?: () => void;
}

/** Capture full plate state (layers, bubbles, beads, palette/spin refs) for 8 s Undo (PLAN 49a). */
export function buildPlateSnapshot(
  fluids: { snapshotPlate: () => SimStateSnapshot }[],
  bubbles: BubbleField,
  beads: BeadField,
  refs: VisualizerRefsState,
): PlateSnapshotData {
  const layers = fluids.map((f) => f.snapshotPlate());
  return {
    layers,
    bubbles: bubbles.snapshot(),
    beads: beads.snapshot(),
    refs: cloneVisualizerRefs(refs),
    destroy: () => { for (const l of layers) l.gpu?.destroy(); },
  };
}

/** Restore fluid layers, bubbles, beads and return cloned visualizer refs. */
export function applyPlateSnapshot(
  fluids: { restorePlate: (s: SimStateSnapshot) => void }[],
  bubbles: BubbleField,
  beads: BeadField,
  snap: PlateSnapshotData,
): VisualizerRefsState {
  fluids.forEach((f, i) => { if (snap.layers[i]) f.restorePlate(snap.layers[i]); });
  bubbles.restore(snap.bubbles);
  beads.restore(snap.beads);
  return cloneVisualizerRefs(snap.refs);
}

/** Move a Solver readback into CPU arrays cleanly (keeps FluidSimulation compact). */
export function restoreReadbackArrays(
  sim: Pick<SnapshotSimAccess, 'densityR' | 'densityG' | 'densityB' | 'density' | 'vx' | 'vy' | 'temp'>,
  dye: Float32Array,
  vel: Float32Array,
  rest: () => void,
): boolean {
  const clean = (v: number) => (Number.isFinite(v) ? v : 0);
  for (let i = 0; i < GRID_AREA; i++) {
    sim.densityR[i] = clean(dye[i * 4]);
    sim.densityG[i] = clean(dye[i * 4 + 1]);
    sim.densityB[i] = clean(dye[i * 4 + 2]);
    sim.density[i] = clean(dye[i * 4 + 3]);
    sim.vx[i] = clean(vel[i * 4]);
    sim.vy[i] = clean(vel[i * 4 + 1]);
    sim.temp[i] = clean(vel[i * 4 + 2]);
  }
  rest();
  return true;
}

export function copySeedArrays(src: Float32Array[], cur: Float32Array[] | null): Float32Array[] {
  const out = cur ?? src.map(() => new Float32Array(GRID_AREA));
  for (let k = 0; k < src.length; k++) out[k].set(src[k]);
  return out;
}

export function applySeedArrays(dst: Float32Array[], seed: Float32Array[] | null, after: () => void): boolean {
  if (!seed) return false;
  for (let k = 0; k < dst.length; k++) dst[k].set(seed[k]);
  after();
  return true;
}

/** Zero every CPU velocity/dye/pressure scratch field on `clearAll`. */
export function zeroSimArrays(arrays: Float32Array[]): void {
  for (const a of arrays) a.fill(0);
}

export function cloneVisualizerRefs(r: VisualizerRefsState): VisualizerRefsState {
  return {
    livePreset: r.livePreset,
    laidPreset: r.laidPreset,
    harmony: [...r.harmony],
    harmonyLock: r.harmonyLock ? [...r.harmonyLock] : null,
    contract: r.contract ? [...r.contract] : null,
    paletteWindow: { ...r.paletteWindow },
    journey: { ...r.journey },
    injectStyle: [...r.injectStyle],
    plateLiquids: [...r.plateLiquids],
    areas: Array.isArray(r.areas) ? r.areas.map((a) => ({ ...(a as object) })) : r.areas,
    melodyLine: r.melodyLine,
    rotationAngles: [...r.rotationAngles],
    spinVel: [...r.spinVel],
    dishSpin: [...r.dishSpin],
    liquidSpin: [...r.liquidSpin],
    backDyes: r.backDyes
      ? {
          id: r.backDyes.id,
          contract: r.backDyes.contract ? [...r.backDyes.contract] : null,
          harmony: [...r.backDyes.harmony],
          styles: [...r.backDyes.styles],
          liquids: [...r.backDyes.liquids],
        }
      : null,
  };
}
