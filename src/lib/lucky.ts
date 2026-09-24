import type { VisualizerSettings } from '../types';
import { DROPPER_COLORS } from '../constants';
import { DIFFUSION_CEILING } from './deskPins';

/**
 * The backdrop's two colours, which have to be two.
 *
 * Rolled independently they came up the same colour once in every seventeen
 * photo looks — `#FF0000`/`#FF0000`, `#0000FF`/`#0000FF` — and in photo mode
 * the backdrop is `mix(paperA, paperB, g)` across the whole frame, so an
 * identical pair is a flat saturated field with no gradient in it at all.
 * With the dye thin on top, that is the reported "the entire plate goes to a
 * single colour", and the yellow screen that filled the view: 1.6% of every
 * roll — often enough to hit inside a set, rare enough that twelve rolls of
 * `npm run evolve` missed it.
 *
 * Every hand-authored look pairs two colours that differ — blue into pale
 * blue, teal into orange, amber into red-orange — because the pair *is* the
 * gradient. So the second is drawn only from the colours far enough from the
 * first to read as one.
 */
const PAPER_GAP = 90;

const rgbOf = (hex: string): [number, number, number] =>
  [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const paperPair = (rand: () => number): { paperA: string; paperB: string } => {
  const paperA = DROPPER_COLORS[Math.floor(rand() * DROPPER_COLORS.length)];
  const [ar, ag, ab] = rgbOf(paperA);
  const far = DROPPER_COLORS.filter((hex) => {
    const [r, g, b] = rgbOf(hex);
    return Math.hypot(r - ar, g - ag, b - ab) >= PAPER_GAP;
  });
  // The palette is wide enough that this never empties; a palette edited down
  // to near-neighbours should give a dull backdrop rather than throw.
  const pool = far.length ? far : DROPPER_COLORS;
  return { paperA, paperB: pool[Math.floor(rand() * pool.length)] };
};

/**
 * One roll of the dice: a complete look, made up on the spot.
 *
 * "Randomise the look", and what `onNewSong: 'random'` reaches for. It lived
 * inside `App.tsx` as an object literal in a click handler, which is the
 * reason it is here now: **nothing could check it.** Two of its eighty-odd
 * ranges had drifted out of step with the looks it replaces, and neither
 * showed up as a failure anywhere — they showed up as somebody watching the
 * plate and saying the random looks had stopped working.
 *
 * The drift is the predictable kind. A roll is a third list of what a setting
 * may be, beside the presets and the desk's own ranges, and it is the one
 * nobody edits when a range changes. Tuning every preset's speed to 0.6 of
 * what it was left this reaching half as far again as the fastest thing it
 * could replace; putting a ceiling on dye diffusion left this rolling ten
 * times over it, which washes the dye into an even film and reads as the dye
 * being gone.
 *
 * `npm run panel` now holds a thousand rolls against the desk's declared
 * range for every setting either of them names.
 *
 * `rand` is injected so that check can be deterministic; everything else
 * takes it straight from `Math.random`.
 */
export function luckyLook(
  current: VisualizerSettings,
  ledColors: string[],
  rand: () => number = Math.random,
): VisualizerSettings {
  const blendModes: ('screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay')[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];
  const ledModes: ('single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk')[] = ['single', 'rainbow', 'ocean', 'fire', 'cyberpunk'];
  const audioFeatures: ('none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity')[] = ['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'];
  const randomFeature = () => audioFeatures[Math.floor(rand() * audioFeatures.length)];

  return {
    /*
      Everything this roll does not have an opinion about, kept.

      It used to hand `setSettings` a bare object literal, and a literal that
      names 85 of the 118 settings leaves the other 33 `undefined`. Nothing
      caught it: they are all read as `settings.x ?? default` somewhere
      downstream, so instead of a crash they quietly went to their defaults —
      which for beads, cells, lacing, granulation, sharpness, dish spread and
      fingering means **off**. A roll randomised the whole plate and stripped
      out its texture in the same movement, and the only symptom was that
      random looks felt bare.

      `onNewSong` went with them, so the first random look was also the last
      one: reset to undefined, it reads as 'off', and the thing that asks for
      a new look on a new song had switched itself off.
    */
    ...current,
    sensitivity: rand() * 0.8 + 0.2,
    /*
      1 to 2, not 0.5 to 2. No preset sets this — it is an ear setting, so
      the desk's own range is the authority, and the desk starts at 1. A roll
      below that put the plate on a value no fader could reach or get back
      to: pin bass boost after such a roll and the first touch jumps.
      Found by the check below, not by anyone looking.
    */
    bassBoost: 1 + rand(),
    autoCalibrate: current.autoCalibrate,
    /*
      The looks run between 0.0072 and 0.27, and thirty of the thirty-two
      sit below 0.037; the median is 0.018. This range used to be
      0.012–0.06 — a median of 0.036, twice a typical look's — which was
      merely generous until every preset was scaled to 0.6 of its old
      speed, and then it was a roll that reliably came out faster than
      anything it could replace.

      The looks have been scaled twice now — 0.6, and 0.7 again when they
      still opened too fast — and this range has followed both times.
      `npm run panel` holds it to the looks' own median rather than to a
      remembered number, so it cannot drift again without saying so.
    */
    globalSpeed: 0.005 + rand() * 0.0202,
    audioMappings: { velocity: randomFeature(), density: randomFeature(), color: randomFeature(), rotation: randomFeature() },
    platePressure: rand(), glassSmear: rand(), rainDrip: rand(),
    viscosity: rand() > 0.5 ? 'thick' : 'thin', polarity: rand(),
    evaporationRate: rand() * 0.05,
    airVelocity: rand() * 0.5, vibrationFrequency: rand(),
    layerCount: rand() > 0.5 ? 2 : 1,
    blendMode: blendModes[Math.floor(rand() * blendModes.length)],
    gooeyEffect: rand(),
    /*
      Rotation, kept near the range the looks actually use.

      This rolled to 0.1, which is eight times the highest of the
      thirty-two shipped looks (0.012) and about thirty times the median. The
      dice are meant to explore, but a plate turning eight times faster than
      anything anybody tuned is the other half of the spinning square that has
      now been reported three times — the first half being a zoom that should
      have been held and was not. Twice the looks' top leaves room to surprise
      without leaving the vocabulary.
    */
    rotationSpeed: rand() * 0.025,
    centerGravity: rand(),
    ledPlatform: rand() > 0.5,
    ledMode: ledModes[Math.floor(rand() * ledModes.length)],
    ledColor: ledColors[Math.floor(rand() * ledColors.length)],
    ledSpeed: rand() * 0.5,
    
    /*
      A tenth of what it was, which is the ceiling every look is now under.
      Dye diffusion costs a full solver pass whatever rate it is given, and
      above the ceiling it takes more structure out of the plate than it
      puts in — at 0.002 it washes the dye into an even film, which reads
      as the dye having gone. One roll in four takes none at all, which is
      both sharper and a whole pass cheaper.
    */
    diffusionRate: rand() < 0.25 ? 0 : rand() * DIFFUSION_CEILING,
    buoyancy: rand(), advection: rand() * 0.8 + 0.2,
    damping: rand() * 0.1 + 0.9, heatDecay: rand() * 0.1 + 0.9,
    automateRate: rand() * 0.2,
    audioImpact: current.audioImpact,
    turbulenceScale: rand() * 0.7,
    turbulenceDetail: 1 + Math.floor(rand() * 4),
    blobSurfaceTension: rand(),
    boundaryContrast: rand() * 0.7,
    saturationBoost: 1.0 + rand() * 0.8,
    dyeBudget: 0.4 + rand() * 0.6,
    edgeRelief: rand() * 0.8,
    bubbles: rand() < 0.2 ? 0 : 0.2 + rand() * 0.8,
    plateRock: rand() * 0.9,
    layerScaleVariety: rand(),
    macroSync: rand(),
    hueJourney: rand() < 0.7 ? 1 + Math.round(rand() * 8) * 0.5 : 0,
    beatSqueeze: rand(),
    backgroundLoop: rand(),
    kaleidoscope: rand() < 0.2 ? [2, 4, 6][Math.floor(rand() * 3)] : 0,
    /*
      A dish edge, not a blackout.

      This rolled 0.4 to 1.0 in three rolls out of ten, and at the top of that
      range the vignette closes the dish to a pinhole: measured over forty
      random looks, six came out dark or covered, and `dishVignette` separated
      those six from the rest by five standard deviations — 0.905 against 0.052
      — with nothing else within one and a half. One roll in seven was a dark
      screen, which is a bad thing to press in front of a room.

      No hand-authored look uses this at all: every preset leaves it at zero,
      and the one that names it sets 0.0. So the range it was rolling was one
      nobody had ever chosen. It is the same fault as the backdrop's two
      colours being rolled independently — a randomiser reaching outside what
      any real look does — and it gets the same answer: keep it inside the
      range that reads as the round edge of a projected dish.
    */
    dishVignette: rand() < 0.3 ? 0.15 + rand() * 0.3 : 0,
    lightPlay: 0.3 + rand() * 0.7,
    lampMotion: rand(),
    lampHotspot: rand() * 0.7,
    secondLamp: rand() < 0.35 ? 0.4 + rand() * 0.6 : 0,
    iridescence: rand() * 0.6,
    renderStyle: rand() < 0.25 ? 'photo' : 'show',
    ...paperPair(rand),
    camera: rand() < 0.4 ? 0.5 + rand() * 0.5 : 0,
    focus: rand(),
    aperture: rand() * 0.8,
    bloom: rand() * 0.7,
    chromaticAberration: rand() * 0.6,
    refraction: 0.3 + rand() * 0.7,
    microDroplets: rand() < 0.4 ? rand() : 0,
    thinFilm: rand() < 0.4 ? rand() : 0,
    // The other projectors come out one roll in five, one at a time
    lumia: rand() < 0.2 ? 0.4 + rand() * 0.6 : 0,
    chemistry: rand() < 0.15 ? 0.5 + rand() * 0.5 : 0,
    gelWheel: rand() < 0.2 ? 0.4 + rand() * 0.6 : 0,
    gelSpeed: 0.2 + rand() * 1.5,
    lampWarmth: rand() < 0.3 ? rand() * 0.8 : 0,
    exposure: rand() < 0.25 ? rand() * 0.8 : 0,
    filmMix: current.filmMix,
    filmKey: current.filmKey,
    glossiness: rand() < 0.8 ? 0 : rand() * 0.4,
    postBlurRadius: rand() * 0.7,
    // One roll in four goes closeup — a magnified chase is its own happy
    // accident. The zoom decides now, so the roll lands on the zoom and the
    // flag follows it rather than the two disagreeing.
    ...(rand() < 0.25
      // 4 to 12 was a range nobody had chosen: the three macro looks in the
      // tree sit at 3.5, 4.0 and 4.5, and past about five the closeup is a
      // small dark patch of one bead. It was the second thing separating a
      // dark random look from a watchable one once the vignette was fixed.
      ? { macroMode: true, macroZoom: 3.5 + rand() * 1.5 }
      : { macroMode: false, macroZoom: 1 }),
    macroChase: 0.35 + rand() * 0.65,
    macroHold: 2.5 + rand() * 7,
    macroCells: rand(),
    macroCellScale: 0.25 + rand() * 0.7,
    macroLacing: rand(),
    macroDepth: 0.25 + rand() * 0.6,
    macroEdgeDetail: 0.3 + rand() * 0.7,
    macroRelief: 0.4 + rand() * 0.6,
    simResolution: current.simResolution,
  };
}
