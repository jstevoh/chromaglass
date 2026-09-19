/**
 * The patch bay: what changes, onto what it changes.
 *
 * Three sources — the room camera, the film projector and the sound — and any
 * numeric setting to land on, per patch, per plate. A modular synth's idea,
 * and the reason it is worth having here is that the alternative kept being
 * *nearly* enough: first the room was the only thing that could ride a
 * setting, then the film could too but only in lockstep with the room, and
 * each time the missing thing was not a feature but a routing.
 *
 * Lives out here rather than in the visualizer because it is arithmetic and
 * nothing else — no DOM, no WebGL, no React — which is what lets
 * `scripts/scene.mjs` drive it with readings it made up. It earns that: summing
 * several sources, holding each one's staleness separately, folding per layer
 * and clamping to a setting's travel is four chances to be subtly wrong, and
 * none of them would look like a bug on a plate. They would look like "that's
 * a bit much".
 *
 * ## What a patch may aim at
 *
 * Every patch may aim at a setting globally. Only some may aim at *one plate*,
 * and that is not a rule invented here: the solver takes a settings object per
 * layer, so a setting it reads can differ per layer, and a setting only the
 * render pass reads cannot. `PER_LAYER` is that list, and `scripts/panel.mjs`
 * reads the solver's own source to check it has not drifted — because the
 * failure otherwise is a dropdown that offers a choice doing nothing at all.
 */

import { ROOM_STALE_MS } from './roomStir';
import { getSceneValue, type SceneReading } from './sceneSense';
import { getAudioValue, type AudioFeatureKey } from '../constants';
import type { ModulatorFeature, Modulators } from './modulators';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { PatchSource, SceneFeature, SceneMapping, VisualizerSettings } from '../types';
import { PINNABLE, onStep } from './deskPins';

/**
 * What a patch may be plugged into.
 *
 * Every control the settings panel draws, less the dials that decide how hard
 * the sources themselves ride — letting a source ride its own master is a loop
 * nobody asked for — and less the layer count, which a patch changing sixty
 * times a second would thrash rather than modulate.
 *
 * It used to be the forty MIDI can learn, which meant less than half the app
 * could be patched at all and the ones left out were most of the physics:
 * viscosity, damping, buoyancy, advection. Drawing from `PINNABLE` instead
 * takes it to eighty-one and costs nothing, because that list already had to
 * exist for the desk's pin chips.
 */
const NOT_A_TARGET = new Set(['filmDrive', 'filmImpact', 'soundImpact', 'shapeImpact', 'layerCount']);

export const PATCH_TARGETS = PINNABLE.filter(s =>
  !String(s.key).startsWith('scene') && !NOT_A_TARGET.has(String(s.key)));

/**
 * How far each setting a patch may ride can travel: the setting's one range,
 * the same on the sheet, a desk and a fader, so "half depth" means the same
 * thing whichever hand is on it. `step` is there for the controls that only
 * take whole steps, which a patch lands on a step like everything else does.
 */
export const SETTING_TRAVEL: Partial<Record<keyof VisualizerSettings, { min: number; max: number; step?: number }>> =
  Object.fromEntries(PATCH_TARGETS.map(s => [s.key, { min: s.min, max: s.max, step: s.step }]));

/**
 * The settings that can mean something different on one plate than on another.
 *
 * Twenty-two, and the number is not a choice — it is whatever
 * `FluidSimulation.step` reads off the settings object it is handed, because
 * that object is the only thing about a layer that can differ. Everything else
 * is either done once over the finished picture (bloom, the camera, the output
 * grade) or read from the global fold in the render loop rather than per layer
 * (beat squeeze, plate rock, rotation).
 *
 * They are the right ones for the job: speed, turbulence and its detail, evolve
 * rate, dye budget, sound drive, and most of the physics — viscosity's damping,
 * buoyancy, advection, diffusion, surface tension. How a plate moves and how it
 * evolves, which is exactly what you would want a film driving on one layer
 * while the bass drives another.
 *
 * Written out rather than derived at runtime because it decides what a dropdown
 * offers, and checked against the solver's own source by `scripts/panel.mjs` in
 * both directions: nothing here that the solver ignores (a choice that does
 * nothing is worse than no choice), and nothing the solver reads left off. The
 * first version of this list was written from memory and was wrong six ways out
 * of twenty-seven; the check is the only reason that was ever noticed.
 */
export const PER_LAYER: ReadonlySet<string> = new Set([
  'advection', 'airVelocity', 'audioImpact', 'automateRate', 'backgroundLoop',
  'blobSurfaceTension', 'buoyancy', 'centerGravity', 'damping', 'diffusionRate',
  'dyeBudget', 'evaporationRate', 'glassSmear', 'globalSpeed', 'heatDecay',
  'platePressure', 'polarity', 'rainDrip', 'rotationSpeed', 'sharpness', 'turbulenceDetail',
  'turbulenceScale', 'vibrationFrequency',
]);

/** Everything a patch can be plugged into on one side. */
export interface PatchContext {
  room: SceneReading | null;
  film: SceneReading | null;
  sound: AudioData | null;
  /**
   * The LFOs and envelopes.
   *
   * The odd one out here, and deliberately: room, film and sound all answer
   * "what is happening out there", and this answers "what did you ask for".
   * The bay does not care — a source is a source — which is the whole reason
   * adding it was a day's work rather than a rewrite.
   */
  shape: Modulators | null;
  /** Master depth per source, so a whole source can be pulled down on a fader. */
  roomImpact: number;
  filmImpact: number;
  soundImpact: number;
  shapeImpact: number;
}

const sourceOf = (m: SceneMapping): PatchSource => m.source ?? 'room';
const layerOf = (m: SceneMapping): number | 'all' => m.layer ?? 'all';

/**
 * Is this source saying anything right now?
 *
 * A camera reading that stopped arriving is not the room any more, and the
 * same is true of a film that was switched off — both carry the time they were
 * taken. Sound has no such stamp: the analyser either hands over a frame or
 * hands over null, and a null is already "nothing to say".
 */
function liveValue(
  ctx: PatchContext,
  source: PatchSource,
  feature: string,
  now: number,
): { value: number; impact: number } | null {
  if (source === 'sound') {
    if (ctx.soundImpact <= 0 || !ctx.sound) return null;
    return { value: getAudioValue(ctx.sound, feature as AudioFeatureKey), impact: ctx.soundImpact };
  }
  // Shapes have no staleness: an LFO is never out of date, and an envelope
  // that has not been fired reads zero, which is already "nothing to say".
  if (source === 'shape') {
    if (ctx.shapeImpact <= 0 || !ctx.shape) return null;
    return { value: ctx.shape.value(feature as ModulatorFeature), impact: ctx.shapeImpact };
  }
  const reading = source === 'film' ? ctx.film : ctx.room;
  const impact = source === 'film' ? ctx.filmImpact : ctx.roomImpact;
  if (impact <= 0 || !reading || !reading.ready) return null;
  if (now - reading.at > ROOM_STALE_MS) return null;
  return { value: getSceneValue(reading, feature as SceneFeature), impact };
}

/**
 * The patch bay, folded.
 *
 * A class rather than a function because it holds its own scratch: folding
 * produces one settings object for the picture and one per plate, and
 * allocating four of those sixty times a second to throw them away is the kind
 * of thing that shows up as a stutter long before it shows up as a bug.
 *
 * `out[0]` is the global fold — everything aimed at no layer in particular —
 * and `out[1 + i]` is layer `i`, which is the global fold plus whatever was
 * aimed at that plate. When nothing applies, the entries *are* `base` rather
 * than a copy of it, so the ordinary case costs a few comparisons.
 */
export class PatchBay {
  /** [global, layer 0, layer 1, …]. Entries alias `base` when nothing folded. */
  readonly out: VisualizerSettings[];
  private readonly scratch: VisualizerSettings[];

  constructor(base: VisualizerSettings, maxLayers = 3) {
    this.scratch = Array.from({ length: maxLayers + 1 }, () => ({ ...base }));
    this.out = this.scratch.map(() => base);
  }

  /** The picture: everything not aimed at one plate. */
  get global(): VisualizerSettings { return this.out[0]; }
  /** How plate `i` should move. */
  layer(i: number): VisualizerSettings { return this.out[Math.min(this.out.length - 1, 1 + Math.max(0, i))]; }

  fold(
    base: VisualizerSettings,
    ctx: PatchContext,
    layerCount: number,
    /** Passed in rather than read here, so staleness can be tested without a clock. */
    now: number = performance.now(),
  ): void {
    const layers = Math.max(1, Math.min(this.scratch.length - 1, layerCount));
    for (let i = 0; i < this.out.length; i++) this.out[i] = base;

    const maps = base.sceneMappings;
    if (!maps || maps.length === 0) return;

    // One pass to find what is actually live, so a patch list with nothing
    // plugged in on the other end costs a walk and no copying.
    const live: { m: SceneMapping; value: number; impact: number }[] = [];
    let anyGlobal = false;
    const touched = new Set<number>();
    for (const m of maps) {
      if (!m || m.feature === 'none' || !m.depth) continue;
      if (!SETTING_TRAVEL[m.setting]) continue;
      const got = liveValue(ctx, sourceOf(m), m.feature, now);
      if (!got) continue;
      const where = layerOf(m);
      // A patch aimed at a plate that is not on the stage tonight is simply
      // not applied. Silently, because layer count is a property of the look
      // and an operator who drops to one layer has not made a mistake.
      if (where !== 'all' && where >= layers) continue;
      if (where === 'all') anyGlobal = true; else touched.add(where);
      live.push({ m, value: got.value, impact: got.impact });
    }
    if (live.length === 0) return;

    // The picture first: the global fold is what a layer fold starts from, so
    // a patch on "all" reaches every plate through it rather than being
    // applied twice.
    const g = this.scratch[0];
    if (anyGlobal) {
      Object.assign(g, base);
      for (const l of live) if (layerOf(l.m) === 'all') this.ride(g, l);
      this.land(g, live, 'all');
      this.out[0] = g;
    }
    const pictureFor = this.out[0];

    for (let i = 0; i < layers; i++) {
      this.out[1 + i] = pictureFor;
      if (!touched.has(i)) continue;
      const s = this.scratch[1 + i];
      Object.assign(s, pictureFor);
      for (const l of live) if (layerOf(l.m) === i) this.ride(s, l);
      this.land(s, live, i);
      this.out[1 + i] = s;
    }
  }

  /**
   * Every stepped control the patches aimed here ride, put on its nearest step.
   *
   * After the sum, not per patch: two patches each adding most of a fold
   * would each round to nothing on their own, and together they are a fold.
   * Only what was aimed at `where`, so a setting no patch here touched is left
   * exactly as the look has it.
   */
  private land(into: VisualizerSettings, live: { m: SceneMapping }[], where: number | 'all'): void {
    for (const l of live) {
      if (layerOf(l.m) !== where) continue;
      const travel = SETTING_TRAVEL[l.m.setting];
      const v = into[l.m.setting];
      if (!travel?.step || typeof v !== 'number') continue;
      (into as unknown as Record<string, number>)[l.m.setting] = onStep(travel, v);
    }
  }

  /**
   * One patch, onto one settings object, clamped to the setting's travel.
   *
   * The running value is read from `into`, not from what `into` was copied
   * from. Reading the original meant each patch on a setting *replaced* the
   * one before it rather than adding to it, so two patches aimed at the same
   * control quietly became whichever happened to be last in the list — caught
   * by `two patches add` in `scripts/scene.mjs`, which is the one check that
   * could see it.
   */
  private ride(
    into: VisualizerSettings,
    l: { m: SceneMapping; value: number; impact: number },
  ): void {
    const travel = SETTING_TRAVEL[l.m.setting]!;
    const current = into[l.m.setting];
    if (typeof current !== 'number') return;
    const moved = current + l.value * l.m.depth * l.impact * (travel.max - travel.min);
    (into as unknown as Record<string, number>)[l.m.setting] =
      moved < travel.min ? travel.min : moved > travel.max ? travel.max : moved;
  }
}
