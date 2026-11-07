/**
 * The moiré sheets (PLAN 42a): two printed transparencies on the projector's
 * stage, one under the glass and one laid on the cover, the way a liquid light
 * crew stacks a pair of line sheets on the overhead and turns the top one by
 * hand. Built into the display shader through `TRANSMIT_WGSL` (plateTransmit.ts),
 * so it is one more filter the lamp's light goes through and adds no light.
 *
 * The sheet designs are numbered as `MOIRE_SHEETS` in `lib/moire.ts` lists them;
 * the uniforms are the `moire*` fields of `PLATE_FIELDS`.
 */
export const MOIRE_WGSL = /* wgsl */ `
/*
  The physical numbers, and why each.

  MOIRE_STAGE_MM: the frame's height on the stage. An overhead's stage is a
  ten-inch square and the projected window is about its height, so one unit
  of frame height is taken as 250 mm. The sheet gap and the line pitch are
  real lengths on that scale.

  MOIRE_NA: the projector lens's half-angle as seen from the stage, as a
  tangent. An overhead's head lens works at about f/4 over a 330 mm throw to a
  stage 250 mm across; the cone a stage point sends into it is about 0.12.
  A sheet that sits a distance D off the plane the lens is focused on (the
  liquid) is drawn through a disc of confusion of radius D * MOIRE_NA, which
  is why a lower sheet's fine lines go soft on the wall while its moiré,
  which is far coarser, stays crisp: the effect people see in every video
  of the real thing.

  MOIRE_INK, MOIRE_FILM: what a good print passes. Opaque screen ink on clear
  polyester passes about 2% (the sellers' "blocks light much better than a
  laser print"), and the film itself about 92% (two surfaces at 4% each).

  MOIRE_N: the liquid's index for the lower sheet's refraction. A liquid show
  is water dyes (1.33) under or beside mineral oil (1.47); glycerine-water
  mixes sit at 1.40, which is taken here, between the two.
*/
const MOIRE_STAGE_MM: f32 = 250.0;
const MOIRE_NA: f32 = 0.12;
const MOIRE_INK: f32 = 0.02;
const MOIRE_FILM: f32 = 0.92;
const MOIRE_N: f32 = 1.40;
const MOIRE_TAU: f32 = 6.28318530718;

/*
  One printed grating, as the share of a pixel's light that gets through its
  clear lines, given the line's phase u (in cycles, the lines sit where
  fract(u) is near 0), how fast the phase changes (g, cycles per unit of frame
  height), the clear share of each period (c), and the half-width W of the
  filter the light is seen through (frame units).

  Why an integral and not a sampled pattern: a sampled line pattern on a
  screen makes a moiré of its own against the pixel grid, and in a feature
  whose whole point is moiré that false one would be read as the real one.
  So the square wave is integrated exactly over a tent of half-width
  d = W * g cycles, as the second difference of its second antiderivative.
  A tent and not a box: a box's transfer is a sinc, whose side lobes let a
  pitch between one and two pixels through at up to a fifth of its contrast,
  to alias against the pixel grid; the tent's is a sinc squared, under a
  twentieth there. The square wave is S'(v) for
  S(v) = c v + q(fract v), q(t) = min(t, c) - c t, so its second
  antiderivative is c v^2 / 2 + floor(v) Q1 + Qp(fract v), Q1 the integral of
  q over a period, worked from the start of u's own period so that nothing is
  taken at u ~ 400 and differenced. Under a twentieth of a period the tent is
  narrower than the print's edge can show and the box of the same width is
  taken instead, which needs one difference, not two.

  W carries two things, added as variances: the pixel (a tent of half-width
  one pixel w, variance w^2/6) and the lens's disc of confusion of radius r,
  whose 1-D projection has variance r^2/4. The disc's own transfer function is
  a jinc, which reverses the contrast of a pitch finer than its first zero;
  the tent keeps the loss of contrast and not that reversal (a shortcut,
  PLAN 42a-4).
*/
fn moireS2(v: f32, c: f32) -> f32 {
  let t = fract(v);
  let qp = select(c * c * 0.5 + c * (t - c), t * t * 0.5, t <= c) - c * t * t * 0.5;
  return c * v * v * 0.5 + floor(v) * c * (1.0 - c) * 0.5 + qp;
}
fn moireBox(u: f32, d: f32, c: f32) -> f32 {
  if (d >= 1.0) { return c; }
  let u0 = fract(u) + 0.5 * c;
  if (d < 0.05) {
    let dd = max(d, 1e-4);
    let a = u0 - dd;
    let b = u0 + dd;
    let sa = floor(a) * c + min(fract(a), c);
    let sb = floor(b) * c + min(fract(b), c);
    return clamp((sb - sa) / (2.0 * dd), 0.0, 1.0);
  }
  let s2 = moireS2(u0 + d, c) - 2.0 * moireS2(u0, c) + moireS2(u0 - d, c);
  return clamp(s2 / (d * d), 0.0, 1.0);
}

/* A straight grating in direction dir (a unit vector) at L lines per unit. */
fn moireLines(p: vec2f, dir: vec2f, L: f32, W: f32, c: f32) -> f32 {
  return moireBox(L * dot(p, dir), W * L, c);
}

/*
  One sheet's transmission at p (frame units from the centre), before the
  film's own loss: the clear share passes 1, the inked share passes inkT.
  L is the sheet's lines per unit of frame height; curl is the one shape dial
  the designs share (the spokes' sweep, the spiral's starts, the waves'
  height, the groove's wiggle, the zoom grid's twist).

  Each design is a phase u(p) and its gradient |grad u|. Where the gradient
  runs away (the centre of the spokes, the zoom grid's eye) the box swallows
  whole periods and the sheet reads as its average grey, which is what a
  real print does there: the lines merge into a dark hub.
*/
fn moireSheet(id: f32, p: vec2f, L: f32, W: f32, inkT: f32, curl: f32) -> vec3f {
  let k = i32(round(id));
  if (k <= 0) { return vec3f(1.0); }
  let rr = max(length(p), 1e-4);
  let th = atan2(p.y, p.x);
  var clear = 1.0;
  if (k == 1) {
    // Lines.
    clear = moireLines(p, vec2f(1.0, 0.0), L, W, 0.5);
  } else if (k == 2) {
    // Rings.
    clear = moireBox(L * rr, W * L, 0.5);
  } else if (k == 3) {
    // Spokes, swept by curl into curved blades. S is a whole number so the
    // blades close at the seam where atan2 wraps.
    let S = max(3.0, round(2.2 * L));
    let sweep = 1.5 * curl * L;
    let sg = S / (MOIRE_TAU * rr);
    let g = sqrt(sg * sg + sweep * sweep);
    clear = moireBox(S * th / MOIRE_TAU + sweep * rr, W * g, 0.5);
  } else if (k == 4) {
    // Spiral: an Archimedean spiral of m starts.
    let m = 1.0 + round(curl * 11.0);
    let mg = m / (MOIRE_TAU * rr);
    let g = sqrt(L * L + mg * mg);
    clear = moireBox(L * rr + m * th / MOIRE_TAU, W * g, 0.5);
  } else if (k == 5) {
    // Dot screen: clear hexagonal dots in an inked mesh, three gratings at 60°.
    clear = moireLines(p, vec2f(1.0, 0.0), L, W, 0.72)
      * moireLines(p, vec2f(0.5, 0.8660254), L, W, 0.72)
      * moireLines(p, vec2f(-0.5, 0.8660254), L, W, 0.72);
  } else if (k == 6) {
    // Waves: lines bent into a sine of 2.5 waves a frame, curl their height.
    let a = 0.04 * (0.25 + curl);
    let ph = MOIRE_TAU * 2.5 * p.x;
    let tilt = MOIRE_TAU * 2.5 * a * cos(ph);
    let g = L * sqrt(1.0 + tilt * tilt);
    clear = moireBox(L * (p.y + a * sin(ph)), W * g, 0.5);
  } else if (k == 7) {
    // Quasicrystal: five gratings at 72°, a five-fold pattern that never
    // repeats, which no lattice can make; two of them make flowers.
    for (var i = 0; i < 5; i++) {
      let a = MOIRE_TAU * f32(i) / 5.0;
      clear *= moireLines(p, vec2f(cos(a), sin(a)), L, W, 0.8);
    }
  } else if (k == 8) {
    // Colour inks: cyan, magenta and yellow lines at the printer's screen
    // angles (15°, 75°, 0°), the angles a press picks so its three screens
    // do NOT beat. Turned against a second such sheet they beat in colour.
    // Each ink filters its own band, so this design returns colour itself.
    let cy = 1.0 - moireLines(p, vec2f(0.9659258, 0.2588190), L, W, 0.55);
    let mg = 1.0 - moireLines(p, vec2f(0.2588190, 0.9659258), L, W, 0.55);
    let yl = 1.0 - moireLines(p, vec2f(1.0, 0.0), L, W, 0.55);
    let fade = (1.0 - inkT) / (1.0 - MOIRE_INK);
    let cyT = mix(vec3f(1.0), vec3f(0.06, 0.82, 0.92), fade);
    let mgT = mix(vec3f(1.0), vec3f(0.90, 0.06, 0.80), fade);
    let ylT = mix(vec3f(1.0), vec3f(0.94, 0.88, 0.05), fade);
    return mix(vec3f(1.0), cyT, cy) * mix(vec3f(1.0), mgT, mg) * mix(vec3f(1.0), ylT, yl);
  } else if (k == 9) {
    // Song groove: one spiral groove, as a record's, its line wiggled the way
    // a cutting stylus wiggles it. curl is the wiggle's depth; the pack's
    // look patches it to the bass, so the groove breathes with the song.
    let A = 0.35 * curl;
    let wig = A * (0.6 * sin(37.0 * th + 6.0 * rr) + 0.4 * sin(91.0 * th + 11.0 * rr));
    let gr = L + A * 8.0;
    let gt = (1.0 / MOIRE_TAU + A * 59.0) / rr;
    clear = moireBox(L * rr + th / MOIRE_TAU + wig, W * sqrt(gr * gr + gt * gt), 0.5);
  } else {
    // Zoom grid: lines of equal log-radius and equal angle, a grid whose
    // cells stay square at every size. Scaling one sheet slides it along
    // ln r and turning it slides it along the angle, so the beat between two
    // of them spirals inward without end. m twists the rings into spirals.
    let S = max(4.0, round(1.1 * L));
    let m = round(curl * S * 0.5);
    let lr = log(rr);
    clear = moireBox((S * lr + m * th) / MOIRE_TAU, W * sqrt(S * S + m * m) / (MOIRE_TAU * rr), 0.62)
      * moireBox(S * th / MOIRE_TAU, W * S / (MOIRE_TAU * rr), 0.62);
  }
  return vec3f(clear + (1.0 - clear) * inkT);
}

/*
  What the two sheets pass at a point of the frame, as a filter on the light
  that has come through the front plate. Light through two sheets is the
  product of the two transmissions, and that product is the moiré: two
  gratings of nearly the same pitch multiply into their sum and their
  difference, and the difference is the slow fringe.

  The lower sheet lies under the glass, so the projector sees it through the
  liquid: where the surface slopes, the ray from the lens is bent by
  (1 - 1/n) of the slope and lands D further along on the sheet. A moiré
  magnifies a shift of one sheet by the fringe's period over the line's (at a
  4° turn, 14 times), so a drop that bends the lines by a twentieth of a line
  moves the fringe by most of one: the liquid draws itself into the fringes,
  which is how a moiré deflectometer measures a surface. The upper sheet is
  above the liquid and is seen straight.

  The closeup is a camera on the plate, not the projector, and is not drawn
  through the sheets (PLAN 42a-5).
*/
fn moireSheets(uv: vec2f, normal0: vec3f) -> vec3f {
  let amt = clamp(U.moireAmount, 0.0, 1.0) * (1.0 - clamp(U.macroOn, 0.0, 1.0));
  if (amt < 0.001) { return vec3f(1.0); }
  let aspect = U.resolution.x / max(1.0, U.resolution.y);
  let p = (uv - 0.5) * vec2f(aspect, 1.0);
  let w = 1.0 / max(1.0, U.resolution.y);
  let depth = max(U.moireGap, 0.0) / MOIRE_STAGE_MM;
  let r = depth * MOIRE_NA;
  // The tent's half-width whose variance (W^2/6) is the pixel's plus the disc's.
  let W = sqrt(w * w + 1.5 * r * r);
  // The surface's slope, from the plate's own normal, turned from the dish's
  // frame back to the screen's (uvToFluid turns by -rotation0).
  let cr = cos(-U.rotation0);
  let sr = sin(-U.rotation0);
  let sf = normal0.xy / max(normal0.z, 0.2);
  let slope = vec2f(cr * sf.x + sr * sf.y, -sr * sf.x + cr * sf.y);
  let pa = p - slope * (1.0 - 1.0 / MOIRE_N) * depth;
  let inkT = 1.0 - amt * (1.0 - MOIRE_INK);
  let film = 1.0 - amt * (1.0 - MOIRE_FILM);
  let L = max(U.moireDensity, 1.0);
  var t = moireSheet(U.moireSheetA, pa, L, W, inkT, U.moireCurl);
  let ct = cos(U.moireTurn);
  let st = sin(U.moireTurn);
  let q0 = p - vec2f(U.moireSlide, 0.0);
  var q = vec2f(ct * q0.x + st * q0.y, -st * q0.x + ct * q0.y);
  // Turned face down: the same print, mirrored. Two spoke or spiral sheets
  // laid the same way up only turn into each other; one flipped crosses the
  // other's blades, and that is the flower.
  if (U.moireFlip > 0.5) { q.x = -q.x; }
  t *= moireSheet(U.moireSheetB, q, L * max(U.moireRatio, 0.05), W, inkT, U.moireCurl);
  let fa = select(1.0, film, U.moireSheetA > 0.5);
  let fb = select(1.0, film, U.moireSheetB > 0.5);
  return t * fa * fb;
}

/*
  The rows the mixer has between the two plates, after the sheets: plate.ts
  calls this where it called mixSourcesAt for those rows, so the sheets sit
  on the stage with the front plate's liquid and under anything the operator
  stacked above it.
*/
fn mixBelowBack(color: vec3f, uv: vec2f, uvScreen: vec2f, fluid0: vec4f, normal0: vec3f) -> vec3f {
  return mixSourcesAt(color * moireSheets(uv, normal0), U.mixPos2.z + 1.0, U.mixPos.y, uv, uvScreen, fluid0, normal0);
}
`;
