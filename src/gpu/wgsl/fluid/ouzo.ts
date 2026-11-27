/**
 * The ouzo effect's two kernels (PLAN 48s): the oil a cell's water and
 * alcohol cannot hold comes out as droplets, and the droplets' scattering
 * joins the poured liquids' for the plate.
 *
 * The physics, the measured solubility curve and the droplets' scattering
 * are written out in `src/lib/ouzo.ts`, which holds the numbers both kernels
 * are built from and the same rule in TypeScript (`ouzoDrops`).
 *
 * The solvent field (src/gpu/fluid/core.ts, `solvent`) is laid by the
 * species' own pour (`speciesSplat`, which is why its first number is a
 * share it has no use for) and moved by the species' own carry
 * (`bodyAdvectSub`), so its four numbers are amounts that the carry keeps:
 *
 *   r  the share of the column poured from a bottle that holds ethanol
 *   g  ethanol
 *   b  anise oil, dissolved
 *   a  anise oil, out of solution as droplets
 */

import { HEAD, W } from './shared';
import { DISH_GAP_RANGE, DISH_REST_GAP } from '../../../lib/turntable';
import { OUZO_BINODAL, OUZO_SCATTER } from '../../../lib/ouzo';

export const OUZO_KERNELS: Record<string, string> = {
  /*
    The phase change, once a step, after the carry has moved both kinds of
    oil. A cell's oil is the two together, b + a, and that sum is all the
    kernel may not change. Its solvent is the rest of the column (the gap's
    own height there, as the pour counted it, less the oil), the ethanol's
    share of that solvent places the cell on the measured binodal, and the
    binodal says how much oil that solvent holds. What is over it is droplets
    and the rest dissolved: so water mixed into a clear pool brings droplets
    out along the front and nowhere else, alcohol poured on a cloud dissolves
    it, and a cloud carried into fresh water thins until the water holds it
    all (a very dilute ouzo is clear again). At equilibrium every step, with
    no rate: micron droplets come and go in milliseconds, far inside a step.

    Past the open rim the liquid has left the dish and the field is emptied
    with it, as the species' is (pastOpenRim, speciesSplat's rim).
  */
  ouzoCloud: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (pastOpenRim(p)) {
    textureStore(dst, p, vec4f(0.0));
    return;
  }
  let was = max(textureLoad(src, p, 0), vec4f(0.0));
  let tall = max(textureLoad(sq, p, 0).r, ${DISH_GAP_RANGE[0]}) / ${DISH_REST_GAP};
  let oil = was.b + was.a;
  let solvent = max(tall - oil, 1e-6);
  let f = clamp(was.g / solvent, 0.0, 1.0);
  let holds = solvent * exp(${OUZO_BINODAL[0].toFixed(2)} + f * (${OUZO_BINODAL[1].toFixed(2)} + ${OUZO_BINODAL[2].toFixed(2)} * f));
  let drops = max(oil - holds, 0.0);
  textureStore(dst, p, vec4f(was.r, was.g, oil - drops, drops));
}`,

  /*
    What the plate is handed in the species' place while there is ouzo on it:
    the species as it is, with the droplets' reduced scattering added to the
    channel milk's rides in (b, μs′ in 1/mm weighted by the share, PLAN 18j).
    The plate draws a cloud of anise oil as it draws a pool of milk, by the
    same Kubelka-Munk and two-flux terms, and is not told which it is. A
    texture of its own, because the species' b is an amount the carry moves:
    the droplets' scattering written into it would be carried on and counted
    again the next step.
  */
  ouzoView: `${HEAD}
@group(0) @binding(2) var species: texture_2d<f32>;
@group(0) @binding(3) var solvent: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let sp = textureLoad(species, p, 0);
  let drops = max(textureLoad(solvent, p, 0).a, 0.0);
  textureStore(dst, p, vec4f(sp.rg, sp.b + ${OUZO_SCATTER.toFixed(1)} * drops, sp.a));
}`,
};
