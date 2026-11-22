import type { Preset } from './presets';
import type { VisualizerSettings } from './types';

/*
  The lively looks worked as hard as a real show works its dish (PLAN 48q).

  What was found (2026-11-12): the study that filmed every look against the
  owner's references and two real shows read each look's turnover, the time
  the flow takes to carry a form across its own size (`npm run watch`'s
  physics read, scripts/watchphysics.mjs), and 25 of 33 liquid looks turned
  over several times slower than a real show: Galaxy in 12 s, Home Movie in
  10, Aurora and Jellyfish in 9, against the Joshua Light Show's 1.5 s and a
  modern oil-and-water show's 2.4. A closer camera did not close the gap, so
  it is the forcing, not the picture: the liquid is not being worked.

  What works a real dish, and what this file turns up on each look that is
  meant to be lively. Nothing here speeds up the clock (PLAN 38u-6 is the
  clock's own item), adds a stir that no dish has, or moves the frame; every
  key below is a thing an operator does to the plate, already simulated and
  already checked on its own:

    - plateRock, the hand tipping the dish on the one and three
      (lib/plateRock.ts, `npm run rides`). On a thin gap a uniform liquid
      tipped does not move at all (Hele-Shaw: the tilt is balanced by the
      pressure piled at the rim); only a difference in density does, the
      heavy dye sliding downhill and the light oil rising, at a speed that
      goes as the gap squared and the tilt. So a harder lean drives exactly
      the motion a real dish has and nothing else. The dial is a real hand's
      lean up to its 0.45 default and past real above it; these stay under
      one, a firm hand rather than a thrown one.

    - beatSqueeze, the rhythm sheet: a clock glass pressed into the liquid on
      each kick (lib/squish.ts kickPress), the Joshua Light Show's own
      technique and the reason their turnover is the fastest in the library.
      The press is a squeeze flow, the liquid driven out radially from under
      the glass and drawn back as it lifts (Saffman–Taylor fingering on the
      lift where the look has it), so each kick shears the forms it touches.

    - automateRate, how often the hands pour: a real operator keeps the dish
      fed, and a pour landing carries its own momentum into the plate.

    - gapThickness, the liquid in the gap. This is the one that mattered.
      Every look runs on the thin gap (a Hele-Shaw cell), and no look set its
      Thickness, so every look ran at the 0.45 default: light mineral oil,
      22 cSt (lib/turntable.ts thicknessViscosity, 1 cSt × 10^(3t)). But these
      looks are water-borne dye, by their own descriptions and settings
      (Galaxy even asks for viscosity 'thin', which the thin gap does not
      read; PLAN 48q-1), and a real show's dish is water: 1 cSt. In the gap
      every push goes at Darcy's speed, h²Δρg sinθ / 12μ, and a pour or a
      press keeps going for h²/12ν before the walls take it, so a liquid at
      a quarter of the viscosity moves four times as fast under the same
      rock and coasts four times as long after the same pour.

      Why not water itself: filmed at 1 cSt the looks turned over fast and
      stirred their colours into one (Red Cabbage's colourfulness 83 to 51,
      Home Movie's dark share 27% to 6%, a flat yellow plate). So each look
      sits at 4–8 cSt (Thickness 0.2–0.3), a thin water-and-glycerine,
      the thinnest that kept its colours and its dark on the film. Whether
      water's mud is the real stirring or the plate's grid is PLAN 48q-2.

      The first try (rock, press and pours alone, at light oil) was filmed
      and missed the bar: the median look turned over only 1.07 times as
      fast as before, and three turned over slower, because in a 22 cSt gap
      a harder hand mostly piles pressure at the rim.

  Each look gets only the forcings that suit what it is, toward the Joshua
  Light Show's pace. The calm-by-name looks, Galaxy and Milk Marble, are not
  here: filmed three ways (a harder hand at light oil, at water, at 4–8 cSt)
  neither turned over any faster (Galaxy 7.7 s before, 8.0, 9.3 and 8.0
  after; Milk Marble 6.4 before, 7.2, 6.4 and 7.6), because what thins and
  stirs them grows their forms as fast as it speeds them; PLAN 48q-3. Comet
  is not here either: it is a torrent that carries its ink off the plate, so
  a thinner liquid only empties the plate sooner. Filmed thinner, its
  streamers faded to black (colourfulness 33 before, 3 at 5.6 cSt, 16 at 11,
  24 at 16 cSt) while it turned over little faster (4.55 s, then 4.0 at
  16 cSt). Its pace is the stream's own, PLAN 48q-4. Aurora, Jellyfish and Solar Flare are not here: filmed for
  48q, they already turn over inside the real shows' range (1.1, 2.5 and
  2.4 s on the main this went out from). Classic is not here either: it is
  being rebuilt on its own (PR #923). The numbers each look was filmed at,
  before and after, are in the PR that set them and in PLAN 48q, and
  `npm run pace` holds the table to them.

  Every key is written whole on each look rather than left to the default,
  so the look reads its pace from this table alone: a later change to a
  default (the record's 0.45 rock, light oil's 0.45 Thickness) cannot move a
  paced look, and `npm run pace` holds the defaults the table was measured
  against.

  A pass of its own beside presets.ts, because that file is at the 100 KB line
  (`npm run sizes`). It runs in layLooks (presetsLay.ts) after the moiré pack
  is made from the house looks (the pack keeps its own pace) and before the
  music's stir and hands, so those read each look's final settings.
*/
export type PaceKey = 'plateRock' | 'beatSqueeze' | 'automateRate' | 'gapThickness';
export type Pace = Pick<VisualizerSettings, PaceKey>;

export const PACE: Readonly<Record<string, Pace>> = {
  'crowd-plate':   { plateRock: 0.6,  beatSqueeze: 0.5,  automateRate: 0.18, gapThickness: 0.2 },
  splodascope:     { plateRock: 0.65, beatSqueeze: 0.4,  automateRate: 0.16, gapThickness: 0.3 },
  'red-cabbage':   { plateRock: 0.7,  beatSqueeze: 0.4,  automateRate: 0.24, gapThickness: 0.25 },
  'oil-and-water': { plateRock: 0.7,  beatSqueeze: 0.45, automateRate: 0.14, gapThickness: 0.3 },
  'home-movie':    { plateRock: 0.8,  beatSqueeze: 0.5,  automateRate: 0.3, gapThickness: 0.275 },
};

export function layPaceLooks(looks: Preset[]): void {
  for (const look of looks) {
    const pace = PACE[look.id];
    if (pace) look.settings = { ...look.settings, ...pace };
  }
}
