# 25. Areas of interest: several places on one plate
**Partly shipped**: areas of interest in `src/lib/plateAreas.ts`, with three looks rebuilt on them and Fillmore East filling the screen. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

The owner, 2026-10-04: Velvet Underground "underwhelming", then Lumia, and "I need more
complexity across presets in general. I want to have multiple areas of interest in
different parts of the canvas."

**Fillmore East fills the screen (25g, shipped with 25a).** The owner: "it only takes
up a small amount of the canvas... should zoom in so the entire plate takes up the
canvas." Its Dish Spread 0.85 drew each plate as its own dish on black: the lead one
0.71 of the frame's height across (about 40% of a 16:9 width), the second 0.45. Now 0:
both plates over the whole screen (the lab, a square frame: 44% of it lit → 99%). No
other look sets Dish Spread. Four set Dish Vignette, a round dish edge with black beyond
it, which on a 16:9 screen leaves the sides dark: **clock-glass** 0.8 (the dish 65% of
the width; that look is the "Clock glass and ferro looks" work's), **oil-wheel** 0.7
(71%), **fractal-dream** 0.5 (81%), **home-movie** 0.3 (91%). Those are round on
purpose; the owner says which, if any, should fill the screen too.

**Next looks to move (25b, one PR each or a few together, measured the same way):**

1. **deep-ocean**: Center Gravity 0.8 pulls everything into one middle pool; layers of
   glycerine and syrup in separate places are what depth looks like.
2. **fillmore-1969**: the reference light show, two projectors, Beat Squeeze 0.9 and
   both routes on the bass all in the middle; its oil, silicone and milk want a place each.
3. ~~**bass-drop**~~ (shipped with 25h): three soap wells on the bass, taken in turn,
   Center Gravity 0.4 → 0.15.
4. **poster-1969** and **roy**: flat poster shapes, bass on both routes and the squeeze
   in the middle; a shape per area keeps them separate shapes.
5. **oil-on-water**, **glycerine-drift**, **milk-marble**, **home-movie**, **crowd-plate**:
   each liquid look's bottles in places of their own.
6. ~~**jellyfish-bloom**~~ (shipped with 25h): its four bells laid in four areas, a band
   each (OWN_SEED_AREAS: its own seed lays the bells there).

Kept centred on purpose: galaxy, solar-flare, stardust-collapse and fractal-dream (their
picture is a centre), and classic (the picture `npm run fx` measures). The ferrofluid
looks and Clock Glass are the "Clock glass and ferro looks" work's.

**Open, found building it:**

- **25c. The hand works in the room, not on the glass (a shortcut).** An area is in the
  dish's frame, so it turns with the glass, and the music's hands follow it round. A
  liquid laid in the dish does turn with it; a projectionist's hand stays where it is
  while the dish turns under it. At Velvet's motor (one turn in about six minutes) the
  difference is invisible; on a look that spins (acid-trip turns in about 20 s) the
  hands should stay put in the room and the areas' liquids turn away from them. Needs
  the dish's angle (`plateAngle`) to turn a room-frame point into the grid.
- **25d. The second plate of a two-plate area look.** A back plate with a look of its
  own takes that look's areas whole (its pools, liquids, hand-off pours, drops and
  music). The second plate of a two-plate look (Velvet Underground) lays nothing at
  first (laySecondPlate), as before, and takes the automation's area drops only; it
  could lay its own pools offset from the front's, so the two plates' areas overlap
  in part, as two projectors' do.
- **25f. Cell Bloom's cells are drawn by the camera, not grown (a painted effect,
  not new here).** Paint Cells (`macroDetail`'s `cellField` in wgsl/plate.ts) draws
  rings over any dye under the closeup, clumped by noise; the silicone poured in its
  pools does not make them. In a real pour, cells are silicone oil and a lighter
  paint rising through a denser one and opening where surface tension is lowest
  (Marangoni and a density inversion). With 18f's heat and 18d's densities the
  solver could grow them where the silicone is, and the camera would only shade
  them.
- **25e. A film measure for it.** `npm run film` measures near-black, hues and swells
  over the whole frame; it has no number for how many separate places hold something.
  The lab's count of lit regions (connected cells over density 0.3, each over 1% of the
  plate) is the measure used here; it belongs in `watch.mjs`'s shape() so every look
  can be held to it on the Mac. With it, a Mac check that the app uses the areas:
  `npm run plate` holds the table and the helpers, but nothing it runs reaches
  `LiquidVisualizer.tsx`, so a kick put back in the middle would pass it. Load Velvet
  Underground, fire kicks, difference the dye frames: the change should centre within
  about 0.06 of the bass area (turned by the plate's angle), and on classic at the
  middle (the check-skeptic's design).
- ~~**25h. Areas that listen for themselves**~~ (shipped: a cord aimed at one area heats,
  stirs with a paddle, pours or picks a bottle there, on a gate; a colour family per area;
  Velvet Underground, Jellyfish Bloom and Bass Drop on it; `npm run areacords`). Story in
  `docs/plan-shipped.md` §25. Open, found building it:
  - **25h-1. A warm spot opens no hole yet (a named shortcut).** An area's heat is real heat
    in kelvin, carried and cooled as the lamp's is, and what it does is what 18f gave warm
    liquid: it rises on an upright plate and thins the water in the gap (18f-4's shortcut).
    The surface pulled away from a warm spot, which is what a projectionist's heat is mostly
    for, is thermal Marangoni (18f-2, reverted with #352). Velvet's kick heats its soap well,
    and until 18f-2 lands the ring there is the kick's own hand and the soap's. When 18f-2
    lands, `npm run areacords` should add a heat cord that opens the well's surface on a
    level plate, against the same cord with the heat off.
  - ~~**25h-2. The gate on every cord, and the rest of 30a.**~~ Shipped with 30a (`PatchBay.fold` holds a `CordGate` per whole-plate cord keyed by what the cord is and clocked from `fold`'s `now`, while area cords keep `CordGate` in `AreaHands`; `npm run soundcords`).
  - **25h-3. Area cords on the back plate.** They work on the plate the music plays, in its
    areas; a back plate with its own look has that look's areas (25d) but the front look's
    cords do not reach them, and the panel greys Plate for an area cord. With 25d.
  - **25h-4. Beads in one area.** The exploration had Velvet's hats set beads in the syrup;
    Beads is one number for the plate (the BeadField's amount), so the hats pour the syrup's
    bottles instead. A local bead source (the field's spawn masked to an area) would be a
    fifth act.
  - **25h-5. A look saved under its own name has no areas**, so its area cords do nothing:
    areas are keyed by built-in id, as the dye's seed is (plateAreas.ts). A saved look
    should carry its areas with it, or name the built-in it came from.
  - **25h-6. The paddle turns with the dish** (25c's shortcut applies): an area turns with
    the glass, and so does the paddle tending it. Invisible at these looks' motors.
  - **25h-7. The Mac's measure of the rebuilt looks.** The lab plays each look's own cords
    on its areas; the music's own hands (Bass Drop's kicks taking its wells in turn, the
    kick's ring and press on Jellyfish's lowest bell) live in the visualizer's loop, which
    only the Mac's app run reaches. That is 25e's lit-region count in `watch.mjs`, run on
    the three looks before and after this.
  - **25h-8. A Go between two area looks lands the old look's cords on the new one's
    areas.** The crossfade fades the outgoing look's cords out over the Go (lookFade.ts),
    and an area cord names its area by index, so for up to the fade's length Velvet's kick
    heat on its soap well (area 1) heats Jellyfish's lowest bell. A cord should carry the
    look it was written for, or the fade should drop the outgoing look's area cords at once
    (they are hands, which a Go can let go of, not settings that must not jump).
- ~~**25i. Colour that answers the music**~~ (shipped: the lead's note picks Poster's kick
  bottle, the hits on Red Cabbage and Chemical Clock are drops of a reagent and the colour is
  the chemistry's; `npm run areacords`). Story in `docs/plan-shipped.md` §25. Open, found
  building it:
  - **25i-1. The note picks a bottle on Poster alone.** The `noteClass` reading is in the patch
    bay for any look, and the looks with a clear lead and an area family of three (Velvet's
    pools, Lumia's veils) should be tried with it once the owner has seen Poster (judging §96).
  - **25i-2. Chemical Clock's touches are the kick's own hand, which only the Mac reaches.**
    Its three activator places are all on the bass, so the beat dose (`doseArea` in the
    visualizer's loop) touches them in turn; the lab holds what one drop does to the gel and
    node holds the turn, but the app's own kicks on the gel are the Mac's to measure (rings
    started per kick in `watch.mjs`). The beat dose goes through Kick Bloom, so Kick Bloom 0
    stops the touches too; a cord over several areas in turn would free them from it.
  - **25i-3. More than five dyes (not built).** Built only if an area is starved for colour:
    Poster's bass shape now borrows the ink shape's ultramarine and purple for its third and
    second bottles, so the two shapes share two inks. A sixth dye in Poster's contract would
    give the bass shape its own; measure `npm run stages` before and after (each dye a channel
    in the dye's step).
  - **25i-4. MIDI note-ons do not feed the note.** As 24.3-place-1: `noteClass` is read off
    the microphone's `pitchFine`; a keyboard's note-on knows the note exactly and at once.
  - **25i-5. The touch is the gel's activator; a silver wire is the other way in.** A drop of
    bromous acid fires the gel (`bottles.ts` BZ Activator). A wire works by taking the bromide
    (the inhibitor) out of a spot, which the two-variable Oregonator here does not carry; the
    two look alike in a dish (a ring runs out), and the second needs a third species.
- **25j. A lamp under each area** (direction D, 2026-10-24; after 25i). Each area sits over
  its own lamp whose brightness and warmth follow its band, and a gel can turn a step on a
  hit, as the old shows ran several projectors and colour wheels. Since 18f the plate's
  heat comes from the lamp, so a brighter lamp warms its area too and the liquid answers
  (the warm water thins and spreads; 18f-4's warm-water shortcut still applies and is named
  in the PR). First on **Lava Lamp** (two lamps under the wax; the bass warms one side, the
  mids the other, and the wax rises from whichever the music feeds), **Cell Bloom** (the
  kick warms each cell pool's lamp in turn) and Velvet Underground (each pool a little
  warmer while its instrument plays). A lamp that pumps reads as flicker, so each takes
  25h's attack and release, never a frame's step; and the flash guard reads one number for
  the whole wall (14r), so 14r reads per area first, in the same PR or before it.
  Nothing moves the frame. *Measure:* in the lab, a band's lamp raises the light and the
  heat inside its area at least 5x more than outside, its rise and fall within 10% of the
  cord's attack and release; and the flash guard's per-area reading catches a pumping lamp
  that the whole-wall number misses.
