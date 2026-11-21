# Realism sweep 2026-11: what still imitates, after §38

Swept ChromaGlass's visualization codebase at `origin/main` `801a815e` (`2026-11-21`) against the owner's standing rule: simulate physics rather than fake looks. Covered: fluid core (`src/gpu/fluid.ts`, `fluid/`, `wgsl/fluid/`, `thinGap.ts`, `thinWarm.ts`, `slump.ts`, `slosh.ts`, `tank.ts`, `lampBoil.ts`, `particles.ts`, `src/lib/slosh.ts`, `turntable.ts`, `cover.ts`, `tank.ts`, `lampBoil.ts`); drops, bubbles, oils, and films (`bubbles.ts`, `beads.ts`, `dropImpact.ts`, `oilLay.ts`, `soapFilm.ts`, `liquidPhase.ts`, `liquidProps.ts`, `dropSplash.ts`, `speciesPoll.ts`, `air.ts`, `beadMask.ts`, `soapFilmPlate.ts`, WGSL); ferrofluid and magnets (`phase.ts`, `phaseForces.ts`, `labyrinth.ts`, `standing.ts`, `ferroDrop.ts`, `spikes.ts`, `magnetDisc.ts`, `magnetSize.ts`, `phasePour.ts`); optics and light (`plate.ts`, `plateTransmit.ts`, `plateThinFilm.ts`, `plateMoire.ts`, `plateFilm.ts`, `plateBenDay.ts`, `lampField.ts`, `closeupDepth.ts`, `pack.ts`, `glint.ts`, `camera.ts`, `post.ts`, `output.ts`, `tankDraw.ts`, `plateUniforms.ts`); tools (`tools.ts`, `fluidSimulation.ts`, `squish.ts`, `sheet.ts`, `handSolid.ts`, `handCarry.ts`, `handTilt.ts`, `plateRock.ts`, `pressRing.ts`, `roomStir.ts`, `videoFlow.ts`, `inkTitle.ts`, `logoMelt.ts`, `LiquidVisualizer.tsx`, `src/app/`); sound (`sceneMap.ts`, `areaCords.ts`, `kickBloom.ts`, `phrasing.ts`, `macroCamera.ts`, `useMusicIntelligence.ts`, `LiquidVisualizer.tsx`); and presets/defaults (`presets.ts`, `presetsFoam.ts`, `presetsMoire.ts`, `types.ts`).

Left out on purpose: everything in `docs/plan/38-realism-audit.md` ("What is already physical, and should be left alone"), open items in §9–§47 that already cover a shortcut completely (`38a-2`, `38c-1..4`, `38d`, `38e`, `38f`, `38g-2`, `38h-5..16`, `38k-1..7`, `38l-1..6`, `38n-2..3`, `38p`, `38q`, `38r-1..21`, `38t`, `38u-4`, `38u-7..12`, `38u-14..15`, `18a-2..10`, `18g-4`, `18h-2`, `29c-1..12`), and macro 3D bead work owned by `14ab-6` unless a new defect appeared. Every finding is `NEW` or a concrete `UPDATES <id>`.

---

## Ranked: the biggest fakes

1. **RS-25** — `vel0.w` collision turns the whole plate into milk on every ferrofluid closeup — S (none) · High · `NEW`
2. **RS-43** — Legacy `audioMappings` bypasses cords on 33/34 presets (dye, heat, velocity kicks, 50%-white sparks) — L (none) · High · `NEW`
3. **RS-49** — Built-in presets wire cords to `vorticityConfinement` (16 looks), `platePressure`, `beads`, `oilTension`, `buoyancy`, noise — M (none) · High · `NEW`
4. **RS-38** — Default-on Lissajous `ambientSeed`, `thinPatch` bleaching, erasing `blowAir`, 5 s emergency stamping — S–M (none) · High · `NEW`
5. **RS-44** — Direct audio pulses `ferroLabyrinth`, `magnetStrength`, and Lissajous `magnetWalk` speed without cords — S (none) · High · `NEW`
6. **RS-36** — Local Press injects an artificial "Photoscope twist" vortex (absent on remote Press) — S (none) · High · `NEW`
7. **RS-37** — `beads.disturb`, `bubbles.disturb`, and `popBubble` bypass flow, pop bubbles under Finger, add parity swirl — S (none) · High · `NEW`
8. **RS-39** — Mouse Dropper at Drop Height 0 bypasses `18c-2` volume drops; Spray/Splatter/Pour/Streak lack volume — M (none) · High · `UPDATES 18c-3b`
9. **RS-11** — Oil beads (`BeadField`) still run heuristic drift, `dt`-free merges/repulsion, attraction, timers, box clamp, noise spawns — M (none) · High · `NEW`
10. **RS-12** — Soap film black spots are Eulerian-pinned while one-way flux cuts drain ruptured cells below 8 nm (even negative) — M (none) · High · `UPDATES 32g-1, 32g-2`
11. **RS-20** — Rosensweig lift, onset, and labyrinth repulsion use total `|B|` instead of normal `|B_z|` and omit tangential `B_ρ` — S–M (none / small) · High · `NEW`
12. **RS-1** — `PLATE_BOIL_WGSL` advects glass heat capacity at fluid speed, drags `T` at steam slip speed, loses vapour — M (small) · High · `UPDATES 36e-4`
13. **RS-2** — Boiling Kell buoyancy clips back to `S.maxCur` every frame; `viscosity` double-diffuses `vel.z` during boil — S (none) · High · `NEW`
14. **RS-13** — `dropImpact.ts` hardcodes water for all liquids; `dropSplash.ts` fabricates satellite mass and decouples trickle dye — S (none) · High · `UPDATES 18c-3`
15. **RS-45** — `platePressure` cords (8 shipped presets) and `Phrasing` audio energy still modulate solver `dt` — S (none) · High · `UPDATES 38u-6`

---

## Findings

### Fluid core

#### RS-1. `PLATE_BOIL_WGSL` advects glass heat capacity, drags `T` at steam slip speed, and loses vapour
- **Where:** `src/gpu/wgsl/lampBoil.ts:819-828`, `src/gpu/fluid/passes.ts:389-487`. **Status:** `UPDATES 36e-4` — adds three live-plate transport bugs absent from `BOIL_DISH_WGSL`.
- **Fakes:** Adds `driftSpeed = (9.81 * d² / (12 * mu)) * (rho - RHO_V) * alpha` into `uCells` and backtraces `T` and `alpha` together in one un-substepped bilinear tap: stationary glass heat capacity ($\rho_g c_g d_g \approx 4.2\times 10^3\text{ J/(m}^2\cdot\text{K)}$, 33–50% of $C$) flows with water, `T` teleports upward at steam slip speed (~5.6 m/s at 2 mm, 100 °C, $\alpha=0.5$, ~240 cells/frame at $512^2$), and vapour violates CFL and conservation.
- **Real:** $C\,\partial_t T + [(1-\alpha)\rho_l c_l d]\mathbf{u}_l\cdot\nabla T = \nabla\cdot(K\nabla T) + q_\text{net}$. Advect `T` along $\mathbf{u}_l$ weighted by $(1-\alpha)\rho_l c_l d/C$ (as `BOIL_DISH_WGSL:581` does); advect $\alpha$ separately in CFL-substepped minmod flux form with Bretherton/Taylor–Saffman slip.
- **Cost:** M (small, ~0.2–0.4 ms only when `Heat > 0`). **Priority:** High. **Plan:** `docs/plan/36-analog-operators.md`.
- **Check:** With phase change off, a temperature pulse moves at $(1-\alpha)\rho_l c_l d/C$ of liquid speed; rising steam on an upright dish leaves `T` behind and conserves $\sum\alpha$ within 1%.

#### RS-2. Boiling Kell buoyancy clips back to `S.maxCur` every frame; `viscosity` double-diffuses `vel.z` during boil
- **Where:** `src/gpu/wgsl/fluid/forces.ts:275-289`; `src/gpu/fluid.ts:655-668`; `src/gpu/wgsl/lampBoil.ts:750-757, 854-864`. **Status:** `NEW`.
- **Fakes:** `currentForces` adds `(1 - curDamp) * U_buoy` (~2%) after clamping `c` to `S.maxCur`, then L277 clips stored `c` back to `S.maxCur` next frame — discarding ~98% of buoyancy above `maxCur`. `fluid.ts:665` leaves `heatVisc` on during `boilLive`, double-diffusing `vel.z` and causing `tempAt` (`:756`) to overwrite float32 `boilAlpha.g` with FP16 `vel.z`.
- **Real:** Apply $\Delta\rho(T)\mathbf{g}$ in `hsBody`/`sealWeight` (`38f`) or exempt thermal velocity from `S.maxCur`; zero `heatVisc` while `boilLive` so `PLATE_BOIL_WGSL` solely owns conduction.
- **Cost:** S (none). **Priority:** High. **Plan:** `docs/plan/36-analog-operators.md`.
- **Check:** At 80 °C ($U_\text{buoy} > 5\,\text{maxCur}$), `currentForces` exceeds $0.9\,U_\text{buoy}$; lateral cooling of a 50 K spot is identical at `doubleDiffusion = 0` and `1` with zero FP16 snapback.

#### RS-3. `cometX`/`cometY` pulls heavy dye sideways across a level plate with unitless gain
- **Where:** `src/gpu/wgsl/thinGap.ts:336-358`; `src/gpu/fluid.ts:400, 404, 814`; `src/sim/fluidSimulation.ts:3205-3206`; `src/presets.ts:114-115, 138-139, 522`. **Status:** `NEW` (sideways twin of `38u-12`).
- **Fakes:** Adds `vec2f(S.cometX, S.cometY) * w` (`cometSpeed * 1.5`) onto heavy dye on a flat, level dish with no tilt, sliding glass, or wind (`fluid.ts:814` also omits it from `thinBody`'s gate).
- **Real:** Directional heavy-dye streaming requires tilt $\mathbf{g}_\parallel = g\sin\theta(\cos\phi,\sin\phi)$ driving $\Delta\rho g\sin\theta\,h^2/(12\mu)$, cover slide ($\mathbf{U}_\text{cover}/2$), or wind. Retire `cometX`/`cometY` and tilt `comet`.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Level plate (`tilt = 0`, `plateUpright = 0`) drifts $<0.1$ cells in 5 s; retuned `comet` streams at $\Delta\rho g\sin\theta\,h^2/(12\mu) \pm 15\%$.

#### RS-4. Liesegang (`liesStep`) advances by frame-rate and opacity-dial count in grid-cell units
- **Where:** `src/gpu/fluid.ts:1613-1621`; `src/gpu/wgsl/fluid/reactions.ts:87-111`. **Status:** `UPDATES 1b` — refining `LIES_GRID` slows rings as $1/N^2$ without SI units.
- **Fakes:** Runs `max(1, round(24 * lies))` steps of fixed `0.01` per frame with cell diffusivities (`6, 6, 0.5`): 120 Hz runs $2\times$ faster than 60 Hz, `lies` scales speed $24\times$, and doubling `LIES_GRID` slows $4\times$.
- **Real:** Keller–Rubinow $\partial_t A = D_A\nabla^2 A - kAB$ ($D \sim 1\text{–}2\times 10^{-9}\text{ m}^2/\text{s}$ times one named time-lapse factor), stepped from `p.magnetSeconds` with $\Delta x = \text{PLATE\_METRES}/N_\text{lies}$ and CFL substeps, independent of `lies`.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/01-sharp-liquid.md`.
- **Check:** 10 s at 30/60/120 Hz and `lies = 0.25` vs `1` match ring radii within 2%; `128² → 256²` holds first three band radii in mm within 3%.

#### RS-5. `spinSwirl` omits `species`/ferrofluid/film/thermal viscosity; `spinSwirl` and `currentForces` keep `tanh` density clamps
- **Where:** `src/gpu/wgsl/fluid/forces.ts:270, 437-454`; `src/gpu/fluid/passes.ts:745-755`. **Status:** `UPDATES 22g, 38s`.
- **Fakes:** `spinSwirl` reads only carrier + oil viscosity (never `species`/`film`/`vel.z`/`phase`), so spun glycerine ($1000\times$ water) gets zero differential grip; `spinSwirl:438` and `currentForces:270` still clamp `dye.a - meanD` via `tanh`.
- **Real:** Rotating-gap drag $k = 12\nu_\text{eff}/h^2$ uses full Grunberg–Nissan viscosity (fold into `hsPrep` per `22g`) with linear $\Delta\rho/\rho_0$.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/22-spin.md`.
- **Check:** Poured glycerine spun on water at 2 rad/s leads water by $>0.8\times$ dish lag; centrifugal drift is linear in dye concentration up to $3\times$ mean.

#### RS-6. `slumpRate` divides by plate-wide carrier viscosity, ignoring poured `species` viscosity
- **Where:** `src/gpu/wgsl/slump.ts:99-125`; `src/gpu/fluid/passes.ts:573-596`; `src/gpu/fluid.ts:1654-1668`. **Status:** `UPDATES 18m-3` — adds local $\nu$ beside `18m-3`'s $\Delta\rho$.
- **Fakes:** `slumpPlan` uses global `thinGapViscosity(gapThickness)` and never binds `species`, so dyed glycerine ($1000\text{ mm}^2/\text{s}$) on water ($1\text{ mm}^2/\text{s}$) slumps at water's viscosity up to the Froude cap.
- **Real:** Huppert diffusivity $K = (g'/3\nu_\text{local})\eta^3(1-\eta/b)^3$ divided by local Grunberg–Nissan factor (`thinGap.ts:624-625`).
- **Cost:** S (small, <0.05 ms when `speciesLive`). **Priority:** Medium. **Plan:** `docs/plan/18-physics-3.md`.
- **Check:** After 10 s on water, dyed glycerine spreads $<1/5$ as far as dyed water ($r \propto (t/\nu)^{1/8}$).

#### RS-7. `addSlosh` overlays a single oil/water-blended velocity onto `velForced` after `thinProject`
- **Where:** `src/gpu/wgsl/fluid/forces.ts:584-599`; `src/gpu/fluid.ts:942-950`; `src/gpu/wgsl/fluid/shared.ts:306-315`. **Status:** `UPDATES 18a-13g, 38r-1`.
- **Fakes:** Adds `mix(u_water, u_oil, c)` after `thinProject`, injecting divergence $(\mathbf{u}_\text{oil}-\mathbf{u}_\text{water})\cdot\nabla c$ at oil rims, dragging mixed-cell water dye at oil speed, and mismatching pre-slosh `hsP` in `THIN_FACE`.
- **Real:** Two-layer shallow water advects each phase with its own depth and velocity: $\partial_t(h_k C_k) + \nabla\cdot(h_k C_k\mathbf{u}_k) = 0$.
- **Cost:** M (small, ~0.1 ms when slosh runs). **Priority:** Medium. **Plan:** `docs/plan/18-physics.md`.
- **Check:** With `Slosh > 0` and `Oil Bodies > 0` on a tilted dish, oil and dye conserve within 0.5% with no rim piling, and water dye beside oil moves at $\mathbf{u}_\text{water}$.

#### RS-8. `liquidForces` has a $1/N^2$-vanishing polarity force, 60 Hz one-way `repel` diode, and box clamp
- **Where:** `src/gpu/wgsl/fluid/forces.ts:62-108`; `src/gpu/fluid/passes.ts:373-381`. **Status:** `UPDATES 15e-10` — shows `polar`/`repel` cannot simply be rescaled and should be retired.
- **Fakes:** `(dR² - dL²) * A.b.x * dt * S.n` scales as $2\Delta x^2 p_x p_{xx} \propto 1/N^2$; `repel` is a one-way diode scaled by `60.0` Hz; per-axis `clamp(±0.22)` biases diagonals to $45^\circ$.
- **Real:** Move viscosity/density to `species`, soap to `marangoniFlux` (`38c-2`), immiscibility to Cahn–Hilliard (`mixForce`), retiring `stepLiquids`.
- **Cost:** M (with `15e-10`/`18d-4`; none, removes pass). **Priority:** Medium. **Plan:** `docs/plan/15-tools-on-liquids.md`.
- **Check:** At $128^2$, $256^2$, $512^2$, an immiscible poured boundary holds width and separation speed within 15% with zero $45^\circ$ bias.

#### RS-9. `sharpenDye` is a non-conservative, `dt`-free unsharp mask still in Settings and activated by Evolve
- **Where:** `src/gpu/wgsl/fluid/dye.ts:143-169`; `src/gpu/fluid.ts:1624-1629`; `src/lib/drift.ts:255`; `src/components/settings/LookSections.tsx:55`. **Status:** `NEW`.
- **Fakes:** Per-frame backward diffusion with `SHARP_FLOOR` deadzones and `[lo, hi]` clamps (no `dt`/$\Delta x$) breaks flux conservation and is set to `sharpness: 1` by Evolve's `'glass'` theme (`drift.ts:255`).
- **Real:** Miscible dyes diffuse down gradients; immiscible edges come from Cahn–Hilliard (`oil.ts`). Retire `sharpenDye` from Evolve, Settings, and solver.
- **Cost:** S (none, removes pass). **Priority:** Low–Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Evolve never sets `sharpness > 0`; if kept as a filter, $\sum d.a$ conserves within 0.1% and edge slope/s matches at 30 vs 60 Hz.

#### RS-10. `hsPrep` clamps thermal thinning at `50 K` (`70 °C`) and `lib/cover.ts` hardcodes water density (`1000 kg/m³`)
- **Where:** `src/gpu/wgsl/thinGap.ts:641`; `src/lib/cover.ts:63, 101-109, 225`. **Status:** `UPDATES 18f-4, 38s`.
- **Fakes:** `exp(-0.02 * clamp(uf.z, 0, 50))` leaves 100 °C water 31% too thick ($0.368\times$ vs Vogel $0.281\times$). `cover.ts` uses `DENSITY = 1000` for glycerine ($\rho = 1261\text{ kg/m}^3$), settling 26% too fast with a 26% oversized bead.
- **Real:** Vogel water viscosity $\mu(T)/\mu(T_0) = 10^{247.8/(T+133.15)-247.8/(T_0+133.15)}$ (as in `lampBoil.ts:95-98`) without the 50 K cap; tabulated `carrierDensity(nu)` (998–1261 kg/m³) in `cover.ts`.
- **Cost:** S (none). **Priority:** Low–Medium. **Plan:** `docs/plan/18-physics-2.md` / `docs/plan/38-realism-audit.md`.
- **Check:** At `uf.z = 80`, `hsPrep` water mobility is $3.55\times$ its 20 °C value ($\pm 2\%$); `npm run gap` verifies `carrierDensity` within 2% and glycerine settle/bead use $\rho \approx 1261\text{ kg/m}^3$.

---

### Drops, bubbles and films

#### RS-11. Oil beads (`BeadField`) still use pre-38b/g/n drift, `dt`-free merges/repulsion, attraction, timers, box clamp, and noise spawns
- **Where:** `src/lib/beads.ts:76-81, 146, 209, 272-286, 300-349, 370-405, 424, 442-445, 579, 639-641, 675`; `src/components/LiquidVisualizer.tsx:4444`. **Status:** `NEW`.
- **Fakes:** Nine legacy heuristics: (1) `-tiltX * 500` cells/s ignoring `plateSin`, $\Delta\rho$, $b^2$, $\mu$; (2) hardcoded `viscosityRatio = 1.5`; (3) hardcoded `MERGE_TAU_S = 0.18`; (4) `dt`-free `rng.float() < 0.02` merges (2× faster at 120 Hz); (5) `dt`-free `(want - d) * 0.25` repulsion; (6) closed-cell attraction out to `1.3*(r1+r2)`; (7) countdown `innerLife = 15 + 20*seed` deleting compound drops; (8) square-box clamp `[2, N-3]`; (9) `populate`/`populateTiny` spawning/evicting beads via 2-octave value-noise `patchField` to chase target counts and `TINY_SHARE = 0.8`.
- **Real:** Hele-Shaw $\mathbf{u}_d = \frac{2}{1+\lambda}\mathbf{U} + \frac{\Delta\rho g\sin\theta\,b^2}{12\mu_c}\hat{\mathbf{e}}_\theta$; Paterson $\tau_2 = \frac{2(\mu_d+\mu_c)R^3}{b^2\sigma_{ow}}$; Stefan–Reynolds drainage $t_\text{drain} \propto (\mu_c/\sigma_{ow})R_e$; Durian crowding $k=\sigma_{ow}b/\tilde{R}$ vs drag $6\pi\mu_c R^2/b$ with zero attraction; area-conserving breakup past $\text{Ca} = \mu_c\dot{\gamma}R/\sigma_{ow} > \text{Ca}_c$; exit at `OPEN_RIM`.
- **Cost:** M (none). **Priority:** High. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Tilt climb matches $\Delta\rho g\sin\theta\,b^2/(12\mu_c)$ across two viscosities/gaps; merge count agrees within 10% at 60 vs 120 Hz; beads at $1.15(R_1+R_2)$ stay still; stretch relaxes at $\tau_2$; $\sum\pi R_i^2$ conserves to $<1\%$; beads exit `OPEN_RIM`.

#### RS-12. Soap film black spots are Eulerian-pinned while one-way flux cuts drain ruptured cells below 8 nm (even negative)
- **Where:** `src/lib/soapFilm.ts:255-267, 396-399, 419-422, 436`; `src/gpu/wgsl/soapFilm.ts:128-142, 393, 415, 439`. **Status:** `UPDATES 32g-1, 32g-2`.
- **Fakes:** `ruptured[c]` stays frozen on its grid cell while flow swirls past; `soapSetup` still drives peak buoyancy on faces touching 8 nm cells, and `soapTransport` zeros inflow (`ruptured[cR] && vel > 0`) without zeroing outflow (`ruptured[cL] && vel > 0`), draining ruptured cells below 8 nm (even negative).
- **Real:** Newton black spots ($h \approx 8\text{ nm}$) advect passively with $\mathbf{u}$ ($\partial_t h + \nabla\cdot(h\mathbf{u}) = 0$, $\nabla\cdot\mathbf{u} = 0$). Minmod TVD on divergence-free $\mathbf{u}$ preserves $h \ge 8\text{ nm}$; remove one-way cuts and advect `h`/`ruptured`/`age` conservatively.
- **Cost:** M (none). **Priority:** High. **Plan:** `docs/plan/32-soap-film.md`.
- **Check:** A lower-half black spot rises and follows `ext` air swirl (centroid within 15% of $\int u\,dt$), `min(h) >= 8 nm`, and $\sum h$ conserves to rounding.

#### RS-13. `dropImpact.ts` hardcodes water for all liquids; `dropSplash.ts` fabricates satellite mass and decouples trickle dye
- **Where:** `src/lib/dropImpact.ts:82, 113-128`; `src/sim/dropSplash.ts:66-80, 94-96, 112-135`. **Status:** `UPDATES 18c-3`.
- **Fakes:** `dropImpact.ts:82` hardcodes water (`RHO=1000, SIGMA=0.072, MU=1e-3`) and `dropSplash.ts:114` omits live `h` (so glycerine, oil, alcohol splash as water on 2 mm). On a splash, `layDrop` queues 100% parent volume/dye (`:94`) *and* stamps `n` satellites (`dyeAmount*0.22*(1-dd/sr)`) with zero volume and `addVelocity` kicks (+50–150% phantom dye). Trickles (`:75-80`) stamp dye immediately while volume waits until `DROP_TATE` and releases clear (`dye = 0`). Crater scaling is unitless.
- **Real:** Pass liquid $(\rho,\sigma,\mu)$ and live $h$ into Cossali $K = \text{We}\,\text{Oh}^{-0.4}$ and Bhola–Chandra fingers; partition conserved volume/dye between main $(1-f_\text{sat})$ and $n$ volume-queued satellites; accrue dye alongside volume in `DropQueue` until `DROP_TATE`.
- **Cost:** S (none). **Priority:** High. **Plan:** `docs/plan/18-physics-2.md`.
- **Check:** From 0.25 m, water/alcohol splash while glycerine does not; splashing and non-splashing drops of equal `amount` add equal dye within 1%; trickles deposit zero dye before `DROP_TATE`, then open one dyed window.

#### RS-14. Oil Bodies (`bodyLand`/`bodyPartition`) ignore bottle polarity, steer dye with a blurred beacon, and transmute phases
- **Where:** `src/gpu/wgsl/fluid/oil.ts:143-155, 240-335`. **Status:** `UPDATES 27f-9f`.
- **Fakes:** `bodyLand` splits poured dye by local oil fraction `c` regardless of bottle polarity; `bodyPartition` runs grid-rate 4-neighbour/5×5 exchanges, steers astray dye up a multi-blurred `reachT` beacon, and transmutes oil/water dye (`toOil`/`toWater`, `:329-332`) in pure 5×5 patches.
- **Real:** Partition coefficient $K_{ow}$ is fixed; dye lags oil only because Cahn–Hilliard flux $\mathbf{J}_o = -M\nabla\mu$ omits `oilDye`. Tag pours by polarity and advect oil/water dye conservatively with $\mathbf{u} + \mathbf{J}_o/c$ and $\mathbf{u} - \mathbf{J}_o/(1-c)$, retiring `reachT`/`astray`/transmutation.
- **Cost:** M (none, net GPU saving). **Priority:** Medium–High. **Plan:** `docs/plan/47-macro-photography.md` / `docs/plan/38-realism-audit.md`.
- **Check:** Water dye poured on oil stays $>98\%$ in water; a moving/coarsening oil drop keeps $>95\%$ of its oil dye inside $c > 0.5$ at $192^2$ and $384^2$ with no `reachT` pass.

#### RS-15. Straw fingering breaks area conservation (`rimAt >= 1`), uses fixed clocks (`0.25 s`/`1.2 s`), and caps at `0.07 N`
- **Where:** `src/gpu/wgsl/air.ts:59, 69-78`; `src/lib/bubbles.ts:427, 442, 451-456, 523`. **Status:** `NEW`.
- **Fakes:** `rimAt = 1 + f * FINGER_REACH * lobe * len >= 1` creates ~35–50% phantom area; fingers grow on `0.25 s` and decay on `1.2 s` ignoring $\mu,\sigma,b,R,n$; radius hard-caps at `0.07 N`, discarding blown air.
- **Real:** Area-normalized contour $r(\theta)/R = \alpha(1 + f\cdot F(\theta))$ ($\frac{1}{2\pi}\int (r/R)^2 d\theta = 1$); Paterson $\omega_n = \frac{n-1}{R}\dot{R} - \frac{b^2\sigma}{12\mu R^3}n(n^2-1)$; uncapped growth until `OPEN_RIM`.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/15-tools-on-liquids.md`.
- **Check:** Air area at `f = 0` vs `0.55` agrees within 1%; decay scales as $\mu R^3/(b^2\sigma n(n^2-1))$; continuous blowing grows area linearly until `OPEN_RIM`.

#### RS-16. Boiling steam pockets (`AIR_BOIL_WGSL`) fake constant radius, constant film thickness, collapsed interior radius, and 4×4 hash IDs
- **Where:** `src/gpu/wgsl/air.ts:55-56, 203-217`; `src/gpu/wgsl/bubbleShape.ts:127-137`. **Status:** `NEW`.
- **Fakes:** Hardcodes `AIR_BOIL_R = 0.017494` and `AIR_BOIL_FILM = 0.5333333`, fakes radius as `clamp(1 - a, 0, 1)`, and hashes IDs on 4×4 texel blocks.
- **Real:** Meniscus band width $b/2$ along $\alpha = 0.5$, normal $-\nabla\alpha/|\nabla\alpha|$, curvature $\nabla\cdot\hat{\mathbf{n}}$, and Bretherton film from front speed $u_n = -(\partial_t\alpha)/|\nabla\alpha|$. Render directly from `boilAlpha`.
- **Cost:** S–M (small, ~0.05 ms). **Priority:** Medium. **Plan:** `docs/plan/36-analog-operators.md`.
- **Check:** 4-cell and 20-cell vapour patches show dark meniscus bands tracking $b/2$ along $\alpha = 0.5$ with zero 4×4 hash pattern.

#### RS-17. Clear Film (`wgsl/film.ts`) runs in grid-cell units, evaporates soap and closed-plate solvent at `-0.5 * g`, and clips oil at `0.95`
- **Where:** `src/gpu/wgsl/film.ts:68-75, 178-192, 262-263, 295`. **Status:** `UPDATES 20b-6` — formalizes `38-realism-audit.md:718` and adds soap decay and `0.95` clipping.
- **Fakes:** `F_SIGMA=100, F_K=2000, F_WALL=150, F_KM=30`, `dust(p)` (16×16-cell hash), and `0.4 * lapG` are grid-cell/arbitrary-rate units; `-0.5 * g` evaporates non-volatile soap (`38c`) and closed dishes; `filmSplat` clips `h` at `0.95`.
- **Real:** Scale $\sigma, K, h^3/(3\mu), \Delta\sigma/(2\mu)$, and dust in SI metres/seconds ($\Delta x = \text{PLATE\_METRES}/N_\text{film}$); evaporate only volatile alcohol on an open dish; spread excess above `0.95` conservatively via `F_WALL`.
- **Cost:** S–M (none). **Priority:** Medium. **Plan:** `docs/plan/20-lace-and-holes.md`.
- **Check:** Hole spacing and dewetting speed agree within 15% at $192^2$ vs $384^2$; soap conserves $\sum\Gamma$ within 1% over 20 s; oil poured onto $h = 0.9$ conserves $\sum h$ within 0.5%.

#### RS-18. `soapFilmPlate.ts` retains `SOAP_EVAP = 5 nm/s` alongside Plateau-border drainage and steps buoyancy across the re-dip cliff
- **Where:** `src/gpu/soapFilmPlate.ts:42, 199`; `src/gpu/wgsl/soapFilmPlate.ts:158-173`. **Status:** `UPDATES 32d-2, 32f`.
- **Fakes:** Passes `SOAP_EVAP = 5` nm/s unconditionally after `32f`; during the 2 s re-dip, `soapFilm.encode` runs full buoyancy across the step between fresh 350–750 nm top rows and drained <160 nm bottom rows.
- **Real:** Enclosed films thin via Plateau-border suction (`SOAP_EVAP ≈ 0`); during withdrawal, gravity acts only above the bath meniscus (`v_n = 0` at row `front`).
- **Cost:** S (none). **Priority:** Low–Medium. **Plan:** `docs/plan/32-soap-film.md`.
- **Check:** At `SOAP_EVAP = 0`, Plateau-border suction thins the film to Newton black from the top; no downward velocity spike occurs across row `front` during re-dip.

#### RS-19. `speciesOf` floors viscosity at water (`Math.max(0, lnNu)`); `liquidPhase.ts:stir()` destroys oil/water polarity
- **Where:** `src/lib/liquidProps.ts:94-99`; `src/gpu/fluid/inputs.ts:270`; `src/lib/liquidPhase.ts:258-299`. **Status:** `NEW` / `UPDATES 18d-8`.
- **Fakes:** Floors `lnNu` at `0` (blocking acetone 0.41 cSt, hexane 0.45 cSt, methanol 0.75 cSt); `LiquidPhase.stir()` averages `polarity`/`weight` across oil and water so they stop separating.
- **Real:** Store $\ln(\nu/\nu_{\min})$ with $\nu_{\min} = 2\times 10^{-7}\text{ m}^2/\text{s}$ and shift `hsPrep`'s reference; retire `stir()`/`weight`/`polarity` with `18d-8`.
- **Cost:** S (none). **Priority:** Low–Medium. **Plan:** `docs/plan/18-physics-2.md`.
- **Check:** A poured 0.45 cSt liquid flows faster than water in `hsPrep` by the expected $1/\nu$ ratio.

---

### Ferrofluid and magnets

#### RS-20. Rosensweig lift, onset, and labyrinth repulsion use total `|B|` instead of normal `|B_z|` and omit tangential `B_ρ`
- **Where:** `src/gpu/wgsl/standing.ts:201-206`; `src/gpu/wgsl/spikes.ts:191-194, 216-227`; `src/gpu/wgsl/magnetDisc.ts:164, 190-199`; `src/gpu/wgsl/fluid/labyrinth.ts:78-80`. **Status:** `NEW`.
- **Fakes:** Uses scalar $|\mathbf{B}| = \sqrt{B_\rho^2 + B_z^2}$ everywhere, raising isotropic domes and labyrinth stripes where $B_z = 0$ ($\rho \approx \sqrt{2}z$) and the field is horizontal.
- **Real:** Cowley–Rosensweig oblique dispersion: $\omega^2 = \frac{k}{\rho_1+\rho_2}[\Delta\rho g + \sigma k^2 - \frac{\mu_0(\mu_r-1)^2}{\mu_r+1}k(H_n^2 - (\mathbf{k}\cdot\mathbf{H}_t)^2/k^2)]$. Use $|\sum B_{z,k}|$ from `magnetDiscFieldVec` for `lift`, `spikeAmp`, and labyrinth repulsion (keeping $|\mathbf{B}|$ for bulk Kelvin pull), plus optional directional $k_t^2/|k|$ FFT stress in `filmFft`.
- **Cost:** S for $|B_z|$ (none); M with tangential FFT (small, ~2–3 FFT pairs/substep). **Priority:** High. **Plan:** `docs/plan/09-ferrofluid.md` / `docs/plan/38-realism-audit.md`.
- **Check:** Dome height drops to zero on the $B_z(\rho)=0$ ring even where $|\mathbf{B}|$ exceeds onset; with tangential stress, outer domes elongate radially along $\mathbf{B}_\rho$.

#### RS-21. `ferroDrop.ts` Kelvin `PULL` is 147× weaker than EFH1, clamping breaks volume, and `packVelDrop` pierces the top glass
- **Where:** `src/gpu/ferroDrop.ts:39-44, 121`; `src/gpu/wgsl/ferroDrop.ts:161, 189-191`. **Status:** `UPDATES 29a-1..4, 38r-17` — corrects `ferroDrop.ts:40-41` and `38-realism-audit.md:711-712` calling `PULL = 0.505` full share, and adds volume-loss/glass-piercing bugs.
- **Fakes:** Copies `standing.ts`'s capped `0.505`, whereas EFH1 SI constants ($\mu_0 M_s=44\text{ mT}$, $\chi_0=2.64$, $\Delta\rho=210\text{ kg/m}^3$, $l_c=1.273\text{ mm}$, $H_\beta=4.42\text{ kA/m}$) give $\text{PULL}_\text{phys} = \mu_0 M_s H_\beta/(\Delta\rho g l_c) \approx 74.2$ (**147× larger**). Pointwise `clamp` breaks $\int h\,dA$; `:121` ignores live `sq`; `packVelDrop:190` adds `h + FILM_H0 * max(phase - 1, 0)` up to ~2.7 $l_c$ inside a 1.56 $l_c$ gap.
- **Real:** Compute `PULL` from EFH1 SI constants with demagnetization $N_d$, enforce live $0 \le h \le h_\text{gap}(x,y)$ via volume-conserving $P$, and bound `PACK` by `min(max(h, FILM_H0 * phase), gapLc)`.
- **Cost:** S–M (none). **Priority:** Medium. **Plan:** `docs/plan/29-ferro-drop.md`.
- **Check:** Drop slope in weak linear $\nabla B$ matches $(\chi/2\mu_0\Delta\rho g)\nabla(B_\text{in}^2)$; under presses/domes, $h \le h_\text{gap}(x,y)$ and $\int h\,dA$ conserves to $<0.5\%$.

#### RS-22. Ferrofluid is weightless under Plate Rock and upright Gravity tilt
- **Where:** `src/gpu/wgsl/thinGap.ts:306-358`; `src/gpu/fluid.ts`. **Status:** `NEW`.
- **Fakes:** EFH1 ($\rho = 1210\text{ kg/m}^3$, $\Delta\rho = +210\text{ kg/m}^3$ in water, $+330\text{ kg/m}^3$ in oil) is never bound in `hsBody`, hanging weightless when the plate tilts.
- **Real:** Body force $\mathbf{f}_g = \phi(\rho_\text{ff}-\rho_\text{clear})g\sin\theta\,\hat{\mathbf{d}}_\text{down}$, Darcy slide $\Delta\rho g\sin\theta\,h^2/(12\mu_\text{ff})$ (~1–3 cm/s at $5^\circ$, 2 mm). Add in `phaseForce` or bind `phase` in `hsBody` when `phaseLive`.
- **Cost:** S (none when `!phaseLive`). **Priority:** Medium. **Plan:** `docs/plan/09-ferrofluid.md`.
- **Check:** Tilted ferrofluid with no magnet slides at $\Delta\rho g\sin\theta\,h^2/[12(\mu_\text{ff}+\mu_\text{clear})]$; an uphill magnet stalls it where Kelvin balances gravity.

#### RS-23. Ferrofluid Cahn–Hilliard (`phaseCH`/`phaseCHVolume`) and `phaseRelax` step at fixed per-frame grid-cell rates
- **Where:** `src/gpu/fluid.ts:1337-1340, 1393-1401`; `src/gpu/wgsl/fluid/labyrinth.ts:76, 114, 188, 254`. **Status:** `NEW`.
- **Fakes:** Fixed `CH_SUBSTEPS = 4` (`A.b.x = 0.006 + 0.012*phaseSharp`) and `PHASE_RELAX = 6` per frame in grid units ignore `p.magnetSeconds` and $N$ ($2\times$ faster at 120 Hz, $81\times$ slower on $768^2$ vs $256^2$).
- **Real:** Scale CH mobility by `p.magnetSeconds` with adaptive substeps and couple $-\phi\nabla\mu$ into the Hele-Shaw solve even when `ferroLabyrinth === 0` (`fluid.ts:716`) so rounding goes as $\sigma h^2/(12\mu R^2)$.
- **Cost:** S (none at 60 Hz). **Priority:** Medium. **Plan:** `docs/plan/09-ferrofluid.md`.
- **Check:** An elliptical ferrofluid drop evolved 2.0 real seconds at 30, 60, and 120 Hz matches aspect ratio and interface width within 5%.

#### RS-24. `StandingFilm` lacks upper-glass steric contact pressure and multi-magnet activation ignores vector superposition
- **Where:** `src/gpu/wgsl/standing.ts:130, 356-368, 416-432`; `src/gpu/wgsl/fluid/phaseForces.ts:206`; `src/gpu/fluid.ts:414, 461, 474-482`; `src/gpu/wgsl/fluid/shared.ts:467-471`. **Status:** `UPDATES 38r-17, 38k-3`.
- **Fakes:** `filmPressure` omits top-glass contact pressure so domes pierce the glass across 8 substeps before `phaseRelax` clips to static `FILM_TOP` (`2 mm`), ignoring `sq`; `spikesOnAxis`/`fieldOnAxis`/`spikesClose` test magnets singly (two adjacent $0.65\times$ onset magnets never wake `StandingFilm`), and `:480-481` forces extra magnets to copy the primary's height/strength/radius.
- **Real:** Add upper-wall disjoining pressure $+\Pi_\text{top}(h_\text{gap}(x,y) - h)$ in `filmPressure`, and gate activation/`spikesClose` on $\max_x|\sum_k B_{z,k}(x)|$ with per-magnet properties.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/09-ferrofluid.md`.
- **Check:** Pressing to 0.8 mm flattens crests at $h \le h_\text{gap}(x,y)$ conserving volume; two adjacent $0.65\times$ onset magnets wake `StandingFilm` in their overlap.

---

### Optics and light

#### RS-25. `vel0.w` channel collision turns the whole plate into milk on every ferrofluid closeup (and lets milk trigger `dropSolved`)
- **Where:** `src/gpu/wgsl/ferroDrop.ts:191, 267`; `src/gpu/wgsl/pack.ts:176`; `src/gpu/plate.ts:456-488`; `src/gpu/wgsl/plate.ts:2559-2565`; `src/bottles.ts:89`. **Status:** `NEW`.
- **Fakes:** `packVel` packs milk scattering `sp.b` (`scatter: 2`) into `layers[0].vel.w`. When `FerroDrop` runs, `plate.ts:456-482` substitutes `packVelDrop`, writing `2.0` across the whole plate into `dst.w` as `dropSolved`. `plate.ts:2559-2565` feeds `vel0.a` into `milkTransmission`/`milkDiffuseReflectance`, turning a black ground 92.3% white and a lamp ground 80–89% brown on every ferrofluid closeup; pouring milk before `FerroDrop` trips `dropSolved = 1` over flat `z = 0`.
- **Real:** Pass `dropSolved` as a scalar uniform in `PLATE_FIELDS` and bind `species` in `packVelDrop` so `dst.w` always holds `max(0, sp.b)`.
- **Cost:** S (none). **Priority:** High. **Plan:** `docs/plan/29-ferro-drop.md`.
- **Check:** Milk-free ferrofluid closeup clear ground reads within 1 level at `macroRelief = 0.7` vs `0` on black and lamp grounds; milk without `FerroDrop` leaves `dropSolved = 0`.

#### RS-26. `calcOpl` multiplies gap height by `(1 - 0.5 * v.z)`, driving clear-film OPL below vacuum (`0.71`) and inverting Becke lines
- **Where:** `src/gpu/wgsl/plate.ts:1310-1318`. **Status:** `NEW`.
- **Fakes:** `v.z` is clear oil film's gap fraction, yet `:1317` sets `h = hScale * (1 - 0.5 * v.z)` while adding `v.z * 0.087` to `n`: at `v.z = 1`, `OPL = 0.71` (< vacuum `1.0`), inverting `∇²OPL` and inflating it ~7× (`-0.62` vs `+0.087`) in `defocusShadow`.
- **Real:** Stratified film+water at spacing $h$ has $\text{OPL} = h[(1 - v_z)n_\text{water} + v_z n_\text{film}] = h(N_\text{clear} + v_z\Delta n_\text{film})$. Remove `(1.0 - 0.5 * v.z)`.
- **Cost:** S (none). **Priority:** Medium–High. **Plan:** `docs/plan/18-physics-2.md`.
- **Check:** In `derive`, clear film (`v.z = 0.5`) yields `OPL = hScale * (1.333 + 0.087 * 0.5)` within 0.1% with the same Becke polarity as oil.

#### RS-27. Standing ferrofluid domes paint a 9-spoke `cos(9·ang)` star, an angle-independent crest dot, and a +60% outer halo
- **Where:** `src/gpu/wgsl/plate.ts:2701-2736, 2779, 2853`. **Status:** `UPDATES 38j, 38h-6`.
- **Fakes:** Multiplies reflection by `0.5 + 0.5 * cos(ang * 9 + rise * 3)` (`:2711`), paints a white dot on horizontal caps (`:2736`) despite a $45^\circ$ key, uses `pow(1 - Ns.z, 2)` + Blinn-Phong `pow(face, 70) * 1.2`, and boosts transmitted light outside edges by `1 + 0.6 * lens * amt` (`:2853`) even at focus.
- **Real:** Exact Fresnel + Snell + TIR on water–ferrofluid ($n = 1.333 \to 1.52$, $R_0 \approx 0.43\%$) — already in `ferroDropSeen` (`wgsl/ferroDrop.ts:274-375`) inside `plate.ts`. Reuse it on $h = H_0\cdot\text{phase}$; let outer rims come from `defocusShadow`.
- **Cost:** S (none, reduces ALU). **Priority:** Medium–High. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/09-ferrofluid.md`.
- **Check:** At focus on a backlit plate, no outer-edge pixel exceeds bare lamp; an axisymmetric dome's 9th azimuthal harmonic is $<1\%$ of mean; crest highlight follows key direction.

#### RS-28. `glint.ts` shortcuts: non-conserved spikes (+31% energy), constant `WALL_FRESNEL`, missing air–glass Fresnel, fixed 2 mm gap, hardcoded `2.4` dye path
- **Where:** `src/gpu/wgsl/glint.ts:76, 110, 231, 259-260, 277, 294, 326, 376, 382`; `src/lib/glint.ts:95, 114, 131`. **Status:** `NEW` / `UPDATES 38r-17`.
- **Fakes:** (1) Disc puts 100% of `energy` and 3 spike quads *add* $(\pi/2)\,\text{SPIKE\_SHARE}\,E \approx +31.4\%$ extra energy. (2) Constant `WALL_FRESNEL = 0.03` ignores angle $\cos\theta_i = n_z$. (3) Side-lamp `irr` (`:376`) omits air–glass Fresnel transmission `1 - fresnelR(cosIn, 1.0, 1.52)` (17–33% reflection at $70^\circ$–$78^\circ$). (4) Hardcoded `GAP_METRES = 0.002` and `WATER_VISCOSITY` ignore live `coverMetres` and carrier/species viscosity. (5) Hardcoded `2.4*(1-z)` path ignores slant $(1-z)(1+1/l_z)$, reads graded `scene`, and skips absorption on black ground.
- **Real:** Partition energy ($E_\text{disc} = E(1 - f_\text{spike}\cdot\text{focusW})$); apply `fresnelR` on walls and air–glass entry; pass live `coverMetres` and viscosity; compute slant path on ungraded dye transmittance.
- **Cost:** S (none). **Priority:** Medium–High. **Plan:** `docs/plan/47-macro-photography.md` / `docs/plan/38-realism-audit.md`.
- **Check:** Extend `npm run glint`: glint linear energy (disc + spikes) stays constant within 2% from f/1.4 to f/22; side falloff matches $\cos\theta_\text{in}(1-R_\text{glass})/d^2$; wall glint tracks `fresnelR`; defocus doubles with `coverMetres`.

#### RS-29. `soapFilmOver` blocks 50–100% of the plate behind the soap film via sRGB luminance of 4×-gained reflection
- **Where:** `src/gpu/wgsl/plateThinFilm.ts:172, 214-217`. **Status:** `NEW`.
- **Fakes:** Multiplies linear $R(\lambda) \in [0, 0.078]$ by `SOAP_GAIN = 4`, sRGB-encodes it, takes sRGB luminance (`reflected`), and dims background by `(1 - reflected)` — turning 6% reflection into 53–100% blocking instead of $\le 8\%$.
- **Real:** Airy conservation gives $T(\lambda) = 1 - R(\lambda) \in [0.92, 1.00]$. Composite in linear light with un-gained `R_lin`: `I_lin = c_lin * (1 - R_lin) + R_lin * SOAP_GAIN`, then sRGB-encode once.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/32-soap-film.md`.
- **Check:** Behind a 100 nm silver-order film ($R \approx 0.078$), a bright plate retains $\ge 92\%$ of linear radiance.

#### RS-30. `milkDiffuseReflectance` hardcodes the pre-38r 6 mm rest gap (`6.0 * gap`), 3× too optically thick
- **Where:** `src/gpu/wgsl/plate.ts:197-208, 3059, 3063`. **Status:** `UPDATES 38i, 38r-17` — flags `6.0 * gap` and Layer 1 reading Layer 0's `layerGap0`.
- **Fakes:** Uses old 6 mm depth (`sd = sc * 6 * gap`), giving `sc = 2` mm⁻¹ at 2 mm $R_\text{KM} = 0.923$ instead of $0.80$, unresponsive to `coverMetres`.
- **Real:** Kubelka–Munk $Sd = \mu_s' d$ with $d = \text{coverMetres}\cdot 1000\cdot\text{gap}$, per layer (`38h-12`).
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** At 2 mm rest gap and `sc = 2`, `milkDiffuseReflectance` reads $0.80 \pm 0.01$ and scales with `coverMetres`.

#### RS-31. `tankDraw.ts` invents a quadratic white core (`+ 0.35 e²`) in display space with no sRGB transfer or excitation attenuation
- **Where:** `src/gpu/tankDraw.ts:57-59`. **Status:** `NEW`.
- **Fakes:** `lit = D.colour * e + vec3f(0.35 * e * e)` adds white even at dim `D.glow`, writes linear fluorescence to display space without sRGB transfer, and omits Beer–Lambert UV excitation attenuation across the tank.
- **Real:** Linear fluorescence $L_\text{emit} = D_\text{glow}\,D_\text{lin}\,I_\text{uv}(1 - e^{-\varepsilon c\Delta z})$ (optional 4–8 tap Beer–Lambert UV march `47c`), highlight roll-off desaturating *only* above linear `1.0`, and `toDisplay`.
- **Cost:** S (or M with UV march; none / small). **Priority:** Medium. **Plan:** `docs/plan/47-macro-photography.md`.
- **Check:** At `D.glow = 0.3`, dense dye (`d = 1`) keeps `D.colour` chromaticity; desaturation starts only past linear 1.0; with UV march, far side dims by Beer–Lambert.

#### RS-32. `lumiaLight` is pure `fbm3` noise drifting on `U.time`, not refractive glass caustics
- **Where:** `src/gpu/wgsl/plate.ts:1986-1995`. **Status:** `NEW` (missing from `38u-9`).
- **Fakes:** Scrolls three `fbm3` noise layers on `U.time` through `pow(abs(sin(h * 9.42 + lt)), 3)`.
- **Real:** Rotating cast glass $H(R(\theta)\mathbf{x})$ at throw $z$ forms caustics $I = I_0 / |\det(\mathbf{I} + z(n-1)\nabla\nabla H)|$ regularized by lamp size (`47j`), driven by disc rotation.
- **Cost:** M (small, <0.1 ms when Lumia > 0). **Priority:** Low–Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** At fixed disc angle $\theta$, integrated lumia light conserves within 5% as $z$ varies, with bright sheets on $\det(\mathbf{I} + z(n-1)\nabla\nabla H) = 0$.

#### RS-33. `thinFilmOver` invents light (`× 1.8` + `0.08`) even at `filmPhysics = 1`; oil drops and `microDrops` add `+30%` camera core boost
- **Where:** `src/gpu/wgsl/plateThinFilm.ts:128-137`; `src/gpu/wgsl/plate.ts:3384-3385`; `src/gpu/wgsl/plateTransmit.ts:123`. **Status:** `UPDATES 38m, 38h-8, 38u-9`.
- **Fakes:** Even at `filmPhysics = 1`, `thinFilmOver` multiplies `c` up to `1.8×` and adds `+ filmC * 0.08` from `film * 16 + fbm3` (drifting on `U.time` at 0). `plate.ts:3384` and `plateTransmit.ts:123` multiply bead centres by `1 + 0.3*(1-r)²`, violating étendue conservation over a uniform diffuse pad.
- **Real:** Passive backlit `c * filmTableAt(d_nm / FILM_NM_PER_T, true) ≤ c` from a real thickness field; passive water–oil–water $T_1 T_2 \le 1$ with no `+30%` boost.
- **Cost:** S (none). **Priority:** Low–Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** `npm run nolight` at `thinFilm = 1, filmPhysics = 1`: $\le 1$ level over bare plate, 0% motion when still; bead/satellite centres over a uniform pad never exceed clear-water luminance.

#### RS-34. `plateMoire.ts` bends the lower sheet by dye-density gradient × `Glossiness` instead of physical `∇OPL`
- **Where:** `src/gpu/wgsl/plateMoire.ts:51, 235-237`. **Status:** `UPDATES 45a-4`.
- **Fakes:** Uses `normal0` (aqueous dye gradient × `Glossiness`) with hardcoded `MOIRE_N = 1.40`, though dye barely moves $n$ ($<10^{-3}$).
- **Real:** Moiré deflectometry deflects by $\Delta\mathbf{x} = -(D/n_0)\nabla\text{OPL}$ from oil/glycerine/gap/air steps via `derived0`'s physical $\nabla\text{OPL}$ (after `18e-2`) without `Glossiness`.
- **Cost:** S (after `18e-2`; none). **Priority:** Low–Medium. **Plan:** `docs/plan/45-moire-pack.md`.
- **Check:** Two aqueous dyes at uniform gap/index shift fringes $<0.5\%$ of a pitch; an oil/glycerine step ($\Delta n \approx 0.14$) shifts fringes proportionally to $D\cdot\Delta n$.

#### RS-35. `STOCK_PASS_WGSL` runs H&D curve and grain in sRGB; `ferroDropSeen` sums linear reflections into sRGB with a Snell's-window jump
- **Where:** `src/gpu/wgsl/post.ts:234-240, 261-284`; `src/gpu/wgsl/ferroDrop.ts:363-374`; `src/gpu/wgsl/plate.ts:2755`. **Status:** `NEW` / `UPDATES 29a-6, 38p`.
- **Fakes:** `STOCK_PASS_WGSL` applies lift/gain/toe/shoulder/gamma and `4*grey*(1-grey)` grain in sRGB. `ferroDropSeen` hard-switches `studio` to `plateSeen` at `sinw * 1.333 == 1` without top-glass Fresnel blending and adds linear `seen` straight to sRGB `edgeLit` (crushing dim reflections ~13×).
- **Real:** Hurter–Driffield $D_c(\log_{10} E)$ + Selwyn grain $\sigma_D \propto \sqrt{D}$ in linear/density space; continuous Fresnel blend $(1-R_\text{top})\cdot\text{studio} + R_\text{top}\cdot\text{plateSeen}$ summed in linear light before `toDisplay`.
- **Cost:** S (none). **Priority:** Low–Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/29-ferro-drop.md`.
- **Check:** In `STOCK_PASS_WGSL`, a linear exposure wedge gives equal $\Delta D = \gamma\log_{10}2$ steps within 5%; in `ferroDropSeen`, slopes $20^\circ$–$28^\circ$ show no jump $>3$ levels.

---

### Tools and interactions

#### RS-36. Local Press injects an artificial "Photoscope twist" vortex (absent on remote Press)
- **Where:** `src/components/LiquidVisualizer.tsx:3301-3317` vs `1218-1228`. **Status:** `NEW`.
- **Fakes:** Local Press runs a $90\times 90$ loop injecting a counter-clockwise vortex `w = (1 - dd/twistR)² * 40 * pa * kSoft` into `u0` (peaking at $r \to 0$, opposite to rigid-plate Couette shear $v_\theta = \frac{1}{2}\omega r$, heavily damped by $12\nu\Delta t/h^2$, omitted on remote Press).
- **Real:** Vertical press has zero torque and closes the gap via $-\partial h/\partial t$ in `hsDivergence`; cover twisting belongs to an explicit twist gesture (`42b`) setting $\mathbf{u}_\text{cover} = \frac{1}{2}(\boldsymbol{\omega}\times\mathbf{r})$ in `hsPrep`. Delete lines 3301–3317.
- **Cost:** S (none, saves ~0.1 ms CPU). **Priority:** High. **Plan:** `docs/plan/15-tools-on-liquids.md` / `docs/plan/42-liquid-light-lab.md`.
- **Check:** Holding Press on radial dye spokes gives zero angular twist on mouse and `performGesture`, matching within 5%.

#### RS-37. `beads.disturb`, `bubbles.disturb`, and `popBubble` bypass flow, pop bubbles under Finger, and add parity swirl
- **Where:** `src/lib/beads.ts:408-418`; `src/lib/bubbles.ts:468-492, 581-582, 664-668`; `src/sim/fluidSimulation.ts:2283-2302`; `src/sim/speciesPoll.ts:104-117`; `src/components/LiquidVisualizer.tsx:1009-1011, 1160-1163, 1226, 1243, 3255-3258, 3319, 3370, 3606-3608, 3699-3701, 4359`. **Status:** `NEW` (notes open `15g-8g` at `speciesPoll.ts:108`).
- **Fakes:** `beads.disturb` teleports beads radially (even backward behind Finger) on every tool/evolve/`beatSqueeze` step. `bubbles.disturb` shoves bubbles at 40/22 cells/s on a `0.22 s` clock (even upwind of Blow), and `:3256` passes `kind = 'dye'` for Finger so **Finger pops bubbles** (gated by `b.age > 0.3`). Every `'pop'` (including gradual `OPEN_RIM` venting) calls `popBubble`, injecting curl-free inward velocity + parity-hashed `±BLOW_SWIRL` even though `WebGPUAir` already drives irrotational collapse via $\partial a/\partial t$.
- **Real:** Advect drops and bubbles at Taylor–Saffman speed $\frac{2}{1+\lambda}\mathbf{U}$; venting/collapsing air is irrotational ($\nabla\times\mathbf{u}=0$). Remove `beads.disturb`, `bubbles.disturb`'s shove, and thin-gap `popBubble` swirl; keep engulfing pops only for falling drops.
- **Cost:** S (none). **Priority:** High. **Plan:** `docs/plan/15-tools-on-liquids.md`.
- **Check:** Finger moves beads/bubbles along its wake (never backward, never popping); Blow moves bubbles downwind only; `OPEN_RIM` venting leaves zero net circulation.

#### RS-38. Default-on Lissajous `ambientSeed`, `thinPatch` bleaching, erasing `blowAir`, and 5 s `Emergency seeding` invent/destroy dye
- **Where:** `src/components/LiquidVisualizer.tsx:839, 986-1012, 3610-3614, 3659-3671, 3913-3935, 4569-4572`; `src/sim/fluidSimulation.ts:888-903, 2226-2273`. **Status:** `NEW`.
- **Fakes:** `ambientSeedRef = useRef(true)` runs **by default on every look**, stamping `0.05` dye + `0.02` heat every step along three Lissajous orbits with zero volume. Evolve calls `thinPatch` (bleaching discs via `mul`) and `blowAir(..., true)` (multiplying dye by `0.8`/step, adding parity swirl, spawning bubbles at `:3613`); `floodPour` calls `blowAir`; `Emergency seeding` (`:4569-4572`) stamps `5.0` dye at centre every 5 s.
- **Real:** Dye enters only with conserved volume (`g.pour`, `18c`) and leaves only via advection across `OPEN_RIM`. Disable/retire `ambientSeed`, replace `thinPatch` with clear-carrier pours, route Evolve gusts through `layBreath` (`15g`) with zero bubble spawns, replace `floodPour` with a volume pour, and drop the 5 s stamp.
- **Cost:** S–M (none). **Priority:** High. **Plan:** `docs/plan/18-physics-2.md` / `docs/plan/38-realism-audit.md`.
- **Check:** Calm plate (without calling `ambientSeed(false)`) holds dye mass within 0.1% over 10 s; Evolve gusts conserve dye mass to 0.1% and spawn zero bubbles.

#### RS-39. Mouse Dropper at Drop Height 0 bypasses `18c-2` volume drops; Spray/Splatter/Pour/Streak/`triggerTheme` lack volume
- **Where:** `src/components/LiquidVisualizer.tsx:1202-1277, 1915-1977, 3372-3502`; `src/sim/fluidSimulation.ts:2569-2648, 3685-3700`. **Status:** `UPDATES 18c-3b` — shows default mouse Dropper bypasses `18c-2` at `dropHeight = 0` (diverging from remote `'drop'`).
- **Fakes:** Local Dropper (`:3464-3502`) calls `autoInject('drop')` only when `dropHeight > 0.02`; at default `0` it stamps dye via `addDensity` with zero volume (while remote `'drop'` at `:1198, 1280` always calls `autoInject('drop')`). Spray, Splatter, Pour, Streak, and `triggerTheme` stamp dye without volume, inject curl-free/damped `u0` velocities, and only call `layBottle` on `p === 0`.
- **Real:** Every liquid tool adds volume via $\nabla\cdot(h\mathbf{u}) = q(x,y)$ (`g.pour`/`queueDrop`), displacing dye into a collar; Streak is a moving Brinkman tip (`layFinger`) emitting volume. Route Dropper at `dropHeight <= 0.02` through `layDrop`, unify local/remote tools, and strip curl-free `addVelocity`/`applyRadialImpulse`.
- **Cost:** M (none). **Priority:** High. **Plan:** `docs/plan/18-physics-2.md`.
- **Check:** Clicking mouse Dropper at `dropHeight = 0` on dyed liquid opens a bright window with a displaced collar matching remote `'drop'` and conserving pre-existing dye mass.

#### RS-40. Held Blow (straw and pre-move press) still runs legacy `blowPhase` outward ferrofluid carry on a thin gap
- **Where:** `src/components/LiquidVisualizer.tsx:3334-3335`; `src/sim/fluidSimulation.ts:2554-2560`; `src/lib/blowAim.ts:93`. **Status:** `UPDATES 15g-2`.
- **Fakes:** `blowPhase` skips `carryPhase` on thin gap only when `hypot(dx, dy) > 1e-4`; during pre-move holds (150 ms) and `blowHeld` straw blowing, `dx = dy = 0`, so `carryPhase(..., outward: true)` teleports ferrofluid into a ring while the straw's air mask already displaces liquid.
- **Real:** Straw displaces via air-pocket volume exclusion (`15g-8d`/`8e`); undirected puffs via stagnation dimples (`15g-2`). Gate `blowPhase` off during `blowHeld` and pre-move holds.
- **Cost:** S (none, saves 1 dispatch/step). **Priority:** Medium. **Plan:** `docs/plan/15-tools-on-liquids.md`.
- **Check:** Holding Blow still on ferrofluid for 0.1 s teleports zero ferrofluid; holding into straw moves ferrofluid strictly with air displacement conserving volume.

#### RS-41. Velocity-delta tools (`RoomStir`, `videoFlow`, `inkTitleWash`) inject `dt`-unscaled or scripted Taylor–Green velocity into `u0`
- **Where:** `src/lib/roomStir.ts:49-51, 97-131`; `src/lib/videoFlow.ts:67-84`; `src/gpu/wgsl/splat.ts:237-251`; `src/lib/inkTitle.ts:291, 305-345`; `src/lib/inkTitleRun.ts:144-166`; `src/components/LiquidVisualizer.tsx:3175-3176`. **Status:** `NEW`.
- **Fakes:** `RoomStir.apply` adds `clamp(fx * strength * 0.9, ±0.25)` into `u0` with no `dt` scaling (2× stronger at 120 Hz); `videoFlow` injects divergent, `dt`-unscaled normal optical flow plus zero-volume `VIDEO_DYE = 0.15`; `inkTitleWash` (`logoMelt`, `37x-11`) injects a scripted Taylor–Green vortex lattice into `u0`, where thin-gap drag damps it and projection strips divergence.
- **Real:** External forcing enters as `dt`-scaled surface shear $\boldsymbol{\tau}/h$ in `hsBody` (like `breath`), Brinkman solids, or volume pours. Route `RoomStir`/`videoFlow` through `dt`-scaled `hsBody` shear; drive `logoMelt` solely via `inkTitleRinse` volume pours + tilt or Brinkman paddle.
- **Cost:** M (S each; none). **Priority:** Medium. **Plan:** `docs/plan/15-tools-on-liquids.md` / `docs/plan/38-realism-audit.md`.
- **Check:** `RoomStir` gives equal 1 s displacement at 30, 60, and 120 Hz ($\pm 5\%$); `logoMelt` melts using only `inkTitleRinse` pours and physical tilt/paddle.

#### RS-42. `BassPress` and rigid-glass `KickRelease` prescribe gap trajectories without Stefan squeeze/suction balance
- **Where:** `src/lib/squish.ts:535-582, 705-736`; `src/sim/fluidSimulation.ts:2174-2197`. **Status:** `UPDATES 38l-5`.
- **Fakes:** `BassPress` applies `want - depth` instantaneously with zero viscous resistance; rigid-glass `KickRelease` rebounds along `0.5*(1 - cos(π p))` over a fixed `1/3 s`, ignoring $\mu$ and Stefan suction.
- **Real:** Normal force $F(t)$ balanced by Stefan squeeze/suction: $dh/dt = -\frac{2h^3}{3\pi\mu R^4}(F(t) - K(h_0 - h))$, sharing `38l-5` and `38l-1`.
- **Cost:** S–M (folds into `38l-5`; none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Under the same bass step impulse, glycerine (`gapThickness = 1`) deflects and rebounds slower than water (`0`) in proportion to $1/\mu$.

---

### Sound into the plate

#### RS-43. Legacy `audioMappings` injects dye, heat, velocity kicks, kick droplets, mid streams, 50%-white sparks, and hue cycling on 33/34 presets
- **Where:** `src/components/LiquidVisualizer.tsx:3940-4230, 4274-4278`; `src/lib/kickBloom.ts:35-58`; `src/lib/squish.ts:652-690`. **Status:** `NEW`.
- **Fakes:** Active on 33/34 house presets (`audioImpact: 0.6`, `kickBloom: 1`), six uncorded injectors run even with zero patch cords: centre `autoInject`+`addTemp`; uncorded `BassPress`/radial burst; `throwKickBloom` stamping 5–11 droplets + outward/swirl velocity + `doseLiquid`; `noise2D` mid stream; random treble `addTemp` + 3×3 `addDensity` mixed 50% with white (`sparkCol*0.5 + 0.5`, `:4203-4204`) bypassing `pourDt`; `noise2D` energy swell; uncorded synesthesia hue cycling.
- **Real:** Sound drives only explicit cords onto physical actuators (`AreaHands` `areaPour` in mL/s, `areaHeat` in W/m², `areaStir` Brinkman paddle, `areaHue` bottle pick, glass-press force). Migrate presets to explicit `sceneMappings`/`AreaHands` cords and retire `audioMappings`/`kickBloom`/`audioImpact`.
- **Cost:** L (none). **Priority:** High. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/28-preset-palettes-2.md`.
- **Check:** With `sceneMappings: []` (or `soundImpact = 0`), playing the test band adds zero density, heat, velocity, or doses across all looks; migrated cords pass `soundpatch`/`breakdown`.

#### RS-44. Direct audio bypasses cords to pulse `ferroLabyrinth`, `magnetStrength`, and Lissajous `magnetWalk` speed
- **Where:** `src/components/LiquidVisualizer.tsx:2374-2376, 2385-2394, 2448-2462`. **Status:** `NEW` (ferrofluid skipped in `38u`).
- **Fakes:** `magnetFor()` scales `ferroLabyrinth` by `(0.55 + 0.35*energy + 0.45*k.env)`, speeds Lissajous `magnetWalk` by `(0.35 + 1.1*energy)`, and in `walks` scales permanent-magnet `magnetStrength` by `(0.4 + 0.4*energy + 0.8*env)` ignoring cords/`soundImpact`/`audioImpact`. `mazeKickRef.current.env` updates only when `lab > 0.001` (`:2387`), so on `lab === 0` looks (`magnet-garden`), audio silently cuts `magnetStrength` to `0.4×` in quiet bars.
- **Real:** Permanent N52 remanence ($B_r = 1.45\text{ T}$) is constant; a music-reactive electromagnet obeys an RL circuit $L\dot{I} + RI = V_\text{audio}(t)$ ($\tau = L/R \sim 10\text{–}100\text{ ms}$, $B \propto I$), or a motor moves $z(t)$. Strip hardcoded audio multipliers and route via preset cords with RL slew.
- **Cost:** S (none). **Priority:** High. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/09-ferrofluid.md`.
- **Check:** On `magnet-garden` and `ferro-paint` with `sceneMappings: []` (or `soundImpact = 0`), loud audio produces identical `lastMagnetRef` (`x, y, strength, field`) to silence; with a kick cord, coil field slews with RL $\tau$ whether walking or still.

#### RS-45. `platePressure` cords (8 shipped presets) and `Phrasing` audio energy still modulate solver `dt`
- **Where:** `src/sim/fluidSimulation.ts:2674-2678, 2732-2733`; `src/components/LiquidVisualizer.tsx:2627-2630, 2684-2690`; `src/lib/phrasing.ts:119`; `src/lib/tempoPace.ts:39`; `src/presets.ts:461, 882, 1732, 1862, 1935, 2108, 2351`; `src/presetsFoam.ts:86`. **Status:** `UPDATES 38u-6`.
- **Fakes:** `dynamicSpeed` adds `platePressure * 0.02 + airVelocity * 0.01 + automateRate * 0.01`, so 8 shipped `platePressure`-corded presets jump `dt` 5–12% on every kick/bass, and `Phrasing` feeds audio `energy` into `clockLean` — corrupting every SI rate on every beat.
- **Real:** $\Delta t = \Delta t_\text{real}\cdot\text{Speed}$. Remove `platePressure`/`airVelocity`/`automateRate` from `dynamicSpeed`/`lookSpeed` alongside `38u-6`; pressing acts strictly through $\partial_t h$.
- **Cost:** S (fold into `38u-6`; none). **Priority:** High. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Stepping all 8 `platePressure`-corded looks with kicks vs silence keeps `fluid.dt` constant to $10^{-9}\text{ s}$.

#### RS-46. Direct audio drops soap (`surfactantFlow`) on kicks and randomly seeds Gray–Scott chemistry on bass (plus per-frame RNG)
- **Where:** `src/components/LiquidVisualizer.tsx:2614-2623, 3025-3030`; `src/gpu/wgsl/fluid/reactions.ts:142-162`. **Status:** `NEW`.
- **Fakes:** On kicks, `surfactantFlow > 0.001` coin-flips (`0.25 + 0.7*soapDial`) and drops `{ soap: 1 }` at random coordinates; `chemistry > 0` calls `seedChemistry` on raw `bass01 > 0.5` (`DICE.chem < 0.12`) and per-frame RNG (`< 0.004`, 2× faster at 120 Hz), ignoring cords/`soundImpact`/`audioImpact`.
- **Real:** Surfactant and Turing reagents enter only from dish setup or discrete pipette drops via `areaPour` reagent cords or hands.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/26-turing-print.md`.
- **Check:** With `sceneMappings: []` and `soundImpact = 0`, soap total and Gray–Scott seed count over 60 s match silence under loud bass/kicks at 60 and 120 Hz.

#### RS-47. `useMusicIntelligence` overrides `turbulenceScale`/`saturationBoost`/`audioImpact`; `plateRock`, `beatSqueeze`, `audioMappings.rotation`, `Evolve`, and `floodPour` read audio uncorded
- **Where:** `src/hooks/useMusicIntelligence.ts:595-614`; `src/components/LiquidVisualizer.tsx:986-1010, 1593-1594, 3594-3635, 4289-4361, 4595-4610`. **Status:** `NEW` / `UPDATES 38u-13` (adds Evolve's bubble-spawning site `:3613`).
- **Fakes:** On identified tracks, `useMusicIntelligence` adds `+0.2` to `turbulenceScale`, `+0.15` to `saturationBoost`, `+0.2` to `audioImpact` in choruses and scales `turbulenceScale` by `(0.7 + 0.6*energy)` (overriding `audioImpact = 0`). `plateRock` and `beatSqueeze` read kick/bass directly; `audioMappings.rotation` hardcodes `[timbre, complexity, energy, treble]` by `layer % 4`; Evolve scales `blowAir`, bubble spawns (`:3613`), pours, heat, and doses from `evolveLoudRef`; `floodPour` scales from raw `energy`.
- **Real:** Sections and levels act only through visible `sceneMap`/`ScenePlayer` cords onto tilt, press force, motor, or pours — never altering molar absorptivity or spawning air without a straw/drop.
- **Cost:** S–M (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/17-hear-ahead.md`.
- **Check:** In `chorus` with `audioImpact = 0`, `useMusicIntelligence` overrides none of `saturationBoost`/`turbulenceScale`/`audioImpact`; with `sceneMappings: []`, Evolve spawns zero bubbles and `plateRock`/`beatSqueeze` stay still.

#### RS-48. Direct audio shader uniforms (`beatPhase`/`beatSway` pulsing kaleidoscope + unread `pitchClass`/`brightness`) and `MacroCamera` tremor/zoom
- **Where:** `src/components/LiquidVisualizer.tsx:4879-4905, 5180-5188`; `src/gpu/plateUniforms.ts:448-456`; `src/gpu/wgsl/plateFields.ts:72-75`; `src/gpu/wgsl/plate.ts:2269-2273`; `src/lib/macroCamera.ts:313-485`. **Status:** `NEW`.
- **Fakes:** Uploads 4 audio uniforms every frame (`pitchClass`/`brightness` unread; `beatPhase`/`beatSway` rubber-zoom and oscillate kaleidoscope wedges on `sin(beatPhase * π)`). `MacroCamera` accelerates holds/cuts via `macroSync` at `frameSway = 0`, and adds sinusoidal treble `tremorX/Y`, kick zoom punch, and energy `push` (even at `macroSync = 0`, `:407`) when `frameSway > 0`.
- **Real:** Rigid mirror kaleidoscope turned by motor (`kaleidoSpin` cord only); fixed-focal-length macro lens with no treble tremor. Strip the 4 uniforms and remove `tremor`/`push`/`punch`.
- **Cost:** S (none). **Priority:** Low. **Plan:** `docs/plan/38-realism-audit.md`.
- **Check:** Zero audio fields in `PLATE_FIELDS`; kaleidoscope zoom stays constant across beats at `frameSway = 1`; treble 1 vs 0 adds 0 px tremor in `MacroCamera`.

---

### Looks and presets

#### RS-49. Built-in presets wire audio cords onto unphysical constants, numerical hacks, dead targets, and drawn noise
- **Where:** `src/presets.ts` (`vorticityConfinement`: L91, 140, 155, 203, 263, 462, 524, 691, 883, 977, 1480, 1539, 1662, 1733, 1936, 2109; `platePressure`: L461, 882, 1732, 1862, 1935, 2108, 2351; `beads`: L201, 264, 690, 825, 884, 1330, 1479; `oilTension`: L92, 692, 1118, 1540, 1864, 1937; `buoyancy`: L202, 460, 574, 1793, 2267; `lacing`/`cells`: L824, 1116, 1117, 1259; `phaseSharp`/`mazeDetail`/`turingDrift`: L976, 978, 1731, 2013, 2015; dead `fingering`: L1258, 1538, 1863, 2014, 2352); `src/presetsFoam.ts:86-87`; `src/lib/sceneMap.ts:77-94`. **Status:** `NEW`.
- **Fakes:** Across 34 house presets, shipped cords drive: `vorticityConfinement` on **16 presets** (plus static `0.5` on `galaxy`); `platePressure` on **8** (jumping `dt`, RS-45, with `beatSqueeze: 0`); `beads` on **7** (popping drops every 30 frames); $\sigma$ (`oilTension`) on **6** (3 with no oil); $g\beta$ (`buoyancy`) on **5** (4 flat); dead `fingering` on **5** (`beatSqueeze: 0`); drawn `lacing`/`cells` on **3**; and dead `tonalHigh → mazeDetail` (zero ferrofluid) + `bass → turingDrift` on `turing-print`.
- **Real:** Cords drive physical actuators (`areaPour`, `areaStir`, `areaHeat`, `areaHue`, glass press, tilt/motor, lamp/gel/moiré, electromagnet current), never material constants or inviscid confinement.
- **Cost:** M (none, saves `curl`+`confine` passes on 16 looks). **Priority:** High. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/28-preset-palettes.md`.
- **Check:** Static audit in `npm run soundpatch` asserts zero built-in cords target `vorticityConfinement`, `oilTension`, `buoyancy`, `beads`, `lacing`, `cells`, `phaseSharp`, `mazeDetail`, `platePressure`, `turingDrift`, or dead `fingering`, while every look passes `soundpatch`.

#### RS-50. Viscosity mismatch across all 34 presets and turntable spin: 0/34 set `gapThickness`, giving 9 `'thin'` looks two viscosities (1 vs 22.4 cSt)
- **Where:** `src/presets.ts` (9 `'thin'` presets: L173, 240, 299, 496, 560, 672, 863, 1235, 1446); `src/presetsFoam.ts`; `src/sim/fluidSimulation.ts:3346-3347`; `src/components/LiquidVisualizer.tsx:4723, 4815`; `src/gpu/fluid.ts:395`; `src/types.ts:1091-1092, 1132, 1183`. **Status:** `UPDATES 38s, 27f-9l, 38r-17`.
- **Fakes:** All 34 presets set dead `damping` (`fluid.ts:395` ignores it on thin gap) and legacy `viscosity`, while 0/34 set `gapThickness`/`liquidMl`/`coverWeight`. Because `spinTau`/`spinNu` read `carrierViscosity(settings.viscosity)` and Layer 0's `coverUnits`, the 9 `'thin'` looks run 1 cSt water for turntable spin alongside 22.4 cSt oil for Hele-Shaw/bubbles/slosh/cover, and Layer 1 inherits Layer 0's gap and viscosity.
- **Real:** One per-layer $\nu_l = \text{thicknessViscosity}(\text{gapThickness}_l)$ (with species mean per `38r-20`) governs Darcy drag, spin $\tau = h^2/(12\nu)$, cover drag, and bubbles. Wire `spinNu`/`spinTau` to per-layer `gapThickness`/`coverUnits`, set honest `gapThickness` per preset, drop dead `damping`/`viscosity`.
- **Cost:** S (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/22-spin.md`.
- **Check:** On thin gap, `spinNu === thinGapViscosity(gapThickness)` per layer, Layer 1 uses its own `coverUnits`, and `gapThickness` `0 → 1` shortens $\tau$ by $\nu_\text{glyc}/\nu_\text{water}$.

#### RS-51. `thicknessOptics` and `spectralOptics` are off in defaults and 32–33/34 presets; 9 weaken `transmission` and 28/34 boost `saturationBoost`
- **Where:** `src/types.ts:1128-1129, 1200, 1284`; `src/gpu/plateUniforms.ts:255`; `src/gpu/wgsl/plate.ts:174, 294-321, 2346, 3475`; `src/presets.ts` (`thicknessOptics` only L1502, 1558; `spectralOptics` only L1503; `transmission < 1` L617, 750, 996, 1711, 1852, 1925, 2037, 2339; `presetsFoam.ts:76`; `saturationBoost` 1.3–1.6 on 28/34). **Status:** `NEW` / `UPDATES 18l-1, 18l-5, 18l-7`.
- **Fakes:** At `thicknessOptics = 0`, `plate.ts:2346` locks `gapScale = 1.0`, so pressing causes zero Beer–Lambert thinning on 32/34 looks. 6-band `spectralOptics` is off on 33/34; 9 lower `transmission` to `0.3–0.55` (only 2 tracked in `18l-5`/`7`); 28/34 crank sRGB `saturationBoost` to `1.3–1.6`, breaking $T(2d) = T(d)^2$.
- **Real:** Spectral Beer–Lambert through local $h(\mathbf{x})$: `thicknessOptics: 1`, `spectralOptics: 1`, `transmission: 1`, `saturationBoost: 1.0`, tuning dye concentrations instead.
- **Cost:** M (small, ~0.1–0.2 ms for 6-band pass). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/18-physics-3.md`.
- **Check:** Pressing to half gap halves $\ln T$ on every preset; at `saturationBoost = 1.0`, single-dye transmission obeys $T(2d) = T(d)^2$ within 1 level.

#### RS-52. Two-layer presets use Photoshop blend modes with `twoProjectors: 0` on all 41 live looks, and 33/34 use `gooeyEffect` metaballs
- **Where:** `src/presets.ts` (`lighter`: L159, 224, 349, 480, 544, 845; `screen`: L45, 110, 594, 656, 792, 1748; `exclusion`: L283; `overlay`: L710; `gooeyEffect` 0.05–0.78 on 33/34); `src/types.ts:1141`; `src/gpu/wgsl/plate.ts:2303`. **Status:** `UPDATES 18k, 18b-4, 18b-5`.
- **Fakes:** 0 of 41 live looks set `twoProjectors: 1` (including `home-movie` running `lampGround: 1` + `screen`), stacked dishes brighten where dyes overlap, and 33/34 pre-blur dye into smoothstep metaballs (`gooeyEffect`) rather than Cahn–Hilliard oil (`oilBodies: 1`).
- **Real:** One projector + two dishes multiplies transmittances ($T_1 T_2$, `multiply`); two projectors sum linear radiances (`twoProjectors: 1`, `38p`); immiscible edges come from `oilBodies: 1`.
- **Cost:** M (none). **Priority:** Medium. **Plan:** `docs/plan/18-physics-2.md`.
- **Check:** Every two-layer preset sets `blendMode === 'multiply'` or `twoProjectors === 1`; zero presets use `exclusion` or `overlay`.

#### RS-53. `DEFAULT_SETTINGS` ships ~20 unphysical shortcuts on; 32/34 closed presets set `evaporationRate > 0`, 29/34 leave `oilBodies: 0`, and `home-movie` sets `lampWarmth: 3`
- **Where:** `src/types.ts:1070-1075, 1091-1333`; `src/presets.ts` (`evaporationRate` 0.0006–0.025 on 32/34; `oilBodies: 0` on 29/34; `home-movie` `lampWarmth: 3` L1784); `src/gpu/wgsl/plate.ts:3460`. **Status:** `UPDATES 38u, 18g-4, 38a-2`.
- **Fakes:** New looks start with ~20 fakes on (`lampGround: 0`, `filmPhysics: 0`, `thicknessOptics: 0`, `spectralOptics: 0`, `turbulenceScale: 0.5`, `polarity: 0.5`, `glassSmear: 0.3`, `granulation: 0.5`, `evaporationRate: 0.003`, `surge: 0.55`, `tempoSync: 0.5`, `audioImpact: 0.6`, `kickBloom: 1`, `plateRock: 0.45`, `macroSync: 0.5`, non-`'none'` `audioMappings`, `lampMotion: 0.5`, `gooeyEffect: 0.45`, `saturationBoost: 1.45`, `beads: 0.18`, `bubbles: 0.2`); 32/34 closed dishes evaporate dye; 29/34 omit `oilBodies: 1`; `home-movie` pegs vignette at 45% with `lampWarmth: 3`.
- **Real:** Move legacy overrides into presets awaiting retuning and default `DEFAULT_SETTINGS` to a clean glass sandwich (`lampGround: 1`, `thinGap: 1`, `transmission: 1`, `thicknessOptics: 1`, `spectralOptics: 1`, `filmPhysics: 1`, `saturationBoost: 1`, `audioMappings` all `'none'`, all noise/fake/evap/bead/bubble dials `0`).
- **Cost:** M (none). **Priority:** Medium. **Plan:** `docs/plan/38-realism-audit.md` / `docs/plan/28-preset-palettes.md`.
- **Check:** A blank plate from `DEFAULT_SETTINGS` under loud music stays completely still, clear, evenly lit, with zero dye, beads, bubbles, or uncorded flow.

---

## Checked and already physical

Verified honest (or with all shortcuts already tracked in open plan items), so the next pass can skip them:

- **Side-view tank solver** (`lib/tank.ts`, `gpu/tank.ts`, `wgsl/tank.ts`, `tankPlate.ts`): SI 2D Boussinesq MAC Navier–Stokes, minmod dye, multigrid V-cycle, no-slip walls, stress-free surface, real seconds. (`tankDraw.ts` is RS-31.)
- **Thin-gap Ritz warm start & conservative carries** (`wgsl/thinWarm.ts`, `wgsl/fluid/carry.ts`, `shared.ts` `THIN_FACE`, `dye.ts` `heatPack`/`heatUnpack`, `gridFilter.ts`): Galerkin/Ritz warm start, area-conserving `carryArea`, Rhie–Chow harmonic-mobility fluxes, mass-conserving checkerboard filter.
- **Cover glass ledger & Stefan settling** (`lib/cover.ts`, `gpu/fluid/cover.ts`): Analytical separated Stefan settle against Gibbs-pinned meniscus $2\sigma\sin\theta/h$ and conserved volume ledger. (`DENSITY = 1000` is RS-10.)
- **Standalone lamp-boil dish** (`gpu/lampBoil.ts`, `BOIL_DISH_WGSL`): Two-band Beer–Lambert, water+glass heat capacity/conduction, radiation/convection, Kell density, Vogel viscosity, cavity nucleation, liquid-weighted advection. (Plate integration is RS-1, RS-2.)
- **Sealed-bottle circulation, two-layer slosh core & turntable flywheel** (`wgsl/fluid/seal.ts`, `gpu/slosh.ts`, `wgsl/slosh.ts`, `lib/slosh.ts`, `turntable.ts`): Closed-rim streamfunction; HLL Riemann solver with implicit two-layer drag and Coriolis/Euler terms; exponential spin follow. (`addSlosh` is RS-7; legacy `viscosity` is RS-50.)
- **Bubble core & analytic outline** (`lib/bubbles.ts`, `gpu/air.ts`, `wgsl/bubbleShape.ts`): Taylor–Saffman, Bretherton, Darcy climb, Paterson $n=2$, breakup, Stefan–Reynolds drainage, Durian crowding, Henry dissolution, open-rim venting, analytic outline. (`disturb`/`popBubble`, straw `rimAt`, `AIR_BOIL_WGSL` are RS-15, RS-16, RS-37.)
- **Soap film core & Plateau-border / Vrij** (`lib/soapFilm.ts`, `gpu/soapFilm.ts`, `wgsl/soapFilm.ts`): 2D Darcy buoyancy, minmod TVD, Frankel marginal regeneration (`32f`), Vrij $h^5$ nucleation (`32g`), Airy reflectance. (Ruptured pinning/blocking is RS-12; `soapFilmPlate` is RS-18.)
- **Oil Cahn–Hilliard, Brackbill CSF, rim Laplace & SI soap** (`wgsl/fluid/oil.ts` core, `capillary.ts`, `lib/oilLay.ts`, `gpu/fluid/soap.ts`): Conservative `marangoniFlux`/`mixUpdate`/`mixRelax`, Brackbill CSF, `rimLaplace`, deep-quench well (`38f-2`), wax expansion/conduction (`27f-9e/9h`), SI Langmuir soap. (`bodyLand`/`bodyPartition` is RS-14.)
- **Magnetostatics, Cowley–Rosensweig SI onset, Kelvin pull & lubrication** (`wgsl/magnetDisc.ts`, `spikes.ts`, `phaseForces.ts`, `phase.ts`, `labyrinth.ts` `phaseCHVolume`, `standing.ts` core, `lib/magnetSize.ts`, `phasePour.ts`): Derby–Olbert elliptic-integral vector sum, iterative SI onset, curl-preserving Kelvin force, MUSCL-minmod advection, degenerate-mobility CH, 9-point lubrication flux. (Gaps are RS-20..RS-24.)
- **Core optical laws & screen-resolution shapes** (`lib/filmTable.ts`, `lampKelvin.ts`, `phIndicator.ts`, `dye.ts`, `liquidColour.ts`, `wgsl/lampField.ts`, `closeupDepth.ts`, `plateTransmit.ts` `gelFilter`/`defocusShadow`/`edgePass`/`camBubble`, `pack.ts` `packDye`/`packDyeBodies`, `beadShape.ts`, `filmDye.ts`, `plateMoire.ts` tent-integrated gratings, `output.ts` homography & blending).
- **Brinkman hand, wall-jet Blow, EHD rhythm sheet & hand tilt** (`lib/handSolid.ts`, `breath.ts`, `blowAim.ts`, `sheet.ts`, `plateRock.ts`, `handTilt.ts`, `inkTitle.ts` `inkTitlePad`/`inkTitleRinse`, `pressRing.ts` gated off on thin gap).
- **Clean sound analysis, routing & AreaHands** (`lib/areaCords.ts`, `sceneMap.ts` folding math, `hitSource.ts`, `beatClock.ts`, `stepClock.ts`, `governor.ts`, `modulators.ts`, `songShape.ts`, `melodyWalk.ts`, `noteVoices.ts`, `sim/noteVoicesStep.ts`, `plateDrone.ts`, `sceneSense.ts`, `stir.ts`, `useAudioAnalyzer.ts`, `app/musicNow.ts`, `soundNow.ts`, `tempoNow.ts`, `presetsMoire.ts` own cords).
