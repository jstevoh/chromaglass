import { DISH_METRES, DISH_REST_GAP } from '../../lib/turntable';

/**
 * The lamp under the front plate (`mixLamp`), and the video as one of its
 * sources (PLAN 14ag-3): built into the display shader (plate.ts) where
 * mixLamp sat, after the helpers it calls (`ledLight`, `gelFilter`,
 * `gelColor`, `lumiaLight`, `blendRow`, `mixLevelled`, `filmFrame`) and the
 * `derived0` and `view0` bindings.
 *
 * Why it is its own module: plate.ts is over the size budget (`npm run
 * sizes`) and may not grow, and the video in the lamp grew mixLamp; it moved
 * here whole with it, as the film's frame moved to plateFilm.ts.
 *
 * VIDEO_LAMP_DEPTH_M is how far under the liquid the picture is: a tablet or
 * a light panel under the dish's glass, on a riser. It is the one number the
 * refraction's size hangs on (a drop is a magnifier whose power over the
 * picture grows with the gap), named here rather than a setting; PLAN 14ag-5
 * gives it a slider if the owner wants the liquid's lenses stronger or calmer.
 */
export const VIDEO_LAMP_DEPTH_M = 0.02;

export const LAMP_MIX_WGSL = /* wgsl */ `
/*
  Where the lamp's picture is seen from, through the liquid (PLAN 14ag-3).

  A lamp of one colour looks the same wherever a ray through the dish comes
  from, so the lamp was never bent. A picture under the dish is not: the ray
  from the lens through a point of the liquid leaves the liquid's underside
  bent by the liquid's slope, and meets the picture beside the point straight
  below. Thin-prism optics: a layer of index n and thickness h tilts a ray by
  the gradient of (n - 1)h, toward the thicker side, so a drop over the
  picture shows what is under it magnified, as a drop of water on a page
  does, and a ridge of oil pulls the picture along it.

  The solver's optical path is in derived0's .w (calcOpl, the derive pass):
  n·h, h in rest gaps, the oil's, the film's and the poured liquids' indices
  in n, and the dye's named stand-in (refractionOptics note 6). The ray's
  delay against the air it replaces is that less h, (n - 1)h, with h read
  from the view as calcOpl reads it (the gap in rest gaps), so
  a pool of glycerine at the water's depth bends by its index step and a
  squeezed gap of water by its depth's slope, each by the true amount. The
  gradient is taken in the dish's own uv, by central differences two cells
  wide. What is left out: the back plate's liquid (only the front plate's
  surface bends the lamp), and the spread of the lens's aperture over the
  picture (one ray a point, so a picture under a drop is sharp).

  The bend is in the dish's uv; the picture is laid in the screen's, so it is
  turned back through uvToFluid's rotation and scale. Off (0) on the
  photographed views, whose derived field carries no optical path, and with
  the dishes spread (Dish Spread), whose fuv0 comes from dishToPlate and not
  uvToFluid, so the turn back would be the wrong size (PLAN 14ag-7 notes it).
*/
var<private> lampBend: vec2f = vec2f(0.0);

fn videoInLamp() -> bool { return U.filmOn != 0 && (U.mixPos.z < U.mixPos2.z || U.filmRing != 0) && U.filmMix > 0.001; }

// The column's depth in rest gaps, as calcOpl takes it from the view.
fn lampDepthAt(fuv: vec2f) -> f32 {
  let v = viewAt(fuv);
  return select(1.0, clamp(v.gap / 0.03, 0.3, 3.0), v.gap > 0.001);
}
// (n - 1)h: the delay of a ray through the column against air, in rest gaps.
fn lampDelayAt(fuv: vec2f) -> f32 { return tex2(derived0, fuv).w - lampDepthAt(fuv); }

fn lampBendAt(fuv: vec2f, c: f32, s: f32) -> vec2f {
  let e = 2.0 / U.logicalGrid;
  let gx = lampDelayAt(fuv + vec2f(e, 0.0)) - lampDelayAt(fuv - vec2f(e, 0.0));
  let gy = lampDelayAt(fuv + vec2f(0.0, e)) - lampDelayAt(fuv - vec2f(0.0, e));
  // grad((n - 1)h) per unit of the dish's uv, then the ray's tilt in radians:
  // h is in rest gaps (${DISH_REST_GAP} of the dish), the dish ${DISH_METRES} m.
  let tilt = vec2f(gx, gy) / (2.0 * e) * ${DISH_REST_GAP};
  // How far along the picture the tilted ray lands, in the dish's uv.
  let dFuv = tilt * ${(VIDEO_LAMP_DEPTH_M / DISH_METRES).toFixed(4)};
  // Back to the screen's uv: uvToFluid's scale and rotation undone.
  let dp = dFuv * max(U.resolution.x, U.resolution.y) * 1.5 * U.camZoom;
  return vec2f(c * dp.x + s * dp.y, -s * dp.x + c * dp.y) / U.resolution;
}

/**
 * The video as the LED platform (PLAN 14ag-9). The owner asked for the video
 * "as the spinning LED light background": the ring a liquid show sets its
 * dish on is a disc of lights turning under the glass, and here the disc is
 * the picture. So the frame is read at the point the platform has carried
 * round to here: the screen point turned back by the ring's angle about the
 * plate's centre, in pixels so the turn stays a turn on a wide wall, then
 * framed (Video Zoom, Across, Up) as the projector frames it. It turns with
 * LED Rotation Speed, as the ring's own colours do (ledLight's angle), and
 * dims toward the rim by the same bevel. It takes the ring's row and the
 * ring's blend; its level is Film Mix, the video's, by how much of the frame
 * is there, so a zoomed-out frame's corners pass the lamp under them bare.
 * The liquid bends it (lampBend) as it bends any picture in the lamp.
 */
fn videoRing(uv: vec2f) -> vec4f {
  let p = (uv - 0.5) * U.resolution;
  let a = U.ledAngle * 2.0 * PI;
  let ca = cos(a);
  let sa = sin(a);
  let turned = vec2f(ca * p.x - sa * p.y, sa * p.x + ca * p.y) / U.resolution + 0.5;
  let frame = filmFrame(turned, vec4f(0.0), vec3f(0.0, 0.0, 1.0));
  let maxR = max(U.resolution.x, U.resolution.y) * 0.8;
  let bevel = 1.0 - smoothstep(maxR * 0.5, maxR, length(p)) * 0.8;
  return vec4f(frame.rgb * bevel, frame.w);
}

/**
 * The rows under the front plate, bottom up: the lamp the glass is lit by.
 * The LED ring replaces what is under it by its level, as the platform always
 * did; the gel filters what is under it (gelFilter: it makes no light, so
 * over a dark lamp it shows nothing, PLAN 38h); the lumia adds its light.
 *
 * The video (PLAN 14ag-3), when the operator puts it under the glass: a
 * picture in the lamp house, the light panel or tablet a show sets the dish
 * on. Its Own way in is a transparency's: the lamp under it passes through it
 * colour by colour, as much of it as Film Mix says and where the frame is
 * (outside a zoomed-out frame the lamp passes bare), so over the white lamp
 * it is the picture and over the LED ring the picture lit by the ring. Its
 * other blends are every lamp row's. It is read at lampBend from its point,
 * which is the liquid's refraction of it; the dye's absorption is the lamp
 * ground's (onGround: lampBg × what the dye lets through, Beer–Lambert).
 */
fn mixLamp(bg: vec3f, uv: vec2f) -> vec3f {
  var c = bg;
  for (var p = 0; p < 7; p++) {
    let fp = f32(p);
    if (fp >= U.mixPos2.z) { break; }
    // The ring's row, or the lamp's bottom when the LED row was moved above the glass as a beam.
    if (U.filmRing != 0 && (U.mixPos.x == fp || (U.mixPos.x >= U.mixPos2.z && p == 0))) {
      let ring = videoRing(uv + lampBend);
      let m = mixBlendOf(U.mixBlend.x);
      if (m == 0) { c = mixLevelled(c, ring.rgb, U.filmMix * ring.w); } else { c = blendRow(c, ring.rgb, U.filmMix * ring.w, m); }
    } else if (U.ledPlatform != 0 && U.mixPos.x == fp) {
      let m = mixBlendOf(U.mixBlend.x);
      if (m == 0) { c = mixLevelled(c, ledLight(uv), U.mixLevel.x); } else { c = blendRow(c, ledLight(uv), U.mixLevel.x, m); }
    }
    if (U.gelWheel > 0.001 && U.mixPos2.x == fp) {
      let m = mixBlendOf(U.mixBlend.y);
      if (m == 0) { c *= gelFilter(uv); } else { c = blendRow(c, gelColor(uv), U.gelWheel, m); }
    }
    if (U.lumia > 0.001 && U.mixPos2.y == fp) {
      let m = mixBlendOf(U.mixBlend.z);
      if (m == 0) { c += lumiaLight(uv) * U.lumia; } else { c = blendRow(c, lumiaLight(uv), U.lumia, m); }
    }
    if (U.mixPos.z == fp && videoInLamp() && U.filmRing == 0) {
      let frame = filmFrame(uv + lampBend, vec4f(0.0), vec3f(0.0, 0.0, 1.0));
      let a = U.filmMix * frame.w;
      let m = mixBlendOf(U.mixBlend.w);
      if (m == 0) { c *= mix(vec3f(1.0), frame.rgb, a); } else { c = blendRow(c, frame.rgb, a, m); }
    }
  }
  return c;
}
`;
