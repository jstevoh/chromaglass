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
 * - **An order for the ones that can move**: the LED ring, the back plate,
 *   the film and the logo when the mixer went in; the gel wheel and the lumia
 *   since (below). The front plate does not move. It is the glass the
 *   lamp shines through, and everything else is drawn relative to it: the LED
 *   ring under it is the lamp under that glass, which is what the LED
 *   platform has always been; above it, the ring is a beam of its own,
 *   screened over whatever is under it, and the front plate is lit by the
 *   plain lamp. Nothing but the lamp's sources can go under the front plate,
 *   because nothing else can be the lamp, and the order is stored as every row,
 *   since "the ring just above the glass" and "the ring under it" put the
 *   four movers in the same order and are different pictures.
 *
 * The rig plan says the mixer is "the place where R1–R3 are worked from", and
 * R1 (a projector with a source of its own, so several live plates) is not
 * built. This is the part that does not need it: the pictures the app already
 * draws, in an order the operator chooses, each with its own grade.
 *
 * **The gel wheel and the lumia** (PLAN.md §11 step 2) came in second. They
 * were "any other image input" still set in their own corner of Settings
 * (Lamp), drawn in a fixed place: the gel over the LED lamp, the lumia added
 * after it, both under the glass. They are the other two sources that belong
 * with the lamp, so the rule above widens to them: the rows under the front
 * plate are the lamp, built bottom up, and only the LED ring, the gel and the
 * lumia can be there. Above the glass each becomes what that thing is when it
 * is not in the lamp house: the lumia a beam of its own on the screen, like
 * the LED ring's, and the gel a filter in front of the lens, which colours
 * everything under it in the stack. The gel keeps its rule wherever it is:
 * it colours what is *under* it, so in the lamp it tints only the lamp rows
 * below it, and over the glass it tints the picture below it and not the
 * sources laid on top. A saved order from before them keeps its picture: the
 * two go in under the front plate, where they always were.
 */

import type { VisualizerSettings } from '../types';

/** The sources that can be moved in the stack. */
export type MixMover = 'led' | 'back' | 'film' | 'mark' | 'gel' | 'lumia';
/** Every row the mixer draws: the movers and the front plate, which cannot move. */
export type MixSource = MixMover | 'front';

export const MIX_MOVERS: readonly MixMover[] = ['led', 'back', 'film', 'mark', 'gel', 'lumia'];

/**
 * The sources that can be the lamp, under the front plate. Light and a filter
 * in the lamp house; a plate, a film and a card cannot shine through glass
 * from beneath it.
 */
export const MIX_LAMP: readonly MixMover[] = ['led', 'gel', 'lumia'];
const isLamp = (m: MixSource): boolean => (MIX_LAMP as readonly string[]).includes(m);

/** Bottom to top, as the shader drew them before there was a choice. */
export const DEFAULT_MIX_ORDER = 'led gel lumia front back film mark';
const ALL_ROWS: readonly MixSource[] = ['led', 'gel', 'lumia', 'front', 'back', 'film', 'mark'];

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
  gel:   { id: 'gel',   name: 'Gel Wheel',   level: 'gelWheel',   hint: 'A turning four-colour gel. In the lamp it colours the lamp; above the glass it colours everything under it.' },
  lumia: { id: 'lumia', name: 'Lumia',       level: 'lumia',      hint: 'Slow folded sheets of light. In the lamp they light the glass; above it they are a beam of their own.' },
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

const ROWS: MixSource[] = ['led', 'front', 'back', 'film', 'mark', 'gel', 'lumia'];

/**
 * Every control the mixer adds, with its range: MIDI learns these, the desks
 * can pin them, and the panel check holds the Mixer's sliders to them. The
 * film's and the logo's levels are not here because they are not new: they
 * are Film Mix and Logo Opacity, which already have their own entries; nor
 * are the gel wheel's and the lumia's, which are Gel Wheel and Lumia.
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
 * know, or have lost one, or be garbage typed into `?set=`, and every order
 * saved before the gel wheel and the lumia were rows is short of those two.
 * Anything unknown or repeated is dropped, and the stack always comes back
 * holding all seven, by three steps:
 *
 * 1. The front plate. Where the order puts it, if everything under it can be
 *    the lamp; otherwise (or when it is missing) just above the run of lamp
 *    sources the order starts with. So "the LED ring first" still reads as
 *    the ring being the lamp, and a plate or a film found under the glass is
 *    read as the front plate at the bottom.
 * 2. A missing lamp source goes just under the front plate, in the default's
 *    order. This is the step that keeps an order saved before the gel and the
 *    lumia were rows the same picture: the shader always drew them after the
 *    LED lamp and before the glass, which is exactly there, whether the ring
 *    was the lamp or a beam.
 * 3. Anything else missing goes back where the default has it, but never
 *    under the front plate.
 *
 * Every order the app saves names every row, so these only fill in what an
 * older build left out. A partial order typed by hand into `?set=` is read
 * by the same steps, which differ from the first slice's for such an order
 * (its `mark front` put the LED ring at the bottom and the rest after the
 * logo; now the rows it does not name go back where the default has them).
 */
export function mixStack(raw: unknown): MixSource[] {
  const seen: MixSource[] = [];
  if (typeof raw === 'string') {
    for (const w of raw.split(/[\s,>]+/)) {
      if ((ALL_ROWS as readonly string[]).includes(w) && !seen.includes(w as MixSource)) seen.push(w as MixSource);
    }
  }
  const f = seen.indexOf('front');
  let stack: MixSource[];
  if (f >= 0 && seen.slice(0, f).every(isLamp)) {
    stack = seen;
  } else {
    const rest = seen.filter(m => m !== 'front');
    let run = 0;
    while (run < rest.length && isLamp(rest[run])) run++;
    stack = [...rest.slice(0, run), 'front', ...rest.slice(run)];
  }
  const def = DEFAULT_MIX_ORDER.split(' ') as MixSource[];
  for (const m of def) {
    if (stack.includes(m)) continue;
    const front = stack.indexOf('front');
    if (isLamp(m)) stack.splice(front, 0, m);
    else stack.splice(Math.max(front + 1, Math.min(def.indexOf(m), stack.length)), 0, m);
  }
  return stack;
}

/** The six that move, bottom to top. */
export const parseMixOrder = (raw: unknown): MixMover[] =>
  mixStack(raw).filter((m): m is MixMover => m !== 'front');

export const mixOrderString = (stack: readonly MixSource[]): string => stack.join(' ');

/**
 * One source a step up (`dir` 1) or down (-1) the stack.
 *
 * Moving is a swap with the neighbour, and the front plate is a neighbour too:
 * a lamp source can pass it, which is the LED ring going from the lamp to a
 * beam and back (or the lumia, or the gel from over the lamp to over the
 * lens), and nothing else can go under it. At the top or bottom it stays put:
 * a mixer whose button wrapped round would put the logo under the plate when
 * someone only meant to nudge it.
 */
export function moveInMix(raw: unknown, id: MixMover, dir: 1 | -1): string {
  const stack = mixStack(raw);
  const at = stack.indexOf(id);
  const to = at + dir;
  if (to < 0 || to >= stack.length || (stack[to] === 'front' && !isLamp(id))) return mixOrderString(stack);
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
  // A lamp source's lowest row is the bottom of the lamp, under the glass;
  // anything else's is just above the front plate.
  if (isLamp(id)) return mixOrderString([id, ...rest]);
  const f = rest.indexOf('front');
  return mixOrderString([...rest.slice(0, f + 1), id, ...rest.slice(f + 1)]);
}

/**
 * Each row's place in the stack of seven, 0 at the bottom: what the shader
 * walks. Everything under the front plate is the lamp. `top` is the highest
 * row, which the logo leaves to the finish.
 */
export function mixPositions(raw: unknown): Record<MixSource | 'top', number> {
  const st = mixStack(raw);
  return {
    led: st.indexOf('led'), back: st.indexOf('back'), film: st.indexOf('film'), mark: st.indexOf('mark'),
    gel: st.indexOf('gel'), lumia: st.indexOf('lumia'), front: st.indexOf('front'), top: st.length - 1,
  };
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
