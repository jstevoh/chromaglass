/**
 * Thin Film, the interference colour where the dye runs thinnest, and the
 * smooth read of the dye's amount its rings are drawn from (PLAN 1i). Built
 * into the display shader's VIEW block (plate.ts), after the sampling, the
 * noise and the film's colour table it calls (`textureBicubic`,
 * `decodeDensity`, `fbm3`, `filmColourAt`), and called once from the display
 * main where the front plate's film is known.
 *
 * Why it is its own module: plate.ts is over the size budget (`npm run
 * sizes`) and may not grow, so the block moved here whole, and the new read
 * came with it.
 */
import { SOAP_LUT_STEP_NM } from '../../lib/soapFilm';
import { SOAP_FRAME_LO, SOAP_FRAME_SPAN } from '../soapFrame';

export const THIN_FILM_WGSL = /* wgsl */ `
/*
  The dye's raw amount through a cubic B-spline: four bilinear taps, each
  placed between two texels so the hardware's filter weighs the pair as the
  spline does (Sigg and Hadwiger, GPU Gems 2, ch. 20).

  What was reported. The owner, on 38m's pictures (2026-10-30): "the edges
  are super pixelated". Thin Film's rings are the dye amount times sixteen,
  so six or more of them cross an edge a few cells wide, and a ring is a
  contour of that amount. The plate reads the amount two ways. With the
  gooey blur on (every look) it is blurAlpha: plain bilinear taps a fraction
  of a cell apart, whose slope jumps at every texel, and then the gooey
  edge's contrast steepens it two or three times. With no blur it is
  textureBicubic, a five-tap Catmull-Rom: its slope nearly continuous, its
  curvature not (Catmull-Rom is C1, and the five-tap form leaves out the
  four corner texels). At one dye contour none of that shows. At sixteen
  periods per unit it is a polygon: every ring turns a corner where it
  crosses a texel, and the corners line up cell by cell. Measured with the
  film probed out of the display pass (npm run filmrings): its second
  difference was 3 to 13 times its median on the texel centres.

  Why a B-spline and not a better interpolant. The cubic B-spline is C2: its
  curvature is continuous across the knots, so a contour of it has no
  corners at any multiple. It does not pass through the texels (it is a
  light blur, about half a cell), and here that is what is wanted: it also
  rounds off the eight-bit levels (the plate's dye is eight bits a channel)
  that a spline through the samples would reproduce exactly. It costs four
  taps, a Catmull-Rom sixteen in full; and it is only asked on the pixels
  Thin Film draws on.
*/
fn bsplineAlpha(t: texture_2d<f32>, uv: vec2f) -> f32 {
  let texSize = vec2f(U.gridSize);
  let p = uv * texSize - 0.5;
  let i = floor(p);
  let f = p - i;
  let g = 1.0 - f;
  let w0 = g * g * g / 6.0;
  let w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  let w3 = f * f * f / 6.0;
  let g0 = w0 + w1;
  let g1 = w2 + w3;
  // Texel-index positions of the two taps a side, then to uv (centres at +0.5).
  let p0 = (i - 1.0 + w1 / g0 + 0.5) / texSize;
  let p1 = (i + 1.0 + w3 / g1 + 0.5) / texSize;
  return g0.y * (g0.x * tex2(t, vec2f(p0.x, p0.y)).a + g1.x * tex2(t, vec2f(p1.x, p0.y)).a)
       + g1.y * (g0.x * tex2(t, vec2f(p0.x, p1.y)).a + g1.x * tex2(t, vec2f(p1.x, p1.y)).a);
}

/*
  The dye's depth as decodeFluid makes it from a density, before the
  darkness and the gap scale it: the plain amount, or past Exposure and the
  closeup the amount over Film Level. Written as decodeFluid writes it, so
  the ratio below is of the same quantity the film's opacity came from.
*/
fn filmDepthOf(td: f32) -> f32 {
  let exposed = max(0.0, td - U.filmLevel) * U.filmGain;
  return mix(mix(td * 2.8, exposed, U.exposure), exposed, clamp(U.macroOn, 0.0, 1.0));
}

/*
  The film's amount, read smooth. What the composite carries as the film
  (film0) is made in three steps from the dye's read: the decode's opacity,
  1 - exp(-depth × k), where k is the darkness, the gap and Colour Body, all
  smooth across a dye's edge (bare0, as the display main keeps it); with the
  gooey blur on, the gooey edge's contrast, (a - 0.5) × (1.2 + 4 Gooey) +
  0.5, three times at the default Gooey, which is what puts the thin film's
  rings on the steepest part of the edge; then the dark blend's 0.6 and the
  closeup, which scale it.

  So the smooth film is the same three steps from the smooth read: the
  thickness -log(1 - bare0) times the two depths' ratio (so the darkness,
  the particles' speckle and the gap carry over and only the read changes),
  back to an opacity, through the same contrast, and scaled by what scaled
  film0 (its ratio to the contrast of bare0).

  The read it replaces is the one the decode made. In focus with no gooey
  blur that is textureBicubic. With the gooey blur it is blurAlpha, and in
  every look the blur is a fraction of a cell (Gooey 0.45 × Post Blur 0.35
  is a third of a cell on a 640-pixel plate of 192 cells, and less at the
  app's sizes), taps of a plain bilinear read: its slope jumps at every
  texel, which is the faceting at its worst, and the B-spline's own half
  cell of blur stands in for it. Past half a cell between taps blurAlpha
  takes its wide form, twenty-five taps reaching a cell or more either side:
  that is the look's choice to melt the edge over cells, which a half-cell
  spline would undo, and a defocused pixel's five taps are wider still.
  Both are left as they were (npm run filmrings prints what the wide form
  does; PLAN 1j).
*/
fn gooeyContrast(a: f32, useBlur: bool) -> f32 {
  if (!useBlur) { return a; }
  return clamp((a - 0.5) * (1.2 + U.gooey * 4.0) + 0.5, 0.0, 1.0);
}

fn smoothFilm(film: f32, bare: f32, t: texture_2d<f32>, fuv: vec2f, blurFluid: f32, useBlur: bool) -> f32 {
  let shaped = gooeyContrast(bare, useBlur);
  let aRef = select(textureBicubic(t, fuv).a, blurAlpha(t, fuv, blurFluid), useBlur);
  let dC = filmDepthOf(decodeDensity(aRef));
  if (dC < 1e-5 || shaped < 1e-4) { return film; }
  let dB = filmDepthOf(decodeDensity(max(bsplineAlpha(t, fuv), 0.0)));
  let thick = -log(max(1.0 - bare, 1e-4));
  let bareSmooth = 1.0 - exp(-thick * dB / dC);
  return film * gooeyContrast(bareSmooth, useBlur) / shaped;
}

/*
  The soap film's colour over the plate where the dye is thinnest. The
  rainbow's phase carries 1.4 periods of the grain's noise; as thickness the
  same noise would be up to 290 nm that is not the dye's and would put the
  thinnest film at straw rather than black, so the thickness takes only a
  little of it, centred.
*/
fn thinFilmOver(c: vec3f, film0: f32, bare0: f32, t: texture_2d<f32>, fuv: vec2f, blurFluid: f32, useBlur: bool, dof: f32) -> vec3f {
  var film = film0;
  if (dof < 0.02 && (!useBlur || blurFluid * U.gridSize < 0.5)) { film = smoothFilm(film0, bare0, t, fuv, blurFluid, useBlur); }
  let thin = smoothstep(0.4, 0.04, film) * smoothstep(0.004, 0.03, film);
  let grain = fbm3(fuv * 26.0);
  let filmT = film * 16.0 + grain * 1.4;
  let filmThick = film * 16.0 + (grain - 0.5) * 0.4;
  let filmC = filmColourAt(filmT + U.time * 0.02, filmThick);
  return mix(c, c * (0.5 + 1.3 * filmC) + filmC * 0.08, thin * U.thinFilm * 0.85);
}

/*
  The frame's soap film (PLAN 32d), drawn from its own thickness.

  What it replaced on Soap Film. Thin Film above is the dye's amount times
  sixteen through a ring table, multiplied onto the dye's colour: a tint of the
  pigment where the dye is thin, and nothing where the soap has torn it away.
  The look was 82 to 87% black and one hue (2026-11-12). A soap film has no
  pigment. Its colour is the light its two faces reflect, interfering: the
  Newton series of its thickness, silver where it is microns thick, the
  orders' magentas, blues, greens and golds through a few hundred nm, black
  under about 30. So the plate reads the film's thickness (the solver's own,
  gpu/soapFilmPlate.ts) and looks its reflected colour up in soapFilmLut
  (src/lib/soapFilm.ts): soapFilmRgb's soft-box colour, the one npm run
  soapfilm judges against the photograph, in linear light at gain 1, by
  effective thickness h cos θ_t (the path is 2 n h cos θ_t, so the angle the
  film is seen at is a scale on h and the table is one table).

  Read through a cubic B-spline, for the reason bsplineAlpha says: the bands
  are contours of h, ten or more of them across a few cells where the film is
  steep, and a bilinear read turns every one of them into a polygon whose
  corners line up with the film's cells (1i). The B-spline is C2, so no band
  has a corner.

  Laid over the plate as a reflection is: the film's reflected light added,
  and what is behind it seen through the share the film did not reflect.
  Where the film is black (8 nm) it reflects next to nothing and the plate
  behind shows, which is the black lace. The table's sRGB is the plate's: the
  reference picture is soapFilmRgb's, encoded, over a dark ground.
*/
@group(0) @binding(18) var<storage, read> soapH: array<f32>;
@group(0) @binding(19) var<storage, read> soapLut: array<vec4f>;

const SOAP_LUT_STEP: f32 = ${SOAP_LUT_STEP_NM}.0;
const SOAP_GAIN: f32 = 4.0;
const SOAP_FRAME_LO: f32 = ${SOAP_FRAME_LO};
const SOAP_FRAME_SPAN: f32 = ${SOAP_FRAME_SPAN};

fn soapAt(i: i32, j: i32, n: i32) -> f32 {
  return soapH[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
}

fn soapWeights(f: f32) -> vec4f {
  let g = 1.0 - f;
  return vec4f(g * g * g, 4.0 - 6.0 * f * f + 3.0 * f * f * f, 1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f, f * f * f) / 6.0;
}

fn soapThickness(fuv: vec2f, n: i32) -> f32 {
  let p = fuv * f32(n) - 0.5;
  let b = vec2i(floor(p));
  let wx = soapWeights(p.x - floor(p.x));
  let wy = soapWeights(p.y - floor(p.y));
  var h = 0.0;
  for (var y = 0; y < 4; y++) {
    let row = wx.x * soapAt(b.x - 1, b.y - 1 + y, n) + wx.y * soapAt(b.x, b.y - 1 + y, n)
            + wx.z * soapAt(b.x + 1, b.y - 1 + y, n) + wx.w * soapAt(b.x + 2, b.y - 1 + y, n);
    h += wy[y] * row;
  }
  return h;
}

fn soapEncode(c: vec3f) -> vec3f {
  let v = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(1.055 * pow(v, vec3f(1.0 / 2.4)) - 0.055, 12.92 * v, v <= vec3f(0.0031308));
}

fn soapFilmOver(c: vec3f, fuv: vec2f) -> vec3f {
  // A 1×1 stand-in is bound while the frame holds no film: nothing to draw.
  let n = i32(round(sqrt(f32(arrayLength(&soapH)))));
  let count = arrayLength(&soapLut);
  // The frame on the plate (gpu/soapFrame.ts), its row 0 at the top: the plate's uv runs up the picture.
  let f = (fuv - SOAP_FRAME_LO) / SOAP_FRAME_SPAN;
  if (n < 4 || count < 2u || any(f < vec2f(0.0)) || any(f > vec2f(1.0))) { return c; }
  let d = max(0.0, soapThickness(vec2f(f.x, 1.0 - f.y), n)) * U.soapCosT;
  let pos = min(d / SOAP_LUT_STEP, f32(count - 1u));
  let k = u32(pos);
  let lin = mix(soapLut[k].rgb, soapLut[min(k + 1u, count - 1u)].rgb, pos - f32(k)) * SOAP_GAIN;
  let film = soapEncode(lin);
  let reflected = min(1.0, dot(film, vec3f(0.2126, 0.7152, 0.0722)));
  return mix(c, c * (1.0 - reflected) + film, U.soapFilm);
}
`;
