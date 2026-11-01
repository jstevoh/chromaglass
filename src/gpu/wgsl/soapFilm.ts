/**
 * The draining vertical soap film on the GPU (PLAN.md §32, step 32c; judged by
 * `npm run soapgpu` in `scripts/soapgpu.mjs`).
 *
 * The physics, the numerical scheme, and the named shortcuts (a)–(e) are those
 * of the CPU reference (`src/lib/soapFilm.ts`, `stepSoapFilm`), translated pass
 * for pass into compute shaders so the plate can step a thickness field on the
 * GPU without carrying or running the CPU reference:
 *
 * 1. `soapSetup`: reduces the film's spatial mean thickness `hbar` across the
 *    grid, evaluates the unprojected vertical Darcy buoyancy velocity
 *      v* = (rho * g / zeta) * (h_face - hbar) * 1e-9
 *    on the interior horizontal faces (`j = 1 .. ny - 1`) with all four walls
 *    shut (`uf = 0`, `vf = 0` at `j = 0` and `j = ny`), reduces `maxStar = max |v*|`,
 *    and forms the unprojected cell divergence `rhs_ij = vf*[j+1, i] - vf*[j, i]`
 *    (or zeroes `uf`, `vf`, `p` and `rhs` when `maxStar <= 1e-18`, so a uniform
 *    film or `g = 0` moves nothing at all).
 *
 * 2. `soapSorRed` / `soapSorBlack`: solves the Neumann tension Poisson system
 *      deg_ij * p_ij - sum_neighbours(p) = -rhs_ij
 *    on the staggered MAC grid by red-black successive over-relaxation with
 *    optimal relaxation factor `omega = 2 / (1 + sin(pi / max(nx, ny)))`,
 *    warm-started from the previous step's tension `p` (mean-centred in
 *    `soapSetup` so floating-point gauge drift cannot accumulate over thousands
 *    of steps in float32, and reset when `g` changes or a new thickness field is
 *    written). Because red cells depend only on black neighbours and black cells
 *    only on red neighbours, each half-sweep dispatches one thread per cell of
 *    its colour across the grid.
 *
 * 3. `soapProject`: projects the interior MAC face velocities
 *      uf[i, j] = -(p[i, j] - p[i-1, j])
 *      vf[i, j] = vf*[i, j] - (p[i, j] - p[i, j-1])
 *    with all four walls strictly zero, reduces the maximum face speed `uMax`,
 *    and computes the CFL sub-step count `steps = max(1, ceil(uMax * dt / (0.45 * dx)))`
 *    and sub-step size `subDt = dt / steps`.
 *
 * 4. `soapTransport`: advances `h` through `steps` conservative flux-form
 *    sub-steps using second-order upwind reconstruction with the minmod slope
 *    limiter (`sx`, `sy`). Each interior face flux `fx`, `fy` is computed once
 *    into a shared face buffer and used by both adjacent cells, with inflow
 *    into any black cell blocked so a black spot never refills. Then the frame's
 *    Plateau border takes Frankel's share at each frame cell (32f), optional
 *    evaporation (`evap` nm/s) thins the film, and black spots turn on Vrij's
 *    clock and hand their liquid to a rim (32g), as `src/lib/soapFilm.ts` does.
 */

const ARGS = /* wgsl */ `
struct SoapArgs {
  // nx, ny, n = nx * ny, resetP (1 when tension p must be zeroed, 0 when warm-started)
  grid: vec4u,
  // dt, dx, g, evap
  step: vec4f,
  // scale = (RHO_WATER * g * 1e-9) / zeta, omega, 0 (unused), zeta
  phys: vec4f,
  // minIter, maxIter, halfNx = (nx + 1) / 2, 0
  sor: vec4u,
  // border r0 (m, 0 for none), frankelK = mu rho |g| 1e-9 / (zeta sigma), lift = rho |g| / sigma,
  // vrij = 96 pi^2 sigma mu / A^2 for h in nm (1e-45 of the SI value)
  film: vec4f,
};
@group(0) @binding(0) var<uniform> U: SoapArgs;

const RHO_WATER: f32 = 1000.0;
const DEFAULT_ZETA: f32 = 1.5;
const NEWTON_BLACK_NM: f32 = 8.0;

fn minmod(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return select(b, a, abs(a) < abs(b));
}
`;

const SETUP = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> h: array<f32>;
@group(0) @binding(2) var<storage, read_write> uf: array<f32>;
@group(0) @binding(3) var<storage, read_write> vf: array<f32>;
@group(0) @binding(4) var<storage, read_write> p: array<f32>;
@group(0) @binding(5) var<storage, read_write> rhs: array<f32>;
@group(0) @binding(6) var<storage, read_write> ruptured: array<u32>;
@group(0) @binding(7) var<storage, read_write> stats: array<f32>;

var<workgroup> wgScratch: array<vec2f, 256>;
var<workgroup> wgMeans: vec2f;
var<workgroup> wgMaxStar: f32;

@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let nx = U.grid.x;
  let ny = U.grid.y;
  let n = U.grid.z;
  let resetP = U.grid.w;
  if (nx == 0u || ny == 0u) { return; }

  var hSum = 0.0;
  var pSum = 0.0;
  for (var i = t; i < n; i += 256u) {
    let hi = h[i];
    hSum += hi;
    if (resetP == 0u) {
      pSum += p[i];
    }
  }
  wgScratch[t] = vec2f(hSum, pSum);
  workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) {
    if (t < w) { wgScratch[t] += wgScratch[t + w]; }
    workgroupBarrier();
  }
  if (t == 0u) {
    let means = wgScratch[0] / f32(n);
    wgMeans = means;
    stats[0] = means.x;
  }
  workgroupBarrier();
  let means = workgroupUniformLoad(&wgMeans);
  let hbar = means.x;
  let meanP = means.y;

  let g = U.step.z;
  let scale = U.phys.x;
  let nVf = nx * (ny + 1u);
  var localMaxStar = 0.0;
  for (var idx = t; idx < nVf; idx += 256u) {
    let j = idx / nx;
    let i = idx % nx;
    var vStar = 0.0;
    if (g != 0.0 && n > 1u && j > 0u && j < ny) {
      let hFace = 0.5 * (h[(j - 1u) * nx + i] + h[j * nx + i]);
      vStar = scale * (hFace - hbar);
      let av = abs(vStar);
      if (av > localMaxStar) { localMaxStar = av; }
    }
    vf[idx] = vStar;
  }
  wgScratch[t] = vec2f(localMaxStar, 0.0);
  storageBarrier();
  workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) {
    if (t < w) { wgScratch[t].x = max(wgScratch[t].x, wgScratch[t + w].x); }
    workgroupBarrier();
  }
  if (t == 0u) {
    wgMaxStar = wgScratch[0].x;
    stats[1] = wgScratch[0].x;
  }
  workgroupBarrier();
  let maxStar = workgroupUniformLoad(&wgMaxStar);

  let nUf = (nx + 1u) * ny;
  for (var idx = t; idx < nUf; idx += 256u) {
    uf[idx] = 0.0;
  }
  if (maxStar <= 1e-18) {
    for (var idx = t; idx < nVf; idx += 256u) {
      vf[idx] = 0.0;
    }
    for (var c = t; c < n; c += 256u) {
      rhs[c] = 0.0;
      p[c] = 0.0;
    }
  } else {
    for (var c = t; c < n; c += 256u) {
      let j = c / nx;
      let i = c % nx;
      let vSouth = select(0.0, vf[(j + 1u) * nx + i], j < ny - 1u);
      let vNorth = select(0.0, vf[j * nx + i], j > 0u);
      rhs[c] = vSouth - vNorth;
      if (resetP != 0u) {
        p[c] = 0.0;
      } else {
        p[c] -= meanP;
      }
    }
  }
}
`;

const sorHalf = (parity: 0 | 1) => /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read_write> p: array<f32>;
@group(0) @binding(2) var<storage, read> rhs: array<f32>;
@group(0) @binding(3) var<storage, read> stats: array<f32>;

@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let nx = U.grid.x;
  let ny = U.grid.y;
  let halfNx = U.sor.z;
  let idx = gid.x;
  if (idx >= halfNx * ny) { return; }
  if (stats[1] <= 1e-18) { return; }

  let j = idx / halfNx;
  let hx = idx % halfNx;
  let i = 2u * hx + ((j + ${parity}u) & 1u);
  if (i >= nx) { return; }

  let c = j * nx + i;
  var sumQ = 0.0;
  var deg = 0.0;
  if (i > 0u) { sumQ += p[c - 1u]; deg += 1.0; }
  if (i + 1u < nx) { sumQ += p[c + 1u]; deg += 1.0; }
  if (j > 0u) { sumQ += p[c - nx]; deg += 1.0; }
  if (j + 1u < ny) { sumQ += p[c + nx]; deg += 1.0; }
  if (deg > 0.0) {
    let qTarget = (sumQ - rhs[c]) / deg;
    p[c] += U.phys.y * (qTarget - p[c]);
  }
}
`;

const SOR_RED = sorHalf(0);
const SOR_BLACK = sorHalf(1);

const PROJECT = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> p: array<f32>;
@group(0) @binding(2) var<storage, read_write> uf: array<f32>;
@group(0) @binding(3) var<storage, read_write> vf: array<f32>;
@group(0) @binding(4) var<storage, read_write> stats: array<f32>;

var<workgroup> wgScratch: array<f32, 256>;
var<workgroup> wgMaxStar: f32;

@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let nx = U.grid.x;
  let ny = U.grid.y;
  if (nx == 0u || ny == 0u) { return; }
  if (t == 0u) { wgMaxStar = stats[1]; }
  workgroupBarrier();
  let maxStar = workgroupUniformLoad(&wgMaxStar);
  if (maxStar <= 1e-18) {
    if (t == 0u) {
      stats[2] = 0.0;
      stats[3] = 0.0;
      stats[4] = 0.0;
      stats[5] = 0.0;
    }
    return;
  }

  var localUMax = 0.0;
  let nUf = (nx + 1u) * ny;
  for (var idx = t; idx < nUf; idx += 256u) {
    let j = idx / (nx + 1u);
    let i = idx % (nx + 1u);
    var val = 0.0;
    if (i > 0u && i < nx) {
      let row = j * nx;
      val = -(p[row + i] - p[row + i - 1u]);
      let a = abs(val);
      if (a > localUMax) { localUMax = a; }
    }
    uf[idx] = val;
  }

  let nVf = nx * (ny + 1u);
  for (var idx = t; idx < nVf; idx += 256u) {
    let j = idx / nx;
    let i = idx % nx;
    var val = 0.0;
    if (j > 0u && j < ny) {
      val = vf[idx] - (p[j * nx + i] - p[(j - 1u) * nx + i]);
      let a = abs(val);
      if (a > localUMax) { localUMax = a; }
    }
    vf[idx] = val;
  }

  wgScratch[t] = localUMax;
  workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) {
    if (t < w) { wgScratch[t] = max(wgScratch[t], wgScratch[t + w]); }
    workgroupBarrier();
  }
  if (t == 0u) {
    let uMax = wgScratch[0];
    let dt = U.step.x;
    let dx = U.step.y;
    stats[2] = uMax;
    if (dt > 0.0) {
      let steps = max(1.0, ceil((uMax * dt) / (0.45 * dx)));
      let subDt = dt / steps;
      stats[3] = steps;
      stats[4] = subDt;
      stats[5] = subDt / dx;
    } else {
      stats[3] = 0.0;
      stats[4] = 0.0;
      stats[5] = 0.0;
    }
  }
}
`;

const TRANSPORT = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read_write> h: array<f32>;
@group(0) @binding(2) var<storage, read> uf: array<f32>;
@group(0) @binding(3) var<storage, read> vf: array<f32>;
@group(0) @binding(4) var<storage, read_write> ruptured: array<u32>;
@group(0) @binding(5) var<storage, read> stats: array<f32>;
@group(0) @binding(6) var<storage, read_write> slopes: array<vec2f>;
@group(0) @binding(7) var<storage, read_write> fluxes: array<f32>;
@group(0) @binding(8) var<storage, read_write> age: array<f32>;

// One side of a frame cell gives its film to the Plateau border (src/lib/soapFilm.ts
// drainToBorder): Frankel's fresh film h_f = 2.68 r Ca^(2/3) at the buoyant exchange
// speed V = rho g (h - h_f) / zeta, solved by bisection, then h relaxes toward h_f at V / dx.
fn borderSide(hc: f32, r: f32, dt: f32, dx: f32, g: f32, zeta: f32) -> f32 {
  if (hc <= NEWTON_BLACK_NM) { return hc; }
  let frankel = 2.68 * r * 1e9;
  var lo = NEWTON_BLACK_NM;
  var hi = hc;
  for (var it = 0; it < 32; it++) {
    let x = 0.5 * (lo + hi);
    if (x < frankel * pow(U.film.y * (hc - x), 2.0 / 3.0)) { lo = x; } else { hi = x; }
  }
  let hf = 0.5 * (lo + hi);
  let V = RHO_WATER * abs(g) * (hc - hf) * 1e-9 / zeta;
  return hf + (hc - hf) * exp(-V * dt / dx);
}

var<workgroup> wgSteps: u32;
var<workgroup> wgSubDt: f32;
var<workgroup> wgDtdx: f32;

@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let nx = U.grid.x;
  let ny = U.grid.y;
  let n = U.grid.z;
  let dt = U.step.x;
  let dx = U.step.y;
  let evap = U.step.w;
  if (nx == 0u || ny == 0u || dt <= 0.0) { return; }

  if (t == 0u) {
    wgSteps = u32(stats[3]);
    wgSubDt = stats[4];
    wgDtdx = stats[5];
  }
  workgroupBarrier();
  let steps = workgroupUniformLoad(&wgSteps);
  let subDt = workgroupUniformLoad(&wgSubDt);
  let dtdx = workgroupUniformLoad(&wgDtdx);
  let nUf = (nx + 1u) * ny;
  let nVf = nx * (ny + 1u);

  for (var s = 0u; s < steps; s++) {
    for (var c = t; c < n; c += 256u) {
      let j = c / nx;
      let i = c % nx;
      let hc = h[c];
      var sx = 0.0;
      var sy = 0.0;
      if (i > 0u && i + 1u < nx) {
        sx = minmod(hc - h[c - 1u], h[c + 1u] - hc);
      }
      if (j > 0u && j + 1u < ny) {
        sy = minmod(hc - h[c - nx], h[c + nx] - hc);
      }
      slopes[c] = vec2f(sx, sy);
    }
    storageBarrier();
    workgroupBarrier();

    for (var idx = t; idx < nUf; idx += 256u) {
      let j = idx / (nx + 1u);
      let i = idx % (nx + 1u);
      var fVal = 0.0;
      if (i > 0u && i < nx) {
        let row = j * nx;
        let vel = uf[idx];
        let cL = row + i - 1u;
        let cR = row + i;
        let blocked = ((ruptured[cR] != 0u && vel > 0.0) || (ruptured[cL] != 0u && vel < 0.0));
        if (!blocked) {
          let cfl = min(1.0, (abs(vel) * subDt) / dx);
          let hFace = select(
            h[cR] - 0.5 * (1.0 - cfl) * slopes[cR].x,
            h[cL] + 0.5 * (1.0 - cfl) * slopes[cL].x,
            vel >= 0.0
          );
          fVal = vel * hFace;
        }
      }
      fluxes[idx] = fVal;
    }

    for (var idx = t; idx < nVf; idx += 256u) {
      let j = idx / nx;
      let i = idx % nx;
      var fVal = 0.0;
      if (j > 0u && j < ny) {
        let cN = (j - 1u) * nx + i;
        let cS = j * nx + i;
        let vel = vf[idx];
        let blocked = ((ruptured[cS] != 0u && vel > 0.0) || (ruptured[cN] != 0u && vel < 0.0));
        if (!blocked) {
          let cfl = min(1.0, (abs(vel) * subDt) / dx);
          let hFace = select(
            h[cS] - 0.5 * (1.0 - cfl) * slopes[cS].y,
            h[cN] + 0.5 * (1.0 - cfl) * slopes[cN].y,
            vel >= 0.0
          );
          fVal = vel * hFace;
        }
      }
      fluxes[nUf + idx] = fVal;
    }
    storageBarrier();
    workgroupBarrier();

    for (var c = t; c < n; c += 256u) {
      let j = c / nx;
      let i = c % nx;
      let uRow = j * (nx + 1u);
      let fxE = fluxes[uRow + i + 1u];
      let fxW = fluxes[uRow + i];
      let fyS = fluxes[nUf + (j + 1u) * nx + i];
      let fyN = fluxes[nUf + j * nx + i];
      h[c] -= dtdx * (fxE - fxW + fyS - fyN);
    }
    storageBarrier();
    workgroupBarrier();
  }

  // The frame's Plateau border, its radius graded by hydrostatics (drainToBorder).
  let r0 = U.film.x;
  let g = U.step.z;
  if (r0 > 0.0 && g != 0.0) {
    let zeta = U.phys.w;
    let rOf = 1.0 / (1.0 / r0 + U.film.z * f32(ny) * dx);
    for (var c = t; c < n; c += 256u) {
      let j = c / nx;
      let i = c % nx;
      let upper = select(j == ny - 1u, j == 0u, g > 0.0);
      let lower = select(j == 0u, j == ny - 1u, g > 0.0);
      let left = i == 0u;
      let right = i + 1u == nx;
      if (!(upper || lower || left || right) || ruptured[c] != 0u) { continue; }
      let z = select(f32(j) + 0.5, f32(ny) - 0.5 - f32(j), g > 0.0) * dx;
      let rSide = 1.0 / (1.0 / r0 + U.film.z * z);
      var hc = h[c];
      if (upper) { hc = borderSide(hc, rOf, dt, dx, g, zeta); }
      if (lower) { hc = borderSide(hc, r0, dt, dx, g, zeta); }
      if (left) { hc = borderSide(hc, rSide, dt, dx, g, zeta); }
      if (right) { hc = borderSide(hc, rSide, dt, dx, g, zeta); }
      h[c] = hc;
    }
  }

  // Evaporation, a real loss to the air; never past Newton black.
  if (evap > 0.0) {
    for (var c = t; c < n; c += 256u) {
      if (ruptured[c] == 0u) { h[c] = max(NEWTON_BLACK_NM, h[c] - evap * dt); }
    }
  }

  // Black spots on Vrij's clock (blackSpots in src/lib/soapFilm.ts): the clock,
  // then which cells turn (a clock run out and the largest among its film
  // neighbours), then the rim takes their liquid, then they turn. slopes is
  // free scratch now: x the share each neighbour takes, y 1 for a turning cell.
  for (var c = t; c < n; c += 256u) {
    if (ruptured[c] == 0u) {
      let hh = h[c];
      age[c] += dt / (U.film.w * hh * hh * hh * hh * hh);
    }
  }
  storageBarrier();
  workgroupBarrier();
  for (var c = t; c < n; c += 256u) {
    var share = vec2f(0.0, 0.0);
    let a = age[c];
    if (ruptured[c] == 0u && a >= 1.0) {
      let j = c / nx;
      let i = c % nx;
      var film = 0u;
      var top = true;
      var nbs = array<u32, 4>(0u, 0u, 0u, 0u);
      var k = 0u;
      if (i > 0u) { nbs[k] = c - 1u; k++; }
      if (i + 1u < nx) { nbs[k] = c + 1u; k++; }
      if (j > 0u) { nbs[k] = c - nx; k++; }
      if (j + 1u < ny) { nbs[k] = c + nx; k++; }
      for (var q = 0u; q < k; q++) {
        let nb = nbs[q];
        if (ruptured[nb] != 0u) { continue; }
        film++;
        if (age[nb] > a || (age[nb] == a && nb > c)) { top = false; }
      }
      if (top && film > 0u) {
        share = vec2f(max(0.0, h[c] - NEWTON_BLACK_NM) / f32(film), 1.0);
      }
    }
    slopes[c] = share;
  }
  storageBarrier();
  workgroupBarrier();
  for (var c = t; c < n; c += 256u) {
    if (ruptured[c] != 0u || slopes[c].y != 0.0) { continue; }
    let j = c / nx;
    let i = c % nx;
    var gain = 0.0;
    var giver = 0.0;
    if (i > 0u && slopes[c - 1u].y != 0.0) { gain += slopes[c - 1u].x; giver = max(giver, age[c - 1u]); }
    if (i + 1u < nx && slopes[c + 1u].y != 0.0) { gain += slopes[c + 1u].x; giver = max(giver, age[c + 1u]); }
    if (j > 0u && slopes[c - nx].y != 0.0) { gain += slopes[c - nx].x; giver = max(giver, age[c - nx]); }
    if (j + 1u < ny && slopes[c + nx].y != 0.0) { gain += slopes[c + nx].x; giver = max(giver, age[c + nx]); }
    if (giver == 0.0) { continue; }
    h[c] += gain;
    if (age[c] >= 1.0 && giver > age[c]) { age[c] = giver; }
  }
  storageBarrier();
  workgroupBarrier();
  for (var c = t; c < n; c += 256u) {
    if (slopes[c].y != 0.0) {
      h[c] = NEWTON_BLACK_NM;
      ruptured[c] = 1u;
    }
  }
}
`;

export const SOAP_KERNELS = {
  soapSetup: SETUP,
  soapSorRed: SOR_RED,
  soapSorBlack: SOR_BLACK,
  soapProject: PROJECT,
  soapTransport: TRANSPORT,
} as const;

export type SoapKernel = keyof typeof SOAP_KERNELS;
