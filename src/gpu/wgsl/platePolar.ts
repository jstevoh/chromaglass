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
import { THIN_FILM_WGSL } from './plateThinFilm';

export const POLAR_WGSL = /* wgsl */ `
${polarTableWgsl()}

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
