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
 * The dish (presetPlate.ts PRESET_LIQUIDS) is Ouzo twice, water and
 * Alcohol, one of them with each of the automation's drops, so half the
 * drops are cloud and the three things the curve does all happen on the
 * glass. Worked from it for a drop at the automation's dose (AUTO_DOSE,
 * 0.35 of a column at the middle of its disc), with the bottle at 1% oil:
 *
 *   Ouzo into water. The column there is then a third Ouzo: 26% alcohol
 *   and 0.35% oil, and that much alcohol holds 0.06%. So 83% of the oil is
 *   out as droplets, a reduced scattering of 0.6 per millimetre: a bloom
 *   the shape of the drop, at once, as in the glass, and thin enough over
 *   the dish's 2 mm that what lies under it shows through.
 *   Alcohol onto a bloom. More alcohol there, and the solubility climbs
 *   steeply with it: the bloom thins, and a second drop clears a window.
 *   Water onto a bloom. It dilutes the oil and the alcohol alike; the
 *   droplets stay (water holds 0.008%) and are carried where the drop
 *   pushes them, so the bloom opens into a ring.
 *
 * Nothing is seeded or timed: each cell is white exactly as far as its own
 * water and alcohol leave its oil undissolved (`npm run ouzo` holds it).
 *
 * Retuned so the cloud leads (PLAN 48s-6, 2026-11-27). The first film of the
 * look on the owner's Mac showed dye over 40 to 60% of the dish and the
 * white arriving after twenty seconds as one or two flat lumps, a tenth of
 * the frame. Three causes, each measured or read:
 *  - The dye was the five wide pools every look without a seed of its own
 *    opens on, and the automation holds the dye at what the seed laid; the
 *    seed is now three small drops (presetPlate.ts plainSeed).
 *  - The cloud came only with the automation's own drops, about one in
 *    eleven seconds at a rate of 0.12 with nothing playing, a quarter of
 *    them a breath and two thirds of the rest not Ouzo: one cloud in about
 *    forty-five seconds. The dose the look lays when it opens does not reach a solver
 *    that is not there yet when the look is the page's first (PLAN 27f-9o),
 *    so on an opened page those drops were all there was. Evolve is now
 *    0.36, three times as often, and half the drops are Ouzo: a cloud every
 *    ten seconds with nothing playing and every five with music, anywhere
 *    on the dish.
 *  - The white was paint: at the extract's 3% a drop a tenth of the column
 *    read 198 of 255 and every bigger one 210 to 240, one flat white. The
 *    bottle is now 1% (bottles.ts says why that is still a real spirit) and
 *    its drop half as wide again, so a drop reads 130 to 150, a laid dose
 *    about 205, and a strong pour keeps a clear middle in a white ring.
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
 * being tinted by it, and thin water's viscosity, which the dish, mostly
 * water, has.
 */
export const LOUCHE: Preset = {
  id: 'louche',
  name: 'Louche',
  description: 'A dark dish of water under a dropper of clear anise spirit: drop after drop blooms a thin opal white the moment the water reaches it, a drop of alcohol on a bloom thins it, and a second opens a clear window.',
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
    automateRate: 0.36,
    platePressure: 0.2,
    glassSmear: 0,
    rainDrip: 0,
    viscosity: 'thin',
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
