# Every tool on every liquid (2026-09-27)

Read from the code on `main` (6c6d17e); the velocity numbers were measured in the lab (software WebGPU, 256² plate).
✓ = does what a performer would expect · ~ = weak or odd · ✗ = does nothing, or the wrong thing

| Tool | Colour (dye) | Oil & water (Oil Bodies) | Ferrofluid | Soap / milk / silicone / glycerine | Bubbles | Oil beads |
|---|---|---|---|---|---|---|
| Drop | ✓ lays it | ✓ Oil bottle lays a body | ✓ Ferrofluid bottle lays a pool | ✓ lays the liquid | ✓ bursts the one under it | ✓ nudges |
| Pour | ✓ | ✗ lays orange dye, no oil | ✗ lays black dye, no ferrofluid | ✗ colour only | ✓ | ✓ |
| Spray | ✓ | ✗ colour only | ✗ | ✗ | ✓ | ✓ |
| Splat | ✓ | ✗ colour only | ✗ | ✗ | ✓ | ✓ |
| Streak | ✓ | ✗ colour only | ✗ | ✗ | ✓ | ✓ |
| Finger | ✓ on Thin Gap the flow carries it (a solid in the liquid, 15b); with Thin Gap off, a CPU carry | ✓ carries the oil with its colour (the flow, on Thin Gap) | ✓ the flow on Thin Gap (15b); a carry with it off (9n) | ✓ stirs them together | ~ pops the ones under it and shoves the rest outward, not along the stroke | ✓ |
| Blow, moving | ✓ pushes it along, keeping it (15c; it erased it, ×0.8 a step) | ✓ the oil goes with its colour (15c) | ✓ (9n) | ✗ | ✓ | ✓ |
| Blow, held still | ✓ straw bubble pushes colour aside; off the straw, a puff blows it out onto a ring (15c) | ~ | ✓ (9n) | ✗ | ✓ grows one | ✓ |
| Press | ✓ pushes colour into a ring | ✓ the oil goes with its colour, onto the same ring (15d) | ✗ ferrofluid doesn't move | ✗ | ✓ | ✓ |
| Magnet | nothing (right) | nothing (right) | ✓ | nothing (right) | nothing (right) | nothing (right) |

## Why so many ✗s have one cause

Every liquid rides one velocity field, and the tools' pushes barely reach it. The field is held to a speed limit (`MAX_SPEED` 0.002, src/gpu/fluid.ts) that the idle plate already runs at. So a tool's push lasts one step and then gets cut back to idle. Only liquids with their own hand-written carry actually move: the dye (Finger, Press) and the oil (Finger, Press). The ferrofluid and the liquid chemistry have no carry. (Written before Thin Gap: on a thin gap there is no clamp, and the Finger is a solid in the solve whose flow carries every liquid, PLAN 15b, `npm run fingerflow`.)

Lab result: dragging fingerDrag's velocity 30 cells across a dye+ferrofluid disc moves the dye's centre 0.17 cells and the ferrofluid's 0.20. With the speed limit lifted, those are 0.56 and 0.63. At the hand's own speed with no swirl, they are 0.87 and 1.09. Leaving the plate alone moves neither.

## Hands that are not the mouse (phone remote, pen, OSC, replayed takes)

These go through a second copy of the tools (`performGesture`), and that copy has drifted from the first:
- Its Dropper never lays the bottle's liquid or heat. Only its "drop" does, and a recorded take says "dropper".
- Its Pour still pushes toward the bottom of the plate. The live Pour stopped doing that.
- Its Finger is half as strong as the mouse's.
- Its Blow never makes a straw bubble.

## Ranked by what a performer would notice

1. Pour, Spray, Splat and Streak ignore the bottle. With Ferrofluid or Oil selected, they lay coloured dye and no liquid. Fixed (PLAN 15a, `npm run bottles`).
2. Remote and replayed hands lay no liquid from the Dropper, and their Pour pushes downhill. Fixed with 1 (PLAN 15a); the show's own pour is unchanged.
3. Blow and Finger don't move the ferrofluid, and Blow's wind erases colour instead of pushing it. The cause is the speed limit above. The ferrofluid is 9n (#206); the wind carries the colour and the oil now (15c, `npm run wind`).
4. Press moved the colour out of an oil body and left the oil behind: fixed (15d, `npm run pressoil`). It still doesn't move the ferrofluid, which waits on 9n.
5. Soap, milk, silicone and glycerine push the plate through the same limited velocity. `npm run liquids` checks them on a stand-in plate, never on the GPU solver, so whether glycerine "crawls" on the real plate is unmeasured.
