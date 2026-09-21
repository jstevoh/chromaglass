export type BlendMode = 'screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay';

/**
 * What a liquid writes into the plate's liquid field when it lands — see
 * `src/lib/liquidPhase.ts`, which is what turns these into forces that go on
 * acting rather than a shove at the moment of the drop.
 */
export interface LiquidBehaviour {
  /** Breaks the surface tension: liquid runs away from it while it is there. */
  soap?: number;
  /** Thicker than water: it crawls where it lies while the plate flows past. */
  body?: number;
  /** Refuses to let go of itself: a pool of it keeps its edge. */
  repel?: number;
}

export interface LiquidType {
  id: string;
  name: string;
  color: string;
  description: string;
  injectRadius: number;   // cells — how wide each drop spreads
  injectAmount: number;   // density injected per frame while held
  heatAmount: number;     // heat injected (drives buoyancy-based rise)
  /** What it does to the plate beyond colouring it. Absent = it is only a dye. */
  behaviour?: LiquidBehaviour;
}

export const DEFAULT_LIQUID_TYPES: LiquidType[] = [
  { id: 'water',   name: 'Water',   color: '#4488ff', description: 'Flows freely, spreads evenly',         injectRadius: 3, injectAmount: 0.6, heatAmount: 0.05 },
  { id: 'oil',     name: 'Oil',     color: '#ffaa22', description: 'Thick, repels water, stays in blobs',  injectRadius: 2, injectAmount: 1.4, heatAmount: 0.0  },
  { id: 'alcohol', name: 'Alcohol', color: '#aaffcc', description: 'Thin, rises and disperses with heat',  injectRadius: 4, injectAmount: 0.3, heatAmount: 0.5  },
  { id: 'ink',     name: 'Ink',     color: '#cc44ff', description: 'Spreads wide and diffuses slowly',     injectRadius: 5, injectAmount: 0.25,heatAmount: 0.0  },
  { id: 'syrup',   name: 'Syrup',   color: '#ff6644', description: 'Very heavy, barely moves once placed', injectRadius: 2, injectAmount: 2.0, heatAmount: 0.0  },

  // The four that change what the plate does rather than only what colour it
  // is. Each writes into the liquid field, and the field goes on acting for as
  // long as the liquid is there — which is the whole difference between soap
  // and a blue dye called Soap.
  { id: 'soap',      name: 'Soap',      color: '#bfe9d8',
    description: 'Breaks the film: colour runs away from it and curls into filaments',
    // 0.12 before, which was physically right and a usability trap: the
    // bottle still carries a colour swatch and a colour picker, so picking
    // Cherry Red with Soap selected laid so little dye that what you saw was
    // the plate underneath — it read as "red is broken". Picking a colour is
    // a statement of intent, so it has to land. Still the lightest bottle
    // there is: a fifth of syrup, and soap goes on thinning what it lands in.
    injectRadius: 3, injectAmount: 0.4, heatAmount: 0.0, behaviour: { soap: 1 } },
  { id: 'milk',      name: 'Milk',      color: '#f4efe4',
    description: 'A pale ground that holds its own edge instead of blending away',
    injectRadius: 4, injectAmount: 2.0,  heatAmount: 0.0, behaviour: { repel: 1, body: 0.35 } },
  { id: 'silicone',  name: 'Silicone',  color: '#dfe7ee',
    description: 'Shoulders colour aside into a ring — the cell maker',
    // 0.05 before — forty times less than syrup, which made every colour
    // picked with Silicone selected invisible on a live plate.
    injectRadius: 3, injectAmount: 0.35, heatAmount: 0.0, behaviour: { soap: 0.8, repel: 0.45 } },
  { id: 'glycerine', name: 'Glycerine', color: '#e6f2ff',
    description: 'Thick and slow: it crawls where it lands while the plate moves past it',
    injectRadius: 2, injectAmount: 1.6,  heatAmount: 0.0, behaviour: { body: 1, repel: 0.25 } },
];
export type LedMode = 'single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk';
/**
 * Fluid solver grid: an edge length the solver runs at, or 'auto' to leave it
 * to the governor. There was a 'cpu' member here for the 192² JavaScript
 * solver; that solver went with the WebGL renderer in P7, and the option went
 * with it rather than quietly resolving to 256².
 */
export type SimResolution = 'auto' | number;
export type AudioFeature = 'none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity';

export interface AudioMappings {
  velocity: AudioFeature;
  density: AudioFeature;
  color: AudioFeature;
  rotation: AudioFeature;
}

/**
 * What the camera can tell the plate about the room, in the same shape the
 * music already uses: a feature, something to put it on, and how deep.
 */
export type SceneFeature =
  | 'none'
  /** How much is happening, against the room's own recent range. */
  | 'motion'
  /** How spread out that motion is: one dancer, or the whole floor. */
  | 'spread'
  /** Where the motion is, 0..1 across the frame. */
  | 'centroidX' | 'centroidY'
  /** Which way the room is moving as a whole, −1..1, offset onto the travel. */
  | 'dirX' | 'dirY'
  /** How many people the sensor is holding, against the most it will hold. */
  | 'crowd'
  /** The room's light and its colour. */
  | 'brightness' | 'sceneHue';

/**
 * Where a patch takes its reading from.
 *
 * `room` and `film` are the same analysis over different pixels; `sound` is
 * the microphone or whatever is plugged into it. Absent means `room`, because
 * every mapping written before there was a choice was a room mapping.
 */
/**
 * What may drive a patch.
 *
 * The first three are sensors — the room, the film and the sound all report
 * what is happening. `shape` is the LFOs and envelopes: what was asked for
 * rather than what was noticed. See `lib/modulators.ts`.
 */
export type PatchSource = 'room' | 'film' | 'sound' | 'shape';

/**
 * One patch cord: a thing that changes, on a thing it changes.
 *
 * `source` and `layer` are optional so that a look saved before either existed
 * loads as exactly what it was — a room mapping on every plate — with no
 * migration step to get wrong. Read them as `?? 'room'` and `?? 'all'` and the
 * old shape is a special case of the new one rather than a thing to convert.
 */
export interface SceneMapping {
  /** Absent on anything saved before there was more than one source. */
  source?: PatchSource;
  /** A room/film feature or an audio one, depending on the source. */
  feature: SceneFeature | AudioFeature;
  /** Any numeric setting — the same list a MIDI fader can learn. */
  setting: keyof VisualizerSettings;
  /** How far the feature moves it, as a share of the setting's travel. −1..1. */
  depth: number;
  /**
   * Which plate it lands on, or every one of them.
   *
   * Only meaningful for the settings the solver reads — how a layer moves and
   * evolves. A setting that describes the finished picture is global whatever
   * you aim it at, which is why the panel will not let you aim one.
   */
  layer?: number | 'all';
}

export interface VisualizerSettings {
  // Sound Settings
  sensitivity: number;
  bassBoost: number;
  /** Learn the room's noise floor and dynamics, and normalise every band against them. */
  autoCalibrate: boolean;
  /** When a new song starts (a gap between tracks, or a different track identified): keep the look, switch to another preset, or roll a random one. */
  onNewSong: 'off' | 'preset' | 'random';
  /** How much the beat clock runs ahead of the microphone: once it has locked onto the tempo, kicks fire from the clock, a little early, instead of waiting for the onset to be heard (0 = detection only). */
  beatPrediction: number;
  /** How far ahead of the heard onset a predicted kick fires, in ms — the microphone pipeline's latency plus any anticipation wanted. */
  beatLead: number;
  globalSpeed: number;
  /**
   * Dye carried by particles (H1, docs/roadmap.md), 0–1.
   *
   * The dye lives in a grid that is resampled every solver step, so structure
   * finer than about eight cells is gone within a second — the oldest
   * measured shortfall in PLAN.md, and the reason a settled plate carries a
   * fifth of the fine detail filmed liquid does. A particle is not resampled:
   * it takes a colour once and carries it wherever the flow goes.
   *
   * This is how much of the picture they are, *on top of* the grid rather
   * than instead of it. At 0 none are allocated and the plate is exactly the
   * plate it was, which is why every look written before this still means
   * what it meant.
   */
  particles: number;
  /** How far a particle's colour is trusted against the grid's: 0–1, of `particles`. */
  particleMix: number;
  audioMappings: AudioMappings;
  
  // Squish Plate
  platePressure: number;
  glassSmear: number;
  rainDrip: number;
  viscosity: 'thick' | 'thin';
  polarity: number; // Repulsion between blobs
  
  // Heat Slide
  heatIntensity: number;
  boilingPoint: number;
  evaporationRate: number;
  
  // Manual/Interaction
  airVelocity: number;
  vibrationFrequency: number;
  dropHeight?: number;        // how far a dropped liquid falls: 0 lays it on the plate, 1 splashes
  
  // Mixer
  layerCount: number;
  blendMode: BlendMode;
  gooeyEffect: number; // For metaball-like blending
  rotationSpeed: number;
  centerGravity: number;
  ledPlatform: boolean;
  ledMode: LedMode;
  ledColor: string;
  ledSpeed: number;
  
  // Fluid Physics (High Fidelity)
  surfaceTension: number;
  /** Interface sharpening: how hard a dye boundary resists the solver's own smearing. 0 = the old soft plate. */
  sharpness: number;
  /** Pigment separating into a fine speckle that travels with the dye. */
  granulation: number;
  /** How fine that speckle is: grain lattice cells across the plate. */
  grainScale: number;
  diffusionRate: number;
  buoyancy: number;
  advection: number;
  damping: number;
  heatDecay: number;
  
  // Automation
  /**
   * How much the plate breathes: surges of activity and rests between them.
   *
   * 0 is the flat plate — one rate, forever — which is what everything did
   * before this existed and what a look that does not ask for phrasing still
   * gets. Up, and the automation comes in gusts, the impulses land harder
   * during them, and the clock itself leans forward and back.
   */
  surge: number;
  automateRate: number;

  // Audio visual impact (0 = silent visuals, 1 = maximum reaction)
  audioImpact: number;

  // Light Show Look (rendering)
  turbulenceScale: number;    // amplitude of curl-noise octaves added to velocity field
  turbulenceDetail: number;   // number of curl-noise octaves (1-4)
  blobSurfaceTension: number; // lower = more elongation/shear, higher = more circular
  boundaryContrast: number;   // bright edge-line strength where two dye colors meet
  saturationBoost: number;    // final color grade saturation multiplier
  dyeBudget: number;          // how full the plate runs (mean density the regulator holds); low = mostly clear glass with dye structures on it
  edgeRelief: number;         // meniscus at every blob edge: dark rim, refracted highlight (plate-wide, not just macro)
  lacing: number;             // pale filaments along a colour boundary, width set by the strain across it
  bubbles: number;            // trapped-air bubbles: spawn rate and lifetime (0 = none; a few go a long way)
  plateRock: number;          // the whole plate tilts on the beat and rocks back, like a hand on the clock face
  lumia: number;              // a Wilfred lumia layer: slow folded sheets of light under the dye, no beat, no dye
  chemistry: number;          // a reaction-diffusion field grows patterns that deposit dye — Boyle's bench, not a clock face
  gelWheel: number;           // a rotating four-segment colour gel over the lamp
  gelSpeed: number;           // gel wheel turns per minute
  filmMix: number;            // how strongly a loaded film loop or the camera shows through the dye
  filmKey: number;            // luminance below which the film is transparent (a black key)
  filmDrive: number;          // how hard the film's own motion stirs the liquid (0 = it is only a slide)
  filmImpact: number;         // master depth over every mapping, read from the film instead of the room
  dimmer: number;             // master brightness, the house dimmer: 1 full, 0 blackout
  fingering: number;          // a press breaks into radial fingers (Saffman–Taylor) instead of a smooth ring
  beads: number;              // oil beads: hundreds of small dark-rimmed droplets riding the flow
  dishSpread: number;         // each layer its own dish, spread apart like three projectors on one screen
  cells: number;              // fine cell network on the lead plate, strongest in the dish core
  /** A logo or title over the finished frame: opacity, where it sits and how big. */
  markMix: number;            // 0 = no mark on the wall, 1 = fully opaque
  markX: number;              // centre, 0..1 across the frame
  markY: number;              // centre, 0..1 up the frame
  markScale: number;          // width as a fraction of the frame; height follows the image's own aspect
  exposure: number;           // plate-wide film exposure: dye below the plate's own histogram floor renders as bare glass (ink on white)
  lampWarmth: number;         // halogen grade: warm tint and a soft vignette, the sealed-wheel look
  transmission?: number;      // light through the dye: thin pale, thick deep (0 = the flat glow)
  layerScaleVariety: number;  // the second layer is viewed magnified with its own slow drift, so one frame carries two scales
  hueJourney: number;         // minutes per step of a slow walk through the preset's dyes (0 = the old random rotation); a set drifts hue over minutes
  beatSqueeze: number;        // the rhythm plate: a squeeze pulse pressed into the lead plate on every kick
  backgroundLoop: number;     // the layers behind the lead run slower and calmer, a background loop the live plate plays over
  kaleidoscope: number;       // mirror the plate into 2..12 folds (0 = off), the four-fold dish of the reference stills
  /**
   * How fast the mirror rig turns, and which way.
   *
   * Was `u_time * 0.02` inside the shader: a constant, so the one thing a
   * hand wants to do with a kaleidoscope — speed it up into the chorus, stop
   * it dead, run it backwards — could not be done at all. Signed, and zero is
   * a still rig.
   */
  kaleidoSpin: number;
  /**
   * How much plate feeds each wedge.
   *
   * Was `rad * 0.72`, also a constant. Low pulls the plate's middle right in
   * and the pattern turns into a few enormous shapes; high takes in the rim
   * and it becomes fine and busy. The other half of playing one.
   */
  kaleidoZoom: number;
  dishVignette: number;       // the round edge of a projected dish: dark beyond the rim, a thin bright ring at it
  lightPlay: number;          // how much the lamp's direction shows: bubbles shaded as lenses with a caustic arc, dye rims lit on the lamp side and shadowed away from it
  lampMotion: number;         // how far the lamp wanders under the plate (and follows the plate's rock), so the light keeps moving across everything
  lampHotspot: number;        // the projector's hot-spot: brightest over the lamp, falling away toward the rim
  secondLamp: number;         // a second, cooler lamp from the other side of the plate, so two lights play across every bubble and edge
  iridescence: number;        // thin-film colour running round bubble rims

  // Photograph — the macro shot of oil on water rather than the projected show
  renderStyle: 'show' | 'photo'; // 'photo': a lit paper backdrop, dye as transmission, drops as domes with a softbox in them
  paperA: string;             // the backdrop's two colours
  paperB: string;
  camera: number;             // the camera pass as a whole (0 = off): refraction, depth of field, bloom, chromatic aberration, the sensor's roll-off
  focus: number;              // the focal plane as a height: 0 the glass, 1 the tops of the thickest domes
  aperture: number;           // how fast things go soft away from the focal plane
  bloom: number;              // glow around the highlights
  chromaticAberration: number;// colour fringing at refracting edges and the frame's corners
  refraction: number;         // how much the dye and the bubbles bend what is under them
  microDroplets: number;      // satellite droplets on the glass, hundreds of tiny lenses
  thinFilm: number;           // interference colour where the dye runs thinnest
  glossiness: number;         // specular highlight intensity (0 = flat backlit dye)
  postBlurRadius: number;     // final gooey blur radius multiplier

  // Macro Closeup — magnified camera that chases a single bead of liquid
  macroMode: boolean;         // enable the tracking macro camera + micro-detail pass
  macroZoom: number;          // 1 = full plate, 16 = extreme magnification
  macroChase: number;         // camera follow speed (0 = drifting, 1 = whip-fast)
  macroHold: number;          // seconds spent on one bead before cutting to the next
  macroSync: number;          // how much the closeup camera takes its cues from the music: cuts on kicks, punches with the bass, tremor from the treble
  macroCells: number;         // paint-cell / bubble structure amount
  macroCellScale: number;     // cell size (small = many tiny cells)
  macroLacing: number;        // dark lacing filaments along dye boundaries
  macroDepth: number;         // dome shading, contact shadow and shallow depth of field
  macroEdgeDetail: number;    // fractal warp that breaks up smooth upscaled silhouettes
  macroRelief: number;        // surface relief — per-pixel normals, wet highlights, occlusion

  // The room — the camera read back as a sensor rather than shown as a slide.
  // Every one of these defaults to nothing happening: a look saved before the
  // sensor existed is the same look after it.
  sceneDrive: number;         // how hard the room's motion stirs the liquid (0 = off)
  sceneHands: number;         // how strongly the people the sensor holds press and blow on the plate (0 = off)
  sceneImpact: number;        // master depth over every patch whose source is the room
  soundImpact: number;        // master depth over every patch whose source is the sound
  /** Master depth over every patch driven by an LFO or an envelope. */
  shapeImpact: number;
  sceneMappings: SceneMapping[]; // a scene feature on any setting, with its own depth
  sceneDeadzone: number;      // motion below this is the room breathing, not a person
  sceneSmooth: number;        // how much the flow field is smoothed in time
  scenePeople: boolean;       // run the presence and tracking pass (off is cheaper)
  sceneMirror: boolean;       // flip left for right, for a camera facing the room

  // Solver
  simResolution: SimResolution;
}

export const DEFAULT_SETTINGS: VisualizerSettings = {
  sensitivity: 0.4,
  bassBoost: 1.0,
  autoCalibrate: true,      // on by default — a fixed level can't serve every room
  onNewSong: 'preset',      // a new song gets a new look
  beatPrediction: 0.7,
  beatLead: 80,
  /*
    Slower than it was, on purpose.

    This was 0.025 and every built-in look was tuned around it, and the plate
    read as hurried on a wall: a liquid light show is a thing people watch for
    minutes, and the reference footage the detail measurements come from moves
    far slower than this plate did. Every preset came down by the same factor
    (0.6) so the relative feel each was tuned with survives, and the Speed
    control's travel is cubed now so the slow end has somewhere to go —
    `curveOf` in `lib/midi.ts`.

    This is the *timestep*, not the step rate: the solver still takes sixty
    steps a second whatever this says, so a slower plate costs exactly what a
    fast one does. Making slow cheap is its own piece of work (docs/roadmap.md,
    H2b), and it is the largest saving measured so far.
  */
  globalSpeed: 0.015,       // a slow viscous crawl, visibly moving
  particles: 0,             // off: every look predates them, and they cost a pass
  particleMix: 0.6,
  audioMappings: {
    velocity: 'bass',
    density: 'bass',
    color: 'treble',
    rotation: 'none',
  },
  platePressure: 0.4,       // glass plate squeeze — drives radial spreading
  glassSmear: 0.3,          // gentle smear from plate contact
  rainDrip: 0.0,
  viscosity: 'thick',
  polarity: 0.5,            // moderate immiscibility — colors stay distinct at boundaries
  heatIntensity: 0.15,
  boilingPoint: 0.95,
  evaporationRate: 0.003,   // very slow evaporation — colors persist
  airVelocity: 0.0,
  vibrationFrequency: 0.0,
  dropHeight: 0,
  layerCount: 1,
  blendMode: 'screen',
  gooeyEffect: 0.45,        // organic blob merging
  rotationSpeed: 0.0,       // no rotation — flat plate simulation
  centerGravity: 0.0,
  ledPlatform: false,
  ledMode: 'rainbow',
  ledColor: '#FF0000',
  ledSpeed: 0.05,
  surfaceTension: 0.05,
  // Still off, and now for a better reason than before.
  //
  // The pass had a real bug in it: the gate that keeps it from carving holes
  // was read per channel, so where one dye met another at the same thickness
  // it read zero on both channels and cancelled the flux. A colour boundary is
  // what the pass is for, and it was the one boundary it could not touch. That
  // is fixed — the gate reads the thickness now, and `npm run plate` measures
  // a two-cell colour boundary narrowing by a third over two hundred steps
  // where before it did not move at all.
  //
  // What did not follow is a reason to turn it on. Three arms on one preset at
  // one frame time — 0, a half, full — come out flat: on Fillmore, where the
  // beads and the dish make the frame's structure stable enough to compare,
  // 0 / 0.5 / 1.0 give edge fractions of 8.7, 8.3 and 8.5 percent and p99
  // gradients of 55.5, 54.8 and 55.0. On Classic the same three arms spread
  // from 1.9 to 10.2, but so do two runs of identical settings, so that is the
  // preset's own drift rather than the setting.
  //
  // So it stays where the first measurement put it. It is a slider and it is on
  // CC15; a plate that wants it can have it, and the pass will now do something
  // when it is asked to.
  sharpness: 0,
  granulation: 0.5,         // pigment texture between the boundaries, not just at them
  grainScale: 110,
  diffusionRate: 0.0002,    // moderate diffusion — blobs spread naturally
  buoyancy: 0.45,
  advection: 0.45,
  damping: 0.97,
  heatDecay: 0.98,
  // Enough to be felt without the plate ever looking like it is pulsing to a
  // beat it invented: a busy few seconds every ten or so, and genuinely quiet
  // in between.
  surge: 0.55,
  automateRate: 0.12,
  audioImpact: 0.6,
  turbulenceScale: 0.5,     // visible multi-scale ripples and filaments
  turbulenceDetail: 3,      // low octave for blob motion + two higher for detail
  blobSurfaceTension: 0.3,  // mostly loose — dye elongates and pinches with flow
  boundaryContrast: 0.45,   // bright interface line between dye colors
  saturationBoost: 1.45,    // counteracts muddy blending at boundaries
  dyeBudget: 0.85,
  edgeRelief: 0.4,
  lacing: 0,
  bubbles: 0.2,
  plateRock: 0.45,
  layerScaleVariety: 0.5,
  hueJourney: 3,
  beatSqueeze: 0.5,
  backgroundLoop: 0.5,
  kaleidoscope: 0,
  kaleidoSpin: 0.02,        // the rate that used to be baked into the shader
  kaleidoZoom: 0.72,        // and the pull-in that was baked in beside it
  dishVignette: 0,
  lightPlay: 0.6,
  lampMotion: 0.5,
  lampHotspot: 0.35,
  secondLamp: 0,
  iridescence: 0.25,
  renderStyle: 'show',
  paperA: '#1e5fb8',
  paperB: '#f4c04a',
  camera: 0,
  focus: 0.55,
  aperture: 0.5,
  bloom: 0.4,
  chromaticAberration: 0.3,
  refraction: 0.6,
  microDroplets: 0,
  thinFilm: 0,
  lumia: 0,
  chemistry: 0,
  gelWheel: 0,
  gelSpeed: 0.5,
  filmMix: 0.7,
  filmKey: 0.18,
  // A film is a slide until it is asked to be a force: a look saved before
  // this existed shows the same picture and moves the same way.
  filmDrive: 0,
  filmImpact: 0,
  lampWarmth: 0,
  transmission: 0.5,          // halfway: thick pools deep and thin washes pale, without crushing a dense blue to black
  dimmer: 1,
  fingering: 0,
  // A few. The plate is oil on water and the reference for the whole look is a
  // dish of it, which is hundreds of small dark-rimmed droplets — but this sat
  // at zero, so thirty of the thirty-two presets had none and the only hard
  // edges on those plates were the ones the dye happened to make. Low enough
  // that a preset which wants a clean wash still reads as one; Fillmore asks
  // for 0.8 when it wants a field of them.
  beads: 0.18,
  dishSpread: 0,
  cells: 0,
  markMix: 1,
  markX: 0.5,
  markY: 0.12,              // low, where a logo goes, and out of the plate's busy middle
  markScale: 0.22,
  exposure: 0,
  glossiness: 0.0,          // flat, evenly-lit matte dye — no glass-sphere highlights
  postBlurRadius: 0.35,     // much lower than legacy blur — keeps fine structure
  macroMode: false,         // off by default — the plate-wide light show is the base look
  // 1 is the whole plate, and the zoom is what takes you in: the camera picks
  // a bead somewhere past 1 and the closeup's own exposure, depth of field and
  // surface arrive over the travel rather than at a threshold. This shipped at
  // 4 with the slider inert unless `macroMode` was on, which made a control on
  // the desk — where there is no such switch — do nothing at all.
  macroZoom: 1.0,
  macroChase: 0.4,          // a steady follow with a short whip on each new bead
  macroHold: 5.0,
  macroSync: 0.5,
  macroCells: 0.75,
  macroCellScale: 0.5,
  macroLacing: 0.55,
  macroDepth: 0.5,
  macroEdgeDetail: 0.6,
  macroRelief: 0.7,
  sceneDrive: 0,            // the room does nothing to the plate until it is asked to
  sceneHands: 0,
  sceneImpact: 0.5,         // the depth room patches are read at once any are added
  // Sound starts at full, unlike the room's half and the film's nothing. Those
  // two are held back to protect looks that were saved before they existed; no
  // look has ever carried a sound patch, so there is nothing to protect — and a
  // source whose master starts at zero makes a patch you just made look broken.
  soundImpact: 1,
  shapeImpact: 1,
  sceneMappings: [],
  sceneDeadzone: 0.25,      // a lit room's own noise sits well under this
  sceneSmooth: 0.35,
  scenePeople: true,
  sceneMirror: true,        // a camera on the desk faces the room
  simResolution: 'auto',    // GPU at 384-512² where float render targets exist, else the CPU solver
};
