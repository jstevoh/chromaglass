import { MIX_CONTROLS, MIX_GRADES, MIX_SOURCE_INFO, fadeKey, gradeKey, type MixGrade, type MixSource } from './mixer.ts';
import { FADE_ROWS } from './mixFade.ts';

/*
  What each knob and fader does, in one line, for the hover card on the desk
  and the press-and-hold card on the phone (PLAN.md 8j).

  Why it exists: a knob is 58 px wide, so its name is cut to "Magnet …" and
  "Chromat…", and the card that replaced it while you dragged hid the rest.
  The owner could not tell which of the Fluid Physics knobs was under the
  hand. The name now stays on the knob, and the whole of it, with this line, is
  one hover away.

  The rule for a line: say what moves on the plate when it goes up, in the
  words a person who has stood at a liquid light show would use, and name the
  real thing where there is one (surface tension, Marangoni flow, Beer-Lambert).
  Nothing here describes the range, which the value on the knob already
  shows. One sentence, under about 110 characters so the card stays a card.

  Keyed by the setting, the same key `midiKey` carries, so a knob or a fader
  finds its own line without its caller passing one. `npm run panel` fails on
  a pinnable control with no line here, so a setting added later cannot reach
  the desk unexplained.
*/
export const CONTROL_HELP: Record<string, string> = {
  // Master and sound
  dimmer: 'The house dimmer for the whole picture. Down is blackout.',
  audioImpact: 'How hard the music moves the plate. At zero the plate ignores the sound.',
  automateRate: 'How fast Evolve wanders the look on its own. At zero it stays where you left it.',
  globalSpeed: 'How fast everything on the plate moves. It is a gentle curve, so most of the useful range is at the low end.',
  tempoSync: 'Lets the song set the plate\'s pace instead of the look. At the top, the music alone decides.',
  sensitivity: 'How loud the sound has to be before the plate notices it.',
  bassBoost: 'Gives the low end extra weight, so kicks and bass notes land harder.',
  beatPrediction: 'Fires kicks from the tempo clock a hair early rather than waiting to hear each one. Zero listens only.',
  beatLead: 'How far ahead of a heard beat a predicted kick fires, to make up for the sound\'s trip through the room and the mic.',

  // Look
  dyeBudget: 'How full the plate runs, from mostly clear glass to wall to wall colour. The picked bottle shows what is left.',
  turbulenceScale: 'Adds stirring to the flow: swirls at many sizes, from lazy to churning.',
  turbulenceDetail: 'How many sizes of swirl are stirred in, from broad eddies only to fine curls on top.',
  plateRock: 'A hand tips the dish with the beat, and the heavier colour runs downhill each way.',
  frameSway: 'Lets the music move the whole frame, not just the liquid. Kept at zero unless you want the picture itself to move.',
  slosh: 'How much the dish\'s own momentum carries when it is tilted: the colour piles on the low edge and a wave rings back.',
  bubbles: 'Trapped air bubbles on the plate. A few go a long way.',
  saturationBoost: 'Colour strength of the finished picture, from washed out to vivid.',
  edgeRelief: 'The curved rim where a blob of liquid meets the glass: a dark edge and a bright refracted highlight.',
  projectorFocus: 'Moves the projector lens\'s focus through the liquid, turning edges into bright and dark Becke lines.',
  lacing: 'Pale threads along the line where two colours meet, finer where the flow pulls them apart.',
  benDay: 'Prints the picture as a comic: flat inks with the tones laid down as even dots.',
  sharpness: 'How crisp the edge of a colour stays. Low lets the solver smear it soft, high holds it hard.',
  particles: 'Carries the dye on tiny particles, so fine structure survives instead of blurring away within a second.',
  particleMix: 'How far a particle\'s own colour is trusted over the grid\'s. Needs Dye Particles.',
  granulation: 'Pigment separating into a fine speckle that travels with the dye.',
  grainScale: 'How fine that speckle is. Higher is a finer grain.',
  blobSurfaceTension: 'How hard two colours hold apart at their edge, so they bead up instead of blending.',
  layerScaleVariety: 'Shows the second layer magnified and drifting, so one frame carries two scales of pattern.',
  boundaryContrast: 'A bright line where two colours meet.',
  glossiness: 'Specular shine on the liquid. Zero is flat back-lit dye.',
  colourBody: 'How solid the colour reads. Zero is the dye\'s own thin tint, one is an opaque body of colour.',
  postBlurRadius: 'A final soft blur over the picture that makes the shapes run together.',
  kickBloom: 'Each kick throws a ring of dye outward from the bass spot. Zero is no ring.',
  beatSqueeze: 'Each kick presses a dent into the liquid, as if the top glass were pushed down on the beat.',
  beatAccent: 'Lets the press and the tip follow the bar: the one hits hardest, three lighter, the rest let go.',
  fingering: 'A press pushes the liquid out in radial fingers, the way a thin liquid does when it is squeezed (Saffman-Taylor).',
  beads: 'Hundreds of small dark-rimmed oil droplets riding the flow.',
  beadDrops: 'Turns the bead rings into round drops, each its own colour and acting as a lens.',
  dishSpread: 'Gives each layer its own dish, spread apart like projectors aimed at one screen.',
  cells: 'A fine network of cells on the lead plate, strongest in the middle of the dish.',
  hueJourney: 'Minutes per step of a slow walk through the look\'s dyes. At zero the hues are not walked.',
  backgroundLoop: 'Runs the layers behind the lead slower and calmer, a backdrop the live plate plays over.',
  dishVignette: 'The round edge of a projected dish: dark beyond the rim and a thin bright ring at it.',

  // Lamp
  lightPlay: 'How much the lamp\'s direction shows: bubbles shaded as lenses, dye rims lit on the lamp side.',
  lampMotion: 'How far the lamp wanders under the plate, so the light keeps moving across everything.',
  lampHotspot: 'The projector\'s hot spot: brightest over the lamp and falling away toward the rim.',
  secondLamp: 'A second, cooler lamp from the other side, so two lights play across every bubble and edge.',
  lampGround: 'What the dye is seen on. Zero paints it as light on black, one has the lamp shining up through it.',
  iridescence: 'Thin-film rainbow colour running round the rims of bubbles.',
  lampWarmth: 'The lamp\'s colour: neutral 6500 K down to a 3200 K halogen, with a soft vignette. Warmer is dimmer; lift Exposure.',
  transmission: 'How light passes through the dye: thin pale, thick deep. Zero is a flat glow.',
  exposure: 'Plate-wide exposure. Dye thinner than the plate\'s own floor reads as bare glass.',
  lumia: 'Slow folded sheets of light, in the manner of Wilfred\'s lumia, with no beat and no dye.',
  gelWheel: 'A rotating four-colour gel over the lamp.',
  gelSpeed: 'How many turns a minute the gel wheel makes.',
  chemistry: 'A reaction-diffusion field grows patterns that deposit dye, like a chemistry bench rather than a clock.',
  chemistryPattern: 'Which pattern the reaction grows, from spots through stripes to a labyrinth.',
  chemistryWidth: 'How wide the reaction\'s stripes and spots run.',
  turingPrint: 'Draws the reaction as starch-iodine does, blue-black on the lamp.',
  turingInk: 'The print\'s colour. Zero is the starch\'s own indigo, above that a hue round the wheel.',
  turingDrift: 'How far the print\'s feed and kill rates wander over a minute or so, so the pattern keeps changing.',

  // Camera
  camera: 'The lens as a whole: refraction, depth of field, bloom and the sensor\'s roll-off. Zero is off.',
  focus: 'Where the focal plane sits, from the glass at zero to the top of the thickest domes at one.',
  aperture: 'How quickly things go soft away from the focal plane. Wide is a shallow focus.',
  bloom: 'Glow spilling out around the brightest highlights.',
  chromaticAberration: 'Colour fringing at refracting edges and the corners of the frame.',
  refraction: 'How much the dye and the bubbles bend what is under them.',
  microDroplets: 'Satellite droplets on the glass, hundreds of tiny lenses.',
  thinFilm: 'Interference colour where the dye runs thinnest.',
  filmPhysics: 'The thin-film colours, from a plain rainbow at zero to a real soap film\'s at one.',

  // Macro
  macroZoom: 'How close the camera looks into the plate. One is the whole plate, sixteen is a single bead.',
  macroSync: 'How much the close-up camera follows the music: cuts on kicks, with bass, energy and treble moving the frame.',
  macroChase: 'How fast the camera follows what it is looking at, from a lazy drift to a whip.',
  macroHold: 'Seconds spent on one bead before the camera cuts to the next. Auto camera only.',
  macroAimX: 'Where the close-up camera points across the plate.',
  macroAimY: 'Where the close-up camera points up the plate.',
  macroCells: 'How much paint-cell and bubble structure shows up close.',
  macroCellScale: 'How big those cells are. Small is many tiny cells.',
  macroLacing: 'Dark filaments along the edges of the dye, seen up close.',
  macroDepth: 'Dome shading, contact shadow and a shallow depth of field in the close-up.',
  macroEdgeDetail: 'Breaks up smooth, blown-up edges with a fractal warp so a silhouette stays ragged and real.',
  macroRelief: 'Surface relief up close: per-pixel bumps, wet highlights and shadowing.',

  // Mirror rig
  kaleidoscope: 'Mirrors the plate into 2 to 8 folds. Zero is off.',
  kaleidoSpin: 'How fast the mirror rig turns, and which way. Zero holds it still.',
  kaleidoZoom: 'How much plate feeds each wedge. Low is a few huge shapes, high is fine and busy.',

  // Film, room, patches, scenes
  filmDrive: 'How hard the film\'s own motion stirs the liquid. At zero the film is only a slide.',
  filmMix: 'How strongly a loaded film loop or the camera shows through the dye.',
  filmKey: 'Brightness below which the film turns transparent, a black key.',
  filmImpact: 'The master depth over every patch that reads the film.',
  soundImpact: 'The master depth over every patch that reads the sound.',
  shapeImpact: 'The master depth over every patch driven by a slow wave or an envelope.',
  sceneImpact: 'The master depth over every patch that reads the room.',
  sceneDrive: 'How hard the room\'s motion stirs the liquid. Zero is off.',
  sceneHands: 'How strongly the people the camera sees press and blow on the plate.',
  sceneDeadzone: 'Movement below this counts as the room breathing, not a person.',
  sceneSmooth: 'How much the room\'s motion is smoothed over time.',

  // Film stock
  stock: 'What the whole show is photographed on, from clean digital to a film stock.',
  stockGrain: 'How much film grain is laid over the whole picture.',
  stockGrainSize: 'How coarse each grain is.',
  stockWeave: 'The picture wandering a little in the projector\'s gate, as old film does.',
  stockGate: 'The dark soft edge of the film gate around the frame.',

  // Automation, pacing
  pacing: 'How much a running sequence plays each stage as a scene: a swell, a rest, and the light going down between.',
  songFollow: 'How far a paced scene follows the song\'s shape: a drop opens its big swell, a build holds it back.',
  surge: 'How much the plate breathes: surges of activity with rests between them. Zero is one steady rate.',

  // Physics
  mazeDetail: 'How fine the ferrofluid maze\'s stripes are, from the width they always were to a third of it.',
  magnetSize: 'How big the hedgehog of spikes grows under a held magnet.',
  magnetStrength: 'How strong the magnet under the plate is.',
  magnetHeight: 'How far below the glass the magnet sits. Close is a tight, hard point, far is a broad soft pull.',
  magnetX: 'Where the magnet sits across the plate.',
  magnetY: 'Where the magnet sits up the plate.',
  magnetWalk: 'How far the magnet wanders on its own around where you put it. Zero holds it still.',
  phaseAmount: 'How much ferrofluid a pour lays down. Zero keeps it off the plate.',
  phaseScale: 'How big the ferrofluid\'s domains are, from small beads at zero to big hands at one.',
  phaseSharp: 'How hard the ferrofluid refuses to blur into a grey wash.',
  phaseDisplace: 'How much the ferrofluid shoves the dye aside, so colour packs along its edge instead of hiding under it.',
  ferroLabyrinth: 'Under a strong field the ferrofluid\'s particles repel and it breaks into a maze of stripes (Ohta-Kawasaki).',
  oilBodies: 'Oil and water each keep their own colour, and an oil body\'s colour travels with it. Needs Oil Tension.',
  oilTension: 'Surface tension between oil and water: oil rounds into drops, threads break into beads, drops merge.',
  clearFilm: 'Pours a clear oil film over the dish. Thin spots and dust tear it open into a lace of holes (dewetting).',
  thinGap: 'Treats the plate as a thin gap between two glasses, so a push coasts and viscosity matters.',
  gapThickness: 'How thick the liquid is in the thin gap, from water to glycerine. Sets how long a push lasts.',
  plateCurve: 'The shape of the gap between the glasses. Below zero they touch in the middle, above it the liquid pools there.',
  depthDrag: 'How much the gap\'s depth slows the liquid, so it creeps where the glasses are close.',
  platePressure: 'How hard the top glass presses the liquid when it is squeezed.',
  plateSpring: 'How quickly the glasses spring apart again after a press.',
  glassSmear: 'Drags dye along the glass where the top plate slides.',
  rainDrip: 'Heavy drops run down the glass in streaks, as rain does on a window.',
  polarity: 'How polar the liquid is against water. Water is zero, oil is negative, and like dissolves like, so unlike liquids repel.',
  vorticityConfinement: 'Spins small eddies back up that a grid solver smooths away. Flair rather than physics.',
  surfactantFlow: 'Soap lowers surface tension and the surface streams away from it, carrying the dye (Marangoni flow).',
  solutalBuoyancy: 'Dye makes the liquid heavier. Upright, it sinks in fingers; flat, it slumps out along the glass.',
  plateUpright: 'How far the plate stands up, from flat on the projector to upright on the wall, which sets what gravity can do.',
  tiltDirection: 'Which way the tilted plate runs downhill, as a compass on the screen. Zero is toward the top.',
  doubleDiffusion: 'Heat spreads faster than dye, as in real water. With Dye Weight it makes salt fingers.',
  phIndicator: 'The dye changes colour with acidity, like red cabbage: pink in acid, green in base.',
  bzReaction: 'The Belousov-Zhabotinsky reaction in a gel: waves that curl into spirals, in red and blue.',
  liesegang: 'A reagent diffusing into a gel precipitates in rings spaced ever wider apart.',
  thicknessOptics: 'Colour depth follows the gap between the glasses: a press pales the dye, a deep pool saturates (Beer-Lambert).',
  spectralOptics: 'Mixes dyes across six bands of the spectrum rather than three, for cleaner mixtures.',
  evaporationRate: 'How fast the liquid dries off the plate.',
  heatDecay: 'How quickly heat on the plate dies away. Near one it lingers.',
  airVelocity: 'A steady draught across the whole plate. Separate from the Blow tool.',
  vibrationFrequency: 'A steady shaking of the dish that keeps the surface restless.',
  dropHeight: 'How far a dropped liquid falls. Zero lays it on the plate, one splashes.',
  diffusionRate: 'How fast dye spreads into its surroundings. It costs speed, so it stays small.',
  buoyancy: 'How strongly heat lifts the liquid.',
  advection: 'How strongly the flow carries the dye along. Low and the dye lags behind the liquid.',
  damping: 'How much of the motion survives each step. Up is more momentum and less friction.',

  // Logo
  markMix: 'How opaque the logo or title is over the finished frame. Zero takes it off.',
  markScale: 'How wide the logo is, as a share of the frame.',
  markX: 'Where the logo\'s centre sits across the frame.',
  markY: 'Where the logo\'s centre sits up the frame.',

  // Layers and the dish's motor
  twoProjectors: 'Lays the layers over each other as two projectors on one screen, so their light adds.',
  layerCount: 'How many plates are stacked, one or two.',
  rotationSpeed: 'How fast the dish turns.',
  spinImpulse: 'How hard one flick of the dish hits.',
  spinDrag: 'What the dish rests on. Low coasts for seconds after a flick, high stops it almost at once.',
  spinDirection: 'Which way the dish turns.',
  spinWander: 'How much the motor drifts off its set speed, now and then turning back on itself.',
  spinAudioDepth: 'How hard a band of the music pushes the dish round.',
  spinRpm: 'The dish\'s own motor in turns a minute. Negative turns it the other way.',
  spinAuto: 'Whether the motor runs on its own, from the beat clock or steady.',
  spinBeats: 'How many beats the dish takes to make one turn.',
  ledSpeed: 'How fast the LED ring turns.',
  centerGravity: 'Pulls the liquid toward the middle of a concave dish.',
  cometSpeed: 'A steady pull on the heavy dye, as a tilt or a wind would give, so it trails into comets.',
  cometAngle: 'The direction of that pull, in degrees.',
  gooeyEffect: 'Blends blobs together like metaballs, so two that touch fuse.',
};

const GRADE_HELP: Record<MixGrade, (n: string) => string> = {
  Bright: n => `Brightness of the ${n} on its own strip, before it is mixed in.`,
  Contrast: n => `Contrast of the ${n} on its own strip, before it is mixed in.`,
  Sat: n => `Colour strength of the ${n} on its own strip, before it is mixed in.`,
  Hue: n => `Turns the ${n}'s colours round the wheel.`,
};

/** Every channel strip's controls, built from the mixer's own source names. */
function mixerHelp(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, info] of Object.entries(MIX_SOURCE_INFO) as [MixSource, (typeof MIX_SOURCE_INFO)[MixSource]][]) {
    const n = info.name.toLowerCase();
    for (const g of MIX_GRADES) out[gradeKey(id, g)] = GRADE_HELP[g](n);
  }
  for (const c of MIX_CONTROLS) if (c.key.endsWith('Level')) out[c.key] = `How much of the ${MIX_SOURCE_INFO[c.source].name.toLowerCase()} reaches the picture.`;
  for (const id of FADE_ROWS) {
    out[fadeKey(id)] = `How many bars the ${MIX_SOURCE_INFO[id].name.toLowerCase()} takes to fade in or out when its row is taken.`;
  }
  return out;
}

const ALL: Record<string, string> = { ...mixerHelp(), ...CONTROL_HELP };

/** The line for a setting, by its key or the `setting:` key a control carries; undefined for a control with none. */
export function helpFor(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return ALL[key.startsWith('setting:') ? key.slice('setting:'.length) : key];
}
