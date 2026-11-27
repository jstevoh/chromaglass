# Archive: 33. Bubbles and the closeup, per liquid (asked 2026-10-19)

The closed items of [`docs/plan/33-bubbles-closeup.md`](../33-bubbles-closeup.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
## ~~33a. No stepped ring round a bubble's hole~~ — **Shipped** (a hue gate on the line between two dyes, `boundaryDiff` in `src/gpu/wgsl/plate.ts`; `npm run holeline`). Story in `docs/plan-shipped.md` §33a (moved 2026-10-29, 19m-2).

## ~~33b. The soft glow still left round a hole~~ — **Shipped** (`airNear` flattens the dye's normal beside an air hole, `src/gpu/wgsl/plate.ts`; `npm run holeline`). Story in `docs/plan-shipped.md` §33b (moved 2026-10-29, 19m-2).

Left from it, so none of it is lost:

## ~~33e. The bubble as the projector throws it, not a donut~~ — **Shipped** (the clear middle is the plate, `plate.ts`'s projected bubble; `npm run bubblelook`). Story in `docs/plan-shipped.md` §33e (moved 2026-10-29, 19m-2).

Left from it, so none of it is lost:

## ~~33g. The closeup: the liquid nearer and in relief, not cells~~ — **Shipped** (Paint Cells and Macro Lacing default to 0; `npm run macroview`; 20c-1 is closed by it)

**Shipped.** Story in `docs/plan-shipped.md` §33g (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

## 33q. Fewer beads, and the oil in the dye's place (asked 2026-11-26)

- ~~**33q-1. The Beads dial is oil, not a count.**~~ **Shipped** (this PR): the dial sets
  how much of the glass the oil covers (5% at full, `BEAD_COVER` in `src/lib/beads.ts`),
  `beadPopulation` turns that into a count for the beads' size, and the field is held to
  that oil (`populate(..., byOil)`): a merge keeps its r squared, so the field coarsens
  into fewer, bigger beads instead of being refilled. The default holds 44 beads where it
  held 125, Macro Bead 112 where it held 312, and the closeup a quarter of the count at
  twice the size. `npm run drops`: held by count for 1200 frames the plate carried 2.16 x
  the dial's oil, held by oil 1.09 x, in 62 beads instead of 119.
- ~~**33q-4. The air bubbles' amount in looks.**~~ **Shipped** (this PR, the owner's choice
  of 2026-11-27): Bubbles is 0 in `DEFAULT_SETTINGS` and so in `LOOK_BASE`, and air is laid
  only by the looks where a second glass closes over the liquid and traps it: Lava Pop, Oil &
  Water, Clock Glass and Splodascope at 0.2 (the amount 33q-1 was judged at), and the moiré
  looks laid over two of them. Feeling Lucky rolls air one look in five at 0.1 to 0.3 (was
  four in five at 0.2 to 1). The dial still turns it on anywhere. `npm run lookair`: looks
  laying air 34 of 42 on main, 7 of 42 here; 2/6 on main, 6/6 here.
