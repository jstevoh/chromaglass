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

- **28a. Keep, improve, new, retire** (**shipped**, #330): named "Preset palettes", three looks retired through `RETIRED_PRESETS`, several improved, Lava Lamp new. Story in `docs/plan-shipped.md` §28a (moved 2026-10-29, 19m-2).
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
    - *Shipped so far*: Red Cabbage's pH colour (Beer-Lambert), Chemical Clock on the show clock, Timbre Shifter's colour from timbre alone (Cyberpunk Neon, Microscopic Chaos and Jellyfish Bloom too, unjudged, unmeasured until a Mac render), Oil Wheel, Colorful Cosmos, Deep Ocean and Galaxy retuned; Red Cabbage's "washed white for 20 s" is still not explained (lead: clear doses on the thin gap). Story in `docs/plan-shipped.md` §28d (moved 2026-10-29, 19m-2).
    - **28d-A. Ten looks open on black and keep it under the music** (`docs/showreel-findings.md` §1, this PR).
      - *Shipped so far* (#401, two rounds): why the ten washed to grey, what changed (`seedMean`, `lookTarget`, the hand bank, the sparse-dark gates), and the showreel's black share before and after. Story in `docs/plan-shipped.md` §28d-A (moved 2026-10-29, 19m-2).
      - *Shortcuts named:* `seedMean` headroom gating (`pourRoom`), the `dt`-scaled regulator ceiling (`regStepScale`), the thin-film decay term `surf` in `decayDye` (round 2: gated by `surfaceClear`, 0 off a sparse dark seeded look), and the `wetOnly` host gate in `depositChem` are dye-budget regulator shortcuts pending 18c-2 (pours add volume) and 18g-4 (carrier-thickness field).
      - *Round 2 shortcuts named:* the slider scale (`seedMean * dyeBudget / seedBudget`) is a ratio standing in for the volume model (18c-2), and it changes one thing on purpose: a slider position between the composition and the look's own budget, dead before, is live now; the hand bank is a decaying allowance, not carrier volume (18c-2, 18g-4); `sparseDark` is a threshold (`lampGround < 0.05`, target < 0.45), not a measured class, and a slider dragged across 0.45 switches its four gated things at once; the hand bank is bookkeeping on the dish mean, not carrier volume; the `handpour` off arm switches only the bank and `surf`, not the sparkle, `contStyle` or the slider formula; Jellyfish Bloom is not among the looks the sparse gates reach (galaxy, aurora-borealis, stardust-collapse, lumia, cell-bloom, roy are), so its slider numbers are the only ones taken on it. Its default target sits on the 0.45 `sparseDark` cliff (it laid 0.47 on one Mac load and 0.395 on the next), so on some loads the bank, sparkle and surf changes reach it and on others they leave it as it was; `handpour` asserts it is near the cliff rather than which side.
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

- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11:
  use the patch bay so the looks answer the music more by default; the whole plate may
  move with the music on a small named set of looks, never as the default; and "only use
  things that we can detect quickly and make changes that are appropriate for the music",
  so no song-shape sources for the looks: song shape hears a section bars late). Brief and
  findings: `docs/sound-patches.md`.
  - ~~28f-1 the dead patches, the named looks, the hits as a patch source (desk, phone,
    Sound learn), the first three looks as the pattern~~ (**shipped**, this PR;
    `docs/plan-shipped.md` 28f). Step 1 as first briefed: the four patches that never
    fired (band names under `source: 'sound'`) and comet's depth of 45; sound to frame
    motion an opt-in per look on a short list, held by `npm run framesway`.
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
    `audioMappings.rotation` slot (27a-8).~~ **Shipped** (with 28i-3, #473). Story in `docs/plan-shipped.md` §28f-3 (moved 2026-10-29, 19m-2).
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
  long), and fall back on the live song shape when the match is weak. As first written:
  each section keeps its harmonic fingerprint (a 12-note chroma profile, which survives a
  different band, tuning of the mix and instruments) and its energy, and the live audio is
  followed by online time warping, as score followers do for live players. What it buys:
  the show knows the chorus is next and can lean into the build before it is heard, where
  the live song shape hears a section bars late. Not a preset patch source (28f: patches
  use fast readings only).
  - **28g-1. The follower and its check** (**shipped**, #378; the story in
    `docs/plan-shipped.md` §28). `chroma.ts`, `songFollow.ts`, `npm run songfollow`.
  - **28g-2. Use it live, with the fallback** (**shipped**; `followedPlace.ts`, `npm run songfollow`, `npm run followview`). Story in `docs/plan-shipped.md` §28g-2 (moved 2026-10-29, 19m-2).
  - **28g-3. The show leans into what the map says is next** (Pacing/sequencer), and a map
    made from a file (the band's rehearsal, last night's set, the likeliest source; §17
    "hear the set ahead").
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
