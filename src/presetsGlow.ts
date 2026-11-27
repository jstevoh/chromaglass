import type { Preset } from './presets';
import { shakeCord } from './lib/shakeCord';

/**
 * Night Sea (PLAN 48c-5), the look made for the water's glow, in a module of
 * its own beside presets.ts because that file is over the size limit
 * (`npm run sizes`) and holds at its ceiling. presetsLay.ts sets it among
 * the house looks after Foam Cells, before the music's cords are laid on
 * every look, so it gains them as every look does.
 *
 * What was asked (the owner, 2026-11-22, and the plan's 48c-5): the glow is
 * the one thing on the plate that makes its own light, every look shipped
 * with it off, and a look of dark water with the music lighting it would
 * show it on Go. So: dark water and a little dye, the lamp off, the water
 * full of dinoflagellates, and two real ways for the music to reach them.
 *
 *   1. The dish sits on a speaker (Shaker at 30 Hz, Shake at 0.03 g, a third
 *      of the water's threshold, so the water is still while the bass is
 *      quiet; nearer the threshold the drive props up a dying wave, which
 *      then rings on for five seconds after the note, at 0.7 of it),
 *      and the music's bass shakes it (Music Shake, the cord on Shake,
 *      lib/shakeCord.ts). A strong bass note takes the dish past the
 *      threshold (0.084 g at 30 Hz, lib/faraday.ts), a lattice of standing
 *      waves 14 mm across stands up over a second or two (it grows at the
 *      Mathieu rate, about 2 per second at 0.3 g, and rings down at about
 *      0.6 per second between notes, so a bass line keeps it seeded and each
 *      strong note swells what the last left), and the waves' strain
 *      fires the cells under them (PLAN 48c-6, wgsl/glow.ts): the sea lights
 *      in the lattice's pattern on the bass and goes dark as the note dies.
 *      A long bass line tires it (the cells spend their store and take
 *      Glow Recharge's seconds to refill), so the light is brightest on the
 *      first notes after a quiet passage, as a real bloom is.
 *   2. The kick presses the top glass (platePressure, as Foam Cells' kick
 *      does): the squeezed gap pushes the water out sideways between two
 *      glasses, and that flow's Poiseuille shear on the glass fires the
 *      cells in a ring round the press, a flash on each hit; the snare
 *      tightens the water's swirls (vorticityConfinement, as Foam Cells'
 *      snare does), whose shear lights their rims.
 *
 * Every other number is a dark, slow plate: no beads and no bubbles (the
 * owner, 2026-11-26: too many bubbles in the looks), a low dye budget so
 * most of the glass is clear black water, thin water's viscosity (the
 * glow's threshold is a shear rate at seawater's, PLAN 48c-2). Glow Shear at
 * 20 per second is 0.02 Pa in seawater, the low end of what Latz, Case and
 * Gran (1994) measured for Lingulodinium: a rich bloom, quick to light.
 */
export const NIGHT_SEA: Preset = {
  id: 'night-sea',
  name: 'Night Sea',
  description: 'Dark water full of plankton on a speaker: the bass stands the water up in a lattice of waves that glows blue where it strains the sea, each kick flashes a ring round the pressed glass, and the light tires on a long bass line and comes back after the quiet.',
  settings: {
    glow: 1.4,
    glowShear: 20,
    glowRecharge: 6,
    faradayHz: 30,
    faraday: 0.03,
    globalSpeed: 0.0126,
    surge: 0.3,
    layerCount: 1,
    blendMode: 'screen',
    gooeyEffect: 0.3,
    rotationSpeed: 0,
    centerGravity: 0,
    ledPlatform: false,
    ledMode: 'single',
    ledColor: '#000000',
    ledSpeed: 0.0,
    lampGround: 0,
    dyeBudget: 0.25,
    bubbles: 0,
    beads: 0,
    diffusionRate: 0.00005,
    buoyancy: 0.2,
    advection: 0.4,
    damping: 0.99,
    heatDecay: 0.995,
    automateRate: 0.08,
    platePressure: 0.2,
    glassSmear: 0,
    rainDrip: 0,
    viscosity: 'thin',
    polarity: 0.5,
    evaporationRate: 0.002,
    airVelocity: 0.02,
    vibrationFrequency: 0.05,
    audioImpact: 0.6,
    boundaryContrast: 0.3,
    saturationBoost: 1.1,
    transmission: 0.4,
    dishVignette: 0.4,
    /*
      Music Shake at 0.15: under the sound's master depth at 1, a bass reading
      of 0.8 shakes the dish at 0.03 + 0.8 × 0.15 × 2 g = 0.27 g, three times
      the threshold, where the lattice settles steep enough (k u about 0.19)
      to strain the water at about 44 per second; a quiet bass (0.2) shakes
      it at 0.09 g, just over the threshold, where the lattice barely grows
      and stands shallow (k u about 0.035, strain about 8 per second): dark.
    */
    sceneMappings: [
      shakeCord(0.15),
      { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.3 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.15 },
    ],
    audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
  },
};

/** Set Night Sea among the house looks, after Foam Cells (or at the end, if that look is gone). */
export function layGlowLooks(looks: Preset[]): void {
  if (looks.some(p => p.id === NIGHT_SEA.id)) return;
  const at = looks.findIndex(p => p.id === 'foam-cells');
  looks.splice(at < 0 ? looks.length : at + 1, 0, NIGHT_SEA);
}
