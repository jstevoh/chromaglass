# Archive: 18. The physics under the look: where the plate imitates a result instead of simulating it

The closed items of [`docs/plan/18-physics.md`](../18-physics.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- ~~**18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.~~
  Dropped: the owner decided to delete the CPU solver's stepping (2.6, 2026-10-06; 3.1).
- **18a-11, the cost measured (shipped).** Measured 2026-10-07 on the Mac with `npm run stages` (`docs/judging.md` §19): Thin Gap needs no look turned off (512², 33 ms/frame; H2b 52 fps), and the in-plane viscosity (18a-10) is 1.52 ms. Story in `docs/plan-shipped.md` §18a-11 (moved 2026-10-29, 19m-2).
- **18a-13a. Two layers: shipped** (2026-10-22). Oil lenses ride the water at their
  capillary thickness, read from the plate's own oil each frame, with the two-layer
  laminar drag between them; the dish moved to the GPU (`gpu/slosh.ts`). Plate Rock's
  swing tips it where Frame Sway lets the frame move (`rockAccel`; how the rock itself is
  driven is 27f-2's). A kick's glass presses the dish over the same radii it presses the gap
  (`kickPress`: the sheet's one dent off the frame-moving looks). Story in
  `docs/plan-shipped.md` §18a-13a; `npm run slosh`, `npm run sloshgpu`.
- **18a-13d. A shock-capturing scheme: shipped** (2026-10-22). HLL fluxes over
  hydrostatic reconstruction, MUSCL with the MC limiter, Heun in time: a dam
  break runs at Stoker's speed, two cells wide, and no energy is made. Story in
  `docs/plan-shipped.md` §18a-13d. Still: no Coriolis or centrifugal term, and the
  CPU film ignores the slosh.
- **18a-13j. A hand can tip the dish: shipped** (2026-10-31; the owner: "I never saw
  the control to do that"). The Tip pad (`components/ui/TipPad.tsx`, `lib/tipPad.ts`)
  in the Tools panel's empty keycaps, at the top of Tilt & Rock and in the phone's
  Motion sheet: drag the dot to an edge, let go and the dish lies back. `npm run
  tippad`. Story in `docs/plan-shipped.md` §18a-13j.
- **18a-13n. How far a full knob tips: shipped** (2026-11-26; the owner's "Keep going"
  on the knobs). A full knob now hands the solver rock 2 (`KNOB_ROCK`), Plate Rock's
  strong swing at the top of its dial, not the phone's 1.1: sinθ 0.48 (29°) against
  the phone's 0.27 (15°), on the same thin-gap law, so heavy dye slides 1.8 times as
  fast. `knobTip` bends the travel, u(1 + (R − 1)u), so near level each CC step is as
  fine as before and two thirds of a turn is the phone's full tip. Phone and knobs
  together stop at the knobs' corner. `npm run handtilt` (reach). Films on the Mac for
  the owner's judging.
- **18a-13m. Tilt the plate from two knobs: shipped** (2026-11-15; the owner: "control
  the tilt of the plate from my midi controller. Maybe two knobs?"). Tilt Left/Right
  and Tilt Up/Down (`plateTiltX`, `plateTiltY`): the flat plate tipped by a hand, the
  remote phone's rock path, eased and turned into the dish (`lib/handTilt.ts`); MIDI,
  Tilt & Rock, the desks, the remote and the phone's Motion sheet. `npm run handtilt`.
  Story in `docs/plan-shipped.md` §18a-13m. 18a-13n (a full knob past the phone, archived) shipped; open: 18a-13o.
- **18a-8, a staggered grid (shipped 2026-11-27, with 18a-8b).** Cell velocities are rebuilt from the face fluxes,
  which leaves a small checkerboard at a floored dent's edge; the advections'
  Rhie–Chow faces were given c·P, exact only where the drag is even (on a thin gap
  the colour's and the oil's carries and carryCourant now cross the solve's own
  faces, `THIN_FACE`, as the ferrofluid's did: a Finger's solid is where the drag is
  least even, 15b; off a thin gap the carries keep their Rhie–Chow faces, exact on
  the old plate's even projection); and the face fluxes' upwinding squares off a ring under a fast
  radial flow (the pressed rings in the picture). A staggered grid takes all three,
  and `dampGrid`'s job.
  **The third, shipped** (2026-11-27): the squaring was the carry's corner, not the
  grid's storage. The faces moved each axis's share from the same old colour at once,
  so a diagonal flow spread colour across itself as well as along (½|u_x|Δx along x
  plus ½|u_y|Δx along y). The thin gap's carries now take Colella's corner transport
  (`ACROSS` in `wgsl/fluid/carry.ts`, `cornered` in `wgsl/fluid.ts`); the old plate
  keeps its faces. `npm run gridiso` (lab, 128², a thin ring turned by a solid swirl):
  the fourfold part of the width it gained 0.331 → 0.218, the width gained 0.353 →
  0.273 cells, colour +0.088% from the half-float floor on that fast ring (0.000% at
  `dyeedge`'s speed). **The first, the checkerboard, shipped** (2026-11-27): the cell
  kept its own predicted velocity (hsGradient wrote c·u*_cell − M∇p/h) and the faces saw
  only the mean of two cells' u*, so a checkerboard in the flow was a mode the solve
  never saw. The thin solve's faces are now the flow's state (Harlow and Welch's
  staggered grid, `wgsl/thinFlow.ts`): hsGradient keeps each face's velocity in
  `hsFlow`, hsDivergence predicts each face from its own last velocity plus the mean of
  what the step's forces asked of its two cells, a cell's velocity is the mean of its
  faces, and `thinFaceVel` reads the face (with the ridden flow's slosh, drift and
  ferrofluid drop laid on as the cells' change). `npm run gridnull` (lab, 128²): a
  checkerboard laid in water kept 0.93 of itself after a step on main (0.46 in the oil),
  4e-8 now; an eight-cell wave keeps its inertia (0.983 of a long wave's, main 0.981);
  a floored dent's rim under a push 0.0303 → 0.0108 sharp in the oil, 0.0115 → 0.0083
  in water; `gridiso`'s drop window rounder (0.0092 → 0.0061). The [1 2 1] rebuild (tried first) damped
  the eight-cell wave 0.85 a step. **18a-8b, `dampGrid` retired on the thin gap,
  shipped** (2026-11-27): with the faces as the flow's state the thin gap's colour grows
  no checkerboard for the pass to take. Grating's pressed plate (ten seconds of pushes
  and presses) on a thin gap: the dye's band within 0.2π of the checkerboard reads
  2.94e-3 of the dye with no pass and 2.85e-3 with it forced on (1.03; the old plate
  0.64, and 6.33e-3 with none); texture four cells across keeps 0.986 of itself over a
  second with no pass, 0.817 with it. So the step runs no pass on a thin gap
  (`p.gridDamp ?? (thin ? 0 : GRID_DAMP)`, the reasons at `GRID_DAMP`), and the old
  plate keeps it. `npm run grating` section 7 holds both (with the forced pass as the
  control). Saves the `dye grid` stage on every look (3 to 9% of a layer's step on
  Metal at 18m-5, twice with oil bodies).
- ~~**18a-25, the comet's pull and the Turbulence noise are through-flows at the open rim.**~~
  **Shipped 2026-11-28** (`npm run rimstir`): on the thin gap Turbulence is the closed dish's
  projection of the same curl noise, u = ∇⊥Φ with −∇²Φ = −∇²ψ inside and Φ = 0 at the rim
  (`src/gpu/wgsl/fluid/stir.ts`, relaxed on hsLiftRelax), and the comet's pull is a tilt's,
  added to Plate Rock's pull in hsBody's closed circulation. Not a window on ψ (the draught's
  way): the stir's lowest octave is the dish, and a window would make a jet round the rim (estimated, not tried). Lab
  (128², 600 steps, a disc to r 0.44): Turbulence 0.5 kept 6.86% → 100.01% with the middle's
  stir 96% of the open curl's and no ring at the rim; the comet 1.5 kept 0.04% → 100.02% and
  still moves the colour 0.18 of the plate along its pull. The comet now acts on every thin
  gap (it ran only where Air, Rain Drip, the breath or a tilt ran hsBody), and with oil the
  oil's lift goes against it as up a tipped plate. Follow-up: 28i-9.
  Found re-tuning the looks the real dye mixing left bare (28i-8, 2026-11-27). On Classical
  Vibe's thin gap, each stir alone on its own pours (lab, Metal, the dish's mean dye): with
  nothing stirring the dish held 0.59; the comet's pull (`cometSpeed`) at 0.75 took it to
  0.05 in 10 s; Turbulence 0.25 to 0.17 in 30 s; the music's stir cord on Turbulence alone
  to 0.08; Air changed nothing. Lacing Run read the same (a mean of 0.08 at 30 s at Turbulence 0.1,
  0.02–0.04 at 0.2, and 0.06 at 60 s at 0 with the music's stir cord still on it). The comet is a uniform drift and the curl noise in forcesB
  (`src/gpu/wgsl/fluid/forces.ts`) has a lowest octave the size of the dish, and neither is
  held closed at the rim, so both carry liquid, and its dye, out over it; the regulator
  cannot put back what has left. The looks were re-tuned around it (less of both); the fix
  is the physics: lay both as stream functions held at zero near the rim, the way 18a-16
  did the draught and 18a-17 the tilt, so they turn the liquid inside the dish and send
  none out. Then the looks 28i-8 calmed can have their stir back. Measure with the dish's
  own mean over 60 s at Turbulence 0.5 and the comet at 1.5 on Classical Vibe's saved
  settings (a mean under 0.4 at 60 s means it still leaks).
