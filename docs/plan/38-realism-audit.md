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

- ~~**38k. The spikes' onset and the magnets' field, in tesla**~~ **Shipped** (#625). The
  onset is Cowley and Rosensweig's field for EFH1 under water through the layer's inner
  field, 4.0 mT (a share of 0.033, was the lab's 0.18 = 22 mT); several magnets add as
  vectors. `npm run disc` 13/13. Closes **9u**. Story in `docs/plan-shipped.md` §38k.
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
    the onset): the solver's gate as domes arrive, not their height, which the film's
    lift makes. The subcritical jump and its hysteresis are 9t-3's.
  - **38k-5. The looks' own magnets in the dome checks** (S). `spikes` and `fingers` used
    Magnet Garden's own magnet as their control under the onset; it is past it now, so the
    control is a magnet at 0.8 of the onset, whose pull is about 3% of Garden's. Add
    Garden's own magnet as a case that must raise domes, its bar set from the Mac's first
    reading (`disc` asserts only that its field is past the onset, 4.6×).
  - **38k-6. One χ for EFH1** (S, with 38s). `standing.ts`'s `CHI0` is 2.6 and
    `spikes.ts`'s `FERRO_CHI` 2.64; the drop's pull reads `CHI0`. Import the one number
    and re-read `ferrodrop` (about 1%).

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
