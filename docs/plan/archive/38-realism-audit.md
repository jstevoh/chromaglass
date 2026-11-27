# Archive: 38. Realism audit: what still imitates, after §18 (asked 2026-10-30)

The closed items of [`docs/plan/38-realism-audit.md`](../38-realism-audit.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**38u-5. Mid and treble stir the dye directly**~~, and ~~**38u-4**'s multiplier~~ —
  **Shipped 2026-11-13** (the story is in `docs/plan-shipped.md`). The solver's step takes no
  sound; every look carries one cord, the sound's mids on Turbulence; `npm run musicstir`.
  The rest of 38u-4 (the stir as a tool, not curl noise on a clock) stays open.

## The top picks

- ~~**38a. The lamp is a condenser, not a wandering painted glow**~~ — **Shipped, this PR**
  (the Hot-Spot is the projector's lamp lever: the bulb's image off the lens's aperture,
  `src/gpu/wgsl/lampField.ts`; the heat lit evenly; `npm run lampfield` 9/9, 1 of 7 on the old
  plate; story in `docs/plan-shipped.md` §38a). Left from it: 38a-2, 38a-3.

- ~~**38b. Bubbles that never appear or vanish by a clock**~~ **Shipped** (#603, with 38g and
  38n): no timers, fades, age-as-colour, daughters or wobble; a pocket inflates at a breath's
  rate, leaves at the open round rim (area falling at π·bσ/3μ), by a merge, under a drop, or by
  dissolving at Henry's law's rate, which is years; breakup at a critical deformation from
  the strain. `npm run bubblephysics` 24/24. Story in `docs/plan-shipped.md` §38b.
- ~~**38c-3. A Soap Breakdown dial**~~ (S; the owner chose it, 2026-10-31). **Shipped**
  (`npm run soapbreak`, 4/4; story in `docs/plan-shipped.md` §38c-3).
- ~~**38f-2. The oil's free energy let a smear of it rest.**~~ **Shipped** (2026-11-11, with
  38f-1): mixMu's double well is a deep quench, its spinodal 0.05 from either pure liquid
  (`OIL_SPINODAL`) instead of the quartic's 0.21, so the haze the carried heat's plumes
  left behind comes apart into the bodies. Story in `docs/plan-shipped.md` §38f-2.
- ~~**A standing lamp's cool top.**~~ **Shipped** (27f-9e, 2026-11-12): under a standing
  plate's lamp the heat crosses the gap to the cool upper glass at π²κ/h² on real seconds
  (`lampCoolOf`, mixForce), so Lava Lamp's wax cycles. Every other look still cools by
  Heat Decay on the look's clock (below). Story in `docs/plan-shipped.md` §27f-9e.
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
- ~~**38h-15**~~ *shipped 2026-11-11.* A bubble's outline drawn from its own disc at the
  screen's resolution, not from the air field's texels (`wgsl/bubbleShape.ts`): the owner's
  "they look like a old computer drew them". `npm run bubbleround`. Story in
  `docs/plan-shipped.md` §38.
- ~~**38h-17**~~ *shipped 2026-11-11.* The oil beads' rings read at the screen's resolution
  from their list, not the 512² eight-bit mask (`wgsl/beadShape.ts`). `npm run beadround`.
  Story in `docs/plan-shipped.md` §38.
- ~~**38h-4**~~ *shipped 2026-10-31.* The back plate's lamp takes the pigment's grain as
  dye, T^grain (`lampGrain1`), as the front's does. `npm run grainedge` line 4. Story in
  `docs/plan-shipped.md` §38.
- ~~**38h-3**~~ *shipped 2026-11-01.* The oil's shadowgraph and the dye's are one term:
  `defocusShadow` (`plateTransmit.ts`) draws the whole column's ∇²OPL (dye, oil, pour,
  film, gap) at the defocus disc's scale; the oil block's own term and refractionOptics'
  are gone. `npm run nolight` line 13. Story in `docs/plan-shipped.md` §38.

## Smaller, each worth doing when its area is open

- ~~**38l-2. The kick's sheet lifts by the same law**~~ — **Shipped, this PR** (the sheet
  takes the suction's share cell by cell on the dent it holds and node by node on its own
  solve once the finger has let go (38r-10), so the shader takes it everywhere; `npm run sheet` 18/18; story in
  `docs/plan-shipped.md` §38l).
- ~~**38l-4. The glass's stiffness against the hand**~~ — **Shipped, this PR**
  (STEFAN_FILM 0.25 → 0.30: a held press settles at a·STEFAN_FILM³/k, so the number is
  the glass's stiffness; the Press tool goes to 0.0045, holds a second and lets go by
  2.5 s on the Mac; story in `docs/plan-shipped.md` §38l).
- ~~**38n. Bubbles move by the look's own liquids**~~ **Shipped** (#603): μ from the look's
  Thickness (or its Viscosity word with Thin Gap off), σ and air's solubility from water or
  oil; Taylor–Saffman's 2/(1 + 2.26·Ca^⅔) with no tuned 1.5 and no floor; buoyant climb
  Δρ·g·sinθ·b²/(12μ); the film Bretherton's 1.337·Ca^⅔·(b/2) for the pocket's own speed, kept
  when it stops, packed where the film's age was. Story in `docs/plan-shipped.md` §38n.
- ~~**38r-6**~~ `thingap` 5 read the Spin's one-cell mask edge, not the solve's residual:
  Spin's stir mask is blurred [1 4 1] over a cell's neighbours (#641). Story in §38r.
- ~~**38r-7**~~ The rhythm sheet at 2 mm: its waits are on the film's own clock (#641).
- ~~**38r-8**~~ The Blow's breath is 14 m/s (#641).
- ~~**38r-9**~~ Plate Rock past real above the default: `rockPast` in `lib/plateRock.ts`,
  1 up to the default 0.45, then geometrically to `ROCK_PAST` = (6 mm/h₀)² = 9 at full,
  the 6 mm gap's Darcy pace, so the dial still runs gentle to extreme at the real gap (#641).
  The default stays real.
- ~~**38r-10**~~ The kick's sheet holds against the lift while the finger presses, as the
  hand holds the glass; `rides`' sheet "is local" line reads a dent and a half out against
  the sheet's own bowl stamped, not 70 cells against the glass (#650). Story in §38r.
- ~~**38r-12**~~ The thin solve's warm start fitted to the step: at 2 mm the flow dies inside a
  step and last step's P alone was a worse guess than zero; now the last two pressures are fitted
  to this step's b in the solve's own energy (`wgsl/thinWarm.ts`), `encode`'s thin residual
  1.965e-1 → 1.072e-2 (#655).
  Story in §38r.
- ~~**38r-15**~~ A flushed glycerine dish kept 0.9% too much at 2 mm: the grid's edge cells,
  past the solve's open rim but inside its radius, held what the flow pushed out; the rim's
  clearing now takes the solve's own set (`pastOpenRim`), `npm run flush` 0.759 → 0.751.
  Shipped in #655; the story is in `docs/plan-shipped.md` §38r.

## 38u. A third pass: what is still drawn, scripted or pushed by sound (asked 2026-11-13)

- ~~**38u-1. Edge Detail**~~ — **Shipped, this PR** (47a-7's part a; the setting is gone, on the
  desks and the phone). The closeup read the plate through two octaves of value noise that
  drifted on the clock and swelled on the beat. Surface tension holds an edge smooth at this
  scale. Part b of the owner's report (the beads' scalloped outline at Edge Detail 0) is the
  beads' 512² mask, fixed by 38h-17 in its own PR.
- ~~**38u-2. Depth / Focus drew a lamp above the plate**~~ — **Shipped, this PR.** A paper's
  fibre on the ground, the dye's shadow thrown down-right onto it (20% across a pool's edge in
  the lab) and thick dye brightened over thin. Depth / Focus is the camera's depth of field now.
- ~~**38u-3. The bubble film's colour swayed on a sine of the time**~~ — **Shipped, this PR.**

On in every look, or nearly:

- ~~**38u-5. Mid and treble stir the dye directly**~~ — **Shipped 2026-11-13** with 38u-4's
  multiplier (the owner chose "route it through cords"; see the note at the head of this file,
  `npm run musicstir`, judging 131). As found: (S; High). `sim/fluidSimulation.ts:3076-3082`
  sets `spin` from (0.6·mid + 0.4·treble)·Audio Impact over 0.08, and `forces.ts:134-145`
  turns it into a noise curl wherever there is dye. No actuator and no cord. Either it goes,
  or it is a cord to something real: the motor, Beat Squeeze, a tap on the glass as −∂h/∂t.
  none.
- ~~**38u-7. The force between colours changes sign in patches**~~ — **Shipped (2026-11-13).**
  Polarity's push (`forces.ts`, and the CPU's `applyImmiscibility`) was multiplied by 1 + 2·snoise,
  negative under −0.5: there it pulled unlike colours together. The noise is gone, so the push has
  one sign everywhere (`npm run forces` 6: 76 of 76 rows of a straight boundary push the colours
  apart, the spread along it 0.11 of the mean; 26 of 76 pulled them together on main). The force
  itself is **18d-6**'s (dyes in water mix, only oil and water hold a line).
- ~~**38u-12. Rain Drip pulls heavy dye "down" a level plate**~~ — **Shipped (2026-11-13).**
  Rain Drip is now the dye's weight along the plate, scaled by the tilt (`dripOf`: the dial times
  Gravity, `plateUpright`; g sin θ, nothing flat). The seven looks that set Rain Drip at 0.2 or more
  got `plateUpright: 0.25`, a plate tipped about 15 degrees, so they still streak, at a quarter of
  the pull; Velvet Underground got 0.05, about 3 degrees, so its pools stay pools and still move
  (`npm run pools` on the Mac: level, they moved 8.9% against frozen's 8.5%, under the 1.5x bar; at
  0.05 they keep 95/93/93% and move 44% against 11%; at 0.10 and 0.15 two pools drain to 39–70%); the weak ones (Classic 0.15, Stardust Collapse, Home Movie 0.1) now streak only when
  tipped. A plate rocked by a hand has its own weight in the rock's term. `npm run forces` 7. Open
  for the owner's eye: the tilt turns on the buoyancy and the lamp's heat a standing plate has
  (docs/judging.md §139), and the thick (non-thin-gap) path still runs along -y, not Tilt Direction.
- ~~**38u-14. A clear drop's lens is drawn at a third**~~ — **Shipped (2026-11-13).** The oil
  drop's band is at full strength in clear water (it was 0.35 with no dye: 70% of the plate in the
  band where dyed water gives 24%), and the clear oil's tint is exp(−α·thickness), the same colour on the flat top and
  fading to the water's over the meniscus. `npm run droplens`. Left open: a bubble in clear
  liquid is still drawn at 0.7 of its ring (`mix(0.7, 1.0, filmT)` in `plate.ts`); making it whole
  moved `npm run filmlook`'s closeup00 line by one pixel on the GitHub Mac's Metal GPU (it passes in
  SwiftShader and on the owner's Mac), so it is its own item to be measured on that GPU.
- ~~**38u-16. A look saved before 38u-5 has no stir cord**~~ — **Shipped 2026-11-22** (the
  story is in `docs/plan-shipped.md`). A saved look from before version 3 is read with the cord
  its own dials call for, once (`withStirCordOnce` in `userPresets.ts` `readAsNow`, not in
  `sanitizeSettings`, which clamps every patch); the version is the mark, so a cord pulled and
  saved stays pulled; `npm run musicstir` section 7.

How it is ranked: what a person would see change on the wall, against what it costs to
build and what it adds to the frame. S is under a day, M a few days, L a week or more.
Every item here keeps today's look reachable until the Mac has judged the new one (the
operating rules), and each ships from its own thread with the check that measures it
written first. Line numbers are as read on main at d07ac31.
- ~~**38u-8. Granulation is value noise**~~ — **Shipped** (the story is in
  `docs/plan-shipped.md`). The owner's call: default 0 in every look, the dial kept;
  `npm run glassstill`. The real grain (a concentration carried below the grid) stays 47a's.

## The top picks

- ~~**38b-2. An Air Dissolves dial**~~ **Shipped** as **Bubble Melt** (the owner, 2026-10-31:
  "a bubble dial for them to melt away"): a factor on air's diffusivity in the Henry's-law
  shrink, 1 at 0, then 10^(6 + 5v), very gentle to very extreme (`meltFactor`, `lib/bubbles.ts`); Settings → Look, desks,
  MIDI, patches, the phone. `npm run bubblephysics` 28/28. Story in `docs/plan-shipped.md` §38b-2.
