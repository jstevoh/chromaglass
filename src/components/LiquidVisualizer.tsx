import React, { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings, LiquidType } from '../types';
import { PALETTE_RGB, hexToRgb, getAudioValue, type AudioFeatureKey, pickHarmony, harmonyColor, harmonyCycle } from '../constants';

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
}

const GRID_SIZE = 192;                    // sim resolution — higher = smoother liquid edges
const GRID_SCALE = GRID_SIZE / 128;       // brush/seed geometry was tuned at 128
const GRID_AREA = GRID_SIZE * GRID_SIZE;
const PALETTE_COUNT = PALETTE_RGB.length;

const PRESET_INJECT_STYLES: Record<string, string[]> = {
  'classic':            ['drop'],
  'galaxy':             ['spray', 'streak'],
  'deep-ocean':         ['pour', 'drop'],
  'cyberpunk':          ['streak', 'splatter'],
  'lava-lamp':          ['pour'],
  'ink-bleed':          ['splatter', 'pour'],
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
};

export interface LiquidVisualizerHandle {
  injectImage: (imageData: ImageData) => void;
  applyPreset: (presetId: string) => void;
  setInjectStyle: (styles: string[]) => void;
  /** Pin the color harmony to a specific palette-index set (music intelligence). */
  setHarmony: (indices: number[]) => void;
  /** Fire a themed dye burst for a lyric word-trigger. */
  triggerTheme: (theme: string, energy?: number) => void;
}

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
  }

  addDensity(x: number, y: number, amount: number, r = 1, g = 1, b = 1) {
    const index = x + y * this.size;
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
    this.vx[index] += amountX;
    this.vy[index] += amountY;
  }

  addTemp(x: number, y: number, amount: number) {
    const index = x + y * this.size;
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
    this.pressure.fill(0); this.dhdt.fill(0); this.gap.fill(0.03);
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

    const harmonies: Record<string, number[]> = {
      'galaxy':             [9, 10, 7, 15],
      'deep-ocean':         [7, 8, 9, 5],
      'cyberpunk':          [6, 10, 2, 8],
      'lava-lamp':          [0, 1, 2, 3],
      'ink-bleed':          [14, 15, 14, 15],
      'acid-trip':          [8, 3, 0, 10],
      'bass-drop':          [8, 3, 0, 10],
      'boiling-point':      [0, 1, 2, 3],
      'microscopic-chaos':  [9, 10, 4, 5],
      'aurora-borealis':    [5, 6, 10, 7],
      'solar-flare':        [0, 1, 2, 3],
      'jellyfish-bloom':    [2, 11, 10, 7],
      'fractal-dream':      [6, 10, 2, 8],
      'velvet-underground': [9, 10, 4, 11],
      'neon-coral-reef':    [0, 6, 2, 7],
      'stardust-collapse':  [7, 15, 5, 0],
    };
    const harmony = harmonies[presetId] || pickHarmony();
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

      case 'ink-bleed': {
        const ink = { r: 0.05, g: 0.05, b: 0.08 };
        for (let drop = 0; drop < 6; drop++) {
          const dx = 15 + Math.random() * (S - 30), dy = 15 + Math.random() * (S - 50);
          this.splatBlob(dx, dy, 4 + Math.random() * 8, 3.5, ink.r, ink.g, ink.b);
          for (let t = 0; t < 15 + Math.random() * 20; t++)
            this.splatBlob(dx + (Math.random() - 0.5) * 2, dy + t, 1.5, 1.5 / (1 + t * 0.1), ink.r, ink.g, ink.b);
        }
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
          this.vx[idx] += (i / dist) * strength;
          this.vy[idx] += (j / dist) * strength;
          this.density[idx] *= 0.8;
          this.densityR[idx] *= 0.8;
          this.densityG[idx] *= 0.8;
          this.densityB[idx] *= 0.8;
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

    this.dt = Math.min(Math.max(dynamicSpeed * 0.2, 0.0000001), 0.05);

    let visc = settings.viscosity === 'thick' ? 1.5 : 0.5;
    let diff = settings.diffusionRate;
    const dt = this.dt;
    let buoyancy = settings.buoyancy;
    let advection = settings.advection;
    let damping = settings.damping || 0.99;
    let heatDecay = settings.heatDecay || 0.98;
    let heatIntensity = settings.heatIntensity || 0.15;

    // ── Audio → Physics bridge ───────────────────────────────
    // Audio adds ONLY heat (which creates buoyancy-driven motion via physics).
    // No direct velocity injection — the fluid dynamics create all movement.
    if (audioData && settings.audioMappings) {
      const colorMod = getAudioValue(audioData, settings.audioMappings.color as AudioFeatureKey);
      heatIntensity += colorMod * 0.02;
    }

    // 1. Squeeze-Film Flow
    this.solveSqueezePressure(visc);
    this.updateSqueezeVelocity(visc);

    // 2. Buoyancy & center gravity
    const cx = this.size / 2;
    const cy = this.size / 2;
    const gravityStrength = (settings.centerGravity || 0) * 0.05;

    for (let i = 0; i < GRID_AREA; i++) {
      this.vy[i] -= this.temp[i] * buoyancy * dt;
      if (gravityStrength > 0) {
        const x = i % this.size;
        const y = (i - x) / this.size;
        const dx = cx - x;
        const dy = cy - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          this.vx[i] += (dx / dist) * gravityStrength * dt;
          this.vy[i] += (dy / dist) * gravityStrength * dt;
        }
      }
    }

    // 3-6. Velocity: diffuse → project → advect → project
    this.diffuse(1, this.vx0, this.vx, settings.diffusionRate, dt);
    this.diffuse(2, this.vy0, this.vy, settings.diffusionRate, dt);
    this.project(this.vx0, this.vy0, this.vx, this.vy);
    this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, dt * advection);
    this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, dt * advection);
    this.project(this.vx, this.vy, this.vx0, this.vy0);

    // 6.5. Multi-octave curl turbulence — detail at every scale
    const turbDetail = Math.max(1, Math.min(4, Math.round(settings.turbulenceDetail ?? 3)));
    this.applyCurlTurbulence(settings.turbulenceScale ?? 0, turbDetail, time, noise2D);

    // 7. Immiscibility & fingering — blobSurfaceTension trades cohesion for shear.
    // Low tension: weak cohesion + strong fingering → amoeba-like elongation and pinching.
    // High tension: strong cohesion + weak fingering → rounder, self-contained blobs.
    const tension = Math.max(0, Math.min(1, settings.blobSurfaceTension ?? 0.5));
    const surfaceTension = (settings.polarity || 0) * 0.04 * (0.4 + tension * 1.2);
    this.applyImmiscibility(surfaceTension, time, noise2D);
    const fingeringStrength = (settings.polarity || 0) * 0.15 * (0.4 + (1 - tension) * 1.8);
    if (fingeringStrength > 0) this.applyFingering(fingeringStrength, time, noise2D);

    // 8. Vibration — only when explicitly cranked up
    if (audioData && settings.vibrationFrequency > 0.3) {
      this.applyVibration(audioData.energy * settings.vibrationFrequency * 0.002, settings.vibrationFrequency * 3, time);
    }

    // 8.5-8.7 Dripping, smearing, airflow — only above meaningful thresholds
    if (settings.rainDrip > 0.1) this.applyDripping(settings.rainDrip, dt, time, noise2D);
    if (settings.glassSmear > 0.2) this.applySmear(settings.glassSmear, dt, time, noise2D, audioData);
    if (settings.airVelocity > 0.1) this.applyAirflow(settings.airVelocity, dt, time, noise2D);

    // 9. Diffuse & advect density + temp — dye diffusion coefficients are
    // tiny, so 4 iterations is fully converged for visual purposes
    this.diffuse(0, this.s,     this.density,  diff, dt, 4);
    this.diffuse(0, this.sR,    this.densityR, diff, dt, 4);
    this.diffuse(0, this.sG,    this.densityG, diff, dt, 4);
    this.diffuse(0, this.sB,    this.densityB, diff, dt, 4);
    this.diffuse(0, this.temp0, this.temp,     diff, dt, 4);
    this.advect(0, this.density,  this.s,      this.vx, this.vy, dt * advection);
    this.advect(0, this.densityR, this.sR,     this.vx, this.vy, dt * advection);
    this.advect(0, this.densityG, this.sG,     this.vx, this.vy, dt * advection);
    this.advect(0, this.densityB, this.sB,     this.vx, this.vy, dt * advection);
    this.advect(0, this.temp,     this.temp0,  this.vx, this.vy, dt * advection);

    // 10. Evaporation, damping, stability
    const evapFactor = 1.0 - settings.evaporationRate * 0.02;
    for (let i = 0; i < GRID_AREA; i++) {
      this.vx[i] *= damping;
      this.vy[i] *= damping;
      const speedSq = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
      if (speedSq > 0.000004) {
        const factor = 0.002 / Math.sqrt(speedSq);
        this.vx[i] *= factor;
        this.vy[i] *= factor;
      }
      this.density[i]  *= evapFactor;
      this.densityR[i] *= evapFactor;
      this.densityG[i] *= evapFactor;
      this.densityB[i] *= evapFactor;
      this.temp[i]     *= heatDecay;
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
  uLocs: Record<string, WebGLUniformLocation | null>;
}

// ─── React Component ─────────────────────────────────────────────────

export const LiquidVisualizer = forwardRef<LiquidVisualizerHandle, LiquidVisualizerProps>(({
  audioData, settings, seedCount = 0, selectedLiquid,
  activeLayer = 0, clearTrigger = 0, drainTrigger = 0, activeTool = 'dropper',
  isAutomated = false, isActive = true,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidsRef = useRef<FluidSimulation[]>([]);
  const noise2D = useMemo(() => createNoise2D(), []);
  const lastSeedCount = useRef(seedCount);
  const lastClearTrigger = useRef(clearTrigger);
  const lastDrainTrigger = useRef(drainTrigger);
  const drainFrameRef = useRef(0); // >0 means drain animation is running
  const harmonyRef = useRef(pickHarmony());
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

  useImperativeHandle(ref, () => ({
    injectImage: (imageData: ImageData) => {
      const fluid = fluidsRef.current[activeLayerRef.current];
      if (fluid) fluid.injectImage(imageData);
    },
    applyPreset: (presetId: string) => {
      for (const fluid of fluidsRef.current) fluid.clearAll();
      rotationAnglesRef.current = rotationAnglesRef.current.map(() => Math.random() * Math.PI * 2);
      const fluid = fluidsRef.current[0];
      if (fluid) {
        harmonyRef.current = fluid.seedPreset(presetId, noise2D);
      }
      injectStyleRef.current = PRESET_INJECT_STYLES[presetId] || ['drop'];
      drainFrameRef.current = 0;
    },
    setInjectStyle: (styles: string[]) => {
      injectStyleRef.current = styles;
    },
    setHarmony: (indices: number[]) => {
      if (indices.length > 0 && indices.every(i => i >= 0 && i < PALETTE_COUNT)) {
        harmonyRef.current = indices;
      }
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
  }));

  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectedLiquidRef.current = selectedLiquid; }, [selectedLiquid]);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isAutomatedRef.current = isAutomated; }, [isAutomated]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    const currentCount = fluidsRef.current.length;
    const targetCount = settings.layerCount;

    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const fluid = new FluidSimulation(GRID_SIZE, settings.diffusionRate, 0.0001, 0.01);
        if (i === 0) {
          // Seed initial preset pattern
          harmonyRef.current = fluid.seedPreset('classic', noise2D);
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
out vec4 fragColor;

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
uniform float u_postBlur;          // gooey blur radius multiplier
uniform float u_gridSize;          // fluid sim texture resolution

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

// UV transform: screen UV -> fluid simulation UV
vec2 uvToFluid(vec2 uv, float c, float s) {
  vec2 p = (uv - 0.5) * u_resolution;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float scale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  return p / (scale * 128.0) + 0.5;
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

  // Beer-Lambert volumetric opacity using blurred density for gooey edges
  float thickness = totalDensity * 2.8;
  float alpha = 1.0 - exp(-thickness);
  alpha = min(0.95, alpha);

  return vec4(r, g, b, alpha);
}

// Sobel normals in fluid UV space
vec3 sobelNormal(sampler2D tex, vec2 fuv) {
  float ts = 3.0 / u_gridSize;
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

// Blinn-Phong + Fresnel shading, gated by u_glossiness.
// At glossiness 0 the dye renders as flat, evenly-lit matte color —
// the projected-light-show look — with no glass-sphere highlight dots.
vec3 applyLighting(vec3 color, vec3 normal, bool darkBlend) {
  if (u_glossiness < 0.005) return color;
  vec3 L = normalize(vec3(-0.577, -0.577, 0.577));
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
  float e = (3.0 / u_gridSize) * 0.55;
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

  // ── LED Platform background ────────────────────────────────────────
  vec3 bgColor = darkBlend ? vec3(1.0) : vec3(0.0);
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

  // ── Gooey blur parameters ─────────────────────────────────────────
  // u_postBlur scales the legacy gooey blur; defaults well below 1.0 so
  // fine turbulent structure survives to the screen.
  float fluidScale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  float blurFluid = u_gooey * u_postBlur * 10.0 / (fluidScale * 128.0);
  bool useBlur = u_gooey * u_postBlur > 0.01;

  // ── Layer 0 ──────────────────────────────────────────────────────
  float c0 = cos(-u_rotation0), s0 = sin(-u_rotation0);
  vec2 fuv0 = uvToFluid(uv, c0, s0);
  vec4 fluid0 = decodeFluid(u_layer0, fuv0, blurFluid, useBlur);

  // Gooey contrast on alpha
  if (useBlur && fluid0.a > 0.0) {
    float contrast = 1.2 + u_gooey * 4.0;
    float mid = 0.5;
    fluid0.a = clamp((fluid0.a - mid) * contrast + mid, 0.0, 1.0);
  }

  // Lighting
  vec3 normal0 = sobelNormal(u_layer0, fuv0);
  fluid0.rgb = applyLighting(fluid0.rgb, normal0, darkBlend);
  if (darkBlend) fluid0.a *= 0.6;

  // Bright interface line where dye colors meet
  if (u_boundaryContrast > 0.005 && fluid0.a > 0.03) {
    float edge0 = boundaryEdge(u_layer0, fuv0);
    fluid0.rgb += fluid0.rgb * edge0 * u_boundaryContrast * 1.6 + vec3(edge0 * u_boundaryContrast * 0.25);
  }

  vec3 outColor = bgColor;
  outColor = mix(outColor, fluid0.rgb, fluid0.a);

  // ── Layer 1 (if present) ──────────────────────────────────────────
  if (u_layerCount > 1) {
    float c1 = cos(-u_rotation1), s1 = sin(-u_rotation1);
    vec2 fuv1 = uvToFluid(uv, c1, s1);
    vec4 fluid1 = decodeFluid(u_layer1, fuv1, blurFluid, useBlur);

    if (useBlur && fluid1.a > 0.0) {
      float contrast = 1.2 + u_gooey * 4.0;
      float mid = 0.5;
      fluid1.a = clamp((fluid1.a - mid) * contrast + mid, 0.0, 1.0);
    }

    vec3 normal1 = sobelNormal(u_layer1, fuv1);
    fluid1.rgb = applyLighting(fluid1.rgb, normal1, darkBlend);
    if (darkBlend) fluid1.a *= 0.6;

    if (u_boundaryContrast > 0.005 && fluid1.a > 0.03) {
      float edge1 = boundaryEdge(u_layer1, fuv1);
      fluid1.rgb += fluid1.rgb * edge1 * u_boundaryContrast * 1.6 + vec3(edge1 * u_boundaryContrast * 0.25);
    }

    vec3 blended = applyBlend(outColor, fluid1.rgb, u_blendMode);
    outColor = mix(outColor, blended, fluid1.a);
  }

  // ── Saturation grade ──────────────────────────────────────────────
  float luma = dot(outColor, vec3(0.299, 0.587, 0.114));
  outColor = clamp(mix(vec3(luma), outColor, u_saturation), 0.0, 1.0);

  // ── Film grain ────────────────────────────────────────────────────
  float grain = (hash(v_uv * u_resolution + fract(u_time * 47.3)) - 0.5) * 0.035;
  outColor = clamp(outColor + grain, 0.0, 1.0);

  fragColor = vec4(outColor, 1.0);
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

    // Collect uniform locations
    const uniformNames = [
      'u_layer0','u_layer1','u_layerCount','u_rotation0','u_rotation1',
      'u_resolution','u_gooey','u_darkBlend','u_blendMode',
      'u_ledPlatform','u_ledMode','u_ledColor','u_ledAngle','u_time',
      'u_glossiness','u_saturation','u_boundaryContrast','u_postBlur','u_gridSize',
    ];
    const uLocs: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uLocs[name] = gl.getUniformLocation(program, name);
    }

    webGLRef.current = { gl, program, vao, posBuffer, textures, texData, uLocs };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
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
      return { x: Math.floor(rx / scale + GRID_SIZE / 2), y: Math.floor(ry / scale + GRID_SIZE / 2) };
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
        const scale = Math.max(rect.width, rect.height) * 1.5 / GRID_SIZE;
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
      const currentAudioData = audioDataRef.current;
      const currentSettings = settingsRef.current;
      const glr = webGLRef.current;

      if (fluidsRef.current.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const now = Date.now() * 0.001;
        const realDt = now - lastTimeRef.current;
        lastTimeRef.current = now;

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

        // ── Drain animation ────────────────────────────────────
        if (drainTrigger > lastDrainTrigger.current) {
          lastDrainTrigger.current = drainTrigger;
          drainFrameRef.current = 1;
          harmonyRef.current = pickHarmony(); // fresh palette after drain
        }
        if (drainFrameRef.current > 0) {
          const DRAIN_FRAMES = 50;
          const frame = drainFrameRef.current;
          const t = frame / DRAIN_FRAMES;
          const pull = Math.pow(t, 0.4) * 4.0;
          const dcx = GRID_SIZE / 2, dcy = GRID_SIZE / 2;

          for (const af of fluidsRef.current) {
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

          drainFrameRef.current++;
          if (drainFrameRef.current > DRAIN_FRAMES) {
            for (const af of fluidsRef.current) af.clearAll();
            drainFrameRef.current = 0;
          }
        }

        // ── Clear trigger ──────────────────────────────────────
        if (clearTrigger > lastClearTrigger.current) {
          lastClearTrigger.current = clearTrigger;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af) {
            af.density.fill(0); af.densityR.fill(0); af.densityG.fill(0); af.densityB.fill(0);
            af.temp.fill(0); af.vx.fill(0); af.vy.fill(0);
          }
        }

        // ── Manual injection ───────────────────────────────────
        if (isMouseDownRef.current && drainFrameRef.current === 0) {
          const { x, y } = mousePosRef.current;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
            const tool = activeToolRef.current;
            const liq = selectedLiquidRef.current;
            const rgb = hexToRgb(liq?.color ?? '#ffffff');
            const heat = liq?.heatAmount ?? 0.05;

            if (tool === 'blow') {
              af.blowAir(x, y, 4, 0.06);

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
              if (isBlow) {
                af.blowAir(rx, ry, 2 + Math.floor(energy * 3), 0.08 + energy * 0.18);
              } else {
                const color = harmonyColor(harmonyRef.current);
                const styles = injectStyleRef.current;
                const style = styles[Math.floor(Math.random() * styles.length)];
                af.autoInject(style, rx, ry, 6.0 + energy * 35, color.r, color.g, color.b, energy);
                af.addTemp(rx, ry, 0.8 + trebleBoost * 5);
              }
            }
          }

          // Slowly rotate color harmony every ~45 seconds in auto mode
          if (Math.random() < 0.0004) harmonyRef.current = pickHarmony();

        }

        // ── Seed trigger ───────────────────────────────────────
        if (seedCount > lastSeedCount.current && drainFrameRef.current === 0) {
          lastSeedCount.current = seedCount;
          harmonyRef.current = pickHarmony();
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
            // Two slow Lissajous orbits inject different colors continuously.
            const phase = time * 0.15;
            const injPts = [
              { x: GRID_SIZE / 2 + Math.cos(phase) * GRID_SIZE * 0.28,
                y: GRID_SIZE / 2 + Math.sin(phase * 1.3) * GRID_SIZE * 0.28 },
              { x: GRID_SIZE / 2 + Math.cos(phase * 0.7 + Math.PI) * GRID_SIZE * 0.3,
                y: GRID_SIZE / 2 + Math.sin(phase * 0.9 + 1.0) * GRID_SIZE * 0.3 },
            ];
            const ambCol = harmonyCycle(harmonyRef.current, time * 0.25);
            const ar = ambCol.r, ag = ambCol.g, ab = ambCol.b;

            for (const pt of injPts) {
              const px = Math.floor(pt.x), py = Math.floor(pt.y);
              if (px > 0 && px < GRID_SIZE - 1 && py > 0 && py < GRID_SIZE - 1) {
                af.addDensity(px, py, 0.035, ar, ag, ab);
                af.addTemp(px, py, 0.01);
              }
            }

          }

          // ── Audio input to fluid ──────────────────────────────
          if (currentAudioData && currentSettings.audioMappings) {
            const densityMod = getAudioValue(currentAudioData, currentSettings.audioMappings.density as AudioFeatureKey);
            const colorMod   = getAudioValue(currentAudioData, currentSettings.audioMappings.color as AudioFeatureKey);

            const impact = currentSettings.audioImpact ?? 0.45;
            if (impact > 0.01 && currentAudioData.volume > 3 && densityMod > 0.005) {
              const audioCol = harmonyCycle(harmonyRef.current, time * 0.3 + colorMod * Math.PI);
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

                // Mid: orbital injection
                if (mid01 > 0.2) {
                  const orbitR = GRID_SIZE * 0.3;
                  const mx = Math.floor(centerX + Math.cos(time * 0.6) * orbitR);
                  const my = Math.floor(centerY + Math.sin(time * 0.8) * orbitR);
                  if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
                    activeFluid.autoInject(aStyle(), mx, my, mid01 * 0.04 * autoAmp, ar_a, ag_a, ab_a, mid01);
                    activeFluid.addTemp(mx, my, mid01 * 0.025 * autoAmp);
                  }
                }

                // Treble: scattered heat sparks
                if (treble01 > 0.2) {
                  const sparks = Math.floor(treble01 * (isAutomatedRef.current ? 12 : 6) * impactMul);
                  for (let s = 0; s < sparks; s++) {
                    const sx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                    const sy = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
                    activeFluid.addTemp(sx, sy, treble01 * 0.45 * autoAmp);
                  }
                }

                // Energy: roaming swell
                if (energy01 > 0.15) {
                  const ex = Math.floor(centerX + Math.cos(time * 0.4) * GRID_SIZE * 0.25);
                  const ey = Math.floor(centerY + Math.sin(time * 0.3) * GRID_SIZE * 0.25);
                  activeFluid.autoInject(aStyle(), ex, ey, energy01 * 0.04 * autoAmp, ar_a, ag_a, ab_a, energy01);
                  if (isAutomatedRef.current) {
                    const ex2 = Math.floor(centerX + Math.cos(time * 0.4 + Math.PI) * GRID_SIZE * 0.22);
                    const ey2 = Math.floor(centerY + Math.sin(time * 0.3 + Math.PI) * GRID_SIZE * 0.22);
                    activeFluid.autoInject(aStyle(), ex2, ey2, energy01 * 0.035, ar_a, ag_a, ab_a, energy01);
                  }
                }
              }
            }
          }
        }

        // ── Step simulations & update rotation ────────────────
        let hasContent = false;
        const isDarkBlend = currentSettings.blendMode === 'multiply';

        for (let l = 0; l < fluidsRef.current.length; l++) {
          const fluid = fluidsRef.current[l];
          if (isActiveRef.current && drainFrameRef.current === 0) fluid.step(currentSettings, currentAudioData, time, noise2D);

          // Check if there's content
          for (let i = 0; i < GRID_AREA; i++) {
            if (fluid.density[i] > 0.001) { hasContent = true; break; }
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

          // Pack fluid data into textures — sqrt-encoded for extra precision
          // at low densities (the shader squares on decode). Kills banding.
          for (let l = 0; l < fluidsRef.current.length; l++) {
            const fluid = fluidsRef.current[l];
            const td = tData[l];
            const inv8 = 1 / 8.0;
            for (let i = 0; i < GRID_AREA; i++) {
              const i4 = i * 4;
              td[i4]     = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityR[i]) * inv8) * 255 + 0.5));
              td[i4 + 1] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityG[i]) * inv8) * 255 + 0.5));
              td[i4 + 2] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.densityB[i]) * inv8) * 255 + 0.5));
              td[i4 + 3] = Math.max(0, Math.min(255, Math.sqrt(Math.max(0, fluid.density[i])  * inv8) * 255 + 0.5));
            }
            glCtx.activeTexture(glCtx.TEXTURE0 + l);
            glCtx.bindTexture(glCtx.TEXTURE_2D, texs[l]);
            glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, GRID_SIZE, GRID_SIZE, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, td);
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
          glCtx.uniform1f(uLocs['u_postBlur'], currentSettings.postBlurRadius ?? 0.35);
          glCtx.uniform1f(uLocs['u_gridSize'], GRID_SIZE);

          glCtx.viewport(0, 0, canvas.width, canvas.height);
          glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
          glCtx.bindVertexArray(null);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
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
        const { gl: glCtx, program: prog, vao: vaoObj, posBuffer: pb, textures: texs } = glr;
        for (const tex of texs) glCtx.deleteTexture(tex);
        glCtx.deleteBuffer(pb);
        glCtx.deleteVertexArray(vaoObj);
        glCtx.deleteProgram(prog);
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
