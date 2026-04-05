import React, { useRef, useEffect, useMemo } from 'react';
import { createNoise2D } from 'simplex-noise';
import { AudioData } from '../hooks/useAudioAnalyzer';
import { VisualizerSettings } from '../types';
import { PALETTE_RGB, BUBBLE_COLORS, hexToRgb, getAudioValue, type AudioFeatureKey } from '../constants';

interface LiquidVisualizerProps {
  audioData: AudioData | null;
  settings: VisualizerSettings;
  seedCount?: number;
  selectedColor?: string;
  activeLayer?: number;
  clearTrigger?: number;
  activeTool?: 'dropper' | 'blow';
  isAutomated?: boolean;
  isActive?: boolean;
}

const GRID_SIZE = 128;
const GRID_AREA = GRID_SIZE * GRID_SIZE;

// Pre-compute the full-palette color count once.
const PALETTE_COUNT = PALETTE_RGB.length;

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  type: 'clear' | 'color';
  color?: string;
}

// ─── Fluid Simulation ────────────────────────────────────────────────

class FluidSimulation {
  size: number;
  dt: number;
  diff: number;
  visc: number;

  bubbles: Bubble[] = [];

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

  createBubble(x: number, y: number, radius: number, strength: number, spawnChance: number = 1.0) {
    const r2 = radius * radius;
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const distSq = i * i + j * j;
        if (distSq >= r2) continue;
        const nx = Math.floor(x + i);
        const ny = Math.floor(y + j);
        if (nx > 0 && nx < this.size - 1 && ny > 0 && ny < this.size - 1) {
          const idx = nx + ny * this.size;
          if (distSq > 0) {
            const dist = Math.sqrt(distSq);
            this.vx[idx] += (i / dist) * strength;
            this.vy[idx] += (j / dist) * strength;
          }
          this.density[idx] *= 0.1;
          this.densityR[idx] *= 0.1;
          this.densityG[idx] *= 0.1;
          this.densityB[idx] *= 0.1;
        }
      }
    }

    if (Math.random() < spawnChance) {
      // Spawn tiny — radius here is the disturbance zone, not the bubble size.
      const spawnRadius = 0.4 + Math.random() * 0.8;
      this.bubbles.push({
        x, y,
        vx: (Math.random() - 0.5) * Math.min(strength, 1.0),
        vy: (Math.random() - 0.5) * Math.min(strength, 1.0),
        radius: spawnRadius,
        life: 0,
        maxLife: 200 + Math.random() * 400,
        type: Math.random() > 0.6 ? 'color' : 'clear',
        color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
      });
    }

    for (const b of this.bubbles) {
      const dx = b.x - x;
      const dy = b.y - y;
      const distSq = dx * dx + dy * dy;
      const pushRadius = radius * 3;
      if (distSq > 0 && distSq < pushRadius * pushRadius) {
        const dist = Math.sqrt(distSq);
        const pushForce = (1 - dist / pushRadius) * strength * 2;
        b.vx += (dx / dist) * pushForce;
        b.vy += (dy / dist) * pushForce;
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
    // ── Dynamic speed ────────────────────────────────────────
    let dynamicSpeed = 0.05;
    if (audioData) dynamicSpeed += audioData.energy * 0.05;
    dynamicSpeed += settings.platePressure * 0.02;
    dynamicSpeed += settings.airVelocity * 0.02;
    dynamicSpeed += settings.automateRate * 0.02;

    let speedMultiplier = settings.globalSpeed / 0.05;
    if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
    dynamicSpeed *= speedMultiplier;

    this.dt = Math.min(Math.max(dynamicSpeed * 0.2, 0.0000001), 0.1);

    let visc = settings.viscosity === 'thick' ? 1.5 : 0.5;
    let diff = settings.diffusionRate;
    const dt = this.dt;
    let buoyancy = settings.buoyancy;
    let advection = settings.advection;
    let damping = settings.damping || 0.99;
    let heatDecay = settings.heatDecay || 0.98;
    let heatIntensity = settings.heatIntensity || 0.15;

    // ── Audio → Physics bridge ───────────────────────────────
    if (audioData && settings.audioMappings) {
      const velocityMod = getAudioValue(audioData, settings.audioMappings.velocity as AudioFeatureKey);
      const densityMod  = getAudioValue(audioData, settings.audioMappings.density as AudioFeatureKey);
      const colorMod    = getAudioValue(audioData, settings.audioMappings.color as AudioFeatureKey);
      const rotationMod = getAudioValue(audioData, settings.audioMappings.rotation as AudioFeatureKey);

      const bassNorm   = Math.min(1, audioData.bass   / 100);
      const midNorm    = Math.min(1, audioData.mid    / 100);
      const trebleNorm = Math.min(1, audioData.treble / 100);

      // Bass → radial outward impulse (simulates plate being struck by kick drum).
      // Multiple impact points create organic splash patterns.
      if (bassNorm > 0.5 && settings.platePressure > 0.05) {
        const impulseCount = Math.floor(1 + bassNorm * 2);
        for (let k = 0; k < impulseCount; k++) {
          const impX = Math.floor(this.size * 0.15 + Math.random() * this.size * 0.7);
          const impY = Math.floor(this.size * 0.15 + Math.random() * this.size * 0.7);
          const radius = Math.floor(6 + bassNorm * 18);
          const strength = bassNorm * settings.platePressure * 0.06;
          this.applyRadialImpulse(impX, impY, radius, strength);
        }
      }

      // Treble → fine-grained turbulence (high-frequency randomness like the document describes).
      if (trebleNorm > 0.35) {
        const turbCount = Math.floor(trebleNorm * 25 * (settings.airVelocity + 0.1));
        for (let k = 0; k < turbCount; k++) {
          const tx = Math.floor(1 + Math.random() * (this.size - 2));
          const ty = Math.floor(1 + Math.random() * (this.size - 2));
          const idx = tx + ty * this.size;
          if (this.density[idx] > 0.03) {
            const angle = Math.random() * Math.PI * 2;
            const strength = trebleNorm * 0.25;
            this.vx[idx] += Math.cos(angle) * strength;
            this.vy[idx] += Math.sin(angle) * strength;
          }
        }
      }

      // Mid → smooth vorticity injection (swirling orbital patterns).
      if (midNorm > 0.25 && settings.glassSmear > 0.05) {
        this.injectVorticity(midNorm * settings.glassSmear * 0.8, time, noise2D);
      }

      if (velocityMod > 0.7) {
        const squishForce = velocityMod * 0.02 * settings.platePressure;
        const cx = Math.floor(this.size / 2);
        const cy = Math.floor(this.size / 2);
        this.applySquish(cx, cy, Math.floor(10 + velocityMod * 20), squishForce);
      }
      heatIntensity += colorMod * 2.0;
      visc = visc * 0.9 + Math.max(0.1, visc - densityMod * 0.8) * 0.1;
      damping = Math.min(0.999, damping + rotationMod * 0.01);
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

    // 7. Immiscibility & fingering
    const surfaceTension = (settings.polarity || 0) * 0.15;
    this.applyImmiscibility(surfaceTension, time, noise2D);
    const fingeringStrength = (settings.polarity || 0) * 0.8;
    if (fingeringStrength > 0) this.applyFingering(fingeringStrength, time, noise2D);

    // 8. Vibration
    if (audioData && settings.vibrationFrequency > 0) {
      this.applyVibration(audioData.energy * settings.vibrationFrequency * 0.5, settings.vibrationFrequency * 10, time);
    }

    // 8.5-8.7 Dripping, smearing, airflow
    if (settings.rainDrip > 0) this.applyDripping(settings.rainDrip, dt, time, noise2D);
    if (settings.glassSmear > 0) this.applySmear(settings.glassSmear, dt, time, noise2D, audioData);
    if (settings.airVelocity > 0) this.applyAirflow(settings.airVelocity, dt, time, noise2D);

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
      if (speedSq > 1.0) {
        const factor = 1.0 / Math.sqrt(speedSq);
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

    // 11. Bubble system
    this.stepBubbles(settings, audioData);
  }

  // ── Bubble system (extracted from step for clarity) ──────────────
  private stepBubbles(settings: VisualizerSettings, audioData: AudioData | null) {
    let currentBubbleAmount = settings.bubbleAmount;
    if (audioData && settings.audioMappings) {
      currentBubbleAmount += getAudioValue(audioData, settings.audioMappings.bubbles as AudioFeatureKey) * 2.0;
    }
    if (currentBubbleAmount <= 0) return;

    // Spawn — always tiny at birth; grow only through merging.
    // bubbleSizeVariance adds a small jitter to the spawn radius.
    if (Math.random() < currentBubbleAmount * 0.5) {
      const x = Math.random() * this.size;
      const y = this.size - 2 - Math.random() * (this.size * 0.25);
      const jitter = (settings.bubbleSizeVariance || 1) * 0.3;
      const radius = 0.3 + Math.random() * 0.8 + jitter * Math.random();

      const c = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
      this.bubbles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.6 - 0.2,
        radius,
        life: 0,
        maxLife: 180 + Math.random() * 300,
        type: Math.random() > 0.6 ? 'color' : 'clear',
        color: c,
      });
    }

    // Update
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life++;

      const ix = Math.floor(b.x);
      const iy = Math.floor(b.y);

      if (ix > 0 && ix < this.size - 1 && iy > 0 && iy < this.size - 1) {
        const idx = ix + iy * this.size;
        b.vx += this.vx[idx] * 0.1;
        b.vy += this.vy[idx] * 0.1;
        b.vy -= settings.buoyancy * 0.05;
        if (settings.airVelocity > 0) {
          b.vy -= settings.airVelocity * 0.15;
          b.vx += (Math.random() - 0.5) * settings.airVelocity * 0.2;
        }
      }

      b.vx *= 0.95;
      b.vy *= 0.95;
      b.x += b.vx;
      b.y += b.vy;
      b.x += Math.sin(b.life * 0.1 + b.y) * 0.2;

      // Remove if dead / out of bounds
      if (b.life >= b.maxLife || b.x < 0 || b.x >= this.size || b.y < 0 || b.y >= this.size) {
        if (b.life >= b.maxLife && b.x >= 1 && b.x < this.size - 1 && b.y >= 1 && b.y < this.size - 1) {
          if (b.type === 'color' && b.color) {
            const rgb = hexToRgb(b.color);
            const burstAmount = Math.max(0.3, b.radius * 1.5);
            this.addDensity(Math.floor(b.x), Math.floor(b.y), burstAmount, rgb.r, rgb.g, rgb.b);
            this.addTemp(Math.floor(b.x), Math.floor(b.y), 0.5);
          } else {
            this.blowAir(Math.floor(b.x), Math.floor(b.y), Math.max(1, Math.floor(b.radius * 0.8)), 0.3);
          }
        }
        this.bubbles.splice(i, 1);
        continue;
      }

      // Merging
      let merged = false;
      for (let j = i - 1; j >= 0; j--) {
        const other = this.bubbles[j];
        const dx = b.x - other.x;
        const dy = b.y - other.y;
        const distSq = dx * dx + dy * dy;
        const rSum = b.radius + other.radius;
        if (distSq < (rSum * 0.8) * (rSum * 0.8)) {
          const m1 = b.radius * b.radius;
          const m2 = other.radius * other.radius;
          const totalM = m1 + m2;
          other.x = (b.x * m1 + other.x * m2) / totalM;
          other.y = (b.y * m1 + other.y * m2) / totalM;
          other.vx = (b.vx * m1 + other.vx * m2) / totalM;
          other.vy = (b.vy * m1 + other.vy * m2) / totalM;
          other.radius = Math.sqrt(totalM);
          other.life = Math.min(b.life, other.life);
          other.maxLife = Math.max(b.maxLife, other.maxLife);
          this.bubbles.splice(i, 1);
          merged = true;
          break;
        }
      }
      if (merged) continue;

      // Splitting — only when bubble grows large enough via merging.
      // bubbleBaseSize is the cap: above it, bubbles become unstable and split.
      const splitCap = Math.max(3, settings.bubbleBaseSize || 4);
      const speedSq = b.vx * b.vx + b.vy * b.vy;
      const splitChance = (b.radius > splitCap * 1.5 ? 0.03 : 0) + (speedSq > 1.5 ? 0.015 : 0);
      if (b.radius > splitCap && Math.random() < splitChance) {
        const r1 = b.radius * 0.7;
        b.radius = r1;
        const angle = Math.random() * Math.PI * 2;
        const pushForce = 0.3;
        const pushX = Math.cos(angle) * pushForce;
        const pushY = Math.sin(angle) * pushForce;
        b.vx += pushX;
        b.vy += pushY;
        this.bubbles.push({
          x: b.x - pushX, y: b.y - pushY,
          vx: b.vx - pushX * 2, vy: b.vy - pushY * 2,
          radius: r1, life: b.life, maxLife: b.maxLife, type: b.type, color: b.color,
        });
      }
    }
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
    const upwardForce = -strength * 150.0 * dt;
    for (let i = 0; i < GRID_AREA; i++) {
      if (this.density[i] > 0.01) {
        const xi = i % this.size;
        const yi = (i - xi) / this.size;
        this.vx[i] += noise2D(xi * 0.05, yi * 0.05 - time) * strength * 50.0 * dt;
        this.vy[i] += upwardForce + noise2D(yi * 0.05, xi * 0.05 + time) * strength * 50.0 * dt;
      }
    }
  }

  private applySmear(strength: number, dt: number, time: number, noise2D: (x: number, y: number) => number, audioData: AudioData | null) {
    const smearSpeed = time * (0.5 + (audioData ? audioData.energy * 0.5 : 0));
    const shearX = noise2D(smearSpeed, 100) * strength * 150.0 * dt;
    const shearY = noise2D(100, smearSpeed) * strength * 150.0 * dt;

    let joltX = 0, joltY = 0;
    if (audioData && audioData.volume > 80) {
      joltX = (Math.random() - 0.5) * strength * 200.0 * dt * (audioData.bass / 255);
      joltY = (Math.random() - 0.5) * strength * 200.0 * dt * (audioData.bass / 255);
    }

    const totalShearX = shearX + joltX;
    const totalShearY = shearY + joltY;

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
    const dripGravity = 2.0 * dt * strength;
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


// ─── React Component ─────────────────────────────────────────────────

export const LiquidVisualizer: React.FC<LiquidVisualizerProps> = ({
  audioData, settings, seedCount = 0, selectedColor = '#ffffff',
  activeLayer = 0, clearTrigger = 0, activeTool = 'dropper',
  isAutomated = false, isActive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasesRef = useRef<HTMLCanvasElement[]>([]);
  const fluidsRef = useRef<FluidSimulation[]>([]);
  const noise2D = useMemo(() => createNoise2D(), []);
  const lastSeedCount = useRef(seedCount);
  const lastClearTrigger = useRef(clearTrigger);
  const rotationAnglesRef = useRef<number[]>([]);

  // Pre-allocated ImageData objects — one per layer. Avoids GC churn.
  const imageDataRef = useRef<ImageData[]>([]);

  // Refs for reactive data (avoids useEffect thrashing).
  const audioDataRef = useRef(audioData);
  const settingsRef = useRef(settings);
  const selectedColorRef = useRef(selectedColor);
  const activeLayerRef = useRef(activeLayer);
  const activeToolRef = useRef(activeTool);
  const isAutomatedRef = useRef(isAutomated);
  const isActiveRef = useRef(isActive);
  const isMouseDownRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const simulationTimeRef = useRef(0);
  const lastTimeRef = useRef(Date.now() * 0.001);
  const grainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempLayerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
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
          for (let j = 0; j < 3; j++) {
            const rx = Math.floor(Math.random() * (GRID_SIZE - 40)) + 20;
            const ry = Math.floor(Math.random() * (GRID_SIZE - 40)) + 20;
            const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
            fluid.addDensity(rx, ry, 30.0, color.r, color.g, color.b);
            fluid.addTemp(rx, ry, 5.0);
          }
        }
        fluidsRef.current.push(fluid);
        rotationAnglesRef.current.push(Math.random() * Math.PI * 2);

        const canvas = document.createElement('canvas');
        canvas.width = GRID_SIZE;
        canvas.height = GRID_SIZE;
        offscreenCanvasesRef.current.push(canvas);

        // Pre-allocate ImageData for this layer.
        imageDataRef.current.push(new ImageData(GRID_SIZE, GRID_SIZE));
      }
    } else if (currentCount > targetCount) {
      fluidsRef.current = fluidsRef.current.slice(0, targetCount);
      rotationAnglesRef.current = rotationAnglesRef.current.slice(0, targetCount);
      offscreenCanvasesRef.current = offscreenCanvasesRef.current.slice(0, targetCount);
      imageDataRef.current = imageDataRef.current.slice(0, targetCount);
    }
  }, [settings.layerCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // ── Pre-bake a grain texture so we don't draw 200 rects per frame ──
    const bakeGrainTexture = (w: number, h: number, dark: boolean): HTMLCanvasElement => {
      const gc = document.createElement('canvas');
      gc.width = w;
      gc.height = h;
      const g = gc.getContext('2d')!;
      const color = dark ? '0,0,0' : '255,255,255';
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(${color},${Math.random() * 0.04})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      return gc;
    };
    let grainDark = bakeGrainTexture(canvas.width, canvas.height, false);
    let grainLight = bakeGrainTexture(canvas.width, canvas.height, true);
    let grainW = canvas.width;
    let grainH = canvas.height;

    // ── Mouse / touch handlers ─────────────────────────────────────
    const getTransformedMousePos = (clientX: number, clientY: number, rect: DOMRect) => {
      const cxp = clientX - rect.left - rect.width / 2;
      const cyp = clientY - rect.top - rect.height / 2;
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
      const offscreenCanvases = offscreenCanvasesRef.current;
      const currentAudioData = audioDataRef.current;
      const currentSettings = settingsRef.current;

      if (fluidsRef.current.length > 0 && offscreenCanvases.length > 0 && canvas.width > 0 && canvas.height > 0) {
        const now = Date.now() * 0.001;
        const realDt = now - lastTimeRef.current;
        lastTimeRef.current = now;

        // Dynamic speed calculation
        let dynamicSpeed = 0.05;
        if (currentAudioData) dynamicSpeed += currentAudioData.energy * 0.05;
        dynamicSpeed += currentSettings.platePressure * 0.02;
        dynamicSpeed += currentSettings.airVelocity * 0.02;
        dynamicSpeed += currentSettings.automateRate * 0.02;
        let speedMultiplier = currentSettings.globalSpeed / 0.05;
        if (speedMultiplier < 1.0) speedMultiplier *= speedMultiplier;
        dynamicSpeed *= speedMultiplier;
        const timeMultiplier = dynamicSpeed * 20.0;

        if (isActiveRef.current) {
          simulationTimeRef.current += realDt * timeMultiplier;
        }
        const time = simulationTimeRef.current;

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
        if (isMouseDownRef.current && !isAutomatedRef.current) {
          const { x, y } = mousePosRef.current;
          const af = fluidsRef.current[activeLayerRef.current];
          if (af && x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
            if (activeToolRef.current === 'blow') {
              af.createBubble(x, y, 12, 0.5, 0.1);
            } else {
              const rgb = hexToRgb(selectedColorRef.current);
              af.addDensity(x, y, 2.0, rgb.r, rgb.g, rgb.b);
              af.addTemp(x, y, 0.5);
            }
          }
        }

        // ── Automation logic ───────────────────────────────────
        if (isAutomatedRef.current && isActiveRef.current) {
          const rate = currentSettings.automateRate || 0.5;
          const energy = currentAudioData ? currentAudioData.energy : 0;
          const trebleBoost = currentAudioData ? currentAudioData.treble / 255 : 0;
          const spectralCentroid = currentAudioData ? currentAudioData.spectralCentroid : 0;

          if (Math.random() < rate * 0.3 + energy * 0.6) {
            const af = fluidsRef.current[Math.floor(Math.random() * fluidsRef.current.length)];
            if (af) {
              const rx = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
              const ry = Math.floor(Math.random() * (GRID_SIZE - 20)) + 10;
              const isBlow = Math.random() > 0.6 - (spectralCentroid / 128) * 0.4;
              if (isBlow) {
                af.createBubble(rx, ry, Math.floor(10 + Math.random() * 15 + energy * 20), 0.5 + Math.random() * 0.5 + energy * 2);
              } else {
                const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
                af.addDensity(rx, ry, 8.0 + Math.random() * 8.0 + energy * 20, color.r, color.g, color.b);
                af.addTemp(rx, ry, 1.0 + Math.random() * 2 + trebleBoost * 3);
              }
            }
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
            const ambientX = Math.floor(GRID_SIZE / 2 + Math.cos(time * 0.5) * GRID_SIZE * 0.2);
            const ambientY = Math.floor(GRID_SIZE / 2 + Math.sin(time * 0.7) * GRID_SIZE * 0.2);

            const colorIndex = Math.floor((time * 0.5) % PALETTE_COUNT);
            const nextColorIndex = (colorIndex + 1) % PALETTE_COUNT;
            const blend = (time * 0.5) % 1;
            const c0 = PALETTE_RGB[colorIndex];
            const c1 = PALETTE_RGB[nextColorIndex];
            const ar = c0.r * (1 - blend) + c1.r * blend;
            const ag = c0.g * (1 - blend) + c1.g * blend;
            const ab = c0.b * (1 - blend) + c1.b * blend;

            af.addDensity(ambientX, ambientY, 0.1, ar, ag, ab);
            af.addTemp(ambientX, ambientY, 0.05);

            // Boiling
            let dynamicHeatIntensity = currentSettings.heatIntensity;
            if (currentAudioData) dynamicHeatIntensity += (currentAudioData.treble / 255) * 2.0;
            if (dynamicHeatIntensity > currentSettings.boilingPoint) {
              const burstCount = Math.floor((dynamicHeatIntensity - currentSettings.boilingPoint) * 10);
              for (let i = 0; i < burstCount; i++) {
                const bx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                const by = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                af.createBubble(bx, by, Math.floor(Math.random() * 3) + 1, 1.5, 0.1);
                af.addTemp(bx, by, 2.0);
              }
            }

            // Ambient bubbles
            if (Math.random() < 0.15) {
              const bx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
              const by = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
              af.createBubble(bx, by, Math.floor(Math.random() * 2) + 1, 0.5, 0.2);
            }

            const driftX = noise2D(time * 0.1, 0) * 2;
            const driftY = noise2D(0, time * 0.1) * 2;
            af.addVelocity(ambientX, ambientY, driftX, driftY);
          }

          // ── Audio input to fluid ──────────────────────────
          if (currentAudioData && currentSettings.audioMappings) {
            const velocityMod = getAudioValue(currentAudioData, currentSettings.audioMappings.velocity as AudioFeatureKey);
            const densityMod  = getAudioValue(currentAudioData, currentSettings.audioMappings.density as AudioFeatureKey);
            const colorMod    = getAudioValue(currentAudioData, currentSettings.audioMappings.color as AudioFeatureKey);

            if (currentAudioData.volume > 5) {
              const centerX = Math.floor(GRID_SIZE / 2);
              const centerY = Math.floor(GRID_SIZE / 2);
              const radius = Math.floor(8 + densityMod * 15);

              const timeOffset = time * 1.5 + colorMod * Math.PI;
              const ci = Math.floor(timeOffset % PALETTE_COUNT);
              const ni = (ci + 1) % PALETTE_COUNT;
              const bl = timeOffset % 1;
              const ar_a = PALETTE_RGB[ci].r * (1 - bl) + PALETTE_RGB[ni].r * bl;
              const ag_a = PALETTE_RGB[ci].g * (1 - bl) + PALETTE_RGB[ni].g * bl;
              const ab_a = PALETTE_RGB[ci].b * (1 - bl) + PALETTE_RGB[ni].b * bl;

              const activeFluid = fluidsRef.current[activeLayerRef.current];
              if (activeFluid) {
                const r2 = radius * radius;
                for (let i = -radius; i <= radius; i++) {
                  for (let j = -radius; j <= radius; j++) {
                    if (i * i + j * j < r2) {
                      const x = centerX + i;
                      const y = centerY + j;
                      if (x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1) {
                        activeFluid.addDensity(x, y, densityMod * 0.5, ar_a, ag_a, ab_a);
                        activeFluid.addTemp(x, y, densityMod * 0.2);
                        activeFluid.addVelocity(x, y, i * 0.02 * currentSettings.platePressure, j * 0.02 * currentSettings.platePressure);
                      }
                    }
                  }
                }

                for (let i = 0; i < 15; i++) {
                  const x = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                  const y = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                  if (activeFluid.density[x + y * GRID_SIZE] > 0.05) {
                    const angle = noise2D(x * 0.05, y * 0.05 + time) * Math.PI * 2;
                    activeFluid.addVelocity(x, y, Math.cos(angle) * velocityMod * 1.5, Math.sin(angle) * velocityMod * 1.5);
                  }
                }
              }
            }
          }
        }

        // ── Step & render to offscreen canvases ───────────────
        let hasContent = false;
        const isDarkBlend = currentSettings.blendMode === 'multiply';

        for (let l = 0; l < fluidsRef.current.length; l++) {
          const fluid = fluidsRef.current[l];
          if (isActiveRef.current) fluid.step(currentSettings, currentAudioData, time, noise2D);

          const offscreenCanvas = offscreenCanvases[l];
          if (!offscreenCanvas) continue;
          const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
          if (!offscreenCtx) continue;

          // Re-use pre-allocated ImageData instead of creating a new one each frame.
          const imageData = imageDataRef.current[l];
          if (!imageData) continue;
          const data = imageData.data;

          for (let i = 0; i < GRID_AREA; i++) {
            const dr = fluid.densityR[i];
            const dg = fluid.densityG[i];
            const db = fluid.densityB[i];
            const d  = fluid.density[i];
            const idx = i * 4;

            if (d > 0.001) hasContent = true;

            // ── Scott Burns geometric mean (Beer-Lambert) color ──────
            // densityR/G/B store log-space absorptions.
            // channel = exp(-absorption/density) = r1^w1 * r2^w2 (weighted geometric mean).
            let r = 1, g = 1, b = 1;
            if (d > 0.001) {
              const norm = 1.0 / d;
              r = Math.exp(-dr * norm);
              g = Math.exp(-dg * norm);
              b = Math.exp(-db * norm);
            }

            // ── Beer-Lambert volumetric opacity ──────────────────────
            // alpha = 1 - exp(-k * thickness): exponential saturation,
            // thin films near-transparent, deep pools near-opaque.
            const thickness = d * 2.8;
            let alpha = 1.0 - Math.exp(-thickness);
            alpha = Math.min(0.95, alpha);

            // ── Sobel normal reconstruction (wider kernel = smoother normals) ──
            const xi = i % GRID_SIZE;
            const yi = (i - xi) / GRID_SIZE;
            if (xi > 1 && xi < GRID_SIZE - 2 && yi > 1 && yi < GRID_SIZE - 2) {
              // Sobel operator — matches the finite-difference approach described in SSFR
              const gradX = (
                -fluid.density[i - 1 - GRID_SIZE] - 2.0 * fluid.density[i - 1] - fluid.density[i - 1 + GRID_SIZE] +
                 fluid.density[i + 1 - GRID_SIZE] + 2.0 * fluid.density[i + 1] + fluid.density[i + 1 + GRID_SIZE]
              ) * 0.125;
              const gradY = (
                -fluid.density[i - 1 - GRID_SIZE] - 2.0 * fluid.density[i - GRID_SIZE] - fluid.density[i + 1 - GRID_SIZE] +
                 fluid.density[i - 1 + GRID_SIZE] + 2.0 * fluid.density[i + GRID_SIZE] + fluid.density[i + 1 + GRID_SIZE]
              ) * 0.125;
              const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);

              // Surface normal from depth gradient (cross product of tangent vectors)
              const zScale = 0.9;
              const nx = -gradX * zScale;
              const ny = -gradY * zScale;
              const len = Math.sqrt(nx * nx + ny * ny + 1.0);
              const nnx = nx / len;
              const nny = ny / len;
              const nnz = 1.0 / len;

              // Blinn-Phong diffuse + specular
              const lx = -0.577, ly = -0.577, lz = 0.577;
              const diffuse = Math.max(0, nnx * lx + nny * ly + nnz * lz);
              // Blinn-Phong half-vector specular (softer than Phong for liquids)
              const hx = (-lx + 0.0) * 0.5, hy = (-ly + 0.0) * 0.5, hz = (lz + 1.0) * 0.5;
              const hLen = Math.sqrt(hx*hx + hy*hy + hz*hz);
              const specNdotH = Math.max(0, nnx * hx/hLen + nny * hy/hLen + nnz * hz/hLen);
              const specular = Math.pow(specNdotH, 48) * 0.7;

              // Fresnel reflectance (Schlick approximation) — edges are more mirror-like
              // This simulates light refracting at the curved meniscus edge
              const cosTheta = Math.max(0, nnz); // dot with view direction (0,0,1)
              const f0 = 0.04; // water/oil-like base reflectance
              const fresnel = f0 + (1.0 - f0) * Math.pow(1.0 - cosTheta, 5);
              const specularTotal = specular + fresnel * 0.6;

              // Meniscus capillary rim — bright white edge at fluid boundaries.
              // The Young-Laplace curved surface reflects strongly at grazing angle.
              // Brightens thin-edge pixels where gradient is high (capillary rise zone).
              if (d > 0.015 && d < 0.6 && gradMag > 0.08) {
                const meniscusFactor = Math.min(1.0, gradMag * 2.5) * Math.max(0, 1.0 - d * 1.8);
                const rimBright = meniscusFactor * 0.45;
                r = Math.min(1, r + rimBright);
                g = Math.min(1, g + rimBright);
                b = Math.min(1, b + rimBright);
              }

              if (isDarkBlend) {
                const lf = 0.6 + 0.4 * diffuse;
                r *= lf; g *= lf; b *= lf;
                alpha = Math.max(0, alpha - specularTotal * 1.2);
              } else {
                const lf = 0.5 + 0.5 * diffuse;
                r = r * lf + specularTotal;
                g = g * lf + specularTotal;
                b = b * lf + specularTotal;
              }
            }

            if (isDarkBlend) alpha *= 0.6;

            data[idx]     = Math.max(0, Math.min(255, r * 255));
            data[idx + 1] = Math.max(0, Math.min(255, g * 255));
            data[idx + 2] = Math.max(0, Math.min(255, b * 255));
            data[idx + 3] = Math.max(0, Math.min(255, alpha * 255));
          }

          // Emergency seeding
          if (!hasContent && time % 5 < 0.02 && l === 0) {
            const color = PALETTE_RGB[Math.floor(Math.random() * PALETTE_COUNT)];
            fluid.addDensity(GRID_SIZE / 2, GRID_SIZE / 2, 5.0, color.r, color.g, color.b);
          }

          offscreenCtx.putImageData(imageData, 0, 0);
        }

        // ── Composite to main canvas ──────────────────────────
        ctx.fillStyle = isDarkBlend ? '#fff' : '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // LED Platform
        if (currentSettings.ledPlatform) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(time * currentSettings.ledSpeed * 0.5);
          const ledR = Math.max(canvas.width, canvas.height) * 0.8;
          const gradient = ctx.createConicGradient(0, 0, 0);

          if (currentSettings.ledMode === 'single') {
            gradient.addColorStop(0, currentSettings.ledColor);
            gradient.addColorStop(1, currentSettings.ledColor);
          } else if (currentSettings.ledMode === 'ocean') {
            gradient.addColorStop(0, '#000033'); gradient.addColorStop(0.25, '#003366');
            gradient.addColorStop(0.5, '#006699'); gradient.addColorStop(0.75, '#0099cc');
            gradient.addColorStop(1, '#000033');
          } else if (currentSettings.ledMode === 'fire') {
            gradient.addColorStop(0, '#330000'); gradient.addColorStop(0.25, '#cc0000');
            gradient.addColorStop(0.5, '#ff6600'); gradient.addColorStop(0.75, '#ffcc00');
            gradient.addColorStop(1, '#330000');
          } else if (currentSettings.ledMode === 'cyberpunk') {
            gradient.addColorStop(0, '#ff003c'); gradient.addColorStop(0.33, '#00f0ff');
            gradient.addColorStop(0.66, '#fcee0a'); gradient.addColorStop(1, '#ff003c');
          } else {
            gradient.addColorStop(0, '#ff0000'); gradient.addColorStop(0.16, '#ffff00');
            gradient.addColorStop(0.33, '#00ff00'); gradient.addColorStop(0.5, '#00ffff');
            gradient.addColorStop(0.66, '#0000ff'); gradient.addColorStop(0.83, '#ff00ff');
            gradient.addColorStop(1, '#ff0000');
          }

          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(0, 0, ledR, 0, Math.PI * 2); ctx.fill();

          const bevel = ctx.createRadialGradient(0, 0, ledR * 0.5, 0, 0, ledR);
          bevel.addColorStop(0, 'rgba(0,0,0,0)');
          bevel.addColorStop(0.8, 'rgba(0,0,0,0.4)');
          bevel.addColorStop(1, 'rgba(0,0,0,0.8)');
          ctx.fillStyle = bevel;
          ctx.beginPath(); ctx.arc(0, 0, ledR, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        ctx.imageSmoothingEnabled = true;

        // Ensure temp layer canvas matches
        if (!tempLayerCanvasRef.current || tempLayerCanvasRef.current.width !== canvas.width || tempLayerCanvasRef.current.height !== canvas.height) {
          const tc = document.createElement('canvas');
          tc.width = canvas.width; tc.height = canvas.height;
          tempLayerCanvasRef.current = tc;
        }
        const tCanvas = tempLayerCanvasRef.current;
        const tCtx = tCanvas.getContext('2d');

        if (tCtx) {
          for (let l = 0; l < fluidsRef.current.length; l++) {
            const offscreenCanvas = offscreenCanvases[l];
            const fluid = fluidsRef.current[l];
            if (!offscreenCanvas) continue;

            // Update rotation
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

              const rotationSpeed = currentSettings.rotationSpeed * 0.01 + Math.abs(rotationMod);
              rotationAnglesRef.current[l] += rotationSpeed * dirMod * realDt * timeMultiplier * 60;
            }

            tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
            tCtx.save();
            tCtx.translate(tCanvas.width / 2, tCanvas.height / 2);
            tCtx.rotate(rotationAnglesRef.current[l]);
            const scale = Math.max(tCanvas.width, tCanvas.height) * 1.5 / GRID_SIZE;
            tCtx.scale(scale, scale);
            tCtx.drawImage(offscreenCanvas, -GRID_SIZE / 2, -GRID_SIZE / 2, GRID_SIZE, GRID_SIZE);

            // Draw bubbles
            if (fluid.bubbles.length > 0) {
              for (const bub of fluid.bubbles) {
                const bx = bub.x - GRID_SIZE / 2;
                const by = bub.y - GRID_SIZE / 2;
                tCtx.beginPath();
                tCtx.arc(bx, by, bub.radius, 0, Math.PI * 2);

                if (bub.type === 'clear') {
                  tCtx.globalCompositeOperation = 'source-over';
                  const rimGrad = tCtx.createLinearGradient(bx - bub.radius, by - bub.radius, bx + bub.radius, by + bub.radius);
                  rimGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
                  rimGrad.addColorStop(0.3, 'rgba(255,255,255,0.1)');
                  rimGrad.addColorStop(0.8, 'rgba(255,255,255,0.0)');
                  rimGrad.addColorStop(1, 'rgba(255,255,255,0.4)');
                  tCtx.strokeStyle = rimGrad;
                  tCtx.lineWidth = 1.5 / scale;
                  tCtx.stroke();
                  tCtx.fillStyle = 'rgba(255,255,255,0.8)';
                  tCtx.beginPath();
                  tCtx.arc(bx - bub.radius * 0.3, by - bub.radius * 0.3, bub.radius * 0.15, 0, Math.PI * 2);
                  tCtx.fill();
                } else {
                  tCtx.globalCompositeOperation = 'source-over';
                  const grad = tCtx.createRadialGradient(
                    bx - bub.radius * 0.3, by - bub.radius * 0.3, bub.radius * 0.1,
                    bx, by, bub.radius
                  );
                  grad.addColorStop(0, '#ffffff');
                  grad.addColorStop(0.4, bub.color || '#fff');
                  grad.addColorStop(1, bub.color || '#fff');
                  tCtx.fillStyle = grad;
                  tCtx.fill();
                  tCtx.strokeStyle = 'rgba(255,255,255,0.4)';
                  tCtx.lineWidth = 1 / scale;
                  tCtx.stroke();
                }
              }
            }

            tCtx.restore();

            ctx.globalCompositeOperation = l === 0 ? 'source-over' : currentSettings.blendMode as GlobalCompositeOperation;
            ctx.drawImage(tCanvas, 0, 0);
          }
        }

        ctx.globalCompositeOperation = 'source-over';

        // ── Film grain (pre-baked texture) ─────────────────────
        if (canvas.width !== grainW || canvas.height !== grainH) {
          grainDark = bakeGrainTexture(canvas.width, canvas.height, false);
          grainLight = bakeGrainTexture(canvas.width, canvas.height, true);
          grainW = canvas.width;
          grainH = canvas.height;
        }
        ctx.drawImage(isDarkBlend ? grainLight : grainDark, 0, 0);
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
    };
  }, [noise2D, seedCount]);

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{
          filter: `blur(${settings.gooeyEffect * 15}px) contrast(${1.5 + settings.gooeyEffect * 8})`,
          transform: 'scale(1.05)',
        }}
        id="liquid-canvas"
      />
    </div>
  );
};
