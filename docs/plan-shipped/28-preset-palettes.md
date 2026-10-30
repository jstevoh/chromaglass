# 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10): what shipped

How §28's shipped items were found, built and measured. The open work is in
[`docs/plan/28-preset-palettes.md`](../plan/28-preset-palettes.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

Part 1 of 2; it goes on in `28-preset-palettes-2.md`.

## Second pass (moved 2026-10-04)

### 28. Preset palettes: the looks refreshed for what the plate does now

#### 28e. A breakdown is quieter on the plate, and Classic is blobs again (#368)

Reported by the showreel (28d, 2026-10-11): every look rendered on the Mac to the same
minute of Funkorama, which grooves at about -17 dB, drops 7 to 8 dB into a breakdown from
26 to 44 s and comes back. On 28 of 41 looks the plate moved more in the breakdown than in
the groove, and Classic, the default, scored 4 of 10: a full-frame wash with brown bubble
discs and no bodies, its motion running backwards against the music (r -0.77 over 5 s).

The suspect was the ear's auto-level chasing the quiet. Measured on that minute through
the ear a render uses (`songAudioTrack`), it was part of it, not the cause: the band
levels the hands read fell to 0.6 to 0.76 of the groove's in the breakdown while the
song's amplitude fell to 0.4 (each a decibel reading ranged against a ceiling that falls
back in 8 to 18 s), so the breakdown read quieter, just not quiet enough. The cause was
Sound Drive's bass on a thin gap, a hand on the glass that moves the liquid by the change
in its depth (the flow is the gap's rate). The route read the bass over 70 against a
ceiling of 85, so a loud groove's bass sat at full 0.55 of every second: the glass was
held flat and the kicks moved nothing. The breakdown's bass, under the line, rose and
fell with every note. Its change per second was 1.44× the groove's, and per second it
followed Classic's measured motion at r 0.74 (Roy, Red Cabbage, Clock Glass, Aurora 0.65
to 0.68; the looks that did follow the band, Acid Trip, Solar Flare, Cell Bloom, read
-0.11 to -0.44 against it). The plate's rock and cover glass, the other suspect, were
calmer in the breakdown (cover speed 9.3 cm/s against 15.4) and ran against the motion.

What changed. The ear reports how loud the passage is against the song's loud passages,
as an amplitude (`Passage` in lib/soundLevels.ts: the waveform's mean square over 2 s
against a reference that rises in 3 s and falls in 45 s), and the music's hands are
scaled by it: the pours, the bursts, the sparks' count and the bass's press. A hand
answers the sound's pressure, which is an amplitude. The levels themselves are left as
they were, because the beat clock, the meters and the mappings read them. And the press
reads the band over its own ceiling (`bassPressLevel`), so the loud groove's kicks press
and let go. The cast wire carries the passage, so the wall calms with the laptop.

Measured (`npm run breakdown`, the band's chorus, its verse 8 dB down, the chorus; and
the showreel's minute with `BREAKDOWN_SONG`): the press's change per second in the
breakdown against the groove, 1.36× before and 0.54× after on the band, 1.44× and 0.54×
on Funkorama, where the groove's own press moves 1.4× more than before; the hands'
levels 0.87× and 0.69× before, 0.37× and 0.36× after. A song quiet from its first bar
reads 0.91 (not a breakdown); the volume turned down 10 dB is learned in under two
minutes (0.54 a minute on, 0.78 two).

Classic: Dye Budget 0.45 (the default 0.85 filled the dish until the colours ran into one
wash, the fault Velvet Underground was fixed of), and Bubbles 0.05 (the brown discs were
the default 0.2, trapped air drawn dark against a full dish).

### 28f. Every look answers the music through its own patches

#### 28f-1. The dead patches, the named looks, the hits as a source, the pattern

Asked 2026-10-11 in the gallery review: the show hears the music well now, so the looks
should answer it more by default, through the patch bay; "it's ok if the whole plate
moves (or other global changes) with a small subset of presets. I just don't want this
kind of look to be a default across all presets"; and "only use things that we can
detect quickly and make changes that are appropriate for the music".

Found: four of the shelf's 17 patches never moved anything. They named a drum or a note
(`kick`, `hats`, `note`, `tonalMid`) on the `sound` source, whose features are the hook's
loudness, bass, mid, treble, energy, timbre and complexity, and the fold reads a name its
source lacks as 0: Bass Drop's kick on Plate Rock, Microscopic Chaos's hats on Beads,
Aurora's note on Comet Speed and its mids on the hue journey. Comet's timbre was patched
at a depth of 45 (meant as degrees; a depth is a share of the dial's 0..360), which threw
its heading to the clamp at any timbre. Oil Wheel's band patched onto the dish's motor,
the frame and not the liquid, and nothing held a look to the owner's rule. And a patch
could read each drum's level but not its hits: a level is loud between hits too.

Built: the four read their names from the `bands` source (Aurora's held chord now turns
the hue sooner); comet's depth is 0.125, the 45° meant. `FRAME_MOVING_LOOKS`
(lib/plateRock.ts) names the looks that may move the frame with the music: Bass Drop
alone, at Frame Sway 0.35, its kick's hit on Plate Rock. Oil Wheel's mids went into the
oil (Buoyancy). The hits are a patch source (`hits`, lib/hitSource.ts): Kick, Snare and
Hats hit, Any hit (how hard the last one landed, falling over a quarter second; read when
the onset's time moves, at the strength it was given, `OnsetState.last`, so a plate
drawing twenty frames a second still sees them) and Pitch, on the desk's patch bay, the
phone's (the same sheet) and Sound learn, with Sound Impact as its master. Beat phase
was already patchable: the Shapes source's LFOs run on the bar. Cyberpunk (kick, snare,
hats), Fillmore East (bass on the pour, a hit's stir) and Lava Lamp (the bass on the
wax's buoyancy, a held chord on the hue) are the pattern the rest follow (28f-2).

Measured: `npm run soundpatch` (new, in Measure): every patch on the shelf moves its
control (before: 4 of 17 read nothing, comet at 45; after 24 of 24); each of 160 kicks is
in Kick hit on its own frame at its strength, under a tenth of its peak 0.6 s on, over
half on 11% of a drop's frames; at one reading in three, Any hit rose for 200 of 225 hits
where the hit's own reading reached the loop for 72. `npm run framesway`: only the named
looks move the frame (before: Oil Wheel and the two show stages that play it patched
sound onto the motor), the list one of at most four, and Bass Drop's picture slides
0.53% of the plate at its peak.

### 28g. Following a known song played live

#### 28g-1. The follower and its check (#378)

The owner, 2026-10-11: "if we pre record the shape of the song, how can we map that to a
different sounding and sometimes improvisational version of the same song?" `chroma.ts`:
a twelve-note profile, read from the analyser's tonal peaks (parabolic-refined) on a
per-bin quarter-second median (drums dropped), the same arithmetic in the ear
(`AudioReading.chroma`) and in the map (`mapChroma`, stored with every new map as
`SongMap.chroma`). `songFollow.ts`: the forward algorithm over a place × tempo grid
(0.6–1.6×), the form as transitions at the map's section ends, a leak for jumps the form
did not offer, a start prior, and confidence = match quality × agreement. `npm run
songfollow` (Measure, logic): takes 15% slower and faster on other instruments 100% of
hops within a bar of the very place, tempo within 3%; a band speeding up 100 to 140 bpm
with a bar of silence, 100%; bridge skipped, chorus repeated, solo doubled, a 16-bar jam:
back within 0.7–1.8 bars; joined at the second verse, found in 1.9 bars; confidence 0.07
in the jam against 0.92 where followed. `anchor(mapSec)` is the score's nudge (28h). The
ear's frame costs 5 µs more (237 to 242 in node). Online time warping and a particle
filter were tried first and dropped (the reasons in `songFollow.ts`'s header).

#### 28g-2. The follower live, with the fallback (this PR)

Before, the place the show read a song map at was a clock from the moment the song was
identified. `followedPlace.ts` makes it the follower's place when the follower is sure,
and the clock run on from the last sure place, at the last sure tempo, when it is not;
while unsure the map's section is withheld (`section` null), so the sequencer runs a
section stage on its own clock and the show has the song's shape heard live. A map made
before 28g-1 (no harmony) is the old clock, to the bit. `useMusicIntelligence` builds one
per song and map, resyncs it when the song is identified (the fingerprint's offset starts
the clock and anchors the follower), feeds it every reading of the ear (`onReading`), and
reads it on its tick. Measured by `npm run songfollow`, 16 checks on the place:

- Identified as each take begins, the place read is within a bar of the song on 100% of
  hops on the takes 15% slower and faster, where the old clock is 9.3 and 6.8 bars out by
  the last chorus; the map's section read is the song's on every sure hop.
- Set to the follower's every answer, the place stepped by up to 0.27 and 1.29 bars between
  frames; steered (the difference closed over a second, a jump only after a second of
  being over a bar out), it makes no step on the slower take and one on the faster, from
  1.42 bars out to 0.03 (the intro's held chord).
- Deciding on the follower's confidence hop by hop, a third and a quarter made the jam
  sure for moments and the place jump 24 bars with it; 0.5 and 0.4 switched the slower
  take fifteen times. Held over 1.5 s (rising over 0.75 s), sure at 0.5, unsure under
  0.35: no switch once settled on either take, the jam unsure on 107 of its 112 hops from
  its third bar, the place running on through it without a jump.
- Two changes to the follower the place's checks found. In a jam the weight ran to the
  slowest tempo (0.99 going in, 0.62 at the chorus after): while lost (confidence under
  0.2) each place's weight is now spread over the tempos as the band was last known to
  play, and the tempo is 0.95 through the jam (without it the place was sure on 17 of the
  jam's hops and jumped 5.3 bars). And quality now rises over 1.5 s where it falls over
  3: the place was sure of the chorus after the jam 5.4 bars in, now 1.8. The follower's
  own numbers: confidence where followed 0.87–0.98 (was 0.74–0.93), in the jam 0.11 (was
  0.07), every place and relock number the same; 1.0–1.5 ms a second of sound.
- Agreement by the map's harmony instead of its section labels was tried and changed no
  number; left as it was (28g-4).

`npm run followview` (Measure, browser): the app's own band is the song, its score
rendered as Web Audio plays it and its map made from that. Tagged by name, the Perform
desk's status bar says "Following “…”: 87% sure"; the track panel (the laptop without a
desk), tagged twenty seconds into the band's verse, shows the verse while a clock from the
tag says intro, five samples of five; the phone's Sound sheet says the desk's line under
the song's shape. A song in C sharp the band never plays: "Not sure where in “…” (0%):
following its sound", the playhead keeping time. A map with no harmony: no line.

### 28h. The score: the song drawn, its show's cues on it, and a nudge (asked 2026-10-11)

The owner: now that the show hears a song and
remembers it, draw it as a score, put the sequencer's changes on the song's shape,
and during a show watch it and nudge the visuals back into step. Built on what was
there: the song map (sections and energy from the first listen, `songMap.ts`) and
the song's show (`songShows.ts`, cues that already fire "at the second chorus").
`lib/songScore.ts` draws the sections, the energy and the playhead, and places each
cue by running the scheduler itself over the song, so the picture cannot disagree
with what fires. A tap on the lane picks a section; a cue added there is pinned to
it ("this chorus only" or "every chorus"), and a song with no show gets one on the
look that is playing. The nudge moves the song's position: a beat (half a second
with no tempo), "Section starts now" (the show got there early) and "Next section
now" (the song got there first), the section ones worked out from the clock at the
press rather than the position last drawn; it lasts for that play of the song and
survives the fingerprint's re-anchoring, which is right about the audio and blind
to where the map put an edge (`SongPosition`). A nudge is a seek: lyric triggers
and a replay's gestures start from where it lands. A show the score makes by
pinning its first cue starts without fading the plate to its look. "Before the end"
cues count from one length for the runtime and the score (`songDuration`: the
track's, the show's note of it, then the map's). The desk's Score panel (Live) and the phone's Play sheet draw
the same component. `npm run score` (in Measure): every cue drawn where the
scheduler fires it, pinning, a stretched and skipped live take read through map
time, and both section nudges (a late map edge: the chorus cue at 40 s unnudged,
at 37 s when "Next section now" is pressed as the chorus is heard).

With the followed place (28g-2, #387): a nudge moves the place the follower holds
(`FollowedPlace.resync`, PLAN 28g-8), not only the clock's offset, and the score and
the shows read that place. An identification while the follower is unsure resyncs to
the fingerprint's offset plus the nudge, so a nudge survives a re-anchor.

### 28i. Every look judged again, after the lamp, the soap film and the breakdown

#### 28i-1. Nine looks retired (#408; Antigravity, batch 1 of the overhaul)

The verdicts are PLAN 28i's, from the Mac gallery of 2026-10-19. Nine ids left `PRESETS`,
`PRESET_CONTRACTS`, the inject styles and the liquid table and entered `RETIRED_PRESETS`,
each with its reason: `sensual-laboratory` → `turing-print`, `oil-on-water` →
`oil-and-water`, `colorful-cosmos` → `classic`, `agate` → `chemical-clock`,
`ferro-maze` → `magnet-garden`, `deep-ocean` → `jellyfish-bloom`, `fillmore-1969` →
`poster-1969`, `timbre-shifter` → `microscopic-chaos`, `oil-wheel` → `clock-glass`.
`sunny-side-up` still names Colorful Cosmos and so reaches Classic by two hops; the
resolver follows the chain. Lumia stays (28i-5). A saved show, a pad, a stage or a
`?look=` link that names a cut id plays the replacement.

What else moved with them: the dead seed cases of three of them in `LiquidVisualizer`
(Sensual Laboratory's and Ferro Maze's clean-glass cases went too; Turing Print keeps
its own), and the one-line hook that laid the Fillmore's second-plate wash
(`laySecondPlate`: nothing can name that look now; the `fillmore-wash` seed stays,
because `npm run wall` lays it by hand); the built-in sequences (Set Journey lost its
second Poster stage, which would have faded Poster into Poster; the stage names that
named a cut look are the replacements'), the mood buckets in `evolution.ts` (a duplicate
of a look already in the bucket where the replacement was there, so the bucket's length
and every song's pick by ISRC stay as they were), the example set, the Guide's one
sentence, and the scripts, each listed in the PR body under `Check changes:`.

What a replacement did not carry, found by running the checks that named the cut look,
is PLAN 28i-6: no look ships the camera pass or Two Projectors any more, and Poster, 1969
ships Beat Squeeze 0 and no patches where the Fillmore had 0.1 and two.

`plate` 5b needed one rewrite. Its last line compared the table's first entry with what
`findPreset` returns, which is only true while every entry names a live look; it is now
two lines, one over every retired id against the end of its own chain, written out in the
check and not taken from `livePresetId`, and one that a chain is followed the whole way.
With the resolver cut to one hop both are red (`sunny-side-up → nothing (wanted classic)`).

#### 28i-2. Give back the black, make the still ones move (this PR)

Reworked the 21 looks named in PLAN 28i-2 across `src/presets.ts`, `src/presetPlate.ts` and `src/components/LiquidVisualizer.tsx` (`seedPreset`), plus the preset-list cleanups in `src/lib/evolution.ts` (duplicate `jellyfish-bloom` removed from `calm`) and `src/lib/sequencer.ts` (`poster-1969` appears once in `Pace`, with `classic` on stage 1 and `oil-and-water` on stage 5):

- **Film near black (5th pct ≥ 20%):** `classic` (`dyeBudget: 0.18`, `evaporationRate: 0.012`, `gooeyEffect: 0.78`, `hueJourney: 2`: film near black `28%–37%`, `6 hues`), `galaxy` (`dyeBudget: 0.24`, `evaporationRate: 0.006`, `ledPlatform: false`, compact two-arm spiral seed: film near black `57%–62%`, `3 hues`), `stardust-collapse` (`dyeBudget: 0.24`, `evaporationRate: 0.011`, `hueJourney: 2`, four-colour spiral seed: gallery colours `0.384 / 0.509 / 0.552 ≥ 0.3`, film near black `43%–71%`, `3 hues`), `jellyfish-bloom` (`rotationSpeed: 0.115`, `automateRate: 0.22`, `gooeyEffect: 0.28`, `evaporationRate: 0.003`, default `0.85` budget, radial-weighted dome/tentacle seed with `seedMean ≈ 0.45 < 0.85`, keeping #454's area cords: gallery flat `0.178 / 0.237 / 0.258 ≤ 0.4`, motion `0.0779 / 0.0545 / 0.0355 ≥ 0.02`, film near black `42%–57%`, `3 hues`), and `bass-drop` (`globalSpeed: 0.022`, `advection: 0.62`, `damping: 0.82`, `platePressure: 0.05`, `turbulenceScale: 0.08`, `evaporationRate: 0.020`, `dyeBudget: 0.24`, `beatSqueeze: 0.8`, `beatAccent: 1.0`, `kickBloom: 0.06`, `frameSway: 0.35`, default `plateRock` `0.45` with `kickHit → plateRock 0.5` keeping `npm run framesway` peak slide at `0.343%` as on `main`, `glassSmear: 0.0` resting under the `0.20` smear gate until `bands:hats 0.15` and `hits:hatsHit 0.16` open it together in the chorus, `kickHit → areaPour[1] 0.45`, keeping #454's area cords: film near black `49%–88% ≥ 20%`, `peak × median = 3.1 ≥ 2.5`, `4.0 swells/min`).
- **Cell Bloom (`flat ≤ 0.4`, `luma(40s) ≥ 0.5 × luma(8s)`):** `centerGravity: 0.75`, `buoyancy: 0.05`, `evaporationRate: 0.0`, `dyeBudget: 0.85`, `automateRate: 0.35`, `rotationSpeed: 0.18`, and two concentric rings of multi-hue cellular drops around the area pools in `seedPreset`: gallery `8/20/40 s` `L0.427 F0.185 | L0.333 F0.175 | L0.314 F0.056` (`flat ≤ 0.185 ≤ 0.4`, `luma(40s) = 0.314 ≥ 0.214 = 0.5 × luma(8s)`).
- **Cyberpunk (`95th-pct near black ≤ 60%`, `≥ 3 hues`):** `evaporationRate: 0.005` (was `0.05` on treble density, which dried the dish to 99% black and 1 blue hue), `dyeBudget: 0.70`, `density: 'bass'`, `hueJourney: 2`, `automateRate: 0.26`, and 8 neon arcs across pink, cyan, purple and lime: film near black `18%–48%` (`95th pct = 48% ≤ 60%`) and `3 hues`.
- **Off-white grounds (`turing-print`, `roy`, `red-cabbage`, `lava-lamp`, `milk-marble`):** `turing-print` keeps `lampGround: 1`, `ledPlatform: true`, `ledColor: '#ffffff'`, `chemistry: 1`, `chemistryPattern: 1`, `turingPrint: 1`, `turingDrift: 0.7`, `exposure: 0.7`, `automateRate: 0.16`, `rotationSpeed: 0.035`, sets `PRESET_CONTRACTS['turing-print'] = [16, 19, 8, 22]`, and seeds 8 four-colour CIMA spots in `seedPreset`: gallery `8/20/40 s` `L0.089 C0.485 | L0.070 C0.420 | L0.086 C0.437` (`colours ≥ 0.42 ≥ 0.3` by 8 s, `luma ≤ 0.089 ≤ 0.6`); `roy` sets `dyeBudget: 0.68`, `automateRate: 0.28`, `evaporationRate: 0.0006`, `centerGravity: 0.28`, `buoyancy: 0.28`, `advection: 0.42`, `platePressure: 0.38`, and adds 6 primary comic shapes around its 3 core pools with blue kept apart from red and yellow so `royopen` holds `0.2%` stain (`6/6`): gallery `8/20/40 s` `L0.537 F0.273 | L0.501 F0.305 | L0.515 F0.280` (`flat ≤ 0.305 ≤ 0.5`, `luma ≤ 0.537 ≤ 0.6`); `red-cabbage` sets `lampGround: 1`, `ledPlatform: true`, `ledColor: '#e8dff5'`, `phIndicator: 1`, `exposure: 0.75`, `dyeBudget: 1.1`, `automateRate: 0.24`, `rotationSpeed: 0.085`, `evaporationRate: 0.001`, `hueJourney: 2`, and seeds five additional anthocyanin pH zones around its two acid/base wells: gallery `luma = 0.189 / 0.199 / 0.232 ≤ 0.5` and film `5 hues ≥ 3`; `lava-lamp` sets `lampGround: 1`, `ledPlatform: true`, `ledColor: '#b58c5c'`, `exposure: 0.46`, `centerGravity: 0.32`, `buoyancy: 0.42`, `advection: 0.48`, `automateRate: 0.30`, `dyeBudget: 0.65`, and seeds eight translucent wax plumes (`seedMean ≈ 0.37` with initial thermal rise and sink so convection is visible by 8 s without Beer-Lambert blackout): gallery `8/20/40 s` `L0.374 C0.978 M0.0739 | L0.471 C0.993 M0.0462 | L0.500 C1.000 M0.0313` (`luma ≤ 0.500 ≤ 0.6`, `motion ≥ 0.0313 ≥ 0.02`); `milk-marble` sets `lampGround: 1`, `exposure: 0.72`, `dyeBudget: 1.1`, `automateRate: 0.14`, and reduces the white milk base in `seedPreset` from `3.5` to `2.1` while enlarging the six colour spots: gallery `luma = 0.340 / 0.398 / 0.459 ≤ 0.6` (`0%` white blowout).
- **Colour (`macro-bead`, `lace-run`, `chemical-clock` ≥ 6 colour changes/min):** `macro-bead` (`macroCamera: 'auto'`, `macroZoom: 2.1`, `macroHold: 2.5`, `globalSpeed: 0.06`, `automateRate: 0.45`, `rotationSpeed: 0.14`, `hueJourney: 2`, 6-hue ring seed: film `3 hues ≥ 2`, `11.2 colour changes/min ≥ 6/min`), `lace-run` (`macroCamera: 'auto'`, `macroZoom: 2.1`, `macroHold: 2.4`, `globalSpeed: 0.07`, `automateRate: 0.45`, `rotationSpeed: 0.16`, `hueJourney: 2`, 6-hue ring seed: film `2 hues ≥ 2`, `9.9 colour changes/min ≥ 6/min`), and `chemical-clock` (`lampGround: 1`, `ledPlatform: true`, `ledColor: '#fbf6ee'`, `bzReaction: 0.78`, `exposure: 0.58`, `dyeBudget: 0.75`, `evaporationRate: 0.004`, `automateRate: 0.28`, `rotationSpeed: 0.22`, `hueJourney: 1`, `bands:tonalLow → bzReaction -0.58` and `bands:tonalMid → bzReaction -0.55`, 6 translucent indicator pools with `seedMean ≈ 0.65` so `t = 8 s` reads `L0.129 C0.742 M0.0655` and `40 s` `L0.256 C0.828 M0.0683`: film `5 hues`, `11.2 colour changes/min ≥ 6/min`).
- **Microscopic Chaos (`detail ≤ half of 10-19`, `motion ≥ 0.02` at 20/40 s):** `lampGround: 1`, `ledPlatform: true`, `ledColor: '#f1ebf5'`, `boundaryContrast: 0.0`, `beads: 0.0`, `cells: 0.0`, `gooeyEffect: 0.15`, `postBlurRadius: 1.0`, `rotationSpeed: 0.30`, `exposure: 0.22`, `saturationBoost: 1.05`, `dyeBudget: 0.72`, and broad overlapping soft blobs in `seedPreset`: gallery detail `0.0073 / 0.0128 / 0.0127` vs 10-19's `0.0199 / 0.0475 / 0.0525` (`≤ 37%` at 8 s, `27%` at 20 s, `24%` at 40 s, all well under half) and motion `0.0202 / 0.0516 / 0.0573 ≥ 0.02`.
- **Gallery motion ≥ 0.02 at 20 and 40 s (`velvet-underground`, `poster-1969`, `home-movie`, `clock-glass`, `crowd-plate`, `lava-lamp`, `jellyfish-bloom`, `microscopic-chaos`):** `velvet-underground` (`layerCount: 1`, `rotationSpeed: 0.27`, `gooeyEffect: 0.55`, `exposure: 0.78`, `automateRate: 0.16`, `dyeBudget: 0.42`, keeping #454's area cords: `0.0335 / 0.0424`), `poster-1969` (`layerCount: 1`, `rotationSpeed: 0.095`, `automateRate: 0.22`, `globalSpeed: 0.022`, `advection: 0.65`, `dyeBudget: 1.1`: `0.0527 / 0.0998`), `home-movie` (`rotationSpeed: 0.165`, `automateRate: 0.20`, `globalSpeed: 0.019`, `buoyancy: 0.48`, `advection: 0.55`: `0.0433 / 0.0541`), `clock-glass` (`rotationSpeed: 0.19`, `automateRate: 0.20`, `globalSpeed: 0.022`, `buoyancy: 0.38`, `advection: 0.45`: `0.0324 / 0.0501`), `crowd-plate` (`rotationSpeed: 0.095`, `automateRate: 0.18`, `globalSpeed: 0.022`, `buoyancy: 0.45`, `advection: 0.60`, 6-spot swirled seed: `0.0327 / 0.0544`), `lava-lamp` (`0.0462 / 0.0313`), `jellyfish-bloom` (`0.0545 / 0.0355`), `microscopic-chaos` (`0.0516 / 0.0573`).
- **The projector check no longer reads the dish's weather:** `scripts/webgpu-smoke.mjs`'s "the projector places the picture on the wall" asked that over half of the frame's top rows be lit before the pin, and read them off whatever the opening look had grown. Classic's opening is dark by design here, the Mac read 49% on 05ee5f1 (show shard red), one point under a bar that is about the projector. The bar is unchanged; the check now turns the LED floor on for its measurements and puts it back, so the picture under the mapping fills the frame by construction (cloud run of the check's own block, Classic's opening: top rows 83-88% lit as it comes, 100% with the floor, pinned edge 0%, blackout 0%).
- **Poster, 1969 step-rate investigation:** Measured on this Mac over 12 s (`squeeze` harness), `poster-1969` ran `layerCount: 2` (`2 × 384²` thin-gap plates = 12 GPU solver steps per render frame at the 6-substep cap), stepping at `15.9 steps/s` (`191 steps / 12 s`, `simMs = 45.2 ms`). Moving `poster-1969` to a single plate (`layerCount: 1`, matching its 28i-1 description `"Poster, 1969 draws on one plate"`) cuts its GPU solver work in half and raises its 12 s step rate by **+56%** to `24.8 steps/s` (`298 steps / 12 s`, `simMs = 24.1 ms`). Reaching `>= 30 steps/s` (`PINNED_STEP_RATE`, as `1 × 256²` does at `35.2 steps/s`, `422 steps / 12 s`, `simMs = 11.4 ms`) is tracked as open item `PLAN 28i-2a`.

#### 28i-3. Sound on the liquid, not the frame: the eight rotation looks and Milk Marbling's dead patch (#473, with 28f-3 and 28i-6(d); 28i-3b and 28f-2 remain open in PLAN.md)

Asked in PLAN 28i-3 and 28f-3: move the eight looks that still drove `audioMappings.rotation` from sound onto liquid targets (`rotation: 'none'`), fix Milk Marbling's dead `treble → airVelocity` patch (`0.02`), and give every look that hears sound two or three fast liquid patches or area cords from `hits` and `bands` only (`docs/sound-patches.md`), using 25h's area cords (`lib/areaCords.ts`) where parts of the plate answer on their own.

What shipped in #473:
- **Eight looks off `audioMappings.rotation` (28f-3 / 28i-3):** `galaxy` (`energy`), `cyberpunk` (`complexity`), `acid-trip` (`energy`), `aurora-borealis` (`energy`), `solar-flare` (`bass`), `fractal-dream` (`treble`), `neon-coral-reef` (`timbre`) and `stardust-collapse` (`bass`) now set `audioMappings.rotation: 'none'` and route their readings into liquid controls (`buoyancy`, `turbulenceScale`, `surfactantFlow`, `injectRate`, `colorShift`, `beads`, `reactionRate`, `flowSpeed`). The other two of 28f-3's ten looks had already left the slot before #473 (`timbre-shifter` moved `rotation: 'timbre'` to `'none'` in #351 and was retired with `deep-ocean` in #408). `scripts/framesway.mjs`'s `frameRoutes` now counts `audioMappings.rotation !== 'none'` alongside `plateRock`, `frameSway` and `rotationSpeed` (`npm run framesway`: 59 of 59 looks and stages still; on `origin/main` it fails naming all eight looks).
- **Milk Marbling's dead patch fixed:** `{ source: 'sound', feature: 'treble', setting: 'airVelocity', depth: 0.02 }` moved `airVelocity` from `0` to `0.008`, which `LiquidVisualizer.tsx:4257` (`airV <= 0.1 ? 0 : ...`) gated to `0`. Replaced with two area cords on its food-colouring spots (`hits:kickHit → areaPour[0] 0.45`, `hits:snareHit → areaStir[1] 0.45`). `scripts/soundpatch.mjs` §1 now folds each patch on the look's own settings (`ownBay`) as well as on defaults and requires `|ownBay.global[m.setting] - own[m.setting]| >= 0.03 * span` and `!(m.setting === 'airVelocity' && ownBay.global.airVelocity <= 0.1)` (on `origin/main` it fails naming `reads nothing: milk-marble sound:treble on airVelocity`).
- **Area cords and colour families (`src/lib/plateAreas.ts`, `src/presets.ts`, `scripts/soundpatch.mjs`):** Added explicit disjoint `dyes` families to `lumia` (`[0]`, `[1]`, `[2]`) and `cell-bloom` (`[0, 3]`, `[1]`, `[2]`), and added `PRESET_AREAS` entries for `poster-1969` (three poster shapes: left `milk` `[0, 1]` on `bass`, right `ink` `[3, 4]` on `mid`, lower `milk` `[2]` on `treble`), `milk-marble` (three food-colouring spots in `OWN_SEED_AREAS` so `seedPreset` still lays the white milk dish and four spots: `[0, 1]` on `bass`, `[2, 3]` on `mid`, `[4, 5]` on `treble`), and `red-cabbage` (two pH wells: left `acid` `[0]` on `mid`, right `base` `[1]` on `bass`). `poster-1969` joins `soundpatch`'s `PATTERN` list (closing 28i-6(d)), and `soundpatch` §2 counts both plate-wide liquid patches and area cords on fast readings (`hits` and `bands`, including onsets and notes) toward a look's two or three while holding area looks free of redundant plate-wide patches (`100 of 100 move`, `29 looks checked (+ 3 from 25h)`).
- **Patch bay hit targets on the desk (`src/components/SettingsPanel.tsx`):** Now that `classic` and `jellyfish-bloom` carry `sceneMappings`, the `patches` deck panel renders their patch cards on load; `Remove mapping` (`h-6 w-6`), `Depth` (`set-range`), `patch-gate-on` (`h-6 w-6`) and the gate sliders (`set-range`) meet the desk's 24 px minimum hit-target rule (`npm run layout`, `npm run qa`).
- **Still open in `PLAN.md` (`28i-3` film measure, `28i-3b`, `28f-2`):** A fresh showreel (28f-2) and a main-vs-head film on the same looks (seed 1, band in a box) are still owed, and 27 of the 28 changed looks still miss one or more of the 28i film bars (`2–3.5 swells a minute`, `at least 6 colour changes a minute`, `r1 in [−0.13, 0.22]`); all 28 per-look numbers are recorded under `28i-3b` in `PLAN.md`.

### 28j. Changing looks without a jump
