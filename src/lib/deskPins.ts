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
 * settings section it lives in — used by everything that would otherwise keep
 * its own: Perform's rides, Design's recipe, the pin chips in the settings
 * panel, the patch bay, the phone's sliders and a sequence stage's glides. MIDI
 * is the other half of it: its forty-odd come from `LEARNABLE_SETTINGS`.
 *
 * **One range per setting, and it is the sheet's.** This used to say the
 * opposite — that a fader wants the musically useful part of a control's travel
 * and the panel wants all of it, so the two should differ. What that bought, in
 * practice, was Speed at 0–0.3 on the sheet, 0.005–0.3 on a fader, 0.005–0.6
 * on the phone and 0.005–0.15 in a sequence stage: four ideas of one control,
 * so the same position meant a different speed depending on which surface a
 * hand was on, and a value set on one could not be reached from another. The
 * sheet's ranges have since been cut to the useful part (Speed stops at 0.3
 * because the timestep stops growing near 0.21), so there is nothing left for a
 * second range to be for. Every surface rides the sheet's, and `npm run panel`
 * reads the sheet's own source to hold them to it.
 *
 * **A control that only takes whole steps says so.** The kaleidoscope's folds
 * are five buttons on the sheet, and the octaves of turbulence detail and the
 * layer count are whole numbers there. A fader swept across any of them wrote
 * everything in between, which the sheet cannot show: the renderer rounds 3.4
 * folds to three, a count the sheet does not offer, and a layer count between
 * one and two is read as one in some places and two in others. `step` is how a
 * surface knows to land on a step.
 *
 * `scripts/panel.mjs` reads the panel's own source and fails if a slider
 * appears there with no entry here, with a different range from the one here,
 * or an entry here names a section that does not exist — the lists cannot
 * drift in silence.
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
  /**
   * Set only on a control that takes whole steps (folds, octaves, layers): the
   * size of one. Every surface that can move it lands on a step.
   */
  step?: number;
}

/** Where each of the MIDI forty is shown in the panel. */
const SECTION_OF: Record<string, string> = {
  dimmer: 'master',
  audioImpact: 'audio-mappings',
  automateRate: 'automation',
  globalSpeed: 'master',
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
  particles: 'look',
  particleMix: 'look',
  granulation: 'look',
  macroZoom: 'macro',
  macroSync: 'macro',
  macroChase: 'macro',
  hueJourney: 'show',
  backgroundLoop: 'show',
  dishVignette: 'show',
  lumia: 'lamp',
  chemistry: 'lamp',
  gelWheel: 'lamp',
  beatLead: 'audio-input',
  filmDrive: 'film',
  // The four masters, with the patch bay they pull down.
  filmImpact: 'patches',
  soundImpact: 'patches',
  shapeImpact: 'patches',
  sceneImpact: 'patches',
  sceneDrive: 'room',
  sceneHands: 'room',
  kaleidoscope: 'kaleidoscope',
  kaleidoSpin: 'kaleidoscope',
  kaleidoZoom: 'kaleidoscope',};

const FROM_MIDI: DeskSpec[] = LEARNABLE_SETTINGS.map(s => ({ ...s, section: SECTION_OF[String(s.key)] ?? 'look' }));

/**
 * The rest of the panel: every other slider it draws, at the range it draws
 * it at. Generated from the panel's source and kept honest by `panel.mjs`.
 */
const FROM_PANEL: DeskSpec[] = [
  { key: 'sensitivity', label: "Sensitivity", min: 0.1, max: 3, section: 'audio-input' },
  { key: 'bassBoost', label: "Bass Boost", min: 1, max: 3, section: 'audio-input' },
  { key: 'beatPrediction', label: "Beat Prediction", min: 0, max: 1, section: 'audio-input' },
  { key: 'turbulenceDetail', label: "Turbulence Detail", min: 1, max: 4, section: 'look', step: 1 },
  { key: 'grainScale', label: "Grain Fineness", min: 60, max: 900, section: 'look' },
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
  { key: 'gelSpeed', label: "Gel Speed (rpm)", min: 0, max: 3, section: 'lamp' },
  { key: 'lampWarmth', label: "Lamp Warmth", min: 0, max: 1, section: 'lamp' },
  { key: 'transmission', label: "Light Through Dye", min: 0, max: 1, section: 'lamp' },
  { key: 'exposure', label: "Exposure", min: 0, max: 1, section: 'lamp' },
  { key: 'filmMix', label: "Film Mix", min: 0, max: 1, section: 'film' },
  { key: 'filmKey', label: "Film Key", min: 0, max: 0.9, section: 'film' },
  { key: 'macroHold', label: "Shot Length", min: 1, max: 15, section: 'macro' },
  { key: 'macroCells', label: "Paint Cells", min: 0, max: 1, section: 'macro' },
  { key: 'macroCellScale', label: "Cell Size", min: 0.15, max: 1.5, section: 'macro' },
  { key: 'macroLacing', label: "Macro Lacing", min: 0, max: 1, section: 'macro' },
  { key: 'macroDepth', label: "Depth / Focus", min: 0, max: 1, section: 'macro' },
  { key: 'macroEdgeDetail', label: "Edge Detail", min: 0, max: 1, section: 'macro' },
  { key: 'macroRelief', label: "Relief / 3D", min: 0, max: 1, section: 'macro' },
  { key: 'platePressure', label: "Plate Pressure", min: 0, max: 1, section: 'squish' },
  { key: 'glassSmear', label: "Glass Smear", min: 0, max: 1, section: 'squish' },
  { key: 'rainDrip', label: "Rain Drip", min: 0, max: 1, section: 'squish' },
  { key: 'polarity', label: "Polarity (Repulsion)", min: 0, max: 1, section: 'squish' },
  { key: 'evaporationRate', label: "Evaporation Rate", min: 0, max: 0.08, section: 'heat' },
  { key: 'heatDecay', label: "Heat Decay", min: 0.8, max: 1, section: 'heat' },
  { key: 'airVelocity', label: "Updraft", min: 0, max: 1, section: 'interaction' },
  { key: 'vibrationFrequency', label: "Vibration", min: 0, max: 1, section: 'interaction' },
  { key: 'dropHeight', label: "Drop Height", min: 0, max: 1, section: 'interaction' },
  { key: 'diffusionRate', label: "Diffusion Rate", min: 0, max: 0.001, section: 'physics' },
  { key: 'buoyancy', label: "Buoyancy", min: 0, max: 2, section: 'physics' },
  { key: 'advection', label: "Advection", min: 0, max: 2, section: 'physics' },
  { key: 'damping', label: "Momentum", min: 0.8, max: 1, section: 'physics' },
  // The mark. Opacity above all, because taking a logo off between sets is a
  // thing a hand does on a fader rather than a thing anyone opens a panel for.
  { key: 'markMix', label: "Logo Opacity", min: 0, max: 1, section: 'mark' },
  { key: 'markScale', label: "Logo Size", min: 0.03, max: 1, section: 'mark' },
  { key: 'markX', label: "Logo Across", min: 0, max: 1, section: 'mark' },
  { key: 'markY', label: "Logo Up", min: 0, max: 1, section: 'mark' },
  { key: 'layerCount', label: "Layers", min: 1, max: 2, section: 'layers', step: 1 },
  { key: 'rotationSpeed', label: "Rotation Speed", min: 0, max: 1, section: 'layers' },
  { key: 'ledSpeed', label: "LED Rotation Speed", min: 0, max: 2, section: 'layers' },
  { key: 'centerGravity', label: "Center Gravity (Concave)", min: 0, max: 1, section: 'layers' },
  { key: 'gooeyEffect', label: "Gooey Blending", min: 0, max: 1, section: 'layers' },];

/** Everything that can be pinned to a desk, MIDI's forty first. */
export const PINNABLE: DeskSpec[] = [...FROM_MIDI, ...FROM_PANEL];

export const PIN_RANGE = new Map<string, DeskSpec>(PINNABLE.map(s => [String(s.key), s]));

/**
 * Where a value lands on a control that only takes whole steps; on any other
 * control, where it already is.
 *
 * Counted from the bottom of the travel rather than from zero, so a control
 * whose steps start at 1 (octaves, layers) lands on 1, 2, 3 rather than on the
 * half-steps between them, and clamped, because rounding the top step up must
 * not carry a value past the end.
 */
export function onStep(spec: { min: number; max: number; step?: number }, value: number): number {
  if (!spec.step) return value;
  const at = spec.min + Math.round((value - spec.min) / spec.step) * spec.step;
  return at < spec.min ? spec.min : at > spec.max ? spec.max : at;
}

/** The same for a setting named by its key, for code that holds only the key. */
export const onSettingStep = (key: string, value: number): number => {
  const spec = PIN_RANGE.get(key);
  return spec ? onStep(spec, value) : value;
};

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
