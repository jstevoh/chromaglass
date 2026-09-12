import React, { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings, LiquidType, SimResolution } from '../types';
import { PALETTE_RGB, hexToRgb, getAudioValue, type AudioFeatureKey, pickHarmony, harmonyColor, harmonyCycle } from '../constants';
import { CameraPass } from '../lib/cameraPass';
import { BeatClock } from '../lib/beatClock';
import { MacroCamera, type MacroShot } from '../lib/macroCamera';
import { GpuFluid, type GpuStepParams } from '../lib/gpuFluid';
import { classifyGpu, detectTier, qualityLadder, type EngineStatus } from '../lib/platform';
import { QualityGovernor } from '../lib/governor';
import { BubbleField, MAX_BUBBLES } from '../lib/bubbles';
import { ChemistryField } from '../lib/chemistry';

interface LiquidVisualizerProps {
  audioData: AudioData | null;
  settings: VisualizerSettings;
  seedCount?: number;
  selectedLiquid?: LiquidType;
  activeLayer?: number;
  clearTrigger?: number;
  drainTrigger?: number;
  activeTool?: 'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak';
  isAutomated?: boolean;
  isActive?: boolean;
  /** Called (throttled) while the user paints — feeds performance recording. */
  onManualGesture?: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string }) => void;
  /** Reports which solver is running, at what resolution, and how the governor is doing. */
  onEngineStatus?: (status: EngineStatus) => void;
}

const GRID_SIZE = 192;                    // sim resolution — higher = smoother liquid edges
const GRID_SCALE = GRID_SIZE / 128;       // brush/seed geometry was tuned at 128
const GRID_AREA = GRID_SIZE * GRID_SIZE;
const PALETTE_COUNT = PALETTE_RGB.length;

// Which grid the solver should run on. A pinned size is honoured up to the
// context's texture limit; 'auto' hands the choice to the frame-time governor;
// 'cpu' is the 192² fallback.
const resolveSimResolution = (setting: SimResolution | undefined, governor: QualityGovernor, maxTexture: number): number => {
  const want = setting === undefined || setting === 'auto' ? governor.rung.grid : setting;
  if (want === 'cpu') return 0;
  return Math.max(64, Math.min(Math.round(want), maxTexture));
};

// The solver advances at a fixed rate in wall-clock time rather than once per
// rendered frame, so the light show runs at the same speed on a 30 fps laptop,
// a 60 fps desktop and a 120 Hz display. A slow frame catches up by taking
// several steps, capped so a stall can't spiral into a burst of work.
const SIM_STEP = 1 / 60;
// `?warp=N` (diagnostic) lifts the catch-up cap so a slow renderer can still
// take many solver steps per frame: the sim never runs ahead of wall-clock,
// it just stops falling behind. Used to capture developed frames on machines
// that render at a few fps.
const SIM_MAX_CATCHUP = (() => {
  if (typeof window === 'undefined') return 4;
  const warp = Number(new URLSearchParams(window.location.search).get('warp'));
  return Number.isFinite(warp) && warp >= 1 ? Math.min(240, Math.round(warp)) : 4;
})();

// Density histogram used to expose the macro closeup (see "Macro film exposure").
const FILM_BINS = 64;
const FILM_BIN_SCALE = 16;   // bins per unit of density — covers 0..4

const PRESET_INJECT_STYLES: Record<string, string[]> = {
  'classic':            ['drop'],
  'galaxy':             ['spray', 'streak'],
  'deep-ocean':         ['pour', 'drop'],
  'cyberpunk':          ['streak', 'splatter'],
  'lava-lamp':          ['pour'],
  'acid-trip':          ['splatter', 'spray'],
  'bass-drop':          ['splatter', 'drop'],
  'timbre-shifter':     ['spray'],
  'boiling-point':      ['spray', 'splatter'],
  'microscopic-chaos':  ['drop'],
  'aurora-borealis':    ['streak', 'spray'],
  'solar-flare':        ['splatter', 'streak'],
  'jellyfish-bloom':    ['pour', 'drop'],
  'fractal-dream':      ['streak', 'spray'],
  'velvet-underground': ['pour', 'drop'],
  'neon-coral-reef':    ['streak', 'drop'],
  'stardust-collapse':  ['spray', 'splatter'],
  'poster-1969':        ['pour', 'drop'],
  'oil-on-water':       ['drop'],
  'colorful-cosmos':    ['pour'],
  'sunny-side-up':      ['pour', 'drop'],
  'macro-bead':         ['drop', 'splatter'],
  'cell-bloom':         ['drop'],
  'lace-run':           ['pour', 'streak'],
};

export interface LiquidVisualizerHandle {
  injectImage: (imageData: ImageData) => void;
  applyPreset: (presetId: string) => void;
  /** Take on a preset's dyes and injection style without clearing the plate — the sequencer's way of changing stage. */
  adoptPreset: (presetId: string) => void;
  /** Restrict the working palette to `size` of the contract's dyes, led by `lead`; null size = all of them. */
  setPaletteWindow: (size: number | null, lead: number) => void;
  setInjectStyle: (styles: string[]) => void;
  /** Pin the color harmony to a specific palette-index set (music intelligence). */
  setHarmony: (indices: number[]) => void;
  /** User palette lock — overrides auto-rotation, drains, seeds and music. Pass null to unlock. */
  setHarmonyLock: (indices: number[] | null) => void;
  /** Fire a themed dye burst for a lyric word-trigger. */
  triggerTheme: (theme: string, energy?: number) => void;
  /** Re-fire a recorded manual gesture (performance replay). Normalized coords; `layer` defaults to the active one. */
  applyGesture: (g: { tool: string; x: number; y: number; dx?: number; dy?: number; color?: string; layer?: number }) => void;
  /** A tilt from outside — the phone's gyroscope — in −1..1 per axis. Fades out if not refreshed. */
  setExternalTilt: (x: number, y: number) => void;
  /** Film projector: a video file or the camera, shown through the dye. */
  loadFilmFile: (file: File) => Promise<void>;
  startFilmCamera: () => Promise<void>;
  clearFilm: () => void;
}

// ─── Palette contracts ───────────────────────────────────────────────
// A projected clock face carries two or three dyes, and the richness of a
// show comes from stacking plates, not from rainbow dye. Each preset names the
// palette indices it may use; seeding, automation, beat injection and the
// slow harmony rotation all pick from inside that set. A user's palette lock
// still wins outright.
const PRESET_CONTRACTS: Record<string, number[]> = {
  'classic':            [0, 2, 8],
  'galaxy':             [9, 10, 7],
  'deep-ocean':         [7, 9, 5],
  'cyberpunk':          [6, 10, 2],
  'lava-lamp':          [0, 1, 3],
  'acid-trip':          [8, 3, 0, 10],
  'bass-drop':          [8, 3, 0],
  'timbre-shifter':     [2, 8, 0],
  'boiling-point':      [0, 1, 3],
  'microscopic-chaos':  [9, 10, 5],
  'aurora-borealis':    [5, 6, 7],
  'solar-flare':        [0, 1, 3],
  'jellyfish-bloom':    [2, 11, 10],
  'fractal-dream':      [6, 10, 2],
  'velvet-underground': [9, 10, 4],
  'neon-coral-reef':    [0, 6, 2],
  'stardust-collapse':  [7, 15, 5],
  'lumia':              [10, 7, 1],
  'sensual-laboratory': [14, 12],
  'oil-wheel':          [0, 6, 8],
  'poster-1969':        [2, 6],
  'oil-on-water':       [0, 1],
  'colorful-cosmos':    [9, 2, 0],
  'sunny-side-up':      [7, 10, 2],
  // Warm, fully-saturated sets only: white and graphite wash out fast under
  // subtractive mixing, and at this magnification the highlights and the
  // blacks come from the cell rings and lacing, not from the dye.
  'macro-bead':         [0, 1, 3, 2],
  'cell-bloom':         [0, 1, 2, 3],
  'lace-run':           [0, 1, 4, 3],
};

/** A working harmony drawn from inside a contract: the whole set when small, else three of it. */
const harmonyWithin = (contract: number[]): number[] => {
  if (contract.length <= 3) return contract;
  const pool = [...contract];
  const out: number[] = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
};

/**
 * A window onto the contract: `size` dyes starting at `lead`, wrapping. This
 * is how a show walks its hues — the window slides one dye at a time, so the
 * plate keeps most of its colours while one drains and a new one arrives —
 * and how a monochrome opening is done: a window of one.
 */
const windowOf = (contract: number[], size: number | null, lead: number): number[] => {
  const n = contract.length;
  if (n === 0) return contract;
  const w = Math.max(1, Math.min(n, size ?? (n <= 3 ? n : 3)));
  const out: number[] = [];
  const start = ((Math.round(lead) % n) + n) % n;
  for (let i = 0; i < w; i++) out.push(contract[(start + i) % n]);
  return out;
};

// ─── Fluid Simulation ────────────────────────────────────────────────

class FluidSimulation {
  size: number;
  dt: number;
  diff: number;
  visc: number;

  s: Float32Array;
  sR: Float32Array;
  sG: Float32Array;
  sB: Float32Array;
  density: Float32Array;
  densityR: Float32Array;
  densityG: Float32Array;
  densityB: Float32Array;

  vx: Float32Array;
  vy: Float32Array;
  vx0: Float32Array;
  vy0: Float32Array;

  pressure: Float32Array;
  gap: Float32Array;
  dhdt: Float32Array;

  temp: Float32Array;
  temp0: Float32Array;
  meanDensity = 0; // rolling measure of how full the plate is
  /** Plate tilt this step — a uniform acceleration, set by the show each step. */
  tiltX = 0;
  tiltY = 0;
  /** Which plate this is: 0 is the live plate, the rest run behind it as a background loop. */
  layerIndex = 0;

  // ── GPU solver attachment ──
  // When `gpu` is set, the arrays above hold *deltas* — what the CPU-side
  // writers added since the last step — and `gap` holds gap deltas. They are
  // flushed into the high-res field each step and zeroed. Readers use the
  // read* accessors, which serve a 192² downsample of the GPU field.
  gpu: GpuFluid | null = null;
  private dirty = false;
  private mul: Float32Array;        // multiplicative dye change (blowAir thins by 0.8)
  private dyeAdd: Float32Array;     // interleaved upload buffers
  private velAdd: Float32Array;
  private rbDensity: Float32Array;  // downsampled readback
  private rbVx: Float32Array;
  private rbVy: Float32Array;
  private mcA: Float32Array;        // MacCormack intermediates (CPU path)
  private mcB: Float32Array;

  get readDensity(): Float32Array { return this.gpu ? this.rbDensity : this.density; }
  get readVx(): Float32Array { return this.gpu ? this.rbVx : this.vx; }
  get readVy(): Float32Array { return this.gpu ? this.rbVy : this.vy; }

  constructor(size: number, diffusion: number, viscosity: number, dt: number) {
    this.size = size;
    this.dt = dt;
    this.diff = diffusion;
    this.visc = viscosity;

    this.s = new Float32Array(GRID_AREA);
    this.sR = new Float32Array(GRID_AREA);
    this.sG = new Float32Array(GRID_AREA);
    this.sB = new Float32Array(GRID_AREA);
    this.density = new Float32Array(GRID_AREA);
    this.densityR = new Float32Array(GRID_AREA);
    this.densityG = new Float32Array(GRID_AREA);
    this.densityB = new Float32Array(GRID_AREA);

    this.vx = new Float32Array(GRID_AREA);
    this.vy = new Float32Array(GRID_AREA);
    this.vx0 = new Float32Array(GRID_AREA);
    this.vy0 = new Float32Array(GRID_AREA);

    this.pressure = new Float32Array(GRID_AREA);
    this.gap = new Float32Array(GRID_AREA).fill(0.03);
    this.dhdt = new Float32Array(GRID_AREA);

    this.temp = new Float32Array(GRID_AREA);
    this.temp0 = new Float32Array(GRID_AREA);

    this.mul = new Float32Array(GRID_AREA).fill(1);
    this.dyeAdd = new Float32Array(GRID_AREA * 4);
    this.velAdd = new Float32Array(GRID_AREA * 4);
    this.rbDensity = new Float32Array(GRID_AREA);
    this.rbVx = new Float32Array(GRID_AREA);
    this.rbVy = new Float32Array(GRID_AREA);
    this.mcA = new Float32Array(GRID_AREA);
    this.mcB = new Float32Array(GRID_AREA);
  }

  // ── GPU solver lifecycle ───────────────────────────────────────────

  /** Move the simulation onto the GPU. Whatever the CPU arrays hold becomes the opening state. */
  attachGpu(gpu: GpuFluid) {
    if (this.gpu) {                       // resolution change: carry the field across
      this.pullStateFromGpu();
      this.gpu.dispose();
    }
    this.gpu = gpu;
    gpu.clear();
    // Absolute state → opening delta. The gap is absolute at rest (0.03).
    for (let i = 0; i < GRID_AREA; i++) this.gap[i] -= 0.03;
    this.dhdt.fill(0);
    this.mul.fill(1);
    this.dirty = true;
    // Readers see the CPU state until the first readback lands
    this.rbDensity.set(this.density);
    this.rbVx.set(this.vx);
    this.rbVy.set(this.vy);
  }

  /** Bring the field back to the CPU arrays and release the GPU solver. */
  detachGpu() {
    if (!this.gpu) return;
    this.pullStateFromGpu();
    this.gpu.dispose();
    this.gpu = null;
  }

  /** Release the GPU solver without a readback — the context is going away. */
  dropGpu() {
    this.gpu?.dispose();
    this.gpu = null;
  }

  /** Once per rendered frame: refresh the readback the CPU-side readers use. */
  syncFromGpu() {
    if (!this.gpu) return;
    // One frame of latency instead of a pipeline stall every frame.
    if (!this.gpu.readbackAsync()) return;
    const dye = this.gpu.rbDyeView, vel = this.gpu.rbVelView;
    let sum = 0;
    for (let i = 0; i < GRID_AREA; i++) {
      const d = dye[i * 4 + 3];
      this.rbDensity[i] = d;
      this.rbVx[i] = vel[i * 4];
      this.rbVy[i] = vel[i * 4 + 1];
      sum += d;
    }
    this.meanDensity = sum / GRID_AREA;
  }

  private pullStateFromGpu() {
    const gpu = this.gpu!;
    if (this.dirty) this.flushDeltas(this.dt || 0.01);
    const { dye, vel } = gpu.readback();
    for (let i = 0; i < GRID_AREA; i++) {
      this.densityR[i] = dye[i * 4];
      this.densityG[i] = dye[i * 4 + 1];
      this.densityB[i] = dye[i * 4 + 2];
      this.density[i] = dye[i * 4 + 3];
      this.vx[i] = vel[i * 4];
      this.vy[i] = vel[i * 4 + 1];
      this.temp[i] = vel[i * 4 + 2];
    }
    this.gap.fill(0.03);
    this.dhdt.fill(0);
    this.pressure.fill(0);
    this.mul.fill(1);
    this.dirty = false;
  }

  private flushDeltas(dt: number) {
    const gpu = this.gpu!;
    const da = this.dyeAdd, va = this.velAdd;
    for (let i = 0; i < GRID_AREA; i++) {
      const i4 = i * 4;
      da[i4] = this.densityR[i]; da[i4 + 1] = this.densityG[i]; da[i4 + 2] = this.densityB[i]; da[i4 + 3] = this.density[i];
      va[i4] = this.vx[i]; va[i4 + 1] = this.vy[i]; va[i4 + 2] = this.temp[i]; va[i4 + 3] = this.gap[i];
    }
    gpu.applyDeltas(da, va, this.mul, dt);
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.temp.fill(0); this.gap.fill(0);
    this.mul.fill(1);
    this.dirty = false;
  }

  addDensity(x: number, y: number, amount: number, r = 1, g = 1, b = 1) {
    const index = x + y * this.size;
    this.dirty = true;
    this.density[index] += amount;
    // Store log-space absorptions for Scott Burns geometric mean mixing.
    // At render time: channel = exp(-densityChannel / density)
    // This gives r1^w1 * r2^w2 weighted mixing — physically correct subtractive colorimetry.
    const eps = 0.002;
    this.densityR[index] += amount * (-Math.log(Math.max(eps, r)));
    this.densityG[index] += amount * (-Math.log(Math.max(eps, g)));
    this.densityB[index] += amount * (-Math.log(Math.max(eps, b)));
  }

  addVelocity(x: number, y: number, amountX: number, amountY: number) {
    const index = x + y * this.size;
    this.dirty = true;
    this.vx[index] += amountX;
    this.vy[index] += amountY;
  }

  addTemp(x: number, y: number, amount: number) {
    const index = x + y * this.size;
    this.dirty = true;
    this.temp[index] += amount;
  }

  // Inject an image as colored dye — scales image to fit visible grid area
  injectImage(imgData: ImageData) {
    const w = imgData.width, h = imgData.height;
    const d = imgData.data; // RGBA Uint8ClampedArray
    // Map image into the central visible region of the grid
    const S = this.size;
    const gx0 = Math.round(S * 0.19), gx1 = Math.round(S * 0.81);
    const gy0 = Math.round(S * 0.31), gy1 = Math.round(S * 0.69);
    const gw = gx1 - gx0, gh = gy1 - gy0;
    for (let gy = gy0; gy < gy1; gy++) {
      for (let gx = gx0; gx < gx1; gx++) {
        // Sample the image pixel (bilinear centre of each grid cell)
        const imgX = Math.floor(((gx - gx0) / gw) * w);
        const imgY = Math.floor(((gy - gy0) / gh) * h);
        const pi = (imgY * w + imgX) * 4;
        const r = d[pi] / 255, g = d[pi + 1] / 255, b = d[pi + 2] / 255;
        const a = d[pi + 3] / 255;
        if (a < 0.05) continue; // skip transparent pixels
        const brightness = r * 0.3 + g * 0.59 + b * 0.11;
        const amount = (0.5 + brightness * 1.5) * a;
        this.addDensity(gx, gy, amount, r, g, b);
      }
    }
  }

  clearAll() {
    this.density.fill(0); this.densityR.fill(0); this.densityG.fill(0); this.densityB.fill(0);
    this.s.fill(0); this.sR.fill(0); this.sG.fill(0); this.sB.fill(0);
    this.temp.fill(0); this.temp0.fill(0);
    this.vx.fill(0); this.vy.fill(0); this.vx0.fill(0); this.vy0.fill(0);
    this.pressure.fill(0); this.dhdt.fill(0);
    this.gap.fill(this.gpu ? 0 : 0.03);   // absolute at rest, or no delta
    this.mul.fill(1);
    this.rbDensity.fill(0); this.rbVx.fill(0); this.rbVy.fill(0);
    this.dirty = false;
    this.gpu?.clear();
  }

  private splatBlob(cx: number, cy: number, radius: number, amount: number, r: number, g: number, b: number) {
    radius *= GRID_SCALE; // caller radii are in 128-grid units
    const rCeil = Math.ceil(radius * 2);
    for (let dy = -rCeil; dy <= rCeil; dy++) {
      for (let dx = -rCeil; dx <= rCeil; dx++) {
        const dist2 = dx * dx + dy * dy;
        const nx = Math.floor(cx) + dx, ny = Math.floor(cy) + dy;
        if (nx < 1 || nx >= this.size - 1 || ny < 1 || ny >= this.size - 1) continue;
        const w = Math.exp(-dist2 / (2 * radius * radius));
        if (w < 0.01) continue;
        this.addDensity(nx, ny, amount * w, r, g, b);
      }
    }
  }

  seedPreset(presetId: string, noise2D: (x: number, y: number) => number): number[] {
    const S = this.size;
    const cx = S / 2, cy = S / 2;
    const k = GRID_SCALE; // absolute distances below were tuned on a 128 grid

    const harmony = PRESET_CONTRACTS[presetId] || pickHarmony();
    const col = (i: number) => PALETTE_RGB[harmony[i % harmony.length]];

    switch (presetId) {
      case 'galaxy': {
        // Bright core
        this.splatBlob(cx, cy, 5, 5.0, 0.85, 0.92, 1.0);
        this.splatBlob(cx, cy, 11, 2.5, 0.5, 0.25, 0.85);
        // Two logarithmic spiral arms
        for (let arm = 0; arm < 2; arm++) {
          const offset = arm * Math.PI;
          const c = col(arm);
          for (let t = 0.3; t < 5.5; t += 0.06) {
            const r = (3 + t * 8) * k;
            const theta = t * 1.3 + offset;
            const x = cx + r * Math.cos(theta), y = cy + r * Math.sin(theta);
            const bright = Math.max(0.1, 1.0 - t / 6.5);
            this.splatBlob(x, y, 1.8 + bright * 2.5, bright * 2.8, c.r, c.g, c.b);
          }
        }
        // Scattered stars
        for (let i = 0; i < 100; i++) {
          const a = Math.random() * Math.PI * 2, d = (3 + Math.random() * 48) * k;
          const c = Math.random() < 0.35 ? { r: 1, g: 1, b: 1 } : col(Math.floor(Math.random() * 4));
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
            0.6 + Math.random(), 0.4 + Math.random() * 1.2, c.r, c.g, c.b);
        }
        // Angular velocity for swirl
        for (let j = 2; j < S - 2; j += 2) {
          for (let i = 2; i < S - 2; i += 2) {
            const dx = i - cx, dy = j - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 55 * k) continue;
            const spd = 0.12 / (1 + (dist / k) * 0.025);
            this.addVelocity(i, j, -dy / dist * spd, dx / dist * spd);
          }
        }
        break;
      }

      case 'classic': {
        const positions: [number, number][] = [
          [0.22, 0.22], [0.78, 0.22], [0.50, 0.50],
          [0.22, 0.78], [0.78, 0.78], [0.35, 0.50], [0.65, 0.50],
        ];
        positions.forEach(([fx, fy], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, 18, 2.5, c.r, c.g, c.b);
        });
        break;
      }

      case 'deep-ocean': {
        for (let band = 0; band < 5; band++) {
          const by = S * (0.18 + band * 0.16);
          const c = col(band);
          for (let i = 2; i < S - 2; i++) {
            const wy = by + Math.sin(i * 0.06 + band * 1.5) * 8;
            this.splatBlob(i, wy, 6, 1.2, c.r, c.g, c.b);
          }
        }
        for (let j = 2; j < S - 2; j += 3)
          for (let i = 2; i < S - 2; i += 3)
            this.addVelocity(i, j, 0.04 + Math.sin(j * 0.05) * 0.02, 0);
        break;
      }

      case 'cyberpunk': {
        for (let s = 0; s < 5; s++) {
          const c = col(s);
          const sx = Math.random() * S * 0.3, sy = Math.random() * S;
          const a = Math.PI * 0.2 + s * 0.15;
          for (let t = 0; t < S * 1.2; t += 1.5) {
            const x = sx + Math.cos(a) * t, y = sy + Math.sin(a) * t;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            this.splatBlob(x, y, 2.5, 2.0, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'lava-lamp': {
        const blobs: [number, number, number][] = [
          [0.3, 0.75, 22], [0.7, 0.80, 18], [0.5, 0.60, 25], [0.4, 0.45, 15], [0.6, 0.35, 12],
        ];
        blobs.forEach(([fx, fy, rad], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, rad, 3.0, c.r, c.g, c.b);
          this.addTemp(Math.floor(fx * S), Math.floor(fy * S), 3.0);
        });
        for (let i = 5; i < S - 5; i += 3) this.addTemp(i, Math.floor(S * 0.85), 1.5);
        break;
      }

      case 'acid-trip': {
        for (let ring = 0; ring < 5; ring++) {
          const r = (8 + ring * 10) * k;
          const c = col(ring);
          for (let a = 0; a < Math.PI * 2; a += 0.04) {
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            this.splatBlob(x, y, 3, 1.8, c.r, c.g, c.b);
          }
        }
        break;
      }

      case 'bass-drop': {
        for (let i = 0; i < 4; i++) {
          const c = col(i);
          const off = (Math.random() - 0.5) * 12;
          this.splatBlob(cx + off, cy + off, 20 - i * 3, 4.0 - i * 0.5, c.r, c.g, c.b);
        }
        break;
      }

      case 'timbre-shifter': {
        for (let j = 2; j < S - 2; j += 2)
          for (let i = 2; i < S - 2; i += 2) {
            const n = noise2D(i * 0.03, j * 0.03);
            const c = col(Math.floor((n + 1) * 2));
            this.addDensity(i, j, 0.8 + n * 0.4, c.r, c.g, c.b);
          }
        break;
      }

      case 'boiling-point': {
        for (let i = 0; i < 40; i++) {
          const x = 8 + Math.random() * (S - 16), y = 8 + Math.random() * (S - 16);
          const c = col(i);
          this.splatBlob(x, y, 3 + Math.random() * 5, 2.0, c.r, c.g, c.b);
          this.addTemp(Math.floor(x), Math.floor(y), 3.0 + Math.random() * 4);
        }
        break;
      }

      case 'microscopic-chaos': {
        for (let j = 0; j < 12; j++)
          for (let i = 0; i < 12; i++) {
            const c = col(i + j);
            this.splatBlob((10 + i * 9 + (Math.random() - 0.5) * 4) * k, (10 + j * 9 + (Math.random() - 0.5) * 4) * k, 3.5, 2.5, c.r, c.g, c.b);
          }
        break;
      }

      case 'aurora-borealis': {
        for (let band = 0; band < 4; band++) {
          const by = S * (0.25 + band * 0.15);
          const c = col(band);
          for (let i = 2; i < S - 2; i++) {
            const wave = (Math.sin(i * 0.04 + band * 2.0) * 12 + Math.sin(i * 0.09) * 5) * k;
            const w = 3 + Math.sin(i * 0.07 + band) * 2;
            this.splatBlob(i, by + wave, w, 1.5, c.r, c.g, c.b);
          }
        }
        for (let j = 2; j < S - 2; j += 4)
          for (let i = 2; i < S - 2; i += 4) this.addVelocity(i, j, 0.03, 0);
        break;
      }

      case 'solar-flare': {
        this.splatBlob(cx, cy, 8, 6.0, 1.0, 0.95, 0.8);
        this.splatBlob(cx, cy, 15, 3.0, 1.0, 0.5, 0.0);
        for (let f = 0; f < 8; f++) {
          const a = f * Math.PI * 2 / 8 + (Math.random() - 0.5) * 0.4;
          const c = col(f);
          const len = (20 + Math.random() * 25) * k;
          for (let t = 5 * k; t < len; t += 1.5) {
            const wb = Math.sin(t * 0.3 + f) * 2 * k;
            const x = cx + Math.cos(a) * t + Math.cos(a + Math.PI / 2) * wb;
            const y = cy + Math.sin(a) * t + Math.sin(a + Math.PI / 2) * wb;
            if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
            const br = 1.0 - t / len;
            this.splatBlob(x, y, 2 + br * 2, br * 3.0, c.r, c.g, c.b);
            this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.15, Math.sin(a) * 0.15);
          }
        }
        this.addTemp(Math.floor(cx), Math.floor(cy), 5.0);
        break;
      }

      case 'jellyfish-bloom': {
        for (let jf = 0; jf < 4; jf++) {
          const jx = S * (0.2 + jf * 0.2 + (Math.random() - 0.5) * 0.1);
          const jy = S * (0.3 + (Math.random() - 0.5) * 0.3);
          const c = col(jf);
          const bellR = (8 + Math.random() * 6) * k;
          for (let a = -Math.PI; a < 0; a += 0.06)
            for (let r = 0; r < bellR; r += 1.5) {
              const x = jx + Math.cos(a) * r, y = jy + Math.sin(a) * r * 0.7;
              if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
              this.splatBlob(x, y, 1.5, (1.0 - r / bellR) * 2.0, c.r, c.g, c.b);
            }
          for (let t = 0; t < 3; t++) {
            let tx = jx + (t - 1) * bellR * 0.4;
            for (let dy = 0; dy < (18 + Math.random() * 10) * k; dy++) {
              const wb = Math.sin(dy * 0.2 + t) * 2 * k;
              this.splatBlob(tx + wb, jy + dy, 1.0, 0.8 / (1 + dy * 0.05), c.r, c.g, c.b);
            }
          }
        }
        break;
      }

      case 'fractal-dream': {
        const rings: [number, number, number][] = [
          [cx, cy, 30 * k], [cx - 15 * k, cy - 10 * k, 18 * k], [cx + 15 * k, cy + 10 * k, 20 * k],
          [cx + 8 * k, cy - 15 * k, 12 * k], [cx - 12 * k, cy + 12 * k, 15 * k],
        ];
        rings.forEach(([rx, ry, rr], idx) => {
          const c = col(idx);
          for (let a = 0; a < Math.PI * 2; a += 0.05)
            this.splatBlob(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr, 2.5, 1.8, c.r, c.g, c.b);
        });
        break;
      }

      case 'velvet-underground': {
        const pools: [number, number, number][] = [
          [0.3, 0.35, 22], [0.65, 0.55, 25], [0.45, 0.70, 20], [0.7, 0.25, 18],
        ];
        pools.forEach(([fx, fy, rad], idx) => {
          const c = col(idx);
          this.splatBlob(fx * S, fy * S, rad, 4.0, c.r, c.g, c.b);
        });
        break;
      }

      case 'neon-coral-reef': {
        for (let branch = 0; branch < 6; branch++) {
          let bx = S * (0.15 + branch * 0.14), by = S * 0.85;
          const c = col(branch);
          for (let seg = 0; seg < 50; seg++) {
            by -= 1.0 + Math.random() * 0.8;
            bx += (Math.random() - 0.5) * 3;
            if (bx < 2 || bx >= S - 2 || by < 2) break;
            this.splatBlob(bx, by, 2 + Math.random() * 2, 2.0, c.r, c.g, c.b);
            if (Math.random() < 0.15) {
              let fx = bx, fy = by;
              const dir = Math.random() < 0.5 ? -1 : 1;
              for (let s2 = 0; s2 < 15; s2++) {
                fy -= 0.8 + Math.random() * 0.5;
                fx += dir * (0.8 + Math.random() * 0.5);
                if (fx < 2 || fx >= S - 2 || fy < 2) break;
                this.splatBlob(fx, fy, 1.5, 1.2, c.r, c.g, c.b);
              }
            }
          }
        }
        break;
      }

      case 'stardust-collapse': {
        this.splatBlob(cx, cy, 6, 4.0, 1.0, 1.0, 1.0);
        const ringR = 30 * k;
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          const r = ringR + (Math.random() - 0.5) * 8 * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) continue;
          const c = col(i);
          this.splatBlob(x, y, 1.5 + Math.random() * 1.5, 1.5 + Math.random(), c.r, c.g, c.b);
          const dx = cx - x, dy = cy - y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.addVelocity(Math.floor(x), Math.floor(y), dx / dist * 0.08, dy / dist * 0.08);
        }
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, d = (5 + Math.random() * 45) * k;
          this.splatBlob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5 + Math.random() * 0.8, 0.3 + Math.random() * 0.5, 1, 1, 1);
        }
        for (let j = 2; j < S - 2; j += 3)
          for (let i = 2; i < S - 2; i += 3) {
            const dx = i - cx, dy = j - cy, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2 * k || dist > 50 * k) continue;
            const spd = 0.06 / (1 + (dist / k) * 0.02);
            this.addVelocity(i, j, -dy / dist * spd, dx / dist * spd);
          }
        break;
      }

      // ── Macro closeup seeds ──────────────────────────────────────
      // These three exist for the macro camera: it needs *separated* beads to
      // pick from, not one continuous wash covering the plate.
      case 'macro-bead': {
        for (let i = 0; i < 26; i++) {
          const x = 14 + Math.random() * (S - 28), y = 14 + Math.random() * (S - 28);
          const c = col(i);
          const r = (2 + Math.random() * 5) * k;
          this.splatBlob(x, y, r, 2.2 + Math.random() * 2.0, c.r, c.g, c.b);
          // A dark shoulder on one side — cells and lacing key off this contrast
          this.splatBlob(x + r * 0.9, y + r * 0.7, r * 0.5, 0.9, 0.06, 0.05, 0.05);
          const a = Math.random() * Math.PI * 2;
          this.addVelocity(Math.floor(x), Math.floor(y), Math.cos(a) * 0.05, Math.sin(a) * 0.05);
        }
        break;
      }

      case 'cell-bloom': {
        const centers: [number, number][] = [[0.34, 0.40], [0.63, 0.58], [0.50, 0.24], [0.28, 0.70]];
        centers.forEach(([fx, fy], ci) => {
          const bx = fx * S, by = fy * S;
          const c = col(ci);
          this.splatBlob(bx, by, 15 * k, 3.2, c.r, c.g, c.b);
          // Nuclei clustered inside each pool — the densest cell patches
          for (let n = 0; n < 18; n++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * 13 * k;
            const cc = col(ci + 1 + (n % 2));
            this.splatBlob(bx + Math.cos(a) * d, by + Math.sin(a) * d,
              (1.5 + Math.random() * 2.5) * k, 1.8, cc.r, cc.g, cc.b);
          }
        });
        break;
      }

      case 'lace-run': {
        // A tongue of light dye running across the plate — its leading edge is
        // where the lacing filaments form.
        const head = col(0), trail = col(1);
        for (let t = 0; t < 90; t++) {
          const x = S * 0.2 + t * (S * 0.6 / 90);
          const y = S * 0.5 + Math.sin(t * 0.07) * 10 * k;
          this.splatBlob(x, y, (6 + Math.sin(t * 0.15) * 3) * k, 2.4, head.r, head.g, head.b);
          this.addVelocity(Math.floor(x), Math.floor(y), 0.07, 0.0);
        }
        for (let i = 0; i < 34; i++) {
          const x = S * 0.18 + Math.random() * S * 0.7;
          const y = S * 0.5 + (Math.random() - 0.5) * S * 0.35;
          this.splatBlob(x, y, (1 + Math.random() * 3) * k, 1.6, trail.r, trail.g, trail.b);
        }
        break;
      }

      // Boyle's bench and Wilfred's lumia start from clean glass: the pattern
      // and the light are the subject, not a seed of blobs.
      case 'sensual-laboratory':
      case 'lumia':
        break;
      default: {
        for (let i = 0; i < 5; i++) {
          const c = col(i);
          this.splatBlob(10 + Math.random() * (S - 20), 10 + Math.random() * (S - 20), 15, 2.0, c.r, c.g, c.b);
        }
        break;
      }
    }

    return harmony;
  }

  applySquish(x: number, y: number, radius: number, amount: number) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        if (i * i + j * j >= r2) continue;
        const nx = x + i;
        const ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          this.dirty = true;
          if (this.gpu) {
            this.gap[idx] -= amount;    // a delta; the shader clamps and derives dh/dt
            continue;
          }
          const prevGap = this.gap[idx];
          this.gap[idx] = Math.max(0.005, this.gap[idx] - amount);
          this.dhdt[idx] = (this.gap[idx] - prevGap) / Math.max(this.dt, 0.0001);
        }
      }
    }
  }

  blowAir(x: number, y: number, radius: number, strength: number) {
    radius = Math.round(radius * GRID_SCALE);
    const r2 = radius * radius;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq >= r2 || distSq === 0) continue;
        const nx = x + i;
        const ny = y + j;
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          const dist = Math.sqrt(distSq);
          this.dirty = true;
          this.vx[idx] += (i / dist) * strength;
          this.vy[idx] += (j / dist) * strength;
          if (this.gpu) {
            this.mul[idx] *= 0.8;     // multiplicative change rides its own delta channel
          } else {
            this.density[idx] *= 0.8;
            this.densityR[idx] *= 0.8;
            this.densityG[idx] *= 0.8;
            this.densityB[idx] *= 0.8;
          }
        }
      }
    }
  }

  autoInject(style: string, x: number, y: number, amount: number, r: number, g: number, b: number, energy: number) {
    const S = this.size;
    const k = GRID_SCALE;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    switch (style) {
      case 'spray': {
        const sprayR = (8 + energy * 5) * k;
        const count = 8 + Math.floor(energy * 8);
        for (let p = 0; p < count; p++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * sprayR;
          const px = Math.floor(x + Math.cos(a) * d), py = Math.floor(y + Math.sin(a) * d);
          if (px < 1 || px >= S - 1 || py < 1 || py >= S - 1) continue;
          this.addDensity(px, py, amount * (1 - d / sprayR) * 0.25, r, g, b);
        }
        break;
      }
      case 'splatter': {
        const count = 3 + Math.floor(energy * 4);
        for (let p = 0; p < count; p++) {
          const a = Math.random() * Math.PI * 2;
          const fling = (2 + Math.random() * (10 + energy * 8)) * k;
          const px = Math.floor(x + Math.cos(a) * fling), py = Math.floor(y + Math.sin(a) * fling);
          if (px < 2 || px >= S - 2 || py < 2 || py >= S - 2) continue;
          const dropR = Math.round((1 + Math.floor(Math.random() * 2)) * k);
          for (let ddy = -dropR; ddy <= dropR; ddy++)
            for (let ddx = -dropR; ddx <= dropR; ddx++) {
              const dd = Math.sqrt(ddx * ddx + ddy * ddy);
              if (dd > dropR) continue;
              const nx = clamp(px + ddx, 1, S - 2), ny = clamp(py + ddy, 1, S - 2);
              this.addDensity(nx, ny, amount * (1 - dd / dropR) * 0.6, r, g, b);
            }
          this.addVelocity(px, py, Math.cos(a) * (0.3 + energy * 0.5), Math.sin(a) * (0.3 + energy * 0.5));
        }
        break;
      }
      case 'pour': {
        const pourR = Math.round((3 + Math.floor(energy * 2)) * k);
        for (let ddy = -pourR; ddy <= pourR; ddy++)
          for (let ddx = -pourR; ddx <= pourR; ddx++) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd > pourR) continue;
            const nx = clamp(x + ddx, 1, S - 2), ny = clamp(y + ddy, 1, S - 2);
            const w = Math.pow(1 - dd / pourR, 1.5);
            this.addDensity(nx, ny, amount * 1.3 * w, r, g, b);
            this.addVelocity(nx, ny, 0, 0.1 * w);
          }
        break;
      }
      case 'streak': {
        const a = Math.random() * Math.PI * 2;
        const len = (5 + Math.floor(energy * 10)) * k;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let t = -len; t <= len; t += 0.8) {
          const sx = Math.floor(x + dx * t), sy = Math.floor(y + dy * t);
          if (sx < 1 || sx >= S - 1 || sy < 1 || sy >= S - 1) continue;
          const w = 1.0 - Math.abs(t) / len;
          this.addDensity(sx, sy, amount * 0.35 * w, r, g, b);
          this.addVelocity(sx, sy, dx * 0.2 * w, dy * 0.2 * w);
        }
        break;
      }
      default: { // drop
        const dropR = Math.round(3 * k);
        for (let ddy = -dropR; ddy <= dropR; ddy++)
          for (let ddx = -dropR; ddx <= dropR; ddx++) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd > dropR) continue;
            const nx = clamp(x + ddx, 1, S - 2), ny = clamp(y + ddy, 1, S - 2);
            this.addDensity(nx, ny, amount * Math.pow(1 - dd / dropR, 2), r, g, b);
          }
        break;
      }
    }
  }

  applyVibration(intensity: number, frequency: number, time: number) {
    if (intensity <= 0.001 || frequency <= 0.001) return;
    const freqX = frequency * 0.5;
    const freqY = frequency * 0.5;
    const speed = time * 20;

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        if (this.density[idx] > 0.05) {
          this.vx[idx] += Math.sin(i * freqX + speed) * Math.cos(j * freqY) * intensity;
          this.vy[idx] += Math.cos(i * freqX) * Math.sin(j * freqY + speed) * intensity;
        }
      }
    }
  }

  step(settings: VisualizerSettings, audioData: AudioData | null, time: number, noise2D: (x: number, y: number) => number) {
    // ── Dynamic speed — settings only, no audio energy to avoid clock jumps ──
    let dynamicSpeed = 0.05;
    dynamicSpeed += settings.platePressure * 0.02;
    dynamicSpeed += settings.airVelocity * 0.01;
    dynamicSpeed += settings.automateRate * 0.01;

    let speedMultiplier = settings.globalSpeed / 0.05;
    if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
    dynamicSpeed *= speedMultiplier;

    // Plates behind the lead are the background loop: the same show, slower
    // and calmer, that the live plate is worked over.
    if (this.layerIndex > 0) dynamicSpeed *= 1 - 0.7 * Math.max(0, Math.min(1, settings.backgroundLoop ?? 0));

    this.dt = Math.min(Math.max(dynamicSpeed * 0.2, 0.0000001), 0.05);

    const p = this.deriveStep(settings, audioData, time, noise2D);

    if (this.gpu) {
      const applied = this.dirty;
      if (applied) this.flushDeltas(p.dt);
      this.gpu.step(p, applied);
      return;
    }

    const dt = p.dt;

    // 1. Squeeze-Film Flow
    this.solveSqueezePressure(p.visc);
    this.updateSqueezeVelocity(p.visc);

    // 2. Buoyancy & center gravity
    const cx = this.size / 2;
    const cy = this.size / 2;
    for (let i = 0; i < GRID_AREA; i++) {
      this.vy[i] -= this.temp[i] * p.buoyancy * dt;
      this.vx[i] += p.tiltX * dt;
      this.vy[i] += p.tiltY * dt;
      if (p.gravity > 0) {
        const x = i % this.size;
        const y = (i - x) / this.size;
        const dx = cx - x;
        const dy = cy - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.vx[i] += (dx / dist) * p.gravity * dt;
          this.vy[i] += (dy / dist) * p.gravity * dt;
        }
      }
    }

    // 3-6. Velocity: diffuse → project → advect → project
    this.diffuse(1, this.vx0, this.vx, p.nu, dt);
    this.diffuse(2, this.vy0, this.vy, p.nu, dt);
    this.project(this.vx0, this.vy0, this.vx, this.vy);
    // Velocity takes the cheaper first-order transport: MacCormack pays for
    // itself on the dye, where it keeps filaments, and costs a third of the
    // step on a field nobody sees directly.
    this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, dt * p.advection);
    this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, dt * p.advection);
    this.project(this.vx, this.vy, this.vx0, this.vy0);

    // 6.5. Multi-octave curl turbulence — detail at every scale
    this.applyCurlTurbulence(p.turbScale, p.turbDetail, time, noise2D);

    // 6.6. Mid/treble-driven vorticity — small spinning eddies in dense dye
    if (p.spin > 0) this.injectVorticity(p.spin, time, noise2D);

    // 7. Immiscibility & fingering
    this.applyImmiscibility(p.surfaceTension, time, noise2D);
    if (p.fingering > 0) this.applyFingering(p.fingering, time, noise2D);

    // 8. Vibration — only when explicitly cranked up
    if (p.vibIntensity > 0) this.applyVibration(p.vibIntensity, p.vibFrequency, time);

    // 8.5-8.7 Dripping, smearing, airflow — only above meaningful thresholds
    if (p.drip > 0) this.applyDripping(p.drip, dt, time, noise2D);
    if (settings.glassSmear > 0.2) this.applySmear(settings.glassSmear, dt, time, noise2D, audioData);
    if (p.air > 0) this.applyAirflow(p.air, dt, time, noise2D);

    // 9. Diffuse & advect density + temp. MacCormack keeps the filaments that
    // plain semi-Lagrangian transport would smear away within a few steps.
    this.diffuse(0, this.s,     this.density,  p.diff, dt, 4);
    this.diffuse(0, this.sR,    this.densityR, p.diff, dt, 4);
    this.diffuse(0, this.sG,    this.densityG, p.diff, dt, 4);
    this.diffuse(0, this.sB,    this.densityB, p.diff, dt, 4);
    this.diffuse(0, this.temp0, this.temp,     p.diff, dt, 4);
    this.advectMacCormack(0, this.density,  this.s,     this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityR, this.sR,    this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityG, this.sG,    this.vx, this.vy, dt * p.advection);
    this.advectMacCormack(0, this.densityB, this.sB,    this.vx, this.vy, dt * p.advection);
    this.advect(0, this.temp,     this.temp0, this.vx, this.vy, dt * p.advection);

    // 10. Evaporation, damping, stability
    let densSum = 0;
    for (let i = 0; i < GRID_AREA; i++) {
      this.vx[i] *= p.damping;
      this.vy[i] *= p.damping;
      const speedSq = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
      if (speedSq > 0.000004) {
        const factor = 0.002 / Math.sqrt(speedSq);
        this.vx[i] *= factor;
        this.vy[i] *= factor;
      }
      this.density[i]  *= p.evapFactor;
      this.densityR[i] *= p.evapFactor;
      this.densityG[i] *= p.evapFactor;
      this.densityB[i] *= p.evapFactor;
      // Per-cell soft cap — keeps color ratios but stops runaway thickness,
      // so fresh dye can always shift a cell's hue
      if (this.density[i] > 6) {
        const capScale = 6 / this.density[i];
        this.density[i] *= capScale;
        this.densityR[i] *= capScale;
        this.densityG[i] *= capScale;
        this.densityB[i] *= capScale;
      }
      densSum += this.density[i];
      this.temp[i]     *= p.heatDecay;
      this.dhdt[i]     *= 0.5;
      this.gap[i]       = Math.min(0.03, this.gap[i] + 0.005);

      // NaN guard
      if (isNaN(this.density[i]))  this.density[i]  = 0;
      if (isNaN(this.densityR[i])) this.densityR[i] = 0;
      if (isNaN(this.densityG[i])) this.densityG[i] = 0;
      if (isNaN(this.densityB[i])) this.densityB[i] = 0;
      if (isNaN(this.vx[i]))      this.vx[i]       = 0;
      if (isNaN(this.vy[i]))      this.vy[i]       = 0;
    }
    this.meanDensity = densSum / GRID_AREA;
  }

  /**
   * Everything one step needs, derived once from settings and audio so the CPU
   * and GPU solvers run from the same numbers.
   */
  private deriveStep(settings: VisualizerSettings, audioData: AudioData | null, time: number, noise2D: (x: number, y: number) => number): GpuStepParams {
    const dt = this.dt;
    const visc = settings.viscosity === 'thick' ? 1.5 : 0.5;

    // Momentum diffuses at a viscosity derived from the plate's thickness
    // setting — not at the dye's diffusivity, which is a different quantity.
    // Scaled so the defaults reproduce the near-zero momentum diffusion the
    // presets were tuned against: in a thin film the viscous drag is carried by
    // the squeeze-film wall shear, which is modelled separately.
    const nu = visc * 0.0001;

    const turbDetail = Math.max(1, Math.min(4, Math.round(settings.turbulenceDetail ?? 3)));
    let turbScale = settings.turbulenceScale ?? 0;
    if (this.layerIndex > 0) turbScale *= 1 - 0.6 * Math.max(0, Math.min(1, settings.backgroundLoop ?? 0));
    let spin = 0;
    let vibIntensity = 0, vibFrequency = 0;
    if (audioData) {
      const impact = settings.audioImpact ?? 0.45;
      // Audio energy breathes extra turbulence into the field so the liquid
      // visibly churns with the music instead of drifting at constant pace.
      turbScale *= 1 + Math.min(1, audioData.energy) * impact * 2.0;
      const mid01 = Math.min(1, audioData.mid / 70);
      const treble01 = Math.min(1, audioData.treble / 70);
      const s = (mid01 * 0.6 + treble01 * 0.4) * impact;
      if (s > 0.08) spin = s * 0.03;
      if (settings.vibrationFrequency > 0.3) {
        vibIntensity = audioData.energy * settings.vibrationFrequency * 0.002;
        vibFrequency = settings.vibrationFrequency * 3;
      }
    }

    // blobSurfaceTension trades cohesion for shear: low tension gives weak
    // cohesion and strong fingering (amoeba-like elongation and pinching),
    // high tension the reverse (rounder, self-contained blobs).
    const tension = Math.max(0, Math.min(1, settings.blobSurfaceTension ?? 0.5));
    const polarity = settings.polarity || 0;
    const surfaceTension = polarity * 0.04 * (0.4 + tension * 1.2);
    const fingering = polarity * 0.15 * (0.4 + (1 - tension) * 1.8);

    let smearX = 0, smearY = 0;
    if (settings.glassSmear > 0.2) {
      const t = time * 0.3;
      smearX = noise2D(t, 100) * settings.glassSmear * 12.0 * dt;
      smearY = noise2D(100, t) * settings.glassSmear * 12.0 * dt;
    }

    // Self-regulating dye budget: as the plate fills toward saturation,
    // evaporation ramps up hard so injection and removal find equilibrium
    // with plenty of empty glass left — a saturated plate has no boundaries
    // or gradients and reads as a static colour wash. A macro frame needs
    // empty ground around its subject, so the budget drops hard while the
    // closeup camera is running.
    const targetMean = settings.macroMode ? 0.28 : Math.max(0.1, Math.min(1.2, settings.dyeBudget ?? 0.85));
    const over = Math.max(0, this.meanDensity / targetMean - 1);
    const regulatorEvap = Math.min(0.02, over * over * 0.012);
    const evapFactor = 1.0 - settings.evaporationRate * 0.02 - regulatorEvap;

    return {
      dt, visc, nu,
      diff: settings.diffusionRate,
      buoyancy: settings.buoyancy,
      gravity: (settings.centerGravity || 0) * 0.05,
      tiltX: this.tiltX, tiltY: this.tiltY,
      advection: settings.advection,
      damping: settings.damping || 0.99,
      heatDecay: settings.heatDecay || 0.98,
      turbScale, turbDetail, spin, surfaceTension, fingering,
      vibIntensity, vibFrequency,
      drip: settings.rainDrip > 0.1 ? settings.rainDrip : 0,
      smearX, smearY,
      air: settings.airVelocity > 0.1 ? settings.airVelocity : 0,
      evapFactor, time,
    };
  }

  // ── Private simulation methods ─────────────────────────────────────

  private solveSqueezePressure(viscosity: number) {
    for (let k = 0; k < 10; k++) {
      for (let j = 1; j < this.size - 1; j++) {
        for (let i = 1; i < this.size - 1; i++) {
          const idx = i + j * this.size;
          const h = this.gap[idx];
          let source = (12.0 * viscosity * this.dhdt[idx]) / (h * h * h);
          source = Math.max(-100, Math.min(100, source));
          this.pressure[idx] = (
            this.pressure[idx - 1] + this.pressure[idx + 1] +
            this.pressure[idx - this.size] + this.pressure[idx + this.size] - source
          ) * 0.25;
        }
      }
      this.setBoundary(0, this.pressure);
    }
  }

  private updateSqueezeVelocity(viscosity: number) {
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const gradPX = (this.pressure[idx + 1] - this.pressure[idx - 1]) * 0.5;
        const gradPY = (this.pressure[idx + this.size] - this.pressure[idx - this.size]) * 0.5;
        const h = this.gap[idx];
        const coeff = -(h * h) / (12.0 * viscosity);
        this.vx[idx] += coeff * gradPX;
        this.vy[idx] += coeff * gradPY;
      }
    }
  }

  private applyImmiscibility(surfaceTension: number, time: number, noise2D: (x: number, y: number) => number) {
    const strength = surfaceTension * 0.8;
    const sharpness = 2.0;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const d = this.density[idx];
        if (d < 0.01) continue;

        const dr = this.densityR[idx] / d;
        const dg = this.densityG[idx] / d;
        const db = this.densityB[idx] / d;

        const dL = this.density[idx - 1];
        const dR = this.density[idx + 1];
        const dB = this.density[idx - this.size];
        const dT = this.density[idx + this.size];

        let colorDiffX = 0;
        let colorDiffY = 0;

        if (dR > 0.01 && dL > 0.01) {
          const diffR = Math.sqrt(
            (this.densityR[idx + 1] / dR - dr) ** 2 +
            (this.densityG[idx + 1] / dR - dg) ** 2 +
            (this.densityB[idx + 1] / dR - db) ** 2
          );
          const diffL = Math.sqrt(
            (this.densityR[idx - 1] / dL - dr) ** 2 +
            (this.densityG[idx - 1] / dL - dg) ** 2 +
            (this.densityB[idx - 1] / dL - db) ** 2
          );
          colorDiffX = diffR ** sharpness - diffL ** sharpness;
        }

        if (dT > 0.01 && dB > 0.01) {
          const diffT = Math.sqrt(
            (this.densityR[idx + this.size] / dT - dr) ** 2 +
            (this.densityG[idx + this.size] / dT - dg) ** 2 +
            (this.densityB[idx + this.size] / dT - db) ** 2
          );
          const diffB = Math.sqrt(
            (this.densityR[idx - this.size] / dB - dr) ** 2 +
            (this.densityG[idx - this.size] / dB - dg) ** 2 +
            (this.densityB[idx - this.size] / dB - db) ** 2
          );
          colorDiffY = diffT ** sharpness - diffB ** sharpness;
        }

        const n = noise2D(i * 0.03, j * 0.03 + time * 0.05);
        const noiseMod = 1.0 + n * 2.0;
        this.vx[idx] -= colorDiffX * strength * d * noiseMod;
        this.vy[idx] -= colorDiffY * strength * d * noiseMod;
      }
    }
  }

  private applyFingering(strength: number, time: number, noise2D: (x: number, y: number) => number) {
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const d = this.density[idx];
        if (d < 0.05) continue;
        const gradX = (this.density[idx + 1] - this.density[idx - 1]) * 0.5;
        const gradY = (this.density[idx + this.size] - this.density[idx - this.size]) * 0.5;
        const gradMagSq = gradX * gradX + gradY * gradY;
        if (gradMagSq > 0.005) {
          const gradMag = Math.sqrt(gradMagSq);
          const nx = gradX / gradMag;
          const ny = gradY / gradMag;
          const n = noise2D(i * 0.02, j * 0.02 + time * 0.05);
          const force = n * strength * gradMag * 4.0;
          this.vx[idx] -= nx * force;
          this.vy[idx] -= ny * force;
        }
      }
    }
  }

  private applyAirflow(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number) {
    const upwardForce = -strength * 8.0 * dt;
    for (let i = 0; i < GRID_AREA; i++) {
      if (this.density[i] > 0.01) {
        const xi = i % this.size;
        const yi = (i - xi) / this.size;
        this.vx[i] += noise2D(xi * 0.05, yi * 0.05 - time) * strength * 4.0 * dt;
        this.vy[i] += upwardForce + noise2D(yi * 0.05, xi * 0.05 + time) * strength * 4.0 * dt;
      }
    }
  }

  private applySmear(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number, audioData: AudioData | null) {
    const smearSpeed = time * 0.3;
    const shearX = noise2D(smearSpeed, 100) * strength * 12.0 * dt;
    const shearY = noise2D(100, smearSpeed) * strength * 12.0 * dt;

    const totalShearX = shearX;
    const totalShearY = shearY;

    for (let i = 0; i < GRID_AREA; i++) {
      if (this.density[i] > 0.01) {
        const xi = i % this.size;
        const yi = (i - xi) / this.size;
        const localNoise = noise2D(xi * 0.1, yi * 0.1) * 0.5 + 0.5;
        this.vx[i] += totalShearX * localNoise;
        this.vy[i] += totalShearY * localNoise;
      }
    }
  }

  private applyDripping(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number) {
    const dripGravity = 0.3 * dt * strength;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = i + j * this.size;
        const streak = (noise2D(i * 0.15, j * 0.02 - time * 0.2) + 1) * 0.5;
        this.vy[idx] += dripGravity * (0.1 + streak * streak * 0.9);
        const friction = 0.5 + (1.0 - Math.max(0, streak)) ** 3 * 20.0;
        const decay = Math.exp(-friction * dt);
        this.vy[idx] *= decay;
        this.vx[idx] *= decay;
      }
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number, iterations = 10) {
    const a = dt * diff * (this.size - 2) * (this.size - 2);
    this.linSolve(b, x, x0, a, 1 + 4 * a, iterations);
  }

  // Iteration counts are tuned per use: pressure projection needs the most,
  // dye diffusion converges almost immediately (tiny diffusion coefficients).
  private linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number, iterations = 12) {
    const cRecip = 1.0 / c;
    for (let k = 0; k < iterations; k++) {
      for (let j = 1; j < this.size - 1; j++) {
        for (let i = 1; i < this.size - 1; i++) {
          x[i + j * this.size] =
            (x0[i + j * this.size] +
              a * (x[i + 1 + j * this.size] + x[i - 1 + j * this.size] +
                   x[i + (j + 1) * this.size] + x[i + (j - 1) * this.size])) * cRecip;
        }
      }
      this.setBoundary(b, x);
    }
  }

  private project(velocX: Float32Array, velocY: Float32Array, p: Float32Array, div: Float32Array) {
    const sizeRecip = 1.0 / this.size;
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        div[i + j * this.size] =
          -0.5 * (velocX[i + 1 + j * this.size] - velocX[i - 1 + j * this.size] +
                  velocY[i + (j + 1) * this.size] - velocY[i + (j - 1) * this.size]) * sizeRecip;
        p[i + j * this.size] = 0;
      }
    }
    this.setBoundary(0, div);
    this.setBoundary(0, p);
    this.linSolve(0, p, div, 1, 4);

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        velocX[i + j * this.size] -= 0.5 * (p[i + 1 + j * this.size] - p[i - 1 + j * this.size]) * this.size;
        velocY[i + j * this.size] -= 0.5 * (p[i + (j + 1) * this.size] - p[i + (j - 1) * this.size]) * this.size;
      }
    }
    this.setBoundary(1, velocX);
    this.setBoundary(2, velocY);
  }

  private advect(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array, dt: number) {
    const dtx = dt * (this.size - 2);
    const dty = dt * (this.size - 2);
    const Nfloat = this.size - 2;

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        let x = i - dtx * velocX[i + j * this.size];
        let y = j - dty * velocY[i + j * this.size];

        if (x < 0.5) x = 0.5;
        if (x > Nfloat + 0.5) x = Nfloat + 0.5;
        if (y < 0.5) y = 0.5;
        if (y > Nfloat + 0.5) y = Nfloat + 0.5;

        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        const s1 = x - i0;
        const s0 = 1.0 - s1;
        const t1 = y - j0;
        const t0 = 1.0 - t1;
        const i1 = i0 + 1;
        const j1 = j0 + 1;

        d[i + j * this.size] =
          s0 * (t0 * d0[i0 + j0 * this.size] + t1 * d0[i0 + j1 * this.size]) +
          s1 * (t0 * d0[i1 + j0 * this.size] + t1 * d0[i1 + j1 * this.size]);
      }
    }
    this.setBoundary(b, d);
  }

  /**
   * MacCormack advection: advect forward, advect the result back, correct by
   * half the round-trip error, and clamp to the range of the four cells the
   * forward step interpolated between so the correction can't overshoot.
   * Semi-Lagrangian transport alone is dissipative enough to smear a thin
   * filament away within a few steps; this is what lets them survive.
   */
  private advectMacCormack(b: number, d: Float32Array, d0: Float32Array, velocX: Float32Array, velocY: Float32Array, dt: number) {
    this.advect(b, this.mcA, d0, velocX, velocY, dt);         // φ̂ₙ₊₁ = A(φₙ)
    this.advect(b, this.mcB, this.mcA, velocX, velocY, -dt);  // φ̂ₙ = A⁻¹(φ̂ₙ₊₁)

    const N = this.size;
    const dtx = dt * (N - 2);
    const Nfloat = N - 2;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = i + j * N;
        let x = i - dtx * velocX[idx];
        let y = j - dtx * velocY[idx];
        if (x < 0.5) x = 0.5; else if (x > Nfloat + 0.5) x = Nfloat + 0.5;
        if (y < 0.5) y = 0.5; else if (y > Nfloat + 0.5) y = Nfloat + 0.5;
        const i0 = Math.floor(x), j0 = Math.floor(y);
        const i1 = i0 + 1, j1 = j0 + 1;
        const a = d0[i0 + j0 * N], b2 = d0[i1 + j0 * N], c = d0[i0 + j1 * N], e = d0[i1 + j1 * N];
        const mn = Math.min(a, b2, c, e), mx = Math.max(a, b2, c, e);
        const v = this.mcA[idx] + 0.5 * (d0[idx] - this.mcB[idx]);
        d[idx] = v < mn ? mn : v > mx ? mx : v;
      }
    }
    this.setBoundary(b, d);
  }

  private setBoundary(b: number, x: Float32Array) {
    for (let i = 1; i < this.size - 1; i++) {
      x[i]                            = b === 2 ? -x[i + this.size]            : x[i + this.size];
      x[i + (this.size - 1) * this.size] = b === 2 ? -x[i + (this.size - 2) * this.size] : x[i + (this.size - 2) * this.size];
    }
    for (let j = 1; j < this.size - 1; j++) {
      x[j * this.size]                    = b === 1 ? -x[1 + j * this.size]            : x[1 + j * this.size];
      x[(this.size - 1) + j * this.size]  = b === 1 ? -x[(this.size - 2) + j * this.size] : x[(this.size - 2) + j * this.size];
    }
    x[0] = 0.5 * (x[1] + x[this.size]);
    x[(this.size - 1) * this.size] = 0.5 * (x[1 + (this.size - 1) * this.size] + x[(this.size - 2) * this.size]);
    x[this.size - 1] = 0.5 * (x[this.size - 2] + x[this.size - 1 + this.size]);
    x[(this.size - 1) + (this.size - 1) * this.size] = 0.5 * (
      x[(this.size - 2) + (this.size - 1) * this.size] + x[(this.size - 1) + (this.size - 2) * this.size]
    );
  }

  // Radial outward velocity impulse — simulates bass-frequency plate strike
  applyRadialImpulse(cx: number, cy: number, radius: number, strength: number) {
    this.dirty = true;
    const r2 = radius * radius;
    for (let j = cy - radius; j <= cy + radius; j++) {
      for (let i = cx - radius; i <= cx + radius; i++) {
        const dx = i - cx, dy = j - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq < r2 && distSq > 0 && i > 0 && i < this.size - 1 && j > 0 && j < this.size - 1) {
          const dist = Math.sqrt(distSq);
          const falloff = (1 - dist / radius) * (1 - dist / radius); // quadratic falloff
          this.vx[i + j * this.size] += (dx / dist) * strength * falloff;
          this.vy[i + j * this.size] += (dy / dist) * strength * falloff;
        }
      }
    }
  }

  // Multi-octave curl noise — turbulence at several scales simultaneously.
  // Octave 0 is a low-frequency swirl that moves whole blobs; higher octaves
  // add ripples, filament trails and satellite droplets at lower amplitude.
  applyCurlTurbulence(scale: number, octaves: number, time: number, noise2D: (x: number, y: number) => number) {
    if (scale <= 0.005) return;
    const step = 2;
    const eps = 0.75; // finite-difference offset in grid cells
    for (let o = 0; o < octaves; o++) {
      const freq = (0.012 / GRID_SCALE) * (1 << o); // feature size stays constant relative to the frame
      const amp = scale * 0.010 * Math.pow(0.55, o);
      const tOff = time * (0.06 + o * 0.05) + o * 37.7;
      for (let j = 1; j < this.size - 1; j += step) {
        for (let i = 1; i < this.size - 1; i += step) {
          const idx = i + j * this.size;
          const d = this.density[idx];
          if (d < 0.02) continue;
          // Curl of scalar noise field: v = (dn/dy, -dn/dx) — divergence-free
          const dn_dx = noise2D((i + eps) * freq, j * freq + tOff) - noise2D((i - eps) * freq, j * freq + tOff);
          const dn_dy = noise2D(i * freq, (j + eps) * freq + tOff) - noise2D(i * freq, (j - eps) * freq + tOff);
          const m = amp * Math.min(1.5, d);
          this.vx[idx] +=  dn_dy * m;
          this.vy[idx] += -dn_dx * m;
        }
      }
    }
  }

  // Inject curl-noise vorticity into dense fluid regions — driven by mid/treble
  injectVorticity(strength: number, time: number, noise2D: (x: number, y: number) => number) {
    const step = 3; // sample every 3 cells for performance
    for (let j = 1; j < this.size - 1; j += step) {
      for (let i = 1; i < this.size - 1; i += step) {
        const idx = i + j * this.size;
        if (this.density[idx] > 0.05) {
          // Curl noise: perpendicular to gradient of noise field
          const n = noise2D(i * 0.025, j * 0.025 + time * 0.08);
          const dn_dx = noise2D(i * 0.025 + 0.01, j * 0.025 + time * 0.08) - n;
          const dn_dy = noise2D(i * 0.025, j * 0.025 + 0.01 + time * 0.08) - n;
          this.vx[idx] +=  dn_dy * strength * this.density[idx];
          this.vy[idx] += -dn_dx * strength * this.density[idx];
        }
      }
    }
  }
}


// ─── WebGL2 resource types ────────────────────────────────────────────

interface GLResources {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  posBuffer: WebGLBuffer;
  textures: WebGLTexture[];
  texData: Uint8Array[];
  /** Velocity fields for layers 0/1 — macro detail is advected by these. */
  velTextures: WebGLTexture[];
  velData: Uint8Array[];
  uLocs: Record<string, WebGLUniformLocation | null>;
  /** Framebuffers the GPU solver renders its packed output into, keyed by texture. */
  packFbos: Map<WebGLTexture, WebGLFramebuffer>;
  /** Allocated edge length of each RGBA8 texture, so a resolution change reallocates it. */
  texSizes: Map<WebGLTexture, number>;
  maxTexture: number;
  /** The film projector's frame — a video file or the camera — uploaded each frame it plays. */
  filmTexture: WebGLTexture;
}

// ─── React Component ─────────────────────────────────────────────────

export const LiquidVisualizer = forwardRef<LiquidVisualizerHandle, LiquidVisualizerProps>(({
  audioData, settings, seedCount = 0, selectedLiquid,
  activeLayer = 0, clearTrigger = 0, drainTrigger = 0, activeTool = 'dropper',
  isAutomated = false, isActive = true, onManualGesture, onEngineStatus,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidsRef = useRef<FluidSimulation[]>([]);
  const noise2D = useMemo(() => createNoise2D(), []);
  const lastSeedCount = useRef(seedCount);
  const lastClearTrigger = useRef(clearTrigger);
  const lastDrainTrigger = useRef(drainTrigger);
  const drainFrameRef = useRef(0); // >0 means drain animation is running
  const harmonyRef = useRef(pickHarmony());
  const harmonyLockRef = useRef<number[] | null>(null); // user-pinned palette
  const presetContractRef = useRef<number[] | null>(PRESET_CONTRACTS['classic']); // the preset's allowed dyes
  /** The sequencer's window onto the contract (size null = whatever the journey allows), and the hue journey's own lead. */
  const paletteWindowRef = useRef<{ size: number | null; lead: number }>({ size: null, lead: 0 });
  const journeyRef = useRef({ lead: 0, lastAt: -1 });
  /**
   * The working harmony for the current contract: the sequencer's window if
   * it set one, else the hue journey's window (one dye short of the contract,
   * so the walk is visible), else the whole set.
   */
  const harmonyFromContract = (contract: number[], journeyOn: boolean): number[] => {
    const pw = paletteWindowRef.current;
    const lead = pw.lead + journeyRef.current.lead;
    if (pw.size !== null) return windowOf(contract, pw.size, lead);
    if (journeyOn && contract.length >= 3) return windowOf(contract, Math.max(2, contract.length - 1), lead);
    return contract.length <= 3 ? windowOf(contract, null, lead) : harmonyWithin(contract);
  };
  const bubblesRef = useRef(new BubbleField(GRID_SIZE));
  /** The plate's tilt: a damped spring kicked by the beat, plus a slow ambient sway. */
  const rockRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, phase: 0.7, lastBass: 0 });
  /** Where the projector lamp sits under the plate (fluid uv), and the second one. */
  const lampRef = useRef({ x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 });
  /** The camera pass, built the first time a frame asks for it. */
  const cameraRef = useRef<CameraPass | null>(null);
  /** How the second layer is currently viewed (zoom about the centre plus drift), for brush mapping. */
  const layer1ViewRef = useRef({ zoom: 1, dx: 0, dy: 0 });
  const externalTiltRef = useRef({ x: 0, y: 0, at: -1e9 });
  const chemRef = useRef(new ChemistryField(GRID_SIZE));
  const gelAngleRef = useRef(0);
  const filmRef = useRef<{ video: HTMLVideoElement | null; kind: 'none' | 'file' | 'camera'; stream: MediaStream | null; url: string | null }>({ video: null, kind: 'none', stream: null, url: null });
  const filmVideo = () => {
    const f = filmRef.current;
    if (!f.video) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      f.video = v;
    }
    return f.video;
  };
  const stopFilm = () => {
    const f = filmRef.current;
    if (f.stream) { f.stream.getTracks().forEach(t => t.stop()); f.stream = null; }
    if (f.url) { URL.revokeObjectURL(f.url); f.url = null; }
    if (f.video) { f.video.pause(); f.video.removeAttribute('src'); f.video.srcObject = null; }
    f.kind = 'none';
  };
  const injectStyleRef = useRef<string[]>(['drop']);
  const rotationAnglesRef = useRef<number[]>([]);
  const webGLRef = useRef<GLResources | null>(null);

  // Refs for reactive data (avoids useEffect thrashing).
  const audioDataRef = useRef(audioData);
  const settingsRef = useRef(settings);
  const selectedLiquidRef = useRef(selectedLiquid);
  const activeLayerRef = useRef(activeLayer);
  const activeToolRef = useRef(activeTool);
  const isAutomatedRef = useRef(isAutomated);
  const isActiveRef = useRef(isActive);
  const isMouseDownRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const simulationTimeRef = useRef(0);
  const lastTimeRef = useRef(Date.now() * 0.001);
  const lastBass01Ref = useRef(0); // for beat edge detection
  /** The beat clock: kicks from the tempo, ahead of the microphone, once it has locked. */
  const beatClockRef = useRef(new BeatClock());
  const kickRef = useRef<{ kick: boolean; predicted: boolean }>({ kick: false, predicted: false });
  const camBassRef = useRef(0);     // the camera's own onset memory, per frame
  const onManualGestureRef = useRef(onManualGesture);
  const gestureFrameRef = useRef(0); // throttles gesture recording to ~15 Hz
  const macroCamRef = useRef(new MacroCamera());
  const macroShotRef = useRef<MacroShot>({ cx: 0.5, cy: 0.5, zoom: 1, whip: 0 });
  const filmHistRef = useRef(new Uint32Array(FILM_BINS));
  const simAccumRef = useRef(0);
  /** Milliseconds the last frame spent in the solver: the catch-up cap adapts to it. */
  const simMsRef = useRef(0);
  const onEngineStatusRef = useRef(onEngineStatus);
  const gpuSupportedRef = useRef<boolean | null>(null);   // null = not probed yet
  const engineStatusRef = useRef<EngineStatus | null>(null);
  const engineStatusAtRef = useRef(0);
  const governorRef = useRef<QualityGovernor | null>(null);
  const dprRef = useRef(1);
  const lastMacroOnRef = useRef(false);
  const filmLevelRef = useRef(0.3);
  const filmGainRef = useRef(4.5);

  useImperativeHandle(ref, () => ({
    injectImage: (imageData: ImageData) => {
      const fluid = fluidsRef.current[activeLayerRef.current];
      if (fluid) fluid.injectImage(imageData);
    },
    applyPreset: (presetId: string) => {
      for (const fluid of fluidsRef.current) fluid.clearAll();
      bubblesRef.current.clear();
      chemRef.current.reset();
      rotationAnglesRef.current = rotationAnglesRef.current.map(() => Math.random() * Math.PI * 2);
      presetContractRef.current = PRESET_CONTRACTS[presetId] ?? null;
      journeyRef.current = { lead: 0, lastAt: -1 };
      const fluid = fluidsRef.current[0];
      if (fluid) {
        const seeded = fluid.seedPreset(presetId, noise2D);
        const contract = presetContractRef.current;
        harmonyRef.current = harmonyLockRef.current ?? (contract && paletteWindowRef.current.size !== null ? harmonyFromContract(contract, false) : seeded);
      }
      injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
      drainFrameRef.current = 0;
      macroCamRef.current.reset();
    },
    adoptPreset: (presetId: string) => {
      // The sequencer changing stage: the plate keeps what is on it, and the
      // new dyes and injection style take over from here.
      presetContractRef.current = PRESET_CONTRACTS[presetId] ?? null;
      journeyRef.current = { lead: 0, lastAt: -1 };
      injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
      if (!harmonyLockRef.current) {
        const contract = presetContractRef.current;
        harmonyRef.current = contract ? harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0) : pickHarmony();
      }
    },
    setPaletteWindow: (size: number | null, lead: number) => {
      paletteWindowRef.current = { size: size === null ? null : Math.max(1, Math.round(size)), lead: Math.round(lead) };
      if (harmonyLockRef.current) return;
      const contract = presetContractRef.current;
      if (contract) harmonyRef.current = harmonyFromContract(contract, (settingsRef.current.hueJourney ?? 0) > 0);
    },
    setInjectStyle: (styles: string[]) => {
      injectStyleRef.current = styles;
    },
    setHarmony: (indices: number[]) => {
      // Music-driven harmony never overrides an explicit user palette lock
      if (harmonyLockRef.current) return;
      if (indices.length > 0 && indices.every(i => i >= 0 && i < PALETTE_COUNT)) {
        // A song's identity colours the show, but inside the preset's dyes.
        const contract = presetContractRef.current;
        if (!contract) { harmonyRef.current = indices; return; }
        const inside = indices.filter(i => contract.includes(i));
        harmonyRef.current = inside.length >= 2 ? inside : harmonyWithin(contract);
      }
    },
    setExternalTilt: (x: number, y: number) => {
      const t = externalTiltRef.current;
      t.x = Math.max(-1, Math.min(1, x));
      t.y = Math.max(-1, Math.min(1, y));
      t.at = performance.now() * 0.001;
    },
    loadFilmFile: async (file: File) => {
      stopFilm();
      const f = filmRef.current;
      const v = filmVideo();
      f.url = URL.createObjectURL(file);
      v.src = f.url;
      f.kind = 'file';
      try { await v.play(); } catch { /* autoplay policy: plays on the next gesture */ }
    },
    startFilmCamera: async () => {
      stopFilm();
      const f = filmRef.current;
      const v = filmVideo();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      f.stream = stream;
      v.srcObject = stream;
      f.kind = 'camera';
      try { await v.play(); } catch { /* as above */ }
    },
    clearFilm: () => stopFilm(),
    setHarmonyLock: (indices: number[] | null) => {
      harmonyLockRef.current = indices;
      if (indices) harmonyRef.current = indices;
    },
    triggerTheme: (theme: string, energy = 0.6) => {
      const af = fluidsRef.current[activeLayerRef.current];
      if (!af || drainFrameRef.current > 0) return;
      const S = GRID_SIZE;
      const rx = () => Math.floor(S * 0.2 + Math.random() * S * 0.6);
      const pick = (idxs: number[]) => PALETTE_RGB[idxs[Math.floor(Math.random() * idxs.length)]];
      const amt = 4 + energy * 8;

      switch (theme) {
        case 'fire': { // warm palette, low placement, heat drives it upward
          const c = pick([0, 1, 3]);
          const x = rx(), y = Math.floor(S * 0.75);
          af.autoInject('splatter', x, y, amt, c.r, c.g, c.b, energy);
          af.addTemp(x, y, 3 + energy * 4);
          break;
        }
        case 'water': { // cool palette pours downward from the top
          const c = pick([7, 8, 9]);
          const x = rx(), y = Math.floor(S * 0.2);
          af.autoInject('pour', x, y, amt, c.r, c.g, c.b, energy);
          for (let d = 0; d < 10; d++) af.addVelocity(x, Math.min(S - 2, y + d), 0, 0.08);
          break;
        }
        case 'sky': { // icy blue + white mist high in the frame
          const c = pick([7, 15]);
          af.autoInject('spray', rx(), Math.floor(S * 0.25), amt, c.r, c.g, c.b, energy);
          break;
        }
        case 'earth': { // heavy warm browns settle low
          const c = pick([12, 13, 1]);
          af.autoInject('pour', rx(), Math.floor(S * 0.8), amt, c.r, c.g, c.b, energy * 0.6);
          break;
        }
        case 'love': { // pink bloom from the center
          const c = pick([2, 11]);
          af.autoInject('drop', Math.floor(S / 2), Math.floor(S / 2), amt * 1.2, c.r, c.g, c.b, energy);
          af.addTemp(Math.floor(S / 2), Math.floor(S / 2), 1.5);
          break;
        }
        case 'dark': { // ink splatter
          const c = pick([14, 4]);
          af.autoInject('splatter', rx(), rx(), amt, c.r * 0.4, c.g * 0.4, c.b * 0.4, energy);
          break;
        }
        case 'light': { // white-gold radial burst
          const c = pick([15, 0]);
          const x = Math.floor(S / 2), y = Math.floor(S / 2);
          af.autoInject('drop', x, y, amt, c.r, c.g, c.b, energy);
          af.applyRadialImpulse(x, y, Math.round(20 * GRID_SCALE), 0.3 + energy * 0.4);
          af.addTemp(x, y, 2 + energy * 2);
          break;
        }
        case 'motion': { // fast streaks in the current harmony
          const c = harmonyColor(harmonyRef.current);
          af.autoInject('streak', rx(), rx(), amt, c.r, c.g, c.b, Math.min(1, energy + 0.3));
          break;
        }
        default: {
          const c = harmonyColor(harmonyRef.current);
          af.autoInject('drop', rx(), rx(), amt, c.r, c.g, c.b, energy);
        }
      }
    },
    applyGesture: (g) => {
      const layer = g.layer ?? activeLayerRef.current;
      const af = fluidsRef.current[layer];
      if (!af || drainFrameRef.current > 0) return;
      if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0) {
        bubblesRef.current.disturb(g.x * GRID_SIZE, g.y * GRID_SIZE, (g.tool === 'blow' ? 5 : 3) * GRID_SCALE, g.tool === 'blow' ? 'air' : 'dye');
      }
      const S = GRID_SIZE;
      const x = Math.max(1, Math.min(S - 2, Math.round(g.x * S)));
      const y = Math.max(1, Math.min(S - 2, Math.round(g.y * S)));
      const rgb = g.color ? hexToRgb(g.color) : harmonyColor(harmonyRef.current);

      switch (g.tool) {
        case 'blow':
          af.blowAir(x, y, 4, 0.06);
          if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0 && Math.random() < 0.15) {
            bubblesRef.current.spawn(x, y, 1.2 * GRID_SCALE, 2, 3 * GRID_SCALE);
          }
          break;
        case 'drop':
          af.autoInject('drop', x, y, 5, rgb.r, rgb.g, rgb.b, 0.5);
          af.addTemp(x, y, 0.6);
          break;
        case 'streak': {
          // Directional smear along the recorded movement
          const dx = g.dx ?? 1, dy = g.dy ?? 0;
          const len = 8 * GRID_SCALE;
          for (let t = -len; t <= len; t += 0.8) {
            const sx = Math.floor(x + dx * t), sy = Math.floor(y + dy * t);
            if (sx < 1 || sx >= S - 1 || sy < 1 || sy >= S - 1) continue;
            const w = 1.0 - Math.abs(t) / len;
            af.addDensity(sx, sy, 0.6 * w, rgb.r, rgb.g, rgb.b);
            af.addVelocity(sx, sy, dx * 0.3 * w, dy * 0.3 * w);
          }
          break;
        }
        case 'spray':
          af.autoInject('spray', x, y, 5, rgb.r, rgb.g, rgb.b, 0.5);
          break;
        case 'splatter':
          af.autoInject('splatter', x, y, 4, rgb.r, rgb.g, rgb.b, 0.5);
          break;
        case 'pour':
          af.autoInject('pour', x, y, 4, rgb.r, rgb.g, rgb.b, 0.5);
          break;
        default: // dropper
          af.autoInject('drop', x, y, 4, rgb.r, rgb.g, rgb.b, 0.5);
      }
    },
  }));

  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectedLiquidRef.current = selectedLiquid; }, [selectedLiquid]);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isAutomatedRef.current = isAutomated; }, [isAutomated]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { onManualGestureRef.current = onManualGesture; }, [onManualGesture]);
  useEffect(() => { onEngineStatusRef.current = onEngineStatus; }, [onEngineStatus]);

  useEffect(() => {
    const currentCount = fluidsRef.current.length;
    const targetCount = settings.layerCount;

    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const fluid = new FluidSimulation(GRID_SIZE, settings.diffusionRate, 0.0001, 0.01);
        fluid.layerIndex = i;
        if (i === 0) {
          // Seed initial preset pattern
          harmonyRef.current = fluid.seedPreset('classic', noise2D);
          presetContractRef.current = PRESET_CONTRACTS['classic'];
        }
        fluidsRef.current.push(fluid);
        rotationAnglesRef.current.push(Math.random() * Math.PI * 2);

        // Allocate GPU texture data buffer for this layer
        if (webGLRef.current) {
          const glr = webGLRef.current;
          const gl = glr.gl;
          // Ensure textures/texData arrays are large enough
          while (glr.textures.length <= i) {
            const tex = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            glr.textures.push(tex);
            glr.texData.push(new Uint8Array(GRID_AREA * 4));
          }
        }
      }
    } else if (currentCount > targetCount) {
      for (const dropped of fluidsRef.current.slice(targetCount)) dropped.dropGpu();
      fluidsRef.current = fluidsRef.current.slice(0, targetCount);
      rotationAnglesRef.current = rotationAnglesRef.current.slice(0, targetCount);
    }
  }, [settings.layerCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL2 initialization ──────────────────────────────────────────
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) { console.error('WebGL2 not supported'); return; }

    // Platform: where this build is running and on what, for the governor's
    // starting guess. The renderer string is the only cheap read of the GPU.
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererString = String(
      (dbgInfo && gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '',
    );
    const tier = detectTier();
    const gpuClass = classifyGpu(rendererString);
    const ladder = qualityLadder(tier, gpuClass);
    governorRef.current = new QualityGovernor(ladder.rungs, ladder.start, performance.now() * 0.001);

    const vertSrc = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

    const fragSrc = `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 auxOut;   // for the camera: normal.xy (biased), dye height, bubble mask

uniform sampler2D u_layer0;
uniform sampler2D u_layer1;
uniform int u_layerCount;
uniform float u_rotation0;
uniform float u_rotation1;
uniform vec2 u_resolution;
uniform float u_gooey;
uniform int u_darkBlend;
uniform int u_blendMode;
uniform int u_ledPlatform;
uniform int u_ledMode;
uniform vec3 u_ledColor;
uniform float u_ledAngle;
uniform float u_time;
uniform float u_glossiness;        // specular intensity, 0 = flat backlit dye
uniform float u_saturation;        // final grade saturation multiplier
uniform float u_boundaryContrast;  // bright interface line between dye colors
uniform float u_edgeRelief;        // meniscus at every blob edge, at any zoom
uniform float u_layerZoom1;        // second layer viewed magnified about the centre
uniform vec2  u_layerDrift1;
uniform vec4  u_bubbles[40];       // x, y, r (fluid uv) and opacity
uniform vec4  u_bubbleShape[40];   // stretch axis × magnitude, wobble amplitude, wobble phase
uniform int   u_bubbleCount;
uniform float u_bubbleStrength;
uniform vec4  u_lamp;              // the projector lamp under the plate: x, y (fluid uv), height, hot-spot strength
uniform vec4  u_lamp2;             // a second lamp from another side, cooler: x, y, height, strength (0 = off)
uniform float u_lightPlay;         // how much the lamp's direction shows on bubbles and dye edges
uniform float u_iridescence;       // thin-film colour running round bubble rims
uniform float u_photo;             // photograph mode: a lit paper backdrop, dye as transmission, domes with a softbox in them
uniform vec3  u_paperA;            // the backdrop's two colours
uniform vec3  u_paperB;
uniform float u_droplets;          // satellite micro-droplets on the glass
uniform float u_thinFilm;          // interference colour where the dye runs thinnest
uniform int   u_cameraOn;          // the camera pass will add its own grain
uniform float u_lumia;             // Wilfred's aurora under the plate
uniform vec3  u_lumiaA;
uniform vec3  u_lumiaB;
uniform float u_gelWheel;          // rotating four-segment gel over the lamp
uniform float u_gelAngle;
uniform vec3  u_gel0; uniform vec3 u_gel1; uniform vec3 u_gel2; uniform vec3 u_gel3;
uniform sampler2D u_film;          // the film projector: a loop or the camera
uniform int   u_filmOn;
uniform float u_filmMix;
uniform float u_filmKey;
uniform vec2  u_filmScale;
uniform float u_lampWarmth;        // halogen grade
uniform float u_kaleido;           // mirror folds (0 = off, else 2/4/6)
uniform float u_dish;              // round-dish vignette strength
uniform float u_exposure;          // plate-wide film exposure
uniform float u_postBlur;          // gooey blur radius multiplier
uniform float u_gridSize;          // fluid sim texture resolution (what we sample)
uniform float u_logicalGrid;       // the 192-cell grid the look was tuned on

// ── Macro closeup camera ──
uniform sampler2D u_vel0;          // layer 0 velocity field (rg, signed, normalized)
uniform sampler2D u_vel1;
uniform vec2  u_camCenter;         // fluid-UV the frame is centred on (0.5,0.5 = plate centre)
uniform float u_camZoom;           // 1 = whole plate, 12 = extreme magnification
uniform float u_macro;             // 0 = off, 1 = macro detail pass enabled
uniform float u_macroCells;        // paint-cell / bubble structure amount
uniform float u_macroCellScale;    // cell size
uniform float u_macroLacing;       // dark lacing filaments along dye boundaries
uniform float u_macroDepth;        // dome shading, contact shadow, depth of field
uniform float u_macroEdge;         // fractal silhouette warp
uniform float u_macroRelief;       // surface relief: per-pixel normals, specular, occlusion
uniform float u_flowRate;          // fluid-UV per second, for advecting procedural detail
uniform float u_filmLevel;         // density below which magnified dye reads as bare ground
uniform float u_filmGain;          // maps the density above that level onto full opacity

const float PI = 3.14159265359;
const float DENSITY_SCALE = 8.0;

// Catmull-Rom bicubic weights
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

// Bicubic texture sampling — smooth C1 upscaling, eliminates grid aliasing
vec4 textureBicubic(sampler2D tex, vec2 uv) {
  vec2 texSize = vec2(u_gridSize);
  vec2 invTex = 1.0 / texSize;
  uv = uv * texSize - 0.5;
  vec2 fxy = fract(uv);
  uv -= fxy;
  vec4 xcubic = cubic(fxy.x);
  vec4 ycubic = cubic(fxy.y);
  vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xcubic.xz + xcubic.yw, ycubic.xz + ycubic.yw);
  vec4 offset = c + vec4(xcubic.yw, ycubic.yw) / s;
  offset *= invTex.xxyy;
  vec4 s0 = texture(tex, offset.xz);
  vec4 s1 = texture(tex, offset.yz);
  vec4 s2 = texture(tex, offset.xw);
  vec4 s3 = texture(tex, offset.yw);
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

// Hash-based film grain
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Decode Beer-Lambert from packed texture
// R/G/B channels store log-space absorptions, A stores total density
// At packing: R=clamp(densityR/8*255), alpha=clamp(density/8*255)
// densityR = -log(r_channel)*density, so r_channel = exp(-densityR/density)
// We store absorption proportional: decoded = raw_channel/255*8 = absorption_value
// Then color = exp(-absorption / totalDensity)
// But we packed R=densityR/8*255 directly, and density=A/255*8
// So: absorption = R/255 * 8, totalDensity = A/255 * 8
// color_channel = exp(-absorption / totalDensity)

// sqrt-encoded in the texture (see packing loop) — squaring on decode gives
// far more precision at low densities, killing banding in smooth gradients
float decodeDensity(float a) {
  return a * a * DENSITY_SCALE;
}

vec4 sampleLayer(sampler2D tex, vec2 uv) {
  return textureBicubic(tex, uv);
}

// UV transform: screen UV -> fluid simulation UV.
// u_camZoom magnifies about u_camCenter, which the macro camera parks on a bead.
vec2 uvToFluid(vec2 uv, float c, float s) {
  vec2 p = (uv - 0.5) * u_resolution;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float scale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  return p / (scale * 128.0 * u_camZoom) + u_camCenter;
}

// Local dye velocity in fluid-UV per second — macro detail rides the paint.
vec2 fluidFlow(sampler2D vtex, vec2 fuv) {
  return (texture(vtex, fuv).rg * 2.0 - 1.0) * u_flowRate;
}

// Approximate Gaussian blur on density alpha in fluid UV space
float blurAlpha(sampler2D tex, vec2 fuv, float blurFluid) {
  // 5x5 Gaussian kernel weights (sigma~1)
  const float w[25] = float[25](
    0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902,
    0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
    0.02193823, 0.09832033, 0.16210282, 0.09832033, 0.02193823,
    0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
    0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902
  );
  float result = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 offset = vec2(float(i), float(j)) * blurFluid;
      float a = textureBicubic(tex, fuv + offset).a;
      result += a * w[(j + 2) * 5 + (i + 2)];
    }
  }
  return result;
}

// Decode fluid color from packed RGBA texture
// Returns (r, g, b, alpha) in linear [0,1]
vec4 decodeFluid(sampler2D tex, vec2 fuv, float blurFluid, bool useBlur) {
  vec4 raw = textureBicubic(tex, fuv);

  float rawAlpha = useBlur ? blurAlpha(tex, fuv, blurFluid) : raw.a;

  float totalDensity = decodeDensity(rawAlpha);
  if (totalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0);

  float absTotalDensity = decodeDensity(raw.a);
  if (absTotalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0, 0.0, 0.0, 0.0);

  // densityR packed as: densityR / 8 * 255 -> R/255 * 8 = densityR
  // color = exp(-densityR / density) = exp(-absorption_per_unit)
  float norm = 1.0 / absTotalDensity;
  float r = exp(-decodeDensity(raw.r) * norm);
  float g = exp(-decodeDensity(raw.g) * norm);
  float b = exp(-decodeDensity(raw.b) * norm);

  // Ink that absorbs every wavelength hides what is behind it far sooner than
  // a transparent dye of the same thickness does. Without this the blacks sit
  // over the lit ground at the same opacity as the yellows and grey out.
  float darkness = 1.0 - max(r, max(g, b));

  // Beer-Lambert volumetric opacity using blurred density for gooey edges.
  // Magnified, only dye thick enough to be a bead should register: below
  // u_filmLevel (tracked per frame from the plate's own density histogram) the
  // wash reads as bare ground, which is what gives a closeup its silhouettes.
  // Plate-wide, u_exposure blends toward the same floor-and-gain so a thin
  // film between ink structures reads as bare glass rather than a grey wash.
  float exposed = max(0.0, totalDensity - u_filmLevel) * u_filmGain;
  float thickness = (u_macro > 0.5
    ? exposed
    : mix(totalDensity * 2.8, exposed, u_exposure)) * (1.0 + darkness * 1.7);
  float alpha = 1.0 - exp(-thickness);
  // Magnified, a bead of ink is opaque; at plate scale the backlight is meant
  // to come through everything, so the old ceiling stays there.
  alpha = min(u_macro > 0.5 ? 0.995 : 0.95, alpha);

  return vec4(r, g, b, alpha);
}

// Sobel normals in fluid UV space
vec3 sobelNormal(sampler2D tex, vec2 fuv) {
  float ts = 3.0 / u_logicalGrid;
  float d00 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts, -ts)).a);
  float d10 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0, -ts)).a);
  float d20 = decodeDensity(textureBicubic(tex, fuv + vec2( ts, -ts)).a);
  float d01 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts, 0.0)).a);
  float d21 = decodeDensity(textureBicubic(tex, fuv + vec2( ts, 0.0)).a);
  float d02 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts,  ts)).a);
  float d12 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0,  ts)).a);
  float d22 = decodeDensity(textureBicubic(tex, fuv + vec2( ts,  ts)).a);
  float gradX = (-d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22) * 0.125;
  float gradY = (-d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22) * 0.125;
  return normalize(vec3(-gradX * 0.9, -gradY * 0.9, 1.0));
}

// ─── The lamp ───────────────────────────────────────────────────────
// One light for every material. A projector lamp sits under the plate at a
// point, so the light reaches each place on the plate from its own
// direction: a bubble to the left of the lamp is lit from its right, one on
// the far side from below. Everything that shades — dye edges, bubbles, the
// macro relief — asks this for its light instead of assuming a fixed sun.
vec3 lampDir(vec2 fuv, vec4 lamp) {
  return normalize(vec3(lamp.xy - fuv, max(0.15, lamp.z)));
}

// The colours of a thin film at thickness t (in cycles): the rim of a bubble,
// the thinnest sheet of oil.
vec3 thinFilm(float t) {
  return 0.5 + 0.5 * cos(6.28318530718 * (t + vec3(0.0, 0.33, 0.67)));
}

// Blinn-Phong + Fresnel shading, gated by u_glossiness.
// At glossiness 0 the dye renders as flat, evenly-lit matte color —
// the projected-light-show look — with no glass-sphere highlight dots.
vec3 applyLighting(vec3 color, vec3 normal, bool darkBlend, vec2 fuv) {
  if (u_glossiness < 0.005) return color;
  vec3 L = lampDir(fuv, u_lamp);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float diffuse = max(0.0, dot(normal, L));
  float specNdotH = max(0.0, dot(normal, H));
  float specular = pow(specNdotH, 48.0) * 0.25;
  float cosTheta = max(0.0, normal.z);
  float f0 = 0.04;
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
  float specularTotal = specular + fresnel * 0.12;

  vec3 lit;
  if (darkBlend) {
    float lf = 0.6 + 0.4 * diffuse;
    lit = color * lf;
  } else {
    float lf = 0.5 + 0.5 * diffuse;
    lit = color * lf + specularTotal;
  }
  return mix(color, lit, u_glossiness);
}

// Bright thin interface line where two distinct dye colors meet —
// fakes the oil-water boundary glow without a multi-fluid solve.
float boundaryEdge(sampler2D tex, vec2 fuv) {
  vec4 cC = decodeFluid(tex, fuv, 0.0, false);
  if (cC.a < 0.03) return 0.0;
  float e = (3.0 / u_logicalGrid) * 0.55;
  vec4 cR = decodeFluid(tex, fuv + vec2( e, 0.0), 0.0, false);
  vec4 cL = decodeFluid(tex, fuv + vec2(-e, 0.0), 0.0, false);
  vec4 cT = decodeFluid(tex, fuv + vec2(0.0,  e), 0.0, false);
  vec4 cB = decodeFluid(tex, fuv + vec2(0.0, -e), 0.0, false);
  // Only count chroma difference where dye exists on both sides (interface,
  // not the outer silhouette of a blob against empty glass).
  float maskX = min(cR.a, cL.a);
  float maskY = min(cT.a, cB.a);
  float diffX = length(cR.rgb - cL.rgb) * smoothstep(0.03, 0.25, maskX);
  float diffY = length(cT.rgb - cB.rgb) * smoothstep(0.03, 0.25, maskY);
  return smoothstep(0.12, 0.75, diffX + diffY);
}

// The meniscus a bead has between two plates: a dark rim where the oil
// curves away from the glass and a bright refracted highlight just inside
// it. The macro pass builds this from a full height field; plate-wide, the
// sobel normal is enough to carry the same read.
vec3 meniscus(vec3 color, vec3 n, float a, vec2 fuv) {
  float rim = clamp((1.0 - n.z) * 6.0, 0.0, 1.0) * smoothstep(0.02, 0.2, a);
  vec3 L = lampDir(fuv, u_lamp);
  // In the photograph the softbox in the dome is the reflection; the
  // meniscus keeps only a pin of it, or every small drop turns into a speck.
  float spec = pow(max(dot(n, L), 0.0), mix(10.0, 24.0, u_photo)) * mix(1.0, 0.3, u_photo);
  // Which way this edge faces, against where the lamp is: the rim toward
  // the lamp glows in the dye's own colour, the rim away from it sits in
  // its own shadow. Straight under the lamp the two sides are the same.
  vec2 nd = n.xy / max(length(n.xy), 1e-4);
  float facing = clamp(dot(nd, L.xy) * 3.0, -1.0, 1.0);
  float play = u_lightPlay;
  vec3 c = color * (1.0 - rim * (0.55 + 0.3 * max(0.0, -facing) * play));
  c += color * rim * max(0.0, facing) * 0.7 * play;
  c += vec3(1.0, 0.98, 0.92) * spec * rim * 1.1;
  if (u_lamp2.w > 0.001) {
    vec3 L2 = lampDir(fuv, u_lamp2);
    float facing2 = clamp(dot(nd, L2.xy) * 3.0, -1.0, 1.0);
    float spec2 = pow(max(dot(n, L2), 0.0), 10.0);
    c += (vec3(0.72, 0.84, 1.0) * spec2 * rim * 1.0 + mix(color, vec3(0.7, 0.85, 1.0), 0.4) * rim * max(0.0, facing2) * 0.6 * play) * u_lamp2.w;
  }
  return mix(color, c, u_edgeRelief);
}

// ─── Macro closeup detail ──────────────────────────────────────────
// At 6-12x magnification the 192-cell solver only supplies the large-scale
// shape of the dye; everything finer is synthesised here, in fluid space, so
// it magnifies with the camera the way real structure would: packed paint
// cells (dark cores in bright rings), lacing filaments dragged along the flow,
// a crinkled silhouette, dome shading and a shallow depth of field.

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  float a = 0.5, sum = 0.0;
  for (int i = 0; i < 3; i++) { sum += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return sum * 1.14;   // ~0..1
}

// Satellite droplets: the hundreds of tiny beads that sit on the glass around
// every drop in a macro photograph. Each cell of a jittered grid holds one
// small lens, shaded like the big bubbles — dim toward the lamp, bright away
// from it, a point of the lamp on its dome.
vec3 microDrops(vec3 c, vec2 p, vec2 lampSide, float ground, float keep) {
  vec2 i = floor(p), f = fract(p);
  vec3 outc = c;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = hash22(i + g);
      if (h.x > keep) continue;
      vec2 centre = g + 0.2 + h * 0.6;
      float rad = 0.10 + hash12(i + g + 7.7) * 0.2;
      vec2 d = (f - centre) / rad;
      float q = dot(d, d);
      if (q > 1.0) continue;
      float rim = smoothstep(0.5, 1.0, q);
      float toward = dot(d / max(sqrt(q), 1e-3), lampSide);
      vec3 dc = c * (1.06 + 0.18 * max(0.0, -toward) * (1.0 - rim));
      dc = mix(dc, c * c * 1.15, rim * (0.5 + 0.35 * max(0.0, toward)));
      vec2 hd = d - lampSide * 0.4;
      dc += vec3(1.0, 0.98, 0.95) * exp(-dot(hd, hd) * 14.0) * (0.25 + 0.4 * ground);
      outc = mix(outc, dc, smoothstep(1.0, 0.85, q));
    }
  }
  return outc;
}


// Surface height across one cell, as a function of the signed distance to its
// edge: the film is thin over the sunken core and piles into a meniscus ridge
// at the rim. Differentiating this along the radial direction gives an exact
// normal — screen-space derivatives of the same field come out blocky, because
// they are evaluated per 2x2 quad over hard-edged masks.
float cellHeight(float d, float rimWidth) {
  float sunk = 1.0 - smoothstep(-rimWidth * 1.6, rimWidth * 0.1, d);
  float ridge = exp(-pow((d - rimWidth * 0.25) / (rimWidth * 1.2), 2.0));
  return ridge * 0.55 - sunk * 0.85;
}

struct Cell {
  float core;   // interior mask
  float rim;    // bright ring, negative just outside (the dark outline)
  float id;     // per-bubble random
  vec2 slope;   // 2D gradient of the cell's surface height
};

// One generation of cells: born, carried along by the dye, dissolved again.
//
// Every cell in the 3x3 neighbourhood is evaluated against its own profile and
// the strongest wins per feature, so each one keeps a complete circular ring
// even where its neighbours crowd it. (Assigning each pixel to its nearest
// centre instead — a plain Voronoi — clips those rings along the cell
// boundaries and turns round cells into polygons.)
//
// Cross-fading two offsets of the *same* pattern would average two distance
// fields into mush, so instead each generation is its own pattern under a
// sin^2 envelope; two generations half a cycle apart sum to exactly 1, giving
// continuous cover with no ghosting and no reset pop.
Cell cellField(vec2 p0, vec2 flow, float seed, float period, float phase, float rimWidth) {
  float a = fract(u_time / period + phase);
  float env = sin(3.14159265 * a);
  env *= env;

  vec2 p = p0 - flow * (a * period);
  vec2 ip = floor(p), fp = fract(p);

  float core = 0.0, bright = 0.0, outline = 0.0, id = 0.0;
  float bestW = -1.0, bestD = 1.0;
  vec2 bestDir = vec2(1.0, 0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(ip + g + seed);
      vec2 c = g + 0.5 + (h - 0.5) * 0.62;
      float r = 0.16 + h.x * 0.22;
      vec2 delta = fp - c;
      float dist = length(delta);
      float d = dist - r;
      if (d > rimWidth * 3.5) continue;                  // nowhere near this cell

      float cr = 1.0 - smoothstep(-rimWidth * 0.8, -rimWidth * 0.15, d);
      float br = 1.0 - smoothstep(rimWidth * 0.35, rimWidth * 1.15, abs(d));
      float ol = 1.0 - smoothstep(rimWidth * 0.5, rimWidth * 1.3, abs(d - rimWidth * 2.0));

      core = max(core, cr);
      bright = max(bright, br);
      outline = max(outline, ol);

      float w = max(cr, br);
      if (w > bestW) { bestW = w; bestD = d; bestDir = delta / max(dist, 1e-4); id = h.y; }
    }
  }

  // Slope only for the cell that owns this pixel — two profile evaluations
  // per generation instead of eighteen.
  float e = rimWidth * 0.35;
  float dh = (cellHeight(bestD + e, rimWidth) - cellHeight(bestD - e, rimWidth)) / (2.0 * e);

  // A bright ring covers the dark outline of whatever it overlaps.
  float rim = bright - outline * 0.7 * (1.0 - bright);
  return Cell(core * env, rim * env, id, bestDir * dh * env);
}

// Crinkle the sampled position so bicubic-smooth silhouettes gain sub-cell
// structure. A uniform drift (never a per-pixel flow offset) keeps it stable.
vec2 macroWarpOffset(vec2 fuv) {
  if (u_macroEdge < 0.005) return vec2(0.0);
  float f = u_logicalGrid * 0.85;
  vec2 t = vec2(u_time * 0.012, u_time * -0.009);
  vec2 w = vec2(fbm3(fuv * f + t), fbm3(fuv * f + vec2(37.2, 11.7) + t)) - 0.5;
  w += (vec2(fbm3(fuv * f * 2.7 + t * 2.0), fbm3(fuv * f * 2.7 + vec2(5.1, 19.3) + t * 2.0)) - 0.5) * 0.45;
  return w * (u_macroEdge * 1.1 / u_logicalGrid);
}

vec2 macroWarp(vec2 fuv) { return fuv + macroWarpOffset(fuv); }

// Decode an already-fetched texel — the defocused path doesn't need bicubic
// filtering or a gooey blur, so it costs 5 plain fetches instead of 5 decodes.
vec4 decodeFluidRaw(vec4 raw) {
  float totalDensity = decodeDensity(raw.a);
  if (totalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0);
  float norm = 1.0 / totalDensity;
  vec3 c = exp(-vec3(decodeDensity(raw.r), decodeDensity(raw.g), decodeDensity(raw.b)) * norm);
  float darkness = 1.0 - max(c.r, max(c.g, c.b));
  float thickness = (u_macro > 0.5 ? max(0.0, totalDensity - u_filmLevel) * u_filmGain : totalDensity * 2.8)
                  * (1.0 + darkness * 1.7);
  return vec4(c, min(u_macro > 0.5 ? 0.995 : 0.95, 1.0 - exp(-thickness)));
}

// 5-tap defocus. The blur radius is constant in screen space, so the
// out-of-focus surround holds still as the camera zooms.
vec4 decodeFluidDof(sampler2D tex, vec2 fuv, float blurFluid, bool useBlur, float dof) {
  if (dof < 0.02) return decodeFluid(tex, fuv, blurFluid, useBlur);
  float r = dof * 0.022 / (1.5 * u_camZoom);
  vec4 raw = (texture(tex, fuv)
            + texture(tex, fuv + vec2(r, 0.0)) + texture(tex, fuv - vec2(r, 0.0))
            + texture(tex, fuv + vec2(0.0, r)) + texture(tex, fuv - vec2(0.0, r))) * 0.2;
  return decodeFluidRaw(raw);
}

// Paint cells, lacing and relief lighting for one layer's decoded dye.
//   grad  — silhouette/interface gradient strength, 0..1
//   dof   — defocus at this pixel, 0..1 (detail dissolves out of focus)
// Returns shaded colour in .rgb and a corrected opacity in .a.
//
// Control flow here is uniform (branches test uniforms only, masks do the
// per-pixel work) because the relief pass takes screen-space derivatives of
// the height field, which are undefined inside divergent branches.
vec4 macroDetail(vec3 col, float alpha, vec2 fuv, vec2 flow, vec3 gridNormal, float grad, float dof) {
  // The silhouette warp is meant to crinkle blob outlines, not to deform the
  // cells themselves — bent circles read as lumps rather than as bubbles.
  vec2 cuv = fuv - macroWarpOffset(fuv) * 0.75;
  float focus = 1.0 - dof * 0.85;
  float paint = smoothstep(0.02, 0.20, alpha);

  // ── Packed cells ────────────────────────────────────────────────
  float core = 0.0, rim = 0.0, fineCore = 0.0, fineRim = 0.0, id = 0.0, k = 0.0;
  vec2 cellSlope = vec2(0.0);
  if (u_macroCells > 0.005) {
    float freq = u_logicalGrid / max(0.15, u_macroCellScale * 8.0);
    vec2 p = cuv * freq;
    vec2 f = flow * freq;

    // Cells cluster in patches, the way pouring medium breaks out unevenly.
    // Larger, higher-contrast patches: a real pour breaks out in cell-covered
    // areas next to smooth ones, rather than pebbling the whole frame evenly.
    float clumping = smoothstep(0.04, 0.26, alpha) * smoothstep(0.26, 0.60, fbm3(cuv * 8.0 + u_time * 0.015));
    k = u_macroCells * focus * clumping;

    // Coarse cells: two generations, half a cycle apart
    Cell g0 = cellField(p, f, 0.0, 3.2, 0.0, 0.13);
    Cell g1 = cellField(p, f, 17.0, 3.2, 0.5, 0.13);
    // Union, not sum: adding two generations' masks welds their circles into
    // compound blobs, while taking the stronger of the two keeps every cell
    // round as it fades in over the one it replaces.
    core = max(g0.core, g1.core);
    rim = max(g0.rim, g1.rim);
    id = g0.core > g1.core ? g0.id : g1.id;

    // Fine cells crowd into the gaps between the big ones, as they do in a
    // real pour, and read as the grain of the film rather than as bubbles.
    Cell h0 = cellField(p * 2.9 + 11.3, f * 2.9, 41.0, 2.1, 0.0, 0.16);
    Cell h1 = cellField(p * 2.9 + 11.3, f * 2.9, 63.0, 2.1, 0.5, 0.16);
    float gap = clamp(1.0 - core * 1.6, 0.0, 1.0);
    fineCore = max(h0.core, h1.core) * gap;
    fineRim = max(h0.rim, h1.rim) * gap;
    cellSlope = (g0.slope + g1.slope) + (h0.slope + h1.slope) * 0.55 * gap;

    vec3 dark = col * 0.03;
    vec3 ring = mix(col, vec3(1.0, 0.94, 0.74), 0.55) * (1.25 + id * 0.6);

    // Cell cores are holes in the film, not a tint over it: darken them the
    // whole way rather than scaling the darkening down with the patch mask.
    col = mix(col, dark, clamp(core + fineCore * 0.55, 0.0, 1.0) * min(1.0, k * 1.6));
    col += ring * clamp(rim * 1.1 + fineRim * 0.5, -0.5, 2.0) * k;
  }

  // ── Lacing — thin dark filaments streaming along the flow ───────
  float lace = 0.0;
  if (u_macroLacing > 0.005) {
    vec2 dir = length(flow) > 1e-5 ? normalize(flow) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 q = vec2(dot(cuv, dir) * u_logicalGrid * 0.35, dot(cuv, nrm) * u_logicalGrid * 3.2);
    float n = fbm3(q + u_time * 0.03) - 0.5;
    float line = 1.0 - smoothstep(0.0, 0.055, abs(n));
    float edgeMask = (0.35 + 0.65 * smoothstep(0.08, 0.45, grad)) * smoothstep(0.04, 0.2, alpha);
    lace = line * edgeMask * u_macroLacing * focus;
    col = mix(col, col * 0.04, lace);
  }

  // ── Relief ──────────────────────────────────────────────────────
  // The surface normal is assembled from three scales: the bead's own dome
  // (from the solver-grid normal), the meniscus of every cell (analytic, from
  // each cell's radial slope) and grooves where the lacing cuts in. Lit, this
  // is what makes the frame read as a wet surface with depth instead of as
  // flat colour.
  if (u_macroRelief > 0.005) {
    float r3 = u_macroRelief;
    vec2 tilt = cellSlope * k * 1.6 + vec2(0.0, lace * 0.6);
    // The grid normal is a gentle slope over many sim cells; scaled up it
    // becomes the dome of the bead, which is what carries the large-scale
    // sense of volume under the cell detail.
    vec3 n = normalize(vec3(gridNormal.xy * 3.2 - tilt * r3, 1.0));

    vec3 L = lampDir(fuv, u_lamp);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float diff = max(0.0, dot(n, L));
    float spec = pow(max(0.0, dot(n, H)), 46.0);
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    // Recessed cores and grooves sit in their own shadow.
    float ao = 1.0 - clamp(core * k * 0.55 + fineCore * k * 0.25 + lace * 0.4, 0.0, 1.0) * 0.45;

    // Centred on ~1.0 for a flat, lit surface, so relief shapes the frame
    // without darkening it overall.
    col *= mix(1.0, (0.55 + 0.9 * diff) * ao, r3 * paint);
    col += vec3(1.0, 0.97, 0.90) * spec * r3 * paint * 0.7;    // wet highlight on the domes
    col += col * fres * r3 * paint * 0.35;                     // bright refracting edge
  }

  // ── Dome shading — thickness across the bead as a whole ─────────
  if (u_macroDepth > 0.005) {
    float belly = smoothstep(0.05, 0.45, alpha);
    col *= mix(1.0, 0.74 + 0.42 * belly, u_macroDepth * 0.8);
  }

  // Ink pooled in a cell core is opaque — let it read as true black rather
  // than as the lit ground showing through.
  float aOut = clamp(alpha + clamp(core * k, 0.0, 1.0) * 0.5 * paint, 0.0, 1.0);
  return vec4(col, aOut);
}

// Blend mode functions
vec3 blendScreen(vec3 a, vec3 b)      { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 blendLighter(vec3 a, vec3 b)     { return max(a, b); }
vec3 blendExclusion(vec3 a, vec3 b)   { return a + b - 2.0 * a * b; }
vec3 blendMultiply(vec3 a, vec3 b)    { return a * b; }
vec3 blendOverlay(vec3 a, vec3 b) {
  return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, b));
}

vec3 applyBlend(vec3 dst, vec3 src, int mode) {
  if (mode == 0) return blendScreen(dst, src);
  if (mode == 1) return blendLighter(dst, src);
  if (mode == 2) return blendExclusion(dst, src);
  if (mode == 3) return blendMultiply(dst, src);
  if (mode == 4) return blendOverlay(dst, src);
  return blendScreen(dst, src);
}

// LED platform analytical conic gradient
vec3 ledColor(float t) {
  // ledMode: 0=single, 1=ocean, 2=fire, 3=cyberpunk, 4=rainbow
  if (u_ledMode == 0) {
    return u_ledColor;
  } else if (u_ledMode == 1) {
    // ocean
    if (t < 0.25) return mix(vec3(0.0,0.0,0.2), vec3(0.0,0.2,0.4), t * 4.0);
    if (t < 0.5)  return mix(vec3(0.0,0.2,0.4), vec3(0.0,0.4,0.6), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0.0,0.4,0.6), vec3(0.0,0.6,0.8), (t - 0.5) * 4.0);
    return mix(vec3(0.0,0.6,0.8), vec3(0.0,0.0,0.2), (t - 0.75) * 4.0);
  } else if (u_ledMode == 2) {
    // fire
    if (t < 0.25) return mix(vec3(0.2,0.0,0.0), vec3(0.8,0.0,0.0), t * 4.0);
    if (t < 0.5)  return mix(vec3(0.8,0.0,0.0), vec3(1.0,0.4,0.0), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(1.0,0.4,0.0), vec3(1.0,0.8,0.0), (t - 0.5) * 4.0);
    return mix(vec3(1.0,0.8,0.0), vec3(0.2,0.0,0.0), (t - 0.75) * 4.0);
  } else if (u_ledMode == 3) {
    // cyberpunk
    if (t < 0.33) return mix(vec3(1.0,0.0,0.235), vec3(0.0,0.94,1.0), t / 0.33);
    if (t < 0.66) return mix(vec3(0.0,0.94,1.0), vec3(0.988,0.933,0.039), (t - 0.33) / 0.33);
    return mix(vec3(0.988,0.933,0.039), vec3(1.0,0.0,0.235), (t - 0.66) / 0.34);
  } else {
    // rainbow
    if (t < 0.16667) return mix(vec3(1,0,0), vec3(1,1,0), t * 6.0);
    if (t < 0.33333) return mix(vec3(1,1,0), vec3(0,1,0), (t - 0.16667) * 6.0);
    if (t < 0.5)     return mix(vec3(0,1,0), vec3(0,1,1), (t - 0.33333) * 6.0);
    if (t < 0.66667) return mix(vec3(0,1,1), vec3(0,0,1), (t - 0.5) * 6.0);
    if (t < 0.83333) return mix(vec3(0,0,1), vec3(1,0,1), (t - 0.66667) * 6.0);
    return mix(vec3(1,0,1), vec3(1,0,0), (t - 0.83333) * 6.0);
  }
}

void main() {
  vec2 uv = v_uv;
  bool darkBlend = u_darkBlend != 0;

  // ── Macro closeup setup ───────────────────────────────────────────
  // Defocus grows away from the frame centre — the shallow depth of field a
  // real macro lens has wide open, and what sells the magnification.
  bool macro = u_macro > 0.5;
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 uvScreen = uv;   // the unfolded frame, for the dish
  // ── Kaleidoscope ─────────────────────────────────────────────────
  // The plate mirrored into wedges — the four-fold dish of the stills, a
  // mirror rig in front of the lens. Fold the angle around the centre so
  // every wedge shows the same piece of plate, seams meeting edge to edge.
  if (u_kaleido >= 2.0) {
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
    float ang = atan(c.y, c.x);
    float rad = length(c);
    float wedge = 6.28318530718 / u_kaleido;
    float a = mod(ang, wedge);
    if (a > wedge * 0.5) a = wedge - a;              // mirror inside the wedge
    a += u_time * 0.02;                              // the rig turns, slowly
    c = vec2(cos(a), sin(a)) * rad * 0.72;           // pull in so the plate's middle fills the wedge
    uv = clamp(c / vec2(aspect, 1.0) + 0.5, 0.001, 0.999);
  }
  float dof = 0.0;
  if (macro) {
    float rad = length((uv - 0.5) * vec2(aspect, 1.0));
    dof = clamp((rad - 0.30) * 1.6, 0.0, 1.0) * u_macroDepth;
  }

  // ── LED Platform background ────────────────────────────────────────
  vec3 bgColor = darkBlend ? vec3(1.0) : vec3(0.0);
  // The photographs are all taken over a lit backdrop — coloured paper under
  // a dish of water — never over black. Two colours across the frame, a
  // little cloud in the join, and the tooth of the paper.
  if (u_photo > 0.5) {
    vec2 pp = uv * vec2(aspect, 1.0);
    float g = smoothstep(-0.15, 1.15, uv.x * 0.55 + uv.y * 0.65 + (fbm3(pp * 2.2 + 3.1) - 0.5) * 0.5 - 0.1);
    bgColor = mix(u_paperA, u_paperB, g) * (0.82 + 0.08 * fbm3(pp * 60.0));   // headroom left for the bloom
  }
  vec2 auxN = vec2(0.0);
  float auxH = 0.0;
  float auxB = 0.0;
  if (u_ledPlatform != 0) {
    vec2 centered = (uv - 0.5) * u_resolution;
    float t = fract(atan(centered.y, centered.x) / (2.0 * PI) + 0.5 + u_ledAngle);
    vec3 lc = ledColor(t);
    // Radial vignette for bevel effect
    float dist = length(centered);
    float maxR = max(u_resolution.x, u_resolution.y) * 0.8;
    float bevel = 1.0 - smoothstep(maxR * 0.5, maxR, dist) * 0.8;
    bgColor = lc * bevel;
  }

  // ── Gel wheel ────────────────────────────────────────────────────
  // Four gels turning over the lamp: each quadrant of the ground takes a
  // colour, with a soft join where one gel gives way to the next.
  if (u_gelWheel > 0.001) {
    vec2 gc = (uv - 0.5) * vec2(aspect, 1.0);
    float ga = fract(atan(gc.y, gc.x) / (2.0 * PI) + u_gelAngle);
    float seg = ga * 4.0;
    int gi = int(floor(seg));
    float gf = fract(seg);
    vec3 g0 = gi == 0 ? u_gel0 : gi == 1 ? u_gel1 : gi == 2 ? u_gel2 : u_gel3;
    vec3 g1 = gi == 0 ? u_gel1 : gi == 1 ? u_gel2 : gi == 2 ? u_gel3 : u_gel0;
    vec3 gel = mix(g0, g1, smoothstep(0.86, 1.0, gf));
    bgColor = mix(bgColor, max(bgColor, vec3(0.10)) * gel * 1.5, u_gelWheel);
  }

  // ── Lumia ────────────────────────────────────────────────────────
  // Wilfred's aurora: a slow, folded height field read as sheets of light,
  // two colours drifting through each other on a scale of minutes.
  if (u_lumia > 0.001) {
    vec2 lp = uv * vec2(aspect, 1.0) * 1.35;
    float lt = u_time * 0.035;
    float h = fbm3(lp + vec2(lt * 0.7, -lt * 0.4)) * 0.6 + fbm3(lp * 2.1 - vec2(lt * 0.3, lt * 0.5)) * 0.4;
    float sheet = pow(abs(sin(h * 9.42 + lt)), 3.0);
    float veil = 0.25 + 0.75 * fbm3(lp * 0.6 + vec2(lt * 0.2, lt * 0.15));
    vec3 lcol = mix(u_lumiaA, u_lumiaB, smoothstep(0.25, 0.75, fbm3(lp * 0.7 + lt)));
    bgColor += lcol * (0.12 + 0.9 * sheet) * veil * u_lumia;
  }

  // ── Gooey blur parameters ─────────────────────────────────────────
  // u_postBlur scales the legacy gooey blur; defaults well below 1.0 so
  // fine turbulent structure survives to the screen.
  float fluidScale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  float blurFluid = u_gooey * u_postBlur * 10.0 / (fluidScale * 128.0);
  bool useBlur = u_gooey * u_postBlur > 0.01;

  // ── Layer 0 ──────────────────────────────────────────────────────
  float c0 = cos(-u_rotation0), s0 = sin(-u_rotation0);
  vec2 fuv0 = uvToFluid(uv, c0, s0);
  vec2 fuvBase = fuv0;   // the plate before any macro warp: where bubbles live
  vec2 flow0 = macro ? fluidFlow(u_vel0, fuv0) : vec2(0.0);
  if (macro) fuv0 = macroWarp(fuv0);
  vec4 fluid0 = decodeFluidDof(u_layer0, fuv0, blurFluid, useBlur, dof);

  // Gooey contrast on alpha
  if (useBlur && fluid0.a > 0.0) {
    float contrast = 1.2 + u_gooey * 4.0;
    float mid = 0.5;
    fluid0.a = clamp((fluid0.a - mid) * contrast + mid, 0.0, 1.0);
  }

  // Lighting — a heavily defocused pixel has no edge detail worth resolving,
  // so skip the 8-tap normal and the interface pass out there.
  bool sharp0 = dof < 0.55;
  vec3 normal0 = sharp0 ? sobelNormal(u_layer0, fuv0) : vec3(0.0, 0.0, 1.0);
  fluid0.rgb = applyLighting(fluid0.rgb, normal0, darkBlend, fuv0);
  if (darkBlend) fluid0.a *= 0.6;

  // Bright interface line where dye colors meet
  if (u_boundaryContrast > 0.005 && fluid0.a > 0.03 && sharp0) {
    float edge0 = boundaryEdge(u_layer0, fuv0);
    fluid0.rgb += fluid0.rgb * edge0 * u_boundaryContrast * 1.6 + vec3(edge0 * u_boundaryContrast * 0.25);
  }
  if (!macro && u_edgeRelief > 0.005 && sharp0) fluid0.rgb = meniscus(fluid0.rgb, normal0, fluid0.a, fuv0);

  if (macro) {
    float grad0 = clamp((1.0 - normal0.z) * 5.0, 0.0, 1.0);
    fluid0 = macroDetail(fluid0.rgb, fluid0.a, fuv0, flow0, normal0, grad0, dof);
  }

  // ── Substrate grain + contact shadow ──────────────────────────────
  // Magnified, the ground under the dye should read as a surface, and the dye
  // should sit *on* it rather than float in front of it.
  if (macro && u_macroDepth > 0.005) {
    float fiber = fbm3(uv * vec2(aspect, 1.0) * 230.0);
    bgColor = bgColor * (0.82 + 0.36 * fiber) + fiber * 0.02 * u_macroDepth;
    // Two offsets — a contact shadow tight to the bead and a softer, wider
    // one behind it. The gap between them is what lifts the paint off the
    // ground instead of leaving it pasted flat onto it.
    float shA = 1.0 - exp(-decodeDensity(textureBicubic(u_layer0, uvToFluid(uv + vec2(0.008, -0.008), c0, s0)).a) * 2.6);
    float shB = 1.0 - exp(-decodeDensity(textureBicubic(u_layer0, uvToFluid(uv + vec2(0.022, -0.022), c0, s0)).a) * 1.6);
    float shadow = clamp(shA * 0.65 + shB * 0.5, 0.0, 1.0);
    bgColor *= mix(1.0, 0.18, shadow * u_macroDepth);
  }

  vec3 outColor = bgColor;
  if (u_photo > 0.5) {
    // Dye as transmission: the paper seen through it, tinted, and the drop
    // itself a dome — a dark meniscus deeper on the side away from the lamp,
    // a thicker middle that absorbs more, the softbox reflected as a bright
    // crescent on the lamp side, and a rim that catches the sky.
    float a = fluid0.a;
    // Transmission proper: the paper times the dye's transmittance. A thin
    // wash therefore vanishes into the paper instead of reading as a pale
    // speck; only a real drop shows, and a little lift keeps it from mud.
    // Dyes in transmission mix subtractively — two of them together go
    // darker, not paler — so the thick middle of a mixed drop deepens.
    vec3 tr = pow(fluid0.rgb, vec3(1.0 + 0.9 * a));
    float trl = dot(tr, vec3(0.299, 0.587, 0.114));
    tr = clamp(mix(vec3(trl), tr, 1.3), 0.0, 1.0);
    vec3 lit = tr * mix(outColor, vec3(1.0), 0.22 * smoothstep(0.1, 0.6, a)) * (1.0 + 0.2 * a);
    outColor = mix(outColor, lit, a);
    vec3 n = normal0;
    vec3 S = lampDir(fuv0, u_lamp);
    vec2 R = 2.0 * n.z * n.xy;
    float sb = smoothstep(0.42, 0.12, abs(R.x - S.x * 0.6)) * smoothstep(0.26, 0.06, abs(R.y - S.y * 0.6));
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    float rimDark = clamp((1.0 - n.z) * 5.0, 0.0, 1.0);
    float facing = clamp(dot(n.xy, S.xy) * 3.0, -1.0, 1.0);
    outColor *= 1.0 - rimDark * a * (0.35 + 0.3 * max(0.0, -facing));
    outColor *= 1.0 - a * a * 0.22;
    outColor += vec3(1.0, 0.98, 0.95) * sb * a * (0.35 + 0.6 * fres);
    outColor += vec3(0.95, 0.97, 1.0) * fres * a * 0.18;
  } else {
    outColor = mix(outColor, fluid0.rgb, fluid0.a);
  }
  auxN = -normal0.xy * fluid0.a;
  auxH = fluid0.a;
  // Where the dye runs thinnest it is a film, and a film has colours of its
  // own: interference bands that follow the thickness.
  if (u_thinFilm > 0.001 && fluid0.a > 0.004 && fluid0.a < 0.4) {
    float thin = smoothstep(0.4, 0.04, fluid0.a) * smoothstep(0.004, 0.03, fluid0.a);
    vec3 film = thinFilm(fluid0.a * 16.0 + fbm3(fuv0 * 26.0) * 1.4 + u_time * 0.02);
    outColor = mix(outColor, outColor * (0.5 + 1.3 * film) + film * 0.08, thin * u_thinFilm * 0.85);
  }

  // ── Layer 1 (if present) ──────────────────────────────────────────
  if (u_layerCount > 1) {
    float c1 = cos(-u_rotation1), s1 = sin(-u_rotation1);
    vec2 fuv1 = uvToFluid(uv, c1, s1);
    // A second projector at a different throw: the layer is viewed magnified
    // about the centre and drifts slowly, so one frame carries two scales.
    if (!macro && u_layerZoom1 > 1.001) fuv1 = (fuv1 - 0.5) / u_layerZoom1 + 0.5 + u_layerDrift1;
    vec2 flow1 = macro ? fluidFlow(u_vel1, fuv1) : vec2(0.0);
    if (macro) fuv1 = macroWarp(fuv1);
    vec4 fluid1 = decodeFluidDof(u_layer1, fuv1, blurFluid, useBlur, dof);

    if (useBlur && fluid1.a > 0.0) {
      float contrast = 1.2 + u_gooey * 4.0;
      float mid = 0.5;
      fluid1.a = clamp((fluid1.a - mid) * contrast + mid, 0.0, 1.0);
    }

    bool sharp1 = dof < 0.55;
    vec3 normal1 = sharp1 ? sobelNormal(u_layer1, fuv1) : vec3(0.0, 0.0, 1.0);
    fluid1.rgb = applyLighting(fluid1.rgb, normal1, darkBlend, fuv1);
    if (darkBlend) fluid1.a *= 0.6;

    if (u_boundaryContrast > 0.005 && fluid1.a > 0.03 && sharp1) {
      float edge1 = boundaryEdge(u_layer1, fuv1);
      fluid1.rgb += fluid1.rgb * edge1 * u_boundaryContrast * 1.6 + vec3(edge1 * u_boundaryContrast * 0.25);
    }
    if (!macro && u_edgeRelief > 0.005 && sharp1) fluid1.rgb = meniscus(fluid1.rgb, normal1, fluid1.a, fuv1);

    if (macro) {
      float grad1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      fluid1 = macroDetail(fluid1.rgb, fluid1.a, fuv1, flow1, normal1, grad1, dof);
    }

    if (u_photo > 0.5) {
      vec3 lit1 = pow(fluid1.rgb, vec3(1.0 + 0.9 * fluid1.a)) * mix(outColor, vec3(1.0), 0.22 * smoothstep(0.1, 0.6, fluid1.a)) * (1.0 + 0.2 * fluid1.a);
      outColor = mix(outColor, lit1, fluid1.a);
      float rim1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      outColor *= 1.0 - rim1 * fluid1.a * 0.4;
      outColor += vec3(0.95, 0.97, 1.0) * pow(1.0 - clamp(normal1.z, 0.0, 1.0), 3.0) * fluid1.a * 0.15;
    } else {
      vec3 blended = applyBlend(outColor, fluid1.rgb, u_blendMode);
      outColor = mix(outColor, blended, fluid1.a);
    }
    auxN = mix(auxN, -normal1.xy, fluid1.a * 0.5);
    auxH = max(auxH, fluid1.a);
  }

  // ── The lamp's hot-spot ──────────────────────────────────────────
  // A projector is not an even backlight: the plate is brightest over the
  // lamp and falls away toward the rim, and where the lamp sits wanders as
  // the plate rocks. A second lamp puts a cooler pool on the other side.
  if (u_lamp.w > 0.001) {
    float dl = length(fuvBase - u_lamp.xy);
    float glow = exp(-dl * dl * 3.5);
    vec3 pool = mix(vec3(1.0), vec3(1.05, 0.98, 0.9), glow * 0.5) * mix(0.78, 1.25, glow);
    outColor *= mix(vec3(1.0), pool, u_lamp.w);
    if (u_lamp2.w > 0.001) {
      float d2 = length(fuvBase - u_lamp2.xy);
      float glow2 = exp(-d2 * d2 * 3.5);
      outColor *= mix(vec3(1.0), mix(vec3(1.0), vec3(0.9, 0.97, 1.12) * 1.25, glow2), u_lamp2.w * u_lamp.w);
    }
  }

  // ── Satellite droplets ───────────────────────────────────────────
  // Two sizes of them, more where the dye is, a few on the bare glass.
  if (u_droplets > 0.001 && !macro) {
    vec3 Ld = lampDir(fuvBase, u_lamp);
    vec2 sideD = Ld.xy / max(length(Ld.xy), 0.06);
    float groundD = dot(outColor, vec3(0.299, 0.587, 0.114));
    float keep = u_droplets * (0.18 + 0.32 * fluid0.a);
    vec3 dropped = microDrops(outColor, fuvBase * u_logicalGrid * 0.55 + 17.0, sideD, groundD, keep);
    dropped = microDrops(dropped, fuvBase * u_logicalGrid * 1.1 + 5.0, sideD, groundD, keep * 0.6);
    outColor = mix(outColor, dropped, min(1.0, u_droplets * 1.5));
  }

  // ── Bubbles ──────────────────────────────────────────────────────
  // One implicit surface for all of them: each bubble contributes a field
  // that falls off with distance in its own stretched, wobbling frame, and
  // the membrane is drawn where the sum crosses one. Two bubbles pulling
  // together therefore neck into each other rather than overlap as circles;
  // the membrane is a thin dark line with a bright refracted edge inside it.
  if (u_bubbleCount > 0 && u_bubbleStrength > 0.001) {
    float field = 0.0;
    float opac = 0.0;
    float best = 0.0;
    float bestRad = 0.01;
    vec2 bestD = vec2(0.0);
    for (int i = 0; i < 40; i++) {
      if (i >= u_bubbleCount) break;
      vec4 bb = u_bubbles[i];
      vec4 sh = u_bubbleShape[i];
      float rad = max(bb.z, 1e-4);
      vec2 d = (fuvBase - bb.xy) / rad;
      if (dot(d, d) > 4.0) continue;
      // Stretch: an ellipse along the drag axis, area-preserving.
      float s = length(sh.xy);
      if (s > 1e-4) {
        vec2 ax = sh.xy / s;
        vec2 loc = vec2(dot(d, ax), dot(d, vec2(-ax.y, ax.x)));
        d = vec2(loc.x / (1.0 + s), loc.y * (1.0 + s));
      }
      // Wobble: second and third shape modes running around the rim.
      float phi = atan(d.y, d.x);
      float rEff = 1.0 + sh.z * (cos(2.0 * phi + sh.w) + 0.55 * cos(3.0 * phi - 1.7 * sh.w));
      float q2 = dot(d, d) / max(rEff * rEff, 0.04);
      float f = 1.0 / max(q2, 1e-4);
      f = f * f;                               // steeper falloff: necks form only when close
      field += f * bb.w;
      opac = max(opac, bb.w * smoothstep(0.25, 1.0, f));
      if (f > best) { best = f; bestD = d; bestRad = rad; }
    }
    if (field > 0.2) {
      // field == 1 on the membrane, larger inside.
      // In every reference the bubble is a lens over the lamp: a bright
      // centre, a thin darker edge that is the dye seen edge-on, and a
      // small highlight. Nothing is drawn as a black line. And the lens is
      // lit from wherever the lamp is: the rim toward the lamp darkens as
      // the light is bent away, the far rim carries the bright caustic arc,
      // the highlight sits on the lamp side of the dome, and the interior
      // shows the plate behind it magnified — so a field of bubbles reads
      // as one light falling across them, not forty stamps.
      float edge = field;
      float membrane = smoothstep(0.86, 1.0, edge) * (1.0 - smoothstep(1.0, 1.22, edge));
      float inside = smoothstep(1.0, 1.3, edge);
      float centre = smoothstep(1.3, 3.0, edge);
      float play = u_lightPlay;
      vec3 Lb = lampDir(fuvBase, u_lamp);
      vec2 lampSide = Lb.xy / max(length(Lb.xy), 0.06);   // unit toward the lamp; shrinks to nothing straight under it
      vec2 nd = normalize(bestD + vec2(1e-5));
      float toward = dot(nd, lampSide);
      float ground = dot(outColor, vec3(0.299, 0.587, 0.114));
      float rimK = mix(0.18, 0.42, smoothstep(0.08, 0.5, ground));
      vec3 c = outColor;
      // The lens: the plate behind, pulled in toward the bubble's centre.
      vec2 lensUv = fuvBase - bestD * bestRad * (0.15 + 0.35 * play);
      vec4 lensF = decodeFluid(u_layer0, lensUv, 0.0, false);
      vec3 lensCol = mix(bgColor, lensF.rgb, lensF.a);
      c = mix(c, lensCol, inside * 0.45 * play);
      c = mix(c, c * 1.18 + 0.06, inside * 0.55 + centre * 0.3);     // the lamp through the lens
      // Shaded as a lens: dimmer toward the lamp, brighter away from it.
      c *= 1.0 - 0.3 * play * max(0.0, toward) * inside + 0.2 * play * max(0.0, -toward) * inside;
      float arcBand = smoothstep(0.78, 1.0, edge) * (1.0 - smoothstep(1.0, 1.4, edge));
      c += (c * 0.9 + 0.16) * arcBand * max(0.0, -toward) * 0.9 * play;          // the caustic arc
      // A little of the plate around the far side sits in the bubble's shadow.
      float halo = smoothstep(0.3, 0.7, edge) * (1.0 - smoothstep(0.7, 0.92, edge));
      c *= 1.0 - halo * max(0.0, -toward) * 0.22 * play;
      c = mix(c, c * c * 1.1, membrane * (rimK + 0.35 * max(0.0, toward) * play));  // the edge, darkest toward the lamp
      // Thin-film colour running round the rim, brighter over bright ground.
      if (u_iridescence > 0.001) {
        vec3 film = thinFilm(edge * 2.2 + atan(bestD.y, bestD.x) * 0.5 + u_time * 0.05);
        c = mix(c, c * (0.55 + 1.2 * film), membrane * u_iridescence * (0.35 + 0.65 * ground));
      }
      // The lamp's own reflection: a small spot on the lamp side of the dome.
      vec2 hd = bestD - lampSide * 0.36;
      float hl = exp(-dot(hd, hd) * 22.0) * inside;
      c += vec3(1.0, 0.98, 0.92) * hl * (0.25 + 0.3 * ground);
      if (u_lamp2.w > 0.001) {
        vec3 L2 = lampDir(fuvBase, u_lamp2);
        vec2 side2 = L2.xy / max(length(L2.xy), 0.06);
        float toward2 = dot(nd, side2);
        c += vec3(0.6, 0.78, 1.0) * (0.15 + ground * 0.5) * arcBand * max(0.0, -toward2) * play * u_lamp2.w;
        vec2 hd2 = bestD - side2 * 0.36;
        c += vec3(0.75, 0.86, 1.0) * exp(-dot(hd2, hd2) * 22.0) * inside * 0.35 * u_lamp2.w;
      }
      outColor = mix(outColor, c, opac * u_bubbleStrength);
      auxN = mix(auxN, -bestD * 0.8, opac * inside);
      auxB = max(auxB, opac * inside);
    }
  }

  // ── Film projector ───────────────────────────────────────────────
  // A loop or the camera projected through the dye: keyed on its own
  // brightness, refracted by the dye's surface and tinted where the dye is.
  if (u_filmOn != 0 && u_filmMix > 0.001) {
    vec2 fuvF = (uv - 0.5) * u_filmScale + 0.5 + normal0.xy * 0.03 * fluid0.a;
    vec3 film = texture(u_film, vec2(fuvF.x, 1.0 - fuvF.y)).rgb;
    float fl = dot(film, vec3(0.299, 0.587, 0.114));
    float key = smoothstep(u_filmKey, u_filmKey + 0.18, fl);
    vec3 tinted = film * mix(vec3(1.0), fluid0.rgb * 1.5, fluid0.a * 0.8);
    outColor = mix(outColor, outColor * 0.35 + tinted * 0.95, key * u_filmMix);
  }

  // ── Lamp warmth ──────────────────────────────────────────────────
  // A halogen lamp through a sealed wheel: warm, and darker toward the rim.
  if (u_lampWarmth > 0.001) {
    vec2 vc = (uv - 0.5) * vec2(aspect, 1.0);
    float vig = 1.0 - smoothstep(0.45, 1.05, length(vc) * 1.25) * 0.45;
    outColor = mix(outColor, outColor * vec3(1.06, 0.9, 0.7) * vig, u_lampWarmth);
  }

  // ── The dish ─────────────────────────────────────────────────────
  // A round clock face projected whole: black beyond the rim, and the rim
  // itself a thin bright line where the glass edge catches the lamp.
  if (u_dish > 0.001) {
    vec2 dc = (uvScreen - 0.5) * vec2(aspect, 1.0);
    float dr = length(dc) / 0.5;
    float rimR = mix(1.9, 0.98, u_dish);
    float inside = 1.0 - smoothstep(rimR - 0.015, rimR + 0.01, dr);
    float rim = smoothstep(rimR - 0.035, rimR - 0.01, dr) * (1.0 - smoothstep(rimR - 0.005, rimR + 0.012, dr));
    float shade = 1.0 - smoothstep(rimR * 0.55, rimR, dr) * 0.35 * u_dish;
    outColor = outColor * inside * shade + vec3(0.9, 0.85, 0.7) * rim * 0.35 * u_dish;
  }

  // ── Saturation grade ──────────────────────────────────────────────
  float luma = dot(outColor, vec3(0.299, 0.587, 0.114));
  outColor = clamp(mix(vec3(luma), outColor, u_saturation), 0.0, 1.0);

  // ── Film grain ────────────────────────────────────────────────────
  // Grain scaled by brightness — a fixed offset on near-black pixels is a grey
  // haze, which is exactly what washes the ink out.
  float grainLuma = dot(outColor, vec3(0.299, 0.587, 0.114));
  // ...and the dark frames stay black: grain fades out almost entirely
  // below the shadows, so a dim plate reads as depth rather than fog.
  float grain = (hash(v_uv * u_resolution + fract(u_time * 47.3)) - 0.5) * 0.03
              * (0.05 + 0.95 * smoothstep(0.03, 0.4, grainLuma));
  if (u_cameraOn == 0) outColor = clamp(outColor + grain, 0.0, 1.0);

  fragColor = vec4(outColor, 1.0);
  auxOut = vec4(clamp(auxN, -1.0, 1.0) * 0.5 + 0.5, auxH, auxB);
}`;

    const compileShader = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vert = compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    // Full-screen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Create textures for existing layers + 2 slots minimum
    const maxLayers = Math.max(2, fluidsRef.current.length);
    const textures: WebGLTexture[] = [];
    const texData: Uint8Array[] = [];
    for (let i = 0; i < maxLayers; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Initialize with empty texture
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRID_SIZE, GRID_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      textures.push(tex);
      texData.push(new Uint8Array(GRID_AREA * 4));
    }

    // Velocity fields for the two composited layers — bound to units 6/7 and
    // only refreshed while the macro camera is running.
    const velTextures: WebGLTexture[] = [];
    const velData: Uint8Array[] = [];
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GRID_SIZE, GRID_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      velTextures.push(tex);
      velData.push(new Uint8Array(GRID_AREA * 4).fill(128)); // 128 = zero velocity
    }

    // Collect uniform locations
    const uniformNames = [
      'u_layer0','u_layer1','u_layerCount','u_rotation0','u_rotation1',
      'u_resolution','u_gooey','u_darkBlend','u_blendMode',
      'u_ledPlatform','u_ledMode','u_ledColor','u_ledAngle','u_time',
      'u_glossiness','u_saturation','u_boundaryContrast','u_postBlur','u_gridSize',
      'u_vel0','u_vel1','u_camCenter','u_camZoom','u_macro','u_macroCells',
      'u_macroCellScale','u_macroLacing','u_macroDepth','u_macroEdge','u_macroRelief','u_flowRate',
      'u_filmLevel','u_filmGain','u_logicalGrid',
      'u_edgeRelief','u_layerZoom1','u_layerDrift1','u_bubbles','u_bubbleShape','u_bubbleCount','u_bubbleStrength',
      'u_lumia','u_lumiaA','u_lumiaB','u_gelWheel','u_gelAngle','u_gel0','u_gel1','u_gel2','u_gel3',
      'u_film','u_filmOn','u_filmMix','u_filmKey','u_filmScale','u_lampWarmth','u_exposure',
      'u_kaleido','u_dish','u_lamp','u_lamp2','u_lightPlay','u_iridescence',
      'u_photo','u_paperA','u_paperB','u_droplets','u_thinFilm','u_cameraOn',
    ];
    const uLocs: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uLocs[name] = gl.getUniformLocation(program, name);
    }

    const filmTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, filmTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    webGLRef.current = {
      gl, program, vao, posBuffer, textures, texData, velTextures, velData, uLocs,
      packFbos: new Map(), texSizes: new Map(),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      filmTexture,
    };

    const resize = () => {
      // Device pixels per CSS pixel is a quality rung, so a Retina laptop
      // running locally renders sharp and a struggling one drops to 1x.
      const dpr = dprRef.current;
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    // ── Mouse / touch handlers ─────────────────────────────────────
    const getTransformedMousePos = (clientX: number, clientY: number, rect: DOMRect) => {
      const cxp = clientX - rect.left - rect.width / 2;
      const cyp = -(clientY - rect.top - rect.height / 2); // WebGL UV y=0 is bottom, CSS y=0 is top
      const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE;
      const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
      const rx = cxp * Math.cos(-angle) - cyp * Math.sin(-angle);
      const ry = cxp * Math.sin(-angle) + cyp * Math.cos(-angle);
      // Mirror the shader's camera transform so the brush lands under the
      // cursor at any magnification.
      const shot = macroShotRef.current;
      const z = Math.max(0.0001, shot.zoom);
      let fx = rx / (scale * z) + shot.cx * GRID_SIZE;
      let fy = ry / (scale * z) + shot.cy * GRID_SIZE;
      // The second layer is viewed through its own zoom and drift.
      const view = layer1ViewRef.current;
      if (activeLayerRef.current === 1 && shot.zoom <= 1.0001 && view.zoom > 1.001) {
        fx = ((fx / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dx) * GRID_SIZE;
        fy = ((fy / GRID_SIZE - 0.5) / view.zoom + 0.5 + view.dy) * GRID_SIZE;
      }
      return { x: Math.floor(fx), y: Math.floor(fy) };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y } = getTransformedMousePos(e.clientX, e.clientY, rect);
      lastMousePosRef.current = { ...mousePosRef.current };
      mousePosRef.current = { x, y };
      const activeFluid = fluidsRef.current[activeLayerRef.current];
      if (!activeFluid) return;
      if (x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
        activeFluid.applySquish(x, y, 8, 0.005);
        const angle = rotationAnglesRef.current[activeLayerRef.current] || 0;
        const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE * Math.max(0.0001, macroShotRef.current.zoom);
        const mx = (e.movementX * Math.cos(-angle) - e.movementY * Math.sin(-angle)) / scale * 5;
        const my = (e.movementX * Math.sin(-angle) + e.movementY * Math.cos(-angle)) / scale * 5;
        activeFluid.addVelocity(x, y, mx, my);
      }
    };

    const handleMouseDown = () => { isMouseDownRef.current = true; };
    const handleMouseUp = () => { isMouseDownRef.current = false; };

    const handleTouchStart = (e: TouchEvent) => {
      isMouseDownRef.current = true;
      if (e.touches[0]) {
        const rect = canvas.getBoundingClientRect();
        mousePosRef.current = getTransformedMousePos(e.touches[0].clientX, e.touches[0].clientY, rect);
      }
    };
    const handleTouchEnd = () => { isMouseDownRef.current = false; };
    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      const { x, y } = getTransformedMousePos(e.touches[0].clientX, e.touches[0].clientY, rect);
      mousePosRef.current = { x, y };
      const activeFluid = fluidsRef.current[activeLayerRef.current];
      if (activeFluid && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
        activeFluid.applySquish(x, y, 8, 0.005);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchmove', handleTouchMove);

    // ── Main render loop ──────────────────────────────────────────
    let animationFrameId: number;

    const render = () => {
      const workStart = performance.now();
      let frameS = 0;
      const currentAudioData = audioDataRef.current;
      const currentSettings = settingsRef.current;
      const glr = webGLRef.current;

      if (fluidsRef.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const now = Date.now() * 0.001;
        const realDt = now - lastTimeRef.current;
        lastTimeRef.current = now;
        frameS = realDt;
        // One verdict per frame on whether this is a kick: from the beat
        // clock when it is locked (ahead of the microphone), else from the
        // onset as heard. Every reaction below reads this instead of its own
        // threshold crossing, so they all land together.
        {
          const bassNow = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
          const trust = isActiveRef.current && currentAudioData ? Math.max(0, Math.min(1, currentSettings.beatPrediction ?? 0)) : 0;
          kickRef.current = beatClockRef.current.update(performance.now(), bassNow, trust, Math.max(0, currentSettings.beatLead ?? 0));
        }

        // Dynamic speed — settings only, never audio energy (prevents clock-driven jumps)
        let dynamicSpeed = 0.05;
        dynamicSpeed += currentSettings.platePressure * 0.02;
        dynamicSpeed += currentSettings.airVelocity * 0.01;
        dynamicSpeed += currentSettings.automateRate * 0.01;
        let speedMultiplier = currentSettings.globalSpeed / 0.05;
        if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
        dynamicSpeed *= speedMultiplier;
        const timeMultiplier = dynamicSpeed * 20.0;

        if (isActiveRef.current) {
          simulationTimeRef.current += realDt * timeMultiplier;
        }
        const time = simulationTimeRef.current;

        // How many solver steps this frame owes, from wall-clock time. When a
        // step is already most of a frame, catching up would only turn one
        // slow frame into a run of them — better to let the show run a little
        // slow than to stutter.
        const catchUp = simMsRef.current > 10 ? 1 : simMsRef.current > 6 ? Math.min(2, SIM_MAX_CATCHUP) : SIM_MAX_CATCHUP;
        simAccumRef.current = Math.min(simAccumRef.current + realDt, SIM_STEP * catchUp);
        const simSteps = Math.floor(simAccumRef.current / SIM_STEP);
        simAccumRef.current -= simSteps * SIM_STEP;

        // ── Drain animation ────────────────────────────────────
        if (drainTrigger > lastDrainTrigger.current) {
          lastDrainTrigger.current = drainTrigger;
          drainFrameRef.current = 1;
          macroCamRef.current.reset();
          bubblesRef.current.clear();
          harmonyRef.current = harmonyLockRef.current ?? (presetContractRef.current ? harmonyFromContract(presetContractRef.current, (currentSettings.hueJourney ?? 0) > 0) : pickHarmony()); // fresh palette after drain
        }
        if (drainFrameRef.current > 0) {
          const DRAIN_FRAMES = 50;
          const frame = drainFrameRef.current;
          const t = frame / DRAIN_FRAMES;
          const pull = Math.pow(t, 0.4) * 4.0;
          const dcx = GRID_SIZE / 2, dcy = GRID_SIZE / 2;

          for (const af of fluidsRef.current) {
            if (af.gpu) { af.gpu.drainStep(t); continue; }

            // 1. Set drain velocity field (inward spiral)
            for (let j = 1; j < GRID_SIZE - 1; j++) {
              for (let i = 1; i < GRID_SIZE - 1; i++) {
                const idx = i + j * GRID_SIZE;
                const dx = dcx - i, dy = dcy - j;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const inward = pull * (1 + dist / 50);
                const swirl = pull * 0.7 * (1 - t * 0.5);
                af.vx[idx] = (dx / dist) * inward + (-dy / dist) * swirl;
                af.vy[idx] = (dy / dist) * inward + ( dx / dist) * swirl;
              }
            }

            // 2. Semi-lagrangian advection (backtrace through drain velocity)
            af.s.set(af.density);
            af.sR.set(af.densityR);
            af.sG.set(af.densityG);
            af.sB.set(af.densityB);

            for (let j = 1; j < GRID_SIZE - 1; j++) {
              for (let i = 1; i < GRID_SIZE - 1; i++) {
                const idx = i + j * GRID_SIZE;
                const srcX = Math.max(1, Math.min(GRID_SIZE - 2, i - af.vx[idx] * 0.3));
                const srcY = Math.max(1, Math.min(GRID_SIZE - 2, j - af.vy[idx] * 0.3));
                const i0 = Math.floor(srcX), j0 = Math.floor(srcY);
                const i1 = Math.min(GRID_SIZE - 2, i0 + 1), j1 = Math.min(GRID_SIZE - 2, j0 + 1);
                const sx = srcX - i0, sy = srcY - j0;
                const w00 = (1 - sx) * (1 - sy), w10 = sx * (1 - sy), w01 = (1 - sx) * sy, w11 = sx * sy;
                const idx00 = i0 + j0 * GRID_SIZE, idx10 = i1 + j0 * GRID_SIZE;
                const idx01 = i0 + j1 * GRID_SIZE, idx11 = i1 + j1 * GRID_SIZE;
                af.density[idx]  = af.s[idx00]  * w00 + af.s[idx10]  * w10 + af.s[idx01]  * w01 + af.s[idx11]  * w11;
                af.densityR[idx] = af.sR[idx00] * w00 + af.sR[idx10] * w10 + af.sR[idx01] * w01 + af.sR[idx11] * w11;
                af.densityG[idx] = af.sG[idx00] * w00 + af.sG[idx10] * w10 + af.sG[idx01] * w01 + af.sG[idx11] * w11;
                af.densityB[idx] = af.sB[idx00] * w00 + af.sB[idx10] * w10 + af.sB[idx01] * w01 + af.sB[idx11] * w11;
              }
            }

            // 3. Evaporate
            const evapRate = 0.03 + t * t * 0.35;
            for (let idx = 0; idx < GRID_AREA; idx++) {
              af.density[idx]  *= (1 - evapRate);
              af.densityR[idx] *= (1 - evapRate);
              af.densityG[idx] *= (1 - evapRate);
              af.densityB[idx] *= (1 - evapRate);
            }
          }

          drainFrameRef.current += Math.max(1, simSteps);
          if (drainFrameRef.current > DRAIN_FRAMES) {
            for (const af of fluidsRef.current) af.clearAll();
            drainFrameRef.current = 0;
          }
        }

        // ── Clear trigger ──────────────────────────────────────
        if (clearTrigger > lastClearTrigger.current) {
          lastClearTrigger.current = clearTrigger;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af) af.clearAll();
          if (activeLayerRef.current === 0) bubblesRef.current.clear();
        }

        // ── Solver engine ──────────────────────────────────────
        // The GPU solver runs the same scheme at 2-4x the grid; the CPU solver
        // stays as the fallback for contexts without float render targets.
        const governor = governorRef.current!;
        const governed = currentSettings.simResolution === undefined || currentSettings.simResolution === 'auto';
        const wantDpr = governed ? governor.rung.dpr : 1;
        if (wantDpr !== dprRef.current) {
          dprRef.current = wantDpr;
          resize();
        }
        const wantRes = glr ? resolveSimResolution(currentSettings.simResolution, governor, glr.maxTexture) : 0;
        for (const fluid of fluidsRef.current) {
          if (wantRes > 0 && glr && gpuSupportedRef.current !== false) {
            if (!fluid.gpu || fluid.gpu.N !== wantRes) {
              try {
                if (gpuSupportedRef.current === null) gpuSupportedRef.current = GpuFluid.isSupported(glr.gl);
                if (gpuSupportedRef.current) fluid.attachGpu(new GpuFluid(glr.gl, wantRes, GRID_SIZE));
              } catch (err) {
                console.warn('ChromaGlass: GPU fluid solver unavailable, using the CPU solver.', err);
                gpuSupportedRef.current = false;
                fluid.dropGpu();
              }
            }
          } else if (fluid.gpu) {
            fluid.detachGpu();
          }
        }
        {
          const lead = fluidsRef.current[0];
          const gpuUnavailable = wantRes > 0 && gpuSupportedRef.current === false;
          const status: EngineStatus = {
            label: lead?.gpu
              ? `GPU · ${lead.gpu.N}² · ${dprRef.current.toFixed(1)}x`
              : `CPU · ${GRID_SIZE}²${gpuUnavailable ? ' · GPU unavailable' : ''}`,
            engine: lead?.gpu ? 'gpu' : 'cpu',
            grid: lead?.gpu ? lead.gpu.N : GRID_SIZE,
            dpr: dprRef.current,
            tier, gpu: gpuClass,
            governed,
            steppedDown: governed && governor.steppedDown,
            gpuUnavailable,
            frameMs: governor.frameMs,
          };
          const prev = engineStatusRef.current;
          // The label changes rarely; the frame time ticks over once a second.
          if (!prev || prev.label !== status.label || prev.steppedDown !== status.steppedDown || now - engineStatusAtRef.current > 1) {
            engineStatusRef.current = status;
            engineStatusAtRef.current = now;
            onEngineStatusRef.current?.(status);
          }
        }

        // ── Chemistry ─────────────────────────────────────────
        // Boyle's bench: a reaction-diffusion field grows coral and cells in
        // place and deposits dye where it is active; the flow then carries the
        // dye off while the pattern keeps growing underneath.
        {
          const chemAmt = Math.max(0, Math.min(1, currentSettings.chemistry ?? 0));
          const lead = fluidsRef.current[0];
          if (chemAmt > 0 && lead && isActiveRef.current && drainFrameRef.current === 0) {
            const chem = chemRef.current;
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            if ((bass01 > 0.5 && Math.random() < 0.12) || Math.random() < 0.004 * (isAutomatedRef.current ? 2 : 1)) {
              chem.seed(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 2 + Math.random() * 3);
            }
            // The dividing regime grows at a pace a show can watch; coral is slower than a set.
            chem.step(Math.max(1, Math.min(10, Math.round(simSteps * 2.5))), 0.042, 0.062);
            const v = chem.activator;
            const c = harmonyCycle(harmonyRef.current, time * 0.08);
            const amount = chemAmt * 0.02 * Math.max(1, simSteps);
            for (let y = 1; y < GRID_SIZE - 1; y++) {
              for (let x = 1; x < GRID_SIZE - 1; x++) {
                const a = v[x + y * GRID_SIZE];
                if (a > 0.22) lead.addDensity(x, y, amount * (a - 0.22), c.r, c.g, c.b);
              }
            }
          }
        }

        // ── Fixed-timestep phase ───────────────────────────────
        // Injection and the solver share one loop so dye-per-second, air
        // bursts and beat rings stay constant whatever the frame rate is.
        for (let simStep = 0; simStep < simSteps; simStep++) {
          // ── Manual injection ───────────────────────────────────
          if (isMouseDownRef.current && drainFrameRef.current === 0) {
            const { x, y } = mousePosRef.current;
            const af = fluidsRef.current[activeLayerRef.current];
            if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
              const tool = activeToolRef.current;
              const liq = selectedLiquidRef.current;
              const rgb = hexToRgb(liq?.color ?? '#ffffff');
              const heat = liq?.heatAmount ?? 0.05;
              // Whatever lands on the lead plate lands on its bubbles too:
              // dye bursts the one under it and shoves the rest, air shoves.
              if (activeLayerRef.current === 0 && (currentSettings.bubbles ?? 0) > 0) {
                bubblesRef.current.disturb(x, y, (tool === 'blow' ? 5 : tool === 'spray' ? 6 : 3) * GRID_SCALE, tool === 'blow' ? 'air' : 'dye');
              }

              // Feed the performance recorder (~15 Hz while painting)
              if (onManualGestureRef.current && gestureFrameRef.current++ % 4 === 0) {
                const gmx = mousePosRef.current.x - (lastMousePosRef.current?.x ?? x);
                const gmy = mousePosRef.current.y - (lastMousePosRef.current?.y ?? y);
                const gLen = Math.sqrt(gmx * gmx + gmy * gmy) || 1;
                onManualGestureRef.current({
                  tool,
                  x: x / GRID_SIZE,
                  y: y / GRID_SIZE,
                  dx: gmx / gLen,
                  dy: gmy / gLen,
                  color: tool === 'blow' ? undefined : (liq?.color ?? '#ffffff'),
                });
              }

              if (tool === 'blow') {
                af.blowAir(x, y, 4, 0.06);
                if (activeLayerRef.current === 0 && (currentSettings.bubbles ?? 0) > 0 && gestureFrameRef.current % 6 === 0) {
                  bubblesRef.current.spawn(x, y, 1.2 * GRID_SCALE, 2, 3 * GRID_SCALE);
                }

              } else if (tool === 'spray') {
                // Wide cone of fine mist — many small random particles in a radius
                const sprayR = 10 * GRID_SCALE;
                for (let p = 0; p < 12; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const dist = Math.random() * sprayR;
                  const px = Math.floor(x + Math.cos(angle) * dist);
                  const py = Math.floor(y + Math.sin(angle) * dist);
                  if (px < 1 || px >= GRID_SIZE - 1 || py < 1 || py >= GRID_SIZE - 1) continue;
                  const w = (1 - dist / sprayR) * 0.4;
                  af.addDensity(px, py, w, rgb.r, rgb.g, rgb.b);
                  if (heat > 0) af.addTemp(px, py, heat * w * 0.3);
                }

              } else if (tool === 'splatter') {
                // Fling droplets outward from cursor — random sizes, random directions
                for (let p = 0; p < 5; p++) {
                  const angle = Math.random() * Math.PI * 2;
                  const flingDist = (3 + Math.random() * 15) * GRID_SCALE;
                  const px = Math.floor(x + Math.cos(angle) * flingDist);
                  const py = Math.floor(y + Math.sin(angle) * flingDist);
                  if (px < 2 || px >= GRID_SIZE - 2 || py < 2 || py >= GRID_SIZE - 2) continue;
                  const dropR = Math.round((1 + Math.floor(Math.random() * 3)) * GRID_SCALE);
                  const amt = 1.0 + Math.random() * 1.5;
                  for (let ddy = -dropR; ddy <= dropR; ddy++) {
                    for (let ddx = -dropR; ddx <= dropR; ddx++) {
                      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                      if (dd > dropR) continue;
                      const nx = px + ddx, ny = py + ddy;
                      if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                      const w = (1 - dd / dropR);
                      af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    }
                  }
                  // Fling velocity outward
                  af.addVelocity(px, py, Math.cos(angle) * 0.5, Math.sin(angle) * 0.5);
                }

              } else if (tool === 'pour') {
                // Heavy thick stream — wide, dense, with downward velocity
                const pourR = Math.round(4 * GRID_SCALE);
                const amt = 2.0;
                for (let ddy = -pourR; ddy <= pourR; ddy++) {
                  for (let ddx = -pourR; ddx <= pourR; ddx++) {
                    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dd > pourR) continue;
                    const nx = x + ddx, ny = y + ddy;
                    if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                    const w = (1 - dd / pourR) ** 1.5;
                    af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    af.addVelocity(nx, ny, 0, 0.12 * w); // downward gravity
                    if (heat > 0) af.addTemp(nx, ny, heat * w);
                  }
                }

              } else if (tool === 'streak') {
                // Thin high-velocity smear along mouse movement direction
                const mvx = mousePosRef.current.x - (lastMousePosRef.current?.x ?? x);
                const mvy = mousePosRef.current.y - (lastMousePosRef.current?.y ?? y);
                const mvLen = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
                const streakLen = Math.min(12 * GRID_SCALE, Math.max(3, mvLen * 2));
                const nx_dir = mvx / mvLen, ny_dir = mvy / mvLen;
                for (let t = -streakLen; t <= streakLen; t += 0.8) {
                  const sx = Math.floor(x + nx_dir * t);
                  const sy = Math.floor(y + ny_dir * t);
                  if (sx < 1 || sx >= GRID_SIZE - 1 || sy < 1 || sy >= GRID_SIZE - 1) continue;
                  const w = 1.0 - Math.abs(t) / streakLen;
                  af.addDensity(sx, sy, 0.6 * w, rgb.r, rgb.g, rgb.b);
                  af.addVelocity(sx, sy, nx_dir * 0.3 * w, ny_dir * 0.3 * w);
                }

              } else {
                // dropper (default)
                const r = Math.round((liq?.injectRadius ?? 3) * GRID_SCALE);
                const amt = liq?.injectAmount ?? 0.8;
                for (let dy = -r; dy <= r; dy++) {
                  for (let dx = -r; dx <= r; dx++) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                    const w = (1 - dist / r) ** 2;
                    af.addDensity(nx, ny, amt * w, rgb.r, rgb.g, rgb.b);
                    if (heat > 0) af.addTemp(nx, ny, heat * w);
                  }
                }
              }
            }
          }

          // ── Automation logic ───────────────────────────────────
          if (isAutomatedRef.current && isActiveRef.current && drainFrameRef.current === 0) {
            const rate = currentSettings.automateRate || 0.5;
            const energy = currentAudioData ? currentAudioData.energy : 0;
            const trebleBoost = currentAudioData ? currentAudioData.treble / 255 : 0;
            const spectralCentroid = currentAudioData ? currentAudioData.spectralCentroid : 0;

            if (Math.random() < rate * 0.3 + energy * 0.8) {
              const af = fluidsRef.current[Math.floor(Math.random() * fluidsRef.current.length)];
              if (af) {
                const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const isBlow = Math.random() > 0.75 - (spectralCentroid / 128) * 0.4;
                if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0) {
                  bubblesRef.current.disturb(rx, ry, (isBlow ? 5 : 4) * GRID_SCALE, isBlow ? 'air' : 'dye', 0.8);
                }
                if (isBlow) {
                  af.blowAir(rx, ry, 2 + Math.floor(energy * 3), 0.08 + energy * 0.18);
                  if (af === fluidsRef.current[0] && (currentSettings.bubbles ?? 0) > 0 && Math.random() < 0.25 + (currentSettings.bubbles ?? 0) * 0.4
                      && bubblesRef.current.bubbles.length < 6 + Math.round(24 * (currentSettings.bubbles ?? 0))) {
                    bubblesRef.current.spawn(rx, ry, (1.0 + energy * 1.5) * GRID_SCALE, 2 + Math.floor(Math.random() * 3), 4 * GRID_SCALE);
                  }
                } else {
                  const color = harmonyColor(harmonyRef.current);
                  const styles = injectStyleRef.current;
                  const style = styles[Math.floor(Math.random() * styles.length)];
                  af.autoInject(style, rx, ry, 6.0 + energy * 35, color.r, color.g, color.b, energy);
                  af.addTemp(rx, ry, 0.8 + trebleBoost * 5);
                }
              }
            }

            // The hue journey: a set drifts its colours over minutes, one dye
            // draining as the next arrives, never a jump. With the journey off
            // the old behaviour stays — a random re-pick every ~45 s.
            const journeyMin = currentSettings.hueJourney ?? 0;
            if (!harmonyLockRef.current) {
              if (journeyMin > 0) {
                const j = journeyRef.current;
                if (j.lastAt < 0) j.lastAt = time;
                if (time - j.lastAt >= journeyMin * 60) {
                  j.lastAt = time;
                  j.lead += 1;
                  const contract = presetContractRef.current;
                  harmonyRef.current = contract ? harmonyFromContract(contract, true) : pickHarmony();
                }
              } else if (Math.random() < 0.0004) {
                harmonyRef.current = presetContractRef.current ? harmonyFromContract(presetContractRef.current, false) : pickHarmony();
              }
            }

          }

          // ── Seed trigger ───────────────────────────────────────
          if (seedCount > lastSeedCount.current && drainFrameRef.current === 0) {
            lastSeedCount.current = seedCount;
            macroCamRef.current.reset();
            harmonyRef.current = harmonyLockRef.current ?? pickHarmony();
            const styles = injectStyleRef.current;
            for (const fluid of fluidsRef.current) {
              for (let i = 0; i < 8; i++) {
                const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                const color = harmonyColor(harmonyRef.current);
                const style = styles[Math.floor(Math.random() * styles.length)];
                fluid.autoInject(style, rx, ry, 10.0, color.r, color.g, color.b, 0.5);
                fluid.addTemp(rx, ry, 2.0);
              }
            }
          }

          if (isActiveRef.current && drainFrameRef.current === 0) {
            // ── Ambient seeding ────────────────────────────────
            const af = fluidsRef.current[activeLayerRef.current];
            if (af) {
              // Three Lissajous orbits, each carrying its own harmony color —
              // keeps several distinct hues alive in the frame at all times.
              const phase = time * 0.18;
              const injPts = [
                { x: GRID_SIZE / 2 + Math.cos(phase) * GRID_SIZE * 0.28,
                  y: GRID_SIZE / 2 + Math.sin(phase * 1.3) * GRID_SIZE * 0.28 },
                { x: GRID_SIZE / 2 + Math.cos(phase * 0.7 + Math.PI) * GRID_SIZE * 0.3,
                  y: GRID_SIZE / 2 + Math.sin(phase * 0.9 + 1.0) * GRID_SIZE * 0.3 },
                { x: GRID_SIZE / 2 + Math.cos(phase * 1.1 + 2.1) * GRID_SIZE * 0.22,
                  y: GRID_SIZE / 2 + Math.sin(phase * 0.6 + 4.2) * GRID_SIZE * 0.33 },
              ];

              injPts.forEach((pt, idx) => {
                const px = Math.floor(pt.x), py = Math.floor(pt.y);
                if (px > 0 && px < GRID_SIZE - 1 && py > 0 && py < GRID_SIZE - 1) {
                  const c = harmonyCycle(harmonyRef.current, time * 0.25 + idx * 1.4);
                  af.addDensity(px, py, 0.05, c.r, c.g, c.b);
                  af.addTemp(px, py, 0.02);
                }
              });

            }

            // ── Audio input to fluid ──────────────────────────────
            if (currentAudioData && currentSettings.audioMappings) {
              const densityMod = getAudioValue(currentAudioData, currentSettings.audioMappings.density as AudioFeatureKey);
              const colorMod   = getAudioValue(currentAudioData, currentSettings.audioMappings.color as AudioFeatureKey);

              const impact = currentSettings.audioImpact ?? 0.45;
              if (impact > 0.01 && currentAudioData.volume > 3 && densityMod > 0.005) {
                // Each audio feature carries a different color from the harmony,
                // so bass, mids and swells paint distinguishable hues.
                const colFor = (off: number) => harmonyCycle(harmonyRef.current, time * 0.3 + colorMod * Math.PI + off);
                const audioCol = colFor(0);
                const ar_a = audioCol.r, ag_a = audioCol.g, ab_a = audioCol.b;

                const activeFluid = fluidsRef.current[activeLayerRef.current];
                if (activeFluid) {
                  const bass01   = Math.min(1, currentAudioData.bass   / 70);
                  const treble01 = Math.min(1, currentAudioData.treble / 70);
                  const energy01 = Math.min(1, currentAudioData.energy / 70);
                  const mid01    = Math.min(1, currentAudioData.mid    / 70);

                  // audioImpact (0–1) controls visual punch; auto mode adds extra multiplier
                  // At impact=0.45 (default) + no auto → ~1.0x baseline
                  // At impact=1.0 + auto → ~4.9x baseline
                  const impactMul = (currentSettings.audioImpact ?? 0.45) / 0.45;
                  const autoAmp = impactMul * (isAutomatedRef.current ? 2.2 : 1.0);

                  const centerX = Math.floor(GRID_SIZE / 2);
                  const centerY = Math.floor(GRID_SIZE / 2);
                  const aStyles = injectStyleRef.current;
                  const aStyle = () => aStyles[Math.floor(Math.random() * aStyles.length)];

                  // Center pulse — scales with density mapping
                  activeFluid.autoInject(aStyle(), centerX, centerY, densityMod * 0.025 * autoAmp, ar_a, ag_a, ab_a, densityMod);
                  activeFluid.addTemp(centerX, centerY, densityMod * 0.018 * autoAmp);

                  // Bass hit: radial velocity burst — scales with impact + auto mode
                  if (bass01 > 0.25) {
                    const burstR = Math.round((isAutomatedRef.current ? 28 : 18) * GRID_SCALE * Math.max(0.4, impactMul));
                    const bassStr = (bass01 - 0.25) * autoAmp;
                    for (let bj = -burstR; bj <= burstR; bj += 3) {
                      for (let bi = -burstR; bi <= burstR; bi += 3) {
                        const dist = Math.sqrt(bi * bi + bj * bj);
                        if (dist < 2 || dist > burstR) continue;
                        const bx = centerX + bi, by = centerY + bj;
                        if (bx > 0 && bx < GRID_SIZE - 1 && by > 0 && by < GRID_SIZE - 1) {
                          const f = bassStr * 0.65 * (1 - dist / burstR);
                          activeFluid.addVelocity(bx, by, (bi / dist) * f, (bj / dist) * f);
                        }
                      }
                    }
                    if (isAutomatedRef.current && bass01 > 0.4) {
                      activeFluid.autoInject(aStyle(), centerX, centerY, bass01 * 0.8, ar_a, ag_a, ab_a, bass01);
                      activeFluid.addTemp(centerX, centerY, bass01 * 0.5);
                    }
                  }

                  // Beat edge: a fresh-colored ring of dye blooms outward on each
                  // kick so bass hits are visible in COLOR, not just motion
                  if (kickRef.current.kick && simStep === 0) {
                    const ringCol = colFor(2.0);
                    const ringR = (10 + bass01 * 14) * GRID_SCALE;
                    const drops = 14;
                    for (let d = 0; d < drops; d++) {
                      const a = (d / drops) * Math.PI * 2 + time;
                      const rx2 = Math.floor(centerX + Math.cos(a) * ringR);
                      const ry2 = Math.floor(centerY + Math.sin(a) * ringR);
                      if (rx2 > 1 && rx2 < GRID_SIZE - 2 && ry2 > 1 && ry2 < GRID_SIZE - 2) {
                        activeFluid.addDensity(rx2, ry2, bass01 * 1.1 * impactMul, ringCol.r, ringCol.g, ringCol.b);
                        activeFluid.addVelocity(rx2, ry2, Math.cos(a) * 0.25 * bass01, Math.sin(a) * 0.25 * bass01);
                      }
                    }
                  }
                  lastBass01Ref.current = bass01;

                  // Mid: orbital injection in its own hue
                  if (mid01 > 0.2) {
                    const midCol = colFor(1.3);
                    const orbitR = GRID_SIZE * 0.3;
                    const mx = Math.floor(centerX + Math.cos(time * 0.6) * orbitR);
                    const my = Math.floor(centerY + Math.sin(time * 0.8) * orbitR);
                    if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
                      activeFluid.autoInject(aStyle(), mx, my, mid01 * 0.06 * autoAmp, midCol.r, midCol.g, midCol.b, mid01);
                      activeFluid.addTemp(mx, my, mid01 * 0.025 * autoAmp);
                    }
                  }

                  // Treble: scattered sparks — heat plus tiny bright dye specks
                  // so high frequencies glitter instead of acting invisibly
                  if (treble01 > 0.2) {
                    const sparkCol = colFor(3.1);
                    // Fewer, larger droplets: a cloud of one-cell specks blurs
                    // into fog, a handful of real drops stays drops.
                    const sparks = Math.floor(treble01 * (isAutomatedRef.current ? 4 : 2) * impactMul);
                    for (let s = 0; s < sparks; s++) {
                      const sx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                      const sy = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                      activeFluid.addTemp(sx, sy, treble01 * 0.6 * autoAmp);
                      for (let ddy = -1; ddy <= 1; ddy++) {
                        for (let ddx = -1; ddx <= 1; ddx++) {
                          const w = ddx === 0 && ddy === 0 ? 1.0 : 0.45;
                          activeFluid.addDensity(sx + ddx, sy + ddy, treble01 * 1.1 * w,
                            sparkCol.r * 0.5 + 0.5, sparkCol.g * 0.5 + 0.5, sparkCol.b * 0.5 + 0.5);
                        }
                      }
                    }
                  }

                  // Energy: roaming swell in a third hue
                  if (energy01 > 0.15) {
                    const swellCol = colFor(2.6);
                    const ex = Math.floor(centerX + Math.cos(time * 0.4) * GRID_SIZE * 0.25);
                    const ey = Math.floor(centerY + Math.sin(time * 0.3) * GRID_SIZE * 0.25);
                    activeFluid.autoInject(aStyle(), ex, ey, energy01 * 0.06 * autoAmp, swellCol.r, swellCol.g, swellCol.b, energy01);
                    if (isAutomatedRef.current) {
                      const ex2 = Math.floor(centerX + Math.cos(time * 0.4 + Math.PI) * GRID_SIZE * 0.22);
                      const ey2 = Math.floor(centerY + Math.sin(time * 0.3 + Math.PI) * GRID_SIZE * 0.22);
                      activeFluid.autoInject(aStyle(), ex2, ey2, energy01 * 0.05, swellCol.r, swellCol.g, swellCol.b, energy01);
                    }
                  }
                }
              }
            }
          }


          // ── Rock the plate ─────────────────────────────────────
          // A hand on the clock face: the beat tips the whole plate one way
          // and a damped spring rocks it back, so the field sloshes instead
          // of only churning. Between beats a slow sway keeps it alive.
          {
            const rock = rockRef.current;
            const R = Math.max(0, Math.min(1, currentSettings.plateRock ?? 0));
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            const kickStep = kickRef.current.kick && simStep === 0;
            if (R > 0 && kickStep) {
              rock.vx += Math.cos(rock.phase) * bass01 * 7 * R;
              rock.vy += Math.sin(rock.phase) * bass01 * 7 * R;
              rock.phase += 2.4;   // successive kicks go different ways
            }
            // The rhythm plate: on a kick the projectionist presses the top
            // glass and the dye spreads out in a ring, then relaxes back.
            const squeezeAmt = Math.max(0, Math.min(1, currentSettings.beatSqueeze ?? 0));
            if (squeezeAmt > 0 && kickStep && isActiveRef.current && drainFrameRef.current === 0) {
              const leadPlate = fluidsRef.current[0];
              if (leadPlate) {
                const cx = GRID_SIZE / 2 + (Math.random() - 0.5) * 30 * GRID_SCALE;
                const cy = GRID_SIZE / 2 + (Math.random() - 0.5) * 30 * GRID_SCALE;
                // Three nested discs make a rough dome, so the dye spreads
                // from the middle instead of only at one hard ring.
                const a = 0.0012 * squeezeAmt * bass01;
                leadPlate.applySquish(cx, cy, 40, a);
                leadPlate.applySquish(cx, cy, 27, a);
                leadPlate.applySquish(cx, cy, 15, a);
              }
            }
            const w = 2 * Math.PI * 0.9, z = 0.22;
            const ax = -w * w * rock.x - 2 * z * w * rock.vx;
            const ay = -w * w * rock.y - 2 * z * w * rock.vy;
            rock.vx += ax * SIM_STEP; rock.vy += ay * SIM_STEP;
            rock.x += rock.vx * SIM_STEP; rock.y += rock.vy * SIM_STEP;
            const swayX = noise2D(time * 0.11, 3.7) * 0.35 * R;
            const swayY = noise2D(7.1, time * 0.09) * 0.35 * R;
            // A phone held by the projectionist: its tilt is the plate's, fading
            // out a couple of seconds after the last reading if the link drops.
            const ext = externalTiltRef.current;
            const extAge = performance.now() * 0.001 - ext.at;
            const extK = extAge < 2.5 ? 1 - Math.max(0, extAge - 1.5) : 0;
            const tiltX = (rock.x + swayX) * 0.004 * R + ext.x * 0.0045 * extK;
            const tiltY = (rock.y + swayY) * 0.004 * R + ext.y * 0.0045 * extK;
            for (const fluid of fluidsRef.current) { fluid.tiltX = tiltX; fluid.tiltY = tiltY; }

            // ── Bubbles ─────────────────────────────────────────
            const bubbleAmt = Math.max(0, Math.min(1, currentSettings.bubbles ?? 0));
            const bubbles = bubblesRef.current;
            if (bubbleAmt <= 0) {
              if (bubbles.bubbles.length) bubbles.clear();
            } else if (isActiveRef.current && drainFrameRef.current === 0) {
              // A few bubbles at a time, not a foam: one on a kick (usually),
              // the odd extra under sustained bass, and none once the plate
              // already carries as many as the setting allows.
              // Air lives in the oil: a kick releases a few small bubbles into
              // the densest dye near the ring, where they gather into the packed
              // fields the references show, rather than one lens on bare glass.
              const room = bubbles.bubbles.length < 6 + Math.round(24 * bubbleAmt);
              const onset = kickStep;
              if (currentAudioData && room && ((onset && Math.random() < 0.8 * bubbleAmt) || (bass01 > 0.5 && Math.random() < 0.006 * bubbleAmt))) {
                const dens = fluidsRef.current[0]?.readDensity;
                let bx = GRID_SIZE / 2, by = GRID_SIZE / 2, best = -1;
                for (let t = 0; t < 6; t++) {
                  const a = Math.random() * Math.PI * 2, rr = (6 + Math.random() * 40) * GRID_SCALE;
                  const px = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr), py = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
                  const d = dens ? dens[Math.max(0, Math.min(GRID_SIZE - 1, px)) + Math.max(0, Math.min(GRID_SIZE - 1, py)) * GRID_SIZE] : 0;
                  if (d > best) { best = d; bx = px; by = py; }
                }
                bubbles.spawn(bx, by, (0.9 + bass01 * 1.2) * GRID_SCALE, 2 + Math.floor(Math.random() * 3), 3 * GRID_SCALE);
              }
              const lead = fluidsRef.current[0];
              const vx = lead?.readVx, vy = lead?.readVy;
              const treble01 = currentAudioData ? Math.min(1, currentAudioData.treble / 70) : 0;
              bubbles.step(SIM_STEP, (bx, by) => {
                if (!vx || !vy) return [0, 0];
                const ix = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx)));
                const iy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by)));
                return [vx[ix + iy * GRID_SIZE], vy[ix + iy * GRID_SIZE]];
              }, tiltX, tiltY, 0.5 + bubbleAmt, treble01 * 0.6);
              // A bubble is air between the plates: the dye cannot sit under
              // it. A standing squeeze on each footprint keeps pumping the
              // dye out to the rim, so the field flows round the bubbles
              // instead of sliding underneath them as if they were painted on.
              if (lead) {
                for (const b of bubbles.bubbles) {
                  if (b.r < 1.2) continue;
                  const bx = Math.round(b.x), by = Math.round(b.y);
                  if (bx > 2 && by > 2 && bx < GRID_SIZE - 3 && by < GRID_SIZE - 3) lead.applySquish(bx, by, Math.max(1, b.r * 0.85 / GRID_SCALE), 0.0035);
                }
              }
              // A pop is a puff of air into the dye where the bubble was.
              for (const ev of bubbles.events) {
                if (ev.kind === 'pop' && lead) {
                  const px = Math.round(ev.x), py = Math.round(ev.y);
                  if (px > 2 && py > 2 && px < GRID_SIZE - 3 && py < GRID_SIZE - 3) lead.blowAir(px, py, Math.max(2, Math.round(ev.r / GRID_SCALE)), 0.035);
                }
              }
            }
            rock.lastBass = bass01;
          }

          // ── Advance the solver ───────────────────────────────
          if (isActiveRef.current && drainFrameRef.current === 0) {
            const t0 = performance.now();
            for (const fluid of fluidsRef.current) fluid.step(currentSettings, currentAudioData, time, noise2D);
            const ms = performance.now() - t0;
            simMsRef.current += (ms - simMsRef.current) * 0.3;
          }
        }

        // GPU fields come back to the CPU once per frame for the readers below
        for (const fluid of fluidsRef.current) fluid.syncFromGpu();

        // ── Housekeeping & rotation (once per rendered frame) ──
        let hasContent = false;
        const isDarkBlend = currentSettings.blendMode === 'multiply';

        for (let l = 0; l < fluidsRef.current.length; l++) {
          const fluid = fluidsRef.current[l];

          // Check if there's content
          for (let i = 0; i < GRID_AREA; i++) {
            if (fluid.readDensity[i] > 0.001) { hasContent = true; break; }
          }

          // Emergency seeding
          if (!hasContent && time % 5 < 0.02 && l === 0 && drainFrameRef.current === 0) {
            const color = harmonyColor(harmonyRef.current);
            fluid.addDensity(GRID_SIZE / 2, GRID_SIZE / 2, 5.0, color.r, color.g, color.b);
          }

          // Update rotation angles
          if (isActiveRef.current) {
            let rotationMod = 0;
            let dirMod = l % 2 === 0 ? 1 : -1;

            if (currentAudioData && currentSettings.audioMappings) {
              const mappedFeature = currentSettings.audioMappings.rotation;
              if (mappedFeature !== 'none') {
                const mappedSpeed = getAudioValue(currentAudioData, mappedFeature as AudioFeatureKey);
                const layerFeatures = [
                  getAudioValue(currentAudioData, 'timbre'),
                  getAudioValue(currentAudioData, 'complexity'),
                  getAudioValue(currentAudioData, 'energy'),
                  getAudioValue(currentAudioData, 'treble'),
                ];
                const layerFeature = layerFeatures[l % layerFeatures.length];
                rotationMod = mappedSpeed * 0.04 + layerFeature * 0.03;
                const sway = (layerFeature - 0.4) * 3.0;
                dirMod = (l % 2 === 0 ? 1 : -1) * 0.4 + sway;
              }
            }

            // Use realDt only — never timeMultiplier, which spikes with audio energy
            const rotationSpeed = currentSettings.rotationSpeed * 0.01 + Math.abs(rotationMod) * 0.3;
            rotationAnglesRef.current[l] += rotationSpeed * dirMod * realDt;
          }
        }

        // ── Macro camera ──────────────────────────────────────
        // Locks the frame onto one bead of dye. Off, this stays at the plate-wide
        // framing (centre 0.5,0.5 at zoom 1) and costs nothing.
        const macroOn = currentSettings.macroMode === true;
        if (macroOn !== lastMacroOnRef.current) {
          lastMacroOnRef.current = macroOn;
          if (macroOn) macroCamRef.current.reset();   // pick a fresh subject on switch-on
        }
        if (macroOn && fluidsRef.current.length > 0) {
          if (isActiveRef.current && drainFrameRef.current === 0) {
            const subject = fluidsRef.current[activeLayerRef.current] ?? fluidsRef.current[0];
            const maxDim = Math.max(canvas.width, canvas.height) * 1.5;
            const camBass = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            macroShotRef.current = macroCamRef.current.update(
              { density: subject.readDensity, vx: subject.readVx, vy: subject.readVy, size: GRID_SIZE },
              realDt,
              {
                zoom: Math.max(1, currentSettings.macroZoom ?? 6),
                chase: currentSettings.macroChase ?? 0.6,
                hold: Math.max(0.5, currentSettings.macroHold ?? 5),
                floor: filmLevelRef.current,
                energy: currentAudioData ? Math.min(1, currentAudioData.energy) : 0,
                sync: currentSettings.macroSync ?? 0,
                bass: camBass,
                beat: kickRef.current.kick,
                treble: currentAudioData ? Math.min(1, currentAudioData.treble / 70) : 0,
                spanX: canvas.width / maxDim,
                spanY: canvas.height / maxDim,
              },
            );
            camBassRef.current = camBass;
          }
        } else {
          macroShotRef.current = { cx: 0.5, cy: 0.5, zoom: 1, whip: 0 };
        }
        const shot = macroShotRef.current;

        // ── Macro film exposure ───────────────────────────────────
        // The solver spreads dye into a wash whose absolute density depends on
        // the preset, the audio and how long it has been running. A closeup
        // needs a *subject*, so read the plate's own density histogram each
        // frame and expose for it: everything under the level where the top
        // fifth of the plate begins renders as bare ground, and the range
        // above it is stretched to full opacity. Slewed, so exposure drifts
        // rather than pumping.
        if ((macroOn || (currentSettings.exposure ?? 0) > 0.001) && fluidsRef.current.length > 0) {
          const f0 = fluidsRef.current[activeLayerRef.current] ?? fluidsRef.current[0];
          const bins = filmHistRef.current;
          bins.fill(0);
          let samples = 0;
          for (let j = 1; j < GRID_SIZE - 1; j += 3) {
            for (let i = 1; i < GRID_SIZE - 1; i += 3) {
              const d = f0.readDensity[i + j * GRID_SIZE];
              const b = d <= 0 ? 0 : Math.min(FILM_BINS - 1, (d * FILM_BIN_SCALE) | 0);
              bins[b]++;
              samples++;
            }
          }
          // Walk down from the densest bin to the paint/ground split and to a
          // near-peak level, and derive the exposure from the two.
          const paintCount = samples * 0.14;
          const peakCount = samples * 0.03;
          let acc = 0, levelBin = 0, peakBin = FILM_BINS - 1;
          for (let b = FILM_BINS - 1; b >= 0; b--) {
            acc += bins[b];
            if (acc >= peakCount && peakBin === FILM_BINS - 1) peakBin = b;
            if (acc >= paintCount) { levelBin = b; break; }
          }
          const level = levelBin / FILM_BIN_SCALE;
          // Floor the spread: a nearly flat histogram would otherwise produce a
          // huge gain and a hard-edged, binary-looking frame.
          const peak = Math.max(level + 0.35, peakBin / FILM_BIN_SCALE);
          const slew = 1 - Math.exp(-2.5 * Math.min(0.25, realDt));
          filmLevelRef.current += (level - filmLevelRef.current) * slew;
          filmGainRef.current += (3.2 / (peak - level) - filmGainRef.current) * slew;
        }

        // ── WebGL GPU render ──────────────────────────────────
        if (glr) {
          const { gl: glCtx, program: prog, vao: vaoObj, textures: texs, texData: tData, uLocs } = glr;

          // Expand texture arrays if layer count increased
          while (texs.length < fluidsRef.current.length) {
            const tex = glCtx.createTexture()!;
            glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
            glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
            glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
            glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
            glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
            glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, GRID_SIZE, GRID_SIZE, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, null);
            texs.push(tex);
            tData.push(new Uint8Array(GRID_AREA * 4));
          }

          // ── Velocity range for the macro detail pass ──────────
          // Encoded against the frame's own peak speed so slow and fast
          // passages both resolve; u_flowRate converts back to fluid-UV per
          // second in the shader.
          let flowRate = 0;
          let velRange = 1e-3;
          if (macroOn) {
            const probe = fluidsRef.current[0];
            const pvx = probe.readVx, pvy = probe.readVy;
            for (let j = 2; j < GRID_SIZE - 2; j += 4) {
              for (let i = 2; i < GRID_SIZE - 2; i += 4) {
                const idx = i + j * GRID_SIZE;
                const ax = Math.abs(pvx[idx]), ay = Math.abs(pvy[idx]);
                if (ax > velRange) velRange = ax;
                if (ay > velRange) velRange = ay;
              }
            }
            // cells advected per second = v * (dt * (N-2)) / N / realDt
            const frameDt = Math.max(1 / 240, Math.min(0.2, realDt));
            flowRate = velRange * (fluidsRef.current[0].dt * (GRID_SIZE - 2)) / GRID_SIZE / frameDt;
          }

          // An RGBA8 texture at the given edge, with a framebuffer so the GPU
          // solver can render into it. Reallocates when the resolution changes.
          const ensureRenderTarget = (tex: WebGLTexture, size: number): WebGLFramebuffer => {
            if (glr.texSizes.get(tex) !== size) {
              glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
              glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, size, size, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, null);
              glr.texSizes.set(tex, size);
            }
            let fbo = glr.packFbos.get(tex);
            if (!fbo) {
              fbo = glCtx.createFramebuffer()!;
              glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, fbo);
              glCtx.framebufferTexture2D(glCtx.FRAMEBUFFER, glCtx.COLOR_ATTACHMENT0, glCtx.TEXTURE_2D, tex, 0);
              glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
              glr.packFbos.set(tex, fbo);
            }
            return fbo;
          };

          // ── Pack each layer into the renderer's textures ───────
          const inv8 = 1 / 8.0;
          const encode = 127.5 / velRange;
          for (let l = 0; l < fluidsRef.current.length; l++) {
            const fluid = fluidsRef.current[l];
            const wantVel = macroOn && l < 2;

            if (fluid.gpu) {
              // The field never leaves the GPU: sqrt-encode straight into the
              // layer texture, and the velocity texture when macro needs it.
              const layerFbo = ensureRenderTarget(texs[l], fluid.gpu.N);
              const velFbo = wantVel ? ensureRenderTarget(glr.velTextures[l], fluid.gpu.N) : null;
              fluid.gpu.packInto(layerFbo, velFbo, velRange);
            } else {
              // CPU path: sqrt-encoded for extra precision at low densities
              // (the shader squares on decode). Kills banding.
              const td = tData[l];
              for (let i = 0; i < GRID_AREA; i++) {
                const i4 = i * 4;
                td[i4]     = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityR[i]) * inv8) * 255 + 0.5));
                td[i4 + 1] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityG[i]) * inv8) * 255 + 0.5));
                td[i4 + 2] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityB[i]) * inv8) * 255 + 0.5));
                td[i4 + 3] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.density[i])  * inv8) * 255 + 0.5));
              }
              glCtx.bindTexture(glCtx.TEXTURE_2D, texs[l]);
              glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, GRID_SIZE, GRID_SIZE, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, td);
              glr.texSizes.set(texs[l], GRID_SIZE);

              if (wantVel) {
                const vd = glr.velData[l];
                for (let i = 0; i < GRID_AREA; i++) {
                  const i4 = i * 4;
                  vd[i4]     = Math.max(0, Math.min(255, 127.5 + fluid.vx[i] * encode));
                  vd[i4 + 1] = Math.max(0, Math.min(255, 127.5 + fluid.vy[i] * encode));
                }
                glCtx.bindTexture(glCtx.TEXTURE_2D, glr.velTextures[l]);
                glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, GRID_SIZE, GRID_SIZE, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, vd);
                glr.texSizes.set(glr.velTextures[l], GRID_SIZE);
              }
            }

          }

          // Bind the renderer's samplers only once every layer is packed: the
          // GPU solver's pack pass uses unit 0 for its own source texture, so
          // packing layer 1 would otherwise unbind layer 0 from the unit the
          // renderer reads it from.
          for (let l = 0; l < fluidsRef.current.length; l++) {
            glCtx.activeTexture(glCtx.TEXTURE0 + l);
            glCtx.bindTexture(glCtx.TEXTURE_2D, texs[l]);
            if (macroOn && l < 2) {
              glCtx.activeTexture(glCtx.TEXTURE6 + l);
              glCtx.bindTexture(glCtx.TEXTURE_2D, glr.velTextures[l]);
            }
          }

          // The film projector's frame, if one is playing.
          let filmOn = 0;
          let filmScaleX = 1, filmScaleY = 1;
          {
            const f = filmRef.current;
            const v = f.video;
            if (f.kind !== 'none' && v && v.readyState >= 2 && v.videoWidth > 0) {
              glCtx.activeTexture(glCtx.TEXTURE8);
              glCtx.bindTexture(glCtx.TEXTURE_2D, glr.filmTexture);
              glCtx.pixelStorei(glCtx.UNPACK_FLIP_Y_WEBGL, false);
              glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, v);
              filmOn = 1;
              // Cover-fit: crop whichever axis the frame has too much of.
              const va = v.videoWidth / v.videoHeight, ca = canvas.width / canvas.height;
              if (va > ca) filmScaleX = ca / va; else filmScaleY = va / ca;
            }
          }

          // Set uniforms and draw
          glCtx.useProgram(prog);
          glCtx.bindVertexArray(vaoObj);

          glCtx.uniform1i(uLocs['u_layer0'], 0);
          glCtx.uniform1i(uLocs['u_layer1'], 1);
          glCtx.uniform1i(uLocs['u_layerCount'], fluidsRef.current.length);
          glCtx.uniform1f(uLocs['u_rotation0'], rotationAnglesRef.current[0] ?? 0);
          glCtx.uniform1f(uLocs['u_rotation1'], rotationAnglesRef.current[1] ?? 0);
          glCtx.uniform2f(uLocs['u_resolution'], canvas.width, canvas.height);
          glCtx.uniform1f(uLocs['u_gooey'], currentSettings.gooeyEffect ?? 0);
          glCtx.uniform1i(uLocs['u_darkBlend'], isDarkBlend ? 1 : 0);

          // Map blend mode string to int: screen=0, lighter=1, exclusion=2, multiply=3, overlay=4
          const blendModeMap: Record<string, number> = {
            'screen': 0, 'lighter': 1, 'exclusion': 2, 'multiply': 3, 'overlay': 4,
          };
          glCtx.uniform1i(uLocs['u_blendMode'], blendModeMap[currentSettings.blendMode] ?? 0);

          glCtx.uniform1i(uLocs['u_ledPlatform'], currentSettings.ledPlatform ? 1 : 0);
          const ledModeMap: Record<string, number> = { 'single': 0, 'ocean': 1, 'fire': 2, 'cyberpunk': 3, 'rainbow': 4 };
          glCtx.uniform1i(uLocs['u_ledMode'], ledModeMap[currentSettings.ledMode] ?? 0);

          // Parse ledColor hex to vec3
          const lcRgb = hexToRgb(currentSettings.ledColor ?? '#ffffff');
          glCtx.uniform3f(uLocs['u_ledColor'], lcRgb.r, lcRgb.g, lcRgb.b);

          const ledAngle = time * (currentSettings.ledSpeed ?? 1) * 0.5 / (2 * Math.PI);
          glCtx.uniform1f(uLocs['u_ledAngle'], ledAngle);
          glCtx.uniform1f(uLocs['u_time'], time);
          glCtx.uniform1f(uLocs['u_glossiness'], currentSettings.glossiness ?? 0);
          glCtx.uniform1f(uLocs['u_saturation'], currentSettings.saturationBoost ?? 1.35);
          glCtx.uniform1f(uLocs['u_boundaryContrast'], currentSettings.boundaryContrast ?? 0.35);
          glCtx.uniform1f(uLocs['u_edgeRelief'], currentSettings.edgeRelief ?? 0);
          glCtx.uniform1f(uLocs['u_exposure'], Math.max(0, Math.min(1, currentSettings.exposure ?? 0)));
          glCtx.uniform1f(uLocs['u_lampWarmth'], Math.max(0, Math.min(1, currentSettings.lampWarmth ?? 0)));
          {
            const k = Math.round(currentSettings.kaleidoscope ?? 0);
            glCtx.uniform1f(uLocs['u_kaleido'], k >= 2 ? Math.min(12, k) : 0);
          }
          glCtx.uniform1f(uLocs['u_dish'], Math.max(0, Math.min(1, currentSettings.dishVignette ?? 0)));
          {
            // The lamp wanders slowly under the plate, and the plate's own
            // rock moves it too — a tilted plate is lit from a new side.
            const motion = Math.max(0, Math.min(1, currentSettings.lampMotion ?? 0));
            const rock = rockRef.current;
            const lamp = lampRef.current;
            const rockK = Math.max(0, Math.min(1, currentSettings.plateRock ?? 0));
            lamp.x = 0.5 + noise2D(time * 0.021, 11.3) * 0.34 * motion + rock.x * 0.05 * rockK;
            lamp.y = 0.5 + noise2D(13.7, time * 0.017) * 0.34 * motion + rock.y * 0.05 * rockK;
            lamp.x2 = 0.5 - (lamp.x - 0.5) * 0.7 + noise2D(time * 0.019, 27.1) * 0.3 * motion;
            lamp.y2 = 0.5 - (lamp.y - 0.5) * 0.7 + noise2D(29.3, time * 0.023) * 0.3 * motion;
            glCtx.uniform4f(uLocs['u_lamp'], lamp.x, lamp.y, 0.55, Math.max(0, Math.min(1, currentSettings.lampHotspot ?? 0)));
            glCtx.uniform4f(uLocs['u_lamp2'], lamp.x2, lamp.y2, 0.45, Math.max(0, Math.min(1, currentSettings.secondLamp ?? 0)));
            glCtx.uniform1f(uLocs['u_lightPlay'], Math.max(0, Math.min(1, currentSettings.lightPlay ?? 0)));
            glCtx.uniform1f(uLocs['u_iridescence'], Math.max(0, Math.min(1, currentSettings.iridescence ?? 0)));
          }
          {
            const photo = currentSettings.renderStyle === 'photo';
            glCtx.uniform1f(uLocs['u_photo'], photo ? 1 : 0);
            const pa = hexToRgb(currentSettings.paperA ?? '#1e5fb8');
            const pb = hexToRgb(currentSettings.paperB ?? '#f4c04a');
            glCtx.uniform3f(uLocs['u_paperA'], pa.r, pa.g, pa.b);
            glCtx.uniform3f(uLocs['u_paperB'], pb.r, pb.g, pb.b);
            glCtx.uniform1f(uLocs['u_droplets'], Math.max(0, Math.min(1, currentSettings.microDroplets ?? 0)));
            glCtx.uniform1f(uLocs['u_thinFilm'], Math.max(0, Math.min(1, currentSettings.thinFilm ?? 0)));
          }
          {
            // Lumia and gel colours come from the working harmony, so they
            // stay inside the preset's dyes.
            const h = harmonyRef.current;
            const hc = (i: number) => PALETTE_RGB[h[i % h.length]];
            const a = hc(0), b = hc(1), c2 = hc(2), d = hc(3);
            glCtx.uniform1f(uLocs['u_lumia'], Math.max(0, Math.min(1, currentSettings.lumia ?? 0)));
            glCtx.uniform3f(uLocs['u_lumiaA'], a.r, a.g, a.b);
            glCtx.uniform3f(uLocs['u_lumiaB'], b.r, b.g, b.b);
            const gel = Math.max(0, Math.min(1, currentSettings.gelWheel ?? 0));
            gelAngleRef.current = (gelAngleRef.current + realDt * (currentSettings.gelSpeed ?? 0.5) / 60) % 1;
            glCtx.uniform1f(uLocs['u_gelWheel'], gel);
            glCtx.uniform1f(uLocs['u_gelAngle'], gelAngleRef.current);
            glCtx.uniform3f(uLocs['u_gel0'], a.r, a.g, a.b);
            glCtx.uniform3f(uLocs['u_gel1'], b.r, b.g, b.b);
            glCtx.uniform3f(uLocs['u_gel2'], c2.r, c2.g, c2.b);
            glCtx.uniform3f(uLocs['u_gel3'], d.r, d.g, d.b);
            glCtx.uniform1i(uLocs['u_film'], 8);
            glCtx.uniform1i(uLocs['u_filmOn'], filmOn);
            glCtx.uniform1f(uLocs['u_filmMix'], Math.max(0, Math.min(1, currentSettings.filmMix ?? 0.7)));
            glCtx.uniform1f(uLocs['u_filmKey'], Math.max(0, Math.min(0.9, currentSettings.filmKey ?? 0.18)));
            glCtx.uniform2f(uLocs['u_filmScale'], filmScaleX, filmScaleY);
          }
          {
            // Second-layer throw: zoom grows with the setting, drift is a slow
            // Lissajous so the two scales slide past each other.
            const variety = Math.max(0, Math.min(1, currentSettings.layerScaleVariety ?? 0));
            const view = layer1ViewRef.current;
            view.zoom = 1 + variety * 1.6;
            view.dx = Math.sin(time * 0.05) * 0.07 * variety;
            view.dy = Math.cos(time * 0.037) * 0.07 * variety;
            glCtx.uniform1f(uLocs['u_layerZoom1'], view.zoom);
            glCtx.uniform2f(uLocs['u_layerDrift1'], view.dx, view.dy);
            const bubbleAmt = Math.max(0, Math.min(1, currentSettings.bubbles ?? 0));
            const count = bubbleAmt > 0 ? bubblesRef.current.pack(0.5 + bubbleAmt) : 0;
            glCtx.uniform4fv(uLocs['u_bubbles'], bubblesRef.current.packed);
            glCtx.uniform4fv(uLocs['u_bubbleShape'], bubblesRef.current.packedShape);
            glCtx.uniform1i(uLocs['u_bubbleCount'], Math.min(MAX_BUBBLES, count));
            glCtx.uniform1f(uLocs['u_bubbleStrength'], Math.min(1, bubbleAmt * 1.6));
          }
          glCtx.uniform1f(uLocs['u_postBlur'], currentSettings.postBlurRadius ?? 0.35);
          // Sampling math follows the texture actually bound; the tuned look
          // (normals, edge lines, macro cells) stays on the logical 192 grid.
          glCtx.uniform1f(uLocs['u_gridSize'], fluidsRef.current[0]?.gpu?.N ?? GRID_SIZE);
          glCtx.uniform1f(uLocs['u_logicalGrid'], GRID_SIZE);

          // Macro closeup
          glCtx.uniform1i(uLocs['u_vel0'], 6);
          glCtx.uniform1i(uLocs['u_vel1'], 7);
          glCtx.uniform2f(uLocs['u_camCenter'], shot.cx, shot.cy);
          glCtx.uniform1f(uLocs['u_camZoom'], shot.zoom);
          glCtx.uniform1f(uLocs['u_macro'], macroOn ? 1 : 0);
          glCtx.uniform1f(uLocs['u_macroCells'], currentSettings.macroCells ?? 0.75);
          glCtx.uniform1f(uLocs['u_macroCellScale'], currentSettings.macroCellScale ?? 0.5);
          glCtx.uniform1f(uLocs['u_macroLacing'], currentSettings.macroLacing ?? 0.55);
          glCtx.uniform1f(uLocs['u_macroDepth'], currentSettings.macroDepth ?? 0.5);
          glCtx.uniform1f(uLocs['u_macroEdge'], currentSettings.macroEdgeDetail ?? 0.6);
          glCtx.uniform1f(uLocs['u_macroRelief'], currentSettings.macroRelief ?? 0.7);
          glCtx.uniform1f(uLocs['u_flowRate'], flowRate);
          glCtx.uniform1f(uLocs['u_filmLevel'], filmLevelRef.current);
          glCtx.uniform1f(uLocs['u_filmGain'], Math.max(0.5, Math.min(12, filmGainRef.current)));

          // ── Two passes when the camera is on ───────────────────
          // The plate is drawn to a texture and the camera looks at it:
          // refraction, depth of field, bloom and the sensor's roll-off
          // all need the finished picture to sample from.
          const camAmt = Math.max(0, Math.min(1, currentSettings.camera ?? 0));
          if (camAmt > 0.001 && !cameraRef.current) cameraRef.current = new CameraPass(glCtx);
          const cam = camAmt > 0.001 && cameraRef.current?.ok ? cameraRef.current : null;
          glCtx.uniform1i(uLocs['u_cameraOn'], cam ? 1 : 0);
          if (cam) {
            cam.bindTarget(canvas.width, canvas.height);
          } else {
            glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
            glCtx.viewport(0, 0, canvas.width, canvas.height);
          }
          glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
          glCtx.bindVertexArray(null);
          if (cam) {
            cam.draw(canvas.width, canvas.height, {
              time,
              amount: camAmt,
              refraction: Math.max(0, Math.min(1, currentSettings.refraction ?? 0)),
              chromatic: Math.max(0, Math.min(1, currentSettings.chromaticAberration ?? 0)),
              focus: Math.max(0, Math.min(1, currentSettings.focus ?? 0.5)),
              aperture: Math.max(0, Math.min(1, currentSettings.aperture ?? 0)),
              bloom: Math.max(0, Math.min(1, currentSettings.bloom ?? 0)),
              filmic: 1,
              vignette: 0.6,
              grain: 0.6,
            });
          }
        }
      }

      // Governor: judge this frame. A rung change takes effect through the
      // engine block on the next frame, which reallocates the solver and
      // resizes the canvas as needed.
      if (frameS > 0 && governorRef.current) {
        governorRef.current.sample(frameS, performance.now() - workStart, performance.now() * 0.001);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassDebug?: unknown }).chromaglassDebug = () => ({
        engine: engineStatusRef.current?.label ?? '',
        status: engineStatusRef.current,
        governor: governorRef.current,
        externalTilt: externalTiltRef.current,
        bubbles: bubblesRef.current,
        chemistry: chemRef.current,
        film: filmRef.current,
        fluids: fluidsRef.current,
        gl: webGLRef.current,
        shot: macroShotRef.current,
        gridSize: GRID_SIZE,
        harmony: harmonyRef.current,
        contract: presetContractRef.current,
        paletteWindow: paletteWindowRef.current,
        journey: journeyRef.current,
        lamp: lampRef.current,
        settings: settingsRef.current,
      });
    }

    return () => {
      stopFilm();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);

      // Clean up WebGL resources
      const glr = webGLRef.current;
      if (glr) {
        const { gl: glCtx, program: prog, vao: vaoObj, posBuffer: pb, textures: texs, velTextures: velTexs } = glr;
        for (const fluid of fluidsRef.current) fluid.detachGpu();
        for (const fbo of glr.packFbos.values()) glCtx.deleteFramebuffer(fbo);
        for (const tex of texs) glCtx.deleteTexture(tex);
        for (const tex of velTexs) glCtx.deleteTexture(tex);
        glCtx.deleteBuffer(pb);
        glCtx.deleteVertexArray(vaoObj);
        glCtx.deleteProgram(prog);
        cameraRef.current?.dispose();
        cameraRef.current = null;
        webGLRef.current = null;
      }
    };
  }, [noise2D, seedCount]);

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        id="liquid-canvas"
      />
    </div>
  );
});
