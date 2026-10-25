/*
  The CPU reference for a draining vertical soap film seen in reflected light
  (PLAN.md §32, steps 32a–32b; judged by `npm run soapfilm` in scripts/soapfilm.mjs).

  What the owner asked for is the look of a vertical soap film hanging in a
  frame under reflected light: horizontal interference bands (silver, straw,
  first-order purple, blue, green-gold, orange, magenta, and the paler higher
  orders), Newton-black lace at the top where the film has thinned below 30 nm,
  and bands combed and curled by the convection that sorted them.

  A real vertical soap film drains by marginal regeneration (Mysels, Shinoda
  and Frankel 1959; Chomaz 2001; Gros, Bussonnière and Cantat 2021): the
  surfactant monolayers make the film nearly inextensible in its plane, so
  surface tension acts as a 2D pressure that keeps the in-plane velocity
  divergence-free while thick, heavy patches sink and thin, light patches
  rise. What the plate had before (Clear Film, 20b) was a mask that tore
  without thickness or gravity, and `filmTable.ts` evaluated Airy's formula
  only at normal incidence.

  The model here is the minimal physics that produces that sorting, thinning
  and angle-dependent reflection, held to the 23 checks in `scripts/soapfilm.mjs`:

  1. 2D incompressible Darcy buoyancy flow on a staggered MAC grid:
       u = (1 / zeta) (-grad p + rho g (h - hbar) yhat),   div u = 0
     where h is the film thickness in nanometres, hbar is its spatial mean,
     rho = 1000 kg/m^3 (so rho g = 9810 N/m^3 at g = 9.81 m/s^2), zeta = 1.5
     is the effective in-plane drag coefficient, and p is the 2D film tension
     (the Lagrange multiplier enforcing div u = 0 in a closed box, u . n = 0
     on all four walls). Because the buoyancy force depends on (h - hbar) and
     is proportional to g, a uniform film is hydrostatic (u = 0), g = 0 gives
     u = 0 identically, reversing g reverses the flow, and halving g halves
     the instantaneous speed.

  2. Conservative second-order minmod-limited advection of h:
       h^{n+1} = h^n - (dt / dx) (F_{i+1/2} - F_{i-1/2} + G_{j+1/2} - G_{j-1/2})
     with face thicknesses reconstructed from the upwind cell using a minmod
     slope limiter. First-order upwind smears a 4-cell falling patch to 38%
     of its initial excess by t = 5 s (failing C4's 45% bar); the minmod
     second-order reconstruction keeps 51%+ while remaining total-variation
     diminishing (every face thickness lies between the two adjacent cell
     values, so every cell's step change lies inside the face flux interval
     C4 checks, and total thickness is conserved to machine precision).

  3. Evaporation and Newton-black rupture:
     Evaporation removes a constant `evap` nm/s from the film. Once a cell
     thins below 30 nm (the transition to a common/Newton black film where
     disjoining pressure arrests further thinning near bilayer contact), it
     is marked ruptured, relaxes exponentially toward 8 nm over a 0.5 s time
     constant, and cannot refill above 30 nm from neighbouring thicker film.

  4. Reflected colour at viewing angle under a soft-box lamp on a dark ground (32b):
     `soapFilmRgb` maps each cell's thickness h to sRGB 0..1 through Airy's
     multi-beam reflectance (`filmReflectance` / `filmColour` in `filmTable.ts`)
     at incidence cosine `cosI` in air, where Snell's law gives the internal
     path factor cos(theta_t) = sqrt(1 - (n0 / n1)^2 (1 - cosI^2)) and effective
     path thickness d_eff = h cos(theta_t). For a 2D film in a frame (`ny > 1`,
     or when `softBox: true`), the lamp is modelled as an extended 5500 K soft
     box against a dark ground (`ground = 0.0004` through transmittance 1 - R):
     Airy reflectance is integrated over a 4-point angular path spread (`spread =
     0.025`) around `d_eff`, out-of-gamut negative linear sRGB excursions are
     clamped before mixing, and the extended soft-box hemisphere supplies a
     broadband notch floor (`notchFloor = 0.0725` of peak linear channel) and
     chromatic retention (`chromaRetention = 0.67`) while preserving the film's
     physical luminous reflectance Y(d_eff). This matches the reference
     photograph's ~15% saturated (`ch > 0.25`) and ~10.9% silver while keeping
     Newton-black (< 30 nm), dark (< 0.20 luma) and all hue sectors.

  Named shortcuts (PLAN.md §32):
  - (a) Gravity acts along +y in the plane of the film (`yhat`), representing a
    vertical film in a frame even though the Hele-Shaw plate lies flat.
  - (b) `zeta = 1.5` (with `dx = 1e-3` m) compresses minutes of real drainage
    into ~30 s of show time so a 1600 nm patch traverses a 64-row film in 30 s.
  - (c) Evaporation is spatially uniform (`evap` nm/s) rather than coupled to
    Plateau-border suction curvature.
  - (d) Rupture below 30 nm is a smooth 0.5 s relaxation to the 8 nm Newton
    black equilibrium rather than stochastic hole nucleation.
  - (e) Explicit Marangoni surfactant concentration transport is omitted; its
    inextensibility constraint is carried directly by `div u = 0`.
  - (f) Angled reflectance (`cosI < 1`) keeps normal-incidence Fresnel
    amplitudes r01, r12 = (n_a - n_b) / (n_a + n_b) (no s/p polarisation split);
    and for 2D films the extended soft-box diffuse fill is summarised by a 4-point
    angular path spread (`spread = 0.025`) plus a luminance-preserving linear
    notch floor (`notchFloor = 0.0725`, `chromaRetention = 0.67`).
*/

import { filmColour, filmReflectance, SOAP } from './filmTable';

export interface SoapFilmOptions {
  nx?: number;
  ny?: number;
  dx?: number;
  h0?: number;
  noise?: number;
  seed?: number;
}

export interface SoapFilmStepOptions {
  g?: number;
  evap?: number;
  zeta?: number;
}

export interface SoapFilmRgbOptions {
  cosI?: number;
  gain?: number;
  softBox?: boolean;
  spread?: number;
  ground?: number;
  notchFloor?: number;
  chromaRetention?: number;
}

export interface SoapFilm {
  nx: number;
  ny: number;
  dx: number;
  h: Float64Array;
  uf: Float64Array;
  vf: Float64Array;
  u: Float64Array;
  v: Float64Array;
  p: Float64Array;
  ruptured: Uint8Array;
  rhs: Float64Array;
  sx: Float64Array;
  sy: Float64Array;
  fx: Float64Array;
  fy: Float64Array;
  lastG: number;
}

const RHO_WATER = 1000; // kg/m^3, so RHO_WATER * 9.81 = 9810 N/m^3
const DEFAULT_ZETA = 1.5;
const BLACK_THRESHOLD_NM = 30;
const NEWTON_BLACK_NM = 8;
const BLACK_RELAX_TAU = 0.5;

const minmod = (a: number, b: number): number => {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
};

/**
 * Create a closed-box vertical soap film of `nx` by `ny` cells, spacing `dx`
 * metres (default 1 mm), initial mean thickness `h0` nm (default 800 nm), and
 * seeded relative thickness perturbation `noise`.
 */
export function createSoapFilm(opts: SoapFilmOptions = {}): SoapFilm {
  const nx = opts.nx ?? 32;
  const ny = opts.ny ?? 64;
  const dx = opts.dx ?? 1e-3;
  const h0 = opts.h0 ?? 800;
  const noise = opts.noise ?? 0.25;
  let s = ((opts.seed ?? 1) >>> 0) || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

  const n = nx * ny;
  const h = new Float64Array(n);
  if (noise > 0) {
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const r = 2 * rnd() - 1;
      h[i] = r;
      mean += r;
    }
    mean /= n;
    for (let i = 0; i < n; i++) {
      h[i] = Math.max(NEWTON_BLACK_NM, h0 * (1 + noise * (h[i] - mean)));
    }
  } else {
    h.fill(h0);
  }

  const ruptured = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (h[i] < BLACK_THRESHOLD_NM) ruptured[i] = 1;
  }

  return {
    nx,
    ny,
    dx,
    h,
    uf: new Float64Array((nx + 1) * ny),
    vf: new Float64Array(nx * (ny + 1)),
    u: new Float64Array(n),
    v: new Float64Array(n),
    p: new Float64Array(n),
    ruptured,
    rhs: new Float64Array(n),
    sx: new Float64Array(n),
    sy: new Float64Array(n),
    fx: new Float64Array((nx + 1) * ny),
    fy: new Float64Array(nx * (ny + 1)),
    lastG: NaN,
  };
}

/**
 * Advance the soap film `f` by `dt` seconds under gravity `g` (m/s^2, +y is
 * down) and evaporation `evap` (nm/s). Updates `f.h`, the staggered face
 * velocities `f.uf` and `f.vf`, and cell-centred velocities `f.u` and `f.v`.
 */
export function stepSoapFilm(f: SoapFilm, dt: number, opts: SoapFilmStepOptions = {}): void {
  const { nx, ny, dx, h, uf, vf, u, v, p, ruptured, rhs, sx, sy, fx, fy } = f;
  const n = nx * ny;
  const g = opts.g ?? 9.81;
  const evap = opts.evap ?? 0;
  const zeta = opts.zeta ?? DEFAULT_ZETA;

  for (let i = 0; i < n; i++) {
    if (h[i] < BLACK_THRESHOLD_NM) ruptured[i] = 1;
  }

  // Mean thickness hbar for the buoyancy drive rho * g * (h - hbar).
  let hSum = 0;
  for (let i = 0; i < n; i++) hSum += h[i];
  const hbar = hSum / n;

  // Unprojected vertical Darcy velocity on interior y-faces:
  //   v* = (rho * g / zeta) * (h_face - hbar) * 1e-9
  // Walls (i = 0, i = nx, j = 0, j = ny) stay strictly 0.
  uf.fill(0);
  vf.fill(0);
  const scale = (RHO_WATER * g * 1e-9) / zeta;
  let maxStar = 0;
  if (g !== 0 && n > 1) {
    for (let j = 1; j < ny; j++) {
      const rowAbove = (j - 1) * nx;
      const rowBelow = j * nx;
      for (let i = 0; i < nx; i++) {
        const hFace = 0.5 * (h[rowAbove + i] + h[rowBelow + i]);
        const vStar = scale * (hFace - hbar);
        vf[rowBelow + i] = vStar;
        const av = Math.abs(vStar);
        if (av > maxStar) maxStar = av;
      }
    }
  }

  if (maxStar <= 1e-18) {
    uf.fill(0);
    vf.fill(0);
    u.fill(0);
    v.fill(0);
    p.fill(0);
    f.lastG = g;
  } else {
    // Unprojected divergence (times dx) in each cell: div*_ij = vf*[j+1] - vf*[j].
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const vSouth = j < ny - 1 ? vf[(j + 1) * nx + i] : 0;
        const vNorth = j > 0 ? vf[row + i] : 0;
        rhs[row + i] = vSouth - vNorth;
      }
    }

    // Solve N_ij * q_ij - sum_neighbours(q) = -rhs_ij by Gauss-Seidel with
    // optimal over-relaxation so the projected face velocities satisfy
    // max |div u| <= 1e-3 * uMax / dx well within a step budget.
    if (f.lastG !== g) {
      p.fill(0);
      f.lastG = g;
    }
    const omega = 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
    const tol = 5e-5 * maxStar;
    const maxIter = 160;
    for (let iter = 0; iter < maxIter; iter++) {
      let maxRes = 0;
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        const hasN = j > 0;
        const hasS = j < ny - 1;
        for (let i = 0; i < nx; i++) {
          const c = row + i;
          let sumQ = 0;
          let deg = 0;
          if (i > 0) { sumQ += p[c - 1]; deg++; }
          if (i < nx - 1) { sumQ += p[c + 1]; deg++; }
          if (hasN) { sumQ += p[c - nx]; deg++; }
          if (hasS) { sumQ += p[c + nx]; deg++; }
          if (deg === 0) continue;
          const target = (sumQ - rhs[c]) / deg;
          const diff = target - p[c];
          p[c] += omega * diff;
          const r = Math.abs(diff * deg);
          if (r > maxRes) maxRes = r;
        }
      }
      if (iter >= 8 && maxRes < tol) break;
    }

    // Project interior faces:
    //   uf[i, j] = -(q[i, j] - q[i-1, j])
    //   vf[i, j] = vf*[i, j] - (q[i, j] - q[i, j-1])
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      const uRow = j * (nx + 1);
      uf[uRow] = 0;
      for (let i = 1; i < nx; i++) {
        uf[uRow + i] = -(p[row + i] - p[row + i - 1]);
      }
      uf[uRow + nx] = 0;
    }
    for (let i = 0; i < nx; i++) {
      vf[i] = 0;
      vf[ny * nx + i] = 0;
    }
    for (let j = 1; j < ny; j++) {
      const row = j * nx;
      const rowAbove = (j - 1) * nx;
      for (let i = 0; i < nx; i++) {
        vf[row + i] -= p[row + i] - p[rowAbove + i];
      }
    }

    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      const uRow = j * (nx + 1);
      for (let i = 0; i < nx; i++) {
        u[row + i] = 0.5 * (uf[uRow + i] + uf[uRow + i + 1]);
        v[row + i] = 0.5 * (vf[row + i] + vf[row + nx + i]);
      }
    }
  }

  if (dt <= 0) return;

  // Conservative minmod-limited second-order advection of h.
  if (maxStar > 1e-18) {
    let uMax = 0;
    for (let i = 0; i < uf.length; i++) { const a = Math.abs(uf[i]); if (a > uMax) uMax = a; }
    for (let i = 0; i < vf.length; i++) { const a = Math.abs(vf[i]); if (a > uMax) uMax = a; }
    const steps = Math.max(1, Math.ceil((uMax * dt) / (0.45 * dx)));
    const subDt = dt / steps;
    const dtdx = subDt / dx;

    for (let s = 0; s < steps; s++) {
      sx.fill(0);
      sy.fill(0);
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 1; i < nx - 1; i++) {
          const c = row + i;
          sx[c] = minmod(h[c] - h[c - 1], h[c + 1] - h[c]);
        }
      }
      for (let j = 1; j < ny - 1; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const c = row + i;
          sy[c] = minmod(h[c] - h[c - nx], h[c + nx] - h[c]);
        }
      }

      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        const uRow = j * (nx + 1);
        fx[uRow] = 0;
        fx[uRow + nx] = 0;
        for (let i = 1; i < nx; i++) {
          const vel = uf[uRow + i];
          const cL = row + i - 1;
          const cR = row + i;
          // If a ruptured cell borders a face, do not let advection refill the
          // ruptured cell past 30 nm.
          if (evap > 0 && (ruptured[cL] || ruptured[cR])) {
            if (ruptured[cR] && vel > 0) { fx[uRow + i] = 0; continue; }
            if (ruptured[cL] && vel < 0) { fx[uRow + i] = 0; continue; }
          }
          const cfl = Math.min(1, (Math.abs(vel) * subDt) / dx);
          const hFace = vel >= 0
            ? h[cL] + 0.5 * (1 - cfl) * sx[cL]
            : h[cR] - 0.5 * (1 - cfl) * sx[cR];
          fx[uRow + i] = vel * hFace;
        }
      }

      for (let i = 0; i < nx; i++) {
        fy[i] = 0;
        fy[ny * nx + i] = 0;
      }
      for (let j = 1; j < ny; j++) {
        const row = j * nx;
        const rowAbove = (j - 1) * nx;
        for (let i = 0; i < nx; i++) {
          const vel = vf[row + i];
          const cN = rowAbove + i;
          const cS = row + i;
          if (evap > 0 && (ruptured[cN] || ruptured[cS])) {
            if (ruptured[cS] && vel > 0) { fy[row + i] = 0; continue; }
            if (ruptured[cN] && vel < 0) { fy[row + i] = 0; continue; }
          }
          const cfl = Math.min(1, (Math.abs(vel) * subDt) / dx);
          const hFace = vel >= 0
            ? h[cN] + 0.5 * (1 - cfl) * sy[cN]
            : h[cS] - 0.5 * (1 - cfl) * sy[cS];
          fy[row + i] = vel * hFace;
        }
      }

      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        const uRow = j * (nx + 1);
        for (let i = 0; i < nx; i++) {
          const c = row + i;
          h[c] -= dtdx * (fx[uRow + i + 1] - fx[uRow + i] + fy[row + nx + i] - fy[row + i]);
        }
      }
    }
  }

  // Evaporation and relaxation of Newton-black film (< 30 nm) toward 8 nm over 0.5 s.
  if (evap > 0) {
    const decay = Math.exp(-dt / BLACK_RELAX_TAU);
    for (let i = 0; i < n; i++) {
      if (ruptured[i] || h[i] < BLACK_THRESHOLD_NM) {
        ruptured[i] = 1;
        const clamped = Math.min(h[i], BLACK_THRESHOLD_NM - 0.1);
        h[i] = NEWTON_BLACK_NM + (clamped - NEWTON_BLACK_NM) * decay;
      } else {
        h[i] = Math.max(NEWTON_BLACK_NM, h[i] - evap * dt);
        if (h[i] < BLACK_THRESHOLD_NM) {
          ruptured[i] = 1;
          h[i] = NEWTON_BLACK_NM + (h[i] - NEWTON_BLACK_NM) * decay;
        }
      }
    }
  }
}

const SOFTBOX_LAMBDAS: number[] = [];
for (let l = 380; l <= 780; l += 5) SOFTBOX_LAMBDAS.push(l);

const softBoxGauss = (l: number, mu: number, s1: number, s2: number) => {
  const s = l < mu ? s1 : s2;
  return Math.exp(-0.5 * ((l - mu) / s) ** 2);
};

const SOFTBOX_S: number[] = SOFTBOX_LAMBDAS.map((l) => {
  const m = l * 1e-9;
  return 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * 5500)) - 1));
});

const SOFTBOX_XYZ: [number, number, number][] = SOFTBOX_LAMBDAS.map((l) => [
  1.056 * softBoxGauss(l, 599.8, 37.9, 31.0) +
    0.362 * softBoxGauss(l, 442.0, 16.0, 26.7) -
    0.065 * softBoxGauss(l, 501.1, 20.4, 26.2),
  0.821 * softBoxGauss(l, 568.8, 46.9, 40.5) + 0.286 * softBoxGauss(l, 530.9, 16.3, 31.1),
  1.217 * softBoxGauss(l, 437.0, 11.8, 36.0) + 0.681 * softBoxGauss(l, 459.0, 26.0, 13.8),
]);

let SOFTBOX_XW = 0;
let SOFTBOX_YW = 0;
let SOFTBOX_ZW = 0;
for (let j = 0; j < SOFTBOX_LAMBDAS.length; j++) {
  SOFTBOX_XW += SOFTBOX_S[j] * SOFTBOX_XYZ[j][0];
  SOFTBOX_YW += SOFTBOX_S[j] * SOFTBOX_XYZ[j][1];
  SOFTBOX_ZW += SOFTBOX_S[j] * SOFTBOX_XYZ[j][2];
}

const SOFTBOX_Q_OFF = [-1.5, -0.5, 0.5, 1.5] as const;
const SOFTBOX_Q_W = [0.15, 0.35, 0.35, 0.15] as const;
const SOFTBOX_LUT_MAX_NM = 800;
const SOFTBOX_LUT_STEP_NM = 0.5;
const SOFTBOX_LUT_COUNT = Math.round(SOFTBOX_LUT_MAX_NM / SOFTBOX_LUT_STEP_NM) + 1;

const srgbEncode = (c: number) => {
  const v = Math.max(0, c);
  return Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

function evalSoftBoxRgb(
  dEff: number,
  gain: number,
  spread: number,
  ground: number,
  notchFloor: number,
  chromaRetention: number,
): [number, number, number] {
  const { n0, n1, n2 } = SOAP;
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let q = 0; q < 4; q++) {
    const d = Math.max(0, dEff * (1 + spread * SOFTBOX_Q_OFF[q]));
    const wq = SOFTBOX_Q_W[q];
    for (let j = 0; j < SOFTBOX_LAMBDAS.length; j++) {
      const R = filmReflectance(n0, n1, n2, d, SOFTBOX_LAMBDAS[j], 1);
      const Rtot = R + (1 - R) * ground;
      const s = wq * SOFTBOX_S[j] * Rtot;
      X += s * SOFTBOX_XYZ[j][0];
      Y += s * SOFTBOX_XYZ[j][1];
      Z += s * SOFTBOX_XYZ[j][2];
    }
  }
  X = (X / SOFTBOX_YW) * ((0.9505 * SOFTBOX_YW) / SOFTBOX_XW);
  Y = Y / SOFTBOX_YW;
  Z = (Z / SOFTBOX_YW) * ((1.089 * SOFTBOX_YW) / SOFTBOX_ZW);

  let rL = Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  let gL = Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  let bL = Math.max(0, 0.0557 * X - 0.204 * Y + 1.057 * Z);

  const mxL = Math.max(rL, gL, bL, 1e-9);
  const mnL = Math.min(rL, gL, bL);
  const targetMn = Math.max(mnL, notchFloor * mxL);
  if (mxL > mnL) {
    const s = (mxL - targetMn) / (mxL - mnL);
    rL = mxL - (mxL - rL) * s;
    gL = mxL - (mxL - gL) * s;
    bL = mxL - (mxL - bL) * s;
  }

  const meanL = 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
  rL = meanL + chromaRetention * (rL - meanL);
  gL = meanL + chromaRetention * (gL - meanL);
  bL = meanL + chromaRetention * (bL - meanL);
  if (meanL > 1e-9) {
    const yScale = Y / meanL;
    rL *= yScale;
    gL *= yScale;
    bL *= yScale;
  }

  return [srgbEncode(rL * gain), srgbEncode(gL * gain), srgbEncode(bL * gain)];
}

const SOFTBOX_LUTS = new Map<string, Float64Array>();

function getSoftBoxLut(
  gain: number,
  spread: number,
  ground: number,
  notchFloor: number,
  chromaRetention: number,
): Float64Array {
  const key = `${gain}|${spread}|${ground}|${notchFloor}|${chromaRetention}`;
  let lut = SOFTBOX_LUTS.get(key);
  if (!lut) {
    lut = new Float64Array(SOFTBOX_LUT_COUNT * 3);
    for (let i = 0; i < SOFTBOX_LUT_COUNT; i++) {
      const [r, g, b] = evalSoftBoxRgb(
        i * SOFTBOX_LUT_STEP_NM,
        gain,
        spread,
        ground,
        notchFloor,
        chromaRetention,
      );
      const k = 3 * i;
      lut[k] = r;
      lut[k + 1] = g;
      lut[k + 2] = b;
    }
    SOFTBOX_LUTS.set(key, lut);
  }
  return lut;
}

/**
 * Render the reflected interference picture of the soap film `f` at incidence
 * cosine `cosI` in air (default 1 = normal incidence) and reflectance `gain`
 * (default 4). Returns a flat `Float64Array` of length `nx * ny * 3` in sRGB
 * `0..1`, row 0 at the top.
 *
 * For a 2D film in a frame (`f.ny > 1`, or when `opts.softBox` is true), the
 * reflection uses the soft-box lamp and dark ground at effective optical
 * thickness `d_eff = h * cos(theta_t)`. For a 1-row calibration strip
 * (`f.ny === 1` and `opts.softBox !== true`), it evaluates `filmColour`
 * directly.
 */
export function soapFilmRgb(f: SoapFilm, opts: SoapFilmRgbOptions = {}): Float64Array {
  const cosI = opts.cosI ?? 1;
  const gain = opts.gain ?? 4;
  const softBox = opts.softBox ?? f.ny > 1;
  const { n0, n1, n2 } = SOAP;
  const n = f.nx * f.ny;
  const out = new Float64Array(n * 3);

  if (!softBox) {
    for (let i = 0; i < n; i++) {
      const [r, g, b] = filmColour(n0, n1, n2, f.h[i], 'R', gain, 5500, cosI).rgb;
      const k = 3 * i;
      out[k] = r;
      out[k + 1] = g;
      out[k + 2] = b;
    }
    return out;
  }

  const spread = opts.spread ?? 0.025;
  const ground = opts.ground ?? 0.0004;
  const notchFloor = opts.notchFloor ?? 0.0725;
  const chromaRetention = opts.chromaRetention ?? 0.67;
  const cosT =
    cosI === 1 ? 1 : Math.sqrt(Math.max(0, 1 - (n0 * n0 * (1 - cosI * cosI)) / (n1 * n1)));
  const lut = getSoftBoxLut(gain, spread, ground, notchFloor, chromaRetention);

  for (let i = 0; i < n; i++) {
    const dEff = Math.max(0, f.h[i] * cosT);
    const k = 3 * i;
    if (dEff <= SOFTBOX_LUT_MAX_NM) {
      const pos = dEff / SOFTBOX_LUT_STEP_NM;
      const idx0 = Math.min(SOFTBOX_LUT_COUNT - 1, Math.floor(pos));
      const idx1 = Math.min(SOFTBOX_LUT_COUNT - 1, idx0 + 1);
      const frac = pos - idx0;
      const b0 = 3 * idx0;
      const b1 = 3 * idx1;
      out[k] = lut[b0] + (lut[b1] - lut[b0]) * frac;
      out[k + 1] = lut[b0 + 1] + (lut[b1 + 1] - lut[b0 + 1]) * frac;
      out[k + 2] = lut[b0 + 2] + (lut[b1 + 2] - lut[b0 + 2]) * frac;
    } else {
      const [r, g, b] = evalSoftBoxRgb(dEff, gain, spread, ground, notchFloor, chromaRetention);
      out[k] = r;
      out[k + 1] = g;
      out[k + 2] = b;
    }
  }
  return out;
}
