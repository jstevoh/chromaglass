/**
 * The tank seen through its side, on the GPU (PLAN 47n; judged by
 * `npm run tankgpu` against the CPU reference, `src/lib/tank.ts`, whose header
 * has the physics and every shortcut's reason).
 *
 * Pass for pass the reference's substep, so the check can hold the two to
 * float32's rounding:
 *
 *   `tankBounds`   the step's held boundary flows: the nozzle in and the
 *                  level out through the surface, the drain out through the
 *                  floor (once a step, before the first substep, as the
 *                  reference's boundaryFlows);
 *   `tankDye`      the dye in flux form, minmod-limited, cell by cell from
 *                  `cIn` to `cOut`. Each cell works out its own four faces'
 *                  fluxes; a face shared by two cells is the same arithmetic
 *                  on the same numbers in both, so what one loses the other
 *                  gains and the total keeps to rounding;
 *   `tankAdvect`   the momentum carried back along the flow (midpoint rule),
 *                  bilinear on the staggered faces, `u`, `v` into `uT`, `vT`;
 *   `tankForce`    water's viscosity on what was carried, and the new dye's
 *                  weight on the y-faces, back into `u`, `v`;
 *   `tankDiv`      the cells' divergence;
 *   `tankSorRed`, `tankSorBlack`  one red-black SOR sweep on the pressure's
 *                  impulse `q`, in place (a red cell reads only black ones);
 *   `tankProject`  the interior faces lose q's gradient.
 *
 * One thread per cell, or per face corner ((nx+1) × (ny+1), which covers both
 * the x-faces and the y-faces) where a pass writes faces. Row 0 is the floor.
 */

const HEAD = /* wgsl */ `
struct TankU {
  nx: u32, ny: u32, i0: u32, i1: u32,
  k: f32, nuK: f32, gh: f32, omega: f32,
  feed: f32, levelOut: f32, floorOut: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> T: TankU;
fn cell(i: u32, j: u32) -> u32 { return j * T.nx + i; }
fn ux(i: u32, j: u32) -> u32 { return j * (T.nx + 1u) + i; }
fn vy(i: u32, j: u32) -> u32 { return j * T.nx + i; }
`;

const CELL_GUARD = /* wgsl */ `
  let i = gid.x; let j = gid.y;
  if (i >= T.nx || j >= T.ny) { return; }
`;

const FACE_GUARD = /* wgsl */ `
  let i = gid.x; let j = gid.y;
  if (i > T.nx || j > T.ny) { return; }
`;

// Bilinear samples of the faces, clamped as the reference's sampleU/sampleV. X, Y in cells.
const SAMPLE = /* wgsl */ `
fn sampleU(X: f32, Y: f32) -> f32 {
  let nx = f32(T.nx); let ny = f32(T.ny);
  let fx = clamp(X, 0.0, nx); let fy = clamp(Y - 0.5, 0.0, ny - 1.0);
  let i = min(T.nx - 1u, u32(floor(fx)));
  let j = min(T.ny - 2u, u32(floor(fy)));
  let a = fx - f32(i); let b = fy - f32(j);
  return (uSrc[ux(i, j)] * (1.0 - a) + uSrc[ux(i + 1u, j)] * a) * (1.0 - b)
       + (uSrc[ux(i, j + 1u)] * (1.0 - a) + uSrc[ux(i + 1u, j + 1u)] * a) * b;
}
fn sampleV(X: f32, Y: f32) -> f32 {
  let nx = f32(T.nx); let ny = f32(T.ny);
  let fx = clamp(X - 0.5, 0.0, nx - 1.0); let fy = clamp(Y, 0.0, ny);
  let i = min(T.nx - 2u, u32(floor(fx)));
  let j = min(T.ny - 1u, u32(floor(fy)));
  let a = fx - f32(i); let b = fy - f32(j);
  return (vSrc[vy(i, j)] * (1.0 - a) + vSrc[vy(i + 1u, j)] * a) * (1.0 - b)
       + (vSrc[vy(i, j + 1u)] * (1.0 - a) + vSrc[vy(i + 1u, j + 1u)] * a) * b;
}
`;

const BOUNDS = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read_write> v: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= T.nx) { return; }
  let fed = i >= T.i0 && i < T.i1;
  v[vy(i, T.ny)] = select(T.levelOut, -T.feed, fed);
  v[vy(i, 0u)] = -T.floorOut;
}
`;

const DYE = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> u: array<f32>;
@group(0) @binding(2) var<storage, read> v: array<f32>;
@group(0) @binding(3) var<storage, read> cIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> cOut: array<f32>;
fn cAt(i: i32, j: i32) -> f32 {
  let ii = u32(clamp(i, 0, i32(T.nx) - 1)); let jj = u32(clamp(j, 0, i32(T.ny) - 1));
  return cIn[cell(ii, jj)];
}
fn minmod(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return select(b, a, abs(a) < abs(b));
}
// The flux across x-face (i, j), in c·cells a substep. Zero on the walls.
fn fluxX(i: i32, j: i32) -> f32 {
  if (i <= 0 || i >= i32(T.nx)) { return 0.0; }
  let vel = u[ux(u32(i), u32(j))];
  var cf: f32;
  if (vel >= 0.0) {
    cf = cAt(i - 1, j) + 0.5 * (1.0 - vel * T.k) * minmod(cAt(i - 1, j) - cAt(i - 2, j), cAt(i, j) - cAt(i - 1, j));
  } else {
    cf = cAt(i, j) - 0.5 * (1.0 + vel * T.k) * minmod(cAt(i, j) - cAt(i - 1, j), cAt(i + 1, j) - cAt(i, j));
  }
  return vel * cf * T.k;
}
// Across y-face (i, j): the floor (j = 0) lets the bottom cell's dye out, the
// surface (j = ny) lets the nozzle's in and the top cell's out.
fn fluxY(i: i32, j: i32) -> f32 {
  let vel = v[vy(u32(i), u32(j))];
  var cf: f32;
  if (j == 0) {
    cf = select(0.0, cAt(i, 0), vel < 0.0);
  } else if (j == i32(T.ny)) {
    let fed = u32(i) >= T.i0 && u32(i) < T.i1;
    cf = select(cAt(i, j - 1), select(0.0, 1.0, fed), vel < 0.0);
  } else if (vel >= 0.0) {
    cf = cAt(i, j - 1) + 0.5 * (1.0 - vel * T.k) * minmod(cAt(i, j - 1) - cAt(i, j - 2), cAt(i, j) - cAt(i, j - 1));
  } else {
    cf = cAt(i, j) - 0.5 * (1.0 + vel * T.k) * minmod(cAt(i, j) - cAt(i, j - 1), cAt(i, j + 1) - cAt(i, j));
  }
  return vel * cf * T.k;
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
${CELL_GUARD}
  let I = i32(i); let J = i32(j);
  cOut[cell(i, j)] = cIn[cell(i, j)] + fluxX(I, J) - fluxX(I + 1, J) + fluxY(I, J) - fluxY(I, J + 1);
}
`;

const ADVECT = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> uSrc: array<f32>;
@group(0) @binding(2) var<storage, read> vSrc: array<f32>;
@group(0) @binding(3) var<storage, read_write> uT: array<f32>;
@group(0) @binding(4) var<storage, read_write> vT: array<f32>;
${SAMPLE}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
${FACE_GUARD}
  if (j < T.ny) {
    if (i >= 1u && i < T.nx) {
      let X = f32(i); let Y = f32(j) + 0.5;
      let a = uSrc[ux(i, j)]; let b = sampleV(X, Y);
      let Xm = X - 0.5 * T.k * a; let Ym = Y - 0.5 * T.k * b;
      let Xd = X - T.k * sampleU(Xm, Ym); let Yd = Y - T.k * sampleV(Xm, Ym);
      uT[ux(i, j)] = sampleU(Xd, Yd);
    } else {
      uT[ux(i, j)] = uSrc[ux(i, j)];
    }
  }
  if (i < T.nx) {
    if (j >= 1u && j < T.ny) {
      let X = f32(i) + 0.5; let Y = f32(j);
      let a = sampleU(X, Y); let b = vSrc[vy(i, j)];
      let Xm = X - 0.5 * T.k * a; let Ym = Y - 0.5 * T.k * b;
      let Xd = X - T.k * sampleU(Xm, Ym); let Yd = Y - T.k * sampleV(Xm, Ym);
      vT[vy(i, j)] = sampleV(Xd, Yd);
    } else {
      vT[vy(i, j)] = vSrc[vy(i, j)];
    }
  }
}
`;

/*
  Glass is no-slip (past a wall the tangential flow mirrors negative), the
  surface stress-free (past it the tangential flow mirrors positive). The
  weight is the mean of the new dye either side of a y-face.
*/
const FORCE = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> uT: array<f32>;
@group(0) @binding(2) var<storage, read> vT: array<f32>;
@group(0) @binding(3) var<storage, read> c: array<f32>;
@group(0) @binding(4) var<storage, read_write> u: array<f32>;
@group(0) @binding(5) var<storage, read_write> v: array<f32>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
${FACE_GUARD}
  if (j < T.ny) {
    if (i >= 1u && i < T.nx) {
      let m = uT[ux(i, j)];
      let dn = select(-m, uT[ux(i, max(j, 1u) - 1u)], j > 0u);
      let up = select(m, uT[ux(i, min(j + 1u, T.ny - 1u))], j < T.ny - 1u);
      u[ux(i, j)] = m + T.nuK * (uT[ux(i - 1u, j)] + uT[ux(i + 1u, j)] + dn + up - 4.0 * m);
    } else {
      u[ux(i, j)] = uT[ux(i, j)];
    }
  }
  if (i < T.nx) {
    if (j >= 1u && j < T.ny) {
      let m = vT[vy(i, j)];
      let lf = select(-m, vT[vy(max(i, 1u) - 1u, j)], i > 0u);
      let rt = select(-m, vT[vy(min(i + 1u, T.nx - 1u), j)], i < T.nx - 1u);
      let weight = T.gh * 0.5 * (c[cell(i, j - 1u)] + c[cell(i, j)]);
      v[vy(i, j)] = m + T.nuK * (lf + rt + vT[vy(i, j - 1u)] + vT[vy(i, j + 1u)] - 4.0 * m) - weight;
    } else {
      v[vy(i, j)] = vT[vy(i, j)];
    }
  }
}
`;

const DIV = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> u: array<f32>;
@group(0) @binding(2) var<storage, read> v: array<f32>;
@group(0) @binding(3) var<storage, read_write> div: array<f32>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
${CELL_GUARD}
  div[cell(i, j)] = u[ux(i + 1u, j)] - u[ux(i, j)] + v[vy(i, j + 1u)] - v[vy(i, j)];
}
`;

/*
  One colour of a sweep. The thread grid is half as wide as the tank: thread
  (h, j) takes cell i = 2h + ((j + colour) & 1), the reference's order (a
  colour's cells are those with i + j of its parity).
*/
const sor = (colour: number) => /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> div: array<f32>;
@group(0) @binding(2) var<storage, read_write> q: array<f32>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let j = gid.y;
  let i = gid.x * 2u + ((j + ${colour}u) & 1u);
  if (i >= T.nx || j >= T.ny) { return; }
  var sum = 0.0; var deg = 0.0;
  if (i > 0u) { sum += q[cell(i - 1u, j)]; deg += 1.0; }
  if (i < T.nx - 1u) { sum += q[cell(i + 1u, j)]; deg += 1.0; }
  if (j > 0u) { sum += q[cell(i, j - 1u)]; deg += 1.0; }
  if (j < T.ny - 1u) { sum += q[cell(i, j + 1u)]; deg += 1.0; }
  let k = cell(i, j);
  let want = (sum - div[k]) / deg;
  q[k] = q[k] + T.omega * (want - q[k]);
}
`;

const PROJECT = /* wgsl */ `${HEAD}
@group(0) @binding(1) var<storage, read> q: array<f32>;
@group(0) @binding(2) var<storage, read_write> u: array<f32>;
@group(0) @binding(3) var<storage, read_write> v: array<f32>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
${FACE_GUARD}
  if (j < T.ny && i >= 1u && i < T.nx) { u[ux(i, j)] -= q[cell(i, j)] - q[cell(i - 1u, j)]; }
  if (i < T.nx && j >= 1u && j < T.ny) { v[vy(i, j)] -= q[cell(i, j)] - q[cell(i, j - 1u)]; }
}
`;

export const TANK_KERNELS = {
  tankBounds: BOUNDS,
  tankDye: DYE,
  tankAdvect: ADVECT,
  tankForce: FORCE,
  tankDiv: DIV,
  tankSorRed: sor(0),
  tankSorBlack: sor(1),
  tankProject: PROJECT,
} as const;

export type TankKernel = keyof typeof TANK_KERNELS;

/** The uniform block's bytes (TankU: twelve 4-byte words). */
export const TANK_UNIFORM_BYTES = 48;
