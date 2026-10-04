/**
 * A clear film that tears (PLAN §20b): the pale lace of the owner's reference
 * still, as a liquid of its own rather than paint.
 *
 * What the still shows is a clear liquid (an oil) lying against one glass over
 * dyed water, torn open into holes of every size, the holes sheared into slits
 * and the ligaments between them beaded into rows of dots. A liquid film thin
 * enough to feel the glass is only metastable: where it is thinnest, or where a
 * speck of dust or a drop of solvent sits, it ruptures, and surface tension
 * pulls it back from the hole (dewetting: Reiter 1992, Brochard-Wyart and
 * Daillant 1990). None of that is drawn here. The film is a thickness field h,
 * in fractions of the gap, and it obeys the thin-film (lubrication) equation
 *
 *     ∂h/∂t = ∇·(M(h) ∇p) − ∇·J_M − ∇·(h u_film)
 *     p     = −σ∇²h − Π(h) + (the top glass)
 *     Π(h)  = K (1 + dust) [(h_p/h)³ − (h_p/h)²]     disjoining pressure, h_p a precursor
 *     M(h)  = h³                                       a no-slip film
 *     J_M   = −k_M h² ∇Γ                              pulled away from a solvent Γ
 *
 * and the holes, their rims, the lace and the beads fall out of it. The CPU
 * prototype (`/mnt/project-files/lace/lace.py` in the project's files, numpy,
 * 384²) is where the numbers below were found, and a numpy copy of these exact
 * kernels (explicit, flux-limited, walled) was run before any of this was
 * written: a 0.35 film with dust tears into 365 holes in 8 s with diameters
 * from p10 1.6 to p99 18.6 cells, a 0.8 film with no dust stays whole for 20 s,
 * and a drop of solvent on a 0.6 film opens one hole that grows from 3.7 to
 * 9.4 cells in 7 s, with the film's volume kept to 1e-16.
 *
 * Why each piece is the way it is:
 *
 * - **A grid of its own** (`FILM_GRID`, at most 384², the prototype's), in
 *   rgba32float: h, Γ, and two spare channels. The lengths below are in its
 *   cells, so a hole is the same size on the plate at every quality rung that
 *   can hold the grid. The equation is fourth order and explicit, so its step
 *   is small and a coarser grid is the cheapest way to pay for it.
 * - **Flux form, limited.** Every change to h is a flux across a face, so the
 *   film is conserved to rounding. And a cell can never give more than it has
 *   above the floor: each donor's outgoing fluxes are scaled down together when
 *   they would take it below `FILM_FLOOR`. The prototype floored h after the
 *   step instead and had to take the film it made back from everywhere in
 *   proportion, a sum over the whole plate a GPU step cannot afford.
 * - **The floor and the mobility** are both 0.8 h_p. With the mobility
 *   clipped at h_p and h allowed below it, the disjoining term blew up in the
 *   prototype (the handoff's first pitfall).
 * - **The top glass** is a linear pressure past 0.9 of the gap, inside p, not a
 *   stiff term of its own: a rim that reaches the other glass spreads along it
 *   instead of piling past it. As an explicit stiff term it was unstable.
 * - **Dust** is a fixed, seeded field of weak spots: the disjoining strength
 *   is higher there (the water wets a speck, so the film is drawn off it).
 *   Fixed to the glass, so the dish is dirty in the same places all night,
 *   and procedural (a hash of the cell), so it costs no texture. A thick film
 *   barely feels it; a thin one tears where the dish is dirty.
 * - **Carried by the gap's own velocity profile.** Between two glasses the
 *   flow is a parabola across the gap, 6U z(1 − z) for a mean speed U. A
 *   film lying against one glass, of thickness h, moves at its mean over
 *   [0, h], U (3h − 2h²), so its flux is U (3h² − 2h³): a film filling the gap
 *   rides with the dye, a thin one lags behind it, and the difference shears
 *   a young hole into a slit. That treats the film as having the water's
 *   viscosity; a viscous film (20c) replaces it.
 */
export function filmKernels(HEAD: string, W: string): Record<string, string> {
  const COMMON = /* wgsl */ `
// The prototype's numbers, in the film grid's cells and the film's own time
// (FILM_RATE in src/gpu/fluid.ts turns seconds into it).
const F_SIGMA: f32 = 100.0;     // the film's surface tension
const F_K: f32 = 2000.0;        // the disjoining strength: with F_SIGMA, the spinodal spacing (7 cells at h 0.4, 16 at 0.75)
const F_HP: f32 = 0.06;         // the precursor film the glass keeps wet
const F_FLOOR: f32 = 0.048;     // 0.8 h_p: the floor and the mobility's clip
const F_WALL: f32 = 150.0;      // the top glass, past F_WALL_AT
const F_WALL_AT: f32 = 0.9;
const F_KM: f32 = 30.0;         // Marangoni: film moved per unit of solvent gradient
const F_DUST: f32 = 0.3;        // how much stronger the disjoining is on a speck of dust
fn fIn(p: vec2i, n: i32) -> bool { return p.x >= 0 && p.y >= 0 && p.x < n && p.y < n; }
`;
  return {
    /*
      The film carried by the plate's flow, in flux form (see the header for
      why its flux is U (3h² − 2h³)). Its solvent rides the water, at U.

      MUSCL with a minmod slope, as mixAdvect carries the oil, so a hole's
      edge stays a cell or two wide rather than smearing a cell a step. The
      velocity is the dye grid's, read between its texels at each face of the
      film's grid; the film's Courant number is a third of the dye's at most
      (384 cells against the dye's 1024), and it is taken in FILM_CARRY
      substeps and clamped at 0.45 like the oil's.

      A.a.x = seconds of displacement for this substep times the film grid
      (velocity × A.a.x = cells moved).

      The faces' velocities are the collocated grid's, averaged, and those are
      not divergence free: the projection keeps the flow free of divergence on
      its own faces (Rhie–Chow, see mixAdvect), which do not line up with the
      film's on a grid of another size, and the average leaves a grid-scale
      divergence in it. The oil and the dye shrug that off; the film cannot,
      because its own physics amplifies any change in thickness. Measured in
      the lab (128², a thick 0.8 film, one swirl kicked in, the gap unchanged):
      in half a second the film went to 0.54..0.91 in pure flux form, with the
      flow's central divergence, read back on the lab's 192² grid, a third of
      its speed per cell. So the
      compression a film the same everywhere would get from the faces' net
      outflow is taken back (the advective form, u·∇F): exactly the flux form
      where the flow is free of divergence, and no longer conservative to the
      last digit where it is not. *A shortcut, named in PLAN 20b-10*: the film
      carried on the projection's own faces would be both.
    */
    filmAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
${COMMON}
fn at(p: vec2i, n: i32) -> vec2f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).rg; }
fn velAt(uv: vec2f) -> vec2f {
  let m = vec2i(textureDimensions(vel)) - 1;
  let q = uv * vec2f(textureDimensions(vel)) - 0.5;
  let i = vec2i(floor(q));
  let f = q - floor(q);
  let a = textureLoad(vel, clamp(i, vec2i(0), m), 0).xy;
  let b = textureLoad(vel, clamp(i + vec2i(1, 0), vec2i(0), m), 0).xy;
  let c = textureLoad(vel, clamp(i + vec2i(0, 1), vec2i(0), m), 0).xy;
  let d = textureLoad(vel, clamp(i + vec2i(1, 1), vec2i(0), m), 0).xy;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn mm(a: vec2f, b: vec2f) -> vec2f {
  return select(vec2f(0.0), select(max(a, b), min(a, b), a > vec2f(0.0)), a * b > vec2f(0.0));
}
fn carried(v: vec2f) -> vec2f {
  let h = clamp(v.x, 0.0, 1.0);
  return vec2f(h * h * (3.0 - 2.0 * h), max(v.y, 0.0));
}
// What crosses the face from a to a + e, as (film, solvent, the face's Courant number).
fn flux(a: vec2i, e: vec2i, n: i32) -> vec3f {
  let b = a + e;
  if (!fIn(a, n) || !fIn(b, n)) { return vec3f(0.0); }
  let uv = (vec2f(a) + 0.5 + 0.5 * vec2f(e)) / f32(n);
  let c = clamp(dot(velAt(uv), vec2f(e)) * A.a.x, -0.45, 0.45);
  var v: vec2f;
  if (c >= 0.0) { v = at(a, n) + 0.5 * (1.0 - c) * mm(at(a, n) - at(a - e, n), at(b, n) - at(a, n)); }
  else { v = at(b, n) - 0.5 * (1.0 + c) * mm(at(b, n) - at(a, n), at(b + e, n) - at(b, n)); }
  return vec3f(c * carried(v), c);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(textureDimensions(src).x);
  let p = vec2i(id.xy);
  if (!fIn(p, n)) { return; }
  let here = textureLoad(src, p, 0);
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  // What the faces' velocities make or take of a film that is the same
  // everywhere (d.z is their net outflow): taken back, so only the film's
  // gradients move it (see the comment above).
  let m = d.xy - d.z * carried(here.rg);
  textureStore(dst, p, vec4f(here.r - m.x, max(here.g - m.y, 0.0), here.b, here.a));
}`,

    /*
      The film's pressure: surface tension, the disjoining pressure (with the
      dust), and the other glass. Into its own single-channel texture, for
      filmUpdate to take differences of.

      The dust: one candidate speck in each 16-cell square, there or not by a
      hash of the square, at a hashed place in it, 1.5 to 3 cells across and
      of hashed strength. A.a.x scales it (1 in a show; 0 for a check that
      asks what a clean dish does).
    */
    filmMu: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${COMMON}
fn hh(p: vec2i, n: i32) -> f32 { return max(textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).r, F_FLOOR); }
fn hash(q: vec2i, s: u32) -> f32 {
  var v = (u32(q.x + 4096) * 1664525u) ^ (u32(q.y + 4096) * 1013904223u) ^ (s * 2654435761u);
  v = v ^ (v >> 16u); v = v * 0x7feb352du; v = v ^ (v >> 15u); v = v * 0x846ca68bu; v = v ^ (v >> 16u);
  return f32(v) / 4294967296.0;
}
fn dust(p: vec2i) -> f32 {
  let x = vec2f(p) + 0.5;
  let g = vec2i(floor(x / 16.0));
  var d = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let c = g + vec2i(i, j);
    if (hash(c, 1u) < 0.5) {
      let at = (vec2f(c) + vec2f(hash(c, 2u), hash(c, 3u))) * 16.0;
      let r = 1.5 + 1.5 * hash(c, 4u);
      let o = x - at;
      d += (0.5 + 0.5 * hash(c, 5u)) * exp(-dot(o, o) / (r * r));
    }
  } }
  return min(d, 1.0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(textureDimensions(src).x);
  let p = vec2i(id.xy);
  if (!fIn(p, n)) { return; }
  let h = hh(p, n);
  let lap = hh(p + vec2i(1, 0), n) + hh(p - vec2i(1, 0), n) + hh(p + vec2i(0, 1), n) + hh(p - vec2i(0, 1), n) - 4.0 * h;
  let r = F_HP / h;
  var k = F_K;
  if (A.a.x > 0.0) { k = F_K * (1.0 + F_DUST * A.a.x * dust(p)); }
  let pr = -F_SIGMA * lap - k * (r * r * r - r * r) + F_WALL * max(h - F_WALL_AT, 0.0);
  textureStore(dst, p, vec4f(pr, 0.0, 0.0, 0.0));
}`,

    /*
      One explicit step of the film, in flux form, and of its solvent.

      The flux across a face, film moving from a to b, is
        dt (−M (p_b − p_a) − k_M h² (Γ_b − Γ_a)),
      M = h³ at the face (h the mean of the two cells, clipped at the floor).
      Then the limit (see the header): each donor's outgoing fluxes are scaled
      together by s = min(1, (h − floor) / what it would give), and a face
      carries its flux times its donor's s. So this cell needs its own s and
      each neighbour's, and each of those needs that cell's four faces: a
      reach of two cells, read straight from the textures.

      The solvent diffuses (D 0.4 cells² per unit of film time) and
      evaporates (half of it a unit), as alcohol on a warm dish does.
      A.a.x = dt in film time.

      Stable for dt under 2 / (M (64σ + 8 wall)) ≈ 2.6e-4 at M = 1; FILM_DT
      in src/gpu/fluid.ts keeps it at 2.2e-4.
    */
    filmUpdate: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var prT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
${COMMON}
var<private> NN: i32;
fn fh(p: vec2i) -> vec2f { return textureLoad(src, clamp(p, vec2i(0), vec2i(NN - 1)), 0).rg; }
fn fp(p: vec2i) -> f32 { return textureLoad(prT, clamp(p, vec2i(0), vec2i(NN - 1)), 0).r; }
// Film from a to b across their shared face, before the limit; 0 at a wall.
fn q(a: vec2i, b: vec2i) -> f32 {
  if (!fIn(b, NN) || !fIn(a, NN)) { return 0.0; }
  let ha = fh(a); let hb = fh(b);
  let hf = 0.5 * (ha.x + hb.x);
  let m = clamp(hf, F_FLOOR, 1.0);
  return A.a.x * (-(m * m * m) * (fp(b) - fp(a)) - F_KM * hf * hf * (hb.y - ha.y));
}
// What a donor can give, as a share of what its faces ask of it.
fn share(a: vec2i) -> f32 {
  let out = max(q(a, a + vec2i(1, 0)), 0.0) + max(q(a, a - vec2i(1, 0)), 0.0)
          + max(q(a, a + vec2i(0, 1)), 0.0) + max(q(a, a - vec2i(0, 1)), 0.0);
  return min(1.0, max(fh(a).x - F_FLOOR, 0.0) / max(out, 1e-30));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  NN = i32(textureDimensions(src).x);
  let p = vec2i(id.xy);
  if (!fIn(p, NN)) { return; }
  let mine = share(p);
  var dh = 0.0;
  for (var k = 0; k < 4; k++) {
    let e = select(select(vec2i(0, -1), vec2i(0, 1), k == 2), select(vec2i(-1, 0), vec2i(1, 0), k == 0), k < 2);
    let b = p + e;
    let f = q(p, b);
    if (f > 0.0) { dh -= f * mine; }
    else if (f < 0.0) { dh -= f * share(b); }
  }
  let here = textureLoad(src, p, 0);
  let g = here.g;
  let lapG = fh(p + vec2i(1, 0)).y + fh(p - vec2i(1, 0)).y + fh(p + vec2i(0, 1)).y + fh(p - vec2i(0, 1)).y - 4.0 * g;
  let g2 = max(g + A.a.x * (0.4 * lapG - 0.5 * g), 0.0);
  textureStore(dst, p, vec4f(here.r + dh, g2, here.b, here.a));
}`,

    /*
      A pour onto the film: clear oil thickens it, a drop of solvent (alcohol,
      soap) lands in Γ. A soft disc, 1 − d²/r² as the lab lays dye, in plate
      units: A.a = (x, y, r, ·), A.b = (film, solvent, ·, ·). The film is held
      under the other glass (0.95 of the gap), and to the floor where a pour
      takes none away.

      Or, with A.a.w = 1, the film raised or lowered everywhere by A.b.x (the
      Clear Film control moved while a film is on the plate): more clear oil
      poured over the whole dish, or drawn off it.
    */
    filmSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${COMMON}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(textureDimensions(src).x);
  let p = vec2i(id.xy);
  if (!fIn(p, n)) { return; }
  let here = textureLoad(src, p, 0);
  var f = 1.0;
  if (A.a.w < 0.5) {
    let d = (vec2f(p) + 0.5) / f32(n) - A.a.xy;
    f = max(0.0, 1.0 - dot(d, d) / max(A.a.z * A.a.z, 1e-12));
  }
  let h = clamp(here.r + A.b.x * f, F_FLOOR, max(here.r, 0.95));
  textureStore(dst, p, vec4f(h, here.g + A.b.y * f, here.b, here.a));
}`,
  };
}
