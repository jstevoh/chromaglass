/**
 * What pH a cell of the dish is at, from the acid and base poured into it
 * (PLAN 25i-6): the chemistry under red cabbage's colour.
 *
 * The plate carries an acidity per cell (the mix's `.b`, + acid, − base),
 * which a drop of the Acid or Base bottle adds to, the flow carries, the
 * gel diffuses, and acid and base cancel in, as moles of acid and base do.
 * The plate's indicator then drew that acidity's −1..1 as pH 1 to 13 in a
 * straight line, which made it a count of pH units: every drop of vinegar
 * took the well another step down, and four or five in the same place
 * reached pH 1 and the clamp, a crimson no vinegar can make, while the
 * kick's washing soda went on to pH 13 and yellow. Filmed on the owner's
 * Mac, 2026-10-31 (PLAN 25i judging): the pink-red patch grew and went flat.
 *
 * pH is a logarithm, and what the bottles hold sets how far it can go.
 * Here the acidity is what it always was, a share of a bottle's strength in
 * the cell (1 is the bottle undiluted, `BOTTLE_M` in moles a litre), and the
 * pH is solved from it by the proton balance:
 *
 *   - Acid is vinegar (bottles.ts), acetic acid, pKa 4.76: weak, so it gives
 *     up only some of its protons, and undiluted it is pH 2.4, not 0.
 *   - Base is washing soda, sodium carbonate: the carbonate ion takes a
 *     proton with pKa 10.33, so undiluted it is pH 11.9, not 14.
 *   - The juice is buffered: plant acids and the anthocyanin itself, taken
 *     as `BUFFER_M` of a buffer at pKa 7 (an estimate of a home-made juice
 *     in tap water; named, as it sets how much acid it takes to tip it), so
 *     a trace that the flow smears across the dish leaves it violet.
 *
 * For an acid of strength Ka at c moles a litre, in the buffer B, the
 * proton concentration h is where what the acid gives equals what the
 * buffer and the water take:
 *
 *   c Ka / (Ka + h) = B (h / (h + K7) − ½) + h − Kw / h
 *
 * The left falls as h rises and the right climbs, so there is one root,
 * found by halving in log h. A base is the same sum in pOH with the base's
 * own Kb = Kw / Ka (the buffer at pKa 7 is its own mirror), and pH = 14 −
 * pOH. So drops add as moles, a well ten times as acid is one pH unit
 * redder, the front between a drop and the juice runs through every colour
 * between, as a real dish's does, and a well can never go past what the
 * bottle itself is.
 *
 * The plate's shader (wgsl/plate.ts, `PH_WGSL` below) runs the same sum on
 * every lit pixel where the indicator is on; this TypeScript is its twin,
 * for `npm run areacords` to hold the numbers to the literature.
 */

/** A bottle undiluted, moles a litre: 5% vinegar is 0.83 M acetic acid; washing soda made up the same. */
export const BOTTLE_M = 0.8;
/** The juice's own buffer at pKa 7, moles a litre (estimate). */
export const BUFFER_M = 0.002;
/** Acetic acid's pKa (vinegar). */
export const PKA_ACID = 4.76;
/** The carbonate ion's pKa (washing soda): the base's pKb is 14 − this. */
export const PKA_BASE = 10.33;
/** Halvings of log h over 14 decades: 2⁻²⁴ of 14 is far under a hundredth of a pH unit. */
const STEPS = 24;

/**
 * The pH of a cell whose acidity is `s` (+ acid, − base, as a share of a
 * bottle: the mix's `.b`).
 */
export function indicatorPH(s: number): number {
  const c = Math.abs(s) * BOTTLE_M;
  const ka = Math.pow(10, -(s < 0 ? 14 - PKA_BASE : PKA_ACID));
  let lo = -14, hi = 0;
  for (let i = 0; i < STEPS; i++) {
    const m = 0.5 * (lo + hi), h = Math.pow(10, m);
    const g = c * ka / (ka + h) - BUFFER_M * (h / (h + 1e-7) - 0.5) - h + 1e-14 / h;
    if (g > 0) lo = m; else hi = m;
  }
  const p = -0.5 * (lo + hi);
  return s < 0 ? 14 - p : p;
}

/** The pH on the plate shader's indicator scale, −1..1 (+ acid): (7 − pH) / 6, so pH 1 to 13. */
export const indicatorScale = (s: number): number => Math.max(-1, Math.min(1, (7 - indicatorPH(s)) / 6));

const f = (v: number) => v.toExponential(6);

/** The same, in WGSL, for the plate: `indicatorScale(s)`. */
export const PH_WGSL = /* wgsl */ `
fn indicatorScale(s: f32) -> f32 {
  let c = abs(s) * ${f(BOTTLE_M)};
  let ka = select(${f(Math.pow(10, -PKA_ACID))}, ${f(Math.pow(10, -(14 - PKA_BASE)))}, s < 0.0);
  var lo = -14.0;
  var hi = 0.0;
  for (var i = 0; i < ${STEPS}; i++) {
    let m = 0.5 * (lo + hi);
    let h = pow(10.0, m);
    let g = c * ka / (ka + h) - ${f(BUFFER_M)} * (h / (h + 1e-7) - 0.5) - h + 1e-14 / h;
    if (g > 0.0) { lo = m; } else { hi = m; }
  }
  let p = -0.5 * (lo + hi);
  let ph = select(p, 14.0 - p, s < 0.0);
  return clamp((7.0 - ph) / 6.0, -1.0, 1.0);
}
`;
