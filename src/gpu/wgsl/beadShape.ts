/**
 * The oil beads read by the plate, at the screen's own resolution where it
 * can (PLAN 38h-17), kept beside `plate.ts` and built into it where its bead
 * helpers stood (`beadWide`, `beadAt`, `beadColour` moved here with it).
 *
 * ── What was reported ──
 *
 * The owner, 2026-11-11, after 38h-15 made the bubbles round: "Fix the small
 * bubbles as well." Filmed on the Mac in Macro Bead, the small round things
 * with a dark wall and a lens inside, 40 to 60 pixels across, had wavy,
 * scalloped outlines. They are the oil beads (`beads`, `lib/beads.ts`), not
 * bubbles: Macro Bead lays them at 0.7 and a closeup at 2.1x frames them.
 * The lab, with Macro Bead's settings on a plate of beads and bubbles at
 * 3.2x, shows the same thing: every bead's rim a saw edge, every bubble's
 * round (38h-15).
 *
 * ── Why ──
 *
 * The same disease as the bubbles had. Each bead is an exact disc the CPU
 * moves, with a centre and a radius, and the GPU draws its mask from that
 * list (`gpu/beadMask.ts`, 14ab-6): but into a 512² picture of eight-bit
 * channels, and the plate reads the picture back through bilinear
 * filtering. In the closeup a mask texel is six to ten screen pixels, so the
 * coverage's contour is a polygon of hyperbolic pieces, one per texel, and
 * the dome the lens reads its push from (`dropLens`: the gradient of an
 * eight-bit height over a texel either way) steps by a level of 255 per
 * texel. The radius it infers from that gradient (1/|∇h|) jumps where the
 * steps do, and the push with it, so the wall the camera sees through the
 * bead's edge swings in and out round the rim: the scallops.
 *
 * ── What changed ──
 *
 * For the rings (`beadDrops` 0, every shipped look but those that turn the
 * drops on), the mask is one function of a point: each bead's coverage and
 * dome over the ones before it, and the rims added (`beadRings` in
 * `wgsl/beadMask.ts`). So the plate now evaluates that same function at the
 * point it is drawing, from the same list and the same tiles the mask was
 * drawn from, at float precision, with the edge's antialiasing one screen
 * pixel wide instead of one mask texel. The dome is exact, its gradient is
 * the disc's, and the outline is round at any zoom. The picture is still
 * drawn and stays the fallback: for the drops, whose walls and filled holes
 * take three passes over neighbours a single point cannot see, and for a
 * picture handed in place of a list (the lab's canvas masks).
 *
 * Cost: one tile's beads twice over (coverage, then rims), at each of the
 * lens's five reads, only where `beads` is on. A tile is sixteen mask texels
 * and holds a handful of beads; perf §46 measures it on the Mac.
 */
import { BEAD_STRUCT_WGSL } from './beadMask';
import { BEAD_TILE } from '../../lib/beadPack';

export const BEAD_SHAPE_WGSL = /* wgsl */ `
${BEAD_STRUCT_WGSL}
/** What gpu/beadMask.ts was last handed (its Args); S 0 when the plate has no list to read, only a picture. */
struct BeadArgs {
  S: u32,
  tiles: u32,
  wide: u32,
  amount: f32,
}
@group(0) @binding(20) var<uniform> beadArgs: BeadArgs;
@group(0) @binding(21) var<storage, read> beadList: array<Bead>;
@group(0) @binding(22) var<storage, read> beadTiles: array<u32>;
const BEAD_TILE_PX: f32 = ${BEAD_TILE}.0;

fn beadWide() -> bool {
  let d = textureDimensions(beadTex);
  return d.x > d.y;
}

/*
  The rings' mask at uv, as beadRings draws a texel of it, at uv itself.
  Coverage ramps over w mask pixels: a screen pixel (uvToFluid's scale) in
  the mask's units, never wider than the texel the picture ramped over.
*/
fn beadRingsAt(uv: vec2f) -> vec4f {
  let S = f32(beadArgs.S);
  let T = beadArgs.tiles;
  let pos = uv * S;
  let tc = clamp(vec2i(floor(pos / BEAD_TILE_PX)), vec2i(0), vec2i(i32(T) - 1));
  let t = u32(tc.y) * T + u32(tc.x);
  let list = T * T + 1u;
  let w = clamp(S / (max(U.resolution.x, U.resolution.y) * 1.5 * U.camZoom), 1e-3, 1.0);
  var col = vec3f(0.0);
  var rim = 0.0;
  for (var k = beadTiles[t]; k < beadTiles[t + 1u]; k++) {
    let b = beadList[beadTiles[list + k]];
    let rr = b.p.z;
    let d = length(pos - b.p.xy);
    let lw = b.q.y;
    rim += b.q.x * clamp((lw * 0.5 - abs(d - (rr - lw * 0.5))) / w + 0.5, 0.0, 1.0);
    let cov = clamp((rr - d) / w + 0.5, 0.0, 1.0);
    if (cov <= 0.0) { continue; }
    let a = cov * b.p.w;
    col = vec3f(1.0, 0.0, 1.0 - min(d / rr, 1.0)) * a + col * (1.0 - a);
  }
  return vec4f(col.r, min(rim, 1.0), col.b, 1.0);
}

/** Plate uv to the mask's own. Wide, the read is kept off the seam, where a
    bilinear tap would pick up the colour half's first column as a drop. */
fn beadAt(uv: vec2f) -> vec4f {
  if (beadArgs.S > 0u && beadArgs.wide == 0u) { return beadRingsAt(uv); }
  if (!beadWide()) { return tex2(beadTex, uv); }
  let w = f32(textureDimensions(beadTex).x);
  return tex2(beadTex, vec2f(clamp(uv.x * 0.5, 0.5 / w, 0.5 - 1.0 / w), uv.y));
}
/** The drop's colour at uv, as seen lit; only a wide mask has one. */
fn beadColour(uv: vec2f) -> vec3f {
  let w = f32(textureDimensions(beadTex).x);
  return tex2(beadTex, vec2f(clamp(0.5 + uv.x * 0.5, 0.5 + 1.0 / w, 1.0 - 0.5 / w), uv.y)).rgb;
}
`;
