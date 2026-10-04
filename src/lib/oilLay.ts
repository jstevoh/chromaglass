/**
 * Where Clock Glass lays its oil when the look is laid.
 *
 * Here, apart from the app, for the reason `phasePour.ts` is: so the lab
 * (`npm run clockglass`) lays exactly the bodies the app lays, from the same
 * draws, rather than a copy of them that drifts.
 *
 * A clock-glass dish, as the owner's reference photographs of the Joshua
 * Light Show and the Fillmore show it, is coloured oil and coloured water
 * that will not mix: cells of red, amber and blue oil, each ringed by its
 * dark meniscus, sitting in a purple water, several to a frame and in
 * different parts of it. The look used to lay three water dyes in rings on
 * top of one another, and water dyes are one liquid, so they blended into a
 * single lavender disc within seconds (the Mac gallery at 12 s and 30 s).
 */

/** One body of oil: its middle and radius in plate units, and which of the look's dyes is in it. */
export interface OilBody { x: number; y: number; r: number; dye: number }

/*
  How many, and how big. Twelve, a thirtieth to a sixteenth of the plate
  across (radius 0.03 to 0.065), scattered over the dish out to 0.37 of the
  plate from its middle, denser towards the middle as the bowed glasses
  gather them (the square root makes the scatter even by area; the 0.05
  floor keeps one from sitting exactly on the middle, where the look's
  syrup goes). In the lab at 256² with the look's Oil Tension, nine bodies
  of up to 0.075 merged into four or five in five seconds and filled half
  the dish; twelve smaller ones leave water between them for the colours to
  read as cells. The bodies take the dyes after the first (the water's) in
  turn, so every colour the look names is in the dish from the start.
*/
export const CLOCK_GLASS_BODIES = 12;

/**
 * The bodies for one lay, drawn from `float` (a seeded stream's `float`, so
 * the same seed lays the same dish). `dyes` is how many dyes the look names;
 * the first is the water's, and each body carries one of the others.
 */
export function clockGlassBodies(float: () => number, dyes: number): OilBody[] {
  const out: OilBody[] = [];
  const others = Math.max(1, dyes - 1);
  for (let i = 0; i < CLOCK_GLASS_BODIES; i++) {
    const a = float() * Math.PI * 2;
    const d = 0.05 + 0.32 * Math.sqrt(float());
    const r = 0.03 + 0.035 * float();
    out.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r, dye: 1 + (i % others) });
  }
  return out;
}
