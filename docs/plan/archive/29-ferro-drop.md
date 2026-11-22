# Archive: 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11)

The closed items of [`docs/plan/29-ferro-drop.md`](../29-ferro-drop.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**29c-7. A resting drop dissolves into its halo.**~~ **Shipped** (#373; `npm run ferrorest` 4/4; the deep plate's `phaseCH` stays as on `main`, under **29c-1**). Story in `docs/plan-shipped.md` §29c-7 (moved 2026-10-29, 19m-2).
- ~~**29c-8. A dragged drop loses its trailing rim to the oil's return flow.**~~ **Shipped** (#495; two-phase carry, `phaseVelocity` in `src/gpu/wgsl/fluid.ts`; `npm run ferrodrag` 3/3 on the Mac GPU). Story in `docs/plan-shipped.md` §29c-8 (moved 2026-10-29, 19m-2).
- ~~**29c-10. `ferrodrag` joins CI.**~~ **Shipped** (`npm run ferrodrag` on the show shard, `ferrohold` 5/5 on Metal). Story in `docs/plan-shipped.md` §29c-10 (moved 2026-10-29, 19m-2).
- ~~**29c-11. On Metal, the Thin-Gap-off line cannot tell the review's fix from its absence.**~~ **Shipped** (`npm run ferrodrag -- --thinoff` in CI, Metal 5/5). Story in `docs/plan-shipped.md` §29c-11 (moved 2026-10-29, 19m-2).
