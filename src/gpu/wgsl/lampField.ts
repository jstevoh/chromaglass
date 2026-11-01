/**
 * How the projector lights the stage: the lamp, the Fresnel condenser and the
 * head's lens (PLAN 38a).
 *
 * What was there: the hot-spot multiplied the finished picture by
 * mix(0.78, 1.25, exp(−3.5 d²)) with a warm tint in the middle, a second
 * lamp multiplied a bluish 1.25× Gaussian on top of that, and both centres
 * wandered by noise across up to a third of the plate when Lamp Motion was up
 * (and with the plate's rock even when it was not). The lamp ground was then
 * divided by 1.28125 so the lifted middle did not clip a white lamp. None of
 * it is how an overhead projector lights a dish: a brightness sliding across
 * the whole frame is the kind of whole-frame motion the owner took out of the
 * sound (frameSway 0), a second lamp adds light rather than multiplying it,
 * and nothing on the stage is brighter than the lamp through clear glass.
 *
 * ## What a projector does
 *
 * The lamp sits under a Fresnel condenser that is the stage itself. The
 * condenser forms an image of the bulb (filament and reflector) up at the
 * head, and when the lamp is on its mark that image lands in the lens's
 * aperture: every point of the stage sends its whole bundle of light into
 * the lens, so the stage is lit almost evenly (Köhler's idea, which is why
 * the condenser is there at all). An overhead projector has a lever that
 * moves the lamp along the axis. Off its mark, the bulb's image forms above
 * or below the lens, and the bundle from a stage point x arrives at the lens
 * as a disc that has slid off the axis by x·μ: ray-trace a stage point to
 * each point of the bulb image at height z_b and cross the lens's plane at
 * height H, and the bundle's centre is at x(1 − H/z_b) and its radius
 * a_b·H/z_b. With μ = 1 − H/z_b the misfocus, in units of the lens's
 * aperture radius P:
 *
 *     centre  c = |x| μ / P        radius  ρ = k (1 − μ)
 *
 * where k is how much of the aperture the bulb's image fills on the mark.
 * What reaches the wall from x is the share of that disc inside the
 * aperture, the overlap of two circles divided by the disc's area. Near the
 * axis the disc is still wholly inside and the stage is as bright as it was;
 * out where c + ρ passes 1 the aperture clips it, and past c = 1 + ρ none of
 * it gets in. That is the hot-spot every misadjusted projector shows: a flat
 * middle at the lamp's full light, falling away toward the corners. It
 * never lifts the middle above the lamp, so the lamp ground needs no
 * divide.
 *
 * The condenser is acrylic, and acrylic bends blue more than red (n is
 * 1.4978 at 486 nm, 1.4935 at 546, 1.4914 at 587, 1.4892 at 656: Abbe 57), so the
 * bulb's image sits at a slightly different height in each colour. Through
 * the lens equation, with the bulb's image about 1.2 focal lengths from the
 * condenser, Δz/z = 1.2·(−Δn/(n − 1)): red +0.5%, green −0.5%, blue −1.6%
 * of the image's distance, so μ for each channel is μ + δ(1 − μ). That is
 * the coloured edge of a misadjusted projector's field, from the glass and
 * not painted.
 *
 * A second bulb beside the first (Second Lamp) forms its own image, offset
 * in the aperture by s, so its bundle from x is centred at x μ / P + s (1 − μ)
 * and its light favours one side of the stage. Its light adds to the first
 * lamp's: what the wall shows is the sum, set to white at the axis per
 * channel, as the projectionist's eye (or a camera's white balance) takes
 * the middle of the field for white.
 *
 * Off the mark, the light the aperture turns away has already gone through
 * the liquid: the liquid is lit by the condenser's even field whatever the
 * lever does. So the heat the lamp puts into dark dye (fluid/dye.ts, PLAN
 * 18f) is the same at every point of the stage, and the old 1/(1 + 2.5 r²)
 * there is gone with this.
 *
 * ## The numbers, and what the setting turns
 *
 * Hot-Spot (lampHotspot, 0 to 1) is the lever: μ = HOTSPOT_MISFOCUS ×
 * Hot-Spot. At 0 the lamp is on its mark and the plate is lit evenly, which
 * is the plate as it was drawn at 0, byte for byte. At about 0.4 (where the
 * shipped looks that use it sit) the corners of a wide frame lose about 9%,
 * which is what the old Gaussian took from them (7%) and what a slightly
 * misadjusted projector shows. At 1 the bulb's image is far enough off that
 * the frame's sides go dark round a lit middle: past anything a projectionist
 * would leave set, and there for the owner to ramp to.
 *
 * The aperture: an overhead projector's head is a 355 mm triplet at about
 * f/4.5, 80 mm across (P = 0.04 m). The bulb's image fills 90% of it (k):
 * a condenser is made to fill the lens, which is where the light is. The
 * stage position is in metres, from the screen's place over the plate (the
 * frame's long side is two thirds of the plate, DISH_METRES across, at a
 * camera zoom of 1) and not from the plate's own coordinates: the dish turns
 * on the stage and the lamp does not turn with it.
 *
 * Shortcut, said here: the bulb's image is a uniformly bright disc. A real
 * filament and reflector are brighter in the middle, which softens the
 * fall-off a little; the shape is the law's.
 */
import { DISH_METRES } from '../../lib/turntable';

/** The lens's aperture radius, metres: an 80 mm head lens. */
export const LAMP_APERTURE = 0.04;
/** How much of the aperture the bulb's image fills on the mark. */
export const BULB_FILL = 0.9;
/** The lamp lever's misfocus μ at Hot-Spot 1. Under 1: at 1 the bulb's image is at infinity. */
export const HOTSPOT_MISFOCUS = 0.6;
/** Acrylic's index at the d line (587 nm) and at 656, 546 and 486 nm, the plate's red, green and blue. */
export const ACRYLIC_N_D = 1.4914;
export const ACRYLIC_N: readonly [number, number, number] = [1.4892, 1.4935, 1.4978];
/** The bulb's image distance from the condenser, in its focal lengths. */
export const IMAGE_IN_FOCALS = 1.2;
/** The acrylic condenser's dispersion: each channel's image height, relative (R, G, B), z/f·(−Δn/(n − 1)). */
export const CONDENSER_DISPERSION = ACRYLIC_N.map(n => -IMAGE_IN_FOCALS * (n - ACRYLIC_N_D) / (ACRYLIC_N_D - 1)) as unknown as readonly [number, number, number];
/** Where the second bulb's image sits in the aperture, in aperture radii (screen x, y; y up the frame). */
export const SECOND_BULB: readonly [number, number] = [-0.35, 0.35];
/** The second bulb's colour against the first's: a cooler lamp. */
export const SECOND_TINT: readonly [number, number, number] = [0.9, 0.97, 1.12];

const f = (v: number) => v.toFixed(6);
const v3 = (a: readonly number[]) => `vec3f(${a.map(f).join(', ')})`;

/**
 * The share of a disc of radius r, centred d from the aperture's centre (both
 * in aperture radii), that gets through the aperture. The CPU's twin of the
 * shader's, for the check (scripts/lampfield.mjs).
 */
export function pupilPass(d: number, r: number): number {
  if (d + r <= 1) return 1;
  if (d >= 1 + r) return 0;
  if (d <= r - 1) return 1 / (r * r);
  const a1 = r * r * Math.acos(Math.min(1, Math.max(-1, (d * d + r * r - 1) / (2 * d * r))));
  const a2 = Math.acos(Math.min(1, Math.max(-1, (d * d + 1 - r * r) / (2 * d))));
  const k = 0.5 * Math.sqrt(Math.max(0, (-d + r + 1) * (d + r - 1) * (d - r + 1) * (d + r + 1)));
  return Math.min(1, Math.max(0, (a1 + a2 - k) / (Math.PI * r * r)));
}

/**
 * The light the wall gets from a stage point (metres from the axis, y up),
 * per channel, as the shader computes it: the lamp at hotspot ∈ [0, 1] on
 * the lever, a second bulb at second ∈ [0, 1] of the first's power.
 */
export function lampField(x: number, y: number, hotspot: number, second: number): [number, number, number] {
  const out: [number, number, number] = [1, 1, 1];
  const mu0 = hotspot * HOTSPOT_MISFOCUS;
  for (let c = 0; c < 3; c++) {
    const mu = mu0 + CONDENSER_DISPERSION[c] * (1 - mu0);
    const rho = BULB_FILL * (1 - mu);
    const px = x * mu / LAMP_APERTURE, py = y * mu / LAMP_APERTURE;
    const t1 = pupilPass(Math.hypot(px, py), rho);
    if (second <= 0.001) { out[c] = t1; continue; }
    const sx = SECOND_BULB[0] * (1 - mu), sy = SECOND_BULB[1] * (1 - mu);
    const w = second * SECOND_TINT[c];
    out[c] = (t1 + w * pupilPass(Math.hypot(px + sx, py + sy), rho)) / (1 + w * pupilPass(Math.hypot(sx, sy), rho));
  }
  return out;
}

/** Stage metres per plate width, for the shader's screen-to-stage step. */
export const STAGE_METRES = DISH_METRES;

/*
  The shader's side. lampField takes the stage point in metres (y up) and
  the two settings, and returns the light per channel. pupilPass is the
  circle overlap, three channels at once: its branches are selects, so a
  channel on one side of a knee does not cost the others a divergent branch.
*/
export const LAMP_FIELD_WGSL = /* wgsl */ `
fn pupilPass(d: vec3f, r: vec3f) -> vec3f {
  let dd = max(d, vec3f(1e-5));
  let a1 = r * r * acos(clamp((dd * dd + r * r - 1.0) / (2.0 * dd * r), vec3f(-1.0), vec3f(1.0)));
  let a2 = acos(clamp((dd * dd + 1.0 - r * r) / (2.0 * dd), vec3f(-1.0), vec3f(1.0)));
  let k = 0.5 * sqrt(max(vec3f(0.0), (r + 1.0 - dd) * (dd + r - 1.0) * (dd - r + 1.0) * (dd + r + 1.0)));
  var t = clamp((a1 + a2 - k) / (3.14159265 * r * r), vec3f(0.0), vec3f(1.0));
  t = select(t, vec3f(1.0) / (r * r), d <= r - 1.0);
  t = select(t, vec3f(0.0), d >= r + 1.0);
  return select(t, vec3f(1.0), d + r <= vec3f(1.0));
}

fn lampField(stage: vec2f, hotspot: f32, second: f32) -> vec3f {
  let mu0 = hotspot * ${f(HOTSPOT_MISFOCUS)};
  let mu = vec3f(mu0) + ${v3(CONDENSER_DISPERSION)} * (1.0 - mu0);
  let rho = ${f(BULB_FILL)} * (1.0 - mu);
  let r = length(stage) / ${f(LAMP_APERTURE)};
  let t1 = pupilPass(r * mu, rho);
  if (second <= 0.001) { return t1; }
  let p = stage / ${f(LAMP_APERTURE)};
  let s = vec2f(${f(SECOND_BULB[0])}, ${f(SECOND_BULB[1])});
  let w = second * ${v3(SECOND_TINT)};
  let d2 = vec3f(length(p * mu.x + s * (1.0 - mu.x)), length(p * mu.y + s * (1.0 - mu.y)), length(p * mu.z + s * (1.0 - mu.z)));
  let t2 = pupilPass(d2, rho);
  let t0 = pupilPass(length(s) * (1.0 - mu), rho);
  return (t1 + w * t2) / (1.0 + w * t0);
}
`;
