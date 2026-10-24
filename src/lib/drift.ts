import type { VisualizerSettings } from '../types';
import { PINNABLE, PIN_RANGE } from './deskPins';
import { STRUCTURE } from './lookFade';
import { MIX_KEYS } from './mixer';
import { stream } from './rng';

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
 * This is the in-between: what Evolve may move, in which groups, and how far.
 * Every dial it moves stays *around where the look already is* rather than
 * walking away from it: each one is held inside a window either side of the
 * value the look had when evolving started, so an hour of this wanders the
 * mood without ever arriving somewhere the look was not. When and which way
 * is lib/slowEvolve.ts: one move at a time, glided over half a minute to a
 * minute and a half at the default Evolve Speed (the dial scales it), steered by the song's sections and its loudness over the
 * last half minute, or by a slow clock when nothing is playing.
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
 *   **The mark** is a brand, **the closeup** is a camera move, and **where
 *   the magnet sits** is the performer's hand.
 *
 *   **Stepped dials** jump rather than drift, so a nudge is a cut.
 */
const LIGHT_STACK = new Set([
  'saturationBoost', 'bloom', 'lumia', 'gelWheel', 'secondLamp', 'dimmer',
  'exposure', 'transmission', 'iridescence', 'thicknessOptics', 'spectralOptics',
  // The comic print (the Roy look): half a print is neither, so it moves
  // only by hand.
  'benDay',
  // The ground the dye is seen on (PLAN 18b) turns the picture over, black
  // to the lamp's white: a choice for a look, made by hand.
  'lampGround',
  // Starch in the dish (PLAN 26d): the reaction printed black on white or
  // deposited in the look's colours, a choice for a look, made by hand.
  'turingPrint',
  // And the colour it prints in: an indicator is chosen, not wandered to.
  'turingInk',
  // And how far its chemistry wanders: a look's choice, and Evolve's own slow
  // changes would be a second clock on a clock already slow (PLAN 26d-6).
  'turingDrift',
  // The projector lens's focal plane (PLAN 18e): 0.5 is sharp focus on the
  // plate, so drifting it around 0.5 would defocus looks that ship sharp.
  'projectorFocus',
]);
const CALIBRATION = new Set([
  'audioImpact', 'automateRate', 'sensitivity', 'bassBoost', 'beatPrediction',
  'beatLead', 'filmDrive', 'filmImpact', 'filmMix', 'filmKey', 'soundImpact',
  'shapeImpact', 'sceneDrive', 'sceneHands', 'sceneImpact', 'sceneDeadzone',
  'sceneSmooth', 'camera',
  // How the show follows the music, not what the look is (lib/tempoPace.ts).
  'tempoSync',
  // The set's shape, not the look's (lib/scenePacing.ts): a nudge across its
  // half would switch a sequence's dark endings on or off mid-set.
  'pacing',
  // How the set follows the song, not what the look is (lib/scenePacing.ts).
  'songFollow',
]);
/*
  **What moves the whole picture** is never Evolve's (the owner, 2026-10-11:
  the plate and the camera moving in x and y with the sound, and a press on
  the beat, made him feel sick). Liquids and what they do are the show; the
  frame holds still. These dials each move the whole image or the whole dish
  as one: the cover glass's rock and the Frame Sway beside it, the beat's
  press and its accent, the kaleidoscope's spin and pull, the turntable and
  everything that turns it, the plate's spring back after a press, the lamp
  swinging over the plate, and the film gate's weave. A look that has them
  keeps them exactly where it set them; a hand can still move them. Evolve
  only never does, so an hour of evolving cannot walk a still look into one
  that sways.
*/
export const FRAME_MOTION: ReadonlySet<string> = new Set([
  'plateRock', 'frameSway', 'beatSqueeze', 'beatAccent', 'kaleidoSpin', 'kaleidoZoom',
  'spinRpm', 'rotationSpeed', 'spinImpulse', 'spinWander', 'spinAudioDepth', 'spinDrag',
  'plateSpring', 'lampMotion', 'stockWeave',
]);
/*
  And what Evolve does itself, so it does not also wander: the palette moves at
  the song's sections now (lib/slowEvolve.ts), so the hue journey's pace is
  left where the look set it, and Surge is how Evolve's own hands bunch into
  gusts. Directions (which way the plate leans, where comets come from) are a
  hand's choice: a fifth of their travel is seventy degrees, a turn and not a
  mood.
*/
const EVOLVE_OWN = new Set(['hueJourney', 'surge', 'tiltDirection', 'cometAngle']);
const NOT_THE_LOOK = new Set([
  'markMix', 'markScale', 'markX', 'markY',
  'macroHold', 'macroCells', 'macroCellScale', 'macroLacing', 'macroDepth',
  'macroEdgeDetail', 'macroRelief', 'macroSync', 'macroChase',
  // How far the music moves the frame (lib/plateRock.ts): a wander would
  // start the frame sliding under the viewer by itself, the very thing the
  // owner turned off (2026-10-11).
  'frameSway',
  // How far a tilt sloshes the liquid (lib/slosh.ts): the owner's hand on the
  // tilt, like the direction above, and a dial that would set the plate
  // slopping by itself in a look that was still.
  'slosh',
  // How much of a burst each kick throws (Kick Bloom): the owner's hand, as
  // Frame Sway is. It is 1 on every look so none changes, and a wander would
  // walk a look off the amount it ships with and into the dye-free calm of 0
  // with nobody touching it; it also joined Evolve's pool of dials and moved
  // which one it reached for, so `npm run slowevolve`'s answer-in-half-a-minute
  // check read 63.5 s with this dial in the pool and passes without it.
  'kickBloom',
  // Evolve moves the camera's aim itself, as a camera move (App.tsx).
  'macroAimX', 'macroAimY',
  /*
    Where the magnet sits is the performer's hand, not the mood. A magnet the
    Magnet tool sets down stays there until the look places its own somewhere
    (LiquidVisualizer, magnetFor), and a drift of Magnet Across or Up is the
    look placing it: under Evolve the magnet left in a corner would have
    jumped back to the middle at the first nudge, which is the very thing the
    owner asked to be rid of. How far it walks when nobody has it still drifts.
  */
  'magnetX', 'magnetY',
  // And how big that hand's magnet is (Magnet Size): the performer's choice.
  'magnetSize',
  // The clear film (PLAN §20b): moving it pours clear oil over the dish or
  // draws it off, so a wander would fill the lace's holes back in by itself.
  'clearFilm',
  // The mixer is the operator's desk: a grade that wandered on its own would
  // be a film going grey under nobody's hand.
  ...MIX_KEYS.map(String),
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
    !NOT_THE_LOOK.has(k) && !FRAME_MOTION.has(k) && !EVOLVE_OWN.has(k) && !isStepped(k));

/**
 * The dials Evolve moves together, a few at a time.
 *
 * The owner, 2026-10-11: Evolve should "focus on more slowly changing
 * settings (as opposed to directly reacting to frequency and bouncing
 * around)" and "slowly change the visuals in creative and interesting ways".
 * Two unrelated dials nudged every six seconds read as noise: the eye cannot
 * follow a change of grain and of magnet height at once, and by the time it
 * has seen one there are two more. A move is a handful of dials that belong
 * to one idea (the oil thickening and slowing, the glass going glossier and
 * sharper, the chemistry coming up), all going the same way at once over the
 * better part of a minute, so it reads as one thing happening to the dish.
 *
 * Each dial carries its sign under *livelier*: +1 when more of it is more
 * going on, -1 when more of it calms the dish (a heavier drag, a softer
 * blur, a tauter skin, a magnet held further off). The music's mood picks the
 * way (lib/slowEvolve.ts), and the sign turns that into each dial's way.
 *
 * Any dial Evolve may move that no theme names falls into the last one, so a
 * new setting is still wandered without anyone remembering to list it here.
 */
export const THEMES: readonly { name: string; keys: Readonly<Record<string, 1 | -1>> }[] = (() => {
  const named: { name: string; keys: Record<string, 1 | -1> }[] = [
    { name: 'flow', keys: { globalSpeed: 1, advection: 1, turbulenceScale: 1, vorticityConfinement: 1, damping: 1, depthDrag: -1, platePressure: 1, airVelocity: 1, gooeyEffect: -1 } },
    { name: 'dye', keys: { dyeBudget: 1, colourBody: 1, diffusionRate: 1, granulation: 1, grainScale: -1, layerScaleVariety: 1, boundaryContrast: 1, polarity: 1, particles: 1, particleMix: 1 } },
    { name: 'surface', keys: { cells: 1, lacing: 1, bubbles: 1, beads: 1, beadDrops: 1, microDroplets: 1, blobSurfaceTension: -1, oilTension: 1, surfactantFlow: 1, fingering: 1, dropHeight: 1, edgeRelief: 1, oilBodies: 1 } },
    { name: 'heat', keys: { buoyancy: 1, solutalBuoyancy: 1, doubleDiffusion: 1, heatDecay: 1, centerGravity: -1, plateUpright: 1, evaporationRate: 1, vibrationFrequency: 1 } },
    { name: 'glass', keys: { glossiness: 1, refraction: 1, chromaticAberration: 1, thinFilm: 1, focus: 1, aperture: 1, sharpness: 1, postBlurRadius: -1, lampWarmth: 1, lampHotspot: 1, lightPlay: 1, dishVignette: -1, gelSpeed: 1, glassSmear: -1, backgroundLoop: 1 } },
    { name: 'chemistry', keys: { chemistry: 1, chemistryPattern: 1, chemistryWidth: 1, phIndicator: 1, bzReaction: 1, liesegang: 1 } },
    { name: 'ferrofluid', keys: { phaseAmount: 1, phaseScale: 1, phaseSharp: 1, magnetStrength: 1, magnetHeight: -1, magnetWalk: 1, ferroLabyrinth: 1, mazeDetail: 1, phaseDisplace: 1, gapThickness: 1, filmPhysics: 1 } },
    { name: 'film', keys: { stock: 1, stockGrain: 1, stockGrainSize: 1, stockGate: 1 } },
  ];
  const ok = new Set(DRIFTABLE);
  for (const t of named) for (const k of Object.keys(t.keys)) if (!ok.has(k)) delete t.keys[k];
  const taken = new Set(named.flatMap(t => Object.keys(t.keys)));
  const rest: Record<string, 1 | -1> = {};
  for (const k of DRIFTABLE) if (!taken.has(k)) rest[k] = 1;
  return [...named, { name: 'texture', keys: rest }].filter(t => Object.keys(t.keys).length > 0);
})();

/**
 * Where a dial may go: inside a fifth of its travel either side of the value
 * the look set, and only if the look set it at all.
 *
 * Returns null for a dial Evolve must leave alone on this look.
 *
 * A look that set something to zero switched it off. Leave it off. Drifting
 * a dial a hair off zero is not a small change to that dial — it is switching
 * a feature on at a value too small to see, and several of them are modes
 * rather than amounts. `dishSpread` at 0.003 turned the plate from filling the
 * frame into a disc inscribed in its height and took 48% of the picture with
 * it; that is fixed in the shader now, but it was found by the drift walking
 * into it, and the next one like it should not need finding twice. Turning
 * something on is a decision, and it belongs to a hand.
 *
 * The one exception: a look with ferrofluid and a magnet under it has the
 * magnet's walk *implied*, since a still magnet is the only reason that
 * ferrofluid sits still. So on such a look the walk wanders around a gentle
 * middle even if the look never set one.
 */
export function dialWindow(key: string, current: VisualizerSettings, anchor: VisualizerSettings):
  { now: number; was: number; lo: number; hi: number; span: number } | null {
  const spec = PIN_RANGE.get(key);
  if (!spec) return null;
  const { min, max } = spec;
  const span = max - min;
  const read = (s: VisualizerSettings) => {
    const v = s[key as keyof VisualizerSettings];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const now = read(current);
  let was = read(anchor);
  if (now === undefined || was === undefined) return null;
  if (key === 'magnetWalk' && (anchor.phaseAmount ?? 0) > 0.002 && (anchor.magnetStrength ?? 0) > 0) {
    was = Math.max(was, 0.5);
  }
  if (was === 0) return null;
  return { now, was, span, lo: Math.max(min, was - span * 0.2), hi: Math.min(max, was + span * 0.2) };
}

/**
 * One move's targets: up to `dials` of a theme's dials that are in play on
 * this look, each sent to a place in its window.
 *
 * `lean` is the music's mood for this move, -1 (calmer) to 1 (livelier), and
 * `reach` how much of the window a move may use (the Evolve Speed). Where in
 * the window each dial goes is mostly the lean, through the dial's sign, and
 * partly its own roll, so two moves in the same mood are not the same move.
 * A target that lands within a hair of where the dial already is goes the
 * other way instead: a move nobody can see is a move wasted.
 */
export function moveTargets(
  theme: { keys: Readonly<Record<string, 1 | -1>> },
  current: VisualizerSettings,
  anchor: VisualizerSettings,
  lean: number,
  reach: number,
  rand: () => number = stream('show.drift').float,
  dials = 3,
): Record<string, number> {
  const live = Object.keys(theme.keys).filter(k => dialWindow(k, current, anchor));
  // A shuffle by the stream, so which few of a theme's dials move is the seed's.
  for (let i = live.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [live[i], live[j]] = [live[j], live[i]];
  }
  const out: Record<string, number> = {};
  const r = Math.max(0, Math.min(1, reach));
  for (const k of live.slice(0, dials)) {
    const w = dialWindow(k, current, anchor)!;
    let place = theme.keys[k] * Math.max(-1, Math.min(1, lean)) * 0.7 + (rand() * 2 - 1) * 0.45;
    place = Math.max(-1, Math.min(1, place));
    const half = place >= 0 ? w.hi - w.was : w.was - w.lo;
    let to = w.was + Math.sign(place) * Math.abs(place) * half * r;
    if (Math.abs(to - w.now) < w.span * 0.02 * r) {
      const other = place >= 0 ? w.was - w.lo : w.hi - w.was;
      to = w.was - Math.sign(place || 1) * Math.max(0.3, Math.abs(place)) * other * r;
    }
    out[k] = Math.max(w.lo, Math.min(w.hi, to));
  }
  return out;
}
