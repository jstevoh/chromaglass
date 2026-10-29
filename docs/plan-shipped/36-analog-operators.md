# 36. What the analog operators could not do (researched 2026-10-27): what shipped

How §36's shipped items were found, built and measured. The open work is in
[`docs/plan/36-analog-operators.md`](../plan/36-analog-operators.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Fourth pass (moved 2026-10-29, 19m-2)

### 36. What the analog operators could not do (researched 2026-10-27)

#### 36e-1. The model and its check, on the CPU

  - **36e-1. The model and its check, on the CPU (shipped).** `src/lib/lampBoil.ts` is the
    reference the GPU build is held to, and `npm run boil` (38 lines, node only, about 45 s)
    is its judge, the way 32a's soap film came before 32c. The roadmap's blocker for S2 ("heat
    has no strength, every source saturates the buoyancy tanh") no longer holds: #352 took
    the tanh out. What the GPU still lacks is heat in kelvin and watts (its `vel.z` has no
    unit, and `currentForces` still caps it at `clamp(temp, 0, 50)` and the current at
    `maxCurrent`), a dish whose glass and liquid set how fast it warms, and any boiling. The
    model, per square metre in SI units: the lamp's hot spot times the Heat dial (how much
    of the heat filter is out) in two bands, the visible share the dye absorbs and the
    infrared the water absorbs through its depth; one temperature through the liquid and
    both glasses (Biot about 0.1), conducting sideways, cooled by the fan's air at h = 50
    W/m²K or by natural convection at 10 under a hand that blocks it (the Danish crew's
    stroke), and by the glass faces' radiation (about 15 W/m²K at 100 °C), held at the
    room's at the open rim, the liquid carrying its own share of the heat when it flows; a
    Hele-Shaw flow driven by water's real density (Kell) and viscosity (Vogel), with
    buoyancy only in the plate's plane (zero on a level plate, as 18f gates it), and volume
    sources for warming water's expansion and for vapour; and boiling from sites at a
    density on the glass, each cell starting at its largest cavity's equilibrium-nucleus
    superheat (2σT_sat/(ρ_v·L·r), 4 to 12 K), a nucleus as wide as the gap, then heat
    exchanged at the bubble's rim both ways, so held heat boils and let-go heat condenses.
    *Measured* (`npm run boil`): the first step's warming matches the two bands ÷ heat
    capacity to 1.5e-8 and the dial is linear (dark dye at absorbance 1.5 warms 1.41× clear
    water); cooling by air and radiation at both h to 0.5%; a warm bump spreads as the heat
    equation within 0.6%, and the dish's hottest point after five minutes of lamp is a
    radial heat balance's (with radiation) to 0.01 K; a 70 °C patch on an upright plate rises
    at the exact Darcy inclusion speed within 1.6% (40 °C within 0.6%; the two 4.11× apart
    against an exact 4.07×), and on a level plate does not move; what leaves the rim over
    five minutes of warming is the water's growth by Kell within 0.5%; the dish's heat
    over each boil and its calm is a ledger of the lamp, the air, the radiation and the rim
    within 0.4% and 1.0% of the lamp's heat; the sites' share is the density's and their
    superheats the nucleus's over the whole distribution (KS 0.027 against 0.056); at 98%
    of each site's superheat nothing boils and at 102% every site does; a bubble's rim
    boils and condenses at its stated exchange to 1e-3; a dish the lamp and fan warm to
    93.8 °C never boils in five minutes, boils 28 s after a hand blocks the air off the
    lamp's centre, only under the hand, held under 103 °C there, and the vapour is under 1%
    of its peak 0.6 s after the hand lifts (0.3 s after the dial goes to 0 on a hotter
    lamp). Twenty-two look-alikes (each the reference with one thing changed, `scratch/` in
    the build session; four from the check-skeptic's pass and five from the review's) each
    fail at least one line but one: the old saturated buoyancy 2, a constant expansion
    slope 3, a constant viscosity 3, buoyancy on a level plate 15, no nucleation threshold
    3, a bubble on a timer 7, no condensation 5, no latent heat 7, no vapour volume 3, no
    expansion 2, a uniform lamp 5, the dye ignored 2, a hand that adds heat instead of
    blocking the air 6, no sideways conduction 4, every cavity the median one 1, a bubble
    rim a fifth as strong 2, vapour absorbing as liquid 5, no radiation 10, the dye taking
    the infrared at its visible absorbance 7, the glass flowing with the liquid 2, heat
    carried in conservative form 8. The one that passes throws away the heat of a cell that
    has boiled dry: here a dried cell takes no lamp (its liquid and dye are gone, and the
    glass absorbs none, 36e-4), so that branch carries little: the review measured it at
    19 J of the 1127 J the lamp gave (1.7%), moving the ledger 0.16%, under its 3% bar
    (this line first said 0.03%, too low). It becomes material once the glass absorbs the
    infrared (36e-4), and that build adds a tighter dry-out ledger line. `boilgpu`'s
    boiling second (36e-2) already fails it, by 13% and 16% of the reference's change.
