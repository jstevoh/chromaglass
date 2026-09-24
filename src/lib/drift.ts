import type { VisualizerSettings } from '../types';
import { PINNABLE, PIN_RANGE } from './deskPins';
import { STRUCTURE } from './lookFade';

/**
 * Evolve, as a slow wander rather than a new look every few minutes.
 *
 * "Random Evolve" used to mean two unrelated things. One was the automation
 * that drops dye and blows air, which is what the Evolve Speed slider rides.
 * The other was a *whole new look* rolled at a song boundary — fifty-five
 * settings replaced at once, which is a cut, not an evolution. Nothing in
 * between existed: the plate either held perfectly still in its settings or
 * jumped somewhere else entirely.
 *
 * This is the in-between. Every few seconds a couple of dials move a little,
 * and they move *around where the look already is* rather than away from it:
 * each one is held inside a window either side of the value the look had when
 * evolving started, so an hour of this wanders the mood without ever arriving
 * somewhere the look was not.
 */

/**
 * What a drift is allowed to touch.
 *
 * Excluded by category, and the categories matter more than the list:
 *
 *   **Structure** has no halfway — `layerCount` 1.4 is not a plate and a half
 *   — so `lookFade` already holds these rather than fading them, and drifting
 *   them would be worse than fading them.
 *
 *   **The light and finish stack** is held out deliberately, and not because
 *   it would look bad. Both unexplained flat plates in `docs/roadmap.md` were
 *   found with several of these high at once — the second was 100% of the
 *   frame at rgb(255,0,255) with saturationBoost 1.80, lumia 0.88, secondLamp
 *   0.83 and gelWheel 0.70. Until that is understood, an automation that
 *   wanders into the same corner on its own is an automation that will
 *   eventually be blamed for it. They stay on the desk, under a hand.
 *
 *   **The ear and the inputs** are calibration, not look: how loud the room
 *   is, how hard a camera drives the plate. Drifting them changes what the
 *   show *responds to*, which is a decision rather than a mood.
 *
 *   **The mark** is a brand, and **the closeup** is a camera move.
 *
 *   **Stepped dials** jump rather than drift, so a nudge is a cut.
 */
const LIGHT_STACK = new Set([
  'saturationBoost', 'bloom', 'lumia', 'gelWheel', 'secondLamp', 'dimmer',
  'exposure', 'transmission', 'iridescence',
]);
const CALIBRATION = new Set([
  'audioImpact', 'automateRate', 'sensitivity', 'bassBoost', 'beatPrediction',
  'beatLead', 'filmDrive', 'filmImpact', 'filmMix', 'filmKey', 'soundImpact',
  'shapeImpact', 'sceneDrive', 'sceneHands', 'sceneImpact', 'sceneDeadzone',
  'sceneSmooth', 'camera',
]);
const NOT_THE_LOOK = new Set([
  'markMix', 'markScale', 'markX', 'markY',
  'macroHold', 'macroCells', 'macroCellScale', 'macroLacing', 'macroDepth',
  'macroEdgeDetail', 'macroRelief', 'macroSync', 'macroChase',
]);

/** Dials that move in whole steps, where a nudge would be a jump. */
const isStepped = (key: string): boolean => {
  const spec = PIN_RANGE.get(key);
  return !!spec && typeof (spec as { step?: number }).step === 'number';
};

export const DRIFTABLE: readonly string[] = PINNABLE
  .map(s => String(s.key))
  .filter(k =>
    !(STRUCTURE as ReadonlySet<string>).has(k) && !LIGHT_STACK.has(k) && !CALIBRATION.has(k) &&
    !NOT_THE_LOOK.has(k) && !isStepped(k));

/**
 * One step of the wander.
 *
 * `anchor` is the look as it was when evolving started. `amount` is the Evolve
 * Speed, so the same slider that decides how often a drop lands decides how
 * far the mood moves; at zero nothing moves at all.
 */
export function driftLook(
  current: VisualizerSettings,
  anchor: VisualizerSettings,
  amount: number,
  rand: () => number = Math.random,
  dials = 2,
): Partial<VisualizerSettings> {
  const rate = Math.max(0, Math.min(1, amount));
  if (rate <= 0) return {};
  const out: Record<string, number> = {};
  for (let i = 0; i < dials; i++) {
    const key = DRIFTABLE[Math.floor(rand() * DRIFTABLE.length)];
    const spec = PIN_RANGE.get(key);
    if (!spec) continue;
    const { min, max } = spec;
    const span = max - min;
    const now = typeof current[key as keyof VisualizerSettings] === 'number'
      ? current[key as keyof VisualizerSettings] as unknown as number : undefined;
    const was = typeof anchor[key as keyof VisualizerSettings] === 'number'
      ? anchor[key as keyof VisualizerSettings] as unknown as number : undefined;
    if (now === undefined || was === undefined) continue;
    /*
      A look that set something to zero switched it off. Leave it off.

      Drifting a dial a hair off zero is not a small change to that dial — it
      is switching a feature on at a value too small to see, and several of
      them are modes rather than amounts. `dishSpread` at 0.003 turned the
      plate from filling the frame into a disc inscribed in its height and
      took 48% of the picture with it, showing no spread at all in exchange;
      that is fixed in the shader now, but it was found by this drift walking
      into it, and the next one like it should not need finding twice.

      So a drift scales what a look is already doing and never switches on
      what it switched off. Turning something on is a decision, and it belongs
      to a hand.
    */
    if (was === 0) continue;
    // A nudge of a few percent of the dial's travel, either way.
    const step = span * (0.015 + 0.05 * rate) * (rand() * 2 - 1);
    // And never further than a fifth of the travel from where the look sat,
    // so this wanders around a look instead of walking away from one.
    const lo = Math.max(min, was - span * 0.2);
    const hi = Math.min(max, was + span * 0.2);
    out[key] = Math.max(lo, Math.min(hi, now + step));
  }
  return out as Partial<VisualizerSettings>;
}
