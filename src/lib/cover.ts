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
 * Stefan rate until it is empty; past that the air comes in, which is the
 * air edge (38r-12, the owner's pick, its own PR).
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
/** The dials' ranges: from the gap's floor (a full film at the solver's thinnest) to past what any cover holds; a weightless cover to a heavy hand-made one. */
export const LIQUID_ML_RANGE = [Math.ceil(COVER_AREA * DISH_GAP_RANGE[0] * DISH_GAP_FIELD_METRES * 1e6), 150] as const;
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
 * The carrier's surface tension from its kinematic viscosity: 0.072 N/m for
 * water (1 mm²/s), falling to 0.065 for the thick glycerine-water carriers
 * (1000 mm²/s), on log ν, as glycerine-water does to within a few percent.
 */
export function carrierTension(nu: number): number {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(1e-6, nu) / 1e-6) / 3));
  return 0.072 - 0.007 * t;
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
 * the dish, and everything ever put in (dialled and poured). `h` is the gap,
 * V/A while the liquid fills the cover. The check holds plate + bead + off to
 * the ledger's `added`.
 */
export interface CoverState {
  plate: number;
  bead: number;
  off: number;
  added: number;
  h: number;
}

export function coverNew(ml: number): CoverState {
  const v = Math.max(0, ml) * 1e-6;
  const s = { plate: v, bead: 0, off: 0, added: v, h: 0 };
  return coverSettleTop(s);
}

/**
 * The gap the plate's volume gives, between the solver's floor and top. Over
 * the top (a weightless glass on more than 125 mL) the rest overflows: the
 * solver's gap field has a ceiling (4 mm, DISH_GAP_RANGE) that a real glass
 * floating on a deep pool does not, so this is the one place the ledger
 * leaves nature; it is written in as such (PLAN 38r-5).
 */
function coverSettleTop(s: CoverState): CoverState {
  const top = COVER_AREA * COVER_TOP_M;
  if (s.plate > top) { coverSpill(s, s.plate - top); }
  s.h = Math.max(COVER_FLOOR_M, s.plate / COVER_AREA);
  return s;
}

/** Liquid leaving under the glass's edge: into the bead up to its capacity, the rest off the dish. */
function coverSpill(s: CoverState, v: number, cap = beadCapacity(0.072)): void {
  s.plate -= v;
  const room = Math.max(0, cap - s.bead);
  const into = Math.min(room, v);
  s.bead += into;
  s.off += v - into;
}

/**
 * Liquid put on the plate (a pour, or the Liquid dial turned up) or taken off
 * it (the dial turned down: wicked off at the rim, so out of the bead first,
 * then from under the glass, never below the floor's full film). m³.
 */
export function coverAdd(s: CoverState, v: number): CoverState {
  if (v >= 0) {
    s.plate += v;
    s.added += v;
    return coverSettleTop(s);
  }
  let take = -v;
  const fromBead = Math.min(s.bead, take);
  s.bead -= fromBead; take -= fromBead;
  const fromPlate = Math.min(Math.max(0, s.plate - COVER_AREA * COVER_FLOOR_M), take);
  s.plate -= fromPlate;
  s.added -= fromBead + fromPlate;
  return coverSettleTop(s);
}

/** What one step is told: the carrier, the glass, and the hand on it (−1 lifting to 1 pressing). */
export interface CoverInputs {
  nu: number;
  grams: number;
  hand: number;
}

/**
 * One step of the glass on its liquid, `dt` seconds. Pressed past what the
 * edge holds, it settles by Stefan into the bead and off the dish; lifted
 * harder than it weighs, it draws the bead back in until the bead is empty.
 * Returns the gap in metres.
 */
export function coverStep(s: CoverState, dt: number, k: CoverInputs): number {
  const sigma = carrierTension(k.nu);
  const mu = DENSITY * Math.max(1e-7, k.nu);
  const hand = Math.max(-1, Math.min(1, Number.isFinite(k.hand) ? k.hand : 0));
  const P = weightPressure(k.grams) + hand * HAND_PA;
  const h0 = s.h;
  if (P > holdPressure(sigma, h0) && h0 > COVER_FLOOR_M) {
    const h = Math.max(COVER_FLOOR_M, stefanSettle(h0, P, sigma, mu, dt));
    coverSpill(s, (h0 - h) * COVER_AREA, beadCapacity(sigma));
  } else if (P < 0 && s.bead > 0) {
    const h = stefanLift(h0, P, mu, dt);
    // Drawn in whole once the lift outruns it, so an emptied bead is 0, not a rounding's 1e-22.
    const v = h >= h0 + s.bead / COVER_AREA ? s.bead : (h - h0) * COVER_AREA;
    s.bead -= v;
    s.plate += v;
  }
  return coverSettleTop(s).h;
}
