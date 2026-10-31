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
import { DISH_GAP_RANGE, DISH_METRES, OPEN_RIM } from '../../../lib/turntable';
import { GLASS_METRES, HEAT_EMISSIVITY, HEAT_ROOM, RHOC_GLASS, RHOC_WATER, STEFAN_BOLTZMANN } from '../../fluid/constants';

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
  return S.thinGap < 0.5 || length((vec2f(p) + 0.5) / S.n - vec2f(0.5)) < ${OPEN_RIM.toFixed(2)};
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
  if (S.thinGap > 0.5 && length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) {
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

  /*
    The velocity's damping and speed limit (the old plate's; a thin gap has
    its drag in the projection), and the heat's gains and losses in watts
    and real seconds (PLAN 38f, the constants' note in fluid/constants.ts):

      C dΔT/dt = I·a·spot − 2·h_air·ΔT − h_up(x)·ΔT − 2εσ((T_room + ΔT)⁴ − T_room⁴)

    C the sandwich's heat a square metre per kelvin where the gap is h (the
    squeeze), I the lamp's flux (S.lampHeat), a the share of it the dye takes
    (Beer–Lambert, 18b), h_air Heat Decay's air on both faces (S.heatAir is
    the two together), h_up Updraft's forced air on the top face, strongest
    where it comes in (S.airCool a plate's width in, × √(W/x)), and each
    face's radiation. The air's loss is taken exactly over the step (it is
    linear); the radiation, a few W/m²K, explicitly. The result is rounded
    to a half at random (halfRound), or a slow change would be lost.

    And on a thin gap the heat is first carried by the liquid. The thin step
    skips the velocity's self-advection (wgsl/thinGap.ts's header, "What the
    step no longer does"), so nothing moved the temperature, which rides in
    the velocity's z: a warm patch stayed where it was laid whatever the
    liquid did, and its lift could only ever stir the current. Here it goes
    with the flow the dye rides (\`flow\`, velForced), backtraced over the
    step's displacement and read between the four cells it lands among. The
    heat a cell holds is h·T, and the solve makes the flow keep
    ∇·(hu) = 0 (or the press's own ∂h/∂t), so ∂(hT)/∂t + ∇·(huT) = 0 is
    DT/Dt = 0: the temperature itself is what is carried, at the liquid's
    speed. The glasses hold some of the heat and do not flow; over the
    seconds a plume takes, the water across a few millimetres has not traded
    much of it with them (h²/κ is a minute across 6 mm), so the liquid
    carries its own, the shortcut PLAN 38f-3 names. Done here, in the pass
    that already reads and writes the velocity, and not in a kernel of its
    own: a kernel built behind the show joins the step whenever its build
    lands, which made two renders of one seed differ (the render check,
    239 of 240 frames), and one waited for at the opening costs the show's
    first frame its build.
  */
  decayVel: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var flow: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<rgba16float, write>;
fn tAt(c: vec2i) -> f32 { return textureLoad(vel, clampP(c, S.n), 0).z; }

// Beer–Lambert transmission for unit absorbance and amount (matching plate.ts lampThrough)
fn lampThrough(unit: vec3f, amount: f32) -> vec3f {
  return pow(max(unit, vec3f(1e-4)), vec3f(max(amount, 0.0)));
}

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  var v = textureLoad(vel, q, 0);
  // Before the speed limit: an infinite speed through it is inf * 0, a NaN.
  if (!finite4(vec4f(v.xyz, 0.0))) { v = vec4f(0.0); }
  v = vec4f(v.xy * S.damping, v.z, v.w);
  let sp = length(v.xy);
  if (sp > S.maxSpeed) { v = vec4f(v.xy * (S.maxSpeed / sp), v.z, v.w); }
  let h = clamp(textureLoad(sq, q, 0).r, ${DISH_GAP_RANGE[0]}, ${DISH_GAP_RANGE[1]}) * ${DISH_METRES};
  let cap = ${RHOC_WATER.toExponential(4)} * h + ${(2 * RHOC_GLASS * GLASS_METRES).toFixed(1)};
  let dt = S.heatSeconds;
  var air = S.heatAir;
  if (S.airCool > 0.0) {
    // From the rim the air comes over (toward −v), as hsBody's stress.
    let d = uvOf(id) - vec2f(0.5);
    let lead = sqrt(max(0.25 - d.x * d.x, 0.0));
    air += S.airCool * inverseSqrt(max(lead - d.y, 1.0 / S.n));
  }
  var t0 = v.z;
  if (S.thinGap > 0.5) {
    let at = clamp(uvOf(id) - textureLoad(flow, q, 0).xy * S.disp, vec2f(0.5 / S.n), vec2f(1.0 - 0.5 / S.n)) * S.n - 0.5;
    let c0 = vec2i(floor(at));
    let f = at - vec2f(c0);
    let t = mix(mix(tAt(c0), tAt(c0 + vec2i(1, 0)), f.x), mix(tAt(c0 + vec2i(0, 1)), tAt(c0 + vec2i(1, 1)), f.x), f.y);
    if (finite4(vec4f(t))) { t0 = t; }
  }
  var temp = t0 * exp(-air * dt / cap);
  let tk = ${(HEAT_ROOM + 273.15).toFixed(2)};
  let tw = max(tk + temp, 1.0);
  temp -= 2.0 * ${(HEAT_EMISSIVITY * STEFAN_BOLTZMANN).toExponential(4)} * (tw * tw * tw * tw - tk * tk * tk * tk) * dt / cap;
  // Heat source ∝ lamp intensity × absorbed fraction (Beer–Lambert decode, 18b):
  let d = textureLoad(dye, q, 0);
  var absorbed = 0.0;
  if (d.a > 1e-4) {
    let norm = 1.0 / d.a;
    let unit = exp(-max(d.rgb, vec3f(0.0)) * norm);
    let through = lampThrough(unit, d.a);
    absorbed = clamp(1.0 - dot(through, vec3f(1.0 / 3.0)), 0.0, 1.0);
  }
  // Central hotspot of the lamp (shortcut: 1 / (1 + 2.5 r²)):
  let toCenter = uvOf(id) - vec2f(0.5);
  let r2 = dot(toCenter, toCenter);
  let hotspot = 1.0 / (1.0 + r2 * 2.5);
  temp += S.lampHeat * hotspot * absorbed * dt / cap;
  v.z = halfRound(temp, q, 1u);
  textureStore(dst, q, vec4f(v.xyz, 0.0));
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
