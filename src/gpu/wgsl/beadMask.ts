/**
 * The oil beads' mask, drawn on the GPU (PLAN.md 14ab-6).
 *
 * What the CPU drew into a canvas and uploaded every frame the beads moved,
 * drawn here from the list `lib/beadPack.ts` writes (each bead once, and
 * which beads reach each sixteen-pixel tile). The arithmetic is the CPU's, a
 * line for a line, so the picture the plate reads is the one it always read:
 *
 *   rings   `BeadField.render`: each bead's interior over the ones before it
 *           (a radial gradient, magenta at the centre to red at the edge, at
 *           the bead's fade-in), then every rim added into green alone.
 *           The canvas's antialiasing is a pixel's coverage, which is taken
 *           here as the distance to the edge plus a half, clamped.
 *   drops   `rasterDrops`, in its three steps: who owns each pixel and what
 *           it is drawn as (`drops`), the holes the clamped walls leave
 *           between three or four drops closed from a neighbour twice over
 *           (`holes`), and each drop's passenger drawn inside its host
 *           (`finish`, which also writes the picture).
 *
 * The drops' first step keeps each pixel's owner, the hole flag and the two
 * halves' colours in a buffer, the colours as bytes, which is what the CPU's
 * picture held them as between its steps: the passenger's dome is worked out
 * from the host's red and blue as stored, so quantising them here where the
 * CPU did keeps the passenger's arithmetic the CPU's.
 *
 * Where it can differ from the CPU, and by how much, is `npm run beadmask`'s
 * to say: the hole fill reads its neighbours as they stood before the pass
 * (two passes, as the CPU's two), where the CPU's loop could take a
 * neighbour it had filled a moment before in the same pass.
 */

import { BEAD_TILE } from '../../lib/beadPack';

const COMMON = /* wgsl */ `
struct Args {
  S: u32,
  tiles: u32,
  wide: u32,
  amount: f32,
}

// lib/beadPack.ts writes these, BEAD_FLOATS (24) floats each.
struct Bead {
  p: vec4f,     // centre x, y and radius in mask pixels, fade-in
  q: vec4f,     // the rim's alpha, the rim's width, the oval's length, how far it reaches
  u: vec2f,     // the oval's long direction
  cut0: u32,    // its first wall in cuts
  nCut: u32,
  col: vec4f,   // its colour; w is 1 when it carries a passenger
  inn: vec4f,   // the passenger's centre, radius and rim width
  icol: vec4f,  // the passenger's colour
}

const TILE: u32 = ${BEAD_TILE}u;

@group(0) @binding(0) var<uniform> args: Args;
`;

/** The rings' mask, written straight into the picture. */
const RINGS = /* wgsl */ `${COMMON}
@group(0) @binding(1) var<storage, read> beads: array<Bead>;
@group(0) @binding(2) var<storage, read> tiles: array<u32>;
@group(0) @binding(3) var mask: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= args.S || g.y >= args.S) { return; }
  let t = (g.y / TILE) * args.tiles + g.x / TILE;
  let list = args.tiles * args.tiles + 1u;
  let pos = vec2f(g.xy) + 0.5;
  // Over black: red is coverage times fade, blue the dome under it.
  var col = vec3f(0.0);
  for (var k = tiles[t]; k < tiles[t + 1u]; k++) {
    let b = beads[tiles[list + k]];
    let rr = b.p.z;
    let d = length(pos - b.p.xy);
    let cov = clamp(rr - d + 0.5, 0.0, 1.0);
    if (cov <= 0.0) { continue; }
    let a = cov * b.p.w;
    col = vec3f(1.0, 0.0, 1.0 - min(d / rr, 1.0)) * a + col * (1.0 - a);
  }
  // The rims, a line lw wide whose outer edge is the bead's, added.
  var rim = 0.0;
  for (var k = tiles[t]; k < tiles[t + 1u]; k++) {
    let b = beads[tiles[list + k]];
    let lw = b.q.y;
    let d = length(pos - b.p.xy);
    rim += b.q.x * clamp(lw * 0.5 - abs(d - (b.p.z - lw * 0.5)) + 0.5, 0.0, 1.0);
  }
  textureStore(mask, vec2i(g.xy), vec4f(col.r, min(rim, 1.0), col.b, 1.0));
}
`;

/** The drops' owners and colours, into the state buffer. */
const DROPS = /* wgsl */ `${COMMON}
@group(0) @binding(1) var<storage, read> beads: array<Bead>;
@group(0) @binding(2) var<storage, read> tiles: array<u32>;
@group(0) @binding(3) var<storage, read> cuts: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> state: array<vec4u>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= args.S || g.y >= args.S) { return; }
  let t = (g.y / TILE) * args.tiles + g.x / TILE;
  let list = args.tiles * args.tiles + 1u;
  let px = f32(g.x);
  let py = f32(g.y);
  var own = 0.0;
  var id = 0u;
  var hole = 0u;
  var left = vec3f(0.0);
  var right = vec3f(0.0);
  for (var k = tiles[t]; k < tiles[t + 1u]; k++) {
    let i = tiles[list + k];
    let b = beads[i];
    let x0 = b.p.x;
    let y0 = b.p.y;
    let R = b.p.z;
    let A = b.q.z;
    let ext = b.q.w;
    // The rows and each row's span the CPU's loop visits, and no others.
    if (py < floor(y0 - ext) || py > ceil(y0 + ext)) { continue; }
    let vy = py + 0.5 - y0;
    let span = sqrt(max(0.0, ext * ext - vy * vy));
    if (px < floor(x0 - span) || px > ceil(x0 + span)) { continue; }
    let vx = px + 0.5 - x0;
    var d: f32;
    if (A > 1.0) {
      let along = (vx * b.u.x + vy * b.u.y) / A;
      let across = (vy * b.u.x - vx * b.u.y) * A;
      d = sqrt(along * along + across * across);
    } else {
      d = sqrt(vx * vx + vy * vy);
    }
    if (d > ext) { continue; }
    // The least and second least distance to the edge, and to a wall.
    var edge = R - d;
    var second = 1e9;
    var wall = 1e9;
    for (var q = b.cut0; q < b.cut0 + b.nCut; q++) {
      let c = cuts[q];
      var s: f32;
      if (c.w == 0.0) {
        s = c.z - (vx * c.x + vy * c.y);
      } else {
        let along = c.z - c.w;
        let ax = vx - c.x * along;
        let ay = vy - c.y * along;
        s = c.w - sign(c.w) * sqrt(ax * ax + ay * ay);
      }
      wall = min(wall, s);
      if (s < edge) { second = edge; edge = s; } else if (s < second) { second = s; }
    }
    let kS = 0.2 * R;
    let gap = second - edge;
    let hS = select(0.0, (kS - gap) / kS, gap < kS);
    let soft = edge - hS * hS * kS * 0.25;
    let cov = select(0.0, min(1.0, R - d + 0.5), wall > 0.0);
    if (cov <= 0.0) {
      if (wall <= 0.0 && d < R) { hole = 1u; }
      // The colour's halo, where nothing owns the pixel yet.
      if (own == 0.0 && edge > -1.0) { right = b.col.rgb; }
      continue;
    }
    let a = cov * b.p.w;
    if (a <= own) { continue; }
    own = a;
    id = i + 1u;
    let h = clamp(soft / R, 0.0, 1.0);
    let ring = clamp(b.q.y - edge + 0.5, 0.0, 1.0) * cov * b.q.x;
    left = vec3f(a, ring, a * h);
    right = b.col.rgb;
  }
  state[g.y * args.S + g.x] = vec4u(id, hole, pack4x8unorm(vec4f(left, 1.0)), pack4x8unorm(vec4f(right, 1.0)));
}
`;

/** One pass of the hole fill: an unowned pixel inside a drop's circle takes its first owned neighbour. */
const HOLES = /* wgsl */ `${COMMON}
@group(0) @binding(1) var<storage, read> src: array<vec4u>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4u>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let S = args.S;
  if (g.x >= S || g.y >= S) { return; }
  let p = g.y * S + g.x;
  var s = src[p];
  if (s.y == 1u && s.x == 0u) {
    // The CPU's order: right, left, below, above.
    var q = -1;
    if (g.x + 1u < S && src[p + 1u].x != 0u) { q = i32(p + 1u); }
    else if (g.x > 0u && src[p - 1u].x != 0u) { q = i32(p - 1u); }
    else if (g.y + 1u < S && src[p + S].x != 0u) { q = i32(p + S); }
    else if (g.y > 0u && src[p - S].x != 0u) { q = i32(p - S); }
    if (q >= 0) {
      let n = src[u32(q)];
      s = vec4u(n.x, s.y, n.z, n.w);
    }
  }
  dst[p] = s;
}
`;

/** Each drop's passenger inside its host, and the picture written: left half the dome, right half the colour. */
const FINISH = /* wgsl */ `${COMMON}
@group(0) @binding(1) var<storage, read> beads: array<Bead>;
@group(0) @binding(2) var<storage, read> state: array<vec4u>;
@group(0) @binding(3) var mask: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let S = args.S;
  if (g.x >= S || g.y >= S) { return; }
  let s = state[g.y * S + g.x];
  // In bytes, as the CPU's picture holds them between its steps.
  var left = round(unpack4x8unorm(s.z).rgb * 255.0);
  var right = round(unpack4x8unorm(s.w).rgb * 255.0);
  if (s.x > 0u) {
    let b = beads[s.x - 1u];
    if (b.col.w > 0.0 && left.r != 0.0) {
      let v = vec2f(g.xy) + 0.5 - b.inn.xy;
      let iR = b.inn.z;
      let edge = iR - sqrt(v.x * v.x + v.y * v.y);
      let cov = min(1.0, edge + 0.5);
      if (cov > 0.0) {
        let h = min(1.0, edge / iR);
        let w = cov * args.amount;
        let ring = clamp(b.inn.w - edge + 0.5, 0.0, 1.0) * w * b.q.x;
        left.g = max(left.g, ring * 255.0);
        let under = left.b / left.r;
        left.b = left.r * (under + (h - under) * w);
        right = right + (b.icol.rgb * 255.0 - right) * w;
      }
    }
  }
  textureStore(mask, vec2i(g.xy), vec4f(left / 255.0, 1.0));
  textureStore(mask, vec2i(i32(g.x + S), i32(g.y)), vec4f(right / 255.0, 1.0));
}
`;

export const BEAD_KERNELS = { beadRings: RINGS, beadDrops: DROPS, beadHoles: HOLES, beadFinish: FINISH } as const;
export type BeadKernel = keyof typeof BEAD_KERNELS;
