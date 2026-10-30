/**
 * The reactions in their gels: the BZ reaction, Liesegang rings and the
 * Gray–Scott print: their grids, a reagent poured, and what they lay down.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';

export const REACTION_KERNELS: Record<string, string> = {
  /*
    The reactions run in a gel, on grids of their own (256² for BZ, 128² for
    Liesegang): a gel does not flow, and reaction-diffusion patterns are
    counted in cells, so on the solver's grid they would come out a
    different size at every resolution and need hundreds of steps a frame on
    the big ones. A pour into one: A.a = (x, y, radius, grid size), A.b =
    what to add.
  */
  gridSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.a.w;
  if (id.x >= u32(g) || id.y >= u32(g)) { return; }
  let p = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / g;
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let f = select(0.0, 1.0, d < 1.0);
  // Up to 8: an outer electrolyte is poured far stronger than the inner one it meets.
  textureStore(dst, p, clamp(textureLoad(src, p, 0) + A.b * f, vec4f(0.0), vec4f(8.0)));
}`,

  /*
    One small step of the Belousov–Zhabotinsky reaction, the two-variable
    Oregonator (Tyson & Fife):
      ∂u/∂t = (u − u² − f v (u − q)/(u + q)) / ε + D ∇²u
      ∂v/∂t = u − v
    with ε = 0.05, q = 0.002, f = 1.4: an excitable medium. A disturbance
    sends out a wave that cannot pass through its own wake, so a broken wave
    front curls into a spiral, the patterns a dish of BZ is famous for.
    u is the activator (HBrO₂), v the oxidised catalyst (ferroin's blue).

    A.a.x = the step, A.a.z = the grid, A.a.w = D for u, in cells² per unit
    time.
  */
  rxnStep: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn r4(p: vec2i, n: f32) -> vec4f { return textureLoad(src, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = A.a.z;
  if (id.x >= u32(n) || id.y >= u32(n)) { return; }
  let p = vec2i(id.xy);
  let m = r4(p, n);
  let lap = r4(p + vec2i(1, 0), n) + r4(p - vec2i(1, 0), n) + r4(p + vec2i(0, 1), n) + r4(p - vec2i(0, 1), n) - 4.0 * m;
  let dt = A.a.x;
  let u = m.r;
  let v = m.g;
  let eps = 0.05;
  let q = 0.002;
  let f = 1.4;
  let du = (u - u * u - f * v * (u - q) / (u + q)) / eps + A.a.w * lap.r;
  let dv = u - v;
  textureStore(dst, p, vec4f(clamp(u + dt * du, 0.0, 1.0), clamp(v + dt * dv, 0.0, 1.0), m.b, m.a));
}`,

  /*
    Liesegang rings: the Keller–Rubinow model, with Ostwald's
    supersaturation.

      A  the outer electrolyte, poured at a spot and diffusing out
      B  the inner electrolyte, spread evenly through the plate
      C  their product, dissolved: A + B → C at rate k A B
      P  C come out of solution as a solid, which does not move

    C precipitates only once it passes a high threshold (nucleation), or a
    much lower one next to precipitate already there (growth on it). A band
    therefore forms at the front, then eats the C and, through it, the A and
    B around it, and the front has to travel on before the next nucleates:
    the bands come out spaced ever wider (the Jablczynski law), which is the
    whole signature of the thing and is not drawn anywhere.

    A.a.x = the step, A.a.z = the grid.
  */
  liesStep: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn l4(p: vec2i, n: f32) -> vec4f { return textureLoad(src, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = A.a.z;
  if (id.x >= u32(n) || id.y >= u32(n)) { return; }
  let p = vec2i(id.xy);
  let m = l4(p, n);
  let lap = l4(p + vec2i(1, 0), n) + l4(p - vec2i(1, 0), n) + l4(p + vec2i(0, 1), n) + l4(p - vec2i(0, 1), n) - 4.0 * m;
  let dt = A.a.x;
  let react = 4.0 * m.r * m.g;
  var a = m.r + dt * (6.0 * lap.r - react);
  var b = m.g + dt * (6.0 * lap.g - react);
  var c = m.b + dt * (0.5 * lap.b + react);
  // Growth only on precipitate already in this cell: letting it grow onto
  // a neighbour made the band creep outward a cell at a time instead of
  // starving the gap ahead of it, and one solid disc came out, not rings.
  var g = 0.0;
  if (c > 0.12) { g = 5.0 * (c - 0.02); }
  else if (m.a > 0.01 && c > 0.02) { g = 5.0 * (c - 0.02); }
  let dp = min(dt * g, max(c, 0.0));
  c = c - dp;
  textureStore(dst, p, vec4f(max(a, 0.0), max(b, 0.0), max(c, 0.0), min(m.a + dp, 4.0)));
}`,

    addReagent: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  var c = textureLoad(src, p, 0);
  let d = distance(uv, A.a.xy);
  if (d <= A.a.z) {
    let f = 0.5 + 0.5 * (1.0 - d / A.a.z);
    c.b = min(1.0, c.b + A.a.w * f);
    // A.b.x is the pattern value to bake in. Blend it based on amount.
    if (c.b > 0.0) {
      c.a = mix(c.a, A.b.x, A.a.w * f / c.b);
    }
    /*
      The poured liquid is the substrate solution, so it brings u with it,
      and a trace of the autocatalyst at its heart, the speck every real
      Turing dish starts from: u = 1, v = 0 is a steady state that never
      breaks by itself, and before this a pour on a look without Chemistry
      grew nothing until a random seed happened to land in it.
    */
    c.r = max(c.r, min(1.0, f * 1.5));
    c.g = max(c.g, 0.5 * max(0.0, 1.0 - d / (0.35 * A.a.z)));
  }
  textureStore(dst, p, c);
}`,

  seedChem: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = textureLoad(src, p, 0);
  let uv = uvOf(id);
  let d = distance(uv, A.a.xy);
  var un = c.r;
  var vn = c.g;
  if (d <= A.a.z) {
    vn = max(vn, 0.5 + 0.5 * (1.0 - d / A.a.z));
    un = min(un, 0.5);
  }
  // The reagent (b) and the pattern baked into it (a) are the liquid's, not
  // the seed's: a seed wrote zeros there across the whole plate, so every
  // seed, which the show lays at random every few seconds, wiped every pour
  // of Turing Reagent and the reaction starved.
  textureStore(dst, p, vec4f(un, vn, c.b, c.a));
}`,

  grayScott: `${HEAD}
const DRIFT_FEED = 0.02;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (p.x == 0 || p.x == i32(S.n) - 1 || p.y == 0 || p.y == i32(S.n) - 1) {
    textureStore(dst, p, vec4f(1.0, 0.0, 0.0, 0.0));
    return;
  }
  let c = textureLoad(src, p, 0);
  let l = textureLoad(src, p - vec2i(1, 0), 0)
        + textureLoad(src, p + vec2i(1, 0), 0)
        + textureLoad(src, p - vec2i(0, 1), 0)
        + textureLoad(src, p + vec2i(0, 1), 0)
        - 4.0 * c;
  let uvv = c.r * c.g * c.g;
  /*
    Where the feed comes from. Gray–Scott's u is a substrate topped up from a
    reservoir at rate F; with no reservoir it is used up and nothing grows.
    The reservoir is the reagent: b, where Turing Reagent was poured, and
    A.b.x everywhere, the bath a look with Chemistry on stands its plate in
    (Boyle's platen, wet with the reagents before anything is drawn). Before,
    only b counted, so the looks with Chemistry on, which pour no reagent,
    fed nothing and grew nothing (the lab: 3.6 units of dye over two seconds
    of Sensual Laboratory, an empty plate).

    The pattern is the poured reagent's own (a, baked in by addReagent) in
    proportion to its share of the reservoir, and the look's (A.a.z and A.a.w,
    its Pattern knob's feed and kill) for the rest.
  */
  let reagent = max(c.b, A.b.x);
  let own = c.b / max(reagent, 1e-4);
  var target_feed = mix(A.a.z, 0.03 + c.a * 0.01, own);
  var target_kill = mix(A.a.w, 0.055 + c.a * 0.005, own);
  /*
    The map drifts (PLAN 26d-6). With one feed and kill the plate settles into
    a stationary maze, because Gray–Scott at fixed parameters has a steady
    stripe state; a real dish keeps changing because its chemistry does (the
    reservoir's flow, the lamp, the temperature). Here F varies across the
    plate and in time as three slow plane waves (periods of 40, 65 and 90
    seconds, A.b.w the show's seconds on the reaction's clock), so each
    region's stripes are fed a little more or less than the next one's and
    keep rearranging, instead of settling. A.b.z is how far (0 is the fixed
    map, today's look). Measured in the lab (npm run turing, line 9) on a
    maze settled for 9000 units and run 9000 more (fifty seconds of a show at
    the app's 180 units a second, Drift brought up at the app's own slew, see
    below), it correlates 0.901 with its settled self at 0, 0.641 at 0.7 and
    0.591 at 1 (the same ramp through the shader before the regime glide
    below gave 0.867 and 0.814), with the stripe wavelength within 1.5% of
    the control's at all three. DRIFT_FEED is 0.02 because 0.012 moved it too
    gently.

    k is no longer the base k moved along the curve; it is the curve plus a
    margin. The reaction's non-trivial state vanishes at k = sqrt(F)/2 - F
    (the saddle-node, where 4(F+k)^2 = F), and below that curve the plate is
    flat grey. The shipped point (F 0.04, k 0.06) sits exactly on it, so the
    old form (base k plus the curve's own excursion) dipped under it in some
    regions at some times, and the owner saw a soft grey patch at Drift 1.
    Now d = k - curve(F) is chosen, always above zero. Measured in the lab
    (256^2, 6000 units, 60 seeds): d near 0 is a labyrinth, +0.002 broken
    stripes, +0.004 mixed, +0.005 spots at F 0.035, and the d that still
    holds a pattern shrinks as F rises (spots to 0.006 at F 0.03, 0.004 at
    0.04, 0.002 at 0.05, under 0.002 at 0.06). A step between regimes
    collapses the plate (stripes to nearly empty, then slow regrowth as
    spots); the same move made over about 33 s is smooth, which is why the
    second map below runs on slow waves. The same holds for Drift itself:
    handed to a settled print in one step, full amplitude starves a 32-pixel
    tile where the feed falls (mean 0, contrast 0) for about 3500 units, 20 s,
    so the app slews the Drift it hands here at 0.025 a second
    (TURING_DRIFT_PER_SECOND in LiquidVisualizer.tsx) and the lab check
    ramps the same way, by solver iterations (TURING_ITERATIONS_PER_SECOND).
    Over six reads the flattest 32-pixel tile, looked for every 16 pixels so
    a patch off the tile grid cannot hide between tiles, keeps 0.93 of the
    control's contrast at Drift 0.7 and 0.77 at 1 (the whole-tile grid read
    0.95 and 0.89, and 0.81 and 0.74 for the shader before the glide), and 0.55 to 0.58 of the
    cells carry activator (0.706 for held stripes, 0.483 for held spots).

    Shortcuts, named: the maps are plane waves, not a true noise field, so
    the regions are broad diagonal bands that slide and never a patchwork;
    the cap on d is a straight line through the sweep above, not Pearson's
    full regime boundaries; k ignores the look's own k while the drift is on
    (only the feed is the look's), so a look's Pattern knob moves feed but
    not the regime; the clock is fixed-rate, on purpose: it follows no
    music; and every number is the lab's (SwiftShader rounds half floats to
    nearest, Metal toward zero), none yet measured on Metal.
  */
  if (A.b.z > 0.0) {
    let q = vec2f(p) / f32(S.n);
    let w = sin(6.2832 * (0.9 * q.x + 0.4 * q.y) + 0.157 * A.b.w)
          + sin(6.2832 * (-0.5 * q.x + 1.1 * q.y) + 0.097 * A.b.w + 2.1)
          + sin(6.2832 * (0.3 * q.x - 0.8 * q.y) + 0.070 * A.b.w + 4.2);
    let df = A.b.z * DRIFT_FEED * clamp(w * 0.5, -1.0, 1.0);
    let f0 = max(target_feed, 0.002);
    let f1 = clamp(f0 + df, 0.002, 0.09);
    /*
      A second map, of how far above the curve k sits, glides each region
      between stripes and spots (PLAN 26d-6a). Three more plane waves, on
      other directions and slower clocks (periods of 50, 80 and 120 s), give
      r from 0 (stripes) to 1 (spots); A.b.z is how much of that range the
      plate uses.
    */
    let wr = sin(6.2832 * (0.6 * q.x - 0.7 * q.y) + 0.126 * A.b.w + 1.3)
           + sin(6.2832 * (-0.4 * q.x - 0.9 * q.y) + 0.079 * A.b.w + 3.7)
           + sin(6.2832 * (1.0 * q.x + 0.2 * q.y) + 0.052 * A.b.w + 5.5);
    let r = clamp(0.5 + A.b.z * clamp(wr * 0.5, -1.0, 1.0), 0.0, 1.0);
    // How far above the saddle-node the pattern survives, narrowing as F
    // rises (the lab's sweep, 256^2, 6000 units, grown from 60 seeds: spots
    // at F 0.03 to d 0.006, at 0.04 to 0.004, at 0.05 to 0.002, and none at
    // 0.06 past 0.001). The straight line through those is the cap, and the
    // regime moves between a quarter of it (stripes, so the labyrinth is
    // never at the curve's edge) and nine tenths of it (spots).
    let cap = max(0.0105 - 0.15 * f1, 0.0008);
    let above = cap * mix(0.25, 0.9, r);
    target_kill = 0.5 * sqrt(f1) - f1 + above;
    target_feed = f1;
  }
  /*
    The supply saturates at a third of full reagent. Scaling F and k straight
    with the reagent put a tap of it (0.3 to 0.6 where it lands) at F 0.018,
    k 0.058, which is Pearson's dead region: the seed died where it was
    poured (the lab, five pours on a look without Chemistry: one faint blot).
  */
  let supply = min(1.0, reagent / 0.3);
  let feed = target_feed * supply;
  let kill = mix(0.06, target_kill, supply);

  // A.b.y is the substep's share of a unit of time (stepChemistry, and why).
  let dt = A.b.y;
  let un = c.r + dt * (A.a.x * l.r - uvv + feed * (1.0 - c.r));
  let vn = c.g + dt * (A.a.y * l.g + uvv - (feed + kill) * c.g);
  textureStore(dst, p, vec4f(clamp(un, 0.0, 1.0), clamp(vn, 0.0, 1.0), c.b, c.a));
}`,

  /**
   * Dye laid down by the reaction (`WebGPUFluid.depositChemistry`), absorption
   * in rgb and density in a, the way `addDensity` lays it.
   *
   * The field is on the dye's own grid (stepChemistry's PingPong is N²) and
   * is read texel for texel. It was read bilinearly as if it were on the
   * logical 192² grid, which it was when the reaction ran on the CPU: on
   * 256² the deposit drew the field's top-left 192² stretched over the whole
   * plate, on 512² its top-left 37%, so every pattern was printed 1.3 to 2.7
   * times its size, and not where its reagent was poured.
   *
   * A.a = (amount, threshold, print, bath), A.b.rgb = the colour's
   * absorbance (lib/dye.ts).
   *
   * Print 0: above the threshold the activator deposits A.a.x a frame and
   * the flow carries it off, the coral looks' bench.
   *
   * Print above 0: the colour is starch's complex with the activator, as in
   * a CIMA dish, where starch is what makes the pattern visible (and, by
   * holding the activator back, what lets a Turing pattern form at all:
   * Lengyel and Epstein, 1991). The complex forms and comes apart in well
   * under a frame, so the dye is set to its equilibrium with the field as
   * it is now: nothing accumulates and nothing trails. Iodine binds into
   * the amylose helix cooperatively, so the colour switches on over a
   * narrow band of the activator, the Hill curve below; its steepness puts
   * the switch inside a cell or two of a stripe's flank, where the plate's
   * bicubic reconstruction draws it as a sharp, smooth edge at the
   * screen's resolution rather than the grid's. Where the reaction is fed
   * (the bath, or poured reagent) the liquid is the indicator's, and the
   * print is laid over the dye in proportion to the feed and to Turing
   * Print; elsewhere the dye is as it is.
   *
   * It is laid over, not in place: it replaced the dye on every fed cell,
   * so a liquid poured on the plate was gone the frame it landed (PLAN
   * 26d-3, the owner's "the coloured liquids don't work"). Absorbance adds
   * (lib/dye.ts), so a red liquid under the print is red where the print is
   * clear and black-red where it is not, as it would be in a stained dish.
   * The print goes to its own texture, never to the dye: written into the
   * dye each frame it would pile up, and the flow would carry it.
   */
  depositChem: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var chem: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
const PRINT_K = 0.2;
const PRINT_HILL = 6.0;
const PRINT_DENSITY = 1.6;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  var d = textureLoad(dye, p, 0);
  let c = textureLoad(chem, p, 0);
  let a = c.g;
  if (A.a.z <= 0.0) {
    if (a > A.a.y) {
      // Named regulator shortcut (PLAN 28d-A): when wetOnly (A.b.w) is set on a
      // seeded reef look (neon-coral-reef), the whole-plate bath feeds the reaction
      // inside the coral bodies (d.a) and wherever reagent was poured (c.b),
      // rather than printing over the empty black water between bodies (showreel:
      // 30% black to 1% by 30 s, now 23%).
      let host = select(1.0, max(smoothstep(0.12, 0.55, d.a), smoothstep(0.01, 0.08, c.b)), A.b.w > 0.5);
      let w = A.a.x * (a - A.a.y) * host;
      d = vec4f(d.rgb + w * A.b.rgb, d.a + w);
    }
    textureStore(dst, p, d);
    return;
  }
  let x = pow(max(a, 0.0) / PRINT_K, PRINT_HILL);
  let bound = x / (1.0 + x);
  let dens = PRINT_DENSITY * bound;
  let fed = clamp(max(c.b, A.a.w) / 0.3, 0.0, 1.0);
  /*
    Turing Print is how much of the print the plate carries: the dye as
    poured at 0, the whole print at 1, and a look fading in is the print
    coming up over the liquid rather than replacing it.
  */
  d = d + fed * min(A.a.z, 1.0) * vec4f(dens * A.b.rgb, dens);
  textureStore(dst, p, d);
}`,
};
