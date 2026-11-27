# Archive: 17. Hear the set ahead, from files

The closed items of [`docs/plan/17-hear-ahead.md`](../17-hear-ahead.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Items

- **17e. The show plays the set, and knows where it is.** `setPosition` arithmetic *(shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md))*. The Web Audio set player (`AudioContext`, scheduled `AudioBufferSourceNode`s, gain into the analyser, `positionNow`, standing down `fingerprint.ts` and `songBoundary.ts`) ships with **17g**.
