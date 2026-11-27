/*
  The hue journey: a set drifts its colours over minutes, one dye draining as
  the next arrives, never a jump (moved out of LiquidVisualizer.tsx's frame
  loop with PLAN 18a-22, unchanged, to make room for Keep Full beside it).

  It lived inside the evolve block, so with Random Evolve off (the default) it
  never ran, and its "minutes" were the solver's clock: at the default Speed
  one of them took three and a half real minutes, at full Speed eight seconds.
  On the wall clock now, while playing.
*/

/** The journey's place: how many dyes it has walked, and when it last stepped (seconds, −1 before the first). */
export interface HueJourney { lead: number; lastAt: number }

/**
 * One frame of the journey, `minutes` its Hue Journey (0 is off) and `nowS`
 * the wall clock in seconds. True when it has just stepped a dye on (the
 * caller turns the harmony to the new window); `j` is updated in place.
 */
export function hueJourneyTurns(j: HueJourney, minutes: number, nowS: number): boolean {
  if (!(minutes > 0)) return false;
  if (j.lastAt < 0 || j.lastAt > nowS) j.lastAt = nowS;
  if (nowS - j.lastAt < minutes * 60) return false;
  j.lastAt = nowS;
  j.lead += 1;
  return true;
}
