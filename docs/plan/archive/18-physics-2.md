# Archive: 18. The physics under the look: where the plate imitates a result instead of simulating it (continued)

The closed items of [`docs/plan/18-physics-2.md`](../18-physics-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **18b-6. Light through a film, not the whole gap (for 20b).** *Shipped with 20b
  (#259) for the dye: the front plate's dye path is the gap less the clear film
  (`gapScale *= 1 − film` in the plate, from the packed view).* The path is the dye's
  amount times the gap (Layer Depth). Once a film of clear liquid sits in the gap
  (20b), the water's path is the gap less the film, which is where the reference's
  faint pink and lavender in the white come from. A drop's or bubble's "through"
  colour (the lamp through the clear gap, `through` in the bubbles) is still the old
  tint-towards-white estimate, read off the ring round it (which is on the lamp
  ground now).
- **18b-10. Two projectors.** *Shipped (behind Two Projectors, on in Fillmore; `npm run lamp`).*
  The Two Projectors setting models two projectors aimed at the same screen, each
  filtered by its own plate. Shortcut: each projector's exposure is simply halved
  (exposure normalisation) so clear glass stays at one lamp's level. Outside the back
  plate's disc, the second projector still lights the screen there.

## 18c. A pour adds liquid, not only colour

**18c-1 shipped** (a bottle's pour is volume on a thin gap; `npm run flush`, judging §43; story in
`docs/plan-shipped.md` §18c). **18c-2 shipped and 18c-3 the splash crown's part shipped** (a colour
drop is a pour of its volume and opens a window of its own colour; the splash's ring kick gone,
satellites only past Cossali's K; `npm run dropwindow`; story in `docs/plan-shipped.md` §18c).
Left, each its own PR:

- ~~**18c-2**~~ The colour's own drops as volume. Shipped (see above).

## 18d. Each liquid has its real properties (replaces the property scalars)

**18d-1 shipped** (each poured liquid's own viscosity on a thin gap; `npm run thick`, judging §42; story in
`docs/plan-shipped.md` §18d). The rest of 18d is these items, each its own PR:

- ~~**18d-2**~~ Flushing, not fading: shipped with 18c-1 (`npm run flush`). Nothing fades
  the species; it leaves over the open rim when pours push it there, and the
  automation's headroom for a thick bottle reads the GPU's share (`speciesShare`, once a
  second). The colour still fades (18g), and the CPU's body still fades on the old plate.
- ~~**18d-9**~~ #355 The index into 18e's refraction: the derive pass's optical path reads the species' Σ share·n (`pouredDn`), measured against the shelf's own indices by `npm run derive`. The display's deflection does not read it yet: 18e-2.
- ~~**18d-11c**~~ shipped: `npm run thick` compares the two carries over one step from the
  same plate, not thirty steps that grow a last bit (story in `docs/plan-shipped.md`).

## 18e. Edges come from refraction (replaces the painted rims and highlights)

- ~~**18e-5**~~ #857 No line where two dyes meet: Boundary Contrast's two-dye line (a dark band since 38h-2, the owner's "super thick black lines around things" on Comet River) is off the wall and the photographed look. The closeup's relief still reads the colour step: 18e-7. `npm run holeline`.

## 18g. Colour leaves by flushing, not by fading

**18g-1 shipped** (the open circular rim, $r \ge 0.5$, into the overflow trough; `npm run flush`, story in `docs/plan-shipped.md` §18g; #362). The rest of 18g is these items, each its own PR:

- ~~**18g-1**~~ Flushing, not fading: the open rim (#362). Shipped; story in
  `docs/plan-shipped.md` §18g-1 (moved 2026-10-29, 19m).
- ~~**18g-6**~~ An oil body touching the open rim no longer drains through it by its own surface tension: the rim is held at the oil's Laplace pressure, not the water's zero (CAPILLARY, rimLaplace; `npm run rimhold`, a lens at the rim 9.6% → 97.1% kept over six seconds). Story in `docs/plan-shipped.md` §18g.
- ~~**18g-7**~~ A lens against the rim on the diagonal lost about 0.13% of its oil a second whatever its tension: the mix's Cahn–Hilliard relaxation (mixRelax, mixMu, mixUpdate) and its overfull share read their neighbours past the open rim with no rim condition. They now take zero flux across it (`RIM_SIDE`, `wgsl/fluid/oil.ts`): the tilted lens's oil past the rim 1.71 → 0.03 at 27 s, `npm run oillift`'s rim lens 94.0% → 98.1% before mixRelax's share was added (#641, with 38r part 2). Story in `docs/plan-shipped.md` §38r.
- ~~**18g-9**~~ The lip: across the open rim the oil goes only with an overflow (`lipHolds` in
  `wgsl/fluid/carry.ts`, #650). At 2 mm a lens against the rim leaked its Cahn–Hilliard foot out
  with the water (level, diagonal) and drifted through the rim into the held strip (tilted): rimhold's
  diagonal 0.6% → 0.17% a reading in the probe, oillift's rim lens 98.1% → 100.0%. Story in §38r.
- ~~**18g-12**~~ An overflow takes the body, not the foot (`lipHolds`, #655): the lip let oil over
  wherever p′ > 0, and a level lens at the grid's edge turns water out over the rim beside it, which
  took the profile's foot (rimhold edge 98.5%, 0.9% in its last 3 s on the Mac). Only a cell of the
  body (c ≥ ½) crosses now: edge 100.0%, diagonal 0.01% a reading. Story in §38r.

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

## 18i. Bubbles and beads live by physics, not timers (shipped)

**Partly shipped** (#358): Bretherton lubrication, agitation-driven wander, Saffman–Taylor fingers on the Straw, Reynolds film-drainage merge and the beads' pancake lag (`npm run bubblephysics`). Story in `docs/plan-shipped.md` §18i (moved 2026-10-29, 19m-2). Its two open items closed with 38b (#603): there is no timed mode left to expose, a pocket
between glasses has no clock, and a pocket reaching the open round rim empties through it.

## 18j. Milky liquids scatter (shipped)

Shipped in #353 (2026-10-10): optical scattering packed into `vel.w` from species channel 2
with conserved flux-form advection; Kubelka–Munk diffuse backscattering on black ground
yielding opaque white milk and pastel food dyes (PLAN §4); two-flux forward extinction with
Rayleigh-Gans wavelength … Story in `docs/plan-shipped.md` §18j (moved 2026-10-29, 19m).

## 18c. A pour adds liquid, not only colour

**18c-1 shipped** (a bottle's pour is volume on a thin gap; `npm run flush`, judging §43; story in
`docs/plan-shipped.md` §18c). **18c-2 shipped and 18c-3 the splash crown's part shipped** (a colour
drop is a pour of its volume and opens a window of its own colour; the splash's ring kick gone,
satellites only past Cossali's K; `npm run dropwindow`; story in `docs/plan-shipped.md` §18c).
**18c-9 and 18c-10 shipped** (a drop enters over its capillary time; a hand's drop from any bottle,
and a stream held on the plate, lay their colour with their own volume; story in
`docs/plan-shipped.md` §18c). Left, each its own PR:

- ~~**18c-2**~~ The colour's own drops as volume. Shipped (see above).
- ~~**18c-9**~~ The drop's entry over its capillary time τ = √(ρD³/σ). Shipped (see above).
- ~~**18c-10**~~ A hand's drop and a held stream lay their colour with their volume. Shipped (see above).

## 18e. Edges come from refraction (replaces the painted rims and highlights)

- ~~**18e-7**~~ #881 The closeup's relief reads the optical path at the lens's disc (`camLap`), not the colour step: no line where two dyes meet up close, the dial moves nothing there, a swell gathers light, bubbles left to the traced bubble. `npm run camrelief`, `holeline` 6 and 6b.
- ~~**18e-9**~~ The optical path's height over a clear film uses the real gap `h = gap / 0.03` (with no `1 - 0.5·film` factor) in `calcOpl` (`wgsl/plate.ts`) and `lampDepthAt` (`wgsl/plateLamp.ts`), so `OPL = (n_water + 0.087·film)·h`. `npm run derive -- --owed=grad` (`height` taken out of `--owed`).

## 18i. Bubbles and beads live by physics, not timers (shipped)
- ~~**18i-2**~~ **shipped**: `BeadField.setLiquid({ gapMetres, muOut, muIn, deltaRho, sigma })` slides by Δρ g sinθ b² / (12 μ_out (1 + λ)), every per-step drop rate is 1 − exp(−dt/τ) (Paterson coalescence, repel, attract, recolour), drops leave over the open circular rim, and `stepPlateBeads` (`src/sim/beadStep.ts`) wires the live gap and carrier/oil properties from the frame loop (`npm run drops` 33/33; story in [`docs/plan-shipped.md`](../plan-shipped.md) §18i-2). Left: retiring the 30-frame `populate` timer once presets/pours seed beads directly (currently required by `npm run webgpu` and presets with `beads > 0`), and `15g-17` (PR #914).

## 18c. A pour adds liquid, not only colour

- ~~**18c-13** The splash is water's, whatever liquid falls, and makes dye~~ — **Shipped** (S; Medium–High; `dropImpact` takes the bottle's ρ, σ, μ and live `coverMetres`, `layDrop` splits drop dye and volume across central drop and satellites; `npm run dropwindow`; trickle and crater left as 18c-13b).
  `dropImpact.ts:82` carries water's ρ, σ and μ, so Cossali's K gates the satellites with
  water's numbers for oil or glycerine; `dropSplash.ts:114` ignores the gap; the satellites
  (`:119-134`) add 22% more dye than the drop held; the trickle (`:75-80`) carries no mass;
  the crater (`:66`) is a fixed size. A splash needs K = We·Oh^-0.4 over about 2100 with the
  falling liquid's own properties, and a drop splits its volume, it does not add to it. Read
  the bottle's ρ, σ, μ, take the gap, and split the drop's dye and volume among crater, crown
  and satellites. Check: total dye and volume after a splash within 0.5% of the drop's; an oil
  drop from the same height does not splash. Lines are at 801a815e; after #905 the water constants
  sit at `dropImpact.ts:89` and the satellites at `dropSplash.ts:193-207`, each still laying 0.22
  of the drop's dye. (38v, from RS-13.)
- ~~**18c-14**~~ The idle plate laid dye and heat by itself (a hidden seeder orbiting the
  plate). Shipped (2026-11-21): it is gone and a plate left alone gains no colour; the
  emergency seed for a drained plate stays (`npm run tools`). Story in
  `docs/plan-shipped.md` §18c-14.

## 18e. Edges come from refraction (replaces the painted rims and highlights)

- ~~**18e-2. A clear pour's edge, and the deflection from the optical path.**~~ **Shipped, this PR** (the derive pass writes `|∇OPL|` in `.z`, the closeup keeps its dye-path Laplacian in `camLap` via `TRANSMIT_WGSL`, and `oplPupilLoss` deflects the front plate's light by `|∇OPL| · DISH_REST_GAP · logicalGrid` against `DROP_NA = 0.25` beside `defocusShadow`; `npm run derive` 5/5, `npm run nolight -- --owed=film` 15/15; story in `docs/plan-shipped.md` §18e).

## 18c. A pour adds liquid, not only colour

- ~~**18c-8**~~ (shipped 2026-11-27) A small window is square-ish on the grid: a source a few cells wide on the
  collocated grid piles the pushed dye on its four diagonals (dark lobes at 192² for a drop of
  amount 10, gone by amount 30). With 18a-8's carry. **Shipped** (2026-11-27): measured in the
  lab at 192², a clear drop of amount 10 in a cyan pool now opens round on main already (the
  drop is a pour through the solve since 18c-2): the fourfold part of its radius 0.013 and of
  its collar 0.0066, and 0.009 and 0.003 with 18a-8's corner transport. `npm run gridiso` line 4
  holds both under 0.02. If the Mac still shows lobes, they are in the plate's drawing, not the
  carry: film it there.

## 18d. Each liquid has its real properties (replaces the property scalars)

- ~~**18d-10**~~ (shipped 2026-11-27) The species is not in FieldCarry, so a rebuilt solver loses it, and now that
  nothing fades it the loss shows: a governor's move drops every poured liquid. Carry it.
  **Shipped** (2026-11-27): `handOver` copies the species and both liquids' fields, `takeOver`
  lays them by area (carryArea) with the last bottle's tension and density. `npm run regrid`
  line 7 (384² → 256²): species share 370.59 → 370.61, its Σ share·lnν 2601.87 → 2601.98, an
  oil's nonpolar sign 112.58 → 112.59; the control (nothing handed over) 0.
  On the old plate (Thin Gap off), the CPU body drag is still the thickness.
