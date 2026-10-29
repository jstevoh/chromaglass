# 18. The physics under the look: where the plate imitates a result instead of simulating it

This section is in 3 files, cut between items: `18-physics.md`, `18-physics-2.md`, `18-physics-3.md`.

Asked 2026-09-28. The owner's standing rule is to build from the chemistry and physics
of the liquids, not from a picture of their result, and to name any shortcut kept for
speed. This section is the audit that rule asked for: every place found in the solver
(`src/gpu/wgsl/fluid.ts`), the plate's optics (`src/gpu/wgsl/plate.ts`) and the tools,
drops, bubbles and bottles (`LiquidVisualizer.tsx`, `src/lib/`) where the code paints
how a liquid looks instead of simulating what makes it look that way. Each item says
where the shortcut is, what the real phenomenon is, what simulating it would take, and
what it would cost at the 768² rung. The costs are estimates from the per-stage table in
`docs/webgpu-plan.md` (Classic, two layers, 768², 6.58 ms a step on the M4) and the
plate pass's 2.0 ms, not measurements. Every item is read from the code; nothing here
has been built or measured yet.

The owner asked for all of these in the plan and picked 18a, the thin-gap flow, to
build first (2026-09-28); it starts in its own thread.

Three threads already own a piece of this, and their items are ranked here rather than
written twice: Classic's fingering push (the "grates" thread; its PR adds the plan item
for real Saffman–Taylor fingering), the ferrofluid's pull and the dye between the domes
(9f), and Blow (15c, with 15b and 15g).

## The one finding under most of the rest

**The plate has no velocity that obeys physics and remembers.** `decayVel` multiplies
the velocity by `damping` (a per-step factor with no dt in it) and then clamps every
cell to `MAX_SPEED` 0.002 (`src/gpu/fluid.ts`, `src/gpu/wgsl/fluid.ts` `decayVel`).
`docs/evaluation-2026-09.md` measured 99.7% of dyed cells sitting at that cap. So what
carries the dye is the noise stirring added after the pressure solve (`forcesB`:
turbulence, spin, vibration, drip, smear, air) and the half-resolution lasting current
(`cur`), which was added beside the main field to get some memory back. The viscosity,
the velocity's own advection and the second projection (about 2.4 ms, a third of the
step) work on a field the clamp then throws away. That one decision is why a tool's push
lasts one step (15b), why every tool moves the colour by a hand-written carry (15g), why
a press or a pour pushes nothing that the projection does not delete (bubbles-plan H),
and why viscous fingering could not be shown when it was built (physics-plan "What is
not here": the closed plate balances every source with a uniform sink).

A plate of liquid between two glasses is a Hele-Shaw cell. Its depth-averaged flow obeys
ρ∂u/∂t = −∇p + f − (12μ/h²)u, with ∇·(hu) = −∂h/∂t plus any source. The drag time
ρh²/12μ is about 0.02 s for water in a 0.5 mm gap, about 2 s in a 5 mm one, and nothing
for glycerine. The plate's memory should come from the gap and the liquid's viscosity,
not from a clamp.

## Ranked

By what the show gains against what it costs, GPU time first, since the show must hold
its frame rate live. "Free" means no new passes or texture reads.

| # | Item | Gain | GPU cost | Needs |
|---|---|---|---|---|
| 18a | The plate is a Hele-Shaw cell | Large: tools move every liquid, thick liquids stop, fingering becomes possible | About −2 ms a step (a saving) | Retuning every look; the owner's feel call (15b) |
| 18b | The lamp shines through the dye | Large: gels colour the dye, overlaps darken, thin washes are pale | Free | A per-look choice of ground. **Shipped** (#256), behind Lamp Ground; eleven looks on it (#262, 18b-1) |
| 18c | A pour adds liquid | Large: a drop shoves the colour outward into rings | Free | Better with 18a's open rim |
| 18d | Each liquid has its real properties | Large: glycerine crawls, thin fingers into thick, alcohol punches holes | +0.5–0.7 ms, less CPU | 18a |
| 18e | Edges come from refraction | Moderate to large: one mechanism for every edge, and a focus ring to play | <0.1 ms | None. **Partly shipped** (#355); 18e-1 to 18e-4 open |
| 18f | Heat comes from the lamp | Moderate: dark regions warm and move; the lamp's own cells | Nearly free | **Shipped** (#352) |
| 18g | Colour leaves by flushing, not fading | Moderate: the plate turns over like a real one; drying | ~0.3 ms | **18g-1 shipped** (#362), **18g-6 shipped** (the rim holds the oil); 18g-2..5, 18g-7, 18g-8 open |
| 18h | Dye diffuses physically; heat its own kappa | Moderate: holds sharp edges | About equal to today | **Partly shipped** (#357) |
| 18i | Bubbles and beads live by physics, not timers | Moderate: less "sticker" behaviour | CPU only | **Partly shipped** (#358); Bretherton lubrication, Saffman-Taylor lobes, Reynolds film drainage merge, bead speed lag; physical pop mode open |
| 18j | Milky liquids scatter | Moderate for milk, paint and latex | Free to +0.4 ms | **Shipped** (#353) |
| 18k | Smaller ones | Small | Free to small | See each |
| 18l | A dye has more than one colour | Large: every pool a ramp from pale tint to deep core, mixtures that walk between their dyes, five dyes on the plate | Free | **Shipped** (#281); real dye spectra (18l-1) after |
| 18m | A drop slumps under its own weight | Large where the liquid is thin: a pool of ink sinks and runs out as a flat, sharp-edged pool, r ∝ t^⅛ | 2 passes on the default Thickness, 7 in water | None. **Shipped** (#364); ~~18m-1~~ (#371, 18m-1a implicit step open), ~~18m-5~~ shipped, 18m-2 to 18m-4 and 18m-5a after |

## 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)
**Partly shipped**: Thin Gap is built and on in every look (#248), the Press draws the liquid back, and 18a-2 (forces that are forces) is done. What is open is below: the findings along the way, 18a-2's open findings, and the steps left for later PRs. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

- **Where:** `MAX_SPEED` and `damping` in `decayVel`; the lasting current
  (`currentForces`, `addCurrent`); the squeeze film's red-black sweeps and
  `squeezeVelBuf`; the depth multiply in `addCurrent`.
- **The shortcuts it removes:**
  - **The clamp** sets every speed on the plate (above).
  - **The squeeze film's pressure solve** does almost nothing. Five red-black sweeps
    solve ∇²p = 12μ ḣ/h³, and `squeezeVelBuf` adds −(h²/12μ)∇p to the velocity. That
    is a pure gradient, which the next projection deletes, as the kernel's own comment
    says ("pressing seventy-five times harder moved the same 1%"). The sweeps and the
    add are most of the squeeze stage, which is the step's most expensive at 1.13 ms.
    What actually presses is the −ḣ/h source in `divergence`. The operator is also the
    wrong one: the Reynolds equation is ∇·(h³∇p) = 12μ ḣ, not ∇²p with h³ moved into
    the source.
  - **Depth as a capped multiply** on the projected flow ((h²/h₀²)^k, capped at 1),
    which makes a divergence-free field divergent. That is why it ships off.
- **What it takes:**
  - One velocity field with implicit drag, u ← (u + dt(f − ∇p)/ρ)/(1 + dt·12ν/h²).
  - A variable-coefficient projection ∇·(M∇p) = ∇·(Mf) + ∂h/∂t, with mobility
    M = h³/12μ(x). The multigrid takes face coefficients (harmonic means); a version
    was built once (physics-plan).
  - **An open rim:** cells at the dish's edge held at p = 0, so liquid can enter and
    leave there instead of every source being balanced by a uniform sink. This is what
    viscous fingering was missing.
  - At these Reynolds numbers the velocity's self-advection and the second projection
    can go.
  - A tool then acts on the flow and the flow carries every field. Blow is a surface
    shear stress, a Finger is a solid in the layer (Brinkman penalisation: the hand's
    velocity imposed inside its disc), a Press is ∂h/∂t. The hand-written carries
    (`carryDye`, `carryMix`, `fingerCarry`, `pressDye`, `pressMix`, `blowDye`,
    `blowOil`, `blowCarry`) can then be retired one at a time, each against its
    existing check (`finger`, `wind`, `pressoil`, `ferrohands`).
- **Cost:** removing the second projection (0.82), the velocity advection (0.69), most
  of the viscosity (0.91), the current (0.41) and the squeeze sweeps saves about 3 ms.
  The variable-coefficient solve and its coefficient pass add about 1 ms. So roughly
  2 ms a step are saved. The collocated grid's patches (`dampGrid`, the Rhie–Chow
  faces, `mixRelax`) are worth reconsidering in the same change: a staggered grid
  removes the checkerboard they exist for.
- **What is lost:** eddies. A thin plate has no turbulence, so the swirl has to come
  from hands, heat (18f), tilt and rotation. The noise stirring should stay as a
  declared dial ("hand stir"), fed in before the projection so that it too lasts
  through the drag time, not added after it.
- **Subsumes:** 15b (a tool's push lasts one step), the force half of 15g (air's shear
  and the jet's dimple on the film), bubbles-plan G (press and lift as different
  strokes: the lift's Saffman–Taylor fingers grow from this instead of from
  `squish.ts`'s hashed spokes, whose count is 8 + seed % 9) and roadmap Stage 1 F
  (depth). It is the prerequisite for the grates thread's Saffman–Taylor item.
- **Ships as:** a solver mode behind a setting, off by default, judged look by look on
  the Mac, because it changes how every look moves and every tool feels. Measured by
  a new lab check (a press's ring radius against the volume displaced; a drag's
  displacement against the drag time ρh²/12μ; dye conserved with the carries off).

- **Found along the way, open:**
  - **Depth Drag does nothing on a thin gap** (found with 18a-every). It is the old
    plate's stand-in for the gap's mobility, and a thin gap has the real one (h³/12μ):
    on Classic domed, the rim already runs at 0.156 of the centre with the dial at 0
    (Mac, `npm run depth`). Hide or retire the dial while Thin Gap is on, on the
    desks, the phone and the remote, so a performer does not turn a dial that moves
    nothing.
  - **The oil's press on a thin gap has no app check** (found with 18a-every). On a
    thin gap the flow carries Oil Bodies' oil and its colour out and back; `bottles`
    measures only the old plate's move. Add an Oil & Water leg to `tools`' let-go
    check: the oil under the palm goes out and comes back with its colour.
  - **Thin Gap's cost on the Mac is still unread** (18a-11, Wave 2's 2.1). The owner
    picked every look before it was read. The governor steps the grid down if a
    Mac cannot keep up, so the risk is a coarser plate, not a stopped one; read it.
  - **The lab still steps the old plate.** Its step parameters (`BASE` in
    `scripts/lab-entry.ts`) have no `thinGap`, so every lab check and `look` render
    that does not ask for the thin gap measures the plate no look plays now. Decide,
    check by check, which measure the solver as shipped (move them to the thin gap,
    and rebaseline only what moved for a reason the check names) and which measure
    the old plate on purpose as a control.
  - **The ferrofluid's carry is not in these substeps.** Since #229 `phaseAdvect`
    carries the ferrofluid as a volume on the thin solve's face fluxes, in a fixed
    six substeps (PHASE_SUBSTEPS) where the Press at 1× asks up to 21 of 0.4 a
    cell (`npm run presslift`). Put it on `carryPlan`'s count, as the dye, the
    bodies and the mix are. `ferropress`'s press, now as hard as the h³ closing
    makes it, keeps the volume in six,
    so measure what the 0.45-a-cell clamp leaves behind instead: the pool's edge
    against where its volume puts it. `phaseRelax` still keeps Σc, not Σc·h
    (under 0.1% in that check).
  - **The app's let-go check read a pool still spreading** (fixed in this PR,
    not yet green on the Mac). On run 37134289958 the pressed pool read 0.047 →
    0.077 → 0.076 from the palm and the idle pool 0.051 → 0.066 → 0.082: the check
    passed at 112% net while the pressed colour never came in (a press frozen at
    the lift reads 107% against that idle pool, check-skeptic). Run 37145038742
    read 20% (pressed 0.062 → 0.094 → 0.098, the idle pool on the old solver).
    Runs 37148523629 to 37163762683 then showed the separate idle pool starting
    15 to 40% from its press's, and Classic's own flow drifting a settled pool out
    0.004 of the plate a second, half the press's push over the lift's three
    seconds. The press itself read 62%, 98%, 97% and 99% back net of drift. Now
    each pool is its own control (its drift measured before the hand), on the
    calm plate (mirror.mjs's CALM), with a quarter of the push back before any
    drift is credited and a press frozen at the lift reading under half. The
    calm plate with no bubbles still drifted 0.0043 a second (run 37166234101),
    as much as settled 1.5 or 8 seconds: the three ambient seeding orbits that
    every look runs keep painting colour a quarter of the plate out (it grew 6%
    in three untouched seconds). The check now turns them off for its runs
    (`chromaglassDebug().ambientSeed`) and fails if colour still arrives.
  - **On the Mac the thin Press barely clears the colour from under the palm.**
    The share of the colour within 0.05 of the palm went 76% → 69% held → 68%
    after the lift (its idle pool 78% → 76% → 72%; Thin Gap off 72% → 1%). The
    lab's press takes the middle's colour to ×0.171. Find what the app's Press
    lays on a thin gap that the lab's does not (radius, depth, the bowl's 3×,
    the stroke's per-frame rate), and measure it under the palm. Those shares
    were read with the ambient seeding laying colour far out, which lowers every
    share and the held one most; read them again with it off before chasing it.
  - **The substeps' ceiling.** 33 substeps of 0.4 cover 13 cells a step; the
    Press at 1× on 384² asks 8. A Press at 2× Amount on a 512² solver, or a
    machine-starved step (a longer step's spring), can ask more, and past it the
    flux clamp leaves the colour behind again. Read it on the Mac (`readCarry`).
  - **The press's rate is the hand's, not the film's.** Stefan's law has the palm's
    size (R⁴) and the liquid's viscosity in it; the shader keeps only the h³, so a
    thick liquid does not yet press slower than a thin one under the same hand.
  - **The colour runs a little ahead of its liquid on a slope of the gap**: the
    carries' face velocities are rebuilt from cells (18a-8), and in the bowl the
    colour left under the palm's middle is 0.75 of what the gap there holds.
  - **The lift is a spring, and liquid fills it.** A real glass lifted off a thin
    film is held by the film's suction (Stefan, h³) and air comes in from the edge
    as fingers (Saffman–Taylor, the unstable stroke). The plate has no air phase in
    the gap, so the liquid always fills, and the lift's spokes are still a drawn
    seed of where the glass opens first. Needs an air phase in the thin solve.
  - **The bowl's width is the tool's.** A bent glass's dent is as wide as its
    bending length under the load (the glass's stiffness against the film); the
    bowl takes the Press's radius as it was.
  - **The splash, Blow's puff and every other carry still run on a thin gap.** A
    drop's splash still lays flat discs with pushes and dye multiplies, and Blow
    held still still moves the colour with `pressDye`'s ring (18a-3).
  - **The old solver's glass still springs on the look's clock**, about 14 s
    to half way on Classic. Since #248 a look runs it only with Thin Gap turned off;
    on a thin gap the glass lifts in the show's seconds (1.55 s to half way at the
    default Press Lift), so a look tuned on the old 14 s may feel bouncier: part of
    judging §30.
- **Left for later PRs, each its own thread (the shortcuts this one keeps, named):**
    - **Found, open:**
      - **Vibration does nothing on a thin gap.** On the thin gap (every look since
        #248) the old ripple moves a uniformly dyed plate by 0.0001 (lab, full
        Vibration): it is a per-step push at 3 Hz on a liquid whose drag takes it
        in a tenth of a second, about a thousandth of what it was tuned to on the
        old plate (a fiftieth of a wave). Tried as the glass ringing in a Chladni
        mode, a gap source beside the press (−∂h/∂t, kept reversible by bending back
        in the shape it rang in): the colour rippled 0.125 at full Vibration as the
        old tuning asked, but the colour's carry did not give it all back. After
        40 steps of ringing 0.027 stayed (21% of the peak), after 160 steps 0.049,
        and half the ring left a ninth as much (residual going as amplitude^1.6): the
        face fluxes' upwinding diffuses the ripple each half cycle, which leaves a
        standing grating at the mode's wave, the fault §0 took out. Waits for a
        carry that is not first order (18a-8), then ship the ringing glass.
      - **A uniform force drains across the open rim.** Glass Smear and Updraft move
        the whole liquid, and the rim (p = 0) lets it leave one side and come in the
        other, where a real dish holds its liquid and a uniform shear makes no mean
        flow at all. Before this they moved only the colour, which left the same way.
        With 18a-7 (the rim follows the dish).
      - **The forces' sizes are still the looks' numbers**, read at the default liquid,
        not newtons: the magnet's, the oil's tension and Rain Drip's weight belong in
        real units once 18d gives each liquid its density, viscosity and tension.
        And the magnet's and the oil's per-step caps (`MAGNET_CAP`, `OIL_CELLS`) are
        still speed caps on a force.
      - **A slid glass smears colour across the gap**, not only along: the top of the
        column goes at U and the bottom stays, so colour spreads along the slide
        (Taylor dispersion). The depth-mean flow carries the mean; 18h's dispersion
        along the flow would give the smear its smear.
      - **The cost**: one more full-grid copy a step when a body force runs, unread
        on the Mac (18a-11).
      - **Updraft blows downhill.** Its push is a fixed −y, which is the plate's
        downhill at the default Tilt Direction (where Rain Drip now falls), and it
        does not turn with Tilt Direction. Kept as it was (every look with it was
        tuned on it); whether an updraft should rise against Rain Drip is a look
        question for the owner on the Mac (judging §32).
  - **18a-3, tools as solids.** The Finger is one now (15b: Brinkman in the thin solve,
    its carries retired on a thin gap, `npm run fingerflow`). The rest: a hand's push is imposed along its direction (a
    penalised solid in the limit where the solid wins), not a disc moving at the hand's
    velocity (Brinkman), and the hand-written carries (`carryDye`, `carryMix`,
    `fingerCarry`, `pressDye`, `pressMix`, `blowDye`, `blowOil`, `blowCarry`) still run
    on top of the flow, so with Thin Gap on the colour is moved twice. Retire them one
    at a time against `finger`, `wind`, `pressoil`, `ferrohands`, `tools`.
  - **18a-4, the current into the field.** The lasting current (`cur`) is fed into the
    thin solve as a force, but it still has its own solver on the M grid; its forces
    (rock, buoyancy, centre gravity) belong in the main field, and then the
    current's solver and its 0.4 ms go.
  - **18a-5, the press over its own time.** `squish` can lay a press's dent in one
    step, so the displaced volume leaves in one step, faster than the dye's face
    fluxes may carry it (0.45 of a cell a step). The app's Press lays its dent a step
    at a time (`lib/squish.ts`), and `npm run thingap` presses over ten steps; the
    glass should close over the press's own time wherever a dent is laid, and
    `gapMemory` then has no job in a thin gap.
  - **18a-6, inertia for water.** The velocity's self-advection is dropped. The reduced
    Reynolds number Re·h/L is under 0.1 for oils and near 2 for water in the plate's
    6 mm middle, so water in a deep gap has more inertia than this keeps. Measure it on
    Water looks and bring back a cheap advection if it shows.
  - **18a-7, the rim follows the dish.** The open rim is the plate's inscribed circle;
    with Dish Spread (two dishes) or a round-dish vignette each dish has its own edge,
    and the solver does not know it. And the inscribed circle touches the square's four
    sides, where the box's wall, not the open rim, meets the liquid: a flow across the
    plate is stopped at those four points (a lab probe of a uniform push read the speed
    at the wall down to 0.54 of the rest and a sideways jet of 1.9 beside it), and the
    pressure that takes it out reaches the middle for two steps (`npm run thingap`
    prints that first step). The rim should sit a cell or two inside the square, or the
    cells outside it count as open too.
  - **18a-8, a staggered grid.** Cell velocities are rebuilt from the face fluxes,
    which leaves a small checkerboard at a floored dent's edge; the advections'
    Rhie–Chow faces were given c·P, exact only where the drag is even (on a thin gap
    the colour's and the oil's carries and carryCourant now cross the solve's own
    faces, `THIN_FACE`, as the ferrofluid's did: a Finger's solid is where the drag is
    least even, 15b; off a thin gap the carries keep their Rhie–Chow faces, exact on
    the old plate's even projection); and the face fluxes' upwinding squares off a ring under a fast
    radial flow (the pressed rings in the picture). A staggered grid takes all three,
    and `dampGrid`'s job.
  - ~~**18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.~~
    Dropped: the owner decided to delete the CPU solver's stepping (2.6, 2026-10-06; 3.1).
  - **18a-10, the in-plane viscosity.** The viscosity stage (0.91 ms) still runs with
    Thin Gap on. In a gap it is the Brinkman correction to the drag, of order h²/L²
    against it; measure whether any look shows it, and drop it for the time if not.
  - **18a-11, the cost measured (shipped).** Measured 2026-10-07 on the Mac with `npm run stages`
    over alternating 20-second runs at 768² and 512² (`docs/judging.md` §19):
    At 768²:
    - `thinGap=false`: a solver step is 31.7 ms whole (16.5 ms Layer 0, 15.2 ms Layer 1;
      `project 1` + `project 2` = 6.7 ms/layer, `advect velocity` = 1.2 ms/layer), achieving 20.4 steps/s.
    - `thinGap=true`: a solver step is 67.8 ms whole (51.1 ms Layer 0, 16.7 ms Layer 1), achieving 11.4 steps/s.
      In Layer 1, `thin gap` projection is 7.3 ms (44% of layer), roughly parity with the Navier-Stokes
      projection + velocity advection it replaces (6.9 ms + 1.2 ms = 8.1 ms).
      The bulk of the cost difference is Layer 0's conservative height-advected dye transport
      (`advect dye` 36.1 ms vs 1.3 ms).
    - In-plane `viscosity` (18a-10) costs 1.52 ms across both layers (1.53 ms Layer 0, 1.47 ms Layer 1).
    At 512²:
    - `thinGap=true` with `steps=60`: a solver step is 19.7 ms whole (12.7 ms Layer 0, 7.0 ms Layer 1)
      and drawing 6.8 ms, yielding 32.8 steps/s at 33.4 ms/frame (~30 fps).
    - `thinGap=true` with `steps=30` (H2b): frame time drops to 19.2 ms (52 fps) with 27.5 steps/s (92% speed),
      advancing 2.38e-2 liquid/s (+33% over 60 steps/s).
    Thin Gap does not need any look turned off: on the 512² hosted ceiling it runs smoothly at 33 ms/frame,
    and H2b at 30 steps/s delivers 52 fps.
  - **18a-12, the thin gap's pressure was never cleared: shipped, as a warm start.**
    Found 2026-10-04 reading the code for 14v: the thin gap's projection cleared its
    pressure with `clearBuffer(pass, this.hsP!, 'clear pressure')`, under the same bind
    group key as the old plate's `this.press`, so it zeroed `press` and the thin solve
    started each step from the last step's pressure, a warm start nobody chose (and
    after a `groups.clear()` the two could swap). Measured by the Thin Gap thread
    (`npm run thingap`, lab): cleared for real, a press on a 130² grid moved its ring
    63% of the way the displaced volume puts it (15/16); warm, 100% (16/16), the
    numbers every Thin Gap result shipped on. So the clear is gone and the warm start
    is the choice, said where the solve begins (`thinProject`). Open: whether
    `hsCycles` from cold should converge on a grid that is not a power of two.
  - **18a-13, tilt sloshes the liquid: shipped** (the owner, 2026-10-20: tip it one way
    and then the other and the colour should slop and mix). A shallow-water dish on the
    CPU (`lib/slosh.ts`) fed by the owner's tilt alone, its flow added to the thin solve's
    velocity after the solve, behind a new **Slosh** dial at 0 (the plate as it was, bit
    for bit; `npm run slosh`). How it was found and measured is in
    [`docs/plan-shipped.md`](docs/plan-shipped.md) §18a-13; the owner's eyes on the pace
    are `docs/judging.md` §58. Shortcuts, each named in the code, and the items that
    replace them:
    - **18a-13a. Two layers: shipped** (2026-10-22). Oil lenses ride the water at their
      capillary thickness, read from the plate's own oil each frame, with the two-layer
      laminar drag between them; the dish moved to the GPU (`gpu/slosh.ts`). Plate Rock's
      swing tips it where Frame Sway lets the frame move (`rockAccel`; how the rock itself is
      driven is 27f-2's). A kick's glass presses the dish over the same radii it presses the gap
      (`kickPress`: the sheet's one dent off the frame-moving looks). Story in
      `docs/plan-shipped.md` §18a-13a; `npm run slosh`, `npm run sloshgpu`.
    - **18a-13b. The rim's boundary layer.** The rim is free-slip; a real dish's wall
      holds a thin layer still and sheds a vortex when the wave turns there. The
      drag too is the covered gap's (12ν/h², Poiseuille between two walls), where a
      layer with a free top drags at 3ν/h², four times weaker, and water's Stokes
      layer at slosh frequencies is thinner than the gap (about 0.25/s against the
      0.33/s used). It moves the pace the owner judges in §58, so replace it before
      tuning `SLOSH_LEAN` against it.
    - **18a-13c. Drawing the depth.** The dye does not feel the depth (the dish moves
      it, it does not thin where the liquid is shallow), so a wave never shows as a
      brighter crest or a lamp-lit slope. The dish now writes the depth of both layers
      for the plate (`WebGPUSlosh.depth`, the solver's `sloshDepth`): red the depth
      over rest, green the oil's share. What draws it: Beer–Lambert through the
      depth (a crest holds more dye) and the lamp's light bent by the surface's
      slope and focused by its curvature (a shadowgraph, brightness against
      −D∇²depth). The display pass is at WebGPU's sixteen textures, so the depth
      rides in a spare channel (the derive pass's alpha is free) rather than a new
      binding; touches the plate shader, so `pops`, `straw`, `ferrolook`, `mixer`,
      `grainedge`, `lampzero` and a `look` render.
    - **18a-13d. A shock-capturing scheme: shipped** (2026-10-22). HLL fluxes over
      hydrostatic reconstruction, MUSCL with the MC limiter, Heun in time: a dam
      break runs at Stoker's speed, two cells wide, and no energy is made. Story in
      `docs/plan-shipped.md` §18a-13d. Still: no Coriolis or centrifugal term, and the
      CPU film ignores the slosh.
    - **18a-13e. Hold Gravity's moves out of the slosh.** The dial is hand-only, but the
      tilt it follows is Gravity × Tilt Direction as the plate sees them, so a look
      (Lava Lamp has Gravity 1), Evolve or a patch on Gravity slops the liquid too. If
      the owner wants only the hand's own tilt, keep the hand's value apart from the
      applied one and feed `sloshAccel` that. Also the phone's tilt reaches the dish in
      screen axes while Gravity's direction is turned by the turntable's angle, so with
      the plate turned a tipped phone slops at that angle; Plate Rock's `ext.x * 1.1`
      does the same. Turn both into the fluid frame together.
    - **18a-13g. Lenses that move and pull back.** The dish reads where the oil is
      from the plate every frame and holds each lens at its capillary thickness: a
      lens has no inner wave and one stretched thinner does not dewet into droplets.
      Carrying h₁ in the dish (its own mass equation, the plate's oil following it)
      and a disjoining pressure would let the dish move the lens's outline itself.
    - **18a-13h. One press, not two.** A kick's glass presses the thin gap
      (`pressKick`, lib/squish.ts) and the dish (its head) at once, so near the glass
      the liquid is pushed out twice. The one-press answer: the dish takes the gap's
      squeeze as its source and the gap's own push goes. Moves what `npm run squeeze`
      measures, so it wants the owner's eyes on Beat Squeeze first (27f-3).

## 18b. The lamp shines through the dye (replaces paint over black)
**Partly shipped**: Lamp Ground is built (#256) and the looks that go on the lamp are chosen by rule (18b-1, #262); its byte-for-byte line at 0 runs on the CPU rasteriser since 2026-10-11 (`npm run lampzero`, 19z). What is open is below, from 18b-8 on. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

- **18b-8. The dishes too deep for the lamp.** Eighteen looks are dishes by their own
  description but fail the rule with the dye they were given for black: on the lamp the
  dish goes black (ink over 30%) and the colour goes with it: Classic, Deep Ocean, Acid
  Trip, Bass Drop, Boiling Point, Fractal Dream, Velvet Underground, Neon Coral Reef, Oil
  Wheel, Macro Bead, Cell Bloom, Glycerine Drift, Oil & Water, Magnet Garden, Ferro Paint;
  Jellyfish Bloom and Lacing Run keep under a tenth of their lit colour; Agate keeps 46%
  of it. Several say outright that
  they are lit from beneath (Deep Ocean, Jellyfish Bloom, Velvet Underground, Oil Wheel,
  Magnet Garden), so on a real projector they would be on the lamp. Each wants its dye
  thinned for the lamp (Dye Budget, or the dish's own amounts), judged by the same rule,
  rather than the black ground keeping it: a look stays dark on a projector only by being
  deep dye (18b-2). One look at a time, `lamp-gallery` before and after.
