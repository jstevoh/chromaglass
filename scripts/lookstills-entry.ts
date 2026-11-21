// Bundled into the lab page by `npm run lookstills` (scripts/lookstills.mjs):
// seeds and steps each shipped look with the app's real FluidSimulation and
// WebGPUFluid, then draws it through the real WebGPUPlate shader at 240x150
// so every card still in public/looks/<id>.webp matches the current plate.
import './lab-entry.ts';
import { createNoise2D } from 'simplex-noise';
import { WebGPUFluid } from '../src/gpu/fluid';
import { WebGPUPlate, setLeanDisplay } from '../src/gpu/plate';
import { WebGPUPostChain } from '../src/gpu/post';
import { fillPlateUniforms, magnetsOnPlate, type PlateView } from '../src/gpu/plateUniforms';
import { PRESETS } from '../src/presets';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../src/types';
import {
  FILM_BINS,
  FILM_BIN_SCALE,
  GRID_SCALE,
  GRID_SIZE,
  TURING_DRIFT_PER_SECOND,
  TURING_ITERATIONS_PER_SECOND,
  macroAmountOf,
} from '../src/sim/constants';
import { FluidSimulation } from '../src/sim/fluidSimulation';
import { doseLiquid, pourLiquid } from '../src/sim/tools';
import { DICE } from '../src/sim/dice';
import { phasePour } from '../src/lib/phasePour';
import { PRESET_CONTRACTS, PRESET_INJECT_STYLES, PRESET_LIQUIDS, phasePourShape } from '../src/presetPlate';
import { areaCentre, areaDye, areaFamily, areaForBand, pickArea, plateAreas, pointInArea, type PlateArea } from '../src/lib/plateAreas';
import { makeRng, restartStreams, setShowSeed } from '../src/lib/rng';
import { stageClocks, turnClocks } from '../src/lib/stageClocks';
import { MacroCamera } from '../src/lib/macroCamera';
import { CELL_TRAVEL } from '../src/lib/detailFlow';
import { BeadField, beadPopulation } from '../src/lib/beads';
import { TURING_PRODUCT, turingInk } from '../src/lib/chemistry';
import { lookTarget as dyeLookTarget, pourRoomOf, sparseDark as isSparseDark } from '../src/lib/dyeTarget';
import { PALETTE_RGB, getAudioValue, harmonyColor, harmonyCycle, type AudioFeatureKey } from '../src/constants';
import { AreaHands, fluidSink, musicDyeIn } from '../src/lib/areaCords';
import { cordReading, PatchBay, type PatchContext } from '../src/lib/sceneMap';
import { HitSource } from '../src/lib/hitSource';
import { SOURCE_NAMES, type AudioReading, type OnsetState, type SourceName } from '../src/lib/audioFeatures';
import { BAND_STEP_S } from '../src/lib/simulatedMusic';
import { levels01, musicHands } from '../src/lib/soundLevels';
import { bassBoostGain, bassPressFor, bassRouteValue } from '../src/lib/squish';
import { throwKickBloom } from '../src/lib/kickBloom';
import { BubbleField, MAX_BUBBLES } from '../src/lib/bubbles';
import { stepPlateBubbles } from '../src/sim/speciesPoll';
import { makeHandTilt, stepHandTilt, tipPlate } from '../src/lib/handTilt';
import { HOLD_TILT, kickRock, lampRock, restingHand, rockPast, rockSwing, stepRock, swayAt } from '../src/lib/plateRock';
import type { AudioData } from '../src/hooks/useAudioAnalyzer';

const EMPTY_BYTES = new Uint8Array(512);

interface SynthBandState {
  kickAt: number | null;
  snareAt: number | null;
  hatsAt: number | null;
  lastSixteenth: number;
}

function makeBandState(): SynthBandState {
  return { kickAt: null, snareAt: null, hatsAt: null, lastSixteenth: -1 };
}

/** Deterministic 122-BPM groove shaped like SimulatedMusic so kicks, snares, hats, bass, mids and treble play the plate. */
function synthAudio(state: SynthBandState, time: number): { audio: AudioData; kick: boolean } {
  const s = Math.floor(time / BAND_STEP_S);
  const beatStep = s % 16;
  const bar = Math.floor(s / 16);
  const newSixteenth = s > state.lastSixteenth;
  state.lastSixteenth = s;

  const isKick = newSixteenth && beatStep % 4 === 0;
  const isSnare = newSixteenth && (beatStep === 4 || beatStep === 12);
  const isHats = newSixteenth && beatStep % 2 === 0;

  if (isKick) state.kickAt = time;
  if (isSnare) state.snareAt = time;
  if (isHats) state.hatsAt = time;

  const age = (at: number | null, halfLife: number) => (at === null ? 0 : Math.exp(-(time - at) / halfLife));
  const kickEnv = age(state.kickAt, 0.12);
  const snareEnv = age(state.snareAt, 0.09);
  const hatsEnv = age(state.hatsAt, 0.045);

  const bass = 25 + 62 * kickEnv + 12 * Math.sin(time * 2.1);
  const mid = 34 + 30 * snareEnv + 24 * (0.5 + 0.5 * Math.sin(time * 1.6 + bar * 0.7));
  const treble = 22 + 48 * hatsEnv + 16 * (0.5 + 0.5 * Math.cos(time * 2.9));
  const energy = Math.min(1, 0.38 + 0.35 * kickEnv + 0.18 * snareEnv + 0.1 * hatsEnv);
  const timbre = 42 + 38 * (0.5 + 0.5 * Math.sin(time * 0.9 + 0.8));
  const complexity = 38 + 44 * (0.5 + 0.5 * Math.sin(time * 1.4 + snareEnv));
  const volume = Math.min(100, 38 + 38 * kickEnv + 18 * snareEnv + 12 * hatsEnv);

  const mkOnset = (hit: boolean, strength: number, at: number | null, last: number): OnsetState => ({ hit, strength: hit ? strength : 0, at, last });
  const kickOnset = mkOnset(isKick, 0.9, state.kickAt, 0.9);
  const snareOnset = mkOnset(isSnare, 0.8, state.snareAt, 0.8);
  const hatsOnset = mkOnset(isHats, 0.75, state.hatsAt, 0.75);

  const onsets = {} as Record<SourceName, OnsetState>;
  for (const name of SOURCE_NAMES) {
    onsets[name] = name === 'kick' || name === 'bass'
      ? kickOnset
      : name === 'snare'
        ? snareOnset
        : name === 'hats'
          ? hatsOnset
          : mkOnset(false, 0, null, 0);
  }

  const band4 = Math.min(1, 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.4)) + 0.35 * snareEnv);
  const pitchClasses = [0, 3, 7, 10, 5, 2, 7, 0];
  const pc = pitchClasses[Math.floor(s / 4) % pitchClasses.length];

  const features: AudioReading = {
    beat: kickOnset,
    time,
    level: volume / 100,
    kick: kickEnv,
    bass: Math.min(1, bass / 100),
    snare: snareEnv,
    hats: hatsEnv,
    note: 0.45 + 0.35 * Math.sin(time * 1.3),
    tonalLow: Math.min(1, 0.3 + 0.5 * kickEnv),
    tonalMid: Math.min(1, 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.5))),
    tonalHigh: Math.min(1, 0.25 + 0.6 * hatsEnv),
    pitch: 36 + pc,
    pitchClass: pc,
    pitchFine: pc,
    chroma: Array.from({ length: 12 }, (_, i) => (i === pc ? 0.6 : i === (pc + 7) % 12 ? 0.3 : 0.01)),
    brightness: timbre / 100,
    timbre: timbre / 100,
    complexity: complexity / 100,
    bands: [
      Math.min(1, 0.3 + 0.65 * kickEnv),
      Math.min(1, bass / 100),
      Math.min(1, 0.3 + 0.4 * Math.sin(time * 1.9) * 0.5 + 0.3 * kickEnv),
      band4,
      Math.min(1, mid / 100),
      Math.min(1, 0.25 + 0.5 * snareEnv),
      Math.min(1, treble / 100),
      Math.min(1, 0.2 + 0.7 * hatsEnv),
    ],
    onsets,
    db: new Array(SOURCE_NAMES.length).fill(-24),
  };

  return {
    audio: {
      frequencyData: EMPTY_BYTES,
      timeDomainData: EMPTY_BYTES,
      volume,
      bass,
      mid,
      treble,
      energy,
      spectralCentroid: timbre,
      timbre,
      complexity,
      passage: 0.95,
      calibration: null,
      features,
    },
    kick: isKick,
  };
}

let cachedDevice: { device: GPUDevice; float32Filterable: boolean } | null = null;

async function getDevice(): Promise<{ device: GPUDevice; float32Filterable: boolean }> {
  if (cachedDevice) return cachedDevice;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const wantLimits: Record<string, number> = {};
  if (adapter.limits.maxStorageBufferBindingSize) {
    wantLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
  }
  if (adapter.limits.maxBufferSize) {
    wantLimits.maxBufferSize = adapter.limits.maxBufferSize;
  }
  const float32Filterable = adapter.features.has('float32-filterable');
  const device = await adapter.requestDevice({
    requiredFeatures: float32Filterable ? ['float32-filterable'] : [],
    requiredLimits: wantLimits,
  });
  device.lost.then((i) => console.log('lookstills device lost', i.message));
  cachedDevice = { device, float32Filterable };
  return cachedDevice;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function encodeWebp(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  maxBytes: number,
): Promise<{ bytes: string; size: number; quality: number }> {
  const full = new OffscreenCanvas(srcW, srcH);
  const fctx = full.getContext('2d')!;
  fctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), srcW, srcH), 0, 0);

  const out = new OffscreenCanvas(dstW, dstH);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(full, 0, 0, dstW, dstH);

  for (const quality of [0.88, 0.82, 0.75, 0.68, 0.58, 0.45]) {
    const blob = await out.convertToBlob({ type: 'image/webp', quality });
    if (blob.size <= maxBytes || quality === 0.45) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      return { bytes: bytesToBase64(buf), size: buf.length, quality };
    }
  }
  throw new Error('unreachable');
}

const lookStillsApi = {
  lookIds(): string[] {
    return PRESETS.map((p) => p.id);
  },
  async renderLook(
    id: string,
    opts: { width?: number; height?: number; grid?: number; steps?: number; maxBytes?: number; seed?: number } = {},
  ): Promise<{ id: string; width: number; height: number; bytes: string; size: number; quality: number }> {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) throw new Error(`Unknown look "${id}"`);

    const dstW = opts.width ?? 240;
    const dstH = opts.height ?? 150;
    const srcW = dstW * 4;
    const srcH = dstH * 4;
    const grid = opts.grid ?? 256;
    const baseSteps = opts.steps ?? 360;
    const maxBytes = opts.maxBytes ?? 19_500;

    const { device, float32Filterable } = await getDevice();
    setLeanDisplay(device, 'rgba8unorm', null);

    const settings: VisualizerSettings = {
      ...DEFAULT_SETTINGS,
      ...preset.settings,
      layerCount: 1,
    };

    setShowSeed(opts.seed ?? 1);
    restartStreams(`look:${id}`, 'plate.');
    const noise2D = createNoise2D(makeRng(7, 'plate.noise').float);

    const solver = new WebGPUFluid(device, grid, GRID_SIZE, { float32Filterable });
    const plate = new WebGPUPlate(device, 'rgba8unorm');
    const wantStock = (settings.stock ?? 0) > 0.001;
    const post = wantStock ? new WebGPUPostChain(device, 'rgba8unorm') : null;

    try {
      const fluid = new FluidSimulation(GRID_SIZE, settings.diffusionRate ?? 0, 0.0001, 0.01);
      fluid.layerIndex = 0;
      fluid.attachGpu(solver);
      const harmony = fluid.seedPreset(id, noise2D);

      if ((settings.phaseAmount ?? 0) > 0.002) {
        for (const d of phasePour(phasePourShape(id), settings.phaseScale ?? 0.4)) {
          solver.addPhase(d.x, d.y, d.r, d.amount);
        }
      }

      if ((settings.thinGap ?? 1) > 0.5) await solver.prepareThinGap();
      if ((settings.soapFilm ?? 0) > 0.002) await solver.prepareFilm();
      await plate.drop.prepare();

      // Run one initial step before pouring liquids so fluid.lastSettings and
      // fluid.thinGap are populated when liquid.onDeposit fires.
      fluid.step(settings, 0, noise2D);

      const areas = plateAreas(id);
      const liquids = PRESET_LIQUIDS[id] ?? [];
      const styles = PRESET_INJECT_STYLES[id] ?? ['drop'];
      const contractDyes = PRESET_CONTRACTS[id] ?? harmony;
      if (areas) {
        for (const a of areas) {
          for (let i = 0; i < 6; i++) {
            const pt = pointInArea(a, GRID_SIZE, DICE.lay, 0.8);
            pourLiquid(fluid, a.liquid, pt.x, pt.y, 1.2);
          }
        }
      } else {
        for (let i = 0; i < 15; i++) {
          doseLiquid(
            fluid,
            liquids,
            10 + DICE.lay.float() * (GRID_SIZE - 20),
            10 + DICE.lay.float() * (GRID_SIZE - 20),
            1.2,
          );
        }
      }

      const areaCycle = (a: PlateArea, t: number) =>
        harmonyCycle(areaFamily(a).map((_, k) => areaDye(a, contractDyes, 0, k)), t);
      const patchBay = new PatchBay(settings, 1);
      const hitSource = new HitSource();
      const areaHands = new AreaHands();
      const areaSink = fluidSink(fluid, GRID_SCALE, (f, lid, x, y, s) => pourLiquid(f, lid, x, y, s));
      const bandState = makeBandState();
      const bubbles = new BubbleField(GRID_SIZE);
      const rock = restingHand();
      const hand = makeHandTilt();

      const clocks = stageClocks();
      let rot = 0;
      let kaleidoPhase = 0;
      let simTime = 0;
      const dt = 1 / 60;
      const macroCam = new MacroCamera();
      let shot = { cx: 0.5, cy: 0.5, zoom: 1 };
      const macroOn = !!settings.macroMode;
      const macroAmount = macroOn ? 1 : macroAmountOf(settings);
      let filmLevel = 0.3;
      let filmGain = 4.5;
      const bins = new Uint32Array(FILM_BINS);
      let turingClock = 0;
      let turingDrift = 0;
      let lastSoapAt = 0;
      let areaKicks = 0;
      let stepSettings = settings;
      let picSettings = settings;
      let bubbleDebug = { count: 0, strength: 0 };

      const totalSteps =
        opts.steps ??
        ((settings.moireAmount ?? 0) > 0.01
          ? id === 'moire-garden'
            ? 540
            : 180
          : (settings.soapFilm ?? 0) > 0.002 ||
              (settings.chemistry ?? 0) > 0.002 ||
              (settings.clearFilm ?? 0) > 0.002 ||
              id === 'microscopic-chaos'
            ? 720
            : baseSteps);

      for (let k = 0; k < totalSteps; k++) {
        simTime += dt;
        const { audio, kick } = synthAudio(bandState, simTime);
        hitSource.update(audio.features ?? null, simTime);
        const ctx: PatchContext = {
          room: null,
          film: null,
          sound: audio,
          shape: null,
          hits: hitSource,
          notes: null,
          roomImpact: 0,
          filmImpact: 0,
          soundImpact: settings.soundImpact ?? 1,
          shapeImpact: 0,
        };
        patchBay.fold(settings, ctx, 1, simTime * 1000);
        picSettings = patchBay.global;
        stepSettings = patchBay.layer(0);

        // Ambient seeding (matches LiquidVisualizer.tsx ambientSeedRef = true default).
        {
          const phase = simTime * 0.18;
          const injPts = [
            { x: GRID_SIZE / 2 + Math.cos(phase) * GRID_SIZE * 0.28, y: GRID_SIZE / 2 + Math.sin(phase * 1.3) * GRID_SIZE * 0.28 },
            { x: GRID_SIZE / 2 + Math.cos(phase * 0.7 + Math.PI) * GRID_SIZE * 0.3, y: GRID_SIZE / 2 + Math.sin(phase * 0.9 + 1.0) * GRID_SIZE * 0.3 },
            { x: GRID_SIZE / 2 + Math.cos(phase * 1.1 + 2.1) * GRID_SIZE * 0.22, y: GRID_SIZE / 2 + Math.sin(phase * 0.6 + 4.2) * GRID_SIZE * 0.33 },
          ];
          injPts.forEach((pt, idx) => {
            const px = Math.floor(pt.x);
            const py = Math.floor(pt.y);
            if (px > 0 && px < GRID_SIZE - 1 && py > 0 && py < GRID_SIZE - 1) {
              const c = harmonyCycle(harmony, simTime * 0.25 + idx * 1.4);
              fluid.addDensity(px, py, 0.05, c.r, c.g, c.b);
              fluid.addTemp(px, py, 0.02);
            }
          });
        }

        // Occasional soap burst when surfactantFlow is active (matches show loop).
        const soapDial = stepSettings.surfactantFlow ?? 0;
        if (soapDial > 0.001 && simTime - lastSoapAt > 2.6 - 1.8 * soapDial) {
          lastSoapAt = simTime;
          solver.addMix?.(0.15 + DICE.music.float() * 0.7, 0.15 + DICE.music.float() * 0.7, 0.03 + 0.04 * DICE.music.float(), { soap: 1 });
        }

        // Music hands (matches LiquidVisualizer loop): beat blooms, pressure/bursts, streams, sparks.
        const impact = stepSettings.audioImpact ?? 0.45;
        if (impact > 0.01 && stepSettings.audioMappings) {
          const densityMod = getAudioValue(audio, stepSettings.audioMappings.density as AudioFeatureKey);
          const colorMod = getAudioValue(audio, stepSettings.audioMappings.color as AudioFeatureKey);
          const velRoute = stepSettings.audioMappings.velocity as AudioFeatureKey;
          const boostGain = bassBoostGain(stepSettings.bassBoost);
          const bassGain = velRoute === 'bass' ? boostGain : 1;
          const velRaw = velRoute === 'bass' ? bassRouteValue(audio.bass, boostGain) : getAudioValue(audio, velRoute);
          const vel01 = velRoute === 'energy' ? velRaw : Math.min(1, velRaw * (100 / 70));
          const pitchAngle = ((audio.features?.pitchClass ?? 0) / 12) * Math.PI * 2;
          const timbreColour = stepSettings.audioMappings.color === 'timbre';
          const colFor = (off: number) =>
            harmonyCycle(
              harmony,
              timbreColour ? colorMod * (harmony.length - 1) + off * 0.25 : simTime * 0.1 + pitchAngle + colorMod * Math.PI + off,
            );
          const { bass: bass01, treble: treble01, energy: energy01, mid: mid01 } = levels01(audio);
          const impactMul = impact / 0.45;
          const autoAmp = musicHands(impact, audio.passage);
          const centerX = Math.floor(GRID_SIZE / 2);
          const centerY = Math.floor(GRID_SIZE / 2);
          const aStyle = () => DICE.music.pick(styles) ?? 'drop';
          if (areas && kick) areaKicks++;
          const bassArea = areas ? areaForBand(areas, 'bass', areaKicks) : null;
          const bassAt = bassArea ? areaCentre(bassArea, GRID_SIZE) : null;
          const bassX = bassAt ? Math.floor(bassAt.x) : centerX;
          const bassY = bassAt ? Math.floor(bassAt.y) : centerY;
          const turn = Math.floor(simTime / 8);
          const areaTime = simTime * 0.3 + colorMod * Math.PI;
          const clearPhase = fluid.seedMean === 0 && (stepSettings.phaseAmount ?? 0) > 0.002;
          const target = dyeLookTarget(fluid.seedMean, stepSettings.dyeBudget ?? 0.85, fluid.seedBudget);
          const pourRoom = clearPhase ? 0 : pourRoomOf(fluid.meanDensity / Math.max(0.06, target));
          const pourDt = Math.min(1, Math.max(0.04, fluid.dt / 0.05)) * pourRoom;
          const sparseDark = isSparseDark(stepSettings.lampGround, target);
          const contStyle = () => {
            const st = aStyle();
            return sparseDark && (st === 'spray' || st === 'splatter') ? 'drop' : st;
          };
          if (densityMod > 0.005) {
            const pc = bassArea ? areaCycle(bassArea, areaTime) : colFor(0);
            if (pourDt > 0.001) {
              fluid.autoInject(contStyle(), bassX, bassY, densityMod * 0.025 * autoAmp * pourDt, pc.r, pc.g, pc.b, densityMod, false, musicDyeIn(bassArea));
            }
            fluid.addTemp(bassX, bassY, densityMod * 0.018 * autoAmp);
          }
          fluid.pressBass(
            bassX,
            bassY,
            Math.min(bassArea ? bassArea.r * GRID_SIZE : Infinity, 18 * GRID_SCALE * 1.5 * Math.max(0.6, Math.min(1.5, impactMul))),
            bassPressFor(velRaw, velRoute === 'energy', impact, audio.passage, bassGain),
          );
          if (vel01 > 0.25 && !fluid.thinGap) {
            const burstR = Math.round(Math.min(bassArea ? bassArea.r * GRID_SIZE : Infinity, 18 * GRID_SCALE * Math.max(0.4, impactMul)));
            const bassStr = (vel01 - 0.25) * autoAmp * bassGain;
            for (let bj = -burstR; bj <= burstR; bj += 3) {
              for (let bi = -burstR; bi <= burstR; bi += 3) {
                const dist = Math.hypot(bi, bj);
                if (dist < 2 || dist > burstR) continue;
                const bx = bassX + bi;
                const by = bassY + bj;
                if (bx > 0 && bx < GRID_SIZE - 1 && by > 0 && by < GRID_SIZE - 1) {
                  const f = bassStr * 0.65 * (1 - dist / burstR);
                  fluid.addVelocity(bx, by, (bi / dist) * f, (bj / dist) * f);
                }
              }
            }
          }
          const bloomGain = Math.max(0, Math.min(4, stepSettings.kickBloom ?? 1));
          if (kick && bloomGain > 0) {
            const ringCol = bassArea ? areaCycle(bassArea, areaTime + 1.0) : colFor(2.0);
            const ringR = bassArea ? bassArea.r * GRID_SIZE * (0.35 + bass01 * 0.5) : (10 + bass01 * 14) * GRID_SCALE;
            throwKickBloom(fluid, DICE.music, GRID_SIZE, bassX, bassY, ringR, ringCol, bass01 * boostGain, autoAmp * pourDt * bloomGain * musicDyeIn(bassArea), bloomGain);
            const da = DICE.music.angle();
            const doseDist = ringR * (0.95 + 0.15 * DICE.music.float());
            if (bassArea) {
              pourLiquid(fluid, bassArea.liquid, bassX + Math.cos(da) * doseDist, bassY + Math.sin(da) * doseDist, bass01 * Math.min(1, bloomGain));
            } else {
              doseLiquid(fluid, liquids, centerX + Math.cos(da) * doseDist, centerY + Math.sin(da) * doseDist, bass01 * Math.min(1, bloomGain));
            }
          }
          if (mid01 > 0.2) {
            const midArea = areas ? areaForBand(areas, 'mid', turn) : null;
            const midAt = midArea ? areaCentre(midArea, GRID_SIZE) : { x: centerX, y: centerY };
            const midCol = midArea ? areaCycle(midArea, areaTime + 0.65) : colFor(1.3);
            const orbitR = midArea ? midArea.r * GRID_SIZE * 0.8 : GRID_SIZE * 0.3;
            const mx = Math.floor(midAt.x + (noise2D(simTime * 0.25, 12.3) * 0.7 + Math.cos(simTime * 0.45) * 0.3) * orbitR);
            const my = Math.floor(midAt.y + (noise2D(47.1, simTime * 0.25) * 0.7 + Math.sin(simTime * 0.55) * 0.3) * orbitR);
            if (mx > 0 && mx < GRID_SIZE - 1 && my > 0 && my < GRID_SIZE - 1) {
              if (pourDt > 0.001) {
                fluid.autoInject(contStyle(), mx, my, mid01 * 0.06 * autoAmp * pourDt, midCol.r, midCol.g, midCol.b, mid01, false, musicDyeIn(midArea));
              }
              fluid.addTemp(mx, my, mid01 * 0.025 * autoAmp);
            }
          }
          if (treble01 > 0.2) {
            const trebleArea = areas ? areaForBand(areas, 'treble', turn + 1) : null;
            const sparkCol = trebleArea ? areaCycle(trebleArea, areaTime + 1.55) : colFor(3.1);
            const sparks = Math.floor(treble01 * 2 * autoAmp);
            for (let s = 0; s < sparks; s++) {
              const sp = trebleArea ? pointInArea(trebleArea, GRID_SIZE, DICE.music) : null;
              const sx = sp ? Math.floor(sp.x) : DICE.music.int(GRID_SIZE - 20) + 10;
              const sy = sp ? Math.floor(sp.y) : DICE.music.int(GRID_SIZE - 20) + 10;
              fluid.addTemp(sx, sy, treble01 * 0.6 * autoAmp);
              for (let ddy = -1; ddy <= 1; ddy++) {
                for (let ddx = -1; ddx <= 1; ddx++) {
                  const w = ddx === 0 && ddy === 0 ? 1.0 : 0.45;
                  if (sparseDark) {
                    if (pourDt > 0.001) {
                      fluid.addDensity(sx + ddx, sy + ddy, treble01 * 0.12 * autoAmp * pourDt * w * musicDyeIn(trebleArea), sparkCol.r, sparkCol.g, sparkCol.b);
                    }
                  } else {
                    fluid.addDensity(
                      sx + ddx,
                      sy + ddy,
                      treble01 * 1.1 * w * musicDyeIn(trebleArea),
                      sparkCol.r * 0.5 + 0.5,
                      sparkCol.g * 0.5 + 0.5,
                      sparkCol.b * 0.5 + 0.5,
                    );
                  }
                }
              }
            }
          }
          if (energy01 > 0.15) {
            const swellArea = areas ? areaForBand(areas, 'mid', turn + 2) : null;
            const swellAt = swellArea ? areaCentre(swellArea, GRID_SIZE) : { x: centerX, y: centerY };
            const swellR = swellArea ? swellArea.r * GRID_SIZE * 0.6 : GRID_SIZE * 0.28;
            const swellCol = swellArea ? areaCycle(swellArea, areaTime + 1.1) : colFor(2.6);
            const ex = Math.floor(swellAt.x + (noise2D(simTime * 0.18, 71.9) * 0.7 + Math.cos(simTime * 0.32) * 0.3) * swellR);
            const ey = Math.floor(swellAt.y + (noise2D(88.4, simTime * 0.18) * 0.7 + Math.sin(simTime * 0.27) * 0.3) * swellR);
            if (pourDt > 0.001) {
              fluid.autoInject(contStyle(), ex, ey, energy01 * 0.06 * autoAmp * pourDt, swellCol.r, swellCol.g, swellCol.b, energy01, false, musicDyeIn(swellArea));
            }
          }
        }

        // Area cords (Velvet Underground paddles, soap well heater, syrup bottles, etc.)
        const acts = areaHands.step(stepSettings.sceneMappings, areas, (m, band) => cordReading(ctx, m, simTime * 1000, band), dt);
        if (acts.length > 0) {
          const fill = fluid.meanDensity / Math.max(0.06, dyeLookTarget(fluid.seedMean, stepSettings.dyeBudget ?? 0.85, fluid.seedBudget));
          areaHands.lay(areaSink, GRID_SIZE, dt, (a, bottle) => PALETTE_RGB[areaDye(a, contractDyes, 0, bottle)], fill);
        }

        // Evolve automation drops/air (matches LiquidVisualizer automation loop).
        const rate = Math.max(0, Math.min(3, stepSettings.automateRate ?? 0.12));
        if (DICE.evolve.float() < rate * 0.025) {
          const area = areas ? pickArea(areas, DICE.evolve) : null;
          const at = area ? pointInArea(area, GRID_SIZE, DICE.evolve) : null;
          const rx = at ? Math.floor(at.x) : DICE.evolve.int(GRID_SIZE - 20) + 10;
          const ry = at ? Math.floor(at.y) : DICE.evolve.int(GRID_SIZE - 20) + 10;
          if (DICE.evolve.float() < 0.25) {
            fluid.blowAir(rx, ry, 2, 0.05, true);
          } else {
            const c = area ? PALETTE_RGB[harmony[areaFamily(area)[0] % harmony.length]] : harmonyColor(harmony);
            const style = DICE.evolve.pick(styles) ?? 'drop';
            fluid.autoInject(style, rx, ry, 2.6, c.r, c.g, c.b, 0.3, false, area ? musicDyeIn(area) : 1);
            if (area) pourLiquid(fluid, area.liquid, rx, ry, 0.7);
            else doseLiquid(fluid, liquids, rx, ry, 0.7);
          }
        }

        fluid.stepLiquid(dt, fluid.dt * (stepSettings.advection ?? 0.45) * (GRID_SIZE - 2));

        // Plate rock & trapped-air bubbles (matches LiquidVisualizer.tsx).
        {
          const R = Math.max(0, Math.min(3, stepSettings.plateRock ?? 0));
          const b01 = Math.min(1, audio.bass / 70);
          if (R > 0 && kick) kickRock(rock, b01, 1, Math.floor(simTime / BAND_STEP_S) % 16 < 8 ? 0 : 2, BAND_STEP_S * 16);
          stepRock(rock, dt);
          const [swingX, swingY] = rockSwing(rock, R, ...swayAt(noise2D, simTime));
          stepHandTilt(hand, { x: 0, y: 0, at: -10 }, simTime, stepSettings.plateTiltX, stepSettings.plateTiltY, dt);
          tipPlate(fluid, hand, swingX, swingY);
          fluid.rockGain = rockPast(R);
          fluid.swingX = swingX;
          fluid.swingY = swingY;

          const bubbleAmt = Math.max(0, Math.min(1, stepSettings.bubbles ?? 0));
          if (bubbleAmt > 0) {
            const room = bubbles.bubbles.length < 3 + Math.round(14 * bubbleAmt);
            const drive = Math.min(1, Math.max(0, stepSettings.audioImpact ?? 0.45) / 0.45);
            const kickAir = room && kick && DICE.music.float() < 0.45 * bubbleAmt * drive;
            const heldAir = !kickAir && room && b01 > 0.5 && DICE.music.float() < 0.003 * bubbleAmt * drive;
            if (kickAir || heldAir) {
              const dens = fluid.readDensity;
              let bx = GRID_SIZE / 2;
              let by = GRID_SIZE / 2;
              let best = -1;
              for (let t = 0; t < 6; t++) {
                const a = DICE.music.angle();
                const rr = (6 + DICE.music.float() * 40) * GRID_SCALE;
                const px = Math.round(GRID_SIZE / 2 + Math.cos(a) * rr);
                const py = Math.round(GRID_SIZE / 2 + Math.sin(a) * rr);
                const d = dens[Math.max(0, Math.min(GRID_SIZE - 1, px)) + Math.max(0, Math.min(GRID_SIZE - 1, py)) * GRID_SIZE];
                if (d > best) {
                  best = d;
                  bx = px;
                  by = py;
                }
              }
              bubbles.spawn(bx, by, (0.9 + b01 * 1.2) * GRID_SCALE, 2 + DICE.music.int(3), 3 * GRID_SCALE);
            }
            const tx = Number.isFinite(fluid.tiltX) ? fluid.tiltX : swingX * HOLD_TILT;
            const ty = Number.isFinite(fluid.tiltY) ? fluid.tiltY : swingY * HOLD_TILT;
            stepPlateBubbles(bubbles, fluid, stepSettings, dt, tx, ty);
            const live = Math.min(bubbles.bubbles.length, MAX_BUBBLES);
            solver.setBubbles(bubbles.packed, live, 0.25, bubbles.packedFinger);
            fluid.depositBubbleRims(bubbles.packed, live);
          } else {
            solver.setBubbles(bubbles.packed, 0, 0.25, bubbles.packedFinger);
          }
        }

        fluid.step(stepSettings, simTime, noise2D);
        turnClocks(clocks, dt, picSettings);
        rot += (stepSettings.rotationSpeed ?? 0) * dt;
        kaleidoPhase += (stepSettings.kaleidoSpin ?? 0) * dt * Math.PI * 2;

        const chemAmt = Math.max(0, Math.min(1, stepSettings.chemistry ?? 0));
        if ((chemAmt > 0 || solver.reagentLive) && solver.stepChemistry) {
          if (chemAmt > 0 && (!solver.chemLive || DICE.chem.float() < 0.004)) {
            solver.seedChemistry?.(
              0.15 + DICE.chem.float() * 0.7,
              0.15 + DICE.chem.float() * 0.7,
              0.01 + DICE.chem.float() * 0.016,
            );
          }
          const p = stepSettings.chemistryPattern ?? 0;
          const feed = 0.03 + p * 0.01;
          const kill = 0.055 + p * 0.005;
          const w = Math.pow(2, ((stepSettings.chemistryWidth ?? 0.5) - 0.5) * 4);
          const print0 = Math.max(0, Math.min(1, stepSettings.turingPrint ?? 0));
          turingClock += dt;
          const driftWanted = print0 > 0 ? Math.max(0, Math.min(1, stepSettings.turingDrift ?? 0)) : 0;
          const chemIterations = 3;
          const driftStep = (TURING_DRIFT_PER_SECOND / TURING_ITERATIONS_PER_SECOND) * chemIterations;
          turingDrift =
            print0 > 0
              ? turingDrift + Math.max(-driftStep, Math.min(driftStep, driftWanted - turingDrift))
              : 0;
          solver.stepChemistry(chemIterations, feed, kill, 0.16 * w, 0.08 * w, chemAmt > 0 ? 1 : 0, turingDrift, turingClock);
          const c =
            chemAmt > 0 && print0 === 0
              ? harmonyCycle(harmony, simTime * 0.08)
              : print0 > 0
                ? turingInk(stepSettings.turingInk ?? 0)
                : TURING_PRODUCT;
          const seededReef = fluid.seedMean !== null && fluid.seedMean > 0 && print0 === 0;
          const chemTarget = dyeLookTarget(seededReef ? fluid.seedMean : null, stepSettings.dyeBudget ?? 0.85, fluid.seedBudget);
          const chemRoom = seededReef ? Math.max(0, Math.min(1, (1.0 - fluid.meanDensity / Math.max(0.06, chemTarget)) * 2.5)) : 1;
          const chemDt = seededReef ? Math.min(1, Math.max(0.05, fluid.dt / 0.05)) * chemRoom : 1;
          const amount = (chemAmt > 0 ? chemAmt : 0.6) * 0.02 * chemDt;
          solver.depositChemistry(solver.fields.chem!, amount, [c.r, c.g, c.b], 0.22, print0, chemAmt > 0 ? 1 : 0, seededReef ? 1 : 0);
        }

        // Sync readback every step (or every 2 steps) so stepDecay, MacroCamera,
        // and film exposure histogram track the real GPU plate just as the app does.
        if (k % 2 === 1 || k === totalSteps - 1) {
          await device.queue.onSubmittedWorkDone();
          fluid.syncFromGpu();
        }

        if (macroOn) {
          const zoom = stepSettings.macroZoom ?? 2.1;
          shot = macroCam.update(
            { density: fluid.readDensity, vx: fluid.readVx, vy: fluid.readVy, size: GRID_SIZE },
            dt,
            {
              zoom,
              chase: stepSettings.macroChase ?? 0.6,
              hold: Math.max(0.5, stepSettings.macroHold ?? 5),
              floor: filmLevel,
              spanX: 1 / zoom,
              spanY: 1 / zoom,
              mode: stepSettings.macroCamera ?? 'auto',
            },
          );
        }

        if (macroOn || (stepSettings.exposure ?? 0) > 0.001) {
          bins.fill(0);
          let samples = 0;
          for (let j = 1; j < GRID_SIZE - 1; j += 3) {
            for (let i = 1; i < GRID_SIZE - 1; i += 3) {
              const d = fluid.readDensity[i + j * GRID_SIZE];
              const b = d <= 0 ? 0 : Math.min(FILM_BINS - 1, (d * FILM_BIN_SCALE) | 0);
              bins[b]++;
              samples++;
            }
          }
          const paintCount = samples * 0.14;
          const peakCount = samples * 0.03;
          let acc = 0;
          let levelBin = 0;
          let peakBin = FILM_BINS - 1;
          for (let b = FILM_BINS - 1; b >= 0; b--) {
            acc += bins[b];
            if (acc >= peakCount && peakBin === FILM_BINS - 1) peakBin = b;
            if (acc >= paintCount) {
              levelBin = b;
              break;
            }
          }
          let level = levelBin / FILM_BIN_SCALE;
          if (macroOn) {
            const maxDim = Math.max(srcW, srcH) * 1.5;
            const hx = (0.5 * srcW) / maxDim / Math.max(1, shot.zoom);
            const hy = (0.5 * srcH) / maxDim / Math.max(1, shot.zoom);
            let inView = 0;
            let n = 0;
            for (let sj = -3; sj <= 3; sj++) {
              for (let si = -3; si <= 3; si++) {
                const gx = Math.floor((shot.cx + (si / 3) * hx) * GRID_SIZE);
                const gy = Math.floor((shot.cy + (sj / 3) * hy) * GRID_SIZE);
                if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) continue;
                inView += Math.max(0, fluid.readDensity[gx + gy * GRID_SIZE]);
                n++;
              }
            }
            if (n > 0) level = Math.min(level, (0.6 * inView) / n);
          }
          const peak = Math.max(level + 0.35, peakBin / FILM_BIN_SCALE);
          const slew = 1 - Math.exp(-2.5 * dt);
          filmLevel += (level - filmLevel) * slew;
          filmGain += (3.2 / (peak - level) - filmGain) * slew;
        }
      }

      if ((settings.beads ?? 0) > 0.01) {
        const beads = new BeadField(GRID_SIZE);
        beads.drops = settings.beadDrops ?? 0;
        if (beads.drops > 0) {
          beads.setPalette(harmony.map((i) => PALETTE_RGB[i] ?? PALETTE_RGB[0]));
        }
        const [count, radius] = beadPopulation(settings.beads ?? 0, settings.macroMode);
        beads.populate(count, radius, (bx, by) => {
          const ix = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx)));
          const iy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by)));
          return fluid.readDensity[ix + iy * GRID_SIZE];
        });
        plate.setBeads(beads);
      }

      await device.queue.onSubmittedWorkDone();
      fluid.syncFromGpu();

      const bubbleAmt = Math.max(0, Math.min(1, picSettings.bubbles ?? 0));
      const bubbleCount = bubbleAmt > 0 ? bubbles.pack() : 0;
      bubbleDebug = { count: Math.min(MAX_BUBBLES, bubbleCount), strength: bubbleAmt > 0 ? Math.min(0.9, 0.35 + bubbleAmt * 0.8) : 0 };
      const [rockLx, rockLy] = lampRock(rock, picSettings.plateRock, picSettings.frameSway);
      const motion = Math.max(0, Math.min(1, picSettings.lampMotion ?? 0));
      const lx = 0.5 + noise2D(simTime * 0.021, 11.3) * 0.34 * motion + rockLx;
      const ly = 0.5 + noise2D(13.7, simTime * 0.017) * 0.34 * motion + rockLy;
      const lx2 = 0.5 - (lx - 0.5) * 0.7 + noise2D(simTime * 0.019, 27.1) * 0.3 * motion;
      const ly2 = 0.5 - (ly - 0.5) * 0.7 + noise2D(29.3, simTime * 0.023) * 0.3 * motion;

      const view: PlateView = {
        settings: picSettings,
        time: simTime,
        shot,
        macroAmount,
        isDarkBlend: picSettings.blendMode === 'multiply',
        flowRate: CELL_TRAVEL,
        cellClock: fluid.cellClock,
        rotations: [rot, 0],
        harmony,
        lamp: { x: lx, y: ly, x2: lx2, y2: ly2 },
        magnets: fluid.lastStep ? magnetsOnPlate(fluid.lastStep) : [],
        gelAngle: clocks.gel,
        moireTurn: clocks.moire,
        kaleidoPhase,
        layer1: { zoom: 1, dx: 0, dy: 0 },
        bubbles: bubbleDebug,
        bubblePack: { packed: bubbles.packed, shape: bubbles.packedShape },
        dimmerGain: 1,
        filmLevel,
        filmGain,
        mark: null,
        film: { kind: 'none', video: null },
      };

      fillPlateUniforms(plate.pack, {
        view,
        fluids: [{ gpu: solver }],
        width: srcW,
        height: srcH,
        derived: true,
        grid,
        postChain: !!post,
      });

      const target = device.createTexture({
        size: [srcW, srcH],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const enc = device.createCommandEncoder();
      if (post) {
        plate.draw(enc, post.sceneView(srcW, srcH), { width: srcW, height: srcH }, [solver.fields], undefined, true, post.pictureFormat);
        post.stock(enc, 7, {
          stock: picSettings.stock ?? 0,
          stockType: picSettings.stockType ?? 0,
          grain: picSettings.stockGrain ?? 0,
          grainSize: picSettings.stockGrainSize ?? 2,
          weave: picSettings.stockWeave ?? 0,
          gate: picSettings.stockGate ?? 0,
          filmFrame: Math.floor(totalSteps * (24 / 60)),
        });
        post.finish(enc, target.createView(), {
          dimmer: picSettings.dimmer ?? 1,
          markOn: 0,
          markRect: [0.5, 0.5, 0.5, 0.5],
          markGrade: [1, 1, 1, 0],
          markBlend: 0,
        });
      } else {
        plate.draw(enc, target.createView(), { width: srcW, height: srcH }, [solver.fields], undefined, false);
      }

      const row = Math.ceil((srcW * 4) / 256) * 256;
      const readBuf = device.createBuffer({
        size: row * srcH,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      enc.copyTextureToBuffer({ texture: target }, { buffer: readBuf, bytesPerRow: row }, [srcW, srcH]);
      device.queue.submit([enc.finish()]);

      await readBuf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(readBuf.getMappedRange());
      const rgba = new Uint8ClampedArray(srcW * srcH * 4);
      for (let y = 0; y < srcH; y++) {
        rgba.set(src.subarray(y * row, y * row + srcW * 4), y * srcW * 4);
      }
      readBuf.unmap();
      readBuf.destroy();
      target.destroy();

      const encoded = await encodeWebp(rgba, srcW, srcH, dstW, dstH, maxBytes);
      return { id, width: dstW, height: dstH, ...encoded };
    } finally {
      post?.dispose();
      solver.dispose();
      plate.dispose();
    }
  },
};

(window as unknown as { lookStills: typeof lookStillsApi }).lookStills = lookStillsApi;
