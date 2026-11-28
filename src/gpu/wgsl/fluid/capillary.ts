/**
 * The oil's capillary physics: its chemical potential, the rim's pressure round
 * the ring, the capillary force σ κ ∇c̃, and the film between drops that keeps
 * two drops two.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { OPEN_RIM, DISH_GAP_FIELD_UV } from '../../../lib/turntable';
import { HEAD, W } from './shared';
import { RIM_SIDE } from './oil';
import { OIL_SPINODAL, OIL_WELL, KAPPA_WAX, KAPPA_WATER, GLASS_FIN, LAMP_COOL_FROM, LAMP_GLASS, OIL_CELLS, OIL_WIDE_CELLS } from '../../fluid/constants';

/*
  How far inside the rim the rim's pressure is laid in (CAPILLARY, below), in
  cells. A gradient moves nothing wherever it is laid, so the width is only
  how gently Φ comes up: over a band this wide its radial part is about the
  capillary force's own size at an edge four cells wide, and the band is
  still a twentieth of a 192 plate's radius.
*/
const RIM_BAND = 8;
/** The most samples rimLaplace takes round the ring (its workgroup arrays' length; fluid.ts sizes the ring). */
export const RIM_SAMPLES = 1024;
/** The narrowest thread the oil's field draws, in cells: its edge's own width (THREAD, PLAN 38w-27). */
export const THREAD_CELLS = 2.0;
/** How far THREAD reads across the oil each way, in cells: past a 768² grid's rest gap (7.7 cells) and its blur; a walk that runs out of it is across a wide body. */
export const THREAD_REACH = 12;
/*
  How many gaps across a body of oil must be before its pull may pass the
  cap (OIL_WIDE_CELLS, PLAN 38e-2). Measured (`npm run pinch`, 512², the
  gap 5.1 cells): with every body that is not a thread held at the wide
  cap, a thread's beads and bulges, wider than the gap but not by much,
  pulled at six caps beside a neck that THREAD_PULL slows, so they sucked
  the neck dry before Rayleigh–Plateau's wave could set the spacing: 8.18
  widths a bead against the law's 4.7. A body is a Hele-Shaw pancake, the
  drop whose rounding 38e-2 measures, once it is several gaps across every
  way; under that its in-plane curve is the gap's own size and it belongs
  with the thread it came from, at the cap the thread is tuned to. So both
  ways: two gaps along the edge's normal (the thread's own walk, carried
  on), and as broad again a gap in from the edge, across the normal.
  Width along the normal alone was not enough (6.70 widths a bead): at a
  bead's shoulder or a thread's tip the normal runs along the thread, not
  across it, and reads it wide; a gap in, across, it reads the thread.
  Both: 4.40 widths (the law's within 7%). A curvature gate instead (κ
  under 1/h or 2/h) split one oval drop into capped tips and uncapped
  flanks, which stretched it rather than rounding it (R 10 at −0.03 of
  the law at 1/h); the breadth a gap in is the same at a small drop's tip
  and flank, and R 10 rounds at 0.88, as with no gate.
*/
export const WIDE_ACROSS = 2;
/*
  A thread's pull, slowed as a whole (PLAN 47k, \`npm run pinch\`): σ in a
  thread's cells is at most THREAD_PULL caps (A.a.y, OIL_CELLS a step) per
  unit of curvature and edge, about four cells³ a step on any grid.

  Measured on main: the beads came at the wrong spacing, and waves too short
  to bead grew. Every cell's capillary force is clipped to the most the oil
  may move in a step, and at the oil's tension (0.024 N/m, Darcy's
  h²/12μ on the 2 mm gap) a 4-cell thread's edge asks for about twelve times
  that: so every edge cell of a thread pushed at the cap whatever its
  curvature, the neck and the bulge alike, and the force kept only its sign.
  Rayleigh–Plateau lives in the difference between the neck's pressure and
  the bulge's, and the clip had taken it out: on main a wave at kr = 1.5,
  which a real thread smooths, grew at 0.055 a step, faster than the one at
  0.55, and four threads from the same noise broke into 13 to 28 beads.

  The obvious fix, no clip, cannot run: a thread a millimetre wide on the
  real gap breaks at σ/r³, about a thousand a second, and the explicit
  force's stable step is a hundredth of a frame. A smaller clip, or a soft
  one, has the same fault, since whatever bounds each cell's force by its
  own size flattens the law. What keeps the law is one factor for the whole
  thread: every thread cell's force times the same number, so the neck's
  pull over the bulge's is what the curvatures say and the thread beads at
  the law's wavelength, 9.4 radii for the plate's oil (4.7 widths; Rayleigh's
  inviscid free thread is 9.0), only slower: it pinches in about a second,
  where a real one takes milliseconds the frame cannot show. The factor is
  set by the grid's step, as the clip is, so on a finer grid the same thread
  is slower; eight caps keeps a 4-cell thread's edge at about half a cap,
  under the clip, which still stands behind it for the thinnest threads and
  their tips. The real fix is the capillary laid implicitly (PLAN 27f-9s),
  which takes the factor out.

  Wide bodies (threadCurve 0) take none of the factor, and that is its own
  limit: a bead or a pool wider than the gap pushes at its full tension
  (under OIL_WIDE_CELLS on the open thin gap since PLAN 38e-2, at the clip
  before) beside a slowed neck, so late in a break-up, and where a thread
  leaves a pool, the two sides are not on one law (the skeptic pass on
  \`npm run pinch\`, 2026-11-28). And while the factor binds, which on
  the thin gap is from Oil Tension 0.05 or so up, the dial no longer
  changes a thread's speed; on main the clip made it barely change either.
  Both go with the factor (27f-9s).
*/
export const THREAD_PULL = 8;
/*
  The oil's capillary force, σ κ ∇c̃, at one cell (mixForce has the physics),
  shared by mixForce and rimLaplace so the rim reads the very force the flow
  is given. Both bind the oil's blur as \`soft\`; A.a.x is σ and A.a.y the most
  it may add, both mixForce's.

  And the rim's share of it (PLAN 18g-6). The thin gap's rim is open: past
  it the liquid is the reservoir round the cover glass, held at the air's
  pressure, p = 0 (wgsl/thinGap.ts). That is the water's pressure there, and
  a cell of water at the rim is right to have it. A cell of oil is not: the
  oil's interface makes the oil σκ above the water round it (Young–Laplace),
  and a body cut by the rim still has its interface past it, in the water
  of the reservoir, so the oil at the rim is at σκ, not at zero. Held at
  zero, the oil just inside the rim was at its body's Laplace pressure and
  the rim's own cells at none, and the difference drained the body out
  through the rim by its own surface tension, with the plate level and
  nothing stirring: in the lab a lens of radius 0.06 laid against the rim at
  Clock Glass's Oil Tension kept 9.6% of its oil after six seconds (\`npm
  run rimhold\`), and the same lens at a hundredth of the tension, or in the
  middle of the dish, kept all of it.

  So the rim holds each cell at the oil's own pressure there, φ: the line
  integral of the capillary force along the rim, ∮ f·dl from a cell of water
  (rimLaplace), which across an interface is the jump σκ the force makes and
  across water or the inside of a body is nothing. Not laid into the
  pressure solve's held cells (which every carry's faces read too,
  THIN_FACE), but as the same thing said in the force: the gradient of
  Φ = w(r)·φ(θ), a ramp w from nothing to one over the last RIM_BAND cells
  inside the rim, taken off the capillary force. A gradient moves nothing
  between two glasses (the pressure takes it, whatever the drag in each
  cell: u = c(f − ∇p)), so inside the band the flow is the flow it was; and
  the solve's p' = p − Φ held at zero on the rim is p held at φ there.
  Everywhere short of the band the force is untouched, to the bit.
*/
const CAPILLARY = /* wgsl */ `
fn cs(p: vec2i, n: f32) -> f32 { return textureLoad(soft, clampP(p, n), 0).r; }
fn grad(p: vec2i, n: f32) -> vec2f {
  return 0.5 * vec2f(cs(p + vec2i(1, 0), n) - cs(p - vec2i(1, 0), n), cs(p + vec2i(0, 1), n) - cs(p - vec2i(0, 1), n));
}
// The edge's unit normal, fading to nothing where there is no edge to have one.
fn nrm(p: vec2i, n: f32) -> vec2f { let g = grad(p, n); return g / sqrt(dot(g, g) + 0.0004); }
// κ = −∇·n̂, by central differences of the normals themselves; positive where the oil is convex.
fn curvature(p: vec2i, n: f32) -> f32 {
  return -0.5 * ((nrm(p + vec2i(1, 0), n).x - nrm(p - vec2i(1, 0), n).x) + (nrm(p + vec2i(0, 1), n).y - nrm(p - vec2i(0, 1), n).y));
}
// The ring rimLaplace integrates along: two cells inside the rim, inside
// every cell the solve holds (the rim's and the grid's edge, hsPrep).
fn rimRing(n: f32) -> f32 { return ${OPEN_RIM.toFixed(2)} - 2.0 / n; }
// w(r): nothing short of the band, one from a cell and a half inside the rim outward.
fn rimRamp(r: f32, n: f32) -> f32 { return smoothstep(${OPEN_RIM.toFixed(2)} - (1.5 + ${RIM_BAND.toFixed(1)}) / n, ${OPEN_RIM.toFixed(2)} - 1.5 / n, r); }
`;
/*
  A thread's curvature across the gap (PLAN 38w-27), and the capillary force
  σ κ ∇c̃ with it, for mixForce and rimLaplace, which bind the gap (the
  squeeze's red, \`sq\`) beside the oil's blur.

  Reported in the owner's round five: a press stretches Classic's oil into
  threads that stay threads, where the 1969 footage strings them into beads.
  The plate's oil is a field in the plane, and its tension the curvature of
  the outline it draws there. A straight thread drawn that way cannot bead,
  in any model: a varicose wave along it only lengthens its outline, so the
  in-plane tension smooths the wave away. A real thread beads because it is
  round. Its section is a disc of diameter w, whose rim is curved 2/w across
  the thread, out of the plane, so the oil in a neck is at σ(2/w) more than
  the water and the oil in a bulge at less, and the neck empties into the
  bulges until it pinches (Plateau 1873, Rayleigh 1878). That only holds
  while the thread is narrower than the gap. A wider one touches both glasses
  and is a ribbon, its edge a meniscus across the gap whose curvature is
  2/h wherever the gap is the same, so its pressure does not change along
  it and nothing drives a neck: confinement holds a ribbon whole, as Humphry,
  Ajdari, Fernández-Nieves, Stone and Weitz measured in microchannels (Phys.
  Rev. E 79, 056310, 2009). So a pressed thread is a ribbon and holds; let
  the glass up off it, or stretch it thinner than the gap, and it beads.

  So the edge's curvature gains 2/w − 2/h where the oil there is narrower
  than the gap (the 2/h is a ribbon's own, the same everywhere along it, and
  taken off so a ribbon and every wide body read exactly what they did). The
  width is read across the oil along the edge's own normal: from the cell,
  the blurred oil summed a cell at a time both ways until it gives out,
  which across a thread is its width (the blur keeps the sum) and across a
  small drop its diameter, where the same 2/w is the drop's own
  out-of-plane curvature: a drop narrower than the gap is a sphere, 4/D, the
  in-plane outline's 2/D and this one's 2/D. Past the gap the sum stops, as
  only the gap matters, and a walk still in the oil at THREAD_REACH is
  across a wide body (a lifted gap on a 1024² grid is 20 cells).

  The grid sets the floor. The field draws no thread narrower than its own
  edge, two cells or so (THREAD_CELLS), so a gap no wider than that on the
  grid (a 2 mm gap at 192² is 1.9 cells: the CPU mirror and the 192 labs)
  has no thread to bead and nothing changes there; at the app's 512² the
  gap is 5.1 cells and at 768² 7.7.
*/
const THREAD = /* wgsl */ `
// The oil's blur between its four cells round g, in cells. (Not mix(): mixForce's oil texture has that name.)
fn csAt(g: vec2f, n: f32) -> f32 {
  let c0 = vec2i(floor(g));
  let f = g - floor(g);
  let a = cs(c0, n) + (cs(c0 + vec2i(1, 0), n) - cs(c0, n)) * f.x;
  let b = cs(c0 + vec2i(0, 1), n) + (cs(c0 + vec2i(1, 1), n) - cs(c0 + vec2i(0, 1), n)) * f.x;
  return a + (b - a) * f.y;
}
// 1 where the oil at q runs on along ±t for far cells' worth (the body's
// breadth there, read the same way the walk below reads its width).
fn broad(q: vec2f, t: vec2f, far: f32, n: f32) -> f32 {
  var w = csAt(q, n);
  if (w < 0.5) { return 0.0; }
  for (var k = 1; k <= ${THREAD_REACH}; k++) { let s = csAt(q + t * f32(k), n); if (s < 0.02) { break; } w += s; if (w >= far) { return 1.0; } }
  for (var k = 1; k <= ${THREAD_REACH}; k++) { let s = csAt(q - t * f32(k), n); if (s < 0.02) { break; } w += s; if (w >= far) { return 1.0; } }
  return 0.0;
}
// x: the thread's own curvature across the gap (0 off a thread); y: 1 on a
// body wide both ways, WIDE_ACROSS gaps along the normal and as broad a gap
// in from the edge: the only oil whose pull may pass the cap on the open thin
// gap (OIL_WIDE_CELLS; WIDE_ACROSS says why both).
fn threadCurve(p: vec2i, g: vec2f, n: f32) -> vec2f {
  if (S.thinGap < 0.5) { return vec2f(0.0, 0.0); }
  let h = max(textureLoad(sq, clampP(p, n), 0).r, 0.0) * ${DISH_GAP_FIELD_UV.toFixed(6)} * n;
  let gl = length(g);
  if (gl < 0.004) { return vec2f(0.0, 0.0); }
  let u = g / gl;
  let o = vec2f(p);
  let far = ${WIDE_ACROSS.toFixed(1)} * h;
  let wide = broad(o + u * h, vec2f(-u.y, u.x), far, n);
  var w = cs(p, n);
  // A walk that runs out of reach still in the oil is across a wide body
  // (a lifted gap on a fine grid is wider than the reach), and reads as one.
  var out = 0;
  for (var k = 1; k <= ${THREAD_REACH}; k++) {
    let s = csAt(o + u * f32(k), n);
    if (s < 0.02) { out++; break; }
    w += s;
    if (w >= far) { return vec2f(0.0, wide); }
  }
  for (var k = 1; k <= ${THREAD_REACH}; k++) {
    let s = csAt(o - u * f32(k), n);
    if (s < 0.02) { out++; break; }
    w += s;
    if (w >= far) { return vec2f(0.0, wide); }
  }
  if (out < 2) { return vec2f(0.0, wide); }
  if (w >= h || h <= ${THREAD_CELLS.toFixed(1)}) { return vec2f(0.0, 0.0); }
  return vec2f(2.0 / max(w, ${THREAD_CELLS.toFixed(1)}) - 2.0 / h, 0.0);
}
// σ κ ∇c̃. The normal's divergence by central differences of the normals
// themselves, not a second derivative of c: that is the step that keeps the
// grid out of it. And the thread's own curvature across the gap (above),
// its whole pull slowed by THREAD_PULL's one factor before the clip, so the
// clip does not flatten Rayleigh–Plateau (PLAN 47k).
// A.a.y is the cap (OIL_CELLS a step); negative, a wide body's (threadCurve's y: WIDE_ACROSS says which) is OIL_WIDE_CELLS instead (PLAN 38e-2), and a thread's and its beads' still |A.a.y|.
fn capillaryAt(p: vec2i, n: f32) -> vec2f {
  let g = grad(p, n);
  let tw = threadCurve(p, g, n);
  let t = tw.x;
  var f = A.a.x * (curvature(p, n) + t) * g;
  let cap = abs(A.a.y);
  if (t != 0.0) { f *= min(1.0, ${THREAD_PULL.toFixed(2)} * cap / max(A.a.x, 1e-20)); }
  let most = select(cap, cap * ${(OIL_WIDE_CELLS / OIL_CELLS).toFixed(4)}, tw.y > 0.5 && A.a.y < 0.0);
  let l = length(f);
  if (l > most) { f *= most / l; }
  return f;
}
`;
/*
  Film Hold: the water film between two drops of oil, and why it holds.

  Asked from a photograph of a splodascope (the owner, 2026-10-25): a
  crowd of round cells of yellow, red, pink and green oil packed edge to
  edge in blue water, some inside others, none merging. On this plate two
  bodies of oil merged the moment their edges met, because a single
  Cahn–Hilliard field charges for boundary and nothing else, and two
  boundaries a few cells apart are cheaper as none, and the capillary force
  pulls them shut besides (mixFilm says why). In the lab (192², the look's
  crowd of 35 drops, six seconds) the plate as it was left 3 bodies; with
  the hold, 31 (npm run filmhold).

  Real drops do not merge on touching. Two drops pressed together first
  have to squeeze out the water between them, and a light show's water
  carries soap or the dyes' own wetting agents, whose molecules sit on both
  faces of the film. When the faces come within a few tens of nanometres
  they repel (the double layers' charge and the surfactant's tails: the
  disjoining pressure Π(h), Derjaguin's), and the film stops thinning at
  the thickness where Π balances the drops' Laplace pressure. That is why a
  soapy emulsion, or foam, is a crowd of cells with walls between them, and
  why the walls between unequal drops curve into the bigger one. The film
  breaks only if something presses harder than Π can hold: a hand on the
  glass, a hard current, the top glass pushed down.

  Simulated as the disjoining pressure is in a diffuse-interface model:
  an energy for the water in a film, added to the oil's chemical potential
  there, so oil flows out of a thinning film and back into its own drop
  (the push back), and nothing anywhere else changes. A cell is in a film
  when it has oil on both sides of it along a line: along the two axes and
  the two diagonals, the most oil within FILM_REACH cells ahead and the
  most behind, the lesser of the two, the greatest of the four lines. Each
  is weighted by how far off it is, falling by e every FILM_DECAY cells,
  so a thinner film pushes harder, as Π does (an exponential, the double
  layer's own form). A cell beside one drop has oil on one side only and
  reads nothing, so a lone drop rounds as before, and Film Hold at 0 adds
  nothing at all. Only oil well past a half counts (0.55 to 0.9): the
  field's edge is a few cells of part-oil, and read as oil, a cell in
  that band saw it on both sides along the edge's own tangent and the
  hold reshaped a lone drop's edge (the filmhold check, 0.081 of a cell's
  oil at worst, against the bar of 0.01); and only a cell that is water
  itself is in a film, for the same reason on the oil's side (0.026).

  Shortcuts, named (PLAN 28k-2): a real film is tens of nanometres; on the
  grid it is the narrowest the field can draw, two or three cells, so the
  wall between two cells is drawn as thick as the field's own edge. And the
  film breaks when it is pressed past what Π holds, which is the threshold
  of the real rupture but not its timing: a real film also breaks by chance
  as it drains, sooner when it is dirty or hot.
*/
export const FILM_REACH = 6;
export const FILM_DECAY = 2.5;
const FILM_WGSL = /* wgsl */ `
fn filmReach(p: vec2i, e: vec2i, n: f32) -> f32 {
  let len = length(vec2f(e));
  var m = 0.0;
  for (var k = 1; k <= ${FILM_REACH}; k++) {
    let d = f32(k) * len;
    m = max(m, smoothstep(0.55, 0.9, cc(p + e * k, n)) * exp(-(d - 1.0) / ${FILM_DECAY.toFixed(2)}));
  }
  return m;
}
fn filmSqueeze(p: vec2i, n: f32) -> f32 {
  var s = min(filmReach(p, vec2i(1, 0), n), filmReach(p, vec2i(-1, 0), n));
  s = max(s, min(filmReach(p, vec2i(0, 1), n), filmReach(p, vec2i(0, -1), n)));
  s = max(s, min(filmReach(p, vec2i(1, 1), n), filmReach(p, vec2i(-1, -1), n)));
  s = max(s, min(filmReach(p, vec2i(1, -1), n), filmReach(p, vec2i(-1, 1), n)));
  return s;
}
`;

export const CAPILLARY_KERNELS: Record<string, string> = {
  /*
    Oil and water: the Cahn–Hilliard chemical potential.

    μ = f′(c) − κ∇²c, with f a double well whose two floors are pure water
    and pure oil. The first term drives a mixed cell toward one or the
    other; the second charges for every bit of boundary, which is what
    surface tension *is*: a blob rounds up because a circle is the shortest
    boundary for its area, and a thin thread breaks into drops for the same
    reason (Rayleigh–Plateau). Neither is drawn; both fall out. Stored in
    the mix's alpha for the update and the force to read.

    **The well is a deep quench** (PLAN 38f-2). It was c²(1 − c)², whose
    spinodal (where f″ turns negative and a mixture comes apart by itself)
    sits at 0.21 from either side: a cell under a fifth oil was metastable,
    and with nothing to nucleate it, it stayed so. Once the heat rode the
    flow (38f-1) the Lava Lamp's wax rose in plumes, and the carry spread
    each plume's trailing edge into cells about 0.15 oil that never came
    back: at 192², 6 s, 4,370 cells of haze, half the oil and its colour in
    them, the dish 67% clear. Real wax and water are not like that. They
    mix to parts per million (the regular solution at large χ, Flory–
    Huggins' deep quench), so their spinodal lies within a few per cent of
    the pure liquids and a smear of one in the other is unstable at any
    share: it comes apart into drops, which ripen into the bodies.

    So f′ is that shape, laid in two lines a side: from each pure liquid a
    steep wall, f′ = (OIL_WELL / OIL_SPINODAL)·y for y (the share of the
    other liquid) up to OIL_SPINODAL, then down in a straight line to 0 at
    half full, a curvature of −1 there, the old well's own at the middle,
    so an edge keeps the width it had. The capillary force does not read μ
    (it is σκ∇c̃, mixForce), so the tension a body shows is unchanged; what
    changes is that the mixture now has nowhere to rest between the two.
    The same lab: haze 1,474 cells, 72% of the colour in the bodies against
    42%, the dish 83% clear. Past the pure liquids the wall goes on, so an
    overshoot is pulled back as before.

    And, with Film Hold (A.a.x), the water film between two bodies of oil
    pushes back as it thins: FILM_WGSL says what that is and why.
  */
  mixMu: `${HEAD}${FILM_WGSL}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn cc(p: vec2i, n: f32) -> f32 { return textureLoad(src, clampP(p, n), 0).r; }
${RIM_SIDE}
// ∇c·n = 0 at the open rim (RIM_SIDE in oil.ts says why): a neighbour across it reads as this cell.
fn ccN(p: vec2i, e: vec2i, n: f32, c: f32) -> f32 {
  return select(cc(p + e, n), c, rimSide(p, n) != rimSide(clampP(p + e, n), n));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let m = textureLoad(src, p, 0);
  let c = m.r;
  let lap = ccN(p, vec2i(1, 0), n, c) + ccN(p, vec2i(-1, 0), n, c) + ccN(p, vec2i(0, 1), n, c) + ccN(p, vec2i(0, -1), n, c) - 4.0 * c;
  // The deep quench's slope (above): y the share of the other liquid, the wall then the slope to half full.
  let y = min(c, 1.0 - c);
  let well = select((${(OIL_WELL / OIL_SPINODAL).toFixed(4)}) * y, ${OIL_WELL.toFixed(4)} * (0.5 - y) / ${(0.5 - OIL_SPINODAL).toFixed(4)}, y > ${OIL_SPINODAL.toFixed(4)});
  var mu = select(well, -well, c > 0.5) - lap;
  // In the water only: an edge cell on the oil's side sees its own oil
  // both ways along the edge's tangent, and is not in a film.
  if (A.a.x > 0.0) { mu += A.a.x * filmSqueeze(p, n) * (1.0 - smoothstep(0.15, 0.5, c)); }
  let outVal = vec4f(m.rgb, mu);
  textureStore(dst, p, select(vec4f(0.0), outVal, finite4(outVal)));
}`,

  /*
    The oil's pressure along the rim, φ(θ), for mixForce to hold the open rim
    at (CAPILLARY has the physics). One workgroup: the ring two cells inside
    the rim sampled K times (the texture's width, a cell or so apart), at
    each sample the capillary force mixForce lays, bilinear between its
    cells, and its component along the ring times the arc, which summed
    round the ring is ∮ f·dl.

    From a cell of water: the sample with the least oil on it is zero, as
    the reservoir's water is. Across an interface the sum rises by the jump
    σκ and inside a body it is flat, so a body cut by the rim reads its own
    Laplace pressure from end to end. The sum round the whole ring is zero
    only for a force that is a gradient; a body that is not round has a
    different curvature where it enters the ring and where it leaves, and
    the two jumps do not cancel. What is left over is laid along the ring by
    the oil it crosses (the share of the ring's oil passed so far), so the
    water's samples stay at the water's zero and a body's pressure runs
    from one end's jump to the other's across it, as the pressure inside a
    body that is still rounding does.

    A.a = mixForce's (σ, the most a cell may add).
  */
  rimLaplace: `${HEAD}${CAPILLARY}${THREAD}
@group(0) @binding(2) var soft: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
var<workgroup> ring: array<f32, ${RIM_SAMPLES}>;
var<workgroup> oilOn: array<f32, ${RIM_SAMPLES}>;
var<workgroup> part: array<vec2f, 64>;
var<workgroup> least: array<vec2f, 64>;
var<workgroup> total: vec3f;
// A cell's (capillary force, oil) between the four cells round g.
fn sampleAt(g: vec2f, n: f32) -> vec3f {
  let c0 = vec2i(floor(g));
  let f = g - floor(g);
  let a = vec3f(capillaryAt(c0, n), cs(c0, n));
  let b = vec3f(capillaryAt(c0 + vec2i(1, 0), n), cs(c0 + vec2i(1, 0), n));
  let c = vec3f(capillaryAt(c0 + vec2i(0, 1), n), cs(c0 + vec2i(0, 1), n));
  let d = vec3f(capillaryAt(c0 + vec2i(1, 1), n), cs(c0 + vec2i(1, 1), n));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
@compute @workgroup_size(64) fn main(@builtin(local_invocation_index) t: u32) {
  let n = S.n;
  let k = i32(textureDimensions(dst).x);
  let per = k / 64;
  let first = i32(t) * per;
  let rs = rimRing(n);
  let step = 6.2831853 / f32(k);
  let arc = step * rs * n;
  var mine = vec2f(0.0);
  for (var j = 0; j < per; j++) {
    let i = first + j;
    let th = (f32(i) + 0.5) * step;
    let dir = vec2f(cos(th), sin(th));
    let s = sampleAt((vec2f(0.5) + rs * dir) * n - 0.5, n);
    ring[i] = dot(s.xy, vec2f(-dir.y, dir.x)) * arc;
    oilOn[i] = clamp(s.z, 0.0, 1.0);
    mine += vec2f(ring[i], oilOn[i]);
  }
  part[t] = mine;
  workgroupBarrier();
  if (t == 0u) {
    var run = vec2f(0.0);
    for (var i = 0; i < 64; i++) { let here = part[i]; part[i] = run; run += here; }
    total = vec3f(run, 0.0);
  }
  workgroupBarrier();
  let sums = total.xy;
  var run = part[t];
  var low = vec2f(2.0, 0.0);
  for (var j = 0; j < per; j++) {
    let i = first + j;
    let here = vec2f(ring[i], oilOn[i]);
    let mid = run + 0.5 * here;
    let share = select(mid.y / sums.y, (f32(i) + 0.5) / f32(k), sums.y < 1e-6);
    run += here;
    ring[i] = mid.x - sums.x * share;
    if (here.y < low.x) { low = vec2f(here.y, f32(i)); }
  }
  least[t] = low;
  workgroupBarrier();
  if (t == 0u) {
    var best = least[0];
    for (var i = 1; i < 64; i++) { if (least[i].x < best.x) { best = least[i]; } }
    total.z = best.y;
  }
  workgroupBarrier();
  let zero = ring[i32(total.z)];
  for (var j = 0; j < per; j++) {
    let i = first + j;
    textureStore(dst, vec2i(i, 0), vec4f(ring[i] - zero, 0.0, 0.0, 0.0));
  }
}`,

  /*
    What the mix does to the flow, and what gravity does to the dye.

    **Capillary force**, σ κ ∇c̃ (continuum surface force, Brackbill 1992):
    surface tension as a push along the edge's normal, as strong as the edge
    is curved, with κ = −∇·(∇c̃/|∇c̃|) and c̃ the oil blurred [1 4 6 4 1]²
    (mixSmooth). It is what makes an oil blob in water pull itself round and
    carry the dye inside it along. A.a.x = σ (in cells, so the host scales it
    by N² for the same force on every grid), A.a.y the most it may add.

    It was the Korteweg form, −σ c ∇μ, which is the same force on paper and
    is what the Cahn–Hilliard energy hands you. On a grid it is not: μ is a
    Laplacian of c, its gradient a third derivative, and a third derivative
    of an edge four cells wide is mostly the grid. The force it made pointed
    every way at once, cell to cell, a flow full of divergence at the scale
    the projection cannot see; MacCormack's conserving limiter then took the
    dye out cell by cell (it caps a thickening and not a thinning), and an
    oil drop went black in about a second. Measured in the lab: a settled
    drop kept 41% of its dye after 120 steps; in a disc that had long stopped
    rounding the fastest flow was still 0.77 (the solver's velocity), the
    "parasitic currents" every diffuse-interface code fights. The curvature
    form reads only first derivatives of a blurred field, and the normal's
    divergence is smooth wherever the edge is: 88% of the plate's dye kept, and 86% of
    it still inside the drop (`npm run bodies`), the
    settled disc's fastest flow 0.031, and a strip of oil still pulls round (the
    physics check's aspect 5.58 → 1.89). Blurring and capping the old force
    was tried first: the dye was lost more slowly and the strip no longer
    rounded, since the blur took the curvature with the noise.

    (Marangoni flow is not here: see marangoniFlux.)

    **Buoyancy**, g (βₛ(ρ − ρ̄) − β_T T): dye makes the liquid heavier, heat
    makes it lighter. On a plate standing up (or tilted) that is a
    Rayleigh–Taylor instability: heavy dye above light sinks in fingers. With
    heat diffusing faster than the dye (the double-diffusive case, see
    doubleDiffusion) it makes salt fingers. A.b.xy = gravity in the plate
    (with its size), A.b.z = βₛ, A.b.w = β_T.

    **The lamp**: heat A.a.z a step into the dye below A.a.w plate widths
    from the centre, downhill, where a standing plate goes out of view; or,
    where the wax is the oil, the warm glass floor (LAMP_GLASS) it lies on.
  */
  mixForce: `${HEAD}${CAPILLARY}${THREAD}${RIM_SIDE}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var soft: texture_2d<f32>;
@group(0) @binding(6) var rimPhi: texture_2d<f32>;
@group(0) @binding(7) var sq: texture_2d<f32>;
@group(0) @binding(8) var dst: texture_storage_2d<rgba16float, write>;
// Φ = w(r)·φ(θ) at a cell (CAPILLARY): φ read round the ring, between its samples.
fn rimHeld(q: vec2i, n: f32) -> f32 {
  let d = (vec2f(q) + 0.5) / n - vec2f(0.5);
  let w = rimRamp(length(d), n);
  if (w <= 0.0) { return 0.0; }
  let k = i32(textureDimensions(rimPhi).x);
  let s = fract(atan2(d.y, d.x) / 6.2831853 + 1.0) * f32(k) - 0.5;
  let i0 = i32(floor(s));
  let a = textureLoad(rimPhi, vec2i((i0 + k) % k, 0), 0).r;
  let b = textureLoad(rimPhi, vec2i((i0 + 1 + k) % k, 0), 0).r;
  // (Not mix(): the oil's texture has that name in this kernel.)
  return w * (a + (b - a) * (s - floor(s)));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  var capillary = capillaryAt(p, n);
  // On a thin gap, the rim held at the oil's own pressure (CAPILLARY says why).
  // Past the open rim there is no cover glass and no pressure solve (hsPrep
  // holds p = 0 there): a body straddling the rim must not feed an unopposed
  // trough capillary force into hsDivergence, which raised pressure inside the
  // rim and pumped an unpoured lens out over it (PLAN 19ak-24d).
  if (S.thinGap > 0.5) {
    if (rimSide(p, n)) {
      capillary = vec2f(0.0);
    } else {
      capillary -= 0.5 * vec2f(rimHeld(p + vec2i(1, 0), n) - rimHeld(p - vec2i(1, 0), n), rimHeld(p + vec2i(0, 1), n) - rimHeld(p - vec2i(0, 1), n));
    }
  }
  let wax = textureLoad(dye, p, 0).a;
  let oil = textureLoad(mix, p, 0).r;
  /*
    The oil's own weight (Oil Weight, S.oilRho: −0.15 the mineral oil that
    floats up a standing plate, PLAN §18f; heavier than the water for a lava
    lamp's wax, PLAN 27f-9c), and its heat lift beyond the water's: an oil
    swells with heat two or three times what water does (OIL_EXPAND), so a
    warmed body of it lifts more than the warmed water beside it, which is
    what turns a lamp's wax from heavy to light.
  */
  let rho = wax - S.meanD + S.oilRho * oil;
  let buoy = A.b.xy * (A.b.z * rho - A.b.w * v.z * (1.0 + S.oilExpand * oil));
  var heat = v.z;
  if (A.a.z > 0.0) {
    /*
      Where the wax is dye (no oil heavier than the water, S.oilRho at 0) it
      has no body to lie anywhere, so the lamp's heat is a kick into the dye
      in the band just past the view (A.a.w), where a dye spreads out of
      sight. Into the wax, not the water round it: warming everything in that
      band alike lifts nothing, the wax is still the heaviest thing there.

      Where the wax is a liquid of its own (the oil, PLAN 27f-9c) the dye is
      only its colour, and the lamp is the glass floor it lies on (PLAN
      27f-9h; constants.ts LAMP_GLASS has what was measured). The floor is
      hot, and everything touching it comes toward its temperature by the
      gap's own conduction (S.lampCool, the wax at its κ), over the glass's
      fin length up from the floor: the cool glass below, turned over. Water
      and wax alike, which is the point. It was a kick into the wax alone
      first (LAMP_HEAT a second in a band over the floor, the water left
      cold), and that lamp stopped: a body sinking into the band was light
      again in a quarter of a second, so the wax parked on the band's upper
      edge as one weightless slab and hovered (the lab's centre of mass at
      0.49 to 0.50 from 22 s on). With the floor warming the water too, the
      column is warm below and cool above, a rising body is lighter against
      it the higher it goes, and a sunk one takes ten seconds to warm, by
      which time it is on the floor: the lab's lamp goes round every 32 s
      and is still doing it at three minutes.
    */
    let down = dot(uvOf(id) - vec2f(0.5), normalize(A.b.xy));
    let isWax = S.oilRho > 0.0;
    let dyeWax = select(clamp(wax * 2.0, 0.0, 1.0), 0.0, isWax);
    heat += A.a.z * smoothstep(A.a.w - 0.08, A.a.w, down) * dyeWax * (1.0 - oil);
    // (The wax's κ over the water's, by how much of the cell is wax; not mix(), the oil's texture's name here.)
    let across = S.lampCool * (1.0 - ${(1 - KAPPA_WAX / KAPPA_WATER).toFixed(5)} * clamp(oil, 0.0, 1.0));
    // down is 0 at the middle and 0.5 at the floor, so the height over the floor is 0.5 − down.
    let warm = select(0.0, exp(-max(0.5 - down, 0.0) / ${GLASS_FIN.toFixed(5)}), isWax);
    heat = ${LAMP_GLASS.toFixed(3)} + (heat - ${LAMP_GLASS.toFixed(3)}) * exp(-across * warm);
    /*
      And out through the cool upper glass (PLAN 27f-9e; constants.ts
      KAPPA_WAX has the physics): every cell's heat crosses the gap to the
      two glasses at the gap's slowest conduction rate, π²κ/h² (S.lampCool,
      water's, on the step's real seconds), the wax's at its own κ, and the
      glass takes it where it is cold: the plate's upper part, from
      LAMP_COOL_FROM of its height, coming in over the glass's fin length
      (GLASS_FIN). So a body that rose off the lamp keeps its heat through
      the warm lower half, gives it up in the upper one in a few seconds,
      is heavy again and comes down to be warmed: the cycle. Toward the
      room's temperature, zero, from either side, so a hand's cold goes too.
    */
    let cold = 1.0 - exp(-max(${(0.5 - LAMP_COOL_FROM).toFixed(3)} - down, 0.0) / ${GLASS_FIN.toFixed(5)});
    heat *= exp(-across * cold);
  }
  v = vec4f(v.xy + capillary + buoy, heat, v.w);
  textureStore(dst, p, safeVel(v));
}`,

  /*
    Film Hold's push on the flow: the near-contact force (FILM_WGSL has the
    physics). The disjoining pressure is a pressure, so the film pushes on
    the liquid as well as costing the oil: without this, two drops a few
    cells apart were pulled together by the capillary force itself, which is
    taken from the oil blurred five cells wide (mixSmooth) and so reads two
    drops that close as one body with a waist, whose curvature pulls the
    waist shut. That is the numerical coalescence every smoothed-interface
    solver has, and it is cured the way Montessori, Lauricella, Tirelli and
    Succi cure it in their lattice Boltzmann emulsions (J. Fluid Mech. 872,
    2019): a force on each interface, along its normal into its own drop,
    wherever another interface faces it across the water within
    FILM_REACH cells, stronger the thinner the film. The two faces of a film
    are pushed apart alike, so it makes no momentum.

    Each edge cell looks out along its own normal through the water: past
    the edge it is on (the oil falling under a half) to where oil rises over
    a half again, and the distance h there sets the push,
    exp(−h / FILM_DECAY), times how much edge the cell holds (|∇c̃|).

    A.a.x = the push at h = 0 per unit of edge (σ's own scale times Film
    Hold), A.a.y = the most a cell may add, as mixForce's (negative: OIL_WIDE_CELLS),
    A.a.z = σ times Film Hold for the waist's pull taken back (below; 0
    where the cap stands).

    The waist's pull taken back (PLAN 38e-2). The push held a crowd only
    while mixForce was capped (OIL_CELLS): the blur reads two drops a film
    apart as one body with a waist, whose curvature is up to about one over
    a cell, and the push, FILM_PUSH at h = 0, is 0.55 at the two or three
    cells a film is drawn as; the cap, which clipped the pull and the push
    alike, was what kept the pull from winning. Uncapped on the thin gap,
    the lab's crowd of 35 kept 19 (\`npm run filmhold\`, measured in October
    on the 6 mm gap; the cap put back, 29); OIL_WIDE_CELLS is six caps. The pull is the blur's artefact,
    not a force a real film feels: a held film's faces are each its own
    drop's surface, flat or bowed into the bigger drop by the smaller's
    1/R, never a neck as tight as the blur's. So in a film the concave part
    of the blur's curvature is taken back out of the force and the push
    answers the drops' own Laplace pressure, as a real disjoining pressure
    does. A face's own convexity is left alone. A film is where
    FILM_WGSL's filmSqueeze says so (oil past 0.55 on both sides of the cell
    along one of four lines within FILM_REACH), the very cells whose water
    the hold already charges for in mixMu; gated by the push's own ray, which
    runs along the cell's normal and misses a neck's saddle, the crowd kept
    28 of 35, by the four lines 31. A lone round drop is convex everywhere
    and reads no film, so it is untouched to the bit.
  */
  mixFilm: `${HEAD}${CAPILLARY}${FILM_WGSL}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var soft: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
fn oilAt(q: vec2f, n: f32) -> f32 { return textureLoad(mix, clampP(vec2i(floor(q)), n), 0).r; }
fn cc(p: vec2i, n: f32) -> f32 { return textureLoad(mix, clampP(p, n), 0).r; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  let g = grad(p, n);
  let edge = length(g);
  if (edge > 0.01) {
    let into = g / edge;           // toward this cell's own oil
    let here = vec2f(p) + 0.5;
    var out = false;
    var h = -1.0;
    for (var k = 1; k <= ${FILM_REACH * 2}; k++) {
      let d = 0.5 * f32(k);
      let c = oilAt(here - into * d, n);
      if (!out) { out = c < 0.5; }
      else if (c > 0.5) { h = d; break; }
    }
    if (h > 0.0) {
      var f = A.a.x * exp(-h / ${FILM_DECAY.toFixed(2)}) * g;
      let l = length(f);
      let most = select(A.a.y, -A.a.y * ${(OIL_WIDE_CELLS / OIL_CELLS).toFixed(4)}, A.a.y < 0.0);
      if (l > most) { f *= most / l; }
      v = vec4f(v.xy + f, v.zw);
    }
    // And the waist's pull taken back wherever the cell is in a film (above).
    if (A.a.z > 0.0 && filmSqueeze(p, n) > 0.01) { v = vec4f(v.xy - A.a.z * min(curvature(p, n), 0.0) * g, v.zw); }
  }
  textureStore(dst, p, safeVel(v));
}`,
};
