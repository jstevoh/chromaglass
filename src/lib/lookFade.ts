/**
 * Changing the look without cutting the audience to black.
 *
 * `applyPreset` clears every layer and reseeds. That is the right thing when
 * you are *building* a look: you want the new preset on clean glass, not on
 * whatever the last one left behind. It is the wrong thing at 11pm with the
 * plate on a wall behind you, because the clear is a hard cut through
 * near-black in front of a room.
 *
 * The non-destructive path already existed — `adoptPreset` takes on the new
 * preset's dyes, injection styles and liquids and leaves the plate alone, and
 * the sequencer has used it to change stage all along. What was missing is the
 * settings: adopting alone snaps all eighty of them at once, so the dye
 * survives but the look still jumps.
 *
 * This is the missing half. Two settings objects and a number from 0 to 1,
 * and no state of its own, so `npm run desk` can drive a whole fade and check
 * what came out rather than watching a plate and forming an impression.
 *
 * ## What cannot be faded
 *
 * A number can be halfway. A blend mode cannot: there is no state between
 * `screen` and `multiply`, and nothing this module can do will invent one.
 * Booleans, strings and the audio-mapping table therefore switch at a single
 * point rather than travelling, and the point is the middle of the fade —
 * where every number is already half-way to somewhere else, so the switch has
 * the least settled picture to disturb. Switching at the start pops before
 * anything has moved; switching at the end pops once the eye has settled.
 */

import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { PIN_RANGE } from './deskPins';

/**
 * What belongs to the room rather than to a look.
 *
 * A look is everything about how the plate looks and moves, and how the music,
 * the room and the film drive it. What the room *is* stays put when the look
 * changes: the microphone's calibration and latency, whether a new song changes
 * the look at all, the house dimmer, the logo, the film that is loaded and how
 * it is keyed, how the room camera's picture is read, and the grid this machine
 * can hold. A look that set any of these would carry it on into every look after
 * it, which is the thing this file exists to stop.
 */
export const RIG_KEYS: ReadonlySet<keyof VisualizerSettings> = new Set<keyof VisualizerSettings>([
  'sensitivity', 'bassBoost', 'autoCalibrate', 'beatPrediction', 'beatLead', 'onNewSong',
  'dimmer',
  'markMix', 'markX', 'markY', 'markScale',
  'filmMix', 'filmKey',
  'sceneDeadzone', 'sceneSmooth', 'scenePeople', 'sceneMirror',
  'simResolution',
]);

/**
 * Every look setting, at the value a look gets when it does not mention it.
 *
 * A look is complete: it never inherits from the look before it. Looks used
 * to be written as a handful of changes over whatever was already on the
 * plate, so a look's lacing, dye budget, exposure, Lumia or bubbles were
 * whatever the last look had left there, and the same look came out
 * differently depending on what had been played before it. (The app now opens
 * on a random look, which made that visible: Acid Trip after Lumia ran its
 * plate nearly dry and drew a bare LED wheel.)
 *
 * So every look setting has a value here, the app's defaults, with the
 * framing, beads, cells and fingering off. The macro camera, the Fillmore's
 * projectors and its beads should only appear when a look asks for them. A look
 * lists what it wants different from this, and everything it does not list is
 * this, whatever came before. A fade still travels from where the plate is to
 * the complete look; it is the destination that no longer depends on the
 * route.
 */
export const LOOK_BASE: Readonly<Partial<VisualizerSettings>> = (() => {
  const base: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!RIG_KEYS.has(key as keyof VisualizerSettings)) base[key] = value;
  }
  Object.assign(base, {
    macroMode: false,
    macroZoom: 1,
    renderStyle: 'show',
    camera: 0,
    dishSpread: 0,
    beads: 0,
    cells: 0,
    fingering: 0,
  });
  return base as Partial<VisualizerSettings>;
})();

/**
 * A look, complete: every look setting, from the look where it says and from
 * the base where it does not. Anything the look says about the room is left
 * out, so the room stays as it is.
 */
export function lookOf(look: Partial<VisualizerSettings>): Partial<VisualizerSettings> {
  // The base's tables (the sound mappings, the patches) are copied, so a look
  // that is edited in place cannot write through into every look after it.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(LOOK_BASE)) {
    out[key] = typeof value === 'object' && value !== null ? structuredClone(value) : value;
  }
  for (const [key, value] of Object.entries(look)) {
    if (!RIG_KEYS.has(key as keyof VisualizerSettings)) out[key] = value;
  }
  return out as Partial<VisualizerSettings>;
}

/** Where a look change is aiming: the room as it is, with the look complete over it. */
export function targetLook(current: VisualizerSettings, look: Partial<VisualizerSettings>): VisualizerSettings {
  return { ...current, ...lookOf(look) } as VisualizerSettings;
}

/**
 * What an *unattended* look change leaves alone.
 *
 * A look change nobody asked for is a different thing from one somebody
 * pressed. Pressing Go is a decision — you meant that look, all of it. A new
 * song arriving is not: the plate in front of the room is the one you set up,
 * and it should still be that plate afterwards.
 *
 * These are the settings with no halfway. A number can drift and nobody
 * notices the moment it moved; a second layer cannot arrive gradually, and
 * `blendLooks` has to switch them at a single point in the fade — so an
 * unattended change that carried them would put an LED wheel on the plate
 * mid-song, or take one off, or fold the whole picture into a kaleidoscope.
 * That is what "it makes giant jarring changes" means, and it is not fixed by
 * fading, because there is nothing between `false` and `true` to fade through.
 *
 * So structure is held and character drifts. Speed, turbulence, dye budget,
 * saturation, the lamps, the camera, the palette — all of those travel, and a
 * look does genuinely become another look over the fade. What it does not do
 * is change shape.
 *
 * Pressing Go, arming a look, opening one, the sequencer and the randomiser
 * all still take the whole thing. This is only for the automatic path.
 */
export const STRUCTURE: ReadonlySet<keyof VisualizerSettings> = new Set<keyof VisualizerSettings>([
  'ledPlatform', 'ledMode',
  'layerCount',
  'blendMode',
  /*
    Both halves of the closeup, and holding only one of them is what put a
    spinning square over the plate three times.

    `luckyLook` rolls these two together on purpose — either closeup at four to
    twelve times, or not closeup at one — with a note that the flag follows the
    zoom "rather than the two disagreeing". Holding `macroMode` here and
    letting `macroZoom` through produced exactly that disagreement: the flag
    stayed false and the zoom arrived at eight. Magnified eight times, the
    plate's own square edge and its slow turn become a large spinning square,
    the dye reads flat, and the bubbles — drawn at their own scale — are all
    that is left of the picture. Which is the report, three times.

    A control split across two settings has to be held as one thing or not at
    all.
  */
  'macroMode', 'macroZoom',
  'renderStyle',
  'viscosity',
  'kaleidoscope',
]);

/**
 * Where an unattended look change is aiming: the look, with this plate's own
 * structure kept over the top of it.
 */
export function evolvedLook(current: VisualizerSettings, look: Partial<VisualizerSettings>): VisualizerSettings {
  const held: Partial<VisualizerSettings> = {};
  for (const key of STRUCTURE) Object.assign(held, { [key]: current[key] });
  return { ...targetLook(current, look), ...held };
}

/** Ease in and out: a fade that starts and stops gently reads as a hand, not a switch. */
export const ease = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** The point in a fade where anything that cannot travel changes over. */
const SWITCH_AT = 0.5;

/**
 * `from` and `to`, mixed.
 *
 * Every key of the settings is visited, so a setting added later is faded
 * without this file being told about it: numbers travel, everything else
 * switches. The one exception is `simResolution`, which is a property of the
 * machine rather than of the look and never travels at all.
 */
export function blendLooks(from: VisualizerSettings, to: VisualizerSettings, t: number): VisualizerSettings {
  const k = ease(t);
  const past = k >= SWITCH_AT;
  const out = {} as Record<string, unknown>;

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof VisualizerSettings)[]) {
    const a = from[key];
    const b = to[key];
    if (key === 'simResolution') { out[key] = a; continue; }
    if (typeof a === 'number' && typeof b === 'number') {
      // A control that only takes whole steps — layers, the kaleidoscope's
      // folds, turbulence octaves — switches at the midpoint the way a choice
      // does: in between is not a value it has. Faded, a Go from one layer to
      // two passed the layer count through 1.05, 1.1, … and the visualizer
      // built a whole second solver on one frame and threw it away on the next,
      // for every frame of the fade.
      if (PIN_RANGE.get(key)?.step || WHOLE_STEPS.has(key)) { out[key] = past ? b : a; continue; }
      // The closeup's zoom in proportion, not in steps of one: 1 → 4.5 by
      // halves reads as a lurch at the start and a crawl at the end, where
      // the same ratio each moment reads as one steady push.
      if (key === 'macroZoom' && a > 0 && b > 0) {
        out[key] = k >= 1 ? b : Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k);
        continue;
      }
      // `a + (b - a) * 1` is not `b` in floating point: fading 0.5 to 0.05
      // lands on 0.04999999999999999. A hundredth of a millionth does not
      // show on a wall, but it means the look you cued is not the look you
      // got, so two fades back and forth would drift rather than return.
      out[key] = k >= 1 ? b : a + (b - a) * k;
    } else if (typeof a === 'string' && typeof b === 'string' && HEX.test(a) && HEX.test(b)) {
      // A colour is a number in three parts, so it travels too: the LED
      // backlight and the paper behind a photograph used to change colour in
      // one frame at the midpoint, the one thing on the wall that visibly cut.
      out[key] = k >= 1 ? b : mixHex(a, b, k);
    } else {
      out[key] = past ? b : a;
    }
  }
  // Anything the settings carry that the defaults do not name (a key added to
  // a saved preset by a newer build) still has to arrive, or a fade would
  // quietly drop it.
  const fromAny = from as unknown as Record<string, unknown>;
  const toAny = to as unknown as Record<string, unknown>;
  for (const key of Object.keys(toAny)) {
    if (!(key in out)) out[key] = past ? toAny[key] : fromAny[key];
  }
  return out as unknown as VisualizerSettings;
}

/**
 * Numbers that are really choices: the kaleidoscope's number of folds and
 * the film stock's type are rounded where they are used, so faded they
 * stepped through every value between — 2, 3, 4, 5, 6 folds, or slide film,
 * faded negative and Super 8 on the way to the stock asked for.
 */
const WHOLE_STEPS: ReadonlySet<string> = new Set(['kaleidoscope', 'stockType']);

const HEX = /^#[0-9a-f]{6}$/i;
function mixHex(a: string, b: string, k: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k).toString(16).padStart(2, '0');
  return out;
}

/** How long a Go takes, in seconds, and what the desk offers. */
export const FADE_CHOICES = [0, 1, 2, 4, 8] as const;
export const DEFAULT_FADE_SECONDS = 2;
