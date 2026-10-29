# 4. Liquids that behave differently: what shipped

How §4's shipped items were found, built and measured. The open work is in
[`docs/plan/04-liquids.md`](../plan/04-liquids.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

### 4. Liquids that behave differently

`src/types.ts` (`LiquidType` grows behaviour fields), `src/components/LiquidVisualizer.tsx`

Today a liquid is an inject radius, an amount and a heat. Make the liquid kind change
the interface physics:

- **Soap.** Dropping it collapses the surface tension in a disc for a moment, so the
  colour flees outward and then curls into filaments. A real gesture from the era and
  the most performable thing in this batch; it wants a MIDI action and an OSC address
  like the press.
- **Milk.** An opaque, scattering ground that colour rides on top of rather than
  mixes into. Needs an opacity channel in the render rather than pure transmission,
  which is what makes the reference's reds sit so solid under the drops.
- **Silicone.** The cell maker: displaces colour aside into a ring rather than
  colouring it, which is where every cell in a pour comes from. Pairs with batch 3.
- **Glycerine.** Coils and ropes when poured, slow and thick.

**Depends on** batches 1 and 3 to read properly.

**Shipped, with milk's optics still owed.** `src/lib/liquidPhase.ts` is a second field
the plate carries beside the dye — `soap`, `body` and `repel`, advected by the same
velocity, decaying over 6, 22 and 26 seconds. All three are deviations from an
ordinary plate, so a show with none of them in it runs exactly the arithmetic it
always did and the whole pass is skipped; that is the first thing `npm run liquids`
checks, because a field that changes every existing look is a regression with a menu
entry rather than a feature. It needs no GPU work: with the GPU solver attached the
CPU arrays are the next step's deltas, so a force written as a velocity delta and a
thinning written as a dye multiplier reach the solver through a path that exists.

What each one measures at, on a stand-in plate:

| | |
|---|---|
| Soap | dye within 8 cells of the drop falls to 55% and the disc stays open |
| Glycerine | the plate moves at 0.0081, the thick patch at 0.0002 |
| Milk | a pool spreads 5.99 against 6.01 for bare dye under the same shear |
| Silicone | the middle goes 67 → 0 with 262 in the ring around it |

Two things went wrong and are worth keeping. Milk was first written as a cohesive pull
toward the middle, and measured *wider* than bare dye: a cohesive force with no
pressure term to balance it collapses the pool and throws it out the far side. It is
now a one-way damper that can only remove the velocity that is escaping, and a force
that can only take energy away cannot overshoot. And the first spread measurement was
taken about a fixed point, so a plate that merely drifted read as a pool that had
spread — it is measured about the pool's own centroid now.

**Still owed: milk's opacity.** What ships is behaviour, not optics. Colour still
transmits through milk rather than sitting on it, because the dye texture's RGBA is
already fully spent — three log-absorptions and a density — and there is no channel
left for an opaque ground. That is the part of the reference's solid reds this does
not yet reach, and it needs a render change rather than a solver one.

### 4a. What is in each preset's dish

`src/presetPlate.ts` (new), `src/presets.ts`, `scripts/plate.mjs` (new)

A liquid nothing pours is a menu entry. Every preset now names what is in its dish
alongside the dyes it may use and how the automation puts them there — the three maps
moved out of the component into `src/presetPlate.ts` so a harness can read them without
a browser. The list doubles as the dilution: `doseLiquid` picks from it uniformly, and
the five inert liquids are how a preset says *mostly nothing, once in a while
something*. `['water', 'water', 'soap']` is a plate broken open every third dose;
`['soap', 'silicone']` never stops reacting.

Three presets exist only because the liquids do: **Milk Marbling** (the kitchen dish —
four spots of food colouring dead still until a drop of soap sends them for the rim),
**Soap Film** (one sheet of interference colour, torn open again and again) and
**Glycerine Drift** (bands shearing against patches that will not go along).

An automated show adds liquid for hours and pours none of it out, so `LiquidPhase`
carries a coverage ceiling and the automation scales each dose by the headroom left.
Measured: dosing every frame unchecked leaves 92% of cells too thick to move; with
headroom asked, 2%. A hand on the dropper is never limited.

`npm run plate` checks that every preset's dyes, injection styles and liquids name
things that exist — the failure it is really for is a typo in a liquid id, which reads
as "this preset has no liquid", silently, forever. It found three on its first run:
Lumia, Sensual Laboratory and Oil Wheel had no injection style and had been quietly
taking the `drop` default.

## Fourth pass (moved 2026-10-29, 19m-2)

### 4. Liquids that behave differently

#### 4a-clock. Clock Glass and Ferro Paint after their references

**4a-clock. Clock Glass and Ferro Paint after their references** (**shipped**, #280).
The owner, 2026-10-04: "the clock glass preset is really underwhelming as is the ferro
presets. They don't look anything like the inspirations." Judged against the Mac gallery
of that morning (`/mnt/project-files/lamp-ground/gallery/`, 12 s and 30 s):

- Clock Glass was one lavender-magenta disc. A clock-glass dish (the Joshua Light Show,
  the Fillmore) is coloured oil and water that will not mix: cells of red, amber and
  blue oil with dark rims in a purple water. The look laid three water dyes in rings on
  top of each other, with radii in the wrong units (below), so they blended at once.
  It now lays a purple water round twelve bodies of oil, each with one of red, amber and
  cobalt in it, with Oil Bodies and Oil Tension on (`src/lib/oilLay.ts`). Laying it found
  a fault in Oil Bodies itself: the oil's share of the dye started empty when a plate
  first had bodies, on the reasoning that the colour inside a body would be handed to it
  in a few steps. It was not: the bodies' colour ran out into halos in the water. The
  share now starts from the plate as it is (`fluid.ts`, bodiesFresh). `npm run
  clockglass` (lab, 192², 300 steps): the dish's colours spread 0.248 rad against the old
  lay's 0.101, in 4 separate regions off the water, and the oil holds 97% of the colour
  laid in it (17% with the share starting empty, 3 regions). `npm run bodies` 17/17.
- Ferro Paint opened as one green with black holes, where Colored I and II hold amber,
  teal and coral in regions. Its sixteen patches were laid with a radius of `S × 0.15`
  in `splatBlob`'s 128-grid units, which it scales by GRID_SCALE again: 0.225 of the
  plate, nearly the patches' spacing, so all sixteen lay over each other. Now 0.09.
