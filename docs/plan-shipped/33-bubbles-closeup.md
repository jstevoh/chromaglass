# 33. Bubbles and the closeup, per liquid (asked 2026-10-19): what shipped

How §33's shipped items were found, built and measured. The open work is in
[`docs/plan/33-bubbles-closeup.md`](../plan/33-bubbles-closeup.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 33. Bubbles and the closeup, per liquid

#### 33a. No stepped ring round a bubble's hole (this PR)

*Reported* (the owner, 2026-10-19): "bubbles still look really pixelated around
themselves". In the lab every hole the air cut in the dye wore a stepped halo a couple
of cells out, bright and dark blocks on a cross, a "+" stamped round each small bubble.
The dye field under it was clean, and with Boundary Contrast at 0 the halo went.

*Cause:* the line drawn between two dyes (`boundaryDiff` in `src/gpu/wgsl/plate.ts`,
on at 0.35 in every look) is drawn where the lit colour changes across a four-tap
cross, and the lit colour carries the dye's depth as well as its hue. One dye thinning
to nothing at a hole's edge read as two colours meeting; the taps' offsets drew the
cross.

*Fix:* the line is gated by how far the dye's colour per unit of dye moves between the
same taps (`dyeHue`, the unit colour exp(−rgb/a) of the decoded dye, white where the
dye is empty), smoothstep 0.03 to 0.12. A hole in one dye does not move it; two dyes
meeting do, at any pair of depths. A gate on the density ratio was tried first and took
the line off two dyes meeting at depths five times apart, so it was dropped.

*Measured* (`npm run holeline`, the lab on SwiftShader, each picture against the same
plate with Boundary Contrast at 0): the share of a ring round holes of 1.8, 3, 5, 8 and
14 cells that the line moves by more than 24 levels went from 8.9, 8.9, 11.5, 13.6 and
18.3 % to 0 % each; the band where two dyes meet kept 52.8 % → 52.8 % at one depth and
61.1 % → 58.3 % at depths five times apart; a pool's rim into clear liquid, printed not
judged, 16.8 % → 0 %. The bubble's own drawing, which is the donut, is 33e.

#### 33b. The soft glow round a hole (this PR)

*Reported* (the owner, 2026-10-19, via 33a's picture): after the stepped ring went, a pale
soft ring two to four cells wide stayed round every hole the air cuts in the dye.

*Cause, measured not inferred:* the lab's radial profile round a hole of 8 cells (green
channel, the real solver and plate shader, the bubbles' drawing at 0 and the air field
handed to the plate) was +9 to +15 levels over a 194 baseline at 9 to 13 cells, and flat
with Edge Relief at 0. It is the dye's own edge relief (`meniscus()`, and the lit slope
`applyLighting` takes from `sobelGrad`): the air's cut leaves a steep density ramp over
its 1.5-texel rim, and the relief lights that ramp as if the dye stood in a ridge. A
real hole's edge is the bubble's meniscus, which the bubble pass draws; the dye beside
it is flat. The boundary line and the lace contribute nothing to this glow (the line was
33a's).

*Fix:* `airNear` (`src/gpu/wgsl/plate.ts`, in the display-only `VIEW` part, because the
derive pass's module has no `air0`) is the air field's largest coverage over nine taps
within 4.5 cells (the Sobel taps at 3 cells plus the bicubic's spread), smoothstepped
0.02 to 0.3. Both layers' dye normals are blended to flat by it before they reach the
lighting and the meniscus. A dye's own edge into clear liquid is far from the air field
and is untouched.

*Measured* (`npm run holeline`, the lab on SwiftShader): the mean deviation of the dye
1 to 6 cells past a hole's rim from the dye 10 cells out, for holes of 1.8, 3, 5, 8 and
14 cells, went from 4.2, 6.0, 9.6, 11.0 and 10.4 levels (the check's second lab, with the
mask taken out) to 3.2, 2.4, 2.6, 2.4 and 2.5 (bar 6). Edge Relief itself, asked of the
first 3 cells beside the rim of the holes of 3 cells or more, moved the dye 11.9 to 22.9
levels before and 0.00 to 0.02 after (bar 1). A pool's edge relief into clear liquid moves
a pixel by 16.06 levels both ways (bar 0.8 of today's). `airlens` found its bubble box by
differencing a render with the bubbles on against one with them at 0, and the flattened
relief then showed in that difference; its off render now hands the plate the air field
too (`airField`), so it differences the bubbles alone.

*Named shortcuts:* `airNear` is a fixed reach, not one derived from the taps' real
footprint; the normal is flattened wholesale, so a real dye-to-dye step right beside a
bubble also loses its relief within the reach; only the lead layer's normal is masked
(the app cuts air in the lead layer's dye alone, and the back layer's coordinates differ
under a zoom or drift); the aside hole of `holeline` is a coarse guard on the mask's reach;
the lace (33c) and the boundary line
at a hole are not masked; the hole of 1.8 cells is only partly flattened (its relief
moves 4.6 levels where the control moves 5.5), because the nine taps find a hole that
small along few directions (PLAN 33b-3).

#### 33e. The bubble as the projector throws it, not a donut (this PR)

The owner: bubbles "sometimes" draw as a donut. The report's picture is
`/mnt/project-files/drops/bubbles-2026-10-19/zh-sheet.png`.

*Cause:* the projected bubble (the plate's view, `plate.ts`) drew its clear middle as
the dye's own normalised hue at 41–77 % strength, in all eight clarities, inside the
dark band. On the default dark ground (dye is light on black) that is a dim dye-coloured
disc inside a black ring; on the lamp ground a tinted disc over a white hole; in clear
water a grey disc. Why it is "sometimes": a bubble in dye is a donut, a bubble in clear
water is a grey disc, and the closeup (the camera's bubble, a different branch) is
unaffected, so it depends on what the bubble sits in and on the zoom's crossing
(`dropCam`).

*Fix:* a slab of air does not tint light, so the middle is the plate there
(`outColor`), with at most a tenth of the wetting film's tint (`0.1·k1`). The band and
its width are unchanged (the big bubble's band was already half the gap, `airlens`).

*Measured* (`npm run bubblelook`, the lab on SwiftShader, bubbles of 3, 4.5, 7, 10 and
13 cells, the middle fifth of each radius against the same plate with Bubbles at 0): the
old line, put back by the check's second lab, left the middle 116–195 levels off the
plate on the dark ground (172, 151, 140, 119, 195 in green) and 174 or more on the lamp
ground; the shader leaves 0 on the dark ground and 0–21 on the lamp ground (the tenth of
the tint). The dark share of a bubble's area falls as it grows, 80, 85, 60, 46, 34 %
on the lamp ground. Bubbles at 0 and the closeup's bubble are byte-identical to the
control on both grounds.

*`airlens` had to move,* declared under *Check changes*: its plate is now the lamp ground
(`lampGround: 1`), because the window is the plate and on the dark ground a window is
black, so there was nothing lit to measure the lens against; its `on` render uses
Bubbles 1 (the compositing weight is `strength·mix(0.7, 1, filmT)`, so at 0.8 a quarter
of the plate shows through the band and the band read 25–28 % where it is drawn 10 %);
and its flat-window chroma bar compares the window with the plate's own chroma plus 4
(the lamp's warm white is 8.8 levels apart by itself; the bar was 4 when the ground was
grey). Every other `airlens` line and its numbers are unchanged: 10 of 10.

#### 33g. The closeup: the liquid nearer and in relief, not cells (this PR)

*Reported* (the owner, 2026-10-19): "Macro zoom is also still not great. Things look like
a bunch of biological cells when you zoom in - this isn't right. I just want a closer and
more 3d view of the liquid on the plate."

*Cause:* the closeup drew `cellField` (concentric, packed Voronoi-like cells slid by a
flow map, 20c-1's named shortcut) and the lacing (dark filaments) over the dye, and both
were on in every look that did not name its own: `macroCells` 0.75 and `macroLacing` 0.55
were the defaults in `types.ts` (and random in the lucky roll). At 4x and 6x that is a
texture laid over whatever the dye was, which is exactly what reads as cells under a
microscope. The relief under it was also weak (the dye's normal ×5 under the plate's lamp
at its normal height), so what was left of the "3d" was the cells' own domes.

*Fix:* Paint Cells and Macro Lacing default to 0 (`types.ts`, `lucky.ts`). The code and
the sliders stay: a look that wants cells names them (`macro-bead`, `cell-bloom` and
`lace-run` still do). The relief block in `macroDetail` is relit as a surface seen
nearer: the lamp is lowered to 0.6 of its height so it rakes, the dye's normal is read
×14, the glint rolls off (`1 - exp(-1.6·spec)`) so a bright pool does not burn out, and
the boundary line is thinned by up to 80 % at full closeup, so a pool's edge is its
relief and not an outline. Nothing moves: the camera and its clock are as before
(`steadycam`, `cellride`).

*Shortcuts named:* the relief is the dye's gradient read as a dome under a lowered lamp,
not a physical height field (33g-2); the thinned boundary line is a taste choice; the
cells that remain are 20c-1's look-alike, opt-in.

*33g-3 (2026-10-29, the owner: "No I don't want cells").* `macro-bead`, `cell-bloom` and
`lace-run` set Paint Cells to 0, and Macro Bead and Cell Bloom set Macro Lacing to 0;
Lacing Run keeps its lacing, which is dendritic filaments and not cells. `macroview` line
1 was a settings audit that exempted those three; it now asks all looks (33 and the
defaults) for Paint Cells 0 and for Macro Lacing 0 but in `lace-run`, and fails if
`lace-run` loses its lacing (the exemption cannot go stale). Lab, SwiftShader: 6/6, cells
0 in the shipped looks, the old-defaults control still 0.1399 and 0.1697 (the knob is live).
*Shortcut, named:* the audit reads settings, not pixels, for the three looks; their frames
are the same shader as `classic` with the knob at 0, which `macroview` measures.

*33g-2a (2026-10-30, the owner: "a couple really cool macro 3d looking views").* In the
closeup the beads are laid at twice the size scale (`beadPopulation`, `lib/beads.ts`), Macro
Bead's Beads dial 0.35 -> 0.7, Cell Bloom renamed Lens Pools. `npm run drops` 32/32 (3 new
lines): out of the closeup the dial's count and size are the old ones to the bit; in it the
count is the same and the scale 2.0 times; a field populated that way holds beads 1.44 times
larger in mean radius (bar 1.4 to 1.8) and 343 of 332 (bar 60%). The lab, `macro-bead` at
2.5x on the 9-pool plate: before, small beads, one lens bead the size of a thumbnail; after,
a dozen glass-like lens beads, three of them a fifth of the frame. Pictures in the project's
shared files, `macro-closeup-33g/`. Not measured: how it looks on the owner's GPU.

*Measured* (`npm run macroview`, the lab on SwiftShader, and again on Metal in the CI `open` shard with the same result: relief 0.0386 to 0.051, smoothness 0.988 to 0.991, old-defaults control 0.1397 and 0.1693, nine seeded pools stirred at
256², 4x and 6x, defaults and `classic`, `jellyfish-bloom`, `oil-and-water`): the cells'
and lacing's own contribution to the frame (the frame against the same frame with both
at 0, over the frame's mean) was 0.14 at 4x and 0.17 at 6x on the old defaults, and is 0
on every shipped case (bar 0.01; the old defaults are the control, which must read over
five times the bar). The relief's contribution (against Macro Relief at 0) is 0.033–0.051
of the frame, and 0.99 of it lives at scales over 17 px, so it is a swell and a sheen,
not grain (bars 0.02 and 0.5; the old defaults' 0.76 smooth was the cells' grain). The
colour is the dye's: the mean CIE76 distance on (a*, b*) from the middle sixth of the 1x
frame to the 6x frame is 1.2–3.1 (bar 5; the control 3.25).

*The first draft of the check measured nothing,* and is why the final one is a
contribution test: an autocorrelation's secondary peak read 0.02 on the old defaults,
under its own 0.15 line, because the cells are irregular and have no lattice; a "relief
follows the dye" correlation came out negative; and a ΔE that includes lightness moved
14 on `lava-lamp` from the relief alone. Each was dropped for a line that failed on the
control before it was trusted on the fix.

## Third pass (moved 2026-10-29, 19m)

### 33. Bubbles and the closeup, per liquid (asked 2026-10-19)

#### ~~33g. The closeup: the liquid nearer and in relief, not cells~~ — **Shipped, this PR** (Paint Cells and Macro Lacing now default to 0, so no look draws cells it did not name; the relief is lit by a raking lamp with a rolled-off glint and a thinner boundary line, `src/gpu/wgsl/plate.ts`; `npm run macroview`: the cells' share of the frame was 0.14 at 4x and 0.17 at 6x before, 0 after, bar 0.01; the relief is 0.033–0.051 of the frame, 0.99 of it smooth, and the colour keeps within chroma distance 3.1 of the 1x frame, bar 5; story in `docs/plan-shipped/33-bubbles-closeup.md` §33g; 20c-1 is closed by it)

## Fourth pass (moved 2026-10-29, 19m-2)

### 33. Bubbles and the closeup, per liquid (asked 2026-10-19)

#### 33a. No stepped ring round a bubble's hole (the heading's story)

#### ~~33a. No stepped ring round a bubble's hole~~ — **Shipped, this PR** (a hue gate on the line between two dyes, `boundaryDiff` in `src/gpu/wgsl/plate.ts`; `npm run holeline`: the line moved 8.9–18.3 % of the ring round holes of 1.8–14 cells before, 0 % after, and still draws 52.8 % → 52.8 % and 61.1 % → 58.3 % of the band where two dyes meet; story in `docs/plan-shipped/33-bubbles-closeup.md` §33a)

#### 33b. The soft glow still left round a hole (the heading's story)

#### ~~33b. The soft glow still left round a hole~~ — **Shipped, this PR** (`airNear` flattens the dye's normal beside an air hole, `src/gpu/wgsl/plate.ts`; `npm run holeline`: the dye 1–6 cells past a hole's rim was 6.0–11.0 levels from the dye 10 cells out before (4.2 at the smallest hole), 2.4–3.2 after, bar 6; Edge Relief moved the first 3 cells 11.9–22.9 levels before, 0.00–0.02 after, bar 1; a pool's edge relief into water kept 16.06 → 16.06; story in `docs/plan-shipped/33-bubbles-closeup.md` §33b)

#### 33e. The bubble as the projector throws it, not a donut (the heading's story)

#### ~~33e. The bubble as the projector throws it, not a donut~~ — **Shipped, this PR** (the clear middle is the plate, `plate.ts`'s projected bubble; `npm run bubblelook`: the middle was 116–195 levels off the plate on the dark ground before, 0 after, and 0–21 on the lamp ground against a tenth-of-the-tint bar; story in `docs/plan-shipped/33-bubbles-closeup.md` §33e)

#### 33g. The closeup: the liquid nearer and in relief, not cells (the heading's story)

#### ~~33g. The closeup: the liquid nearer and in relief, not cells~~ — **Shipped, this PR** (Paint Cells and Macro Lacing now default to 0, so no look draws cells it did not name; the relief is lit by a raking lamp with a rolled-off glint and a thinner boundary line, `src/gpu/wgsl/plate.ts`; `npm run macroview`: the cells' share of the frame was 0.14 at 4x and 0.17 at 6x before, 0 after, bar 0.01; the relief is 0.033–0.051 of the frame, 0.99 of it smooth, and the colour keeps within chroma distance 3.1 of the 1x frame, bar 5; story in `docs/plan-shipped/33-bubbles-closeup.md` §33g; 20c-1 is closed by it)
