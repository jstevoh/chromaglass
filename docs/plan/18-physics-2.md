# 18. The physics under the look: where the plate imitates a result instead of simulating it (continued)

Part 2 of 3 of §18; it begins at 18b-9. The section starts in `18-physics.md`.

- **18b-9. The rule's colour gates on a look with no colour.** `lampjudge`'s lit-colour
  gates (20% of the dish, 0.6 of black's) fail any look that has no colour on either
  ground, which is a graphite or ferrofluid look's whole point; Sensual Laboratory failed
  them and the owner put it on the lamp by eye. Hold such a look (lit colour on black
  under a fifth) to its contrast instead, the spread between its dark dye and the platen
  on each ground, and see whether the rule then agrees with the owner unaided.
- **18b-2. The dark ground the physical way.** A look that stays dark should get there
  with a dense base dye in the dish or a dimmed lamp, not with the black ground, once
  the owner has picked; then the black ground can go.
- **18b-3. The painted edges on the lamp (shortcut, until 18e).** The meniscus, the
  boundary line, lacing, cells, gloss and the closeup's detail are drawn on the dye's
  tint; on the lamp ground what they did is carried over as the ratio of the tint's
  brightness after them to before (`reliefOf`). Real edges are refraction: 18e.
- **18b-4. The gooey edge's contrast is not in the amount.** It is an opacity curve
  made for paint on black; as an amount it bent the law (a plate twice as deep let
  through 0.16 of the green where Beer–Lambert says 0.09). On the lamp only its blur
  counts. A look on the lamp that wants crisp blobs needs them from the liquid (18a's
  surface tension, 18d), not from a curve.
- **18b-5. The back plate's mixer blends on the lamp.** With its own blend (the look's
  Blend Mode) the back plate filters the lamp; a mixer row set to screen, add, multiply
  or key still lays its dye as it did. Decide whether a row blend means anything under
  the lamp, or the lamp overrides it.
- **18b-6. Light through a film, not the whole gap (for 20b).** *Shipped with 20b
  (#259) for the dye: the front plate's dye path is the gap less the clear film
  (`gapScale *= 1 − film` in the plate, from the packed view).* The path is the dye's
  amount times the gap (Layer Depth). Once a film of clear liquid sits in the gap
  (20b), the water's path is the gap less the film, which is where the reference's
  faint pink and lavender in the white come from. A drop's or bubble's "through"
  colour (the lamp through the clear gap, `through` in the bubbles) is still the old
  tint-towards-white estimate, read off the ring round it (which is on the lamp
  ground now).
- **18b-7. What `npm run lamp` does not read yet.** The closeup's and the particles'
  decode (`decodeFluidRaw`, which has no Colour Body factor where `decodeFluid` has
  one), the spectral branch, the chemistry as filters, and the bubbles' rim and lens on
  the lamp. And the Second Lamp is not held to the lamp as the hot-spot is: near its
  spot it can lift a white ground past full and clip (its colour is up to 1.4 in
  blue). Dividing it by its peak dimmed the whole plate by 1/1.4 away from it, which
  is worse; a second lamp on a lamp ground wants its light added, not multiplied. Each wants a case
  in the check, or a reason it does not need one.
- **18b-10. Two projectors.** *Shipped (behind Two Projectors, on in Fillmore; `npm run lamp`).*
  The Two Projectors setting models two projectors aimed at the same screen, each
  filtered by its own plate. Shortcut: each projector's exposure is simply halved
  (exposure normalisation) so clear glass stays at one lamp's level. Outside the back
  plate's disc, the second projector still lights the screen there.

## 18c. A pour adds liquid, not only colour

**18c-1 shipped** (a bottle's pour is volume on a thin gap; `npm run flush`, judging §43; story in
`docs/plan-shipped.md` §18c). Left, each its own PR:

- **18c-2** The colour's own drops as volume. A bottle's deposit is volume now, but the
  colour each tool lays with it (`autoInject`, `addDensity`) is still stamped with none,
  and so is the automation's colour. A water or dye bottle pours both, so the push is
  there wherever a bottle is held, but a look that only drops colour pushes nothing and
  flushes nothing. Give the dye's splat a volume as the species' has (one more
  `pourVolume` per drop); a look change in every look, so judge it on the Mac.
- **18c-3** Retire the Pour's, the splash crown's and the Splatter's radial velocity kicks
  for their volume: a kick is curl-free and the solve deletes it. Gate the splash on
  K = We·Oh^−0.4 above about 2100 from `dropHeight`, not on any energy above 0.02.
- **18c-4** An oil drop as a lens or a film by the spreading coefficient
  S = γ_w − γ_o − γ_ow (the bottles carry σ now, 18d-1), with 18d-3.
- **18c-5** The held pour's rate is one number, a dropper's 0.5 mL/s (`HELD_POUR`,
  `src/lib/liquidProps.ts`), whatever the tool and the Amount. A Pour should let go more
  than a Dropper, and the Amount should be the rate.

## 18d. Each liquid has its real properties (replaces the property scalars)

**18d-1 shipped** (each poured liquid's own viscosity on a thin gap; `npm run thick`, judging §42; story in
`docs/plan-shipped.md` §18d). The rest of 18d is these items, each its own PR:

- ~~**18d-2**~~ Flushing, not fading: shipped with 18c-1 (`npm run flush`). Nothing fades
  the species; it leaves over the open rim when pours push it there, and the
  automation's headroom for a thick bottle reads the GPU's share (`speciesShare`, once a
  second). The colour still fades (18g), and the CPU's body still fades on the old plate.
- **18d-2a** An automated look that pours glycerine keeps it until something pushes it
  out: its headroom stops it at 0.3 of the dish, and only a bottle held or the
  automation's own pours of water and soap flush it (Velvet Underground pours no water),
  until 18c-2 makes the colour's drops volume. Judge Glycerine Drift, Deep Ocean, Aurora
  Borealis, Velvet Underground and Lumia over ten minutes on the Mac (judging §43).
- **18d-3** The oil's and silicone's own viscosity. Their phase (mix.r, Oil Tension) is
  as thick as the clear liquid round it. Take its share into hsPrep as the ferrofluid's is.
- **18d-4** Density into the tilt's buoyancy. The species carries Σ share·ρ, and nothing
  reads it yet. It would replace the CPU's `weight` and SINK.
- **18d-4a** Restore or pack density when 18d-4 buoyancy lands. In 18j, species channel 2
  (formerly density, read by nothing yet) was traded for optical scatter $\mu_s'$ to avoid
  adding a second species PingPong texture and preserve 18d-11a's 6.73 ms paired carry.
  When 18d-4 lands, pack density alongside scatter (or into packed velocity/phase) or expand
  species.
- **18d-5** Soap and alcohol into the GPU's surfactant with a σ(Γ) law (the bottles now
  carry σ). Delete the CPU Marangoni force and the dye multiply, and give alcohol its burst
  and evaporation. Its description still says it "rises through water".
- **18d-6** Retire the colour-difference tension (Immiscibility). It is a look change.
- **18d-7** Milk's `repel`. Milk is a miscible emulsion, so this goes to 18j (scattering).
- **18d-8** Retire the CPU fields (soap, body, repel at 192²) and their pass once 18d-2 to
  18d-7 have moved each to the GPU.
- ~~**18d-9**~~ #355 The index into 18e's refraction: the derive pass's optical path reads the species' Σ share·n (`pouredDn`), measured against the shelf's own indices by `npm run derive`. The display's deflection does not read it yet: 18e-2.
- **18d-10** The species is not in FieldCarry, so a rebuilt solver loses it, and now that
  nothing fades it the loss shows: a governor's move drops every poured liquid. Carry it.
  On the old plate (Thin Gap off), the CPU body drag is still the thickness.
- **18d-11** The cost on the Mac. ~~**18d-11a**~~ shipped: the species rides the colour's
  own carry (`bodyAdvectPairSub`, `npm run thick`; story in `docs/plan-shipped.md`).
  On CI's Mac it halved: 6.73 ms a step at 768² against 13.54 alone, half the colour's
  carry where it was all of it. The other half is the species' own texels (rgba32f, nine
  reads and a write a cell a substep). Left: read the owner's Mac with `?debug` (judging
  §43) against 18d's budget of 0.5 to 0.7 ms; if it is still over, the next halves are
  the species' bytes (its density and index channels are carried but read by nothing
  yet, 18d-3 and 18d-9: hold them until those land, or pack them) or carrying it at
  half the grid (its own carry again, and hsPrep reading it up a level).
- **18d-11b** The same pairing for the other carries that ride one flow: Oil Bodies
  carries the colour and the oil's share of it in two passes through the same faces
  (`advect dye`, bodiesOn), and under the maze's flow the species still takes a stage of
  its own (the colour goes in the maze's sixths there, not carryPlan's substeps). Found
  in 18d-11a; Oil Bodies' pair would save a whole carry on every look with Oil Bodies.
- **18d-12 shipped** (each liquid pours its own colour, a dye picked tints it;
  `npm run natural`, judging §44; story in `docs/plan-shipped.md` §18d). Found with it:
  - **18d-12a** The automation's pours of a bottle (`pourLiquid`, the look's own liquids
    and an area's) lay the liquid and no colour, so a look that doses syrup doses clear
    syrup. Give them the bottle's own colour (amber syrup, white milk, gold oil) as the
    hand's pours have; a look change in every look that doses a coloured bottle, so judge
    it on the Mac.
  - **18d-12b** Soap and Silicone still clear any colour where they land, a dye picked for
    them included: the CPU's dye multiply (18d-5) thins whatever dye is under the soap,
    and cannot tell the soap's own dye from the plate's. On a thin gap their pour is
    volume and pushes the colour aside, which is the real clear disc; deleting the
    multiply there (18d-5) is what lets a dyed soap show its dye.
  - **18d-12c** Milk is laid as a white body (its `scatter`), which is milk seen by
    reflected light on the black ground. On the lamp's ground real milk throws a warm grey
    shadow, and a dye in milk is a pastel, not the dye: both are 18j's scattering.
- **Found:** at the plate's 6 mm rest gap, a liquid as thin as water has a drag time of
  about 3 s, so for a second or so it moves as a free liquid, not a Hele-Shaw one. Alcohol
  in a thick look read 14 times a pool of colour, where Darcy's bound is 2. That is right
  for 6 mm, but real light-show glasses sit closer, which is a question for 18a's rest gap.

- **Where:** `src/lib/liquidPhase.ts` and the bottles in `src/types.ts`. The viscosity
  is one global switch (`thick ? 1.5 : 0.5`).
- **The shortcuts:**
  - **Soap, milk, silicone and glycerine** are channels on the CPU at 192², read back a
    frame late, and each fades on a timer (soap 6 s, glycerine 22 s). A liquid does not
    evaporate as a property.
  - **Glycerine's "body"** is a drag against last frame's velocity, projected and then
    clamped.
  - **Soap's Marangoni force** is a pure gradient added before the projection, which
    deletes it. The clear disc people see comes from a dye multiply that destroys the
    colour. The GPU already moves soap correctly (`marangoniFlux`), so soap is modelled
    twice.
  - **Colour-difference "tension"** (`forcesB` `tension`, the Immiscibility dial) makes
    two dyes of different hue in the same water repel. Interfacial tension exists only
    between immiscible liquids; food dyes in water mix. Many looks are tuned on the
    cohesion this gives, so retiring it is a look change and the oil or silicone
    bottles have to take over the job.
  - **Milk** has `repel: 1`, but milk is a miscible emulsion.
  - **Alcohol** "rises through water". Nothing rises in a level dish. Alcohol's real
    effect is a strong Marangoni burst (σ about 22 against 72 mN/m) plus evaporation:
    the hole it punches in a film.
- **What it takes:**
  - Each bottle carries a viscosity, a surface tension (or its drop against water), a
    density and a refractive index.
  - One rgba32f species texture on the GPU, moved in flux form (the `mixAdvect`
    kernel exists), with no decay.
  - A mixture viscosity μ = μ_w^(1−c) μ_g^c (spanning about 1000×) feeds 18a's
    mobility. Density feeds the tilt's buoyancy. Soap and alcohol go into the GPU's
    surfactant field with a σ(Γ) law. Immiscible bottles get a Cahn–Hilliard phase
    each, as the oil has.
  - The CPU soap force, the dye multiply and the colour-difference tension are then
    deleted.
- **Cost:** about +0.5–0.7 ms on the GPU, less the CPU pass (1.5–3.5 ms of CPU at 192²).
- **Gain:** glycerine crawls because it is thick, a thin liquid fingers into a thick one
  (Saffman–Taylor, with 18a), alcohol blasts holes, and nothing silently disappears.
  Extends 15e, which found these forces measured only on a stand-in plate.

## 18e. Edges come from refraction (replaces the painted rims and highlights)
**Partly shipped** (#355): on projected looks the front plate's edges come from the projector's pupil loss and the shadowgraph's Becke doublets, from the optical path n·h in the derive pass, with a Projector Focus control (0.5, in focus, by default); the painted highlights are gone from projected looks. The named shortcuts are in `refractionOptics`' notes; story and measurements in `docs/plan-shipped.md` §18e (moved 2026-10-29, 19m-2). What did not ship is below (18e-1 to 18e-4); follow-ons **31a** (the defocus Δz as a control) and **31d** (the shadowgraph per band). Open:

- **18e-1. Layer 1's painted boundary line (a painted shortcut until 31a separates the two dishes' heights).** On projected looks with `derivedOn > 0.5`, Layer 1 keeps a painted boundary line (`edge1 * boundaryContrast * 1.6` from `smoothstep(0.1, 0.6, length(near1.xy))`, gated on `fluid1.a > 0.03`) alongside `refractionOptics(near1, 0.0, 0.0, 0.0)`. At default `projectorFocus = 0.5`, both dishes currently sit at Δz = 0 so the shadowgraph Becke term is 1 and `refractionOptics` only darkens by pupil loss; without the painted line on Layer 1, the back plate's Screen vs Multiply separation in `npm run mixer` falls to 9.9 (bar > 10, 11.0 on main, 10.3 with the line), while applying that brightening to Layer 0 clips the 90th-percentile thin-dye rim in `mixer`'s single-dish mid-grey contrast check (`129.5 → 136.4` without it, `130.9 → 134.7` with it). Replace the painted line when **31a** gives the upper dish its inter-dish focal offset Δz₁ in the projector cone.
- **18e-2. A clear pour's edge, and the deflection from the optical path.** The aperture's deflection is worked out from the dye's air-masked slope (`θ ≈ |∇density| · 0.35`, weighted by Edge Relief × plateAmt, plus `bEdge · boundaryContrast · 1.1` shaped by `smoothstep(0.25, 1.0, uB) * 0.78` at a hue-gated two-dye boundary, refractionOptics note 1), and `refractionOptics` returns early where both are flat. So an edge with no dye across it, glycerine poured clear into water (Δn 0.14) or the oil's rim, reaches ∇²OPL in the derive pass but draws no line on the wall. #355 took the oil's painted rim (`|∇oil|·2.2`) off projected looks, so a clear oil drop with no dye across its rim has no rim line there until this ships (its 8% lens brightening stays). Deflect by ∇OPL instead (the derive pass would write ∇OPL in place of the dye's slope, and the camera looks keep theirs), then retune the dye's stand-in index against it. A look change: every look's edges move.
- **18e-3. The heat's index.** Water's index falls about 10⁻⁴ per kelvin, which is what makes a lamp's convection shimmer on the wall. The derive pass does not read the heat; with 18f.
- **18e-4. Edge Relief does not decide whether light bends.** On a projected look with the derive pass on, the meniscus slope's pupil loss is scaled by `reliefK = edgeRelief × plateAmt`, and is zero when Edge Relief is under 0.005 (`plate.ts`: `reliefK0` before the front plate's `refractionOptics` call, which scales the aperture's `smoothstep(0, 1, u) · reliefK`). So Edge Relief 0 draws no refraction at a slope, though a slope in the gap bends the lamp's light whatever a dial says. Edge Relief was the painted meniscus's strength; on projected looks the slope's loss should come from the optics alone (`plateAmt` and the pupil's NA), and Edge Relief either leave projected looks or become a named contrast on top of that. A look change at Edge Relief 0 only; with 18e-2, which moves the same term onto ∇OPL. *Measure:* the lab's `derive` or `holeline` at Edge Relief 0 and 1 draws the same slope's loss within a stated share.

## 18f. Heat comes from the lamp, and a level plate has no "up"

**Shipped (#352):** In-plane thermal buoyancy is strictly gated on plate uprightness (zero
on a level plate) with tanh saturation removed (linear Boussinesq). Story in
`docs/plan-shipped.md` §18f (moved 2026-10-29, 19m).

Open follow-ups:
- **18f-1. Full per-channel absorbance across all passes:** decode RGB absorbance per channel for spectral heating across every look and pass rather than single-pass average.
- **18f-2. Bénard–Marangoni cells:** surface stress −∇T inside an existing force pass (replacing separate marangoniFlux dispatch) so that cellular convection patterns emerge without breaking soap/oil conservation.
- **18f-3. Convection shimmer (18e):** pack velocity channel z export into plate shader shadowgraph taps to render hot plume optical refraction and shimmer without disturbing raw `(u, v)` reads in `cellride`.
- **18f-4. Warm water thins only the water (a named shortcut, #352):** `tempVisc = exp(-0.02 T)` in `thinGap.ts` hsPrep multiplies the whole thin-gap mobility, so a warm cell of oil or glycerine speeds up as much as warm water. Water's viscosity really falls about 2%/K, but each liquid has its own slope (glycerine's is about four times steeper near room temperature, a mineral oil's roughly twice), and in a layered cell the temperature belongs on each layer's own viscosity inside the two-layer Poiseuille sum that already builds `filmDrag`, not on the product. Move the factor onto the water layer's viscosity in that sum (and give each liquid its own slope beside its viscosity in `src/lib/chemistry.ts`), and have `npm run heat` show a warm oil-over-water cell speeding up by less than a warm water-only one.

## 18g. Colour leaves by flushing, not by fading

**18g-1 shipped** (the open circular rim, $r \ge 0.5$, into the overflow trough; `npm run flush`, story in `docs/plan-shipped.md` §18g; #362). The rest of 18g is these items, each its own PR:

- ~~**18g-1**~~ Flushing, not fading: the open rim (#362). Shipped; story in
  `docs/plan-shipped.md` §18g-1 (moved 2026-10-29, 19m).
- **18g-2** airExclude and the standing bubble pump: replace the destructive multiply with volume-fraction exclusion.
- **18g-3** capDye and solvent evaporation: model real evaporation as solvent loss leaving a coffee ring at the rim, rather than dye loss.
- **18g-4** r16f flux pass: carrier-thickness field for evaporation and liquid volume fraction.
- **18g-5** Remove the dye-budget regulator safety cap once 18c-2 (pours add volume) ships and looks cannot saturate.
- ~~**18g-6**~~ An oil body touching the open rim no longer drains through it by its own surface tension: the rim is held at the oil's Laplace pressure, not the water's zero (CAPILLARY, rimLaplace; `npm run rimhold`, a lens at the rim 9.6% → 97.1% kept over six seconds). Story in `docs/plan-shipped.md` §18g.
- **18g-7, open. A lens against the rim on the diagonal loses about 0.13% of its oil a second whatever its tension** (found building 18g-6: at a hundredth of Clock Glass's Oil Tension the lens laid against the rim at 45° kept 99.6% over the last three of six seconds, and over twelve seconds lost 1.8%; at the middle of the grid's edge it loses none). The oil past the rim grows by the same amount, so it is carried or relaxed across the rim's staircase cells, not pushed by a pressure: the mix's own Cahn–Hilliard relaxation (mixRelax/mixMu/mixUpdate read their neighbours past the rim with no rim condition) or the carry's faces there. Measure which first (oilBodies 0, the relaxation off), then give the mix the rim's zero-flux condition for its chemical potential, as dyeDisperse's diffusion has.
- **18g-8, open (a shortcut named). The gap's own curvature, 2σ/h across the gap, is not in the solve.** The thin gap's surface tension is the in-plane curvature alone; across an even gap the other curvature is the same everywhere and moves nothing, but where the gap changes (a press, a domed plate, and the cover glass's edge, where the gap opens into the reservoir) it pushes a non-wetting oil body toward the deeper liquid (Dangla, Kayi & Baroud 2013, drops moved by gradients of confinement). So whether a body at the rim is drawn out under the cover's edge into the reservoir, or held there by its in-plane interface as 18g-6 now has it, depends on a term the solve does not have. Add it as a force from the gap's gradient, σ·c̃·∇(2/h), and measure a lens in a wedge against the confinement speed before it is let near the rim. And the rim sets no contact angle: 18g-6's held pressure assumes the body's interface carries on past the rim, so the angle it meets the rim at is the grid's. At the middle of the grid's edge clampP mirrors the oil's blur (about 90°) and a lens there spreads along the rim (13.8 → 37.8 cells' worth of oil on the rim's cells over six seconds, review of #455); on the diagonal it draws itself off the rim (8.3 → 1.2), so part of what `npm run rimhold` reads as held there is a lens that has left the rim. A contact-line condition at the cover glass's edge (a pinned or angled interface, Gibbs' criterion at a sharp edge) belongs with the gap's curvature here, since both are what happens to the interface at the cover's edge.

- **Where:** the dye-budget regulator and "evaporation" (`LiquidVisualizer.tsx`,
  applied in `decayDye`), `capDye`, the `airExclude` multiply, a still bubble's
  `standing` pump, and soap's dye multiply.
- **The shortcuts:** dye over the budget is removed everywhere, in proportion to the
  square of the overage. "Evaporation" removes dye, not water. A bubble destroys the
  dye under it by a multiply, a CPU rim deposit puts some back, and a bubble sitting
  still keeps pumping liquid out of itself every step.
- **The real phenomenon:**
  - Nothing removes dye from a sealed plate. Old colour leaves a real plate by being
    flushed out of the open rim as new liquid goes in (18c).
  - Evaporation removes solvent: the concentration rises and the dye is left in a
    coffee ring.
  - A bubble is a volume with no liquid, so the dye is excluded by volume fraction.
- **What it takes:** 18a's open rim as the outflow, pours as volume (18c), the dye
  carried as concentration × liquid fraction with air as a phase, and evaporation
  acting on a carrier-thickness field (bubbles-plan F's wet carrier). A safety cap
  stays, named as one.
- **Cost:** about 0.3 ms (one r16f texture and a flux pass).
- **Gain:** a show ages the way a real plate does. It turns over, and it can dry.

## 18h. Dye diffuses physically; heat its own kappa (replaces isotropic diffusion)
**Partly shipped** (#357): single explicit finite-volume stage (`dyeDisperse`) replaces 4-iteration isotropic Jacobi diffusion; molecular diffusion $D_m \approx 4\times 10^{-10}\text{ m}^2/\text{s}$ holds sharp edges; water thermal diffusivity ($\kappa \approx 1.4\times 10^{-7}\text{ m}^2/\text{s}$) decoupled from dye diffusion slider; limiter handles mass conservation correctly; measured by `npm run dispersion` (6/6). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Left from 18h, each its own item:

- **18h-1. Flux-form dye transport and removal of MacCormack clamp.** The dye advection stage currently uses MacCormack backtracing with neighbor bounding clamps, which causes minor mass drift (~0.4% over 60 steps) under shear flow. Moving dye advection to a conservative flux form across faces will allow removing the clamp and guaranteeing exact mass conservation during both advection and dispersion.
- **18h-2. Dye spreads along the flow (visible streaking).** On show timescales ($t \ll 25\text{ hours}$ across 6 mm gap), shear dispersion is in the unsteady pre-asymptotic regime ($\sigma^2 \approx 0.2 v^2$). This draws the dye out into visible streaks along the flow. It requires a multi-layer or sub-stepped flux scheme to model the flow's shear without capping the dispersion at the explicit face flux limit.

## 18i. Bubbles and beads live by physics, not timers

**Partly shipped** (#358): Bretherton lubrication, agitation-driven wander, Saffman–Taylor fingers on the Straw, Reynolds film-drainage merge and the beads' pancake lag (`npm run bubblephysics`). Story in `docs/plan-shipped.md` §18i (moved 2026-10-29, 19m-2). Open:
- Expose physical-only pop mode as a user setting (`timedPops = false`).
- Rim drainage when bubbles reach the dish boundary.

## 18j. Milky liquids scatter (shipped)

Shipped in #353 (2026-10-10): optical scattering packed into `vel.w` from species channel 2
with conserved flux-form advection; Kubelka–Munk diffuse backscattering on black ground
yielding opaque white milk and pastel food dyes (PLAN §4); two-flux forward extinction with
Rayleigh-Gans wavelength … Story in `docs/plan-shipped.md` §18j (moved 2026-10-29, 19m).

## 18k. Smaller ones

- **Thin-film colour:** the film's thickness is the dye's opacity ×16 plus drifting
  noise, through a cosine rainbow at 85%. The physical Airy table (`filmTable.ts`,
  `filmPhysics`) exists and is 0 in every preset. Real film colour in transmission is
  faint (0–8%), so a strong rainbow is a look and should be named one. The honest
  version is a transported film-thickness field driven by the soap. **Planned as §32**
  (a draining soap film in reflection; its check is written first). Cost: about 0.2 ms.
- **Linear light:** everything is composited in sRGB-encoded values. The six-band
  spectral sums, every mix, screen and add, the camera's blur and its bloom are biased
  by that. Decoding at the inputs and encoding in the finish is free, but it moves every
  look a few per cent against the "same picture to the bit" gates, so it goes with a
  re-baseline.
- **Stacked dishes multiply, beams add:** layers combine by "screen" in gamma space.
  Two dishes in one beam multiply their transmittances, and two projectors on one wall
  add in linear light. Free once linear; rig-plan R3 covers the projector half.
- **Chemistry sits still under the stir:** Gray–Scott runs on a static 192² CPU grid
  that the flow does not carry, and soap "breaks down" on a 10 s timer. The reactants
  should be moved with the flow (one flux pass, about 0.1 ms), and soap should be left
  to dilution. BZ (the Oregonator) and Liesegang (Keller–Rubinow) are real models.
- **Spray and Splatter:** random stamps with an outward fling. Droplets land vertically,
  so the fling has no physical cause. Each droplet should be a small volume source (18c)
  with log-normal sizes (`dropRadius`).
- **The ferrofluid's spikes are placed** on a fixed hexagonal lattice
  (`src/gpu/wgsl/spikes.ts`) rather than emerging from the Rosensweig instability.
  Noted for the ferrofluid thread (9f onward), not audited further here.

## 18l. A dye has more than one colour (replaces the perfect filters and the three-dye rule)
**Partly shipped**: finite dyes, depth drawn, the hue-keeping grade and five dyes on the plate (#281). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

- **18l-4. Three widened looks read fewer colours on the survey's plate:** Acid Trip
  (146 → 138; its exclusion blend inverts where dyes overlap), Fractal Dream (42 → 38)
  and Sunny Side Up (92 → 79). Look at them on the Mac (judging §37) and reorder or
  trim their families if they read muddier.
- **18l-5. Magnet Garden keeps Transmission 0.5.** With depth drawn the thin gold
  between its ferrofluid domes goes pale and rivals the white points on their tops
  (`npm run spikes`: 16 tops lit against 7.8 places half a pitch off, where the check
  asks for three times as many; 4.0 off at 0.5). The ferrofluid looks' own pass should
  decide whether its water should be deeper or its points brighter at 1.
- **18l-6. The mixer's grades are measured at Transmission 0.5.** At 1 the lab plate in
  `npm run mixer` brightens (its brightest tenth 146 to 198 of 255) and contrast at 1.8
  carries that tenth into white, so the spread reads 1.30 times against the bar's 1.3
  (1.50 at 0.5). The grade shots pin 0.5; re-derive the contrast line on a plate whose
  bright end has headroom at 1 (a dimmer lamp or a lower frontBright), then drop the pin.
