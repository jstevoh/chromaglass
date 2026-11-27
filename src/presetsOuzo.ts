import type { Preset } from './presets';

/**
 * Louche (PLAN 48s), the look made for the Ouzo bottle's cloud, in a module
 * of its own beside presets.ts because that file is over the size limit
 * (`npm run sizes`) and holds at its ceiling. presetsLay.ts sets it among
 * the house looks after Night Sea, before the music's cords are laid on every
 * look, so it gains them as every look does.
 *
 * Why there is a look at all. The bottle shipped first on its own, off in
 * every look, and `npm run plate` went red on the pull request: "every
 * liquid with physics in it is used by some preset — ouzo". The check is
 * right. A bottle that no look pours is one the automation never reaches,
 * so nobody who presses Go ever sees what it does; putting Ouzo into an
 * existing look's dish would have changed that look, which the plan's 48s
 * rules out (off in every look that was there). So the cloud has a look of
 * its own, and the looks that were there are as they were.
 *
 * What it is. The louche is the bartender's word for what anise spirit does
 * under water: clear in the bottle, opal white in the glass. The oil of
 * anise is dissolved in the alcohol, water takes the alcohol's hold away,
 * and the oil comes out everywhere at once as micron droplets (lib/ouzo.ts
 * has the measured solubility curve and the droplets' scattering). The look
 * is a dark dish of nearly clear water, the lamp off, so the droplets'
 * white is the brightest thing on the glass and reads as it does in a glass
 * held against a dark room: by the light it scatters back.
 *
 * The dish (presetPlate.ts PRESET_LIQUIDS) is water, Ouzo and Alcohol, one
 * of them with each of the automation's drops, so the three things the
 * curve does all happen on the glass. Worked from it for a drop at the
 * automation's dose (AUTO_DOSE, 0.35 of a column at the middle of its disc):
 *
 *   Ouzo into water. The column there is then a quarter Ouzo: 19% alcohol
 *   and 0.78% oil, and that much alcohol holds 0.035%. So 96% of the oil is
 *   out as droplets, a reduced scattering of 1.6 per millimetre: a dense
 *   white bloom the shape of the drop, at once, as in the glass.
 *   Alcohol onto a bloom. 40% alcohol, which holds 0.24% of the 0.58% oil
 *   left there: the droplets are halved and the bloom thins. A second drop
 *   takes it to 56%, which holds 1.3%, and the bloom is a clear window.
 *   Water onto a bloom. It dilutes the oil and the alcohol alike; the
 *   droplets stay (water holds 0.008%) and are carried where the drop
 *   pushes them, so the bloom opens into a ring.
 *
 * Nothing is seeded or timed: each cell is white exactly as far as its own
 * water and alcohol leave its oil undissolved. Measured in the lab on the
 * solver (a scratch script, not a check: 90 drops at the automation's dose,
 * two steps apart, at seeded places): with these three bottles 26% of the
 * dish holds droplets and the dish as a whole is 6% alcohol, so there is
 * clear water for the next drop to bloom in for a long show; with water
 * and Ouzo alone it is 37% and nothing ever clears.
 * On this look's own settings a bloom's middle reads 228 of 255 against a
 * ground of 0, 208 after one drop of Alcohol and 0 after two.
 *
 * The music reaches it the way a hand would: the kick presses the top glass
 * (platePressure, as Night Sea's and Foam Cells' kick does), which pushes
 * the liquid out sideways and folds clear into cloudy, and the snare
 * tightens the swirls (vorticityConfinement), which draws the fronts out
 * into filaments where the cloud forms and clears along them.
 *
 * Every other number is a dark, slow plate, as Night Sea's is: no beads and
 * no bubbles (the owner, 2026-11-26: too many bubbles in the looks), a low
 * dye budget of deep blues so the white has something to lie over without
 * being tinted by it, and thin water's viscosity, which the dish, nine
 * tenths water, has.
 */
export const LOUCHE: Preset = {
  id: 'louche',
  name: 'Louche',
  description: 'A dark dish of water under a dropper of clear anise spirit: each drop blooms opal white the moment the water reaches it, a drop of alcohol on a bloom thins it, and a second opens a clear window.',
  settings: {
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
    automateRate: 0.12,
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
    sceneMappings: [
      { source: 'hits', feature: 'kickHit', setting: 'platePressure', depth: 0.3 },
      { source: 'hits', feature: 'snareHit', setting: 'vorticityConfinement', depth: 0.15 },
    ],
    audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' },
  },
};

/** Set Louche among the house looks, after Night Sea (or at the end, if that look is gone). */
export function layOuzoLooks(looks: Preset[]): void {
  if (looks.some(p => p.id === LOUCHE.id)) return;
  const at = looks.findIndex(p => p.id === 'night-sea');
  looks.splice(at < 0 ? looks.length : at + 1, 0, LOUCHE);
}
