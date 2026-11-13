import type { VisualizerSettings } from './types';

/**
 * Foam Cells (PLAN 47z-5), the first look of the drops' physics (47z) to
 * ship, in a module of its own beside presets.ts because that file is over
 * the size limit (`npm run sizes`) and holds at its ceiling. It joins the
 * house looks where it is listed in PRESETS, after the Splodascope it
 * stands on (Film Hold, Oil Bodies).
 */
export const FOAM_CELLS: { id: string; name: string; description: string; settings: Partial<VisualizerSettings> } = {
  id: 'foam-cells',
  name: 'Foam Cells',
  description: 'Pale oil cells pressed into polygons across the whole plate, rust water in the thin films between them: three films meet at every corner and turn to 120° on their own, and a kick on the glass pops a film so two cells become one and the foam grows coarser.',
  settings: {
    lampGround: 1,
    /*
      PLAN 47z-5, after a macro film of a packed foam (cosmo-packed-foam-cells)
      and the cellular networks in five of Davy Evans' ten Microlab films
      (PLAN 47, 2026-11-13). Not drawn cells (the owner retired those,
      2026-10-29): a packed emulsion laid by seedPreset's 'foam-cells'
      (src/lib/oilLay.ts says why it is pressed and why the cells are the
      size they are), whose polygons, flat films and 120° junctions are the
      oil's tension working on drops with no water to round up in. Film
      Hold keeps the films (FILM_WGSL); Oil Bodies keeps the cells pale and
      the rust in the water.

      A ninth of Splodascope's tension. The cells' pressure (tension over
      size) thins the films, and at the app's 384² a cell is smaller on the
      plate than at the lab's 256², so its pressure higher: at 0.45 the films
      popped one after another until half the cells had merged in four
      seconds, at 0.2 a quarter, at 0.1 four of 39 (lab, 384², npm run
      foam). The junctions still came to 120° in two seconds at 0.1: their
      turning is the same tension against a film's drag, and nothing else
      holds them back. No bowed glass and no motor: a foam fills the dish,
      so there is nothing to gather, and a turning dish shears it apart.
    */
    oilTension: 0.1,
    oilBodies: 1,
    filmHold: 1,
    globalSpeed: 0.0126,
    surge: 0.2,
    layerCount: 1,
    blendMode: 'screen',
    gooeyEffect: 0.4,
    rotationSpeed: 0,
    centerGravity: 0,
    ledPlatform: false,
    ledMode: 'single',
    ledColor: '#000000',
    ledSpeed: 0.0,
    diffusionRate: 0,
    buoyancy: 0.1,
    advection: 0.45,
    damping: 0.985,
    heatDecay: 0.99,
    automateRate: 0.05,
    platePressure: 0.3,
    glassSmear: 0,
    rainDrip: 0.0,
    viscosity: 'thick',
    polarity: 0.85,
    evaporationRate: 0.002,
    airVelocity: 0.02,
    vibrationFrequency: 0.05,
    audioImpact: 0.5,
    blobSurfaceTension: 0.45,
    boundaryContrast: 0.3,
    saturationBoost: 1.2,
    dyeBudget: 0.8,
    glossiness: 0.3,
    postBlurRadius: 0.1,
    plateCurve: 0,
    depthDrag: 1.2,
    plateSpring: 0.35,
    beatSqueeze: 0.0,
    transmission: 0.4,
    dishVignette: 0.3,
    lampHotspot: 0.45,
    /*
      Fast readings only (the owner's rule): a kick presses the top glass,
      and a hard one presses a film past what it holds, so two cells run
      into one on the beat (the foam coarsens, as a real one does when its
      films pop); the snare shears it a little.
    */
    sceneMappings: [
      { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.35 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.1 },
    ],
    audioMappings: { velocity: 'bass', density: 'bass', color: 'none', rotation: 'none' },
  }
};
