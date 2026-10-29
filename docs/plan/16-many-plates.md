# 16. Many plates: each projector its own source (rig-plan R1)
**Partly shipped**: 16a, 16b, 16c and 16f are shipped (#231, #226, #232, #273). What 16a, 16b and 16c each left undone is listed below in that order, then 16d and 16e, which are open. How it was found, built and measured is in [`docs/plan-shipped/16-many-plates.md`](../plan-shipped/16-many-plates.md), under the same number.

Asked for on 2026-09-27 ("Let's build multi-plate next"), after the Mixer's steps 1–5.
`docs/rig-plan.md` has the why (a light show was several projectors, each its own
source, beams adding on the screen); this is the running order.

**What there is today** (read from the code, 2026-09-27). Two solvers at most:
`layerCount` is clamped to 1..2 (`LiquidVisualizer.tsx`, the layer effect), one
`WebGPUFluid` per layer, the front plate `fluidsRef[0]` and the back plate
`fluidsRef[1]`, drawn together in one plate pass. The two share one look: each frame's
settings fold into `patch.global` for the picture and `patch.layer(i)` for each solver
(`lib/sceneMap.ts`), and `patch.layer(i)` differs from the global only by a scene
mapping aimed at that layer. The back plate is otherwise the front's twin, turned the
other way, slowed by Background Loop and thrown by Layer Scale Variety. Every
projector (`Surface` in `lib/outputConfig.ts`, up to sixteen) samples the one finished
frame (`gpu/output.ts` binds one `scene` texture), blended over, not added. The grid is
one size for every layer (`resolveSimResolution` from the quality ladder,
`lib/platform.ts`), and the plate's bind group and shader are written for two layers
(`gpu/plate.ts`, `wgsl/plate.ts`'s one "Layer 1" block). The lab runs one solver.

**The decision rig-plan leaves open, taken here as the default:** up to **four**
plates, and with three or four each runs one rung of the ladder below the grid a
single plate gets (512 becomes 384 on a local GPU), so four plates cost about what two
do now. The owner can say otherwise; the ladder is one table.

Each step ships its phone version in the same PR (the rule) and one PR each:

- **16a · The back plate gets its own look.** Shipped (#231); the story is in
  [`docs/plan-shipped/16-many-plates.md`](../plan-shipped/16-many-plates.md).
  Found while building it, not done:
  - *A render lets the back look go.* A render lays its look on both plates from its
    seed, so the back plate follows the front from the render's start, and after it.
    Rendering a show with a back look would mean carrying the back look into the
    render's recipe.
  - *Cast and network displays show the front's twin.* `CastState` carries the
    settings, not the back look, so a receiver's second plate is the front's.
  - *The remote has no To Back Plate*, and its Mixer's back row names nothing.
  - *Back undoes the last front Go only*, and a set list's cue-next counts from the
    live item, not from a look sent to the back. Both are as intended for now; say so
    in the Guide or change them when the set list learns about plates.
  - *On a one-plate front look, Follow the front drops the plate when the fade lands*
    (a cut of the back plate's picture at the end rather than the start). Fading
    `backLevel` out with it would make that a fade.
- **16b · A projector picks its source.** Shipped (#226); the story is in
  [`docs/plan-shipped/16-many-plates.md`](../plan-shipped/16-many-plates.md).
  Found while building it, not done:
  - *A source has no post effects and no closeup camera.* The wall's chain (bloom,
    the photographic presets' lens) runs once, on the wall; a source is the plate as
    the display pass draws it. Running the chain per source doubles its cost; worth
    it only if a rig asks.
  - *The logo stays up in a blackout* on the wall and on the front plate's projector:
    it is laid over the dimmer (`finishLight`), as it always was on the wall.
  - *Every network display draws every source its surfaces ask for*, since the cast
    state carries the output config and a receiver runs this same frame: a receiver on
    a weak GPU pays for the sources a laptop's projectors asked for. A receiver could
    be told which surfaces are its own.
  - *The remote cannot pick a source*, only the laptop and the phone's own Settings.
  - *What a source costs is not measured yet.* `wall` times each source's pass
    (`plate front`, `plate back`, `plate film` against `plate`) where the GPU has
    timestamp queries, and the Mac runner's has none: #226's green run printed "skip
    each source's cost". Each is the whole display pass again at the canvas's size.
    It needs reading on the owner's Mac (`chromaglassDebug()`, docs/judging.md §21)
    before 16d (four plates), which is where a budget has to be.
- **16c · Beams add, and the seam goes.** Shipped (#232); the story is in
  [`docs/plan-shipped/16-many-plates.md`](../plan-shipped/16-many-plates.md).
  Found while building it, not done:
  - *Two projectors of one picture stacked for brightness are blended, not doubled*
    (the same point of the same source is one picture). A stacked pair would need its
    own switch.
  - *The blend is in the canvas's values*, which is light for one projector carrying
    every surface. Two physical projectors each with its own gamma would want the
    shares in linear light.
  - *Tiles are lined up by hand, by corners* (R4 is placing a projector by its centre,
    zoom and turn); the blend allows two texels of slack.
  - *Crossing beams over 1 clip* in the canvas: two bright pictures crossing are
    white where they add past it.
- **16d · Up to four plates.** `layerCount` to four, the plate's bind group and shader
  from two layers to N, the ladder's rung per plate as above, the governor told how
  many plates it is carrying. Check: `startup` and the frame time on the Mac with four
  (no stop on the opening, no pipeline built on a frame), and the lab with four.
- **16e · A row per plate in the Mixer** (the Mixer's step 6): each plate its own row,
  level and grade, reached from the desk, Settings, the phone and the remote.

Not in this batch: R4 (placing a projector by its centre, zoom and turn) and R5 (a rig
as a document the cue list points at). Slides as a source wait on `docs/slide-plan.md`.
