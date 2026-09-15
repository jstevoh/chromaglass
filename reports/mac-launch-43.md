# Mac launch and looks after #43

2026-09-15, late morning. The Mac is on `main` at aab272f "Lacing: threads at a boundary, not a contour map (#43)".

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded b687f94 → aab272f (#43: `CHANGELOG.md` and `LiquidVisualizer.tsx`), and popped the stash cleanly, so the local lockfile edit is kept. The nested `chromaglass/` clone is untouched. No `npm install`.
- **Build.** `npm run build`: OK in 1.16 s.
- **Restart.** I killed the old server (pid 30897, key 1678) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **32470** |
| Show key | **7699** |
| Phone | http://192.168.0.234:3000/?remote=1&key=7699 |
| Network display | http://192.168.0.234:3000/?cast=true&key=7699 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 1678 needs a reload with 7699. I left James's Chrome and the projector alone. James's Chrome has one tab open (a news site), and it isn't the show.
- **Load at the start:** GPU utilisation 41 %, load average 3.7 (OBSBOT Center 84 % CPU, MOTIV Mix 58 %). That is quieter than #42's 94 %.

## 2. Lacing, second pass

**Method.** Fillmore at `?debug&sim=512` on "GPU · 512² · 1.0x", `Math.random` seeded (mulberry32, seed 7), Granulation 0 and Plate Cells 0 over OSC unless stated. One page at a time. Same seed and frame counts as #42, so the plate is the same plate.

- `~/cg-scratch/lace43.mjs`: #42's OSC sweep (0 / 0.25 / 0.45 / 0.7 / 1.0 at frames 400 and 1100, then a 1 s press at the dish centre). Captures are ~20 frames apart.
- `~/cg-scratch/lacecurv43.mjs`: writes `chromaglassDebug().settings.lacing` in consecutive rAFs, so every value is **one frame** from the next. For the curvature question it patches the lacing shader **in the test page only** (the app is untouched): the thousandths digit of the amount picks a mode. x.xx0 is the real shader, x.xx1 forces `fold` to 0 (hair everywhere), x.xx2 forces `fold` to 1 (braid everywhere), and x.xx3 paints `fold` itself (red = curled, blue = straight, brightness = band). So real, hair-only and braid-only are compared on the same plate, one frame apart.
- **Errors:** 0 GL errors from `getError` after every draw in the first 25 s, no shader or GL console lines (only Chrome's usual "too many errors" cap from the app's READ-usage warnings), and 0 NaN in the dye after the press.

### Does it read as filaments now? **Better in the main dish, not fixed. The small dish stipple is hidden, not gone.**

2× crops at frame ~1100, lacing 0 / 0.25 / 0.45 / 0.7 / 1.0 (the OSC sweep, ~20 frames apart).

The cyan core in its yellow-green ramp:

![core](l43-sweep-core.png)

A red tongue against orange:

![red](l43-sweep-red.png)

The left of the main dish (pink → cyan → yellow, seen through the small dish's glass):

![left](l43-sweep-left.png)

The green tongue against red, bottom of the main dish:

![bottom](l43-sweep-bottom.png)

The small dish (`fluids[1]`), purple into green:

![small dish](l43-sweep-small.png)

- **Much less is laced.** Coverage in the 380 px main-dish crop (lifted > 8 over lacing 0) at the Fillmore default 0.45 falls from 20.8 % to **13.5 %** on the OSC sweep. On consecutive frames, where motion doesn't inflate it, it is **8.7 %**. The frame-apart numbers are 5.0 / 7.0 / 8.7 / 11.2 / 13.3 % at 0.25 / 0.35 / 0.45 / 0.7 / 1.0. The 0 → 0 baseline over 11 frames is 4.3 %. The 5×5 high-pass goes 3.9 → 4.75 at 0.45 (#42: 3.87 → 5.48). So **0.45 now lays down less thread than 0.25 did in #42.**
- **The threads that remain sit on boundaries and follow them.** On the cyan core, the red tongue's lip and the green tongue's outline, there is one or two bright lines along the edge rather than rings across the ramp. That is the look you asked for.
- **Isoline stacks on soft ramps: mostly gone, not everywhere.** The core's concentric rings are gone. But the **left crop still has a stack of 6–7 thin parallel lines** across the wide pink → cyan ramp (fainter and thinner than #42.s), and the **red tongue's top edge has a comb of ~8 short parallel stripes** running across the red → orange ramp. See the curvature section for why: the stacks are still in the level function and the fold gate is what hides most of them. The ±4-cell span is 8 cells, so a ramp wider than that still gets 1.5 × (ramp width / 8 cells) lines, and on a 50-cell ramp that is about nine.
- **Speckle and glitter are still there.** The pale speckled patch where two reds meet (red crop, lower middle) and a pale crumbly fringe along the green/yellow boundary (bottom crop) are present from 0.25. From 0.7 the core's braid breaks into single-pixel white glitter, as in #42.
- **The small dish draws almost nothing now, rather than threads.** Coverage at 0.45 is **0.9 %** (#42: 9.4 %), and 3.1 % at 1.0: sparse single-pixel dots along the blue edge and the green band. There are no filaments at any value.
- **The stipple is only hidden.** With `fold` forced to 1 (braid everywhere, below: lacing 0 | real 1.0 | braid-forced 0.992), the small dish is the same aliased stipple as #42: single-pixel dots in wavy bands, 24 % coverage. The 4-px `fwidth` clamp doesn't stop it. My guess is the level is taken from `color`, the displayed colour, which carries per-pixel noise. On a soft ramp `freq` is large, so `fract(fC * freq)` amplifies that noise into a pixel-scale pattern. A bilinear `decodeFluid` sample would not do that. I'm testing that next.

![small dish: 0 | real 1.0 | braid forced](l43-small-braid.png)

### Is the curvature coupling visible? **Yes, but as a gate, not as braid against hair.**

Same frame ± 1, lacing 1.0: real | `fold` forced 0 | `fold` forced 1, on the cyan core:

![core: real | hair | braid](l43-curv-core.png)

The green tongue, same order plus the fold map:

![bottom: real | hair | braid | fold map](l43-curv-bottom.png)

At release after a 1 s press, real | hair | braid:

![press: real | hair | braid](l43-curv-release.png)

The fold map of the whole main dish (left: lacing 0; right: `fold`, red curled, blue straight):

![fold map](l43-foldmap.png)

- **Forcing `fold` to 0 removes almost every thread.** The "hair" column is nearly identical to lacing 0. Mean lift over lacing 0 is 0.1–0.7 luminance units in every bucket, still or pressed. So on a straight run the thread is `mix(0.07, 0.30, 0)` = 0.07 of a level wide, at `mix(0.4, 1.0, 0)` = 0.4 brightness. That is under a pixel, at under half weight: **there is no hair.**
- **Forcing `fold` to 1 brings back the contour map.** It gives wide bright white stripes stacked across every ramp: 5–6 on the green tongue, and parallel bands through the red and orange around the core. So the level function still stacks lines. It is the fold term that hides them.
- **The real shader draws threads only where the map is red.** In the 380 px crop, split by the painted fold (still frame; release and +30 are the same within 2 points):

| fold bucket | share of crop | lift at 0.45: real / hair / braid | lift at 1.0: real / hair / braid | real differs from hair by > 8, at 1.0 |
|---|---|---|---|---|
| straight (< 0.25) | 64 % | 0.4 / 0.3 / 10.4 | 1.1 / 0.7 / 22.4 | 9.5 % |
| mid | 10 % | 1.9 / 0.1 / 8.4 | 4.4 / 0.5 / 18.2 | 19.7 % |
| curled (> 0.6) | 17 % | 5.8 / 0.2 / 7.2 | 13.0 / 0.6 / 15.4 | 37.7 % |

  The frame-to-frame motion baseline (lacing 0 vs 0, 11 frames apart) is 7–14 %. So straight runs are at the noise floor, and the curled parts carry almost the whole braid.
- **So the coupling is visible, but what it does is choose where threads exist.** It doesn't make curls thicker than straight runs, because straight runs draw nothing. On screen that reads as short bright scribbles on the curls of the core and the tongues, with blank edges between them. At a press, the pushed blob's outline is laced on its bent flanks and bare along its straighter sides.
- **Not a strain-style "nobody can see it".** Unlike #42's strain, this one decides what the pass looks like. I would keep it, but give it a floor so a straight run draws a real hair. That test is running under the grain now (`fold` floored at 0.3 and 0.5).
