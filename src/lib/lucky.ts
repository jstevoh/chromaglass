import type { VisualizerSettings } from '../types';
import { DROPPER_COLORS } from '../constants';
import { DIFFUSION_CEILING } from './deskPins';

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
    heatIntensity: rand() * 0.5, boilingPoint: rand(), evaporationRate: rand() * 0.05,
    airVelocity: rand() * 0.5, vibrationFrequency: rand(),
    layerCount: rand() > 0.5 ? 2 : 1,
    blendMode: blendModes[Math.floor(rand() * blendModes.length)],
    gooeyEffect: rand(), rotationSpeed: rand() * 0.1, centerGravity: rand(),
    ledPlatform: rand() > 0.5,
    ledMode: ledModes[Math.floor(rand() * ledModes.length)],
    ledColor: ledColors[Math.floor(rand() * ledColors.length)],
    ledSpeed: rand() * 0.5,
    surfaceTension: rand() * 0.2,
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
    dishVignette: rand() < 0.3 ? 0.4 + rand() * 0.6 : 0,
    lightPlay: 0.3 + rand() * 0.7,
    lampMotion: rand(),
    lampHotspot: rand() * 0.7,
    secondLamp: rand() < 0.35 ? 0.4 + rand() * 0.6 : 0,
    iridescence: rand() * 0.6,
    renderStyle: rand() < 0.25 ? 'photo' : 'show',
    paperA: DROPPER_COLORS[Math.floor(rand() * DROPPER_COLORS.length)],
    paperB: DROPPER_COLORS[Math.floor(rand() * DROPPER_COLORS.length)],
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
      ? { macroMode: true, macroZoom: 4 + rand() * 8 }
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
