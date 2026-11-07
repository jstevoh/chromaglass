/**
 * The soap on the plate: how much there is, how it spreads, and what its
 * tension does (PLAN 38c).
 *
 * What was there before, and why it went. The mix's soap (its .g) faded to
 * a tenth every ten seconds, and spread by a diffusion of 0.08 cells² a step
 * on whatever grid and frame rate the plate ran at: about 1.3e-6 m²/s at
 * 384² and 60 Hz on the 0.2 m plate, where a surfactant's own diffusivity is
 * about 5e-10, so two and a half thousand times too fast, and four times
 * faster again on a grid half as fine. Its Marangoni pull was written per
 * cell of difference, so the same soap pulled half as hard on a grid twice
 * as fine, and it ran two substeps of the whole frame's time whatever the
 * grid. Soap never disappears, and a real soap front stops where the
 * tension has gone level, after which the plate remembers where soap was:
 * a second drop where the first went does next to nothing. With the fade a
 * second drop thirty seconds later burst as the first had.
 *
 * What it is now:
 *
 * - **An amount, kept.** The mix's .g is the soap a cell holds, in units of
 *   the full monolayer Γ∞ that saturates a surface (Langmuir). Nothing
 *   takes it off a closed plate. On a thin gap it leaves only as the dye
 *   does, carried by the liquid over the open rim into the trough
 *   (`OPEN_RIM`, decayDye's rule): the surface flow is not let across the
 *   rim, because the trough is full of the same soapy overflow and has no
 *   clean surface to pull the plate's soap toward.
 *
 * - **A surface that fills.** The surface holds at most one monolayer: the
 *   coverage θ = min(soap, 1). What is over it stays in the water as
 *   micelles (above the critical micelle concentration a surface is full
 *   and the tension sits at its floor, σ_CMC), riding the bulk flow, and
 *   feeds the surface as it is drawn off. So a pool of strong soap has a
 *   level tension inside it and pulls only at its edge, and a plate soaped
 *   all over pulls nowhere: which is why a second drop does nothing.
 *
 * - **Tension from coverage.** σ = σ₀ − Δσ·θ, the dilute end of the
 *   Szyszkowski law (18d-5 owes its curve). The Marangoni surface flow is
 *   u = −K ∇θ, the surface carrying the dye and its own monolayer θ (never
 *   the micelles below it) away from the soap, in plate units per second,
 *   so it is the same flow on every grid.
 *
 * - **Molecular diffusion at its own rate.** SOAP_D, a surfactant
 *   monomer's diffusivity, converted to cells² a step through the plate's
 *   size, the grid and the step's seconds. On a show's time scale it is
 *   nothing (a millimetre in half an hour); the soap's spread is the
 *   Marangoni flow's, as it is in a dish.
 *
 * The Soap Bursts dial scales Δσ (how far the soap drops the tension), so
 * K with it; at full it is SOAP_SPREAD. The default looks keep the pull they
 * were tuned with: at the grid they were tuned on (SOAP_GRID) and 60 Hz this
 * is exactly the old pull, caps and substeps. Turning it up past the tuned
 * value is a stronger soap, not a different law.
 *
 * **The named shortcut (PLAN 38c-1).** The real K, for a surface stress
 * Δσ/L over a layer h of water (u = h·∇σ/μ), is about 0.07 m²/s on a 2 mm
 * gap with Δσ 35 mN/m: SOAP_SPREAD is some seven hundred times under it,
 * and the surface speed is capped at SOAP_FRONT, 15 mm/s, where a drop of
 * dish soap on clean water sends its front out at 0.1 to 0.3 m/s. Both
 * because the flux is explicit: its stable step is a quarter of a cell
 * (SOAP_CELLS) and its self-spread, a diffusion of K·θ, under an eighth of a
 * cell² (SOAP_SPREAD_CELLS), and the real numbers would want hundreds of
 * substeps a frame. So the caps are in metres and seconds, and the
 * substeps are as many as the grid and step need to stay under them (up to
 * SOAP_SUBSTEPS): the front is too slow, but slow by the same amount on
 * every grid and at every frame rate. Past SOAP_SUBSTEPS (a grid over about
 * 720 at 60 Hz, or a step longer than a thirtieth of a second at 512) the
 * front is slower still. An implicit spread, or the burst as a similarity
 * solution laid ahead of the explicit one, is the way to the real speed.
 */
import { PLATE_METRES } from './constants';

/** A surfactant monomer's diffusivity in water, m²/s (SDS about 7.7e-10; dish soap's mixed ones 4–8e-10). */
export const SOAP_D = 5e-10;
/** The grid the soap's pull and caps were tuned on: on it, at 60 Hz, they are the old per-cell numbers exactly. */
export const SOAP_GRID = 384;
/**
 * K at full Soap Bursts: surface speed per unit coverage gradient, m²/s
 * (about 1.04e-4). The old pull was 0.5 × the step's seconds × the grid,
 * in cells a substep per cell of difference, at SOAP_GRID and 60 Hz in two
 * substeps each given the step's whole time, which is what the looks were
 * tuned on: written here as the same pull per metre of gradient over a
 * substep's own time, a 120th of a second (see the header for the real K).
 */
export const SOAP_SPREAD = 0.5 * (1 / 60) * SOAP_GRID * (PLATE_METRES / SOAP_GRID) ** 2 * 120;
/** The surface speed's cap, m/s: 0.24 cells a substep, two substeps a 60 Hz step, on SOAP_GRID. */
export const SOAP_FRONT = 0.48 * (PLATE_METRES / SOAP_GRID) * 60;
/** The self-spread's cap, m²/s: 0.12 cells² a substep, two a 60 Hz step, on SOAP_GRID. */
export const SOAP_SPREAD_MAX = 0.24 * (PLATE_METRES / SOAP_GRID) ** 2 * 60;
/** The explicit flux's limits per substep: a face's speed in cells, and the self-spread in cells². */
export const SOAP_CELLS = 0.24;
export const SOAP_SPREAD_CELLS = 0.12;
/** The most substeps a step may take for the soap. */
export const SOAP_SUBSTEPS = 8;

/**
 * The step's soap numbers, written into `out` (no object a frame):
 *   [0] substeps, [1] k (cells a substep per unit θ across a face),
 *   [2] the face speed's cap in cells a substep, [3] the self-spread's cap in
 *   cells² a substep, [4] the molecular diffusion in cells² for the step.
 * `dial` is Soap Bursts (0..1, the share of Δσ), `seconds` the step's time,
 * `n` the grid's edge.
 */
export function soapPlan(dial: number, seconds: number, n: number, out: Float64Array): Float64Array {
  const dx = PLATE_METRES / n;
  const s = Math.max(0, seconds);
  const front = SOAP_FRONT * s / dx;
  const spread = SOAP_SPREAD_MAX * s / (dx * dx);
  const subs = Math.max(1, Math.min(SOAP_SUBSTEPS, Math.ceil(Math.max(front / SOAP_CELLS, spread / SOAP_SPREAD_CELLS) - 1e-9)));
  const h = s / subs;
  out[0] = subs;
  out[1] = Math.max(0, dial) * SOAP_SPREAD * h / (dx * dx);
  out[2] = Math.min(SOAP_CELLS, SOAP_FRONT * h / dx);
  out[3] = Math.min(SOAP_SPREAD_CELLS, SOAP_SPREAD_MAX * h / (dx * dx));
  out[4] = SOAP_D * s / (dx * dx);
  return out;
}
