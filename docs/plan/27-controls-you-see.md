# 27. Every control does something you can see

The owner, 2026-10-05: "I feel like beat squeeze doesn't do too much (if anything). Also
turbulence and plate rock don't appear to do too much either. Many of the controls aren't
meaningful. Go through them all and fix them or remove them if they don't do anything or
are covered by a new control."

**The measure.** `controls.yml` on main (run 37379345453, the band playing, about forty
kicks heard a look): each ride turned from the look's own value to the far end, judged
against the look's own drift. On 20 of 24 looks: Turbulence visible on 5, Beat Squeeze 6,
Plate Rock 9, Swirl 3, Evolve Speed 5, Fingering 5, Lacing 4, Tempo Sync 4. On the `all`
shard's three looks about twenty more read nothing on all three (27d has the list).

- **27a. Plate Rock is the plate tipped (shipped, #305).** Story in `docs/plan-shipped.md`
  §27a (moved 2026-10-29, 19m).
    - **27a-2, open.** Read Plate Rock on the Mac's `controls` run with the glass, on
      the even looks above, against a drift floor held still across runs (each look's
      own drift rose on #305 with the stronger kicks, so its ratios are not like for
      like).
    - **27a-3, open.** Glass Smear's own noise speed is laid × dt and then read × disp
      again (the 2026-10-06 audit), so at a slow look's Speed it moves the plate about
      a ten-thousandth a second; lay it in m/s as the cover's slide is.
    - **27a-4. Found: it was the cover glass** (see 27a-1), fixed with 27a-1's return and QA-25. Story in `docs/plan-shipped.md` §27a-4 (moved 2026-10-29, 19m-2).
    - **27a-5, open.** One carry still rides the glass's whole drift in fixed
      substeps of 0.45 of a cell and so falls behind it: the clear film's holes
      (`filmAdvect`, wgsl/film.ts), which a sliding glass should carry with the
      liquid. Give the film `velRide` and `driftShift` as the other carries have. And the CPU fallback solver ignores
      `coverX`/`coverY` (a phone without WebGPU rocks without the glass).
    - **27a-6, open (a shortcut, named in 27a-1's PR).** The carries' substeps are
      now set by the faces inside the dish's rim only (`carryCourant`); past the rim
      each substep is held to its 0.45 of a cell. Counted, the faces out there set
      the substeps under the cover glass: the colour carried past the rim piles
      against the grid's wall (no face through the wall carries anything), heavier
      than the mean, and the tilt drives the pile on, 1.7 cells a step in the grid's
      corners where the dish went 0.6. Nothing past the rim is drawn, but it is a
      reservoir the plate draws back from, and at the four middles of the sides, where
      the rim meets the wall, the pile reaches into the picture: on an evenly coloured
      plate under full Plate Rock with the glass the colour in the outermost cells there
      swings between empty and the plate's cap of 6 a cell, and 13% of the plate's
      colour is cut off at that cap over two seconds (7% at the default 0.45; lab,
      192²; 14% at full with the rim's edge walled as it was, so it is the glass's
      drift into a walled square, as #328 had it, not this PR's opening of the rim).
      The real fix is to model what is past the rim: liquid that crosses the open rim
      leaves the film (and the tilt and the body forces do not act where there is no
      film), rather than a walled square round the dish.
  - **27a-7. Frame Sway: the music moves the liquid, not the frame (shipped).** A new dial, Frame Sway (`frameSway`, 0 by default), is the room between the two glasses' rims; `npm run framesway` holds every look and show stage at 0. Story in `docs/plan-shipped.md` §27a-7 (moved 2026-10-29, 19m-2).
    - **27a-8, open in part.** What still turns or zooms the whole frame with the sound,
      each off at the defaults: nine looks route a band to the dish's turn
      (`audioMappings.rotation`, about 0.02–0.05 rad/s, slow), Auto Spin's Tempo, and
      ~~the closeup camera's kick punch-in and energy push when zoomed (`macroSync`,
      1.5–10% of zoom)~~. Read each with the owner: a slow dish turn is the oil wheel's
      own move. And Beat Squeeze's press spans the dish (Bass Drop at 0.8): measure its
      plate-wide radial part, which reads as a zoom on the kick.
      - ~~**The closeup's camera** (QA-31).~~ **Shipped** (`npm run steadycam`). Story in `docs/plan-shipped.md` §27a-8 (moved 2026-10-29, 19m-2).
      - **27a-8-1.** Auto's own breathing zoom (two sines, up to 13% of the zoom on 17-
        and 57-second cycles, `macroCamera.ts`) and the dolly-out through each whip are
        camera moves with nothing behind them but the clock: a macro rig on a stand does
        neither. The owner's call whether Auto keeps a slow breath as its signature or
        sits as still as Hold and Follow (`docs/judging.md` §53).
      - **27a-8-2.** The camera aims from a readback of the density a frame or two old
        (`readbackAsync`), so Follow sits that far behind a fast drop. Measure the lag on
        the Mac and, if it shows, lead by the readback's age.
- **27b. Beat Squeeze presses the glass, not a palm (shipped, #305).** The kick's discs span the dish (`KICK_RADII`, `kickDepth`); `npm run lift`. Story in `docs/plan-shipped.md` §27b (moved 2026-10-29, 19m-2).
  - **27b-1, open.** Let go, the ring comes back 87% of the way at the default and 79%
    at full; a squeeze film with nothing fingering should come all the way. The rest is
    the colour's first-order carry (18a-8).
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
- **27d. The rest of the sweep (open, its own PR).** From the run above and a read of
  the code (handoff `meaningful-controls.md` in the project's files):
  - Dead on a thin gap (every look since #248): Depth Drag (18a's open item), Vibration
    (18a-2's), Damping (only the lasting current now), Plate Pressure (only the clock
    and the dish's bed drag).
  - Two dials that are one number: Gooey × Post Blur (`U.gooey * U.postBlur`), Blob
    Surface Tension × Polarity (`immiscibility`); Rain Drip against Dye Weight with
    Gravity (both the dye's weight down the plate); Buoyancy against Dye Weight's heat
    lift.
  - Read nothing on any look measured: Swirl, Evolve Speed, Tempo Sync (Random Evolve
    overrides it), Surge (lib/phrasing.ts measured it inert), and on the `all` shard
    Accent the One, Bead Drops, Macro Chase, Kaleido Zoom, Maze Detail, Pushes Dye,
    Follow the Song, the Back Plate's and Gel Wheel's hue and level dials, Lumia
    Saturation, Deadzone, Grain Size, Macro Lacing, Relief, Domain Size, pH Indicator,
    Glass Smear, Evaporation, Diffusion, LED Rotation Speed. Many need another setting
    on (a gel wheel, a second plate, a camera, the ferrofluid); the sweep sorts gated
    from dead, then fixes, folds or retires each with saved looks, set lists, MIDI and
    the remote migrated.
  - Heat is not carried on a thin gap (the velocity's self-advection is gone and vel.z
    rides with it), so Buoyancy, Heat Decay and Double Diffusion are weaker than their
    dials say.
- **27e. The music should move the picture more (first part shipped, #307).** The owner,
  2026-10-05: "Generally I don't feel like music is having as much impact on the visuals
  as I would like." 27a-c make the kick's two rides and the stir answer harder. Read
  from the frame loop, the rest of Sound Drive is dye (the centre pulse, the mid's
  stream, the treble's sparks, the kick's ring, the energy's swell) and two pushes, and
  on a thin gap (every look since #248) both pushes were nothing: the bass burst (a
  radial velocity every step while the velocity route is over 0.25) and the kick
  ring's outward kick push straight out from a point, a gradient, which the projection
  takes out whole. In the lab on forty pools (`npm run musicforce`), the burst held two
  seconds at a bass of 0.8 moved 0.006 of the plate's colour; a look's own stir 0.86.
  And the energy's swell divided the energy (0–1) by 70 as though it were a band, so it
  never reached its gate of 0.15 on any look.
  - *Shipped so far* (#307): the bass is a hand on the glass (`BassPress`, lib/squish.ts) and the energy's swell pours on its own scale; `npm run musicforce`. Story in `docs/plan-shipped.md` §27e (moved 2026-10-29, 19m-2). Every look gains the swell's dye source while the music is loud, which no check measures yet (27e-2's film will).
  - **27e-1, open.** The kick ring is still 14 one-cell specks of dye with an outward
    kick the projection removes (0.008 of the colour over four kicks). A drop that
    lands is a volume source (PLAN 18c): poured on each kick in the lab, a drop 0.04 of
    the plate across moved 0.04 a kick and stays, but every drop's volume leaves over
    the rim, so at a kick a beat it would flush the plate in about three minutes and
    push Classic's ferrofluid ring out about 0.002 a drop. A drop on the bar's one, or
    the ring's colour laid where Beat Squeeze's press carries it, without the flush.
  - **27e-2, open.** The first measure is still owed: on `film.yml`'s real songs, how
    much the picture's motion and colour follow loudness and the kick at beat scale
    and over 20 s (light-show plan targets r about 0.4 over 20 s), against the same take
    with the sound off; and the Mac's `controls` run for Sound Drive before and after
    this (it read visible on 13 of 20 looks before).
  - **27e-3, open.** Sound Drive scales none of the kick's forces (Beat Squeeze, Plate
    Rock) and the stir's music term at most doubles it; Lumia at Sound Drive 0.12 hears
    almost nothing. Whether one dial should be the music's reach on all of them is a
    question for the owner once 27e-2 says which reads weakest.
- **27f. The kick's three moves told apart (2026-10-21).** The owner: Beat Squeeze "doesn't do
  a whole lot", yet "something that looks like beat squeeze" shows on many looks even turned
  down, and Plate Rock feels the same in practice. Cause: Beat Squeeze has been 0 on every look
  but Bass Drop since a direct commit on 10-08 (`beatSqueeze` 0.03–0.10 before it, already about a
  tenth of the default's press after 27b-3), so what was seen was the *kick's dye burst* (a ring of
  6–12 droplets pushed outward on every kick, gated only by Audio Impact) and Plate Rock's tilt shove.
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
  - **27f-8, open (shortcuts named in 27f-4).** (a) The sheet's mobility is the rest depth's,
    h₀³/12μ, where the film under a deep dent drains as h³: at full Beat Squeeze the dent's middle
    is half the gap, an eighth of the mobility. The full equation is nonlinear (a semi-implicit
    step with the linear one as its preconditioner is stable while the mobility is under twice
    the rest's), at about five transforms a step against one. (b) The sheet's rim is the plate's
    square; the dish's is its circle. (c) The gap under the sheet is the 6 mm middle everywhere,
    not the dome Plate Curve makes: on a dome a kick presses no deeper than the rest under its
    middle (kickRoom) and the shader owes what its floor refuses of a dent's flank, so nothing
    ratchets, but a dent's shape and pace are the flat plate's. (d) Each kick's force is set from the volume the stamp pressed out,
    not a hand's (a fixed fingertip force would press glycerine's dent shallower), and the
    middle is capped at two thirds of the gap (SHEET_DEEPEST), where (a) bites hardest: full
    Beat Squeeze reaches it on every liquid with 61 to 78% of the stamp's volume. (e) The slosh
    dish's press (stepSlosh's dishKicks) still holds and lets go on the stamp's timings
    (glassHeld, KICK_RELEASE), not the sheet's.
    (f) The layer drains by lubrication (Reynolds), which needs its viscous time h²/ν short against
    the motion: at 6 mm 36 s in water, 1.6 s on the default oil (Thickness 0.45), 0.036 s in
    glycerine, where the solved dent (k = 1/14 mm) relaxes in 0.6 ms, 13 ms and 0.57 s. Only
    glycerine is in the regime; the oil is about 125× outside it, water 6×10⁴. There the liquid's
    inertia sets the pace: let go, the dent rings as a flexural-gravity wave under the sheet,
    ω² = (gk + Dk⁵/ρ) tanh kh, a period near 0.27 s at that k, damped by the Stokes layers
    (δ ≈ 1.4 mm on the oil): a couple of swings on the oil, many in water, where the lubrication
    sheet has it gone within a frame. The inertial sheet (a damped wave per mode, still exact per
    step) is the fix; judging.md §68 asks whether the missing swing shows.
  - **27f-5. The rock lifts the oil, not the frame (shipped 2026-10-24; story in
    docs/plan-shipped.md §27f-5).** On a tipped thin gap oil rises uphill through the water at
    Hele-Shaw's speed (`OIL_LIFT`, in SI), laid as the closed dish's circulation so an even sheet
    feels nothing, the frame stays still and the rim holds a lens; the water's colour alone weighs.
    `npm run oillift` holds it.
    - On the frame-moving looks the dish's own tilt (`rockAccel`, SLOSH_LEAN × Frame Sway) and the
      gap's (CUR_ROCK) are two different sizes of the same tilt; say which is the plate's.
  - **27f-6, open. A standing plate lifts the oil too.** Rain Drip's weight and Comet's pull still
    weigh all the colour, oil's included, over the app's mean, and a plate stood up (Plate Upright,
    Rain Drip) lifts no oil: the same circulation with gravity's in-plane share in place of the
    rock's tilt.
  - **27f-7, open (a shortcut named). The lift's circulation is the even gap's.** Ψ is solved with
    the plate's mobility taken as even, then the gap's own solve takes what is left where the gap is
    not (a press, a domed plate), with its open rim: exact on an even gap, and under a press a little
    of the lift can reach the rim. The full answer is the lift's own solve with the gap's mobility
    and a closed rim, a second multigrid; or one solve with the rim's held pressure set per liquid
    (18g-6 holds the surface tension's this way, as a gradient taken off the force near the rim). And the oil in the mix has the water's viscosity in the gap: a light
    mineral oil is fifty times thicker (OIL_NU), which would slow a lens to about 1/25 of this in
    water looks (Darcy's inclusion, 2μ₂/(μ₁+μ₂)) and change how every oil body moves; its own item
    when the mix's oil gets its viscosity.
  - **27f-9. A standing plate is a sealed bottle (shipped 2026-11-11; story in
    docs/plan-shipped.md §27f-9).** Lava Lamp's wax poured out over the open rim; on a standing
    plate the weight is now the closed cell's circulation (`wgsl/fluid/seal.ts`). `npm run sealed`.
    - **27f-9a, open.** Plate Rock's and Rain Drip's weight (hsBody) on a standing plate still
      go on the open rim: the same circulation with the rock's tilt added to gravity's (the
      source as curl F of both, one ψ). Lava Lamp rocks at 0.25.
    - **27f-9b, open (a shortcut named, with 27f-7).** The circulation is the even gap's: where
      the mobility is not even (a press, glycerine beside water, the wax's own viscosity) the
      gap's solve takes the rest through its open rim, which is the 1.3% the lamp run loses in
      20 s where the wax lies on the bottom rim. A press on a standing plate is still an open
      edge for the glass. The full answer is a closed rim for the weight's part of the gap's
      own solve.
    - **27f-9c. Lava Lamp's wax is a liquid of its own (shipped 2026-11-11; story in
      docs/plan-shipped.md §27f-9c).** The wax is the oil, heavy cold (Oil Weight, a new
      setting) and swelling lighter warm (OIL_EXPAND), its colour kept in it (Oil Bodies);
      the lamp warms it as a body off the rim; the look no longer stirs itself.
      `npm run lavawax`.
    - **27f-9d, open. A melt that does something.** A first cut gave a heavy oil a melt
      (heavy below 2 of the heat's units, as light above), which is what a real lamp runs on
      (paraffin grows 10–15% in volume as it melts). On the look's own step it changed
      nothing (the wax's centre of mass 0.24 of the height with it, 0.23 without), because
      the wax settles over the lamp's band where the swelling balances its weight and is never
      warmed through the melt; it went. The cycle (27f-9e) shipped without it, on the gap's
      cooling; a melt comes back as a property of the poured liquid (§38e's bottles) rather than of any heavy oil, with a line in
      `npm run lavawax` that fails without it.
    - **27f-9e. The wax goes round (shipped 2026-11-12; story in docs/plan-shipped.md
      §27f-9e).** The heat crosses the gap to the cool upper glass at the gap's conduction
      rate, π²κ/h² in real seconds (2.9 s water, 5.8 s wax), so a risen body cools, sinks
      and is warmed again: about 16 s round on the look's clock at 192². `npm run lavacycle`.
      It went round once or twice and then hovered: 27f-9h.
    - **27f-9g, open (shortcuts named, with 27f-9e and 27f-9h).** The glass's temperature is
      laid by height (the floor's at LAMP_GLASS, fading up over a fin length; the room's above
      half the plate, LAMP_COOL_FROM) rather than a field of its own that the lamp heats, the
      liquid warms and the air cools (the lumped glass and air of `lib/lampBoil.ts`): a lamp
      run for an hour does not warm up as a real one does, the cool line and the floor's
      temperature do not move with Heat or the lamp's brightness, and Gravity turns the floor
      on (any tilt) rather than dimming it. The rate both ends work at is the thin gap's
      (π²κ/h², 2.9 s in water), standing in for a fat bottle's far slower conduction, which
      is why the lamp goes round in 32 s where a real one takes minutes. And a wax that is dye
      with a weight (no oil phase) is still warmed by the old kick into the wax alone
      (LAMP_HEAT), which hovers for the same reason 27f-9h found. Wanted: the glass as a
      temperature per cell (stationary, so not carried), heated by the lamp at the floor,
      warmed by the liquid through the gap and cooled by the air at h ≈ 10 W/m²K, for dye
      and oil alike; then the cycle's period should follow the lamp.
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
    - **27f-9i, open. The wax's capillary length is a quarter of a real lamp's.** At the Dye
      Weight 0.5 a standing plate runs (27f-9j) the wax's ℓc is about 3.5 mm against a real
      lamp's 1.5 cm. The full answer is σ per liquid in N/m (§38e's bottles) with the wax's own
      low interfacial tension against its liquid, and a weight the dial can take below 0.5.
    - **27f-9j, open. Dye Weight is dead below 0.5 on a standing plate.** The solver floors it
      there when Plate Upright is on (`fluid.ts`, "Dye weighs something whether or not a look
      says how much"), so the dial reads 0.2 and the plate runs 0.5: Lava Lamp at 0.2, 0.35 and
      0.5 was one run to the last digit (lab, 128², 30 s), and 27f-9h's "0.7 → 0.2" was 0.7 →
      0.5. Wanted: the floor only where a look sets no weight at all, or the dial showing what
      runs; `npm run lavacycle` held while it moves.
    - **27f-9k, open. The colour is counted in the wax's weight, and the projector's light
      heats the wax wherever it floats.** Two things found under the stall. Dye Weight weighs
      the wax's own dye, so lightening the colour (LAVA_DYE 2.6 → 0.55) lightened the wax and
      moved its balance; a liquid's weight should be its own (Oil Weight) and its colour a
      tracer. And the absorbed light of the projector (LAMP_HEATING, derived for a 1 mm layer,
      §38's audit) warms dyed wax at any height on a standing lamp: with all conduction off
      the wax rose on that alone to 0.86 of the height and stayed. A real lamp's bulb is
      under the bottle; the light through the glass is not what lifts its wax. Wanted: the
      look's light as heat only where the look asks for it, and measured against the floor's.
    - **27f-9l, open. `gapThickness` is the Thickness (viscosity) dial, not the gap.** The
      setting's key reads as the glass gap, which is the cover's own (Plate Pressure squeezes it; the
      solver's `REST_GAP`); a lab script that passes
      it as the gap is wrong by the name alone (it cost an hour here). Rename the key with a
      migration, or say so where `VisualizerSettings` declares it.
    - **27f-9f, open. A quarter of the wax's colour leaves it in its first seconds.** On the
      look's own step the share of the colour inside the bodies falls from 97% to 84% in the
      first second and 68% by six (57% with Oil Bodies off), and a thin pink wash covers 12%
      of the dish by two seconds and then holds. Clock Glass and the Splodascope lay their
      colour the same way (BODY_DYE times each cell's oil, landed by bodyLand), so the first
      suspect is the standing plate: the bodies laid high fall through the liquid at once,
      and Oil Bodies' evening-out across a moving edge, and the dye's creep past it
      (bodyPartition's E), leave colour behind. The colour should stay in the wax as an
      oil-soluble dye does. With the dye weighing (Dye Weight 0.7) that wash also lies heavy
      under the wax. At six seconds the dish is no clearer than with the wax laid as dye (both
      about 80%): the difference is a minute's, the Mac's film.
      *With the heat carried (38f-1, 2026-11-11), 192², 16 s:* the wax rises, and the colour
      left behind is now the trails of the rising plumes: the share of it in the bodies 36%
      at 16 s against 80% with the wax lying still on the floor, the haze (cells a tenth to a
      half oil) about 3,500 against 2,400, the dish 67% clear against 80%; at 256² the same
      (30% against 74%, haze 7,600 against 5,300). Split at 128², 6 s: of the colour outside
      the bodies, 3,827 units are the oil's own colour in haze cells and 202 the water's, so
      Oil Bodies keeps the colour with the oil and it is the oil itself that goes to haze
      (mean 0.15 oil, inside the double well's metastable band below its 0.21 spinodal): the
      rising plume's trailing edge, smeared by the carry faster than Cahn–Hilliard sharpens
      it. So the haze's own fix comes with the carry: a free energy whose spinodal sits near
      the binodals (a deep quench, Flory–Huggins at large χ, or the double obstacle), or the
      ferrofluid's PHASE_COMPRESS on the mix's carry, named as the carry's correction.
      `npm run lavawax` line 1 is red with the carry alone (60% clear, needs 70%).
      *Fixed with it (38f-2):* the deep quench above, shipped with the carry; the same lab
      at 6 s, 192²: haze 1,474 cells, colour in the bodies 72%, 83% clear (`lavawax` 4/4).
      What is left of 27f-9f is the Mac's minute: whether the plumes still strip colour
      over a long take, which the film after this PR shows.
- **27g. Bass Boost is a gain on the bass's hand (shipped; the owner, 2026-10-22: "I don't
  feel like it actually does anything").** Story in `docs/plan-shipped.md` §27g (moved
  2026-10-29, 19m).
  - **27g-1, open. The readings that clip.** Presets' bass mappings (`getAudioValue`, clipped at
    100) and the camera's punch still saturate at a high boost, as the reading did. Whether the
    boost should reach them as a gain on their depth too is the owner's call once he has felt this.
- **27h. Every dial runs from very gentle to very extreme (the owner, 2026-10-31: "Let's have
  very gentle options and very extreme options (which should be a general principle for all
  dials)").** A survey read the 127 dials that set an amount (positions, switches, masters and
  mixer strips left out; the dials an open PR owns left to it): what the stored value does in the
  solver or the shader, what its first step does and what its top does. The whole table is in the
  project's shared files (`dials/survey-2026-10-31.md`). The rule it leaves: the bottom step is
  barely there, the top is past nature with the law still at the core, the default and every
  look's value stay where they are, and Evolve never takes a dial to its far end on its own.
  - **27h-1, shipped (#626).** Twenty-five dials let further where their consumer allowed it;
    story in `docs/plan-shipped.md` §27h-1.
  - **27h-2, shipped (this PR).** The dials whose top the solver held a second time: Swirl,
    Dye Weight and Heat Spread to 2, Pushes Dye to 1.2, Drop Height to 2, Background Loop to
    1.4, Glass Smear to 3 with no gate, Momentum's lasting current to 0.999. Story in
    `docs/plan-shipped.md` §27h-2; `npm run widedials`.
  - **27h-2b, open. Buoyancy's top is the lasting current's cap.** The dial already runs to 2
    and nothing clamps it, but the current it drives is held to ¾ of a cell a step
    (`maxCurrent`, a CFL limit, not a choice), so past where a warm plate reaches the cap more
    Buoyancy buys nothing. The honest way further is substeps for the current when its force
    asks more than a step can carry, as the slump and the ferrofluid have; measure where the
    cap binds on Lava Lamp first.
  - **27h-2c, open. Dye Weight past 1 on a deep 1024² pool.** At 6 mm and 1024² the slump asks
    27 substeps at Dye Weight 2 against `SLUMP_SUBSTEPS`' 20, and the face guard holds it:
    stable, the front a little under its Froude speed. 38r part 2's 2 mm gap takes this back
    under 20 (about 16); if it does not land, raise the cap (a SHOUTING_CASE number: name it
    under Check changes).
  - **27h-2d, open. `widedials` Heat Spread total on Metal.** Written on SwiftShader (`Measure`
    `lab3`), where Heat Spread at 0, 1, 2 keeps the heat within 1%; on a Mac's Metal (`rgba16float`
    over 60 steps of Jacobi diffusion into the Gaussian tail) `npm run widedials` reads totals
    `×0.9997, 0.9748, 0.9657`.
  - **27h-3, open. Dials whose top is held in the plate shader** (after 38h, which rewrites
    `plate.ts`): Micro-Droplets (blend saturates at 0.67), Cells (to 1.4), Glossiness (a gain on
    the specular), Boundary Glow and Projector Focus (the Becke chain's three clamps saturate
    Boundary Glow near 0.45), Gate Edge (clamp the mix, let the width grow).
    *Check written first* (2026-11-07): `npm run shaderdials -- --owed=droplets,cells,gloss,glow,gate`
    (lab4), each dial to its new top (2, 1.4, 2, 2, 2) in `PIN_RANGE`, its uniform not clamped to the
    old top, no look moved, and in the lab the last quarter of the range changing the picture by a
    quarter of what the first does (Gate Edge from its post shader's mix, which the lab does not draw).
    Read on main: Micro-Droplets moves 6 px in its first half and none past 1, Plate Cells 3.64 levels
    in 0 to 0.35 and none in 1.05 to 1.4, Glossiness 5.05 then 0.76 (15%). Two readings move the item:
    Boundary Glow is alive past 1 on the lab's plate (0.34 in 0 to 0.5, 0.18 in 1.5 to 2), so its hold is
    the range's 1, not a knee near 0.45; and Projector Focus changes the picture by 0.30 to 0.68 a step
    across all of 0 to 1 (a focus plane, in focus at 0.5), so it has no dead travel and is not owed.
    The build is Antigravity's, from a brief; each look's picture at its own values is the reviewer's.
  - **27h-4, open. Dead bottoms that need a re-map, not a range** (each must give today's value
    at today's default): Iridescence never reaches off (a 0.25 floor), Beat Prediction's lower
    half never locks (the lock asks trust × confidence ≥ 0.5), Sensitivity's trim never goes
    under 0.5, Film Key cannot key nothing out, Room Hands' 0.05 floor, Phase Edge's mobility
    floor (a third of its top), Gravity forces Dye Weight to 0.5 from its first step, Ferrofluid
    lays the whole pour at its first step, Macro Chase has no lazy end (1 a second at 0).
  - **27h-5, open. Dials that cross zero or run backwards need a bipolar or inverted curve:**
    Kaleido Spin and Spin Rate (the looks' 1 rpm sits in the middle 1% of the throw), LED
    Rotation Speed (its phase is `time × v`, so a move jumps the ring: integrate it first, as the
    kaleidoscope's is, then widen to 20 with a curve).
  - **27h-6, open. Ceilings that are a measured choice, to be asked of the owner, not moved:**
    Diffusion Rate (0.0002, cut for the step's cost; the survey reads it as under the pass's own
    skip threshold everywhere, which wants measuring), Room Drive and Film Drive (`ROOM_MAX`
    bounds a camera-to-screen feedback loop), Sound Drive (four separate caps), Frame Sway (the
    owner's rule, 0).
  - **Judging.** Films of each widened dial's two ends on the Mac: `docs/judging.md`.
- **Judging.** How the three feel at 60 fps with real music: `docs/judging.md`.
