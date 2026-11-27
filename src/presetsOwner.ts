import type { Preset } from './presets';

/**
 * The owner's three saved looks, shipped to everyone (PLAN 34b-7).
 *
 * What was asked (the owner, 2026-11-27): "I saved a few looks on my account.
 * Let's add those to the pre saved ones we can share", and "feel free to
 * improve my saved presets as well". Read from the Mac app as it played each
 * one (its show server's settings, the look's half; the room's half, the
 * projector, mixer and microphone, stays the performer's), and written here
 * as what differs from DEFAULT_SETTINGS, which every look is laid over.
 *
 * Laid after every other pass in presetsLay.ts, not before: a saved look was
 * saved with its cords already on it (the music's stir, its hands, the
 * glass's slide), the same cords those passes give a built-in look, so laying
 * them again would double each one. Placed among the house looks, before the
 * moiré pack, in the order they were saved.
 *
 * In a module of its own beside presets.ts because that file is at its size
 * ceiling (`npm run sizes`). Their dyes, injection and liquids are in
 * presetPlate.ts with every look's; their stills in public/looks/ from
 * `npm run lookstills`.
 *
 * What was changed from the saved look is commented where it was changed.
 */
/*
  Classical Vibe: the photograph style (a lens, its focus and bloom) on a thin
  water at a slow pace, two paper colours, sienna and ice, for the light the
  dish is shot through. Kept as saved.
*/
export const CLASSICAL_VIBE: Preset = {
  id: 'classical-vibe',
  name: 'Classical Vibe',
  description: 'Warm sienna and ice-blue water photographed under a soft lamp: slow, rounded swells that breathe with the music\u2019s energy, the glass rocked gently and a hand squeezing it on the beat.',
  settings: {
    stockGrainSize: 1.884,
    stockGate: 0.3152,
    globalSpeed: 0.05271,
    audioMappings: { velocity: 'energy', density: 'energy', color: 'timbre', rotation: 'complexity' },
    platePressure: 0.5382,
    slosh: 0.5,
    glassSmear: 0.2981,
    rainDrip: 0.1718,
    viscosity: 'thin',
    polarity: 0.3234,
    evaporationRate: 0.002428,
    airVelocity: 0.4926,
    vibrationFrequency: 0.2296,
    blendMode: 'lighter',
    gooeyEffect: 0.6026,
    rotationSpeed: 0.1931,
    centerGravity: 0.4207,
    ledMode: 'fire',
    ledColor: '#faf6cc',
    ledSpeed: 0.4287,
    granulation: 0.5,
    grainScale: 138.8,
    diffusionRate: 0.000005541,
    buoyancy: 0.1723,
    advection: 0.7355,
    damping: 0.9419,
    heatDecay: 0.9667,
    cometSpeed: 1.5,
    cometAngle: 90,
    surge: 0.6,
    automateRate: 0.1056,
    turbulenceScale: 0.5035,
    turbulenceDetail: 2,
    blobSurfaceTension: 0.155,
    boundaryContrast: 0.295,
    saturationBoost: 1.382,
    lampGround: 1,
    dyeBudget: 0.5884,
    edgeRelief: 0.3335,
    plateRock: 0.8054,
    layerScaleVariety: 0.7438,
    hueJourney: 0,
    beatSqueeze: 0.5293,
    backgroundLoop: 0.6085,
    lightPlay: 0.6613,
    lampMotion: 0.3356,
    lampHotspot: 0.5845,
    iridescence: 0.2086,
    renderStyle: 'photo',
    paperA: '#A0522D',
    paperB: '#A5F2F3',
    focus: 0.5773,
    aperture: 0.523,
    bloom: 0.517,
    chromaticAberration: 0.2637,
    refraction: 0.5218,
    gelSpeed: 0.7597,
    moireSheetA: 'quasi',
    moireSheetB: 'quasi',
    moireAngle: 2,
    moireSpin: 0.15,
    moireDensity: 26,
    moireGap: 2,
    moireFlip: false,
    lampWarmth: 0.097,
    beads: 0,
    postBlurRadius: 0.3546,
    macroChase: 0.53,
    macroHold: 9.106,
    macroSync: 0.5725,
    macroCellScale: 0.8853,
    macroDepth: 0.2751,
    macroRelief: 0.4586,
    sceneMappings: [
      { source: 'bands', feature: 'bass', setting: 'cometSpeed', depth: 0.4 },
      { source: 'bands', feature: 'tonalMid', setting: 'cometAngle', depth: 0.125 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
      { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.33 },
      { source: 'sound', feature: 'energy', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'pulse', volume: 0.6, size: 0.12 },
      { source: 'sound', feature: 'energy', setting: 'areaHeat', depth: 0.05, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'heat', size: 0.1 },
      { source: 'sound', feature: 'energy', setting: 'areaPress', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'press', gain: 1.176, size: 0.42 },
      { source: 'hits', feature: 'kickHit', setting: 'areaPour', depth: 0.5, mode: 'gate', threshold: 0.3, attack: 0, release: 0.1, volume: 3.2, drops: 8, size: 0.3, bottle: 2, masters: [
        'audioImpact',
        'kickBloom',
      ], role: 'bloom' },
      { source: 'sound', feature: 'mid', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'stream', volume: 1.44, gain: 1.429, size: 0.2, wander: 0.6, bottle: 1 },
      { source: 'sound', feature: 'energy', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'swell', volume: 1.44, size: 0.2, wander: 0.56, bottle: 3 },
      { source: 'sound', feature: 'timbre', setting: 'areaHue', depth: 0.6, mode: 'follow', role: 'bottle', wander: 1 },
    ],
  },
};
/*
  Mushy Mushy: thick liquid in two layers with a ferrofluid phase on a
  walking magnet, the chemistry (Liesegang rings, the Turing print, a little
  BZ) printing through it, and a long hue journey. Kept as saved but for
  Turbulence (below) and the name, capitalised as the other looks' are.
*/
export const MUSHY_MUSHY: Preset = {
  id: 'mushy-mushy',
  name: 'Mushy Mushy',
  description: 'Thick, layered liquid with everything stirring at once: a magnet walking under ferrofluid, a reaction printing rings through the dye, and two plates of colour sliding over each other while the hue wanders.',
  settings: {
    stockGrain: 0.4822,
    stockGrainSize: 2.083,
    stockGate: 0.3152,
    globalSpeed: 0.01795,
    particles: 0.25,
    audioMappings: { velocity: 'volume', density: 'treble', color: 'mid', rotation: 'treble' },
    platePressure: 0.7712,
    gapThickness: 0.3953,
    phaseAmount: 0.6751,
    phaseScale: 0.357,
    phaseSharp: 0.3486,
    magnetHeight: 0.2622,
    magnetStrength: 0.7733,
    magnetWalk: 0.5085,
    vorticityConfinement: 1.902,
    oilTension: 0.2505,
    surfactantFlow: 0.5368,
    slosh: 0.5,
    doubleDiffusion: 0.4546,
    phIndicator: 0.25,
    bzReaction: 0.1,
    liesegang: 0.35,
    glassSmear: 0.5605,
    rainDrip: 0.3746,
    polarity: 0.2757,
    evaporationRate: 0.00442,
    airVelocity: 0.04079,
    vibrationFrequency: 0.8209,
    layerCount: 2,
    gooeyEffect: 0.3646,
    rotationSpeed: 0.1393,
    centerGravity: 0.5513,
    ledColor: '#00875A',
    ledSpeed: 0.01956,
    sharpness: 1,
    granulation: 1,
    grainScale: 85.78,
    diffusionRate: 0.0001343,
    buoyancy: 0.9043,
    advection: 0.4411,
    damping: 0.9513,
    heatDecay: 0.9364,
    cometSpeed: 1.5,
    cometAngle: 90,
    surge: 0.6,
    automateRate: 0.1928,
    // 0.8, saved at 0.99: the music's stir rides Turbulence up from here, and
    // at 0.99 there was no room above it, so the cord read nothing
    // (`npm run soundpatch`). The music now takes it to the top on the mids.
    turbulenceScale: 0.8,
    blobSurfaceTension: 0.4,
    boundaryContrast: 0.4763,
    saturationBoost: 1.567,
    lampGround: 1,
    dyeBudget: 0.5568,
    edgeRelief: 0.6066,
    crispEdges: 0.6,
    lacing: 0.35,
    plateRock: 0.2036,
    layerScaleVariety: 0.006839,
    hueJourney: 3.5,
    beatSqueeze: 0.2769,
    backgroundLoop: 0.8519,
    dishVignette: 0.2895,
    lightPlay: 0.481,
    lampMotion: 0.2153,
    lampHotspot: 0.3509,
    secondLamp: 0.6879,
    iridescence: 0.4912,
    paperA: '#B58CFF',
    paperB: '#0047AB',
    focus: 0.5157,
    aperture: 0.3114,
    bloom: 0.2782,
    chromaticAberration: 0.5014,
    refraction: 0.7621,
    glitter: 0.8699,
    tankFeed: 4.264,
    tankWeight: 0.3882,
    tankDrain: 0.3535,
    chemistry: 0.25,
    chemistryPattern: 0.45,
    chemistryWidth: 0.5291,
    turingPrint: 0.1,
    turingInk: 0.16,
    turingDrift: 0.35,
    gelSpeed: 0.3792,
    moireAngle: 8.673,
    moireSpin: 0.4,
    moireRatio: 0.9692,
    moireDensity: 40,
    moireCurl: 0.3317,
    lampWarmth: 0.652,
    beads: 0,
    exposure: 0.4585,
    postBlurRadius: 0.05388,
    macroChase: 0.9261,
    macroHold: 6.149,
    macroSync: 0.949,
    macroCellScale: 0.7274,
    macroDepth: 0.8246,
    macroRelief: 0.7056,
    sceneMappings: [
      { source: 'bands', feature: 'bass', setting: 'cometSpeed', depth: 0.4 },
      { source: 'bands', feature: 'tonalMid', setting: 'cometAngle', depth: 0.125 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
      { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.33 },
      { source: 'sound', feature: 'treble', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'pulse', volume: 0.6, size: 0.12 },
      { source: 'sound', feature: 'treble', setting: 'areaHeat', depth: 0.05, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'heat', size: 0.1 },
      { source: 'sound', feature: 'volume', setting: 'areaPress', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'press', gain: 1.176, size: 0.42 },
      { source: 'hits', feature: 'kickHit', setting: 'areaPour', depth: 0.5, mode: 'gate', threshold: 0.3, attack: 0, release: 0.1, volume: 3.2, drops: 8, size: 0.3, bottle: 2, masters: [
        'audioImpact',
        'kickBloom',
      ], role: 'bloom' },
      { source: 'sound', feature: 'mid', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'stream', volume: 1.44, gain: 1.429, size: 0.2, wander: 0.6, bottle: 1 },
      { source: 'sound', feature: 'energy', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'swell', volume: 1.44, size: 0.2, wander: 0.56, bottle: 3 },
      { source: 'sound', feature: 'mid', setting: 'areaHue', depth: 0.6, mode: 'follow', role: 'bottle', wander: 1 },
    ],
  },
};
/*
  Soapy Mess: made from Mushy Mushy and turned to soap (Surfactant Flow at 1,
  the real soap's strength, a thick thin-film, a lumia's light behind it), almost still (Speed 0.005) and thin. Two dead
  cords and the trapped air taken out (below).
*/
export const SOAPY_MESS: Preset = {
  id: 'soapy-mess',
  name: 'Soapy Mess',
  description: 'Soap on thin water: the film\u2019s interference colours swimming in slow, tense pools, with a lumia\u2019s folds of light behind it, drifting almost still until the music presses the glass.',
  settings: {
    stockGrain: 0.4822,
    stockGrainSize: 2.083,
    stockGate: 0.3152,
    globalSpeed: 0.005484,
    particles: 0.2747,
    audioMappings: { velocity: 'mid', density: 'none', color: 'bass', rotation: 'treble' },
    platePressure: 0.5956,
    gapThickness: 0.3953,
    phaseAmount: 0.6751,
    phaseScale: 0.357,
    phaseSharp: 0.3486,
    magnetHeight: 0.2622,
    magnetStrength: 0.7733,
    magnetWalk: 0.5085,
    vorticityConfinement: 1.902,
    oilTension: 0.2505,
    surfactantFlow: 1,
    slosh: 0.5,
    doubleDiffusion: 0.4546,
    phIndicator: 0.2234,
    bzReaction: 0.1,
    liesegang: 0.35,
    glassSmear: 0.6311,
    rainDrip: 0.4561,
    viscosity: 'thin',
    polarity: 0.8345,
    evaporationRate: 0.01736,
    airVelocity: 0.1319,
    vibrationFrequency: 0.6967,
    blendMode: 'multiply',
    gooeyEffect: 0.007893,
    rotationSpeed: 0.08269,
    centerGravity: 0.7377,
    ledMode: 'ocean',
    ledColor: '#39FF14',
    ledSpeed: 0.482,
    sharpness: 1,
    granulation: 1,
    grainScale: 145.4,
    diffusionRate: 0,
    buoyancy: 0.118,
    advection: 0.5672,
    damping: 0.9332,
    heatDecay: 0.9906,
    cometSpeed: 1.5,
    cometAngle: 90,
    surge: 0.6,
    automateRate: 0.1215,
    turbulenceScale: 0.07263,
    turbulenceDetail: 2,
    blobSurfaceTension: 0.5766,
    boundaryContrast: 0.2502,
    saturationBoost: 1.639,
    lampGround: 1,
    dyeBudget: 0.8568,
    edgeRelief: 0.6124,
    crispEdges: 0.6,
    lacing: 0.3747,
    // Trapped air off: the owner's rule since 33q-4 (2026-11-27), on only in
    // the clock-glass looks made for it. Saved at 0.18 before that rule.
    bubbles: 0,
    plateRock: 0.7398,
    layerScaleVariety: 0.4246,
    hueJourney: 2,
    beatSqueeze: 0.2345,
    backgroundLoop: 0.6136,
    lightPlay: 0.9857,
    lampMotion: 0.2794,
    lampHotspot: 0.6401,
    iridescence: 0.4724,
    paperA: '#FFB300',
    paperB: '#0000FF',
    focus: 0.3053,
    aperture: 0.6931,
    bloom: 0.232,
    chromaticAberration: 0.4004,
    refraction: 0.735,
    thinFilm: 0.8895,
    glitter: 0.8699,
    tankFeed: 4.264,
    tankWeight: 0.3882,
    tankDrain: 0.3535,
    lumia: 0.9437,
    chemistryPattern: 0.45,
    chemistryWidth: 0.5291,
    gelSpeed: 0.3071,
    moireAngle: 8.673,
    moireSpin: 0.4,
    moireRatio: 0.9692,
    moireDensity: 40,
    moireCurl: 0.3317,
    beads: 0,
    exposure: 0.7146,
    glossiness: 0.3665,
    postBlurRadius: 0.1741,
    macroChase: 0.4382,
    macroHold: 5.713,
    macroSync: 0.5122,
    macroCellScale: 0.2569,
    macroDepth: 0.5045,
    macroRelief: 0.7558,
    sceneMappings: [
      { source: 'bands', feature: 'bass', setting: 'cometSpeed', depth: 0.4 },
      { source: 'bands', feature: 'tonalMid', setting: 'cometAngle', depth: 0.125 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
      { source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.33 },
      // The pulse and heat hands were wired to "none" (the look's Density
      // mapping, none, which they follow), so they read nothing: taken out
      // rather than shipped dead (`npm run soundpatch`).
      { source: 'sound', feature: 'mid', setting: 'areaPress', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'press', gain: 1.176, size: 0.42 },
      { source: 'hits', feature: 'kickHit', setting: 'areaPour', depth: 0.5, mode: 'gate', threshold: 0.3, attack: 0, release: 0.1, volume: 3.2, drops: 8, size: 0.3, bottle: 2, masters: [
        'audioImpact',
        'kickBloom',
      ], role: 'bloom' },
      { source: 'sound', feature: 'mid', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'stream', volume: 1.44, gain: 1.429, size: 0.2, wander: 0.6, bottle: 1 },
      { source: 'sound', feature: 'energy', setting: 'areaPour', depth: 0.5, mode: 'follow', masters: [
        'audioImpact',
      ], role: 'swell', volume: 1.44, size: 0.2, wander: 0.56, bottle: 3 },
      { source: 'sound', feature: 'bass', setting: 'areaHue', depth: 0.6, mode: 'follow', role: 'bottle', wander: 1 },
    ],
  },
};

/** The owner's looks, in the order they were saved. */
export const OWNER_LOOKS: readonly Preset[] = [CLASSICAL_VIBE, MUSHY_MUSHY, SOAPY_MESS];

/** Set the owner's looks among the house looks, before the moiré pack (or at the end, without one). */
export function layOwnerLooks(looks: Preset[]): void {
  const fresh = OWNER_LOOKS.filter(o => !looks.some(p => p.id === o.id));
  if (!fresh.length) return;
  const at = looks.findIndex(p => p.pack === 'moire');
  looks.splice(at < 0 ? looks.length : at, 0, ...fresh.map(o => ({ ...o, settings: { ...o.settings } })));
}
