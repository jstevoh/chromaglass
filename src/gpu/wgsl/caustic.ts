import { DISH_GAP_FIELD_METRES, DISH_GAP_METRES } from '../../lib/turntable';

/**
 * The lamp's light traced through the liquid to the wall (PLAN 31s-2).
 *
 * A liquid on the stage is a phase screen: every ray of the condenser's
 * nearly parallel beam leaves the column bent by the slope of the optical
 * path through it, theta = grad(OPL) (the thin-prism law, Snell's law at each
 * interface in small angle, summed through the column). The derive pass
 * already writes that path for the whole column, dye, oil, a pour, a film
 * and the gap together (`.w`, OPL less clear water's 1.333, in rest gaps;
 * plate.ts calcOpl). A plane dz past the liquid, which is what the wall sees
 * when the projector's Focus is turned off the liquid, receives each ray at
 * x + dz * theta(x). The light there is how many rays land per area: the
 * inverse Jacobian of that map, summed over every sheet of the map that
 * lands on the point. A lens-shaped drop, a dome of path, gathers its rays
 * into a bright core and, past its focus R/(n-1), crosses them into a bright
 * rim with a dark ring beside it; a pit of path throws its light outward.
 *
 * It is drawn as the map itself: a mesh with one vertex a solver cell,
 * each vertex moved to where its ray lands (`causticRays`), each triangle
 * drawn where it lands, carrying its own light, its area at the plate over
 * its area at the wall (`CAUSTIC_MESH_WGSL`), added up where triangles
 * overlap (a fold of the map, where the caustic line is). That is the light
 * kept exactly: a triangle carries the same light wherever it lands, so the
 * wall's total is the plate's (less what is thrown off the plate's edge).
 *
 * The lamp is not a point. Each point of the stage sees it as a disc of
 * angular radius LAMP_HALF_ANGLE, so each ray is a cone, and the wall's light
 * is the point lamp's picture spread over a disc of radius dz * that angle
 * (`causticBlurX`, `causticBlurY`, a Gaussian of the disc's second moment).
 * That is what keeps a caustic line finite and sets how sharp it can get:
 * sharpest at the drop's own focus, softer past it, as a real one is.
 *
 * Replaces the shadowgraph's first order (defocusShadow, 1 - dz lap OPL),
 * which is this map's small-dz limit and cannot fold: it darkened and
 * brightened in place, so a drop's rim never became a line of light.
 */

/**
 * The lamp's half angle as a point of the stage sees it, in radians. An
 * overhead projector's condenser (a Fresnel stage) images the lamp into the
 * head lens; a stage point sees that image, about 15 mm across at the lens,
 * from the stage-to-lens distance, about 350 mm: 0.02 rad. Its first effect
 * is that a caustic past dz is no sharper than dz * 0.02.
 */
export const LAMP_HALF_ANGLE = 0.02;

/**
 * How far past the liquid the wall's plane sits per unit of the Focus
 * dial's throw, dz = (Focus - 0.5) * 1.5 (so +-0.75 at its ends), in metres.
 * The shadowgraph this trace replaces was tuned on the looks at
 * exp(-dz * 450 / (LOGICAL_GRID^2 * 1.333) * lap_uv(.w)); its first order is
 * this map's 1 - dz_m * gap / plate^2 * lap_uv(.w), which agree when dz_m is
 * dz times 450 / (192^2 * 1.333) * plate^2 / gap = 0.183 m. So a look that
 * set Focus keeps its strength where the map does not fold, and the dial's
 * ends sit 137 mm off the liquid (twice that with Boundary Contrast's gain).
 * A real head's focus travel is nearer a third of that; the dial is a ramp
 * past real at its ends, the law under it is the real one.
 */
export const PROJECTOR_DEFOCUS_METRES = 0.183;

/**
 * Cells of mesh round the plate, so a ray from just outside the edge (where
 * the path is the edge's, flat) lands on the wall as the lamp's own light
 * and the plate's edge is not darkened by a mesh that stops at it.
 */
export const CAUSTIC_BORDER = 4;

/**
 * A triangle's light is its area at the plate over its area at the wall,
 * sampled where the wall's texel centres fall inside it. That is exact only
 * where triangles are wider than a texel. Where rays gather, triangles land
 * smaller than one, between texel centres, and no centre reads them: the
 * first build lost 60% of a lens's light at its focus, and points put on
 * the nearest texel kept it but lost 23% of a ripple's past its first
 * crossing, where the folded sheets' slivers lie in rows that miss the
 * centres' rows altogether, and drew a gathered rim as beads a texel apart
 * (npm run caustics lines 3 and 7, the lab at Focus 0.6). So every triangle
 * gathered past twice (gain 2; at rest a triangle is half a texel, two to
 * a cell, gain 1) is instead splatted at its landed centre with a tent a
 * texel each side (bilinear weights, which sum to 1 over the four texels
 * round any point): its whole light, half a cell's, is kept wherever it
 * lands. Triangles spread wider than at rest are drawn as triangles, where
 * sampling their light is exact; splatted, their centres would sit further
 * apart than the tents reach and draw a lattice (a try at gain 0.5 read a
 * ripple's trough as 0.59 to 0.67 where it is 0.625). Between gain 1 and 2
 * each triangle is both, its light shared between the two ways by how far
 * it is gathered: a hard switch at gain 1 made neighbours that sat either
 * side of it take light twice or not at all (a ring of fifteen false peaks
 * round a dome of four cells, npm run caustics line 5). Both ways keep the
 * light, so any share of them does. Tents closer than a texel are nearly
 * flat, a few percent of ripple at twice gathered, which the lamp's disc's
 * least spread takes out (caustic.ts).
 */
export const CAUSTIC_SPLAT_FROM = 1.0;
export const CAUSTIC_SPLAT_FULL = 2.0;

/** The params every caustic kernel reads: one 32-byte uniform. */
const PARAMS = /* wgsl */ `
struct CausticParams {
  /* mesh cells across the plate; the wall's texels are the same */
  m: u32,
  /* cells of mesh past each edge */
  border: u32,
  /* where this layer starts in the light buffer, in floats */
  offset: u32,
  /* the blur's reach in texels (0: none) */
  reach: u32,
  /* plate uv the ray moves per unit of uv-gradient of .w: dz * gap / plate^2 */
  k: f32,
  /* the lamp disc's Gaussian sigma, in texels */
  sigma: f32,
  /* the dz the light was traced at (metres times Boundary Contrast's gain); kept in the header */
  dz: f32,
  _pad: f32,
}
@group(0) @binding(0) var<uniform> P: CausticParams;
`;

export const CAUSTIC_KERNELS = {
  /*
    Each vertex of the mesh moved to where its ray lands. The vertex sits at
    a cell's corner; the slope of .w is the central difference across it,
    read through the linear sampler at the corners' midpoints a cell apart,
    so a vertex sees exactly the cells it touches and nothing a stride away
    (the flower's lesson, PLAN 15g-15 and 31s-8). The sampler clamps at the
    edge, so past the plate the path is flat and the ray goes straight.
  */
  causticRays: /* wgsl */ `
${PARAMS}
@group(0) @binding(1) var derived: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<storage, read_write> rays: array<vec2f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let side = P.m + 2u * P.border + 1u;
  if (id.x >= side || id.y >= side) { return; }
  let cell = 1.0 / f32(P.m);
  let at = (vec2f(id.xy) - f32(P.border)) * cell;
  let wx1 = textureSampleLevel(derived, samp, at + vec2f(0.5, 0.0) * cell, 0.0).w;
  let wx0 = textureSampleLevel(derived, samp, at - vec2f(0.5, 0.0) * cell, 0.0).w;
  let wy1 = textureSampleLevel(derived, samp, at + vec2f(0.0, 0.5) * cell, 0.0).w;
  let wy0 = textureSampleLevel(derived, samp, at - vec2f(0.0, 0.5) * cell, 0.0).w;
  let grad = vec2f(wx1 - wx0, wy1 - wy0) / cell;
  rays[id.y * side + id.x] = at + P.k * grad;
}
`,

  /*
    The lamp's disc, rows: the wall's point-lamp light (the mesh's target)
    into a row-blurred buffer. A Gaussian of sigma r/2 has a uniform disc of
    radius r's second moment, which is what a soft caustic's width is.
  */
  causticBlurX: /* wgsl */ `
${PARAMS}
@group(0) @binding(1) var lit: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> rows: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = i32(P.m);
  if (i32(id.x) >= m || i32(id.y) >= m) { return; }
  let r = i32(P.reach);
  var sum = 0.0;
  var wsum = 0.0;
  for (var d = -r; d <= r; d++) {
    let x = clamp(i32(id.x) + d, 0, m - 1);
    let w = select(1.0, exp(-0.5 * f32(d * d) / (P.sigma * P.sigma)), r > 0);
    sum += w * textureLoad(lit, vec2i(x, i32(id.y)), 0).r;
    wsum += w;
  }
  rows[id.y * P.m + id.x] = sum / wsum;
}
`,

  /* The lamp's disc, columns, into the light buffer the display reads (binding 27). */
  causticBlurY: /* wgsl */ `
${PARAMS}
@group(0) @binding(1) var<storage, read> rows: array<f32>;
@group(0) @binding(2) var<storage, read_write> light: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = i32(P.m);
  if (i32(id.x) >= m || i32(id.y) >= m) { return; }
  if (id.x == 0u && id.y == 0u && P.offset == 4u) {
    light[0] = P.dz;
    light[1] = f32(P.m);
  }
  let r = i32(P.reach);
  var sum = 0.0;
  var wsum = 0.0;
  for (var d = -r; d <= r; d++) {
    let y = clamp(i32(id.y) + d, 0, m - 1);
    let w = select(1.0, exp(-0.5 * f32(d * d) / (P.sigma * P.sigma)), r > 0);
    sum += w * rows[u32(y) * P.m + id.x];
    wsum += w;
  }
  light[P.offset + id.y * P.m + id.x] = sum / wsum;
}
`,
} as const;

export type CausticKernel = keyof typeof CAUSTIC_KERNELS;

/*
  The mesh: two triangles a cell, drawn with no vertex buffer. Each vertex
  invocation reads its triangle's three landed corners, so it knows the
  triangle's area at the wall; the triangle's light is its area at the plate
  (half a cell) over that, the same at all three corners (flat). The target
  is the wall at the same texels as the plate's cells, added (one + one), so
  where the map folds and two sheets land on one texel both are counted.
  Clip y is 1 - 2v: the target's row 0 is the plate's v = 0, as the derive
  pass's texture (flipped, plate.ts deriveRecipe) is read.

  A triangle gathered past CAUSTIC_SPLAT_FROM gives a share of its light
  (all of it by CAUSTIC_SPLAT_FULL, when it is not drawn here at all: its
  three corners are put on one point, which covers nothing) to vsSplat: a
  quad two texels square round the triangle's landed centre, each texel
  centre inside it given the bilinear tent's share of that light.
*/
export const CAUSTIC_MESH_WGSL = /* wgsl */ `
${PARAMS}
@group(0) @binding(1) var<storage, read> rays: array<vec2f>;

struct MeshOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) gain: f32,
  /* where in a splat's tent this is, in texels from its centre (0 on a triangle: weight 1) */
  @location(1) tent: vec2f,
}

struct Tri { a: vec2f, b: vec2f, d: vec2f, gain: f32 }

/* Triangle t of the mesh: 2 a cell, 0 is (0,0) (1,0) (0,1), 1 is (1,0) (1,1) (0,1); its corners where they land and its gain. */
fn landed(t: u32) -> Tri {
  let cells = P.m + 2u * P.border;
  let side = cells + 1u;
  let q = t / 2u;
  let qi = q % cells;
  let qj = q / cells;
  var a = vec2u(qi, qj);
  var b = vec2u(qi + 1u, qj);
  let d = vec2u(qi, qj + 1u);
  if (t % 2u == 1u) { a = vec2u(qi + 1u, qj); b = vec2u(qi + 1u, qj + 1u); }
  var o: Tri;
  o.a = rays[a.y * side + a.x];
  o.b = rays[b.y * side + b.x];
  o.d = rays[d.y * side + d.x];
  let e1 = o.b - o.a;
  let e2 = o.d - o.a;
  let cell = 1.0 / f32(P.m);
  o.gain = cell * cell / max(abs(e1.x * e2.y - e1.y * e2.x), 1e-20);
  return o;
}

/* How much of a triangle's light goes as a splat, by how far it is gathered. */
fn splatShare(gain: f32) -> f32 {
  return clamp((gain - ${CAUSTIC_SPLAT_FROM.toFixed(1)}) / (${CAUSTIC_SPLAT_FULL.toFixed(1)} - ${CAUSTIC_SPLAT_FROM.toFixed(1)}), 0.0, 1.0);
}

fn clip(p: vec2f) -> vec4f { return vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0); }

@vertex fn vs(@builtin(vertex_index) vi: u32) -> MeshOut {
  let t = landed(vi / 3u);
  let k = vi % 3u;
  var p = t.a;
  if (k == 1u) { p = t.b; } else if (k == 2u) { p = t.d; }
  let share = splatShare(t.gain);
  if (share >= 1.0) { p = t.a; }
  var o: MeshOut;
  o.pos = clip(p);
  o.gain = t.gain * (1.0 - share);
  o.tent = vec2f(0.0);
  return o;
}

@vertex fn vsSplat(@builtin(vertex_index) vi: u32) -> MeshOut {
  let t = landed(vi / 6u);
  let k = vi % 6u;
  // The quad's corners, in texels from the centre: (-1,-1) (1,-1) (-1,1), (1,-1) (1,1) (-1,1).
  var c = vec2f(-1.0, -1.0);
  if (k == 1u || k == 3u) { c = vec2f(1.0, -1.0); }
  else if (k == 2u || k == 5u) { c = vec2f(-1.0, 1.0); }
  else if (k == 4u) { c = vec2f(1.0, 1.0); }
  let centre = (t.a + t.b + t.d) / 3.0;
  var o: MeshOut;
  // The rest, drawn as triangles, are put past the clip.
  let share = splatShare(t.gain);
  o.pos = select(vec4f(2.0, 2.0, 0.0, 1.0), clip(centre + c / f32(P.m)), share > 0.0);
  // Its share of half a cell's light, the triangle's area at the plate in texels.
  o.gain = 0.5 * share;
  o.tent = c;
  return o;
}

@fragment fn fs(in: MeshOut) -> @location(0) vec4f {
  let w = max(vec2f(0.0), vec2f(1.0) - abs(in.tent));
  return vec4f(in.gain * w.x * w.y, 0.0, 0.0, 1.0);
}
`;

/*
  What the display reads (binding 27, the eighth storage buffer of its
  fragment stage, which 31s-1's packed height held unread until this read
  it): the wall's traced light at the plate's uv, bilinear across the
  trace's texels. The header says what dz it was traced at; where that is
  not this draw's (another projector's uniforms, or the trace not built yet
  behind the show, when the buffer is the 4-float stand-in), the first-order
  shadowgraph draws instead, as it did before the trace. At Focus's middle
  nothing moves and both are 1.
*/
export const CAUSTIC_PLATE_WGSL = /* wgsl */ `
@group(0) @binding(27) var<storage, read> causticLight: array<f32>;

fn tracedLight(layer: u32, uv: vec2f) -> f32 {
  let dz = (U.projectorFocus - 0.5) * 1.5;
  if (abs(dz) <= 0.001) { return 1.0; }
  if (arrayLength(&causticLight) < 8u) { return -1.0; }
  if (abs(causticLight[0] - dz * max(1.0, U.boundaryContrast * 2.0)) > 1e-4) { return -1.0; }
  let m = i32(causticLight[1]);
  let base = 4u + layer * u32(m * m);
  let p = clamp(uv, vec2f(0.0), vec2f(1.0)) * f32(m) - 0.5;
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let x0 = clamp(b.x, 0, m - 1);
  let x1 = clamp(b.x + 1, 0, m - 1);
  let y0 = clamp(b.y, 0, m - 1);
  let y1 = clamp(b.y + 1, 0, m - 1);
  let l00 = causticLight[base + u32(y0 * m + x0)];
  let l10 = causticLight[base + u32(y0 * m + x1)];
  let l01 = causticLight[base + u32(y1 * m + x0)];
  let l11 = causticLight[base + u32(y1 * m + x1)];
  return mix(mix(l00, l10, f.x), mix(l01, l11, f.x), f.y);
}

/* The front plate's and the back plate's light on the wall: traced, or the first order. */
fn wallLight0(uv: vec2f) -> f32 {
  let l = tracedLight(0u, uv);
  if (l < 0.0) { return defocusShadow(derived0, uv); }
  return l;
}
fn wallLight1(uv: vec2f) -> f32 {
  let l = tracedLight(1u, uv);
  if (l < 0.0) { return defocusShadow(derived1, uv); }
  return l;
}
`;

/*
  The oil's share of the path the trace reads, from the surface's own
  height (PLAN 31s-1), in the derive pass (binding 6). calcOpl counts the oil
  as its share of the column, the view's oil read texel by texel; traced,
  that stair drew a drop's caustic rim as a string of beads, one a cell
  where the drop's curve crossed a row (the lab at Focus 0.6). It is also
  not the oil's shape: the share's edge is the phase field's, a cell or two,
  where a real drop's rim is a meniscus as wide as the capillary length,
  which 31s-1's levelled height carries. So .w takes the share's oil out and
  puts the height's in, dn h, read bilinear (an r32float texture: four
  loads, no sampler) and held to the gap it sits in. Only .w: .z (the
  pupil's loss, in focus) keeps the share until 31s-2b moves it too, so no
  look changes at Focus's middle. With no height (a plate with no oil, the
  1x1 stand-in) the share stays.
*/
export const SURFACE_PATH_WGSL = /* wgsl */ `
@group(0) @binding(6) var surfaceSrc: texture_2d<f32>;

fn surfaceLoad(i: i32, j: i32, n: i32) -> f32 {
  return textureLoad(surfaceSrc, vec2i(clamp(i, 0, n - 1), clamp(j, 0, n - 1)), 0).r;
}

/* The column's path with the oil from its height (metres), given calcOpl's o for view v at uv. */
fn surfacePath(o: f32, v: vec3f, uv: vec2f) -> f32 {
  let n = i32(textureDimensions(surfaceSrc).x);
  if (n < 4) { return o; }
  let p = uv * f32(n) - 0.5;
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let h = mix(mix(surfaceLoad(b.x, b.y, n), surfaceLoad(b.x + 1, b.y, n), f.x),
              mix(surfaceLoad(b.x, b.y + 1, n), surfaceLoad(b.x + 1, b.y + 1, n), f.x), f.y);
  let gapM = select(${DISH_GAP_METRES}, v.y * ${DISH_GAP_FIELD_METRES}, v.y > 0.001);
  let hg = select(1.0, clamp(v.y / 0.03, 0.3, 3.0), v.y > 0.001);
  return o - v.x * 0.137 * hg + 0.137 * clamp(h, 0.0, gapM) / ${DISH_GAP_METRES};
}
`;
