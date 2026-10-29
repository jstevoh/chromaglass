# 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10) (continued)

Part 2 of 2 of §28; it begins at 28i. The section starts in `28-preset-palettes.md`.

- **28i. Every look judged again, after the lamp, the soap film and the breakdown** (the
  owner, 2026-10-19: "the presets are kinda shitty now that we've made substantial
  changes ... prune or improve all of them ... really dynamic or emotional. We need to sell
  some cool stuff now"). The 28a judging was done on the 2026-10-10 gallery; since then the
  lamp ground (18b), the quieter breakdown (28e), the closeup camera (27a-8), the soap film's
  reference (32a) and the lamp's background (`lampBg`) all changed what a look draws. Every
  look is photographed again on the Mac (`gallery.yml`, this PR labelled `gallery`) and
  given a verdict: keep, rework (with a number and the check that proves it), merge into
  another, or retire through `RETIRED_PRESETS`. Each kept look is tagged with the art pack
  it sells in (PLAN 23: Home includes one pack, Pro all). The reworks go to Antigravity as
  short briefs; this item lists them as they are briefed.

  Judged on the Mac gallery of 2026-10-19 (8, 20 and 40 s, `scripts/judge.mjs`'s numbers)
  against the 2026-10-11 film. Of 41 looks, 10 retire (nine in batch 1, Lumia after 28i-5), 31 stay, 21 of those reworked. The
  three faults the photos share: looks that stand still (eight under .01 gallery motion at
  20 and 40 s, four more by eye; Acid Trip reads .11 to .23), looks that lose the black
  (Classic, Galaxy, Cell Bloom drains to flat indigo, flat .21 to .81 and luma .52 to .08
  by 40 s), and looks on a white ground (Turing Print at luma .85 to .94 for 20 s,
  Sensual Laboratory, Roy at .7).

  - ~~**28i-1. Retire nine**~~ (Antigravity, batch 1, **shipped** in #408; story in
    `docs/plan-shipped.md` 28i-1): nine ids through `RETIRED_PRESETS`, every check that
    named one on its replacement. What it found is **28i-6**.
  - **28i-5. Retire Lumia** (→ `velvet-underground`; Claude first). `'lumia'` is also the
    lamp's Lumia setting and mixer mover (`plateSources.ts`, `mixer.ts`), and `plate` 5b
    fails on any quoted retired id in src/, so retiring the look trips it on the layer.
    5b learns to tell a preset id from a setting key (named under `Check changes:`, its
    reach unchanged for preset ids), then the look retires.
  - ~~**28i-2. Give back the black, make the still ones move**~~ (batch 2,
    **shipped** in this PR; story in `docs/plan-shipped.md` 28i-2): all 21 reworked looks
    meet their gallery (`8/20/40 s`) and film (`90 s`) bars; `jellyfish-bloom` appears once
    in `evolution.ts`'s `calm` bucket and `poster-1969` appears once in `sequencer.ts`'s
    `Pace` sequence. `poster-1969` now runs on a single plate (`layerCount: 1`), raising its
    12 s step rate from `15.9 steps/s` (two 384² plates) to `24.8 steps/s` (one 384² plate);
    reaching `>= 30 steps/s` (`PINNED_STEP_RATE = 30`) is open as **28i-2a** below.
  - **28i-2a, open. Poster, 1969's step rate on a single 384² plate.** Measured over 12 s
    (`squeeze` harness), `poster-1969` on `main` ran `layerCount: 2` (`2 × 384²` thin-gap
    plates = 12 GPU solver steps per render frame at the 6-substep cap), stepping at
    `15.9 steps/s` (`191 steps / 12 s`, `simMs = 45.2 ms`, `2.05 substeps/frame`, `7.8 fps`).
    Moving `poster-1969` to a single plate (`layerCount: 1`, matching its 28i-1 description
    `"Poster, 1969 draws on one plate"`) cuts its GPU solver work in half and raises its
    12 s step rate by +56% to `24.8 steps/s` (`298 steps / 12 s`, `simMs = 24.1 ms`,
    `2.00 substeps/frame`, `12.4 fps`), still below `PINNED_STEP_RATE = 30` (`>= 200` steps
    in a 6.67 s window) because the governor stays on the `384²` rung where each thin-gap
    step takes ~12 ms on an integrated GPU. Stepping down to the `256²` rung on a single
    plate reaches `35.2 steps/s` (`422 steps / 12 s`, `simMs = 11.4 ms`, `1.88 substeps/frame`,
    `18.7 fps`), clearing `30 steps/s` with +17% margin; `governor.ts` needs a step-rate /
    `simMs` downshift rule (or a `256²` start when `simMs > 16 ms`) so single-plate thin-gap
    looks reach `PINNED_STEP_RATE = 30`.
  - **28i-2b, open. The projector check cannot see a left/right shift of 0.2 or less.**
    `scripts/webgpu-smoke.mjs`'s "the projector places the picture on the wall" probes only the
    top rows and the middle, so a sideways shift of the picture by 0.2 of the frame or less
    reaches neither (mutation run in a cloud session on Classic's opening, review of #523: pin
    ignored, picture 0.2 up or down, half size, 0.3 sideways and a blackout that is ignored
    all fail; 0.2 sideways passes). The frame is lit by construction now (the LED floor), so
    a column probe closes it cheaply: the left 4% of columns lit when unpinned and dark when
    pinned inside the frame, beside the top-rows probe. A check change: name its bar and
    input in the PR body, and run the same mutations to show 0.2 sideways now fails.
  - **28i-3. Sound on the liquid, not the frame** (batch 3, **open for the film measure**;
    frame fixes on the eight looks and the Milk Marbling dead-patch fix **shipped** in #473,
    story in `docs/plan-shipped.md` 28i-3).
    - ~~**Frame fixes on the eight looks and Milk Marbling's dead patch**~~ (**shipped** in
      #473): Galaxy (`energy`), Cyberpunk (`complexity`), Acid Trip (`energy`), Aurora
      (`energy`), Solar Flare (`bass`), Fractal Dream (`treble`), Neon Coral Reef (`timbre`)
      and Stardust Collapse (`bass`) moved `audioMappings.rotation` to `'none'` and onto
      liquid targets (`npm run framesway` counts the slot, 59 of 59 still; the other two of
      28f-3's ten, `timbre-shifter` in #351 and `deep-ocean` in #408, had already left the
      slot). Milk Marbling's `treble → airVelocity` at depth `.02` (gated to `0` under `0.1`
      in `LiquidVisualizer.tsx:4257`) is replaced with two area cords on its food-colouring
      spots (`npm run soundpatch` §1 folds each patch on the look's own settings too, 100 of
      100 move).
    - **28i-3b, open (with 28f-2).** Every look that hears sound now carries two or three
      fast liquid patches or area cords from `hits`, `bands`, onsets and notes only (#473;
      `npm run soundpatch` §2 counts both plate-wide liquid patches and area cords on fast
      readings toward the two or three, and holds area looks free of redundant plate-wide
      patches; `npm run areacords` holds 25 cords on 8 looks: `velvet-underground`,
      `jellyfish-bloom` and `bass-drop` from #454, plus `lumia`, `poster-1969`, `cell-bloom`,
      `milk-marble` and `red-cabbage`). **Still open:** a fresh showreel (28f-2) and a
      main-vs-head film on the same looks (seed 1, band in a box) are still owed, and 27 of
      the 28 changed looks still miss one or more of the **film bar** (**2–3.5 swells a
      minute, at least 6 colour changes a minute, r1 in [−0.13, 0.22]**):
      `classic` (`3.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.10`),
      `comet` (`2.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.51`),
      `galaxy` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.06`),
      `cyberpunk` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.78`),
      `acid-trip` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.15`),
      `microscopic-chaos` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.45`),
      `aurora-borealis` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.10`),
      `solar-flare` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.46`),
      `fractal-dream` (`4.8 swells/min`, `11.6 colour changes/min`, `r1 = 0.00`),
      `neon-coral-reef` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.22`),
      `stardust-collapse` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.30`),
      `lumia` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.19`),
      `turing-print` (`2.7 swells/min` on 66 s / `0.0` on 30 s, `0.0 colour changes/min`, `r1 = 0.16`),
      `poster-1969` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.27`),
      `macro-bead` (`2.9 swells/min`, `2.9 colour changes/min`, `r1 = 0.39`),
      `cell-bloom` (`1.9 swells/min`, `0.0 colour changes/min`, `r1 = -0.64`),
      `lace-run` (`0.0 swells/min`, `5.8 colour changes/min`, `r1 = 0.31`),
      `crowd-plate` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.51`),
      `milk-marble` (`1.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.17`),
      `soap-film` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.07`),
      `oil-and-water` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.27`),
      `red-cabbage` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.07`),
      `chemical-clock` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.56`),
      `magnet-garden` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.19`),
      `home-movie` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.01`),
      `clock-glass` (`3.0 swells/min` on 40 s / `0.0` on 30 s, `0.0 colour changes/min`, `r1 = 0.10`),
      `ferro-paint` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.03`),
      `roy` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.08`).
  - **28i-4. Soap Film** waits on PLAN 32 drawing the film's interference colours (today:
    magenta cells, no rainbow); then four or more hues on the film.

  - **28i-6. What retiring nine left a check or a page standing on** (found in 28i-1;
    whoever has credit). Each is a shortcut or a gap the retirement made, named so it
    is not found twice: (a) **no look ships the camera pass any more** (`camera: 1`,
    `renderStyle: 'photo'` were Oil on Water's and Colorful Cosmos's alone): `wall`
    section 6 lays them on Oil & Water by hand, `controls` `all` sweeps the camera's
    controls (focus, aperture, refraction, bloom) on looks with the camera off, so they
    read as doing nothing, and `grainedge`'s `CONTROL` names Classic where Colorful
    Cosmos was, a look nobody has shown the old shader failing on; (b) **no look ships
    Two Projectors**: `wall` section 7 raises the layers and the setting itself and lays
    `fillmore-wash` on the back plate by the solver's own `seedPreset`, and nothing in
    the app lays that wash any more, so Two Projectors on another look still starts with
    an empty back plate; decide whether the setting should lay the wash. Measured on the
    Mac: with the wash the back source reads 0.575 and the front-from-wall difference
    0.342; without it the back source is the bare lamp (0.986) and the difference 0.059,
    and the section still passes, because its bars (0.004 and four times the control) do
    not ask what is on the back plate, which was true before this PR too; (c)
    ~~`squeeze` asks for Beat Squeeze 0.1 by setting, since Poster, 1969 ships it at 0~~
    (**fixed** in #408: Poster's plate stepped too slowly with the squeeze off to hold the
    check's 200 steps a window, 191 on one run and 215 on another, so the check measured
    the governor and not the press; it now runs on Bass Drop at its own 0.8, the one look
    left that ships the squeeze, the bar unchanged);
    (d) ~~`soundpatch`'s three pattern looks are Cyberpunk, Aurora Borealis and Lava Lamp
    until 28i-3 gives Poster, 1969 patches (the Fillmore had two)~~ (**fixed** in 28i-3:
    `poster-1969` carries three area cords and is in `soundpatch` `PATTERN`), and `lampjudge`'s
    owner override for the Sensual Laboratory is gone with it; (e) `evolve`/`replay`
    start from Poster, 1969 and Clock Glass where they started from the Fillmore and the
    Oil Wheel, so their seeded rolls are different rolls; (f) ~~the README's gallery
    pictures (`docs/shots`: the Fillmore, Oil on Water) are of retired looks:
    `npm run shots` on the Mac for the new set, then the README table~~ (**shipped**, #492:
    `poster-1969`, `oil-and-water`, `macro-bead` and `velvet-underground` shot on the Mac GPU
    at `seed=1`, retired shots deleted, README and guide tables updated); (g) three checks count looks and now sit near their floors: `startup` asks for
    more than 30 looks (32 ship; 31 after Lumia, 28i-5), and `disc` names its two magnet looks
    where it asked for three.

  The packs (PLAN 23; the owner's Art packs thread decides what Home keeps): Listening
  (Aurora, Oil & Water, Milk Marbling, Velvet Underground, Jellyfish Bloom, Cell Bloom,
  Clock Glass, Lava Lamp), proposed as Home's one fixed pack; Fillmore (Acid Trip,
  Fractal Dream, Classic, Poster 1969, Home Movie, Crowd Plate, Roy); Neon (Comet River,
  Solar Flare, Cyberpunk, Bass Drop, Galaxy, Stardust Collapse); Lab (Neon Coral Reef,
  Microscopic Chaos, Turing Print, Chemical Clock, Red Cabbage, Macro Bead, Lacing Run);
  Ferro & Film (Ferro Paint, Magnet Garden, Soap Film). None of the batches touches the
  gallery's grey wash (#401).

- **28j. Changing looks without a jump** (the owner, 2026-10-19: "transitions between
  presets are also a little jumpy here and there"). `blendLooks` fades every number and
  colour but switches lists, steps and booleans at the midpoint, and the handoff in
  `LiquidVisualizer` lays the new look's ferrofluid ring in one frame. ~~**28j-1. The two
  jumps a Go, a Back and a Send to wall made on every pair**~~ (**shipped**; story in
  `docs/plan-shipped.md` 28j-1): the patch list (`sceneMappings`) now crossfades by depth,
  and the ring's `phaseAmount` dips to nothing at the swap and rises on the new look's own
  value. Open, each named so it is not found twice:
  - **28j-2. The handoff's first frame.** `clearChemistry` and the fluids' `liquid.clear`
    run on frame one of every Go, so the dye's chemistry cuts while the dye thins. Needs a
    fade of the clear (the readbacks only exist on a GPU): measure the first-frame step of
    the chemistry fields on the Mac, before and after.
  - **28j-3. The paths that do not hand off.** MIDI program changes, `preset-next` and
    `preset-prev`, sound triggers and the set list's own steps call `adoptPreset` with
    no `handoff` and no `lookFadeStep` at all; a song's new look (`evolvedLook`) travels
    the numbers but not the ring. `arrive` times the black after a step; it does not
    measure a jump, so a new measure (the frame-to-frame change of the plate across the
    swap, `PW_WEBGPU=1` is not enough: it needs the app's frames) is part of this item.
  - **28j-4. The midpoint switches that show.** Of 992 look pairs the midpoint switches
    `layerCount` on 510, `blendMode` on 498, `ledPlatform` 494, `turbulenceDetail` 450,
    `viscosity` 414, `ledMode` 278, `macroMode` 174, `macroCamera` 120, `kaleidoscope` 62
    and `stockType` 62. Each is a different kind of jump (a layer appearing, a blend
    changing, the solver's viscosity stepping); none is fixed by one rule, so take the
    most-seen first and look at each on the Mac.
  - **28j-5. `audioMappings` switch at the midpoint** on 944 of 992 pairs, so the sound
    drives the old look's settings until 0.5 and the new look's after. The numbers they
    drive are mid-blend at that moment, so a mapping that swaps can pull a setting off
    its blended value by its full depth in one tick. Crossfade the depths as 28j-1 does
    the patches, and add the same step-per-tick bar to `desk`.

- **28k. Splodascope: a crowd of oil drops that do not merge** (the owner, 2026-10-25, from a
  photograph of a splodascope: round cells of yellow, green, red and pink oil packed edge
  to edge in blue water, some inside others; "if not, let's fix the physics").
  - ~~**28k-1. Film Hold and the Splodascope look**~~ (**shipped**, this PR; the story in
    `docs/plan-shipped.md` §28k). `npm run filmhold`: the look's crowd held 35 → 31 bodies in
    six seconds, the same plate without the hold 35 → 3.
  - **28k-2. Shortcuts named in 28k-1.** (a) The film is drawn as thick as the field's own
    edge (two to five cells), where a real one is tens of nanometres. (b) A film breaks when
    pressed past what it holds, which is the real threshold but not the real timing: real
    films also drain and rupture by chance, sooner when dirty or warm. Replace with a
    drainage time per contact (Reynolds' film drainage, μR²/(gap·σ)-scaled, as the research
    on bubbles and drops item 7 gives for the beads) and a rupture drawn from it.
  - **28k-3. The tiny specks.** The photograph's crowd runs down to specks a hundredth of the
    frame; the field cannot hold a drop of under about three cells (Cahn–Hilliard dissolves
    it), so the look lays nothing under a sixtieth of the plate. The beads (`beads.ts`,
    `beadDrops`) are the drops under the grid; give the look a scatter of them in the oil's
    colours once 28k-1 is judged.
  - **28k-4. Judged on the Mac** (`docs/judging.md` §79): the look beside the photograph at
    the app's own grid, and whether a kick (Plate Pressure) breaks a few films and no more.
  - **28k-5. The colours darken at the walls over time** (found here, lab at 256²): yellow
    drops go orange and brown from their edges inward over ten seconds, and green darkens,
    though the oil's own share of the dye holds (19369 → 19368). The water's cobalt meets
    each drop's colour in the edge's few cells of part-oil and the two multiply toward
    black there; pressed into a crowd, a drop is mostly edge. Measure where the colour
    goes (the dye per drop against its laid colour, the angle of its absorbance) and find
    whether it is the partition's hand-over at a held film (bodyPartition) or the edge's
    width; never by thinning the dyes further.
