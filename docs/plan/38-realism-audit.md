# 38. Realism audit: what still imitates, after §18 (asked 2026-10-30)

Asked 2026-10-30: "a physics and realism evaluation across all of the visualization code.
Can we make things more realistic?" This is the second pass of the audit §18 began on
2026-09-28. Since then the plate became a Hele-Shaw cell (18a), the lamp shines through
the dye (18b), pours add volume (18c-1), each bottle has its viscosity (18d-1), drops slump
(18m), the lamp heats (18f), milk scatters (18j), and edges come from refraction (18e, in
part). So this pass read the code as it stands, area by area (the fluid core; drops,
bubbles and films; the ferrofluid; optics and light), and kept only what is **not already
an open item** in §9, §18, §20, §29, §31, §32, §33 or §36. Where a finding sharpens an open
item it says so and names it, rather than taking a new number for the same work.

Left out on purpose: the macro closeup's 3D beads (their tops, rims and the mask), which
the "Closer 3D macro view" work owns now (14ab-6, #601).

How it is ranked: what a person would see change on the wall, against what it costs to
build and what it adds to the frame. S is under a day, M a few days, L a week or more.
Every item here keeps today's look reachable until the Mac has judged the new one (the
operating rules), and each ships from its own thread with the check that measures it
written first. Line numbers are as read on main at d07ac31.

## The top picks

- ~~**38a. The lamp is a condenser, not a wandering painted glow**~~ — **Shipped, this PR**
  (the Hot-Spot is the projector's lamp lever: the bulb's image off the lens's aperture,
  `src/gpu/wgsl/lampField.ts`; the heat lit evenly; `npm run lampfield` 9/9, 1 of 7 on the old
  plate; story in `docs/plan-shipped.md` §38a). Left from it: 38a-2, 38a-3.

- **38a-2. The head's cos⁴ and the lamp's stage fall-off, always on** (S; Medium; changes
  every look, so the Mac's eyes first). 38a keeps Hot-Spot 0 an ideal projector, lit evenly,
  so no look changed. A real one is not: the head's lens dims the frame's corners as cos⁴ of
  the field angle (a 355 mm head over the 0.133 m frame: about 9% at the corners), and the
  lamp below the condenser lights the stage as cos³ of its own angle. Both belong in
  `lampField` as the default, applied to the light and (the stage's half) to the heat, and
  Lamp Warmth's painted vignette (`plate.ts`, the Lamp warmth block: a smoothstep that
  darkens corners by up to 45% with the warmth) goes in the same PR, since that is what it
  was standing in for. *Measure:* `npm run lampfield`'s law with the cos⁴ term; the warm
  looks' corners against the vignette's, judged on the Mac.

- **38a-3. Lamp Motion has nothing real left to move** (S; Low). After 38a it moves only the
  light the gloss and the bubbles' rims are lit from (`lampDir`, the lit-from-above shading
  38h takes out). When 38h lands, Lamp Motion and the plate rock's push on the lamp
  (`lampRock`) move nothing a projector has: retire the slider (its MIDI, desk pin and
  the two looks that set it, Crowd Plate with its `dirX` patch and Soap Film), or give it a real
  thing that moves, such as the gel wheel's hand.

- ~~**38b. Bubbles that never appear or vanish by a clock**~~ **Shipped** (#603, with 38g and
  38n): no timers, fades, age-as-colour, daughters or wobble; a pocket inflates at a breath's
  rate, leaves at the open round rim (area falling at π·bσ/3μ), by a merge, under a drop, or by
  dissolving at Henry's law's rate, which is years; breakup at a critical deformation from
  the strain. `npm run bubblephysics` 24/24. Story in `docs/plan-shipped.md` §38b.
- **38b-2. An Air Dissolves dial** (S; Low, the owner's call). `BubbleField.dissolve` scales
  air's diffusivity past nature (1 is real, nil on a show's clock; 3e7 melts a 2-cell pocket in
  about 90 s, the small first). A setting for it, with its desk, phone and MIDI, would give a
  music look back the turnover its timers gave it, by the real law. Not built: the owner sees
  the plate fill and empty only by the rim and merges first.
- **38b-3. Music air reaches the rim** (S; Medium). With no clock a look's bubbles hold at its
  Bubbles count (`room` in `LiquidVisualizer.tsx`) and new ones come only as old ones leave,
  so how fast they turn over is now how fast the flow takes them to the rim and how often they
  merge. On the Mac: count the kick bubbles a minute on a music look, before and after; if the
  plate goes still, 38b-2 is the answer, not a clock.
  The deploy after #603 found it first: `npm run kickbubbles` counted 11 chances with room
  on Classic in a minute where its floor is 15 (the room no longer empties itself); the
  check now lets the look's bubbles go every eight seconds, since it measures the kick's
  odds, not a bubble's life.

- ~~**38c**~~ Soap is conserved: no decay, no grid-rate spreading. Shipped 2026-10-30
  (`npm run soap`); story in `docs/plan-shipped.md` §38c. What it left:
  - **38c-1. The Marangoni front at its real speed** (M; High on the soap and milk looks).
    The named shortcut in `src/gpu/fluid/soap.ts`: K is SOAP_SPREAD, 1.04e-4 m²/s, the
    old tuned pull, where h·Δσ/μ is about 0.07 on a 2 mm gap; and the surface speed is
    capped at SOAP_FRONT, 15 mm/s, and the soap's self-spread at 3.9e-6 m²/s, the
    explicit flux's limits, where a drop of dish soap sends its front out at 0.1 to
    0.3 m/s (Jensen 1995: r ∝ t^¾). An implicit self-spread, or the similarity
    solution laid ahead of the explicit one, then the dye's carry on that flow.
    Also: the surface flow is only where θ has a gradient, so clean surface ahead of a
    front is not pushed, where on real water the whole surface moves ahead of it.
    *Measure:* a drop's front radius against Jensen's law at two grids; and `npm run physics`'s
    burst line measured at a tenth of the plate again, not the drop's own radius (moved in #609).
  - **38c-2. One soap, not three** (M). A bottle's soap lands twice on a GPU plate:
    in the mix (.g, this item's) and in the poured liquids' `liquids0.r`, which has its
    own Marangoni as a body force (`liquidForces`, `wgsl/fluid/forces.ts:42`) that the
    projection deletes as a pure gradient (the reason marangoniFlux exists), no
    diffusion, and is carried by MacCormack off a thin gap, which does not conserve.
    The CPU's `LiquidPhase` (no WebGPU) still fades its soap in 6 s
    (`DECAY_SECONDS`, `src/lib/liquidPhase.ts:79`). *Measure:* a bottle of soap moves
    the dye once, by the mix's flux, and its total is kept as `npm run soap` keeps it.
  - **38c-3. A Soap Breakdown dial** (S; the owner chose it, 2026-10-31). The Soap Bursts
    dropper (`LiquidVisualizer`) lays a monolayer under each drop every 0.8 to 2.6 s, and
    kicks add more; with the soap kept, a plate is soaped all over in a few minutes of a
    show and the drops then do nothing, as a real dish does. The owner's answer: a
    setting for a real loss, 0 (none, the real value) by default and free to ramp past
    nature, so a long show keeps bursting: the soap taken up by the oil's interface, or
    fresh water through the trough, as a first-order rate on the mix's .g in
    `mixUpdate`, scaled in metres and seconds; MIDI, both desks and the phone's Soap
    sheet in the same PR. *Measure:* `npm run soapbreak`, written first and red on main
    (CI runs it with `--owed=law,decay,show,default`; the build takes each id out as it
    turns green). Its contract: `src/gpu/fluid/soap.ts` exports `soapBreakdownRate(dial)`
    (0..1 to k in 1/s, exactly 0 at 0, a half-life of an hour or more at 0.01 and ten
    seconds or less at 1); the step's params carry the dial as `soapBreakdown` and the loss
    is per real second (`magnetSeconds`), once a step (not in each of an oil look's four
    mixUpdate substeps), never per frame or by `dt`, so 30 s reads exp(−k·30) within 2% at
    two step lengths, at three times the dt and on an oil look, and a dial passed as 0 keeps
    the soap to 2e-4; the TS step turns the dial into k with `soapBreakdownRate` itself and
    `src/sim/fluidSimulation.ts` fills `soapBreakdown` from the setting; in the tenth minute
    of a kick track (nine minutes' drops laid at once, the last minute dropped on the
    kicks) a drop bursts half as well as on clean water or better with the dial at its top,
    and under a fifth at 0 with every drop kept to 1%; `soapBreakdown` is 0 in
    DEFAULT_SETTINGS and no look sets it. Proved against a scratch build: a correct loss
    passes all four (kept 0.3536 against exp(−kt) 0.3536; the drop 73.8% against clean
    water's 99.5%; bursts come back from a dial of 0.87 on that build's curve); a loss per
    frame reads 0.84 and 0.71 at the two steps, one scaled by dt 0.044, one in every
    substep 0.016 on the oil look: all red. Once `soapBreakdownRate` exists, `decay` and
    `show` are no longer excused as owed, so a dial that never reaches the solver is red.
  - **38c-4. Acidity diffuses at a grid rate** (S). The same mix update spreads the
    acidity at 0.04 cells² a step (`fluid.ts`, 'mix update'), about 6.5e-7 m²/s at 384²
    and 60 Hz, where H⁺ and OH⁻ are 9.3e-9 and 5.3e-9 (and a pH indicator's dye, 4e-10):
    from metres and seconds, as the soap's now is.

- **38d. The ferrofluid's labyrinth from the magnetic Bond number and the sheet's own
  repulsion** (M, same cost per cell; High: it is the whole maze look). Sharpens **9aa**
  (2–3× too coarse, and the haze) and the unnumbered "the labyrinth's scale follows the gap"
  line in §15. *Now:* the maze's period is 0.045 of the plate, divided by the Maze Detail
  knob up to 3 (`src/gpu/fluid/constants.ts:217, 238`; `fluid.ts:473-476`), the same at every
  gap and field. Its long-range repulsion is a screened Ohta–Kawasaki term with
  m² = 0.16·k*² (0.04 under the hand, `HAND_SCREEN`, `constants.ts:318`;
  `wgsl/fluid/labyrinth.ts:38-51`). Its "field" is an invented uniform coil, χ 0.45
  (`MAZE_UNIFORM`), plus the magnet's saturation as e/(e+800) rather than a Langevin curve,
  times 1 + 0.25 of a noise that drifts in time (`labyrinth.ts:78-80`). The double well is
  steepened under the hand so stripes survive (`labyrinth.ts:111-114`), which is the
  interfacial tension rising with the field; and the pull and the maze's flow are rescaled
  by hand, (1 − 0.75·maze)·(1 − 0.5·spikes) (`fluid.ts:710`, `constants.ts:277, 294-295`,
  "a tuning, not physics"). *Real:* a ferrofluid layer of thickness h in a normal field is
  a sheet of dipoles that repel by μ0M²/4π·(1/r − 1/√(r² + h²)) (Jackson, Goldstein and
  Cebers 1994), unscreened at long range with the gap as the only cutoff; the stripes'
  width goes as h·exp(c/N_B) with the magnetic Bond number N_B = 2M²h/σ (Langer, Goldstein
  and Jackson 1992), so the maze is finer where the field is stronger and the gap thinner,
  read from the field at each point, with no knob. M(H) is the Langevin curve of the real
  magnets' field; σ is a material constant; the Kelvin force acts whole whatever pattern
  forms; the disorder is the initial noise, not a pattern wandering across the plate. The
  standing film's FFT (`wgsl/standing.ts`) can apply the kernel. *Measure:* the period
  against N_B at three gaps and three fields, within 15% of the law; stripes, not dots, at
  the fill where the theory says stripes.

- **38e. Oil's surface tension in newtons a metre, and no cap at the moment it matters**
  (S, nil; Medium-High: every oil look's rounding and break-up). Sharpens **18c-4** and
  **18d-1**. *Now:* the oil's tension is a 0–1 dial times `OIL_TENSION` 4e-4 plate widths,
  "set in the lab so each effect is plainly there at full" (`constants.ts:134-150`,
  `fluid.ts:785`), and the capillary force is capped at 0.5 cells a step (`OIL_CELLS`,
  `wgsl/fluid/capillary.ts:283-288`), which the comment says bites when a fresh pour is
  breaking up: the Rayleigh–Plateau moment, the one a viewer watches. *Real:* in a thin gap
  a curved interface moves at u = h²σκ/(12μ), with σ for oil on water 0.02–0.05 N/m from
  the bottle (bottles carry σ since 18d-1). *Build:* the dial becomes σ/σ_ref from the
  bottle; the cap becomes CFL sub-steps, as the carries already do. *Measure:* a thread's
  break-up time against Rayleigh–Plateau in a gap, and a drop's rounding time against
  h²σ/(12μR) for two oils.

- **38f. The lamp's heat lifts the liquid as a force, and cools by the plate's own losses**
  (S for the force, M for the cooling; Medium: plumes on the upright looks and Lava).
  Sharpens **18a-4** (the current into the field) for the heat path, and **36e-2**. *Now:*
  heat buoyancy and the lamp's pull still ride the half-resolution current, eased 0.98 a
  step with no dt and capped at 0.002 of the plate a step (`wgsl/fluid/forces.ts:252-260`,
  `fluid.ts:385-386`), although `fluid.ts:926-934` already moved the rock to `hsBody`; so a
  plume can never outrun the cap. Cooling is a per-look dial, `heatDecay^(4·dt)` with looks
  at 0.90–0.998 (`wgsl/fluid/dye.ts:219-221`, `src/presets.ts:49, 160, 227, 348`), a time
  constant from 2.4 s to 125 s; `LAMP_HEATING` 0.24 K/s is derived for a 1 mm layer while
  the rest gap is 6 mm (`constants.ts:156, 394-401`); and temperature is clamped 0–50 with
  no unit (`thinGap.ts:589`, `forces.ts:253`). *Real:* ρgβΔT is a body force in the Darcy
  solve, like the dye's weight already is (18a-2); the layer loses heat to the glass
  (τ ≈ h²/κ, seconds) and the glass to the air and by radiation, which
  `src/lib/lampBoil.ts:38-50` already models on the CPU. *Measure:* a plume's rise speed
  against Δρgh²/(12μ); the cooling time from lampBoil's model, the same in every look.
  *Found reading it for the build (2026-10-30), before any of it was built:*
  - **The heat is not carried on a thin gap.** The temperature lives in the velocity's z,
    and a thin gap skips the self-advection (`fluid.ts`, step 2's `if (thin) return`), so
    the lamp's heat stays where it was laid while the flow it drives moves the colour out
    from under it: a warm patch cannot rise as a thermal, it pushes from a fixed place.
    The build starts here: carry h·T with the gap's flow, as the dye's amount is carried.
  - **The heat runs on the look's clock.** `decayVel` heats at `lampHeat·S.dt` and cools
    at `heatDecay^(4·S.dt)`, and S.dt is the look's step (Speed × 0.2), not seconds. On
    Classic's clock (0.0018 a step against a sixtieth) the default 0.98 is about 115 s in
    real time, not the 12.4 s its comment says, and the lamp's 0.24 K a unit is 0.026 K/s
    real, near the physical 1000 W/m² over a 6 mm layer and its two glasses (C ≈ 33 kJ/m²K,
    0.030 K/s). So the physical model in seconds keeps Classic's heat nearly as it is if
    Heat Decay is read as the air on the glass: h ≈ 7200·(−ln v) W/m²K puts 0.98 at a
    strong fan (145, τ ≈ 115 s), 0.998 at still air (τ ≈ 20 min), 0.9 past any fan.
  - **The current's cap is 0.75 cells a step** (`maxCurrent` in `sim/fluidSimulation.ts`),
    not the 0.002 the audit read from the lab's BASE; the point stands: past a few
    hundredths of a kelvin every plume goes at the cap.
  - Real sizes for the check: water's β ≈ 2.1e-4 /K, so a free column in the reference
    liquid (22.4 cSt) at the 6 mm rest gap rises 0.27 mm/s per kelvin, a round patch half
    that (oillift's inclusion law); in water 22 times faster.

- ~~**38g. Bubbles that merge, crowd and stretch like pockets in a gap**~~ **Shipped** (#603):
  the merged pocket starts as long as the pair was end to end and rounds off at Paterson's
  τ₂ = 2μR³/(b²σ) (times at 10, 15, 20 cells within 1% of the law); the neck's (σ/μ)·t growth
  is a millisecond, inside the step; strain stretches a pocket to ε·τ₂; crowding by Durian's
  stiffness σb/R̃ against each pocket's drag 6πμR²/b, so a pressed pair of 14-cell pockets
  overlaps 6% of its radius where 3-cell ones stay round. Story in `docs/plan-shipped.md` §38g.
- **38g-2. Facets and Plateau borders drawn** (M, GPU; Medium-High for the straw's rafts).
  The air field still draws every pocket as a disc (`gpu/wgsl/air.ts`), so two big ones
  pressed together overlap rather than meet in a wall, and a stretched one is drawn round
  (`packedShape` is read by no shader). The wall between unequal pockets is an arc of
  curvature 1/R_s − 1/R_b (`dropWall` in `beads.ts`); the stretch is an ellipse; a pocket
  stretched past SPLIT_D necks before it tears. *Measure:* facets on a jammed raft in the lab.

- ~~**38h**~~ *shipped 2026-10-31.* Nothing on a lit-from-below plate makes light: the
  satellite droplets are lenses (a dark band past DROP_CORE, no dot), the oil's 8% moved onto
  the shadowgraph's 1 − Δz·∇²OPL (nothing at focus), the gel is a filter (Beer–Lambert in
  Gel Wheel, no 1.5, no floor), Glossiness is the dye surface's relief gain (1 to 4× the
  real slope; no Lambert, Blinn or Schlick), the dish's and the projectors' rims are dark
  lines, and the plate draws no grain. `npm run nolight`. Story in `docs/plan-shipped.md` §38.
  - ~~**38h-2**~~ *shipped 2026-10-31.* The rest of the light painted from above: every edge
    takes the lamp's light through the pupil law the lamp lever uses (`edgePass`,
    `plateTransmit.ts`), the camera's view through a light box's wider cone. No lamp
    direction is read on the glass. `npm run nolight` lines 9 to 12. Story in
    `docs/plan-shipped.md` §38.
  - ~~**38h-7**~~ *shipped 2026-10-31.* Depth in the closeup's bubbles: the camera's
    bubble wall traced through Snell, Fresnel and total internal reflection against the
    light pad's critical cone (`closeupDepth.ts`), the middle the lamp through clear air,
    the liquid round it seen through the wall (a diverging lens), and Light Play a softbox
    above the glass seen only in a curved wall. Part 2 (the owner: "low resolution",
    "no reflectance or 3d feel"): drawn from each bubble's true centre and radius
    (`camBubble`, fitted to the air texels), a ball's middle tinted by the liquid above and
    below it, the softbox 80 times the pad at Light Play 1. `npm run closeupdepth`,
    `airlens` 9-10. The camera's bubble film is the light through it at Film Physics 1,
    the projector's faint complement, not the reflected gold it wore while painted as if
    lit from the front (`camFilm`; the flat film mirrors only the lens axis, the softbox
    is off it): `npm run filmlook` 8-9, the closeup now on a lit ground. On a black-ground
    look the liquid is its own light, so the column above and below a ball adds it and the
    wall's dark band goes (the Mac's film, 2026-11-01): `npm run closeupdepth` 5. Story in
    `docs/plan-shipped.md` §38.
  - **38h-11. The lamp ground's reflected ray crosses half the liquid, found doing 38h-7 on
    black** (S, nil). The camera's reflection in a bubble's wall (`camBounce`) takes the
    liquid's transmission over half the gap on the lamp ground, as tuned by eye; traced, a
    ray turned back off the upper meniscus crosses rho (1 - cos θ) above and rho (1 + cos θ)
    over |cos 2θ| below, past the critical angle more than the whole gap. The black ground
    now takes the whole depth; work the path out per point on both grounds and let the lamp
    ground's contact line darken to what it is. *Measure:* `npm run closeupdepth` line 2's
    line before the contact, and the lamp ground's contact against the liquid.
  - **38h-9. The closeup's dye hole and the grain at zoom, found doing 38h-7 part 2** (S,
    nil). The bubble's rim is now exact, but the solver cuts the dye's hole on its own grid:
    a soft lighter fringe a cell or two wide sits outside each small bubble (the cleared
    dye's antialiasing; on the lamp ground only, 119 against the liquid's 105 just past an
    18-cell bubble's contact, none on black, measured 2026-11-01), and the dye's grain is a cell-sized noise that reads as coarse at
    zoom 4 and over. Cut the dye's hole in the plate at the fitted rim instead (the solver
    keeps its own for the flow), and draw the grain at screen scale past the solver's cell.
    *Measure:* the fringe's excess brightness 1 to 1.5 radii out in `npm run closeupdepth`.
  - **38h-10. filmlook's projected bubble tint is read mostly on the dark band, found doing
    38h-7's film** (S, nil). `npm run filmlook` line 9 holds the projector's light through the
    film at yellow over blue -1.0, but thickening every pocket's film to the most it keeps
    moves that only to -1.2, where the camera's swings +7.0 (the table's sign turns every
    hundred nanometres). The projector's film pixels are mostly its dark band; the middle's
    tint is a level or two a channel and falls under the two levels that count a pixel. Count
    the middle by the bubble's footprint instead and hold the projector's tint to the same
    thickness swing. *Measure:* the projector's swing in filmlook's thickest-film renders.
  - **38h-8. The rest of the closeup's depth, found doing 38h-7** (M, nil). The owner's
    photos (drops/references) have two more cues the bubbles now show and the rest of the
    closeup does not. *The beads:* an oil drop in water is traced the same way (Snell into
    the oil and out, total internal reflection leaving the oil past asin(1.333/1.47), 65
    degrees, so a bright line at its contact too), but its rim and camera line are what
    `droplens` holds on the owner's Mac, so it goes with **33g-2b**, generalising
    `airWall` to two indices. *The cells:* the dye's relief bends the light the same way,
    so the dye beyond a dome is seen shifted by its slope (the lensing that shades a dome
    in a photograph); `macroDetail` has the decoded colour only, so it needs the decode
    moved to the lensed point first. The softbox reflects off an oil drop by 0.24% at
    normal incidence, so no glint there unless asked past real. *Measure:* `npm run
    closeupdepth` lines on a bead and a cell field.
  - **38h-5. What Light Play and the Second Lamp do now** (S, nil; owner's call). Light
    Play is decided (38h-7, the owner's "the lighting can do whatever is most realistic and
    useful"): the closeup photographer's softbox. The Second Lamp is open. 38h-2
    took the lamp's side off every edge, so the Second Lamp drives only its share of the hot
    spot. A real meaning for both is there to draw: a bulb whose image sits off the
    pupil's centre (the second bulb's, at `SECOND_BULB`) lights edges on one side only,
    the share `pupilPass` gives a bend added to that offset (oblique light, as a
    microscope's). It belongs in `refractionOptics` with **18e-2**, so the projected path
    shows it, and with **38a-3**, which decides Lamp Motion. *Measure:* `npm run nolight`
    line 12 with the bulb's offset in place of the lamp's position: the same edge
    brighter on one side, darker on the other, never over the flat plate plus the second
    bulb's lost share.
  - **38h-6. Light still made at an edge, found doing 38h-2** (S each, nil). The back
    plate's derived boundary adds `edge1 · edgeK · 0.25` of white and 1.6 of the dye (the
    31a shortcut, left to **31a**); the camera's bubble's film colour multiplies by up to
    1.7 (a front-lit soap film's reflection, where a backlit pocket's film transmits:
    `filmTableAt(…, true)`, as the projected bubble already uses at Film Physics); the
    ferrofluid's glint is a fixed key light (with **38j**). The photo style's softbox is a
    print lit from the front and stays. And the lab draws only the derived path, so the
    plain path's rims are checked through the camera's, which shares `meniscus`.
  - ~~**38h-4**~~ *shipped 2026-10-31.* The back plate's lamp takes the pigment's grain as
    dye, T^grain (`lampGrain1`), as the front's does. `npm run grainedge` line 4. Story in
    `docs/plan-shipped.md` §38.
  - **38h-12. The back plate is drawn brighter than the front, so its grain moves its edges
    more** (S–M, nil; Low: the back plate shows only with two plates on). Found building
    38h-4. Drawn alone (front level 0) over the lab's plate, the back plate's grainless
    picture is 11 levels from the front's on average in Poster 1969 and 66 in Chemical
    Clock, whose bare glass reads 255 alone against the front's 137: the back plate's
    branch lacks some of the front's pieces (the chemistry's colour, the gap's scale and
    the film, the contact shadow). With the same T^grain the brighter picture moves more of
    its edge past 40 levels: Poster 1969 10%, Milk Marble 4.5% (the front 0.01%), 85% of
    them in patches, the grain's mottle and not one-pixel flecks. Find which pieces the
    back branch is missing and give it what is physical for a second dish (its own gap,
    no contact shadow on the front's screen). *Measure:* `npm run grainedge` line 4 prints
    the back plate's edge moves; ask them under line 1's bar once the pictures agree.
  - **38h-3. The oil's shadowgraph and the dye's are one term** (with **18e-2**). 38h draws
    the oil's out-of-focus lens from its own ∇²OPL in the oil block, on both sides of its edge;
    where dye crosses the oil's edge `refractionOptics` already takes the oil's share of the
    derive pass's ∇²OPL, so there it is counted twice. When 18e-2 deflects by ∇OPL, take the
    oil block's term out. *Measure:* `npm run nolight` line 7 holds with the oil block's
    shadow gone.

- **38i. Milk's forward scatter takes light from the beam, it does not add it** (S–M, low;
  Medium on the milk looks: today a bright rim rings every pool). After **18j**; sharpens
  **18d-7** and **18d-12c**. *Now:* the direct beam is extinguished by
  exp(−(0.85, 0.95, 1.2)·0.9·sc·gap), then a forward halo 0.08·halo·exp(−0.6·sc) is *added*,
  so transmission passes 1 just outside a pool; the halo is a 4-tap blur at a fixed 0.020
  of the screen whatever the gap or zoom (`plate.ts:615-648`); and the colour of the
  extinction is Rayleigh–Gans, λ^−1.5 for casein, while the reflectance a few hundred lines
  up treats the fat globules as flat Mie scatterers (`:193-197`), two models of one liquid.
  *Real:* light scattered forward inside the lens's acceptance cone is light moved from the
  direct beam, so direct + forward ≤ 1 at every pixel, and the halo's radius is the gap
  times the tangent of the half-acceptance angle, in plate units. *Measure:* no pixel of a
  milk pool's surround above clear liquid; the halo's width doubles with the gap.

- **38j. The ferrofluid is black by its thickness, not by its distance from an edge** (S–M,
  low; Medium: rim width, the haze's colour, the domes' feet). Sharpens **9aa**, **29b**
  (after 9ab). *Now:* its optical depth is 1.2 + 12·t^1.3, with t the number of cells
  inside its half-full line, through an invented spectrum (0.45, 0.7, 1.0)
  (`plate.ts:2855-2857`); its strands read the phase instead (`:3041-3060`). *Real:*
  Beer–Lambert through the actual column: a magnetite colloid is opaque in tens of
  microns, so a millimetre layer is black and only a meniscus or strand under about 50 µm
  shows brown. The height is already packed for the display by the standing film and the
  drop (`ferroDrop.ts`'s pack). *Measure:* brown only where the column is under 50 µm, at
  two magnets.

## Smaller, each worth doing when its area is open

- **38k. The spikes' onset and the magnets' field, in tesla.** ~~Fields add, the onset
  worked out~~ **shipped** (#630): several magnets add as vectors, and the liquid's onset,
  Cowley and Rosensweig's field for EFH1 under water through the layer's inner field, is
  4.0 mT (`SPIKE_ONSET_REAL`, a share of 0.033), held to an independent solution by
  `npm run disc` 13/13. The plate still runs on the lab's 0.18 (22 mT): **38k-7**. Story
  in `docs/plan-shipped.md` §38k.
  - **38k-7. The plate on the real onset** (S once 9t-2 is in; High: Magnet Garden, Ferro
    Paint, the set-down magnet). *Shortcut today:* `SPIKE_ONSET` is the lab's 0.18, 5.5×
    the liquid's, so the looks' own magnets and the hand's set-down one gather a flat
    pool where a real one raises domes (9u). *Blocked on* **9t-2**: past the onset the
    standing film takes the pool and has no Kelvin pull, so #625's try at the real onset
    left a dragged drop 7.4 R behind and turned `ferrodrag`, `ferrodye`, `ferropour` and
    `startup` red on the Mac (story §38k). *Build, after 9t-2:* `SPIKE_ONSET =
    SPIKE_ONSET_REAL`, `SPIKE_FULL` at the old 0.35 / 0.18 of it; the opening builds the
    film's pipelines when a look's own magnet is past the onset (`Opening.film`, so
    `startup` does not wait on them mid-show); `disc`'s "every look's own magnet raises
    none" turned to "is past it"; `spikes`, `fingers` and `standing` re-aimed to shares of
    the onset (38k-5). #625's branch (`claude/project-thread-2kj23l`, 4e8bbc9) has all of
    it written. *Measure:* those checks on the Mac, and the owner's eyes on Magnet Garden,
    Ferro Paint and a dragged-and-dropped Magnet, filmed before and after.
  - **38k-1. A Magnetite dial** (S–M; Medium, the owner's call). The ferrofluid's loading
    φ sets Ms and χ together (both in proportion to φ; EFH1 is about 8%), so one dial
    from very dilute (no field raises domes: Ms under Mc) to very loaded (past real, 20%
    and over) moves the onset, the pull (Kelvin's χ in `MAGNET_GAIN`) and the density.
    Needs `SPIKE_ONSET` as a uniform (shared.ts's `spikeAmp`, the film's lift, `fluid.ts`'s
    film gate) and `fluid.ts` is 99.6 KB, so a split first (19ai-10).
  - **38k-2. The pitch and the tension are one number** (S; Low-Medium). The domes' pitch
    (`SPIKE_PITCH`, 8 mm) sets l_c, so the onset reads σ = Δρ g l_c² = 3.3 mN/m for EFH1
    under water: low for a hydrocarbon against water (10–30 mN/m without surfactant at the
    interface). A measured σ would set the pitch (2π l_c, about 14 mm at 10 mN/m) and the
    onset (5.3 mT) together; the pitch is the look's today.
  - **38k-3. The film's patches step their own magnet's field** (S). The pull and the drop
    add the magnets as vectors now; each standing patch (`wgsl/standing.ts`, `lift`) still
    reads its own magnet alone, so two fingers' domes between them stand on half the field.
  - **38k-4. The ramp past the onset** (S). `SPIKE_FULL` keeps the old proportion (1.94 ×
    the onset) when 38k-7 moves it: the solver's gate as domes arrive, not their height, which the film's
    lift makes. The subcritical jump and its hysteresis are 9t-3's.
  - **38k-5. The looks' own magnets in the dome checks** (S). `spikes` and `fingers` used
    Magnet Garden's own magnet as their control under the onset; at the real onset (38k-7)
    it is 4.6× past it, so the control becomes a magnet at 0.8 of the onset, whose pull is
    about 3% of Garden's. Add Garden's own magnet as a case that must raise domes, its bar
    set from the Mac's first reading.
  - **38k-6. One χ for EFH1** (S, with 38s). `standing.ts`'s `CHI0` is 2.6 and
    `spikes.ts`'s `FERRO_CHI` 2.64; the drop's pull reads `CHI0`. Import the one number
    and re-read `ferrodrop` (about 1%).

- ~~**38l. The glass springs back by the second, not by the frame**~~ — **Shipped, this PR**
  (the glass opens against the film's suction, k(h₀ − h)(h/h_s)³ with Press Lift read at
  the film a full press leaves, STEFAN_FILM 0.30 (38l-4); the dt half already held on a thin gap;
  `npm run stefan`; story in `docs/plan-shipped.md` §38l).
  - **38l-1. The liquid's viscosity in the press and the lift** (S; Low-Medium). Stefan's
    rate goes as 1/μ, and neither the press's closing nor the lift reads the liquid under
    the palm: glycerine presses and lifts as water does. hsPrep's per-cell μ is there to
    read. Found building 38l.
  - ~~**38l-2. The kick's sheet lifts by the same law**~~ — **Shipped, this PR** (the sheet
    takes the suction's share cell by cell on the dent it holds and node by node on its own
    solve, so the shader takes it everywhere; `npm run sheet` 18/18; story in
    `docs/plan-shipped.md` §38l).
  - **38l-3. The sheet's suction reads the plate's own gap** (S; Low). The sheet works out
    each cell's share at rest less its own dent, not the plate's gap, which it cannot read
    (the gap is on the GPU): where a hand presses on a kick's cells the plate's film is
    thinner than the sheet thinks, so the sheet's part of the dent there lifts at the
    shallower film's pace. Measured small (a hand press beside a live kick keeps its memory
    to 0.04%), but on the same cells it is a shortcut. Found building 38l-2.
  - ~~**38l-4. The glass's stiffness against the hand**~~ — **Shipped, this PR**
    (STEFAN_FILM 0.25 → 0.30: a held press settles at a·STEFAN_FILM³/k, so the number is
    the glass's stiffness; the Press tool goes to 0.0045, holds a second and lets go by
    2.5 s on the Mac; story in `docs/plan-shipped.md` §38l).
  - **38l-5. A light press barely dents** (M; Medium). Since 38l a held press settles at a
    dent linear in how hard it presses (F/K), where before even a light press dug deep.
    The Mac's lighter recipe (one r30 disc at 0.004 every 60 ms, far lighter than the
    Press tool) went to 0.0129 before and 0.0292 after, and a phone's finger presses are
    lighter still. The press is laid as a gap change a frame, not a force: model the
    hand's press as a force over time (the third option the owner was offered), so a
    soft, long press digs as a soft hand on stiff glass does. Found filming 38l-4.
  - **38l-6. The lift's step reads the film at its start** (S; Low). `squeezeUpdate` (and
    the sheet's share in `lib/sheet.ts`) takes 1 − (1 − k)^((h/h_s)³) with the depth held
    at the step's start, so the glass lags where it opens fastest, the snap once a peeled
    press passes h_s: `npm run stefan` reads 2.14% of the press between 60 and 120 frames a
    second at 1 s (bar 3%). A midpoint step (the half step's gap, then the whole step's
    share) takes it to 0.1% in a model, but tried here it moved stefan's "the rate is
    k(h/h_s)³" line, which reads the rate at the step's start with the lab's big spring
    (0.02 a step), 16% off: that line has to read the rate at the step's middle, and the
    sheet and its check take the same step. Found building 38l-4.

- **38m. Film Physics is built and on in no look** — *pictures taken 2026-10-30: six looks at 0 and
  at 1 in the project's shared files (`film-physics-38m/`), for the owner to pick; judging §101.* (S, judging only; Medium for the soap and
  bubble looks). Airy's thin-film colour through the CIE functions (`src/lib/filmTable.ts`,
  #163) is gated by `filmPhysics`, default 0 and set by no preset (`types.ts:1093`). The
  research's item 8 shipped, and nothing shows it. Photograph the looks with iridescence at
  0 and 1 for the owner to pick, as 18b-1 did for the lamp.

- ~~**38n. Bubbles move by the look's own liquids**~~ **Shipped** (#603): μ from the look's
  Thickness (or its Viscosity word with Thin Gap off), σ and air's solubility from water or
  oil; Taylor–Saffman's 2/(1 + 2.26·Ca^⅔) with no tuned 1.5 and no floor; buoyant climb
  Δρ·g·sinθ·b²/(12μ); the film Bretherton's 1.337·Ca^⅔·(b/2) for the pocket's own speed, kept
  when it stops, packed where the film's age was. Story in `docs/plan-shipped.md` §38n.
- **38n-2. The film's colour at its real thickness** (S, GPU; Medium, the owner's eyes). A
  pocket moving at a millimetre a second in the default oil lays a film of tens of microns,
  far past interference (the table ends at 1.26 µm), so a real pocket between glasses shows
  no thin-film colour. The plate still maps the film's log thickness onto the old 0.35–1
  colour range: the order follows the flow, the scale is a look. Either Iridescence names
  that scale as a dial past nature, or the film goes through the Airy table at its real
  thickness and bubbles go clear.
- **38n-3. The rock tilts the air too** (S; Low). Bubbles climb by the hold's tilt only
  (`plateSin(tilt, 0)`); the solver also takes the rock's swing (`plateSin(hold, swing)`).

- **38o. The soap film's named shortcuts become items** — *numbered 2026-10-30 as 32f–32j; 32f
  (the frame's border) and 32g (black spots) shipped, 32h–32j open.* (M each; Medium: the lace).
  §32's notes (lines 51–59) name five shortcuts with no open ids: in-plane gravity on a flat
  plate, ζ 1.5 compressing minutes into 30 s (`src/lib/soapFilm.ts:74`,
  `src/gpu/soapFilm.ts:34`), uniform evaporation, rupture as a 0.5 s relaxation to 8 nm, and
  no surfactant transport. The two that set the lace are evaporation (real thinning is
  Plateau-border suction and marginal regeneration at the frame) and rupture (a hole
  nucleates where the film is thinnest, then opens at Culick's speed, which *is* right for
  a free film). Number them in §32 when its next thread opens.

- **38p. Light summed where it is light** (M, re-baseline; Medium on two projectors, beams
  and the lumia). Names the sites for **18k-linear** and **16c-linear**: the canvas is
  `bgra8unorm`, not `-srgb` (`src/gpu/stage.ts:43`), so the six-band sums
  (`plate.ts:150-153`), the two projectors' add (`:3298`), screen-over (`:2141-2143`), the beams
  (`wgsl/output.ts:287`) and the camera's bloom (`wgsl/camera.ts:128-130`) add encoded values.
  Beer–Lambert's powers commute with the encode, so the dye's depth is right either way;
  the bias is only in sums (a guess of 20–40% too bright in the mids).

- **38q. The camera's lens, not a grade** (S–M; Medium on the camera looks). Sharpens
  **31a**, **31e**. ACES on an 8-bit scene, bloom thresholded at 0.55 in encoded values, a
  smoothstep vignette (`wgsl/camera.ts:100-137`), and depth of field as a screen-radius mask
  and a 5-tap cross (`plate.ts:1104-1113, 2484-2487`), the camera's circle of confusion from
  the dye's opacity (`camera.ts:104-118`). Real: cos⁴ vignette, bloom as the lens's PSF on
  linear light with no threshold, and a disc kernel of radius A·|z − z_f|/z_f per layer.

- **38r. The rest gap** (S to read, retune if it moves; Low-Medium). `REST_GAP` 0.03 of a
  0.2 m plate is 6 mm (`constants.ts:389-401`); a show's glass sandwich is more like 1–3 mm
  (a guess to confirm with the owner's own glass). Looks would not change (forces are read as
  terminal speeds), but every h² (memory, mobility contrast, 18a-6's inertia, the
  labyrinth's N_B in 38d, the halo in 38i) hangs on it. Decide it before 38d and 38i.

  The owner, 2026-10-30: "Put the glass sandwich like it's supposed to be." So 2 mm in the
  middle at rest (a few millilitres under a top glass about 15 cm across is 1–3 mm; 2 mm is
  the middle, a judgement and not a measurement), in two parts:

  - **Part 1, one number (shipped, this PR, at 6 mm).** `DISH_GAP_METRES`
    (`src/lib/turntable.ts`) is the gap's only size. The field keeps 0.03 at rest, now in
    *gap units* (h₀/0.03), so every press, kick and check written in those numbers reads the
    same; a reader that needs a length multiplies by `DISH_GAP_FIELD_METRES` (`GAP_METRES` in
    the solver) or `DISH_GAP_FIELD_UV`, never by the plate's width. The gap kernels take the
    rest, floor and ceiling from the lib. Still 6 mm, so nothing moves: 38d and 38i can read
    h₀ from the constant now. `npm run gap` holds every reader to its SI physics at the
    rest gap and greps `src/` for a gap made a length by the plate's width.
  - **Part 2, 2 mm** (M; Medium-High on the water looks). Set the number, then retune what
    the thinner film changes on the physics, never on a bar. PR #605 tried it in one go and
    CI measured: `slump` (middle depth 0.233 mm against 0.212), `dish` (oil gripped at 0.27
    of A·r; drift 3.98× against 2.87×), `thingap` (held hand 0.4375, tight disc 0.0150,
    water 0.0800, glycerine conservation 0.0059), `fingerflow` (stroke moves 1.17%),
    `airblow`, `oillift` (lens 0.15 mm/s against 0.71), `sheet` (M 27× smaller), `ferrodrop`
    (`GAP_LC` 1.57 caps a drop at 1.314 against a sessile 1.510) and `lace` (the lab's stir
    under 9× the drag; scale it by the drag ratio, as 20c did). `turntable`, `framesway` and
    `magnetgain` need their windows on τ (#605 has them). Its leftovers, each its own item:
  - **38r-1. Does a sandwich slosh?** (S to decide, M to build). `lib/slosh.ts` solves a
    6 mm layer with a free surface (`SLOSH_REST_DEPTH`): between two glasses there is none,
    and at 2 mm its floating lens (`SLOSH_LENS`, 3.4 mm) would be deeper than the water
    under it. Either the tilt's slosh is the open dish's, or on the sandwich it is the thin
    gap's creeping flow. The owner's call.
  - **38r-2. A drop is a pancake past half the real gap** (S). `DROP_HALF_GAP`
    (`wgsl/plate.ts`) is 0.016 of the plate, half the 6 mm; half of 2 mm is 0.005, at which
    the common bead touches both glasses, and `lib/beads.ts`'s merge time is in units of it.
    Moves with 14ab-6 (#601), `npm run droplens` re-read.
  - **38r-3. A Gap dial** (S). At 2 mm water's drag time is a third of a second, not three:
    a push fades nine times sooner. If a look wants the old glide, the honest dial is the
    gap itself, not a stand-in for inertia.
  - **38r-4. Frame Sway on the default oil** (S). On a 2 mm film the cover's shear drag is
    three times the 6 mm one's, and #605 measured full Plate Rock leaving the glass inside
    half its room on the default oil (0.489% against 0.487% a frame): Frame Sway 0.5 and 1
    would slide the picture the same.

- **38s. One number per liquid** (S each; Low). The oil is 0.15 lighter than water for
  buoyancy (`capillary.ts:354`) and 0.12 for the spin (`SPIN_OIL_LIGHT`, `constants.ts:371`);
  the clear film's oil is 50× water whatever was poured (`OIL_REL_NU`, `thinGap.ts:577`); the
  ferrofluid's Δρ is water's 200 kg/m³ whatever it sits in (`forces.ts:410`,
  `standing.ts:95`; EFH1 is 1210 kg/m³, so against a 0.88 oil it is 0.375); the ferrofluid's
  viscosity is fixed in any field (`FERRO_NU`, `constants.ts:85`; Shliomis' rotational
  viscosity adds 10–30% at saturation, a guess for EFH1); twelve looks set dye diffusion to
  0 (`fluid.ts:1008-1009`; real D is never below about 4e-10, tiny on a show's time, so this
  is bookkeeping). All belong to **18d-3** and **18d-4**'s one-table-per-bottle.

- **38t. Updraft is noise between two glasses** (S; Low-Medium). `snoise(p·0.05 − t)·air·4dt`
  plus a uniform −8dt (`thinGap.ts:348-353`, `forces.ts:224-228`). A draught has no free
  surface to shear between two glasses; a fan acts on an open dish's surface or by cooling
  the glass (38f). Either an open-dish surface shear or a cooling, not a noise.

Also found, left with their owners: the ferrofluid's dye is moved by two exchanges that
tell it where the black went (`phaseDisplace`, `wgsl/fluid/phase.ts:330-370`) rather than
riding the carrier's velocity; once **29c-9**'s two-fluid solve exists, that velocity
carries it and `phaseDisplace` goes (write it into 29c-9's thread). The closeup drop's pull
is at full share (`ferroDrop.ts:45`) while the layer under it has none (`standing.ts:80`),
and the drop has no μ0Mn²/2 jump at its surface, so it cannot peak in a normal field: for
the closeup's thread after the macro view, with **29a-1..3** and **9t-2**. The straw's
Saffman–Taylor lobes are drawn with an effective gap 63× thinner than the real one
(`bubbles.ts:312-319`, `wgsl/air.ts:94-103`); at these capillary numbers a 6 mm air front is
stable, so real fingering would grow in the thin-gap pressure solve, an L for 18i's thread.
The lace film's equation is right but its numbers are in grid units (`wgsl/film.ts:65-72`),
for 20b's thread. The Photograph style's paper is painted (`plate.ts:2750-2767,
3259-3264`; Kubelka–Munk twice through the dye plus a Fresnel reflection is the real
thing). The particles fade by sin(π·age) on a timer (`wgsl/particles.ts:202, 232`), a
rendering device for dye below the grid and not a fluid claim. The lamp's colour hold is
applied after the additive glints and lines, which a lamp's colour cannot reach (for
**35e-3**).

## What is already physical, and should be left alone

The Hele-Shaw solve (implicit 12ν/h² drag, h-weighted mobility on harmonic faces, the open
rim at p = 0, the Brinkman hand, Grunberg–Nissan species viscosity, the two-layer film
drag); the oil's lift from Δρgh²/12ν; the slump (Huppert's gravity current in flux form)
and the two-layer shallow-water slosh; the oil as flux-form Cahn–Hilliard with a curvature
force and conservative Marangoni transport; `lampBoil.ts`. The magnet's field (Derby–Olbert,
checked against Biot–Savart), the Kelvin force at the ferrofluid's Darcy mobility, the
standing film's thin-film Rosensweig model. The bubbles' drainage time (Stefan–Reynolds),
the lace film's thin-film and disjoining equation, the soap film's Darcy flow and its Airy
colour. Beer–Lambert through the dye, Planck and CIE for the lamp's colour, the derive
pass's optical path with real indices, and the projector's drop and bubble bands from the
pupil's acceptance with no highlight. A later pass should not touch these to "tune" a look.
