# Archive: 24. Modular rigs: patch the rack into the liquid

The closed items of [`docs/plan/24-modular-rigs.md`](../24-modular-rigs.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Steps

- ~~**24.3-place-1. Only the microphone path, not MIDI.**~~ (shipped with 24.3:
  `melodyPlace(pitch, line)` extracted in `src/lib/melodyWalk.ts` and shared by
  `MelodyWalk.update` and `src/lib/noteVoices.ts`, laid through `layMelodyDrop`.)
