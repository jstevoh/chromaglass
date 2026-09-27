/**
 * The mixer: every picture on the wall, in one stack (docs/rig-plan.md, R7).
 *
 * Asked for directly: "a video mixer control available from the top level but
 * also in the settings, that can move the order of layers (LED spinning,
 * video, picture, any other image input) and control brightness, contrast and
 * the other photo and video standards on each."
 *
 * Before this, the pictures the plate composites were each in their own
 * corner of Settings: the film's mix under Film, the logo's opacity under
 * Logo & Titles, the LED platform under Lamp, the second plate's blend under
 * Multi-Layer Mixer. The grade was global: one Saturation and one Dimmer over
 * the finished frame, so a film that came in too bright could only be tamed
 * by dimming the liquid with it. And the order was fixed in the shader's
 * text: the back plate over the front, the film over both, the logo over
 * everything.
 *
 * So this is two things:
 *
 * - **A grade per source**, the four a video proc amp has: brightness,
 *   contrast, saturation and hue, each applied to that source's own picture
 *   before it is laid over what is under it. They are the CSS filter
 *   functions' definitions (brightness a gain, contrast about mid-grey,
 *   saturation and hue as the Rec. 709 matrices the filter spec gives), so
 *   the numbers mean what they mean in every photo editor anyone has used.
 *   At 1, 1, 1 and 0 the shader skips the grade outright rather than running
 *   it as an identity, so a look made before this is the same picture to the
 *   bit, not merely to the eye.
 *
 * - **An order for the four that can move**: the LED ring, the back plate,
 *   the film and the logo. The front plate does not move. It is the glass the
 *   lamp shines through, and everything else is drawn relative to it: the LED
 *   ring under it is the lamp under that glass, which is what the LED
 *   platform has always been; above it, the ring is a beam of its own,
 *   screened over whatever is under it, and the front plate is lit by the
 *   plain lamp. Nothing else can go under the front plate, because nothing
 *   else can be the lamp. So the front plate is the bottom row, or the second
 *   with the LED ring under it, and the order is stored as all five rows,
 *   since "the ring just above the glass" and "the ring under it" put the
 *   four movers in the same order and are different pictures.
 *
 * The rig plan says the mixer is "the place where R1–R3 are worked from", and
 * R1 (a projector with a source of its own, so several live plates) is not
 * built. This is the part that does not need it: the pictures the app already
 * draws, in an order the operator chooses, each with its own grade.
 */

import type { VisualizerSettings } from '../types';

/** The sources that can be moved in the stack. */
export type MixMover = 'led' | 'back' | 'film' | 'mark';
/** Every row the mixer draws: the movers and the front plate, which cannot move. */
export type MixSource = MixMover | 'front';

export const MIX_MOVERS: readonly MixMover[] = ['led', 'back', 'film', 'mark'];

/** Bottom to top, as the shader drew them before there was a choice. */
export const DEFAULT_MIX_ORDER = 'led front back film mark';
const ALL_ROWS: readonly MixSource[] = ['led', 'front', 'back', 'film', 'mark'];

export interface MixSourceInfo {
  id: MixSource;
  name: string;
  /** The setting that is this source's level: how much of it is in the picture. */
  level: keyof VisualizerSettings;
  /** One line for the row, said the way an operator would. */
  hint: string;
}

export const MIX_SOURCE_INFO: Record<MixSource, MixSourceInfo> = {
  led:   { id: 'led',   name: 'LED Ring',    level: 'ledLevel',   hint: 'The spinning LED platform. At the bottom it is the lamp under the glass; higher up it is a beam of its own.' },
  front: { id: 'front', name: 'Front Plate', level: 'frontLevel', hint: 'The lead plate, lit from beneath. Everything else stacks on it.' },
  back:  { id: 'back',  name: 'Back Plate',  level: 'backLevel',  hint: 'The second plate, when the look has two.' },
  film:  { id: 'film',  name: 'Film',        level: 'filmMix',    hint: 'A loaded reel, a window or the camera.' },
  mark:  { id: 'mark',  name: 'Logo',        level: 'markMix',    hint: 'The logo or title card.' },
};

/** The four grade controls, as every proc amp names them. */
export type MixGrade = 'Bright' | 'Contrast' | 'Sat' | 'Hue';
export const MIX_GRADES: readonly MixGrade[] = ['Bright', 'Contrast', 'Sat', 'Hue'];
const GRADE_LABEL: Record<MixGrade, string> = { Bright: 'Brightness', Contrast: 'Contrast', Sat: 'Saturation', Hue: 'Hue' };
const GRADE_RANGE: Record<MixGrade, { min: number; max: number; none: number }> = {
  Bright: { min: 0, max: 2, none: 1 },
  Contrast: { min: 0, max: 2, none: 1 },
  Sat: { min: 0, max: 2, none: 1 },
  // Degrees round the colour wheel, either way.
  Hue: { min: -180, max: 180, none: 0 },
};

/** The setting a source's grade control writes: `filmContrast`, `ledHue`. */
export const gradeKey = (id: MixSource, g: MixGrade): keyof VisualizerSettings =>
  `${id}${g}` as keyof VisualizerSettings;

export interface MixControl {
  key: keyof VisualizerSettings;
  label: string;
  min: number;
  max: number;
  source: MixSource;
  /** What the control reads at when it changes nothing. */
  none: number;
}

const ROWS: MixSource[] = ['led', 'front', 'back', 'film', 'mark'];

/**
 * Every control the mixer adds, with its range: MIDI learns these, the desks
 * can pin them, and the panel check holds the Mixer's sliders to them. The
 * film's and the logo's levels are not here because they are not new: they
 * are Film Mix and Logo Opacity, which already have their own entries.
 */
export const MIX_CONTROLS: MixControl[] = [
  { key: 'ledLevel', label: 'LED Ring Level', min: 0, max: 1, source: 'led', none: 1 },
  { key: 'frontLevel', label: 'Front Plate Level', min: 0, max: 1, source: 'front', none: 1 },
  { key: 'backLevel', label: 'Back Plate Level', min: 0, max: 1, source: 'back', none: 1 },
  ...ROWS.flatMap(id => MIX_GRADES.map(g => ({
    key: gradeKey(id, g),
    label: `${MIX_SOURCE_INFO[id].name} ${GRADE_LABEL[g]}`,
    min: GRADE_RANGE[g].min,
    max: GRADE_RANGE[g].max,
    source: id,
    none: GRADE_RANGE[g].none,
  }))),
];

/** Every setting the mixer owns, the order included: the room's rig, not a look's. */
export const MIX_KEYS: (keyof VisualizerSettings)[] = [...MIX_CONTROLS.map(c => c.key), 'mixOrder'];

/** The short label a row's own slider carries, without the source's name. */
export const gradeLabel = (g: MixGrade): string => GRADE_LABEL[g];

/**
 * The whole stack, bottom to top, from whatever the setting holds.
 *
 * A saved order may be from a later build with a source this one does not
 * know, or have lost one, or be garbage typed into `?set=`. Anything unknown
 * or repeated is dropped and anything missing goes back where the default has
 * it, so the stack always holds exactly the five. Then the one rule: the front
 * plate is the bottom row, or the second with the LED ring as the lamp under
 * it. An order that has anything else under it is read as the LED ring the
 * lamp if the ring came first, and the front plate at the bottom otherwise.
 */
export function mixStack(raw: unknown): MixSource[] {
  const seen: MixSource[] = [];
  if (typeof raw === 'string') {
    for (const w of raw.split(/[\s,>]+/)) {
      if ((ALL_ROWS as readonly string[]).includes(w) && !seen.includes(w as MixSource)) seen.push(w as MixSource);
    }
  }
  const def = DEFAULT_MIX_ORDER.split(' ') as MixSource[];
  for (const m of def) {
    if (!seen.includes(m)) seen.splice(Math.min(def.indexOf(m), seen.length), 0, m);
  }
  const f = seen.indexOf('front');
  if (f === 0 || (f === 1 && seen[0] === 'led')) return seen;
  const movers = seen.filter(m => m !== 'front');
  return movers[0] === 'led' ? ['led', 'front', ...movers.slice(1)] : ['front', ...movers];
}

/** The four that move, bottom to top. */
export const parseMixOrder = (raw: unknown): MixMover[] =>
  mixStack(raw).filter((m): m is MixMover => m !== 'front');

export const mixOrderString = (stack: readonly MixSource[]): string => stack.join(' ');

/**
 * One source a step up (`dir` 1) or down (-1) the stack.
 *
 * Moving is a swap with the neighbour, and the front plate is a neighbour too:
 * the LED ring can pass it, which is the ring going from the lamp to a beam
 * and back, and nothing else can go under it. At the top or bottom it stays
 * put: a mixer whose button wrapped round would put the logo under the plate
 * when someone only meant to nudge it.
 */
export function moveInMix(raw: unknown, id: MixMover, dir: 1 | -1): string {
  const stack = mixStack(raw);
  const at = stack.indexOf(id);
  const to = at + dir;
  if (to < 0 || to >= stack.length || (stack[to] === 'front' && id !== 'led')) return mixOrderString(stack);
  [stack[at], stack[to]] = [stack[to], stack[at]];
  return mixOrderString(stack);
}

/**
 * One source a step up, and from the top back to the lowest row it can have.
 *
 * For a pad, which has one direction: pressed again and again it walks the
 * source through every row it can have and back to where it began, where
 * `moveInMix` would stop at the top and the pad would go dead.
 */
export function raiseInMix(raw: unknown, id: MixMover): string {
  const stack = mixStack(raw);
  if (stack[stack.length - 1] !== id) return moveInMix(raw, id, 1);
  const rest = stack.filter(m => m !== id);
  // The LED ring's lowest row is the lamp, under the glass; anything else's
  // is just above the front plate.
  if (id === 'led') return mixOrderString(['led', 'front', ...rest.filter(m => m !== 'front')]);
  const f = rest.indexOf('front');
  return mixOrderString([...rest.slice(0, f + 1), id, ...rest.slice(f + 1)]);
}

/**
 * Each mover's row in the stack of five, 0 at the bottom: what the shader
 * walks. The LED ring at row 0 is the lamp; the front plate is never told,
 * since it is whichever row is left at the bottom.
 */
export function mixPositions(raw: unknown): Record<MixMover, number> {
  const st = mixStack(raw);
  return { led: st.indexOf('led'), back: st.indexOf('back'), film: st.indexOf('film'), mark: st.indexOf('mark') };
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * A source's grade as the shader takes it: brightness, contrast, saturation,
 * and the hue in radians, from the four settings as they are stored. Clamped
 * to the controls' travel, so a value a patch or a typed URL pushed past the
 * end is the end, and a missing one (a look saved before the mixer) is none.
 *
 * Handed the four values rather than the settings and a source's name, so
 * that each is read where it is used, by name: `npm run panel` holds every
 * setting to being read somewhere, and a key made up from a source's name
 * is a read nobody can grep for.
 */
export function mixGrade(bright: unknown, contrast: unknown, sat: unknown, hue: unknown): [number, number, number, number] {
  const at = (v: unknown, g: MixGrade) => {
    const { min, max, none } = GRADE_RANGE[g];
    return Math.max(min, Math.min(max, num(v, none)));
  };
  return [at(bright, 'Bright'), at(contrast, 'Contrast'), at(sat, 'Sat'), at(hue, 'Hue') * Math.PI / 180];
}
