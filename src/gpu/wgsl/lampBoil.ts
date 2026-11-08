/**
 * WGSL compute kernels for the two-phase Hele-Shaw lamp-boiling model (PLAN 36e-2).
 *
 * Pass for pass with the CPU reference in `src/lib/lampBoil.ts`:
 *   1. `boilThermal` — Beer–Lambert two-band lamp absorption (visible 0.12 by dye,
 *      near-IR 0.88 by water), sideways conduction in water + glass (harmonic-mean
 *      face conductance, open rim held at ambient), forced vs hand-blocked natural
 *      air convection on both faces, linearised thermal radiation 2 ε σ (T⁴ − T_a⁴)
 *      from both faces, liquid–vapour interface heat exchange, implicit temperature
 *      update written as a delta from T₀, vapour fraction update with `ALPHA_MAX`
 *      dry-out and `alphaMin` condensation heat return, heterogeneous cavity
 *      nucleation (Poisson count per cell, log-normal cavities, equilibrium nucleus
 *      superheat) and homogeneous limit, Kell (1975) water density thermal expansion +
 *      vapour volume source, Vogel water viscosity mobility, and two-phase buoyancy
 *      in the dish plane.
 *   2. `boilFlow` — Darcy pressure projection in the thin gap with harmonic-mean
 *      face mobilities and open-rim Dirichlet boundary (p = 0 outside the dish
 *      radius), recovering staggered face velocities u ((n+1)×n) and v (n×(n+1)).
 *   3. `boilAdvect` — Courant-substepped minmod-limited upwind advection of T
 *      (weighted by liquid heat-capacity share) and conservative flux advection of α.
 */

export const RHO_C = 4.18e6;
export const K_WATER = 0.6;
export const K_GLASS = 1.0;
export const RHO_C_GLASS = 2500 * 840;
export const T_SAT = 100.0;
export const T_HOM = 300.0;
export const LATENT = 2.257e6;
export const RHO_V = 0.598;
export const SIGMA_SAT = 0.0589;
export const ALPHA_MAX = 0.95;
export const SIGMA_SB = 5.670374e-8;
export const T_AMBIENT = 20.0;
export const HAND_RADIUS = 0.015;

/** Shared physical property functions in WGSL (`waterDensity`, `waterDensityDeriv`, `waterViscosity`, `minmodBoil`). */
export const BOIL_PROPERTIES_WGSL = /* wgsl */ `
const RHO_C: f32 = 4.18e6;
const K_WATER: f32 = 0.6;
const K_GLASS: f32 = 1.0;
const RHO_C_GLASS: f32 = 2.1e6;
const T_SAT: f32 = 100.0;
const T_HOM: f32 = 300.0;
const LATENT: f32 = 2.257e6;
const RHO_V: f32 = 0.598;
const SIGMA_SAT: f32 = 0.0589;
const ALPHA_MAX: f32 = 0.95;
const SIGMA_SB: f32 = 5.670374e-8;
const T_AMBIENT: f32 = 20.0;
const HAND_RADIUS: f32 = 0.015;
const GLASS_THICK: f32 = 2e-3;
const LAMP_IRRADIANCE: f32 = 8000.0;
const LAMP_HALF_R: f32 = 0.02;
const LAMP_CENTER_X: f32 = 0.5;
const LAMP_CENTER_Y: f32 = 0.5;
const KAPPA_IR: f32 = 600.0;
const H_FORCED: f32 = 50.0;
const H_NATURAL: f32 = 10.0;
const VIS_FRACTION: f32 = 0.12;
const EPS_GLASS: f32 = 0.9;
const H_INTER: f32 = 1e4;
const PI_BOIL: f32 = 3.141592653589793;

// Kell (1975) liquid water density (kg/m³), 0–150 °C at 1 atm.
fn waterDensity(T: f32) -> f32 {
  let t = clamp(T, 0.0, 150.0);
  let num = 999.83952 + t * (16.945176 + t * (-7.9870401e-3 + t * (-46.170461e-6 + t * (105.56302e-9 - 280.54253e-12 * t))));
  return num / (1.0 + 16.879850e-3 * t);
}

// Exact derivative d(waterDensity)/dT (kg/(m³·K)) of Kell's rational polynomial,
// with the leading constant term a1 - a0*b1 pre-cancelled so float32 loses no digits.
fn waterDensityDeriv(T: f32) -> f32 {
  let t = clamp(T, 0.0, 150.0);
  let q = 1.0 + 16.879850e-3 * t;
  let num = 0.0680348784 + t * (-15.9740802e-3 + t * (-273.3314218e-6 + t * (-1136.448828e-9 + t * (3942.942165e-12 - 18.9420624e-12 * t))));
  return num / (q * q);
}

// Vogel dynamic viscosity of liquid water (Pa·s), 0–150 °C.
fn waterViscosity(T: f32) -> f32 {
  let t = clamp(T, 0.0, 150.0);
  return 2.414e-5 * pow(10.0, 247.8 / (t + 273.15 - 140.0));
}

fn minmodBoil(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return select(b, a, abs(a) < abs(b));
}
`;

export const BOIL_DISH_WGSL = /* wgsl */ `
${BOIL_PROPERTIES_WGSL}

struct BoilUniforms {
  n: u32,
  holdCount: u32,
  sweeps: u32,
  parity: u32,
  h: f32,
  width: f32,
  dx: f32,
  gap: f32,
  glass: f32,
  ambient: f32,
  heat: f32,
  I0: f32,
  lampWidth: f32,
  lampCx: f32,
  lampCy: f32,
  visibleFraction: f32,
  kappaIR: f32,
  emissivity: f32,
  hForced: f32,
  hNatural: f32,
  interfaceH: f32,
  alphaSeed: f32,
  alphaMin: f32,
  gIn: f32,
  rhoRoom: f32,
  Mroom: f32,
  omega: f32,
  pad1: f32,
  holds: array<vec4f, 8>,
};

// Binding 0: uniforms
// Binding 1: inside mask (f32, 0..N: 1.0 inside dish, 0.0 outside)
// Binding 2: public fields [0..N: T, N..2N: alpha, 2N..3N: dye, 3N..4N: dTnuc, 4N..5N: source, 5N..5N+(n+1)n: u, ..: v]
// Binding 3: scratch work  [0..N: T0, N..2N: a0, 2N..3N: M, 3N..4N: f, 4N..5N: b, 5N..6N: p]
// Binding 4: starts count  [0..N: u32 nucleations per cell]
@group(0) @binding(0) var<uniform> U: BoilUniforms;
@group(0) @binding(1) var<storage, read> inside: array<f32>;
@group(0) @binding(2) var<storage, read_write> fields: array<f32>;
@group(0) @binding(3) var<storage, read_write> work: array<f32>;
@group(0) @binding(4) var<storage, read_write> starts: array<u32>;

fn isInside(k: u32) -> bool { return inside[k] > 0.5; }

fn heatCapacity(a: f32) -> f32 {
  return (1.0 - a) * RHO_C * U.gap + RHO_C_GLASS * U.glass;
}

fn conductance(a: f32) -> f32 {
  return K_WATER * U.gap * (1.0 - a) + K_GLASS * U.glass;
}

fn hm(a: f32, b: f32) -> f32 {
  return (2.0 * a * b) / (a + b);
}

fn isHeld(x: f32, y: f32) -> bool {
  for (var hi = 0u; hi < U.holdCount; hi++) {
    let hd = U.holds[hi];
    let dx0 = x - hd.x;
    let dy0 = y - hd.y;
    if (dx0 * dx0 + dy0 * dy0 < hd.z) {
      return true;
    }
  }
  return false;
}

@compute @workgroup_size(256)
fn boilCopyIn(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let N = U.n * U.n;
  if (k >= N) { return; }
  work[k] = fields[k];
  work[N + k] = fields[N + k];
}

@compute @workgroup_size(256)
fn boilThermal(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  if (k >= N) { return; }

  let offAlpha = N;
  let offDye = 2u * N;
  let offDTnuc = 3u * N;
  let offSrc = 4u * N;
  let offM = 2u * N;
  let offF = 3u * N;

  if (!isInside(k)) {
    fields[offSrc + k] = 0.0;
    fields[k] = U.ambient;
    fields[offAlpha + k] = 0.0;
    work[offM + k] = U.Mroom;
    work[offF + k] = 0.0;
    return;
  }

  let i = i32(k % n);
  let j = i32(k / n);
  let dx = U.dx;
  let d = U.gap;
  let Tamb = U.ambient;
  let T0k = work[k];
  let a = work[N + k];
  let fv = U.visibleFraction;
  let absorbed = fv * (1.0 - exp(-fields[offDye + k] * (1.0 - a))) + (1.0 - fv) * (1.0 - exp(-U.kappaIR * d * (1.0 - a)));
  let x = (f32(i) + 0.5) * dx - 0.5 * U.width;
  let y = (f32(j) + 0.5) * dx - 0.5 * U.width;
  let lx = x - U.lampCx;
  let ly = y - U.lampCy;
  let lampI = U.I0 * exp(-(lx * lx + ly * ly) / (2.0 * U.lampWidth * U.lampWidth));
  let q = U.heat * lampI * absorbed;

  let held = isHeld(x, y);
  let TK = T0k + 273.15;
  let AK = Tamb + 273.15;
  let hl = select(U.hForced, U.hNatural, held) + 2.0 * U.emissivity * SIGMA_SB * (TK * TK + AK * AK) * (TK + AK);
  let C = heatCapacity(a);
  let kk = conductance(a);
  let K0 = conductance(0.0);

  var cond = 0.0;
  let dirs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var e = 0; e < 4; e++) {
    let ii = i + dirs[e].x;
    let jj = j + dirs[e].y;
    var out = true;
    var km = K0;
    var Tnb = Tamb;
    if (ii >= 0 && jj >= 0 && ii < ni && jj < ni) {
      let m = u32(jj * ni + ii);
      if (isInside(m)) {
        out = false;
        km = conductance(work[N + m]);
        Tnb = work[m];
      }
    }
    let kf = (2.0 * kk * km) / (kk + km);
    cond += (kf * (Tnb - T0k)) / (dx * dx);
  }

  let G = select(0.0, U.interfaceH * 2.0 * sqrt(PI_BOIL * a) * (d / dx), a > 0.0);
  let h = U.h;
  let latentPerAlpha = RHO_V * LATENT * d;
  var Tn = T0k + (h * (q + cond + hl * (Tamb - T0k) + G * (T_SAT - T0k))) / (C + h * (hl + G));
  var an = a + (G * (Tn - T_SAT) * h) / latentPerAlpha;
  if (an > ALPHA_MAX) {
    Tn += ((an - ALPHA_MAX) * latentPerAlpha) / C;
    an = ALPHA_MAX;
  }
  if (an < U.alphaMin) {
    Tn += (an * latentPerAlpha) / C;
    an = 0.0;
  }
  if (an == 0.0 && (Tn >= T_SAT + fields[offDTnuc + k] || Tn >= T_HOM)) {
    an = U.alphaSeed;
    Tn -= (an * latentPerAlpha) / C;
    starts[k] = starts[k] + 1u;
  }

  let rhoL = waterDensity(Tn);
  let drho = waterDensityDeriv(Tn);
  let vapour = ((an - a) / h) * (1.0 - RHO_V / rhoL);
  let expansion = -(1.0 - 0.5 * (a + an)) * (drho / rhoL) * ((Tn - T0k) / h);
  fields[offSrc + k] = vapour + expansion;
  fields[k] = Tn;
  fields[offAlpha + k] = an;

  work[offM + k] = (d * d) / (12.0 * waterViscosity(Tn));
  work[offF + k] = ((1.0 - an) * rhoL + an * RHO_V - U.rhoRoom) * U.gIn;
}

fn cellM(ii: i32, jj: i32, ni: i32, offM: u32) -> f32 {
  if (ii < 0 || jj < 0 || ii >= ni || jj >= ni) { return U.Mroom; }
  return work[offM + u32(jj * ni + ii)];
}

fn cellF(ii: i32, jj: i32, ni: i32, offF: u32) -> f32 {
  if (ii < 0 || jj < 0 || ii >= ni || jj >= ni) { return 0.0; }
  let m = u32(jj * ni + ii);
  return select(0.0, work[offF + m], isInside(m));
}

fn cellP(ii: i32, jj: i32, ni: i32, offP: u32) -> f32 {
  if (ii < 0 || jj < 0 || ii >= ni || jj >= ni) { return 0.0; }
  let m = u32(jj * ni + ii);
  return select(0.0, work[offP + m], isInside(m));
}

var<workgroup> wMax: array<f32, 256>;
var<workgroup> wVmax: f32;

@compute @workgroup_size(256)
fn boilFlowSingle(@builtin(local_invocation_id) lid: vec3u) {
  let tid = lid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  let offSrc = 4u * N;
  let offU = 5u * N;
  let offV = 5u * N + (n + 1u) * n;
  let offM = 2u * N;
  let offF = 3u * N;
  let offB = 4u * N;
  let offP = 5u * N;

  let sc = (U.dx * U.dx) / U.Mroom;
  var localBMax = 0.0;

  for (var k = tid; k < N; k += 256u) {
    if (!isInside(k)) {
      work[offP + k] = 0.0;
      work[offB + k] = 0.0;
      continue;
    }
    let i = i32(k % n);
    let j = i32(k / n);
    let mk = work[offM + k];
    let fk = work[offF + k];
    let wD = hm(mk, cellM(i, j + 1, ni, offM)) / U.Mroom;
    let wU = hm(mk, cellM(i, j - 1, ni, offM)) / U.Mroom;
    let fd = 0.5 * (fk + cellF(i, j + 1, ni, offF));
    let fu = 0.5 * (fk + cellF(i, j - 1, ni, offF));
    let bk = sc * fields[offSrc + k] - (wD * fd - wU * fu) * U.dx;
    work[offB + k] = bk;
    let ab = abs(bk);
    if (ab > localBMax) { localBMax = ab; }
  }
  wMax[tid] = localBMax;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (tid < stride) {
      wMax[tid] = max(wMax[tid], wMax[tid + stride]);
    }
    workgroupBarrier();
  }
  if (tid == 0u) { wVmax = wMax[0]; }
  let bMax = workgroupUniformLoad(&wVmax);

  let uLen = (n + 1u) * n;
  let vLen = n * (n + 1u);
  if (bMax == 0.0) {
    for (var k = tid; k < N; k += 256u) { work[offP + k] = 0.0; }
    for (var k = tid; k < uLen; k += 256u) { fields[offU + k] = 0.0; }
    for (var k = tid; k < vLen; k += 256u) { fields[offV + k] = 0.0; }
    return;
  }

  let omega = U.omega;
  storageBarrier();
  for (var s = 0u; s < U.sweeps; s++) {
    for (var parity = 0u; parity < 2u; parity++) {
      for (var k = tid; k < N; k += 256u) {
        let i = i32(k % n);
        let j = i32(k / n);
        if (u32((i + j) & 1) != parity) { continue; }
        if (!isInside(k)) {
          work[offP + k] = 0.0;
          continue;
        }
        let mk = work[offM + k];
        let wE = hm(mk, cellM(i + 1, j, ni, offM)) / U.Mroom;
        let wW = hm(mk, cellM(i - 1, j, ni, offM)) / U.Mroom;
        let wD = hm(mk, cellM(i, j + 1, ni, offM)) / U.Mroom;
        let wU = hm(mk, cellM(i, j - 1, ni, offM)) / U.Mroom;
        let dg = wE + wW + wD + wU;
        let sumNb = wE * cellP(i + 1, j, ni, offP)
                  + wW * cellP(i - 1, j, ni, offP)
                  + wD * cellP(i, j + 1, ni, offP)
                  + wU * cellP(i, j - 1, ni, offP);
        let pGS = (work[offB + k] + sumNb) / dg;
        let pk = work[offP + k];
        work[offP + k] = pk + omega * (pGS - pk);
      }
      storageBarrier();
    }
  }

  // Staggered x-faces: u[j * (n + 1) + i]
  for (var idx = tid; idx < uLen; idx += 256u) {
    let i = i32(idx % (n + 1u));
    let j = i32(idx / (n + 1u));
    let li = i - 1 >= 0 && isInside(u32(j * ni + (i - 1)));
    let ri = i < ni && isInside(u32(j * ni + i));
    if (!li && !ri) {
      fields[offU + idx] = 0.0;
      continue;
    }
    let mL = cellM(i - 1, j, ni, offM);
    let mR = cellM(i, j, ni, offM);
    let Mf = hm(mL, mR);
    let pL = select(0.0, work[offP + u32(j * ni + (i - 1))], li);
    let pR = select(0.0, work[offP + u32(j * ni + i)], ri);
    fields[offU + idx] = (-Mf * (pR - pL)) / U.dx;
  }

  // Staggered y-faces: v[j * n + i]
  for (var idx = tid; idx < vLen; idx += 256u) {
    let i = i32(idx % n);
    let j = i32(idx / n);
    let ui = j - 1 >= 0 && isInside(u32((j - 1) * ni + i));
    let di = j < ni && isInside(u32(j * ni + i));
    if (!ui && !di) {
      fields[offV + idx] = 0.0;
      continue;
    }
    let mU = cellM(i, j - 1, ni, offM);
    let mD = cellM(i, j, ni, offM);
    let Mf = hm(mU, mD);
    let pU = select(0.0, work[offP + u32((j - 1) * ni + i)], ui);
    let pD = select(0.0, work[offP + u32(j * ni + i)], di);
    let fU = select(0.0, work[offF + u32((j - 1) * ni + i)], ui);
    let fD = select(0.0, work[offF + u32(j * ni + i)], di);
    let ff = 0.5 * (fU + fD);
    fields[offV + idx] = Mf * (-(pD - pU) / U.dx + ff);
  }
}

// Multi-workgroup flow kernels for large grids (e.g. 768²).
@compute @workgroup_size(256)
fn boilFlowRhs(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  if (k >= N) { return; }
  let offSrc = 4u * N;
  let offM = 2u * N;
  let offF = 3u * N;
  let offB = 4u * N;
  let offP = 5u * N;
  if (!isInside(k)) {
    work[offP + k] = 0.0;
    work[offB + k] = 0.0;
    return;
  }
  let i = i32(k % n);
  let j = i32(k / n);
  let mk = work[offM + k];
  let fk = work[offF + k];
  let sc = (U.dx * U.dx) / U.Mroom;
  let wD = hm(mk, cellM(i, j + 1, ni, offM)) / U.Mroom;
  let wU = hm(mk, cellM(i, j - 1, ni, offM)) / U.Mroom;
  let fd = 0.5 * (fk + cellF(i, j + 1, ni, offF));
  let fu = 0.5 * (fk + cellF(i, j - 1, ni, offF));
  work[offB + k] = sc * fields[offSrc + k] - (wD * fd - wU * fu) * U.dx;
}

fn flowSweep(idx: u32, parity: u32) {
  let n = U.n;
  let ni = i32(n);
  let half = n / 2u;
  if (idx >= n * half) { return; }
  let N = n * n;
  let offM = 2u * N;
  let offB = 4u * N;
  let offP = 5u * N;
  let j = i32(idx / half);
  let i = i32(2u * (idx % half) + ((u32(j) + parity) & 1u));
  let k = u32(j * ni + i);
  if (!isInside(k)) {
    work[offP + k] = 0.0;
    return;
  }
  let mk = work[offM + k];
  let wE = hm(mk, cellM(i + 1, j, ni, offM)) / U.Mroom;
  let wW = hm(mk, cellM(i - 1, j, ni, offM)) / U.Mroom;
  let wD = hm(mk, cellM(i, j + 1, ni, offM)) / U.Mroom;
  let wU = hm(mk, cellM(i, j - 1, ni, offM)) / U.Mroom;
  let dg = wE + wW + wD + wU;
  let sumNb = wE * cellP(i + 1, j, ni, offP)
            + wW * cellP(i - 1, j, ni, offP)
            + wD * cellP(i, j + 1, ni, offP)
            + wU * cellP(i, j - 1, ni, offP);
  let pGS = (work[offB + k] + sumNb) / dg;
  let pk = work[offP + k];
  work[offP + k] = pk + U.omega * (pGS - pk);
}

@compute @workgroup_size(256)
fn boilFlowSweepRed(@builtin(global_invocation_id) gid: vec3u) {
  flowSweep(gid.x, 0u);
}

@compute @workgroup_size(256)
fn boilFlowSweepBlack(@builtin(global_invocation_id) gid: vec3u) {
  flowSweep(gid.x, 1u);
}

@compute @workgroup_size(256)
fn boilFlowVel(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  let offU = 5u * N;
  let offV = 5u * N + (n + 1u) * n;
  let offM = 2u * N;
  let offF = 3u * N;
  let offP = 5u * N;
  let uLen = (n + 1u) * n;
  let vLen = n * (n + 1u);

  if (idx < uLen) {
    let i = i32(idx % (n + 1u));
    let j = i32(idx / (n + 1u));
    let li = i - 1 >= 0 && isInside(u32(j * ni + (i - 1)));
    let ri = i < ni && isInside(u32(j * ni + i));
    if (!li && !ri) {
      fields[offU + idx] = 0.0;
    } else {
      let Mf = hm(cellM(i - 1, j, ni, offM), cellM(i, j, ni, offM));
      let pL = select(0.0, work[offP + u32(j * ni + (i - 1))], li);
      let pR = select(0.0, work[offP + u32(j * ni + i)], ri);
      fields[offU + idx] = (-Mf * (pR - pL)) / U.dx;
    }
  }
  if (idx < vLen) {
    let i = i32(idx % n);
    let j = i32(idx / n);
    let ui = j - 1 >= 0 && isInside(u32((j - 1) * ni + i));
    let di = j < ni && isInside(u32(j * ni + i));
    if (!ui && !di) {
      fields[offV + idx] = 0.0;
    } else {
      let Mf = hm(cellM(i, j - 1, ni, offM), cellM(i, j, ni, offM));
      let pU = select(0.0, work[offP + u32((j - 1) * ni + i)], ui);
      let pD = select(0.0, work[offP + u32(j * ni + i)], di);
      let fU = select(0.0, work[offF + u32((j - 1) * ni + i)], ui);
      let fD = select(0.0, work[offF + u32(j * ni + i)], di);
      fields[offV + idx] = Mf * (-(pD - pU) / U.dx + 0.5 * (fU + fD));
    }
  }
}

fn getWork(off: u32, ii: i32, jj: i32, ni: i32, outside: f32) -> f32 {
  if (ii < 0 || jj < 0 || ii >= ni || jj >= ni) { return outside; }
  let m = u32(jj * ni + ii);
  return select(outside, work[off + m], isInside(m));
}

fn faceVal(off: u32, outside: f32, i0: i32, j0: i32, di: i32, dj: i32, w: f32, ni: i32) -> f32 {
  if (w >= 0.0) {
    let c0 = getWork(off, i0, j0, ni, outside);
    let cm = getWork(off, i0 - di, j0 - dj, ni, outside);
    let cp = getWork(off, i0 + di, j0 + dj, ni, outside);
    return c0 + 0.5 * minmodBoil(c0 - cm, cp - c0);
  }
  let c0 = getWork(off, i0 + di, j0 + dj, ni, outside);
  let cm = getWork(off, i0 + 2 * di, j0 + 2 * dj, ni, outside);
  let cp = getWork(off, i0, j0, ni, outside);
  return c0 + 0.5 * minmodBoil(c0 - cm, cp - c0);
}

fn advectCell(k: u32, n: u32, ni: i32, N: u32, hs: f32) {
  let offAlpha = N;
  let offU = 5u * N;
  let offV = 5u * N + (n + 1u) * n;
  if (!isInside(k)) {
    fields[k] = U.ambient;
    fields[offAlpha + k] = 0.0;
    return;
  }
  let i = i32(k % n);
  let j = i32(k / n);
  let T0k = work[k];
  let a0k = work[N + k];
  let share = ((1.0 - a0k) * RHO_C * U.gap) / heatCapacity(a0k);

  let uR = fields[offU + u32(j) * (n + 1u) + u32(i) + 1u];
  let uL = fields[offU + u32(j) * (n + 1u) + u32(i)];
  let vD = fields[offV + (u32(j) + 1u) * n + u32(i)];
  let vU = fields[offV + u32(j) * n + u32(i)];

  var dT = 0.0;
  var dA = 0.0;

  // Right face: wOut = +uR, i0 = i, j0 = j, di = 1, dj = 0, wAlong = +uR
  {
    let wOut = uR;
    let Tf = faceVal(0u, U.ambient, i, j, 1, 0, uR, ni);
    let Af = faceVal(N, 0.0, i, j, 1, 0, uR, ni);
    dT -= share * wOut * (Tf - T0k);
    dA -= wOut * Af;
  }
  // Left face: wOut = -uL, i0 = i - 1, j0 = j, di = 1, dj = 0, wAlong = +uL
  {
    let wOut = -uL;
    let Tf = faceVal(0u, U.ambient, i - 1, j, 1, 0, uL, ni);
    let Af = faceVal(N, 0.0, i - 1, j, 1, 0, uL, ni);
    dT -= share * wOut * (Tf - T0k);
    dA -= wOut * Af;
  }
  // Bottom face: wOut = +vD, i0 = i, j0 = j, di = 0, dj = 1, wAlong = +vD
  {
    let wOut = vD;
    let Tf = faceVal(0u, U.ambient, i, j, 0, 1, vD, ni);
    let Af = faceVal(N, 0.0, i, j, 0, 1, vD, ni);
    dT -= share * wOut * (Tf - T0k);
    dA -= wOut * Af;
  }
  // Top face: wOut = -vU, i0 = i, j0 = j - 1, di = 0, dj = 1, wAlong = +vU
  {
    let wOut = -vU;
    let Tf = faceVal(0u, U.ambient, i, j - 1, 0, 1, vU, ni);
    let Af = faceVal(N, 0.0, i, j - 1, 0, 1, vU, ni);
    dT -= share * wOut * (Tf - T0k);
    dA -= wOut * Af;
  }

  fields[k] = T0k + (hs / U.dx) * dT;
  fields[offAlpha + k] = clamp(a0k + (hs / U.dx) * dA, 0.0, ALPHA_MAX);
}

@compute @workgroup_size(256)
fn boilAdvectSingle(@builtin(local_invocation_id) lid: vec3u) {
  let tid = lid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  let offAlpha = N;
  let offU = 5u * N;
  let offV = 5u * N + (n + 1u) * n;
  let uLen = (n + 1u) * n;
  let vLen = n * (n + 1u);

  var localMax = 0.0;
  for (var idx = tid; idx < uLen; idx += 256u) {
    let av = abs(fields[offU + idx]);
    if (av > localMax) { localMax = av; }
  }
  for (var idx = tid; idx < vLen; idx += 256u) {
    let av = abs(fields[offV + idx]);
    if (av > localMax) { localMax = av; }
  }
  wMax[tid] = localMax;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride >>= 1u) {
    if (tid < stride) {
      wMax[tid] = max(wMax[tid], wMax[tid + stride]);
    }
    workgroupBarrier();
  }
  if (tid == 0u) { wVmax = wMax[0]; }
  let vmax = workgroupUniformLoad(&wVmax);
  if (vmax == 0.0) { return; }

  let subs = max(1u, min(64u, u32(ceil((vmax * U.h) / U.dx / 0.25))));
  let hs = U.h / f32(subs);

  for (var s = 0u; s < subs; s++) {
    for (var k = tid; k < N; k += 256u) {
      work[k] = fields[k];
      work[N + k] = fields[offAlpha + k];
    }
    storageBarrier();
    for (var k = tid; k < N; k += 256u) {
      advectCell(k, n, ni, N, hs);
    }
    storageBarrier();
  }
}

@compute @workgroup_size(256)
fn boilAdvectMulti(@builtin(global_invocation_id) gid: vec3u) {
  let k = gid.x;
  let n = U.n;
  let ni = i32(n);
  let N = n * n;
  if (k >= N) { return; }
  advectCell(k, n, ni, N, U.h);
}
`;

/**
 * The same thermal and two-phase boil model on the plate's own textures
 * (PLAN §36e-2):
 * - vel.z holds ΔT = T - T_AMBIENT in °C (K above 20 °C);
 * - lamp irradiance in W/m² (the plate's hot spot times the Heat dial and dimmer),
 *   split into visible (0.12, taken by the dye 1 - exp(-A_dye (1 - alpha)) where
 *   A_dye is decoded via lampThrough) and near-IR (0.88, taken by the water
 *   1 - exp(-KAPPA_IR d (1 - alpha)));
 * - sideways conduction through liquid + two glass sheets, radiation
 *   2 eps sigma (T^4 - Ta^4) from both faces, and air convection h per cell
 *   (H_FORCED, or H_NATURAL where a held hand blocks the cooling air);
 * - per-cell nucleation superheat dTnuc (seeded as a Poisson site density per m²
 *   at each cell's largest cavity's equilibrium-nucleus superheat), interface
 *   heat exchange both ways, latent heat, and ALPHA_MIN / ALPHA_MAX limits;
 * - warming water's thermal expansion and the vapour's volume change added into
 *   the thin gap's pour buffer (poured[k]) with the open rim as the outlet.
 */
export const PLATE_BOIL_WGSL = /* wgsl */ `
${BOIL_PROPERTIES_WGSL}

struct PlateBoilU {
  n: f32,
  dt: f32,
  disp: f32,
  heat: f32,
  dimmer: f32,
  h0: f32,
  gapMetres: f32,
  plateMetres: f32,
  upX: f32,
  upY: f32,
  holdCount: u32,
  thin: u32,
  holds: array<vec4f, 4>,
};

@group(0) @binding(0) var<uniform> P: PlateBoilU;
@group(0) @binding(1) var velIn: texture_2d<f32>;
@group(0) @binding(2) var velForced: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var alphaIn: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> dTnuc: array<f32>;
@group(0) @binding(7) var velOut: texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var alphaOut: texture_storage_2d<r32float, write>;
@group(0) @binding(9) var<storage, read_write> poured: array<f32>;

fn insideRim(q: vec2i, n: i32) -> bool {
  if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) { return false; }
  let uv = (vec2f(q) + 0.5) / f32(n) - vec2f(0.5);
  return dot(uv, uv) < 0.25;
}

fn gapMetresAt(q: vec2i, n: i32) -> f32 {
  let c = clamp(q, vec2i(0), vec2i(n - 1));
  let g = max(textureLoad(sq, c, 0).r, 0.004);
  return max(1e-4, (g / max(P.h0, 1e-4)) * P.gapMetres);
}

fn tempAt(q: vec2i, n: i32) -> f32 {
  if (!insideRim(q, n)) { return T_AMBIENT; }
  return max(0.0, T_AMBIENT + textureLoad(velIn, q, 0).z);
}

fn alphaAt(q: vec2i, n: i32) -> f32 {
  if (!insideRim(q, n)) { return 0.0; }
  return clamp(textureLoad(alphaIn, q, 0).r, 0.0, ALPHA_MAX);
}

fn kCondAt(q: vec2i, n: i32) -> f32 {
  let a = alphaAt(q, n);
  let d = gapMetresAt(q, n);
  return K_WATER * d * (1.0 - a) + K_GLASS * GLASS_THICK;
}

fn hm(a: f32, b: f32) -> f32 {
  let s = a + b;
  return select(0.0, (2.0 * a * b) / s, s > 0.0);
}

fn sampleTempAlpha(x: f32, y: f32, n: i32) -> vec2f {
  let xc = clamp(x, 0.0, f32(n - 1) - 1e-6);
  let yc = clamp(y, 0.0, f32(n - 1) - 1e-6);
  let i0 = i32(floor(xc));
  let j0 = i32(floor(yc));
  let i1 = min(n - 1, i0 + 1);
  let j1 = min(n - 1, j0 + 1);
  let sx = xc - f32(i0);
  let sy = yc - f32(j0);
  let p00 = vec2i(i0, j0);
  let p10 = vec2i(i1, j0);
  let p01 = vec2i(i0, j1);
  let p11 = vec2i(i1, j1);
  let t00 = tempAt(p00, n);
  let t10 = tempAt(p10, n);
  let t01 = tempAt(p01, n);
  let t11 = tempAt(p11, n);
  let a00 = alphaAt(p00, n);
  let a10 = alphaAt(p10, n);
  let a01 = alphaAt(p01, n);
  let a11 = alphaAt(p11, n);
  let t = (1.0 - sy) * ((1.0 - sx) * t00 + sx * t10) + sy * ((1.0 - sx) * t01 + sx * t11);
  let a = (1.0 - sy) * ((1.0 - sx) * a00 + sx * a10) + sy * ((1.0 - sx) * a01 + sx * a11);
  return vec2f(t, a);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(P.n);
  if (i32(id.x) >= n || i32(id.y) >= n) { return; }
  let p = vec2i(id.xy);
  let k = p.x + p.y * n;
  let v0 = textureLoad(velIn, p, 0);
  if (!insideRim(p, n)) {
    textureStore(velOut, p, vec4f(v0.xy, 0.0, v0.w));
    textureStore(alphaOut, p, vec4f(0.0));
    return;
  }

  let dx = P.plateMetres / P.n;
  let d = gapMetresAt(p, n);
  let T_here = tempAt(p, n);
  let a_here = alphaAt(p, n);

  // Advect temperature and vapour fraction along the flow plus two-phase steam buoyancy when upright.
  var uCells = textureLoad(velForced, p, 0).xy * (P.disp * P.n);
  let rho_here = waterDensity(T_here);
  let mu_here = waterViscosity(T_here);
  let driftSpeed = (9.81 * d * d / (12.0 * mu_here)) * max(0.0, rho_here - RHO_V) * a_here;
  uCells += vec2f(P.upX, P.upY) * (driftSpeed * P.dt / max(dx, 1e-6));

  let adv = sampleTempAlpha(f32(p.x) - uCells.x, f32(p.y) - uCells.y, n);
  let T_adv = adv.x;
  let a_adv = clamp(adv.y, 0.0, ALPHA_MAX);

  // Lamp irradiance I(x, y) in W/m²: Gaussian hot-spot profile times Heat dial and dimmer.
  let uv = (vec2f(p) + 0.5) / P.n;
  let dxL = (uv.x - LAMP_CENTER_X) * P.plateMetres;
  let dyL = (uv.y - LAMP_CENTER_Y) * P.plateMetres;
  let I = (P.heat * P.dimmer * LAMP_IRRADIANCE) * exp(-(dxL * dxL + dyL * dyL) / (2.0 * LAMP_HALF_R * LAMP_HALF_R));

  // Two-band Beer-Lambert absorption (src/lib/lampBoil.ts line 283):
  // visible 0.12 taken by the dye (1 - exp(-A_dye (1 - alpha))), A_dye decoded via lampThrough;
  // near-IR 0.88 taken by the water (1 - exp(-KAPPA_IR d (1 - alpha))).
  let dc = textureLoad(dye, p, 0);
  var A_dye = 0.0;
  if (dc.a > 1e-4) {
    let norm = 1.0 / dc.a;
    let unit = exp(-max(dc.rgb, vec3f(0.0)) * norm);
    let through = pow(max(unit, vec3f(1e-4)), vec3f(max(dc.a, 0.0)));
    let T_vis = clamp(dot(through, vec3f(1.0 / 3.0)), 1e-4, 1.0);
    A_dye = -log(T_vis);
  }
  let liq = max(0.0, 1.0 - a_adv);
  let a_vis = 1.0 - exp(-A_dye * liq);
  let a_ir = 1.0 - exp(-KAPPA_IR * d * liq);
  let q_lamp = I * (VIS_FRACTION * a_vis + (1.0 - VIS_FRACTION) * a_ir);

  // Sideways conduction through water + glass (harmonic mean across faces, open rim at T_AMBIENT).
  let kc = kCondAt(p, n);
  let kE = hm(kc, kCondAt(p + vec2i(1, 0), n));
  let kW = hm(kc, kCondAt(p - vec2i(1, 0), n));
  let kS = hm(kc, kCondAt(p + vec2i(0, 1), n));
  let kN = hm(kc, kCondAt(p - vec2i(0, 1), n));
  let q_cond = (
    kE * (tempAt(p + vec2i(1, 0), n) - T_here) +
    kW * (tempAt(p - vec2i(1, 0), n) - T_here) +
    kS * (tempAt(p + vec2i(0, 1), n) - T_here) +
    kN * (tempAt(p - vec2i(0, 1), n) - T_here)
  ) / (dx * dx);

  // Air convection per cell: H_FORCED, or H_NATURAL where a held hand blocks the cooling air.
  var blocked = false;
  for (var h = 0u; h < min(P.holdCount, 4u); h++) {
    let hold = P.holds[h];
    let hx = (uv.x - hold.x) * P.plateMetres;
    let hy = (uv.y - hold.y) * P.plateMetres;
    let hr = select(HAND_RADIUS, hold.z, hold.z > 0.0);
    if (hx * hx + hy * hy <= hr * hr) {
      blocked = true;
    }
  }
  let h_conv = select(H_FORCED, H_NATURAL, blocked);
  let q_conv = -h_conv * (T_adv - T_AMBIENT);

  // Thermal radiation from both glass faces: 2 eps sigma (T^4 - Ta^4).
  let Tk = T_adv + 273.15;
  let Tak = T_AMBIENT + 273.15;
  let Tk2 = Tk * Tk;
  let Tak2 = Tak * Tak;
  let q_rad = -2.0 * EPS_GLASS * SIGMA_SB * (Tk2 * Tk2 - Tak2 * Tak2);

  // Combined heat capacity of liquid + glass.
  let rho0 = waterDensity(T_adv);
  let C = max(1e-3, (1.0 - a_adv) * RHO_C * d + RHO_C_GLASS * GLASS_THICK);
  var T1 = max(0.0, T_adv + (P.dt / C) * (q_lamp + q_cond + q_conv + q_rad));

  // Two-phase evaporation, condensation, and heterogeneous cavity nucleation.
  var a1 = a_adv;
  let LvVol = RHO_V * LATENT * d;
  let alphaSeed = min(0.5, (PI_BOIL * d * d) / (6.0 * dx * dx));
  let alphaMin = alphaSeed * 0.01;
  if (a1 > 0.0) {
    let perimeterFactor = 2.0 * sqrt(PI_BOIL * max(a1, alphaMin)) * (d / max(dx, 1e-6));
    let G = H_INTER * perimeterFactor;
    let q_inter = G * (T1 - T_SAT);
    var dAlpha = (q_inter * P.dt) / LvVol;
    if (dAlpha > 0.0) {
      let maxEvap = ((T1 - T_SAT) * C) / LvVol;
      dAlpha = min(dAlpha, max(0.0, maxEvap));
      dAlpha = min(dAlpha, ALPHA_MAX - a1);
    } else if (dAlpha < 0.0) {
      let maxCond = ((T_SAT - T1) * C) / LvVol;
      dAlpha = -min(-dAlpha, max(0.0, maxCond));
      dAlpha = max(dAlpha, -a1);
    }
    a1 += dAlpha;
    T1 -= (dAlpha * LvVol) / C;
    if (a1 < alphaMin) {
      T1 += (a1 * LvVol) / C;
      a1 = 0.0;
    }
  }

  let T_nuc = T_SAT + dTnuc[k];
  if (a1 == 0.0 && (T1 >= T_nuc || T1 >= T_HOM)) {
    let availAlpha = max(0.0, ((T1 - T_SAT) * C) / LvVol);
    let seed = min(alphaSeed, min(availAlpha, ALPHA_MAX));
    if (seed >= alphaMin) {
      a1 = seed;
      T1 -= (seed * LvVol) / C;
    }
  }

  a1 = clamp(a1, 0.0, ALPHA_MAX);
  let rho1 = waterDensity(T1);

  // Warming water's expansion and the vapour's volume as sources in the thin gap's projection (hsPour).
  if (P.thin != 0u) {
    let expansionShare = -(1.0 - a1) * ((rho1 - rho0) / rho0);
    let vapourShare = -(RHO_V / rho1) * (a1 - a_adv);
    poured[k] = poured[k] + clamp(expansionShare + vapourShare, -0.5, 0.5);
  }

  let newTemp = clamp(T1 - T_AMBIENT, -T_AMBIENT, 250.0);
  textureStore(velOut, p, vec4f(v0.xy, newTemp, v0.w));
  textureStore(alphaOut, p, vec4f(a1, 0.0, 0.0, 0.0));
}
`;

