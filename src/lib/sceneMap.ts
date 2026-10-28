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

import { ROOM_STALE_MS } from './roomStir.ts';
import { getSceneValue, type SceneReading } from './sceneSense.ts';
import { getAudioValue, type AudioFeatureKey } from '../constants.ts';
import { BandRange, SOURCE_NAMES, sourceValue, type SourceName } from './audioFeatures.ts';
import { CordGate } from './areaCords.ts';
import type { ModulatorFeature, Modulators } from './modulators';
import type { HitSource } from './hitSource.ts';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import type { PatchSource, SceneFeature, SceneMapping, VisualizerSettings } from '../types';
import { PINNABLE, onStep } from './deskPins.ts';
import { MIX_FADE_KEYS } from './mixer.ts';

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
/*
  Pacing is left out because nothing would hear the patch. Patches are folded
  into the settings the plate draws with, inside the visualizer; the sequencer
  plans each scene from the settings the app holds, so a room, sound or LFO
  patch on Pacing would show in the bay and change nothing. And if it did, a
  sixty-hertz wobble across the half that turns on dark endings would move it
  under a plan made when the stage was entered.
*/
// Follow the Song the same: the sequencer reads it from the app's settings.
// And the Mixer rows' fade times (lib/mixFade.ts): App reads one when its row's
// take button is pressed, from the app's settings, so a patch on it would show
// in the bay and change nothing.
/*
  Thin Gap is a solver mode, not an amount (PLAN §18a): a patch riding it
  would switch the plate's physics every time the sound crossed half, so it
  is held by hand, a pad or a desk, and its Thickness is what a patch rides.
  Clear Film (PLAN §20b) likewise: moving it pours clear oil over the whole
  dish or draws it off, so a patch riding the beat would fill the lace's
  holes in on every bar. A pour is a hand's gesture.
  Two Projectors (PLAN §18b-10) switches the rig between one lamp and two, so
  a patch or LFO must not flip it mid-song.
*/
const NOT_A_TARGET = new Set(['filmDrive', 'filmImpact', 'soundImpact', 'shapeImpact', 'layerCount', 'pacing', 'songFollow', 'thinGap', 'clearFilm', 'twoProjectors',
  // A hand's alone (midi.ts PATCH_MASTERS): the room never moves the frame.
  'frameSway',
  // A hand's alone too: the tilt is the owner's, and a kick routed to Slosh would be the sound rocking the liquid (lib/slosh.ts).
  'slosh',
  ...MIX_FADE_KEYS.map(String)]);

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
  'blobSurfaceTension', 'buoyancy', 'centerGravity', 'cometSpeed', 'cometAngle', 'damping', 'diffusionRate',
  'dimmer', 'dyeBudget', 'evaporationRate', 'glassSmear', 'globalSpeed', 'heatDecay',
  // The two glasses are this plate's own pair: their dome and how fast a
  // press on them lifts. Each layer is a separate dish.
  'plateCurve', 'plateSpring', 'depthDrag',
  // Whether the plate is a thin gap, and its liquid's thickness (PLAN §18a).
  'thinGap', 'gapThickness',
  // The liquids' own physics (docs/physics-plan.md): each plate's solver.
  'vorticityConfinement', 'oilTension', 'oilBodies', 'filmHold', 'surfactantFlow', 'solutalBuoyancy', 'plateUpright', 'tiltDirection', 'doubleDiffusion', 'ferroLabyrinth', 'mazeDetail', 'phaseDisplace', 'bzReaction', 'liesegang',
  // The clear film (PLAN §20b): the front plate's solver lays it; a back
  // plate is handed 0 until the display can draw one there (20b-5).
  'clearFilm',
  /*
    The second phase and its magnet (H7). Each layer is a separate dish with
    its own phase field, so each can have its own domains and its own magnet —
    which at plate scale is the two-magnet rig the plan asks for, and at macro
    is simply the front plate's hand.
  */
  'phaseScale', 'phaseSharp',
  'magnetX', 'magnetY', 'magnetHeight', 'magnetStrength',
  // `particles` and not `particleMix`: each plate has its own solver and its
  // own population, so the amount is that plate's. How far their colour is
  // trusted is read by the render pass, which sees one picture.
  'particles',
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
  /**
   * The hits and the note (`hitSource.ts`): how hard each drum's last hit
   * was, held and let fall. The same microphone as `sound` and `bands`, so
   * the same master, Sound Impact.
   */
  hits?: HitSource | null;
  /** Master depth per source, so a whole source can be pulled down on a fader. */
  roomImpact: number;
  filmImpact: number;
  soundImpact: number;
  shapeImpact: number;
}

const sourceOf = (m: SceneMapping): PatchSource => m.source ?? 'room';
type SettingCord = SceneMapping & { setting: keyof VisualizerSettings };
const NAMED: ReadonlySet<string> = new Set(SOURCE_NAMES);
const layerOf = (m: SceneMapping): number | 'all' => m.layer ?? 'all';

const validBand = (b: unknown): b is readonly [number, number] =>
  Array.isArray(b) && b.length === 2 && Number.isFinite(b[0]) && Number.isFinite(b[1]) && b[0] > 0 && b[1] > b[0];

const standaloneBands = new WeakMap<SceneMapping, BandRange>();
function cordBandRange(m: SceneMapping): BandRange {
  let b = standaloneBands.get(m);
  if (!b) {
    b = new BandRange();
    standaloneBands.set(m, b);
  }
  return b;
}

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
  m: SceneMapping,
  now: number,
  bandRange?: BandRange | null,
): { value: number; impact: number } | null {
  const source = sourceOf(m);
  const feature = m.feature;
  if (source === 'sound') {
    if (ctx.soundImpact <= 0 || !ctx.sound) return null;
    let value = getAudioValue(ctx.sound, feature as AudioFeatureKey);
    if (m.gain !== undefined && Number.isFinite(m.gain)) {
      value = Math.min(1, Math.max(0, value * m.gain));
    }
    return { value, impact: ctx.soundImpact };
  }
  // The sound by name (or a dragged `[loHz, hiHz]` band, PLAN 30a): read raw
  // from the analyser's reading of this frame, no smoothing, because a mapping
  // on the kick or a band is meant to move with it. On the laptop's second
  // screen (`StageMirror` in CastDisplay.tsx) the projector mirrors `#liquid-canvas`
  // directly and shows the laptop's fold; a standalone network `CastReceiver`
  // rebuilds `AudioData` from the wire (`CastAudio`) with no spectrum behind it,
  // so `bands` cords (fixed or dragged) read nothing there while `sound` cords
  // fold and gate from the wire levels (PLAN 30a-1).
  if (source === 'bands') {
    const reading = ctx.sound?.features;
    if (ctx.soundImpact <= 0 || !reading) return null;
    let value: number;
    if (validBand(m.band)) {
      value = (bandRange ?? cordBandRange(m)).read(reading, m.band);
    } else {
      if (!NAMED.has(feature)) return null;
      value = sourceValue(reading, feature as SourceName);
    }
    if (m.gain !== undefined && Number.isFinite(m.gain)) {
      value = Math.min(1, Math.max(0, value * m.gain));
    }
    return { value, impact: ctx.soundImpact };
  }
  // The hits, read as `bands` is: nothing to say with no reading this frame
  // (the source has let its values fall by then anyway).
  if (source === 'hits') {
    if (ctx.soundImpact <= 0 || !ctx.hits || !ctx.sound?.features) return null;
    return { value: ctx.hits.value(feature), impact: ctx.soundImpact };
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
 * One cord's reading this frame times its source's master, or null when the
 * source has nothing to say: what the fold below rides a setting by, for a
 * cord aimed at an area (lib/areaCords.ts), which is a hand in one place
 * rather than a setting and so is not folded here.
 *
 * `band` is the caller's own `BandRange` for a dragged band: `AreaHands` keeps
 * one per cord, as it keeps its gate, because a range that is made new reads 0
 * on its first read and a look fade (lookFade.ts `crossfadePatches`) builds
 * every cord's object again each frame. Without it the reading falls back to a
 * range per mapping object (`cordBandRange`), which is right for a one-off
 * read and for a cord object that is held, and wrong across a fade (the review
 * of #511).
 */
export function cordReading(ctx: PatchContext, m: SceneMapping, now: number = performance.now(), band?: BandRange | null): number | null {
  if (!m || m.feature === 'none') return null;
  const got = liveValue(ctx, m, now, band);
  return got ? got.value * got.impact : null;
}

/** A cord the fold rides: aimed at a setting, not at an area (`AreaTarget`s are not settings). */
const onSetting = (m: SceneMapping): m is SceneMapping & { setting: keyof VisualizerSettings } =>
  m.area === undefined && !!SETTING_TRAVEL[m.setting as keyof VisualizerSettings];

interface BayCordState {
  gate: CordGate;
  band: BandRange | null;
  seen: boolean;
}

const bayKeyOf = (m: SceneMapping): string =>
  `${m.source ?? 'room'}|${m.source === 'bands' && validBand(m.band) ? `${m.band[0]}-${m.band[1]}` : m.feature}|${String(m.setting)}|${layerOf(m)}|${m.mode ?? 'follow'}`;

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
  /** Per-cord gate envelope and dragged-band range (PLAN 30a), keyed by what the cord is. */
  private readonly cords = new Map<string, BayCordState>();
  private lastNow: number | null = null;

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
    /** Passed in rather than read here, so staleness and gates can be tested without a clock. */
    now: number = performance.now(),
    /**
     * Patches that belong to the rig rather than the look: sound learn's
     * mappings (`soundLearn.ts`), which live in the MIDI map and so ride
     * whatever look is up. Folded after the look's own, by the same
     * arithmetic, so a learned kick on Turbulence and a look's patch on
     * Turbulence add and clamp exactly as two patches in one look do.
     */
    extra?: readonly SceneMapping[],
    /**
     * A plate's own look, by layer, or nothing where the plate follows the
     * front (PLAN.md §16a). Only its `PER_LAYER` keys are read: those are how
     * that plate's solver moves, and every other key is the picture, which
     * there is one of. It is the plate's *base*, not a patch over it, so the
     * look's patches ride it exactly as they ride the front: a kick on
     * Turbulence aimed at every plate adds to the back plate's own
     * Turbulence, not to the front's. The back look's own patches are not
     * folded; the patch bay is the front look's, and aims at plates by index.
     */
    plates?: readonly (VisualizerSettings | null | undefined)[],
  ): void {
    const dt = this.lastNow === null ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const layers = Math.max(1, Math.min(this.scratch.length - 1, layerCount));
    for (let i = 0; i < this.out.length; i++) this.out[i] = base;

    let anyOwn = false;
    if (plates) for (let i = 0; i < layers; i++) if (plates[i]) anyOwn = true;

    const own = base.sceneMappings;
    const maps = extra && extra.length > 0 ? (own && own.length > 0 ? [...own, ...extra] : extra) : (own ?? []);
    if (maps.length === 0 && !anyOwn) {
      this.cords.clear();
      return;
    }

    // One pass to find what is actually live, so a patch list with nothing
    // plugged in on the other end costs a walk and no copying.
    for (const s of this.cords.values()) s.seen = false;
    const twins = new Map<string, number>();
    const live: { m: SettingCord; value: number; impact: number }[] = [];
    let anyGlobal = false;
    const touched = new Set<number>();
    for (const m of maps) {
      if (!m || m.feature === 'none' || !m.depth) continue;
      // A cord aimed at an area is a hand there (lib/areaCords.ts), not a setting.
      if (!onSetting(m)) continue;
      const where = layerOf(m);
      // A patch aimed at a plate that is not on the stage tonight is simply
      // not applied. Silently, because layer count is a property of the look
      // and an operator who drops to one layer has not made a mistake.
      if (where !== 'all' && where >= layers) continue;
      const src = sourceOf(m);
      const isSoundOrBands = src === 'sound' || src === 'bands';
      const isGated = isSoundOrBands && m.mode === 'gate';
      const hasDragBand = src === 'bands' && validBand(m.band);
      let state: BayCordState | undefined;
      if (isGated || hasDragBand) {
        const baseKey = bayKeyOf(m);
        const turn = twins.get(baseKey) ?? 0;
        twins.set(baseKey, turn + 1);
        const k = turn ? `${baseKey}#${turn}` : baseKey;
        state = this.cords.get(k);
        if (!state) {
          state = { gate: new CordGate(), band: hasDragBand ? new BandRange() : null, seen: true };
          this.cords.set(k, state);
        } else {
          state.seen = true;
          if (hasDragBand && !state.band) state.band = new BandRange();
        }
      }
      const got = liveValue(ctx, m, now, state?.band);
      if (isGated && state) {
        const impact = got ? got.impact : ctx.soundImpact;
        if (impact <= 0) continue;
        const value = state.gate.step(got ? got.value : 0, dt, m);
        if (where === 'all') anyGlobal = true; else touched.add(where);
        live.push({ m, value, impact });
        continue;
      }
      if (!got) continue;
      if (where === 'all') anyGlobal = true; else touched.add(where);
      live.push({ m, value: got.value, impact: got.impact });
    }
    for (const [k, s] of this.cords) if (!s.seen) this.cords.delete(k);
    if (live.length === 0 && !anyOwn) return;

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
      const mine = plates?.[i];
      if (!touched.has(i) && !mine) continue;
      const s = this.scratch[1 + i];
      Object.assign(s, pictureFor);
      if (mine) {
        // The global fold again, from this plate's own solver settings: what
        // the picture's fold put on a `PER_LAYER` key it put on the front's
        // value, so that key goes back to this plate's look and the patches
        // aimed at every plate ride it from there. Keys the picture reads
        // stay as the picture folded them.
        const into = s as unknown as Record<string, unknown>;
        const from = mine as unknown as Record<string, unknown>;
        for (const key of PER_LAYER) if (key in from) into[key] = from[key];
        for (const l of live) if (layerOf(l.m) === 'all' && PER_LAYER.has(l.m.setting)) this.ride(s, l);
        this.land(s, live, 'all');
      }
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
  private land(into: VisualizerSettings, live: { m: SettingCord }[], where: number | 'all'): void {
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
    l: { m: SettingCord; value: number; impact: number },
  ): void {
    const travel = SETTING_TRAVEL[l.m.setting]!;
    const current = into[l.m.setting];
    if (typeof current !== 'number') return;
    const moved = current + l.value * l.m.depth * l.impact * (travel.max - travel.min);
    (into as unknown as Record<string, number>)[l.m.setting] =
      moved < travel.min ? travel.min : moved > travel.max ? travel.max : moved;
  }
}
