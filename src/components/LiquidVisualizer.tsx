import React, { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings, LiquidType } from '../types';
import { PALETTE_RGB, hexToRgb, getAudioValue, type AudioFeatureKey } from '../constants';

interface LiquidVisualizerProps {
  audioData: AudioData | null;
  settings: VisualizerSettings;
  seedCount?: number;
  selectedLiquid?: LiquidType;
  activeLayer?: number;
  clearTrigger?: number;
  drainTrigger?: number;
  activeTool?: 'dropper' | 'blow';
  isAutomated?: boolean;
  isActive?: boolean;
}

const GRID_SIZE = 128;
const GRID_AREA = GRID_SIZE * GRID_SIZE;
const PALETTE_COUNT = PALETTE_RGB.length;

export interface LiquidVisualizerHandle {
  deployInsect: (type: string) => void;
  injectImage: (imageData: ImageData) => void;
}

// ─── Insect system ────────────────────────────────────────────────────

interface Insect {
  type: string;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  life: number; maxLife: number;
  stateTimer: number;
  state: string;
  strength: number;
  size: number; // 0.4–2.2, normal distribution mean=1.0 — scales force radius and speed
}

export const INSECT_TYPES = [
  { id: 'water_strider', name: 'Water Strider', emoji: '🌊', description: 'Skims in quick bursts, leg dimples ripple outward' },
  { id: 'ant',           name: 'Ant',           emoji: '🐜', description: 'Methodical march, tiny six-legged wake' },
  { id: 'butterfly',     name: 'Butterfly',     emoji: '🦋', description: 'Panicked wing flaps, weakens and stills' },
  { id: 'beetle',        name: 'Beetle',        emoji: '🪲', description: 'Slow heavy plow, strong bow wave' },
  { id: 'fly',           name: 'Fly',           emoji: '🪰', description: 'Frantic zigzag, chaotic micro-swirls' },
  { id: 'minnow', name: 'Minnow', emoji: '🐟', description: 'Fast sinusoidal swimmer, curving wake' },
  { id: 'crab',   name: 'Crab',   emoji: '🦀', description: 'Sideways scuttle, powerful pinch burst' },
] as const;

// ─── Fluid Simulation ────────────────────────────────────────────────

class FluidSimulation {
  size: number;
  dt: number;
  diff: number;
  visc: number;

  insects: Insect[] = [];

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
    // Map image into the visible grid region (roughly 22–106 in x, 38–90 in y)
    const gx0 = 24, gx1 = 104, gy0 = 40, gy1 = 88;
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

  applySquish(x: number, y: number, radius: number, amount: number) {
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

    // 7. Immiscibility & fingering — reduced to prevent rapid boundary motion
    const surfaceTension = (settings.polarity || 0) * 0.04;
    this.applyImmiscibility(surfaceTension, time, noise2D);
    const fingeringStrength = (settings.polarity || 0) * 0.15;
    if (fingeringStrength > 0) this.applyFingering(fingeringStrength, time, noise2D);

    // 8. Vibration — only when explicitly cranked up
    if (audioData && settings.vibrationFrequency > 0.3) {
      this.applyVibration(audioData.energy * settings.vibrationFrequency * 0.002, settings.vibrationFrequency * 3, time);
    }

    // 8.5-8.7 Dripping, smearing, airflow — only above meaningful thresholds
    if (settings.rainDrip > 0.1) this.applyDripping(settings.rainDrip, dt, time, noise2D);
    if (settings.glassSmear > 0.2) this.applySmear(settings.glassSmear, dt, time, noise2D, audioData);
    if (settings.airVelocity > 0.1) this.applyAirflow(settings.airVelocity, dt, time, noise2D);

    // 9. Diffuse & advect density + temp
    this.diffuse(0, this.s,     this.density,  diff, dt);
    this.diffuse(0, this.sR,    this.densityR, diff, dt);
    this.diffuse(0, this.sG,    this.densityG, diff, dt);
    this.diffuse(0, this.sB,    this.densityB, diff, dt);
    this.diffuse(0, this.temp0, this.temp,     diff, dt);
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

    // 11. Insects
    this.stepInsects(audioData);
  }

  // ── Private simulation methods ─────────────────────────────────────

  private solveSqueezePressure(viscosity: number) {
    for (let k = 0; k < 20; k++) {
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

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
    const a = dt * diff * (this.size - 2) * (this.size - 2);
    this.linSolve(b, x, x0, a, 1 + 4 * a);
  }

  private linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
    const cRecip = 1.0 / c;
    for (let k = 0; k < 20; k++) {
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

  deployInsect(type: string) {
    if (this.insects.length >= 20) return;
    // Find a position with some fluid; fall back to random
    let x = -1, y = -1;
    // Visible grid region: center ± ~42 cells in x, ± ~24 cells in y (for typical 16:9 screen)
    const vx0 = 22, vx1 = 106, vy0 = 38, vy1 = 90;
    for (let t = 0; t < 30; t++) {
      const tx = Math.floor(vx0 + Math.random() * (vx1 - vx0));
      const ty = Math.floor(vy0 + Math.random() * (vy1 - vy0));
      if (this.density[tx + ty * this.size] > 0.03) { x = tx; y = ty; break; }
    }
    if (x < 0) { x = Math.floor(vx0 + Math.random() * (vx1 - vx0)); y = Math.floor(vy0 + Math.random() * (vy1 - vy0)); }
    const angle = Math.random() * Math.PI * 2;
    // Normal distribution size via Box-Muller: mean=1.0, std=0.35, clamped [0.4, 2.2]
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    const size = Math.max(0.4, Math.min(2.2, 1.0 + z * 0.35));
    const baseLife = type === 'ant' ? 2800 : type === 'butterfly' ? 1800 : type === 'beetle' ? 3000 : type === 'minnow' ? 2200 : type === 'crab' ? 2600 : 1400;
    const maxLife = Math.round(baseLife * size);
    const initState = type === 'water_strider' ? 'glide' : type === 'beetle' ? 'walking' : type === 'crab' ? 'walking' : 'active';
    this.insects.push({ type, x, y, vx: Math.cos(angle) * 0.03, vy: Math.sin(angle) * 0.03,
      angle, life: 0, maxLife, stateTimer: 0, state: initState, strength: 1.0, size });
  }

  private stepInsects(audioData: AudioData | null) {
    // Normalize audio bands to 0–1 range (raw values are 0–100 scale)
    const bass    = audioData ? Math.min(1, audioData.bass    / 80) : 0;
    const mid     = audioData ? Math.min(1, audioData.mid     / 80) : 0;
    const treble  = audioData ? Math.min(1, audioData.treble  / 80) : 0;
    const energy  = audioData ? Math.min(1, audioData.energy  / 80) : 0;
    const volume  = audioData ? Math.min(1, audioData.volume  / 80) : 0;

    for (let i = this.insects.length - 1; i >= 0; i--) {
      const ins = this.insects[i];
      ins.life++;
      ins.stateTimer++;
      if (ins.life >= ins.maxLife || ins.x < 2 || ins.x >= this.size - 2 || ins.y < 2 || ins.y >= this.size - 2) {
        this.insects.splice(i, 1); continue;
      }
      // Weaken in last 30% of life
      ins.strength = ins.life / ins.maxLife > 0.7 ? Math.max(0, 1 - (ins.life / ins.maxLife - 0.7) / 0.3) : 1.0;

      const ix = Math.floor(ins.x), iy = Math.floor(ins.y);
      const safe = ix > 0 && ix < this.size - 1 && iy > 0 && iy < this.size - 1;

      // Fluid carries insect — stronger influence so insects are swept by currents they create
      if (safe) {
        const fi = ix + iy * this.size;
        ins.vx += this.vx[fi] * 0.18;
        ins.vy += this.vy[fi] * 0.18;
      }

      const perp = (a: number) => ({ px: -Math.sin(a), py: Math.cos(a) });

      if (ins.type === 'water_strider') {
        const sz = ins.size;
        if (bass > 0.65 && ins.state !== 'burst') { ins.state = 'burst'; ins.stateTimer = 0; }
        if (ins.state === 'burst') {
          const speed = 0.20 / Math.sqrt(sz) * (1 + bass * 0.7);
          ins.vx = ins.vx * 0.80 + Math.cos(ins.angle) * speed * 0.20;
          ins.vy = ins.vy * 0.80 + Math.sin(ins.angle) * speed * 0.20;
          if (ins.stateTimer > 18) { ins.state = 'glide'; ins.stateTimer = 0; }
        } else {
          // Slow glide with gentle lateral zigzag — surface-skimming S-curve
          ins.angle += Math.sin(ins.life * 0.06) * 0.025 * (1 + mid * 0.5);
          const speed = 0.05 / Math.sqrt(sz) * (1 + mid * 0.3);
          ins.vx = ins.vx * 0.94 + Math.cos(ins.angle) * speed * 0.06;
          ins.vy = ins.vy * 0.94 + Math.sin(ins.angle) * speed * 0.06;
          if (ins.stateTimer > 100 + Math.random() * 120) {
            ins.state = Math.random() < 0.12 ? 'burst' : 'glide';
            ins.angle += (Math.random() - 0.5) * (0.6 + energy * 0.5);
            ins.stateTimer = 0;
          }
        }
        // Four leg dimples — radius scales with size
        const { px, py } = perp(ins.angle);
        const fwd = { x: Math.cos(ins.angle), y: Math.sin(ins.angle) };
        const legR = 2.8 * sz;
        const legs = [
          { lx: ins.x + px * legR + fwd.x * 1.2 * sz, ly: ins.y + py * legR + fwd.y * 1.2 * sz },
          { lx: ins.x + px * legR - fwd.x * 1.2 * sz, ly: ins.y + py * legR - fwd.y * 1.2 * sz },
          { lx: ins.x - px * legR + fwd.x * 1.2 * sz, ly: ins.y - py * legR + fwd.y * 1.2 * sz },
          { lx: ins.x - px * legR - fwd.x * 1.2 * sz, ly: ins.y - py * legR - fwd.y * 1.2 * sz },
        ];
        for (const leg of legs) {
          const lx = Math.floor(leg.lx), ly = Math.floor(leg.ly);
          if (lx > 0 && lx < this.size - 1 && ly > 0 && ly < this.size - 1) {
            const dx = leg.lx - ins.x, dy = leg.ly - ins.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = 1.0 * sz * ins.strength * (ins.state === 'burst' ? 4.5 + bass * 3 : 1.2 + mid * 0.8);
            this.addVelocity(lx, ly, (dx / d) * f, (dy / d) * f);
          }
        }

      } else if (ins.type === 'ant') {
        const sz = ins.size;
        // Lateral body weave while marching — ants rarely go perfectly straight
        ins.angle += Math.sin(ins.life * 0.12) * 0.018 + (Math.random() - 0.5) * 0.008;
        const pace = 0.04 / Math.sqrt(sz) * (1 + mid * 0.5);
        ins.vx = ins.vx * 0.91 + Math.cos(ins.angle) * pace * 0.09;
        ins.vy = ins.vy * 0.91 + Math.sin(ins.angle) * pace * 0.09;
        // Deliberate ~90° turns, occasionally a U-turn
        if (ins.stateTimer > 150 + Math.random() * 120) {
          const turns = [-Math.PI * 0.5, -Math.PI * 0.45, Math.PI * 0.45, Math.PI * 0.5, Math.PI * 0.95];
          ins.angle += turns[Math.floor(Math.random() * turns.length)] * (1 + energy * 0.25);
          ins.stateTimer = 0;
        }
        // Six-legged alternating footfall every 10 frames — radius scales with size
        if (ins.life % 10 === 0 && safe) {
          const { px, py } = perp(ins.angle);
          const side = ins.life % 20 < 10 ? 1 : -1;
          for (let leg = -1; leg <= 1; leg++) {
            for (let reach = 1; reach <= 2; reach++) {
              const lx = Math.floor(ins.x + px * side * reach * 1.3 * sz + Math.cos(ins.angle) * leg * sz);
              const ly = Math.floor(ins.y + py * side * reach * 1.3 * sz + Math.sin(ins.angle) * leg * sz);
              if (lx > 0 && lx < this.size - 1 && ly > 0 && ly < this.size - 1) {
                const footF = (0.5 + bass * 0.7) * sz * (1 / reach);
                this.addVelocity(lx, ly, Math.cos(ins.angle) * footF, Math.sin(ins.angle) * footF);
              }
            }
          }
        }

      } else if (ins.type === 'butterfly') {
        const sz = ins.size;
        const agitation = treble * 1.0 + energy * 0.4;
        // Compound winding path: slow sine oscillation + occasional random drift
        ins.angle += Math.sin(ins.life * 0.018) * 0.05 + Math.cos(ins.life * 0.031) * 0.025
                   + (Math.random() - 0.5) * (0.04 + agitation * 0.06);
        const driftSpd = 0.025 / Math.sqrt(sz) * (1 + agitation * 0.4) * ins.strength;
        ins.vx = ins.vx * 0.95 + Math.cos(ins.angle) * driftSpd * 0.05;
        ins.vy = ins.vy * 0.95 + Math.sin(ins.angle) * driftSpd * 0.05;
        // Wing flap — interval and wing span scale with size
        const flapInterval = Math.max(12, Math.floor(22 - treble * 10));
        if (ins.stateTimer % flapInterval < 4 && ins.strength > 0.05) {
          const leftWing = Math.floor(ins.stateTimer / flapInterval) % 2 === 0;
          const { px, py } = perp(ins.angle);
          const sx = leftWing ? 1 : -1;
          const wingR = Math.max(3, Math.floor(9 * ins.strength * sz));
          for (let w = 1; w <= wingR; w++) {
            const wx = Math.floor(ins.x + px * sx * w);
            const wy = Math.floor(ins.y + py * sx * w);
            if (wx > 0 && wx < this.size - 1 && wy > 0 && wy < this.size - 1) {
              const f = (1.8 + agitation * 1.2) * sz * ins.strength * (1 - w / wingR);
              this.addVelocity(wx, wy, px * sx * f - Math.cos(ins.angle) * f * 0.3,
                                       py * sx * f - Math.sin(ins.angle) * f * 0.3);
            }
          }
        }

      } else if (ins.type === 'beetle') {
        // Very slow heavy plow; long stops, bass kicks it into motion
        if (ins.state === 'stopped') {
          if (bass > 0.55 || ins.stateTimer > 120 + Math.random() * 150) { ins.state = 'walking'; ins.stateTimer = 0; }
        } else {
          const sz = ins.size;
          // Slow heavy plow with slight heading wobble — beetles weave slightly
          ins.angle += Math.sin(ins.life * 0.08) * 0.012 + (Math.random() - 0.5) * 0.005;
          const plowSpeed = 0.016 / Math.sqrt(sz) * (1 + volume * 0.4);
          ins.vx = ins.vx * 0.96 + Math.cos(ins.angle) * plowSpeed * 0.04;
          ins.vy = ins.vy * 0.96 + Math.sin(ins.angle) * plowSpeed * 0.04;
          if (ins.stateTimer > 220 + Math.random() * 160) {
            ins.state = Math.random() < 0.4 ? 'stopped' : 'walking';
            ins.angle += (Math.random() - 0.5) * (0.55 + bass * 0.6);
            ins.stateTimer = 0;
          }
          // Large multi-reach bow wave — scales with size
          const plowF = (2.0 + volume * 2.0) * sz;
          for (let reach = 1; reach <= Math.round(3 * sz); reach++) {
            const bx = Math.floor(ins.x + Math.cos(ins.angle) * (reach + 1));
            const by = Math.floor(ins.y + Math.sin(ins.angle) * (reach + 1));
            if (bx > 0 && bx < this.size - 1 && by > 0 && by < this.size - 1)
              this.addVelocity(bx, by, Math.cos(ins.angle) * plowF / reach, Math.sin(ins.angle) * plowF / reach);
          }
          // Wide flank displacement — scales with size
          const { px, py } = perp(ins.angle);
          for (const s of [-1, 1]) {
            for (let reach = 1; reach <= Math.round(3 * sz); reach++) {
              const sx2 = Math.floor(ins.x + px * s * reach * 1.5 * sz);
              const sy2 = Math.floor(ins.y + py * s * reach * 1.5 * sz);
              if (sx2 > 0 && sx2 < this.size - 1 && sy2 > 0 && sy2 < this.size - 1)
                this.addVelocity(sx2, sy2, px * s * (1.2 + volume * 1.2) * sz / reach, py * s * (1.2 + volume * 1.2) * sz / reach);
            }
          }
        }

      } else if (ins.type === 'fly') {
        const sz = ins.size;
        if (ins.state === 'active') {
          // Dart with slight angle jitter mid-flight — flies don't go perfectly straight
          ins.angle += (Math.random() - 0.5) * 0.08;
          const dashSpd = 0.12 / Math.sqrt(sz) * (1 + energy * 0.7 + treble * 0.4);
          ins.vx = ins.vx * 0.83 + Math.cos(ins.angle) * dashSpd * 0.17;
          ins.vy = ins.vy * 0.83 + Math.sin(ins.angle) * dashSpd * 0.17;
          if (ins.stateTimer > 20 + Math.random() * 30) {
            ins.state = 'stopped'; ins.stateTimer = 0;
          }
        } else {
          ins.vx *= 0.88;
          ins.vy *= 0.88;
          if (safe && ins.life % 4 === 0) {
            const { px, py } = perp(ins.angle);
            const buzzF = (0.35 + energy * 0.45) * sz;
            this.addVelocity(Math.min(this.size-2, ix+1), iy,  px * buzzF,  py * buzzF);
            this.addVelocity(Math.max(1,            ix-1), iy, -px * buzzF, -py * buzzF);
            this.addVelocity(ix, Math.min(this.size-2, iy+1),  py * buzzF, -px * buzzF);
            this.addVelocity(ix, Math.max(1,            iy-1), -py * buzzF,  px * buzzF);
          }
          if (ins.stateTimer > 14 + Math.random() * 20) {
            // Vary the turn amount — sometimes small corrections, sometimes big jumps
            const turnMag = Math.random() < 0.3 ? Math.PI * (0.8 + Math.random() * 0.6) : (Math.random() - 0.5) * Math.PI * 0.8;
            ins.angle += turnMag * (1 + treble * 0.6);
            ins.state = 'active'; ins.stateTimer = 0;
          }
        }
        if (ins.state === 'active' && ins.life % 5 === 0 && safe) {
          const { px, py } = perp(ins.angle);
          const swirlF = (0.7 + energy * 0.8) * sz;
          this.addVelocity(Math.min(this.size - 2, ix + 1), iy,  px * swirlF,  py * swirlF);
          this.addVelocity(Math.max(1,              ix - 1), iy, -px * swirlF, -py * swirlF);
          this.addVelocity(ix, Math.min(this.size - 2, iy + 1),  py * swirlF, -px * swirlF);
          this.addVelocity(ix, Math.max(1,              iy - 1), -py * swirlF,  px * swirlF);
        }

      } else if (ins.type === 'minnow') {
        const sz = ins.size;
        const swimSpeed = 0.09 / Math.sqrt(sz) * (1 + treble * 0.4 + energy * 0.25);
        // Tight S-curve: two sine waves at different frequencies create complex path
        ins.angle += Math.sin(ins.life * 0.05) * 0.06 + Math.sin(ins.life * 0.017) * 0.025
                   + (Math.random() - 0.5) * 0.008;
        ins.vx = ins.vx * 0.92 + Math.cos(ins.angle) * swimSpeed * 0.08;
        ins.vy = ins.vy * 0.92 + Math.sin(ins.angle) * swimSpeed * 0.08;
        if (bass > 0.6 && ins.stateTimer > 50) { ins.angle += (Math.random() - 0.5) * Math.PI * 0.6; ins.stateTimer = 0; }
        if (ins.life % 5 === 0 && safe) {
          const { px, py } = perp(ins.angle);
          const side = ins.life % 10 < 5 ? 1 : -1;
          const maxTail = Math.round(3 * sz);
          for (let t = 1; t <= maxTail; t++) {
            const tailX = Math.floor(ins.x - Math.cos(ins.angle) * (t + 1));
            const tailY = Math.floor(ins.y - Math.sin(ins.angle) * (t + 1));
            if (tailX > 0 && tailX < this.size - 1 && tailY > 0 && tailY < this.size - 1) {
              const f = (1.2 + energy * 1.0) * sz * ins.strength / t;
              this.addVelocity(tailX, tailY, px * side * f, py * side * f);
            }
          }
          const bowX = Math.floor(ins.x + Math.cos(ins.angle) * 2 * sz);
          const bowY = Math.floor(ins.y + Math.sin(ins.angle) * 2 * sz);
          if (bowX > 0 && bowX < this.size - 1 && bowY > 0 && bowY < this.size - 1)
            this.addVelocity(bowX, bowY, Math.cos(ins.angle) * 0.9 * sz * ins.strength, Math.sin(ins.angle) * 0.9 * sz * ins.strength);
        }

      } else if (ins.type === 'crab') {
        // Very slow sideways scuttle; big radial pinch claws on bass
        if (ins.state === 'pinching') {
          // Radial outward burst — large radius pinch claw attack
          if (ins.stateTimer < 5 && safe) {
            const sz = ins.size;
            const pR = Math.round(5 * sz);
            for (let pr = -pR; pr <= pR; pr++) {
              for (let pc = -pR; pc <= pR; pc++) {
                const dist = Math.sqrt(pr * pr + pc * pc);
                if (dist < 1 || dist > pR) continue;
                const bx = Math.floor(ins.x) + pc, by = Math.floor(ins.y) + pr;
                if (bx > 0 && bx < this.size - 1 && by > 0 && by < this.size - 1) {
                  const f = (2.2 + volume * 1.8) * sz * ins.strength * (1 - dist / pR);
                  this.addVelocity(bx, by, (pc / dist) * f, (pr / dist) * f);
                }
              }
            }
          }
          if (ins.stateTimer > 60) { ins.state = 'walking'; ins.stateTimer = 0; }
        } else {
          const sz = ins.size;
          const { px, py } = perp(ins.angle);
          // Slow lateral scuttle with a slight forward/back wobble added
          ins.angle += Math.sin(ins.life * 0.04) * 0.01;
          const sideDir = ins.life % 600 < 300 ? 1 : -1;
          const sideSpeed = 0.035 / Math.sqrt(sz) * (1 + mid * 0.35) * sideDir;
          ins.vx = ins.vx * 0.94 + px * sideSpeed * 0.06;
          ins.vy = ins.vy * 0.94 + py * sideSpeed * 0.06;
          if (ins.stateTimer > 250 + Math.random() * 200) {
            ins.angle += (Math.random() - 0.5) * Math.PI * 0.4;
            ins.stateTimer = 0;
          }
          if ((bass > 0.65 || Math.random() < 0.001) && ins.stateTimer > 80) {
            ins.state = 'pinching'; ins.stateTimer = 0;
          }
          if (ins.life % 12 === 0 && safe) {
            const legSide = ins.life % 24 < 12 ? 1 : -1;
            const maxLeg = Math.round(2 * sz);
            for (let leg = -maxLeg; leg <= maxLeg; leg++) {
              for (let reach = 1; reach <= Math.round(3 * sz); reach++) {
                const lx = Math.floor(ins.x + px * legSide * reach * 1.4 * sz + Math.cos(ins.angle) * leg);
                const ly = Math.floor(ins.y + py * legSide * reach * 1.4 * sz + Math.sin(ins.angle) * leg);
                if (lx > 0 && lx < this.size - 1 && ly > 0 && ly < this.size - 1) {
                  const legF = (0.6 + volume * 0.5) * sz / reach;
                  this.addVelocity(lx, ly, px * legSide * legF, py * legSide * legF);
                }
              }
            }
          }
        }
      }


      // Clamp speed — scale inversely with size so large insects move slower
      const baseMaxSpd = ins.type === 'fly' ? 0.18 : ins.type === 'water_strider' ? 0.22 : ins.type === 'minnow' ? 0.14 : ins.type === 'ant' ? 0.08 : ins.type === 'beetle' ? 0.035 : ins.type === 'crab' ? 0.06 : ins.type === 'butterfly' ? 0.06 : 0.10;
      const maxSpd = baseMaxSpd / Math.sqrt(ins.size);
      const spd = Math.sqrt(ins.vx * ins.vx + ins.vy * ins.vy);
      if (spd > maxSpd) { ins.vx = ins.vx / spd * maxSpd; ins.vy = ins.vy / spd * maxSpd; }
      ins.x += ins.vx;
      ins.y += ins.vy;
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
  const simulationTimeRef = useRef(0);
  const lastTimeRef = useRef(Date.now() * 0.001);

  useImperativeHandle(ref, () => ({
    deployInsect: (type: string) => {
      fluidsRef.current[0]?.deployInsect(type);
    },
    injectImage: (imageData: ImageData) => {
      const fluid = fluidsRef.current[activeLayerRef.current];
      if (fluid) fluid.injectImage(imageData);
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
          // Seed with large overlapping blobs that already fill the canvas —
          // Hele-Shaw initial state: multiple immiscible fluids in contact.
          const positions: [number, number][] = [
            [0.22, 0.22], [0.78, 0.22], [0.50, 0.50],
            [0.22, 0.78], [0.78, 0.78], [0.35, 0.50], [0.65, 0.50],
          ];
          positions.forEach(([fx, fy], idx) => {
            const cx = Math.floor(fx * GRID_SIZE);
            const cy = Math.floor(fy * GRID_SIZE);
            const color = PALETTE_RGB[Math.floor(idx * PALETTE_COUNT / positions.length) % PALETTE_COUNT];
            const blobR = 20;
            for (let dy = -blobR; dy <= blobR; dy++) {
              for (let dx = -blobR; dx <= blobR; dx++) {
                const dist2 = dx * dx + dy * dy;
                if (dist2 > blobR * blobR) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 1 || nx >= GRID_SIZE - 1 || ny < 1 || ny >= GRID_SIZE - 1) continue;
                const w = (1 - Math.sqrt(dist2) / blobR) ** 2;
                fluid.addDensity(nx, ny, 2.0 * w, color.r, color.g, color.b);
              }
            }
          });
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
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
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

const float PI = 3.14159265359;
const float DENSITY_SCALE = 8.0;
const float TEX_STEP = 3.0 / 128.0;

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
  const vec2 texSize = vec2(128.0);
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

float decodeDensity(float a) {
  return a * DENSITY_SCALE;
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
  float d00 = decodeDensity(textureBicubic(tex, fuv + vec2(-TEX_STEP, -TEX_STEP)).a);
  float d10 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0,       -TEX_STEP)).a);
  float d20 = decodeDensity(textureBicubic(tex, fuv + vec2( TEX_STEP, -TEX_STEP)).a);
  float d01 = decodeDensity(textureBicubic(tex, fuv + vec2(-TEX_STEP,  0.0     )).a);
  float d21 = decodeDensity(textureBicubic(tex, fuv + vec2( TEX_STEP,  0.0     )).a);
  float d02 = decodeDensity(textureBicubic(tex, fuv + vec2(-TEX_STEP,  TEX_STEP)).a);
  float d12 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0,        TEX_STEP)).a);
  float d22 = decodeDensity(textureBicubic(tex, fuv + vec2( TEX_STEP,  TEX_STEP)).a);
  float gradX = (-d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22) * 0.125;
  float gradY = (-d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22) * 0.125;
  return normalize(vec3(-gradX * 0.9, -gradY * 0.9, 1.0));
}

// Blinn-Phong + Fresnel shading
vec3 applyLighting(vec3 color, vec3 normal, bool darkBlend) {
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

  if (darkBlend) {
    float lf = 0.6 + 0.4 * diffuse;
    return color * lf;
  } else {
    float lf = 0.5 + 0.5 * diffuse;
    return color * lf + specularTotal;
  }
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
  float fluidScale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  float blurFluid = u_gooey * 10.0 / (fluidScale * 128.0);
  bool useBlur = u_gooey > 0.01;

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

    vec3 blended = applyBlend(outColor, fluid1.rgb, u_blendMode);
    outColor = mix(outColor, blended, fluid1.a);
  }

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
        }
        if (drainFrameRef.current > 0) {
          const DRAIN_FRAMES = 55;
          const frame = drainFrameRef.current;
          const t = frame / DRAIN_FRAMES; // 0→1 over animation
          // Ease-in power so the pull accelerates
          const pull = Math.pow(t, 0.6) * 3.5;
          const cx = GRID_SIZE / 2, cy = GRID_SIZE / 2;
          for (const af of fluidsRef.current) {
            for (let j = 1; j < GRID_SIZE - 1; j++) {
              for (let i = 1; i < GRID_SIZE - 1; i++) {
                const idx = i + j * GRID_SIZE;
                if (af.density[idx] < 0.001) continue;
                const dx = cx - i, dy = cy - j;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                // Inward pull (centripetal) + clockwise swirl (tangential)
                const inward = pull * (1 + (1 - t) * 0.4);
                const swirl  = pull * 0.9 * (1 - t * 0.3);
                af.vx[idx] += (dx / dist) * inward + (-dy / dist) * swirl;
                af.vy[idx] += (dy / dist) * inward + ( dx / dist) * swirl;
                // Accelerate evaporation near end of animation
                if (t > 0.55) {
                  const evapRate = (t - 0.55) / 0.45 * 0.25;
                  af.density[idx]  *= (1 - evapRate);
                  af.densityR[idx] *= (1 - evapRate);
                  af.densityG[idx] *= (1 - evapRate);
                  af.densityB[idx] *= (1 - evapRate);
                }
              }
            }
          }
          drainFrameRef.current++;
          if (drainFrameRef.current > DRAIN_FRAMES) {
            // Hard clear everything once animation completes
            for (const af of fluidsRef.current) {
              af.density.fill(0); af.densityR.fill(0); af.densityG.fill(0); af.densityB.fill(0);
              af.temp.fill(0); af.vx.fill(0); af.vy.fill(0);
            }
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
        if (isMouseDownRef.current) {
          const { x, y } = mousePosRef.current;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
            if (activeToolRef.current === 'blow') {
              af.blowAir(x, y, 4, 0.06);
            } else {
              const liq = selectedLiquidRef.current;
              const rgb = hexToRgb(liq?.color ?? '#ffffff');
              const r = liq?.injectRadius ?? 3;
              const amt = liq?.injectAmount ?? 0.8;
              const heat = liq?.heatAmount ?? 0.05;
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
        if (isAutomatedRef.current && isActiveRef.current) {
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
                const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
                af.addDensity(rx, ry, 6.0 + energy * 35, color.r, color.g, color.b);
                af.addTemp(rx, ry, 0.8 + trebleBoost * 5);
              }
            }
          }

          // Auto-deploy insects periodically
          const insectAutoTypes = ['water_strider', 'ant', 'butterfly', 'beetle', 'fly', 'minnow', 'crab'] as const;
          const af0 = fluidsRef.current[0];
          if (af0 && af0.insects.length < 4 && Math.random() < rate * 0.004 + energy * 0.003) {
            const type = insectAutoTypes[Math.floor(Math.random() * insectAutoTypes.length)];
            af0.deployInsect(type);
          }
        }

        // ── Seed trigger ───────────────────────────────────────
        if (seedCount > lastSeedCount.current) {
          lastSeedCount.current = seedCount;
          for (const fluid of fluidsRef.current) {
            for (let i = 0; i < 8; i++) {
              const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
              const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
              const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
              fluid.addDensity(rx, ry, 10.0, color.r, color.g, color.b);
              fluid.addTemp(rx, ry, 2.0);
              fluid.addVelocity(rx, ry, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
            }
          }
        }

        if (isActiveRef.current) {
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
            const colorIndex = Math.floor((time * 0.25) % PALETTE_COUNT);
            const nextColorIndex = (colorIndex + 1) % PALETTE_COUNT;
            const blend = (time * 0.25) % 1;
            const c0_amb = PALETTE_RGB[colorIndex];
            const c1_amb = PALETTE_RGB[nextColorIndex];
            const ar = c0_amb.r * (1 - blend) + c1_amb.r * blend;
            const ag = c0_amb.g * (1 - blend) + c1_amb.g * blend;
            const ab = c0_amb.b * (1 - blend) + c1_amb.b * blend;

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
              const timeOffset = time * 0.3 + colorMod * Math.PI;
              const ci = Math.floor(timeOffset % PALETTE_COUNT);
              const ni = (ci + 1) % PALETTE_COUNT;
              const bl = timeOffset % 1;
              const ar_a = PALETTE_RGB[ci].r * (1 - bl) + PALETTE_RGB[ni].r * bl;
              const ag_a = PALETTE_RGB[ci].g * (1 - bl) + PALETTE_RGB[ni].g * bl;
              const ab_a = PALETTE_RGB[ci].b * (1 - bl) + PALETTE_RGB[ni].b * bl;

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

                // Center pulse — scales with density mapping
                const centerX = Math.floor(GRID_SIZE / 2);
                const centerY = Math.floor(GRID_SIZE / 2);
                activeFluid.addDensity(centerX, centerY, densityMod * 0.025 * autoAmp, ar_a, ag_a, ab_a);
                activeFluid.addTemp(centerX, centerY, densityMod * 0.018 * autoAmp);

                // Bass hit: radial velocity burst — scales with impact + auto mode
                if (bass01 > 0.25) {
                  const burstR = Math.round((isAutomatedRef.current ? 28 : 18) * Math.max(0.4, impactMul));
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
                  // In auto mode, also inject colored density in a ring on bass hits
                  if (isAutomatedRef.current && bass01 > 0.4) {
                    activeFluid.addDensity(centerX, centerY, bass01 * 0.8, ar_a, ag_a, ab_a);
                    activeFluid.addTemp(centerX, centerY, bass01 * 0.5);
                  }
                }

                // Mid: orbital injection points react to mid frequencies
                if (mid01 > 0.2) {
                  const orbitR = GRID_SIZE * 0.3;
                  const mx = Math.floor(centerX + Math.cos(time * 0.6) * orbitR);
                  const my = Math.floor(centerY + Math.sin(time * 0.8) * orbitR);
                  if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
                    activeFluid.addDensity(mx, my, mid01 * 0.04 * autoAmp, ar_a, ag_a, ab_a);
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

                // Energy: roaming swell of density
                if (energy01 > 0.15) {
                  const ex = Math.floor(centerX + Math.cos(time * 0.4) * GRID_SIZE * 0.25);
                  const ey = Math.floor(centerY + Math.sin(time * 0.3) * GRID_SIZE * 0.25);
                  activeFluid.addDensity(ex, ey, energy01 * 0.04 * autoAmp, ar_a, ag_a, ab_a);
                  if (isAutomatedRef.current) {
                    // Second roaming point on opposite orbit in auto mode
                    const ex2 = Math.floor(centerX + Math.cos(time * 0.4 + Math.PI) * GRID_SIZE * 0.22);
                    const ey2 = Math.floor(centerY + Math.sin(time * 0.3 + Math.PI) * GRID_SIZE * 0.22);
                    activeFluid.addDensity(ex2, ey2, energy01 * 0.035, ar_a, ag_a, ab_a);
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
          if (isActiveRef.current) fluid.step(currentSettings, currentAudioData, time, noise2D);

          // Check if there's content
          for (let i = 0; i < GRID_AREA; i++) {
            if (fluid.density[i] > 0.001) { hasContent = true; break; }
          }

          // Emergency seeding
          if (!hasContent && time % 5 < 0.02 && l === 0) {
            const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
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

          // Pack fluid data into textures
          for (let l = 0; l < fluidsRef.current.length; l++) {
            const fluid = fluidsRef.current[l];
            const td = tData[l];
            const scale = 255 / 8.0;
            for (let i = 0; i < GRID_AREA; i++) {
              const i4 = i * 4;
              td[i4]     = Math.max(0, Math.min(255, fluid.densityR[i] * scale + 0.5));
              td[i4 + 1] = Math.max(0, Math.min(255, fluid.densityG[i] * scale + 0.5));
              td[i4 + 2] = Math.max(0, Math.min(255, fluid.densityB[i] * scale + 0.5));
              td[i4 + 3] = Math.max(0, Math.min(255, fluid.density[i]  * scale + 0.5));
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
