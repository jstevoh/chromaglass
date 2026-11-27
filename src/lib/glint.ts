/**
 * Glitter in the liquid, the lens that photographs it, and a second lamp
 * raking in from the side (PLAN 47e, 47d, 47b-side; asked 2026-11-13 after
 * the artist's Microlab films were watched frame by frame: specks floating
 * in dark water, big out-of-focus discs, star-shaped glints on the brightest
 * of them, and a red or amber light coming in low from one side over the
 * blue glow).
 *
 * This file is the physics, in numbers, with nothing GPU in it: the plate's
 * lens pass (`gpu/glint.ts`, `gpu/wgsl/glint.ts`) is built from these
 * constants and computes the same laws per speck and per pixel, and
 * `npm run glint` holds the two to each other and to the laws themselves.
 *
 * **The specks.** Craft glitter: aluminised flakes 20 to 100 micrometres
 * across and a twentieth to a tenth as thick, a mirror each. In the gap
 * between two glasses the liquid's flow is Poiseuille's, u(z) = 6 ū z (1 − z)
 * across the gap (z from the bottom glass, ū the depth-averaged speed the
 * solver solves for), so a speck rides at its own depth's speed: one near a
 * glass barely moves, one in the middle goes half as fast again as the dye
 * it sits in. The same profile shears the liquid across the gap at
 * γ̇ = 6 ū (1 − 2z) / gap, far harder than anything in the plane, and a flake
 * in shear turns in a Jeffery orbit (Jeffery 1922): an oblate body of aspect
 * r (thickness over width) lies flat for most of each turn and flips through
 * edge-on quickly, its normal's angle from the glass's normal following
 * tan θ = r tan ξ with the orbit's phase ξ advancing at γ̇ r / (1 + r²).
 * So the flakes flash as they flip, more often where the flow is fast and
 * sheared, which is how rheoscopic liquid shows a flow. They are a little
 * denser than water (polystyrene glitter, 1.05), so each settles at its
 * Stokes speed, about a fiftieth of a millimetre a second, and lies flat on
 * the floor glass once it gets there; a stir lifting them again is stood in
 * for by a speck's rebirth somewhere else after its life (a shortcut, named
 * in PLAN 47e-2).
 *
 * **The light a flake sends to the lens** is a mirror's: the lamp seen in it,
 * at the flake's reflectance, when the mirror's normal is halfway between the
 * lens and the lamp, spread by the flake's crinkle and the lamp's own size.
 * Two lamps can be in it: the side lamp (below) and, in the closeup, the
 * photographer's softbox (Light Play, 38h-7). The projector's lamp under the
 * glass cannot be: an upward ray off a mirror goes back down. On the lamp a
 * flake is a dark speck, its shadow; that is what glitter in an overhead
 * projector's dish does.
 *
 * **The lens.** A camera framing the window the screen shows, with a 36 mm
 * sensor, so its magnification is m = sensor / field. A point at depth z
 * while the lens focuses at z_f spreads into the aperture's own shape, a
 * disc (a hexagon when stopped down past wide open: six blades) of diameter
 * |z − z_f| · gap · m / (N (1 + m)) on the plate (the thin lens, object
 * side), so a speck off the focal plane is a soft disc and only reads as a
 * bright disc because it is added in linear light. In focus a point is
 * diffraction's: an Airy core 1.22 λ N (1 + m) / m across on the plate and,
 * because the aperture's edges are straight, a streak perpendicular to each
 * edge whose intensity falls as 1/r² (edge diffraction): six spikes from six
 * blades, red ones a little longer than blue, carrying about a fifth of the
 * point's energy past one Airy radius. A dim point's spikes are below what
 * shows; a flake glinting at a hundred times the lamp's white has spikes tens
 * of pixels long, and they grow as the lens stops down while its discs shrink:
 * the one dial (Lens Stop, the f-number) trades bokeh for stars as a real lens
 * does. The focal plane is Focus (projectorFocus), already a depth in the gap.
 *
 * **The side lamp.** A small coloured spotlight beside the dish, low over the
 * glass (SIDE_ELEVATION), at an angle round the dish the operator turns. Its
 * light falls off across the stage as a real lamp's does, by the inverse
 * square of its distance and the cosine of its slant onto the glass, so it
 * reads as coming in from one side. Three things send it on to the lens:
 * a flake's mirror (the glints above), the dye's own pigment scattering it
 * back up (coloured by the dye on the lamp, where an amber lamp on blue dye is
 * dim; on black, where the dye glows by fluorescence and is pale in visible
 * light, nearly white, so the amber lies over the blue glow as in the films),
 * and the steep walls of bubbles and drops facing it by Fresnel. Clear
 * liquid sends it nowhere, so the blue glow under it is untouched.
 */

/** How many specks Glitter at 1 suspends in the whole plate. The closeup at 6x sees about a fiftieth of them. */
export const SPECK_MAX = 32768;

/** A flake's radius, metres: log-uniform between these (fine to ultra-fine craft glitter). */
export const FLAKE_RADIUS = [10e-6, 50e-6] as const;
/** A flake's thickness over its width (the Jeffery aspect r): uniform between these. */
export const FLAKE_ASPECT = [0.03, 0.12] as const;
/** An aluminised flake's reflectance, flat across the spectrum. */
export const FLAKE_REFLECT = 0.85;
/**
 * How far a flake's facets stray from flat, radians: its crinkle. Cut
 * polyester glitter is curled and wavy, not a lapped mirror: about 9 degrees.
 * At 3 degrees (a flat mirror) a closeup at 8x showed one glint in two
 * hundred specks, where glitter under a lamp shows a scatter of them.
 */
export const FLAKE_CRINKLE = 0.15;
/** Polystyrene glitter's density over water's, minus one. */
export const FLAKE_DENSITY_EXCESS = 0.05;
/** A speck's life before a stir lifts it somewhere else, seconds: uniform between these. */
export const SPECK_LIFE = [40, 160] as const;

/** The gap between the glasses, metres (the one number, lib/turntable's DISH_GAP_METRES). */
export const GAP_METRES = 0.002;
/** The plate's width, metres (lib/turntable's DISH_METRES). */
export const PLATE_METRES = 0.2;
/** Water. */
export const N_WATER = 1.333;
export const WATER_VISCOSITY = 1.0e-3;
const G = 9.81;

/** The sensor the closeup's camera frames the screen's window on, metres across its long side. */
export const SENSOR_METRES = 0.036;
/** The iris's blades: the bokeh's hexagon and the spikes' count. Even, so each spike has its twin opposite. */
export const IRIS_BLADES = 6;
/** Where the iris's first corner points, radians. */
export const IRIS_TURN = 0.26;
/** The f-number at which the iris stops being a circle and shows its blades. */
export const WIDE_OPEN = 2;
/** Red, green and blue, metres: where diffraction's size comes from. */
export const WAVELENGTH = [620e-9, 540e-9, 460e-9] as const;
/** The share of a point's energy that edge diffraction puts past r in the spikes is SPIKE_SHARE · r_airy / r. */
export const SPIKE_SHARE = 0.2;
/** The faintest linear light a spike is drawn out to (about a twentieth of the display's range in sRGB). */
export const SPIKE_FLOOR = 0.004;
/** The longest a spike is drawn, pixels. */
export const SPIKE_MAX_PX = 160;

/** The side lamp: its height over the glass as an angle from its foot, radians (20 degrees: a raking light). */
export const SIDE_ELEVATION = 0.35;
/** How far its foot stands from the dish's centre, metres. */
export const SIDE_DISTANCE = 0.3;
/** Its angular radius seen from the dish, radians (a 3 cm spot at about a third of a metre). */
export const SIDE_LAMP_RADIUS = 0.05;
/** Its radiance against the lamp ground's white at Side Light 1: a spotlight seen in a mirror is far brighter than a diffuse lamp through glass. */
export const SIDE_RADIANCE = 1000;
/** How much of the light falling on a body of pigment it sends back up toward the lens (single scattering at a back angle). */
export const SIDE_SCATTER = 0.35;
/** The steep walls' reflectance (water against air or oil near the angle the lamp meets them). */
export const WALL_FRESNEL = 0.03;
/** The walls' slopes spread over this, radians: the blur of the field's normals. */
export const WALL_SPREAD = 0.06;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Poiseuille's profile across the gap: a speck's speed over the depth-averaged speed, at depth z (0 the bottom glass, 1 the top). Its mean over the gap is 1. */
export function gapSpeed(z: number): number {
  const c = clamp01(z);
  return 6 * c * (1 - c);
}

/** The shear across the gap at depth z, per metre the liquid travels: γ̇ t over ū t. Signed: the top half turns flakes the other way. */
export function gapShearPerMetre(z: number): number {
  return 6 * (1 - 2 * clamp01(z)) / GAP_METRES;
}

/** How far the orbit's phase advances for a shear strain γ̇t, aspect r (Jeffery). */
export function jefferyPhase(strain: number, r: number): number {
  return strain * r / (1 + r * r);
}

/** The flake's tilt from flat, radians, at orbit phase ξ: tan θ = r tan ξ, kept continuous through the flip. */
export function jefferyTilt(xi: number, r: number): number {
  return Math.atan2(r * Math.sin(xi), Math.cos(xi));
}

/** The strain a whole Jeffery turn takes, γ̇ T = 2π (r + 1/r): a flake flips twice in it. */
export function jefferyTurnStrain(r: number): number {
  return 2 * Math.PI * (r + 1 / r);
}

/** A flake's settling speed, m/s: Stokes on the sphere of its volume (radius a, aspect r). */
export function settlingSpeed(a: number, r: number, viscosity = WATER_VISCOSITY): number {
  // A disc of radius a and thickness 2 r a holds the volume of a sphere of radius (1.5 r)^(1/3) a.
  const aEq = Math.cbrt(1.5 * r) * a;
  return (2 / 9) * FLAKE_DENSITY_EXCESS * 1000 * G * aEq * aEq / viscosity;
}

/** The camera's magnification for a zoom (the screen's long side shows the plate's 1 / (1.5 zoom), as uvToFluid has it). */
export function lensMagnification(zoom: number): number {
  return SENSOR_METRES * 1.5 * Math.max(1, zoom) / PLATE_METRES;
}

/** Screen pixels per metre of plate, for a screen whose long side is maxRes pixels. */
export function pixelsPerMetre(maxRes: number, zoom: number): number {
  return 1.5 * maxRes * Math.max(1, zoom) / PLATE_METRES;
}

/** The defocus disc's radius on screen, pixels: a point at depth z, the lens focused at zf, at f-number n. */
export function defocusRadiusPx(z: number, zf: number, n: number, zoom: number, maxRes: number): number {
  const m = lensMagnification(zoom);
  const diameter = Math.abs(z - zf) * GAP_METRES * m / (Math.max(0.5, n) * (1 + m));
  return 0.5 * diameter * pixelsPerMetre(maxRes, zoom);
}

/** The Airy core's radius on screen, pixels, at a wavelength. */
export function airyRadiusPx(lambda: number, n: number, zoom: number, maxRes: number): number {
  const m = lensMagnification(zoom);
  return 1.22 * lambda * n * (1 + m) / m * pixelsPerMetre(maxRes, zoom);
}

/**
 * How far a spike shows, pixels: where one arm's line intensity
 * SPIKE_SHARE · E · r_a / (arms · r² · w) falls to SPIKE_FLOOR, for a point
 * of energy E (linear white times pixels²), Airy radius r_a and line width w.
 */
export function spikeReachPx(energy: number, airy: number, width: number, arms = IRIS_BLADES): number {
  if (!(energy > 0) || !(airy > 0)) return 0;
  return Math.min(SPIKE_MAX_PX, Math.sqrt(SPIKE_SHARE * energy * airy / (arms * Math.max(0.7, width) * SPIKE_FLOOR)));
}

/** The side lamp's colour, linear RGB at unit luminance-ish: the hue (degrees) at a lamp gel's saturation. */
export function sideLampColour(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60;
  const s = 0.85;
  const c = s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = 1 - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const lin = (v: number) => {
    const e = v + m;
    return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
  };
  return [lin(r), lin(g), lin(b)];
}

/** Where the side lamp stands: its foot's direction (cos, sin) round the dish from the screen's +x, its distance and its height, metres. */
export function sideLampPlace(angleDeg: number): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), SIDE_DISTANCE, SIDE_DISTANCE * Math.tan(SIDE_ELEVATION)];
}

/**
 * The side lamp's irradiance on the glass at a stage point (metres from the
 * dish's centre), against its irradiance at the centre: the inverse square
 * and the cosine of the slant.
 */
export function sideFalloff(x: number, y: number, angleDeg: number): number {
  const [cx, cy, d, h] = sideLampPlace(angleDeg);
  const at = (px: number, py: number) => {
    const dx = cx * d - px, dy = cy * d - py;
    const dist2 = dx * dx + dy * dy + h * h;
    return h / Math.pow(dist2, 1.5);
  };
  return at(x, y) / at(0, 0);
}

/** The side lamp's direction in the water at the dish's centre (toward the lamp), after the glass bends it by Snell. */
export function sideRayInWater(angleDeg: number): [number, number, number] {
  const [cx, cy] = sideLampPlace(angleDeg);
  const sinAir = Math.cos(SIDE_ELEVATION);
  const sinW = sinAir / N_WATER;
  const cosW = Math.sqrt(1 - sinW * sinW);
  return [cx * sinW, cy * sinW, cosW];
}

/**
 * What a flake of normal n sends to a lens straight above, per unit of the
 * lamp's radiance: the reflectance times the share of its mirror image of
 * the lens that falls on a lamp of angular radius `lampR` in direction `l`
 * (unit, toward the lamp), with the crinkle spreading the mirror.
 */
export function flakeMirror(n: [number, number, number], l: [number, number, number], lampR: number): number {
  // The ray from the lens, reflected: 2 (n·v) n − v with v straight up.
  const nv = n[2];
  const r = [2 * nv * n[0], 2 * nv * n[1], 2 * nv * n[2] - 1];
  const cosB = Math.max(-1, Math.min(1, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]));
  const beta = Math.acos(cosB);
  const spread2 = lampR * lampR + 4 * FLAKE_CRINKLE * FLAKE_CRINKLE;
  return FLAKE_REFLECT * (lampR * lampR / spread2) * Math.exp(-(beta * beta) / (2 * spread2));
}

/** The lens pass runs at all: Glitter or Side Light above nothing. At 0 and 0 the plate is drawn as it always was, to the bit. */
export function glintWanted(glitter: number, sideLight: number): boolean {
  return glitter > 0.001 || sideLight > 0.001;
}

/** How many specks Glitter suspends. */
export function speckCount(glitter: number): number {
  return Math.round(clamp01(glitter) * SPECK_MAX);
}
