# 38. Realism audit: what still imitates, after §18 (continued)

Part 2 of 2 of §38; it begins at 38v. The section starts in `38-realism-audit.md`.

## 38v. A fourth pass (2026-11-21)

A read-only sweep of the whole visualization code at 801a815e (Antigravity, branch
`antigravity/realism-sweep`, commit 7755e5fa), the same question as 38u: what is drawn,
scripted or pushed by sound rather than solved. Every finding was then checked against the
code by a Claude Code pass, line by line: the WRONG ones are dropped, the COVERED ones are
noted on the item that already holds them (only where the check found a new fact), and
where the plan's own text was wrong it is corrected in place (15g-2, `18-physics-3.md`'s
"Already physical", `01-sharp-liquid.md`'s header). Most findings belong to an open section
and went there under its next free id, each ending "(38v, from RS-n.)"; the ones with no
other home are 38v-1 to 38v-9 below. RS-n is the sweep's own numbering, kept so the
verifier's evidence can be found.

Ranked: the live bugs a person sees today first, then High, then Medium from the smallest
cost, then Low.

| # | Id | What | File | Cost | Priority | |
|---|---|---|---|---|---|---|
| 1 | 29a-10 | Every ferrofluid closeup draws the plate through white milk (RS-25) | `29-ferro-drop.md` | S | High, live bug | new |
| 2 | 9ac | Ferrofluid is weightless under Plate Rock and on a standing plate (RS-22) | `09-ferrofluid.md` | S | Medium, live bug | new |
| 3 | 15g-17 | The pointer shoves bubbles and beads; a pop pushes and swirls (RS-37) | `15-tools-on-liquids.md` | S | High | new |
| 4 | 18c-14 | The ambient seed pours dye and heat into every look (RS-38) | `18-physics-2.md` | S–M | High | new |
| 5 | 18c-3b | The mouse's dye stamp and the themes' kicks lay no volume (RS-39) | `18-physics-2.md` | M | High | updates |
| 6 | ~~38v-1~~ | Sound Drive's built-in hands become cords on real actuators (RS-43) | here | L | High | shipped |
| 7 | 18c-13 | Every drop splashes as water, and its satellites add dye (RS-13) | `18-physics-2.md` | S | Medium–High | new |
| 8 | 9ad | The domes rise on \|B\|, not on its normal part (RS-20) | `09-ferrofluid.md` | S–M | Medium–High | new |
| 9 | ~~18i-2~~ | Beads slide, merge and appear on fixed numbers (RS-11) | `18-physics-2.md` | M | Medium–High | shipped |
| 10 | 36e-6 | The lamp's buoyancy rides past the speed cap; heat diffused twice (RS-2) | `36-analog-operators.md` | S | Medium | new |
| 11 | 38v-2 | Comet's pull flickers with the beat, and is absent on the open plate (RS-3) | here | S | Medium | new |
| 12 | 29a-11 | The closeup drop is clipped to a fixed gap and loses volume (RS-21) | `29-ferro-drop.md` | S | Medium | new |
| 13 | 9ae | Ferrofluid rounds at the step rate, not in seconds (RS-23) | `09-ferrofluid.md` | S | Medium | new |
| 14 | 9t-11 | The domes' film has no upper wall; two magnets start nothing (RS-24) | `09-ferrofluid.md` | S | Medium | new |
| 15 | 18e-9 | A thin film's optical path steps the wrong way (RS-26) | `18-physics-2.md` | S | Medium | new |
| 16 | 32d-6 | Soap film on the plate takes out 8× the light Airy allows (RS-29) | `32-soap-film.md` | S | Medium | new |
| 17 | 38r-17 | The milk scatters through 6 mm, not the cover's gap (RS-30, RS-28) | `38-realism-audit.md` | S | Medium | updates |
| 18 | 15g-18 | A press twists the liquid it squeezes (RS-36) | `15-tools-on-liquids.md` | S | Medium | new |
| 19 | 15g-2 | A still breath carries the ferrofluid out (RS-40; plan text corrected) | `15-tools-on-liquids.md` | S | Medium | updates |
| 20 | 9af | The magnet's strength and walk ride the music outside the cords (RS-44) | `09-ferrofluid.md` | S | Medium | new |
| 21 | 38u-6 | The surge's speed terms, measured (RS-45) | `38-realism-audit.md` | S | Medium | updates |
| 22 | 38v-3 | The kick pours soap and seeds the reaction (RS-46) | here | S | Medium | new |
| 23 | 38v-4 | The spin and the cover read one viscosity and one gap for every layer (RS-50) | here | S | Medium | new |
| 24 | 32g-2b | A ruptured cell thins on below Newton black (RS-12) | `32-soap-film.md` | S–M | Medium | new |
| 25 | 38h-6 | The ferro glint's nine-arm star lights projected looks (RS-27) | `38-realism-audit.md` | S–M | Medium | updates |
| 26 | 38l-5 | Bass Press lets go in one step (RS-42) | `38-realism-audit.md` | S–M | Medium | updates |
| 27 | 38v-5 | The chorus turns the look's dials outside the cords (RS-47) | here | S–M | Medium | new |
| 28 | 36e-4 | The boil carries heat at the steam's speed (RS-1) | `36-analog-operators.md` | M | Medium | updates |
| 29 | 38v-6 | Cords that drive noise dials, not actuators (RS-49) | here | M | Medium | new |
| 30 | 18l-8 | The gap and the dye's depth are not Beer–Lambert on most looks (RS-51) | `18-physics-3.md` | M | Medium | new |
| 31 | 38v-7 | Thin film and bead cores brighten a backlit plate (RS-33) | here | S | Low–Medium | new |
| 32 | 18d-13 | A dye has no partition coefficient between liquids (RS-14; plan text corrected) | `18-physics-2.md` | M | Low–Medium | new |
| 33 | 1b | Liesegang steps by frames and grid cells (RS-4) | `01-sharp-liquid.md` | S | Low | updates |
| 34 | 22g, 22r | The spin's viscosity misses the glycerine; tanh on the weight (RS-5) | `22-spin.md` | S | Low | updates, 22r spin half shipped |
| 35 | 18m-3 | The slump reads one global viscosity (RS-6) | `18-physics-3.md` | S | Low | updates |
| 36 | 1k | Retire the sharpen pass still behind Sharpness and CC15 (RS-9; plan text corrected) | `01-sharp-liquid.md` | S | Low | new |
| 37 | 18f-4, 38s | Vogel's law for warm glycerine; the cover's density is water's (RS-10) | `18-physics-2.md`, `38-realism-audit.md` | S | Low | updates |
| 38 | 15g-19 | The straw's lobes are clipped at a reach, not conserved (RS-15) | `15-tools-on-liquids.md` | S | Low | shipped |
| 39 | 20b-17 | The lace's solvent evaporates under the cover (RS-17) | `20-lace-and-holes.md` | S | Low | new |
| 40 | 47b-4 | The glint's spikes add light the disc keeps (RS-28) | `47-macro-photography.md` | S | Low | new |
| 41 | 47n-8 | The tank's glow adds white at any exposure (RS-31) | `47-macro-photography.md` | S | Low | new |
| 42 | 18e-2 | The moiré bends by the dye's slope, not the path (RS-34) | `18-physics-2.md` | S | Low | updates |
| 43 | 29a-6, 38p | A hard switch at total reflection; encoded and linear light summed (RS-35) | `29-ferro-drop.md`, `38-realism-audit.md` | S | Low | updates |
| 44 | 38v-8 | The room stir, the video flow and the splat step per frame (RS-41) | here | S | Low | new |
| 45 | 27a-8-3 | Two plate uniforms nothing reads (RS-48) | `27-controls-you-see.md` | S | Low | new |
| 46 | 36e-4b | The boil's bubbles are one size (RS-16) | `36-analog-operators.md` | S–M | Low | new |
| 47 | 38r-1 | The slosh is added after the thin solve (RS-7) | `38-realism-audit.md` | M | Low | updates |
| 48 | 18d-8 | Polarity's forces and the liquids' stir go with the CPU fields (RS-8, RS-19) | `18-physics-2.md` | M | Low | updates |
| 49 | §11.7 | The Lumia from a real reflector (RS-32) | `11-mixer.md` | M | Low | new |
| 50 | 38v-9 | Defaults that keep a fake, and a clean-glass start (RS-53) | here | M | Low | new |
| 51 | 18b-2 | Where the blend modes act on the lamp (RS-52) | `18-physics-2.md` | — | note | updates |

Notes that only point here: 38e (to 9ae), 38k-3 and 9t-5 (to 9t-11), 9j (to 9af), 29a-3 (to
29a-11), 38m and 38u-9 (to 38v-7 and §11.7), 38s (to 38v-4), and 38u's straw line under
"Also found" (refreshed: 15g-12 shipped Paterson's count, see 15g-19). RS-18 was dropped
(WRONG, or held whole by an older item), and so was the half of RS-19 that said the
viscosity floor in `liquidProps.ts:84-99` engages: no bottle on the shelf is thinner than
water, so it never does.

- **38v-2. Comet's pull flickers with the beat, and is absent on the open plate** (S;
  Medium). `thinGap.ts:330-357` adds the `cometX/Y` pull inside `hsBody`
  (`fluidSimulation.ts:3205`), but `fluid.ts:814`'s `thinBody` leaves Comet out of the
  test that opens `hsBody`, so the pull acts only while a drip, the air, the breath or the
  rock happens to open it: on Comet River (`presets.ts:103-145`) it switches on and off
  with the beat, and the open plate has none at all. A comet's streaming is a held tilt: a
  dense pool on an inclined plate slides at the Darcy speed Δρ g sinθ h²/(12μ). Make Comet a
  held tilt through `S.up`, so every body slides by its own weight and viscosity. Check: at
  the dial's 0 a dense pool drifts under 0.1 cell in 5 s; at a set angle its speed is within
  15% of the Darcy speed, beat or no beat. (38v, from RS-3.)

- **38v-3. The kick pours soap and seeds the reaction** (S; Medium). On a kick
  `LiquidVisualizer.tsx:2606-2623` lays `addMix({soap: 1})`, and `3025-3030` calls
  `seedChemistry` when bass > 0.5 and a 12% roll lands, or on a 0.4% roll a frame
  (Turing Print and Neon Coral Reef; `reactions.ts:142-162`). Soap on water is a Marangoni
  stress τ = ∇σ with Δσ from 1e-3 to 3e-2 N/m, and only where someone puts it; a reaction
  starts where its reagents meet. Make each a bottle on the bench poured through an
  `areaPour` cord, so the look keeps its pulse and a person can see and change it. Check:
  over 60 s the soap and seed totals are the same under loud music and silence with no
  cord, and follow the cord's depth with one. (38v, from RS-46.)

- **38v-4. The spin and the cover read one viscosity and one gap for every layer** (S;
  Medium). `fluidSimulation.ts:3346-3347` takes the spin's ν from `carrierViscosity` (1e-6
  or 2e-5 m²/s) while the thin gap solves with `thicknessViscosity(0.45)` = 22.4 cSt;
  `LiquidVisualizer.tsx:4815` hands Layer 0's `coverUnits` to every layer, and so do
  `LiquidVisualizer.tsx:4723`, `bubbles.ts:264` and `fluidSimulation.ts:2957`. Nine
  'thin' looks run on that mismatch. The spin's lag time is τ = h²/(12ν), so a ν 22 times
  off is a lag 22 times off. Read ν and the gap per layer from the one place the thin solve
  reads them. Check: for each layer, the spin's ν equals `thicknessViscosity` and the
  cover's gap equals that layer's; `npm run spin` stays green. (38v, from RS-50.)

- **38v-5. The chorus turns the look's dials outside the cords** (S–M; Medium).
  `useMusicIntelligence.ts:595-614`, on a chorus, adds 0.2 to turbulence, 0.15 to
  saturation and 0.2 to Impact, and scales turbulence by 0.7 + 0.6·energy;
  `LiquidVisualizer.tsx:4290` (`plateRock`) and `4319-4359` (`beatSqueeze`) ride it too. A
  section change is the operator's cue, not a dial that moves itself. Make each a cord depth
  on the look (default patches that keep today's lift), so it shows on the desk and
  answers Impact 0. Check: a chorus at Impact 0 with no cords leaves every setting at the
  look's value; with the default patch, the lift is today's within 5%. (38v, from RS-47.)

- **38v-6. Cords that drive noise dials, not actuators** (M; Medium). The house looks'
  patches cord `vorticityConfinement` 16 times, `platePressure` 8, the beads 7,
  `oilTension` 6, `buoyancy` 5, `fingering` 5 and `lacing` 3, and Turing Print cords a dead
  `mazeDetail`. A cord onto a property (a tension, a buoyancy) changes what the liquid is
  on the beat; onto a noise dial it is the old scripted motion with a cable. Move each onto
  the actuator a performer would use (a pour, a press, the motor, the lamp's heat), one
  look at a time with the owner judging. Check: a static audit in `npm run soundpatch`
  that lists every cord whose target is not an actuator and fails on a new one; the dead
  cord goes. (38v, from RS-49.)

- **38v-7. Thin film and bead cores brighten a backlit plate** (S; Low–Medium).
  `plateThinFilm.ts:128-137` multiplies the light by up to 1.8 using the reflection table
  on a plate lit from behind (`filmColourAt`, `plate.ts:579-583`), and the beads' cores add
  30% at any focus (`plate.ts:3376`, `plateTransmit.ts:123`). A film or a bead in
  transmission can only take light away (T ≤ 1); a bead's bright core is its lens focusing,
  which depends on the focus. Use `filmTableAt(t, true)` capped at 1, and drive the core
  from `defocusShadow`. Check: add thin film and beads to `scripts/nolight.mjs`, so no pixel
  passes the lamp's level. Updates 38m and 38u-9. (38v, from RS-33.)

- **38v-8. The room stir, the video flow and the splat step per frame** (S; Low).
  `roomStir.ts:97-131` pushes each step with no dt (capped at `ROOM_MAX` 0.25), as do
  `videoFlow.ts:67-84` and `splat.ts:237-251`, so at the governor's 30 steps a second they
  move the liquid half as far in a second as at 60. A stir is a force over time. Scale each
  by the step's seconds over 1/60. `inkTitleWash` already does. Check: a tracer's
  displacement over 5 s at 30 and 60 steps a second within 10%. The "Kept, named as dials or
  looks" list in `18-physics-3.md` points here. (38v, from RS-41.)

- **38v-9. Defaults that keep a fake, and a clean-glass start** (M; Low). `DEFAULT_SETTINGS`
  (`types.ts:1070-1333`) still turns on most of what §38 calls drawn or scripted, and
  `LOOK_BASE` (`lookFade.ts:91-104`) zeroes only the beads, cells and fingering. Each default
  moves to its physical value as its own item ships, never in one sweep: turbulence 38u-4,
  polarity 38u-7, granulation 38u-8, Glass Smear 38u-11, surge 38u-6, evaporation 18g-4 and
  18c-2, the black ground 18b-2, the gooey edge 18b-4, Film Physics 38m, the vignette 38a-2
  and 38u-9, Sound Drive 38v-1, saturation 18l-8. Until then a "clean glass" start on the
  Design desk: the lamp, a thin gap, Transmission 1, Thickness Optics 1, saturation 1, Sound
  Drive off, the noise dials at 0. Check: the clean start under loud music adds nothing
  without a cord; every built-in look renders as before (`npm run panel`, `npm run desk`).
  (38v, from RS-53.)

## 38w. Classic Light Show as a real dish (2026-11-21)

The owner, 2026-11-21: Classic "looks nothing like a traditional liquid light show". Watched
against the Joshua Light Show, Glenn McKay, Bill Ham and the period photographs (the gap list
is in the project's files).

- **38w-2. Classic's motion as a hand's, measured** (S–M; Medium). The references rest about
  40% of the time and swell every 12 to 20 s from a tilt, a press or a fresh pour. 38w-1 gave
  the look a hand (Plate Rock, the kick's press) and stopped the motor, but nothing measures
  the rest-and-swell rhythm in the app. Check: on the Mac, the flow's speed over a minute of
  the band has a median under a third of its peaks, peaks 12–20 s apart (`moving` style).
- **38w-3. A fresh pour's radial streaks** (M; Low–Medium). After a pour the references show
  dye streaming out from the drop in rays, the Marangoni spread of a new drop on the water.
  Classic's automation pours, but a drop lands as a disc. Model the spreading drop's surface
  tension gradient (18c's drop impact is where it lands); measure the angular structure round
  a fresh drop in the lab.
- **38w-4. The old Classic's plate as a look of its own** (S; Low). The neon pools on black
  that Classic was (11 blobs, screen blend, gooey) are the opposite of a real dish but were a
  look some may want. Offer it as "Neon Pools" if the owner asks; until then it is gone.
- **38w-5. The song's chorus stirs a dish that does not stir** (S; Medium). Classic and Lava
  Lamp hold Turbulence and Sound Drive at 0 (no curl noise, no stir cord, no music hands), but
  `useMusicIntelligence` still adds 0.2 to both in a chorus when the song has a map
  (`src/hooks/useMusicIntelligence.ts`, the section switch), so a mapped song's chorus stirs and
  pours into the dish again: the red flood and kick bubbles 38w-1 took out. A section should
  change what the look's hand does (a harder rock, a press), not switch on a motor the look
  turned off. Check: Classic with a song map through a chorus keeps classicdish's cells apart.
- **38w-6. The snare's swirl is vorticity confinement** (S–M; Low). Classic's snare cord
  raises Vorticity Confinement, a numerical device that puts back the small eddies the solver's
  diffusion loses; nothing in a dish does that. The real snare in a show is a finger or a
  straw flicking the water. Replace the cord with a flick (the hand tools' impulse, 27f) and
  measure the cells still apart after a run of snares.
- **38w-7. Small cells come out as rounded squares** (S–M; Med). Filmed 2026-11-21 at gpu=mid:
  the smallest orange cells in Classic read as rounded squares, not discs. A real oil drop
  squashed between two glasses is round, because surface tension minimises its rim. Two
  suspects: the Cahn–Hilliard Laplacian's five-point stencil, which is anisotropic at a few
  cells across and favours the grid's axes, and the lay packing cells on a grid. Measure
  roundness (perimeter² / 4π·area, or the spread of rim radius by angle) for each cell after
  classicdish's run at 192² and 384²; if it worsens with smaller cells and lifts at 384², use
  the isotropic nine-point Laplacian in the oil's chemical potential.
- **38w-11. classicdish's size bar on the references' own measure** (S; Medium). The bar is a
  cell diameter, 5–15% of the frame's height, a proxy chosen after the owner's call for more
  detail; the stills were measured by the watch tool's form scale, a correlation length against
  the width (9.0% on the round-two film, 5.1% on the stills). Render the lab plate
  (`lab.render`), crop it to the wall's frame, run watchdesign's `corrLen` on it and bound
  that against the stills' band, so the check and the references read the same quantity.
- **38w-12. Splodascope and Clock Glass laid at the solver's grid too** (M; Medium). Both still
  lay their dye on the CPU's 192 and carry it up, so their colour edges are a 192 cell soft
  under an oil rim sharp at 768. Lay them through `SolverSeeds` as Classic is.
- **38w-13. The solver's seed survives a regrid and a lost device** (S; Medium). Classic's
  dye lives only in the solver's texture: a regrid (Quality) or a device loss rebuilds the
  solver from the CPU's fields, which never held it, so the dish comes back empty. Keep the
  laid arrays (SolverSeeds.capture) and lay them again on a rebuild.
- **38w-14. One seed texture for every capture** (S; Low). SolverSeeds keeps a single seed, so a
  second Classic captured later (a set list arming it twice with different seeds) overwrites the
  first. Key the kept seed by the look's id or drop it once laid.
- **38w-16. The dye inside Classic's cells lays as soft rounded squares** (S–M; Medium). With the
  rims crisp, the colour inside the bigger cells still shows a soft square-cornered patch where
  the lay put it (`classicCell` in `src/lib/oilLay.ts`). A drop of dyed oil is one colour to
  its rim. Lay each cell's oil dye to fill its disc, and measure the dye's spread inside each
  cell (its coefficient of variation) in classicdish.
- **38w-17. A darker mottled network in Classic's water** (S; Medium). In the 1024 render the
  water between cells shows a faint darker web, which the references' flat dyed water does not.
  Suspects: the wash's dye pooling in the films between cells, or the relief's shading. Measure
  the water's luminance spread away from the rims, find which field carries it, fix it there.
- **38w-18. The oil/water interface sharp in the solver** (L; Low). 38w-15 draws the rim sharp
  from the solver's tanh band; the solver still carries the band (Cahn–Hilliard's width is set
  by the grid). A conservative level set or a volume-of-fluid interface would carry the step
  itself, and the dye's own mixing across the band with it. Worth it only if a check finds the
  band's mixing showing through somewhere 38w-15 cannot reach (the chemistry, the oil's dye).
- **38w-19. A held Press on a domed gap never comes to rest** (M; Medium). 38w-1 gave Classic a
  plateCurve of 0.2 and main's deploy found `npm run heldpress` red: with the Press held on the
  thin gap, the far plate's speed stayed at 4.5e-4 against the check's 3e-4, and the bubbles'
  at 7.4e-5, not a twentieth of the closing. The same glass flat (plateCurve 0) reads 4.3e-5
  and 1.2e-5; platePressure 0.25 with the dome still fails, so it is the dome. The rest gap is
  `cover - GAP_REST·plateCurve·(r²-0.5)·2` (gap.ts), and a held press clamps it at rest under
  Stefan's law, so the gap's slope along the radius stays and drives a flow the Press never
  stops: a lubrication pressure gradient with nothing to balance it. Clock glasses are curved,
  so the dome is the real geometry; a held press on one should squeeze the film to its
  equilibrium and stop. Classic is flat until this is fixed (the fix after #917), and Comet
  River (0.6), and the looks at 0.45 and 0.2, carry it. Find which term keeps the far plate
  moving (the squeeze's source against the gap's own gradient) and run heldpress on a 0.6
  dome as its check. Flat, the press's weight shows the same leak: at 38w-1's platePressure
  of 0.4 the far plate is still (4.3e-5) but 0.51 of what is left points out from the press,
  against the check's half (0.44 at 0.25). A held press on the floor has no squeeze, so it
  should push nothing; Classic is back at 0.25 until both are found, and the fix runs
  heldpress at 0.4 flat as well.
- **38w-20. Warm cells still read soft in the app with Crisp Edges on** (M; High). Filmed in
  the app on Metal (seed 1, 512² grid, 1280x800 canvas, after 12 s): the cyan cells' rims are
  one crisp pixel, but the red and orange cells' rims are a soft three or four pixels, and
  turning Crisp Edges off leaves them unchanged. Edge Relief adds a broad dark band just inside
  them (it reads the solver's band at `rim0`, unmoved), but Edge Relief at 0 still leaves the
  rim soft, so the relief is not the cause. Not measured yet, two guesses: those cells' oil band
  is wider than 3.5 cells, which `crispInterface`'s `real` gate leaves alone on purpose as real
  diffusion; or their dye has leaked out into the water (about 7% of it in the lab), so the
  colour's edge is not the oil's. First read the band half-width (`eps / h.x`) and the dye
  outside the oil at those rims in the app, then fix the cause in the solver (why warm cells
  spread wider than cyan) and not in the plate. Once the rim is sharp, draw the meniscus as a
  narrow line at the crisp rim (the chain rule through the warp), not as the band-wide halo.

