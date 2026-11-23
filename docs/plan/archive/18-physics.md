# Archive: 18. The physics under the look: where the plate imitates a result instead of simulating it

The closed items of [`docs/plan/18-physics.md`](../18-physics.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- ~~**18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.~~
  Dropped: the owner decided to delete the CPU solver's stepping (2.6, 2026-10-06; 3.1).
- **18a-11, the cost measured (shipped).** Measured 2026-10-07 on the Mac with `npm run stages` (`docs/judging.md` §19): Thin Gap needs no look turned off (512², 33 ms/frame; H2b 52 fps), and the in-plane viscosity (18a-10) is 1.52 ms. Story in `docs/plan-shipped.md` §18a-11 (moved 2026-10-29, 19m-2).
- **18a-13a. Two layers: shipped** (2026-10-22). Oil lenses ride the water at their
  capillary thickness, read from the plate's own oil each frame, with the two-layer
  laminar drag between them; the dish moved to the GPU (`gpu/slosh.ts`). Plate Rock's
  swing tips it where Frame Sway lets the frame move (`rockAccel`; how the rock itself is
  driven is 27f-2's). A kick's glass presses the dish over the same radii it presses the gap
  (`kickPress`: the sheet's one dent off the frame-moving looks). Story in
  `docs/plan-shipped.md` §18a-13a; `npm run slosh`, `npm run sloshgpu`.
- **18a-13d. A shock-capturing scheme: shipped** (2026-10-22). HLL fluxes over
  hydrostatic reconstruction, MUSCL with the MC limiter, Heun in time: a dam
  break runs at Stoker's speed, two cells wide, and no energy is made. Story in
  `docs/plan-shipped.md` §18a-13d. Still: no Coriolis or centrifugal term, and the
  CPU film ignores the slosh.
- **18a-13j. A hand can tip the dish: shipped** (2026-10-31; the owner: "I never saw
  the control to do that"). The Tip pad (`components/ui/TipPad.tsx`, `lib/tipPad.ts`)
  in the Tools panel's empty keycaps, at the top of Tilt & Rock and in the phone's
  Motion sheet: drag the dot to an edge, let go and the dish lies back. `npm run
  tippad`. Story in `docs/plan-shipped.md` §18a-13j.
