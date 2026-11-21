# Archive: 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10)

The closed items of [`docs/plan/28-preset-palettes.md`](../28-preset-palettes.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **28a. Keep, improve, new, retire** (**shipped**, #330): named "Preset palettes", three looks retired through `RETIRED_PRESETS`, several improved, Lava Lamp new. Story in `docs/plan-shipped.md` §28a (moved 2026-10-29, 19m-2).
- **28b. Colour palettes for the lamp** (**shipped**, #330). Story in `docs/plan-shipped.md`
  §28b (moved 2026-10-29, 19m).
- **28e. A breakdown is quieter on the plate, and Classic is blobs again** (**shipped**,
  #368; the showreel's first two findings). Story in `docs/plan-shipped.md` §28e (moved
  2026-10-29, 19m).
- ~~**28f-3.** Ten looks still sway the dish's turn with the music through the old
  `audioMappings.rotation` slot (27a-8).~~ **Shipped** (with 28i-3, #473). Story in `docs/plan-shipped.md` §28f-3 (moved 2026-10-29, 19m-2).
- **28g-1. The follower and its check** (**shipped**, #378; the story in
  `docs/plan-shipped.md` §28). `chroma.ts`, `songFollow.ts`, `npm run songfollow`.
- **28g-2. Use it live, with the fallback** (**shipped**; `followedPlace.ts`, `npm run songfollow`, `npm run followview`). Story in `docs/plan-shipped.md` §28g-2 (moved 2026-10-29, 19m-2).
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
- **28h-1.** (**shipped** with 28g-8.) The nudge re-anchors the follower rather than
  adding an offset to it; position stays in the map's own seconds.
- **28h-8. Listen in the Songs panel** (**shipped**, this PR; the story is in
  `docs/plan-shipped.md` §28h-8). One press names the song, adds it, and designs its
  show from its map once heard through (`lib/songDesign.ts`, `npm run listen`).
- **28h-9. A first listen's map in the song's seconds** (**shipped**, this PR; the
  story is in `docs/plan-shipped.md` §28h-9). The map and its fingerprint are moved
  by where the clock put the recording's first sample (`lib/songMapLead.ts`,
  `npm run listen`).
