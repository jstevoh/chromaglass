/**
 * Plate Rock's hand: a damped spring the kicks shove, and the slow sway
 * between them (PLAN 27a). The frame loop drives it and the plate takes its
 * swing as a tilt (fluid.ts ROCK_FALL); `npm run rides` drives the same code.
 *
 * The slider is how far the hand tips the glass and is applied once, by
 * `rockSwing`. It was applied twice (the kick's shove × R, then the swing
 * × R), so the dial went as its square: the default 0.45 rocked at a fifth
 * of full. The shove is half what it was so the default's swing stays where
 * it was (0.45 × 7 against 0.45² × 14).
 */
export type RockSpring = { x: number; y: number; vx: number; vy: number; phase: number };

/** The kick's shove before the slider: a full kick swings the spring about ±1.1. */
export const ROCK_SHOVE = 7;
/** The sway between kicks, before the slider: ±0.12 of the swing (it was 0.35; below). */
export const ROCK_SWAY = 0.12;
/*
  How fast the sway wanders, in the noise's units a second. It was 0.11 (and
  0.09 on y), a lean held for five or ten seconds at a time, which through
  the old current moved nothing. As a tilt on a thin gap a lean that long
  slides the colour steadily to one side in silence: held at its far end for
  two seconds at the default Plate Rock it moved the colour 0.52, two and a
  half times what the kicks themselves move (`npm run rides`). A hand holding
  a glass wobbles about every second or two, and the colour it tips one way
  comes back the next, so the sway wanders five times as fast. That alone
  still moved it 0.185, nine tenths of the kicks' 0.205: between kicks the
  hand all but holds the glass still and the kicks are the rock, so the sway
  is a third of what it was.
*/
export const ROCK_SWAY_RATE = 0.55;

/** The sway's noise (−1 to 1 each way) at `t` seconds, for rockSwing. */
export function swayAt(noise: (x: number, y: number) => number, t: number): [number, number] {
  return [noise(t * ROCK_SWAY_RATE, 3.7), noise(7.1, t * ROCK_SWAY_RATE * 0.82)];
}
/** The swing to the plate's tilt (sinθ) the solver takes: × the swing × (dye − mean) on the old plate's current, the tilt itself on a thin gap. */
export const CUR_ROCK = 0.2;

/** A kick: the hand shoves the glass, each kick a different way round. */
export function kickRock(rock: RockSpring, bass01: number, accent: number): void {
  rock.vx += Math.cos(rock.phase) * bass01 * ROCK_SHOVE * accent;
  rock.vy += Math.sin(rock.phase) * bass01 * ROCK_SHOVE * accent;
  rock.phase += 2.4;
}

/** One step of `dt` seconds: a 0.9 Hz spring, damped to a fifth. */
export function stepRock(rock: RockSpring, dt: number): void {
  const w = 2 * Math.PI * 0.9, z = 0.22;
  const ax = -w * w * rock.x - 2 * z * w * rock.vx;
  const ay = -w * w * rock.y - 2 * z * w * rock.vy;
  rock.vx += ax * dt; rock.vy += ay * dt;
  rock.x += rock.vx * dt; rock.y += rock.vy * dt;
}

/** The swing the plate takes, for the slider `R` and the sway's noise (−1 to 1 each way). */
export function rockSwing(rock: RockSpring, R: number, swayX: number, swayY: number): [number, number] {
  return [(rock.x + swayX * ROCK_SWAY) * R, (rock.y + swayY * ROCK_SWAY) * R];
}

/*
  The cover glass (PLAN 27a-1). The tilt above moves only the colour that is
  heavier than the plate's mean, so on a look whose colour is spread evenly a
  rock moved almost nothing (the Mac's controls run on #305: Plate Rock
  visible on 7 looks of 23, and "nothing" on the even ones, Boiling Point,
  Crowd Plate, Red Cabbage, Clock Glass). That is the right answer for the
  weight, and not the whole of what a hand rocking a clock glass shows.

  The top glass is not fixed to the bottom one. It rides on the liquid film,
  nested in the bottom glass's curve, and tipping the pair makes it slide
  downhill on that film until the curve (or the bottom glass's rim) stops it,
  then back when the hand tips the other way. A glass sliding over a film
  drags it with a shear, linear across the gap, so the liquid's column goes
  at half the glass's speed (Couette; it is what Glass Smear already is in
  hsPrep), and everything in it, colour spread evenly or not, goes with it:
  the picture sloshes with the hand.

  The glass is a damped pendulum in the bottom glass's bowl:

      dv/dt = g sinθ − (g/R_c) x − v/τ,     τ = m_A h / μ

  m_A the cover's mass per area (2 mm of glass, 5 kg/m²), R_c the bowl's
  radius of curvature, and τ the film's shear drag
  on it, which the liquid's viscosity sets: 1.4 s on the default light oil
  in the 6 mm middle, so the glass swings a few times before it settles, and
  three hundredths of a second in glycerine, so it creeps. It slides only as
  far as the gap between the two glasses' rims lets it (COVER_ROOM), where
  it stops dead: a glass against glass does not bounce.

  It moves the liquid in real seconds, not the plate's: the slide is laid in
  m/s and fluid.ts turns it into the flow's units with the step's seconds
  (as a Blow's breath), so a slow look's picture sloshes as far as a fast
  one's when the same hand rocks it.
*/
export type CoverGlass = { x: number; y: number; vx: number; vy: number };
import { DISH_METRES, DISH_REST_GAP, thicknessViscosity } from './turntable';
/** The cover's mass per area, kg/m²: 2 mm of glass at 2,500 kg/m³. */
export const COVER_KG_M2 = 5;
/*
  The bottom glass's radius of curvature, m, and how far the cover can slide
  before its rim meets the bottom glass's: a 20 cm bowl 6½ cm deep (R_c
  0.11), with a 12 cm cover in it (4 cm each way). The cover swings in it at
  √(g/R_c), 1.5 Hz, and lightly damped (on the default oil a swing falls to a
  third in 2.8 s, four swings), so how far a rock drives it is mostly how close the hand's
  0.9 Hz is to that. In a shallow clock glass it is close and the cover
  rings out to the rim on any rock at all: a 20 cm glass 3 cm deep (0.18,
  1.2 Hz) with 3 cm of room drove it there from Plate Rock 0.2 on, and on
  an evenly coloured plate in the lab (`npm run rides`) 0.2 slid the
  picture 9.4 cells and the default 0.45 as far, so the dial did nothing
  past its first fifth. A deeper bowl both holds the cover more firmly
  (R_c sinθ, two fifths less far for a tilt) and swings it further from the
  hand, so the dial reaches the rim only near its top: 3.7 cells at 0.2,
  8.7 at the default, 13.5 at full, each within an eighth of where the
  glass's slide says the liquid should be. A bowl that deep is a
  dish for a liquid show rather than a watch glass, which is what the
  projectionist would pick for a cover that answers the hand.
*/
export const BOWL_RADIUS = 0.11;
export const COVER_ROOM = 0.04;
/*
  The plate's sinθ as the solver takes it, from the hold's tilt (the swing ×
  HOLD_TILT, and the phone's) and the rock's swing: the hold × 10 and the
  rock × CUR_ROCK (fluid.ts takes both; LiquidVisualizer's step). The cover
  is tipped by the same, and `npm run rides` drives it through this too.
*/
export const HOLD_TILT = 0.004;
export function plateSin(hold: number, swing: number): number {
  return hold * 10 + swing * CUR_ROCK;
}
const G = 9.81;
/** The film's shear drag on the cover, 1/τ (per second), for the look's Thickness, at the plate's rest gap (6 mm in the middle). */
export function coverDrag(thickness: number, density = 1000): number {
  return (density * thicknessViscosity(thickness)) / (COVER_KG_M2 * DISH_REST_GAP * DISH_METRES);
}
/**
 * One step of `dt` seconds: the plate tipped by `tiltX`, `tiltY` (the sinθ
 * the solver takes, plateSin) and the film's drag `drag` (coverDrag).
 * The drag is taken implicitly, so glycerine's 30 per second is as steady
 * as the oil's 0.7 at any step.
 */
export function stepCover(c: CoverGlass, tiltX: number, tiltY: number, drag: number, dt: number): void {
  const w2 = G / BOWL_RADIUS;
  c.vx = (c.vx + dt * (G * tiltX - w2 * c.x)) / (1 + dt * drag);
  c.vy = (c.vy + dt * (G * tiltY - w2 * c.y)) / (1 + dt * drag);
  c.x += c.vx * dt; c.y += c.vy * dt;
  const r = Math.hypot(c.x, c.y);
  if (r > COVER_ROOM) {
    // Against the rim: held there, and what was going outward stops.
    const nx = c.x / r, ny = c.y / r;
    c.x = nx * COVER_ROOM; c.y = ny * COVER_ROOM;
    const out = c.vx * nx + c.vy * ny;
    if (out > 0) { c.vx -= out * nx; c.vy -= out * ny; }
  }
}
