# 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11): what shipped

How §29's shipped items were found, built and measured. The open work is in
[`docs/plan/29-ferro-drop.md`](../plan/29-ferro-drop.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 29. The closeup's ferrofluid drop

#### 29a. The drop as a bead with the light on it (this PR)

Asked 2026-10-11 ("I want to see much more 3d drops ... a drop of ferro fluid with light
reflecting off of it"). The closeup drew a flat black disc, its inside one value of black to
the byte: the solver carries the ferrofluid as a layer of one depth, so there was no surface
to light.

Built: the ferrofluid's surface solved each frame of the closeup (`src/gpu/ferroDrop.ts`,
`wgsl/ferroDrop.ts`): the ferrohydrostatic Young–Laplace balance h − ∇²h = P + K in l_c
(Rosensweig §5.2), the contact line the solver's own half-full line, the plateau
2 sin(θ/2) from the contact angle, the magnet's Kelvin pressure moving the volume
toward it. Drawn as a camera sees it: Fresnel off the ferrofluid from under the water
(n 1.52, 0.45% straight on), a softbox and a strip light and a dim tent through the top
glass by Snell, total reflection past 48.6° showing the plate round the drop, and the
dye over the drop filtering the reflection as the column above it, 2(gap − h). Relief /
3D is the contact angle (0 flat as before, 1 a bead at 160°; 0.7 is 112°). Only in the
closeup, only on the lead plate; the projected plate is unchanged to the byte (`npm run
ferrodrop`). Its shortcuts are open as 29a-1 to 29a-7 in `PLAN.md`.

Measured (`npm run ferrodrop`, 10 checks): the middle 1.460 l_c against the balance's 1.510
for a drop 4 l_c across at 112°; one l_c in from the edge 61% of the top; a magnet off the
right side stands that shoulder 138% and the far one 78%, the volume 101.8%; the light's
spread inside the drop 1 of 255 flat, 177 at Relief / 3D 0.7, its brightest up and left; a
yellow over it takes the highlight's blue 183 → 2 and its red 209 → 165; the 1x plate 0
bytes different at any relief.

#### 29c. The drop follows the hand and holds together (#373)

Reported 2026-10-11 (the handoff's `drag-today.png`): a magnet at 0.35–0.5, height 0.2,
walked at a tenth of the plate a second turned the closeup's drop into a crescent, then
smeared it to brown with no cell over half full within two seconds; a look's own magnet
left it behind. A real 6 mm drop under a dragged magnet holds together and heaps toward
the field.

Found, in three rounds of review and a takeover:
- **The rim held the drop back.** The force on a cell is φ·∇ψ (the Kelvin force on the
  ferrofluid's share) but hsPrep's drag is the two liquids' geometric mean by share, right
  for the pressure's flow across a mixed cell and wrong for a force on one liquid alone: a
  half-full rim cell was driven at a quarter of a full cell's speed per unit of ferrofluid
  (ν_clear/ν_ff 4.5: 0.5·4.5^0.5 against 4.5). Measured in the lab (the handoff's
  `dropdiag`, a drop eight cells across, 384², main's gain): the core went at Darcy's speed
  for a sharp drop, 0.0123 of the plate a second under a weak magnet, the rim at 0.55 of
  it, the centroid at 0.44 of the pull asked; under a strong one 0.085, 0.76 and 0.29, the
  back rim drawn into the crescent. Two liquids side by side in the gap each go at their own
  Darcy speed under the one pressure, so the force is now read against the ferrofluid's own
  drag, (ν_clear/ν_ff)^(1−φ) on phaseForce's force: the rim at 0.81 of the core, the
  centroid at 0.68 of the pull asked (0.83 of the sharp drop's) under the weak magnet, and
  0.101 of the plate a second under the strong one where it was 0.075.
- **The flux step spread the moving edge** (MUSCL with minmod, half a cell times the
  cells moved): 100 cells past half → 0 over a 0.3-plate drag, which steepening the
  double well 2.9 times did not hold. Weller's interface compression takes it back along
  the edge's normal at the flow's own speed (phaseCompress, 29c-1), from the field blurred
  once a step (phaseBlur; blurred face by face it read 216 cells a cell and cost every
  ferrofluid look a fifth of its step on the Mac, 29.2 → 35.7 ms). Its first form compressed
  every moving face alike and sharpened a smooth pool the limiter had not spread:
  `ferropress`'s pool came back fuller after the lift (worst ring 0.049 against the 0.03 bar;
  main's 0.012; 0.008 with the compression off), the same in every arm of the drift and the
  momentum tried. Each face's compression is now scaled by the share of its slope the
  limiter withheld (`withheld`: 1 − minmod(Δ_up, Δ_f)/Δ_f, the same two slopes phaseAdvect
  limits; a few per cent on a smooth pool, 1 at a drop's shoulders), and the ring is
  0.003. Run on the deep plate too, the first form broke spikes (2/6), maze (3/4) and
  fingers (3/4) on the Mac, whose bars were measured with the spreading; so the compression
  is the thin gap's only and the deep plate is main's step (open under 29c-1).
- **The gain.** Antigravity's 1.04e-4 (17× main's) passed `ferrodrag` by running on the
  per-step guard, which makes the force uniform over the drop (every cell at the cap, so the
  drop moves as a body at 0.42 of the cap), and turned `fingers` 1/4, `ferrodye` 4/5 and
  `ferropour` 7/8 red on the Mac. `npm run magnetgain` works the pull out in SI from the
  shader's own field (held to Biot–Savart within 0.004%): EFH1's far-field gain is 5.8e-5
  at Ferrotec's χ 2.64, and the near field is the guard at any gain the plate has had (the
  hand's magnet asks 7.8 plate widths a second at 6e-6 against the guard's 0.375 on 384²).
  MAGNET_GAIN stays 6e-6, a tenth of the physics, named with its reason (29c-2: the looks'
  far pools, and the contact line's pinning the solver lacks); the guard is named as the
  hand's speed limit (29c-5); the saturation knee (29c-3) and the projection's one
  mobility (29c-6) are the shortcuts left.
- **The ferrofluid's momentum stayed behind.** With the rim's force in, the dragged drop
  still fell behind, 2.78R at 3 s and 5.8R at 6 s with no equilibrium: it topped out at 0.09
  of the plate a second under a pull whose Darcy speed was 0.19, where under a weak magnet,
  slow enough to keep up with its own momentum, it went at 0.95 of Darcy's. A thin gap does
  not carry the velocity along itself (`wgsl/thinGap.ts`, right for the oils, whose drag
  takes a push in a few steps), but the ferrofluid's drag time in the rest gap is 0.6 s, 36
  steps, and a drop dragged at the hand's speed crosses its own width in 30: every cell it
  entered held the oil's velocity, and the pull brought it up at 2.8% of the shortfall a
  step. Weighed against the drag the dropped term, ρ(u·∇)u, is Uτ/R, 2.5 for this drop
  where the oils are under a tenth. phaseMomentum carries the velocity along itself by the
  ferrofluid's share of each cell, before the step's forces (its momentum φu over its share
  where the trace lands; the oil's part reads as it was; a look without ferrofluid runs the
  step as before): the drop reaches the magnet's speed, 0.099 of the plate a second, and its
  lag settles at 1.85R. `phaseMomentum: 0` runs the step without it, the lab's control.
- **The resting drop leaked into its halo (`phaseCHVolume`, 29c-7).** The thin gap's
  Cahn–Hilliard step used a constant mobility at Cahn number ≈ 0.5 (an eight-cell drop on
  384², `R = 0.022`, `phaseSharp = 0.75`), so the curved interface's Gibbs–Thomson chemical
  potential shifted the bulk equilibrium to `c_eq ≈ 0.021` and drove ferrofluid out through
  the clear oil at `2·M·dt` per substep. At rest with no magnet (`npm run ferrorest`), the
  drop's half-full cells fell `100 → 84` over the 180 steps after the 20-step settle
  (`116 → 84` from pour), its peak fell `0.996 → 0.946`, and its halo of cells over `0.01`
  grew by `+248` (`352 → 600`, from `222` as poured), step for step as on `main` with
  `thinGap: 1`; a dragged drop continually left that halo behind in fresh oil and re-made it
  as it moved, losing about half its ferrofluid (`352 → 1602` cells over `0.01`).
  `phaseCHVolume` now multiplies each face's flux by the degenerate mobility
  `mob = 4m(1 − m)` at the face's mean share `m = ½(c_p + c_q)`, with no floor (Elliott &
  Garcke 1996): antisymmetric across each face so `Σc·h` is conserved (to `0.011%` over 180
  steps, against a `9.8%` loss when evaluated at `c_p` alone), at most `1` so the explicit
  stability limit (`≤ M_0`) is unchanged, and zero in pure oil and pure ferrofluid. At rest
  (`npm run ferrorest`, 4/4) the drop holds `90` of `100` half-full cells, its peak holds
  `0.975`, and its halo grows by `+94` (`324 → 418`), while on the dragged drop the cells
  over `0.01` fall from `1602` to `1238`. The deep plate's `phaseCH` stays as on `main`
  (29c-1).
- **The carry's wake and the trailing rim (29c-4, 29c-8).** With the limiter-matched
  compression and degenerate mobility in place, a dragged drop (`npm run ferrodrag`: `0.3` of
  the plate in 3 s under a `0.4` magnet at depth `0.2`) still loses its trailing rim to the
  oil's dipole return flow (`ferrodrag` 1/3: lag `3.24R`, half-full cells `100 → 0`, cells
  over `0.01` `324 → 1238`). The step has one velocity a cell, the mixture's
  `u_mix = φu_ff + (1 − φ)u_oil`, and where the back rim thins the oil closing in behind the
  drop dominates `u_mix` and carries that faint ferrofluid into the wake. Two forms of a
  separate ferrofluid carry were tried and dropped (29c-4). The first was a switch, the
  body's Gaussian mean in place of the mixture's velocity in every rim cell (`phaseVelocity`),
  and it failed the press: a mean is biased towards where the body is, and under the glass's
  squeeze (`u ∝ r`) a rim cell read the body's slower velocity from inside it and was carried
  slower than the liquid it is part of, so the pool packed (`ferropress`'s middle `1.025` of
  full with the glass down, main `0.960`, the bar 3% of `0.956`; the lift's ring `0.046`, bar
  `0.03`), and on the Mac's GPU the switch's patchy field raised 23 domes with no magnet
  (`spikes`) and lost a finger and a maze (3 of 4 each). The second was a first-order
  least-squares fit of the body's velocity and its two gradients (exact for a translation, a
  squeeze and a rotation), applied as a drift flux `φ(1 − φ)(u_ff − u_mix)` (`phaseDrift`):
  the compression's first form hid its shortfall by packing the shed rim back on (lag `1.62R`,
  half-full area `102` of `100`); matched to the limiter, the blend's drop shed three fifths
  of itself (lag `2.49R`, half-full area `32`). So the carry is the mixture's velocity again,
  and the trailing-rim loss is open as **29c-8** (`npm run ferrodrag` stays out of CI as
  known red until 29c-8).
- `phaseMu` and `mazeReady` run as on main (maze and spikes only); the first rounds had them
  on every ferrofluid look.

Checks: `npm run ferrorest` (new, lab, on the Mac's `open` shard; 4/4: half-full cells
`116 → 100 → 90` over 20 settling and 180 resting steps, `90.0%` kept against the `>= 88%`
bar where constant mobility falls to `84`; peak `0.996 → 1.000 → 0.975`, bar `>= 0.96` where
constant mobility falls to `0.946`; halo cells over `0.01` `222 → 324 → 418`, `+94` against
the `<= +120` bar where constant mobility grows `+248`, `352 → 600`; volume `Σc·h`
`3.36244 → 3.36248 → 3.36286`, `+0.011%` drift against `0.1%` bar where cell-centred mobility
loses `9.8%`; centroid moved `0.010` cells, bar `< 0.5` cells) and `npm run magnetgain` (new,
lab, on `fifth`; 5/5: the field within `0.004%` of Biot–Savart over 905 points, the weak
field's ∇ψ the linear Kelvin force within `5%` at `11.461` against `11.461`, `MAGNET_GAIN`
`6e-6` at `0.104` of `GAIN_phys` `5.775e-5` s, the drop at `0.0114` vs `0.0130` plate/s
(`-13%`, bar `34%`) of the two-phase Darcy speed under a weak magnet, and the dragged magnet
under the per-step guard at its steepest cell, `0.262` vs `0.375` plate/s on `384²`).
`npm run ferropress` is 7/7 (`worst ring 0.002` on the Mac, `0.004` on software WebGPU, bar
`0.03`, where #373's third head had `0.049` and main `0.012`; the middle with the glass down
`0.968 → 0.981`, volume `0.01570 → 0.01570`). `npm run ferrodrag` (new script, out of CI
until 29c-8) is 1/3 (`lag 3.24R`, `half-full 100 → 0`, `moved 0.010 cells`).

Fix round after the review of 0580eaa (six asks): `magnetgain`'s weak-field line is renamed to what
it tests (a units check on ψ, the gain cancels there); the drop checks apply the shader's rim factor
`share·(ν_clear/ν_ff)^(1−φ)` per cell before the per-step cap, which moved the strong drop from `-22%`
to `+4%` and the weak one to `-6%` (software WebGPU), both under a 20% bar (the weak one was 34%);
`ferrorest` reads a second window (steps 200 to 380: its loss at most half the first's, or 3 cells) and
calls its centroid line a symmetry guard; `npm run ferrohold` (new, `fifth` shard) holds the momentum
pass and the compression pass on the dragged drop over steps 60 to 120, each switched off by hand
turning red its own line (lead `2.01R` → `2.28R` against `2.15R`; half-full `60.3` → `34.4` against `47`),
and the script runs both off-scenes itself and requires each pass worth half its measured gap
(`0.13R`, `13` cells), with a solver-read start guard (centroid over `0.40`); `ferrorest` line 5 is
signed (a second window that gains over 3 cells is red too) and line 3 also holds Σc·h at step 380;
`docs/judging.md` §54 says what the rim pull and `phaseMomentum` look like.

**29c-8. Two-phase carry at the trailing rim (#495).** Chosen fix: a **two-phase carry**
(`phaseVelocity` in `src/gpu/wgsl/fluid.ts`, writing `this.phaseVelT` read by `phaseAdvect`,
`phaseAdvectPlan` and `phaseCompress` while `this.vel` remains the mixture velocity for the dye, oil
and `phaseMomentum`), chosen over a pre-projection Korteweg or sub-grid contact-line force because
any force added before `hsProject` still leaves a single projected cell velocity
`u_mix = φ·u_ff + (1 − φ)·u_oil` shared by both phases (and any curl-free edge force is removed by
the pressure projection). Where the back rim of a dragged drop thins below half full, the displaced
oil's dipole return flow dominates `u_mix` and turns it backward into the wake; carrying the
ferrofluid phase with its own velocity `u_ff` keeps the trailing rim moving with the drop.
Named shortcut: instead of solving two coupled momentum and Darcy-projection equations for `u_ff`
and `u_oil` across the diffuse interface (queued as `PLAN.md` **29c-9**), `phaseVelocity`
reconstructs the local drop velocity `u_m` and centre-of-mass offset `x_m` from the half-full body
(`φ >= 0.50`) within an 11-cell Gaussian window (`w = ((φ − 0.50)/0.50)·exp(−r²/64)`), gated off on
labyrinth and standing-spike scenes (`cohere = (1 − 2·maze)·(1 − spikeAmt)` while `!filmHeld`) so an
11-cell window never bridges the 2–4 cell valleys between standing domes or labyrinth fingers
(`spikes` 6/6, `maze` 4/4, `fingers` 4/4, `domes` 4/4). Leaving `v` untouched whenever
`dot(v.xy, u_m) >= |u_m|²` makes the pass a no-op on radial squeeze flows under a press where
`|u(r)| ∝ r` (`ferropress` 7/7: middle `0.968 → 0.981`, worst ring `0.012`), and weighting the
carry by `along = dot(x_m, u_m)/|u_m|` carries the trailing rim (`along > 0`, `φ < 0.96`) at `u_m`
while carrying only the outer leading toe (`along < 0`, `φ < 0.49`) so the front half-full contour
keeps its Taylor–Saffman two-liquid Darcy speed (`magnetgain` 5/5: `+2%` weak, `+3%` strong) and
MUSCL shear (`ferrohold` 5/5: mean lead `1.69R` vs `1.93R` with `phaseMomentum` off, `+0.24R` against
`0.13R`; mean half-full `107.6` vs `92.6` with `phaseCompress` off, `+15.0` against `13`). On the Mac
GPU, `npm run ferrodrag` reaches **3/3** (lag `1.82R` against `2.0R`, half-full cells `100 → 106`,
`106.0%` kept against `±15%`, cells over `0.01` `324 → 378` vs `1238` on `main`, stationary control
`0.010` cells). Per the 29c-8 brief, `ferrodrag` was not added to `checks.yml` in #495.
The review found one hole, fixed in the same PR: `runPhaseAdvect` chose `phaseVelT` whenever the thin
solve's buffers existed, and they outlive Thin Gap, so with Thin Gap switched off after a drag the deep
plate kept carrying the ferrofluid on the last thin step's velocity (magnet off, the drop slid `0.0425`
of the plate in 120 steps and smeared to `0` half-full cells). It now asks the step's own `thinLive`
(`0.6206 → 0.6241`, `104 → 94` half-full); the check for it is PLAN 29c-10.

**29c-10. `ferrodrag` in CI, and `ferrohold` over the whole drag (#521).** `npm run ferrodrag` is an
entry in `scripts/checks.json` on the `show` shard (the lightest on #495's run, 14.2 minutes of 20;
the check takes 39 s there): on Metal lag `1.82R`, `106.0%` kept, stationary `0.010` cells, 3/3.

A fourth line was written for the review's `runPhaseAdvect` fix: the dragged drop at step 180, Thin
Gap off and the magnet away, 120 deep steps, the drop held to less than one radius of movement and at
least half its half-full cells, with a fifth that runs the same on a lab built with `runPhaseAdvect`
keyed off `hsP` alone (#495's head before its review) and requires it red. On software WebGPU the two
separate: real `0.16R`, `104 → 94` (cx `0.6235 0.6237 0.6239 0.6241` every 30 steps); control `1.93R`,
`104 → 0` (half-full `100 78 8 0`). On Metal both read `0.70R`, so the two lines run by hand
(`-- --thinoff`) until PLAN 29c-11 finds why.

**29c-11. The Thin-Gap-off lines measure the deep plate on Metal, and join CI (#528).** Why Metal read
`0.70R` for the real plate and the control alike: a solver that ran thin and is asked for the old
plate stays thin while the old plate's pipelines build off the frame (`thinGapOn`, `prepareOldPlate`),
as the app does the first time Thin Gap is switched off in a show. The lab built ahead only the other
way (`lab.step` awaited `prepareThinGap`). On SwiftShader a 384² step outlasts those compiles, so the
next step was deep; on Metal the compiles outlasted dozens of steps. Counted on the show shard
(run 40628207753, with `lab.thinLive` read after each step): the real plate ran 57 of its 120 "deep"
steps deep, the control 0 of 120. The control is the first lab opened in the process, with Metal's
shader cache cold, which is also why the first lab's half-full count differed from the second's.
Those thin steps carried the drop on a freshly written `phaseVelT` (`0.6201 → 0.6341` in the first
30, the drop coasting to rest after the drag), and by the time the deep plate took over, the stale
velocity it would have ridden held almost nothing.

`lab.step` now awaits `prepareOldPlate` when the last step ran thin and this one asks for the deep
plate, so a check measures the plate it asks for from its first step on any adapter. A lab that never
ran thin builds the old plate on the frame as before, and no other check steps thin and then deep in
one solver. Lines 4 and 5 also require all 120 steps deep and print the count, so a lab that slips
back to thin is red by name. They run in CI (`npm run ferrodrag -- --thinoff`, show shard).

After, 120 of 120 steps deep on both labs. Metal (run 40636264043): real `0.09R` (cx `0.6201 → 0.6214
0.6217 0.6219 0.6221`, half-full `106 → 100 91 92 90`); control `1.93R` (`0.6478 0.6545 0.6585
0.6624`, half-full `106 → 96 66 0 0`), `1.83R` further, 5/5. Software WebGPU (the cloud lab): real
`0.09R` (`104 → 96`), control `1.92R` (`104 → 0`), 5/5. Metal and SwiftShader now read the same plate
to within a thousandth of the plate, so the bars (one radius, half kept, half a radius between) sit
where software put them, with room on both sides on both.

`ferrohold`'s window was steps 60 to 120 because the rim used to go in the second half of the drag.
Read there after #495, both absolute bars were passed by the runs they were set to fail (lead `1.93R`
with `phaseMomentum` off against `2.15R`; `92.6` half-full with `phaseCompress` off against `47`), and
the compression pass's margin was `15.0` cells on Metal and `13.4` on software against `13`. Over steps
60 to 180: lead `1.72R` on, `2.06R` with `phaseMomentum` off; half-full `105.8` on, `82.0` with
`phaseCompress` off (software; Metal `1.74R`, `2.07R`, `105.8`, `82.2`). The window is now the drag,
`LAG_BAR` `2.15 → 1.89` and `HALF_BAR` `47 → 94` (midway), `DLAG_BAR` `0.13 → 0.16` (half the gap),
`DHALF_BAR` kept at `13` (gap `23.8`).

## Third pass (moved 2026-10-29, 19m)

### 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11)

- ~~**29c. The drop follows the hand and holds together.**~~ **Shipped** (#373, #495; the story in
  `docs/plan-shipped/29-ferro-drop.md` §29c): the rim's force read against the ferrofluid's own drag (`phaseForce`),
  the moving edge compressed back by the flux limiter's deficit from a once-a-step blur (`phaseBlur`,
  `phaseCompress`, 29c-1), the gain derived in SI and held to the solver (`npm run magnetgain` 5/5, bars 20%, 29c-2), the ferrofluid's momentum carried with it (`phaseMomentum`), degenerate mobility
  `mob = 4m(1 − m)` in the thin gap's Cahn–Hilliard step (`phaseCHVolume`, 29c-7) with the
  resting-drop check `npm run ferrorest` (5/5, with a second window), the dragged drop held
  while it is dragged by `npm run ferrohold` (each pass switched off by hand turns its own line red;
  `phaseCompress` is a lab-only step option, 1 by default), and two-phase carry of a coherent drop's
  trailing rim on the thin gap (`phaseVelocity`, 29c-8; `npm run ferrodrag` 3/3 and in CI since
  29c-10, its Thin-Gap-off lines since 29c-11; `ferrohold` 5/5 over the whole drag). If the closeup's camera ever follows the drop, it follows smoothly and never with the
  sound (the sway work's `frameSway`, default 0, stays the only way sound moves the frame). Still

## Fourth pass (moved 2026-10-29, 19m-2)

### 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11)

#### 29c-7. A resting drop dissolves into its halo

  - ~~**29c-7. A resting drop dissolves into its halo.**~~ **Shipped** (#373; `npm run ferrorest`
    4/4, story in `docs/plan-shipped/29-ferro-drop.md` §29c). On the thin gap, `phaseCHVolume` used a constant
    mobility at Cahn number ≈ 0.5 (an eight-cell drop on 384², `R = 0.022`, `phaseSharp = 0.75`),
    so a curved edge's Gibbs–Thomson chemical potential shifted the bulk equilibrium to
    `c_eq ≈ 0.021` and drove ferrofluid out into the clear oil at `2·M·dt` per substep: with no
    magnet and nothing moving, a resting drop went from 116 half-full cells as poured (100 at the
    20th step, where the check starts its clock) to 84 at the 200th, its peak fell `0.996 → 0.946`,
    and its halo of cells over `0.01` grew by `+248` (`352 → 600`, from `222` as poured), step for
    step as on `main` with `thinGap: 1`; a dragged drop continually left that halo behind in fresh
    oil and re-made it as it moved, losing about half its ferrofluid (`352 → 1602` cells over
    `0.01`). `phaseCHVolume` now multiplies each face's flux by the degenerate mobility
    `mob = 4m(1 − m)` at the face's mean share `m = ½(c_p + c_q)`, with no floor (Elliott & Garcke
    1996): antisymmetric across each face so `Σc·h` is conserved (to `0.011%` over 180 steps, against
    a `9.8%` loss when evaluated at `c_p` alone), at most `1` so the explicit stability limit
    (`≤ M_0`) is unchanged, and zero in pure oil and pure ferrofluid. At rest (`npm run ferrorest`,
    4/4) the drop holds `90` of `100` half-full cells (`90.0%`, bar `>= 88%`), its peak holds
    `0.975` (bar `>= 0.96`), and its halo grows by `+94` (`324 → 418`, bar `<= +120`), while on the
    dragged drop the cells over `0.01` fall from `1602` to `1238`. The deep plate's `phaseCH` stays
    as on `main` (under **29c-1**).

#### 29c-8. A dragged drop loses its trailing rim to the oil's return flow

  - ~~**29c-8. A dragged drop loses its trailing rim to the oil's return flow.**~~ **Shipped** (#495;
    `npm run ferrodrag` 3/3 on the Mac GPU, story in `docs/plan-shipped/29-ferro-drop.md` §29c). With the
    limiter-matched `phaseCompress` (29c-1) and degenerate mobility in `phaseCHVolume` (29c-7) both
    in place (`ferropress` 7/7, `magnetgain` 5/5, `ferrorest` 5/5), a drop dragged `0.3` of the
    plate in 3 s under a `0.4` magnet at depth `0.2` (`npm run ferrodrag`) still lost its trailing
    rim to the oil's dipole return flow (`ferrodrag` 1/3 on `main`: lag `3.24R` against the `2R` bar,
    half-full cells `100 → 0` against the `±15%` bar, cells over `0.01` `324 → 1238`, centroid at
    rest moved `0.010` cells). Where the drop's back rim thinned, the cell's single mixture velocity
    `u_mix = φu_ff + (1 − φ)u_oil` turned backward with the oil closing in behind the drop, so
    `phaseAdvectPlan` carried that faint ferrofluid into the wake and `phaseCompress` compressed it
    along the wake rather than back into the drop. Chosen fix: **two-phase carry** (`phaseVelocity`
    in `src/gpu/wgsl/fluid.ts`, writing `this.phaseVelT` read by `phaseAdvect`, `phaseAdvectPlan`
    and `phaseCompress` while `this.vel` remains the mixture velocity for dye, oil and
    `phaseMomentum`), chosen over a pre-projection Korteweg or contact-line force because any force
    before `hsProject` still leaves a single projected cell velocity `u_mix` shared by both phases
    (and any curl-free edge force is removed by the pressure projection). For each rim cell on a
    thin gap when no labyrinth or standing-spike field is parting the pool (`cohere = (1 − 2·maze)·(1 − spikeAmt)`
    while `!filmHeld`), `phaseVelocity` samples the half-full drop body (`φ >= 0.50`) within 11
    cells weighted by `((φ − 0.50)/0.50)·exp(−r²/64)` to get the local body velocity `u_m` and
    centre-of-mass offset `x_m`. It leaves `v` untouched whenever `dot(v.xy, u_m) >= |u_m|²` (so
    radial squeeze flows under a press where `|u(r)| ∝ r` are a no-op: `ferropress` 7/7, middle
    `0.968 → 0.981`, worst ring `0.012`), and weights the carry by position along the drop's motion
    (`along = dot(x_m, u_m)/|u_m|`: full carry up to `φ = 0.96` on the trailing side `along > 0`,
    and only the outer leading toe `φ < 0.49` on the leading side `along < 0` so the front
    half-full contour keeps its two-liquid Darcy speed and MUSCL shear). On the Mac GPU,
    `npm run ferrodrag` reaches **3/3** (lag `1.82R` against `2.0R`, half-full cells `100 → 106`,
    `106.0%` kept against `±15%`, cells over `0.01` `324 → 378`, stationary control `0.010` cells),
    `ferrohold` holds **5/5** (step 60 `110` half-full cells, centroid `0.426`; mean lead `1.69R`
    vs `1.93R` with `phaseMomentum` off, `+0.24R` against `0.13R`; mean half-full `107.6` vs `92.6`
    with `phaseCompress` off, `+15.0` against `13`), `magnetgain` holds **5/5** (`+2%` weak, `+3%`
    strong against Darcy's), and `ferrorest` (`5/5`), `spikes` (`6/6`), `maze` (`4/4`), `fingers`
    (`4/4`), `domes` (`4/4`) and `ferrohands` (`4/4`) are unchanged. Per the 29c-8 brief, `ferrodrag`
    was not added to `checks.yml` in #495. The review found the deep plate riding `phaseVelT` after
    Thin Gap was switched off (`runPhaseAdvect` keyed off `hsP`, which outlives Thin Gap): the dragged
    drop, magnet off, slid on another `0.0425` of the plate in 120 steps and smeared to `0` half-full
    cells; keyed off the step's own `thinLive` it stays (`0.6206 → 0.6241`, `104 → 94` half-full).

#### 29c-10. ferrodrag joins CI

  - ~~**29c-10. `ferrodrag` joins CI.**~~ **Shipped** (this PR; story in `docs/plan-shipped/29-ferro-drop.md` §29c):
    `npm run ferrodrag` on the show shard (lines 1 to 3, 3/3 on Metal in 39 s), and `ferrohold` read
    over the whole drag (steps 60 to 180) with its bars between the runs again (5/5 on Metal: lead
    `1.74R` vs `2.07R`, half-full `105.8` vs `82.2`). The Thin-Gap-off line joined CI under 29c-11.

#### 29c-11. On Metal, the Thin-Gap-off line cannot tell the review's fix from its absence

  - ~~**29c-11. On Metal, the Thin-Gap-off line cannot tell the review's fix from its absence.**~~
    **Shipped** (this PR; story in `docs/plan-shipped/29-ferro-drop.md` §29c): the lab stayed thin for the first of
    those "deep" steps while the old plate's pipelines built off the frame (`thinGapOn`), and on Metal
    the build outlasted the drop's coast (57 of 120 steps deep on the real plate, 0 on the control).
    `lab.step` now builds the old plate first after a thin step; lines 4 and 5 require all 120 steps
    deep and run in CI (`npm run ferrodrag -- --thinoff`, show shard). Metal 5/5: real `0.09R`,
    control `1.93R`.
