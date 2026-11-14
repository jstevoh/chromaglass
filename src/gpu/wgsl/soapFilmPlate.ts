/**
 * The soap film on the plate (PLAN 32d): the two things the plate does to the
 * frame's film that the film's own solver (`soapFilm.ts` beside this, 32c) does
 * not. Driven by `src/gpu/soapFilmPlate.ts`.
 *
 * 1. `soapAir`: the air the plate's tools and the music stir pushes the film.
 *
 *    A soap film is the textbook two-dimensional fluid (Couder 1989, Kellay and
 *    Goldburg 2002: soap-film tunnels are how 2D turbulence is studied), and
 *    the air on its two faces drags it. The film is thin (a micron) and the air
 *    is not, so the drag wins in a few milliseconds and the film moves with the
 *    air over it, less whatever its own tension has to take back to stay
 *    inextensible: the overdamped limit, u* = (buoyancy + ζ_air u_air) / ζ,
 *    with ζ_air = ζ for a film carried whole. That is what this writes into
 *    the solver's `ext` faces; the solver adds the buoyancy and projects the
 *    sum onto ∇·u = 0, so the stir comes out as the swirls and combed streaks a
 *    film shows when it is blown on, never as a stretch.
 *
 *    The air is the plate's own flow (`velForced`, the field the dye rides).
 *    Named shortcut (32d-1): there is no separate air solver over the film; the
 *    plate's flow is the stir the hands and the sound make, and the film takes
 *    it as its air.
 *
 * 2. `soapPullState` and `soapPull`: when the film has drained, the frame is
 *    dipped and drawn again.
 *
 *    A real film in a frame does not refill: it thins to Newton black from the
 *    top and bursts (Mysels, Shinoda and Frankel 1959). A performer dips the
 *    frame again. So when the film's mean thickness (the solver's stats[0],
 *    from this step's own setup) falls under `floorNm`, a fresh film is laid
 *    from the top of the frame down at `rowsPerStep`, the way a frame comes up
 *    out of the bath top first. A fresh film's thickness grows down the frame
 *    as the square root of the depth, the shape of a vertical film draining
 *    under gravity between surfaces that do not slip (Mysels' h ∝ √(μ z /
 *    ρ g t)), from `hTop` to `hBottom`, with a few percent of noise for the
 *    convection to grow its plumes from (the solver's own laid noise, 32a).
 *    This runs on the GPU from the solver's own stats: no readback.
 */

import { SOAP_FRAME_LO, SOAP_FRAME_SPAN } from '../soapFrame';

/** The fresh film's patches, cells apart (this pull and gpu/soapFilmPlate.ts's lay both): 6 mm. */
export const NOISE_CELLS = 6;

const ARGS = /* wgsl */ `
struct PlateArgs {
  // nx, ny, the step's seed, 0
  grid: vec4u,
  // m/s per unit of the plate's velocity, floorNm, rowsPerStep, hTop
  air: vec4f,
  // hBottom, noise share, 0, 0
  pull: vec4f,
};
@group(0) @binding(0) var<uniform> A: PlateArgs;
// Where the frame sits on the plate (gpu/soapFrame.ts).
const SOAP_FRAME_LO: f32 = ${SOAP_FRAME_LO};
const SOAP_FRAME_SPAN: f32 = ${SOAP_FRAME_SPAN};
`;

const AIR = /* wgsl */ `${ARGS}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> ext: array<f32>;

// The plate's velocity at a point in the film's frame (0..1 both ways, row 0
// at the top as the film's), between texels, turned into the film's axes. The
// plate's rows run up the picture (the display flips y) and the film's run
// down it, the way gravity does, so y is mirrored and so is its velocity.
fn plateVel(film: vec2f) -> vec2f {
  let uv = SOAP_FRAME_LO + vec2f(film.x, 1.0 - film.y) * SOAP_FRAME_SPAN;
  let size = vec2f(textureDimensions(vel));
  let p = clamp(uv * size - 0.5, vec2f(0.0), size - 1.0);
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let hi = min(i + 1, vec2i(size) - 1);
  let a = textureLoad(vel, i, 0).xy;
  let b = textureLoad(vel, vec2i(hi.x, i.y), 0).xy;
  let c = textureLoad(vel, vec2i(i.x, hi.y), 0).xy;
  let d = textureLoad(vel, hi, 0).xy;
  let v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return vec2f(v.x, -v.y);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let nx = A.grid.x;
  let ny = A.grid.y;
  let nUf = (nx + 1u) * ny;
  let nVf = nx * (ny + 1u);
  let k = id.x;
  if (k >= nUf + nVf) { return; }
  let size = vec2f(f32(nx), f32(ny));
  if (k < nUf) {
    // A horizontal face: x on the cell edge, y at the row's middle.
    let j = k / (nx + 1u);
    let i = k % (nx + 1u);
    ext[k] = plateVel(vec2f(f32(i), f32(j) + 0.5) / size).x * A.air.x;
  } else {
    let q = k - nUf;
    let j = q / nx;
    let i = q % nx;
    ext[k] = plateVel(vec2f(f32(i) + 0.5, f32(j)) / size).y * A.air.x;
  }
}
`;

const PULL_STATE = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> stats: array<f32>;
// [pulling (0 or 1), the front before this step, the front after it] in rows,
// and the pull's seed.
@group(0) @binding(2) var<storage, read_write> pull: array<f32>;

@compute @workgroup_size(1) fn main() {
  let ny = f32(A.grid.y);
  var on = pull[0];
  var front = pull[2];
  if (on < 0.5) {
    front = 0.0;
    if (stats[0] < A.air.y) { on = 1.0; pull[3] = f32(A.grid.z % 65536u); }
  }
  let before = front;
  if (on > 0.5) { front = min(ny, front + A.air.z); }
  pull[1] = before;
  pull[2] = front;
  // The frame is out of the bath: the film is whole again, and the next step
  // starts its front at the top, with no rows to lay until it drains again.
  if (on > 0.5 && front >= ny) { on = 0.0; }
  pull[0] = on;
}
`;

const PULL = /* wgsl */ `${ARGS}
const NOISE_CELLS: f32 = ${NOISE_CELLS}.0;
@group(0) @binding(1) var<storage, read> pull: array<f32>;
@group(0) @binding(2) var<storage, read_write> h: array<f32>;
@group(0) @binding(3) var<storage, read_write> ruptured: array<u32>;
@group(0) @binding(4) var<storage, read_write> age: array<f32>;

fn hash(x: u32) -> f32 {
  var v = x * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return f32((v >> 22u) ^ v) / 4294967295.0;
}

// The film's unevenness: value noise on a lattice NOISE_CELLS apart, smoothly
// between its points, so the patches have a size of their own (a few
// millimetres, as a drawn film's do) and not the grid's.
fn lattice(p: vec2i, seed: u32) -> f32 {
  return hash((u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ seed) * 2.0 - 1.0;
}
fn patchNoise(x: f32, y: f32, seed: u32) -> f32 {
  let p = vec2f(x, y) / NOISE_CELLS;
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(lattice(i, seed), lattice(i + vec2i(1, 0), seed), s.x),
             mix(lattice(i + vec2i(0, 1), seed), lattice(i + vec2i(1, 1), seed), s.x), s.y);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let nx = A.grid.x;
  let ny = A.grid.y;
  let c = id.x;
  if (c >= nx * ny) { return; }
  let j = f32(c / nx);
  // Only the rows the frame drew out of the bath on this step.
  if (j < floor(pull[1]) || j >= floor(pull[2])) { return; }
  let depth = (j + 0.5) / f32(ny);
  let laid = A.air.w + (A.pull.x - A.air.w) * sqrt(depth);
  // The seed is the pull's, not the step's: one film, laid row by row.
  let noise = patchNoise(f32(c % nx), j, u32(pull[3])) * A.pull.y;
  h[c] = laid * (1.0 + noise);
  ruptured[c] = 0u;
  age[c] = 0.0;
}
`;

export const SOAP_PLATE_KERNELS = {
  soapAir: AIR,
  soapPullState: PULL_STATE,
  soapPull: PULL,
} as const;

export type SoapPlateKernel = keyof typeof SOAP_PLATE_KERNELS;
