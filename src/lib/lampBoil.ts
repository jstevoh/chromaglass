/*
  The CPU reference for heat the performer rides: the lamp warming the dish,
  the warm liquid's own flow, and the dish boiling while the heat is held and
  going quiet when it is let go (PLAN.md §36e, roadmap S2; judged by
  `npm run boil` in scripts/boil.mjs).

  What was asked. The analog operators' accounts (PLAN §36) say heat was both
  their hazard and one of their strokes: "the heat was hard to control, glass
  cracked", and a Danish crew "deliberately blocked the air stream when we
  needed heat to propagate bubbles". The European school's slides were cooked
  on purpose: the projector's heat filter taken out, the liquid boiling on the
  screen (docs/slide-plan.md S2). What the plate has is a temperature with no
  unit (`vel.z`), fed by the lamp through the dye since #352, cooled per second,
  and lifting warm liquid on an upright plate. It cannot boil: no bubble on the
  plate has ever come from heat (docs/roadmap.md, the deep dive). This file is
  the model the GPU build is held to, written first, the way soapFilm.ts came
  before the soap film's shaders.

  The roadmap's blocker for S2 was that heat had no strength: every source
  saturated a buoyancy tanh. #352 took the tanh out, so that blocker is gone.
  What is still missing on the GPU, and what this model supplies, is heat in
  kelvin and watts (so a threshold can be compared against), a dish whose
  thermal mass decides how fast it warms, and boiling.

  The model, per square metre of plate, in SI units and degrees Celsius:

  1. The lamp. Irradiance I0·exp(−r²/2σ²) at the stage (the condenser throws a
     hot spot, hottest in the middle), times the Heat dial (how much of the
     heat filter is out, 0..1), in two bands. The visible share f_vis (about
     an eighth of a halogen's output at the stage) passes clear water and is
     absorbed by the dye, 1 − exp(−A_dye·(1−α)) (Beer–Lambert, as 18f); the
     infrared rest passes the dye and is absorbed by the water through its
     depth, 1 − exp(−κ_IR·d·(1−α)). So dark dye warms faster than clear water,
     by about 1.4 at an absorbance of 1.5, not by its visible absorbance alone.
     Vapour displaces liquid and its dye, so a cell full of steam stops taking
     the lamp's heat into liquid that is not there.

  2. One temperature through the glass and the liquid. Across a 1 mm gap water
     conducts k/d = 600 W/m²K, ten times the air's cooling, so the depth is
     well mixed in temperature (Biot number about 0.1) and the glass plates are
     part of the thermal mass: two 1 mm glasses hold as much heat per kelvin as
     the millimetre of water between them. Heat spreads sideways through both
     (k·d for the water, k_glass·t for the glass, which carries most of it),
     is lost to the air at h (W/m²K, both faces: the projector's fan when it
     blows, natural convection under a hand that blocks it) and by radiation,
     2εσ(T⁴ − T_room⁴) from the two glass faces (ε = 0.9: at 100 °C that is
     about 15 W/m²K, more than the still air takes), and leaves at the open
     rim, held at the room's temperature (the reservoir is large). The liquid
     carries its own share of the heat with it, (1−α)ρc·d of the total; the
     glass does not flow.

  3. The liquid's flow in the gap (Hele-Shaw, as the plate's thin gap):
       u = (d²/12μ(T)) (−∇p + (ρ_mix − ρ_room) g sinθ ŷ),   ∇·u = s,
     p = 0 at the open rim. ρ is water's real density (Kell 1975), not a
     linear Boussinesq slope: water's expansion coefficient triples between
     20 °C and 90 °C, and a plume at 70 °C rises 3.4 times as hard as one at
     40 °C where a constant slope says 2.5. μ is water's real viscosity
     (Vogel), which falls by three and a half between the room and boiling.
     θ is the plate's tilt: on a level plate (θ = 0) warm liquid has no "up"
     in the plate's plane and the buoyancy is zero, exactly, as 18f gates it.
     Heat still moves a level plate, by volume: warming water expands
     (s includes −(1−α)(ρ'/ρ)·∂T/∂t), and vapour is sixteen hundred times the
     volume of the water it came from, so a boiling spot pushes the liquid out
     toward the rim and a collapsing bubble draws it back.

  4. Boiling, with a threshold and its hysteresis. Water at 1 atm boils at
     100 °C, but a cell with no vapour in it cannot start until it is
     superheated past what its nucleation site needs: a cavity of radius r_c
     in the glass holds a vapour nucleus once ΔT ≥ 2σT_sat/(ρ_v L r_c)
     (the equilibrium nucleus: Clausius–Clapeyron with its Laplace pressure;
     Carey, Liquid-Vapor Phase-Change Phenomena, ch. 6).
     Sites are a density per square metre of glass (a seeded Poisson count
     per cell, each site a cavity from a log-normal of a few microns), and a
     cell starts at its largest cavity's superheat (5 to 12 K), so bubbles
     start at scattered sites under the hot spot rather than as a disc, and
     the sites do not thin or crowd when the grid changes; a cell with no
     site superheats until water's homogeneous limit (about 300 °C), which
     the lamp never reaches. A nucleus is a bubble as wide as the gap. Once a
     cell holds vapour it needs no threshold: the interface exchanges heat
     with the liquid at h_i (T − T_sat) over the bubble's rim, so superheated
     liquid boils into it and subcooled liquid condenses it. Let go of the heat
     and the liquid cools under 100 °C, the vapour condenses and gives its
     latent heat back, the flow it was driving stops, and nothing starts again
     until a site is superheated again. The latent heat is what holds a
     boiling spot near 100 °C while the lamp keeps pouring heat in.

  Shortcuts, named (each a PLAN item to replace, §36e):
  - The vertical cells in the gap are not resolved. A level plate heated from
    below convects across its depth (Rayleigh–Bénard once Ra passes about
    1708, and the Hadley shear a sideways temperature gradient drives), and
    the Marangoni stress at a free surface or an oil–water interface pushes
    from hot to cold; both carry nothing in the depth average this model
    keeps, and both belong with 18f-2.
  - Vapour moves with the liquid, no slip. A pancake bubble in a gap moves
    faster than the liquid around it (Bretherton; 18i's 1.5U), and on an
    upright plate it would rise through it.
  - The interface's heat transfer is one coefficient (h_i = 10⁴ W/m²K) over
    the bubble's rim (2√(πα)·d/dx of plate per plate area: one bubble per
    cell, so the rim's area, and with it the boil's pace, depends on the
    grid). Real confined boiling takes most of its heat through the thin film
    of liquid under the bubble against the glass (microlayer evaporation),
    faster than this.
  - The glass absorbs none of the lamp. Soda-lime glass takes the infrared
    past about 2.7 µm, so a spot that has boiled dry still heats (the cracking
    the operators feared); here a dried cell takes only what its neighbours
    conduct into it.
  - T_sat is 100 °C: no Laplace pressure in the bubble, and no dissolved air
    (a real dish degasses into small air bubbles well before it boils).
  - The infrared is one broadband coefficient, κ_IR, not water's spectrum
    against the lamp's.
  - The viscosity is the liquid's at its temperature; vapour does not thin the
    mixture's drag.
  - A nucleus appears whole in one step (a real one grows in milliseconds),
    so its volume source is a pulse the size of the step.
*/

const RHO_C = 4.18e6;         // water's volumetric heat capacity, J/(m³K)
const K_WATER = 0.6;          // W/(mK)
const K_GLASS = 1.0;          // soda-lime glass, W/(mK)
const RHO_C_GLASS = 2500 * 840;
const T_SAT = 100;            // °C at 1 atm
const T_HOM = 300;            // water's homogeneous nucleation limit, about 0.9 Tc
const LATENT = 2.257e6;       // J/kg
const RHO_V = 0.598;          // saturated steam at 100 °C, kg/m³
const SIGMA_SAT = 0.0589;     // water's surface tension at 100 °C, N/m
const ALPHA_MAX = 0.95;       // dry-out: the last liquid in a cell

/** Water's density in kg/m³ at 1 atm, 0–150 °C (Kell 1975). */
export function waterDensity(T: number): number {
  const t = Math.min(150, Math.max(0, T));
  return (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t - 46.170461e-6 * t ** 3
    + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.879850e-3 * t);
}

/** Water's dynamic viscosity in Pa·s (Vogel's equation). */
export function waterViscosity(T: number): number {
  const t = Math.min(150, Math.max(0, T));
  return 2.414e-5 * 10 ** (247.8 / (t + 273.15 - 140));
}

/** The superheat a cavity of radius r (m) needs to hold a vapour nucleus. */
export function nucleationSuperheat(r: number): number {
  return (2 * SIGMA_SAT * (T_SAT + 273.15)) / (RHO_V * LATENT * r);
}

export interface BoilPlateOptions {
  n?: number;               // cells across the square grid (64)
  width?: number;           // m, the grid's side (0.1)
  radius?: number;          // m, the dish; past it the open rim (0.45 × width)
  gap?: number;             // m, the liquid's depth (1 mm)
  glass?: number;           // m, both glasses together (2 mm)
  ambient?: number;         // °C (20)
  lampIrradiance?: number;  // W/m² at the hot spot, filter fully out (8000)
  visibleFraction?: number; // the lamp's share the dye absorbs and water passes (0.12)
  emissivity?: number;      // the glass faces' (0.9)
  lampWidth?: number;       // m, the hot spot's σ (0.02)
  lampCentre?: [number, number]; // m from the grid's centre ([0, 0])
  kappaIR?: number;         // 1/m, water's broadband infrared absorption (600)
  hForced?: number;         // W/m²K, both faces, the fan blowing (50)
  hNatural?: number;        // W/m²K, both faces, the air blocked (10)
  cavityRadius?: number;    // m, the median nucleation cavity (4 µm)
  cavitySpread?: number;    // log-normal σ of the cavities (0.3)
  siteDensity?: number;     // nucleation sites per m² of glass (7e4)
  interfaceH?: number;      // W/m²K at a bubble's rim (1e4)
  seed?: number;
}

export interface BoilHold { x: number; y: number; r: number }

export interface BoilControls {
  heat?: number;            // the Heat dial, 0..1: how much of the heat filter is out
  holds?: BoilHold[];       // m from the centre: where a hand blocks the air
  tilt?: number;            // radians: 0 a level dish, π/2 an upright slide
  g?: number;               // m/s² (9.81)
}

export interface BoilPlate {
  n: number; dx: number; width: number; radius: number; gap: number; glass: number;
  ambient: number; I0: number; lampWidth: number; lampCentre: [number, number];
  kappaIR: number; hForced: number; hNatural: number; interfaceH: number;
  visibleFraction: number; emissivity: number;
  alphaSeed: number; alphaMin: number;
  inside: Uint8Array;       // 1 a cell of the dish, 0 the rim
  T: Float64Array;          // °C, row-major, row 0 at the top, +y down
  alpha: Float64Array;      // vapour volume fraction of the gap
  dye: Float64Array;        // the dye's absorbance (natural-log units), set by the caller
  dTnuc: Float64Array;      // the superheat each cell's site needs (Infinity: none)
  u: Float64Array;          // m/s on x faces, (n+1) × n, u[j*(n+1)+i] is the face left of cell i
  v: Float64Array;          // m/s on y faces, n × (n+1), v[j*n+i] is the face above cell i
  p: Float64Array;          // Pa
  source: Float64Array;     // 1/s, ∇·u the last step asked for
  time: number;
  nucleations: { cell: number; t: number }[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBoilPlate(o: BoilPlateOptions = {}): BoilPlate {
  const n = o.n ?? 64;
  const width = o.width ?? 0.1;
  const dx = width / n;
  const radius = o.radius ?? 0.45 * width;
  const gap = o.gap ?? 1e-3;
  const ambient = o.ambient ?? 20;
  const rng = mulberry32(o.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const inside = new Uint8Array(n * n);
  const dTnuc = new Float64Array(n * n).fill(Infinity);
  const rc = o.cavityRadius ?? 4e-6, spread = o.cavitySpread ?? 0.3, lambda = (o.siteDensity ?? 7e4) * dx * dx;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * dx - width / 2, y = (j + 0.5) * dx - width / 2;
    const k = j * n + i;
    inside[k] = Math.hypot(x, y) < radius ? 1 : 0;
    // A Poisson count of sites (by inversion), each a cavity; the largest starts first.
    // Every cell draws, so the sites do not move when the dish's size does.
    let count = 0;
    for (let u = rng(), pk = Math.exp(-lambda), cdf = pk; u > cdf && count < 50; ) { count++; pk *= lambda / count; cdf += pk; }
    let r = 0;
    for (let c = 0; c < count; c++) r = Math.max(r, rc * Math.exp(spread * gauss()));
    if (inside[k] && count > 0) dTnuc[k] = nucleationSuperheat(r);
  }
  // A nucleus is a sphere as wide as the gap: the bubble that first touches both glasses.
  const alphaSeed = Math.min(0.5, (Math.PI * gap * gap) / (6 * dx * dx));
  return {
    n, dx, width, radius, gap, glass: o.glass ?? 2e-3, ambient,
    I0: o.lampIrradiance ?? 8000, lampWidth: o.lampWidth ?? 0.02, lampCentre: o.lampCentre ?? [0, 0],
    kappaIR: o.kappaIR ?? 600, hForced: o.hForced ?? 50, hNatural: o.hNatural ?? 10,
    visibleFraction: o.visibleFraction ?? 0.12, emissivity: o.emissivity ?? 0.9,
    interfaceH: o.interfaceH ?? 1e4, alphaSeed, alphaMin: alphaSeed * 0.01,
    inside, T: new Float64Array(n * n).fill(ambient), alpha: new Float64Array(n * n),
    dye: new Float64Array(n * n), dTnuc,
    u: new Float64Array((n + 1) * n), v: new Float64Array(n * (n + 1)),
    p: new Float64Array(n * n), source: new Float64Array(n * n), time: 0, nucleations: [],
  };
}

/** The infrared reaching a cell per unit Heat (W/m²), before absorption. */
export function lampIrradiance(P: BoilPlate, k: number): number {
  const i = k % P.n, j = (k / P.n) | 0;
  const x = (i + 0.5) * P.dx - P.width / 2 - P.lampCentre[0];
  const y = (j + 0.5) * P.dx - P.width / 2 - P.lampCentre[1];
  return P.I0 * Math.exp(-(x * x + y * y) / (2 * P.lampWidth * P.lampWidth));
}

function heatCapacity(P: BoilPlate, a: number) {
  return (1 - a) * RHO_C * P.gap + RHO_C_GLASS * P.glass;
}
function conductance(P: BoilPlate, a: number) {
  return K_WATER * P.gap * (1 - a) + K_GLASS * P.glass;
}

export function stepBoilPlate(P: BoilPlate, dt: number, c: BoilControls = {}): void {
  const { n, dx } = P;
  // The sideways conduction is explicit: sub-step under its stability limit.
  const Dmax = conductance(P, 0) / heatCapacity(P, ALPHA_MAX);
  const steps = Math.max(1, Math.ceil(dt / (0.2 * dx * dx / Dmax)));
  for (let s = 0; s < steps; s++) substep(P, dt / steps, c);
}

function substep(P: BoilPlate, h: number, c: BoilControls) {
  const { n, dx, gap: d, inside, T, alpha } = P;
  const heat = Math.max(0, c.heat ?? 0);
  const holds = c.holds ?? [];
  const Tamb = P.ambient;
  const latentPerAlpha = RHO_V * LATENT * d;   // J/m² per unit vapour fraction
  const T0 = Float64Array.from(T), a0 = Float64Array.from(alpha);

  // 1. Heat: the lamp, the air, the glass and liquid conducting, and the bubbles' rims.
  for (let k = 0; k < n * n; k++) {
    if (!inside[k]) { P.source[k] = 0; continue; }
    const i = k % n, j = (k / n) | 0;
    const a = a0[k];
    const fv = P.visibleFraction;
    const absorbed = fv * (1 - Math.exp(-P.dye[k] * (1 - a))) + (1 - fv) * (1 - Math.exp(-P.kappaIR * d * (1 - a)));
    const q = heat * lampIrradiance(P, k) * absorbed;
    const x = (i + 0.5) * dx - P.width / 2, y = (j + 0.5) * dx - P.width / 2;
    const held = holds.some((hd) => Math.hypot(x - hd.x, y - hd.y) < hd.r);
    // Radiation from both faces, linearised about the step's start: 2εσ(T² + Ta²)(T + Ta) in kelvin.
    const TK = T0[k] + 273.15, AK = Tamb + 273.15;
    const hl = (held ? P.hNatural : P.hForced) + 2 * P.emissivity * 5.670374e-8 * (TK * TK + AK * AK) * (TK + AK);
    const C = heatCapacity(P, a);
    const kk = conductance(P, a);
    let cond = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      const m = jj * n + ii;
      const out = ii < 0 || jj < 0 || ii >= n || jj >= n || !inside[m];
      const km = out ? conductance(P, 0) : conductance(P, a0[m]);
      const kf = (2 * kk * km) / (kk + km);
      cond += (kf * ((out ? Tamb : T0[m]) - T0[k])) / (dx * dx);
    }
    const G = a > 0 ? P.interfaceH * 2 * Math.sqrt(Math.PI * a) * (d / dx) : 0;
    // Written as the change, so a cell in balance does not move by a rounding.
    let Tn = T0[k] + (h * (q + cond + hl * (Tamb - T0[k]) + G * (T_SAT - T0[k]))) / (C + h * (hl + G));
    let an = a + (G * (Tn - T_SAT) * h) / latentPerAlpha;
    if (an > ALPHA_MAX) {                     // no liquid left to boil: the heat stays in the cell
      Tn += ((an - ALPHA_MAX) * latentPerAlpha) / C;
      an = ALPHA_MAX;
    }
    if (an < P.alphaMin) {                    // the bubble is gone; what vapour was left gives its heat back
      Tn += (an * latentPerAlpha) / C;
      an = 0;
    }
    if (an === 0 && (Tn >= T_SAT + P.dTnuc[k] || Tn >= T_HOM)) {
      an = P.alphaSeed;
      Tn -= (an * latentPerAlpha) / C;
      P.nucleations.push({ cell: k, t: P.time + h });
    }
    const rhoL = waterDensity(Tn);
    const drho = (waterDensity(Tn + 0.01) - waterDensity(Tn - 0.01)) / 0.02;
    const vapour = ((an - a) / h) * (1 - RHO_V / rhoL);
    const expansion = -(1 - 0.5 * (a + an)) * (drho / rhoL) * ((Tn - T0[k]) / h);
    P.source[k] = vapour + expansion;
    T[k] = Tn;
    alpha[k] = an;
  }

  // 2. The flow: Darcy in the gap with the volume sources, open at the rim.
  solveFlow(P, c);

  // 3. Carry the temperature and the vapour with it.
  advect(P, h);

  for (let k = 0; k < n * n; k++) if (!inside[k]) { T[k] = Tamb; alpha[k] = 0; }
  P.time += h;
}

function solveFlow(P: BoilPlate, c: BoilControls) {
  const { n, dx, gap: d, inside, T, alpha, p, u, v } = P;
  const gIn = (c.g ?? 9.81) * Math.sin(c.tilt ?? 0);
  const rhoRoom = waterDensity(P.ambient);
  const Mroom = (d * d) / (12 * waterViscosity(P.ambient));
  const M = new Float64Array(n * n), f = new Float64Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (!inside[k]) { M[k] = Mroom; continue; }
    M[k] = (d * d) / (12 * waterViscosity(T[k]));
    f[k] = ((1 - alpha[k]) * waterDensity(T[k]) + alpha[k] * RHO_V - rhoRoom) * gIn;
  }
  const hm = (a: number, b: number) => (2 * a * b) / (a + b);
  const cell = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i);
  // A p = b over the dish's cells, scaled by dx²/Mroom so its diagonal is of order 4.
  // Each cell's four face coefficients and neighbours (−1: the rim, where p = 0).
  const ids: number[] = [];
  for (let k = 0; k < n * n; k++) if (inside[k]) ids.push(k);
  const N = ids.length;
  const W = new Float64Array(N * 4), nb = new Int32Array(N * 4), diag = new Float64Array(N), b = new Float64Array(N);
  const slot = new Int32Array(n * n).fill(-1);
  ids.forEach((k, s) => { slot[k] = s; });
  const sc = (dx * dx) / Mroom;
  for (let s = 0; s < N; s++) {
    const k = ids[s], i = k % n, j = (k / n) | 0;
    let dg = 0;
    const around = [cell(i + 1, j), cell(i - 1, j), cell(i, j + 1), cell(i, j - 1)];
    for (let e = 0; e < 4; e++) {
      const m = around[e];
      const w = hm(M[k], m < 0 ? Mroom : M[m]) / Mroom;
      dg += w;
      W[s * 4 + e] = w;
      nb[s * 4 + e] = m >= 0 ? slot[m] : -1;
    }
    diag[s] = dg;
    const md = around[2], mu = around[3];
    const fd = 0.5 * (f[k] + (md < 0 ? 0 : f[md])), fu = 0.5 * (f[k] + (mu < 0 ? 0 : f[mu]));
    b[s] = sc * P.source[k] - (W[s * 4 + 2] * fd - W[s * 4 + 3] * fu) * dx;
  }
  const apply = (x: Float64Array, out: Float64Array) => {
    for (let s = 0; s < N; s++) {
      let v2 = diag[s] * x[s];
      for (let e = 0; e < 4; e++) { const m = nb[s * 4 + e]; if (m >= 0) v2 -= W[s * 4 + e] * x[m]; }
      out[s] = v2;
    }
  };
  // Conjugate gradients with a Jacobi preconditioner, warm-started from the last pressure.
  const x = new Float64Array(N);
  for (let s = 0; s < N; s++) x[s] = p[ids[s]];
  const r = new Float64Array(N), z = new Float64Array(N), q = new Float64Array(N), Ap = new Float64Array(N);
  apply(x, Ap);
  let bn = 0;
  for (let s = 0; s < N; s++) { r[s] = b[s] - Ap[s]; bn += b[s] * b[s]; }
  bn = Math.sqrt(bn);
  if (bn > 0) {
    let rz = 0;
    for (let s = 0; s < N; s++) { z[s] = r[s] / diag[s]; q[s] = z[s]; rz += r[s] * z[s]; }
    for (let it = 0; it < 4000; it++) {
      apply(q, Ap);
      let qAq = 0;
      for (let s = 0; s < N; s++) qAq += q[s] * Ap[s];
      if (qAq <= 0) break;
      const al = rz / qAq;
      let rn = 0;
      for (let s = 0; s < N; s++) { x[s] += al * q[s]; r[s] -= al * Ap[s]; rn += r[s] * r[s]; }
      if (Math.sqrt(rn) <= 1e-10 * bn) break;
      let rz2 = 0;
      for (let s = 0; s < N; s++) { z[s] = r[s] / diag[s]; rz2 += r[s] * z[s]; }
      const be = rz2 / rz;
      rz = rz2;
      for (let s = 0; s < N; s++) q[s] = z[s] + be * q[s];
    }
  } else x.fill(0);
  p.fill(0);
  for (let s = 0; s < N; s++) p[ids[s]] = x[s];
  // Face velocities. A face with the rim on one side sees p = 0 there; faces wholly in the rim carry nothing.
  u.fill(0); v.fill(0);
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) {
    const L = cell(i - 1, j), R = cell(i, j);
    const li = L >= 0 && inside[L], ri = R >= 0 && inside[R];
    if (!li && !ri) continue;
    const Mf = hm(L >= 0 ? M[L] : Mroom, R >= 0 ? M[R] : Mroom);
    u[j * (n + 1) + i] = (-Mf * ((ri ? p[R] : 0) - (li ? p[L] : 0))) / dx;
  }
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) {
    const U = cell(i, j - 1), D = cell(i, j);
    const ui = U >= 0 && inside[U], di = D >= 0 && inside[D];
    if (!ui && !di) continue;
    const Mf = hm(U >= 0 ? M[U] : Mroom, D >= 0 ? M[D] : Mroom);
    const ff = 0.5 * ((ui ? f[U] : 0) + (di ? f[D] : 0));
    v[j * n + i] = Mf * (-((di ? p[D] : 0) - (ui ? p[U] : 0)) / dx + ff);
  }
}

const minmod = (a: number, b: number) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

function advect(P: BoilPlate, h: number) {
  const { n, dx, inside, T, alpha, u, v } = P;
  let vmax = 0;
  for (const w of u) vmax = Math.max(vmax, Math.abs(w));
  for (const w of v) vmax = Math.max(vmax, Math.abs(w));
  // A quarter cell per face per sub-step: a cell's outflow over its four faces stays under a cell.
  const subs = Math.max(1, Math.ceil((vmax * h) / dx / 0.25));
  const hs = h / subs;
  const get = (F: Float64Array, i: number, j: number, outside: number) => {
    if (i < 0 || j < 0 || i >= n || j >= n) return outside;
    const k = j * n + i;
    return inside[k] ? F[k] : outside;
  };
  // The face value of a field, from the upwind side, with a minmod slope (second order, no new extrema).
  const face = (F: Float64Array, outside: number, i0: number, j0: number, di: number, dj: number, w: number) => {
    // the face lies between cell (i0, j0) and (i0+di, j0+dj); w > 0 means flow from the first to the second
    if (w >= 0) {
      const c0 = get(F, i0, j0, outside), cm = get(F, i0 - di, j0 - dj, outside), cp = get(F, i0 + di, j0 + dj, outside);
      return c0 + 0.5 * minmod(c0 - cm, cp - c0);
    }
    const c0 = get(F, i0 + di, j0 + dj, outside), cm = get(F, i0 + 2 * di, j0 + 2 * dj, outside), cp = get(F, i0, j0, outside);
    return c0 + 0.5 * minmod(c0 - cm, cp - c0);
  };
  for (let s = 0; s < subs; s++) {
    const T0 = Float64Array.from(T), a0 = Float64Array.from(alpha);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!inside[k]) continue;
      // Each face's outward velocity, and the cell across it.
      const faces: [number, number, number, number, number][] = [
        [u[j * (n + 1) + i + 1], i, j, 1, 0],    // right: outward is +u
        [-u[j * (n + 1) + i], i - 1, j, 1, 0],   // left: outward is −u
        [v[(j + 1) * n + i], i, j, 0, 1],        // below
        [-v[j * n + i], i, j - 1, 0, 1],         // above
      ];
      let dT = 0, dA = 0;
      // The liquid carries its share of the cell's heat; the glass stays.
      const share = ((1 - a0[k]) * RHO_C * P.gap) / heatCapacity(P, a0[k]);
      for (const [wOut, i0, j0, di, dj] of faces) {
        // velocity along +di/+dj for this face
        const wAlong = di + dj > 0 && (i0 === i && j0 === j) ? wOut : -wOut;
        const Tf = face(T0, P.ambient, i0, j0, di, dj, wAlong);
        const Af = face(a0, 0, i0, j0, di, dj, wAlong);
        dT -= share * wOut * (Tf - T0[k]);      // u·∇T, written over the faces
        dA -= wOut * Af;                         // the vapour, conservatively
      }
      T[k] = T0[k] + (hs / dx) * dT;
      alpha[k] = Math.min(ALPHA_MAX, Math.max(0, a0[k] + (hs / dx) * dA));
    }
  }
}
