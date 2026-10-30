# 18. The physics under the look: where the plate imitates a result instead of simulating it: what shipped (continued)

Part 2 of 3 of §18's archive; it begins at 18d. The section starts in `18-physics.md`.

## Second pass (moved 2026-10-04) (continued)

### 18d. Each liquid has its real properties

**18d-1** (2026-10-05): each poured liquid's own viscosity, on a thin gap (`npm run thick`,
judging §42). Every bottle that is a liquid of its own carries its real viscosity, density,
surface tension and index (`src/types.ts`). The ones that mix with the clear liquid
(glycerine, syrup, milk, alcohol) go into a GPU species field (`src/lib/liquidProps.ts`):
the share, plus Σ share·ln ν, Σ share·ρ and Σ share·n. It is carried with the colour in
flux form, and hsPrep takes each column's drag from it by the log mixing rule. The CPU's
body drag is off on a thin gap. A glycerine pool falls under Rain Drip at 0.049 of a pool of
colour (Darcy's inclusion says 0.039; it was 1.0), and syrup in the thickest look runs at 2.05
(Darcy 1.8). Water, the dyes, ink, soap, vinegar and soda are solutions in the clear liquid,
so they carry none.
**18d-2** (2026-10-05, with 18c-1): flushing, not fading. The species' 22 s fade, which
stood in for a dish being flushed, is gone: a poured liquid leaves only over the open rim,
taken off there each step, when the pours after it push it out. The automation's
headroom for a thick bottle reads the GPU's share of the dish (`speciesShare`, about once
a second) instead of the CPU's body, which still fades. `npm run thick`'s kept share now
asserts no fade (1.0000, where the fade took 0.0225); the glycerine pool, no longer
thinning as it fades, reads 0.045 of colour and syrup 2.06.
**18d-11a** (2026-10-05): the poured liquid rides the colour's carry. Carried in a stage
of its own, the species cost as much as the colour's whole carry for as long as anything
poured was on the plate (CI's Mac, 768², 15 substeps: 12.36 ms a step against 12.28).
The two cost the same though the species is rgba32f and the colour half floats, so what
a carry pays for is the face, not the field: thinFaceVel reads the velocity, the gap and
the mobility either side and the solve's P across three faces for each of a cell's four
faces, every substep. The species follows exactly the colour's flow, so one kernel
(`bodyAdvectPairSub`) now finds each face's Courant number once and moves both fields,
with the same expression, limiter and floor; the species' stage keeps only the rim.
`npm run thick` times all three on one plate (the stage alone, the colour's carry, the
two together) and asks that the species now add under three quarters of what it cost alone, and
carries the alcohol run both ways and asks for the same fields. Software, 256²: alone
1.00 of the colour's carry, riding it 0.34; the fields the same to the bit. CI's Mac,
768², 15 substeps: alone 13.54 ms (1.02 of the colour's carry), riding it 6.73 ms (0.51),
so the faces were half of a carry there, not all of it; the fields the same to 1e-4 of
the largest (Metal's compiler orders the two kernels' arithmetic its own way, and the
species feeds the flow back through the drag over 30 steps).
Under the maze's flow the colour moves in sixths, so the species there still has its own
stage (18d-11b).
**18d-12** (2026-10-05): each liquid pours its own colour, and a dye picked for it tints it
(`npm run natural`, `npm run bottles`). The owner: "Some of the liquids don't carry color.
Let's make them by default the correct color, but allow them to have color as well." Each
bottle had one colour and it was all dye (Syrup red-orange, Alcohol mint, Oil orange,
Glycerine, Silicone, Soap and Milk pale swatches), and a dye picked replaced it. Now every
bottle that is a liquid of its own carries `own`, what 6 mm of it passes of the lamp's light:
Syrup amber (maple syrup's numbers, so its Amber grade: 75% at 560 nm through 6 mm, 27% in
the blue), sunflower Oil a pale gold, Ferrofluid black, Milk white (it scatters, `scatter`
2/mm, laid as a white body until 18j), and Water, Glycerine, Alcohol, Silicone, Soap,
vinegar and washing soda clear. A clear liquid with no dye lays no colour at all: what shows
is the colour its volume pushes aside, and the lamp through it on a lamp ground. A dye
picked goes into the liquid (`pourTint`, `src/lib/liquidColour.ts`): transmissions multiply,
so absorbances add, and every hand's pour (the mouse, other fingers, a take, the phone's
Drop, the remote) reads it. A Natural swatch on the shelf, the Design desk, the phone's Dye
sheet and the remote goes back to the liquid as it is. Water keeps a blue dye by default
(the first drop has to show), Ink is a dye, and the owner's own bottles pour as they did.
The open items are 18d-3 to 18d-11 and 18d-12a to 12c in PLAN.md.

### 18e. Edges come from refraction (replaces the painted rims and highlights)

Partly shipped in #355 (2026-10-17): on projected looks, the front plate's edges come from projector pupil aperture loss and shadowgraph Becke lines, in place of painted surface-normal shading. What did not ship is open in `PLAN.md` as 18e-1 (the back plate's painted line), 18e-2 (a clear pour's edge: the deflection from ∇OPL) and 18e-3 (the heat's index).

- **Where:** in `src/gpu/wgsl/plate.ts`, the derive pass (`DERIVE_WGSL`) builds the optical path OPL = n·h at every texel (`calcOpl`). n is water's 1.333 plus the oil (`0.137` a unit of oil, 1.47 − 1.333), the clear film, the poured liquids' own indices from the species field (`pouredDn`, a − r·1.333 from its share r and Σ share·n, PLAN 18d-9; the layout binds it unfilterable, `deriveLayout` in `src/gpu/plate.ts`) and the dye's stand-in (below). h is the gap in rest gaps (6 mm). A 3-texel 9-tap stencil writes the dye's Sobel slope (`near.xy`), ∇²OPL (`near.z`) and OPL (`near.w`) once a frame; camera looks keep `sobelGrad` and write `boundaryDiff` in `near.z`. The display (`refractionOptics`) darkens where the deflection misses the projector's pupil and applies the defocus shadowgraph.
- **Behaviour removed or changed on projected looks** (not camera or closeup): the Blinn–Phong and `meniscus` specular are gone from every one; where the derive pass is on (`derivedOn`), so are the `meniscus` rim, the front plate's painted `boundaryContrast` line and the oil's painted `|∇oil|·2.2` rim are gone (the oil's 8% lens brightening stays); the back plate's line is the painted 18e-1 stand-in, without the old additive white term. Camera and closeup looks draw as before.
- **Model and declared shortcuts:**
  1. *Deflection angle:* θ ≈ |∇density| · 0.35 (from the air-masked slope `g0` of `normal0` so 33b's bubble-hole mask flattens the hole rim, weighted by `Edge Relief · plateAmt`) plus `bEdge · boundaryContrast · 1.1` (shaped by `smoothstep(0.25, 1.0, uB) * 0.78` so gentle overlap tails stay above mid-grey in `npm run mixer` and an oil drop straddling two dyes keeps each side's colour in `npm run droplens`) from the hue-gated two-dye boundary step (`boundaryEdge`, 33a), not ∇(n·h); it omits the oil, film, gap and poured-index terms the Laplacian has, and `refractionOptics` returns early where both are flat, so an edge with no dye across it (a clear pour, a clear oil drop) draws no line yet (18e-2).
  2. *dyeGain* = max(1, boundaryContrast · 3), a contrast gain on the step in `calcOpl`.
  3. *Pupil overlap:* a smoothstep with a 0.15 extinction floor (0.85 max loss) against `DROP_NA` = 0.25.
  4. *Shadowgraph transport:* ΔI/I ≈ −Δz · ∇²OPL / OPL, Δz = (projectorFocus − 0.5) · 1.5, scaled by max(1, boundaryContrast · 2) and masked by an edge-deflection smoothstep; at the default 0.5, Δz = 0, so the Becke term is 1 until the control moves.
  5. *Painted line on the back plate (18e-1, with 31a):* `edge1 * boundaryContrast * 1.6` from `smoothstep(0.1, 0.6, length(near1.xy))`. Without it the back plate's Screen/Multiply separation in `npm run mixer` is 9.9 (bar > 10, 11.0 on main, 10.3 with it).
  6. *The dye's index:* d · 0.015 · dyeGain. A dilute dye barely moves water's index and the shelf gives dyes none, so this is a stand-in; it is what gives a dye-only look its Becke lines. The poured liquids' indices are real.
  7. *Projector Focus:* a separate setting from the camera's focus, on Settings → Look, the desks, MIDI, the remote and the phone's Looks sheet, held by Evolve (`LIGHT_STACK`, `src/lib/drift.ts`).
- **Measured (2026-10-17, the owner's Mac; updated 2026-10-24 after merging 33a/33b):**
  - `npm run derive`: 4/4. Becke doublet min −0.397, max 0.737 (bars −0.07 and 0.18: 4% and 10% of the light at Projector Focus 1). The optical path of glycerine and syrup poured clear, 9 mm deep, against n · 9/6 from the shelf's indices: glycerine 2.2109 against 2.2119, syrup 2.1777 against 2.1780, water 1.9990 against 1.9995 (bar 0.005). Controls: main's derive pass fails both (min 0; path 0); the pass without the poured index reads 1.9990 for all three; the depth ignored reads 1.4736; the index read from the viscosity channel reads 10.52; the dye's constant doubled still passes the path check (2.2109).
  - `npm run holeline`: 16/16. No line round a hole in one dye (worst 0.00% < 1%, at most 0 levels <= 4; control halo worst 14.5% > 5%, least 6.9% > 3%) or round the pool's rim (0.00% < 1%; control 13.1% > 3%); the line between two dyes is drawn by refraction pupil loss (50.0% > 10% at one depth, 55.6% > 10% at 5× depth, 1.00× control); no glow round a hole (worst mean 2.67 levels < 6, control 7.5–8.8 > 6); Edge Relief lights 0.02 levels < 1 in the first 3 cells round a hole (control 10.1–19.1 > 5) while the pool's relief into clear water is 11.85 levels > 3 (1.00× control).
  - `npm run droplens`: 21/21 (projected small drop A half 92%, B 0%; magnification ×1.262 against 1.23).
  - `npm run mixer`: 68/68 (mid-grey contrast spread 27.5 → 40.6, darkest tenth 47.3 → 14.7, brightest 118.3 → 124.0; back plate Screen/Multiply 10.3).
  - `npm run microscope`: 3/3 (19.58 at 9x against the 17.65 bar).
  - `npm run mixer`: 68/68 (back plate Screen/Multiply 10.3 > 10).
  - `npm run lamp`: 9/9 and `npm run lampzero`: 4/4 (every look at Lamp Ground 0 as before the lamp, none different; two projectors add their light, mean error 0.51).
  - `npm run stages` (round 2): drawing pass at 768², two layers, 3.57 vs 3.46 ms base/branch.

### 18f. Heat comes from the lamp, and a level plate has no "up"

**Shipped (#352):**
- **Where:** `currentForces` previously pushed heat along `S.up` regardless of whether the plate was level or upright, saturated by an artificial `tanh(20T)` clamp. Centre gravity and rock used `tanh(dye - mean)`. The oil in `mixForce` had no buoyant density contrast, so oil never floated upward relative to water when the plate was tilted. Heat decayed per step rather than per second, meaning 60 Hz and 120 Hz simulations cooled at vastly different rates.
- **The real phenomenon and changes:**
  1. **Level plate has no in-plane buoyancy:** On a level dish, gravity points straight through the glass normal to the plate ($g_z$), so in-plane buoyancy ($g_x, g_y$) is identically zero. In `currentForces` and `mixForce`, in-plane thermal buoyancy is strictly gated on `upright` (zero on a level plate, active on a tilted/vertical plate).
  2. **Linear Boussinesq:** Removed the artificial `tanh(20T)` clamp. For temperature differences of tens of kelvin, density changes are linear in temperature ($\Delta \rho = -\rho \beta \Delta T$), so buoyant acceleration scales linearly with temperature. Doubling temperature doubles plume acceleration (verified by `npm run heat` check 5).
  3. **Beer–Lambert spectral absorption:** The lamp heats the dish in proportion to how much light the dye absorbs. In `decayVel`, dye absorption is decoded using the plate's `lampThrough` Beer–Lambert model (`exp(-d.rgb / d.a)` per unit depth), so dark dyes absorb strongly while pale dyes and clear water stay cool (verified by `npm run heat` checks 1 and 8). The central lamp hotspot is modeled by the spatial shortcut $1 / (1 + 2.5 r^2)$.
  4. **Anchored physical units & Newton cooling:** Temperature is modeled in kelvin. The heating rate constant `LAMP_HEATING = 0.24` K/s is derived from physical irradiance absorbed in a thin layer: $I / (\rho \cdot c \cdot h) \approx 1000\text{ W/m}^2 / (1000\text{ kg/m}^3 \times 4184\text{ J/(kg K)} \times 0.001\text{ m})$. Newton cooling decays per-second with a real physical time constant in the tens of seconds ($\tau \approx 12.4\text{ s}$ via `heatDecay^(4*dt)`), remaining dt-independent across frame rates.
  5. **Oil buoyant density:** In `mixForce`, oil ($\rho \approx 0.85\text{ g/cm}^3$) is less dense than water ($\rho = 1.0$), so oil experiences upward buoyancy along the tilted plate while heavier wax sinks.
  6. **Temperature-dependent viscosity:** Water viscosity drops by ~2% per kelvin ($\mu(T) \approx \mu_0 / (1 + 0.02 \Delta T)$), causing thin-gap mobility under gravity to rise with temperature (~1.5× at 30°C).
  7. **CPU twin alignment:** `LiquidVisualizer.tsx`'s `stepCurrent` mirrors the GPU solver: `fy = upright * p.currentBuoy * Math.min(50, Math.max(0, this.temp[q])) + p.rockY * dd`, removing `tanh(20T)` and gating on `upright`.
- **Measured:**
  - `npm run heat`: 9/9 checks passing on Metal and SwiftShader.
  - Check 1 & 8: Dark dye heats to 0.0707 K in 0.5s under full dimmer, clear water stays at 0.0000 K; dark dye absorbs 12.95× more heat than pale dye of equal total density.
  - Check 2: Dimmer at 0 produces 0.0000 K; dimmer at 0.5 heats to 0.0353 K (0.500× linear scaling).
  - Check 3: 60 steps at dt=1/60s cool to 9.0703, 120 steps at dt=1/120s cool to 9.0625; ratio 1.0009 confirms dt-independence (per-step would diverge by 3.36×).
  - Check 4: Level plate produces 0.000000 in-plane vy; upright plate produces upward plume vy = 0.126343.
  - Check 5: Plume vy is 0.22839 at T=15 and 0.41284 at T=30; ratio 1.808 confirms linear Boussinesq scaling (tanh clamp would saturate to 1.10).
  - Check 6: Thin-gap terminal velocity increases from 0.12048 to 0.18945 at 30°C (ratio 1.572), matching the ~2%/K viscosity drop.
  - Check 7: Oil rises with vy = +0.00809, wax sinks with vy = -0.03311, level plate is 0.000000.

### 18g. Colour leaves by flushing, not by fading

**18g-1** (2026-10-11): flushing at the open rim (#362). On a thin gap, old colour leaves by being pushed over the circular open rim ($r \ge 0.5$) into the overflow trough as new liquid enters, mirroring 18d-2's species rim, and a still dish loses no colour through its rim (`evapFactor` 1). Base evaporation still fades colour inside the dish until 18g-3/18g-5, and the dye-budget regulator is preserved as a named safety cap pending 18c-2 (pours add volume) to prevent runaway saturation on looks that inject dye without volume. Measured in `npm run flush` (9/9). Open items 18g-2 to 18g-5 remain in `PLAN.md`.

**18g-6** (2026-10-24): the open rim holds the oil that touches it. Found building 27f-5: a body of oil against the rim drained out through it with the plate level, by its own surface tension. The thin gap's rim held the pressure at zero, the water's in the reservoir past the cover glass, in a cell of oil too, so the oil just inside the rim was at its body's Laplace pressure σκ and the rim's own cells at none. A real body cut by the rim has its interface past it, in the reservoir's water, and its oil there is at σκ. Now the rim is held at that pressure: `rimLaplace` integrates the capillary force along a ring two cells inside the rim, from its least oily sample (the water's zero), which across an interface is the jump σκ and inside a body flat, and `mixForce` takes the gradient of w(r)·φ(θ) off the capillary force over the last eight cells inside the rim. A gradient moves nothing between two glasses, so this is the same as holding the solve's rim at φ without touching the solve or the carries' faces, and short of the band the force is the same to the bit. The closed-dish circulation the item also offered (27f-5's way) would have been a second Poisson solve every step on every oil look. `npm run rimhold` (fifth shard): a lens of 0.06 against the rim at the middle of the grid's edge kept 9.6% of its oil over six seconds on main and 97.1% now, on the diagonal 99.0%; in their last three seconds the tension drains none beyond the weak-tension control's; at a hundredth of the tension, and in the middle of the dish, nothing changed; a pour still pushes oil out over the rim. `npm run oillift`'s own rim lens at the looks' tension keeps 98.5% (66% before); its half-dish sheet laid against the rim now settles off it in its first second, the picture's mean 0.31 mm/s for that second and 0.02 by the third, where before it drained through it at 0.14 mm/s while it lasted, and the frame the tilt adds is 0.05 mm/s against the bar's 0.15 (0.006 and 0.015 before, both runs of the difference now in that first second). `npm run physics` 20/20. Left: 18g-7 (a tension-free slow loss on the diagonal) and 18g-8 (the gap's own curvature, which decides whether a real body is drawn out under the cover's edge).

### 18h. Dye spreads along the flow (replaces isotropic diffusion and the conservation patch)

- **Where:** 4-iteration Jacobi dye diffusion with one constant for every colour (about 40,000× the
  molecular rate at the slider's top, measured 2026-10-11: a drop's rms radius 4.7 → 19 →
  37 mm at 0/5/20 s, D ≈ 1.7e-5 m²/s against food dye's ~4e-10; this said "about 1000×",
  which was a guess), and heat on the same number (Double Diffusion only multiplies it;
  water's κ is 1.4e-7, about 350× the dye's; heat previously shared the dye's number, leaving 12 looks with
  0 heat spreading); the MacCormack Jacobian clamp and neighbourhood cap (`fluid.ts` advection), which
  lose the excess; `sharpenDye`, retired (0 by default) but still in the step.
- **The real phenomenon:** molecular diffusion is negligible at this scale ($D_m \approx 4\times 10^{-10}\text{ m}^2/\text{s}$). The blur in
  a Hele-Shaw cell is shear dispersion along the flow. On show timescales ($t \ll h^2/D_m \approx 25\text{ hours}$ across a 6 mm gap),
  parabolic velocity shear $u(z) = 1.5 \bar{u} (1 - 4z^2/h^2)$ across the gap yields pre-asymptotic along-streamline
  spreading with variance $\sigma^2 \approx 0.2 \bar{u}^2 (\Delta t)^2$, rather than the long-time Taylor–Aris limit.
  Edges stay sharp where the liquid is still and streak along flow lines where it moves.
  Heat spreads at water's own thermal diffusivity ($\kappa \approx 1.4\times 10^{-7}\text{ m}^2/\text{s}$, Le $\approx$ 350).
- **What it takes:** a single explicit conservative finite-volume face-flux pass (`dyeDisperse`) with an anisotropic
  tensor $D_L = D_m + \kappa_T (h/h_0)^2 |v|^2$, capped at 0.25 cells²/step (the von Neumann positivity limit), with
  positivity-preserving cross-term limiting to prevent negative oscillations. Heat diffusion is decoupled from dye diffusion
  and handled in the viscosity stage with time accumulation (`heatSeconds`) to ensure FP16 precision survival on SwiftShader.
- **Cost:** single explicit pass (0.39 ms, 2.0% share), replacing 4-iteration Jacobi (1.3 ms), saving ~0.9 ms.
- **Shipped (#357):** replaced 4-iteration Jacobi dye diffusion with single explicit conservative
  finite-volume shear dispersion (`dyeDisperse`) with molecular diffusion $D_m = 4\times 10^{-10}\text{ m}^2/\text{s}$ and
  longitudinal shear dispersion along depth-mean flow; decoupled heat diffusion to real water thermal
  diffusivity $\kappa = 1.4\times 10^{-7}\text{ m}^2/\text{s}$ in viscosity stage. Checked by `npm run dispersion` (6/6).

### 18i. Bubbles and beads live by physics, not timers

- **What was reported** (PLAN.md §18i): bubbles live 9–23 s and pop on a timer; merges are a random dice roll (`rng < dt·0.12`), pairs are pulled together by an artificial long-range force, and drift has artificial Brownian wander. Real bubbles trapped between glasses are air pancakes with no draining soap film: they do not pop on a timer, experience no long-range attraction, and run ahead of the liquid flow due to lubricating wall films (Bretherton).
- **Physical models implemented** (`src/lib/bubbles.ts`, `src/lib/beads.ts`, `scripts/bubblephysics.mjs`):
  - **Bretherton lubrication speedup**: air pancakes in planar Hele-Shaw flow advance faster than depth-mean fluid velocity $U$, with speedup $U_b / U = 1.5 / (1 + 2.26\text{Ca}^{2/3})$ where $\text{Ca} = \mu U / \sigma$ is the capillary number. As flow speed increases, thicker wetting films on the glass plates exert more drag, dynamically reducing the speed ratio (~1.43× at $u=0.01$ down to ~1.33× at $u=0.04$).
  - **Zero unagitated wander & acoustic jitter**: unagitated millimeter bubbles have high Péclet number ($Pe \gg 10^6$) and experience zero Brownian wander in quiescent fluid (drift $< 10^{-5}$ cells in 2 s). Treble acoustic agitation vibrates the plates, driving isotropic 2D wander scaling continuously with sound intensity ($2.0 \cdot \text{agitation}$).
  - **Saffman-Taylor finger wavelength scaling on Straw**: rapidly advancing air fronts destabilize into fingers with wavelength $\lambda \approx \pi b_\text{eff} / \sqrt{\text{Ca}}$, producing lobe count $m \propto R \sqrt{\text{Ca}}$ strictly between [6, 18] clamps (7 vs 12 lobes across gentle vs fast blowing, theoretical ratio 1.715).
  - **Stefan-Reynolds / Chesters thin-film drainage**: bubble coalescence is governed by thin liquid film drainage rather than random chance. Drainage time scales as $t_\text{drain} = \text{DRAINAGE\_FILM\_FACTOR} \cdot (\mu / \sigma) \cdot R_e$ with effective radius $R_e = (r_a r_c)/(r_a + r_c)$ and $(R_\text{film} / h_\text{crit})^2$ geometry factor. Resting push-apart is maintained at $0.98\cdot(a.r + c.r)$ so resting foam rafts remain stable, while hydrodynamic compressive contact ($dist < \sqrt{0.92}\cdot(a.r + c.r)$) drains and merges.
  - **Bead viscous pancake lag**: oil drops in a thin gap lag the depth-mean flow: $U_\text{bead} / U = 2 / (1 + \lambda)$ for viscosity ratio $\lambda$ on `BeadField`.
  - **Timed pops available**: per the owner's call, timed pops remain available (`timedPops = true`) to pace shows via `lifeScale`, while physical pancakes (`timedPops = false`) live without timer pops.
- **Shortcuts honestly declared**:
  - **$1.5\cdot U$ premise**: Taylor-Saffman potential flow gives $2.0\cdot U$ for an inviscid bubble spanning a Hele-Shaw cell (matching $2U/(1+\lambda)$ at $\lambda=0$). Centerline velocity of planar Poiseuille flow ($1.5\cdot U_\text{mean}$) was retained as a tuned shortcut: real light show bubbles spanning the 6 mm gap with finite lubricating films and viscous liquid caps drift at ~1.35–1.45×, avoiding excessive bubble runaway that alters show pacing.
  - **$b_\text{eff} \approx 0.091\text{ cells}$ ($0.095\text{ mm}$)**: set in grid cells (moving with grid resolution), about $63\times$ smaller than the physical 6 mm gap (`DISH_REST_GAP * DISH_METRES`). If the physical 6 mm gap were used directly ($b \approx 5.76\text{ cells}$), $m \sim 0.5$ lobes—meaning a bubble on a 192 grid would never form more than 1 finger. $b_\text{eff}$ scales the finger count to produce 6–18 visible Saffman-Taylor lobes.
  - **$t_\text{drain}$ units and $\text{DRAINAGE\_FILM\_FACTOR} = 7200$**: in real units $(\mu / \sigma) \cdot R_e$ is viscous-capillary time (~1 ms). $\text{DRAINAGE\_FILM\_FACTOR}$ represents the $(R_\text{film} / h_\text{crit})^2$ term from Chesters/Reynolds lubrication theory to bridge to macroscopic film drainage times (~4–8 s).
  - **Viscosity $\mu$**: fixed at light mineral oil ($17\text{ mPa}\cdot\text{s}$) matching the show's carrier fluid, pending per-liquid coupling in 18d.
  - **$\lambda = 1.5$ on beads**: solved back from tuned $0.8\times$ flow speed.
- **Measured** (`npm run bubblephysics`): 11/11 checks pass. Foam stability test over 3600 frames on a resting raft yields 0 merges (stable foam).

### 18j. Milky liquids scatter

**Shipped** (2026-10-10, #353): milky liquids scatter light, turning milk into an opaque white body under diffuse backscatter and casting a warm dark projector shadow with a soft forward halo.
- **Where:** everything in the plate was previously treated as a pure absorber. `colourBody` pushed opacity and saturation up to imitate a body of colour, `granulation` modulated dye optical depth with noise, and milk was rendered as dye tinting.
- **The real phenomenon:** milk is an emulsion of sub-micron fat globules and casein micelles (~100 nm) that undergo Mie and Rayleigh-Gans scattering without significant intrinsic absorption in visible wavelengths.
  - *On black ground (diffuse backscatter):* multiple scattering produces a bright, white diffuse body. Modeled using non-absorbing Kubelka–Munk theory: $Sd = \mu_s' \cdot 6.0 \cdot d_{gap}$, $R_{KM} = \frac{Sd}{1.0 + Sd}$. Strictly energy conserving ($R_{KM} + T_{KM} \equiv 1.0$) with equal RGB scattering, giving pure white reflectance ($R=G=B \approx 98.8\%$ luminance). Absorbing food dyes sit on top of this white reflective substrate, creating vibrant opaque pastel tints (e.g. pinks/reds rather than dark mud on black ground, fulfilling PLAN §4).
  - *On lamp ground (projector transmission):* a projector collection aperture (f/2–f/4 lens) collects only unscattered or forward-scattered light within a narrow pupil angle ($\sim 10^\circ$). Over $90\%$ of scattered light misses the lens entirely. Consequently, milk casts a dark shadow (mean transmission $\approx 25.4\% \le 30\%$). Casein micelle scattering follows Rayleigh-Gans $\lambda^{-1.5}$ wavelength dependence ($\vec{\kappa}_{casein} = (0.85, 0.95, 1.20)$), scattering blue light more strongly than red, causing the projector shadow to appear warm/amber ($t_R > t_B$).
  - *Forward halo:* light scattered at small forward angles forms a soft forward halo around the pool boundary, glowing slightly above bare plate transmission (+0.46%) in an annulus just outside the pool core.
  - *Zero-scatter species (control):* liquids with zero scattering coefficient ($\mu_s' = 0$, e.g. glycerine, water) render byte-for-byte identical to the bare plate across all pixels on both black ground and lamp ground.
- **Conserved transport & packing:**
  - Optical scattering coefficient $\mu_s'$ is carried in the GPU species field (channel 2, `species.b`) and advected via the existing conserved flux-form pairing (`bodyAdvectPairSub`, PLAN 18d-11a).
  - Because `view0` and `dye` textures were full, $\mu_s'$ is packed into `vel.w` via `packVel` during velocity packing (`max(0.0, sp.b)` in `.w`), alongside temperature in `v.z` (PLAN 18f / #352) and clamped velocities in `.xy`.
  - Species channel 2 was traded from density $\rho$ (which is read by nothing yet in the solver) to avoid allocating an extra PingPong texture and doubling advection bandwidth, maintaining 18d-11a's 6.73 ms paired carry. When 18d-4 buoyancy lands, density can be packed or restored (PLAN 18d-4a).
- **Verification:** `npm run milk` enforces 9 automated checks including dark warm shadow, halo glow, white diffuse backscatter, dye-on-milk pastel reflectance, conserved species advection, and zero-diff glycerine control against bare plate.
