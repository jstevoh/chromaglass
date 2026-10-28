/**
 * The draining vertical soap film on the GPU (PLAN.md §32, step 32c; judged by
 * `npm run soapgpu` in `scripts/soapgpu.mjs`).
 *
 * The physics, the numerical scheme, and the named shortcuts (a)–(e) are those
 * of the CPU reference (`src/lib/soapFilm.ts`, `stepSoapFilm`), translated pass
 * for pass into compute shaders so the plate can step a thickness field on the
 * GPU without carrying or running the CPU reference:
 *
 * 1. `soapSetup`: marks any cell that has thinned below 30 nm (`BLACK_THRESHOLD_NM`)
 *    as ruptured, reduces the film's spatial mean thickness `hbar` across the
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
 *    into any ruptured cell blocked when `evap > 0` so a torn Newton-black hole
 *    never refills. Finally, when `evap > 0`, uniform evaporation (`evap` nm/s)
 *    thins unruptured film while cells below 30 nm relax exponentially toward
 *    the 8 nm Newton-black equilibrium over `BLACK_RELAX_TAU = 0.5` s.
 */

const ARGS = /* wgsl */ `
struct SoapArgs {
  // nx, ny, n = nx * ny, resetP (1 when tension p must be zeroed, 0 when warm-started)
  grid: vec4u,
  // dt, dx, g, evap
  step: vec4f,
  // scale = (RHO_WATER * g * 1e-9) / zeta, omega, decay = exp(-dt / BLACK_RELAX_TAU), zeta
  phys: vec4f,
  // minIter, maxIter, halfNx = (nx + 1) / 2, 0
  sor: vec4u,
};
@group(0) @binding(0) var<uniform> U: SoapArgs;

const RHO_WATER: f32 = 1000.0;
const DEFAULT_ZETA: f32 = 1.5;
const BLACK_THRESHOLD_NM: f32 = 30.0;
const NEWTON_BLACK_NM: f32 = 8.0;
const BLACK_RELAX_TAU: f32 = 0.5;

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
    if (hi < BLACK_THRESHOLD_NM) {
      ruptured[i] = 1u;
    }
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
  let decay = U.phys.z;
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
        let blocked = evap > 0.0 && ((ruptured[cR] != 0u && vel > 0.0) || (ruptured[cL] != 0u && vel < 0.0));
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
        let blocked = evap > 0.0 && ((ruptured[cS] != 0u && vel > 0.0) || (ruptured[cN] != 0u && vel < 0.0));
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

  if (evap > 0.0) {
    for (var c = t; c < n; c += 256u) {
      var hc = h[c];
      if (ruptured[c] != 0u || hc < BLACK_THRESHOLD_NM) {
        ruptured[c] = 1u;
        let clamped = min(hc, BLACK_THRESHOLD_NM - 0.1);
        h[c] = NEWTON_BLACK_NM + (clamped - NEWTON_BLACK_NM) * decay;
      } else {
        hc = max(NEWTON_BLACK_NM, hc - evap * dt);
        if (hc < BLACK_THRESHOLD_NM) {
          ruptured[c] = 1u;
          hc = NEWTON_BLACK_NM + (hc - NEWTON_BLACK_NM) * decay;
        }
        h[c] = hc;
      }
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
