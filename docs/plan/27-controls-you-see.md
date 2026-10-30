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

- **27a. Plate Rock is the plate tipped (shipped, #305).** Story in `docs/plan-shipped/27-controls-you-see.md`
  §27a (moved 2026-10-29, 19m).
    - **27a-2, open.** Read Plate Rock on the Mac's `controls` run with the glass, on
      the even looks above, against a drift floor held still across runs (each look's
      own drift rose on #305 with the stronger kicks, so its ratios are not like for
      like).
    - **27a-3, open.** Glass Smear's own noise speed is laid × dt and then read × disp
      again (the 2026-10-06 audit), so at a slow look's Speed it moves the plate about
      a ten-thousandth a second; lay it in m/s as the cover's slide is.
    - **27a-4. Found: it was the cover glass** (see 27a-1), fixed with 27a-1's return and QA-25. Story in `docs/plan-shipped/27-controls-you-see.md` §27a-4 (moved 2026-10-29, 19m-2).
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
  - **27a-7. Frame Sway: the music moves the liquid, not the frame (shipped).** A new dial, Frame Sway (`frameSway`, 0 by default), is the room between the two glasses' rims; `npm run framesway` holds every look and show stage at 0. Story in `docs/plan-shipped/27-controls-you-see.md` §27a-7 (moved 2026-10-29, 19m-2).
    - **27a-8, open in part.** What still turns or zooms the whole frame with the sound,
      each off at the defaults: nine looks route a band to the dish's turn
      (`audioMappings.rotation`, about 0.02–0.05 rad/s, slow), Auto Spin's Tempo, and
      ~~the closeup camera's kick punch-in and energy push when zoomed (`macroSync`,
      1.5–10% of zoom)~~. Read each with the owner: a slow dish turn is the oil wheel's
      own move. And Beat Squeeze's press spans the dish (Bass Drop at 0.8): measure its
      plate-wide radial part, which reads as a zoom on the kick.
      - ~~**The closeup's camera** (QA-31).~~ **Shipped** (`npm run steadycam`). Story in `docs/plan-shipped/27-controls-you-see.md` §27a-8 (moved 2026-10-29, 19m-2).
      - **27a-8-1.** Auto's own breathing zoom (two sines, up to 13% of the zoom on 17-
        and 57-second cycles, `macroCamera.ts`) and the dolly-out through each whip are
        camera moves with nothing behind them but the clock: a macro rig on a stand does
        neither. The owner's call whether Auto keeps a slow breath as its signature or
        sits as still as Hold and Follow (`docs/judging.md` §53).
      - **27a-8-2.** The camera aims from a readback of the density a frame or two old
        (`readbackAsync`), so Follow sits that far behind a fast drop. Measure the lag on
        the Mac and, if it shows, lead by the readback's age.
- **27b. Beat Squeeze presses the glass, not a palm (shipped, #305).** The kick's discs span the dish (`KICK_RADII`, `kickDepth`); `npm run lift`. Story in `docs/plan-shipped/27-controls-you-see.md` §27b (moved 2026-10-29, 19m-2).
  - **27b-1, open.** Let go, the ring comes back 87% of the way at the default and 79%
    at full; a squeeze film with nothing fingering should come all the way. The rest is
    the colour's first-order carry (18a-8).
  - **27b-2. The ferrofluid is given back too (shipped, #305).** The ferrofluid takes the colour's own substep plan (`phasePlan`); `npm run rides`. Story in `docs/plan-shipped/27-controls-you-see.md` §27b-2 (moved 2026-10-29, 19m-2).
  - **27b-3. Breathing beat squeeze and organic liquid injection (shipped).** Squeeze shaped quadratically with a cosine release, automated doses as droplet clusters; `npm run lift`, `squeeze`, `downbeat`. Story in `docs/plan-shipped/27-controls-you-see.md` §27b-3 (moved 2026-10-29, 19m-2).
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
  - *Shipped so far* (#307): the bass is a hand on the glass (`BassPress`, lib/squish.ts) and the energy's swell pours on its own scale; `npm run musicforce`. Story in `docs/plan-shipped/27-controls-you-see.md` §27e (moved 2026-10-29, 19m-2). Every look gains the swell's dye source while the music is loud, which no check measures yet (27e-2's film will).
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
  - **27f-1. Kick Bloom (shipped, awaiting a Mac read).** `kickBloom` is the kick's dye burst's own dial and the burst is lobes, not a ring; `npm run panel`, the picture judging.md §60. Story in `docs/plan-shipped/27-controls-you-see.md` §27f-1 (moved 2026-10-29, 19m-2).
  - **27f-2. Plate Rock leans on the one and three (shipped; story in docs/plan-shipped/27-controls-you-see.md §27f-2).**
    A hand's minimum-jerk reach to the other side of a turning axis on the strong beats, never a
    shove on each kick; `npm run rides` holds it (judging.md §61).
  - **27f-3. Beat Squeeze presses a sheet, locally (shipped 2026-10-22; the owner picked the
    local sheet on the thread's card; story in docs/plan-shipped/27-controls-you-see.md §27f-3).** Off the frame-moving looks the kick
    lays one dent as wide as a 0.1 mm sheet bends over the liquid in the kick's hold
    (elastohydrodynamic bending length; with the liquid's weight since 27f-4); Bass Drop keeps the
    glass. `npm run rides` holds it.
  - **27f-4. The sheet solved, not stamped (shipped 2026-10-24; story in docs/plan-shipped/27-controls-you-see.md
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
    docs/plan-shipped/27-controls-you-see.md §27f-5).** On a tipped thin gap oil rises uphill through the water at
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
- **27g. Bass Boost is a gain on the bass's hand (shipped; the owner, 2026-10-22: "I don't
  feel like it actually does anything").** Story in `docs/plan-shipped/27-controls-you-see.md` §27g (moved
  2026-10-29, 19m).
  - **27g-1, open. The readings that clip.** Presets' bass mappings (`getAudioValue`, clipped at
    100) and the camera's punch still saturate at a high boost, as the reading did. Whether the
    boost should reach them as a gain on their depth too is the owner's call once he has felt this.
- **Judging.** How the three feel at 60 fps with real music: `docs/judging.md`.
