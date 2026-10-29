# 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10)

This section is in 2 files, cut between items: `28-preset-palettes.md`, `28-preset-palettes-2.md`.

The owner, 2026-10-10: "Let's refactor the presets (now called preset palettes) as well
as the color palettes to account for all the new work that we've done. Improve the
current presets, create new ones, and dump ones that aren't doing anything interesting
anymore." Most of the 42 looks were tuned before the lamp ground (18b), each liquid's
own properties and colour (18d, 18d-12), the GPU reaction carried by the flow (§26),
standing domes (9t), Blow's air (15g), the controls sweep (§27) and layers on every
look (#273). The ferrofluid and Turing shader palettes are the "Palette for ferro and
Turing Print" work (#331), which also made the reaction grow at all.

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
- **28b. Colour palettes for the lamp** (**shipped**, #330). Story in `docs/plan-shipped.md`
  §28b (moved 2026-10-29, 19m).
- **28c. Open from 28a.**
  - The retired looks' cases in `seedPreset` (LiquidVisualizer.tsx) are dead; delete
    them when lane G is free (#307 held it), and drop the file's exemption in `npm run
    plate`'s retired-id walk.
  - Fillmore East is nearly black on the Mac (luma 0.05 at 40 s) with Dye Budget at 0.5
    as at 0.9. Found (28d, lab): on the lamp the back plate is a second filter in the same
    light path whatever the Blend Mode says, and its wash (emerald, purple, cobalt) is the
    complement of the front's orange, yellow and cherry: luma 0.12 and 60% near black with
    both plates, 0.48 and none with the front alone. The owner (2026-10-11) chose to wait
    for 18b-5 (two projectors whose light adds on the screen) rather than drop the second
    plate.
  - Still flat on the Mac and not retuned here: Oil Wheel (motion 0.003, a dark brown
    disc; 18b-8 lists it), Deep Ocean (three bands), Bass Drop (one red: its Squeeze only
    shows with a kick). Crowd Plate is
    a camera look and photographs static without one.
  - The gallery's 8 s frame came back empty on Classic ("no grabFrame"): the first look
    is photographed before the page can grab a frame.
  - Neon Coral Reef draws a smooth rainbow ramp across one blob (its dyes' hue walk over
    a single body); judge after #331 makes its coral grow.
  - More new looks the physics allows and none shows: salt fingers on their own
    (Double Diffusion at 1 on a still upright plate), Saffman–Taylor fingering (water
    into glycerine in the Thin Gap), a pantry dish of the liquids' natural colours (needs
    18d-12a: the automation pours colourless).
- **28d. The looks watched as shows, and the controls ranked** (the owner, 2026-10-10:
  "take a look at the visuals, create galleries, watch the streaming shows, and optimize
  the controls and presets", the shows being "real light show videos from our app").
  - *Showreel* (in progress): `npm run showreel` renders every look through the app's own
    Render a song (`window.chromaglassRender`, as `npm run render-app` checks it) to the
    same minute of a real record, on seed 1, and watches each clip as the film does.
    `showreel.yml`, by hand or a PR labelled `showreel`, six Mac runners. The song is
    Funkorama (Kevin MacLeod, CC BY 4.0), downloaded by the workflow and held to its hash:
    the shipped library is ambient and a light show is judged on a band.
  - *Before* (the film of 2026-10-07, 41 looks, band in a box): against the real shows'
    2-3 swells a minute and ~9 colour changes a minute, 18 looks swelled 0.0 a minute and
    30 changed colour 0.0 a minute; motion followed loudness second by second (r 0.34-0.67
    on all but Fractal Dream) where the real shows follow it only over sections (r -0.13
    to 0.22).
  - Then: a gallery of stills and clips, the controls ranked by how much each visibly
    changes the plate (`controls.yml`), and a ranked list of looks to fix or retire and
    controls to bring forward, for the owner to pick; each pick its own PR.
  - *Found* (the showreel of 2026-10-10, 41 looks): 28 move more in the breakdown than
    in the groove; ten open on black and lose at least half of it by 30 s; nine draw
    hairline combed lines inside the bodies; six sit on white or cream. The owner
    (2026-10-11) chose to fix every look and retire none. The black and the combed lines
    are Antigravity's, written up with times in `docs/showreel-findings.md`; the
    breakdown, Classic, the five dim looks and the four untrue names are Claude's.
  - *Fixed here* (lab numbers; each still to be judged on a Mac showreel):
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
    - **28d-A. Ten looks open on black and keep it under the music** (`docs/showreel-findings.md` §1, this PR).
      - *Why they washed to grey:* (1) `seedPreset` lays distinct dye bodies covering a small fraction of the dish (`seedMean` 0.08–0.35 on `jellyfish-bloom`, `comet`, `cyberpunk`, `galaxy`, `aurora-borealis`, `deep-ocean`, `solar-flare`), while the music's continuous injectors (`center pulse`, `bass ring`, `mid orbit`, `treble sparkle`, `swell`) and `Evolve` poured every frame without scaling by the solver's `dt` or the headroom under the look's initial fill (`seedMean`), while `stepDecay` evaporated only once per `dt`-scaled solver step. (2) `treble sparkle` mixed 50% white (`sparkCol * 0.5 + 0.5`) at `1.1` density per cell, and continuous `spray`/`splatter` styles peppered the dark void between bodies with pastel mist; `pourLiquid` also deposited emulsion `scatter` into empty water (`!hasDye`). (3) On `ferro-maze`, the front layer seeds a clear-carrier ferrofluid phase (`seedMean === 0`) over a back-layer wash, and music/Evolve poured dye into the clear phase layer, filling the black ferrofluid cells with muddy brown dye. (4) On `neon-coral-reef`, `depositChemistry` with `bath = 1` laid dye wherever Gray–Scott activator `v > 0.22` across the whole dish, including open water outside the coral bodies.
      - *What changed:* `FluidSimulation` records `seedMean` (the dish's mean density laid by `seedPreset`, or `null` when cleared by hand). Continuous music/Evolve pours and the dye-budget regulator hold `Math.min(dyeBudget, seedMean)` as their target in round 1 (`lookTarget`; round 2 scales it with the slider, below), scaling continuous pours by `dt / 0.05` and headroom (`pourRoom`) and scaling the regulator's per-step ceiling by `1 / (dt / 0.05)`; clear-phase layers (`seedMean === 0` with `phaseAmount > 0.002`) receive no continuous music/Evolve dye or emergency seed; sparse dark looks (`lampGround < 0.05` and `lookTarget < 0.45`) use `drop` instead of `spray`/`splatter` on continuous per-frame music pours; on a sparse dark look `treble sparkle` uses the palette colour `sparkCol` without `+ 0.5` white bias (round 2: every other look keeps the original); `pourLiquid` suppresses `scatter` where no dye is present (`!hasDye`); `depositChem` gates non-print bath deposition by host dye or poured reagent (`wetOnly`) and scales by headroom; and `decayDye` adds a thin-film term `surf = loss * 0.06 / (d.a + 0.14)^2` so thin mist between bodies clears faster than thick bodies.
      - *Shortcuts named:* `seedMean` headroom gating (`pourRoom`), the `dt`-scaled regulator ceiling (`regStepScale`), the thin-film decay term `surf` in `decayDye` (round 2: gated by `surfaceClear`, 0 off a sparse dark seeded look), and the `wetOnly` host gate in `depositChem` are dye-budget regulator shortcuts pending 18c-2 (pours add volume) and 18g-4 (carrier-thickness field).
      - *Round 2 (review of #401, four asks):* (1) the Dye Budget slider was dead on a seeded look from its composition up to its maximum (`min(dyeBudget, seedMean)`: a look laid at 0.47 held 0.47 from 0.47 to its top). `src/lib/dyeTarget.ts` `lookTarget` is the composition at the look's own budget (`seedBudget`, kept by `seedPreset`) and scales with the slider above it, so a preset left alone is unchanged and the whole range is live (Jellyfish Bloom, the look the review measured, has no budget of its own, so its `seedBudget` is the default 0.85, and on the plate it lays 0.47, not the 0.14 that was a slider position: it holds 0.47 at slider 0.85 and about 0.077 at slider 0.14, and its default target sits on the 0.45 `sparseDark` cliff (it laid 0.47 on one Mac load and 0.395 on the next), so on some loads the bank, sparkle and surf changes reach it and on others they leave it as it was; `handpour` asserts it is near the cliff rather than which side, and pours only on looks away from it; `npm run handpour` part 1 asserts the slider never falls as it rises, is live on a thin look, and equals the earlier target at the look's own budget, and part 2 reads it on the plate at 0.14 and 0.85). (2) A hand pour on a sparse look was drained by the regulator's `regStepScale` (up to 12.5x) and `surf`: `markHand`/`bankHand` now bank the mass a hand tool laid as extra target that decays with a 10 s time constant (`HAND_BANK_SECONDS`), so a pour the owner makes stays for a few seconds and then returns to the composition; the bank is gated to sparse dark looks, so a slider-capped seeded look keeps the regulator it had. `npm run handpour` pours with the bank off and on (ABBA, one page) and prints the share left at 1, 3 and 10 s. (3) The treble sparkle is the gentle one only on a sparse dark look (it was gentle on every look, about 9x weaker, undeclared); every other look keeps the original `treble01 * 1.1` with `sparkCol * 0.5 + 0.5`. (4) `surf` is gated by `surfaceClear` (a seeded look that is sparse dark), so on every other preset it is exactly 0 and the program is what it was (`npm run lampzero`); `npm run handpour` lists which looks the fix reaches and prints the black share at 8, 20 and 40 s off and on, and the `gallery` label photographs every preset.
      - *Round 2 shortcuts named:* the slider scale (`seedMean * dyeBudget / seedBudget`) is a ratio standing in for the volume model (18c-2), and it changes one thing on purpose: a slider position between the composition and the look's own budget, dead before, is live now; the hand bank is a decaying allowance, not carrier volume (18c-2, 18g-4); `sparseDark` is a threshold (`lampGround < 0.05`, target < 0.45), not a measured class, and a slider dragged across 0.45 switches its four gated things at once; the hand bank is bookkeeping on the dish mean, not carrier volume; the `handpour` off arm switches only the bank and `surf`, not the sparkle, `contStyle` or the slider formula; Jellyfish Bloom is not among the looks the sparse gates reach (galaxy, aurora-borealis, stardust-collapse, lumia, cell-bloom, roy are), so its slider numbers are the only ones taken on it.
      - *Measured, round 1 (taken before round 2's gates; round 2's are in the PR body)* (`npm run showreel` on Mac GPU, Funkorama 78–138 s, seed 1, 960×540 at 30 fps; black share Start / Half by / 15 s / 30 s / 45 s / 59 s, before → after): `jellyfish-bloom` 84% / 8.5 s / 20% / 3% / 4% / 4% → 85% / never / 81% / 79% / 72% / 58%; `comet` 81% / 10.5 s / 22% / 9% / 17% / 5% → 81% / never / 72% / 66% / 78% / 91%; `cyberpunk` 92% / 2.3 s / 19% / 39% / 24% / 18% → 92% / never / 70% / 88% / 66% / 58%; `bass-drop` 64% / 1.3 s / 19% / 13% / 22% / 37% → 67% / 1.8 s / 28% / 54% / 36% / 81%; `galaxy` 34% / 16.8 s / 22% / 16% / 17% / 8% → 36% / never / 25% / 32% / 36% / 32%; `aurora-borealis` 37% / 10.8 s / 20% / 26% / 28% / 22% → 37% / never / 44% / 52% / 54% / 58%; `ferro-maze` 33% / 17.8 s / 19% / 12% / 10% / 9% → 33% / 45.5 s / 19% / 17% / 17% / 14%; `neon-coral-reef` 30% / 8.8 s / 4% / 1% / 1% / 1% → 30% / never / 21% / 23% / 20% / 18%; `deep-ocean` 29% / 9.8 s / 1% / 1% / 1% / 5% → 31% / 53.8 s / 28% / 23% / 20% / 13%; `solar-flare` 27% / 11.5 s / 14% / 15% / 14% / 6% → 37% / never / 40% / 57% / 59% / 72%.
    - Left: Fillmore East waits for 18b-5 (28c). Combed lines are 28d Part B / 18e (`docs/showreel-findings.md` §2). Oil Wheel's sound patch on its motor goes with 28f.
    - Left, **Soap Film** (Claude): Thin Film is drawn only where the dye's opacity is under
      0.4, so on this look (budget 0.5, opacity ~0.94) the interference shows on the first
      sixteenth of a ramp of dye and the sheet is the look's lavender and magenta. A fix was
      tried here and taken out: Film Physics drawing the whole film as its own reflected
      light (`filmTable.ts`, thickness `-ln(1-opacity)` at 414 nm a unit, clear dye, budget
      0.25) gave Newton's series on a ramp in the lab, but it changes what Film Physics is:
      `npm run filmlook` holds the setting to recolouring the rim rainbow at the rainbow's
      brightness (the Mac: 23608 pixels changed outside the rainbow's footprint, film
      luminance 133 against 40, 4/9). Doing it means a new setting or a redefined Film
      Physics, with `filmlook` rewritten to the new contract (the check-skeptic on it), the
      desk and the phone. Not in this PR.
- **28e. A breakdown is quieter on the plate, and Classic is blobs again** (**shipped**,
  #368; the showreel's first two findings). Story in `docs/plan-shipped.md` §28e (moved
  2026-10-29, 19m).
- **28e-2. Open from 28e.**
  - The sound mappings (a look's `sceneMappings` with source `sound`, sound learn's
    triggers) and Evolve's automation read the levels, which are ranged against ceilings
    that fall back in 8 to 18 s, so a breakdown still turns them back up. Scale the ones
    that move the liquid by the passage too, look by look, measured on the showreel.
  - A render's room tracker seeds its floor at -140 dB from the first frame, which is
    silence (the analyser's window has no samples yet), and a floor only rises from
    levels near it, so it stays there for the whole render: the analyser window a render
    hears through is -120 dB wide at the bottom, where live it fits the room. Seed the
    floor from the first frame with sound, and check a render's window against live's
    (`npm run render`).
  - Live, the passage's reference is kept for the whole audio context, so a track
    mastered 10 dB quieter than the one before plays its first minute or two with gentler
    hands (0.54 a minute on, 0.78 two). Forget the reference when a song ends, from the
    song-change clock (`useSongChange`), and hold it with `npm run breakdown`.
  - Re-render the showreel after 28e lands (and after Antigravity's #348, #352, #353,
    #355), and re-score Classic and the 28 busier looks against the same minute.
- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11: use
  the patch bay so the looks answer the music more by default; the whole plate may move with
  the music on a small named set of looks, never as the default). Brief and findings in
  `docs/sound-patches.md`. Step 1: the four patches that never fire (bands names under
  `source: 'sound'`) and comet's depth of 45; sound to frame motion an opt-in per look on a
  short list, held by `npm run framesway`; Claude writes the first three looks' patches as
  the pattern. Step 2: two or three liquid patches per look from what is heard at once (the
  bands and their onsets; not song shape, which hears a section bars late: the owner,
  2026-10-11), judged on the showreel (Antigravity).
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

- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11:
  use the patch bay so the looks answer the music more by default; the whole plate may
  move with the music on a small named set of looks, never as the default; and "only use
  things that we can detect quickly and make changes that are appropriate for the music",
  so no song-shape sources for the looks). Brief: `docs/sound-patches.md`.
  - ~~28f-1 the dead patches, the named looks, the hits as a patch source (desk, phone,
    Sound learn), the first three looks as the pattern~~ (**shipped**, this PR;
    `docs/plan-shipped.md` 28f).
  - **28f-2, open (from `docs/sound-patches.md`).** Two or three liquid patches or area cords
    per look from the bands and the hits, following Cyberpunk, Poster 1969 and Lava Lamp;
    judged on a fresh showreel. The two or three patches/cords per look are wired on all
    looks in #473 and held by `npm run soundpatch` (`100 of 100 move`, `29 looks checked (+ 3
    from 25h)`), with area cords (`25h`, `lib/areaCords.ts`) on `lumia`, `poster-1969`,
    `cell-bloom`, `milk-marble` and `red-cabbage` (`25 cords on 8 looks`, `npm run areacords`),
    but **still open**: a fresh showreel and a main-vs-head film on the same looks (seed 1,
    band in a box) are still owed, and 27 of the 28 changed looks still miss one or more of
    the 28i film bars (`2–3.5 swells a minute`, `at least 6 colour changes a minute`, `r1 in
    [−0.13, 0.22]`; per-look numbers under 28i-3).
  - ~~**28f-3.** Ten looks still sway the dish's turn with the music through the old
    `audioMappings.rotation` slot (27a-8). The owner's rule now says which: whole-plate
    motion from the music only on the named looks (`FRAME_MOVING_LOOKS`). Read it with
    the owner (a slow turn is the oil wheel's move), then move them off or onto the list,
    and count the slot in `npm run framesway`.~~ (**shipped** with 28i-3, #473;
    `docs/plan-shipped.md` 28i-3: eight moved off `audioMappings.rotation` to `'none'` +
    liquid targets here; the other two of the ten, `timbre-shifter` in #351 and `deep-ocean`
    in #408, had already left the slot; `npm run framesway` counts the slot, 59 of 59 still).
  - **28f-4, open.** Pitch is mostly the bass line on a band (72% of the showreel song's
    frames in the octave above C1): a patch on it walks with the bass, not the melody. A
    lead's pitch needs the analyser to find the strongest note above the bass.
  - **28f-5, open (found here, for 27e-2).** The song's shape does not hear the showreel
    song's breakdown (Funkorama, 104–120 s: the kick's region 22 dB down, 12 kicks in
    14 s against 30) nor the beat's return: one drop at 7.2 s and steady after. Nothing
    patches it now, but Follow the Song and Evolve read it. `songShape.ts` is tuned on
    made-up songs; a sparse kick under a breakdown must read as the beat gone.

- **28g. Follow a known song played live, by what is heard, not by the clock** (the owner,
  2026-10-11: "if we pre record the shape of the song, how can we map that to a different
  sounding and sometimes improvisational version of the same song?"). A song map
  (`songMap.ts`) is read by playback position, so it fits only the recording it was made
  from. Instead keep the map's harmony, follow the room by it whatever the tempo and the
  instruments, let the form change (a chorus twice, a verse left out, a solo that runs
  long), and fall back on the live song shape when the match is weak. What it buys: the
  show knows the chorus is next and can lean into the build before it is heard. Not a
  preset patch source (28f: patches use fast readings only).
  - **28g-1. The follower and its check** (**shipped**, #378; the story in
    `docs/plan-shipped.md` §28). `chroma.ts`, `songFollow.ts`, `npm run songfollow`.
  - **28g-2. Use it live, with the fallback** (**shipped**, this PR; the story in
    `docs/plan-shipped.md` §28). `followedPlace.ts`: the place the show reads a map at is
    the follower's when sure and the clock run on from the last sure place when not, with
    no map section then (the show leans on the song's shape); the desk's status bar, the
    track panel and the phone's Sound sheet say which song is followed and how sure.
    `npm run songfollow` (the place, 16 more checks), `npm run followview` (the browser).
  - **28g-3. The show leans into what the map says is next** (Pacing/sequencer), and a map
    made from a file (the band's rehearsal, last night's set; §17 "hear the set ahead").
  - **28g-4. Found along the way: the worker's sections are coarse.** On the check's song
    `segment()` (`songMapAnalysis.ts`) found six sections where nine were played, one
    "chorus" spanning verse, chorus, verse, chorus (18–73 s). The follower survives it
    (the leak finds what the form did not offer) but its jumps land best on true section
    starts; segment by the map's harmony at bar scale. Measured: on today's sections the
    jumps do nothing (no jumps, same numbers); on the record's true sections a repeated
    chorus is found 1.2 bars in against the leak's 1.4. Keep the jumps if better sections
    make them earn more, else remove them. Agreement (half of confidence) counts the weight
    on the same place in a section of the same label, so with these sections two copies of
    the chorus that the worker put in one "chorus" do not agree, and confidence after a
    jam stays near 0.5 while the follower hops between them. Agreement by the map's own
    harmony (the last four seconds the same) was tried in 28g-2 and changed no number on
    these takes; try it again with better sections.
  - **28g-5. Found along the way: another key.** A band that tunes down a half step, or
    plays the song in another key, rotates the whole profile; the follower would read it
    as a jam. Try the twelve rotations when confidence stays low and the profile is tonal.
  - **28g-6. Found along the way: maps made before 28g-1 have no harmony.** They follow
    nothing until the song is heard again and its map remade.
  - **28g-7. Found along the way: a song's show while the place is unsure.** A song show's
    actions (`useSongShows`) fire by the place, and while the follower is unsure the place
    is the clock run on from the last sure one: a guess. The map's section is withheld then
    (the sequencer runs a section stage on its own clock), but a show's "at the second
    chorus" still fires on the guess. Decide whether a show's section actions wait for the
    place to be sure, and say so on the Songs panel.
  - **28g-8. The score's nudge** (**shipped**, #375; story in `docs/plan-shipped.md` §28h).
    A nudge (`useMusicIntelligence`'s `seekBy`) moves the followed place itself:
    `FollowedPlace.resync(mapSec, now)` starts the clock there and anchors the follower,
    called directly, not through the identification effect (which leaves a sure place
    alone). The clock keeps the nudge too, so an identification while the follower is
    unsure resyncs to `offsetSec + nudge`. Open from it: the steering closes a nudged
    place back toward what the follower hears, so a nudge of a section's edge on a sure
    follower is corrected within a second (right when the follower is right, and a nudge
    that will not stay when the follower is wrong); decide whether a nudge holds the
    follower off for a few bars.
  - **28g-9. Found along the way: an intro on one held chord.** For as long as one chord
    is held (the check's intro, four bars of A minor into a verse that opens on it), no
    place in it sounds different from another, and the follower slid 1.4 bars behind into
    the verse before the next chord put it right; the place, steered rather than set,
    held the identification's clock meanwhile and jumped once. A rehearsal map made from a
    file (28g-3) can carry bar positions from the beat grid, which would fix the place
    inside a held chord.
- **28h. The score: the song drawn, its show's cues on it, and a nudge** (**shipped**,
  this PR; the story is in `docs/plan-shipped.md` §28h). Open from it:
  - **28h-1.** (**shipped** with 28g-8.) The nudge re-anchors the follower rather than
    adding an offset to it; position stays in the map's own seconds.
  - **28h-2.** Correct the score, not just the clock: drag a section's edge and save
    the map, so the next play of the song is right without a nudge. Today the nudge
    is an offset for the whole song, which fixes one late edge and moves the rest.
  - **28h-3.** A score that draws itself as an unknown song plays, from the live song
    shape (`songShape.ts`: builds, drops, breakdowns), before any map exists.
  - **28h-4.** The sequencer's own stages on the lane: a sequence started for a song
    (`startAt`) lays its stages end to end by seconds and does not follow the nudge or
    a section's time; show the stages against the sections, and let a stage advance
    on a named section ("the second chorus"), not only on any section change.
    A show started by hand from the Songs sheet keeps its own clock and reads no
    sections, so the nudge leaves it alone.
  - **28h-7.** A listen's replay and a recorded take count from the recognised
    start (`songStartMs`), not the nudged position: a take made after a nudge stores
    the unnudged start. Decide whether a take should carry the nudge.
  - **28h-5.** The remote phone (`RemoteControl.tsx`, over the show server) does not
    get the score yet; the phone layout's Play sheet does.
  - **28h-6.** A repeated section in a live take (the band plays the chorus twice)
    maps back to the same section index, so a cue on it fires once; decide with 28g
    whether a repeat should fire its cue again.
