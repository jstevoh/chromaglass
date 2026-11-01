# 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11)

The owner, 2026-10-11: "I'm still not happy with the macroview. I want to see much more
3d drops. I want to see a drop of ferro fluid with light reflecting off of it, with some
dye on top of it as it gets pulled through dyes, causing the dye to spread as the drop
gets pulled through dyes. At some point the dye rolls off of the ferrofluid drip,
leaving some dye around and then the ferrofluid keeps getting pulled through the dye and
making waves of sorts. [...] Calm details and control."

What the closeup drew, rendered in the lab (a drop 0.03 of the plate across, Ferro Paint's
settings, a magnet walked through three dyes; pictures in the project's shared files,
`macro-ferro-drop/`): a flat black disc with a brown line round it and one painted dot;
the drop's inside one value of black to the byte. The solver carries the ferrofluid as a
layer of one depth (a full cell 0.3 l_c, FILM_H0), so there was no surface to light. And
with the look's own magnet walked at a tenth of the plate a second, the drop crept 0.05
of the plate in four seconds; with one strong enough to drag it (0.5 at 0.2) it plowed
through the yellow, parting it round itself and leaving it behind, and then spread into a
brown smear with no cell left half full within two seconds.

One PR each, in this order. The steps after 29a are handed to Antigravity, with the physics,
the code's entry points, the checks to add and the scenes to match, in
`docs/handoff-macro-ferro-drop.md`.

- ~~**29a. The drop as a bead with the light on it.**~~ **Shipped** (this PR; the story in
  `docs/plan-shipped.md` §29a). Its shortcuts, each still open:
  - **29a-1.** A drop smaller than l_c comes out lower than its spherical cap: P is one
    value for every drop (set by the contact angle on a wide drop), not each drop's own
    from its contact angle. Per-drop P (a drop's slope at its line set to tan θ).
  - **29a-2.** The small-slope curvature (∇²h, not the full mean curvature), with the
    plateau set exact: the slope at the contact line is not θ.
  - **29a-3.** The picture's drop is taller than the solver's layer (0.3 l_c a full
    cell); carry the drop's volume in the solver as the bead's thickness, so the drop the
    flow moves is the drop the picture draws.
  - **29a-4.** The magnet's volume shift is held to its mean over all the ferrofluid on
    the plate, not drop by drop.
  - **29a-5.** The magnets' radius is the default Magnet Size's in the solve (the plate's
    uniforms carry no radius).
  - **29a-6.** The top glass's own reflection of the room (4% of the tent over everything)
    and the exit losses through the glass are left out, as a photographer's flag and
    polariser would leave them; the reflected plate past total reflection is the plate
    decoded plainly, without the closeup's cells or lacing.
  - **29a-7.** Its cost read on the Mac (`npm run stages` with the closeup in over a
    drop): about 18 million texel reads a frame on 384², 24 sweeps warm and 200 from cold.
  - **29a-8.** The drops' mask is 512 px across the plate (`beads.ts`), and at 6x the
    closeup shows a ninth of the plate's width on a 1440 px frame, so the mask is
    magnified about 25× and a drop 0.03 of the plate across is drawn from about fifteen
    mask pixels: its edge reads blocky where the ferrofluid's surface is smooth. Draw the
    edge from the solved surface (29a) or at the closeup's own resolution.
  - **29a-9.** A drop reads the flow from its nearest cell (`beads.ts`), so its speed
    steps as it crosses a cell's edge; sample the velocity bilinearly, as the solver's
    advection does.
  - ~~**29a-10. The Magnet's domes were one black in the closeup.**~~ **Shipped** (the owner,
    2026-11-01: "Let's make sure we have 3d in the macro view"; `npm run ferrodrop` 11-13).
    The drop's reflection is worked in light and encoded as a camera records it, so a dome's
    steep sides show the lit liquid round them as a dark gloss. Story in
    `docs/plan-shipped.md` §29a-10.
  - **29a-11. The domes' ridges and their star, in the closeup** (M, nil; found doing
    29a-10). The references (Colored I) show each dome's sides ridged from the point down,
    the finer spikes a big one carries, and the reflection broken into a star round its top.
    The plate at 1x paints that star (the rays term in the display's ferrofluid block); the
    closeup's surface is the drop solve plus the film's own height, smooth at the grid, so
    it shows none. A real ridge is the instability's own second scale on a peak's flank,
    under a cell on 384²: it needs the surface at a finer scale than the solver's grid (a
    sub-cell height, or the drop solve on its own finer grid), not a pattern laid on top.
    *Measure:* the number of light-dark turns round a dome's top in the closeup at 6x.
  - **29a-12. The dye over a dome's foot in the closeup is the macro's film contrast, not
    the column's** (S, nil; found doing 29a-10). `dyeColumnAt` takes its amount from the
    closeup's Film Level and Film Gain (a contrast for the dye's own picture) when the
    camera is in, so how strongly the dye tints a dome's reflection is a display setting's,
    and a dome's foot, under nearly the whole column twice, reads a deep red-brown. Take the
    column's absorbance from the decode's own amount at every zoom. *Measure:* a dome's foot
    colour against Beer-Lambert over 2(gap - h) of the decoded dye.
- **29b. Dye on the drop: carried, spread, and shed off its back.** The water over the
  drop is the gap less the drop's height and is dragged with the drop's surface (no slip
  on the drop, no shear at the top glass's far side through the thin film), so its dye
  rides along, thins as the column does where the drop is tall, and is left at the rear
  stagnation point as the drop moves on: trails. Today `phaseDisplace` pushes the dye out
  of the ferrofluid as though the drop filled the gap. The dye's own passes belong to
  other threads (18h, the dye's spread along the flow; 18m, a pour's slump): this one
  changes only how the dye is carried where the ferrofluid is, after coordinating.
- ~~**29c. The drop follows the hand and holds together.**~~ Story in `docs/plan-shipped.md`
  §29c (moved 2026-10-29, 19m).
  open:
  - **29c-1. The moving edge is compressed back to the grid's width, and the deep plate keeps
    main's step** (`phaseCompress`: Weller's interface compression, a flux along the edge's normal
    at the flow's own speed, read from the field blurred once a step by `phaseBlur`, and scaled by
    `withheld`, the share of each face's slope the flux step's minmod limiter dropped over
    `phasePlan`'s `psub` substeps: the first form, every moving face alike, sharpened a smooth pool
    the step had not spread, `ferropress`'s lifted ring 0.049 against the 0.03 bar where main has
    0.012; matched to the limiter, 0.002 on the Mac, 7/7). A shortcut standing in for an interface
    the grid cannot draw: a real drop's edge is a molecule thick, the grid's three cells of grey,
    and the flux step spreads a moving one by half a cell times the cells it moves. Nothing at
    rest. Both `phaseCompress` and `phaseCHVolume`'s degenerate mobility (29c-7) run on the thin gap
    only so far: run on the deep plate too, whose looks were measured with main's spreading and
    constant-mobility `phaseCH`, the first form broke three of them on the Mac's `plate` shard
    (spikes 2/6, maze 3/4, fingers 3/4 at #373's third head), so the deep plate keeps main's
    `phaseCH` and no compression (`spikes` 6/6, `maze` 4/4, `fingers` 4/4). Open: run `spikes`,
    `maze` and `fingers` with the limiter-matched compression and degenerate mobility (plus a
    bounded potential for the deep plate's 0.4% overshoot) on the deep plate and decide whether the
    looks take them.
  - **29c-2. The gain is a tenth of EFH1's, and the far pools sit by it.** `npm run
    magnetgain` works the pull out in tesla, metres and seconds: the solver's ψ is the
    Langevin energy of the ferrofluid in the rod's field, so GAIN_phys = (χ/2μ₀)(SPIKE_B_REF·Br)²
    h₀² / (12 ρ ν_ref L² MAGNET_E) = 5.775e-5 s at Ferrotec's χ 2.64 (0.22 of it at the 1.2 some
    papers give); MAGNET_GAIN is 6e-6. Nearer a magnet than 0.3 of the plate it makes no
    difference (29c-5): the pull asks for more than a step can carry at any gain the plate has
    had. The far field it sets: at the real pull Magnet Garden's and Ferro Paint's own magnets
    gather the whole plate at the guard's speed, where today's pools sit as poured, and every
    look with a magnet is tuned on that. A real plate's far pools sit for a reason the solver
    lacks: the contact line's pinning on the glass. A drop does not move until the force on it
    beats its contact angle's hysteresis, σ·2R·(cos θ_r − cos θ_a), of order 10⁻⁴ N for a 5 mm
    drop against water, which a look's own magnet's far field (a few hundred N/m³ on that
    drop) does not. Add the pinning as a yield on the phase's motion under the Kelvin force,
    with the real σ and angles, then set the gain to the physics and re-read every look with
    a magnet.
  - **29c-3. The solver's saturation knee is at 9 mT, EFH1's at 17.** ψ = E b²/(1 + b/Bs)
    meets its plateau at b = Bs/2, 9 mT; a Langevin EFH1 (Ms 440 G, χ 2.64) at μ₀Ms/χ =
    16.7 mT, so nearer a magnet than that the solver's pull is under the real one, by about
    twice at the hand's magnet. It never shows in the pull (the guard is the speed there,
    29c-5), only in how saturated the maze reads the field (phaseMu's `sat`), which every
    labyrinth look is tuned on: move Bs to the physics with the maze looks re-read.
  - **29c-4. The ferrofluid in a rim cell rides the cell's mean velocity, not its own
    column's.** Tried in #373 and dropped (the story in `docs/plan-shipped.md` §29c): replacing a
    rim cell's velocity with the body's Gaussian mean (`phaseVelocity`) packed a pressed pool
    (`ferropress` middle 1.025 of full, lifted ring 0.046) and raised 23 domes with no magnet on
    the Mac (`spikes`), while a first-order least-squares fit of the body's velocity and gradients,
    read as a drift flux `φ(1 − φ)(u_ff − u_mix)` (`phaseDrift`), only held the drop while the
    first over-compressing `phaseCompress` packed its shed tail back on; with the limiter-matched
    compression it still shed (half-full cells 100 → 32, lag 2.49R), so the carry is the mixture's
    velocity again and the trailing-rim loss is open under **29c-8**.
  - **29c-5. The hand's speed limit is the grid's.** A real drop under a hand's magnet is
    pinned to it, its Darcy speed under the Kelvin force metres a second (`npm run magnetgain`
    prints each magnet's); the solver's is MAGNET_CELLS, 2.4 cells a step, 0.375 of the plate
    a second on 384² and 0.19 on 768². The hand's own carry already takes substeps for its speed
    (handSubs, up to CARRY_SUBSTEPS at CARRY_COURANT of a cell each): the magnet's asked cells a
    step should set the phase's substeps the same way, with the velocity's own advection checked at
    that speed.
  - **29c-6. The projection reads one mobility.** thinProject takes u = u* − ∇p with the one
    coefficient for every cell, so the pressure that pushes the oil out of a moving drop's way
    moves the oil no more easily than the ferrofluid, where the real oil gives way ν_ff/ν_clear
    (4.48) times as easily. A circular drop driven by a body force f in the gap goes at
    f h²/(12(μ_ff + μ_clear)), its inside under one pressure gradient and the oil's return flow
    a dipole round it: 0.82 of the ferrofluid's own Darcy speed at that ratio, and half of it
    with the oil as hard to move as the ferrofluid. With every cell relaxed to its Darcy speed
    each step the solver's drop would go at that half; its oil's velocity persists between steps
    (the oil's drag relaxes it more slowly than the ferrofluid's), so under `npm run magnetgain`'s
    weak magnet (0.08 at depth 0.2) the drop goes 0.0114 of the plate a second against the
    two-liquid law's 0.0130 (-13% apart). The fix is a mobility per cell in the projection,
    ∇·(k(φ)∇p) = ∇·u* with k the inverse of the cell's viscosity, which costs the pressure solve
    its constant coefficient (the same stencil with k on each face, and a multigrid that
    coarsens it). Until then magnetgain reads the drop's speed against the two-liquid law, with
    the rim's own factor `share·(ν_clear/ν_ff)^(1−φ)` applied per cell as the shader applies it,
    and a bar of 20% (the weak drop reads about -6% on software WebGPU, the strong one about +4%).
  - ~~**29c-7. A resting drop dissolves into its halo.**~~ **Shipped** (#373; `npm run ferrorest` 4/4; the deep plate's `phaseCH` stays as on `main`, under **29c-1**). Story in `docs/plan-shipped.md` §29c-7 (moved 2026-10-29, 19m-2).
  - ~~**29c-8. A dragged drop loses its trailing rim to the oil's return flow.**~~ **Shipped** (#495; two-phase carry, `phaseVelocity` in `src/gpu/wgsl/fluid.ts`; `npm run ferrodrag` 3/3 on the Mac GPU). Story in `docs/plan-shipped.md` §29c-8 (moved 2026-10-29, 19m-2).
  - ~~**29c-10. `ferrodrag` joins CI.**~~ **Shipped** (`npm run ferrodrag` on the show shard, `ferrohold` 5/5 on Metal). Story in `docs/plan-shipped.md` §29c-10 (moved 2026-10-29, 19m-2).
  - ~~**29c-11. On Metal, the Thin-Gap-off line cannot tell the review's fix from its absence.**~~ **Shipped** (`npm run ferrodrag -- --thinoff` in CI, Metal 5/5). Story in `docs/plan-shipped.md` §29c-11 (moved 2026-10-29, 19m-2).
  - **29c-12. Key `phaseVel()`'s default off `thinLive` before `phaseCompress` reaches the deep plate.**
    `runPhaseCompress` and `runPhasePlanned` call `phaseVel()` with `thin = true`, which today runs only
    on a thin step. Once `phaseCompress` moves onto the deep plate (29c-1), that default must be keyed
    off `thinLive`, or the stale `phaseVelT` comes back there; `ferrodrag -- --thinoff` would catch the
    carry, not necessarily the compression.
  - **29c-9. Replace `phaseVelocity`'s local window reconstruction with a coupled two-fluid velocity
    solve.** `phaseVelocity` (29c-8) is a named shortcut: instead of solving two coupled momentum
    and Darcy-projection equations for `u_ff` and `u_oil` across the diffuse interface (with
    interfacial drag and capillary stress jumping between the two phase velocities), it reconstructs
    `u_ff` in the rim from the nearby half-full body (`φ >= 0.50`) over an 11-cell Gaussian window
    and gates the pass off on labyrinth and standing-spike scenes (`cohere`). Replace the window
    reconstruction with a two-fluid velocity or slip solve so the rim's ferrofluid velocity comes
    from the momentum balance on every scene without a window or a labyrinth/spike gate. The
    leading toe's carry (`front = 0.72 · …` in `phaseVelocity`) is a tuned value, not a derived one;
    the two-fluid solve replaces it too.
- **29d. The drop's wake: the dye folding behind it, and the drop's own ripples.** In the
  gap the flow round a moving drop is the potential flow round a cylinder, so the dye
  parts at the bow, wraps the sides and closes behind as folds; and a drop jerked by the
  magnet rings at its capillary frequency, waves on its surface damped by the
  ferrofluid's viscosity. The second needs the drop's surface to carry momentum (a wave
  equation on h), not only the static balance 29a solves.
- **29e. A Ferro Drop look.** One drop, three dyes, a calm magnet walk, the closeup
  following the drop, the cells off: the owner's description as a look, on the desk and
  the phone.
- **29f. Calm control.** The drop's controls where a performer reaches them on the desk
  and the phone: how much it beads up (today Relief / 3D), where the light is, how big
  the drop is.
