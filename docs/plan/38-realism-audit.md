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

- **38a. The lamp is a condenser, not a wandering painted glow** (S, nil frame cost;
  High). *Now:* the hot spot multiplies the finished picture by
  `mix(0.78, 1.25, exp(-3.5·d²))` with a warm tint (`src/gpu/wgsl/plate.ts:3308-3319`); a
  second lamp *multiplies* a bluish 1.25× Gaussian on top; both centres drift by noise up
  to a third of the plate when Lamp Motion is up (`LiquidVisualizer.tsx:5207-5213`); and
  the lamp ground is divided by 1.28125 to stop the peak clipping (`plate.ts:2514`). The
  heat's own hot spot is another shape again, 1/(1+2.5r²) (`fluid/dye.ts:231-235`), so the
  warmth and the light disagree about where the lamp is. *Real:* an overhead projector's
  Fresnel condenser images the bulb into the lens's pupil, so the stage is lit nearly flat,
  falling off as the lens's cos⁴ of field angle and the condenser's edge, with a soft fixed
  image of the filament at most; a second lamp *adds* light; and nothing in the picture
  moves unless the liquid does. A brightness that slides across the whole frame is the
  kind of whole-frame motion the owner already took out of the sound (frameSway 0).
  *Build:* one irradiance map E(x) from the condenser (cos⁴ and an edge), shared by the
  lamp ground and the heat source, a second lamp added in light, Lamp Motion retired or
  turned into a real thing that moves (a hand-held second lamp). *Measure:* the plate with
  no liquid is flat to the cos⁴ law and still from frame to frame; the heat's peak and the
  light's peak are the same point.

- **38b. Bubbles that never appear or vanish by a clock** (S for the fades, M for the rim;
  High: every music look pops bubbles). Sharpens **18i**, which named the timers but not
  these. *Now:* `timedPops = true` (`src/lib/bubbles.ts:144`), lives drawn 9–23 s (`:261`),
  8–18 s for the straw's satellites (`:331`), 0.8–1.6 s for daughters (`:216`), all scaled by
  `lifeScale = 0.5 + bubbleAmt`; each bubble fades in over 0.35 s and out over 1.2 s like a
  sprite (`:582-583`); its age over its life is packed (`:599`, `wgsl/air.ts:80`) and the
  plate thins and darkens its film by it (`plate.ts:3448, 3518, 3533`). A pop throws two or
  three daughters with 35–65 cell/s kicks by Culick's rim retraction (`:198-232`), which is a
  free soap bubble's physics: an air pocket between two glasses has no film to retract.
  Small bubbles also melt away by a ripening 1,400× too fast to be gas through oil
  (`RIPEN 1.4`, `:84-88`; real Lifshitz–Slyozov ripening of mm pockets takes hours), and a
  bubble under 0.6 cells is deleted (`:534`); a stretched one splits by a 0.3/s dice roll
  (`:537-552`) rather than at a critical capillary number; and each one wobbles at a drawn
  1.2–2.4 rad/s (`:181, :433-435`) where a mm pocket in oil between glasses is overdamped
  (Re ≪ 1) and only follows what pushes it. *Real:* a pocket enters as volume (a pour, the
  straw, a press that traps air) and leaves only by the open rim, by merging, by being
  engulfed, or by dissolving over hours. *Build:* timers, fades, age-as-colour, the daughters
  and the wobble out; leaving at the rim as the dye already does (18g-1); breakup at a
  critical Ca from the bubble's own stretch. *Measure:* `npm run pops` and a still plate
  where the bubble count holds for a minute with nothing pushing.

- **38c. Soap is conserved: no decay, no grid-rate spreading** (S, nil; High on the soap and
  milk looks). Sharpens **18d-5** (which owes the σ(Γ) law, not these). *Now:* the mix update
  spreads surfactant at 0.08 cells² a step, about 1.3e-6 m²/s at 384² and 60 Hz on the 0.2 m
  plate (real surfactant D ≈ 5e-10, about 2,500× slower, and today's number changes with
  the grid and the frame rate), and multiplies it by 0.1^(dt/10), a tenth every ten
  seconds (`src/gpu/fluid.ts:1463`, `wgsl/fluid/oil.ts:393`). *Real:* surfactant does not
  disappear. It adsorbs at the interface up to Γ∞ (Langmuir), the Marangoni flow carries
  it until ∇σ = 0, and the tension stays lowered where it went, which is why a real soap
  front stops and the plate *remembers* where soap was. *Measure:* total surfactant on a
  closed plate held to 1% over a minute; a burst's front stops where σ is level; the
  spreading the same at two grids.

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

- ~~**38f. The lamp's heat lifts the liquid as a force, and cools by the plate's own losses**~~
  **Shipped (this PR)**: the heat in kelvin, watts and real seconds (C(h) of water and two
  glasses, the lamp's kilowatt, Heat Decay as the air on both faces plus radiation), carried
  with the liquid on a thin gap, lifting as a body force from Kell's density up a standing or
  tipped plate, and rounded at random to its half float so a plate cools at all (`npm run plume`;
  story in `docs/plan-shipped.md` §38f). Left open from it:
  - **38f-2. Lava Lamp's own lamp and the colour's weight in units.** The lamp under a standing
    plate (`LAMP_HEAT`, 6 K/s into the wax band, mixForce) and the dye's weight on it
    (`DYE_WEIGHT`, a per-step pull with no unit) are still tuned numbers; the heat it puts in
    now lifts at Darcy's speed. The bulb's watts into the band over C(h), and the colour's
    weight as a Δρ like ROCK_FALL's, would put the whole lamp in SI.
  - **38f-3. The glass as a temperature of its own.** The sandwich is one temperature through
    its depth, and the liquid carries all of it (decayVel): right while a plume rises over
    seconds, but the water trades heat with the glass in about a minute across 6 mm (seven
    seconds across 2 mm), and a warm patch that has moved on leaves warm glass behind. A second
    field for the glass (fixed in place, exchanging k/(h/2) with the liquid, losing to the air)
    is lampBoil's two-temperature model.
  - **38f-4. The area cord's Heat in watts.** `areaHeat` puts 1.5 K/s into a spot, tuned when
    the plate cooled in 12 s; it now cools in about two minutes, so a held full cord climbs to
    the clamp. A hot-air gun's flux over C(h) is the real number.
  - **38f-5. The lamp's heat in two bands.** Only the dye's visible share heats; lampBoil's
    infrared absorbed by the water through its depth (with the heat filter out, 36e) is not on
    the GPU yet.
  - **38f-6. The old plate's heat.** While the thin gap's pipelines build, or with Thin Gap off,
    the heat still lifts through the capped current (`currentBuoy`) and Updraft is still the
    noise (forcesB). Small, since every look opens thin.
  - **38f-7. Water's viscosity by Vogel.** tempVisc is exp(−0.02 ΔT), within 1% of Vogel to
    30 K over the room and 10% off by 70 K; lampBoil's waterViscosity is the curve.

- **38g. Bubbles that merge, crowd and stretch like pockets in a gap** (M, CPU only, nil
  frame cost; Medium-High for the straw's rafts and dense froth). The research's ranked
  items 6, 7 and 10 (`drops/research/bubbles-and-drops.md` in the project's shared files),
  #163 shipped them for drops but not for air. *Now:* once two bubbles' film has drained
  they become one disc at once with a fixed 0.18 stretch (`bubbles.ts:462-477`), and every
  stretch relaxes at τ ≈ 1.4 s whatever the size (`:427-430`); crowding pushes each pair
  apart to 0.98 of their radii, half each whatever their sizes (`:488-505`), and every
  bubble is drawn as a disc, so no facet or Plateau border can form. *Real:* the neck grows
  as (γ/η)·t, then t^¼ (Yokota and Okumura 2011); a pancake's shape relaxes at
  τ₂ ≈ 2μR³/(b²γ) (Paterson 1981), milliseconds at 1 mm and nearly half a second at 5 mm, so
  big merged pockets stay long and small ones snap round; crowded pockets push with
  stiffness γ/R (Durian's bubble model), so small ones stay round and big ones facet, the
  wall between unequal ones an arc of curvature 1/R_s − 1/R_b, jamming near an area
  fraction of 0.84. The drops' wall arcs (`dropWall` in `beads.ts`) are the model to reuse.
  *Measure:* relaxation time against R³ at three sizes; facets on a jammed raft.

- **38h. Nothing on a lit-from-below plate makes light** (S each, nil; Medium). Several
  places still paint light a transmission projector cannot throw, though the block's own
  rule says it (`plate.ts:3599-3602`: "a plate lit from beneath shows transmitted light
  only"):
  - the Micro Droplets satellites carry a lamp highlight, a specular dot
    exp(−14·hd²) (`plate.ts:724-748, 3323-3330`); a small drop is a lens whose rim leaves
    the pupil, a dark ring (`dropBand`) and no dot;
  - the oil brightens by a flat 8% wherever it is, at any focus (`plate.ts:3082`); a lens
    concentrates light only out of focus, the shadowgraph's 1 − Δz·∇²OPL that
    `refractionOptics` already has (`:2028-2031`), zero at focus. **18e-2** says the 8%
    stays; this says move it onto that term;
  - the gel multiplies the lamp by 1.5 (`plate.ts:2163, 2195`); a gel is a filter,
    transmission at most 1 in every band (the mixer's own note in §11 owes a Mac look at
    this gain);
  - the dye is shaded as if lit from a point above, Lambert plus a Blinn highlight plus
    Schlick (`plate.ts:505-507, 546-567`); the lamp is below and collimated, and a dye film
    reflects nothing into the lens. **18b-3** and **18e** name the gloss; new is only that
    the light's direction is above the plate;
  - the dish's rim adds a warm glow and Lamp Warmth carries a painted vignette
    (`plate.ts:3686-3694, 3700-3721`); a dish's glass wall refracts the lamp out of the
    pupil, a dark line by the same aperture law as a drop's band, and the falloff is 38a's
    cos⁴;
  - film grain is added on the plate itself every frame when no camera is on
    (`plate.ts:3762-3765`); grain belongs to the camera or the film stock (`post.ts` has it),
    not to a lamp through liquid onto a wall.

  *Measure:* on the projector's view, no pixel outside a lens's defocus term brighter than
  the lamp through clear liquid.

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

- **38k. The spikes' onset and the magnets' field, in tesla** (S; Medium: which magnets
  raise domes). Sharpens **29c-3**, **9u**, **9t-1**, **9t-3**. The onset is 0.18 → 0.35 of the
  hand's magnet by a smoothstep (`wgsl/spikes.ts:49-50, 125`; `standing.ts:34` `LANGEVIN`
  0.035 on the same scale). Real: Cowley–Rosensweig, μ0Mc² = 2(1 + 1/μr)·√(Δρgσ), and a
  sudden (subcritical) jump, not a ramp. With it: the internal field, not the applied one
  (a thin sheet in a normal field has H_in = H0 − M, so at χ 2.6 the layer feels about 0.28
  of the field at low strength: `spikes.ts:104-106` and the film's lift use the applied B);
  and several magnets add as *fields*, not energies (`shared.ts:406-414` sums |B_k|², its
  comment says so; two like-poled fingers' fields add as vectors, up to twice between
  them; `magnetDiscExact` already gives B_ρ and B_z, which 9v-tilt needs too).

- **38l. The glass springs back by the second, not by the frame** (M; Medium: every press
  and lift). Sharpens **18a-5**. `gap += (rest − gap)·gapSpring` with no dt
  (`wgsl/fluid/gap.ts:239`), so a lift recovers twice as fast at 120 fps as at 60. Real: a
  lifted glass is held by Stefan suction, F = 3πμR⁴ḣ/(2h³), and a bent one relaxes by its
  stiffness. The dt is a fix on its own (S) before the law.

- **38m. Film Physics is built and on in no look** (S, judging only; Medium for the soap and
  bubble looks). Airy's thin-film colour through the CIE functions (`src/lib/filmTable.ts`,
  #163) is gated by `filmPhysics`, default 0 and set by no preset (`types.ts:1093`). The
  research's item 8 shipped, and nothing shows it. Photograph the looks with iridescence at
  0 and 1 for the owner to pick, as 18b-1 did for the lamp.

- **38n. Bubbles move by the look's own liquids** (S; Medium: bubbles in glycerine against
  water). Sharpens **18i** and **18d-3**. The speed ratio is max(1, 1.5/(1 + 2.26·Ca^⅔)), the
  1.5 a named tuning for Taylor–Saffman's 2 and floored at 1; mineral oil's μ 0.017 and σ
  0.030 are hard-wired "pending 18d" (`bubbles.ts:61, 389-405`); tilt drifts every bubble at
  −tilt·900 cells/s whatever its size or the liquid (`:414`); the drops' λ is 1.5 "solved
  back from 0.8" (`beads.ts:206`). Real: U = 2U/(1 + λ) with λ the poured liquids' ratio;
  buoyant drift Δρ·g·b²/(12μ). Each bubble's film thickness and glint come from a random id
  (`plate.ts:3394-3458`); the real film on a pancake pocket is Bretherton's,
  0.84·Ca^⅔·b, from its own speed, so the variety stays and follows the flow.

- **38o. The soap film's named shortcuts become items** (M each; Medium: the lace).
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

- **38s. One number per liquid** (S each; Low). The oil is 0.15 lighter than water for
  buoyancy (`capillary.ts:354`) and 0.12 for the spin (`SPIN_OIL_LIGHT`, `constants.ts:371`);
  the clear film's oil is 50× water whatever was poured (`OIL_REL_NU`, `thinGap.ts:577`); the
  ferrofluid's Δρ is water's 200 kg/m³ whatever it sits in (`forces.ts:410`,
  `standing.ts:95`; EFH1 is 1210 kg/m³, so against a 0.88 oil it is 0.375); the ferrofluid's
  viscosity is fixed in any field (`FERRO_NU`, `constants.ts:85`; Shliomis' rotational
  viscosity adds 10–30% at saturation, a guess for EFH1); twelve looks set dye diffusion to
  0 (`fluid.ts:1008-1009`; real D is never below about 4e-10, tiny on a show's time, so this
  is bookkeeping). All belong to **18d-3** and **18d-4**'s one-table-per-bottle.

- ~~**38t. Updraft is noise between two glasses**~~ **Shipped (this PR)**: Updraft is the
  air's speed (3 m/s at full); its laminar boundary layer's stress 0.332 ρ U^1.5 √(ν/x) from
  the rim it comes over, less the dish's mean, read as the Blow's is, and its forced cooling
  on the top face (`npm run plume` lines 6–7; story in `docs/plan-shipped.md` §38t). Its looks
  are calmer, steady where they wobbled: judging §98.

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
