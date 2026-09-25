# Liquids files (`*.liquids.json`)

A liquid is described by what it *is*. How it meets every other liquid follows
from that, the way it does on a real plate: oil and water part because oil is
oil, not because a rule says "oil vs water: separate". Settings → Liquids
shows, for the liquid you are designing, how it will meet every bottle on the
shelf, worked out with the same rules the plate uses (`meets` in
`src/lib/liquidFile.ts`).

Make one there, or write one by hand, and load it with **Load a file…**.
`docs/liquids/examples.liquids.json` has three to start from.

```json
{
  "format": "chromaglass.liquids",
  "version": 1,
  "liquids": [
    {
      "name": "Mercury Silk",
      "color": "#c8d0e0",
      "description": "Heavy and slick: it sinks, and keeps its edge against everything",
      "drop": { "size": 3, "amount": 1.2, "heat": 0 },
      "behaviour": { "weight": 0.4, "polarity": -0.7, "repel": 0.5 }
    }
  ]
}
```

Only `name` is required. A single liquid object, or a bare array of them, is
read too. A number outside its range is held to the range and the loader says
so. A property it does not know is named and ignored.

## The drop

| field    | range  | what it does |
|----------|--------|--------------|
| `size`   | 1–8    | How wide each drop spreads, in cells. |
| `amount` | 0–3    | How much colour each drop lays while it is held. |
| `heat`   | 0–1    | How warm it lands. Warm liquid rises where the plate has buoyancy. |

## What it is (`behaviour`)

| field      | range    | what it does | shelf examples |
|------------|----------|--------------|----------------|
| `weight`   | −0.5–0.5 | Heavier than water (+) settles downhill when the plate is tilted (Gravity + Tilt Direction). Lighter (−) rides up over it. | oil −0.12, syrup 0.35 |
| `polarity` | −1–1     | Like mixes with like. Liquids close on this scale blend; far apart, they hold an edge. Below −0.5 it also rounds into drops on a look with Oil Tension up. | water 0, oil −0.9, glycerine 0.8 |
| `soap`     | 0–1      | Breaks the surface: colour runs away from it and curls into filaments. | soap 1 |
| `body`     | 0–1      | Thicker than water: it crawls where it lies while the plate flows past. | glycerine 1 |
| `repel`    | 0–1      | A pool of it keeps its own edge against whatever it meets. | milk 1 |
| `acid`     | −1–1     | Acid (+) turns a pH indicator in the dye pink, base (−) turns it green; acid and base cancel where they meet. Shows on a look with pH Indicator up. | acid 1, base −1 |
| `magnetic` | 0–1      | Ferrofluid: each drop also pours the dark liquid a magnet pulls. That liquid never mixes with the dye. | ferrofluid 1 |

The three bands the designer uses for mixing are words for one continuous
number: two liquids are pushed apart in proportion to how far apart their
polarities are (plus a share of the stronger `repel`). Under 0.3 they **blend**,
under 0.7 they keep a **soft edge**, and beyond that they **stay apart**.

Liquids you make are kept in this browser and go on the shelf beside the
built-in bottles. **Save to a file** takes them to another machine or another
person. Loading a file you saved earlier updates the liquids it made rather
than adding copies.
