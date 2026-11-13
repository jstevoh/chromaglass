/**
 * The ferrofluid labyrinth's period from the magnetic Bond number (PLAN 38d-1).
 *
 * What was reported: held against the owner's ferrofluid photos (the
 * looks-against-references read of 2026-11-12), Ferro Paint's forms span 1.6%
 * of the width where Colored I and II span 5 to 11, and Magnet Garden's 2.8%
 * where the thin-cell film and the labyrinth photo span 6 and 15. The maze's
 * period was a constant, 0.045 of the plate (MAZE_PERIOD), the same at every
 * field and every gap, divided down by Maze Detail; the looks could only be
 * finer than it, never wider.
 *
 * What sets it in a real dish. A ferrofluid layer filling a gap h, in a field
 * normal to the glass, is a sheet of parallel dipoles, and parallel dipoles
 * repel; the interface's tension σ wants one round pool. Straight stripes of
 * period λ, half full, cost per area of the plate
 *
 *   E/A = 2σh/λ − (μ0/2) h Σₙ |Mₙ|² (1 − f(kₙh)),   f(q) = (1 − e^−q)/q,
 *
 * the first the two interfaces a period, each σ times the gap tall; the
 * second the magnetostatic energy a layer of the stripes' Fourier
 * magnetisation Mₙ (at kₙ = 2πn/λ) saves against one pool, f being the
 * demagnetising factor of a slab modulated at kh. For kh small the sum is a
 * logarithm, and the minimum is at
 *
 *   λ/h = 1.906 · exp(4π / N) − 0.5,   N = μ0 M² h / σ,
 *
 * the magnetic Bond number (Langer, Goldstein and Jackson 1992 give the same
 * exponential law in their units; the constants here are this energy's own,
 * minimised numerically while writing this: within 4% of the full sum for N
 * from 2 to 20, the range the dish uses). So the stripes widen exponentially
 * as the field falls toward the onset, and a pool under the critical field
 * stays a pool: the period runs off the plate (WIDEST). That is the physics
 * the looks lacked: in the photos the field is gentle and the cells wide.
 *
 * M is the layer's magnetisation in the coil's field B0. The field inside a
 * thin layer normal to it is the applied one less the layer's own
 * magnetisation, H = B0/μ0 − M, and M is the liquid's Langevin curve of that
 * inner field, M = Ms L(3χH/Ms): EFH1, as the spikes take it
 * (wgsl/spikes.ts). σ is the spikes' too, from SPIKE_PITCH's capillary
 * length (√(Δρ g σ) = Δρ g l_c, 3.3 mN/m), so the domes and the maze are the
 * one interface. h is the dish's rest gap (DISH_GAP_METRES, 2 mm).
 *
 * The coil. Labyrinth was already the coil's field (the frame loop plays it
 * with the music, LiquidVisualizer's mazeKick, and the comment there says a
 * stronger field draws a finer maze, after Zakinyan); now the period follows
 * it (as the maze feels it, mazeFelt). COIL_TESLA is its field at Labyrinth
 * 1: 7.5 mT, where the period is 0.042 of the plate, the old constant's
 * maze, so the top of the dial is today's fine labyrinth and `npm run maze`
 * measures the same maze it did. Down the dial it widens: Ferro Paint's 0.65
 * (4.9 mT) is N 5.9, 0.15 of the plate; Magnet Garden's 0.58 (4.35 mT) N
 * 4.7, 0.27; under about 0.47 (3.5 mT) the layer is past the critical Bond
 * number and the pool stays a pool. Applied fields of a few millitesla are
 * what thin-cell labyrinth experiments use, and a real layer under this σ
 * stands into spikes near 4 mT (SPIKE_ONSET_REAL), the same neighbourhood.
 *
 * The shortcut kept, named: the solver's maze is still Ohta–Kawasaki, a
 * screened repulsion α/(k² + m²) set so its fastest-growing wavelength is
 * this period, not the dipoles' own kernel above; and one period for the
 * whole plate from the coil, not one at each point from the field there (the
 * hand's magnet is still finer only through its stronger push). PLAN 38d
 * keeps both.
 */

import { FERRO_MS_TESLA, FERRO_CHI, FERRO_DENSITY, WATER_DENSITY, SPIKE_PITCH } from '../wgsl/spikes';
import { DISH_METRES, DISH_GAP_METRES } from '../../lib/turntable';

const MU0 = 4e-7 * Math.PI;
/** The coil's field at Labyrinth 1, in tesla. */
export const COIL_TESLA = 0.0075;
/** The widest period, in plate widths: past it the plate holds under one stripe, a pool. */
export const MAZE_WIDEST = 1;
/** σ of the ferrofluid against the water, N/m: the spikes' capillary length, l_c = SPIKE_PITCH / 2π of the dish. */
export const MAZE_SIGMA = (FERRO_DENSITY - WATER_DENSITY) * 9.81 * (SPIKE_PITCH * DISH_METRES / (2 * Math.PI)) ** 2;

/*
  How long the maze takes to feel a change in the coil, in seconds. The
  frame loop plays the coil with the music (LiquidVisualizer's mazeKick: it
  breathes with loudness and steps up on each kick, slewed over 0.8 s), and
  the period goes exponentially with the field: a kick from Magnet Garden's
  field to the top of the dial would ask for a period seven times finer, and
  the repulsion that sets it (α ∝ k⁴ in fluid.ts) two thousand times
  stronger, on every beat. A real labyrinth does not re-space itself on a
  beat: its stripes move by the Hele-Shaw flow, over seconds (the lab's drops
  turn to starfish in two and to a maze in eight, MAZE_GAIN), so what sets
  their spacing is the field's force averaged over that time, and the force
  goes as M², which in this range is the field squared. So the period is read
  from the root of the field's mean square over MAZE_SETTLE, the time a
  starfish takes to branch. The music still plays the maze's push at once
  (α's own 0.5 + 0.5 field, and the hand's), as before.
*/
export const MAZE_SETTLE = 4;

/** The coil's field as the maze feels it: the root mean square of the field over MAZE_SETTLE, stepped by seconds; from nought it is the field at once. */
export function mazeFelt(felt: number, field: number, seconds: number): number {
  if (!(felt > 0)) return field;
  const k = 1 - Math.exp(-Math.max(0, seconds) / MAZE_SETTLE);
  return Math.sqrt(felt * felt + (field * field - felt * felt) * k);
}

function langevin(x: number): number { return x < 1e-3 ? x / 3 : 1 / Math.tanh(x) - 1 / x; }

/** The layer's magnetisation (A/m) in an applied normal field B0 (T): M = Ms L(3χ(B0/μ0 − M)/Ms), by bisection. */
export function layerMagnetisation(b0: number): number {
  const ms = FERRO_MS_TESLA / MU0, h0 = b0 / MU0;
  let lo = 0, hi = Math.min(ms, h0);
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (ms * langevin(3 * FERRO_CHI * (h0 - m) / ms) > m) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** The magnetic Bond number μ0 M² h / σ of the dish's layer under the coil at this Labyrinth (0–1). */
export function mazeBond(field: number): number {
  const m = layerMagnetisation(Math.max(0, field) * COIL_TESLA);
  return MU0 * m * m * DISH_GAP_METRES / MAZE_SIGMA;
}

/** The labyrinth's period in plate widths at this Labyrinth (0–1), from the Bond number; MAZE_WIDEST at most. */
export function mazePeriodOf(field: number): number {
  const nb = mazeBond(field);
  if (!(nb > 4 * Math.PI / 50)) return MAZE_WIDEST;
  return Math.min(MAZE_WIDEST, (DISH_GAP_METRES / DISH_METRES) * (1.906 * Math.exp(4 * Math.PI / nb) - 0.5));
}
