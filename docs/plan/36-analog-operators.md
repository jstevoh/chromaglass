# 36. What the analog operators could not do (researched 2026-10-27)

Asked 2026-10-27: what the analog liquid light shows could not do, and what the people
who ran them wished they could. The research, in the operators' own words with a source
for each quote, is the owner's page "Limits of the Wet Show" (its notes are in the
project's shared files, `research/light-show/analog-limits.md`; the craft itself is in
`craft-and-field.md` beside it). Of 22 pains and wishes it found, ChromaGlass already
answers 12 (the heat that cracks glass, dishes that go muddy or dry, half a ton of gear,
seven-operator crews, five-hour nights alone, nothing left on film), answers 7 in part,
misses 2, and 1 (fog machines) is outside any app. The owner asked for all eight items
below to be in the plan. 36a–36d are new; 36e–36h are open items elsewhere that the
research says to move up, with the evidence, and each of those keeps its own number.

What a fix must not take away, from the same operators: the plate's own surprises ("For
me perfection equals a kind of death", Joshua White), no visible pixels, above all on
people ("no one's body looks good with pixels on it", Drippy Eye), and the hand, not a
button, making it look good. Every item here is held to those.

- **36a. A lit-stage grade** (*proposed*, M). *The pain:* analog light "is not bright, and
  it's hard for that light to live in a modern stage environment" (Mad Alchemy); one
  operator pre-records when there is "too much competition from bright stage lights"
  (Liquid Lights Bend). A video projector has the lumens, but every look is graded for a
  dark room: under a stage wash the projector's black lifts to grey, and the looks that
  lean on near-black scenes (the swells and darkness of §10) turn to a grey haze. *The
  feature:* a **Lit stage** amount in Settings → Wall (load-in, never saved into a look):
  as it rises, the dyes thicken and saturate and the bodies hold larger, so a look keeps
  its contrast on a lifted floor instead of performing black the room cannot show. A
  real projector's black under ambient light is light added to every pixel, so the
  check models it that way. *Measure:* each look rendered in the lab over a raised black
  floor (0, 5, 10 % of white added), its contrast between dye bodies and field held at 10 %
  to within a set fraction of its dark-room value with the grade on, and byte for byte
  unchanged at 0. Phone: the same amount in the phone's Wall sheet.
  *Check written first* (2026-10-27): `npm run litstage`, the contract the build is held
  to (its header). The floor is light added in light and read in CIELAB against the
  room's white; the contrast is each body pixel's ΔE from the field behind it (the same
  look over the plate with no dye). Bars from what the floor leaves of white on black:
  two-thirds at 10% (amount 1), three-quarters at 5% (amount 0.5); with nothing done the
  looks keep 47-76% at 10%, 26 of 33 under the bar. Also: thin dye still seen (95%), hues
  kept (ΔH under 10, chroma no less than the floor leaves), at 0 byte for byte the lab with
  the grade's marked lines taken out, the app's plate view fed from the Wall, and the
  field left as it is (b9: the plate with no dye moves by under 1 ΔE on average with Lit
  stage on; a first sketch that lifted the finished picture moved Velvet Underground's
  black by 55 and bought its contrast there). The amount is `OutputConfig.litStage` and
  `PlateView.litStage`. CI runs `-- --controls` (6 lines, Measure's `browser` part) until the build drops
  the flag in `scripts/checks.json`. A reference sketch that grades only the dye where it
  is decoded passes 14 of the 15 lines (all but the Wall panel's control) and fails its
  mutants; it is in the project's files (`lit-stage-36a/`). The build is Antigravity's,
  from a brief written with the check.
  - **36a-1.** ~~Measure's `lab` part is at its time limit~~ *shipped* by 19k-6 (#517), which
    split it into `lab` and `lab2` the same hour. The lit-stage controls stay in `browser`.
- **36b. Span the wall** (*proposed*, L, the Mac app). *The pain:* "The light show, as
  originally performed had no effect on large audiences" (Joshua White); "there wasn't any
  money to rent the extra projectors I knew I'd need to make a difference in that big
  hall" (Bill Ham); one operator built "a full 360-degree panorama with six projectors"
  (Liquid Lights Bend). Today a show goes to one output: Two Projectors (18b-10) is two
  lamps on one screen and §16 is two plates, and nothing in this plan blends projectors
  edge to edge. *The feature:* several outputs from the Mac app, each with its own corner
  pin and masks (the Wall's), soft-edge blending where neighbours overlap (a gamma-correct
  ramp, so the overlap is not brighter), and one plate laid across all of them, up to a
  closed ring. Read §16's open 16d and 16e first; this may belong there. *Measure:* a
  two- and three-output render whose summed light across each overlap stays within a
  few percent of the light beside it.
- **36c. A practice plate** (*proposed*, M). *The pain:* "It requires practice, speed and
  precision changing between effects live" (Heavy Light); "We struggled along for years
  and we didn't figure out the chemistry … No one wanted to tell you how any of this stuff
  was done" (Mad Alchemy). `docs/guide.md` explains every control, but nothing in the app
  teaches the strokes, and no item in this plan does. *The feature:* a short guided set,
  on the plate itself and against a song, that teaches the squash, the lift, the tilt,
  the blow and the drop one at a time, each step done when the performer has made it
  happen. Desk, iPad pad and phone alike. *Measure:* a harness that plays each step's
  stroke and sees the step advance, and a step that cannot be passed without it.
- **36d. Show the hands** (*proposed*, M). *The pain:* a lighter digital rig is "not as
  fun for the audience to watch as the analog set up" (Heavy Light); of the Joshua Light
  Show today, "part of the appeal is getting a chance to see the mechanics of how White
  and team mix oils and colors in real time" (Time Out New York). A laptop on a table
  looks like someone reading email. *The feature:* an optional audience-facing view of
  the performance: the iPad pad drawn as a lit glass table with the touches and pours as
  they happen, as a Mixer row or a corner of the wall or a second output, or a camera on
  the performer through the film projector's live camera. Pairs with the hardware idea
  of a touch table in a case. *Measure:* a pad stroke appears in the view on the same
  frame it reaches the plate.
- **36e. Heat the performer rides** (moves up the Running order's step 6, roadmap S2).
  *The evidence:* heat was both the hazard and the instrument: "the heat was hard to
  control, glass cracked" (Ultramarine), and a Danish crew turned it into a stroke: "we
  deliberately blocked the air stream when we needed heat to propagate bubbles"
  (Tezcatlipoca). Step 6 is blocked on heat having a strength; the research says to
  unblock it as a performer's control: a Heat dial and a pad gesture, the lamp feeding
  heat where it is hottest, buoyant convection and a nucleation threshold boiling vapour
  bubbles while it is held and calming when released. Not a bubble sprite.
  - **36e-1. The model and its check, on the CPU (shipped).** `src/lib/lampBoil.ts` is the reference the GPU build (36e-2) is held to and `npm run boil` its judge (#352 took the buoyancy tanh out). Story in `docs/plan-shipped.md` §36e-1 (moved 2026-10-29, 19m-2). *Owed with 36e-4:* `boil`'s dry-out look-alike passes today (it throws away 1.7% of the lamp's heat, moving the ledger 0.16%, under its 3% bar); once the glass absorbs the infrared, that build adds a tighter dry-out ledger line.
  - **36e-2. The GPU build (shipped).** `src/gpu/lampBoil.ts` (`createBoilPlateGpu`), `src/gpu/wgsl/lampBoil.ts` (`BOIL_DISH_WGSL`, `PLATE_BOIL_WGSL`), the plate's `stepPlateBoil` pass in `src/gpu/fluid/passes.ts` keeping the boil's temperature in float32 (`boilAlpha.g` in `rg32float`, updating `vel.z` and taking any external write to `vel.z` more than one half-float ULP from its own), feeding `hsPour` (liquid thermal expansion in the thin gap's projection) and `air.field` (the vapour fraction shaded as H6's air, stepped before `air.splat` so `thinGap.ts` counts the steam's volume once), Kell buoyancy in `currentForces` (`src/gpu/wgsl/fluid/forces.ts` and `src/sim/stepping.ts`) scaled by `BOIL_BUOY_PER_KG_M3` ($1 / |d\rho/dT(T_{\text{ambient}})|$) while the boil runs with `clamp(temp, 0, 50)` and `maxCurrent` out of the heat's way (and today's current byte-for-byte at Heat 0), the **Heat** dial (`heat`, default 0, excluded from Evolve in `NOT_THE_LOOK`, on Settings → Lamp & Light, Perform desk, MIDI, remote and phone) and the held-hand air block (`boilHolds` on desk, iPad and phone). `npm run boilgpu` 54/54 on `apple metal-3` (`cost: 4.40 ms a step at 768 × 768 on apple metal-3, lamp on`), `npm run plateboil` 8/8 (`zero`) and 6/6 (`boil`); `docs/judging.md` §115. Story in `docs/plan-shipped.md` §36e-2.
  - **36e-2b. The live plate's boil, its check (shipped).** `boilgpu` holds the dish solver; the boil the app steps on the plate every frame
    (#718's `stepPlateBoil`, `PLATE_BOIL_WGSL`, the current beside it) had no line, and the
    review of #718 found three faults there. `npm run plateboil` (scripts/plateboil.mjs):
    *boil* (the Mac's plate shard, `rate,hold,fan,steam,writes` now out of `--owed`): a level dish of dark
    dye at Heat 1, Heat Decay at the app's 0.98, warmed at the app's longest frame (0.1 s,
    FluidSimulation's clamp) and then stepped at 1/60 s. `rate` the 1/60 s approach heats
    as the warm-up did (the hand's mean, 0.6x–1.4x, still climbing); `hold` under a held
    hand the spot reaches 100 °C and steam shows in the air field within 150 s (a site's
    superheat, about 4.3 K at the lowest under the hand, comes on top); `fan` under the fan,
    after 15 minutes, over 80 °C and under 100 °C at every read, no steam; `steam` the dye
    that leaves a ring twice the hand's size, less the ring's own drift, is what the steam's
    volume displaced (0.5x–1.5x) and arrives in the annulus beyond (0.7x–1.3x); `writes`
    30 K poured out of the fan plate's spot stays out ten 1/60 s steps later (a boil that
    keeps a private copy and writes it back passes the rest on a still level plate). An f64
    port of #718's own heat balance reads 100 °C at 258 s under the hand and 94 °C after 15
    minutes under the fan. #718's first head (cc0f6523) read 0/4 on the first four: its hand's
    plate climbed in half-float quanta to 84.8 °C at 0.1 s steps and then cooled at 1/60 s
    (vel.z is a half float: once 64 K over the room a step is 1/16 K and a frame's 0.007 K
    rounds away), its fan's stopped at 67.7 °C, and no steam. *zero* (Measure's lab2, holds on
    main): Heat 0 keeps today's current byte for byte, the tree's `currentForces` against
    today's (scripts/plateboil-today.mjs, generated from main at 50159cb) in a second lab on
    SwiftShader, three plates with a spot over the clamp's 50 K, the fluid.ts lines that
    pack its uniforms held to today's text, and FluidSimulation's `stepCurrent` against
    today's body. #718's first head read 20 084 and 20 889 values different on the upright plates and
    89 872 on the CPU; the level plate was the same (S.curBuoy is already upright ×
    Buoyancy, so #718's uncapped branch never ran there). With the 36e-2 fix in place (the
    temperature kept in `boilAlpha.g`, a float32 channel of the `rg32float` boil field, with
    writes to `vel.z` taken when more than one half-float ULP from the boil's own; `poured`
    carrying liquid expansion while the air field's rate carries the steam's volume once, with
    `stepPlateBoil` before `air.splat`; and the Kell branch gated on `A.a.z > 0.0` / `(p.heat ?? 0) > 1e-4`),
    `npm run plateboil` reads 8/8 on *zero* and 6/6 on *boil* (`rate` 0.98x, `hold` steam at
    142 s peaking 108.7 °C, `fan` 85.8 °C with 0.000 steam, `steam` 1.01x displaced and 1.00x
    arriving beyond the ring, `writes` 1.00 kept). One check-skeptic pass; its
    six findings are in the check.
  - **36e-3. One pocket, not many bubbles, on a level dish** (*open*, found building 36e-1).
    On the check's dish the first site's bubble grows across the superheated hot spot (its
    rim moves at about h_i·ΔT/(ρ_v·L), 4 cm/s) before the next site warms to its threshold,
    so the boil is one pocket that settles to a steady size, not separate bubbles that
    pulse. Real dishes have more sites (10⁵–10⁷ per m²) and dissolved air that comes out
    first; and a level dish's bubbles cannot leave. Measure what site density and spread
    give separate bubbles before the GPU look is judged, and give the vapour its own slip
    (18i's Bretherton speed) so an upright slide's bubbles rise through the liquid.
  - **36e-4. The shortcuts the model names** (*open*): the gap's vertical cells (Rayleigh–
    Bénard past Ra ≈ 1708, the Hadley shear on a level plate) and the Marangoni stress from
    hot to cold, neither in the depth average (with 18f-2); the bubble's heat taken only at
    its rim, not through the microlayer under it against the glass, and that rim as one
    bubble per cell (its area 2√(πα)·d/dx, so the boil's pace depends on the grid: the
    review measured n = 96 against 48 before the sites became a density, and 36e-2 must
    measure it again at the plate's grid); the glass absorbing none of the lamp (a dried
    spot should still heat, past 2.7 µm); T_sat fixed at 100 °C (no Laplace pressure, no
    dissolved air); one broadband infrared coefficient and one visible share; a nucleus
    born whole in one step; the heat of a bubble's last vapour (under 1% of a nucleus)
    given back when it vanishes, which no check can read in float32 and a solver could
    drop unseen; an upright dish warmer than its reservoir turns over
    through the open rim (a slide is closed at its edges; S1 wants a closed rim); and on the
    live plate's `stepPlateBoil` pass (unlike the standalone `createBoilPlateGpu` dish solver,
    which runs the full substepped minmod face-flux carry and Jacobi conduction in `r32float`),
    the plate's temperature and vapour ride the thin gap's velocity by single-step first-order
    semi-Lagrangian sampling with explicit 5-point conduction, and the boil's float32
    temperature in `boilAlpha.g` (`rg32float`) writes `vel.z` (`rgba16float`) while taking
    external writes to `vel.z` only when they differ from `boilAlpha.g` by more than one
    half-float ULP (so sub-ULP external writes are rounded to the boil's float32 copy).
  - **36e-5. The open plate's boil was never looked at** (*open*, found with 46r,
    2026-11-13). With Thin Gap off the lasting current did not read the boil at all at
    Depth Drag 0 until 46r, so Heat on that plate has had no check and no eye. The lab's
    first pictures of it (128², upright, Heat 1 under a held hand, the app's Buoyancy and
    cap; `open-plate-46r/before-after.png` in the project's files) show horizontal bands a
    cell or two apart in the dye piled at the floor, before 46r and after. Find whether
    the bands are the boil's first-order carry, the current's coarser grid or the open
    plate's wall, and either give the open plate a `plateboil` part of its own or say in
    the Heat control that the boil is the thin gap's. No shipped look runs the open plate.
- **36f. Two performers, a plate each** (moves up 14m-guest). *The evidence:* "Without
  her there to smooth transitions things would come to a halt, visually" (Heavy Light);
  Glenn McKay's crew described it as "painting with three or four hands". Build the guest
  key, and give each performer a plate of their own on the desk, so two people play one
  show without fighting over one dial.
- **36g. The room's lights follow the wall** (moves up 14q). *The evidence:* the old
  shows fought the band's own lighting: "Their lighting man wanted his toy strobe to be
  seen and kept telling us to get that crap off the screen" (Joshua White); "the bigger
  bands were carrying their own lights" (Ultramarine). Lights that fade with the wall
  turn the rival rig into part of the show.
- **36h. Layers at their own speeds** (moves up the Running order's step 7, roadmap Stage
  4). *The evidence:* Drippy Eye's dream rig "would consist of five slide projectors
  doing their own thing … we will do it someday". Today two plates at most (§16).
