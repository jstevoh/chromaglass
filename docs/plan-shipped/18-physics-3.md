# 18. The physics under the look: where the plate imitates a result instead of simulating it: what shipped (continued)

Part 3 of 3 of §18's archive; it begins at 18l. The section starts in `18-physics.md`.

## Second pass (moved 2026-10-04) (continued)

### 18l. A dye has more than one colour (replaces the perfect filters and the three-dye rule)

- **What was reported** (the owner, 2026-10-04): "in general there just aren't enough
  colors in the presets. I want a lot of color subtlety between color gradients."
- **What was measured** (the lab, each look's own dyes on one seeded, sheared plate,
  rendered through the plate shader; distinct colours are 5° of hue by four steps of
  saturation and of value, each holding 0.1% of the lit pixels): three causes.
  - *Two dyes on the plate.* Most looks carried two or three dyes, from §10's "2–3 hues
    a frame", and the hue walk shows one fewer than the set (`harmonyFromContract`), so
    most looks had two dyes on the plate at once; a look without the walk drew three.
  - *Perfect filters.* `addDensity`, the splat records and the picture pour read a
    palette colour as the dye's transmission with a floor of 0.002, and half the
    palette sits on the gamut's corners, a channel at 0 and one at 1. That is a filter
    that passes all or nothing of each band, which has one colour at every depth
    (1ⁿ = 1, 0ⁿ = 0): each pool was one flat colour from rim to core, Transmission
    could only change its opacity (on Classic's plate, Transmission at 1 alone: 68
    distinct colours to 66), and a sixth of a blocking dye in a mixture killed a
    channel (the hue change bunched 43–51% into the outer fifth of a mix of yellow and
    hot pink, amber and hot pink, purple and blue, orange and red).
  - *A grade that clips.* The saturation grade (1.45 on most looks) clamped each channel
    on its own: with it at 1, Classic's plate showed 75 colours against 62, Velvet
    Underground's 79 against 57.
  - Not the cause: the gooey edge (no consistent change), and the mixing law itself
    (geometric mean of transmissions, which is the physics).
- **Shipped** (#281): the dye's absorbance is a real dye's, held between 4% and 96%
  transmission per band at one unit (`src/lib/dye.ts`, every place a poured colour becomes
  dye: drops, strokes, the picture pour, the CPU engine; a colour clear in every band,
  white, stays clear liquid; the bead drops' own lens colour in `plate.ts` already had a
  4% floor and keeps its own conversion);
  Transmission's default is 1, so the colour follows the dye's depth (Beer–Lambert:
  thin washes pale, deep pools saturate and their hue shifts, a deep yellow amber, a
  deep pink crimson); 27 of the 41 looks carry five to seven dyes as a family of
  neighbouring hues and an accent, and five are on the plate at once (`WORKING_DYES`,
  `dyesOnPlate`); the grade pushes
  along the line from grey and eases in before the gamut's edge, so it keeps the hue.
  What that push cannot give, a second push about the brightest channel gives (the
  others spread from it as far as the old clamped push spread them, easing in before
  the dimmest reaches 0; spread by the whole push, a faintly tinted white paper went
  pink and `npm run benday` read 20% white where it asks 60%), so a colour already at
  the edge is still deepened and the hue still kept: without it the glints at the feet
  of Magnet Garden's domes stayed bright and `npm run spikes` failed on the Mac (16 tops
  lit against 4.0 places off them in the lab, 0.5 on main and with the second push).
  Ink lays 0.3 a drop where it laid 0.25: with a red that is no longer a perfect filter,
  a drop of Cherry Red into a yellow plate read 1.48 times as red as green against
  `npm run plate`'s bar of 1.5 (that check now uses the app's conversion, not its own copy).
  The Slow Build sequence opens on one of Classic's dyes, then three, then five. The phone
  draws the same plate and palettes. `npm run colours` (CI, open shard) holds
  it (9 checks; 2 of them pass on the old plate, the presence ones): most looks five dyes
  or more and five on every six-dye plate, six dyes strictly paler thin and more
  saturated deep (old: 0.95/0.99/0.98 for yellow, now 0.69/0.96/1.00), a pure blue
  letting 4.2% of red and green through (old 0.2%), a deep yellow toward orange from the
  depth, four neighbouring pairs walking (net hue change in the outer tenth at each end
  39–48% of the whole on the old dyes, 25–28% now, at most a third asked), the grade
  within 3° of hue at the 95th percentile (old clamp 6.2°, now 0.3°).
  Left as they were: Velvet Underground, Lumia, Cell Bloom and the Fillmores (areas of
  their own, "More going on in every look"), Sensual Laboratory (on the lamp, #262),
  Clock Glass and the ferrofluid looks (their own pass), Roy's three inks, and the looks
  whose liquids or chemistry make the colour. Judging: docs/judging.md §37 (the owner's eyes
  on every look, on the Mac).
  `npm run mixer` read the back plate's dye as the pixels adding it at full level moved;
  a deep pool of a dark dye now draws near black and adding it moves nothing, so 150
  covered pixels read as bare glass and Multiply darkening them (77 steps) failed the
  check. The footprint is now also read from the plate drawn flat (Transmission 0, same
  coverage): worst 0 off the dye, 68/68, bounds unchanged.
- **Across the looks** (the survey above, every look before and after, its own dyes,
  as many as its plate shows at once): the 27 widened looks went from a median of 65
  distinct colours and 19 hue bins to 101 and 25 (Classic 65 → 100, Galaxy 27 → 72,
  Stardust Collapse 21 → 127, Soap Film 63 → 136); the 14 left alone from 54.5 to 62.5,
  from the dye and the grade alone.

### 18m. A drop slumps under its own weight (replaces a drop that sits or blurs)

- **What was reported** (the owner, 2026-10-11): "I don't feel like we have dye and
  other diffusion through clear water."
- **What was measured** (the audit, lab, a 1 cm drop on a still thin-gap plate): at
  Diffusion Rate 0, as twelve looks have it, the drop did not move in 20 s (rms radius
  4.69 → 4.70 mm); at the slider's top it blurred into a Gaussian at D ≈ 1.7e-5 m²/s,
  about 40,000× food dye's molecular rate (18h's "about 1000×" corrected). Neither is
  what ink does: molecular diffusion would move it under 0.01 mm in 20 s. What spreads
  a drop of food colouring is its weight (its glycol makes it a percent or two denser
  than water): it sinks to the lower glass and runs out under the clear water as a
  viscous gravity current, a flat pool with a sharp front, r ∝ t^⅛ (Huppert 1982).
- **What was built:** `wgsl/slump.ts`, a stage of its own in the dye's step (apart from
  18h's 'dye diffuse', which Antigravity is replacing). The dense layer's flux between
  two glasses, with no slip on both, no net flux through the gap and equal viscosities,
  is q = −(g′/3ν) η³(1 − η/b)³ ∇η (derived for this, the same as Zheng, Rongy and Stone
  2015): Huppert's current while the layer is thin against the gap, choked as it fills
  it. The depth is the dye's amount × DYE_LAYER (0.36 mm a unit: the lab's drop is a
  0.05 mL drop from a dropper), Δρ is Dye Weight's contrast (2% to 15%) times the dye's
  strength (its strongest band per unit over a full-strength dye's; white, clear liquid,
  weighs nothing), the current runs in the water's share of a cell, and cos θ of g on a
  plate stood up. Explicit, in flux form (no dye made or lost), colour carried upwind,
  K worked out once a step, up to six substeps with each face held to 0.24 of its
  difference (18m-1 names the cap). On the default Thickness (a light oil, ν 2.2e-5)
  that is two passes and a drop spreads slowly; in water seven, and it runs.
- **Measured** (`npm run slump`, lab, 256², a 0.05 mL full-strength drop in water,
  before the check's controls were added): front 3.94 mm → 6.6 (1 s) → 8.0 (5 s) → 9.6
  (20 s) → 11.25 mm (60 s), against Huppert's 6.54, 7.99, 9.51, 10.91; growth t^0.125
  from 5 to 30 s; the edge 0.886 (half-peak radius over twentieth-peak; a Gaussian
  reads 0.48); Dye Weight 1 ×1.266 further at 20 s against the law's ×1.286. A numpy copy
  of the kernels at 768² (the cap binds harder there) reads 10.96 mm at 60 s. The
  before and after pictures are in the project's files (`diffusion/`).
- **Found along the way:** the grid's checkerboard filter (`dampGrid`) added dye at a
  drop's rim, 3.2% in 20 s (fixed in **18m-5** below).

#### 18m-5. The grid filter makes dye at a drop's rim (shipped 2026-10-25)

- **Reported:** 2026-10-20, found while building 18m (`scripts/slump.mjs`). `dampGrid` takes
  the grid's checkerboard out of the dye with the 5×5 high-pass filter `f' = f − s·K(f)`,
  `K = k⊗k/256`, `k = [1 −4 6 −4 1]`, and clamps each cell to the range `[lo, hi]` of its
  3×3 neighbours so the negative lobes of `k` cannot ring past a hard edge. That cell-wise
  clamp is not conservative: at a drop's rim on an empty plate (`f = 0` outside), `−s·K(f)`
  is negative just outside the rim and positive just inside it; the clamp cuts off the
  negative undershoot at `lo = 0` outside while keeping the positive lobe inside, making net
  dye every step.
- **Measured on main** (`7d77141`, 256², a 0.05 mL drop in glycerine, `gapThickness: 1`,
  `solutalBuoyancy: 0`, `diff: 0`): with `gridDamp` off, dye total `231.13` (`+0.000%` at 2 s
  and 20 s), front `3.94 mm` → `3.94 mm` (2 s) → `4.50 mm` (20 s). With `gridDamp` on, dye
  total `231.13` → `233.27` (`+0.926%` at 2 s) → `238.53` (`+3.202%` at 20 s), front
  `3.94 mm` → `4.13 mm` (2 s) → `4.66 mm` (`+0.72 mm` at 20 s).
- **Why not face-by-face third-difference flux limiting:** writing `K(f) = (1/256) δx⁴ δy⁴ f`
  as the divergence of face fluxes `Fx = δx³ δy⁴ f`, `Fy = δx⁴ δy³ f` and limiting each face
  with Zalesak's limiter fails `pressed` in `npm run grating` (`68.7%–69.0%` worst channel vs
  `< 68.0%` bar). A third difference is non-zero on a smooth wave whose fourth difference is
  nearly zero, so scaling a cell's two opposite faces by different neighbour factors breaks
  the cancellation `F_{i+1/2} − F_{i−1/2}` and traps that through-flux inside the cell as
  grid-scale ripple.
- **What was built:** a three-pass filter (`dampGridCurv`, `dampGridLimit`, `dampGrid` in
  `src/gpu/wgsl/fluid.ts`, dispatched by `src/gpu/fluid.ts`) that evaluates the full
  fourth-difference update `u_p = −s·K(f)_p` first (with half-sample reflection `reflect1`
  across the grid walls so the stencil matrix is symmetric with zero column sums and 1-cell
  lines and rows stay invariant), clamps each cell to `c_p = clamp(f_p + u_p, lo_p, hi_p)`,
  and returns each clamped cell's excess `e_p = c_p − (f_p + u_p)` back across the 7×7
  neighbourhood (`-3..3`) weighted by each neighbour's room `w_p = min(c_p − lo_p, hi_p − c_p)`
  to its local bounds. The return window is 7×7 (`-3..3`) rather than 5×5 (`-2..2`) because the
  5×5 filter clamps a two-cell-wide band at a steep drop rim (`room = -1`), so a 5×5 return
  window leaves the inner rim cell short of unclamped neighbours (`+0.028%` at 20 s on the
  glycerine drop vs `+0.000%` with 7×7). Because `w_p > 0` only where `e_p = 0`, clamped cells
  take none of their own excess back and receiving cells stay inside `[lo_p, hi_p]`. On the
  four opposite neighbour pairs, `hi` is gated by the one-sided numerical rule
  `6.0 * (here − mn) > mx − here` (where `6` matches the central stencil weight `k_0 = 6` of
  `k = [1 −4 6 −4 1]`): the plain 3×3 max blocks the distance-2 overshoot ring (`k_{±2} = +1`)
  but lets the distance-1 weight (`k_{±1} = −4`, `+4s/256 > 0`) diffuse dye one cell outward
  into a dry toe (moving the glycerine drop's front to `4.13 mm` at 2 s and `4.66 mm` at 20 s).
  Across gate factors `4.0`, `6.0`, and `8.0`, the glycerine drop holds `231.13` (`+0.000%` at
  2 s and 20 s) with its front at `3.94 mm` (2 s) and `4.50 mm` (20 s), and `pressed` reads
  `65.91%`, `65.96%`, and `65.95%`. The 3×3 neighbour box mirrors across grid walls with
  whole-cell reflection `mirror1` (`−x` and `2n − 2 − x`) so `macCormack`'s wall-clamped outer
  ring does not set `nW = here` (`here − mn = 0`) and trip the one-sided `hi` gate along the
  wall (`+5.51 ppm/s` with `reflect1` on the 3×3 box vs `+0.42 ppm/s` with `mirror1`). The
  `OPEN_RIM` under `thinGap` guard is unchanged.
- **Measured after:** glycerine drop with `gridDamp` on holds `231.13` (`+0.000%` at 2 s and
  20 s) and its front matches `gridDamp` off (`3.94 mm` at 2 s, `4.50 mm` at 20 s).
  `npm run grating`: all 24 checks pass (1 step `94.6%`, 1 s `4.2%`, spread `29.7%` / `6.9%`,
  pressed `66.0%` `< 68.0%`, 1-cell lines/rows `0.000%`, disc ring `0.002%`, halo `0.4%`,
  conservation `+0.42 ppm/s` against `+1.47 ppm/s` on `main`, bar `< 10 ppm/s`).
  `npm run stages` (768², 2 layers, `apple` / `metal-3`, two alternating pairs): `dye grid`
  goes from `1.54 ms` / `0.63 ms` (`3.4%` / `1.4%` of L0) and `0.81 ms` / `0.77 ms`
  (`3.8%` / `3.5%` of L1) on `main` to `3.41 ms` / `3.76 ms` (`7.1%` / `7.5%` of L0) and
  `1.99 ms` / `2.33 ms` (`8.5%` / `9.5%` of L1) on this branch.

## Third pass (moved 2026-10-29, 19m)

### 18. The physics under the look: where the plate imitates a result instead of simulating it

#### 18f. Heat comes from the lamp, and a level plate has no "up"

**Shipped (#352):** In-plane thermal buoyancy is strictly gated on plate uprightness (zero on a level plate) with tanh saturation removed (linear Boussinesq). Heat source couples to the lamp dimmer with Beer–Lambert spectral absorption from the dye (using the plate's `lampThrough` decode) and a central hotspot (`1 / (1 + 2.5 r²)` shortcut). Newton cooling decays per-second with a real physical time constant in the tens of seconds (τ ≈ 12.4s via `heatDecay^(4*dt)`). Oil in `mixForce` is given physical buoyant density below water (ρ_oil ≈ 0.85), rising on an upright plate while wax sinks. Water viscosity drops ~2%/K, increasing thin-gap mobility under gravity. Shipped writeup in `docs/plan-shipped/18-physics-2.md` §18f. Verified with `npm run heat` (9/9 checks).

- ~~**18g-1**~~ Flushing, not fading: the open rim (#362). Dye is flushed out over $r \ge 0.5$ on a thin gap as pours add volume (`npm run flush`), with zero-flux Neumann boundary conditions across `OPEN_RIM = 0.5` in `dyeDisperse`, `dampGrid` and `slumpStep` so diffusion and grid damping do not bleed dye across the rim, and a radial zero-gradient boundary condition at `OPEN_RIM` in `hsBody` so the cleared trough does not create a spurious buoyancy step at the rim. The dye-budget regulator is kept as a named safety cap pending 18c-2 (pours add volume).

#### 18j. Milky liquids scatter (shipped)

Shipped in #353 (2026-10-10): optical scattering packed into `vel.w` from species channel 2
with conserved flux-form advection; Kubelka–Munk diffuse backscattering on black ground
yielding opaque white milk and pastel food dyes (PLAN §4); two-flux forward extinction
with Rayleigh-Gans wavelength dependence and narrow aperture loss casting a warm dark
projector shadow on lamp ground with a soft forward halo; byte-for-byte identity for
zero-scatter liquids. Story and measurements in `docs/plan-shipped/18-physics-2.md` §18j.

## Fourth pass (moved 2026-10-29, 19m-2)

### 18. The physics under the look: where the plate imitates a result instead of simulating it

#### 18e. Edges come from refraction

**Partly shipped** (#355). What shipped: on projected looks, the front plate's edges come from projector pupil aperture loss and shadowgraph Becke line doublets, from the optical path OPL = n·h and its Laplacian in the derive pass. n is water's 1.333 plus the oil (1.47), the film, the poured liquids' own indices from the species field (18d-9) and a named stand-in for the dye (d·0.015·dyeGain: a dilute dye barely moves the index, and the shelf gives dyes none); h is the gap. A separate Projector Focus control (Settings, desks, MIDI, remote, the phone's Looks sheet; 0.5, in focus, by default, so every look is as before until it moves). Painted specular highlights are gone from projected looks and stay on camera and closeup looks. Named shortcuts (each in `refractionOptics`' notes and the archive): the deflection from the dye's slope, not ∇OPL (18e-2); dyeGain, a contrast gain on the step; the pupil overlap a smoothstep against `DROP_NA` 0.25; the shadowgraph's gain max(1, boundaryContrast·2) and edge mask; the back plate's painted line (18e-1); the dye's stand-in index d·0.015·dyeGain; no heat in n (18e-3). What did not ship is below (18e-1 to 18e-4). Follow-ons (§31, 2026-10-11): **31a** gives the defocus Δz a control that also blurs whichever dish is out of focus; **31d** evaluates the shadowgraph per band with each liquid's dispersion. Shipped story and measurements in [`docs/plan-shipped/18-physics-2.md`](18-physics-2.md) §18e. Open:

#### 18i. Bubbles and beads live by physics, not timers

**Partly shipped** (#358): Bretherton lubrication speedup ($U_b / U = 1.5 / (1 + 2.26\text{Ca}^{2/3})$ with ratio falling dynamically with flow speed $U$), unagitated Brownian wander removed (treble acoustic vibration drives isotropic 2D wander scaling with agitation), Saffman-Taylor finger wavelength scaling on the Straw ($m \propto R \sqrt{\text{Ca}}$), Reynolds/Chesters thin-film drainage merge ($t_\text{drain} \propto (\mu / \sigma) R_e$ with restored 0.98 resting push so foam rafts remain stable), and bead viscous pancake lag ($2U / (1 + \lambda)$ with default $\lambda = 1.5$ yielding $0.8\cdot U$). Measured by `npm run bubblephysics`. How it was modeled, tuned shortcuts ($1.5\cdot U$ premise, $b_\text{eff}$ gap scaling, and $t_\text{drain}$ film factor), and measurements are in [`docs/plan-shipped/18-physics-2.md`](18-physics-2.md), under the same number. Open:

#### 18m-1. The slump's cap (a speed shortcut)

- ~~**18m-1. The slump's cap (a speed shortcut).**~~ **Partly shipped** (#371): replaced
  the viscous-only cap with a per-cell regime switch `min(viscous rate, inertial rate)`
  using the Huppert–Simpson front Froude number `Fr = 1.19` (`Fr √(g′η(1 − η/b))`,
  Huppert and Simpson 1980) in `slumpRate`, planned `substeps = Math.ceil(most /
  SLUMP_FACE)` up to `SLUMP_SUBSTEPS = 20` in `fluid.ts` (covering 1024² at Heavy dye 1),
  and kept `min(a, SLUMP_FACE)` (`0.24`) in `slump` as a stability guard (`npm run slump`
  13/13, including deep heavy pools on 768² and 1024²).

#### 18a. The plate is a Hele-Shaw cell (the item as first written)

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

#### 18a. The plate is a Hele-Shaw cell (the app's let-go check)

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

#### 18a-11. The cost measured

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

#### 18a-12. The thin gap's pressure was never cleared

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
