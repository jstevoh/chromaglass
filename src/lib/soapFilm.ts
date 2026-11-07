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

  3. The frame's Plateau border and black spots (32f, 32g; `npm run soapfilm`
     C8, C9): the film drains into its frame's border by marginal
     regeneration, which draws out fresh film of Frankel's thickness
     (drainToBorder below), and a cell that has thinned goes black on Vrij's
     clock for the van der Waals instability, handing its liquid to a rim
     (blackSpots below). Optional uniform evaporation (`evap` nm/s) is a real
     loss to the air. A black cell is not refilled by the flow.

  4. Reflected colour at viewing angle on a dark ground (32b):
     `soapFilmRgb` maps each cell's thickness h to sRGB 0..1 through Airy's
     multi-beam reflectance (`filmReflectance` / `filmColour` in `filmTable.ts`)
     at incidence cosine `cosI` in air, where Snell's law gives the internal
     path factor cos(theta_t) = sqrt(1 - (n0 / n1)^2 (1 - cosI^2)) and effective
     path thickness d_eff = h cos(theta_t). For a 2D film in a frame (`ny > 1`,
     or when `softBox: true`), Airy reflectance is summed over a 4-point path
     spread (`spread = 0.025`) around `d_eff` on a dark ground (`ground = 0.0004`
     through transmittance 1 - R), and negative linear sRGB channels are clamped
     to 0. That 4-point path spread and dark ground alone move C7's t = 120 s
     saturation from 79% to 77% (dark 22.7%, 9/12 hues). The rest of the drop to
     the reference photograph's 15% saturated (13% at t = 120 s, 14.8% at
     t = 110 s, dark 19.4%, 8/12 hues) is a colour grade (`notchFloor = 0.0725`
     lifting each pixel's lowest linear channel and `chromaRetention = 0.67`
     pulling each channel a third of the way toward grey while rescaling to
     preserve luminous reflectance Y(d_eff)) standing in for the soft box's
     angular spread and the camera's gamut, not the physics itself (named
     shortcut (f); PLAN.md 32b-1 replaces the grade with the real solid-angle
     integral and camera gamut mapping).

  Named shortcuts (PLAN.md §32):
  - (a) (PLAN 32h) Gravity acts along +y in the plane of the film (`yhat`), representing a
    vertical film in a frame even though the Hele-Shaw plate lies flat.
  - (b) (PLAN 32i) `zeta = 1.5` (with `dx = 1e-3` m) compresses minutes of real drainage
    into ~30 s of show time so a 1600 nm patch traverses a 64-row film in 30 s.
  - (c) and (d), uniform evaporation standing in for the frame and rupture as
    a 0.5 s relaxation to 8 nm that deleted the liquid, are replaced by the
    border and the black spots (PLAN 32f, 32g); what is still short of the
    real law there is 32f-1, 32f-2 and 32g-1 to 32g-3.
  - (e) (PLAN 32j) Explicit Marangoni surfactant concentration transport is omitted; its
    inextensibility constraint is carried directly by `div u = 0`.
  - (f) Angled reflectance (`cosI < 1`) keeps normal-incidence Fresnel
    amplitudes r01, r12 = (n_a - n_b) / (n_a + n_b) (no s/p polarisation split);
    and on 2D films (`ny > 1`), `notchFloor = 0.0725` and `chromaRetention = 0.67`
    are a colour grade standing in for the soft box's angular spread and the
    camera's gamut, not the physics itself: with the grade off (`notchFloor = 0`,
    `chromaRetention = 1`, keeping `spread = 0.025` and `ground = 0.0004`) the
    film's saturation at t = 120 s is 77% (dark 22.7%, 9/12 hues), and with the
    grade on it is 13% at t = 120 s (14.8% at t = 110 s, dark 19.4%, 8/12 hues)
    against the photograph's 15% (PLAN.md 32b-1).
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
  /** The frame's Plateau border radius, metres; absent or 0, a film with no border (a closed box). */
  border?: number;
  sigma?: number;
  mu?: number;
  hamaker?: number;
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
  /** Vrij's clock: the fraction of its rupture time each cell has spent at its thickness. */
  age: Float64Array;
  /** Thickness the frame's border has taken, nm summed over cells: sum(h) + drained is conserved. */
  drained: number;
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
// Physical constants of a soap solution's film, the step's defaults: surface
// tension, the liquid's viscosity, and the Hamaker constant of water across a
// film in air (Israelachvili, Intermolecular and Surface Forces, table 13.2).
const SIGMA = 0.025; // N/m
const MU = 1e-3; // Pa s
const HAMAKER = 3.7e-20; // J

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
    age: new Float64Array(n),
    drained: 0,
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
  const border = opts.border ?? 0;
  const sigma = opts.sigma ?? SIGMA;
  const mu = opts.mu ?? MU;
  const hamaker = opts.hamaker ?? HAMAKER;

  // Black is no longer a threshold read at the start of a step: a cell goes
  // black when Vrij's clock runs out (blackSpots below), so a film written
  // thin is black only if createSoapFilm or a caller marked it so.

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
          if (ruptured[cL] || ruptured[cR]) {
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
          if (ruptured[cN] || ruptured[cS]) {
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

  if (border > 0 && g !== 0) drainToBorder(f, dt, border, Math.abs(g), zeta, sigma, mu);

  // Evaporation, a real loss to the air, the same everywhere on a film in
  // still air; it no longer stands in for the frame's suction (that is
  // drainToBorder) and it never thins a film past Newton black.
  if (evap > 0) {
    for (let i = 0; i < n; i++) {
      if (!ruptured[i]) h[i] = Math.max(NEWTON_BLACK_NM, h[i] - evap * dt);
    }
  }

  blackSpots(f, dt, sigma, mu, hamaker);
}

/*
  Marginal regeneration at the frame (PLAN 32f, replacing shortcut c's uniform
  evaporation as what drains the film; judged by `npm run soapfilm` C8).

  The frame wears a Plateau border, a meniscus whose curvature sucks thick
  film in and pulls thin film out (Mysels, Shinoda and Frankel 1959), and the
  thin film's thickness is Frankel's law for surfaces the surfactant makes
  rigid: h_f = 2.68 r Ca^(2/3), Ca = mu V / sigma. What sets V here is the
  film's own buoyancy: the fresh thin film leaves the border at the Darcy
  speed of a patch h_f thick in film h_c thick, V = rho g (h_c - h_f) / zeta,
  the law the rest of the film already moves by. The two together fix h_f
  (solved by bisection: the left side rises in h_f, the right falls), and the
  border takes V (h_c - h_f) per metre of frame per second. Over a cell of
  width dx that is a relaxation of h_c toward h_f at the rate V / dx for
  each side of the cell on the frame, taken exactly (exp), side by side.

  The border is not the same all round. It is one body of liquid in
  hydrostatic balance, so its Laplace pressure sigma / r falls by rho g z
  with the height z above the bottom: r(z) = 1 / (1/r0 + rho g z / sigma),
  r0 the bottom border's radius (the `border` option). On a 64 mm film with
  r0 = 1 mm the top border is 38 um: tight, and sucking hard, which is why a
  hanging film goes black from the top. The sides grade between the two.

  The volume goes to f.drained, so sum(h) + drained is what is conserved.
*/
function drainToBorder(f: SoapFilm, dt: number, r0: number, g: number, zeta: number, sigma: number, mu: number): void {
  const { nx, ny, dx, h, ruptured } = f;
  const k = (mu * RHO_WATER * Math.abs(g) * 1e-9) / (zeta * sigma);
  const lift = (RHO_WATER * Math.abs(g)) / sigma;
  // Height above the bottom border of a row's centre, the bottom being +y
  // when g > 0 and row 0 when g < 0; the top border sits a full film above.
  const height = (j: number) => (g > 0 ? ny - 0.5 - j : j + 0.5) * dx;
  const radius = (z: number) => 1 / (1 / r0 + lift * z);
  const rTop = radius(ny * dx);
  const relax = (c: number, r: number) => {
    const hc = h[c];
    if (hc <= NEWTON_BLACK_NM) return;
    const frankel = 2.68 * r * 1e9;
    let lo = NEWTON_BLACK_NM, hi = hc;
    for (let it = 0; it < 40; it++) {
      const x = 0.5 * (lo + hi);
      if (x < frankel * Math.pow(k * (hc - x), 2 / 3)) lo = x; else hi = x;
    }
    const hf = 0.5 * (lo + hi);
    const V = (RHO_WATER * Math.abs(g) * (hc - hf) * 1e-9) / zeta;
    const next = hf + (hc - hf) * Math.exp((-V * dt) / dx);
    f.drained += hc - next;
    h[c] = next;
  };
  for (let j = 0; j < ny; j++) {
    const upper = g > 0 ? j === 0 : j === ny - 1;
    const lower = g > 0 ? j === ny - 1 : j === 0;
    const rSide = radius(height(j));
    for (let i = 0; i < nx; i++) {
      const left = i === 0, right = i === nx - 1;
      if (!upper && !lower && !left && !right) { i = nx - 2; continue; }
      const c = j * nx + i;
      if (ruptured[c]) continue;
      if (upper) relax(c, rTop);
      if (lower) relax(c, r0);
      if (left) relax(c, rSide);
      if (right) relax(c, rSide);
    }
  }
}

/*
  Black spots (PLAN 32g, replacing shortcut d's 0.5 s relaxation; judged by
  `npm run soapfilm` C9).

  A thin film is unstable to the van der Waals pull between its two faces: a
  thermal ripple on it grows at Vrij's rate (1966), the linear growth of the
  thin-film equation with immobile surfaces under the disjoining pressure
  -A / (6 pi h^3), whose fastest mode takes tau = 96 pi^2 sigma mu h^5 / A^2.
  Each cell keeps that clock, f.age += dt / tau(h): at 40 nm it runs out in
  about 2 s, at 60 nm in 13, at 300 nm in eleven hours, so where the film goes
  black is set by how thin it has got, steeply, and not by a threshold. In a
  soap film the ripple does not open a hole: it stops at Newton black, 8 nm,
  where the surfactant's two layers touch, and the liquid it held is pushed
  out of the spot into a rim (Mysels' black spots). So when a cell's clock
  runs out it goes to 8 nm and hands h - 8 to the neighbours that are not
  black, and nothing is lost.

  Two neighbours never turn on the same step: a cell turns only if its clock is
  the largest among its film neighbours (the index breaks a tie), so each
  turning cell's neighbours are all still film and can take its liquid. A thin
  region therefore goes black from its thinnest cell outward, one cell a
  step, pushing its liquid ahead of it into the thick film at its edge, where
  the clock is young: the rim. That front's speed is the grid's (one cell a
  step), not the physical spot's (32g-1). The clock sits on the grid rather
  than travelling with the film; it matters only where the film is thinner
  than about 60 nm, which is where it barely moves.
*/
function blackSpots(f: SoapFilm, dt: number, sigma: number, mu: number, A: number): void {
  const { nx, ny, h, ruptured, age, rhs, sx: turn } = f;
  const n = nx * ny;
  const c5 = (96 * Math.PI * Math.PI * sigma * mu) / (A * A);
  for (let c = 0; c < n; c++) {
    if (ruptured[c]) continue;
    const m = h[c] * 1e-9;
    age[c] += dt / (c5 * m * m * m * m * m);
  }
  // rhs and sx are free scratch here: the share each turning cell hands each
  // neighbour, and which cells turn.
  rhs.fill(0);
  turn.fill(0);
  let any = false;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (ruptured[c] || age[c] < 1) continue;
      const a = age[c];
      let film = 0, top = true;
      const look = (nb: number) => {
        if (ruptured[nb]) return;
        film++;
        if (age[nb] > a || (age[nb] === a && nb > c)) top = false;
      };
      if (i > 0) look(c - 1);
      if (i < nx - 1) look(c + 1);
      if (j > 0) look(c - nx);
      if (j < ny - 1) look(c + nx);
      if (!top || film === 0) continue;
      rhs[c] = Math.max(0, h[c] - NEWTON_BLACK_NM) / film;
      turn[c] = 1;
      any = true;
    }
  }
  if (!any) return;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (turn[c] || ruptured[c]) continue;
      let gain = 0, from = 0;
      const take = (nb: number) => { if (turn[nb]) { gain += rhs[nb]; if (age[nb] > from) from = age[nb]; } };
      if (i > 0) take(c - 1);
      if (i < nx - 1) take(c + 1);
      if (j > 0) take(c - nx);
      if (j < ny - 1) take(c + nx);
      if (from === 0) continue;
      h[c] += gain;
      // The spot's edge runs on through film that is itself unstable: a
      // neighbour whose own clock has run out takes the turning cell's clock,
      // so it turns next and passes the liquid on outward, instead of being
      // left behind as an island when its thinner neighbours turn round it.
      // Film whose clock has not run out (the thick film at the spot's edge)
      // keeps its own: that is where the liquid stops, the rim.
      if (age[c] >= 1 && from > age[c]) age[c] = from;
    }
  }
  for (let c = 0; c < n; c++) {
    if (turn[c]) { h[c] = NEWTON_BLACK_NM; ruptured[c] = 1; }
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
 * reflection uses the 4-point path spread, dark ground, and shortcut (f)'s
 * colour grade (`notchFloor`, `chromaRetention`) at effective optical
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
