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
