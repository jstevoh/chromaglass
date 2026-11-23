# Archive: 27. Every control does something you can see

The closed items of [`docs/plan/27-controls-you-see.md`](../27-controls-you-see.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **27b-2. The ferrofluid is given back too (shipped, #305).** The ferrofluid takes the colour's own substep plan (`phasePlan`); `npm run rides`. Story in `docs/plan-shipped.md` §27b-2 (moved 2026-10-29, 19m-2).
- **27b-3. Breathing beat squeeze and organic liquid injection (shipped).** Squeeze shaped quadratically with a cosine release, automated doses as droplet clusters; `npm run lift`, `squeeze`, `downbeat`. Story in `docs/plan-shipped.md` §27b-3 (moved 2026-10-29, 19m-2).
- **27c. Turbulence reaches (shipped, #305).** The dial was the stir's speed, so
  full was a look's 0.3 tripled, and with the band playing the music multiplied it and
  then held it to the larger of the dial and 1.2: full was 1.4 times half way. Now the
  dial runs as t(1 + 3t³) (`lib/stir.ts`; a look's 0.3 within 8% of before, full four
  times) and the music multiplies it by at most two: full is 5.8 times half way. The
  eddies still change on the clock, not on the stir's own speed (an eddy of size l
  stirred at U turns over in l/U): **27c-1, open**, wants a third dimension in the
  noise (3D simplex with the turnover as z), not a slide of the 2D one.
- **27f-1. Kick Bloom (shipped, awaiting a Mac read).** `kickBloom` is the kick's dye burst's own dial and the burst is lobes, not a ring; `npm run panel`, the picture judging.md §60. Story in `docs/plan-shipped.md` §27f-1 (moved 2026-10-29, 19m-2).
- **27f-2. Plate Rock leans on the one and three (shipped; story in docs/plan-shipped.md §27f-2).**
  A hand's minimum-jerk reach to the other side of a turning axis on the strong beats, never a
  shove on each kick; `npm run rides` holds it (judging.md §61).
- **27f-3. Beat Squeeze presses a sheet, locally (shipped 2026-10-22; the owner picked the
  local sheet on the thread's card; story in docs/plan-shipped.md §27f-3).** Off the frame-moving looks the kick
  lays one dent as wide as a 0.1 mm sheet bends over the liquid in the kick's hold
  (elastohydrodynamic bending length; with the liquid's weight since 27f-4); Bass Drop keeps the
  glass. `npm run rides` holds it.
- **27f-4. The sheet solved, not stamped (shipped 2026-10-24; story in docs/plan-shipped.md
  §27f-4).** The kick is a fingertip on a sheet floating on the liquid, solved each step on its
  own grid, exactly per Fourier mode (lib/sheet.ts): its bending, the liquid's weight under it
  (which 27f-3's reach left out, and which is the larger at a dent's size) and the dish's open
  rim. Laid on the gap through its own channel, past rest where its ring lifts. `npm run sheet`
  holds it (judging.md §68).
- **27f-5. The rock lifts the oil, not the frame (shipped 2026-10-24; story in
  docs/plan-shipped.md §27f-5).** On a tipped thin gap oil rises uphill through the water at
  Hele-Shaw's speed (`OIL_LIFT`, in SI), laid as the closed dish's circulation so an even sheet
  feels nothing, the frame stays still and the rim holds a lens; the water's colour alone weighs.
  `npm run oillift` holds it.
  - On the frame-moving looks the dish's own tilt (`rockAccel`, SLOSH_LEAN × Frame Sway) and the
    gap's (CUR_ROCK) are two different sizes of the same tilt; say which is the plate's.
- **27f-9c. Lava Lamp's wax is a liquid of its own (shipped 2026-11-11; story in
  docs/plan-shipped.md §27f-9c).** The wax is the oil, heavy cold (Oil Weight, a new
  setting) and swelling lighter warm (OIL_EXPAND), its colour kept in it (Oil Bodies);
  the lamp warms it as a body off the rim; the look no longer stirs itself.
  `npm run lavawax`.
- **27f-9e. The wax goes round (shipped 2026-11-12; story in docs/plan-shipped.md
  §27f-9e).** The heat crosses the gap to the cool upper glass at the gap's conduction
  rate, π²κ/h² in real seconds (2.9 s water, 5.8 s wax), so a risen body cools, sinks
  and is warmed again: about 16 s round on the look's clock at 192². `npm run lavacycle`.
  It went round once or twice and then hovered: 27f-9h.
- **27f-9h. Lava Lamp looks like a lit lamp, and keeps going round (shipped 2026-11-12;
  story in docs/plan-shipped.md §27f-9h).** The wax dyed lightly (LAVA_DYE 0.55) so the
  bulb shines through it, the bulb a warm white, Oil Tension 1 and Dye Weight at the 0.5 a
  standing plate floors it to, and nothing poured or kicked into the sealed lamp (Evolve,
  Sound Drive and Plate Rock at 0). And the stall the Mac filmed, root-caused: the bulb
  was a kick of heat to the wax alone, a thermostat the wax parked on, and every lamp
  since 27f-9e hovered within 60 to 80 s. The floor's glass is warm now (LAMP_GLASS) and
  heats water and wax alike by conduction: the wax goes round every 32 s, for minutes.
  What lifts warm wax through warm water is only that it swells more than the water
  does (OIL_EXPAND), as a real lamp's wax does: with the swelling out it never leaves
  the floor. `npm run lavacycle` watches two minutes of it, on the Mac's `show`, and
  holds the warm floor's and the swelling's controls (`npm run lavawax`'s old third
  line, which read the lamp at 6 s, before conduction has warmed anything). The owner's verdict
  on the Mac film decides whether the look stays (2026-11-12: "one last try").
- **27h-1, shipped (#626).** Twenty-five dials let further where their consumer allowed it;
  story in `docs/plan-shipped.md` §27h-1.
- **27h-2, shipped (this PR).** The dials whose top the solver held a second time: Swirl,
  Dye Weight and Heat Spread to 2, Pushes Dye to 1.2, Drop Height to 2, Background Loop to
  1.4, Glass Smear to 3 with no gate, Momentum's lasting current to 0.999. Story in
  `docs/plan-shipped.md` §27h-2; `npm run widedials`.
