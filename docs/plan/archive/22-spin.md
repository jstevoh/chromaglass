# Archive: 22. Spin the plate

The closed items of [`docs/plan/22-spin.md`](../22-spin.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**22d. The CPU solver gets the bulk lag and not the swirl.**~~ Dropped with the CPU
  solver's stepping (2.6, decided 2026-10-06; 3.1). Where there is no
  WebGPU, `FluidSimulation`'s own step (`LiquidVisualizer.tsx`) turns the picture
  with the liquid but has no swirl; give it `spinSwirl`'s few lines.
- ~~**22n. A spun plate's liquid did not heap, lag or overshoot.**~~ **Shipped**
  (`npm run spinslosh`, `npm run sloshgpu` case 6). Story in `docs/plan-shipped.md` §22n.
  Its shortcut, named so it is replaced: the open dish's flow is the glass's frame's
  and is laid over the solver's, whose frame turns with the thin gap's liquid (ω_l),
  so while the thin gap's liquid lags the glass (a third of a second on water, a
  sixtieth on the thick liquid) the two frames differ by that lag. Properly one
  liquid has one lag: when the open dish runs, its own turn should be the frame's.
- ~~**22n-1. Five looks woke the open dish in their opening.**~~ **Shipped** (`npm run
  spinslosh` 7, `npm run startup` on the Mac). 22n woke the dish on a change of speed past
  0.25 rad/s²; deploy 835 on the owner's Mac found Fractal Dream, Velvet Underground, Cell
  Bloom, Chemical Clock and Clock Glass asking for the dish's kernels in their opening with
  no list naming them: a frame stalled while the opening compiled moves the dish to its
  motor (0.02 to 0.09 rad/s) in one step, which read as several rad/s². Now the dish wakes
  on the liquid's lag behind a change (summed, let go at the dish's drag) past the speed a
  steady spin needs, so no motor wakes it however the frames fall and a flick still does.
