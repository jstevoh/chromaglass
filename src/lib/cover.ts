/**
 * How much liquid is under the cover glass, and how high that holds the glass
 * (PLAN 38r-5).
 *
 * The owner asked, 2026-10-31: "Do we ever really figure out how much liquid
 * is on the plate and adjust liquid behavior based on that?" We did not. The
 * gap was a constant 2 mm, a pour was a source that left over the open rim,
 * and nothing anywhere totalled the liquid. This file is that total, and the
 * physics that turns it into the gap every other part of the solver reads.
 *
 * **A flat glass on liquid has no height of its own.** Its weight w·g (a 2 mm
 * float glass is 5 kg/m², 49 Pa) is carried by the liquid's pressure, and by
 * Stefan's law that pressure squeezes any film thinner for ever. What stops
 * it is the meniscus pinned at the cover's square edge. By Gibbs's inequality
 * a contact line on a sharp edge stays put while the meniscus swings through
 * the edge's angle, so the liquid can bulge out past the edge until its angle
 * to the glass passes θ + 90°, and a meniscus of curvature 2 sinθ / h holds a
 * pressure up to
 *
 *     P_hold = 2σ sinθ / h.
 *
 * The carriers are all aqueous (water to glycerine-water), σ ≈ 0.072 to
 * 0.065 N/m, and on an oiled show glass θ ≈ 60°, so at 2 mm the edge holds
 * 62 Pa against the default glass's 49: the default plate keeps today's 2 mm.
 * Above h_hold = 2σ sinθ / (w g) (about 2.5 mm of water under the default
 * glass) the meniscus cannot hold, and the glass sinks at Stefan's rate,
 *
 *     dh/dt = −(2/3) h³ (P − P_hold) / (μ R²),
 *
 * the liquid leaving into a bead at the rim. That is fast: about 50 ms for
 * water and about a second for the thick carrier, not the "seconds to
 * minutes" first guessed.
 *
 * **The bead.** What the glass pushes out sits against its edge on the base
 * glass as a bead whose section is about a quarter disc of the capillary
 * length l_c = √(σ/ρg): 2πR · (π/4) l_c², about 3.6 mL of water round a
 * 0.1 m cover. Past that it runs off the dish and is gone. A hand lifting
 * the glass harder than it weighs (P < 0) draws the bead back in at the same
 * Stefan rate until it is empty.
 *
 * **The puddle (air edge).** Once the bead is empty and a lift beats the
 * gap's capillary suction (`P + 2σ cosθ / h < 0`), or when less than a full
 * film sits under the glass (`wet = plate / h < A`), air comes in from the
 * rim and the liquid forms a puddle of area `wet = plate / h` (`h · wet = plate`
 * always). Over the puddle, weight and hand spread across `wet` (`P · A / wet`)
 * together with the meniscus suction `2σ cosθ / h` drive Stefan flow at
 *
 *     dh/dt = −(2/3) h³ (P · A / wet + 2σ cosθ / h) / (μ · wet / π),
 *
 * integrated by step-size-free RK4 substepping until it hits the rim
 * (`wet = A`, then pinned), the floor, or the ceiling (`COVER_TOP_M`).
 * Turning Liquid down wicks the bead first and then shrinks `wet` at fixed `h`
 * down to 1 mL; adding liquid widens a puddle at fixed `h` to the rim, then
 * lifts the glass.
 *
 * Plain functions over a small state, as the frame loop wants (CLAUDE.md
 * "No ceremony in the frame"). The solver owns the state
 * (gpu/fluid/cover.ts); `npm run gap` checks every formula here.
 */

import { DISH_METRES, DISH_GAP_METRES, DISH_GAP_FIELD_METRES, DISH_GAP_RANGE } from './turntable';
import { COVER_KG_M2 } from './plateRock';

/** The cover glass: a disc as wide as the dish, R = 0.1 m. */
export const COVER_RADIUS = DISH_METRES / 2;
export const COVER_AREA = Math.PI * COVER_RADIUS * COVER_RADIUS;
/** The liquid that fills the cover at today's 2 mm, in mL: the Liquid dial's default (62.8 mL). */
export const COVER_FULL_ML = COVER_AREA * DISH_GAP_METRES * 1e6;
/** A 2 mm float glass, 2500 kg/m³ × 2 mm = 5 kg/m², in grams: the Cover weight dial's default (157 g). */
export const COVER_GLASS_G = COVER_KG_M2 * COVER_AREA * 1000;
/** The dials' ranges: from 1 mL (a tiny puddle on the floor) to past what any cover holds; a weightless cover to a heavy hand-made one. */
export const LIQUID_ML_RANGE = [1, 150] as const;
export const COVER_G_RANGE = [0, 1000] as const;
/** Water on an oiled glass: the meniscus angle at the pinned edge. */
export const CONTACT_ANGLE = Math.PI / 3;
export const GRAVITY = 9.81;
const DENSITY = 1000;
/** The thinnest and thickest the solver's gap can be, in metres (lib/turntable.ts DISH_GAP_RANGE). */
export const COVER_FLOOR_M = DISH_GAP_RANGE[0] * DISH_GAP_FIELD_METRES;
export const COVER_TOP_M = DISH_GAP_RANGE[1] * DISH_GAP_FIELD_METRES;
/**
 * A two-finger pinch's hand on the glass, in pascals at its fullest (1 = all
 * the way): 1 kPa over the cover is 31 N, a firm push of a flat hand, and the
 * same pulled up lifts any glass on the dial off its liquid.
 */
export const HAND_PA = 1000;

/**
 * The carrier's surface tension from its kinematic viscosity: glycerine-water
 * falls from water's 0.072 N/m (1 mm²/s) to glycerine's 0.063 (about
 * 1200 mm²/s) close to linearly in log ν, 2.8 mN/m a decade: 0.0698 at half
 * glycerine (6 mm²/s, tabulated 0.070), 0.0682 at 70% (22 mm²/s, 0.0675),
 * 0.0664 at 85% (100 mm²/s, 0.0655). `npm run gap` holds it to those.
 */
export function carrierTension(nu: number): number {
  return Math.max(0.063, 0.072 - 0.0028 * Math.log10(Math.max(1e-6, nu) / 1e-6));
}

/** What the meniscus pinned at the cover's edge holds at gap h: 2σ sinθ / h. */
export function holdPressure(sigma: number, h: number): number {
  return (2 * sigma * Math.sin(CONTACT_ANGLE)) / Math.max(1e-9, h);
}

/** The glass's weight as a pressure on the liquid, w g / A, for a cover of `grams`. */
export function weightPressure(grams: number): number {
  return (Math.max(0, grams) / 1000) * GRAVITY / COVER_AREA;
}

/** The tallest gap the edge holds against pressure P: 2σ sinθ / P (Infinity for no weight). */
export function holdGap(sigma: number, pressure: number): number {
  return pressure > 0 ? (2 * sigma * Math.sin(CONTACT_ANGLE)) / pressure : Infinity;
}

/** The capillary length √(σ/ρg). */
export function capillaryLength(sigma: number): number {
  return Math.sqrt(sigma / (DENSITY * GRAVITY));
}

/** The bead the rim keeps before liquid runs off: a quarter disc of l_c round the edge, 2πR (π/4) l_c², in m³. */
export function beadCapacity(sigma: number): number {
  const lc = capillaryLength(sigma);
  return 2 * Math.PI * COVER_RADIUS * (Math.PI / 4) * lc * lc;
}

/**
 * Stefan's settle against the held edge, solved exactly for a steady pressure.
 *
 * dh/dt = −k h² (P h − c), with k = 2/(3 μ R²) and c = 2σ sinθ. Separated,
 * F(h) = 1/(c h) + (P/c²) ln(P − c/h) falls by k t, and F rises with h on
 * (c/P, h₀], so h(t) is found by bisection on that interval. No step size
 * enters: the frame's dt can be anything and the glass never passes h_hold,
 * which is where a stepped version overshoots at the thin carrier's 50 ms.
 * Returns h after `t` seconds from `h0`; h0 if the edge holds.
 */
export function stefanSettle(h0: number, pressure: number, sigma: number, mu: number, t: number): number {
  const c = 2 * sigma * Math.sin(CONTACT_ANGLE);
  if (!(pressure > 0) || !(t > 0) || pressure * h0 <= c) return h0;
  const k = 2 / (3 * Math.max(1e-9, mu) * COVER_RADIUS * COVER_RADIUS);
  const F = (h: number) => 1 / (c * h) + (pressure / (c * c)) * Math.log(pressure - c / h);
  const goal = F(h0) - k * t;
  let lo = c / pressure, hi = h0;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    // F′(h) = 1/(h² (P h − c)) > 0 on the interval, and F → −∞ at h_hold:
    // a mid whose F is above the goal is still too thick.
    if (F(mid) > goal) hi = mid; else lo = mid;
  }
  return Math.max(c / pressure, 0.5 * (lo + hi));
}

/** A hand lifting the glass draws the bead in: 1/h² falls by (4/3)|P| t/(μR²). Returns the gap after t, unbounded by the bead. */
export function stefanLift(h0: number, pressure: number, mu: number, t: number): number {
  if (!(pressure < 0) || !(t > 0)) return h0;
  const inv = 1 / (h0 * h0) - (4 / 3) * -pressure * t / (Math.max(1e-9, mu) * COVER_RADIUS * COVER_RADIUS);
  return inv > 0 ? 1 / Math.sqrt(inv) : Infinity;
}

/**
 * The liquid's ledger, in m³: under the glass, in the bead at the rim, run off
 * the dish, and everything ever put in (dialled and poured). `h` is the gap
 * and `wet` is the wetted area under the glass (`COVER_AREA` on a full film),
 * keeping `h · wet = plate` always. The check holds plate + bead + off to
 * the ledger's `added`.
 */
export interface CoverState {
  plate: number;
  bead: number;
  off: number;
  added: number;
  h: number;
  wet: number;
  /** The carrier's σ at the last step, for the bead's size (water's until a step has run). */
  sigma: number;
}

export function coverNew(ml: number): CoverState {
  const v = Math.max(0, ml) * 1e-6;
  const s: CoverState = { plate: v, bead: 0, off: 0, added: v, h: 0, wet: 0, sigma: 0.072 };
  return coverSettleTop(s);
}

/**
 * The gap the plate's volume gives, between the solver's floor and top, and
 * the wetted area `wet = plate / h` (`COVER_AREA` once at or past a full
 * floor film). Over the top (a weightless glass on more than 125 mL) the rest
 * overflows: the solver's gap field has a ceiling (4 mm, DISH_GAP_RANGE) that
 * a real glass floating on a deep pool does not, so this is the one place the
 * ledger leaves nature; it is written in as such (PLAN 38r-5).
 */
function coverSettleTop(s: CoverState): CoverState {
  const top = COVER_AREA * COVER_TOP_M;
  if (s.plate > top) { coverSpill(s, s.plate - top, beadCapacity(s.sigma)); }
  if (s.plate >= COVER_AREA * COVER_FLOOR_M) {
    s.h = s.plate / COVER_AREA;
    s.wet = COVER_AREA;
  } else {
    s.h = COVER_FLOOR_M;
    s.wet = s.plate > 0 ? s.plate / COVER_FLOOR_M : 0;
  }
  return s;
}

/** Liquid leaving under the glass's edge: into the bead up to its capacity, the rest off the dish. */
function coverSpill(s: CoverState, v: number, cap: number): void {
  s.plate -= v;
  const room = Math.max(0, cap - s.bead);
  const into = Math.min(room, v);
  s.bead += into;
  s.off += v - into;
}

/**
 * Liquid put on the plate (a pour, or the Liquid dial turned up) or taken off
 * it (the dial turned down: wicked off at the rim, so out of the bead first,
 * then from under the glass down to 1 mL, shrinking `wet` at fixed `h`). m³.
 */
export function coverAdd(s: CoverState, v: number): CoverState {
  if (v >= 0) {
    s.plate += v;
    s.added += v;
    if (s.h > 0 && s.plate <= COVER_AREA * s.h) {
      s.wet = s.plate / s.h;
      return s;
    }
    return coverSettleTop(s);
  }
  let take = -v;
  const fromBead = Math.min(s.bead, take);
  s.bead -= fromBead; take -= fromBead;
  const minPlate = LIQUID_ML_RANGE[0] * 1e-6;
  const fromPlate = Math.min(Math.max(0, s.plate - minPlate), take);
  s.plate -= fromPlate;
  s.added -= fromBead + fromPlate;
  if (s.h > 0) {
    s.wet = Math.min(COVER_AREA, s.plate / s.h);
  }
  return s;
}

/** What one step is told: the carrier, the glass, and the hand on it (−1 lifting to 1 pressing). */
export interface CoverInputs {
  nu: number;
  grams: number;
  hand: number;
}

/**
 * One step of the glass on its liquid, `dt` seconds. On a full film, pressing
 * past what the edge holds settles by Stefan into the bead and off the dish;
 * lifting draws the bead back in until empty, then air enters once
 * `P + 2σ cosθ / h < 0`. On a puddle (or past bead empty), the area-scaled
 * pressure and capillary suction evolve by step-size-free RK4 until hitting
 * the rim (`wet = A`, then pinned), the floor, or `COVER_TOP_M`.
 * Returns the gap in metres.
 */
function stepPuddle(s: CoverState, P: number, sigma: number, mu: number, dt: number): number {
  const V = s.plate;
  if (!(V > 0) || !(dt > 0)) return s.h;
  const hMin = Math.max(COVER_FLOOR_M, V / COVER_AREA);
  const hMax = COVER_TOP_M;
  const rate = (hh: number): number => {
    const hSafe = Math.max(COVER_FLOOR_M * 0.25, Math.min(COVER_TOP_M * 1.25, hh));
    const wet = Math.min(COVER_AREA, V / hSafe);
    const suck = (2 * sigma * Math.cos(CONTACT_ANGLE)) / hSafe;
    return -((2 / 3) * hSafe * hSafe * hSafe * ((P * COVER_AREA) / wet + suck)) / ((mu * wet) / Math.PI);
  };
  let h = s.h;
  let rem = dt;
  while (rem > 0) {
    const k1 = rate(h);
    if (k1 === 0) break;
    if (k1 < 0 && h <= hMin) break;
    if (k1 > 0 && h >= hMax) break;
    let dtSub = Math.min(rem, (0.002 * h) / Math.max(1e-30, Math.abs(k1)));
    let hNext = h;
    for (let shrink = 0; shrink < 8; shrink++) {
      const k2 = rate(h + 0.5 * dtSub * k1);
      const k3 = rate(h + 0.5 * dtSub * k2);
      const k4 = rate(h + dtSub * k3);
      hNext = h + (dtSub * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
      if (Math.abs(hNext - h) <= 0.005 * h && Math.abs(k4) <= 1.2 * Math.abs(k1) + 1e-18) break;
      dtSub *= 0.5;
    }
    if (hNext <= hMin && k1 < 0) {
      const frac = h > hMin && h !== hNext ? Math.max(0, Math.min(1, (h - hMin) / (h - hNext))) : 0;
      const remAfter = Math.max(0, rem - dtSub * frac);
      s.h = hMin;
      if (V >= COVER_AREA * COVER_FLOOR_M) {
        s.wet = COVER_AREA;
        if (remAfter > 0 && P > holdPressure(sigma, hMin) && hMin > COVER_FLOOR_M) {
          const settled = Math.max(COVER_FLOOR_M, stefanSettle(hMin, P, sigma, mu, remAfter));
          coverSpill(s, (hMin - settled) * COVER_AREA, beadCapacity(sigma));
          return coverSettleTop(s).h;
        }
      } else {
        s.wet = V / hMin;
      }
      return s.h;
    }
    if (hNext >= hMax && k1 > 0) {
      s.h = hMax;
      s.wet = Math.min(COVER_AREA, V / hMax);
      return s.h;
    }
    h = hNext;
    rem -= dtSub;
  }
  s.h = h;
  s.wet = V / h >= COVER_AREA * (1 - 1e-12) ? COVER_AREA : V / h;
  return s.h;
}

export function coverStep(s: CoverState, dt: number, k: CoverInputs): number {
  const sigma = carrierTension(k.nu);
  s.sigma = sigma;
  const mu = DENSITY * Math.max(1e-7, k.nu);
  const hand = Math.max(-1, Math.min(1, Number.isFinite(k.hand) ? k.hand : 0));
  const P = weightPressure(k.grams) + hand * HAND_PA;
  if (!(dt > 0) || !(s.plate > 0)) {
    if (s.plate <= 0) { s.h = COVER_FLOOR_M; s.wet = 0; }
    return s.h;
  }
  const h0 = s.h;
  if (s.wet >= COVER_AREA * (1 - 1e-12)) {
    if (P > holdPressure(sigma, h0) && h0 > COVER_FLOOR_M) {
      const h = Math.max(COVER_FLOOR_M, stefanSettle(h0, P, sigma, mu, dt));
      coverSpill(s, (h0 - h) * COVER_AREA, beadCapacity(sigma));
      return coverSettleTop(s).h;
    }
    if (P < 0 && s.bead > 0 && h0 < COVER_TOP_M) {
      const h = stefanLift(h0, P, mu, dt);
      const fullNeed = s.bead / COVER_AREA;
      if (h >= h0 + fullNeed) {
        const hEnd = h0 + fullNeed;
        const rate = (4 / 3) * (-P) / (Math.max(1e-9, mu) * COVER_RADIUS * COVER_RADIUS);
        const tBead = Math.min(dt, (1 / (h0 * h0) - 1 / (hEnd * hEnd)) / rate);
        s.bead = 0;
        s.plate += fullNeed * COVER_AREA;
        coverSettleTop(s);
        const rem = dt - tBead;
        return rem > 0 && s.h < COVER_TOP_M ? coverStep(s, rem, k) : s.h;
      }
      // Drawn in whole once the lift outruns it, so an emptied bead is 0, not a rounding's 1e-22.
      const v = (h - h0) * COVER_AREA;
      s.bead -= v;
      s.plate += v;
      return coverSettleTop(s).h;
    }
    const suck = (2 * sigma * Math.cos(CONTACT_ANGLE)) / Math.max(1e-9, h0);
    if (s.bead === 0 && P + suck < 0 && h0 < COVER_TOP_M) {
      return stepPuddle(s, P, sigma, mu, dt);
    }
    return s.h;
  }
  return stepPuddle(s, P, sigma, mu, dt);
}
