# Default sound patches for every look (PLAN 28f)

The owner, 2026-10-11: use the patch bay so the looks answer the music more by default, "but
it's ok if the whole plate moves (or other global changes) with a small subset of presets. I
just don't want this kind of look to be a default across all presets."

This file is the brief for step 3 (the looks' own patches); steps 1 and 2 are the engine and
the desk, and step 3 waits on step 2's sources.

## What is there today (main, 2026-10-11)

- 11 of 41 looks have `sceneMappings` (src/presets.ts); 30 answer the music only through the
  four fixed `audioMappings` slots (velocity, density, colour, rotation).
- Four patches never fire: they name `bands` sources (kick, hats, note, tonalMid) under
  `source: 'sound'`, and `getAudioValue` (src/constants.ts) returns 0 for a name it does not
  know: bass-drop kick->plateRock, microscopic-chaos hats->beads, aurora-borealis note->
  cometSpeed and tonalMid->hueJourney. comet's timbre->cometAngle has depth 45 against a
  documented range of -1..1.
- The patch bay (`PATCH_TARGETS`, src/lib/sceneMap.ts) refuses only `frameSway`; Evolve's
  `FRAME_MOTION` hold-out (src/lib/drift.ts) is not applied to patches, so oil-wheel's
  mid->rotationSpeed turns the whole dish with the music.
- Song shape (src/lib/songShape.ts: section, intensity, build tension, drop, breakdown),
  onset strength, pitch and beat phase are heard but cannot be patched.

## Step 1 and 2 (Claude): the engine and the desk

- Fix the four dead patches (`source: 'bands'`) and comet's depth.
- Sound to frame motion (any `FRAME_MOTION` target: rock, squeeze, dish turn, spin, lamp
  motion, kaleidoscope turn and zoom) becomes a per-look opt-in on a short named list (Bass
  Drop is the obvious one: it is the look about the drop). A check (`npm run framesway`)
  fails if a look outside the list patches sound to frame motion, or if the list grows past
  a handful. `frameSway` stays 0 on every look.
- Song shape becomes patchable (section intensity, build tension, drop, breakdown, hit
  strength, pitch), learnable, on the desk's patch bay and on the phone in the same PR.
  A patch on a section source moves over seconds, not per frame.

## Step 3 (Antigravity): two or three patches per look, into the liquid

- Targets are the liquid's own: pour (dye budget, automate rate), bubbles, beads,
  turbulence, surface tension, hue journey, lacing, fingering. Not the frame.
- Prefer section sources over per-second loudness. The film (2026-10-07) measured our looks'
  motion following loudness second by second (r 0.34 to 0.67) where real shows follow it
  only over sections (r -0.13 to 0.22): a real operator pours more in a chorus and lets the
  plate settle in a breakdown, and does not twitch with each kick.
- A kick or snare patch is for a look about hits (Bass Drop, Cyberpunk), not every look.
- Keep each look true to its name and description; model the real physics behind each patch
  (what a real operator's hand would do to that liquid at that moment in the song).
- Judge on a fresh showreel (`npm run showreel`; a PR labelled `showreel` runs it on six Mac
  runners): swells a minute towards the real shows' 2 to 3, calm in the breakdown (26-42 s of
  the clip), and motion against loudness over 10 s windows above zero.
- The first three looks are written by Claude as the pattern; follow their shape.
- New Evolve (#363) moves dials slowly over 30-90 s; patches add on top each frame. A patch
  and Evolve on the same dial add, so give Evolve's slow dials room.
