/*
  A VU meter's needle (PLAN 35f). The standard (ANSI C16.5, IEC 60268-17)
  asks for a needle that reaches 99% of a steady tone's reading in 300 ms and
  overshoots it by 1 to 1.5%, because it is a moving coil: a mass on a spring
  with damping, driven by the signal. That is a second-order system. A damping
  ratio of 0.81 overshoots 1.3%, and the step response of that system first
  reaches 0.99 at 4.027 / omega_n, so omega_n = 4.027 / 0.3 s = 13.4 rad/s.

  `stepNeedle` uses the exact solution of the linear system over the step
  (the target held constant across it), not an integrator: an Euler step adds
  damping of its own, which measured here took the overshoot from 1.3% to 0.8%
  and the rise from 300 ms to 208, and a long frame (a tab coming back) cannot
  make the exact solution unstable. The reading it is given is the plate's own
  volume, 0 to 100 (lib/soundLevels.ts, 85 at its loud end), not a decibel
  level of anything: the dial is marked in that scale, with the red zone where
  its range runs out.
*/

export const VU_ZETA = 0.81;
/** Seconds to 99% of a steady tone. */
export const VU_RISE_S = 0.3;
/** The unit-frequency step response of a damped second-order system first reaches 0.99 here. */
const RISE_UNIT = 4.02664;
export const VU_OMEGA = RISE_UNIT / VU_RISE_S;
export const VU_FULL = 100;
export const VU_RED_FROM = 85;
/** The needle's travel, degrees either side of straight up. */
export const VU_SWEEP_DEG = 42;

export interface Needle { x: number; v: number }
export const needleAtRest = (): Needle => ({ x: 0, v: 0 });

/** Advance the needle `dt` seconds toward `target` (0 to VU_FULL). Returns a new state. */
export function stepNeedle(n: Needle, target: number, dt: number): Needle {
  const t = Math.max(0, Math.min(VU_FULL, Number.isFinite(target) ? target : 0)) / VU_FULL;
  const tau = Math.max(0, Math.min(2, Number.isFinite(dt) ? dt : 0));
  const sigma = VU_ZETA * VU_OMEGA;
  const wd = VU_OMEGA * Math.sqrt(1 - VU_ZETA * VU_ZETA);
  const e = n.x - t;
  const A = e, B = (n.v + sigma * e) / wd;
  const decay = Math.exp(-sigma * tau), c = Math.cos(wd * tau), s = Math.sin(wd * tau);
  let x = t + decay * (A * c + B * s);
  let v = -sigma * decay * (A * c + B * s) + decay * wd * (-A * s + B * c);
  // The pin at the left stop: a needle cannot go below zero.
  if (x < 0) { x = 0; v = Math.max(0, v); }
  return { x, v };
}

/** The needle's angle for a deflection `x` (0 to about 1), degrees from straight up. */
export const needleDeg = (x: number): number => (Math.max(0, Math.min(1.08, x)) - 0.5) * 2 * VU_SWEEP_DEG;
