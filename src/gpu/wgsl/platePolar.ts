/**
 * Polarised light on the plate (PLAN 31p-1): a polariser under the stage, an
 * analyser at the projector's head turned to `U.analyserAngle`, and the
 * liquid between them retarding the light where its flow stretches it. The
 * law, its table and its scale are in lib/polar.ts; this is the per-pixel
 * half, called once from the display main (plate.ts) on the finished stage,
 * after both plates and the dish and before the film projector, which is a
 * second lamp and not between the sheets.
 *
 * Physics writes, rendering reads: the retardation is read off the solver's
 * own velocity (the packed flow the plate already binds as `vel0`), not drawn.
 * Nothing moves here that the solver did not move: a still plate between
 * crossed sheets is black, and it lights where and while the liquid flows.
 *
 * Why it sits with the thin film's block (`VIEW_OPTICS`). plate.ts is over
 * the size budget and may not grow (`npm run sizes`), so it names one
 * include and one call: the thin film's block and this one come in together
 * where the thin film's alone did.
 */
import { polarTableWgsl } from '../../lib/polar';
import { dishWgsl } from '../../lib/polarDish';
import { THIN_FILM_WGSL } from './plateThinFilm';

export const POLAR_WGSL = /* wgsl */ `
${polarTableWgsl()}
${dishWgsl()}

// The light through the sheets, linear: A white + B S + C N, with the
// colours of S = sin^2(pi G / lambda) and N = sin(2 pi G / lambda) from the
// tables. Past their end the orders crowd into their means, S's a grey of a
// half and N's nothing.
fn polarLight(g: f32, A: f32, B: f32, C: f32) -> vec3f {
  let t = clamp(g / POLAR_STEP_NM, 0.0, f32(POLAR_STEPS - 1u));
  let i = min(u32(t), POLAR_STEPS - 2u);
  let f = t - f32(i);
  let fade = smoothstep(POLAR_MAX_NM, POLAR_MAX_NM + POLAR_FADE_NM, g);
  let s = mix(mix(POLAR_S[i], POLAR_S[i + 1u], f), vec3f(0.5), fade);
  let n = mix(POLAR_N[i], POLAR_N[i + 1u], f) * (1.0 - fade);
  return vec3f(A) + B * s + C * n;
}


/*
  The moulded dish's own frozen stress (PLAN 31p-3; lib/polarDish.ts has the
  physics at length, and the same functions in numbers). dishRetardation is
  the base's retardation at Dish Stress 1, falling as 1/r from the moulding
  gate at the plate's middle, and the wall's far greater one round the rim,
  with its slow axis (the hoop) in the plate's uv; px is a pixel's width as a
  share of the dish's radius, over which the wall's edges are smoothed.
*/
fn dishRetardation(fuv: vec2f, px: f32) -> vec2f {
  let p = fuv - vec2f(0.5);
  let r = length(p) / DISH_RIM_UV;
  let base = DISH_STRESS_NM * 0.5 / max(r, DISH_GATE_R);
  let wall = smoothstep(1.0 - DISH_WALL_W - px, 1.0 - DISH_WALL_W, r);
  let inside = 1.0 - smoothstep(1.0, 1.0 + px, r);
  return vec2f(mix(base, DISH_WALL_NM, wall) * inside, atan2(p.y, p.x) + 1.5707963);
}

// The colours of cos and sin of 2 pi G / lambda from the tables (cos = white
// - 2 S, sin = N), interpolated and faded as polarLight is; G signed, and sin
// odd. lib/polarDish.ts's polarCS.
fn polarCS(g: f32) -> mat2x3f {
  let a = abs(g);
  let t = clamp(a / POLAR_STEP_NM, 0.0, f32(POLAR_STEPS - 1u));
  let i = min(u32(t), POLAR_STEPS - 2u);
  let f = t - f32(i);
  let fade = smoothstep(POLAR_MAX_NM, POLAR_MAX_NM + POLAR_FADE_NM, a);
  let s = mix(mix(POLAR_S[i], POLAR_S[i + 1u], f), vec3f(0.5), fade);
  let n = mix(POLAR_N[i], POLAR_N[i + 1u], f) * (1.0 - fade);
  return mat2x3f(vec3f(1.0) - 2.0 * s, sign(g) * n);
}

// a.(X2_j X1_i s) for X each of P, Q, K (the rotation's three parts): m[i][j].
fn polarSeriesM(s: vec3f, a: vec3f, n1: vec3f, n2: vec3f) -> mat3x3f {
  let p = n1 * dot(n1, s);
  let u0 = p;
  let u1 = s - p;
  let u2 = cross(n1, s);
  let an = dot(a, n2);
  let w = cross(a, n2);
  let p0 = an * dot(n2, u0);
  let p1 = an * dot(n2, u1);
  let p2 = an * dot(n2, u2);
  return mat3x3f(vec3f(p0, dot(a, u0) - p0, dot(u0, w)),
                 vec3f(p1, dot(a, u1) - p1, dot(u1, w)),
                 vec3f(p2, dot(a, u2) - p2, dot(u2, w)));
}

/*
  The light through the sheets with the dish (g1, axis t1 on the wall) and
  then the liquid (g2, t2) between them, linear: the nine terms of a.R2 R1 s,
  each a weight from the axes times the colour of cos or sin at g1, g2,
  g1 + g2 or g1 - g2. Plane sheets and quarter-wave plates blended by q, as
  the one-retarder law blends them. At g1 = 0 it is polarLight's light.
*/
fn polarSeries(g1: f32, t1: f32, g2: f32, t2: f32, al: f32, q: f32) -> vec3f {
  let n1 = vec3f(cos(2.0 * t1), sin(2.0 * t1), 0.0);
  let n2 = vec3f(cos(2.0 * t2), sin(2.0 * t2), 0.0);
  let mp = polarSeriesM(vec3f(1.0, 0.0, 0.0), vec3f(cos(2.0 * al), sin(2.0 * al), 0.0), n1, n2);
  let mc = polarSeriesM(vec3f(0.0, 0.0, 1.0), vec3f(0.0, -sin(2.0 * al), cos(2.0 * al)), n1, n2);
  let m = mp * (1.0 - q) + mc * q;
  let a = polarCS(g1);
  let b = polarCS(g2);
  let sp = polarCS(g1 + g2);
  let sm = polarCS(g1 - g2);
  return 0.5 * (vec3f(1.0 + m[0][0]) + m[0][1] * b[0] + m[0][2] * b[1] + m[1][0] * a[0] + m[2][0] * a[1]
    + 0.5 * ((m[1][1] - m[2][2]) * sp[0] + (m[1][1] + m[2][2]) * sm[0] + (m[1][2] + m[2][1]) * sp[1] + (m[2][1] - m[1][2]) * sm[1]));
}

/*
  The stage seen through the analyser. c is the picture so far, fuv the
  lead plate's uv at this pixel.

  The strain rate. Central differences of the packed flow a texel either
  side (the sampler's bilinear filter between them), in the solver's units
  per plate width: a = (du/dx - dv/dy) / 2 and b = (du/dy + dv/dx) / 2 are
  the two components of the strain-rate deviator, e = |(a, b)| the principal
  strain rate and atan2(b, a) / 2 the stretching axis. The flow is
  incompressible, so the deviator is the whole of the stretch.

  The axis on the wall. The polariser's axis is the projector's horizontal,
  and the plate can be turned under it (a layer's rotation, the dish), so
  the stretching direction found in the plate's uv is carried to the screen
  through the screen's own axes in that uv (dpdx and dpdy of fuv, which
  hold the turn, the zoom and any mirror). The call is in the display
  main's uniform control flow, so the derivatives are defined.

  Air retards nothing: a bubble's coverage (air0's red, 0 on a plate without
  bubbles) takes its share of the liquid's depth away.

  The weights (lib/polar.ts): plane sheets B = -sin 2th sin 2(th - al),
  quarter-wave plates B = -cos 2al and C = sin 2al cos 2th / 2, laid in by
  Quarter Wave's share; A = cos^2 al either way.

  The sum is linear light, held at 0, then
  encoded as the soap film's table is (filmTable.ts stores sRGB): the plate
  multiplies display values as light, so a white lamp through the sheets
  reads on the wall as the Michel-Levy chart is printed. Polarisers below 1
  lays the sheets in by that share.

  With Dish Stress up (PLAN 31p-3) the dish's base and wall are a second
  retarder beneath the liquid, and the light is the two in series
  (polarSeries); at 0 the branch is not taken and the light is the liquid's alone.
*/
fn polar(c: vec3f, fuv: vec2f) -> vec3f {
  if (U.polariser <= 0.0) { return c; }
  let sx = dpdx(fuv);
  let sy = dpdy(fuv);
  let h = 1.0 / vec2f(textureDimensions(vel0));
  let du = (tex2(vel0, fuv + vec2f(h.x, 0.0)).rg - tex2(vel0, fuv - vec2f(h.x, 0.0)).rg) / (2.0 * h.x);
  let dv = (tex2(vel0, fuv + vec2f(0.0, h.y)).rg - tex2(vel0, fuv - vec2f(0.0, h.y)).rg) / (2.0 * h.y);
  let a = 0.5 * (du.x - dv.y);
  let b = 0.5 * (dv.x + du.y);
  let e = length(vec2f(a, b));
  let tf = 0.5 * atan2(b, a);
  let d = vec2f(cos(tf), sin(tf));
  // Screen y runs down; the angles here run counter-clockwise on the wall.
  let ex = normalize(sx + vec2f(1e-12, 0.0));
  let ey = normalize(sy + vec2f(0.0, 1e-12));
  let th = atan2(-dot(d, ey), dot(d, ex));
  var liquid = 1.0;
  if (textureDimensions(air0).x > 1u) { liquid = 1.0 - clamp(tex2(air0, fuv).r, 0.0, 1.0); }
  let g = U.birefringence * e * liquid;
  let al = U.analyserAngle;
  let q = clamp(U.quarterWave, 0.0, 1.0);
  if (U.dishStress > 0.0) {
    let px = max(length(sx), length(sy)) / DISH_RIM_UV;
    let gd = dishRetardation(fuv, px);
    let dd = vec2f(cos(gd.y), sin(gd.y));
    let thd = atan2(-dot(dd, ey), dot(dd, ex));
    let lin2 = max(polarSeries(gd.x * U.dishStress, thd, g, th, al, q), vec3f(0.0));
    let enc2 = select(1.055 * pow(lin2, vec3f(1.0 / 2.4)) - 0.055, 12.92 * lin2, lin2 <= vec3f(0.0031308));
    return c * mix(vec3f(1.0), enc2, clamp(U.polariser, 0.0, 1.0));
  }
  let A = cos(al) * cos(al);
  let B = mix(-sin(2.0 * th) * sin(2.0 * (th - al)), -cos(2.0 * al), q);
  let C = q * 0.5 * sin(2.0 * al) * cos(2.0 * th);
  let lin = max(polarLight(g, A, B, C), vec3f(0.0));
  let enc = select(1.055 * pow(lin, vec3f(1.0 / 2.4)) - 0.055, 12.92 * lin, lin <= vec3f(0.0031308));
  return c * mix(vec3f(1.0), enc, clamp(U.polariser, 0.0, 1.0));
}
`;

/** The thin film's block and the polariser's, as the display's VIEW includes them. */
export const VIEW_OPTICS = THIN_FILM_WGSL + POLAR_WGSL;
