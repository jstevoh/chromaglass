# 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10): what shipped (continued)

Part 2 of 2 of §28's archive; it begins at 28j-1. The section starts in `28-preset-palettes.md`.

## Second pass (moved 2026-10-04) (continued)

#### 28j-1. The patch list and the ferrofluid ring cross over, not cut (this PR)

The owner, 2026-10-19: "Transitions between presets are also a little jumpy here and
there." Found by blending every pair of the 32 looks (992 ordered pairs) in thirty ticks
and looking for the largest change in one tick of what the plate reads: `blendLooks`
travels every number and colour on `ease(t)`, but the lists, steps and booleans switch at
`SWITCH_AT = 0.5`, so anything riding on one of those jumps all at once there.

Two of those jumped on nearly every pair and could be fixed with no GPU:

- **Patches (`sceneMappings`).** The old look's list was the list until the midpoint and
  the new look's after, so a depth of 0.5 became 0 and another 0.5 appeared in one tick,
  on 572 pairs. `crossfadePatches` (`lookFade.ts`) matches patches by source, feature,
  setting and layer; a patch both looks carry moves from one depth to the other on the
  same ease, a patch only the old one carries fades out and one only the new one carries
  fades in. The identity includes the layer on purpose: a patch for layer 2 and the
  same patch for layer 3 are two patches. Measured over all 992 pairs, the largest depth
  step in one of thirty ticks is **0.500 before and 0.025 after** (bar 0.06, `desk`).
- **The ferrofluid ring (`phaseAmount`).** The handoff lays the new look's ring in one
  frame at p = 0.5 (or clears it), while the drawn `phaseAmount` was part-way between the
  two looks' values, so the plate showed a ring of the wrong strength for the rest of the
  fade, or none that then appeared whole. `ringDip` (`lookFade.ts`, used by `lookFadeStep`
  when the change swaps the ring: Go, Back and Send to wall) takes the old look's amount
  to nothing before the swap, holds it there across a flat bottom (0.1 of the eased fade
  either side of the middle) and brings it up on the new look's own value after. The bottom
  is flat because the swap lands on a render frame, drawing whichever 33 ms tick came last,
  and the handoff's clock starts before the fade's: a pointed V still drew **0.090** of the
  amount at the swap (Magnet Garden to Classic) one tick before the middle, which a first
  version of the check missed by sampling only half a tick. Measured as the largest amount
  drawn anywhere within a tick either side of the swap: **0.852 before (Magnet Garden to
  Ferro Paint), 0.000 after** (bar 0.01). A slider the player is holding keeps its own
  value on a Back (`held`, as every other setting does); on a Go it is overwritten, as it
  was. A fade under a second (a set item can ask for 0.5) keeps its straight line, because
  the handoff never runs shorter than a second and the dip would be over before the swap.
  A magnet held over ferrofluid, or a pour from the bottle, turns Ferrofluid up whenever the
  amount reads 0, so both wait while a look is fading (`magnetInHand`, `ferrofluidPoured`);
  otherwise they would write 0.6 into the bottom of every dip.

The patch crossfade is in `blendLooks` itself, so a new song's look and Lucky get it too;
only the ring's dip is limited to the changes that run the handoff. Those unattended changes
keep the ring's amount on a straight line, since they have no swap to hide, and a control in
`desk` proves it (the two jump checks fail on the old `lookFade.ts`: 46 of 48 pass there).

What is not fixed is PLAN 28j-2 to 28j-5.

### 28k. Splodascope: a crowd of oil drops that do not merge (asked 2026-10-25)

**28k-1. Film Hold and the Splodascope look** (shipped). The owner sent a photograph of a
splodascope (round cells of yellow, green, red and pink oil packed edge to edge in blue water,
some inside others) and asked for a look like it, or the physics fixed if the plate could not.

It could not. Laid as Clock Glass lays its oil, a crowd of 90 drops was 25 bodies after two
seconds and 11 after ten (lab, 192²), and every merge mixed its colours toward brown. Two
things merged them. Cahn–Hilliard charges only for boundary, so two edges a few cells apart
are cheaper as none and the part-oil between them fills in; and the capillary force is taken
from the oil blurred five cells wide (mixSmooth), which reads two close drops as one body
with a waist whose curvature pulls the waist shut. That second one is the numerical
coalescence every smoothed-interface solver has: a pair of drops two cells apart, held still,
were one body in a second even with an energy for the film many times the double well's.

Real drops hold apart because the soapy water between them pushes back as it thins (the
disjoining pressure, Derjaguin's Π(h)), so Film Hold models both halves of it. In the oil's
chemical potential (`mixMu`), an energy for water that has oil on both sides of it along a
line within FILM_REACH cells, falling by e every FILM_DECAY cells, so oil flows back out of a
thinning film. On the flow (`mixFilm`), the near-contact force of Montessori, Lauricella,
Tirelli and Succi (J. Fluid Mech. 872, 2019): each edge cell looks out along its normal
through the water, and where another edge faces it, it is pushed back into its own drop,
harder the thinner the film. The pair two cells apart then held a film of c ≈ 0.1 for the
whole run. Two fixes came from `npm run filmhold`'s lone drop: part-oil cells counted as oil
saw a lone drop's own edge on both sides along its tangent (0.081 of a cell's oil changed),
and oil cells on the edge counted as film (0.026); with only oil past 0.55 counted and only
water in a film, a lone drop is identical to the last bit with the hold on and off.

The look (`src/lib/oilLay.ts`, seedPreset's 'splodascope') lays a log-normal crowd biggest
first by random sequential packing, a film apart, yellow two drops in five, with a compound
drop (a ring of water and a drop of another colour) in every other big one, at under half
Clock Glass's dye so yellow over the cobalt reads green rather than black; the bowed glass
(Plate Curve 0.45) gathers them and they pack into faceted cells as in the photograph. Its
sound patch is fast readings only: a kick presses the glass, which past what a film holds
merges a few neighbours. `npm run filmhold`: 35 → 31 bodies in six seconds with the hold,
35 → 3 without; no oil made or lost; the films not driven below empty (−0.014 at worst); a
lone drop unchanged. At the app's own grids, in the lab: 35 of 35 for four seconds at 384²,
33 of 35 for ten at 256². Pictures in the project's shared files, `splodascope/`.

## Third pass (moved 2026-10-29, 19m)

### 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10)

- **28b. Colour palettes for the lamp** (**shipped**, #330). Pastel Glow and Galaxy each
  carried White and Icy Blue, which are 0 and 26 (CIELAB ΔE) from the white lamp, so on
  a lamp look half their dyes poured invisibly; Lavender replaced White in both. Added,
  after the 17 so a saved lock keeps its index: Overhead (yellow, magenta, teal,
  ultramarine: the subtractive dishes), Ink (graphite, midnight, crimson, coffee: the
  reactions' precipitates), Pantry (the liquids' own colours) and Lava. `npm run plate`
  holds every palette to three of four colours 40 or more from black and from white
  (before: Pastel Glow and Galaxy 4/2). A track's music picks among 21 now, so a song
  identified before may land on a different palette once.

- **28e. A breakdown is quieter on the plate, and Classic is blobs again** (**shipped**,
  #368; the showreel's first two findings). The music's hands follow how loud the passage
  is, as an amplitude (`Passage`), and the bass's press reads the band over its ceiling:
  on the showreel's minute the press changed 1.44× as much a second in the breakdown as
  in the groove, now 0.54× (`npm run breakdown`). Classic: Dye Budget 0.45, Bubbles 0.05.
  Story in docs/plan-shipped/28-preset-palettes.md §28e.

## Fourth pass (moved 2026-10-29, 19m-2)

### 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10)

#### 28i. Every look judged again (the verdicts of 2026-10-19)

  Judged on the Mac gallery of 2026-10-19 (8, 20 and 40 s, `scripts/judge.mjs`'s numbers)
  against the 2026-10-11 film. Of 41 looks, 10 retire (nine in batch 1, Lumia after 28i-5), 31 stay, 21 of those reworked. The
  three faults the photos share: looks that stand still (eight under .01 gallery motion at
  20 and 40 s, four more by eye; Acid Trip reads .11 to .23), looks that lose the black
  (Classic, Galaxy, Cell Bloom drains to flat indigo, flat .21 to .81 and luma .52 to .08
  by 40 s), and looks on a white ground (Turing Print at luma .85 to .94 for 20 s,
  Sensual Laboratory, Roy at .7).

#### 28i-2. Give back the black, make the still ones move

  - ~~**28i-2. Give back the black, make the still ones move**~~ (batch 2,
    **shipped** in this PR; story in `docs/plan-shipped/28-preset-palettes.md` 28i-2): all 21 reworked looks
    meet their gallery (`8/20/40 s`) and film (`90 s`) bars; `jellyfish-bloom` appears once
    in `evolution.ts`'s `calm` bucket and `poster-1969` appears once in `sequencer.ts`'s
    `Pace` sequence. `poster-1969` now runs on a single plate (`layerCount: 1`), raising its
    12 s step rate from `15.9 steps/s` (two 384² plates) to `24.8 steps/s` (one 384² plate);
    reaching `>= 30 steps/s` (`PINNED_STEP_RATE = 30`) is open as **28i-2a** below.

#### 28i-3. Frame fixes on the eight looks and Milk Marbling's dead patch

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

#### 28a. Keep, improve, new, retire

- **28a. Keep, improve, new, retire** (**shipped**, #330). Judged on the Mac gallery of
  main (`gallery` label, 2026-10-10, `/mnt/project-files/presets-28/before/`):
  - *Named "Preset palettes"* in the menus, the desks, the phone's sheet (its tab says
    Presets, for width), the remote, the MIDI surface and the guide (the owner's pick).
  - *Retired*, each id mapped to its nearest look in `RETIRED_PRESETS` (src/presets.ts),
    so a set list, MIDI pad, sequence stage, song show or `?look=` link naming it plays
    the replacement (`findPreset`; `npm run plate`): Sunny Side Up → Colorful Cosmos (the
    same soft static pink), Boiling Point → Aurora Borealis (the same greens and pace),
    Glycerine Drift → Classic (one flat blue-to-magenta gradient). Saved presets keep
    their own copy and are untouched.
  - *Improved*: Cyberpunk Neon and Timbre Shifter drew a conic rainbow through every
    clear patch (the LED platform's `cyberpunk` and `rainbow` modes: a colour picker
    under the glass); now Cyberpunk is neon on black (luma 0.53 → 0.14 at 40 s, which is
    the look) and Timbre Shifter a cyan-violet marble (0.30 → 0.61). Jellyfish Bloom sat
    two bells on an empty plate (flat 0.61 → 0.51) and Cell Bloom drained by 40 s (more
    drops, slower evaporation: motion 0.015 → 0.057). Fillmore East and Clock Glass run
    Dye Budget 0.5 instead of 0.9 (18b-8), but the after gallery shows that was not why
    they are dark: Clock Glass's low luma is the black round its dish, and Fillmore stayed
    nearly black (0.064 → 0.052; 28c). Before and after at 40 s:
    `/mnt/project-files/presets-28/pairs/`.
  - *New*: **Lava Lamp**, the first look to stand the plate up (Plate Upright, Dye
    Weight, Double Diffusion: Rayleigh–Taylor plumes warmed back up by the lamp the
    solver keeps under the plate). Turing Print (26d) is its own thread's (#333). It needed the mix force
    waited for at opening (`Opening.gravity`; `npm run startup` on Metal caught it).

#### 28d. The looks watched as shows, and the controls ranked (the fixes made in the lab)

    - Red Cabbage: the pH indicator was a tint over the dye's own purple, which already
      blocks green, so it never turned green and pink came back purple. The dye now keeps
      its darkness and takes its pH form's colour (Beer-Lambert; each form three bands, not
      a spectrum): hues 313-295 (all purple) to 340, 328, 319, 208, 128, 35 from acid to
      base. Its "washed white for 20 s" is not explained (lead: clear doses on the thin gap).
    - Chemical Clock: the reaction ran 12 steps of 0.01 a solver step, tied to the step
      rate: a spiral every 0.73 s. Now on the show clock (0.26 reaction units a second): a
      20 s period, fronts 0.010 of the plate a second. The dish is red at rest, clear gel.
      Shortcut: the plate is a ~6 mm patch of the dish, as under a magnifier.
    - Timbre Shifter: the colour was the clock plus pitch plus timbre, and pitch (6.3 dyes,
      jumping at every chord) swamped timbre (2.7): one cyan-violet mean. A look whose colour
      follows timbre now takes it from timbre alone (Cyberpunk Neon, Microscopic Chaos and
      Jellyfish Bloom route colour to timbre and change too, unjudged); its dish no longer turns
      with the timbre. Unmeasured until a Mac render.
    - Oil Wheel: one disc, no brown LED, Lamp Warmth 0.75 to 0.3 (it took a quarter of the
      blue), and the motor at the half a turn a minute its description says (0.232; it was a
      turn every 21 minutes). Colorful Cosmos: a deeper paper (bare 0.58 to 0.36 luma; at 0.15 its grain fell under a level). Deep
      Ocean: a single deep blue LED instead of the cyan 'ocean' ramp (empty plate 0.23 to
      0.07). Galaxy: five hues instead of two (ice blue, ultramarine, magenta, amber), dye
      budget 0.35 so it is mostly void.

#### 28d-A. Ten looks open on black and keep it under the music

      - *Why they washed to grey:* (1) `seedPreset` lays distinct dye bodies covering a small fraction of the dish (`seedMean` 0.08–0.35 on `jellyfish-bloom`, `comet`, `cyberpunk`, `galaxy`, `aurora-borealis`, `deep-ocean`, `solar-flare`), while the music's continuous injectors (`center pulse`, `bass ring`, `mid orbit`, `treble sparkle`, `swell`) and `Evolve` poured every frame without scaling by the solver's `dt` or the headroom under the look's initial fill (`seedMean`), while `stepDecay` evaporated only once per `dt`-scaled solver step. (2) `treble sparkle` mixed 50% white (`sparkCol * 0.5 + 0.5`) at `1.1` density per cell, and continuous `spray`/`splatter` styles peppered the dark void between bodies with pastel mist; `pourLiquid` also deposited emulsion `scatter` into empty water (`!hasDye`). (3) On `ferro-maze`, the front layer seeds a clear-carrier ferrofluid phase (`seedMean === 0`) over a back-layer wash, and music/Evolve poured dye into the clear phase layer, filling the black ferrofluid cells with muddy brown dye. (4) On `neon-coral-reef`, `depositChemistry` with `bath = 1` laid dye wherever Gray–Scott activator `v > 0.22` across the whole dish, including open water outside the coral bodies.
      - *What changed:* `FluidSimulation` records `seedMean` (the dish's mean density laid by `seedPreset`, or `null` when cleared by hand). Continuous music/Evolve pours and the dye-budget regulator hold `Math.min(dyeBudget, seedMean)` as their target in round 1 (`lookTarget`; round 2 scales it with the slider, below), scaling continuous pours by `dt / 0.05` and headroom (`pourRoom`) and scaling the regulator's per-step ceiling by `1 / (dt / 0.05)`; clear-phase layers (`seedMean === 0` with `phaseAmount > 0.002`) receive no continuous music/Evolve dye or emergency seed; sparse dark looks (`lampGround < 0.05` and `lookTarget < 0.45`) use `drop` instead of `spray`/`splatter` on continuous per-frame music pours; on a sparse dark look `treble sparkle` uses the palette colour `sparkCol` without `+ 0.5` white bias (round 2: every other look keeps the original); `pourLiquid` suppresses `scatter` where no dye is present (`!hasDye`); `depositChem` gates non-print bath deposition by host dye or poured reagent (`wetOnly`) and scales by headroom; and `decayDye` adds a thin-film term `surf = loss * 0.06 / (d.a + 0.14)^2` so thin mist between bodies clears faster than thick bodies.
      - *Round 2 (review of #401, four asks):* (1) the Dye Budget slider was dead on a seeded look from its composition up to its maximum (`min(dyeBudget, seedMean)`: a look laid at 0.47 held 0.47 from 0.47 to its top). `src/lib/dyeTarget.ts` `lookTarget` is the composition at the look's own budget (`seedBudget`, kept by `seedPreset`) and scales with the slider above it, so a preset left alone is unchanged and the whole range is live (Jellyfish Bloom, the look the review measured, has no budget of its own, so its `seedBudget` is the default 0.85, and on the plate it lays 0.47, not the 0.14 that was a slider position: it holds 0.47 at slider 0.85 and about 0.077 at slider 0.14, and its default target sits on the 0.45 `sparseDark` cliff (it laid 0.47 on one Mac load and 0.395 on the next), so on some loads the bank, sparkle and surf changes reach it and on others they leave it as it was; `handpour` asserts it is near the cliff rather than which side, and pours only on looks away from it; `npm run handpour` part 1 asserts the slider never falls as it rises, is live on a thin look, and equals the earlier target at the look's own budget, and part 2 reads it on the plate at 0.14 and 0.85). (2) A hand pour on a sparse look was drained by the regulator's `regStepScale` (up to 12.5x) and `surf`: `markHand`/`bankHand` now bank the mass a hand tool laid as extra target that decays with a 10 s time constant (`HAND_BANK_SECONDS`), so a pour the owner makes stays for a few seconds and then returns to the composition; the bank is gated to sparse dark looks, so a slider-capped seeded look keeps the regulator it had. `npm run handpour` pours with the bank off and on (ABBA, one page) and prints the share left at 1, 3 and 10 s. (3) The treble sparkle is the gentle one only on a sparse dark look (it was gentle on every look, about 9x weaker, undeclared); every other look keeps the original `treble01 * 1.1` with `sparkCol * 0.5 + 0.5`. (4) `surf` is gated by `surfaceClear` (a seeded look that is sparse dark), so on every other preset it is exactly 0 and the program is what it was (`npm run lampzero`); `npm run handpour` lists which looks the fix reaches and prints the black share at 8, 20 and 40 s off and on, and the `gallery` label photographs every preset.
      - *Measured, round 1 (taken before round 2's gates; round 2's are in the PR body)* (`npm run showreel` on Mac GPU, Funkorama 78–138 s, seed 1, 960×540 at 30 fps; black share Start / Half by / 15 s / 30 s / 45 s / 59 s, before → after): `jellyfish-bloom` 84% / 8.5 s / 20% / 3% / 4% / 4% → 85% / never / 81% / 79% / 72% / 58%; `comet` 81% / 10.5 s / 22% / 9% / 17% / 5% → 81% / never / 72% / 66% / 78% / 91%; `cyberpunk` 92% / 2.3 s / 19% / 39% / 24% / 18% → 92% / never / 70% / 88% / 66% / 58%; `bass-drop` 64% / 1.3 s / 19% / 13% / 22% / 37% → 67% / 1.8 s / 28% / 54% / 36% / 81%; `galaxy` 34% / 16.8 s / 22% / 16% / 17% / 8% → 36% / never / 25% / 32% / 36% / 32%; `aurora-borealis` 37% / 10.8 s / 20% / 26% / 28% / 22% → 37% / never / 44% / 52% / 54% / 58%; `ferro-maze` 33% / 17.8 s / 19% / 12% / 10% / 9% → 33% / 45.5 s / 19% / 17% / 17% / 14%; `neon-coral-reef` 30% / 8.8 s / 4% / 1% / 1% / 1% → 30% / never / 21% / 23% / 20% / 18%; `deep-ocean` 29% / 9.8 s / 1% / 1% / 1% / 5% → 31% / 53.8 s / 28% / 23% / 20% / 13%; `solar-flare` 27% / 11.5 s / 14% / 15% / 14% / 6% → 37% / never / 40% / 57% / 59% / 72%.

#### 28f. (the older short version, written twice)

- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11: use
  the patch bay so the looks answer the music more by default; the whole plate may move with
  the music on a small named set of looks, never as the default). Brief and findings in
  `docs/sound-patches.md`. Step 1: the four patches that never fire (bands names under
  `source: 'sound'`) and comet's depth of 45; sound to frame motion an opt-in per look on a
  short list, held by `npm run framesway`; Claude writes the first three looks' patches as
  the pattern. Step 2: two or three liquid patches per look from what is heard at once (the
  bands and their onsets; not song shape, which hears a section bars late: the owner,
  2026-10-11), judged on the showreel (Antigravity).

#### 28g. (the older short version, written twice)

- **28g. Follow a known song played live, by what is heard, not by the clock** (the owner,
  2026-10-11: "if we pre record the shape of the song, how can we map that to a different
  sounding and sometimes improvisational version of the same song?"). Today a song map
  (`songMap.ts`) is read by playback position (`sectionAt`, `energyAt`), so it only fits the
  recording it was made from. Instead: keep the map as sections with each one's harmonic
  fingerprint (a 12-note chroma profile, which survives a different band, tuning of the mix
  and instruments) and its energy; follow the live audio by online time warping (as score
  followers do for live players), so a slower or faster take still lines up; model the song
  as sections that may repeat, stretch or be skipped (a solo that runs long, a chorus played
  twice), not as one timeline; and fall back to the live song shape when the match is weak
  (a jam the map never heard). What it buys: the show knows the chorus is next and can lean
  into the build before it is heard, where the live song shape hears a section bars late.
  A map made from the band's own rehearsal or last night's set is the likeliest source.

#### 28f-3. Ten looks still sway the dish's turn with the music

  - ~~**28f-3.** Ten looks still sway the dish's turn with the music through the old
    `audioMappings.rotation` slot (27a-8). The owner's rule now says which: whole-plate
    motion from the music only on the named looks (`FRAME_MOVING_LOOKS`). Read it with
    the owner (a slow turn is the oil wheel's move), then move them off or onto the list,
    and count the slot in `npm run framesway`.~~ (**shipped** with 28i-3, #473;
    `docs/plan-shipped/28-preset-palettes-2.md` 28i-3: eight moved off `audioMappings.rotation` to `'none'` +
    liquid targets here; the other two of the ten, `timbre-shifter` in #351 and `deep-ocean`
    in #408, had already left the slot; `npm run framesway` counts the slot, 59 of 59 still).

#### 28g-2. Use it live, with the fallback

  - **28g-2. Use it live, with the fallback** (**shipped**, this PR; the story in
    `docs/plan-shipped/28-preset-palettes.md` §28). `followedPlace.ts`: the place the show reads a map at is
    the follower's when sure and the clock run on from the last sure place when not, with
    no map section then (the show leans on the song's shape); the desk's status bar, the
    track panel and the phone's Sound sheet say which song is followed and how sure.
    `npm run songfollow` (the place, 16 more checks), `npm run followview` (the browser).
