/**
 * Everything a desk is allowed to put a fader on.
 *
 * The desks used to ride `LEARNABLE_SETTINGS` — the forty a MIDI control can
 * be taught — and that was the whole of what could reach a strip. The settings
 * panel meanwhile draws eighty-six sliders. So a fader that exists in the app,
 * that you can see and drag, could not be put on the surface you actually play
 * the show from: the answer to "I want Refraction out where I can reach it"
 * was "open Settings, scroll, and find it again next song".
 *
 * This is one list of what a control *is* — its label, its range, and the
 * settings section it lives in — used by three things that would otherwise
 * each keep their own: Perform's rides, Design's recipe, and the pin chips in
 * the settings panel itself.
 *
 * **Why the ranges are not always the panel's.** For the forty MIDI already
 * knows, the range here is MIDI's, not the slider's. They genuinely differ:
 * Speed is 0.005–0.3 to a fader and 0–1 to the panel, because a controller
 * wants the part of the range that is musically useful across its travel and
 * the panel wants all of it. Taking MIDI's is what keeps a strip behaving
 * exactly as it did before any of this existed, and keeps one binding from
 * meaning two different things depending on whether a hand or a fader moved
 * it.
 *
 * `scripts/desk.mjs` reads the panel's own source and fails if a slider
 * appears there with no entry here, or an entry here names a section that
 * does not exist — the two lists cannot drift in silence.
 */

import { LEARNABLE_SETTINGS } from './midi';
import type { VisualizerSettings } from '../types';

export interface DeskSpec {
  key: keyof VisualizerSettings;
  label: string;
  min: number;
  max: number;
  /** Which settings section it is shown in, so a picker can group by it. */
  section: string;
}

/** Where each of the MIDI forty is shown in the panel. */
const SECTION_OF: Record<string, string> = {
  dimmer: 'audio-input',
  audioImpact: 'audio-mappings',
  automateRate: 'automation',
  globalSpeed: 'audio-input',
  dyeBudget: 'look',
  turbulenceScale: 'look',
  plateRock: 'look',
  beatSqueeze: 'show',
  fingering: 'show',
  beads: 'show',
  dishSpread: 'show',
  cells: 'show',
  bubbles: 'look',
  saturationBoost: 'look',
  edgeRelief: 'look',
  lacing: 'look',
  lightPlay: 'lamp',
  lampMotion: 'lamp',
  lampHotspot: 'lamp',
  secondLamp: 'lamp',
  iridescence: 'lamp',
  camera: 'camera',
  focus: 'camera',
  aperture: 'camera',
  bloom: 'camera',
  markMix: 'mark',
  markX: 'mark',
  markY: 'mark',
  markScale: 'mark',
  sharpness: 'look',
  granulation: 'look',
  macroZoom: 'macro',
  macroSync: 'macro',
  macroChase: 'macro',
  hueJourney: 'show',
  backgroundLoop: 'show',
  dishVignette: 'show',
  lumia: 'projectors',
  chemistry: 'projectors',
  gelWheel: 'projectors',
  beatLead: 'audio-input',
  filmDrive: 'projectors',
  filmImpact: 'projectors',
  soundImpact: 'audio-mappings',
  sceneDrive: 'room',
  sceneHands: 'room',
  sceneImpact: 'room',
  kaleidoscope: 'kaleidoscope',
  kaleidoSpin: 'kaleidoscope',
  kaleidoZoom: 'kaleidoscope',};

const FROM_MIDI: DeskSpec[] = LEARNABLE_SETTINGS.map(s => ({ ...s, section: SECTION_OF[String(s.key)] ?? 'look' }));

/**
 * The rest of the panel: every other slider it draws, at the range it draws
 * it at. Generated from the panel's source and kept honest by `desk.mjs`.
 */
const FROM_PANEL: DeskSpec[] = [
  { key: 'sensitivity', label: "Sensitivity", min: 0.1, max: 3, section: 'audio-input' },
  { key: 'bassBoost', label: "Bass Boost", min: 1, max: 3, section: 'audio-input' },
  { key: 'beatPrediction', label: "Beat Prediction", min: 0, max: 1, section: 'audio-input' },
  { key: 'turbulenceDetail', label: "Turbulence Detail", min: 1, max: 4, section: 'look' },
  { key: 'grainScale', label: "Grain Size", min: 60, max: 900, section: 'look' },
  { key: 'blobSurfaceTension', label: "Blob Surface Tension", min: 0, max: 1, section: 'look' },
  { key: 'layerScaleVariety', label: "Layer Scale Variety", min: 0, max: 1, section: 'look' },
  { key: 'boundaryContrast', label: "Boundary Glow", min: 0, max: 1, section: 'look' },
  { key: 'glossiness', label: "Glossiness", min: 0, max: 1, section: 'look' },
  { key: 'postBlurRadius', label: "Post Blur", min: 0, max: 1.5, section: 'look' },
  { key: 'chromaticAberration', label: "Chromatic Aberration", min: 0, max: 1, section: 'camera' },
  { key: 'refraction', label: "Refraction", min: 0, max: 1, section: 'camera' },
  { key: 'microDroplets', label: "Micro-Droplets", min: 0, max: 1, section: 'camera' },
  { key: 'thinFilm', label: "Thin Film", min: 0, max: 1, section: 'camera' },
  { key: 'sceneDeadzone', label: "Deadzone", min: 0, max: 1, section: 'room' },
  { key: 'sceneSmooth', label: "Smoothing", min: 0, max: 1, section: 'room' },
  { key: 'gelSpeed', label: "Gel Speed (rpm)", min: 0, max: 3, section: 'projectors' },
  { key: 'lampWarmth', label: "Lamp Warmth", min: 0, max: 1, section: 'projectors' },
  { key: 'exposure', label: "Exposure", min: 0, max: 1, section: 'projectors' },
  { key: 'filmMix', label: "Film Mix", min: 0, max: 1, section: 'projectors' },
  { key: 'filmKey', label: "Film Key", min: 0, max: 0.9, section: 'projectors' },
  { key: 'macroHold', label: "Shot Length", min: 1, max: 15, section: 'macro' },
  { key: 'macroCells', label: "Paint Cells", min: 0, max: 1, section: 'macro' },
  { key: 'macroCellScale', label: "Cell Size", min: 0.15, max: 1.5, section: 'macro' },
  { key: 'macroLacing', label: "Lacing", min: 0, max: 1, section: 'macro' },
  { key: 'macroDepth', label: "Depth / Focus", min: 0, max: 1, section: 'macro' },
  { key: 'macroEdgeDetail', label: "Edge Detail", min: 0, max: 1, section: 'macro' },
  { key: 'macroRelief', label: "Relief / 3D", min: 0, max: 1, section: 'macro' },
  { key: 'platePressure', label: "Plate Pressure", min: 0, max: 1, section: 'squish' },
  { key: 'glassSmear', label: "Glass Smear", min: 0, max: 1, section: 'squish' },
  { key: 'rainDrip', label: "Rain Drip", min: 0, max: 1, section: 'squish' },
  { key: 'polarity', label: "Polarity (Repulsion)", min: 0, max: 1, section: 'squish' },
  { key: 'heatIntensity', label: "Heat Intensity", min: 0, max: 1, section: 'heat' },
  { key: 'boilingPoint', label: "Boiling Point", min: 0, max: 1, section: 'heat' },
  { key: 'evaporationRate', label: "Evaporation Rate", min: 0, max: 1, section: 'heat' },
  { key: 'heatDecay', label: "Heat Decay", min: 0.8, max: 1, section: 'heat' },
  { key: 'airVelocity', label: "Blow Velocity", min: 0, max: 1, section: 'interaction' },
  { key: 'vibrationFrequency', label: "Vibration Freq", min: 0, max: 1, section: 'interaction' },
  { key: 'diffusionRate', label: "Diffusion Rate", min: 0, max: 0.001, section: 'physics' },
  { key: 'buoyancy', label: "Buoyancy", min: 0, max: 2, section: 'physics' },
  { key: 'advection', label: "Advection", min: 0, max: 2, section: 'physics' },
  { key: 'damping', label: "Damping (Friction)", min: 0.8, max: 1, section: 'physics' },
  // The mark. Opacity above all, because taking a logo off between sets is a
  // thing a hand does on a fader rather than a thing anyone opens a panel for.
  { key: 'markMix', label: "Logo Opacity", min: 0, max: 1, section: 'mark' },
  { key: 'markScale', label: "Logo Size", min: 0.03, max: 1, section: 'mark' },
  { key: 'markX', label: "Logo Across", min: 0, max: 1, section: 'mark' },
  { key: 'markY', label: "Logo Up", min: 0, max: 1, section: 'mark' },
  { key: 'layerCount', label: "Projector Layers", min: 1, max: 2, section: 'layers' },
  { key: 'rotationSpeed', label: "Rotation Speed", min: 0, max: 1, section: 'layers' },
  { key: 'ledSpeed', label: "LED Rotation Speed", min: 0, max: 2, section: 'layers' },
  { key: 'centerGravity', label: "Center Gravity (Concave)", min: 0, max: 1, section: 'layers' },
  { key: 'gooeyEffect', label: "Gooey Blending", min: 0, max: 1, section: 'layers' },];

/** Everything that can be pinned to a desk, MIDI's forty first. */
export const PINNABLE: DeskSpec[] = [...FROM_MIDI, ...FROM_PANEL];

export const PIN_RANGE = new Map<string, DeskSpec>(PINNABLE.map(s => [String(s.key), s]));

/** Which desk a pin is for. */
export type DeskSurface = 'perform' | 'design';

/**
 * What Design's recipe starts as: the eight a look is actually built from.
 *
 * It used to be a constant inside the bench, which is why the bench could not
 * be changed — the eight were the right eight and also the only eight.
 */
export const DEFAULT_RECIPE: (keyof VisualizerSettings)[] = [
  'globalSpeed', 'turbulenceScale', 'audioImpact', 'beatSqueeze',
  'bloom', 'granulation', 'macroZoom', 'automateRate',
];

/** How many a strip will hold before it stops being a surface you can read. */
export const MAX_PINS = 14;

const KEYS: Record<DeskSurface, string> = {
  perform: 'chromaglass-ride-keys',
  design: 'chromaglass-recipe-keys',
};

export function loadPins(desk: DeskSurface, fallback: (keyof VisualizerSettings)[]): (keyof VisualizerSettings)[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS[desk]) ?? 'null');
    // A key saved by an older build may no longer exist; dropping it here
    // rather than at render time means the strip and this list agree about
    // how many things are on it.
    if (Array.isArray(saved)) return saved.filter((k: string) => PIN_RANGE.has(k));
  } catch { /* private window */ }
  return fallback;
}

export function savePins(desk: DeskSurface, keys: (keyof VisualizerSettings)[]): void {
  try { localStorage.setItem(KEYS[desk], JSON.stringify(keys)); } catch { /* private window */ }
}

/** Add or remove one, keeping the order a strip was built in. */
export function togglePin(
  keys: (keyof VisualizerSettings)[],
  key: keyof VisualizerSettings,
  on: boolean,
): (keyof VisualizerSettings)[] {
  if (on) return keys.includes(key) ? keys : [...keys, key].slice(0, MAX_PINS);
  return keys.filter(k => k !== key);
}
