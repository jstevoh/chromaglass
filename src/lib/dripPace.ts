/**
 * How fast a drop falls through the carrier, for the Viscosity buttons.
 *
 * The look's Viscosity is a word, and `carrierViscosity` (lib/turntable.ts)
 * is the number behind it: water's 1 mm²/s for thin, a light oil's 20 for
 * thick. A drop of dye let go in a viscous liquid falls at Stokes's terminal
 * speed, v = 2·Δρ·g·r² / (9·η): the speed is the inverse of the viscosity,
 * the drop reaches it in a few milliseconds (so there is no run-up to draw),
 * and so the time to fall a given way is proportional to ν. The glyph on each
 * button lets a drop go and times its fall by this, so thick takes twenty
 * times as long as thin because the solver's own thick is twenty times
 * thinner to flow.
 *
 * Real drops are over in a fraction of a second; the glyph plays them in slow
 * motion at one factor for both (`FALL_THIN_S` for the thin one), so the
 * ratio between the two is the physics and the factor is only the screen.
 *
 * Named shortcut: the thread behind a thick drop is drawn stretching at the
 * drop's speed, not solved (a viscous thread thins by the Papageorgiou law,
 * h = 0.0709·γ·(t₀ − t)/η, which at 20 mm²/s is over in microseconds).
 */
import { carrierViscosity } from './turntable';

/** How long the thin (water) drop takes to fall the glyph's height, slowed for the eye. */
export const FALL_THIN_S = 0.25;
/** The drop growing at the lip before it lets go, the same for both. */
export const FORM_S = 0.45;

const WATER_NU = carrierViscosity('thin');

/** Seconds to fall the glyph's height through a carrier of kinematic viscosity `nu` (m²/s). */
export const dripFallSeconds = (nu: number): number => FALL_THIN_S * (nu / WATER_NU);

/** The same, from the look's Viscosity word. */
export const dripFallFor = (viscosity: string | undefined): number => dripFallSeconds(carrierViscosity(viscosity));
