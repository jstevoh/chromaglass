# 22. Spin the plate: what shipped

How §22's shipped items were found, built and measured. The open work is in
[`docs/plan/22-spin.md`](../plan/22-spin.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 22. Spin the plate

**22a, shipped (#223).** The **Spin** tool (N on the desks, a tool on the phone's dock and the
remote's pad), and **Auto Spin** (Off, Rate in rev/min either way round, Tempo at a turn
every 1–64 beats) with **Reverse Spin**, on the sheet, the phone's Play sheet, the
remote, MIDI and the desks. Off by default, so every look is as it was.

The dish is a real rotating dish, not a turned picture (`src/lib/turntable.ts`, the
`spinSwirl` kernel in `src/gpu/wgsl/fluid.ts`):

- **The glass drags the liquid round through the gap.** The bulk of the liquid follows
  the dish with the gap's drag time τ = h²/12ν: at the 6 mm rest gap water takes 3 s,
  the thick liquid 0.15 s, oil 0.06 s. The picture is the liquid, so it trails the
  glass by Ωτ at a steady turn. `npm run turntable`: 63% in one τ at any frame rate,
  the lag Ωτ to 2%.
- **Where the gap is tight the liquid is gripped harder.** What is left of the dish's
  turn after the bulk (A = Ω − ω_l) drives a swirl w with the Hele-Shaw drag
  k = 12ν/h² in each cell: dw/dt = A(k − k0) ẑ×r − k w, integrated exactly. A pressed
  palm goes round with the glass (0.86 of A r) while the plate away from it barely
  moves (0.029); a domed plate swirls at A r (1 − h²/h0²) to 1.3%; oil in water is
  gripped harder than the water (0.69 against 0.087). `npm run dish`.
- **Spun, the heavy goes out and the light comes in.** The centrifugal force on a
  density contrast β is −∇(ω² r²/2)·β: dense dye (Solutal Buoyancy's contrast) is flung
  outward and oil (12% lighter) drawn inward. `npm run dish`: +1.75e-2 and −1.12e-2.
- **Tempo is locked to the beat**, not only to its speed: the dish is steered to where
  the counted beats put it, so a knock is taken back (0.008 rad off, 20 s after a
  0.5 rad/s flick) where a motor asking only for the speed stays knocked off (0.73).
  With no beat heard it turns at the Rate; a beat once heard is held.
- The swirl only runs while the dish and the liquid turn at different speeds (or the
  liquid turns), and a tail after; otherwise it is zero-filled and skipped, and the
  flow the dye rides is a still plate's to the bit (`npm run dish`, "largest
  difference 0").
- The phone's landscape dock now goes to one row at 860 px, not 800: eleven buttons on
  the tools' side need 856. The desks' tool row wraps inside its column at 1024.

- ~~**22h. The look's own turning is still rigid.**~~ **Shipped** (#252). There is one
  dish under a plate now. The look's motor, the music routed to rotation and a flick
  turn the same glass as Auto Spin and the Spin tool; the speeds add, the liquid follows
  their sum with its drag time τ = h²/12ν, and the picture turns with the liquid alone
  (`dishFrame` in `src/lib/turntable.ts`). The twist's flick half, a stir in the current
  standing in for the drag the rigid picture was not getting, is retired: kept, it
  would have dragged the liquid twice. Measured (`npm run turntable`, checks 10–14):
  - a look nobody turns is exactly still, ten minutes at 60 fps;
  - a flick on water leaves the picture behind (0.061 of the glass's 1.83 rad/s after
    0.1 s) and it comes up to the dish on the exact answer for a coasting dish, to
    0.83% at 1 s and 3 s, at 60 and at 144 fps. On the thick liquid it is with the dish
    (0.998) within half a second;
  - a steady motor turns the picture at its speed, Ωτ behind where the rigid picture
    was (0.00299 rad on acid-trip's motor, the fastest shipped);
  - a sway every eight seconds reaches the picture at 1/√(1 + (ωτ)²) of the dish's:
    0.391 through water, 0.993 through the thick liquid.
  `npm run flick` (Mac, the tools shard) holds the frame to that arithmetic: a flick on
  water at the drag time's speed, the picture through the liquid's angle and not the
  glass's, the angle lost to the glass after two drag times to 15%, the turntable's
  share through the same water, the solver handed Ω − ω_l and no twist.

  What it changes on the shipped looks, worked out on the frame's own flywheel with a
  made-up band (galaxy, acid-trip, solar-flare, deep-ocean): on the nine thin looks with
  music routed to rotation the picture is within 0.035 rad (2°) of where the rigid one
  was, and the swirl's drive Ω − ω_l is up to 0.011 rad/s, over 1e-3 about 90% of the
  time, so the swirl runs while they play; on deep-ocean and neon-coral-reef (thick)
  it is 0.003 rad and 0.0025 rad/s. Looks with no music and a motor (most) end Ωτ, a
  few thousandths of a radian, behind. Looks that do not turn are unchanged to the bit.
- ~~**22j. The look's motor still stirs the middle.**~~ **Shipped** (#261). The
  Rotation Speed dial stirred the current round the middle as well as turning the
  dish: `rotationSpeed` × 30 in the solver's units, a swirl w(r)² fastest at the
  centre and nothing at the rim (w = 1 − smoothstep(0, 0.5, r)), on the look's own
  clock. A dish turning steadily under its liquid drags it round through the gap until
  it turns with the glass, and leaves nothing to stir, so the stir is gone from the
  solver (GPU and CPU) and the dish does what the glass does (22h's dishFrame and the
  swirl). Its speed is ω(r) = 30 · dial · w(r)² · dt · Advection · 190/192 · 60
  rad/s, and the lab held the stir to that before it went (thin gap and old plate
  alike, within 2% from r = 0.05 to 0.35): acid-trip's 0.87 rad/s at r = 0.05 where
  the formula says 0.89, 0.95 at the centre, against its motor's 0.001; Classic's
  0.0019 at the centre against 0.00008. On every look with a motor the stir moved the liquid
  twenty to a thousand times faster than the motor turned the dish. So each look's
  dial was moved up the dial to turn its dish at the mean speed the stir and the old
  motor gave the liquid in the projector's 16:9 window (the plate is drawn at 1.5
  times the window's width, so the window is the middle ±1/3 by ±3/16 of the plate;
  the stir's mean speed there is that of a rigid turn at 0.322 of its centre's), on the look's clock at rest, for the front plate: acid-trip 0.1 → 0.421
  (0.306 rad/s, a turn every 20 s), cyberpunk 0.05 → 0.287 and stardust-collapse
  0.06 → 0.282 (0.10 rad/s), boiling-point 0.218, timbre-shifter 0.202, fractal-dream
  0.187, solar-flare 0.183 (0.02–0.04 rad/s), the rest 0.008 to 0.156 (under 0.01
  rad/s), each to 3% of its target (`presets.ts`, the note above the list). And the
  music's sway no longer carries the motor: with a band routed to rotation gone quiet
  the sway is −0.8, which reversed the dial's share with the band's; harmless at a
  thousandth of a radian a second, it would have turned acid-trip backwards at 0.24
  rad/s in every quiet bar (`lookMotor`, `npm run turntable` 15). Lucky's dial rolls
  0 to 0.2 (was 0.025). A dish whose motor is over about 1.25e-3 rad/s now starts
  the swirl in its first steps (the liquid lags the dish as it comes up to speed), so
  the opening waits for `spinSwirl` on those eighteen looks (`lookOpensSpinning` in
  `gpu/opening.ts`; `npm run startup` found six of them asking for it unbuilt). Judged on the Mac, `docs/judging.md` §28.

  What it cost, timed on the GPU (`npm run swirlcost`: a run of swirl stages back to back,
  submit to done, the slope between two counts so the submit's own cost drops out), laptop
  and phone layouts, the governor's own grid (256² on CI's Mac):

  | | thirteen dispatches (before) | one (now) | GPU share now, at the steps that ran it |
  |---|---|---|---|
  | phone, nine looks (median) | 105 µs a step | 45 µs | 0.07% (14 steps/s) |
  | laptop, nine looks (median) | 272 µs | 75 µs | 0.17% (22 steps/s) |
  | Acid Trip, Cyberpunk, Stardust Collapse at #261's motors (set by hand on the build before it), phone | 97–110 µs | 41–51 µs | 0.07–0.08% |

  So it was never a frame-rate problem: under 1% of the GPU's time before, under 0.2% now,
  and the frame rate alone cannot see either. The same page alternated swirl on and off
  read 26.4 against 27.3 fps on the phone and 40.9 against 42.2 on the laptop, but each
  look's own pair scattered by five frames either way and an earlier run of the same app
  read 30.6 against 30.3. The laptop's bench is the noisier: its first form (20 and 220
  stages) read three looks in twelve negative, so the script now times 20 and 1020; the
  table's laptop row is the median of that first form.

  The cut is physics, not a shortcut. On a thin plate the swirl field is the dish's drive,
  a speed at the rest gap, handed to the thin solve with the current; the solve makes the
  whole flow conserve liquid, ∇·(hu) = 0, by its multigrid. Projecting the drive first by
  ten Jacobi sweeps of ∇·u = 0 did a weaker version of the same job with the operator that
  ignores the gap, so it is gone: one dispatch, spinSwirl alone. `npm run dish` (lab): a
  pressed palm 0.307 → 0.306 of A r, the plate away from it 6.08e-3 → 6.04e-3. The old plate
  (Thin Gap off) keeps its projection, because nothing after the swirl projects it there.

  The floor stays a speed. Set from the travel it makes in a drag time, it would have saved
  steps; at under a fifth of a percent of the GPU there is nothing worth saving, and a lower
  floor would only run the swirl on more of a song.

  - **CI's Mac grants no timestamp queries.** `chromaglassDebug().webgpu.timestamps` reads
    false there and the profiler reads nothing, so `npm run stages` and `npm run ladder`
    measure nothing on CI; only the owner's machine gives per-pass times. `benchSwirl`'s
    submit-to-done timing is the way round it for one stage.
  - **`npm run flick` read the plate between frames.** It went red once on #258 (water at
    0.117 against the drag time's 0.179) on an app it had passed an hour before: it took the
    page's clock at the read against the last frame's speeds. It now times by the plate's
    own clock (`chromaglassDebug().frameAt`) and read 0.188 against 0.188.

## Fourth pass (moved 2026-10-29, 19m-2)

### 22. Spin the plate

#### 22k. The swirl runs on every look with music routed to rotation

- ~~**22k. The swirl runs on every look with music routed to rotation.**~~ **Measured and
  cut** (#258). Since 22h a music look's dish sways under its liquid, so Ω − ω_l is over the
  swirl's 1e-3 rad/s floor nearly all the time: on CI's Mac, with the built-in band playing,
  the swirl ran on 91–100% of the nine thin looks' steps. It was thirteen dispatches a step on
  the current's half grid (spinSwirl, its divergence, ten Jacobi sweeps, the gradient).
