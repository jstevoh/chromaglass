# Archive: 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10) (continued)

The closed items of [`docs/plan/28-preset-palettes-2.md`](../28-preset-palettes-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**28i-1. Retire nine**~~ (Antigravity, batch 1, **shipped** in #408; story in
  `docs/plan-shipped.md` 28i-1): nine ids through `RETIRED_PRESETS`, every check that
  named one on its replacement. What it found is **28i-6**.
- ~~**28i-5. Retire Lumia**~~ (**shipped**, this PR; story in `docs/plan-shipped.md`
  28i-5): `lumia` → `velvet-underground` through `RETIRED_PRESETS`; the lamp's Lumia
  stays. `plate` 5b counts a two-meaning id unless its line has the lamp's shape (`scripts/lookOrLamp.mjs`).
- ~~**28i-2. Give back the black, make the still ones move**~~ (batch 2) **Shipped**: all 21 reworked looks meet their gallery and film bars; Poster's `>= 30 steps/s` is open as **28i-2a** below. Story in `docs/plan-shipped.md` §28i-2 (moved 2026-10-29, 19m-2).
- ~~**28i-4. Soap Film**~~ — **Shipped with 32d**: the frame's own film draws its
  interference colours (`npm run soapplate`: 11 of 12 hue sectors on the lab's picture).

- ~~**28i-7c**~~ Velvet Underground's pools no longer drain: the look ran the default
  Turbulence (0.5), a curl-noise stir that carried the pools into a veil; it names 0 now
  (`npm run pools`: 67.2/75.5/90.9% kept over a minute → 98.3/96.7/96.0%). Story in
  `docs/plan-shipped.md` §28i-7c.
- ~~**28i-7b. Splodascope's oil is filtered by the water it displaced.**~~ (**shipped** as
  PLAN 47z-1; story in `docs/plan-shipped.md` 47z-1): a drop's light no longer passes through the
  water it pushed aside. The cobalt itself, filmed, read darker (47z-1e), so the pale water stays.

  The packs (PLAN 23; the owner's Art packs thread decides what Home keeps): Listening
  (Aurora, Oil & Water, Milk Marbling, Velvet Underground, Jellyfish Bloom, Cell Bloom,
  Clock Glass, Lava Lamp), proposed as Home's one fixed pack; Fillmore (Acid Trip,
  Fractal Dream, Classic, Poster 1969, Home Movie, Crowd Plate, Roy); Neon (Comet River,
  Solar Flare, Cyberpunk, Bass Drop, Galaxy, Stardust Collapse); Lab (Neon Coral Reef,
  Microscopic Chaos, Turing Print, Chemical Clock, Red Cabbage, Macro Bead, Lacing Run);
  Ferro & Film (Ferro Paint, Magnet Garden, Soap Film). None of the batches touches the
  gallery's grey wash (#401).

- ~~**28k-1. Film Hold and the Splodascope look**~~ (**shipped**, this PR; the story in
  `docs/plan-shipped.md` §28k). `npm run filmhold`: the look's crowd held 35 → 31 bodies in
  six seconds, the same plate without the hold 35 → 3.
- ~~**28k-5. The colours darken at the walls over time**~~ (**shipped** as PLAN 47z-1; story
  in `docs/plan-shipped.md` 47z-1): the lay handed the water's colour to each drop's rim and
  the drop's to the water; each drop's colour is now laid in its own oil.
- ~~**28l-1. The look**~~ (**shipped**, this PR): `saffron-lace`, the film at 0.3 of the
  gap dyed yellow at 0.35, on the lamp, with three thin pools (lib/plateAreas.ts): a wide
  lavender wash, cobalt with icy blue where the bass pours soap, coral where the treble
  pours oil. Lab render beside the still in the PR. Judging §112.
