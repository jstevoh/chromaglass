# Default sound patches for every look (PLAN 28f)

The owner, 2026-10-11: use the patch bay so the looks answer the music more by default, "but
it's ok if the whole plate moves (or other global changes) with a small subset of presets. I
just don't want this kind of look to be a default across all presets."

Then, 2026-10-11: "I don't think we should use them [song-shape sources] as patches for the
presets. I think we should only use things that we can detect quickly and make changes that
are appropriate for the music." Song shape hears a breakdown two to three bars after it
starts (`npm run shape`), so the looks' patches use only what is heard at once: the bands and
their onsets.

This file is the brief for step 2 (the looks' own patches); step 1 is the engine.

## What is there today (main, 2026-10-11)

- 11 of 41 looks have `sceneMappings` (src/presets.ts); 30 answer the music only through the
  four fixed `audioMappings` slots (velocity, density, colour, rotation).
- Four patches never fire: they name `bands` sources (kick, hats, note, tonalMid) under
  `source: 'sound'`, and `getAudioValue` (src/constants.ts) returns 0 for a name it does not
  know: bass-drop kick->plateRock, microscopic-chaos hats->beads, aurora-borealis note->
  cometSpeed and tonalMid->hueJourney. comet's timbre->cometAngle has depth 45 against a
  documented range of -1..1.
- The patch bay (`PATCH_TARGETS`, src/lib/sceneMap.ts) refuses `frameSway` and `slosh` (both hand-only); Evolve's
  `FRAME_MOTION` hold-out (src/lib/drift.ts) is not applied to patches, so oil-wheel's
  mid->rotationSpeed turns the whole dish with the music.
- Song shape (src/lib/songShape.ts: section, intensity, build tension, drop, breakdown),
  onset strength, pitch and beat phase are heard but cannot be patched.

## Step 1 (Claude): the engine

- Fix the four dead patches (`source: 'bands'`) and comet's depth.
- Sound to frame motion (any `FRAME_MOTION` target: rock, squeeze, dish turn, spin, lamp
  motion, kaleidoscope turn and zoom) becomes a per-look opt-in on a short named list (Bass
  Drop is the obvious one: it is the look about the drop). A check (`npm run framesway`)
  fails if a look outside the list patches sound to frame motion, or if the list grows past
  a handful. `frameSway` stays 0 on every look.
- If a fast reading a look needs is not yet a patch source (an onset's strength, pitch),
  add it, on the desk's patch bay and the phone in the same PR. Song shape is not added for
  the looks.

## Step 2 (Antigravity): two or three patches per look, into the liquid

- Targets are the liquid's own: pour (dye budget, automate rate), bubbles, beads,
  turbulence, surface tension, hue journey, lacing, fingering. Not the frame.
- Sources are what is heard at once: the `bands` source (level, kick, bass, snare, hats,
  note, tonalLow/Mid/High, band1-8) and the `sound` features. No song-shape sources.
- Appropriate for the music means the answer is the liquid's, the way a real operator's
  hand answers a sound: a kick lands a drop of dye, hats raise fine beads, a held note
  turns the hue, the bass thickens the pour. The liquid's own time (spreading, settling)
  smooths it, so a fast source does not make a twitching picture. The film (2026-10-07)
  measured our looks' motion following loudness second by second (r 0.34 to 0.67) where real
  shows follow it only over sections (r -0.13 to 0.22): patch what a sound adds to the
  dish, not the dish's speed.
- A kick or snare patch is for a look about hits (Bass Drop, Cyberpunk), not every look.
- Keep each look true to its name and description; model the real physics behind each patch
  (what a real operator's hand would do to that liquid at that moment in the song).
- Judge on a fresh showreel (`npm run showreel`; a PR labelled `showreel` runs it on six Mac
  runners): swells a minute towards the real shows' 2 to 3, calm in the breakdown (26-42 s of
  the clip), and motion against loudness over 10 s windows above zero.
- The first three looks are written by Claude, in step 1, as the pattern; follow their shape.
- New Evolve (#363) moves dials slowly over 30-90 s; patches add on top each frame. A patch
  and Evolve on the same dial add, so give Evolve's slow dials room.
