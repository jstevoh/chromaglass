/**
 * The dye between carries: its dispersion along the flow, the pigment's grain
 * coordinates, the sharpening, and what a step takes away (decay, the drain,
 * the scale).
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';
import { OPEN_RIM } from '../../../lib/turntable';

export const DYE_KERNELS: Record<string, string> = {
  /*
    18h. Dye spreads along the flow (pre-asymptotic shear dispersion) plus molecular diffusion:
    In a Hele-Shaw cell on show timescales (t ≪ h²/Dm ≈ 25 hours), flow has not reached
    the asymptotic Taylor–Aris regime. Parabolic Poiseuille shear across the gap creates
    unsteady longitudinal spreading with variance σ² ≈ 0.2 |u|² Δt².
    Shortcut: depth-averaged 2D solver models this as an anisotropic flux tensor along u⊗u
    with cap 0.25 cells²/step (von Neumann stability limit).
    Cross-term fluxes are limited to maintain strict positivity, exactly conserving dye mass.
  */
  dyeDisperse: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;

fn inDish(p: vec2i) -> bool {
  return S.thinGap < 0.5 || !pastOpenRim(p);
}

fn getDye(p: vec2i, n: i32) -> vec4f {
  return textureLoad(dye, clamp(p, vec2i(0), vec2i(n - 1)), 0);
}

fn getDyeFrom(p: vec2i, c0: vec4f, n: i32) -> vec4f {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  if (!inDish(q)) { return c0; }
  return textureLoad(dye, q, 0);
}

fn getDisp(p: vec2i, n: i32) -> vec3f {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  let v = textureLoad(vel, q, 0).xy * A.a.w;
  let gapVal = clamp(textureLoad(sq, q, 0).r, 0.004, 0.06);
  let gapRel = gapVal / A.a.z;
  let dm = A.a.x;
  let kappaT = A.a.y;
  let v2 = dot(v, v);
  let shear = kappaT * gapRel * gapRel * v2;
  let shearLim = min(shear, max(0.0, A.b.x - dm));
  let fac = select(0.0, shearLim / max(v2, 1e-9), v2 > 1e-9);
  return vec3f(
    dm + fac * v.x * v.x,
    dm + fac * v.y * v.y,
    fac * v.x * v.y
  );
}

// Zero-flux Neumann condition across the circular dish rim (OPEN_RIM = 0.5) on a thin gap,
// so molecular diffusion and shear dispersion do not bleed dye across the rim into the trough.
fn fluxX(p: vec2i, DL: vec3f, DR: vec3f, n: i32) -> vec4f {
  if (p.x < 0 || p.x >= n - 1 || p.y < 0 || p.y >= n) {
    return vec4f(0.0);
  }
  let pR = p + vec2i(1, 0);
  if (!inDish(p) || !inDish(pR)) {
    return vec4f(0.0);
  }
  let Dxx = 0.5 * (DL.x + DR.x);
  let Dxy = 0.5 * (DL.z + DR.z);
  let cL = getDye(p, n);
  let cR = getDye(pR, n);
  let dc_dx = cR - cL;
  let dc_dy = 0.25 * (
    (getDyeFrom(p + vec2i(0, 1), cL, n) - getDyeFrom(p - vec2i(0, 1), cL, n)) +
    (getDyeFrom(pR + vec2i(0, 1), cR, n) - getDyeFrom(pR - vec2i(0, 1), cR, n))
  );
  let prim = Dxx * dc_dx;
  let cross = Dxy * dc_dy;
  // Positivity-preserving cross-term limiter: bounds cross flux to 0.5 of primary flux magnitude,
  // preventing cross-derivatives from pulling cell values negative or creating dye.
  let cross_lim = clamp(cross, -0.5 * abs(prim), 0.5 * abs(prim));
  return -(prim + cross_lim);
}

fn fluxY(p: vec2i, DB: vec3f, DT: vec3f, n: i32) -> vec4f {
  if (p.y < 0 || p.y >= n - 1 || p.x < 0 || p.x >= n) {
    return vec4f(0.0);
  }
  let pT = p + vec2i(0, 1);
  if (!inDish(p) || !inDish(pT)) {
    return vec4f(0.0);
  }
  let Dyx = 0.5 * (DB.z + DT.z);
  let Dyy = 0.5 * (DB.y + DT.y);
  let cB = getDye(p, n);
  let cT = getDye(pT, n);
  let dc_dy = cT - cB;
  let dc_dx = 0.25 * (
    (getDyeFrom(p + vec2i(1, 0), cB, n) - getDyeFrom(p - vec2i(1, 0), cB, n)) +
    (getDyeFrom(pT + vec2i(1, 0), cT, n) - getDyeFrom(pT - vec2i(1, 0), cT, n))
  );
  let prim = Dyy * dc_dy;
  let cross = Dyx * dc_dx;
  let cross_lim = clamp(cross, -0.5 * abs(prim), 0.5 * abs(prim));
  return -(prim + cross_lim);
}

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let Dc = getDisp(p, n);
  let De = getDisp(p + vec2i(1, 0), n);
  let Dw = getDisp(p - vec2i(1, 0), n);
  let Dn = getDisp(p + vec2i(0, 1), n);
  let Ds = getDisp(p - vec2i(0, 1), n);

  let fE = fluxX(p, Dc, De, n);
  let fW = fluxX(p - vec2i(1, 0), Dw, Dc, n);
  let fN = fluxY(p, Dc, Dn, n);
  let fS = fluxY(p - vec2i(0, 1), Ds, Dc, n);
  let netFlux = -(fE - fW + fN - fS);
  let here = getDye(p, n);
  let out = here + netFlux;
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,

  // Pigment coordinates: A.a.xy says which phase to keep and which to reseed.
  seedGrain: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let g = textureLoad(src, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), vec4f(mix(uv, g.rg, A.a.x), mix(uv, vec2f(g.b, g.a), A.a.y)));
}`,

  sharpenDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
const SHARP_FLOOR = 0.08;
fn at(p: vec2i) -> vec4f { return textureLoad(dye, clampP(p, S.n), 0); }
fn gate(a: vec4f, b: vec4f) -> f32 { return min(a.a, b.a) / (max(a.a, b.a) + 1e-4); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = at(p);
  let l = at(p - vec2i(1, 0));
  let r = at(p + vec2i(1, 0));
  let d = at(p - vec2i(0, 1));
  let u = at(p + vec2i(0, 1));
  let dl = at(p + vec2i(-1, -1));
  let dr = at(p + vec2i(1, -1));
  let ul = at(p + vec2i(-1, 1));
  let ur = at(p + vec2i(1, 1));
  let f = 0.20 * (gate(c, l) * (c - l) + gate(c, r) * (c - r) + gate(c, d) * (c - d) + gate(c, u) * (c - u))
        + 0.05 * (gate(c, dl) * (c - dl) + gate(c, dr) * (c - dr) + gate(c, ul) * (c - ul) + gate(c, ur) * (c - ur));
  let lo = min(min(min(l, r), min(d, u)), min(min(dl, dr), min(ul, ur)));
  let hi = max(max(max(l, r), max(d, u)), max(max(dl, dr), max(ul, ur)));
  let scale = max(hi, c) - min(lo, c);
  let fl = sign(f) * max(abs(f) - SHARP_FLOOR * scale, vec4f(0.0));
  let s = c + S.sharp * fl;
  textureStore(dst, p, max(clamp(s, min(lo, c), max(hi, c)), vec4f(0.0)));
}`,

  decayDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  var d = textureLoad(dye, p, 0);
  // PLAN 18g: Colour leaves by flushing over the open rim (OPEN_RIM = 0.5), not by fading.
  // Liquid and dye carried past the circular dish rim spill into the overflow trough and leave the plate.
  if (S.thinGap > 0.5 && pastOpenRim(p)) {
    d = vec4f(0.0);
  } else {
    // Named regulator shortcut (PLAN 18g / 28d-A, until 18c-2/18g-4 carry a separate
    // solvent-thickness field): uniform d *= S.evap fades thick bodies and thin
    // inter-body mist at the same fractional rate, leaving a grey-pastel veil across
    // the black ground. A surface-to-volume term surf clears thin mist (d.a small)
    // first while leaving thick dye bodies intact. It was ungated and moved every
    // look; only ten were measured (review of #401, ask 4), so it is gated.
    // Only where S.surfaceClear is set: a sparse dark look laid with a composition.
    // Every other look keeps the uniform decay it always had (PLAN 28d-A).
    let loss = max(0.0, 1.0 - S.evap);
    let surf = S.surfaceClear * loss * 0.06 / ((d.a + 0.14) * (d.a + 0.14));
    d *= max(0.0, S.evap - surf);
  }
  // Safety cap (PLAN 18g: "A safety cap stays, named as one"):
  if (!finite4(d)) { d = vec4f(0.0); }
  if (d.a > 6.0) { d *= 6.0 / d.a; }
  textureStore(dst, p, max(d, vec4f(0.0)));
}`,

  decayVel: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;

// Beer–Lambert transmission for unit absorbance and amount (matching plate.ts lampThrough)
fn lampThrough(unit: vec3f, amount: f32) -> vec3f {
  return pow(max(unit, vec3f(1e-4)), vec3f(max(amount, 0.0)));
}

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  var v = textureLoad(vel, vec2i(id.xy), 0);
  // Before the speed limit: an infinite speed through it is inf * 0, a NaN.
  if (!finite4(vec4f(v.xyz, 0.0))) { v = vec4f(0.0); }
  v = vec4f(v.xy * S.damping, v.z, v.w);
  let sp = length(v.xy);
  if (sp > S.maxSpeed) { v = vec4f(v.xy * (S.maxSpeed / sp), v.z, v.w); }
  if (A.a.x <= 0.0) {
    // Newton cooling with physical time constant tau ≈ 12.4s (PLAN §18f):
    let cool = pow(clamp(S.heatDecay, 0.001, 1.0), S.dt * 4.0);
    var temp = v.z * cool;
    // Heat source ∝ lamp intensity × absorbed fraction (Beer–Lambert decode, 18b):
    let d = textureLoad(dye, vec2i(id.xy), 0);
    var absorbed = 0.0;
    if (d.a > 1e-4) {
      let norm = 1.0 / d.a;
      let unit = exp(-max(d.rgb, vec3f(0.0)) * norm);
      let through = lampThrough(unit, d.a);
      absorbed = clamp(1.0 - dot(through, vec3f(1.0 / 3.0)), 0.0, 1.0);
    }
    // The same at every point of the stage (PLAN 38a): the condenser lights the
    // liquid evenly, and the hot-spot is light the lens's aperture turns away
    // after it has gone through the liquid (wgsl/lampField.ts). The old
    // 1 / (1 + 2.5 r²) here was a shortcut, centred on the plate, not the lamp.
    temp += S.lampHeat * absorbed * S.dt;
    v.z = temp;
  }
  textureStore(dst, vec2i(id.xy), vec4f(v.xyz, 0.0));
}`,

  /*
    The lamp's heat carried with the liquid on a thin gap (PLAN 38f). The
    temperature lives in the velocity's z, and a thin gap never self-advects
    the velocity (its inertia is the drag time, wgsl/thinGap.ts), so until
    this the heat stayed in the cell the lamp laid it in while the flow it
    drove moved the liquid out from under it: a warmed body of Lava Lamp's
    wax rose out of its heat into cold cells, was heavy again at once, and
    the lamp's band held the wax as a sheet at its top edge (27f-9e), eroding
    into the haze below it (27f-9f).

    Heat is an amount carried as the colour is, through the thin solve's own
    faces in the colour's substeps (carrySubsteps, bodyAdvect): the column's
    heat h·T, beside the column's liquid h itself through the very same
    fluxes, and the temperature is the one over the other afterwards. That
    ratio is what mixing two parcels of liquid gives (the mean weighted by
    how much of each), and it holds a uniform temperature exactly whatever
    the gap does in the step (a press, a pour, air arriving): the limited
    upwind flux is linear in what it carries, slope and all, so a field that
    is T times the liquid everywhere moves as T times the liquid's flux.
    Dividing by the gap itself instead would count each press twice, since
    the gap moved before the solve and the faces carry the liquid it
    displaced. The heat is split into its warm and cold parts (x, y), as
    the carry keeps every amount at zero or more and a hand or a boil may
    take a cell below zero. A.a.x is the rest gap.
  */
  heatPack: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let h = max(textureLoad(sq, p, 0).r, 0.004) / A.a.x;
  var t = textureLoad(vel, p, 0).z;
  if (!finite1(t)) { t = 0.0; }
  textureStore(dst, p, vec4f(h * max(t, 0.0), h * max(-t, 0.0), h, 0.0));
}`,

  /*
    And back into the velocity's z: the heat over the liquid that carried
    it. A cell the carry all but emptied (an air core, the grid's wall)
    keeps the temperature it had.

    Rounded to the nearest half-float here, not by the store. The ratio is
    the temperature to a float32's precision, a hair either side of it even
    where nothing moved, and the store's own conversion to sixteen bits is
    the hardware's: on the Mac's Metal it lost 3.2% of a sinking blob's heat
    in 90 steps (\`npm run heat\` line 9, 96.8% kept, the same with the carry
    in half-float or float32) where SwiftShader lost 0.1%, a bias of under one
    step of the half-float a step, always down, which is what a conversion
    toward zero does. So the nearest half-float is picked in float32 and the
    store is handed a value it holds exactly: a cell the carry did not change
    keeps its z bit for bit, and one it did is off by half a step at most,
    either way.
  */
  heatUnpack: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var heat: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
fn nearestHalf(t: f32) -> f32 {
  var r = quantizeToF16(t);
  let ulp = exp2(floor(log2(max(abs(r), 6.1e-5))) - 10.0);
  let e = t - r;
  if (abs(e) > 0.5 * ulp) { r += sign(e) * ulp; }
  return r;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let c = textureLoad(heat, p, 0);
  let t = (c.x - c.y) / max(c.z, 1e-6);
  textureStore(dst, p, vec4f(v.xy, select(v.z, nearestHalf(t), c.z > 1e-3 && finite1(t)), v.w));
}`,

  // The drain's inward spiral. A.a.x is the pull, A.a.y how far through it is.
  drainVel: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = (vec2f(0.5) - uvOf(id)) * S.l;
  let dist = max(length(d), 1.0);
  let dir = d / dist;
  let inward = A.a.x * (1.0 + dist / 50.0);
  let swirl = A.a.x * 0.7 * (1.0 - A.a.y * 0.5);
  textureStore(dst, vec2i(id.xy), vec4f(dir.x * inward - dir.y * swirl, dir.y * inward + dir.x * swirl, 0.0, 0.0));
}`,

  scaleDye: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  textureStore(dst, vec2i(id.xy), textureLoad(src, vec2i(id.xy), 0) * A.a.x);
}`,
};
