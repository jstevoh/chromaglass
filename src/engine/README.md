# src/engine

The frame loop, on its way out of React (PLAN 50c, 19ai-10). Today the loop is one
`useEffect` in `components/LiquidVisualizer.tsx` (about 4,200 lines after the second move);
this folder is where it goes, a piece at a time, each piece a pure move in its own PR.

## The seam (what the engine becomes)

- **The engine owns the plate's per-frame state.** The fields' hands, the camera's shot,
  the clocks, the readbacks, the post chain, the governor's rung: everything the loop reads
  and writes between frames. React owns none of it; the component only mounts the engine on
  its canvas and unmounts it.
- **In: typed messages.** Settings, the ride, the selected liquid, the tool and layer, and
  the gestures arrive as messages the engine applies at the top of its next frame, never as
  props read mid-frame. Until 50d the "message" is a write to a `Box` the component fills
  from its props, as its refs are filled today.
- **Out: events.** What the app shows from the plate (the engine's status, the look phase,
  the frame digest the checks read) leaves as callbacks the component passes in once.
- **No React, no DOM beyond the canvas and its input.** Nothing here imports `react` or
  `components/`, so the engine can run in a worker on an `OffscreenCanvas` (50d). The input
  edge (`pointer.ts`) is the one place that reads DOM events; in a worker it stays on the
  page and posts the hands across.
- **No ceremony in the frame** (`.claude/rules/gpu.md`): a moved piece allocates nothing per
  frame that the loop did not already allocate.

## How a piece moves

A PR moves one block of the effect, and nothing else:

1. The block goes verbatim into a function here that takes the canvas (if it needs one) and
   a `refs` object, destructured at the top under the component's own names, so the body is
   the same text at a new indent. It returns what undoes it (`detach`), called where the
   effect's cleanup undid it before. An effect-local `let` the piece only reads comes in as
   a getter (`getStage: () => stage`). One a hook of the piece sets by plain assignment, off
   the frame's path, comes in as a setter beside it (`setThrowFrames(n)` for
   `throwFrames = n`, 50c-2) and the `let` stays in the effect, where the rest of the loop
   reads it as before. Those are the only text changes allowed, each listed in the PR. A
   piece that owns such state, or counts on it every frame (`x++`, `x--` in the frame),
   waits until that state has a home in the engine: a setter a frame is ceremony in the
   frame, and state the loop counts on wants one owner, not two.
2. The component calls it at the block's old place, passing its refs as they are
   (`useRef` results are `Box`es, `types.ts`). No ref is copied, renamed or reordered.
3. Held against the checks that read `LiquidVisualizer.tsx` as text (19ai-3a): grep
   `scripts/` for every identifier the block defines; a pattern that matched the old file
   moves with the code (point the check at the new file in the same PR).
4. `npm run lint`, `npm run sizes -- --update` (the component's ceiling banked lower, no
   other file's), and the checks for what the block does (the input edge: `npm run phone`).
5. The PR body has a table of old lines to new file, and the bytes before and after.

Changing a piece is a later PR, never the same one.

## The order of moves

| Piece | From the effect | To | State |
|---|---|---|---|
| The pointer and the fingers (mouse, touches, Spin hands, closeup camera, cover pinch) | "Mouse / touch handlers" and its cleanup lines | `pointer.ts`, `coverPinch.ts` | moved (50c-1) |
| The debug report and the crash log's provider | `debugState`, `?debug`, `crashLog.provide` | `debug.ts` | moved (50c-2); its four fault hooks set the effect's `let`s through setters until the guards move |
| The GPU's self-heal, out-of-memory and upload guards | `healStage`, `outOfMemory`, `scopedFrame`, `upload` | `guards.ts` | next (50c-3) |
| The governor's feed | `govern`, `startWith`, the ladder | `governor.ts` | 50c-4 |
| The render's stamps and the plate's clocks | `resetStamps`, `resetPlateClocks` | `clocks.ts` | 50c-5 |
| The device's start and the stage's build | from `preparing` to the first `startWith` | `start.ts` | 50c-6: writes the effect's own `let`s (`stage`, `chain`, `renderer`), so Claude first decides how they become engine state |
| The frame itself, by stage | `renderFrame` (about 2,700 lines): the hands' step, the sound's cords, the look, the post chain, the readbacks | `frame/*.ts` | 50c-7 onward, one stage a PR, after 50c-6 |
| The component's helpers above the effect that only the loop calls | the gesture appliers, the palette walk, the drops | beside the stage that calls them | with that stage |

Done when `LiquidVisualizer.tsx` is under 40 KB and mounts the engine.

## Files

- `types.ts`: `Box<T>`, a ref's shape without React.
- `pointer.ts`: `attachPointer(canvas, refs)`: the plate's mouse and fingers, the Spin
  tool's hands, the closeup's Alt-drag and two-finger camera; publishes `drawnRectRef`,
  `plateAtRef`, `wallPointRef`. Returns `detach`.
- `coverPinch.ts`: `attachCoverPinch`, `pinchSpan`, `applyZoomPinch`: the cover glass's
  pinch outside the closeup and the camera's pinch on it (moved from `components/`).
- `debug.ts`: `attachDebug(refs, lets)`: the report `chromaglassDebug()` returns (its keys
  and their order are what the checks read: do not rename one here), the three hooks
  `?debug` puts on `window`, and the crash log's provider and report part. `lets` is the
  effect's own state it touches: `getRenderer`, and a setter for each of the four fault
  hooks' counters. Returns `{ debugState, unprovide }`. The page's, like `pointer.ts`: it
  writes `window` and makes a canvas from `document`.

## Contracts

- Imports `src/lib`, `src/sim`, `src/types` and, as pieces move, `src/gpu`; never
  `components/`, `hooks/`, `app/` or `react`.
- `components/LiquidVisualizer.tsx` is its one importer until the engine mounts whole.
- Checks that drive it: `npm run phone` (the fingers), `tools`, `magnet`, `camerahand`,
  `closeupland` (the Mac's, through the app); and every check that calls
  `chromaglassDebug()` reads `debug.ts`'s report (`npm run crash`, the black box, its crash log part).
