import { VisualizerSettings, AudioMappings } from './types';

export interface Preset {
  id: string;
  name: string;
  description: string;
  settings: Partial<VisualizerSettings>;
}

const DEFAULT_MAPPINGS: AudioMappings = {
  velocity: 'mid',
  density: 'bass',
  color: 'treble',
  rotation: 'none',
};

/*
  Rotation Speed, retuned when the motor's stir went (PLAN 22j).

  The dial turned the dish slowly and, until 22j, also stirred the current
  round the middle at thirty times the dial in the solver's units: a swirl
  fastest at the centre and gone by the rim, on the look's own clock (its
  Speed and Advection). On most looks that stir moved the liquid in view
  twenty to a thousand times faster than the motor turned the dish; on
  acid-trip it turned the middle at 0.95 rad/s against a motor of 0.001. A
  real dish turning steadily drags its liquid round with it through the gap
  and leaves nothing to stir, so the stir went, and each look's dial was moved
  up to turn the dish as fast as the stir and the old motor together moved
  the liquid in view: the same mean speed over the projector's 16:9 window
  (the plate is drawn at 1.5 times the window's width, so the window is the
  middle ±1/3 by ±3/16 of it, and the stir's mean speed there is a rigid
  turn's at 0.322 of the stir's centre), on the look's
  clock at rest (no phrase, tempo or scene lean), for the front plate. So a
  look turns about as much as it did, but as a whole, rigidly, with the
  glass: the middle no longer winds itself into a spiral against the rim.
  That is the difference to judge (docs/judging.md §28).
*/
export const PRESETS: Preset[] = [
  {
    id: 'classic',
    name: 'Classic Light Show',
    description: 'Slow, luminous blobs of yellow, pink and blue drift and merge: the 1960s overhead projector at its most meditative.',
    settings: {
      globalSpeed: 0.00924,
      surge: 0.5,        // unhurried, dreamlike pace
      layerCount: 2,
      blendMode: 'screen',       // additive glow — colors brighten where they overlap
      gooeyEffect: 0.65,         // organic, rounded blob edges
      rotationSpeed: 0.07,       // the dish's motor; was 0.008 with a stir in the middle (PLAN 22j)
      centerGravity: 0.12,       // gentle inward drift prevents edge stagnation
      ledPlatform: false,
      diffusionRate: 0,          // measured: the bleed cost more edge than it bought
      buoyancy: 0.4,             // moderate rise — not too static, not too chaotic
      advection: 0.35,           // smooth transport, no turbulence
      damping: 0.988,            // very slow energy loss — movements persist gracefully
      heatDecay: 0.992,          // warmth lingers, keeps gentle convection going
      automateRate: 0.15,        // regular auto-injection keeps the frame alive
      platePressure: 0.25,       // subtle radial spread from center
      glassSmear: 0.3,           // soft smearing, no harsh edges
      rainDrip: 0.15,            // occasional downward streaks for variety
      viscosity: 'thick',        // heavy, syrupy movement
      polarity: 0.7,             // colors stay distinct but can gently intermingle
      evaporationRate: 0.005,    // colors persist a long time
      airVelocity: 0.04,         // near-still air — no turbulence
      vibrationFrequency: 0.08,  // minimal vibration — serene
      audioImpact: 0.55,         // audible music visibly drives the fluid
      turbulenceScale: 0.5,      // lively multi-scale ripple
      turbulenceDetail: 3,
      blobSurfaceTension: 0.35,  // colours hold apart loosely
      boundaryContrast: 0.5,     // bright line where dyes meet
      saturationBoost: 1.45,
      glossiness: 0.0,           // flat backlit dye — the projector look
      postBlurRadius: 0.35,
      secondLamp: 0.2,
      /*
        28d (the showreel, 2026-10-11): the default look scored 4 of 10. On a
        minute of a real song it was a full-frame gradient of magenta, red,
        yellow and blue, slowly stirred, with big brown bubble discs and no
        bodies at all: nothing like the blobs its name promises. The plate ran
        at the default budget (0.85), which fills the dish until the colours
        meet everywhere and run into one wash, the same fault Velvet
        Underground was fixed of (0.45, dark between its pools). At 0.45 the
        regulator holds about half the colour, so the blobs stay blobs with
        the lamp between them, which is the overhead projector's own picture.
        And the brown discs were the default Bubbles (0.2): trapped air
        drawn dark against a dish this full. A few, not none, because a clock
        glass on a projector always has some.
      */
      dyeBudget: 0.45,
      bubbles: 0.05,
      /*
        The overhead projector's dish answers in the liquid (PLAN 28i-3b): a
        kick breaks the oil-and-water film with a soap pull (surfactantFlow),
        the snare curls the oil rims, and a held mid chord rounds the blobs'
        surface tension.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'surfactantFlow', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
        { source: 'bands', feature: 'tonalMid', setting: 'oilTension', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'bass',        // low frequencies push the fluid gently
        density: 'volume',       // louder = more color, but mapped gently
        color: 'treble',         // high frequencies shift hue — sparkle
        rotation: 'none',        // no audio-driven rotation — keep it calm
      },
    }
  },
  {
    id: 'comet',
    name: 'Comet River',
    description: 'A raging torrent that pulls ink off the plate instantly. A single poured point acts as a comet head while the stream rips a tail from it.',
    settings: {
      globalSpeed: 0.02,
      surge: 0.6,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0,
      centerGravity: 0,
      cometSpeed: 1.5,
      cometAngle: 90,
      ledPlatform: false,
      buoyancy: 0.2,
      advection: 0.45,
      damping: 0.9,
      automateRate: 0.0,
      viscosity: 'thick',
      polarity: 0.8,
      evaporationRate: 0.008,
      audioImpact: 0.6,
      turbulenceScale: 0.3,
      blobSurfaceTension: 0.4,
      boundaryContrast: 0.6,
      saturationBoost: 1.5,
      sceneMappings: [
        /*
          Fast bands and hits (PLAN 28i-3b): the bass band drives the stream's
          speed, the tonal mids bend its heading by an eighth of the dial
          (45°, 28f), and the snare sheds eddies into the tail.
        */
        { source: 'bands', feature: 'bass', setting: 'cometSpeed', depth: 0.4 },
        { source: 'bands', feature: 'tonalMid', setting: 'cometAngle', depth: 0.125 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'bass',
        color: 'treble',
        rotation: 'none',
      },
    }
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Spiral arms of starlight swirl through the void — galaxies colliding in slow motion.',
    settings: {
      vorticityConfinement: 0.5,
      globalSpeed: 0.00756,
      surge: 0.5,        // stately cosmic drift
      layerCount: 2,
      blendMode: 'lighter',      // additive light — stars brighten where they overlap
      gooeyEffect: 0.15,         // low goo — sharper points of light, less blobby
      rotationSpeed: 0.132,      // the dish's motor; was 0.035 with a stir in the middle (PLAN 22j)
      centerGravity: 0.85,       // strong pull inward — matter orbits a galactic core
      ledPlatform: true,
      diffusionRate: 0.00004,    // extremely low — pinpoints of light stay sharp
      buoyancy: 0.25,            // minimal buoyancy — horizontal swirl dominates
      advection: 0.75,           // strong transport — sweeping spiral arm motion
      damping: 0.994,            // very high — movements persist, orbits sustain
      heatDecay: 0.998,          // heat lingers forever — nebula glow persists
      automateRate: 0.14,        // moderate injection — periodic star bursts
      platePressure: 0.1,        // minimal plate spread — gravity dominates
      glassSmear: 0.15,          // light smearing — comet-tail streaks
      rainDrip: 0.0,             // no dripping — weightless space
      viscosity: 'thin',         // thin — fluid fragments into filaments and streams
      polarity: 0.25,            // low — colors intermingle freely like nebula gas
      evaporationRate: 0.002,    // stars persist for a very long time
      airVelocity: 0.02,         // near-vacuum — no turbulence
      vibrationFrequency: 0.0,   // no vibration — serene void
      audioImpact: 0.4,
      turbulenceScale: 0.55,     // strong swirl — spiral arms shear and stretch
      turbulenceDetail: 4,       // fine filament detail down to star-cluster scale
      blobSurfaceTension: 0.1,   // colours barely hold apart, and run together
      boundaryContrast: 0.25,
      saturationBoost: 1.45,     // vivid nebula color
      // A galaxy is mostly void: at the default 0.85 the regulator kept the
      // plate full and the whorl filled the frame. Near black 9% to 19% in
      // the lab on the seeded spiral.
      dyeBudget: 0.35,
      glossiness: 0.0,
      postBlurRadius: 0.2,       // very sharp — pinpoints of light stay pinpoints
      ledMode: 'single',
      ledColor: '#03041a',
      ledSpeed: 0.0,
      secondLamp: 0.25,
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the energy reading
        that swayed the dish's rotation now raises star-mote beads across the
        spiral arms, a kick lifts the warm core plume, and high overtones
        tighten the arms' curl.
      */
      sceneMappings: [
        { source: 'bands', feature: 'level', setting: 'beads', depth: 0.25 },
        { source: 'hits', feature: 'kickHit', setting: 'buoyancy', depth: 0.1 },
        { source: 'bands', feature: 'tonalHigh', setting: 'vorticityConfinement', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'bass',        // bass drives galactic tides
        density: 'energy',       // overall energy triggers star formation
        color: 'treble',         // treble shifts nebula hue
        rotation: 'none',        // dish motor turns steadily; energy is on beads above (PLAN 28i-3)
      },
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'High contrast, fast-moving neon fluids over a cyberpunk LED base.',
    settings: {
      globalSpeed: 0.0336,
      postBlurRadius: 0.1,
      boundaryContrast: 0.7,
      beads: 0.35,
      surge: 0.85,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.1,
      rotationSpeed: 0.287,      // the dish's motor; was 0.05 with a stir in the middle (PLAN 22j)
      centerGravity: 0.5,
      ledPlatform: false,  // 28a: its 'cyberpunk' LED wheel drew a conic rainbow through every clear patch, a colour picker under the glass; the neon is the dye's
      ledMode: 'cyberpunk',
      ledSpeed: 0.3,
      diffusionRate: 0.0002,
      buoyancy: 0.8,
      advection: 0.6,
      damping: 0.95,
      heatDecay: 0.9,
      automateRate: 0.2,
      platePressure: 0.6,
      glassSmear: 0.8,
      rainDrip: 0.2,
      viscosity: 'thin',
      polarity: 0.2,
      evaporationRate: 0.05,
      airVelocity: 0.3,
      vibrationFrequency: 0.8,
      chromaticAberration: 0.35,
      /*
        The pattern for a look's own patches (28f), for a look about hits:
        each kick churns the neon, a hard one harder; the snare's crack curls
        the eddies tight; the hats raise fine beads. Each hit is how hard it
        landed, falling over a quarter second (the `hits` source), so the
        liquid takes the push and carries it, and nothing moves between hits.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.3 },
        { source: 'hits', feature: 'hatsHit', setting: 'beads', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'energy',
        density: 'complexity',   // moved off rotation to dye density (PLAN 28i-3)
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'acid-trip',
    name: 'Acid Trip',
    description: 'Clashing ultramarine, coral, lime and magenta under a turning colour gel: everything inverts where it overlaps.',
    settings: {
      globalSpeed: 0.0336,
      beads: 0.4,
      surge: 0.95,
      layerCount: 2,
      blendMode: 'exclusion',
      gooeyEffect: 0.3,
      rotationSpeed: 0.421,      // the dish's motor; was 0.1 with a stir in the middle (PLAN 22j)
      centerGravity: 0.6,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.6,
      advection: 0.8,
      damping: 0.95,
      heatDecay: 0.97,
      automateRate: 0.25,
      platePressure: 0.8,
      glassSmear: 0.9,
      rainDrip: 0.4,
      viscosity: 'thin',
      polarity: 0.5,
      // It lays dye on the weakest thing the music does (timbre) and dried it at
      // 0.04, so with a band playing the plate ran empty and the frame was the
      // bare LED wheel. It holds its dye now, and the wheel shows through it.
      evaporationRate: 0.008,
      dyeBudget: 0.6,
      audioImpact: 0.8,
      airVelocity: 0.5,
      vibrationFrequency: 0.9,
      turbulenceScale: 0.8,      // maximum chaos — ripples on ripples
      turbulenceDetail: 4,
      blobSurfaceTension: 0.15,  // colours barely hold apart
      edgeRelief: 0.65,
      bubbles: 0.17,
      boundaryContrast: 0.75,     // hard psychedelic color interfaces
      saturationBoost: 1.6,      // hyper-saturated
      glossiness: 0.0,
      postBlurRadius: 0.12,
      gelWheel: 0.55,
      gelSpeed: 0.6,
      ledColor: '#12002c',
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the energy reading
        that swayed the dish's rotation now pulls the soap-and-silicone film
        apart (surfactantFlow), a kick churns the concentric rings, and the
        lead note turns the hue walk sooner.
      */
      sceneMappings: [
        { source: 'bands', feature: 'level', setting: 'surfactantFlow', depth: 0.3 },
        { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.25 },
        { source: 'bands', feature: 'note', setting: 'hueJourney', depth: -0.15 },
      ],
      audioMappings: {
        velocity: 'treble',
        density: 'timbre',
        color: 'complexity',
        rotation: 'none',
      },
    }
  },
  {
    id: 'bass-drop',
    name: 'Bass Drop',
    description: 'Every bass hit drops a heavy splash from height: crimson and ultramarine thrown across ice, the plate squeezed on the kick.',
    settings: {
      globalSpeed: 0.021,
      beads: 0.25,
      surge: 0.9,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.6,
      rotationSpeed: 0.146,      // the dish's motor; was 0.01 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,       // was 0.4, which slid every well's dye into the middle (PLAN 25b-3)
      ledPlatform: false,
      diffusionRate: 0.0002,
      buoyancy: 0.3,
      advection: 0.5,
      damping: 0.94,
      heatDecay: 0.92,
      automateRate: 0.05,
      platePressure: 0.9,
      glassSmear: 0.7,
      rainDrip: 0.3,
      viscosity: 'thick',
      polarity: 0.7,
      evaporationRate: 0.02,
      airVelocity: 0.2,
      vibrationFrequency: 1.0,
      dropHeight: 0.9,
      beatSqueeze: 0.8,
      // The one look whose music moves the frame (FRAME_MOVING_LOOKS): a
      // third of Frame Sway's travel, so the rock carries the picture without
      // the full slide #347 had on every look.
      frameSway: 0.35,
      sceneMappings: [
        /*
          The kick throws the plate, a hard kick harder. The patch was written
          on the `sound` source, whose features are the hook's loudness, bass,
          mid and treble: `kick` was not one of them, so it read 0 and never
          moved anything (28f). It is the kick's hit now (the `hits` source:
          how hard it landed, falling over a quarter second), not the kick's
          level, which is loud between kicks too. Bass Drop is the one look
          that may move the frame with the music (FRAME_MOVING_LOOKS,
          lib/plateRock.ts): its Frame Sway above lets the rock carry the
          picture, as nothing else on the shelf does.
        */
        { source: 'hits', feature: 'kickHit', setting: 'plateRock', depth: 0.5 },
        { source: 'sound', feature: 'bass', setting: 'gooeyEffect', depth: 0.3 },
        /*
          Its three wells (PLAN 25b-3, 25h): the kicks take them in turn
          (areaForBand), and on top of that the snare stirs the low well (area
          2) and the sub (band 1, 40 to 85 Hz) warms the left one (area 0)
          while it holds.
        */
        { source: 'hits', feature: 'snareHit', setting: 'areaStir', area: 2, depth: 0.5, threshold: 0.3, attack: 0.02, release: 0.3 },
        { source: 'bands', feature: 'band1', setting: 'areaHeat', area: 0, depth: 0.6, threshold: 0.5, attack: 0.05, release: 1.0 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'bass',
        color: 'none',
        rotation: 'none',
      },
    }
  },
  {
    id: 'microscopic-chaos',
    name: 'Microscopic Chaos',
    description: 'A stained slide on a bright field: magenta, violet and blue cells crowd, divide and jostle under the lamp.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      globalSpeed: 0.0168,
      boundaryContrast: 0.7,
      beads: 0.45,
      surge: 0.9,
      layerCount: 2,
      blendMode: 'multiply',
      gooeyEffect: 0.15,
      rotationSpeed: 0.125,      // the dish's motor; was 0.01 with a stir in the middle (PLAN 22j)
      centerGravity: 0.5,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.00005,
      buoyancy: 0.4,
      advection: 0.3,
      damping: 0.98,
      heatDecay: 0.95,
      automateRate: 0.3,
      platePressure: 0.8,
      glassSmear: 0.2,
      rainDrip: 0.1,
      viscosity: 'thick',
      polarity: 0.95,
      evaporationRate: 0.01,
      airVelocity: 0.1,
      vibrationFrequency: 0.6,
      ledColor: '#f1ebf5',
      cells: 0.45,
      saturationBoost: 1.15,
      dyeBudget: 0.55,
      sceneMappings: [
        // The hats by name are the `bands` source's; on `sound` this read 0 (28f).
        // Kick and snare agitate the slide and nucleate micro-bubbles in the shear (28i-3b).
        { source: 'bands', feature: 'hats', setting: 'beads', depth: 0.5 },
        { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'bubbles', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'complexity',
        density: 'energy',
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    description: 'Curtains of jade, lime and lavender ripple across a night sky, slow and hushed.',
    settings: {
      globalSpeed: 0.0105,
      surge: 0.2,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.6,
      rotationSpeed: 0.085,      // the dish's motor; was 0.008 with a stir in the middle (PLAN 22j)
      centerGravity: 0.05,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.65,
      advection: 0.35,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.06,
      platePressure: 0.15,
      glassSmear: 0.4,
      rainDrip: 0.2,
      viscosity: 'thin',
      polarity: 0.4,
      evaporationRate: 0.008,
      // Curtains, not a sheet: a full plate on the lighter blend was one flat
      // green. With less dye and the thin film read as sky, the ocean lamp
      // shows between the folds.
      dyeBudget: 0.35,
      exposure: 0.5,
      airVelocity: 0.08,
      vibrationFrequency: 0.15,
      ledColor: '#020818',
      secondLamp: 0.35,
      sceneMappings: [
        /*
          Both read 0 until 28f: `note` and `tonalMid` are the `bands`
          source's names, not `sound`'s. The note keeps its patch. The hue's
          was the tonal mids lengthening the journey's minutes per step, so a
          held chord slowed the colours; it is the other way now, a held
          chord turning the hue sooner (a step a minute and a half quicker
          at full). The journey steps when its minutes are up, so a chord
          coming and going moves when the next step lands, never the colour
          on the frame. And the energy reading that swayed rotation now
          billows the curtains' curl (PLAN 28i-3).
        */
        { source: 'bands', feature: 'note', setting: 'cometSpeed', depth: 0.15 },
        { source: 'bands', feature: 'tonalMid', setting: 'hueJourney', depth: -0.15 },
        { source: 'bands', feature: 'level', setting: 'vorticityConfinement', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'volume',
        color: 'complexity',
        rotation: 'none',
      },
    }
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    description: 'Explosive plumes of plasma erupt from a white-hot core, driven by bass.',
    settings: {
      globalSpeed: 0.0252,
      boundaryContrast: 0.55,
      beads: 0.3,
      surge: 0.8,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.3,
      rotationSpeed: 0.183,      // the dish's motor; was 0.015 with a stir in the middle (PLAN 22j)
      centerGravity: 0.7,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.85,
      advection: 0.7,
      damping: 0.93,
      heatDecay: 0.97,
      automateRate: 0.18,
      platePressure: 0.7,
      glassSmear: 0.6,
      rainDrip: 0.05,
      viscosity: 'thin',
      polarity: 0.3,
      evaporationRate: 0.012,
      airVelocity: 0.35,
      vibrationFrequency: 0.6,
      iridescence: 0.25,
      ledColor: '#2a0700',
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the bass reading that
        swayed the dish's rotation now drives thermal plume rise (buoyancy) in
        the alcohol-and-soap corona, kicks erupt the prominences, and hats
        pull Marangoni filaments off the flare tips.
      */
      sceneMappings: [
        { source: 'bands', feature: 'bass', setting: 'buoyancy', depth: 0.12 },
        { source: 'hits', feature: 'kickHit', setting: 'turbulenceScale', depth: 0.3 },
        { source: 'bands', feature: 'hats', setting: 'surfactantFlow', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'energy',
        color: 'treble',
        rotation: 'none',
      },
    }
  },
  {
    id: 'jellyfish-bloom',
    name: 'Jellyfish Bloom',
    description: 'Translucent magenta and lavender bells pulse through teal water, lit from beneath.',
    settings: {
      globalSpeed: 0.0126,
      surge: 0.25,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.85,
      rotationSpeed: 0.067,      // the dish's motor; was 0.006 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.00008,
      buoyancy: 0.55,
      advection: 0.25,
      damping: 0.988,
      heatDecay: 0.995,
      automateRate: 0.16,  // 28a: at 0.08 two bells on an empty navy plate most of the minute (flat 61–70% on the Mac)
      platePressure: 0.25,
      glassSmear: 0.15,
      rainDrip: 0.45,
      viscosity: 'thick',
      polarity: 0.85,
      evaporationRate: 0.005,
      airVelocity: 0.04,
      vibrationFrequency: 0.25,
      transmission: 0.3,
      secondLamp: 0.3,
      ledColor: '#03102a',
      /*
        A band per bell (PLAN 25b-6, 25h; the bells are its areas). The kick
        pours from the lowest bell (area 1), its pink and then the teal it
        sends out, a pulse a kick, while Beat Squeeze's press lands on it; the
        hats ruffle the top bell's fringe (area 2) with a quick paddle, and the
        brilliance band picks that bell's bottle for what the music lays there
        (the treble's sparks land on it): its icy blue when the top is bright
        (band 7 over 0.83, at this depth), its first dye under that. The mids
        (band 4) pour the two side bells (areas 0 and 3).
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'areaPour', area: 1, depth: 0.5, threshold: 0.3, attack: 0.02, release: 0.4 },
        { source: 'hits', feature: 'hatsHit', setting: 'areaStir', area: 2, depth: 0.5, threshold: 0.3, attack: 0.01, release: 0.2 },
        { source: 'bands', feature: 'band7', setting: 'areaHue', area: 2, depth: 0.6 },
        { source: 'bands', feature: 'band4', setting: 'areaPour', area: 0, depth: 0.25, threshold: 0.45, attack: 0.3, release: 1.0 },
        { source: 'bands', feature: 'band4', setting: 'areaPour', area: 3, depth: 0.25, threshold: 0.45, attack: 0.3, release: 1.0 },
      ],
      audioMappings: {
        velocity: 'mid',
        density: 'mid',
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'fractal-dream',
    name: 'Fractal Dream',
    description: 'The plate folded into a turning six-way mirror: rings of amber, magenta and teal become a mandala that breathes with the music.',
    settings: {
      globalSpeed: 0.0189,
      boundaryContrast: 0.6,
      beads: 0.3,
      surge: 0.8,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.2,
      rotationSpeed: 0.187,      // the dish's motor; was 0.04 with a stir in the middle (PLAN 22j)
      centerGravity: 0.9,
      ledPlatform: false,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.5,
      advection: 0.55,
      damping: 0.96,
      heatDecay: 0.96,
      automateRate: 0.2,
      platePressure: 0.5,
      glassSmear: 0.7,
      rainDrip: 0.3,
      viscosity: 'thin',
      polarity: 0.65,
      evaporationRate: 0.025,
      airVelocity: 0.25,
      vibrationFrequency: 0.55,
      kaleidoscope: 6,
      kaleidoSpin: 0.06,
      kaleidoZoom: 0.85,
      ledColor: '#000000',
      saturationBoost: 1.45,
      dishVignette: 0.5,
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the treble reading
        that swayed the dish's rotation now scatters silicone beads across the
        mirrored rings, the snare curls the ring edges, and high overtones
        tighten the silicone drops.
      */
      sceneMappings: [
        { source: 'bands', feature: 'hats', setting: 'beads', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
        { source: 'bands', feature: 'tonalHigh', setting: 'oilTension', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'complexity',
        density: 'mid',
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'velvet-underground',
    name: 'Velvet Underground',
    description: 'Three pools apart on deep violet: thick magenta glycerine folded by the mids, a raspberry well of soap the bass breaks open, and ultramarine syrup glittering with the treble.',
    settings: {
      globalSpeed: 0.0084,
      surge: 0.18,
      layerCount: 2,
      blendMode: 'overlay',
      gooeyEffect: 0.75,
      rotationSpeed: 0.023,      // the dish's motor; was 0.005 with a stir in the middle (PLAN 22j)
      // Flat: a concave dish slid all three pools into one in the middle. The
      // pools are its areas of the dish now (lib/plateAreas.ts).
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#220044',
      ledSpeed: 0.0,
      diffusionRate: 0.00006,
      buoyancy: 0.3,
      advection: 0.2,
      damping: 0.992,
      heatDecay: 0.997,
      automateRate: 0.08,       // the hands tend three areas now, so a little more often (was 0.04)
      platePressure: 0.3,
      glassSmear: 0.25,
      rainDrip: 0.6,
      viscosity: 'thick',
      polarity: 0.9,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      transmission: 0.55,
      lampWarmth: 0.25,
      glossiness: 0.35,
      edgeRelief: 0.45,
      boundaryContrast: 0.5,
      dyeBudget: 0.45,          // dark violet between the pools: at the default 0.85 they ran into one wash
      /*
        Each pool hears its own instrument (PLAN 25h, lib/areaCords.ts). The
        kick warms and stirs the soap well (area 1): a heat source under it
        and a paddle that folds it back the other way on each kick, over the
        ring the kick's own hand lands there. The mids (band 4, 380 to 800 Hz)
        fold the glycerine (area 0) with a slow paddle that swells in over
        0.4 s and lets go over 1.5. The hats pour the syrup's bottles (area
        2), ultramarine and purple in turn, a drop a hat. All on the gate, so
        it is the instrument and not the room; all fast readings; nothing on
        the frame.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'areaHeat', area: 1, depth: 0.6, threshold: 0.3, attack: 0.02, release: 0.8 },
        { source: 'hits', feature: 'kickHit', setting: 'areaStir', area: 1, depth: 0.6, threshold: 0.3, attack: 0.05, release: 0.5 },
        { source: 'bands', feature: 'band4', setting: 'areaStir', area: 0, depth: 0.4, threshold: 0.45, attack: 0.4, release: 1.5 },
        { source: 'hits', feature: 'hatsHit', setting: 'areaPour', area: 2, depth: 0.3, threshold: 0.35, attack: 0.01, release: 0.15 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'bass',
        color: 'none',
        rotation: 'none',
      },
    }
  },
  {
    id: 'neon-coral-reef',
    name: 'Neon Coral Reef',
    description: 'A reaction grows coral across the glass: coral, teal and amber branches spread, fork and are carried off by the current.',
    settings: {
      globalSpeed: 0.0168,
      boundaryContrast: 0.5,
      beads: 0.3,
      surge: 0.5,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.55,
      rotationSpeed: 0.131,      // the dish's motor; was 0.012 with a stir in the middle (PLAN 22j)
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0001,
      buoyancy: 0.45,
      advection: 0.4,
      damping: 0.978,
      heatDecay: 0.985,
      automateRate: 0.12,
      platePressure: 0.35,
      glassSmear: 0.45,
      rainDrip: 0.55,
      viscosity: 'thick',
      polarity: 0.75,
      evaporationRate: 0.012,
      airVelocity: 0.12,
      vibrationFrequency: 0.4,
      chemistry: 0.7,
      ledColor: '#021418',
      saturationBoost: 1.4,
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the timbre reading
        that swayed the dish's rotation now pulls the soap-and-silicone
        Marangoni coral branches (surfactantFlow), the snare opens lace polyps
        along the branches, and the hats release bright reef motes.
      */
      sceneMappings: [
        { source: 'bands', feature: 'tonalMid', setting: 'surfactantFlow', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'lacing', depth: 0.25 },
        { source: 'bands', feature: 'hats', setting: 'beads', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'mid',
        density: 'treble',
        color: 'complexity',
        rotation: 'none',
      },
    }
  },
  {
    id: 'stardust-collapse',
    name: 'Stardust Collapse',
    description: 'Motes of white, lavender and amber dust spiral into the centre and burst back out on the bass, every grain holding its colour.',
    settings: {
      globalSpeed: 0.0231,
      boundaryContrast: 0.65,
      beads: 0.3,
      surge: 0.85,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.05,
      rotationSpeed: 0.282,      // the dish's motor; was 0.06 with a stir in the middle (PLAN 22j)
      centerGravity: 0.95,
      // Glitter wants a night sky. On the rainbow wheel, with the dye dried
      // and diffused away, the frame was the wheel and nothing else.
      ledPlatform: false,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,     // a spark stays a spark
      buoyancy: 0.7,
      advection: 0.9,
      damping: 0.92,
      heatDecay: 0.93,
      automateRate: 0.22,
      platePressure: 0.85,
      glassSmear: 0.9,
      rainDrip: 0.15,
      viscosity: 'thin',
      polarity: 0.15,
      evaporationRate: 0.006,
      dyeBudget: 0.45,
      audioImpact: 0.85,
      airVelocity: 0.55,
      vibrationFrequency: 0.85,
      particles: 0.8,
      particleMix: 0.75,
      ledColor: '#000000',
      /*
        Sound on the liquid, not the frame (PLAN 28i-3): the bass reading that
        swayed the dish's rotation now presses the soap ring on the collapse
        (platePressure), kicks tighten the infalling eddies, and hats brighten
        the dust motes.
      */
      sceneMappings: [
        { source: 'bands', feature: 'bass', setting: 'platePressure', depth: 0.25 },
        { source: 'hits', feature: 'kickHit', setting: 'vorticityConfinement', depth: 0.3 },
        { source: 'bands', feature: 'hats', setting: 'beads', depth: 0.25 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'energy',
        color: 'treble',
        rotation: 'none',
      },
    }
  },

  // ── Macro closeup presets ────────────────────────────────────────
  // These drive the tracking macro camera (macroMode). The frame rides one
  // bead of dye at high magnification, so the settings that matter most are
  // the ones that keep dye *separated* into distinct beads — high polarity,
  // low diffusion, low gooey blur — and fast enough to be worth chasing.
  {
    id: 'lumia',
    name: 'Lumia',
    description: 'Thomas Wilfred\u2019s lumia: slow folded light, and three veils of colour in different parts of a nearly clear plate, two held in glycerine and one that soap spreads thin. No beat \u2014 minutes-long evolutions.',
    settings: {
      globalSpeed: 0.00504,
      surge: 0.12,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.0084,     // the dish's motor; was 0.003 with a stir in the middle (PLAN 22j)
      centerGravity: 0.0,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#05030c',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.2,
      advection: 0.3,
      damping: 0.99,
      heatDecay: 0.99,
      automateRate: 0.03,       // tends its three veils; at 0.008 a drop came every three minutes and the plate stayed empty
      platePressure: 0.05,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.3,
      evaporationRate: 0.06,
      airVelocity: 0.02,
      vibrationFrequency: 0.0,
      audioImpact: 0.12,
      turbulenceScale: 0.12,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.7,
      boundaryContrast: 0.15,
      saturationBoost: 1.2,
      dyeBudget: 0.2,          // a nearly clear plate: three veils, in their areas (lib/plateAreas.ts), and dark between (was 0.1, with nothing laid)
      edgeRelief: 0.3,
      bubbles: 0,
      plateRock: 0.1,
      layerScaleVariety: 0,
      lumia: 0.9,
      /*
        No drum hits: Wilfred's three veils answer harmony and the lead note
        only, each in its own area on a slow gate (PLAN 25h, 28i-3b). Low
        harmony warms the left glycerine veil (area 0), mid harmony folds the
        soap veil (area 1), and the lead note refreshes the lower glycerine
        veil (area 2).
      */
      sceneMappings: [
        { source: 'bands', feature: 'tonalLow', setting: 'areaHeat', area: 0, depth: 0.35, threshold: 0.3, attack: 0.2, release: 0.8 },
        { source: 'bands', feature: 'tonalMid', setting: 'areaStir', area: 1, depth: 0.3, threshold: 0.35, attack: 0.15, release: 0.6 },
        { source: 'bands', feature: 'note', setting: 'areaPour', area: 2, depth: 0.3, threshold: 0.4, attack: 0.1, release: 0.7 },
      ],
      audioMappings: { velocity: 'energy', density: 'none', color: 'timbre', rotation: 'none' },
    }
  },
  {
    /*
      PLAN.md 26d. The owner's "Mask Reaction Diff" pack, done as the chemistry
      it imitates: a CIMA dish (Castets, Dulos, Boissonade and De Kepper, 1990)
      under a white lamp, its gel standing in the reagents (Chemistry 1, the
      bath) with starch in it (Turing Print 1), so the labyrinth prints as the
      blue-black starch–iodine complex on clear: black on white, stripes of
      one width that heal behind a stir. Each pour is more reagent with a speck
      of the autocatalyst in it, so the pattern grows out from where it lands
      (26c). No palette: the colour is the indicator's (depositChem).
    */
    id: 'turing-print',
    name: 'Turing Print',
    description: 'A reaction that prints: the CIMA reaction in a gel with starch, under a white lamp. Labyrinths of one stripe width grow out from each pour in blue-black on clear, and the flow drags them into whorls that heal back.',
    settings: {
      lampGround: 1,
      globalSpeed: 0.0126,
      surge: 0.2,
      layerCount: 1,
      blendMode: 'multiply',
      gooeyEffect: 0,
      rotationSpeed: 0.0,
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#ffffff',
      ledSpeed: 0.0,
      diffusionRate: 0.0002,
      buoyancy: 0.2,
      advection: 0.4,
      damping: 0.985,
      heatDecay: 0.985,
      automateRate: 0.02,
      platePressure: 0.15,
      glassSmear: 0.1,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.5,
      evaporationRate: 0.0,
      airVelocity: 0.0,
      vibrationFrequency: 0.0,
      audioImpact: 0.4,
      turbulenceScale: 0.15,
      turbulenceDetail: 3,
      blobSurfaceTension: 0.5,
      boundaryContrast: 0,
      saturationBoost: 1.0,
      dyeBudget: 0.35,
      // A gel print is flat: the complex sits in the gel and does not raise it (PLAN 26-colour-a).
      edgeRelief: 0,
      bubbles: 0,
      plateRock: 0.1,
      layerScaleVariety: 0,
      chemistry: 1,
      chemistryPattern: 1,
      chemistryWidth: 0.5,
      turingPrint: 1,
      /*
        The print that goes on changing: a labyrinth under constant feed and
        kill settles into one picture and only creeps (the lab's control:
        correlation 0.90 with itself after fifty seconds), while 0.7 here moves
        the feed along the saddle-node line across the plate on a 40 to 90
        second clock and rearranges it (0.67 after the same fifty seconds) without
        emptying it (0.69 of the plate carries activator against the
        control's 0.71). Below 1 because at 1 a soft grey patch opens where
        the map pushes the pattern toward a bare plate (PLAN.md 26d-6).
      */
      turingDrift: 0.7,
      exposure: 0.7,
      /*
        The CIMA dish answers in the reaction and the flow that drags it
        (PLAN 28i-3b): bass nudges the feed drift along the saddle-node line,
        the snare bends growing stripes into whorls, and high overtones
        sharpen the labyrinth detail.
      */
      sceneMappings: [
        { source: 'bands', feature: 'bass', setting: 'turingDrift', depth: 0.2 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
        { source: 'bands', feature: 'tonalHigh', setting: 'mazeDetail', depth: 0.2 },
      ],
      audioMappings: { velocity: 'mid', density: 'none', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'poster-1969',
    name: 'Poster, 1969',
    description: 'Two opaque dyes on a single plate, hard-edged and flat like a screen-printed Fillmore poster: orange against ultramarine, the colours that vibrate.',
    settings: {
      /*
        Its print's grain stays a texture, not flecks, at the half it had:
        with the dye's depth drawn (Transmission 1, PLAN 18l) the pigment's
        grain varies the depth of this poster's strong, saturated inks on the
        lamp, and each ±40% of depth swings their colour far enough to fleck
        the edges (in npm run grainedge, 4.1% of the edges' pixels flecks, the
        line asks under 2%; 0.6% at 0.5). PLAN 18l-7.
      */
      transmission: 0.5,
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      globalSpeed: 0.0126,
      surge: 0.55,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.6,
      rotationSpeed: 0.0,
      centerGravity: 0.0,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0.00005,
      buoyancy: 0.3,
      advection: 0.5,
      damping: 0.975,
      heatDecay: 0.98,
      automateRate: 0.1,
      platePressure: 0.5,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 1.0,
      evaporationRate: 0.002,
      airVelocity: 0.0,
      vibrationFrequency: 0.0,
      audioImpact: 0.55,
      turbulenceScale: 0.35,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.6,
      boundaryContrast: 0.9,
      saturationBoost: 1.6,
      glossiness: 0.0,
      postBlurRadius: 0.0,
      dyeBudget: 1.1,
      edgeRelief: 0.0,
      bubbles: 0.07,
      plateRock: 0.5,
      beatSqueeze: 0.0,
      layerScaleVariety: 0.0,
      lightPlay: 0.15,
      lampHotspot: 0.1,
      iridescence: 0,
      secondLamp: 0,
      /*
        Each poster shape answers in its own place (PLAN 25b-4, 28i-3b): the
        kick pours into the left orange-and-coral milk shape (area 0), the
        bass band switches its bottle between orange and coral, and the snare
        pushes the right ultramarine-and-purple ink shape (area 1).
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'areaPour', area: 0, depth: 0.45, threshold: 0.35, attack: 0.01, release: 0.25 },
        { source: 'bands', feature: 'band2', setting: 'areaHue', area: 0, depth: 0.6 },
        { source: 'hits', feature: 'snareHit', setting: 'areaStir', area: 1, depth: 0.45, threshold: 0.35, attack: 0.02, release: 0.3 },
      ],
      audioMappings: { velocity: 'bass', density: 'bass', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'macro-bead',
    name: 'Macro Bead',
    description: 'The camera chases one travelling bead — teal, amber and coral on a deep sea-green ground — cells, lacing and razor edges filling the frame.',
    settings: {
      macroMode: true,
      macroCamera: 'follow',     // rides the liquid under the aim; aim it anywhere, or Auto to roam
      macroZoom: 4.5,            // ~28 sim cells across — bead plus its surroundings
      macroChase: 0.55,          // a quick follow with a whip on each cut
      macroHold: 4.5,
      macroCells: 0.85,
      macroCellScale: 0.45,
      macroLacing: 0.7,
      macroDepth: 0.6,
      macroEdgeDetail: 0.75,
      macroRelief: 0.8,       // domed beads with wet highlights
      beads: 0.35,            // oil drops on the plate, each a lens on the colour under it
      globalSpeed: 0.06,
      surge: 0.45,         // beads visibly travel — the whole point
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.12,         // almost no metaball blur — keeps beads crisp
      postBlurRadius: 0.1,
      rotationSpeed: 0.0,
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#04181a',
      ledSpeed: 0.0,
      diffusionRate: 0.00003,    // colors stay separate instead of muddying
      buoyancy: 0.35,
      advection: 0.6,
      damping: 0.985,
      heatDecay: 0.985,
      automateRate: 0.22,
      platePressure: 0.3,
      glassSmear: 0.2,
      rainDrip: 0.05,
      viscosity: 'thick',
      polarity: 0.9,             // strong immiscibility — hard color boundaries
      evaporationRate: 0.006,
      airVelocity: 0.08,
      vibrationFrequency: 0.05,
      audioImpact: 0.5,
      turbulenceScale: 0.45,
      turbulenceDetail: 3,
      blobSurfaceTension: 0.55,
      bubbles: 0.12,
      layerScaleVariety: 0,
      boundaryContrast: 0.7,
      saturationBoost: 1.5,
      glossiness: 0.12,          // a hint of wet sheen at this distance
      macroSync: 0.6,
      /*
        Closeup bead physics (PLAN 28i-3b): kicks open cell rings inside the
        travelling silicone bead, snares stretch lacing along its dark
        shoulder, and mid harmony rounds the drop's surface tension.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'cells', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'lacing', depth: 0.25 },
        { source: 'bands', feature: 'tonalMid', setting: 'oilTension', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'volume',
        color: 'treble',
        rotation: 'none',
      },
    }
  },
  {
    id: 'cell-bloom',
    name: 'Cell Bloom',
    description: 'Three small pools turning under a magnifier on violet: silicone that breaks into packed rings of paint cells in magenta and ultramarine, and a lavender pool of oil between them.',
    settings: {
      macroMode: true,
      macroCamera: 'hold',       // sits on the middle, where its three pools turn (lib/plateAreas.ts); was follow, which rode one pool
      macroZoom: 3.5,
      macroChase: 0.45,          // slower drift — this one lingers on a pool
      macroHold: 7.0,
      macroCells: 1.0,           // maximum cell structure
      macroCellScale: 0.6,       // was 0.32, too small to resolve at 3.5x, so no cell was ever drawn (lib/plateAreas.ts)
      macroLacing: 0.35,
      macroDepth: 0.7,
      macroEdgeDetail: 0.5,
      macroRelief: 0.9,       // deepest relief of the three — cells read as bubbles
      globalSpeed: 0.045,
      surge: 0.5,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.2,
      postBlurRadius: 0.12,
      rotationSpeed: 0.156,      // the dish's motor; was 0.004 with a stir in the middle (PLAN 22j)
      centerGravity: 0.05,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#12062a',
      ledSpeed: 0.0,
      diffusionRate: 0.00005,
      buoyancy: 0.5,
      advection: 0.45,
      damping: 0.99,
      heatDecay: 0.99,
      automateRate: 0.14,
      platePressure: 0.45,
      glassSmear: 0.25,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.85,
      evaporationRate: 0.004,  // 28a: at 0.01 the cells drained to one sliver by 40 s (flat 75% on the Mac)
      airVelocity: 0.05,
      vibrationFrequency: 0.0,
      audioImpact: 0.55,
      turbulenceScale: 0.35,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.6,
      bubbles: 0.1,
      layerScaleVariety: 0,
      boundaryContrast: 0.6,
      saturationBoost: 1.55,
      glossiness: 0.18,
      macroSync: 0.35,
      /*
        Its three closeup pools answer by area (PLAN 25h, 28i-3b): the kick
        pours silicone into the top pool (area 0), the bass band turns its
        bottle between magenta and amber, and the mid band stirs the lavender
        oil pool beside it (area 1).
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'areaPour', area: 0, depth: 0.45, threshold: 0.35, attack: 0.01, release: 0.25 },
        { source: 'bands', feature: 'band2', setting: 'areaHue', area: 0, depth: 0.6 },
        { source: 'bands', feature: 'band4', setting: 'areaStir', area: 1, depth: 0.4, threshold: 0.35, attack: 0.04, release: 0.35 },
      ],
      audioMappings: {
        velocity: 'mid',
        density: 'bass',
        color: 'treble',
        rotation: 'none',
      },
    }
  },
  {
    id: 'lace-run',
    name: 'Lacing Run',
    description: 'A tongue of amber dye spreading over dark red ground, dragging black dendritic lacing behind it; the camera cuts on the kick.',
    settings: {
      macroMode: true,
      macroCamera: 'follow',     // rides the liquid under the aim; aim it anywhere, or Auto to roam
      macroZoom: 4.0,
      macroChase: 0.7,           // the liveliest of the three
      macroHold: 4.0,            // short takes
      macroCells: 0.8,
      macroCellScale: 0.55,
      macroLacing: 1.0,          // lacing is the subject here
      macroDepth: 0.6,
      macroEdgeDetail: 0.9,      // maximum silhouette crinkle
      macroRelief: 0.65,
      globalSpeed: 0.07,
      surge: 0.6,         // quick — this one rushes
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.08,
      postBlurRadius: 0.08,
      rotationSpeed: 0.0,
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#2E0705',
      ledSpeed: 0.0,
      diffusionRate: 0.00004,
      buoyancy: 0.3,
      advection: 0.85,
      damping: 0.975,
      heatDecay: 0.97,
      automateRate: 0.28,
      platePressure: 0.45,       // squeeze drives the front without flattening it
      glassSmear: 0.4,
      rainDrip: 0.2,
      viscosity: 'thin',
      polarity: 0.95,
      evaporationRate: 0.005,
      airVelocity: 0.2,
      vibrationFrequency: 0.1,
      audioImpact: 0.65,
      turbulenceScale: 0.7,
      turbulenceDetail: 4,
      blobSurfaceTension: 0.15,
      bubbles: 0.15,
      layerScaleVariety: 0,
      boundaryContrast: 0.8,
      saturationBoost: 1.4,
      glossiness: 0.08,
      macroSync: 0.85,
      /*
        The running tongue of soap and silicone (PLAN 28i-3b): kicks drive the
        surfactant pull at the leading edge, snares split the front into
        fingers, and hats tighten the dendritic lace in the wake.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'surfactantFlow', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'fingering', depth: 0.25 },
        { source: 'bands', feature: 'hats', setting: 'lacing', depth: 0.2 },
      ],
      audioMappings: {
        velocity: 'bass',
        density: 'energy',
        color: 'treble',
        rotation: 'none',
      },
    }
  },
  {
    id: 'crowd-plate',
    name: 'Crowd Plate',
    description: 'The room plays it: the floor stirs the liquid, everyone dancing is a hand on the glass, and a busier room opens the turbulence.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      // A plate that wants stirring rather than one that is already busy: the
      // turbulence starts low so what the room adds is what is seen moving,
      // and the dye budget runs full so there is something there to move.
      globalSpeed: 0.0126,
      surge: 0.55,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.0,
      centerGravity: 0.05,
      granulation: 0.5,
      diffusionRate: 0.00012,
      buoyancy: 0.3,
      advection: 0.45,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.08,          // the room does the injecting; automation only tops it up
      platePressure: 0.35,
      glassSmear: 0.25,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.7,
      evaporationRate: 0.0025,
      audioImpact: 0.35,           // the music is still there, but it is not the loudest hand
      turbulenceScale: 0.12,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.5,
      boundaryContrast: 0.1,
      saturationBoost: 1.45,
      dyeBudget: 1.0,
      edgeRelief: 0.15,
      bubbles: 0.15,
      beads: 0.2,
      fingering: 0.6,              // a palm on the glass lifts into spokes as they move on
      plateRock: 0.2,
      beatSqueeze: 0.0,
      lightPlay: 0.35,
      lampMotion: 0.25,
      lampHotspot: 0.5,
      hueJourney: 5,

      // The room, on, plus two fast sound cords for the music half (PLAN 28i-3b).
      sceneDrive: 0.55,
      sceneHands: 0.6,
      sceneImpact: 0.6,
      sceneMappings: [
        // A fuller floor is a rougher plate, and a room that goes quiet
        // settles rather than stopping.
        { feature: 'motion', setting: 'turbulenceScale', depth: 0.45 },
        // The lamp walks with the crowd instead of sitting under the middle.
        { feature: 'dirX', setting: 'lampMotion', depth: 0.35 },
        // More people, more dye on the plate.
        { feature: 'crowd', setting: 'dyeBudget', depth: 0.25 },
        // And the music's own hands on the soap film: kicks pull the soap
        // rims open and hats scatter beads across the wash.
        { source: 'hits', feature: 'kickHit', setting: 'surfactantFlow', depth: 0.25 },
        { source: 'bands', feature: 'hats', setting: 'beads', depth: 0.25 },
      ],
      audioMappings: { velocity: 'bass', density: 'bass', color: 'treble', rotation: 'none' },
    }
  },

  // ── Three that could not exist before the liquids did ──────────────
  //
  // Every preset above is a set of numbers describing how the plate behaves.
  // These three are looks where the *liquid on the plate* is the subject, so
  // they lean on the soap, body and repel field rather than on the solver's
  // own tuning. Each is close to something a person can put on a table.
  {
    id: 'milk-marble',
    name: 'Milk Marbling',
    description: 'The kitchen-table experiment: four spots of food colouring sitting still on a dish of milk until a drop of soap sends them running for the rim.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      surfactantFlow: 0.8,
      // The dish does almost nothing on its own. Turbulence, buoyancy, heat
      // and rotation are all near zero, because if the plate is already
      // churning then the soap arriving is just one more thing moving. The
      // entire look is the contrast between a plate that is *dead still* and
      // the half second after the soap lands.
      globalSpeed: 0.0126,
      surge: 0.3,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.45,
      rotationSpeed: 0.0,
      centerGravity: 0.0,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0.00004,      // near-zero: food colouring on milk does not bleed on its own
      buoyancy: 0.05,
      advection: 0.5,
      damping: 0.985,
      heatDecay: 0.995,
      automateRate: 0.07,          // a drop of soap now and then, not a stream of it
      platePressure: 0.1,
      glassSmear: 0.1,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.9,               // the colours stay four colours, not one brown one
      evaporationRate: 0.0015,     // the ground has to last; this is a long, slow dish
      airVelocity: 0.0,
      vibrationFrequency: 0.0,
      audioImpact: 0.3,            // the beat is when a drop lands, not a shove of its own
      turbulenceScale: 0.05,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.7,
      boundaryContrast: 0.55,      // a bright line where a colour front meets the ground
      saturationBoost: 1.5,
      glossiness: 0.05,
      postBlurRadius: 0.1,
      dyeBudget: 1.0,
      edgeRelief: 0.3,
      bubbles: 0.0,
      plateRock: 0.1,
      beatSqueeze: 0.0,
      layerScaleVariety: 0.0,
      hueJourney: 0,               // four food colourings, and they stay those four
      lightPlay: 0.2,
      lampHotspot: 0.35,
      iridescence: 0,
      secondLamp: 0,
      /*
        Fixed dead patch + area cords (PLAN 28i-3, 28i-3b): `treble ->
        airVelocity` at depth 0.02 read nothing because the GPU solver gates
        `airVelocity` below 0.1 to 0 (`LiquidVisualizer.tsx:4257`). Instead,
        the kick touches soap into the top-left food-colouring spot (area 0)
        and the snare draws a marbling paddle through the top-right spot
        (area 1).
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'areaPour', area: 0, depth: 0.45, threshold: 0.35, attack: 0.01, release: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'areaStir', area: 1, depth: 0.45, threshold: 0.35, attack: 0.02, release: 0.35 },
      ],
      audioMappings: { velocity: 'none', density: 'bass', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'soap-film',
    name: 'Soap Film',
    description: 'One sheet of interference colour, torn open again and again: each hole rushes outward, thins to a rim, and curls into filaments before the next one lands.',
    settings: {
      surfactantFlow: 0.6,
      // Thin-film optics over a plate whose only event is the tear. The film
      // has to be thin for the colour to be there at all, which is also what
      // makes it easy to break — so evaporation runs high and the dye budget
      // low, and the soap keeps re-opening what the flow closes.
      globalSpeed: 0.0168,
      surge: 0.5,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.3,
      rotationSpeed: 0.116,      // the dish's motor; was 0.004 with a stir in the middle (PLAN 22j)
      centerGravity: 0.08,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0.00009,
      buoyancy: 0.2,
      advection: 0.6,              // the rush has to actually carry the dye
      damping: 0.982,
      heatDecay: 0.99,
      automateRate: 0.2,           // tears often — this is the one preset that wants soap
      platePressure: 0.2,
      glassSmear: 0.35,
      rainDrip: 0.0,
      viscosity: 'thin',
      polarity: 0.5,
      evaporationRate: 0.006,      // a film that is always thinning is always about to go
      airVelocity: 0.05,
      vibrationFrequency: 0.05,
      audioImpact: 0.5,
      turbulenceScale: 0.3,        // some vorticity, so the fronts curl instead of ringing
      turbulenceDetail: 3,
      blobSurfaceTension: 0.2,
      boundaryContrast: 0.7,       // the rim of a hole is the brightest thing in frame
      saturationBoost: 1.35,
      glossiness: 0.2,
      postBlurRadius: 0.2,
      dyeBudget: 0.5,
      edgeRelief: 0.55,
      bubbles: 0.05,
      plateRock: 0.25,
      beatSqueeze: 0.0,
      layerScaleVariety: 0.0,
      hueJourney: 7,
      lightPlay: 0.6,
      lampMotion: 0.2,
      lampHotspot: 0.45,
      iridescence: 0.6,
      thinFilm: 1.0,
      secondLamp: 0,
      /*
        The soap sheet's own fast patches (PLAN 28i-3b): kicks pull thin spots
        open in the sheet, overall level raises Plateau-border beads along the
        rims, and high harmony swirls the iridescent fringes.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'surfactantFlow', depth: 0.25 },
        { source: 'bands', feature: 'level', setting: 'beads', depth: 0.2 },
        { source: 'bands', feature: 'tonalHigh', setting: 'vorticityConfinement', depth: 0.25 },
      ],
      audioMappings: { velocity: 'mid', density: 'bass', color: 'treble', rotation: 'none' },
    }
  },
  // ── Three that show off a part of the app ────────────────────────
  // The ferrofluid and its magnet, the film stock, and the curved glasses
  // were each built, measured and set by no preset at all, so nobody who
  // only picks looks had ever seen them.
  {
    id: 'oil-and-water',
    name: 'Oil & Water',
    description: 'Amber oil on teal water between two glasses: each keeps its own colour, the oil rounds into bodies, threads break into beads, and bodies that touch merge.',
    settings: {
      globalSpeed: 0.0126,
      advection: 0.45,
      platePressure: 0.5,
      beatSqueeze: 0.0,
      dyeBudget: 0.9,
      oilTension: 0.9,
      // Oil and water as separate bodies, each with its own colour (roadmap §I).
      oilBodies: 1,
      thicknessOptics: 0.6,
      spectralOptics: 0.6,
      ledColor: '#0b1a1a',
      surge: 0.35,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.063,      // the dish's motor; was 0.003 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.2,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.1,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioImpact: 0.5,
      boundaryContrast: 0.3,
      saturationBoost: 1.3,
      glossiness: 0.2,
      postBlurRadius: 0.12,
      lampHotspot: 0.4,
      /*
        Immiscible oil and water between glass (PLAN 28i-3b): kicks push water
        fingers into the amber oil pools, snares shear the meniscus, and the
        bass band rounds the oil bodies back together.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'fingering', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
        { source: 'bands', feature: 'bass', setting: 'oilTension', depth: 0.2 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'red-cabbage',
    name: 'Red Cabbage',
    description: 'Violet red-cabbage dye as a pH indicator: acid dropped in blooms pink, base turns it green, and where the two meet they cancel back to purple.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      globalSpeed: 0.0105,
      advection: 0.4,
      platePressure: 0.35,
      beatSqueeze: 0.0,
      dyeBudget: 0.9,
      phIndicator: 1,
      thicknessOptics: 0.4,
      ledColor: '#f2eefa',
      surge: 0.35,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.038,      // the dish's motor; was 0.003 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.2,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.1,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioImpact: 0.5,
      boundaryContrast: 0.3,
      saturationBoost: 1.3,
      glossiness: 0.2,
      postBlurRadius: 0.12,
      lampHotspot: 0.4,
      /*
        Two pH wells that cancel where they meet (PLAN 25i-2, 28i-3b): the
        snare drops acid into the left well (area 0, blooming pink), the kick
        drops base into the right well (area 1, turning green), and mid
        harmony stirs the two fronts together across the dish.
      */
      sceneMappings: [
        { source: 'hits', feature: 'snareHit', setting: 'areaPour', area: 0, depth: 0.45, threshold: 0.35, attack: 0.01, release: 0.25 },
        { source: 'hits', feature: 'kickHit', setting: 'areaPour', area: 1, depth: 0.45, threshold: 0.35, attack: 0.01, release: 0.25 },
        { source: 'bands', feature: 'tonalMid', setting: 'areaStir', area: 0, depth: 0.35, threshold: 0.35, attack: 0.04, release: 0.35 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'chemical-clock',
    name: 'Chemical Clock',
    description: 'The Belousov-Zhabotinsky reaction in a dish of gel: waves of blue sweep through the red and curl into turning spirals, a clock that keeps its own time.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      globalSpeed: 0.0084,
      advection: 0.3,
      platePressure: 0.2,
      beatSqueeze: 0.0,
      dyeBudget: 0.35,
      bzReaction: 1,
      ledColor: '#fbf6ee',
      surge: 0.35,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.019,      // the dish's motor; was 0.003 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'single',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.2,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.1,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioImpact: 0.5,
      boundaryContrast: 0.3,
      saturationBoost: 1.3,
      glossiness: 0.2,
      postBlurRadius: 0.12,
      lampHotspot: 0.4,
      /*
        The Belousov-Zhabotinsky gel dish (PLAN 28i-3b): kicks push the
        oxidation wave drift outward, snares shear wave tips into spiral
        pairs, and mid harmony deepens the ferroin reaction.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'turingDrift', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.2 },
        { source: 'bands', feature: 'tonalMid', setting: 'chemistry', depth: 0.15 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'magnet-garden',
    name: 'Magnet Garden',
    description: 'Black ferrofluid on a bright golden pool over a field coil, with a magnet under the glass: it fingers into a labyrinth that sharpens on the beat.',
    settings: {
      ferroLabyrinth: 0.8,
      globalSpeed: 0.0105,
      surge: 0.35,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.55,
      rotationSpeed: 0.045,      // the dish's motor; was 0.004 with a stir in the middle (PLAN 22j)
      centerGravity: 0.2,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#1a1408',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.25,
      advection: 0.35,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.1,
      platePressure: 0.3,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.8,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioImpact: 0.5,
      blobSurfaceTension: 0.5,
      boundaryContrast: 0.3,
      /*
        The plate's domes read by the white point on each top against the
        gold water round them. With the dye's depth drawn (Transmission 1,
        the default since PLAN 18l) the thin gold between the domes goes
        pale, as a thin wash of a dye does, and on this plate bright enough
        to rival the points: in npm run spikes 7.8 of the places half a
        pitch off the tops lit against 16 tops, where at 0.5 it is 4.0
        against 16. The ferrofluid looks have their own pass (PLAN 18l-5);
        until then this one keeps the half it had.
      */
      transmission: 0.5,
      saturationBoost: 1.4,
      dyeBudget: 1.0,
      glossiness: 0.2,
      postBlurRadius: 0.15,
      phaseAmount: 0.9,
      phaseScale: 0.3,
      phaseSharp: 0.75,
      magnetStrength: 0.9,
      magnetHeight: 0.3,
      magnetWalk: 0.7,
      beatSqueeze: 0.0,
      lampHotspot: 0.4,
      secondLamp: 0.3,
      /*
        Ferrofluid on the gold pool (PLAN 28i-3b): kicks sharpen the black
        rims against the gold, bass presses the pool outward, and snares twist
        the gold dye between the domes.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'phaseSharp', depth: 0.2 },
        { source: 'bands', feature: 'bass', setting: 'platePressure', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'home-movie',
    name: 'Home Movie',
    description: 'A light show filmed on Super 8 from the back of the hall: warm, soft, grainy, the gate weaving, orange and coral against teal.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      globalSpeed: 0.0105,
      surge: 0.55,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.6,
      rotationSpeed: 0.11,       // the dish's motor; was 0.01 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.4,
      advection: 0.4,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.14,
      platePressure: 0.35,
      glassSmear: 0.3,
      rainDrip: 0.1,
      viscosity: 'thick',
      polarity: 0.75,
      evaporationRate: 0.004,
      airVelocity: 0.04,
      vibrationFrequency: 0.1,
      audioImpact: 0.55,
      blobSurfaceTension: 0.4,
      boundaryContrast: 0.4,
      saturationBoost: 1.4,
      dyeBudget: 0.8,
      postBlurRadius: 0.3,
      stock: 0.85,
      stockType: 3,
      stockGrain: 0.6,
      stockWeave: 1.2,
      stockGate: 0.5,
      lampWarmth: 0.45,
      dishVignette: 0.3,
      hueJourney: 2,
      /*
        The dish filmed from the back of the hall (PLAN 28i-3b): bass warms
        the rising plumes, snares part the soap wash, and the lead note steps
        the cartridge's warm colours sooner.
      */
      sceneMappings: [
        { source: 'bands', feature: 'bass', setting: 'buoyancy', depth: 0.1 },
        { source: 'hits', feature: 'snareHit', setting: 'surfactantFlow', depth: 0.25 },
        { source: 'bands', feature: 'note', setting: 'hueJourney', depth: -0.15 },
      ],
      audioMappings: { velocity: 'bass', density: 'volume', color: 'treble', rotation: 'none' },
    }
  },
  {
    id: 'clock-glass',
    name: 'Clock Glass',
    description: 'Two curved clock glasses with coloured oil and water between them: cells of red, amber and blue oil, each with its dark rim, drift in purple water and gather in the deep middle, and a press spreads them into a thin bright film that creeps back.',
    settings: {
      // On the lamp: a dish that reads there with its own dye (PLAN 18b-1, `npm run lampjudge`).
      lampGround: 1,
      /*
        Oil and water, as a clock-glass dish is (seedPreset's 'clock-glass'):
        the oil rounds into bodies under its own surface tension and each
        keeps its own colour (Oil Bodies), so the dish holds several colours
        side by side instead of blending them into one. Oil & Water's values.
      */
      oilTension: 0.9,
      oilBodies: 1,
      globalSpeed: 0.0126,
      surge: 0.4,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.5,
      rotationSpeed: 0.123,      // the dish's motor; was 0.012 with a stir in the middle (PLAN 22j)
      centerGravity: 0.1,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.2,
      advection: 0.45,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.12,
      platePressure: 0.55,
      glassSmear: 0.25,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.85,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.05,
      audioImpact: 0.55,
      blobSurfaceTension: 0.45,
      boundaryContrast: 0.35,
      saturationBoost: 1.45,
      dyeBudget: 0.5,  // 28a: the purple water stood so deep the lamp barely came through (luma 0.08 on the Mac); 18b-8
      glossiness: 0.25,
      postBlurRadius: 0.15,
      plateCurve: 0.6,
      depthDrag: 1.5,
      plateSpring: 0.35,
      beatSqueeze: 0.0,
      transmission: 0.35,
      dishVignette: 0.8,
      lampHotspot: 0.5,
      /*
        Two bowed clock glasses (PLAN 28i-3b): kicks press the top glass so
        the oil bodies spread thin, snares indent their rims into fingers on
        the release, and mid harmony pulls the red, amber and blue oil bodies
        round again.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'fingering', depth: 0.25 },
        { source: 'bands', feature: 'tonalMid', setting: 'oilTension', depth: 0.2 },
      ],
      audioMappings: { velocity: 'bass', density: 'bass', color: 'treble', rotation: 'none' },
    }
  },
  {
    id: 'splodascope',
    name: 'Splodascope',
    description: 'A crowd of yellow, green, red and pink oil drops packed edge to edge in blue water, lit from below: they press together without merging, some sit inside others, and a kick on the glass breaks a few films so neighbours run together.',
    settings: {
      lampGround: 1,
      /*
        After the owner's photograph of a splodascope (2026-10-25): round
        cells of saturated oil crowded in a blue water, specks to cells a
        fifth of the frame across, a few with another colour inside. Oil
        Bodies keeps each drop's colour its own, and Film Hold is what makes
        it a crowd: the water film between two drops pushes back as it thins
        (FILM_WGSL in wgsl/fluid.ts), so drops that touch stay two. Without
        it the lab's 90 drops ran into 25 in two seconds and 11 in ten, and
        every merge mixed its colours toward brown. The crowd is laid by
        seedPreset's 'splodascope' (src/lib/oilLay.ts).
      */
      oilTension: 0.9,
      oilBodies: 1,
      filmHold: 1,
      globalSpeed: 0.0126,
      surge: 0.3,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.4,
      rotationSpeed: 0.04,       // the dish's motor, slow: the crowd turns and jostles
      centerGravity: 0.05,
      ledPlatform: false,
      ledMode: 'single',
      ledColor: '#000000',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.1,
      advection: 0.45,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.08,
      platePressure: 0.4,
      glassSmear: 0.15,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.85,
      evaporationRate: 0.002,
      airVelocity: 0.02,
      vibrationFrequency: 0.05,
      audioImpact: 0.5,
      blobSurfaceTension: 0.45,
      boundaryContrast: 0.3,
      saturationBoost: 1.3,      // at 1.6 the hot pink read as a second red
      dyeBudget: 0.8,
      glossiness: 0.3,
      postBlurRadius: 0.1,
      plateCurve: 0.45,          // the bowed glass gathers the crowd to the middle, where it packs
      depthDrag: 1.2,
      plateSpring: 0.35,
      beatSqueeze: 0.0,
      transmission: 0.4,
      dishVignette: 0.6,
      lampHotspot: 0.45,
      /*
        Fast readings only (the owner's rule): a kick presses the top glass,
        and a hard one presses past what a film holds, so a few neighbours
        run together on the beat while the rest of the crowd stands; the
        snare shears the crowd a little; and mid harmony rounds the drops.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.3 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.15 },
        { source: 'bands', feature: 'tonalMid', setting: 'oilTension', depth: 0.15 },
      ],
      audioMappings: { velocity: 'bass', density: 'bass', color: 'none', rotation: 'none' },
    }
  },
  /*
    Two looks were made after Chemical Bouillon's ferrofluid films, the references the
    owner gave for how ferrofluid should look (docs/bubbles-plan.md); Ferro Maze
    retired in PLAN 28i-1, into Magnet Garden. Both leaned on the plate drawing the
    ferrofluid as a liquid with an edge (a
    sharp line, black through, the water clear round it; npm run ferrolook).
  */
  {
    id: 'ferro-paint',
    name: 'Ferro Paint',
    description: 'Ferrofluid worked through amber, teal and coral dye under a wandering magnet: black channels and beads between bright cells of colour, wet and glossy, as in Colored I and II.',
    settings: {
      ferroLabyrinth: 0.9,
      globalSpeed: 0.0105,
      surge: 0.5,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.55,
      rotationSpeed: 0.033,      // the dish's motor; was 0.003 with a stir in the middle (PLAN 22j)
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#fff6e6',
      ledSpeed: 0.0,
      diffusionRate: 0,
      buoyancy: 0.25,
      advection: 0.35,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.12,
      platePressure: 0.3,
      glassSmear: 0.2,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.8,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioImpact: 0.5,
      blobSurfaceTension: 0.5,
      boundaryContrast: 0.3,
      saturationBoost: 1.35,
      dyeBudget: 1.0,
      glossiness: 0.5,
      postBlurRadius: 0.12,
      phaseAmount: 0.8,
      phaseScale: 0.3,
      phaseSharp: 0.75,
      // The magnet's field, not its pull (see Ferro Maze): 0.6 gathers
      // as 0.5 did, and stays under the spikes (0.10 of the hand's field).
      magnetStrength: 0.6,
      magnetHeight: 0.3,
      magnetWalk: 0.5,
      // The black pushes the colour aside and packs it along its edges, as in
      // Colored I and II (npm run ferrodye): full, because it is the look.
      phaseDisplace: 1,
      // Poured over the whole plate (PRESET_PHASE_POUR, npm run ferropour),
      // the maze fills it, and this is how fine it fills it: Ferro Maze's
      // value, for the same reasons (npm run maze measures it; on the
      // hosted 512² it is still above the twelve-cell floor).
      mazeDetail: 0.5,
      beatSqueeze: 0.0,
      lampHotspot: 0.3,
      secondLamp: 0.2,
      /*
        Ferrofluid channels through amber, teal and coral (PLAN 28i-3b): kicks
        drive the labyrinth channels finer, snares branch the fingers along
        the seams, and high overtones crisp the black channel walls.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'mazeDetail', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'fingering', depth: 0.25 },
        { source: 'bands', feature: 'tonalHigh', setting: 'phaseSharp', depth: 0.2 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'treble', rotation: 'none' },
    }
  },
  {
    id: 'roy',
    name: 'Roy, 1963',
    description: 'The plate printed as a Lichtenstein panel: flat red, yellow and blue on white, a black line round every shape and where two inks meet, and every pale wash laid as even Ben-Day dots of its own ink.',
    settings: {
      /*
        The print (benDay in wgsl/plate.ts) is the look: it reads each pixel
        as a comic's inks, so what the plate has to supply is what a panel
        is drawn from. Big flat pools of the three primaries, hard edged,
        with thin washes round them for the dots to print, on a white ground.
        Nothing that shades: no gloss, no hot-spot, no second lamp, no
        bubbles or beads, because a print has no light in it.
      */
      // Flat inks: a comic is printed in solid colour, so the depth ramp
      // every other look now draws (Transmission 1, PLAN 18l) is held at the
      // old half, and the print's dots stay the screen's (in npm run benday,
      // 88% of the dots held under a turn at 1, against its 90%).
      transmission: 0.5,
      benDay: 1,
      globalSpeed: 0.0105,
      surge: 0.45,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.7,
      rotationSpeed: 0.0,
      centerGravity: 0.1,
      // The paper: a white light table, as Ferro Maze's.
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#ffffff',
      ledSpeed: 0.0,
      diffusionRate: 0.00004,
      buoyancy: 0.25,
      advection: 0.4,
      damping: 0.982,
      heatDecay: 0.985,
      automateRate: 0.1,
      platePressure: 0.35,
      glassSmear: 0.15,
      rainDrip: 0.0,
      viscosity: 'thick',
      // Two primaries that meet stay two primaries, with a hard seam.
      polarity: 1.0,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.0,
      audioImpact: 0.55,
      turbulenceScale: 0.3,
      turbulenceDetail: 2,
      blobSurfaceTension: 0.6,
      boundaryContrast: 0.0,
      saturationBoost: 1.5,
      colourBody: 0.5,
      /*
        A print is mostly paper. The budget is the mean the regulator lets the
        plate fill to before it evaporates the excess, and at 0.9 Roy could
        fill to eight times the panel it opens with (0.115, npm run royopen),
        where the inks run into each other and three inks over each other
        print black: the opening's stain again, laid by the drops instead of
        the seed. At 0.45 it holds about four times the opening, room for the
        pours and drops to add shapes, and it caps the plate short of one wash.
        Inferred from the regulator and the print, not watched on a live
        plate here (no app frames in a cloud session): docs/judging.md §37.
      */
      dyeBudget: 0.45,
      glossiness: 0.0,
      postBlurRadius: 0.1,
      edgeRelief: 0.0,
      bubbles: 0.0,
      beads: 0,
      cells: 0,
      lacing: 0,
      iridescence: 0,
      lightPlay: 0,
      lampHotspot: 0,
      secondLamp: 0,
      lampWarmth: 0,
      plateRock: 0.4,
      beatSqueeze: 0.0,
      layerScaleVariety: 0,
      // Zoomed in it is still a print: the closeup's paint cells, lacing,
      // domes and ragged silhouette would each be outlined in black.
      macroCells: 0,
      macroLacing: 0,
      macroDepth: 0,
      macroEdgeDetail: 0,
      macroRelief: 0,
      /*
        Flat comic inks in the dish, with no beads or gloss (PLAN 28i-3b):
        kicks press the ink shapes outward into their Ben-Day tint fields,
        snares curl the brushstroke tails, and mid harmony stirs the shapes.
      */
      sceneMappings: [
        { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.25 },
        { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.25 },
        { source: 'bands', feature: 'tonalMid', setting: 'turbulenceScale', depth: 0.2 },
      ],
      audioMappings: { velocity: 'bass', density: 'bass', color: 'none', rotation: 'none' },
    }
  },
  {
    id: 'lava-lamp',
    name: 'Lava Lamp',
    description: 'The plate stood upright over a warm lamp: coloured wax heavier than the liquid round it sinks in mushroom-headed plumes, is warmed where it pools at the bottom, and rises again.',
    settings: {
      /*
        A look for physics that shipped with no look to show it (PLAN.md 28a).
        Stand the plate up (Plate Upright) and gravity acts in it; give the
        dye weight (Dye Weight, solutalBuoyancy) and a band of it over clear
        liquid is a Rayleigh–Taylor instability: it falls in fingers that roll
        up into mushroom heads, the lab's 192² plate after 400 steps showing
        a dozen of them from two rows of drops. The solver keeps a lamp under
        the plate where it leaves the frame (LAMP_HEAT in gpu/fluid.ts), so
        what pools there is warmed, rises, cools and sinks again: the cycle a
        lava lamp runs on, rather than a dish that settles. Heat diffusing
        faster than the dye (doubleDiffusion, as heat does in water) narrows
        the plumes toward salt fingers. Lit from behind like the real lamp.
      */
      plateUpright: 1,
      solutalBuoyancy: 0.6,
      doubleDiffusion: 0.5,
      tiltDirection: 180,
      heatDecay: 0.995,
      lampGround: 1,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#ffe6bf',
      ledSpeed: 0.0,
      globalSpeed: 0.0105,
      surge: 0.3,
      layerCount: 1,
      blendMode: 'screen',
      gooeyEffect: 0.6,
      rotationSpeed: 0,          // a lamp does not turn: down has to stay down the screen
      centerGravity: 0,
      diffusionRate: 0,
      buoyancy: 0.3,
      advection: 0.4,
      damping: 0.988,
      automateRate: 0.06,        // a little new wax now and then; the plumes are the show
      platePressure: 0.1,
      glassSmear: 0.15,
      rainDrip: 0.0,
      viscosity: 'thick',
      polarity: 0.8,
      evaporationRate: 0.004,
      airVelocity: 0.02,
      vibrationFrequency: 0.0,
      audioImpact: 0.35,
      turbulenceScale: 0.2,
      blobSurfaceTension: 0.5,
      boundaryContrast: 0.4,
      saturationBoost: 1.3,
      glossiness: 0.15,
      plateRock: 0.1,
      beatSqueeze: 0.0,
      dyeBudget: 0.6,
      bubbles: 0,
      /*
        The pattern for a look's own patches (28f, the owner: "only use things
        that we can detect quickly and make changes that are appropriate for
        the music"). A lava lamp answers nothing but its lamp, so the music
        reaches it the way the lamp does, through the wax's heat and slowly:
        the bass warms the plumes a little livelier (buoyancy pushes through
        the heat the wax carries, so it answers over seconds, not on the
        kick), and a held chord turns the colours a step sooner. No hits: a
        lamp does not jump on the snare.
      */
      sceneMappings: [
        { source: 'bands', feature: 'bass', setting: 'buoyancy', depth: 0.05 },
        { source: 'bands', feature: 'tonalMid', setting: 'hueJourney', depth: -0.15 },
      ],
      audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
    }
  },
];

/*
  Retired preset palettes, and the one that took each one's place (PLAN.md 28a).

  A built-in look is named by its id everywhere a show is kept: a set list's
  items, a MIDI map's pads, a sequence's stages, a song show's cues, the
  remote's buttons and the `?look=` link. None of those is rewritten when a
  look goes, and each one quietly does nothing when its id is missing: the
  cue sends nothing, the pad is dead, and the plate seeds a random harmony
  because PRESET_CONTRACTS has no dyes for the id. So when the 2026-10-10
  refresh retired the looks that no longer showed anything their name
  promised, each id was mapped here to the look nearest in what it did, and
  every place that turns an id into a look goes through `findPreset`. A
  saved show made last month still plays; it plays the replacement.

  Saved presets ("Your presets", lib/userPresets.ts) never name a built-in
  id: each keeps a full copy of its settings, dyes, pours and liquids, so a
  retired look a person saved keeps looking exactly as it did.
*/
export const RETIRED_PRESETS: Readonly<Record<string, string>> = {
  // Judged on the Mac gallery of 2026-10-10 (PLAN.md 28a):
  // a soft static pink, the same picture as Colorful Cosmos, its nearest look;
  'sunny-side-up': 'colorful-cosmos',
  // green on black, Aurora Borealis's dyes and pace with more splatter;
  'boiling-point': 'aurora-borealis',
  // one flat gradient from blue to magenta, the dish too full to show a shape; Classic's nearest.
  'glycerine-drift': 'classic',
  // Judged again on the Mac gallery of 2026-10-19 (PLAN.md 28i-1):
  // graphite on a white platen, the white-ground fault Turing Print's own reaction pattern now carries;
  'sensual-laboratory': 'turing-print',
  // the same two liquids photographed through a lens pass; Oil & Water draws them in the dish, which is the look;
  'oil-on-water': 'oil-and-water',
  // big round drops over a warm gradient, a photograph that lost its black; Classic is the nearest look;
  'colorful-cosmos': 'classic',
  // a reagent banding through a gel, the picture Chemical Clock's gel reaction already draws;
  'agate': 'chemical-clock',
  // black ferrofluid on a light table, the picture Magnet Garden draws on its gold pool;
  'ferro-maze': 'magnet-garden',
  // a blue dish with the light coming from below, the picture Jellyfish Bloom draws with something in it;
  'deep-ocean': 'jellyfish-bloom',
  // the Fillmore's two plates, whose cool and warm dyes Poster, 1969 draws on one plate;
  'fillmore-1969': 'poster-1969',
  // a dish of fluid that says nothing of its ground, the stained slide Microscopic Chaos draws;
  'timbre-shifter': 'microscopic-chaos',
  // a wheel of oil and silicone that turned the whole frame, which only FRAME_MOVING_LOOKS may; Clock Glass keeps the oil and water between glass.
  'oil-wheel': 'clock-glass',
};

/** A retired id's replacement, followed to the end; any other id unchanged. */
export function livePresetId(id: string): string {
  let at = id;
  // Bounded, so a mistake that maps two ids onto each other cannot hang a cue.
  for (let i = 0; i < 8 && RETIRED_PRESETS[at] !== undefined; i++) at = RETIRED_PRESETS[at];
  return at;
}

/** The built-in look an id names, through a retirement if it was retired. */
export function findPreset(id: string | null | undefined): Preset | undefined {
  if (!id) return undefined;
  const live = livePresetId(id);
  return PRESETS.find(p => p.id === live);
}
