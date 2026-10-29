# 18. The physics under the look: where the plate imitates a result instead of simulating it: what shipped

How §18's shipped items were found, built and measured. The open work is in
[`docs/plan/18-physics.md`](../plan/18-physics.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

Part 1 of 3; it goes on in `18-physics-2.md`.

## Second pass (moved 2026-10-04)

### 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- **Shipped, first part (Thin Gap, off in every look, 2026-09-28):** the setting
  `thinGap` (a switch) and `gapThickness` (water to glycerine, log in viscosity) on the
  sheet, the desks, MIDI and the remote. With it on: implicit gap drag 12ν/h² in place
  of the clamp (a 0.2 m plate, the rest gap 6 mm); the step's forces and the lasting
  current read as terminal speeds at the rest gap and fed in before the solve, the
  stirring included; a variable-coefficient multigrid with M = h·c (h³/12μ once the
  drag dominates) and face coefficients built in series along each coarse row; the rim
  held at p = 0; the press as the gap's own change, not the squeeze memory's rate; no
  self-advection, second projection, squeeze sweeps or `squeezeVelBuf`; a hand's push
  imposed along its direction rather than added; the dye moved across faces as an
  amount (`bodyAdvect`), since a backtrace made dye under a press (332 → 656). The thin
  solve keeps its pressure in its own buffer and hands the advections c·P for their
  Rhie–Chow faces. `npm run thingap` measures it against the old solver (16 checks).
  Judged on the Mac: docs/judging.md §19.
- **Shipped, the Press draws the liquid back (Thin Gap, 2026-10-03).** The owner: the
  Press "just pushes everything out instead of bringing it back when you release".
  Thin Gap's flow is reversible, but the app's Press was not: measured in the lab
  with the app's own strokes (Classic's clock), the press closed the film to its
  floor in a step or two and the liquid it squeezed out crossed up to 75 cells of a
  384² solver in a step, where the dye's face flux may carry 0.45. The colour was
  left behind: the ring went 42% of the way out (192²), and the slow lift then drew
  it 0.06 of the plate inside where it began. Five changes, each on a thin gap only
  (off, every look presses as it did):
  - **The glass closes as a film under a load** (`squeezeUpdate`): the liquid
    leaves through the gap it is closing, whose resistance goes as 1/h³ (Reynolds;
    Stefan's law), so the hand's press is its rate at the rest gap and slows as
    h³, integrated exactly over the step. The fastest face fell from 75 cells a
    step to 8. This is the physical half of 18a-5.
  - **The carries in substeps** (`carryCourant`, `carryPlan`): the step's largest
    face Courant number is found on the GPU and the dye, the oil's share of it and
    the oil (`bodyAdvect`, `mixAdvect`) are carried in as many substeps as keep each
    under 0.4 of a cell, up to 33, the pairs dispatched indirectly so nothing is
    read back (21 at most for the Press at 1×). The numerical half of 18a-5.
  - **The press is a bowl** (`squishDisc`, `thin`): a clamped plate under an even
    load deflects as (1 − r²/R²)², laid with the flat disc's volume. The stacked
    flat discs were steps in the gap, which the collocated grid carries colour
    across badly. A kick's release gives its gap back in the same shape.
  - **The glass lifts in seconds** (`glassSpring`): Press Lift's half-life was
    counted on the look's step (Speed × 0.2), about 14 s on Classic; on a thin gap
    it is the show's seconds, 1.55 s at the default.
  - **The Press's carries retired on a thin gap** (`squeezeOut`: `pressDye`,
    `pressOil`/`pressMix`), and the strokes lay only the glass there: no cleared
    centre or piled rim on a press, no inward push along a lift's spokes (the spokes
    remain as where the glass opens first). The Press part of 18a-3.
  - Measured (`npm run presslift`, new, lab, plate shard; 384² under 192, software):
    the ring lands at 100% of the displaced volume's shift (0.3427 against 0.3425),
    every colour kept to 0.00%, the colour under the palm's middle leaves with its
    liquid (×0.171 against the gap's ×0.227), 34% of the shift back after 1 s
    (4% with the glass on the look's clock), and once the glass is back the ring is
    3% of its shift from where it began. `npm run tools` on the Mac now presses and
    lets go through the real pointer with Thin Gap on, against an idle pool.
  - `npm run thingap`'s Darcy disc is now held for twenty steps, as a hand holds a
    Press: closing as h³, one step's dent leaves the film at about 0.008, not the
    floor its λ is counted at (16/16 after: oil 0.0449 against 0.0368, water
    0.1951 against 0.1854).
  - The phone has Thin Gap and Press Lift on the Press's own Amount, beside
    Fingering.
  - With the Press × ferrofluid PR (#229) merged in: `npm run ferropress` presses its
    pool to a sixth of the gap in twenty steps at the rate the h³ closing needs
    (its straight steps reached only 0.61 of rest). Pressed that fast, the
    ferrofluid's volume grew 1.9%: its grid filter and Cahn–Hilliard kept Σc, not
    Σc·h. Under the volume form they now move volume (`phaseGrid`,
    `phaseCHVolume`): kept exactly, 0.01570 → 0.01570, 7/7.

  - **Thin Gap in every look: shipped (#248).** The owner picked every look
    (2026-10-03, over "off until tried" and "Classic only"), knowing every look would
    move the thin-gap way before anyone saw it at 60 fps; the owner's complaint it
    answers (2026-10-04): letting go of a press "ends up wiping all the liquids down
    the drain". It overrides the operating rule that a new default keeps today's look
    for this one setting; it is not a new rule. What it changed:
    - `thinGap` defaults to 1 (`src/types.ts`); no preset sets it.
    - Saved looks: a look saves every setting, so one saved while Thin Gap was off
      by default said 0 without anyone choosing it. A saved look is now version 2;
      one from before reads with Thin Gap on, one saved since keeps what it says,
      off included (`PRESET_VERSION` in `src/lib/userPresets.ts`; `npm run setlist`).
    - The opening: every look's first step is now a thin one, so the thin gap's
      fifteen pipelines (the kernels, the velocity's snapshot, the dye's carry in
      substeps; the mix's carry only where the look opens with the mix) are waited
      for before the show opens (`WebGPUFluid.prepare`, `Opening.thinGap`), and the
      first step finds them built and runs thin at once (`thinGapOn`), where before
      it ran the old way until an await said they were in. The ferrofluid's volume
      forms (`phaseGrid`, `phaseCHVolume`) wait in the ferrofluid looks for the same
      reason. `?prepare=0`, `npm run startup`'s control, builds them on the frame
      like everything else, so the check prices the same compiles on both sides.
    - The phone: nothing new to build. Its Press Amount sheet already has Thin Gap
      and Press Lift (#228), and it now reads On.
    - To judge on the Mac: docs/judging.md §30, now every look.
    - And the other way, the old plate's own pipelines (its projections, the
      velocity's self-advection, the squeeze's own solve, the dye's backtrace:
      fourteen, which a thin step never asks for) are waited for only where a look
      opens with Thin Gap off; a show that opened thin builds them when Thin Gap is
      first turned off (`prepareOldPlate`) and stays thin until they are in. Every
      opening otherwise built both solvers, about 3.4 s of a cold Mac's opening for
      nothing, which `npm run startup`'s 1b would have counted as the show's own wait.
    - Checks that measured the old plate's Press by default: `bottles`' Press-moves-
      the-oil lines (`squeezeOut` and `pressMix`, which a thin gap retires) now turn
      Thin Gap off for themselves and say so in a line of their own; `tools`' "Press
      pushes the dye out from under the palm" (a ring from 0.05 to 0.25, squeezeOut's
      move) runs on the old plate too, since on a thin gap the colour spreads as the
      film thins, r ∝ h^-½ (Mac: a pool 0.011 from the palm's middle went to 0.028
      at a sixth of the gap, √6 × 0.011 = 0.027), still inside that line's disc; the
      let-go check asks the thin gap in its own terms. `depth` asks Depth Drag on the
      old plate, the only plate it acts on, and asks the thin gap whether its rim is
      slower on a domed plate than a flat one with no dial. `press.mjs` (not in CI)
      opens on the old plate. Set lists bring old saved looks in with Thin Gap on too.

  - **18a-2, forces that are forces: shipped (2026-10-04).** Every force of a thin
    step was one step's velocity read as the speed it drives *this* liquid to at the
    rest gap, so the force itself scaled with the liquid's viscosity: the same pull
    moved glycerine as fast as the default oil, the magnet pulled the ferrofluid 7.9
    times harder through a liquid 7.9 times thicker, Rain Drip slid the whole plate
    downhill out of the dish (lab: the plate's mean flow 110% of a falling pool's),
    and Glass Smear and Updraft pushed only where there was colour. Now, on a thin
    gap only (the old plate steps as it did, to the bit), each is the force its
    phenomenon makes (`hsBody`, `hsPrep` in wgsl/thinGap.ts):
    - **Body forces** (the magnet, the maze, the oil's surface tension, Marangoni,
      Dye Weight, and the two below) are read against the *default* liquid's drag
      (`NU_REF`), so on the default Thickness every look moves as it did and on any
      other the liquid answers as h²/12μ says. The step keeps the velocity after
      them (`hsMid`, only when one ran) so hsPrep can tell them from the stirring.
    - **Rain Drip is heavy colour on a plate stood up**: the dye's excess weight over
      the plate's mean, down the plate's downhill (Tilt Direction; it was always −y),
      Boussinesq. A Hele-Shaw cell with a heavy liquid over a light one is
      Rayleigh–Taylor unstable, so the colour falls in fingers and the clear liquid
      rises past it, with no streaks drawn and no second friction. Its weight is set
      so a pool falls as fast as before (0.079 against 0.083, lab).
    - **Updraft is a draught's shear**: depth-mean τh/2μ (15g's model), on all the
      liquid, halved so a pool drifts as fast as it did (`AIR_SHEAR`).
    - **Glass Smear is the glass sliding**: ρ∂u/∂t = −∇p + f − (12μ/h²)(u − U/2),
      the liquid at half the glass's speed in any liquid and any gap, the glass at
      half of smearX so a pool moves as fast as it did. Uniform; a domed or pressed
      gap turns it through the pressure.
    - **The look's stirring stays a dial** (Turbulence and the music's swirl, the
      hand stir; Polarity's hold between colours; vorticity confinement; Vibration
      for now; the lasting current, 18a-4): still this liquid's speed at the rest gap.
      Named in "Kept, named as dials".
    - Measured: `npm run forces` (lab, plate shard, 10 checks): Rain Drip's pool falls
      7.66 times slower in a liquid 7.94 times thicker (the hand stir 0.97); a
      ferrofluid as thick as its liquid 7.73 times slower under the magnet (the old
      reading 1); the plate's mean under Rain Drip 0.0015 against the pool's 0.078,
      an evenly coloured plate still; Glass Smear 0.00239, 0.00246, 0.00246 against
      0.0025 open, thick and pressed to 0.71 of rest; Updraft 0.738 of the open
      plate's speed where the gap is 0.707, and 7.71 times slower in the thick liquid.
    - The phone: nothing new to build. No setting was added; the phone's Settings
      tile opens the same panel, where Rain Drip, Glass Smear, Updraft and Thickness
      are, and its solver is the same.
- **18a-13, tilt sloshes the liquid (shipped 2026-10-20; the owner: tip it one way and
  then the other and the colour should slop and mix).**
  - Why nothing sloshed. The thin plate's drag is 12ν/h² with an open rim and no
    inertia, so a uniform tilt is cancelled by the surface's own slope the moment it is
    applied: the liquid has no momentum to carry past the new level and nothing to
    reflect. The tilt controls themselves (Gravity, Tilt Direction, the phone's Tilt and
    the remote's tilt) only ever fed the lean and the dye's fall.
  - What it is. A shallow-water dish on the CPU (`src/lib/slosh.ts`, `SloshDish`): 64² on
    a staggered grid inside a round rim that is a wall, mass kept, depth kept at 12% of
    rest at least, implicit linear friction at the gap's own rate (`sloshDrag`, 12ν/h²)
    with a quadratic breaking drag and a Froude speed wall at 0.8, upwind advection and
    substeps of at most 5 ms. Its flow is bilerped to the plate by `addSlosh`
    (`wgsl/fluid.ts`) and added to the thin solve's velocity after the solve, so the dye,
    the oil and the pressure all see it as a current. Fed only by the tilt
    (Gravity × Tilt Direction, the remote's tilt), wherever Gravity's value came from (a
    look, Evolve or a patch on it moves it too: PLAN 18a-13e): never by sound itself,
    Plate Rock, Frame Sway or the cover. The frame and the camera do not move.
  - The dial. **Slosh**, 0 to 1, default 0, on the sheet, the desks, MIDI, the remote and
    the phone's Play sheet; a hand-only dial (not a patch or scene target, and Evolve
    never moves the dial itself). At 0, and with no tilt, the dish is dormant at no cost and the plate
    is bit for bit what it was. At the top the lean is `SLOSH_LEAN` (0.01) of g, 0.49
    plate widths/s² at full Gravity: 0.02 blew the scheme up, so the pace is a stability
    limit and wants the owner's eyes.
  - Measured (`npm run slosh`, CPU, 24 lines): the lowest mode rings at 1.415 s over 16
    half-swings (theory 1.407 s); a held tilt settles to the slope a/g (0.3333 against
    0.3333 of rest depth per plate width) and comes to rest (4.8e-7 plate widths/s); the
    ring dies at e^(-rt/2) (0.300/s against 0.300/s); mass is conserved to 1e-7 and no
    cell dries under a worst-case resonant rocking at half-periods of 0.35, 0.5, 0.7 and
    1 s (fastest 0.56 plate widths/s, Froude 0.46 at most, shallowest 0.58 of rest); half
    the dial is half the response; +x and +y are the same by a quarter turn; the dye is
    carried 4.2% of the plate's width by one rock and left 0.6% displaced after a tilt
    turned round, the ring gone; no tilt for ten minutes moves nothing.
  - A finding the owner should know. At the default Thickness (0.45) the drag is 7.46/s,
    just under critical: the liquid flows to its new level and overshoots it by 1%, it
    does not ring. It sloshes past the level by over 5% of the swing only at Thickness 0.3
    and thinner (overshoot 69% at 0, 31% at 0.3, 1% at 0.45, none above), as water does
    against honey. Which the owner will meet first when trying the dial on the default.
  - Shortcuts, named in `slosh.ts`: (a) one layer; (b) a free-slip rim; (c) the dye does
    not feel the depth; (d) upwind momentum advection, which is diffusive; (e) no Coriolis
    or centrifugal term; (f) the CPU film (a non-thin plate) ignores the slosh; (g)
    breaking is a quadratic drag and a speed wall, not a bore. Open items 18a-13a to
    18a-13d in PLAN.md replace them.
  - Not measured here: the GPU half (`addSlosh`, the thin stage's branch) has no GPU in a
    cloud session; the Mac's run is `docs/judging.md` §58 and the Metal shard.
  - The phone: the Play sheet carries Slosh under Tilt (`phone-slosh`), and the remote's
    sheet carries it too; the phone's own tilt (`useDeviceTilt`) writes the same settings
    the dish reads, so a tilted phone sloshes the plate it shows.

- **18a-13a and 18a-13d, two layers and bores (shipped 2026-10-22; the owner: "make sure
  we are using legit physics and simulations, as opposed to faking it. I want state of the
  art").**
  - The scheme, and why this one. Two-layer shallow water is usually solved as one coupled
    system (path-conservative Roe or IFCP schemes, Castro, Parés and others). Those need an
    entropy fix and lose hyperbolicity where the layers' speeds part, and the oil here is
    lenses that come and go, so most cells have no second layer at all. Instead each layer is
    solved on its own with the other's weight in its floor (the splitting Bouchut and Morales
    de Luna analyse, 2008): the water by the hydrostatic reconstruction of Audusse, Bouchut,
    Bristeau, Klein and Perthame (2004) with an HLL flux and Toro's dry-bed speeds, MUSCL with
    the MC limiter on depth, head and velocity, first order beside the rim, Heun (SSP RK2) at
    a fixed 1/420 s. It is well balanced (a lake at rest is exact, a lens floating on it too),
    never makes a negative depth, and captures a bore as a jump.
  - The oil. A lens at its capillary thickness e² = 2|S|ρ/(gρ₁Δρ) (S = −6 mN/m, ρ₁/ρ = 0.88,
    3.4 mm), read every frame from the plate's own oil share, rides the water as a raft
    pushed down the water's head; its weight is in the water's floor. Between the layers and
    the two glasses, the steady laminar drag of two stacked liquids (the 2×2 matrix the
    profile gives, reducing to 12ν/h² for one), solved implicitly.
  - The presses. Beat Squeeze's glass on the kick presses the dish too, as a pressure head
    over three nested discs (`KICK_RADII`), held and let go on the gap's own envelope
    (`glassHeld`): the ring runs out at the wave speed and back off the rim.
  - The rock. Plate Rock's swing tips the dish only as far as Frame Sway lets the music move
    the frame (`rockAccel`: the Slosh dial's top lean times Frame Sway), because a rocked dish
    moves all its liquid one way and back and the whole picture sways. So not at all at Frame
    Sway's default 0; on Bass Drop (0.35) at a third of the dial's lean.
  - Where it runs. The GPU (`gpu/slosh.ts`, kernels in `wgsl/slosh.ts`), before the solver's
    step on its encoder: the oil is a GPU field, and the dish is ten million flops a frame.
    Never read back: `SloshClock` runs it while driven and for its ring time after
    (`sloshRingSeconds`), then lays it level. The water's depth is stored as its departure
    from rest: stored whole in float32, a liquid creeping back to level at Thickness 0.6 lost
    1.0e-5 of its water in ten seconds (3e-15 in float64), now 4.3e-8.
  - Measured (`npm run slosh`, four processes, about five minutes): the lowest mode rings at
    1.425 s (theory 1.407); a held tilt settles to a/g exactly and stops (1.6e-7 plate
    widths/s); water reversed overshoots 82% with 14 crossings, the default Thickness 0.5%
    with one (the pace kept: 1% before); the ring dies at 0.335/s against the drag's 0.300
    (shortcut (i)); mass to 4.3e-8; resonant rocking at four half-periods inside the Courant
    limit (0.75 at worst), and at twice the dial's lean it still holds; a dam break's front at
    0.6719 against Stoker's 0.6684, two cells wide, the depth behind it 1.0882 against 1.0904,
    energy never rising a frame (69% spent); the two-layer drag within 0.14% of a numerical
    profile, 12ν/h² exactly for one liquid; a lens floats with nothing moving, and rocked moves
    at 35% of the water under it; a press's ring at 1.200 plate widths/s against √(gh) 1.213.
    `npm run sloshgpu` steps the GPU and the reference together through seven forcings and
    holds them to 1e-4 of the depth and the wave speed: 2e-7 to 1.8e-5 on SwiftShader.
  - Shortcuts, named in `lib/slosh.ts` (a) to (i); open items 18a-13b, 13c, 13e, 13g, 13h.

### 18b. The lamp shines through the dye (replaces paint over black)

- **Where:** `plate.ts`, where `bgColor` is black unless the blend is multiply, and the
  dye is composited with `mix(outColor, fluid0.rgb, fluid0.a)`. `decodeFluid` makes
  the opacity from the total density with a darkness fudge (×1.7 for dark dyes),
  capped at 0.95, and clamps the path through the gap to 0.35–4. The shader's own
  comment says it: "On this plate dye is light (bare water is dark)."
- **The shortcut:** the solver already stores the dye the physical way, as
  per-channel absorbance, so dyes mix subtractively in the solver. The picture then
  draws that as paint on a black ground. Clear water shows black. A gel, LED ring or
  lumia under the glass (`mixLamp`) does not pass through the dye, so blue dye over a
  red gel shows blue where it should be nearly black. A drop's glow adds the dye as
  emitted light.
- **The real phenomenon:** Beer–Lambert transmission of the lamp,
  out = L_lamp(x) · exp(−Σ εᵢCᵢh(x)). Clear liquid shows the lamp at full brightness,
  and dense dye goes saturated and then dark.
- **What it takes:** nothing new from the solver. The absorbances and the gap are
  already bound to the plate pass. Replace the mix with `lamp * exp(-A * h)`, keep
  `spectralThrough`'s six bands, and drop the clamp and the fudge. The chemistry's
  colours (the BZ waves, Liesegang rings, the pH indicator) are lerped paint today
  (`mix(outColor, col, 0.85)`); each becomes an absorbance added before the exp, so a
  BZ front becomes a pale blue wave through orange liquid with the dye still showing.
- **Cost:** free.
- **Gain:** the largest honest change available in the picture.
- **Caveat:** it inverts every approved look, which today are colour on black. It ships
  as a per-look choice of ground (black or lamp). The dark ground can then be made the
  physical way, with a dense base dye in the dish or the lamp dimmed, so a look can keep
  its darkness for a real reason. Relates to physics-plan "Layer depth" and bubbles-plan
  F (the wet carrier).
- **Shipped (#256, 2026-10-04): Lamp Ground** (`lampGround`, Settings → Lamp & Light;
  MIDI, the desks, the remote, the phone's Looks sheet), 0 in every look, so nothing
  changed until the owner turns a look up (judging §31). At 1 the ground under the
  dish is the lamp (through whatever the mixer has under the glass: the LED ring, the
  gel, the lumia), and the dye is a filter on it: `ground · exp(−a · amount)`, with
  `spectralThrough`'s six bands where Spectral Optics is up. The amount is the one the
  opacity was always made from, without the ×1.7 darkness fudge and the 0.95 cap, so
  the same pool is the same depth of dye on either ground. The back plate is a second
  filter (the product), and the pH, BZ and Liesegang colours are absorbers in the
  light, not paint. Between 0 and 1 the two pictures fade into each other, so a fader
  can play it. Not in the photograph, which has its paper. `npm run lamp` (CI, open
  shard, 8 checks) measures it: all 41 looks at 0 draw byte for byte what the plate
  drew before (against a lab built with the lamp's lines taken out); a clear pool
  throws 100% of the lamp (§20a asks 90%), 0% on black; twice the dye lets through
  the square of once to 0.00 in every channel of three dyes (blue 0.21/0.41/0.78 →
  0.04/0.17/0.61), in the ratio of the absorbances laid down; a dense blue passes
  0.00/0.02 of red and green; a pool over a gel is the gel times the dye's
  transmission to 0.49 of a byte (164 on black, the old fault); two plates multiply
  to 0.61 of a byte, pixel by pixel; the photograph does not change. Found on the way:
  the hot-spot lifted the middle to 1.28 times the lamp, which burnt a white ground
  out (the doubling read 0.89 where the law says 0.96); the lamp ground is now set
  down by the hot-spot's peak. Halfway the picture is half of each to a byte. The gooey edge's contrast is left out of the amount (18b-4)
- **18b-1. Which looks go on the lamp. Shipped (#262), by rule rather than taste**, as the
  owner asked ("automatically judge which looks should use the lamp ground"). A PR
  labelled `lamp-gallery` photographs every look on CI's Mac at 12 and 30 s, each moment
  on both grounds a quarter second apart (`GALLERY_GROUNDS=0,1`), and `npm run lampjudge`
  reads each pair pixel against pixel (`groundPairOf` in `scripts/judge.mjs`). The rule:
  a look whose own description says it is light itself (Galaxy, Cyberpunk Neon, Aurora
  Borealis, Solar Flare, Stardust Collapse, Lumia) or a picture with its own ground (Oil
  on Water, Colorful Cosmos, Sunny Side Up, Soap Film, Roy, 1963) keeps black; every
  other look is a dish, and goes on the lamp when, at both moments and over the dish, the
  bare lamp is at most 45%, black at most 30%, and lit colour at least 20% and at least
  0.6 of what it shows on black. **On the lamp: Timbre Shifter, Microscopic Chaos,
  Poster 1969, Fillmore East 1969, Crowd Plate, Milk Marbling, Red Cabbage, Chemical
  Clock, Home Movie, Clock Glass**, and **Sensual Laboratory, the owner's pick** (2026-10-04:
  "looks washed out by the light" on black, where its Multiply lays grey graphite on a cream
  platen; on the lamp the graphite reads dark; `OWNER` in `lampjudge.mjs`). The rule had kept
  it on black on its colour gates, which a look with no colour on either ground cannot pass
  (18b-9). Ferro Maze draws the same on both grounds (its own
  dye is the light table's white) and keeps 0. The pictures, every pick and its reason:
  the gallery page linked from #262; the pictures are in the project's shared files.
  `npm run lamp` now renders every look at 0 for its byte-for-byte line and asks that the
  looks shipped on the lamp draw on it. The owner can overrule any pick (Save Look).
  Found on the way: a projector set to the film alone kept the look's lamp ground, so on
  a look on the lamp it threw the bare lamp with the film over it; the film alone now
  takes the lamp ground out too (`plateSources.ts`, `npm run map`), as `wall`'s film-alone
  line on the Mac (Fillmore East) would have found.

### 18c. A pour adds liquid, not only colour

**18c-1** (2026-10-05): a bottle's pour is volume, on a thin gap (`npm run flush`, judging
§43). What was there: a pour changed what was in the column where it landed and added
nothing, so a held dropper of water moved nothing, and glycerine once poured could only
fade. Now every bottle's deposit is a volume source in the thin solve: `pourVolume` lays
its dome in a buffer and hsDivergence takes it as a source, the flow u_r = Q/(2πrh)
pushes what was there outward, and what crosses the open rim leaves. A liquid that mixes
with the clear one is added to the species field as its share; the flux-form carry
removes the pour's own outflow from the column, so every poured share is accounted for.
A held bottle is a squeezed dropper, 0.5 mL/s (`HELD_POUR`; 2 mL/s pushed the colour of
earlier drops two cells out on the Mac's mirror check), its share a step that over the
dome it lands as; a dropped dose (a drop that falls, the automation's) is its amount.
The first version mixed the pour into the column, (was + f)/(1 + f), and then let its own
flow carry f out, counting the outflow twice: half of every pour vanished.
Measured on SwiftShader: a ring of colour round a held pour of water moves out by
1.006 of the volume poured (as before 18c, 0.002); glycerine poured as volume is 0.9991
accounted for; a dish of glycerine flushed with a quarter of its volume of water keeps
0.748 of it (the volume says 0.750), its middle clear. The colour's own drops, the Pour's
kicks and the splash crown are still not volume (18c-2, 18c-3).
